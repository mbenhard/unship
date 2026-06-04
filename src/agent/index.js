import { readFile } from "node:fs/promises";

const ROOT = new URL("../../", import.meta.url);

export async function getAgentTemplates() {
  const skill = await readFile(new URL("agent/skills/unship/SKILL.md", ROOT), "utf8");
  const agents = await readFile(new URL("agent/AGENTS.md", ROOT), "utf8");
  return {
    skill,
    agents,
    claude: '@AGENTS.md\n\nUse `/unship` or the `unship` skill for temporary local UI variant comparison.\n',
    claudeCommand: "Use the Unship skill for this request. Interpret arguments as target, count, style, or scope: $ARGUMENTS\n",
    opencodeCommand: "---\ndescription: Create temporary local UI variants with Unship\n---\n\nUse the Unship skill for this request. Interpret arguments as the target, count, style, or scope: $ARGUMENTS\n"
  };
}
