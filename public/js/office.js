import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMinifig, poseMinifig } from './minifig.js';
import { STATUS } from './agents.js';
import { createNav } from './nav.js';
import { computeLayout } from './layout.js';
import { buildWorld } from './world.js';

const SEAT_HEIGHT = 1.34; // tinggi sendi pinggul saat duduk di kursi
const STAND_HEIGHT = 1.11; // tinggi sendi pinggul saat berdiri
const WALK_SPEED = 3.6; // satuan per detik
const MEETING_MS = 4500; // lama berdiri melapor di ruang rapat, dihitung sejak tiba
const CAMERA_DIR = new THREE.Vector3(17, 19, 24).normalize();

// Preset kualitas. "high" menambah ambient occlusion, bayangan tajam-halus, dan resolusi penuh.
export const QUALITY = {
  high: { label: 'Tinggi', ao: true, pixelRatio: 2, shadowMap: 4096, shadowRadius: 3 },
  low: { label: 'Ringan', ao: false, pixelRatio: 1, shadowMap: 2048, shadowRadius: 1 },
};

const CHATTER = [
  'Kopi dulu ☕',
  'Build-nya hijau semua 🎉',
  'Siapa yang push hari Jumat?',
  'Nanti rapat jam berapa?',
  'Bug kemarin sudah beres 👍',
  'Habis ini balik ke meja',
];

function createLabel(style) {
  const el = document.createElement('div');
  el.className = 'tag';
  el.innerHTML = '<span class="bubble"><i></i></span><span class="bang">!</span><span class="role"></span><span class="state"></span><span class="detail"></span>';
  el.querySelector('.role').textContent = style.label;
  el.style.setProperty('--accent', style.accent);
  return el;
}

// maxDelta membatasi langkah waktu per frame agar animasi tidak melompat setelah tab tertunda.
export function createOffice(container, config, { maxDelta = 0.05, quality = 'high' } = {}) {
  const layout = computeLayout(config);
  const radius = Math.hypot(layout.width, layout.depth) / 2;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c9cbcd');

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

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 6);
  const focus = new THREE.Vector3(0, 1.5, 0);
  camera.position.copy(focus).addScaledVector(CAMERA_DIR, radius * 2.5);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(focus);
  controls.enableDamping = true;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = 1.2;
  controls.minAzimuthAngle = -0.25;
  controls.maxAzimuthAngle = 1.3;
  controls.minZoom = 0.8;
  controls.maxZoom = 6;
  controls.screenSpacePanning = true;

  // Pantulan lingkungan: ruangan terang generik, membuat plastik dan kaca tampak berkilap nyata.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();

  // Cahaya utama hangat dari arah jendela, cahaya isi sejuk dari sisi berlawanan.
  scene.add(new THREE.HemisphereLight('#f4f6ff', '#8a8378', 0.45));
  const sun = new THREE.DirectionalLight('#fff1dc', 3.4);
  // Matahari agak rendah dari kanan agar bayangan cukup panjang dan jatuh menjauhi kamera.
  sun.position.set(radius * 0.85, radius * 0.65, radius * 0.2);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius, near: 1, far: radius * 3 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#dbe6ff', 0.35);
  fill.position.set(-radius * 0.6, radius * 0.5, -radius * 0.2);
  scene.add(fill);

  // Pascaproses: ambient occlusion menggelapkan sudut dan sambungan (kunci kesan "nyata"),
  // lalu OutputPass menerapkan tone mapping dan ruang warna.
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, 1, 1);
  ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  ao.blendIntensity = 0.9;
  composer.addPass(ao);
  composer.addPass(new OutputPass());

  let preset = QUALITY[quality] ?? QUALITY.high;
  function setQuality(name) {
    preset = QUALITY[name] ?? QUALITY.high;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio));
    sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
    sun.shadow.radius = preset.shadowRadius;
    sun.shadow.map?.dispose();
    sun.shadow.map = null; // dibuat ulang dengan ukuran baru pada render berikutnya
    resize();
  }

  const world = buildWorld(scene, layout, { name: config.name });

  // --- Navigasi: semua perabot dan dinding menjadi rintangan ---
  scene.updateMatrixWorld(true);
  const nav = createNav(layout.width, layout.depth);
  const box = new THREE.Box3();
  for (const obj of [...world.obstacles, ...world.blockers]) nav.blockBox(box.setFromObject(obj));
  for (const [x, z, r] of world.circles) nav.blockCircle(x, z, r);

  // Tempat berdiri dan duduk: pelapor di boardroom, rehat di kafe (berdiri) atau lounge (duduk).
  const asSpots = (list) => list.map((spot) => ({ ...spot, owner: null }));
  const spots = {
    // Pelapor berdiri di dalam meja U; kursi kepala ruang rapat A untuk CEO.
    meeting: asSpots(world.meetings.flatMap((m) => m.spots)),
    'meeting-head': asSpots([world.meetings[0].head]),
    // Urutan sudut berselang-seling supaya beberapa karakter pertama tersebar merata.
    pantry: asSpots(world.pantry.spots),
    lounge: asSpots(world.lounge.seats),
  };

  const workers = new Map();

  function claimSpot(place, worker) {
    release(worker);
    // Rehat dibagi bergantian: sebagian duduk santai di lounge, sebagian berdiri di pantry.
    let lists = [spots[place]];
    if (place === 'pantry') lists = worker.prefersLounge ? [spots.lounge, spots.pantry] : [spots.pantry, spots.lounge];
    const spot = lists.flat().find((s) => !s.owner) ?? lists[0][workers.size % lists[0].length];
    spot.owner = worker;
    worker.spot = spot;
    return spot;
  }

  function release(worker) {
    if (worker.spot?.owner === worker) worker.spot.owner = null;
    worker.spot = null;
  }

  // Meja tiap karyawan: CEO di ruangannya, peran terdaftar di divisinya, sisanya di zona Umum.
  const deskOwners = new Map();
  function deskFor(agent) {
    if (agent.key === 'main') return world.ceoDesk;
    const desks = world.divisionDesks.get(agent.division) ?? world.divisionDesks.get('fallback');
    const free = desks.find((d) => !deskOwners.has(d));
    // Bila semua meja terisi, karyawan berbagi meja (tambah "desks" di konfigurasi untuk mencegahnya).
    const desk = free ?? desks[workers.size % desks.length];
    deskOwners.set(desk, agent.key);
    return desk;
  }

  const seatOf = (desk) => ({ x: desk.group.position.x, z: desk.group.position.z, yaw: desk.group.rotation.y, sit: 1 });
  // Titik berdiri di belakang kursi, tempat karakter mulai duduk atau selesai berdiri.
  const accessOf = (desk) => {
    const v = desk.group.localToWorld(new THREE.Vector3(0, 0, -1.7));
    return { x: v.x, z: v.z, yaw: desk.group.rotation.y, sit: 0 };
  };
  const stateOf = (w) => ({ x: w.x, z: w.z, yaw: w.yaw, sit: w.sit });

  function ensureWorker(agent) {
    if (workers.has(agent.key)) return workers.get(agent.key);
    const desk = deskFor(agent);
    const fig = createMinifig(agent.style, workers.size + 3);
    scene.add(fig);

    const el = createLabel(agent.style);
    const label = new CSS2DObject(el);
    label.position.y = 2.85;
    fig.add(label);

    // Karakter baru "dijatuhkan" langsung di tempatnya seperti balok yang dipasang.
    const worker = {
      fig, desk, el, drop: 6, vel: 0, last: '', steps: [], phase: 0, walking: false,
      spot: null, chatter: null, say: null, meetingUntil: 0,
      prefersLounge: workers.size % 2 === 0,
      anchor: accessOf(desk), // titik berdiri untuk bangun dari tempat duduk saat ini
    };
    let start = seatOf(desk);
    if (agent.place !== 'desk') {
      const spot = claimSpot(agent.place, worker);
      start = { ...spot, sit: spot.seat ? 1 : 0 };
      if (spot.seat) worker.anchor = { ...spot.access, yaw: spot.yaw, sit: 0 };
    }
    Object.assign(worker, { x: start.x, z: start.z, yaw: start.yaw, sit: start.sit, goal: agent.place });
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
      // Bangun ke titik berdiri milik tempat duduk yang sedang dipakai (meja, sofa, atau kursi rapat).
      const up = { ...worker.anchor, yaw: from.yaw, sit: 0 };
      worker.steps.push({ kind: 'tween', to: up, dur: 0.45 });
      from = up;
    }

    let target;
    let finish;
    if (place === 'desk') {
      release(worker);
      target = accessOf(worker.desk);
      finish = { kind: 'tween', to: seatOf(worker.desk), dur: 0.45 };
      worker.anchor = target;
    } else {
      const spot = claimSpot(place, worker);
      if (spot.seat) {
        target = { ...spot.access, yaw: spot.yaw, sit: 0 };
        finish = { kind: 'tween', to: { x: spot.x, z: spot.z, yaw: spot.yaw, sit: 1 }, dur: 0.5 };
        worker.anchor = target;
      } else {
        target = spot;
        finish = { kind: 'turn', yaw: spot.yaw };
      }
    }
    if (Math.hypot(target.x - from.x, target.z - from.z) > 0.05) {
      worker.steps.push({ kind: 'walk', points: nav.path([from.x, from.z], [target.x, target.z]) });
    }
    worker.steps.push(finish);
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
    // CEO duduk di kursi kepala ruang rapat selama ada karyawan yang melapor.
    if (agent.key === 'main') return meetingActive ? 'meeting-head' : 'desk';
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
    // Obrolan ringan sesekali saat rehat di pantry.
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

    const seatKind = worker.goal === 'desk' ? 'desk' : worker.spot?.kind ?? 'desk';
    poseMinifig(worker.fig, status, t, dt, { sit: worker.sit, walking: worker.walking, phase: worker.phase, seatKind });

    const color = STATUS[status].color;
    const on = status !== 'asleep';
    worker.desk.lampMat.color.set(on ? color : '#444');
    worker.desk.lampMat.emissive.set(on ? color : '#000');
    worker.desk.screenMat.emissive.set(on ? color : '#000').multiplyScalar(on ? 0.6 : 0);

    const bubble = bubbleText(worker, agent, now, dt);
    const signature = `${status}|${agent.detail}|${agent.alert}|${place}|${bubble}`;
    if (signature !== worker.last) {
      worker.last = signature;
      // Karyawan yang menganggur di meja sedang siaga; yang di pantry sedang rehat.
      const text = status === 'asleep' ? (place === 'desk' ? 'Siaga' : 'Istirahat') : STATUS[status].text;
      worker.el.querySelector('.state').textContent = text;
      worker.el.querySelector('.detail').textContent = agent.detail;
      worker.el.querySelector('.bubble i').textContent = bubble;
      worker.el.classList.toggle('talking', Boolean(bubble));
      worker.el.dataset.status = status;
      worker.el.classList.toggle('alert', agent.alert);
    }
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    const aspect = w / h;
    // Seluruh lantai muat di layar saat pertama dibuka; zoom untuk melihat detail.
    const viewH = Math.max(radius * 1.15, (radius * 1.9) / aspect);
    Object.assign(camera, { left: (-viewH * aspect) / 2, right: (viewH * aspect) / 2, top: viewH / 2, bottom: -viewH / 2 });
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    labels.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  setQuality(quality);

  let meetingActive = false;
  const timer = new THREE.Timer();
  function render(agents) {
    timer.update();
    const dt = Math.min(timer.getDelta(), maxDelta);
    const t = timer.getElapsed();
    meetingActive = [...workers.values()].some((w) => w.goal === 'meeting');
    for (const agent of agents.values()) syncWorker(ensureWorker(agent), agent, t, dt);
    controls.update();
    if (preset.ao) composer.render(dt);
    else renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  return { render, setQuality, debug: { scene, renderer, camera, controls, sun } };
}
