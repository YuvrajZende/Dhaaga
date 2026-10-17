/**
 * Sync engine orchestrator.
 * Implements LLD §5.1: job lifecycle, chunk dispatch, and strength recomputation.
 *
 * Called from API route handlers. Each invocation processes one chunk for one source.
 */

import { db } from "@/lib/db";
import {
  syncJobs,
  sources,
  contactEdges,
  people,
  users,
  embeddingQueue,
  embeddings,
  googleTokens,
  importRows,
} from "@/lib/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { processContactsChunk } from "./chunk/contacts";
import { processGmailChunk } from "./chunk/gmail";
import { processCalendarChunk } from "./chunk/calendar";
import { computeStrength, type SignalPayload } from "./scoring";
import { embedText, embedBatch, EMBEDDING_MODEL_VERSION } from "@/lib/embed/model";
import { upsertPerson } from "@/lib/db/repo/people";

export interface ChunkResult {
  done: boolean;
  processed: number;
  source: string;
  jobId: string;
}

/**
 * Creates initial sync jobs for all active sources for a user.
 * Called when the user initiates a full sync.
 */
export async function startSync(userId: string): Promise<string[]> {
  const activeSources = await db
    .select()
    .from(sources)
    .where(and(eq(sources.userId, userId), eq(sources.status, "active")));

  const jobIds: string[] = [];

  for (const source of activeSources) {
    // Check for existing queued/running jobs to avoid duplicates
    const [existing] = await db
      .select()
      .from(syncJobs)
      .where(
        and(
          eq(syncJobs.userId, userId),
          eq(syncJobs.source, source.type),
          inArray(syncJobs.status, ["queued", "running"])
        )
      )
      .limit(1);

    if (existing) {
      jobIds.push(existing.id);
      continue;
    }

    const [job] = await db
      .insert(syncJobs)
      .values({
        userId,
        source: source.type,
        kind: source.lastSyncedAt ? "incremental" : "initial",
        status: "queued",
      })
      .returning();

    if (job) jobIds.push(job.id);

    // Mark source as syncing
    await db
      .update(sources)
      .set({ status: "syncing" })
      .where(and(eq(sources.userId, userId), eq(sources.type, source.type)));
  }

  return jobIds;
}

/**
 * Processes the next available chunk for the user.
 * Finds the first queued/running job and dispatches to the appropriate source handler.
 */
export async function processNextChunk(userId: string): Promise<ChunkResult | null> {
  // Find the next pending job for this user
  const [job] = await db
    .select()
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.userId, userId),
        inArray(syncJobs.status, ["queued", "running"])
      )
    )
    .orderBy(syncJobs.createdAt)
    .limit(1);

  if (!job) return null;

  // Claim the job
  await db
    .update(syncJobs)
    .set({ status: "running", heartbeatAt: new Date() })
    .where(eq(syncJobs.id, job.id));

  // Get user email for filtering
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new Error(`User ${userId} not found`);

  const sourceType = job.source as "contacts" | "gmail" | "calendar";

  // Get source cursor
  const [source] = await db
    .select()
    .from(sources)
    .where(and(eq(sources.userId, userId), eq(sources.type, sourceType)))
    .limit(1);

  const cursor = (source?.cursor as Record<string, unknown>) || null;

  try {
    let result: { done: boolean; processed: number };

    switch (job.source) {
      case "contacts":
        result = await processContactsChunk(userId, cursor as never);
        break;
      case "gmail":
        result = await processGmailChunk(userId, user.email, cursor as never);
        break;
      case "calendar":
        result = await processCalendarChunk(userId, user.email, cursor as never);
        break;
      case "linkedin_import":
      case "x_import":
      case "instagram_import":
      case "facebook_import":
        result = await processImportChunk(userId, job.source as any, job);
        break;
      default:
        throw new Error(`Unknown source: ${job.source}`);
    }

    // Update job progress
    await db
      .update(syncJobs)
      .set({
        processed: sql`${syncJobs.processed} + ${result.processed}`,
        status: result.done ? "done" : "queued",
        heartbeatAt: new Date(),
      })
      .where(eq(syncJobs.id, job.id));

    // After each non-import chunk, recompute strengths and drain embedding queue
    const isImport = ["linkedin_import", "x_import", "instagram_import", "facebook_import"].includes(job.source);
    if (!isImport) {
      if (result.processed > 0) {
        await recomputeStrengths(userId);
      }
      await drainEmbeddingQueue(userId, 64);
    } else if (result.done) {
      // Mark import source as active in sources table so dashboard updates immediately
      await db
        .insert(sources)
        .values({
          userId,
          type: job.source as any,
          status: "active",
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [sources.userId, sources.type],
          set: {
            status: "active",
            lastSyncedAt: new Date(),
          },
        });
    }

    return {
      done: result.done,
      processed: result.processed,
      source: job.source,
      jobId: job.id,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Safely update job status without throwing secondary connection errors
    try {
      if (errorMsg.includes("429") || errorMsg.includes("rateLimitExceeded")) {
        await db
          .update(syncJobs)
          .set({
            status: "throttled",
            error: errorMsg,
            heartbeatAt: new Date(),
          })
          .where(eq(syncJobs.id, job.id));
      } else {
        await db
          .update(syncJobs)
          .set({
            status: "error",
            error: errorMsg,
            attempt: sql`${syncJobs.attempt} + 1`,
            heartbeatAt: new Date(),
          })
          .where(eq(syncJobs.id, job.id));
      }
    } catch (dbErr) {
      console.warn("Could not record syncJob failure state:", dbErr);
    }

    throw error;
  }
}

/**
 * Processes a chunk of staged import rows for LinkedIn, X, Instagram, or Facebook.
 * Capped at 25 rows per chunk to ensure sub-2-second response times,
 * real-time UI progress feedback, and no socket timeouts.
 */
async function processImportChunk(
  userId: string,
  source: "linkedin_import" | "x_import" | "instagram_import" | "facebook_import",
  job: typeof syncJobs.$inferSelect
): Promise<{ done: boolean; processed: number }> {
  // 1. Fetch next batch of unprocessed import_rows (25 rows per chunk for smooth client ticks)
  const rows = await db
    .select()
    .from(importRows)
    .where(and(eq(importRows.jobId, job.id), eq(importRows.processed, false)))
    .orderBy(importRows.idx)
    .limit(25);

  const touchedPersonIds: string[] = [];

  for (const item of rows) {
    const payload = item.payload as any;

    const person = await upsertPerson(userId, {
      displayName: payload.displayName,
      givenName: payload.givenName ?? null,
      familyName: payload.familyName ?? null,
      primaryEmail: payload.primaryEmail ?? null,
      title: payload.title ?? null,
      company: payload.company ?? null,
      companyDomain: payload.companyDomain ?? null,
      headline: payload.headline ?? (payload.connectedOn ? `Connected on ${payload.connectedOn}` : null),
      bio: payload.bio ?? null,
      tags: payload.tags ?? [],
      sourceRefs: [{ source, sourceId: payload.url || payload.primaryEmail || payload.dedupKey }],
      dedupKey: payload.dedupKey,
    });

    if (person) {
      touchedPersonIds.push(person.id);

      const initialSignals: Partial<SignalPayload> = {
        sourcesPresent: [source],
        connectedOn: payload.connectedOn ?? null,
      };

      await db
        .insert(contactEdges)
        .values({
          userId,
          personId: person.id,
          strength: computeStrength(initialSignals),
          signals: initialSignals,
        })
        .onConflictDoUpdate({
          target: [contactEdges.userId, contactEdges.personId],
          set: {
            signals: sql`
              jsonb_set(
                ${contactEdges.signals},
                '{sourcesPresent}',
                (
                  SELECT jsonb_agg(DISTINCT x)
                  FROM jsonb_array_elements_text(COALESCE(${contactEdges.signals}->'sourcesPresent', '[]'::jsonb) || ${JSON.stringify([source])}::jsonb) AS x
                )
              )
            `,
          },
        });

      await db
        .insert(embeddingQueue)
        .values({ personId: person.id, ownerUserId: userId })
        .onConflictDoNothing();
    }
  }

  // Mark processed rows
  if (rows.length > 0) {
    const indices = rows.map((r) => r.idx);
    await db
      .update(importRows)
      .set({ processed: true })
      .where(and(eq(importRows.jobId, job.id), inArray(importRows.idx, indices)));
  }

  // Drain matching batch of embedding queue (up to 25 profiles per chunk)
  await drainEmbeddingQueue(userId, 25);

  // Recompute strengths for touched contacts in parallel
  if (touchedPersonIds.length > 0) {
    await recomputeStrengths(userId, touchedPersonIds);
  }

  // Done gate: check if any unprocessed import_rows remain AND check embedding_queue
  const [unprocessedRemaining] = await db
    .select({ count: sql<number>`count(*)` })
    .from(importRows)
    .where(and(eq(importRows.jobId, job.id), eq(importRows.processed, false)));

  const [embeddingsRemaining] = await db
    .select({ count: sql<number>`count(*)` })
    .from(embeddingQueue)
    .where(eq(embeddingQueue.ownerUserId, userId));

  const allRowsProcessed = Number(unprocessedRemaining?.count || 0) === 0;
  const allEmbeddingsDone = Number(embeddingsRemaining?.count || 0) === 0;

  const done = allRowsProcessed && allEmbeddingsDone;

  return {
    done,
    processed: rows.length,
  };
}

/**
 * Recomputes connection strength scores for contact edges of a user.
 * If touchedPersonIds is provided, only updates those contacts concurrently.
 */
export async function recomputeStrengths(userId: string, touchedPersonIds?: string[]) {
  if (touchedPersonIds && touchedPersonIds.length === 0) return;

  const whereClause = touchedPersonIds
    ? and(eq(contactEdges.userId, userId), inArray(contactEdges.personId, touchedPersonIds))
    : eq(contactEdges.userId, userId);

  const edges = await db
    .select({
      personId: contactEdges.personId,
      signals: contactEdges.signals,
    })
    .from(contactEdges)
    .where(whereClause);

  await Promise.all(
    edges.map(async (edge) => {
      const signals = edge.signals as Partial<SignalPayload>;
      const strength = computeStrength({
        emailCount: signals.emailCount || 0,
        lastEmailAt: signals.lastEmailAt || null,
        meetingCount: signals.meetingCount || 0,
        lastMeetingAt: signals.lastMeetingAt || null,
        sourcesPresent: signals.sourcesPresent || [],
        directToRatio: signals.directToRatio || 0,
        connectedOn: signals.connectedOn || null,
      });

      return db
        .update(contactEdges)
        .set({ strength })
        .where(
          and(
            eq(contactEdges.userId, userId),
            eq(contactEdges.personId, edge.personId)
          )
        );
    })
  );
}

/**
 * Drains the embedding queue by processing up to `limit` person profiles.
 * Optimized with batch selects, embedBatch, and batch deletions.
 */
export async function drainEmbeddingQueue(userId: string, limit: number) {
  const queued = await db
    .select({
      personId: embeddingQueue.personId,
    })
    .from(embeddingQueue)
    .where(eq(embeddingQueue.ownerUserId, userId))
    .limit(limit);

  if (queued.length === 0) return;

  const personIds = queued.map((q) => q.personId);

  // Fetch all person profiles in a single query instead of N individual queries
  const peopleList = await db
    .select()
    .from(people)
    .where(inArray(people.id, personIds));

  const peopleMap = new Map(peopleList.map((p) => [p.id, p]));

  // Prepare texts to embed
  const validItems: { personId: string; text: string }[] = [];
  const missingPersonIds: string[] = [];

  for (const item of queued) {
    const person = peopleMap.get(item.personId);
    if (!person) {
      missingPersonIds.push(item.personId);
      continue;
    }

    const parts = [
      person.displayName,
      person.title,
      person.company,
      person.location ? `location: ${person.location}` : null,
      person.headline,
      Array.isArray(person.tags) && person.tags.length > 0
        ? `skills/hobbies/interests: ${(person.tags as string[]).join(", ")}`
        : null,
    ].filter(Boolean);

    validItems.push({
      personId: item.personId,
      text: parts.join(" | "),
    });
  }

  // Clean up any deleted persons from queue
  if (missingPersonIds.length > 0) {
    await db
      .delete(embeddingQueue)
      .where(inArray(embeddingQueue.personId, missingPersonIds));
  }

  if (validItems.length === 0) return;

  // Batch compute embeddings using embedBatch (or fallback safely)
  try {
    const vectors = await embedBatch(validItems.map((v) => v.text));

    for (let i = 0; i < validItems.length; i++) {
      const vec = vectors[i] || (await embedText(validItems[i].text));
      await db
        .insert(embeddings)
        .values({
          personId: validItems[i].personId,
          ownerUserId: userId,
          vec,
          modelVersion: EMBEDDING_MODEL_VERSION,
          embeddedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: embeddings.personId,
          set: {
            vec,
            modelVersion: EMBEDDING_MODEL_VERSION,
            embeddedAt: new Date(),
          },
        });
    }

    // Delete processed items from queue in one batch
    await db
      .delete(embeddingQueue)
      .where(inArray(embeddingQueue.personId, validItems.map((v) => v.personId)));
  } catch (error) {
    console.error("Batch embedding error:", error instanceof Error ? error.message : error);
  }
}

/**
 * Returns sync progress for all sources for a user.
 */
export async function getSyncStatus(userId: string) {
  const jobs = await db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.userId, userId))
    .orderBy(sql`${syncJobs.createdAt} DESC`);

  const userSources = await db
    .select()
    .from(sources)
    .where(eq(sources.userId, userId));

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(people)
    .where(eq(people.ownerUserId, userId));

  return {
    jobs,
    sources: userSources,
    totalPeople: Number(countResult?.count || 0),
  };
}

/**
 * Disconnect Google integration and cleanly remove imported credentials & pending jobs.
 * Adheres to Requirement 13 (Google Disconnect / Data Deletion).
 */
export async function disconnectGoogle(userId: string) {
  // 1. Delete stored Google OAuth credentials
  await db.delete(googleTokens).where(eq(googleTokens.userId, userId));

  // 2. Mark Google sources as disconnected and clear cursors
  await db
    .update(sources)
    .set({ status: "disconnected", cursor: null, error: null })
    .where(
      and(
        eq(sources.userId, userId),
        inArray(sources.type, ["contacts", "gmail", "calendar"])
      )
    );

  // 3. Cancel any pending/running sync jobs for Google sources
  await db
    .update(syncJobs)
    .set({ status: "error", error: "Google disconnected by user" })
    .where(
      and(
        eq(syncJobs.userId, userId),
        inArray(syncJobs.source, ["contacts", "gmail", "calendar"]),
        inArray(syncJobs.status, ["queued", "running"])
      )
    );
}

