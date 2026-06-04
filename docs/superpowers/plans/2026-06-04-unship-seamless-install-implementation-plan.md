# Unship Seamless Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a re-runnable `unship install` / `unship uninstall` flow that installs known harness support, repairs stale legacy Unship files, supports dry-run/JSON inspection, and keeps project setup optional and conservative.

**Status:** Completed and verified with `npm run verify` on 2026-06-04.

**Architecture:** Add a focused `src/install/index.js` module that owns global harness detection, file-state classification, install planning, uninstall planning, and application. Keep `src/cli/index.js` as command routing, flag parsing, and output formatting. Reuse existing agent templates and setup/check modules instead of duplicating picker or scanner behavior.

**Tech Stack:** Node.js ESM, built-in `fs/promises`, existing `node:test` coverage, no runtime dependencies.

---

### Task 1: Templates, Flags, And Dry-Run Planning

**Files:**
- Modify: `src/agent/index.js`
- Create: `src/install/index.js`
- Modify: `src/cli/index.js`
- Modify: `test/cli.test.js`

- [x] **Step 1: Write failing tests for help, print-skill, dry-run, and temp HOME isolation**

Add helpers near the top of `test/cli.test.js`:

```js
async function runCliWithHome(args, cwd, home) {
  return runCli(args, cwd, {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    CLAUDE_CONFIG_DIR: join(home, ".claude")
  });
}
```

Update `runCli` to accept an env override:

```js
async function runCli(args, cwd, env = {}) {
  const child = spawn(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
  // existing stdout/stderr/status collection remains unchanged
}
```

Add tests:

```js
test("help lists seamless install commands", () => {
  const result = spawnSync(process.execPath, [CLI, "help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /install/);
  assert.match(result.stdout, /uninstall/);
  assert.match(result.stdout, /install-skill/);
});

test("install print-skill outputs the bundled skill without writing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  const result = await runCliWithHome(["install", "--print-skill"], cwd, home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /name: unship/);
  assert.match(result.stdout, /Fast Start/);
  await assert.rejects(readFile(join(home, ".agents", "skills", "unship", "SKILL.md"), "utf8"));
});

test("install dry-run json plans shared and claude targets inside temp home", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await mkdir(join(home, ".claude"), { recursive: true });

  const result = await runCliWithHome(["install", "--dry-run", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.dryRun, true);
  assert.equal(json.harnesses.some((item) => item.id === "agents"), true);
  assert.equal(json.harnesses.some((item) => item.id === "claude"), true);
  assert.equal(JSON.stringify(json).includes(home), true);
  assert.equal(JSON.stringify(json).includes(process.env.HOME), false);
});
```

- [x] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test test/cli.test.js --test-name-pattern "help lists seamless|print-skill|dry-run json"
```

Expected: fail because `install`, `uninstall`, `--print-skill`, and temp-home planning are not implemented.

- [x] **Step 3: Add `claudeCommand` template**

In `src/agent/index.js`, extend `getAgentTemplates()`:

```js
const claudeCommand = "Use the Unship skill for this request. Interpret arguments as target, count, style, or scope: $ARGUMENTS\n";
```

Return it:

```js
return {
  skill,
  agents,
  claude: '@AGENTS.md\n\nUse `/unship` or the `unship` skill for temporary local UI variant comparison.\n',
  claudeCommand,
  opencodeCommand: "---\ndescription: Create temporary local UI variants with Unship\n---\n\nUse the Unship skill for this request. Interpret arguments as the target, count, style, or scope: $ARGUMENTS\n"
};
```

- [x] **Step 4: Create installer planning skeleton**

Create `src/install/index.js` with exports:

```js
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getAgentTemplates } from "../agent/index.js";

const TARGETS = [
  {
    id: "agents",
    name: "Shared .agents skill",
    aliases: ["agents", "codex", "antigravity"],
    files: [{ role: "skill", relativePath: ".agents/skills/unship/SKILL.md", template: "skill" }],
    legacy: [{ relativePath: ".agents/skills/unship-design/SKILL.md", marker: /patch-session|unship-design|Legacy Unship/i }]
  },
  {
    id: "claude",
    name: "Claude Code",
    aliases: ["claude"],
    detectPath: ".claude",
    files: [
      { role: "skill", relativePath: ".claude/skills/unship/SKILL.md", template: "skill" },
      { role: "command", relativePath: ".claude/commands/unship.md", template: "claudeCommand", requiresRole: "skill" }
    ],
    legacy: [
      { relativePath: ".claude/commands/unship.md", marker: /unship next|project companion skill|unship repair/i, replacementRole: "command" },
      { relativePath: ".claude/commands/unship-batch.md", marker: /unship-batch|parallel task processing/i },
      { relativePath: ".claude/commands/unship-docs.md", marker: /unship-docs|project docs/i },
      { relativePath: ".claude/skills/unship-design/SKILL.md", marker: /patch-session|unship-design|Legacy Unship/i }
    ]
  }
];

export async function planInstall(options = {}) {
  const context = await buildContext(options);
  if (context.printSkill) return { ok: true, printSkill: true, skill: context.templates.skill };
  return buildInstallPlan(context);
}

export async function applyInstallPlan(plan) {
  return applyPlan(plan);
}

export async function planUninstall(options = {}) {
  const context = await buildContext(options);
  return buildUninstallPlan(context);
}

export async function applyUninstallPlan(plan) {
  return applyPlan(plan);
}
```

Implement `buildContext`, target normalization, file existence helpers, and dry-run `buildInstallPlan()` enough to return `ok`, `dryRun`, `harnesses`, `legacy`, `project`, and `next`.

- [x] **Step 5: Wire CLI commands and parser flags**

In `src/cli/index.js`, import installer functions:

```js
import { applyInstallPlan, applyUninstallPlan, planInstall, planUninstall } from "../install/index.js";
```

Add command branches before `init`:

```js
if (command === "install") {
  const plan = await planInstall(installOptions(flags));
  if (plan.printSkill) console.log(plan.skill);
  else {
    const result = flags["dry-run"] ? plan : await applyInstallPlan(plan);
    printInstallResult(result, flags.json);
    if (!result.ok) process.exitCode = 1;
  }
} else if (command === "uninstall") {
  const plan = await planUninstall(installOptions(flags));
  const result = flags["dry-run"] ? plan : await applyUninstallPlan(plan);
  printInstallResult(result, flags.json);
  if (!result.ok) process.exitCode = 1;
} else if (command === "init") {
  // existing branch
}
```

Extend `parseFlags()` for `--all`, `--yes`, `--repair`, `--no-project`, `--print-skill`, and `--harness`.

- [x] **Step 6: Run focused tests and verify pass**

Run:

```bash
node --test test/cli.test.js --test-name-pattern "help lists seamless|print-skill|dry-run json"
```

Expected: pass.

### Task 2: Install Writes, Idempotency, Legacy Repair, And Safety

**Files:**
- Modify: `src/install/index.js`
- Modify: `src/cli/index.js`
- Modify: `test/cli.test.js`

- [x] **Step 1: Write failing install behavior tests**

Add tests:

```js
test("install all yes writes shared and claude targets then reruns current", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await mkdir(join(home, ".claude"), { recursive: true });

  const first = await runCliWithHome(["install", "--all", "--yes", "--json"], cwd, home);
  assert.equal(first.status, 0, first.stderr);
  const firstJson = JSON.parse(first.stdout);
  assert.equal(firstJson.ok, true);
  assert.match(await readFile(join(home, ".agents", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  assert.match(await readFile(join(home, ".claude", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  assert.match(await readFile(join(home, ".claude", "commands", "unship.md"), "utf8"), /Use the Unship skill/);
  assert.doesNotMatch(await readFile(join(home, ".claude", "commands", "unship.md"), "utf8"), /unship next/);

  const second = await runCliWithHome(["install", "--all", "--yes", "--json"], cwd, home);
  assert.equal(second.status, 0, second.stderr);
  const secondJson = JSON.parse(second.stdout);
  assert.equal(JSON.stringify(secondJson).includes('"status":"current"'), true);
});

test("install repairs legacy claude command into shim", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await writeFixture(join(home, ".claude", "commands", "unship.md"), "Run `unship next --json` at session start.\n");

  const result = await runCliWithHome(["install", "--harness", "claude", "--repair", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.legacy.some((item) => item.status === "legacy-replaced-with-shim"), true);
  const command = await readFile(join(home, ".claude", "commands", "unship.md"), "utf8");
  assert.match(command, /Use the Unship skill/);
  assert.doesNotMatch(command, /unship next/);
});

test("install skips user modified skill and blocks claude command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await writeFixture(join(home, ".claude", "skills", "unship", "SKILL.md"), "# My custom skill\n");

  const result = await runCliWithHome(["install", "--harness", "claude", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(JSON.stringify(json).includes("user-modified"), true);
  assert.equal(JSON.stringify(json).includes("blocked-missing-skill"), true);
  await assert.rejects(readFile(join(home, ".claude", "commands", "unship.md"), "utf8"));
});

test("install json without yes is not consent to write", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  const result = await runCliWithHome(["install", "--json"], cwd, home);
  assert.equal(result.status, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.match(json.error, /--yes/);
});
```

- [x] **Step 2: Run tests and verify failure**

Run:

```bash
node --test test/cli.test.js --test-name-pattern "install all yes|repairs legacy|user modified|json without yes"
```

Expected: fail until installer application logic exists.

- [x] **Step 3: Implement file classification and plan application**

In `src/install/index.js`, implement:

```js
function classifyContent({ text, expected, legacyMarker }) {
  if (text === null) return "missing";
  if (text === expected) return "current";
  if (legacyMarker?.test(text)) return "legacy";
  if (hasStrongUnshipMarker(text)) return "stale-managed";
  return "user-modified";
}

function operationForState(state, { dryRun, repair, force, explicit }) {
  if (state === "missing") return dryRun ? "would-write" : "write";
  if (state === "current") return "skip";
  if (state === "stale-managed") return repair || force ? (dryRun ? "would-write" : "write") : "skip";
  if (state === "legacy") return repair || force ? (dryRun ? "would-replace" : "replace") : "skip";
  if (state === "user-modified") return force && explicit ? (dryRun ? "would-write" : "write") : "skip";
  return "manual";
}
```

Ensure Claude command planning checks the planned/current skill result before writing the slash command.

- [x] **Step 4: Implement applyPlan writes/removes**

Use `mkdir(dirname(path), { recursive: true })`, `writeFile(path, content, "utf8")`, and `rm(path, { force: true, recursive: true })` only for planned operations. Never delete paths not produced by the plan.

- [x] **Step 5: Run focused tests and verify pass**

Run:

```bash
node --test test/cli.test.js --test-name-pattern "install all yes|repairs legacy|user modified|json without yes"
```

Expected: pass.

### Task 3: Uninstall, Project Setup Inclusion, And Compatibility Locks

**Files:**
- Modify: `src/install/index.js`
- Modify: `src/setup/index.js`
- Modify: `src/cli/index.js`
- Modify: `test/cli.test.js`

- [x] **Step 1: Write failing tests for uninstall and install-skill compatibility**

Add tests:

```js
test("uninstall all yes removes managed harness files and legacy files only", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await runCliWithHome(["install", "--all", "--yes", "--json"], cwd, home);
  await writeFixture(join(home, ".claude", "commands", "unship-batch.md"), "# unship-batch\nparallel task processing\n");
  await writeFixture(join(home, ".claude", "commands", "custom-unship.md"), "I mention Unship but am custom.\n");

  const result = await runCliWithHome(["uninstall", "--all", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(readFile(join(home, ".agents", "skills", "unship", "SKILL.md"), "utf8"));
  await assert.rejects(readFile(join(home, ".claude", "commands", "unship-batch.md"), "utf8"));
  assert.match(await readFile(join(home, ".claude", "commands", "custom-unship.md"), "utf8"), /custom/);
});

test("install can include project setup while no-project skips it", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ devDependencies: { vite: "6.0.0" } }));
  await writeFixture(join(cwd, "index.html"), "<div id=\"root\"></div>\n</body>\n");

  const skipped = await runCliWithHome(["install", "--all", "--no-project", "--yes", "--json"], cwd, home);
  assert.equal(skipped.status, 0, skipped.stderr);
  await assert.rejects(readFile(join(cwd, "public", "unship-picker.js"), "utf8"));

  const included = await runCliWithHome(["install", "--project", "--yes", "--json"], cwd, home);
  assert.equal(included.status, 0, included.stderr);
  assert.match(await readFile(join(cwd, "public", "unship-picker.js"), "utf8"), /__unshipPicker/);
});

test("install-skill remains skill only", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  const skillRoot = join(home, "skills");
  await writeFixture(join(home, ".claude", "commands", "unship.md"), "Run unship next --json\n");

  const result = await runCliWithHome(["install-skill", "--dir", skillRoot, "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(join(skillRoot, "unship", "SKILL.md"), "utf8"), /name: unship/);
  assert.match(await readFile(join(home, ".claude", "commands", "unship.md"), "utf8"), /unship next/);
});
```

- [x] **Step 2: Run tests and verify failure**

Run:

```bash
node --test test/cli.test.js --test-name-pattern "uninstall all yes|include project|install-skill remains"
```

Expected: fail until uninstall/project integration exists.

- [x] **Step 3: Implement uninstall planning and project setup integration**

In `src/install/index.js`, add `project` planning:

```js
async function planProject({ root, includeProject, dryRun }) {
  if (!includeProject) return { included: false, status: "skipped" };
  const setup = await setupProject({ root, framework: "auto", dryRun });
  return { included: true, status: setup.ok ? "planned" : "failed", setup };
}
```

For install, call setup only when `--project` is explicit or interactive confirmation includes project setup. For this implementation, noninteractive `--all` does not imply project setup.

For uninstall, remove only managed harness files and known legacy files. Project uninstall can initially report `manual` unless exact managed removal helpers are implemented; do not remove variants.

- [x] **Step 4: Run focused tests and verify pass**

Run:

```bash
node --test test/cli.test.js --test-name-pattern "uninstall all yes|include project|install-skill remains"
```

Expected: pass.

### Task 4: Docs, Package Smoke, And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `RELEASE.md`
- Modify: `test/package-smoke.test.js`
- Modify: `package.json`

- [x] **Step 1: Write failing package smoke expectations**

Update `test/package-smoke.test.js` expected file list to include:

```js
"src/install/index.js",
```

Add a tarball smoke test:

```js
test("packed package smoke runs seamless install commands", async () => {
  const packResult = spawnSync("npm", ["pack", "--json", "--pack-destination", tmpdir()], { encoding: "utf8" });
  assert.equal(packResult.status, 0, packResult.stderr);
  const tarball = JSON.parse(packResult.stdout)[0].filename;
  // install into temp consumer, then run ./node_modules/.bin/unship install --dry-run --json,
  // install-skill --dir <tmp> --json, and uninstall --dry-run --json
});
```

- [x] **Step 2: Run package smoke and verify failure**

Run:

```bash
node --test test/package-smoke.test.js
```

Expected: fail until package contents/docs are updated.

- [x] **Step 3: Update package files and docs**

Update `package.json` files array if needed; current `"src"` entry should include `src/install/index.js`, but package smoke must assert it.

Update README primary install section:

```md
## Install

Run the smart installer:

```bash
npx @unship/cli@latest install
```

It installs known agent harness support, adds `/unship` where available, and can be re-run to repair or refresh setup.
```

Move `install-skill` to advanced compatibility.

Update `docs/README.md` active source list to include this spec near the top. Update `RELEASE.md` smoke commands to include:

```bash
npm exec @unship/cli@next -- install --dry-run --json
```

- [x] **Step 4: Run verification**

Run:

```bash
npm run verify
```

Expected: all check, tests, e2e, and dry-run pack pass.

- [x] **Step 5: Commit implementation**

Run:

```bash
git add src/agent/index.js src/cli/index.js src/install/index.js src/setup/index.js test/cli.test.js test/package-smoke.test.js README.md docs/README.md RELEASE.md docs/superpowers/specs/2026-06-04-unship-seamless-install-design.md docs/superpowers/plans/2026-06-04-unship-seamless-install-implementation-plan.md
git commit -m "feat: add seamless unship installer"
```

Expected: commit succeeds. Leave unrelated untracked scratch directories untouched.

---

## Self-Review

- Spec coverage: the plan covers smart `install`, `uninstall`, harness aliases, Claude shim, legacy repair, `--json` consent, temp HOME isolation, project setup opt-in, docs, release smoke, and package contents.
- Scope boundary: project uninstall remains conservative and should not remove source variants. Exact managed source-mount removal can be expanded only when helpers are safe.
- No runtime dependencies are introduced.
