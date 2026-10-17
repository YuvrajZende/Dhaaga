"use client";

/* ==========================================================================
   Happensten — Capabilities Scroll Scene ("What you can do")
   
   Scroll-driven interactive showcases for:
   1. People — Source ledger fans out from behind the result card on scroll
   2. Places — Floating search pill swoops down and docks onto place card
   3. Warm Introductions — SVG path visibly draws across You -> Priya -> Marcus
      linked directly to scroll progress
   ========================================================================== */

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { Search, MapPin, Star, ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

function ShowcaseLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-[var(--lp-terracotta)]" />
      <span className="lp-eyebrow text-[rgba(23,32,25,0.6)] font-mono tracking-[0.14em]">
        {children}
      </span>
    </div>
  );
}

function ExampleChip({ text }: { text: string }) {
  return (
    <Link
      href={`/search?q=${encodeURIComponent(text)}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--lp-border)] bg-[var(--lp-white)] px-3 py-1.5 text-[12.5px] font-medium text-[rgba(23,32,25,0.75)] shadow-[0_1px_3px_rgba(23,32,25,0.04)] transition-all duration-150 hover:border-[var(--lp-orange)] hover:text-[var(--lp-orange)] hover:-translate-y-0.5 hover:shadow-[0_4px_10px_rgba(255,77,45,0.1)]"
    >
      <Search className="h-3 w-3 opacity-50" />
      <span>{text}</span>
    </Link>
  );
}

export default function CapabilitiesScrollScene() {
  const sectionRef = useRef<HTMLElement>(null);

  // 1. People showcase refs
  const peopleContainerRef = useRef<HTMLDivElement>(null);
  const peopleTextRef = useRef<HTMLDivElement>(null);
  const peopleBackCardRef = useRef<HTMLDivElement>(null);
  const peopleFrontCardRef = useRef<HTMLDivElement>(null);
  const peopleAvatarsRef = useRef<HTMLDivElement>(null);
  const peopleSignalRef = useRef<HTMLSpanElement>(null);

  // 2. Places showcase refs
  const placesContainerRef = useRef<HTMLDivElement>(null);
  const placesTextRef = useRef<HTMLDivElement>(null);
  const placesCardRef = useRef<HTMLDivElement>(null);
  const placesPillRef = useRef<HTMLDivElement>(null);
  const placesEndorsementRef = useRef<HTMLSpanElement>(null);

  // 3. Warm Intros showcase refs
  const introsContainerRef = useRef<HTMLDivElement>(null);
  const introsTextRef = useRef<HTMLDivElement>(null);
  const introsListRef = useRef<HTMLUListElement>(null);
  const introsCardRef = useRef<HTMLDivElement>(null);
  const introPath1Ref = useRef<SVGPathElement>(null);
  const introPath2Ref = useRef<SVGPathElement>(null);
  const introNode1Ref = useRef<HTMLDivElement>(null);
  const introNode2Ref = useRef<HTMLDivElement>(null);
  const introNode3Ref = useRef<HTMLDivElement>(null);
  const introWhyRef = useRef<HTMLDivElement>(null);
  const introBadgesRef = useRef<HTMLDivElement>(null);

  // Divider lines
  const div1Ref = useRef<HTMLDivElement>(null);
  const div2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    // Respect reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (introPath1Ref.current) gsap.set(introPath1Ref.current, { strokeDashoffset: 0 });
      if (introPath2Ref.current) gsap.set(introPath2Ref.current, { strokeDashoffset: 0 });
      return;
    }

    const ctx = gsap.context(() => {
      // -----------------------------------------------------------------
      // SHOWCASE 1: PEOPLE
      // -----------------------------------------------------------------
      if (peopleContainerRef.current) {
        // Text column subtle reveal
        if (peopleTextRef.current) {
          gsap.from(peopleTextRef.current.children, {
            y: 30,
            opacity: 0,
            duration: 0.8,
            stagger: 0.1,
            ease: "power2.out",
            scrollTrigger: {
              trigger: peopleContainerRef.current,
              start: "top 80%",
            },
          });
        }

        // Layered Card Parallax: back card slides and rotates out as user scrolls
        if (peopleBackCardRef.current && peopleFrontCardRef.current) {
          gsap.fromTo(
            peopleBackCardRef.current,
            { x: 0, y: 15, rotation: 0 },
            {
              x: -36,
              y: -14,
              rotation: -4.5,
              ease: "power1.out",
              scrollTrigger: {
                trigger: peopleContainerRef.current,
                start: "top 80%",
                end: "bottom 30%",
                scrub: 1,
              },
            }
          );

          gsap.fromTo(
            peopleFrontCardRef.current,
            { y: 35 },
            {
              y: -18,
              ease: "power1.out",
              scrollTrigger: {
                trigger: peopleContainerRef.current,
                start: "top 80%",
                end: "bottom 30%",
                scrub: 1,
              },
            }
          );
        }

        // Mutual connection avatars slide in
        if (peopleAvatarsRef.current) {
          gsap.from(peopleAvatarsRef.current.children, {
            x: -12,
            opacity: 0,
            duration: 0.5,
            stagger: 0.1,
            ease: "back.out(1.7)",
            scrollTrigger: {
              trigger: peopleFrontCardRef.current,
              start: "top 75%",
            },
          });
        }

        // Strong signal star badge pop
        if (peopleSignalRef.current) {
          gsap.from(peopleSignalRef.current, {
            scale: 0.6,
            opacity: 0,
            duration: 0.5,
            ease: "back.out(2)",
            scrollTrigger: {
              trigger: peopleFrontCardRef.current,
              start: "top 70%",
            },
          });
        }
      }

      // Divider 1 expand
      if (div1Ref.current) {
        gsap.fromTo(
          div1Ref.current,
          { scaleX: 0, opacity: 0.3 },
          {
            scaleX: 1,
            opacity: 1,
            duration: 0.8,
            ease: "power2.out",
            scrollTrigger: {
              trigger: div1Ref.current,
              start: "top 88%",
            },
          }
        );
      }

      // -----------------------------------------------------------------
      // SHOWCASE 2: PLACES
      // -----------------------------------------------------------------
      if (placesContainerRef.current) {
        if (placesTextRef.current) {
          gsap.from(placesTextRef.current.children, {
            y: 30,
            opacity: 0,
            duration: 0.8,
            stagger: 0.1,
            ease: "power2.out",
            scrollTrigger: {
              trigger: placesContainerRef.current,
              start: "top 80%",
            },
          });
        }

        // Floating search pill swoops down onto place card
        if (placesPillRef.current && placesCardRef.current) {
          gsap.fromTo(
            placesPillRef.current,
            { y: -55, rotation: -6, opacity: 0.4 },
            {
              y: 0,
              rotation: 2,
              opacity: 1,
              ease: "power1.out",
              scrollTrigger: {
                trigger: placesContainerRef.current,
                start: "top 80%",
                end: "bottom 35%",
                scrub: 1,
              },
            }
          );

          gsap.fromTo(
            placesCardRef.current,
            { y: 35 },
            {
              y: -18,
              ease: "power1.out",
              scrollTrigger: {
                trigger: placesContainerRef.current,
                start: "top 80%",
                end: "bottom 35%",
                scrub: 1,
              },
            }
          );
        }

        // Endorsement stamp
        if (placesEndorsementRef.current) {
          gsap.from(placesEndorsementRef.current, {
            scale: 0.85,
            opacity: 0,
            duration: 0.6,
            ease: "back.out(2)",
            scrollTrigger: {
              trigger: placesCardRef.current,
              start: "top 70%",
            },
          });
        }
      }

      // Divider 2 expand
      if (div2Ref.current) {
        gsap.fromTo(
          div2Ref.current,
          { scaleX: 0, opacity: 0.3 },
          {
            scaleX: 1,
            opacity: 1,
            duration: 0.8,
            ease: "power2.out",
            scrollTrigger: {
              trigger: div2Ref.current,
              start: "top 88%",
            },
          }
        );
      }

      // -----------------------------------------------------------------
      // SHOWCASE 3: WARM INTRODUCTIONS (Scroll-Driven Interactive Path)
      // -----------------------------------------------------------------
      if (introsContainerRef.current) {
        if (introsTextRef.current) {
          gsap.from(introsTextRef.current.children, {
            y: 30,
            opacity: 0,
            duration: 0.8,
            stagger: 0.1,
            ease: "power2.out",
            scrollTrigger: {
              trigger: introsContainerRef.current,
              start: "top 80%",
            },
          });
        }

        // Bullet points stagger
        if (introsListRef.current) {
          gsap.from(introsListRef.current.children, {
            x: -20,
            opacity: 0,
            duration: 0.6,
            stagger: 0.12,
            ease: "power2.out",
            scrollTrigger: {
              trigger: introsListRef.current,
              start: "top 78%",
            },
          });
        }

        // Master scroll-scrubbed timeline for the introduction path
        const pathTl = gsap.timeline({
          scrollTrigger: {
            trigger: introsCardRef.current,
            start: "top 78%",
            end: "bottom 45%",
            scrub: 0.8,
          },
        });

        // Step 1: "You" node elevates
        if (introNode1Ref.current) {
          pathTl.fromTo(
            introNode1Ref.current,
            { scale: 0.85, opacity: 0.6 },
            { scale: 1, opacity: 1, duration: 0.12, ease: "power2.out" }
          );
        }

        // Step 2: Line 1 draws from You to Priya Shah
        if (introPath1Ref.current) {
          pathTl.fromTo(
            introPath1Ref.current,
            { strokeDashoffset: 100 },
            { strokeDashoffset: 0, duration: 0.30, ease: "none" }
          );
        }

        // Step 3: Priya Shah glows with mutual halo
        if (introNode2Ref.current) {
          pathTl.fromTo(
            introNode2Ref.current,
            { scale: 0.85, opacity: 0.6 },
            { scale: 1.08, opacity: 1, duration: 0.14, ease: "back.out(2)" }
          ).to(introNode2Ref.current, { scale: 1, duration: 0.08 });
        }

        // Step 4: Line 2 draws from Priya Shah to Marcus Tran
        if (introPath2Ref.current) {
          pathTl.fromTo(
            introPath2Ref.current,
            { strokeDashoffset: 100 },
            { strokeDashoffset: 0, duration: 0.30, ease: "none" }
          );
        }

        // Step 5: Marcus Tran target glow
        if (introNode3Ref.current) {
          pathTl.fromTo(
            introNode3Ref.current,
            { scale: 0.85, opacity: 0.6 },
            { scale: 1.1, opacity: 1, duration: 0.15, ease: "back.out(2)" }
          ).to(introNode3Ref.current, { scale: 1, duration: 0.08 });
        }

        // Step 6: Why this path card unfolds
        if (introWhyRef.current) {
          pathTl.fromTo(
            introWhyRef.current,
            { y: 20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.22, ease: "power2.out" },
            "-=0.1"
          );
        }

        // Step 7: Signal badges pop in
        if (introBadgesRef.current) {
          pathTl.fromTo(
            introBadgesRef.current.children,
            { scale: 0.75, opacity: 0 },
            { scale: 1, opacity: 1, stagger: 0.08, duration: 0.18, ease: "back.out(1.8)" }
          );
        }
      }
    }, section);

    // Refresh ScrollTrigger to recalculate exact positions after layout / pinning settles
    const refreshTimer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 250);

    const refreshTimer2 = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 1000);

    const onResize = () => {
      ScrollTrigger.refresh();
    };

    window.addEventListener("resize", onResize);

    document.fonts?.ready
      .then(() => {
        ScrollTrigger.refresh();
      })
      .catch(() => {});

    return () => {
      clearTimeout(refreshTimer);
      clearTimeout(refreshTimer2);
      window.removeEventListener("resize", onResize);
      ctx.revert();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="capabilities"
      aria-label="What you can do"
      className="relative flex min-h-[100svh] items-center bg-[var(--lp-paper)] text-[var(--lp-forest)] overflow-hidden"
    >
      <div className="mx-auto w-full max-w-[72rem] px-5 py-24 sm:px-8 sm:py-32">
        {/* Section Header */}
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--lp-terracotta)]" />
          <p className="lp-eyebrow text-[rgba(23,32,25,0.6)] font-mono tracking-[0.14em]">
            WHAT YOU CAN DO
          </p>
        </div>

        <div className="mt-16 space-y-24 sm:mt-20 sm:space-y-32">
          {/* =========================================================
              SHOWCASE 1: PEOPLE
              ========================================================= */}
          <div
            ref={peopleContainerRef}
            className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16"
          >
            <div ref={peopleTextRef}>
              <ShowcaseLabel>People</ShowcaseLabel>
              <h3 className="lp-h2 mt-4 max-w-[14ch] text-[var(--lp-forest)]">
                The person you need, already in your world
              </h3>
              <p className="mt-5 max-w-[42ch] text-[15.5px] leading-[1.7] text-[rgba(23,32,25,0.7)]">
                Classmates, colleagues, recruiters, investors, friends — indexed
                from the sources you connect, searchable the way you&apos;d actually
                ask.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <ExampleChip text="AI founders in my network" />
                <ExampleChip text="Recruiters who know climate tech" />
                <ExampleChip text="Classmates who work in design" />
              </div>
              <Link
                href="/search"
                className="lp-link mt-7 inline-flex min-h-11 items-center gap-1.5 text-[14.5px] font-semibold text-[var(--lp-navy)]"
              >
                Find people
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Layered Cards Visual */}
            <div className="relative mx-auto w-full max-w-[460px]">
              {/* Back Layer: Source Ledger (Fans out on scroll) */}
              <div
                ref={peopleBackCardRef}
                aria-hidden
                className="absolute -left-4 top-6 hidden w-[72%] rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-surface)] p-4 shadow-[0_10px_30px_rgba(23,32,25,0.08)] sm:block will-change-transform"
              >
                <span className="lp-meta text-[rgba(23,32,25,0.45)]">Indexed from</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["Gmail", "LinkedIn", "Calendar"].map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-[var(--lp-paper)] px-2 py-0.5 text-[11px] font-medium text-[rgba(23,32,25,0.65)] ring-1 ring-[var(--lp-border)]"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Front Layer: Person Result Card */}
              <div
                ref={peopleFrontCardRef}
                className="relative mt-10 rounded-2xl border border-[rgba(23,32,25,0.1)] bg-[var(--lp-white)] p-6 shadow-[0_2px_10px_rgba(23,32,25,0.05),0_24px_60px_rgba(23,32,25,0.1)] sm:mt-0 will-change-transform"
              >
                <div className="flex items-center justify-between">
                  <span className="lp-meta text-[rgba(23,32,25,0.45)]">Person result</span>
                  <span className="lp-meta rounded-full bg-[var(--lp-paper)] px-2.5 py-1 text-[10px] text-[var(--lp-muted)]">
                    Illustrative
                  </span>
                </div>
                <div className="mt-4 flex items-start gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&auto=format&fit=crop&q=80"
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-[var(--lp-border)]"
                  />
                  <div>
                    <h4 className="text-[17px] font-semibold tracking-[-0.015em] text-[var(--lp-forest)]">
                      Marcus Tran
                    </h4>
                    <p className="mt-0.5 text-[13.5px] text-[rgba(23,32,25,0.65)]">
                      Founder, Vellum · 2nd degree
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {["AI infrastructure", "Series A"].map((s) => (
                        <span
                          key={s}
                          className="rounded-full border border-[var(--lp-border)] bg-[var(--lp-paper)] px-2 py-0.5 text-[11.5px] font-medium text-[rgba(23,32,25,0.7)]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-[13.5px] leading-[1.6] text-[rgba(23,32,25,0.7)]">
                  Matched on &ldquo;AI founders&rdquo; — founder of an AI
                  infrastructure company, connected through 2 people you trust.
                </p>
                <div className="mt-4 flex items-center gap-3 border-t border-[var(--lp-border)] pt-4">
                  <div ref={peopleAvatarsRef} className="flex -space-x-2">
                    {[
                      "photo-1494790108377-be9c29b29330",
                      "photo-1438761681033-6461ffad8d80",
                    ].map((id) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={id}
                        src={`https://images.unsplash.com/${id}?w=64&auto=format&fit=crop&q=80`}
                        alt=""
                        className="h-7 w-7 rounded-full object-cover ring-2 ring-[var(--lp-white)]"
                      />
                    ))}
                  </div>
                  <span className="text-[12.5px] font-medium text-[rgba(23,32,25,0.7)]">
                    2 shared connections
                  </span>
                  <span
                    ref={peopleSignalRef}
                    className="lp-meta ml-auto flex items-center gap-1 text-[var(--lp-terracotta)]"
                  >
                    <Star className="h-3 w-3 fill-current" />
                    Strong signal
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Divider 1 */}
          <div
            ref={div1Ref}
            className="h-px w-full bg-[var(--lp-border)] origin-center will-change-transform"
            aria-hidden
          />

          {/* =========================================================
              SHOWCASE 2: PLACES
              ========================================================= */}
          <div
            ref={placesContainerRef}
            className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16"
          >
            <div className="lg:order-1 order-2">
              <div className="relative mx-auto w-full max-w-[440px]">
                {/* Place Result Card */}
                <div
                  ref={placesCardRef}
                  className="rounded-2xl border border-[rgba(23,32,25,0.1)] bg-[var(--lp-white)] p-6 shadow-[0_2px_10px_rgba(23,32,25,0.05),0_24px_60px_rgba(23,32,25,0.1)] will-change-transform"
                >
                  <div className="flex items-center justify-between">
                    <span className="lp-meta text-[rgba(23,32,25,0.45)]">Place result</span>
                    <span className="lp-meta rounded-full bg-[var(--lp-paper)] px-2.5 py-1 text-[10px] text-[var(--lp-muted)]">
                      Illustrative
                    </span>
                  </div>
                  <div className="mt-4 flex items-center gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--lp-sage)] text-[var(--lp-forest)]">
                      <MapPin className="h-5 w-5" />
                    </span>
                    <div>
                      <h4 className="text-[17px] font-semibold tracking-[-0.015em] text-[var(--lp-forest)]">
                        Blue Bottle · cafe
                      </h4>
                      <p className="mt-0.5 text-[13px] text-[rgba(23,32,25,0.6)]">
                        Good for working · Wi-Fi, quiet mornings
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 border-t border-[var(--lp-border)] pt-4 text-[13.5px] leading-[1.6] text-[rgba(23,32,25,0.7)]">
                    Surfaced from places your circle has met at, recommended for
                    focus work.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span
                      ref={placesEndorsementRef}
                      className="flex items-center gap-1.5 rounded-full bg-[var(--lp-paper)] px-2.5 py-1 text-[12px] font-medium text-[rgba(23,32,25,0.7)] ring-1 ring-[var(--lp-border)] shadow-sm"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=48&auto=format&fit=crop&q=80"
                        alt=""
                        className="h-5 w-5 rounded-full object-cover"
                      />
                      Priya has been here
                    </span>
                    <span className="lp-meta text-[rgba(23,32,25,0.45)]">
                      via your network
                    </span>
                  </div>
                </div>

                {/* Floating Search Pill: Swoops down and docks onto card */}
                <div
                  ref={placesPillRef}
                  aria-hidden
                  className="absolute -top-5 right-6 flex items-center gap-2 rounded-full border border-[var(--lp-border)] bg-[var(--lp-white)] py-2 pl-3 pr-4 shadow-[0_10px_30px_rgba(23,32,25,0.12)] will-change-transform z-10"
                >
                  <Search className="h-3.5 w-3.5 text-[var(--lp-muted)]" />
                  <span className="text-[12.5px] font-medium text-[rgba(23,32,25,0.78)]">
                    A great cafe nearby
                  </span>
                </div>
              </div>
            </div>

            <div ref={placesTextRef} className="order-1 lg:order-2">
              <ShowcaseLabel>Places</ShowcaseLabel>
              <h3 className="lp-h2 mt-4 max-w-[14ch] text-[var(--lp-forest)]">
                Where to go, according to people you trust
              </h3>
              <p className="mt-5 max-w-[42ch] text-[15.5px] leading-[1.7] text-[rgba(23,32,25,0.7)]">
                Cafes for focus, tables for dinner, rooms to meet — recommendations
                carry the name of who&apos;s been, so you know why it&apos;s
                surfaced.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <ExampleChip text="A great cafe nearby" />
                <ExampleChip text="Good place to meet a client" />
                <ExampleChip text="Vegetarian restaurant my friends like" />
              </div>
              <Link
                href="/search"
                className="lp-link mt-7 inline-flex min-h-11 items-center gap-1.5 text-[14.5px] font-semibold text-[var(--lp-navy)]"
              >
                Find places
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Divider 2 */}
          <div
            ref={div2Ref}
            className="h-px w-full bg-[var(--lp-border)] origin-center will-change-transform"
            aria-hidden
          />

          {/* =========================================================
              SHOWCASE 3: WARM INTRODUCTIONS
              ========================================================= */}
          <div
            ref={introsContainerRef}
            className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16"
          >
            <div ref={introsTextRef}>
              <ShowcaseLabel>Warm introductions</ShowcaseLabel>
              <h3 className="lp-h2 mt-4 max-w-[15ch] text-[var(--lp-forest)]">
                Never a cold message again
              </h3>
              <p className="mt-5 max-w-[42ch] text-[15.5px] leading-[1.7] text-[rgba(23,32,25,0.7)]">
                Happensten finds the mutual who bridges you to the person you want
                to meet — then drafts the introduction with the context that makes
                it land.
              </p>
              <ul ref={introsListRef} className="mt-6 space-y-2.5">
                {[
                  "Ranked by trust, not just proximity",
                  "The mutual's connection is shown, not hidden",
                  "Draft intro ready to copy or send",
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2.5 text-[14.5px] text-[rgba(23,32,25,0.75)]"
                  >
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lp-terracotta)]" />
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/search"
                className="lp-link mt-7 inline-flex min-h-11 items-center gap-1.5 text-[14.5px] font-semibold text-[var(--lp-navy)]"
              >
                See the path
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Introduction Path Interactive Card */}
            <div
              ref={introsCardRef}
              className="relative mx-auto w-full max-w-[480px] rounded-2xl border border-[rgba(23,32,25,0.1)] bg-[var(--lp-white)] p-7 shadow-[0_2px_10px_rgba(23,32,25,0.05),0_24px_60px_rgba(23,32,25,0.1)] sm:p-8"
            >
              <div className="flex items-center justify-between">
                <span className="lp-meta text-[rgba(23,32,25,0.45)]">Introduction path</span>
                <span className="lp-meta rounded-full bg-[var(--lp-paper)] px-2.5 py-1 text-[10px] text-[var(--lp-muted)]">
                  Illustrative
                </span>
              </div>

              {/* The Path: Nodes & animated dashed SVG connections */}
              <div className="mt-8 flex items-center justify-between gap-2">
                {/* Node 1: You */}
                <div
                  ref={introNode1Ref}
                  className="flex min-w-0 flex-col items-center gap-2 text-center will-change-transform"
                >
                  <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--lp-navy)] p-[3px] shadow-[0_4px_14px_rgba(11,31,58,0.25)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=96&auto=format&fit=crop&q=80"
                      alt=""
                      className="h-full w-full rounded-full object-cover ring-2 ring-white"
                    />
                  </span>
                  <span className="max-w-[9ch] truncate text-[12.5px] font-semibold text-[var(--lp-forest)]">
                    You
                  </span>
                </div>

                {/* Connector 1: Draws from You to Priya */}
                <svg
                  viewBox="0 0 60 12"
                  className="w-full max-w-[60px] shrink grow overflow-visible"
                  aria-hidden
                  preserveAspectRatio="none"
                >
                  <path
                    ref={introPath1Ref}
                    pathLength={100}
                    strokeDasharray={100}
                    strokeDashoffset={100}
                    d="M2 6 H 58"
                    stroke="var(--lp-terracotta)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>

                {/* Node 2: Priya Shah */}
                <div
                  ref={introNode2Ref}
                  className="flex min-w-0 flex-col items-center gap-2 text-center will-change-transform"
                >
                  <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--lp-sage)] p-[3px] shadow-[0_4px_14px_rgba(185,205,180,0.4)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&auto=format&fit=crop&q=80"
                      alt=""
                      className="h-full w-full rounded-full object-cover ring-2 ring-white"
                    />
                  </span>
                  <span className="max-w-[9ch] truncate text-[12.5px] font-semibold text-[var(--lp-forest)]">
                    Priya Shah
                  </span>
                  <span className="lp-meta -mt-1 text-[rgba(23,32,25,0.5)]">
                    strongest mutual
                  </span>
                </div>

                {/* Connector 2: Draws from Priya to Marcus */}
                <svg
                  viewBox="0 0 60 12"
                  className="w-full max-w-[60px] shrink grow overflow-visible"
                  aria-hidden
                  preserveAspectRatio="none"
                >
                  <path
                    ref={introPath2Ref}
                    pathLength={100}
                    strokeDasharray={100}
                    strokeDashoffset={100}
                    d="M2 6 H 58"
                    stroke="var(--lp-terracotta)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>

                {/* Node 3: Marcus Tran */}
                <div
                  ref={introNode3Ref}
                  className="flex min-w-0 flex-col items-center gap-2 text-center will-change-transform"
                >
                  <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--lp-terracotta)] p-[3px] shadow-[0_4px_14px_rgba(206,70,49,0.35)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&auto=format&fit=crop&q=80"
                      alt=""
                      className="h-full w-full rounded-full object-cover ring-2 ring-white"
                    />
                  </span>
                  <span className="max-w-[9ch] truncate text-[12.5px] font-semibold text-[var(--lp-forest)]">
                    Marcus Tran
                  </span>
                  <span className="lp-meta -mt-1 text-[rgba(23,32,25,0.5)]">
                    AI founder
                  </span>
                </div>
              </div>

              {/* Reasoning Card */}
              <div
                ref={introWhyRef}
                className="mt-8 rounded-xl bg-[var(--lp-paper)] p-4 will-change-transform"
              >
                <span className="lp-meta text-[rgba(23,32,25,0.5)]">
                  Why this path
                </span>
                <p className="mt-2 text-[13.5px] leading-[1.6] text-[rgba(23,32,25,0.75)]">
                  Priya has 12 shared threads with you and 3 collaborations with
                  Marcus — the strongest bridge in your graph.
                </p>
              </div>

              {/* Signal Badges */}
              <div ref={introBadgesRef} className="mt-4 flex flex-wrap gap-1.5">
                {["12 shared threads", "3 collaborations", "Same city"].map((c) => (
                  <span
                    key={c}
                    className="rounded-full border border-[var(--lp-border)] bg-[var(--lp-paper)] px-2.5 py-1 text-[11.5px] font-medium text-[rgba(23,32,25,0.7)]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
