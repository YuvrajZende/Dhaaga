/**
 * Unit & Integration Test Suite for Imports (Phase 5).
 * Tests CSV parser, LinkedIn mapper, X archive parser, and import scoring.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseCSV } from "../src/lib/import/parse-csv";
import { mapLinkedInRows } from "../src/lib/import/linkedin";
import { parseXArchive } from "../src/lib/import/xarchive";
import { parseInstagramExport } from "../src/lib/import/instagram";
import { parseFacebookExport } from "../src/lib/import/facebook";
import { computeStrength, explainScore } from "../src/lib/sync/scoring";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, details?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`, details !== undefined ? details : "");
  }
}

export function runCSVParserTests() {
  console.log("\n--- 1. CSV Parser Tests ---");

  // Simple unquoted
  const simple = parseCSV("a,b,c\n1,2,3");
  assert(simple.length === 2 && simple[0][1] === "b" && simple[1][2] === "3", "parses simple unquoted CSV");

  // Quoted fields with commas
  const quoted = parseCSV('name,company\n"Sarah Chen","Benchmark Capital, LLC"');
  assert(quoted.length === 2 && quoted[1][1] === "Benchmark Capital, LLC", "parses quoted field with commas");

  // Escaped quotes inside quotes ("")
  const escaped = parseCSV('id,title\n1,"Principal ""Design"" Lead"');
  assert(escaped[1][1] === 'Principal "Design" Lead', 'handles escaped double quotes ("")');

  // Newlines inside quotes
  const multiline = parseCSV('name,bio\n"Bob","Line 1\nLine 2"');
  assert(multiline[1][1] === "Line 1\nLine 2", "handles newlines inside quoted fields");

  // CRLF line breaks
  const crlf = parseCSV("a,b\r\n1,2\r\n3,4");
  assert(crlf.length === 3 && crlf[2][1] === "4", "handles CRLF (\\r\\n) line breaks");

  // UTF-8 BOM
  const withBOM = parseCSV("\uFEFFFirst Name,Last Name\nAlex,Rivera");
  assert(withBOM[0][0] === "First Name", "strips UTF-8 Byte Order Mark (BOM)");
}

export function runLinkedInMapperTests() {
  console.log("\n--- 2. LinkedIn Mapper Tests ---");

  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "connections.csv");
  const fixtureContent = fs.readFileSync(fixturePath, "utf-8");

  const { rows, skipped } = mapLinkedInRows(fixtureContent);

  assert(skipped === 1, "skips rows with missing names and increments skipped count");
  assert(rows.length === 5, `maps all valid rows (expected 5, got ${rows.length})`);

  // Row 1: Sarah Chen (has email)
  const sarah = rows.find((r) => r.displayName === "Sarah Chen");
  assert(!!sarah, "Sarah Chen found in mapped rows");
  assert(sarah?.primaryEmail === "sarah.chen@benchmark.com", "primary email normalized to lowercase");
  assert(sarah?.company === "Benchmark Capital, LLC", "company name correctly unescaped with comma");
  assert(sarah?.title === "General Partner", "title mapped accurately");
  assert(sarah?.dedupKey === "sarah.chen@benchmark.com", "dedupKey uses canonical email when email present");

  // Row 2: Alex Rivera (no email)
  const alex = rows.find((r) => r.displayName === "Alex Rivera");
  assert(!!alex, "Alex Rivera found");
  assert(alex?.primaryEmail === null, "missing email mapped as null");
  assert(alex?.dedupKey === "n:alex rivera@unknown", "missing email falls back to n:name@domain dedupKey");

  // Row 5: Maya Lin (escaped quote in title)
  const maya = rows.find((r) => r.displayName === "Maya Lin");
  assert(maya?.title === 'Principal "Design" Lead', 'quotes in title unescaped correctly');
}

export function runXArchiveParserTests() {
  console.log("\n--- 3. X Archive Parser Tests ---");

  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "following.js");
  const fixtureContent = fs.readFileSync(fixturePath, "utf-8");

  const { rows, skipped } = parseXArchive([{ name: "data/following.js", text: fixtureContent }]);

  assert(rows.length === 4, `parsed 4 following entries from fixture (got ${rows.length})`);
  assert(skipped === 0, "0 skipped in clean fixture");

  // Check Sam Altman entry
  const sama = rows.find((r) => r.dedupKey === "x:sama");
  assert(!!sama, "found x:sama via username");
  assert(sama?.displayName === "Sam Altman", "displayName extracted from displayName field");
  assert(sama?.url === "https://twitter.com/intent/user?user_id=456789012", "preserves userUrl");

  // Check Karpathy entry
  const karpathy = rows.find((r) => r.dedupKey === "x:karpathy");
  assert(!!karpathy, "found x:karpathy");
  assert(karpathy?.displayName === "Andrej Karpathy", "displayName extracted");
  assert(karpathy?.url === "https://x.com/karpathy", "constructs canonical x.com URL when userUrl absent");

  // Check accountId-only entry
  const accountIdOnly = rows.find((r) => r.dedupKey === "x:id_312345678");
  assert(!!accountIdOnly, "namespaced accountId-only entry as x:id_<accountId>");

  // Verify namespacing
  for (const r of rows) {
    assert(r.dedupKey.startsWith("x:"), `key ${r.dedupKey} strictly namespaced with x:`);
  }

  // HTML fallback test
  const htmlContent = '<div>Following: <a href="https://x.com/elonmusk">Elon</a> and <a href="https://twitter.com/satyanadella">Satya</a></div>';
  const htmlRes = parseXArchive([{ name: "following.html", text: htmlContent }]);
  assert(htmlRes.rows.length === 2, "HTML fallback extracts handles from anchor links");
  assert(htmlRes.rows.some((r) => r.dedupKey === "x:elonmusk"), "found x:elonmusk in HTML fallback");

  // Mutual connections test: When both following.js and follower.js are present,
  // one-way follows (celebrities like Virat Kohli or Messi) must be excluded.
  const followingMock = JSON.stringify([
    { following: { username: "friend_alex", accountId: "111" } },
    { following: { username: "virat_kohli", accountId: "222" } },
    { following: { username: "leomessi", accountId: "333" } },
  ]);
  const followerMock = JSON.stringify([
    { follower: { username: "friend_alex", accountId: "111" } },
    { follower: { username: "random_fan", accountId: "999" } },
  ]);
  const mutualRes = parseXArchive([
    { name: "data/following.js", text: followingMock },
    { name: "data/follower.js", text: followerMock },
  ]);
  assert(mutualRes.rows.length === 1, `only mutuals retained (got ${mutualRes.rows.length}, expected 1)`);
  assert(mutualRes.rows[0].dedupKey === "x:friend_alex", "mutual connection friend_alex is retained");
  assert(!mutualRes.rows.some((r) => r.dedupKey === "x:virat_kohli"), "one-way celebrity follow virat_kohli excluded");
  assert(!mutualRes.rows.some((r) => r.dedupKey === "x:leomessi"), "one-way celebrity follow leomessi excluded");
}

export function runInstagramParserTests() {
  console.log("\n--- 4. Instagram Parser Tests ---");

  // Standard Meta export JSON
  const igJson = JSON.stringify({
    relationships_following: [
      {
        title: "",
        string_list_data: [
          {
            href: "https://www.instagram.com/natfriedman",
            value: "natfriedman",
            timestamp: 1690000000,
          },
        ],
      },
      {
        title: "danielgross",
        string_list_data: [
          {
            href: "https://www.instagram.com/danielgross",
            value: "danielgross",
            timestamp: 1690000000,
          },
        ],
      },
    ],
  });

  const { rows, skipped } = parseInstagramExport([
    { name: "followers_and_following/following.json", text: igJson },
  ]);

  assert(rows.length === 2, `parsed 2 Instagram following entries (got ${rows.length})`);
  assert(skipped === 0, "0 skipped in valid Instagram JSON");

  const nat = rows.find((r) => r.dedupKey === "ig:natfriedman");
  assert(!!nat, "found ig:natfriedman");
  assert(nat?.displayName === "@natfriedman", "displayName formatted as @username");
  assert(nat?.url === "https://www.instagram.com/natfriedman", "URL correctly preserved");
  assert(!!nat?.connectedOn, "connectedOn ISO timestamp generated");

  // HTML fallback test
  const igHtml = '<div><a href="https://www.instagram.com/zuck">Mark</a> and <a href="https://instagram.com/mosseri">Adam</a></div>';
  const htmlRes = parseInstagramExport([{ name: "following.html", text: igHtml }]);
  assert(htmlRes.rows.length === 2, "HTML fallback extracts handles from Instagram links");
  assert(htmlRes.rows.some((r) => r.dedupKey === "ig:zuck"), "found ig:zuck in HTML fallback");

  // Instagram Mutual connections test: When both following and followers exist,
  // celebrities like viratkohli must be excluded.
  const igFollowing = JSON.stringify({
    relationships_following: [
      { string_list_data: [{ value: "friend_maya", href: "https://instagram.com/friend_maya" }] },
      { string_list_data: [{ value: "viratkohli", href: "https://instagram.com/viratkohli" }] },
    ],
  });
  const igFollowers = JSON.stringify({
    relationships_followers: [
      { string_list_data: [{ value: "friend_maya", href: "https://instagram.com/friend_maya" }] },
      { string_list_data: [{ value: "unknown_follower", href: "https://instagram.com/unknown_follower" }] },
    ],
  });
  const igMutualRes = parseInstagramExport([
    { name: "following.json", text: igFollowing },
    { name: "followers_1.json", text: igFollowers },
  ]);
  assert(igMutualRes.rows.length === 1, `Instagram mutuals only (got ${igMutualRes.rows.length})`);
  assert(igMutualRes.rows[0].dedupKey === "ig:friend_maya", "friend_maya retained");
  assert(!igMutualRes.rows.some((r) => r.dedupKey === "ig:viratkohli"), "viratkohli excluded from Instagram network");
}

export function runFacebookParserTests() {
  console.log("\n--- 5. Facebook Parser Tests ---");

  // Standard Meta Facebook friends.json
  const fbJson = JSON.stringify({
    friends_v2: [
      {
        name: "Eduardo Saverin",
        timestamp: 1690000000,
        contact_info: "eduardo@bcap.com",
      },
      {
        name: "Dustin Moskovitz",
        timestamp: 1680000000,
      },
    ],
  });

  const { rows, skipped } = parseFacebookExport([
    { name: "friends_and_followers/friends.json", text: fbJson },
  ]);

  assert(rows.length === 2, `parsed 2 Facebook friends (got ${rows.length})`);
  assert(skipped === 0, "0 skipped in valid Facebook JSON");

  const eduardo = rows.find((r) => r.displayName === "Eduardo Saverin");
  assert(!!eduardo, "found Eduardo Saverin");
  assert(eduardo?.primaryEmail === "eduardo@bcap.com", "primary email extracted from contact_info");
  assert(eduardo?.dedupKey === "eduardo@bcap.com", "dedupKey uses canonical email to enrich contacts");
  assert(eduardo?.givenName === "Eduardo", "givenName extracted");
  assert(eduardo?.familyName === "Saverin", "familyName extracted");

  const dustin = rows.find((r) => r.displayName === "Dustin Moskovitz");
  assert(!!dustin, "found Dustin Moskovitz");
  assert(dustin?.primaryEmail === null, "missing email handled cleanly");
  assert(dustin?.dedupKey === "n:dustin moskovitz@facebook.com", "fallback dedupKey scoped to facebook.com");

  // HTML fallback test
  const fbHtml = '<ul><li>Sheryl Sandberg</li><li>Chris Hughes</li></ul>';
  const htmlRes = parseFacebookExport([{ name: "friends.html", text: fbHtml }]);
  assert(htmlRes.rows.length === 2, "HTML fallback extracts friend names from HTML list");
  assert(htmlRes.rows.some((r) => r.displayName === "Sheryl Sandberg"), "found Sheryl Sandberg in HTML fallback");
}

export function runImportScoringTests() {
  console.log("\n--- 6. Import Scoring Tests ---");

  // Recent LinkedIn connection (today)
  const recentLinkedIn = computeStrength({
    sourcesPresent: ["linkedin_import"],
    connectedOn: new Date().toISOString(),
  });
  assert(recentLinkedIn >= 48 && recentLinkedIn <= 50, `recent LinkedIn connection scores 48-50 (got ${recentLinkedIn})`);

  // Old LinkedIn connection (5 years ago)
  const oldDate = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const oldLinkedIn = computeStrength({
    sourcesPresent: ["linkedin_import"],
    connectedOn: oldDate,
  });
  assert(oldLinkedIn >= 30 && oldLinkedIn <= 33, `old LinkedIn connection scores near floor 30-33 (got ${oldLinkedIn})`);

  // X connection baseline
  const xScore = computeStrength({
    sourcesPresent: ["x_import"],
  });
  assert(xScore === 15, `X follow baseline score is exactly 15 (got ${xScore})`);

  // Instagram connection baseline
  const igScore = computeStrength({
    sourcesPresent: ["instagram_import"],
  });
  assert(igScore === 15, `Instagram follow baseline score is exactly 15 (got ${igScore})`);

  // Recent Facebook friendship (today)
  const recentFb = computeStrength({
    sourcesPresent: ["facebook_import"],
    connectedOn: new Date().toISOString(),
  });
  assert(recentFb >= 38 && recentFb <= 40, `recent Facebook friendship scores 38-40 (got ${recentFb})`);

  // Old Facebook friendship (5 years ago)
  const oldFb = computeStrength({
    sourcesPresent: ["facebook_import"],
    connectedOn: oldDate,
  });
  assert(oldFb >= 25 && oldFb <= 28, `old Facebook friendship scores near floor 25-28 (got ${oldFb})`);

  // Regular Google source behavior unchanged (no import sources)
  const googleScore = computeStrength({
    sourcesPresent: ["contacts", "gmail"],
  });
  assert(googleScore === 20, `two regular Google sources produce 20 pts (got ${googleScore})`);

  // Explanation includes import breakdown
  const explanation = explainScore({
    sourcesPresent: ["facebook_import"],
    connectedOn: new Date().toISOString(),
  });
  assert(explanation.breakdown.importScore >= 38, "explanation includes importScore in breakdown");
  assert(explanation.explanation.includes("Facebook friendship"), "explanation text mentions Facebook friendship");

  const igExplanation = explainScore({
    sourcesPresent: ["instagram_import"],
  });
  assert(igExplanation.breakdown.importScore === 15, "Instagram explanation includes 15 pts importScore");
  assert(igExplanation.explanation.includes("Instagram connection"), "explanation text mentions Instagram connection");
}

export async function main() {
  console.log("=======================================================");
  console.log("🧪 RUNNING IMPORTERS TEST SUITE");
  console.log("=======================================================");

  runCSVParserTests();
  runLinkedInMapperTests();
  runXArchiveParserTests();
  runInstagramParserTests();
  runFacebookParserTests();
  runImportScoringTests();

  console.log("\n=======================================================");
  console.log(`🏁 IMPORTS TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith("imports.test.js") || process.argv[1]?.endsWith("imports.test.ts")) {
  main().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}
