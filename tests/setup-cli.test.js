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
test('wizard presents keyboard prompts, preserves preset dependencies, captures prefix, and cancels cleanly',async()=>{
  const {collectAnswers,renderWelcomeBanner}=await import('../dist/setup/wizard.js');
  const manifest=JSON.parse(await readFile(join(import.meta.dirname,'../catalog/manifest.json'),'utf8'));
  const cancel=Symbol('cancel');
  const results=['codex','backend','acme',['orchestrator','backend-developer'],'none',['github'],['orchestrator-governance'],'shadow',''];
  const calls=[];
  const prompts={
    intro:value=>calls.push(['intro',value]),
    select:async options=>{calls.push(['select',options]);return results.shift()},
    multiselect:async options=>{calls.push(['multiselect',options]);return results.shift()},
    text:async options=>{calls.push(['text',options]);return results.shift()},
    isCancel:value=>value===cancel,
    cancel:message=>calls.push(['cancel',message]),
    log:{info:message=>calls.push(['info',message])},
  };
  const result=await collectAnswers(manifest,undefined,prompts,{columns:10});
  assert.equal(result.platform,'codex'); assert.equal(result.suite,'backend');
  assert.deepEqual(result.agents,['orchestrator','backend-developer']);
  assert.equal(result.agentPrefix,'acme');
  assert.ok(result.skills.includes('developer-task-execution'));
  assert.deepEqual(result.mcps,['github','jev']);assert.equal(result.decisionSupport.mode,'shadow');
  assert.equal(calls.filter(([kind])=>kind==='intro').length,1);
  assert.ok(calls.some(([kind,message])=>kind==='info'&&/Space.*Enter/.test(message)));
  assert.ok(calls.find(([kind])=>kind==='multiselect')[1].options.some(option=>option.label==='acme-orchestrator'));
  assert.match(calls.find(([kind])=>kind==='text')[1].validate('a/b'),/prefix/i);
  assert.equal(calls.filter(([kind])=>kind==='multiselect').length,3);
  assert.ok(renderWelcomeBanner(10).includes('Agents-Cli'));
  assert.ok(renderWelcomeBanner(10).includes('Matias Jacob'));
  assert.equal(renderWelcomeBanner(10).split('\n')[0].length,renderWelcomeBanner(10).split('\n').at(-1).length);
  const canceled={...prompts,select:async()=>cancel};
  await assert.rejects(collectAnswers(manifest,undefined,canceled),/cancel/i);
});
