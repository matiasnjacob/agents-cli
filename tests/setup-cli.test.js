import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,readFile,rm} from 'node:fs/promises';
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

test('interactive plan shows the selection and file counts, not every file',async()=>{
  const {setupCommand}=await import('../dist/setup/command.js');
  const root=await mkdtemp(join(tmpdir(),'setup-summary-'));
  await writeFile(join(root,'input.json'),JSON.stringify(fixture));
  const out=[];
  const ui={isInteractive:()=>true,note:()=>assert.fail('note must not render the plan'),confirm:async()=>false,isCancel:()=>false,cancel(){},write:text=>out.push(text)};
  await assert.rejects(setupCommand(root,join(import.meta.dirname,'../catalog'),{config:'input.json',yes:false,dryRun:false},ui),/cancelled/i);
  const text=out.join('\n');
  assert.match(text,/Platforms: claude/);
  assert.match(text,/Skills: .*brainstorming/);
  assert.match(text,/Files: \d+ to create/);
  assert.doesNotMatch(text,/CREATE \.claude/);
});

test('setup writes .env placeholders, .envrc and .gitignore without exposing or overwriting secrets',async()=>{
  const {resolveConfig}=await import('../dist/setup/config.js');
  const {executeSetup}=await import('../dist/setup/command.js');
  const {runDoctor,formatDoctorReport}=await import('../dist/doctor.js');
  const catalogRoot=join(import.meta.dirname,'../catalog');
  const manifest=JSON.parse(await readFile(join(catalogRoot,'manifest.json'),'utf8'));
  const config=resolveConfig({schemaVersion:1,platforms:['claude'],suite:'review-qa',tracker:'none',mcps:['github','engram','jev'],decisionSupport:{mode:'assist'}},manifest);
  const root=await mkdtemp(join(tmpdir(),'setup-env-'));
  await writeFile(join(root,'.gitignore'),'node_modules');
  await writeFile(join(root,'.env'),'EXISTING=keep\nGITHUB_TOKEN=secret-value\n');
  const dry=await executeSetup(root,catalogRoot,config,true);
  assert.deepEqual(dry.environment.add,['TYPESAFE_API_KEY']);
  assert.equal(await readFile(join(root,'.env'),'utf8'),'EXISTING=keep\nGITHUB_TOKEN=secret-value\n');
  await executeSetup(root,catalogRoot,config,false);
  const env=await readFile(join(root,'.env'),'utf8');
  assert.match(env,/^EXISTING=keep\nGITHUB_TOKEN=secret-value\n/);
  assert.match(env,/\nTYPESAFE_API_KEY=\n/);
  assert.equal(await readFile(join(root,'.envrc'),'utf8'),'dotenv_if_exists .env\n');
  assert.equal(await readFile(join(root,'.gitignore'),'utf8'),'node_modules\n.env\n');
  assert.doesNotMatch(await readFile(join(root,'.agents-cli.lock.json'),'utf8'),/\.env/);
  const again=await executeSetup(root,catalogRoot,config,false);
  assert.deepEqual([again.environment.envFile,again.environment.envrc,again.environment.gitignore],['ok','ok','ok']);
  const report=await runDoctor({root,catalogRoot,env:{}});
  assert.equal(report.checks.find(c=>c.name==='env:TYPESAFE_API_KEY').status,'warn');
  assert.equal(report.checks.find(c=>c.name==='env:GITHUB_TOKEN').status,'pass');
  assert.doesNotMatch(JSON.stringify(report),/secret-value/);
  assert.match(formatDoctorReport(report),/Use `agents-cli doctor --json`/);
});

test('check reports drift with exit 1 and update restores it',async()=>{
  const {unlink}=await import('node:fs/promises');
  const root=await mkdtemp(join(tmpdir(),'setup-lifecycle-'));
  await writeFile(join(root,'input.json'),JSON.stringify(fixture));
  const run=(args)=>exec(process.execPath,[cli,...args],{cwd:root}).then(r=>({code:0,out:JSON.parse(r.stdout)}),e=>({code:e.code,out:JSON.parse(e.stdout||'null'),err:e.stderr}));
  await run(['setup','--config','input.json','--yes']);
  const clean=await run(['check']);
  assert.equal(clean.code,0); assert.equal(clean.out.upToDate,true);
  await unlink(join(root,'.claude/skills/engram-session/SKILL.md'));
  await writeFile(join(root,'.claude/skills/functional-review/SKILL.md'),'edited by user');
  const drift=await run(['check']);
  assert.equal(drift.code,1); assert.equal(drift.out.upToDate,false);
  assert.ok(drift.out.creates.includes('.claude/skills/engram-session/SKILL.md'));
  assert.deepEqual(drift.out.conflicts,['.claude/skills/functional-review/SKILL.md']);
  const blocked=await run(['update','--yes']);
  assert.deepEqual(blocked.out.conflicts,['.claude/skills/functional-review/SKILL.md']);
  await assert.rejects(readFile(join(root,'.claude/skills/engram-session/SKILL.md'),'utf8'),/ENOENT/);
  assert.equal(await readFile(join(root,'.claude/skills/functional-review/SKILL.md'),'utf8'),'edited by user');
  await unlink(join(root,'.claude/skills/functional-review/SKILL.md'));
  const updated=await run(['update','--yes']);
  assert.equal(updated.out.dryRun,false);
  assert.match(await readFile(join(root,'.claude/skills/engram-session/SKILL.md'),'utf8'),/mem_session_summary/);
  const noConfig=await mkdtemp(join(tmpdir(),'setup-lifecycle-none-'));
  await assert.rejects(exec(process.execPath,[cli,'update','--yes'],{cwd:noConfig}),/agents-cli.config.json/);
});
test('interactive setup ends with success and a short checklist, without doctor warnings',async()=>{
  const {setupCommand,setupNextSteps}=await import('../dist/setup/command.js');
  const root=await mkdtemp(join(tmpdir(),'setup-success-'));
  await writeFile(join(root,'input.json'),JSON.stringify({...fixture,mcps:['github','linear'],tracker:'linear'}));
  const out=[];
  const ui={isInteractive:()=>true,note(){},confirm:async()=>false,isCancel:()=>false,cancel(){},write:text=>out.push(text)};
  await setupCommand(root,join(import.meta.dirname,'../catalog'),{config:'input.json',yes:false,dryRun:false},{...ui,confirm:async message=>/direnv/.test(message)?false:true});
  const text=out.join('\n');
  assert.match(text,/Setup complete\./);
  assert.match(text,/Before you start/);
  assert.match(text,/Fill in GITHUB_TOKEN/);
  assert.match(text,/Linear: sign in/);
  assert.doesNotMatch(text,/NOT VERIFIED|identity|AGENTS_CLI_MCP_PROFILE/);
  assert.deepEqual(setupNextSteps({pending:['[codex] linear: complete OAuth; functional tool call NOT VERIFIED.','[claude] linear: complete OAuth; functional tool call NOT VERIFIED.'],variables:[],direnv:true,engramMissing:true}),['Install engram and make sure it is on your PATH.','Linear: sign in with OAuth the first time your agent uses it.','Start your agent runtime in this project.']);
});

test('external skill freshness compares pinned revisions with upstream and never counts as drift',async()=>{
  const {externalStatuses,formatDrift}=await import('../dist/setup/lifecycle.js');
  const old='a'.repeat(40),fresh='b'.repeat(40);
  const skills=['plain',{id:'one',repository:'o/one',revision:old,path:'s'},{id:'two',repository:'o/two',revision:old,path:'s'},{id:'three',repository:'o/three',revision:old,path:'s'}];
  const latest=async repository=>({'o/one':fresh,'o/two':old}[repository]);
  const statuses=await externalStatuses(skills,latest);
  assert.deepEqual(statuses.map(s=>[s.id,s.status]),[['one','outdated'],['two','current'],['three','unverified']]);
  assert.deepEqual((await externalStatuses(skills,latest,'two')).map(s=>s.id),['two']);
  const text=formatDrift({upToDate:true,creates:[],updates:[],removes:[],conflicts:[],environment:{add:[]},externalSkills:statuses});
  assert.match(text,/Everything is up to date/);
  assert.match(text,/compare\/a{40}\.\.\.b{40}/);
  assert.match(text,/three: upstream revision not verified/);
  assert.match(text,/skills update/);
});

test('skills update --dry-run reports statuses without touching the config',async()=>{
  const root=await mkdtemp(join(tmpdir(),'skills-update-'));
  await writeFile(join(root,'input.json'),JSON.stringify(fixture));
  await exec(process.execPath,[cli,'setup','--config','input.json','--yes'],{cwd:root});
  const before=await readFile(join(root,'agents-cli.config.json'),'utf8');
  const out=JSON.parse((await exec(process.execPath,[cli,'skills','update','--dry-run'],{cwd:root})).stdout);
  assert.equal(out.updated,false); assert.equal(out.externalSkills[0].id,'brainstorming'); assert.equal(out.externalSkills[0].status,'unverified');
  assert.equal(await readFile(join(root,'agents-cli.config.json'),'utf8'),before);
  await assert.rejects(exec(process.execPath,[cli,'skills','update','nope','--dry-run'],{cwd:root}),/No external skill 'nope'/);
});

test('uninstall removes only managed files and MCP entries, keeps edits and secrets; revert restores',async()=>{
  const {access,readdir:ls}=await import('node:fs/promises');
  const root=await mkdtemp(join(tmpdir(),'setup-uninstall-'));
  await writeFile(join(root,'input.json'),JSON.stringify({...fixture,platform:undefined,platforms:['claude','codex'],mcps:['github','engram'],suite:'review-qa'}));
  await writeFile(join(root,'.mcp.json'),JSON.stringify({mcpServers:{mine:{url:'https://mine.example'}}}));
  await writeFile(join(root,'.codex-user-note'),'unrelated');
  const run=async(args)=>JSON.parse((await exec(process.execPath,[cli,...args],{cwd:root})).stdout);
  await run(['setup','--config','input.json','--yes']);
  assert.match(await readFile(join(root,'.mcp.json'),'utf8'),/agents-cli-github/);
  await writeFile(join(root,'.env'),'GITHUB_TOKEN=secret\n');
  await writeFile(join(root,'.claude/agents/qa-manual.md'),'my edit');
  const dry=await run(['uninstall','--dry-run']);
  assert.equal(dry.dryRun,true); assert.deepEqual(dry.kept,['.claude/agents/qa-manual.md']);
  await access(join(root,'.claude/agents/code-reviewer.md'));
  await assert.rejects(exec(process.execPath,[cli,'uninstall'],{cwd:root}),/--yes/);
  const done=await run(['uninstall','--yes']);
  assert.ok(done.removed.includes('.claude/agents/code-reviewer.md')); assert.deepEqual(done.kept,['.claude/agents/qa-manual.md']);
  await assert.rejects(access(join(root,'.claude/agents/code-reviewer.md')));
  await assert.rejects(access(join(root,'.codex/agents')));
  await assert.rejects(access(join(root,'.codex/skills')));
  assert.doesNotMatch(await readFile(join(root,'.codex/config.toml'),'utf8'),/agents-cli/);
  assert.equal(await readFile(join(root,'.claude/agents/qa-manual.md'),'utf8'),'my edit');
  const mcp=JSON.parse(await readFile(join(root,'.mcp.json'),'utf8'));
  assert.deepEqual(Object.keys(mcp.mcpServers),['mine']);
  assert.equal(await readFile(join(root,'.env'),'utf8'),'GITHUB_TOKEN=secret\n');
  assert.equal(await readFile(join(root,'.codex-user-note'),'utf8'),'unrelated');
  const backups=await run(['revert','--list']);
  assert.ok(backups.length>=1);
  const preview=await run(['revert','--dry-run']);
  assert.ok(preview.restored.includes('.claude/agents/code-reviewer.md'));
  await run(['revert','--yes']);
  assert.match(await readFile(join(root,'.claude/agents/code-reviewer.md'),'utf8'),/code-reviewer/);
  await assert.rejects(exec(process.execPath,[cli,'uninstall','--yes'],{cwd:await mkdtemp(join(tmpdir(),'none-'))}),/Nothing to uninstall/);
});

test('skills add owner/repo pins a resolved commit, validates the skill and applies it',async()=>{
  const {cp,mkdir}=await import('node:fs/promises');
  const upstream=await mkdtemp(join(tmpdir(),'upstream-'));
  await cp(join(import.meta.dirname,'fixtures/external'),upstream,{recursive:true});
  const repo=join(upstream,'acme/tools');
  await mkdir(join(repo,'skills/hello'),{recursive:true});
  await writeFile(join(repo,'LICENSE'),'MIT License\nPermission is hereby granted');
  await writeFile(join(repo,'skills/hello/SKILL.md'),'---\nname: hello\ndescription: "Say hello"\n---\nHello.');
  const git=(...args)=>exec('git',['-C',repo,...args]);
  await git('init','-q'); await git('-c','user.email=t@t','-c','user.name=t','add','-A'); await git('-c','user.email=t@t','-c','user.name=t','commit','-q','-m','init'); await git('tag','v1');
  const sha=(await git('rev-parse','HEAD')).stdout.trim();
  const root=await mkdtemp(join(tmpdir(),'skills-add-'));
  const env={...process.env,AGENTS_CLI_EXTERNAL_SKILLS_DIR:upstream};
  const run=async(args)=>JSON.parse((await exec(process.execPath,[cli,...args],{cwd:root,env})).stdout);
  await writeFile(join(root,'input.json'),JSON.stringify(fixture));
  await run(['setup','--config','input.json','--yes']);
  const before=await readFile(join(root,'agents-cli.config.json'),'utf8');
  const dry=await run(['skills','add','acme/tools','--path','skills/hello','--ref','v1','--dry-run']);
  assert.equal(dry.added,false); assert.equal(dry.skill.revision,sha); assert.equal(dry.skill.id,'hello'); assert.match(dry.review,new RegExp(sha));
  assert.equal(await readFile(join(root,'agents-cli.config.json'),'utf8'),before);
  const added=await run(['skills','add','acme/tools','--path','skills/hello','--yes']);
  assert.equal(added.added,true);
  assert.deepEqual(JSON.parse(await readFile(join(root,'agents-cli.config.json'),'utf8')).skills.find(s=>s.id==='hello'),{id:'hello',repository:'acme/tools',revision:sha,path:'skills/hello'});
  assert.match(await readFile(join(root,'.claude/skills/hello/SKILL.md'),'utf8'),/Hello\./);
  assert.equal((await run(['check'])).upToDate,true);
  const afterAdd=await readFile(join(root,'agents-cli.config.json'),'utf8');
  await assert.rejects(exec(process.execPath,[cli,'skills','add','acme/tools','--path','skills/hello','--id','functional-review','--yes'],{cwd:root,env}));
  assert.equal(await readFile(join(root,'agents-cli.config.json'),'utf8'),afterAdd);
  await assert.rejects(exec(process.execPath,[cli,'skills','add','acme/tools','--path','skills/missing','--yes'],{cwd:root,env}),/Could not resolve external skill/);
  await assert.rejects(exec(process.execPath,[cli,'skills','add','acme/tools','--path','skills/hello','--ref','nope','--dry-run'],{cwd:root,env}),/Could not resolve/);
});

test('import indexes unmanaged instructions and MCP names without copying content or secrets',async()=>{
  const {mkdir}=await import('node:fs/promises');
  const root=await mkdtemp(join(tmpdir(),'setup-import-'));
  const run=async(args)=>JSON.parse((await exec(process.execPath,[cli,...args],{cwd:root})).stdout);
  const empty=await run(['import']);
  assert.equal(empty.written,false); await assert.rejects(readFile(join(root,'.agents/imported.md')),/ENOENT/);
  await writeFile(join(root,'AGENTS.md'),'# Team conventions\nNever use tabs. SECRET_INSTRUCTION_BODY');
  await mkdir(join(root,'.cursor/rules'),{recursive:true});
  await writeFile(join(root,'.cursor/rules/style.mdc'),'---\n---\nPrefer small functions');
  await writeFile(join(root,'.mcp.json'),JSON.stringify({mcpServers:{mine:{command:'x',env:{TOKEN:'sk-very-secret'}}}}));
  await writeFile(join(root,'input.json'),JSON.stringify(fixture));
  await run(['setup','--config','input.json','--yes']);
  const originals=await Promise.all(['AGENTS.md','.cursor/rules/style.mdc'].map(p=>readFile(join(root,p),'utf8')));
  const dry=await run(['import','--dry-run']);
  assert.equal(dry.written,false); await assert.rejects(readFile(join(root,'.agents/imported.md')),/ENOENT/);
  const report=await run(['import']);
  assert.deepEqual(report.instructionFiles.map(f=>f.path),['AGENTS.md','.cursor/rules/style.mdc']);
  assert.deepEqual(report.mcpServers,[{file:'.mcp.json',name:'mine'}]);
  assert.equal(report.written,true);
  const doc=await readFile(join(root,'.agents/imported.md'),'utf8');
  assert.match(doc,/AGENTS\.md.*Team conventions/); assert.match(doc,/never override agents-cli safety rules/i);
  assert.doesNotMatch(doc,/SECRET_INSTRUCTION_BODY|sk-very-secret|CLAUDE\.md/);
  assert.deepEqual(await Promise.all(['AGENTS.md','.cursor/rules/style.mdc'].map(p=>readFile(join(root,p),'utf8'))),originals);
  assert.equal((await run(['import'])).written,false);
  assert.match(await readFile(join(root,'.claude/agents/code-reviewer.md'),'utf8'),/\.agents\/imported\.md/);
  const gone=await run(['uninstall','--yes']);
  assert.ok(gone.removed.includes('.agents/imported.md'));
});

test('engram stop hook blocks once when tools ran without a session summary',async()=>{
  const {evaluateEngramStop,runEngramStopHook}=await import('../dist/hooks/engram-stop.js');
  const line=(...blocks)=>JSON.stringify({type:'assistant',message:{content:blocks}});
  const tool=line({type:'tool_use',id:'1',name:'Bash',input:{}}),summary=line({type:'tool_use',id:'2',name:'mcp__engram__mem_session_summary',input:{}});
  const definitions=JSON.stringify({type:'system',tools:[{name:'mcp__engram__mem_session_summary',description:'tool_use'}]});
  assert.equal(evaluateEngramStop({},`${definitions}\n${tool}`).decision,'block');
  assert.equal(evaluateEngramStop({},tool).decision,'block');
  assert.deepEqual(evaluateEngramStop({},line({type:'text',text:'hi'})),{});
  assert.deepEqual(evaluateEngramStop({},`${tool}\n${summary}`),{});
  assert.deepEqual(evaluateEngramStop({stop_hook_active:true},tool),{});
  const dir=await mkdtemp(join(tmpdir(),'stop-hook-'));
  await writeFile(join(dir,'t.jsonl'),tool);
  assert.equal(JSON.parse(await runEngramStopHook(JSON.stringify({transcript_path:join(dir,'t.jsonl')}))).decision,'block');
  assert.equal(await runEngramStopHook('not json'),'{}');
  assert.equal(await runEngramStopHook(JSON.stringify({transcript_path:join(dir,'missing')})),'{}');
});

test('managed Claude hooks merge with user hooks, are idempotent, switchable and removed by uninstall',async()=>{
  const {mkdir}=await import('node:fs/promises');
  const home=await mkdtemp(join(tmpdir(),'home-')),root=await mkdtemp(join(tmpdir(),'setup-hooks-'));
  const env={...process.env,HOME:home};
  const run=async(args)=>JSON.parse((await exec(process.execPath,[cli,...args],{cwd:root,env})).stdout);
  await mkdir(join(root,'.claude'),{recursive:true});
  await writeFile(join(root,'.claude/settings.json'),JSON.stringify({permissions:{allow:['Bash(ls)']},hooks:{Stop:[{hooks:[{type:'command',command:'echo mine'}]}]}}));
  const config={...fixture,mcps:['engram']};
  await writeFile(join(root,'input.json'),JSON.stringify(config));
  await run(['setup','--config','input.json','--yes']);
  const read=async()=>JSON.parse(await readFile(join(root,'.claude/settings.json'),'utf8'));
  let settings=await read();
  assert.deepEqual(settings.permissions,{allow:['Bash(ls)']});
  const commands=event=>settings.hooks[event].flatMap(g=>g.hooks.map(h=>h.command));
  assert.deepEqual(commands('Stop'),['echo mine','agents-cli hook engram-stop']);
  assert.match(commands('SessionStart')[0],/engram context/);
  const before=await readFile(join(root,'.claude/settings.json'),'utf8');
  await run(['setup','--config','input.json','--yes']);
  assert.equal(await readFile(join(root,'.claude/settings.json'),'utf8'),before);
  await writeFile(join(root,'input.json'),JSON.stringify({...config,hooks:{engram:false}}));
  await run(['setup','--config','input.json','--yes']);
  settings=await read();
  assert.deepEqual(commands('Stop'),['echo mine']); assert.equal(settings.hooks.SessionStart,undefined);
  await assert.rejects(readFile(join(root,'.agents/hooks-state-claude.json')),/ENOENT/);
  await writeFile(join(root,'input.json'),JSON.stringify(config));
  await run(['setup','--config','input.json','--yes']);
  await run(['uninstall','--yes']);
  settings=await read();
  assert.deepEqual(commands('Stop'),['echo mine']); assert.deepEqual(settings.permissions,{allow:['Bash(ls)']});
  assert.equal(settings.hooks.SessionStart,undefined);
  await assert.rejects(readFile(join(root,'.agents/hooks-state-claude.json')),/ENOENT/);
});

test('session-start context hook is skipped when the Engram Claude plugin is enabled',async()=>{
  const {prepareHooks}=await import('../dist/setup/hooks.js');
  const home=await mkdtemp(join(tmpdir(),'home-plugin-')),root=await mkdtemp(join(tmpdir(),'hooks-plugin-'));
  const {mkdir}=await import('node:fs/promises');
  await mkdir(join(home,'.claude'),{recursive:true});
  await writeFile(join(home,'.claude/settings.json'),JSON.stringify({enabledPlugins:{'engram@engram':true}}));
  const config={platforms:['claude'],hooks:{engram:true}};
  const settings=JSON.parse((await prepareHooks(root,config,home)).files.find(f=>f.path==='.claude/settings.json').content);
  assert.deepEqual(Object.keys(settings.hooks),['Stop']);
  assert.deepEqual(await prepareHooks(root,{platforms:['codex'],hooks:{engram:true}},home),{files:[],pending:[]});
});

test('permission overrides narrow freely, widen only when allowed, and reach every adapter',async()=>{
  const {applyPermissionOverrides,widens}=await import('../dist/adapters/permissions.js');
  const {resolveConfig}=await import('../dist/setup/config.js');
  const {executeSetup,formatSetupPreview}=await import('../dist/setup/command.js');
  const agents=[{id:'dev',permission:{bash:'ask',edit:{'*':'deny','evidence/**':'allow'},webfetch:'allow'}}];
  assert.equal(applyPermissionOverrides(agents,{dev:{bash:'deny'}})[0].permission.bash,'deny');
  assert.equal(applyPermissionOverrides(agents,{dev:{webfetch:'ask'}})[0].permission.webfetch,'ask');
  assert.deepEqual(applyPermissionOverrides(agents,{dev:{edit:{'*':'deny'}}})[0].permission.edit,{'*':'deny'});
  assert.throws(()=>applyPermissionOverrides(agents,{dev:{bash:'allow'}}),/widen/);
  assert.throws(()=>applyPermissionOverrides(agents,{dev:{edit:{'*':'deny','evidence/**':'allow','src/**':'allow'}}}),/widen/);
  assert.equal(applyPermissionOverrides(agents,{dev:{bash:'allow'}},true)[0].permission.bash,'allow');
  assert.throws(()=>applyPermissionOverrides(agents,{dev:{bsh:'deny'}}),/Unknown permission 'bsh'/);
  assert.throws(()=>applyPermissionOverrides(agents,{dev:{bash:'maybe'}},true),/Invalid permission value/);
  assert.throws(()=>applyPermissionOverrides(agents,{other:{bash:'deny'}}),/unselected agent/);
  assert.equal(widens('ask','deny'),false); assert.equal(widens('deny','ask'),true);
  const catalogRoot=join(import.meta.dirname,'../catalog');
  const manifest=JSON.parse(await readFile(join(catalogRoot,'manifest.json'),'utf8'));
  const base={schemaVersion:1,platforms:['claude','pi','opencode','codex'],suite:'backend',tracker:'none',agents:['backend-developer','code-reviewer']};
  assert.throws(()=>resolveConfig({...base,permissions:{'qa-manual':{bash:'deny'}}},manifest),/unselected agent/);
  assert.throws(()=>resolveConfig({...base,permissions:{'code-reviewer':{bash:'x'}}},manifest),/Invalid permission value/);
  const config=resolveConfig({...base,permissions:{'backend-developer':{bash:'deny',webfetch:'ask'}}},manifest);
  const root=await mkdtemp(join(tmpdir(),'setup-perms-'));
  const plan=await executeSetup(root,catalogRoot,config,true);
  assert.match(formatSetupPreview(plan),/Permission overrides: backend-developer\.bash=deny, backend-developer\.webfetch=ask/);
  await executeSetup(root,catalogRoot,config,false);
  const claude=await readFile(join(root,'.claude/agents/backend-developer.md'),'utf8');
  assert.match(claude,/tools: .*Read/); assert.doesNotMatch(claude.match(/^tools: .*$/m)[0],/Bash/);
  assert.match(await readFile(join(root,'.opencode/agents/backend-developer.md'),'utf8'),/"bash":"deny"/);
  assert.doesNotMatch(await readFile(join(root,'.pi/agents/backend-developer.md'),'utf8').then(t=>t.match(/^tools: .*$/m)?.[0] ?? ''),/bash/);
  assert.match(await readFile(join(root,'.claude/agents/code-reviewer.md'),'utf8'),/Bash/);
  const widening=resolveConfig({...base,permissions:{'backend-developer':{bash:'allow'}}},manifest);
  await assert.rejects(executeSetup(await mkdtemp(join(tmpdir(),'setup-perms-')),catalogRoot,widening,true),/widen/);
  const allowed=resolveConfig({...base,allowPermissionWidening:true,permissions:{'backend-developer':{bash:'allow'}}},manifest);
  await executeSetup(await mkdtemp(join(tmpdir(),'setup-perms-')),catalogRoot,allowed,true);
});

test('init runs the setup engine with the same JSON summary and extends an existing configuration',async()=>{
  const root=await mkdtemp(join(tmpdir(),'init-alias-'));
  const exec2=(args)=>exec(process.execPath,[cli,...args],{cwd:root});
  const first=JSON.parse((await exec2(['init','--platform','codex','--tracker','none','--yes'])).stdout);
  assert.deepEqual(Object.keys(first),['platform','tracker','dryRun','creates','updates','unchanged','conflicts']);
  assert.equal(first.platform,'codex');
  const config=JSON.parse(await readFile(join(root,'agents-cli.config.json'),'utf8'));
  assert.deepEqual(config.platforms,['codex']); assert.equal(config.suite,'complete');
  assert.ok(config.skills.some(s=>s.id==='brainstorming'));
  assert.match(await readFile(join(root,'.codex/skills/brainstorming/SKILL.md'),'utf8'),/brainstorming/);
  assert.match(await readFile(join(root,'.codex/skills/engram-session/SKILL.md'),'utf8'),/mem_context/);
  const edited={...config,suite:'custom',agents:['code-reviewer'],agentPrefix:'acme',permissions:{'code-reviewer':{bash:'deny'}}};
  await rm(join(root,'.codex'),{recursive:true,force:true});
  await writeFile(join(root,'agents-cli.config.json'),JSON.stringify(edited));
  await exec2(['init','--platform','claude','--tracker','none','--yes']);
  const extended=JSON.parse(await readFile(join(root,'agents-cli.config.json'),'utf8'));
  assert.deepEqual(extended.platforms,['codex','claude']);
  assert.equal(extended.agentPrefix,'acme'); assert.deepEqual(extended.agents,['code-reviewer']); assert.deepEqual(extended.permissions,{'code-reviewer':{bash:'deny'}});
  await readFile(join(root,'.claude/agents/acme-code-reviewer.md'),'utf8');
  const again=JSON.parse((await exec2(['init','--platform','claude','--tracker','none','--yes'])).stdout);
  assert.deepEqual([again.creates.length,again.updates.length],[0,0]);
  await exec2(['init','--platform','claude','--tracker','linear','--yes']);
  await assert.rejects(exec2(['init','--platform','claude','--tracker','trello','--yes']),/differs from the configured tracker/);
  await assert.rejects(exec2(['init','--platform','claude','--tracker','linear','--skills','nope','--yes']),/Unknown skill/);
});
