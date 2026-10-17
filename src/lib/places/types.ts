import { z } from "zod";

export interface LocationContext {
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  label?: string | null; // e.g. "Near me", "Vadodara", "SoHo, New York"
}

export const LocationContextSchema = z.object({
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  city: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
});

export interface PlaceEntity {
  id: string;
  provider: string; // "osm" | "manual" | "google"
  providerExternalId: string;
  name: string;
  type: string; // "restaurant" | "cafe" | "gym" | "service" | "store"
  category: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  externalRating: number | null;
  externalRatingCount: number | null;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export const CircleRecommenderSchema = z.object({
  userId: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
  sharedNote: z.string().nullable().optional(),
  source: z.string().nullable().optional().default("manual"), // "manual" | "google" | "happensten"
  relationshipType: z.enum(["direct", "2nd-degree"]),
  connectionStrength: z.number(),
  recommendedAt: z.union([z.string(), z.date()]),
});

export type CircleRecommender = z.infer<typeof CircleRecommenderSchema>;

export const CircleEndorsementSummarySchema = z.object({
  endorsementCount: z.number(),
  averageFriendRating: z.number().nullable().optional(),
  recommenders: z.array(CircleRecommenderSchema),
  hasDirectEndorsement: z.boolean(),
  topRecommender: CircleRecommenderSchema.nullable().optional(),
});

export type CircleEndorsementSummary = z.infer<typeof CircleEndorsementSummarySchema>;

export const PlaceCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  category: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  distanceKm: z.number().nullable().optional(),
  externalRating: z.number().nullable().optional(),
  externalRatingCount: z.number().nullable().optional(),
  circle: CircleEndorsementSummarySchema,
  matchScore: z.number(),
  whyThisPlace: z.array(z.string()),
  currentUserRecommendation: z
    .object({
      rating: z.number().nullable().optional(),
      note: z.string().nullable().optional(),
      isPrivateNote: z.boolean(),
      shareWithCircle: z.boolean(),
    })
    .nullable()
    .optional(),
});

export type PlaceCard = z.infer<typeof PlaceCardSchema>;

export const SaveRecommendationInputSchema = z.object({
  entityId: z.string().uuid(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  isPrivateNote: z.boolean().default(true),
  shareWithCircle: z.boolean().default(false),
  source: z.string().optional().default("manual"),
});

export type SaveRecommendationInput = z.input<typeof SaveRecommendationInputSchema>;

