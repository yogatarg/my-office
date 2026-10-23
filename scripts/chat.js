// Mengobrol langsung dengan satu karyawan di kantor pusat, tanpa lewat CEO.
// Pemakaian: npm run chat -- <peran> [opsi claude lain, misalnya --continue]
// Tanpa argumen: menampilkan daftar peran yang bisa diajak bicara.

import { readdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hq = path.join(root, 'playground');
const roles = (await readdir(path.join(hq, '.claude', 'agents')))
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.slice(0, -3))
  .sort();

const [role, ...rest] = process.argv.slice(2);
if (!role || !roles.includes(role)) {
  if (role) console.error(`Peran "${role}" tidak ditemukan di playground/.claude/agents.\n`);
  console.log('Pemakaian: npm run chat -- <peran>\n');
  console.log(`Peran yang tersedia: ${roles.join(', ')}`);
  process.exit(role ? 1 : 0);
}

// Server MCP khusus peran (playground/.claude/mcp/<peran>.json) hanya dimuat di sesi peran itu,
// supaya sesi lain tidak ikut menjalankannya.
const mcpConfig = path.join(hq, '.claude', 'mcp', `${role}.json`);
const hasMcp = await access(mcpConfig).then(() => true, () => false);
// Bentuk --opsi=nilai, karena --mcp-config menerima banyak nilai dan bisa menelan argumen sesudahnya.
const args = ['--agent', role, ...(hasMcp ? [`--mcp-config=${mcpConfig}`] : []), ...rest];

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
