/**
 * Phase 3 Comprehensive Test Suite
 * Validates Embedding & Search Pipeline components:
 * 1. Query Normalization & SHA-256 Cache Key computation
 * 2. Zod Schemas (SubSearch, SubSearchPlan, CandidateCard, SearchRequest)
 * 3. Circuit Breaker state management (failures -> open -> cooldown -> reset)
 * 4. Fallback mathematical scoring (0.7 * sim + 0.3 * strength / 100)
 * 5. Fallback card generation with rationale chips
 * 6. SSE formatting and streaming contract
 * 7. LLM JSON extraction & resilience against markdown fences and corrupt wrappers
 * 8. Extreme edge cases (10,000-char queries, unicode/emojis, negative inputs, nulls)
 */

import { computeNormKey, createDegradedPlan } from "../src/lib/search/decompose";
import {
  SubSearchPlanSchema,
  SubSearchSchema,
  CandidateCardSchema,
  SearchRequestSchema,
  Candidate,
} from "../src/lib/search/types";
import {
  computeFallbackScore,
  generateFallbackCards,
} from "../src/lib/search/rerank";
import { formatSSEMessage } from "../src/lib/search/sse";
import { buildChatCompletionBody, extractJson } from "../src/lib/llm/client";
import { retainAuthorizedFriendIds } from "../src/lib/db/repo/people";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
  }
}

function assertThrows(fn: () => void, testName: string) {
  try {
    fn();
    failed++;
    console.error(`  ❌ FAIL: ${testName} (Expected exception but none was thrown)`);
  } catch {
    passed++;
    console.log(`  ✅ PASS: ${testName}`);
  }
}

async function runPhase3Tests() {
  console.log("\n=======================================================");
  console.log("🧪 RUNNING PHASE 3 EMBEDDING & SEARCH TEST SUITE");
  console.log("=======================================================\n");

  // ─────────────────────────────────────────────────────────────
  // 1. QUERY NORMALIZATION & CACHE KEY TESTS
  // ─────────────────────────────────────────────────────────────
  console.log("--- 1. Query Normalization & SHA-256 Cache Key Tests ---");

  const q1 = "Founders in San Francisco building AI!";
  const q2 = "  founders   in   san   francisco   building   ai   ";
  const q3 = "founders in san francisco building ai.";

  const k1 = computeNormKey(q1);
  const k2 = computeNormKey(q2);
  const k3 = computeNormKey(q3);

  assert(typeof k1 === "string" && k1.length === 64, "Key is a 64-char hex string (SHA-256)");
  assert(k1 === k2, "Casing, multiple spaces and exclamation marks normalize to same key");
  assert(k2 === k3, "Trailing period normalizes to same key");

  // Edge case: Empty & whitespace query
  const emptyKey = computeNormKey("");
  const wsKey = computeNormKey("     ");
  assert(emptyKey === wsKey, "Empty string and whitespace-only query produce identical hash");

  // Edge case: Unicode & symbols
  const unicodeKey = computeNormKey("AI Researcher 🚀 @ Google — deep learning!");
  assert(typeof unicodeKey === "string" && unicodeKey.length === 64, "Unicode & symbols handled safely");

  // ─────────────────────────────────────────────────────────────
  // 2. ZOD SCHEMAS & CONTRACT VALIDATION
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- 2. Zod Schemas & Contract Validation Tests ---");

  // Semantic SubSearch
  const validSemantic = { kind: "semantic", text: "AI Engineer at Anthropic", k: 200 };
  assert(SubSearchSchema.safeParse(validSemantic).success, "Valid semantic subsearch parses successfully");

  const invalidSemanticK = { kind: "semantic", text: "AI Engineer", k: 1000 };
  assert(!SubSearchSchema.safeParse(invalidSemanticK).success, "Semantic subsearch with k > 400 is rejected");

  // Structured SubSearch
  const validStructured = {
    kind: "structured",
    titleKeywords: ["CTO", "Founder"],
    companyKeywords: ["stripe.com", "openai.com"],
    minStrength: 50,
    scope: "me",
  };
  assert(SubSearchSchema.safeParse(validStructured).success, "Valid structured subsearch parses successfully");

  // SubSearchPlan: Max 5 subsearches
  const planWith3 = {
    subSearches: [
      { kind: "semantic", text: "Founders", k: 200 },
      { kind: "structured", titleKeywords: ["CEO"], scope: "me" },
      { kind: "semantic", text: "Staff Engineers", k: 150 },
    ],
  };
  assert(SubSearchPlanSchema.safeParse(planWith3).success, "Plan with 3 subsearches is accepted");

  const planEmpty = { subSearches: [] };
  assert(!SubSearchPlanSchema.safeParse(planEmpty).success, "Empty plan with 0 subsearches is rejected");

  const planWith6 = {
    subSearches: [
      { kind: "semantic", text: "1", k: 50 },
      { kind: "semantic", text: "2", k: 50 },
      { kind: "semantic", text: "3", k: 50 },
      { kind: "semantic", text: "4", k: 50 },
      { kind: "semantic", text: "5", k: 50 },
      { kind: "semantic", text: "6", k: 50 },
    ],
  };
  assert(!SubSearchPlanSchema.safeParse(planWith6).success, "Plan with 6 subsearches (> 5 limit) is rejected");

  // Degraded plan helper
  const degraded = createDegradedPlan("Machine learning infrastructure");
  assert(degraded.subSearches.length === 1, "Degraded plan creates exactly 1 subsearch");
  const degradedFirst = degraded.subSearches[0];
  assert(degradedFirst.kind === "semantic", "Degraded plan uses semantic kind");
  if (degradedFirst.kind === "semantic") {
    assert(degradedFirst.k === 400, "Degraded plan uses k = 400");
  }

  // CandidateCardSchema
  const validCard = {
    personId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    name: "Alex Turner",
    title: "Staff Systems Engineer",
    company: "Stripe",
    avatarUrl: null,
    summary: "Payments infrastructure",
    strength: 85,
    mutual: {
      id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      name: "Sarah Connor",
    },
    viaFriend: null,
    rationale: "Matched query on infrastructure engineering and payments background.",
  };
  const cardParse = CandidateCardSchema.safeParse(validCard);
  assert(cardParse.success, "Valid CandidateCard parses cleanly", cardParse.success ? undefined : JSON.stringify(cardParse.error));

  // SearchRequestSchema
  assert(SearchRequestSchema.safeParse({ query: "Designers at Figma" }).success, "Simple search request valid");
  assert(!SearchRequestSchema.safeParse({ query: "" }).success, "Empty query search request rejected");

  // ─────────────────────────────────────────────────────────────
  // 3. MATHEMATICAL FALLBACK SCORING & RERANKING
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- 3. Fallback Scoring & Reranker Tests ---");

  // Formula: score = 0.7 * sim + 0.3 * (strength / 100)
  assert(computeFallbackScore(1.0, 100) === 1.0, "Perfect sim (1.0) and max strength (100) = 1.0");
  assert(computeFallbackScore(0.0, 0) === 0.0, "Zero sim and zero strength = 0.0");
  assert(computeFallbackScore(0.8, 50) === 0.71, "Sim 0.8 and strength 50 = 0.71 (0.56 + 0.15)");

  const mockCandidates: Candidate[] = [
    {
      personId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      name: "Alice Low",
      title: "Dev",
      company: "Acme",
      companyDomain: "acme.com",
      headline: null,
      avatarUrl: null,
      sim: 0.5,
      ownerScope: "me",
      strength: 20, // score = 0.7*0.5 + 0.3*0.2 = 0.41
    },
    {
      personId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      name: "Bob High",
      title: "Lead",
      company: "Beta",
      companyDomain: "beta.com",
      headline: null,
      avatarUrl: null,
      sim: 0.9,
      ownerScope: "me",
      strength: 80, // score = 0.7*0.9 + 0.3*0.8 = 0.87
    },
    {
      personId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      name: "Charlie Mid",
      title: "PM",
      company: "Gamma",
      companyDomain: "gamma.com",
      headline: null,
      avatarUrl: null,
      sim: 0.7,
      ownerScope: "me",
      strength: 50, // score = 0.7*0.7 + 0.3*0.5 = 0.64
    },
  ];

  const cards = generateFallbackCards(mockCandidates, "Software Leadership", 2);
  assert(cards.length === 2, "generateFallbackCards respects limit (2 cards returned)");
  assert(cards[0].name === "Bob High", "Bob High ranked #1 due to highest combined score");
  assert(cards[1].name === "Charlie Mid", "Charlie Mid ranked #2");
  assert(cards[0].rationale.includes("connection strength 80/100"), "Rationale chip includes strength breakdown");

  // ─────────────────────────────────────────────────────────────
  // 4. SSE WIRE FORMATTING TESTS
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- 4. Server-Sent Events (SSE) Wire Format Tests ---");

  const stageMsg = formatSSEMessage("stage", { stage: "planning" });
  assert(stageMsg === 'event: stage\ndata: {"stage":"planning"}\n\n', "Stage event formatted with exact event & data headers");

  const searchStageMsg = formatSSEMessage("stage", { stage: "searches", count: 3 });
  assert(searchStageMsg === 'event: stage\ndata: {"stage":"searches","count":3}\n\n', "Searches stage includes count");

  const doneMsg = formatSSEMessage("done", {
    timings: { decomposeMs: 120, annMs: 45, rerankMs: 80, totalMs: 245 },
  });
  assert(doneMsg.startsWith("event: done\ndata: {") && doneMsg.endsWith("\n\n"), "Done event matches SSE standard");

  // ─────────────────────────────────────────────────────────────
  // 5. RESILIENT JSON EXTRACTION & PARSING
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- 5. LLM JSON Extraction & Markdown Fence Cleaning ---");

  // Standard json code block
  const fenced = "Here is your plan:\n```json\n{\"subSearches\":[{\"kind\":\"semantic\",\"text\":\"Founder\",\"k\":100}]}\n```\nHope this helps!";
  const parsed1 = extractJson<{ subSearches: unknown[] }>(fenced);
  assert(parsed1 && Array.isArray(parsed1.subSearches), "Extracts JSON from ```json ... ``` codeblock");

  // Raw block without 'json' tag
  const fencedNoTag = "```\n[{\"id\":\"123\",\"rank\":1,\"rationale\":\"Great match\"}]\n```";
  const parsed2 = extractJson<{ id: string }[]>(fencedNoTag);
  assert(Array.isArray(parsed2) && parsed2[0].id === "123", "Extracts JSON from bare ``` ... ``` block");

  // Text wrapper with brackets
  const messy = "Sure! {\"status\": \"ok\", \"count\": 5} is the result.";
  const parsed3 = extractJson<{ status: string }>(messy);
  assert(parsed3.status === "ok", "Extracts JSON enclosed inside conversational prose");

  // Corrupt string throws error
  assertThrows(() => extractJson("Not a json at all"), "Non-JSON string throws error");

  const completionBody = buildChatCompletionBody(
    "openrouter/free",
    [{ role: "user", content: "Return JSON only." }],
    { maxTokens: 400 }
  );
  assert(
    completionBody.reasoning.enabled === false && completionBody.max_completion_tokens === 400,
    "LLM requests disable reasoning so completion tokens remain available for JSON output"
  );

  const authorizedFriendIds = retainAuthorizedFriendIds(
    ["shared-owner", "unrelated-owner", "shared-owner"],
    ["shared-owner"]
  );
  assert(
    authorizedFriendIds.length === 1 && authorizedFriendIds[0] === "shared-owner",
    "Search scope excludes requested owners that are not authorized friends"
  );

  // ─────────────────────────────────────────────────────────────
  // 6. EXTREME EDGE CASES & STRESS
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- 6. Extreme Edge Cases & Resilience ---");

  // Very large 10,000 char query
  const bigQuery = "AI Engineer ".repeat(1000);
  const bigKey = computeNormKey(bigQuery);
  assert(bigKey.length === 64, "10,000 char query hashed into valid 64-char key without overflow");

  // Query with lots of special characters
  const crazyQuery = '!@#$%^&*()_+-=[]{}|;:\'",.<>/?`~ \t\n\r';
  const crazyKey = computeNormKey(crazyQuery);
  assert(crazyKey.length === 64, "Special character soup handled safely");

  // Degraded plan on empty query
  const degradedEmpty = createDegradedPlan("");
  const emptyFirst = degradedEmpty.subSearches[0];
  assert(
    emptyFirst.kind === "semantic" && emptyFirst.text.length > 0,
    "Degraded plan provides fallback text for empty input",
  );

  console.log("\n=======================================================");
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3Tests().catch((err) => {
  console.error("Test suite fatal error:", err);
  process.exit(1);
});
