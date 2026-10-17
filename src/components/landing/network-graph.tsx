"use client";

/* Illustrative relationship-network visualization for the landing hero.
   Organic radial composition: the user at center, people/places around,
   one terracotta "warm path" drawn me → mutual → target. Decorative — the
   product story is told in the surrounding copy. Hovering a person
   emphasizes their connections; the rest steps back. */

import React, { useState } from "react";

const PORTRAITS = {
  you: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=160&auto=format&fit=crop&q=80",
  priya: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&auto=format&fit=crop&q=80",
  marcus: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&auto=format&fit=crop&q=80",
  david: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80",
  ana: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=160&auto=format&fit=crop&q=80",
  sam: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=160&auto=format&fit=crop&q=80",
} as const;

interface NodeSpec {
  id: string;
  x: number;
  y: number;
  r: number;
  src?: string;
  initials: string;
  ring: string;
  disc: string;
  label: string;
  sub?: string;
  chip?: { text: string; tone: "orange" | "sage" };
}

const NODES: NodeSpec[] = [
  {
    id: "you",
    x: 272,
    y: 298,
    r: 44,
    src: PORTRAITS.you,
    initials: "YOU",
    ring: "var(--lp-navy)",
    disc: "var(--lp-sage-deep)",
    label: "You",
  },
  {
    id: "priya",
    x: 118,
    y: 158,
    r: 36,
    src: PORTRAITS.priya,
    initials: "PS",
    ring: "var(--lp-sage-deep)",
    disc: "var(--lp-sage)",
    label: "Priya Shah",
    sub: "mutual · 12 shared",
    chip: { text: "strongest mutual", tone: "sage" },
  },
  {
    id: "marcus",
    x: 438,
    y: 132,
    r: 40,
    src: PORTRAITS.marcus,
    initials: "MT",
    ring: "var(--lp-terracotta)",
    disc: "#f5e4df",
    label: "Marcus Tran",
    sub: "3 email threads",
    chip: { text: "AI founder", tone: "orange" },
  },
  {
    id: "david",
    x: 462,
    y: 338,
    r: 31,
    src: PORTRAITS.david,
    initials: "DK",
    ring: "var(--lp-border)",
    disc: "var(--lp-surface)",
    label: "David Kim",
    sub: "via Priya",
  },
  {
    id: "ana",
    x: 158,
    y: 428,
    r: 31,
    src: PORTRAITS.ana,
    initials: "AL",
    ring: "var(--lp-border)",
    disc: "var(--lp-surface)",
    label: "Ana Lucas",
    sub: "calendar · weekly",
  },
  {
    id: "sam",
    x: 330,
    y: 466,
    r: 26,
    src: PORTRAITS.sam,
    initials: "SR",
    ring: "var(--lp-border)",
    disc: "var(--lp-surface)",
    label: "Sam Rao",
  },
];

/* hairline connections, center to center (nodes drift over them) */
const LINKS: Array<[string, string, boolean?]> = [
  ["you", "priya"],
  ["you", "marcus"],
  ["you", "david"],
  ["you", "ana"],
  ["you", "sam"],
  ["priya", "marcus", true], // dashed — the mutual edge
  ["david", "sam", true],
];

function curve(a: NodeSpec, b: NodeSpec) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // perpendicular bow so no two connections feel mechanical
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = len * 0.12;
  const cx = mx + (-dy / len) * bow;
  const cy = my + (dx / len) * bow;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

export default function NetworkGraph() {
  const [hover, setHover] = useState<string | null>(null);
  const byId = new Map(NODES.map((n) => [n.id, n]));
  const you = byId.get("you")!;
  const priya = byId.get("priya")!;
  const marcus = byId.get("marcus")!;

  return (
    <figure
      aria-hidden
      className="relative mx-auto w-full max-w-[560px] select-none"
    >
      <svg
        viewBox="0 0 560 560"
        className="h-auto w-full"
        role="presentation"
      >
        <defs>
          {NODES.map((n) => (
            <clipPath key={n.id} id={`ng-clip-${n.id}`}>
              <circle cx={n.x} cy={n.y} r={n.r - 2.5} />
            </clipPath>
          ))}
        </defs>

        {/* hairlines — drawn first, beneath every node; solid links draw in
            staggered (pathLength=1 makes any path drawable in one beat). */}
        {LINKS.map(([a, b, dashed], i) => {
          const na = byId.get(a)!;
          const nb = byId.get(b)!;
          const touched = hover !== null && (a === hover || b === hover);
          const dimmed = hover !== null && !touched;
          return (
            <path
              key={`${a}-${b}`}
              d={curve(na, nb)}
              fill="none"
              stroke={touched ? "rgba(11,31,58,0.5)" : "rgba(11,31,58,0.18)"}
              strokeWidth={touched ? 1.9 : 1.25}
              strokeDasharray={dashed ? "3 5" : "1"}
              pathLength={dashed ? undefined : 1}
              opacity={dimmed ? 0.45 : 1}
              className={dashed ? undefined : "ng-link-draw"}
              style={{
                animationDelay: `${0.15 + i * 0.09}s`,
                transition: "opacity 200ms ease-out, stroke 200ms ease-out",
              }}
            />
          );
        })}

        {/* the warm path — terracotta, draws in once on load */}
        <path
          className="ng-path-draw"
          d={`${curve(you, priya)} ${curve(priya, marcus)}`}
          fill="none"
          stroke="var(--lp-terracotta)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {NODES.map((n, i) => {
          const dimmed =
            hover !== null && hover !== n.id && !LINKS.some(([a, b]) => (a === hover && b === n.id) || (b === hover && a === n.id));
          return (
            <g
              key={n.id}
              className={`ng-drift ng-node`}
              style={{
                animationDelay: `${-i * 3.1}s`,
                animationDuration: `${13 + i * 1.7}s`,
                opacity: dimmed ? 0.55 : 1,
                transition: "opacity 200ms ease-out",
              }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
            >
              {/* chip above the node */}
              {n.chip && (
                <g>
                  <rect
                    x={n.x - n.chip.text.length * 3.4 - 12}
                    y={n.y - n.r - 26}
                    width={n.chip.text.length * 6.8 + 24}
                    height={19}
                    rx={9.5}
                    fill={n.chip.tone === "orange" ? "var(--lp-terracotta)" : "var(--lp-sage)"}
                  />
                  <text
                    x={n.x}
                    y={n.y - n.r - 13}
                    textAnchor="middle"
                    fill={n.chip.tone === "orange" ? "#ffffff" : "var(--lp-forest)"}
                    fontSize={9.5}
                    fontFamily="var(--font-geist-mono), monospace"
                    fontWeight={600}
                    letterSpacing={0.5}
                  >
                    {n.chip.text.toUpperCase()}
                  </text>
                </g>
              )}

              {/* opaque disc — also the graceful fallback if the portrait fails */}
              <circle cx={n.x} cy={n.y} r={n.r} fill={n.disc} />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fill="rgba(11,31,58,0.55)"
                fontSize={n.r > 36 ? 13 : 11}
                fontFamily="var(--font-geist-mono), monospace"
                fontWeight={600}
              >
                {n.initials}
              </text>

              {/* portrait, clipped to the disc */}
              {n.src && (
                <image
                  href={n.src}
                  x={n.x - n.r + 2.5}
                  y={n.y - n.r + 2.5}
                  width={(n.r - 2.5) * 2}
                  height={(n.r - 2.5) * 2}
                  clipPath={`url(#ng-clip-${n.id})`}
                  preserveAspectRatio="xMidYMid slice"
                />
              )}

              {/* ring */}
              <circle
                cx={n.x}
                cy={n.y}
                r={n.r}
                fill="none"
                stroke={n.ring}
                strokeWidth={n.id === "you" ? 2.5 : 1.75}
              />

              {/* label */}
              <text
                x={n.x}
                y={n.y + n.r + 15}
                textAnchor="middle"
                fill="var(--lp-navy)"
                fontSize={n.id === "you" ? 12 : 10.5}
                fontWeight={600}
                fontFamily="var(--font-host), sans-serif"
              >
                {n.label}
              </text>
              {n.sub && (
                <text
                  x={n.x}
                  y={n.y + n.r + 28}
                  textAnchor="middle"
                  fill="rgba(23,32,25,0.5)"
                  fontSize={8.5}
                  fontFamily="var(--font-geist-mono), monospace"
                >
                  {n.sub}
                </text>
              )}
            </g>
          );
        })}

        {/* place + company chips — rounded rects, not circles */}
        <g className="ng-drift" style={{ animationDelay: "-8s", animationDuration: "19s" }}>
          <rect
            x={402}
            y={222}
            width={126}
            height={30}
            rx={15}
            fill="var(--lp-white)"
            stroke="var(--lp-border)"
          />
          <text
            x={465}
            y={241}
            textAnchor="middle"
            fill="var(--lp-forest)"
            fontSize={10}
            fontFamily="var(--font-geist-mono), monospace"
            fontWeight={500}
          >
            Blue Bottle · cafe
          </text>
          <path
            d="M 452 244 Q 430 270 410 288"
            fill="none"
            stroke="rgba(23,32,25,0.25)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        </g>

        <g className="ng-drift" style={{ animationDelay: "-5.2s", animationDuration: "21s" }}>
          <rect
            x={488}
            y={66}
            width={62}
            height={26}
            rx={13}
            fill="var(--lp-navy)"
          />
          <text
            x={519}
            y={83}
            textAnchor="middle"
            fill="#faf8f2"
            fontSize={10}
            fontFamily="var(--font-geist-mono), monospace"
            fontWeight={500}
          >
            Vellum
          </text>
          <path
            d="M 512 92 Q 500 108 470 118"
            fill="none"
            stroke="rgba(11,31,58,0.3)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        </g>
      </svg>

      <figcaption className="lp-meta mt-2 text-center text-[var(--lp-muted)]">
        Illustrative preview — yours builds from your connected sources
      </figcaption>
    </figure>
  );
}
