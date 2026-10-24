import {createInterface} from 'node:readline';
import { cancel, intro, isCancel, log, multiselect, select, text, updateSettings } from '@clack/prompts';
import {supportedPlatforms,supportedTrackers} from '../contract.js';
import {resolveConfig,suites,type Manifest,type SetupConfig} from './config.js';
import {createStyle} from './ui.js';

type SelectOptions = {message:string;options:{value:string;label?:string;hint?:string}[];initialValue?:string;maxItems?:number};
type MultiOptions = {message:string;options:{value:string;label?:string;hint?:string}[];initialValues?:string[];required?:boolean;maxItems?:number};
type TextOptions = {message:string;placeholder?:string;defaultValue?:string;initialValue?:string;validate?:(value:string)=>string|Error|undefined};
export interface WizardPrompts {
  intro:(title?:string)=>void;
  select:(options:SelectOptions)=>Promise<string|symbol>;
  multiselect:(options:MultiOptions)=>Promise<string[]|symbol>;
  text:(options:TextOptions)=>Promise<string|symbol>;
  isCancel:(value:unknown)=>boolean;
  cancel:(message?:string)=>void;
  log:{info:(message:string)=>void};
}

const defaultPrompts:WizardPrompts={intro,select:options=>select(options as Parameters<typeof select>[0]) as Promise<string|symbol>,multiselect:options=>multiselect(options as Parameters<typeof multiselect>[0]) as Promise<string[]|symbol>,text:options=>text(options as Parameters<typeof text>[0]) as Promise<string|symbol>,isCancel,cancel,log};
updateSettings({aliases:{'\u0004':'cancel'}});

export function cancelPromptOnInputEnd(input:NodeJS.ReadStream):()=>void {
  const onEnd=()=>input.emit('keypress','\u0004',{name:'eof',sequence:'\u0004'});
  input.on('end',onEnd);
  return ()=>input.off('end',onEnd);
}

export function renderWelcomeBanner(columns=80):string {
  const rows=['[]  []  []','Agents-Cli','Matias Jacob'];
  const width=Math.max(12,Math.min(40,columns-6),...rows.map(row=>row.length));
  const border=`+${'-'.repeat(width+2)}+`;
  return [border,...rows.map(row=>`| ${row.padEnd(width)} |`),border].join('\n');
}

function accepted<T>(value:T|symbol,prompts:WizardPrompts):T {
  if (prompts.isCancel(value)) {
    prompts.cancel('Setup cancelled; no files written.');
    throw new Error('Setup cancelled; no files written.');
  }
  return value as T;
}

function labels(values:readonly string[]):{value:string;label:string}[] {
  return values.map(value=>({value,label:value}));
}

export async function collectAnswers(manifest:Manifest,previous?:SetupConfig,prompts:WizardPrompts=defaultPrompts,terminalWidth=process.stdout.columns ?? 80):Promise<SetupConfig> {
  const style=createStyle();
  prompts.intro(style.heading('agents-cli setup').trimStart()+'\n'+style.dim(renderWelcomeBanner(terminalWidth)));
  prompts.log.info('Keyboard: ↑/↓ move; Space toggle multi-select; Enter continue.');
  const platforms=accepted(await prompts.multiselect({message:'Choose agent platforms (Space toggles; select one or more, e.g. codex + claude)',options:labels(supportedPlatforms),initialValues:previous?.platforms ?? ['codex'],required:true,maxItems:6}),prompts);
  if (!platforms.length) throw new Error('Select at least one platform.');
  const suite=accepted(await prompts.select({message:'Choose an agent suite',options:labels(Object.keys(suites)),initialValue:previous?.suite ?? 'complete'}),prompts) as keyof typeof suites;
  const prefixValue=accepted(await prompts.text({
    message:'Project prefix for installed agents (optional)',
    placeholder:'Leave blank for no prefix',
    initialValue:previous?.agentPrefix ?? '',
    validate:value=>value===''||/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)?undefined:'Prefix must use lowercase letters, numbers, and hyphens.',
  }),prompts);
  const agentOptions=manifest.agents.map(agent=>({value:agent.id,label:prefixValue?`${prefixValue}-${agent.id}`:agent.id}));
  const preset=previous?.suite===suite?previous.agents:suites[suite];
  const agents=accepted(await prompts.multiselect({message:'Select agents (↑/↓ move, Space toggle, Enter continue)',options:agentOptions,initialValues:preset,required:false,maxItems:10}),prompts);
  prompts.log.info(`Agents: ${agents.length} selected`);
  const tracker=accepted(await prompts.select({message:'Choose a project tracker',options:labels(supportedTrackers),initialValue:previous?.tracker ?? 'none'}),prompts);
  const defaultMcps=previous?.mcps.filter(id=>id!=='jev') ?? (tracker==='none'?['engram']:[tracker,'engram']);
  const mcps=accepted(await prompts.multiselect({message:'Select MCP integrations (authentication is configured separately)',options:labels(['github','linear','trello','engram']),initialValues:defaultMcps,required:false,maxItems:6}),prompts);
  prompts.log.info(`MCPs: ${mcps.length} selected`);
  const required=new Set(agents.flatMap(id=>manifest.agents.find(agent=>agent.id===id)?.requiredSkills ?? []));
  const previousSkills=previous?.skills.filter((skill):skill is string=>typeof skill==='string') ?? [];
  const skillOptions=manifest.skills.filter(skill=>!required.has(skill.id)).map(skill=>({value:skill.id,label:skill.id}));
  prompts.log.info(`Required skills: ${[...required].join(', ') || 'none'} (always enabled)`);
  const optionalSkills=accepted(await prompts.multiselect({message:'Select optional skills (required skills stay enabled; ↑/↓ move, Space toggle, Enter continue)',options:skillOptions,initialValues:previousSkills.filter(skill=>!required.has(skill)),required:false,maxItems:12}),prompts);
  const skills=[...new Set([...required,...optionalSkills])];
  prompts.log.info('brainstorming (skills.sh, obra/superpowers) is always installed for every agent.');
  prompts.log.info(`Skills: ${skills.length} selected`);
  const qa=agents.some(id=>id==='qa-manual'||id==='qa-automator');
  if (qa) prompts.log.info('QA agents always generate test cases with JEV and record Playwright evidence; shadow or assist mode is required.');
  const mode=accepted(await prompts.select({message:'Choose JEV decision support mode',options:labels(['off','shadow','assist']),initialValue:previous?.decisionSupport.mode ?? (qa?'assist':'off')}),prompts);
  const priorExternal=previous?.skills.filter((skill):skill is Exclude<typeof skill,string>=>typeof skill!=='string' && skill.id!=='brainstorming') ?? [];
  const external=accepted(await prompts.text({message:'External skills JSON (Enter to skip)',placeholder:'Optional JSON array of {id, repository, revision, path}',defaultValue:priorExternal.length?JSON.stringify(priorExternal):''}),prompts);
  let externalSkills:unknown[]=[];
  if (external.trim() && external.trim()!=='no') {
    try {externalSkills=JSON.parse(external);} catch {throw new Error('External skills must be a JSON array.');}
    if (!Array.isArray(externalSkills)) throw new Error('External skills must be a JSON array.');
  }
  const selectedMcps=[...mcps];
  if (mode!=='off' && platforms.some(platform=>platform!=='pi')) selectedMcps.push('jev');
  const config=resolveConfig({schemaVersion:1,platforms,suite,agents,agentPrefix:prefixValue,tracker,skills:[...skills,...externalSkills],mcps:selectedMcps,decisionSupport:{...previous?.decisionSupport,mode}},manifest);
  return config;
}

export function isSetupCancelled(error:unknown):boolean {
  return error instanceof Error && /Setup cancelled/.test(error.message);
}

export const isPromptCancel=isCancel;

export type Ask=(prompt:string)=>Promise<string|undefined>;
export function terminalPrompts():{ask:Ask;close:()=>void} {
  const rl=createInterface({input:process.stdin,output:process.stderr,terminal:true});
  const iterator=rl[Symbol.asyncIterator]();
  rl.on('SIGINT',()=>rl.close());
  return {ask:async prompt=>{process.stderr.write(prompt);const result=await iterator.next();return result.done?undefined:result.value;},close:()=>rl.close()};
}
