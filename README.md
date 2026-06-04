# Unship

Tiny local DOM picker for temporary agent-authored UI variants.

Unship helps an AI agent create a few real source-level UI options, lets you compare them in your normal local preview, and then guides the agent to remove every temporary artifact before shipping.

> Status: early beta. Unship is intentionally small and local-first; treat it as prototyping tooling, not production runtime infrastructure.

Unship is local comparison tooling. The picker script runs only in your local preview, Unship does not send telemetry, and picker selection does not save source or make a product decision. You choose by naming the visible option label in chat; the agent settles source by keeping that option and removing temporary Unship artifacts.

## Install

Run the smart installer:

```bash
npx @unship/cli@latest install
```

It detects known coding harnesses, installs the Unship skill, adds `/unship` where supported, and can be re-run later to repair or refresh setup.

Restart your agent, then use the slash command where available:

```txt
/unship generate 3 variants of the hero section
```

Or ask naturally:

```txt
use unship to generate 3 variants of the hero section
```

The installed skill checks the project, wires the local picker when needed, creates source-level variants, hands off comparison to you, and later cleans every Unship artifact before shipping.

For unsupported harnesses, print the portable skill and place it where your agent loads skills:

```bash
npx @unship/cli@latest install --print-skill
```

Fallback checklist:

1. Find the harness's user-level or repo-level skill directory.
2. Create `unship/SKILL.md` inside that directory.
3. Paste the printed skill content into `SKILL.md`.
4. Restart the harness so it reloads skills.
5. Ask naturally: `use unship to generate 3 variants of the hero section`.

If a harness does not support skills, paste this into the agent instead:

```txt
Use Unship for this request. First run `npx -y @unship/cli@latest doctor --json`.
If the project needs setup and an app shell exists, run `npx -y @unship/cli@latest setup --json`.
Create temporary source-level choices with `data-unship-pick` and `data-unship-option`.
Use the local picker for comparison, then remove every temporary Unship artifact and run `npx -y @unship/cli@latest check --json`.
```

## Quick Start In A Project

Check what already exists:

```bash
npx -y @unship/cli@latest doctor --json
```

Set up the picker when the app shell exists:

```bash
npx @unship/cli@latest setup
```

Or choose a framework explicitly:

```bash
npx @unship/cli@latest setup next
npx @unship/cli@latest setup vite
npx @unship/cli@latest setup astro
npx @unship/cli@latest setup sveltekit
npx @unship/cli@latest setup nuxt
npx @unship/cli@latest setup angular
```

`setup` is intentionally thin. The runtime is still just DOM attributes plus one browser script.

## Temporary Markup Contract

Agents create temporary choices in real source with one group and direct child options:

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">...</div>
  <div data-unship-option="Proof-led" hidden>...</div>
</section>
```

The Unship picker toolbar is the comparison UI. Agents should not build a separate tab control, segmented switcher, app setting, confirm button, or source-swapping system for comparisons.

## Picker Snippet

```bash
npx @unship/cli@latest snippet
```

Prints:

```html
<script src="/unship-picker.js" data-unship-dev></script>
```

## Cleanup Check

Before shipping, the agent removes losing variants, `data-unship-*` attributes, picker scripts, and Unship comments, then runs:

```bash
npx @unship/cli@latest check
```

Use structured output when an agent needs exact artifact locations or active exploration summaries:

```bash
npx @unship/cli@latest check --json
```

`check` is read-only. The agent still edits source to settle a winner or remove temporary Unship work.

## Repo-Local Instructions

Use repo-local instructions only when your team wants the Unship skill committed into a project:

```bash
npx @unship/cli@latest init
```

By default this installs portable workspace, Claude, and OpenCode instructions. Existing project instruction files are not overwritten unless they are managed Unship skill files and you pass `--force`.

Use harness-specific targets when needed:

```bash
npx @unship/cli@latest init --target antigravity
npx @unship/cli@latest init --target claude
npx @unship/cli@latest init --target opencode
npx @unship/cli@latest init --target all
```

Codex and Antigravity both use the portable workspace skill at `.agents/skills/unship/SKILL.md`.

## Advanced Skill Install

Use the older skill-only installer only when you need to target a specific skills directory yourself:

```bash
npx @unship/cli@latest install-skill --dir ~/.claude/skills
```

This does not install slash commands, repair legacy files, or set up a project.

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

For local package dogfooding, install from a packed tarball rather than the public registry:

```bash
mkdir -p /tmp/unship-pack
npm pack --pack-destination /tmp/unship-pack

cd /path/to/consuming-app
npm install -D /tmp/unship-pack/unship-cli-0.1.1.tgz
./node_modules/.bin/unship doctor --json
```

## License

MIT
