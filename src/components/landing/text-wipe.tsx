"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface TextWipeProps {
  /** one entry per visual line — real text, wrapped in clip masks */
  lines: React.ReactNode[];
  as?: "h1" | "h2" | "p" | "div";
  className?: string;
  /** "up": lines rise in, scrubbed as the block enters.
      "sides": lines enter from opposing sides (closing-CTA treatment). */
  direction?: "up" | "sides";
}

/* Scroll-scrubbed editorial text wipe. Each line sits in an overflow-hidden
   mask and eases into place as scroll progress advances — not a one-shot
   entrance. Falls back to static text under reduced motion. */
export default function TextWipe({
  lines,
  as = "h2",
  className,
  direction = "up",
}: TextWipeProps) {
  const ref = useRef<HTMLElement | null>(null);
  const Tag = as as React.ElementType;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const targets = el.querySelectorAll<HTMLElement>("[data-wipe-line]");
      if (direction === "sides") {
        // odd lines from the left, even lines from the right
        gsap.fromTo(
          targets,
          { xPercent: (i) => (i % 2 === 0 ? -9 : 9), opacity: 0.25 },
          {
            xPercent: 0,
            opacity: 1,
            ease: "power2.out",
            stagger: 0.06,
            scrollTrigger: {
              trigger: el,
              start: "top 88%",
              end: "top 42%",
              scrub: 0.8,
            },
          },
        );
      } else {
        gsap.fromTo(
          targets,
          { yPercent: 115 },
          {
            yPercent: 0,
            ease: "power2.out",
            stagger: 0.07,
            scrollTrigger: {
              trigger: el,
              start: "top 88%",
              end: "top 48%",
              scrub: 0.8,
            },
          },
        );
      }
    }, el);

    // re-measure once webfonts land so masks never mis-clip
    document.fonts?.ready.then(() => ScrollTrigger.refresh()).catch(() => {});

    return () => ctx.revert();
  }, [direction]);

  return (
    <Tag ref={ref} className={className}>
      {lines.map((line, i) => (
        <span
          key={i}
          className="wipe-line-mask"
          style={{ paddingBottom: "0.12em", marginBottom: "-0.12em" }}
        >
          <span data-wipe-line className="wipe-line">
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
}
