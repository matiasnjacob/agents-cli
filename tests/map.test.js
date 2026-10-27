import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),cli=join(import.meta.dirname,'../dist/cli/index.js'),catalog=join(import.meta.dirname,'../catalog');
const config={schemaVersion:1,platforms:['claude','codex'],suite:'complete',tracker:'none',skills:[],mcps:['github','engram'],decisionSupport:{mode:'off'}};
async function installed() {
  const root=await mkdtemp(join(tmpdir(),'map-'));
  await writeFile(join(root,'input.json'),JSON.stringify(config));
  await exec(process.execPath,[cli,'setup','--config','input.json','--yes'],{cwd:root,env:{...process.env,HOME:root}});
  return root;
}
const run=(root,args)=>exec(process.execPath,[cli,'map',...args],{cwd:root});
test('map reports agents, skills, MCP servers, hooks and weight for every installed platform',async()=>{
  const root=await installed();
  try {
    const map=JSON.parse((await run(root,['--format','json'])).stdout);
    assert.deepEqual(map.platforms,['claude','codex']);
    assert.ok(map.nodes.some(n=>n.id==='claude:agent:orchestrator' && n.tokens>0));
    assert.ok(map.nodes.some(n=>n.id==='codex:skill:brainstorming' && n.tokens>0));
    assert.ok(map.nodes.some(n=>n.id==='mcp:agents-cli-github'));
    assert.ok(map.nodes.some(n=>n.id==='claude:hook:Stop'));
    assert.ok(map.edges.some(e=>e.from==='claude:agent:orchestrator' && e.to==='claude:skill:orchestrator-governance' && e.kind==='loads'));
    assert.ok(map.edges.some(e=>e.from==='claude:agent:orchestrator' && e.to==='mcp:agents-cli-github' && e.kind==='uses'));
    assert.deepEqual(map.issues.filter(i=>i.severity==='warn'),[]);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('map renders Mermaid and Graphviz dot and honors --platform',async()=>{
  const root=await installed();
  try {
    const mermaid=(await run(root,['--format','mermaid'])).stdout;
    assert.match(mermaid,/^flowchart LR/);assert.match(mermaid,/subgraph claude\[/);assert.match(mermaid,/subgraph codex\[/);assert.match(mermaid,/-->\|loads\|/);
    const dot=(await run(root,['--format','dot','--platform','codex'])).stdout;
    assert.match(dot,/^digraph agents/);assert.match(dot,/cluster_codex/);assert.doesNotMatch(dot,/cluster_claude/);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('map flags a skill listed in the manifest but missing on disk, and never reads user hooks or MCP commands',async()=>{
  const root=await installed();
  try {
    await rm(join(root,'.claude/skills/engram-session'),{recursive:true});
    await writeFile(join(root,'.claude/settings.json'),JSON.stringify({hooks:{Stop:[{hooks:[{type:'command',command:'echo user-secret-hook'}]}]}}));
    const out=(await run(root,['--format','json'])).stdout;
    const map=JSON.parse(out);
    assert.ok(map.issues.some(i=>i.severity==='warn' && /engram-session.*missing/.test(i.message)));
    assert.equal(out.includes('user-secret-hook'),false);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('map without an installation says so, and invalid options are rejected',async()=>{
  const root=await mkdtemp(join(tmpdir(),'map-empty-'));
  try {
    assert.deepEqual(JSON.parse((await run(root,['--format','json'])).stdout).platforms,[]);
    for (const args of [['--format','svg'],['--wat'],['--platform'],['--platform','nope']]) await assert.rejects(run(root,args),e=>/Invalid|Unknown|requires/.test(e.stderr));
  } finally {await rm(root,{recursive:true,force:true});}
});
test('formatMap prints a readable summary without ANSI when styling is off',async()=>{
  const {buildMap,formatMap}=await import('../dist/setup/map.js');
  const root=await installed();
  try {
    const text=formatMap(await buildMap(root,catalog));
    assert.match(text,/claude: 7 agent\(s\), 9 skill\(s\)/);assert.match(text,/every agent loads:/);assert.match(text,/No broken links found/);
    assert.equal(text.includes('\u001b'),false);
  } finally {await rm(root,{recursive:true,force:true});}
});
