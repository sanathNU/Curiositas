#!/usr/bin/env node
// Map generator: builds an atlas's data/geo.js from its topic, area and link data. No dependencies;
// run it through the CLI: node lib/atlas/tools/atlas.mjs generate <atlas dir> [--seed N]
//
// 1. Layout. Countries are placed first, by a small force simulation over the links between them,
//    with the vertical bands in areas.js as a soft hint (low bands at the top).
//    Topics are then placed inside their country: links pull, labels collide, topics of different
//    countries keep a little further apart, and countries without a band (y: null) drift to the
//    coast next to the topics they connect to.
// 2. Fields. Every shape is the zero set of a signed-distance field sampled on a grid. Land is a
//    metaball field around the topics with some noise for the coastline. A province is the cell of
//    its topic in a power diagram (big labels get big cells), taken in slightly warped space so
//    borders curve, then cut to the land. A country is the union of its topics' cells. Along a
//    shared border the fields of the two sides are exact negatives of each other, so their contours
//    meet point for point and nothing has to be stitched.
// 3. Contours. Marching squares turns each field into closed rings (drawn with fill-rule evenodd).
// 4. Labels. Each label goes where its bounding box has the most room inside its province, and its
//    keywords are spread on an ellipse around it.
//
// The output is deterministic for a given seed and data, so geo.js only changes when the data does.
const P = {
  step: 2.5,                      // grid spacing, map units
  charW: 6.0, lineH: 11,          // label metrics at font-size 11 (EB Garamond semibold, measured)
  minR: 40,                       // smallest topic radius
  pack: 1.08,                     // spacing between linked or colliding topics, × sum of radii
  band: 75,                       // vertical distance between the bands hinted in areas.js
  stretch: 1.35,                  // final x × s, y ÷ s: a landscape map with cells wider than tall, like labels
  crossGap: 1.2,                  // extra spacing between topics of different countries
  power: 0.5,                     // power-diagram weight, × radius
  landSigma: 0.95, landT: 0.36,   // metaball width (× radius) and threshold
  coastNoise: [55, 0.07],         // [scale, amplitude] of coastline noise
  warp: [[70, 9], [26, 3]],       // [scale, amplitude] octaves of border warping
  minRing: 12,                    // drop rings smaller than this (map units²)
};

let SEED = 7;   // set by generate()

/* ---------- small utilities ---------- */
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(ix, iy, s) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s + 1, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296 * 2 - 1;
}
/** Smooth value noise in [-1, 1]. */
function noise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Gentle displacement field; its slope stays below 1, so cells stay in one piece. */
function warp(x, y) {
  let dx = 0, dy = 0;
  P.warp.forEach(([sc, amp], k) => { dx += amp * noise(x / sc, y / sc, SEED * 31 + 2 * k); dy += amp * noise(x / sc, y / sc, SEED * 31 + 2 * k + 1); });
  return [x + dx, y + dy];
}
const wrap = (s, w) => {   // same line breaking as the page (app.js)
  const out = []; let line = "";
  s.split(" ").forEach(word => { if ((line + " " + word).trim().length > w && line) { out.push(line); line = word; } else line = (line + " " + word).trim(); });
  if (line) out.push(line);
  return out;
};
const labelBox = n => { const ls = wrap(n.l, 16); return [Math.max(...ls.map(l => l.length)) * P.charW, ls.length * P.lineH]; };

/* ---------- 1. layout ---------- */
function relax(list, minDist) {
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    const p = list[a], q = list[b], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1e-6, m = minDist(p, q);
    if (d < m) { const f = (m - d) / d * 0.5; p.x -= dx * f; p.y -= dy * f; q.x += dx * f; q.y += dy * f; }
  }
}
function spring(p, q, len, k, attractOnly = false) {
  const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1e-6;
  if (attractOnly && d < len) return;
  const f = (d - len) / d * k * 0.5;
  p.x += dx * f; p.y += dy * f; q.x -= dx * f; q.y -= dy * f;
}

function placeCountries(D, nodes, links, rand) {
  const C = {};
  D.LEG.filter(c => D.CL[c].y != null).forEach(c => {
    const R = Math.sqrt(nodes.filter(n => n.c === c).reduce((a, n) => a + n.r * n.r, 0)) * 1.15;
    const hy = (D.CL[c].y - 2.5) * P.band, hx = D.CL[c].x != null ? D.CL[c].x * 0.8 : null;
    C[c] = { R, hx, hy, x: (hx ?? 0) + (rand() - 0.5) * 60, y: hy };
  });
  const W = {};
  links.forEach(([a, b]) => { if (a.c !== b.c && C[a.c] && C[b.c]) { const k = [a.c, b.c].sort().join("|"); W[k] = (W[k] || 0) + 1; } });
  const wmax = Math.max(...Object.values(W)), list = Object.values(C);
  for (let it = 0, N = 600; it < N; it++) {
    const al = 1 - it / N;
    Object.entries(W).forEach(([k, w]) => { const [a, b] = k.split("|").map(c => C[c]); spring(a, b, a.R + b.R, 0.06 * w / wmax * al, true); });
    list.forEach(c => { c.y += (c.hy - c.y) * 0.02 * al; if (c.hx != null) c.x += (c.hx - c.x) * 0.02 * al; else c.x *= 0.997; });
    relax(list, (a, b) => a.R + b.R + 8);
  }
  return C;
}

function placeTopics(D, rand) {
  const nodes = D.NODES.map(n => { const [w, h] = labelBox(n); return { id: n.id, c: n.c, r: Math.max(P.minR, 0.5 * w + 12, 0.5 * h + 20), x: 0, y: 0 }; });
  const by = Object.fromEntries(nodes.map(n => [n.id, n]));
  const links = D.EDGES.map(([s, t]) => [by[s], by[t]]);
  const C = placeCountries(D, nodes, links, rand);
  const nb = Object.fromEntries(nodes.map(n => [n.id, []]));
  links.forEach(([a, b]) => { nb[a.id].push(b); nb[b.id].push(a); });
  nodes.forEach((n, i) => {   // start on a small spiral around the country centre
    const a = i * 2.39996, rr = 10 * Math.sqrt((i % 12) + 1), c = C[n.c] || { x: 0, y: 0 };
    n.x = c.x + rr * Math.cos(a); n.y = c.y + rr * Math.sin(a);
  });
  const rim = nodes.filter(n => !C[n.c]), inland = nodes.filter(n => C[n.c]);
  const near = (a, b) => (a.r + b.r) * (C[a.c] && C[b.c] && a.c !== b.c ? P.crossGap : P.pack);
  for (let it = 0, N = 900; it < N; it++) {
    const al = 1 - it / N;
    links.forEach(([a, b]) => { const same = a.c === b.c; spring(a, b, (a.r + b.r) * P.pack * (same ? 1 : 1.25), (same ? 0.08 : 0.012) * al); });
    inland.forEach(n => { const c = C[n.c]; n.x += (c.x - n.x) * 0.02 * al; n.y += (c.y - n.y) * 0.02 * al; });
    const m = inland.length || 1, gx = inland.reduce((s, n) => s + n.x, 0) / m, gy = inland.reduce((s, n) => s + n.y, 0) / m;
    rim.forEach(n => {   // sit just outside the neighbours, on the side facing away from the middle
      const ns = nb[n.id].length ? nb[n.id] : inland;
      const mx = ns.reduce((s, m) => s + m.x, 0) / ns.length, my = ns.reduce((s, m) => s + m.y, 0) / ns.length;
      const ox = mx - gx, oy = my - gy, o = Math.hypot(ox, oy) || 1, tx = mx + ox / o * (n.r + 50), ty = my + oy / o * (n.r + 50);
      n.x += (tx - n.x) * 0.05 * al; n.y += (ty - n.y) * 0.05 * al;
    });
    relax(nodes, near); relax(nodes, near);
  }
  nodes.forEach(n => { n.x *= P.stretch; n.y /= P.stretch; });
  return nodes;
}

/* ---------- 2. fields ---------- */
function sampleGrid(nodes) {
  const pad = 3 * Math.max(...nodes.map(n => n.r)), s = P.step;
  const x0 = Math.min(...nodes.map(n => n.x)) - pad, y0 = Math.min(...nodes.map(n => n.y)) - pad;
  const nx = Math.ceil((Math.max(...nodes.map(n => n.x)) + pad - x0) / s) + 1;
  const ny = Math.ceil((Math.max(...nodes.map(n => n.y)) + pad - y0) / s) + 1;
  const K = nodes.length, N = nx * ny;
  const G = { nx, ny, x0, y0, nodes, QX: new Float64Array(N), QY: new Float64Array(N),
    best: new Int32Array(N), second: new Int32Array(N), D1: new Float64Array(N), D2: new Float64Array(N), L: new Float64Array(N) };
  const w = nodes.map(n => (P.power * n.r) ** 2), sig = nodes.map(n => 2 * (P.landSigma * n.r) ** 2);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const idx = j * nx + i, x = x0 + i * s, y = y0 + j * s, [qx, qy] = warp(x, y);
    let b = 0, b2 = 1, d1 = Infinity, d2 = Infinity, f = 0;
    for (let k = 0; k < K; k++) {
      const dx = qx - nodes[k].x, dy = qy - nodes[k].y, dd = dx * dx + dy * dy, pd = dd - w[k];
      f += Math.exp(-dd / sig[k]);
      if (pd < d1) { d2 = d1; b2 = b; d1 = pd; b = k; } else if (pd < d2) { d2 = pd; b2 = k; }
    }
    G.QX[idx] = qx; G.QY[idx] = qy;
    G.best[idx] = b; G.second[idx] = b2; G.D1[idx] = d1; G.D2[idx] = d2;
    G.L[idx] = f - P.landT + P.coastNoise[1] * noise(x / P.coastNoise[0], y / P.coastNoise[0], SEED * 31 + 99);
  }
  G.w = w;
  G.land = landDistance(G);
  return G;
}

/** Turn the land field into an approximate signed distance (field / gradient), so it mixes with the cell fields. */
function landDistance(G) {
  const { nx, ny, L } = G, s = P.step, out = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const idx = j * nx + i;
    if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) { out[idx] = -1e4; continue; }
    const gx = (L[idx + 1] - L[idx - 1]) / (2 * s), gy = (L[idx + nx] - L[idx - nx]) / (2 * s);
    out[idx] = Math.max(-1e4, Math.min(1e4, L[idx] / Math.max(Math.hypot(gx, gy), 1e-4)));
  }
  return fillLakes(out, nx, ny);
}

/** Sea that cannot reach the edge of the grid is a lake; the map has none, so make it land. */
function fillLakes(v, nx, ny) {
  const sea = new Uint8Array(nx * ny), stack = [];
  for (let i = 0; i < nx; i++) stack.push(i, (ny - 1) * nx + i);
  for (let j = 0; j < ny; j++) stack.push(j * nx, j * nx + nx - 1);
  while (stack.length) {
    const idx = stack.pop();
    if (sea[idx] || v[idx] > 0) continue;
    sea[idx] = 1;
    const i = idx % nx;
    if (i > 0) stack.push(idx - 1); if (i < nx - 1) stack.push(idx + 1);
    if (idx >= nx) stack.push(idx - nx); if (idx < (ny - 1) * nx) stack.push(idx + nx);
  }
  let filled = 0;
  for (let idx = 0; idx < v.length; idx++) if (v[idx] <= 0 && !sea[idx]) { v[idx] = P.step; filled++; }
  if (filled) console.log(`  filled ${(filled * P.step * P.step).toFixed(0)} units² of lakes`);
  return v;
}

const pd = (G, k, idx) => { const dx = G.QX[idx] - G.nodes[k].x, dy = G.QY[idx] - G.nodes[k].y; return dx * dx + dy * dy - G.w[k]; };
const gap = (G, a, b) => 2 * Math.hypot(G.nodes[a].x - G.nodes[b].x, G.nodes[a].y - G.nodes[b].y);

/** Grid box (inclusive) around the samples where pred holds, grown by m cells. */
function bbox(G, pred, m = 3) {
  let i0 = Infinity, j0 = Infinity, i1 = -1, j1 = -1;
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) if (pred(j * G.nx + i)) {
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
  }
  if (i1 < 0) return null;
  return [Math.max(0, i0 - m), Math.max(0, j0 - m), Math.min(G.nx - 1, i1 + m), Math.min(G.ny - 1, j1 + m)];
}

/** Sample field(idx) over a grid box into a padded array (border = sea), ready for contouring. */
function subField(G, box, field) {
  const [i0, j0, i1, j1] = box, w = i1 - i0 + 3, h = j1 - j0 + 3, v = new Float64Array(w * h).fill(-1e4);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) v[(j - j0 + 1) * w + (i - i0 + 1)] = field(j * G.nx + i);
  return { v, w, h, ox: G.x0 + (i0 - 1) * P.step, oy: G.y0 + (j0 - 1) * P.step };
}

/** Signed distance to province k: the bisector with the nearest competing cell, cut to the land. */
function provinceField(G, k) {
  return idx => {
    const g = G.best[idx] === k ? (G.D2[idx] - G.D1[idx]) / gap(G, k, G.second[idx])
                                : (G.D1[idx] - pd(G, k, idx)) / gap(G, k, G.best[idx]);
    return Math.min(g, G.land[idx]);
  };
}
/** Same for a whole country: nearest topic inside it against nearest topic outside it. */
function countryField(G, members) {
  const inC = new Uint8Array(G.nodes.length); members.forEach(k => { inC[k] = 1; });
  return idx => {
    let a = -1, b = -1, da = Infinity, db = Infinity;
    for (let k = 0; k < G.nodes.length; k++) { const d = pd(G, k, idx); if (inC[k]) { if (d < da) { da = d; a = k; } } else if (d < db) { db = d; b = k; } }
    return b < 0 ? G.land[idx] : Math.min((db - da) / gap(G, a, b), G.land[idx]);
  };
}

/* ---------- 3. contours ---------- */
/** Marching squares: closed rings of the zero level of v (w × h, border negative), in map units. */
function isolines({ v, w, h, ox, oy }) {
  const s = P.step, pts = new Map(), next = new Map(), at = (i, j) => v[j * w + i];
  const cross = (key, i0, j0, i1, j1) => {
    if (!pts.has(key)) { const a = at(i0, j0), t = a / (a - at(i1, j1)); pts.set(key, [ox + (i0 + t * (i1 - i0)) * s, oy + (j0 + t * (j1 - j0)) * s]); }
    return key;
  };
  for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
    const c = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)], pos = c.map(x => x > 0);   // tl tr br bl
    if (pos[0] === pos[1] && pos[1] === pos[2] && pos[2] === pos[3]) continue;
    const E = [[`h${i},${j}`, i, j, i + 1, j], [`v${i + 1},${j}`, i + 1, j, i + 1, j + 1],
               [`h${i},${j + 1}`, i, j + 1, i + 1, j + 1], [`v${i},${j}`, i, j, i, j + 1]];
    const xs = [];   // crossings, clockwise; "exit" = leaving the positive side
    for (let e = 0; e < 4; e++) if (pos[e] !== pos[(e + 1) % 4]) xs.push({ key: cross(...E[e]), exit: pos[e] });
    const joined = xs.length === 4 && c[0] + c[1] + c[2] + c[3] > 0;   // saddle: does the middle belong inside?
    xs.forEach((x, k) => { if (x.exit) next.set(x.key, xs[joined ? (k + 1) % xs.length : (k - 1 + xs.length) % xs.length].key); });
  }
  const seen = new Set(), rings = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const ring = []; let k = start;
    do { seen.add(k); ring.push(pts.get(k)); k = next.get(k); } while (k !== undefined && k !== start);
    rings.push(ring);
  }
  return rings;
}
const ringArea = r => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);

/* ---------- 4. labels ---------- */
/** Point of the box whose label rectangle keeps the most clearance inside field f. */
function labelSpot(G, box, f, [lw, lh]) {
  const s = P.step, hw = Math.round(0.5 * lw / s), hh = Math.round(0.5 * lh / s);
  const [i0, j0, i1, j1] = box, val = (i, j) => (i < 0 || j < 0 || i >= G.nx || j >= G.ny ? -1e4 : f(j * G.nx + i));
  let best = null, score = -Infinity;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (val(i, j) <= 0) continue;
    let m = Infinity;
    for (const di of [-hw, 0, hw]) for (const dj of [-hh, 0, hh]) m = Math.min(m, val(i + di, j + dj));
    if (m > score) { score = m; best = [i, j]; }
  }
  return [G.x0 + best[0] * P.step, G.y0 + best[1] * P.step];
}
/**
 * Keyword anchors on ellipses around the label. Each keyword must stay clear of every label on the map
 * and of keywords already placed (`placed`, shared across provinces), and should sit inside its own
 * province; if no spot inside is clear, a clear spot just over the border beats overlapping a label.
 */
function keywordSpots(G, f, [cx, cy], [lw, lh], words, placed) {
  const inside = (x, y) => { const i = Math.round((x - G.x0) / P.step), j = Math.round((y - G.y0) / P.step); return i >= 0 && j >= 0 && i < G.nx && j < G.ny && f(j * G.nx + i) > 3; };
  const clear = (x, y, hw) => placed.every(b => Math.abs(x - b.x) > hw + b.hw || Math.abs(y - b.y) > 4.5 + b.hh);
  return words.map((wd, k) => {
    const base = -Math.PI / 2 + (2 * Math.PI * k) / words.length + 0.35, hw = wd.length * 2.25 + 1;   // keyword font 7.2, capitals included
    const spots = [];
    for (const sc of [1.15, 1.0, 1.4, 1.7]) for (const da of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.3, -1.3])
      spots.push([cx + (0.5 * lw + 18) * sc * Math.cos(base + da), cy + (0.5 * lh + 12) * sc * Math.sin(base + da)]);
    const pick = spots.find(([x, y]) => clear(x, y, hw) && inside(x, y) && inside(x - hw, y) && inside(x + hw, y))
      ?? spots.find(([x, y]) => clear(x, y, hw) && inside(x, y))
      ?? spots.find(([x, y]) => clear(x, y, hw)) ?? spots[0];
    placed.push({ x: pick[0], y: pick[1], hw, hh: 4.5 });
    return pick;
  });
}

/* ---------- assemble ---------- */
function build(D) {
  const nodes = placeTopics(D, mulberry32(SEED)), G = sampleGrid(nodes), K = nodes.length;
  const shapes = { prov: {}, clusters: {}, main: {}, subs: [] }, stats = { pieces: [] };
  const keep = rs => rs.filter(r => ringArea(r) >= P.minRing);
  const fields = nodes.map((n, k) => {
    const box = bbox(G, idx => G.best[idx] === k && G.land[idx] > 0);
    if (!box) throw new Error(`${n.id} got no land; try another --seed`);
    const f = provinceField(G, k), rs = keep(isolines(subField(G, box, f))), lb = labelBox(D.NODES[k]);
    shapes.prov[n.id] = rs;
    if (rs.length > 1) stats.pieces.push(`${n.id}×${rs.length}`);
    shapes.main[n.id] = labelSpot(G, box, f, lb);
    return { f, lb };
  });
  // keywords last, so every label on the map is already an obstacle
  const placed = nodes.map((n, k) => ({ x: shapes.main[n.id][0], y: shapes.main[n.id][1], hw: 0.5 * fields[k].lb[0] + 3, hh: 0.5 * fields[k].lb[1] + 4 }));
  nodes.forEach((n, k) => {
    const words = D.SUB[n.id] || [];
    keywordSpots(G, fields[k].f, shapes.main[n.id], fields[k].lb, words, placed).forEach((p, i) => shapes.subs.push([words[i], n.id, ...p]));
  });
  D.LEG.forEach(c => {
    const members = nodes.map((n, k) => (n.c === c ? k : -1)).filter(k => k >= 0);
    if (!members.length) return;
    const inC = new Set(members), box = bbox(G, idx => inC.has(G.best[idx]) && G.land[idx] > 0);
    shapes.clusters[c] = keep(isolines(subField(G, box, countryField(G, members))));
  });
  shapes.coast = keep(isolines(subField(G, [0, 0, G.nx - 1, G.ny - 1], idx => G.land[idx])));
  return { shapes, stats, K };
}

/**
 * Thin a ring of integer points (tenths of a unit). A point goes when it barely bends the line and its
 * hash is even. The test looks only at the point and its two neighbours, so a border shared by two
 * provinces is thinned the same way from both sides, and the hash keeps long runs from vanishing.
 */
function thin(q) {
  return q.filter((p, i) => {
    const a = q[(i - 1 + q.length) % q.length], b = q[(i + 1) % q.length];
    const bend = Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]));
    return q.length < 8 || bend > 30 || (Math.imul(p[0], 73856093) ^ Math.imul(p[1], 19349663)) & 1;
  });
}
const num = v => String(v / 10).replace(/^(-?)0\./, "$1.");

/** Shift everything so the coast starts at (20, 20); write paths in relative tenths ("M x,y l dx,dy …z"). */
function toGeo({ shapes }) {
  const all = shapes.coast.flat(), mx = Math.min(...all.map(p => p[0])) - 20, my = Math.min(...all.map(p => p[1])) - 20;
  const r1 = v => Math.round(v * 10) / 10, pt = ([x, y]) => [r1(x - mx), r1(y - my)];
  const path = rs => rs.map(r => {
    // integer tenths: relative steps then add up to exactly the same absolute points on both sides of a border
    let q = r.map(([x, y]) => [Math.round((x - mx) * 10), Math.round((y - my) * 10)]);
    q = thin(q.filter((p, i) => { const o = q[(i - 1 + q.length) % q.length]; return p[0] !== o[0] || p[1] !== o[1]; }));
    return `M${num(q[0][0])},${num(q[0][1])}l` + q.slice(1).map((p, i) => `${num(p[0] - q[i][0])},${num(p[1] - q[i][1])}`).join(" ") + "z";
  }).join("");
  const map = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, path(v)]));
  return {
    W: r1(Math.max(...all.map(p => p[0])) - mx + 20), H: r1(Math.max(...all.map(p => p[1])) - my + 20),
    coast: path(shapes.coast), clusters: map(shapes.clusters), prov: map(shapes.prov),
    main: Object.fromEntries(Object.entries(shapes.main).map(([k, p]) => [k, pt(p)])),
    subs: shapes.subs.map(([w, id, x, y]) => [w, id, ...pt([x, y])]),
  };
}

/**
 * Draw the map for loaded atlas data (see lib.mjs `load`). Returns the GEO object for data/geo.js,
 * plus provinces that came out in several pieces and the number of pieces per country.
 */
export function generate(D, seed = 7) {
  SEED = seed;
  const out = build(D);
  return { geo: toGeo(out), pieces: out.stats.pieces, countries: Object.entries(out.shapes.clusters).map(([c, rs]) => `${c}×${rs.length}`) };
}
