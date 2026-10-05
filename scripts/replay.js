// Memutar ulang rekaman event ke server, seolah Claude Code sedang bekerja.
// Pemakaian: npm run replay [-- file.jsonl] [--speed 4]
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const speedIndex = args.indexOf('--speed');
const speed = speedIndex >= 0 ? Number(args[speedIndex + 1]) : 4;
const file = args.find((a, i) => !a.startsWith('--') && i !== speedIndex + 1) ?? 'samples/todo-run.jsonl';
const url = process.env.PIXEL_OFFICE_URL ?? 'http://localhost:4545/event';
const MAX_GAP_MS = 2500; // jeda panjang (mis. menunggu pengguna) dipersingkat

const events = (await readFile(file, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
console.log(`Memutar ${events.length} event dari ${file} (kecepatan ${speed}x)`);

let previous = Date.parse(events[0].received_at);
for (const { received_at, ...event } of events) {
  const gap = Math.min((Date.parse(received_at) - previous) / speed, MAX_GAP_MS);
  previous = Date.parse(received_at);
  await new Promise((r) => setTimeout(r, gap));
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
  console.log(event.hook_event_name, event.agent_type ?? '', event.tool_name ?? '');
}
