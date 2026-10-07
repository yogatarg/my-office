import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { plastic } from './minifig.js';
import { tileTexture, carpetTexture, woodTexture, signTexture } from './textures.js';

// Membangun isi kantor dari hasil computeLayout(). Gaya: permukaan datar bertekstur halus,
// stud hanya sebagai detail (puncak dinding), warna dasar netral seperti kantor sungguhan.

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
function floorPatch(scene, texture, finish, x0, z0, w, d, inset = 0.2) {
  const patch = new THREE.Mesh(new THREE.BoxGeometry(w - inset * 2, 0.04, d - inset * 2), surface(texture, w, d, finish));
  patch.position.set(x0 + w / 2, 0.02, z0 + d / 2);
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

function createSofa() {
  const g = new THREE.Group();
  g.add(solid(rbox(3.4, 0.7, 1.4), mats.leather, 0, 0.6, 0));
  g.add(solid(rbox(3.4, 1.0, 0.35), mats.leather, 0, 1.3, -0.55));
  for (const s of [-1, 1]) g.add(solid(rbox(0.35, 0.95, 1.4), mats.leather, s * 1.7, 0.85, 0));
  return g;
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

// Totem papan nama berdiri di pojok depan zona, sedikit diputar ke arah kamera.
function standingSign(name, color) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(solid(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8), mats.metal, s * 1.1, 0.75, 0));
  const board = signBoard(name, color);
  board.position.y = 1.7;
  g.add(board);
  g.rotation.y = 0.6;
  return g;
}

// ---------- Ruang kaca ----------

// Dinding kaca dari a ke b (sejajar sumbu), dengan celah pintu opsional di tengah.
function glassWall(scene, blockers, [ax, az], [bx, bz], door = 0) {
  const along = ax === bx ? 'z' : 'x';
  const length = along === 'x' ? bx - ax : bz - az;
  const segments = door ? [[0, (length - door) / 2], [(length + door) / 2, length]] : [[0, length]];
  for (const [s0, s1] of segments) {
    const len = s1 - s0;
    const mid = (s0 + s1) / 2;
    const cx = along === 'x' ? ax + mid : ax;
    const cz = along === 'x' ? az : az + mid;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len : 0.08, WALL_HEIGHT - 0.2, along === 'x' ? 0.08 : len), mats.glass);
    pane.position.set(cx, WALL_HEIGHT / 2, cz);
    pane.renderOrder = 1;
    scene.add(pane);
    blockers.push(pane);
    // Rangka aluminium: rel atas-bawah dan tiang setiap ±3 satuan.
    for (const y of [0.05, WALL_HEIGHT - 0.05]) {
      scene.add(solid(new THREE.BoxGeometry(along === 'x' ? len : 0.14, 0.1, along === 'x' ? 0.14 : len), mats.metal, cx, y, cz));
    }
    const posts = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= posts; i++) {
      const p = s0 + (len * i) / posts;
      scene.add(solid(new THREE.BoxGeometry(0.12, WALL_HEIGHT, 0.12), mats.metal, along === 'x' ? ax + p : ax, WALL_HEIGHT / 2, along === 'x' ? az : az + p));
    }
  }
}

function buildRoom(scene, room, parts) {
  const { x0, z0, w, d } = room;
  if (room.kind === 'ceo') floorPatch(scene, woodTexture(), 'wood', x0, z0, w, d, 0.1);
  else floorPatch(scene, carpetTexture('#59606b'), 'carpet', x0, z0, w, d, 0.1);

  glassWall(scene, parts.blockers, [x0, z0 + d], [x0 + w, z0 + d], 2.4);
  if (x0 > -parts.width / 2 + 0.1) glassWall(scene, parts.blockers, [x0, z0], [x0, z0 + d]);

  const plate = signBoard(room.name, room.kind === 'ceo' ? '#141414' : '#59606b', 2.6);
  plate.position.set(x0 + w / 2, WALL_HEIGHT + 0.5, z0 + d);
  scene.add(plate);

  if (room.kind === 'ceo') {
    // Meja eksekutif menghadap +x (wajah CEO terlihat kamera), sofa di seberang ruangan.
    const desk = createDesk({ width: 3.6, top: mats.darkWood, chair: mats.leather });
    desk.group.position.set(x0 + 4, 0, z0 + d / 2);
    desk.group.rotation.y = Math.PI / 2;
    scene.add(desk.group);
    parts.ceoDesk = desk;
    parts.obstacles.push(desk.group);

    const sofa = createSofa();
    sofa.position.set(x0 + w - 1.6, 0, z0 + d / 2);
    sofa.rotation.y = -Math.PI / 2;
    scene.add(sofa);
    parts.obstacles.push(sofa);

    const shelf = createBookshelf(Math.min(5, w - 6));
    shelf.position.set(x0 + w / 2 + 1, 0, z0 + 0.6);
    scene.add(shelf);
    parts.obstacles.push(shelf);

    const plant = createPlant();
    plant.position.set(x0 + 0.9, 0, z0 + 0.9);
    scene.add(plant);
    parts.circles.push([plant.position.x, plant.position.z, 0.5]);
    return;
  }

  // Ruang rapat: meja bundar di tengah, kursi berselang di sekelilingnya, papan tulis di belakang.
  const cx = x0 + w / 2;
  const cz = z0 + d / 2;
  scene.add(solid(new THREE.CylinderGeometry(1.7, 1.7, 0.16, 40), mats.wood, cx, 2.0, cz));
  scene.add(solid(new THREE.CylinderGeometry(0.2, 0.3, 1.95, 16), mats.frame, cx, 0.98, cz));
  for (let i = 0; i < 4; i++) {
    const chair = createChair();
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    chair.position.set(cx + Math.sin(a) * 2.4, 0, cz + Math.cos(a) * 2.4);
    chair.rotation.y = a + Math.PI;
    scene.add(chair);
    parts.obstacles.push(chair);
  }
  scene.add(solid(rbox(4.2, 2.0, 0.12, 0.04), mats.white, cx, 2.6, z0 + 0.35));
  scene.add(solid(new THREE.BoxGeometry(4.4, 0.1, 0.25), mats.frame, cx, 1.55, z0 + 0.4));
  parts.meetings.push({ center: [cx, cz] });
  parts.circles.push([cx, cz, 1.7]);
}

// ---------- Zona ----------

function buildDivision(scene, zone, parts) {
  floorPatch(scene, carpetTexture(zone.color), 'carpet', zone.x0, zone.z0, zone.w, zone.d);
  const desks = zone.slots.map((slot) => {
    const desk = createDesk();
    desk.group.position.set(slot.x, 0, slot.z);
    desk.group.rotation.y = (slot.facing * Math.PI) / 2;
    scene.add(desk.group);
    parts.obstacles.push(desk.group);
    return desk;
  });
  parts.divisionDesks.set(zone.id, desks);

  const sign = standingSign(zone.name, zone.color);
  sign.position.set(zone.x0 + 1.6, 0, zone.z0 + zone.d - 0.5);
  scene.add(sign);
  parts.obstacles.push(sign);

  const plant = createPlant(0.9);
  plant.position.set(zone.x0 + zone.w - 0.7, 0, zone.z0 + 0.7);
  scene.add(plant);
  parts.circles.push([plant.position.x, plant.position.z, 0.45]);
}

function buildPantry(scene, zone, parts) {
  floorPatch(scene, woodTexture(), 'wood', zone.x0, zone.z0, zone.w, zone.d);
  const cx = zone.x0 + zone.w / 2;
  const back = zone.z0 + 1.0;

  // Konter di sisi belakang zona agar tidak menutupi karakter dari sudut kamera.
  const counter = solid(rbox(6, 1.9, 1.4), mats.white, cx, 0.95, back);
  scene.add(counter, solid(rbox(6.1, 0.14, 1.5, 0.03), mats.wood, cx, 1.97, back));
  scene.add(solid(rbox(0.9, 1.1, 0.8), mats.black, cx - 1.6, 2.6, back - 0.1));
  scene.add(solid(new THREE.CylinderGeometry(0.14, 0.12, 0.24, 14), plastic('#f5cb18'), cx - 1.6, 2.16, back + 0.45));
  scene.add(solid(rbox(0.8, 1.6, 0.8), mats.white, cx + 1.8, 2.85, back - 0.1));
  scene.add(solid(new THREE.CylinderGeometry(0.34, 0.34, 0.7, 20), new THREE.MeshPhysicalMaterial({ color: '#7cc4ff', transparent: true, opacity: 0.6, roughness: 0.05 }), cx + 1.8, 4.0, back - 0.1));
  parts.obstacles.push(counter);

  const table = [cx, zone.z0 + zone.d / 2 + 0.6];
  scene.add(solid(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 28), mats.wood, table[0], 1.6, table[1]));
  scene.add(solid(new THREE.CylinderGeometry(0.1, 0.25, 1.55, 12), mats.frame, table[0], 0.78, table[1]));
  parts.circles.push([...table, 0.9]);
  parts.pantry = { table };

  const plant = createPlant();
  plant.position.set(zone.x0 + 0.6, 0, back);
  scene.add(plant);
  parts.circles.push([plant.position.x, plant.position.z, 0.5]);

  const sign = standingSign(zone.name, '#b98d5a');
  sign.position.set(zone.x0 + 1.6, 0, zone.z0 + zone.d - 0.5);
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
}

export function buildWorld(scene, layout) {
  const parts = {
    width: layout.width,
    obstacles: [], // objek yang kotak pembatasnya dijadikan rintangan navigasi
    blockers: [], // dinding (kaca maupun luar)
    circles: [], // rintangan bundar [x, z, jari-jari]
    divisionDesks: new Map(),
    meetings: [],
    ceoDesk: null,
    pantry: null,
  };
  buildShell(scene, layout, parts);
  for (const room of layout.rooms) buildRoom(scene, room, parts);
  for (const zone of layout.zones) {
    if (zone.kind === 'pantry') buildPantry(scene, zone, parts);
    else buildDivision(scene, zone, parts);
  }
  return parts;
}
