# Graphify workflow

Graphify is an optional local tool. It is not invoked by `agents-cli init`
unless a future platform integration explicitly selects it.

The local installation verified for this project is `graphify 0.9.48`. The
tool copies its skill to a selected platform and maintains generated graph
data separately from the source checkout:

```sh
graphify install --platform codex       # or opencode, claude
graphify update .                       # re-extract and rebuild the graph
graphify check-update .                 # cron/CI-safe pending-update check
```

Use `graphify path`, `explain`, `query` or `affected` against
`graphify-out/graph.json` for navigation and analysis. `graphify install`
supports additional runtimes; platform availability should be checked with
the installed version before adding a new adapter.

Generated data is local analysis state and must not be committed by default:

```gitignore
/graphify-out/
```

Keep source files, configuration decisions and reproducible workflow
documentation in Git. Use `graphify uninstall --purge` only when deliberately
removing the installed skill and generated graph state. Credentials for any
LLM backend remain outside the repository.

## Compatibility follow-up

The command surface is verified locally, but this repository still needs a
product decision about whether `agents-cli` should wrap Graphify or only
document it. Platform-specific output paths and the user's preferred Graphify
repository/configuration remain a separate follow-up.
