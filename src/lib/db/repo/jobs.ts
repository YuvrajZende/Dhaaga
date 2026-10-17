import { db } from "../index";
import { syncJobs } from "../schema";
import { eq, and, sql, inArray } from "drizzle-orm";

/**
 * Atomically claim a pending or throttled sync job for processing.
 */
export async function claimSyncJob(jobId: string) {
  const result = await db
    .update(syncJobs)
    .set({
      status: "running",
      heartbeatAt: new Date(),
    })
    .where(
      and(
        eq(syncJobs.id, jobId),
        inArray(syncJobs.status, ["queued", "throttled"])
      )
    )
    .returning();

  return result[0] || null;
}

/**
 * Update job progress after processing a chunk.
 */
export async function updateJobProgress(
  jobId: string,
  processedIncrement: number,
  isDone: boolean,
  error?: string
) {
  const status = error ? "error" : isDone ? "done" : "queued";

  const result = await db
    .update(syncJobs)
    .set({
      processed: sql`${syncJobs.processed} + ${processedIncrement}`,
      status,
      error: error || null,
      heartbeatAt: new Date(),
    })
    .where(eq(syncJobs.id, jobId))
    .returning();

  return result[0];
}

/**
 * Sweeps stalled jobs (running with stale heartbeat > 5 minutes)
 * and resets them to queued (or error if max attempts reached).
 */
export async function sweepStalledJobs() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Mark jobs that exceeded max attempts (5) as error
  await db
    .update(syncJobs)
    .set({ status: "error", error: "Exceeded max retry attempts" })
    .where(
      and(
        eq(syncJobs.status, "running"),
        sql`${syncJobs.heartbeatAt} < ${fiveMinutesAgo}`,
        sql`${syncJobs.attempt} >= 5`
      )
    );

  // Re-queue remaining stalled jobs
  const requeued = await db
    .update(syncJobs)
    .set({
      status: "queued",
      attempt: sql`${syncJobs.attempt} + 1`,
      heartbeatAt: new Date(),
    })
    .where(
      and(
        eq(syncJobs.status, "running"),
        sql`${syncJobs.heartbeatAt} < ${fiveMinutesAgo}`,
        sql`${syncJobs.attempt} < 5`
      )
    )
    .returning();

  return requeued;
}
