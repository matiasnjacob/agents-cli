import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { renderClaude } from "../dist/adapters/claude/render.js";

const catalogRoot = join(process.cwd(), "catalog");

test("renders seven discoverable Claude Code agents and project instructions", async () => {
  const files = await renderClaude({ catalogRoot, selectedSkills: ["orchestrator-governance"] });
  const agents = files.filter((file) => file.path.startsWith(".claude/agents/") && file.path.endsWith(".md"));
  assert.equal(agents.length, 7);
  assert.ok(files.some((file) => file.path === "CLAUDE.md"));
  assert.ok(files.some((file) => file.path === ".claude/agents/manifest.json"));
  assert.ok(agents.every((file) => file.content.startsWith("---\n") && !file.content.includes("/Users/") && !file.content.includes("/home/")));
});

test("renders selected skill references and supported Claude tool metadata", async () => {
  const files = await renderClaude({ catalogRoot, selectedSkills: ["orchestrator-governance", "git-feature-workflow"] });
  const orchestrator = files.find((file) => file.path === ".claude/agents/orchestrator.md");
  assert.ok(orchestrator);
  assert.match(orchestrator.content, /name: orchestrator/);
  assert.match(orchestrator.content, /tools: .*Read/);
  assert.match(orchestrator.content, /\.claude\/skills\/orchestrator-governance\/SKILL\.md/);
  assert.match(orchestrator.content, /permissionMode: plan/);
});
test('selected MCP tools are available to Claude roles without broadening permission scope',async()=>{
  const files=await renderClaude({catalogRoot,selectedAgents:['orchestrator'],selectedSkills:[],selectedMcpServers:['agents-cli-jev','agents-cli-github']});
  const prompt=files.find(f=>f.path.endsWith('orchestrator.md')).content;
  assert.match(prompt,/mcpServers: \["agents-cli-jev","agents-cli-github"\]/);
  assert.doesNotMatch(prompt,/agents-cli-linear/);
  assert.doesNotMatch(prompt,/Skills live in `~\/\.agents\/skills`/);
});

test("maps read-only roles to plan mode and denies task delegation when requested", async () => {
  const files = await renderClaude({ catalogRoot });
  const reviewer = files.find((file) => file.path === ".claude/agents/code-reviewer.md");
  const aws = files.find((file) => file.path === ".claude/agents/aws-specialist.md");
  assert.ok(reviewer && aws);
  assert.match(reviewer.content, /permissionMode: plan/);
  assert.match(reviewer.content, /Task delegation is not enabled/);
  assert.match(aws.content, /Task delegation is not enabled/);
});

test('applies an optional prefix to Claude agent files, IDs, names, and manifest', async () => {
  const files=await renderClaude({catalogRoot,selectedAgents:['backend-developer'],selectedSkills:[],agentPrefix:'acme'});
  const agent=files.find(file=>file.path==='.claude/agents/acme-backend-developer.md');
  assert.ok(agent);
  assert.match(agent.content,/name: acme-backend-developer/);
  assert.match(files.find(file=>file.path==='.claude/agents/manifest.json').content,/acme-backend-developer/);
});
