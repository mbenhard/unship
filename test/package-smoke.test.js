import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createServer } from "node:http";
import { chromium } from "playwright";

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
  "src/setup/index.js"
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
  assert.equal(pack.size < 54_000, true, `package size ${pack.size} should stay under 54 KB`);
  assert.equal(pack.unpackedSize < 200_000, true, `unpacked size ${pack.unpackedSize} should stay under 200 KB`);
  // The picker is injected verbatim into consuming apps, so its uncompressed
  // weight matters independently of how well the tarball compresses.
  const pickerEntry = pack.files.find((file) => file.path === "src/picker/unship-picker.js");
  assert.equal(pickerEntry.size < 100_000, true, `picker size ${pickerEntry.size} should stay under 100 KB`);
  assert.deepEqual(files.sort(), EXPECTED_PACKED_FILES);
  assert.equal(files.some((file) => file.startsWith("src/bridge/")), false);
  assert.equal(files.some((file) => file.startsWith("src/core/")), false);
  assert.equal(files.some((file) => file.startsWith("src/runtime/")), false);
  assert.equal(files.some((file) => file.startsWith("src/toolbar/")), false);
  assert.equal(files.includes("src/picker/unship-picker.js"), true);
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
  const smokeCommands = [
    ["install", "--dry-run", "--json", "--no-update-check"],
    ["install", "--print-skill"],
    ["install", "cursor", "gemini", "--dry-run", "--json", "--no-update-check"],
    ["init", "--target", "all", "--force", "--json"],
    ["init", "--target", "roo", "--force", "--json"],
    ["uninstall", "--dry-run", "--json"]
  ];
  const results = new Map();
  for (const args of smokeCommands) {
    const result = spawnSync(bin, args, { cwd: consumer, encoding: "utf8", env });
    assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
    if (args.includes("--print-skill")) {
      assert.match(result.stdout, /name: unship/);
    } else {
    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, true);
    results.set(args.join(" "), json);
    }
  }

  const positional = results.get("install cursor gemini --dry-run --json --no-update-check");
  assert.deepEqual(positional.harnesses.map((item) => item.id), ["cursor", "gemini"]);
  assert.equal(JSON.stringify(positional).includes(".cursor/commands/unship.md"), true);
  assert.equal(JSON.stringify(positional).includes(".gemini/commands/unship.toml"), true);

  const initAll = results.get("init --target all --force --json");
  assert.equal(initAll.written.includes(".cursor/commands/unship.md"), true);
  assert.equal(initAll.written.includes(".github/instructions/unship.instructions.md"), true);
  assert.equal(initAll.written.includes(".gemini/commands/unship.toml"), true);

  const initRoo = results.get("init --target roo --force --json");
  assert.equal(initRoo.written.includes(".roo/commands/unship.md"), true);
  assert.match(await readFile(join(consumer, ".roo", "commands", "unship.md"), "utf8"), /Compare temporary local alternatives/);

  // Exercise the installed package, not the checkout: update -> serve -> compare -> settle.
  const app = join(consumer, "apps", "demo");
  await mkdir(join(app, "public"), { recursive: true });
  const invoke = (args) => {
    const result = spawnSync(bin, args, { cwd: app, env, encoding: "utf8" });
    return { code: result.status, data: JSON.parse(result.stdout) };
  };
  assert.equal(invoke(["install", "codex", "--yes", "--json"]).code, 0);
  assert.equal(await readFile(join(home, ".agents/skills/unship/SKILL.md"), "utf8"), await readFile(join(consumer, "node_modules/@unship/cli/agent/skills/unship/SKILL.md"), "utf8"));
  const runtime = await readFile(join(consumer, "node_modules/@unship/cli/src/picker/unship-picker.js"), "utf8");
  const oldRuntime = runtime + "\n// older local build, same package version\n";
  await writeFile(join(app, "public/preview-picker.js"), oldRuntime);
  const args = ["setup", "--out", "public/preview-picker.js", "--src", "/preview-picker.js", "--json"];
  assert.equal(invoke(args).code, 1);
  const updated = invoke([...args, "--force"]);
  assert.equal(updated.code, 0);
  assert.equal(await readFile(updated.data.picker.backup, "utf8"), oldRuntime);
  assert.equal(invoke(args).data.picker.status, "current");
  const htmlPath = join(app, "index.html");
  await writeFile(htmlPath, `<html><body><section data-unship-pick="Hero" data-unship-canvas="grid"><div data-unship-option="Current">A</div><div data-unship-option="Proof" hidden>B</div></section>${updated.data.mount.snippet}</body></html>`);
  assert.equal(invoke(["check", "--readiness", "--json"]).data.summary.groupCount, 1);
  assert.equal(invoke(["doctor", "--out", "public/preview-picker.js", "--json"]).data.project.pickerCurrent, true);

  const server = createServer(async (request, response) => {
    const script = request.url === "/preview-picker.js";
    response.setHeader("content-type", script ? "text/javascript" : "text/html");
    response.end(await readFile(script ? join(app, "public/preview-picker.js") : htmlPath));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    assert.equal(await (await fetch(`${url}/preview-picker.js`)).text(), runtime);
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(url);
    assert.equal(await page.evaluate(() => window.__unshipPicker.version), JSON.parse(await readFile(join(consumer, "node_modules/@unship/cli/package.json"), "utf8")).version);
    await page.getByRole("button", { name: "Next option", exact: true }).click();
    assert.equal(await page.locator('[data-unship-option="Proof"]').isVisible(), true);
    await page.getByRole("button", { name: "Open Canvas" }).click();
    await page.waitForFunction(() => document.querySelector("[data-unship-toolbar]")?.shadowRoot.querySelectorAll(".canvas-frame.ready").length === 2);
    await page.getByRole("button", { name: "Back to page", exact: true }).click();
    assert.equal(await page.locator('[data-unship-option="Proof"]').isVisible(), true);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
  await writeFile(htmlPath, '<html><body><section>B</section></body></html>');
  await rm(join(app, "public/preview-picker.js"));
  assert.equal(invoke(["check", "--json"]).code, 0);
  assert.equal(invoke(["uninstall", "codex", "--yes", "--json"]).code, 0);
  await assert.rejects(readFile(join(home, ".agents/skills/unship/SKILL.md")), { code: "ENOENT" });

});
