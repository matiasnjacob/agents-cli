#!/usr/bin/env node

import { parseCommandArgs, usage } from "./parse.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderCodex } from "../adapters/codex/render.js";
import { renderOpenCode } from "../adapters/opencode/render.js";
import { renderClaude } from "../adapters/claude/render.js";
import { applyInstall } from "../install/engine.js";
import { listSkills, readCatalog, renderSkillFiles } from "../catalog/skills.js";

const result = parseCommandArgs(process.argv.slice(2));

if (result.kind === "help") {
  console.log(usage());
  process.exit(0);
}

if (result.kind === "error") {
  console.error(`Error: ${result.message}`);
  console.error(usage());
  process.exit(2);
}

try {
  const catalogRoot = process.env.AGENTS_CLI_CATALOG_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "../../catalog");
  if (result.kind === "validate") console.log(JSON.stringify(result.config, null, 2));
  else if (result.kind === "skills-list") console.log(JSON.stringify(listSkills(await readCatalog(catalogRoot)), null, 2));
  else if (result.kind === "skills-add") await install(result.platform, "none", [result.skill], result.dryRun, catalogRoot, false);
  else if (result.kind === "init") await install(result.config.platform, result.config.tracker, result.config.skills, result.config.dryRun, catalogRoot, true);
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

async function install(platform: "codex" | "opencode" | "claude", tracker: string, skills: string[], dryRun: boolean, catalogRoot: string, includeAgents: boolean): Promise<void> {
  const manifest = await readCatalog(catalogRoot);
  const skillFiles = await renderSkillFiles(catalogRoot, manifest, skills, platform);
  const adapterFiles = includeAgents
    ? platform === "codex" ? await renderCodex({ catalogRoot, selectedSkills: skills })
      : platform === "opencode" ? await renderOpenCode({ catalogRoot, selectedSkills: skills })
        : await renderClaude({ catalogRoot, selectedSkills: skills })
    : [];
  const plan = await applyInstall({ root: process.cwd(), catalogVersion: manifest.catalogVersion, files: [...adapterFiles, ...skillFiles], dryRun });
  console.log(JSON.stringify({ platform, tracker, dryRun, creates: plan.creates.map(({ path }) => path), updates: plan.updates.map(({ path }) => path), unchanged: plan.unchanged, conflicts: plan.conflicts }, null, 2));
  if (plan.conflicts.length) process.exitCode = 1;
}
