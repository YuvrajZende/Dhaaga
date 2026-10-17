/**
 * Strength ring — ui.md §6. A quiet circular gauge for connection strength;
 * gold arc sweeps on mount (CSS transition, disabled under reduced motion).
 */
export default function StrengthArc({
  value,
  size = 30,
}: {
  value: number;
  size?: number;
}) {
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      role="img"
      aria-label={`Connection strength ${value} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent-find)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="mono-voice absolute text-[9px] leading-none text-[var(--text-primary)]">
        {value}
      </span>
    </div>
  );
}
