/**
 * Server-Sent Events (SSE) formatter for search streaming.
 * Adheres strictly to LLD §6.5 wire format.
 */

import { CandidateCard, SearchMode, SearchStage, SearchTimings } from "./types";
import { PlaceCard } from "../places/types";

export interface SSEWriter {
  sendStage: (stage: SearchStage, count?: number) => void;
  sendResults: (
    searchId: string,
    mode: SearchMode,
    results: CandidateCard[] | PlaceCard[],
    target?: "person" | "place",
    locationLabel?: string | null,
    needsLocationPrompt?: boolean
  ) => void;
  sendDone: (timings: SearchTimings) => void;
  sendError: (code: string, message: string, retryable?: boolean) => void;
  close: () => void;
}

/**
 * Formats an SSE message block with event and data lines.
 */
export function formatSSEMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Creates a TransformStream or controller-based SSE writer for Next.js responses.
 */
export function createSSESteam() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const writer: SSEWriter = {
    sendStage(stage: SearchStage, count?: number) {
      const payload: Record<string, unknown> = { stage };
      if (count !== undefined) payload.count = count;
      controller.enqueue(encoder.encode(formatSSEMessage("stage", payload)));
    },

    sendResults(
      searchId: string,
      mode: SearchMode,
      results: CandidateCard[] | PlaceCard[],
      target: "person" | "place" = "person",
      locationLabel?: string | null,
      needsLocationPrompt?: boolean
    ) {
      controller.enqueue(
        encoder.encode(
          formatSSEMessage("results", {
            searchId,
            mode,
            target,
            results,
            ...(locationLabel ? { locationLabel } : {}),
            ...(needsLocationPrompt !== undefined ? { needsLocationPrompt } : {}),
          })
        )
      );
    },

    sendDone(timings: SearchTimings) {
      controller.enqueue(
        encoder.encode(
          formatSSEMessage("done", {
            timings: {
              decomposeMs: timings.decomposeMs,
              annMs: timings.annMs,
              rerankMs: timings.rerankMs,
              totalMs: timings.totalMs,
            },
          })
        )
      );
    },

    sendError(code: string, message: string, retryable = false) {
      controller.enqueue(
        encoder.encode(
          formatSSEMessage("error", {
            code,
            message,
            retryable,
          })
        )
      );
    },

    close() {
      try {
        controller.close();
      } catch {
        // stream already closed
      }
    },
  };

  return { stream, writer };
}
