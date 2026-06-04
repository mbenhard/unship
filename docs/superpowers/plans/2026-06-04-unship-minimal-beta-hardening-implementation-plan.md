# Unship Minimal Beta Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add minimal beta hardening for update awareness, setup trust, cleanup confidence, and installed agent guidance without expanding Unship's command surface.

**Architecture:** Add a tiny dependency-free update helper and wire it into `doctor` plus plain `install` output. Keep cleanup intelligence in `src/check/index.js` by deriving a summary from existing diagnostics/explorations. Update README and bundled skill text so user-facing and agent-facing guidance matches the new CLI behavior.

**Tech Stack:** Node.js ESM, built-in `fetch`/`AbortController`, `node:test`, existing CLI spawn tests, no runtime dependencies.

---

## Scope Check

The approved design covers one coherent subsystem: beta trust hardening around the existing CLI, checker, docs, and installed skill. Do not add config files, cleanup mutators, browser automation, support bundles, telemetry, new framework setup, or automatic updates.

The worktree may already contain unrelated modified files and untracked local test apps. Before implementation, inspect `git status --short` and avoid reverting or staging changes outside this plan.

## File Structure

- Create `src/update/index.js`: dependency-free npm latest-version lookup and numeric version comparison.
- Create `test/update.test.js`: direct unit tests for update lookup success, disabled checks, network failure, and version comparison.
- Modify `src/cli/index.js`: parse `--no-update-check`, wire update status into `doctor`, improve `doctor.next`, add update hints to plain `install`, and print clearer `doctor`/`check` output.
- Modify `src/check/index.js`: add `summary` derived from diagnostics and explorations.
- Modify `test/check.test.js`: assert summary shape from the programmatic checker.
- Modify `test/cli.test.js`: assert update-aware `doctor`, clearer `install` next actions, and plain `check` summary output.
- Modify `test/package-smoke.test.js`: include `src/update/index.js` in packed contents and avoid live update checks in smoke commands.
- Modify `README.md`: add local-only trust and `/unship` troubleshooting guidance.
- Modify `agent/skills/unship/SKILL.md`: strengthen handoff, stale-state, ambiguity, and cleanup instructions.
- Modify `test/cli.test.js` skill assertions: protect key installed-skill wording.
- Modify `docs/README.md` and `docs/plans/current-run.md`: include the new spec/plan in project direction and current-run state.

## Task 1: Update Lookup Helper

**Files:**
- Create: `test/update.test.js`
- Create: `src/update/index.js`

- [ ] **Step 1: Write failing update helper tests**

Create `test/update.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { checkForUpdates, compareVersions } from "../src/update/index.js";

function response(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    async json() {
      return body;
    }
  };
}

test("compareVersions handles numeric npm versions", () => {
  assert.equal(compareVersions("0.1.1", "0.1.2"), -1);
  assert.equal(compareVersions("0.1.2", "0.1.1"), 1);
  assert.equal(compareVersions("0.1.1", "0.1.1"), 0);
  assert.equal(compareVersions("v0.1.1", "0.1.1"), 0);
  assert.equal(compareVersions("0.1.1-beta.1", "0.1.1"), null);
  assert.equal(compareVersions("not-a-version", "0.1.1"), null);
});

test("checkForUpdates reports a newer npm latest version", async () => {
  let requestedUrl = "";
  const result = await checkForUpdates({
    packageName: "@unship/cli",
    currentVersion: "0.1.1",
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return response({ "dist-tags": { latest: "0.1.2" } });
    }
  });

  assert.equal(requestedUrl.endsWith("/%40unship%2Fcli"), true);
  assert.deepEqual(result, {
    checked: true,
    available: true,
    current: "0.1.1",
    latest: "0.1.2",
    next: "Run npx @unship/cli@latest install --repair to refresh managed Unship files."
  });
});

test("checkForUpdates reports current when latest matches", async () => {
  const result = await checkForUpdates({
    packageName: "@unship/cli",
    currentVersion: "0.1.1",
    fetchImpl: async () => response({ "dist-tags": { latest: "0.1.1" } })
  });

  assert.deepEqual(result, {
    checked: true,
    available: false,
    current: "0.1.1",
    latest: "0.1.1"
  });
});

test("checkForUpdates can be disabled", async () => {
  const result = await checkForUpdates({
    packageName: "@unship/cli",
    currentVersion: "0.1.1",
    disabled: true,
    fetchImpl: async () => {
      throw new Error("should not fetch");
    }
  });

  assert.deepEqual(result, {
    checked: false,
    reason: "disabled"
  });
});

test("checkForUpdates degrades quietly when npm is unavailable", async () => {
  const result = await checkForUpdates({
    packageName: "@unship/cli",
    currentVersion: "0.1.1",
    fetchImpl: async () => {
      throw new Error("offline");
    }
  });

  assert.deepEqual(result, {
    checked: true,
    available: null,
    current: "0.1.1",
    latest: null,
    error: "unavailable"
  });
});

test("checkForUpdates reports unknown comparison without claiming an update", async () => {
  const result = await checkForUpdates({
    packageName: "@unship/cli",
    currentVersion: "0.1.1-beta.1",
    fetchImpl: async () => response({ "dist-tags": { latest: "0.1.1" } })
  });

  assert.deepEqual(result, {
    checked: true,
    available: null,
    current: "0.1.1-beta.1",
    latest: "0.1.1",
    comparison: "unknown"
  });
});
```

- [ ] **Step 2: Run update tests and verify they fail**

Run:

```bash
node --test test/update.test.js
```

Expected: FAIL with an import/module error because `src/update/index.js` does not exist.

- [ ] **Step 3: Implement update helper**

Create `src/update/index.js`:

```js
const DEFAULT_REGISTRY_URL = "https://registry.npmjs.org";
const UPDATE_NEXT = "Run npx @unship/cli@latest install --repair to refresh managed Unship files.";

export async function checkForUpdates({
  packageName,
  currentVersion,
  disabled = false,
  registryUrl = process.env.UNSHIP_NPM_REGISTRY || DEFAULT_REGISTRY_URL,
  timeoutMs = 800,
  fetchImpl = globalThis.fetch
} = {}) {
  if (disabled) return { checked: false, reason: "disabled" };
  if (!packageName || !currentVersion || typeof fetchImpl !== "function") {
    return unavailable(currentVersion);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(registryPackageUrl(registryUrl, packageName), {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
    const body = await response.json();
    const latest = body?.["dist-tags"]?.latest || body?.version || null;
    if (!latest) throw new Error("npm registry response did not include a latest version");

    const comparison = compareVersions(currentVersion, latest);
    if (comparison === null) {
      return {
        checked: true,
        available: null,
        current: currentVersion,
        latest,
        comparison: "unknown"
      };
    }

    const available = comparison < 0;
    return {
      checked: true,
      available,
      current: currentVersion,
      latest,
      ...(available ? { next: UPDATE_NEXT } : {})
    };
  } catch {
    return unavailable(currentVersion);
  } finally {
    clearTimeout(timeout);
  }
}

export function compareVersions(current, latest) {
  const currentParsed = parseNumericVersion(current);
  const latestParsed = parseNumericVersion(latest);
  if (!currentParsed || !latestParsed) return null;
  for (let index = 0; index < 3; index += 1) {
    if (currentParsed.parts[index] < latestParsed.parts[index]) return -1;
    if (currentParsed.parts[index] > latestParsed.parts[index]) return 1;
  }
  if (currentParsed.clean !== latestParsed.clean) return null;
  return 0;
}

function parseNumericVersion(value) {
  const clean = String(value || "").trim().replace(/^v/i, "");
  const [core] = clean.split(/[+-]/);
  if (!/^\d+(?:\.\d+){0,2}$/.test(core)) return null;
  const parts = core.split(".").map((part) => Number(part));
  while (parts.length < 3) parts.push(0);
  return { clean, core, parts };
}

function registryPackageUrl(registryUrl, packageName) {
  return `${String(registryUrl || DEFAULT_REGISTRY_URL).replace(/\/+$/, "")}/${encodeURIComponent(packageName)}`;
}

function unavailable(currentVersion) {
  return {
    checked: true,
    available: null,
    current: currentVersion,
    latest: null,
    error: "unavailable"
  };
}
```

- [ ] **Step 4: Run update tests and verify they pass**

Run:

```bash
node --test test/update.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit update helper**

Run:

```bash
git add src/update/index.js test/update.test.js
git commit -m "feat: add unship update checker"
```

## Task 2: Wire Update Awareness Into Doctor And Install

**Files:**
- Modify: `src/cli/index.js`
- Modify: `test/cli.test.js`

- [ ] **Step 1: Write failing CLI update-awareness tests**

In `test/cli.test.js`, update the existing `doctor` tests to pass `--no-update-check` where they are not testing update behavior:

```js
const result = spawnSync(process.execPath, [CLI, "doctor", "--json", "--no-update-check"], { cwd, encoding: "utf8" });
```

For the preview server test, keep the helper call deterministic:

```js
const result = await runCli(["doctor", "--json", "--no-update-check", "--ports", String(port)], cwd);
```

For the plain doctor test:

```js
const result = spawnSync(process.execPath, [CLI, "doctor", "--no-update-check"], { encoding: "utf8" });
```

Then add these tests near the existing doctor tests:

```js
test("doctor json can disable update checks", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));

  const result = spawnSync(process.execPath, [CLI, "doctor", "--json", "--no-update-check"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.updates, { checked: false, reason: "disabled" });
  assert.equal(json.next.some((item) => /install --repair/.test(item)), false);
});

test("doctor json reports update availability from npm registry", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));

  await withServer((request, response) => {
    assert.equal(request.url, "/%40unship%2Fcli");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ "dist-tags": { latest: "0.1.2" } }));
  }, async (port) => {
    const result = await runCli(["doctor", "--json"], cwd, {
      UNSHIP_NPM_REGISTRY: `http://127.0.0.1:${port}`
    });

    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout);
    assert.equal(json.updates.checked, true);
    assert.equal(json.updates.available, true);
    assert.equal(json.updates.current, "0.1.1");
    assert.equal(json.updates.latest, "0.1.2");
    assert.match(json.updates.next, /install --repair/);
    assert.equal(json.next[0], json.updates.next);
  });
});

test("doctor json continues when update check is unavailable", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));

  await withServer((request, response) => {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "offline" }));
  }, async (port) => {
    const result = await runCli(["doctor", "--json"], cwd, {
      UNSHIP_NPM_REGISTRY: `http://127.0.0.1:${port}`
    });

    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout);
    assert.equal(json.updates.checked, true);
    assert.equal(json.updates.available, null);
    assert.equal(json.updates.error, "unavailable");
    assert.equal(json.ok, true);
  });
});

test("doctor next actions prioritize stale skill and picker repairs", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));
  await writeFixture(join(cwd, ".agents", "skills", "unship", "SKILL.md"), "---\nname: unship\n---\nstale\n");
  await writeFixture(join(cwd, "public", "unship-picker.js"), "old picker\n");
  await writeFixture(
    join(cwd, "app", "page.tsx"),
    `<section data-unship-pick="Hero"><div data-unship-option="Current">A</div></section>\n`
  );

  const result = spawnSync(process.execPath, [CLI, "doctor", "--json", "--no-update-check"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.match(json.next[0], /init --force --json/);
  assert.match(json.next[1], /setup --framework auto --json/);
  assert.equal(json.next.some((item) => /Hero/.test(item)), true);
});
```

Update the existing plain install output test:

```js
test("install plain output groups next actions once", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "--all", "--yes", "--no-update-check"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Unship install complete/);
  assert.match(result.stdout, /Next:\n- Restart/);
  assert.match(result.stdout, /If \/unship is unavailable after restart/);
  assert.match(result.stdout, /natural-language fallback/);
  assert.equal((result.stdout.match(/^Next:/gm) || []).length, 1);
});
```

- [ ] **Step 2: Run focused CLI tests and verify they fail**

Run:

```bash
node --test test/cli.test.js --test-name-pattern "doctor json can disable|doctor json reports update|doctor json continues|doctor next actions prioritize|install plain output groups"
```

Expected: FAIL because the CLI has no `--no-update-check`, no `updates` field, no stale repair next-action ordering, and no fallback troubleshooting line.

- [ ] **Step 3: Import update helper and parse the new flag**

In `src/cli/index.js`, add the import:

```js
import { checkForUpdates } from "../update/index.js";
```

In `parseFlags(items)`, add:

```js
else if (item === "--no-update-check") parsed["no-update-check"] = true;
```

- [ ] **Step 4: Add package/update helpers**

Replace the direct package read in `doctor` with a helper and add update helpers near `doctor`:

```js
async function readPackageInfo() {
  return JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
}

async function updateStatus(pkg, { disabled = false } = {}) {
  return checkForUpdates({
    packageName: pkg.name,
    currentVersion: pkg.version,
    disabled
  });
}

function withUpdateNextActions(result, updates) {
  if (!updates?.next) return result;
  const next = result.next || [];
  return {
    ...result,
    updates,
    next: next.includes(updates.next) ? next : [updates.next, ...next]
  };
}
```

- [ ] **Step 5: Wire updates into doctor**

Update the `doctor` command branch:

```js
} else if (command === "doctor") {
  print(await doctor({
    root: flags.root || process.cwd(),
    previewPorts: parsePorts(flags.ports),
    updateCheckDisabled: Boolean(flags["no-update-check"])
  }), flags.json);
```

Update `doctor`:

```js
async function doctor({ root, previewPorts, updateCheckDisabled = false }) {
  const pkg = await readPackageInfo();
  const updates = await updateStatus(pkg, { disabled: updateCheckDisabled });
  const project = await inspectProject({ root, previewPorts });
  const residue = await checkUnshipResidue({ root });
  const unship = summarizeUnship(residue);
  return {
    ok: true,
    packageName: pkg.name,
    version: pkg.version,
    updates,
    node: process.version,
    project,
    residue,
    unship,
    next: nextActions({ project, unship, updates }),
    reminder: "Unship is local comparison tooling. Remove picker markup before shipping."
  };
}
```

Update `nextActions`:

```js
function nextActions({ project, unship, updates }) {
  const actions = [];
  if (updates?.next) actions.push(updates.next);

  if (project.skillInstalled && !project.skillCurrent) {
    actions.push("Run npx @unship/cli@latest init --force --json to refresh stale installed Unship instructions.");
  }

  if (project.pickerFileFound && !project.pickerFileCurrent) {
    actions.push("Run setup --framework auto --json to refresh the stale picker file.");
  } else if (!project.pickerFileFound || !project.devMountFound) {
    actions.push("Run setup after a local app shell exists if you need the picker mounted.");
  }

  if (unship.activeExplorationCount > 0) {
    const labels = unship.explorations.map((item) => item.pick).join(", ");
    actions.push(`Existing Unship explorations detected: ${labels}. Settle overlapping work before creating another overlapping exploration.`);
  }
  return actions;
}
```

- [ ] **Step 6: Wire update hints into plain install output**

In the `install` branch, decorate only successful plain output. This keeps JSON automation deterministic while still helping humans running the installer:

```js
      let result = !plan.ok
        ? plan
        : approved
          ? (flags["dry-run"] ? plan : await applyInstallPlan(plan))
          : { ok: false, command: "install", error: "Install cancelled.", next: [] };
      if (result.ok && !flags.json) {
        const pkg = await readPackageInfo();
        const updates = await updateStatus(pkg, { disabled: Boolean(flags["no-update-check"]) });
        result = withUpdateNextActions(result, updates);
      }
      printInstallResult(result, flags.json);
```

Do not change `uninstall` update behavior.

Update installer next actions in `src/install/index.js`:

```js
function nextActions({ harnesses, project }) {
  const next = ["Restart the agent so it reloads Unship."];
  if (harnesses.some((item) => item.id === "agents")) {
    next.push("Try /unship where supported, or ask: use unship to compare 3 directions for the hero section.");
    next.push("If /unship is unavailable after restart, run npx @unship/cli@latest doctor --json and use the natural-language fallback.");
  }
  if (!project) next.push("Inside an app repo, run npx @unship/cli@latest install --project --yes to wire the picker.");
  return next;
}
```

- [ ] **Step 7: Improve plain doctor output**

In the `print(value, json)` branch for `value.packageName`, replace the one-template `console.log` with:

```js
  } else if (value.packageName) {
    printDoctor(value);
```

Add:

```js
function printDoctor(value) {
  const preview = value.project.previewServers.length ? value.project.previewServers.map((server) => server.url).join(", ") : "none detected";
  const lines = [
    `${value.packageName} ${value.version}`,
    doctorUpdateLine(value.updates),
    `Node ${value.node}`,
    `Framework ${value.project.framework}`,
    `Skill installed ${value.project.skillInstalled ? "yes" : "no"}${value.project.skillInstalled ? ` (${value.project.skillCurrent ? "current" : "stale"})` : ""}`,
    `Picker file ${value.project.pickerFileFound ? value.project.pickerFile : "missing"}${value.project.pickerFileFound ? ` (${value.project.pickerFileCurrent ? "current" : "stale"})` : ""}`,
    `Dev mount ${value.project.devMountFound ? value.project.devMountFile : "missing"}`,
    `Preview servers ${preview}`,
    value.reminder
  ].filter(Boolean);
  appendNext(lines, value.next);
  console.log(lines.join("\n"));
}

function doctorUpdateLine(updates) {
  if (updates?.available === true) return `Update available ${updates.current} -> ${updates.latest}`;
  if (updates?.checked === false) return "Update check disabled";
  return "";
}
```

- [ ] **Step 8: Run focused CLI tests and verify they pass**

Run:

```bash
node --test test/cli.test.js --test-name-pattern "doctor json can disable|doctor json reports update|doctor json continues|doctor next actions prioritize|install plain output groups|doctor reports package|doctor json preserves|doctor reports a live preview|doctor plain output"
```

Expected: PASS.

- [ ] **Step 9: Commit CLI update wiring**

Run:

```bash
git add src/cli/index.js src/install/index.js test/cli.test.js
git commit -m "feat: surface unship update and setup guidance"
```

## Task 3: Cleanup Summary For Check

**Files:**
- Modify: `src/check/index.js`
- Modify: `test/check.test.js`
- Modify: `src/cli/index.js`
- Modify: `test/cli.test.js`

- [ ] **Step 1: Write failing checker summary tests**

In `test/check.test.js`, add:

```js
test("check includes grouped cleanup summary", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "Hero.jsx"),
    `<section data-unship-pick="Hero">
  <div data-unship-option="Current">A</div>
  <div data-unship-option="Proof" hidden>B</div>
</section>
`,
    "utf8"
  );
  await writeFile(join(root, "src", "mount.html"), '<script src="/unship-picker.js"></script>\n', "utf8");

  const result = await checkUnshipResidue({ root });

  assert.deepEqual(result.summary, {
    artifactCount: 4,
    fileCount: 2,
    explorationCount: 1,
    files: ["src/Hero.jsx", "src/mount.html"],
    message: "Unship cleanup required: 4 artifacts across 2 files."
  });
});

test("check summary reports clean projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "App.jsx"), "<main>Clean</main>\n", "utf8");

  const result = await checkUnshipResidue({ root });

  assert.deepEqual(result.summary, {
    artifactCount: 0,
    fileCount: 0,
    explorationCount: 0,
    files: [],
    message: "No Unship preview artifacts found."
  });
});
```

In `test/cli.test.js`, update `check command plain output includes cleanup diagnostics`:

```js
test("check command plain output includes cleanup summary before diagnostics", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await import("node:fs/promises").then(({ mkdir, writeFile }) =>
    mkdir(join(cwd, "src"), { recursive: true }).then(() =>
      writeFile(join(cwd, "src", "App.jsx"), '<div data-unship-pick="Hero"></div>\n', "utf8")
    )
  );
  const result = spawnSync(process.execPath, [CLI, "check"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^Unship cleanup required: 1 artifact across 1 file\./);
  assert.match(result.stdout, /Explorations:\n- Hero in src\/App\.jsx/);
  assert.match(result.stdout, /src\/App\.jsx:1:6/);
  assert.match(result.stdout, /Remove temporary Unship picker markup/);
});
```

Update `check json includes structured exploration summaries`:

```js
  assert.equal(json.summary.artifactCount, 3);
  assert.equal(json.summary.explorationCount, 1);
  assert.match(json.summary.message, /Unship cleanup required/);
```

- [ ] **Step 2: Run focused check tests and verify they fail**

Run:

```bash
node --test test/check.test.js --test-name-pattern "summary"
node --test test/cli.test.js --test-name-pattern "check command plain output|check json includes"
```

Expected: FAIL because `summary` is not returned and plain `check` does not print a summary.

- [ ] **Step 3: Add cleanup summary helper**

In `src/check/index.js`, update `checkUnshipResidue`:

```js
  const summary = summarizeCleanup({ diagnostics, explorations });
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    explorations,
    summary,
    cleanupRequired: diagnostics.length > 0
  };
```

Add this exported helper after `scanExplorations`:

```js
export function summarizeCleanup({ diagnostics = [], explorations = [] } = {}) {
  const files = [...new Set(diagnostics.map((item) => item.file))].sort();
  const artifactCount = diagnostics.length;
  const fileCount = files.length;
  const explorationCount = explorations.length;
  return {
    artifactCount,
    fileCount,
    explorationCount,
    files,
    message: artifactCount
      ? `Unship cleanup required: ${artifactCount} ${plural("artifact", artifactCount)} across ${fileCount} ${plural("file", fileCount)}.`
      : "No Unship preview artifacts found."
  };
}

function plural(word, count) {
  return count === 1 ? word : `${word}s`;
}
```

- [ ] **Step 4: Print plain check summary first**

In `src/cli/index.js`, replace `printCheck` with:

```js
function printCheck(result) {
  if (result.ok) {
    console.log(result.summary?.message || "No Unship preview artifacts found.");
    return;
  }

  const lines = [result.summary?.message || "Unship cleanup required."];
  if (result.explorations?.length) {
    lines.push("Explorations:");
    for (const item of result.explorations) {
      const labels = item.options?.length
        ? `: ${item.options.join(", ")}`
        : item.uncertainOptions?.length
          ? `: uncertain labels ${item.uncertainOptions.join(", ")}`
          : "";
      lines.push(`- ${item.pick} in ${item.file}${labels}`);
    }
    lines.push("");
  }
  lines.push(...result.diagnostics.map((item) => `${item.file}:${item.line}:${item.column} ${item.message} (${item.pattern})`));
  console.log(lines.join("\n"));
}
```

- [ ] **Step 5: Run focused check tests and verify they pass**

Run:

```bash
node --test test/check.test.js --test-name-pattern "summary"
node --test test/cli.test.js --test-name-pattern "check command plain output|check json includes"
```

Expected: PASS.

- [ ] **Step 6: Commit cleanup summary**

Run:

```bash
git add src/check/index.js src/cli/index.js test/check.test.js test/cli.test.js
git commit -m "feat: summarize unship cleanup status"
```

## Task 4: Trust And Troubleshooting Documentation

**Files:**
- Modify: `README.md`
- Modify: `agent/skills/unship/SKILL.md`
- Modify: `test/cli.test.js`

- [ ] **Step 1: Write failing docs/skill assertions**

In the `init writes portable skill by default` test in `test/cli.test.js`, add:

```js
  assert.match(skill, /Unship is local comparison tooling/i);
  assert.match(skill, /does not send telemetry/i);
  assert.match(skill, /Picker selection does not save source/i);
  assert.match(skill, /whether the installed skill or picker appears stale/i);
  assert.match(skill, /multiple groups with the same label/i);
```

In `install-skill writes the global agents skill`, add:

```js
  assert.match(skill, /does not send telemetry/i);
  assert.match(skill, /Final cleanup/i);
```

Add a README assertion test near other docs-oriented CLI tests:

```js
test("README documents local trust and unship troubleshooting", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  assert.match(readme, /Unship is local comparison tooling/i);
  assert.match(readme, /does not send telemetry/i);
  assert.match(readme, /\/unship does not appear/i);
  assert.match(readme, /install --repair/);
  assert.match(readme, /install --print-skill/);
});
```

- [ ] **Step 2: Run docs/skill tests and verify they fail**

Run:

```bash
node --test test/cli.test.js --test-name-pattern "portable skill|global agents skill|README documents"
```

Expected: FAIL because the README and bundled skill do not yet contain the new trust/troubleshooting language.

- [ ] **Step 3: Update README trust and troubleshooting language**

In `README.md`, after the early beta status block, add:

```md
Unship is local comparison tooling. The picker script runs only in your local preview, Unship does not send telemetry, and picker selection does not save source or make a product decision. You choose by naming the visible option label in chat; the agent settles source by keeping that option and removing temporary Unship artifacts.
```

After the "Advanced Skill Install" section, add:

```md
## Troubleshooting

### `/unship` does not appear

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
```

Do not duplicate command lifecycle details elsewhere.

- [ ] **Step 4: Update bundled skill trust and handoff language**

In `agent/skills/unship/SKILL.md`, after the opening paragraph, add:

```md
Unship is local comparison tooling. The picker script runs in the user's local preview, Unship does not send telemetry, and picker selection does not save source or make a product decision. The human chooses by naming a visible option label in chat; you settle source by keeping that option and removing temporary artifacts.
```

In "Human Comparison Handoff", replace the current reporting list with:

```md
Before stopping for human choice, report:

- the variant group label;
- the visible option labels;
- whether picker setup is installed and current;
- whether the installed skill or picker appears stale;
- any detected preview servers as hints only;
- cleanup status if existing Unship artifacts already exist.
```

After that list, add:

```md
If the human names a winner ambiguously, verify the selected group and option label before editing. Ambiguity includes multiple groups with the same label, repeated option labels, the user saying "the second one" after other changes, or overlapping active explorations.
```

In "Fast Start", after stale picker instructions, add:

```md
If `/unship` is unavailable after installation, continue from the natural-language request. Do not require the slash command when this skill is already active.
```

- [ ] **Step 5: Run docs/skill tests and verify they pass**

Run:

```bash
node --test test/cli.test.js --test-name-pattern "portable skill|global agents skill|README documents"
```

Expected: PASS.

- [ ] **Step 6: Commit docs and skill updates**

Run:

```bash
git add README.md agent/skills/unship/SKILL.md test/cli.test.js
git commit -m "docs: clarify unship trust and troubleshooting"
```

## Task 5: Package Smoke And Project Docs

**Files:**
- Modify: `test/package-smoke.test.js`
- Modify: `docs/README.md`
- Modify: `docs/plans/current-run.md`

- [ ] **Step 1: Update package smoke expectations**

In `test/package-smoke.test.js`, add the new update helper to the expected file list:

```js
    "src/update/index.js"
```

The sorted list should include:

```js
  assert.deepEqual(files.sort(), [
    "LICENSE",
    "README.md",
    "agent/AGENTS.md",
    "agent/skills/unship/SKILL.md",
    "package.json",
    "src/agent/index.js",
    "src/check/index.js",
    "src/cli/index.js",
    "src/install/index.js",
    "src/picker/unship-picker.js",
    "src/setup/index.js",
    "src/update/index.js"
  ]);
```

In the packed smoke command list, disable update checks for install dry-run:

```js
    ["install", "--dry-run", "--json", "--no-update-check"],
```

- [ ] **Step 2: Update docs index and current run**

In `docs/README.md`, add the new spec and plan at the top of "Active Source Of Truth":

```md
1. `docs/plans/current-run.md`
2. `docs/superpowers/specs/2026-06-04-unship-minimal-beta-hardening-design.md`
3. `docs/superpowers/plans/2026-06-04-unship-minimal-beta-hardening-implementation-plan.md`
4. `docs/superpowers/specs/2026-06-04-unship-seamless-install-design.md`
```

Renumber the remaining entries.

In "Current Product Decisions", add:

```md
- `doctor` performs a best-effort update check by default and supports `--no-update-check` for offline or CI usage.
- `check` returns a grouped cleanup summary in addition to exact diagnostics.
- README and the bundled skill explicitly state that Unship is local-only and does not send telemetry.
```

Update `docs/plans/current-run.md`:

```md
# Current Run

- stage: implementation_planned
- topic: unship-minimal-beta-hardening
- design_path: docs/superpowers/specs/2026-06-04-unship-minimal-beta-hardening-design.md
- execution_plan_path: docs/superpowers/plans/2026-06-04-unship-minimal-beta-hardening-implementation-plan.md
- verification: pending
- next_skill: superpowers:subagent-driven-development or superpowers:executing-plans
- updated_at: 2026-06-04
```

- [ ] **Step 3: Run package smoke focused test**

Run:

```bash
node --test test/package-smoke.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit package/docs alignment**

Run:

```bash
git add test/package-smoke.test.js docs/README.md docs/plans/current-run.md
git commit -m "test: include beta hardening package files"
```

## Task 6: Full Verification

**Files:**
- No new files.
- Verify all files touched in prior tasks.

- [ ] **Step 1: Run syntax checks**

Run:

```bash
npm run check
```

Expected: PASS. If it fails, fix only the files changed by this implementation plan.

- [ ] **Step 2: Run unit tests**

Run:

```bash
npm test
```

Expected: PASS. If an existing test expects a doctor command without `--no-update-check`, update the test to be deterministic instead of allowing live network access.

- [ ] **Step 3: Run e2e test**

Run:

```bash
npm run e2e
```

Expected: PASS.

- [ ] **Step 4: Run package dry-run**

Run:

```bash
npm pack --dry-run
```

Expected: PASS and package contents include `src/update/index.js`.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 6: Inspect git state**

Run:

```bash
git status --short
```

Expected: only intentional implementation files remain modified, plus any unrelated pre-existing worktree changes that were present before this plan. Do not stage unrelated changes.

- [ ] **Step 7: Commit verification/doc status update**

If verification caused only `docs/plans/current-run.md` status updates, update it to:

```md
- stage: implemented
- verification: npm run verify passed on 2026-06-04
- next_skill: none
```

Then commit changed implementation files that are not already committed:

```bash
git add src/update/index.js src/cli/index.js src/install/index.js src/check/index.js test/update.test.js test/cli.test.js test/check.test.js test/package-smoke.test.js README.md agent/skills/unship/SKILL.md docs/README.md docs/plans/current-run.md
git commit -m "feat: harden unship beta trust checks"
```

If all previous tasks were committed separately and only current-run changed, run:

```bash
git add docs/plans/current-run.md
git commit -m "docs: mark beta hardening verified"
```

## Final Acceptance Criteria

- `doctor --json --no-update-check` returns `updates: { checked: false, reason: "disabled" }`.
- `doctor --json` reports update availability when the npm registry returns a newer latest version.
- Failed update lookup never makes `doctor` fail.
- Plain `install` output includes restart, `/unship`, natural-language fallback, and doctor troubleshooting guidance.
- `check --json` includes `summary` while preserving `diagnostics`, `explorations`, and `cleanupRequired`.
- Plain `check` starts with a cleanup summary before file/line diagnostics.
- README documents local-only/no-telemetry behavior and `/unship` troubleshooting.
- The bundled skill tells agents to report stale setup/currentness and resolve ambiguous winner requests.
- `npm run verify` passes.
