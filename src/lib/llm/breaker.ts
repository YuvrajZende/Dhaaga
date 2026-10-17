/**
 * Circuit breaker for LLM calls (OpenRouter).
 * Per LLD §7.6 & FR-D7:
 * - 3 consecutive failures -> open_until = now() + 5 minutes
 * - When circuit is open, skip LLM calls and degrade gracefully immediately.
 */

import { db } from "../db";
import { llmBreaker } from "../db/schema";
import { eq } from "drizzle-orm";

const BREAKER_ID = 1;
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export interface BreakerState {
  isOpen: boolean;
  failures: number;
  openUntil: Date | null;
}

/**
 * Checks if the LLM circuit breaker is currently open (blocking LLM calls).
 */
export async function isCircuitOpen(): Promise<boolean> {
  try {
    const [record] = await db
      .select()
      .from(llmBreaker)
      .where(eq(llmBreaker.id, BREAKER_ID))
      .limit(1);

    if (!record) return false;

    if (record.openUntil && new Date(record.openUntil).getTime() > Date.now()) {
      return true;
    }

    return false;
  } catch (error) {
    console.warn("Could not check circuit breaker state, assuming closed:", error);
    return false;
  }
}

/**
 * Records a successful LLM invocation, resetting failure count.
 */
export async function recordSuccess(): Promise<void> {
  try {
    await db
      .insert(llmBreaker)
      .values({
        id: BREAKER_ID,
        failures: 0,
        openUntil: null,
      })
      .onConflictDoUpdate({
        target: llmBreaker.id,
        set: {
          failures: 0,
          openUntil: null,
        },
      });
  } catch (error) {
    console.warn("Could not record circuit breaker success:", error);
  }
}

/**
 * Records an LLM invocation failure. If failures >= 3, opens the circuit for 5 minutes.
 */
export async function recordFailure(): Promise<void> {
  try {
    const [existing] = await db
      .select()
      .from(llmBreaker)
      .where(eq(llmBreaker.id, BREAKER_ID))
      .limit(1);

    const newFailures = (existing?.failures ?? 0) + 1;
    const shouldOpen = newFailures >= FAILURE_THRESHOLD;
    const openUntil = shouldOpen ? new Date(Date.now() + COOLDOWN_MS) : null;

    await db
      .insert(llmBreaker)
      .values({
        id: BREAKER_ID,
        failures: newFailures,
        openUntil,
      })
      .onConflictDoUpdate({
        target: llmBreaker.id,
        set: {
          failures: newFailures,
          openUntil: shouldOpen ? openUntil : existing?.openUntil ?? null,
        },
      });

    if (shouldOpen) {
      console.warn(`[CircuitBreaker] LLM circuit opened until ${openUntil?.toISOString()} after ${newFailures} failures`);
    }
  } catch (error) {
    console.warn("Could not record circuit breaker failure:", error);
  }
}
