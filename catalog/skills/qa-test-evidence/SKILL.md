---
name: qa-test-evidence
description: "Generate test cases with JEV and record every verification as Playwright evidence; mandatory for manual QA and test automation."
---

## Test cases come from JEV

1. Derive candidate scenarios from the acceptance criteria: happy paths, edge cases, error recovery and regressions. Give each a stable `id` and a one-line description.
2. Call JEV `rank_test_scenarios` (MCP tool on Codex, OpenCode and Claude Code; `agents-cli decision rank-test-scenarios --input -` through bash on Pi) with the criteria and scenarios. Supply minimal context and no secrets.
3. Build the test-case list from the ranked result: execute in ranked order, and record the score next to each case. Add a case JEV did not rank only with a stated reason.
4. For automated failures, call `classify_failure` before deciding between application bug, environment and flake.
5. If JEV is disabled, unavailable or returns insufficient evidence, say so explicitly, fall back to your own risk ordering and mark JEV usage NOT VERIFIED. Never claim JEV was used unless the call ran. JEV never certifies a result; only observed behavior does.

## Evidence comes from Playwright

Every executed case must leave Playwright evidence under `evidence/<task-or-case-id>/`:

- a screenshot of the observed state, taken at each assertion that matters;
- a trace (`trace: 'on'` or `context.tracing`) and, for flows with timing or navigation, a video;
- the exact command, URL, build/commit and environment used.

Manual QA drives the application through Playwright (MCP browser tools or the Playwright CLI) so each step is reproducible. Automation keeps Playwright tests with stable semantic selectors and enables screenshots, traces and video in its configuration.

## Report

List each case with its JEV rank, PASS / FAIL / NOT VERIFIED, and the evidence file paths. A case without Playwright evidence is NOT VERIFIED. Keep credentials out of screenshots, traces and reports.
