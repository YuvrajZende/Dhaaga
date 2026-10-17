/* Tiny editorial figures — walkers, ladders, climbers.
   Minimal silhouettes, limb animation via CSS (fig-limb-a/b), scroll-synced
   climbing via GSAP in the section that mounts them. Decorative only:
   every usage is inside an aria-hidden container. */

const FIG_VIEW = { w: 20, h: 36 };
const SHOULDER = "10px 10px";
const HIP = "10px 21px";

function FigureBody({ color }: { color: string }) {
  return (
    <>
      <circle cx={10} cy={4} r={3.1} fill={color} />
      <path
        d="M10 7.2 V 21"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      {/* arms — swing from the shoulder */}
      <g className="fig-limb fig-limb-a" style={{ transformOrigin: SHOULDER }}>
        <path d="M10 10 L5 16.5" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      </g>
      <g className="fig-limb fig-limb-b" style={{ transformOrigin: SHOULDER }}>
        <path d="M10 10 L15 16.5" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      </g>
      {/* legs — opposite phase to arms for a natural gait */}
      <g className="fig-limb fig-limb-b" style={{ transformOrigin: HIP }}>
        <path d="M10 21 L6.5 32.5" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      </g>
      <g className="fig-limb fig-limb-a" style={{ transformOrigin: HIP }}>
        <path d="M10 21 L13.5 32.5" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      </g>
    </>
  );
}

/* A figure walking along a ledge. The svg spans the walk distance; the
   figure translates across it on a loop (CSS, paused under reduced motion). */
export function WalkingFigure({
  color = "var(--lp-navy)",
  distance = 180,
  duration = "18s",
  className,
}: {
  color?: string;
  distance?: number;
  duration?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${distance + FIG_VIEW.w} ${FIG_VIEW.h}`}
      width={distance + FIG_VIEW.w}
      height={FIG_VIEW.h}
      className={className}
      aria-hidden
    >
      <g
        className="fig-traverse"
        style={{ "--fig-walk-dist": `${distance}px`, "--fig-walk-dur": duration } as React.CSSProperties}
      >
        <FigureBody color={color} />
      </g>
    </svg>
  );
}

/* A standing figure with one arm raised — reaching a node. */
export function ReachingFigure({
  color = "var(--lp-navy)",
  size = 40,
  className,
}: {
  color?: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg viewBox={`0 0 ${FIG_VIEW.w} ${FIG_VIEW.h}`} width={size} height={(size / FIG_VIEW.w) * FIG_VIEW.h} className={className} aria-hidden>
      <circle cx={10} cy={4} r={3.1} fill={color} />
      <path d="M10 7.2 V 21" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      {/* raised arm toward the highlight */}
      <path d="M10 10 L16 3.5" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M10 10 L5.5 16.5" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M10 21 L6.5 32.5" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M10 21 L13.5 32.5" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* A thin ladder. Height in px; rungs every 22px. */
export function Ladder({
  height = 260,
  color = "rgba(11,31,58,0.4)",
  className,
}: {
  height?: number;
  color?: string;
  className?: string;
}) {
  const rungs = Math.max(2, Math.floor((height - 16) / 22));
  const step = (height - 16) / rungs;
  return (
    <svg
      viewBox={`0 0 26 ${height}`}
      width={26}
      height={height}
      className={className}
      aria-hidden
      preserveAspectRatio="xMidYMid meet"
    >
      <path d={`M8 2 V ${height - 2}`} stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d={`M18 2 V ${height - 2}`} stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
      {Array.from({ length: rungs + 1 }).map((_, i) => (
        <path
          key={i}
          d={`M8 ${4 + i * step} H 18`}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </svg>
  );
}

/* The climbing figure — positioned over a Ladder by the parent section;
   vertical travel is scrubbed by GSAP via [data-climber]. Limbs keep the
   CSS swing so the climb reads as motion, not a slide. */
export function ClimbingFigure({
  color = "var(--lp-terracotta)",
  size = 22,
  className,
}: {
  color?: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${FIG_VIEW.w} ${FIG_VIEW.h}`}
      width={size}
      height={(size / FIG_VIEW.w) * FIG_VIEW.h}
      className={className}
      aria-hidden
      style={{ overflow: "visible" }}
    >
      <FigureBody color={color} />
    </svg>
  );
}
