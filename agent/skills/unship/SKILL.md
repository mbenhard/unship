---
name: unship
description: "Compare agent-made local alternatives in the real app: UI, copy, states, small flows, design-system treatments, rendered docs or DX previews. Use for Unship setup, Canvas comparisons, selection, and cleanup."
---

# Unship

Unship is local comparison tooling: create temporary alternatives in real source, let the human compare them in the browser, then settle the chosen source. The script runs locally and does not send telemetry. Picker selection does not save source or make a product decision; the agent applies the human's choice.

Make requested adjustments directly in source. Use the picker for discrete alternatives, not live parameter controls.

## Command Prefix

Choose one CLI for the comparison and reuse it across follow-ups:

- In Unship's own repo (`package.json` names `@unship/cli`), use `node src/cli/index.js`.
- Honor an explicitly requested build. Otherwise prefer `./node_modules/.bin/unship`, then a global executable whose owning npm package is verified as `@unship/cli`. Verify ownership by resolving the executable path and reading its package.json. Reuse that identity check while the chosen path and build remain unchanged.
- Only if neither is available, use `npx -y @unship/cli@latest`.

The examples below use `$UNSHIP` to mean that chosen command. Run from the consuming app root, especially in monorepos. Do not replace a deliberate project pin or unpublished local build with npm `@latest`. Package updates use the app's package manager; `install --repair` refreshes agent instructions, not project runtime files.

If `/unship` is unavailable after installation, continue from the natural-language request. Use `init --target <agent>` only when project-local instructions are needed; preserve custom instructions before an explicit `--force` refresh.

## Variant Creation

Inspect the requested source and its immediate design context. In consuming apps, treat the generated picker as an asset: inspect surrounding app markup and use setup/doctor for the runtime, rather than reading its implementation.

- A requested number means exactly that many choices unless the user says “plus current”. Otherwise create 2–4 meaningful alternatives with short, distinct labels.
- Keep the smallest scope that lets the human judge the decision. Match the app's design language unless asked to depart from it. For copy comparisons, preserve structure and vary the message.
- For docs or CLI output, make a local rendered preview; the picker cannot compare raw files.
- Reuse independent comparisons. Settle overlapping work according to an existing user choice; ask only when the desired winner or scope is ambiguous.
- If no app source or preview shell exists yet, create it before mounting the picker.

Do not build a custom switcher, tab set, or preference system. Use this markup contract, with direct child options and exactly one initially visible:

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">...</div>
  <div data-unship-option="Proof-led" hidden>...</div>
</section>
```

Hidden options still exist in the app. Avoid duplicate active IDs, scripts, analytics triggers, autoplay, focus traps, submit controls, and conflicting stateful providers. Reduce scope if alternatives cannot safely coexist.

Variant-specific CSS must not override hidden state. When needed, add a local guard:

```css
[hidden] { display: none !important; }
```

## Picker Setup

Before handing off a new or reused comparison, prepare the runtime at the path its existing dev-only mount serves. A current CLI or restarted agent does not make an old copied script current.

```bash
$UNSHIP setup --out public/unship-picker.js --src /unship-picker.js --json
```

The paths above are examples: choose the app's actual served file and URL. Reuse an existing destination; do not add a second mount. Setup creates a missing file, leaves identical bytes untouched, and reports differing content without overwriting it. For a known old generated picker, repeat with `--force`; replacement saves a backup. Preserve custom modifications and resolve them deliberately before replacement. Require `picker.current: true` after preparation.

Setup prepares the file, not the app shell. Add the returned small script tag once in a dev-only shell. Do not ship the mount or runtime. Respect framework script ordering: in Next.js App Router, use a valid root-document script placement or an appropriate async include, rather than a synchronous `next/script` in an arbitrary component.

If the preview serves built output or caches an old script, rebuild/reload as needed and verify the served file matches the selected runtime. Reinjecting a script does not replace an already-running singleton. Report unresolved browser freshness honestly.

For a standalone HTML preview that needs embedding, use `$UNSHIP setup --inline --json` and its returned snippet. Verify literal HTML with `$UNSHIP doctor --inline --out <HTML-file> --json`; templated mounts may require browser verification. Inline output also supports `--persist local` and `--global-shortcuts` when explicitly wanted.

Doctor is optional troubleshooting, not a step in every iteration. Use `doctor --out <served-file> --json` for an explicit asset. It checks local files; it does not prove which runtime the browser loaded. Optional `--ports` results are preview hints, not evidence that a server belongs to the app. Avoid broad scans or registry checks during ordinary comparisons.

## Canvas

Canvas is opt-in: add it for requests mentioning Canvas, side-by-side or simultaneous previews. “Compare three options” alone uses the picker. Preserve Canvas in existing comparisons. Add an arrangement to the relevant group:

```html
<section data-unship-pick="Header" data-unship-canvas="stack">...</section>
<section data-unship-pick="Cards" data-unship-canvas="grid">...</section>
<section data-unship-pick="Hero" data-unship-canvas="matrix">...</section>
```

Choose `stack` for wide, shallow options, `grid` for compact components, and `matrix` for responsive comparison at 1280, 768, and 390 pixels. Matrix opens at Desktop; the responsive toggle reveals Tablet and Mobile. Choose the arrangement from the content rather than asking the user to manage layout controls.

Canvas frames are script-free snapshots. For content dependent on canvas pixels, shadow DOM, or client JavaScript, use a smaller static preview that represents the decision faithfully. Keep the marked group self-contained. Use the existing Canvas and Keep controls; do not add annotation, sharing, ranking, or persistence systems.

## Verification and Handoff

Keep verification proportional to the phase. During creation, check the expected group and option labels, direct-child structure, exactly one initially visible option, and computed `display: none` for inactive options when rendered verification is needed.

For literal source, run `$UNSHIP check --readiness --json --root <comparison-directory>`. Resolve failures; check uncertain dynamic markup manually. A result with zero groups does not verify the requested comparison. Full release checks belong to setup changes, selected-source cleanup, or shipping, not ordinary variant edits.

Do not start, open, or automate a browser by default. Use it when requested, when setup needs verification, or when source cannot establish readiness. Check expected controls and switching; the human judges the alternatives.

Hand off the known preview link and choice labels; mention checks briefly and setup details only when updated or unresolved. If no preview is running, use its normal dev command when requested. A detected port alone does not identify the app.

## Selection and Cleanup

When the user chooses, keep that option's real source, remove the losing options and `data-unship-*` attributes for that group. Keep the mount while other comparisons remain. If labels or “the second one” are ambiguous across groups or edits, clarify before deleting alternatives.

For final cleanup, remove all temporary options, attributes, comments, script mounts, and unused picker files, including custom-named copies. Preserve recovery backups in `.unship/backups/` and pre-existing ignore rules; they are not comparison residue and do not need removal for a clean check or build. Do not delete the whole `.unship` directory as a cleanup shortcut. Follow choices already supplied; do not choose a winner on the user's behalf. Run:

```bash
$UNSHIP check --json
```

Do not claim final cleanup until the check is clean. Run the app's relevant checks/build for the settled source. Preserve unrelated project changes and keep the runtime/instructions out of the production artifact.
