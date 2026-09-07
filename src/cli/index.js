#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { backupFile } from "../project-files/index.js";
import { initTargetFiles } from "../agent-targets/index.js";
import { getAgentTemplates } from "../agent/index.js";
import { checkUnshipReadiness, checkUnshipResidue } from "../check/index.js";
import { applyInstallPlan, applyUninstallPlan, planInstall, planUninstall } from "../install/index.js";
import { inspectProject, pickerSnippet, setupProject } from "../setup/index.js";

const args = process.argv.slice(2);
const command = args[0] || "help";
let flags = {};

try {
  flags = parseFlags(args.slice(1));
  if (command === "--version" || command === "version") {
    const pkg = await readPackageInfo();
    console.log(flags.json ? JSON.stringify({ packageName: pkg.name, version: pkg.version }) : pkg.version);
  } else if (command === "install") {
    const plan = await planInstall(installOptions(flags));
    if (plan.printSkill) {
      console.log(plan.skill);
    } else {
      if (plan.ok && !flags["dry-run"] && !flags.yes && !flags.json) {
        printInstallResult({ ...plan, dryRun: true }, false);
      }
      const approved = !plan.ok || flags["dry-run"] || flags.yes || await confirmPlan("Proceed with Unship install?");
      let result = !plan.ok
        ? plan
        : approved
          ? (flags["dry-run"] ? plan : await applyInstallPlan(plan))
          : { ok: false, command: "install", error: "Install cancelled.", next: [] };
      printInstallResult(result, flags.json);
      if (!result.ok) process.exitCode = 1;
    }
  } else if (command === "uninstall") {
    const plan = await planUninstall(installOptions(flags));
    if (plan.ok && !flags["dry-run"] && !flags.yes && !flags.json) {
      printInstallResult({ ...plan, dryRun: true }, false);
    }
    const approved = !plan.ok || flags["dry-run"] || flags.yes || await confirmPlan("Proceed with Unship uninstall?");
    const result = !plan.ok
      ? plan
      : approved
        ? (flags["dry-run"] ? plan : await applyUninstallPlan(plan))
        : { ok: false, command: "uninstall", error: "Uninstall cancelled.", next: [] };
    printInstallResult(result, flags.json);
    if (!result.ok) process.exitCode = 1;
  } else if (command === "init") {
    const result = await init({ target: flags.target || "portable", force: Boolean(flags.force) });
    print(result, flags.json);
    if (!result.ok) process.exitCode = 1;
  } else if (command === "snippet") {
    await printSnippet(flags);
  } else if (command === "check") {
    const options = { root: flags.root || process.cwd(), includeBuild: Boolean(flags["include-build"]) };
    const result = flags.readiness ? await checkUnshipReadiness(options) : await checkUnshipResidue(options);
    print(result, flags.json);
    if (!result.ok) process.exitCode = 1;
  } else if (command === "doctor") {
    print(await doctor({
      root: flags.root || process.cwd(),
      previewPorts: parsePorts(flags.ports),
      out: flags.out, inline: Boolean(flags.inline)
    }), flags.json);
  } else if (command === "setup") {
    const result = await setupProject({
      root: flags.root || process.cwd(),
      dryRun: Boolean(flags["dry-run"]),
      out: flags.out, src: flags.src, inline: Boolean(flags.inline), force: Boolean(flags.force),
      persist: flags.persist, globalShortcuts: Boolean(flags["global-shortcuts"])
    });
    print(result, flags.json);
    if (!result.ok) process.exitCode = 1;
  } else if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
  } else {
    throw new Error(`Unknown command: ${command}. Use one of: install, uninstall, init, setup, snippet, check, doctor.`);
  }
} catch (error) {
  if (flags.json || args.includes("--json")) {
    console.log(JSON.stringify({ ok: false, error: error.message }));
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
}

async function init({ target, force }) {
  const templates = await getAgentTemplates();
  const files = initTargetFiles(target, templates);
  const written = [];
  const skipped = [];
  const stale = [];
  const backups = [];
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    try {
      const existing = await readFile(file.path, "utf8");
      if (existing === file.content) {
        skipped.push(file.path);
      } else if (file.staleGuard && !force) {
        stale.push(file.path);
        skipped.push(file.path);
      } else if (file.forceOverwrite === false) {
        skipped.push(file.path);
      } else {
        backups.push(await backupFile(file.path, join(process.cwd(), ".unship", "backups")));
        await writeFile(file.path, file.content, "utf8");
        written.push(file.path);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await writeFile(file.path, file.content, "utf8");
      written.push(file.path);
    }
  }
  return {
    ok: stale.length === 0,
    written,
    backups,
    skipped,
    stale,
    next: stale.length ? ["Run init --force --json with this CLI to refresh stale installed Unship instructions."] : []
  };
}

function parseFlags(items) {
  const booleans = ["json", "force", "all", "yes", "repair", "readiness", "no-update-check", "no-project", "print-skill", "project", "include-build", "dry-run", "global-shortcuts", "inline"];
  const strings = ["harness", "target", "framework", "src", "persist", "ports", "root", "dir", "out"];
  const options = Object.fromEntries([...booleans.map((key) => [key, { type: "boolean" }]), ...strings.map((key) => [key, { type: "string" }])]);
  const { values, positionals } = parseArgs({ args: items, options, allowPositionals: true });
  const installFlags = ["json", "all", "yes", "repair", "force", "harness", "root", "project", "no-project", "dry-run", "no-update-check"];
  const allowed = {
    install: [...installFlags, "print-skill"],
    uninstall: installFlags,
    init: ["json", "target", "force"],
    setup: ["json", "root", "out", "src", "inline", "force", "dry-run", "persist", "global-shortcuts", "framework"],
    snippet: ["json", "src", "inline", "persist", "global-shortcuts"],
    doctor: ["json", "root", "out", "inline", "ports", "no-update-check"],
    check: ["json", "root", "include-build", "readiness"]
  }[command];
  for (const key of Object.keys(values)) {
    if (allowed && !allowed.includes(key)) throw new Error(`--${key} does not apply to ${command}.`);
    if (strings.includes(key) && !values[key].trim()) throw new Error(`--${key} requires a nonempty value.`);
  }
  if (values.persist !== undefined && values.persist !== "local") throw new Error("--persist must be local.");
  if (values.inline && values.src) throw new Error("--src cannot be used with --inline.");
  return { ...values, _: positionals };
}

async function printSnippet(flags) {
  const snippet = await pickerSnippet({ ...flags, globalShortcuts: flags["global-shortcuts"] });
  console.log(flags.json ? JSON.stringify({ ok: true, snippet }) : snippet);
}

async function readPackageInfo() {
  return JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
}

async function doctor({ root, out, inline, previewPorts }) {
  const pkg = await readPackageInfo();
  const project = await inspectProject({ root, out, inline, previewPorts });
  const residue = await checkUnshipResidue({ root });
  const unship = summarizeUnship(residue);
  return {
    ok: true,
    packageName: pkg.name,
    version: pkg.version,
    updates: { checked: false, reason: "disabled" },
    node: process.version,
    project,
    residue,
    unship,
    next: nextActions({ project, unship }),
    reminder: "Unship is local comparison tooling. Have the agent remove unused variants and run unship check before shipping."
  };
}

function summarizeUnship(residue) {
  return {
    explorations: residue.explorations || [],
    activeExplorationCount: residue.explorations?.length || 0,
    cleanupRequired: !residue.ok,
    artifactCount: residue.diagnostics?.length || 0
  };
}

function nextActions({ project, unship }) {
  const actions = [];

  if (project.skillInstalled && !project.skillCurrent) {
    actions.push("Run init --force --json with this CLI to refresh stale installed Unship instructions.");
  }

  if (project.pickerCurrent === false) {
    actions.push(project.pickerMode === "inline"
      ? "Run setup --inline --json with this CLI and replace the stale inline mount."
      : "Run setup --json --out <existing-picker-file> with this CLI. Inspect differing contents before using --force; replacement saves a backup.");
  } else if (project.pickerCurrent === null) {
    actions.push("Picker freshness is unverified. Use setup --out <served-picker-file> or doctor --inline --out <HTML-file> with this CLI.");
  }
  if (!project.devMountFound) actions.push("Add one dev-only script mount in the app shell that serves the comparison.");

  if (unship.activeExplorationCount > 0) {
    const labels = summarizeLabels(unship.explorations.map((item) => item.pick));
    actions.push(`Existing Unship explorations detected: ${labels}. Settle overlapping work before creating another overlapping exploration.`);
  }
  return actions;
}

function summarizeLabels(labels, limit = 3) {
  if (labels.length <= limit) return labels.join(", ");
  return `${labels.slice(0, limit).join(", ")}, and ${labels.length - limit} more`;
}

function print(value, json) {
  if (json) {
    console.log(JSON.stringify(value));
  } else if (value.status && Array.isArray(value.findings)) {
    printReadiness(value);
  } else if (Array.isArray(value.diagnostics)) {
    printCheck(value);
  } else if (value.picker && value.mount) {
    printSetup(value);
  } else if (value.packageName) {
    printDoctor(value);
  } else {
    const lines = [];
    if (value.backups?.length) lines.push(`Backups: ${value.backups.join(", ")}`);
    if (value.written?.length) lines.push(`Wrote ${value.written.join(", ")}`);
    if (value.stale?.length) lines.push(`Stale existing ${value.stale.join(", ")}`);
    if (value.skipped?.length) lines.push(`Skipped existing ${value.skipped.join(", ")}`);
    if (value.next?.length) lines.push(...value.next.map((item) => `Next: ${item}`));
    console.log(lines.length ? lines.join("\n") : "Unship initialized.");
  }
}

function printDoctor(value) {
  const preview = value.project.previewServers.length ? value.project.previewServers.map((server) => server.url).join(", ") : "none detected";
  const lines = [
    `${value.packageName} ${value.version}`,
    `Node ${value.node}`,
    `Skill installed ${value.project.skillInstalled ? "yes" : "no"}${value.project.skillInstalled ? ` (${value.project.skillCurrent ? "current" : "stale"})` : ""}`,
    `Picker ${value.project.pickerMode}: ${value.project.pickerCurrent === null ? "unverified" : value.project.pickerCurrent ? "current" : "different"}${value.project.pickerFile ? ` (${value.project.pickerFile})` : ""}`,
    `Dev mount ${value.project.devMountFound ? value.project.devMountFile : "missing"}`,
    `Preview servers ${preview}`,
    value.reminder
  ].filter(Boolean);
  appendNext(lines, value.next);
  console.log(lines.join("\n"));
}

function parsePorts(value) {
  if (!value) return undefined;
  return String(value).split(",").map((item) => Number(item.trim())).filter(Boolean);
}

function installOptions(flags) {
  const harnesses = [
    ...(flags.harness ? String(flags.harness).split(",") : []),
    ...(flags._ || [])
  ];
  return {
    all: Boolean(flags.all),
    dryRun: Boolean(flags["dry-run"]),
    force: Boolean(flags.force),
    harnesses,
    json: Boolean(flags.json),
    noProject: Boolean(flags["no-project"]),
    printSkill: Boolean(flags["print-skill"]),
    project: Boolean(flags.project),
    repair: Boolean(flags.repair),
    root: flags.root || process.cwd(),
    yes: Boolean(flags.yes)
  };
}

function printInstallResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (!result.ok && !result.harnesses) {
    console.log(result.error || `Unship ${result.command === "uninstall" ? "uninstall" : "install"} failed.`);
    printNext(result.next);
    return;
  }
  const label = result.command === "uninstall" ? "uninstall" : "install";
  const lines = [result.dryRun ? `Unship ${label} dry run.` : `Unship ${label} ${result.ok ? "complete" : "incomplete"}.`];
  if (result.dryRun) {
    lines.push("No files were changed.");
  } else if (result.command !== "uninstall") {
    lines.push("Workflow: ask your agent for options, compare them in your local preview, pick a direction in chat, and have the agent clean up the unused variants.");
    lines.push("Before shipping: have the agent run check --json with this CLI.");
  }
  if (label === "install" && result.harnesses?.length) {
    const detectedNames = result.harnesses.filter((harness) => harness.detected).map((harness) => harness.name);
    if (result.harnesses.some((harness) => harness.fallback)) {
      lines.push(`No harness homes detected. Using ${new Intl.ListFormat("en").format(result.harnesses.map((harness) => harness.name))}.`);
    } else {
      const names = detectedNames.length ? detectedNames : result.harnesses.map((harness) => harness.name);
      lines.push(`${detectedNames.length ? "Detected" : "Selected"} ${new Intl.ListFormat("en").format(names)}.`);
    }
  }
  for (const harness of result.harnesses || []) {
    lines.push(`${harness.name}: ${harness.status}`);
    for (const file of harness.files || []) {
      lines.push(`- ${file.status}: ${friendlyPath(file.path, result.home)}`);
      if (file.backup) lines.push(`  Backup: ${friendlyPath(file.backup, result.home)}`);
    }
  }
  for (const item of result.legacy || []) {
    lines.push(`Legacy ${item.status}: ${friendlyPath(item.path, result.home)}`);
    if (item.backup) lines.push(`Backup: ${friendlyPath(item.backup, result.home)}`);
  }
  if (result.project) lines.push(`Project: ${result.project.status}`);
  appendNext(lines, result.next);
  console.log(lines.join("\n"));
}

function friendlyPath(path, home) {
  if (!home) return path;
  return path === home ? "~" : path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path;
}

function appendNext(lines, next) {
  if (!next?.length) return;
  lines.push("", "Next:");
  lines.push(...next.map((item) => `- ${item}`));
}

function printNext(next) {
  if (!next?.length) return;
  console.log(["", "Next:", ...next.map((item) => `- ${item}`)].join("\n"));
}

async function confirmPlan(question) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}

function printSetup(result) {
  const lines = [
    `Picker ${result.picker.status}: ${result.picker.path}`,
    `Mount ${result.mount.status}${result.mount.file ? `: ${result.mount.file}` : ""}`,
    ...(result.picker.backup ? [`Backup ${result.picker.backup}`] : []),
    ...(result.mount.snippet ? [result.mount.snippet] : [])
  ];
  if (result.next?.length) lines.push(...result.next.map((item) => `Next: ${item}`));
  console.log(lines.join("\n"));
}

function printReadiness(result) {
  const lines = [result.summary.message];
  for (const group of result.groups) {
    const labels = group.options.length ? `: ${group.options.join(", ")}` : "";
    const visibility = group.visibleCount === null ? " (structure uncertain — verify manually)" : ` (${group.visibleCount} visible)`;
    lines.push(`- ${group.pick} in ${group.file}${labels}${visibility}`);
  }
  for (const finding of result.findings) {
    lines.push(`${finding.level.toUpperCase()} ${finding.file}:${finding.line} [${finding.group}] ${finding.message}`);
  }
  console.log(lines.join("\n"));
}

function printCheck(result) {
  if (result.ok) {
    console.log([
      "Unship check passed.",
      result.summary?.message || "No Unship preview artifacts found.",
      "No data-unship markers, picker references, or Unship comments were detected."
    ].join("\n"));
    return;
  }

  const lines = [result.summary?.message || "Unship cleanup required."];
  if (result.explorations?.length) {
    lines.push("Explorations:");
    for (const item of result.explorations) {
      const labels = item.options?.length
        ? `: ${item.options.join(", ")}`
        : item.uncertainOptions?.length
          ? `: uncertain labels ${item.uncertainOptions.join(", ")}`
          : "";
      lines.push(`- ${item.pick} in ${item.file}${labels}`);
    }
    lines.push("");
  }
  lines.push(...result.diagnostics.map((item) => `${item.file}:${item.line}:${item.column} ${item.message} (${item.pattern})`));
  console.log(lines.join("\n"));
}

function printHelp() {
  console.log(`Unship
Iterate with your agent in the app, not in chat.

Usage:
  unship install [harness...] [--yes|--dry-run|--json]
  unship setup --out <served-file> [--src <script-url>] [--force] [--json]
  unship check [--readiness] [--json]
  unship doctor [--out <picker-file>] [--json]
  unship --version
  unship snippet [--inline|--json]
  unship init [--target portable|all|<agent>]
  unship uninstall [--yes|--dry-run|--json]
  unship install --print-skill

Workflow:
  1. Install the agent workflow once.
  2. Ask your agent for design or content options.
  3. Compare them in your local preview.
  4. Pick a direction in chat.
  5. Your agent cleans up unused variants before shipping.

Agent notes:
  setup prepares the selected runtime; --force replaces a differing file with a backup.
  setup --inline returns an embedded snippet. Framework mount placement stays with the agent.
  doctor stays offline unless explicit --ports are supplied; --no-update-check is a compatibility no-op.
  check verifies that no Unship preview artifacts remain.
  check --readiness verifies comparison structure and Canvas arrangements before handoff.`);
}
