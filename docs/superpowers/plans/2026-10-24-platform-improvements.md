# Platform improvements roadmap

Source: comparison with ruler, rulesync, the skills CLI and OpenSpec, plus the gaps found in this repository. Each item is its own branch and PR, built in this order because later items reuse earlier ones. Every item ships with tests, a CHANGELOG line and a short design note when it changes behavior. Releases are cut after items 3, 6 and 9 (patch/minor per CHANGELOG).

Rule for every item: `--yes`/`--dry-run` JSON output of existing commands stays stable; nothing writes outside managed paths without a conflict report; secrets never enter the lockfile or backups.

## 1. Lifecycle: real `update` and `check`
- `agents-cli update` applies the configured setup (same engine and confirmation as `setup --config agents-cli.config.json`); `--dry-run` previews, `--yes` skips the prompt. Without a config it keeps today's dry-run-only behavior.
- `agents-cli check [--json]` is read-only: compares installed files with what the current catalog would render, exits 1 on drift or conflicts, 0 when current. Suitable for CI.
- Files: `src/cli/parse.ts`, `src/cli/index.ts`, `src/setup/command.ts` (reuse `executeSetup`), tests in `tests/setup-cli.test.js`, `tests/commands.test.js`.

## 2. External skills freshness
- `check` also compares each pinned external skill revision with the upstream default-branch SHA (`git ls-remote`); network failure reports "not verified", never an error.
- `agents-cli skills update [id]` rewrites the pinned revision in `agents-cli.config.json` after showing the diff of upstream commits, then runs the normal update flow.
- Files: `src/setup/external.ts`, `src/cli/*`. Depends on 1.

## 3. Uninstall / revert
- `agents-cli uninstall` removes only files whose hash matches the lockfile, removes managed MCP entries via the existing ownership state, keeps edited files (reported), never touches `.env`, `.envrc` or `.gitignore`. `--dry-run` supported.
- Backups in `.agents-cli-backups/` get `agents-cli revert [timestamp]` to restore a previous state.
- Files: `src/install/engine.ts`, `src/setup/mcp.ts`. Depends on 1.

## 4. Skills from any repository
- `agents-cli skills add owner/repo --path <dir> [--ref <sha|branch>]` resolves the ref to a commit SHA, pins it in the config and reuses the license/symlink/size checks of `collectExternalSkill`. Catalog ids keep working unchanged.
- Files: `src/cli/parse.ts`, `src/setup/external.ts`. Depends on 2.

## 5. Import existing configuration
- `agents-cli import` detects unmanaged `AGENTS.md`, `CLAUDE.md`, `.cursor/rules`, and existing MCP entries, reports what would be preserved, and writes a managed `.agents/imported.md` that agents are told to read. It never edits or deletes the originals.
- Files: new `src/setup/import.ts`. Independent; ships after 3 so it can be reverted.

## 6. Hooks (enforce engram and QA contracts)
- Claude Code: merge managed `hooks` into `.claude/settings.json` (SessionStart loads engram context, Stop requires a session summary), with ownership state like MCP so user hooks are preserved. Other platforms: document the equivalent and report "not enforced" in `doctor` until they expose hooks.
- Config: `hooks: { engram: true }`, default on when the engram MCP is selected.
- Files: new `src/setup/hooks.ts`, `src/setup/install.ts`. Depends on 3 (clean removal).

## 7. Per-project permission overrides
- Config `permissions` per agent (bash allow/ask/deny, edit paths, webfetch) merged over the catalog defaults by each adapter; invalid or widening-beyond-catalog values need `--allow-widen`.
- Files: `src/adapters/*/render.ts`, `src/setup/config.ts`, schema. Depends on 6 (shared settings merge).

## 8. One entry point
- `init` becomes a thin alias that builds a config and calls `setup`, so it also installs brainstorming, `.env` and multi-platform. Old flags keep working; its JSON output is unchanged.
- Files: `src/cli/index.ts`, `src/cli/parse.ts`.

## 9. Catalog quality gates
- `agents-cli lint` (and a CI test): every agent loads its required skills in its body, every skill has valid front matter, manifest hashes match files, and no agent promises tools its permissions deny.
- Files: new `src/catalog/lint.ts`, `tests/catalog-lint.test.js`.

## Order and releases
1 → 2 → 3 (release) → 4 → 5 → 6 (release) → 7 → 8 → 9 (release).
