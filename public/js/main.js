import { createTracker } from './agents.js';
import { createOffice } from './office.js';

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

const tracker = createTracker();
const timerMode = new URLSearchParams(location.search).has('timer');
const office = createOffice(document.getElementById('stage'), { maxDelta: timerMode ? 1 : 0.05 });

function handle(event, now) {
  const text = tracker.apply(event, now);
  if (!text) return;
  const agent = tracker.agents.get(event.agent_type ?? 'main');
  pushFeed(text, agent.style.accent, new Date(event.received_at ?? now));
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
      feed.innerHTML = '';
      for (const e of msg.events) handle(e, Date.parse(e.received_at));
    }
    if (msg.type === 'event') handle(msg.event, Date.now());
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
