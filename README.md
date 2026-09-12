# agents-cli

`agents-cli` initializes new repositories with a portable catalog of the user’s agents, skills, and development workflows.

The project targets Codex, OpenCode, and Claude Code through a canonical catalog and platform adapters. During `init`, users select a platform first and then install only the compatible skills and integrations for that platform.

## Current status

The implementation roadmap is documented in [PLAN.md](PLAN.md). The current environment and execution checkpoints are recorded in [docs/execution-status.md](docs/execution-status.md). The initial catalog inventory is available in [docs/catalog-inventory.md](docs/catalog-inventory.md).

## Initial scope

- Seven reusable global agents.
- Platform-specific, dependency-aware skill selection.
- Worktrees under `.worktrees/` in the main checkout.
- Workflows for Graphify, Linear, and Trello.
- GitHub and Linear integration through Docker MCP Toolkit.
- Safe, idempotent initialization with dry-run and conflict detection.

## Planned commands

```sh
agents-cli init --platform codex --tracker linear
agents-cli init --platform opencode --tracker trello
agents-cli init --platform claude --tracker none
agents-cli skills list --platform codex
agents-cli skills add <skill> --platform codex
agents-cli doctor
agents-cli update --dry-run
```

`doctor` reports local runtime, catalog, lockfile, platform, Docker MCP
configuration, and external actor diagnostics without printing credentials.
`update --dry-run` previews catalog changes and reports local conflicts without
writing files. Applying updates is intentionally not available yet.

The three platform adapters render the seven canonical agents. Skills from the
portable catalog are installed after platform selection; external `skills.sh`
sources remain deferred to a platform-specific resolver.

See [docs/integration-validation.md](docs/integration-validation.md) for the
validation matrix and [PLAN.md](PLAN.md) for the remaining roadmap. The
package is not published to npm yet; package name, registry account, and
release policy remain open decisions.
