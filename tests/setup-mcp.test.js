import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,symlink,access} from 'node:fs/promises';
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
