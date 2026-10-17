/**
 * Network & Trusted Circle Repository.
 * Manages asymmetric "Follow" / "Trusted Circle" connections with strict
 * user isolation, cascade cleanup, and zero-knowledge boundaries.
 */

import { db } from "../index";
import { follows, users, people } from "../schema";
import { eq, and, sql, inArray } from "drizzle-orm";

export interface FollowedUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  location: string | null;
  followedAt: Date;
}

/**
 * Follow a user (add them to your trusted circle).
 */
export async function followUser(followerId: string, followedId: string): Promise<boolean> {
  if (followerId === followedId) {
    throw new Error("Cannot follow yourself");
  }

  // Ensure followed user exists
  const [targetUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, followedId))
    .limit(1);

  if (!targetUser) {
    throw new Error("Target user not found");
  }

  await db
    .insert(follows)
    .values({
      followerUserId: followerId,
      followedUserId: followedId,
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  return true;
}

/**
 * Unfollow a user (remove them from your trusted circle).
 */
export async function unfollowUser(followerId: string, followedId: string): Promise<boolean> {
  const deleted = await db
    .delete(follows)
    .where(
      and(
        eq(follows.followerUserId, followerId),
        eq(follows.followedUserId, followedId)
      )
    )
    .returning();

  return deleted.length > 0;
}

/**
 * Check if followerId follows followedId.
 */
export async function isFollowing(followerId: string, followedId: string): Promise<boolean> {
  if (followerId === followedId) return true; // You always follow yourself in context of seeing own recommendations

  const [row] = await db
    .select({ followerUserId: follows.followerUserId })
    .from(follows)
    .where(
      and(
        eq(follows.followerUserId, followerId),
        eq(follows.followedUserId, followedId)
      )
    )
    .limit(1);

  return Boolean(row);
}

/**
 * Get all user IDs that followerId is actively following.
 */
export async function getFollowingUserIds(followerId: string): Promise<string[]> {
  const rows = await db
    .select({ followedUserId: follows.followedUserId })
    .from(follows)
    .where(eq(follows.followerUserId, followerId));

  return rows.map((r) => r.followedUserId);
}

/**
 * List full profiles of users that followerId is following.
 */
export async function listFollowing(followerId: string): Promise<FollowedUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      location: users.location,
      followedAt: follows.createdAt,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followedUserId))
    .where(eq(follows.followerUserId, followerId))
    .orderBy(sql`${follows.createdAt} DESC`);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    avatarUrl: r.avatarUrl,
    location: r.location,
    followedAt: new Date(r.followedAt),
  }));
}

/**
 * List followers of a given user.
 */
export async function listFollowers(userId: string): Promise<FollowedUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      location: users.location,
      followedAt: follows.createdAt,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followerUserId))
    .where(eq(follows.followedUserId, userId))
    .orderBy(sql`${follows.createdAt} DESC`);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    avatarUrl: r.avatarUrl,
    location: r.location,
    followedAt: new Date(r.followedAt),
  }));
}
