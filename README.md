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
