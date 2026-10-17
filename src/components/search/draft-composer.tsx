"use client";

import React, { useState } from "react";
import { Copy, Mail, RefreshCw, Sparkles, Check } from "lucide-react";
import { WarmPathMutual } from "@/lib/warmpath/select";
import { buildMailto } from "@/lib/client/mailto";

interface Target {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
}

export default function DraftComposer({
  target,
  mutual,
  targetEmail = null,
}: {
  target: Target;
  mutual: WarmPathMutual | null;
  targetEmail?: string | null;
}) {
  const [status, setStatus] = useState<"idle" | "generating" | "editing">("idle");
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipientEmail = mutual?.email || targetEmail;
  const recipientName = mutual ? mutual.name : target.name;

  async function generate() {
    setStatus("generating");
    setError(null);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPersonId: target.id,
          mutualPersonId: mutual?.id ?? null,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to generate draft (${res.status})`);
      }

      const data = await res.json();
      setDraft({
        subject: data.draft.subject || "Introduction",
        body: data.draft.body,
      });
      setStatus("editing");
    } catch (err) {
      console.error("Draft generation failed:", err);
      setError("Could not draft message. Please try again.");
      setStatus("idle");
    }
  }

  async function handleCopy() {
    if (!draft) return;
    const fullText = `Subject: ${draft.subject}\n\n${draft.body}`;
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (status === "idle") {
    return (
      <div className="pt-2">
        <button
          onClick={generate}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--accent-find)] px-4 py-2 text-[13px] font-medium text-[var(--accent-on-find)] transition-transform duration-150 hover:brightness-110 active:scale-[0.98]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {mutual ? `Draft intro via ${mutual.name}` : `Draft intro to ${target.name}`}
        </button>
        {error && <p className="mono-voice mt-2 text-xs text-rose-400">{error}</p>}
      </div>
    );
  }

  if (status === "generating") {
    return (
      <div className="space-y-2 rounded-xl bg-white/[0.03] p-4" aria-live="polite">
        <p className="mono-voice voice-active text-xs">
          drafting introduction to {recipientName}…
        </p>
        <p className="mono-voice text-[11px] text-[var(--text-tertiary)]">
          grounding with shared context and background
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left">
      <div className="flex items-center justify-between">
        <span className="mono-voice text-[11px] text-[var(--text-secondary)]">
          DRAFT TO {recipientName.toUpperCase()}
        </span>
        <button
          onClick={generate}
          className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
          title="Regenerate draft"
        >
          <RefreshCw className="h-3 w-3" />
          Regenerate
        </button>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-[var(--text-tertiary)]">
          Subject
        </label>
        <input
          type="text"
          value={draft?.subject || ""}
          onChange={(e) => setDraft((d) => (d ? { ...d, subject: e.target.value } : null))}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-find)] focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-[var(--text-tertiary)]">
          Message Body
        </label>
        <textarea
          rows={6}
          value={draft?.body || ""}
          onChange={(e) => setDraft((d) => (d ? { ...d, body: e.target.value } : null))}
          className="w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-[var(--text-primary)] focus:border-[var(--accent-find)] focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={handleCopy}
          className="material-thin material-interactive inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
              Copy
            </>
          )}
        </button>

        {recipientEmail && draft && (
          <a
            href={buildMailto(recipientEmail, draft.subject, draft.body)}
            className="material-thin material-interactive inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Mail className="h-3.5 w-3.5 text-[var(--accent-path)]" />
            Open in Mail
          </a>
        )}
      </div>
    </div>
  );
}
