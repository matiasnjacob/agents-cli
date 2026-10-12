export interface AgentWithIdentity { id: string; body: string; }

export function applyAgentPrefix<T extends AgentWithIdentity>(agents: T[], prefix?: string): T[] {
  if (!prefix) return agents;
  return agents.map(agent => {
    const baseId=agent.id;
    const id=`${prefix}-${baseId}`;
    const body=agent.body.replaceAll(`\`${baseId}\``,`\`${id}\``);
    return {...agent,id,body};
  });
}
