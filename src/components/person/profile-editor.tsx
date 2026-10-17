"use client";

import { useState, useCallback, KeyboardEvent } from "react";
import {
  User,
  Tag,
  Save,
  X,
  Plus,
  Loader2,
  CheckCircle2,
  Pencil,
  Sparkles,
  Lock,
  MapPin,
} from "lucide-react";

interface PersonProfileEditorProps {
  personId: string;
  initialBio?: string | null;
  initialTags?: string[];
  initialHeadline?: string | null;
  initialLocation?: string | null;
  displayName: string;
  onSaved?: () => void;
  compact?: boolean;
}

/**
 * Inline editor for enriching a person's profile with bio, tags, headline, and location.
 * Sends PATCH /api/people/[id] and triggers re-embedding on save.
 */
export default function PersonProfileEditor({
  personId,
  initialBio,
  initialTags,
  initialHeadline,
  initialLocation,
  displayName,
  onSaved,
  compact = false,
}: PersonProfileEditorProps) {
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(initialBio ?? "");
  const [headline, setHeadline] = useState(initialHeadline ?? "");
  const [location, setLocation] = useState(initialLocation ?? "");
  const [tags, setTags] = useState<string[]>(initialTags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTag = useCallback(() => {
    const val = tagInput.trim().toLowerCase();
    if (val && !tags.includes(val) && tags.length < 30) {
      setTags((t) => [...t, val]);
      setTagInput("");
    }
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((t) => t.filter((x) => x !== tag));
  }, []);

  const handleTagKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTag();
      } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
        setTags((t) => t.slice(0, -1));
      }
    },
    [addTag, tagInput, tags]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/people/${personId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio: bio.trim() || null,
          headline: headline.trim() || null,
          location: location.trim() || null,
          tags,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save profile");
      }

      setSaved(true);
      setEditing(false);
      onSaved?.();

      // Auto-dismiss the saved badge after 3s
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [personId, bio, headline, location, tags, onSaved]);

  const hasChanges =
    bio !== (initialBio ?? "") ||
    headline !== (initialHeadline ?? "") ||
    location !== (initialLocation ?? "") ||
    JSON.stringify(tags) !== JSON.stringify(initialTags ?? []);

  const hasSomeData =
    (initialBio ?? "").length > 0 ||
    (initialTags ?? []).length > 0 ||
    (initialLocation ?? "").length > 0;

  // Read-only view (compact card) when not editing
  if (!editing) {
    return (
      <div className="material-thin rounded-2xl p-4 group">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-find-soft)] text-[var(--accent-find)] shrink-0">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-[var(--text-primary)] truncate">
                {compact ? "Profile" : `${displayName}'s Profile`}
              </h4>
              {hasSomeData ? (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] truncate">
                  <Lock className="h-3 w-3 text-emerald-400 shrink-0" aria-label="Private" />
                  <span>
                    Private to you &middot; {(initialTags ?? []).length}{" "}
                    {(initialTags ?? []).length === 1 ? "interest" : "interests"}
                    {(initialBio ?? "").length > 0 ? " · personal note" : ""}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--accent-find)]">
                  <Lock className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span>Add private hobbies &amp; skills notes</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--accent-find)] bg-[var(--accent-find-soft)] hover:bg-[var(--accent-find)]/20 transition-colors shrink-0"
          >
            <Pencil className="h-3 w-3" />
            {hasSomeData ? "Edit" : "Enrich"}
          </button>
        </div>

        {/* Location preview */}
        {initialLocation && (
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <MapPin className="h-3 w-3 text-[var(--accent-find)] shrink-0" />
            <span>{initialLocation}</span>
          </div>
        )}

        {/* Tag pills preview */}
        {(initialTags ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(initialTags ?? []).slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-white/5 text-[var(--text-secondary)] border border-white/5"
              >
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </span>
            ))}
            {(initialTags ?? []).length > 6 && (
              <span className="text-[11px] text-[var(--text-tertiary)] self-center">
                +{(initialTags ?? []).length - 6} more
              </span>
            )}
          </div>
        )}

        {saved && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Saved &amp; re-embedding for search
          </div>
        )}
      </div>
    );
  }

  // Editing mode
  return (
    <div className="material-thin rounded-2xl p-5 border border-[var(--accent-find)]/20">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-find-soft)] text-[var(--accent-find)]">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h4 className="text-sm font-medium text-[var(--text-primary)]">
            Enrich {displayName}&apos;s Profile
          </h4>
          <p className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
            <Lock className="h-3 w-3 text-emerald-400 shrink-0" />
            <span>Private note to your account &middot; embedded for your semantic search</span>
          </p>
        </div>
      </div>

      {/* Headline */}
      <label className="block mb-3">
        <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium">
          Headline
        </span>
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Professional guitarist & session musician"
          maxLength={300}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-find)]/50 transition-colors"
        />
      </label>

      {/* Location */}
      <label className="block mb-3">
        <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium flex items-center gap-1">
          <MapPin className="h-3 w-3 text-[var(--accent-find)]" />
          Location / City
        </span>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Vadodara, Gujarat or New York, NY"
          maxLength={200}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-find)]/50 transition-colors"
        />
      </label>

      {/* Bio */}
      <label className="block mb-3">
        <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium">
          Bio / Notes
        </span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Career details, hobbies, personal notes...&#10;e.g. Plays guitar and bass for 12 years. Available for gigs. Loves jazz and blues. Previously toured with..."
          maxLength={2000}
          rows={4}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-find)]/50 transition-colors resize-y"
        />
        <span className="text-[10px] text-[var(--text-tertiary)] float-right mt-0.5">
          {bio.length}/2000
        </span>
      </label>

      {/* Tags */}
      <div className="mb-4">
        <span className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] font-medium block mb-1">
          Skills / Hobbies / Interests
        </span>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] font-medium bg-[var(--accent-find-soft)] text-[var(--accent-find)] border border-[var(--accent-find)]/20 group/tag"
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="p-0.5 rounded-full hover:bg-[var(--accent-find)]/20 transition-colors"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Type a skill and press Enter..."
            maxLength={60}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-find)]/50 transition-colors"
          />
          <button
            onClick={addTag}
            disabled={!tagInput.trim()}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 disabled:opacity-40 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
          e.g. guitar, hiking, machine learning, vegan cooking, photography ({tags.length}/30)
        </p>
      </div>

      {/* Suggestion chips */}
      {tags.length === 0 && (
        <div className="mb-4">
          <span className="text-[10px] text-[var(--text-tertiary)] block mb-1.5">
            Quick add:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[
              "guitar", "photography", "cooking", "hiking", "yoga",
              "painting", "coding", "music", "singing", "dancing",
              "writing", "design", "marketing", "sales", "finance",
            ].map((s) => (
              <button
                key={s}
                onClick={() => {
                  if (!tags.includes(s)) setTags((t) => [...t, s]);
                }}
                className="rounded-full px-2.5 py-0.5 text-[10px] font-medium bg-white/5 text-[var(--text-tertiary)] hover:bg-[var(--accent-find-soft)] hover:text-[var(--accent-find)] border border-white/5 transition-colors"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-3 text-xs text-red-400 flex items-center gap-1.5">
          <X className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5">
        <button
          onClick={() => {
            setBio(initialBio ?? "");
            setHeadline(initialHeadline ?? "");
            setTags(initialTags ?? []);
            setError(null);
            setEditing(false);
          }}
          className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-find)] px-5 py-2 text-sm font-medium text-[var(--accent-on-find)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-[var(--accent-find)]/20"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving &amp; Re-embedding…
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              Save Profile
            </>
          )}
        </button>
      </div>
    </div>
  );
}
