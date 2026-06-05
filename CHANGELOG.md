# Changelog

All notable changes to Unship are documented here.

## Unreleased

- Fix hold-to-keep firing before the hold fill finished: the copy now commits exactly when the fill animation completes (720ms), instead of at 600ms with the fill ~80% across.
- Remove the divider line above the option row in the open group menu; the row now sits at the same gap as the menu items instead of behind a line plus extra padding.
- Shorten the copied confirmation to "✓ Copied"; the screen-reader announcement keeps the full paste instruction.
- Shrink the minimized toolbar button from 32px to 28px and fix its hover scale-up, which snapped instead of animating because the transition referenced an easing variable that only exists on the dock.
- Fix edge-snapped docks losing their corner on minimize and restore: the box morph now re-anchors on the geometry it is animating toward, so the shrinking dock slides into the corner and the restored dock grows back to it instead of drifting half the width difference or overflowing the viewport.
- Add a snap-zone ghost while dragging the dock: a dashed outline previews the rest spot of the zone the pointer is in, using the same thresholds the release commits, so the preview and the landing always agree.
- Give the closed-state group bar a permanent soft gray fill (the hover tone), with hover stepping slightly brighter, so the active group reads as a distinct surface at rest.

## 0.1.3 - 2026-06-05

- Make project setup framework-agnostic: `setup --json` now returns an inline dev-only picker snippet instead of detecting frameworks and patching app files.
- Keep agent installation separate from app picker mounting; `install --project` now points to explicit setup instead of wiring the app.
- Fix toolbar right-clicks starting the hold-to-copy gesture.
- Fix toolbar arrow-key switching double-firing when global shortcuts are enabled.
- Add toolbar minimize: double-click the option label (or press Shift+Enter on it) to collapse the dock into a small circular button; click it to restore.
- Add hold-to-keep: press and hold the option label (or press Enter on it) to copy a ready-to-paste keep instruction for the agent; failed copies report a failure instead of claiming success.
- Add drag-snap placement: drag the label to snap the dock to left/center/right and top/bottom anchors.
- Add scroll-to-group: switching groups scrolls the page to the chosen group when it is mostly off-screen.
- Change the group switcher to one stable list in page order, with the active row marked in place and doubling as the closed-state header.
- Remove the label-click top/bottom placement toggle and the focus-driven placement auto-flip; placement changes only when the dock is dragged.

## 0.1.2 - 2026-06-04

- Harden install, doctor, and check output for the first beta package.
- Add update awareness and grouped cleanup summaries.
- Keep repo-local docs and explorations out of the public GitHub surface.

## 0.1.0 - 2026-06-04

Initial beta release.

- Add dependency-free local DOM picker for `[data-unship-pick]` groups and direct child `[data-unship-option]` choices.
- Add CLI commands: `install-skill`, `init`, `setup`, `snippet`, `check`, and `doctor`.
- Add thin setup support for Next.js, Vite, Astro, SvelteKit, Nuxt, and Angular.
- Add structured read-only exploration summaries in `check --json` and `doctor --json`.
- Add bundled agent skill for temporary source-level UI prototyping and cleanup.
- Add packed package smoke coverage and browser picker tests.
