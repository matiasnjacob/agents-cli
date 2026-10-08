#!/usr/bin/env node

import { parseCommandArgs, usage } from "./parse.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderCodex } from "../adapters/codex/render.js";
import { renderOpenCode } from "../adapters/opencode/render.js";
import { renderClaude } from "../adapters/claude/render.js";
import { renderPi } from "../adapters/pi/render.js";
import type { Platform } from "../contract.js";
import { applyInstall } from "../install/engine.js";
import { listSkills, readCatalog, renderSkillFiles } from "../catalog/skills.js";
import { runDoctor } from "../doctor.js";
import { readFile } from "node:fs/promises";
import {setupCommand,executeSetup,readSetupConfig} from '../setup/command.js';
import {suites,resolveConfig,type Manifest} from '../setup/config.js';
import {mcpCatalog} from '../setup/mcp.js';

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
  if (result.kind === 'setup') console.log(JSON.stringify(await setupCommand(process.cwd(),catalogRoot,result),null,2));
  else if (result.kind === 'suites-list') console.log(JSON.stringify(suites,null,2));
  else if (result.kind === 'mcp-list') console.log(JSON.stringify(mcpCatalog.map(m=>({...m,supported:m.platforms.includes(result.platform)})),null,2));
  else if (result.kind === "validate") console.log(JSON.stringify(result.config, null, 2));
  else if (result.kind === "skills-list") console.log(JSON.stringify(listSkills(await readCatalog(catalogRoot)), null, 2));
  else if (result.kind === "skills-add") await addSkill(result.platform,result.skill,result.dryRun,catalogRoot);
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
  const configured=await readSetupConfig(root,catalogRoot);
  if (configured) { console.log(JSON.stringify(await executeSetup(root,catalogRoot,configured,true),null,2)); return; }
  const installed = await detectPlatform(root);
  if (!installed) throw new Error("No platform manifest found; run init before update --dry-run.");
  const manifest = await readCatalog(catalogRoot);
  const skillFiles = await renderSkillFiles(catalogRoot, manifest, installed.skills, installed.platform);
  const adapterFiles = await renderPlatform(installed.platform, catalogRoot, installed.skills);
  const plan = await applyInstall({ root, catalogVersion: manifest.catalogVersion, files: [...adapterFiles, ...skillFiles], dryRun: true });
  console.log(JSON.stringify({ platform: installed.platform, dryRun: true, creates: plan.creates.map(({ path }) => path), updates: plan.updates.map(({ path }) => path), unchanged: plan.unchanged, conflicts: plan.conflicts }, null, 2));
  if (plan.conflicts.length) process.exitCode = 1;
}

async function detectPlatform(root: string): Promise<{ platform: Platform; skills: string[] } | undefined> {
  const installed:{platform:Platform;skills:string[]}[]=[];
  for (const platform of ["codex", "opencode", "claude", "pi"] as const) {
    const file = platform === "codex" ? ".codex/agents/manifest.json" : `.${platform}/agents/manifest.json`;
    try {
      const value = JSON.parse(await readFile(join(root, file), "utf8")) as { platform?: string; skills?: unknown };
      if (value.platform === platform && Array.isArray(value.skills) && value.skills.every((skill) => typeof skill === "string")) installed.push({ platform, skills: value.skills as string[] });
    } catch { /* Try the next platform. */ }
  }
  if (installed.length>1) throw new Error('Multiple platform installations found; use setup --config with an explicit platform.');
  return installed[0];
}

async function addSkill(platform:Platform,skill:string,dryRun:boolean,catalogRoot:string) {
  const configured=await readSetupConfig(process.cwd(),catalogRoot);
  if (configured) {
    if (configured.platform!==platform) throw new Error('Skill platform differs from configured setup.');
    const skills=configured.skills.some(s=>typeof s==='string'?s===skill:s.id===skill)?configured.skills:[...configured.skills,skill];
    const config=resolveConfig({...configured,skills},await readCatalog(catalogRoot) as Manifest);
    console.log(JSON.stringify(await executeSetup(process.cwd(),catalogRoot,config,dryRun),null,2));return;
  }
  const installed=await detectPlatform(process.cwd());
  if (installed && installed.platform!==platform) throw new Error('Skill platform differs from installed platform.');
  await install(platform,'none',[...new Set([...(installed?.skills ?? []),skill])],dryRun,catalogRoot,Boolean(installed));
}

async function install(platform: Platform, tracker: string, skills: string[], dryRun: boolean, catalogRoot: string, includeAgents: boolean): Promise<void> {
  const manifest = await readCatalog(catalogRoot);
  const skillFiles = await renderSkillFiles(catalogRoot, manifest, skills, platform);
  const adapterFiles = includeAgents ? await renderPlatform(platform, catalogRoot, skills) : [];
  const plan = await applyInstall({ root: process.cwd(), catalogVersion: manifest.catalogVersion, files: [...adapterFiles, ...skillFiles], dryRun });
  console.log(JSON.stringify({ platform, tracker, dryRun, creates: plan.creates.map(({ path }) => path), updates: plan.updates.map(({ path }) => path), unchanged: plan.unchanged, conflicts: plan.conflicts }, null, 2));
  if (plan.conflicts.length) process.exitCode = 1;
}

async function renderPlatform(platform: Platform, catalogRoot: string, skills: string[]) {
  if (platform === "codex") return renderCodex({ catalogRoot, selectedSkills: skills });
  if (platform === "opencode") return renderOpenCode({ catalogRoot, selectedSkills: skills });
  if (platform === "claude") return renderClaude({ catalogRoot, selectedSkills: skills });
  return renderPi({ catalogRoot, selectedSkills: skills });
}
