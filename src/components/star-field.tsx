"use client";

import { useEffect, useRef } from "react";

/**
 * The constellation — ui.md §1 signature element.
 * Ambient star field with slow drift (±2px over ~30s), gentle twinkle,
 * and sparse teal constellation lines. Decorative only (aria-hidden);
 * reduced-motion renders a single static frame.
 */
type Star = {
  x: number;
  y: number;
  r: number;
  base: number;
  phase: number;
  speed: number;
  amp: number;
  tint: "white" | "gold" | "teal";
};

const TINTS: Record<Star["tint"], string> = {
  white: "245, 245, 247",
  gold: "233, 183, 87",
  teal: "95, 212, 208",
};

export default function StarField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let stars: Star[] = [];
    let links: Array<[number, number]> = [];
    let raf = 0;

    const build = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // ~120 stars at 1080p; scales with area, never dense enough to distract.
      // Kept atmospheric: low alpha so content cards stay dominant (V2 tuning).
      const count = Math.floor((w * h) / 16000);
      stars = Array.from({ length: count }, () => {
        const roll = Math.random();
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.4 + Math.random() * 1.0,
          base: 0.07 + Math.random() * 0.22,
          phase: Math.random() * Math.PI * 2,
          speed: 0.01 + Math.random() * 0.03,
          amp: reduced ? 0 : 0.5 + Math.random() * 0.8,
          tint: roll < 0.05 ? "gold" : roll < 0.12 ? "teal" : "white",
        };
      });

      // constellation lines: connect near neighbors, keep it sparse
      links = [];
      for (let i = 0; i < stars.length && links.length < 14; i++) {
        for (let j = i + 1; j < stars.length && links.length < 14; j++) {
          const a = stars[i];
          const b = stars[j];
          if (Math.hypot(a.x - b.x, a.y - b.y) < 150) links.push([i, j]);
        }
      }
    };

    const pos = (s: Star, t: number) => ({
      x: s.x + Math.sin(t * 0.0001 * (1 + s.speed) + s.phase) * s.amp,
      y: s.y + Math.cos(t * 0.0001 * (1 + s.speed * 0.8) + s.phase * 1.3) * s.amp,
    });

    const draw = (t: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      ctx.lineWidth = 0.5;
      ctx.strokeStyle = "rgba(95, 212, 208, 0.04)";
      for (const [i, j] of links) {
        const a = pos(stars[i], t);
        const b = pos(stars[j], t);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (const s of stars) {
        const p = pos(s, t);
        const twinkle = reduced
          ? s.base
          : s.base + Math.sin(t * 0.0004 * (1 + s.speed) + s.phase) * 0.12;
        ctx.fillStyle = `rgba(${TINTS[s.tint]}, ${Math.max(0.03, twinkle)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };

    build();
    if (reduced) {
      draw(0); // one static frame, alive only through the content above it
    } else {
      raf = requestAnimationFrame(loop);
    }

    const onResize = () => {
      build();
      if (reduced) draw(0);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
