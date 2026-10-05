# Pixel Office

Kantor pixel-art yang memvisualisasikan subagent Claude Code secara real-time.
Setiap subagent (backend, frontend, qa, ...) tampil sebagai karyawan; hooks Claude Code
mengirim event ke server lokal, lalu diteruskan ke browser lewat WebSocket.

```
Claude Code hooks ──► hooks/send-event.js ──POST──► server (Express) ──WebSocket──► browser
```

## Menjalankan

```bash
npm install
npm run dev            # http://localhost:4545
```

Lalu di terminal lain jalankan Claude Code di folder `playground/`, yang sudah berisi
hooks (`.claude/settings.json`) dan tiga subagent (`.claude/agents/`).

Setiap payload hook disimpan mentah di `logs/events.jsonl`.

## Tahapan

- [x] **Tahap 1** — hooks → server → event log di browser (tanpa grafis)
- [ ] **Tahap 2** — kantor statis, karakter berganti status
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
