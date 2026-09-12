# Worktree workflow

Create one worktree per task from the repository's primary checkout. Keep
worktrees in `.worktrees/<task>`; the directory is ignored by Git and must
not be committed.

```sh
git worktree add ".worktrees/<task>" -b "feature/<task>" origin/main
git worktree list
git -C ".worktrees/<task>" status --short --branch
```

Before implementation, record the task ID, branch and absolute worktree path
in the project's execution log. Run all edits and validations from that
worktree. After merge, inspect active worktrees before removing one:

```sh
git worktree list --porcelain
git worktree remove ".worktrees/<task>"
```

Do not reset, relocate or remove a worktree that may contain unmerged work.
The repository helper used during development is intentionally not copied
into initialized projects; these commands are portable Git primitives.
