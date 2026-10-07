import * as THREE from 'three';

export const SKIN = '#f2c418';
const INK = '#141414';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Tekstur melingkari seluruh silinder kepala; wajah berada di tengah (u = 0.5).
export function faceTexture(variant) {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = SKIN;
  g.fillRect(0, 0, 1024, 256);

  const cx = 512;
  const ey = 122;
  g.strokeStyle = INK;
  g.lineCap = 'round';
  g.lineWidth = 9;

  for (const s of [-1, 1]) {
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(cx + s * 60, ey, 15, 21, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(cx + s * 60 + 5, ey - 8, 5, 0, Math.PI * 2);
    g.fill();
  }

  const brow = (x1, y1, x2, y2, cy) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.quadraticCurveTo((x1 + x2) / 2, cy, x2, y2);
    g.stroke();
  };
  const mouth = (path) => {
    g.beginPath();
    path();
    g.stroke();
  };

  g.fillStyle = INK;
  switch (variant) {
    case 'stern': // seperti foto acuan: alis menukik ke tengah, mulut datar
      brow(cx - 100, 72, cx - 28, 90, 70);
      brow(cx + 28, 90, cx + 100, 72, 70);
      mouth(() => { g.moveTo(cx - 22, 186); g.lineTo(cx + 22, 186); });
      break;
    case 'skeptic':
      brow(cx - 98, 84, cx - 30, 84, 78);
      brow(cx + 30, 72, cx + 98, 60, 48);
      mouth(() => { g.moveTo(cx - 28, 190); g.quadraticCurveTo(cx + 4, 194, cx + 30, 178); });
      break;
    case 'grin':
      brow(cx - 96, 82, cx - 30, 78, 62);
      brow(cx + 30, 78, cx + 96, 82, 62);
      g.beginPath();
      g.moveTo(cx - 46, 168);
      g.quadraticCurveTo(cx, 236, cx + 46, 168);
      g.closePath();
      g.fill();
      g.fillStyle = '#fff';
      g.fillRect(cx - 34, 169, 68, 11);
      break;
    default: // smile
      brow(cx - 96, 82, cx - 30, 80, 66);
      brow(cx + 30, 80, cx + 96, 82, 66);
      mouth(() => { g.moveTo(cx - 34, 172); g.quadraticCurveTo(cx, 208, cx + 34, 172); });
  }
  return toTexture(c);
}

// Sablon bagian depan badan, mengikuti identitas setiap peran.
export function torsoTexture(style) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = style.shirt;
  g.fillRect(0, 0, 512, 512);

  g.strokeStyle = 'rgba(0,0,0,.08)';
  g.lineWidth = 12;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(80, 300);
  g.quadraticCurveTo(160, 370, 240, 340);
  g.stroke();

  if (style.print === 'tie') {
    // Kemeja berkerah, dasi, dan saku seperti foto acuan.
    g.fillStyle = SKIN;
    g.beginPath();
    g.moveTo(186, 0);
    g.lineTo(256, 112);
    g.lineTo(326, 0);
    g.fill();

    g.strokeStyle = INK;
    g.lineWidth = 5;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(176, 0); g.lineTo(146, 62); g.lineTo(232, 98); g.lineTo(256, 116);
    g.moveTo(336, 0); g.lineTo(366, 62); g.lineTo(280, 98); g.lineTo(256, 116);
    g.stroke();

    g.fillStyle = '#22324a';
    g.beginPath();
    g.moveTo(240, 100); g.lineTo(272, 100); g.lineTo(266, 132); g.lineTo(246, 132);
    g.fill();
    g.beginPath();
    g.moveTo(246, 132); g.lineTo(266, 132); g.lineTo(284, 380); g.lineTo(256, 418); g.lineTo(228, 380);
    g.fill();

    g.strokeRect(330, 196, 92, 82);
    return toTexture(c);
  }

  // Kaos berleher bulat dengan sablon di tengah.
  g.fillStyle = SKIN;
  g.beginPath();
  g.ellipse(256, 0, 72, 48, 0, 0, Math.PI);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.lineWidth = 7;
  g.beginPath();
  g.ellipse(256, 0, 78, 54, 0, 0, Math.PI);
  g.stroke();

  g.fillStyle = 'rgba(255,255,255,.93)';
  g.strokeStyle = 'rgba(255,255,255,.93)';
  if (style.print === 'check') {
    g.lineWidth = 34;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(170, 270); g.lineTo(232, 330); g.lineTo(346, 200);
    g.stroke();
  } else {
    const glyph = { braces: '{ }', tag: '</>' }[style.print] ?? style.label.charAt(0).toUpperCase();
    g.font = `800 ${glyph.length > 1 ? 130 : 170}px Unbounded, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(glyph, 256, 275);
  }
  return toTexture(c);
}

// ---------- Permukaan ruangan: datar, dengan tekstur halus ala tile mainan ----------

// Noise acak yang selalu sama, supaya tekstur tidak berubah tiap muat ulang.
function noise(g, w, h, amount, seed = 1) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function repeating(c) {
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Satu ubin tekstur = 2x2 stud. Garis sambungan tipis seperti tile licin di atas baseplate.
export function tileTexture(base = '#c9c8c5') {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 6, 3);
  g.strokeStyle = 'rgba(0,0,0,.16)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  g.strokeStyle = 'rgba(255,255,255,.18)';
  g.beginPath();
  g.moveTo(3, 3); g.lineTo(253, 3);
  g.moveTo(3, 3); g.lineTo(3, 253);
  g.stroke();
  return repeating(c);
}

// Karpet berpetak dengan serat halus; warnanya diturunkan dari warna divisi.
export function carpetTexture(color) {
  const [c, g] = canvas(256, 256);
  const base = new THREE.Color(color).lerp(new THREE.Color('#4a4d52'), 0.55);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 22, 11);
  g.strokeStyle = 'rgba(0,0,0,.18)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  return repeating(c);
}

// Papan kayu memanjang dengan sambungan yang tidak sejajar.
export function woodTexture() {
  const [c, g] = canvas(256, 256);
  const tones = ['#b98d5a', '#c39765', '#ae8251', '#bf9160'];
  for (let i = 0; i < 4; i++) {
    g.fillStyle = tones[i];
    g.fillRect(0, i * 64, 256, 64);
  }
  noise(g, 256, 256, 14, 5);
  g.strokeStyle = 'rgba(60,35,10,.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(0, i * 64 + 1); g.lineTo(256, i * 64 + 1);
    const joint = (i * 97) % 256;
    g.moveTo(joint, i * 64); g.lineTo(joint, i * 64 + 64);
    g.stroke();
  }
  return repeating(c);
}

// Papan nama divisi: nama di atas strip warna divisi.
export function signTexture(name, color) {
  const [c, g] = canvas(512, 160);
  g.fillStyle = '#f4f3ef';
  g.fillRect(0, 0, 512, 160);
  g.fillStyle = color;
  g.fillRect(0, 0, 24, 160);
  g.fillStyle = '#1d1f23';
  g.font = '700 64px Unbounded, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(name, 56, 84, 430);
  return toTexture(c);
}
