import React from "react";
import { WarmPathDecision } from "@/lib/warmpath/select";
import { PathNode, PathLine } from "./path-primitives";

export default function WarmPathViz({
  decision,
  targetName,
}: {
  decision: WarmPathDecision;
  targetName: string;
}) {
  if (decision.kind === "direct") {
    return (
      <div className="flex items-center gap-2.5 text-xs" aria-label="Direct connection">
        <PathNode label="You" />
        <PathLine />
        <span className="material-thin rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--accent-find)]">
          direct · {decision.directStrength}
        </span>
        <PathLine />
        <span className="font-medium text-[var(--text-primary)]">{targetName}</span>
      </div>
    );
  }

  if (decision.kind === "mutual" && decision.mutual) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs" aria-label="Warm path via mutual">
        <PathNode label="You" />
        <PathLine />
        <span className="material-thin flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--accent-path)]">
          {decision.mutual.name}
          <span className="mono-voice text-[var(--text-tertiary)]">{decision.mutual.strength}</span>
        </span>
        <PathLine />
        <span className="font-medium text-[var(--text-primary)]">{targetName}</span>
      </div>
    );
  }

  return (
    <p className="mono-voice text-[var(--text-tertiary)]" aria-label="No warm path">
      NO WARM PATH — DIRECT OUTREACH
    </p>
  );
}
