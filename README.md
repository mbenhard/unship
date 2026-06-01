# Unship

Tiny local DOM picker for temporary agent-authored UI variants.

## Install The Global Skill

```bash
npx unship@latest install-skill
```

Restart your agent, then ask naturally:

```txt
use unship to generate 3 variants of the hero section
```

The installed skill checks the project, wires the local picker when needed, creates source-level variants, hands off comparison to you, and later cleans every Unship artifact before shipping.

## Repo-Local Fallback

Use repo-local instructions only when your team wants the Unship skill committed into a project:

```bash
npx unship@latest init
```

By default this installs portable workspace, Claude, and OpenCode instructions. Existing project instruction files are not overwritten unless they are managed Unship skill files and you pass `--force`.

Use harness-specific targets when needed:

```bash
npx unship@latest init --target antigravity
npx unship@latest init --target claude
npx unship@latest init --target opencode
npx unship@latest init --target all
```

Codex and Antigravity both use the portable workspace skill at `.agents/skills/unship/SKILL.md`.

## Set Up A Local App

Let Unship detect the framework, copy the picker, and add the smallest dev-only mount it knows how to patch:

```bash
npx unship@latest setup
```

Or choose a framework explicitly:

```bash
npx unship@latest setup next
npx unship@latest setup vite
npx unship@latest setup astro
npx unship@latest setup sveltekit
npx unship@latest setup nuxt
npx unship@latest setup angular
```

`setup` is intentionally thin. The runtime is still just DOM attributes plus one browser script.

Agents can check what already exists before doing work:

```bash
npx -y unship@latest doctor --json
```

`doctor` also reports likely live preview servers so agents can reuse an existing dev server instead of starting another one.
It reports stale installed skills or picker files too; use `npx unship@latest init --force` to refresh managed repo instructions and rerun `npx unship@latest setup` to refresh the picker. A plain `npx unship init` fails loudly when an installed Unship skill is stale, instead of pretending initialization succeeded.

## Temporary Markup Contract

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">...</div>
  <div data-unship-option="Proof-led" hidden>...</div>
</section>
```

## Picker Snippet

```bash
npx unship@latest snippet
```

This prints:

```html
<script src="/unship-picker.js" data-unship-dev></script>
```

## Cleanup Check

Before shipping, the agent removes losing variants, `data-unship-*` attributes, picker scripts, and Unship comments, then runs:

```bash
npx unship@latest check
```

## Natural Agent Prompts

Users should be able to ask normally:

```txt
use unship to generate 4 variants for hero section
generate 3 copywriting variants for the pricing section with unship
generate 4 variants of the CTA row in the onboarding section with unship
```

The installed skill teaches the agent to inspect the existing design language, set up the picker if needed, create source-level variants, and stop for a human choice. Agents should not start, open, or automate a browser by default; detected preview servers are hints for the human, not proof targets for agent visual QA.

Agents should not build a separate tab control, segmented switcher, or app setting for comparison. The `data-unship-*` markup is the source contract and the picker toolbar is the comparison UI.

## What Unship Is Not

- No bridge.
- No session store.
- No source swapping during preview.
- No reload loop.
- No confirm button.
- No production dependency by default.
