"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Search,
  ArrowRight,
  MapPin,
  ShieldCheck,
  Waypoints,
  Star,
  ArrowUpRight,
} from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import NetworkGraph from "./network-graph";
import Reveal from "./reveal";
import TextWipe from "./text-wipe";
import SiteNav from "@/components/navigation/site-nav";
import { WalkingFigure, ReachingFigure, Ladder, ClimbingFigure } from "./figures";
import { SOURCE_LOGOS } from "./brand-marks";
import IntegrationScrollScene from "./integration-scroll-scene";
import CapabilitiesScrollScene from "./capabilities-scroll-scene";

gsap.registerPlugin(ScrollTrigger);

interface LandingUser {
  name: string;
  avatarUrl?: string | null;
}

/* ————— wordmark: three nodes, one lit ————— */
function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6.2 16.6 L12 6.8 L17.8 16.6"
        fill="none"
        stroke="var(--lp-navy)"
        strokeWidth="1.6"
      />
      <circle cx="6.2" cy="17.4" r="2.9" fill="var(--lp-navy)" />
      <circle cx="17.8" cy="17.4" r="2.9" fill="var(--lp-sage-deep)" stroke="var(--lp-navy)" strokeWidth="1.4" />
      <circle cx="12" cy="5.9" r="3.4" fill="var(--lp-orange)" />
    </svg>
  );
}



/* ————— hero search — connects to the real /search flow ————— */
function HeroSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1536px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (q: string) => {
    const text = q.trim();
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    router.push(`/search?q=${encodeURIComponent(text)}`);
  };

  const chips = [
    "AI founders in my network",
    "A great cafe nearby",
    "People who know climate tech",
  ];

  return (
    <div className="mt-9">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(query);
        }}
        className="flex items-center gap-2 rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-white)] p-2 pl-4 shadow-[0_2px_12px_rgba(23,32,25,0.05),0_16px_40px_rgba(23,32,25,0.06)] transition-shadow duration-200"
        style={
          focused
            ? { boxShadow: "0 0 0 3px rgba(206,70,49,0.14), 0 16px 40px rgba(23,32,25,0.06)" }
            : undefined
        }
      >
        <Search className="h-5 w-5 shrink-0 text-[var(--lp-muted)]" strokeWidth={2.2} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === "Enter" && go(query)}
          placeholder={wide ? "Who in my network knows AI founders?" : "Who knows AI founders?"}
          aria-label="Search your network"
          className="min-h-11 w-full min-w-0 bg-transparent text-[16px] text-[var(--lp-forest)] placeholder:text-[rgba(107,107,112,0.8)] focus:outline-none lg:text-[15.5px]"
        />
        <kbd className="lp-meta mr-1 hidden shrink-0 rounded-md border border-[var(--lp-border)] px-1.5 py-1 text-[10px] text-[var(--lp-muted)] min-[1150px]:block">
          ⌘K
        </kbd>
        <button
          type="submit"
          className="lp-btn min-h-11 shrink-0 bg-[var(--lp-navy)] px-3.5 text-[14px] text-[var(--lp-paper)] hover:bg-[var(--lp-navy-soft)] sm:px-4"
        >
          <span className="hidden sm:inline">Explore my network</span>
          <span className="sm:hidden">Search</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="lp-meta mr-1 hidden text-[rgba(23,32,25,0.45)] sm:inline">
          Try
        </span>
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => go(c)}
            className="min-h-9 rounded-full border border-[var(--lp-border)] bg-[rgba(255,255,255,0.55)] px-3.5 text-[13px] font-medium text-[rgba(23,32,25,0.75)] transition-all duration-150 hover:border-[rgba(11,31,58,0.3)] hover:bg-[var(--lp-white)] hover:text-[var(--lp-forest)] active:scale-[0.98]"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ————— Section A: hero ————— */
function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-32 sm:pt-40">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
        style={{
          background:
            "radial-gradient(700px 340px at 72% 8%, rgba(220,232,217,0.5), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-[72rem] px-5 sm:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-[1.04fr_0.96fr] lg:gap-10 xl:gap-16">
          <div>
            <p className="lp-rise lp-eyebrow flex items-center gap-2 text-[var(--lp-forest)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-terracotta)]" />
              Your world, connected
            </p>

            <h1 className="lp-h1 mt-5 text-[var(--lp-forest)]">
              <span className="wipe-line-mask" style={{ paddingBottom: "0.14em", marginBottom: "-0.14em" }}>
                <span className="wipe-line lp-line-in" style={{ animationDelay: "60ms" }}>
                  The right people
                </span>
              </span>
              <span className="wipe-line-mask" style={{ paddingBottom: "0.24em", marginBottom: "-0.1em" }}>
                <span className="wipe-line lp-line-in" style={{ animationDelay: "150ms" }}>
                  are{" "}
                  <span className="lp-underline text-[var(--lp-terracotta)]">
                    closer than
                    <svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden>
                      <path
                        d="M3 9 Q 50 3 98 8 T 197 5"
                        fill="none"
                        stroke="var(--lp-orange)"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </span>
              </span>
              <span className="wipe-line-mask" style={{ paddingBottom: "0.14em", marginBottom: "-0.14em" }}>
                <span className="wipe-line lp-line-in" style={{ animationDelay: "240ms" }}>
                  you think.
                </span>
              </span>
            </h1>

            <p
              className="lp-rise mt-6 max-w-[46ch] text-[16.5px] leading-[1.65] text-[rgba(23,32,25,0.72)] sm:text-[17.5px]"
              style={{ animationDelay: "420ms" }}
            >
              Search your real network in plain English. Find trusted people,
              useful places, and the warm path between you.
            </p>

            <div className="lp-rise" style={{ animationDelay: "500ms" }}>
              <HeroSearch />
            </div>
          </div>

          <div
            className="lp-rise lg:max-lg:mx-auto lg:max-lg:max-w-[440px]"
            style={{ animationDelay: "560ms" }}
          >
            <NetworkGraph />
          </div>
        </div>

        {/* metrics strip — product properties, not invented counts */}
        <div
          className="lp-rise mt-16 grid gap-x-8 gap-y-5 border-t border-[var(--lp-border)] pt-6 sm:grid-cols-3 sm:mt-20"
          style={{ animationDelay: "640ms" }}
        >
          {[
            ["Six sources, one network", "Gmail, LinkedIn, X, Instagram, Facebook, files"],
            ["Metadata only", "Message content is never stored"],
            ["Runs on your device", "Embeddings and search stay local"],
          ].map(([value, label]) => (
            <div key={value} className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--lp-forest)]">
                {value}
              </span>
              <span className="lp-meta text-[var(--lp-muted)]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ————— Section B: manifesto (forest-charcoal, covers the hero) ————— */
function Manifesto() {
  const principles = [
    {
      icon: <Search className="h-[18px] w-[18px]" />,
      title: "Search naturally",
      body: "Find people, places, and opportunities using everyday language.",
    },
    {
      icon: <Waypoints className="h-[18px] w-[18px]" />,
      title: "See the connection",
      body: "Understand why someone matches, how you're connected, and possible introduction paths.",
    },
    {
      icon: <ShieldCheck className="h-[18px] w-[18px]" />,
      title: "Act with confidence",
      body: "Understand how your information is handled and retain control over your connected data.",
    },
  ];

  return (
    <section id="how" className="flex min-h-screen items-center bg-[var(--lp-forest-deep)]">
      <div className="mx-auto w-full max-w-[72rem] px-5 py-24 sm:px-8 sm:py-28">
        <Reveal>
          <p className="lp-eyebrow text-[var(--lp-sage-muted)]">
            What makes Happensten different
          </p>
        </Reveal>

        <div className="mt-6 grid items-end gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <TextWipe
            as="h2"
            className="lp-h2 max-w-[20ch] text-[var(--lp-paper)]"
            lines={[
              <>Not another directory.</>,
              <>A better way to find</>,
              <>your people.</>,
            ]}
          />
          <Reveal delay={140}>
            <p className="max-w-[38ch] text-[16px] leading-[1.7] text-[var(--lp-sage-muted)] lg:pb-2">
              Your contacts already hold what you&apos;re looking for — an
              introduction, a recommendation, a door. Happensten reads the
              shape of your relationships so a plain sentence is all it takes.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-10 sm:mt-20 sm:grid-cols-3 sm:gap-0">
          {principles.map((p, i) => (
            <Reveal key={p.title} delay={i * 90}>
              <div
                className="flex flex-col gap-3 sm:pl-8"
                style={
                  i > 0
                    ? { borderLeft: "1px solid var(--lp-hairline-ivory)" }
                    : undefined
                }
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(255,77,45,0.16)] text-[var(--lp-orange)]">
                  {p.icon}
                </span>
                <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--lp-paper)]">
                  {p.title}
                </h3>
                <p className="max-w-[34ch] text-[14.5px] leading-[1.65] text-[var(--lp-sage-muted)]">
                  {p.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ————— Section C: relationship intelligence (sage) ————— */
function Intelligence() {
  return (
    <section id="context" className="flex min-h-screen items-center bg-[var(--lp-sage)]">
      <div className="mx-auto grid w-full max-w-[72rem] items-center gap-14 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-[0.92fr_1.08fr] lg:gap-20">
        <Reveal>
          <div>
            <p className="lp-eyebrow text-[rgba(23,32,25,0.5)]">
              Relationship intelligence
            </p>
            <h2 className="lp-h2 mt-5 max-w-[16ch] text-[var(--lp-forest)]">
              More than a name. Get the full context.
            </h2>
            <p className="mt-6 max-w-[44ch] text-[16.5px] leading-[1.7] text-[rgba(23,32,25,0.72)]">
              Every match explains itself — why they fit, how you&apos;re
              connected, and what you have in common. No black-box scores, no
              cold outreach: just the shortest honest path to a hello.
            </p>
            <Link
              href="/search"
              className="lp-link mt-8 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-[var(--lp-navy)]"
            >
              Try a search
              <ArrowRight className="h-4 w-4 transition-transform duration-200" />
            </Link>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <ProfileCard />
        </Reveal>
      </div>
    </section>
  );
}

/* the product-preview card — refined application surface, marked as illustrative */
function ProfileCard() {
  return (
    <div className="rounded-2xl border border-[rgba(23,32,25,0.1)] bg-[var(--lp-white)] p-6 shadow-[0_2px_10px_rgba(23,32,25,0.04),0_24px_60px_rgba(23,32,25,0.09)] transition-transform duration-200 ease-out hover:-translate-y-1 sm:p-7">
      <div className="flex items-center justify-between">
        <span className="lp-meta text-[rgba(23,32,25,0.45)]">Match preview</span>
        <span className="lp-meta rounded-full bg-[var(--lp-paper)] px-2.5 py-1 text-[10px] text-[var(--lp-muted)]">
          Illustrative
        </span>
      </div>

      <div className="mt-5 flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=160&auto=format&fit=crop&q=80"
          alt=""
          className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-[var(--lp-border)]"
        />
        <div className="min-w-0">
          <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-[var(--lp-forest)]">
            Maya Chen
          </h3>
          <p className="mt-0.5 text-[14px] text-[rgba(23,32,25,0.65)]">
            Founder, Vellum · San Francisco
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["AI infrastructure", "Design systems", "Fundraising"].map((s) => (
              <span
                key={s}
                className="rounded-full border border-[var(--lp-border)] bg-[var(--lp-paper)] px-2.5 py-1 text-[12px] font-medium text-[rgba(23,32,25,0.72)]"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* strength meter */}
      <div className="mt-6 flex items-center justify-between gap-4">
        <span className="lp-meta text-[rgba(23,32,25,0.5)]">
          Relationship strength
        </span>
        <div className="flex items-center gap-2.5">
          <div className="flex gap-[3px]">
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                className="h-2.5 w-1.5 rounded-[2px]"
                style={{
                  background:
                    i < 8 ? "var(--lp-terracotta)" : "rgba(23,32,25,0.12)",
                }}
              />
            ))}
          </div>
          <span className="lp-meta font-semibold text-[var(--lp-forest)]">
            Strong tie
          </span>
        </div>
      </div>

      {/* mutuals */}
      <div className="mt-5 flex items-center gap-3 border-t border-[var(--lp-border)] pt-5">
        <div className="flex -space-x-2.5">
          {[
            "photo-1494790108377-be9c29b29330",
            "photo-1507003211169-0a1dd7228f2d",
            "photo-1438761681033-6461ffad8d80",
          ].map((id) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={id}
              src={`https://images.unsplash.com/${id}?w=80&auto=format&fit=crop&q=80`}
              alt=""
              className="h-8 w-8 rounded-full object-cover ring-2 ring-[var(--lp-white)]"
            />
          ))}
        </div>
        <span className="text-[13.5px] font-medium text-[rgba(23,32,25,0.7)]">
          3 shared connections
        </span>
      </div>

      {/* warm path — draws across when the card is revealed */}
      <div className="mt-5 rounded-xl bg-[var(--lp-paper)] p-4">
        <span className="lp-meta text-[rgba(23,32,25,0.5)]">Warm path</span>
        <div className="mt-2.5 flex items-center gap-2 text-[13px] font-medium text-[var(--lp-forest)]">
          <span>You</span>
          <PathDash />
          <span className="rounded-full bg-[var(--lp-white)] px-2.5 py-1 ring-1 ring-[var(--lp-border)]">
            Sarah Okafor
          </span>
          <PathDash />
          <span className="rounded-full bg-[var(--lp-terracotta)] px-2.5 py-1 font-semibold text-[var(--lp-white)]">
            Maya
          </span>
        </div>
      </div>

      <Link
        href="/search"
        className="lp-btn mt-6 min-h-11 w-full bg-[var(--lp-navy)] text-[14px] text-[var(--lp-paper)] hover:bg-[var(--lp-navy-soft)]"
      >
        View relationship path
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function PathDash({ className }: { className?: string }) {
  return (
    <svg
      width="26"
      height="8"
      viewBox="0 0 26 8"
      aria-hidden
      className={`shrink-0 ${className ?? ""}`}
    >
      <path
        className="path-draw-line"
        pathLength={100}
        d="M1 4 H 25"
        stroke="var(--lp-terracotta)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="100"
        fill="none"
      />
    </svg>
  );
}

/* ————— Section D: how it works — sticky cards + scroll-synced climber ————— */
const CLIMB_TRAVEL = 452;

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;

    const ctx = gsap.context(() => {
      const climber = el.querySelector("[data-climber]");
      if (climber) {
        gsap.fromTo(
          climber,
          { y: 0 },
          {
            y: -CLIMB_TRAVEL,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: "top 70%",
              end: "bottom 80%",
              scrub: 0.6,
            },
          },
        );
      }
    }, el);
    return () => ctx.revert();
  }, []);

  const cards = [
    {
      step: "Step 01",
      title: "Bring your sources together",
      body: "Gmail, LinkedIn, X, Instagram, Facebook, and your own files — indexed privately, metadata only.",
      surface: "var(--lp-surface)",
      walker: true,
      chips: ["Gmail", "LinkedIn", "X", "Instagram", "Facebook", "Files"],
    },
    {
      step: "Step 02",
      title: "Ask in plain English",
      body: "One sentence is enough. Happensten plans the searches, reads the signals, and ranks what matters.",
      surface: "var(--lp-white)",
      mock: "Who in my network knows AI founders?",
    },
    {
      step: "Step 03",
      title: "Reach the right person",
      body: "Every match shows the why, the who, and the warm path — so outreach starts with context, not a cold message.",
      surface: "var(--lp-sage)",
      reach: true,
    },
  ];

  return (
    <div ref={ref} className="mx-auto w-full max-w-[72rem] px-5 py-24 sm:px-8 sm:py-32">
      <Reveal>
        <p className="lp-eyebrow text-[rgba(23,32,25,0.5)]">How it works</p>
      </Reveal>

      <div className="mt-10 grid gap-10 sm:mt-14 lg:grid-cols-[1fr_64px] lg:gap-8">
        {/* the sticky deck */}
        <div>
          {cards.map((c, i) => (
            <div
              key={c.step}
              className="lp-stack-card relative mb-8 overflow-hidden rounded-3xl border border-[var(--lp-border)] last:mb-0"
              style={{
                top: `calc(6rem + ${i * 2}rem)`,
                background: c.surface,
                minHeight: "400px",
              }}
            >
              {c.walker && (
                <div aria-hidden className="pointer-events-none absolute inset-x-6 top-[3px] hidden sm:block">
                  <WalkingFigure
                    color="var(--lp-navy)"
                    distance={200}
                    duration="22s"
                    className="max-w-full"
                  />
                </div>
              )}

              <div className={`flex h-full flex-col p-7 sm:p-10 ${c.walker ? "pt-14 sm:pt-16" : ""}`}>
                <span className="lp-meta text-[var(--lp-muted)]">{c.step}</span>
                <h3 className="lp-h3 mt-4 text-[var(--lp-forest)]">
                  {c.title}
                </h3>
                <p className="mt-4 max-w-[46ch] text-[16px] leading-[1.7] text-[rgba(23,32,25,0.7)]">
                  {c.body}
                </p>

                {c.chips && (
                  <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-8">
                    {SOURCE_LOGOS.map(({ name, mark: Mark }) => (
                      <span
                        key={name}
                        className="flex items-center gap-2 rounded-full border border-[var(--lp-border)] bg-[var(--lp-paper)] py-1.5 pl-2.5 pr-3.5"
                      >
                        <Mark className="h-4 w-4" />
                        <span className="text-[12.5px] font-semibold text-[rgba(23,32,25,0.72)]">
                          {name}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                {c.mock && (
                  <div
                    aria-hidden
                    className="mt-auto flex items-center gap-2.5 self-stretch rounded-xl border border-[var(--lp-border)] bg-[var(--lp-paper)] px-4 py-3.5 shadow-[0_2px_8px_rgba(23,32,25,0.05)]"
                  >
                    <Search className="h-4.5 w-4.5 shrink-0 text-[var(--lp-muted)]" />
                    <span className="truncate text-[15px] text-[rgba(23,32,25,0.8)]">
                      {c.mock}
                    </span>
                    <span className="lp-meta ml-auto hidden shrink-0 rounded-md border border-[var(--lp-border)] px-1.5 py-0.5 text-[10px] text-[var(--lp-muted)] sm:block">
                      ⌘K
                    </span>
                  </div>
                )}

                {c.reach && (
                  <div className="mt-auto flex items-end gap-4 pt-8" aria-hidden>
                    <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--lp-forest)]">
                      <span>You</span>
                      <PathDash />
                      <span className="rounded-full bg-[var(--lp-white)] px-2.5 py-1 ring-1 ring-[var(--lp-border)]">
                        Priya
                      </span>
                      <PathDash />
                      <span className="rounded-full bg-[var(--lp-terracotta)] px-2.5 py-1 font-semibold text-[var(--lp-white)]">
                        Marcus
                      </span>
                    </div>
                    <div className="relative ml-auto flex items-end">
                      <span className="mb-6 h-4 w-4 rounded-full bg-[var(--lp-terracotta)] ring-4 ring-[rgba(206,70,49,0.18)]" />
                      <ReachingFigure
                        color="var(--lp-navy)"
                        size={26}
                        className="absolute bottom-5 right-3"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* the ladder rail — the climber rises with scroll progress */}
        <div aria-hidden className="relative hidden self-start lg:sticky lg:top-28 lg:block">
          <div className="relative" style={{ height: 560 }}>
            <Ladder height={560} className="absolute inset-x-0 top-0" />
            <div
              data-climber
              className="absolute left-[2px]"
              style={{ top: 560 - 46 }}
            >
              <ClimbingFigure color="var(--lp-terracotta)" size={22} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ————— Section E: capability showcases ————— */

/* small interactive search chip — wired to the real /search flow */
function ExampleChip({ text, dark }: { text: string; dark?: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/search?q=${encodeURIComponent(text)}`)}
      className={`group inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-all duration-150 active:scale-[0.98] ${
        dark
          ? "border-[rgba(250,248,242,0.25)] text-[var(--lp-paper)] hover:border-[rgba(250,248,242,0.5)] hover:bg-[rgba(250,248,242,0.08)]"
          : "border-[var(--lp-border)] bg-[rgba(255,255,255,0.6)] text-[rgba(23,32,25,0.78)] hover:border-[rgba(11,31,58,0.3)] hover:bg-[var(--lp-white)] hover:text-[var(--lp-forest)]"
      }`}
    >
      <Search className="h-3.5 w-3.5 opacity-60" />
      {text}
      <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
    </button>
  );
}

function ShowcaseLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="lp-eyebrow flex items-center gap-2 text-[rgba(23,32,25,0.5)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-terracotta)]" />
      {children}
    </p>
  );
}

/* What you can do showcases are handled with full scroll effects by CapabilitiesScrollScene */

/* ————— Final cover: closing CTA + footer on ONE orange board —————
   The last panel of the deck. Sticky within main, so it rises over the
   paper story; by the time the page ends it fills the whole viewport. */
function FinalCover({ user }: { user: LandingUser | null }) {
  return (
    <div className="lp-panel lp-sheet z-50 bg-[var(--lp-orange)]">
      <div className="flex min-h-[100svh] flex-col">
        <section className="mx-auto grid w-full max-w-[72rem] flex-1 content-end gap-12 px-5 pb-16 pt-32 sm:px-8 sm:pt-40 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <TextWipe
            as="h2"
            direction="sides"
            className="lp-serif text-[clamp(2.75rem,6vw,5.25rem)] leading-[0.98] text-[var(--lp-navy)]"
            lines={[<>Good connections</>, <>change everything.</>]}
          />

          <Reveal delay={120}>
            <div className="lg:pb-3">
              <p className="max-w-[38ch] text-[16.5px] leading-[1.7] text-[var(--lp-navy)]">
                Bring your data together, and let Happensten help you find the
                people, places, and opportunities already around you.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/search"
                  className="lp-btn min-h-12 bg-[var(--lp-navy)] px-6 text-[15px] text-[var(--lp-paper)] hover:bg-[#081a30]"
                >
                  Find your people
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/#how"
                  className="lp-link inline-flex min-h-12 items-center text-[15px] font-semibold text-[var(--lp-navy)]"
                >
                  See how it works
                </Link>
              </div>
            </div>
          </Reveal>
        </section>

        <footer className="mt-16">
          <div className="mx-auto w-full max-w-[72rem] border-t border-[rgba(11,31,58,0.25)] px-5 py-10 sm:px-8">
            <div className="flex flex-col justify-between gap-10 sm:flex-row">
              <div>
                <div className="flex items-center gap-2">
                  <Wordmark size={20} />
                  <span className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--lp-navy)]">
                    Happensten
                  </span>
                </div>
                <p className="mt-3 max-w-[24ch] text-[14px] leading-[1.5] text-[rgba(11,31,58,0.75)]">
                  A more human internet.
                </p>
              </div>

              <nav aria-label="Footer" className="flex flex-col gap-2.5">
                <span className="lp-eyebrow text-[rgba(11,31,58,0.55)]">Product</span>
                {[
                  ["Search", "/search"],
                  ["Sources", "/onboarding"],
                  user ? [user.name.split(" ")[0], "/search"] : ["Sign in", "/api/auth/google"],
                ].map(([label, href]) => (
                  <Link
                    key={label as string}
                    href={href as string}
                    className="lp-link inline w-fit text-[14px] font-medium text-[rgba(11,31,58,0.85)] transition-colors duration-150 hover:text-[var(--lp-navy)]"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="mt-10 flex flex-col justify-between gap-3 border-t border-[rgba(11,31,58,0.18)] pt-5 sm:flex-row sm:items-center">
              <span className="lp-meta text-[rgba(11,31,58,0.65)]">
                © 2026 Happensten
              </span>
              <span className="lp-meta text-[rgba(11,31,58,0.65)]">
                Metadata-only ingestion. Local embeddings.
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function Landing({ user }: { user: LandingUser | null }) {
  return (
    <div className="lp-root lp-grain min-h-screen overflow-x-clip">
      <SiteNav user={user} />
      <main>
        <Hero />

        {/* scroll deck — forest & sage pin; the paper story (how-it-works +
            capabilities) scrolls normally so no content is ever clipped, and
            the terracotta finale covers everything at the end. */}
        <div className="relative">
          <div className="lp-panel lp-sheet z-10 bg-[var(--lp-forest-deep)]">
            <Manifesto />
          </div>
          <div className="lp-panel lp-sheet z-20 bg-[var(--lp-sage)]">
            <Intelligence />
          </div>
        </div>

        <div className="relative z-30 bg-[var(--lp-paper)]">
          <HowItWorks />
          <IntegrationScrollScene />
        </div>

        {/* capabilities scrolls fully into view (tall panel — never pinned);
            the orange finale, sticky at z-50, rises over it at the end */}
        <div className="relative z-40 bg-[var(--lp-paper)]">
          <CapabilitiesScrollScene />
        </div>

        <FinalCover user={user} />
      </main>
    </div>
  );
}
