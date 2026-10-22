import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { compactEvent, createEventLog } from './eventlog.js';
import { summarize } from './summary.js';

const PORT = Number(process.env.PORT ?? 4545);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Log event dipadatkan dan dirotasi. Batas bisa diubah lewat LOG_MAX_MB dan LOG_KEEP.
const eventLog = createEventLog(path.join(root, 'logs', 'events.jsonl'), {
  maxBytes: Number(process.env.LOG_MAX_MB ?? 5) * 1024 * 1024,
  keep: Number(process.env.LOG_KEEP ?? 5),
});

// Riwayat singkat supaya browser yang baru dibuka langsung melihat event terakhir.
const HISTORY_LIMIT = 200;
const history = [];

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(root, 'public')));
// Nama folder kantor ikut dikirim agar kantor tidak menganggap dirinya sendiri sebagai proyek.
app.get('/office.config.json', async (req, res) => {
  try {
    const config = JSON.parse(await readFile(path.join(root, 'office.config.json'), 'utf8'));
    res.json({ ...config, officeFolder: path.basename(root) });
  } catch (err) {
    res.status(500).json({ error: `office.config.json tidak valid: ${err.message}` });
  }
});
// Ringkasan kerja per hari dari log: /api/summary?date=YYYY-MM-DD (bawaan: hari ini).
app.get('/api/summary', async (req, res) => {
  try {
    const config = JSON.parse(await readFile(path.join(root, 'office.config.json'), 'utf8'));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date ?? '') ? req.query.date : undefined;
    res.json(await summarize(path.join(root, 'logs'), { date, workspace: config.workspace, studio: config.studio, officeFolder: path.basename(root) }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Three.js disajikan dari node_modules supaya kantor tetap jalan tanpa internet.
app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three')));

app.post('/event', (req, res) => {
  const event = compactEvent({ received_at: new Date().toISOString(), ...req.body });

  history.push(event);
  if (history.length > HISTORY_LIMIT) history.shift();

  broadcast({ type: 'event', event });
  res.sendStatus(204);
  eventLog.append(event);
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'history', events: history }));
});

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}

server.listen(PORT, () => {
  console.log(`MY Office berjalan di http://localhost:${PORT}`);
});
