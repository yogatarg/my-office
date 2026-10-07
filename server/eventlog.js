import { appendFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

// Batas panjang teks per field. Kantor hanya memakai baris pertama prompt/laporan,
// jadi sisanya cukup ditandai sebagai terpotong.
const MAX_TEXT = 500;

function trimText(value) {
  if (typeof value === 'string') {
    return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}… [dipotong ${value.length - MAX_TEXT} karakter]` : value;
  }
  if (Array.isArray(value)) return value.map(trimText);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimText(v)]));
  }
  return value;
}

// Memadatkan event sebelum disimpan dan disiarkan: hasil tool (isi file, keluaran perintah)
// dibuang karena tidak dipakai kantor, hanya ukurannya yang dicatat; teks panjang dipotong.
export function compactEvent(event) {
  const { tool_response: response, ...rest } = event;
  const compact = trimText(rest);
  if (response !== undefined) compact.tool_response_size = JSON.stringify(response).length;
  return compact;
}

const pad = (n) => String(n).padStart(2, '0');
function stamp(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// Log JSONL yang dirotasi: bila melewati maxBytes, file lama diganti nama menjadi
// events-<waktu>.jsonl dan hanya `keep` arsip terbaru yang disimpan.
export function createEventLog(file, { maxBytes = 5 * 1024 * 1024, keep = 5 } = {}) {
  const dir = path.dirname(file);
  const base = path.basename(file, '.jsonl');
  let queue = Promise.resolve(); // penulisan berurutan agar rotasi tidak bertabrakan

  async function rotateIfNeeded() {
    const size = await stat(file).then((s) => s.size, () => 0);
    if (size < maxBytes) return;
    // Nama arsip memuat milidetik dan nomor urut supaya rotasi beruntun tidak saling menimpa.
    const now = new Date();
    let target;
    for (let n = 0; ; n++) {
      target = path.join(dir, `${base}-${stamp(now)}-${String(now.getMilliseconds()).padStart(3, '0')}${n ? `-${n}` : ''}.jsonl`);
      if (!(await stat(target).then(() => true, () => false))) break;
    }
    await rename(file, target);
    const archives = (await readdir(dir)).filter((name) => name.startsWith(`${base}-`) && name.endsWith('.jsonl')).sort();
    for (const old of archives.slice(0, Math.max(0, archives.length - keep))) await unlink(path.join(dir, old));
  }

  function append(event) {
    queue = queue
      .then(async () => {
        await mkdir(dir, { recursive: true });
        await rotateIfNeeded();
        await appendFile(file, JSON.stringify(event) + '\n');
      })
      .catch((err) => console.warn('[log] gagal menulis event:', err.message));
    return queue;
  }

  return { append };
}
