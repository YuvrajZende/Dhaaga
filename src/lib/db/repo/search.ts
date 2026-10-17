/**
 * Search Repository (LLD §1, §2).
 * Records search audit logs and individual result ranks.
 * Strictly adheres to owner isolation rule (NFR-8).
 */

import { db } from "../index";
import { searches, searchResults } from "../schema";
import { eq, desc } from "drizzle-orm";
import { CandidateCard, SearchMode } from "../../search/types";

export interface RecordSearchInput {
  userId: string;
  queryText: string;
  normKey: string;
  mode: SearchMode;
}

/**
 * Persists a search query audit record.
 */
export async function recordSearch(input: RecordSearchInput): Promise<string> {
  const [created] = await db
    .insert(searches)
    .values({
      userId: input.userId,
      queryText: input.queryText,
      normKey: input.normKey,
      mode: input.mode,
      createdAt: new Date(),
    })
    .returning({ id: searches.id });

  return created.id;
}

/**
 * Persists the ranked results for an executed search.
 */
export async function recordSearchResults(
  searchId: string,
  cards: CandidateCard[]
): Promise<void> {
  if (cards.length === 0) return;

  const rows = cards.map((card, index) => ({
    searchId,
    rank: index + 1,
    personId: card.personId,
    viaOwnerId: card.viaFriend?.id || null,
    mutualPersonId: card.mutual?.id || null,
    score: 1.0 - index * 0.04, // Normalized rank score
    rationale: card.rationale || null,
  }));

  try {
    await db.insert(searchResults).values(rows).onConflictDoNothing();
  } catch (err) {
    console.warn("Failed to persist search results:", err);
  }
}

export async function listRecentSearches(userId: string, limit = 10) {
  return db
    .select({
      id: searches.id,
      queryText: searches.queryText,
      mode: searches.mode,
      createdAt: searches.createdAt,
    })
    .from(searches)
    .where(eq(searches.userId, userId))
    .orderBy(desc(searches.createdAt))
    .limit(limit);
}

