import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { checkUnshipReadiness, scanReadiness } from "../src/check/index.js";

test("readiness passes a plain HTML group with exactly one visible option", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<section data-unship-pick="Hero">',
      '  <div data-unship-option="Current">A</div>',
      '  <div data-unship-option="Alt" hidden>B</div>',
      "</section>"
    ].join("\n")
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0].pick, "Hero");
  assert.deepEqual(groups[0].options, ["Current", "Alt"]);
  assert.equal(groups[0].visibleCount, 1);
  assert.deepEqual(groups[0].findings, []);
});

test("readiness fails when two options are visible", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<section data-unship-pick="Hero">',
      '  <div data-unship-option="Current">A</div>',
      '  <div data-unship-option="Alt">B</div>',
      "</section>"
    ].join("\n")
  );

  assert.equal(groups[0].visibleCount, 2);
  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["visible-count"]);
  assert.equal(groups[0].findings[0].level, "fail");
});

test("readiness fails duplicate option labels within a group", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<section data-unship-pick="Hero">',
      '  <div data-unship-option="Alt">A</div>',
      '  <div data-unship-option="Alt" hidden>B</div>',
      "</section>"
    ].join("\n")
  );

  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["duplicate-label"]);
});

test("readiness fails a group with no options", () => {
  const groups = scanReadiness("src/App.html", '<section data-unship-pick="Hero"><div>A</div></section>');

  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["no-options"]);
  assert.equal(groups[0].findings[0].level, "fail");
});

test("readiness reports uncertain for JSX conditional hidden attributes", () => {
  const groups = scanReadiness(
    "src/App.jsx",
    [
      '<section data-unship-pick="Hero">',
      '  <div data-unship-option="Current">A</div>',
      '  <div data-unship-option="Alt" hidden={active !== 1}>B</div>',
      "</section>"
    ].join("\n")
  );

  assert.equal(groups[0].visibleCount, null);
  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["structure-uncertain"]);
  assert.equal(groups[0].findings[0].level, "uncertain");
});

test("readiness reports uncertain for dynamic option labels", () => {
  const groups = scanReadiness(
    "src/App.jsx",
    [
      '<section data-unship-pick="Hero">',
      "  <div data-unship-option={label}>A</div>",
      '  <div data-unship-option="Alt" hidden>B</div>',
      "</section>"
    ].join("\n")
  );

  assert.equal(groups[0].visibleCount, null);
  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["structure-uncertain"]);
});

test("readiness reports uncertain when the group range has low confidence", () => {
  const groups = scanReadiness(
    "src/App.jsx",
    '<section data-unship-pick="Hero">\n  <div data-unship-option="Current">A</div>\n'
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0].visibleCount, null);
  assert.equal(groups[0].findings[0].level, "uncertain");
});





test("readiness accepts Canvas Arrangements and fails invalid values", () => {
  for (const layout of ["stack", "grid"]) {
    const groups = scanReadiness(
      "src/App.html",
      `<section data-unship-pick="Hero" data-unship-canvas="${layout}"><div data-unship-option="A">A</div><div data-unship-option="B" hidden>B</div></section>`
    );
    assert.deepEqual(groups[0].findings, []);
  }

  const invalid = scanReadiness(
    "src/App.html",
    '<section data-unship-pick="Hero" data-unship-canvas="masonry"><div data-unship-option="A">A</div></section>'
  );
  assert.deepEqual(invalid[0].findings.map((finding) => `${finding.level}:${finding.code}`), ["fail:canvas-value"]);
});



test("readiness ignores options belonging to a nested group", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<section data-unship-pick="Hero">',
      '  <div data-unship-option="Current">',
      '    <h1 data-unship-pick="Headline">',
      '      <span data-unship-option="Claim">A</span>',
      '      <span data-unship-option="Question" hidden>B</span>',
      "    </h1>",
      "  </div>",
      '  <div data-unship-option="Alt" hidden>B</div>',
      "</section>"
    ].join("\n")
  );

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].options, ["Current", "Alt"]);
  assert.deepEqual(groups[1].options, ["Claim", "Question"]);
});

test("checkUnshipReadiness aggregates groups and reports pass", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-readiness-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "App.html"),
    '<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Alt" hidden>B</div></section>\n',
    "utf8"
  );

  const result = await checkUnshipReadiness({ root });

  assert.equal(result.ok, true);
  assert.equal(result.status, "pass");
  assert.equal(result.summary.groupCount, 1);
  assert.deepEqual(result.findings, []);
});

test("checkUnshipReadiness fails on structural problems and carries file context", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-readiness-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "App.html"),
    '<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Alt">B</div></section>\n',
    "utf8"
  );

  const result = await checkUnshipReadiness({ root });

  assert.equal(result.ok, false);
  assert.equal(result.status, "fail");
  assert.equal(result.findings[0].file, "src/App.html");
  assert.equal(result.findings[0].group, "Hero");
  assert.equal(result.findings[0].code, "visible-count");
});

test("checkUnshipReadiness reports uncertain status without failing", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-readiness-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "App.jsx"),
    '<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Alt" hidden={x}>B</div></section>\n',
    "utf8"
  );

  const result = await checkUnshipReadiness({ root });

  assert.equal(result.ok, true);
  assert.equal(result.status, "uncertain");
  assert.equal(result.summary.uncertainCount, 1);
});

test("readiness ignores attribute-name suffix collisions", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<section data-unship-pick="Hero">',
      '  <span x-data-unship-option="Ghost">z</span>',
      '  <div data-unship-option="Current">a</div>',
      '  <div data-unship-option="Alt" hidden>b</div>',
      "</section>"
    ].join("\n")
  );

  assert.deepEqual(groups[0].options, ["Current", "Alt"]);
  assert.deepEqual(groups[0].findings, []);
});

test("readiness ignores phantom groups from suffixed pick attributes", () => {
  const groups = scanReadiness(
    "src/App.html",
    '<section my-data-unship-pick="H"><div data-unship-option="C">a</div></section>'
  );

  assert.equal(groups.length, 0);
});

test("readiness ignores attribute names mentioned in text and attribute values", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<div data-unship-pick="Real">',
      '  <div data-unship-option="mentions data-unship-pick as text">content</div>',
      '  <p title="see data-unship-pick attribute in docs">explaining text with data-unship-pick inline</p>',
      '  <div data-unship-option="B" hidden>b</div>',
      "</div>"
    ].join("\n")
  );

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].options, ["mentions data-unship-pick as text", "B"]);
  assert.deepEqual(groups[0].findings, []);
});

test("readiness ignores options inside HTML comments", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<div data-unship-pick="Hero">',
      '  <div data-unship-option="A">a</div>',
      '  <!-- <div data-unship-option="Fake">x</div> -->',
      '  <div data-unship-option="B" hidden>b</div>',
      "</div>"
    ].join("\n")
  );

  assert.deepEqual(groups[0].options, ["A", "B"]);
  assert.deepEqual(groups[0].findings, []);
});

test("readiness ignores fake markup inside script bodies", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<div data-unship-pick="Real">',
      '  <div data-unship-option="A">a</div>',
      '  <div data-unship-option="B" hidden>b</div>',
      "</div>",
      "<script>",
      '  const template = `<div data-unship-pick="Fake"><div data-unship-option="X">fake</div></div>`;',
      "</script>"
    ].join("\n")
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0].pick, "Real");
});

test("readiness reports uncertain for Vue conditional directives", () => {
  const groups = scanReadiness(
    "src/Comp.vue",
    [
      "<template>",
      '  <div data-unship-pick="hero">',
      "    <div data-unship-option=\"A\" v-if=\"active === 'A'\">A</div>",
      '    <div data-unship-option="B" v-else>B</div>',
      "  </div>",
      "</template>"
    ].join("\n")
  );

  assert.equal(groups[0].visibleCount, null);
  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["structure-uncertain"]);
});

test("readiness reports uncertain when directives coexist with hidden attributes", () => {
  const groups = scanReadiness(
    "src/Comp.vue",
    [
      '<div data-unship-pick="hero">',
      '  <div data-unship-option="A" v-if="show">A</div>',
      '  <div data-unship-option="B" v-if="!show" hidden>B</div>',
      "</div>"
    ].join("\n")
  );

  assert.equal(groups[0].visibleCount, null);
  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["structure-uncertain"]);
});

test("readiness reports uncertain for Svelte control-flow blocks", () => {
  const groups = scanReadiness(
    "src/Comp.svelte",
    [
      '<div data-unship-pick="hero">',
      "  {#if show}",
      '    <div data-unship-option="A">A</div>',
      '    <div data-unship-option="B">B</div>',
      "  {/if}",
      "</div>"
    ].join("\n")
  );

  assert.equal(groups[0].visibleCount, null);
  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["structure-uncertain"]);
});

test("readiness keeps certainty across void elements between options", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<div data-unship-pick="g">',
      '  <div data-unship-option="A">a</div>',
      '  <img src="x.png">',
      "  <br>",
      '  <input type="text">',
      '  <div data-unship-option="B" hidden>b</div>',
      "</div>"
    ].join("\n")
  );

  assert.equal(groups[0].visibleCount, 1);
  assert.deepEqual(groups[0].findings, []);
});

test("readiness reports the group end line in its inventory", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<section data-unship-pick="Hero">',
      '  <div data-unship-option="Current">A</div>',
      '  <div data-unship-option="Alt" hidden>B</div>',
      "</section>"
    ].join("\n")
  );

  assert.equal(groups[0].startLine, 1);
  assert.equal(groups[0].endLine, 4);
});

test("readiness scans many instrumented groups in bounded time", () => {
  const parts = [];
  for (let i = 0; i < 2000; i += 1) {
    parts.push(
      `<div data-unship-pick="G${i}" style="--a${i}: 0;"><div data-unship-option="Only">x</div></div>`
    );
  }
  const started = Date.now();
  const groups = scanReadiness("src/big.html", parts.join("\n"));
  const elapsed = Date.now() - started;

  assert.equal(groups.length, 2000);
  assert.ok(elapsed < 3000, `scan took ${elapsed}ms`);
});




test("readiness rejects retired control markup without interpreting its payload", () => {
  const groups = scanReadiness("index.html", `<section data-unship-pick="Hero" data-unship-tweaks='not JSON'><div data-unship-option="A" data-unship-tweaks='[]'>A</div></section>`);
  assert.deepEqual(groups[0].findings.map(({code,level}) => ({code,level})), [
    { code: "retired-attribute", level: "fail" }, { code: "retired-attribute", level: "fail" }
  ]);
});
