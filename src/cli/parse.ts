import type { Platform, Tracker, ValidatedConfig } from "../contract.js";

const platforms = ["codex", "opencode", "claude", "pi"] as const;
const trackers = ["linear", "trello", "none"] as const;

type ParseResult =
  | { kind: "help" }
  | { kind: "error"; message: string }
  | { kind: "config"; config: ValidatedConfig };

export type CommandResult =
  | { kind: "help" }
  | { kind: "error"; message: string }
  | { kind: "validate"; config: ValidatedConfig }
  | { kind: "init"; config: ValidatedConfig & { skills: string[]; yes: boolean; dryRun: boolean } }
  | { kind: "skills-list"; platform: Platform }
  | { kind: "skills-add"; platform: Platform; skill: string; dryRun: boolean }
  | { kind: "doctor" }
  | { kind: "update"; dryRun: boolean };

export function usage(): string {
  return [
    "Usage:",
    "  agents-cli --help",
    "  agents-cli validate --platform <codex|opencode|claude|pi> --tracker <linear|trello|none>",
    "  agents-cli init --platform <codex|opencode|claude|pi> --tracker <linear|trello|none> [--skills <id,id>] [--yes] [--dry-run]",
    "  agents-cli skills list --platform <codex|opencode|claude|pi>",
    "  agents-cli skills add <id> --platform <codex|opencode|claude|pi> [--dry-run]",
    "  agents-cli doctor",
    "  agents-cli update --dry-run",
    "",
    "Commands:",
    "  validate  Validate a complete platform and tracker selection.",
    "  init      Install agents and selected skills into the current project.",
    "  skills    List or install selected skills.",
    "  doctor    Diagnose local configuration without exposing secrets.",
    "  update    Preview safe catalog updates and local conflicts.",
    "",
    "Options:",
    "  --platform <value>  Target agent runtime.",
    "  --tracker <value>   Project tracker integration.",
    "  --help              Show this help.",
  ].join("\n");
}

export function parseCliArgs(args: string[]): ParseResult {
  const result = parseCommandArgs(args);
  if (result.kind === "validate") return { kind: "config", config: result.config };
  if (result.kind === "help") return { kind: "help" };
  if (result.kind === "error") return { kind: "error", message: result.message };
  return { kind: "error", message: "This parser only supports validate; use parseCommandArgs for other commands." };
}

export function parseCommandArgs(args: string[]): CommandResult {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) return { kind: "help" };
  const command = args[0];
  if (command === "validate") {
    const config = requiredConfig(args, "validate");
    if ("kind" in config) return config;
    return { kind: "validate", config };
  }
  if (command === "init") {
    const config = requiredConfig(args, "init");
    if ("kind" in config) return config;
    const skills = option(args, "--skills")?.split(",").map((skill) => skill.trim()).filter(Boolean) ?? [];
    return { kind: "init", config: { ...config, skills, yes: args.includes("--yes"), dryRun: args.includes("--dry-run") } };
  }
  if (command === "skills" && args[1] === "list") {
    const platform = validPlatform(option(args, "--platform"));
    return typeof platform === "string" ? { kind: "skills-list", platform } : platform;
  }
  if (command === "skills" && args[1] === "add") {
    const skill = args[2];
    if (!skill || skill.startsWith("--")) return { kind: "error", message: "skills add requires a skill id." };
    const platform = validPlatform(option(args, "--platform"));
    if (typeof platform !== "string") return platform;
    return { kind: "skills-add", platform, skill, dryRun: args.includes("--dry-run") };
  }
  if (command === "doctor") return { kind: "doctor" };
  if (command === "update") {
    if (!args.includes("--dry-run")) return { kind: "error", message: "update currently requires --dry-run; applying updates is not implemented." };
    return { kind: "update", dryRun: true };
  }
  return { kind: "error", message: `Unknown command '${command}'.` };
}

function requiredConfig(args: string[], command: string): ValidatedConfig | { kind: "error"; message: string } {
  const platform = validPlatform(option(args, "--platform"));
  if (typeof platform !== "string") return platform;
  const tracker = option(args, "--tracker");
  if (!tracker) return { kind: "error", message: `${command} requires both --platform and --tracker.` };
  if (!trackers.includes(tracker as Tracker)) return { kind: "error", message: `Invalid tracker '${tracker}'.` };
  return { platform, tracker: tracker as Tracker };
}

function validPlatform(value: string | undefined): Platform | { kind: "error"; message: string } {
  if (!value) return { kind: "error", message: "A platform is required: codex, opencode, claude, or pi." };
  if (!platforms.includes(value as Platform)) return { kind: "error", message: `Invalid platform '${value}'.` };
  return value as Platform;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return undefined;
  return args[index + 1];
}
