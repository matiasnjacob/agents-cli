import type { Platform, Tracker, ValidatedConfig } from "../contract.js";

const platforms = ["codex", "opencode", "claude"] as const;
const trackers = ["linear", "trello", "none"] as const;

type ParseResult =
  | { kind: "help" }
  | { kind: "error"; message: string }
  | { kind: "config"; config: ValidatedConfig };

export function usage(): string {
  return [
    "Usage:",
    "  agents-cli --help",
    "  agents-cli validate --platform <codex|opencode|claude> --tracker <linear|trello|none>",
    "",
    "Commands:",
    "  validate  Validate a complete platform and tracker selection.",
    "",
    "Options:",
    "  --platform <value>  Target agent runtime.",
    "  --tracker <value>   Project tracker integration.",
    "  --help              Show this help.",
  ].join("\n");
}

export function parseCliArgs(args: string[]): ParseResult {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { kind: "help" };
  }

  if (args[0] !== "validate") {
    return { kind: "error", message: `Unknown command '${args[0]}'.` };
  }

  const platform = option(args, "--platform");
  const tracker = option(args, "--tracker");
  if (!platform || !tracker) {
    return { kind: "error", message: "validate requires both --platform and --tracker." };
  }
  if (!platforms.includes(platform as Platform)) {
    return { kind: "error", message: `Invalid platform '${platform}'.` };
  }
  if (!trackers.includes(tracker as Tracker)) {
    return { kind: "error", message: `Invalid tracker '${tracker}'.` };
  }

  return {
    kind: "config",
    config: { platform: platform as Platform, tracker: tracker as Tracker },
  };
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) return undefined;
  return args[index + 1];
}
