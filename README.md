# MY Office

Kantor 3D bergaya mainan balok yang realistis (Three.js) yang memvisualisasikan subagent Claude Code secara real-time.
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
npm run replay -- samples/pm-delegation.jsonl   # rekaman PM memanggil QA
```

Lalu di terminal lain jalankan Claude Code di folder `playground/`, yang sudah berisi
hooks (`.claude/settings.json`) dan tiga subagent (`.claude/agents/`).

Setiap event hook disimpan di `logs/events.jsonl` (tidak ikut ke git) dalam bentuk ringkas:

- `tool_response` (isi file, keluaran perintah) dibuang; ukurannya dicatat sebagai `tool_response_size`.
- Teks lebih dari 500 karakter dipotong dengan penanda `… [dipotong N karakter]`.
- Bila file melewati 5 MB, file diganti nama menjadi `events-<waktu>.jsonl`; hanya 5 arsip terbaru disimpan.
  Atur dengan variabel lingkungan `LOG_MAX_MB` dan `LOG_KEEP`.

## Kantor pusat (HQ)

Folder `playground` adalah kantor pusat: semua perintah diberikan dari sini, lalu CEO (agen utama)
mengatur tim untuk membuat atau mengerjakan proyek di folder workspace.

```bash
npm run sync                          # selaraskan hooks, izin workspace, dan file agen dengan office.config.json
cd playground && claude               # beri perintah, mis. "buatkan website toko kue sederhana"
```

- `workspace` di `office.config.json` (bawaan `C:/laragon/www`) diberikan ke Claude Code lewat
  `permissions.additionalDirectories`. Setiap edit dan perintah tetap meminta izin seperti biasa.
- `playground/CLAUDE.md` adalah pedoman CEO: alur proyek baru (PM → DevOps → divisi → QA → laporan).
- `npm run sync` membuat `.claude/agents/<peran>.md` untuk peran baru di konfigurasi; file yang sudah ada tidak ditimpa.
- Kantor mengenali proyek yang sedang dikerjakan dari path file dan menampilkannya di header.

## Tahapan

- [x] **Tahap 1** — hooks → server → event log di browser (tanpa grafis)
- [x] **Tahap 2** — kantor 3D statis, minifigure berganti status
- [x] **Tahap 3** — karakter berjalan, gelembung chat, melapor di ruang rapat
- [x] **Tampilan realistis** — denah dari konfigurasi, material & pencahayaan, CEO & PM

## Temuan Tahap 1 (Claude Code 2.1.289)

- Event tool yang terjadi **di dalam subagent** membawa `agent_type` (mis. `backend`) dan
  `agent_id`. Event milik agen utama tidak punya kedua field itu. Pemetaan karakter cukup
  memakai `agent_type`, tanpa perlu membaca transcript.
- Siklus satu karyawan: `PreToolUse:Agent` (dipanggil) → `SubagentStart` → tool events →
  `PreToolUse:SubagentHandback` (melapor) → `SubagentStop` dengan `agent_type`.
- Ada `SubagentStop` tanpa `agent_type` dengan `agent_id` yang tidak pernah muncul di
  `SubagentStart`. Itu agen internal Claude Code, jadi diabaikan.
- `Notification` dengan `notification_type` menandakan Claude menunggu input pengguna.

## Temuan hierarki subagent (Claude Code 2.1.289)

Diuji dengan `samples/pm-delegation.jsonl` (agen utama → pm → qa):

- **Subagent bisa memanggil subagent lain** bila tool `Agent` ada di daftar `tools` file agennya.
  Event-nya `PreToolUse:Agent` dengan `agent_type: "pm"` dan `tool_input.subagent_type: "qa"`.
- Subagent yang dipanggil berjalan di latar belakang: pm bisa selesai lebih dulu, dan **hasil qa dikirim
  ke agen utama** sebagai prompt `<task-notification>`, bukan ke pm.
- Pada alur ini tidak muncul `SubagentHandback`, jadi karakter tidak berjalan ke ruang rapat.

## Divisi dan peran: `office.config.json`

Kantor dibangun dari file ini, jadi menambah divisi atau peran tidak perlu mengubah kode.

```jsonc
{
  "name": "MY Office",
  "lead": { "label": "CEO", ... },          // agen utama Claude Code
  "divisions": [
    {
      "id": "engineering", "name": "Engineering",
      "color": "#2f6db5",                    // warna karpet, papan nama, dan label
      "desks": 6,                            // jumlah meja (yang kosong tetap tampil)
      "roles": {                             // nama subagent (.claude/agents/<nama>.md)
        "backend": { "label": "Backend", "shirt": "#1f5fbf", "accessory": "headset" }
      }
    }
  ],
  "fallback": { "name": "General", "desks": 6 } // subagent yang tidak terdaftar
}
```

Field penampilan peran:

| Field | Nilai |
|---|---|
| `label` | nama di label |
| `shirt`, `pants`, `hair` | warna (untuk `suit`, `shirt` adalah warna jas) |
| `face` | `smile`, `grin`, `stern`, `skeptic` |
| `print` | `tie`, `shirt`, `suit`, `braces`, `tag`, `check`, `letter` |
| `tie` | warna dasi untuk `tie` dan `suit` |
| `sleeves` | `rolled` untuk lengan digulung |
| `accessory` | satu nilai atau daftar: `headset`, `beret`, `magnifier`, `glasses`, `clipboard` |
Muat ulang halaman setelah mengubah file ini.

## Struktur kode

| Berkas | Isi |
|---|---|
| `public/js/config.js` | memuat dan melengkapi `office.config.json` |
| `public/js/layout.js` | menyusun denah (ruang kaca, zona divisi, pantry) dari konfigurasi |
| `public/js/world.js` | membangun lantai, dinding, ruangan, perabot dari denah |
| `public/js/agents.js` | event hooks → status dan lokasi karyawan (tanpa Three.js) |
| `public/js/office.js` | kamera, renderer, gerak karakter, label |
| `public/js/minifig.js` | minifigure dari bentuk dasar + pose per status |
| `public/js/textures.js` | wajah, sablon, lantai, karpet, kayu, papan nama (canvas) |
| `public/js/nav.js` | pencari jalan A* di grid lantai |

## Perilaku karyawan

- Karyawan yang tidak bekerja **siaga di mejanya**. Agen utama (CEO) selalu di ruangannya.
- `SubagentStart` → mulai bekerja di meja; status mengikuti tool yang dipakai.
- `SubagentHandback` → berjalan ke boardroom dan presentasi di depan layar (gelembung berisi baris pertama
  laporan). Selama ada yang melapor, **CEO duduk di kursi direktur** meja U.
- Setelah selesai, rehat sebentar lalu kembali ke meja: bergantian **duduk di sofa lounge** atau berdiri di kafe.

## Tata ruang

Open plan seperti kantor modern: dinding hanya untuk ruangan yang butuh privasi.

- **Ruang CEO** (pojok kiri belakang) dan **Boardroom**, keduanya berdinding kaca.
- **Boardroom**: meja U memanjang yang terbuka ke arah layar proyektor di dinding. Satu kursi direktur
  di dasar U menghadap layar, peserta di kedua lengan. Pelapor berdiri di depan layar seperti presentasi,
  dan CEO duduk di kursi direktur selama ada yang melapor.
- **Divisi** (3 per baris) tanpa dinding: dibatasi pot tanaman memanjang, warna karpet, dan papan nama.
  Tiap divisi 6 meja dengan sekat rendah di antara meja yang berhadapan.
- **Social hub** di sisi kanan: kafe (konter kopi, kulkas, meja bar) dan beberapa klaster lounge.
  Karyawan rehat bergantian berdiri di meja bar atau duduk di sofa.
- **Resepsionis** dekat pintu masuk dengan dinding logo kantor dan sofa tamu.

## Interaksi

- **Klik karyawan** (badan atau labelnya) untuk membuka panel detail: status, tugas dari CEO/PM, proyek,
  lama bekerja, jumlah tugas selesai, file yang disentuh, dan riwayat aktivitas. Tombol *Ikuti dengan kamera*
  membuat kamera mengikutinya; menyeret kamera menghentikannya.
- **Navigasi zona** di kiri bawah dan **minimap** di kanan atas (klik untuk memindahkan kamera).
- **Notifikasi** (tombol di header): bunyi saat CEO selesai atau butuh perhatian, ditambah notifikasi sistem
  bila tab kantor sedang tidak dilihat.

## Grafis

- Plastik memakai `MeshPhysicalMaterial` dengan clearcoat tipis dan pantulan lingkungan (`RoomEnvironment`).
- Lantai: tile sedikit berkilap, kayu berkilap halus, karpet kusam. Kaca memantulkan lingkungan di sudut miring.
- Tombol **Kualitas** di header: *Tinggi* (ambient occlusion GTAO, bayangan 4096 lembut, resolusi penuh)
  atau *Ringan* (tanpa AO, bayangan 2048, resolusi 1x). Pilihan disimpan di browser.

- **Siang dan malam** mengikuti jam laptop: fajar 05.00–07.00, senja 17.00–19.30. Saat gelap, latar
  menggelap, jendela ikut gelap, dan lampu ruangan menyala di atas tiap zona. Jam dinding di kafe menunjukkan
  waktu sungguhan.

Parameter URL: `?jam=22` mengunci waktu (untuk mencoba suasana malam), `?quality=high|low` memaksa kualitas, `?timer` tetap merender di tab tersembunyi,
`?debug` membuka `window.office.debug` (scene, renderer, camera, sun) di console.
