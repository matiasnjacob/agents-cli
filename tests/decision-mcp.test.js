import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {join} from 'node:path';
const cli=join(import.meta.dirname,'../dist/cli/index.js');
test('MCP initializes, lists typed tools, calls off mode and isolates malformed requests',async()=>{
  const child=spawn(process.execPath,[cli,'decision','mcp'],{stdio:['pipe','pipe','pipe']});
  const requests=[
    {jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}}},
    {jsonrpc:'2.0',method:'notifications/initialized'},
    {jsonrpc:'2.0',id:2,method:'tools/list'},
    {jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'route_task',arguments:{task:'API',candidates:[{id:'backend',description:'API'}]}}},
    {jsonrpc:'2.0',id:4,method:'unknown'},
  ];
  let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
  child.stdin.end(requests.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const [code]=await once(child,'close');
  assert.equal(code,0,stderr);
  const messages=stdout.trim().split('\n').map(JSON.parse);
  assert.equal(messages.find(m=>m.id===1).result.protocolVersion,'2025-06-18');
  assert.equal(messages.find(m=>m.id===2).result.tools.length,4);
  assert.equal(JSON.parse(messages.find(m=>m.id===3).result.content[0].text).status,'disabled');
  assert.equal(messages.find(m=>m.id===4).error.code,-32601);
});
test('decision CLI supports stdin and reports disabled mode as JSON',async()=>{
  const child=spawn(process.execPath,[cli,'decision','route-task','--input','-'],{stdio:['pipe','pipe','pipe']});
  let stdout='';child.stdout.on('data',c=>stdout+=c);child.stdin.end(JSON.stringify({task:'API',candidates:[{id:'backend',description:'API'}]}));
  const [code]=await once(child,'close');assert.equal(code,0);assert.equal(JSON.parse(stdout).status,'disabled');
});
test('evaluator distinguishes calibration/evaluation and unavailable from mistakes',async()=>{
  const {evaluateDataset}=await import('../dist/decision/evaluate.js');
  const cases=[{id:'cal',partition:'calibration',language:'es',tool:'route-task',input:{},expected:'backend',baseline:'frontend'},{id:'eval',partition:'evaluation',language:'en',tool:'route-task',input:{},expected:'backend',baseline:'backend'}];
  let index=0;
  const report=await evaluateDataset(cases,{evaluate:async()=>index++===0?{status:'observed',observed:'backend',confidence:0.95,durationMs:2,usage:{input_tokens:10,output_tokens:0}}:{status:'unavailable',durationMs:3}});
  assert.equal(report.partitions.calibration.correct,1);
  assert.equal(report.partitions.calibration.baselineAccuracy,0);
  assert.equal(report.partitions.evaluation.unavailable,1);
  assert.equal(report.partitions.evaluation.accuracy,null);
});
