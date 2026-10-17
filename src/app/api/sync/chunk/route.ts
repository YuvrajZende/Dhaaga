/**
 * POST /api/sync/chunk
 * Client-driven sync loop endpoint.
 * Processes the next available chunk and returns progress.
 * The client calls this repeatedly until all jobs are done.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { processNextChunk, getSyncStatus } from "@/lib/sync/engine";

export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processNextChunk(session.id);

    if (!result) {
      // No more pending jobs
      const status = await getSyncStatus(session.id);
      return NextResponse.json({
        done: true,
        allComplete: true,
        ...status,
      });
    }

    const status = await getSyncStatus(session.id);

    return NextResponse.json({
      done: result.done,
      allComplete: false,
      processed: result.processed,
      source: result.source,
      jobId: result.jobId,
      ...status,
    });
  } catch (error) {
    console.error("Sync chunk error:", error);

    // Return the error safely even if DB connection drops
    try {
      const status = await getSyncStatus(session.id);
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Sync chunk processing encountered an error",
          ...status,
        },
        { status: 500 }
      );
    } catch {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Sync chunk processing encountered an error",
        },
        { status: 500 }
      );
    }
  }
}

/**
 * GET /api/sync/chunk
 * Returns current sync status without processing.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getSyncStatus(session.id);
  return NextResponse.json(status);
}
