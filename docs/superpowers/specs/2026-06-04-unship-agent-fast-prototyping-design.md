# Unship Agent Fast Prototyping Design

**Date:** 2026-06-04
**Status:** Approved direction for planning

## Goal

Refactor Unship around quick agent-assisted UI prototyping without growing a heavy workflow product.

Unship should help an agent create temporary local UI choices in normal source, let the human compare them with the picker toolbar, then help the agent clean the preview artifacts before shipping. The highest-cost work is the agent's reasoning and source navigation, not the millisecond runtime cost of CLI commands. The design should therefore reduce agent uncertainty, search loops, and brittle cleanup work while keeping the command surface small.

## Product Shape

Unship remains a small local tool with three responsibilities:

1. Make the picker available in a local preview app.
2. Give the agent a fast, structured view of Unship state in the repo.
3. Verify that temporary Unship artifacts are removed before shipping.

The agent still performs creative authoring manually. It reads the app, writes variants, adapts to the design system, and chooses source-aware cleanup edits. Unship commands should not become an orchestration layer for design work.

Greenfield and existing-app work use the same model: code normally, and when comparison is useful, wrap temporary alternatives in the Unship markup contract.

## Principles

- Keep the browser runtime dependency-free and DOM-local.
- Keep commands boring, read-oriented, and useful to agents.
- Improve existing commands before adding new commands.
- Do not open or automate a browser by default; human comparison is the product.
- Do not impose rigid exploration limits such as a fixed file count. Instead, return enough structured context that the agent can decide when it has enough.
- Prefer read-only scanner intelligence over source-mutating cleanup automation.
- Avoid framework parser bloat unless a later design proves it is necessary and safe.

## Non-Goals

- No `prepare`, `wrap`, `keep`, `clean`, or session lifecycle command in this phase.
- No bridge server, daemon, browser-to-agent sync, token, persistent runtime session, or source swapper.
- No special greenfield mode.
- No command that tries to creatively generate variants.
- No cleanup mutator until scanner output and markup conventions have proven stable.

## Command Surface

The public commands remain:

```bash
unship install-skill
unship init
unship setup
unship snippet
unship doctor
unship check
```

The refactor changes the value of `doctor` and `check`, not the number of commands.

### `unship doctor --json`

`doctor` becomes the agent's startup state command. It should answer: "What is already true, and what should the agent do next?"

It reports:

- detected framework and setup signals;
- installed skill path and freshness;
- picker file path and freshness;
- dev mount path, if found;
- likely preview servers as hints only;
- existing Unship explorations;
- whether active exploration or final cleanup appears required;
- concise recommended next actions.

`doctor` is summary-only. It may reuse the same scan result as `check`, but it should not become the authoritative cleanup audit. Keep detailed cleanup diagnostics and shipping failure semantics in `check`.

`doctor --json` must preserve its current top-level compatibility fields: `ok`, `packageName`, `version`, `node`, `project`, `residue`, and `reminder`. New fields such as `unship` and `next` should be additive.

Example shape:

```json
{
  "ok": true,
  "project": {
    "framework": "next",
    "pickerFileFound": true,
    "pickerFileCurrent": true,
    "devMountFound": true,
    "previewServers": [
      {
        "url": "http://127.0.0.1:3000",
        "title": "Existing Preview"
      }
    ]
  },
  "unship": {
    "explorations": [
      {
        "pick": "Hero",
        "file": "src/app/page.tsx",
        "options": ["Current", "Proof", "Minimal"],
        "startLine": 42,
        "endLine": 118,
        "rangeConfidence": "high"
      }
    ],
    "activeExplorationCount": 1,
    "cleanupRequired": true
  },
  "next": [
    "Ask which Hero option to keep before creating another exploration."
  ]
}
```

### `unship check --json`

`check` remains the shipping guard, but its JSON output becomes source-aware enough to speed manual cleanup.

It reports:

- existing explorations with group labels, files, option labels, and rough line ranges;
- uncertain option labels and uncertain ranges when the scanner cannot confidently classify them;
- diagnostics for remaining `data-unship-*`, picker script references, and Unship comments;
- allowed documentation/instruction files excluded from cleanup diagnostics;
- a concise message suitable for agent handoff.

`check` should remain read-only.

Example shape:

```json
{
  "ok": false,
  "explorations": [
    {
      "pick": "Pricing",
      "file": "src/components/Pricing.tsx",
      "options": ["Current", "Enterprise", "Usage"],
      "startLine": 18,
      "endLine": 96,
      "rangeConfidence": "high",
      "uncertainOptions": []
    }
  ],
  "diagnostics": [
    {
      "file": "src/components/Pricing.tsx",
      "line": 18,
      "column": 10,
      "pattern": "data-unship-pick",
      "message": "Remove temporary Unship picker markup before shipping."
    }
  ]
}
```

### `unship setup --json`

`setup` stays thin:

- detect common frameworks;
- copy or refresh the picker file;
- patch a safe dev-only mount point when obvious;
- return manual instructions when the app shape is unusual.

It should not search widely for target UI sections or create variant scaffolds.

## Scanner Design

Add a structured scanner layer used by both `doctor` and `check`.

The scanner should walk supported source files, skip build/cache directories, and detect:

- `data-unship-pick` groups;
- direct `data-unship-option` labels when confidently detectable;
- uncertain option-like labels when direct-child structure is unclear;
- picker script references;
- Unship comments.

The first version can use conservative text scanning rather than AST parsers. It should not need to perfectly understand every framework. Its job is to give the agent a useful map, not to perform edits.

Line ranges can be approximate. A good initial heuristic:

1. Record the line containing `data-unship-pick`.
2. Track subsequent lines until a likely matching closing tag at equal-or-lower indentation or a bounded scan limit.
3. Do not use a nested `data-unship-pick` as proof that the parent group ended; nested groups are allowed inside visible options.
4. Collect literal option labels inside the likely group range.
5. If range detection is uncertain, omit `endLine` or set `rangeConfidence: "low"` rather than pretending to know.
6. If an option label is dynamic or the direct-child relationship is unclear, include it in `uncertainOptions` instead of `options`.

The scanner must preserve the current cleanup guarantee: if forbidden preview artifacts remain in application source, `check` exits nonzero.

Use one shared scan result to feed both compatibility diagnostics and structured exploration summaries. Do not walk the same project twice in a single command just to produce old and new JSON shapes.

## Skill Workflow

The installed Unship skill should become more decisive and less open-ended.

Startup:

1. Choose the CLI prefix once. If `./node_modules/.bin/unship` exists, prefer it. Otherwise use `npx unship` when the package is installed, or `npx -y unship@latest` as the fresh-repo fallback.
2. Run one startup command: `$UNSHIP doctor --json`.
3. If no app source, framework signal, or preview shell exists yet, build the app normally first and defer setup until there is a local shell to mount the picker into.
4. If setup is missing or stale in an existing app shell, run `$UNSHIP setup --framework auto --json`.
5. If an existing exploration overlaps the requested target or the user asked to ship/finish/clean, ask which visible option to keep or whether to clean it before creating another overlapping exploration.
6. If existing explorations are independent, or the user clearly asks for another round, report them briefly and proceed.
7. Otherwise, inspect the named route, component, or source area first. Expand to immediate shared components, tokens, styles, and copy context only when the target is unresolved or local design patterns are unclear.

Authoring:

- Treat greenfield and existing-app requests the same from Unship's perspective.
- Use normal app code and normal design judgment.
- Add `data-unship-pick` and direct-child `data-unship-option` only where comparison helps.
- Keep labels short and human-visible.
- Do not build custom tabs, switches, segmented controls, or app settings for Unship comparison.
- Do not open or automate a browser by default.
- Use detected preview servers only as hints for the human.

Handoff:

- Report the group label, option labels, setup status, and preview hints.
- Tell the human to compare in their running preview.
- Do not judge the visual winner for the human unless explicitly asked.

Cleanup:

- Settling a group: when the user names a winner for one exploration while continuing to prototype, manually keep that option's source, remove losing options for that group, and remove `data-unship-*` attributes from the settled source. Keep the picker mount if more exploration is still active or expected.
- Final cleanup: when the user asks to ship, finish, cancel, or clean all Unship work, remove all losing choices, all `data-unship-*` attributes, picker mounts, and Unship comments.
- Run `$UNSHIP check --json` for final cleanup.
- Use structured `check` output to find anything missed.
- Do not claim final cleanup is complete until `check` is clean.

## Error Handling

- If `doctor` fails because the CLI is unavailable, fall back to the documented `npx -y unship@latest doctor --json` path.
- If setup returns manual instructions, the agent may patch the smallest dev-only mount point itself.
- If scanner output is partial or uncertain, the command should still return diagnostics and mark uncertain fields explicitly.
- If full cleanup checking finds artifacts but no structured exploration, diagnostics remain the source of truth.
- Treat active explorations and shipping residue separately. Picker files or dev mounts can be residue for final cleanup, but only `data-unship-pick` groups should block a new overlapping exploration.

## Testing Strategy

Add focused tests for:

- `check --json` returns existing explorations with option labels and line ranges.
- `doctor --json` includes the same exploration summary.
- allowed docs and installed skill files remain excluded from cleanup diagnostics.
- scanner handles multiple groups in one file.
- scanner handles duplicate group labels without dropping either group.
- scanner handles JSX, HTML, Astro, Vue, and Svelte-like attribute syntax at the text level.
- scanner marks dynamic labels, unclear direct-child relationships, and uncertain ranges without false precision.
- `doctor --json` and `check --json` preserve current top-level fields while adding structured Unship fields.
- plain output remains concise and backwards compatible enough for humans.
- setup behavior remains unchanged for supported frameworks.

Do not add browser tests for scanner behavior. The scanner is a source tool, not runtime UI.

## Migration

This is a compatible refactor:

- Existing markup contract remains unchanged.
- Existing commands remain available.
- Existing `check` behavior remains nonzero on residue.
- JSON output gains fields but should not remove current top-level fields without a deliberate follow-up.
- README and bundled skill should be updated after the scanner behavior lands.

## Open Follow-Up

No cleanup mutator belongs in this product phase. Any future cleanup mutator requires a separate spec, evidence from real cleanup failures, and a design that avoids increasing parser, runtime, or framework dependency weight.
