import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { InstallFile } from "../../install/engine.js";
import { piSubagentExtension } from "./subagent-extension.js";

export interface PiRenderOptions {
  catalogRoot: string;
  selectedSkills?: string[];
}

interface AgentSource {
  id: string;
  description: string;
  permission: Record<string, unknown>;
  body: string;
}

export async function renderPi(options: PiRenderOptions): Promise<InstallFile[]> {
  const agentRoot = join(options.catalogRoot, "agents");
  const paths = (await readdir(agentRoot)).filter((path) => path.endsWith(".md")).sort();
  const skills = options.selectedSkills ?? [];
  const agents = await Promise.all(paths.map(async (path) => parseAgent(path, await readFile(join(agentRoot, path), "utf8"))));
  const files: InstallFile[] = agents.map((agent) => ({
    path: `.pi/agents/${agent.id}.md`,
    content: renderAgent(agent, skills),
  }));
  files.push({ path: ".pi/extensions/agents-cli-subagent.ts", content: piSubagentExtension });
  files.push({ path: ".pi/APPEND_SYSTEM.md", content: renderInstructions(agents, skills) });
  files.push({
    path: ".pi/agents/manifest.json",
    content: `${JSON.stringify({ schemaVersion: 1, platform: "pi", agents: agents.map(({ id }) => id), skills }, null, 2)}\n`,
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
  const tools = piTools(agent.permission);
  const notes = [
    "## Pi adapter contract",
    "",
    "This role runs in an isolated Pi subprocess through the generated `subagent` extension. The subprocess inherits the parent model and thinking level; no model is pinned by agents-cli.",
    "Pi's tool allowlist is authoritative. Source `ask` and path-specific permission policies are preserved as instructions, not claimed as runtime enforcement.",
    skills.length
      ? `Selected skills are project-local and discoverable under .pi/skills/:\n${skills.map((skill) => `- .pi/skills/${skill}/SKILL.md`).join("\n")}`
      : "No optional skills were selected.",
  ].join("\n");
  return [
    "---",
    `name: ${agent.id}`,
    `description: ${JSON.stringify(agent.description)}`,
    ...(tools.length ? [`tools: ${tools.join(", ")}`] : []),
    "---",
    "",
    agent.body.replace("Skills live in `~/.agents/skills`;", "For this Pi project, selected skills live in `.pi/skills`;"),
    "",
    notes,
    "",
  ].join("\n");
}

function piTools(permission: Record<string, unknown>): string[] {
  const tools = ["read", "grep", "find", "ls"];
  if (permission.bash !== "deny") tools.push("bash");
  if (permission.edit === "allow") tools.push("edit", "write");
  return tools;
}

function renderInstructions(agents: AgentSource[], skills: string[]): string {
  const roles = agents.map((agent) => `- \`${agent.id}\`: ${agent.description}`).join("\n");
  return `# agents-cli for Pi\n\nThis trusted project provides specialized roles through the \`subagent\` tool. Delegate a complete task with an agent name; use the main session when isolated delegation is unnecessary. Project-local agent definitions can execute tools, so review them before granting project trust.\n\n## Available roles\n\n${roles}\n\n## Skills\n\n${skills.length ? `Selected skills are available under \`.pi/skills/\`: ${skills.join(", ")}. Load only those relevant to the task.` : "No optional skills were selected."}\n\nGenerated resources are managed by agents-cli. Do not add credentials, private paths, or model selections to them. Pi project trust, active tools, provider authentication, and runtime settings remain authoritative.\n`;
}
