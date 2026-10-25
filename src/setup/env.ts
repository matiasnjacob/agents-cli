import {readFile,writeFile,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {assertNoSymlinks} from '../install/engine.js';
import type {SetupConfig} from './config.js';
const exec=promisify(execFile);

export interface EnvVariable {name:string;description:string}
export interface EnvPlan {
  variables:EnvVariable[];
  /** Variables that will be appended to .env (existing keys are never touched). */
  add:string[];
  envFile:'create'|'append'|'ok';
  envrc:'create'|'append'|'ok';
  gitignore:'create'|'append'|'ok';
}

/** Variables a configuration needs in the runtime environment. Values are never generated. */
export function requiredEnv(config:Pick<SetupConfig,'mcps'|'decisionSupport'>):EnvVariable[] {
  const variables:EnvVariable[]=[];
  if (config.mcps.includes('github')) variables.push({name:'GITHUB_TOKEN',description:'GitHub MCP: personal access token'});
  // JEV needs its key whenever decision support is on: through the MCP server, or the CLI on Pi and in scripts.
  if (config.decisionSupport.mode!=='off') variables.push({name:config.decisionSupport.apiKeyEnv,description:'JEV decision support: TypeSafe API key'});
  return variables;
}

async function optional(root:string,path:string):Promise<string|undefined> {
  await assertNoSymlinks(root,path);
  try {return await readFile(join(root,path),'utf8');} catch(e) {if ((e as NodeJS.ErrnoException).code==='ENOENT') return; throw e;}
}

export function definedKeys(content:string|undefined):Map<string,boolean> {
  const keys=new Map<string,boolean>();
  for (const line of (content??'').split(/\r?\n/)) {
    const match=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) keys.set(match[1],match[2].trim().replace(/^(['"])(.*)\1$/,'$2')!=='');
  }
  return keys;
}

const envrcLine='dotenv_if_exists .env';
const ignoresEnv=(content:string)=>content.split(/\r?\n/).some(line=>['.env','/.env','.env*','/.env*'].includes(line.trim()));
const loadsEnv=(content:string)=>/^\s*(dotenv|dotenv_if_exists|source_env|source_env_if_exists)\b.*\.env\b/m.test(content);

interface Prepared {plan:EnvPlan;env?:string;envrc?:string;gitignore?:string}
async function prepare(root:string,config:Pick<SetupConfig,'mcps'|'decisionSupport'>):Promise<Prepared> {
  const variables=requiredEnv(config);
  if (!variables.length) return {plan:{variables,add:[],envFile:'ok',envrc:'ok',gitignore:'ok'}};
  const env=await optional(root,'.env'),envrc=await optional(root,'.envrc'),gitignore=await optional(root,'.gitignore');
  const present=definedKeys(env);
  const missing=variables.filter(v=>!present.has(v.name));
  const block=missing.map(v=>`# ${v.description}\n${v.name}=`).join('\n');
  const nextEnv=missing.length?(env===undefined?`# Secrets for agents-cli integrations. Never commit this file.\n${block}\n`:`${env}${env.endsWith('\n')||env===''?'':'\n'}\n# agents-cli\n${block}\n`):undefined;
  const nextEnvrc=envrc===undefined?`${envrcLine}\n`:loadsEnv(envrc)?undefined:`${envrc}${envrc.endsWith('\n')?'':'\n'}${envrcLine}\n`;
  const nextIgnore=gitignore===undefined?'.env\n':ignoresEnv(gitignore)?undefined:`${gitignore}${gitignore.endsWith('\n')?'':'\n'}.env\n`;
  return {
    plan:{variables,add:missing.map(v=>v.name),envFile:!missing.length?'ok':env===undefined?'create':'append',envrc:nextEnvrc===undefined?'ok':envrc===undefined?'create':'append',gitignore:nextIgnore===undefined?'ok':gitignore===undefined?'create':'append'},
    env:nextEnv,envrc:nextEnvrc,gitignore:nextIgnore,
  };
}

export async function planEnv(root:string,config:Pick<SetupConfig,'mcps'|'decisionSupport'>):Promise<EnvPlan> {
  return (await prepare(root,config)).plan;
}

/**
 * Writes .env, .envrc and .gitignore outside the managed-file lock: secrets must not be
 * hashed into the lockfile or copied into backups. Existing keys and values are preserved.
 */
export async function applyEnv(root:string,config:Pick<SetupConfig,'mcps'|'decisionSupport'>):Promise<EnvPlan> {
  const prepared=await prepare(root,config);
  if (prepared.env!==undefined) {
    const existed=prepared.plan.envFile==='append';
    await writeFile(join(root,'.env'),prepared.env,{encoding:'utf8',mode:0o600});
    if (!existed) await chmod(join(root,'.env'),0o600);
  }
  if (prepared.gitignore!==undefined) await writeFile(join(root,'.gitignore'),prepared.gitignore,'utf8');
  if (prepared.envrc!==undefined) await writeFile(join(root,'.envrc'),prepared.envrc,'utf8');
  return prepared.plan;
}

export async function direnvAvailable():Promise<boolean> {
  try {await exec('direnv',['version'],{timeout:5000});return true;} catch {return false;}
}
export async function commandAvailable(command:string):Promise<boolean> {
  try {await exec('sh',['-c',`command -v ${command}`],{timeout:5000});return true;} catch {return false;}
}
export async function brewAvailable():Promise<boolean> {
  try {await exec('brew',['--version'],{timeout:5000});return true;} catch {return false;}
}
export async function installDirenvWithBrew():Promise<void> {
  await exec('brew',['install','direnv'],{timeout:300000,maxBuffer:4*1024*1024});
}

/** Reports whether each required variable is available, without reading or printing values. */
export async function envStatus(root:string,config:Pick<SetupConfig,'mcps'|'decisionSupport'>,env:NodeJS.ProcessEnv=process.env) {
  const keys=definedKeys(await optional(root,'.env'));
  return requiredEnv(config).map(v=>({...v,inEnvironment:Boolean(env[v.name]),inFile:keys.get(v.name)===true,declared:keys.has(v.name)}));
}
