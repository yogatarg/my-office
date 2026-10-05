// Pencari jalan A* di atas grid lantai. Satu sel = 0.5 satuan, cukup halus
// untuk lorong di antara meja, dan cukup kecil (56x40 sel) untuk dihitung seketika.

const CELL = 0.5;
// Jari-jari badan karakter; rintangan diperbesar sebanyak ini supaya tidak menabrak.
const BODY = 0.4;

export function createNav(width, depth) {
  const cols = Math.round(width / CELL);
  const rows = Math.round(depth / CELL);
  const blocked = new Uint8Array(cols * rows);

  const cellOf = (x, z) => [
    Math.min(cols - 1, Math.max(0, Math.floor((x + width / 2) / CELL))),
    Math.min(rows - 1, Math.max(0, Math.floor((z + depth / 2) / CELL))),
  ];
  const centerOf = (c, r) => [(c + 0.5) * CELL - width / 2, (r + 0.5) * CELL - depth / 2];
  const isBlocked = (c, r) => c < 0 || r < 0 || c >= cols || r >= rows || blocked[r * cols + c] === 1;

  function blockWhere(test) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const [x, z] = centerOf(c, r);
        if (test(x, z)) blocked[r * cols + c] = 1;
      }
    }
  }

  // box: THREE.Box3 dalam koordinat dunia.
  function blockBox(box) {
    blockWhere((x, z) => x > box.min.x - BODY && x < box.max.x + BODY && z > box.min.z - BODY && z < box.max.z + BODY);
  }

  function blockCircle(cx, cz, radius) {
    blockWhere((x, z) => Math.hypot(x - cx, z - cz) < radius + BODY);
  }

  // Sel bebas terdekat, untuk titik tujuan yang kebetulan berada di dalam rintangan.
  function nearestFree(c, r) {
    if (!isBlocked(c, r)) return [c, r];
    for (let d = 1; d < Math.max(cols, rows); d++) {
      for (let dc = -d; dc <= d; dc++) {
        for (const dr of [-d, d]) if (!isBlocked(c + dc, r + dr)) return [c + dc, r + dr];
      }
      for (let dr = -d; dr <= d; dr++) {
        for (const dc of [-d, d]) if (!isBlocked(c + dc, r + dr)) return [c + dc, r + dr];
      }
    }
    return [c, r];
  }

  function lineOfSight([x0, z0], [x1, z1]) {
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (CELL / 3));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (isBlocked(...cellOf(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t))) return false;
    }
    return true;
  }

  // Mengembalikan daftar titik [x, z] dari `from` ke `to`, sudah diluruskan.
  function path(from, to) {
    const start = nearestFree(...cellOf(...from));
    const goal = nearestFree(...cellOf(...to));
    const key = (c, r) => r * cols + c;
    const startKey = key(...start);
    const goalKey = key(...goal);

    const g = new Map([[startKey, 0]]);
    const came = new Map();
    const open = [{ k: startKey, c: start[0], r: start[1], f: 0 }];
    const closed = new Set();

    while (open.length) {
      let best = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
      const cur = open.splice(best, 1)[0];
      if (cur.k === goalKey) break;
      if (closed.has(cur.k)) continue;
      closed.add(cur.k);

      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (!dc && !dr) continue;
          const c = cur.c + dc;
          const r = cur.r + dr;
          if (isBlocked(c, r)) continue;
          // Tidak memotong sudut rintangan saat bergerak diagonal.
          if (dc && dr && (isBlocked(cur.c + dc, cur.r) || isBlocked(cur.c, cur.r + dr))) continue;
          const k = key(c, r);
          const cost = g.get(cur.k) + (dc && dr ? Math.SQRT2 : 1);
          if (cost < (g.get(k) ?? Infinity)) {
            g.set(k, cost);
            came.set(k, cur.k);
            open.push({ k, c, r, f: cost + Math.hypot(goal[0] - c, goal[1] - r) });
          }
        }
      }
    }

    if (!came.has(goalKey) && goalKey !== startKey) return [to];

    const cells = [];
    for (let k = goalKey; k !== undefined; k = came.get(k)) cells.unshift(centerOf(k % cols, Math.floor(k / cols)));

    // Luruskan jalur: lompati titik yang masih terlihat langsung dari titik sebelumnya.
    const points = [from];
    let anchor = from;
    for (let i = 1; i < cells.length; i++) {
      if (!lineOfSight(anchor, cells[i])) {
        anchor = cells[i - 1];
        points.push(anchor);
      }
    }
    points.push(to);
    return points.slice(1);
  }

  return { blockBox, blockCircle, blockWhere, path };
}
