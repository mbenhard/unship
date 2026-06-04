# Changelog

All notable changes to Unship are documented here.

## Unreleased

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
