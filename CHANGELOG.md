# Changelog

All notable changes to Unship are documented here.

## Unreleased

- Add toolbar minimize: double-click the option label to collapse the dock into a small circular button; click it to restore.
- Add hold-to-keep: press and hold the option label to copy a ready-to-paste keep instruction for the agent.
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
