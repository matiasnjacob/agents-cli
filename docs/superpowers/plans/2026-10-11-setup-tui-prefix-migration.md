# Interactive Setup, Agent Prefixes, and 0.4.2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `agents-cli setup` with an accessible arrow-key TUI, optional agent prefixing, safe automatic migration from 0.4.1, and package version 0.4.2.

**Architecture:** Keep prompt capture in `src/setup/wizard.ts` and keep validation, planning, and writes in the existing setup/config/install pipeline. Store stable unprefixed catalog IDs in config; adapters derive prefixed runtime IDs and file basenames. Read legacy `global-*` IDs through an explicit migration boundary and let the existing lock-aware install engine decide whether old files can be removed safely.

**Tech Stack:** TypeScript, Node.js >=20, `@clack/prompts` (pin a Node-compatible version), node:test, npm.

**Spec:** `docs/superpowers/specs/2026-10-11-setup-tui-prefix-migration-design.md`

## Global Constraints

- Package runtime support remains Node.js `>=20`.
- Keep catalog/config agent IDs unprefixed; apply `agentPrefix` only to generated runtime IDs, visible installed names, and generated file basenames.
- `agentPrefix` is optional, empty by default, and accepts only `^[a-z0-9]+(?:-[a-z0-9]+)*$` when nonempty.
- Convert known `0.4.1` `global-<id>` selections to `<id>`; unknown IDs remain errors.
- Remove legacy generated files only when `.agents-cli.lock.json` proves ownership and content is unmodified; report conflicts and preserve foreign or edited files.
- `--dry-run`, cancellation, EOF, and non-TTY failure must not partially write project files.
- Keep `--config`, `--yes`, `--dry-run`, doctor, and unrelated CLI command behavior compatible.
- Release metadata and changelog target version `0.4.2`; publishing happens only after review and merge.

## Review Focus

- A malformed/path-like prefix must be rejected before creating any files; pin this in Task 1 config-validation tests.
- A legacy lock with edited or missing old files must preserve user data and report a conflict or safe no-op; pin both cases in Task 2 migration tests.
- A canceled, EOF, or non-TTY wizard must never write a config or generated files; pin prompt cancellation in Task 3 and command flow in Task 4.
- A preset's required skills must remain selected when optional skills are changed; pin this in Task 3 wizard/config tests.
- Narrow terminals and `NO_COLOR` must retain readable title/author and usable prompts; pin banner rendering in Task 3 tests.

---

## File Structure

- `src/setup/config.ts` owns suite IDs, setup schema resolution, prefix validation, and legacy config normalization.
- `src/setup/wizard.ts` owns prompt orchestration and terminal lifecycle; `src/setup/command.ts` owns preview, confirmation, apply, and doctor flow.
- `src/setup/install.ts` and `src/adapters/*/render.ts` own conversion from stable catalog IDs into platform-specific generated names and paths.
- `catalog/agents/*`, `catalog/manifest.json`, schemas, and docs expose the canonical unprefixed catalog names and user-facing setup contract.
- `tests/setup*.test.js`, four adapter test files, and `tests/release-assets.test.js` exercise config, TUI, migration, rendering, and package artifact behavior.
- `package.json`, lockfile, `CHANGELOG.md`, and README/release docs carry the 0.4.2 release metadata and install/setup guidance.

### Task 1: Canonical IDs, Prefix Validation, and Config Compatibility

**Files:**
- Modify: `src/setup/config.ts`
- Modify: `catalog/manifest.json` and rename `catalog/agents/global-*.md` to base IDs
- Modify: `schemas/setup-config.schema.json`
- Test: `tests/setup.test.js`

**Interfaces:**
- Produces `SetupConfig.agentPrefix: string` with blank default and validated kebab-case values.
- Produces canonical suite and manifest IDs without `global-`.
- `resolveConfig(value, manifest)` accepts either current base IDs or known legacy `global-*` IDs and returns normalized base IDs.

- [ ] **Step 1: Add failing tests for canonical IDs, legacy aliases, prefix default, and invalid prefixes.** Cover blank, `acme-team`, `../escape`, `a/b`, whitespace, and unknown legacy IDs.
- [ ] **Step 2: Run `node --test tests/setup.test.js` and confirm the new cases fail for the expected missing normalization/validation.**
- [ ] **Step 3: Rename catalog agent files and IDs, update suites, add `agentPrefix` to config resolution and schema, and normalize only known legacy aliases.**
- [ ] **Step 4: Run the focused setup test and `npm run typecheck`; confirm both pass.**
- [ ] **Step 5: Commit as `feat: normalize agent catalog ids and prefixes`.**

### Task 2: Prefix-Aware Rendering and Safe 0.4.1 File Migration

**Files:**
- Modify: `src/setup/install.ts`
- Modify: `src/adapters/codex/render.ts`
- Modify: `src/adapters/claude/render.ts`
- Modify: `src/adapters/opencode/render.ts`
- Modify: `src/adapters/pi/render.ts`
- Test: `tests/codex-adapter.test.js`, `tests/claude-adapter.test.js`, `tests/opencode-adapter.test.js`, `tests/pi-adapter.test.js`, `tests/setup.test.js`

**Interfaces:**
- Consumes normalized `SetupConfig.agentPrefix` and base `agent.id` from Task 1.
- Produces effective ID `agentPrefix ? `${agentPrefix}-${agent.id}` : agent.id` for each renderer's runtime ID, visible name, file basename, and platform manifest entry.
- Existing `prepareSetup(root, catalogRoot, config)` remains the boundary that returns the complete file plan to the lock-aware install engine.

- [ ] **Step 1: Add failing adapter tests for empty prefix and `acme` prefix across generated filenames, runtime IDs, visible names, and manifests.**
- [ ] **Step 2: Run the four adapter tests and confirm prefixed expectations fail.**
- [ ] **Step 3: Pass the effective ID through all four renderers and ensure setup reports old managed paths as removals when replacing 0.4.1 files.**
- [ ] **Step 4: Add lock-based migration tests for unchanged old files (remove and replace), edited old files (preserve and conflict), foreign untracked old files (preserve), and dry-run (preview only).**
- [ ] **Step 5: Run adapter and setup tests; commit as `feat: render prefixed agents and migrate legacy files safely`.**

### Task 3: Keyboard-Driven Wizard and Branded Terminal Experience

**Files:**
- Modify: `package.json` and `package-lock.json` to pin the verified Clack prompts version
- Modify: `src/setup/wizard.ts`
- Create or modify: a focused banner/prompt helper under `src/setup/` if it keeps terminal output testable
- Test: `tests/setup-cli.test.js` and focused wizard/banner tests

**Interfaces:**
- `collectAnswers` remains responsible for returning one fully resolved `SetupConfig`; prompt rendering must not write project files.
- Single-select prompts use arrows and Enter; multi-select prompts use arrows, Space, and Enter; prefix uses text input with inline validation.
- Wizard prints one boxed ASCII welcome banner containing exactly `Agents-Cli` and `Matias Jacob` per invocation.

- [ ] **Step 1: Verify current `@clack/prompts` engine range and license, pin a compatible exact version, and add prompt-test tooling only if existing node:test facilities cannot exercise the prompt API.**
- [ ] **Step 2: Add tests for banner text/once-only behavior, preselected preset entries, required skills, prefix capture/validation, cancellation, and prompt call sequence.**
- [ ] **Step 3: Run focused wizard tests and confirm the new behavior fails before implementation.**
- [ ] **Step 4: Replace numeric/list prompts with Clack select, multiselect, text, confirm, spinner/progress; add keyboard help and selected counts, with colors disabled under `NO_COLOR`.**
- [ ] **Step 5: Run wizard tests plus `npm run typecheck`; commit as `feat: add interactive keyboard setup wizard`.**

### Task 4: Preview, Confirmation, Progress, and Setup Docs

**Files:**
- Modify: `src/setup/command.ts`
- Modify: `src/setup/install.ts` only if progress task boundaries belong there
- Modify: `tests/setup-cli.test.js`
- Modify: `README.md`, `docs/setup.md`, and `docs/catalog-inventory.md`

**Interfaces:**
- `setupCommand(root, catalogRoot, options)` continues to support `{config, yes, dryRun}` and returns the same report fields plus diagnostics after a successful apply.
- The preview shows creates, updates, removals, unchanged items, conflicts, and resulting prefixed names before confirmation.
- Progress feedback wraps actual apply tasks and does not claim completion before the install engine returns.

- [ ] **Step 1: Add failing CLI tests for full preview, explicit confirmation, cancellation, dry-run, `--config --yes`, and no-TTY behavior.**
- [ ] **Step 2: Run `node --test tests/setup-cli.test.js` and confirm flow tests expose the missing TUI/preview behavior.**
- [ ] **Step 3: Wire interactive confirmation and task-level progress around the existing plan/apply boundary; ensure no prompt cancellation reaches `executeSetup(..., false)`.**
- [ ] **Step 4: Update setup docs with arrow/Space/Enter keys, prefix examples, legacy migration behavior, and reproducible flags.**
- [ ] **Step 5: Run setup CLI and setup tests; commit as `feat: preview and apply interactive setup plans`.**

### Task 5: Prepare and Verify Release 0.4.2

**Files:**
- Modify: `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md`
- Modify: `tests/release-assets.test.js`
- Modify: release workflow/docs only if a 0.4.1 literal is intentionally pinned there

**Interfaces:**
- Package version and release metadata resolve to `0.4.2`.
- The release tarball contains the built CLI, catalog, schemas, and setup docs needed for packaged use.

- [ ] **Step 1: Add/update release asset assertions for `0.4.2` and run them to identify stale release metadata.**
- [ ] **Step 2: Update package and lock versions, changelog, README examples, and any intentional release-version references.**
- [ ] **Step 3: Run `npm ci`, `npm run typecheck`, `npm run build`, and `npm test`.**
- [ ] **Step 4: Run `npm pack --dry-run` and the existing packaged CLI smoke checks, including `--version`, `setup --help`, and doctor behavior in a temporary project.**
- [ ] **Step 5: Review `git diff --check` and the complete diff, then commit as `release: prepare agents-cli 0.4.2`.**

## Final Verification

Run from the feature worktree:

```bash
npm ci
npm run typecheck
npm run build
npm test
npm pack --dry-run
git diff --check
```

Confirm a pseudo-terminal smoke run can navigate single-select with arrows/Enter and multi-select with arrows/Space/Enter; confirm the banner, prefix output, and confirmation summary are readable. Test both a clean project and a fixture containing a 0.4.1 lock/config with one unchanged managed file and one user-edited legacy file. Do not publish or tag until the PR is merged and the release is requested.
