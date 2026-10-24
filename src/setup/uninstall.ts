import {readFile,readdir,rmdir,unlink,stat} from 'node:fs/promises';
import {dirname,join,relative} from 'node:path';
import {applyInstall,planInstall,assertNoSymlinks,sha256,LOCKFILE,type InstallFile} from '../install/engine.js';
import {prepareMcp} from './mcp.js';
import {createStyle,type Style} from './ui.js';
import {supportedPlatforms} from '../contract.js';

const BACKUPS='.agents-cli-backups';
/** Shared MCP configuration files are user-owned; they are cleaned through ownership state, never deleted. */
const MCP_CONFIG_PATHS=new Set(['.mcp.json','opencode.json','opencode.jsonc','.codex/config.toml']);

export interface UninstallReport {
  dryRun:boolean;
  removed:string[];
  /** Edited since installation; left in place. */
  kept:string[];
  mcp:{platform:string;status:'removed'|'kept'}[];
  backup?:string;
}

async function optional(root:string,path:string):Promise<string|undefined> {
  await assertNoSymlinks(root,path);
  try {return await readFile(join(root,path),'utf8');} catch(e) {if ((e as NodeJS.ErrnoException).code==='ENOENT') return; throw e;}
}

async function pruneEmptyDirs(root:string,paths:string[]):Promise<void> {
  const dirs=new Set<string>();
  for (const path of paths) for (let dir=dirname(path);dir!=='.' && dir!=='/';dir=dirname(dir)) dirs.add(dir);
  for (const dir of [...dirs].sort((a,b)=>b.length-a.length)) {
    try {await rmdir(join(root,dir));} catch { /* not empty or already gone */ }
  }
}

export async function uninstall(root:string,options:{dryRun:boolean;now?:Date}):Promise<UninstallReport> {
  const lockRaw=await optional(root,LOCKFILE);
  if (lockRaw===undefined) throw new Error(`Nothing to uninstall: ${LOCKFILE} not found.`);
  const lock=JSON.parse(lockRaw) as {files:Record<string,string>};
  const files:InstallFile[]=[],mcp:UninstallReport['mcp']=[];
  for (const platform of supportedPlatforms) {
    const statePath=`.agents/mcp-state-${platform}.json`;
    if (await optional(root,statePath)===undefined) continue;
    try {
      const prepared=await prepareMcp(root,{platform,mcps:[]});
      for (const file of prepared.files) {
        if (file.path===statePath) continue;
        files.push({...file,content:file.content.replace(/\n*# agents-cli MCP begin\n# agents-cli MCP end\n?/,'\n')});
      }
      files.push({path:statePath,content:'',remove:true});
      mcp.push({platform,status:'removed'});
    } catch {mcp.push({platform,status:'kept'});}
  }
  for (const path of Object.keys(lock.files)) {
    if (path===LOCKFILE || MCP_CONFIG_PATHS.has(path) || files.some(file=>file.path===path)) continue;
    files.push({path,content:'',remove:true});
  }
  const plan=await planInstall({root,files,catalogVersion:'uninstall'});
  const keep=new Set(plan.conflicts);
  const applicable=files.filter(file=>!keep.has(file.path));
  const report:UninstallReport={dryRun:options.dryRun,removed:applicable.filter(file=>file.remove && !plan.unchanged.includes(file.path)).map(file=>file.path),kept:[...keep],mcp};
  if (options.dryRun) return report;
  const applied=await applyInstall({root,files:applicable,catalogVersion:'uninstall',now:options.now});
  if (applied.backups.length) report.backup=relative(root,join(root,BACKUPS));
  await pruneEmptyDirs(root,report.removed);
  const after=JSON.parse(await readFile(join(root,LOCKFILE),'utf8')) as {files:Record<string,string>};
  if (!Object.keys(after.files).filter(path=>path!==LOCKFILE && !MCP_CONFIG_PATHS.has(path)).length) {
    await unlink(join(root,LOCKFILE));
  }
  return report;
}

export function formatUninstall(report:UninstallReport,style:Style=createStyle(false)):string {
  const lines=[style.heading(report.dryRun?'agents-cli uninstall (preview)':'agents-cli uninstall')];
  lines.push(style.ok(`${report.removed.length} managed file(s) ${report.dryRun?'would be removed':'removed'}`));
  for (const entry of report.mcp) lines.push(entry.status==='removed'?style.ok(`${entry.platform}: managed MCP entries ${report.dryRun?'would be removed':'removed'}`):style.warn(`${entry.platform}: MCP entries were edited; left in place`));
  if (report.kept.length) {
    lines.push(style.warn(`${report.kept.length} edited file(s) kept:`));
    lines.push(...report.kept.map(path=>`      ${path}`));
  }
  if (!report.dryRun && report.backup) lines.push(style.dim(`  Removed files are backed up in ${report.backup}/; restore with: agents-cli revert`));
  lines.push(style.dim('  .env, .envrc and .gitignore are never touched.'));
  return lines.join('\n');
}

export interface BackupInfo {id:string;files:string[]}
export async function listBackups(root:string):Promise<BackupInfo[]> {
  await assertNoSymlinks(root,BACKUPS);
  let ids:string[];
  try {ids=(await readdir(join(root,BACKUPS))).sort();} catch(e) {if ((e as NodeJS.ErrnoException).code==='ENOENT') return []; throw e;}
  const result:BackupInfo[]=[];
  for (const id of ids) {
    const files:string[]=[];
    const walk=async(dir:string)=>{
      for (const entry of await readdir(join(root,BACKUPS,id,dir))) {
        const rel=join(dir,entry);
        if ((await stat(join(root,BACKUPS,id,rel))).isDirectory()) await walk(rel); else files.push(rel);
      }
    };
    await walk('');
    result.push({id,files});
  }
  return result;
}

export interface RevertReport {dryRun:boolean;backup:string;restored:string[];unchanged:string[]}

/** Restores the files saved in a backup; the current content is backed up first, so a revert can be reverted. */
export async function revert(root:string,options:{id?:string;dryRun:boolean;now?:Date}):Promise<RevertReport> {
  const backups=await listBackups(root);
  if (!backups.length) throw new Error('No backups found in .agents-cli-backups.');
  const chosen=options.id?backups.find(b=>b.id===options.id) ?? backups.filter(b=>b.id.startsWith(options.id!)).at(-1):backups.at(-1);
  if (!chosen) throw new Error(`Backup '${options.id}' not found; run revert --list.`);
  const files:InstallFile[]=[];
  for (const path of chosen.files) {
    const content=await readFile(join(root,BACKUPS,chosen.id,path),'utf8');
    const current=await optional(root,path);
    files.push({path,content,...(current!==undefined?{expectedHash:sha256(current)}:{})});
  }
  const plan=await planInstall({root,files,catalogVersion:'revert'});
  const report:RevertReport={dryRun:options.dryRun,backup:chosen.id,restored:[...plan.creates,...plan.updates].map(file=>file.path),unchanged:plan.unchanged};
  if (options.dryRun) return report;
  await applyInstall({root,files,catalogVersion:'revert',now:options.now});
  return report;
}

export function formatRevert(report:RevertReport,style:Style=createStyle(false)):string {
  const lines=[style.heading(report.dryRun?'agents-cli revert (preview)':'agents-cli revert')];
  lines.push(style.ok(`Backup ${report.backup}: ${report.restored.length} file(s) ${report.dryRun?'would be restored':'restored'}, ${report.unchanged.length} already identical`));
  lines.push(...report.restored.slice(0,15).map(path=>`      ${path}`));
  if (report.restored.length>15) lines.push(`      ... and ${report.restored.length-15} more`);
  if (!report.dryRun) lines.push(style.dim('  The previous contents were backed up again, so this revert can itself be reverted.'));
  return lines.join('\n');
}
