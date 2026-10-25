# Doctor and update

`agents-cli doctor` emits JSON diagnostics with `pass`, `warn` and `fail`
statuses. It checks the Node.js version, catalog, installation lockfile,
platform manifest, Docker availability for a declared MCP profile, and the
declared external actor alias.

The command distinguishes local configuration from functionality: a declared
MCP profile and reachable Docker daemon do not prove that a Linear or GitHub
tool call is authorized. Doctor never prints tokens, private keys or secret
values.

`agents-cli update --dry-run` detects the installed platform and selected
skills from its generated manifest, rebuilds the desired files from the local
catalog, and reports creates, updates, unchanged files and conflicts. It
never writes files. Applying an update is intentionally not available until
an explicit conflict-resolution and backup flow is exposed.

If a managed file was edited after installation, its hash no longer matches
the lockfile and the update is reported as a conflict. Preserve the edit,
review the catalog diff, and resolve it explicitly before any future apply
operation.

## update and check

`agents-cli check` is read-only. It compares the installed files with what the current catalog would render for `agents-cli.config.json` and reports files to create, update or remove, locally edited files (conflicts) and missing `.env` variables. It exits 1 on any drift and prints JSON with `--json` or when piped, so it fits CI.

`agents-cli update` applies the configured setup again with the same plan and confirmation as `setup`; `--yes` skips the prompt and prints JSON, and `--dry-run` keeps the previous preview behavior. Edited files are never overwritten: they are reported as conflicts and nothing is written until they are resolved. If everything is current, `update` says so and does nothing.

## External skills freshness

`check` also compares each pinned external skill (such as `brainstorming`) with the upstream default-branch commit using `git ls-remote`. A newer upstream revision is reported with a GitHub compare link but is informational: it does not change the exit code. If the network is unavailable the skill is reported as "not verified", never as an error.

`agents-cli skills update [id]` moves the pin in `agents-cli.config.json` to the upstream commit and applies it through the normal setup plan and confirmation (`--yes` skips the prompt, `--dry-run` only reports). If the user cancels or the plan has conflicts, the config file is restored.

## uninstall and revert

`agents-cli uninstall` removes what agents-cli installed: files whose hash still matches `.agents-cli.lock.json`, and the MCP entries it owns inside `.mcp.json`, `opencode.json(c)` or `.codex/config.toml` (your own entries and the file itself stay). Files you edited are kept and listed. `.env`, `.envrc` and `.gitignore` are never touched. Removed files are saved in `.agents-cli-backups/<timestamp>/`. It needs `--yes` (or an interactive confirmation); `--dry-run` previews.

`agents-cli revert [timestamp]` restores the files of a backup (the latest by default; `--list` shows them). The current contents are backed up first, so a revert can itself be reverted.

## Skills from any repository

`agents-cli skills add owner/repo --path <dir> [--ref <sha|branch|tag>] [--id <id>] [--dry-run] [--yes]` adds a skill from a GitHub repository to the configured setup. The ref (default: the repository's default branch) is resolved to a full commit SHA and pinned in `agents-cli.config.json`. The skill is staged first with the same checks as other external skills: it needs a license file and text-only resources, and symlinks, `.git` content and oversized skills are rejected. `--dry-run` prints the resolved commit, file count, license and a GitHub link to review the content; skills are executable instructions, so review them before applying. The id defaults to the directory name and cannot clash with catalog skills. If you cancel or the plan has conflicts, the config is restored. Catalog skills still use `skills add <id> --platform <p>`.

## Importing existing configuration

`agents-cli import [--dry-run] [--json]` looks for project instructions that agents-cli did not create: `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.cursor/rules/*`, `.github/copilot-instructions.md`, and MCP server names already present in `.mcp.json`, `opencode.json(c)` and `.codex/config.toml`. It writes one managed index, `.agents/imported.md`, listing each file with its title and size. The installed agents are told to read that index first and follow the listed files' project conventions; the index states that they never override agents-cli safety rules.

Nothing is copied: original files are never edited or deleted, instruction bodies stay in place, and MCP entries are reported by name only because commands and environment values can hold secrets. Files agents-cli manages are skipped. Re-run `import` after adding files; `uninstall` removes the index like any managed file.

## Engram hooks (Claude Code)

The `engram-session` skill asks agents to sync and save their Engram session, but a skill only works if the agent follows it. When the `engram` MCP is selected and the platform includes `claude`, setup also merges managed hooks into `.claude/settings.json` (disable with `"hooks": { "engram": false }` in `agents-cli.config.json`):

- `Stop` runs `agents-cli hook engram-stop`. If the session used tools but never called `mem_session_summary`, it blocks the stop once and asks the agent to save the summary first. It never blocks twice in a row (`stop_hook_active`), never blocks a session that used no tools, and reads only real tool calls from the transcript.
- `SessionStart` runs `engram context` to load recent memory. It is skipped when the Engram Claude Code plugin is enabled in your `~/.claude/settings.json`, because the plugin does that itself.

Your own hooks and settings are preserved; only handlers with these exact commands are managed (recorded in `.agents/hooks-state-claude.json`), and `uninstall` removes only them. The Stop hook needs `agents-cli` on your `PATH` (`npm i -g @matiasnjacob/agents-cli`); `doctor` warns when it is missing. Other platforms are not enforced: they rely on the skill alone.
