import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const workspace = JSON.parse(await readFile(new URL('../data/workspace.json', import.meta.url), 'utf8'));
const threads = JSON.parse(await readFile(new URL('../data/threads.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('../data/manifest.json', import.meta.url), 'utf8'));

test('Slack export has valid people, channels, root messages, and ordered replies', () => {
  const users = new Set(workspace.users.map(u => u.id));
  const channels = new Set(workspace.channels.map(c => c.id));
  const roots = new Map(workspace.messages.filter(m => m.ts === m.thread_ts).map(m => [`${m.channel}/${m.ts}`, m]));
  assert.equal(roots.size, threads.length);
  assert.equal(new Set(threads.map(t => t._id)).size, threads.length);
  for (const message of workspace.messages) {
    assert.ok(users.has(message.user));
    assert.ok(channels.has(message.channel));
    assert.ok(roots.has(`${message.channel}/${message.thread_ts}`));
    assert.ok(message.ts >= message.thread_ts);
  }
  for (const thread of threads) {
    const root = roots.get(`${thread.channelId}/${thread.threadTs}`);
    assert.equal(root.reply_count + 1, thread.messages.length);
    assert.equal(thread.contentHash, createHash('sha256').update(thread.text).digest('hex'));
    assert.ok(thread.messages.every(m => thread.text.includes(m.text)));
  }
});

test('all five departments have enough independent conversations and named people', () => {
  assert.equal(workspace.synthetic, true);
  assert.deepEqual(workspace.company.departments, ['Engineering', 'Sales', 'Support', 'CSM', 'Operations']);
  for (const department of workspace.company.departments) {
    assert.equal(workspace.users.filter(u => u.department === department).length, 5);
    assert.ok(threads.filter(t => t.department === department).length >= 12);
  }
  assert.equal(manifest.messages, workspace.messages.length);
  assert.equal(manifest.corpusSha256, createHash('sha256').update(JSON.stringify(threads)).digest('hex'));
});

test('incident chronology and policy supersession retain evidence needed for real search questions', () => {
  const incident = threads.find(t => t._id === 'eng-007');
  assert.equal((Date.parse(incident.lastMessageAt) - Date.parse(incident.startedAt)) / 60000, 53);
  assert.match(incident.text, /no evidence of lost jobs/);
  const policy = threads.find(t => t._id === 'ops-010');
  assert.match(policy.text, /21 days/);
  assert.match(policy.text, /keep their existing end date/);
  const credit = threads.find(t => t._id === 'support-011');
  assert.match(credit.text, /CM-104/);
  assert.match(credit.text, /\$186\.40/);
});
