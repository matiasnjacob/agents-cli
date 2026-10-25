import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { renderCodex } from '../adapters/codex/render.js';
import { renderClaude } from '../adapters/claude/render.js';
import { renderOpenCode } from '../adapters/opencode/render.js';
import { renderPi } from '../adapters/pi/render.js';
import { readCatalog, renderSkillFiles } from '../catalog/skills.js';
import {sha256,assertNoSymlinks,LOCKFILE, type InstallFile } from '../install/engine.js';
import type {Platform} from '../contract.js';
import { skillIds, type SetupConfig } from './config.js';
import {mcpCatalog,prepareMcp} from './mcp.js';
import {resolveExternalSkill} from './external.js';
import {prepareHooks} from './hooks.js';

export type Progress=(message:string)=>void;

async function preparePlatform(root:string,catalogRoot:string,config:SetupConfig,platform:Platform,progress:Progress) {
  const render={codex:renderCodex,claude:renderClaude,opencode:renderOpenCode,pi:renderPi}[platform];
  progress(`${platform}: rendering agents and skills`);
  const files=await render({catalogRoot,selectedAgents:config.agents,selectedSkills:skillIds(config),agentPrefix:config.agentPrefix,...(platform==='claude'?{selectedMcpServers:config.mcps.filter(id=>mcpCatalog.find(entry=>entry.id===id)?.platforms.includes('claude')).map(id=>`agents-cli-${id}`)}:{})});
  files.push(...await renderSkillFiles(catalogRoot,await readCatalog(catalogRoot),config.skills.filter((s):s is string=>typeof s==='string'),platform));
  const provenance=[];
  for (const source of config.skills) if (typeof source!=='string') {
    progress(`${platform}: fetching external skill ${source.id} (${source.repository}@${source.revision.slice(0,7)})`);
    const external=await resolveExternalSkill(source,platform);
    files.push(...external.files); provenance.push(external.provenance);
  }
  progress(`${platform}: configuring MCP integrations`);
  const mcp=await prepareMcp(root,{platform,mcps:config.mcps});
  files.push(...mcp.files);
  const pending=mcp.pending.map(message=>config.platforms.length>1?`[${platform}] ${message}`:message);
  return {files,pending,provenance};
}

export async function prepareSetup(root:string,catalogRoot:string,config:SetupConfig,progress:Progress=()=>{}): Promise<{files:InstallFile[];pending:string[]}> {
  const files:InstallFile[]=[],pending:string[]=[],provenance:unknown[]=[];
  for (const platform of config.platforms) {
    const prepared=await preparePlatform(root,catalogRoot,config,platform,progress);
    files.push(...prepared.files); pending.push(...prepared.pending); provenance.push(...prepared.provenance);
  }
  const hooks=await prepareHooks(root,config);
  files.push(...hooks.files); pending.push(...hooks.pending);
  if (provenance.length) files.push({path:'.agents/external-skills.json',content:JSON.stringify({schemaVersion:1,skills:provenance},null,2)+'\n'});
  let current:string|undefined;
  await assertNoSymlinks(root,'agents-cli.config.json');
  try {current=await readFile(join(root,'agents-cli.config.json'),'utf8');} catch(e) {if ((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;}
  files.push({path:'agents-cli.config.json',content:JSON.stringify(config,null,2)+'\n',...(current!==undefined?{expectedHash:sha256(current)}:{})});
  if (config.tracker!=='none') {
    files.push({path:`.agents/workflows/${config.tracker}-story.md`,content:await readFile(join(catalogRoot,'workflows',`${config.tracker}-story.md`),'utf8')});
    if (!config.mcps.includes(config.tracker)) pending.push(`Tracker ${config.tracker}: MCP not selected; configure authentication separately.`);
  }
  progress('checking previously managed files');
  await assertNoSymlinks(root,LOCKFILE);
  let lock:{files:Record<string,string>}|undefined;
  try {lock=JSON.parse(await readFile(join(root,LOCKFILE),'utf8'));} catch(e) {if ((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;}
  const desired=new Set(files.map(f=>f.path));
  const legacyPaths:string[]=[];
  for (const platform of config.platforms) {
    const legacyExtension=platform==='codex'?'toml':'md';
    for (const source of (await readdir(join(catalogRoot,'agents'))).filter(path=>path.endsWith('.md'))) {
      const path=`.${platform}/agents/global-${source.slice(0,-3)}.${legacyExtension}`;
      await assertNoSymlinks(root,path);
      try {await readFile(join(root,path));legacyPaths.push(path);} catch(error) {if ((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;}
    }
  }
  const managed=[...config.platforms.flatMap(platform=>[`.${platform}/agents/`,`.${platform}/skills/`]),'.agents/workflows/'];
  for (const path of new Set([...Object.keys(lock?.files ?? {}),...legacyPaths])) {
    if ((managed.some(prefix=>path.startsWith(prefix)) || path==='.agents/external-skills.json') && !desired.has(path)) files.push({path,content:'',remove:true});
  }
  return {files,pending};
}
