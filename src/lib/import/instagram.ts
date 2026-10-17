/**
 * Instagram archive & export parser and stager.
 * Supports official Meta "Download Your Information" exports:
 * - ZIP archive containing following.json / followers_1.json (or HTML fallback)
 * - Direct JSON file upload (following.json / followers.json)
 *
 * Mutual Social Network Invariant:
 * When both following and follower data are available, only MUTUAL connections
 * (accounts the user follows who also follow the user back) are imported.
 * One-way follows (celebrities, public figures, news media) are excluded.
 */

import { unzipSync, strFromU8 } from "fflate";
import { db } from "../db";
import { syncJobs, importRows, sources } from "../db/schema";

export interface InstagramPersonRow {
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  primaryEmail: string | null;
  company: string | null;
  title: string | null;
  companyDomain: string | null;
  connectedOn: string | null;
  url: string | null;
  dedupKey: string;
}

interface RawIGEntry {
  username: string;
  profileUrl: string | null;
  connectedOn: string | null;
  dedupKey: string;
}

const IGNORED_IG_HANDLES = new Set([
  "about",
  "legal",
  "explore",
  "accounts",
  "developer",
  "direct",
  "reels",
  "stories",
  "p",
  "tv",
  "privacy",
  "terms",
  "help",
]);

function extractIGEntries(file: { name: string; text: string }): {
  entries: RawIGEntry[];
  skipped: number;
} {
  const entries: RawIGEntry[] = [];
  let skipped = 0;

  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text.trim());
  } catch {
    return { entries: [], skipped: 1 };
  }

  // Normalize entries: can be { relationships_following: [...] } or array [...]
  let rawList: unknown[] = [];
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.relationships_following)) {
      rawList = obj.relationships_following;
    } else if (Array.isArray(obj.relationships_followers)) {
      rawList = obj.relationships_followers;
    } else if (Array.isArray(obj.data)) {
      rawList = obj.data;
    }
  }

  for (const entry of rawList) {
    if (!entry || typeof entry !== "object") {
      skipped++;
      continue;
    }

    const item = entry as Record<string, unknown>;
    let username = "";
    let timestamp: number | null = null;
    let profileUrl: string | null = null;

    // Meta structure: string_list_data: [{ href, value, timestamp }]
    if (Array.isArray(item.string_list_data) && item.string_list_data.length > 0) {
      const first = item.string_list_data[0] as Record<string, unknown>;
      if (typeof first.value === "string" && first.value.trim()) {
        username = first.value.trim();
      }
      if (typeof first.href === "string" && first.href.trim()) {
        profileUrl = first.href.trim();
        if (!username) {
          const match = first.href.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
          if (match && match[1]) username = match[1];
        }
      }
      if (typeof first.timestamp === "number") {
        timestamp = first.timestamp;
      }
    }

    // Alternate structure: title: "username" or username field
    if (!username && typeof item.title === "string" && item.title.trim()) {
      username = item.title.trim();
    }
    if (!username && typeof item.username === "string" && item.username.trim()) {
      username = item.username.trim();
    }

    username = username.replace(/^@/, "").trim().toLowerCase();
    if (!username || IGNORED_IG_HANDLES.has(username)) {
      skipped++;
      continue;
    }

    const dedupKey = `ig:${username}`;
    let connectedOn: string | null = null;
    if (timestamp) {
      const ms = timestamp > 1e11 ? timestamp : timestamp * 1000;
      connectedOn = new Date(ms).toISOString();
    }

    entries.push({
      username,
      profileUrl: profileUrl || `https://www.instagram.com/${username}`,
      connectedOn,
      dedupKey,
    });
  }

  return { entries, skipped };
}

export function parseInstagramExport(
  files: { name: string; text: string }[]
): { rows: InstagramPersonRow[]; skipped: number } {
  const seenKeys = new Set<string>();
  const rows: InstagramPersonRow[] = [];
  let skipped = 0;

  // Separate JSON files into following vs followers
  const followingFiles = files.filter((f) =>
    /(?:^|\/)following\.json$/i.test(f.name)
  );
  const followerFiles = files.filter((f) =>
    /(?:^|\/)followers(?:_\d+)?\.json$/i.test(f.name)
  );

  const followingList: RawIGEntry[] = [];
  const followerList: RawIGEntry[] = [];

  for (const f of followingFiles) {
    const res = extractIGEntries(f);
    followingList.push(...res.entries);
    skipped += res.skipped;
  }

  for (const f of followerFiles) {
    const res = extractIGEntries(f);
    followerList.push(...res.entries);
    skipped += res.skipped;
  }

  const hasFollowing = followingFiles.length > 0;
  const hasFollowers = followerFiles.length > 0;

  if (hasFollowing && hasFollowers) {
    // MUTUAL CONNECTIONS ONLY
    // When both lists exist, exclude one-way follows (celebrities, public figures, news media)
    const followerUsernames = new Set(followerList.map((f) => f.username));

    for (const f of followingList) {
      if (!followerUsernames.has(f.username)) {
        skipped++;
        continue;
      }

      if (seenKeys.has(f.dedupKey)) continue;
      seenKeys.add(f.dedupKey);

      rows.push({
        displayName: `@${f.username}`,
        givenName: null,
        familyName: null,
        primaryEmail: null,
        company: null,
        title: "Mutual Connection (Instagram)",
        companyDomain: null,
        connectedOn: f.connectedOn,
        url: f.profileUrl,
        dedupKey: f.dedupKey,
      });
    }
  } else if (hasFollowing || hasFollowers) {
    // Fallback if only single file uploaded
    const targetEntries = hasFollowing ? followingList : followerList;
    for (const f of targetEntries) {
      if (seenKeys.has(f.dedupKey)) continue;
      seenKeys.add(f.dedupKey);

      rows.push({
        displayName: `@${f.username}`,
        givenName: null,
        familyName: null,
        primaryEmail: null,
        company: null,
        title: "Instagram Connection",
        companyDomain: null,
        connectedOn: f.connectedOn,
        url: f.profileUrl,
        dedupKey: f.dedupKey,
      });
    }
  }

  // 2. HTML Fallback if no valid rows found from JSON
  if (rows.length === 0) {
    const htmlFiles = files.filter((f) =>
      /(?:^|\/)(?:following|followers)\.html$/i.test(f.name)
    );

    for (const file of htmlFiles) {
      const regex = /href=["']https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)\/?["']/gi;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(file.text)) !== null) {
        const username = match[1].toLowerCase();
        if (IGNORED_IG_HANDLES.has(username)) continue;

        const dedupKey = `ig:${username}`;
        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);

        rows.push({
          displayName: `@${match[1]}`,
          givenName: null,
          familyName: null,
          primaryEmail: null,
          company: null,
          title: "Instagram Connection",
          companyDomain: null,
          connectedOn: null,
          url: `https://www.instagram.com/${match[1]}`,
          dedupKey,
        });
      }
    }
  }

  return { rows, skipped };
}

export async function stageInstagramExport(
  userId: string,
  buffer: Uint8Array,
  filename: string
): Promise<{ jobId: string; staged: number; skipped: number }> {
  // Cap ZIP/file buffer at 250 MB
  if (buffer.byteLength > 250 * 1024 * 1024) {
    throw new Error("File exceeds maximum allowed size of 250 MB.");
  }

  const files: { name: string; text: string }[] = [];

  if (filename.endsWith(".json")) {
    try {
      files.push({ name: filename, text: strFromU8(buffer) });
    } catch (err) {
      throw new Error(`Failed to read JSON file: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    // ZIP Archive
    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(buffer);
    } catch (err) {
      throw new Error(`Failed to read ZIP archive: ${err instanceof Error ? err.message : String(err)}`);
    }

    for (const [name, data] of Object.entries(unzipped)) {
      if (/(?:following|followers(?:_\d+)?)\.(?:json|html)$/i.test(name)) {
        try {
          files.push({ name, text: strFromU8(data) });
        } catch {
          // Skip unreadable
        }
      }
    }
  }

  if (files.length === 0) {
    throw new Error("No following or followers data found. Please upload your Instagram data archive ZIP or following.json.");
  }

  const { rows, skipped } = parseInstagramExport(files);

  if (rows.length === 0) {
    throw new Error("No mutual connections found in this Instagram export. Only accounts you follow who also follow you back are added.");
  }

  // Record active or syncing source status
  await db
    .insert(sources)
    .values({
      userId,
      type: "instagram_import",
      status: "syncing",
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [sources.userId, sources.type],
      set: {
        status: "syncing",
        lastSyncedAt: new Date(),
      },
    });

  // Create sync job
  const [job] = await db
    .insert(syncJobs)
    .values({
      userId,
      source: "instagram_import",
      kind: "initial",
      status: "queued",
      totalHint: rows.length,
    })
    .returning();

  if (!job) {
    throw new Error("Failed to create sync job for Instagram import.");
  }

  // Batch insert into import_rows (500 per batch)
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize).map((r, offset) => ({
      jobId: job.id,
      idx: i + offset,
      payload: r,
      processed: false,
    }));

    await db.insert(importRows).values(chunk);
  }

  return { jobId: job.id, staged: rows.length, skipped };
}

export const stageInstagramArchive = stageInstagramExport;

