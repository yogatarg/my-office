// Menyelaraskan kantor pusat (folder playground) dengan office.config.json:
//  1. .claude/settings.json: hooks ke server kantor + izin akses folder workspace.
//  2. .claude/agents/<peran>.md: dibuat untuk peran baru; file yang sudah ada tidak ditimpa.
// Pemakaian: npm run sync

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hq = path.join(root, 'playground');
const toPosix = (p) => p.split(path.sep).join('/');

const config = JSON.parse(await readFile(path.join(root, 'office.config.json'), 'utf8'));
const exists = (p) => access(p).then(() => true, () => false);

// ---------- settings.json ----------
const HOOK_EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop', 'Notification', 'Stop'];
const WITH_MATCHER = new Set(['PreToolUse', 'PostToolUse']);
const command = `node ${toPosix(path.join(root, 'hooks', 'send-event.js'))}`;

const settingsPath = path.join(hq, '.claude', 'settings.json');
const settings = (await exists(settingsPath)) ? JSON.parse(await readFile(settingsPath, 'utf8')) : {};

settings.hooks = Object.fromEntries(
  HOOK_EVENTS.map((event) => {
    const hook = { type: 'command', command, timeout: 5 };
    return [event, [WITH_MATCHER.has(event) ? { matcher: '*', hooks: [hook] } : { hooks: [hook] }]];
  }),
);
// Tim boleh bekerja di folder workspace; setiap edit dan perintah tetap meminta izin seperti biasa.
settings.permissions = { ...settings.permissions };
const dirs = new Set(settings.permissions.additionalDirectories ?? []);
if (config.workspace) dirs.add(config.workspace);
settings.permissions.additionalDirectories = [...dirs];

await mkdir(path.dirname(settingsPath), { recursive: true });
await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log(`✔ settings.json: ${HOOK_EVENTS.length} hooks, workspace ${[...dirs].join(', ') || '(tidak ada)'}`);

// ---------- agents/*.md ----------
const DEFAULT_TOOLS = 'Read, Edit, Write, Grep, Glob, Bash';
const agentsDir = path.join(hq, '.claude', 'agents');
await mkdir(agentsDir, { recursive: true });

for (const division of config.divisions) {
  for (const [key, role] of Object.entries(division.roles ?? {})) {
    const file = path.join(agentsDir, `${key}.md`);
    if (await exists(file)) {
      console.log(`· ${key}.md sudah ada, dibiarkan`);
      continue;
    }
    const label = role.label ?? key;
    const body = `---
name: ${key}
description: ${label} di divisi ${division.name}. ${role.description ?? ''}
tools: ${role.tools ?? DEFAULT_TOOLS}
---
Kamu ${label} di divisi ${division.name}, ${config.name}. Tugas utamamu: ${role.description ?? 'mengerjakan bagian proyek sesuai peranmu.'}

- Kerjakan hanya di folder proyek yang disebutkan CEO (di dalam ${config.workspace ?? 'workspace'}).
- Ikuti struktur dan gaya kode yang sudah ada di proyek itu.
- Jangan mengerjakan bagian peran lain; sebutkan saja bila ada yang perlu mereka tangani.
- Di akhir, laporkan singkat: apa yang dikerjakan, file yang berubah, dan hal yang belum selesai.
`;
    await writeFile(file, body);
    console.log(`✔ ${key}.md dibuat`);
  }
}
