# Canonical catalog inventory

Inventory date: 2026-09-12

This document records the current global agent and skill sources that will feed the portable catalog. The source of truth is the local `~/.agents` installation; this repository must not depend on that path at runtime or publish personal credentials, caches, histories, or absolute home-directory references.

## Global agents

Seven reusable Markdown roles are present in `~/.agents/agents/`:

| Agent | Responsibility | Codex adapter | Delegation |
| --- | --- | --- | --- |
| `global-orchestrator` | Plans delivery, refines scope, coordinates specialists, and maintains governance artifacts. | `inherit` sandbox | inherited |
| `global-backend-developer` | Implements backend APIs, business logic, persistence, and backend tests. | `inherit` sandbox | disabled |
| `global-frontend-developer` | Implements frontend behavior, accessible UI, client integration, and UI tests. | `inherit` sandbox | disabled |
| `global-aws-specialist` | Designs AWS integrations, infrastructure code, and operational workflows with explicit authorization. | `inherit` sandbox | disabled |
| `global-code-reviewer` | Independently reviews correctness, security, architecture, regressions, and test coverage. | `read-only` sandbox | disabled |
| `global-qa-automator` | Finds coverage gaps and creates or runs deterministic automated tests. | `inherit` sandbox | disabled |
| `global-qa-manual` | Performs independent functional and exploratory acceptance validation. | `inherit` sandbox | disabled |

Each role has a Codex TOML adapter under `adapters/codex/global/` and an OpenCode Markdown source. Models are not pinned. Codex adapter behavior is derived from `adapters/codex/global/manifest.json`; OpenCode-specific UI fields are not portable guarantees.

## Skills

The installed central skill directory contains 129 skill directories. The provenance manifest contains 123 preserved project-scoped records, distributed as follows:

| Source scope | Records |
| --- | ---: |
| `agentic-programming` | 30 |
| `acronis-manager` | 19 |
| `meetscribe-flow` | 16 |
| `personal` | 15 |
| `inventory-dashboard` | 14 |
| `slack-bot-video-assistant` | 10 |
| `aws-elemental-inference` | 9 |
| `jona-test` | 6 |
| `qa-dashboard-project` | 4 |
| **Total preserved provenance records** | **123** |

Six authored generic workflow skills are also present and are the initial candidates for portable inclusion:

- `orchestrator-governance`
- `git-feature-workflow`
- `worktree-task-isolation`
- `code-review-pr`
- `functional-review`
- `developer-task-execution`

The six authored skills account for the difference between the 123 provenance records and 129 installed directories. They are reusable workflow packages rather than additional agents. Project-scoped variants remain traceable in the manifest and require explicit compatibility review before inclusion in the default catalog.

## Supporting sources and scripts

- `manifests/skills.json`: 123 provenance records with source package hashes.
- `manifests/authored.json`: authored generic skills and source groups.
- `manifests/projects.json`: project and alias mappings.
- `adapters/codex/global/manifest.json`: seven adapter records and source hashes.
- `scripts/init-project.py`: existing project initialization behavior to review and port.
- `scripts/render-codex.py`: existing Codex adapter generation behavior to review and port.
- `scripts/worktree.py`: existing worktree location and safety behavior to review and port.

## Portability and exclusion rules

- Preserve the seven role responsibilities and their source hashes.
- Replace absolute source paths with repository-relative references or package metadata.
- Keep model selection inherited from the target client.
- Treat OpenCode permission maps, Codex sandbox settings, and Claude Code controls as adapter-specific capabilities.
- Exclude provider credentials, `.env` files, histories, caches, generated runtimes, and project-private local configurations.
- Do not import agents or skills from `agent-stack`.

## Reproduction checks

The inventory was derived from:

```sh
find ~/.agents/agents -maxdepth 1 -name '*.md' -type f
find ~/.agents/skills -mindepth 1 -maxdepth 1 -type d
jq 'length' ~/.agents/manifests/skills.json
jq '.generic_skills' ~/.agents/manifests/authored.json
```

The next catalog task must turn this inventory into sanitized repository-owned files and a machine-readable manifest, then compare hashes against the recorded sources without copying personal paths.
