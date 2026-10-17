"use client";

import React, { useState } from "react";
import { X, Mail, Copy, Check, MessageSquare } from "lucide-react";
import { CircleRecommender, PlaceCard } from "@/lib/places/types";
import { buildMailto } from "@/lib/client/mailto";

interface AskFriendModalProps {
  friend: CircleRecommender;
  place: PlaceCard;
  onClose: () => void;
}

export default function AskFriendModal({
  friend,
  place,
  onClose,
}: AskFriendModalProps) {
  const firstName = friend.name.split(" ")[0];
  const placeCategory = place.category || place.type || "place";

  const defaultSubject = `Quick question about ${place.name}`;
  const defaultBody = `Hey ${firstName},

I saw that you recommended ${place.name} on Happensten. I'm looking for a good ${placeCategory} nearby — would you recommend it? Anything specific you'd suggest trying?

Thanks!`;

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(`${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpenMail() {
    const mailto = buildMailto("", subject, body);
    window.open(mailto, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-friend-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Modal Card */}
      <div className="material-heavy relative z-10 w-full max-w-lg rounded-2xl border border-white/10 p-6 shadow-2xl space-y-5 animate-scaleUp">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-find)]/20 text-[var(--accent-find)] font-bold text-sm">
              {firstName.charAt(0)}
            </div>
            <div>
              <h3 id="ask-friend-title" className="type-title text-base font-bold text-[var(--text-primary)]">
                Ask {friend.name}
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                About their recommendation for {place.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="material-thin material-interactive rounded-xl p-1.5 text-[var(--text-tertiary)] hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Note / Invariant notice */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-[var(--text-secondary)]">
          <p>
            You can review, edit, or copy this note to ask {firstName} directly.
            Messages are never sent automatically.
          </p>
        </div>

        {/* Subject line */}
        <div className="space-y-1">
          <label className="mono-voice text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent-find)] focus:outline-none"
          />
        </div>

        {/* Message body */}
        <div className="space-y-1">
          <label className="mono-voice text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
            Message
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="w-full rounded-xl bg-black/40 border border-white/10 p-3 text-xs text-[var(--text-primary)] focus:border-[var(--accent-find)] focus:outline-none leading-relaxed"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={handleCopy}
            className="material-thin material-interactive flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] hover:text-white"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? "Copied to clipboard" : "Copy text"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="material-thin material-interactive rounded-xl px-3.5 py-2 text-xs text-[var(--text-secondary)] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleOpenMail}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--accent-find)] px-4 py-2 text-xs font-semibold text-[var(--accent-on-find)] hover:brightness-110 active:scale-95 transition-transform"
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Open in Email</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
