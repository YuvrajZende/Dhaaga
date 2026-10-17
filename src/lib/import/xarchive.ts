/**
 * X (Twitter) archive parser and stager.
 * Implements Phase 5 Task 3.
 *
 * Extracts following/followers data from X archive ZIP files in-memory
 * without persisting the raw ZIP archive to disk.
 *
 * Mutual Social Network Invariant:
 * When both following and follower data are available, only MUTUAL connections
 * (accounts the user follows who also follow the user back) are imported.
 * One-way follows (celebrities, public figures, news media) are excluded.
 */

import { unzipSync, strFromU8 } from "fflate";
import { db } from "../db";
import { syncJobs, importRows, sources } from "../db/schema";

export interface XPersonRow {
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

interface RawXEntry {
  handle: string;
  accountId: string | null;
  displayName: string;
  url: string;
  dedupKey: string;
}

function extractEntriesFromFile(file: { name: string; text: string }): {
  entries: RawXEntry[];
  skipped: number;
} {
  const entries: RawXEntry[] = [];
  let skipped = 0;

  let rawJson = file.text.trim();

  // Strip JS wrapper e.g. "window.YTD.following.part0 = [ ... ];" or "window.YTD.follower.part0 = [ ... ];"
  if (rawJson.startsWith("window.YTD")) {
    rawJson = rawJson.replace(/^window\.YTD\.[a-zA-Z0-9_]+\.part\d+\s*=\s*/, "").trim();
    if (rawJson.endsWith(";")) {
      rawJson = rawJson.slice(0, -1).trim();
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { entries: [], skipped: 1 };
  }

  if (!Array.isArray(parsed)) return { entries: [], skipped: 0 };

  for (const entry of parsed) {
    const item = entry?.following || entry?.follower || entry;
    if (!item || typeof item !== "object") {
      skipped++;
      continue;
    }

    const username = item.username || item.screen_name;
    const accountId = item.accountId || item.id || item.user_id ? String(item.accountId || item.id || item.user_id) : null;
    const userUrl = item.userUrl || item.url;
    const rawName = item.displayName || item.name;

    let handle = "";
    if (username && typeof username === "string") {
      handle = username.trim().replace(/^@/, "");
    } else if (userUrl && typeof userUrl === "string") {
      const match = userUrl.match(/(?:twitter\.com|x\.com)\/(?:intent\/user\?screen_name=)?([A-Za-z0-9_]+)/i);
      if (match && match[1] && !match[1].startsWith("intent")) {
        handle = match[1];
      }
    }

    if (!handle && accountId) {
      handle = `id_${accountId}`;
    }

    if (!handle) {
      skipped++;
      continue;
    }

    const dedupKey = `x:${handle.toLowerCase()}`;
    const displayName = rawName ? String(rawName).trim() : `@${handle}`;
    const url = userUrl ? String(userUrl) : `https://x.com/${handle}`;

    entries.push({
      handle: handle.toLowerCase(),
      accountId,
      displayName,
      url,
      dedupKey,
    });
  }

  return { entries, skipped };
}

export function parseXArchive(files: { name: string; text: string }[]): { rows: XPersonRow[]; skipped: number } {
  const seenKeys = new Set<string>();
  const rows: XPersonRow[] = [];
  let skipped = 0;

  // Separate files into following vs followers
  const followingFiles = files.filter((f) =>
    /(?:^|\/)following\.(?:js|json)$/i.test(f.name)
  );
  const followerFiles = files.filter((f) =>
    /(?:^|\/)follower(?:s)?(?:_\d+)?\.(?:js|json)$/i.test(f.name)
  );

  const followingList: RawXEntry[] = [];
  const followerList: RawXEntry[] = [];

  for (const f of followingFiles) {
    const res = extractEntriesFromFile(f);
    followingList.push(...res.entries);
    skipped += res.skipped;
  }

  for (const f of followerFiles) {
    const res = extractEntriesFromFile(f);
    followerList.push(...res.entries);
    skipped += res.skipped;
  }

  const hasFollowing = followingFiles.length > 0;
  const hasFollowers = followerFiles.length > 0;

  if (hasFollowing && hasFollowers) {
    // MUTUAL CONNECTIONS ONLY
    // When both lists exist, only accounts that follow the user AND are followed back belong in the network.
    // One-way follows (celebrities like Virat Kohli, Messi, brand accounts) are strictly excluded.
    const followerIdentities = new Set<string>();
    for (const f of followerList) {
      followerIdentities.add(f.handle);
      if (f.accountId) followerIdentities.add(f.accountId);
      if (f.dedupKey) followerIdentities.add(f.dedupKey);
    }

    for (const f of followingList) {
      const isMutual =
        followerIdentities.has(f.handle) ||
        (f.accountId && followerIdentities.has(f.accountId)) ||
        followerIdentities.has(f.dedupKey);

      if (!isMutual) {
        skipped++;
        continue;
      }

      if (seenKeys.has(f.dedupKey)) continue;
      seenKeys.add(f.dedupKey);

      rows.push({
        displayName: f.displayName,
        givenName: null,
        familyName: null,
        primaryEmail: null,
        company: null,
        title: "Mutual Connection (X)",
        companyDomain: null,
        connectedOn: null,
        url: f.url,
        dedupKey: f.dedupKey,
      });
    }
  } else if (hasFollowing || hasFollowers) {
    // Single file present (e.g. test fixture or user only uploaded one list)
    const targetEntries = hasFollowing ? followingList : followerList;
    for (const f of targetEntries) {
      if (seenKeys.has(f.dedupKey)) continue;
      seenKeys.add(f.dedupKey);

      rows.push({
        displayName: f.displayName,
        givenName: null,
        familyName: null,
        primaryEmail: null,
        company: null,
        title: hasFollowing ? "X Followee" : "X Follower",
        companyDomain: null,
        connectedOn: null,
        url: f.url,
        dedupKey: f.dedupKey,
      });
    }
  }

  // HTML fallback if no JS/JSON data found
  if (rows.length === 0 && files.some((f) => /\.html$/i.test(f.name))) {
    const htmlFiles = files.filter((f) =>
      /(?:^|\/)(?:following|follower|followers)\.html$/i.test(f.name)
    );

    const IGNORED_HANDLES = new Set(["home", "explore", "notifications", "messages", "settings", "login", "signup"]);

    for (const file of htmlFiles) {
      const regex = /href=["']https?:\/\/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)["']/gi;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(file.text)) !== null) {
        const handle = match[1].toLowerCase();
        if (IGNORED_HANDLES.has(handle)) continue;

        const dedupKey = `x:${handle}`;
        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);

        rows.push({
          displayName: `@${match[1]}`,
          givenName: null,
          familyName: null,
          primaryEmail: null,
          company: null,
          title: "X Connection",
          companyDomain: null,
          connectedOn: null,
          url: `https://x.com/${match[1]}`,
          dedupKey,
        });
      }
    }
  }

  return { rows, skipped };
}

export async function stageXArchive(
  userId: string,
  zipBuffer: Uint8Array
): Promise<{ jobId: string; staged: number; skipped: number }> {
  // Cap ZIP buffer at 250 MB (Twitter/X archives often range from 40MB to 200MB)
  if (zipBuffer.byteLength > 250 * 1024 * 1024) {
    throw new Error("Archive exceeds maximum allowed size of 250 MB.");
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(zipBuffer);
  } catch (err) {
    throw new Error(`Failed to read ZIP archive: ${err instanceof Error ? err.message : String(err)}`);
  }

  const files: { name: string; text: string }[] = [];
  for (const [filename, data] of Object.entries(unzipped)) {
    if (/(?:following|follower|followers)(?:_\d+)?\.(?:js|json|html)$/i.test(filename)) {
      try {
        files.push({ name: filename, text: strFromU8(data) });
      } catch {
        // Skip unreadable files
      }
    }
  }

  if (files.length === 0) {
    throw new Error("No following or followers data found in this archive. Please ensure you uploaded your Twitter/X data archive.");
  }

  const { rows, skipped } = parseXArchive(files);

  if (rows.length === 0) {
    throw new Error("No mutual connections found in this archive. Only accounts that you follow who also follow you back are added to your network.");
  }

  // Record active or syncing source status
  await db
    .insert(sources)
    .values({
      userId,
      type: "x_import",
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
      source: "x_import",
      kind: "initial",
      status: "queued",
      totalHint: rows.length,
    })
    .returning();

  if (!job) {
    throw new Error("Failed to create sync job for X import.");
  }

  // Batch insert into import_rows (500 items per batch)
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
