import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getReachablePerson, updatePersonProfile, deletePerson } from "@/lib/db/repo/people";
import { selectWarmPath } from "@/lib/warmpath/select";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid person id" }, { status: 400 });
  }

  const person = await getReachablePerson(user.id, id);
  if (!person) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const warmPath = await selectWarmPath(user.id, id);
  return NextResponse.json({ person, warmPath });
}

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  primaryEmail: z.string().email().nullish().or(z.literal("")).optional(),
  bio: z.string().max(2000).nullish(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  headline: z.string().max(300).nullish(),
  title: z.string().max(200).nullish(),
  company: z.string().max(200).nullish(),
  location: z.string().max(200).nullish(),
});

/**
 * PATCH /api/people/[id]
 * Update personal data (bio, tags, headline, etc.) on a contact you own.
 * Automatically re-embeds the person so search picks up the changes.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid person id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = UpdateProfileSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.format() },
      { status: 400 }
    );
  }

  const updated = await updatePersonProfile(user.id, id, validation.data);
  if (!updated) {
    return NextResponse.json({ error: "Not found or not owned" }, { status: 404 });
  }

  return NextResponse.json({ person: updated });
}

/**
 * DELETE /api/people/[id]
 * Delete a contact you own.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid person id" }, { status: 400 });
  }

  const success = await deletePerson(user.id, id);
  if (!success) {
    return NextResponse.json({ error: "Not found or not owned" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
