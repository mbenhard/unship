# Changelog

All notable changes to Unship are documented here.

## 0.2.0 - Unreleased

- Move the option name and complete counter together with the selected Shared slide motion.

- Simplify the comparison skill and reuse running previews, starting a dev server only when needed to deliver the requested comparison.

- Copy selections without deletion instructions; let conversational intent determine iteration and final cleanup.

- Make Canvas available for every comparison by default, with lazy previews and optional layout hints.

- Clarify CLI identity reuse and generated-runtime handling in the skill; remove unused picker CSS and installer metadata, and keep CSS out of visible-text QA reports.

- Claim pinch gestures immediately during Canvas entry and over its controls; release browser zoom on exit. Hide animated group-list scrollbars, remove redundant copied checkmarks, and move frame-pill padding to the right.

- Match option-name and counter motion, clarify copying choices into an AI chat, show visible Canvas copy feedback and checkmarks, and refine the frame pill spacing and moon icon.

- Keep recovery backups and pre-existing ignore rules during agent-led comparison cleanup.
- Show only the option label in the navigation row; group names remain in the multi-group list and accessible descriptions.
- Prepare runtime files directly with `setup --out`: exact-byte no-op checks, explicit replacement with backups, and shared inline/external snippet options.
- Verify explicit copied or inline mounts with doctor; keep diagnostics offline by default and remove automatic npm update checks.
- Preserve the chosen CLI build through repair instructions, add `--version`, and shorten the skill around the setup/compare/cleanup workflow.
- Detect custom-named dev mounts during cleanup; remove readiness guidance for retired inline controls and share installed-instruction path definitions.
- Preserve recovery copies when replacing agent instructions, report detected homes without claiming skills are loaded, and return failure for blocked command installation.
- Add a packed-package comparison/update/cleanup lifecycle test; reuse Chromium across DOM tests while keeping each test in an isolated context.

- Add Canvas for simultaneous comparison with `stack`, `grid`, and responsive `matrix` arrangements, script-free snapshots, native pan/zoom, light/dark themes, and warm reopen caching.
- Preserve explicit Keep choices and cumulative clipboard output, invalidate stale snapshots after source changes, and contain keyboard focus in Canvas.
- Add the attached Canvas tab, matching group/Canvas labels, List / Close menu animation, right-aligned Back to page control, and compact Canvas spacing.
- Give single-group Canvas a full-width row; reduce label sizes and entry-icon opacity, and use an optically aligned return-to-page icon with hover feedback.
- Keep the Canvas label stable during preparation, showing an icon-only spinner after 200 ms; remove menu fades, hide variant controls in expanded group lists, and size menus for short previews.
- Remove experimental tuning controls and their runtime, state, metadata validation, and authoring instructions. Design adjustments happen directly in source through the agent. Cleanup still detects retired markup.
- Add global-first installation for Cursor, Gemini CLI, Windsurf, Cline, and explicit Roo, with Copilot as repo-local guidance; detect Codex alongside other agent homes.
- Accept positional harness names such as `install cursor gemini` and expand repo-local targets while retaining the portable default.
- Add `check --readiness` for comparison structure and presentation hints, with conservative handling of dynamic templates and framework visibility directives.
- Keep the option counter beside the label; show navigation only when a group has multiple options.
- Update bundled skills to use focused readiness checks and a verified local CLI during unpublished testing.
- Add the local Fieldwork demo (`npm run demo`), kept outside the npm package.
- Add the Claude Code plugin distribution and cross-agent skills CLI installation documentation.

## 0.1.7 - 2026-06-07

- Remember the toolbar's dragged snap position locally across refreshes without persisting variant selection by default.
- Clear the copied confirmation immediately when navigating options or groups, and keep keyboard focus in the toolbar after copying.

## 0.1.6 - 2026-06-05

- Align the picker runtime API version with the package version and cover it with a release smoke test.

## 0.1.5 - 2026-06-05

- Refine the bundled skill around native variant creation, proportional verification, reusable picker setup, framework-safe script mounts, and hidden-option safety so agents hand off useful comparisons before doing release-level checks.
- Avoid adding inline `display: none` to options that are already hidden by normal browser rules, reducing hydration mismatch risk when local SSR previews load the picker.

## 0.1.4 - 2026-06-05

- Tighten docs/DX guidance around rendered comparison surfaces and make `check` scan Markdown outside fenced code blocks while respecting Markdown fence marker length and type.
- Make `check --root` fail loudly for missing or unreadable project roots instead of reporting a false clean result.
- Centralize project file traversal and `init --target` file mapping to reduce duplicated CLI/setup logic.
- Refactor picker rendering internals to reuse a stable style node and shared snap geometry helpers without changing picker UX.
- Document the public/local repo boundary in `.gitignore` so local planning docs, dogfood apps, artifacts, and agent workspace state stay private.
- Remove the legacy `install-skill` command from the public CLI surface. Use `install --print-skill` when a manual skill file is needed for an unsupported harness.



## 0.1.3 - 2026-06-05

- Fix hold-to-keep firing before the hold fill finished: the copy now commits exactly when the fill animation completes (720ms), instead of at 600ms with the fill ~80% across.
- Remove the divider line above the option row in the open group menu; the row now sits at the same gap as the menu items instead of behind a line plus extra padding.
- Shorten the copied confirmation to "✓ Copied"; the screen-reader announcement keeps the full paste instruction.
- Shrink the minimized toolbar button from 32px to 28px and fix its hover scale-up, which snapped instead of animating because the transition referenced an easing variable that only exists on the dock.
- Fix edge-snapped docks losing their corner on minimize and restore: the box morph now re-anchors on the geometry it is animating toward, so the shrinking dock slides into the corner and the restored dock grows back to it instead of drifting half the width difference or overflowing the viewport.
- Add a snap-zone ghost while dragging the dock: a dashed outline previews the rest spot of the zone the pointer is in, using the same thresholds the release commits, so the preview and the landing always agree.
- Give the closed-state group bar a permanent soft gray fill (the hover tone), with hover stepping slightly brighter, so the active group reads as a distinct surface at rest.

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
