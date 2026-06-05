const INIT_TARGETS = {
  codex: [
    skill(".agents/skills/unship/SKILL.md"),
    pointer("AGENTS.md", "agents")
  ],
  antigravity: [
    skill(".agents/skills/unship/SKILL.md"),
    pointer("AGENTS.md", "agents")
  ],
  claude: [
    skill(".claude/skills/unship/SKILL.md"),
    pointer("CLAUDE.md", "claude")
  ],
  opencode: [
    skill(".opencode/skills/unship/SKILL.md"),
    command(".opencode/commands/unship.md", "opencodeCommand")
  ]
};

INIT_TARGETS.all = [
  skill(".agents/skills/unship/SKILL.md"),
  skill(".claude/skills/unship/SKILL.md"),
  skill(".opencode/skills/unship/SKILL.md"),
  command(".opencode/commands/unship.md", "opencodeCommand"),
  pointer("AGENTS.md", "agents"),
  pointer("CLAUDE.md", "claude")
];

export function initTargetFiles(target, templates) {
  const files = INIT_TARGETS[target];
  if (!files) throw new Error(`Unknown init target: ${target}`);
  return files.map((file) => ({
    path: file.path,
    content: templates[file.template],
    staleGuard: file.staleGuard,
    forceOverwrite: file.forceOverwrite
  }));
}

function skill(path) {
  return { path, template: "skill", staleGuard: true, forceOverwrite: true };
}

function pointer(path, template) {
  return { path, template, forceOverwrite: false };
}

function command(path, template) {
  return { path, template, staleGuard: true, forceOverwrite: true };
}
