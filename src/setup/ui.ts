const codes={bold:'1',dim:'2',red:'31',green:'32',yellow:'33',cyan:'36',magenta:'35'} as const;

export function colorEnabled(env:NodeJS.ProcessEnv=process.env,isTTY:boolean=Boolean(process.stdout.isTTY)):boolean {
  if (env.NO_COLOR!==undefined && env.NO_COLOR!=='') return false;
  if (env.FORCE_COLOR!==undefined) return env.FORCE_COLOR!=='0';
  return isTTY && env.TERM!=='dumb';
}

export function paint(style:keyof typeof codes,text:string,enabled:boolean=colorEnabled()):string {
  return enabled?`\u001b[${codes[style]}m${text}\u001b[0m`:text;
}

export interface Style {
  heading:(text:string)=>string;
  ok:(text:string)=>string;
  step:(text:string)=>string;
  warn:(text:string)=>string;
  fail:(text:string)=>string;
  badge:(label:string,text:string)=>string;
  command:(text:string)=>string;
  dim:(text:string)=>string;
}

export function createStyle(enabled:boolean=colorEnabled()):Style {
  const p=(style:keyof typeof codes,text:string)=>paint(style,text,enabled);
  return {
    heading:text=>`\n  ${p('green','◆')} ${p('bold',text)}`,
    ok:text=>`  ${p('dim','│')} ${p('green',`✓ ${text}`)}`,
    step:text=>`  ${p('dim','│')} ${p('cyan',`· ${text}`)}`,
    warn:text=>`  ${p('dim','│')} ${p('yellow',`! ${text}`)}`,
    fail:text=>`  ${p('dim','│')} ${p('red',`✗ ${text}`)}`,
    badge:(label,text)=>`\n  ${enabled?`\u001b[45;30m ${label} \u001b[0m`:`[${label}]`} ${p('bold',text)}`,
    command:text=>p('cyan',text),
    dim:text=>p('dim',text),
  };
}
