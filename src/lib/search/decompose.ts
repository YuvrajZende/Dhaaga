/**
 * Query Decomposition Module (LLD §6.2, FR-D6).
 * Translates natural language queries into up to 5 focused sub-searches
 * (semantic and structured) with SHA-256 caching and degraded fallbacks.
 */

import crypto from "crypto";
import { db } from "../db";
import { decompCache, people } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { chatCompletion, extractJson } from "../llm/client";
import { isCircuitOpen, recordFailure, recordSuccess } from "../llm/breaker";
import {
  SubSearchPlan,
  SubSearchPlanSchema,
} from "./types";

/**
 * Normalizes query string and produces deterministic SHA-256 cache key.
 * Lowercases, strips punctuation, collapses whitespace.
 * When userId is provided, scopes the key to the tenant to prevent
 * cross-user disclosure of network grounding domains.
 */
export function computeNormKey(query: string, userId?: string): string {
  const normalized = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const payload = userId ? `u:${userId}|q:${normalized || "empty"}` : normalized || "empty";
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Retrieves the top-20 company domains from the user's network for grounding.
 */
async function getUserTopDomains(userId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({
        domain: people.companyDomain,
        count: sql<number>`count(*)::int`,
      })
      .from(people)
      .where(sql`${people.ownerUserId} = ${userId} AND ${people.companyDomain} IS NOT NULL AND ${people.companyDomain} != ''`)
      .groupBy(people.companyDomain)
      .orderBy(sql`count(*) DESC`)
      .limit(20);

    return rows.map((r) => r.domain!).filter(Boolean);
  } catch (err) {
    console.warn("Failed to fetch top company domains for grounding:", err);
    return [];
  }
}

/**
 * Produces a degraded single-semantic fallback plan if LLM is unavailable or circuit is open.
 */
export function createDegradedPlan(query: string): SubSearchPlan {
  const qLower = query.toLowerCase();

  const isPlaceQuery =
    qLower.includes("restaurant") ||
    qLower.includes("cafe") ||
    qLower.includes("coffee") ||
    qLower.includes("dinner") ||
    qLower.includes("lunch") ||
    qLower.includes("food") ||
    qLower.includes("gym") ||
    qLower.includes("fitness") ||
    qLower.includes("bar") ||
    qLower.includes("pub") ||
    qLower.includes("bistro") ||
    qLower.includes("bakery") ||
    qLower.includes("eatery") ||
    qLower.includes("pizza") ||
    qLower.includes("pasta") ||
    qLower.includes("italian") ||
    qLower.includes("mexican") ||
    qLower.includes("sushi") ||
    qLower.includes("burger") ||
    qLower.includes("vegetarian") ||
    qLower.includes("vegan") ||
    qLower.includes("near me") ||
    qLower.includes("place for") ||
    qLower.includes("where should i eat");

  if (isPlaceQuery) {
    let category: string = "restaurant";
    if (qLower.includes("italian")) category = "Italian restaurant";
    else if (qLower.includes("cafe") || qLower.includes("coffee")) category = "cafe";
    else if (qLower.includes("gym") || qLower.includes("fitness")) category = "gym";
    else if (qLower.includes("vegetarian") || qLower.includes("vegan")) category = "vegetarian restaurant";
    else if (qLower.includes("pizza")) category = "pizza";
    else if (qLower.includes("bar") || qLower.includes("pub")) category = "bar";

    let location: string | null = null;
    if (qLower.includes("vadodara")) location = "Vadodara";
    else if (qLower.includes("mumbai")) location = "Mumbai";
    else if (qLower.includes("soho") || qLower.includes("new york") || qLower.includes("nyc")) location = "New York";
    else if (qLower.includes("near me")) location = "Near me";

    return {
      intent: {
        target: "place",
        activity: null,
        relationship: null,
        category,
        location,
        needsLocation: true,
        availability: null,
        budget: null,
      },
      subSearches: [
        {
          kind: "semantic",
          text: query.trim() || `${category} dining establishment`,
          k: 100,
        },
      ],
    };
  }

  let activity: string | null = null;
  let relationship: string | null = null;

  if (qLower.includes("cook")) activity = "cooking";
  else if (qLower.includes("guitar") || qLower.includes("musician")) activity = "music / guitar";
  else if (qLower.includes("photo")) activity = "photography";
  else if (qLower.includes("engineer") || qLower.includes("developer")) activity = "engineering";

  if (qLower.includes("mate") || qLower.includes("friend")) relationship = "mate";
  else if (qLower.includes("founder")) relationship = "co-founder";

  let personLocation: string | null = null;
  if (qLower.includes("vadodara")) personLocation = "Vadodara";
  else if (qLower.includes("mumbai")) personLocation = "Mumbai";
  else if (qLower.includes("soho") || qLower.includes("new york") || qLower.includes("nyc")) personLocation = "New York";
  else if (qLower.includes("san francisco") || qLower.includes("sf")) personLocation = "San Francisco";
  else if (qLower.includes("bangalore") || qLower.includes("bengaluru")) personLocation = "Bangalore";
  else if (qLower.includes("delhi")) personLocation = "Delhi";

  return {
    intent: {
      target: "person",
      activity,
      relationship,
      category: null,
      location: personLocation,
      needsLocation: Boolean(personLocation),
      availability: null,
      budget: null,
    },
    subSearches: [
      {
        kind: "semantic",
        text: query.trim() || "relevant professional contact",
        k: 400,
      },
    ],
  };
}

/**
 * Decomposes a search query into semantic and structured sub-searches.
 * Checks cache first, invokes LLM with circuit breaker & retry, and caches results.
 */
export async function decomposeQuery(
  userId: string,
  query: string
): Promise<{ plan: SubSearchPlan; fromCache: boolean; degraded: boolean }> {
  const normKey = computeNormKey(query, userId);

  // 1. Check Decomposition Cache (FR-D6)
  try {
    const [cached] = await db
      .select()
      .from(decompCache)
      .where(eq(decompCache.normKey, normKey))
      .limit(1);

    if (cached && cached.plan) {
      const parsed = SubSearchPlanSchema.safeParse(cached.plan);
      if (parsed.success) {
        return { plan: parsed.data, fromCache: true, degraded: false };
      }
    }
  } catch (err) {
    console.warn("Decomp cache read failed, continuing without cache:", err);
  }

  // 2. Check Circuit Breaker
  if (await isCircuitOpen()) {
    console.warn("[Decompose] Circuit breaker is open. Returning degraded plan.");
    return { plan: createDegradedPlan(query), fromCache: false, degraded: true };
  }

  // 3. Grounding: Fetch top domains
  const topDomains = await getUserTopDomains(userId);
  const groundingContext =
    topDomains.length > 0
      ? `\nTop company domains in user's network: ${topDomains.join(", ")}.`
      : "";

  const systemPrompt =
    'You are an expert search planner. Analyze the user query and determine if they are looking for a PERSON (contact, engineer, mate, coworker, freelancer) or a PLACE/SERVICE (restaurant, cafe, gym, salon, local business).\n' +
    'Output ONLY a JSON object with two fields:\n' +
    '1. "intent": {\n' +
    '   "target": "person" | "place",\n' +
    '   "activity": string|null (for person searches: skill/hobby like "cooking", "guitar", "react developer"),\n' +
    '   "relationship": string|null (for person searches: "mate", "friend", "musician", "co-founder"),\n' +
    '   "category": string|null (for place searches: "Italian restaurant", "cafe", "gym", "vegetarian restaurant"),\n' +
    '   "location": string|null (e.g. "Vadodara", "Mumbai", "SoHo", "Near me"),\n' +
    '   "needsLocation": boolean (true if query is a place/service search or mentions location/nearby),\n' +
    '   "availability": string|null,\n' +
    '   "budget": string|null\n' +
    '}\n' +
    '2. "subSearches": array of at most 5 sub-searches.\n' +
    '   - For person: kind="semantic", text=focused description of ideal contact, k<=400; or kind="structured", titleKeywords=[...], scope="me"|"network".\n' +
    '   - For place: kind="semantic", text=focused place query terms (e.g. "Italian handmade pasta authentic dinner"), k<=100.\n' +
    'Examples:\n' +
    'Query: "Best Italian restaurant near me"\n' +
    '{"intent":{"target":"place","category":"Italian restaurant","location":"Near me","needsLocation":true,"activity":null,"relationship":null,"availability":null,"budget":null},"subSearches":[{"kind":"semantic","text":"Italian restaurant handmade pasta authentic dinner","k":100}]}\n\n' +
    'Query: "I need someone who knows React"\n' +
    '{"intent":{"target":"person","activity":"React developer","relationship":"colleague","category":null,"location":null,"needsLocation":false,"availability":null,"budget":null},"subSearches":[{"kind":"semantic","text":"React frontend developer typescript web engineering","k":400},{"kind":"structured","titleKeywords":["React","Frontend"],"scope":"me"}]}';

  const cleanQuery = query
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\\"]/g, " ")
    .replace(/\b(system prompt|ignore all|ignore previous|override|developer mode)\b/gi, "")
    .trim()
    .slice(0, 300);

  const userPrompt = `Search query: "${cleanQuery}"${groundingContext}`;

  // 4. LLM Call with 1 retry
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await chatCompletion([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ], { temperature: 0.1 });

      const json = extractJson<unknown>(raw);
      const validation = SubSearchPlanSchema.safeParse(json);

      if (validation.success) {
        await recordSuccess();

        // Persist to decomp_cache
        try {
          await db
            .insert(decompCache)
            .values({
              normKey,
              plan: validation.data,
              model: process.env.OPENROUTER_MODEL || "openrouter/free",
              createdAt: new Date(),
            })
            .onConflictDoNothing();
        } catch (cacheErr) {
          console.warn("Failed to persist decomp cache:", cacheErr);
        }

        return { plan: validation.data, fromCache: false, degraded: false };
      } else {
        console.warn(`Decomposition attempt ${attempt + 1} validation failed:`, validation.error.message);
      }
    } catch (err) {
      console.warn(`Decomposition attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : String(err));
    }
  }

  // LLM failed after retries -> record failure & degrade
  await recordFailure();
  return { plan: createDegradedPlan(query), fromCache: false, degraded: true };
}
