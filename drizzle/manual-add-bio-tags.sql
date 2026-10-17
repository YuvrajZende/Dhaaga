-- Add bio and tags columns to people table for profile enrichment
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "bio" text;
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb;
