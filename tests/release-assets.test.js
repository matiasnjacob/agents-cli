import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

test("installer resolves releases through the GitHub API and verifies checksums", async () => {
  const installer = await readFile(join(root, "install.sh"), "utf8");
  assert.match(installer, /releases\/latest/);
  assert.match(installer, /AGENTS_CLI_VERSION/);
  assert.match(installer, /SHA256SUMS/);
  assert.match(installer, /sha256sum|shasum/);
  assert.match(installer, /npm install --global/);
  assert.doesNotMatch(installer, /github\.com\/.*\.html/);
});

test("release workflow requests provenance permissions and attests the tarball", async () => {
  const workflow = await readFile(join(root, ".github/workflows/release.yml"), "utf8");
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /attestations:\s*write/);
  assert.match(workflow, /actions\/attest-build-provenance@v2/);
  assert.match(workflow, /subject-path: release\/\*\.tgz/);
  assert.match(workflow, /cd release && sha256sum [^\n]+ > SHA256SUMS/);
  assert.doesNotMatch(workflow, /sha256sum ["']?release\//);
});
