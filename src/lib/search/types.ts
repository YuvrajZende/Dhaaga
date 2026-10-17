/**
 * Types & Zod Schemas for the Search Pipeline (Phase 3).
 * Adheres strictly to LLD §6.1, §6.4, and §6.5.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// 1. SubSearch & Decomposition Schemas
// ─────────────────────────────────────────────────────────────

export const SemanticSubSearchSchema = z.object({
  kind: z.literal("semantic"),
  text: z.string().min(1).max(500),
  k: z.number().int().min(1).max(400).default(400),
});

export const StructuredSubSearchSchema = z.object({
  kind: z.literal("structured"),
  titleKeywords: z.array(z.string()).optional(),
  companyKeywords: z.array(z.string()).optional(),
  minStrength: z.number().int().min(0).max(100).optional(),
  scope: z.enum(["me", "network"]).default("me"),
});

export const SubSearchSchema = z.discriminatedUnion("kind", [
  SemanticSubSearchSchema,
  StructuredSubSearchSchema,
]);

export const QueryIntentSchema = z.object({
  target: z.enum(["person", "place"]).default("person"),
  activity: z.string().nullable().optional(),     // e.g. "cooking", "guitar", "photographer"
  relationship: z.string().nullable().optional(), // e.g. "mate", "friend", "musician", "colleague"
  category: z.string().nullable().optional(),     // e.g. "Italian restaurant", "cafe", "gym"
  location: z.string().nullable().optional(),
  needsLocation: z.boolean().optional(),
  availability: z.string().nullable().optional(),
  budget: z.string().nullable().optional(),
});

export type QueryIntent = z.infer<typeof QueryIntentSchema>;

export const SubSearchPlanSchema = z.object({
  intent: QueryIntentSchema.optional(),
  subSearches: z.array(SubSearchSchema).min(1).max(5),
});

export type SemanticSubSearch = z.infer<typeof SemanticSubSearchSchema>;
export type StructuredSubSearch = z.infer<typeof StructuredSubSearchSchema>;
export type SubSearch = z.infer<typeof SubSearchSchema>;
export type SubSearchPlan = z.infer<typeof SubSearchPlanSchema>;

// ─────────────────────────────────────────────────────────────
// 2. Candidate & Card Schemas
// ─────────────────────────────────────────────────────────────

export interface Candidate {
  personId: string;
  name: string;
  title: string | null;
  company: string | null;
  companyDomain: string | null;
  headline: string | null;
  avatarUrl: string | null;
  location?: string | null;
  sim: number; // 0.0 to 1.0 similarity score
  ownerScope: "me" | "friend";
  viaOwnerId?: string | null;
  viaOwnerName?: string | null;
  strength: number; // 0 to 100 connection strength
  bio?: string | null;
  tags?: string[] | null;
  matchScore?: number; // 0 to 100 relevance score
  mutual?: {
    id: string;
    name: string;
  } | null;
}

export const CandidateCardSchema = z.object({
  personId: z.string().uuid(),
  name: z.string(),
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  strength: z.number().int().min(0).max(100),
  matchScore: z.number().optional(),
  matchBreakdown: z
    .object({
      activityMatch: z.number().optional(),
      connectionFit: z.number().optional(),
    })
    .optional(),
  intent: QueryIntentSchema.optional(),
  mutual: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  viaFriend: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  rationale: z.string().max(200),
  tags: z.array(z.string()).nullable().optional(),
});

export type CandidateCard = z.infer<typeof CandidateCardSchema>;

// ─────────────────────────────────────────────────────────────
// 3. Search API Request & Event Types
// ─────────────────────────────────────────────────────────────

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  target: z.enum(["all", "person", "place"]).optional(),
  location: z
    .object({
      label: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
    })
    .optional(),
  scope: z
    .object({
      friendIds: z.array(z.string().uuid()).optional(),
      groupIds: z.array(z.string().uuid()).optional(),
    })
    .optional(),
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export type SearchStage = "planning" | "searches" | "ranking" | "places" | "circle";
export type SearchMode = "fast" | "full" | "degraded";

export interface SearchTimings {
  decomposeMs: number;
  annMs: number;
  rerankMs: number;
  totalMs: number;
}
