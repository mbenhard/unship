import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

test("claude code plugin manifest stays valid and version-synced", async () => {
  const packageJson = await readJson("../package.json");
  const plugin = await readJson("../plugin/.claude-plugin/plugin.json");

  assert.equal(plugin.name, "unship");
  assert.equal(plugin.version, packageJson.version, "plugin.json version must match package.json");
  assert.equal(plugin.license, "MIT");
  assert.match(plugin.description, /picker/i);
  assert.equal(plugin.skills, "./skills/");
});

test("plugin directory stays free of npm-install triggers", async () => {
  // The marketplace copies the plugin source directory into every user's
  // plugin cache and runs npm install when a package.json is present. The
  // plugin directory must stay manifest-plus-skill only so installs stay
  // instant and dependency-free.
  await assert.rejects(access(new URL("../plugin/package.json", import.meta.url)));
  await assert.rejects(access(new URL("../plugin/node_modules", import.meta.url)));
});

test("plugin skill copy stays identical to the bundled agent skill", async () => {
  const bundled = await readFile(new URL("../agent/skills/unship/SKILL.md", import.meta.url), "utf8");
  const pluginCopy = await readFile(new URL("../plugin/skills/unship/SKILL.md", import.meta.url), "utf8");

  assert.equal(pluginCopy, bundled, "plugin/skills/unship/SKILL.md must stay a byte-identical copy of agent/skills/unship/SKILL.md");
});

test("self-hosted marketplace manifest lists the unship plugin", async () => {
  const packageJson = await readJson("../package.json");
  const marketplace = await readJson("../.claude-plugin/marketplace.json");

  assert.equal(marketplace.name, "unship-marketplace");
  assert.equal(typeof marketplace.owner?.name, "string");
  assert.equal(marketplace.plugins.length, 1);

  const [entry] = marketplace.plugins;
  assert.equal(entry.name, "unship");
  assert.equal(entry.source, "./plugin");
  assert.equal(entry.version, packageJson.version, "marketplace entry version must match package.json");
});
