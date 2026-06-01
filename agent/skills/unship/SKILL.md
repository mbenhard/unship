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

Before reading package internals or searching `node_modules`, ask the CLI what is already true:

```bash
npx unship doctor --json
```

If the picker setup is missing, run:

```bash
npx unship setup --framework auto --json
```

Use the returned framework, picker path, and mount status. Only inspect Unship package files if these commands fail or the project has unusual setup needs.

If `doctor` reports `project.previewServers`, reuse an existing preview URL before starting a new dev server. Verify it is the right app or route, then continue there. Start a dev server only when no suitable preview is reachable.

## Brand read

Before authoring variants, inspect the existing UI source and, when possible, the rendered page. Identify components, tokens or utility classes, typography scale, spacing rhythm, layout density, copy tone, interaction patterns, and product constraints. Variants must be derived from that vocabulary unless the user explicitly asks to depart from it.

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
- Use subagent mode only as an authoring workflow when broad exploration helps.

## Inline Mode Safety

Inactive options must safely coexist in the DOM. Avoid duplicate active IDs, submit controls, global scripts, analytics triggers, autoplay media, focus traps, destructive side effects, and stateful providers. If unsafe, reduce scope or explain that inline mode is not suitable.

## Smooth Workflow Edges

- Reuse existing preview servers instead of opening another port.
- If the app is already running but on the wrong route, navigate rather than restarting it.
- If `setup` returns manual instructions, patch only the smallest dev-only mount point you can verify.
- If a previous Unship exploration is still present, ask which visible option to keep or clean it before creating a new group.
- If typecheck/build fails before your edits, report that baseline state and keep Unship changes isolated.

## Markup Contract

Wrap each temporary group with `data-unship-pick`. Put direct child choices inside with `data-unship-option`.

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">...</div>
  <div data-unship-option="Proof-led" hidden>...</div>
</section>
```

If setup cannot patch the app automatically, inject the picker locally with `npx unship snippet` or an equivalent dev-only script include.

## Subagent Mode

Subagents must not mutate the shared workspace in V1. They return briefs, sketches, file-specific recommendations, or patch-shaped proposals. The main agent edits source, normalizes options, applies the `data-unship-*` contract, and performs cleanup. If subagents are unavailable, simulate independent passes internally and implement the strongest 2-4 options.

## Cleanup

Cleanup is mandatory when exploration ends, including selection, cancellation, rejection, timeout, interruption, or ship request. Keep the selected option, remove losing options, remove all `data-unship-*` attributes, remove picker script/comments, then run:

```bash
npx unship check
```

Do not claim completion until the check is clean.

Do not invent lifecycle commands. The human chooses by naming the visible option in chat; the agent edits source and verifies cleanup.
