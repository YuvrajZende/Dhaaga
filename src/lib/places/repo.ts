/**
 * Places & Circle Recommendations Repository.
 * Enforces strict multi-tenant authorization, relationship graph enrichment,
 * and privacy-first recommendation visibility rules.
 */

import { db } from "../db";
import { entities, recommendations, users, friendships, follows, contactEdges, people } from "../db/schema";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import {
  PlaceEntity,
  SaveRecommendationInput,
  CircleEndorsementSummary,
  CircleRecommender,
} from "./types";

/**
 * Upserts an external or manual place into the persistent entities table.
 */
export async function upsertEntity(
  place: Omit<PlaceEntity, "id" | "createdAt" | "updatedAt">
): Promise<PlaceEntity> {
  const [row] = await db
    .insert(entities)
    .values({
      provider: place.provider,
      providerExternalId: place.providerExternalId,
      name: place.name,
      type: place.type,
      category: place.category,
      address: place.address,
      city: place.city,
      latitude: place.latitude,
      longitude: place.longitude,
      externalRating: place.externalRating,
      externalRatingCount: place.externalRatingCount,
      metadata: place.metadata || {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [entities.provider, entities.providerExternalId],
      set: {
        name: place.name,
        type: place.type,
        category: place.category,
        address: place.address,
        city: place.city,
        latitude: place.latitude,
        longitude: place.longitude,
        externalRating: place.externalRating,
        externalRatingCount: place.externalRatingCount,
        metadata: place.metadata || {},
        updatedAt: new Date(),
      },
    })
    .returning();

  return row as PlaceEntity;
}

/**
 * Save or update a recommendation for an entity by the authenticated user.
 * Explicitly guards privacy defaults:
 * - shareWithCircle defaults to false (explicit opt-in)
 * - isPrivateNote defaults to true (private notes are NEVER exposed to friends)
 */
export async function saveRecommendation(
  userId: string,
  input: SaveRecommendationInput
) {
  const clampedRating =
    input.rating != null ? Math.min(5, Math.max(1, Math.round(input.rating))) : null;

  const [row] = await db
    .insert(recommendations)
    .values({
      userId,
      entityId: input.entityId,
      rating: clampedRating,
      note: input.note?.trim() || null,
      isPrivateNote: input.isPrivateNote !== undefined ? input.isPrivateNote : true,
      shareWithCircle: input.shareWithCircle !== undefined ? input.shareWithCircle : false,
      source: input.source || "manual",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [recommendations.userId, recommendations.entityId],
      set: {
        rating: clampedRating,
        note: input.note?.trim() || null,
        isPrivateNote: input.isPrivateNote !== undefined ? input.isPrivateNote : true,
        shareWithCircle: input.shareWithCircle !== undefined ? input.shareWithCircle : false,
        source: input.source || "manual",
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

/**
 * Retrieves circle endorsements for a batch of entities visible to the viewer.
 *
 * PRIVACY GUARANTEES:
 * 1. Viewer always sees their own recommendation and private notes.
 * 2. Viewer ONLY sees recommendations from friends if:
 *    - An accepted friendship exists (friendships.status = 'accepted')
 *    - Recommender has sharing_enabled = true
 *    - Recommender explicitly set share_with_circle = true on this recommendation
 * 3. Even for shared recommendations, private notes (is_private_note = true) are
 *    STRICTLY masked to NULL at the query level.
 */
export async function getCircleEndorsementsForPlaces(
  viewerId: string,
  entityIds: string[]
): Promise<Map<string, CircleEndorsementSummary>> {
  const map = new Map<string, CircleEndorsementSummary>();
  if (entityIds.length === 0) return map;

  // 1. Fetch authorized recommendations
  const idPlaceholders = sql.join(
    entityIds.map((id) => sql`${id}`),
    sql`, `
  );

  const rawRowsResult = await db.execute<{
    entity_id: string;
    provider_external_id: string | null;
    recommender_id: string;
    recommender_name: string;
    recommender_avatar: string | null;
    rating: number | null;
    recommender_source: string | null;
    shared_note: string | null;
    is_owner: boolean;
    recommended_at: string;
  }>(sql`
    SELECT
      r.entity_id,
      e.provider_external_id,
      r.user_id AS recommender_id,
      u.name AS recommender_name,
      u.avatar_url AS recommender_avatar,
      r.rating,
      r.source AS recommender_source,
      -- Mask private notes: only owner or explicitly public shared notes are visible
      CASE
        WHEN r.user_id = ${viewerId} THEN r.note
        WHEN r.is_private_note = false THEN r.note
        ELSE NULL
      END AS shared_note,
      (r.user_id = ${viewerId}) AS is_owner,
      r.updated_at AS recommended_at
    FROM recommendations r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN entities e ON e.id = r.entity_id
    WHERE (r.entity_id::text IN (${idPlaceholders}) OR e.provider_external_id IN (${idPlaceholders}))
      AND (
        -- Condition 1: Viewer is the owner
        r.user_id = ${viewerId}
        OR
        -- Condition 2: Followed user or accepted friend with recommendation shared
        (
          r.share_with_circle = true
          AND (
            EXISTS (
              SELECT 1 FROM follows fol
              WHERE fol.follower_user_id = ${viewerId}
                AND fol.followed_user_id = r.user_id
            )
            OR
            EXISTS (
              SELECT 1 FROM friendships f
              WHERE f.user_id = ${viewerId}
                AND f.friend_id = r.user_id
                AND f.status = 'accepted'
            )
          )
        )
      )
    ORDER BY r.updated_at DESC
  `);

  const rows = Array.isArray(rawRowsResult)
    ? rawRowsResult
    : (rawRowsResult as any)?.rows ?? [];

  if (rows.length === 0) return map;

  // 2. Fetch connection strengths from viewer's contact network
  const recommenderUserIds = Array.from(new Set(rows.map((r: any) => r.recommender_id as string)));
  const userPlaceholders = sql.join(
    recommenderUserIds.map((uid) => sql`${uid}`),
    sql`, `
  );

  // Find person edges or contact edges linking viewer to recommender's person
  const strengthRowsResult = await db.execute<{
    recommender_user_id: string;
    strength: number;
  }>(sql`
    SELECT
      p.owner_user_id AS recommender_user_id,
      COALESCE(ce.strength, 70) AS strength
    FROM people p
    LEFT JOIN contact_edges ce ON ce.person_id = p.id AND ce.user_id = ${viewerId}
    WHERE p.owner_user_id IN (${userPlaceholders})
  `);

  const strengthMap = new Map<string, number>();
  const strengthRows = Array.isArray(strengthRowsResult)
    ? strengthRowsResult
    : (strengthRowsResult as any)?.rows ?? [];

  for (const s of strengthRows as { recommender_user_id: string; strength: number }[]) {
    strengthMap.set(s.recommender_user_id, s.strength);
  }

  // 3. Assemble CircleEndorsementSummary grouped by entity_id and provider_external_id
  for (const row of rows as any[]) {
    const entityId = row.entity_id;
    const providerExternalId = row.provider_external_id;

    let summary = map.get(entityId);
    if (!summary) {
      summary = {
        endorsementCount: 0,
        averageFriendRating: null,
        recommenders: [],
        hasDirectEndorsement: false,
        topRecommender: null,
      };
      map.set(entityId, summary);
      if (providerExternalId) {
        map.set(providerExternalId, summary);
      }
    }

    const isOwner = row.is_owner;
    const strength = isOwner ? 100 : (strengthMap.get(row.recommender_id) || 75);

    const recommender: CircleRecommender = {
      userId: row.recommender_id,
      name: isOwner ? "You" : row.recommender_name,
      avatarUrl: row.recommender_avatar,
      rating: row.rating ? Number(row.rating) : null,
      sharedNote: row.shared_note,
      source: row.recommender_source || "manual",
      relationshipType: isOwner ? "direct" : strength >= 60 ? "direct" : "2nd-degree",
      connectionStrength: strength,
      recommendedAt: new Date(row.recommended_at),
    };

    summary.recommenders.push(recommender);
    summary.endorsementCount += 1;
    if (recommender.relationshipType === "direct" && !isOwner) {
      summary.hasDirectEndorsement = true;
    }
  }

  // Calculate averages and top recommender for each entity
  for (const summary of map.values()) {
    const ratings = summary.recommenders
      .map((r) => r.rating)
      .filter((r): r is number => r !== null);

    if (ratings.length > 0) {
      const sum = ratings.reduce((acc, curr) => acc + curr, 0);
      summary.averageFriendRating = Number((sum / ratings.length).toFixed(1));
    }

    // Sort recommenders: highest connection strength + rating first
    summary.recommenders.sort((a, b) => {
      const scoreA = (a.rating || 3) * 20 + a.connectionStrength;
      const scoreB = (b.rating || 3) * 20 + b.connectionStrength;
      return scoreB - scoreA;
    });

    summary.topRecommender = summary.recommenders[0] || null;
  }

  return map;
}

/**
 * Fetch a single place entity with viewer's authorized circle endorsements.
 */
export async function getEntityWithCircle(viewerId: string, entityId: string) {
  const [entity] = await db
    .select()
    .from(entities)
    .where(eq(entities.id, entityId))
    .limit(1);

  if (!entity) return null;

  const endorsementsMap = await getCircleEndorsementsForPlaces(viewerId, [entityId]);
  const circle = endorsementsMap.get(entityId) || {
    endorsementCount: 0,
    averageFriendRating: null,
    recommenders: [],
    hasDirectEndorsement: false,
    topRecommender: null,
  };

  const [currentUserRec] = await db
    .select({
      rating: recommendations.rating,
      note: recommendations.note,
      isPrivateNote: recommendations.isPrivateNote,
      shareWithCircle: recommendations.shareWithCircle,
    })
    .from(recommendations)
    .where(and(eq(recommendations.userId, viewerId), eq(recommendations.entityId, entityId)))
    .limit(1);

  return {
    ...entity,
    circle,
    currentUserRecommendation: currentUserRec || null,
  };
}

/**
 * Delete a user's recommendation for an entity.
 */
export async function deleteRecommendation(userId: string, entityId: string) {
  return await db
    .delete(recommendations)
    .where(and(eq(recommendations.userId, userId), eq(recommendations.entityId, entityId)))
    .returning();
}

/**
 * Retrieves places recommended by a specific person visible to the viewer.
 * Used for "PLACE CONNECTIONS" in the person drawer.
 */
export async function getPersonRecommendedPlaces(
  viewerId: string,
  personOwnerUserId: string
) {
  const isSelf = viewerId === personOwnerUserId;

  const rows = await db.execute<{
    entity_id: string;
    entity_name: string;
    entity_type: string;
    entity_category: string | null;
    entity_city: string | null;
    external_rating: number | null;
    rating: number | null;
    shared_note: string | null;
    source: string;
    recommended_at: string;
  }>(sql`
    SELECT
      e.id AS entity_id,
      e.name AS entity_name,
      e.type AS entity_type,
      e.category AS entity_category,
      e.city AS entity_city,
      e.external_rating,
      r.rating,
      -- Privacy: mask private notes if not viewer's own
      CASE
        WHEN r.user_id = ${viewerId} THEN r.note
        WHEN r.is_private_note = false THEN r.note
        ELSE NULL
      END AS shared_note,
      r.source,
      r.updated_at AS recommended_at
    FROM recommendations r
    JOIN entities e ON e.id = r.entity_id
    JOIN users u ON u.id = r.user_id
    WHERE r.user_id = ${personOwnerUserId}
      AND (
        ${isSelf} = true
        OR (
          r.share_with_circle = true
          AND (
            EXISTS (
              SELECT 1 FROM follows fol
              WHERE fol.follower_user_id = ${viewerId}
                AND fol.followed_user_id = r.user_id
            )
            OR
            EXISTS (
              SELECT 1 FROM friendships f
              WHERE f.user_id = ${viewerId}
                AND f.friend_id = r.user_id
                AND f.status = 'accepted'
            )
          )
        )
      )
    ORDER BY r.updated_at DESC
    LIMIT 10
  `);

  const list = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  return list.map((r: any) => ({
    id: r.entity_id,
    name: r.entity_name,
    type: r.entity_type,
    category: r.entity_category,
    city: r.entity_city,
    externalRating: r.external_rating ? Number(r.external_rating) : null,
    rating: r.rating ? Number(r.rating) : null,
    sharedNote: r.shared_note,
    source: r.source || "manual",
    recommendedAt: new Date(r.recommended_at),
  }));
}

/**
 * Retrieves place entities that have been recommended by the viewer or users
 * followed by the viewer (or accepted friends), with share_with_circle = true.
 * Used in dual-retrieval so circle recommendations are ALWAYS included in search candidates.
 */
export async function getCircleRecommendedEntities(
  viewerId: string,
  options: {
    queryText?: string;
    category?: string;
    city?: string;
    limit?: number;
  } = {}
): Promise<PlaceEntity[]> {
  const { limit = 50 } = options;

  const rows = await db.execute<any>(sql`
    SELECT DISTINCT
      e.id,
      e.provider,
      e.provider_external_id,
      e.name,
      e.type,
      e.category,
      e.address,
      e.city,
      e.latitude,
      e.longitude,
      e.external_rating,
      e.external_rating_count,
      e.metadata,
      e.updated_at
    FROM entities e
    JOIN recommendations r ON r.entity_id = e.id
    WHERE (
      -- Condition 1: Viewer is the owner
      r.user_id = ${viewerId}
      OR
      -- Condition 2: Followed user or accepted friend with recommendation shared
      (
        r.share_with_circle = true
        AND (
          EXISTS (
            SELECT 1 FROM follows fol
            WHERE fol.follower_user_id = ${viewerId}
              AND fol.followed_user_id = r.user_id
          )
          OR
          EXISTS (
            SELECT 1 FROM friendships f
            WHERE f.user_id = ${viewerId}
              AND f.friend_id = r.user_id
              AND f.status = 'accepted'
          )
        )
      )
    )
    ORDER BY e.updated_at DESC
    LIMIT ${limit}
  `);

  const entitiesList = Array.isArray(rows) ? rows : (rows as any)?.rows ?? [];
  return entitiesList.map((row: any) => ({
    id: row.id,
    provider: row.provider,
    providerExternalId: row.provider_external_id,
    name: row.name,
    type: row.type,
    category: row.category,
    address: row.address,
    city: row.city,
    latitude: row.latitude ? Number(row.latitude) : null,
    longitude: row.longitude ? Number(row.longitude) : null,
    externalRating: row.external_rating ? Number(row.external_rating) : null,
    externalRatingCount: row.external_rating_count ? Number(row.external_rating_count) : null,
    metadata: row.metadata || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}


