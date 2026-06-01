# Unship Global Skill Installer Design

**Date:** 2026-06-01
**Status:** Approved direction for the first-party Agentation-style install path.

## Goal

Make Unship easy to start with through a one-time global skill install, then let the agent configure each project only when the user asks for variants.

## Product Shape

The primary onboarding path should become:

```bash
npx unship@latest install-skill
```

Then in any supported agent harness:

```txt
use unship to generate 3 variants of the hero section
```

The globally installed skill handles repo-local work:

```bash
npx -y unship@latest doctor --json
npx -y unship@latest setup --framework auto --json
```

`npx unship init --target ...` remains as a fallback for teams that want repo-local committed instructions.

## Command Contract

Add:

```bash
npx unship@latest install-skill
```

Default behavior:

- writes the full Unship skill to `~/.agents/skills/unship/SKILL.md`;
- creates parent directories as needed;
- does not depend on the current working directory;
- returns concise plain output by default;
- supports `--json`;
- supports `--force`;
- supports `--dir <skills-dir>` for custom global skill roots.

Stale behavior:

- if the destination already exists and matches, return `ok: true` with `skipped`;
- if the destination exists and differs, return `ok: false`, exit nonzero, and suggest `npx unship@latest install-skill --force`;
- with `--force`, overwrite the managed skill.

JSON shape:

```json
{
  "ok": true,
  "written": ["/Users/example/.agents/skills/unship/SKILL.md"],
  "skipped": [],
  "stale": [],
  "next": [
    "Restart your agent, then ask: use unship to generate 3 variants of the hero section."
  ]
}
```

## Skill Runtime Contract

The installed skill must not assume `unship` is already a project dependency.

It should choose CLI invocation this way:

1. If `package.json` lists `unship` in `dependencies` or `devDependencies`, use `npx unship ...`.
2. Otherwise use `npx -y unship@latest ...`.

This avoids interactive npm prompts and lets the global skill work in fresh repos.

## Non-Goals

- No registry service.
- No MCP server.
- No browser-to-agent decision sync.
- No framework runtime dependency.
- No replacement for `setup`, `doctor`, `check`, or the DOM attribute contract.

## Verification

Implementation must prove:

- `install-skill --json` writes the skill into a fake home-derived skills directory.
- rerunning without changes skips cleanly.
- stale destination fails without `--force`.
- `--force` refreshes stale content.
- unknown commands still fail nonzero.
- the bundled skill documents `npx -y unship@latest` fallback behavior.
- `npm run verify` passes.
