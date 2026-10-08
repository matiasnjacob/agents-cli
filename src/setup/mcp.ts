import {readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {parse as parseJson, modify, applyEdits, type ParseError} from 'jsonc-parser';
import {parse as parseToml} from 'smol-toml';
import {sha256,assertNoSymlinks,type InstallFile} from '../install/engine.js';
import type {SetupConfig} from './config.js';
export const mcpCatalog: {id:string;transport:string;platforms:string[];url?:string;credentialEnv?:string;authentication?:string;command?:string;args?:string[];note?:string}[]=[
  {id:'github',transport:'http',url:'https://api.githubcopilot.com/mcp/',credentialEnv:'GITHUB_TOKEN',platforms:['codex','claude','opencode']},
  {id:'linear',transport:'http',url:'https://mcp.linear.app/mcp',authentication:'OAuth',platforms:['codex','claude','opencode']},
  {id:'trello',transport:'pending',platforms:[],note:'No verified portable Trello MCP bundled; configure your chosen provider manually.'},
  {id:'jev',transport:'stdio',command:'agents-cli',args:['decision','mcp'],platforms:['codex','claude','opencode'],note:'Pi subagents use agents-cli decision through bash.'},
];
interface State {schemaVersion:1; path:string; entries:Record<string,string>; blockHash?:string}
async function optional(root:string,path:string):Promise<string|undefined> {
  await assertNoSymlinks(root,path);
  try {return await readFile(join(root,path),'utf8');} catch(e) {if ((e as NodeJS.ErrnoException).code==='ENOENT') return; throw e;}
}
export async function prepareMcp(root:string,config:Pick<SetupConfig,'platform'|'mcps'>):Promise<{files:InstallFile[];pending:string[]}> {
  const files:InstallFile[]=[],pending:string[]=[];
  const entries:Record<string,unknown>={};
  for (const id of config.mcps) {
    const entry=mcpCatalog.find(e=>e.id===id);
    if (!entry) throw new Error('Unknown MCP.');
    if (!entry.platforms.includes(config.platform)) {pending.push(`${id}: ${config.platform==='pi'&&id==='jev'?'use agents-cli decision CLI from bash':'native connection is not bundled for this platform; configure manually'}.`); continue;}
    const name=`agents-cli-${id}`;
    if (config.platform==='opencode') entries[name]=id==='jev'?{type:'local',command:['agents-cli','decision','mcp'],enabled:true}:{type:'remote',url:entry.url,enabled:true,...(id==='github'?{oauth:false,headers:{Authorization:'Bearer {env:GITHUB_TOKEN}'}}:{})};
    else if (config.platform==='claude') entries[name]=id==='jev'?{type:'stdio',command:'agents-cli',args:['decision','mcp']}:{type:'http',url:entry.url,...(id==='github'?{headers:{Authorization:'Bearer ${GITHUB_TOKEN}'}}:{})};
    else entries[name]=id==='jev'?{command:'agents-cli',args:['decision','mcp']}:{url:entry.url,...(id==='github'?{bearer_token_env_var:'GITHUB_TOKEN'}:{})};
    pending.push(`${id}: ${id==='github'?'set GITHUB_TOKEN in the runtime environment':id==='linear'?'complete OAuth in the selected runtime':'ensure agents-cli is on PATH and set the configured TypeSafe API key' }; functional tool call NOT VERIFIED.`);
  }
  if (config.platform==='pi') return {files,pending};
  const statePath=`.agents/mcp-state-${config.platform}.json`;
  const stateRaw=await optional(root,statePath);
  const state:State|undefined=stateRaw?JSON.parse(stateRaw):undefined;
  if (state && (state.schemaVersion!==1 || !state.entries || typeof state.entries!=='object')) throw new Error('Malformed MCP ownership state.');
  let path=config.platform==='codex'?'.codex/config.toml':config.platform==='claude'?'.mcp.json':'opencode.json';
  if (config.platform==='opencode') {
    const jsonc=await optional(root,'opencode.jsonc');
    if (jsonc!==undefined) {
      if (await optional(root,'opencode.json')!==undefined) throw new Error('MCP conflict: both opencode.json and opencode.jsonc exist.');
      path='opencode.jsonc';
    }
  }
  if (state && state.path!==path) throw new Error('MCP conflict: configuration path changed.');
  const original=await optional(root,path);
  if (!Object.keys(entries).length && !state) return {files,pending};
  let content=original ?? (config.platform==='codex'?'':'{}\n');
  const next:State={schemaVersion:1,path,entries:Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,sha256(JSON.stringify(v))]))};
  if (config.platform==='codex') {
    const begin='# agents-cli MCP begin',end='# agents-cli MCP end';
    const start=content.indexOf(begin),finish=content.indexOf(end);
    let base=content;
    if (start!==-1 || finish!==-1) {
      if (start===-1 || finish<start || content.indexOf(begin,start+begin.length)!==-1) throw new Error('MCP conflict: malformed managed TOML block.');
      const block=content.slice(start,finish+end.length);
      if (!state?.blockHash || sha256(block)!==state.blockHash) throw new Error('MCP conflict: managed TOML block edited.');
      base=content.slice(0,start)+content.slice(finish+end.length).replace(/^\r?\n/,'');
    } else if (state?.blockHash) throw new Error('MCP conflict: managed TOML block removed.');
    const parsed=parseToml(base);
    const existing=(parsed.mcp_servers ?? {}) as Record<string,unknown>;
    for (const name of Object.keys(entries)) if (Object.hasOwn(existing,name)) throw new Error(`MCP conflict: ${name} already exists.`);
    const blocks=Object.entries(entries).map(([name,v])=>`[mcp_servers.${JSON.stringify(name)}]\n${Object.entries(v as Record<string,unknown>).map(([k,val])=>`${k} = ${JSON.stringify(val)}`).join('\n')}`);
    const block=[begin,...blocks,end].join('\n'); next.blockHash=sha256(block);
    content=base.replace(/\n*$/,'')+'\n\n'+block+'\n';
    parseToml(content);
  } else {
    const errors:ParseError[]=[]; const parsed=parseJson(content,errors,{allowTrailingComma:true});
    if (errors.length || !parsed || Array.isArray(parsed) || typeof parsed!=='object') throw new Error('MCP conflict: invalid JSON/JSONC configuration.');
    const section=config.platform==='claude'?'mcpServers':'mcp';
    if (parsed[section]!==undefined && (!parsed[section] || typeof parsed[section]!=='object' || Array.isArray(parsed[section]))) throw new Error('MCP conflict: invalid server map.');
    const existing=parsed[section] ?? {};
    for (const name of new Set([...Object.keys(state?.entries ?? {}),...Object.keys(entries)])) {
      const current=existing[name];
      if (state?.entries[name]) {
        if (current===undefined || sha256(JSON.stringify(current))!==state.entries[name]) throw new Error(`MCP conflict: managed ${name} edited or removed.`);
      } else if (current!==undefined) throw new Error(`MCP conflict: ${name} already exists.`);
      content=applyEdits(content,modify(content,[section,name],entries[name],{formattingOptions:{insertSpaces:true,tabSize:2,eol:'\n'}}));
    }
  }
  files.push({path,content,...(original!==undefined?{expectedHash:sha256(original)}:{})});
  files.push({path:statePath,content:JSON.stringify(next,null,2)+'\n'});
  return {files,pending};
}
