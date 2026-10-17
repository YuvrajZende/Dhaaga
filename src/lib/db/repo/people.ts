import { db } from "../index";
import {
  people,
  contactEdges,
  embeddingQueue,
  friendships,
  follows,
  users,
  googleTokens,
  sources,
  syncJobs,
  importRows,
  groups,
  groupMembers,
  introDrafts,
  searches,
  searchResults,
} from "../schema";
import { eq, and, sql, or, inArray } from "drizzle-orm";

export interface UpsertPersonInput {
  displayName: string;
  givenName?: string | null;
  familyName?: string | null;
  primaryEmail?: string | null;
  title?: string | null;
  company?: string | null;
  companyDomain?: string | null;
  headline?: string | null;
  avatarUrl?: string | null;
  location?: string | null;
  bio?: string | null;
  tags?: string[];
  sourceRefs?: Array<{ source: string; sourceId: string }>;
  dedupKey: string;
}

/**
 * Upsert a person record enforcing the owner isolation rule.
 */
export async function upsertPerson(userId: string, input: UpsertPersonInput) {
  const result = await db
    .insert(people)
    .values({
      ownerUserId: userId,
      displayName: input.displayName,
      givenName: input.givenName,
      familyName: input.familyName,
      primaryEmail: input.primaryEmail,
      title: input.title,
      company: input.company,
      companyDomain: input.companyDomain,
      headline: input.headline,
      avatarUrl: input.avatarUrl,
      location: input.location,
      bio: input.bio,
      tags: input.tags ?? [],
      sourceRefs: input.sourceRefs || [],
      dedupKey: input.dedupKey,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [people.ownerUserId, people.dedupKey],
      set: {
        displayName: sql`COALESCE(EXCLUDED.display_name, ${people.displayName})`,
        givenName: sql`COALESCE(EXCLUDED.given_name, ${people.givenName})`,
        familyName: sql`COALESCE(EXCLUDED.family_name, ${people.familyName})`,
        primaryEmail: sql`COALESCE(EXCLUDED.primary_email, ${people.primaryEmail})`,
        title: sql`COALESCE(EXCLUDED.title, ${people.title})`,
        company: sql`COALESCE(EXCLUDED.company, ${people.company})`,
        companyDomain: sql`COALESCE(EXCLUDED.company_domain, ${people.companyDomain})`,
        headline: sql`COALESCE(EXCLUDED.headline, ${people.headline})`,
        avatarUrl: sql`COALESCE(EXCLUDED.avatar_url, ${people.avatarUrl})`,
        location: sql`COALESCE(EXCLUDED.location, ${people.location})`,
        bio: sql`COALESCE(EXCLUDED.bio, ${people.bio})`,
        tags: sql`COALESCE(EXCLUDED.tags, ${people.tags})`,
        sourceRefs: sql`${people.sourceRefs} || EXCLUDED.source_refs`,
        updatedAt: new Date(),
      },
    })
    .returning();

  return result[0];
}

/**
 * Fetch a single person profile for a user.
 */
export async function getPersonById(userId: string, personId: string) {
  const rows = await db
    .select()
    .from(people)
    .where(and(eq(people.ownerUserId, userId), eq(people.id, personId)))
    .limit(1);

  return rows[0] || null;
}

/**
 * List people for a user with pagination.
 */
export async function listPeople(userId: string, limit = 50, offset = 0) {
  return db
    .select({
      person: people,
      strength: contactEdges.strength,
    })
    .from(people)
    .leftJoin(
      contactEdges,
      and(
        eq(contactEdges.userId, userId),
        eq(contactEdges.personId, people.id)
      )
    )
    .where(eq(people.ownerUserId, userId))
    .limit(limit)
    .offset(offset);
}

/**
 * Delete all data for a user across all tables (complete GDPR / account erasure).
 */
export async function deleteUserAccount(userId: string): Promise<boolean> {
  // 1. Delete owned groups and memberships
  const ownedGroups = await db.select({ id: groups.id }).from(groups).where(eq(groups.ownerId, userId));
  if (ownedGroups.length > 0) {
    const groupIds = ownedGroups.map((g) => g.id);
    await db.delete(groupMembers).where(inArray(groupMembers.groupId, groupIds));
    await db.delete(groups).where(eq(groups.ownerId, userId));
  }

  // 2. Delete group memberships for other groups
  await db.delete(groupMembers).where(eq(groupMembers.userId, userId));

  // 3. Delete friendships (both inbound and outbound)
  await db.delete(friendships).where(or(eq(friendships.userId, userId), eq(friendships.friendId, userId)));

  // 3b. Delete follows (both follower and followed)
  await db.delete(follows).where(or(eq(follows.followerUserId, userId), eq(follows.followedUserId, userId)));

  // 4. Delete intro drafts
  await db.delete(introDrafts).where(eq(introDrafts.userId, userId));

  // 5. Delete searches & search results
  const userSearches = await db.select({ id: searches.id }).from(searches).where(eq(searches.userId, userId));
  if (userSearches.length > 0) {
    const searchIds = userSearches.map((s) => s.id);
    await db.delete(searchResults).where(inArray(searchResults.searchId, searchIds));
    await db.delete(searches).where(eq(searches.userId, userId));
  }

  // 6. Delete sync jobs & import rows
  const userJobs = await db.select({ id: syncJobs.id }).from(syncJobs).where(eq(syncJobs.userId, userId));
  if (userJobs.length > 0) {
    const jobIds = userJobs.map((j) => j.id);
    await db.delete(importRows).where(inArray(importRows.jobId, jobIds));
    await db.delete(syncJobs).where(eq(syncJobs.userId, userId));
  }

  // 7. Delete sources & google tokens
  await db.delete(sources).where(eq(sources.userId, userId));
  await db.delete(googleTokens).where(eq(googleTokens.userId, userId));

  // 8. Delete people (cascades to contactEdges, personEdges, embeddings, embeddingQueue)
  await db.delete(people).where(eq(people.ownerUserId, userId));

  // 9. Delete users record
  const [deleted] = await db.delete(users).where(eq(users.id, userId)).returning();

  return Boolean(deleted);
}

export const deleteUserData = deleteUserAccount;

/**
 * A person is reachable if it is yours, or a sharing-enabled accepted
 * friend owns it (FR-G2/G3). 404 on miss — never leak existence.
 */
export async function getReachablePerson(userId: string, personId: string) {
  const [row] = await db
    .select({
      id: people.id,
      ownerUserId: people.ownerUserId,
      displayName: people.displayName,
      title: people.title,
      company: people.company,
      companyDomain: people.companyDomain,
      headline: people.headline,
      avatarUrl: people.avatarUrl,
      location: people.location,
      bio: people.bio,
      tags: people.tags,
      sourceRefs: sql<unknown>`CASE WHEN ${people.ownerUserId} = ${userId} THEN ${people.sourceRefs} ELSE '[]'::jsonb END`,
      primaryEmail: sql<string | null>`CASE WHEN ${people.ownerUserId} = ${userId} THEN ${people.primaryEmail} ELSE NULL END`,
    })
    .from(people)
    .innerJoin(users, eq(users.id, people.ownerUserId))
    .where(
      and(
        eq(people.id, personId),
        or(
          eq(people.ownerUserId, userId),
          and(
            eq(users.sharingEnabled, true),
            sql`EXISTS (SELECT 1 FROM friendships f WHERE f.user_id = ${userId} AND f.friend_id = ${people.ownerUserId} AND f.status = 'accepted')`
          )
        )
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Keeps a requested scope limited to owners the current user may search.
 */
export function retainAuthorizedFriendIds(
  requestedFriendIds: string[],
  authorizedFriendIds: string[]
): string[] {
  const authorized = new Set(authorizedFriendIds);
  return [...new Set(requestedFriendIds.filter((friendId) => authorized.has(friendId)))];
}

/**
 * Resolves requested shared-network owners against accepted friendships and
 * each owner's opt-in sharing setting. Never trust browser-provided owner IDs.
 */
export async function getSearchableFriendIds(
  userId: string,
  requestedFriendIds: string[]
): Promise<string[]> {
  if (requestedFriendIds.length === 0) return [];

  const rows = await db
    .select({ id: friendships.friendId })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.friendId))
    .where(
      and(
        eq(friendships.userId, userId),
        eq(friendships.status, "accepted"),
        eq(users.sharingEnabled, true),
        inArray(friendships.friendId, requestedFriendIds)
      )
    );

  return retainAuthorizedFriendIds(requestedFriendIds, rows.map((row) => row.id));
}

export interface UpdatePersonProfileInput {
  displayName?: string;
  primaryEmail?: string | null;
  bio?: string | null;
  tags?: string[];
  headline?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
}

/**
 * Update personal profile data (bio, tags, headline, etc.) on a contact
 * you own. Re-queues the person for re-embedding so semantic search
 * picks up the new data.
 */
export async function updatePersonProfile(
  userId: string,
  personId: string,
  input: UpdatePersonProfileInput
) {
  const setCols: Record<string, unknown> = { updatedAt: new Date() };
  if (input.displayName !== undefined) setCols.displayName = input.displayName;
  if (input.primaryEmail !== undefined) setCols.primaryEmail = input.primaryEmail;
  if (input.bio !== undefined) setCols.bio = input.bio;
  if (input.tags !== undefined) setCols.tags = input.tags;
  if (input.headline !== undefined) setCols.headline = input.headline;
  if (input.title !== undefined) setCols.title = input.title;
  if (input.company !== undefined) setCols.company = input.company;
  if (input.location !== undefined) setCols.location = input.location;

  const [updated] = await db
    .update(people)
    .set(setCols)
    .where(and(eq(people.id, personId), eq(people.ownerUserId, userId)))
    .returning();

  if (!updated) return null;

  // Re-queue for embedding so the new bio/tags get vectorized
  await db
    .insert(embeddingQueue)
    .values({ personId, ownerUserId: userId })
    .onConflictDoNothing();

  return updated;
}

/**
 * Delete a person record enforcing the owner isolation rule.
 */
export async function deletePerson(userId: string, personId: string): Promise<boolean> {
  const deleted = await db
    .delete(people)
    .where(and(eq(people.id, personId), eq(people.ownerUserId, userId)))
    .returning();

  return deleted.length > 0;
}
