"use client";

import React from "react";
import { CandidateCard } from "@/lib/search/types";
import StrengthArc from "@/components/strength-arc";
import { Check, Lock, ArrowRight, Users, MapPin } from "lucide-react";
import { PathNode, PathLine } from "./path-primitives";
import { buildEvidence, prioritizeTags, relevanceBucket } from "@/lib/search/evidence";

/**
 * Search result card — V2 hierarchy:
 * Identity → WHY THIS MATCHES → interests → connection → provenance → action.
 *
 * Relevance (query fit) and connection (network strength) are deliberately
 * separate: relevance lives top-right as a semantic label, connection as the
 * strength arc + path row. Never merged into one score.
 */
export default function ResultCard({
  card,
  index,
  onOpen,
  query,
  muted = false,
}: {
  card: CandidateCard;
  index: number;
  onOpen: (personId: string) => void;
  query: string;
  muted?: boolean;
}) {
  const bucket = relevanceBucket(card.matchScore);
  const evidence = buildEvidence(card, query);
  const { visible: visibleTags, hidden: hiddenTags } = prioritizeTags(
    card.tags,
    query,
    card.intent
  );

  const isFriendScope = Boolean(card.viaFriend);
  const ctaLabel = card.mutual ? "Draft intro request" : "Draft a message";

  return (
    <article
      onClick={() => onOpen(card.personId)}
      className={`material-medium material-interactive animate-materialize group relative cursor-pointer rounded-2xl p-4 sm:p-5 transition-all duration-200 hover:border-white/20 ${
        muted ? "opacity-70 hover:opacity-100" : ""
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
      tabIndex={0}
      role="button"
      aria-label={`View profile for ${card.name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(card.personId);
        }
      }}
    >
      {/* ── Identity + relevance ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm font-medium text-[var(--text-primary)] overflow-hidden">
            {card.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.avatarUrl}
                alt={card.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="mono-voice text-[var(--accent-find)]">
                {card.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="type-title text-base font-semibold text-[var(--text-primary)] group-hover:text-white transition-colors">
              {card.name}
            </h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-[var(--text-secondary)]">
              {(card.title || card.company) && (
                <span className="truncate">
                  {card.title}
                  {card.title && card.company ? " at " : ""}
                  {card.company}
                </span>
              )}
              {card.location && (
                <span className="inline-flex items-center gap-1 text-[12px] text-[var(--text-tertiary)] shrink-0">
                  <MapPin className="h-3 w-3 shrink-0 text-[var(--accent-find)]" aria-hidden />
                  <span className="truncate">{card.location}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Relevance (query fit) and connection (network) — separate, never merged */}
        <div className="shrink-0 flex items-start gap-3">
          {bucket && (
            <div className="flex flex-col items-end gap-1">
              <span
                className={`material-thin rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                  bucket.tier === "high"
                    ? "text-[var(--accent-find)]"
                    : bucket.tier === "low"
                      ? "text-[var(--text-tertiary)]"
                      : "text-[var(--text-secondary)]"
                }`}
                title={
                  card.matchScore !== undefined
                    ? `Relevance score ${Math.round(card.matchScore)} — a composite ranking signal, not a probability`
                    : undefined
                }
              >
                {bucket.label}
              </span>
              {card.matchScore !== undefined && (
                <span className="mono-voice text-[10px] text-[var(--text-tertiary)]">
                  {Math.round(card.matchScore)} relevance
                </span>
              )}
            </div>
          )}

          <div className="flex flex-col items-center" title={`Connection strength: ${card.strength}/100`}>
            <StrengthArc value={card.strength} />
            <span className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider mt-0.5">
              Connection
            </span>
          </div>
        </div>
      </div>

      {/* ── WHY THIS MATCHES ─────────────────────────────────── */}
      {evidence.length > 0 && (
        <div className="mt-3.5">
          <span className="mono-voice block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
            Why this matches
          </span>
          <ul className="mt-1.5 space-y-1">
            {evidence.map((row, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-[var(--accent-find)]" aria-hidden />
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

      {/* ── Interests (query-aware ordering) ─────────────────── */}
      {visibleTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="material-thin rounded-full px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]"
            >
              {tag}
            </span>
          ))}
          {hiddenTags > 0 && (
            <span className="self-center text-[11px] text-[var(--text-tertiary)]">
              +{hiddenTags}
            </span>
          )}
        </div>
      )}

      {/* ── YOUR CONNECTION ──────────────────────────────────── */}
      <div className="mt-3.5">
        <span className="mono-voice block text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
          Your connection
        </span>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
          <PathNode label="You" />
          <PathLine />
          {isFriendScope ? (
            <span className="text-[11px] font-medium text-[var(--accent-path)]">
              In {card.viaFriend!.name}&apos;s network
            </span>
          ) : (
            <span className="mono-voice rounded-full px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent-path)]">
              Direct · {card.strength}/100
            </span>
          )}
          <PathLine />
          <PathNode label={card.name} />

          {card.mutual && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpen(card.mutual!.id);
              }}
              className="ml-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--accent-path)] transition-colors hover:bg-white/10"
              title={`View ${card.mutual.name}'s profile — the mutual contact linking you to ${card.name}`}
            >
              <Users className="h-3 w-3" />
              2nd degree · via {card.mutual.name}
            </button>
          )}
        </div>
      </div>

      {/* ── Provenance + actions ─────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
        {!isFriendScope ? (
          <span
            className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]"
            title="Profile notes and interests are private to your account"
          >
            <Lock className="h-3 w-3" aria-hidden />
            Private to you
          </span>
        ) : (
          <span className="text-[11px] text-[var(--text-tertiary)]">
            Shared by {card.viaFriend!.name}
          </span>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpen(card.personId);
            }}
            className="material-thin material-interactive rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            View profile
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpen(card.personId);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-find)] px-3.5 py-1.5 text-xs font-medium text-[var(--accent-on-find)] transition-transform duration-150 hover:brightness-110 active:scale-[0.97]"
          >
            {ctaLabel}
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </article>
  );
}