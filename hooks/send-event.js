#!/usr/bin/env node
// Dipanggil oleh hooks Claude Code: membaca payload JSON dari stdin
// lalu meneruskannya ke server MY Office. Selalu keluar dengan kode 0
// agar Claude Code tidak terganggu walau server sedang mati.

const URL = process.env.MY_OFFICE_URL ?? 'http://localhost:4545/event';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', async () => {
  try {
    await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: input || '{}',
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    // Server tidak aktif: abaikan.
  }
  process.exit(0);
});
