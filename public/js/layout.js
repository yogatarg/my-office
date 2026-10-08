// Menyusun denah kantor dari konfigurasi. Murni hitungan (tanpa Three.js) agar bisa diuji.
// Satuan: 1 = satu stud. Sumbu x ke kanan, z ke arah kamera; titik (0, 0) di tengah lantai.
//
//   ┌ Ruang CEO ┬──── Boardroom ────┐       ┌──────────────┐
//   ├───────────┴───────────────────┤ lorong│  Social hub  │  ← dinding hanya untuk ruang
//   │ divisi 🌿 divisi 🌿 divisi    │       │ kafe, lounge │    yang butuh privasi
//   │ ══════ lorong utama ══════    │       │              │
//   │ divisi 🌿 divisi 🌿 divisi    │       │              │  ← area kerja terbuka (open plan),
//   ├───────────────────────────────┤       │              │    divisi dibatasi pot tanaman
//   │ Resepsionis + dinding logo    │       │              │  ← di kanannya lagi: sayap olahraga
//   └───────────────────────────────┘       └──────────────┘    (gym di belakang, kolam renang di depan)

export const DESK_WIDTH = 2.6; // lebar meja; meja dalam satu baris saling menempel
const ROW_GAP = 4; // jarak antar baris meja yang saling berhadapan (punggung meja menempel)
const ZONE_WIDTH = 9.6;
const ROW_A_OFFSET = 2.8; // jarak baris meja pertama dari tepi kiri zona, cukup untuk lalu lalang
const ZONE_PAD = 1.6; // ruang kosong di ujung blok meja (papan nama, lalu lalang)
const PER_ROW = 3; // divisi per baris
const PLANTER_GAP = 2.4; // celah antar divisi sebaris, diisi pot tanaman memanjang
const AISLE = 4; // lorong utama
const MARGIN = 1.2; // jarak dari dinding luar
const ROOM_DEPTH = 13; // cukup dalam untuk meja U yang memanjang
const CEO_ROOM_WIDTH = 15;
const HUB_WIDTH = 14;
const SPORTS_WIDTH = 16; // sayap olahraga: gym di belakang, kolam renang di depan
const GYM_DEPTH = 20;
const RECEPTION_DEPTH = 7;

function divisionZone(division) {
  const cols = Math.ceil(division.desks / 2);
  return { ...division, kind: 'division', cols, w: ZONE_WIDTH, d: cols * DESK_WIDTH + ZONE_PAD * 2 };
}

// Kursi menghadap +x (baris A, wajah terlihat kamera) atau -x (baris B, di seberangnya).
function deskSlots(zone) {
  const slots = [];
  const rowA = zone.x0 + ROW_A_OFFSET;
  for (const [x, facing] of [[rowA, 1], [rowA + ROW_GAP, -1]]) {
    for (let i = 0; i < zone.cols && slots.length < zone.desks; i++) {
      slots.push({ x, z: zone.z0 + ZONE_PAD + DESK_WIDTH * (i + 0.5), facing });
    }
  }
  // Sekat rendah di garis pertemuan punggung meja kedua baris.
  zone.screen = { x: rowA + ROW_GAP / 2, z0: zone.z0 + ZONE_PAD, z1: zone.z0 + ZONE_PAD + DESK_WIDTH * zone.cols };
  return slots;
}

export function computeLayout(config) {
  const zones = [...config.divisions, config.fallback].map(divisionZone);
  const rows = [];
  for (let i = 0; i < zones.length; i += PER_ROW) rows.push(zones.slice(i, i + PER_ROW));

  const blockWidth = PER_ROW * ZONE_WIDTH + (PER_ROW - 1) * PLANTER_GAP;
  const workEnd = MARGIN + blockWidth; // tepi kanan area kerja
  const width = workEnd + AISLE + HUB_WIDTH + AISLE + SPORTS_WIDTH + MARGIN;

  // Koordinat sementara dimulai dari pojok kiri belakang (0, 0).
  const rooms = [
    { id: 'ceo', kind: 'ceo', name: 'Ruang CEO', x0: 0, z0: 0, w: CEO_ROOM_WIDTH, d: ROOM_DEPTH },
    { id: 'boardroom', kind: 'boardroom', name: 'Boardroom', x0: CEO_ROOM_WIDTH, z0: 0, w: workEnd - CEO_ROOM_WIDTH, d: ROOM_DEPTH },
  ];

  const planters = []; // pot tanaman memanjang di antara divisi sebaris
  let z = ROOM_DEPTH + AISLE;
  for (const row of rows) {
    row.forEach((zone, i) => {
      Object.assign(zone, { x0: MARGIN + i * (ZONE_WIDTH + PLANTER_GAP), z0: z });
      if (i > 0) planters.push({ x: zone.x0 - PLANTER_GAP / 2, z0: z + 1, z1: z + zone.d - 1 });
    });
    z += Math.max(...row.map((zone) => zone.d)) + AISLE;
  }

  const reception = { id: 'reception', kind: 'reception', name: 'Resepsionis', x0: MARGIN, z0: z, w: blockWidth, d: RECEPTION_DEPTH };
  const depth = z + RECEPTION_DEPTH + MARGIN;
  const hub = { id: 'hub', kind: 'hub', name: 'Social Hub', x0: workEnd + AISLE, z0: MARGIN, w: HUB_WIDTH, d: depth - MARGIN * 2 };
  const sportsX = hub.x0 + HUB_WIDTH + AISLE;
  const gym = { id: 'gym', kind: 'gym', name: 'Gym', x0: sportsX, z0: MARGIN, w: SPORTS_WIDTH, d: GYM_DEPTH };
  const pool = { id: 'pool', kind: 'pool', name: 'Kolam Renang', x0: sportsX, z0: MARGIN + GYM_DEPTH + AISLE, w: SPORTS_WIDTH, d: depth - MARGIN * 2 - GYM_DEPTH - AISLE };

  // Geser semua koordinat agar pusat lantai di (0, 0).
  const ox = width / 2;
  const oz = depth / 2;
  for (const item of [...rooms, ...zones, reception, hub, gym, pool]) {
    item.x0 -= ox;
    item.z0 -= oz;
  }
  for (const p of planters) {
    p.x -= ox;
    p.z0 -= oz;
    p.z1 -= oz;
  }
  for (const zone of zones) zone.slots = deskSlots(zone);

  return { width, depth, rooms, zones, planters, reception, hub, gym, pool };
}
