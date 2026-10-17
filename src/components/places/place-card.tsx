"use client";

import React, { useState } from "react";
import {
  Star,
  MapPin,
  MessageSquare,
  Bookmark,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Users,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { PlaceCard as PlaceCardType, CircleRecommender } from "@/lib/places/types";

interface PlaceCardProps {
  card: PlaceCardType;
  index: number;
  onViewPlace: (card: PlaceCardType) => void;
  onAskFriend?: (recommender: CircleRecommender, place: PlaceCardType) => void;
  onSaveRecommendation?: (card: PlaceCardType) => void;
  onOpenPerson?: (personId: string) => void;
}

export default function PlaceCard({
  card,
  index,
  onViewPlace,
  onAskFriend,
  onSaveRecommendation,
  onOpenPerson,
}: PlaceCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);

  const top = card.circle.topRecommender;
  const isHighMatch = card.matchScore >= 70;
  const isSavedByViewer = Boolean(card.currentUserRecommendation);

  // Get appropriate emoji icon for type
  function getPlaceIcon(type: string, category: string | null) {
    const combined = `${type} ${category || ""}`.toLowerCase();
    if (combined.includes("pizza")) return "🍕";
    if (combined.includes("italian") || combined.includes("pasta")) return "🍝";
    if (combined.includes("cafe") || combined.includes("coffee")) return "☕";
    if (combined.includes("gym") || combined.includes("fitness")) return "💪";
    if (combined.includes("burger")) return "🍔";
    if (combined.includes("sushi") || combined.includes("asian")) return "🍣";
    if (combined.includes("bar") || combined.includes("pub")) return "🍸";
    if (combined.includes("bakery")) return "🥐";
    return "📍";
  }

  const icon = getPlaceIcon(card.type, card.category ?? null);

  return (
    <article
      className="material-medium group relative rounded-2xl p-5 transition-all duration-200 hover:border-white/20 hover:shadow-xl"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Top Header: Name, Match Badge, Category */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xl" role="img" aria-label={card.type}>
              {icon}
            </span>
            <h3
              onClick={() => onViewPlace(card)}
              className="type-title text-base font-semibold text-[var(--text-primary)] hover:text-[var(--accent-find)] transition-colors cursor-pointer"
            >
              {card.name}
            </h3>
          </div>

          <p className="text-xs text-[var(--text-secondary)]">
            {[card.category || card.type, card.city].filter(Boolean).join(" · ")}
          </p>
        </div>

        {/* Match Score Badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`mono-voice rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${
              isHighMatch
                ? "bg-[var(--accent-find)]/15 text-[var(--accent-find)] border border-[var(--accent-find)]/30"
                : "bg-white/5 text-[var(--text-secondary)] border border-white/10"
            }`}
          >
            {isHighMatch ? "HIGH MATCH" : `${card.matchScore}% MATCH`}
          </span>
        </div>
      </div>

      {/* External Public Rating (Clearly distinguished from friend ratings) */}
      {card.externalRating != null && (
        <div className="mt-2.5 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center text-amber-400">
            <Star className="h-3.5 w-3.5 fill-current" />
            <span className="ml-1 font-medium text-[var(--text-primary)]">
              {card.externalRating.toFixed(1)}
            </span>
          </div>
          <span>external rating</span>
          {card.externalRatingCount && (
            <span className="text-[var(--text-tertiary)]">({card.externalRatingCount})</span>
          )}
        </div>
      )}

      {/* Network Endorsement Section */}
      <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
        <div className="flex items-center justify-between">
          <span className="mono-voice text-[11px] font-medium tracking-wider text-[var(--accent-find)] flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            YOUR NETWORK
          </span>

          {card.circle.endorsementCount > 0 && (
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {card.circle.endorsementCount} {card.circle.endorsementCount === 1 ? "recommendation" : "recommendations"}
            </span>
          )}
        </div>

        {top ? (
          <div className="mt-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-find)]" />
                <button
                  type="button"
                  onClick={() => top.userId && onOpenPerson?.(top.userId)}
                  className="font-medium text-[var(--text-primary)] hover:underline hover:text-[var(--accent-find)] transition-colors text-left"
                >
                  {top.name}
                </button>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                {top.rating && (
                  <span className="text-amber-400 font-medium flex items-center">
                    {"★".repeat(top.rating)}
                  </span>
                )}
                <span>·</span>
                <span>{top.relationshipType === "direct" ? "Direct" : "2nd degree"}</span>
                <span>·</span>
                <span className="font-mono">{top.connectionStrength}/100</span>
              </div>
            </div>

            {/* Clear rating statement & provenance */}
            <p className="text-xs text-[var(--text-secondary)]">
              {top.rating ? `Rated ${top.rating}/5 by ${top.name}` : `Recommended by ${top.name}`}
              <span className="text-[var(--text-tertiary)] ml-1">
                ({top.source === "google" ? "via Google" : "on Happensten"})
              </span>
            </p>

            {/* Shared Note quote (Only displayed when explicitly shared by owner) */}
            {top.sharedNote && (
              <p className="rounded-lg bg-white/[0.03] p-2 text-xs italic text-[var(--text-secondary)] border-l-2 border-[var(--accent-find)]/50">
                &ldquo;{top.sharedNote}&rdquo;
              </p>
            )}

            {/* Additional recommenders summary */}
            {card.circle.endorsementCount > 1 && (
              <p className="text-[11px] text-[var(--text-tertiary)] pt-0.5">
                + {card.circle.endorsementCount - 1} more {card.circle.endorsementCount - 1 === 1 ? "person" : "people"} in your network
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-tertiary)] italic">
            No one in your trusted network has recommended this yet.
          </p>
        )}
      </div>

      {/* Distance & Why this place toggle */}
      <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-tertiary)]">
        {card.distanceKm !== null && card.distanceKm !== undefined ? (
          <div className="flex items-center gap-1 text-[var(--text-secondary)]">
            <MapPin className="h-3.5 w-3.5 text-[var(--accent-find)]" />
            <span>{card.distanceKm} km away</span>
          </div>
        ) : (
          <span />
        )}

        {card.whyThisPlace.length > 0 && (
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <span>Why this place?</span>
            {showEvidence ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* "Why This Place?" Explainable Evidence Drawer */}
      {showEvidence && card.whyThisPlace.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-white/5 bg-black/20 p-2.5 text-xs space-y-1.5 animate-fadeIn">
          {card.whyThisPlace.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-[var(--text-secondary)]">
              <CheckCircle2 className="h-3 w-3 shrink-0 text-[var(--accent-find)]" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-4 flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
        <button
          onClick={() => onViewPlace(card)}
          className="material-thin material-interactive rounded-xl px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:text-white transition-colors"
        >
          View place
        </button>

        {top && top.name !== "You" && onOpenPerson && (
          <button
            onClick={() => onOpenPerson(top.userId)}
            className="material-thin material-interactive rounded-xl px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-white transition-colors"
          >
            View {top.name.split(" ")[0]}
          </button>
        )}

        {top && top.name !== "You" && onAskFriend && (
          <button
            onClick={() => onAskFriend(top, card)}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-find)]/15 border border-[var(--accent-find)]/30 px-3.5 py-1.5 text-xs font-medium text-[var(--accent-find)] hover:bg-[var(--accent-find)]/25 transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Ask {top.name.split(" ")[0]}</span>
          </button>
        )}

        {onSaveRecommendation && (
          <button
            onClick={() => onSaveRecommendation(card)}
            className={`material-thin material-interactive ml-auto flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-colors ${
              isSavedByViewer
                ? "text-[var(--accent-find)] border-[var(--accent-find)]/30 font-medium"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Bookmark className={`h-3.5 w-3.5 ${isSavedByViewer ? "fill-current" : ""}`} />
            <span>{isSavedByViewer ? "Saved" : "Save"}</span>
          </button>
        )}
      </div>
    </article>
  );
}
