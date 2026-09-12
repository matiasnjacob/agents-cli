import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = join(import.meta.dirname, "..");
const cli = join(root, "dist", "cli", "index.js");
const catalog = join(root, "catalog");

async function run(args, cwd) {
  const result = await execFileAsync(process.execPath, [cli, ...args], { cwd, env: { ...process.env, AGENTS_CLI_CATALOG_ROOT: catalog } });
  return JSON.parse(result.stdout);
}

for (const platform of ["codex", "opencode", "claude"]) {
  test(`${platform} init is idempotent, preserves unrelated files, and supports dry-run`, async () => {
    const root = await mkdtemp(join(tmpdir(), `agents-cli-${platform}-`));
    await writeFile(join(root, "keep.txt"), "owned by project\n");
    const dryRun = await run(["init", "--platform", platform, "--tracker", "none", "--yes", "--dry-run"], root);
    assert.equal(dryRun.dryRun, true);
    assert.deepEqual(await readdir(root), ["keep.txt"]);

    const first = await run(["init", "--platform", platform, "--tracker", "none", "--yes"], root);
    assert.equal(first.conflicts.length, 0);
    const before = await readFile(join(root, "keep.txt"), "utf8");
    const second = await run(["init", "--platform", platform, "--tracker", "none", "--yes"], root);
    assert.equal(second.conflicts.length, 0);
    assert.equal(second.creates.length, 0);
    assert.equal(second.updates.length, 0);
    assert.equal(await readFile(join(root, "keep.txt"), "utf8"), before);
  });
}
