import { NextResponse } from "next/server";
import { getSessionUser, clearSessionCookie } from "@/lib/auth/session";
import { deleteUserAccount } from "@/lib/db/repo/people";

/**
 * DELETE /api/users/me
 * Permanently deletes the authenticated user's account and all associated personal data.
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
      message: "User account and all personal data permanently erased",
    });
  } catch (error) {
    console.error("User account deletion error:", error);
    return NextResponse.json(
      { error: "Account deletion failed" },
      { status: 500 }
    );
  }
}
