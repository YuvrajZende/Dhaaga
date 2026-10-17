/**
 * Embedding queue worker.
 * Drains the embedding_queue table by generating local ONNX embeddings
 * for person profiles using all-MiniLM-L6-v2.
 *
 * This module is also called automatically after each sync chunk
 * by the engine (drainEmbeddingQueue). This file re-exports the
 * queue processing logic for standalone use.
 */

import { db } from "../db";
import { embeddingQueue, people, embeddings } from "../db/schema";
import { eq } from "drizzle-orm";
import { embedText, EMBEDDING_MODEL_VERSION } from "./model";

/**
 * Processes up to `limit` items from the embedding queue.
 * Returns the number of embeddings generated.
 */
export async function processEmbeddingQueue(limit = 64): Promise<number> {
  const queued = await db
    .select({
      personId: embeddingQueue.personId,
      ownerUserId: embeddingQueue.ownerUserId,
    })
    .from(embeddingQueue)
    .limit(limit);

  if (queued.length === 0) return 0;

  let processed = 0;

  for (const item of queued) {
    try {
      const [person] = await db
        .select()
        .from(people)
        .where(eq(people.id, item.personId))
        .limit(1);

      if (!person) {
        await db
          .delete(embeddingQueue)
          .where(eq(embeddingQueue.personId, item.personId));
        continue;
      }

      // Build share-safe embedding text: name | title | company | location | headline | tags
      // Strictly exclude private personal notes (bio) and primaryEmail to prevent semantic inversion leaks
      const parts = [
        person.displayName,
        person.title,
        person.company,
        person.location ? `location: ${person.location}` : null,
        person.headline,
        Array.isArray(person.tags) && person.tags.length > 0
          ? `skills/hobbies/interests: ${(person.tags as string[]).join(", ")}`
          : null,
      ].filter(Boolean);

      const text = parts.join(" | ");
      const vec = await embedText(text);

      await db
        .insert(embeddings)
        .values({
          personId: item.personId,
          ownerUserId: item.ownerUserId,
          vec,
          modelVersion: EMBEDDING_MODEL_VERSION,
          embeddedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: embeddings.personId,
          set: {
            vec,
            modelVersion: EMBEDDING_MODEL_VERSION,
            embeddedAt: new Date(),
          },
        });

      await db
        .delete(embeddingQueue)
        .where(eq(embeddingQueue.personId, item.personId));

      processed++;
    } catch (error) {
      console.error(
        `Embedding failed for person ${item.personId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return processed;
}
