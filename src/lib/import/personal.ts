/**
 * Personal Contacts, Hobbies & Career Import Module.
 * Parses CSV/JSON datasets containing personal data (hobbies, career, skills, notes)
 * and upserts them directly into the user's private network with immediate vectorization.
 */

import { parseCSV } from "./parse-csv";
import { buildDedupKey } from "../sync/dedup";
import { db } from "../db";
import { people, contactEdges, embeddingQueue } from "../db/schema";
import { upsertPerson } from "../db/repo/people";
import { processEmbeddingQueue } from "../embed/queue";
import { sql } from "drizzle-orm";

export interface PersonalContactInput {
  displayName: string;
  givenName?: string | null;
  familyName?: string | null;
  primaryEmail?: string | null;
  title?: string | null; // Career / Profession
  company?: string | null;
  location?: string | null; // City / Location
  hobbies?: string[] | string | null;
  skills?: string[] | string | null;
  bio?: string | null; // Personal notes / description
  phone?: string | null;
  headline?: string | null;
  tags?: string[] | null;
}

/**
 * Normalizes an array or comma-separated string into a clean list of unique lowercase tags.
 */
export function extractCleanTags(input?: string[] | string | null): string[] {
  if (!input) return [];
  const rawList = Array.isArray(input) ? input : String(input).split(/[,;|•\n]/);
  const seen = new Set<string>();

  for (const item of rawList) {
    const cleaned = item.trim().toLowerCase().replace(/^#/, "");
    if (cleaned && cleaned.length >= 2 && cleaned.length <= 50) {
      seen.add(cleaned);
      // If tag is multi-word like "playing guitar", also add "guitar" if meaningful
      if (cleaned.startsWith("playing ")) {
        const noun = cleaned.replace("playing ", "").trim();
        if (noun.length >= 2) seen.add(noun);
      }
    }
  }

  return Array.from(seen);
}

/**
 * Parses raw CSV or JSON text into normalized PersonalContactInput objects.
 */
export function parsePersonalData(rawText: string): PersonalContactInput[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // 1. Try parsing as JSON first
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : (parsed.contacts || parsed.people || [parsed]);
      return list
        .map((item: any) => {
          const name =
            item.displayName ||
            item.name ||
            [item.givenName || item.firstName || item.first_name, item.familyName || item.lastName || item.last_name]
              .filter(Boolean)
              .join(" ")
              .trim();

          if (!name) return null;

          const hobbies = item.hobbies || item.hobby || item.interests || item.interest;
          const skills = item.skills || item.skill || item.tags || item.tag || item.expertise;
          const combinedTags = Array.from(
            new Set([...extractCleanTags(hobbies), ...extractCleanTags(skills), ...extractCleanTags(item.tags)])
          );

          let bio = (item.bio || item.notes || item.note || item.about || item.description || "").trim();
          const hobbiesList = extractCleanTags(hobbies);
          if (hobbiesList.length > 0 && !bio.toLowerCase().includes("hobbi")) {
            bio = bio ? `${bio}\nHobbies & Interests: ${hobbiesList.join(", ")}` : `Hobbies & Interests: ${hobbiesList.join(", ")}`;
          }

          return {
            displayName: name,
            givenName: item.givenName || item.firstName || null,
            familyName: item.familyName || item.lastName || null,
            primaryEmail: item.primaryEmail || item.email || null,
            title: item.title || item.career || item.profession || item.role || item.occupation || null,
            company: item.company || item.organization || item.org || null,
            location: item.location || item.city || item.address || null,
            bio: bio || null,
            headline: item.headline || (item.title ? `${item.title}${item.company ? ` at ${item.company}` : ""}` : null),
            tags: combinedTags,
            phone: item.phone || item.phoneNumber || item.mobile || null,
          } as PersonalContactInput;
        })
        .filter(Boolean) as PersonalContactInput[];
    } catch {
      // Not valid JSON, fall through to CSV
    }
  }

  // 2. Parse as CSV
  const allRows = parseCSV(trimmed);
  if (allRows.length < 2) return [];

  // Identify header row
  let headerIndex = -1;
  for (let i = 0; i < Math.min(allRows.length, 5); i++) {
    const rowLower = allRows[i].map((c) => c.toLowerCase().trim());
    if (
      rowLower.some((c) => c.includes("name") || c.includes("first") || c.includes("career") || c.includes("email"))
    ) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) headerIndex = 0;

  const header = allRows[headerIndex].map((c) => c.toLowerCase().trim());

  const findCol = (terms: string[]) =>
    header.findIndex((h) => terms.some((t) => h.includes(t)));

  const nameIdx = findCol(["full name", "display name", "fullname", "name"]);
  const fnIdx = findCol(["first name", "firstname", "given name"]);
  const lnIdx = findCol(["last name", "lastname", "family name"]);
  const emailIdx = findCol(["email", "primary email", "mail"]);
  const titleIdx = findCol(["career", "profession", "title", "role", "job", "occupation", "position"]);
  const compIdx = findCol(["company", "organization", "org", "employer", "workplace"]);
  const hobbyIdx = findCol(["hobbies", "hobby", "interests", "interest", "leisure"]);
  const skillIdx = findCol(["skills", "skill", "tags", "tag", "expertise"]);
  const bioIdx = findCol(["bio", "notes", "note", "about", "description", "details"]);
  const phoneIdx = findCol(["phone", "mobile", "contact", "cell"]);
  const locIdx = findCol(["location", "city", "address", "town", "country", "place"]);

  const results: PersonalContactInput[] = [];

  for (let i = headerIndex + 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (row.length === 0 || row.every((c) => !c.trim())) continue;

    let displayName = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].trim() : "";
    const givenName = fnIdx !== -1 && row[fnIdx] ? row[fnIdx].trim() : null;
    const familyName = lnIdx !== -1 && row[lnIdx] ? row[lnIdx].trim() : null;

    if (!displayName) {
      displayName = [givenName, familyName].filter(Boolean).join(" ").trim();
    }

    if (!displayName) continue;

    const email = emailIdx !== -1 && row[emailIdx] ? row[emailIdx].trim() : null;
    const title = titleIdx !== -1 && row[titleIdx] ? row[titleIdx].trim() : null;
    const company = compIdx !== -1 && row[compIdx] ? row[compIdx].trim() : null;
    const location = locIdx !== -1 && row[locIdx] ? row[locIdx].trim() : null;
    const rawHobbies = hobbyIdx !== -1 && row[hobbyIdx] ? row[hobbyIdx].trim() : null;
    const rawSkills = skillIdx !== -1 && row[skillIdx] ? row[skillIdx].trim() : null;
    let bio = bioIdx !== -1 && row[bioIdx] ? row[bioIdx].trim() : "";
    const phone = phoneIdx !== -1 && row[phoneIdx] ? row[phoneIdx].trim() : null;

    const hobbiesList = extractCleanTags(rawHobbies);
    const skillsList = extractCleanTags(rawSkills);
    const combinedTags = Array.from(new Set([...hobbiesList, ...skillsList]));

    if (hobbiesList.length > 0 && !bio.toLowerCase().includes("hobbi")) {
      bio = bio ? `${bio}\nHobbies: ${hobbiesList.join(", ")}` : `Hobbies: ${hobbiesList.join(", ")}`;
    }

    results.push({
      displayName,
      givenName,
      familyName,
      primaryEmail: email,
      title,
      company,
      location: location || null,
      bio: bio || null,
      headline: title ? `${title}${company ? ` at ${company}` : ""}` : null,
      tags: combinedTags,
      phone,
    });
  }

  return results;
}

/**
 * Imports a batch of personal contacts directly into people table,
 * sets contact edges with strength 65 (warm personal contact),
 * and immediately drains embedding queue.
 */
export async function importPersonalContacts(
  userId: string,
  contacts: PersonalContactInput[]
): Promise<{ imported: number; ids: string[] }> {
  if (contacts.length === 0) return { imported: 0, ids: [] };

  const ids: string[] = [];

  for (const c of contacts) {
    const dedupKey = buildDedupKey(c.primaryEmail, c.displayName, c.company);

    const person = await upsertPerson(userId, {
      displayName: c.displayName,
      givenName: c.givenName ?? null,
      familyName: c.familyName ?? null,
      primaryEmail: c.primaryEmail ?? null,
      title: c.title ?? null,
      company: c.company ?? null,
      location: c.location ?? null,
      headline: c.headline ?? null,
      bio: c.bio ?? null,
      tags: c.tags ?? [],
      dedupKey,
      sourceRefs: [
        {
          source: "personal_import",
          sourceId: c.primaryEmail || `${c.displayName}_${Date.now()}`,
        },
      ],
    });

    if (person) {
      ids.push(person.id);

      // Contact edge: direct personal connection (strength 65)
      await db
        .insert(contactEdges)
        .values({
          userId,
          personId: person.id,
          strength: 65,
          signals: {
            sourcesPresent: ["personal_import"],
            phone: c.phone || null,
            notes: c.bio || null,
          },
        })
        .onConflictDoUpdate({
          target: [contactEdges.userId, contactEdges.personId],
          set: {
            strength: sql`GREATEST(${contactEdges.strength}, 65)`,
            signals: sql`
              jsonb_set(
                ${contactEdges.signals},
                '{sourcesPresent}',
                (
                  SELECT jsonb_agg(DISTINCT x)
                  FROM jsonb_array_elements_text(COALESCE(${contactEdges.signals}->'sourcesPresent', '[]'::jsonb) || '["personal_import"]'::jsonb) AS x
                )
              )
            `,
          },
        });

      // Queue for embedding
      await db
        .insert(embeddingQueue)
        .values({ personId: person.id, ownerUserId: userId })
        .onConflictDoNothing();
    }
  }

  // Immediately drain embedding queue for real-time semantic availability
  try {
    await processEmbeddingQueue(Math.max(64, contacts.length));
  } catch (err) {
    console.warn("Background embedding process notice:", err);
  }

  return { imported: ids.length, ids };
}
