// Menyusun denah kantor dari konfigurasi. Murni hitungan (tanpa Three.js) agar bisa diuji.
// Satuan: 1 = satu stud. Sumbu x ke kanan, z ke arah kamera; titik (0, 0) di tengah lantai.
//
//   ┌ ruang CEO ┬ rapat A ┬ rapat B ┐   ← deretan ruang kaca di dinding belakang
//   ├───────────┴─ lorong ┴─────────┤
//   │ divisi │ divisi │ divisi │ …  │   ← zona disusun berbaris, dipisah lorong
//   │ divisi │ umum   │ pantry │    │

export const DESK_WIDTH = 2.6; // lebar meja; meja dalam satu baris saling menempel
const ROW_GAP = 4; // jarak antar baris meja yang saling berhadapan (punggung meja menempel)
const ZONE_WIDTH = 8.8;
const ZONE_PAD = 1.6; // ruang kosong di ujung blok meja (papan nama, lalu lalang)
const CORRIDOR = 3;
const MARGIN = 1.2; // jarak zona dari dinding luar
const ROOM_DEPTH = 8;
const ROOMS = [
  { id: 'ceo', kind: 'ceo', name: 'Ruang CEO', width: 12 },
  { id: 'meeting-a', kind: 'meeting', name: 'Ruang Rapat A', width: 9 },
  { id: 'meeting-b', kind: 'meeting', name: 'Ruang Rapat B', width: 9 },
];
const PANTRY = { width: ZONE_WIDTH, depth: 9 };

function divisionZone(division) {
  const cols = Math.ceil(division.desks / 2);
  return { ...division, kind: 'division', cols, w: ZONE_WIDTH, d: cols * DESK_WIDTH + ZONE_PAD * 2 };
}

// Kursi menghadap +x (baris A, wajah terlihat kamera) atau -x (baris B, di seberangnya).
function deskSlots(zone) {
  const slots = [];
  const rowA = zone.x0 + 2.4;
  for (const [x, facing] of [[rowA, 1], [rowA + ROW_GAP, -1]]) {
    for (let i = 0; i < zone.cols && slots.length < zone.desks; i++) {
      slots.push({ x, z: zone.z0 + ZONE_PAD + DESK_WIDTH * (i + 0.5), facing });
    }
  }
  return slots;
}

export function computeLayout(config) {
  const zones = [...config.divisions, config.fallback].map(divisionZone);
  zones.push({ id: 'pantry', kind: 'pantry', name: 'Pantry', w: PANTRY.width, d: PANTRY.depth });

  // Jumlah zona per baris dipilih agar denah mendekati persegi (enak dilihat dari kamera isometrik).
  const perRow = Math.ceil(Math.sqrt(zones.length)) + 1;
  const rows = [];
  for (let i = 0; i < zones.length; i += perRow) rows.push(zones.slice(i, i + perRow));

  const roomsWidth = ROOMS.reduce((sum, r) => sum + r.width, 0);
  const rowsWidth = Math.max(...rows.map((row) => row.reduce((sum, z) => sum + z.w, 0) + CORRIDOR * (row.length - 1)));
  const width = Math.max(roomsWidth, rowsWidth) + MARGIN * 2;

  // Koordinat sementara dimulai dari pojok kiri belakang (0, 0).
  // Deretan ruang kaca direntangkan memenuhi lebar lantai.
  const stretch = width / roomsWidth;
  let x = 0;
  const rooms = ROOMS.map((room) => {
    const placed = { ...room, x0: x, z0: 0, w: room.width * stretch, d: ROOM_DEPTH };
    x += placed.w;
    return placed;
  });

  let z = ROOM_DEPTH + CORRIDOR;
  for (const row of rows) {
    let zx = MARGIN;
    for (const zone of row) {
      Object.assign(zone, { x0: zx, z0: z });
      zx += zone.w + CORRIDOR;
    }
    z += Math.max(...row.map((zone) => zone.d)) + CORRIDOR;
  }
  const depth = z;

  // Geser semua koordinat agar pusat lantai di (0, 0).
  const ox = width / 2;
  const oz = depth / 2;
  for (const item of [...rooms, ...zones]) {
    item.x0 -= ox;
    item.z0 -= oz;
  }
  for (const zone of zones) if (zone.kind === 'division') zone.slots = deskSlots(zone);

  return { width, depth, rooms, zones };
}
