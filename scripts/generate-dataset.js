import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { people, channelDefinitions, scenarios } from '../data/scenarios.js';

const dataDirectory = fileURLToPath(new URL('../data/', import.meta.url));
const users = people.map(([handle, name, department, role], i) => ({
  id: `U${String(i + 1).padStart(8, '0')}`, name: handle, real_name: name,
  department, role, email: `${handle}@relayai.example`, is_bot: false, deleted: false,
}));
const byHandle = new Map(users.map(user => [user.name, user]));
const channels = channelDefinitions.map(([name, department, purpose], i) => ({
  id: `C${String(i + 1).padStart(8, '0')}`, name, department, purpose,
  is_private: name.startsWith('customer-') || name === 'ops-finance' || name === 'ops-security',
}));
const byChannel = new Map(channels.map(channel => [channel.name, channel]));
const messages = [];
const threads = [];

for (const [i, scenario] of scenarios.entries()) {
  const channel = byChannel.get(scenario.channel);
  if (!channel) throw new Error(`Unknown channel ${scenario.channel}`);
  const start = new Date(`2026-06-${String(scenario.day).padStart(2, '0')}T${scenario.time}:00.000Z`);
  // Explicit offsets preserve incident timing; otherwise replies have natural gaps.
  const offsets = [0, 3 + i % 6, 13 + i % 8, 31 + i % 13];
  const rootTs = `${Math.floor(start.getTime() / 1000)}.000000`;
  const members = scenario.messages.map(([handle]) => byHandle.get(handle));
  if (members.some(user => !user)) throw new Error(`Unknown participant in ${scenario.id}`);
  const threadMessages = scenario.messages.map(([handle, text, offset], j) => {
    const at = new Date(start.getTime() + (offset ?? offsets[j]) * 60000);
    const user = byHandle.get(handle);
    return {
      type: 'message', user: user.id, channel: channel.id,
      ts: `${Math.floor(at.getTime() / 1000)}.000000`, thread_ts: rootTs,
      timestamp: at.toISOString(), text,
      ...(j === 0 ? { reply_count: scenario.messages.length - 1, reply_users: [...new Set(members.slice(1).map(u => u.id))] } : {}),
      ...(j === scenario.messages.length - 1 && i % 3 === 0 ? { reactions: [{ name: 'white_check_mark', users: [members[0].id], count: 1 }] } : {}),
      ...(j === 0 && i % 9 === 0 ? { reactions: [{ name: 'eyes', users: [members[1].id, members[2].id], count: 2 }] } : {}),
    };
  });
  messages.push(...threadMessages);
  const text = [
    `RelayAI Slack | #${channel.name} | ${channel.department} | ${scenario.title}`,
    ...threadMessages.map(message => {
      const author = users.find(user => user.id === message.user);
      return `[${message.timestamp}] ${author.real_name} (${author.department}): ${message.text}`;
    }),
  ].join('\n');
  threads.push({
    _id: scenario.id, workspace: 'RelayAI', synthetic: true,
    channel: channel.name, channelId: channel.id, department: channel.department,
    title: scenario.title, threadTs: rootTs, startedAt: start.toISOString(),
    lastMessageAt: threadMessages.at(-1).timestamp,
    participants: [...new Set(members.map(user => user.real_name))],
    messageCount: threadMessages.length,
    permalink: `https://relayai.slack.example/archives/${channel.id}/p${rootTs.replace('.', '')}`,
    text,
    messages: threadMessages.map(message => ({
      ...message, author: users.find(user => user.id === message.user).real_name,
      authorDepartment: users.find(user => user.id === message.user).department,
    })),
    contentHash: createHash('sha256').update(text).digest('hex'),
  });
}
messages.sort((a, b) => a.ts.localeCompare(b.ts));
threads.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a._id.localeCompare(b._id));
const workspace = {
  schemaVersion: 1, synthetic: true,
  company: {
    name: 'RelayAI', domain: 'relayai.example',
    description: 'Fictional B2B AI SaaS company providing permission-aware knowledge retrieval and reviewed workflow assistance over Slack and Drive.',
    period: { from: '2026-06-01', through: '2026-06-26', timezone: 'UTC' },
    departments: ['Engineering', 'Sales', 'Support', 'CSM', 'Operations'],
    customers: ['Northstar Logistics', 'Helio Health', 'MapleCloud', 'Atlas Retail', 'CedarDesk', 'Solstice', 'BluePeak Finance', 'BrightCart'],
  },
  users, channels, messages,
};
const manifest = {
  schemaVersion: 1, synthetic: true,
  users: users.length, channels: channels.length, messages: messages.length, threads: threads.length,
  departments: Object.fromEntries(workspace.company.departments.map(department => [department, {
    users: users.filter(user => user.department === department).length,
    messages: messages.filter(message => users.find(user => user.id === message.user).department === department).length,
    threads: threads.filter(thread => thread.department === department).length,
  }])),
  corpusSha256: createHash('sha256').update(JSON.stringify(threads)).digest('hex'),
};
await mkdir(dataDirectory, { recursive: true });
for (const [name, contents] of [['workspace.json', workspace], ['threads.json', threads], ['manifest.json', manifest]]) {
  await writeFile(`${dataDirectory}/${name}`, `${JSON.stringify(contents, null, 2)}\n`);
}
console.log(JSON.stringify(manifest, null, 2));
