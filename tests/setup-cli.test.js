import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PassThrough,Writable} from 'node:stream';
import {SelectPrompt,isCancel as clackIsCancel} from '@clack/core';
const exec=promisify(execFile),cli=join(import.meta.dirname,'../dist/cli/index.js');
const fixture={schemaVersion:1,platform:'claude',suite:'backend',tracker:'none',skills:[],mcps:[],decisionSupport:{mode:'off'}};
test('setup preview summary lists selections, prefixed agents and every planned action',async()=>{
  const {formatSetupPreview}=await import('../dist/setup/command.js');
  const summary=formatSetupPreview({config:{platform:'codex',suite:'backend',agents:['backend-developer'],agentPrefix:'acme',tracker:'linear',mcps:['linear','jev'],skills:['developer-task-execution'],decisionSupport:{mode:'shadow'}},creates:['.codex/agents/acme-backend-developer.toml'],updates:['.codex/AGENTS.md'],removes:['.codex/agents/global-backend-developer.toml'],conflicts:['.codex/agents/custom.toml'],unchanged:['.codex/skills/developer-task-execution/SKILL.md']});
  for (const expected of ['acme-backend-developer','Tracker: linear','MCPs: linear, jev','Skills: developer-task-execution','JEV: shadow','CREATE .codex/agents/acme-backend-developer.toml','UPDATE .codex/AGENTS.md','REMOVE .codex/agents/global-backend-developer.toml','CONFLICT .codex/agents/custom.toml','UNCHANGED .codex/skills/developer-task-execution/SKILL.md']) assert.ok(summary.includes(expected),expected);
});
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
  assert.equal(preview.config.agents.includes('frontend-developer'),false);
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
  const results=[['codex','claude'],'backend','acme',['orchestrator','backend-developer'],'none',['github'],['orchestrator-governance'],'shadow',''];
  const [platformsAnswer,suiteAnswer,prefixAnswer,agentsAnswer,trackerAnswer,mcpAnswer,skillAnswer,modeAnswer,externalAnswer]=results;
  const selects=[suiteAnswer,trackerAnswer,modeAnswer],multis=[platformsAnswer,agentsAnswer,mcpAnswer,skillAnswer];
  results.splice(0,results.length,prefixAnswer,externalAnswer);
  const calls=[];
  const prompts={
    intro:value=>calls.push(['intro',value]),
    select:async options=>{calls.push(['select',options]);return selects.shift()},
    multiselect:async options=>{calls.push(['multiselect',options]);return multis.shift()},
    text:async options=>{calls.push(['text',options]);return results.shift()},
    isCancel:value=>value===cancel,
    cancel:message=>calls.push(['cancel',message]),
    log:{info:message=>calls.push(['info',message])},
  };
  const result=await collectAnswers(manifest,undefined,prompts,10);
  assert.deepEqual(result.platforms,['codex','claude']); assert.equal(result.suite,'backend');
  assert.deepEqual(result.agents,['orchestrator','backend-developer']);
  assert.equal(result.agentPrefix,'acme');
  assert.ok(result.skills.includes('developer-task-execution'));
  assert.deepEqual(result.mcps,['github','jev']);assert.equal(result.decisionSupport.mode,'shadow');
  assert.equal(calls.filter(([kind])=>kind==='intro').length,1);
  assert.ok(calls.some(([kind,message])=>kind==='info'&&/Space.*Enter/.test(message)));
  assert.ok(calls.filter(([kind])=>kind==='multiselect')[1][1].options.some(option=>option.label==='acme-orchestrator'));
  assert.equal(calls.find(([kind])=>kind==='text')[1].defaultValue,undefined);
  assert.match(calls.find(([kind])=>kind==='text')[1].validate('a/b'),/prefix/i);
  assert.equal(calls.filter(([kind])=>kind==='multiselect').length,4);
  assert.ok(result.skills.some(skill=>skill.id==='brainstorming'));
  assert.ok(calls.some(([kind,message])=>kind==='info'&&/Required skills:/.test(message)));
  assert.ok(renderWelcomeBanner(10).includes('Agents-Cli'));
  assert.ok(renderWelcomeBanner(10).includes('Matias Jacob'));
  assert.equal(renderWelcomeBanner(10).split('\n')[0].length,renderWelcomeBanner(10).split('\n').at(-1).length);
  assert.doesNotMatch(renderWelcomeBanner(10),/\u001b\[/);
  const clearSelects=['backend','none','off'],clearMultis=[['codex'],['backend-developer'],[],[]],clearResults=['',''];
  const clearPrompts={...prompts,select:async()=>clearSelects.shift(),multiselect:async()=>clearMultis.shift(),text:async options=>{const value=clearResults.shift();if(options.message.includes('prefix')) assert.equal(options.initialValue,'acme');return value;}};
  const previous={platforms:['codex'],suite:'backend',agents:['backend-developer'],agentPrefix:'acme',tracker:'none',skills:[],mcps:[],decisionSupport:{mode:'off'}};
  assert.equal((await collectAnswers(manifest,previous,clearPrompts,10)).agentPrefix,'');
  const canceled={...prompts,select:async()=>cancel,multiselect:async()=>cancel};
  await assert.rejects(collectAnswers(manifest,undefined,canceled),/cancel/i);
});

test('real Clack prompt exits cleanly when its input stream reaches EOF',async()=>{
  const {cancelPromptOnInputEnd}=await import('../dist/setup/wizard.js');
  const input=new PassThrough();
  input.isTTY=true;
  input.setRawMode=()=>input;
  const output=new Writable({write(_chunk,_encoding,callback){callback();}});
  const cleanup=cancelPromptOnInputEnd(input);
  const prompt=new SelectPrompt({input,output,options:[{value:'codex'}],render(){return 'Choose platform';}});
  const pending=prompt.prompt();
  input.end();
  const result=await Promise.race([pending,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Clack prompt remained pending after EOF')),500))]);
  cleanup();
  assert.equal(clackIsCancel(result),true);
});

test('setup final confirmation cancellation and non-TTY rejection leave the project untouched',async()=>{
  const {setupCommand}=await import('../dist/setup/command.js');
  const root=await mkdtemp(join(tmpdir(),'setup-cancel-'));
  await writeFile(join(root,'input.json'),JSON.stringify(fixture));
  const events=[];
  const ui={isInteractive:()=>true,note:message=>events.push(message),confirm:async()=>false,isCancel:()=>false,cancel:message=>events.push(message)};
  await assert.rejects(setupCommand(root,join(import.meta.dirname,'../catalog'),{config:'input.json',yes:false,dryRun:false},ui),/cancelled/i);
  assert.deepEqual((await readdir(root)).sort(),['input.json']);
  assert.ok(events.some(message=>message.includes('CREATE')));
  const canceledByEof={...ui,confirm:async()=>Symbol('cancel'),isCancel:value=>typeof value==='symbol'};
  await assert.rejects(setupCommand(root,join(import.meta.dirname,'../catalog'),{config:'input.json',yes:false,dryRun:false},canceledByEof),/cancelled/i);
  assert.deepEqual((await readdir(root)).sort(),['input.json']);
  const nonTty={...ui,isInteractive:()=>false};
  await assert.rejects(setupCommand(root,join(import.meta.dirname,'../catalog'),{yes:false,dryRun:false},nonTty),/interactive terminal/i);
  assert.deepEqual((await readdir(root)).sort(),['input.json']);
});

test('multi-platform setup installs agents, MCP and brainstorming for each platform',async()=>{
  const {resolveConfig}=await import('../dist/setup/config.js');
  const {executeSetup}=await import('../dist/setup/command.js');
  const catalogRoot=join(import.meta.dirname,'../catalog');
  const manifest=JSON.parse(await readFile(join(catalogRoot,'manifest.json'),'utf8'));
  const config=resolveConfig({schemaVersion:1,platforms:['codex','claude'],suite:'review-qa',tracker:'none',mcps:['engram'],decisionSupport:{mode:'assist'}},manifest);
  const root=await mkdtemp(join(tmpdir(),'setup-multi-'));
  const report=await executeSetup(root,catalogRoot,config,false);
  assert.deepEqual(report.conflicts,[]);
  for (const platform of ['codex','claude']) {
    assert.match(await readFile(join(root,`.${platform}/skills/brainstorming/SKILL.md`),'utf8'),/brainstorming/);
    assert.match(await readFile(join(root,`.${platform}/skills/engram-session/SKILL.md`),'utf8'),/mem_session_summary/);
    assert.match(await readFile(join(root,`.${platform}/skills/qa-test-evidence/SKILL.md`),'utf8'),/rank_test_scenarios/);
  }
  assert.match(await readFile(join(root,'.mcp.json'),'utf8'),/agents-cli-engram/);
  assert.match(await readFile(join(root,'.codex/config.toml'),'utf8'),/agents-cli-engram/);
  assert.deepEqual(JSON.parse(await readFile(join(root,'agents-cli.config.json'),'utf8')).platforms,['codex','claude']);
  assert.equal(resolveConfig({schemaVersion:1,platform:'pi',suite:'backend',tracker:'none'},manifest).platforms[0],'pi');
});
