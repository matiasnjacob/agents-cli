export interface AgentWithIdentity { id: string; body: string; permission?: Record<string, unknown>; }

export function applyAgentPrefix<T extends AgentWithIdentity>(agents: T[], prefix?: string, canonicalIds: string[] = agents.map(agent => agent.id)): T[] {
  if (!prefix) return agents;
  const names = new Map(canonicalIds.map(id => [id, `${prefix}-${id}`]));
  return agents.map(agent => {
    const id=names.get(agent.id) ?? `${prefix}-${agent.id}`;
    let body=agent.body;
    for (const [base, prefixed] of names) body=body.replaceAll(`\`${base}\``,`\`${prefixed}\``);
    const permission=agent.permission ? {...agent.permission} : undefined;
    if (permission && typeof permission.task === 'object' && permission.task !== null && !Array.isArray(permission.task)) {
      const task=permission.task as Record<string, unknown>;
      permission.task=Object.fromEntries(Object.entries(task).map(([key,value])=>[names.get(key) ?? key,value]));
    }
    return {...agent,id,body,...(permission?{permission}:{})};
  });
}
