# CLI Version and Setup Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the published CLI report its installed version and make the interactive `setup` command discoverable and verifiable from a clean npm installation.

**Architecture:** Add a version result to the existing argument parser and print the version from the installed package metadata in the CLI entry point. Keep the existing setup wizard behavior, make it visible in help, and verify both commands by installing the packed artifact into an isolated npm prefix so an older global binary cannot mask regressions.

**Tech Stack:** TypeScript, Node.js built-in test runner, npm package tarball.

**Spec:** User request in this conversation: add `--version` and `setup`; screenshot shows `agents-cli setup` rejected by an older CLI. The published `@matiasnjacob/agents-cli@0.4.0` tarball already parses `setup`, but does not implement `--version` and omits `setup` from the help command list.

## Global Constraints

- Preserve the current `setup` wizard, configuration, and dry-run behavior.
- `--version` must work without a project configuration or interactive terminal.
- Report the version from the installed package metadata so the output matches the npm package version.
- Validate the npm tarball through an isolated install, not only by running the repository source.
- Do not modify, remove, or overwrite a user's unrelated global `agents-cli` installation as part of tests.

## Review Focus

- Running `agents-cli --version` from a directory without setup configuration must print the package version and exit successfully.
- `agents-cli -v` must behave consistently with `--version` and must not be mistaken for a command.
- Help output must list `setup` as a supported command as well as showing its options.
- The installed scoped package must be the binary exercised by smoke tests even if another `agents-cli` exists earlier on the user's PATH.
- `setup --dry-run` must still reach the setup flow and must not write configuration files.

---

### Task 1: Parse and document version and setup commands

**Files:**
- Modify: `src/cli/parse.ts`
- Test: `tests/commands.test.js`

**Interfaces:**
- Produces parser results `{ kind: "version" }` for `--version` and `-v`.
- Preserves the existing `{ kind: "setup", ... }` result and setup flags.

- [x] **Step 1: Write the failing tests**

Add parser assertions that `parseCommandArgs(["--version"])` and `parseCommandArgs(["-v"])` return `{ kind: "version" }`. Add a help assertion that the `Commands:` section names `setup` and describes interactive suite, MCP, and skills configuration.

- [x] **Step 2: Run the focused test and confirm it fails**

Run: `npm run build && node --test tests/commands.test.js`

Expected: version parsing fails because both flags are currently unknown; help does not list `setup` under commands.

- [x] **Step 3: Implement the parser and help changes**

Handle `--version` and `-v` before ordinary command dispatch. Add a version usage line and a `setup` command description without changing setup parsing or its wizard options.

- [x] **Step 4: Re-run the focused test**

Run: `npm run build && node --test tests/commands.test.js`

Expected: all command parser tests pass.

### Task 2: Print and smoke-test the installed package version

**Files:**
- Modify: `src/cli/index.ts`
- Test: `tests/cli-smoke.test.js` (create)
- Modify: `tests/cli-smoke.test.js` for the packed-artifact check

**Interfaces:**
- Consumes `{ kind: "version" }` from Task 1.
- Prints one line containing the `version` field from the package's own `package.json`, then exits successfully.

- [x] **Step 1: Write a failing runtime test**

Spawn the built CLI with `--version` from a temporary directory that has no project files. Assert exit code `0` and exact output equal to the version in the repository package metadata. Add a second assertion for `-v`, and verify `setup --dry-run` leaves the project directory empty. Separately pack and install the tarball under a temporary npm prefix; invoke that prefix's `node_modules/.bin/agents-cli` to verify the packaged binary directly.

- [x] **Step 2: Run the test and confirm it fails**

Run: `npm run build && node --test tests/cli-smoke.test.js`

Expected: source and packed CLI invocations return help/error output rather than their package version.

- [x] **Step 3: Implement runtime version lookup**

Read the sibling package metadata relative to `import.meta.url` in the built CLI, parse its `version`, and print only that value for the version result. Keep normal command errors and exit codes unchanged.

- [x] **Step 4: Re-run the runtime test**

Run: `npm run build && node --test tests/cli-smoke.test.js`

Expected: both flags print the exact installed package version and exit `0` from an unconfigured directory.

### Task 3: Update installation and setup usage docs

**Files:**
- Modify: `README.md`
- Modify: `docs/setup.md`

**Interfaces:**
- Uses the package tarball and the scoped npm package name already declared in `package.json`.
- Documents `npm install --global @matiasnjacob/agents-cli`, `agents-cli --version`, and `agents-cli setup`.

- [x] **Step 1: Update the install instructions**

Add a short verification sequence to the README and setup guide. Explain that when help output lacks `setup` or `--version`, users should inspect the resolved executable with `command -v agents-cli` and verify the installed scoped package before reinstalling; do not recommend deleting arbitrary npm or project files.

- [x] **Step 2: Run all project checks**

Run: `npm run typecheck && npm test && npm pack --dry-run && git diff --check`

Expected: typecheck and all tests pass; the tarball includes the tested CLI files and no whitespace errors remain.

### Task 4: Prepare the next release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Select the next release version**

Use the next version after the currently published `0.4.0` according to the repository's release policy. Update `package.json`, the lockfile root package version, and changelog entry together.

- [x] **Step 2: Verify release metadata**

Run: `npm run typecheck && npm test && npm pack --dry-run && git diff --check`

Expected: all checks pass and package metadata, changelog, CLI output, and packed tarball report the same release version.

- [ ] **Step 3: Submit a PR**

Create a PR with the implementation and smoke-test evidence. Do not move the release tag or publish before the PR is merged.

- [ ] **Step 4: Release after merge**

After the PR is merged, create and push tag `v0.4.1`, run the release workflow, and verify `npm view @matiasnjacob/agents-cli version` and the GitHub release assets.

### Final review fix: Make packed-package smoke verification repeatable

**Files:**
- Create: `scripts/smoke-package.mjs`
- Modify: `.github/workflows/release.yml`
- Test: `tests/release-assets.test.js`

- [x] **Step 1: Add a failing release-contract test**

Assert that the release workflow invokes the packaged CLI smoke script after packing and before attestation/publication, and that the script installs a tarball and invokes its local `.bin/agents-cli` for version and setup dry-run checks.

- [x] **Step 2: Verify the test fails before implementation**

Run: `node --test tests/release-assets.test.js`

Expected: fail because `scripts/smoke-package.mjs` is missing.

- [x] **Step 3: Add the isolated tarball smoke script and release step**

Install the supplied tarball into a temporary prefix, compare `--version` and `-v` with that installed package's `package.json`, check help includes setup, and run setup dry-run from an empty temporary project. Invoke the script from the release workflow before attestation and npm publication.

- [x] **Step 4: Run the contract test and the tarball smoke test**

Run: `npm run build && node --test tests/release-assets.test.js tests/cli-smoke.test.js`, then run `npm pack` and `node scripts/smoke-package.mjs <tarball>`.

Expected: focused tests pass and the freshly installed tarball reports its version, lists setup, and leaves the dry-run project empty.
