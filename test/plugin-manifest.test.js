import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

test("claude code plugin manifest stays valid and version-synced", async () => {
  const packageJson = await readJson("../package.json");
  const plugin = await readJson("../.claude-plugin/plugin.json");

  assert.equal(plugin.name, "unship");
  assert.equal(plugin.version, packageJson.version, "plugin.json version must match package.json");
  assert.equal(plugin.license, "MIT");
  assert.match(plugin.description, /picker/i);
  assert.equal(plugin.skills, "./agent/skills/");

  // The skills path must point at the bundled skill that npm installs also use,
  // so plugin installs and CLI installs never drift apart.
  await access(new URL("../agent/skills/unship/SKILL.md", import.meta.url));
});

test("self-hosted marketplace manifest lists the unship plugin", async () => {
  const packageJson = await readJson("../package.json");
  const marketplace = await readJson("../.claude-plugin/marketplace.json");

  assert.equal(marketplace.name, "unship-marketplace");
  assert.equal(typeof marketplace.owner?.name, "string");
  assert.equal(marketplace.plugins.length, 1);

  const [entry] = marketplace.plugins;
  assert.equal(entry.name, "unship");
  assert.equal(entry.source, "./");
  assert.equal(entry.version, packageJson.version, "marketplace entry version must match package.json");
});
