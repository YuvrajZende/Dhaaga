/**
 * Google Contacts chunk syncer.
 * Implements LLD §5.1 chunk contract for source=contacts.
 *
 * Uses Google People API: people.connections.list
 *   pageSize=200, syncToken for incremental, personFields for profile data.
 */

import { googleApiFetch } from "@/lib/auth/tokens";
import { db } from "@/lib/db";
import { people, contactEdges, sources, embeddingQueue } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { buildDedupKey, extractDomain } from "../dedup";
import { computeStrength, type SignalPayload } from "../scoring";

const PEOPLE_API_BASE = "https://people.googleapis.com/v1/people/me/connections";
const PERSON_FIELDS = [
  "names",
  "emailAddresses",
  "organizations",
  "photos",
  "biographies",
  "phoneNumbers",
  "addresses",
].join(",");
const PAGE_SIZE = 200;

export interface ContactsChunkResult {
  done: boolean;
  processed: number;
  nextPageToken?: string;
  syncToken?: string;
}

/**
 * Processes one chunk of Google Contacts.
 * Returns { done, processed } to the caller (client-driven sync loop).
 */
export async function processContactsChunk(
  userId: string,
  cursor: { pageToken?: string; syncToken?: string } | null
): Promise<ContactsChunkResult> {
  // Build API URL
  const params = new URLSearchParams({
    personFields: PERSON_FIELDS,
    pageSize: String(PAGE_SIZE),
    sortOrder: "LAST_MODIFIED_DESCENDING",
  });

  if (cursor?.syncToken && !cursor.pageToken) {
    // Incremental sync with syncToken
    params.set("syncToken", cursor.syncToken);
    params.set("requestSyncToken", "true");
  } else {
    params.set("requestSyncToken", "true");
    if (cursor?.pageToken) {
      params.set("pageToken", cursor.pageToken);
    }
  }

  const url = `${PEOPLE_API_BASE}?${params.toString()}`;
  const res = await googleApiFetch(userId, url);

  if (res.status === 429) {
    return { done: false, processed: 0 };
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Contacts API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const connections: GoogleContact[] = data.connections || [];
  const nextPageToken: string | undefined = data.nextPageToken;
  const nextSyncToken: string | undefined = data.nextSyncToken;

  let processed = 0;

  for (const contact of connections) {
    const result = await upsertContact(userId, contact);
    if (result) processed++;
  }

  // Update source cursor
  const newCursor: Record<string, string> = {};
  if (nextPageToken) {
    newCursor.pageToken = nextPageToken;
    if (cursor?.syncToken) newCursor.syncToken = cursor.syncToken;
  }
  if (nextSyncToken) {
    newCursor.syncToken = nextSyncToken;
  }

  await db
    .update(sources)
    .set({
      cursor: Object.keys(newCursor).length > 0 ? newCursor : null,
      lastSyncedAt: nextPageToken ? undefined : new Date(),
      status: nextPageToken ? "syncing" : "active",
    })
    .where(and(eq(sources.userId, userId), eq(sources.type, "contacts")));

  return {
    done: !nextPageToken,
    processed,
    nextPageToken,
    syncToken: nextSyncToken,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────

interface GoogleContact {
  resourceName?: string;
  names?: Array<{
    displayName?: string;
    givenName?: string;
    familyName?: string;
  }>;
  emailAddresses?: Array<{ value?: string }>;
  organizations?: Array<{ name?: string; title?: string; domain?: string }>;
  photos?: Array<{ url?: string }>;
  biographies?: Array<{ value?: string }>;
  addresses?: Array<{ formattedValue?: string; city?: string }>;
}

async function upsertContact(userId: string, contact: GoogleContact) {
  const name = contact.names?.[0];
  const displayName = name?.displayName || "Unknown";
  if (displayName === "Unknown" && !contact.emailAddresses?.length) return null;

  const primaryEmail = contact.emailAddresses?.[0]?.value?.toLowerCase() || null;
  const org = contact.organizations?.[0];
  const company = org?.name || null;
  const title = org?.title || null;
  const companyDomain = org?.domain || (primaryEmail ? extractDomain(primaryEmail) : null);
  const avatarUrl = contact.photos?.[0]?.url || null;
  const headline = contact.biographies?.[0]?.value || null;
  const location = contact.addresses?.[0]?.formattedValue || contact.addresses?.[0]?.city || null;

  const dedupKey = buildDedupKey(primaryEmail, displayName, companyDomain);

  const sourceRef = {
    source: "contacts",
    sourceId: contact.resourceName || `contacts-${primaryEmail || displayName}`,
  };

  // Upsert person
  const [person] = await db
    .insert(people)
    .values({
      ownerUserId: userId,
      displayName,
      givenName: name?.givenName || null,
      familyName: name?.familyName || null,
      primaryEmail,
      title,
      company,
      companyDomain,
      headline,
      avatarUrl,
      location,
      sourceRefs: [sourceRef],
      dedupKey,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [people.ownerUserId, people.dedupKey],
      set: {
        displayName: sql`COALESCE(EXCLUDED.display_name, ${people.displayName})`,
        givenName: sql`COALESCE(EXCLUDED.given_name, ${people.givenName})`,
        familyName: sql`COALESCE(EXCLUDED.family_name, ${people.familyName})`,
        primaryEmail: sql`COALESCE(EXCLUDED.primary_email, ${people.primaryEmail})`,
        title: sql`COALESCE(EXCLUDED.title, ${people.title})`,
        company: sql`COALESCE(EXCLUDED.company, ${people.company})`,
        companyDomain: sql`COALESCE(EXCLUDED.company_domain, ${people.companyDomain})`,
        avatarUrl: sql`COALESCE(EXCLUDED.avatar_url, ${people.avatarUrl})`,
        headline: sql`COALESCE(EXCLUDED.headline, ${people.headline})`,
        location: sql`COALESCE(EXCLUDED.location, ${people.location})`,
        sourceRefs: sql`${people.sourceRefs} || EXCLUDED.source_refs`,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!person) return null;

  // Upsert contact edge with "contacts" source signal
  const signals: Partial<SignalPayload> = {
    sourcesPresent: ["contacts"],
    emailCount: 0,
    meetingCount: 0,
    directToRatio: 0,
    lastEmailAt: null,
    lastMeetingAt: null,
  };

  await db
    .insert(contactEdges)
    .values({
      userId,
      personId: person.id,
      strength: computeStrength(signals as SignalPayload),
      signals,
    })
    .onConflictDoUpdate({
      target: [contactEdges.userId, contactEdges.personId],
      set: {
        signals: sql`${contactEdges.signals} || ${JSON.stringify({ sourcesPresent: ["contacts"] })}::jsonb`,
        strength: computeStrength(signals as SignalPayload),
      },
    });

  // Enqueue for embedding
  await db
    .insert(embeddingQueue)
    .values({ personId: person.id, ownerUserId: userId })
    .onConflictDoNothing();

  return person;
}
