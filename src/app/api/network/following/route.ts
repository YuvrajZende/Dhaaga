import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listFollowing } from "@/lib/db/repo/network";

export async function GET(_request: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const following = await listFollowing(viewer.id);
    return NextResponse.json({ following });
  } catch (err) {
    console.error("Failed to list following users:", err);
    return NextResponse.json(
      { error: "Failed to load network connections" },
      { status: 500 }
    );
  }
}
