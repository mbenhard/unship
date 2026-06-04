import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("packed package is small and excludes legacy implementation paths", () => {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const pack = JSON.parse(result.stdout)[0];
  const files = pack.files.map((file) => file.path);
  assert.equal(pack.size < 25_000, true, `package size ${pack.size} should stay under 25 KB`);
  assert.deepEqual(files.sort(), [
    "LICENSE",
    "README.md",
    "agent/AGENTS.md",
    "agent/skills/unship/SKILL.md",
    "package.json",
    "src/agent/index.js",
    "src/check/index.js",
    "src/cli/index.js",
    "src/picker/unship-picker.js",
    "src/setup/index.js"
  ]);
  assert.equal(files.some((file) => file.startsWith("src/bridge/")), false);
  assert.equal(files.some((file) => file.startsWith("src/core/")), false);
  assert.equal(files.some((file) => file.startsWith("src/runtime/")), false);
  assert.equal(files.some((file) => file.startsWith("src/toolbar/")), false);
  assert.equal(files.includes("src/picker/unship-picker.js"), true);
});
