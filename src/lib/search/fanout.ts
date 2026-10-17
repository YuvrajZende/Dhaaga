/**
 * Candidate Fan-out & Retrieval Engine (LLD §6.3).
 * Executes semantic vector search (pgvector 384-d cosine), structured sub-searches,
 * and attaches relationship strength + warm-mutual path discovery.
 */

import { db } from "../db";
import { people, contactEdges, personEdges, embeddings } from "../db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { embedText, EMBEDDING_MODEL_VERSION } from "../embed/model";
import { Candidate, SubSearchPlan } from "./types";
import { getSearchableFriendIds } from "../db/repo/people";

interface FanoutOptions {
  userId: string;
  userEmail?: string;
  plan: SubSearchPlan;
  friendIds?: string[];
  maxCandidates?: number;
}

/**
 * Executes sub-searches against pgvector and relational tables,
 * attaching relationship strength and warm-path mutuals.
 */
export async function executeFanout(options: FanoutOptions): Promise<Candidate[]> {
  const { userId, userEmail, plan, friendIds = [], maxCandidates = 1000 } = options;
  const authorizedFriendIds =
    friendIds.length > 0 ? await getSearchableFriendIds(userId, friendIds) : [];

  // Track discovered person IDs mapped to their highest similarity and scope
  const candidateScores = new Map<
    string,
    { sim: number; scope: "me" | "friend"; viaOwnerId?: string }
  >();

  // ─────────────────────────────────────────────────────────────
  // 1. Execute Sub-searches
  // ─────────────────────────────────────────────────────────────

  for (const sub of plan.subSearches) {
    if (sub.kind === "semantic") {
      try {
        const qvec = await embedText(sub.text);
        const k = Math.min(sub.k || 400, 400);

        // Vector literal format for pgvector: '[0.1,0.2,...]'
        const vecLiteral = `[${qvec.join(",")}]`;

        // Semantic search on user's own network
        const ownRowsResult = await db.execute<{
          person_id: string;
          sim: number;
        }>(sql`
          SELECT e.person_id, (1 - (e.vec <=> ${vecLiteral}::halfvec(384)))::real AS sim
          FROM embeddings e
          WHERE e.owner_user_id = ${userId}
            AND e.model_version = ${EMBEDDING_MODEL_VERSION}
          ORDER BY e.vec <=> ${vecLiteral}::halfvec(384)
          LIMIT ${k}
        `);

        const ownRows = Array.isArray(ownRowsResult)
          ? ownRowsResult
          : (ownRowsResult as any)?.rows ?? [];

        for (const row of ownRows as { person_id: string; sim: number }[]) {
          const current = candidateScores.get(row.person_id);
          if (!current || row.sim > current.sim) {
            candidateScores.set(row.person_id, {
              sim: row.sim,
              scope: "me",
            });
          }
        }

        // Search friends' networks if opt-in sharing and authorizedFriendIds are provided
        if (authorizedFriendIds.length > 0) {
          const friendRowsResult = await db.execute<{
            person_id: string;
            owner_user_id: string;
            sim: number;
          }>(sql`
            SELECT e.person_id, e.owner_user_id, (1 - (e.vec <=> ${vecLiteral}::halfvec(384)))::real AS sim
            FROM embeddings e
            WHERE e.owner_user_id = ANY(${authorizedFriendIds})
              AND e.model_version = ${EMBEDDING_MODEL_VERSION}
            ORDER BY e.vec <=> ${vecLiteral}::halfvec(384)
            LIMIT 100
          `);

          const friendRows = Array.isArray(friendRowsResult)
            ? friendRowsResult
            : (friendRowsResult as any)?.rows ?? [];

          for (const row of friendRows as { person_id: string; owner_user_id: string; sim: number }[]) {
            const current = candidateScores.get(row.person_id);
            if (!current || row.sim > current.sim) {
              candidateScores.set(row.person_id, {
                sim: row.sim,
                scope: "friend",
                viaOwnerId: row.owner_user_id,
              });
            }
          }
        }
      } catch (err) {
        console.warn("Semantic subsearch failed, continuing with other branches:", err);
      }
    } else if (sub.kind === "structured") {
      try {
        const conditions = [eq(people.ownerUserId, userId)];

        // Title filter
        if (sub.titleKeywords && sub.titleKeywords.length > 0) {
          const titleConds = sub.titleKeywords.map(
            (kw) => sql`${people.title} ILIKE ${`%${kw}%`}`
          );
          conditions.push(sql`(${sql.join(titleConds, sql` OR `)})`);
        }

        // Company filter
        if (sub.companyKeywords && sub.companyKeywords.length > 0) {
          const companyConds = sub.companyKeywords.map(
            (kw) =>
              sql`${people.company} ILIKE ${`%${kw}%`} OR ${people.companyDomain} ILIKE ${`%${kw}%`}`
          );
          conditions.push(sql`(${sql.join(companyConds, sql` OR `)})`);
        }

        const structuredRows = await db
          .select({ id: people.id })
          .from(people)
          .where(and(...conditions))
          .limit(200);

        for (const row of structuredRows) {
          const current = candidateScores.get(row.id);
          // Give structured matches a high baseline similarity (e.g. 0.85) if not already set higher
          const structuredSim = 0.85;
          if (!current || structuredSim > current.sim) {
            candidateScores.set(row.id, {
              sim: Math.max(current?.sim ?? 0, structuredSim),
              scope: "me",
            });
          }
        }
      } catch (err) {
        console.warn("Structured subsearch failed:", err);
      }
    }
  }

  const personIds = Array.from(candidateScores.keys()).slice(0, maxCandidates);
  if (personIds.length === 0) {
    return [];
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Hydrate People Data & Relationship Strength
  // ─────────────────────────────────────────────────────────────

  const peopleRows = await db
    .select({
      id: people.id,
      displayName: people.displayName,
      title: people.title,
      company: people.company,
      companyDomain: people.companyDomain,
      headline: people.headline,
      avatarUrl: people.avatarUrl,
      location: people.location,
      bio: people.bio,
      tags: people.tags,
      primaryEmail: people.primaryEmail,
      ownerUserId: people.ownerUserId,
    })
    .from(people)
    .where(inArray(people.id, personIds));

  const edgeRows = await db
    .select({
      personId: contactEdges.personId,
      strength: contactEdges.strength,
    })
    .from(contactEdges)
    .where(
      and(
        eq(contactEdges.userId, userId),
        inArray(contactEdges.personId, personIds)
      )
    );

  const strengthMap = new Map<string, number>();
  for (const edge of edgeRows) {
    strengthMap.set(edge.personId, edge.strength);
  }

  const candidates: Candidate[] = [];

  for (const p of peopleRows) {
    const meta = candidateScores.get(p.id);
    if (!meta) continue;

    const strength = strengthMap.get(p.id) ?? 0;

    candidates.push({
      personId: p.id,
      name: p.displayName,
      title: p.title,
      company: p.company,
      companyDomain: p.companyDomain,
      headline: p.headline,
      avatarUrl: p.avatarUrl,
      location: p.location,
      bio: p.bio,
      tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
      sim: meta.sim,
      ownerScope: meta.scope,
      viaOwnerId: meta.viaOwnerId,
      strength,
    });
  }

  // Sort candidates by combination of similarity, intent metadata matching & strength
  const act = plan.intent?.activity?.toLowerCase();
  const loc = plan.intent?.location?.toLowerCase();

  candidates.sort((a, b) => {
    const hasTagA = act && (a.tags?.some((t) => t.toLowerCase().includes(act) || act.includes(t.toLowerCase())) || a.bio?.toLowerCase().includes(act));
    const hasTagB = act && (b.tags?.some((t) => t.toLowerCase().includes(act) || act.includes(t.toLowerCase())) || b.bio?.toLowerCase().includes(act));

    const hasLocA = loc && a.location?.toLowerCase().includes(loc);
    const hasLocB = loc && b.location?.toLowerCase().includes(loc);

    const boostA = (hasTagA ? 0.35 : 0) + (hasLocA ? 0.25 : 0);
    const boostB = (hasTagB ? 0.35 : 0) + (hasLocB ? 0.25 : 0);

    const scoreA = 0.6 * (a.sim + boostA) + 0.4 * (a.strength / 100);
    const scoreB = 0.6 * (b.sim + boostB) + 0.4 * (b.strength / 100);
    return scoreB - scoreA;
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Attach Warm Mutual Paths for Top Candidates (LLD §8.1)
  // ─────────────────────────────────────────────────────────────

  const topCandidates = candidates.slice(0, 100);
  const targetIds = topCandidates.map((c) => c.personId);

  if (targetIds.length > 0) {
    try {
      const targetIdList = sql.join(
        targetIds.map((id) => sql`${id}::uuid`),
        sql`, `
      );

      // Find highest weighted mutual person connected to user who also co-occurred with target
      const mutualRowsResult = await db.execute<{
        target_id: string;
        mutual_id: string;
        mutual_name: string;
      }>(sql`
        SELECT DISTINCT ON (target_id)
          sub.target_id,
          sub.mutual_id,
          p_mutual.display_name AS mutual_name
        FROM (
          -- target is b_id, mutual is a_id
          SELECT pe.b_id AS target_id, pe.a_id AS mutual_id, pe.weight, ce.strength
          FROM person_edges pe
          JOIN contact_edges ce ON ce.person_id = pe.a_id AND ce.user_id = ${userId}
          WHERE pe.b_id IN (${targetIdList})
          UNION ALL
          -- target is a_id, mutual is b_id
          SELECT pe.a_id AS target_id, pe.b_id AS mutual_id, pe.weight, ce.strength
          FROM person_edges pe
          JOIN contact_edges ce ON ce.person_id = pe.b_id AND ce.user_id = ${userId}
          WHERE pe.a_id IN (${targetIdList})
        ) sub
        JOIN people p_mutual ON p_mutual.id = sub.mutual_id
        ORDER BY sub.target_id, (0.6 * sub.strength + 0.4 * sub.weight) DESC
      `);

      const mutualRows = Array.isArray(mutualRowsResult)
        ? mutualRowsResult
        : (mutualRowsResult as any)?.rows ?? [];

      const mutualMap = new Map<string, { id: string; name: string }>();
      for (const row of mutualRows as { target_id: string; mutual_id: string; mutual_name: string }[]) {
        mutualMap.set(row.target_id, {
          id: row.mutual_id,
          name: row.mutual_name,
        });
      }

      for (const candidate of topCandidates) {
        candidate.mutual = mutualMap.get(candidate.personId) || null;
      }
    } catch (err) {
      console.warn("Mutual path lookup failed, continuing without mutuals:", err);
    }
  }

  return topCandidates;
}
