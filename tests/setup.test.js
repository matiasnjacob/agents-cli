import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderCodex } from '../dist/adapters/codex/render.js';
import { renderClaude } from '../dist/adapters/claude/render.js';
import { renderOpenCode } from '../dist/adapters/opencode/render.js';
import { renderPi } from '../dist/adapters/pi/render.js';
const catalogRoot = join(import.meta.dirname, '../catalog');
const manifest = JSON.parse(await readFile(join(catalogRoot, 'manifest.json'), 'utf8'));
const input = {schemaVersion:1, platform:'codex', suite:'backend', tracker:'none', skills:[], mcps:[], decisionSupport:{mode:'off'}};

test('backend selection renders only its requested roles on each platform', async () => {
  for (const render of [renderCodex, renderClaude, renderOpenCode, renderPi]) {
    const files = await render({catalogRoot, selectedAgents:['global-backend-developer'], selectedSkills:[]});
    assert.equal(files.some(f => /global-frontend-developer\.(md|toml)$/.test(f.path)), false);
    assert.equal(files.some(f => /global-backend-developer\.(md|toml)$/.test(f.path)), true);
  }
});
test('preset resolution includes role skill dependencies and rejects invalid configuration', async () => {
  const {resolveConfig} = await import('../dist/setup/config.js');
  const resolved = resolveConfig(input, manifest);
  assert.equal(resolved.agents.includes('global-frontend-developer'), false);
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
  assert.equal((await readdir(join(root,'.codex/agents'))).includes('global-aws-specialist.toml'),false);
  assert.equal(JSON.parse(await readFile(join(root,'agents-cli.config.json'),'utf8')).suite,'backend');
});
