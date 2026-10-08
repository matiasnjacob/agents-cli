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

test("npm package uses the scoped identity and preserves the CLI executable", async () => {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(manifest.name, "@matiasnjacob/agents-cli");
  assert.equal(manifest.version, "0.4.0");
  assert.equal(manifest.bin["agents-cli"], "dist/cli/index.js");
  assert.equal(manifest.publishConfig.access, "public");
  assert.equal(manifest.repository.url, "git+https://github.com/matiasnjacob/agents-cli.git");
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

test("release publishes the scoped package through OIDC after tests and before GitHub assets", async () => {
  const workflow = await readFile(join(root, ".github/workflows/release.yml"), "utf8");
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /registry-url:\s*https:\/\/registry\.npmjs\.org/);
  assert.match(workflow, /TAG_VERSION=.*GITHUB_REF_NAME/);
  assert.match(workflow, /npm publish --access public/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN/);
  assert.ok(workflow.indexOf("TAG_VERSION=") < workflow.indexOf("run: npm publish"));
  assert.ok(workflow.indexOf("run: npm test") < workflow.indexOf("run: npm publish"));
  assert.ok(workflow.indexOf("run: npm publish") < workflow.indexOf("gh release create"));
});

test("README leads with scoped npm installation and documents the registry bootstrap", async () => {
  const readme = await readFile(join(root, "README.md"), "utf8");
  assert.match(readme, /npm install --global @matiasnjacob\/agents-cli/);
  assert.match(readme, /agents-cli setup/);
  assert.match(readme, /SHA256SUMS/);
  assert.match(readme, /install\.sh/);
  assert.doesNotMatch(readme, /The project does not publish to npm at this time/);

  const publishing = await readFile(join(root, "docs/npm-publishing.md"), "utf8");
  assert.match(publishing, /npm stage publish/);
  assert.match(publishing, /npm stage reject/);
  assert.match(publishing, /0\.0\.0-stage/);
  assert.match(publishing, /first successful publish within 2 days/);
});
