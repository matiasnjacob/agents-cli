# Setup success-first output (short design)

**Intent.** After `agents-cli setup` the user expects progress and a success message, not a list of warnings. Warnings were the post-install `doctor` checks, which mixed pending user tasks with optional diagnostics. (User's words: "esperaba ver el progreso de la instalacion y un mensaje exitoso, no tanto warning y error".)

**Goals.** Keep step-by-step progress; end with `Setup complete.`; show a short, deduplicated "Before you start" checklist of the tasks that remain (fill `.env`, direnv, Linear OAuth, engram on PATH, start the runtime).

**Non-goals.** No automatic secret entry or extra installs (a larger option, deferred). JSON output for `--yes`/`--dry-run` is unchanged. `agents-cli doctor` keeps the full diagnostics.

**Anti-goals.** Hiding a real failure: only `fail` checks are shown during setup, as errors.

**Approaches considered.** (1) Success first with a separate task checklist, chosen by the user; (2) additionally resolve missing items interactively, deferred; (3) remove doctor from setup, rejected because a broken install would go unnoticed.

**Builder's calls.** Warnings are dropped from the setup output entirely; the engram binary is detected with `command -v engram`; Linear OAuth is rephrased as a first-use step.
