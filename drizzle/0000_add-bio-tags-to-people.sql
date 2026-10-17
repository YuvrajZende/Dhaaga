CREATE TABLE "contact_edges" (
	"user_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"strength" smallint DEFAULT 0 NOT NULL,
	"signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "contact_edges_user_id_person_id_pk" PRIMARY KEY("user_id","person_id"),
	CONSTRAINT "contact_edges_strength_check" CHECK ("contact_edges"."strength" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "decomp_cache" (
	"norm_key" text PRIMARY KEY NOT NULL,
	"plan" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embedding_queue" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"vec" halfvec(384) NOT NULL,
	"model_version" text NOT NULL,
	"embedded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"user_id" uuid NOT NULL,
	"friend_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_code" text,
	CONSTRAINT "friendships_user_id_friend_id_pk" PRIMARY KEY("user_id","friend_id")
);
--> statement-breakpoint
CREATE TABLE "google_tokens" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"access_token" "bytea" NOT NULL,
	"refresh_token" "bytea" NOT NULL,
	"scope" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"join_code" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"job_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "import_rows_job_id_idx_pk" PRIMARY KEY("job_id","idx")
);
--> statement-breakpoint
CREATE TABLE "intro_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_person_id" uuid NOT NULL,
	"mutual_person_id" uuid,
	"subject" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_breaker" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"failures" smallint DEFAULT 0 NOT NULL,
	"open_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"given_name" text,
	"family_name" text,
	"primary_email" text,
	"title" text,
	"company" text,
	"company_domain" text,
	"headline" text,
	"avatar_url" text,
	"bio" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dedup_key" text NOT NULL,
	"is_flagged_dup" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_edges" (
	"a_id" uuid NOT NULL,
	"b_id" uuid NOT NULL,
	"weight" smallint NOT NULL,
	"basis" text DEFAULT 'shared_thread' NOT NULL,
	CONSTRAINT "person_edges_a_id_b_id_pk" PRIMARY KEY("a_id","b_id"),
	CONSTRAINT "chk_person_edges_order" CHECK ("person_edges"."a_id" < "person_edges"."b_id")
);
--> statement-breakpoint
CREATE TABLE "search_results" (
	"search_id" uuid NOT NULL,
	"rank" smallint NOT NULL,
	"person_id" uuid NOT NULL,
	"via_owner_id" uuid,
	"mutual_person_id" uuid,
	"score" real NOT NULL,
	"rationale" text,
	CONSTRAINT "search_results_search_id_rank_pk" PRIMARY KEY("search_id","rank")
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"query_text" text NOT NULL,
	"norm_key" text,
	"mode" text DEFAULT 'full' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"cursor" jsonb,
	"last_synced_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "sources_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"kind" text DEFAULT 'initial' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt" smallint DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"total_hint" integer,
	"heartbeat_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"sharing_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "contact_edges" ADD CONSTRAINT "contact_edges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_edges" ADD CONSTRAINT "contact_edges_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_queue" ADD CONSTRAINT "embedding_queue_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_tokens" ADD CONSTRAINT "google_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_job_id_sync_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."sync_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intro_drafts" ADD CONSTRAINT "intro_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intro_drafts" ADD CONSTRAINT "intro_drafts_target_person_id_people_id_fk" FOREIGN KEY ("target_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intro_drafts" ADD CONSTRAINT "intro_drafts_mutual_person_id_people_id_fk" FOREIGN KEY ("mutual_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_edges" ADD CONSTRAINT "person_edges_a_id_people_id_fk" FOREIGN KEY ("a_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_edges" ADD CONSTRAINT "person_edges_b_id_people_id_fk" FOREIGN KEY ("b_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_edges_strength_idx" ON "contact_edges" USING btree ("user_id","strength");--> statement-breakpoint
CREATE INDEX "embeddings_owner_model_idx" ON "embeddings" USING btree ("owner_user_id","model_version");--> statement-breakpoint
CREATE INDEX "import_rows_job_processed_idx" ON "import_rows" USING btree ("job_id","processed","idx");--> statement-breakpoint
CREATE UNIQUE INDEX "people_owner_dedup_idx" ON "people" USING btree ("owner_user_id","dedup_key");--> statement-breakpoint
CREATE INDEX "people_owner_idx" ON "people" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "people_company_idx" ON "people" USING btree ("owner_user_id","company_domain");--> statement-breakpoint
CREATE INDEX "person_edges_b_idx" ON "person_edges" USING btree ("b_id","a_id","weight");--> statement-breakpoint
CREATE INDEX "sync_jobs_pending_idx" ON "sync_jobs" USING btree ("status","created_at");