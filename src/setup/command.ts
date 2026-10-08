import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {readCatalog} from '../catalog/skills.js';
import {applyInstall} from '../install/engine.js';
import {runDoctor} from '../doctor.js';
import {resolveConfig,type Manifest,type SetupConfig} from './config.js';
import {prepareSetup} from './install.js';
import {collectAnswers,terminalPrompts} from './wizard.js';
export async function readSetupConfig(root:string,catalogRoot:string,file='agents-cli.config.json'):Promise<SetupConfig|undefined> {
  let raw:string;
  try {raw=await readFile(join(root,file),'utf8');} catch(e) {if ((e as NodeJS.ErrnoException).code==='ENOENT') return;throw e;}
  return resolveConfig(JSON.parse(raw),await readCatalog(catalogRoot) as Manifest);
}
export async function executeSetup(root:string,catalogRoot:string,config:SetupConfig,dryRun:boolean) {
  const manifest=await readCatalog(catalogRoot);
  const prepared=await prepareSetup(root,catalogRoot,config);
  const plan=await applyInstall({root,catalogVersion:manifest.catalogVersion,files:prepared.files,dryRun});
  const report={config,platform:config.platform,dryRun,creates:plan.creates.map(f=>f.path),updates:plan.updates.map(f=>f.path),unchanged:plan.unchanged,conflicts:plan.conflicts,pending:prepared.pending};
  if (plan.conflicts.length) process.exitCode=1;
  return report;
}
export async function setupCommand(root:string,catalogRoot:string,options:{config?:string;yes:boolean;dryRun:boolean}) {
  let config:SetupConfig;
  let prompts:ReturnType<typeof terminalPrompts>|undefined;
  try {
    if (options.config) {
      config=(await readSetupConfig(root,catalogRoot,options.config))!;
      if (!config) throw new Error('Setup --config file was not found.');
    } else {
      if (!process.stdin.isTTY || options.yes) throw new Error('Setup requires an interactive terminal, or --config <file> with --yes/--dry-run.');
      prompts=terminalPrompts();
      config=await collectAnswers(prompts.ask,await readCatalog(catalogRoot) as Manifest,await readSetupConfig(root,catalogRoot));
    }
    if (options.dryRun) return await executeSetup(root,catalogRoot,config,true);
    if (!options.yes) {
      if (!process.stdin.isTTY) throw new Error('Use --yes to apply --config without a terminal, or --dry-run to preview.');
      prompts ??=terminalPrompts();
      const preview=await executeSetup(root,catalogRoot,config,true);
      process.stderr.write(`${JSON.stringify(preview,null,2)}\n`);
      if (preview.conflicts.length) return preview;
      const answer=await prompts.ask('Apply this configuration? [yes/no]: ');
      if (answer?.trim().toLowerCase()!=='yes') throw new Error('Setup cancelled; no files written.');
    }
    const report=await executeSetup(root,catalogRoot,config,false);
    return {...report,...(!report.conflicts.length?{diagnostics:await runDoctor({root,catalogRoot})}:{})};
  } finally {prompts?.close();}
}
