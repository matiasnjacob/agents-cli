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
import { runDoctor, formatDoctorReport } from "../doctor.js";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import {setupCommand,executeSetup,readSetupConfig,isHumanSetup} from '../setup/command.js';
import {suites,resolveConfig,type Manifest} from '../setup/config.js';
import {mcpCatalog} from '../setup/mcp.js';
import {createStyle} from '../setup/ui.js';
import {resolveExternalSkill,resolveRevision} from '../setup/external.js';
import {checkSetup,formatDrift,externalStatuses} from '../setup/lifecycle.js';
import {importExisting,formatImport} from '../setup/import.js';
import {uninstall,formatUninstall,revert,formatRevert,listBackups} from '../setup/uninstall.js';
import {confirm,isCancel} from '@clack/prompts';
import {decisionCommand} from '../decision/cli.js';

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
  if (result.kind === "version") {
    const packageInfo = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), "../../package.json"), "utf8")) as { version: string };
    console.log(packageInfo.version);
  }
  else if (result.kind === 'setup') {
    const report = await setupCommand(process.cwd(),catalogRoot,result);
    if (!isHumanSetup(result)) console.log(JSON.stringify(report,null,2));
  }
  else if (result.kind === 'decision') await decisionCommand(result);
  else if (result.kind === 'suites-list') console.log(JSON.stringify(suites,null,2));
  else if (result.kind === 'mcp-list') console.log(JSON.stringify(mcpCatalog.map(m=>({...m,supported:m.platforms.includes(result.platform)})),null,2));
  else if (result.kind === "validate") console.log(JSON.stringify(result.config, null, 2));
  else if (result.kind === "skills-list") console.log(JSON.stringify(listSkills(await readCatalog(catalogRoot)), null, 2));
  else if (result.kind === "skills-add-external") await addExternalSkill(result, catalogRoot);
  else if (result.kind === "skills-update") await updateExternalSkills(result.id, result.dryRun, result.yes, catalogRoot);
  else if (result.kind === "skills-add") await addSkill(result.platform,result.skill,result.dryRun,catalogRoot);
  else if (result.kind === "init") await install(result.config.platform, result.config.tracker, result.config.skills, result.config.dryRun, catalogRoot, true);
  else if (result.kind === "doctor") {
    const report = await runDoctor({ root: process.cwd(), catalogRoot });
    console.log(result.json || !process.stdout.isTTY ? JSON.stringify(report, null, 2) : formatDoctorReport(report, createStyle()));
    if (!report.ok) process.exitCode = 1;
  } else if (result.kind === "uninstall" || result.kind === "revert") {
    const root = process.cwd();
    const human = !result.json && Boolean(process.stdout.isTTY);
    if (result.kind === "revert" && result.list) {
      const backups = (await listBackups(root)).map((backup) => ({ id: backup.id, files: backup.files.length }));
      console.log(human ? (backups.map((backup) => `${backup.id}  ${backup.files} file(s)`).join("\n") || "No backups.") : JSON.stringify(backups, null, 2));
    } else {
      if (!result.dryRun && !result.yes) {
        if (!process.stdin.isTTY) throw new Error(`${result.kind} changes files; use --yes to apply or --dry-run to preview.`);
        const answer = await confirm({ message: result.kind === "uninstall" ? "Remove the files and MCP entries installed by agents-cli? (edited files are kept; backups are saved)" : "Restore files from the backup? (current contents are backed up first)", initialValue: false });
        if (isCancel(answer) || !answer) throw new Error(`${result.kind} cancelled; no files changed.`);
      }
      const report = result.kind === "uninstall" ? await uninstall(root, { dryRun: result.dryRun }) : await revert(root, { id: result.id, dryRun: result.dryRun });
      const text = result.kind === "uninstall" ? formatUninstall(report as Awaited<ReturnType<typeof uninstall>>, createStyle()) : formatRevert(report as Awaited<ReturnType<typeof revert>>, createStyle());
      console.log(human ? text : JSON.stringify(report, null, 2));
    }
  } else if (result.kind === "import") {
    const report = await importExisting(process.cwd(), catalogRoot, { dryRun: result.dryRun });
    console.log(result.json || !process.stdout.isTTY ? JSON.stringify(report, null, 2) : formatImport(report, createStyle()));
  } else if (result.kind === "check") {
    const drift = await checkSetup(process.cwd(), catalogRoot);
    console.log(result.json || !process.stdout.isTTY ? JSON.stringify(drift, null, 2) : formatDrift(drift, createStyle()));
    if (!drift.upToDate) process.exitCode = 1;
  } else if (result.kind === "update") {
    if (result.dryRun) await update(catalogRoot);
    else {
      const root = process.cwd();
      if (!await readSetupConfig(root, catalogRoot)) throw new Error("update needs agents-cli.config.json (run setup first) or --dry-run.");
      const drift = await checkSetup(root, catalogRoot);
      if (drift.upToDate) console.log(result.yes || !process.stdout.isTTY ? JSON.stringify(drift, null, 2) : formatDrift(drift, createStyle()));
      else {
        const options = { config: "agents-cli.config.json", yes: result.yes, dryRun: false };
        const report = await setupCommand(root, catalogRoot, options);
        if (!isHumanSetup(options)) console.log(JSON.stringify(report, null, 2));
      }
    }
  }
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
    if (!configured.platforms.includes(platform)) throw new Error('Skill platform differs from configured setup.');
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

async function readConfigFile(): Promise<{ file: string; original: string; config: { skills?: unknown[]; platforms?: Platform[] } }> {
  const file = join(process.cwd(), "agents-cli.config.json");
  let original: string;
  try { original = await readFile(file, "utf8"); } catch { throw new Error("This command needs agents-cli.config.json; run setup first."); }
  return { file, original, config: JSON.parse(original) };
}

/** Writes an edited config, applies it through the normal setup plan, and restores the original on cancel or conflicts. */
async function applyConfigEdit(file: string, original: string, config: unknown, yes: boolean, catalogRoot: string) {
  await writeFile(file, JSON.stringify(config, null, 2) + "\n", "utf8");
  const options = { config: "agents-cli.config.json", yes, dryRun: false };
  try {
    const report = await setupCommand(process.cwd(), catalogRoot, options);
    if ((report as { conflicts?: string[] }).conflicts?.length) await writeFile(file, original, "utf8");
    return { report, human: isHumanSetup(options) };
  } catch (error) {
    await writeFile(file, original, "utf8");
    throw error;
  }
}

async function updateExternalSkills(id: string | undefined, dryRun: boolean, yes: boolean, catalogRoot: string) {
  const { file, original, config } = await readConfigFile();
  const statuses = (await externalStatuses(config.skills ?? [], undefined, id));
  if (id && !statuses.length) throw new Error(`No external skill '${id}' in agents-cli.config.json.`);
  const outdated = statuses.filter((status) => status.status === "outdated");
  if (dryRun || !outdated.length) {
    console.log(JSON.stringify({ dryRun, updated: false, externalSkills: statuses }, null, 2));
    return;
  }
  for (const skill of config.skills ?? []) {
    const match = outdated.find((status) => typeof skill !== "string" && (skill as { id: string }).id === status.id);
    if (match) (skill as { revision: string }).revision = match.latest!;
  }
  const { report, human } = await applyConfigEdit(file, original, config, yes, catalogRoot);
  if (!human) console.log(JSON.stringify({ updated: true, externalSkills: outdated, report }, null, 2));
}

async function addExternalSkill(request: { repository: string; path: string; ref?: string; id?: string; dryRun: boolean; yes: boolean }, catalogRoot: string) {
  const { file, original, config } = await readConfigFile();
  const id = (request.id ?? basename(request.path)).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const revision = await resolveRevision(request.repository, request.ref);
  const source = { id, repository: request.repository, revision, path: request.path };
  const platform = config.platforms?.[0] ?? "codex";
  const staged = await resolveExternalSkill(source, platform);
  const summary = { id, repository: request.repository, revision, path: request.path, files: staged.files.length, license: staged.provenance.license.trim().split("\n")[0] };
  const review = `https://github.com/${request.repository}/tree/${revision}/${request.path}`;
  if (request.dryRun) {
    console.log(JSON.stringify({ dryRun: true, added: false, skill: summary, review }, null, 2));
    return;
  }
  config.skills = [...(config.skills ?? []), source];
  const { report, human } = await applyConfigEdit(file, original, config, request.yes, catalogRoot);
  if (human) console.log(`Added ${id} (${summary.files} files, ${summary.license}). Skills are executable instructions: review ${review}`);
  else console.log(JSON.stringify({ dryRun: false, added: true, skill: summary, review, report }, null, 2));
}
