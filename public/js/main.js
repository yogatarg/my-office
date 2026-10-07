import { createTracker } from './agents.js';
import { createOffice, QUALITY } from './office.js';
import { loadConfig } from './config.js';
import { createDetailPanel, createZoneBar, createMinimap, createNotifier } from './ui.js';

const FEED_LIMIT = 7;
const feed = document.getElementById('feed');
const status = document.getElementById('status');

function pushFeed(text, accent, time) {
  const li = document.createElement('li');
  li.style.setProperty('--accent', accent);
  li.innerHTML = '<time></time><span></span>';
  li.querySelector('time').textContent = time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  li.querySelector('span').textContent = text;
  feed.prepend(li);
  while (feed.children.length > FEED_LIMIT) feed.lastChild.remove();
}

// Sablon kaos memakai font Unbounded, jadi tunggu font siap sebelum karakter dibuat.
await document.fonts.load('800 130px Unbounded').catch(() => {});

const config = await loadConfig();
document.title = config.name;
document.querySelector('h1').textContent = config.name;

const tracker = createTracker(config);
const timerMode = new URLSearchParams(location.search).has('timer');
// Pilihan kualitas diingat per browser; penyimpanan bisa diblokir, jadi selalu dibungkus try/catch.
const QUALITY_KEY = 'my-office-quality';
let quality = 'high';
try {
  if (QUALITY[localStorage.getItem(QUALITY_KEY)]) quality = localStorage.getItem(QUALITY_KEY);
} catch {}
const params = new URLSearchParams(location.search);
if (QUALITY[params.get('quality')]) quality = params.get('quality');

// ?jam=21 mengunci waktu siang/malam untuk mencoba suasana malam.
const fixedHour = params.has('jam') ? Number(params.get('jam')) : null;
const office = createOffice(document.getElementById('stage'), config, { maxDelta: timerMode ? 1 : 0.05, quality, fixedHour });

// ?debug membuka objek Three.js di console untuk pemeriksaan.
if (params.has('debug')) window.office = office;

const qualityButton = document.getElementById('quality');
const showQuality = () => (qualityButton.textContent = `Kualitas: ${QUALITY[quality].label}`);
showQuality();
qualityButton.addEventListener('click', () => {
  quality = quality === 'high' ? 'low' : 'high';
  office.setQuality(quality);
  showQuality();
  try {
    localStorage.setItem(QUALITY_KEY, quality);
  } catch {}
});

const detail = createDetailPanel({ root: document.getElementById('detail'), tracker, office, config });
createZoneBar({ root: document.getElementById('zones'), office });
createMinimap({ canvas: document.querySelector('#minimap canvas'), office, tracker });
const notifier = createNotifier({ button: document.getElementById('notify') });

const projectChip = document.getElementById('project');
function showProject() {
  const name = tracker.state.project;
  projectChip.hidden = !name;
  if (name) projectChip.textContent = `Proyek: ${name}`;
}

let lastSeen = 0; // waktu event terakhir yang sudah diproses

function handle(event, now, live) {
  lastSeen = Math.max(lastSeen, Date.parse(event.received_at) || now);
  const text = tracker.apply(event, now);
  showProject();
  if (!text) return;
  const agent = tracker.agents.get(event.agent_type ?? 'main');
  pushFeed(text, agent.style.accent, new Date(event.received_at ?? now));
  detail.refresh();
  if (!live || event.agent_type) return;
  if (event.hook_event_name === 'Notification') notifier.notify('CEO butuh perhatianmu', text);
  if (event.hook_event_name === 'Stop') notifier.notify('CEO selesai', 'Menunggu perintahmu berikutnya.');
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => { status.textContent = 'terhubung'; status.dataset.on = 'true'; };
  ws.onclose = () => {
    status.textContent = 'terputus, mencoba lagi…';
    status.dataset.on = 'false';
    setTimeout(connect, 1500);
  };
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.type === 'history') {
      // Riwayat diputar ulang memakai waktu aslinya agar status akhir tiap karakter benar.
      // Saat tersambung ulang, event yang sudah diproses dilewati agar statistik tidak dobel.
      for (const e of msg.events) if (Date.parse(e.received_at) > lastSeen) handle(e, Date.parse(e.received_at), false);
    }
    if (msg.type === 'event') handle(msg.event, Date.now(), true);
  };
}
connect();

// ?timer memakai setTimeout, karena requestAnimationFrame berhenti di tab yang tersembunyi
// (berguna untuk tangkapan layar otomatis).
const nextFrame = timerMode
  ? (cb) => setTimeout(cb, 16)
  : requestAnimationFrame;

function loop() {
  tracker.tick(Date.now());
  office.render(tracker.agents);
  nextFrame(loop);
}
loop();
