import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listRecentSearches } from "@/lib/db/repo/search";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searches = await listRecentSearches(user.id, 10);
  return NextResponse.json({ searches });
}
