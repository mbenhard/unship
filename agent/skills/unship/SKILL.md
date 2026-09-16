---
name: unship
description: "Compare agent-made alternatives in a local browser preview with Unship. Use for comparison setup, iteration, Canvas, selection, cleanup, and Unship installation or update troubleshooting."
---

# Unship

Create temporary alternatives in app source and use Unship's existing picker and Canvas for comparison controls. The human compares them in the browser; follow their direction in source. Picker selection does not save source.

## Command Prefix

Choose one CLI for the comparison and reuse it across follow-ups:

- In Unship's own repo (`package.json` names `@unship/cli`), use `node src/cli/index.js`.
- Honor an explicitly requested build. Otherwise prefer `./node_modules/.bin/unship`, then a global executable whose owning npm package is verified as `@unship/cli`. Verify ownership by resolving the executable path and reading its package.json. Reuse that identity check while the chosen path and build remain unchanged.
- Only if neither is available, use `npx -y @unship/cli@latest`.

The examples below use `$UNSHIP` to mean that chosen command. Run from the consuming app root, especially in monorepos. Do not replace a deliberate project pin or unpublished local build with npm `@latest`. Package updates use the app's package manager; `install --repair` refreshes agent instructions, not project runtime files.

If `/unship` is unavailable after installation, continue from the natural-language request. Use `init --target <agent>` only when project-local instructions are needed; preserve custom instructions before an explicit `--force` refresh.

## Variant Creation

In consuming apps, treat the generated picker as an asset: inspect the app source and use setup/doctor for the runtime, rather than reading its implementation.

- A requested number means exactly that many choices unless the user says “plus current”. Otherwise create 2–4 meaningful alternatives with short, distinct labels.
- For docs or CLI output, make a local rendered preview; the picker cannot compare raw files.
- Reuse existing comparisons where they still serve the request; preserve unrelated comparisons.

Use this markup contract, with direct child options and exactly one initially visible:

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

Setup prepares the file, not the app shell. Add the returned small script tag once in a dev-only shell; keep the runtime and agent instructions out of production builds. Respect framework script ordering: in Next.js App Router, use a valid root-document script placement or an appropriate async include, rather than a synchronous `next/script` in an arbitrary component.

If the preview serves built output or caches an old script, rebuild/reload as needed and verify the served file matches the selected runtime. Reinjecting a script does not replace an already-running singleton. Report unresolved browser freshness honestly.

For a standalone HTML preview that needs embedding, use `$UNSHIP setup --inline --json` and its returned snippet. Verify literal HTML with `$UNSHIP doctor --inline --out <HTML-file> --json`; templated mounts may require browser verification. Inline output also supports `--persist local` and `--global-shortcuts` when explicitly wanted.

Doctor is optional troubleshooting, not a step in every iteration. Use `doctor --out <served-file> --json` for an explicit asset. It checks local files; it does not prove which runtime the browser loaded. Optional `--ports` results are preview hints, not evidence that a server belongs to the app. Avoid broad scans or registry checks during ordinary comparisons.

## Canvas

Canvas opens from every comparison. It displays the original live options in the same document, preserving DOM parents, event handlers, component state, canvas pixels, and existing iframe content. Use `stack` (default) for wide sections or `data-unship-canvas="grid"` for compact components.

All options share the browser viewport. Resize the real browser to test viewport media queries; there is no responsive toggle. Container queries can respond to the component's width.

Canvas requires a browser with the Popover API. Keep option roots self-contained: app-owned popovers or dialogs remain page comparisons. Detected external overlays return to the page with the interacting option selected. Arbitrary portal implementations and cross-origin iframe gestures have limits; verify those interactions on the page and report incompatibilities. Keep Canvas out of production builds.

## Verification and Handoff

Keep verification proportional to the phase. During creation, check the expected group and option labels, direct-child structure, exactly one initially visible option, and computed `display: none` for inactive options when rendered verification is needed.

For literal source, run `$UNSHIP check --readiness --json --root <comparison-directory>`. Resolve failures; check uncertain dynamic markup manually. A result with zero groups does not verify the requested comparison. Full release checks belong to setup changes, selected-source cleanup, or shipping, not ordinary variant edits.

Reuse the app's running preview. If none is available, start its normal dev server when needed to deliver the requested comparison. Use browser automation when requested or when source checks cannot establish readiness; verify controls and switching.

Hand off the working preview link and choice labels. Mention checks briefly and state any unresolved blocker.

## Selection and Cleanup

Interpret typed feedback and copied selections using the conversation. A copied selection identifies an option; it does not itself request deletion. Only discard alternatives or finalize a comparison when that intent is clear from the user's instructions.

When finalizing a group, keep the chosen option's real source and remove its losing options and `data-unship-*` attributes. Keep the mount while other comparisons remain. If the target or intent is ambiguous, clarify before deleting alternatives.

For final cleanup, remove all temporary options, attributes, comments, script mounts, and unused picker files, including custom-named copies. Preserve recovery backups in `.unship/backups/` and pre-existing ignore rules; they are not comparison residue and do not need removal for a clean check or build. Do not delete the whole `.unship` directory as a cleanup shortcut. Follow choices already supplied; do not choose a winner on the user's behalf. Run:

```bash
$UNSHIP check --json
```

Do not claim final cleanup until the check is clean. Run the app's relevant checks/build for the settled source. Preserve unrelated project changes.
