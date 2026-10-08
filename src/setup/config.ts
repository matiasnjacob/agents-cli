import { supportedPlatforms, supportedTrackers, type Platform, type Tracker } from '../contract.js';

export const suites = {
  complete: ['global-orchestrator','global-backend-developer','global-frontend-developer','global-aws-specialist','global-code-reviewer','global-qa-automator','global-qa-manual'],
  backend: ['global-orchestrator','global-backend-developer','global-code-reviewer','global-qa-automator','global-qa-manual'],
  frontend: ['global-orchestrator','global-frontend-developer','global-code-reviewer','global-qa-automator','global-qa-manual'],
  'review-qa': ['global-code-reviewer','global-qa-automator','global-qa-manual'],
  custom: [],
};
export type DecisionTool = 'route-task' | 'suggest-skills' | 'classify-failure' | 'rank-test-scenarios';
export const decisionTools: DecisionTool[] = ['route-task','suggest-skills','classify-failure','rank-test-scenarios'];
export interface DecisionConfig {
  provider: 'typesafe'; mode: 'off'|'shadow'|'assist'; model: string; apiKeyEnv: string;
  endpoint: string; timeoutMs: number; maxCalls: number; maxInputBytes: number;
  tools: DecisionTool[]; thresholds: Record<DecisionTool, number>; audit: boolean;
}
export interface ExternalSkill { id: string; repository: string; revision: string; path: string; }
export type SkillSelection = string | ExternalSkill;
export interface SetupConfig {
  schemaVersion: 1; platform: Platform; suite: keyof typeof suites; agents: string[];
  tracker: Tracker; skills: SkillSelection[]; mcps: string[]; decisionSupport: DecisionConfig;
}
export interface Manifest {
  catalogVersion: string;
  agents: {id:string; requiredSkills?:string[]; recommendedSkills?:string[]}[];
  skills: {id:string; path:string; sourceId:string}[];
}
export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
export function keys(value: Record<string,unknown>, allowed: string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown configuration field: ${key}`);
}
export function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !v.trim()) || new Set(value).size !== value.length) throw new Error(`${label} must contain unique nonempty strings.`);
  return value as string[];
}
export function decisionConfig(value: unknown = {}): DecisionConfig {
  const v=object(value,'decisionSupport');
  keys(v,['provider','mode','model','apiKeyEnv','endpoint','timeoutMs','maxCalls','maxInputBytes','tools','thresholds','audit']);
  const mode=v.mode ?? 'off';
  if (!['off','shadow','assist'].includes(String(mode))) throw new Error('Invalid decisionSupport mode.');
  if (v.provider !== undefined && v.provider !== 'typesafe') throw new Error('Invalid decision provider.');
  const apiKeyEnv=v.apiKeyEnv ?? 'TYPESAFE_API_KEY';
  if (typeof apiKeyEnv !== 'string' || !/^[A-Z_][A-Z0-9_]*$/.test(apiKeyEnv)) throw new Error('apiKeyEnv must be an environment variable name.');
  const endpoint=v.endpoint ?? 'https://api.typesafe.ai/v1/systemone';
  if (typeof endpoint !== 'string') throw new Error('Invalid decision endpoint.');
  const url=new URL(endpoint);
  if (url.username || url.password || url.search || url.hash || !(url.protocol==='https:' || (url.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)))) throw new Error('Decision endpoint requires HTTPS or loopback HTTP without credentials/query.');
  const limit=(name:string, fallback:number, max:number) => {
    const n=v[name] ?? fallback;
    if (typeof n!=='number' || !Number.isInteger(n) || n<1 || n>max) throw new Error(`Invalid ${name}.`);
    return n;
  };
  const tools=strings(v.tools ?? decisionTools,'decision tools') as DecisionTool[];
  if (tools.some(t=>!decisionTools.includes(t))) throw new Error('Unknown decision tool.');
  const thresholds={...Object.fromEntries(decisionTools.map(t=>[t,0.8]))} as Record<DecisionTool,number>;
  if (v.thresholds !== undefined) {
    const ts=object(v.thresholds,'thresholds'); keys(ts,decisionTools);
    for (const [k,n] of Object.entries(ts)) {
      if (typeof n!=='number' || !Number.isFinite(n) || n<0 || n>1) throw new Error('Invalid confidence threshold.');
      thresholds[k as DecisionTool]=n;
    }
  }
  const model=v.model ?? 'jev-1.13.0';
  if (typeof model!=='string' || !/^jev-[a-zA-Z0-9.-]+$/.test(model)) throw new Error('Invalid model.');
  if (v.audit!==undefined && typeof v.audit!=='boolean') throw new Error('audit must be boolean.');
  return {provider:'typesafe',mode:mode as DecisionConfig['mode'],model,apiKeyEnv,endpoint,timeoutMs:limit('timeoutMs',10000,120000),maxCalls:limit('maxCalls',100,1000),maxInputBytes:limit('maxInputBytes',32768,262144),tools,thresholds,audit:v.audit===true};
}
export function skillIds(config: SetupConfig): string[] { return config.skills.map(s=>typeof s==='string'?s:s.id); }
export function resolveConfig(value: unknown, manifest: Manifest): SetupConfig {
  const v=object(value,'setup config');
  keys(v,['schemaVersion','platform','suite','agents','tracker','skills','mcps','decisionSupport']);
  if (v.schemaVersion!==1) throw new Error('schemaVersion must be 1.');
  if (!supportedPlatforms.includes(v.platform as Platform)) throw new Error('Invalid platform.');
  if (!supportedTrackers.includes(v.tracker as Tracker)) throw new Error('Invalid tracker.');
  if (typeof v.suite!=='string' || !Object.hasOwn(suites,v.suite)) throw new Error('Invalid suite.');
  const suite=v.suite as keyof typeof suites;
  const agents=strings(v.agents ?? suites[suite],'agents');
  if (!agents.length || agents.some(id=>!manifest.agents.some(a=>a.id===id))) throw new Error('Select at least one known agent.');
  if (!Array.isArray(v.skills ?? [])) throw new Error('skills must be an array.');
  const skills: SkillSelection[]=(v.skills as unknown[] ?? []).map(s=>{
    if (typeof s==='string') { if (!manifest.skills.some(x=>x.id===s)) throw new Error(`Unknown skill: ${s}`); return s; }
    const x=object(s,'external skill'); keys(x,['id','repository','revision','path']);
    if (typeof x.id!=='string' || !/^[a-z0-9][a-z0-9-]*$/.test(x.id) || manifest.skills.some(s=>s.id===x.id)) throw new Error('Invalid external skill id.');
    if (typeof x.repository!=='string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(x.repository)) throw new Error('External repository must be GitHub owner/repo.');
    if (typeof x.revision!=='string' || !/^[a-f0-9]{40}$/.test(x.revision)) throw new Error('External revision must be a full commit SHA.');
    if (typeof x.path!=='string' || !x.path || x.path.startsWith('/') || x.path.includes('\\') || x.path.split('/').some(p=>p==='..'||p===''||p==='.git')) throw new Error('Unsafe external skill path.');
    return x as unknown as ExternalSkill;
  });
  const ids=skills.map(s=>typeof s==='string'?s:s.id);
  if (new Set(ids).size!==ids.length) throw new Error('Duplicate skills.');
  for (const agent of agents) for (const id of manifest.agents.find(a=>a.id===agent)?.requiredSkills ?? []) {
    if (!manifest.skills.some(s=>s.id===id)) throw new Error(`Missing required skill in catalog: ${id}`);
    if (!ids.includes(id)) { skills.push(id); ids.push(id); }
  }
  const mcps=strings(v.mcps ?? [],'mcps');
  if (mcps.some(id=>!['github','linear','trello','jev'].includes(id))) throw new Error('Unknown MCP.');
  const decisionSupport=decisionConfig(v.decisionSupport);
  if (mcps.includes('jev') && decisionSupport.mode==='off') throw new Error('Enable decisionSupport before selecting jev MCP.');
  return {schemaVersion:1,platform:v.platform as Platform,suite,agents,tracker:v.tracker as Tracker,skills,mcps,decisionSupport};
}
