import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createMinifig, poseMinifig, plastic } from './minifig.js';
import { STATUS } from './agents.js';

const FLOOR = { w: 28, d: 20 };
const SEAT_HEIGHT = 1.34; // tinggi sendi pinggul saat duduk di kursi

const mats = {
  floor: plastic('#cfcecd', { roughness: 0.55 }),
  wood: plastic('#c9a26b', { roughness: 0.5 }),
  frame: plastic('#55595f'),
  black: plastic('#232323'),
  white: plastic('#efece6'),
  yellow: plastic('#f5cb18'),
  green: plastic('#3f9a4a'),
  rug: plastic('#2f6db5', { roughness: 0.7 }),
};

function solid(geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const rbox = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 2, r);

// Stud kecil di atas permukaan; dibuat instanced karena jumlahnya ratusan.
function studField(points, material, y) {
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.17, 20);
  const mesh = new THREE.InstancedMesh(geo, material, points.length);
  const m = new THREE.Matrix4();
  points.forEach(([x, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y + 0.085, z)));
  mesh.receiveShadow = true;
  return mesh;
}

function buildFloor(scene) {
  scene.add(solid(new THREE.BoxGeometry(FLOOR.w, 0.4, FLOOR.d), mats.floor, 0, -0.2, 0));
  const points = [];
  for (let x = -FLOOR.w / 2 + 0.5; x < FLOOR.w / 2; x++) {
    for (let z = -FLOOR.d / 2 + 0.5; z < FLOOR.d / 2; z++) points.push([x, z]);
  }
  scene.add(studField(points, mats.floor, 0));
}

// Dinding dari bata 2x1 yang disusun selang-seling seperti mainan sungguhan.
function buildWall(scene, { from, to, courses, axis }) {
  const geo = rbox(1.96, 1.18, 0.96, 0.04);
  const bricks = [];
  for (let c = 0; c < courses; c++) {
    const offset = c % 2 ? 1 : 0;
    for (let s = from + offset; s + 2 <= to + 0.01; s += 2) bricks.push({ s: s + 1, c });
  }
  const mesh = new THREE.InstancedMesh(geo, plastic('#ffffff'), bricks.length);
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  const studs = [];
  bricks.forEach(({ s, c }, i) => {
    const y = 0.59 + c * 1.2;
    const top = c === courses - 1;
    mesh.setMatrixAt(i, axis === 'x' ? m.makeTranslation(s, y, scene.userData.wallZ) : m.makeRotationY(Math.PI / 2).setPosition(scene.userData.wallX, y, s));
    mesh.setColorAt(i, color.set(top ? '#f5cb18' : (i * 7) % 5 === 0 ? '#e3ddd2' : '#f4f2ec'));
    if (top) for (const d of [-0.5, 0.5]) studs.push(axis === 'x' ? [s + d, scene.userData.wallZ] : [scene.userData.wallX, s + d]);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh, studField(studs, mats.yellow, courses * 1.2));
}

function createChair() {
  const g = new THREE.Group();
  g.add(solid(rbox(1.0, 0.18, 1.0), mats.black, 0, 0.95, 0));
  g.add(solid(rbox(1.0, 1.1, 0.16), mats.black, 0, 1.6, -0.55));
  g.add(solid(new THREE.CylinderGeometry(0.08, 0.08, 0.86, 10), mats.frame, 0, 0.43, 0));
  g.add(solid(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 20), mats.frame, 0, 0.04, 0));
  return g;
}

// Meja kerja lengkap; karakter duduk di titik asal grup dan menghadap +z.
function createDesk(width = 2.6) {
  const g = new THREE.Group();
  g.add(solid(rbox(width, 0.16, 1.5, 0.04), mats.wood, 0, 2.02, 1.25));
  for (const x of [-width / 2 + 0.15, width / 2 - 0.15]) {
    for (const z of [0.65, 1.85]) g.add(solid(new THREE.BoxGeometry(0.16, 1.94, 0.16), mats.frame, x, 0.97, z));
  }
  g.add(createChair());

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

  const mug = solid(new THREE.CylinderGeometry(0.13, 0.12, 0.26, 16), mats.white, -width / 2 + 0.4, 2.23, 1.0);
  g.add(mug);
  return { group: g, screenMat, lampMat };
}

function buildMeetingRoom(scene) {
  const room = new THREE.Group();
  room.position.set(9.5, 0, -5);
  room.add(solid(new THREE.BoxGeometry(6.4, 0.06, 6.4), mats.rug, 0, 0.03, 0));
  room.add(solid(new THREE.CylinderGeometry(1.7, 1.7, 0.16, 40), mats.wood, 0, 2.0, 0));
  room.add(solid(new THREE.CylinderGeometry(0.2, 0.3, 1.95, 16), mats.frame, 0, 0.98, 0));
  for (let i = 0; i < 4; i++) {
    const chair = createChair();
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    chair.position.set(Math.sin(a) * 2.4, 0, Math.cos(a) * 2.4);
    chair.rotation.y = a + Math.PI;
    room.add(chair);
  }
  // Papan tulis di dinding belakang.
  room.add(solid(rbox(4.2, 2.2, 0.14, 0.04), mats.white, 0, 3.6, -3.9));
  room.add(solid(new THREE.BoxGeometry(4.4, 0.12, 0.3), mats.frame, 0, 2.45, -3.85));
  scene.add(room);
}

function buildPantry(scene) {
  const p = new THREE.Group();
  p.position.set(10, 0, 5.5);
  p.add(solid(rbox(5, 1.9, 1.4), mats.white, 0, 0.95, 1.6));
  p.add(solid(rbox(5.1, 0.14, 1.5, 0.03), mats.wood, 0, 1.97, 1.6));
  // Mesin kopi
  p.add(solid(rbox(0.9, 1.1, 0.8), mats.black, -1.4, 2.6, 1.7));
  p.add(solid(new THREE.CylinderGeometry(0.14, 0.12, 0.24, 14), mats.yellow, -1.4, 2.16, 1.25));
  // Dispenser air
  p.add(solid(rbox(0.8, 1.6, 0.8), mats.white, 1.6, 2.85, 1.7));
  p.add(solid(new THREE.CylinderGeometry(0.34, 0.34, 0.7, 20), new THREE.MeshPhysicalMaterial({ color: '#7cc4ff', transparent: true, opacity: 0.6, roughness: 0.05 }), 1.6, 4.0, 1.7));
  // Tanaman
  p.add(solid(new THREE.CylinderGeometry(0.45, 0.35, 0.8, 18), mats.frame, -3.4, 0.4, -1.8));
  [[0, 1.2, 0, 0.55], [0.25, 1.75, 0.1, 0.42], [-0.2, 1.65, -0.15, 0.4], [0.05, 2.15, 0, 0.32]].forEach(([x, y, z, r]) =>
    p.add(solid(new THREE.SphereGeometry(r, 16, 12), mats.green, -3.4 + x, y, -1.8 + z)));
  // Meja bundar kecil
  p.add(solid(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 28), mats.wood, 0, 1.6, -1.6));
  p.add(solid(new THREE.CylinderGeometry(0.1, 0.25, 1.55, 12), mats.frame, 0, 0.78, -1.6));
  scene.add(p);
}

function zoneSign(scene, text, x, z) {
  const el = document.createElement('div');
  el.className = 'zone';
  el.textContent = text;
  const sign = new CSS2DObject(el);
  sign.position.set(x, 0.3, z);
  scene.add(sign);
}

function createLabel(style) {
  const el = document.createElement('div');
  el.className = 'tag';
  el.innerHTML = '<span class="bang">!</span><span class="zz">z<i>z</i></span><span class="role"></span><span class="state"></span><span class="detail"></span>';
  el.querySelector('.role').textContent = style.label;
  el.style.setProperty('--accent', style.accent);
  return el;
}

export function createOffice(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b8b7b8');
  scene.userData = { wallZ: -FLOOR.d / 2 + 0.5, wallX: -FLOOR.w / 2 + 0.5 };

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'labels';
  container.appendChild(labels.domElement);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const focus = new THREE.Vector3(0, 1.5, -1);
  camera.position.copy(focus).add(new THREE.Vector3(17, 19, 24));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(focus);
  controls.enableDamping = true;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = 1.2;
  controls.minAzimuthAngle = -0.25;
  controls.maxAzimuthAngle = 1.3;
  controls.minZoom = 0.6;
  controls.maxZoom = 3;
  controls.screenSpacePanning = true;

  scene.add(new THREE.HemisphereLight('#ffffff', '#8d8a86', 1.5));
  const sun = new THREE.DirectionalLight('#fff6e8', 2.4);
  sun.position.set(10, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  buildFloor(scene);
  buildWall(scene, { from: -FLOOR.w / 2, to: FLOOR.w / 2, courses: 2, axis: 'x' });
  buildWall(scene, { from: -FLOOR.d / 2 + 1, to: FLOOR.d / 2, courses: 2, axis: 'z' });
  buildMeetingRoom(scene);
  buildPantry(scene);
  zoneSign(scene, 'Ruang Rapat', 9.5, -1.4);
  zoneSign(scene, 'Pantry', 10, 2.6);

  // Posisi meja: PM di belakang, tiga peran tetap di baris tengah, sisanya meja cadangan.
  const layout = {
    main: [-4, -6.5, 3.2],
    backend: [-9, -1],
    frontend: [-4, -1],
    qa: [1, -1],
  };
  const spareSpot = (i) => [-9 + (i % 3) * 5, 4.5 + Math.floor(i / 3) * 3.8];
  const desks = new Map();
  const spares = [];

  function placeDesk([x, z, width]) {
    const desk = createDesk(width);
    desk.group.position.set(x, 0, z);
    // Karakter menghadap +x: kamera melihat wajahnya dari samping depan, tidak terhalang laptop.
    desk.group.rotation.y = Math.PI / 2;
    scene.add(desk.group);
    return desk;
  }

  for (const [key, spot] of Object.entries(layout)) desks.set(key, placeDesk(spot));
  for (let i = 0; i < 3; i++) spares.push(placeDesk(spareSpot(i)));

  const workers = new Map();

  function deskFor(key) {
    if (desks.has(key)) return desks.get(key);
    const used = desks.size - Object.keys(layout).length;
    const desk = spares.shift() ?? placeDesk(spareSpot(used));
    desks.set(key, desk);
    return desk;
  }

  function ensureWorker(agent) {
    if (workers.has(agent.key)) return workers.get(agent.key);
    const desk = deskFor(agent.key);
    const fig = createMinifig(agent.style, workers.size + 3);
    fig.position.y = SEAT_HEIGHT;
    desk.group.add(fig);

    const el = createLabel(agent.style);
    const label = new CSS2DObject(el);
    label.position.y = 2.85;
    fig.add(label);

    // Karakter baru "dijatuhkan" ke kursinya seperti balok yang dipasang.
    const worker = { fig, desk, el, drop: 6, vel: 0, last: '' };
    workers.set(agent.key, worker);
    return worker;
  }

  function syncWorker(worker, agent, t, dt) {
    if (worker.drop !== 0) {
      worker.vel -= 40 * dt;
      worker.drop += worker.vel * dt;
      if (worker.drop <= 0) {
        worker.drop = 0;
        worker.vel = Math.abs(worker.vel) > 3 ? -worker.vel * 0.3 : 0;
        if (worker.vel > 0) worker.drop = 0.0001;
      }
      worker.fig.position.y = SEAT_HEIGHT + worker.drop;
    }

    poseMinifig(worker.fig, agent.status, t, dt);

    const color = STATUS[agent.status].color;
    const on = agent.status !== 'asleep';
    worker.desk.lampMat.color.set(on ? color : '#444');
    worker.desk.lampMat.emissive.set(on ? color : '#000');
    worker.desk.screenMat.emissive.set(on ? color : '#000').multiplyScalar(on ? 0.6 : 0);

    const signature = `${agent.status}|${agent.detail}|${agent.alert}`;
    if (signature !== worker.last) {
      worker.last = signature;
      worker.el.querySelector('.state').textContent = STATUS[agent.status].text;
      worker.el.querySelector('.detail').textContent = agent.detail;
      worker.el.dataset.status = agent.status;
      worker.el.classList.toggle('alert', agent.alert);
    }
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    const aspect = w / h;
    // Seluruh lantai tetap muat baik di layar lebar maupun ponsel.
    const viewH = Math.max(21, 34 / aspect);
    Object.assign(camera, { left: (-viewH * aspect) / 2, right: (viewH * aspect) / 2, top: viewH / 2, bottom: -viewH / 2 });
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labels.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  const timer = new THREE.Timer();
  function render(agents) {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    for (const agent of agents.values()) syncWorker(ensureWorker(agent), agent, t, dt);
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  return { render };
}
