import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createMinifig, poseMinifig, plastic } from './minifig.js';
import { STATUS } from './agents.js';
import { createNav } from './nav.js';

const FLOOR = { w: 28, d: 20 };
const SEAT_HEIGHT = 1.34; // tinggi sendi pinggul saat duduk di kursi
const STAND_HEIGHT = 1.11; // tinggi sendi pinggul saat berdiri
const WALK_SPEED = 3.6; // satuan per detik
const MEETING_MS = 4500; // lama berdiri melapor di ruang rapat, dihitung sejak tiba

const CHATTER = [
  'Kopi dulu ☕',
  'Build-nya hijau semua 🎉',
  'Siapa yang push hari Jumat?',
  'Nanti rapat jam berapa?',
  'Bug kemarin sudah beres 👍',
  'Nunggu tugas dari PM nih',
];

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
  const chairs = [];
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
    chairs.push(chair);
  }
  // Papan tulis di dinding belakang.
  room.add(solid(rbox(4.2, 2.2, 0.14, 0.04), mats.white, 0, 3.6, -3.9));
  room.add(solid(new THREE.BoxGeometry(4.4, 0.12, 0.3), mats.frame, 0, 2.45, -3.85));
  scene.add(room);
  return { center: [room.position.x, room.position.z], chairs };
}

// Pantry: titik asal grup = meja bundar. Konter berada di belakang (sisi -z)
// supaya tidak menutupi karakter yang beristirahat dari sudut kamera.
function buildPantry(scene) {
  const p = new THREE.Group();
  p.position.set(10, 0, 4.8);
  const counter = solid(rbox(5, 1.9, 1.4), mats.white, 0, 0.95, -3.5);
  p.add(counter);
  p.add(solid(rbox(5.1, 0.14, 1.5, 0.03), mats.wood, 0, 1.97, -3.5));
  // Mesin kopi
  p.add(solid(rbox(0.9, 1.1, 0.8), mats.black, -1.4, 2.6, -3.6));
  p.add(solid(new THREE.CylinderGeometry(0.14, 0.12, 0.24, 14), mats.yellow, -1.4, 2.16, -3.05));
  // Dispenser air
  p.add(solid(rbox(0.8, 1.6, 0.8), mats.white, 1.6, 2.85, -3.6));
  p.add(solid(new THREE.CylinderGeometry(0.34, 0.34, 0.7, 20), new THREE.MeshPhysicalMaterial({ color: '#7cc4ff', transparent: true, opacity: 0.6, roughness: 0.05 }), 1.6, 4.0, -3.6));
  // Tanaman di ujung konter
  p.add(solid(new THREE.CylinderGeometry(0.45, 0.35, 0.8, 18), mats.frame, -3.6, 0.4, -3.4));
  [[0, 1.2, 0, 0.55], [0.25, 1.75, 0.1, 0.42], [-0.2, 1.65, -0.15, 0.4], [0.05, 2.15, 0, 0.32]].forEach(([x, y, z, r]) =>
    p.add(solid(new THREE.SphereGeometry(r, 16, 12), mats.green, -3.6 + x, y, -3.4 + z)));
  // Meja bundar kecil
  p.add(solid(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 28), mats.wood, 0, 1.6, 0));
  p.add(solid(new THREE.CylinderGeometry(0.1, 0.25, 1.55, 12), mats.frame, 0, 0.78, 0));
  scene.add(p);
  return { counter, table: [p.position.x, p.position.z], plant: [p.position.x - 3.6, p.position.z - 3.4] };
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
  el.innerHTML = '<span class="bubble"><i></i></span><span class="bang">!</span><span class="zz">z<i>z</i></span><span class="role"></span><span class="state"></span><span class="detail"></span>';
  el.querySelector('.role').textContent = style.label;
  el.style.setProperty('--accent', style.accent);
  return el;
}

// maxDelta membatasi langkah waktu per frame agar animasi tidak melompat setelah tab tertunda.
export function createOffice(container, { maxDelta = 0.05 } = {}) {
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
  const focus = new THREE.Vector3(2, 1.5, 0);
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
  const meeting = buildMeetingRoom(scene);
  const pantry = buildPantry(scene);
  zoneSign(scene, 'Ruang Rapat', 9.5, -1.4);
  zoneSign(scene, 'Pantry', 10, 7.9);

  // PM di pojok belakang. Tim duduk di satu blok meja: baris A menghadap +x (wajah terlihat
  // kamera), baris B di seberangnya menghadap -x, punggung meja saling menempel.
  const ROW_A = -5;
  const ROW_B = ROW_A + 4;
  const COLS = [-2.1, 0.5, 3.1];
  const layout = {
    main: [-11.5, -7, 3.2, 1],
    backend: [ROW_A, COLS[0], 2.6, 1],
    frontend: [ROW_A, COLS[1], 2.6, 1],
    qa: [ROW_A, COLS[2], 2.6, 1],
  };
  // Meja cadangan mengisi baris B dulu, lalu blok diperpanjang bergantian di kedua baris.
  const spareSpot = (i) => {
    if (i < 3) return [ROW_B, COLS[i], 2.6, -1];
    const col = 3 + Math.floor((i - 3) / 2);
    return (i - 3) % 2 ? [ROW_A, COLS[0] + col * 2.6, 2.6, 1] : [ROW_B, COLS[0] + col * 2.6, 2.6, -1];
  };
  const desks = new Map();
  const spares = [];

  let nav = null;
  const box = new THREE.Box3();
  const blockObject = (obj) => {
    obj.updateMatrixWorld(true);
    nav.blockBox(box.setFromObject(obj));
  };

  function placeDesk([x, z, width, facing]) {
    const desk = createDesk(width);
    desk.group.position.set(x, 0, z);
    desk.group.rotation.y = (facing * Math.PI) / 2;
    scene.add(desk.group);
    if (nav) blockObject(desk.group); // meja tambahan yang dibuat setelah navigasi siap
    return desk;
  }

  for (const [key, spot] of Object.entries(layout)) desks.set(key, placeDesk(spot));
  for (let i = 0; i < 3; i++) spares.push(placeDesk(spareSpot(i)));

  // --- Navigasi: tandai semua perabot sebagai rintangan ---
  scene.updateMatrixWorld(true);
  nav = createNav(FLOOR.w, FLOOR.d);
  nav.blockWhere((x, z) => x < -12.6 || z < -8.6 || x > FLOOR.w / 2 - 0.4 || z > FLOOR.d / 2 - 0.4);
  for (const desk of [...desks.values(), ...spares]) blockObject(desk.group);
  nav.blockCircle(...meeting.center, 1.7);
  meeting.chairs.forEach(blockObject);
  blockObject(pantry.counter);
  nav.blockCircle(...pantry.table, 0.9);
  nav.blockCircle(...pantry.plant, 0.6);

  // Tempat berdiri: mengelilingi meja rapat dan meja bundar pantry, menghadap ke tengah.
  function ring([cx, cz], radius, angles) {
    return angles.map((a) => {
      const x = cx + Math.sin(a) * radius;
      const z = cz + Math.cos(a) * radius;
      return { x, z, yaw: Math.atan2(cx - x, cz - z), owner: null };
    });
  }
  const quarter = [0, 1, 2, 3].map((i) => (i * Math.PI) / 2);
  const spots = {
    meeting: [...ring(meeting.center, 2.75, quarter), ...ring(meeting.center, 3.6, quarter.map((a) => a + Math.PI / 4))],
    // Urutan sudut berselang-seling supaya beberapa karakter pertama tersebar merata.
    pantry: ring(pantry.table, 1.9, [0, 2, 4, 1, 3, 5].map((i) => (i * Math.PI) / 3 + Math.PI / 6)),
  };

  function claimSpot(place, worker) {
    release(worker);
    const list = spots[place];
    const spot = list.find((s) => !s.owner) ?? list[workers.size % list.length];
    spot.owner = worker;
    worker.spot = spot;
    return spot;
  }

  function release(worker) {
    if (worker.spot?.owner === worker) worker.spot.owner = null;
    worker.spot = null;
  }

  const seatOf = (desk) => ({ x: desk.group.position.x, z: desk.group.position.z, yaw: desk.group.rotation.y, sit: 1 });
  // Titik berdiri di belakang kursi, tempat karakter mulai duduk atau selesai berdiri.
  const accessOf = (desk) => {
    const v = desk.group.localToWorld(new THREE.Vector3(0, 0, -1.7));
    return { x: v.x, z: v.z, yaw: desk.group.rotation.y, sit: 0 };
  };
  const stateOf = (w) => ({ x: w.x, z: w.z, yaw: w.yaw, sit: w.sit });

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
    scene.add(fig);

    const el = createLabel(agent.style);
    const label = new CSS2DObject(el);
    label.position.y = 2.85;
    fig.add(label);

    // Karakter baru "dijatuhkan" langsung di tempatnya seperti balok yang dipasang.
    const worker = { fig, desk, el, drop: 6, vel: 0, last: '', steps: [], phase: 0, walking: false, spot: null, chatter: null, say: null, meetingUntil: 0 };
    const start = agent.place === 'desk' ? seatOf(desk) : claimSpot(agent.place, worker);
    Object.assign(worker, { x: start.x, z: start.z, yaw: start.yaw, sit: agent.place === 'desk' ? 1 : 0, goal: agent.place });
    workers.set(agent.key, worker);
    return worker;
  }

  function plan(worker, place) {
    worker.goal = place;
    // Transisi duduk/berdiri yang sedang berjalan diselesaikan dulu agar gerakan tidak patah.
    const keep = worker.steps[0]?.kind === 'tween' ? [worker.steps[0]] : [];
    worker.steps = keep;
    let from = keep.length ? keep[0].to : stateOf(worker);

    if (from.sit > 0.5) {
      const up = accessOf(worker.desk);
      worker.steps.push({ kind: 'tween', to: up, dur: 0.45 });
      from = up;
    }

    const target = place === 'desk' ? accessOf(worker.desk) : claimSpot(place, worker);
    if (place === 'desk') release(worker);
    if (Math.hypot(target.x - from.x, target.z - from.z) > 0.05) {
      worker.steps.push({ kind: 'walk', points: nav.path([from.x, from.z], [target.x, target.z]) });
    }
    worker.steps.push(place === 'desk' ? { kind: 'tween', to: seatOf(worker.desk), dur: 0.45 } : { kind: 'turn', yaw: target.yaw });
  }

  const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const ease = (t) => t * t * (3 - 2 * t);

  function advance(worker, dt) {
    worker.walking = false;
    const step = worker.steps[0];
    if (!step) return;

    if (step.kind === 'tween') {
      step.from ??= stateOf(worker);
      step.t = Math.min(1, (step.t ?? 0) + dt / step.dur);
      const k = ease(step.t);
      worker.x = step.from.x + (step.to.x - step.from.x) * k;
      worker.z = step.from.z + (step.to.z - step.from.z) * k;
      worker.yaw = step.from.yaw + angleDiff(step.from.yaw, step.to.yaw) * k;
      worker.sit = step.from.sit + (step.to.sit - step.from.sit) * k;
      if (step.t >= 1) worker.steps.shift();
    } else if (step.kind === 'walk') {
      let budget = WALK_SPEED * dt;
      let heading = worker.yaw;
      while (budget > 0 && step.points.length) {
        const [tx, tz] = step.points[0];
        const dx = tx - worker.x;
        const dz = tz - worker.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-3) heading = Math.atan2(dx, dz);
        if (d <= budget) {
          worker.x = tx;
          worker.z = tz;
          budget -= d;
          step.points.shift();
        } else {
          worker.x += (dx / d) * budget;
          worker.z += (dz / d) * budget;
          budget = 0;
        }
      }
      worker.yaw += angleDiff(worker.yaw, heading) * (1 - Math.exp(-dt * 12));
      worker.walking = true;
      worker.phase += dt * 11;
      if (!step.points.length) worker.steps.shift();
    } else if (step.kind === 'turn') {
      worker.yaw += angleDiff(worker.yaw, step.yaw) * (1 - Math.exp(-dt * 10));
      if (Math.abs(angleDiff(worker.yaw, step.yaw)) < 0.02) worker.steps.shift();
    }
  }

  // Tempat yang dituju tampilan. Rapat dihitung sejak karakter tiba di ruang rapat,
  // karena perjalanan dari meja bisa lebih lama daripada jeda antar event.
  function effectivePlace(worker, agent, now) {
    if (agent.place !== 'meeting') {
      worker.meetingUntil = 0;
      return agent.place;
    }
    const arrived = worker.goal === 'meeting' && !worker.steps.length;
    if (arrived && !worker.meetingUntil) {
      worker.meetingUntil = now + MEETING_MS;
      worker.say = { text: agent.report, until: worker.meetingUntil };
    }
    return agent.reportDone && worker.meetingUntil && now >= worker.meetingUntil ? 'pantry' : 'meeting';
  }

  function bubbleText(worker, agent, now, dt) {
    if (agent.bubble) return agent.bubble.text;
    if (worker.say && now < worker.say.until) return worker.say.text;
    // Obrolan ringan sesekali saat beristirahat di pantry.
    const idle = worker.goal === 'pantry' && agent.status === 'asleep' && !worker.steps.length;
    if (worker.chatter && (now > worker.chatter.until || !idle)) worker.chatter = null;
    if (!worker.chatter && idle && Math.random() < dt / 20) {
      worker.chatter = { text: CHATTER[Math.floor(Math.random() * CHATTER.length)], until: now + 4000 };
    }
    return worker.chatter?.text ?? '';
  }

  function syncWorker(worker, agent, t, dt) {
    const now = Date.now();
    const place = effectivePlace(worker, agent, now);
    if (place !== worker.goal) plan(worker, place);
    // Selama di ruang rapat karakter tetap tampil melapor walau subagent sudah berhenti.
    const status = place === 'meeting' ? 'reporting' : agent.status;
    advance(worker, dt);

    if (worker.drop !== 0) {
      worker.vel -= 40 * dt;
      worker.drop += worker.vel * dt;
      if (worker.drop <= 0) {
        worker.drop = 0;
        worker.vel = Math.abs(worker.vel) > 3 ? -worker.vel * 0.3 : 0;
        if (worker.vel > 0) worker.drop = 0.0001;
      }
    }
    const bob = worker.walking ? Math.abs(Math.sin(worker.phase)) * 0.08 : 0;
    const base = STAND_HEIGHT + (SEAT_HEIGHT - STAND_HEIGHT) * worker.sit;
    worker.fig.position.set(worker.x, base + worker.drop + bob, worker.z);
    worker.fig.rotation.y = worker.yaw;

    poseMinifig(worker.fig, status, t, dt, { sit: worker.sit, walking: worker.walking, phase: worker.phase });

    const color = STATUS[status].color;
    const on = status !== 'asleep';
    worker.desk.lampMat.color.set(on ? color : '#444');
    worker.desk.lampMat.emissive.set(on ? color : '#000');
    worker.desk.screenMat.emissive.set(on ? color : '#000').multiplyScalar(on ? 0.6 : 0);

    const bubble = bubbleText(worker, agent, now, dt);
    const signature = `${status}|${agent.detail}|${agent.alert}|${place}|${bubble}`;
    if (signature !== worker.last) {
      worker.last = signature;
      worker.el.querySelector('.state').textContent = STATUS[status].text;
      worker.el.querySelector('.detail').textContent = agent.detail;
      worker.el.querySelector('.bubble i').textContent = bubble;
      worker.el.classList.toggle('talking', Boolean(bubble));
      worker.el.dataset.status = status;
      worker.el.dataset.place = place;
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
    const dt = Math.min(timer.getDelta(), maxDelta);
    const t = timer.getElapsed();
    for (const agent of agents.values()) syncWorker(ensureWorker(agent), agent, t, dt);
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  return { render };
}
