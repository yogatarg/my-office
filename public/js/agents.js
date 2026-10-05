// Mengubah event hooks Claude Code menjadi status setiap karyawan.
// Tidak bergantung pada Three.js, sehingga bisa diuji terpisah dari tampilan.

export const ROLES = {
  main: { label: 'PM', shirt: '#f4f2ec', pants: '#1b1b1b', hair: '#161616', face: 'stern', print: 'tie', accent: '#141414' },
  backend: { label: 'Backend', shirt: '#1f5fbf', pants: '#27324a', hair: '#2a1a12', face: 'smile', print: 'braces', accessory: 'headset', accent: '#1f5fbf' },
  frontend: { label: 'Frontend', shirt: '#ef7d1a', pants: '#3a3a3a', hair: '#6b3a1e', face: 'grin', print: 'tag', accessory: 'beret', accent: '#d9690c' },
  qa: { label: 'QA', shirt: '#2e9c5a', pants: '#2b2b2b', hair: '#161616', face: 'skeptic', print: 'check', accessory: 'magnifier', accent: '#2e9c5a' },
};

export const STATUS = {
  asleep: { text: 'Menganggur', color: '#55595f' },
  thinking: { text: 'Berpikir', color: '#f5cb18' },
  typing: { text: 'Mengetik', color: '#3b8cff' },
  reading: { text: 'Membaca', color: '#f4f2ec' },
  terminal: { text: 'Di terminal', color: '#3fd37a' },
  delegating: { text: 'Membagi tugas', color: '#ff9f2e' },
  reporting: { text: 'Melapor', color: '#ff9f2e' },
  listening: { text: 'Menerima pesan', color: '#c08bff' },
  waiting: { text: 'Menunggu kamu', color: '#c08bff' },
};

const NOTIFICATIONS = {
  idle_prompt: 'PM menunggu input kamu',
  permission_prompt: 'PM minta izin menjalankan tool',
};

// Lama minimal sebuah status tampil, supaya tool yang selesai dalam milidetik tetap terlihat.
const MIN_VISIBLE_MS = 900;
const LISTEN_MS = 1800;

const HAIRS = ['#161616', '#2a1a12', '#6b3a1e', '#c9a227', '#8a8a8a'];
const FACES = ['smile', 'grin', 'stern', 'skeptic'];

function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

// Subagent yang belum dikenal tetap mendapat penampilan tetap (bukan acak tiap muat ulang).
export function styleFor(key) {
  if (ROLES[key]) return ROLES[key];
  const h = hash(key);
  const hue = h % 360;
  return {
    label: key.charAt(0).toUpperCase() + key.slice(1),
    shirt: `hsl(${hue}, 55%, 48%)`,
    pants: '#2f2f2f',
    hair: HAIRS[h % HAIRS.length],
    face: FACES[(h >> 3) % FACES.length],
    print: 'letter',
    accent: `hsl(${hue}, 55%, 40%)`,
  };
}

function toolStatus(tool) {
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) return 'typing';
  if (['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch'].includes(tool)) return 'reading';
  if (['Bash', 'PowerShell'].includes(tool)) return 'terminal';
  if (tool === 'Agent' || tool === 'Task') return 'delegating';
  if (tool === 'SubagentHandback') return 'reporting';
  return 'thinking';
}

function basename(p) {
  return String(p).split(/[\\/]/).filter(Boolean).pop() ?? '';
}

function toolDetail(e) {
  const input = e.tool_input ?? {};
  if (input.subagent_type) return `→ ${styleFor(input.subagent_type).label}`;
  if (input.file_path) return basename(input.file_path);
  if (input.pattern) return input.pattern;
  if (input.command) return input.command.split('\n')[0];
  return e.tool_name === 'SubagentHandback' ? 'ke PM' : e.tool_name ?? '';
}

export function createTracker() {
  const agents = new Map();

  function get(key) {
    if (!agents.has(key)) {
      agents.set(key, {
        key,
        style: styleFor(key),
        status: key === 'main' ? 'waiting' : 'asleep',
        detail: '',
        shownAt: 0,
        decayAt: null,
        alert: false,
      });
    }
    return agents.get(key);
  }

  ['main', 'backend', 'frontend', 'qa'].forEach(get);

  function show(agent, status, detail, now) {
    agent.status = status;
    agent.detail = detail ?? '';
    agent.shownAt = now;
    agent.decayAt = null;
  }

  // Mengembalikan kalimat untuk panel aktivitas, atau null bila event diabaikan.
  function apply(e, now) {
    // Agen internal Claude Code punya agent_id tanpa agent_type: bukan karyawan kita.
    if (e.agent_id && !e.agent_type) return null;
    const agent = get(e.agent_type ?? 'main');
    const name = agent.style.label;

    switch (e.hook_event_name) {
      case 'SessionStart':
        show(agent, 'waiting', '', now);
        return 'Kantor dibuka, PM siap menerima perintah';

      case 'SessionEnd':
        for (const a of agents.values()) show(a, a.key === 'main' ? 'waiting' : 'asleep', '', now);
        return 'Kantor tutup';

      case 'UserPromptSubmit': {
        const isReport = String(e.prompt ?? '').startsWith('<agent-message');
        agent.alert = false;
        show(agent, 'listening', isReport ? 'laporan masuk' : 'perintah baru', now);
        agent.decayAt = now + LISTEN_MS;
        return isReport ? 'PM menerima laporan' : 'PM menerima perintah baru';
      }

      case 'PreToolUse': {
        const status = toolStatus(e.tool_name);
        const detail = toolDetail(e);
        show(agent, status, detail, now);
        if (status === 'delegating' && e.tool_input?.subagent_type) get(e.tool_input.subagent_type);
        return `${name} ${STATUS[status].text.toLowerCase()} ${detail}`.trim();
      }

      case 'PostToolUse':
        agent.decayAt = Math.max(now, agent.shownAt + MIN_VISIBLE_MS);
        return null;

      case 'SubagentStart':
        show(agent, 'thinking', '', now);
        return `${name} mulai bekerja`;

      case 'SubagentStop':
        show(agent, 'asleep', '', now);
        return `${name} selesai`;

      case 'Stop':
        show(agent, 'waiting', '', now);
        return 'PM menunggu kamu';

      case 'Notification':
        agent.alert = true;
        show(agent, 'waiting', '', now);
        return NOTIFICATIONS[e.notification_type] ?? `PM: ${e.message ?? 'butuh perhatianmu'}`;

      default:
        return null;
    }
  }

  function tick(now) {
    for (const a of agents.values()) {
      if (a.decayAt !== null && now >= a.decayAt) show(a, 'thinking', '', now);
    }
  }

  return { agents, apply, tick };
}
