// Panel antarmuka di atas kantor: detail karyawan, navigasi zona, minimap, dan notifikasi.

import { STATUS } from './agents.js';

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} dtk`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt ${s % 60} dtk`;
  return `${Math.floor(m / 60)} jam ${m % 60} mnt`;
}

const timeOf = (t) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- Panel detail karyawan ----------

export function createDetailPanel({ root, tracker, office, config }) {
  let key = null;
  let following = false;

  const divisionName = (agent) => {
    if (agent.key === 'main') return 'Ruang CEO';
    const id = agent.division;
    return config.divisions.find((d) => d.id === id)?.name ?? config.fallback.name;
  };

  function render() {
    const agent = key && tracker.agents.get(key);
    root.hidden = !agent;
    document.body.classList.toggle('detail-open', Boolean(agent));
    if (!agent) return;

    const now = Date.now();
    const worked = agent.workedMs + (agent.startedAt !== null ? now - agent.startedAt : 0);
    const place = { desk: 'di meja', meeting: 'di boardroom', pantry: 'sedang rehat' }[agent.place] ?? '';
    const statusText = agent.status === 'asleep' ? (agent.place === 'desk' ? 'Siaga' : 'Istirahat') : STATUS[agent.status].text;

    root.replaceChildren();
    root.style.setProperty('--accent', agent.style.accent);

    const head = el('div', 'detail-head');
    head.append(el('span', 'detail-role', agent.style.label), el('span', 'detail-division', divisionName(agent)));
    const close = el('button', 'detail-close', '×');
    close.type = 'button';
    close.title = 'Tutup';
    close.addEventListener('click', () => select(null));
    head.append(close);
    root.append(head);

    const facts = el('dl', 'detail-facts');
    const fact = (label, value) => {
      if (!value) return;
      facts.append(el('dt', '', label), el('dd', '', value));
    };
    fact('Status', `${statusText}${agent.detail ? ` · ${agent.detail}` : ''}${place ? ` (${place})` : ''}`);
    fact('Tugas', agent.task);
    fact('Proyek', agent.project);
    fact('Lama bekerja', worked ? `${formatDuration(worked)}${agent.startedAt !== null ? ' (sedang berjalan)' : ''}` : '');
    fact('Tugas selesai', agent.tasksDone ? String(agent.tasksDone) : '');
    root.append(facts);

    if (agent.files.size) {
      root.append(el('h3', '', 'File yang disentuh'));
      const files = el('ul', 'detail-files');
      for (const [name, count] of [...agent.files].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
        files.append(el('li', '', count > 1 ? `${name} ×${count}` : name));
      }
      root.append(files);
    }

    root.append(el('h3', '', 'Riwayat'));
    const history = el('ol', 'detail-history');
    const items = agent.history.slice(-8).reverse();
    if (!items.length) history.append(el('li', 'muted', 'Belum ada aktivitas.'));
    for (const item of items) {
      const li = el('li');
      li.append(el('time', '', timeOf(item.time)), el('span', '', item.text));
      history.append(li);
    }
    root.append(history);

    const follow = el('button', 'detail-follow', following ? 'Berhenti mengikuti' : 'Ikuti dengan kamera');
    follow.type = 'button';
    follow.addEventListener('click', () => {
      following = !following;
      office.follow(following ? key : null);
      render();
    });
    root.append(follow);
  }

  function select(next) {
    key = next;
    following = false;
    office.select(key);
    office.follow(null);
    render();
  }

  office.onSelect(select);
  setInterval(() => key && render(), 1000);
  return { select, refresh: () => key && render() };
}

// ---------- Navigasi zona ----------

export function createZoneBar({ root, office }) {
  const add = (label, onClick) => {
    const button = el('button', '', label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    root.append(button);
  };
  add('Semua', () => office.overview());
  for (const zone of office.zones) {
    add(zone.name, () => office.flyTo(zone.x0 + zone.w / 2, zone.z0 + zone.d / 2, zone.kind === 'hub' ? 1.6 : 2.6));
  }
}

// ---------- Minimap ----------

export function createMinimap({ canvas, office, tracker }) {
  const { width, depth } = office.floor;
  const W = 180;
  const H = Math.round((W * depth) / width);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = W * ratio;
  canvas.height = H * ratio;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d');
  g.scale(ratio, ratio);

  const toMap = (x, z) => [((x + width / 2) / width) * W, ((z + depth / 2) / depth) * H];
  const toWorld = (mx, my) => [(mx / W) * width - width / 2, (my / H) * depth - depth / 2];

  function draw() {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#e4e2dd';
    g.fillRect(0, 0, W, H);
    for (const zone of office.zones) {
      const [x, y] = toMap(zone.x0, zone.z0);
      g.globalAlpha = 0.55;
      g.fillStyle = zone.color;
      g.fillRect(x, y, (zone.w / width) * W, (zone.d / depth) * H);
    }
    g.globalAlpha = 1;
    for (const { key, x, z } of office.positions()) {
      const agent = tracker.agents.get(key);
      if (!agent) continue;
      const [mx, my] = toMap(x, z);
      const active = agent.status !== 'asleep';
      g.beginPath();
      g.arc(mx, my, active ? 3.6 : 2.6, 0, Math.PI * 2);
      g.fillStyle = active ? agent.style.accent : '#6b6e74';
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = '#fff';
      g.stroke();
    }
  }

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const [x, z] = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    office.flyTo(x, z, 2.6);
  });
  setInterval(draw, 250);
  draw();
}

// ---------- Notifikasi ----------

export function createNotifier({ button, storageKey = 'my-office-notify' }) {
  let enabled = false;
  try {
    enabled = localStorage.getItem(storageKey) === 'on';
  } catch {}
  let audio = null;

  const show = () => {
    button.textContent = enabled ? '🔔 Notifikasi: Aktif' : '🔕 Notifikasi: Mati';
    button.setAttribute('aria-pressed', String(enabled));
  };

  // Browser hanya mengizinkan suara setelah ada interaksi pengguna, jadi AudioContext dibuat saat itu.
  const unlockAudio = () => {
    if (!audio) audio = new AudioContext();
    if (audio.state === 'suspended') audio.resume();
  };
  window.addEventListener('pointerdown', () => enabled && unlockAudio(), { once: true });

  function chime() {
    if (!audio) return;
    const t = audio.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, t + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.35);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + i * 0.14);
      osc.stop(t + i * 0.14 + 0.4);
    }
  }

  button.addEventListener('click', async () => {
    enabled = !enabled;
    if (enabled) {
      unlockAudio();
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
      chime();
    }
    try {
      localStorage.setItem(storageKey, enabled ? 'on' : 'off');
    } catch {}
    show();
  });
  show();

  return {
    notify(title, body) {
      if (!enabled) return;
      chime();
      // Notifikasi sistem hanya saat kantor tidak sedang dilihat, supaya tidak dobel.
      if ((document.hidden || !document.hasFocus()) && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, tag: 'my-office' });
      }
    },
  };
}

// ---------- Ringkasan kerja harian ----------

export function createSummary({ button, root, config, tracker }) {
  let current = null; // tanggal yang sedang ditampilkan (YYYY-MM-DD)

  const labelOf = (key) => (key === 'main' ? config.lead.label : config.roles.get(key)?.style.label ?? tracker.agents.get(key)?.style.label ?? key);
  const accentOf = (key) => (key === 'main' ? config.lead.accent : config.roles.get(key)?.style.accent ?? config.fallback.color);
  const dateLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  async function load(date) {
    root.replaceChildren(el('p', 'muted', 'Memuat ringkasan…'));
    try {
      const res = await fetch(`/api/summary${date ? `?date=${date}` : ''}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      current = data.date;
      render(data);
    } catch (err) {
      root.replaceChildren(el('p', 'muted', `Ringkasan gagal dimuat: ${err.message}`));
    }
  }

  function render(data) {
    root.replaceChildren();
    const head = el('div', 'summary-head');
    const title = el('h2', '', 'Ringkasan kerja');
    const nav = el('div', 'summary-nav');
    // Hanya hari yang punya aktivitas yang bisa dikunjungi (tanggal berformat YYYY-MM-DD bisa dibandingkan sebagai teks).
    const before = data.days.filter((d) => d < data.date).at(-1);
    const after = data.days.find((d) => d > data.date);
    const prev = el('button', '', '‹');
    const next = el('button', '', '›');
    prev.type = next.type = 'button';
    prev.title = 'Hari sebelumnya';
    next.title = 'Hari berikutnya';
    prev.disabled = !before;
    next.disabled = !after;
    prev.addEventListener('click', () => load(before));
    next.addEventListener('click', () => load(after));
    nav.append(prev, el('span', '', dateLabel(data.date)), next);
    const close = el('button', 'summary-close', '×');
    close.type = 'button';
    close.title = 'Tutup';
    close.addEventListener('click', () => toggle(false));
    head.append(title, nav, close);
    root.append(head);

    const t = data.totals;
    if (!t.firstAt) {
      root.append(el('p', 'muted', 'Belum ada aktivitas pada hari ini.'));
      return;
    }
    const span = `${new Date(t.firstAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}–${new Date(t.lastAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
    root.append(el('p', 'muted', `Kantor aktif ${span}`));

    const tiles = el('div', 'summary-tiles');
    for (const [label, value] of [
      ['Perintah darimu', t.prompts],
      ['Tugas dibagikan', t.delegations],
      ['Tugas selesai', t.tasksDone],
      ['Aksi tim', t.actions],
      ['File disentuh', t.files],
      ['Proyek', t.projects],
    ]) {
      const tile = el('div', 'tile');
      tile.append(el('strong', '', String(value)), el('span', '', label));
      tiles.append(tile);
    }
    root.append(tiles);

    // Grafik batang satu seri: aksi tim per jam. Satu warna, tanpa legenda; nilai muncul saat hover
    // dan tersedia sebagai teks untuk pembaca layar.
    root.append(el('h3', '', 'Aktivitas per jam'));
    const chart = el('div', 'hours');
    const max = Math.max(1, ...data.hours);
    data.hours.forEach((count, hour) => {
      const col = el('div', 'hour');
      const bar = el('div', 'bar');
      bar.style.height = `${(count / max) * 100}%`;
      const label = `${String(hour).padStart(2, '0')}.00–${String(hour + 1).padStart(2, '0')}.00: ${count} aksi`;
      col.setAttribute('aria-label', label);
      col.dataset.tip = label;
      if (count === max && count > 0) col.append(el('em', '', String(count)));
      col.append(bar, el('small', '', hour % 3 === 0 ? String(hour).padStart(2, '0') : ''));
      chart.append(col);
    });
    root.append(chart);

    root.append(el('h3', '', 'Karyawan'));
    const table = el('table', 'summary-table');
    const headRow = el('tr');
    for (const h of ['Karyawan', 'Tugas selesai', 'Lama kerja', 'Menulis', 'Membaca', 'Terminal', 'File']) headRow.append(el('th', '', h));
    table.append(el('thead'));
    table.tHead.append(headRow);
    const body = el('tbody');
    for (const a of data.agents) {
      const row = el('tr');
      const name = el('td');
      const dot = el('i', 'dot');
      dot.style.background = accentOf(a.key);
      name.append(dot, document.createTextNode(labelOf(a.key)));
      row.append(name);
      for (const value of [a.tasksDone, a.workedMs ? formatDuration(a.workedMs) : '–', a.tools.menulis, a.tools.membaca, a.tools.terminal, a.files]) {
        row.append(el('td', '', String(value)));
      }
      body.append(row);
    }
    table.append(body);
    root.append(table);

    const lists = el('div', 'summary-lists');
    for (const [title, items, empty] of [
      ['File paling sering disentuh', data.files, 'Belum ada file.'],
      ['Proyek', data.projects, 'Belum ada proyek di workspace.'],
    ]) {
      const box = el('div');
      box.append(el('h3', '', title));
      const ul = el('ul', 'summary-list');
      if (!items.length) ul.append(el('li', 'muted', empty));
      for (const item of items) {
        const li = el('li');
        li.append(el('span', '', item.name), el('b', '', `×${item.count}`));
        ul.append(li);
      }
      box.append(ul);
      lists.append(box);
    }
    root.append(lists);
  }

  function toggle(open = root.hidden) {
    root.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) load(current);
  }

  button.addEventListener('click', () => toggle());
  window.addEventListener('keydown', (e) => e.key === 'Escape' && !root.hidden && toggle(false));
  return { toggle };
}
