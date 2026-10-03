import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCorpus, sha256 } from '../src/corpus.js';

test('all five teams have complete, attributable Slack conversations', async () => {
  const { workspace, documents } = await loadCorpus();
  assert.equal(workspace.synthetic, true);
  assert.equal(documents.length, 50);
  assert.equal(documents.reduce((n, d) => n + d.messages.length, 0), 150);
  const ids = new Set();
  for (const department of ['Engineering', 'Sales', 'Support', 'CSM', 'Operations']) {
    assert.equal(documents.filter(d => d.department === department).length, 10);
  }
  for (const document of documents) {
    assert.equal(document.contentHash, sha256(document.text));
    let previous = '';
    for (const message of document.messages) {
      assert.ok(!ids.has(message.id)); ids.add(message.id);
      assert.ok(message.author && message.text.length > 30);
      assert.ok(message.postedAt >= previous); previous = message.postedAt;
      assert.ok(document.text.includes(message.text));
      for (const reaction of message.reactions) {
        assert.equal(reaction.count, reaction.users.length);
        assert.ok(reaction.users.every(id => workspace.users.some(u => u.id === id)));
      }
    }
  }
});
