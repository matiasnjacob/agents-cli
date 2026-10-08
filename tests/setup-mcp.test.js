import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,symlink,access,chmod,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parse} from 'jsonc-parser';
import {applyInstall} from '../dist/install/engine.js';
test('merges JSONC MCP entries without losing comments or user config; detects entry edits', async()=>{
  const {prepareMcp} = await import('../dist/setup/mcp.js');
  const root=await mkdtemp(join(tmpdir(),'mcp-'));
  await writeFile(join(root,'opencode.jsonc'),'{\n // user comment\n "model":"keep", "mcp":{"other":{"type":"remote","url":"https://example.org"}}\n}\n');
  const config={platform:'opencode',mcps:['github'],decisionSupport:{mode:'off'}};
  const first=await prepareMcp(root,config);
  await applyInstall({root,catalogVersion:'test',files:first.files});
  const current=await readFile(join(root,'opencode.jsonc'),'utf8');
  assert.match(current,/user comment/); assert.equal(parse(current).model,'keep');
  assert.match(current,/api.githubcopilot.com/);
  await writeFile(join(root,'opencode.jsonc'),current.replace(/"model":\s*"keep"/,'"model":"changed"'));
  const second=await prepareMcp(root,config);
  await applyInstall({root,catalogVersion:'test',files:second.files});
  assert.equal(parse(await readFile(join(root,'opencode.jsonc'),'utf8')).model,'changed');
  await writeFile(join(root,'opencode.jsonc'),current.replace('api.githubcopilot.com','malicious.example'));
  await assert.rejects(prepareMcp(root,config),/conflict/i);
});
test('rejects unmanaged MCP name collisions and reports Pi/Trello pending',async()=>{
  const {prepareMcp}=await import('../dist/setup/mcp.js');
  const root=await mkdtemp(join(tmpdir(),'mcp-'));
  await writeFile(join(root,'.mcp.json'),JSON.stringify({mcpServers:{'agents-cli-github':{url:'https://other'}}}));
  await assert.rejects(prepareMcp(root,{platform:'claude',mcps:['github']}),/conflict/i);
  assert.equal((await prepareMcp(root,{platform:'pi',mcps:['github','trello']})).pending.length,2);
});
test('rejects symlink ancestors before writes outside root',async()=>{
  const root=await mkdtemp(join(tmpdir(),'safe-')), outside=await mkdtemp(join(tmpdir(),'outside-'));
  await symlink(outside,join(root,'config'));
  await assert.rejects(applyInstall({root,catalogVersion:'test',files:[{path:'config/escape',content:'bad'}]}),/symlink/i);
  await assert.rejects(access(join(outside,'escape')));
});
test('write failure restores previous files and removes newly created files',async()=>{
  const root=await mkdtemp(join(tmpdir(),'rollback-'));
  await applyInstall({root,catalogVersion:'test',files:[{path:'a',content:'old'}]});
  await assert.rejects(applyInstall({root,catalogVersion:'test',files:[{path:'a',content:'new'},{path:'created',content:'new'},{path:'created/child',content:'fail'}]}));
  assert.equal(await readFile(join(root,'a'),'utf8'),'old');
  await assert.rejects(access(join(root,'created')));
});
test('a preexisting temporary file is not removed when exclusive write fails',async()=>{
  const root=await mkdtemp(join(tmpdir(),'temp-owned-'));
  await writeFile(join(root,'agent.md.agents-cli-tmp'),'user-owned');
  await assert.rejects(applyInstall({root,catalogVersion:'test',files:[{path:'agent.md',content:'new'}]}));
  assert.equal(await readFile(join(root,'agent.md.agents-cli-tmp'),'utf8'),'user-owned');
});
test('MCP configuration is repeatable for every native platform without secret expansion',async()=>{
  const {prepareMcp}=await import('../dist/setup/mcp.js');
  for (const platform of ['codex','claude','opencode']) {
    const root=await mkdtemp(join(tmpdir(),'mcp-repeat-')),config={platform,mcps:['github','linear','jev']};
    const one=await prepareMcp(root,config);await applyInstall({root,catalogVersion:'test',files:one.files});
    const two=await prepareMcp(root,config);const result=await applyInstall({root,catalogVersion:'test',files:two.files});
    assert.equal(result.updates.length,0);assert.equal(result.conflicts.length,0);
    assert.equal(one.files.some(f=>f.content.includes('GITHUB_TOKEN')),true);
  }
});
test('replacing a private MCP configuration preserves its restrictive file mode',async()=>{
  const {prepareMcp}=await import('../dist/setup/mcp.js');
  const root=await mkdtemp(join(tmpdir(),'mcp-mode-')),path=join(root,'.mcp.json');
  await writeFile(path,'{"mcpServers":{"existing":{"token":"local-secret"}}}\n',{mode:0o600});await chmod(path,0o600);
  const prepared=await prepareMcp(root,{platform:'claude',mcps:['github']});
  await applyInstall({root,catalogVersion:'test',files:prepared.files});
  assert.equal((await stat(path)).mode&0o777,0o600);
});
