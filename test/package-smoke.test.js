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
  "src/agent-targets/index.js",
  "src/agent/index.js",
  "src/check/index.js",
  "src/cli/index.js",
  "src/install/index.js",
  "src/picker/unship-picker.js",
  "src/project-files/index.js",
  "src/setup/index.js",
  "src/update/index.js"
];

test("picker runtime version matches package version", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const picker = await readFile(new URL("../src/picker/unship-picker.js", import.meta.url), "utf8");
  const escapedVersion = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  assert.match(picker, new RegExp(`version: "${escapedVersion}"`));
});

test("packed package is small and excludes legacy implementation paths", () => {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const pack = JSON.parse(result.stdout)[0];
  const files = pack.files.map((file) => file.path);
  assert.equal(pack.size < 36_000, true, `package size ${pack.size} should stay under 36 KB`);
  assert.equal(pack.unpackedSize < 140_000, true, `unpacked size ${pack.unpackedSize} should stay under 140 KB`);
  // The picker is injected verbatim into consuming apps, so its uncompressed
  // weight matters independently of how well the tarball compresses.
  const pickerEntry = pack.files.find((file) => file.path === "src/picker/unship-picker.js");
  assert.equal(pickerEntry.size < 42_000, true, `picker size ${pickerEntry.size} should stay under 42 KB`);
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

test("bundled skill frontmatter stays YAML-safe", async () => {
  const skill = await readFile(new URL("../agent/skills/unship/SKILL.md", import.meta.url), "utf8");
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.notEqual(frontmatter, null);

  for (const line of frontmatter[1].split("\n").filter(Boolean)) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    assert.notEqual(field, null, `frontmatter line should be key/value YAML: ${line}`);

    const value = field[2];
    const isQuoted = /^(['"]).*\1$/.test(value);
    assert.equal(/:\s/.test(value) && !isQuoted, false, `quote frontmatter values containing colon-space: ${line}`);
  }

  assert.match(frontmatter[1], /^name:\s+unship$/m);
  assert.match(frontmatter[1], /^description:\s+".+"$/m);
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
    ["install", "--print-skill"],
    ["uninstall", "--dry-run", "--json"]
  ]) {
    const result = spawnSync(bin, args, { cwd: consumer, encoding: "utf8", env });
    assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
    if (args.includes("--print-skill")) assert.match(result.stdout, /name: unship/);
    else assert.equal(JSON.parse(result.stdout).ok, true);
  }
});
