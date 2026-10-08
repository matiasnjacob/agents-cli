import {appendFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {assertNoSymlinks} from '../install/engine.js';
import {object,type DecisionConfig,type DecisionTool} from '../setup/config.js';
import {buildQuestions,questionVersion,type Question} from './questions.js';
export interface DecisionResult {
  status:'disabled'|'unavailable'|'observed'|'abstained'|'recommended';tool:DecisionTool;questionVersion:string;mode:DecisionConfig['mode'];model:string;
  recommendation:unknown;observed?:unknown;probabilities?:unknown;confidence?:number;diagnostic?:string;
  durationMs:number;usage?:{input_tokens:number;output_tokens:number};
}
function probability(value:unknown):number {if (typeof value!=='number'||!Number.isFinite(value)||value<0||value>1) throw new Error('Invalid probability.');return value;}
function distribution(value:unknown,ids:string[]):Record<string,number> {
  const v=object(value,'probabilities');
  if (Object.keys(v).length!==ids.length || ids.some(id=>!Object.hasOwn(v,id))) throw new Error('Invalid distribution keys.');
  const result=Object.fromEntries(ids.map(id=>[id,probability(v[id])]));
  if (Math.abs(Object.values(result).reduce((a,b)=>a+b,0)-1)>0.01) throw new Error('Invalid probability sum.');
  return result;
}
function validateAnswer(value:unknown,q:Question) {
  const a=object(value,'answer');
  if (a.type!==q.type) throw new Error('Answer type mismatch.');
  const confidence=probability(a.confidence);
  if (q.type==='choice') {
    const probabilities=distribution(a.probabilities,Object.keys(q.criteria));
    if (typeof a.choice!=='string'||!Object.hasOwn(probabilities,a.choice)||probabilities[a.choice]+0.001<Math.max(...Object.values(probabilities))) throw new Error('Invalid choice.');
    return {value:a.choice,confidence,probabilities};
  }
  const levels=q.criteria as string[],ids=levels.map((_,i)=>String(i));
  const probabilities=distribution(a.probabilities,ids),legend=object(a.legend,'legend');
  if (ids.some((id,i)=>legend[id]!==levels[i])) throw new Error('Score legend mismatch.');
  const expected=Object.entries(probabilities).reduce((sum,[k,p])=>sum+Number(k)*p,0);
  if (typeof a.score!=='number'||!Number.isFinite(a.score)||Math.abs(a.score-expected)>0.02) throw new Error('Invalid score.');
  return {value:a.score,confidence,probabilities};
}
export class DecisionClient {
  private calls=0;
  constructor(readonly config:DecisionConfig,private env:NodeJS.ProcessEnv=process.env,private root=process.cwd()) {}
  async evaluate(tool:DecisionTool,input:unknown):Promise<DecisionResult> {
    const started=Date.now();
    const base:DecisionResult={status:'disabled',tool,questionVersion,mode:this.config.mode,model:this.config.model,recommendation:null,durationMs:0};
    if (this.config.mode==='off'||!this.config.tools.includes(tool)) return base;
    const request=buildQuestions(tool,input),serialized=JSON.stringify({state:request.state,questions:request.questions});
    if (Buffer.byteLength(serialized)>this.config.maxInputBytes) throw new Error('Decision input exceeds size limit.');
    const key=this.env[this.config.apiKeyEnv];
    if (key && serialized.includes(key)) throw new Error('Decision state contains the configured API secret.');
    let result:DecisionResult;
    if (!key) result={...base,status:'unavailable',diagnostic:`Missing configured API key environment variable ${this.config.apiKeyEnv}.`};
    else if (this.calls>=this.config.maxCalls) result={...base,status:'unavailable',diagnostic:'Decision call budget exhausted for this process.'};
    else {
      this.calls++;
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),this.config.timeoutMs);
      try {
        const response=await fetch(this.config.endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({state:request.state,questions:request.questions,model:this.config.model}),signal:abort.signal,redirect:'error'});
        if (!response.ok) {await response.body?.cancel();throw new Error(`HTTP ${response.status}`);}
        const chunks:Uint8Array[]=[];let size=0;
        if (!response.body) throw new Error('Empty response.');
        for await (const chunk of response.body) {size+=chunk.byteLength;if (size>262144) throw new Error('Response too large.');chunks.push(chunk);}
        const data=object(JSON.parse(Buffer.concat(chunks).toString('utf8')),'response');
        if (typeof data.model!=='string'||!/^jev-[a-zA-Z0-9.-]+$/.test(data.model)) throw new Error('Invalid response model.');
        const answers=object(data.answers,'answers'),usage=object(data.usage,'usage');
        if (Object.keys(answers).length!==Object.keys(request.questions).length) throw new Error('Answer count mismatch.');
        for (const field of ['input_tokens','output_tokens']) if (typeof usage[field]!=='number'||!Number.isInteger(usage[field])||(usage[field] as number)<0) throw new Error('Invalid usage.');
        const validated=Object.entries(request.questions).map(([id,q])=>validateAnswer(answers[id],q));
        const confidence=Math.min(...validated.map(a=>a.confidence));
        const value=request.ids ? validated.map((a,i)=>({id:request.ids![i],score:a.value as number,confidence:a.confidence})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)) : validated[0].value;
        const abstained=confidence<this.config.thresholds[tool] || value===request.abstain;
        result={...base,model:data.model,status:this.config.mode==='shadow'?'observed':abstained?'abstained':'recommended',recommendation:this.config.mode==='assist'&&!abstained?value:null,...(this.config.mode==='shadow'?{observed:value}:{}),probabilities:request.ids?Object.fromEntries(request.ids.map((id,i)=>[id,validated[i].probabilities])):validated[0].probabilities,confidence,usage:{input_tokens:usage.input_tokens as number,output_tokens:usage.output_tokens as number},...(abstained?{diagnostic:'Insufficient evidence or confidence; retain the agent fallback.'}:{})};
      } catch {result={...base,status:'unavailable',diagnostic:abort.signal.aborted?'TypeSafe request timed out.':'TypeSafe request failed or returned an invalid response; check connection, credentials, rate limit and contract.'};}
      finally {clearTimeout(timer);}
    }
    result.durationMs=Date.now()-started;
    if (this.config.audit) {
      try {
        const path='.agents-cli-decisions/events.jsonl';await assertNoSymlinks(this.root,path);
        await mkdir(join(this.root,'.agents-cli-decisions'),{recursive:true});
        await appendFile(join(this.root,path),JSON.stringify({inputHash:createHash('sha256').update(serialized).digest('hex'),...result})+'\n',{mode:0o600});
      } catch {result.diagnostic=(result.diagnostic?result.diagnostic+' ':'')+'Audit could not be written.';}
    }
    return result;
  }
}
