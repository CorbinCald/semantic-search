import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');

export async function loadCorpus() {
  const raw = await readFile(new URL('../data/workspace.json', import.meta.url), 'utf8');
  const workspace = JSON.parse(raw);
  const users = new Map(workspace.users.map(u => [u.id, u]));
  const channels = new Map(workspace.channels.map(c => [c.id, c]));
  const ids = new Set();
  const documents = workspace.threads.map(thread => {
    const channel = channels.get(thread.channel);
    if (!channel || ids.has(thread.id) || !thread.messages.length) throw new Error('Invalid thread');
    ids.add(thread.id);
    const root = thread.messages[0].ts;
    const messages = thread.messages.map(message => {
      const user = users.get(message.user);
      if (!user || !message.text.trim() || message.thread_ts !== root) throw new Error('Invalid Slack message');
      return { ...message, author: user.name, authorDepartment: user.department,
        postedAt: new Date(Number(message.ts) * 1000).toISOString() };
    });
    const text = `${workspace.name} | #${channel.name} | ${channel.department}\n${thread.title}\n` +
      messages.map(m => `${m.author}: ${m.text}`).join('\n');
    return { _id: thread.id, workspace: workspace.name, channel: channel.name,
      department: channel.department, title: thread.title, startedAt: messages[0].postedAt,
      messages, text, contentHash: sha256(text), synthetic: true };
  });
  return { workspace, documents, datasetSha256: sha256(raw) };
}
