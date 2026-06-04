# Toolbar Style Exploration — Design

Date: 2026-06-04
Status: Approved

## Goal

Explore 10 compact, monochrome styling treatments for the Unship picker dock and present them on a single comparison page, so a preferred direction can be chosen and later ported back into `src/picker/unship-picker.js`.

This is a design artifact, not product code. Nothing in the picker changes as part of this work.

## Decisions

- Subject: the real Unship dock anatomy as rendered by `src/picker/unship-picker.js` — single-group mode: one row (chevrons, "Group: Option" label, option count); multi-group open mode: active group row (highlighted), group-switcher menu listing the other groups with their active options, divider, nav row showing the active option label.
- Tone: monochrome/grayscale only. 7 dark concepts, 3 light concepts.
- States: every concept shows the single-group collapsed dock and the multi-group open dock side by side.
- Location: `explorations/toolbar-styles.html`, committed to this repo.
- Approach: shared skeleton + per-concept skins. Dock markup and anatomy CSS are identical across all 10 cards; each concept overrides only its skin (surface, border, outer/inner shadows, radius, typography) via CSS custom properties plus minimal per-skin rules where tokens cannot express the effect (e.g. dual inset bevels).

## The 10 Concepts

Each concept answers "where does the form come from?" differently — blur, border, outer shadow, inner shadow, contrast, or type.

Dark:

1. **Glass Dock** — refined current style as control. Zinc gradient surface, backdrop blur, inset top highlight, deep soft shadow.
2. **Matte Ink** — dead-flat near-black, single hairline border, tight small shadow. No blur, no gradient.
3. **Carbon Bevel** — machined depth: stacked outer shadows plus dual inset bevel (light top edge, dark bottom edge), gradients on raised controls.
4. **Etched Wells** — dark neumorphism. Controls carved into the surface with inner shadows; the active row reads as a recessed well.
5. **Hairline Instrument** — translucent black, crisp 1px rules throughout, 4px radii, `ui-monospace`, tabular numerals.
6. **OLED Contour** — pure `#000` surface, single bright contour line, zero outer shadow; contrast alone provides separation.
7. **Soft Graphite** — lighter gray surface, generous radius, large diffuse ambient shadow, low-contrast borders.

Light:

8. **Paper** — white surface, gray hairline, subtle two-layer shadow; the canonical light toolbar.
9. **Porcelain Inset** — light neumorph counterpart to #4: recessed inner track, embossed active states.
10. **Print Offset** — off-white, solid 1.5px black border, hard unblurred offset shadow, mono type.

## Page Structure

- One self-contained HTML file. Zero dependencies, no external fonts (system font stacks only: `system-ui`, `ui-monospace`).
- Header: title, one-line context, and a stage-tone toggle that flips the stage background behind all docks between light and dark app tones. The toggle is the only JavaScript on the page (about 10 lines).
- Ten cards, each containing: concept number, name, one-line technique caption, and a stage with the collapsed dock and open dock side by side at the real 328px dock width.
- Dock content is realistic picker-domain copy (for example "Hero layout · 2/3", group rows, variant menu items), identical across all cards.
- Cards stack one per row; two-up on very wide screens.

## Verification

- Open the page in a browser and visually review all 10 concepts against both stage tones.
- `git diff --check` (docs/artifact-level change).
- `npm run verify` once, to confirm `explorations/` does not leak into the packed package (guarded by `test/package-smoke.test.js`).

## Out of Scope

- Any change to `src/picker/unship-picker.js` or other product code.
- Interactivity beyond the stage-tone toggle (no expand/collapse behavior on the docks).
- Color (non-grayscale) explorations.
