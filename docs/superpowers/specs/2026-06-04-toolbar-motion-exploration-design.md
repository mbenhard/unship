# Toolbar Motion Exploration — Design

Date: 2026-06-04
Status: Implemented — final motion system shipped in `src/picker/unship-picker.js` (evolved from concept M5 through review rounds 2–6 below; approved as final for single and multi mode)

## Goal

Explore subtle, lightweight animations for the Unship picker dock (now shipped in the Godly Ink style) on an interactive comparison page, so one motion system can be chosen and ported into `src/picker/unship-picker.js`.

This is a design artifact. The picker only changes after a winner is picked, in a separate step.

## Decisions

- Venue: `explorations/toolbar-animations.html`, committed to this repo. Same chassis as `explorations/toolbar-styles.html` (cards, stage, host-tone toggle), with the Godly Ink skin throughout.
- Moments covered: dock entrance, menu open/close, option switch. Press feedback is out of scope for this round.
- Structure: coherent motion systems, not per-moment treatments. Each card is one complete motion personality applied to all three moments.
- Interaction: each card hosts one interactive dock replica — clicking the group row toggles the menu, the prev/next chevrons cycle real option labels, and a "Replay entrance" button re-runs the load-in animation.
- Constraints: CSS-only motion (transitions/keyframes), portable 1:1 into the picker's `style()`. No libraries. `prefers-reduced-motion: reduce` disables all of it. Nothing slower than 300ms.

## The Four Motion Systems

1. **M1 Godly Strict** — the DESIGN.md language verbatim. 150ms `cubic-bezier(.4,0,.2,1)` everywhere; entrance 300ms fade + 6px rise; menu 150ms fade + 4px drop with fast height; option switch is a pure label crossfade.
2. **M2 Calm Spring** — transforms with gentle overshoot `cubic-bezier(.34,1.56,.64,1)` around 240ms; entrance rises and settles with ~2px overshoot; menu unfurls with springy translate and ~25ms item stagger; label slides 8px with a spring settle.
3. **M3 Ink Quiet** — the barely-there pole. 120ms opacity-only, zero movement; entrance is a 200ms fade; menu fades fast; old label snaps out, new label fades in.
4. **M4 Directional** — motion communicates direction. 180–260ms decelerating curves; entrance slides up from the bottom edge; menu unfurls downward from the group pill; the incoming label slides from the side of the chevron that was pressed; the count ticks vertically.

## Revisions

- 2026-06-04 (round 2): Added **M5 Directional Fade** per review feedback ("Directional + quick fade in/out"): M4's directional language with quick two-phase label swaps — 70ms fade-out exiting away from the incoming side, then a 110ms fade/slide-in from the pressed chevron; faster menu fade (180ms unfurl, 100ms opacity); 5px count tick; 150/200ms entrance. The demo page's swap handler gained a two-phase path (out class → 70ms timer → text swap + in class) used only by M5.

- 2026-06-04 (round 3): **M5 Directional Fade selected and ported into `src/picker/unship-picker.js`.** Because the picker re-renders its shadow DOM on every state change, the port uses insertion-driven CSS animations gated by per-render flags instead of class toggles: `enter` plays a 200ms rise+fade only when the dock first appears (`dockInTop` variant for top placement); `menu-anim` plays `menuIn`/`itemIn` (180ms decel, 20ms stagger) only on menu-open renders; option switches set `data-dir` plus `swap` on the label/count so `swapIn` (110ms, ±8px from the pressed side, ±5px count tick) plays on the fresh nodes. The demo's 70ms fade-out phase is intentionally dropped in the product — the re-render acts as an instant out, keeping the state→render model synchronous. Motion tokens updated to 180ms `cubic-bezier(0,0,.2,1)`; `prefers-reduced-motion` now also disables animations.

- 2026-06-04 (round 4, review feedback): (a) group/option counts now tick vertically odometer-style — next enters from below, prev from above, ±8px at 130ms; (b) menu close is now animated — `closeMenu()` removes the `open` class on the live dock instead of re-rendering, letting the existing max-height/opacity transitions play (with a visibility delay so the collapse stays visible), then re-syncs `renderedSignature`; used by the group toggle and Escape; (c) smoother item reveal — 220ms `cubic-bezier(.22,.61,.36,1)`, 6px drop, 30ms stagger; (d) removed the background transition from nav buttons — the hover fade re-played on every press because re-renders rebuild the hovered node, reading as a color flash.

- 2026-06-04 (round 5, review feedback): (a) menu item reveal simplified to the godly overlay rule — container unmasks via max-height only, items are a pure staggered opacity fade (240ms ease, 30ms cascade, 300ms total), removing the compound slide+expand+double-fade; (b) picking a group from the menu now plays the same contract animation as closing — `pickGroup` updates the visible group/label texts on the live dock and routes through `closeMenu()` instead of re-rendering; the hidden menu list goes stale but is rebuilt by the render required before it can reopen.

- 2026-06-04 (round 6, review feedback): expand/contract unified onto one motion spec — `--dur:.28s` and `--ease:cubic-bezier(.32,.72,0,1)` (quick start, soft landing) drive the panel unmask, the contraction, and the nav-row shift symmetrically. Items now intro AFTER the expansion (two-beat rhythm: 220ms base delay, 40ms stagger, 240ms fades), per review. The active group pill blooms from its hover tone (`groupIn`, same dur/ease) instead of snapping white, continuous with the pressed state. Group hover/state color transition 180ms. An experiment with no item intro at all was tried and rejected.

## Page Structure

- Header: title, one-line context, host-tone toggle (light/dark stage behind the docks).
- Four cards in the same grid/card chrome as the styling page. Each card: number (M1–M4), system name, caption listing durations/easings, one interactive Godly Ink dock (multi-group: Hero layout 3 options, Pricing card, Testimonials), and a "Replay entrance" control.
- Shared vanilla JS (~40 lines) wires interactions only — all motion lives in CSS. Option labels cycle through the real picker-domain copy so the switch animation is felt with content.
- A short hint line on each stage: "click row · ‹ › · replay".

## Verification

- Open in a browser; exercise all three moments per card, on both stage tones.
- `git diff --check`.
- `npm run verify` once (explorations/ stays out of the packed package, guarded by `test/package-smoke.test.js`).

## Out of Scope

- Changes to `src/picker/unship-picker.js` (happens after a winner is chosen).
- Press/hover feedback styling beyond what Godly Ink already ships.
- JS-driven animation, scroll-linked effects, or any dependency.
