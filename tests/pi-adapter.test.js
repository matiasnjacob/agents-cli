import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { renderPi } from "../dist/adapters/pi/render.js";

const catalogRoot = join(process.cwd(), "catalog");

test("renders seven Pi agents, a delegation extension, and project instructions", async () => {
  const files = await renderPi({ catalogRoot, selectedSkills: ["orchestrator-governance"] });
  const agents = files.filter((file) => file.path.startsWith(".pi/agents/") && file.path.endsWith(".md"));
  assert.equal(agents.length, 7);
  assert.ok(files.some((file) => file.path === ".pi/extensions/agents-cli-subagent.ts"));
  assert.ok(files.some((file) => file.path === ".pi/APPEND_SYSTEM.md"));
  assert.ok(files.some((file) => file.path === ".pi/agents/manifest.json"));
  assert.ok(agents.every((file) => file.content.startsWith("---\n") && !file.content.includes("/Users/") && !file.content.includes("/home/")));
});

test("maps Pi tools conservatively and references native Pi skills", async () => {
  const files = await renderPi({ catalogRoot, selectedSkills: ["orchestrator-governance"] });
  const orchestrator = files.find((file) => file.path === ".pi/agents/global-orchestrator.md");
  const backend = files.find((file) => file.path === ".pi/agents/global-backend-developer.md");
  assert.ok(orchestrator && backend);
  assert.match(orchestrator.content, /tools: read, grep, find, ls, bash/);
  assert.doesNotMatch(orchestrator.content, /tools: .*edit/);
  assert.match(backend.content, /tools: .*edit, write/);
  assert.match(orchestrator.content, /\.pi\/skills\/orchestrator-governance\/SKILL\.md/);
});

test("generated Pi extension delegates without shell interpolation and inherits runtime model", async () => {
  const files = await renderPi({ catalogRoot });
  const extension = files.find((file) => file.path === ".pi/extensions/agents-cli-subagent.ts");
  assert.ok(extension);
  assert.match(extension.content, /name: "subagent"/);
  assert.match(extension.content, /shell: false/);
  assert.match(extension.content, /ctx\.model\.provider/);
  assert.match(extension.content, /--no-extensions/);
});
