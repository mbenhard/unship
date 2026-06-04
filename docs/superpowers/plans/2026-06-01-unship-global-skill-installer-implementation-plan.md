# Unship Global Skill Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-party `npx @unship/cli@latest install-skill` command so users can install the global Unship skill once, then let agents configure each project on demand.

**Architecture:** Reuse the existing bundled skill template from `src/agent/index.js`. Keep global skill installation in the CLI layer because it is a small file-copy workflow, while project setup remains in `src/setup/index.js`. The installed skill must use a noninteractive `npx -y @unship/cli@latest` fallback when a project has no local Unship dependency.

**Tech Stack:** Node 20+, ESM, `node:test`, no runtime dependencies.

---

## File Map

- Modify `src/cli/index.js`: route `install-skill`, write global skill files, stale-check managed destination, update help text.
- Modify `agent/skills/unship/SKILL.md`: teach the global skill how to choose between local `npx @unship/cli` and remote `npx -y @unship/cli@latest`.
- Modify `README.md`: make one-time global install the primary onboarding path and repo-local `init` the fallback.
- Modify `docs/superpowers/specs/2026-06-01-unship-instant-picker-technical-spec.md`: add the new command contract to the technical spec.
- Modify `test/cli.test.js`: add red-green coverage for the new command and skill wording.

## Task 1: CLI Global Skill Install Command

**Files:**
- Modify: `test/cli.test.js`
- Modify: `src/cli/index.js`

- [x] **Step 1: Write the failing test**

Add these tests to `test/cli.test.js` near the init tests:

```js
test("install-skill writes the global agents skill", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const skillRoot = join(cwd, "global-skills");

  const result = spawnSync(process.execPath, [CLI, "install-skill", "--dir", skillRoot, "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.written.includes(join(skillRoot, "unship", "SKILL.md")), true);
  const skill = await readFile(join(skillRoot, "unship", "SKILL.md"), "utf8");
  assert.match(skill, /name: unship/);
  assert.match(skill, /npx -y @unship\/cli@latest/);
});

test("install-skill skips, fails stale, and refreshes with force", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const skillRoot = join(cwd, "global-skills");

  const first = spawnSync(process.execPath, [CLI, "install-skill", "--dir", skillRoot, "--json"], { cwd, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);

  const second = spawnSync(process.execPath, [CLI, "install-skill", "--dir", skillRoot, "--json"], { cwd, encoding: "utf8" });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).skipped.includes(join(skillRoot, "unship", "SKILL.md")), true);

  await writeFixture(join(skillRoot, "unship", "SKILL.md"), "---\nname: unship\n---\nstale\n");

  const stale = spawnSync(process.execPath, [CLI, "install-skill", "--dir", skillRoot, "--json"], { cwd, encoding: "utf8" });
  assert.equal(stale.status, 1);
  const staleJson = JSON.parse(stale.stdout);
  assert.equal(staleJson.ok, false);
  assert.equal(staleJson.stale.includes(join(skillRoot, "unship", "SKILL.md")), true);
  assert.match(staleJson.next.join("\n"), /install-skill --force/);

  const forced = spawnSync(process.execPath, [CLI, "install-skill", "--dir", skillRoot, "--force", "--json"], { cwd, encoding: "utf8" });
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(JSON.parse(forced.stdout).written.includes(join(skillRoot, "unship", "SKILL.md")), true);
  assert.doesNotMatch(await readFile(join(skillRoot, "unship", "SKILL.md"), "utf8"), /stale/);
});
```

- [x] **Step 2: Run the failing tests**

Run:

```bash
npm test -- test/cli.test.js
```

Expected: FAIL because `install-skill` is not routed and the skill does not yet contain `npx -y @unship/cli@latest`.

- [x] **Step 3: Implement the command**

In `src/cli/index.js`, import `homedir` and `join`:

```js
import { homedir } from "node:os";
import { dirname, join } from "node:path";
```

Add a route after `init`:

```js
  } else if (command === "install-skill") {
    const result = await installSkill({
      dir: flags.dir || join(homedir(), ".agents", "skills"),
      force: Boolean(flags.force)
    });
    print(result, flags.json);
    if (!result.ok) process.exitCode = 1;
```

Add flag parsing:

```js
else if (item === "--dir") parsed.dir = items[++index];
```

Add the helper:

```js
async function installSkill({ dir, force }) {
  const templates = await getAgentTemplates();
  const destination = join(dir, "unship", "SKILL.md");
  const written = [];
  const skipped = [];
  const stale = [];

  await mkdir(dirname(destination), { recursive: true });
  try {
    const existing = await readFile(destination, "utf8");
    if (existing === templates.skill) {
      skipped.push(destination);
    } else if (!force) {
      stale.push(destination);
      skipped.push(destination);
    } else {
      await writeFile(destination, templates.skill, "utf8");
      written.push(destination);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(destination, templates.skill, "utf8");
    written.push(destination);
  }

  return {
    ok: stale.length === 0,
    written,
    skipped,
    stale,
    next: stale.length
      ? ["Run npx @unship/cli@latest install-skill --force to refresh the stale global Unship skill."]
      : ["Restart your agent, then ask: use unship to generate 3 variants of the hero section."]
  };
}
```

Update help:

```js
console.log("Usage: unship init|install-skill|setup|snippet|check|doctor");
```

- [x] **Step 4: Run the tests**

Run:

```bash
npm test -- test/cli.test.js
```

Expected: still FAIL until Task 2 updates the skill wording.

## Task 2: Global Skill CLI Fallback

**Files:**
- Modify: `agent/skills/unship/SKILL.md`
- Modify: `test/cli.test.js`

- [x] **Step 1: Write or confirm failing assertion**

Confirm `test/cli.test.js` asserts:

```js
assert.match(skill, /npx -y @unship\/cli@latest/);
```

- [x] **Step 2: Update the skill Fast Start**

Replace the Fast Start opening in `agent/skills/unship/SKILL.md` with:

```md
Before reading package internals or searching `node_modules`, choose the CLI prefix:

- If this project already lists `@unship/cli` in `package.json`, use `npx @unship/cli`.
- Otherwise use `npx -y @unship/cli@latest` so npm does not stop for an install prompt.

Ask the CLI what is already true:

```bash
npx -y @unship/cli@latest doctor --json
```
```

Then keep the existing setup/check commands but allow either prefix:

```md
Use the same prefix for every CLI call in this project. Do not assume a bare `unship` binary is on PATH.
```

- [x] **Step 3: Run the tests**

Run:

```bash
npm test -- test/cli.test.js
```

Expected: PASS.

## Task 3: Documentation Alignment

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-06-01-unship-instant-picker-technical-spec.md`

- [x] **Step 1: Update README onboarding**

Make the top of `README.md` lead with:

```md
## Install The Global Skill

```bash
npx @unship/cli@latest install-skill
```

After restarting your agent, ask naturally:

```txt
use unship to generate 3 variants of the hero section
```

The installed skill runs `npx -y @unship/cli@latest doctor --json` and `npx -y @unship/cli@latest setup --framework auto --json` inside each project as needed.
```

Move repo-local `npx @unship/cli@latest init` under a fallback heading.

- [x] **Step 2: Update the technical spec**

Add a `unship install-skill` section describing:

- default destination `~/.agents/skills/unship/SKILL.md`;
- `--dir`, `--force`, and `--json`;
- stale-file nonzero behavior;
- JSON shape with `written`, `skipped`, `stale`, and `next`;
- `init` is repo-local fallback.

- [x] **Step 3: Run package verification**

Run:

```bash
npm run verify
```

Expected: syntax checks pass, all tests pass, package dry-run succeeds.

## Self-Review

- Spec coverage: Task 1 covers the new command and stale semantics. Task 2 covers the global skill runtime prefix. Task 3 covers docs and technical spec alignment.
- Placeholder scan: no TODO/TBD placeholders remain.
- Scope check: no registry, MCP server, browser-agent sync, or runtime dependency is included.
