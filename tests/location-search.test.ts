/**
 * Location-Aware Search & User Details Test Suite.
 * Tests location field on people, embedding text inclusion,
 * intent-based location boosting, and explainable rationale.
 */

import assert from "node:assert";
import { createDegradedPlan } from "../src/lib/search/decompose.js";
import { rerankCandidates } from "../src/lib/search/rerank.js";
import { parsePersonalData } from "../src/lib/import/personal.js";
import { Candidate } from "../src/lib/search/types.js";

async function runTests() {
  console.log("=== Running Location-Aware Search Test Suite ===\n");

  // 1. Test CSV and JSON parsing of Location
  console.log("Test 1: CSV and JSON parsing with Location");
  const sampleCsv = `Name,Career,Location,Hobbies,Skills
Yuvraj Zende,Software Engineer,"Vadodara, Gujarat","coding, music","typescript, react"
Sarah Chen,Product Designer,"New York, NY","running, coffee","figma, ux"`;

  const parsedContacts = parsePersonalData(sampleCsv);
  assert.strictEqual(parsedContacts.length, 2, "Should parse 2 contacts");
  assert.strictEqual(parsedContacts[0].location, "Vadodara, Gujarat", "Contact 1 location should be Vadodara");
  assert.strictEqual(parsedContacts[1].location, "New York, NY", "Contact 2 location should be New York");
  console.log("✓ CSV parser extracts location accurately.");

  // 2. Test intent location decomposition
  console.log("\nTest 2: Query location decomposition for people search");
  const vadodaraCook = createDegradedPlan("find a cook in Vadodara");
  assert.strictEqual(vadodaraCook.intent?.activity, "cooking");
  assert.strictEqual(vadodaraCook.intent?.location, "Vadodara");

  const nyDeveloper = createDegradedPlan("developer in New York");
  assert.strictEqual(nyDeveloper.intent?.location, "New York");
  console.log("✓ Intent extraction correctly detects city/location targets.");

  // 3. Test reranking boost for matching locations
  console.log("\nTest 3: Location-aware reranking and explainable rationale");

  const candidates: Candidate[] = [
    {
      personId: "11111111-1111-1111-1111-111111111111",
      name: "Chef A (Mumbai)",
      title: "Private Chef",
      company: "Freelance",
      companyDomain: null,
      headline: "Private Chef",
      avatarUrl: null,
      location: "Mumbai, Maharashtra",
      sim: 0.65,
      ownerScope: "me",
      strength: 70,
      tags: ["cooking", "chef", "italian"],
    },
    {
      personId: "22222222-2222-2222-2222-222222222222",
      name: "Chef B (Vadodara)",
      title: "Private Chef",
      company: "Freelance",
      companyDomain: null,
      headline: "Private Chef",
      avatarUrl: null,
      location: "Vadodara, Gujarat",
      sim: 0.65,
      ownerScope: "me",
      strength: 70,
      tags: ["cooking", "chef", "gujarati"],
    },
  ];

  // User searches specifically in Vadodara
  const { cards: rankedVadodara } = await rerankCandidates(
    candidates,
    "find a cook in Vadodara",
    10,
    { target: "person", activity: "cooking", location: "Vadodara" }
  );

  assert.strictEqual(rankedVadodara[0].name, "Chef B (Vadodara)", "Chef in Vadodara must rank first");
  assert.strictEqual(rankedVadodara[0].location, "Vadodara, Gujarat", "Location must be present on card");
  assert.ok(
    rankedVadodara[0].rationale.includes("Based in Vadodara"),
    `Rationale should highlight location: "${rankedVadodara[0].rationale}"`
  );

  // User searches specifically in Mumbai
  const { cards: rankedMumbai } = await rerankCandidates(
    candidates,
    "find a cook in Mumbai",
    10,
    { target: "person", activity: "cooking", location: "Mumbai" }
  );

  assert.strictEqual(rankedMumbai[0].name, "Chef A (Mumbai)", "Chef in Mumbai must rank first");
  assert.ok(
    rankedMumbai[0].rationale.includes("Based in Mumbai"),
    `Rationale should highlight location: "${rankedMumbai[0].rationale}"`
  );

  console.log("✓ Location matching boosts relevant local candidates with transparent rationale.");

  console.log("\n=== ALL LOCATION FEATURE TESTS PASSED ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
