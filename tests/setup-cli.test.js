import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),cli=join(import.meta.dirname,'../dist/cli/index.js');
const fixture={schemaVersion:1,platform:'claude',suite:'backend',tracker:'none',skills:[],mcps:[],decisionSupport:{mode:'off'}};
test('setup dry-run is side-effect-free; apply and replay preserve suite and skills add',async()=>{
  const root=await mkdtemp(join(tmpdir(),'setup-cli-'));
  await writeFile(join(root,'input.json'),JSON.stringify(fixture));
  const run=async(args)=>JSON.parse((await exec(process.execPath,[cli,...args],{cwd:root})).stdout);
  const dry=await run(['setup','--config','input.json','--dry-run']);
  assert.equal(dry.dryRun,true); assert.deepEqual(await readdir(root),['input.json']);
  await run(['setup','--config','input.json','--yes']);
  const second=await run(['setup','--config','input.json','--yes']);
  assert.equal(second.creates.length,0);assert.equal(second.updates.length,0);
  await run(['skills','add','functional-review','--platform','claude']);
  const preview=await run(['update','--dry-run']);
  assert.equal(preview.creates.length,0);assert.equal(preview.updates.length,0);
  assert.equal(preview.config.agents.includes('global-frontend-developer'),false);
});
test('setup rejects non-TTY without config, unknown flags and missing option values promptly',async()=>{
  for (const args of [['setup'],['setup','--wat'],['setup','--config','--yes']]) {
    await assert.rejects(exec(process.execPath,[cli,...args],{timeout:3000}),e=>/--config|Unknown|value/.test(e.stderr));
  }
});
test('wizard collects suite/MCP/skills/JEV and cancellation leaves no configuration',async()=>{
  const {collectAnswers}=await import('../dist/setup/wizard.js');
  const manifest=JSON.parse(await readFile(join(import.meta.dirname,'../catalog/manifest.json'),'utf8'));
  const answers=['1','2','','3','1','', '2','no'];
  const result=await collectAnswers(async()=>answers.shift(),manifest);
  assert.equal(result.platform,'codex'); assert.equal(result.suite,'backend');
  assert.deepEqual(result.mcps,['github','jev']);assert.equal(result.decisionSupport.mode,'shadow');
  await assert.rejects(collectAnswers(async()=>undefined,manifest),/cancel/i);
});
