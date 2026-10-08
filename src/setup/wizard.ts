import {createInterface} from 'node:readline';
import {supportedPlatforms,supportedTrackers} from '../contract.js';
import {resolveConfig,suites,type Manifest,type SetupConfig} from './config.js';
export type Ask=(prompt:string)=>Promise<string|undefined>;
export async function collectAnswers(ask:Ask,manifest:Manifest,previous?:SetupConfig):Promise<SetupConfig> {
  async function answer(prompt:string):Promise<string> {
    const value=await ask(prompt);
    if (value===undefined || ['cancel','exit','q'].includes(value.trim().toLowerCase())) throw new Error('Setup cancelled; no files written.');
    return value.trim();
  }
  async function select(label:string,choices:readonly string[],fallback:string):Promise<string> {
    while (true) {
      const value=await answer(`${label}\n${choices.map((v,i)=>`  ${i+1}. ${v}`).join('\n')}\nSelection [${fallback}]: `);
      if (!value) return fallback;
      const chosen=/^\d+$/.test(value)?choices[Number(value)-1]:value;
      if (choices.includes(chosen)) return chosen;
    }
  }
  async function multi(label:string,choices:string[],fallback:string[]=[]):Promise<string[]> {
    while (true) {
      const value=await answer(`${label}\n${choices.map((v,i)=>`  ${i+1}. ${v}`).join('\n')}\nComma-separated selection [${fallback.join(',')||'none'}]; '-' for none: `);
      if (!value) return fallback;
      if (value==='-') return [];
      const selected=value.split(',').map(v=>v.trim()).map(v=>/^\d+$/.test(v)?choices[Number(v)-1]:v);
      if (selected.every(v=>choices.includes(v)) && new Set(selected).size===selected.length) return selected;
    }
  }
  const platform=await select('Platform',supportedPlatforms,previous?.platform ?? 'codex');
  const suite=await select('Agent suite',Object.keys(suites),previous?.suite ?? 'complete');
  const agents=await multi('Agents (adjust preset)',manifest.agents.map(a=>a.id),previous?.suite===suite?previous.agents:suites[suite as keyof typeof suites]);
  const tracker=await select('Tracker',supportedTrackers,previous?.tracker ?? 'none');
  const mcps=await multi('MCPs (authentication is configured separately)',['github','linear','trello'],previous?.mcps.filter(id=>id!=='jev') ?? (tracker==='none'?[]:[tracker]));
  const required=new Set(agents.flatMap(id=>manifest.agents.find(a=>a.id===id)?.requiredSkills ?? []));
  const skills=await multi(`Optional skills; required skills are automatic: ${[...required].join(', ')}`,manifest.skills.map(s=>s.id),previous?.skills.filter((s):s is string=>typeof s==='string') ?? []);
  const mode=await select('JEV decision support (state is sent to TypeSafe when invoked)',['off','shadow','assist'],previous?.decisionSupport.mode ?? 'off');
  const external=await answer('External skills? Paste a JSON array of {id, repository, revision (full SHA), path}, or Enter/no to skip: ');
  let externalSkills:unknown[]=[];
  if (external && external!=='no') {
    try {externalSkills=JSON.parse(external);} catch {throw new Error('External skills must be a JSON array.');}
    if (!Array.isArray(externalSkills)) throw new Error('External skills must be a JSON array.');
  } else if (previous) externalSkills=previous.skills.filter(s=>typeof s!=='string');
  if (mode!=='off' && platform!=='pi') mcps.push('jev');
  return resolveConfig({schemaVersion:1,platform,suite,agents,tracker,skills:[...skills,...externalSkills],mcps,decisionSupport:{...previous?.decisionSupport,mode}},manifest);
}
export function terminalPrompts():{ask:Ask;close:()=>void} {
  const rl=createInterface({input:process.stdin,output:process.stderr,terminal:true});
  const iterator=rl[Symbol.asyncIterator]();
  rl.on('SIGINT',()=>rl.close());
  return {ask:async(prompt)=>{process.stderr.write(prompt);const result=await iterator.next();return result.done?undefined:result.value;},close:()=>rl.close()};
}
