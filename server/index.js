import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { compactEvent, createEventLog } from './eventlog.js';

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
app.get('/office.config.json', (req, res) => res.sendFile(path.join(root, 'office.config.json')));
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
