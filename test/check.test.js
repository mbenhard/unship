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

test("check reports every artifact occurrence on the same line", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "App.jsx"),
    '<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Proof">B</div></section>\n',
    "utf8"
  );

  const result = await checkUnshipResidue({ root });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.length, 3);
  assert.deepEqual(result.diagnostics.map((item) => item.pattern), [
    "data-unship-pick",
    "data-unship-option",
    "data-unship-option"
  ]);
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

test("check marks nested non-direct option labels as uncertain", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "NestedOption.jsx"),
    `<section data-unship-pick="Hero">
  <div data-unship-option="Direct">A</div>
  <div>
    <span data-unship-option="Nested">Ignored by picker</span>
  </div>
</section>
`,
    "utf8"
  );

  const result = await checkUnshipResidue({ root });

  assert.deepEqual(result.explorations[0].options, ["Direct"]);
  assert.deepEqual(result.explorations[0].uncertainOptions, ["Nested"]);
});

test("check ignores JSX props before the pick attribute when finding group range", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "JsxProps.jsx"),
    `<section icon={<Icon />} data-unship-pick="Hero">
  <div data-unship-option="Current">A</div>
</section>
`,
    "utf8"
  );

  const result = await checkUnshipResidue({ root });

  assert.deepEqual(result.explorations[0].options, ["Current"]);
  assert.equal(result.explorations[0].endLine, 3);
  assert.equal(result.explorations[0].rangeConfidence, "high");
});

test("check ignores nested JSX props before the pick attribute", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "NestedJsxProps.jsx"),
    `<section
  icon={<Icon props={{foo: "bar"}} />}
  data-unship-pick="Hero"
>
  <div data-unship-option="Current">A</div>
</section>
<section><div data-unship-option="Outside">C</div></section>
`,
    "utf8"
  );

  const result = await checkUnshipResidue({ root });

  assert.deepEqual(result.explorations[0], {
    pick: "Hero",
    file: "src/NestedJsxProps.jsx",
    options: ["Current"],
    uncertainOptions: [],
    startLine: 1,
    endLine: 6,
    rangeConfidence: "high"
  });
});

test("check bounds multiline JSX pick ranges to their element", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-check-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "Multiline.jsx"),
    `<section
  className="hero"
  data-unship-pick="Hero"
>
  <div data-unship-option="Current">A</div>
  <div data-unship-option="Proof" hidden>B</div>
</section>
<section>
  <div data-unship-option="Outside">C</div>
</section>
`,
    "utf8"
  );

  const result = await checkUnshipResidue({ root });

  assert.deepEqual(result.explorations[0], {
    pick: "Hero",
    file: "src/Multiline.jsx",
    options: ["Current", "Proof"],
    uncertainOptions: [],
    startLine: 1,
    endLine: 7,
    rangeConfidence: "high"
  });
});
