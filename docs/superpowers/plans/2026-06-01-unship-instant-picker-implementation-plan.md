# Unship Instant Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the hard-reset Unship V1: a tiny local-only DOM picker, cleanup scanner, CLI, and portable agent skill.

**Architecture:** Start from the current clean planning workspace. Implement one dependency-free browser picker, one small Node CLI, one residue scanner, and static agent instruction templates. The old patch-session implementation is archived at `/Users/marcusbenhard/Development/Playground/unship-design-legacy-archive-2026-06-01` and must not be copied back into active source.

**Tech Stack:** Node 20+, ESM, plain browser JavaScript, `node:test`, Playwright as a dev-only browser test dependency, no runtime dependencies.

---

## Source Inputs

- PRD: `docs/superpowers/specs/2026-06-01-unship-instant-picker-prd.md`
- Technical spec: `docs/superpowers/specs/2026-06-01-unship-instant-picker-technical-spec.md`
- Plan review: `docs/plans/2026-06-01-unship-instant-picker-prd-review.md`
- External archive: `/Users/marcusbenhard/Development/Playground/unship-design-legacy-archive-2026-06-01`

## Planned File Structure

```txt
README.md
LICENSE
package.json
agent/
  AGENTS.md
  skills/
    unship/
      SKILL.md
src/
  agent/
    index.js
  check/
    index.js
  cli/
    index.js
  picker/
    unship-picker.js
test/
  check.test.js
  cli.test.js
  picker-browser.test.js
  picker-dom.test.js
  package-smoke.test.js
```

## Implementation Notes

- This folder currently has no `.git` directory. If execution happens in a git repository, commit after each task. If execution stays outside git, update `docs/plans/current-run.md` after each completed task with the completed task number and verification command results.
- Do not reintroduce old commands: `start`, `variant`, `bridge`, `decision`, `finalize`, or `abort`.
- Do not reintroduce old paths under active `src/core`, `src/bridge`, `src/runtime`, `src/toolbar`, `agent/skills/unship-design`, `examples`, or `prototypes`.

### Task 1: Project Scaffold And Test Harness

**Files:**
- Create: `package.json`
- Create: `src/agent/index.js`
- Create: `src/check/index.js`
- Create: `src/cli/index.js`
- Create: `src/picker/unship-picker.js`
- Create: `test/check.test.js`
- Create: `test/cli.test.js`
- Create: `test/picker-dom.test.js`
- Create: `test/picker-browser.test.js`
- Create: `test/package-smoke.test.js`
- Modify: `README.md`

- [ ] **Step 1: Create package metadata**

Create `package.json` with this initial content:

```json
{
  "name": "unship",
  "version": "0.1.0",
  "description": "Tiny local DOM picker for temporary agent-authored UI variants.",
  "license": "MIT",
  "type": "module",
  "bin": {
    "unship": "./src/cli/index.js"
  },
  "files": [
    "README.md",
    "LICENSE",
    "agent",
    "src"
  ],
  "scripts": {
    "check": "node --check src/agent/index.js && node --check src/check/index.js && node --check src/cli/index.js && node --check src/picker/unship-picker.js",
    "test": "node --test",
    "verify": "npm run check && npm test && npm pack --dry-run"
  },
  "devDependencies": {
    "playwright": "^1.53.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create empty module files**

Create these directories:

```bash
mkdir -p src/agent src/check src/cli src/picker test agent/skills/unship
```

Create `src/agent/index.js`:

```js
export function getAgentTemplates() {
  return {
    skill: "",
    agents: "",
    claude: "",
    opencodeCommand: ""
  };
}
```

Create `src/check/index.js`:

```js
export async function checkUnshipResidue() {
  return { ok: true, diagnostics: [] };
}
```

Create `src/cli/index.js`:

```js
#!/usr/bin/env node

console.log("Unship CLI scaffold");
```

Create `src/picker/unship-picker.js`:

```js
(() => {
  if (window.__unshipPicker) return;
  window.__unshipPicker = {
    version: "0.1.0",
    rescan() {},
    destroy() {},
    getState() {
      return { groups: [], activeGroupIndex: -1, toolbarMode: "none" };
    }
  };
})();
```

- [ ] **Step 3: Install dev dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and `playwright` is installed as a dev dependency.

- [ ] **Step 4: Verify scaffold syntax**

Run:

```bash
npm run check
```

Expected: command exits 0.

- [ ] **Step 5: Checkpoint**

If inside a git repository:

```bash
git add package.json package-lock.json src test agent README.md
git commit -m "chore: scaffold instant picker package"
```

If not inside a git repository, append this line to `docs/plans/current-run.md`:

```md
- checkpoint_task_1: scaffold created; npm run check passed
```

### Task 2: Residue Scanner

**Files:**
- Modify: `src/check/index.js`
- Create/modify: `test/check.test.js`

- [ ] **Step 1: Write failing scanner tests**

Create `test/check.test.js`:

```js
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { checkUnshipResidue } from "../src/check/index.js";

test("check reports unship preview artifacts in application source", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "App.jsx"),
    '<section data-unship-pick="Hero"><div data-unship-option="Current">A</div></section>\n',
    "utf8"
  );

  const result = await checkUnshipResidue({ root });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.length, 2);
  assert.equal(result.diagnostics[0].file, "src/App.jsx");
  assert.equal(result.diagnostics[0].line, 1);
});

test("check allows docs and installed instruction files to document the contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, ".agents", "skills", "unship"), { recursive: true });
  await writeFile(join(root, "docs", "guide.md"), "`data-unship-pick`\n", "utf8");
  await writeFile(join(root, ".agents", "skills", "unship", "SKILL.md"), "`data-unship-option`\n", "utf8");

  const result = await checkUnshipResidue({ root });

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

test("check ignores build output by default and scans it with includeBuild", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "index.html"), '<script src="/unship-picker.js"></script>\n', "utf8");

  assert.equal((await checkUnshipResidue({ root })).ok, true);
  assert.equal((await checkUnshipResidue({ root, includeBuild: true })).ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test test/check.test.js
```

Expected: FAIL because the scanner always returns clean.

- [ ] **Step 3: Implement scanner**

Replace `src/check/index.js` with:

```js
import { readdir, readFile } from "node:fs/promises";
import { relative, sep } from "node:path";

const DEFAULT_IGNORES = new Set([
  ".git",
  "node_modules",
  ".pnpm-store",
  ".yarn",
  ".unship",
  ".superpowers",
  "coverage",
  ".cache",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "build"
]);

const BUILD_DIRS = new Set(["dist", "build", ".next", ".nuxt", ".svelte-kit"]);
const EXTENSIONS = new Set([".html", ".htm", ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".astro", ".mdx", ".liquid", ".hbs", ".handlebars", ".njk", ".ejs"]);
const PATTERNS = ["data-unship-pick", "data-unship-option", "unship-picker", "<!-- unship"];

const ALLOWED_PATHS = [
  /^docs\//,
  /^agent\/skills\/unship\/SKILL\.md$/,
  /^\.agents\/skills\/unship\/SKILL\.md$/,
  /^\.claude\/skills\/unship\/SKILL\.md$/,
  /^\.opencode\/skills\/unship\/SKILL\.md$/,
  /^\.opencode\/commands\/unship\.md$/,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/
];

export async function checkUnshipResidue({ root = process.cwd(), includeBuild = false } = {}) {
  const diagnostics = [];
  for await (const file of walk(root, { includeBuild })) {
    const rel = toPosix(relative(root, file));
    if (isAllowedDocumentation(rel)) continue;
    const text = await readFile(file, "utf8");
    diagnostics.push(...scanText(rel, text));
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

export function scanText(file, text) {
  const diagnostics = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    for (const pattern of PATTERNS) {
      const column = lineText.indexOf(pattern);
      if (column !== -1) {
        diagnostics.push({
          file,
          line: index + 1,
          column: column + 1,
          pattern,
          message: "Remove temporary Unship picker markup before shipping."
        });
      }
    }
  });
  return diagnostics;
}

async function* walk(dir, options) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (shouldIgnoreDirectory(entry.name, options)) continue;
      yield* walk(full, options);
      continue;
    }
    if (!entry.isFile()) continue;
    if (EXTENSIONS.has(extension(entry.name))) yield full;
  }
}

function shouldIgnoreDirectory(name, { includeBuild }) {
  if (includeBuild && BUILD_DIRS.has(name)) return false;
  return DEFAULT_IGNORES.has(name);
}

function isAllowedDocumentation(rel) {
  return ALLOWED_PATHS.some((pattern) => pattern.test(rel));
}

function extension(name) {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index);
}

function toPosix(path) {
  return path.split(sep).join("/");
}
```

- [ ] **Step 4: Verify scanner passes**

Run:

```bash
node --test test/check.test.js
npm run check
```

Expected: both commands exit 0.

- [ ] **Step 5: Checkpoint**

If inside a git repository:

```bash
git add src/check/index.js test/check.test.js
git commit -m "feat: add unship residue scanner"
```

If not inside a git repository, append:

```md
- checkpoint_task_2: residue scanner implemented; check.test.js and npm run check passed
```

### Task 3: Agent Templates And Init Command

**Files:**
- Create: `agent/AGENTS.md`
- Create: `agent/skills/unship/SKILL.md`
- Modify: `src/agent/index.js`
- Modify: `src/cli/index.js`
- Modify: `test/cli.test.js`

- [ ] **Step 1: Write failing init tests**

Create `test/cli.test.js`:

```js
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

const CLI = new URL("../src/cli/index.js", import.meta.url).pathname;

test("init writes portable skill by default", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const result = spawnSync(process.execPath, [CLI, "init", "--json"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.written.includes(".agents/skills/unship/SKILL.md"), true);
  const skill = await readFile(join(cwd, ".agents", "skills", "unship", "SKILL.md"), "utf8");
  assert.match(skill, /name: unship/);
  assert.match(skill, /Brand read/);
});

test("init all writes claude and opencode shims", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const result = spawnSync(process.execPath, [CLI, "init", "--target", "all", "--json"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
  assert.match(await readFile(join(cwd, ".claude", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  assert.match(await readFile(join(cwd, ".opencode", "commands", "unship.md"), "utf8"), /Use the Unship skill/);
});

test("init does not overwrite without force", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  spawnSync(process.execPath, [CLI, "init", "--json"], { cwd, encoding: "utf8" });
  const second = spawnSync(process.execPath, [CLI, "init", "--json"], { cwd, encoding: "utf8" });
  const json = JSON.parse(second.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.skipped.includes(".agents/skills/unship/SKILL.md"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test test/cli.test.js
```

Expected: FAIL because CLI only prints scaffold text.

- [ ] **Step 3: Add agent templates**

Create `agent/AGENTS.md`:

```md
# Agent Notes

When comparing temporary UI design variants, use the Unship skill. Keep Unship picker markup local-only and run `npx unship check` before shipping.
```

Create `agent/skills/unship/SKILL.md`:

```md
---
name: unship
description: Use when the user wants to compare UI design variants, iterate on a page or component, preview multiple local directions, use a picker, or clean up temporary Unship markup.
---

# Unship

Use Unship to create temporary local UI variants in real source, let the human compare them instantly in the browser, and then clean every Unship artifact before shipping.

## Brand Read

Before authoring variants, inspect the existing UI source and, when possible, the rendered page. Identify components, tokens or utility classes, typography scale, spacing rhythm, layout density, copy tone, interaction patterns, and product constraints. Variants must be derived from that vocabulary unless the user explicitly asks to depart from it.

## Instruction Precedence

1. The user's explicit request for count, style, scope, or temporary retention.
2. Safety and local-only cleanup requirements.
3. The app's design system and implementation constraints.
4. Unship defaults.

When these conflict, explain the tradeoff briefly and choose the smallest safe interpretation.

## Defaults

- Create 2-4 meaningful variants.
- Interpret `N variants` as `N` choices shown unless the user says `N alternatives plus current`.
- Include `Current` only when baseline comparison is useful.
- Use 1-3 word labels, ideally under 18 characters.
- Use inline mode for focused section or component work.
- Use subagent mode only as an authoring workflow when broad exploration helps.

## Inline Mode Safety

Inactive options must safely coexist in the DOM. Avoid duplicate active IDs, submit controls, global scripts, analytics triggers, autoplay media, focus traps, destructive side effects, and stateful providers. If unsafe, reduce scope or explain that inline mode is not suitable.

## Markup Contract

Wrap each temporary group with `data-unship-pick`. Put direct child choices inside with `data-unship-option`.

```html
<section data-unship-pick="Hero">
  <div data-unship-option="Current">...</div>
  <div data-unship-option="Proof-led" hidden>...</div>
</section>
```

Inject the picker locally with `npx unship snippet` or an equivalent dev-only script include.

## Subagent Mode

Subagents must not mutate the shared workspace in V1. They return briefs, sketches, file-specific recommendations, or patch-shaped proposals. The main agent edits source, normalizes options, applies the `data-unship-*` contract, and performs cleanup. If subagents are unavailable, simulate independent passes internally and implement the strongest 2-4 options.

## Cleanup

Cleanup is mandatory when exploration ends, including selection, cancellation, rejection, timeout, interruption, or ship request. Keep the selected option, remove losing options, remove all `data-unship-*` attributes, remove picker script/comments, then run:

```bash
npx unship check
```

Do not claim completion until the check is clean.
```

- [ ] **Step 4: Implement template loader and init command**

Replace `src/agent/index.js` with:

```js
import { readFile } from "node:fs/promises";

const ROOT = new URL("../../", import.meta.url);

export async function getAgentTemplates() {
  const skill = await readFile(new URL("agent/skills/unship/SKILL.md", ROOT), "utf8");
  const agents = await readFile(new URL("agent/AGENTS.md", ROOT), "utf8");
  return {
    skill,
    agents,
    claude: '@AGENTS.md\n\nUse `/unship` or the `unship` skill for temporary local UI variant comparison.\n',
    opencodeCommand: "---\ndescription: Create temporary local UI variants with Unship\n---\n\nUse the Unship skill for this request. Interpret arguments as the target, count, style, or scope: $ARGUMENTS\n"
  };
}
```

Replace `src/cli/index.js` with a command router that supports `init`:

```js
#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getAgentTemplates } from "../agent/index.js";

const args = process.argv.slice(2);
const command = args[0] || "help";
const flags = parseFlags(args.slice(1));

try {
  if (command === "init") {
    const result = await init({ target: flags.target || "codex", force: Boolean(flags.force) });
    print(result, flags.json);
  } else {
    printHelp();
  }
} catch (error) {
  if (flags.json) {
    console.log(JSON.stringify({ ok: false, error: error.message }));
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
}

async function init({ target, force }) {
  const templates = await getAgentTemplates();
  const files = targetFiles(target, templates);
  const written = [];
  const skipped = [];
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    try {
      await writeFile(file.path, file.content, { flag: force ? "w" : "wx" });
      written.push(file.path);
    } catch (error) {
      if (error.code === "EEXIST") skipped.push(file.path);
      else throw error;
    }
  }
  return { ok: true, written, skipped };
}

function targetFiles(target, templates) {
  if (target === "codex") return [{ path: ".agents/skills/unship/SKILL.md", content: templates.skill }];
  if (target === "claude") return [{ path: ".claude/skills/unship/SKILL.md", content: templates.skill }, { path: "CLAUDE.md", content: templates.claude }];
  if (target === "opencode") return [{ path: ".opencode/skills/unship/SKILL.md", content: templates.skill }, { path: ".opencode/commands/unship.md", content: templates.opencodeCommand }];
  if (target === "all") return [...targetFiles("codex", templates), ...targetFiles("claude", templates), ...targetFiles("opencode", templates), { path: "AGENTS.md", content: templates.agents }];
  throw new Error(`Unknown init target: ${target}`);
}

function parseFlags(items) {
  const parsed = {};
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === "--json") parsed.json = true;
    else if (item === "--force") parsed.force = true;
    else if (item === "--target") parsed.target = items[++index];
    else throw new Error(`Unknown flag: ${item}`);
  }
  return parsed;
}

function print(value, json) {
  if (json) console.log(JSON.stringify(value));
  else console.log(value.ok ? "Unship initialized." : "Unship failed.");
}

function printHelp() {
  console.log("Usage: unship init|snippet|check|doctor");
}
```

- [ ] **Step 5: Verify init behavior**

Run:

```bash
node --test test/cli.test.js
npm run check
```

Expected: both commands exit 0.

- [ ] **Step 6: Checkpoint**

If inside a git repository:

```bash
git add agent src/agent/index.js src/cli/index.js test/cli.test.js
git commit -m "feat: add unship agent init targets"
```

If not inside a git repository, append:

```md
- checkpoint_task_3: agent templates and init command implemented; cli.test.js and npm run check passed
```

### Task 4: Snippet, Check, And Doctor CLI Commands

**Files:**
- Modify: `src/cli/index.js`
- Modify: `test/cli.test.js`

- [ ] **Step 1: Add failing CLI command tests**

Append to `test/cli.test.js`:

```js
test("snippet prints local picker script", () => {
  const result = spawnSync(process.execPath, [CLI, "snippet"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /<script src="\/unship-picker\.js" data-unship-dev><\/script>/);
});

test("snippet can opt into local persistence", () => {
  const result = spawnSync(process.execPath, [CLI, "snippet", "--persist", "local"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /data-unship-persist="local"/);
});

test("check command returns non-zero for source residue", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await import("node:fs/promises").then(({ mkdir, writeFile }) =>
    mkdir(join(cwd, "src"), { recursive: true }).then(() =>
      writeFile(join(cwd, "src", "App.jsx"), '<div data-unship-pick="Hero"></div>\n', "utf8")
    )
  );
  const result = spawnSync(process.execPath, [CLI, "check", "--json"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
});

test("doctor reports package and local-only reminder", () => {
  const result = spawnSync(process.execPath, [CLI, "doctor", "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.packageName, "unship");
  assert.match(json.reminder, /local preview tooling/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test test/cli.test.js
```

Expected: FAIL because `snippet`, `check`, and `doctor` are not routed yet.

- [ ] **Step 3: Implement CLI commands**

Update `src/cli/index.js` to import scanner and package metadata:

```js
import { readFile } from "node:fs/promises";
import { checkUnshipResidue } from "../check/index.js";
```

Add command branches before `else { printHelp(); }`:

```js
  } else if (command === "snippet") {
    printSnippet(flags);
  } else if (command === "check") {
    const result = await checkUnshipResidue({ root: flags.root || process.cwd(), includeBuild: Boolean(flags["include-build"]) });
    print(result, flags.json);
    if (!result.ok) process.exitCode = 1;
  } else if (command === "doctor") {
    print(await doctor(), flags.json);
```

Add helper functions:

```js
function printSnippet(flags) {
  const src = flags.src || "/unship-picker.js";
  const attrs = ["data-unship-dev"];
  if (flags.persist === "local") attrs.push('data-unship-persist="local"');
  if (flags["global-shortcuts"]) attrs.push("data-unship-global-shortcuts");
  const tag = `<script src="${src}" ${attrs.join(" ")}></script>`;
  if (flags.json) console.log(JSON.stringify({ ok: true, snippet: tag }));
  else console.log(tag);
}

async function doctor() {
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  return {
    ok: true,
    packageName: pkg.name,
    version: pkg.version,
    node: process.version,
    reminder: "Unship is local preview tooling. Remove picker markup before shipping."
  };
}
```

Extend `parseFlags`:

```js
    else if (item === "--src") parsed.src = items[++index];
    else if (item === "--persist") parsed.persist = items[++index];
    else if (item === "--root") parsed.root = items[++index];
    else if (item === "--include-build") parsed["include-build"] = true;
    else if (item === "--global-shortcuts") parsed["global-shortcuts"] = true;
```

- [ ] **Step 4: Verify CLI commands pass**

Run:

```bash
node --test test/cli.test.js
npm run check
```

Expected: both commands exit 0.

- [ ] **Step 5: Checkpoint**

If inside a git repository:

```bash
git add src/cli/index.js test/cli.test.js
git commit -m "feat: add snippet check and doctor commands"
```

If not inside a git repository, append:

```md
- checkpoint_task_4: snippet, check, and doctor commands implemented; cli.test.js and npm run check passed
```

### Task 5: Picker Discovery And Switching

**Files:**
- Modify: `src/picker/unship-picker.js`
- Modify: `test/picker-dom.test.js`

- [ ] **Step 1: Write failing picker behavior tests**

Create `test/picker-dom.test.js`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

const PICKER = new URL("../src/picker/unship-picker.js", import.meta.url).pathname;

test("picker discovers one group and switches without network or reload", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.setContent(`
    <section data-unship-pick="Hero">
      <div data-unship-option="Current">A</div>
      <div data-unship-option="Proof-led" hidden>B</div>
    </section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  assert.equal(await page.locator('[data-unship-option="Current"]').isVisible(), true);
  assert.equal(await page.locator('[data-unship-option="Proof-led"]').isVisible(), false);
  await page.getByRole("button", { name: /next/i }).click();
  assert.equal(await page.locator('[data-unship-option="Current"]').isVisible(), false);
  assert.equal(await page.locator('[data-unship-option="Proof-led"]').isVisible(), true);
  assert.equal(requests.length, 0);
  await browser.close();
});

test("picker keeps multiple groups independent", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`
    <section data-unship-pick="Hero">
      <div data-unship-option="Current">Hero A</div>
      <div data-unship-option="Visual" hidden>Hero B</div>
    </section>
    <section data-unship-pick="Pricing">
      <div data-unship-option="Simple">Price A</div>
      <div data-unship-option="Detailed" hidden>Price B</div>
    </section>
    <script>${await readFile(PICKER, "utf8")}</script>
  `);

  await page.getByRole("button", { name: /next option/i }).click();
  const state = await page.evaluate(() => window.__unshipPicker.getState());
  assert.equal(state.groups.length, 2);
  assert.equal(state.groups[0].activeOptionIndex, 1);
  assert.equal(state.groups[1].activeOptionIndex, 0);
  await browser.close();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test test/picker-dom.test.js
```

Expected: FAIL because toolbar buttons and switching are not implemented.

- [ ] **Step 3: Implement picker core**

Replace `src/picker/unship-picker.js` with an IIFE that includes these exact public constants and function names:

```js
(() => {
  if (window.__unshipPicker) return;

  const VERSION = "0.1.0";
  const GROUP_SELECTOR = "[data-unship-pick]";
  const OPTION_ATTR = "data-unship-option";
  const originalDisplay = new WeakMap();
  const selectedByGroup = new WeakMap();
  let groups = [];
  let activeGroupIndex = 0;
  let root;
  let live;
  let scheduled = false;
  let observer;

  const api = {
    version: VERSION,
    rescan,
    destroy,
    getState
  };

  window.__unshipPicker = api;
  init();

  function init() {
    mountToolbar();
    rescan();
    observer = new MutationObserver(scheduleRescan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-unship-pick", "data-unship-option", "hidden"]
    });
  }

  function rescan() {
    groups = Array.from(document.querySelectorAll(GROUP_SELECTOR)).map(toGroup).filter(Boolean);
    if (activeGroupIndex >= groups.length) activeGroupIndex = Math.max(0, groups.length - 1);
    groups.forEach(ensureVisibleOption);
    render();
  }

  function toGroup(element, index) {
    const options = Array.from(element.children)
      .filter((child) => child.hasAttribute(OPTION_ATTR))
      .map((element, optionIndex) => ({
        element,
        label: element.getAttribute(OPTION_ATTR) || `Option ${optionIndex + 1}`,
        index: optionIndex
      }));
    if (!options.length) return null;
    return {
      element,
      index,
      label: element.getAttribute("data-unship-pick") || `Group ${index + 1}`,
      options,
      activeOptionIndex: selectedByGroup.get(element) ?? firstVisibleIndex(options)
    };
  }

  function firstVisibleIndex(options) {
    const found = options.findIndex((option) => !option.element.hidden && getComputedStyle(option.element).display !== "none");
    return found === -1 ? 0 : found;
  }

  function ensureVisibleOption(group) {
    group.options.forEach((option, index) => {
      if (index === group.activeOptionIndex) show(option.element);
      else hide(option.element);
    });
    selectedByGroup.set(group.element, group.activeOptionIndex);
  }

  function switchOption(delta) {
    const group = groups[activeGroupIndex];
    if (!group) return;
    const previous = group.options[group.activeOptionIndex].element;
    group.activeOptionIndex = wrap(group.activeOptionIndex + delta, group.options.length);
    ensureVisibleOption(group);
    repairFocus(previous, group.options[group.activeOptionIndex].element);
    announce(group);
    render();
  }

  function switchGroup(delta) {
    if (groups.length < 2) return;
    activeGroupIndex = wrap(activeGroupIndex + delta, groups.length);
    announce(groups[activeGroupIndex]);
    render();
  }

  function hide(element) {
    if (!originalDisplay.has(element)) originalDisplay.set(element, element.style.display || "");
    element.hidden = true;
    element.style.display = "none";
  }

  function show(element) {
    element.hidden = false;
    const display = originalDisplay.get(element);
    if (display) element.style.display = display;
    else element.style.removeProperty("display");
  }

  function repairFocus(previous, next) {
    if (!previous.contains(document.activeElement)) return;
    next.setAttribute("tabindex", next.getAttribute("tabindex") || "-1");
    next.focus({ preventScroll: true });
  }

  function mountToolbar() {
    const host = document.createElement("div");
    host.setAttribute("data-unship-toolbar", "");
    document.documentElement.append(host);
    root = host.attachShadow({ mode: "open" });
    root.addEventListener("keydown", onToolbarKeydown);
    live = document.createElement("div");
    live.setAttribute("aria-live", "polite");
    live.className = "sr";
  }

  function render() {
    if (!root) return;
    const group = groups[activeGroupIndex];
    if (!group) {
      root.innerHTML = "";
      return;
    }
    const option = group.options[group.activeOptionIndex];
    const mode = groups.length === 1 ? "single" : "multi";
    root.innerHTML = `${style()}<div class="dock ${mode}" role="toolbar" aria-label="Unship variant picker">
      ${groups.length > 1 ? `<button class="group" type="button" aria-label="Active group ${escapeHtml(group.label)}">${escapeHtml(group.label)} ${group.activeOptionIndex + 1}/${group.options.length}</button>` : ""}
      <div class="row">
        <button class="prev" type="button" aria-label="Previous option">‹</button>
        <button class="label" type="button" aria-label="${escapeHtml(group.label)}, ${escapeHtml(option.label)}, option ${group.activeOptionIndex + 1} of ${group.options.length}">${escapeHtml(groups.length === 1 ? `${group.label}: ${option.label}` : option.label)}</button>
        <button class="next" type="button" aria-label="Next option">›</button>
      </div>
    </div>`;
    root.append(live);
    root.querySelector(".prev").addEventListener("click", () => switchOption(-1));
    root.querySelector(".next").addEventListener("click", () => switchOption(1));
    root.querySelector(".group")?.addEventListener("click", () => switchGroup(1));
  }

  function onToolbarKeydown(event) {
    if (event.key === "ArrowLeft") { event.preventDefault(); switchOption(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); switchOption(1); }
    if (event.key === "ArrowUp") { event.preventDefault(); switchGroup(-1); }
    if (event.key === "ArrowDown") { event.preventDefault(); switchGroup(1); }
  }

  function announce(group) {
    const option = group.options[group.activeOptionIndex];
    live.textContent = `${group.label}, ${option.label}, option ${group.activeOptionIndex + 1} of ${group.options.length}`;
  }

  function getState() {
    return {
      groups: groups.map((group) => ({
        label: group.label,
        displayLabel: group.label,
        activeOptionIndex: group.activeOptionIndex,
        options: group.options.map((option) => option.label)
      })),
      activeGroupIndex,
      toolbarMode: groups.length === 0 ? "none" : groups.length === 1 ? "single" : "multi"
    };
  }

  function scheduleRescan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      rescan();
    });
  }

  function destroy() {
    observer?.disconnect();
    root?.host.remove();
    delete window.__unshipPicker;
  }

  function wrap(value, length) {
    return ((value % length) + length) % length;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function style() {
    return `<style>
      .dock{position:fixed;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483647;display:grid;gap:2px;padding:5px;border:1px solid rgba(255,255,255,.32);border-radius:999px;background:rgba(24,24,27,.72);backdrop-filter:blur(18px) saturate(1.4);color:white;font:500 13px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 10px 24px rgba(0,0,0,.18)}
      .dock.multi{border-radius:18px}
      .row{display:flex;align-items:center;gap:2px}
      button{min-width:44px;min-height:36px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer}
      button:hover{background:rgba(255,255,255,.12)}
      button:focus-visible{outline:2px solid white;outline-offset:2px}
      .label{min-width:120px;padding:0 10px}
      .group{width:100%;min-height:30px;font-size:12px;opacity:.86}
      .sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      @media (prefers-reduced-motion:reduce){*{transition:none!important}}
      @supports not ((backdrop-filter:blur(1px))){.dock{background:rgba(24,24,27,.96)}}
    </style>`;
  }
})();
```

- [ ] **Step 4: Verify picker core passes**

Run:

```bash
node --test test/picker-dom.test.js
npm run check
```

Expected: both commands exit 0.

- [ ] **Step 5: Checkpoint**

If inside a git repository:

```bash
git add src/picker/unship-picker.js test/picker-dom.test.js
git commit -m "feat: add instant DOM picker core"
```

If not inside a git repository, append:

```md
- checkpoint_task_5: picker discovery and switching implemented; picker-dom.test.js and npm run check passed
```

### Task 6: Browser UX, Accessibility, And Mutation Coverage

**Files:**
- Modify: `src/picker/unship-picker.js`
- Modify: `test/picker-browser.test.js`
- Modify: `test/picker-dom.test.js`

- [ ] **Step 1: Add browser UX tests**

Create `test/picker-browser.test.js`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "playwright";

const picker = await readFile(new URL("../src/picker/unship-picker.js", import.meta.url), "utf8");

test("toolbar fits mobile viewport and exposes title-only visible text", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.setContent(`<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Visual" hidden>B</div></section><script>${picker}</script>`);
  const box = await page.locator("css=[data-unship-toolbar]").evaluate((host) => host.shadowRoot.querySelector(".dock").getBoundingClientRect().toJSON());
  assert.equal(box.x >= 0, true);
  assert.equal(box.x + box.width <= 390, true);
  assert.match(await page.locator("css=[data-unship-toolbar]").evaluate((host) => host.shadowRoot.textContent), /Hero: Current/);
  await browser.close();
});

test("mutation observer discovers variants added after load", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<main id="app"></main><script>${picker}</script>`);
  await page.evaluate(() => {
    document.querySelector("#app").innerHTML = '<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Compact" hidden>B</div></section>';
  });
  await page.waitForFunction(() => window.__unshipPicker.getState().groups.length === 1);
  assert.equal((await page.evaluate(() => window.__unshipPicker.getState())).groups[0].options[1], "Compact");
  await browser.close();
});
```

Append to `test/picker-dom.test.js`:

```js
test("picker is singleton and destroy removes toolbar", async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const source = await readFile(PICKER, "utf8");
  await page.setContent(`<section data-unship-pick="Hero"><div data-unship-option="Current">A</div></section><script>${source}</script><script>${source}</script>`);
  assert.equal(await page.locator("[data-unship-toolbar]").count(), 1);
  await page.evaluate(() => window.__unshipPicker.destroy());
  assert.equal(await page.locator("[data-unship-toolbar]").count(), 0);
  await browser.close();
});
```

- [ ] **Step 2: Run browser tests**

Run:

```bash
node --test test/picker-browser.test.js test/picker-dom.test.js
```

Expected: tests pass after Task 5. If Playwright reports a missing browser, run:

```bash
npx playwright install chromium
```

Then rerun the tests.

- [ ] **Step 3: Refine toolbar CSS if tests reveal clipping**

If mobile fit fails, adjust only the `style()` function in `src/picker/unship-picker.js`:

```css
.dock{max-width:calc(100vw - 20px)}
.label{min-width:0;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
```

Expected: mobile test passes with no horizontal clipping.

- [ ] **Step 4: Verify full picker suite**

Run:

```bash
node --test test/picker-dom.test.js test/picker-browser.test.js
npm run check
```

Expected: commands exit 0.

- [ ] **Step 5: Checkpoint**

If inside a git repository:

```bash
git add src/picker/unship-picker.js test/picker-browser.test.js test/picker-dom.test.js
git commit -m "test: cover picker browser UX"
```

If not inside a git repository, append:

```md
- checkpoint_task_6: browser UX and mutation tests pass
```

### Task 7: Package Smoke, README, And Final Verification

**Files:**
- Modify: `README.md`
- Create: `test/package-smoke.test.js`
- Modify: `docs/plans/current-run.md`

- [ ] **Step 1: Write package smoke tests**

Create `test/package-smoke.test.js`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("packed package is small and excludes legacy implementation paths", () => {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const pack = JSON.parse(result.stdout)[0];
  const files = pack.files.map((file) => file.path);
  assert.equal(pack.size < 25_000, true, `package size ${pack.size} should stay under 25 KB`);
  assert.equal(files.some((file) => file.startsWith("src/bridge/")), false);
  assert.equal(files.some((file) => file.startsWith("src/core/")), false);
  assert.equal(files.some((file) => file.startsWith("src/runtime/")), false);
  assert.equal(files.some((file) => file.startsWith("src/toolbar/")), false);
  assert.equal(files.includes("src/picker/unship-picker.js"), true);
});
```

- [ ] **Step 2: Update README for the new product**

Replace `README.md` with:

```md
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

## What Unship Is Not

- No bridge.
- No session store.
- No source swapping during preview.
- No reload loop.
- No confirm button.
- No production dependency by default.
```

- [ ] **Step 3: Run final verification**

Run:

```bash
npm run verify
```

Expected:

- syntax check passes;
- all tests pass;
- `npm pack --dry-run` reports no legacy bridge/core/runtime/toolbar files;
- packed package size stays under 25 KB.

- [ ] **Step 4: Update current run**

Update `docs/plans/current-run.md`:

```md
# Current Run

- stage: implementation_ready
- topic: unship-instant-picker-hard-reset
- design_path: docs/superpowers/specs/2026-06-01-unship-instant-picker-prd.md
- technical_spec_path: docs/superpowers/specs/2026-06-01-unship-instant-picker-technical-spec.md
- execution_plan_path: docs/superpowers/plans/2026-06-01-unship-instant-picker-implementation-plan.md
- plan_review_path: docs/plans/2026-06-01-unship-instant-picker-prd-review.md
- archived_legacy_path: /Users/marcusbenhard/Development/Playground/unship-design-legacy-archive-2026-06-01
- verification: npm run verify passes for the instant picker implementation
- next_skill: superpowers:subagent-driven-development
- updated_at: 2026-06-01
```

- [ ] **Step 5: Checkpoint**

If inside a git repository:

```bash
git add README.md test/package-smoke.test.js docs/plans/current-run.md
git commit -m "docs: prepare instant picker implementation"
```

If not inside a git repository, append:

```md
- checkpoint_task_7: package smoke and final verification complete
```

## Self-Review Checklist

- [ ] No active file path references `.codex/skills` as the default target.
- [ ] No active code path implements bridge/session/source-swap/finalize/abort behavior.
- [ ] `npx unship check` allows docs and installed instructions but fails app source residue.
- [ ] Picker switching touches only direct child options in the active group.
- [ ] Picker makes no network requests and never reloads.
- [ ] Toolbar has no confirm/checkmark/pending/session language.
- [ ] Multi-group picker keeps independent selections.
- [ ] Agent skill requires brand read, cleanup, and `npx unship check`.
- [ ] Packed package excludes the external legacy archive and old implementation paths.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-01-unship-instant-picker-implementation-plan.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, with batch checkpoints for review.
