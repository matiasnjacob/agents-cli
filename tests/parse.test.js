import test from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs } from "../dist/cli/parse.js";

test("accepts supported platform and tracker values", () => {
  assert.deepEqual(parseCliArgs([
    "validate", "--platform", "codex", "--tracker", "linear",
  ]), { kind: "config", config: { platform: "codex", tracker: "linear" } });
});

test("rejects unsupported platform values", () => {
  assert.match(parseCliArgs([
    "validate", "--platform", "cursor", "--tracker", "none",
  ]).message, /Invalid platform/);
});

test("rejects incomplete non-interactive validation", () => {
  assert.match(parseCliArgs(["validate", "--platform", "claude"]).message, /requires both/);
});
