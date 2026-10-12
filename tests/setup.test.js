import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderCodex } from '../dist/adapters/codex/render.js';
import { renderClaude } from '../dist/adapters/claude/render.js';
import { renderOpenCode } from '../dist/adapters/opencode/render.js';
import { renderPi } from '../dist/adapters/pi/render.js';
const catalogRoot = join(import.meta.dirname, '../catalog');
const manifest = JSON.parse(await readFile(join(catalogRoot, 'manifest.json'), 'utf8'));
const input = {schemaVersion:1, platform:'codex', suite:'backend', tracker:'none', skills:[], mcps:[], decisionSupport:{mode:'off'}};

test('setup config normalizes known legacy ids and validates an optional project prefix', async () => {
  const {resolveConfig} = await import('../dist/setup/config.js');
  const legacyManifest = structuredClone(manifest);
  legacyManifest.agents = legacyManifest.agents.map(agent => ({...agent, id:agent.id.replace(/^global-/, '')}));
  const canonical = resolveConfig({...input, agents:['global-backend-developer']}, legacyManifest);
  assert.deepEqual(canonical.agents, ['backend-developer']);
  assert.equal(canonical.agentPrefix, '');
  assert.equal(resolveConfig({...input, agents:['backend-developer'], agentPrefix:'acme-team'}, legacyManifest).agentPrefix, 'acme-team');
  for (const agentPrefix of ['../escape', 'a/b', 'two words', 'Bad']) {
    assert.throws(() => resolveConfig({...input, agentPrefix}, legacyManifest), /prefix/i);
  }
  assert.throws(() => resolveConfig({...input, agents:['global-unknown-agent']}, legacyManifest), /agent/i);
});

test('catalog agent identifiers and source paths use canonical unprefixed names', () => {
  assert.ok(manifest.agents.every(agent => !agent.id.startsWith('global-')));
  assert.ok(manifest.agents.every(agent => !agent.path.split('/').at(-1).startsWith('global-')));
});

test('backend selection renders only its requested roles on each platform', async () => {
  for (const render of [renderCodex, renderClaude, renderOpenCode, renderPi]) {
    const files = await render({catalogRoot, selectedAgents:['backend-developer'], selectedSkills:[]});
    assert.equal(files.some(f => /frontend-developer\.(md|toml)$/.test(f.path)), false);
    assert.equal(files.some(f => /backend-developer\.(md|toml)$/.test(f.path)), true);
  }
});
test('preset resolution includes role skill dependencies and rejects invalid configuration', async () => {
  const {resolveConfig} = await import('../dist/setup/config.js');
  const resolved = resolveConfig(input, manifest);
  assert.equal(resolved.agents.includes('frontend-developer'), false);
  assert.equal(resolved.skills.includes('developer-task-execution'), true);
  assert.throws(() => resolveConfig({...input, platform:'unknown'}, manifest), /platform/);
  assert.throws(() => resolveConfig({...input, unexpected:'value'}, manifest), /Unknown/);
  assert.throws(() => resolveConfig({...input, suite:'custom', agents:['missing']}, manifest), /agent/);
});
test('prepared setup writes configuration and only selected roles and is idempotent', async () => {
  const {resolveConfig} = await import('../dist/setup/config.js');
  const {prepareSetup} = await import('../dist/setup/install.js');
  const {applyInstall} = await import('../dist/install/engine.js');
  const root = await mkdtemp(join(tmpdir(), 'setup-'));
  const config = resolveConfig(input, manifest);
  const prepared = await prepareSetup(root,catalogRoot,config);
  await applyInstall({root,catalogVersion:manifest.catalogVersion,files:prepared.files});
  const second = await prepareSetup(root,catalogRoot,config);
  const plan = await applyInstall({root,catalogVersion:manifest.catalogVersion,files:second.files});
  assert.equal(plan.creates.length,0);
  assert.equal(plan.updates.length,0);
  assert.equal(plan.conflicts.length,0);
  assert.equal((await readdir(join(root,'.codex/agents'))).includes('aws-specialist.toml'),false);
  assert.equal(JSON.parse(await readFile(join(root,'agents-cli.config.json'),'utf8')).suite,'backend');
});
test('changing suite removes only unchanged managed roles and preserves edited roles as conflicts',async()=>{
  const {resolveConfig}=await import('../dist/setup/config.js');
  const {prepareSetup}=await import('../dist/setup/install.js');
  const {applyInstall}=await import('../dist/install/engine.js');
  const root=await mkdtemp(join(tmpdir(),'suite-change-'));
  const first=await prepareSetup(root,catalogRoot,resolveConfig(input,manifest));
  await applyInstall({root,catalogVersion:'test',files:first.files});
  const second=await prepareSetup(root,catalogRoot,resolveConfig({...input,suite:'review-qa'},manifest));
  await applyInstall({root,catalogVersion:'test',files:second.files});
  assert.equal((await readdir(join(root,'.codex/agents'))).includes('backend-developer.toml'),false);
});

test('migrates unchanged locked 0.4.1 agent paths and preserves foreign legacy files', async()=>{
  const {resolveConfig}=await import('../dist/setup/config.js');
  const {prepareSetup}=await import('../dist/setup/install.js');
  const {applyInstall}=await import('../dist/install/engine.js');
  const root=await mkdtemp(join(tmpdir(),'legacy-migrate-'));
  const oldPath='.codex/agents/global-backend-developer.toml';
  const foreignPath='.codex/agents/global-foreign.md';
  await mkdir(join(root,'.codex/agents'),{recursive:true});
  await writeFile(join(root,foreignPath),'user-owned\n');
  await applyInstall({root,catalogVersion:'0.4.1',files:[{path:oldPath,content:'managed legacy\n'}]});
  const config=resolveConfig({...input,agents:['global-backend-developer'],agentPrefix:'acme'},manifest);
  const prepared=await prepareSetup(root,catalogRoot,config);
  const preview=await applyInstall({root,catalogVersion:'test',files:prepared.files,dryRun:true});
  assert.ok(preview.removes.some(file=>file.path===oldPath));
  assert.ok(preview.creates.some(file=>file.path==='.codex/agents/acme-backend-developer.toml'));
  assert.equal(await readFile(join(root,foreignPath),'utf8'),'user-owned\n');
  assert.equal((await applyInstall({root,catalogVersion:'test',files:prepared.files})).conflicts.length,0);
  assert.equal(await readFile(join(root,foreignPath),'utf8'),'user-owned\n');
  assert.equal(await readFile(join(root,'.codex/agents/acme-backend-developer.toml'),'utf8').then(Boolean),true);
});

test('preserves edited locked legacy files and dry-run does not migrate them', async()=>{
  const {resolveConfig}=await import('../dist/setup/config.js');
  const {prepareSetup}=await import('../dist/setup/install.js');
  const {applyInstall}=await import('../dist/install/engine.js');
  const root=await mkdtemp(join(tmpdir(),'legacy-conflict-'));
  const oldPath='.codex/agents/global-backend-developer.toml';
  await applyInstall({root,catalogVersion:'0.4.1',files:[{path:oldPath,content:'managed legacy\n'}]});
  await writeFile(join(root,oldPath),'user edit\n');
  const config=resolveConfig({...input,agents:['global-backend-developer'],agentPrefix:'acme'},manifest);
  const prepared=await prepareSetup(root,catalogRoot,config);
  const preview=await applyInstall({root,catalogVersion:'test',files:prepared.files,dryRun:true});
  assert.ok(preview.conflicts.includes(oldPath));
  assert.equal(preview.creates.some(file=>file.path==='.codex/agents/acme-backend-developer.toml'),true);
  const applied=await applyInstall({root,catalogVersion:'test',files:prepared.files});
  assert.ok(applied.conflicts.includes(oldPath));
  assert.equal(await readFile(join(root,oldPath),'utf8'),'user edit\n');
  assert.equal(await readFile(join(root,'.codex/agents/acme-backend-developer.toml')).then(()=>true,()=>false),false);
});
