/**
 * Warm path selection (LLD §8.1, FR-E1).
 * Pure ranking + thin IO. Recency term uses recencyDecay on the mutual's
 * lastEmailAt when provided; the IO path passes null (constant +2 offset,
 * does not affect ordering — same order as findMutualConnections).
 */
import { db } from "../db";
import { contactEdges } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { findMutualConnections } from "../db/repo/edges";
import { recencyDecay } from "../sync/scoring";

export const DIRECT_THRESHOLD = 60;

export interface MutualRow {
  mutualId: string;
  displayName: string;
  avatarUrl: string | null;
  title: string | null;
  company: string | null;
  primaryEmail: string | null;
  userToMutualStrength: number;
  mutualToTargetWeight: number;
}

export interface ScoredMutual extends MutualRow {
  lastEmailAt: string | null;
  composite: number;
}

export interface WarmPathMutual {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  avatarUrl: string | null;
  email: string | null;
  strength: number;
  weight: number;
  composite: number;
}

export interface WarmPathDecision {
  kind: "direct" | "mutual" | "cold";
  directStrength: number | null;
  mutual: WarmPathMutual | null;
}

export function compositeWarmth(
  strength: number,
  weight: number,
  lastEmailAt: string | null
): number {
  return Number((0.5 * strength + 0.3 * weight + 20 * recencyDecay(lastEmailAt)).toFixed(2));
}

export function computeScoredMutuals(
  rows: MutualRow[],
  lastEmailAt: string | null = null
): ScoredMutual[] {
  return rows
    .map((r) => ({
      ...r,
      lastEmailAt,
      composite: compositeWarmth(r.userToMutualStrength, r.mutualToTargetWeight, lastEmailAt),
    }))
    .sort((a, b) => b.composite - a.composite);
}

export function decideWarmPath(
  directStrength: number | null,
  mutuals: ScoredMutual[]
): WarmPathDecision {
  if (directStrength !== null && directStrength >= DIRECT_THRESHOLD) {
    return { kind: "direct", directStrength, mutual: null };
  }
  const best = mutuals[0];
  if (!best) return { kind: "cold", directStrength, mutual: null };
  return {
    kind: "mutual",
    directStrength,
    mutual: {
      id: best.mutualId,
      name: best.displayName,
      title: best.title,
      company: best.company,
      avatarUrl: best.avatarUrl,
      email: best.primaryEmail,
      strength: best.userToMutualStrength,
      weight: best.mutualToTargetWeight,
      composite: best.composite,
    },
  };
}

export async function selectWarmPath(
  userId: string,
  targetPersonId: string
): Promise<WarmPathDecision> {
  const [direct] = await db
    .select({ strength: contactEdges.strength })
    .from(contactEdges)
    .where(and(eq(contactEdges.userId, userId), eq(contactEdges.personId, targetPersonId)))
    .limit(1);

  const mutualRows = await findMutualConnections(userId, targetPersonId);
  return decideWarmPath(direct?.strength ?? null, computeScoredMutuals(mutualRows));
}
