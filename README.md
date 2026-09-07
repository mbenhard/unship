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
npm install -g @unship/cli
unship install
```

Agent-assisted install:

```txt
Install Unship instructions for my coding agent using the installed @unship/cli. Inspect `unship install --dry-run --json`, then install with `unship install --yes`. Preserve my custom instructions.
```

`install` is global-first: it detects known coding harness homes, installs managed skills or instructions where the harness supports them, adds slash-command shims where supported, and can be re-run later to repair or refresh setup. If detection misses a harness you use, name it:

```bash
unship install cursor gemini
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
unship install --print-skill
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

`stack` compares wide sections, `grid` compact components, and `matrix` every Option at 1280, 768, and 390 pixels. Open Canvas with the overlapping-frames icon. Matrix starts at Desktop; the responsive toggle reveals Tablet and Mobile without changing the camera. Fit reframes everything. Canvas prepares previews before revealing them and supports light/dark themes, pointer drag, trackpad pan, and cursor-relative pinch zoom with native CSS transforms. “Hold to copy choice” copies an instruction for the selected option. Paste it into your AI chat so the agent can apply the choice in source. A checkmark marks copied Canvas choices.

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
unship install
unship doctor --json
unship setup --out public/unship-picker.js --src /unship-picker.js --json
unship check --json
unship check --readiness --json
```

`setup --out` copies the selected runtime directly to the specified file and leaves identical bytes untouched. A differing file is preserved unless you repeat with `--force`, which saves a backup under `.unship/backups/`. Supply the app's actual served path and script URL; the paths above are examples. The agent adds the small returned script tag to one dev-only app shell. Setup does not rewrite framework source.

`setup --inline --json` (also the legacy no-argument setup behavior) returns an embedded script for standalone previews. `snippet` remains available and uses the same attribute handling. `--persist local` and `--global-shortcuts` work in either mode.

`check` finds temporary Unship artifacts before release, including custom-named dev script mounts and retired attributes. Remove unused copied runtime files as well as their mounts.

`check --readiness` is for agents before handing a comparison to a human: it statically verifies group structure and Canvas arrangements, reporting `pass`, `fail`, or `uncertain`. Hard verdicts are only issued for literal plain-HTML markup; templated or dynamic markup — including Vue/Alpine/Angular visibility directives and Svelte control-flow blocks — is reported as `uncertain` and should be verified manually. Markup inside HTML comments and script bodies is ignored.

The npm package is `@unship/cli`. The binary is `unship`, so local installs can run:

```bash
./node_modules/.bin/unship check --json
```

If your team wants repo-local agent instructions:

```bash
unship init
```

The default `portable` target installs Codex/shared, Claude, and OpenCode helpers. Individual targets: `codex`, `antigravity`, `claude`, `opencode`, `cursor`, `copilot`, `gemini`, `windsurf`, `cline`, and `roo`. Use `all` for all supported repo helpers except Roo, which is explicit-only.

## Troubleshooting

If `/unship` does not appear, restart your agent. Most agents load skills and slash commands at startup.

Check a copied runtime against the selected CLI build:

```bash
unship --version
unship doctor --out public/unship-picker.js --json
```

For an inline HTML mount, use `doctor --inline --out preview.html --json`. Doctor reports unknown freshness when it cannot verify the supplied mount; it does not prove which bytes a browser has loaded. It stays offline by default. `--ports 4326` explicitly probes a preview port; results are hints, not proof of app ownership. `--no-update-check` remains a compatibility no-op.

Updating instructions and updating a project's copied runtime are separate operations. Reuse `setup --out <existing-file>` before handing off a comparison; inspect differences before `--force`. Reload the page, and rebuild if the preview serves an old build. Restarting an agent does not refresh a project script.

Upgrade the package explicitly with `npm install -g @unship/cli@latest` (or your project's package manager), then refresh instructions below. For unpublished local builds, install the exact tarball instead. Keep using that executable; do not switch to npm `@latest` during setup or repair.

If installed agent instructions are stale:

```bash
unship install --repair
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
