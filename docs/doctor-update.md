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
