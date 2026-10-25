# Integration validation

This document records the validation expected before publishing a release.
It is intentionally independent of external MCP credentials.

| Area | Result | Evidence |
| --- | --- | --- |
| Codex init, dry-run, idempotency | Passed | `tests/integration.test.js` |
| OpenCode init, dry-run, idempotency | Passed | `tests/integration.test.js` |
| Claude Code init, dry-run, idempotency | Passed | `tests/integration.test.js` |
| Pi init, dry-run, idempotency | Passed | `tests/integration.test.js` and `tests/pi-adapter.test.js` |
| Pi startup with generated trusted project resources | Passed | `pi -a --help` from a temporary initialized project |
| Existing unrelated files | Passed | `tests/integration.test.js` |
| Typecheck and build | Passed | `npm run typecheck`, `npm run build` |
| Full test suite | Passed | `npm test` |
| Package manifest | Passed | `npm pack --dry-run` |
| Tarball execution outside checkout | Passed | `npm install <tarball>` + `npm list` reports `@matiasnjacob/agents-cli@0.4.0`; installed CLI `--help`, Codex init and `doctor` (`ok: true`) |

The test suite uses temporary directories and the repository catalog explicitly;
it does not read the source user's home directory or require Codex, OpenCode,
Claude Code, Pi model calls, Linear, GitHub, or Docker MCP credentials.

## Tarball check

Run from this worktree:

```sh
PACKAGE=$(npm pack --silent)
TARGET=$(mktemp -d)
cd "$TARGET"
npm init -y
npm install "/absolute/path/to/$PACKAGE"
npx agents-cli --help
```

The tarball check must be rerun for each release candidate and its output
recorded in `docs/execution-status.md`. The scoped package identity and OIDC
release workflow are prepared for v0.4.0. npm publication remains pending the
maintainer's one-time package bootstrap and Trusted Publisher configuration;
see [npm publishing](npm-publishing.md).

## Real-terminal and live-runtime validation (0.8.0, 2026-10-25)

Run against the published `@matiasnjacob/agents-cli@0.8.0` installed into a temporary directory (not the checkout), with a temporary `HOME`, a pseudo-terminal driver, and a `brew` shim on `PATH` so the system was not changed.

| Check | Result | How |
| --- | --- | --- |
| Interactive wizard, multi-platform (Codex + Claude) | Passed | pty drove every prompt; plan summary, confirmation, `Setup complete.`, checklist, no warning lines; 58 files, `.env` with empty `GITHUB_TOKEN`/`TYPESAFE_API_KEY` |
| direnv install prompt | Passed | direnv hidden from `PATH`; answering yes called `brew install direnv` exactly once (shim log) |
| `uninstall` / `revert` confirmations | Passed | answering no left 7 agents in place and exited 1; yes removed 55 files; revert no/yes restored 58 files |
| Round trip | Passed | `check` reported `upToDate` with the pinned `brainstorming` skill current against live upstream; `doctor` ok |
| Engram `Stop` hook in a live Claude Code 2.1 session | Passed | headless `claude -p` with the managed hook: first Stop returned `block` (`stop_hook_active: false`), the model received the hook feedback and tried to save the summary, the second Stop (`stop_hook_active: true`) returned `{}` and the session ended |
| `SessionStart` context hook skipped when the Engram plugin is enabled | Passed | real `HOME` with the plugin enabled produced only the `Stop` hook |
| Permission override enforced by the runtime | Passed | `permissions.backend-developer.bash = "deny"` removed `Bash` from the generated tools; `claude -p --agent backend-developer` replied it had no Bash tool, while the unmodified `code-reviewer` ran `echo` |
| Private repository skills | Passed | `skills add` on a private repo resolved its commit and cloned through the git credential helper; a nonexistent repo fails in under a second with a clear message and never prompts |
| `uninstall` leaves no empty MCP config file | Fixed in 0.8.1 | a `.codex/config.toml` created only for agents-cli entries is now removed; files with user content are kept |

Not covered: Windows paths and shells, Codex/OpenCode/Pi runtime enforcement of the generated permissions (only Claude Code was exercised live), and hooks on non-Claude platforms (not implemented).
