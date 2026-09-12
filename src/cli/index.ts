#!/usr/bin/env node

import { parseCommandArgs, usage } from "./parse.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderCodex } from "../adapters/codex/render.js";
import { renderOpenCode } from "../adapters/opencode/render.js";
import { renderClaude } from "../adapters/claude/render.js";
import { applyInstall } from "../install/engine.js";
import { listSkills, readCatalog, renderSkillFiles } from "../catalog/skills.js";
import { runDoctor } from "../doctor.js";
import { readFile } from "node:fs/promises";

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
  else if (result.kind === "doctor") {
    const report = await runDoctor({ root: process.cwd(), catalogRoot });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } else if (result.kind === "update") await update(catalogRoot);
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

async function update(catalogRoot: string): Promise<void> {
  const root = process.cwd();
  const installed = await detectPlatform(root);
  if (!installed) throw new Error("No platform manifest found; run init before update --dry-run.");
  const manifest = await readCatalog(catalogRoot);
  const skillFiles = await renderSkillFiles(catalogRoot, manifest, installed.skills, installed.platform);
  const adapterFiles = installed.platform === "codex" ? await renderCodex({ catalogRoot, selectedSkills: installed.skills })
    : installed.platform === "opencode" ? await renderOpenCode({ catalogRoot, selectedSkills: installed.skills })
      : await renderClaude({ catalogRoot, selectedSkills: installed.skills });
  const plan = await applyInstall({ root, catalogVersion: manifest.catalogVersion, files: [...adapterFiles, ...skillFiles], dryRun: true });
  console.log(JSON.stringify({ platform: installed.platform, dryRun: true, creates: plan.creates.map(({ path }) => path), updates: plan.updates.map(({ path }) => path), unchanged: plan.unchanged, conflicts: plan.conflicts }, null, 2));
  if (plan.conflicts.length) process.exitCode = 1;
}

async function detectPlatform(root: string): Promise<{ platform: "codex" | "opencode" | "claude"; skills: string[] } | undefined> {
  for (const platform of ["codex", "opencode", "claude"] as const) {
    const file = platform === "codex" ? ".codex/agents/manifest.json" : `.${platform}/agents/manifest.json`;
    try {
      const value = JSON.parse(await readFile(join(root, file), "utf8")) as { platform?: string; skills?: unknown };
      if (value.platform === platform && Array.isArray(value.skills) && value.skills.every((skill) => typeof skill === "string")) return { platform, skills: value.skills as string[] };
    } catch { /* Try the next platform. */ }
  }
  return undefined;
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
