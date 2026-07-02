import assert from "node:assert/strict";
import test from "node:test";
import { scanReadiness } from "../src/check/index.js";

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
