/**
 * Circle-Endorsed Place Ranking Engine.
 * Implements multi-signal explainable ranking that prioritizes trusted circle endorsements
 * while maintaining transparent, independent signal contributions.
 */

import { PlaceCard, PlaceEntity, CircleEndorsementSummary } from "./types";

export interface RankingPlaceCandidate {
  entity: PlaceEntity;
  circle: CircleEndorsementSummary;
  distanceKm?: number | null;
  categoryMatch?: boolean;
}

export interface PlaceScoreBreakdown {
  circleScore: number;       // 0 to 100 based on endorsement count, friend ratings, & strengths
  relevanceScore: number;    // 0 to 100 based on query intent & category match
  distanceScore: number;     // 0 to 100 based on proximity
  externalScore: number;     // 0 to 100 based on external place ratings
  compositeMatchScore: number; // 0 to 100 overall
}

/**
 * Computes independent score signals and transparent match reasons for a place candidate.
 */
export function evaluatePlaceMatch(
  candidate: RankingPlaceCandidate,
  query: string
): { score: PlaceScoreBreakdown; whyThisPlace: string[] } {
  const { entity, circle, distanceKm, categoryMatch } = candidate;
  const qLower = query.toLowerCase();
  const why: string[] = [];

  // 1. Circle Signal (Primary Differentiator)
  let circleScore = 0;
  if (circle.endorsementCount > 0) {
    // Endorsement presence: baseline 50
    circleScore = 50;

    // Additional endorsements boost
    if (circle.endorsementCount > 1) {
      circleScore += Math.min(25, (circle.endorsementCount - 1) * 12);
      why.push(`${circle.endorsementCount} people in your trusted circle recommend this`);
    } else if (circle.topRecommender) {
      const rec = circle.topRecommender;
      const relLabel = rec.relationshipType === "direct" ? "Direct connection" : "In your network";
      why.push(`Recommended by ${rec.name} (${relLabel} · ${rec.connectionStrength}/100)`);
    }

    // Top recommender rating boost
    if (circle.topRecommender?.rating) {
      circleScore += (circle.topRecommender.rating / 5) * 15;
    }

    // Direct connection bonus
    if (circle.hasDirectEndorsement) {
      circleScore += 10;
    }
  }
  circleScore = Math.min(100, Math.round(circleScore));

  // 2. Category / Query Relevance Signal
  let relevanceScore = 60;
  const isCircleSeekingQuery =
    qLower.includes("recommend") ||
    qLower.includes("friend") ||
    qLower.includes("people i know") ||
    qLower.includes("people i follow") ||
    qLower.includes("network") ||
    qLower.includes("circle");

  if (isCircleSeekingQuery && circle.endorsementCount > 0) {
    relevanceScore = 95;
  } else if (categoryMatch) {
    relevanceScore = 95;
    if (entity.category) {
      why.push(`${entity.category} matches your search`);
    }
  } else if (
    (entity.category && qLower.includes(entity.category.toLowerCase())) ||
    (entity.type && qLower.includes(entity.type.toLowerCase())) ||
    qLower.includes(entity.name.toLowerCase())
  ) {
    relevanceScore = 90;
    if (entity.category) {
      why.push(`${entity.category} matches your search`);
    }
  }

  // 3. Proximity / Distance Signal
  let distanceScore = 50;
  if (distanceKm != null) {
    if (distanceKm <= 1.0) {
      distanceScore = 100;
      why.push(`${distanceKm} km away · very close`);
    } else if (distanceKm <= 3.0) {
      distanceScore = 85;
      why.push(`${distanceKm} km away`);
    } else if (distanceKm <= 7.0) {
      distanceScore = 70;
      why.push(`${distanceKm} km away`);
    } else if (distanceKm <= 15.0) {
      distanceScore = 50;
      why.push(`${distanceKm} km away`);
    } else if (distanceKm <= 50.0) {
      distanceScore = 25;
      why.push(`${distanceKm} km away`);
    } else {
      distanceScore = 0;
      why.push(`${distanceKm} km away`);
    }
  }

  // 4. External Place Rating Signal (Supporting Signal)
  let externalScore = 50;
  if (entity.externalRating) {
    externalScore = Math.round((entity.externalRating / 5) * 100);
    if (entity.externalRating >= 4.5 && circle.endorsementCount === 0) {
      why.push(`★ ${entity.externalRating} external rating`);
    }
  }

  // 5. Composite Match Score
  // Heavy weight on circle endorsements (40%), relevance (35%), distance (15%), external (10%)
  let baseComposite = (
    0.40 * circleScore +
    0.35 * relevanceScore +
    0.15 * distanceScore +
    0.10 * externalScore
  );

  // Severe distance penalty for places on another continent/beyond regional radius (> 100 km)
  // Do not penalize circle-endorsed places unless query explicitly demands local "near me"
  if (distanceKm != null && distanceKm > 100 && (circle.endorsementCount === 0 || qLower.includes("near me"))) {
    const penaltyMultiplier = distanceKm > 1000 ? 0.2 : 0.5;
    baseComposite *= penaltyMultiplier;
  }

  const compositeMatchScore = Math.round(baseComposite);

  return {
    score: {
      circleScore,
      relevanceScore,
      distanceScore,
      externalScore,
      compositeMatchScore,
    },
    whyThisPlace: why.slice(0, 4),
  };
}

/**
 * Ranks place candidates into explainable PlaceCards.
 */
export function rankPlaceCandidates(
  candidates: RankingPlaceCandidate[],
  query: string,
  limit = 20
): PlaceCard[] {
  const evaluated = candidates.map((cand) => {
    const { score, whyThisPlace } = evaluatePlaceMatch(cand, query);

    const card: PlaceCard = {
      id: cand.entity.id,
      name: cand.entity.name,
      type: cand.entity.type,
      category: cand.entity.category,
      address: cand.entity.address,
      city: cand.entity.city,
      distanceKm: cand.distanceKm ?? null,
      externalRating: cand.entity.externalRating,
      externalRatingCount: cand.entity.externalRatingCount,
      circle: cand.circle,
      matchScore: score.compositeMatchScore,
      whyThisPlace,
    };

    return { card, score };
  });

  // Sort descending by composite score (places endorsed by trusted circle bubble to top)
  evaluated.sort((a, b) => b.score.compositeMatchScore - a.score.compositeMatchScore);

  return evaluated.slice(0, limit).map((e) => e.card);
}
