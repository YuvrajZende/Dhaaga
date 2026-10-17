/**
 * Facebook archive & export parser and stager.
 * Supports official Meta "Download Your Information" exports:
 * - ZIP archive containing friends_and_followers/friends.json or friends.json (or HTML fallback)
 * - Direct JSON file upload (friends.json)
 */

import { unzipSync, strFromU8 } from "fflate";
import { db } from "../db";
import { syncJobs, importRows, sources } from "../db/schema";
import { buildDedupKey } from "../sync/dedup";

export interface FacebookPersonRow {
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

export function parseFacebookExport(
  files: { name: string; text: string }[]
): { rows: FacebookPersonRow[]; skipped: number } {
  const seenKeys = new Set<string>();
  const rows: FacebookPersonRow[] = [];
  let skipped = 0;

  // 1. Process JSON files (friends.json, friends_v2.json, etc.)
  const jsonFiles = files.filter((f) =>
    /(?:^|\/)(?:friends(?:_v\d+)?)\.json$/i.test(f.name)
  );

  for (const file of jsonFiles) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.text.trim());
    } catch {
      continue;
    }

    let entries: unknown[] = [];
    if (Array.isArray(parsed)) {
      entries = parsed;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.friends_v2)) {
        entries = obj.friends_v2;
      } else if (Array.isArray(obj.friends)) {
        entries = obj.friends;
      } else if (Array.isArray(obj.data)) {
        entries = obj.data;
      }
    }

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        skipped++;
        continue;
      }

      const item = entry as Record<string, unknown>;
      const rawName = item.name || item.title;
      if (!rawName || typeof rawName !== "string" || !rawName.trim()) {
        skipped++;
        continue;
      }

      const displayName = rawName.trim();

      // Split name parts
      const parts = displayName.split(/\s+/);
      const givenName = parts[0] || null;
      const familyName = parts.length > 1 ? parts.slice(1).join(" ") : null;

      // Extract contact info (email) if shared in Facebook export
      let primaryEmail: string | null = null;
      if (typeof item.contact_info === "string" && item.contact_info.includes("@")) {
        primaryEmail = item.contact_info.trim().toLowerCase();
      }

      // Timestamp conversion (Meta timestamps are epoch seconds)
      let connectedOn: string | null = null;
      if (typeof item.timestamp === "number" && item.timestamp > 0) {
        const ms = item.timestamp > 1e11 ? item.timestamp : item.timestamp * 1000;
        connectedOn = new Date(ms).toISOString();
      }

      // If email present, enrich existing contacts via canonical email; else use name@facebook.com
      const dedupKey = buildDedupKey(primaryEmail, displayName, "facebook.com");
      if (seenKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);

      rows.push({
        displayName,
        givenName,
        familyName,
        primaryEmail,
        company: null,
        title: "Facebook Friend",
        companyDomain: null,
        connectedOn,
        url: null,
        dedupKey,
      });
    }
  }

  // 2. HTML Fallback if no valid rows found from JSON
  if (rows.length === 0) {
    const htmlFiles = files.filter((f) =>
      /(?:^|\/)friends\.html$/i.test(f.name)
    );

    for (const file of htmlFiles) {
      // Look for list items or divs with friend names
      const regex = /<li[^>]*>([^<]+)<\/li>|<div class="[^"]*">([^<]+)<\/div>/gi;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(file.text)) !== null) {
        const text = (match[1] || match[2] || "").trim();
        // Ignore generic labels
        if (!text || text.length > 50 || text.includes("Friends") || text.includes("Facebook")) {
          continue;
        }

        const dedupKey = buildDedupKey(null, text, "facebook.com");
        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);

        const parts = text.split(/\s+/);
        rows.push({
          displayName: text,
          givenName: parts[0] || null,
          familyName: parts.length > 1 ? parts.slice(1).join(" ") : null,
          primaryEmail: null,
          company: null,
          title: "Facebook Friend",
          companyDomain: null,
          connectedOn: null,
          url: null,
          dedupKey,
        });
      }
    }
  }

  return { rows, skipped };
}

export async function stageFacebookArchive(
  userId: string,
  buffer: Uint8Array,
  filename: string
): Promise<{ jobId: string; staged: number; skipped: number }> {
  // Cap at 250 MB
  if (buffer.byteLength > 250 * 1024 * 1024) {
    throw new Error("File exceeds maximum allowed size of 250 MB.");
  }

  const files: { name: string; text: string }[] = [];

  if (filename.toLowerCase().endsWith(".json")) {
    const text = new TextDecoder("utf-8").decode(buffer);
    files.push({ name: filename, text });
  } else {
    // Unzip
    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(buffer);
    } catch (err) {
      throw new Error(`Failed to read ZIP archive: ${err instanceof Error ? err.message : String(err)}`);
    }

    for (const [name, data] of Object.entries(unzipped)) {
      if (/(?:friends(?:_v\d+)?)\.(?:json|html)$/i.test(name)) {
        try {
          files.push({ name, text: strFromU8(data) });
        } catch {
          // Skip unreadable
        }
      }
    }
  }

  if (files.length === 0) {
    throw new Error("No friends data found. Please upload your Facebook data archive ZIP or friends.json.");
  }

  const { rows, skipped } = parseFacebookExport(files);

  if (rows.length === 0) {
    throw new Error("No friends could be extracted from this Facebook export.");
  }

  // Record active or syncing source status
  await db
    .insert(sources)
    .values({
      userId,
      type: "facebook_import",
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
      source: "facebook_import",
      kind: "initial",
      status: "queued",
      totalHint: rows.length,
    })
    .returning();

  if (!job) {
    throw new Error("Failed to create sync job for Facebook import.");
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
