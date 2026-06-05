import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const EXPECTED_PACKED_FILES = [
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
];

test("packed package is small and excludes legacy implementation paths", () => {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const pack = JSON.parse(result.stdout)[0];
  const files = pack.files.map((file) => file.path);
  assert.equal(pack.size < 36_000, true, `package size ${pack.size} should stay under 36 KB`);
  assert.deepEqual(files.sort(), EXPECTED_PACKED_FILES);
  assert.equal(files.some((file) => file.startsWith("src/bridge/")), false);
  assert.equal(files.some((file) => file.startsWith("src/core/")), false);
  assert.equal(files.some((file) => file.startsWith("src/runtime/")), false);
  assert.equal(files.some((file) => file.startsWith("src/toolbar/")), false);
  assert.equal(files.includes("src/picker/unship-picker.js"), true);
});

test("release docs list every packed package file", async () => {
  const release = await readFile(new URL("../RELEASE.md", import.meta.url), "utf8");

  for (const file of EXPECTED_PACKED_FILES) {
    assert.match(release, new RegExp(`- \`${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\``));
  }
});

test("packed package smoke runs seamless install commands", async () => {
  const packDir = await mkdtemp(join(tmpdir(), "unship-pack-"));
  const consumer = await mkdtemp(join(tmpdir(), "unship-consumer-"));
  const home = join(consumer, "home");
  await mkdir(home, { recursive: true });

  const packResult = spawnSync("npm", ["pack", "--pack-destination", packDir, "--json"], { encoding: "utf8" });
  assert.equal(packResult.status, 0, packResult.stderr);
  const pack = JSON.parse(packResult.stdout)[0];
  const tarball = isAbsolute(pack.filename) ? pack.filename : join(packDir, pack.filename);

  const init = spawnSync("npm", ["init", "-y"], { cwd: consumer, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);

  const install = spawnSync("npm", ["install", "-D", tarball], { cwd: consumer, encoding: "utf8" });
  assert.equal(install.status, 0, install.stderr);

  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    CLAUDE_CONFIG_DIR: join(home, ".claude")
  };
  const bin = join(consumer, "node_modules", ".bin", "unship");
  for (const args of [
    ["install", "--dry-run", "--json", "--no-update-check"],
    ["install-skill", "--dir", join(home, "skills"), "--json"],
    ["uninstall", "--dry-run", "--json"]
  ]) {
    const result = spawnSync(bin, args, { cwd: consumer, encoding: "utf8", env });
    assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
    assert.equal(JSON.parse(result.stdout).ok, true);
  }
});
