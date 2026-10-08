# Optional JEV decision support

Jev is a TypeSafe decision model. agents-cli exposes four narrow tools through CLI
and an MCP stdio server, while the existing generative agents retain planning,
implementation, evidence, permissions and independent review responsibilities.

## Configure

Use the setup wizard or include `decisionSupport` in your setup config:

```json
{
  "mode": "shadow",
  "provider": "typesafe",
  "model": "jev-1.13.0",
  "apiKeyEnv": "TYPESAFE_API_KEY",
  "timeoutMs": 10000,
  "maxCalls": 100,
  "maxInputBytes": 32768,
  "audit": false
}
```

Set the named variable in the runtime environment through your normal secret
management. Do not put its value in config. `off` makes no API calls; `shadow`
records an observation but leaves recommendation null; `assist` provides a
recommendation only when evidence and confidence pass the tool's threshold.

The default per-tool threshold is 0.8 and is experimental, not a measured accuracy
guarantee. `thresholds` may override each CLI tool name. `tools` restricts enabled
tools. Configure `endpoint` only when needed; HTTPS is required except loopback
HTTP for local testing. Redirects are rejected so credentials cannot follow them.

Calls transmit the explicit input state to TypeSafe. No repository traversal is
performed. Inputs reject unknown fields and the configured API key, but this is
not a universal sensitive-content filter. Review the text you supply.

## Tools

| CLI | MCP | Input | Result |
| --- | --- | --- | --- |
| route-task | route_task | task, candidates [{id, description}] | One candidate or insufficient-context |
| suggest-skills | suggest_skills | task, candidates [{id, description}] | One candidate or none |
| classify-failure | classify_failure | command, output, optional context | application-bug, environment, possible-flake, insufficient-evidence |
| rank-test-scenarios | rank_test_scenarios | criteria, scenarios [{id, description}] | Scores sorted by impact, then ID |

```sh
agents-cli decision route-task --input examples/decision-task.json
agents-cli decision classify-failure --input failure.json --config agents-cli.config.json
agents-cli decision mcp
```

`--input -` reads JSON from stdin. `--config` accepts a setup configuration or a
standalone decision configuration. Without a project config, mode defaults to off.
CLI reports JSON and exits 1 for unavailable service, 2 for parser errors, and 1 for
invalid input/config. MCP returns tool errors without breaking the protocol session.

Configured native MCP runtimes connect through `agents-cli decision mcp`. Pi
subagents use CLI through bash because their current subprocess disables extensions.
The installer provides instructions, not automatic per-turn interception: tools
must actually be invoked. Missing tools, keys, network or evidence return control
to the agent; a recommendation does not authorize a mutation or certify a PASS.

## Roles

The orchestrator can consult routing and skill selection before handoffs. Backend,
frontend and QA automation consult failure classification and scenario priorities.
AWS uses operational scenario priorities with separate authorization. Reviewers
and manual QA prioritize scenarios while retaining independent proof and observation.
All seven role definitions include these optional policies.

## Bounds and audit

Timeout defaults to 10 seconds, request budget to 100 calls, and request size to
32 KiB including questions. Budgets are per process, not shared across agents or
individual CLI invocations. No automatic retry is performed. Large/invalid responses,
bad distributions, foreign IDs, mismatched Score legends and redirects are rejected.

Audit is opt-in under `.agents-cli-decisions/events.jsonl`. It records an input hash,
typed output, effective model, rubric version, duration and reported usage, without
raw state. Candidate IDs remain visible in the typed output; use non-sensitive IDs.
Ignore this directory in Git. Audit does not record a downstream agent action unless
your caller records that action separately, so it does not establish agent outcomes.

## Evaluate

```sh
agents-cli decision evaluate --dataset catalog/decision-cases.json --output results.json --config agents-cli.config.json
```

Enable JEV first: evaluation calls the paid API explicitly in shadow mode. Output is
created exclusively; choose a new path to avoid overwriting a prior report. The
bundled 38 cases cover Spanish/English, calibration/evaluation, insufficient evidence,
none-of-the-above and an adversarial instruction in task data. They are starter
fixtures, not production performance evidence.

Each case includes id, partition, language, tool, input and expected label (or ordered
scenario IDs). An optional baseline label can come from an independently evaluated
existing agent. Reports keep partitions separate, with raw prediction accuracy,
abstentions, accepted-error rate, unavailable cases, duration, input token usage and
baseline accuracy when supplied. Disabled/unavailable results are not counted as
correct or wrong predictions. Do not tune thresholds on held-out evaluation cases.

The local test suite validates API contracts against a loopback server without paid
calls. Live model accuracy and actual savings have not been established. Jev accepts
text, so it cannot replace screenshot inspection; numeric calculations and sorting
remain deterministic code.

References: [API](https://docs.typesafe.ai/api),
[confidence](https://docs.typesafe.ai/confidence),
[models](https://docs.typesafe.ai/models),
[known limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).
