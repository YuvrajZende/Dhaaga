import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { followUser, unfollowUser, isFollowing } from "@/lib/db/repo/network";

const FollowActionSchema = z.object({
  targetUserId: z.string().uuid(),
  action: z.enum(["follow", "unfollow"]),
});

export async function POST(request: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = FollowActionSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.format() },
      { status: 400 }
    );
  }

  const { targetUserId, action } = validation.data;

  try {
    if (action === "follow") {
      await followUser(viewer.id, targetUserId);
      return NextResponse.json({ success: true, isFollowing: true });
    } else {
      await unfollowUser(viewer.id, targetUserId);
      return NextResponse.json({ success: true, isFollowing: false });
    }
  } catch (err: any) {
    console.error("Network follow error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update follow relationship" },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const viewer = await getSessionUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("targetUserId");

  if (!targetUserId || !z.string().uuid().safeParse(targetUserId).success) {
    return NextResponse.json({ error: "Invalid or missing targetUserId" }, { status: 400 });
  }

  try {
    const following = await isFollowing(viewer.id, targetUserId);
    return NextResponse.json({ isFollowing: following });
  } catch (err) {
    console.error("Network check follow status error:", err);
    return NextResponse.json(
      { error: "Failed to check follow status" },
      { status: 500 }
    );
  }
}
