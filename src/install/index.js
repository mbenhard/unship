import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getAgentTemplates } from "../agent/index.js";
import { backupFile } from "../project-files/index.js";
import { projectSkillPaths } from "../agent-targets/index.js";
import { PICKER_CANDIDATES as PROJECT_PICKER_CANDIDATES } from "../setup/index.js";
import { checkUnshipResidue } from "../check/index.js";

const BUNDLED_PICKER = new URL("../picker/unship-picker.js", import.meta.url);

const TARGETS = [
  {
    id: "agents",
    name: "Shared .agents skill",
    aliases: ["agents", "codex", "antigravity"],
    detectPaths: [".codex", ".agents"],
    files: [{ role: "skill", relativePath: projectSkillPaths.codex, template: "skill", staleMarker: /^---\s*\nname:\s*unship\b/m }],
    legacy: [{ relativePath: ".agents/skills/unship-design/SKILL.md", marker: /patch-session|unship-design|Legacy Unship/i }]
  },
  {
    id: "claude",
    name: "Claude Code",
    aliases: ["claude"],
    detectPath: ".claude",
    files: [
      { role: "skill", relativePath: projectSkillPaths.claude, template: "skill", staleMarker: /^---\s*\nname:\s*unship\b/m },
      { role: "command", relativePath: ".claude/commands/unship.md", template: "claudeCommand", requiresRole: "skill", staleMarker: /Use the Unship skill for this request/i }
    ],
    legacy: [
      { relativePath: ".claude/commands/unship.md", marker: /unship next|project companion skill|unship repair/i },
      { relativePath: ".claude/commands/unship-batch.md", marker: /unship-batch|parallel task processing/i },
      { relativePath: ".claude/commands/unship-docs.md", marker: /unship-docs|project docs/i },
      { relativePath: ".claude/skills/unship-design/SKILL.md", marker: /patch-session|unship-design|Legacy Unship/i }
    ]
  },
  {
    id: "cursor",
    name: "Cursor",
    aliases: ["cursor"],
    detectPath: ".cursor",
    files: [
      { role: "command", relativePath: ".cursor/commands/unship.md", template: "cursorCommand", staleMarker: /Use the Unship skill for this request/i }
    ],
    legacy: []
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    aliases: ["gemini", "gemini-cli"],
    detectPath: ".gemini",
    files: [
      { role: "skill", relativePath: projectSkillPaths.gemini, template: "skill", staleMarker: /^---\s*\nname:\s*unship\b/m },
      { role: "command", relativePath: ".gemini/commands/unship.toml", template: "geminiCommand", requiresRole: "skill", staleMarker: /Compare temporary local alternatives with Unship/i }
    ],
    legacy: [],
    next: ["Run /commands reload in Gemini CLI if it is already open."]
  },
  {
    id: "windsurf",
    name: "Windsurf",
    aliases: ["windsurf", "cascade"],
    detectPath: ".codeium/windsurf",
    files: [
      { role: "skill", relativePath: ".codeium/windsurf/skills/unship/SKILL.md", template: "skill", staleMarker: /^---\s*\nname:\s*unship\b/m },
      { role: "workflow", relativePath: ".codeium/windsurf/global_workflows/unship.md", template: "windsurfWorkflow", requiresRole: "skill", staleMarker: /Use the Unship skill for this request/i }
    ],
    legacy: []
  },
  {
    id: "cline",
    name: "Cline",
    aliases: ["cline"],
    detectPaths: [".cline", "Documents/Cline"],
    files: [
      { role: "skill", relativePath: projectSkillPaths.cline, template: "skill", staleMarker: /^---\s*\nname:\s*unship\b/m },
      { role: "workflow", relativePath: "Documents/Cline/Workflows/unship.md", template: "clineWorkflow", requiresRole: "skill", staleMarker: /Use the Unship skill for this request/i }
    ],
    legacy: []
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    aliases: ["copilot", "github-copilot", "github"],
    manual: true,
    files: [],
    legacy: [],
    next: ["GitHub Copilot loads Unship from repo-local instructions; run init --target copilot with this CLI."]
  },
  {
    id: "opencode",
    name: "OpenCode",
    aliases: ["opencode"],
    manual: true,
    files: [],
    legacy: [],
    next: ["OpenCode loads Unship from repo-local instructions; run init --target opencode with this CLI."]
  },
  {
    id: "roo",
    name: "Roo",
    aliases: ["roo", "roo-code"],
    explicitOnly: true,
    detectPath: ".roo",
    files: [
      { role: "skill", relativePath: projectSkillPaths.roo, template: "skill", staleMarker: /^---\s*\nname:\s*unship\b/m },
      { role: "command", relativePath: ".roo/commands/unship.md", template: "rooCommand", requiresRole: "skill", staleMarker: /Compare temporary local alternatives with Unship/i }
    ],
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
  const targets = await selectedTargets(context);
  for (const target of targets) {
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
      fallback: target.id === "agents" && targets.length === 1 && context.harnesses.length === 0 && !context.all && !await targetDetected(context.home, target),
      status: harnessStatus(files),
      files,
      ...(target.next?.length ? { next: target.next } : {})
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
    next: nextActions({ harnesses })
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
  if (requested.length) return requested.map((id) => TARGETS.find((target) => target.id === id)).filter(Boolean);
  if (context.all) return TARGETS.filter((target) => !target.manual && !target.explicitOnly);

  const detected = [];
  for (const target of TARGETS) {
    if (target.manual || target.explicitOnly) continue;
    if (await targetDetected(context.home, target)) detected.push(target);
  }

  if (context.repair) {
    const selected = new Set(detected.map((target) => target.id));
    for (const target of TARGETS) {
      if (target.manual || target.explicitOnly || selected.has(target.id)) continue;
      if (await targetHasExistingFiles(context.home, target)) {
        detected.push(target);
        selected.add(target.id);
      }
    }
  }

  return detected.length ? detected : TARGETS.filter((target) => target.id === "agents");
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
  return {
    included: true,
    status: "manual",
    root: context.root,
    reason: "Project picker setup is explicit; run setup --json --out <served-picker-file> with this CLI in the app repo and add a dev-only mount."
  };
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
    } else if (await exists(path)) {
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
          if (file.state !== "missing") file.backup = await backupFile(file.path, join(plan.home, ".local", "share", "unship", "backups"));
          await writeFile(file.path, file.content, "utf8");
          file.status = file.state === "legacy" && file.role === "command" ? "legacy-replaced-with-shim" : "written";
          file.operation = "wrote";
          delete file.content;
        } else if (file.operation === "remove") {
          if (file.state !== "current") file.backup = await backupFile(file.path, join(plan.home, ".local", "share", "unship", "backups"));
          await rm(file.path, { force: true });
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
        item.backup = await backupFile(item.path, join(plan.home, ".local", "share", "unship", "backups"));
        await rm(item.path, { force: true });
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
    next: target.next || ["Manual setup required; run install --print-skill and place SKILL.md where this harness loads skills."]
  };
}

function nextActions({ harnesses }) {
  const next = [];
  if (harnesses.some((item) => item.files?.length)) {
    next.push("Restart the agent so it reloads Unship.");
  }
  const hasCommandHarness = harnesses.some((item) => item.files?.some((file) => file.role === "command" || file.role === "workflow"));
  if (hasCommandHarness || harnesses.some((item) => item.id === "agents")) {
    next.push("Try /unship where available, or ask: use unship to compare 3 directions for the hero section.");
    next.push("If /unship is unavailable after restart, run doctor --json with this CLI and use the natural-language fallback.");
  }
  for (const harness of harnesses) {
    if (harness.next?.length) next.push(...harness.next);
  }
  next.push("Inside an app repo, run setup --json --out <served-picker-file> with this CLI to prepare the runtime, then mount it dev-only.");
  next.push("Optional repo helpers can be added later with unship init.");
  return next;
}

function operationWrites(operation) {
  return operation === "write" || operation === "replace";
}

async function targetDetected(home, target) {
  const paths = target.detectPaths || (target.detectPath ? [target.detectPath] : []);
  if (!paths.length) return false;
  for (const path of paths) {
    if (await exists(join(home, path))) return true;
  }
  return false;
}

async function targetHasExistingFiles(home, target) {
  const files = [
    ...(target.files || []).map((file) => file.relativePath),
    ...(target.legacy || []).map((file) => file.relativePath)
  ];
  for (const file of files) {
    if (await exists(join(home, file))) return true;
  }
  return false;
}

async function targetAvailability(home, target) {
  if (target.manual) return "manual";
  const paths = target.detectPaths || (target.detectPath ? [target.detectPath] : []);
  if (!paths.length) return await exists(home) ? "writable" : "unknown";
  for (const path of paths) {
    if (await exists(join(home, path))) return "detected";
  }
  return await exists(home) ? "writable" : "unknown";
}

function hasFailures(plan) {
  return (plan.harnesses || []).some((harness) => harness.status === "failed" || harness.status === "blocked")
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
    next: [`Run ${command} --dry-run --json with this CLI to inspect, or add --yes to ${command === "uninstall" ? "remove files" : "write"}.`]
  };
}
