import {readFile,open,unlink} from 'node:fs/promises';
import {decisionConfig,decisionTools,object,type DecisionTool} from '../setup/config.js';
import {DecisionClient} from './client.js';
import {serveMcp} from './mcp.js';
import {evaluateDataset,validateDataset} from './evaluate.js';
async function jsonFile(path:string) {return JSON.parse(await readFile(path,'utf8'));}
export async function decisionCommand(options:{command:string;config?:string;input?:string;dataset?:string;output?:string;env?:NodeJS.ProcessEnv}) {
  let config=decisionConfig();
  try {const value=object(await jsonFile(options.config ?? 'agents-cli.config.json'),'config');config=decisionConfig(value.decisionSupport ?? value);}
  catch(e) {if ((e as NodeJS.ErrnoException).code!=='ENOENT'||options.config) throw e;}
  if (options.command==='mcp') {await serveMcp(new DecisionClient(config));return;}
  if (options.command==='evaluate') {
    if (!options.dataset||!options.output) throw new Error('Evaluation requires --dataset and --output.');
    if (config.mode==='off') throw new Error('Enable JEV explicitly in --config to run a paid evaluation.');
    const cases=validateDataset(await jsonFile(options.dataset));
    const output=await open(options.output,'wx',0o600);
    let complete=false;
    try {
      const report=await evaluateDataset(cases,new DecisionClient({...config,mode:'shadow'},options.env),config.thresholds);
      await output.writeFile(JSON.stringify(report,null,2)+'\n');
      await output.sync();
      complete=true;
      console.log(JSON.stringify({output:options.output,complete:report.complete,partitions:report.partitions},null,2));
      if (!report.complete) process.exitCode=1;
    } finally {
      await output.close();
      if (!complete) await unlink(options.output).catch(()=>{});
    }
    return;
  }
  if (!options.input || !decisionTools.includes(options.command as DecisionTool)) throw new Error('Decision requires --input <file|->.');
  let input:unknown;
  if (options.input==='-') {
    let data='';for await (const chunk of process.stdin) {data+=chunk.toString();if (Buffer.byteLength(data)>config.maxInputBytes) throw new Error('Input exceeds size limit.');}
    input=JSON.parse(data);
  } else input=await jsonFile(options.input);
  const result=await new DecisionClient(config).evaluate(options.command as DecisionTool,input);
  console.log(JSON.stringify(result,null,2));
  if (result.status==='unavailable') process.exitCode=1;
}
