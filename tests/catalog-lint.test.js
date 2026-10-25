import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {lintCatalog,formatLint} from '../dist/catalog/lint.js';
const exec=promisify(execFile);
const catalog=join(import.meta.dirname,'../catalog');

async function copy() {
  const dir=await mkdtemp(join(tmpdir(),'catalog-lint-'));
  await cp(catalog,dir,{recursive:true});
  return dir;
}
const rules=async dir=>(await lintCatalog(dir)).map(f=>f.rule);

test('the shipped catalog passes every lint rule',async()=>{
  assert.deepEqual(await lintCatalog(catalog),[]);
  assert.match(formatLint([]),/passed/);
  const out=JSON.parse((await exec(process.execPath,[join(import.meta.dirname,'../dist/cli/index.js'),'lint','--json'])).stdout);
  assert.equal(out.ok,true);
});

test('lint reports manifest drift, bad front matter and stale hashes',async()=>{
  const dir=await copy();
  await writeFile(join(dir,'agents/stray-agent.md'),'---\ndescription: "x"\npermission: {}\n---\nbody');
  await mkdir(join(dir,'skills/stray-skill'));
  await writeFile(join(dir,'skills/stray-skill/SKILL.md'),'---\nname: stray-skill\ndescription: "A long enough description for lint"\n---\nx');
  await writeFile(join(dir,'skills/functional-review/SKILL.md'),'---\nname: wrong-name\ndescription: "short"\n---\nedited');
  const found=await rules(dir);
  for (const rule of ['agent-manifest-sync','skill-manifest-sync','skill-front-matter','skill-hash']) assert.ok(found.includes(rule),rule);
  const messages=(await lintCatalog(dir)).map(f=>f.message).join('\n');
  assert.match(messages,/must equal the skill id/); assert.match(messages,/too short/);
});

test('lint reports permission, reference and skill-loading problems',async()=>{
  const dir=await copy();
  const edit=async(file,fn)=>writeFile(join(dir,file),fn(await readFile(join(dir,file),'utf8')));
  await edit('agents/code-reviewer.md',s=>s.replace('"bash": "ask"','"bash": "deny"').replace('## Responsibilities','## Responsibilities\n\nUse bash to run the full suite.').replaceAll('`code-review-pr`','the review skill'));
  await edit('agents/backend-developer.md',s=>s.replace('"webfetch": "allow"','"webfetch": "sometimes"'));
  await edit('agents/orchestrator.md',s=>s.replace('"task": {','"task": {"ghost-agent": "allow", '));
  const findings=await lintCatalog(dir);
  const has=(rule,subject)=>findings.some(f=>f.rule===rule && f.subject===subject);
  assert.ok(has('tool-promise','code-reviewer'),JSON.stringify(findings));
  assert.ok(has('required-skills-loaded','code-reviewer'));
  assert.ok(has('permission-shape','backend-developer'));
  assert.ok(has('agent-references','orchestrator'));
  const manifestPath=join(dir,'manifest.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  manifest.agents[0].requiredSkills=['missing-skill'];
  await writeFile(manifestPath,JSON.stringify(manifest));
  assert.ok((await rules(dir)).includes('required-skills-exist'));
});
