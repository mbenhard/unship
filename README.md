# Unship

Tiny local DOM picker for temporary agent-authored UI variants.

## Install Agent Instructions

```bash
npx unship init
```

Use harness-specific targets when needed:

```bash
npx unship init --target claude
npx unship init --target opencode
npx unship init --target all
```

## Set Up A Local App

Let Unship detect the framework, copy the picker, and add the smallest dev-only mount it knows how to patch:

```bash
npx unship setup
```

Or choose a framework explicitly:

```bash
npx unship setup next
npx unship setup vite
npx unship setup astro
npx unship setup sveltekit
npx unship setup nuxt
npx unship setup angular
```

`setup` is intentionally thin. The runtime is still just DOM attributes plus one browser script.

Agents can check what already exists before doing work:

```bash
npx unship doctor --json
```

`doctor` also reports likely live preview servers so agents can reuse an existing dev server instead of starting another one.
It reports stale installed skills or picker files too; use `npx unship init --force` to refresh instructions and rerun `npx unship setup` to refresh the picker.

## Temporary Markup Contract

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">...</div>
  <div data-unship-option="Proof-led" hidden>...</div>
</section>
```

## Picker Snippet

```bash
npx unship snippet
```

This prints:

```html
<script src="/unship-picker.js" data-unship-dev></script>
```

## Cleanup Check

Before shipping, the agent removes losing variants, `data-unship-*` attributes, picker scripts, and Unship comments, then runs:

```bash
npx unship check
```

## Natural Agent Prompts

Users should be able to ask normally:

```txt
use unship to generate 4 variants for hero section
generate 3 copywriting variants for the pricing section with unship
generate 4 variants of the CTA row in the onboarding section with unship
```

The installed skill teaches the agent to inspect the existing design language, set up the picker if needed, create source-level variants, and stop for a human choice.

## What Unship Is Not

- No bridge.
- No session store.
- No source swapping during preview.
- No reload loop.
- No confirm button.
- No production dependency by default.
