# Changelog

All notable changes to `agents-cli` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and releases use semantic versioning.

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
