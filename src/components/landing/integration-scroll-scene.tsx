"use client";

/* ==========================================================================
   Happensten — Scroll-Driven App Extraction Animation (IntegrationScrollScene)
   
   A smartphone displaying an iOS home screen appears on the right.
   As the visitor scrolls:
   1. Google, Gmail, LinkedIn, X, Instagram, and Facebook icons visibly lift
      out of their exact positions inside the phone screen.
   2. Each app appears EXACTLY ONCE visually throughout the animation.
   3. Keyed dictionary refs prevent any index misalignment or icon swapping.
   4. Precisely sized masks cover only the 6 source icon slots and their labels
      as the icons depart, fading back out on reverse scroll.
   5. Destination icons render their genuine brand artwork.
   6. Connection lines stream from the settled icons into a central
      Happensten node, unveiling connected profile paths.
   ========================================================================== */

import React, { useEffect, useRef, useId, useCallback } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ShieldCheck, Network, ArrowRight } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

interface AppSpec {
  id: string;
  name: string;
  iconSrc: string;
  row: 1 | 2;
  // Exact pixel coordinates on the 495 x 1024 phone image
  x: number;
  y: number;
  w: number;
  h: number;
}

const APPS: AppSpec[] = [
  {
    id: "google",
    name: "Google",
    iconSrc: "/icons/google.png",
    row: 1,
    x: 64,
    y: 323,
    w: 65,
    h: 65,
  },
  {
    id: "gmail",
    name: "Gmail",
    iconSrc: "/icons/gmail.png",
    row: 1,
    x: 166,
    y: 323,
    w: 65,
    h: 65,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    iconSrc: "/icons/linkedin.png",
    row: 1,
    x: 265,
    y: 322,
    w: 66,
    h: 66,
  },
  {
    id: "x",
    name: "X",
    iconSrc: "/icons/x.png",
    row: 1,
    x: 365,
    y: 322,
    w: 66,
    h: 66,
  },
  {
    id: "instagram",
    name: "Instagram",
    iconSrc: "/icons/instagram.png",
    row: 2,
    x: 64,
    y: 418,
    w: 65,
    h: 65,
  },
  {
    id: "facebook",
    name: "Facebook",
    iconSrc: "/icons/facebook.png",
    row: 2,
    x: 165,
    y: 418,
    w: 65,
    h: 65,
  },
];

export default function IntegrationScrollScene() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinWrapRef = useRef<HTMLDivElement>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const destRowRef = useRef<HTMLDivElement>(null);

  // Keyed dictionary refs to eliminate array order and index drift bugs
  const destSlotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const flyingIconRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const destLabelRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  const phoneWrapRef = useRef<HTMLDivElement>(null);
  const phoneImgRef = useRef<HTMLImageElement>(null);
  const phoneLabelRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const networkCardRef = useRef<HTMLDivElement>(null);
  const svgLinesRef = useRef<Array<SVGPathElement | null>>([]);
  const centralNodeRef = useRef<HTMLDivElement>(null);
  const branchPathRef = useRef<SVGPathElement>(null);
  const profileCardsRef = useRef<Array<HTMLDivElement | null>>([]);

  const mmRef = useRef<gsap.MatchMedia | null>(null);
  const maskId = useId();

  const buildAnimation = useCallback(() => {
    if (mmRef.current) {
      mmRef.current.revert();
    }

    const mm = gsap.matchMedia();
    mmRef.current = mm;

    // Desktop pinned scroll sequence
    mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
      const section = sectionRef.current;
      const pinWrap = pinWrapRef.current;
      const phoneImg = phoneImgRef.current;
      const phoneWrap = phoneWrapRef.current;
      const destRow = destRowRef.current;
      const networkCard = networkCardRef.current;

      if (!section || !pinWrap || !phoneImg || !destRow || !phoneWrap) return;

      // Reset dynamic properties without clearing layout/positioning styles
      APPS.forEach((app) => {
        const flyingIcon = flyingIconRefs.current[app.id];
        const phoneLabel = phoneLabelRefs.current[app.id];
        const destLabel = destLabelRefs.current[app.id];

        if (flyingIcon) gsap.set(flyingIcon, { clearProps: "transform,opacity,boxShadow" });
        if (phoneLabel) gsap.set(phoneLabel, { opacity: 1 });
        if (destLabel) gsap.set(destLabel, { opacity: 0, y: 6 });
      });

      if (phoneWrap) gsap.set(phoneWrap, { clearProps: "transform,opacity" });
      if (networkCard) gsap.set(networkCard, { opacity: 0, y: 16 });
      if (centralNodeRef.current) gsap.set(centralNodeRef.current, { scale: 0.8, opacity: 0 });
      if (branchPathRef.current) gsap.set(branchPathRef.current, { strokeDashoffset: 1 });
      svgLinesRef.current.forEach((line) => {
        if (line) gsap.set(line, { strokeDashoffset: 1 });
      });
      profileCardsRef.current.forEach((card) => {
        if (card) gsap.set(card, { opacity: 0, y: 12 });
      });

      // Measure real rendered bounding box of phone image
      const imgRect = phoneImg.getBoundingClientRect();
      const scaleX = imgRect.width / 495;
      const scaleY = imgRect.height / 1024;

      // Compute exact FLIP deltas keyed by app ID
      const deltas: Record<string, { dx: number; dy: number; startScale: number }> = {};

      APPS.forEach((app) => {
        const flyingIcon = flyingIconRefs.current[app.id];
        if (!flyingIcon) return;

        const fRect = flyingIcon.getBoundingClientRect();
        const fCenterX = fRect.left + fRect.width / 2;
        const fCenterY = fRect.top + fRect.height / 2;

        const srcCenterX = imgRect.left + (app.x + app.w / 2) * scaleX;
        const srcCenterY = imgRect.top + (app.y + app.h / 2) * scaleY;
        const srcW = app.w * scaleX;

        deltas[app.id] = {
          dx: srcCenterX - fCenterX,
          dy: srcCenterY - fCenterY,
          startScale: srcW / (fRect.width || 1),
        };
      });

      // Position each animated icon directly on top of its phone slot at scroll=0
      APPS.forEach((app) => {
        const flyingIcon = flyingIconRefs.current[app.id];
        const delta = deltas[app.id];
        if (!flyingIcon || !delta) return;

        gsap.set(flyingIcon, {
          x: delta.dx,
          y: delta.dy,
          scale: delta.startScale,
          transformOrigin: "center center",
          opacity: 1,
          boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
          zIndex: 40,
        });
      });

      // Master scroll timeline: pin the inner wrapper, keeping the section cleanly in React DOM
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          pin: pinWrap,
          start: "top top",
          end: "+=260%",
          scrub: 0.7,
          anticipatePin: 1,
        },
      });

      // Phase 1: Staggered App Extraction
      const staggers = [0.10, 0.17, 0.24, 0.31, 0.38, 0.45];
      const flightDuration = 0.28;

      APPS.forEach((app, i) => {
        const flyingIcon = flyingIconRefs.current[app.id];
        const phoneLabel = phoneLabelRefs.current[app.id];
        const destLabel = destLabelRefs.current[app.id];
        const delta = deltas[app.id];

        if (!flyingIcon || !delta) return;

        const startT = staggers[i];
        const rot = i % 2 === 0 ? 3 : -3;

        // 1. As the icon lifts, fade out its source label on the phone (restores on reverse scroll)
        if (phoneLabel) {
          tl.to(
            phoneLabel,
            { opacity: 0, duration: 0.08, ease: "power1.out" },
            startT
          );
        }

        // 2. Icon physically lifts off phone screen: scale increases, casts soft 3D elevation shadow
        tl.to(
          flyingIcon,
          {
            scale: delta.startScale * 1.2,
            boxShadow: "0 22px 34px rgba(0,0,0,0.35)",
            duration: 0.08,
            ease: "power2.out",
          },
          startT
        );

        // 3. Smooth curved trajectory toward destination slot on the left
        tl.to(
          flyingIcon,
          {
            x: 0,
            rotation: rot,
            duration: flightDuration,
            ease: "power1.inOut",
          },
          startT + 0.04
        );

        // Vertical arc (lifts at apex, then descends cleanly)
        const arcY = delta.dy * 0.45 - 35;
        tl.to(
          flyingIcon,
          {
            y: arcY,
            duration: flightDuration * 0.5,
            ease: "sine.out",
          },
          startT + 0.04
        );
        tl.to(
          flyingIcon,
          {
            y: 0,
            duration: flightDuration * 0.5,
            ease: "sine.in",
          },
          startT + 0.04 + flightDuration * 0.5
        );

        // 4. Settle into destination slot: straighten rotation, settle scale, dock
        tl.to(
          flyingIcon,
          {
            scale: 1,
            rotation: 0,
            boxShadow: "0 4px 12px rgba(23,43,37,0.06)",
            duration: 0.1,
            ease: "back.out(1.2)",
          },
          startT + flightDuration - 0.02
        );

        // 5. Destination label appears once the icon docks
        if (destLabel) {
          tl.to(
            destLabel,
            {
              opacity: 1,
              y: 0,
              duration: 0.09,
              ease: "power2.out",
            },
            startT + flightDuration
          );
        }
      });

      // Phone gently reduces scale to give visual focus to the left column
      tl.to(
        phoneWrap,
        {
          scale: 0.94,
          opacity: 0.94,
          duration: 0.35,
          ease: "power2.out",
        },
        0.38
      );

      // Phase 2: Relationship-Network Reveal
      const netStart = 0.65;

      if (networkCard) {
        tl.to(
          networkCard,
          {
            opacity: 1,
            y: 0,
            duration: 0.16,
            ease: "power2.out",
          },
          netStart
        );
      }

      // Draw connection lines from 6 icons into central node
      svgLinesRef.current.forEach((line, idx) => {
        if (!line) return;
        tl.to(
          line,
          {
            strokeDashoffset: 0,
            duration: 0.20,
            ease: "power1.inOut",
          },
          netStart + 0.05 + idx * 0.02
        );
      });

      // Central node illumination
      if (centralNodeRef.current) {
        tl.to(
          centralNodeRef.current,
          {
            scale: 1,
            opacity: 1,
            duration: 0.16,
            ease: "back.out(1.4)",
          },
          netStart + 0.14
        );
      }

      // Radiating branches
      if (branchPathRef.current) {
        tl.to(
          branchPathRef.current,
          {
            strokeDashoffset: 0,
            duration: 0.18,
            ease: "power2.out",
          },
          netStart + 0.20
        );
      }

      // Profile cards reveal
      profileCardsRef.current.forEach((card, idx) => {
        if (!card) return;
        tl.to(
          card,
          {
            opacity: 1,
            y: 0,
            duration: 0.14,
            ease: "power2.out",
          },
          netStart + 0.22 + idx * 0.05
        );
      });

      return () => {
        APPS.forEach((app) => {
          const flyingIcon = flyingIconRefs.current[app.id];
          const phoneLabel = phoneLabelRefs.current[app.id];
          const destLabel = destLabelRefs.current[app.id];

          if (flyingIcon) gsap.set(flyingIcon, { clearProps: "transform,opacity,boxShadow" });
          if (phoneLabel) gsap.set(phoneLabel, { clearProps: "opacity" });
          if (destLabel) gsap.set(destLabel, { clearProps: "opacity,transform" });
        });

        if (phoneWrap) gsap.set(phoneWrap, { clearProps: "transform,opacity" });
        if (networkCard) gsap.set(networkCard, { clearProps: "opacity,transform" });
        if (centralNodeRef.current) gsap.set(centralNodeRef.current, { clearProps: "all" });
        if (branchPathRef.current) gsap.set(branchPathRef.current, { clearProps: "strokeDashoffset" });
        svgLinesRef.current.forEach((line) => {
          if (line) gsap.set(line, { clearProps: "strokeDashoffset" });
        });
        profileCardsRef.current.forEach((card) => {
          if (card) gsap.set(card, { clearProps: "opacity,transform" });
        });
      };
    });

    // Mobile / reduced-motion fallback: clean static presentation
    mm.add("(max-width: 1023px), (prefers-reduced-motion: reduce)", () => {
      APPS.forEach((app) => {
        const flyingIcon = flyingIconRefs.current[app.id];
        const destLabel = destLabelRefs.current[app.id];
        const phoneLabel = phoneLabelRefs.current[app.id];

        if (flyingIcon) gsap.set(flyingIcon, { clearProps: "all", opacity: 1 });
        if (destLabel) gsap.set(destLabel, { opacity: 1, y: 0 });
        if (phoneLabel) gsap.set(phoneLabel, { opacity: 0 });
      });

      if (networkCardRef.current) gsap.set(networkCardRef.current, { opacity: 1, y: 0 });
      svgLinesRef.current.forEach((l) => {
        if (l) gsap.set(l, { strokeDashoffset: 0 });
      });
      if (branchPathRef.current) gsap.set(branchPathRef.current, { strokeDashoffset: 0 });
      if (centralNodeRef.current) gsap.set(centralNodeRef.current, { opacity: 1, scale: 1 });
    });
  }, []);

  useEffect(() => {
    buildAnimation();

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        buildAnimation();
      }, 150);
    };

    window.addEventListener("resize", onResize);

    document.fonts?.ready
      .then(() => {
        buildAnimation();
      })
      .catch(() => {});

    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      if (mmRef.current) {
        mmRef.current.revert();
        mmRef.current = null;
      }
    };
  }, [buildAnimation]);

  return (
    <section
      ref={sectionRef}
      id="network"
      aria-label="Connected sources and relationship network"
      className="relative bg-[var(--lp-paper)] text-[var(--lp-forest)] overflow-hidden"
    >
      {/* Inner Pin Wrapper: Pinned safely by ScrollTrigger without modifying React's outer section DOM */}
      <div
        ref={pinWrapRef}
        className="relative mx-auto flex min-h-[100svh] w-full max-w-[76rem] flex-col justify-center px-5 py-16 sm:px-8 lg:py-20"
      >
        <div className="grid items-center gap-10 lg:grid-cols-[1.14fr_0.86fr] lg:gap-12 xl:gap-16">
          
          {/* =========================================================
              LEFT COLUMN: Editorial Copy + Destination Row + Network
              ========================================================= */}
          <div ref={leftColRef} className="z-10 flex flex-col justify-center">
            {/* Eyebrow */}
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--lp-orange)]" />
              <span className="lp-eyebrow text-[rgba(23,32,25,0.65)] font-mono tracking-[0.14em]">
                SOURCES
              </span>
            </div>

            {/* Headline */}
            <h2 className="lp-h2 mt-3 text-[var(--lp-forest)] max-w-[14ch] tracking-tight">
              Your world, connected.
            </h2>

            {/* Editorial Description */}
            <p className="mt-4 max-w-[46ch] text-[15.5px] leading-[1.65] text-[rgba(23,32,25,0.72)]">
              Bring the people you already know into one private graph — from
              the inbox, the feed, and the calendar you use every day.
            </p>

            {/* Destination Integration Row: 6 items in horizontal alignment */}
            <div className="mt-7">
              <div
                ref={destRowRef}
                className="grid grid-cols-6 gap-2 sm:gap-3.5 max-w-[500px]"
              >
                {APPS.map((app) => (
                  <Link
                    key={app.id}
                    href="/onboarding"
                    aria-label={`Connect ${app.name}`}
                    className="group relative flex flex-col items-center focus:outline-none"
                  >
                    {/* Destination Landing Slot */}
                    <div
                      ref={(el) => {
                        destSlotRefs.current[app.id] = el;
                      }}
                      className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-[14px] sm:rounded-[16px] border border-[var(--lp-border)] bg-[var(--lp-white)] p-1.5 shadow-[0_4px_12px_rgba(23,32,25,0.04)] transition-all duration-200 group-hover:border-[var(--lp-orange)] group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_20px_rgba(255,77,45,0.14)]"
                    >
                      {/* Animated Extracted Icon Layer (Renders genuine brand artwork) */}
                      <div
                        ref={(el) => {
                          flyingIconRefs.current[app.id] = el;
                        }}
                        className="absolute inset-1.5 rounded-[10px] sm:rounded-[12px] overflow-hidden select-none pointer-events-none"
                        style={{ willChange: "transform, opacity, box-shadow" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={app.iconSrc}
                          alt={app.name}
                          className="h-full w-full object-cover rounded-[10px] sm:rounded-[12px]"
                          draggable={false}
                        />
                      </div>
                    </div>

                    {/* App Label beneath destination icon */}
                    <span
                      ref={(el) => {
                        destLabelRefs.current[app.id] = el;
                      }}
                      className="mt-2 text-center text-[11px] sm:text-[12px] font-semibold text-[rgba(23,32,25,0.85)] tracking-[-0.01em] transition-colors duration-150 group-hover:text-[var(--lp-orange)]"
                    >
                      {app.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* =========================================================
                RELATIONSHIP NETWORK REVEAL:
                Draws connections from the 6 icons into Happensten,
                revealing mutual profile nodes & connection pathways.
                ========================================================= */}
            <div
              ref={networkCardRef}
              className="mt-7 max-w-[530px] rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-white)] p-4 sm:p-5 shadow-[0_10px_35px_rgba(23,32,25,0.06)]"
              style={{ willChange: "opacity, transform" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--lp-border)] pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[rgba(255,77,45,0.12)] text-[var(--lp-orange)]">
                    <Network className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[12.5px] font-semibold text-[var(--lp-forest)]">
                    Unified Relationship Graph
                  </span>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-[var(--lp-sage)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--lp-forest-deep)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-terracotta)] animate-pulse" />
                  6 sources synced
                </div>
              </div>

              {/* Graphic Canvas: SVG connections stream from top into central node */}
              <div className="relative mt-3.5 h-[135px] w-full overflow-hidden rounded-xl bg-[#FAF8F2] p-2">
                <svg
                  viewBox="0 0 500 130"
                  fill="none"
                  className="absolute inset-0 h-full w-full pointer-events-none"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <linearGradient id={`${maskId}-stream`} x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#CE4631" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#FF4D2D" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id={`${maskId}-secondary`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#B9CDB4" />
                      <stop offset="100%" stopColor="#172019" stopOpacity="0.4" />
                    </linearGradient>
                  </defs>

                  {/* 6 Streams converging from top icon slots into center (x: 250, y: 44) */}
                  {[42, 125, 208, 292, 375, 458].map((xPos, idx) => (
                    <path
                      key={idx}
                      ref={(el) => {
                        svgLinesRef.current[idx] = el;
                      }}
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1}
                      d={`M ${xPos} 0 C ${xPos} 26, 250 18, 250 44`}
                      stroke={`url(#${maskId}-stream)`}
                      strokeWidth={idx === 1 || idx === 2 ? "2" : "1.4"}
                      strokeLinecap="round"
                    />
                  ))}

                  {/* Radiating branches from Happensten node to profile cards */}
                  <path
                    ref={branchPathRef}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1}
                    d="M 250 44 C 180 44, 130 78, 90 94 M 250 44 C 320 44, 370 78, 410 94"
                    stroke={`url(#${maskId}-secondary)`}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>

                {/* Central Happensten Node */}
                <div
                  ref={centralNodeRef}
                  className="absolute left-1/2 top-[32px] -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-[var(--lp-orange)] bg-[var(--lp-white)] px-3 py-1 shadow-[0_4px_14px_rgba(255,77,45,0.22)]"
                >
                  <span className="h-2 w-2 rounded-full bg-[var(--lp-orange)] shadow-[0_0_8px_#FF4D2D]" />
                  <span className="text-[11.5px] font-bold tracking-tight text-[var(--lp-navy)]">
                    Happensten
                  </span>
                </div>

                {/* Profile node 1: Left */}
                <div
                  ref={(el) => {
                    profileCardsRef.current[0] = el;
                  }}
                  className="absolute bottom-2 left-2 flex items-center gap-2 rounded-xl border border-[var(--lp-border)] bg-[var(--lp-white)] px-2.5 py-1.5 shadow-[0_2px_8px_rgba(23,32,25,0.05)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&auto=format&fit=crop&q=80"
                    alt=""
                    className="h-6 w-6 rounded-full object-cover ring-1 ring-[var(--lp-terracotta)]"
                  />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold text-[var(--lp-forest)]">
                      Priya Shah
                    </span>
                    <span className="text-[9px] text-[rgba(23,32,25,0.6)]">
                      12 shared · Gmail & LinkedIn
                    </span>
                  </div>
                  <span className="ml-1 rounded-full bg-[rgba(206,70,49,0.12)] px-1.5 py-0.5 text-[8.5px] font-semibold text-[var(--lp-terracotta)]">
                    1st
                  </span>
                </div>

                {/* Profile node 2: Right */}
                <div
                  ref={(el) => {
                    profileCardsRef.current[1] = el;
                  }}
                  className="absolute bottom-2 right-2 flex items-center gap-2 rounded-xl border border-[var(--lp-border)] bg-[var(--lp-white)] px-2.5 py-1.5 shadow-[0_2px_8px_rgba(23,32,25,0.05)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=64&auto=format&fit=crop&q=80"
                    alt=""
                    className="h-6 w-6 rounded-full object-cover ring-1 ring-[var(--lp-border)]"
                  />
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11px] font-semibold text-[var(--lp-forest)]">
                      Marcus Tran
                    </span>
                    <span className="text-[9px] text-[rgba(23,32,25,0.6)]">
                      Founder, Vellum · via Priya
                    </span>
                  </div>
                  <span className="ml-1 rounded-full bg-[var(--lp-orange)] px-1.5 py-0.5 text-[8.5px] font-bold text-white shadow-sm">
                    94
                  </span>
                </div>
              </div>

              {/* Bottom Metadata & Privacy Guarantee */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-[rgba(23,32,25,0.58)]">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#34A853]" />
                  <span>Metadata only — message content is never stored.</span>
                </span>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-1 font-semibold text-[var(--lp-orange)] hover:underline"
                >
                  <span>Connect</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>

          {/* =========================================================
              RIGHT COLUMN: Pristine Smartphone Mockup
              Displays the authentic iOS home screen.
              Each source icon has a precisely sized squircle mask and label pill
              that progressively fades in ONLY as that specific icon departs.
              ========================================================= */}
          <div className="flex justify-center lg:justify-end">
            <div
              ref={phoneWrapRef}
              className="relative w-[300px] sm:w-[330px] lg:w-[360px] max-w-[85vw]"
              style={{ willChange: "transform, opacity" }}
            >
              {/* Phone Frame wrapper with natural shadow */}
              <div className="relative overflow-visible filter drop-shadow-[0_35px_60px_rgba(23,32,25,0.22)]">
                {/* Authentic transparent phone frame mockup */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={phoneImgRef}
                  src="/phone-mockup.png"
                  alt="iPhone Home Screen"
                  className="w-full h-auto block select-none pointer-events-none"
                  draggable={false}
                  onLoad={buildAnimation}
                />

                {/* Source App Labels on the phone screen:
                    Visible when icons are docked on the phone;
                    Fades out smoothly only when that specific icon lifts and departs,
                    restoring seamlessly when reversed. */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  aria-hidden="true"
                >
                  {APPS.map((app) => (
                    <div
                      key={`phone-label-${app.id}`}
                      ref={(el) => {
                        phoneLabelRefs.current[app.id] = el;
                      }}
                      className="absolute pointer-events-none text-center select-none"
                      style={{
                        left: `${((app.x + app.w / 2 - 38) / 495) * 100}%`,
                        top: `${((app.row === 1 ? 395 : 491) / 1024) * 100}%`,
                        width: `${(76 / 495) * 100}%`,
                        height: `${(15 / 1024) * 100}%`,
                        fontSize: "clamp(9px, 2.2vw, 11px)",
                        lineHeight: 1.2,
                        color: "#FFFFFF",
                        textShadow: "0 1px 2px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.6)",
                        fontWeight: 500,
                        letterSpacing: "-0.01em",
                        opacity: 1,
                        willChange: "opacity",
                      }}
                    >
                      {app.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
