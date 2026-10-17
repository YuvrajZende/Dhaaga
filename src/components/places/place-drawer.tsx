"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Star,
  MapPin,
  Users,
  MessageSquare,
  Bookmark,
  Share2,
  ExternalLink,
  Shield,
  ArrowRight,
} from "lucide-react";
import { PlaceCard, CircleRecommender } from "@/lib/places/types";

interface PlaceDrawerProps {
  place: PlaceCard;
  onClose: () => void;
  onAskFriend?: (recommender: CircleRecommender, place: PlaceCard) => void;
  onSaveRecommendation?: (place: PlaceCard) => void;
  onOpenPerson?: (personId: string) => void;
}

export default function PlaceDrawer({
  place,
  onClose,
  onAskFriend,
  onSaveRecommendation,
  onOpenPerson,
}: PlaceDrawerProps) {
  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  const hasCircle = place.circle.recommenders.length > 0;
  const isSaved = Boolean(place.currentUserRecommendation);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="place-drawer-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 max-md:items-end max-md:p-0 animate-fadeIn"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity"
      />

      {/* Modal Card Container */}
      <div className="material-heavy relative z-10 flex w-full max-w-[580px] max-h-[88vh] flex-col overflow-y-auto rounded-3xl border border-white/15 p-6 shadow-2xl animate-materialize max-md:max-h-[90vh] max-md:rounded-b-none max-md:rounded-t-2xl max-md:border-b-0">
        {/* Header Bar */}
        <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4">
          <div className="space-y-1">
            <span className="mono-voice text-[11px] uppercase tracking-wider text-[var(--accent-find)]">
              {place.category || place.type}
            </span>
            <h2 id="place-drawer-title" className="type-title text-xl font-bold text-[var(--text-primary)]">
              {place.name}
            </h2>
            {place.city && (
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                <MapPin className="h-3 w-3 text-[var(--text-tertiary)]" />
                <span>{place.address || place.city}</span>
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="material-thin material-interactive rounded-xl p-2 text-[var(--text-tertiary)] hover:text-white"
            aria-label="Close place details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-6 space-y-6 flex-1">
          {/* Ratings Overview Bar */}
          <div className="grid grid-cols-2 gap-3">
            {/* External Public Rating */}
            <div className="material-thin rounded-xl p-3 border border-white/5">
              <span className="mono-voice text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">
                External Rating
              </span>
              <div className="mt-1 flex items-center gap-1.5">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="text-base font-semibold text-[var(--text-primary)]">
                  {place.externalRating ? place.externalRating.toFixed(1) : "N/A"}
                </span>
                {place.externalRatingCount && (
                  <span className="text-xs text-[var(--text-tertiary)]">
                    ({place.externalRatingCount})
                  </span>
                )}
              </div>
            </div>

            {/* Friend Circle Rating */}
            <div className="material-thin rounded-xl p-3 border border-[var(--accent-find)]/20 bg-[var(--accent-find)]/5">
              <span className="mono-voice text-[10px] text-[var(--accent-find)] uppercase tracking-wider">
                Circle Endorsements
              </span>
              <div className="mt-1 flex items-center gap-1.5">
                <Users className="h-4 w-4 text-[var(--accent-find)]" />
                <span className="text-base font-semibold text-[var(--text-primary)]">
                  {place.circle.endorsementCount}
                </span>
                {place.circle.averageFriendRating && (
                  <span className="text-xs text-amber-400 font-medium">
                    ★ {place.circle.averageFriendRating.toFixed(1)} avg
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* YOUR CIRCLE Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="mono-voice text-xs font-semibold uppercase tracking-wider text-[var(--accent-find)] flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Your Circle Recommendations
              </h3>
              <span className="text-xs text-[var(--text-tertiary)]">
                {place.circle.recommenders.length} {place.circle.recommenders.length === 1 ? "person" : "people"}
              </span>
            </div>

            {hasCircle ? (
              <div className="space-y-2.5">
                {place.circle.recommenders.map((rec) => (
                  <div
                    key={rec.userId}
                    className="material-thin rounded-xl p-3.5 border border-white/5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-[var(--accent-find)]/20 text-[var(--accent-find)] flex items-center justify-center font-medium text-xs">
                          {rec.name.charAt(0)}
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => rec.userId && onOpenPerson?.(rec.userId)}
                            className="font-medium text-xs text-[var(--text-primary)] hover:underline hover:text-[var(--accent-find)] transition-colors text-left"
                          >
                            {rec.name}
                          </button>
                          <p className="text-[11px] text-[var(--text-tertiary)]">
                            {rec.relationshipType === "direct" ? "Direct connection" : "2nd degree connection"} · {rec.connectionStrength}/100 strength · <span className="capitalize">{rec.source === "google" ? "via Google" : "on Happensten"}</span>
                          </p>
                        </div>
                      </div>

                      {rec.rating && (
                        <div className="flex items-center text-amber-400 text-xs">
                          {"★".repeat(rec.rating)}
                        </div>
                      )}
                    </div>

                    {/* Shared note quote (privacy: only shown if shared) */}
                    {rec.sharedNote && (
                      <p className="rounded-lg bg-black/20 p-2 text-xs italic text-[var(--text-secondary)] border-l-2 border-[var(--accent-find)]">
                        &ldquo;{rec.sharedNote}&rdquo;
                      </p>
                    )}

                    {/* Actions for recommender */}
                    {rec.name !== "You" && (
                      <div className="pt-1 flex items-center justify-end gap-3 text-[11px]">
                        {onOpenPerson && (
                          <button
                            onClick={() => onOpenPerson(rec.userId)}
                            className="text-[var(--text-secondary)] hover:text-white transition-colors"
                          >
                            View profile
                          </button>
                        )}
                        {onAskFriend && (
                          <button
                            onClick={() => onAskFriend(rec, place)}
                            className="flex items-center gap-1 text-[var(--accent-find)] hover:underline"
                          >
                            <MessageSquare className="h-3 w-3" />
                            <span>Ask {rec.name.split(" ")[0]}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="material-thin rounded-xl p-4 text-center border border-white/5">
                <p className="text-xs text-[var(--text-secondary)]">
                  No one in your trusted circle has recommended this place yet.
                </p>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                  Be the first to save and recommend it to your network.
                </p>
              </div>
            )}
          </div>

          {/* YOUR CONNECTIONS Warm-Path Visualization */}
          {hasCircle && (
            <div className="space-y-2">
              <h3 className="mono-voice text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                Your Connection Path
              </h3>
              <div className="material-thin rounded-xl p-3 border border-white/5 text-xs text-[var(--text-secondary)] flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[var(--text-primary)]">You</span>
                <ArrowRight className="h-3 w-3 text-[var(--text-tertiary)]" />
                <span className="font-medium text-[var(--accent-find)]">
                  {place.circle.topRecommender?.name || "Circle contact"}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  ({place.circle.topRecommender?.connectionStrength}/100)
                </span>
                <ArrowRight className="h-3 w-3 text-[var(--text-tertiary)]" />
                <span className="font-semibold text-[var(--text-primary)]">{place.name}</span>
              </div>
            </div>
          )}

          {/* EXTERNAL INFORMATION */}
          <div className="space-y-2">
            <h3 className="mono-voice text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              Place Details
            </h3>
            <div className="material-thin rounded-xl p-3.5 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Address:</span>
                <span className="text-[var(--text-primary)] text-right">{place.address || "Local area"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">City:</span>
                <span className="text-[var(--text-primary)]">{place.city || "Nearby"}</span>
              </div>
              {place.distanceKm !== null && place.distanceKm !== undefined && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-tertiary)]">Distance:</span>
                  <span className="text-[var(--text-primary)]">{place.distanceKm} km away</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-3">
          {onSaveRecommendation && (
            <button
              onClick={() => onSaveRecommendation(place)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all ${
                isSaved
                  ? "bg-white/10 text-white hover:bg-white/15 border border-white/20"
                  : "bg-[var(--accent-find)] text-[var(--accent-on-find)] hover:brightness-110"
              }`}
            >
              <Bookmark className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
              <span>{isSaved ? "Edit your recommendation" : "Save to Happensten"}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="material-thin material-interactive rounded-xl px-4 py-2.5 text-xs font-medium text-[var(--text-secondary)] hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
