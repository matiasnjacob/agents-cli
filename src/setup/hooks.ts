import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {parse as parseJson,modify,applyEdits,type ParseError} from 'jsonc-parser';
import {assertNoSymlinks,sha256,type InstallFile} from '../install/engine.js';
import type {Platform} from '../contract.js';

export const SETTINGS_PATH='.claude/settings.json';
export const HOOKS_STATE_PATH='.agents/hooks-state-claude.json';
export const START_COMMAND="sh -c 'command -v engram >/dev/null 2>&1 && engram context || true'";
export const STOP_COMMAND='agents-cli hook engram-stop';

interface Handler {type:'command';command:string;timeout:number}
interface Group {matcher?:string;hooks:Handler[]}
interface State {schemaVersion:1;entries:{event:string;command:string}[]}
type HooksMap=Record<string,Group[]>;

async function optional(root:string,path:string):Promise<string|undefined> {
  await assertNoSymlinks(root,path);
  try {return await readFile(join(root,path),'utf8');} catch(e) {if ((e as NodeJS.ErrnoException).code==='ENOENT') return; throw e;}
}

/** True when the user already runs the Engram Claude Code plugin, which loads context at session start itself. */
export async function engramPluginEnabled(home:string=homedir()):Promise<boolean> {
  try {
    const settings=parseJson(await readFile(join(home,'.claude','settings.json'),'utf8')) as {enabledPlugins?:Record<string,boolean>}|undefined;
    return Object.entries(settings?.enabledPlugins ?? {}).some(([name,on])=>on===true && /engram/i.test(name));
  } catch {return false;}
}

export function desiredGroups(options:{sessionStartContext:boolean}):Record<string,Group[]> {
  const groups:Record<string,Group[]>={Stop:[{hooks:[{type:'command',command:STOP_COMMAND,timeout:10}]}]};
  if (options.sessionStartContext) groups.SessionStart=[{matcher:'startup|resume|clear|fork',hooks:[{type:'command',command:START_COMMAND,timeout:10}]}];
  return groups;
}

/** Removes only handlers whose command we own; user hooks and groups are preserved. */
export function stripManaged(hooks:HooksMap,commands:Set<string>):HooksMap {
  const result:HooksMap={};
  for (const [event,groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {result[event]=groups;continue;}
    const kept=groups.map(group=>({...group,hooks:(group.hooks ?? []).filter(handler=>!commands.has(handler.command))})).filter((group,i)=>group.hooks.length || !(groups[i].hooks ?? []).length);
    if (kept.length) result[event]=kept;
  }
  return result;
}

export async function prepareHooks(root:string,config:{platforms:Platform[];hooks:{engram:boolean}},home?:string):Promise<{files:InstallFile[];pending:string[]}> {
  const files:InstallFile[]=[],pending:string[]=[];
  if (!config.platforms.includes('claude')) return {files,pending};
  const stateRaw=await optional(root,HOOKS_STATE_PATH);
  const state:State|undefined=stateRaw?JSON.parse(stateRaw):undefined;
  if (state && (state.schemaVersion!==1 || !Array.isArray(state.entries))) throw new Error('Malformed hooks ownership state.');
  if (!config.hooks.engram && !state) return {files,pending};
  const original=await optional(root,SETTINGS_PATH);
  const content=original ?? '{}\n';
  const errors:ParseError[]=[];
  const parsed=parseJson(content,errors,{allowTrailingComma:true});
  if (errors.length || !parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error('Hooks conflict: .claude/settings.json is not valid JSON.');
  if (parsed.hooks!==undefined && (!parsed.hooks || typeof parsed.hooks!=='object' || Array.isArray(parsed.hooks))) throw new Error('Hooks conflict: invalid hooks map.');
  const desired=config.hooks.engram?desiredGroups({sessionStartContext:!await engramPluginEnabled(home)}):{};
  const owned=new Set([...(state?.entries.map(entry=>entry.command) ?? []),...Object.values(desired).flatMap(groups=>groups.flatMap(group=>group.hooks.map(handler=>handler.command)))]);
  const merged=stripManaged((parsed.hooks ?? {}) as HooksMap,owned);
  for (const [event,groups] of Object.entries(desired)) merged[event]=[...(merged[event] ?? []),...groups];
  let next=content;
  if (Object.keys(merged).length) next=applyEdits(content,modify(content,['hooks'],merged,{formattingOptions:{insertSpaces:true,tabSize:2,eol:'\n'}}));
  else if (parsed.hooks!==undefined) next=applyEdits(content,modify(content,['hooks'],undefined,{formattingOptions:{insertSpaces:true,tabSize:2,eol:'\n'}}));
  if (next!==content || original===undefined) files.push({path:SETTINGS_PATH,content:next,...(original!==undefined?{expectedHash:sha256(original)}:{})});
  if (config.hooks.engram) {
    const entries=Object.entries(desired).flatMap(([event,groups])=>groups.flatMap(group=>group.hooks.map(handler=>({event,command:handler.command}))));
    files.push({path:HOOKS_STATE_PATH,content:JSON.stringify({schemaVersion:1,entries},null,2)+'\n'});
  } else files.push({path:HOOKS_STATE_PATH,content:'',remove:true});
  return {files,pending};
}

/** Settings content with every managed hook removed (for uninstall); undefined when nothing changes. */
export async function removeManagedHooks(root:string):Promise<{files:InstallFile[]}> {
  const prepared=await prepareHooks(root,{platforms:['claude'],hooks:{engram:false}});
  return {files:prepared.files};
}
