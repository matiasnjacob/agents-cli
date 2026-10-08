# Interactive setup

Install agents-cli from a GitHub Release first, then run `agents-cli setup` in the
repository to configure. Node.js >=20 is required. The wizard does not install an
agent runtime, global packages or authentication credentials.

The wizard selects platform, suite, agents, tracker, MCPs, skills and optional JEV.
Enter selects the displayed default; numeric/name choices and comma-separated
multiple selections are supported. `-` clears a multiple selection; `q`, `cancel`,
EOF or Ctrl-C cancels before application. Application requires the literal `yes`.

Suites are `complete`, `backend`, `frontend`, `review-qa` and `custom`. Roles can be
adjusted independently. Required skills are included automatically. Existing setup
choices are offered as defaults. A platform selection is explicit; multiple legacy
installations are never silently resolved by `update`.

## Replay and previews

```sh
agents-cli suites list
agents-cli mcp list --platform claude
agents-cli setup --config examples/backend-claude.json --dry-run
agents-cli setup --config examples/backend-claude.json --yes
agents-cli update --dry-run
```

Paths are relative to the current repository or absolute. Setup writes the resolved
`agents-cli.config.json` so another person can reproduce selections. No terminal is
required with `--config --yes` or `--config --dry-run`. `--yes` without a config is
rejected. New commands reject unknown, repeated or missing-value flags.

The engine detects local edits using `.agents-cli.lock.json`. Conflicts prevent all
installation writes. Unchanged managed roles and skills no longer selected are
removed with backups; edited ones remain conflicts. Changing platforms preserves
other platforms' files. `skills add` preserves the setup selection and subsequent
update preview sees the new skill.

Preview lists creates, updates, removals, unchanged files, conflicts and pending
steps. A dry-run can resolve external sources in temporary staging, without writing
into the project or installing packages. Legacy `init` retains its explicit-flag
contract and installs all seven roles.

## MCP support

| Integration | Codex | Claude | OpenCode | Pi |
| --- | --- | --- | --- | --- |
| GitHub | HTTP, GITHUB_TOKEN | HTTP, GITHUB_TOKEN | Remote, GITHUB_TOKEN | Manual/pending |
| Linear | HTTP, OAuth | HTTP, OAuth | Remote, OAuth | Manual/pending |
| Trello | Manual/pending | Manual/pending | Manual/pending | Manual/pending |
| JEV | stdio | stdio | Local | CLI through bash |

GitHub uses its official remote endpoint; Linear uses `https://mcp.linear.app/mcp`.
Trello does not have a verified portable provider bundled in this release. Selecting
a tracker installs the matching workflow and proposes its MCP; an unselected or
unsupported connection is explicitly pending.

MCPs use names prefixed with `agents-cli-` in `.codex/config.toml`, `.mcp.json` or
`opencode.json`/`opencode.jsonc`. TOML comments and sections outside the managed block
are retained. JSONC edits retain comments and unrelated values. Existing managed
entries must still match ownership metadata under `.agents/mcp-state-*.json`;
unmanaged name collisions are conflicts. Ambiguous OpenCode JSON/JSONC files are
rejected. Configuring JEV stdio requires `agents-cli` on the runtime PATH.

Tokens are environment references, never expanded while generating files. Set
`GITHUB_TOKEN` in the runtime environment, or complete Linear OAuth in the runtime.
Authentication and actual tool calls are separate from writing configuration.
`doctor` reports local configuration and credential-variable presence; it does not
claim OAuth or remote tools have been tested.

## External skills

Use skills.sh to identify a skill's source. In the wizard, paste a JSON array with
the GitHub repository, full 40-character commit SHA and skill directory, or use the
same object in the configuration's `skills` array:

```json
{
  "id": "my-skill",
  "repository": "owner/repository",
  "revision": "0123456789abcdef0123456789abcdef01234567",
  "path": "skills/my-skill"
}
```

The example SHA illustrates the format; supply an existing source commit. Git is
required to download external skills. The installer copies text resources without
executing their scripts, requires a nonempty license file, rejects symlinks and
binary resources, and limits the directory to 500 files and 2 MB. A license file is
recorded for review; its presence is not a legal assessment of permitted use.
Source revision, license and resource hashes are recorded in
`.agents/external-skills.json`, itself tracked by the installation lockfile.

## Recovery

Updates/removals are backed up under `.agents-cli-backups/<timestamp>`. A failed
apply restores files already changed and removes only new files it created. Empty
directories may remain. Recovery failures identify paths requiring manual attention;
inspect backups before retrying. Abrupt termination is not a transactional filesystem
guarantee. A preexisting `*.agents-cli-tmp` file is preserved and blocks the write.

References: [Claude project MCP](https://code.claude.com/docs/en/mcp),
[OpenCode MCP](https://opencode.ai/docs/mcp-servers/),
[Codex MCP](https://developers.openai.com/codex/mcp),
[GitHub MCP](https://github.com/github/github-mcp-server),
[Linear MCP](https://linear.app/docs/mcp).
