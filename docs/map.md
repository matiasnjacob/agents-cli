# Map of the installed harness

`agents-cli map` answers "what is installed here and how is it connected?" without changing anything.

```sh
agents-cli map                       # summary in a terminal, JSON when piped
agents-cli map --platform claude     # one platform only
agents-cli map --format mermaid      # flowchart you can paste into a Mermaid viewer
agents-cli map --format dot | dot -Tsvg > harness.svg   # Graphviz, if installed
agents-cli map --format json
```

## What it reads

- `.<platform>/agents/manifest.json` for the installed agents and skills of each platform.
- The agent files and each skill's `SKILL.md`, to find which skills an agent refers to and to estimate weight (bytes / 4).
- `.agents/mcp-state-<platform>.json` for the MCP servers agents-cli owns, and the `mcpServers` list of Claude Code agents.
- `.agents/hooks-state-claude.json` for the hooks agents-cli manages.

It does not read `.env`, MCP commands or environment values, or any hook or MCP entry you added yourself. Companion files next to a skill (for example brainstorming's visual companion) are not counted: only `SKILL.md` is loaded when a skill runs.

## Checks

Warnings (exit code stays 0; this command only reports):

- a skill or agent listed in the manifest whose file is missing;
- an agent or skill that refers to a catalog skill that is not installed for that platform;
- a Claude Code agent that asks for an MCP server agents-cli did not install.

Informational: skills that no agent or skill refers to. They still load when a task matches their description.

## Inspecting it with skill-map

[skill-map](https://github.com/crystian/skill-map) (MIT, third party, needs Node 24 or later) draws any markdown agent ecosystem as an interactive graph. It works on the files agents-cli installs:

```sh
npm install --save-dev @skill-map/cli    # or use a temporary directory
npx sm init                              # choose the claude lens when asked
npx sm serve                             # http://127.0.0.1:4242
```

skill-map looks at one platform ("lens") at a time, so Codex, OpenCode and Pi skill folders appear as plain markdown when the lens is claude. Two things you may see:

- `frontmatter-invalid: /tools must be array` on Claude Code agents. agents-cli writes `tools` as a comma-separated string, which Claude Code accepts; skill-map's schema expects a list. It is safe to dismiss.
- Our own `.agents/skill-map.json` (a project's scoped skill names) is unrelated to this tool; the name is a coincidence.

Agents installed by the release after 0.8.1 do not trigger the `.agents/imported.md` or `/tmp` broken-link findings that earlier versions produced. skill-map's own `.skill-map/` folder is its database; add it to `.gitignore` if you keep it.

`agents-cli map` and skill-map are complementary: map is part of this CLI, needs no extra runtime, includes MCP servers and hooks, and checks the harness it installed; skill-map gives an interactive view, per-file costs for any markdown, and live activity.
