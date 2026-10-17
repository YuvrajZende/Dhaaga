/**
 * POST /api/sync/start
 * Initiates sync for all active sources. Creates sync jobs and returns job IDs.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { startSync } from "@/lib/sync/engine";

export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const jobIds = await startSync(session.id);

    return NextResponse.json({
      success: true,
      jobIds,
      message: `Created ${jobIds.length} sync jobs. Call POST /api/sync/chunk to process.`,
    });
  } catch (error) {
    console.error("Sync start error:", error);
    return NextResponse.json(
      { error: "Failed to initiate sync operations" },
      { status: 500 }
    );
  }
}
