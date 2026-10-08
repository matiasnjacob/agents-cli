import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile, cp, lstat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

export const LOCKFILE = ".agents-cli.lock.json";

export interface InstallFile {
  path: string;
  content: string;
  /** Hash of the exact user configuration read and merged by a resolver. */
  expectedHash?: string;
  remove?: boolean;
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
  removes: InstallFile[];
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
  await assertNoSymlinks(options.root,LOCKFILE);
  const lock = await readLock(options.root);
  const paths = new Set<string>();
  const creates: InstallFile[] = [];
  const updates: InstallFile[] = [];
  const removes: InstallFile[] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];
  const backups: string[] = [];

  for (const file of options.files) {
    assertSafePath(file.path);
    await assertNoSymlinks(options.root, file.path);
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

    if (file.remove) {
      if (current===undefined) unchanged.push(file.path);
      else if (previousHash!==undefined && sha256(current)===previousHash) {removes.push(file);backups.push(file.path);}
      else conflicts.push(file.path);
    } else if (current === undefined) {
      creates.push(file);
    } else if (current === file.content) {
      unchanged.push(file.path);
    } else if ((file.expectedHash !== undefined && sha256(current) === file.expectedHash) || (previousHash !== undefined && sha256(current) === previousHash)) {
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
      ...Object.fromEntries(options.files.filter(file=>!file.remove).map((file) => [file.path, sha256(file.content)])),
    },
  };
  for (const file of options.files) if (file.remove) delete nextLock.files[file.path];
  return {
    creates,
    updates,
    removes,
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
  const changed = [...plan.updates, ...plan.creates, ...plan.removes, plan.lockfile];
  const originals = new Map<string, string | undefined>();
  for (const file of changed) {
    await assertNoSymlinks(options.root, file.path);
    try { originals.set(file.path, await readFile(join(options.root,file.path),'utf8')); }
    catch (error) { if (!isMissingFile(error)) throw error; originals.set(file.path,undefined); }
  }
  for (const path of plan.backups) {
    const source = join(options.root, path);
    const backup = join(backupDir, path);
    await assertNoSymlinks(options.root,relative(options.root,backup));
    await mkdir(dirname(backup), { recursive: true });
    await cp(source, backup);
  }
  const written: string[]=[];
  let temporary: string | undefined;
  let temporaryOwned=false;
  try {
  for (const file of changed) {
    await assertNoSymlinks(options.root, file.path);
    const destination = join(options.root, file.path);
    await mkdir(dirname(destination), { recursive: true });
    if (file.remove) {await unlink(destination);written.push(file.path);continue;}
    temporary = `${destination}.agents-cli-tmp`;
    await writeFile(temporary, file.content, {encoding:"utf8",flag:'wx'});
    temporaryOwned=true;
    await rename(temporary, destination);
    temporary=undefined;
    temporaryOwned=false;
    written.push(file.path);
  }
  } catch (error) {
    const recovery: string[]=[];
    if (temporary && temporaryOwned) try { await unlink(temporary); } catch { /* Report recovery below. */ }
    for (const path of written.reverse()) {
      try {
        await assertNoSymlinks(options.root,path);
        const original=originals.get(path);
        if (original===undefined) await unlink(join(options.root,path));
        else await writeFile(join(options.root,path),original,'utf8');
      } catch { recovery.push(path); }
    }
    throw new Error(`Installation failed; ${recovery.length ? `recovery failed for ${recovery.join(', ')}; inspect backups.` : 'written files restored.'}`,{cause:error});
  }
  return plan;
}

export async function assertNoSymlinks(root:string,path:string): Promise<void> {
  assertSafePath(path);
  let current=root;
  for (const part of path.split(/[\\/]/)) {
    current=join(current,part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Unsafe symlink in installation path: ${path}`); }
    catch (error) { if (!isMissingFile(error) && (error as NodeJS.ErrnoException).code!=='ENOTDIR') throw error; }
  }
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
