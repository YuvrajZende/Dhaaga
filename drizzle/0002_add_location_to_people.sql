-- Migration: 0002_add_location_to_people.sql
-- Adds location field to people and users for easier location-based searching
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "location" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location" text;
CREATE INDEX IF NOT EXISTS "people_location_idx" ON "people" ("location");
