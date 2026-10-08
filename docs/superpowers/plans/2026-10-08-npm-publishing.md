# npm Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `agents-cli` as `@matiasnjacob/agents-cli` from the existing tag release workflow so users can install it with npm while retaining GitHub Release assets.

**Architecture:** Change npm package identity without changing the `agents-cli` executable, then extend the existing verified tag workflow to publish via OIDC after tests and package checks. Keep GitHub Release tarball/checksum/provenance as a second distribution channel and update user-facing installation guidance.

**Tech Stack:** Node.js 24 and npm 11 trusted publishing, GitHub Actions, npm pack, Node built-in test runner, TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-08-npm-publishing-design.md`

## Global Constraints

- The installed CLI continues to require Node.js `>=20`.
- The release workflow runs on Node.js `24` so npm supports Trusted Publishing (Node.js `>=22.14.0`, npm `>=11.5.1`).
- The npm package name is exactly `@matiasnjacob/agents-cli`; the executable remains `agents-cli`.
- npm publication uses GitHub Actions OIDC with `id-token: write`; no long-lived npm write token or token fallback is added.
- The workflow publishes only for `v*` tags and verifies the tag version equals `package.json` version before publication.
- GitHub Releases continue to contain `agents-cli-X.Y.Z.tgz`, `SHA256SUMS`, and the provenance attestation.
- The next release is `v0.4.0`; do not publish or retag `v0.3.0`.

## Review Focus

- An annotated or malformed tag whose version differs from `package.json` must stop before `npm publish`; Task 2 pins this with a version-guard workflow test.
- The package scope changes but the installed binary does not; Task 1 asserts the exact `name` and `bin` mapping and Task 3 smoke-tests the installed binary.
- The package is public and scope-qualified; Task 1 asserts `publishConfig.access` and npm pack metadata.
- Missing or misconfigured Trusted Publishing must fail without falling back to a saved npm token; Task 2 asserts OIDC permissions and absence of token-based publish configuration.
- npm publication may succeed before GitHub Release creation fails; Task 3 documents recovery without attempting to republish an immutable npm version.

---

### Task 1: Give the package its npm identity

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/release-assets.test.js`

**Interfaces:**
- Produces: npm package `@matiasnjacob/agents-cli`, executable `agents-cli`, version `0.4.0`, and public access metadata.

- [x] **Step 1: Add failing package-metadata assertions**

Add this test to `tests/release-assets.test.js`:

```js
test("npm package uses the scoped identity and preserves the CLI executable", async () => {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(manifest.name, "@matiasnjacob/agents-cli");
  assert.equal(manifest.version, "0.4.0");
  assert.equal(manifest.bin["agents-cli"], "dist/cli/index.js");
  assert.equal(manifest.publishConfig.access, "public");
  assert.equal(manifest.repository.url, "git+https://github.com/matiasnjacob/agents-cli.git");
});
```

- [x] **Step 2: Run the test and confirm the old identity fails**

Run: `npm run build && node --test tests/release-assets.test.js`

Expected: the new test fails because the package currently has the unscoped name `agents-cli`, version `0.3.0`, and no npm publication metadata.

- [x] **Step 3: Update the package metadata and lockfile**

Set `package.json` to:

```json
{
  "name": "@matiasnjacob/agents-cli",
  "version": "0.4.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/matiasnjacob/agents-cli.git"
  },
  "homepage": "https://github.com/matiasnjacob/agents-cli#readme",
  "bugs": {
    "url": "https://github.com/matiasnjacob/agents-cli/issues"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

Keep the existing `bin`, scripts, engine, and dependencies unchanged. Update the root lockfile name/version with `npm install --package-lock-only --ignore-scripts`.

- [x] **Step 4: Verify metadata and tarball contents**

Run: `npm run build && npm run typecheck && node --test tests/release-assets.test.js && npm pack --dry-run --json`

Expected: all release asset tests pass; the pack manifest reports `@matiasnjacob/agents-cli@0.4.0`, includes `dist/cli/index.js` and `catalog/manifest.json`, and excludes `src/` and `tests/`.

- [x] **Step 5: Commit the package identity change**

```bash
git add package.json package-lock.json tests/release-assets.test.js
git commit -m "feat: prepare scoped npm package"
```

### Task 2: Publish from the verified tag workflow

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `tests/release-assets.test.js`

**Interfaces:**
- Consumes: package metadata from Task 1.
- Produces: a tag release job that validates the semver tag, runs all checks, publishes to npm through OIDC, and then creates the existing GitHub Release assets.

- [x] **Step 1: Add failing release-workflow assertions**

Extend the release workflow test to assert the Node 24/npm registry setup, exact package version guard, npm publish command, and order of `npm test`, `npm publish`, and `gh release create`:

```js
test("release publishes the scoped package through OIDC after tests and before GitHub assets", async () => {
  const workflow = await readFile(join(root, ".github/workflows/release.yml"), "utf8");
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /registry-url:\s*https:\/\/registry\.npmjs\.org/);
  assert.match(workflow, /TAG_VERSION=.*GITHUB_REF_NAME/);
  assert.match(workflow, /npm publish --access public/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN/);
  assert.ok(workflow.indexOf("run: npm test") < workflow.indexOf("run: npm publish"));
  assert.ok(workflow.indexOf("run: npm publish") < workflow.indexOf("gh release create"));
});
```

- [x] **Step 2: Run the release test and confirm it fails**

Run: `npm run build && node --test tests/release-assets.test.js`

Expected: the new test fails because the current release workflow runs on Node 20 and does not publish to npm.

- [x] **Step 3: Add the package/tag guard and trusted npm registry setup**

Set `actions/setup-node@v4` to Node `24`, disable package-manager caching in the release job, and add:

```yaml
registry-url: https://registry.npmjs.org
scope: '@matiasnjacob'
```

Before typecheck/build, add a step that compares the version after `v` in `GITHUB_REF_NAME` with `node -p "require('./package.json').version"`, and exits nonzero on mismatch. Keep the top-level `id-token: write` permission.

- [x] **Step 4: Publish only after validation and package attestation**

After the existing typecheck, build, tests, tarball packaging and GitHub provenance-attestation steps, add:

```yaml
- name: Publish scoped package to npm
  run: npm publish --access public
```

Place it immediately before `Create GitHub Release`. Do not add an npm token secret or `NODE_AUTH_TOKEN`. Keep the existing GitHub Release tarball and `SHA256SUMS` upload unchanged.

- [x] **Step 5: Verify the workflow contract**

Run: `npm run build && node --test tests/release-assets.test.js && git diff --check`

Expected: all release tests pass, the package/version guard appears before publishing, and OIDC publishing occurs only after tests and attestation.

- [x] **Step 6: Commit the release workflow change**

```bash
git add .github/workflows/release.yml tests/release-assets.test.js
git commit -m "ci: publish releases to npm with OIDC"
```

### Task 3: Document the npm install and release operations

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/integration-validation.md`
- Modify: `docs/execution-status.md`
- Create: `docs/npm-publishing.md`

**Interfaces:**
- Consumes: scoped package and tag workflow from Tasks 1–2.
- Produces: one-command npm installation guidance, release-operator setup instructions, and accurate distribution status.

- [x] **Step 1: Add failing documentation assertions**

Extend `tests/release-assets.test.js` with this test:

```js
test("README leads with scoped npm installation and retains verified release fallback", async () => {
  const readme = await readFile(join(root, "README.md"), "utf8");
  assert.match(readme, /npm install --global @matiasnjacob\/agents-cli/);
  assert.match(readme, /agents-cli setup/);
  assert.match(readme, /SHA256SUMS/);
  assert.match(readme, /install\.sh/);
  assert.doesNotMatch(readme, /The project does not publish to npm at this time/);
});
```

- [x] **Step 2: Run the test and confirm the old README fails**

Run: `npm run build && node --test tests/release-assets.test.js`

Expected: the new assertions fail because the README currently prioritizes the tarball download and says npm publication is not enabled.

- [x] **Step 3: Update README installation guidance**

Lead the installation section with:

```sh
npm install --global @matiasnjacob/agents-cli
agents-cli setup
```

State Node.js `>=20` is required. Keep the exact checksum-verification commands and shell installer as alternatives, but describe them as GitHub Release installation paths. Update the distribution note and keep the release badge dynamic.

Add a `0.4.0 — prepared for release` changelog entry describing scoped npm publication while retaining GitHub assets. Keep the existing `v0.3.0` download URLs accurate because that is the latest published GitHub Release until `v0.4.0` is tagged.

- [x] **Step 4: Document Trusted Publisher configuration and recovery**

In `docs/npm-publishing.md`, specify the npm package name, GitHub repository, workflow filename `release.yml`, OIDC `id-token: write` requirement, Node 24/npm 11.5.1 minimum for the publisher, direct `npm publish` permission, and that the first successful publish must follow trust setup within two days. Document the `vX.Y.Z`/package-version match, the next tag `v0.4.0`, current GitHub release assets, and the recovery path when npm succeeds but GitHub Release creation fails: retry only GitHub Release creation, never republish that npm version.

Update `docs/integration-validation.md` to describe npm publication as configured for the next tagged release but pending the maintainer's npm Trusted Publisher setup. Add a current entry to `docs/execution-status.md`; retain historical entries as historical records.

- [x] **Step 5: Verify documentation and full project checks**

Run: `npm run typecheck && npm run build && npm test && npm pack --dry-run --json && git diff --check`

Then install the generated tarball into a temporary prefix, verify the installed version with `npm list --prefix <temp-prefix> @matiasnjacob/agents-cli`, run `agents-cli --help`, initialize a temporary project with `agents-cli init --platform codex --tracker none --yes`, and run `agents-cli doctor` there. Expected: installed package version `0.4.0`, help shows the documented setup and doctor commands, doctor reports `ok: true`, and only nonblocking MCP/identity warnings appear for the minimal project. The CLI has no `--version` option, so query npm's installed package metadata rather than adding an unrelated CLI flag.

- [x] **Step 6: Commit installation documentation**

```bash
git add README.md CHANGELOG.md docs/integration-validation.md docs/execution-status.md docs/npm-publishing.md tests/release-assets.test.js
git commit -m "docs: document npm installation and release setup"
```

### Final review and PR

- [x] Run `npm run typecheck`, `npm run build`, `npm test`, `npm pack --dry-run`, the temporary tarball-install smoke test, and `git diff --check` on the final branch.
- [ ] Confirm `git status --short` contains no generated tarball or test project.
- [ ] Request an independent code review of the complete branch.
- [ ] Push `feature/npm-publishing` and create a PR against `main`; do not publish to npm or create the `v0.4.0` tag until the PR is merged and the npm Trusted Publisher is configured.
