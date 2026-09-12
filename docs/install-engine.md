# Installation engine

Adapters provide project-relative rendered files to `planInstall` and
`applyInstall`. Planning reads the existing files and the previous
`.agents-cli.lock.json` before any write.

- A missing destination is a create.
- An identical destination is unchanged.
- A managed destination whose content still matches the lockfile is backed up
  and updated.
- A locally edited or unmanaged destination is a conflict and is never changed.
- `dryRun` returns the plan without writing files or backups.

Backups are stored under `.agents-cli-backups/<timestamp>/`. Writes use a
temporary file followed by a rename. If a later write fails, keep the backup
directory, restore the affected files manually, and remove only the temporary
`*.agents-cli-tmp` files after confirming they are not needed. Recovery and
cleanup commands will be surfaced by the future CLI command layer.
