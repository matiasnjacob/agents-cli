export type PermissionLevel = 'allow' | 'ask' | 'deny';
export type PermissionValue = PermissionLevel | Record<string, PermissionLevel>;
/** Per canonical agent id: permission name -> level, or a pattern -> level map (paths, commands, task targets). */
export type PermissionOverrides = Record<string, Record<string, PermissionValue>>;

const rank: Record<PermissionLevel, number> = {deny: 0, ask: 1, allow: 2};
const isLevel = (value: unknown): value is PermissionLevel => typeof value === 'string' && Object.hasOwn(rank, value);

export function isPermissionValue(value: unknown): value is PermissionValue {
  if (isLevel(value)) return true;
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0 && Object.values(value).every(isLevel);
}

function levelFor(value: unknown, pattern: string): number {
  if (isLevel(value)) return rank[value];
  if (value && typeof value === 'object') {
    const map = value as Record<string, unknown>;
    const level = map[pattern] ?? map['*'];
    if (isLevel(level)) return rank[level];
  }
  return rank.ask;
}

/** True when `next` lets the agent do more than `current` for any pattern. */
export function widens(current: unknown, next: PermissionValue): boolean {
  const patterns = new Set(['*', ...Object.keys(typeof current === 'object' && current ? current : {}), ...(typeof next === 'object' ? Object.keys(next) : [])]);
  for (const pattern of patterns) if (levelFor(next, pattern) > levelFor(current, pattern)) return true;
  return false;
}

interface WithPermission { id: string; permission?: Record<string, unknown> }

/** Applies project overrides over the catalog defaults, before any agent prefix is applied. */
export function applyPermissionOverrides<T extends WithPermission>(agents: T[], overrides?: PermissionOverrides, allowWidening = false): T[] {
  if (!overrides || !Object.keys(overrides).length) return agents;
  const known = new Set(agents.map(agent => agent.id));
  for (const id of Object.keys(overrides)) if (!known.has(id)) throw new Error(`Permission override for unselected agent '${id}'.`);
  return agents.map(agent => {
    const changes = overrides[agent.id];
    if (!changes) return agent;
    const permission = {...(agent.permission ?? {})};
    for (const [name, value] of Object.entries(changes)) {
      if (!Object.hasOwn(permission, name)) throw new Error(`Unknown permission '${name}' for agent '${agent.id}'; known: ${Object.keys(permission).join(', ')}.`);
      if (!isPermissionValue(value)) throw new Error(`Invalid permission value for '${agent.id}.${name}'; use allow, ask, deny or a non-empty pattern map of those.`);
      if (!allowWidening && widens(permission[name], value)) throw new Error(`Permission '${agent.id}.${name}' would widen the catalog default; set "allowPermissionWidening": true in agents-cli.config.json to allow it.`);
      permission[name] = value;
    }
    return {...agent, permission};
  });
}

/** Structural check used by configuration parsing (no catalog access). */
export function parsePermissionOverrides(value: unknown): PermissionOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('permissions must be an object.');
  const result: PermissionOverrides = {};
  for (const [agent, changes] of Object.entries(value)) {
    if (!/^[a-z][a-z-]*$/.test(agent)) throw new Error(`Invalid permissions agent id: ${agent}`);
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) throw new Error(`permissions.${agent} must be a non-empty object.`);
    result[agent] = {};
    for (const [name, level] of Object.entries(changes)) {
      if (!isPermissionValue(level)) throw new Error(`Invalid permission value for '${agent}.${name}'.`);
      result[agent][name] = level;
    }
  }
  return result;
}
