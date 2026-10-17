import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  smallint,
  integer,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  check,
  customType,
  real,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Custom type for halfvec(384) (pgvector)
export const halfvec384 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "halfvec(384)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    if (typeof value !== "string") return value as unknown as number[];
    const cleaned = value.replace(/^\[|\]$/g, "");
    return cleaned ? cleaned.split(",").map(Number) : [];
  },
});

// Custom bytea type for encrypted buffer storage
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: unknown): Buffer {
    return Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  },
});

// 1. Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleSub: text("google_sub").unique().notNull(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  location: text("location"),
  sharingEnabled: boolean("sharing_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 2. Google Tokens (encrypted at rest via AES-256-GCM)
export const googleTokens = pgTable("google_tokens", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: bytea("access_token").notNull(),
  refreshToken: bytea("refresh_token").notNull(),
  scope: text("scope").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 3. Data Sources (Contacts, Gmail, Calendar)
export const sources = pgTable(
  "sources",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["contacts", "gmail", "calendar", "linkedin_import", "x_import", "instagram_import", "facebook_import"],
    }).notNull(),
    status: text("status", {
      enum: ["disconnected", "active", "syncing", "throttled", "error"],
    })
      .notNull()
      .default("disconnected"),
    cursor: jsonb("cursor"), // { syncToken | historyId | timeMin, page }
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    error: text("error"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.type] }),
  ]
);

// 4. People Profiles
export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    givenName: text("given_name"),
    familyName: text("family_name"),
    primaryEmail: text("primary_email"),
    title: text("title"),
    company: text("company"),
    companyDomain: text("company_domain"),
    headline: text("headline"),
    avatarUrl: text("avatar_url"),
    location: text("location"),       // City / Country (e.g. "Vadodara, India", "New York, NY")
    bio: text("bio"),                 // freeform rich text: career summary, personal notes, etc.
    tags: jsonb("tags").default(sql`'[]'::jsonb`), // ["guitar", "hiking", "machine learning", "vegan chef"]
    sourceRefs: jsonb("source_refs").notNull().default(sql`'[]'::jsonb`),
    dedupKey: text("dedup_key").notNull(),
    isFlaggedDup: boolean("is_flagged_dup").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("people_owner_dedup_idx").on(table.ownerUserId, table.dedupKey),
    index("people_owner_idx").on(table.ownerUserId),
    index("people_company_idx").on(table.ownerUserId, table.companyDomain),
    index("people_location_idx").on(table.location),
  ]
);

// 5. Contact Edges (Me -> Person)
export const contactEdges = pgTable(
  "contact_edges",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    strength: smallint("strength").notNull().default(0), // 0-100
    signals: jsonb("signals").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.personId] }),
    index("contact_edges_strength_idx").on(table.userId, table.strength),
    check("contact_edges_strength_check", sql`${table.strength} BETWEEN 0 AND 100`),
  ]
);

// 6. Person Edges (Person <-> Person derived, canonical a_id < b_id)
export const personEdges = pgTable(
  "person_edges",
  {
    aId: uuid("a_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    bId: uuid("b_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    weight: smallint("weight").notNull(),
    basis: text("basis").notNull().default("shared_thread"),
  },
  (table) => [
    primaryKey({ columns: [table.aId, table.bId] }),
    index("person_edges_b_idx").on(table.bId, table.aId, table.weight),
    check("chk_person_edges_order", sql`${table.aId} < ${table.bId}`),
  ]
);

// 7. Embeddings (pgvector halfvec)
export const embeddings = pgTable(
  "embeddings",
  {
    personId: uuid("person_id")
      .primaryKey()
      .references(() => people.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").notNull(),
    vec: halfvec384("vec").notNull(),
    modelVersion: text("model_version").notNull(),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("embeddings_owner_model_idx").on(table.ownerUserId, table.modelVersion),
  ]
);

// 8. Embedding Queue
export const embeddingQueue = pgTable("embedding_queue", {
  personId: uuid("person_id")
    .primaryKey()
    .references(() => people.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").notNull(),
  enqueuedAt: timestamp("enqueued_at", { withTimezone: true }).notNull().defaultNow(),
});

// 9. Sync Jobs
export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    kind: text("kind", { enum: ["initial", "incremental"] }).notNull().default("initial"),
    status: text("status", {
      enum: ["queued", "running", "throttled", "done", "error"],
    })
      .notNull()
      .default("queued"),
    attempt: smallint("attempt").notNull().default(0),
    processed: integer("processed").notNull().default(0),
    totalHint: integer("total_hint"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sync_jobs_pending_idx").on(table.status, table.createdAt),
  ]
);

// 9b. Staged Import Rows
export const importRows = pgTable(
  "import_rows",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => syncJobs.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    payload: jsonb("payload").notNull(),
    processed: boolean("processed").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.jobId, table.idx] }),
    index("import_rows_job_processed_idx").on(table.jobId, table.processed, table.idx),
  ]
);

// 10. Friendships (Opt-in network sharing)
export const friendships = pgTable(
  "friendships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "accepted"] }).notNull().default("pending"),
    invitedCode: text("invited_code"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.friendId] }),
  ]
);

// 10b. Follows (Explicit asymmetric network trust for recommendations & intelligence)
export const follows = pgTable(
  "follows",
  {
    followerUserId: uuid("follower_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followedUserId: uuid("followed_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerUserId, table.followedUserId] }),
    index("follows_followed_idx").on(table.followedUserId),
  ]
);

// 11. Groups
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  joinCode: text("join_code").unique().notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
  ]
);

// 12. Warm-Path Introduction Drafts
export const introDrafts = pgTable("intro_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  targetPersonId: uuid("target_person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  mutualPersonId: uuid("mutual_person_id").references(() => people.id, {
    onDelete: "set null",
  }),
  subject: text("subject"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 13. Decomposition Cache
export const decompCache = pgTable("decomp_cache", {
  normKey: text("norm_key").primaryKey(),
  plan: jsonb("plan").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 14. LLM Circuit Breaker State
export const llmBreaker = pgTable("llm_breaker", {
  id: smallint("id").primaryKey().default(1),
  failures: smallint("failures").notNull().default(0),
  openUntil: timestamp("open_until", { withTimezone: true }),
});

// 15. Searches
export const searches = pgTable("searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  queryText: text("query_text").notNull(),
  normKey: text("norm_key"),
  mode: text("mode", { enum: ["fast", "full", "degraded"] }).notNull().default("full"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 16. Search Results
export const searchResults = pgTable(
  "search_results",
  {
    searchId: uuid("search_id")
      .notNull()
      .references(() => searches.id, { onDelete: "cascade" }),
    rank: smallint("rank").notNull(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    viaOwnerId: uuid("via_owner_id"),
    mutualPersonId: uuid("mutual_person_id"),
    score: real("score").notNull(),
    rationale: text("rationale"),
  },
  (table) => [
    primaryKey({ columns: [table.searchId, table.rank] }),
  ]
);

// 17. Place & Service Entities (Generic abstraction: restaurants, cafes, gyms, services)
export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull().default("osm"), // "osm" | "manual" | "google"
    providerExternalId: text("provider_external_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull().default("restaurant"), // "restaurant" | "cafe" | "gym" | "service" | "store"
    category: text("category"), // e.g. "Italian", "Coffee Shop", "Bakery", "Fitness"
    address: text("address"),
    city: text("city"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    externalRating: real("external_rating"), // e.g. 4.6
    externalRatingCount: integer("external_rating_count"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("entities_provider_ext_idx").on(table.provider, table.providerExternalId),
    index("entities_type_idx").on(table.type),
    index("entities_city_idx").on(table.city),
    index("entities_name_idx").on(table.name),
  ]
);

// 18. Circle Recommendations (Explicit user endorsements with privacy toggles)
export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    rating: smallint("rating"), // 1 - 5 stars
    note: text("note"), // Shared endorsement quote or personal review note
    isPrivateNote: boolean("is_private_note").notNull().default(true), // Private notes are never shared to circle
    shareWithCircle: boolean("share_with_circle").notNull().default(false), // Explicit opt-in sharing to trusted circle
    source: text("source").notNull().default("manual"), // "manual"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("recommendations_user_entity_idx").on(table.userId, table.entityId),
    index("recommendations_entity_idx").on(table.entityId),
    index("recommendations_user_share_idx").on(table.userId, table.shareWithCircle),
    check("recommendations_rating_check", sql`${table.rating} IS NULL OR (${table.rating} >= 1 AND ${table.rating} <= 5)`),
  ]
);

