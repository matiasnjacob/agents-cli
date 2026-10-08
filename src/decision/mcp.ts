import {createInterface} from 'node:readline';
import type {Readable,Writable} from 'node:stream';
import {object,decisionTools,type DecisionTool} from '../setup/config.js';
import {DecisionClient} from './client.js';
const candidateSchema={type:'array',minItems:1,maxItems:100,items:{type:'object',properties:{id:{type:'string'},description:{type:'string'}},required:['id','description'],additionalProperties:false}};
const names:Record<string,DecisionTool>={route_task:'route-task',suggest_skills:'suggest-skills',classify_failure:'classify-failure',rank_test_scenarios:'rank-test-scenarios'};
export const tools=Object.entries(names).map(([name,tool])=>({
  name,description:`Optional JEV ${tool}. Recommends only; never grants permissions, asserts acceptance or changes files. Shadow results are observations, not actionable recommendations.`,
  inputSchema:tool==='classify-failure'?{type:'object',properties:{command:{type:'string'},output:{type:'string'},context:{type:'string'}},required:['command','output'],additionalProperties:false}:tool==='rank-test-scenarios'?{type:'object',properties:{criteria:{type:'string'},scenarios:candidateSchema},required:['criteria','scenarios'],additionalProperties:false}:{type:'object',properties:{task:{type:'string'},candidates:candidateSchema},required:['task','candidates'],additionalProperties:false},
}));
export async function serveMcp(client:DecisionClient,input:Readable=process.stdin,output:Writable=process.stdout) {
  const rl=createInterface({input,crlfDelay:Infinity});let initialized=false;
  const send=(message:unknown)=>output.write(JSON.stringify(message)+'\n');
  for await (const line of rl) {
    let request:Record<string,unknown>;
    try {if (Buffer.byteLength(line)>262144) throw new Error();request=object(JSON.parse(line),'request');}
    catch {send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON message.'}});continue;}
    const id=request.id;
    const error=(code:number,message:string)=>send({jsonrpc:'2.0',id:id??null,error:{code,message}});
    if (request.jsonrpc!=='2.0'||typeof request.method!=='string'||(id!==undefined && typeof id!=='string'&&typeof id!=='number')) {error(-32600,'Invalid JSON-RPC request.');continue;}
    if (id===undefined) continue;
    try {
      let result:unknown;
      if (request.method==='initialize') {
        const params=object(request.params,'initialize params');
        const versions=['2025-06-18','2025-03-26','2024-11-05'];
        result={protocolVersion:versions.includes(String(params.protocolVersion))?params.protocolVersion:versions[0],capabilities:{tools:{}},serverInfo:{name:'agents-cli-decisions',version:'0.3.0'}};
        initialized=true;
      } else if (request.method==='ping') result={};
      else if (!initialized) {error(-32000,'Initialize the MCP session first.');continue;}
      else if (request.method==='tools/list') result={tools};
      else if (request.method==='tools/call') {
        const params=object(request.params,'tool params'),tool=names[String(params.name)];
        if (!tool) {error(-32602,'Unknown tool.');continue;}
        try {result={content:[{type:'text',text:JSON.stringify(await client.evaluate(tool,params.arguments))}]};}
        catch {result={isError:true,content:[{type:'text',text:'Invalid decision input; check schema, IDs, secrets and limits.'}]};}
      } else {error(-32601,'Method not found.');continue;}
      send({jsonrpc:'2.0',id,result});
    } catch {error(-32602,'Invalid method parameters.');}
  }
}
