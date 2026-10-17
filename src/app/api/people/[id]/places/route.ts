import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { people, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPersonRecommendedPlaces } from "@/lib/places/repo";
import { isFollowing } from "@/lib/db/repo/network";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getSessionUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // 1. Determine if ID is directly a user ID or a person ID
  let targetUserId: string | null = null;

  const [matchedUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (matchedUser) {
    targetUserId = matchedUser.id;
  } else {
    // Check if it's a person contact
    const [personRow] = await db
      .select({
        id: people.id,
        ownerUserId: people.ownerUserId,
        primaryEmail: people.primaryEmail,
      })
      .from(people)
      .where(eq(people.id, id))
      .limit(1);

    if (personRow) {
      if (personRow.primaryEmail) {
        // Find if this contact has a registered Happensten user account
        const [registeredUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, personRow.primaryEmail.toLowerCase().trim()))
          .limit(1);
        if (registeredUser) {
          targetUserId = registeredUser.id;
        }
      }
      if (!targetUserId && personRow.ownerUserId) {
        targetUserId = personRow.ownerUserId;
      }
    }
  }

  if (!targetUserId) {
    return NextResponse.json({ places: [], targetUserId: null, isFollowing: false });
  }

  // 2. Fetch authorized recommendations (follows + share_with_circle checked server-side)
  const places = await getPersonRecommendedPlaces(viewer.id, targetUserId);
  const following = viewer.id === targetUserId ? true : await isFollowing(viewer.id, targetUserId);

  return NextResponse.json({
    places,
    targetUserId,
    isSelf: viewer.id === targetUserId,
    isFollowing: following,
  });
}
