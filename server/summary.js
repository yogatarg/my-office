import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { projectFinder } from '../public/js/agents.js';

// Ringkasan kerja satu hari dari log event (file aktif + arsip rotasi).
// Tanggal memakai zona waktu laptop, sama dengan jam yang dilihat pengguna.

const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const basename = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() ?? '';

const TOOL_KIND = {
  Edit: 'menulis', Write: 'menulis', MultiEdit: 'menulis', NotebookEdit: 'menulis',
  Read: 'membaca', Grep: 'membaca', Glob: 'membaca', LS: 'membaca', WebFetch: 'membaca', WebSearch: 'membaca',
  Bash: 'terminal', PowerShell: 'terminal',
  Agent: 'mendelegasi', Task: 'mendelegasi', SubagentHandback: 'melapor',
};

async function readEvents(logDir) {
  const files = (await readdir(logDir).catch(() => [])).filter((f) => /^events.*\.jsonl$/.test(f));
  const events = [];
  for (const file of files) {
    const text = await readFile(path.join(logDir, file), 'utf8').catch(() => '');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        // baris rusak (mis. terpotong saat laptop mati) dilewati
      }
    }
  }
  return events.sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));
}

export async function summarize(logDir, { date = dayKey(new Date()), workspace = null, officeFolder = 'my-office' } = {}) {
  const all = await readEvents(logDir);
  const days = [...new Set(all.map((e) => dayKey(new Date(e.received_at))))].sort();
  const events = all.filter((e) => dayKey(new Date(e.received_at)) === date);
  // Folder kantor sendiri bukan proyek; pixel-office adalah nama lamanya yang masih ada di log lama.
  const projectOf = projectFinder(workspace, [officeFolder.toLowerCase(), 'pixel-office']);

  const agents = new Map();
  const agent = (key) => {
    if (!agents.has(key)) agents.set(key, { key, tasksDone: 0, workedMs: 0, tools: { menulis: 0, membaca: 0, terminal: 0, mendelegasi: 0, melapor: 0, lain: 0 }, files: new Set() });
    return agents.get(key);
  };
  const files = new Map();
  const projects = new Map();
  const hours = Array.from({ length: 24 }, () => 0);
  const started = new Map(); // agent_id → waktu SubagentStart
  let prompts = 0;
  let delegations = 0;

  for (const e of events) {
    if (e.agent_id && !e.agent_type && e.hook_event_name !== 'SubagentStop') continue;
    const time = Date.parse(e.received_at);
    const key = e.agent_type ?? 'main';
    const input = e.tool_input ?? {};
    const project = projectOf(e);
    if (project) projects.set(project, (projects.get(project) ?? 0) + 1);

    switch (e.hook_event_name) {
      case 'UserPromptSubmit':
        if (!/^<(agent-message|task-notification)/.test(String(e.prompt ?? ''))) prompts += 1;
        break;
      case 'PreToolUse': {
        hours[new Date(time).getHours()] += 1;
        const a = agent(key);
        a.tools[TOOL_KIND[e.tool_name] ?? 'lain'] += 1;
        if (input.subagent_type) delegations += 1;
        if (input.file_path) {
          const name = basename(input.file_path);
          const label = project ? `${project}/${name}` : name;
          files.set(label, (files.get(label) ?? 0) + 1);
          a.files.add(label);
        }
        break;
      }
      case 'SubagentStart':
        if (e.agent_type) started.set(e.agent_id, time);
        break;
      case 'SubagentStop':
        if (!e.agent_type) break;
        agent(key).tasksDone += 1;
        if (started.has(e.agent_id)) {
          agent(key).workedMs += time - started.get(e.agent_id);
          started.delete(e.agent_id);
        }
        break;
    }
  }

  const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
  const agentList = [...agents.values()]
    .map((a) => ({ ...a, files: a.files.size, actions: Object.values(a.tools).reduce((s, n) => s + n, 0) }))
    .sort((a, b) => b.actions - a.actions);

  return {
    date,
    days,
    totals: {
      prompts,
      delegations,
      tasksDone: agentList.reduce((s, a) => s + a.tasksDone, 0),
      actions: agentList.reduce((s, a) => s + a.actions, 0),
      files: files.size,
      projects: projects.size,
      firstAt: events[0]?.received_at ?? null,
      lastAt: events.at(-1)?.received_at ?? null,
    },
    agents: agentList,
    files: top(files, 10),
    projects: top(projects, 10),
    hours,
  };
}
