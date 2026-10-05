# MY Office

Kantor 3D bergaya mainan balok (Three.js) yang memvisualisasikan subagent Claude Code secara real-time.
Setiap subagent (backend, frontend, qa, ...) tampil sebagai minifigure karyawan; hooks Claude Code
mengirim event ke server lokal, lalu diteruskan ke browser lewat WebSocket.

```
Claude Code hooks ──► hooks/send-event.js ──POST──► server (Express) ──WebSocket──► kantor 3D
```

## Menjalankan

```bash
npm install
npm run dev            # kantor: http://localhost:4545, log mentah: /log.html
npm run replay         # putar ulang rekaman samples/todo-run.jsonl tanpa Claude Code
```

Lalu di terminal lain jalankan Claude Code di folder `playground/`, yang sudah berisi
hooks (`.claude/settings.json`) dan tiga subagent (`.claude/agents/`).

Setiap payload hook disimpan mentah di `logs/events.jsonl`.

## Tahapan

- [x] **Tahap 1** — hooks → server → event log di browser (tanpa grafis)
- [x] **Tahap 2** — kantor 3D statis, minifigure berganti status
- [ ] **Tahap 3** — karakter berjalan, gelembung chat, melapor ke PM

## Temuan Tahap 1 (Claude Code 2.1.289)

- Event tool yang terjadi **di dalam subagent** membawa `agent_type` (mis. `backend`) dan
  `agent_id`. Event milik agen utama tidak punya kedua field itu. Pemetaan karakter cukup
  memakai `agent_type`, tanpa perlu membaca transcript.
- Siklus satu karyawan: `PreToolUse:Agent` (dipanggil) → `SubagentStart` → tool events →
  `PreToolUse:SubagentHandback` (melapor) → `SubagentStop` dengan `agent_type`.
- Ada `SubagentStop` tanpa `agent_type` dengan `agent_id` yang tidak pernah muncul di
  `SubagentStart`. Itu agen internal Claude Code, jadi diabaikan.
- `Notification` dengan `notification_type` menandakan Claude menunggu input pengguna.

## Kantor (Tahap 2)

| Berkas | Isi |
|---|---|
| `public/js/agents.js` | event hooks → status karyawan (tanpa Three.js) |
| `public/js/minifig.js` | minifigure dari bentuk dasar + pose per status |
| `public/js/textures.js` | wajah dan sablon badan digambar di canvas |
| `public/js/office.js` | lantai, dinding bata, meja, ruang rapat, pantry, label |

Peran `backend`, `frontend`, dan `qa` punya meja tetap. Subagent lain otomatis mendapat
minifigure dengan warna tetap (dari hash namanya) di meja cadangan.
Tambahkan `?timer` di URL bila halaman perlu tetap dirender di tab tersembunyi.
