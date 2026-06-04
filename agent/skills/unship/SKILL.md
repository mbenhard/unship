---
name: unship
description: Use when the user wants to compare UI design variants, generate section or element variants, iterate copywriting/layout/visual directions, preview multiple local directions, use a picker, or clean up temporary Unship markup.
---

# Unship

Use Unship to create temporary local UI variants in real source, let the human compare them instantly in the browser, and then clean every Unship artifact before shipping.

## Normal Requests

Treat ordinary prompts as complete enough to begin. Examples:

- `use unship to generate 4 variants for hero section`
- `generate 3 copywriting variants for section X with unship`
- `generate 4 variants of element X in section Y with unship`

Parse intent this way:

- A number means exactly that many visible choices unless the user says `plus current`.
- A section or element name defines the smallest source scope that can be varied cleanly.
- `copywriting` means preserve structure and vary message, proof, CTA, tone, and hierarchy.
- `visual`, `layout`, or `design` means vary composition while staying inside the app's design language.
- If the target is ambiguous, inspect the page/source first and choose the most likely match.

## Fast Start

Before reading package internals or searching `node_modules`, choose the CLI prefix once:

- If `./node_modules/.bin/unship` exists, use `./node_modules/.bin/unship`.
- Otherwise, if this project lists `@unship/cli` in `package.json`, use `npx unship`.
- Otherwise use `npx -y @unship/cli@latest` so npm does not stop for an install prompt.

Ask the CLI what is already true:

```bash
$UNSHIP doctor --json
```

Use the chosen prefix as `$UNSHIP` for every CLI call in this project. Do not assume a bare `unship` binary is on PATH.

If the picker setup is missing, run:

```bash
$UNSHIP setup --framework auto --json
```

Use the returned framework, picker path, and mount status. Only inspect Unship package files if these commands fail or the project has unusual setup needs.

If `doctor` reports `project.skillInstalled: true` and `project.skillCurrent: false`, refresh installed repo-local instructions with `$UNSHIP init --force --json` before continuing. If `pickerFileCurrent: false`, run `$UNSHIP setup --framework auto --json`; setup refreshes stale picker files.

If `doctor` reports `project.previewServers`, treat them as hints only. Do not assume they are the right app or route. If `doctor` reports `unship.explorations` or `next`, use those fields as concise context for existing temporary work.

If no app source, framework signal, or preview shell exists yet, code normally first and defer setup until there is a local app shell to mount the picker into.

## Target-First Read

Before authoring variants, inspect the named route, component, or source area first. Expand to immediate shared components, tokens, styles, and copy context only when the target is unresolved or local design patterns are unclear. Use the rendered page only when the user asks for browser help, setup requires manual verification, or source alone is insufficient. Variants must be derived from the app's vocabulary unless the user explicitly asks to depart from it.

## Instruction Precedence

1. The user's explicit request for count, style, scope, or temporary retention.
2. Safety and local-only cleanup requirements.
3. The app's design system and implementation constraints.
4. Unship defaults.

When these conflict, explain the tradeoff briefly and choose the smallest safe interpretation.

## Defaults

- Create 2-4 meaningful variants.
- Interpret `N variants` as `N` choices shown unless the user says `N alternatives plus current`.
- Include `Current` only when baseline comparison is useful.
- Use 1-3 word labels, ideally under 18 characters.
- Use inline mode for focused section or component work.

## Inline Mode Safety

Inactive options must safely coexist in the DOM. Avoid duplicate active IDs, submit controls, global scripts, analytics triggers, autoplay media, focus traps, destructive side effects, and stateful providers. If unsafe, reduce scope or explain that inline mode is not suitable.

## Smooth Workflow Edges

- Report detected preview servers as hints instead of opening, navigating, or starting a browser.
- If no preview server is detected, tell the user to start the app the way they normally do.
- If `setup` returns manual instructions, patch only the smallest dev-only mount point or explain what still needs manual wiring.
- If an existing Unship exploration overlaps the requested target, or the user asks to ship, finish, or clean, ask what to keep or clean before changing it.
- If an existing Unship exploration is independent, or the user clearly asks for another round, report it briefly and proceed.
- If typecheck/build fails before your edits, report that baseline state and keep Unship changes isolated.

## Markup Contract

Wrap each temporary group with `data-unship-pick`. Put direct child choices inside with `data-unship-option`.

Do not build a custom switcher, segmented control, tab set, or app-level preference for Unship comparisons. The source variants are the product; the Unship picker toolbar is the comparison control.

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">...</div>
  <div data-unship-option="Proof-led" hidden>...</div>
</section>
```

If setup cannot patch the app automatically, inject the picker locally with `$UNSHIP snippet` or an equivalent dev-only script include.

## Human Comparison Handoff

Do not start, open, or automate a browser by default. The human compares variants in their own running preview.

Before stopping for human choice, report:

- the variant group label;
- the visible option labels;
- whether picker setup is installed and current;
- any detected preview servers as hints only.

If no preview server is detected, say that the user should start the app normally and compare the visible option labels in the Unship picker. Only use browser automation when the user explicitly asks, setup requires manual verification, or you are changing Unship's picker/setup implementation itself. If you do verify, keep it to a functional smoke check: the picker appears, expected option labels are present, and switching does not reload the page. Do not judge visual quality for the human.

## Cleanup

### Settle a selected group

When the human names a winner for one group and wants to continue prototyping, keep that option's real source, remove losing options for that group, and remove `data-unship-*` attributes from the settled source. Keep the picker mount if more exploration is still active or expected.

### Final cleanup

When the human asks to ship, finish, cancel, or clean all Unship work, remove all losing choices, all `data-unship-*` attributes, picker mounts, and Unship comments, then run:

```bash
$UNSHIP check --json
```

Do not claim final cleanup is complete until the check is clean.

Do not invent lifecycle commands. The human chooses by naming the visible option in chat; the agent edits source and verifies cleanup.
