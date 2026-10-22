// Mengubah event hooks Claude Code menjadi status setiap karyawan.
// Tidak bergantung pada Three.js, sehingga bisa diuji terpisah dari tampilan.

export const STATUS = {
  asleep: { text: 'Istirahat', color: '#55595f' },
  thinking: { text: 'Berpikir', color: '#f5cb18' },
  typing: { text: 'Mengetik', color: '#3b8cff' },
  reading: { text: 'Membaca', color: '#f4f2ec' },
  terminal: { text: 'Di terminal', color: '#3fd37a' },
  delegating: { text: 'Membagi tugas', color: '#ff9f2e' },
  reporting: { text: 'Melapor', color: '#ff9f2e' },
  listening: { text: 'Menerima pesan', color: '#c08bff' },
  waiting: { text: 'Menunggu kamu', color: '#c08bff' },
};

// Lama minimal sebuah status tampil, supaya tool yang selesai dalam milidetik tetap terlihat.
const MIN_VISIBLE_MS = 900;
const LISTEN_MS = 1800;
const BUBBLE_MS = 5000;
// Setelah tugas selesai, karyawan rehat di pantry selama ini lalu kembali ke mejanya.
const BREAK_MS = 45000;

const HAIRS = ['#161616', '#2a1a12', '#6b3a1e', '#c9a227', '#8a8a8a'];
const FACES = ['smile', 'grin', 'stern', 'skeptic'];

function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

// Subagent yang tidak terdaftar tetap mendapat penampilan tetap (bukan acak tiap muat ulang).
function generatedStyle(key, accent) {
  const h = hash(key);
  return {
    label: key.charAt(0).toUpperCase() + key.slice(1),
    shirt: `hsl(${h % 360}, 55%, 48%)`,
    pants: '#2f2f2f',
    hair: HAIRS[h % HAIRS.length],
    face: FACES[(h >> 3) % FACES.length],
    print: 'letter',
    accent,
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

export function firstLine(text, max = 90) {
  const line = (String(text ?? '').split('\n').find((l) => l.trim()) ?? '')
    .replace(/^[#>*\-\s]+/, '') // buang penanda markdown di awal baris
    .replace(/[A-Za-z]:[\\/][^\s"'`]*|\/(?:[\w.-]+\/)+[\w.-]+/g, (p) => p.split(/[\\/]/).pop()); // path → nama file
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

// Pola path untuk satu folder akar; `skip` = jumlah segmen yang dilewati sebelum nama proyek.
// Menerima gaya Windows (C:\laragon\www) maupun Git Bash (/c/laragon/www).
function rootPattern(root, skip) {
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '');
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bash = base.replace(/^([A-Za-z]):/, (m, d) => `/${d.toLowerCase()}`);
  const segment = `[^/\\s"'\`]+`;
  return new RegExp(`(?:${escape(base)}|${escape(bash)})/(?:${segment}/){${skip}}(${segment})`, 'i');
}

// Mengenali proyek dari path di tool_input: segmen pertama setelah folder workspace, atau
// segmen setelah folder divisi di folder studio (studio/<divisi>/<proyek>).
export function projectFinder(workspace, ignore = ['my-office'], studio = null) {
  const patterns = [studio && rootPattern(studio, 1), workspace && rootPattern(workspace, 0)].filter(Boolean);
  if (!patterns.length) return () => null;
  return (e) => {
    const input = e.tool_input ?? {};
    for (const text of [input.file_path, input.path, input.notebook_path, input.command, input.prompt]) {
      if (!text) continue;
      const normalized = String(text).replace(/\\/g, '/');
      for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match && !ignore.includes(match[1].toLowerCase())) return match[1];
      }
    }
    return null;
  };
}

export function createTracker(config) {
  const agents = new Map();
  const lead = config.lead.label;
  const projectOf = projectFinder(config.workspace, [config.officeFolder.toLowerCase()], config.studio);
  const state = { project: null }; // proyek yang terakhir disentuh tim

  function styleFor(key) {
    if (key === 'main') return config.lead;
    return config.roles.get(key)?.style ?? generatedStyle(key, config.fallback.color);
  }

  const chairLabel = () => [...agents.values()].find((a) => a.chair)?.style.label ?? lead;

  function toolDetail(e) {
    const input = e.tool_input ?? {};
    if (input.subagent_type) return `→ ${styleFor(input.subagent_type).label}`;
    if (input.file_path) return basename(input.file_path);
    if (input.pattern) return input.pattern;
    if (input.command) return input.command.split('\n')[0];
    return e.tool_name === 'SubagentHandback' ? `ke ${chairLabel()}` : e.tool_name ?? '';
  }

  // Sesi bicara langsung (`claude --agent <peran>`): event agen utama membawa agent_type tanpa agent_id.
  // Subagent selalu punya agent_id.
  const isDirect = (e) => Boolean(e.agent_type && !e.agent_id);

  function get(key) {
    if (!agents.has(key)) {
      agents.set(key, {
        key,
        style: styleFor(key),
        division: key === 'main' ? null : config.roles.get(key)?.division ?? 'fallback',
        status: key === 'main' ? 'waiting' : 'asleep',
        detail: '',
        shownAt: 0,
        decayAt: null,
        alert: false,
        // Lokasi yang dituju karakter: 'desk', 'meeting', atau 'pantry'.
        place: 'desk',
        breakUntil: 0,
        report: '', // isi laporan terakhir, ditampilkan saat tiba di ruang rapat
        reportDone: false, // subagent sudah selesai dan boleh pergi setelah rapat
        bubble: null,
        // Untuk panel detail karyawan.
        history: [], // [{ time, text }] terbaru di akhir
        files: new Map(), // nama file → berapa kali disentuh
        task: '', // deskripsi tugas terakhir dari CEO/PM
        project: null,
        startedAt: null, // waktu mulai tugas yang sedang berjalan
        workedMs: 0, // total lama bekerja sejak halaman dibuka
        tasksDone: 0,
        direct: false, // sedang diajak bicara langsung oleh pengguna
        chair: key === 'main', // yang memimpin rapat saat ada laporan masuk
      });
    }
    return agents.get(key);
  }

  // Semua peran di konfigurasi langsung punya karakter di mejanya.
  get('main');
  for (const key of config.roles.keys()) get(key);

  function show(agent, status, detail, now) {
    agent.status = status;
    agent.detail = detail ?? '';
    agent.shownAt = now;
    agent.decayAt = null;
  }

  function say(agent, text, now) {
    if (text) agent.bubble = { text: firstLine(text), until: now + BUBBLE_MS };
  }

  const HISTORY_LIMIT = 30;

  // Mengembalikan kalimat untuk panel aktivitas, atau null bila event diabaikan.
  function apply(e, now) {
    if (e.agent_id && !e.agent_type) return null;
    const agent = get(e.agent_type ?? 'main');
    const input = e.tool_input ?? {};

    if (e.hook_event_name === 'PreToolUse') {
      if (input.file_path) {
        const name = basename(input.file_path);
        agent.files.set(name, (agent.files.get(name) ?? 0) + 1);
      }
      // Deskripsi tugas yang dibagikan menjadi "tugas saat ini" milik penerimanya.
      if (input.subagent_type && input.description) get(input.subagent_type).task = input.description;
    }
    if (isDirect(e)) {
      const isReport = /^<(agent-message|task-notification)/.test(String(e.prompt ?? ''));
      if (e.hook_event_name === 'UserPromptSubmit' && !isReport) {
        agent.task = firstLine(e.prompt);
        if (agent.startedAt === null) agent.startedAt = now;
      }
      if (e.hook_event_name === 'Stop' && agent.startedAt !== null) {
        agent.workedMs += Math.max(0, now - agent.startedAt);
        agent.startedAt = null;
        agent.tasksDone += 1;
      }
    }
    if (e.hook_event_name === 'SubagentStart') agent.startedAt = now;
    if (e.hook_event_name === 'SubagentStop' && agent.startedAt !== null) {
      agent.workedMs += Math.max(0, now - agent.startedAt);
      agent.startedAt = null;
      agent.tasksDone += 1;
    }

    const text = applyEvent(e, now);
    if (text) {
      agent.history.push({ time: now, text });
      if (agent.history.length > HISTORY_LIMIT) agent.history.shift();
    }
    return text;
  }

  function applyEvent(e, now) {
    // Agen internal Claude Code punya agent_id tanpa agent_type: bukan karyawan kita.
    if (e.agent_id && !e.agent_type) return null;
    const agent = get(e.agent_type ?? 'main');
    const name = agent.style.label;
    // Yang menerima perintah dan laporan: CEO, atau karyawan yang sedang diajak bicara langsung.
    const boss = agent.key === 'main' || isDirect(e) ? name : lead;
    if (isDirect(e) && !agent.direct) {
      agent.direct = true;
      agent.place = 'desk';
    }
    if (agent.key === 'main' || isDirect(e)) for (const a of agents.values()) a.chair = a === agent;
    const project = projectOf(e);
    if (project) {
      agent.project = project;
      state.project = project;
    }

    switch (e.hook_event_name) {
      case 'SessionStart':
        show(agent, 'waiting', '', now);
        return agent.direct ? `${name} siap diajak bicara langsung` : `Kantor dibuka, ${lead} siap menerima perintah`;

      case 'SessionEnd':
        if (agent.direct) {
          agent.direct = false;
          show(agent, 'asleep', '', now);
          for (const a of agents.values()) a.chair = a.key === 'main';
          return `${name} selesai mengobrol`;
        }
        for (const a of agents.values()) {
          show(a, a.key === 'main' ? 'waiting' : 'asleep', '', now);
          a.place = 'desk';
          a.direct = false;
          a.chair = a.key === 'main';
        }
        return 'Kantor tutup';

      case 'UserPromptSubmit': {
        // Hasil subagent kembali ke agen utama sebagai prompt khusus, bukan perintah dari kamu.
        const isReport = /^<(agent-message|task-notification)/.test(String(e.prompt ?? ''));
        agent.alert = false;
        show(agent, 'listening', isReport ? 'laporan masuk' : 'perintah baru', now);
        agent.decayAt = now + LISTEN_MS;
        if (!isReport) say(agent, e.prompt, now);
        return isReport ? `${boss} menerima laporan` : `${boss} menerima perintah baru`;
      }

      case 'PreToolUse': {
        const status = toolStatus(e.tool_name);
        const detail = toolDetail(e);
        show(agent, status, detail, now);
        if (status === 'delegating' && e.tool_input?.subagent_type) {
          get(e.tool_input.subagent_type);
          say(agent, e.tool_input.description, now);
        }
        if (agent.key !== 'main' && !agent.direct) {
          if (status === 'reporting') {
            agent.place = 'meeting';
            agent.reportDone = false;
            agent.report = firstLine(e.tool_input?.message) || 'Laporan siap!';
          } else {
            agent.place = 'desk';
          }
        }
        return `${name} ${STATUS[status].text.toLowerCase()} ${detail}`.trim();
      }

      case 'PostToolUse':
        if (agent.status === 'reporting') return null; // tetap melapor sampai SubagentStop
        agent.decayAt = Math.max(now, agent.shownAt + MIN_VISIBLE_MS);
        return null;

      case 'SubagentStart':
        show(agent, 'thinking', '', now);
        agent.place = 'desk';
        return `${name} mulai bekerja`;

      case 'SubagentStop':
        show(agent, 'asleep', '', now);
        // Dari ruang rapat (atau langsung dari meja) karyawan rehat dulu di pantry.
        if (agent.place === 'meeting') agent.reportDone = true;
        else agent.place = 'pantry';
        agent.breakUntil = now + BREAK_MS;
        return `${name} selesai`;

      case 'Stop':
        show(agent, 'waiting', '', now);
        return `${boss} menunggu kamu`;

      case 'Notification':
        agent.alert = true;
        show(agent, 'waiting', '', now);
        return e.notification_type === 'idle_prompt' ? `${boss} menunggu input kamu` : `${boss}: ${e.message ?? 'butuh perhatianmu'}`;

      default:
        return null;
    }
  }

  function tick(now) {
    for (const a of agents.values()) {
      if (a.decayAt !== null && now >= a.decayAt) show(a, 'thinking', '', now);
      const resting = a.place === 'pantry' || (a.place === 'meeting' && a.reportDone);
      if (resting && a.status === 'asleep' && now >= a.breakUntil) a.place = 'desk';
      if (a.bubble && now >= a.bubble.until) a.bubble = null;
    }
  }

  return { agents, apply, tick, state };
}
