[![Latest release](https://img.shields.io/github/v/release/matiasnjacob/agents-cli?display_name=tag)](https://github.com/matiasnjacob/agents-cli/releases)
[![CI](https://github.com/matiasnjacob/agents-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/matiasnjacob/agents-cli/actions/workflows/ci.yml)

# agents-cli

`agents-cli` initializes a new repository with a portable, auditable catalog
of agent definitions, platform-specific configuration, selected skills, and
project workflow guidance.

It is designed for people who want the same development roles and conventions
in every project without copying private home-directory configuration. The
catalog preserves the current seven global agents and renders them for
Codex, OpenCode, Claude Code, or Pi.

The project is currently distributed through GitHub Releases. npm
publication is intentionally not enabled.

## What it installs

An initialization writes only into the target repository and records managed
file hashes in `.agents-cli.lock.json`. Existing unrelated files are preserved;
edited managed files become explicit conflicts instead of being silently
overwritten.

Depending on the selected platform, generated files are placed under:

| Platform | Agent files | Project instructions |
| --- | --- | --- |
| Codex | `.codex/agents/*.toml` | `.codex/AGENTS.md` |
| OpenCode | `.opencode/agents/*.md` | agent front matter and project files |
| Claude Code | `.claude/agents/*.md` | `CLAUDE.md` |
| Pi | `.pi/agents/*.md` + `.pi/extensions/agents-cli-subagent.ts` | `.pi/APPEND_SYSTEM.md` |

The generated files are derived artifacts. Change the catalog or selected
skills rather than adding credentials or machine-specific absolute paths to
them.

## The canonical agents

The catalog contains these seven roles:

| Agent | Responsibility |
| --- | --- |
| `global-orchestrator` | Plans delivery, refines scope, coordinates specialists and independent review. |
| `global-backend-developer` | Implements backend APIs, business logic, persistence and backend tests. |
| `global-frontend-developer` | Implements accessible frontend behavior, client integration and UI tests. |
| `global-aws-specialist` | Designs AWS integrations, infrastructure and operational workflows with explicit authorization for cloud mutations. |
| `global-code-reviewer` | Independently reviews correctness, security, architecture, regressions and test coverage. |
| `global-qa-automator` | Finds coverage gaps and authors deterministic automated tests against acceptance criteria. |
| `global-qa-manual` | Performs exploratory and functional acceptance testing and records reproducible evidence. |

Roles are intentionally separate from model selection. `agents-cli` does not
pin a model, provider or account for the generated agents.

## Supported platforms

### Codex

Renders named TOML agents in `.codex/agents/` and project instructions in
`.codex/AGENTS.md`. Codex sandbox, approval and runtime settings remain
authoritative over textual instructions.

### OpenCode

Renders Markdown agents in `.opencode/agents/`. The installer does not create
or replace `opencode.json`, so existing models, providers, MCP servers and
plugins are preserved.

### Claude Code

Renders Markdown agents in `.claude/agents/` and project instructions in
`CLAUDE.md`. Textual instructions cannot enforce permissions that the Claude
Code runtime does not support; those differences are documented rather than
promised as hard restrictions.

### Pi

Renders project roles in `.pi/agents/`, native Agent Skills in `.pi/skills/`, and a project extension exposing a `subagent` tool. Each delegation runs in an isolated Pi subprocess that inherits the active model and thinking level. Pi project trust and generated tool allowlists remain authoritative; source `ask` and path-specific policies are documented intent rather than runtime enforcement. See [the Pi adapter guide](docs/pi.md).

## Skills

Skills are selected after the platform is resolved. The six portable skills in
the current catalog are:

- `code-review-pr`
- `developer-task-execution`
- `functional-review`
- `git-feature-workflow`
- `orchestrator-governance`
- `worktree-task-isolation`

The catalog also exposes `skills.sh` as an external source. External skills
are not downloaded automatically: their platform-specific installer and
license must be resolved explicitly before installation. Project-scoped or
private variants from the source machine are not copied into the portable
catalog by default.

## Installation

### From a GitHub Release

Download the `.tgz` asset from the [Releases](https://github.com/matiasnjacob/agents-cli/releases)
page, verify its checksum, and install it locally:

```sh
curl -LO https://github.com/matiasnjacob/agents-cli/releases/download/v0.2.0/agents-cli-0.2.0.tgz
curl -LO https://github.com/matiasnjacob/agents-cli/releases/download/v0.2.0/SHA256SUMS
grep agents-cli-0.2.0.tgz SHA256SUMS | sha256sum --check
npm install --global ./agents-cli-0.2.0.tgz
```

For a one-command installation of the latest stable release on macOS or
Linux, download and run the installer after reviewing it:

```sh
curl -fsSL https://raw.githubusercontent.com/matiasnjacob/agents-cli/main/install.sh -o install.sh
less install.sh
bash install.sh
```

Set `AGENTS_CLI_VERSION=0.2.0` to install a specific release, or
`AGENTS_CLI_REPOSITORY=owner/repository` when using a compatible fork. The
installer resolves stable releases through the GitHub API, downloads the
tarball and `SHA256SUMS`, verifies the checksum, then runs `npm install --global`.
It never parses the Releases HTML page. Windows PowerShell is not supported by
this script yet.

The release asset is a Node.js package, so Node.js 20 or newer and npm are
required. The release workflow produces the tarball and checksum only after
typecheck, build and tests pass.

### From a checkout

For development or contribution:

```sh
git clone https://github.com/matiasnjacob/agents-cli.git
cd agents-cli
npm ci
npm run build
```

## Quick start

Select the platform and tracker explicitly. `none` means no tracker is
created or required.

```sh
agents-cli init --platform codex --tracker linear
agents-cli init --platform opencode --tracker trello
agents-cli init --platform claude --tracker none
agents-cli init --platform pi --tracker none
```

For non-interactive automation, add `--yes`. Preview changes first with
`--dry-run`:

```sh
agents-cli init --platform codex --tracker none --skills git-feature-workflow --yes --dry-run
agents-cli init --platform codex --tracker none --skills git-feature-workflow --yes
```

The command is idempotent. Run it again to see unchanged files; local edits
are reported as conflicts and are never silently discarded.

## Commands

```text
agents-cli --help
agents-cli init --platform <codex|opencode|claude|pi> --tracker <linear|trello|none> [--skills <id,id>] [--yes] [--dry-run]
agents-cli skills list --platform <codex|opencode|claude|pi>
agents-cli skills add <id> --platform <codex|opencode|claude|pi> [--dry-run]
agents-cli doctor
agents-cli update --dry-run
```

`doctor` reports runtime, catalog, lockfile, platform, Docker MCP
configuration and external actor diagnostics without printing credentials. A
reachable Docker daemon does not by itself prove that a Linear or GitHub MCP
tool call is authorized.

`update --dry-run` compares the installed platform and selected skills against
the current catalog, then reports creates, updates, unchanged files and
conflicts without writing. Applying updates is intentionally not available
until explicit conflict-resolution semantics are added.

## Worktrees and project workflows

Use one worktree per task under the primary checkout:

```sh
git worktree add ".worktrees/<task>" -b "feature/<task>" origin/main
git worktree list
```

`.worktrees/` is ignored by Git. The reusable workflow catalog includes
templates for [Linear stories](catalog/workflows/linear-story.md), [Trello
cards](catalog/workflows/trello-story.md), and [worktree execution](catalog/workflows/worktree.md).
Tracker selection remains explicit; `init --tracker none` does not impose a
tracker or create stories automatically.

## Graphify

Graphify is an optional local tool and is documented separately in
[catalog/workflows/graphify.md](catalog/workflows/graphify.md). The current
workflow verifies Graphify `0.9.48` commands for platform installation,
index/update and pending-update checks. Generated `graphify-out/` data is
excluded from Git.

`agents-cli` does not yet wrap Graphify. The supported repository,
configuration ownership and future CLI integration boundary remain an open
decision.

## External integrations and identity

GitHub and Linear workflows are administered through Docker MCP Toolkit in the
development environment. Automated repository operations use a GitHub App
identity; Linear operations use a distinguishable bot alias. Credentials,
tokens, private keys, histories and caches are never part of the catalog or
release assets.

## Releases

Releases are created from version tags:

```sh
git tag v0.2.0
git push origin v0.2.0
```

The tag workflow runs `npm ci`, typecheck, build and the complete test suite.
It then uploads `agents-cli-<version>.tgz` and `SHA256SUMS` to a GitHub
Release and publishes a GitHub build-provenance attestation for the tarball.
Review the generated assets and attestation before sharing a release. The
attestation can be verified with GitHub's attestation tooling, for example:

```sh
gh attestation verify agents-cli-0.2.0.tgz --repo matiasnjacob/agents-cli
```

The project does not publish to npm at this time. Publishing an unscoped npm
package would make it publicly downloadable; a future private distribution
would require a scoped package and an access-controlled registry.

## Development and validation

```sh
npm ci
npm run typecheck
npm run build
npm test
npm pack --dry-run
```

The integration suite uses temporary repositories and verifies all four
platforms, dry-run behavior, idempotency, preservation of unrelated files and
installation from a release tarball outside the source checkout.

See [PLAN.md](PLAN.md), [docs/integration-validation.md](docs/integration-validation.md)
and [docs/execution-status.md](docs/execution-status.md) for the roadmap,
evidence and known limitations.

Release history is maintained in [CHANGELOG.md](CHANGELOG.md).

## Contributing

Create a task worktree, keep changes scoped, add deterministic tests for
behavior changes, and open a pull request. Do not commit credentials,
generated `.worktrees/` content, local Graphify data or machine-specific
configuration.
