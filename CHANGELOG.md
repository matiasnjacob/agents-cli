# Changelog

All notable changes to `agents-cli` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and releases use semantic versioning.

## 0.5.2 — prepared for release

- Remove an accidental self-dependency (`@matiasnjacob/agents-cli`) that 0.5.1 declared in its own package.json.

## Unreleased

- Add `agents-cli check [--json]` (read-only drift report, exit 1 on drift) and make `agents-cli update` apply the configured setup (`--yes`, `--dry-run`); edited files stay conflicts.

## 0.5.3 — prepared for release

- Setup creates `.env` (empty placeholders for GITHUB_TOKEN and the JEV API key as needed), `.envrc` for direnv and a `.gitignore` entry; offers `brew install direnv`.
- `doctor` prints a readable report in a terminal (`--json` or piping keeps JSON) and checks the environment variables and direnv.

## 0.5.1 — prepared for release

- Interactive setup plan now shows the selected platforms, agents, tracker, MCPs, skills and JEV mode with file counts instead of listing every file.

## 0.5.0 — prepared for release

- Add `engram-session` skill: every agent syncs its Engram session before work and saves it before reporting; `engram` MCP option.
- Add `qa-test-evidence` skill: QA agents generate test cases with JEV and record Playwright evidence.
- Always install `brainstorming` from skills.sh (obra/superpowers, pinned commit) for every agent and platform.
- Interactive setup: multi-platform selection (`platforms`, `platform` still accepted), colored progress output, no JSON dump, explicit plan confirmation.

## 0.3.0 — prepared for release

- Add interactive setup, reproducible configuration, selectable agent suites and required skill resolution.
- Configure native GitHub/Linear MCPs with preserved user settings and environment references; report unsupported integrations as pending.
- Stage explicitly pinned external skills with license/resource provenance and no script execution.
- Recover failed installations, reject symlink destinations and retire only unchanged managed resources.
- Add optional JEV CLI/MCP routing, skill selection, failure classification and scenario ranking, with off/shadow/assist modes.
- Add bounded API contracts, optional audit and bilingual calibration/evaluation fixtures; keep live checks explicitly unverified.

## 0.4.0 — prepared for release

### Added

- Prepare the public scoped npm package `@matiasnjacob/agents-cli` while preserving the `agents-cli` executable.
- Publish tagged releases from GitHub Actions through npm Trusted Publishing (OIDC), alongside the existing GitHub Release tarball, checksum and provenance.
- Document npm installation, one-time package bootstrap, publisher configuration and release recovery.

## 0.4.1 — prepared for release

### Added

- Add `agents-cli --version` and `agents-cli -v` to report the installed package version.
- List the interactive `setup` command in CLI help and document how to identify an outdated executable on `PATH`.

## 0.4.2 — prepared for release

### Added

- Replace numeric setup prompts with an arrow-key and Space multi-select terminal wizard, including a boxed Agents-Cli / Matias Jacob welcome banner and install progress.
- Add optional project prefixes to visible agent names, runtime identifiers and generated filenames across Codex, Claude Code, OpenCode and Pi.
- Normalize known 0.4.1 `global-*` agent selections and safely migrate only unchanged CLI-managed files; preserve edited and foreign files as conflicts or user data.
- Pin `@clack/prompts` 0.11.0 while preserving the package's Node.js 20 minimum.

## [Unreleased]

### Planned

- Resolve the supported Graphify integration boundary.
- Decide whether to provide a Homebrew Tap or standalone binaries.

## [0.2.0] - 2026-09-24

### Added

- Pi adapter with seven project-local agent definitions, native Agent Skills paths, project instructions, and an isolated `subagent` extension.
- Pi coverage in CLI validation, doctor, update detection, integration tests, and release documentation.

### Fixed

- Test discovery on Node.js versions that do not accept a directory as the `--test` entry point.

## [0.1.0] - 2026-09-12

### Added

- Canonical catalog of seven portable agent roles.
- Codex, OpenCode and Claude Code adapters.
- Platform-aware initialization and portable skill selection.
- Idempotent installation, dry-run planning, backups and conflict detection.
- `doctor` diagnostics and safe `update --dry-run` previews.
- Worktree, Linear, Trello and Graphify workflow documentation.
- GitHub Release tarball distribution with SHA-256 checksums and provenance.
