/**
 * LinkedIn connections export parser and stager.
 * Implements Phase 5 Task 2.
 *
 * Handles preamble notes from LinkedIn exports, maps columns to schema,
 * builds canonical dedup keys (canonical email to enrich Google contacts,
 * else n:name@domain), and stages rows into import_rows table.
 */

import { parseCSV } from "./parse-csv";
import { buildDedupKey, extractDomain } from "../sync/dedup";
import { db } from "../db";
import { syncJobs, importRows, sources } from "../db/schema";

export interface LinkedInPersonRow {
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

export function mapLinkedInRows(csvText: string): { rows: LinkedInPersonRow[]; skipped: number } {
  const allRows = parseCSV(csvText);
  if (allRows.length === 0) return { rows: [], skipped: 0 };

  // Find header row containing "First Name" (ignoring preamble)
  let headerIndex = -1;
  for (let i = 0; i < allRows.length; i++) {
    const rowStr = allRows[i].map((c) => c.toLowerCase().trim());
    if (rowStr.includes("first name") && rowStr.includes("last name")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return { rows: [], skipped: 0 };
  }

  const header = allRows[headerIndex].map((c) => c.toLowerCase().trim());
  const fnIdx = header.indexOf("first name");
  const lnIdx = header.indexOf("last name");
  const urlIdx = header.indexOf("url");
  const emailIdx = header.indexOf("email address");
  const compIdx = header.indexOf("company");
  const posIdx = header.indexOf("position");
  const dateIdx = header.indexOf("connected on");

  const rows: LinkedInPersonRow[] = [];
  let skipped = 0;

  for (let i = headerIndex + 1; i < allRows.length; i++) {
    const row = allRows[i];
    const givenName = fnIdx !== -1 && row[fnIdx] ? row[fnIdx].trim() : null;
    const familyName = lnIdx !== -1 && row[lnIdx] ? row[lnIdx].trim() : null;

    const parts = [givenName, familyName].filter(Boolean);
    const displayName = parts.join(" ").trim();

    if (!displayName) {
      skipped++;
      continue;
    }

    const primaryEmail =
      emailIdx !== -1 && row[emailIdx] && row[emailIdx].includes("@")
        ? row[emailIdx].trim().toLowerCase()
        : null;
    const company = compIdx !== -1 && row[compIdx] ? row[compIdx].trim() : null;
    const title = posIdx !== -1 && row[posIdx] ? row[posIdx].trim() : null;
    const url = urlIdx !== -1 && row[urlIdx] ? row[urlIdx].trim() : null;
    const connectedOn = dateIdx !== -1 && row[dateIdx] ? row[dateIdx].trim() : null;

    const companyDomain = primaryEmail ? extractDomain(primaryEmail) : null;
    const dedupKey = buildDedupKey(primaryEmail, displayName, companyDomain);

    rows.push({
      displayName,
      givenName,
      familyName,
      primaryEmail,
      company,
      title,
      companyDomain,
      connectedOn,
      url,
      dedupKey,
    });
  }

  return { rows, skipped };
}

export async function stageLinkedInImport(
  userId: string,
  csvText: string
): Promise<{ jobId: string; staged: number; skipped: number }> {
  // Cap at 10 MB and 50k rows
  if (csvText.length > 10 * 1024 * 1024) {
    throw new Error("File exceeds maximum allowed size of 10 MB.");
  }

  const { rows, skipped } = mapLinkedInRows(csvText);

  if (rows.length > 50000) {
    throw new Error("File exceeds maximum limit of 50,000 connections.");
  }

  // Record active or syncing source status
  await db
    .insert(sources)
    .values({
      userId,
      type: "linkedin_import",
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
      source: "linkedin_import",
      kind: "initial",
      status: "queued",
      totalHint: rows.length,
    })
    .returning();

  if (!job) {
    throw new Error("Failed to create sync job for LinkedIn import.");
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
