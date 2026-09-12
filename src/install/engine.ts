import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile, cp } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

export const LOCKFILE = ".agents-cli.lock.json";

export interface InstallFile {
  path: string;
  content: string;
}

export interface InstallOptions {
  root: string;
  files: InstallFile[];
  catalogVersion: string;
  dryRun?: boolean;
  now?: Date;
}

export interface InstallPlan {
  creates: InstallFile[];
  updates: InstallFile[];
  unchanged: string[];
  conflicts: string[];
  lockfile: InstallFile;
  backups: string[];
}

interface Lockfile {
  schemaVersion: 1;
  catalogVersion: string;
  files: Record<string, string>;
}

export async function planInstall(options: InstallOptions): Promise<InstallPlan> {
  const lock = await readLock(options.root);
  const paths = new Set<string>();
  const creates: InstallFile[] = [];
  const updates: InstallFile[] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];
  const backups: string[] = [];

  for (const file of options.files) {
    assertSafePath(file.path);
    if (paths.has(file.path)) throw new Error(`Duplicate installation path: ${file.path}`);
    paths.add(file.path);
    const destination = join(options.root, file.path);
    const previousHash = lock?.files[file.path];
    let current: string | undefined;
    try {
      current = await readFile(destination, "utf8");
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    if (current === undefined) {
      creates.push(file);
    } else if (current === file.content) {
      unchanged.push(file.path);
    } else if (previousHash !== undefined && sha256(current) === previousHash) {
      updates.push(file);
      backups.push(file.path);
    } else {
      conflicts.push(file.path);
    }

  }

  const nextLock: Lockfile = {
    schemaVersion: 1,
    catalogVersion: options.catalogVersion,
    files: {
      ...(lock?.files ?? {}),
      ...Object.fromEntries(options.files.map((file) => [file.path, sha256(file.content)])),
    },
  };
  return {
    creates,
    updates,
    unchanged,
    conflicts,
    backups,
    lockfile: { path: LOCKFILE, content: `${JSON.stringify(nextLock, null, 2)}\n` },
  };
}

export async function applyInstall(options: InstallOptions): Promise<InstallPlan> {
  const plan = await planInstall(options);
  if (options.dryRun || plan.conflicts.length > 0) return plan;

  const backupDir = join(options.root, ".agents-cli-backups", (options.now ?? new Date()).toISOString().replaceAll(":", "-"));
  for (const path of plan.backups) {
    const source = join(options.root, path);
    const backup = join(backupDir, path);
    await mkdir(dirname(backup), { recursive: true });
    await cp(source, backup);
  }
  for (const file of [...plan.creates, ...plan.updates, plan.lockfile]) {
    const destination = join(options.root, file.path);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.agents-cli-tmp`;
    await writeFile(temporary, file.content, "utf8");
    await rename(temporary, destination);
  }
  return plan;
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function assertSafePath(path: string): void {
  if (!path || isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path) || path.split(/[\\/]/).includes("..")) {
    throw new Error(`Unsafe installation path: ${path}`);
  }
  const normalized = relative(".", path);
  if (normalized === "" || normalized.startsWith(`..${sep}`) || normalized === "..") {
    throw new Error(`Unsafe installation path: ${path}`);
  }
}

async function readLock(root: string): Promise<Lockfile | undefined> {
  try {
    return JSON.parse(await readFile(join(root, LOCKFILE), "utf8")) as Lockfile;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
