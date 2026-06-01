# Unship Instant Picker Technical Spec

**Date:** 2026-06-01  
**Status:** Build-ready technical spec derived from `2026-06-01-unship-instant-picker-prd.md`.  
**Implementation state:** Clean-slate. The retired patch-session code is archived outside this folder.

## Objective

Build Unship V1 as a tiny local-only design picker:

1. Agents temporarily add `data-unship-*` variant markup to real app source.
2. A standalone browser script discovers those variants.
3. The user switches variants instantly with DOM-local visibility changes.
4. The user tells the agent in chat which visible title to keep.
5. The agent removes every Unship preview artifact and runs `npx unship check`.

There is no bridge, server, session store, token, source patch engine, confirm button, wait loop, or reload-based switching.

## Package Contract

Published package name: `unship`

Development package may expose aliases, but public docs and tests target:

```bash
npx unship init
npx unship setup
npx unship snippet
npx unship check
npx unship doctor
```

Package rules:

- Node >= 20.
- ESM.
- Browser picker has zero runtime dependencies.
- CLI has zero production dependencies.
- Dev dependencies are allowed for tests only.
- Packed package includes only README, LICENSE, package metadata, `src/`, and `agent/`.
- Picker script budget: under 12 KB unminified.
- Packed package budget: under 25 KB, excluding README and LICENSE if the pack tool reports them separately.

## File Map

```txt
README.md
LICENSE
package.json
agent/
  AGENTS.md
  skills/
    unship/
      SKILL.md
src/
  agent/
    index.js
  check/
    index.js
  cli/
    index.js
  setup/
    index.js
  picker/
    unship-picker.js
test/
  check.test.js
  cli.test.js
  picker-browser.test.js
  picker-dom.test.js
  package-smoke.test.js
```

Responsibilities:

- `src/picker/unship-picker.js`: standalone IIFE browser runtime and toolbar.
- `src/check/index.js`: residue scanner used by CLI and tests.
- `src/setup/index.js`: framework detection, picker copy, and thin dev-mount patching.
- `src/agent/index.js`: reads and renders agent instruction templates.
- `src/cli/index.js`: small command router for `init`, `setup`, `snippet`, `check`, and `doctor`.
- `agent/skills/unship/SKILL.md`: portable full workflow body.
- `agent/AGENTS.md`: short project pointer, not the full workflow.
- `test/picker-dom.test.js`: fast unit-style browser-runtime checks in a controlled page.
- `test/picker-browser.test.js`: real-browser desktop/mobile smoke tests.
- `test/check.test.js`: scanner behavior.
- `test/cli.test.js`: command behavior and install targets.
- `test/package-smoke.test.js`: packed package contents and size.

## Source Markup Contract

Agents create groups with `[data-unship-pick]`. Direct child options use `[data-unship-option]`.

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">
    ...
  </div>
  <div data-unship-option="Proof-led" hidden>
    ...
  </div>
</section>
```

Rules:

- A group is any element with `data-unship-pick`.
- An option is a direct child of a group with `data-unship-option`.
- Nested option elements do not count for the parent group unless they are direct children of a nested group.
- Group labels are display labels. Identity is element identity plus DOM order.
- Duplicate labels are allowed. The toolbar disambiguates by order or nearby context.
- Missing option labels display as `Option 1`, `Option 2`, etc.
- Each group must have exactly one visible option after the picker initializes.

## Picker Runtime

The picker is a single self-executing browser script.

Global behavior:

- install once as `window.__unshipPicker`;
- attach one Shadow DOM toolbar;
- perform no network calls;
- never reload the page;
- never write source;
- never use eval;
- never require a framework;
- use memory-only selection by default;
- enable localStorage only when the script has `data-unship-persist="local"`;
- support `destroy()` for tests and repeated local injection.

Discovery:

- Query `[data-unship-pick]`.
- For each group, collect direct children where `child.hasAttribute("data-unship-option")`.
- Skip groups with no options.
- Choose default active option:
  1. first option without `hidden` and without computed `display: none`;
  2. otherwise first option.
- Coalesce mutation re-scans with `requestAnimationFrame`.
- Use one `MutationObserver` watching `{ childList: true, subtree: true, attributes: true, attributeFilter: ["data-unship-pick", "data-unship-option", "hidden"] }`.

Switching:

- Only touch options in the active group.
- Hiding an option sets `hidden = true` and `style.display = "none"`.
- Showing an option sets `hidden = false` and restores the option's original inline display value.
- Store original inline display in a `WeakMap<Element, string>`.
- Do not alter non-option content in the group.
- If focus is inside the outgoing option, move focus to the incoming option when focusable, otherwise to the toolbar label button.
- Announce switches through an `aria-live="polite"` node.

State:

- Maintain an array of group records in DOM order.
- Maintain `activeGroupIndex`.
- Maintain selected option per group in a `WeakMap`.
- When persistence is enabled, persist by page path plus group DOM order and label. Persistence is best-effort; it must never block initialization.

Public debug/test API:

```js
window.__unshipPicker = {
  version: "0.1.0",
  rescan(),
  destroy(),
  getState()
}
```

`getState()` returns serializable state:

```js
{
  groups: [
    {
      label: "Hero",
      displayLabel: "Hero",
      activeOptionIndex: 1,
      options: ["Current", "Proof-led"]
    }
  ],
  activeGroupIndex: 0,
  toolbarMode: "single"
}
```

## Toolbar Specification

General:

- fixed overlay, default bottom-center;
- respects safe-area insets;
- top-center fallback when bottom placement would obscure focused host controls;
- Shadow DOM styles only;
- no page-level CSS pollution;
- title-only visible labels;
- no confirm/checkmark;
- no pending/protocol/session language;
- no descriptions in visible chrome;
- adaptive light/dark material;
- opaque fallback when blur/transparency is unsupported or low contrast;
- no page variant animation;
- only subtle toolbar state motion, 100-160 ms max;
- reduced motion removes transitions.

One group mode:

```txt
‹ Hero: Proof-led ›
```

Controls:

- previous button;
- label button;
- next button.

Accessible label:

```txt
Hero, Proof-led, option 2 of 4
```

Multiple group mode:

```txt
Hero 2/4
‹ Proof-led ›
```

Controls:

- group selector button;
- previous option button;
- option label button;
- next option button;
- popover/menu of groups and selected option labels.

Keyboard:

- Arrow keys operate only while toolbar focus is inside the picker.
- Left/right switches option.
- Up/down switches active group only when multiple groups exist and toolbar focus is inside the picker.
- Enter has no confirm behavior.
- Native Enter/Space still activate focused buttons.
- Escape closes group menu or returns focus to page.
- Optional global shortcuts are disabled in V1 unless explicitly enabled by script attribute.

Accessibility:

- toolbar root has an accessible name;
- controls are real buttons;
- if `role="toolbar"` is used, use roving focus behavior consistent with WAI-ARIA toolbar guidance;
- focus-visible outlines are clear against arbitrary host pages;
- live region announces current selection;
- inactive variants use `hidden` so they leave the accessibility tree.

## CLI Specification

### `unship init`

Installs local agent instructions.

Flags:

- `--target codex|antigravity|claude|opencode|all`
- `--force`
- `--json`

Default target:

- `.agents/skills/unship/SKILL.md`

Target output:

- `codex`: `.agents/skills/unship/SKILL.md` and optional short `AGENTS.md` pointer if none exists.
- `antigravity`: `.agents/skills/unship/SKILL.md`.
- `claude`: `.claude/skills/unship/SKILL.md` and `CLAUDE.md` importing `@AGENTS.md` when useful.
- `opencode`: `.opencode/skills/unship/SKILL.md` and `.opencode/commands/unship.md`.
- `all`: the shared Codex/Antigravity skill target plus Claude and OpenCode outputs.

Write rules:

- Create directories as needed.
- Do not overwrite existing files unless `--force` is present.
- JSON output includes `{ ok, written, skipped }`.
- Plain output is concise and agent-readable.

### `unship snippet`

Prints a temporary picker snippet.

Flags:

- `--src <path-or-url>` default `/unship-picker.js`
- `--persist local`
- `--global-shortcuts`
- `--inline`
- `--json`

Default output:

```html
<script src="/unship-picker.js" data-unship-dev></script>
```

`--inline` prints the picker script in a `<script>` tag for local experiments. It is not the recommended production path because Unship artifacts should be removed before shipping.

### `unship setup`

Copies the picker into the app and adds a dev-only mount when the framework can be patched predictably.

Flags and forms:

- `unship setup`
- `unship setup --framework auto`
- `unship setup next|vite|astro|sveltekit|nuxt|angular|universal`
- `--force`
- `--dry-run`
- `--json`
- `--root <path>`
- `--ports <comma-separated ports>` for custom preview probing in tests or unusual apps

Detection order:

1. Next.js
2. Nuxt
3. SvelteKit
4. Astro
5. Angular
6. Vite
7. Universal fallback

Adapter rules:

- Next.js: copy to `public/unship-picker.js`, patch `app/layout.*` or `src/app/layout.*` with a `process.env.NODE_ENV === "development"` `next/script` mount.
- Vite: copy to `public/unship-picker.js`, patch `index.html` with an `import.meta.env.DEV` module block that creates a script element for `/unship-picker.js`. Do not dynamic-import the public file.
- Astro: copy to `public/unship-picker.js`, patch a common layout when present; otherwise return manual instructions.
- SvelteKit: copy to `static/unship-picker.js`, create `src/hooks.client.ts` only when absent; otherwise return manual instructions.
- Nuxt: copy to `public/unship-picker.js`, create `plugins/unship.client.ts` only when absent; otherwise return manual instructions.
- Angular: copy to `src/assets/unship-picker.js` and return manual localhost-only mount instructions.
- Universal: copy to `public/unship-picker.js` and return manual snippet instructions.

All setup actions must be idempotent. Re-running setup must not duplicate imports, scripts, hooks, or plugin files.

### `unship check`

Scans for forbidden preview artifacts.

Flags:

- `--json`
- `--include-build`
- `--root <path>`

Forbidden patterns:

- `data-unship-pick`
- `data-unship-option`
- `unship-picker`
- `<!-- unship`
- generated local marker prefixes listed by the implementation

Default ignores:

- `.git`
- `node_modules`
- package manager stores
- `.unship`
- `.superpowers`
- coverage
- cache directories
- generated build output, unless `--include-build` is present

Allowed documentation/instruction paths:

- `docs/**`
- `agent/skills/unship/SKILL.md`
- `.agents/skills/unship/SKILL.md`
- `.claude/skills/unship/SKILL.md`
- `.opencode/skills/unship/SKILL.md`
- `.opencode/commands/unship.md`
- `AGENTS.md`
- `CLAUDE.md`

Extensions scanned:

- `.html`
- `.htm`
- `.js`
- `.jsx`
- `.ts`
- `.tsx`
- `.vue`
- `.svelte`
- `.astro`
- `.mdx`
- common template extensions: `.liquid`, `.hbs`, `.handlebars`, `.njk`, `.ejs`

JSON output:

```js
{
  ok: false,
  diagnostics: [
    {
      file: "src/App.jsx",
      line: 12,
      column: 10,
      pattern: "data-unship-pick",
      message: "Remove temporary Unship picker markup before shipping."
    }
  ]
}
```

### `unship doctor`

Prints package name, version, Node version, detected framework, skill installation status, whether installed skills are current, picker file status, whether the picker file matches the current package, dev mount status, likely live preview servers, residue diagnostics, and a short local-only reminder.

## Agent Instruction Specification

The portable skill is the primary workflow artifact.

`SKILL.md` must include:

- `name: unship`
- description that triggers on comparing UI variants, design directions, page/component iteration, picker previews, and cleanup;
- brand-read step;
- instruction precedence stack;
- default 2-4 meaningful variants;
- explicit count override behavior;
- current-vs-alternatives semantics;
- inline mode rules;
- unsafe inline target fallback;
- subagent mode proposal-only rules;
- subagent-unavailable fallback;
- local-only cleanup rules;
- fast start through `npx unship doctor --json` and `npx unship setup --framework auto --json`;
- explicit use of `npx unship`, not a bare `unship` command that may be absent from PATH;
- stale install recovery through `skillCurrent` and `pickerFileCurrent`;
- reuse of `doctor`-reported preview servers before starting new dev servers;
- natural prompt parsing for requests like `use unship to generate 4 variants for hero section`;
- `npx unship check` verification before final response.

`AGENTS.md` pointer must stay short:

```md
# Agent Notes

When comparing temporary UI design variants, use the Unship skill. Keep Unship picker markup local-only and run `npx unship check` before shipping.
```

OpenCode command shim:

```md
---
description: Create temporary local UI variants with Unship
---

Use the Unship skill for this request. Interpret arguments as the target, count, style, or scope: $ARGUMENTS
```

Claude memory pointer:

```md
@AGENTS.md

Use `/unship` or the `unship` skill for temporary local UI variant comparison.
```

## Verification Gates

Every implementation batch must keep these commands green:

```bash
npm run check
npm test
npm pack --dry-run
```

Required test areas:

- one group default visibility;
- all-hidden fallback;
- missing labels;
- direct-child-only option discovery;
- independent multi-group selections;
- duplicate group labels;
- MutationObserver re-scan;
- singleton load and destroy;
- no fetch, XHR, mutation endpoint, or reload during switching;
- keyboard guards;
- focus handling when hiding focused option;
- aria-live switch announcements;
- desktop and mobile toolbar fit;
- reduced motion;
- reduced transparency / opaque fallback;
- check residue detection;
- init targets and no-overwrite behavior;
- packed package size and file list.

## Implementation Constraints

- Prefer plain JavaScript over abstractions.
- Keep the picker in one readable file.
- Keep CLI modules small and direct.
- Do not add runtime dependencies.
- Do not reintroduce old command names: `start`, `variant`, `bridge`, `decision`, `finalize`, `abort`.
- Do not keep old source under active `src/`, `test/`, `agent/`, `examples/`, or `prototypes/`.
- Do not write docs that imply production use of the picker.
