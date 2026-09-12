import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor } from "../dist/doctor.js";

async function project() {
  return mkdtemp(join(tmpdir(), "agents-cli-doctor-"));
}

test("doctor reports actionable healthy local configuration without secrets", async () => {
  const root = await project();
  const catalog = await project();
  await writeFile(join(catalog, "manifest.json"), "{}\n");
  await mkdir(join(root, ".codex/agents"), { recursive: true });
  await writeFile(join(root, ".codex/agents/manifest.json"), JSON.stringify({ platform: "codex", agents: ["one"], skills: [] }));
  await writeFile(join(root, ".agents-cli.lock.json"), JSON.stringify({ schemaVersion: 1, files: {} }));
  const report = await runDoctor({ root, catalogRoot: catalog, env: { AGENTS_CLI_MCP_PROFILE: "agents-cli", AGENTS_CLI_ACTOR: "bot-alias" }, nodeVersion: "22.1.0" });
  assert.equal(report.ok, true);
  assert.deepEqual(report.checks.map(({ name }) => name), ["node", "catalog", "lockfile", "platform", "mcp", "identity"]);
  assert.match(report.checks.find(({ name }) => name === "mcp").message, /connectivity still requires/);
  assert.doesNotMatch(JSON.stringify(report), /token|secret|private/i);
});

test("doctor exposes missing installation, malformed lockfile and unavailable actor as actionable", async () => {
  const root = await project();
  const catalog = await project();
  await writeFile(join(catalog, "manifest.json"), "{}\n");
  await writeFile(join(root, ".agents-cli.lock.json"), "not-json\n");
  const report = await runDoctor({ root, catalogRoot: catalog, env: {}, nodeVersion: "18.20.0" });
  assert.equal(report.ok, false);
  assert.equal(report.checks.find(({ name }) => name === "node").status, "fail");
  assert.equal(report.checks.find(({ name }) => name === "lockfile").status, "fail");
  assert.equal(report.checks.find(({ name }) => name === "platform").status, "fail");
  assert.equal(report.checks.find(({ name }) => name === "mcp").status, "warn");
});
