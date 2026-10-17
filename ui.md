# UI Design System — Network Search App

UI Specification · v1.0 · 2026-09-19 · feeds `srs.md` §5.1 and `lld.md` §10
Direction: **premium Apple-style — dark-first, glass materials, fluid springs, one signature moment.**

---

## 1. Design thesis

The product's promise is serendipity: *make your own luck*. Its subject is the user's relationships — which we render as a **personal night sky**. One signature carries the whole design:

> **"The network answers."** — While a search runs, the constellation background comes alive: candidate stars ignite in sequence as sub-searches execute, and lines draw from *you* to each result. The AI's steps stream beneath the field in mono type. Results are not listed — they *materialize* out of the sky.

Everything else is restraint: system typography, three weights of translucent material, one gold accent ("the find"), one teal accent ("the path"), critically-damped springs, and craft at the token level. No gradients-as-decoration, no emoji, no confetti.

## 2. Color tokens

### Dark (default)
| Token | Value | Role |
|---|---|---|
| `--bg-base` | `#08080D` | page ground — near-black, blue undertone |
| `--bg-space` | radial `#0D1024 → #08080D` | constellation canvas backdrop (subtle, never animated loops) |
| `--material-thick` | `rgba(20,22,32,0.72)` + `blur(40px) saturate(160%)` | sidebar, result drawer |
| `--material-medium` | `rgba(18,20,30,0.55)` + `blur(20px) saturate(180%)` | cards, toolbar, search field |
| `--material-thin` | `rgba(255,255,255,0.07)` + `blur(8px)` | chips, toggles, tooltips |
| `--text-primary` | `#F5F5F7` | Apple primary white |
| `--text-secondary` | `rgba(235,235,245,0.62)` | Apple secondaryLabel |
| `--text-tertiary` | `rgba(235,235,245,0.32)` | timestamps, hints |
| `--accent-find` | `#E9B757` | **gold** — results, focus ring, primary CTA, strength ring |
| `--accent-path` | `#5FD4D0` | **teal** — warm paths, "via" provenance, connection lines |
| `--danger` | `#EB5545` | destructive only |
| `--hairline` | `rgba(255,255,255,0.10)` | 1px separators inside glass (used sparingly — materials separate, not lines) |

### Light
| Token | Value |
|---|---|
| `--bg-base` | `#F5F5F7` (Apple light gray) · surfaces = white glass `rgba(255,255,255,0.72)` |
| `--text-primary/secondary` | `#1D1D1F` / `rgba(60,60,67,0.6)` |
| `--accent-find` | `#9A7318` (deepened gold, AA on light) · `--accent-path`: `#0E7490` |
| `--material-thick/medium` | same blur, higher opacity (0.82/0.65) |

Rules: never stack light-on-light glass; over glass, text uses the higher-contrast secondary recipe (slightly heavier weight + `0.01em` tracking); color lives on solid layers, not translucent ones.

## 3. Typography

Apple's system faces, used with size-specific discipline (tracking is never one value):

| Role | Face | Spec |
|---|---|---|
| Display (hero, page titles) | SF Pro Display via `-apple-system, system-ui` | 48–64px / 600 / **`-0.025em`** / line-height 1.05 / `font-optical-sizing: auto` |
| Title (card names, drawer) | same | 21–28px / 590 / `-0.012em` / 1.15 |
| Body | SF Pro Text | 15px / 400 / `0` / 1.5 |
| Caption | SF Pro Text | 12px / 500 / `+0.01em` / 1.3 |
| **System voice** | `ui-monospace, "SF Mono"` | 12–13px / 450 / `+0.02em` — all machine speech: "Ran 3 searches", latencies, sync progress, cursors |

Emphasis is **weight, not size or color**: hierarchy built from 400 → 590 → 640 steps. The gold accent is reserved for meaning (findable/interactive), never for emphasis-by-decoration. All spacing in `rem` so layouts track the user's text-size setting.

## 4. Material & depth system

Three material weights (§2) encode hierarchy, Apple-visionOS style:

- **Thick** — structural floating layers: result drawer, sync sheet, sidebar. Deepest shadow `0 24px 64px rgba(0,0,0,0.55)`; 1px top-edge highlight `rgba(255,255,255,0.35)` ("light catching the glass").
- **Medium** — things you act on: result cards, search field, floating toolbar.
- **Thin** — chips, pills, hover states.
- **Chrome floats, never consumes layout:** the search bar and toolbar are translucent layers with content scrolling *underneath*; where content meets chrome, a 16px gradient mask fades it (scroll edge effect) instead of a hard divider.
- **Materialize, don't fade:** every glass surface enters with `blur 8px → 0` + `scale 0.96 → 1` + opacity, together.
- **Focus, dim, not block:** the result drawer dims the canvas to 40% and pushes it back (`scale 0.98`) — parallel panels (history) get translucency *without* scrim.

## 5. Motion spec (fluid interfaces)

Springs via Motion/Framer Motion; **all interruptible, always animating from the live presentation value**.

| Interaction | Spring | Notes |
|---|---|---|
| Default UI (hover states, toggles, layout) | `damping 1.0`, `response 0.35` (`bounce: 0, duration: 0.35`) | critically damped — no bounce anywhere by default |
| Drawer/sheet open & dismiss | `damping 0.8`, `response 0.3` | bounce earned only by gesture momentum; **velocity handoff** from pointer release |
| Card press feedback | pointer-down: `scale(0.97)` in 100ms ease-out | feedback on press, never on release |
| Drawer dismiss | 1:1 drag tracking with grab offset, rubber-band past edge (`k=0.55`), release decides by **velocity sign**, projected landing | iOS sheet physics |
| List stagger | 80ms/card, rise 12px + materialize | only on first render of a result set |
| Theme switch | 300ms ease on colors | no abrupt brightness jumps |

### Signature choreography — "the network answers"
```
t0     query committed → field morphs to compact (spring 0.35s), canvas brightens to 100%
t+0.2  stage line appears in SF Mono: "planning searches…" (typing shimmer, never a spinner)
t+…    per sub-search completion: "Ran 3 searches" ticks up; each result star ignites
       (radius pulse gold → settles), line draws me→star over 400ms with dash animation
t+…    results column materializes card-by-card (stagger 80ms, blur→sharp)
       canvas dims back to 40% — stars remain lit for the session
```
Reduced motion (`prefers-reduced-motion: reduce`): the entire choreography becomes a single cross-fade; star drift, dash-draw, and parallax are removed; stage text swaps instantly. Reduced transparency: materials go solid (opacity ≥ 0.95, blur none).

## 6. Component inventory

| Component | Spec |
|---|---|
| **Search field** | Hero element on Home: 640px max, 56px tall, medium glass, 17px placeholder "Ask your network…", gold focus ring `0 0 0 3px rgba(233,183,87,0.35)`, `⌘K` hint chip. On commit morphs (spring) to a compact 44px bar docked top-center; expands back on focus |
| **Result card** | Medium glass, 16px radius, padding 20px; avatar 44px with 1px hairline ring · name (Title) · title @ company (secondary) · rationale (body, max 2 lines) · bottom row: mutual chips (thin glass, avatar 20px + name) + strength mini-arc (14px). Press → whole card scales 0.97; click → drawer |
| **Strength ring** | 28px circular arc, gold, track `rgba(255,255,255,0.12)`, spring-animated sweep on mount; number in SF Mono inside |
| **Result drawer (sheet)** | Right sheet 420px, thick glass, drag handle, velocity-handoff dismiss, rubber-band. Contents: avatar 96px · name Title · headline · **path visualization** — three nodes (me · mutual · target) joined by a teal line, mutual node clickable · intro draft as a quiet inset (solid `rgba(255,255,255,0.05)`, mono label "Draft to Alex") with Copy / Mail buttons (gold primary, quiet secondary) |
| **Mutual chip** | Thin glass pill, overlapping 20px avatars, teal "via" label; hover raises + brightens (interruptible spring) |
| **Thinking column** | Single column under the compact field: mono lines "planning searches… → Ran 3 searches → ranking 100 candidates", each line materializes and previous dims to tertiary. This is the AI's interior voice — visible, calm, precise |
| **Floating toolbar (Graph)** | Top-center pill, medium glass: search · filter (company/strength) · zoom · "Reset view". Content scrolls under; edge-fade mask at intersections |
| **Toggle (sharing)** | iOS-style: 51×31px, gold when on, spring 0.3 with 0.8 damping only on drag-driven change |
| **Toggle destructive confirm** | Typed confirmation inline (purge) — danger color, no modal dialogs |
| **Empty state** | Invitation, not apology: constellation faintly lit with a single bright star; "Ask your first question" + 3 example queries as thin chips |
| **Error state** | Specific and directional: "OpenRouter is unreachable — showing matches ranked by connection strength." `mode: degraded` badge in mono, teal dot |

## 7. Screen specs

### 7.1 Onboarding (first run)
```
┌──────────────────────────────────────────────────────────┐
│                    ·  ✦      ✦                            │  ← constellation, ambient
│                                                           │
│              Your network,                                │  Display 56px, two lines,
│              finally searchable.                          │  tracking −0.025em
│                                                           │
│        One search across every person you've met.         │  body 15px secondary
│                                                           │
│   ┌───────────────────────────────────────────────┐      │  thick glass card, 480px
│   │  ✉  Gmail            Connect   ⌾             │      │  rows 56px, hairline only
│   │  ◉  Google Contacts   Connect                 │      │  between (materials, not lines)
│   │  📅  Calendar          Connect                │      │
│   └───────────────────────────────────────────────┘      │
│              [ Continue with Google ]  ← gold CTA         │
│   "Metadata only. Never message content."  caption 12px   │
└──────────────────────────────────────────────────────────┘
```
During sync this page becomes the build sequence: stars accumulate as people import (real counts from `/api/sync/status` in mono: "12,431 people · 3 sources"), the CTA quietly becomes "Enter" when ≥1 source is done. Sync is the first act of the product, so it's choreographed, not hidden.

### 7.2 Home / Search (the signature screen)
```
┌──────────────────────────────────────────────────────────┐
│  ⌘  Happensten              [Search] [Graph] [Friends] ⚙ │  ← floating top pill (medium glass)
│            ┌───────────────────────────────┐             │
│            │ ⌘K  Ask your network…         │             │  compact field after commit
│            └───────────────────────────────┘             │
│      planning searches…                                  │  SF Mono, tertiary
│      Ran 3 searches · ranking 100 candidates             │
│  ✦ · ·   ✦━━━┓                                           │  canvas: igniting stars,
│  ·  ✦ ━━━━━━━╋━━ ✦          ┌────────────────────┐      │  gold lines me→result
│ ·   ✦ ━━━━━━━┛              │ ● Maya Chen        │      │
│  ·    ·    ✦                │   Founder, Vellum  │      │  result cards, single
│                             │   "Real momentum…" │      │  column 640px, staggered
│                             │   ◍ 86  via Alex T │      │  materialize
│                             └────────────────────┘      │
│                             ┌────────────────────┐      │
└──────────────────────────────────────────────────────────┘
```

### 7.3 Graph page
Edge-to-edge canvas, no chrome except the floating toolbar + history strip (bottom, thin glass, last searches as chips). Node = 6–14px star, size ∝ strength; hover: node + 1-hop neighbors brighten, rest dim to 20% (spring). Click: camera flies to node (spring, 0.4), drawer opens. Warm-path selection: me→mutual→target edges draw in teal, everything else dims. Ambient drift is ±2px over ~30s — perceptible only as "alive"; disabled under reduced motion.

### 7.4 Friends / Groups / Privacy
Quiet list pages: thick-glass container, 64px rows, hairline separators only inside a group, iOS toggles, no illustration. Privacy page doubles as a "what we store" ledger — each source row expands to plain-language detail; the purge row is the only danger-colored element on any screen.

## 8. Accessibility floor (non-negotiable)

- Full keyboard paths: `⌘K` → search, `↑↓` cards, `⏎` drawer, `Esc` dismiss; visible gold focus ring on every interactive element (2px offset 2px).
- Contrast: body text ≥ 4.5:1 in both themes; over glass, secondary text uses the heavier recipe (§2 rules).
- `prefers-reduced-motion` / `prefers-reduced-transparency` / `prefers-contrast: more` honored exactly as §5/§2.
- Hits ≥ 44×44px; chips get +10px invisible padding (Apple hysteresis rule).
- Canvas (constellation) is decorative: `aria-hidden`, all data duplicated in the accessible results list — the graph is never the only route to information.

## 9. Quality bar (the "would Apple ship it" checklist)

Every spacing value from a 4px grid (8/12/16/20/24/32/48) · radii: 10/14/16/28 only · shadows only on floating layers · no border+shadow+glass on the same element · zero spinners (progress is always shaped: ticking counts, sweeping arcs, igniting stars) · springs interruptible everywhere (grab a closing drawer — it follows your hand) · empty/error/first-run states designed, not defaulted · light mode as finished as dark · 60fps on the canvas at 500 nodes (WebGL, node cap from LLD §10).

## 10. Implementation notes (handoff)

- Tokens as CSS custom properties (§2) in `globals.css`; Tailwind theme maps onto them; no raw hex in components.
- Motion: `motion` (Framer) for springs; canvas = `sigma.js` (WebGL) with the ambient-drift and ignite effects implemented as renderer plugins; SSE stages drive the choreography timeline (event names from LLD §6.5 map 1:1 to stage lines).
- Fonts: system stack only (SF on Apple platforms; falls to Segoe/Roboto elsewhere — acceptable, brief is Apple-style).
- Files: `components/material/` (three material primitives), `components/star-field/` (canvas), `components/search/`, `components/drawer/`.
