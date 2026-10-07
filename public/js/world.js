import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { plastic } from './minifig.js';
import { tileTexture, carpetTexture, woodTexture, signTexture, slideTexture, logoTexture, clockTexture } from './textures.js';

// Membangun isi kantor dari hasil computeLayout(). Gaya: permukaan datar bertekstur halus,
// stud hanya sebagai detail (puncak dinding), warna dasar netral seperti kantor sungguhan.
// Area kerja terbuka (open plan); dinding kaca hanya untuk ruang CEO dan boardroom.

const WALL_HEIGHT = 3.2;

const mats = {
  wall: plastic('#e7e4de', { roughness: 0.6 }),
  wood: plastic('#c9a26b', { roughness: 0.5 }),
  darkWood: plastic('#6e4a2e', { roughness: 0.45 }),
  frame: plastic('#55595f'),
  metal: plastic('#8e949b', { roughness: 0.35 }),
  black: plastic('#232323'),
  white: plastic('#efece6'),
  leather: plastic('#5b4636', { roughness: 0.55 }),
  green: plastic('#3f8f4a'),
  pot: plastic('#d9d4cb'),
  // Kaca bening: hampir transparan, tetapi memantulkan lingkungan di sudut miring.
  glass: new THREE.MeshPhysicalMaterial({ color: '#e4f0f7', transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false }),
};

function solid(geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const rbox = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 2, r);

// Tekstur berulang: satu ubin tekstur = 2x2 stud. finish menentukan kilap permukaan:
// tile plastik licin sedikit memantul, kayu agak berkilap, karpet kusam.
const FINISH = {
  tile: { roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.3 },
  wood: { roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.25 },
  carpet: { roughness: 0.95, clearcoat: 0 },
};

function surface(texture, w, d, finish = 'tile') {
  const t = texture.clone();
  t.needsUpdate = true;
  t.repeat.set(w / 2, d / 2);
  return new THREE.MeshPhysicalMaterial({ map: t, metalness: 0, ...FINISH[finish] });
}

// Lapisan lantai tipis di atas lantai dasar (karpet, kayu) agar tiap zona terbedakan.
// lift menaikkan lapisan yang ditumpuk di atas lapisan lain (mis. karpet di atas kayu) agar tidak berkedip.
function floorPatch(scene, texture, finish, x0, z0, w, d, inset = 0.2, lift = 0) {
  const patch = new THREE.Mesh(new THREE.BoxGeometry(w - inset * 2, 0.04, d - inset * 2), surface(texture, w, d, finish));
  patch.position.set(x0 + w / 2, 0.02 + lift, z0 + d / 2);
  patch.receiveShadow = true;
  scene.add(patch);
}

function studRow(points, material, y) {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.17, 20), material, points.length);
  const m = new THREE.Matrix4();
  points.forEach(([x, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y + 0.085, z)));
  mesh.castShadow = true;
  return mesh;
}

// ---------- Perabot ----------

function createChair(material = mats.black) {
  const g = new THREE.Group();
  g.add(solid(rbox(1.0, 0.18, 1.0), material, 0, 0.95, 0));
  g.add(solid(rbox(1.0, 1.1, 0.16), material, 0, 1.6, -0.55));
  g.add(solid(new THREE.CylinderGeometry(0.08, 0.08, 0.86, 10), mats.metal, 0, 0.43, 0));
  g.add(solid(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 20), mats.frame, 0, 0.04, 0));
  return g;
}

// Meja kerja; karakter duduk di titik asal grup dan menghadap +z (lokal).
function createDesk({ width = 2.6, top = mats.wood, chair = mats.black } = {}) {
  const g = new THREE.Group();
  g.add(solid(rbox(width, 0.16, 1.5, 0.04), top, 0, 2.02, 1.25));
  for (const x of [-width / 2 + 0.15, width / 2 - 0.15]) {
    for (const z of [0.65, 1.85]) g.add(solid(new THREE.BoxGeometry(0.16, 1.94, 0.16), mats.frame, x, 0.97, z));
  }
  g.add(createChair(chair));

  // Laptop: layar menghadap karakter, punggungnya terlihat oleh kamera.
  g.add(solid(rbox(1.0, 0.06, 0.66, 0.02), mats.frame, 0, 2.13, 1.15));
  const screenMat = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#000', roughness: 0.4 });
  const lid = new THREE.Group();
  lid.position.set(0, 2.16, 1.46);
  lid.rotation.x = 0.28;
  lid.add(solid(new THREE.BoxGeometry(1.0, 0.68, 0.05), [mats.frame, mats.frame, mats.frame, mats.frame, mats.frame, screenMat], 0, 0.34, 0));
  g.add(lid);

  // Lampu status berbentuk stud transparan di pojok meja.
  const lampMat = new THREE.MeshStandardMaterial({ color: '#444', emissive: '#000', transparent: true, opacity: 0.9, roughness: 0.15 });
  g.add(solid(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 20), mats.black, width / 2 - 0.35, 2.16, 1.65));
  g.add(solid(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 20), lampMat, width / 2 - 0.35, 2.37, 1.65));
  g.add(solid(new THREE.CylinderGeometry(0.13, 0.12, 0.26, 16), mats.white, -width / 2 + 0.4, 2.23, 1.0));
  return { group: g, screenMat, lampMat };
}

function createPlant(scale = 1) {
  const g = new THREE.Group();
  g.add(solid(new THREE.CylinderGeometry(0.42, 0.32, 0.8, 18), mats.pot, 0, 0.4, 0));
  [[0, 1.2, 0, 0.5], [0.25, 1.7, 0.1, 0.4], [-0.2, 1.6, -0.15, 0.38], [0.05, 2.1, 0, 0.3]].forEach(([x, y, z, r]) =>
    g.add(solid(new THREE.SphereGeometry(r, 16, 12), mats.green, x, y, z)));
  g.scale.setScalar(scale);
  return g;
}

// Pot tanaman memanjang: pembatas alami antar divisi di area terbuka.
function createPlanter(length) {
  const g = new THREE.Group();
  g.add(solid(rbox(0.9, 0.9, length, 0.06), mats.white, 0, 0.45, 0));
  const count = Math.max(2, Math.round(length / 0.8));
  for (let i = 0; i < count; i++) {
    const z = -length / 2 + 0.4 + (i * (length - 0.8)) / (count - 1);
    const r = 0.36 + ((i * 37) % 10) / 60;
    g.add(solid(new THREE.SphereGeometry(r, 14, 10), mats.green, ((i * 13) % 3 - 1) * 0.08, 1.05 + r * 0.6, z));
  }
  return g;
}

// Dudukan sofa setinggi kursi kerja (1.04) agar minifigure duduk dengan pose yang sama.
// Sofa menghadap +z; dudukan di x = -1.05, 0, 1.05.
const SOFA_SEATS = [-1.05, 0, 1.05];

function createSofa(material = mats.leather) {
  const g = new THREE.Group();
  g.add(solid(rbox(3.4, 0.8, 1.4), material, 0, 0.64, 0));
  g.add(solid(rbox(3.4, 1.1, 0.35), material, 0, 1.45, -0.55));
  for (const s of [-1, 1]) g.add(solid(rbox(0.35, 1.1, 1.4), material, s * 1.7, 0.9, 0));
  return g;
}

function createArmchair(material) {
  const g = new THREE.Group();
  g.add(solid(rbox(1.4, 0.8, 1.4), material, 0, 0.64, 0));
  g.add(solid(rbox(1.4, 1.1, 0.35), material, 0, 1.45, -0.55));
  for (const s of [-1, 1]) g.add(solid(rbox(0.3, 1.0, 1.4), material, s * 0.7, 0.85, 0));
  return g;
}

// Titik duduk di perabot (lokal → dunia) beserta titik berdiri di depannya.
function seatSpot(furniture, localX, kind) {
  furniture.updateMatrixWorld(true);
  const seat = furniture.localToWorld(new THREE.Vector3(localX, 0, 0.05));
  const front = furniture.localToWorld(new THREE.Vector3(localX, 0, 1.5));
  return { x: seat.x, z: seat.z, yaw: furniture.rotation.y, seat: true, kind, access: { x: front.x, z: front.z } };
}

function createBookshelf(width) {
  const g = new THREE.Group();
  g.add(solid(rbox(width, 2.8, 0.7), mats.darkWood, 0, 1.4, 0));
  const colors = ['#b03a2e', '#2f6db5', '#f5cb18', '#2e9c5a', '#efece6'];
  for (let shelf = 0; shelf < 3; shelf++) {
    for (let i = 0; i < Math.floor(width / 0.35) - 1; i++) {
      if ((i * 7 + shelf * 3) % 5 === 0) continue;
      g.add(solid(new THREE.BoxGeometry(0.26, 0.6, 0.4), plastic(colors[(i + shelf) % colors.length]), -width / 2 + 0.4 + i * 0.35, 0.65 + shelf * 0.85, 0.2));
    }
  }
  return g;
}

function signBoard(name, color, width = 2.8) {
  const g = new THREE.Group();
  const face = plastic('#ffffff', { map: signTexture(name, color) });
  g.add(solid(new THREE.BoxGeometry(width, width * 0.31, 0.12), [mats.white, mats.white, mats.white, mats.white, face, mats.white], 0, 0, 0));
  return g;
}

// Totem papan nama berdiri, sedikit diputar ke arah kamera.
function standingSign(name, color) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(solid(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8), mats.metal, s * 1.1, 0.75, 0));
  const board = signBoard(name, color);
  board.position.y = 1.7;
  g.add(board);
  g.rotation.y = 0.6;
  return g;
}

// Kursi bar tinggi tanpa sandaran.
function createStool() {
  const g = new THREE.Group();
  g.add(solid(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 18), mats.black, 0, 1.5, 0));
  g.add(solid(new THREE.CylinderGeometry(0.05, 0.05, 1.45, 8), mats.metal, 0, 0.73, 0));
  g.add(solid(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 18), mats.metal, 0, 0.03, 0));
  return g;
}

// ---------- Ruang kaca ----------

// Dinding kaca dari a ke b (sejajar sumbu). door = lebar celah pintu, doorAt = posisi
// tengah pintu sebagai pecahan panjang dinding (0..1).
function glassWall(scene, blockers, [ax, az], [bx, bz], door = 0, doorAt = 0.5, height = WALL_HEIGHT) {
  const along = ax === bx ? 'z' : 'x';
  const length = along === 'x' ? bx - ax : bz - az;
  const c = length * doorAt;
  const segments = door ? [[0, c - door / 2], [c + door / 2, length]] : [[0, length]];
  for (const [s0, s1] of segments) {
    const len = s1 - s0;
    if (len <= 0.05) continue;
    const mid = (s0 + s1) / 2;
    const cx = along === 'x' ? ax + mid : ax;
    const cz = along === 'x' ? az : az + mid;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len : 0.08, height - 0.2, along === 'x' ? 0.08 : len), mats.glass);
    pane.position.set(cx, height / 2, cz);
    pane.renderOrder = 1;
    scene.add(pane);
    blockers.push(pane);
    // Rangka aluminium: rel atas-bawah dan tiang setiap ±3 satuan.
    for (const y of [0.05, height - 0.05]) {
      scene.add(solid(new THREE.BoxGeometry(along === 'x' ? len : 0.14, 0.1, along === 'x' ? 0.14 : len), mats.metal, cx, y, cz));
    }
    const posts = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= posts; i++) {
      const p = s0 + (len * i) / posts;
      scene.add(solid(new THREE.BoxGeometry(0.12, height, 0.12), mats.metal, along === 'x' ? ax + p : ax, height / 2, along === 'x' ? az : az + p));
    }
  }
}

function buildCeoRoom(scene, room, parts) {
  const { x0, z0, w, d } = room;
  // Meja eksekutif menghadap +x (wajah CEO terlihat kamera), sofa di seberang ruangan.
  const desk = createDesk({ width: 3.6, top: mats.darkWood, chair: mats.leather });
  desk.group.position.set(x0 + 4.5, 0, z0 + d / 2);
  desk.group.rotation.y = Math.PI / 2;
  scene.add(desk.group);
  parts.ceoDesk = desk;
  parts.obstacles.push(desk.group);

  floorPatch(scene, carpetTexture('#7a2f2f'), 'carpet', x0 + w - 5.6, z0 + d / 2 - 2.6, 4.6, 5.2, 0, 0.03);
  const sofa = createSofa();
  sofa.position.set(x0 + w - 1.6, 0, z0 + d / 2);
  sofa.rotation.y = -Math.PI / 2;
  scene.add(sofa);
  parts.obstacles.push(sofa);

  const shelf = createBookshelf(5);
  shelf.position.set(x0 + w / 2 + 1, 0, z0 + 0.6);
  scene.add(shelf);
  parts.obstacles.push(shelf);

  for (const [px, pz] of [[x0 + 0.9, z0 + 0.9], [x0 + w - 0.9, z0 + 0.9]]) {
    const plant = createPlant();
    plant.position.set(px, 0, pz);
    scene.add(plant);
    parts.circles.push([px, pz, 0.5]);
  }
}

// Boardroom: meja U memanjang yang terbuka ke arah layar proyektor di dinding belakang.
// Satu kursi direktur di dasar U menghadap layar; peserta duduk berderet di kedua lengan;
// pelapor berdiri di depan layar seperti presentasi, menghadap direktur.
function buildBoardroom(scene, room, parts) {
  const { x0, z0, w, d } = room;
  const cx = x0 + w / 2;

  // Layar proyektor menempel di dinding belakang.
  const slide = new THREE.MeshStandardMaterial({ map: slideTexture(), emissive: '#ffffff', emissiveMap: slideTexture(), emissiveIntensity: 0.55, roughness: 0.6 });
  scene.add(solid(new THREE.BoxGeometry(6.4, 2.9, 0.06), mats.black, cx, 1.85, z0 + 0.08));
  scene.add(solid(new THREE.BoxGeometry(6, 2.6, 0.06), [mats.white, mats.white, mats.white, mats.white, slide, mats.white], cx, 1.85, z0 + 0.12));

  const half = 2.8; // jarak sumbu ke tengah tiap lengan
  const armStart = z0 + 4.4; // ujung lengan di sisi layar
  const baseZ = z0 + d - 2.8; // garis tengah dasar U
  const segments = [
    [cx, baseZ, half * 2 + 1.2, 1.2],
    [cx - half, (armStart + baseZ - 0.6) / 2, 1.2, baseZ - 0.6 - armStart],
    [cx + half, (armStart + baseZ - 0.6) / 2, 1.2, baseZ - 0.6 - armStart],
  ];
  for (const [x, z, sw, sd] of segments) {
    const top = solid(rbox(sw, 0.16, sd, 0.04), mats.darkWood, x, 2.02, z);
    // Panel penutup kaki di bawah tiap segmen, seperti meja rapat kantor.
    const along = sw > sd ? 'x' : 'z';
    const panel = solid(new THREE.BoxGeometry(along === 'x' ? sw - 0.5 : 0.12, 1.9, along === 'z' ? sd - 0.5 : 0.12), mats.frame, x, 0.95, z);
    scene.add(top, panel);
    parts.obstacles.push(top, panel);
  }

  // Proyektor di tengah dasar U, lensanya mengarah ke layar.
  scene.add(solid(rbox(0.7, 0.26, 0.55, 0.04), mats.white, cx, 2.23, baseZ - 0.1));
  scene.add(solid(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 16), plastic('#9fd3ff', { emissive: '#9fd3ff', emissiveIntensity: 0.8 }), cx, 2.23, baseZ - 0.42).rotateX(Math.PI / 2));

  const director = createChair(mats.leather);
  director.position.set(cx, 0, baseZ + 1.25);
  director.rotation.y = Math.PI; // menghadap layar (-z)
  scene.add(director);
  parts.obstacles.push(director);
  // Kursi direktur didekati dari sisi kiri, searah pintu boardroom, supaya tidak perlu memutari meja U.
  const head = { x: cx, z: baseZ + 1.25, yaw: Math.PI, seat: true, kind: 'meeting', access: { x: cx - 1.7, z: baseZ + 1.25 } };

  const step = (baseZ - 0.6 - armStart - 0.4) / 3;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const chair = createChair();
      chair.position.set(cx + side * (half + 1.25), 0, armStart + 0.2 + i * step);
      chair.rotation.y = (-side * Math.PI) / 2; // menghadap ke dalam U
      scene.add(chair);
      parts.obstacles.push(chair);
    }
  }

  // Pelapor berdiri di antara layar dan ujung lengan, menghadap direktur (+z).
  const spots = [-1.6, 1.6, -3.4, 3.4].map((dx) => ({ x: cx + dx, z: z0 + 2.4, yaw: 0 }));

  for (const [px, pz] of [[x0 + 0.9, z0 + 0.9], [x0 + w - 0.9, z0 + 0.9]]) {
    const plant = createPlant();
    plant.position.set(px, 0, pz);
    scene.add(plant);
    parts.circles.push([px, pz, 0.5]);
  }
  parts.meetings.push({ head, spots });
  room.doorAt = 2.2 / w; // pintu di sisi kiri, dasar U di tengah tidak menghalangi
}

function buildRoom(scene, room, parts) {
  const { x0, z0, w, d } = room;
  if (room.kind === 'ceo') {
    floorPatch(scene, woodTexture(), 'wood', x0, z0, w, d, 0.1);
    buildCeoRoom(scene, room, parts);
  } else {
    floorPatch(scene, carpetTexture('#59606b'), 'carpet', x0, z0, w, d, 0.1);
    buildBoardroom(scene, room, parts);
  }

  const doorAt = room.doorAt ?? 0.5;
  glassWall(scene, parts.blockers, [x0, z0 + d], [x0 + w, z0 + d], 2.4, doorAt);
  if (x0 > -parts.width / 2 + 0.1) glassWall(scene, parts.blockers, [x0, z0], [x0, z0 + d]);
  if (x0 + w < parts.width / 2 - 0.1) glassWall(scene, parts.blockers, [x0 + w, z0], [x0 + w, z0 + d]);

  const plate = signBoard(room.name, room.kind === 'ceo' ? '#141414' : '#59606b', 2.6);
  plate.position.set(x0 + w * doorAt, WALL_HEIGHT + 0.5, z0 + d);
  scene.add(plate);
}

// ---------- Area kerja terbuka ----------

function buildDivision(scene, zone, parts) {
  const { x0, z0, w, d } = zone;
  floorPatch(scene, carpetTexture(zone.color), 'carpet', x0, z0, w, d);
  const desks = zone.slots.map((slot) => {
    const desk = createDesk();
    desk.group.position.set(slot.x, 0, slot.z);
    desk.group.rotation.y = (slot.facing * Math.PI) / 2;
    scene.add(desk.group);
    parts.obstacles.push(desk.group);
    return desk;
  });
  parts.divisionDesks.set(zone.id, desks);

  // Sekat rendah di antara meja yang berhadapan, berwarna divisi.
  const { x, z0: s0, z1: s1 } = zone.screen;
  const fabric = plastic(`#${new THREE.Color(zone.color).lerp(new THREE.Color('#d8d8d8'), 0.45).getHexString()}`, { roughness: 0.85, clearcoat: 0 });
  scene.add(solid(rbox(0.12, 0.9, s1 - s0, 0.03), fabric, x, 2.55, (s0 + s1) / 2));

  const sign = standingSign(zone.name, zone.color);
  sign.position.set(x0 + 1.6, 0, z0 + d - 0.7);
  scene.add(sign);
  parts.obstacles.push(sign);

  const plant = createPlant(0.9);
  plant.position.set(x0 + w - 0.8, 0, z0 + 0.8);
  scene.add(plant);
  parts.circles.push([plant.position.x, plant.position.z, 0.45]);
}

function buildPlanter(scene, planter, parts) {
  const p = createPlanter(planter.z1 - planter.z0);
  p.position.set(planter.x, 0, (planter.z0 + planter.z1) / 2);
  scene.add(p);
  parts.obstacles.push(p);

  // Stasiun printer bersama di ujung depan pot: lemari arsip dengan printer di atasnya.
  const station = new THREE.Group();
  station.add(solid(rbox(1.1, 1.7, 0.9), plastic('#9aa0a7'), 0, 0.85, 0));
  for (const y of [0.45, 1.05]) station.add(solid(new THREE.BoxGeometry(0.9, 0.04, 0.02), mats.frame, 0, y, 0.46));
  station.add(solid(rbox(1.0, 0.5, 0.8, 0.06), mats.white, 0, 1.95, 0));
  station.add(solid(new THREE.BoxGeometry(0.7, 0.03, 0.3), plastic('#fbfaf6'), 0, 2.21, 0.15));
  station.add(solid(new THREE.BoxGeometry(0.18, 0.06, 0.04), plastic('#3fd37a', { emissive: '#3fd37a', emissiveIntensity: 0.6 }), 0.3, 2.05, 0.41));
  station.position.set(planter.x, 0, planter.z1 + 0.9);
  scene.add(station);
  parts.obstacles.push(station);
}

// ---------- Resepsionis ----------

function buildReception(scene, area, parts, name) {
  const { x0, z0, w, d } = area;
  floorPatch(scene, carpetTexture('#3a3f48'), 'carpet', x0 + 0.6, z0 + 0.6, 16, d - 1.2, 0);

  // Dinding logo berdiri bebas, menghadap pintu masuk (+z).
  const logo = plastic('#ffffff', { map: logoTexture(name) });
  const wall = solid(new THREE.BoxGeometry(8, 3, 0.4), [mats.wall, mats.wall, mats.wall, mats.wall, logo, mats.wall], x0 + 6, 1.5, z0 + 0.9);
  scene.add(wall);
  parts.obstacles.push(wall);

  // Meja resepsionis dengan kursi di belakangnya.
  const desk = new THREE.Group();
  desk.add(solid(rbox(4.6, 1.9, 1.0), mats.white, 0, 0.95, 0));
  desk.add(solid(rbox(4.8, 0.14, 1.2, 0.03), mats.wood, 0, 1.97, 0));
  desk.add(solid(new THREE.BoxGeometry(4.4, 0.4, 0.06), plastic('#f5cb18'), 0, 1.3, 0.52));
  desk.position.set(x0 + 6, 0, z0 + 3.6);
  const chair = createChair();
  chair.position.set(x0 + 6, 0, z0 + 2.4);
  scene.add(desk, chair);
  parts.obstacles.push(desk, chair);

  // Area tunggu tamu.
  const sofa = createSofa(plastic('#59606b', { roughness: 0.8, clearcoat: 0 }));
  sofa.position.set(x0 + 13, 0, z0 + 2.2);
  scene.add(sofa);
  parts.obstacles.push(sofa);
  scene.add(solid(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 24), mats.wood, x0 + 13, 0.95, z0 + 4.1));
  parts.circles.push([x0 + 13, z0 + 4.1, 0.6]);

  // Keset pintu masuk di tepi depan lantai.
  floorPatch(scene, carpetTexture('#2b2b2b'), 'carpet', x0 + w - 7, z0 + d - 1.6, 4, 1.6, 0);
  const entrance = standingSign('Pintu Masuk', '#f5cb18');
  entrance.position.set(x0 + w - 9, 0, z0 + d - 0.8);
  scene.add(entrance);

  for (const [px, pz] of [[x0 + 0.9, z0 + d - 0.9], [x0 + 15.5, z0 + 0.9]]) {
    const plant = createPlant(1.1);
    plant.position.set(px, 0, pz);
    scene.add(plant);
    parts.circles.push([px, pz, 0.5]);
  }
}

// ---------- Social hub: kafe dan lounge ----------

// Satu klaster lounge: sofa menghadap kamera, sofa samping, kursi santai, meja kopi, karpet.
function buildLoungeCluster(scene, x0, z0, w, parts, seats) {
  floorPatch(scene, carpetTexture('#a0522d'), 'carpet', x0 + 1, z0 + 0.6, w - 2, 9, 0, 0.03);
  const fabric = plastic('#4f6d7a', { roughness: 0.8, clearcoat: 0 });
  const accent = plastic('#d98c3a', { roughness: 0.8, clearcoat: 0 });

  const sofa = createSofa(fabric);
  sofa.position.set(x0 + w / 2 - 0.4, 0, z0 + 2);
  const side = createSofa(fabric);
  side.position.set(x0 + w - 2.2, 0, z0 + 6);
  side.rotation.y = -Math.PI / 2;
  const armchair = createArmchair(accent);
  armchair.position.set(x0 + 2.6, 0, z0 + 6);
  armchair.rotation.y = Math.PI / 2;
  for (const f of [sofa, side, armchair]) {
    scene.add(f);
    parts.obstacles.push(f);
  }
  for (const x of SOFA_SEATS) seats.push(seatSpot(sofa, x, 'lounge'));
  for (const x of SOFA_SEATS) seats.push(seatSpot(side, x, 'lounge'));
  seats.push(seatSpot(armchair, 0, 'lounge'));

  const tx = x0 + w / 2 - 0.2;
  const tz = z0 + 6;
  const table = solid(rbox(2.4, 0.14, 1.6, 0.04), mats.wood, tx, 0.95, tz);
  scene.add(table, solid(new THREE.BoxGeometry(2.0, 0.88, 1.2), mats.frame, tx, 0.44, tz));
  parts.obstacles.push(table);
  scene.add(solid(new THREE.CylinderGeometry(0.13, 0.12, 0.26, 16), mats.white, tx - 0.5, 1.15, tz));
  scene.add(solid(rbox(0.6, 0.06, 0.45), plastic('#2f6db5'), tx + 0.4, 1.05, tz + 0.2));

  // Lampu lantai di sudut sofa.
  scene.add(solid(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8), mats.metal, x0 + w - 1.2, 1.4, z0 + 1.4));
  scene.add(solid(new THREE.CylinderGeometry(0.25, 0.4, 0.5, 20), plastic('#f4ead2', { emissive: '#ffdca0', emissiveIntensity: 0.35 }), x0 + w - 1.2, 2.95, z0 + 1.4));
}

function buildHub(scene, hub, parts) {
  const { x0, z0, w, d } = hub;
  floorPatch(scene, woodTexture(), 'wood', x0, z0, w, d);

  // Kafe di ujung belakang: konter memanjang, kulkas, dan dua meja bar untuk ngobrol berdiri.
  const back = z0 + 0.9;
  const counter = solid(rbox(9, 1.9, 1.4), mats.white, x0 + 5, 0.95, back);
  scene.add(counter, solid(rbox(9.1, 0.14, 1.5, 0.03), mats.wood, x0 + 5, 1.97, back));
  scene.add(solid(rbox(0.9, 1.1, 0.8), mats.black, x0 + 2.4, 2.6, back - 0.1));
  scene.add(solid(new THREE.CylinderGeometry(0.14, 0.12, 0.24, 14), plastic('#f5cb18'), x0 + 2.4, 2.16, back + 0.45));
  scene.add(solid(rbox(0.8, 1.6, 0.8), mats.white, x0 + 7.4, 2.85, back - 0.1));
  scene.add(solid(new THREE.CylinderGeometry(0.34, 0.34, 0.7, 20), new THREE.MeshPhysicalMaterial({ color: '#7cc4ff', transparent: true, opacity: 0.6, roughness: 0.05 }), x0 + 7.4, 4.0, back - 0.1));
  const fridge = solid(rbox(1.6, 3.6, 1.3), plastic('#c9ccd1', { metalness: 0.3, roughness: 0.3 }), x0 + w - 1.6, 1.8, back);
  scene.add(fridge);
  parts.obstacles.push(counter, fridge);

  const spots = [];
  for (const bx of [x0 + 3.6, x0 + 9.4]) {
    const bz = z0 + 6.2;
    scene.add(solid(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 28), mats.wood, bx, 2.3, bz));
    scene.add(solid(new THREE.CylinderGeometry(0.08, 0.3, 2.25, 12), mats.frame, bx, 1.12, bz));
    parts.circles.push([bx, bz, 0.85]);
    // Berdiri di sekeliling meja bar, menghadap ke tengah; kursi bar mengisi sela-selanya.
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const x = bx + Math.sin(a) * 1.45;
      const z = bz + Math.cos(a) * 1.45;
      spots.push({ x, z, yaw: Math.atan2(bx - x, bz - z) });
      const stool = createStool();
      stool.position.set(bx + Math.sin(a + Math.PI / 4) * 1.3, 0, bz + Math.cos(a + Math.PI / 4) * 1.3);
      scene.add(stool);
    }
  }
  parts.pantry = { spots };

  const cafeSign = standingSign('Kafe', '#b98d5a');
  cafeSign.position.set(x0 + 1.6, 0, z0 + 10.2);
  scene.add(cafeSign);
  parts.obstacles.push(cafeSign);

  // Klaster lounge mengisi sisa panjang hub, dipisahkan tanaman.
  const seats = [];
  for (let cz = z0 + 12.5; cz + 10.5 <= z0 + d; cz += 13) {
    buildLoungeCluster(scene, x0, cz, w, parts, seats);
    const plant = createPlant(1.1);
    plant.position.set(x0 + 0.9, 0, cz + 11.5);
    scene.add(plant);
    parts.circles.push([plant.position.x, plant.position.z, 0.5]);
  }
  parts.lounge = { seats };

  const sign = standingSign('Lounge', '#a0522d');
  sign.position.set(x0 + 1.6, 0, z0 + 22.5);
  scene.add(sign);
  parts.obstacles.push(sign);
}

// ---------- Bangunan ----------

function buildShell(scene, layout, parts) {
  const { width: W, depth: D } = layout;
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, D), surface(tileTexture(), W, D));
  base.position.y = -0.25;
  base.receiveShadow = true;
  scene.add(base);

  // Dinding luar hanya di belakang dan kiri, seperti diorama yang dibuka ke arah kamera.
  // Puncaknya diberi deretan stud sebagai satu-satunya "tanda mainan" di bangunan.
  const t = 0.5;
  const back = solid(new THREE.BoxGeometry(W + t, WALL_HEIGHT, t), mats.wall, 0, WALL_HEIGHT / 2, -D / 2 - t / 2);
  const left = solid(new THREE.BoxGeometry(t, WALL_HEIGHT, D), mats.wall, -W / 2 - t / 2, WALL_HEIGHT / 2, 0);
  scene.add(back, left);
  parts.blockers.push(back, left);

  const studs = [];
  for (let x = -W / 2 + 0.5; x < W / 2; x += 1) studs.push([x, -D / 2 - t / 2]);
  for (let z = -D / 2 + 0.5; z < D / 2; z += 1) studs.push([-W / 2 - t / 2, z]);
  scene.add(studRow(studs, mats.wall, WALL_HEIGHT));

  // Jendela di dinding luar. Kacanya memakai satu material bersama yang kecerahannya
  // diatur siklus siang-malam (langit terang di siang hari, gelap di malam hari).
  const sky = new THREE.MeshStandardMaterial({ color: '#bcd9ef', emissive: '#bcd9ef', emissiveIntensity: 0.6, roughness: 0.1 });
  const addWindow = (x, z, alongX) => {
    const frame = solid(new THREE.BoxGeometry(alongX ? 3.8 : 0.08, 1.9, alongX ? 0.08 : 3.8), mats.frame, x, 1.95, z);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 3.5 : 0.1, 1.6, alongX ? 0.1 : 3.5), sky);
    glass.position.set(x, 1.95, z);
    const mullion = solid(new THREE.BoxGeometry(alongX ? 0.08 : 0.12, 1.6, alongX ? 0.12 : 0.08), mats.frame, x, 1.95, z);
    scene.add(frame, glass, mullion);
  };
  for (let x = -W / 2 + 4; x < W / 2 - 2; x += 6.5) addWindow(x, -D / 2 + 0.02, true);
  for (let z = -D / 2 + 17; z < D / 2 - 2; z += 6.5) addWindow(-W / 2 + 0.02, z, false);

  // Jam dinding yang menunjukkan waktu sungguhan, di atas kafe.
  const clock = clockTexture();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), new THREE.MeshStandardMaterial({ map: clock.texture, roughness: 0.4 }));
  face.position.set(layout.hub.x0 + layout.hub.w / 2, 2.55, -D / 2 + 0.06);
  const rim = solid(new THREE.TorusGeometry(0.78, 0.07, 10, 40), mats.black, face.position.x, face.position.y, face.position.z);
  scene.add(face, rim);

  parts.ambience = { sky, clock };
}

// Titik lampu ruangan untuk malam hari: di atas tiap divisi, ruangan, hub, dan resepsionis.
function lightSpots(layout) {
  const center = (a) => [a.x0 + a.w / 2, a.z0 + a.d / 2];
  const spots = [...layout.rooms, ...layout.zones, layout.reception].map(center);
  const { x0, z0, w, d } = layout.hub;
  for (let z = z0 + 6; z < z0 + d; z += 13) spots.push([x0 + w / 2, z]);
  return spots;
}

export function buildWorld(scene, layout, { name = 'MY Office' } = {}) {
  const parts = {
    width: layout.width,
    obstacles: [], // objek yang kotak pembatasnya dijadikan rintangan navigasi
    blockers: [], // dinding (kaca maupun luar)
    circles: [], // rintangan bundar [x, z, jari-jari]
    divisionDesks: new Map(),
    meetings: [],
    ceoDesk: null,
    pantry: null,
    lounge: null,
    ambience: null,
    lightSpots: lightSpots(layout),
  };
  buildShell(scene, layout, parts);
  for (const room of layout.rooms) buildRoom(scene, room, parts);
  for (const zone of layout.zones) buildDivision(scene, zone, parts);
  for (const planter of layout.planters) buildPlanter(scene, planter, parts);
  buildReception(scene, layout.reception, parts, name);
  buildHub(scene, layout.hub, parts);
  return parts;
}
