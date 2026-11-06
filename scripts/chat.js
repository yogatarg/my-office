// Mengobrol langsung dengan satu karyawan di kantor pusat, tanpa lewat CEO.
// Pemakaian: npm run chat -- <peran|alias> [opsi claude lain, misalnya --continue]
// Nama peran dan alias (field "alias" di office.config.json) tidak membedakan huruf besar-kecil.
// Tanpa argumen: menampilkan daftar peran yang bisa diajak bicara.

import { readdir, readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hq = path.join(root, 'playground');
const roles = (await readdir(path.join(hq, '.claude', 'agents')))
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.slice(0, -3))
  .sort();

// Alias dari office.config.json: { "youtube-creator": { "alias": "yt" } } atau daftar alias.
const config = JSON.parse(await readFile(path.join(root, 'office.config.json'), 'utf8'));
const aliasOf = new Map(); // alias (huruf kecil) → peran
for (const division of config.divisions ?? []) {
  for (const [key, def] of Object.entries(division.roles ?? {})) {
    for (const alias of [def.alias ?? []].flat()) {
      const name = alias.toLowerCase();
      if (roles.includes(name) || aliasOf.has(name)) console.warn(`[chat] alias "${alias}" bentrok, diabaikan`);
      else aliasOf.set(name, key);
    }
  }
}
const lookup = (name) => aliasOf.get(name) ?? roles.find((r) => r.toLowerCase() === name);

const [input, ...rest] = process.argv.slice(2);
const role = input && lookup(input.toLowerCase());
if (!role) {
  if (input) console.error(`Peran "${input}" tidak ditemukan di playground/.claude/agents.\n`);
  console.log('Pemakaian: npm run chat -- <peran>\n');
  const aliasesFor = (r) => [...aliasOf].filter(([, target]) => target === r).map(([a]) => a);
  const names = roles.map((r) => (aliasesFor(r).length ? `${aliasesFor(r).join('/')} (${r})` : r));
  console.log(`Peran yang tersedia: ${names.join(', ')}`);
  process.exit(input ? 1 : 0);
}

// Server MCP khusus peran (playground/.claude/mcp/<peran>.json) hanya dimuat di sesi peran itu,
// supaya sesi lain tidak ikut menjalankannya.
const mcpConfig = path.join(hq, '.claude', 'mcp', `${role}.json`);
const hasMcp = await access(mcpConfig).then(() => true, () => false);
// Bentuk --opsi=nilai, karena --mcp-config menerima banyak nilai dan bisa menelan argumen sesudahnya.
// Peran dengan "chrome": true di office.config.json selalu tersambung ke Claude in Chrome.
const roleDef = (config.divisions ?? []).map((d) => d.roles?.[role]).find(Boolean);
const args = ['--agent', role, ...(roleDef?.chrome ? ['--chrome'] : []), ...(hasMcp ? [`--mcp-config=${mcpConfig}`] : []), ...rest];

// claude.exe (installer resmi) bisa dijalankan langsung. Bila claude terpasang lewat npm (claude.cmd),
// Windows butuh shell; argumen lalu dikutip supaya teks berspasi tidak terpecah.
function run(shell) {
  const quoted = shell ? args.map((a) => `"${a.replace(/"/g, '\\"')}"`) : args;
  const child = spawn('claude', quoted, { cwd: hq, stdio: 'inherit', shell });
  child.on('error', (err) => {
    if (!shell && err.code === 'ENOENT' && process.platform === 'win32') return run(true);
    console.error(`Gagal menjalankan claude: ${err.message}`);
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
run(false);
