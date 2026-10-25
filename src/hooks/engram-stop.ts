import {readFile} from 'node:fs/promises';

export interface StopInput {transcript_path?:string;stop_hook_active?:boolean}
export interface StopDecision {decision?:'block';reason?:string}

/**
 * Claude Code Stop hook. Blocks once when the session used tools but never saved an Engram session summary.
 * `stop_hook_active` means we already blocked this stop, so it is always allowed to finish (no loops).
 */
/** Tool calls in a Claude Code JSONL transcript; tool definitions and prose that merely mention a name are ignored. */
function toolCalls(transcript:string):string[] {
  const names:string[]=[];
  for (const line of transcript.split('\n')) {
    if (!line.includes('tool_use')) continue;
    let entry:{message?:{content?:unknown}};
    try {entry=JSON.parse(line);} catch {continue;}
    const content=entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as {type?:string;name?:string}[]) if (block?.type==='tool_use' && typeof block.name==='string') names.push(block.name);
  }
  return names;
}

export function evaluateEngramStop(input:StopInput,transcript:string):StopDecision {
  if (input.stop_hook_active) return {};
  const calls=toolCalls(transcript);
  const summarized=calls.some(name=>name.endsWith('mem_session_summary'));
  if (calls.length && !summarized) return {decision:'block',reason:'Before finishing, save the Engram session with mem_session_summary (Goal, Instructions, Discoveries, Accomplished, Next Steps, Relevant Files), then send your final report.'};
  return {};
}

export async function runEngramStopHook(stdin:string):Promise<string> {
  let input:StopInput={};
  try {input=JSON.parse(stdin) as StopInput;} catch {return '{}';}
  let transcript='';
  if (input.transcript_path) try {transcript=await readFile(input.transcript_path,'utf8');} catch {return '{}';}
  return JSON.stringify(evaluateEngramStop(input,transcript));
}
