/**
 * UI-side derivation of "why this matched" evidence and relevance labels.
 *
 * Everything here derives from fields the backend actually returns
 * (CandidateCard.tags / summary / rationale / intent, plus the raw query).
 * Nothing is invented: missing data simply yields fewer rows.
 *
 * Note: the numeric relevance score is a composite ranking signal, NOT a
 * probability. UI copy must never present it as "% match" / certainty.
 */

import { CandidateCard } from "./types";

export interface EvidenceRow {
  title: string;
  detail: string;
}

export type RelevanceTier = "high" | "mid" | "possible" | "low";

export interface RelevanceBucket {
  tier: RelevanceTier;
  label: string;
}

// Results below this threshold render under "More possible matches".
export const LOW_RELEVANCE_THRESHOLD = 40;

const BUCKETS: Array<{ min: number; label: string; tier: RelevanceTier }> = [
  { min: 75, label: "High relevance", tier: "high" },
  { min: 50, label: "Relevant", tier: "mid" },
  { min: 30, label: "Possible match", tier: "possible" },
  { min: 0, label: "Low relevance", tier: "low" },
];

/** Returns null when no score exists (bucket UI hidden, not invented). */
export function relevanceBucket(score?: number): RelevanceBucket | null {
  if (score === undefined || Number.isNaN(score)) return null;
  return BUCKETS.find((b) => score >= b.min) ?? BUCKETS[BUCKETS.length - 1];
}

const STOP_WORDS = new Set([
  "the", "and", "for", "who", "with", "want", "need", "know", "find", "have",
  "has", "had", "was", "were", "are", "you", "your", "person", "people",
  "someone", "anyone", "that", "this", "from", "into", "about", "looking",
  "search", "network", "help", "can", "could", "would", "how", "what", "when",
  "where", "does", "did", "get", "got", "make", "made", "one", "two", "also",
  "i", "a", "an", "of", "in", "on", "to", "at", "by", "or", "is", "it", "my",
]);

/** Meaningful lowercase tokens from a natural-language query. */
export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9+&#]+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

/**
 * Loose term/tag matching — mirrors the backend's degraded-match semantics
 * (substring containment both ways), with a length guard to reduce false
 * positives on short tokens.
 */
function termMatches(term: string, tag: string): boolean {
  if (!term || !tag) return false;
  if (term === tag) return true;
  if (Math.min(term.length, tag.length) < 3) return false;
  return term.includes(tag) || tag.includes(term);
}

/**
 * Tags from the profile that relate to the query / extracted intent.
 * Ordered best-first. Empty when nothing genuinely connects.
 */
export function matchingTags(
  tags: string[] | null | undefined,
  query: string,
  intent?: CandidateCard["intent"]
): string[] {
  if (!tags || tags.length === 0) return [];
  const terms = [...queryTerms(query)];
  if (intent?.activity) terms.unshift(intent.activity.toLowerCase());
  if (terms.length === 0) return [];

  const matched: string[] = [];
  for (const tag of tags) {
    const tl = tag.toLowerCase();
    if (terms.some((t) => termMatches(t, tl))) matched.push(tag);
  }
  return matched;
}

/**
 * "WHY THIS MATCHES" evidence rows for a card, given the query.
 * Falls back to the backend-authored rationale when no tag evidence exists.
 */
export function buildEvidence(
  card: Pick<CandidateCard, "tags" | "summary" | "rationale" | "intent">,
  query: string
): EvidenceRow[] {
  const rows: EvidenceRow[] = [];
  const matched = matchingTags(card.tags, query, card.intent);

  for (const tag of matched.slice(0, 3)) {
    rows.push({ title: tag, detail: "Explicitly listed in profile" });
  }

  const activity = card.intent?.activity?.toLowerCase();
  if (
    activity &&
    activity.length >= 3 &&
    card.summary?.toLowerCase().includes(activity) &&
    !matched.some((t) => termMatches(activity, t.toLowerCase()))
  ) {
    rows.push({ title: card.intent!.activity as string, detail: "Mentioned in profile summary" });
  }

  if (rows.length === 0 && card.rationale) {
    rows.push({ title: card.rationale, detail: "" });
  }

  return rows.slice(0, 3);
}

/**
 * Query-aware tag ordering for the interests row: matched tags first,
 * remaining in profile order, capped for display.
 */
export function prioritizeTags(
  tags: string[] | null | undefined,
  query: string,
  intent?: CandidateCard["intent"],
  limit = 4
): { visible: string[]; hidden: number } {
  const all = Array.isArray(tags) ? tags : [];
  const matched = matchingTags(all, query, intent);
  const rest = all.filter((t) => !matched.includes(t));
  const ordered = [...matched, ...rest];
  return {
    visible: ordered.slice(0, limit),
    hidden: Math.max(0, ordered.length - limit),
  };
}