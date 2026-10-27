import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {readCatalog,listSkills} from '../catalog/skills.js';
import {createStyle,type Style} from './ui.js';

const PLATFORMS=['claude','codex','opencode','pi'] as const;
type MapPlatform=typeof PLATFORMS[number];
export type MapFormat='text'|'mermaid'|'dot'|'json';

export interface MapNode {id:string;kind:'agent'|'skill'|'mcp'|'hook';label:string;platform?:string;tokens?:number}
/** An edge from `<platform>:agent:*` means every agent on that platform (MCP config is per platform, not per agent). */
export interface MapEdge {from:string;to:string;kind:'loads'|'mentions'|'uses'|'fires'}
export interface MapIssue {severity:'warn'|'info';node:string;message:string}
export interface HarnessMap {platforms:string[];nodes:MapNode[];edges:MapEdge[];issues:MapIssue[];tokens:Record<string,number>}

async function text(path:string):Promise<string|undefined> {
  try {
    if (!(await lstat(path)).isFile()) return;
    return await readFile(path,'utf8');
  } catch {return;}
}

async function json(path:string):Promise<unknown> {
  const raw=await text(path);
  if (raw===undefined) return;
  try {return JSON.parse(raw);} catch {return;}
}

const tokens=(bytes:number)=>Math.ceil(bytes/4);
const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[];
const mentions=(body:string,id:string)=>new RegExp(`(?<![\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\w-])`).test(body);

function claudeMcpServers(body:string):string[] {
  const line=/^mcpServers:\s*(\[.*\])\s*$/m.exec(body)?.[1];
  if (!line) return [];
  try {return strings(JSON.parse(line));} catch {return [];}
}

/** Read-only map of what is installed: agents, skills, MCP servers and managed hooks, with their links and weight. */
export async function buildMap(root:string,catalogRoot:string,only?:string):Promise<HarnessMap> {
  const catalogSkills=listSkills(await readCatalog(catalogRoot)).map(skill=>skill.id);
  const map:HarnessMap={platforms:[],nodes:[],edges:[],issues:[],tokens:{}};
  const mcpNodes=new Set<string>();
  for (const platform of PLATFORMS) {
    if (only && platform!==only) continue;
    const manifest=await json(join(root,`.${platform}`,'agents','manifest.json')) as {agents?:unknown;skills?:unknown}|undefined;
    if (!manifest) continue;
    map.platforms.push(platform);
    let total=0;
    const agents=strings(manifest.agents),skills=strings(manifest.skills);
    const bodies=new Map<string,string>();
    for (const id of skills) {
      const body=await text(join(root,`.${platform}`,'skills',id,'SKILL.md'));
      const node:MapNode={id:`${platform}:skill:${id}`,kind:'skill',label:id,platform,...(body===undefined?{}:{tokens:tokens(Buffer.byteLength(body))})};
      if (body===undefined) map.issues.push({severity:'warn',node:node.id,message:`${id} is listed in .${platform}/agents/manifest.json but .${platform}/skills/${id}/SKILL.md is missing.`});
      else {bodies.set(node.id,body);total+=tokens(Buffer.byteLength(body));}
      map.nodes.push(node);
    }
    for (const name of agents) {
      const body=await text(join(root,`.${platform}`,'agents',`${name}.${platform==='codex'?'toml':'md'}`));
      const node:MapNode={id:`${platform}:agent:${name}`,kind:'agent',label:name,platform,...(body===undefined?{}:{tokens:tokens(Buffer.byteLength(body))})};
      if (body===undefined) map.issues.push({severity:'warn',node:node.id,message:`${name} is listed in .${platform}/agents/manifest.json but its file is missing.`});
      else {bodies.set(node.id,body);total+=tokens(Buffer.byteLength(body));}
      map.nodes.push(node);
    }
    for (const [from,body] of bodies) {
      for (const id of new Set([...catalogSkills,...skills])) {
        if (from===`${platform}:skill:${id}` || !mentions(body,id)) continue;
        if (skills.includes(id)) map.edges.push({from,to:`${platform}:skill:${id}`,kind:from.includes(':agent:')?'loads':'mentions'});
        else map.issues.push({severity:'warn',node:from,message:`${from.split(':').pop()} refers to skill '${id}', which is not installed for ${platform}.`});
      }
    }
    for (const skill of skills) {
      const id=`${platform}:skill:${skill}`;
      if (!map.edges.some(edge=>edge.to===id)) map.issues.push({severity:'info',node:id,message:`${skill} is not referenced by any agent or skill; it only loads when a task matches its description.`});
    }
    const state=await json(join(root,'.agents',`mcp-state-${platform}.json`)) as {entries?:Record<string,unknown>}|undefined;
    const servers=Object.keys(state?.entries ?? {});
    for (const server of servers) {
      if (!mcpNodes.has(server)) {mcpNodes.add(server);map.nodes.push({id:`mcp:${server}`,kind:'mcp',label:server});}
      if (platform!=='claude') map.edges.push({from:`${platform}:agent:*`,to:`mcp:${server}`,kind:'uses'});
    }
    if (platform==='claude') {
      for (const name of agents) {
        const body=bodies.get(`claude:agent:${name}`);
        if (body===undefined) continue;
        for (const server of claudeMcpServers(body)) {
          if (servers.includes(server)) map.edges.push({from:`claude:agent:${name}`,to:`mcp:${server}`,kind:'uses'});
          else map.issues.push({severity:'warn',node:`claude:agent:${name}`,message:`${name} requests MCP server '${server}', which agents-cli did not install; it works only if you configured it yourself.`});
        }
      }
      const hooks=await json(join(root,'.agents','hooks-state-claude.json')) as {entries?:{event?:unknown;command?:unknown}[]}|undefined;
      for (const entry of hooks?.entries ?? []) {
        if (typeof entry.event!=='string') continue;
        map.nodes.push({id:`claude:hook:${entry.event}`,kind:'hook',label:`${entry.event} hook`,platform:'claude'});
      }
    }
    map.tokens[platform]=total;
  }
  return map;
}

function mermaidId(id:string,ids:Map<string,string>):string {
  if (!ids.has(id)) ids.set(id,`n${ids.size}`);
  return ids.get(id)!;
}

const quote=(value:string)=>value.replace(/"/g,"'");

/** A platform-wide `uses` edge stands for "every agent on that platform"; draw it from the platform's first agent only once. */
function drawable(map:HarnessMap):MapEdge[] {
  return map.edges.map(edge=>{
    if (!edge.from.endsWith(':agent:*')) return edge;
    const platform=edge.from.split(':')[0];
    const first=map.nodes.find(node=>node.kind==='agent' && node.platform===platform);
    return first?{...edge,from:first.id}:edge;
  });
}

export function renderMermaid(map:HarnessMap):string {
  const ids=new Map<string,string>();
  const lines=['flowchart LR'];
  for (const platform of map.platforms) {
    lines.push(`  subgraph ${platform}["${platform} · ~${map.tokens[platform] ?? 0} tokens"]`);
    for (const node of map.nodes.filter(item=>item.platform===platform)) {
      const label=`${quote(node.label)}${node.tokens===undefined?'':` · ${node.tokens}t`}`;
      lines.push(`    ${mermaidId(node.id,ids)}${node.kind==='agent'?`["${label}"]`:node.kind==='hook'?`(["${label}"])`:`("${label}")`}`);
    }
    lines.push('  end');
  }
  for (const node of map.nodes.filter(item=>item.kind==='mcp')) lines.push(`  ${mermaidId(node.id,ids)}[["${quote(node.label)}"]]`);
  for (const edge of drawable(map)) lines.push(`  ${mermaidId(edge.from,ids)} -->|${edge.kind}| ${mermaidId(edge.to,ids)}`);
  lines.push('  classDef agent fill:#e3f2fd,stroke:#1565c0;','  classDef skill fill:#fff3e0,stroke:#ef6c00;','  classDef mcp fill:#e8f5e9,stroke:#2e7d32;','  classDef hook fill:#fce4ec,stroke:#ad1457;');
  for (const [id,short] of ids) {
    const kind=map.nodes.find(node=>node.id===id)?.kind;
    if (kind) lines.push(`  class ${short} ${kind}`);
  }
  return lines.join('\n');
}

export function renderDot(map:HarnessMap):string {
  const ids=new Map<string,string>();
  const lines=['digraph agents {','  rankdir=LR;','  node [shape=box, style=rounded];'];
  const shape={agent:'box',skill:'ellipse',mcp:'component',hook:'hexagon'} as const;
  for (const platform of map.platforms) {
    lines.push(`  subgraph cluster_${platform} {`,`    label="${platform} · ~${map.tokens[platform] ?? 0} tokens";`);
    for (const node of map.nodes.filter(item=>item.platform===platform)) lines.push(`    ${mermaidId(node.id,ids)} [label="${quote(node.label)}${node.tokens===undefined?'':`\\n${node.tokens}t`}", shape=${shape[node.kind]}];`);
    lines.push('  }');
  }
  for (const node of map.nodes.filter(item=>item.kind==='mcp')) lines.push(`  ${mermaidId(node.id,ids)} [label="${quote(node.label)}", shape=${shape.mcp}];`);
  for (const edge of drawable(map)) lines.push(`  ${mermaidId(edge.from,ids)} -> ${mermaidId(edge.to,ids)} [label="${edge.kind}"];`);
  lines.push('}');
  return lines.join('\n');
}

export function formatMap(map:HarnessMap,style:Style=createStyle(false)):string {
  if (!map.platforms.length) return [style.heading('agents-cli map'),style.warn('No agents-cli installation found here; run `agents-cli setup` first.')].join('\n');
  const lines=[style.heading('agents-cli map')];
  for (const platform of map.platforms) {
    const agents=map.nodes.filter(node=>node.platform===platform && node.kind==='agent');
    const skills=map.nodes.filter(node=>node.platform===platform && node.kind==='skill');
    lines.push(style.step(`${platform}: ${agents.length} agent(s), ${skills.length} skill(s), ~${map.tokens[platform] ?? 0} tokens when an agent and all its skills are loaded`));
    const loads=(agent:MapNode)=>map.edges.filter(edge=>edge.from===agent.id && edge.kind==='loads').map(edge=>edge.to.split(':').pop()!);
    const common=agents.length?loads(agents[0]).filter(id=>agents.every(agent=>loads(agent).includes(id))):[];
    if (common.length) lines.push(`      every agent loads: ${common.join(', ')}`);
    for (const agent of agents) {
      const extra=loads(agent).filter(id=>!common.includes(id));
      const servers=map.edges.filter(edge=>edge.from===agent.id && edge.kind==='uses').map(edge=>edge.to.split(':').pop());
      lines.push(`      ${agent.label}${agent.tokens===undefined?'':style.dim(` ~${agent.tokens}t`)}${extra.length?` → ${extra.join(', ')}`:''}${servers.length?style.dim(`  [mcp: ${servers.join(', ')}]`):''}`);
    }
    const heavy=[...skills].sort((a,b)=>(b.tokens ?? 0)-(a.tokens ?? 0)).slice(0,3).filter(skill=>skill.tokens!==undefined);
    if (heavy.length) lines.push(`      ${style.dim(`heaviest skills: ${heavy.map(skill=>`${skill.label} ~${skill.tokens}t`).join(', ')}`)}`);
    const hooks=map.nodes.filter(node=>node.platform===platform && node.kind==='hook');
    if (hooks.length) lines.push(`      ${style.dim(`managed hooks: ${hooks.map(hook=>hook.label).join(', ')}`)}`);
  }
  const mcps=map.nodes.filter(node=>node.kind==='mcp').map(node=>node.label);
  if (mcps.length) lines.push(style.step(`MCP servers installed by agents-cli: ${mcps.join(', ')}`));
  const warnings=map.issues.filter(issue=>issue.severity==='warn');
  const infos=map.issues.filter(issue=>issue.severity==='info');
  if (!warnings.length) lines.push(style.ok('No broken links found.'));
  for (const issue of warnings) lines.push(style.warn(issue.message));
  if (infos.length) lines.push(style.step(`${infos.length} skill(s) are not referenced by an agent or another skill (use --format json for details).`));
  lines.push('',`  Diagram: ${style.command('agents-cli map --format mermaid')} (paste into any Mermaid viewer) or ${style.command('--format dot')} (Graphviz).`);
  return lines.join('\n');
}
