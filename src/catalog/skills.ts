import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { InstallFile } from "../install/engine.js";

interface ManifestSkill { id: string; path: string; sourceId: string; }
interface CatalogManifest { catalogVersion: string; skills: ManifestSkill[]; }

export interface SkillSummary { id: string; source: "portable" | "external"; sourceId: string; }

export async function readCatalog(catalogRoot: string): Promise<CatalogManifest> {
  return JSON.parse(await readFile(join(catalogRoot, "manifest.json"), "utf8")) as CatalogManifest;
}

export function listSkills(manifest: CatalogManifest): SkillSummary[] {
  return [
    ...manifest.skills.map((skill) => ({ id: skill.id, source: "portable" as const, sourceId: skill.sourceId })),
    { id: "skills.sh", source: "external" as const, sourceId: "skills.sh (deferred platform resolver)" },
  ];
}

export async function renderSkillFiles(catalogRoot: string, manifest: CatalogManifest, ids: string[], platform: string): Promise<InstallFile[]> {
  const result: InstallFile[] = [];
  for (const id of ids) {
    const skill = manifest.skills.find((candidate) => candidate.id === id);
    if (!skill) {
      if (id === "skills.sh" || id.startsWith("skills.sh/")) throw new Error(`External skill '${id}' requires the platform resolver and is not downloaded by default.`);
      throw new Error(`Unknown skill '${id}'. Run 'agents-cli skills list --platform ${platform}'.`);
    }
    await collect(join(catalogRoot, skill.path), join(skillDestination(platform), id), result);
  }
  return result;
}

function skillDestination(platform: string): string {
  if (platform === "codex") return ".codex/skills";
  if (platform === "opencode") return ".opencode/skills";
  return ".claude/skills";
}

async function collect(source: string, destination: string, result: InstallFile[]): Promise<void> {
  for (const entry of await readdir(source)) {
    const sourcePath = join(source, entry);
    const targetPath = join(destination, entry);
    if ((await stat(sourcePath)).isDirectory()) await collect(sourcePath, targetPath, result);
    else result.push({ path: targetPath, content: await readFile(sourcePath, "utf8") });
  }
}
