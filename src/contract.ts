export const supportedPlatforms = ["codex", "opencode", "claude"] as const;
export const supportedTrackers = ["linear", "trello", "none"] as const;

export type Platform = (typeof supportedPlatforms)[number];
export type Tracker = (typeof supportedTrackers)[number];

export interface ValidatedConfig {
  platform: Platform;
  tracker: Tracker;
}

export interface PlatformContract {
  platform: Platform;
  agentOutput: string;
  skillOutput: string;
  instructionOutput: string;
  permissionModel: string;
  notes: string[];
}
