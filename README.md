# agents-cli

`agents-cli` will initialize new repositories with a portable catalog of the user’s agents, skills, and development workflows.

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

The CLI is under active development. Commands become available as the corresponding tasks in `PLAN.md` are completed.
