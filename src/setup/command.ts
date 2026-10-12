import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readCatalog} from '../catalog/skills.js';
import {applyInstall} from '../install/engine.js';
import {runDoctor} from '../doctor.js';
import {cancel,confirm,isCancel,note,spinner} from '@clack/prompts';
import {resolveConfig,type Manifest,type SetupConfig} from './config.js';
import {prepareSetup} from './install.js';
import {cancelPromptOnInputEnd,collectAnswers} from './wizard.js';

export interface SetupTerminal {
  isInteractive:()=>boolean;
  note:(message:string,title?:string)=>void;
  confirm:(message:string)=>Promise<boolean|symbol>;
  isCancel:(value:unknown)=>boolean;
  cancel:(message:string)=>void;
  spinner:()=>{start:(message:string)=>void;stop:(message?:string)=>void};
}
const terminal:SetupTerminal={isInteractive:()=>Boolean(process.stdin.isTTY),note:(message,title)=>note(message,title),confirm:async message=>confirm({message,initialValue:true}),isCancel,cancel,spinner};

export async function readSetupConfig(root:string,catalogRoot:string,file='agents-cli.config.json'):Promise<SetupConfig|undefined> {
  let raw:string;
  try {raw=await readFile(resolve(root,file),'utf8');} catch(e) {if ((e as NodeJS.ErrnoException).code==='ENOENT') return;throw e;}
  return resolveConfig(JSON.parse(raw),await readCatalog(catalogRoot) as Manifest);
}

export async function executeSetup(root:string,catalogRoot:string,config:SetupConfig,dryRun:boolean) {
  const manifest=await readCatalog(catalogRoot);
  const prepared=await prepareSetup(root,catalogRoot,config);
  const plan=await applyInstall({root,catalogVersion:manifest.catalogVersion,files:prepared.files,dryRun});
  const report={config,platform:config.platform,dryRun,creates:plan.creates.map(f=>f.path),updates:plan.updates.map(f=>f.path),removes:plan.removes.map(f=>f.path),unchanged:plan.unchanged,conflicts:plan.conflicts,pending:prepared.pending};
  if (plan.conflicts.length) process.exitCode=1;
  return report;
}

export function formatSetupPreview(report:{config:Pick<SetupConfig,'platform'|'suite'|'agents'> & Partial<Pick<SetupConfig,'agentPrefix'|'tracker'|'mcps'|'skills'|'decisionSupport'>>;creates:string[];updates:string[];removes:string[];conflicts:string[];unchanged?:string[]}):string {
  const effectiveAgents=report.config.agents.map(id=>report.config.agentPrefix?`${report.config.agentPrefix}-${id}`:id);
  const selectedSkills=report.config.skills?.map(skill=>typeof skill==='string'?skill:`${skill.id} (${skill.repository}@${skill.revision.slice(0,7)}:${skill.path})`);
  const lines=[`Platform: ${report.config.platform}`,`Suite: ${report.config.suite}`,`Agents: ${effectiveAgents.join(', ')}`,`Tracker: ${report.config.tracker ?? 'not specified'}`,`MCPs: ${report.config.mcps?.join(', ') || 'none'}`,`Skills: ${selectedSkills?.join(', ') || 'none'}`,`JEV: ${report.config.decisionSupport?.mode ?? 'not specified'}`];
  for (const [action,paths] of [['CREATE',report.creates],['UPDATE',report.updates],['REMOVE',report.removes],['CONFLICT',report.conflicts]] as const) {
    lines.push(`${action} (${paths.length})`);
    lines.push(...(paths.length?paths.map(path=>`  ${action} ${path}`):['  (none)']));
  }
  lines.push(`UNCHANGED (${report.unchanged?.length ?? 0})`);
  lines.push(...(report.unchanged?.length?report.unchanged.map(path=>`  UNCHANGED ${path}`):['  (none)']));
  return lines.join('\n');
}

export async function setupCommand(root:string,catalogRoot:string,options:{config?:string;yes:boolean;dryRun:boolean},ui:SetupTerminal=terminal) {
  const interactive=ui.isInteractive();
  const cleanup=interactive?cancelPromptOnInputEnd(process.stdin):()=>{};
  try {
    return await runSetupCommand(root,catalogRoot,options,ui);
  } finally {
    cleanup();
  }
}

async function runSetupCommand(root:string,catalogRoot:string,options:{config?:string;yes:boolean;dryRun:boolean},ui:SetupTerminal) {
  let config:SetupConfig;
  if (options.config) {
    config=(await readSetupConfig(root,catalogRoot,options.config))!;
    if (!config) throw new Error('Setup --config file was not found.');
  } else {
    if (!ui.isInteractive() || options.yes) throw new Error('Setup requires an interactive terminal, or --config <file> with --yes/--dry-run.');
    config=await collectAnswers(await readCatalog(catalogRoot) as Manifest,await readSetupConfig(root,catalogRoot));
  }
  if (options.dryRun) return await executeSetup(root,catalogRoot,config,true);
  if (!options.yes) {
    if (!ui.isInteractive()) throw new Error('Use --yes to apply --config without a terminal, or --dry-run to preview.');
    const preview=await executeSetup(root,catalogRoot,config,true);
    ui.note(formatSetupPreview(preview),'Setup plan');
    if (preview.conflicts.length) return preview;
    const answer=await ui.confirm('Apply this configuration?');
    if (ui.isCancel(answer)) {ui.cancel('Setup cancelled; no files written.');throw new Error('Setup cancelled; no files written.');}
    if (!answer) {ui.cancel('Setup cancelled; no files written.');throw new Error('Setup cancelled; no files written.');}
  }
  const progress=ui.isInteractive()?ui.spinner():undefined;
  progress?.start('Applying setup plan');
  try {
    const report=await executeSetup(root,catalogRoot,config,false);
    if (report.conflicts.length) {
      progress?.stop('Setup stopped because of conflicts');
      return report;
    }
    progress?.stop('Files installed; running doctor');
    progress?.start('Running doctor');
    const diagnostics=await runDoctor({root,catalogRoot});
    progress?.stop(diagnostics.ok?'Setup and doctor completed':'Setup installed; doctor found issues');
    return {...report,diagnostics};
  } catch(error) {
    progress?.stop('Setup failed');
    throw error;
  }
}
