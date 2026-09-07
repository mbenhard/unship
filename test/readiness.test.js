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

const VALID_AXES =
  '[{"type":"slider","label":"Density","var":"--gap","min":8,"max":48,"step":4,"unit":"px"},' +
  '{"type":"toggle","label":"Eyebrow","var":"--eyebrow","on":"block","off":"none"}]';

test("readiness records valid axes and their placement", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<section data-unship-pick="Hero" style="--pad: 48px;" data-unship-tweaks=\'[{"type":"slider","label":"Padding","var":"--pad","min":24,"max":96}]\'>',
      `  <div data-unship-option="Current" style="--gap: 24px; --eyebrow: block;" data-unship-tweaks='${VALID_AXES}'>A</div>`,
      '  <div data-unship-option="Alt" hidden>B</div>',
      "</section>"
    ].join("\n")
  );

  assert.deepEqual(groups[0].findings, []);
  assert.deepEqual(
    groups[0].axes.map((axis) => `${axis.on}:${axis.var}`),
    ["group:--pad", "Current:--gap", "Current:--eyebrow"]
  );
});

test("readiness fails malformed tweaks JSON without dropping the group", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<section data-unship-pick="Hero">',
      "  <div data-unship-option=\"Current\" data-unship-tweaks='[{oops'>A</div>",
      '  <div data-unship-option="Alt" hidden>B</div>',
      "</section>"
    ].join("\n")
  );

  const tweaksFinding = groups[0].findings.find((finding) => finding.code === "tweaks-json");
  assert.equal(tweaksFinding?.level, "fail");
  assert.deepEqual(groups[0].options, ["Current", "Alt"]);
});

test("readiness fails unknown control types, missing vars, and bad shapes", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<section data-unship-pick="Hero">',
      "  <div data-unship-option=\"Current\" style=\"--a: 1; --b: 1; --c: 1;\" data-unship-tweaks='[",
      '    {"type":"dial","label":"Nope","var":"--a"},',
      '    {"type":"slider","label":"NoVar","min":1,"max":2},',
      '    {"type":"slider","label":"BothForms","var":"--b","min":1,"max":2,"steps":[{"label":"a","value":"1"},{"label":"b","value":"2"}]},',
      '    {"type":"segmented","label":"TooMany","var":"--c","options":[{"label":"1","value":"1"},{"label":"2","value":"2"},{"label":"3","value":"3"},{"label":"4","value":"4"},{"label":"5","value":"5"}]}',
      "  ]'>A</div>",
      '  <div data-unship-option="Alt" hidden>B</div>',
      "</section>"
    ].join("\n")
  );

  assert.deepEqual(
    groups[0].findings.map((finding) => finding.code).sort(),
    ["axis-shape", "axis-shape", "axis-type", "axis-var"]
  );
});

test("readiness fails a missing inline default and reports uncertain for dynamic style", () => {
  const groups = scanReadiness(
    "src/App.jsx",
    [
      '<section data-unship-pick="Hero">',
      "  <div data-unship-option=\"Current\" data-unship-tweaks='[{\"type\":\"toggle\",\"label\":\"T\",\"var\":\"--t\",\"on\":\"1\",\"off\":\"0\"}]'>A</div>",
      "  <div data-unship-option=\"Alt\" hidden style={styles} data-unship-tweaks='[{\"type\":\"toggle\",\"label\":\"U\",\"var\":\"--u\",\"on\":\"1\",\"off\":\"0\"}]'>B</div>",
      "</section>"
    ].join("\n")
  );

  const codes = groups[0].findings.map((finding) => `${finding.level}:${finding.code}`);
  assert.ok(codes.includes("fail:axis-default"));
  assert.ok(codes.includes("uncertain:axis-default"));
});

test("readiness reports dynamic tweaks values as uncertain", () => {
  const groups = scanReadiness(
    "src/App.jsx",
    [
      '<section data-unship-pick="Hero">',
      '  <div data-unship-option="Current" data-unship-tweaks={axes}>A</div>',
      '  <div data-unship-option="Alt" hidden>B</div>',
      "</section>"
    ].join("\n")
  );

  assert.deepEqual(groups[0].findings.map((finding) => `${finding.level}:${finding.code}`), ["uncertain:tweaks-dynamic"]);
});

test("readiness fails duplicate vars across option and shared group axes", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<section data-unship-pick="Hero" style="--gap: 8px;" data-unship-tweaks=\'[{"type":"slider","label":"Pad","var":"--gap","min":1,"max":9}]\'>',
      "  <div data-unship-option=\"Current\" style=\"--gap: 24px;\" data-unship-tweaks='[{\"type\":\"slider\",\"label\":\"Gap\",\"var\":\"--gap\",\"min\":8,\"max\":48}]'>A</div>",
      '  <div data-unship-option="Alt" hidden>B</div>',
      "</section>"
    ].join("\n")
  );

  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["duplicate-var"]);
});

test("readiness accepts a valid inline-group hint", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<h1 data-unship-pick="Headline" data-unship-as="segmented">',
      '  <span data-unship-option="Claim">A</span>',
      '  <span data-unship-option="Question" hidden>B</span>',
      "</h1>"
    ].join("\n")
  );

  assert.deepEqual(groups[0].findings, []);
});

test("readiness fails an invalid data-unship-as value", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<h1 data-unship-pick="Headline" data-unship-as="dropdown">',
      '  <span data-unship-option="Claim">A</span>',
      '  <span data-unship-option="Question" hidden>B</span>',
      "</h1>"
    ].join("\n")
  );

  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["as-value"]);
  assert.equal(groups[0].findings[0].level, "fail");
});

test("readiness notes an ignored hint on groups with more than 4 options", () => {
  const spans = ["A", "B", "C", "D", "E"]
    .map((label, index) => `  <span data-unship-option="${label}"${index ? " hidden" : ""}>x</span>`)
    .join("\n");
  const groups = scanReadiness(
    "src/App.html",
    `<h1 data-unship-pick="Headline" data-unship-as="segmented">\n${spans}\n</h1>`
  );

  assert.deepEqual(groups[0].findings.map((finding) => `${finding.level}:${finding.code}`), ["note:as-overflow"]);
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

test("readiness fails a slider declaring both range and steps keys", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<div data-unship-pick="Hero">',
      "  <div data-unship-option=\"A\" style=\"--x: 0;\" data-unship-tweaks='[{\"type\":\"slider\",\"label\":\"X\",\"var\":\"--x\",\"min\":0,\"max\":10,\"steps\":[{\"label\":\"a\",\"value\":\"1\"}]}]'>a</div>",
      '  <div data-unship-option="B" hidden>b</div>',
      "</div>"
    ].join("\n")
  );

  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["axis-shape"]);
});

test("readiness fails duplicate vars within shared group axes", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<div data-unship-pick="Hero" style="--gap: 8px;" data-unship-tweaks=\'[{"type":"slider","label":"A","var":"--gap","min":1,"max":9},{"type":"slider","label":"B","var":"--gap","min":2,"max":8}]\'>',
      '  <div data-unship-option="A">a</div>',
      '  <div data-unship-option="B" hidden>b</div>',
      "</div>"
    ].join("\n")
  );

  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["duplicate-var"]);
});

test("readiness fails an inline default that matches no control position", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<div data-unship-pick="Hero">',
      "  <div data-unship-option=\"A\" style=\"--eyebrow: inline;\" data-unship-tweaks='[{\"type\":\"toggle\",\"label\":\"Eyebrow\",\"var\":\"--eyebrow\",\"on\":\"block\",\"off\":\"none\"}]'>a</div>",
      '  <div data-unship-option="B" hidden>b</div>',
      "</div>"
    ].join("\n")
  );

  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["axis-default"]);
  assert.match(groups[0].findings[0].message, /does not match/);
});

test("readiness requires an anchored style declaration for defaults", () => {
  const groups = scanReadiness(
    "src/App.html",
    [
      '<div data-unship-pick="Hero">',
      "  <div data-unship-option=\"A\" style=\"--label:x--g:y;\" data-unship-tweaks='[{\"type\":\"toggle\",\"label\":\"G\",\"var\":\"--g\",\"on\":\"1\",\"off\":\"0\"}]'>a</div>",
      '  <div data-unship-option="B" hidden>b</div>',
      "</div>"
    ].join("\n")
  );

  assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["axis-default"]);
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
      `<div data-unship-pick="G${i}" data-unship-tweaks='[{"type":"toggle","label":"A","var":"--a${i}","on":"1","off":"0"}]' style="--a${i}: 0;"><div data-unship-option="Only">x</div></div>`
    );
  }
  const started = Date.now();
  const groups = scanReadiness("src/big.html", parts.join("\n"));
  const elapsed = Date.now() - started;

  assert.equal(groups.length, 2000);
  assert.ok(elapsed < 3000, `scan took ${elapsed}ms`);
});

test("checkUnshipReadiness keeps pass status when only notes are present", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-readiness-"));
  await mkdir(join(root, "src"), { recursive: true });
  const spans = ["A", "B", "C", "D", "E"]
    .map((label, index) => `<span data-unship-option="${label}"${index ? " hidden" : ""}>x</span>`)
    .join("");
  await writeFile(
    join(root, "src", "App.html"),
    `<h1 data-unship-pick="Headline" data-unship-as="segmented">${spans}</h1>\n`,
    "utf8"
  );

  const result = await checkUnshipReadiness({ root });

  assert.equal(result.ok, true);
  assert.equal(result.status, "pass");
  assert.equal(result.summary.noteCount, 1);
});

test("readiness rejects unusable numeric slider steps and units", () => {
  for (const extra of [{ step: 0 }, { step: -1 }, { step: "2" }, { unit: {} }]) {
    const axis = { type: "slider", label: "Offset", var: "--offset", min: -20, max: 0, ...extra };
    const groups = scanReadiness("preview.html", `<section data-unship-pick="Offset"><div data-unship-option="Current" style="--offset: -8px;" data-unship-tweaks='${JSON.stringify([axis])}'>Card</div></section>`);
    assert.deepEqual(groups[0].findings.map((finding) => finding.code), ["axis-shape"]);
  }
});
