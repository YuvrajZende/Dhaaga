"use client";

import React, { useEffect, useRef } from "react";

/* Adaptive terracotta cursor accent.
   Default: compact dot trailing the pointer. Over any [data-cursor-pill]
   target (nav links) it eases into a translucent capsule around the pointer.
   The native cursor is never hidden — this is an accent, not a replacement.
   z-index sits ABOVE the fixed navbar (z-50) so the pill is visible over it;
   the capsule fill is 13% alpha so nav labels stay legible underneath. */
export default function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dotRef.current;
    if (!el) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    el.classList.add("lp-cursor-on");

    let raf = 0;
    const pos = { x: -100, y: -100 };
    const cur = { x: -100, y: -100 };
    let pillMode = false;
    let seen = false;

    const onMove = (e: PointerEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      if (!seen) {
        seen = true;
        cur.x = pos.x;
        cur.y = pos.y;
      }
    };

    const onOver = (e: Event) => {
      const t = e.target as HTMLElement;
      // pill over nav targets and any link (a[href]); dots elsewhere
      const target = t.closest?.("[data-cursor-pill], a[href]");
      pillMode = Boolean(target);
      if (pillMode) {
        el.classList.add("lp-cursor-pill");
        el.style.width = "72px";
        el.style.height = "30px";
      } else {
        el.classList.remove("lp-cursor-pill");
        el.style.width = "10px";
        el.style.height = "10px";
      }
    };

    const onLeave = () => {
      el.style.opacity = "0";
    };
    const onEnter = () => {
      el.style.opacity = "1";
    };

    const tick = () => {
      // gentle trail — slightly snappier while stretched over a target
      const lerp = pillMode ? 0.3 : 0.17;
      cur.x += (pos.x - cur.x) * lerp;
      cur.y += (pos.y - cur.y) * lerp;
      el.style.transform = `translate(${cur.x}px, ${cur.y}px) translate(-50%, -50%)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.documentElement.addEventListener("pointerenter", onEnter);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.documentElement.removeEventListener("pointerenter", onEnter);
    };
  }, []);

  return (
    <div
      ref={dotRef}
      aria-hidden
      className="lp-cursor"
      style={{ width: 10, height: 10 }}
    />
  );
}
