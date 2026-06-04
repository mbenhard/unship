import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getAgentTemplates } from "../agent/index.js";
import { checkUnshipResidue } from "../check/index.js";
import { detectProject, setupProject } from "../setup/index.js";

const BUNDLED_PICKER = new URL("../picker/unship-picker.js", import.meta.url);
const PROJECT_PICKER_CANDIDATES = ["public/unship-picker.js", "static/unship-picker.js", "src/assets/unship-picker.js"];

const TARGETS = [
  {
    id: "agents",
    name: "Shared .agents skill",
    aliases: ["agents", "codex", "antigravity"],
    files: [{ role: "skill", relativePath: ".agents/skills/unship/SKILL.md", template: "skill", staleMarker: /^---\s*\nname:\s*unship\b/m }],
    legacy: [{ relativePath: ".agents/skills/unship-design/SKILL.md", marker: /patch-session|unship-design|Legacy Unship/i }]
  },
  {
    id: "claude",
    name: "Claude Code",
    aliases: ["claude"],
    detectPath: ".claude",
    files: [
      { role: "skill", relativePath: ".claude/skills/unship/SKILL.md", template: "skill", staleMarker: /^---\s*\nname:\s*unship\b/m },
      { role: "command", relativePath: ".claude/commands/unship.md", template: "claudeCommand", requiresRole: "skill", staleMarker: /Use the Unship skill for this request/i }
    ],
    legacy: [
      { relativePath: ".claude/commands/unship.md", marker: /unship next|project companion skill|unship repair/i, replacementRole: "command" },
      { relativePath: ".claude/commands/unship-batch.md", marker: /unship-batch|parallel task processing/i },
      { relativePath: ".claude/commands/unship-docs.md", marker: /unship-docs|project docs/i },
      { relativePath: ".claude/skills/unship-design/SKILL.md", marker: /patch-session|unship-design|Legacy Unship/i }
    ]
  },
  {
    id: "opencode",
    name: "OpenCode",
    aliases: ["opencode"],
    manual: true,
    files: [],
    legacy: []
  }
];

export async function planInstall(options = {}) {
  const context = await buildContext(options);
  if (context.printSkill) return { ok: true, command: "install", printSkill: true, skill: context.templates.skill };
  if (!context.dryRun && !context.yes && context.json) {
    return installConsentError("install");
  }
  if (!context.dryRun && !context.yes && !context.interactive) {
    return installConsentError("install");
  }
  return buildInstallPlan(context);
}

export async function applyInstallPlan(plan) {
  return applyPlan(plan, "install");
}

export async function planUninstall(options = {}) {
  const context = await buildContext(options);
  if (!context.dryRun && !context.yes && context.json) {
    return installConsentError("uninstall");
  }
  if (!context.dryRun && !context.yes && !context.interactive) {
    return installConsentError("uninstall");
  }
  return buildUninstallPlan(context);
}

export async function applyUninstallPlan(plan) {
  return applyPlan(plan, "uninstall");
}

async function buildContext(options) {
  const home = options.home || homedir();
  return {
    all: Boolean(options.all),
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
    harnesses: options.harnesses || [],
    home,
    interactive: options.interactive ?? Boolean(process.stdin.isTTY),
    json: Boolean(options.json),
    noProject: Boolean(options.noProject),
    printSkill: Boolean(options.printSkill),
    project: Boolean(options.project),
    repair: Boolean(options.repair),
    root: options.root || process.cwd(),
    templates: await getAgentTemplates(),
    yes: Boolean(options.yes)
  };
}

async function buildInstallPlan(context) {
  const harnesses = [];
  const legacy = [];
  for (const target of await selectedTargets(context)) {
    if (target.manual) {
      harnesses.push(manualHarness(target));
      continue;
    }
    const files = [];
    const roleResults = new Map();
    for (const file of target.files) {
      const planned = await planManagedFile({ context, file, target });
      if (file.requiresRole && !roleCanBackCommand(roleResults.get(file.requiresRole))) {
        planned.operation = "blocked";
        planned.status = "blocked-missing-skill";
      }
      files.push(planned);
      roleResults.set(file.role, planned);
      if (planned.state === "legacy" && planned.operation !== "skip") {
        legacy.push({
          path: planned.path,
          status: planned.operation.startsWith("would") ? "would-replace-with-shim" : "legacy-replaced-with-shim",
          reason: "legacy task-board command"
        });
      }
    }
    for (const item of await planLegacyFiles({ context, target, managedPaths: new Set(files.map((file) => file.path)) })) {
      legacy.push(item);
    }
    harnesses.push({
      id: target.id,
      name: target.name,
      availability: await targetAvailability(context.home, target),
      detected: await targetDetected(context.home, target),
      status: harnessStatus(files),
      files
    });
  }
  return {
    ok: true,
    command: "install",
    dryRun: context.dryRun,
    home: context.home,
    harnesses,
    legacy,
    project: await planInstallProject(context),
    next: nextActions({ harnesses, project: context.project })
  };
}

async function buildUninstallPlan(context) {
  const harnesses = [];
  const legacy = [];
  for (const target of await selectedTargets({ ...context, all: context.all || context.harnesses.length === 0 })) {
    if (target.manual) {
      harnesses.push(manualHarness(target));
      continue;
    }
    const files = [];
    for (const file of target.files) {
      const planned = await planRemovalFile({ context, file, target });
      files.push(planned);
    }
    for (const item of await planLegacyFiles({ context, target, managedPaths: new Set(files.map((file) => file.path)), uninstall: true })) {
      legacy.push(item);
    }
    harnesses.push({
      id: target.id,
      name: target.name,
      availability: await targetAvailability(context.home, target),
      detected: await targetDetected(context.home, target),
      status: harnessStatus(files),
      files
    });
  }
  return {
    ok: true,
    command: "uninstall",
    dryRun: context.dryRun,
    home: context.home,
    harnesses,
    legacy,
    project: await planUninstallProject(context),
    next: ["Restart your agent after uninstalling Unship harness files."]
  };
}

async function selectedTargets(context) {
  const requested = normalizeHarnesses(context.harnesses);
  if (requested.length) return TARGETS.filter((target) => requested.includes(target.id));
  if (context.all) return TARGETS.filter((target) => target.id === "agents" || target.id === "claude");
  const selected = [TARGETS.find((target) => target.id === "agents")];
  const claude = TARGETS.find((target) => target.id === "claude");
  if (await targetDetected(context.home, claude)) selected.push(claude);
  return selected.filter(Boolean);
}

function normalizeHarnesses(values) {
  const aliases = new Map(TARGETS.flatMap((target) => target.aliases.map((alias) => [alias, target.id])));
  const normalized = [];
  for (const value of values) {
    for (const item of String(value).split(",")) {
      const key = item.trim().toLowerCase();
      if (!key) continue;
      const id = aliases.get(key);
      if (!id) throw new Error(`Unknown install harness: ${item}`);
      if (!normalized.includes(id)) normalized.push(id);
    }
  }
  return normalized;
}

async function planManagedFile({ context, file, target }) {
  const path = join(context.home, file.relativePath);
  const text = await readOptional(path);
  const expected = context.templates[file.template];
  const legacy = target.legacy.find((item) => item.relativePath === file.relativePath);
  const state = classifyContent({ text, expected, legacyMarker: legacy?.marker, staleMarker: file.staleMarker });
  const explicit = context.all || context.harnesses.length > 0;
  const operation = operationForState(state, { context, explicit });
  return {
    role: file.role,
    path,
    relativePath: file.relativePath,
    state,
    operation,
    status: statusFor({ state, operation }),
    content: operationWrites(operation) ? expected : undefined
  };
}

async function planRemovalFile({ context, file, target }) {
  const path = join(context.home, file.relativePath);
  const text = await readOptional(path);
  const expected = context.templates[file.template];
  const legacy = target.legacy.find((item) => item.relativePath === file.relativePath);
  const state = classifyContent({ text, expected, legacyMarker: legacy?.marker, staleMarker: file.staleMarker });
  const removable = state === "current" || state === "stale-managed" || state === "legacy";
  const operation = removable ? (context.dryRun ? "would-remove" : "remove") : "skip";
  return {
    role: file.role,
    path,
    relativePath: file.relativePath,
    state,
    operation,
    status: removable ? (context.dryRun ? "would-remove" : "pending-remove") : statusFor({ state, operation })
  };
}

async function planLegacyFiles({ context, target, managedPaths, uninstall = false }) {
  const results = [];
  for (const legacy of target.legacy) {
    const path = join(context.home, legacy.relativePath);
    if (managedPaths.has(path)) continue;
    const text = await readOptional(path);
    if (text === null || !legacy.marker.test(text)) continue;
    const interactiveRepair = context.interactive && !context.yes && !context.json;
    const canRemove = uninstall || context.repair || context.force || interactiveRepair;
    results.push({
      path,
      status: canRemove ? (context.dryRun ? "would-remove" : "remove") : "legacy",
      operation: canRemove ? (context.dryRun ? "would-remove" : "remove") : "skip",
      reason: "known legacy Unship file"
    });
  }
  return results;
}

async function planInstallProject(context) {
  const include = context.project || (context.interactive && !context.yes && !context.noProject && !context.json);
  if (context.noProject || !include) return { included: false, status: "skipped" };
  const detected = await detectProject(context.root);
  if (detected.framework === "universal" && detected.signals.length === 0) {
    return {
      included: true,
      status: "deferred",
      detected,
      reason: "No app source, framework signal, or preview shell exists yet."
    };
  }
  if (context.dryRun) {
    const setup = await setupProject({ root: context.root, framework: "auto", dryRun: true });
    return { included: true, status: "planned", setup };
  }
  return { included: true, status: "pending", root: context.root, detected };
}

async function planUninstallProject(context) {
  if (!context.project) return { included: false, status: "skipped" };
  const residue = await checkUnshipResidue({ root: context.root });
  const activeVariants = residue.diagnostics.filter((item) =>
    !PROJECT_PICKER_CANDIDATES.includes(item.file)
    && (item.pattern === "data-unship-pick" || item.pattern === "data-unship-option")
  );
  if (activeVariants.length && !context.force) {
    return {
      included: true,
      status: "blocked-active-variants",
      reason: "Settle active Unship variants before removing project preview files, or rerun with --force.",
      diagnostics: activeVariants,
      files: []
    };
  }

  const files = [];
  for (const relativePath of PROJECT_PICKER_CANDIDATES) {
    const path = join(context.root, relativePath);
    if (await fileMatches(path, BUNDLED_PICKER)) {
      files.push({
        path,
        relativePath,
        state: "current",
        operation: context.dryRun ? "would-remove" : "remove",
        status: context.dryRun ? "would-remove" : "pending-remove"
      });
    } else if (await existsPath(path)) {
      files.push({
        path,
        relativePath,
        state: "user-modified",
        operation: "skip",
        status: "user-modified"
      });
    }
  }

  return {
    included: true,
    status: files.some((file) => file.operation !== "skip") ? (context.dryRun ? "planned" : "pending") : "current",
    files,
    cleanupRequired: residue.cleanupRequired
  };
}

async function applyPlan(plan, mode) {
  if (!plan.ok) return plan;
  for (const harness of plan.harnesses || []) {
    for (const file of harness.files || []) {
      try {
        if (operationWrites(file.operation)) {
          await mkdir(dirname(file.path), { recursive: true });
          await writeFile(file.path, file.content, "utf8");
          file.status = file.state === "legacy" && file.role === "command" ? "legacy-replaced-with-shim" : "written";
          file.operation = "wrote";
          delete file.content;
        } else if (file.operation === "remove") {
          await rm(file.path, { force: true, recursive: true });
          file.status = "removed";
          file.operation = "removed";
        }
      } catch (error) {
        file.status = "failed";
        file.error = error.message;
      }
    }
    harness.status = harnessStatus(harness.files || []);
  }
  for (const item of plan.legacy || []) {
    try {
      if (item.operation === "remove") {
        await rm(item.path, { force: true, recursive: true });
        item.status = "removed";
        item.operation = "removed";
      } else if (item.status === "legacy-replaced-with-shim") {
        item.operation = "replaced";
      }
    } catch (error) {
      item.status = "failed";
      item.error = error.message;
    }
  }
  if (mode === "install" && plan.project?.included && plan.project.status === "pending") {
    try {
      const setup = await setupProject({ root: plan.project.root || process.cwd(), framework: "auto", dryRun: false });
      plan.project = { included: true, status: setup.ok ? "complete" : "failed", setup };
    } catch (error) {
      plan.project.status = "failed";
      plan.project.error = error.message;
    }
  }
  if (mode === "uninstall" && plan.project?.included && plan.project.status === "pending") {
    for (const file of plan.project.files || []) {
      if (file.operation !== "remove") continue;
      try {
        await rm(file.path, { force: true, recursive: true });
        file.status = "removed";
        file.operation = "removed";
      } catch (error) {
        file.status = "failed";
        file.error = error.message;
      }
    }
    plan.project.status = (plan.project.files || []).some((file) => file.status === "failed")
      ? "failed"
      : (plan.project.files || []).some((file) => file.status === "removed")
        ? "complete"
        : "current";
  }
  plan.ok = !hasFailures(plan);
  return plan;
}

function classifyContent({ text, expected, legacyMarker, staleMarker }) {
  if (text === null) return "missing";
  if (text === expected) return "current";
  if (legacyMarker?.test(text)) return "legacy";
  if (staleMarker?.test(text)) return "stale-managed";
  return "user-modified";
}

function operationForState(state, { context, explicit }) {
  const interactiveRepair = context.interactive && !context.yes && !context.json;
  if (state === "missing") return context.dryRun ? "would-write" : "write";
  if (state === "current") return "skip";
  if (state === "stale-managed") return context.repair || context.force || interactiveRepair ? (context.dryRun ? "would-write" : "write") : "skip";
  if (state === "legacy") return context.repair || context.force || interactiveRepair ? (context.dryRun ? "would-replace" : "replace") : "skip";
  if (state === "user-modified") return context.force && explicit ? (context.dryRun ? "would-write" : "write") : "skip";
  return "skip";
}

function statusFor({ state, operation }) {
  if (operation === "skip") return state === "current" ? "current" : state;
  if (operation === "blocked") return "blocked-missing-skill";
  return operation;
}

function roleCanBackCommand(file) {
  if (!file) return false;
  return file.state === "current" || ["current", "would-write", "write", "written"].includes(file.status) || ["would-write", "would-replace", "write", "replace"].includes(file.operation);
}

function harnessStatus(files) {
  if (!files.length) return "manual";
  if (files.some((file) => file.status === "failed")) return "failed";
  if (files.some((file) => file.operation === "blocked" || file.status === "blocked-missing-skill")) return "blocked";
  if (files.some((file) => file.operation?.startsWith("would") || ["write", "replace", "remove"].includes(file.operation))) return "planned";
  if (files.some((file) => file.status === "written" || file.status === "legacy-replaced-with-shim" || file.operation === "wrote")) return "installed";
  if (files.every((file) => file.status === "current")) return "current";
  if (files.every((file) => file.status === "removed" || file.state === "missing")) return "uninstalled";
  return "partial";
}

function manualHarness(target) {
  return {
    id: target.id,
    name: target.name,
    availability: "manual",
    detected: false,
    status: "manual",
    files: [],
    next: ["Manual setup required; run install --print-skill and place SKILL.md where this harness loads skills."]
  };
}

function nextActions({ harnesses, project }) {
  const next = ["Restart the agent so it reloads Unship."];
  if (harnesses.some((item) => item.id === "agents")) {
    next.push("Try /unship where supported, or ask: use unship to compare 3 directions for the hero section.");
    next.push("If /unship is unavailable after restart, run npx @unship/cli@latest doctor --json and use the natural-language fallback.");
  }
  if (!project) next.push("Inside an app repo, run npx @unship/cli@latest install --project --yes to wire the picker.");
  return next;
}

function operationWrites(operation) {
  return operation === "write" || operation === "replace";
}

async function targetDetected(home, target) {
  if (!target.detectPath) return true;
  return exists(join(home, target.detectPath));
}

async function targetAvailability(home, target) {
  if (target.manual) return "manual";
  if (!target.detectPath) return await existsPath(home) ? "writable" : "unknown";
  return await exists(join(home, target.detectPath)) ? "detected-loaded" : await existsPath(home) ? "writable" : "unknown";
}

function hasFailures(plan) {
  return (plan.harnesses || []).some((harness) => harness.status === "failed")
    || (plan.legacy || []).some((item) => item.status === "failed")
    || plan.project?.status === "failed"
    || plan.project?.status === "blocked-active-variants";
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function existsPath(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fileMatches(path, referenceUrl) {
  try {
    const [actual, expected] = await Promise.all([
      readFile(path, "utf8"),
      readFile(referenceUrl, "utf8")
    ]);
    return actual === expected;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function installConsentError(command) {
  const verb = command === "uninstall" ? "remove files" : "write";
  return {
    ok: false,
    command,
    error: `Noninteractive ${command} requires --yes to ${verb} or --dry-run to inspect.`,
    dryRun: false,
    harnesses: [],
    legacy: [],
    project: { included: false, status: "skipped" },
    next: [`Run npx @unship/cli@latest ${command} --dry-run --json to inspect, or add --yes to ${command === "uninstall" ? "remove files" : "write"}.`]
  };
}
