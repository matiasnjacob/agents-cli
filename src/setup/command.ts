import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readCatalog} from '../catalog/skills.js';
import {applyInstall} from '../install/engine.js';
import {runDoctor} from '../doctor.js';
import {confirm,isCancel,cancel,note} from '@clack/prompts';
import {resolveConfig,type Manifest,type SetupConfig} from './config.js';
import {prepareSetup,type Progress} from './install.js';
import {createStyle,colorEnabled,paint} from './ui.js';
import {applyEnv,planEnv,direnvAvailable,brewAvailable,commandAvailable,installDirenvWithBrew,type EnvPlan} from './env.js';
import type {InstallFile} from '../install/engine.js';
import {cancelPromptOnInputEnd,collectAnswers} from './wizard.js';

export interface SetupTerminal {
  isInteractive:()=>boolean;
  note:(message:string,title?:string)=>void;
  confirm:(message:string)=>Promise<boolean|symbol>;
  isCancel:(value:unknown)=>boolean;
  cancel:(message:string)=>void;
  /** Writes a line of human-readable output; absent in minimal terminals. */
  write?:(text:string)=>void;
}
const terminal:SetupTerminal={isInteractive:()=>Boolean(process.stdin.isTTY),note:(message,title)=>note(message,title),confirm:async message=>confirm({message,initialValue:true}),isCancel,cancel,write:text=>process.stdout.write(`${text}\n`)};

export async function readSetupConfig(root:string,catalogRoot:string,file='agents-cli.config.json'):Promise<SetupConfig|undefined> {
  let raw:string;
  try {raw=await readFile(resolve(root,file),'utf8');} catch(e) {if ((e as NodeJS.ErrnoException).code==='ENOENT') return;throw e;}
  return resolveConfig(JSON.parse(raw),await readCatalog(catalogRoot) as Manifest);
}

export async function executeSetup(root:string,catalogRoot:string,config:SetupConfig,dryRun:boolean,progress?:Progress,preparedSetup?:{files:InstallFile[];pending:string[]}) {
  const manifest=await readCatalog(catalogRoot);
  const prepared=preparedSetup ?? await prepareSetup(root,catalogRoot,config,progress);
  const plan=await applyInstall({root,catalogVersion:manifest.catalogVersion,files:prepared.files,dryRun});
  const environment:EnvPlan=plan.conflicts.length||dryRun?await planEnv(root,config):await applyEnv(root,config);
  const report={config,platforms:config.platforms,dryRun,environment,creates:plan.creates.map(f=>f.path),updates:plan.updates.map(f=>f.path),removes:plan.removes.map(f=>f.path),unchanged:plan.unchanged,conflicts:plan.conflicts,pending:prepared.pending};
  if (plan.conflicts.length) process.exitCode=1;
  return report;
}

export function formatSetupPreview(report:{config:Pick<SetupConfig,'suite'|'agents'> & ({platforms:SetupConfig['platforms']}|{platform:SetupConfig['platforms'][number]}) & Partial<Pick<SetupConfig,'agentPrefix'|'tracker'|'mcps'|'skills'|'decisionSupport'|'permissions'>>;creates:string[];updates:string[];removes:string[];conflicts:string[];unchanged?:string[]}):string {
  const effectiveAgents=report.config.agents.map(id=>report.config.agentPrefix?`${report.config.agentPrefix}-${id}`:id);
  const selectedSkills=report.config.skills?.map(skill=>typeof skill==='string'?skill:`${skill.id} (${skill.repository}@${skill.revision.slice(0,7)}:${skill.path})`);
  const platforms='platforms' in report.config?report.config.platforms:[report.config.platform];
  const lines=[`Platforms: ${platforms.join(', ')}`,`Suite: ${report.config.suite}`,`Agents: ${effectiveAgents.join(', ')}`,`Tracker: ${report.config.tracker ?? 'not specified'}`,`MCPs: ${report.config.mcps?.join(', ') || 'none'}`,`Skills: ${selectedSkills?.join(', ') || 'none'}`,`JEV: ${report.config.decisionSupport?.mode ?? 'not specified'}`];
  const overrides=Object.entries(report.config.permissions ?? {}).flatMap(([agent,changes])=>Object.entries(changes).map(([name,value])=>`${agent}.${name}=${typeof value==='string'?value:JSON.stringify(value)}`));
  if (overrides.length) lines.push(`Permission overrides: ${overrides.join(', ')}`);
  for (const [action,paths] of [['CREATE',report.creates],['UPDATE',report.updates],['REMOVE',report.removes],['CONFLICT',report.conflicts]] as const) {
    lines.push(`${action} (${paths.length})`);
    lines.push(...(paths.length?paths.map(path=>`  ${action} ${path}`):['  (none)']));
  }
  lines.push(`UNCHANGED (${report.unchanged?.length ?? 0})`);
  lines.push(...(report.unchanged?.length?report.unchanged.map(path=>`  UNCHANGED ${path}`):['  (none)']));
  return lines.join('\n');
}

/** Short, deduplicated list of what the user still has to do; no diagnostics or NOT VERIFIED noise. */
export function setupNextSteps(input:{pending:string[];variables:string[];direnv:boolean;engramMissing:boolean}):string[] {
  const steps:string[]=[];
  if (input.variables.length) {
    steps.push(`Fill in ${input.variables.join(', ')} in .env (never commit it).`);
    steps.push(input.direnv?'Load it with direnv: run `direnv allow` once in this project.':'Install direnv (macOS: brew install direnv), hook it into your shell, then run `direnv allow`.');
  }
  if (input.engramMissing) steps.push('Install engram and make sure it is on your PATH.');
  const seen=new Set<string>();
  for (const message of input.pending) {
    const text=message.replace(/^\[[a-z]+\] /,'').replace(/;? ?functional tool call NOT VERIFIED\.?/,'').trim();
    const id=text.split(':')[0];
    if (['github','jev','engram'].includes(id) || seen.has(text)) continue;
    seen.add(text);
    steps.push(id==='linear'?'Linear: sign in with OAuth the first time your agent uses it.':text.replace(/\.?$/,'.'));
  }
  steps.push('Start your agent runtime in this project.');
  return steps;
}

export function isHumanSetup(options:{yes:boolean;dryRun:boolean},ui:Pick<SetupTerminal,'isInteractive'>=terminal):boolean {
  return ui.isInteractive() && !options.yes && !options.dryRun;
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

export function formatSelectionSummary(report:Parameters<typeof formatSetupPreview>[0] & {environment?:EnvPlan},style=createStyle(false)):string {
  const full=formatSetupPreview(report).split('\n');
  const selection=full.slice(0,full.findIndex(line=>line.startsWith('CREATE (')));
  const lines=[style.heading('Setup plan'),...selection.map(line=>{
    const i=line.indexOf(':');
    return `  ${style.dim('│')} ${style.command(line.slice(0,i+1))}${line.slice(i+1)}`;
  })];
  const counts=`${report.creates.length} to create, ${report.updates.length} to update, ${report.removes.length} to remove, ${report.unchanged?.length ?? 0} unchanged`;
  lines.push(`  ${style.dim('│')} ${style.command('Files:')} ${counts}`);
  if (report.environment?.variables.length) lines.push(`  ${style.dim('│')} ${style.command('Environment:')} .env (${report.environment.variables.map(v=>v.name).join(', ')}), .envrc for direnv`);
  for (const [label,paths] of [['UPDATE',report.updates],['REMOVE',report.removes],['CONFLICT',report.conflicts]] as const) {
    if (!paths.length) continue;
    lines.push(style[label==='CONFLICT'?'fail':'warn'](`${label} (${paths.length})`));
    lines.push(...paths.slice(0,20).map(path=>`      ${path}`));
    if (paths.length>20) lines.push(`      ... and ${paths.length-20} more`);
  }
  return lines.join('\n');
}

function colorizePlan(text:string,enabled:boolean):string {
  const styles={CREATE:'green',UPDATE:'yellow',REMOVE:'red',CONFLICT:'red'} as const;
  return text.split('\n').map(line=>{
    const match=/^(\s*)(CREATE|UPDATE|REMOVE|CONFLICT)\b(.*)$/.exec(line);
    if (match) return `${match[1]}${paint(styles[match[2] as keyof typeof styles],match[2],enabled)}${match[3]}`;
    return /^[A-Za-z]+:/.test(line)?line.replace(/^([A-Za-z]+:)/,label=>paint('bold',label,enabled)):line;
  }).join('\n');
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
  const human=isHumanSetup(options,ui);
  const color=colorEnabled();
  const style=createStyle(color);
  const write=(text:string)=>ui.write?.(text);
  let prepared:Awaited<ReturnType<typeof prepareSetup>>|undefined;
  if (!options.yes) {
    if (!ui.isInteractive()) throw new Error('Use --yes to apply --config without a terminal, or --dry-run to preview.');
    write(style.heading('Preparing setup plan...'));
    prepared=await prepareSetup(root,catalogRoot,config,message=>write(style.step(message)));
    const preview=await executeSetup(root,catalogRoot,config,true,undefined,prepared);
    if (ui.write) write(formatSelectionSummary(preview,style));
    else ui.note(colorizePlan(formatSetupPreview(preview),color),'Setup plan');
    if (preview.conflicts.length) {
      write(style.fail(`${preview.conflicts.length} conflict(s) found; nothing was written.`));
      return preview;
    }
    const answer=await ui.confirm('Apply this setup plan?');
    if (ui.isCancel(answer)) {ui.cancel('Setup cancelled; no files written.');throw new Error('Setup cancelled; no files written.');}
    if (!answer) {ui.cancel('Setup cancelled; no files written.');throw new Error('Setup cancelled; no files written.');}
  }
  if (human) write(style.heading('Applying setup...'));
  try {
    const report=await executeSetup(root,catalogRoot,config,false,undefined,prepared);
    if (report.conflicts.length) {
      if (human) write(style.fail('Setup stopped because of conflicts.'));
      return report;
    }
    if (human) write(style.ok(`Files installed: ${report.creates.length} created, ${report.updates.length} updated, ${report.removes.length} removed, ${report.unchanged.length} unchanged`));
    if (human) write(style.step('Verifying installation'));
    const diagnostics=await runDoctor({root,catalogRoot});
    if (human) {
      const failures=diagnostics.checks.filter(check=>check.status==='fail');
      const vars=report.environment.variables.map(v=>v.name);
      let direnv=true;
      if (vars.length) {
        write(style.ok(`Environment files ready: .env (${report.environment.add.length} variable(s) added, values left empty), .envrc`));
        direnv=await direnvAvailable();
        if (!direnv && await brewAvailable()) {
          const answer=await ui.confirm('direnv is not installed. Install it with Homebrew (brew install direnv)?');
          if (!ui.isCancel(answer) && answer) {
            write(style.step('Installing direnv with Homebrew'));
            try {await installDirenvWithBrew();direnv=true;write(style.ok('direnv installed.'));} catch {write(style.warn('direnv installation failed; install it manually.'));}
          }
        }
      }
      if (failures.length) {
        write(style.fail('Setup installed, but verification found problems:'));
        for (const check of failures) write(style.fail(`${check.name}: ${check.message}`));
      } else write(style.ok('Setup complete.'));
      const engramMissing=config.mcps.includes('engram') && !await commandAvailable('engram');
      const next=setupNextSteps({pending:report.pending,variables:vars,direnv,engramMissing});
      write(style.badge('NEXT','Before you start'));
      for (const line of next) write(`    ${style.dim('-')} ${line}`);
      write(`\n    ${style.dim('Details and diagnostics any time:')} ${style.command('agents-cli doctor')}\n`);
    }
    return {...report,diagnostics};
  } catch(error) {
    if (human) write(style.fail('Setup failed.'));
    throw error;
  }
}
