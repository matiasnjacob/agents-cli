import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { InstallFile } from "../../install/engine.js";

export interface ClaudeRenderOptions {
  catalogRoot: string;
  selectedSkills?: string[];
}

interface AgentSource {
  id: string;
  description: string;
  permission: Record<string, unknown>;
  body: string;
}

const toolNames: Record<string, string> = {
  read: "Read",
  glob: "Glob",
  grep: "Grep",
  list: "Glob",
  bash: "Bash",
  webfetch: "WebFetch",
  edit: "Edit",
  question: "AskUserQuestion",
  task: "Task",
};

export async function renderClaude(options: ClaudeRenderOptions): Promise<InstallFile[]> {
  const agentRoot = join(options.catalogRoot, "agents");
  const paths = (await readdir(agentRoot)).filter((path) => path.endsWith(".md")).sort();
  const skills = options.selectedSkills ?? [];
  const agents = await Promise.all(paths.map(async (path) => parseAgent(path, await readFile(join(agentRoot, path), "utf8"))));
  const files = agents.map((agent) => ({
    path: `.claude/agents/${agent.id}.md`,
    content: renderAgent(agent, skills),
  }));
  files.push({
    path: "CLAUDE.md",
    content: renderInstructions(agents.length, skills),
  });
  files.push({
    path: ".claude/agents/manifest.json",
    content: `${JSON.stringify({ schemaVersion: 1, platform: "claude", agents: agents.map(({ id }) => id), skills }, null, 2)}\n`,
  });
  return files;
}

async function parseAgent(path: string, source: string): Promise<AgentSource> {
  const sections = source.split("---");
  if (sections.length < 3) throw new Error(`Agent is missing front matter: ${path}`);
  const frontMatter = sections[1];
  const description = frontMatter.match(/description:\s*["']([^"']+)["']/)?.[1];
  const permissionText = frontMatter.match(/permission:\s*(\{.*\})/s)?.[1];
  if (!description || !permissionText) throw new Error(`Agent front matter is incomplete: ${path}`);
  return {
    id: basename(path, ".md"),
    description,
    permission: JSON.parse(permissionText) as Record<string, unknown>,
    body: sections.slice(2).join("---").trim(),
  };
}

function renderAgent(agent: AgentSource, skills: string[]): string {
  const tools = Object.entries(agent.permission)
    .filter(([name, value]) => name in toolNames && value !== "deny")
    .map(([name]) => toolNames[name])
    .filter((tool, index, all) => all.indexOf(tool) === index)
    .join(", ");
  const editDenied = agent.permission.edit === "deny" || typeof agent.permission.edit === "object";
  const taskDenied = agent.permission.task === "deny";
  const notes = [
    "## Claude Code adapter notes",
    "",
    "Claude Code permission prompts and runtime settings are authoritative. Source runtime policies are preserved as intent, but path-specific rules and provider-specific enforcement are not inferred here.",
    skills.length
      ? `\nSelected skill references (installed by the platform installer):\n${skills.map((skill) => `- .claude/skills/${skill}/SKILL.md`).join("\n")}`
      : "\nNo skills selected; external sources such as skills.sh are resolved separately by the installer.",
  ].join("\n");
  const lines = [
    "---",
    `name: ${agent.id}`,
    `description: ${JSON.stringify(agent.description)}`,
    ...(tools ? [`tools: ${tools}`] : []),
    `permissionMode: ${editDenied ? "plan" : "default"}`,
    "---",
    "",
    `${agent.body}\n\n${notes}`,
  ];
  if (taskDenied) lines.push("\nTask delegation is not enabled for this role in the source policy.");
  return `${lines.join("\n")}\n`;
}

function renderInstructions(agentCount: number, skills: string[]): string {
  return `# Claude Code project instructions\n\nThis project was initialized with agents-cli. ${agentCount} named roles are available under ".claude/agents/".\n\nSelected skills are installed under ".claude/skills/" by the platform installer${skills.length ? `: ${skills.join(", ")}` : "; none selected"}.\n\nGenerated role files preserve responsibilities and document source permission intent. Claude Code runtime permissions remain authoritative; textual instructions are not treated as technical enforcement.\n`;
}
