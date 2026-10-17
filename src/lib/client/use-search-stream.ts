import { useCallback, useEffect, useRef, useState } from "react";
import { CandidateCard, SearchMode, SearchTimings } from "../search/types";
import { PlaceCard, LocationContext } from "../places/types";
import { parseSSEFrames, SearchSSEEvent } from "./sse-parse";

export type SearchStatus =
  | "idle"
  | "planning"
  | "searches"
  | "ranking"
  | "places"
  | "circle"
  | "done"
  | "error";

export interface SearchStreamState {
  status: SearchStatus;
  stageCount: number | null;
  target: "person" | "place";
  results: CandidateCard[];
  placeResults: PlaceCard[];
  locationLabel: string | null;
  needsLocationPrompt: boolean;
  searchId: string | null;
  mode: SearchMode | null;
  timings: SearchTimings | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

const INITIAL: SearchStreamState = {
  status: "idle",
  stageCount: null,
  target: "person",
  results: [],
  placeResults: [],
  locationLabel: null,
  needsLocationPrompt: false,
  searchId: null,
  mode: null,
  timings: null,
  error: null,
};

function applyEvent(
  ev: SearchSSEEvent,
  setState: React.Dispatch<React.SetStateAction<SearchStreamState>>
) {
  if (ev.type === "stage") {
    setState((s) => ({ ...s, status: ev.stage, stageCount: ev.count ?? s.stageCount }));
  } else if (ev.type === "results") {
    setState((s) => ({
      ...s,
      target: ev.target,
      results: ev.results,
      placeResults: ev.placeResults ?? [],
      locationLabel: ev.locationLabel ?? s.locationLabel,
      needsLocationPrompt: ev.needsLocationPrompt ?? false,
      searchId: ev.searchId,
      mode: ev.mode,
    }));
  } else if (ev.type === "done") {
    setState((s) => ({ ...s, status: "done", timings: ev.timings }));
  } else if (ev.type === "error") {
    setState((s) => ({
      ...s,
      status: "error",
      error: { code: ev.code, message: ev.message, retryable: ev.retryable },
    }));
  }
}

export interface RunSearchOptions {
  target?: "all" | "person" | "place";
  location?: LocationContext | null;
}

export function useSearchStream() {
  const [state, setState] = useState<SearchStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL);
  }, []);

  const runSearch = useCallback(
    async (query: string, options?: RunSearchOptions) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState((prev) => ({
        ...INITIAL,
        locationLabel: options?.location?.label ?? prev.locationLabel,
        status: "planning",
      }));

      try {
        const payload: Record<string, unknown> = { query };
        if (options?.target && options.target !== "all") {
          payload.target = options.target;
        }
        if (options?.location) {
          payload.location = {
            latitude: options.location.latitude,
            longitude: options.location.longitude,
            city: options.location.city,
            label: options.location.label,
          };
        }

        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setState({
            ...INITIAL,
            status: "error",
            error: {
              code: "HTTP_ERROR",
              message: `Search failed (${res.status})`,
              retryable: true,
            },
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSSEFrames(buffer);
          buffer = rest;
          for (const ev of events) {
            applyEvent(ev, setState);
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setState({
          ...INITIAL,
          status: "error",
          error: {
            code: "NETWORK",
            message: (err as Error).message,
            retryable: true,
          },
        });
      }
    },
    []
  );

  return { state, runSearch, reset };
}

