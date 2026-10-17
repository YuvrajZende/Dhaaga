import { db } from "../index";
import { contactEdges, personEdges, people } from "../schema";
import { eq, and, sql, or } from "drizzle-orm";

/**
 * Upsert a contact edge (me -> person) with strength and signals payload.
 */
export async function upsertContactEdge(
  userId: string,
  personId: string,
  strength: number,
  signals: Record<string, unknown> = {}
) {
  const clampedStrength = Math.min(100, Math.max(0, Math.round(strength)));

  const result = await db
    .insert(contactEdges)
    .values({
      userId,
      personId,
      strength: clampedStrength,
      signals,
    })
    .onConflictDoUpdate({
      target: [contactEdges.userId, contactEdges.personId],
      set: {
        strength: clampedStrength,
        signals,
      },
    })
    .returning();

  return result[0];
}

/**
 * Upsert a canonical person<->person co-occurrence edge ensuring a_id < b_id.
 */
export async function incrementPersonEdge(
  id1: string,
  id2: string,
  weightIncrement = 10,
  basis = "shared_thread"
) {
  if (id1 === id2) return null;

  // Enforce canonical ordering a_id < b_id
  const [aId, bId] = id1 < id2 ? [id1, id2] : [id2, id1];

  const result = await db
    .insert(personEdges)
    .values({
      aId,
      bId,
      weight: Math.min(100, weightIncrement),
      basis,
    })
    .onConflictDoUpdate({
      target: [personEdges.aId, personEdges.bId],
      set: {
        weight: sql`LEAST(100, ${personEdges.weight} + ${weightIncrement})`,
        basis,
      },
    })
    .returning();

  return result[0];
}

/**
 * Find mutual connections between the user and a target person.
 * A mutual is a contact connected to the user that also has a person_edge with the target.
 */
export async function findMutualConnections(userId: string, targetPersonId: string) {
  // Query for mutuals:
  // user -> mutual (contact_edge with strength > 0)
  // mutual <-> target (person_edge in either order)
  const mutuals = await db
    .select({
      mutualId: people.id,
      displayName: people.displayName,
      avatarUrl: people.avatarUrl,
      title: people.title,
      company: people.company,
      primaryEmail: people.primaryEmail,
      userToMutualStrength: contactEdges.strength,
      mutualToTargetWeight: personEdges.weight,
    })
    .from(contactEdges)
    .innerJoin(people, eq(people.id, contactEdges.personId))
    .innerJoin(
      personEdges,
      or(
        and(eq(personEdges.aId, contactEdges.personId), eq(personEdges.bId, targetPersonId)),
        and(eq(personEdges.bId, contactEdges.personId), eq(personEdges.aId, targetPersonId))
      )
    )
    .where(
      and(
        eq(contactEdges.userId, userId),
        sql`${contactEdges.personId} != ${targetPersonId}`
      )
    )
    .orderBy(sql`${contactEdges.strength} * ${personEdges.weight} DESC`)
    .limit(5);

  return mutuals;
}
