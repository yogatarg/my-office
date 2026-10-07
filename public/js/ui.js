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
