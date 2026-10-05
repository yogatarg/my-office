import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { appendFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = Number(process.env.PORT ?? 4545);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logFile = path.join(root, 'logs', 'events.jsonl');

// Riwayat singkat supaya browser yang baru dibuka langsung melihat event terakhir.
const HISTORY_LIMIT = 200;
const history = [];

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(root, 'public')));

app.post('/event', async (req, res) => {
  const event = { received_at: new Date().toISOString(), ...req.body };

  history.push(event);
  if (history.length > HISTORY_LIMIT) history.shift();

  broadcast({ type: 'event', event });
  res.sendStatus(204);

  // Payload mentah disimpan untuk dipelajari: field apa saja yang dikirim tiap hook.
  await mkdir(path.dirname(logFile), { recursive: true });
  await appendFile(logFile, JSON.stringify(event) + '\n').catch(() => {});
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
  console.log(`Pixel Office berjalan di http://localhost:${PORT}`);
});
