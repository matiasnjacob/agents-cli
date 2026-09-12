# Project workflows

These workflows are repository-local conventions for agents initialized by
`agents-cli`. They are deliberately independent of a particular tracker or
runtime.

- [Worktrees](./worktree.md) — isolate each task under `.worktrees/`.
- [Linear story](./linear-story.md) — a formatted story example for Linear.
- [Trello card](./trello-story.md) — the equivalent card structure for Trello.
- [Graphify](./graphify.md) — install, index, update and exclude generated data.

The tracker is selected explicitly during `agents-cli init`. Selecting
`none` does not create, require or infer a tracker.
