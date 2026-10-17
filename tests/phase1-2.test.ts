/**
 * Phase 1 & Phase 2 Comprehensive Test Suite
 * Validates functionality and extreme edge cases:
 * - Null / undefined / empty values
 * - Very big values (1MB+ payloads, 10,000+ char strings, extreme numbers)
 * - Negative and invalid numbers (NaN, Infinity)
 * - Temporal edge cases (epoch 0, future dates, invalid date strings)
 * - Corrupted / tampered ciphertexts
 * - Bot / noise filtering and header parsing
 * - Explainable relationship scoring
 * - Canonical edge ordering (a_id < b_id)
 * - Local 384-d embeddings
 */

import { encryptToken, decryptToken } from "../src/lib/auth/crypto";
import {
  canonicalEmail,
  buildDedupKey,
  extractDomain,
  isBlockedPrefix,
  isBulkMessage,
  parseGmailHeaders,
  extractEmailsFromHeader,
  getFilterReason,
} from "../src/lib/sync/dedup";
import {
  computeStrength,
  explainScore,
  mergeSignals,
  recencyDecay,
  type SignalPayload,
} from "../src/lib/sync/scoring";
import { embedText, embedBatch, EMBEDDING_DIM } from "../src/lib/embed/model";

// Simple test runner assertion helper
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

async function runTests() {
  console.log("\n=======================================================");
  console.log("🧪 RUNNING PHASE 1 & 2 TEST SUITE WITH EDGE CASES");
  console.log("=======================================================\n");

  // ─────────────────────────────────────────────────────────────
  // 1. CRYPTO & TOKEN ENCRYPTION (PHASE 1 & 2)
  // ─────────────────────────────────────────────────────────────
  console.log("--- 1. Crypto & Token Encryption Tests ---");

  // Normal string encryption/decryption roundtrip
  const sampleToken = "ya29.a0AfH6SMC_example_oauth_access_token_1234567890";
  const sealed = encryptToken(sampleToken);
  assert(Buffer.isBuffer(sealed), "encryptToken returns a Buffer");
  assert(sealed.length > 28, "Sealed buffer contains IV + Tag + Ciphertext (> 28 bytes)");
  assert(decryptToken(sealed) === sampleToken, "decryptToken roundtrip matches original token");

  // Edge case: Empty string
  const emptySealed = encryptToken("");
  assert(emptySealed.length === 28, "Empty string produces exactly 28 bytes (12 IV + 16 Tag)");
  assert(decryptToken(emptySealed) === "", "Decrypted empty string equals ''");

  // Edge case: Multi-byte unicode and emojis
  const unicodeStr = "Token-🔑-🚀-тест-中文-日本語-!@#$%^&*()_+{}[]:;<>,.?/|~`";
  const unicodeSealed = encryptToken(unicodeStr);
  assert(decryptToken(unicodeSealed) === unicodeStr, "Unicode & emoji token roundtrip matches");

  // Edge case: Very large payload (1 MB string)
  const oneMbString = "A".repeat(1024 * 1024);
  const largeSealed = encryptToken(oneMbString);
  assert(largeSealed.length > 1024 * 1024, "1MB payload encrypted successfully");
  assert(decryptToken(largeSealed) === oneMbString, "1MB payload decrypted correctly without loss");

  // Edge case: Truncated buffer (less than 28 bytes)
  assertThrows(() => decryptToken(Buffer.alloc(20)), "Truncated buffer (<28 bytes) throws Error");
  assertThrows(() => decryptToken(Buffer.alloc(0)), "Zero-length buffer throws Error");

  // Edge case: Corrupted ciphertext (altered 1 byte)
  const corruptedCiphertext = Buffer.from(sealed);
  corruptedCiphertext[corruptedCiphertext.length - 1] ^= 0xff; // Flip bits in ciphertext
  assertThrows(() => decryptToken(corruptedCiphertext), "Corrupted ciphertext fails authentication and throws");

  // Edge case: Corrupted auth tag (altered 1 byte in bytes 12..27)
  const corruptedTag = Buffer.from(sealed);
  corruptedTag[15] ^= 0x01; // Flip bit in auth tag
  assertThrows(() => decryptToken(corruptedTag), "Tampered auth tag fails authentication and throws");

  // Edge case: Corrupted IV (altered 1 byte in bytes 0..11)
  const corruptedIv = Buffer.from(sealed);
  corruptedIv[3] ^= 0x01; // Flip bit in IV
  assertThrows(() => decryptToken(corruptedIv), "Tampered IV fails authentication and throws");

  // Edge case: null / undefined input
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assertThrows(() => encryptToken(null as any), "encryptToken(null) throws TypeError");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assertThrows(() => decryptToken(null as any), "decryptToken(null) throws TypeError");

  // ─────────────────────────────────────────────────────────────
  // 2. DEDUPLICATION & CANONICALIZATION (PHASE 2)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- 2. Deduplication & Canonicalization Tests ---");

  // Normal Gmail alias stripping
  assert(
    canonicalEmail("John.Doe+newsletter@gmail.com") === "johndoe@gmail.com",
    "Gmail +tag and dots are stripped"
  );
  assert(
    canonicalEmail("FOO.BAR+promo@GOOGLEMAIL.COM") === "foobar@gmail.com",
    "Googlemail is normalized to gmail.com and dots/tags stripped"
  );

  // Corporate email (non-gmail) keeps dots, strips +tag
  assert(
    canonicalEmail("Jane.Smith+work@acme-corp.com") === "jane.smith@acme-corp.com",
    "Non-gmail keeps dots in local part but strips +tag"
  );

  // Edge case: null / undefined / empty string
  assert(canonicalEmail(null) === "", "canonicalEmail(null) returns empty string");
  assert(canonicalEmail(undefined) === "", "canonicalEmail(undefined) returns empty string");
  assert(canonicalEmail("") === "", "canonicalEmail('') returns empty string");
  assert(canonicalEmail("   ") === "", "canonicalEmail('   ') returns empty string");

  // Edge case: Malformed emails
  assert(canonicalEmail("noatsign") === "noatsign", "Email without @ returned safe");
  assert(canonicalEmail("@nodomain") === "@nodomain", "Email missing local returned safe");
  assert(canonicalEmail("user@") === "user@", "Email missing domain returned safe");

  // Edge case: Very large email (10,000 characters)
  const hugeEmail = "user." + "a".repeat(10000) + "@gmail.com";
  const canonHuge = canonicalEmail(hugeEmail);
  assert(typeof canonHuge === "string" && canonHuge.length > 0, "10,000 char email handled without crashing");

  // Dedup key creation
  assert(
    buildDedupKey("Alice@Gmail.com", "Alice Smith") === "alice@gmail.com",
    "buildDedupKey prioritizes canonical email"
  );
  assert(
    buildDedupKey(null, "Bob   Jones", "example.com") === "n:bob jones@example.com",
    "buildDedupKey falls back to n:normalized_name@domain when email is null"
  );
  assert(
    buildDedupKey(null, null, null) === "n:unknown@unknown",
    "buildDedupKey handles all nulls safely"
  );

  // Domain extraction
  assert(extractDomain("test@sub.example.com") === "sub.example.com", "extractDomain extracts correctly");
  assert(extractDomain(null) === "", "extractDomain(null) returns empty string");
  assert(extractDomain("invalid-email") === "", "extractDomain with no @ returns empty string");

  // ─────────────────────────────────────────────────────────────
  // 3. NOISE & BULK FILTERING (PHASE 2)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- 3. Noise & Bulk Filtering Tests ---");

  // Blocked sender prefixes
  assert(isBlockedPrefix("noreply@company.com"), "noreply@ is blocked");
  assert(isBlockedPrefix("no-reply@domain.org"), "no-reply@ is blocked");
  assert(isBlockedPrefix("billing-alerts@service.com"), "billing-alerts@ is blocked");
  assert(isBlockedPrefix("notifications.daily@app.com"), "notifications.daily@ is blocked");
  assert(isBlockedPrefix("newsletter@tech.io"), "newsletter@ is blocked");
  assert(isBlockedPrefix("support@helpdesk.com"), "support@ is blocked");

  // Legitimate senders should NOT be blocked (avoid false positives)
  assert(!isBlockedPrefix("notable.author@domain.com"), "notable@ is NOT blocked");
  assert(!isBlockedPrefix("alicia@domain.com"), "alicia@ is NOT blocked");
  assert(!isBlockedPrefix("alex.turner@company.com"), "alex.turner@ is NOT blocked");

  // Edge case: null / undefined / empty
  assert(!isBlockedPrefix(null), "isBlockedPrefix(null) returns false");
  assert(!isBlockedPrefix(""), "isBlockedPrefix('') returns false");

  // Bulk headers
  assert(isBulkMessage({ "list-unsubscribe": "<mailto:unsub@domain.com>" }), "List-Unsubscribe triggers bulk");
  assert(isBulkMessage({ precedence: "bulk" }), "Precedence: bulk triggers bulk");
  assert(isBulkMessage({ precedence: "list" }), "Precedence: list triggers bulk");
  assert(isBulkMessage({ "auto-submitted": "auto-generated" }), "Auto-Submitted triggers bulk");
  assert(!isBulkMessage({ precedence: "personal" }), "Normal message is not bulk");
  assert(!isBulkMessage({}), "Empty headers is not bulk");

  // Filter reason audit
  const reason1 = getFilterReason("noreply@github.com", {});
  assert(reason1 !== null && reason1.includes("Blocked sender prefix"), "Audit records prefix reason");
  const reason2 = getFilterReason("user@gmail.com", { "list-unsubscribe": "<url>" });
  assert(reason2 !== null && reason2.includes("List-Unsubscribe"), "Audit records unsubscribe reason");
  assert(getFilterReason("friend@work.com", {}) === null, "Legitimate email has null filter reason");

  // Header parsing & email extraction
  const headers = parseGmailHeaders([
    { name: "From", value: "CEO <ceo@startup.io>" },
    { name: "To", value: "Alice <alice@work.com>, Bob <bob@work.com>" },
  ]);
  assert(headers["from"] === "CEO <ceo@startup.io>", "parseGmailHeaders lowercases header names");
  const extracted = extractEmailsFromHeader(headers["to"]);
  assert(extracted.includes("alice@work.com") && extracted.includes("bob@work.com"), "extractEmailsFromHeader extracts all recipients");

  // Edge case: 1,000 recipients in header
  const manyRecipients = Array.from({ length: 1000 }, (_, i) => `user${i}@test.com`).join(", ");
  const extractedMany = extractEmailsFromHeader(manyRecipients);
  assert(extractedMany.length === 1000, "1,000 recipients extracted without error");

  // ─────────────────────────────────────────────────────────────
  // 4. RELATIONSHIP SCORING & EXPLAINABILITY (PHASE 2)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- 4. Relationship Scoring & Explainability Tests ---");

  // Deterministic baseline score
  const recentDate = new Date().toISOString();
  const baseSignal: SignalPayload = {
    emailCount: 25,
    lastEmailAt: recentDate,
    meetingCount: 8,
    lastMeetingAt: recentDate,
    sourcesPresent: ["contacts", "gmail", "calendar"],
    directToRatio: 0.5,
    directInteractions: 15,
    ccInteractions: 10,
  };

  const perfectScore = computeStrength(baseSignal);
  assert(perfectScore === 100, `Perfect signal achieves max score 100 (got ${perfectScore})`);

  // Explainability check
  const explanation = explainScore(baseSignal);
  assert(explanation.strength === 100, "explainScore strength matches computeStrength");
  assert(explanation.breakdown.emailScore === 40, "emailScore breakdown is 40");
  assert(explanation.breakdown.meetingScore === 30, "meetingScore breakdown is 30");
  assert(explanation.breakdown.sourceScore === 20, "sourceScore breakdown is 20 (max 2 sources capped at 20)");
  assert(explanation.breakdown.directnessBonus === 10, "directnessBonus is 10");
  assert(explanation.explanation.includes("Score 100/100 based on:"), "Human-readable explanation produced");

  // Edge case: All null / zero signals
  const zeroSignal: SignalPayload = {
    emailCount: 0,
    lastEmailAt: null,
    meetingCount: 0,
    lastMeetingAt: null,
    sourcesPresent: [],
    directToRatio: 0,
  };
  const zeroScore = computeStrength(zeroSignal);
  assert(zeroScore === 0, "Zero signals produce strength 0");
  const zeroExplanation = explainScore(zeroSignal);
  assert(zeroExplanation.explanation.includes("No recorded interactions yet"), "Zero explanation is descriptive");

  // Edge case: Extreme numbers (1,000,000 interactions)
  const hugeSignal: SignalPayload = {
    emailCount: 1_000_000,
    lastEmailAt: recentDate,
    meetingCount: 500_000,
    lastMeetingAt: recentDate,
    sourcesPresent: ["contacts", "gmail"],
    directToRatio: 1.0,
  };
  assert(computeStrength(hugeSignal) === 100, "1M interactions cleanly saturate at 100 without overflow");

  // Edge case: Negative numbers & NaN & Infinity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weirdSignal: any = {
    emailCount: -50,
    lastEmailAt: null,
    meetingCount: NaN,
    lastMeetingAt: null,
    sourcesPresent: null,
    directToRatio: -0.5,
  };
  const weirdScore = computeStrength(weirdSignal);
  assert(!isNaN(weirdScore) && weirdScore >= 0 && weirdScore <= 100, "Negative / NaN counts safely produce valid score (not NaN)");

  // Edge case: Future dates (recency decay must NOT blow up exponentially)
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const futureDecay = recencyDecay(futureDate);
  assert(futureDecay === 1.0, "Future date decay is capped at 1.0 (no runaway multiplier)");

  // Edge case: Epoch 0 date and very old dates (must floor at 0.1)
  const epochDate = "1970-01-01T00:00:00Z";
  const epochDecay = recencyDecay(epochDate);
  assert(epochDecay === 0.1, "Epoch 0 decay floors at 0.1");

  // Edge case: Invalid date string ("not-a-date")
  const invalidDecay = recencyDecay("not-a-date");
  assert(invalidDecay === 0.1, "Invalid date string safely returns 0.1 rather than NaN");

  // Signal merging
  const signalA: Partial<SignalPayload> = {
    emailCount: 10,
    lastEmailAt: "2026-01-01T00:00:00Z",
    sourcesPresent: ["gmail"],
    directToRatio: 0.2,
  };
  const signalB: Partial<SignalPayload> = {
    emailCount: 15,
    lastEmailAt: "2026-06-01T00:00:00Z",
    meetingCount: 3,
    lastMeetingAt: "2026-05-01T00:00:00Z",
    sourcesPresent: ["calendar", "gmail"],
    directToRatio: 0.8,
  };
  const merged = mergeSignals(signalA, signalB);
  assert(merged.emailCount === 25, "mergeSignals sums email counts (10 + 15 = 25)");
  assert(merged.lastEmailAt === "2026-06-01T00:00:00Z", "mergeSignals picks the later date");
  assert(merged.sourcesPresent.length === 2, "mergeSignals deduplicates sourcesPresent ['gmail', 'calendar']");
  assert(merged.meetingCount === 3, "mergeSignals incorporates new meeting count");

  // ─────────────────────────────────────────────────────────────
  // 5. CANONICAL PERSON EDGES (a_id < b_id) (PHASE 2)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- 5. Canonical Person Edges Ordering (a_id < b_id) ---");

  function canonicalEdgePair(id1: string, id2: string): [string, string] {
    return id1 < id2 ? [id1, id2] : [id2, id1];
  }

  const uuid1 = "11111111-1111-1111-1111-111111111111";
  const uuid2 = "22222222-2222-2222-2222-222222222222";

  const [a1, b1] = canonicalEdgePair(uuid1, uuid2);
  const [a2, b2] = canonicalEdgePair(uuid2, uuid1);

  assert(a1 === uuid1 && b1 === uuid2, "Pair (uuid1, uuid2) ordered as a < b");
  assert(a2 === uuid1 && b2 === uuid2, "Pair (uuid2, uuid1) correctly canonicalized to same (uuid1, uuid2)");
  assert(a1 < b1 && a2 < b2, "Enforces strict ordering constraint a_id < b_id");

  // Thread participant count threshold (<= 8 participants)
  function shouldCreateCoOccurrence(participants: string[]): boolean {
    return participants.length >= 2 && participants.length <= 8;
  }
  assert(shouldCreateCoOccurrence(["a", "b"]), "2 participants eligible for co-occurrence edge");
  assert(shouldCreateCoOccurrence(["1", "2", "3", "4", "5", "6", "7", "8"]), "8 participants eligible");
  assert(!shouldCreateCoOccurrence(["1", "2", "3", "4", "5", "6", "7", "8", "9"]), "9 participants ignored (>8)");
  assert(!shouldCreateCoOccurrence(["only-one"]), "1 participant ignored (<2)");

  // ─────────────────────────────────────────────────────────────
  // 6. LOCAL EMBEDDING PIPELINE (PHASE 1 & 2)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- 6. Local Embedding Pipeline Tests ---");

  console.log("  Loading local ONNX model (all-MiniLM-L6-v2)...");
  const testText = "Senior Software Engineer at Google working on distributed systems";
  const embedding = await embedText(testText);

  assert(Array.isArray(embedding), "embedText returns array");
  assert(embedding.length === EMBEDDING_DIM, `Embedding dimension is exactly ${EMBEDDING_DIM}`);

  // Check L2 normalization (sum of squares ~ 1.0)
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  assert(Math.abs(norm - 1.0) < 0.01, `Embedding is L2 normalized (norm = ${norm.toFixed(4)})`);

  // Edge case: Empty / null / whitespace text
  const emptyEmb = await embedText("");
  assert(emptyEmb.length === EMBEDDING_DIM, "Empty string produces valid 384-d vector");

  const whitespaceEmb = await embedText("   \n\t  ");
  assert(whitespaceEmb.length === EMBEDDING_DIM, "Whitespace string produces valid 384-d vector");

  // Edge case: Very large text (10,000+ characters)
  const hugeBio = "Jane Doe is a researcher in AI. ".repeat(400);
  const hugeEmb = await embedText(hugeBio);
  assert(hugeEmb.length === EMBEDDING_DIM, "10,000+ character bio embedded safely with truncation");

  // Batch embedding
  const batchTexts = [
    "Product Manager at Stripe",
    "Founder & CEO at Seed Stage YC Startup",
    "Venture Capital Partner at Sequoia",
  ];
  const batchResults = await embedBatch(batchTexts);
  assert(batchResults.length === 3, "embedBatch returns 3 vectors for 3 inputs");
  assert(batchResults[0].length === EMBEDDING_DIM && batchResults[1].length === EMBEDDING_DIM, "All batch vectors are 384 dimensions");

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log("\n=======================================================");
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
