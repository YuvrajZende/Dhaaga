/**
 * Google Calendar chunk syncer.
 * Implements LLD §5.1 chunk contract for source=calendar.
 *
 * Uses Calendar API: events.list with 30-day time slices.
 * Extracts attendee relationships and meeting frequency signals.
 */

import { googleApiFetch } from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import { people, contactEdges, sources, embeddingQueue } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { buildDedupKey, extractDomain, isBlockedPrefix } from "../dedup";

const CALENDAR_API_BASE =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const MAX_RESULTS = 250;

export interface CalendarChunkResult {
  done: boolean;
  processed: number;
}

interface CalendarCursor {
  pageToken?: string;
  timeMin?: string; // ISO string for current slice start
  timeMax?: string; // ISO string for current slice end
  sliceIndex?: number; // which 30-day slice we're on
}

/**
 * Processes one chunk of Google Calendar events.
 * Walks backwards in 30-day slices up to 3 years.
 */
export async function processCalendarChunk(
  userId: string,
  userEmail: string,
  cursor: CalendarCursor | null
): Promise<CalendarChunkResult> {
  const now = new Date();
  const threeYearsAgo = new Date(now);
  threeYearsAgo.setFullYear(now.getFullYear() - 3);

  // Determine time slice
  const sliceIndex = cursor?.sliceIndex ?? 0;
  const sliceDays = 30;
  const sliceEnd = new Date(now);
  sliceEnd.setDate(sliceEnd.getDate() - sliceIndex * sliceDays);
  const sliceStart = new Date(sliceEnd);
  sliceStart.setDate(sliceStart.getDate() - sliceDays);

  // If we've gone past 3 years, we're done
  if (sliceEnd < threeYearsAgo) {
    await updateCalendarSource(userId, null, true);
    return { done: true, processed: 0 };
  }

  const params = new URLSearchParams({
    timeMin: sliceStart.toISOString(),
    timeMax: sliceEnd.toISOString(),
    maxResults: String(MAX_RESULTS),
    singleEvents: "true",
    orderBy: "startTime",
  });

  if (cursor?.pageToken) {
    params.set("pageToken", cursor.pageToken);
  }

  const url = `${CALENDAR_API_BASE}?${params.toString()}`;
  const res = await googleApiFetch(userId, url);

  if (res.status === 429) {
    return { done: false, processed: 0 };
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Calendar API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const events: CalendarEvent[] = data.items || [];
  const nextPageToken: string | undefined = data.nextPageToken;
  let processed = 0;

  // Process attendee lists from events
  const attendeeInteractions = new Map<
    string,
    { count: number; lastAt: string }
  >();

  for (const event of events) {
    if (!event.attendees || event.attendees.length === 0) continue;
    if (event.attendees.length > 20) continue; // Skip large conference calls

    const eventDate =
      event.start?.dateTime || event.start?.date || now.toISOString();

    for (const attendee of event.attendees) {
      const email = attendee.email?.toLowerCase();
      if (!email) continue;
      if (email === userEmail.toLowerCase()) continue;
      if (attendee.resource) continue; // Skip room resources
      if (isBlockedPrefix(email)) continue;

      const existing = attendeeInteractions.get(email) || {
        count: 0,
        lastAt: eventDate,
      };
      existing.count++;
      if (new Date(eventDate) > new Date(existing.lastAt)) {
        existing.lastAt = eventDate;
      }
      attendeeInteractions.set(email, existing);
    }

    processed++;
  }

  // Upsert people and contact edges from calendar attendees
  for (const [email, interaction] of attendeeInteractions) {
    const companyDomain = extractDomain(email);
    const dedupKey = buildDedupKey(email, email.split("@")[0] || email, companyDomain);

    const [person] = await db
      .insert(people)
      .values({
        ownerUserId: userId,
        displayName: email.split("@")[0] || email,
        primaryEmail: email,
        companyDomain,
        sourceRefs: [{ source: "calendar", sourceId: `calendar-${email}` }],
        dedupKey,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [people.ownerUserId, people.dedupKey],
        set: {
          primaryEmail: sql`COALESCE(EXCLUDED.primary_email, ${people.primaryEmail})`,
          companyDomain: sql`COALESCE(EXCLUDED.company_domain, ${people.companyDomain})`,
          sourceRefs: sql`(
            CASE WHEN NOT (${people.sourceRefs} @> '[{"source":"calendar"}]'::jsonb)
            THEN ${people.sourceRefs} || EXCLUDED.source_refs
            ELSE ${people.sourceRefs}
            END
          )`,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!person) continue;

    // Upsert contact edge with calendar signals
    const signalUpdate = {
      meetingCount: interaction.count,
      lastMeetingAt: interaction.lastAt,
      sourcesPresent: ["calendar"],
    };

    await db
      .insert(contactEdges)
      .values({
        userId,
        personId: person.id,
        strength: 0,
        signals: signalUpdate,
      })
      .onConflictDoUpdate({
        target: [contactEdges.userId, contactEdges.personId],
        set: {
          signals: sql`${contactEdges.signals} || ${JSON.stringify(signalUpdate)}::jsonb`,
        },
      });

    // Enqueue for embedding
    await db
      .insert(embeddingQueue)
      .values({ personId: person.id, ownerUserId: userId })
      .onConflictDoNothing();
  }

  // Update cursor
  if (nextPageToken) {
    // More pages in current slice
    await updateCalendarSource(
      userId,
      { pageToken: nextPageToken, sliceIndex },
      false
    );
    return { done: false, processed };
  }

  // Move to next 30-day slice
  const nextSlice = sliceIndex + 1;
  const nextSliceEnd = new Date(now);
  nextSliceEnd.setDate(nextSliceEnd.getDate() - nextSlice * sliceDays);
  const allDone = nextSliceEnd < threeYearsAgo;

  await updateCalendarSource(
    userId,
    allDone ? null : { sliceIndex: nextSlice },
    allDone
  );

  return { done: allDone, processed };
}

async function updateCalendarSource(
  userId: string,
  cursor: CalendarCursor | null,
  isDone: boolean
) {
  await db
    .update(sources)
    .set({
      cursor: cursor as Record<string, unknown> | null,
      lastSyncedAt: isDone ? new Date() : undefined,
      status: isDone ? "active" : "syncing",
    })
    .where(and(eq(sources.userId, userId), eq(sources.type, "calendar")));
}

// ─── Types ───────────────────────────────────────────────────────────

interface CalendarEvent {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: Array<{
    email?: string;
    displayName?: string;
    self?: boolean;
    resource?: boolean;
    responseStatus?: string;
  }>;
}
