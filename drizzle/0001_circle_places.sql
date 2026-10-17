-- Migration: 0001_circle_places.sql
-- Adds entities and recommendations for Circle-Endorsed Search

CREATE TABLE IF NOT EXISTS "entities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" text NOT NULL DEFAULT 'osm',
  "provider_external_id" text NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL DEFAULT 'restaurant',
  "category" text,
  "address" text,
  "city" text,
  "latitude" real,
  "longitude" real,
  "external_rating" real,
  "external_rating_count" integer,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "entities_provider_ext_idx" ON "entities" ("provider", "provider_external_id");
CREATE INDEX IF NOT EXISTS "entities_type_idx" ON "entities" ("type");
CREATE INDEX IF NOT EXISTS "entities_city_idx" ON "entities" ("city");
CREATE INDEX IF NOT EXISTS "entities_name_idx" ON "entities" ("name");

CREATE TABLE IF NOT EXISTS "recommendations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "entity_id" uuid NOT NULL REFERENCES "entities"("id") ON DELETE cascade,
  "rating" smallint,
  "note" text,
  "is_private_note" boolean NOT NULL DEFAULT true,
  "share_with_circle" boolean NOT NULL DEFAULT false,
  "source" text NOT NULL DEFAULT 'manual',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "recommendations_rating_check" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5))
);

CREATE UNIQUE INDEX IF NOT EXISTS "recommendations_user_entity_idx" ON "recommendations" ("user_id", "entity_id");
CREATE INDEX IF NOT EXISTS "recommendations_entity_idx" ON "recommendations" ("entity_id");
CREATE INDEX IF NOT EXISTS "recommendations_user_share_idx" ON "recommendations" ("user_id", "share_with_circle");
