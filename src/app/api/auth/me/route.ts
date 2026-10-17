import { NextResponse } from "next/server";
import { getSessionUser, clearSessionCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sources, people } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { deleteUserAccount } from "@/lib/db/repo/people";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  // Fetch source connection statuses and contact count
  const userSources = await db
    .select()
    .from(sources)
    .where(eq(sources.userId, session.id));

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(people)
    .where(eq(people.ownerUserId, session.id));

  return NextResponse.json({
    authenticated: true,
    user: session,
    sources: userSources,
    stats: {
      totalPeople: Number(countResult?.count || 0),
    },
  });
}

/**
 * DELETE /api/auth/me
 * Permanently deletes the user's account and all associated personal data (GDPR Right to Erasure).
 */
export async function DELETE() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteUserAccount(session.id);
    await clearSessionCookie();

    return NextResponse.json({
      success: true,
      message: "User account and all associated personal data permanently erased",
    });
  } catch (error) {
    console.error("Account deletion error:", error);
    return NextResponse.json(
      { error: "Account deletion failed" },
      { status: 500 }
    );
  }
}
