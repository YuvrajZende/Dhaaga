/**
 * Phase 4 Comprehensive Test Suite
 * Validates UI, Warm Paths, and Composer components:
 * 1. SSE frame parser (chunking, framing, malformed frames, schema validation)
 * 2. Warm path selection & composite warmth ranking formula
 * 3. Privacy-guarded draft prompt builder & fallback generation
 * 4. mailto: URL builder with RFC compliance
 */

import { parseSSEFrames } from "../src/lib/client/sse-parse";
import {
  compositeWarmth,
  computeScoredMutuals,
  decideWarmPath,
  DIRECT_THRESHOLD,
  type MutualRow,
} from "../src/lib/warmpath/select";
import {
  buildDraftMessages,
  generateFallbackDraft,
  DraftSchema,
  type DraftContext,
} from "../src/lib/warmpath/draft";
import { buildMailto } from "../src/lib/client/mailto";

let passed = 0;
let failed = 0;

export function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
  }
}

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export function runParserTests() {
  console.log("--- P1: SSE frame parser ---");

  const single = parseSSEFrames(frame("stage", { stage: "planning" }));
  assert(
    single.events.length === 1 && single.events[0].type === "stage" && single.rest === "",
    "single stage frame parses"
  );

  const multi = parseSSEFrames(
    frame("stage", { stage: "searches", count: 3 }) +
      frame("done", { timings: { decomposeMs: 1, annMs: 2, rerankMs: 3, totalMs: 6 } })
  );
  assert(
    multi.events.length === 2 && multi.events[1].type === "done",
    "two frames in one chunk parse in order"
  );

  // Split frame held back in rest
  const split = frame("results", {
    searchId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    mode: "full",
    results: [],
  });
  const first = parseSSEFrames(split.slice(0, 30));
  assert(first.events.length === 0 && first.rest.length > 0, "incomplete frame held back in rest");

  const second = parseSSEFrames(first.rest + split.slice(30));
  assert(second.events.length === 1 && second.events[0].type === "results", "frame completes when chunk arrives");

  const malformed = parseSSEFrames(`event: results\ndata: {not json}\n\n` + frame("stage", { stage: "ranking" }));
  assert(malformed.events.length === 1 && malformed.events[0].type === "stage", "malformed JSON frame skipped, others kept");

  const unknown = parseSSEFrames(`event: ping\ndata: {"x":1}\n\n` + frame("stage", { stage: "planning" }));
  assert(unknown.events.length === 1, "unknown event types ignored");

  const badData = parseSSEFrames(frame("results", { searchId: "not-a-uuid", mode: "full", results: [] }));
  assert(badData.events.length === 0, "results with invalid uuid rejected by schema");
}

const mutualRow = (name: string, strength: number, weight: number): MutualRow => ({
  mutualId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  displayName: name,
  avatarUrl: null,
  title: "VP Engineering",
  company: "Stripe",
  primaryEmail: "mutual@example.com",
  userToMutualStrength: strength,
  mutualToTargetWeight: weight,
});

export function runWarmPathTests() {
  console.log("--- P2: warm path ranking ---");

  const recent = new Date().toISOString();
  const m1 = { ...mutualRow("Early", 90, 10), lastEmailAt: recent };
  const m2 = { ...mutualRow("Late", 50, 90), lastEmailAt: null };

  const scoredWithDates = [
    { ...m1, composite: compositeWarmth(m1.userToMutualStrength, m1.mutualToTargetWeight, m1.lastEmailAt) },
    { ...m2, composite: compositeWarmth(m2.userToMutualStrength, m2.mutualToTargetWeight, m2.lastEmailAt) },
  ].sort((a, b) => b.composite - a.composite);

  assert(scoredWithDates[0].displayName === "Early", "recent-contact mutual (composite ~68) outranks weight-only mutual (54)");

  const scored = computeScoredMutuals([m1, m2], null);
  const directWin = decideWarmPath(80, scored);
  assert(directWin.kind === "direct" && directWin.directStrength === 80, `direct edge >= ${DIRECT_THRESHOLD} wins`);

  const mutualWin = decideWarmPath(30, scoredWithDates);
  assert(mutualWin.kind === "mutual" && mutualWin.mutual?.name === "Early", "weak direct edge defers to best mutual");

  const cold = decideWarmPath(null, []);
  assert(cold.kind === "cold" && cold.mutual === null, "no direct edge and no mutuals = cold outreach");

  const weakDirect = decideWarmPath(DIRECT_THRESHOLD - 1, []);
  assert(weakDirect.kind === "cold", "direct edge below threshold is not a warm direct path");
}

const draftCtx: DraftContext = {
  userName: "You",
  target: { name: "Alex Rivera", title: "Co-Founder & CEO", company: "Synthetix AI" },
  mutual: { name: "Sarah Chen", title: "Partner", company: "Benchmark" },
};

export function runDraftTests() {
  console.log("--- P3: draft generation ---");

  const messages = buildDraftMessages(draftCtx);
  const asText = JSON.stringify(messages);
  assert(!asText.includes("@"), "prompt contains no email addresses (FR-E3/FR-H3 privacy guard)");
  assert(asText.includes("Alex Rivera") && asText.includes("Sarah Chen"), "prompt carries share-safe profile facts");

  const cold = buildDraftMessages({ ...draftCtx, mutual: null });
  assert(
    JSON.stringify(cold).includes("self-introduction") || JSON.stringify(cold).toLowerCase().includes("self-intro"),
    "cold path prompts a self-intro instead of an intro request"
  );

  const fallback = generateFallbackDraft(draftCtx);
  assert(DraftSchema.safeParse(fallback).success, "fallback draft satisfies DraftSchema");
  assert(fallback.subject.length > 0 && fallback.body.includes("Sarah"), "fallback draft addresses the mutual");

  const bad = DraftSchema.safeParse({ subject: "", body: "x" });
  assert(!bad.success, "empty subject rejected");

  const mail = buildMailto("sarah@example.com", "Intro to Alex?", "Hi Sarah,\n\nCould you intro me?");
  assert(mail.startsWith("mailto:sarah@example.com?"), "mailto starts with address + ?");
  assert(mail.includes("subject=Intro%20to%20Alex%3F"), "subject encoded (space, ?)");
  assert(mail.includes("body=Hi%20Sarah%2C%0A%0A"), "newlines encoded as %0A");
}

export function runEdgeCaseTests() {
  console.log("--- P4: edge cases & resilience ---");

  // Mailto with symbols and emojis
  const complexMail = buildMailto("founder+ai@domain.io", "Project & Research 🚀", "Let's talk 100%!");
  assert(complexMail.startsWith("mailto:founder+ai@domain.io?"), "mailto starts with email address and ?");
  assert(complexMail.includes("Project%20%26%20Research%20%F0%9F%9A%80"), "ampersand and emojis encoded in subject");
  assert(complexMail.includes("Let's%20talk%20100%25!"), "percent sign encoded in body");

  // Composite warmth boundary values
  const maxWarmth = compositeWarmth(100, 100, new Date().toISOString());
  assert(maxWarmth === 100, "Maximum strength (100) + weight (100) + recent contact = 100");

  const minWarmth = compositeWarmth(0, 0, null);
  assert(minWarmth === 2, "Zero strength + zero weight + null recency decay (0.1) = 2");

  // Cold draft fallback without mutual
  const coldFallback = generateFallbackDraft({ ...draftCtx, mutual: null });
  assert(coldFallback.body.includes("introduce myself"), "Cold fallback presents self-introduction");
  assert(coldFallback.subject.includes("Alex Rivera"), "Cold fallback addresses target by name");
}

async function main() {
  console.log("\n=======================================================");
  console.log("🧪 RUNNING PHASE 4 TEST SUITE");
  console.log("=======================================================\n");

  runParserTests();
  runWarmPathTests();
  runDraftTests();
  runEdgeCaseTests();

  console.log("\n=======================================================");
  console.log(`🏁 PHASE 4: ${passed} PASSED, ${failed} FAILED`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test suite fatal error:", err);
  process.exit(1);
});
