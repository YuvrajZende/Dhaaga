"use client";

import React, { useEffect, useState, useRef } from "react";
import { X, Building, Link2, MapPin, Tag, UserPlus, UserCheck, Loader2 } from "lucide-react";
import { WarmPathDecision } from "@/lib/warmpath/select";
import { CandidateCard } from "@/lib/search/types";
import { buildEvidence } from "@/lib/search/evidence";
import WarmPathViz from "./warm-path-viz";
import DraftComposer from "./draft-composer";

interface PersonData {
  id: string;
  ownerUserId?: string;
  displayName: string;
  title: string | null;
  company: string | null;
  companyDomain: string | null;
  headline: string | null;
  avatarUrl: string | null;
  location: string | null;
  primaryEmail: string | null;
  bio: string | null;
  tags: string[] | null;
  sourceRefs?: unknown;
}

interface DrawerState {
  status: "loading" | "ready" | "error";
  person: PersonData | null;
  warmPath: WarmPathDecision | null;
}

interface SourceRef {
  source: string;
  sourceId: string;
}

function sourceLabel(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("google")) return "Google Contacts";
  if (s.includes("linkedin")) return "LinkedIn import";
  if (s.includes("instagram")) return "Instagram import";
  if (s.includes("facebook")) return "Facebook import";
  if (s === "x" || s.includes("twitter")) return "X import";
  if (s.includes("personal") || s.includes("csv") || s.includes("manual")) return "Personal upload";
  return source;
}

/**
 * Person intelligence panel — V2: identity, about, interests, why this
 * matches, relationship, sources, and a sticky context-aware next action.
 *
 * Privacy: SOURCES renders only for records the viewer owns — the
 * provenance of a friend's imported data belongs to the friend, not the
 * viewer. The backend remains authoritative (getReachablePerson scopes
 * email and reachability server-side); this UI only renders what it gets.
 */
export default function ResultDrawer({
  personId,
  viewerId,
  card,
  onClose,
}: {
  personId: string;
  viewerId: string;
  card: CandidateCard | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<DrawerState>({
    status: "loading",
    person: null,
    warmPath: null,
  });
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Esc to close + minimal Tab focus trap within the dialog
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const els = panelRef.current.querySelectorAll<HTMLElement>(
        'button, a[href], input:not([disabled]), textarea:not([disabled]), select, summary, [tabindex]:not([tabindex="-1"])'
      );
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Move focus into the dialog on open
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

interface PersonPlaceConnection {
  id: string;
  name: string;
  type: string;
  category: string | null;
  city: string | null;
  externalRating: number | null;
  rating: number | null;
  sharedNote: string | null;
  source: string;
}

  const [placeConnections, setPlaceConnections] = useState<PersonPlaceConnection[]>([]);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [isFollowingUser, setIsFollowingUser] = useState<boolean>(false);
  const [isSelf, setIsSelf] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState<boolean>(false);

  // Fetch person data & warm path (drawer is keyed by personId, so this
  // effect runs once per mount with the initial "loading" state)
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/people/${personId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP error ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setState({
            status: "ready",
            person: data.person,
            warmPath: data.warmPath,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error", person: null, warmPath: null });
        }
      });

    // Also fetch authorized place connections & network follow context
    fetch(`/api/people/${personId}/places`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          if (data.places) setPlaceConnections(data.places);
          if (data.targetUserId) setTargetUserId(data.targetUserId);
          if (data.isFollowing !== undefined) setIsFollowingUser(data.isFollowing);
          if (data.isSelf !== undefined) setIsSelf(data.isSelf);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [personId]);

  const handleToggleFollow = async () => {
    if (!targetUserId || followLoading) return;
    setFollowLoading(true);
    try {
      const nextAction = isFollowingUser ? "unfollow" : "follow";
      const res = await fetch("/api/network/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, action: nextAction }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsFollowingUser(data.isFollowing);
        // Refresh places with new authorization
        const pRes = await fetch(`/api/people/${personId}/places`);
        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData?.places) setPlaceConnections(pData.places);
        }
      }
    } catch (err) {
      console.error("Failed to toggle follow:", err);
    } finally {
      setFollowLoading(false);
    }
  };

  const person = state.person;
  const warmPath = state.warmPath;
  const isOwner = person?.ownerUserId === viewerId;
  const evidence = card ? buildEvidence(card, "") : [];

  // Sources: owner-only, grouped by friendly label. Never shown for
  // friend-owned records.
  const rawSourceRefs = Array.isArray(person?.sourceRefs)
    ? (person!.sourceRefs as SourceRef[])
    : [];
  const groupedSources = new Map<string, number>();
  if (isOwner) {
    for (const ref of rawSourceRefs) {
      if (typeof ref?.source !== "string") continue;
      const label = sourceLabel(ref.source);
      groupedSources.set(label, (groupedSources.get(label) ?? 0) + 1);
    }
  }

  const nextActionText = (() => {
    if (!person) return null;
    if (warmPath?.kind === "direct") {
      return `You already know ${person.displayName} directly.`;
    }
    if (warmPath?.kind === "mutual" && warmPath.mutual) {
      return `Ask ${warmPath.mutual.name} for an introduction to ${person.displayName}.`;
    }
    return "No warm introduction path in your network yet — reach out directly.";
  })();

  const aboutText = person?.bio || person?.headline || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 max-md:items-end max-md:p-0 animate-fadeIn">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Card modal (centered on laptop/iPad, bottom-sheet on phone) */}
      <aside
        ref={panelRef}
        className="material-thick relative z-10 flex w-full max-w-[560px] flex-col rounded-3xl border border-white/15 shadow-2xl animate-materialize overflow-hidden max-h-[88vh] max-md:max-h-[90vh] max-md:rounded-b-none max-md:rounded-t-2xl max-md:border-b-0"
        role="dialog"
        aria-modal="true"
        aria-label="Person details"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <span className="mono-voice text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">
            Person Profile
          </span>
          <button
            ref={closeRef}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-[var(--text-primary)]"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {state.status === "loading" && (
            <div className="space-y-4 py-8" aria-live="polite">
              <p className="mono-voice voice-active text-xs">Loading profile…</p>
              <div className="h-20 w-full animate-pulse rounded-xl bg-white/5" />
            </div>
          )}

          {state.status === "error" && (
            <div className="py-12 text-center">
              <p className="type-title text-base font-semibold text-[var(--text-primary)]">
                This person isn&apos;t reachable.
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                They may not be in your direct network or shared by a connected friend.
              </p>
              <button
                onClick={onClose}
                className="material-thin material-interactive mt-4 inline-flex items-center rounded-lg px-4 py-2 text-xs text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>
          )}

          {state.status === "ready" && person && warmPath && (
            <div className="space-y-6">
              {/* ── Identity ─────────────────────────────────── */}
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg font-medium text-[var(--text-primary)] overflow-hidden">
                  {person.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={person.avatarUrl}
                      alt={person.displayName}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <span>{person.displayName.charAt(0).toUpperCase()}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="type-title text-lg font-semibold text-[var(--text-primary)]">
                    {person.displayName}
                  </h2>
                  {(person.title || person.company) && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
                      <Building className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                      <span className="truncate">
                        {person.title}
                        {person.title && person.company ? " at " : ""}
                        {person.company}
                      </span>
                    </p>
                  )}

                  {person.location && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--accent-find)]" aria-hidden />
                      <span className="truncate">{person.location}</span>
                    </p>
                  )}

                  {/* Connection status from real warm-path data */}
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        warmPath.kind === "cold"
                          ? "bg-white/20"
                          : "bg-[var(--accent-path)]"
                      }`}
                      aria-hidden
                    />
                    {warmPath.kind === "direct" && (
                      <span className="text-[var(--text-secondary)]">Direct connection</span>
                    )}
                    {warmPath.kind === "mutual" && warmPath.mutual && (
                      <span className="text-[var(--text-secondary)]">
                        Connected via {warmPath.mutual.name}
                      </span>
                    )}
                    {warmPath.kind === "cold" && (
                      <span className="text-[var(--text-tertiary)]">No warm path yet</span>
                    )}
                  </p>

                  {/* Trusted Circle Follow Action */}
                  {targetUserId && !isSelf && (
                    <div className="mt-3">
                      <button
                        onClick={handleToggleFollow}
                        disabled={followLoading}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          isFollowingUser
                            ? "bg-[var(--accent-find)]/15 text-[var(--accent-find)] border border-[var(--accent-find)]/30 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30"
                            : "bg-white/10 text-white hover:bg-white/15 border border-white/15"
                        }`}
                        title={isFollowingUser ? "Click to remove from trusted circle" : "Add to trusted circle to see their recommendations"}
                      >
                        {followLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isFollowingUser ? (
                          <>
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>In Trusted Circle</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-3.5 w-3.5" />
                            <span>Add to Trusted Circle</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── About ────────────────────────────────────── */}
              {aboutText && (
                <div className="space-y-1.5">
                  <span className="mono-voice block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    About
                  </span>
                  <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    {aboutText}
                  </p>
                </div>
              )}

              {/* ── Interests & Skills ─────────────────────────── */}
              {Array.isArray(person.tags) && person.tags.length > 0 && (
                <div className="space-y-2">
                  <span className="mono-voice block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    Interests & Skills
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(person.tags as string[]).map((tag, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-[var(--text-secondary)] font-medium"
                      >
                        <Tag className="h-3 w-3 text-[var(--accent-find)]" />
                        <span>{tag}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Why this matches (search context only) ───── */}
              {card && evidence.length > 0 && (
                <div className="space-y-1.5">
                  <span className="mono-voice block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    Why this matches
                  </span>
                  <ul className="space-y-1">
                    {evidence.map((row, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-find)]"
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="font-medium text-[var(--text-primary)]">{row.title}</span>
                          {row.detail && (
                            <span className="text-[var(--text-tertiary)]"> · {row.detail}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Relationship ─────────────────────────────── */}
              <div className="space-y-1.5">
                <span className="mono-voice block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                  Relationship
                </span>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <WarmPathViz decision={warmPath} targetName={person.displayName} />
                  {warmPath.kind === "direct" && warmPath.directStrength !== null && (
                    <p className="mono-voice mt-2 text-[11px] text-[var(--text-tertiary)]">
                      Strength {warmPath.directStrength}/100
                    </p>
                  )}
                </div>
              </div>

              {/* ── Place Connections (Trusted Endorsements) ────── */}
              {placeConnections.length > 0 && (
                <div className="space-y-2">
                  <span className="mono-voice block text-[10px] uppercase tracking-wider text-[var(--accent-find)]">
                    Place Connections ({placeConnections.length})
                  </span>
                  <div className="space-y-2">
                    {placeConnections.map((place) => (
                      <div
                        key={place.id}
                        className="material-thin rounded-xl p-3 border border-white/5 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-[var(--text-primary)]">
                            {place.name}
                          </span>
                          {place.rating && (
                            <span className="text-amber-400 text-xs font-mono">
                              {"★".repeat(place.rating)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
                          <span>
                            {[place.category || place.type, place.city].filter(Boolean).join(" · ")}
                          </span>
                          <span className="capitalize text-[10px]">
                            {place.source === "google" ? "via Google" : "on Happensten"}
                          </span>
                        </div>
                        {place.sharedNote && (
                          <p className="text-xs italic text-[var(--text-secondary)] border-l-2 border-[var(--accent-find)] pl-2 mt-1">
                            &ldquo;{place.sharedNote}&rdquo;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Sources (owner only) ─────────────────────── */}
              {groupedSources.size > 0 && (
                <div className="space-y-1.5">
                  <span className="mono-voice block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    Sources
                  </span>
                  <ul className="space-y-1">
                    {[...groupedSources.entries()].map(([label, count]) => (
                      <li
                        key={label}
                        className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]"
                      >
                        <Link2 className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                        <span>
                          {label}
                          {count > 1 && (
                            <span className="text-[var(--text-tertiary)]"> · {count} entries</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sticky footer: best next action + draft ─────── */}
        {state.status === "ready" && person && warmPath && (
          <footer className="border-t border-white/10 bg-[var(--material-thick)]/95 px-6 py-4 pb-safe backdrop-blur-xl">
            {nextActionText && (
              <div className="mb-3">
                <span className="mono-voice block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                  Best next action
                </span>
                <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">
                  {nextActionText}
                </p>
              </div>
            )}

            <DraftComposer
              target={{
                id: person.id,
                name: person.displayName,
                title: person.title,
                company: person.company,
              }}
              mutual={warmPath.mutual}
              targetEmail={person.primaryEmail}
            />
          </footer>
        )}
      </aside>
    </div>
  );
}