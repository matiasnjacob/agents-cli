import {mkdtemp,readFile,readdir,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {assertNoSymlinks,sha256,type InstallFile} from '../install/engine.js';
import type {ExternalSkill} from './config.js';
import type {Platform} from '../contract.js';
const exec=promisify(execFile);
export async function collectExternalSkill(root:string,source:ExternalSkill,platform:Platform) {
  await assertNoSymlinks(root,source.path);
  await assertNoSymlinks(root,`${source.path}/SKILL.md`);
  await readFile(join(root,source.path,'SKILL.md'),'utf8');
  let license:string|undefined;
  for (const path of [`${source.path}/LICENSE`,`${source.path}/LICENSE.md`,'LICENSE','LICENSE.md','LICENSE.txt','COPYING']) {
    await assertNoSymlinks(root,path);
    try {license=await readFile(join(root,path),'utf8');break;} catch(e) {if ((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;}
  }
  if (!license?.trim()) throw new Error(`External skill ${source.id} requires an identifiable license file.`);
  const files:InstallFile[]=[]; let bytes=0;
  async function collect(path:string,destination:string) {
    for (const entry of await readdir(path)) {
      const child=join(path,entry),stat=await lstat(child);
      if (stat.isSymbolicLink()) throw new Error('External skill contains an unsupported symlink.');
      if (entry==='.git') throw new Error('External skill cannot include .git resources.');
      if (stat.isDirectory()) await collect(child,join(destination,entry));
      else if (stat.isFile()) {
        bytes+=stat.size;
        if (bytes>2_000_000 || files.length>=500) throw new Error('External skill exceeds resource limits.');
        const buffer=await readFile(child),content=new TextDecoder('utf-8',{fatal:true});
        if (buffer.includes(0)) throw new Error('External binary resources are not supported.');
        let text:string; try {text=content.decode(buffer);} catch {throw new Error('External binary resources are not supported.');}
        files.push({path:join(destination,entry),content:text});
      } else throw new Error('External skill contains unsupported resources.');
    }
  }
  await collect(join(root,source.path),`.${platform}/skills/${source.id}`);
  return {files,provenance:{...source,license,hashes:Object.fromEntries(files.map(f=>[f.path,sha256(f.content)]))}};
}
export async function resolveExternalSkill(source:ExternalSkill,platform:Platform) {
  const staging=await mkdtemp(join(tmpdir(),'agents-cli-skill-'));
  try {
    const gitArgs=['-c','core.hooksPath=/dev/null','-c','core.symlinks=true'];
    const options={timeout:60000,maxBuffer:1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}};
    await exec('git',[...gitArgs,'clone','--no-checkout','--',`https://github.com/${source.repository}.git`,join(staging,'repo')],options);
    await exec('git',[...gitArgs,'-C',join(staging,'repo'),'checkout','--detach',source.revision],options);
    const {stdout}=await exec('git',['-C',join(staging,'repo'),'rev-parse','HEAD'],options);
    if (stdout.trim()!==source.revision) throw new Error('External revision mismatch.');
    return await collectExternalSkill(join(staging,'repo'),source,platform);
  } catch {throw new Error(`Could not resolve external skill ${source.id}; check repository, pinned commit, license and supported text resources.`);}
  finally {await rm(staging,{recursive:true,force:true});}
}
