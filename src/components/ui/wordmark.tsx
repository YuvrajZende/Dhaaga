import React from "react";

export function Wordmark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        d="M6.2 16.6 L12 6.8 L17.8 16.6"
        fill="none"
        stroke="var(--lp-navy, #0b1f3a)"
        strokeWidth="1.6"
      />
      <circle cx="6.2" cy="17.4" r="2.9" fill="var(--lp-navy, #0b1f3a)" />
      <circle
        cx="17.8"
        cy="17.4"
        r="2.9"
        fill="var(--lp-sage-deep, #b9cdb4)"
        stroke="var(--lp-navy, #0b1f3a)"
        strokeWidth="1.4"
      />
      <circle cx="12" cy="5.9" r="3.4" fill="var(--lp-orange, #ff4d2d)" />
    </svg>
  );
}
