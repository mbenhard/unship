![Unship - iterate with your agent in the app, not in chat](https://raw.githubusercontent.com/mbenhard/unship/main/.github/assets/cover.png)

# Unship

Iterate with your agent in the app, not in chat.

[unship.dev](https://unship.dev)

Unship gives your coding agent a tiny local picker for comparing alternatives in your real app. The agent adds temporary options in source, you switch between them in the browser, and after you choose a winner the agent removes the rest.

> Early beta. Unship is local comparison tooling, not production experiment infrastructure.

Unship does not send telemetry. No remote service. No account or remote session store. Picker selection does not save source, write files, or make product decisions. The toolbar remembers its dragged position locally across refreshes; variant selection stays memory-only unless local persistence is explicitly enabled. You choose by naming a visible option label in chat.

## Install

Copy for CLI:

```bash
npx @unship/cli@latest install
```

Agent-assisted install:

```txt
Set up Unship for this repo. Run `npx @unship/cli@latest install --dry-run`, explain what it detected and which files it would write, then ask me before running the install. If I approve, run `npx @unship/cli@latest install --yes`.
```

`install` is global-first: it detects known coding harness homes, installs managed skills or instructions where the harness supports them, adds slash-command shims where supported, and can be re-run later to repair or refresh setup. If detection misses a harness you use, name it:

```bash
npx @unship/cli@latest install cursor gemini
```

Restart your agent, then use `/unship` where available or ask naturally when the harness loads installed instructions:

```txt
use unship to compare 4 hero directions
use unship to explore loading, empty, and error states for import
use unship to compare 3 pricing page CTA treatments
```

Where supported, `/unship` works too:

```txt
/unship compare 3 hero directions
```

For unsupported harnesses:

```bash
npx @unship/cli@latest install --print-skill
```

Put the printed `SKILL.md` wherever your agent loads skills.

Claude Code users can load the skill through the plugin system instead:

```txt
/plugin marketplace add mbenhard/unship
/plugin install unship@unship-marketplace
```

The cross-agent [skills CLI](https://skills.sh) works too:

```bash
npx skills add mbenhard/unship
```

## How It Works

1. Ask your agent for alternatives.
2. The agent adds temporary `data-unship-*` options in source.
3. You compare them in your local preview with the picker.
4. You tell the agent which visible label to keep.
5. The agent removes losing options and runs `unship check` before shipping.

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">
    ...
  </div>

  <div data-unship-option="Proof-led" hidden>
    ...
  </div>

  <div data-unship-option="Direct" hidden>
    ...
  </div>
</section>
```

The picker switches direct child options. It does not reload the app, swap source, save state, or add a production dependency by default.

### Tuning

Options (or the group itself) can also declare tunable axes with `data-unship-tweaks` — a JSON array of controls bound to CSS custom properties. The picker renders them in a tune panel: sliders (numeric or token-stepped), toggles, segmented controls, and color swatches. Every axis needs an inline default in the same element's `style` attribute, and its var must be used by the option's CSS.

```html
<div data-unship-option="Proof-led" hidden
     style="--hero-gap: 24px; --accent: #0071e3;"
     data-unship-tweaks='[
       {"type":"slider","label":"Density","var":"--hero-gap","min":8,"max":48,"step":4,"unit":"px"},
       {"type":"swatch","label":"Accent","var":"--accent","options":[
         {"label":"Sky","value":"#0071e3"},{"label":"Ember","value":"#f56300"}
       ]}
     ]'>
```

Tuned values are remembered per option while comparing, clicking a slider's readout resets that axis, and holding the label copies a keep instruction that includes every current value so the agent can bake them into source. A group with a single option becomes a tweak-only exploration: no variants, just calibration of existing UI.

### Canvas

Ask for Canvas when switching one Option at a time is not enough:

```txt
use unship on canvas to compare 4 directions for the header, hero, and feature cards
use unship on canvas to compare the hero at desktop, tablet, and mobile widths
```

Canvas presents every opted-in Group and Option on one bounded, zoomable surface. The agent chooses the Arrangement from the content:

```html
<header data-unship-pick="Header" data-unship-canvas="stack">…</header>
<section data-unship-pick="Feature card" data-unship-canvas="grid">…</section>
<section data-unship-pick="Hero" data-unship-canvas="matrix">…</section>
```

`stack` is for wide sections, `grid` is for compact components, and `matrix` renders every Option at 1280, 768, and 390 pixel viewport widths. Matrix Groups open with Desktop previews only; one responsive toggle reveals Tablet and Mobile together without moving or zooming the Canvas, while Fit explicitly reframes everything. Canvas prepares visible Frames before its short reveal, switches light/dark in place, and uses native CSS transforms for pointer drag, two-finger trackpad panning, and cursor-relative pinch zoom. It reuses the standard Unship dock, tuning axes, and hold-to-Keep workflow; it does not add annotations, sharing, saved boards, or layout controls.

## Good For

- UI section variants
- copy and CTA directions
- loading, empty, error, and success states
- small flow previews
- design-system treatment comparisons
- rendered docs or CLI output previews

Unship works best when the options can live safely in one local rendered surface.

## Not For

- production experiments
- analytics-backed A/B tests
- persistent user sessions
- backend side effects
- auth or payment flows
- global scripts, duplicate active IDs, focus traps, or destructive controls

If a comparison is too risky to inline, ask the agent to make a smaller preview surface.

## Commands

Most users only need `install`, then natural-language prompts.

```bash
npx @unship/cli@latest install
npx @unship/cli@latest doctor --json
npx @unship/cli@latest setup --json
npx @unship/cli@latest check --json
npx @unship/cli@latest check --readiness --json
```

`setup` returns a dev-only picker snippet for a local app shell. `check` verifies that temporary Unship artifacts are gone before release, including `data-unship-tweaks`, `data-unship-as`, and `data-unship-canvas` attributes.

`check --readiness` is for agents before handing a comparison to a human: it statically verifies group structure and tweak-axis declarations, reporting `pass`, `fail`, or `uncertain`. Hard verdicts are only issued for literal plain-HTML markup; templated or dynamic markup — including Vue/Alpine/Angular visibility directives and Svelte control-flow blocks — is reported as `uncertain` and should be verified manually. Markup inside HTML comments and script bodies is ignored. Axis declarations with literal values are validated even in templated files, since the attribute value itself is statically certain.

The npm package is `@unship/cli`. The binary is `unship`, so local installs can run:

```bash
./node_modules/.bin/unship check --json
```

If your team wants repo-local agent instructions:

```bash
npx @unship/cli@latest init
```

The default `portable` target installs Codex/shared, Claude, and OpenCode helpers. Individual targets: `codex`, `antigravity`, `claude`, `opencode`, `cursor`, `copilot`, `gemini`, `windsurf`, `cline`, and `roo`. Use `all` for all supported repo helpers except Roo, which is explicit-only.

## Troubleshooting

If `/unship` does not appear, restart your agent. Most agents load skills and slash commands at startup.

Then check setup:

```bash
npx @unship/cli@latest doctor --json
```

If installed files are stale:

```bash
npx @unship/cli@latest install --repair
```

Natural language still works even when the slash command is unavailable:

```txt
use unship to compare 3 directions for the hero section
```

## Feedback

Trying Unship in a real project? Feedback is welcome, especially if the agent got confused. Open an issue for [agent trouble](https://github.com/mbenhard/unship/issues/new?template=01-agent-trouble.yml), a [picker bug](https://github.com/mbenhard/unship/issues/new?template=02-picker-bug.yml), [docs confusion](https://github.com/mbenhard/unship/issues/new?template=03-docs-confusing.yml), or a focused [feature idea](https://github.com/mbenhard/unship/issues/new?template=04-feature-idea.yml).

## Development

```bash
npm ci
npm run verify
```

## License

MIT
