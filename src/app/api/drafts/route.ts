import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getReachablePerson } from "@/lib/db/repo/people";
import { saveDraft, listDrafts } from "@/lib/db/repo/drafts";
import { generateDraft } from "@/lib/warmpath/draft";

const GenerateSchema = z.object({
  targetPersonId: z.string().uuid(),
  mutualPersonId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = GenerateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { targetPersonId, mutualPersonId } = parsed.data;

  const target = await getReachablePerson(user.id, targetPersonId);
  if (!target) {
    return NextResponse.json({ error: "Target person not found" }, { status: 404 });
  }

  let mutual: { id: string; name: string; title: string | null; company: string | null } | null = null;
  if (mutualPersonId) {
    const m = await getReachablePerson(user.id, mutualPersonId);
    if (!m) {
      return NextResponse.json({ error: "Mutual contact not found" }, { status: 404 });
    }
    mutual = { id: m.id, name: m.displayName, title: m.title, company: m.company };
  }

  const { draft, degraded } = await generateDraft({
    userName: user.name,
    target: { name: target.displayName, title: target.title, company: target.company },
    mutual,
  });

  const saved = await saveDraft(user.id, {
    targetPersonId,
    mutualPersonId: mutual?.id ?? null,
    subject: draft.subject,
    body: draft.body,
  });

  return NextResponse.json({ draft: saved, degraded }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const personId = req.nextUrl.searchParams.get("personId") ?? undefined;
  const drafts = await listDrafts(user.id, personId);
  return NextResponse.json({ drafts });
}
