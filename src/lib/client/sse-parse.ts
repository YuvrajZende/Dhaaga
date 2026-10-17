import { z } from "zod";
import { CandidateCard, CandidateCardSchema, SearchMode, SearchTimings } from "../search/types";
import { PlaceCard, PlaceCardSchema } from "../places/types";

export type SearchSSEEvent =
  | { type: "stage"; stage: "planning" | "searches" | "ranking" | "places" | "circle"; count?: number }
  | {
      type: "results";
      searchId: string;
      mode: SearchMode;
      target: "person" | "place";
      results: CandidateCard[];
      placeResults?: PlaceCard[];
      locationLabel?: string;
      needsLocationPrompt?: boolean;
    }
  | { type: "done"; timings: SearchTimings }
  | { type: "error"; code: string; message: string; retryable: boolean };

const StageData = z.object({
  stage: z.enum(["planning", "searches", "ranking", "places", "circle"]),
  count: z.number().int().optional(),
});

const ResultsData = z.object({
  searchId: z.string().uuid(),
  mode: z.enum(["fast", "full", "degraded"]),
  target: z.enum(["person", "place"]).default("person"),
  results: z.array(z.any()),
  locationLabel: z.string().optional(),
  needsLocationPrompt: z.boolean().optional(),
});

const DoneData = z.object({
  timings: z.object({
    decomposeMs: z.number(),
    annMs: z.number(),
    rerankMs: z.number(),
    totalMs: z.number(),
  }),
});

const ErrorData = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

export function parseSSEFrames(buffer: string): { events: SearchSSEEvent[]; rest: string } {
  const events: SearchSSEEvent[] = [];
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";

  for (const block of blocks) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue; // malformed frame: skip, keep the rest of the stream alive
    }

    if (event === "stage") {
      const ok = StageData.safeParse(parsed);
      if (ok.success) events.push({ type: "stage", stage: ok.data.stage, count: ok.data.count });
    } else if (event === "results") {
      const ok = ResultsData.safeParse(parsed);
      if (ok.success) {
        if (ok.data.target === "place") {
          const validPlaces: PlaceCard[] = [];
          for (const item of ok.data.results) {
            const p = PlaceCardSchema.safeParse(item);
            if (p.success) validPlaces.push(p.data);
          }
          events.push({
            type: "results",
            searchId: ok.data.searchId,
            mode: ok.data.mode,
            target: "place",
            results: [],
            placeResults: validPlaces,
            locationLabel: ok.data.locationLabel,
            needsLocationPrompt: ok.data.needsLocationPrompt,
          });
        } else {
          const validPersons: CandidateCard[] = [];
          for (const item of ok.data.results) {
            const p = CandidateCardSchema.safeParse(item);
            if (p.success) validPersons.push(p.data);
          }
          events.push({
            type: "results",
            searchId: ok.data.searchId,
            mode: ok.data.mode,
            target: "person",
            results: validPersons,
            placeResults: [],
            locationLabel: ok.data.locationLabel,
          });
        }
      }
    } else if (event === "done") {
      const ok = DoneData.safeParse(parsed);
      if (ok.success) events.push({ type: "done", timings: ok.data.timings });
    } else if (event === "error") {
      const ok = ErrorData.safeParse(parsed);
      if (ok.success) events.push({ type: "error", ...ok.data });
    }
    // unknown event types are ignored by design
  }
  return { events, rest };
}
