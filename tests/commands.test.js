import test from "node:test";
import assert from "node:assert/strict";
import { parseCommandArgs } from "../dist/cli/parse.js";

test("requires explicit platform and tracker for init", () => {
  assert.match(parseCommandArgs(["init", "--platform", "codex"]).message, /requires both/);
});

test("parses init skill selection and dry-run", () => {
  assert.deepEqual(parseCommandArgs(["init", "--platform", "codex", "--tracker", "none", "--skills", "a,b", "--yes", "--dry-run"]), {
    kind: "init", config: { platform: "codex", tracker: "none", skills: ["a", "b"], yes: true, dryRun: true },
  });
});

test("parses skills list and add commands", () => {
  assert.deepEqual(parseCommandArgs(["skills", "list", "--platform", "claude"]), { kind: "skills-list", platform: "claude" });
  assert.deepEqual(parseCommandArgs(["skills", "add", "git-feature-workflow", "--platform", "opencode"]), { kind: "skills-add", platform: "opencode", skill: "git-feature-workflow", dryRun: false });
});
