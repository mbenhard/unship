# Unship Minimal Beta Hardening Design

**Date:** 2026-06-04
**Status:** Approved direction for planning

## Goal

Harden the current Unship beta around first-run trust without expanding the product into a larger platform.

The beta promise is simple: users can install Unship, ask an agent to create temporary local alternatives, compare those alternatives in their own preview, pick a winner in chat, and trust that the agent can remove every temporary artifact before shipping. This pass should make that loop easier to verify from the user, developer, and agent perspectives.

The work should stay small. Prefer clearer command output, structured read-only status, and stronger installed instructions over new workflows, config files, or source-mutating automation.

## Product Shape

This hardening pass improves the existing command surface:

```bash
unship install
unship doctor
unship check
```

Supporting docs and installed agent instructions should be updated with the same trust language so users do not have to infer the lifecycle from scattered command examples.

The primary question each surface should answer:

- `install`: "What was installed, what still needs a restart or repair, and what should I try next?"
- `doctor`: "Is this project ready for Unship, are installed artifacts current, and what should the agent do next?"
- `check`: "Is there anything temporary left that could leak into shipped source?"
- README and bundled skill: "How do I verify setup, recover if `/unship` is unavailable, and know that Unship stays local?"

## Principles

- Preserve Unship as local, temporary comparison tooling.
- Keep commands read-oriented or explicitly re-runnable; do not add a cleanup mutator.
- Make stale or missing setup visible in normal CLI output, not only in JSON.
- Keep update checks best-effort and non-fatal.
- Avoid broad configuration until real user projects prove it is needed.
- Treat installed skills and slash-command shims as product surface.
- Make agent handoffs explicit enough that the human can name a winner unambiguously.

## Non-Goals

- No auto-update or self-mutating update command.
- No background daemon, telemetry, registry service, or analytics.
- No support bundle command in this pass.
- No `.unshipignore`, config file, or user-managed ignore system.
- No expanded framework support beyond the current thin `setup` behavior.
- No browser automation requirement.
- No source-mutating `keep`, `clean`, `settle`, or `remove` command.

## Update Awareness

`doctor` should perform a quiet best-effort npm latest-version check by default. The check should compare the running package version with the current npm version for `@unship/cli`.

Behavior:

- If the latest version is newer, include an update notice and a next action such as `Run npx @unship/cli@latest install --repair to refresh managed Unship files.`
- If the latest version is the same, report the package as current in JSON and keep plain output concise.
- If the network is unavailable, npm is slow, or the registry request fails, do not fail the command. JSON should indicate that update info is unavailable; plain output should omit noisy warnings unless the user asks for verbose output in a later design.
- Add `--no-update-check` for users and CI flows that want no network access.

`install` should reuse the same update awareness when practical, but update checks must never block installation. If update info cannot be fetched, `install` continues normally.

The implementation should not add a runtime dependency. A small Node `fetch` call to the npm registry is enough, with a short timeout.

Suggested JSON shape:

```json
{
  "packageName": "@unship/cli",
  "version": "0.1.1",
  "updates": {
    "checked": true,
    "available": true,
    "current": "0.1.1",
    "latest": "0.1.2",
    "next": "Run npx @unship/cli@latest install --repair to refresh managed Unship files."
  }
}
```

When disabled:

```json
{
  "updates": {
    "checked": false,
    "reason": "disabled"
  }
}
```

When unavailable:

```json
{
  "updates": {
    "checked": true,
    "available": null,
    "current": "0.1.1",
    "latest": null,
    "error": "unavailable"
  }
}
```

## Install And Loaded-State Clarity

`install` already writes managed harness files and can be re-run. The missing beta trust piece is plain-language clarity after the command runs.

Plain output should make three things obvious:

1. Which harness targets are current, written, stale, blocked, or manual.
2. Whether the user must restart the agent before `/unship` or the skill can load.
3. What to do when `/unship` is not available.

Recommended next actions after a successful install:

- `Restart the agent so it reloads Unship.`
- `Try /unship where supported, or ask: use unship to compare 3 directions for the hero section.`
- `If /unship is unavailable after restart, run npx @unship/cli@latest doctor --json and use the natural-language fallback.`

JSON should remain compatible with existing fields and add only optional fields if needed. The exact action strings can evolve, but tests should protect the presence of restart, natural-language fallback, and doctor troubleshooting guidance.

## Doctor As Trust Check

`doctor` should become the main one-command status check for users and agents.

It should report:

- package name, local version, and update status;
- Node version;
- detected framework and framework signals;
- installed repo-local skill path and whether it matches the running package;
- picker file path and whether it matches the running package;
- dev mount path, if found;
- detected preview servers as hints only;
- existing Unship explorations;
- cleanup requirement;
- next actions ordered by urgency.

Next-action priority:

1. Update available or update check disabled/unavailable when relevant.
2. Stale installed skill instructions.
3. Stale picker file.
4. Missing setup when an app shell exists.
5. Existing active explorations or cleanup-required artifacts.
6. Agent restart or fallback guidance when setup was just installed.

`doctor --json` should preserve existing compatibility fields: `ok`, `packageName`, `version`, `node`, `project`, `residue`, `unship`, `next`, and `reminder`. New fields should be additive.

Plain `doctor` output should remain short, but include update and stale state when present.

## Cleanup Confidence

`check` remains the shipping guard. It should keep exact diagnostics but add a grouped cleanup summary that is easier for agents and humans to act on.

JSON should include:

- `ok`;
- `diagnostics`;
- `explorations`;
- `cleanupRequired`;
- `summary`.

The summary should be derived from existing scanner results and should not require AST parsing.

Suggested JSON shape:

```json
{
  "ok": false,
  "cleanupRequired": true,
  "summary": {
    "artifactCount": 4,
    "fileCount": 2,
    "explorationCount": 1,
    "files": ["src/app/page.tsx", "public/unship-picker.js"],
    "message": "Unship cleanup required: 4 artifacts across 2 files."
  },
  "explorations": [
    {
      "pick": "Hero",
      "file": "src/app/page.tsx",
      "options": ["Current", "Proof"],
      "startLine": 10,
      "endLine": 40,
      "rangeConfidence": "high"
    }
  ],
  "diagnostics": []
}
```

Plain `check` output should lead with the summary before detailed file/line diagnostics:

```txt
Unship cleanup required: 4 artifacts across 2 files.
Explorations:
- Hero in src/app/page.tsx: Current, Proof

src/app/page.tsx:10:8 Remove temporary Unship picker markup before shipping. (data-unship-pick)
```

When clean, keep the existing simple success message:

```txt
No Unship preview artifacts found.
```

## Agent Handoff Guardrails

The bundled skill should require explicit handoff language before stopping for human comparison.

Before asking the human to choose, the agent should report:

- the variant group label;
- visible option labels;
- whether picker setup is installed and current;
- whether the installed skill or picker appears stale;
- detected preview servers as hints only;
- cleanup status if existing Unship artifacts already exist.

When the human names a winner, the skill should tell the agent to verify the selected group and option label before editing if there is ambiguity. Examples of ambiguity:

- multiple groups with the same label;
- repeated option labels;
- the user says "the second one" after other changes;
- overlapping active explorations.

Final cleanup still requires `check --json` to pass before claiming completion.

## Local-Only Trust Language

README and installed instructions should say plainly:

- Unship is local comparison tooling.
- The picker script runs in the user's local preview.
- Unship does not send telemetry.
- Picker selection does not save source or make a product decision.
- The human chooses by naming the visible option label in chat.
- The agent settles source by keeping the chosen option and removing temporary artifacts.

This language should be brief and repeated only where it helps users avoid wrong assumptions.

## Troubleshooting Path

README should include a short troubleshooting section for the most common beta failure:

```txt
/unship does not appear or the agent does not recognize Unship
```

Guidance:

1. Restart the agent after running install.
2. Run `npx @unship/cli@latest doctor --json`.
3. Re-run `npx @unship/cli@latest install --repair`.
4. Use natural-language fallback: `use unship to compare 3 directions for the hero section`.
5. For unsupported harnesses, use `npx @unship/cli@latest install --print-skill`.

The troubleshooting path should avoid harness-specific promises that the CLI cannot prove.

## Testing

Add focused tests for:

- `doctor --json` includes update status when update checks succeed, fail, and are disabled.
- `doctor` next actions include update, stale skill, stale picker, setup, and cleanup guidance in stable order.
- `install` plain output includes restart and fallback troubleshooting guidance.
- `check --json` includes grouped `summary` while preserving diagnostics and explorations.
- plain `check` leads with a cleanup summary before detailed diagnostics.
- README or bundled skill assertions cover local-only/no-telemetry language and `/unship` troubleshooting.

Network-dependent update tests should mock or inject the update lookup rather than relying on the live npm registry.

Run:

```bash
npm run verify
```

For docs-only amendments, at least run:

```bash
git diff --check
```

## Open Implementation Notes

The cleanest implementation boundary is likely a small helper in the CLI layer or a new narrow module such as `src/update/index.js`. The helper should accept a package name, current version, timeout, and fetch implementation so tests can inject deterministic responses.

The cleanup summary can live in `src/check/index.js` because it is derived entirely from scanner diagnostics and explorations.

Avoid adding semver as a dependency. A minimal version comparison for normal numeric npm versions is sufficient for the beta. If comparison is uncertain, report the latest version without claiming it is newer.
