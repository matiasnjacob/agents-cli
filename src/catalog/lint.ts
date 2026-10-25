import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { isPermissionValue } from "../adapters/permissions.js";

export interface LintFinding { rule: string; subject: string; message: string }

interface Manifest {
  agents: { id: string; path: string; requiredSkills?: string[] }[];
  skills: { id: string; path: string; sourceSha256?: string }[];
}

const deniableTools: Record<string, RegExp> = {
  bash: /\b(?:use|run|invoke|execute)\b[^.\n]*\b(?:bash|shell)\b/i,
  webfetch: /\b(?:use|run|invoke)\b[^.\n]*\bwebfetch\b/i,
  edit: /\b(?:you may|use|run)\b[^.\n]*\b(?:edit|write) (?:product )?(?:files|code)\b/i,
};

async function hashDirectory(dir: string): Promise<string> {
  const hash = createHash("sha256");
  const walk = async (path: string): Promise<void> => {
    for (const entry of (await readdir(path)).sort()) {
      const child = join(path, entry);
      if ((await stat(child)).isDirectory()) await walk(child);
      else hash.update(await readFile(child));
    }
  };
  await walk(dir);
  return hash.digest("hex");
}

function frontMatter(source: string): { front: string; body: string } | undefined {
  const sections = source.split("---");
  if (sections.length < 3 || sections[0].trim() !== "") return undefined;
  return { front: sections[1], body: sections.slice(2).join("---") };
}

/** Static quality gates for a catalog: files, manifest, front matter, permissions and skill references. */
export async function lintCatalog(catalogRoot: string): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  const add = (rule: string, subject: string, message: string) => findings.push({ rule, subject, message });
  const manifest = JSON.parse(await readFile(join(catalogRoot, "manifest.json"), "utf8")) as Manifest;
  const skillIds = new Set(manifest.skills.map((skill) => skill.id));
  const agentIds = new Set(manifest.agents.map((agent) => agent.id));

  const agentFiles = (await readdir(join(catalogRoot, "agents"))).filter((file) => file.endsWith(".md")).map((file) => file.slice(0, -3));
  for (const id of agentFiles) if (!agentIds.has(id)) add("agent-manifest-sync", id, "agent file is not listed in manifest.json");
  for (const agent of manifest.agents) if (!agentFiles.includes(agent.id)) add("agent-manifest-sync", agent.id, "manifest lists an agent with no file");

  const skillDirs: string[] = [];
  for (const entry of await readdir(join(catalogRoot, "skills"))) if ((await stat(join(catalogRoot, "skills", entry))).isDirectory()) skillDirs.push(entry);
  for (const id of skillDirs) if (!skillIds.has(id)) add("skill-manifest-sync", id, "skill directory is not listed in manifest.json");

  for (const skill of manifest.skills) {
    const dir = join(catalogRoot, skill.path);
    let source: string;
    try { source = await readFile(join(dir, "SKILL.md"), "utf8"); } catch { add("skill-manifest-sync", skill.id, `missing ${skill.path}/SKILL.md`); continue; }
    const parsed = frontMatter(source);
    const name = parsed?.front.match(/^name:\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
    const description = parsed?.front.match(/^description:\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
    if (!parsed) add("skill-front-matter", skill.id, "SKILL.md has no front matter");
    else {
      if (name !== skill.id) add("skill-front-matter", skill.id, `front matter name '${name ?? ""}' must equal the skill id`);
      if (!description || description.length < 20) add("skill-front-matter", skill.id, "description is missing or too short to trigger the skill");
    }
    if (skill.sourceSha256 && (await hashDirectory(dir)) !== skill.sourceSha256) add("skill-hash", skill.id, "contents differ from manifest sourceSha256; update the hash after editing a skill");
  }

  for (const agent of manifest.agents) {
    let source: string;
    try { source = await readFile(join(catalogRoot, agent.path), "utf8"); } catch { add("agent-manifest-sync", agent.id, `missing ${agent.path}`); continue; }
    const parsed = frontMatter(source);
    if (!parsed) { add("agent-front-matter", agent.id, "agent has no front matter"); continue; }
    const description = parsed.front.match(/description:\s*["']([^"']+)["']/)?.[1];
    const permissionText = parsed.front.match(/permission:\s*(\{.*\})/s)?.[1];
    if (!description) add("agent-front-matter", agent.id, "description is missing");
    let permission: Record<string, unknown> = {};
    try { permission = JSON.parse(permissionText ?? ""); } catch { add("agent-front-matter", agent.id, "permission is missing or not valid JSON"); }
    for (const [name, value] of Object.entries(permission)) {
      if (name === "task" && value && typeof value === "object") {
        for (const target of Object.keys(value)) if (!target.includes("*") && !agentIds.has(target)) add("agent-references", agent.id, `task permission targets unknown agent '${target}'`);
      } else if (!isPermissionValue(value)) add("permission-shape", agent.id, `permission '${name}' must be allow, ask, deny or a pattern map`);
    }
    for (const id of agent.requiredSkills ?? []) {
      if (!skillIds.has(id)) add("required-skills-exist", agent.id, `required skill '${id}' is not in the catalog`);
      else if (!parsed.body.includes(`\`${id}\``)) add("required-skills-loaded", agent.id, `body never tells the agent to load required skill \`${id}\``);
    }
    for (const [tool, pattern] of Object.entries(deniableTools)) {
      if (permission[tool] === "deny" && pattern.test(parsed.body)) add("tool-promise", agent.id, `body tells the agent to use ${tool}, which its permissions deny`);
    }
  }
  return findings;
}

export function formatLint(findings: LintFinding[]): string {
  if (!findings.length) return "Catalog lint passed: no findings.";
  return [`Catalog lint found ${findings.length} problem(s):`, ...findings.map((f) => `  ✗ [${f.rule}] ${f.subject}: ${f.message}`)].join("\n");
}
