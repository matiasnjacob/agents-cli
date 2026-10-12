import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readCatalog} from '../catalog/skills.js';
import {applyInstall} from '../install/engine.js';
import {runDoctor} from '../doctor.js';
import {cancel,confirm,isCancel,note,spinner} from '@clack/prompts';
import {resolveConfig,type Manifest,type SetupConfig} from './config.js';
import {prepareSetup} from './install.js';
import {collectAnswers} from './wizard.js';

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

export function formatSetupPreview(report:{config:Pick<SetupConfig,'platform'|'suite'|'agents'> & {agentPrefix?:string};creates:string[];updates:string[];removes:string[];conflicts:string[];unchanged?:string[]}):string {
  const effectiveAgents=report.config.agents.map(id=>report.config.agentPrefix?`${report.config.agentPrefix}-${id}`:id);
  const lines=[`Platform: ${report.config.platform}`,`Suite: ${report.config.suite}`,`Agents: ${effectiveAgents.join(', ')}`];
  for (const [action,paths] of [['CREATE',report.creates],['UPDATE',report.updates],['REMOVE',report.removes],['CONFLICT',report.conflicts]] as const) {
    lines.push(`${action} (${paths.length})`);
    lines.push(...(paths.length?paths.map(path=>`  ${action} ${path}`):['  (none)']));
  }
  lines.push(`UNCHANGED (${report.unchanged?.length ?? 0})`);
  return lines.join('\n');
}

export async function setupCommand(root:string,catalogRoot:string,options:{config?:string;yes:boolean;dryRun:boolean}) {
  let config:SetupConfig;
  if (options.config) {
    config=(await readSetupConfig(root,catalogRoot,options.config))!;
    if (!config) throw new Error('Setup --config file was not found.');
  } else {
    if (!process.stdin.isTTY || options.yes) throw new Error('Setup requires an interactive terminal, or --config <file> with --yes/--dry-run.');
    config=await collectAnswers(await readCatalog(catalogRoot) as Manifest,await readSetupConfig(root,catalogRoot));
  }
  if (options.dryRun) return await executeSetup(root,catalogRoot,config,true);
  if (!options.yes) {
    if (!process.stdin.isTTY) throw new Error('Use --yes to apply --config without a terminal, or --dry-run to preview.');
    const preview=await executeSetup(root,catalogRoot,config,true);
    note(formatSetupPreview(preview),'Setup plan');
    if (preview.conflicts.length) return preview;
    const answer=await confirm({message:'Apply this configuration?',initialValue:true});
    if (isCancel(answer)) {cancel('Setup cancelled; no files written.');throw new Error('Setup cancelled; no files written.');}
    if (!answer) {cancel('Setup cancelled; no files written.');throw new Error('Setup cancelled; no files written.');}
  }
  const progress=process.stdin.isTTY?spinner():undefined;
  progress?.start('Applying setup plan');
  try {
    const report=await executeSetup(root,catalogRoot,config,false);
    progress?.stop(report.conflicts.length?'Setup stopped because of conflicts':'Setup files installed');
    return {...report,...(!report.conflicts.length?{diagnostics:await runDoctor({root,catalogRoot})}:{})};
  } catch(error) {
    progress?.stop('Setup failed');
    throw error;
  }
}
