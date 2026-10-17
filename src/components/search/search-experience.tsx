"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Search,
  ArrowRight,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Check,
  Info,
  ChevronDown,
  Compass,
  Users,
} from "lucide-react";
import { useSearchStream } from "@/lib/client/use-search-stream";
import ResultCard from "./result-card";
import ResultDrawer from "./result-drawer";
import { LOW_RELEVANCE_THRESHOLD } from "@/lib/search/evidence";
import LocationSelector from "./location-selector";
import PlaceCardComponent from "@/components/places/place-card";
import PlaceDrawer from "@/components/places/place-drawer";
import SaveRecommendationModal from "@/components/places/save-recommendation-modal";
import AskFriendModal from "@/components/places/ask-friend-modal";
import { LocationContext, PlaceCard, CircleRecommender } from "@/lib/places/types";

interface RecentSearch {
  id: string;
  queryText: string;
  mode: string;
  createdAt: string;
}

const EXAMPLE_SEARCHES = [
  "Best Italian restaurant near me",
  "Good cafe for working",
  "AI founders in my network",
  "Where should I take my parents for dinner?",
  "Systems & backend engineers",
  "Vegetarian restaurant recommended by friends",
];

const PERSON_PROGRESS_STEPS: Array<{ key: string; label: string }> = [
  { key: "planning", label: "Understanding your request" },
  { key: "searches", label: "Searching your network" },
  { key: "ranking", label: "Finding relevant people" },
];

const PLACE_PROGRESS_STEPS: Array<{ key: string; label: string }> = [
  { key: "planning", label: "Understanding your request" },
  { key: "places", label: "Finding nearby places" },
  { key: "circle", label: "Checking your network" },
  { key: "ranking", label: "Ranking results" },
];

export default function SearchExperience({
  viewerId,
  initialQuery,
}: {
  viewerId: string;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const autoRanRef = useRef(false);
  const [targetFilter, setTargetFilter] = useState<"all" | "person" | "place">("all");
  const [location, setLocation] = useState<LocationContext | null>(null);

  // Drawers and Modals state
  const [drawerPersonId, setDrawerPersonId] = useState<string | null>(null);
  const [activePlace, setActivePlace] = useState<PlaceCard | null>(null);
  const [savingPlace, setSavingPlace] = useState<PlaceCard | null>(null);
  const [askingFriend, setAskingFriend] = useState<{
    friend: CircleRecommender;
    place: PlaceCard;
  } | null>(null);

  const [recent, setRecent] = useState<RecentSearch[]>([]);

  const { state, runSearch } = useSearchStream();

  // Handoff from the landing hero: /search?q=… runs immediately, once.
  useEffect(() => {
    if (initialQuery && initialQuery.trim() && !autoRanRef.current) {
      autoRanRef.current = true;
      runSearch(initialQuery.trim(), { target: "all", location: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load recent searches
  useEffect(() => {
    fetch("/api/searches")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.searches) setRecent(data.searches);
      })
      .catch(() => {});
  }, [state.status]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    runSearch(query.trim(), {
      target: targetFilter,
      location,
    });
  }

  function handleSelectChip(text: string) {
    setQuery(text);
    runSearch(text, {
      target: targetFilter,
      location,
    });
  }

  const isSearching =
    state.status === "planning" ||
    state.status === "searches" ||
    state.status === "places" ||
    state.status === "circle" ||
    state.status === "ranking";

  const isPlaceStream =
    state.status === "places" ||
    state.status === "circle" ||
    state.target === "place" ||
    targetFilter === "place";

  const activeProgressSteps = isPlaceStream ? PLACE_PROGRESS_STEPS : PERSON_PROGRESS_STEPS;
  const stepKeys = activeProgressSteps.map((s) => s.key);
  const activeStepIndex = stepKeys.indexOf(
    state.status === "done" || state.status === "error"
      ? "ranking"
      : state.status
  );

  // Split person results
  const primaryPeople = state.results.filter(
    (r) => (r.matchScore ?? 0) >= LOW_RELEVANCE_THRESHOLD
  );
  const secondaryPeople = state.results.filter(
    (r) => (r.matchScore ?? 0) < LOW_RELEVANCE_THRESHOLD
  );

  const activeDrawerCard =
    state.results.find((r) => r.personId === drawerPersonId) ?? null;

  return (
    <div className="w-full space-y-6">
      {/* Search Input Bar */}
      <form onSubmit={handleSubmit} className="relative w-full space-y-3">
        <div className="material-medium relative flex items-center rounded-2xl p-2 transition-all duration-200 focus-within:border-[var(--accent-find)]/60 focus-within:ring-1 focus-within:ring-[var(--accent-find)]/40 shadow-xl">
          <Search className="ml-3 h-5 w-5 shrink-0 text-[var(--text-tertiary)]" />

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people or places recommended by your circle..."
            className="w-full bg-transparent px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
            aria-label="Search contacts and places"
          />

          <button
            type="submit"
            disabled={!query.trim() || isSearching}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-find)] text-[var(--accent-on-find)] transition-transform duration-150 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Submit search"
          >
            {isSearching ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Filter Pills and Location bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          {/* Subtle search target switcher: [ All ] [ People ] [ Places ] */}
          <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 border border-white/5 text-xs">
            <button
              type="button"
              onClick={() => setTargetFilter("all")}
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                targetFilter === "all"
                  ? "bg-white/10 text-white font-medium"
                  : "text-[var(--text-tertiary)] hover:text-white"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setTargetFilter("person")}
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                targetFilter === "person"
                  ? "bg-white/10 text-white font-medium"
                  : "text-[var(--text-tertiary)] hover:text-white"
              }`}
            >
              People
            </button>
            <button
              type="button"
              onClick={() => setTargetFilter("place")}
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                targetFilter === "place"
                  ? "bg-[var(--accent-find)]/20 text-[var(--accent-find)] font-medium"
                  : "text-[var(--text-tertiary)] hover:text-white"
              }`}
            >
              Places
            </button>
          </div>

          {/* Privacy-conscious Location Selector */}
          <LocationSelector
            currentLocation={location}
            onLocationChange={setLocation}
            needsPrompt={state.needsLocationPrompt}
          />
        </div>
      </form>

      {/* Progressive search status — a human checklist */}
      {isSearching && (
        <div className="material-thin rounded-xl p-4" aria-live="polite">
          <ol className="space-y-2">
            {activeProgressSteps.map((step, i) => {
              const done = i < activeStepIndex;
              const active = i === activeStepIndex;
              return (
                <li key={step.key} className="flex items-center gap-2.5 text-[13px]">
                  {done ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent-find)]" aria-hidden />
                  ) : (
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        active ? "bg-[var(--accent-find)] animate-ping" : "bg-white/15"
                      }`}
                      aria-hidden
                    />
                  )}
                  <span
                    className={
                      done
                        ? "text-[var(--text-tertiary)]"
                        : active
                          ? "mono-voice voice-active text-[var(--text-primary)]"
                          : "text-[var(--text-tertiary)]"
                    }
                  >
                    {step.label}
                    {active && step.key === "searches" && (state.stageCount ?? 0) > 0
                      ? ` · ${state.stageCount} sub-searches`
                      : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Done summary — human-first */}
      {state.status === "done" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5">
          <p className="text-[13px] text-[var(--text-primary)]">
            <span className="font-medium">
              {state.target === "place"
                ? `${state.placeResults.length} ${state.placeResults.length === 1 ? "place" : "places"} found`
                : `${state.results.length} ${state.results.length === 1 ? "person" : "people"} found`}
            </span>
            {state.locationLabel && (
              <span className="text-[var(--accent-find)]"> near {state.locationLabel}</span>
            )}
            {state.timings && (
              <span className="text-[var(--text-tertiary)]">
                {" "}· {(state.timings.totalMs / 1000).toFixed(1)}s
              </span>
            )}
          </p>

          {/* Technical telemetry behind disclosure */}
          <details className="group/details">
            <summary className="mono-voice flex cursor-pointer list-none items-center gap-1 text-[11px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]">
              Search details
              <ChevronDown className="h-3 w-3 transition-transform group-open/details:rotate-180" aria-hidden />
            </summary>
            <div className="mono-voice mt-2 space-y-0.5 text-[11px] text-[var(--text-tertiary)]">
              {state.timings && (
                <p>
                  decomposition {state.timings.decomposeMs}ms · retrieval {state.timings.annMs}ms ·
                  ranking {state.timings.rerankMs}ms · total {state.timings.totalMs}ms
                </p>
              )}
              <p>mode: {state.mode ?? "full"} · target: {state.target}</p>
            </div>
          </details>
        </div>
      )}

      {/* Error Message & Retry */}
      {state.status === "error" && state.error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs">
          <div className="flex items-center gap-2 text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Search couldn&apos;t complete. Please try again.</span>
          </div>

          {state.error.retryable && (
            <button
              onClick={() => runSearch(query, { target: targetFilter, location })}
              className="material-thin material-interactive shrink-0 rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)]"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {/* Empty State / Initial Suggestions */}
      {state.status === "idle" && (
        <div className="space-y-6 pt-4">
          <div className="space-y-2">
            <span className="mono-voice block text-[11px] text-[var(--text-tertiary)]">
              TRY A SEARCH
            </span>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_SEARCHES.map((example) => (
                <button
                  key={example}
                  onClick={() => handleSelectChip(example)}
                  className="material-thin material-interactive flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <Sparkles className="h-3 w-3 text-[var(--accent-find)]" />
                  <span>{example}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recent Searches */}
          {recent.length > 0 && (
            <div className="space-y-2 border-t border-white/5 pt-4">
              <span className="mono-voice block text-[11px] text-[var(--text-tertiary)]">
                RECENT SEARCHES
              </span>
              <div className="flex flex-wrap gap-2">
                {recent.slice(0, 5).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectChip(s.queryText)}
                    className="material-thin material-interactive rounded-full px-3 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    {s.queryText}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PLACE RESULTS VIEW */}
      {state.target === "place" && state.placeResults.length > 0 && (
        <div className="space-y-4" aria-live="polite">
          {state.placeResults.map((place, index) => (
            <PlaceCardComponent
              key={place.id}
              card={place}
              index={index}
              onViewPlace={setActivePlace}
              onAskFriend={(friend, p) => setAskingFriend({ friend, place: p })}
              onSaveRecommendation={setSavingPlace}
              onOpenPerson={setDrawerPersonId}
            />
          ))}
        </div>
      )}

      {/* PERSON RESULTS VIEW */}
      {state.target !== "place" && primaryPeople.length > 0 && (
        <div className="space-y-3" aria-live="polite">
          {primaryPeople.map((card, index) => (
            <ResultCard
              key={card.personId}
              card={card}
              index={index}
              onOpen={setDrawerPersonId}
              query={query}
            />
          ))}
        </div>
      )}

      {/* More possible matches (Person) */}
      {state.target !== "place" && secondaryPeople.length > 0 && (
        <details className="group/more">
          <summary className="mono-voice flex cursor-pointer list-none items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]">
            <ChevronDown className="h-3 w-3 transition-transform group-open/more:rotate-180" aria-hidden />
            More possible matches ({secondaryPeople.length})
          </summary>
          <div className="mt-3 space-y-3">
            {secondaryPeople.map((card, index) => (
              <ResultCard
                key={card.personId}
                card={card}
                index={index}
                onOpen={setDrawerPersonId}
                query={query}
                muted
              />
            ))}
          </div>
        </details>
      )}

      {/* No Results Found */}
      {state.status === "done" &&
        state.results.length === 0 &&
        state.placeResults.length === 0 && (
          <div className="material-medium rounded-2xl p-10 text-center">
            <p className="type-title text-base font-semibold text-[var(--text-primary)]">
              No recommendations or places found
            </p>
            <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
              Try a broader query, or choose a different location:
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {EXAMPLE_SEARCHES.slice(0, 3).map((example) => (
                <button
                  key={example}
                  onClick={() => handleSelectChip(example)}
                  className="material-thin material-interactive flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <Sparkles className="h-3 w-3 text-[var(--accent-find)]" />
                  <span>{example}</span>
                </button>
              ))}
            </div>
          </div>
        )}

      {/* Place Detail Drawer */}
      {activePlace && (
        <PlaceDrawer
          key={activePlace.id}
          place={activePlace}
          onClose={() => setActivePlace(null)}
          onAskFriend={(friend, p) => setAskingFriend({ friend, place: p })}
          onSaveRecommendation={setSavingPlace}
          onOpenPerson={setDrawerPersonId}
        />
      )}

      {/* Save / Edit Recommendation Modal */}
      {savingPlace && (
        <SaveRecommendationModal
          key={savingPlace.id}
          place={savingPlace}
          onClose={() => setSavingPlace(null)}
          onSaved={(updatedRec) => {
            // Update local place card representation
            savingPlace.currentUserRecommendation = updatedRec;
            if (activePlace && activePlace.id === savingPlace.id) {
              activePlace.currentUserRecommendation = updatedRec;
            }
          }}
          onDeleted={() => {
            savingPlace.currentUserRecommendation = null;
            if (activePlace && activePlace.id === savingPlace.id) {
              activePlace.currentUserRecommendation = null;
            }
          }}
        />
      )}

      {/* Ask Friend Modal */}
      {askingFriend && (
        <AskFriendModal
          friend={askingFriend.friend}
          place={askingFriend.place}
          onClose={() => setAskingFriend(null)}
        />
      )}

      {/* Contact Profile & Warm Path Drawer */}
      {drawerPersonId && (
        <ResultDrawer
          key={drawerPersonId}
          personId={drawerPersonId}
          viewerId={viewerId}
          card={activeDrawerCard}
          onClose={() => setDrawerPersonId(null)}
        />
      )}
    </div>
  );
}