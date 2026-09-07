import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

const CLI = new URL("../src/cli/index.js", import.meta.url).pathname;
const PACKAGE_VERSION = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;

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
  assert.match(result.stdout, /Iterate with your agent in the app/);
  assert.match(result.stdout, /Workflow:/);
  assert.match(result.stdout, /Ask your agent for design or content options/);
  assert.match(result.stdout, /Your agent cleans up unused variants before shipping/);
  assert.match(result.stdout, /check verifies that no Unship preview artifacts remain/);
  assert.match(result.stdout, /install/);
  assert.match(result.stdout, /uninstall/);
  assert.match(result.stdout, /install --print-skill/);
  assert.doesNotMatch(result.stdout, /install-skill/);
});

test("install print-skill outputs the bundled skill without writing", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "--print-skill"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /name: unship/);
  assert.match(result.stdout, /Variant Creation/);
  assert.match(result.stdout, /check --readiness/);
  await assert.rejects(readFile(join(home, ".agents", "skills", "unship", "SKILL.md"), "utf8"));
});

test("install-skill is not public product surface", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install-skill", "--json"], cwd, home);

  assert.equal(result.status, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.match(json.error, /Unknown command: install-skill/);
});

test("install dry-run json detects claude inside temp home", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await mkdir(join(home, ".claude"), { recursive: true });

  const result = await runCliWithHome(["install", "--dry-run", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.dryRun, true);
  assert.deepEqual(json.harnesses.map((item) => item.id), ["claude"]);
  assert.equal(json.harnesses.find((item) => item.id === "claude").status, "planned");
  assert.equal(JSON.stringify(json).includes(home), true);
  assert.equal(JSON.stringify(json).includes(process.env.HOME), false);
  await assert.rejects(readFile(join(home, ".agents", "skills", "unship", "SKILL.md"), "utf8"));
});

test("install defaults to detected global homes and skips explicit-only roo", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await mkdir(join(home, ".cursor"), { recursive: true });
  await mkdir(join(home, ".gemini"), { recursive: true });
  await mkdir(join(home, ".roo"), { recursive: true });

  const result = await runCliWithHome(["install", "--dry-run", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.harnesses.map((item) => item.id), ["cursor", "gemini"]);
});

test("install defaults to shared agents skill when no harness home is detected", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "--dry-run", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.harnesses.map((item) => item.id), ["agents"]);
});

test("install repair includes existing stale shared agents files alongside detected homes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await mkdir(join(home, ".cursor"), { recursive: true });
  await writeFixture(join(home, ".agents", "skills", "unship", "SKILL.md"), "---\nname: unship\n---\nSTALE_MARKER_DO_NOT_KEEP\n");

  const result = await runCliWithHome(["install", "--repair", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.harnesses.map((item) => item.id), ["agents", "cursor"]);
  const backup = json.harnesses.find((h) => h.id === "agents").files[0].backup;
  assert.match(await readFile(backup, "utf8"), /STALE_MARKER_DO_NOT_KEEP/);
  assert.equal(await readFile(join(home, ".agents", "skills", "unship", "SKILL.md"), "utf8"), await readFile(new URL("../agent/skills/unship/SKILL.md", import.meta.url), "utf8"));
  assert.doesNotMatch(await readFile(join(home, ".agents", "skills", "unship", "SKILL.md"), "utf8"), /STALE_MARKER_DO_NOT_KEEP/);
});

test("install accepts positional harness names", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "cursor", "gemini", "--dry-run", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.harnesses.map((item) => item.id), ["cursor", "gemini"]);
  assert.equal(JSON.stringify(json).includes(".cursor/commands/unship.md"), true);
  assert.equal(JSON.stringify(json).includes(".gemini/commands/unship.toml"), true);
});

test("install reports unknown positional harness names clearly", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "space-cli", "--dry-run", "--json"], cwd, home);

  assert.equal(result.status, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.match(json.error, /Unknown install harness: space-cli/);
});

test("install cursor writes global Cursor command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "cursor", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.harnesses.map((item) => item.id), ["cursor"]);
  const command = await readFile(join(home, ".cursor", "commands", "unship.md"), "utf8");
  assert.match(command, /Use the Unship skill/);
  assert.match(command, /install --print-skill/);
});

test("install gemini writes global Gemini skill and command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "gemini", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(join(home, ".gemini", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  const command = await readFile(join(home, ".gemini", "commands", "unship.toml"), "utf8");
  assert.match(command, /description = "Compare temporary local alternatives with Unship"/);
  assert.match(JSON.parse(result.stdout).next.join("\n"), /\/commands reload/);
});

test("install windsurf and cline write global skill and workflow files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "windsurf", "cline", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(join(home, ".codeium", "windsurf", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  assert.match(await readFile(join(home, ".codeium", "windsurf", "global_workflows", "unship.md"), "utf8"), /# Unship/);
  assert.match(await readFile(join(home, ".cline", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  assert.match(await readFile(join(home, "Documents", "Cline", "Workflows", "unship.md"), "utf8"), /# Unship/);
});

test("install copilot remains project-only manual guidance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "copilot", "--dry-run", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.harnesses[0].id, "copilot");
  assert.equal(json.harnesses[0].status, "manual");
  assert.deepEqual(json.harnesses[0].files, []);
  assert.match(json.harnesses[0].next.join("\n"), /init --target copilot/);
});

test("install roo writes explicit global Roo skill and command", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "roo", "--yes", "--json"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.harnesses.map((item) => item.id), ["roo"]);
  assert.match(await readFile(join(home, ".roo", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  const command = await readFile(join(home, ".roo", "commands", "unship.md"), "utf8");
  assert.match(command, /Compare temporary local alternatives with Unship/);
  assert.match(command, /target, count, style, scope/);
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
  assert.match(result.stdout, /ask your agent for options/);
  assert.match(result.stdout, /have the agent run check --json with this CLI/);
  assert.match(result.stdout, /Next:\n- Restart/);
  assert.match(result.stdout, /If \/unship is unavailable after restart/);
  assert.match(result.stdout, /natural-language fallback/);
  assert.equal((result.stdout.match(/^Next:/gm) || []).length, 1);
});

test("install dry-run plain output names detected harnesses and planned paths", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await mkdir(join(home, ".cursor"), { recursive: true });
  await mkdir(join(home, ".gemini"), { recursive: true });

  const result = await runCliWithHome(["install", "--dry-run", "--no-update-check"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Detected Cursor and Gemini CLI/);
  assert.match(result.stdout, /~\/\.cursor\/commands\/unship\.md/);
  assert.match(result.stdout, /~\/\.gemini\/commands\/unship\.toml/);
  assert.match(result.stdout, /Optional repo helpers.*unship init/s);
});

test("install dry-run plain output explains shared agents fallback", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");

  const result = await runCliWithHome(["install", "--dry-run", "--no-update-check"], cwd, home);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No harness homes detected\. Using Shared \.agents skill\./);
  assert.doesNotMatch(result.stdout, /Detected Shared \.agents skill/);
  const json = await runCliWithHome(["install", "--dry-run", "--json"], cwd, home);
  assert.equal(JSON.parse(json.stdout).harnesses[0].fallback, true);
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

  assert.equal(result.status, 1, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
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
  assert.match(result.stdout, /No files were changed/);
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
  assert.equal(skill, await readFile(new URL("../agent/skills/unship/SKILL.md", import.meta.url), "utf8"));
  assert.match(skill, /setup --out/);
  assert.match(skill, /picker.current: true/);
  assert.doesNotMatch(skill, /run this freshness check|extract.*JavaScript body/i);

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

test("init codex writes only shared workspace files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const result = spawnSync(process.execPath, [CLI, "init", "--target", "codex", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.written.sort(), [
    ".agents/skills/unship/SKILL.md",
    "AGENTS.md"
  ]);
  assert.match(await readFile(join(cwd, ".agents", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  await assert.rejects(readFile(join(cwd, ".claude", "skills", "unship", "SKILL.md"), "utf8"));
  await assert.rejects(readFile(join(cwd, ".opencode", "commands", "unship.md"), "utf8"));
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
  assert.match(await readFile(join(cwd, ".cursor", "commands", "unship.md"), "utf8"), /install --print-skill/);
  assert.match(await readFile(join(cwd, ".cursor", "rules", "unship.mdc"), "utf8"), /alwaysApply: false/);
  assert.match(await readFile(join(cwd, ".github", "instructions", "unship.instructions.md"), "utf8"), /excludeAgent: "code-review"/);
  assert.match(await readFile(join(cwd, ".gemini", "commands", "unship.toml"), "utf8"), /\{\{args\}\}/);
  assert.match(await readFile(join(cwd, ".windsurf", "workflows", "unship.md"), "utf8"), /# Unship/);
  assert.match(await readFile(join(cwd, ".clinerules", "workflows", "unship.md"), "utf8"), /# Unship/);
  await assert.rejects(readFile(join(cwd, ".roo", "commands", "unship.md"), "utf8"));
});

test("init cursor writes repo-local Cursor command and rule", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const result = spawnSync(process.execPath, [CLI, "init", "--target", "cursor", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.written.includes(".agents/skills/unship/SKILL.md"), true);
  assert.match(await readFile(join(cwd, ".cursor", "commands", "unship.md"), "utf8"), /Use the Unship skill/);
  assert.match(await readFile(join(cwd, ".cursor", "rules", "unship.mdc"), "utf8"), /temporary local alternatives/);
});

test("init roo is explicit and writes Roo files", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const result = spawnSync(process.execPath, [CLI, "init", "--target", "roo", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(join(cwd, ".roo", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  assert.match(await readFile(join(cwd, ".roo", "commands", "unship.md"), "utf8"), /Compare temporary local alternatives/);
});

test("check stays clean after generated repo-local harness instructions", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const initAll = spawnSync(process.execPath, [CLI, "init", "--target", "all", "--json"], { cwd, encoding: "utf8" });
  const initRoo = spawnSync(process.execPath, [CLI, "init", "--target", "roo", "--json"], { cwd, encoding: "utf8" });

  assert.equal(initAll.status, 0, initAll.stderr);
  assert.equal(initRoo.status, 0, initRoo.stderr);

  const result = spawnSync(process.execPath, [CLI, "check", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.deepEqual(json.diagnostics, []);
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
  assert.match(json.next.join("\n"), /init --force --json with this CLI/);
  assert.doesNotMatch(json.next.join("\n"), /npx unship init/);
});

test("README documents local trust and unship troubleshooting", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

  assert.match(readme, /Unship is local comparison tooling/i);
  assert.match(readme, /does not send telemetry/i);
  assert.match(readme, /picker selection does not save source/i);
  assert.match(readme, /unship\.dev/i);
  assert.match(readme, /`\/unship` does not appear/i);
  assert.match(readme, /restart your agent/i);
  assert.match(readme, /doctor --json/);
  assert.match(readme, /install --repair/);
  assert.match(readme, /Natural language still works/i);
  assert.match(readme, /install --print-skill/);
  assert.match(readme, /Agent-assisted install/);
  assert.match(readme, /install --dry-run/);
  assert.match(readme, /install cursor gemini/);
  assert.match(readme, /repo-local/);
});

test("unknown commands fail instead of printing help as success", () => {
  const result = spawnSync(process.execPath, [CLI, "next", "--json"], { encoding: "utf8" });

  assert.equal(result.status, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.match(json.error, /Unknown command: next/);
});

test("unknown legacy setup flags fail without a stack trace", () => {
  for (const flag of ["--scope", "--wizard", "--detect"]) {
    const result = spawnSync(process.execPath, [CLI, "install", flag, "--json"], { encoding: "utf8" });

    assert.equal(result.status, 1);
    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.match(json.error, new RegExp(`Unknown option.*${flag}`));
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, /Error:/);
  }
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

test("check command fails instead of reporting clean for a missing root", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));

  const result = spawnSync(process.execPath, [CLI, "check", "--json", "--root", join(cwd, "missing")], { cwd, encoding: "utf8" });

  assert.equal(result.status, 1);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.match(json.error, /Cannot read project directory/);
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

test("check command plain output makes clean status explicit", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "src", "App.jsx"), "<main>Clean</main>\n");

  const result = spawnSync(process.execPath, [CLI, "check"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Unship check passed\./);
  assert.match(result.stdout, /No Unship preview artifacts found\./);
  assert.match(result.stdout, /No data-unship markers, picker references, or Unship comments were detected\./);
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
  assert.match(json.reminder, /Have the agent remove unused variants/);
  assert.match(json.reminder, /run unship check before shipping/);
  assert.equal(json.project.framework, "universal");
  assert.equal(json.project.skillInstalled, true);
  assert.equal(json.project.skillCurrent, false);
  assert.equal(json.project.pickerFileFound, true);
  assert.equal(json.project.pickerFileCurrent, false);
  assert.equal(json.project.devMountFound, true);
  assert.equal(json.residue.ok, false);
  assert.equal(json.residue.diagnostics.some((item) => item.file === "app/page.tsx"), true);
});

test("doctor treats Gemini skill as installed project instruction", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, ".gemini", "skills", "unship", "SKILL.md"), "---\nname: unship\n---\nstale\n");

  const result = spawnSync(process.execPath, [CLI, "doctor", "--json", "--no-update-check"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.project.skillInstalled, true);
  assert.equal(json.project.skillFile, ".gemini/skills/unship/SKILL.md");
  assert.equal(json.project.skillCurrent, false);
});

test("doctor json can disable update checks", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));

  const result = spawnSync(process.execPath, [CLI, "doctor", "--json", "--no-update-check"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.updates, { checked: false, reason: "disabled" });
  assert.equal(json.next.some((item) => /install --repair/.test(item)), false);
});

test("doctor stays offline by default", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  let requests = 0;
  await withServer((request, response) => { requests++; response.end("{}"); }, async (port) => {
    const result = await runCli(["doctor", "--json"], cwd, { UNSHIP_NPM_REGISTRY: `http://127.0.0.1:${port}` });
    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout);
    assert.deepEqual(json.updates, { checked: false, reason: "disabled" });
    assert.deepEqual(json.project.previewServers, []);
    assert.equal(requests, 0);
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
  assert.equal(json.version, PACKAGE_VERSION);
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
  assert.equal(result.stdout.split("\n")[0], `@unship/cli ${PACKAGE_VERSION}`);
  assert.match(result.stdout, /local comparison tooling/);
});

test("check --readiness reports pass for a well-formed exploration", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-readiness-"));
  await writeFixture(
    join(cwd, "src", "App.html"),
    '<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Alt" hidden>B</div></section>\n'
  );

  const result = spawnSync(process.execPath, [CLI, "check", "--readiness", "--json"], { cwd, encoding: "utf8" });
  const parsed = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, "pass");
});

test("check --readiness exits non-zero on structural failures", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-readiness-"));
  await writeFixture(
    join(cwd, "src", "App.html"),
    '<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Alt">B</div></section>\n'
  );

  const result = spawnSync(process.execPath, [CLI, "check", "--readiness", "--json"], { cwd, encoding: "utf8" });
  const parsed = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.equal(parsed.status, "fail");
  assert.equal(parsed.findings[0].code, "visible-count");
});

test("check --readiness prints human-readable findings without --json", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-readiness-"));
  await writeFixture(
    join(cwd, "src", "App.html"),
    '<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Alt">B</div></section>\n'
  );

  const result = spawnSync(process.execPath, [CLI, "check", "--readiness"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Readiness fail/);
  assert.match(result.stdout, /FAIL src\/App\.html:1 \[Hero\] Expected exactly one visible option/);
});

test("check --readiness exits zero for uncertain-only results", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-readiness-"));
  await writeFixture(
    join(cwd, "src", "App.jsx"),
    '<section data-unship-pick="Hero"><div data-unship-option="Current">A</div><div data-unship-option="Alt" hidden={x}>B</div></section>\n'
  );

  const result = spawnSync(process.execPath, [CLI, "check", "--readiness", "--json"], { cwd, encoding: "utf8" });
  const parsed = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, "uncertain");
});

test("install detects Codex alongside other agent homes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const home = join(cwd, "home");
  await mkdir(join(home, ".codex"), { recursive: true });
  await mkdir(join(home, ".claude"), { recursive: true });
  const result = await runCliWithHome(["install", "--dry-run", "--json"], cwd, home);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.deepEqual(plan.harnesses.map(h => h.id), ["agents", "claude"]);
  assert.equal(plan.harnesses[0].detected, true);
  assert.equal(plan.harnesses[0].fallback, false);
});


test("CLI validates setup arguments and supports conventional version output", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  for (const args of [["setup", "--out"], ["setup", "--out", ""], ["setup", "--persist", "forever"], ["snippet", "--inline", "--src", "/x.js"], ["check", "--force"]]) {
    const result = await runCli([...args, "--json"], cwd);
    assert.equal(result.status, 1, args.join(" "));
    assert.equal(JSON.parse(result.stdout).ok, false);
    assert.equal(result.stderr, "");
  }
  const version = await runCli(["--version"], cwd);
  assert.equal(version.stdout.trim(), PACKAGE_VERSION);
  const result = await runCli(["setup", "--out", "public/picker.js", "--src", "/picker.js", "--json"], cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).picker.current, true);
  await writeFile(join(cwd, "public/picker.js"), "different");
  const blocked = await runCli(["setup", "--out", "public/picker.js", "--json"], cwd);
  assert.equal(blocked.status, 1);
  assert.equal(JSON.parse(blocked.stdout).picker.current, false);
});
