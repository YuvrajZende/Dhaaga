"use client";

import React, { useState } from "react";
import { X, Star, ShieldCheck, Lock, Trash2, Check } from "lucide-react";
import { PlaceCard } from "@/lib/places/types";

interface SaveRecommendationModalProps {
  place: PlaceCard;
  onClose: () => void;
  onSaved: (updatedRec: {
    rating: number | null;
    note: string | null;
    isPrivateNote: boolean;
    shareWithCircle: boolean;
  }) => void;
  onDeleted?: () => void;
}

export default function SaveRecommendationModal({
  place,
  onClose,
  onSaved,
  onDeleted,
}: SaveRecommendationModalProps) {
  const existing = place.currentUserRecommendation;

  const [rating, setRating] = useState<number | null>(existing?.rating ?? null);
  const [note, setNote] = useState<string>(existing?.note ?? "");
  const [shareWithCircle, setShareWithCircle] = useState<boolean>(
    existing?.shareWithCircle ?? false
  );
  const [isPrivateNote, setIsPrivateNote] = useState<boolean>(
    existing?.isPrivateNote ?? true
  );

  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: place.id,
          rating,
          note: note.trim() || null,
          isPrivateNote,
          shareWithCircle,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to save recommendation");
      }

      onSaved({
        rating,
        note: note.trim() || null,
        isPrivateNote,
        shareWithCircle,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error saving recommendation");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to remove this saved place and recommendation?")) return;
    setIsDeleting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/recommendations?entityId=${encodeURIComponent(place.id)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete recommendation");
      }

      onDeleted?.();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error deleting recommendation");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-recommendation-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Modal Card */}
      <div className="material-heavy relative z-10 w-full max-w-md rounded-2xl border border-white/10 p-6 shadow-2xl space-y-5 animate-scaleUp">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 id="save-recommendation-title" className="type-title text-lg font-bold text-[var(--text-primary)]">
              {existing ? "Edit recommendation" : "Save recommendation"}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{place.name}</p>
          </div>

          <button
            onClick={onClose}
            className="material-thin material-interactive rounded-xl p-1.5 text-[var(--text-tertiary)] hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4">
          {/* Star Rating Selection */}
          <div className="space-y-1.5">
            <label className="mono-voice text-xs text-[var(--text-secondary)] uppercase tracking-wider">
              Your rating
            </label>
            <div className="flex items-center gap-1.5 py-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = (hoverRating ?? rating ?? 0) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(rating === star ? null : star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(null)}
                    className="p-1 transition-transform hover:scale-110 focus:outline-none"
                    aria-label={`${star} star`}
                  >
                    <Star
                      className={`h-6 w-6 transition-colors ${
                        active
                          ? "fill-amber-400 text-amber-400"
                          : "text-white/20 hover:text-white/40"
                      }`}
                    />
                  </button>
                );
              })}
              {rating !== null && (
                <button
                  type="button"
                  onClick={() => setRating(null)}
                  className="ml-2 text-[10px] text-[var(--text-tertiary)] hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Note Input */}
          <div className="space-y-1.5">
            <label className="mono-voice text-xs text-[var(--text-secondary)] uppercase tracking-wider">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Best handmade pasta in town, great vibe for dinner..."
              rows={3}
              maxLength={1000}
              className="w-full rounded-xl bg-black/40 border border-white/10 p-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-find)] focus:outline-none"
            />
          </div>

          {/* Explicit Circle Sharing Toggle */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-2">
                <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent-find)]" />
                  Share with trusted circle
                </span>
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  When enabled, friends in your network can see that you recommend this place.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShareWithCircle(!shareWithCircle)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  shareWithCircle ? "bg-[var(--accent-find)]" : "bg-white/15"
                }`}
                role="switch"
                aria-checked={shareWithCircle}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    shareWithCircle ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Note Confidentiality Toggle (if note entered and sharing enabled) */}
            {shareWithCircle && note.trim().length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div className="space-y-0.5 pr-2">
                  <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                    <Lock className="h-3 w-3 text-amber-400" />
                    Keep note private to me
                  </span>
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    Friends will only see your rating/endorsement, but your note will never be shown.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={isPrivateNote}
                  onChange={(e) => setIsPrivateNote(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black/40 text-[var(--accent-find)] focus:ring-[var(--accent-find)]"
                />
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <p className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg">
              {errorMsg}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            {existing ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || isSubmitting}
                className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 p-2 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove</span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="material-thin material-interactive rounded-xl px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-find)] px-4 py-2 text-xs font-semibold text-[var(--accent-on-find)] hover:brightness-110 transition-transform active:scale-95 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{isSubmitting ? "Saving..." : "Save recommendation"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
