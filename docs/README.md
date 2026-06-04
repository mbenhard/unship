# Unship Docs Index

This folder now tracks the hard-reset Unship direction: a tiny local DOM picker for temporary agent-authored UI variants.

## Active Source Of Truth

Read in this order:

1. `docs/plans/current-run.md`
2. `docs/superpowers/specs/2026-06-04-unship-seamless-install-design.md`
3. `docs/superpowers/specs/2026-06-04-unship-agent-fast-prototyping-design.md`
4. `docs/superpowers/plans/2026-06-04-unship-seamless-install-implementation-plan.md`
5. `docs/superpowers/plans/2026-06-04-unship-agent-fast-prototyping-implementation-plan.md`
6. `docs/superpowers/specs/2026-06-01-unship-instant-picker-prd.md`
7. `docs/superpowers/specs/2026-06-01-unship-instant-picker-technical-spec.md`
8. `RELEASE.md`

Older implementation plans are execution records, not current behavior specs.

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
- `npx @unship/cli@latest install` is the primary re-runnable harness setup and repair path. `install-skill` remains a lower-level compatibility command.
- Subagent mode is proposal-only in V1. Unship does not orchestrate subagents.
- `unship check` must distinguish allowed installed instructions from forbidden preview artifacts.
- `npx -y @unship/cli@latest doctor --json` and `npx -y @unship/cli@latest setup --framework auto --json` are the fresh-project fast path for capable agents.
- Doctor reports likely live preview servers so agents should reuse an existing dev server before starting another.
- Doctor reports stale installed skills and picker files so agents can upgrade existing repos without spelunking.
- Doctor and check return structured exploration summaries for agents, while remaining read-only.
- Cleanup remains agent-edited source work. Unship has no cleanup mutator in this phase.

## Archive Status

The retired patch-session implementation and historical 2026-05-31 docs were moved outside this folder:

`/Users/marcusbenhard/Development/Playground/unship-design-legacy-archive-2026-06-01`

Archive contents:

- `legacy-code/`: old `src/`, tests, agent instructions, examples, prototype, package metadata, and README.
- `legacy-docs/`: superseded PRD, plans, reviews, and review prompts.
- `generated/`: local brainstorm/generated artifacts.

The active folder should not continue the old implementation path.

## Current Run

Use `docs/plans/current-run.md` for the latest active run status, linked plan, verification state, and next workflow skill.
