import {createInterface} from 'node:readline';
import { cancel, intro, isCancel, log, multiselect, select, text } from '@clack/prompts';
import {supportedPlatforms,supportedTrackers} from '../contract.js';
import {resolveConfig,suites,type Manifest,type SetupConfig} from './config.js';

type SelectOptions = {message:string;options:{value:string;label?:string;hint?:string}[];initialValue?:string;maxItems?:number};
type MultiOptions = {message:string;options:{value:string;label?:string;hint?:string}[];initialValues?:string[];required?:boolean;maxItems?:number};
type TextOptions = {message:string;placeholder?:string;defaultValue?:string;validate?:(value:string)=>string|Error|undefined};
export interface WizardPrompts {
  intro:(title?:string)=>void;
  select:(options:SelectOptions)=>Promise<string|symbol>;
  multiselect:(options:MultiOptions)=>Promise<string[]|symbol>;
  text:(options:TextOptions)=>Promise<string|symbol>;
  isCancel:(value:unknown)=>boolean;
  cancel:(message?:string)=>void;
  log:{info:(message:string)=>void};
}

const defaultPrompts:WizardPrompts={intro,select,multiselect,text,isCancel,cancel,log};

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
  prompts.intro(renderWelcomeBanner(terminalWidth));
  prompts.log.info('Keyboard: ↑/↓ move; Space toggle multi-select; Enter continue.');
  const platform=accepted(await prompts.select({message:'Choose an agent platform',options:labels(supportedPlatforms),initialValue:previous?.platform ?? 'codex'}),prompts);
  const suite=accepted(await prompts.select({message:'Choose an agent suite',options:labels(Object.keys(suites)),initialValue:previous?.suite ?? 'complete'}),prompts) as keyof typeof suites;
  const prefixValue=accepted(await prompts.text({
    message:'Project prefix for installed agents (optional)',
    placeholder:'Leave blank for no prefix',
    defaultValue:previous?.agentPrefix ?? '',
    validate:value=>value===''||/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)?undefined:'Prefix must use lowercase letters, numbers, and hyphens.',
  }),prompts);
  const agentOptions=manifest.agents.map(agent=>({value:agent.id,label:prefixValue?`${prefixValue}-${agent.id}`:agent.id}));
  const preset=previous?.suite===suite?previous.agents:suites[suite];
  const agents=accepted(await prompts.multiselect({message:'Select agents (↑/↓ move, Space toggle, Enter continue)',options:agentOptions,initialValues:preset,required:false,maxItems:10}),prompts);
  prompts.log.info(`Agents: ${agents.length} selected`);
  const tracker=accepted(await prompts.select({message:'Choose a project tracker',options:labels(supportedTrackers),initialValue:previous?.tracker ?? 'none'}),prompts);
  const defaultMcps=previous?.mcps.filter(id=>id!=='jev') ?? (tracker==='none'?[]:[tracker]);
  const mcps=accepted(await prompts.multiselect({message:'Select MCP integrations (authentication is configured separately)',options:labels(['github','linear','trello']),initialValues:defaultMcps,required:false,maxItems:6}),prompts);
  prompts.log.info(`MCPs: ${mcps.length} selected`);
  const required=new Set(agents.flatMap(id=>manifest.agents.find(agent=>agent.id===id)?.requiredSkills ?? []));
  const previousSkills=previous?.skills.filter((skill):skill is string=>typeof skill==='string') ?? [];
  const skillOptions=manifest.skills.map(skill=>({value:skill.id,label:skill.id,...(required.has(skill.id)?{hint:'required by selected agent'}:{})}));
  const skills=accepted(await prompts.multiselect({message:'Select optional skills (required skills stay enabled; ↑/↓ move, Space toggle, Enter continue)',options:skillOptions,initialValues:[...new Set([...required,...previousSkills])],required:false,maxItems:12}),prompts);
  prompts.log.info(`Skills: ${skills.length} selected`);
  const mode=accepted(await prompts.select({message:'Choose JEV decision support mode',options:labels(['off','shadow','assist']),initialValue:previous?.decisionSupport.mode ?? 'off'}),prompts);
  const priorExternal=previous?.skills.filter((skill):skill is Exclude<typeof skill,string>=>typeof skill!=='string') ?? [];
  const external=accepted(await prompts.text({message:'External skills JSON (Enter to skip)',placeholder:'Optional JSON array of {id, repository, revision, path}',defaultValue:priorExternal.length?JSON.stringify(priorExternal):''}),prompts);
  let externalSkills:unknown[]=[];
  if (external.trim() && external.trim()!=='no') {
    try {externalSkills=JSON.parse(external);} catch {throw new Error('External skills must be a JSON array.');}
    if (!Array.isArray(externalSkills)) throw new Error('External skills must be a JSON array.');
  }
  const selectedMcps=[...mcps];
  if (mode!=='off' && platform!=='pi') selectedMcps.push('jev');
  const config=resolveConfig({schemaVersion:1,platform,suite,agents,agentPrefix:prefixValue,tracker,skills:[...skills,...externalSkills],mcps:selectedMcps,decisionSupport:{...previous?.decisionSupport,mode}},manifest);
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
