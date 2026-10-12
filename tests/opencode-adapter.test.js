import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { renderOpenCode } from "../dist/adapters/opencode/render.js";

const catalogRoot = join(process.cwd(), "catalog");

test("renders all seven canonical OpenCode agents", async () => {
  const files = await renderOpenCode({ catalogRoot, selectedSkills: ["orchestrator-governance"] });
  const agents = files.filter((file) => file.path.startsWith(".opencode/agents/") && file.path.endsWith(".md"));
  assert.equal(agents.length, 7);
  assert.ok(files.some((file) => file.path === ".opencode/agents/manifest.json"));
  assert.ok(agents.every((file) => file.content.startsWith("---\n") && !file.content.includes("/Users/") && !file.content.includes("/home/")));
});

test("preserves OpenCode front matter and selected skill references", async () => {
  const files = await renderOpenCode({ catalogRoot, selectedSkills: ["orchestrator-governance", "git-feature-workflow"] });
  const orchestrator = files.find((file) => file.path === ".opencode/agents/orchestrator.md");
  assert.ok(orchestrator);
  assert.match(orchestrator.content, /description: "Plans delivery/);
  assert.match(orchestrator.content, /mode: all/);
  assert.match(orchestrator.content, /permission: \{/);
  assert.match(orchestrator.content, /\.opencode\/skills\/orchestrator-governance\/SKILL\.md/);
});

test('applies an optional prefix to OpenCode agent files, IDs, and visible names', async () => {
  const files=await renderOpenCode({catalogRoot,selectedAgents:['orchestrator'],selectedSkills:[],agentPrefix:'acme'});
  const agent=files.find(file=>file.path==='.opencode/agents/acme-orchestrator.md');
  assert.ok(agent);
  assert.match(agent.content,/You are `acme-orchestrator`\./);
  assert.match(agent.content,/`acme-code-reviewer`/);
  assert.match(agent.content,/`acme-qa-manual`/);
  assert.doesNotMatch(agent.content,/`(?:code-reviewer|qa-manual|backend-developer)`/);
  assert.match(agent.content,/"\*":"deny"/);
  assert.match(agent.content,/"acme-backend-developer":"allow"/);
  assert.doesNotMatch(agent.content,/"\*":"allow"/);
  assert.match(files.find(file=>file.path==='.opencode/agents/manifest.json').content,/acme-orchestrator/);
});

test("does not generate a global OpenCode config that could overwrite providers or MCP", async () => {
  const files = await renderOpenCode({ catalogRoot });
  assert.equal(files.some((file) => file.path === "opencode.json"), false);
});
