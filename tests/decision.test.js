import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {decisionConfig} from '../dist/setup/config.js';
const input={task:'Implement API',candidates:[{id:'backend',description:'Server API'},{id:'frontend',description:'UI'}]};
async function server(t,handler) {
  const s=createServer(handler);s.listen(0,'127.0.0.1');await once(s,'listening');
  t.after(()=>{s.closeAllConnections();s.close();});
  return `http://127.0.0.1:${s.address().port}/v1/systemone`;
}
function answer(choice='backend',confidence=0.95) {return {model:'jev-1.13.0',answers:{decision:{type:'choice',choice,confidence,probabilities:{backend:0.96,frontend:0.02,'insufficient-context':0.02}}},usage:{input_tokens:100,output_tokens:0}};}
test('client sends typed bounded questions and separates shadow from assist',async(t)=>{
  const {DecisionClient}=await import('../dist/decision/client.js');
  let seen;
  const endpoint=await server(t,async(req,res)=>{let data='';for await(const c of req)data+=c;seen=JSON.parse(data);assert.equal(req.headers.authorization,'Bearer test-key');res.end(JSON.stringify(answer()));});
  const shadow=new DecisionClient(decisionConfig({mode:'shadow',endpoint}),{TYPESAFE_API_KEY:'test-key'});
  const observed=await shadow.evaluate('route-task',input);
  assert.equal(observed.status,'observed');assert.equal(observed.recommendation,null);assert.equal(observed.observed,'backend');
  assert.equal(seen.questions.decision.type,'choice');assert.equal(seen.model,'jev-1.13.0');
  assert.equal(seen.questions.decision.criteria.backend,'Server API');
  const assist=new DecisionClient(decisionConfig({mode:'assist',endpoint}),{TYPESAFE_API_KEY:'test-key'});
  assert.equal((await assist.evaluate('route-task',input)).recommendation,'backend');
});
test('off and missing credentials never call remote; malformed responses and low confidence abstain',async(t)=>{
  const {DecisionClient}=await import('../dist/decision/client.js');
  let calls=0;
  const endpoint=await server(t,(req,res)=>{calls++;res.end(JSON.stringify(answer('not-a-candidate')));});
  assert.equal((await new DecisionClient(decisionConfig({mode:'off',endpoint}),{}).evaluate('route-task',input)).status,'disabled');
  assert.equal((await new DecisionClient(decisionConfig({mode:'assist',endpoint}),{}).evaluate('route-task',input)).status,'unavailable');
  assert.equal(calls,0);
  assert.equal((await new DecisionClient(decisionConfig({mode:'assist',endpoint}),{TYPESAFE_API_KEY:'secret'}).evaluate('route-task',input)).status,'unavailable');
  const lowEndpoint=await server(t,(req,res)=>res.end(JSON.stringify(answer('backend',0.2))));
  const low=await new DecisionClient(decisionConfig({mode:'assist',endpoint:lowEndpoint}),{TYPESAFE_API_KEY:'secret'}).evaluate('route-task',input);
  assert.equal(low.status,'abstained');assert.equal(low.recommendation,null);
});
test('timeout, redirects and per-process call budgets fail safely without exposing API keys',async(t)=>{
  const {DecisionClient}=await import('../dist/decision/client.js');
  const endpoint=await server(t,()=>{});
  const client=new DecisionClient(decisionConfig({mode:'assist',endpoint,timeoutMs:20,maxCalls:1}),{TYPESAFE_API_KEY:'private-secret'});
  const timed=await client.evaluate('route-task',input);
  assert.equal(timed.status,'unavailable');assert.equal(JSON.stringify(timed).includes('private-secret'),false);
  assert.match((await client.evaluate('route-task',input)).diagnostic,/budget/i);
  const redirect=await server(t,(req,res)=>{res.writeHead(302,{Location:'https://evil.example'});res.end();});
  assert.equal((await new DecisionClient(decisionConfig({mode:'assist',endpoint:redirect}),{TYPESAFE_API_KEY:'secret'}).evaluate('route-task',input)).status,'unavailable');
});
test('input validation prevents duplicate candidate IDs, secrets and disabled tools',async()=>{
  const {DecisionClient}=await import('../dist/decision/client.js');
  const client=new DecisionClient(decisionConfig({mode:'assist'}),{});
  await assert.rejects(client.evaluate('route-task',{...input,candidates:[input.candidates[0],input.candidates[0]]}),/unique/);
  await assert.rejects(client.evaluate('classify-failure',{command:'test',output:'oops',apiKey:'secret'}),/Unknown|secret/);
  assert.equal((await new DecisionClient(decisionConfig({mode:'assist',tools:[]}),{}).evaluate('route-task',input)).status,'disabled');
});
test('ranks scenarios using real Score probabilities and stable deterministic sorting',async(t)=>{
  const {DecisionClient}=await import('../dist/decision/client.js');
  const endpoint=await server(t,(req,res)=>res.end(JSON.stringify({model:'jev-1.13.0',answers:{scenario_0:{type:'score',score:0.2,confidence:0.9,probabilities:{"0":0.8,"1":0.2,"2":0},legend:{"0":"Low impact","1":"Material impact","2":"Critical impact"}},scenario_1:{type:'score',score:1.9,confidence:0.9,probabilities:{"0":0,"1":0.1,"2":0.9},legend:{"0":"Low impact","1":"Material impact","2":"Critical impact"}}},usage:{input_tokens:100,output_tokens:0}})));
  const result=await new DecisionClient(decisionConfig({mode:'assist',endpoint}),{TYPESAFE_API_KEY:'key'}).evaluate('rank-test-scenarios',{criteria:'risk',scenarios:[{id:'minor',description:'cosmetic'},{id:'critical',description:'payment'}]});
  assert.equal(result.recommendation[0].id,'critical');
});
