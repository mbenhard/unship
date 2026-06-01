# Unship Docs Index

This folder now tracks the hard-reset Unship direction: a tiny local DOM picker for temporary agent-authored UI variants.

## Active Source Of Truth

Read in this order:

1. `docs/superpowers/specs/2026-06-01-unship-instant-picker-prd.md`
2. `docs/superpowers/specs/2026-06-01-unship-instant-picker-technical-spec.md`
3. `docs/superpowers/plans/2026-06-01-unship-instant-picker-implementation-plan.md`
4. `docs/plans/2026-06-01-unship-instant-picker-prd-review.md`
5. `docs/plans/current-run.md`

## Current Product Decisions

- DOM-local switching is the core product. No bridge, token, session store, source swap, or reload loop.
- Framework support is thin setup only: detect common stacks, copy the picker, and add a dev-only mount when safe.
- The canonical temporary source contract is `[data-unship-pick]` plus direct child `[data-unship-option]`.
- The picker is one dependency-free browser script.
- Selection state is memory-only by default; localStorage is opt-in.
- The toolbar uses a single glass pill for one group and a two-line mini dock for multiple groups.
- Keyboard shortcuts are scoped to picker focus by default so host apps keep their own shortcuts.
- No confirm button. The human tells the agent in chat which visible title to keep.
- Agent instructions live primarily in `SKILL.md`; standing `AGENTS.md`/`CLAUDE.md` files stay short.
- Subagent mode is proposal-only in V1. Unship does not orchestrate subagents.
- `npx unship check` must distinguish allowed installed instructions from forbidden preview artifacts.
- `npx unship doctor --json` and `npx unship setup --framework auto --json` are the fast path for capable agents.
- Doctor reports likely live preview servers so agents should reuse an existing dev server before starting another.

## Archive Status

The retired patch-session implementation and historical 2026-05-31 docs were moved outside this folder:

`/Users/marcusbenhard/Development/Playground/unship-design-legacy-archive-2026-06-01`

Archive contents:

- `legacy-code/`: old `src/`, tests, agent instructions, examples, prototype, package metadata, and README.
- `legacy-docs/`: superseded PRD, plans, reviews, and review prompts.
- `generated/`: local brainstorm/generated artifacts.

The active folder should not continue the old implementation path.

## Next Step

Review the technical spec and implementation plan, then execute with `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
