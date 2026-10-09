import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

async function smokePackage(tarball) {
  const tempRoot = await mkdtemp(join(tmpdir(), "agents-cli-package-smoke-"));
  const prefix = join(tempRoot, "prefix");
  const project = join(tempRoot, "project");
  const cache = join(tempRoot, "npm-cache");

  try {
    await mkdir(project);
    execFileSync("npm", ["install", "--prefix", prefix, "--no-audit", "--no-fund", "--ignore-scripts", "--cache", cache, resolve(tarball)], { stdio: "inherit" });

    const packageRoot = join(prefix, "node_modules", "@matiasnjacob", "agents-cli");
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    const bin = join(prefix, "node_modules", ".bin", "agents-cli");
    const invoke = (args) => execFileSync(bin, args, { cwd: project, encoding: "utf8" });

    assert.equal(invoke(["--version"]).trim(), manifest.version, "--version must match the installed package metadata");
    assert.equal(invoke(["-v"]).trim(), manifest.version, "-v must match the installed package metadata");
    assert.match(invoke(["--help"]), /setup\s+Interactively configure the suite/);

    const config = join(packageRoot, "examples", "backend-claude.json");
    const setup = JSON.parse(invoke(["setup", "--config", config, "--dry-run"]));
    assert.equal(setup.dryRun, true);
    assert.deepEqual(await readdir(project), [], "setup --dry-run must not write project files");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const [tarball] = process.argv.slice(2);
if (!tarball) {
  console.error("Usage: node scripts/smoke-package.mjs <package-tarball>");
  process.exitCode = 2;
} else {
  try {
    await smokePackage(tarball);
    console.log("Packed CLI smoke test passed.");
  } catch (error) {
    console.error(`Packed CLI smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
