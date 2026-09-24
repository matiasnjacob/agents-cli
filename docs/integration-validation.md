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
| Tarball execution outside checkout | Passed | `npm install <tarball>` + `npx agents-cli --help` |

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
recorded in `docs/execution-status.md`; npm publication is intentionally out
of scope until the package account and final name are approved.
