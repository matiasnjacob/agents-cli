import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const cli = join(root, "dist/cli/index.js");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

test("version flags print the package version outside a project", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "agents-cli-version-"));
  try {
    for (const flag of ["--version", "-v"]) {
      const result = spawnSync(process.execPath, [cli, flag], { cwd, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), packageJson.version);
      assert.equal(result.stderr, "");
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("setup dry-run reaches the wizard command without writing project files", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "agents-cli-setup-smoke-"));
  const project = join(tempRoot, "project");
  const configFile = join(tempRoot, "setup.json");
  const config = {
    schemaVersion: 1,
    platform: "codex",
    suite: "review-qa",
    agents: ["global-code-reviewer"],
    tracker: "none",
    skills: [],
    mcps: [],
    decisionSupport: { mode: "off" },
  };
  try {
    await mkdir(project);
    await writeFile(configFile, JSON.stringify(config));
    const result = execFileSync(process.execPath, [cli, "setup", "--config", configFile, "--dry-run"], { cwd: project, encoding: "utf8" });
    assert.equal(JSON.parse(result).dryRun, true);
    assert.deepEqual(await readdir(project), []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
