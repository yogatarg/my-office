import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { faceTexture, torsoTexture, SKIN } from './textures.js';

// Satuan: 1 = jarak antar stud. Titik asal figur ada di sendi pinggul,
// figur menghadap +z, dan tangan kiri karakter berada di sisi +x.

export const plastic = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.3, metalness: 0, ...extra });

const skin = plastic(SKIN);
const dark = plastic('#232323');

function solid(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Badan berbentuk trapesium: bahu lebih sempit daripada pinggang.
function torsoGeometry() {
  const g = new THREE.BoxGeometry(1.0, 1.15, 0.55);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * 0.76);
  g.computeVertexNormals();
  return g;
}

// Generator acak sederhana yang selalu sama untuk seed yang sama.
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function createHair(color, seed) {
  const m = plastic(color, { roughness: 0.5, side: THREE.DoubleSide });
  const g = new THREE.Group();

  const dome = solid(new THREE.SphereGeometry(0.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m);
  dome.scale.set(1, 0.72, 1.03);
  dome.position.y = 0.6;
  g.add(dome);

  // Menutup belakang kepala dari telinga ke telinga.
  const back = solid(new THREE.CylinderGeometry(0.415, 0.4, 0.44, 32, 1, true, Math.PI / 2, Math.PI), m);
  back.position.y = 0.4;
  g.add(back);

  // Jumputan rambut yang berantakan seperti foto acuan, kecuali di area wajah.
  const rand = seeded(seed + 7);
  const tuft = new THREE.SphereGeometry(1, 12, 10);
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * 0.35 + rand() * Math.PI * 1.3 + Math.PI / 2;
    const r = 0.14 + rand() * 0.06;
    const t = solid(tuft, m);
    t.scale.set(r, r * 0.75, r);
    t.position.set(Math.sin(a) * 0.36, 0.62 + rand() * 0.16, Math.cos(a) * 0.36);
    g.add(t);
  }
  for (const [x, y, z, r] of [[-0.16, 0.7, 0.26, 0.17], [0.12, 0.72, 0.28, 0.16], [-0.02, 0.8, 0.18, 0.18], [0.27, 0.66, 0.2, 0.13]]) {
    const b = solid(tuft, m);
    b.scale.set(r, r * 0.6, r * 0.8);
    b.position.set(x, y, z);
    g.add(b);
  }
  return g;
}

function createHeadset() {
  const g = new THREE.Group();
  const band = solid(new THREE.TorusGeometry(0.47, 0.035, 8, 32, Math.PI), dark);
  band.position.y = 0.42;
  g.add(band);
  for (const s of [-1, 1]) {
    const cup = solid(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 20), dark);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(s * 0.41, 0.4, 0);
    g.add(cup);
  }
  const boom = solid(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 8), dark);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0.36, 0.3, 0.17);
  const mic = solid(new THREE.SphereGeometry(0.045, 10, 8), plastic('#3b8cff'));
  mic.position.set(0.33, 0.3, 0.34);
  g.add(boom, mic);
  return g;
}

function createBeret() {
  const g = new THREE.Group();
  const m = plastic('#c0392b', { roughness: 0.55 });
  const cap = solid(new THREE.SphereGeometry(0.47, 28, 14), m);
  cap.scale.set(1, 0.3, 1);
  cap.position.y = 0.88;
  cap.rotation.z = 0.22;
  const stem = solid(new THREE.CylinderGeometry(0.03, 0.04, 0.09, 8), m);
  stem.position.set(-0.03, 1.02, 0);
  g.add(cap, stem);
  return g;
}

function createMagnifier() {
  const g = new THREE.Group();
  const ring = solid(new THREE.TorusGeometry(0.15, 0.03, 8, 24), dark);
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.15, 24),
    new THREE.MeshPhysicalMaterial({ color: '#cfefff', transmission: 0.6, transparent: true, opacity: 0.45, roughness: 0.05, side: THREE.DoubleSide }),
  );
  const handle = solid(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10), plastic('#6b3a1e'));
  handle.position.y = -0.3;
  g.add(ring, glass, handle);
  g.position.set(0, -0.68, 0.12);
  g.rotation.x = -0.4;
  return g;
}

function createArm(side, shirt) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.47, 0.93, 0);

  const shoulder = solid(new THREE.SphereGeometry(0.17, 16, 12), shirt);
  const arm = solid(new THREE.CylinderGeometry(0.15, 0.17, 0.72, 16), shirt);
  arm.position.y = -0.36;
  const wrist = solid(new THREE.CylinderGeometry(0.075, 0.075, 0.14, 12), skin);
  wrist.position.y = -0.76;
  // Tangan berbentuk huruf C dengan bukaan menghadap depan-bawah.
  const hand = solid(new THREE.TorusGeometry(0.11, 0.06, 12, 24, Math.PI * 1.55), skin);
  hand.rotation.y = -Math.PI / 2;
  hand.position.y = -0.9;

  pivot.add(shoulder, arm, wrist, hand);
  return pivot;
}

export function createMinifig(style, seed = 1) {
  const root = new THREE.Group();
  const shirt = plastic(style.shirt);
  const pants = plastic(style.pants);

  const legGeo = new RoundedBoxGeometry(0.46, 1.0, 0.6, 3, 0.05);
  const footGeo = new RoundedBoxGeometry(0.46, 0.22, 0.74, 3, 0.05);
  const legs = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.x = s * 0.245;
    const leg = solid(legGeo, pants);
    leg.position.y = -0.5;
    const foot = solid(footGeo, pants);
    foot.position.set(0, -1.0, 0.07);
    pivot.add(leg, foot);
    root.add(pivot);
    return pivot;
  });

  const hip = solid(new RoundedBoxGeometry(1.0, 0.22, 0.6, 3, 0.04), pants);
  hip.position.y = 0.06;
  root.add(hip);

  const torso = new THREE.Group();
  torso.position.y = 0.17;
  root.add(torso);

  const front = new THREE.MeshStandardMaterial({ map: torsoTexture(style), roughness: 0.3 });
  const body = solid(torsoGeometry(), [shirt, shirt, shirt, shirt, front, shirt]);
  body.position.y = 0.575;
  torso.add(body);

  const armL = createArm(1, shirt);
  const armR = createArm(-1, shirt);
  torso.add(armL, armR);

  const head = new THREE.Group();
  head.position.y = 1.15;
  torso.add(head);

  const neck = solid(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 16), skin);
  neck.position.y = 0.05;
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(style.face), roughness: 0.28 });
  // thetaStart = -π menaruh tengah tekstur (wajah) tepat di depan (+z).
  const skull = solid(new THREE.CylinderGeometry(0.36, 0.36, 0.62, 40, 1, false, -Math.PI, Math.PI * 2), [faceMat, skin, skin]);
  skull.position.y = 0.41;
  head.add(neck, skull, createHair(style.hair, seed));

  if (style.accessory === 'headset') head.add(createHeadset());
  if (style.accessory === 'beret') head.add(createBeret());
  if (style.accessory === 'magnifier') armL.add(createMagnifier());

  // Kertas yang hanya muncul ketika karakter sedang membaca.
  const paper = solid(new THREE.BoxGeometry(0.5, 0.64, 0.02), plastic('#fbfaf6'));
  paper.position.set(0, -1.02, 0.18);
  paper.rotation.x = 0.5;
  paper.visible = false;
  armR.add(paper);

  root.userData.joints = { legs, torso, head, armL, armR, paper };
  root.userData.pose = { torso: 0, headX: 0, headY: 0, armLx: -1.15, armLz: 0.12, armRx: -1.15, armRz: -0.12 };
  legs.forEach((l) => (l.rotation.x = -Math.PI / 2)); // semua karakter duduk
  return root;
}

function targetPose(status, t) {
  const p = { torso: 0.04, headX: 0, headY: 0, armLx: -1.15, armLz: 0.12, armRx: -1.15, armRz: -0.12, paper: false };
  switch (status) {
    case 'asleep':
      Object.assign(p, { torso: 0.2, headX: 0.38 + Math.sin(t * 1.2) * 0.03, headY: 0.12, armLx: -0.55, armRx: -0.55 });
      break;
    case 'typing':
      p.armLx = -1.2 + Math.sin(t * 17) * 0.09;
      p.armRx = -1.2 + Math.sin(t * 17 + Math.PI) * 0.09;
      p.headX = 0.16;
      p.torso = 0.08;
      break;
    case 'reading':
      Object.assign(p, { armRx: -1.75, armRz: 0.25, headX: 0.2, headY: -0.12, paper: true });
      break;
    case 'terminal':
      Object.assign(p, { torso: 0.2, headX: 0.08 + Math.sin(t * 3) * 0.02, armLx: -1.3, armRx: -1.3 });
      break;
    case 'thinking':
      Object.assign(p, { headY: Math.sin(t * 0.9) * 0.3, headX: -0.08, armRx: -1.75, armRz: 0.38 });
      break;
    case 'delegating':
      Object.assign(p, { armRx: -1.55, armRz: -0.6 + Math.sin(t * 3) * 0.15, headY: -0.3 });
      break;
    case 'reporting':
      Object.assign(p, { armRx: -2.85, armRz: -0.25 + Math.sin(t * 7) * 0.22, headX: -0.1 });
      break;
    case 'listening':
      Object.assign(p, { headX: -0.12, headY: Math.sin(t * 2) * 0.1, armLx: -0.9, armRx: -0.9 });
      break;
    case 'waiting':
      Object.assign(p, { headY: 0.35, headX: -0.05, armLx: -0.95, armRx: -0.95 });
      break;
  }
  return p;
}

// Menggerakkan sendi secara halus menuju pose milik status saat ini.
export function poseMinifig(fig, status, t, dt) {
  const { torso, head, armL, armR, paper } = fig.userData.joints;
  const pose = fig.userData.pose;
  const target = targetPose(status, t);
  const k = 1 - Math.exp(-dt * 9);
  for (const key of Object.keys(pose)) pose[key] += (target[key] - pose[key]) * k;

  torso.rotation.x = pose.torso;
  head.rotation.set(pose.headX, pose.headY, 0);
  armL.rotation.set(pose.armLx, 0, pose.armLz);
  armR.rotation.set(pose.armRx, 0, pose.armRz);
  paper.visible = target.paper;
}
