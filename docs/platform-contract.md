# Portable platform contract

The catalog is the canonical source for agent roles and reusable skills. Adapters
render that content into each runtime's project-local configuration during later
implementation tasks.

## Supported selections

| Field | Values | Meaning |
| --- | --- | --- |
| `platform` | `codex`, `opencode`, `claude` | Runtime-specific output adapter. |
| `tracker` | `linear`, `trello`, `none` | Optional project workflow integration. |

The CLI treats these values as an explicit contract. It does not assume a private
team, board, account, or global home directory.

## Output contract

Each adapter must define project-relative destinations for:

- agent definitions;
- selected skills and their resources;
- the primary instruction file, if the runtime supports one;
- MCP/client configuration, without embedding credentials.

The installer will own conflict detection and idempotency. Adapters only describe
what to render and the capabilities that the target runtime can actually enforce.

## Permission differences

Runtime instructions can guide an agent but cannot universally enforce permissions.
Codex, OpenCode, and Claude Code may differ in tool configuration, delegation,
MCP wiring, and instruction discovery. The adapters must report those differences
instead of presenting prose as a technical restriction.

The current CLI skeleton validates selections only. Installation, skill resolution,
platform adapters, MCP configuration, and tracker templates are intentionally
implemented in later plan tasks.
