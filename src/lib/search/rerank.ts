/**
 * Candidate Reranking Module (LLD §6.4).
 * Uses OpenRouter LLM to rank top candidates and craft human-readable
 * rationale chips (<=140 chars). Falls back to mathematical scoring
 * (0.7*sim + 0.3*strength/100) when in degraded mode or circuit is open.
 */

import { chatCompletion, extractJson } from "../llm/client";
import { isCircuitOpen, recordFailure, recordSuccess } from "../llm/breaker";
import { Candidate, CandidateCard, QueryIntent } from "./types";
import { z } from "zod";

const RerankItemSchema = z.object({
  id: z.string(),
  rank: z.number().int(),
  relevanceScore: z.number().min(0).max(100).optional(),
  activityMatch: z.number().min(0).max(100).optional(),
  connectionFit: z.number().min(0).max(100).optional(),
  rationale: z.string().max(200),
});

const RerankResponseSchema = z.array(RerankItemSchema);

/**
 * Computes degraded mathematical score and rationale for a candidate.
 * score = 0.7 * sim + 0.3 * (strength / 100)
 */
export function computeFallbackScore(sim: number, strength: number): number {
  return Number((0.7 * sim + 0.3 * (strength / 100)).toFixed(4));
}

/**
 * Generates fallback cards using mathematical scoring formula and extracted intent.
 */
export function generateFallbackCards(
  candidates: Candidate[],
  query: string,
  limit = 20,
  intent?: QueryIntent
): CandidateCard[] {
  const qLower = query.toLowerCase();
  const act = intent?.activity?.toLowerCase();

  const scored = candidates.map((c) => {
    const rawSim = Math.max(0, c.sim);

    // Activity Match Evaluation
    let activityMatch = Math.round(Math.min(99, Math.max(15, (rawSim - 0.12) * 170)));

    const matchingTag = c.tags?.find((t) => {
      const tl = t.toLowerCase();
      if (act && (tl.includes(act) || act.includes(tl))) return true;
      return qLower.includes(tl) || (tl.includes("cook") && qLower.includes("cook"));
    });

    if (matchingTag) {
      activityMatch = Math.max(activityMatch, 92);
    } else if (act && !c.tags?.some((t) => t.toLowerCase().includes(act)) && !c.bio?.toLowerCase().includes(act)) {
      // Penalty if specific activity was requested but not found in profile
      activityMatch = Math.min(activityMatch, 30);
    }

    const loc = intent?.location?.toLowerCase();
    const locMatch = loc && c.location && (c.location.toLowerCase().includes(loc) || loc.includes(c.location.toLowerCase()));

    if (locMatch) {
      activityMatch = Math.min(100, activityMatch + 15);
    } else if (loc && c.location && !c.location.toLowerCase().includes(loc)) {
      // Requested specific location but contact is in a different location
      activityMatch = Math.max(10, activityMatch - 20);
    }

    const connectionFit = Math.min(100, Math.max(20, c.strength));
    const compositeScore = Math.round(0.75 * activityMatch + 0.25 * connectionFit);

    const score = computeFallbackScore(c.sim, c.strength);
    let rationale = `Matched semantic profile · connection strength ${c.strength}/100`;

    if (locMatch && matchingTag) {
      rationale = `Based in ${c.location} · Matches "${matchingTag}" · strength ${c.strength}/100`;
    } else if (locMatch) {
      rationale = `Based in ${c.location} · connection strength ${c.strength}/100`;
    } else if (matchingTag) {
      rationale = `Matches hobby/skill "${matchingTag}" · connection strength ${c.strength}/100`;
    } else if (c.tags && c.tags.length > 0) {
      rationale = `Profile mentions ${c.tags.slice(0, 2).join(", ")} · strength ${c.strength}/100`;
    }

    return {
      personId: c.personId,
      name: c.name,
      title: c.title,
      company: c.company,
      avatarUrl: c.avatarUrl,
      location: c.location || null,
      summary: c.headline,
      strength: c.strength,
      matchScore: compositeScore,
      matchBreakdown: {
        activityMatch,
        connectionFit,
      },
      intent,
      mutual: c.mutual || null,
      viaFriend: c.viaOwnerId ? { id: c.viaOwnerId, name: c.viaOwnerName || "Friend" } : null,
      rationale,
      tags: c.tags,
      score,
    };
  });

  scored.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

  return scored.slice(0, limit).map(({ score: _score, ...card }) => card);
}

function sanitizeForPrompt(text: string | null | undefined, maxLen = 120): string {
  if (!text) return "";
  return text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\\"{}\[\]]/g, " ")
    .replace(/\b(system prompt|ignore all|ignore previous|override|developer mode|leak|reveal)\b/gi, "")
    .trim()
    .slice(0, maxLen);
}

function sanitizeRationale(text: string): string {
  const cleaned = text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\b(system prompt|override|injected|jailbreak|exploit)\b/gi, "")
    .trim()
    .slice(0, 140);
  return cleaned || "Matches network query criteria";
}

/**
 * Reranks top candidates against the user's query and extracted intent.
 * Produces up to 20 candidate cards with personalized rationale chips and match scores.
 */
export async function rerankCandidates(
  candidates: Candidate[],
  query: string,
  limit = 20,
  intent?: QueryIntent
): Promise<{ cards: CandidateCard[]; degraded: boolean }> {
  if (candidates.length === 0) {
    return { cards: [], degraded: false };
  }

  // Only fall back to degraded mathematical ranking if the circuit breaker is actively tripped
  if (await isCircuitOpen()) {
    return {
      cards: generateFallbackCards(candidates, query, limit, intent),
      degraded: true,
    };
  }

  // Strictly exclude private contact notes (bio). Send only share-safe, sanitized attributes.
  const candidateSummaries = candidates.slice(0, 30).map((c) => ({
    id: c.personId,
    name: sanitizeForPrompt(c.name, 80),
    title: sanitizeForPrompt(c.title, 80) || "Unknown",
    company: sanitizeForPrompt(c.company, 80) || "Unknown",
    hobbiesAndSkills:
      Array.isArray(c.tags) && c.tags.length > 0
        ? c.tags.map((t) => sanitizeForPrompt(t, 40)).filter(Boolean).join(", ")
        : undefined,
    connectionStrength: c.strength,
    mutualContact: c.mutual ? sanitizeForPrompt(c.mutual.name, 80) : null,
  }));

  const systemPrompt =
    "You are an intelligent relationship and talent search reranker. " +
    "Given a user's search query, extracted structured intent, and a list of contact candidates (including their titles, companies, hobbies, and skills), " +
    "rank the top candidates who fulfill the user's intent. " +
    "Output ONLY a JSON array of objects: " +
    '[{"id": string, "rank": number, "relevanceScore": number, "activityMatch": number, "connectionFit": number, "rationale": string}]. ' +
    "rank: 1 is the best match. relevanceScore: 0 to 100 percentage. activityMatch: 0 to 100. connectionFit: 0 to 100. " +
    "rationale: Under 140 characters, explaining specifically why this person fits the query (e.g. referencing their specific hobby, skill, or background). " +
    "CRITICAL: If a candidate has NO relevance to the query (for example, the query asks for cooking/chef but the person only plays cricket with no culinary relevance), DO NOT include them in the output! Return at most " +
    limit +
    " items.";

  const sanitizedQuery = sanitizeForPrompt(query, 200);
  const userPrompt = `Search query: "${sanitizedQuery}"\nExtracted Intent: ${JSON.stringify(intent || {})}\n\nCandidates:\n${JSON.stringify(candidateSummaries, null, 2)}`;

  try {
    const raw = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.1 }
    );

    const json = extractJson<unknown>(raw);
    const parsed = RerankResponseSchema.safeParse(json);

    if (parsed.success && parsed.data.length > 0) {
      await recordSuccess();

      const candidateMap = new Map(candidates.map((c) => [c.personId, c]));
      const cards: CandidateCard[] = [];

      for (const item of parsed.data) {
        const c = candidateMap.get(item.id);
        if (!c) continue;

        cards.push({
          personId: c.personId,
          name: c.name,
          title: c.title,
          company: c.company,
          avatarUrl: c.avatarUrl,
          summary: c.headline,
          strength: c.strength,
          matchScore: item.relevanceScore ?? Math.round(c.sim * 100),
          matchBreakdown: {
            activityMatch: item.activityMatch ?? item.relevanceScore,
            connectionFit: item.connectionFit ?? c.strength,
          },
          intent,
          mutual: c.mutual || null,
          viaFriend: c.viaOwnerId ? { id: c.viaOwnerId, name: c.viaOwnerName || "Friend" } : null,
          rationale: sanitizeRationale(item.rationale),
          tags: c.tags,
        });

        if (cards.length >= limit) break;
      }

      if (cards.length > 0) {
        return { cards, degraded: false };
      }
    }
  } catch (err) {
    console.warn(
      "LLM reranking failed, falling back to heuristic scoring:",
      err instanceof Error ? err.message : String(err)
    );
    await recordFailure();
  }

  // Graceful degradation on error or empty response
  return {
    cards: generateFallbackCards(candidates, query, limit, intent),
    degraded: true,
  };
}
