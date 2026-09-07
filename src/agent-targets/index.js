const INIT_TARGETS = {
  codex: [managed(".agents/skills/unship/SKILL.md"), pointer("AGENTS.md", "agents")],
  claude: [managed(".claude/skills/unship/SKILL.md"), pointer("CLAUDE.md", "claude")],
  opencode: [managed(".opencode/skills/unship/SKILL.md"), managed(".opencode/commands/unship.md", "opencodeCommand")],
  cursor: [
    managed(".agents/skills/unship/SKILL.md"),
    managed(".cursor/commands/unship.md", "cursorCommand"),
    managed(".cursor/rules/unship.mdc", "cursorRule")
  ],
  copilot: [managed(".agents/skills/unship/SKILL.md"), managed(".github/instructions/unship.instructions.md", "copilotInstruction")],
  gemini: [managed(".gemini/skills/unship/SKILL.md"), managed(".gemini/commands/unship.toml", "geminiCommand")],
  windsurf: [managed(".windsurf/skills/unship/SKILL.md"), managed(".windsurf/workflows/unship.md", "windsurfWorkflow")],
  cline: [managed(".cline/skills/unship/SKILL.md"), managed(".clinerules/workflows/unship.md", "clineWorkflow")],
  roo: [managed(".roo/skills/unship/SKILL.md"), managed(".roo/commands/unship.md", "rooCommand")]
};
INIT_TARGETS.antigravity = INIT_TARGETS.codex;

export const projectSkillPaths = Object.fromEntries(Object.entries(INIT_TARGETS).map(([name, files]) => [name, files.find((file) => file.template === "skill").path]));

export const projectInstructionPaths = new Set(Object.values(INIT_TARGETS).flatMap((files) => files.map((file) => file.path)));

export function initTargetFiles(target, templates) {
  const names = target === "portable" ? ["codex", "claude", "opencode"]
    : target === "all" ? Object.keys(INIT_TARGETS).filter((name) => name !== "roo") : [target];
  const files = new Map();
  for (const name of names) {
    if (!INIT_TARGETS[name]) throw new Error(`Unknown init target: ${target}`);
    for (const file of INIT_TARGETS[name]) files.set(file.path, file);
  }
  return Array.from(files.values(), ({ template, ...file }) => ({ ...file, content: templates[template] }));
}

function managed(path, template = "skill") {
  return { path, template, staleGuard: true, forceOverwrite: true };
}

function pointer(path, template) {
  return { path, template, forceOverwrite: false };
}
