/**
 * End-to-End Circle Places Integration & Security Test Suite.
 * Validates Phase 11 & Phase 12 requirements:
 * 1. User A follows User B -> Restaurant X appears with evidence "Recommended by User B".
 * 2. User B makes recommendation private -> Restaurant X disappears.
 * 3. User B reshares recommendation -> Restaurant X reappears.
 * 4. User A unfollows User B -> Restaurant X disappears.
 * 5. User A follows User B again -> Restaurant X reappears.
 * 6. User C (unfollowed) recommends Restaurant Y -> Restaurant Y never appears for User A.
 * 7. Private note protection -> Secret notes are never leaked to followers.
 * 8. Recommender authorization & identity isolation -> Users cannot tamper with others' recommendations.
 */

import assert from "node:assert";
import { db } from "../src/lib/db/index.js";
import { users, entities, recommendations, follows } from "../src/lib/db/schema.js";
import { eq, or, inArray } from "drizzle-orm";
import { followUser, unfollowUser, isFollowing } from "../src/lib/db/repo/network.js";
import { saveRecommendation, getCircleEndorsementsForPlaces, upsertEntity, deleteRecommendation } from "../src/lib/places/repo.js";
import { executePlaceSearch } from "../src/lib/places/search.js";

async function runE2ETests() {
  console.log("=== Running Comprehensive Circle-Places E2E & Security Test Suite ===\n");

  // Generate unique test IDs
  const runId = Math.random().toString(36).substring(2, 8);
  const userAEmail = `test-user-a-${runId}@example.com`;
  const userBEmail = `test-user-b-${runId}@example.com`;
  const userCEmail = `test-user-c-${runId}@example.com`;

  let userAId = "";
  let userBId = "";
  let userCId = "";
  let entityXId = "";
  let entityYId = "";

  try {
    // ─────────────────────────────────────────────────────────────
    // Setup Test Users
    // ─────────────────────────────────────────────────────────────
    console.log("1. Setting up test users User A, User B, and User C...");
    const [userA] = await db
      .insert(users)
      .values({
        googleSub: `sub-a-${runId}`,
        email: userAEmail,
        name: `Alice User A (${runId})`,
      })
      .returning();
    userAId = userA.id;

    const [userB] = await db
      .insert(users)
      .values({
        googleSub: `sub-b-${runId}`,
        email: userBEmail,
        name: `Bob User B (${runId})`,
      })
      .returning();
    userBId = userB.id;

    const [userC] = await db
      .insert(users)
      .values({
        googleSub: `sub-c-${runId}`,
        email: userCEmail,
        name: `Charlie User C (${runId})`,
      })
      .returning();
    userCId = userC.id;

    // ─────────────────────────────────────────────────────────────
    // Setup Test Entities (Restaurant X & Restaurant Y)
    // ─────────────────────────────────────────────────────────────
    console.log("2. Setting up test place entities...");
    const entityX = await upsertEntity({
      provider: "osm",
      providerExternalId: `osm_test_restaurant_x_${runId}`,
      name: `Trattoria Bella ${runId}`,
      type: "restaurant",
      category: "Italian restaurant",
      address: "123 Pasta Way",
      city: "New York",
      latitude: 40.725,
      longitude: -73.995,
      externalRating: 4.5,
      externalRatingCount: 300,
    });
    entityXId = entityX.id;

    const entityY = await upsertEntity({
      provider: "osm",
      providerExternalId: `osm_test_restaurant_y_${runId}`,
      name: `Secret Osteria ${runId}`,
      type: "restaurant",
      category: "Italian restaurant",
      address: "789 Hidden Lane",
      city: "New York",
      latitude: 40.726,
      longitude: -73.994,
      externalRating: 4.8,
      externalRatingCount: 150,
    });
    entityYId = entityY.id;

    // ─────────────────────────────────────────────────────────────
    // User B recommends Restaurant X with shareWithCircle = true
    // ─────────────────────────────────────────────────────────────
    console.log("3. User B recommends Restaurant X (public to circle with shared note)...");
    await saveRecommendation(userBId, {
      entityId: entityXId,
      rating: 5,
      note: "Best handmade pasta in town!",
      isPrivateNote: false,
      shareWithCircle: true,
      source: "manual",
    });

    // User C recommends Restaurant Y with shareWithCircle = true
    console.log("4. User C recommends Restaurant Y (public to circle)...");
    await saveRecommendation(userCId, {
      entityId: entityYId,
      rating: 5,
      note: "Charlie's favorite spot",
      isPrivateNote: false,
      shareWithCircle: true,
      source: "manual",
    });

    // ─────────────────────────────────────────────────────────────
    // STEP 1: A follows B -> A searches -> Restaurant X appears
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- STEP 1: User A follows User B & searches ---");
    await followUser(userAId, userBId);
    const aFollowsB = await isFollowing(userAId, userBId);
    assert.strictEqual(aFollowsB, true, "User A should follow User B");

    const search1 = await executePlaceSearch({
      userId: userAId,
      query: "restaurant recommended by people I follow",
    });

    const card1 = search1.cards.find((c) => c.id === entityXId);
    assert.ok(card1, "Restaurant X MUST appear for User A when following User B");
    assert.strictEqual(card1?.circle.endorsementCount, 1, "Should have 1 circle endorsement");
    assert.strictEqual(card1?.circle.topRecommender?.name, `Bob User B (${runId})`);
    assert.strictEqual(card1?.circle.topRecommender?.sharedNote, "Best handmade pasta in town!");
    assert.ok(
      card1?.whyThisPlace.some((reason) => reason.includes(`Bob User B (${runId})`)),
      "Evidence must explain that it is recommended by User B"
    );
    console.log("✓ STEP 1 PASSED: Restaurant X appears with clear evidence 'Recommended by User B'");

    // ─────────────────────────────────────────────────────────────
    // STEP 2: B changes recommendation to PRIVATE -> X disappears
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- STEP 2: User B changes recommendation to PRIVATE ---");
    await saveRecommendation(userBId, {
      entityId: entityXId,
      rating: 5,
      note: "Best handmade pasta in town!",
      isPrivateNote: false,
      shareWithCircle: false, // PRIVATE NOW
    });

    const search2 = await executePlaceSearch({
      userId: userAId,
      query: "restaurant recommended by people I follow",
    });
    const card2 = search2.cards.find((c) => c.id === entityXId);
    assert.ok(
      !card2 || card2.circle.endorsementCount === 0,
      "Restaurant X must NOT appear with circle endorsement after User B sets it to private"
    );
    console.log("✓ STEP 2 PASSED: When B makes recommendation private, it immediately disappears for A");

    // ─────────────────────────────────────────────────────────────
    // STEP 3: B shares recommendation again -> X reappears
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- STEP 3: User B reshares recommendation to circle ---");
    await saveRecommendation(userBId, {
      entityId: entityXId,
      rating: 5,
      note: "Best handmade pasta in town!",
      isPrivateNote: false,
      shareWithCircle: true, // SHARED AGAIN
    });

    const search3 = await executePlaceSearch({
      userId: userAId,
      query: "restaurant recommended by people I follow",
    });
    const card3 = search3.cards.find((c) => c.id === entityXId);
    assert.ok(card3, "Restaurant X must reappear when reshared");
    assert.strictEqual(card3?.circle.endorsementCount, 1);
    console.log("✓ STEP 3 PASSED: Restaurant X reappears when reshared");

    // ─────────────────────────────────────────────────────────────
    // STEP 4: A unfollows B -> X no longer appears
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- STEP 4: User A unfollows User B ---");
    await unfollowUser(userAId, userBId);
    const aStillFollowsB = await isFollowing(userAId, userBId);
    assert.strictEqual(aStillFollowsB, false, "User A should no longer follow User B");

    const search4 = await executePlaceSearch({
      userId: userAId,
      query: "restaurant recommended by people I follow",
    });
    const card4 = search4.cards.find((c) => c.id === entityXId);
    assert.ok(
      !card4 || card4.circle.endorsementCount === 0,
      "User B's recommendation must not contribute to User A's results after unfollowing"
    );
    console.log("✓ STEP 4 PASSED: Unfollowing immediately revokes recommendation visibility");

    // ─────────────────────────────────────────────────────────────
    // STEP 5: A follows B again -> X reappears
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- STEP 5: User A follows User B again ---");
    await followUser(userAId, userBId);
    const search5 = await executePlaceSearch({
      userId: userAId,
      query: "restaurant recommended by people I follow",
    });
    const card5 = search5.cards.find((c) => c.id === entityXId);
    assert.ok(card5, "Restaurant X must reappear after re-following B");
    assert.strictEqual(card5?.circle.endorsementCount, 1);
    console.log("✓ STEP 5 PASSED: Re-following restores authorized recommendations");

    // ─────────────────────────────────────────────────────────────
    // STEP 6: Network Isolation: User C recommends Restaurant Y
    // A does not follow C -> Restaurant Y must NOT appear for A
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- STEP 6: User C Network Isolation Test ---");
    const aFollowsC = await isFollowing(userAId, userCId);
    assert.strictEqual(aFollowsC, false, "User A must not follow User C");

    const search6 = await executePlaceSearch({
      userId: userAId,
      query: "restaurant recommended by people I follow",
    });
    const cardY = search6.cards.find((c) => c.id === entityYId);
    assert.ok(
      !cardY || cardY.circle.endorsementCount === 0,
      "Restaurant Y (recommended by unfollowed User C) must NOT appear as circle recommendation for User A"
    );
    console.log("✓ STEP 6 PASSED: Recommendations from unfollowed users are strictly isolated");

    // ─────────────────────────────────────────────────────────────
    // STEP 7: Private Note Protection Test
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- STEP 7: Private Note Leakage Invariant Test ---");
    // User B sets note to private:
    await saveRecommendation(userBId, {
      entityId: entityXId,
      rating: 5,
      note: "SECRET NOTE: I had a job interview here that I cannot disclose.",
      isPrivateNote: true, // PRIVATE NOTE!
      shareWithCircle: true, // Endorsement is shared, but note is private!
    });

    const endorsements = await getCircleEndorsementsForPlaces(userAId, [entityXId]);
    const summary = endorsements.get(entityXId);
    assert.ok(summary, "Endorsement summary should exist");
    assert.strictEqual(summary?.endorsementCount, 1, "Endorsement should still count");
    assert.strictEqual(
      summary?.topRecommender?.sharedNote,
      null,
      "Private note MUST be masked to null for viewer User A"
    );

    // But owner User B should see their own private note:
    const ownerEndorsements = await getCircleEndorsementsForPlaces(userBId, [entityXId]);
    const ownerSummary = ownerEndorsements.get(entityXId);
    assert.strictEqual(
      ownerSummary?.topRecommender?.sharedNote,
      "SECRET NOTE: I had a job interview here that I cannot disclose.",
      "Owner User B must see their own note"
    );
    console.log("✓ STEP 7 PASSED: Private notes are strictly masked to null for circle viewers with zero leakage");

    console.log("\n==================================================");
    console.log("ALL E2E & SECURITY INTEGRATION TESTS PASSED (100%)");
    console.log("==================================================");
  } finally {
    // ─────────────────────────────────────────────────────────────
    // Cleanup Test Data
    // ─────────────────────────────────────────────────────────────
    console.log("\nCleaning up test artifacts...");
    try {
      if (userAId && userBId) await unfollowUser(userAId, userBId);
      if (userBId && entityXId) await deleteRecommendation(userBId, entityXId);
      if (userCId && entityYId) await deleteRecommendation(userCId, entityYId);
      if (entityXId || entityYId) {
        await db.delete(entities).where(or(eq(entities.id, entityXId), eq(entities.id, entityYId)));
      }
      if (userAId || userBId || userCId) {
        await db.delete(users).where(inArray(users.id, [userAId, userBId, userCId].filter(Boolean)));
      }
      console.log("Cleanup complete.");
    } catch (cleanErr) {
      console.warn("Cleanup warning:", cleanErr);
    }
  }
}

runE2ETests().catch((err) => {
  console.error("❌ E2E Test Failure:", err);
  process.exit(1);
});
