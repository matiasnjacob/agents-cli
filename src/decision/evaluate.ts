import {decisionTools,object,keys,type DecisionTool} from '../setup/config.js';
import {buildQuestions} from './questions.js';
import type {DecisionResult} from './client.js';
interface Case {id:string;partition:'calibration'|'evaluation';language:'es'|'en';tool:DecisionTool;input:unknown;expected:string|string[];baseline?:string|string[]}
interface Evaluator {evaluate(tool:DecisionTool,input:unknown):Promise<DecisionResult|Partial<DecisionResult>>}
export async function evaluateDataset(value:unknown,client:Evaluator,thresholds:Partial<Record<DecisionTool,number>>={}) {
  const cases=validateDataset(value);
  const rows:{id:string;partition:string;language:string;expected:string|string[];baseline?:string|string[];result:Partial<DecisionResult>;predicted:unknown;unavailable:boolean;abstained:boolean;correct:boolean}[]=[];
  for (const c of cases) {
    const result=await client.evaluate(c.tool,c.input);
    const observed=result.observed ?? result.recommendation;
    const predicted=Array.isArray(observed)?observed.map(v=>v.id):observed;
    const unavailable=['unavailable','disabled'].includes(result.status??'')||predicted==null;
    const abstained=!unavailable&&((result.confidence??0)<(thresholds[c.tool]??0.8)||['none','insufficient-context','insufficient-evidence'].includes(String(predicted)));
    rows.push({id:c.id,partition:c.partition,language:c.language,expected:c.expected,baseline:c.baseline,result,predicted,unavailable,abstained,correct:!unavailable&&JSON.stringify(predicted)===JSON.stringify(c.expected)});
  }
  const summarize=(partition:string)=>{
    const subset=rows.filter(r=>r.partition===partition),available=subset.filter(r=>!r.unavailable),accepted=available.filter(r=>!r.abstained),baselines=subset.filter(r=>r.baseline!==undefined);
    return {total:subset.length,unavailable:subset.filter(r=>r.unavailable).length,abstentions:available.filter(r=>r.abstained).length,correct:available.filter(r=>r.correct).length,accuracy:available.length?available.filter(r=>r.correct).length/available.length:null,accepted:accepted.length,acceptedErrors:accepted.filter(r=>!r.correct).length,acceptedErrorRate:accepted.length?accepted.filter(r=>!r.correct).length/accepted.length:null,baselineAccuracy:baselines.length?baselines.filter(r=>JSON.stringify(r.baseline)===JSON.stringify(r.expected)).length/baselines.length:null,durationMs:subset.reduce((s,r)=>s+(r.result.durationMs??0),0),inputTokens:subset.reduce((s,r)=>s+(r.result.usage?.input_tokens??0),0)};
  };
  return {schemaVersion:1,complete:rows.every(r=>!r.unavailable),partitions:{calibration:summarize('calibration'),evaluation:summarize('evaluation')},rows};
}

export function validateDataset(value:unknown):Case[] {
  if (!Array.isArray(value)||!value.length||value.length>500) throw new Error('Dataset requires 1–500 cases.');
  const ids=new Set<string>();
  const cases=value.map(v=>{
    const c=object(v,'case');keys(c,['id','partition','language','tool','input','expected','baseline']);
    if (typeof c.id!=='string'||ids.has(c.id)||!['calibration','evaluation'].includes(String(c.partition))||!['es','en'].includes(String(c.language))||!decisionTools.includes(c.tool as DecisionTool)) throw new Error('Invalid dataset identity, partition, language or tool.');
    ids.add(c.id);
    const valid=(v:unknown)=>typeof v==='string'||(Array.isArray(v)&&v.every(x=>typeof x==='string'));
    if (!valid(c.expected)||(c.baseline!==undefined&&!valid(c.baseline))) throw new Error('Invalid expected/baseline label.');
    const item=c as unknown as Case;
    const request=buildQuestions(item.tool,item.input);
    if (Buffer.byteLength(JSON.stringify({state:request.state,questions:request.questions}))>262144) throw new Error('Decision input exceeds size limit.');
    return item;
  });
  return cases;
}
