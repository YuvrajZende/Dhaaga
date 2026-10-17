CREATE TABLE IF NOT EXISTS "follows" (
  "follower_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "followed_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "follows_pkey" PRIMARY KEY("follower_user_id", "followed_user_id")
);

CREATE INDEX IF NOT EXISTS "follows_followed_idx" ON "follows"("followed_user_id");
