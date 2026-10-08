import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderCodex } from '../adapters/codex/render.js';
import { renderClaude } from '../adapters/claude/render.js';
import { renderOpenCode } from '../adapters/opencode/render.js';
import { renderPi } from '../adapters/pi/render.js';
import { readCatalog, renderSkillFiles } from '../catalog/skills.js';
import {sha256,assertNoSymlinks,LOCKFILE, type InstallFile } from '../install/engine.js';
import { skillIds, type SetupConfig } from './config.js';
import {prepareMcp} from './mcp.js';
import {resolveExternalSkill} from './external.js';
export async function prepareSetup(root:string,catalogRoot:string,config:SetupConfig): Promise<{files:InstallFile[];pending:string[]}> {
  const render={codex:renderCodex,claude:renderClaude,opencode:renderOpenCode,pi:renderPi}[config.platform];
  const files=await render({catalogRoot,selectedAgents:config.agents,selectedSkills:skillIds(config),...(config.platform==='claude'?{selectedMcpServers:config.mcps.map(id=>`agents-cli-${id}`)}:{})});
  files.push(...await renderSkillFiles(catalogRoot,await readCatalog(catalogRoot),config.skills.filter((s):s is string=>typeof s==='string'),config.platform));
  const provenance=[];
  for (const source of config.skills) if (typeof source!=='string') {
    const external=await resolveExternalSkill(source,config.platform);
    files.push(...external.files); provenance.push(external.provenance);
  }
  if (provenance.length) files.push({path:'.agents/external-skills.json',content:JSON.stringify({schemaVersion:1,skills:provenance},null,2)+'\n'});
  let current:string|undefined;
  await assertNoSymlinks(root,'agents-cli.config.json');
  try {current=await readFile(join(root,'agents-cli.config.json'),'utf8');} catch(e) {if ((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;}
  files.push({path:'agents-cli.config.json',content:JSON.stringify(config,null,2)+'\n',...(current!==undefined?{expectedHash:sha256(current)}:{})});
  const pending:string[]=[];
  const mcp=await prepareMcp(root,config);
  files.push(...mcp.files); pending.push(...mcp.pending);
  if (config.tracker!=='none') {
    files.push({path:`.agents/workflows/${config.tracker}-story.md`,content:await readFile(join(catalogRoot,'workflows',`${config.tracker}-story.md`),'utf8')});
    if (!config.mcps.includes(config.tracker)) pending.push(`Tracker ${config.tracker}: MCP not selected; configure authentication separately.`);
  }
  await assertNoSymlinks(root,LOCKFILE);
  let lock:{files:Record<string,string>}|undefined;
  try {lock=JSON.parse(await readFile(join(root,LOCKFILE),'utf8'));} catch(e) {if ((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;}
  const desired=new Set(files.map(f=>f.path));
  for (const path of Object.keys(lock?.files ?? {})) {
    if ((path.startsWith(`.${config.platform}/agents/`) || path.startsWith(`.${config.platform}/skills/`) || path.startsWith('.agents/workflows/') || path==='.agents/external-skills.json') && !desired.has(path)) files.push({path,content:'',remove:true});
  }
  return {files,pending};
}
