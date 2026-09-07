---
name: unship
description: "Use when the user wants to compare agent-made local alternatives: UI sections, copy, states, flows, design-system directions, rendered docs or DX surfaces, visual directions, picker previews, or cleanup of temporary Unship markup."
---

# Unship

Use Unship to create temporary alternatives in real source, let the human compare them in the local browser, and then clean every Unship artifact before shipping. Unship is a decision surface for work that designers and developers judge best in the actual app: UI, copy, product states, flows, design-system treatments, rendered docs previews, and developer experience surfaces.

Unship is local comparison tooling. The picker script runs in the user's local preview, Unship does not send telemetry, and picker selection does not save source or make a product decision. The human chooses by naming a visible option label in chat; you settle source by keeping that option and removing temporary artifacts.

## Normal Requests

Treat ordinary prompts as complete enough to begin. Examples:

- `use unship to compare 4 hero directions`
- `generate 3 copywriting directions for section X with unship`
- `use unship to explore empty, loading, and error states for the import flow`
- `use unship to compare 3 button system treatments`
- `use unship to render 3 CLI help output directions`

Parse intent this way:

- A number means exactly that many visible choices unless the user says `plus current`.
- A section, element, state, flow step, design-system sample, rendered docs preview, or DX surface defines the smallest source scope that can be varied cleanly.
- `copywriting` means preserve structure and vary message, proof, CTA, tone, and hierarchy.
- `visual`, `layout`, or `design` means vary composition while staying inside the app's design language.
- `state` means compare realistic product states such as empty, loading, error, success, long-label, reduced-motion, or permission-limited views.
- `flow` means compare a small source-contained path or step sequence, not a production experiment framework.
- `system`, `tokens`, or `design system` means compare local component or style treatments that can be rendered in source.
- `docs`, `README`, `CLI`, `DX`, or `terminal` means create a local rendered comparison artifact when the app itself is not the right surface. Do not treat raw Markdown files as directly comparable by the picker.
- If the target is ambiguous, inspect the page/source first and choose the most likely match.

## Command Prefix

Choose the CLI prefix only when a CLI command is needed:

- If `./node_modules/.bin/unship` exists, use `./node_modules/.bin/unship`.
- Otherwise, if `command -v unship` finds an executable, resolve its path and verify its owning npm package metadata names `@unship/cli` before using it. A matching binary name alone is insufficient: older or unrelated tools can also be named `unship`. This preserves a verified local development install before it is published.
- Otherwise use `npx -y @unship/cli@latest` so npm does not stop for an install prompt.

Use the chosen prefix as `$UNSHIP` for every CLI call in this project. Check availability before using a global binary. When working on Unship itself (`package.json` names `@unship/cli`), use `node src/cli/index.js` to test the checkout instead of fetching the published package.

For status checks during normal prototyping, prefer:

```bash
$UNSHIP doctor --json --no-update-check
```

Use `doctor` when setup freshness, stale installed files, or existing Unship work matters. If `doctor` reports `project.skillInstalled: true` and `project.skillCurrent: false`, refresh installed repo-local instructions with `$UNSHIP init --force --json` before continuing. If `pickerFileCurrent: false`, run setup only when the picker is still needed.

If `/unship` is unavailable after installation, continue from the natural-language request. Do not require the slash command when this skill is already active.

If no app source or preview shell exists yet, code normally first and defer setup until there is a local app shell to mount the picker into.

## Variant Creation

Use this path for ordinary requests to generate, compare, or explore alternatives. Create the smallest source-level comparison that lets the human judge the options in the running local preview. Inspect the named route, component, source area, or local comparison artifact first. Expand to immediate shared components, tokens, styles, and copy context only when the target is unresolved or local design patterns are unclear.

Alternatives must be derived from the app's vocabulary unless the user explicitly asks to depart from it. Avoid unrelated refactors. Extract helpers only when they make the temporary comparison clearer or avoid obvious repeated markup.

Keep verification proportional to the phase. Before the first handoff, do only comparison-readiness verification:

- the expected `data-unship-pick` group exists;
- the expected option labels exist;
- the options are direct children of the group;
- exactly one direct option is initially visible;
- hidden direct options are actually hidden, including computed `display: none` when a rendered DOM can be checked cheaply.

Do not run full release checks during ordinary variant creation unless the source cannot be edited safely without them. Full typecheck, build, browser automation, mobile smoke, `unship check`, and cleanup verification belong to picker setup changes, selected-option cleanup, or final shipping cleanup.

If the target is ambiguous, inspect the page/source first and choose the most likely match. Use the rendered page only when the user asks for browser help, setup requires manual verification, or source alone is insufficient.

## Picker Setup

Picker setup is local development infrastructure. Reuse an existing dev-only picker mount when present. Do not reinstall, inline, copy, repair, or replace the picker during ordinary variant creation unless the picker is missing, stale, or the user asked to change setup.

If picker setup is missing and the comparison needs it now, run:

```bash
$UNSHIP setup --json
```

Use the returned `mount.snippet` and instructions. Patch only the smallest local/dev-only app shell or preview artifact that renders the Unship options. Only inspect Unship package files if these commands fail or the project has unusual setup needs.

Framework script helpers can enforce ordering rules that plain scripts do not. If the picker has no strict ordering requirement, prefer the simplest valid dev-only script mount for the app shell. In Next.js App Router, do not place a sync or defer `next/script` mount outside the root document or root `head`; move it into the root `head`, add `async`, or use a plain dev-only `<script>` include instead.

If `doctor` reports `project.previewServers`, treat detected preview servers as hints instead of opening, navigating, or starting a browser. Do not assume they are the right app or route. If `doctor` reports `unship.explorations` or `next`, use those fields as concise context for existing temporary work.

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
- Use inline mode for focused section, component, state, copy, or local comparison artifact work.

## Inline Mode Safety

Inactive options must safely coexist in the DOM. Avoid duplicate active IDs, submit controls, global scripts, analytics triggers, autoplay media, focus traps, destructive side effects, and stateful providers. If unsafe, reduce scope or explain that inline mode is not suitable.

## Tuning Existing UI or Variants

When the user asks to tune or calibrate an existing design, or a few continuous adjustments would help compare options, add a small set of meaningful `data-unship-tweaks` axes. Preserve the requested number of choices. A single direct option supports tuning without inventing alternatives.

Declare axes as a JSON array on the option, or on the group for shared controls. Each axis needs a short `label`, a CSS custom property in `var`, and an inline default on the same element. Use that property in the rendered CSS so every control has a visible effect.

- Numeric `slider`: finite `min` and `max` with `max > min`, positive `step`, and optional `unit`.
- Token `slider`: at least two `steps`, each with a `label` and CSS `value`; do not also declare a numeric range.
- `segmented`: two to four labeled `options` with CSS values.
- `swatch`: at least two labeled color `options` with CSS values.
- `toggle`: explicit CSS values for `on` and `off`.

Defaults for token, segmented, swatch, and toggle controls must match a declared value. Use distinct labels and variables within each panel; put shared controls on the group, without shadowing their variables on options.

```html
<section data-unship-pick="Card">
  <div data-unship-option="Soft" style="--card-pad: 24px; --card-accent: #275c45;"
       data-unship-tweaks='[
         {"type":"slider","label":"Padding","var":"--card-pad","min":12,"max":40,"step":4,"unit":"px"},
         {"type":"swatch","label":"Accent","var":"--card-accent","options":[
           {"label":"Fern","value":"#275c45"},{"label":"Ink","value":"#263b58"}
         ]}
       ]'>...</div>
</section>
```

For literal HTML, use `$UNSHIP check --readiness --json --root <comparison-directory>` as the lightweight handoff check. A `fail` needs correction; `uncertain` needs source or rendered verification. Keep the root focused on the consuming preview, not Unship's own source or test fixtures.

Tell the human to open Tune, adjust the controls, click a slider readout to reset it, and hold the option label (or press Enter while it is focused) to copy a keep instruction. Tuning is temporary browser state; it does not save source and resets on reload.

When the human pastes a keep instruction, apply the stated values to the retained source before removing temporary markup. Resolve named token/color choices to their declared CSS values; ask only if the instruction is ambiguous. Keep remaining explorations mounted until final cleanup is requested.

## Hidden Option Safety

Inactive options rely on `hidden`. Variant-specific CSS must not accidentally override hidden state. Be careful with option classes that set `display: grid`, `display: flex`, or `display: block`; if needed, preserve this local comparison guard near the relevant CSS:

```css
[hidden] { display: none !important; }
```

## Smooth Workflow Edges

- Report detected preview servers as hints instead of opening, navigating, or starting a browser.
- If no preview server is detected, tell the user to start the app the way they normally do.
- If `setup` returns manual instructions, patch only the smallest dev-only mount point or explain what still needs manual wiring.
- If an existing Unship exploration overlaps the requested target, or the user asks to ship, finish, or clean, ask what to keep or clean before changing it.
- If an existing Unship exploration is independent, or the user clearly asks for another round, report it briefly and proceed.
- If typecheck/build fails before your edits, report that baseline state and keep Unship changes isolated.

## Markup Contract

Wrap each temporary group with `data-unship-pick`. Put direct child choices inside with `data-unship-option`.

Do not build a custom switcher, segmented control, tab set, or app-level preference for Unship comparisons. The source alternatives are the product; the Unship picker toolbar is the comparison control.

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">...</div>
  <div data-unship-option="Proof-led" hidden>...</div>
</section>
```

If setup cannot patch the app automatically, inject the picker locally with `$UNSHIP snippet` or an equivalent dev-only script include.

## Human Comparison Handoff

Do not start, open, or automate a browser by default. The human compares alternatives in their own running preview.

Before stopping for human choice, report:

- the variant group label;
- the visible option labels;
- comparison-readiness checks run;
- whether picker setup was reused, changed, skipped, or not checked;
- any detected preview servers as hints only;
- cleanup status if existing Unship artifacts already exist.

If the human names a winner ambiguously, verify the selected group and option label before editing. Ambiguity includes multiple groups with the same label, repeated option labels, the user saying "the second one" after other changes, or overlapping active explorations.

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
