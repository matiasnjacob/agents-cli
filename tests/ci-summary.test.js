import test from "node:test";
import assert from "node:assert/strict";
import { parseTapTests, renderSummary } from "../scripts/ci-test-summary.mjs";

test("parses every TAP test result and keeps its status", () => {
  const results = parseTapTests([
    "TAP version 13",
    "ok 1 - first test",
    "not ok 2 - second test",
    "1..2",
  ].join("\n"));
  assert.deepEqual(results, [
    { status: "passed", name: "first test" },
    { status: "failed", name: "second test" },
  ]);
});

test("renders a readable row for every parsed test", () => {
  const summary = renderSummary([{ status: "passed", name: "test | with separator" }], "success");
  assert.match(summary, /\| passed \| test \\\| with separator \|/);
  assert.match(summary, /\*\*Tests:\*\* 1/);
  assert.match(summary, /\*\*Overall:\*\* success/);
});
