/**
 * Search SSE Streaming Route Handler (LLD §6.5).
 * POST /api/search
 * Body: { query: string, scope?: { friendIds?: string[], groupIds?: string[] } }
 * Returns text/event-stream with progressive choreography:
 * - planning -> searches -> ranking -> results -> done
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { SearchRequestSchema, SearchMode } from "@/lib/search/types";
import { computeNormKey, decomposeQuery } from "@/lib/search/decompose";
import { executeFanout } from "@/lib/search/fanout";
import { rerankCandidates } from "@/lib/search/rerank";
import { createSSESteam } from "@/lib/search/sse";
import { recordSearch, recordSearchResults } from "@/lib/db/repo/search";
import { getSearchableFriendIds } from "@/lib/db/repo/people";

export async function POST(request: NextRequest) {
  // 1. Authenticate user
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = SearchRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.format() },
      { status: 400 }
    );
  }

  const { query, scope } = validation.data;
  const friendIds = await getSearchableFriendIds(user.id, scope?.friendIds ?? []);

  // 3. Initialize SSE Stream
  const { stream, writer } = createSSESteam();

  // 4. Asynchronously process pipeline and stream stages
  (async () => {
    const t0 = performance.now();
    let decomposeMs = 0;
    let annMs = 0;
    let rerankMs = 0;

    try {
      // Stage 1: Planning / Decomposition
      writer.sendStage("planning");
      const dStart = performance.now();
      const { plan, degraded: decompDegraded } = await decomposeQuery(
        user.id,
        query
      );
      decomposeMs = Math.round(performance.now() - dStart);

      const isPlaceSearch =
        validation.data.target === "place" ||
        (validation.data.target !== "person" && plan.intent?.target === "place");

      if (isPlaceSearch) {
        // Stage 2: Finding places
        writer.sendStage("places");
        const pStart = performance.now();

        // Stage 3: Checking circle
        writer.sendStage("circle");

        // Stage 4: Ranking
        writer.sendStage("ranking");
        const { executePlaceSearch } = await import("@/lib/places/search");
        const placeResult = await executePlaceSearch({
          userId: user.id,
          query,
          intent: plan.intent,
          location: validation.data.location,
        });
        const rerankMs = Math.round(performance.now() - pStart);
        const totalMs = Math.round(performance.now() - t0);

        const normKey = computeNormKey(query, user.id);
        const searchId = await recordSearch({
          userId: user.id,
          queryText: query,
          normKey,
          mode: decompDegraded ? "degraded" : "full",
        });

        writer.sendResults(
          searchId,
          decompDegraded ? "degraded" : "full",
          placeResult.cards,
          "place",
          placeResult.resolvedLocation.label,
          placeResult.needsLocationPrompt
        );
        writer.sendDone({
          decomposeMs,
          annMs: 0,
          rerankMs,
          totalMs,
        });
        return;
      }

      // Stage 2: Fanout Sub-searches
      writer.sendStage("searches", plan.subSearches.length);
      const aStart = performance.now();
      const candidates = await executeFanout({
        userId: user.id,
        userEmail: user.email,
        plan,
        friendIds,
        maxCandidates: 1000,
      });
      annMs = Math.round(performance.now() - aStart);

      // Stage 3: Ranking
      writer.sendStage("ranking");
      const rStart = performance.now();
      const { cards, degraded: rerankDegraded } = await rerankCandidates(
        candidates,
        query,
        20,
        plan.intent
      );
      rerankMs = Math.round(performance.now() - rStart);

      const totalMs = Math.round(performance.now() - t0);
      const mode: SearchMode =
        decompDegraded || rerankDegraded ? "degraded" : "full";

      // Persist search audit and ranked result cards
      const normKey = computeNormKey(query, user.id);
      const searchId = await recordSearch({
        userId: user.id,
        queryText: query,
        normKey,
        mode,
      });

      await recordSearchResults(searchId, cards);

      // Stream Results & Completion
      writer.sendResults(searchId, mode, cards, "person");
      writer.sendDone({
        decomposeMs,
        annMs,
        rerankMs,
        totalMs,
      });
    } catch (err) {
      console.error("Search pipeline streaming error:", err);
      writer.sendError(
        "SEARCH_FAILED",
        "An unexpected error occurred while processing your search. Please try again.",
        true
      );
    } finally {
      writer.close();
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
