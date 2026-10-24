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
