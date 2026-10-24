import {executeSetup,readSetupConfig} from './command.js';
import {createStyle,type Style} from './ui.js';
import {latestRevision,type LatestRevision} from './external.js';

export interface DriftReport {
  upToDate:boolean;
  creates:string[];updates:string[];removes:string[];conflicts:string[];
  environment:{add:string[]};
  /** Informational: a newer upstream revision never counts as drift. */
  externalSkills:ExternalStatus[];
}
export interface ExternalStatus {id:string;repository:string;pinned:string;latest?:string;status:'current'|'outdated'|'unverified'}

export async function externalStatuses(skills:readonly unknown[],latest:LatestRevision=latestRevision,only?:string):Promise<ExternalStatus[]> {
  const result:ExternalStatus[]=[];
  for (const skill of skills) {
    if (typeof skill==='string') continue;
    const {id,repository,revision}=skill as {id:string;repository:string;revision:string};
    if (only && id!==only) continue;
    const upstream=await latest(repository);
    result.push({id,repository,pinned:revision,...(upstream?{latest:upstream}:{}),status:!upstream?'unverified':upstream===revision?'current':'outdated'});
  }
  return result;
}

/** Read-only comparison of the installed files with what the current catalog would render. */
export async function checkSetup(root:string,catalogRoot:string,latest:LatestRevision=latestRevision):Promise<DriftReport> {
  const config=await readSetupConfig(root,catalogRoot);
  if (!config) throw new Error('No agents-cli.config.json found; run `agents-cli setup` first.');
  const previousExit=process.exitCode;
  const report=await executeSetup(root,catalogRoot,config,true);
  process.exitCode=previousExit;
  const drift={creates:report.creates,updates:report.updates,removes:report.removes,conflicts:report.conflicts,environment:{add:report.environment.add},externalSkills:await externalStatuses(config.skills,latest)};
  return {...drift,upToDate:!drift.creates.length && !drift.updates.length && !drift.removes.length && !drift.conflicts.length && !drift.environment.add.length};
}

function upstreamLines(report:DriftReport,style:Style):string[] {
  const lines:string[]=[];
  for (const skill of report.externalSkills) {
    if (skill.status==='outdated') lines.push(style.warn(`${skill.id}: upstream has a newer revision (${skill.pinned.slice(0,7)} -> ${skill.latest!.slice(0,7)}); compare: https://github.com/${skill.repository}/compare/${skill.pinned}...${skill.latest}`));
    else if (skill.status==='unverified') lines.push(style.step(`${skill.id}: upstream revision not verified (offline or unavailable).`));
  }
  if (lines.some(line=>line.includes('newer revision'))) lines.push(`  Run ${style.command('agents-cli skills update')} to move the pin.`);
  return lines;
}

export function formatDrift(report:DriftReport,style:Style=createStyle(false)):string {
  if (report.upToDate) return [style.heading('agents-cli check'),style.ok('Everything is up to date.'),...upstreamLines(report,style)].join('\n');
  const lines=[style.heading('agents-cli check')];
  for (const [label,paths,render] of [['to create',report.creates,style.warn],['to update',report.updates,style.warn],['to remove',report.removes,style.warn],['in conflict (edited locally)',report.conflicts,style.fail]] as const) {
    if (!paths.length) continue;
    lines.push(render(`${paths.length} file(s) ${label}`));
    lines.push(...paths.slice(0,10).map(path=>`      ${path}`));
    if (paths.length>10) lines.push(`      ... and ${paths.length-10} more`);
  }
  if (report.environment.add.length) lines.push(style.warn(`.env is missing: ${report.environment.add.join(', ')}`));
  lines.push(...upstreamLines(report,style));
  lines.push('',`  Run ${style.command('agents-cli update')} to apply the changes; edited files are preserved as conflicts.`);
  return lines.join('\n');
}
