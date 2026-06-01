# Unship Instant Picker PRD

**Date:** 2026-06-01  
**Status:** Canonical PRD for the hard-reset product direction.  
**Supersedes:** the 2026-05-31 patch-session PRD and execution plan, now archived at `/Users/marcusbenhard/Development/Playground/unship-design-legacy-archive-2026-06-01`.

## Research Baseline

This PRD was updated after subagent review and online research across current agent harness docs and interface guidance.

Primary references:

- Agent Skills standard: `https://agentskills.io/`
- Codex skills: `https://developers.openai.com/codex/skills`
- Codex `AGENTS.md`: `https://developers.openai.com/codex/guides/agents-md`
- Codex app and CLI commands: `https://developers.openai.com/codex/app/commands`, `https://developers.openai.com/codex/cli/slash-commands`
- Claude Code memory and skills: `https://code.claude.com/docs/en/memory`, `https://code.claude.com/docs/en/slash-commands`
- OpenCode skills and commands: `https://dev.opencode.ai/docs/skills`, `https://dev.opencode.ai/docs/commands`
- Apple Human Interface Guidelines: materials, accessibility, buttons, keyboards, motion, and layout
- WAI-ARIA toolbar pattern: `https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/`
- WCAG 2.2 focus-not-obscured and target-size guidance

The combined direction is: use `SKILL.md` as the portable workflow artifact, keep standing project instructions short, avoid harness-specific lock-in, make subagents proposal-only, and treat the picker as a high-polish local control that never steals control from the host app.

## One-Line Product

Unship is a tiny local design picker that lets agents place temporary on-brand UI variants in real source, lets humans switch them instantly in the browser, and then guides the agent to keep the chosen option and remove every trace of Unship before shipping.

## Product Thesis

The product is not a patch engine, source swapper, bridge server, visual canvas, framework-specific runtime, or persistent project dependency. Thin setup adapters may detect common stacks, copy the picker, and add a dev-only mount when that can be done safely.

Unship is a local design lens:

1. The agent creates temporary alternatives in the real app source.
2. The app renders those alternatives as normal HTML.
3. A tiny picker script discovers the alternatives and toggles visibility instantly.
4. The human compares variants in the browser.
5. The human tells the agent which option to keep in chat.
6. The agent removes losing options, removes Unship markup, and verifies cleanup.

The expensive work happens before preview. Switching is instant because no files are written, no server is contacted, and no page reload happens while the human compares.

## Non-Negotiable Goals

- **Instant feel:** switching variants must be DOM-local and perceptibly immediate.
- **Lightweight code:** few files, no bloated runtime, no daemon, no session store.
- **Easy install:** one command or one Unship agent invocation should be enough to initialize instructions and wire a local preview when the framework is recognized.
- **Universal runtime:** works anywhere that renders HTML.
- **Local-only by default:** Unship markup and picker code must not reach production unless the user explicitly keeps them.
- **Agent-native:** the agent does setup, authoring, cleanup, and verification.
- **On-brand variants:** instructions teach agents to study and preserve the current app's visual language by default.
- **Flexible exploration:** inline mode for fast focused work; subagent mode for broader ideation.
- **Sleek toolbar:** compact, title-only, minimalist, no debug/protocol language.
- **No confirm workflow:** the human simply tells the agent in chat what to keep.

## Explicit Non-Goals

- No bridge server.
- No local token.
- No `decision wait`.
- No checkmark or confirm button.
- No copied handoff.
- No source patch/session engine.
- No finalize/abort commands.
- No HMR or reload dependency.
- No required framework helpers.
- No built-in subagent orchestration.
- No hardcoded design styles in agent instructions.

## Core Model

The canonical Unship interface is temporary HTML attributes.

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">
    ...
  </div>

  <div data-unship-option="Proof-led" hidden>
    ...
  </div>

  <div data-unship-option="Editorial" hidden>
    ...
  </div>
</section>
```

The picker treats each `[data-unship-pick]` element as a variation group. Direct descendant `[data-unship-option]` elements are options for that group.

The attribute contract is the product foundation. Framework helpers may exist later, but they must compile or render to this same contract and must never be required.

## Runtime Behavior

The runtime is a single browser script, `unship-picker.js`.

It must:

- discover all `[data-unship-pick]` groups;
- discover direct `[data-unship-option]` children per group;
- ensure each group has exactly one visible option;
- switch options with `hidden` and `display: none`;
- preserve independent selections for multiple groups;
- keep selections in memory by default;
- use `localStorage` only when explicitly enabled through a script attribute or init option;
- use a light `MutationObserver` to survive framework re-renders;
- re-scan when groups or options are added, removed, or relabeled;
- avoid all network calls;
- avoid page reloads;
- avoid blocking host-app interactions;
- install as a singleton if loaded more than once.

The runtime must never persist selections by default. Temporary labels and exploration state should disappear on reload unless the user or agent explicitly enables persistence for a longer comparison session.

Suggested persistence control:

```html
<script src="/unship-picker.js" data-unship-persist="local"></script>
```

The default visible option is:

1. the first non-hidden option, if one exists;
2. otherwise the first option in the group.

When switching, the script hides all sibling options in the active group and shows only the selected option. It must not alter non-option content inside the group.

## Multiple Groups

Multiple independent pickers must work on the same page.

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">...</div>
  <div data-unship-option="Proof-led">...</div>
</section>

<section data-unship-pick="Pricing">
  <div data-unship-option="Simple">...</div>
  <div data-unship-option="Detailed">...</div>
</section>
```

The runtime tracks:

- active group;
- selected option per group;
- option count per group.

Group identity is not label-only. Internally, groups are identified by element identity and DOM order. Labels are display names. If duplicate labels exist, the toolbar must disambiguate with order or local context, for example `Hero 1` and `Hero 2`, without changing the underlying source labels.

V1 does not need linked presets where one toolbar option changes several groups at once. That may be considered later.

## Toolbar UX

The toolbar is a tiny local control for preview only. It should feel like a design instrument, not a developer panel.

Global rules:

- title-only variant labels;
- no long descriptions;
- no confirm/checkmark;
- no pending state;
- no protocol wording;
- no session IDs;
- no source or patch language;
- compact fixed bottom positioning;
- strong mobile fit;
- keyboard and pointer friendly;
- reduced-motion support.
- adaptive light/dark material;
- solid contrast fallback when blur or transparency is unavailable or inappropriate;
- `prefers-reduced-transparency` and `prefers-reduced-motion` support where available;
- no decorative glow, bounce, shimmer, or celebratory motion.

Glass is a functional overlay material, not decoration. It exists to keep the picker compact while preserving context. If the current page background makes the label hard to read, the toolbar must become more opaque.

The toolbar must use real controls, not clickable text. Controls need hover, press, disabled, and focus-visible states. The visible pill can be visually small, but the interactive targets should be generous: 44 by 44 CSS pixels preferred, with WCAG 2.2 24 by 24 CSS pixels as the absolute minimum when spacing is sufficient.

### One Group

When the page has one `[data-unship-pick]` group, use a single glass pill.

```txt
‹ Hero: Proof-led ›
```

This is the most magical path and should be the visual default.

Interaction contract:

- bottom-center by default, respecting safe-area insets;
- three hit zones: previous button, label/group button, next button;
- visible label format: `Hero: Proof-led`;
- accessible label format: `Hero, Proof-led, option 2 of 4`;
- no visible descriptions;
- no confirmation action.

### Multiple Groups

When the page has more than one group, use a two-line mini dock.

```txt
Hero 2/4
‹ Proof-led ›
```

The group title gives section context. The variant row stays compact and title-only.

The group title row is a compact selector with a chevron or equivalent affordance. Opening it shows a small menu of groups and their currently selected option. The option row remains title-only.

The toolbar should let the user change active group with the compact selector or keyboard controls. The PRD does not require a large visible list.

### Keyboard

Keyboard behavior must feel helpful, not invasive.

Default keyboard behavior:

- arrow shortcuts operate when picker focus is inside the toolbar;
- left/right switches option in the active group;
- up/down switches active group only when multiple groups exist and the toolbar owns focus;
- Enter has no confirm meaning;
- focused buttons/selectors still support native Enter/Space activation;
- Escape closes the group menu or returns focus to the page.

Optional global shortcuts may exist later, but must be opt-in. They must not fire while focus is in:

- input;
- textarea;
- select;
- contenteditable;
- an element inside `[data-unship-ignore-shortcuts]`;
- an element inside `[role="application"]`.

Global shortcuts must not call `preventDefault` for up/down page scroll unless the picker owns focus.

### Accessibility And Focus

The picker must be accessible enough to use during real product work, not merely pass a smoke test.

Requirements:

- picker container has an accessible name;
- controls are real buttons or native controls;
- if using `role="toolbar"`, follow WAI-ARIA toolbar focus behavior;
- switching updates a hidden `aria-live="polite"` region;
- inactive options use `hidden`;
- if focus is inside the outgoing option, move focus to the newly visible option container or back to the picker;
- the picker must not trap focus;
- verify contrast over arbitrary host-app backgrounds;
- avoid covering focused host controls, especially with sticky bottom placement;
- allow top-center fallback when bottom placement is crowded or a mobile keyboard changes the viewport.

## Local-Only Requirement

Unship must default to local-only temporary use.

The picker script and variation markup are not intended to ship. The product must make cleanup obvious and verifiable.

The agent should temporarily add:

- the picker script;
- `data-unship-pick` groups;
- `data-unship-option` options;
- optional `<!-- unship ... -->` markers around injected script or scaffolding.

After the human chooses, cancels, rejects the exploration, asks to ship, times out, or interrupts the flow, the agent must:

1. keep the selected option's real source;
2. remove all losing options;
3. remove all `data-unship-*` attributes;
4. remove the picker script;
5. remove Unship comments or markers;
6. run `npx unship check`;
7. report clean verification.

Production builds should contain no Unship artifacts unless the user explicitly asks to keep them. Installed agent instructions are allowed to remain; preview artifacts are not.

## CLI Scope

The CLI exists to make agent setup and cleanup reliable. It must stay small.

The public npm package should be named `unship` for V1 so `npx unship ...` works as written. During development, `unship-design` may expose a `unship` bin as a transitional alias, but public docs and acceptance tests should target the final package name.

### `npx unship init`

Installs or updates local agent instructions.

Supported targets:

- `--target codex`
- `--target claude`
- `--target opencode`
- `--target all`
- default portable target when omitted

Default portable output:

- `.agents/skills/unship/SKILL.md`

Harness-specific optional outputs:

- Claude: `.claude/skills/unship/SKILL.md`
- Claude project memory pointer: `CLAUDE.md` importing `@AGENTS.md` when useful
- OpenCode skill: `.opencode/skills/unship/SKILL.md`
- OpenCode slash command shim: `.opencode/commands/unship.md`
- Project pointer: `AGENTS.md`

`AGENTS.md` and `CLAUDE.md` should be short pointers, not the full Unship procedure. The full workflow belongs in `SKILL.md` so it loads on demand instead of bloating standing context.

Codex should use `.agents/skills/unship/SKILL.md` as the portable project skill path. Do not default to `.codex/skills`.

It must not start a daemon or create session state.

### `npx unship setup`

Sets up the smallest local preview mount for the current app.

Supported invocation:

- `npx unship setup`
- `npx unship setup --framework auto`
- `npx unship setup next`
- `npx unship setup vite`
- `npx unship setup astro`
- `npx unship setup sveltekit`
- `npx unship setup nuxt`
- `npx unship setup angular`

Setup rules:

- detect the framework from `package.json` and common config files when `auto` is used;
- copy the picker to the framework's static asset directory;
- patch only small, predictable dev-only mount points;
- return manual instructions instead of guessing when the mount point is ambiguous;
- be idempotent so agents can run it before exploration without creating duplicates;
- never create a daemon, session state, bridge, or source variant engine.

### Agent Invocation Naming

Unship should support the following user experiences:

- `/unship` where the harness supports slash skills or custom slash commands;
- `$unship` in Codex-style skill invocation;
- natural language, for example `Use Unship to compare three pricing directions`;
- CLI setup through `npx unship init` and local app wiring through `npx unship setup`.

Slash commands should be thin shims that invoke the skill. They should not duplicate the workflow body.

### `npx unship snippet`

Prints a picker script tag or inline snippet for temporary injection.

The output should be easy for agents to insert before `</body>` or through a local dev-only preview harness.

### `npx unship check`

Scans source for leftover Unship artifacts.

It must fail if it finds:

- `data-unship-pick`;
- `data-unship-option`;
- `unship-picker`;
- `<!-- unship`;
- other known generated local markers that should not ship.

The output must include file paths and concise suggested agent actions.

Default scan rules:

- scan application source and production build inputs;
- ignore `.git`, `node_modules`, package-manager stores, `.unship`, `.superpowers`, coverage, cache, and generated build output by default;
- optionally scan build output with `--include-build`;
- scan common UI extensions: `.html`, `.htm`, `.js`, `.jsx`, `.ts`, `.tsx`, `.vue`, `.svelte`, `.astro`, template files, and framework route files;
- do not fail on installed instruction files such as `.agents/skills/unship/SKILL.md`, `.claude/skills/unship/SKILL.md`, `.opencode/skills/unship/SKILL.md`, `.opencode/commands/unship.md`, `AGENTS.md`, or `CLAUDE.md` merely because they document the contract.

### `npx unship doctor`

Small diagnostic command for agent fast paths:

- package name;
- version;
- Node version;
- detected framework;
- installed skill status;
- picker file status;
- dev mount status;
- likely live preview servers on common framework ports;
- cleanup residue diagnostics;
- short reminder that Unship is local preview tooling.

## Agent Flow

The human should be able to ask naturally:

```txt
/unship create 4 hero variants
```

or:

```txt
Use Unship to try a few better pricing section directions.
```

The agent should:

1. inspect the existing source and design system;
2. run `npx unship doctor --json`, reuse a reported preview server when suitable, and run `npx unship setup --framework auto --json` when setup is missing;
3. identify the target files and preview URL;
4. create temporary variants using the attribute contract;
5. tell the user to compare in the browser;
6. wait for the user to say which option to keep in chat;
7. keep the chosen source and remove every other option;
8. remove picker/script/attributes/markers;
9. run `npx unship check`;
10. summarize the final kept direction.

The user should not need to run commands.

### Brand Read

Before authoring variants, the agent must inspect the existing UI source and, when possible, the rendered page. It should identify:

- components and design-system primitives;
- tokens, utility classes, or CSS variables;
- typography scale;
- spacing rhythm;
- layout density;
- copy tone;
- interaction patterns;
- explicit brand/product constraints.

Variants must be derived from that vocabulary unless the user explicitly asks to depart from it.

### Instruction Precedence

Agent instructions must use this precedence order:

1. the user's explicit request for count, style, scope, or temporary retention;
2. safety and local-only cleanup requirements;
3. the app's existing design system and implementation constraints;
4. Unship's default preferences.

When these conflict, the agent should explain the tradeoff briefly and choose the smallest safe interpretation.

## Smart Defaults For Agent Instructions

Agent instructions should be smart defaults, not rigid product constraints.

Default behavior:

- create 2-4 meaningful variants;
- preserve the current brand, tone, components, spacing, typography, and interaction patterns;
- keep variants comparable in scope;
- label variants with short titles;
- prefer focused changes over broad rewrites;
- use inline mode for focused work;
- use subagent mode for broad exploration;
- cleanup immediately after selection.

If the user asks for `N` variants, interpret that as `N` choices shown in the picker unless they explicitly say `N alternatives plus current`. Include the current version as an option only when comparison against the baseline is useful, and label it `Current`.

Override behavior:

- if the user asks for a specific count, use that count;
- if the user asks for a specific style, explore that style;
- if the user asks for wild exploration, create wider variants;
- if the user asks to keep Unship markup temporarily, do so and make the risk explicit;
- if the target area cannot safely host inline alternatives, explain the limitation and propose a smaller target.

The instructions should teach the agent to read the app, not impose stock aesthetics. Avoid hardcoded design direction prompts such as "make it SaaS," "make it luxury," "make it colorful," "make it editorial," or other taste presets unless the user asked for them.

Variant labels should describe the design problem or direction in 1-3 words, ideally under 18 characters, for example `Current`, `Denser`, `More Visual`, `Shorter Copy`, or labels derived from the user's own words. Examples are not defaults.

## Inline Mode

Inline mode is the default.

Use it when:

- one section or component is being explored;
- the change fits naturally in one source area;
- variants can coexist temporarily in the rendered DOM;
- the user wants speed.

The agent creates all variants directly in source and wraps them with `data-unship-option`.

Inline mode is allowed only when inactive options can safely coexist in the DOM. Avoid inline alternatives that duplicate:

- active IDs;
- submit controls;
- global scripts;
- analytics triggers;
- autoplay media;
- focus traps;
- destructive side effects;
- stateful providers.

If the target is not safe for hidden DOM coexistence, the agent should reduce scope, isolate only presentational markup, or tell the user inline mode is not suitable for that target.

## Subagent Mode

Subagent mode is an authoring workflow, not runtime orchestration.

Use it when:

- exploration should be broader;
- the target is high-stakes;
- distinct creative directions would benefit from independent thinking;
- the user explicitly asks for subagents or many alternatives.

Flow:

1. Main agent writes a short brief.
2. Subagents each propose one variant brief, sketch, file-specific recommendation, or patch-shaped proposal.
3. Main agent curates and normalizes the strongest 2-4 options.
4. Main agent assembles those options into the same `data-unship-*` contract.
5. The picker runtime remains unchanged.

Subagents must not mutate the shared workspace in V1. The main agent is the only actor that edits source, resolves conflicts, applies the final `data-unship-*` contract, and performs cleanup.

Unship V1 must not launch, manage, or coordinate subagents itself. That stays inside the agent environment.

If the current agent environment has no subagent facility, the main agent should simulate independent passes internally by writing distinct short briefs, then implement the strongest 2-4 options itself. Unship must not require subagent tooling.

## Error Handling

The picker should fail softly.

If no groups exist:

- do not show a confusing toolbar;
- optionally log a concise development-only warning.

If a group has no options:

- skip that group.

If all options are hidden:

- show the first option.

If labels are missing:

- use `Option 1`, `Option 2`, etc.

If the DOM changes while the user is switching:

- re-scan on the next animation frame;
- preserve selections by group and option label where possible.

If duplicate group labels exist:

- support them internally;
- display enough context to distinguish them when multiple groups are present.

## Security And Privacy

Unship V1 is local-first and browser-local.

- No network calls from the picker.
- No analytics.
- No remote service.
- No source upload.
- No browser extension requirement.
- No mutation endpoint.
- No persistent project state required for preview.

## Package Footprint

The package should stay intentionally small.

Budgets:

- picker script under 12 KB unminified;
- package under 25 KB packed, excluding README and license if the package manager reports them separately;
- zero runtime dependencies for the browser picker;
- no production dependency added to the host app by default.

Target shipped files:

- README;
- license;
- package metadata;
- picker script;
- CLI;
- scan helper;
- agent instruction templates.

The old bridge, core session engine, runtime daemon, and patch tests should not ship in the new product.

Suggested file layout:

```txt
src/
  cli/index.js
  picker/unship-picker.js
  check/index.js
  agent/index.js
agent/
  skills/unship/SKILL.md
  AGENTS.md
README.md
test/
  picker-dom.test.js
  picker-browser.test.js
  cli.test.js
  check.test.js
  package-smoke.test.js
```

## Archive Previous Execution

The previous patch-session implementation is historical.

Archived externally:

`/Users/marcusbenhard/Development/Playground/unship-design-legacy-archive-2026-06-01`

The archive contains:

- source-backed PRD;
- vertical slice plan;
- bridge/server code;
- core/session code;
- runtime daemon code;
- patch/session lifecycle tests;
- old agent contract language.

Do not continue evolving the old execution path while building this hard reset.

## Success Criteria

Unship V1 succeeds when:

- a user can run one install/init command or invoke `/unship`;
- a capable agent can run `doctor` and `setup` instead of reading package internals;
- the agent can create local variants in an existing app without user command-line work;
- switching feels instant;
- the toolbar is compact and polished;
- one group uses the single glass pill;
- multiple groups use the two-line mini dock;
- no confirm button or waiting loop exists;
- the user can simply tell the agent which title to keep;
- the agent can clean the source to one chosen variant;
- `npx unship check` catches leftover artifacts;
- production source is clean by default;
- the shipped code is small enough to understand in one sitting.

## Verification Requirements

Replace the old patch-session test suite with tests for the new product.

Required coverage:

- one group default visibility;
- all-hidden fallback;
- missing option labels;
- direct-child-only option discovery;
- multiple groups with independent selections;
- duplicate group labels;
- MutationObserver re-scan;
- singleton load;
- no fetch, XHR, mutation endpoint, or reload during switching;
- keyboard shortcut guards;
- focus handling when hiding the active option;
- toolbar desktop and mobile viewport fit;
- reduced motion;
- reduced transparency or opaque fallback;
- `npx unship check` residue detection;
- package footprint.

Agent instruction acceptance fixtures:

- user requests a specific variant count;
- user requests `N alternatives plus current`;
- user requests a specific style override;
- user asks for wild exploration;
- target is unsafe for inline mode;
- subagents are unavailable;
- user cancels or says "never mind";
- user asks to ship before choosing;
- `npx unship check` fails and the agent must recover.

## Recommended Build Sequence

1. Replace toolbar with standalone DOM picker.
2. Delete or archive bridge/session/core implementation paths.
3. Add DOM and browser tests for one group, multiple groups, focus, shortcuts, and no-network/no-reload behavior.
4. Add CLI `snippet`, `check`, and `init`.
5. Rewrite agent instructions around brand read, inline mode, and proposal-only subagent mode.
6. Rewrite README around the new local-only flow.
7. Archive old patch-session docs and code.
8. Verify package footprint.
