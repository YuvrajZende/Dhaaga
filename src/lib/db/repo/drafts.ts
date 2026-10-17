import { db } from "../index";
import { introDrafts } from "../schema";
import { and, desc, eq } from "drizzle-orm";

export interface SaveDraftInput {
  targetPersonId: string;
  mutualPersonId: string | null;
  subject: string | null;
  body: string;
}

export async function saveDraft(userId: string, input: SaveDraftInput) {
  const [row] = await db
    .insert(introDrafts)
    .values({ userId, ...input })
    .returning();
  return row;
}

export async function listDrafts(userId: string, personId?: string, limit = 20) {
  const where = personId
    ? and(eq(introDrafts.userId, userId), eq(introDrafts.targetPersonId, personId))
    : eq(introDrafts.userId, userId);
  return db
    .select()
    .from(introDrafts)
    .where(where)
    .orderBy(desc(introDrafts.createdAt))
    .limit(limit);
}
