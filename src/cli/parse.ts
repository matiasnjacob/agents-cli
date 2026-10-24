import type { Platform, Tracker, ValidatedConfig } from "../contract.js";

const platforms = ["codex", "opencode", "claude", "pi"] as const;
const trackers = ["linear", "trello", "none"] as const;

type ParseResult =
  | { kind: "help" }
  | { kind: "error"; message: string }
  | { kind: "config"; config: ValidatedConfig };

export type CommandResult =
  | { kind: "version" }
  | { kind: "setup"; config?: string; yes: boolean; dryRun: boolean }
  | { kind: "suites-list" }
  | { kind: "mcp-list"; platform: Platform }
  | { kind: "decision"; command: string; input?: string; config?: string; dataset?: string; output?: string }
  | { kind: "help" }
  | { kind: "error"; message: string }
  | { kind: "validate"; config: ValidatedConfig }
  | { kind: "init"; config: ValidatedConfig & { skills: string[]; yes: boolean; dryRun: boolean } }
  | { kind: "skills-list"; platform: Platform }
  | { kind: "skills-add"; platform: Platform; skill: string; dryRun: boolean }
  | { kind: "skills-update"; id?: string; dryRun: boolean; yes: boolean }
  | { kind: "skills-add-external"; repository: string; path: string; ref?: string; id?: string; dryRun: boolean; yes: boolean }
  | { kind: "doctor"; json?: boolean }
  | { kind: "update"; dryRun: boolean; yes: boolean }
  | { kind: "check"; json: boolean }
  | { kind: "uninstall"; dryRun: boolean; yes: boolean; json: boolean }
  | { kind: "revert"; id?: string; list: boolean; dryRun: boolean; yes: boolean; json: boolean };

export function usage(): string {
  return [
    "Usage:",
    "  agents-cli --help",
    "  agents-cli --version",
    "  agents-cli setup [--config <file>] [--yes] [--dry-run]",
    "  agents-cli suites list",
    "  agents-cli mcp list --platform <codex|opencode|claude|pi>",
    "  agents-cli decision <route-task|suggest-skills|classify-failure|rank-test-scenarios> --input <file|-> [--config <file>]",
    "  agents-cli decision mcp [--config <file>]",
    "  agents-cli decision evaluate --dataset <file> --output <file> [--config <file>]",
    "  agents-cli validate --platform <codex|opencode|claude|pi> --tracker <linear|trello|none>",
    "  agents-cli init --platform <codex|opencode|claude|pi> --tracker <linear|trello|none> [--skills <id,id>] [--yes] [--dry-run]",
    "  agents-cli skills list --platform <codex|opencode|claude|pi>",
    "  agents-cli skills add <id> --platform <codex|opencode|claude|pi> [--dry-run]",
    "  agents-cli doctor [--json]",
    "  agents-cli update [--dry-run] [--yes]",
    "  agents-cli check [--json]",
    "  agents-cli uninstall [--dry-run] [--yes] [--json]",
    "  agents-cli revert [timestamp] [--list] [--dry-run] [--yes] [--json]",
    "  agents-cli skills update [id] [--dry-run] [--yes]",
    "  agents-cli skills add <owner/repo> --path <dir> [--ref <sha|branch|tag>] [--id <id>] [--dry-run] [--yes]",
    "  agents-cli update --dry-run",
    "",
    "Commands:",
    "  setup     Interactively configure the suite, MCPs, and skills.",
    "  validate  Validate a complete platform and tracker selection.",
    "  init      Install agents and selected skills into the current project.",
    "  skills    List or install selected skills.",
    "  doctor    Diagnose local configuration without exposing secrets.",
    "  update    Apply the configured setup again, or preview it with --dry-run.",
    "  uninstall Remove managed files and MCP entries (edited files are kept).",
    "  revert    Restore files from a backup in .agents-cli-backups.",
    "  check     Report drift between installed files and the catalog (exit 1 on drift).",
    "",
    "Options:",
    "  --version           Show the installed version.",
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
  if (args.length === 1 && (args[0] === "--version" || args[0] === "-v")) return { kind: "version" };
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) return { kind: "help" };
  const command = args[0];
  if (command === 'setup' || command === 'mcp' || command === 'suites' || command === 'decision') {
    const flags=command==='setup'?['--config','--yes','--dry-run']:command==='mcp'?['--platform']:command==='decision'?['--input','--config','--dataset','--output']:[];
    const start=command==='setup'?1:2;
    const seen=new Set<string>();
    for (let i=start;i<args.length;i++) {
      const flag=args[i];
      if (!flags.includes(flag) || seen.has(flag)) return {kind:'error',message:`Unknown or duplicate option '${flag}'.`};
      seen.add(flag);
      if (!['--yes','--dry-run'].includes(flag)) {
        if (!args[i+1] || args[i+1].startsWith('--')) return {kind:'error',message:`${flag} requires a value.`};
        i++;
      }
    }
    if (command==='setup') return {kind:'setup',config:option(args,'--config'),yes:args.includes('--yes'),dryRun:args.includes('--dry-run')};
    if (command==='suites' && args[1]==='list') return {kind:'suites-list'};
    if (command==='mcp' && args[1]==='list') {
      const platform=validPlatform(option(args,'--platform')); return typeof platform==='string'?{kind:'mcp-list',platform}:platform;
    }
    if (command==='decision' && ['route-task','suggest-skills','classify-failure','rank-test-scenarios','mcp','evaluate'].includes(args[1])) {
      return {kind:'decision',command:args[1],input:option(args,'--input'),config:option(args,'--config'),dataset:option(args,'--dataset'),output:option(args,'--output')};
    }
    return {kind:'error',message:'Unknown command.'};
  }
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
  if (command === "skills" && args[1] === "update") {
    const rest = args.slice(2);
    const flags = rest.filter((arg) => arg.startsWith("--"));
    if (flags.some((flag) => flag !== "--dry-run" && flag !== "--yes")) return { kind: "error", message: `Unknown option '${flags.find((flag) => flag !== "--dry-run" && flag !== "--yes")}'.` };
    const ids = rest.filter((arg) => !arg.startsWith("--"));
    if (ids.length > 1) return { kind: "error", message: "skills update takes at most one skill id." };
    return { kind: "skills-update", ...(ids[0] ? { id: ids[0] } : {}), dryRun: args.includes("--dry-run"), yes: args.includes("--yes") };
  }
  if (command === "skills" && args[1] === "add") {
    const skill = args[2];
    if (!skill || skill.startsWith("--")) return { kind: "error", message: "skills add requires a skill id." };
    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(skill)) {
      const known = ["--path", "--ref", "--id", "--dry-run", "--yes"];
      for (let i = 3; i < args.length; i++) {
        if (!known.includes(args[i])) return { kind: "error", message: `Unknown option '${args[i]}'.` };
        if (!["--dry-run", "--yes"].includes(args[i])) {
          if (!args[i + 1] || args[i + 1].startsWith("--")) return { kind: "error", message: `${args[i]} requires a value.` };
          i++;
        }
      }
      const path = option(args, "--path");
      if (!path) return { kind: "error", message: "skills add owner/repo requires --path <directory containing SKILL.md>." };
      const ref = option(args, "--ref"), id = option(args, "--id");
      return { kind: "skills-add-external", repository: skill, path, ...(ref ? { ref } : {}), ...(id ? { id } : {}), dryRun: args.includes("--dry-run"), yes: args.includes("--yes") };
    }
    const platform = validPlatform(option(args, "--platform"));
    if (typeof platform !== "string") return platform;
    return { kind: "skills-add", platform, skill, dryRun: args.includes("--dry-run") };
  }
  if (command === "doctor") {
    const extra = args.slice(1).filter((arg) => arg !== "--json");
    if (extra.length) return { kind: "error", message: `Unknown option '${extra[0]}'.` };
    return args.includes("--json") ? { kind: "doctor", json: true } : { kind: "doctor" };
  }
  if (command === "update") {
    const extra = args.slice(1).filter((arg) => arg !== "--dry-run" && arg !== "--yes");
    if (extra.length) return { kind: "error", message: `Unknown option '${extra[0]}'.` };
    return { kind: "update", dryRun: args.includes("--dry-run"), yes: args.includes("--yes") };
  }
  if (command === "uninstall" || command === "revert") {
    const allowed = command === "uninstall" ? ["--dry-run", "--yes", "--json"] : ["--list", "--dry-run", "--yes", "--json"];
    const flags = args.slice(1).filter((arg) => arg.startsWith("--"));
    const bad = flags.find((flag) => !allowed.includes(flag));
    if (bad) return { kind: "error", message: `Unknown option '${bad}'.` };
    const ids = args.slice(1).filter((arg) => !arg.startsWith("--"));
    if (command === "uninstall" && ids.length) return { kind: "error", message: `Unexpected argument '${ids[0]}'.` };
    if (ids.length > 1) return { kind: "error", message: "revert takes at most one backup id." };
    const common = { dryRun: args.includes("--dry-run"), yes: args.includes("--yes"), json: args.includes("--json") };
    return command === "uninstall" ? { kind: "uninstall", ...common } : { kind: "revert", ...(ids[0] ? { id: ids[0] } : {}), list: args.includes("--list"), ...common };
  }
  if (command === "check") {
    const extra = args.slice(1).filter((arg) => arg !== "--json");
    if (extra.length) return { kind: "error", message: `Unknown option '${extra[0]}'.` };
    return { kind: "check", json: args.includes("--json") };
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
