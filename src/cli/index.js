#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getAgentTemplates } from "../agent/index.js";
import { checkUnshipResidue } from "../check/index.js";
import { inspectProject, setupProject } from "../setup/index.js";

const args = process.argv.slice(2);
const command = args[0] || "help";
const flags = parseFlags(args.slice(1));

try {
  if (command === "init") {
    const result = await init({ target: flags.target || "codex", force: Boolean(flags.force) });
    print(result, flags.json);
  } else if (command === "snippet") {
    await printSnippet(flags);
  } else if (command === "check") {
    const result = await checkUnshipResidue({ root: flags.root || process.cwd(), includeBuild: Boolean(flags["include-build"]) });
    print(result, flags.json);
    if (!result.ok) process.exitCode = 1;
  } else if (command === "doctor") {
    print(await doctor({ root: flags.root || process.cwd(), previewPorts: parsePorts(flags.ports) }), flags.json);
  } else if (command === "setup") {
    const result = await setupProject({
      root: flags.root || process.cwd(),
      framework: flags.framework || flags._[0] || "auto",
      force: Boolean(flags.force),
      dryRun: Boolean(flags["dry-run"])
    });
    print(result, flags.json);
  } else {
    printHelp();
  }
} catch (error) {
  if (flags.json) {
    console.log(JSON.stringify({ ok: false, error: error.message }));
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
}

async function init({ target, force }) {
  const templates = await getAgentTemplates();
  const files = targetFiles(target, templates);
  const written = [];
  const skipped = [];
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    try {
      await writeFile(file.path, file.content, { flag: force ? "w" : "wx" });
      written.push(file.path);
    } catch (error) {
      if (error.code === "EEXIST") skipped.push(file.path);
      else throw error;
    }
  }
  return { ok: true, written, skipped };
}

function targetFiles(target, templates) {
  if (target === "codex") return [{ path: ".agents/skills/unship/SKILL.md", content: templates.skill }];
  if (target === "claude") return [{ path: ".claude/skills/unship/SKILL.md", content: templates.skill }, { path: "CLAUDE.md", content: templates.claude }];
  if (target === "opencode") return [{ path: ".opencode/skills/unship/SKILL.md", content: templates.skill }, { path: ".opencode/commands/unship.md", content: templates.opencodeCommand }];
  if (target === "all") return [...targetFiles("codex", templates), ...targetFiles("claude", templates), ...targetFiles("opencode", templates), { path: "AGENTS.md", content: templates.agents }];
  throw new Error(`Unknown init target: ${target}`);
}

function parseFlags(items) {
  const parsed = { _: [] };
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === "--json") parsed.json = true;
    else if (item === "--force") parsed.force = true;
    else if (item === "--target") parsed.target = items[++index];
    else if (item === "--framework") parsed.framework = items[++index];
    else if (item === "--src") parsed.src = items[++index];
    else if (item === "--persist") parsed.persist = items[++index];
    else if (item === "--ports") parsed.ports = items[++index];
    else if (item === "--root") parsed.root = items[++index];
    else if (item === "--include-build") parsed["include-build"] = true;
    else if (item === "--dry-run") parsed["dry-run"] = true;
    else if (item === "--global-shortcuts") parsed["global-shortcuts"] = true;
    else if (item === "--inline") parsed.inline = true;
    else if (!item.startsWith("-")) parsed._.push(item);
    else throw new Error(`Unknown flag: ${item}`);
  }
  return parsed;
}

async function printSnippet(flags) {
  if (flags.inline) {
    const source = await readFile(new URL("../picker/unship-picker.js", import.meta.url), "utf8");
    const tag = `<script data-unship-dev>\n${source}\n</script>`;
    if (flags.json) console.log(JSON.stringify({ ok: true, snippet: tag }));
    else console.log(tag);
    return;
  }

  const src = flags.src || "/unship-picker.js";
  const attrs = ["data-unship-dev"];
  if (flags.persist === "local") attrs.push('data-unship-persist="local"');
  if (flags["global-shortcuts"]) attrs.push("data-unship-global-shortcuts");
  const tag = `<script src="${src}" ${attrs.join(" ")}></script>`;
  if (flags.json) console.log(JSON.stringify({ ok: true, snippet: tag }));
  else console.log(tag);
}

async function doctor({ root, previewPorts }) {
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  const project = await inspectProject({ root, previewPorts });
  const residue = await checkUnshipResidue({ root });
  return {
    ok: true,
    packageName: pkg.name,
    version: pkg.version,
    node: process.version,
    project,
    residue,
    reminder: "Unship is local preview tooling. Remove picker markup before shipping."
  };
}

function print(value, json) {
  if (json) {
    console.log(JSON.stringify(value));
  } else if (Array.isArray(value.diagnostics)) {
    printCheck(value);
  } else if (value.picker && value.mount) {
    printSetup(value);
  } else if (value.packageName) {
    const preview = value.project.previewServers.length ? value.project.previewServers.map((server) => server.url).join(", ") : "none detected";
    console.log(`${value.packageName} ${value.version}\nNode ${value.node}\nFramework ${value.project.framework}\nSkill installed ${value.project.skillInstalled ? "yes" : "no"}\nPicker file ${value.project.pickerFileFound ? value.project.pickerFile : "missing"}\nDev mount ${value.project.devMountFound ? value.project.devMountFile : "missing"}\nPreview servers ${preview}\n${value.reminder}`);
  } else {
    const lines = [];
    if (value.written?.length) lines.push(`Wrote ${value.written.join(", ")}`);
    if (value.skipped?.length) lines.push(`Skipped existing ${value.skipped.join(", ")}`);
    console.log(lines.length ? lines.join("\n") : "Unship initialized.");
  }
}

function parsePorts(value) {
  if (!value) return undefined;
  return String(value).split(",").map((item) => Number(item.trim())).filter(Boolean);
}

function printSetup(result) {
  const lines = [
    `Framework ${result.framework}`,
    `Picker ${result.picker.status}: ${result.picker.path}`,
    `Mount ${result.mount.status}${result.mount.file ? `: ${result.mount.file}` : ""}`
  ];
  if (result.next?.length) lines.push(...result.next.map((item) => `Next: ${item}`));
  console.log(lines.join("\n"));
}

function printCheck(result) {
  if (result.ok) {
    console.log("No Unship preview artifacts found.");
    return;
  }
  console.log(result.diagnostics.map((item) => `${item.file}:${item.line}:${item.column} ${item.message} (${item.pattern})`).join("\n"));
}

function printHelp() {
  console.log("Usage: unship init|setup|snippet|check|doctor");
}
