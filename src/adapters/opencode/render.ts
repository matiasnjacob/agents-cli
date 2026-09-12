import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { InstallFile } from "../../install/engine.js";

export interface OpenCodeRenderOptions {
  catalogRoot: string;
  selectedSkills?: string[];
}

interface AgentSource {
  id: string;
  description: string;
  mode: string;
  permission: Record<string, unknown>;
  body: string;
}

export async function renderOpenCode(options: OpenCodeRenderOptions): Promise<InstallFile[]> {
  const agentRoot = join(options.catalogRoot, "agents");
  const paths = (await readdir(agentRoot)).filter((path) => path.endsWith(".md")).sort();
  const skills = options.selectedSkills ?? [];
  const agents = await Promise.all(paths.map(async (path) => parseAgent(path, await readFile(join(agentRoot, path), "utf8"))));
  const files = agents.map((agent) => ({
    path: `.opencode/agents/${agent.id}.md`,
    content: renderAgent(agent, skills),
  }));
  files.push({
    path: ".opencode/agents/manifest.json",
    content: `${JSON.stringify({ schemaVersion: 1, platform: "opencode", agents: agents.map(({ id }) => id), skills }, null, 2)}\n`,
  });
  return files;
}

async function parseAgent(path: string, source: string): Promise<AgentSource> {
  const sections = source.split("---");
  if (sections.length < 3) throw new Error(`Agent is missing front matter: ${path}`);
  const frontMatter = sections[1];
  const description = frontMatter.match(/description:\s*["']([^"']+)["']/)?.[1];
  const mode = frontMatter.match(/mode:\s*([^\s]+)/)?.[1];
  const permissionText = frontMatter.match(/permission:\s*(\{.*\})/s)?.[1];
  if (!description || !mode || !permissionText) throw new Error(`Agent front matter is incomplete: ${path}`);
  return {
    id: basename(path, ".md"),
    description,
    mode,
    permission: JSON.parse(permissionText) as Record<string, unknown>,
    body: sections.slice(2).join("---").trim(),
  };
}

function renderAgent(agent: AgentSource, skills: string[]): string {
  const skillReferences = skills.length
    ? `\n\n## Selected skill references\n\n${skills.map((skill) => `- .opencode/skills/${skill}/SKILL.md`).join("\n")}`
    : "\n\n## Selected skill references\n\nNo skills selected; the installer resolves external sources such as skills.sh separately.";
  const body = `${agent.body}${skillReferences}\n`;
  return [
    "---",
    `description: ${JSON.stringify(agent.description)}`,
    `mode: ${agent.mode}`,
    `permission: ${JSON.stringify(agent.permission)}`,
    "---",
    "",
    body,
  ].join("\n");
}
