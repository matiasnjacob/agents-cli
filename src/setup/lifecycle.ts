import {executeSetup,readSetupConfig} from './command.js';
import {createStyle,type Style} from './ui.js';

export interface DriftReport {
  upToDate:boolean;
  creates:string[];updates:string[];removes:string[];conflicts:string[];
  environment:{add:string[]};
}

/** Read-only comparison of the installed files with what the current catalog would render. */
export async function checkSetup(root:string,catalogRoot:string):Promise<DriftReport> {
  const config=await readSetupConfig(root,catalogRoot);
  if (!config) throw new Error('No agents-cli.config.json found; run `agents-cli setup` first.');
  const previousExit=process.exitCode;
  const report=await executeSetup(root,catalogRoot,config,true);
  process.exitCode=previousExit;
  const drift={creates:report.creates,updates:report.updates,removes:report.removes,conflicts:report.conflicts,environment:{add:report.environment.add}};
  return {...drift,upToDate:!drift.creates.length && !drift.updates.length && !drift.removes.length && !drift.conflicts.length && !drift.environment.add.length};
}

export function formatDrift(report:DriftReport,style:Style=createStyle(false)):string {
  if (report.upToDate) return [style.heading('agents-cli check'),style.ok('Everything is up to date.')].join('\n');
  const lines=[style.heading('agents-cli check')];
  for (const [label,paths,render] of [['to create',report.creates,style.warn],['to update',report.updates,style.warn],['to remove',report.removes,style.warn],['in conflict (edited locally)',report.conflicts,style.fail]] as const) {
    if (!paths.length) continue;
    lines.push(render(`${paths.length} file(s) ${label}`));
    lines.push(...paths.slice(0,10).map(path=>`      ${path}`));
    if (paths.length>10) lines.push(`      ... and ${paths.length-10} more`);
  }
  if (report.environment.add.length) lines.push(style.warn(`.env is missing: ${report.environment.add.join(', ')}`));
  lines.push('',`  Run ${style.command('agents-cli update')} to apply the changes; edited files are preserved as conflicts.`);
  return lines.join('\n');
}
