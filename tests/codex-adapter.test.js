import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { renderCodex } from "../dist/adapters/codex/render.js";

const catalogRoot = join(process.cwd(), "catalog");

test("renders all seven canonical Codex agents and project instructions", async () => {
  const files = await renderCodex({ catalogRoot, selectedSkills: ["orchestrator-governance"] });
  const agents = files.filter((file) => file.path.startsWith(".codex/agents/") && file.path.endsWith(".toml"));
  assert.equal(agents.length, 7);
  assert.ok(files.some((file) => file.path === ".codex/AGENTS.md"));
  assert.ok(files.some((file) => file.path === ".codex/agents/manifest.json"));
  assert.ok(agents.every((file) => !file.content.includes("/Users/") && !file.content.includes("/home/")));
});

test("renders a valid named role with skill reference and permission mapping", async () => {
  const files = await renderCodex({ catalogRoot, selectedSkills: ["orchestrator-governance", "git-feature-workflow"] });
  const orchestrator = files.find((file) => file.path === ".codex/agents/global-orchestrator.toml");
  assert.ok(orchestrator);
  assert.match(orchestrator.content, /^name = "global-orchestrator"/m);
  assert.match(orchestrator.content, /\.codex\/skills\/orchestrator-governance\/SKILL\.md/);
  assert.match(orchestrator.content, /developer_instructions = /);
});

test("preserves read-only and delegation-denied role semantics", async () => {
  const files = await renderCodex({ catalogRoot });
  const reviewer = files.find((file) => file.path === ".codex/agents/global-code-reviewer.toml");
  const aws = files.find((file) => file.path === ".codex/agents/global-aws-specialist.toml");
  assert.ok(reviewer && aws);
  assert.match(reviewer.content, /sandbox_mode = "read-only"/);
  assert.match(aws.content, /\[agents\]\nenabled = false/);
});
