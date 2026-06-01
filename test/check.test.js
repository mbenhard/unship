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
