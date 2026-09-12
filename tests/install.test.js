import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyInstall, LOCKFILE, planInstall } from "../dist/install/engine.js";

async function project() {
  return mkdtemp(join(tmpdir(), "agents-cli-install-"));
}

test("installs files and records a lockfile", async () => {
  const root = await project();
  const plan = await applyInstall({ root, catalogVersion: "0.1.0", files: [{ path: "config/agent.md", content: "agent\n" }] });
  assert.deepEqual(plan.conflicts, []);
  assert.equal(await readFile(join(root, "config/agent.md"), "utf8"), "agent\n");
  assert.match(await readFile(join(root, LOCKFILE), "utf8"), /catalogVersion/);
});

test("is idempotent on the second installation", async () => {
  const root = await project();
  const files = [{ path: "agent.md", content: "same\n" }];
  await applyInstall({ root, catalogVersion: "0.1.0", files });
  const plan = await applyInstall({ root, catalogVersion: "0.1.0", files });
  assert.deepEqual(plan.unchanged, ["agent.md"]);
  assert.deepEqual(plan.updates, []);
});

test("dry-run does not write files", async () => {
  const root = await project();
  const plan = await applyInstall({ root, catalogVersion: "0.1.0", dryRun: true, files: [{ path: "agent.md", content: "preview\n" }] });
  assert.deepEqual(plan.creates.map((file) => file.path), ["agent.md"]);
  await assert.rejects(readFile(join(root, "agent.md")));
});

test("detects local edits as conflicts and preserves them", async () => {
  const root = await project();
  const files = [{ path: "agent.md", content: "managed\n" }];
  await applyInstall({ root, catalogVersion: "0.1.0", files });
  await writeFile(join(root, "agent.md"), "user edit\n");
  const plan = await applyInstall({ root, catalogVersion: "0.1.0", files: [{ path: "agent.md", content: "new managed\n" }] });
  assert.deepEqual(plan.conflicts, ["agent.md"]);
  assert.equal(await readFile(join(root, "agent.md"), "utf8"), "user edit\n");
});

test("backs up a managed file before updating it", async () => {
  const root = await project();
  const files = [{ path: "agent.md", content: "first\n" }];
  await applyInstall({ root, catalogVersion: "0.1.0", files, now: new Date("2026-01-02T03:04:05.000Z") });
  const plan = await applyInstall({ root, catalogVersion: "0.1.0", files: [{ path: "agent.md", content: "second\n" }], now: new Date("2026-01-02T03:05:05.000Z") });
  assert.deepEqual(plan.backups, ["agent.md"]);
  await access(join(root, ".agents-cli-backups/2026-01-02T03-05-05.000Z/agent.md"));
  assert.equal(await readFile(join(root, "agent.md"), "utf8"), "second\n");
});

test("preserves unrelated configuration and rejects traversal", async () => {
  const root = await project();
  await writeFile(join(root, "existing.json"), "keep\n");
  await applyInstall({ root, catalogVersion: "0.1.0", files: [{ path: "new.md", content: "new\n" }] });
  assert.equal(await readFile(join(root, "existing.json"), "utf8"), "keep\n");
  await assert.rejects(planInstall({ root, catalogVersion: "0.1.0", files: [{ path: "../outside", content: "nope" }] }), /Unsafe installation path/);
});

test("rejects absolute paths across POSIX and Windows notation", async () => {
  const root = await project();
  await assert.rejects(planInstall({ root, catalogVersion: "0.1.0", files: [{ path: "/tmp/outside", content: "nope" }] }), /Unsafe installation path/);
  await assert.rejects(planInstall({ root, catalogVersion: "0.1.0", files: [{ path: "C:\\\\outside", content: "nope" }] }), /Unsafe installation path/);
});

test("reports an unmanaged destination as a conflict", async () => {
  const root = await project();
  await writeFile(join(root, "agent.md"), "owned by user\n");
  const plan = await applyInstall({ root, catalogVersion: "0.1.0", files: [{ path: "agent.md", content: "managed\n" }] });
  assert.deepEqual(plan.conflicts, ["agent.md"]);
  await assert.rejects(access(join(root, LOCKFILE)));
});

test("dry-run reports conflicts without creating backups or lockfile", async () => {
  const root = await project();
  await applyInstall({ root, catalogVersion: "0.1.0", files: [{ path: "agent.md", content: "first\n" }] });
  await writeFile(join(root, "agent.md"), "local\n");
  const lockBefore = await readFile(join(root, LOCKFILE), "utf8");
  const plan = await applyInstall({ root, catalogVersion: "0.1.0", dryRun: true, files: [{ path: "agent.md", content: "second\n" }] });
  assert.deepEqual(plan.conflicts, ["agent.md"]);
  await assert.rejects(access(join(root, ".agents-cli-backups")));
  assert.equal(await readFile(join(root, LOCKFILE), "utf8"), lockBefore);
});

test("fails clearly when the lockfile is malformed", async () => {
  const root = await project();
  await writeFile(join(root, LOCKFILE), "not-json\n");
  await assert.rejects(planInstall({ root, catalogVersion: "0.1.0", files: [{ path: "agent.md", content: "new\n" }] }), /Unexpected token/);
});

test("rejects duplicate destination paths", async () => {
  const root = await project();
  await assert.rejects(planInstall({
    root,
    catalogVersion: "0.1.0",
    files: [{ path: "same.md", content: "one\n" }, { path: "same.md", content: "two\n" }],
  }), /Duplicate installation path/);
});
