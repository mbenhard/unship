import { readFile } from "node:fs/promises";

const ROOT = new URL("../../", import.meta.url);

export async function getAgentTemplates() {
  const skill = await readFile(new URL("agent/skills/unship/SKILL.md", ROOT), "utf8");
  const agents = await readFile(new URL("agent/AGENTS.md", ROOT), "utf8");
  const workflow = "# Unship\n\nUse the Unship skill for this request. Interpret the user's arguments as the target, count, style, scope, or local surface to compare.\n";
  return {
    skill,
    agents,
    claude: '@AGENTS.md\n\nUse `/unship` or the `unship` skill for temporary local comparison of UI, copy, states, flows, design systems, docs, or DX surfaces.\n',
    claudeCommand: "Use the Unship skill for this request. Interpret arguments as the target, count, style, scope, or local surface to compare: $ARGUMENTS\n",
    opencodeCommand: "---\ndescription: Compare temporary local alternatives with Unship\n---\n\nUse the Unship skill for this request. Interpret arguments as the target, count, style, scope, or local surface to compare: $ARGUMENTS\n",
    cursorCommand: "Use the Unship skill for this request. If this project has `.agents/skills/unship/SKILL.md`, follow it. Otherwise use the verified installed @unship/cli executable to run `install --print-skill` and follow the printed workflow. Fetch from npm only if no installed Unship CLI is available. Interpret arguments as the target, count, style, scope, or local surface to compare: $ARGUMENTS\n",
    cursorRule: "---\ndescription: Use Unship for temporary local alternatives.\nalwaysApply: false\n---\n\nWhen the user asks to use Unship, compare local variants, preview picker choices, settle a selected option, or clean temporary Unship artifacts, follow `.agents/skills/unship/SKILL.md`.\n",
    copilotInstruction: "---\napplyTo: \"**\"\nexcludeAgent: \"code-review\"\n---\n\nWhen a coding-agent task asks to use Unship, follow `.agents/skills/unship/SKILL.md` for temporary local comparisons and cleanup.\n",
    geminiCommand: "description = \"Compare temporary local alternatives with Unship\"\nprompt = \"\"\"\nUse the unship skill for this request. Interpret the user's arguments as the target, count, style, scope, or local surface to compare:\n\n{{args}}\n\"\"\"\n",
    windsurfWorkflow: workflow,
    clineWorkflow: workflow,
    rooCommand: "---\ndescription: Compare temporary local alternatives with Unship\nargument-hint: <target count scope>\n---\n\nUse the Unship skill for this request. Interpret the user's arguments as the target, count, style, scope, or local surface to compare.\n"
  };
}
