/**
 * GET /api/cron/sweep
 * Vercel Cron sweeper — recovers stalled sync jobs.
 * Runs every 10 minutes via Vercel Cron.
 * Protected by CRON_SECRET header validation.
 */

import { NextRequest, NextResponse } from "next/server";
import { sweepStalledJobs } from "@/lib/db/repo/jobs";

export async function GET(request: NextRequest) {
  // Fail closed: Reject execution when CRON_SECRET is absent or invalid
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Cron/Sweep] CRON_SECRET is not configured. Failing closed.");
    return NextResponse.json(
      { error: "Cron secret is not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requeued = await sweepStalledJobs();

    return NextResponse.json({
      success: true,
      requeuedJobs: requeued.length,
      requeuedIds: requeued.map((j) => j.id),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Sweep cron error:", error);
    return NextResponse.json(
      { error: "Internal sweep execution error" },
      { status: 500 }
    );
  }
}
