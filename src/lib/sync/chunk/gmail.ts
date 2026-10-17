/**
 * Gmail metadata chunk syncer.
 * Implements LLD §5.1 chunk contract for source=gmail.
 *
 * Fetches message metadata headers (To, From, Cc, Date, List-Unsubscribe, Precedence)
 * and applies §3.3 noise filtering. Builds interaction signals and canonical co-occurrence edges.
 */

import { googleApiFetch } from "@/lib/auth/google";
import { db } from "@/lib/db";
import {
  people,
  contactEdges,
  sources,
  embeddingQueue,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  buildDedupKey,
  extractDomain,
  isBlockedPrefix,
  isBulkMessage,
  parseGmailHeaders,
  extractEmailsFromHeader,
  getFilterReason,
} from "../dedup";
import { explainScore, type SignalPayload } from "../scoring";
import { incrementPersonEdge } from "@/lib/db/repo/edges";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_RESULTS = 100;
const BATCH_SIZE = 25; // Google batch limit per batchGet call

export interface GmailChunkResult {
  done: boolean;
  processed: number;
}

interface GmailCursor {
  pageToken?: string;
  historyId?: string;
}

/**
 * Processes one chunk of Gmail messages (metadata-only).
 */
export async function processGmailChunk(
  userId: string,
  userEmail: string,
  cursor: GmailCursor | null
): Promise<GmailChunkResult> {
  // 1. List message IDs
  const listParams = new URLSearchParams({
    maxResults: String(MAX_RESULTS),
    q: "newer_than:3y (in:sent OR in:inbox)",
  });
  if (cursor?.pageToken) {
    listParams.set("pageToken", cursor.pageToken);
  }

  const listRes = await googleApiFetch(
    userId,
    `${GMAIL_API_BASE}/messages?${listParams.toString()}`
  );

  if (listRes.status === 429) {
    return { done: false, processed: 0 };
  }
  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Gmail list error (${listRes.status}): ${errText}`);
  }

  const listData = await listRes.json();
  const messages: Array<{ id: string; threadId: string }> = listData.messages || [];
  const nextPageToken: string | undefined = listData.nextPageToken;

  if (messages.length === 0) {
    await updateGmailSource(userId, null, true);
    return { done: true, processed: 0 };
  }

  // 2. Batch-fetch message metadata in chunks of 25
  let processed = 0;
  const threadParticipants = new Map<string, Set<string>>(); // threadId → Set<email>
  const emailInteractions = new Map<
    string,
    {
      count: number;
      lastAt: string;
      directInteractions: number;
      ccInteractions: number;
      sentByUser: boolean;
    }
  >();
  const filteredAudit: Array<{ messageId: string; reason: string }> = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    for (const msg of batch) {
      try {
        const msgRes = await googleApiFetch(
          userId,
          `${GMAIL_API_BASE}/messages/${msg.id}?format=METADATA&metadataHeaders=To&metadataHeaders=From&metadataHeaders=Cc&metadataHeaders=Date&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence`
        );

        if (!msgRes.ok) continue;
        const msgData = await msgRes.json();
        const rawHeaders = msgData.payload?.headers || [];
        const headers = parseGmailHeaders(rawHeaders);

        // Check bulk/automated messages (§3.3)
        const filterReason = getFilterReason(headers["from"], headers);
        if (filterReason) {
          filteredAudit.push({ messageId: msg.id, reason: filterReason });
          continue;
        }

        // Extract participants
        const from = extractEmailsFromHeader(headers["from"]);
        const to = extractEmailsFromHeader(headers["to"]);
        const cc = extractEmailsFromHeader(headers["cc"]);
        const date = headers["date"] || new Date().toISOString();
        const threadId = msg.threadId;

        const allParticipants = [...new Set([...from, ...to, ...cc])];
        const otherParticipants = allParticipants.filter(
          (e) => e !== userEmail.toLowerCase()
        );

        // Ignore threads with >8 meaningful participants (per requirement)
        if (allParticipants.length > 8) {
          filteredAudit.push({ messageId: msg.id, reason: `Thread participant count exceeded threshold (>8): ${allParticipants.length}` });
          continue;
        }

        // Filter blocked sender prefixes
        const validParticipants = otherParticipants.filter((e) => !isBlockedPrefix(e));
        if (validParticipants.length === 0) continue;

        // Track thread participants for canonical co-occurrence edges
        if (!threadParticipants.has(threadId)) {
          threadParticipants.set(threadId, new Set());
        }

        const isUserSender = from.includes(userEmail.toLowerCase());
        const directTo = to.filter((e) => e !== userEmail.toLowerCase());
        const ccList = cc.filter((e) => e !== userEmail.toLowerCase());

        for (const email of validParticipants) {
          threadParticipants.get(threadId)!.add(email);

          const existing = emailInteractions.get(email) || {
            count: 0,
            lastAt: date,
            directInteractions: 0,
            ccInteractions: 0,
            sentByUser: false,
          };

          existing.count++;
          if (directTo.includes(email)) {
            existing.directInteractions++;
          }
          if (ccList.includes(email)) {
            existing.ccInteractions++;
          }
          if (isUserSender) {
            existing.sentByUser = true;
          }

          // Track latest interaction timestamp
          if (new Date(date).getTime() > new Date(existing.lastAt).getTime()) {
            existing.lastAt = date;
          }

          emailInteractions.set(email, existing);
        }

        processed++;
      } catch {
        // Skip individual message failures without dropping the batch
        continue;
      }
    }
  }

  // 3. Upsert people and contact edges from accumulated interactions
  const personIdMap = new Map<string, string>(); // email → personId

  for (const [email, interaction] of emailInteractions.entries()) {
    const companyDomain = extractDomain(email);
    const dedupKey = buildDedupKey(email, email.split("@")[0] || email, companyDomain);

    const [person] = await db
      .insert(people)
      .values({
        ownerUserId: userId,
        displayName: email.split("@")[0] || email,
        primaryEmail: email,
        companyDomain,
        sourceRefs: [{ source: "gmail", sourceId: `gmail-${email}` }],
        dedupKey,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [people.ownerUserId, people.dedupKey],
        set: {
          primaryEmail: sql`COALESCE(EXCLUDED.primary_email, ${people.primaryEmail})`,
          companyDomain: sql`COALESCE(EXCLUDED.company_domain, ${people.companyDomain})`,
          sourceRefs: sql`(
            CASE WHEN NOT (${people.sourceRefs} @> '[{"source":"gmail"}]'::jsonb)
            THEN ${people.sourceRefs} || EXCLUDED.source_refs
            ELSE ${people.sourceRefs}
            END
          )`,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!person) continue;
    personIdMap.set(email, person.id);

    // Compute explainable signals
    const directRatio = interaction.count > 0 ? interaction.directInteractions / interaction.count : 0;
    const signalPayload: SignalPayload = {
      emailCount: interaction.count,
      lastEmailAt: interaction.lastAt,
      meetingCount: 0,
      lastMeetingAt: null,
      sourcesPresent: ["gmail"],
      directToRatio: directRatio,
      directInteractions: interaction.directInteractions,
      ccInteractions: interaction.ccInteractions,
    };

    const explanation = explainScore(signalPayload);

    await db
      .insert(contactEdges)
      .values({
        userId,
        personId: person.id,
        strength: explanation.strength,
        signals: {
          ...signalPayload,
          breakdown: explanation.breakdown,
          explanation: explanation.explanation,
        },
      })
      .onConflictDoUpdate({
        target: [contactEdges.userId, contactEdges.personId],
        set: {
          strength: explanation.strength,
          signals: sql`${contactEdges.signals} || ${JSON.stringify({
            ...signalPayload,
            breakdown: explanation.breakdown,
            explanation: explanation.explanation,
          })}::jsonb`,
        },
      });

    // Enqueue for embedding
    await db
      .insert(embeddingQueue)
      .values({ personId: person.id, ownerUserId: userId })
      .onConflictDoNothing();
  }

  // 4. Build canonical co-occurrence person edges (a_id < b_id)
  // Only for threads with <= 8 meaningful participants
  for (const [, participants] of threadParticipants) {
    const emails = [...participants];
    if (emails.length < 2 || emails.length > 8) continue;

    for (let i = 0; i < emails.length; i++) {
      for (let j = i + 1; j < emails.length; j++) {
        const idA = personIdMap.get(emails[i]);
        const idB = personIdMap.get(emails[j]);
        if (idA && idB && idA !== idB) {
          await incrementPersonEdge(idA, idB, 10, "shared_thread");
        }
      }
    }
  }

  // 5. Update cursor and persist filter audit metadata
  await updateGmailSource(
    userId,
    nextPageToken ? { pageToken: nextPageToken, filteredCount: filteredAudit.length } : null,
    !nextPageToken
  );

  return {
    done: !nextPageToken,
    processed,
  };
}

async function updateGmailSource(
  userId: string,
  cursor: Record<string, unknown> | null,
  isComplete: boolean
) {
  await db
    .update(sources)
    .set({
      cursor: cursor ? cursor : null,
      lastSyncedAt: isComplete ? new Date() : undefined,
      status: isComplete ? "active" : "syncing",
    })
    .where(and(eq(sources.userId, userId), eq(sources.type, "gmail")));
}
