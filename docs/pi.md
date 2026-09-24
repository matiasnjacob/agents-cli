# Pi adapter

Initialize a trusted project with:

```sh
agents-cli init --platform pi --tracker none --skills orchestrator-governance --yes
```

The adapter writes:

- `.pi/agents/*.md`: seven project-local role definitions;
- `.pi/skills/<name>/SKILL.md`: selected native Agent Skills;
- `.pi/extensions/agents-cli-subagent.ts`: the `subagent` delegation tool;
- `.pi/APPEND_SYSTEM.md`: role discovery and operating guidance;
- `.pi/agents/manifest.json`: managed platform metadata used by `doctor` and `update --dry-run`.

Pi loads `.pi` resources only after project trust is granted. Review generated or repository-controlled extensions and agent prompts before trusting an unfamiliar checkout. Run `/reload` after changing resources during an active session.

## Delegation

Ask the main agent to delegate with a named role, or let it call the generated tool:

```text
Use global-code-reviewer to review the current diff and report findings only.
```

The tool starts a separate one-shot Pi process with the selected role as appended system instructions. It inherits the parent session's model and thinking level, uses an explicit built-in-tool allowlist, disables extensions in the child process to prevent recursive delegation, and does not persist a child session.

The generated extension supports one task per call. Parallel and chained orchestration can be performed by separate tool calls from the parent, but the adapter does not claim the richer UI or scheduling behavior of Pi's upstream subagent example.

## Permission mapping

Pi can enforce the child process's built-in-tool allowlist. Read-only roles receive `read`, `grep`, `find`, `ls`, and (when not denied by the source role) `bash`. Roles with unrestricted source editing also receive `edit` and `write`.

Source `ask` policies and path-specific edit rules have no direct equivalent in this lightweight adapter. They remain visible in role instructions but are not represented as hard enforcement. Pi project trust, active runtime settings, provider authentication, and operating-system permissions remain authoritative.

## Skills

Pi discovers the selected skills natively from `.pi/skills`. Their `SKILL.md` files follow the Agent Skills format and can be loaded automatically or explicitly with `/skill:<name>`. No global `~/.pi/agent` configuration is modified.
