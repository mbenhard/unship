# Unship Seamless Install Design

**Date:** 2026-06-04
**Status:** Proposed direction for implementation

## Goal

Make Unship onboarding feel like one simple command that can be safely re-run whenever the user's agent setup or project changes.

The command should cover known coding harnesses, slash-command shims, current-project picker setup, stale install repair, and legacy cleanup without making users understand the difference between skills, slash commands, package binaries, and framework setup.

## User Promise

Most users should start with:

```bash
npx @unship/cli@latest install
```

Then use Unship in whichever form their harness supports:

```txt
/unship generate 3 variants of the hero section
```

or:

```txt
use unship to generate 3 variants of the hero section
```

The same install command should remain useful later:

- first-time install;
- adding a newly installed harness;
- refreshing stale skills after an Unship update;
- repairing old or conflicting Unship files;
- adding slash-command shims;
- setting up the current project picker;
- checking what is installed without making changes.

## Product Shape

Add two public commands:

```bash
unship install
unship uninstall
```

Keep the existing commands:

```bash
unship install-skill
unship init
unship setup
unship snippet
unship doctor
unship check
```

`install` becomes the primary user-facing onboarding and repair command. `install-skill` and `init` remain lower-level compatibility commands.

`uninstall` removes user-level Unship harness files and optionally current-project Unship setup. It should not remove app source variants or make creative cleanup choices; final preview artifact cleanup remains the agent's source-editing job verified by `unship check`.

## Install Modes

### Interactive Default

```bash
npx @unship/cli@latest install
```

The default mode detects state and presents a concise action summary before writing:

```txt
Detected:
- Claude Code: installed
- Codex/Antigravity shared skills: available
- OpenCode: not detected
- Current project: Next.js

Planned:
- Install Claude Code skill
- Install Claude Code /unship command
- Install Codex/Antigravity skill
- Set up current project picker

Proceed? yes
```

If stdin is not interactive, fail with a clear message unless `--yes`, `--json`, or `--dry-run` is provided.

### Noninteractive

```bash
npx @unship/cli@latest install --all --yes
npx @unship/cli@latest install --harness claude,codex --yes
npx @unship/cli@latest install --project --yes
npx @unship/cli@latest install --repair --yes
npx @unship/cli@latest install --dry-run --json
```

Flags:

- `--all`: install every known harness target that can be safely written.
- `--harness <list>`: install only selected harnesses. Supported initial values: `claude`, `codex`, `antigravity`, `opencode`, `agents`.
- `--project`: include current project picker setup.
- `--no-project`: skip current project setup even when an app is detected.
- `--repair`: refresh stale managed files and remove known legacy Unship command files.
- `--yes`: do planned writes without prompting.
- `--dry-run`: report planned actions without writing.
- `--json`: emit machine-readable detection, plan, and result.
- `--force`: overwrite stale managed files and known legacy Unship files without requiring `--repair`.

`--all` should imply harness setup, not project setup. Project mutation should require either interactive confirmation or explicit `--project`.

## Harness Targets

### Shared Agents Target

Writes:

```txt
~/.agents/skills/unship/SKILL.md
```

This target supports Codex-style and Antigravity-style agents that load the shared `.agents` skills root.

### Claude Code Target

Writes:

```txt
~/.claude/skills/unship/SKILL.md
~/.claude/commands/unship.md
```

The slash command must be a tiny shim:

```markdown
Use the Unship skill for this request. Interpret arguments as target, count, style, or scope: $ARGUMENTS
```

It must not duplicate the skill workflow or contain CLI lifecycle commands. This prevents stale slash commands from diverging from the skill.

Known stale legacy files should be detected:

```txt
~/.claude/commands/unship.md
~/.claude/commands/unship-batch.md
~/.claude/commands/unship-docs.md
~/.agents/skills/unship-design/SKILL.md
~/.claude/skills/unship-design/SKILL.md
```

If they contain old Unship task-board or patch-session wording, `install` should offer to remove or replace them.

### OpenCode Target

Writes:

```txt
~/.opencode/skills/unship/SKILL.md
~/.opencode/commands/unship.md
```

Enable writes only when the CLI can verify these global paths from documented OpenCode conventions or an existing local OpenCode config directory. If verification fails, report manual instructions instead of guessing.

### Future Harnesses

Add new harnesses through a data-driven target registry rather than branching throughout the CLI. Each target declares:

- display name;
- detection paths;
- files to write;
- stale legacy paths;
- whether slash commands are supported;
- invocation hint;
- whether global writing is safe.

Cursor, Windsurf, and other MCP-centric tools can be added later if their user-level config conventions are stable enough. Until then, the fallback is a copy-paste agent bootstrap prompt.

## Project Setup

When `install` is run inside a project, it should reuse existing `doctor` and `setup` logic:

1. Run project inspection.
2. Detect framework and existing picker state.
3. If an app shell exists and setup is missing or stale, offer `setup --framework auto`.
4. If no app shell exists, report that project setup will be deferred.
5. If current project setup returns manual instructions, surface them in the final result.

Project setup is separate from harness setup because users often install global harness support once, then use Unship across many repos.

## Idempotency

Every managed file should have one of these states:

- `missing`: planned install can write it.
- `current`: no write needed.
- `stale-managed`: known Unship file differs from the bundled template.
- `legacy`: known old Unship file from retired task-board or patch-session flows.
- `user-modified`: file path overlaps with an Unship target but content is not confidently managed.
- `unsupported`: target cannot be safely written on this system.

Rerunning `install` should never duplicate content. It should skip current files, refresh stale managed files only when confirmed or forced, and avoid overwriting user-modified files without explicit `--force`.

## Detection Rules

Harness detection should be conservative:

- Claude Code is detected when `~/.claude` exists or Claude-specific project history/config exists.
- Shared agents are considered available when the home directory is writable; this target can always be offered.
- OpenCode is detected when `~/.opencode` exists.
- A harness can still be explicitly requested even if not detected.

Legacy detection should match specific files and content markers such as:

- `unship next`;
- `unship repair`;
- `project companion skill`;
- `patch-session`;
- `unship-design`;
- old source-swapping workflow language.

Do not delete arbitrary files merely because their path or text contains `unship`.

## Output

Plain output should be short and action-oriented:

```txt
Unship install complete.

Claude Code skill: installed
Claude /unship command: installed
Codex/Antigravity skill: current
Legacy Claude task command: removed
Project picker: deferred, no app shell detected

Restart your agent. Then run /unship or ask: use unship to generate 3 hero variants.
```

JSON output should include:

```json
{
  "ok": true,
  "dryRun": false,
  "harnesses": [
    {
      "id": "claude",
      "name": "Claude Code",
      "detected": true,
      "status": "installed",
      "files": [
        {
          "path": "/Users/example/.claude/skills/unship/SKILL.md",
          "status": "written"
        }
      ]
    }
  ],
  "legacy": [
    {
      "path": "/Users/example/.claude/commands/unship.md",
      "status": "removed",
      "reason": "legacy task-board command"
    }
  ],
  "project": {
    "included": false,
    "status": "deferred",
    "reason": "no app shell detected"
  },
  "next": [
    "Restart your agent.",
    "Use /unship where available, or ask naturally: use unship to generate 3 variants of the hero section."
  ]
}
```

## Uninstall

```bash
npx @unship/cli@latest uninstall
npx @unship/cli@latest uninstall --harness claude,codex --yes
npx @unship/cli@latest uninstall --all --yes
npx @unship/cli@latest uninstall --project --yes
```

Default interactive uninstall should remove user-level managed Unship harness files, including known legacy files, after confirmation.

Project uninstall should remove picker files and dev-only mounts only when they match managed setup patterns. It should not remove `data-unship-pick` source variants; users must settle or clean variants through the agent workflow and verify with `unship check`.

## Copy-Paste Agent Bootstrap

Docs should include an escape hatch for unsupported harnesses:

```txt
Set up Unship for this coding agent. Run `npx -y @unship/cli@latest install --dry-run --json`, inspect the harness and project state, then install the correct Unship skill or slash-command shim for this environment. Use `npx -y @unship/cli@latest doctor --json` to verify project setup. Do not use legacy commands such as `unship next`.
```

This prompt is a fallback, not the primary path.

## Error Handling

- If the target directory cannot be created, report the exact path and skip that target.
- If a file exists and is user-modified, report it and require `--force` before overwriting.
- If an interactive prompt is required in a noninteractive terminal, exit nonzero with a `--yes` suggestion.
- If project setup fails, keep harness installation results and report project setup separately.
- If npm package execution is offline or unavailable, the command cannot install; docs should mention rerunning once network is available.
- If multiple harnesses are detected, install all selected targets and report per-target status.

## Testing Strategy

Add tests for:

- `install --dry-run --json` reports shared agents, Claude, legacy files, and project setup state without writing.
- `install --all --yes --json` writes shared and Claude targets in a temp home.
- rerunning install reports files as current and does not duplicate content.
- stale managed files refresh with `--repair --yes`.
- user-modified files are skipped without `--force`.
- legacy Claude `unship next` command is detected and removed when repair is confirmed.
- Claude slash command is a shim and does not contain full workflow or CLI lifecycle commands.
- project setup can be included or skipped independently.
- noninteractive install without `--yes`, `--json`, or `--dry-run` exits with a clear error.
- `uninstall --all --yes --json` removes only managed and known legacy files.

Existing package smoke tests should be updated if new template files are added to the published package.

## Migration

This is a compatible expansion:

- Existing `install-skill` remains valid.
- Existing `init` remains valid for repo-local committed instructions.
- Existing skills continue to work after refresh.
- Old legacy task-board or patch-session commands can be detected and removed.
- README should promote `install` as the default path and move `install-skill` to an advanced compatibility section.

## Deferred Follow-Ups

- Verify global OpenCode user paths before enabling OpenCode writes by default. Until then, OpenCode can be explicit/manual in the installer output.
- Do not add Cursor and Windsurf until their skill or command install conventions are stable enough for deterministic writes.
- If a future standard installer such as `add-mcp` supports skills or slash commands broadly, Unship can integrate with it instead of maintaining every harness target itself.
