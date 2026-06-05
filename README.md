![Unship — iterate with your agent in the app, not in chat](https://raw.githubusercontent.com/mbenhard/unship/main/.github/assets/cover.png)

# Unship

Iterate with your agent in the app, not in chat.

Unship lets your agent create temporary options for UI details, copy, product states, flows, design-system treatments, rendered docs, CLI output, or any local surface it can render in source. Compare them in your running app with a tiny local picker, choose the winner in chat, and have the agent clean up the rest before shipping.

> Status: early beta. Unship is local-first prototyping tooling, not production experiment infrastructure.

Unship is local comparison tooling. The picker script runs only in your local preview, Unship does not send telemetry, and picker selection does not save source or make a product decision. The alternatives are temporary source-level choices that should be settled or removed before release.

## Install

```bash
npx @unship/cli@latest install
```

Restart your agent, then ask naturally:

```txt
use unship to compare 4 hero directions
use unship to explore empty, loading, and error states for the import flow
use unship to compare 3 button system treatments
use unship to render 3 CLI help output directions
```

Where supported, `/unship` works too:

```txt
/unship compare 3 pricing page directions
```

`install` detects known coding harnesses, installs the Unship skill, adds slash-command shims where supported, and can be re-run later to repair or refresh setup.

For unsupported harnesses:

```bash
npx @unship/cli@latest install --print-skill
```

Put the printed `SKILL.md` in the place your agent loads skills from.

## How It Works

The agent creates temporary choices in normal source:

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">...</div>
  <div data-unship-option="Proof-led" hidden>...</div>
</section>
```

The picker switches direct child options in the DOM. There is no bridge, session store, reload loop, source swapper, or production dependency by default.

The usual loop:

1. Ask for alternatives.
2. Compare them in your running local preview.
3. Tell the agent which visible option label to keep; the installed skill tells it to settle that group by removing the losing options and temporary `data-unship-*` attributes from the kept source.
4. Before shipping, run `unship check` to verify no temporary Unship artifacts remain.

## Project Commands

Check the current project:

```bash
npx -y @unship/cli@latest doctor --json
```

Ask Unship for a dev-only picker mount when an app shell exists:

```bash
npx @unship/cli@latest setup --json
```

`setup` is framework-agnostic. It returns an inline picker snippet and instructions; your agent should add that snippet to the smallest local/dev-only app shell that renders the temporary choices.

Print the picker snippet directly:

```bash
npx @unship/cli@latest snippet --inline
```

Check for leftover preview artifacts:

```bash
npx @unship/cli@latest check --json
```

`check` is read-only. The agent still edits source to keep a winner or remove temporary work.

## Limits

Unship works best when the alternatives can coexist in one rendered local surface.

More complex screens and flows are possible, but the agent has to shape them into something DOM-local: a comparison route, a flow mock, a step preview, or a source-contained version of the screen. If the alternatives require separate routes, real navigation state, backend side effects, auth changes, analytics, or long-lived sessions, Unship can still help sketch them, but it is not orchestrating that flow for you.

Raw Markdown is not directly comparable by the picker. For README, docs, CLI, or DX alternatives, the agent should render a temporary local preview surface first, then remove that preview work before shipping.

Avoid inline Unship options around duplicate active IDs, submit controls, global scripts, autoplay media, focus traps, destructive side effects, or stateful providers. In those cases, compare a safer shell or smaller slice.

## Repo-Local Instructions

Commit the Unship skill into a project only when your team wants repo-local agent instructions:

```bash
npx @unship/cli@latest init
```

Harness-specific targets are `codex`, `antigravity`, `claude`, `opencode`, and `all`:

```bash
npx @unship/cli@latest init --target <target>
```

Codex and Antigravity both use `.agents/skills/unship/SKILL.md`.

## Troubleshooting

### /unship does not appear

Restart the agent after running `install`; most harnesses load skills and slash commands only at startup.

Then check the project state:

```bash
npx @unship/cli@latest doctor --json
```

If installed Unship files are stale or legacy files are detected, refresh managed files:

```bash
npx @unship/cli@latest install --repair
```

If the slash command still is not available, use the natural-language fallback:

```txt
use unship to compare 3 directions for the hero section
```

For unsupported harnesses, print the portable skill and place it where your agent loads skills:

```bash
npx @unship/cli@latest install --print-skill
```

## Agent Behavior

The installed skill teaches agents to:

- inspect the named route, component, or source area first;
- create the smallest source-level comparison that lets you judge the options;
- run comparison-readiness checks before handoff, including option labels, direct-child structure, and hidden-option visibility;
- keep verification proportional: full typecheck, build, browser smoke, `unship check`, and cleanup verification belong to setup changes, selected-option cleanup, or final shipping cleanup;
- reuse existing dev-only picker setup instead of reinstalling or repairing it during ordinary variant creation;
- mount the picker in the smallest valid dev-only app shell and avoid invalid framework script-helper placement;
- avoid opening or automating a browser by default;
- treat detected preview servers as hints, not proof targets;
- summarize existing Unship explorations from `doctor` and `check`;
- distinguish settling one selected group from final cleanup;
- keep all Unship artifacts local and temporary.

Natural prompts should work:

```txt
use unship to generate 4 variants for hero section
generate 3 copywriting variants for the pricing section with unship
generate 4 variants of the CTA row in the onboarding section with unship
```

## Package And Binary

The npm package is `@unship/cli`. The installed executable is still `unship`, so local project installs can use:

```bash
./node_modules/.bin/unship doctor --json
```

## What Unship Is Not

- No bridge.
- No session store.
- No source swapping during preview.
- No reload loop.
- No confirm button.
- No production dependency by default.

## Development

```bash
npm ci
npm run verify
```

## License

MIT
