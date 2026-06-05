import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

const CLI = new URL("../src/cli/index.js", import.meta.url).pathname;

async function writeFixture(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    return await callback(port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function runCli(args, cwd, env = {}) {
  const child = spawn(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const status = await new Promise((resolve) => child.on("close", resolve));
  return { status, stdout, stderr };
}

async function runCliWithHome(args, cwd, home) {
  return runCli(args, cwd, {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    CLAUDE_CONFIG_DIR: join(home, ".claude")
  });
}

test("help lists seamless install commands", () => {
  const result = spawnSync(process.execPath, [CLI, "help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /install/);
  assert.match(result.stdout, /uninstall/);
  assert.match(result.stdout, /install-skill/);
});

test("install print-skill outputs the bundled skill without writing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "--print-skill"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /name: unship/);
  assert.match(result.stdout, /Fast Start/);
  await assert.rejects(readFile(join(home, ".agents", "skills", "unship", "SKILL.md"), "utf8"));
});

test("install-skill plain output is user-facing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  const skillRoot = join(home, "skills");

  const result = await runCliWithHome(["install-skill", "--dir", skillRoot], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Unship skill installed/);
  assert.match(result.stdout, /Path:/);
  assert.match(result.stdout, /Next:\n- Restart/);
  assert.doesNotMatch(result.stdout, /^Wrote /m);
  assert.doesNotMatch(result.stdout, /^Next: .*$/m);
});

test("install dry-run json plans shared and claude targets inside temp home", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await mkdir(join(home, ".claude"), { recursive: true });

  const result = await runCliWithHome(["install", "--dry-run", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.dryRun, true);
  assert.equal(json.harnesses.some((item) => item.id === "agents"), true);
  assert.equal(json.harnesses.some((item) => item.id === "claude"), true);
  assert.equal(json.harnesses.find((item) => item.id === "agents").status, "planned");
  assert.equal(JSON.stringify(json).includes(home), true);
  assert.equal(JSON.stringify(json).includes(process.env.HOME), false);
  await assert.rejects(readFile(join(home, ".agents", "skills", "unship", "SKILL.md"), "utf8"));
});

test("install all yes writes shared and claude targets then reruns current", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await mkdir(join(home, ".claude"), { recursive: true });

  const first = await runCliWithHome(["install", "--all", "--yes", "--json"], cwd, home);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).ok, true);
  assert.equal(first.stdout.includes('"content"'), false);
  assert.match(await readFile(join(home, ".agents", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  assert.match(await readFile(join(home, ".claude", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  const command = await readFile(join(home, ".claude", "commands", "unship.md"), "utf8");
  assert.match(command, /Use the Unship skill/);
  assert.doesNotMatch(command, /unship next/);

  const second = await runCliWithHome(["install", "--all", "--yes", "--json"], cwd, home);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.stringify(JSON.parse(second.stdout)).includes('"status":"current"'), true);
});

test("install plain output groups next actions once", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "--all", "--yes", "--no-update-check"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Unship install complete/);
  assert.match(result.stdout, /Next:\n- Restart/);
  assert.match(result.stdout, /If \/unship is unavailable after restart/);
  assert.match(result.stdout, /natural-language fallback/);
  assert.equal((result.stdout.match(/^Next:/gm) || []).length, 1);
});

test("install claude plain output includes slash and fallback guidance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await mkdir(join(home, ".claude"), { recursive: true });

  const result = await runCliWithHome(["install", "--harness", "claude", "--yes", "--no-update-check"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Unship install complete/);
  assert.match(result.stdout, /\/unship/);
  assert.match(result.stdout, /natural-language fallback/);
  assert.equal((result.stdout.match(/^Next:/gm) || []).length, 1);
});

test("install repairs legacy claude command into shim", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await writeFixture(join(home, ".claude", "commands", "unship.md"), "Run `unship next --json` at session start.\n");

  const result = await runCliWithHome(["install", "--harness", "claude", "--repair", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.legacy.some((item) => item.status === "legacy-replaced-with-shim"), true);
  const command = await readFile(join(home, ".claude", "commands", "unship.md"), "utf8");
  assert.match(command, /Use the Unship skill/);
  assert.doesNotMatch(command, /unship next/);
});

test("install skips user modified skill and blocks claude command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await writeFixture(join(home, ".claude", "skills", "unship", "SKILL.md"), "# My custom skill\n");

  const result = await runCliWithHome(["install", "--harness", "claude", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(JSON.stringify(json).includes("user-modified"), true);
  assert.equal(JSON.stringify(json).includes("blocked-missing-skill"), true);
  await assert.rejects(readFile(join(home, ".claude", "commands", "unship.md"), "utf8"));
});

test("install repair does not overwrite custom command text that only mentions Unship", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  const commandPath = join(home, ".claude", "commands", "unship.md");
  await runCliWithHome(["install", "--harness", "claude", "--yes", "--json"], cwd, home);
  await writeFixture(commandPath, "Use Unship in my own custom workflow.\n");

  const result = await runCliWithHome(["install", "--harness", "claude", "--repair", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  const command = json.harnesses.find((item) => item.id === "claude").files.find((file) => file.role === "command");
  assert.equal(command.state, "user-modified");
  assert.equal(command.operation, "skip");
  assert.equal(await readFile(commandPath, "utf8"), "Use Unship in my own custom workflow.\n");
});

test("install json without yes is not consent to write", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "--json"], cwd, home);

  assert.equal(result.status, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.match(json.error, /--yes/);
});

test("uninstall all yes removes managed harness files and legacy files only", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await runCliWithHome(["install", "--all", "--yes", "--json"], cwd, home);
  await writeFixture(join(home, ".claude", "commands", "unship-batch.md"), "# unship-batch\nparallel task processing\n");
  await writeFixture(join(home, ".claude", "commands", "custom-unship.md"), "I mention Unship but am custom.\n");

  const result = await runCliWithHome(["uninstall", "--all", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(readFile(join(home, ".agents", "skills", "unship", "SKILL.md"), "utf8"));
  await assert.rejects(readFile(join(home, ".claude", "commands", "unship-batch.md"), "utf8"));
  assert.match(await readFile(join(home, ".claude", "commands", "custom-unship.md"), "utf8"), /custom/);
});

test("uninstall dry-run plain output names uninstall", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await runCliWithHome(["install", "--all", "--yes", "--json"], cwd, home);

  const result = await runCliWithHome(["uninstall", "--dry-run"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Unship uninstall dry run/);
  assert.doesNotMatch(result.stdout, /Unship install dry run/);
});

test("install can include project setup while no-project skips it", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ devDependencies: { vite: "6.0.0" } }));
  await writeFixture(join(cwd, "index.html"), '<div id="root"></div>\n</body>\n');

  const skipped = await runCliWithHome(["install", "--all", "--no-project", "--yes", "--json"], cwd, home);
  assert.equal(skipped.status, 0, skipped.stderr);
  await assert.rejects(readFile(join(cwd, "public", "unship-picker.js"), "utf8"));

  const included = await runCliWithHome(["install", "--project", "--yes", "--json"], cwd, home);
  assert.equal(included.status, 0, included.stderr);
  const json = JSON.parse(included.stdout);
  assert.equal(json.project.status, "manual");
  assert.match(json.project.reason, /setup --json/);
  assert.match(json.next.join("\n"), /setup --json/);
  await assert.rejects(readFile(join(cwd, "public", "unship-picker.js"), "utf8"));
});

test("install project in empty repo leaves picker setup explicit", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "--project", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.project.included, true);
  assert.equal(json.project.status, "manual");
  assert.match(json.project.reason, /setup --json/);
  await assert.rejects(readFile(join(cwd, "public", "unship-picker.js"), "utf8"));
});

test("install project in dependency-only package repo leaves picker setup explicit", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ devDependencies: { prettier: "3.0.0" } }));

  const result = await runCliWithHome(["install", "--project", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.project.included, true);
  assert.equal(json.project.status, "manual");
  await assert.rejects(readFile(join(cwd, "public", "unship-picker.js"), "utf8"));
});

test("uninstall project removes current picker file but leaves app source deliberate", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  const picker = await readFile(new URL("../src/picker/unship-picker.js", import.meta.url), "utf8");
  await writeFixture(join(cwd, "index.html"), '<div id="root"></div>\n<script src="/unship-picker.js" data-unship-dev></script>\n</body>\n');
  await writeFixture(join(cwd, "public", "unship-picker.js"), picker);

  const result = await runCliWithHome(["uninstall", "--project", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.project.status, "complete");
  await assert.rejects(readFile(join(cwd, "public", "unship-picker.js"), "utf8"));
  assert.match(await readFile(join(cwd, "index.html"), "utf8"), /unship-picker\.js/);
});

test("install-skill remains skill only", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  const skillRoot = join(home, "skills");
  await writeFixture(join(home, ".claude", "commands", "unship.md"), "Run unship next --json\n");

  const result = await runCliWithHome(["install-skill", "--dir", skillRoot, "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(join(skillRoot, "unship", "SKILL.md"), "utf8"), /name: unship/);
  assert.match(await readFile(join(home, ".claude", "commands", "unship.md"), "utf8"), /unship next/);
});

test("init writes portable skill by default", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const result = spawnSync(process.execPath, [CLI, "init", "--json"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.written.includes(".agents/skills/unship/SKILL.md"), true);
  assert.equal(json.written.includes(".claude/skills/unship/SKILL.md"), true);
  assert.equal(json.written.includes(".opencode/commands/unship.md"), true);
  const skill = await readFile(join(cwd, ".agents", "skills", "unship", "SKILL.md"), "utf8");
  assert.match(skill, /name: unship/);
  assert.match(skill, /Target-First Read/);
  assert.match(skill, /Fast Start/);
  assert.match(skill, /use unship to compare 4 hero directions/i);
  assert.match(skill, /empty, loading, and error states/i);
  assert.match(skill, /button system treatments/i);
  assert.match(skill, /Do not build a custom switcher/i);
  assert.match(skill, /Do not start, open, or automate a browser by default/i);
  assert.match(skill, /detected preview servers as hints/i);
  assert.match(skill, /Unship is local comparison tooling/i);
  assert.match(skill, /does not send telemetry/i);
  assert.match(skill, /Picker selection does not save source/i);
  assert.match(skill, /whether the installed skill or picker appears stale/i);
  assert.match(skill, /multiple groups with the same label/i);
  assert.match(skill, /the variant group label/i);
  assert.match(skill, /the visible option labels/i);
  assert.match(skill, /whether picker setup is installed and current/i);
  assert.match(skill, /any detected preview servers as hints only/i);
  assert.match(skill, /cleanup status if existing Unship artifacts already exist/i);
  assert.match(skill, /repeated option labels/i);
  assert.match(skill, /"the second one"/i);
  assert.match(skill, /overlapping active explorations/i);
  assert.match(skill, /If `\/unship` is unavailable after installation, continue from the natural-language request/i);
  assert.match(skill, /\.\/node_modules\/\.bin\/unship/);
  assert.match(skill, /If no app source or preview shell exists yet/i);
  assert.match(skill, /Settle a selected group/i);
  assert.match(skill, /Final cleanup/i);
  assert.doesNotMatch(skill, /Before stopping for human choice, open or reuse the preview page/i);
  assert.doesNotMatch(skill, /Use subagent mode only as an authoring workflow/i);
  assert.match(skill, /project\.skillInstalled.*project\.skillCurrent/s);
  assert.doesNotMatch(skill, /unship-design/);
});

test("init antigravity writes workspace skill", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const result = spawnSync(process.execPath, [CLI, "init", "--target", "antigravity", "--json"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.written.includes(".agents/skills/unship/SKILL.md"), true);
  assert.match(await readFile(join(cwd, ".agents", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
});

test("init all writes shared skill plus claude and opencode shims", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const result = spawnSync(process.execPath, [CLI, "init", "--target", "all", "--json"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.written.includes(".agents/skills/unship/SKILL.md"), true);
  assert.match(await readFile(join(cwd, ".claude", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  const command = await readFile(join(cwd, ".opencode", "commands", "unship.md"), "utf8");
  assert.match(command, /Compare temporary local alternatives with Unship/);
  assert.match(command, /local surface to compare/);
});

test("init does not overwrite without force", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  spawnSync(process.execPath, [CLI, "init", "--json"], { cwd, encoding: "utf8" });
  const second = spawnSync(process.execPath, [CLI, "init", "--json"], { cwd, encoding: "utf8" });
  const json = JSON.parse(second.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.skipped.includes(".agents/skills/unship/SKILL.md"), true);
});

test("init fails loudly when an installed skill is stale", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, ".agents", "skills", "unship", "SKILL.md"), "---\nname: unship\n---\n");

  const result = spawnSync(process.execPath, [CLI, "init", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.stale.includes(".agents/skills/unship/SKILL.md"), true);
  assert.match(json.next.join("\n"), /npx @unship\/cli@latest init --force --json/);
  assert.doesNotMatch(json.next.join("\n"), /npx unship init/);
});

test("install-skill writes the global agents skill", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const skillRoot = join(cwd, "global-skills");

  const result = spawnSync(process.execPath, [CLI, "install-skill", "--dir", skillRoot, "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.written.includes(join(skillRoot, "unship", "SKILL.md")), true);
  const skill = await readFile(join(skillRoot, "unship", "SKILL.md"), "utf8");
  assert.match(skill, /name: unship/);
  assert.match(skill, /npx -y @unship\/cli@latest/);
  assert.match(skill, /\.\/node_modules\/\.bin\/unship/);
  assert.doesNotMatch(skill, /npx unship\b/);
  assert.doesNotMatch(skill, /lists `@unship\/cli` or `unship`/);
  assert.match(skill, /does not send telemetry/i);
  assert.match(skill, /the variant group label/i);
  assert.match(skill, /the visible option labels/i);
  assert.match(skill, /whether picker setup is installed and current/i);
  assert.match(skill, /any detected preview servers as hints only/i);
  assert.match(skill, /cleanup status if existing Unship artifacts already exist/i);
  assert.match(skill, /repeated option labels/i);
  assert.match(skill, /"the second one"/i);
  assert.match(skill, /overlapping active explorations/i);
  assert.match(skill, /If `\/unship` is unavailable after installation, continue from the natural-language request/i);
  assert.match(skill, /Settle a selected group/i);
  assert.match(skill, /Final cleanup/i);
});

test("README documents local trust and unship troubleshooting", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  assert.match(readme, /Unship is local comparison tooling/i);
  assert.match(readme, /does not send telemetry/i);
  assert.match(readme, /picker selection does not save source/i);
  assert.match(readme, /\/unship does not appear/i);
  assert.match(readme, /Restart the agent after running `install`/);
  assert.match(readme, /doctor --json/);
  assert.match(readme, /install --repair/);
  assert.match(readme, /natural-language fallback/);
  assert.match(readme, /install --print-skill/);
});

test("install-skill skips, fails stale, and refreshes with force", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const skillRoot = join(cwd, "global-skills");

  const first = spawnSync(process.execPath, [CLI, "install-skill", "--dir", skillRoot, "--json"], { cwd, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);

  const second = spawnSync(process.execPath, [CLI, "install-skill", "--dir", skillRoot, "--json"], { cwd, encoding: "utf8" });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).skipped.includes(join(skillRoot, "unship", "SKILL.md")), true);

  await writeFixture(join(skillRoot, "unship", "SKILL.md"), "---\nname: unship\n---\nSTALE_MARKER_DO_NOT_KEEP\n");

  const stale = spawnSync(process.execPath, [CLI, "install-skill", "--dir", skillRoot, "--json"], { cwd, encoding: "utf8" });
  assert.equal(stale.status, 1);
  const staleJson = JSON.parse(stale.stdout);
  assert.equal(staleJson.ok, false);
  assert.equal(staleJson.stale.includes(join(skillRoot, "unship", "SKILL.md")), true);
  assert.match(staleJson.next.join("\n"), /install-skill --force/);

  const forced = spawnSync(process.execPath, [CLI, "install-skill", "--dir", skillRoot, "--force", "--json"], { cwd, encoding: "utf8" });
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(JSON.parse(forced.stdout).written.includes(join(skillRoot, "unship", "SKILL.md")), true);
  assert.doesNotMatch(await readFile(join(skillRoot, "unship", "SKILL.md"), "utf8"), /STALE_MARKER_DO_NOT_KEEP/);
});

test("unknown commands fail instead of printing help as success", () => {
  const result = spawnSync(process.execPath, [CLI, "next", "--json"], { encoding: "utf8" });

  assert.equal(result.status, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.match(json.error, /Unknown command: next/);
});

test("snippet prints local picker script", () => {
  const result = spawnSync(process.execPath, [CLI, "snippet"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /<script src="\/unship-picker\.js" data-unship-dev><\/script>/);
});

test("snippet can opt into local persistence", () => {
  const result = spawnSync(process.execPath, [CLI, "snippet", "--persist", "local"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /data-unship-persist="local"/);
});

test("snippet can inline the picker for local experiments", () => {
  const result = spawnSync(process.execPath, [CLI, "snippet", "--inline"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /<script data-unship-dev>/);
  assert.match(result.stdout, /__unshipPicker/);
});

test("setup returns a framework-agnostic inline picker snippet", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));
  await writeFixture(join(cwd, "app", "layout.tsx"), "<html><body>{children}</body></html>\n");

  const result = spawnSync(process.execPath, [CLI, "setup", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.framework, "universal");
  assert.equal(json.picker.status, "inline");
  assert.equal(json.mount.status, "manual");
  assert.equal(json.mount.mode, "inline");
  assert.match(json.mount.snippet, /<script data-unship-dev>/);
  assert.match(json.mount.snippet, /__unshipPicker/);
  assert.match(json.next.join("\n"), /dev-only app shell/);
  await assert.rejects(readFile(join(cwd, "public", "unship-picker.js"), "utf8"));
  assert.doesNotMatch(await readFile(join(cwd, "app", "layout.tsx"), "utf8"), /unship/i);
});

test("setup keeps explicit legacy targets as compatibility no-ops", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));

  const result = spawnSync(process.execPath, [CLI, "setup", "next", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.framework, "universal");
  assert.equal(json.mount.status, "manual");
  assert.match(json.mount.snippet, /__unshipPicker/);
});

test("check command returns non-zero for source residue", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await import("node:fs/promises").then(({ mkdir, writeFile }) =>
    mkdir(join(cwd, "src"), { recursive: true }).then(() =>
      writeFile(join(cwd, "src", "App.jsx"), '<div data-unship-pick="Hero"></div>\n', "utf8")
    )
  );
  const result = spawnSync(process.execPath, [CLI, "check", "--json"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
});

test("check command plain output includes cleanup summary before diagnostics", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await import("node:fs/promises").then(({ mkdir, writeFile }) =>
    mkdir(join(cwd, "src"), { recursive: true }).then(() =>
      writeFile(join(cwd, "src", "App.jsx"), '<div data-unship-pick="Hero"></div>\n', "utf8")
    )
  );
  const result = spawnSync(process.execPath, [CLI, "check"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^Unship cleanup required: 1 artifact across 1 file\./);
  assert.match(result.stdout, /Explorations:\n- Hero in src\/App\.jsx/);
  assert.match(result.stdout, /src\/App\.jsx:1:6/);
  assert.match(result.stdout, /Remove temporary Unship picker markup/);
});

test("check json includes structured exploration summaries", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(
    join(cwd, "src", "Hero.jsx"),
    `<section data-unship-pick="Hero">
  <div data-unship-option="Current">A</div>
  <div data-unship-option="Proof" hidden>B</div>
</section>
`
  );

  const result = spawnSync(process.execPath, [CLI, "check", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.equal(Array.isArray(json.diagnostics), true);
  assert.deepEqual(json.explorations[0].options, ["Current", "Proof"]);
  assert.equal(json.cleanupRequired, true);
  assert.equal(json.summary.artifactCount, 3);
  assert.equal(json.summary.explorationCount, 1);
  assert.match(json.summary.message, /Unship cleanup required/);
});

test("doctor reports package, project setup state, and residue", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));
  await writeFixture(join(cwd, ".agents", "skills", "unship", "SKILL.md"), "---\nname: unship\n---\n");
  await writeFixture(join(cwd, "public", "unship-picker.js"), "window.__unshipPicker = {};\n");
  await writeFixture(
    join(cwd, "app", "layout.tsx"),
    'import Script from "next/script";\nexport default function Layout({ children }) { return <body>{children}<Script src="/unship-picker.js" data-unship-dev /></body>; }\n'
  );
  await writeFixture(join(cwd, "app", "page.tsx"), 'export default function Page() { return <div data-unship-pick="Hero" />; }\n');

  const result = spawnSync(process.execPath, [CLI, "doctor", "--json", "--no-update-check"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.packageName, "@unship/cli");
  assert.match(json.reminder, /local comparison tooling/);
  assert.equal(json.project.framework, "universal");
  assert.equal(json.project.skillInstalled, true);
  assert.equal(json.project.skillCurrent, false);
  assert.equal(json.project.pickerFileFound, true);
  assert.equal(json.project.pickerFileCurrent, false);
  assert.equal(json.project.devMountFound, true);
  assert.equal(json.residue.ok, false);
  assert.equal(json.residue.diagnostics.some((item) => item.file === "app/page.tsx"), true);
});

test("doctor json can disable update checks", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));

  const result = spawnSync(process.execPath, [CLI, "doctor", "--json", "--no-update-check"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.updates, { checked: false, reason: "disabled" });
  assert.equal(json.next.some((item) => /install --repair/.test(item)), false);
});

test("doctor json reports update availability from npm registry", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));

  await withServer((request, response) => {
    assert.equal(request.url, "/%40unship%2Fcli");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ "dist-tags": { latest: "0.1.4" } }));
  }, async (port) => {
    const result = await runCli(["doctor", "--json"], cwd, {
      UNSHIP_NPM_REGISTRY: `http://127.0.0.1:${port}`
    });

    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout);
    assert.equal(json.updates.checked, true);
    assert.equal(json.updates.available, true);
    assert.equal(json.updates.current, "0.1.3");
    assert.equal(json.updates.latest, "0.1.4");
    assert.match(json.updates.next, /install --repair/);
    assert.equal(json.next[0], json.updates.next);
  });
});

test("doctor json continues when update check is unavailable", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));

  await withServer((request, response) => {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "offline" }));
  }, async (port) => {
    const result = await runCli(["doctor", "--json"], cwd, {
      UNSHIP_NPM_REGISTRY: `http://127.0.0.1:${port}`
    });

    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout);
    assert.equal(json.updates.checked, true);
    assert.equal(json.updates.available, null);
    assert.equal(json.updates.error, "unavailable");
    assert.equal(json.ok, true);
  });
});

test("doctor next actions prioritize stale skill and picker repairs", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));
  await writeFixture(join(cwd, ".agents", "skills", "unship", "SKILL.md"), "---\nname: unship\n---\nstale\n");
  await writeFixture(join(cwd, "public", "unship-picker.js"), "old picker\n");
  await writeFixture(
    join(cwd, "app", "page.tsx"),
    `<section data-unship-pick="Hero"><div data-unship-option="Current">A</div></section>\n`
  );

  const result = spawnSync(process.execPath, [CLI, "doctor", "--json", "--no-update-check"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.match(json.next[0], /init --force --json/);
  assert.match(json.next[1], /setup --json/);
  assert.equal(json.next.some((item) => /Hero/.test(item)), true);
});

test("doctor caps exploration labels in next actions", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));
  await writeFixture(
    join(cwd, "app", "page.tsx"),
    Array.from({ length: 5 }, (_, index) =>
      `<section data-unship-pick="Group ${index + 1}"><div data-unship-option="Current">${index}</div></section>`
    ).join("\n")
  );

  const result = spawnSync(process.execPath, [CLI, "doctor", "--json", "--no-update-check"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  const explorationAction = json.next.find((item) => /Existing Unship explorations detected/.test(item));
  assert.match(explorationAction, /Group 1, Group 2, Group 3, and 2 more/);
  assert.doesNotMatch(explorationAction, /Group 4/);
  assert.doesNotMatch(explorationAction, /Group 5/);
});

test("doctor json preserves compatibility fields and adds unship summary", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));
  await writeFixture(
    join(cwd, "app", "page.tsx"),
    `<section data-unship-pick="Hero">
  <div data-unship-option="Current">A</div>
  <div data-unship-option="Proof" hidden>B</div>
</section>
`
  );

  const result = spawnSync(process.execPath, [CLI, "doctor", "--json", "--no-update-check"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.packageName, "@unship/cli");
  assert.equal(json.version, "0.1.3");
  assert.equal(typeof json.node, "string");
  assert.equal(json.project.framework, "universal");
  assert.equal(json.residue.ok, false);
  assert.equal(json.unship.activeExplorationCount, 1);
  assert.equal(json.unship.cleanupRequired, true);
  assert.deepEqual(json.unship.explorations[0].options, ["Current", "Proof"]);
  assert.equal(json.next.some((item) => /Hero/.test(item)), true);
});

test("doctor reports a live preview server so agents can reuse it", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));

  await withServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<html><head><title>Existing Preview</title></head><body>ready</body></html>");
  }, async (port) => {
    const result = await runCli(["doctor", "--json", "--no-update-check", "--ports", String(port)], cwd);

    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout);
    assert.deepEqual(json.project.previewServers, [{
      url: `http://127.0.0.1:${port}`,
      port,
      status: 200,
      title: "Existing Preview"
    }]);
  });
});

test("doctor plain output reports doctor details", () => {
  const result = spawnSync(process.execPath, [CLI, "doctor", "--no-update-check"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /@unship\/cli 0\.1\.3/);
  assert.match(result.stdout, /local comparison tooling/);
});
