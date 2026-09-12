import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = (name) => fs.readFileSync(path.join(root, 'catalog', 'workflows', name), 'utf8');

test('tracker templates share the required story contract', () => {
  for (const name of ['linear-story.md', 'trello-story.md']) {
    const content = workflow(name);
    for (const field of ['Context', 'Goal', 'Scope', 'Out of scope', 'Acceptance criteria', 'Dependencies', 'Branch', 'Worktree', 'Evidence']) {
      assert.match(content, new RegExp(`## ${field}|- ${field}:`), `${name} is missing ${field}`);
    }
  }
});

test('worktree workflow uses repository-local ignored paths', () => {
  const content = workflow('worktree.md');
  assert.match(content, /\.worktrees\/<task>/);
  assert.match(content, /git worktree add/);
  assert.doesNotMatch(content, /\/Users\/|~\/\.agents/);
});

test('Graphify workflow documents verified lifecycle commands and generated-data policy', () => {
  const content = workflow('graphify.md');
  for (const command of ['graphify install', 'graphify update', 'graphify check-update', 'graphify uninstall --purge']) {
    assert.match(content, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(content, /\/graphify-out\//);
  assert.match(content, /separate follow-up/);
});
