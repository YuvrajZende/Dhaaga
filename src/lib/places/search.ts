/**
 * Circle-Endorsed Search Orchestrator.
 * Coordinates location resolution, external place retrieval, circle endorsements retrieval,
 * and explainable ranking.
 */

import { LocationContext, PlaceCard } from "./types";
import { QueryIntent } from "../search/types";
import { searchExternalPlaces, resolveLocationFromQuery, calculateHaversineDistanceKm } from "./provider";
import { getCircleEndorsementsForPlaces, getCircleRecommendedEntities, upsertEntity } from "./repo";
import { rankPlaceCandidates } from "./rank";

export interface PlaceSearchOptions {
  userId: string;
  query: string;
  intent?: QueryIntent;
  location?: LocationContext;
}

export interface PlaceSearchResult {
  cards: PlaceCard[];
  resolvedLocation: LocationContext;
  needsLocationPrompt: boolean;
}

export async function executePlaceSearch(options: PlaceSearchOptions): Promise<PlaceSearchResult> {
  const { userId, query, intent, location } = options;

  // 1. Resolve Location Context (privacy-conscious: ephemeral, never stored persistently)
  let effectiveLocation: LocationContext = { ...location };
  let needsLocationPrompt = false;

  // If client provided coordinates, use them
  if (location?.latitude && location?.longitude) {
    effectiveLocation = {
      latitude: location.latitude,
      longitude: location.longitude,
      city: location.city || location.label || "Current location",
      label: location.label || "Near me",
    };
  } else {
    // Attempt city detection from query text or intent location
    const detected = resolveLocationFromQuery(`${query} ${intent?.location || ""}`);
    if (detected) {
      effectiveLocation = detected;
    } else if (intent?.needsLocation || query.toLowerCase().includes("near me")) {
      // User requested local places without coordinates or explicit city
      // Default to Vadodara preset hub and flag that location permission can refine it
      effectiveLocation = {
        latitude: 22.3072,
        longitude: 73.1812,
        city: "Vadodara",
        label: "Vadodara (preset)",
      };
      needsLocationPrompt = true;
    }
  }

  const category = intent?.category || undefined;

  // 2. DUAL RETRIEVAL:
  // Step 2a: Query circle-recommended places from database (highest personal relevance)
  const circleEntitiesPromise = getCircleRecommendedEntities(userId, {
    queryText: query,
    category,
    city: effectiveLocation.city ?? undefined,
    limit: 50,
  });

  // Step 2b: Query External Place Provider (OSM + curated authentic seed hubs for broad coverage)
  const externalCandidatesPromise = searchExternalPlaces({
    queryText: query,
    category,
    location: effectiveLocation,
    limit: 20,
  });

  const [circleEntities, rawExternalCandidates] = await Promise.all([
    circleEntitiesPromise,
    externalCandidatesPromise,
  ]);

  // 3. Batch upsert external places into entities table for stable entity IDs
  const externalUpsertPromises = rawExternalCandidates.map(async (candidate) => {
    try {
      const dbEntity = await upsertEntity({
        provider: candidate.provider,
        providerExternalId: candidate.providerExternalId,
        name: candidate.name,
        type: candidate.type,
        category: candidate.category,
        address: candidate.address,
        city: candidate.city || effectiveLocation.city || null,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        externalRating: candidate.externalRating,
        externalRatingCount: candidate.externalRatingCount,
      });
      return {
        ...candidate,
        id: dbEntity.id,
      };
    } catch (err) {
      console.warn(`Failed to upsert entity ${candidate.providerExternalId}:`, err);
      return {
        ...candidate,
        id: candidate.providerExternalId,
      };
    }
  });

  const persistedExternal = await Promise.all(externalUpsertPromises);

  // 4. Merge and Deduplicate candidates (Circle places take precedence)
  const candidateMap = new Map<string, any>();

  // Add circle-recommended entities
  for (const c of circleEntities) {
    let distanceKm: number | null = null;
    if (
      effectiveLocation?.latitude != null &&
      effectiveLocation?.longitude != null &&
      c.latitude != null &&
      c.longitude != null
    ) {
      distanceKm = calculateHaversineDistanceKm(
        effectiveLocation.latitude,
        effectiveLocation.longitude,
        c.latitude,
        c.longitude
      );
    }

    const key = c.providerExternalId || c.id;
    candidateMap.set(key, {
      ...c,
      distanceKm,
    });
    // Also index by id
    candidateMap.set(c.id, {
      ...c,
      distanceKm,
    });
  }

  // Add external candidates if not already present
  for (const ext of persistedExternal) {
    const key = ext.providerExternalId || ext.id;
    if (!candidateMap.has(key) && !candidateMap.has(ext.id)) {
      candidateMap.set(key, ext);
    }
  }

  // Deduplicate down to unique entity IDs
  const combinedCandidates: any[] = [];
  const seenIds = new Set<string>();
  for (const cand of candidateMap.values()) {
    if (!seenIds.has(cand.id)) {
      seenIds.add(cand.id);
      combinedCandidates.push(cand);
    }
  }

  // 5. Retrieve Circle Endorsements for the candidate external and entity IDs
  const lookupIds = Array.from(
    new Set([
      ...combinedCandidates.map((c) => c.providerExternalId),
      ...combinedCandidates.map((c) => c.id),
    ])
  ).filter(Boolean);
  const endorsementsMap = await getCircleEndorsementsForPlaces(userId, lookupIds);

  // 6. Compute Explainable Multi-Signal Ranking
  const rankingCandidates = combinedCandidates.map((c) => {
    const circle =
      endorsementsMap.get(c.id) ||
      endorsementsMap.get(c.providerExternalId) || {
        endorsementCount: 0,
        averageFriendRating: null,
        recommenders: [],
        hasDirectEndorsement: false,
        topRecommender: null,
      };
    const categoryMatch = category
      ? Boolean(c.category?.toLowerCase().includes(category.toLowerCase()))
      : undefined;

    return {
      entity: {
        id: c.id,
        provider: c.provider,
        providerExternalId: c.providerExternalId,
        name: c.name,
        type: c.type,
        category: c.category ?? null,
        address: c.address ?? null,
        city: c.city ?? null,
        latitude: c.latitude ?? null,
        longitude: c.longitude ?? null,
        externalRating: c.externalRating ?? null,
        externalRatingCount: c.externalRatingCount ?? null,
      },
      circle,
      distanceKm: c.distanceKm ?? null,
      categoryMatch,
    };
  });

  const rankedCards = rankPlaceCandidates(rankingCandidates, query, 20);

  return {
    cards: rankedCards,
    resolvedLocation: effectiveLocation,
    needsLocationPrompt,
  };
}
