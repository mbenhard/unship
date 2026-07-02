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
