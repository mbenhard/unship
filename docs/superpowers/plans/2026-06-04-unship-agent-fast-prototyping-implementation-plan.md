# Unship Agent Fast Prototyping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured read-only Unship exploration summaries to `check` and `doctor`, then update the bundled skill/docs so agents prototype faster without new workflow commands.

**Architecture:** Keep the command surface unchanged. Extend `src/check/index.js` into a small shared source scanner that preserves current diagnostics and adds conservative `explorations`; `src/cli/index.js` reuses that result for additive `doctor.unship` and `doctor.next` fields. Update the installed skill and docs so agents run one startup status pass, prefer local binaries, avoid browser automation, defer greenfield setup until a shell exists, and distinguish settling a group from final cleanup.

**Tech Stack:** Node 20 ESM, `node:test`, no runtime dependencies, existing Playwright coverage unchanged except for full verification.

---

## File Map

- Modify: `src/check/index.js`
  - Preserve `checkUnshipResidue()` and `scanText()`.
  - Add `scanExplorations()` and conservative helpers in the same module.
  - Return additive fields: `explorations`, `cleanupRequired`.
- Modify: `src/cli/index.js`
  - Preserve current `doctor --json` fields.
  - Add `unship` summary and `next` recommendations.
- Modify: `agent/skills/unship/SKILL.md`
  - Update fast start, setup timing, exploration handling, target-first inspection, handoff, and cleanup.
- Modify: `README.md`, `docs/README.md`
  - Document structured read-only scanner output.
- Modify: `test/check.test.js`, `test/cli.test.js`
  - Add focused tests for scanner, CLI JSON, and skill text.
- Modify: `docs/plans/current-run.md`
  - Record implementation completion after verification.

## Task 1: Add Source Scanner Tests

**Files:**
- Modify: `test/check.test.js`

- [ ] **Step 1: Add failing scanner tests**

Append these tests to `test/check.test.js`:

```js
test("check summarizes unship explorations with option labels and line ranges", async () => {
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

  const result = await checkUnshipResidue({ root });

  assert.equal(result.ok, false);
  assert.equal(result.cleanupRequired, true);
  assert.deepEqual(result.explorations, [
    {
      pick: "Hero",
      file: "src/Hero.jsx",
      options: ["Current", "Proof"],
      uncertainOptions: [],
      startLine: 1,
      endLine: 4,
      rangeConfidence: "high"
    }
  ]);
});

test("check keeps duplicate group labels as separate explorations", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "Page.jsx"),
    `<section data-unship-pick="Hero"><div data-unship-option="A">A</div></section>
<section data-unship-pick="Hero"><div data-unship-option="B">B</div></section>
`,
    "utf8"
  );

  const result = await checkUnshipResidue({ root });

  assert.equal(result.explorations.length, 2);
  assert.deepEqual(result.explorations.map((item) => item.pick), ["Hero", "Hero"]);
  assert.deepEqual(result.explorations.map((item) => item.options), [["A"], ["B"]]);
});

test("check does not treat nested groups as parent range boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "Nested.jsx"),
    `<main data-unship-pick="Hero">
  <section data-unship-option="Current">
    <div data-unship-pick="Terminal">
      <div data-unship-option="Classic">A</div>
    </div>
  </section>
  <section data-unship-option="Visual" hidden>B</section>
</main>
`,
    "utf8"
  );

  const result = await checkUnshipResidue({ root });

  const hero = result.explorations.find((item) => item.pick === "Hero");
  const terminal = result.explorations.find((item) => item.pick === "Terminal");
  assert.deepEqual(hero.options, ["Current", "Visual"]);
  assert.equal(hero.endLine, 8);
  assert.deepEqual(terminal.options, ["Classic"]);
});

test("check marks dynamic option labels as uncertain", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "Dynamic.jsx"),
    `<section data-unship-pick="Hero">
  <div data-unship-option={variantLabel}>A</div>
  <div data-unship-option="Literal">B</div>
</section>
`,
    "utf8"
  );

  const result = await checkUnshipResidue({ root });

  assert.deepEqual(result.explorations[0].options, ["Literal"]);
  assert.deepEqual(result.explorations[0].uncertainOptions, ["variantLabel"]);
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run:

```bash
node --test test/check.test.js
```

Expected: FAIL because `checkUnshipResidue()` does not yet return `explorations` or `cleanupRequired`.

## Task 2: Implement Structured Exploration Scanning

**Files:**
- Modify: `src/check/index.js`

- [ ] **Step 1: Add scanner constants and return fields**

Update `checkUnshipResidue()` so it walks each file once and returns diagnostics plus explorations:

```js
const PICK_ATTR = "data-unship-pick";
const OPTION_ATTR = "data-unship-option";
const MAX_RANGE_LINES = 200;

export async function checkUnshipResidue({ root = process.cwd(), includeBuild = false } = {}) {
  const diagnostics = [];
  const explorations = [];
  for await (const file of walk(root, { includeBuild })) {
    const rel = toPosix(relative(root, file));
    if (isAllowedDocumentation(rel)) continue;
    const text = await readFile(file, "utf8");
    diagnostics.push(...scanText(rel, text));
    explorations.push(...scanExplorations(rel, text));
  }
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    explorations,
    cleanupRequired: diagnostics.length > 0
  };
}
```

- [ ] **Step 2: Add `scanExplorations()`**

Add this export below `scanText()`:

```js
export function scanExplorations(file, text) {
  const lines = text.split(/\r?\n/);
  const groups = [];
  lines.forEach((lineText, index) => {
    if (!lineText.includes(PICK_ATTR)) return;
    const tag = tagNameForAttribute(lineText, PICK_ATTR);
    const range = findElementRange(lines, index, tag);
    groups.push({
      pick: attributeValues(lineText, PICK_ATTR, groups.length + 1)[0]?.value || `Group ${groups.length + 1}`,
      file,
      startLine: index + 1,
      endLine: range.endLine,
      rangeConfidence: range.confidence,
      rangeStartIndex: index,
      rangeEndIndex: range.endIndex
    });
  });

  return groups.map((group) => {
    const nestedRanges = groups
      .filter((candidate) => candidate.startLine > group.startLine && candidate.rangeEndIndex <= group.rangeEndIndex)
      .map((candidate) => [candidate.rangeStartIndex, candidate.rangeEndIndex]);
    const options = collectOptionLabels(lines, group.rangeStartIndex, group.rangeEndIndex, nestedRanges, group.rangeConfidence);
    return {
      pick: group.pick,
      file: group.file,
      options: options.options,
      uncertainOptions: options.uncertainOptions,
      startLine: group.startLine,
      ...(group.endLine ? { endLine: group.endLine } : {}),
      rangeConfidence: group.rangeConfidence
    };
  });
}
```

- [ ] **Step 3: Add conservative parsing helpers**

Add these helpers below `scanExplorations()`:

```js
function tagNameForAttribute(lineText, attr) {
  const index = lineText.indexOf(attr);
  const before = index === -1 ? "" : lineText.slice(0, index);
  const match = before.match(/<([A-Za-z][\w:.-]*)\b[^<]*$/);
  return match?.[1] || null;
}

function findElementRange(lines, startIndex, tag) {
  const fallbackEnd = Math.min(lines.length - 1, startIndex + MAX_RANGE_LINES);
  if (!tag) return { endLine: null, endIndex: fallbackEnd, confidence: "low" };

  let depth = 0;
  for (let index = startIndex; index <= fallbackEnd; index += 1) {
    depth += tagDelta(lines[index], tag);
    if (depth <= 0) return { endLine: index + 1, endIndex: index, confidence: "high" };
  }
  return { endLine: null, endIndex: fallbackEnd, confidence: "low" };
}

function tagDelta(lineText, tag) {
  const escaped = escapeRegExp(tag);
  const open = new RegExp(`<${escaped}\\b(?![^>]*\\/>)[^>]*>`, "g");
  const selfClosing = new RegExp(`<${escaped}\\b[^>]*\\/>`, "g");
  const close = new RegExp(`</${escaped}>`, "g");
  return countMatches(lineText, open) - countMatches(lineText, close) - countMatches(lineText, selfClosing);
}

function collectOptionLabels(lines, startIndex, endIndex, nestedRanges, rangeConfidence) {
  const options = [];
  const uncertainOptions = [];
  let bareCount = 0;
  for (let index = startIndex; index <= endIndex; index += 1) {
    if (isInsideNestedRange(index, nestedRanges)) continue;
    for (const value of attributeValues(lines[index], OPTION_ATTR, bareCount + 1)) {
      if (value.bare) bareCount += 1;
      if (rangeConfidence !== "high" || value.kind !== "literal") uncertainOptions.push(value.value);
      else options.push(value.value);
    }
  }
  return { options, uncertainOptions };
}

function attributeValues(lineText, attr, bareIndex = 1) {
  const values = [];
  const escaped = escapeRegExp(attr);
  const regex = new RegExp(`${escaped}(?:\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|\\{\\s*\"([^\"]*)\"\\s*\\}|\\{\\s*'([^']*)'\\s*\\}|\\{\\s*([^}]+?)\\s*\\}))?`, "g");
  let match;
  while ((match = regex.exec(lineText))) {
    const full = match[0];
    if (full.includes("=")) {
      const literal = match[2] ?? match[3] ?? match[4] ?? match[5];
      if (literal !== undefined) values.push({ kind: "literal", value: literal || `Option ${bareIndex}`, bare: false });
      else values.push({ kind: "dynamic", value: (match[6] || "dynamic").trim(), bare: false });
    } else {
      values.push({ kind: "literal", value: `Option ${bareIndex}`, bare: true });
    }
  }
  return values;
}

function isInsideNestedRange(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index <= end);
}

function countMatches(text, regex) {
  return Array.from(text.matchAll(regex)).length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 4: Run focused check tests**

Run:

```bash
node --test test/check.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit scanner changes**

Run:

```bash
git add src/check/index.js test/check.test.js
git commit -m "feat: summarize unship explorations in check"
```

Expected: commit succeeds.

## Task 3: Add CLI Structured JSON And Doctor Summary

**Files:**
- Modify: `test/cli.test.js`
- Modify: `src/cli/index.js`

- [ ] **Step 1: Add failing CLI tests**

Append these tests near the existing check/doctor tests in `test/cli.test.js`:

```js
test("check json includes structured exploration summaries", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(
    join(cwd, "src", "Hero.jsx"),
    `<section data-unship-pick="Hero">
  <div data-unship-option="Current">A</div>
  <div data-unship-option="Proof" hidden>B</div>
</section>
`
  );

  const result = spawnSync(process.execPath, [CLI, "check", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.equal(Array.isArray(json.diagnostics), true);
  assert.deepEqual(json.explorations[0].options, ["Current", "Proof"]);
  assert.equal(json.cleanupRequired, true);
});

test("doctor json preserves compatibility fields and adds unship summary", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));
  await writeFixture(
    join(cwd, "app", "page.tsx"),
    `<section data-unship-pick="Hero">
  <div data-unship-option="Current">A</div>
  <div data-unship-option="Proof" hidden>B</div>
</section>
`
  );

  const result = spawnSync(process.execPath, [CLI, "doctor", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.packageName, "@unship/cli");
  assert.equal(json.version, "0.1.0");
  assert.equal(typeof json.node, "string");
  assert.equal(json.project.framework, "next");
  assert.equal(json.residue.ok, false);
  assert.equal(json.unship.activeExplorationCount, 1);
  assert.equal(json.unship.cleanupRequired, true);
  assert.deepEqual(json.unship.explorations[0].options, ["Current", "Proof"]);
  assert.equal(json.next.some((item) => /Hero/.test(item)), true);
});
```

- [ ] **Step 2: Run focused CLI tests to verify failure**

Run:

```bash
node --test test/cli.test.js
```

Expected: FAIL because `doctor` does not yet return `unship` or `next`.

- [ ] **Step 3: Implement doctor summary**

Modify `doctor()` in `src/cli/index.js`:

```js
async function doctor({ root, previewPorts }) {
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  const project = await inspectProject({ root, previewPorts });
  const residue = await checkUnshipResidue({ root });
  const unship = summarizeUnship(residue);
  return {
    ok: true,
    packageName: pkg.name,
    version: pkg.version,
    node: process.version,
    project,
    residue,
    unship,
    next: nextActions({ project, unship }),
    reminder: "Unship is local preview tooling. Remove picker markup before shipping."
  };
}
```

Add helpers:

```js
function summarizeUnship(residue) {
  return {
    explorations: residue.explorations || [],
    activeExplorationCount: residue.explorations?.length || 0,
    cleanupRequired: !residue.ok,
    artifactCount: residue.diagnostics?.length || 0
  };
}

function nextActions({ project, unship }) {
  const actions = [];
  if (!project.pickerFileFound || !project.devMountFound) {
    actions.push("Run setup after a local app shell exists if you need the picker mounted.");
  } else if (!project.pickerFileCurrent) {
    actions.push("Run setup --framework auto --json to refresh the stale picker file.");
  }
  if (unship.activeExplorationCount > 0) {
    const labels = unship.explorations.map((item) => item.pick).join(", ");
    actions.push(`Existing Unship explorations detected: ${labels}. Settle overlapping work before creating another overlapping exploration.`);
  }
  return actions;
}
```

- [ ] **Step 4: Run focused CLI tests**

Run:

```bash
node --test test/cli.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit CLI changes**

Run:

```bash
git add src/cli/index.js test/cli.test.js
git commit -m "feat: add unship doctor summary"
```

Expected: commit succeeds.

## Task 4: Update Skill And Docs

**Files:**
- Modify: `agent/skills/unship/SKILL.md`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `test/cli.test.js`

- [ ] **Step 1: Update skill tests first**

In `test/cli.test.js`, extend the existing skill assertions in `init writes portable skill by default` and `install-skill writes the global agents skill`:

```js
assert.match(skill, /\.\/node_modules\/\.bin\/unship/);
assert.match(skill, /If no app source, framework signal, or preview shell exists yet/i);
assert.match(skill, /Settle a selected group/i);
assert.match(skill, /Final cleanup/i);
assert.doesNotMatch(skill, /Use subagent mode only as an authoring workflow/i);
```

- [ ] **Step 2: Run focused CLI tests to verify failure**

Run:

```bash
node --test test/cli.test.js
```

Expected: FAIL on the new skill assertions.

## Task 5: Final Verification And Run Tracker

**Files:**
- Modify: `docs/plans/current-run.md`

- [ ] **Step 1: Update skill and docs**

Update `agent/skills/unship/SKILL.md`, `README.md`, and `docs/README.md` according to the validated design:

```md
Use `./node_modules/.bin/unship` when it exists.
If no app source, framework signal, or preview shell exists yet, code normally first and defer setup.
Inspect the named route, component, or source area first, then expand only when needed.
Settle a selected group without removing the picker when more exploration is active or expected.
Final cleanup removes all Unship artifacts and runs `$UNSHIP check --json`.
```

- [ ] **Step 2: Run focused CLI tests**

Run:

```bash
node --test test/cli.test.js
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS with syntax check, node tests, e2e, and pack dry run. Package size remains under 25 KB.

- [ ] **Step 4: Update current run**

Replace `docs/plans/current-run.md` with:

```md
# Current Run

- stage: implementation_complete
- topic: unship-agent-fast-prototyping
- design_path: docs/superpowers/specs/2026-06-04-unship-agent-fast-prototyping-design.md
- design_review_path: docs/plans/2026-06-04-unship-agent-fast-prototyping-plan-review.md
- execution_plan_path: docs/superpowers/plans/2026-06-04-unship-agent-fast-prototyping-implementation-plan.md
- verification: npm run verify passed
- next_skill: superpowers:finishing-a-development-branch
- updated_at: 2026-06-04
```

- [ ] **Step 5: Commit docs and tracker**

Run:

```bash
git add agent/skills/unship/SKILL.md README.md docs/README.md test/cli.test.js docs/plans/current-run.md docs/superpowers/plans/2026-06-04-unship-agent-fast-prototyping-implementation-plan.md
git commit -m "docs: tighten unship agent workflow"
```

Expected: commit succeeds.

- [ ] **Step 6: Review final state**

Run:

```bash
git status --short
git log --oneline --decorate -5
```

Expected: worktree clean except an untracked tarball if `npm pack --dry-run` writes one; latest commits match this implementation work.
