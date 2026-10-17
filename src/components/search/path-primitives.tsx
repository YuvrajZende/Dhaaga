import React from "react";

export function PathNode({ label }: { label: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-secondary)]" />
      <span className="font-medium text-[var(--text-primary)]">{label}</span>
    </span>
  );
}

export function PathLine() {
  return <span className="h-px w-4 shrink-0 bg-[var(--accent-path)]/30 sm:w-6" aria-hidden />;
}
