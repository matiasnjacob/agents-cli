import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Platform } from "./contract.js";
import { LOCKFILE } from "./install/engine.js";

const execFileAsync = promisify(execFile);

export type DiagnosticStatus = "pass" | "warn" | "fail";
export interface Diagnostic { name: string; status: DiagnosticStatus; message: string; }
export interface DoctorReport { ok: boolean; checks: Diagnostic[]; }

interface DoctorOptions { root: string; catalogRoot: string; env?: NodeJS.ProcessEnv; nodeVersion?: string; }

export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const checks: Diagnostic[] = [];
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  checks.push(major(nodeVersion) >= 20
    ? { name: "node", status: "pass", message: `Node.js ${nodeVersion} satisfies >=20.` }
    : { name: "node", status: "fail", message: `Node.js ${nodeVersion} is unsupported; install Node.js >=20.` });

  checks.push(await readable("catalog", join(options.catalogRoot, "manifest.json"), "Catalog manifest is available.", "Catalog manifest is missing or unreadable; reinstall agents-cli or set AGENTS_CLI_CATALOG_ROOT."));
  checks.push(await lockfileCheck(options.root));
  checks.push(await platformCheck(options.root));
  checks.push(await dockerCheck(options.env ?? process.env));
  checks.push(identityCheck(options.env ?? process.env));
  return { ok: checks.every((check) => check.status !== "fail"), checks };
}

function major(version: string): number {
  const value = Number.parseInt(version.split(".")[0] ?? "0", 10);
  return Number.isFinite(value) ? value : 0;
}

async function readable(name: string, file: string, pass: string, fail: string): Promise<Diagnostic> {
  try { await access(file); return { name, status: "pass", message: pass }; }
  catch { return { name, status: "fail", message: fail }; }
}

async function lockfileCheck(root: string): Promise<Diagnostic> {
  try {
    const lock = JSON.parse(await readFile(join(root, LOCKFILE), "utf8")) as { schemaVersion?: number; files?: unknown };
    if (lock.schemaVersion !== 1 || !lock.files || typeof lock.files !== "object") throw new Error("invalid shape");
    return { name: "lockfile", status: "pass", message: "Managed-file hashes are readable." };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { name: "lockfile", status: "warn", message: "No installation lockfile found; run init first." };
    return { name: "lockfile", status: "fail", message: "The installation lockfile is malformed; restore it or rerun init after preserving local edits." };
  }
}

async function platformCheck(root: string): Promise<Diagnostic> {
  for (const platform of ["codex", "opencode", "claude"] as Platform[]) {
    const file = platform === "codex" ? ".codex/agents/manifest.json" : `.${platform}/agents/manifest.json`;
    try {
      const manifest = JSON.parse(await readFile(join(root, file), "utf8")) as { platform?: string; agents?: unknown[] };
      if (manifest.platform !== platform || !Array.isArray(manifest.agents)) throw new Error("invalid manifest");
      return { name: "platform", status: "pass", message: `${platform} configuration found with ${manifest.agents.length} agents.` };
    } catch { /* Try the next supported platform. */ }
  }
  return { name: "platform", status: "fail", message: "No supported platform manifest found; run init with --platform codex, opencode, or claude." };
}

async function dockerCheck(env: NodeJS.ProcessEnv): Promise<Diagnostic> {
  if (!env.AGENTS_CLI_MCP_PROFILE) return { name: "mcp", status: "warn", message: "MCP profile is not declared; set AGENTS_CLI_MCP_PROFILE to document the intended Docker MCP profile. Connectivity was not tested." };
  try {
    await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"]);
    return { name: "mcp", status: "pass", message: `Docker MCP profile '${env.AGENTS_CLI_MCP_PROFILE}' is declared and Docker is reachable; server/tool connectivity still requires an explicit MCP call.` };
  } catch { return { name: "mcp", status: "fail", message: `Docker is unavailable for MCP profile '${env.AGENTS_CLI_MCP_PROFILE}'; start Docker Desktop and retry.` }; }
}

function identityCheck(env: NodeJS.ProcessEnv): Diagnostic {
  if (!env.AGENTS_CLI_ACTOR) return { name: "identity", status: "warn", message: "No external actor alias is declared; doctor does not authenticate or print credentials." };
  return { name: "identity", status: "pass", message: `External actor alias '${env.AGENTS_CLI_ACTOR}' is declared; credential validity is not inferred.` };
}
