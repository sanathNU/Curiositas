#!/usr/bin/env node
// Covers for the Curiositas project list: one wordless 400 x 600 SVG per project, each showing the
// project's idea in its field's own picture language. The display is a flat ground, a framed panel
// with three empty ruled rows under it, and a stack of page edges behind. Everything random is
// seeded, so a seed always redraws the same covers.
//
// usage: node scripts/covers.mjs [seed]      writes assets/covers/{atlas,sdoc,dioramas}.svg

import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 400, H = 600, TAU = Math.PI * 2;
const DEFAULT_SEED = 20261119;
const f = n => Math.round(n * 100) / 100;
const P = p => `${f(p[0])},${f(p[1])}`;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- display: frame, ruled rows, page edges ---------- */

/** The framed panel every emblem sits in. */
const FR = { x: 44, y: 150, w: 312, h: 270, rows: 3, rowH: 20 };

/** Hairline frame round the panel, with three empty ruled rows and a centre divider under it. */
function panel(stroke, opacity) {
  const x0 = FR.x, x1 = FR.x + FR.w, y1 = FR.y + FR.h, yb = y1 + FR.rows * FR.rowH;
  let s = `<g fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="1">`;
  s += `<rect x="${x0}" y="${FR.y}" width="${FR.w}" height="${yb - FR.y}"/>`;
  for (let i = 0; i < FR.rows; i++) s += `<line x1="${x0}" x2="${x1}" y1="${y1 + i * FR.rowH}" y2="${y1 + i * FR.rowH}"/>`;
  return s + `<line x1="${(x0 + x1) / 2}" x2="${(x0 + x1) / 2}" y1="${y1}" y2="${yb}"/></g>`;
}

/** Wrap a cover's drawing in a standalone SVG with a stack of page edges behind it. */
function book(id, label, inner) {
  let edges = '';
  for (let i = 6; i >= 1; i--) {
    edges += `<rect x="${f(i * 1.7)}" y="${f(i * 1.7)}" width="${W}" height="${H}" fill="#f1ece0" stroke="#8a8270" stroke-opacity=".5" stroke-width=".5"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W + 12} ${H + 12}" role="img" aria-label="${label}">` +
    `<defs><clipPath id="${id}-clip"><rect width="${W}" height="${H}"/></clipPath></defs>` +
    `${edges}<g clip-path="url(#${id}-clip)">${inner}</g></svg>`;
}

/* ---------- geometry ---------- */

/** Even-odd point-in-polygon test. */
function inside(pt, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

const signedArea = l => l.reduce((s, p, i) => { const q = l[(i + 1) % l.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

/**
 * Voronoi cell of site i inside `box`, by clipping with every perpendicular bisector.
 * Each vertex carries the site whose bisector its outgoing edge lies on (-1 for the box),
 * so the cell's neighbours fall out of the clipping.
 */
function voronoiCell(i, sites, box) {
  let poly = box.map(p => ({ p, e: -1 }));
  const s = sites[i];
  sites.forEach((t, j) => {
    if (j === i) return;
    const nx = t[0] - s[0], ny = t[1] - s[1], c = (t[0] ** 2 + t[1] ** 2 - s[0] ** 2 - s[1] ** 2) / 2;
    const side = p => p[0] * nx + p[1] * ny - c;
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const A = poly[k], B = poly[(k + 1) % poly.length], sa = side(A.p), sb = side(B.p);
      if (sa <= 0) out.push(A);
      if ((sa <= 0) !== (sb <= 0)) {
        const u = sa / (sa - sb);
        out.push({ p: [A.p[0] + (B.p[0] - A.p[0]) * u, A.p[1] + (B.p[1] - A.p[1]) * u], e: sa <= 0 ? j : A.e });
      }
    }
    poly = out;
  });
  return { poly: poly.map(v => v.p), nbrs: [...new Set(poly.map(v => v.e).filter(e => e >= 0))] };
}

/** Sutherland-Hodgman: clip any polygon by a convex one. */
function clipConvex(subject, clip) {
  const orient = Math.sign(signedArea(clip));
  let out = subject;
  for (let k = 0; k < clip.length && out.length; k++) {
    const C = clip[k], D = clip[(k + 1) % clip.length];
    const inner = p => orient * ((D[0] - C[0]) * (p[1] - C[1]) - (D[1] - C[1]) * (p[0] - C[0])) >= 0;
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const A = src[i], B = src[(i + 1) % src.length], ia = inner(A), ib = inner(B);
      if (ia) out.push(A);
      if (ia !== ib) {
        const den = (B[0] - A[0]) * (D[1] - C[1]) - (B[1] - A[1]) * (D[0] - C[0]);
        const u = ((C[0] - A[0]) * (D[1] - C[1]) - (C[1] - A[1]) * (D[0] - C[0])) / den;
        out.push([A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u]);
      }
    }
  }
  return out;
}

/** Uniform Catmull-Rom spline through the knots, `per` samples per span. */
function catmullRom(knots, per) {
  const out = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const p0 = knots[Math.max(0, i - 1)], p1 = knots[i], p2 = knots[i + 1], p3 = knots[Math.min(knots.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(d => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 +
        (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(knots[knots.length - 1]);
  return out;
}

/** Bilinear value noise on a seeded (n + 1)^2 lattice, smoothstepped, in [0, 1]. */
function valueNoise(r, n) {
  const g = Array.from({ length: (n + 1) * (n + 1) }, () => r());
  const s = t => t * t * (3 - 2 * t);
  const at = (i, j) => g[(j % (n + 1)) * (n + 1) + (i % (n + 1))];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = s(x - xi), v = s(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/* ---------- 1. Atlas of Theoretical Cryptography: provinces, and the results between them ---------- */

const ATLAS = {
  sea: '#A7BFC1', ink: '#1E2A2F', red: '#C23B22', border: '#FBF7EC',
  land: ['#F4EEDF', '#E2CFA4', '#CDB27C', '#EADFC4'],
};

/** A smooth polar blob, wider than tall, scaled to fill the panel. */
function coastline(r) {
  const hs = [];
  for (let j = 2; j <= 7; j++) hs.push([j, (0.17 * (0.4 + 0.6 * r())) / j ** 0.85, r() * TAU]);
  const raw = [];
  for (let i = 0; i < 260; i++) {
    const th = (i / 260) * TAU;
    const rr = 1 + hs.reduce((s, [j, a, ph]) => s + a * Math.sin(j * th + ph), 0);
    raw.push([1.25 * rr * Math.cos(th), rr * Math.sin(th)]);
  }
  const xs = raw.map(p => p[0]), ys = raw.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min((FR.w - 30) / (x1 - x0), (FR.h - 30) / (y1 - y0));
  const cx = FR.x + FR.w / 2, cy = FR.y + FR.h / 2;
  return raw.map(([x, y]) => [cx + k * (x - (x0 + x1) / 2), cy + k * (y - (y0 + y1) / 2)]);
}

/** Capitals by dart throwing: up to 18 points on land, at least 50 apart. */
function capitals(r, coast) {
  const sites = [];
  for (let t = 0; t < 4000 && sites.length < 18; t++) {
    const p = [FR.x + 10 + r() * (FR.w - 20), FR.y + 10 + r() * (FR.h - 20)];
    if (inside(p, coast) && sites.every(q => dist(q, p) > 50)) sites.push(p);
  }
  return sites;
}

/** Four tints, no two neighbouring provinces alike: greedy colouring retried in random orders. */
function fourColour(r, cells) {
  for (let t = 0; t < 300; t++) {
    const order = cells.map((_, i) => i).sort(() => r() - 0.5), col = new Array(cells.length).fill(-1);
    let ok = true;
    for (const i of order) {
      const used = new Set(cells[i].nbrs.map(j => col[j]));
      const c = [0, 1, 2, 3].find(k => !used.has(k));
      if (c === undefined) { ok = false; break; }
      col[i] = c;
    }
    if (ok) return col;
  }
  return cells.map((_, i) => i % 4);
}

/** Roads between neighbouring capitals that stay on land: a spanning tree plus about a quarter of the rest. */
function roads(r, sites, cells, coast) {
  const onLand = (a, b) => [0.2, 0.35, 0.5, 0.65, 0.8].every(u => inside([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], coast));
  const pairs = [];
  cells.forEach((c, i) => c.nbrs.forEach(j => { if (i < j && onLand(sites[i], sites[j])) pairs.push([i, j, dist(sites[i], sites[j])]); }));
  pairs.sort((a, b) => a[2] - b[2]);
  const parent = sites.map((_, i) => i), find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  return pairs.filter(([i, j]) => {
    const a = find(i), b = find(j);
    if (a !== b) { parent[a] = b; return true; }
    return r() < 0.28;
  });
}

/** Dijkstra over the road network; returns the capitals on the shortest road from `from` to `to`. */
function shortestRoad(sites, adj, from, to) {
  const d = sites.map(() => Infinity), prev = sites.map(() => -1), done = new Set();
  d[from] = 0;
  while (done.size < sites.length) {
    let u = -1;
    d.forEach((x, i) => { if (!done.has(i) && (u < 0 || x < d[u])) u = i; });
    if (d[u] === Infinity) break;
    done.add(u);
    for (const [v, w] of adj[u]) if (d[u] + w < d[v]) { d[v] = d[u] + w; prev[v] = u; }
  }
  const path = [];
  for (let v = to; v >= 0; v = prev[v]) path.push(v);
  return path.reverse();
}

/** The longest road journey (three hops or more) that stays within 25% of the straight line. */
function redRoute(sites, roadList) {
  const adj = sites.map(() => []);
  roadList.forEach(([i, j, w]) => { adj[i].push([j, w]); adj[j].push([i, w]); });
  let route = [], best = -1;
  sites.forEach((a, i) => sites.forEach((b, j) => {
    if (j <= i) return;
    const path = shortestRoad(sites, adj, i, j);
    if (path.length < 4 || path[0] !== i) return;
    const len = path.slice(1).reduce((s, v, k) => s + dist(sites[v], sites[path[k]]), 0);
    const span = dist(a, b);
    if (len < 1.25 * span && span > best) { best = span; route = path; }
  }));
  return route;
}

/** Atlas cover: a continent of provinces, capitals joined by results, one chain of results in red. */
function atlas(seed) {
  const r = rng(seed);
  const coast = coastline(r), sites = capitals(r, coast);
  const box = [[FR.x - 50, FR.y - 50], [FR.x + FR.w + 50, FR.y - 50], [FR.x + FR.w + 50, FR.y + FR.h + 50], [FR.x - 50, FR.y + FR.h + 50]];
  const cells = sites.map((_, i) => voronoiCell(i, sites, box));
  const colour = fourColour(r, cells), roadList = roads(r, sites, cells, coast), route = redRoute(sites, roadList);
  const onRoute = new Set(route.slice(1).map((v, k) => [Math.min(v, route[k]), Math.max(v, route[k])].join()));
  const C = ATLAS;
  let g = `<rect width="${W}" height="${H}" fill="${C.sea}"/>` + panel(C.ink, 0.5);
  g += cells.map(c => clipConvex(coast, c.poly)).map((p, i) => (p.length > 2
    ? `<polygon points="${p.map(P).join(' ')}" fill="${C.land[colour[i]]}" stroke="${C.border}" stroke-width="1.6" stroke-linejoin="round"/>` : '')).join('');
  g += `<polygon points="${coast.map(P).join(' ')}" fill="none" stroke="${C.ink}" stroke-opacity=".55" stroke-width=".8"/>`;
  g += `<g stroke="${C.ink}" stroke-opacity=".7" stroke-width="1.1" stroke-linecap="round">` + roadList
    .filter(([i, j]) => !onRoute.has([i, j].join()))
    .map(([i, j]) => `<line x1="${f(sites[i][0])}" y1="${f(sites[i][1])}" x2="${f(sites[j][0])}" y2="${f(sites[j][1])}"/>`).join('') + '</g>';
  g += `<polyline points="${route.map(v => P(sites[v])).join(' ')}" fill="none" stroke="${C.red}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  const sq = (p, s, fill) => `<rect x="${f(p[0] - s / 2)}" y="${f(p[1] - s / 2)}" width="${s}" height="${s}" fill="${fill}"/>`;
  return g + sites.map((p, i) => (route.includes(i) ? sq(p, 6.5, C.red) : sq(p, 4.6, C.ink))).join('');
}

/* ---------- 2. sdoc viewer: the pen stroke was in the bytes all along ---------- */

const SDOC = { bg: '#ECE6D8', ink: '#25272C', red: '#CC3B27' };

/** Hex-dump layout: 16 byte cells per row in two groups of 8, an offset column left, a text column right. */
const DUMP = { cw: 11, ch: 11, gap: 2.6, ggap: 7, rows: 18, x0: 90, y0: 164 };
const colX = c => DUMP.x0 + c * (DUMP.cw + DUMP.gap) + (c >= 8 ? DUMP.ggap : 0);
const rowY = k => DUMP.y0 + k * (DUMP.ch + DUMP.gap);

/**
 * A plausible file: a header, then pen-point records of three little-endian float32s (12 bytes).
 * Their exponent bytes barely change, so the records show up as a repeating diagonal weave.
 */
function fakeFile(r) {
  const bytes = [];
  for (let k = 0; k < DUMP.rows * 16; k++) {
    const row = Math.floor(k / 16);
    if (row < 3) bytes.push(r() < 0.3 ? 0 : Math.floor(r() * 256));
    else if (row === 3) bytes.push(r() < 0.6 ? 0 : Math.floor(r() * 256));
    else if (row >= DUMP.rows - 1) bytes.push(0);
    else {
      const inRec = ((k - 64) % 12) % 4;
      bytes.push(inRec === 3 ? 0x44 : inRec === 2 ? 0x60 + Math.floor(r() * 64) : Math.floor(r() * 256));
    }
  }
  return bytes;
}

/** A signature flourish across the dump: one loop, then a long wave, through jittered knots. */
function flourish(r) {
  const gw = colX(15) + DUMP.cw - DUMP.x0, gh = rowY(DUMP.rows - 1) + DUMP.ch - DUMP.y0;
  const knots = [[0.02, 0.8], [0.16, 0.62], [0.3, 0.3], [0.31, 0.1], [0.21, 0.15], [0.2, 0.42], [0.32, 0.7], [0.48, 0.74],
    [0.6, 0.55], [0.7, 0.42], [0.8, 0.5], [0.88, 0.62], [0.97, 0.36]]
    .map(([u, v], i) => [DUMP.x0 + gw * (u + (i && i < 12 ? (r() - 0.5) * 0.04 : 0)), DUMP.y0 + 14 + (gh - 28) * (v + (r() - 0.5) * 0.05)]);
  return catmullRom(knots, 24);
}

/** Walking along the stroke, every ~24 px light the byte whose centre the pen passes closest to. */
function litBytes(curve) {
  const key = new Set();
  let acc = 24, cand = null;
  for (let i = 1; i < curve.length; i++) {
    acc += dist(curve[i], curve[i - 1]);
    for (let k = 4; k < DUMP.rows - 1; k++) for (let c = 0; c < 16; c++) {
      const d = dist([colX(c) + DUMP.cw / 2, rowY(k) + DUMP.ch / 2], curve[i]);
      if (d < 2.6 && (!cand || d < cand.d)) cand = { k, c, d };
    }
    if (acc >= 24 && cand) { key.add(`${cand.k},${cand.c}`); acc = 0; cand = null; }
  }
  return key;
}

/** The stroke as a filled ribbon: heavy on downstrokes, tapering at both ends. */
function penRibbon(curve) {
  const left = [], right = [];
  curve.forEach((p, i) => {
    const a = curve[Math.max(0, i - 1)], b = curve[Math.min(curve.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, u = i / (curve.length - 1);
    const w = (1.25 + 2.4 * (0.5 + (0.5 * dy) / l)) * Math.sin(Math.PI * Math.min(1, 0.04 + u)) ** 0.35;
    left.push([p[0] - (dy / l) * w, p[1] + (dx / l) * w]);
    right.push([p[0] + (dy / l) * w, p[1] - (dx / l) * w]);
  });
  return `M${left.map(P).join('L')}L${right.reverse().map(P).join('L')}Z`;
}

/** sdoc cover: a hex dump, a few bytes lit red, and the pen stroke they decode to. */
function sdoc(seed) {
  const r = rng(seed ^ 0x9e3779b9);
  const bytes = fakeFile(r), curve = flourish(r), lit = litBytes(curve), C = SDOC;
  // one path per fill, so 576 little squares cost a few kilobytes
  const fills = new Map();
  const add = (key, d) => fills.set(key, (fills.get(key) || '') + d);
  const sq = (x, y, w, h) => `M${f(x)} ${f(y)}h${w}v${h}h${-w}z`;
  const shade = b => (b === 0 ? 0.07 : b === 0x44 ? 0.62 : Math.round((0.2 + (0.55 * b) / 255) * 13) / 13);
  for (let k = 0; k < DUMP.rows; k++) {
    add(`${C.ink}|.28`, sq(58, rowY(k) + 3, 22, 5));
    for (let c = 0; c < 16; c++) {
      const b = bytes[k * 16 + c], hit = lit.has(`${k},${c}`);
      add(hit ? `${C.red}|1` : `${C.ink}|${f(shade(b))}`, sq(colX(c), rowY(k), DUMP.cw, DUMP.ch));
      add(`${C.ink}|${b > 31 && b < 127 ? 0.5 : 0.12}`, sq(322 + c * 1.45, rowY(k) + 3.5, 0.9, 4));
    }
  }
  let g = `<rect width="${W}" height="${H}" fill="${C.bg}"/>` + panel(C.ink, 0.5);
  for (const [key, d] of fills) { const [fill, op] = key.split('|'); g += `<path d="${d}" fill="${fill}" fill-opacity="${op}"/>`; }
  // the stroke once, drawn twice: a paper halo to lift it off the bytes, then the ink
  return g + `<defs><path id="sdoc-ink" d="${penRibbon(curve)}"/></defs>` +
    `<use href="#sdoc-ink" fill="${C.bg}" stroke="${C.bg}" stroke-width="3" stroke-linejoin="round"/><use href="#sdoc-ink" fill="${C.red}"/>`;
}

/* ---------- 3. ASCII Dioramas: a tiny world of glyphs, sharp only through the middle ---------- */

const DIO = {
  bg: '#1C2230', frame: '#E9E2CF', water: '#62A0E6', sand: '#EAD49E', path: '#C9B994',
  grass: ['#8BC46D', '#A9CF6A', '#76B565'], tree: '#3E9A58', house: '#F4EBD8', red: '#F05A3C',
  side: ['#B9814E', '#9C6A3F', '#7F5633', '#66462B'], top: '#2A4434', left: '#3B2B20', right: '#2E2219',
};
const BLOCK = { n: 13, a: 11, b: 5.6, layers: 4, step: 9.4 };
const iso = (u, v) => [FR.x + FR.w / 2 + (u - v) * BLOCK.a, FR.y + 46 + (u + v) * BLOCK.b];

/** The block's top face: a pond and its stream, a beach, a village round one red house, a lane, woods, grass. */
function worldCell(r) {
  const nz = valueNoise(r, 16), wd = valueNoise(r, 16);
  const pond = [2 + r() * 2.5, 7.5 + r() * 2.5], vil = [7 + Math.floor(r() * 3), 2 + Math.floor(r() * 3)];
  const stream = v => pond[0] + 0.25 * (v - pond[1]) + 1.2 * Math.sin(v * 0.9);
  return (u, v) => {
    const fromPond = Math.hypot(u - pond[0], (v - pond[1]) * 0.8);
    if (fromPond < 2.3 || (v > pond[1] && Math.abs(u - stream(v)) < 0.6)) return ['~', DIO.water, 0];
    if (fromPond < 3.1) return ['.', DIO.sand, 0];
    if (u === vil[0] && v === vil[1]) return ['#', DIO.red, 3];
    if (Math.abs(u - vil[0]) <= 2 && Math.abs(v - vil[1]) <= 1 && (u + v) % 2 === 0) return ['#', DIO.house, 3];
    if (v === vil[1] + 2 && u > 2) return ['=', DIO.path, 0];
    if (wd(u / 3 + 5, v / 3 + 5) > 0.6) return ['^', DIO.tree, 4];
    const k = Math.min(2, Math.floor(nz(u / 4, v / 4) * 3));
    return [[',', '"', '\''][k], DIO.grass[k], 0];
  };
}

/** Every glyph of the block as [screen y, svg], back to front: the top face, then the two earth faces. */
function blockGlyphs(cell) {
  const { n, layers, step } = BLOCK, out = [];
  const esc = ch => (ch === '"' ? '&quot;' : ch === '\'' ? '&#39;' : ch);
  for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) {
    const [ch, col, lift] = cell(u, v), [x, y] = iso(u + 0.5, v + 0.5);
    out.push([y, `<text x="${f(x)}" y="${f(y - lift)}" fill="${col}">${esc(ch)}</text>`]);
  }
  for (let d = 1; d <= layers; d++) {
    for (let k = 0; k < n; k++) {
      const [xl, yl] = iso(k + 0.5, n), [xr, yr] = iso(n, k + 0.5);
      out.push([yl + d * step, `<text x="${f(xl)}" y="${f(yl + d * step)}" fill="${DIO.side[d - 1]}">#</text>`]);
      out.push([yr + d * step, `<text x="${f(xr)}" y="${f(yr + d * step)}" fill="${DIO.side[Math.min(3, d)]}" fill-opacity=".85">#</text>`]);
    }
  }
  return out.sort((p, q) => p[0] - q[0]);
}

/** Faint fills behind the glyphs, so the block reads as solid at thumbnail size. */
function blockFaces() {
  const { n, layers, step } = BLOCK, T = [iso(0, 0), iso(n, 0), iso(n, n), iso(0, n)], drop = layers * step + 4;
  const down = p => [p[0], p[1] + drop];
  return `<polygon points="${T.map(P).join(' ')}" fill="${DIO.top}"/>` +
    `<polygon points="${[T[3], T[2], down(T[2]), down(T[3])].map(P).join(' ')}" fill="${DIO.left}"/>` +
    `<polygon points="${[T[2], T[1], down(T[1]), down(T[2])].map(P).join(' ')}" fill="${DIO.right}"/>`;
}

/** Dioramas cover: the block, sharp in a band through its middle and blurred toward both corners. */
function dioramas(seed) {
  const r = rng(seed ^ 0x2545f491);
  const levels = [0, 0.5, 1, 1.6, 2.3, 3.1], focusY = iso(BLOCK.n / 2, BLOCK.n / 2)[1];
  const bands = levels.map(() => []);
  for (const [y, svg] of blockGlyphs(worldCell(r))) {
    const blur = Math.max(0, (Math.abs(y - focusY) - 14) * 0.045);
    bands[levels.reduce((lv, l, i) => (blur >= l ? i : lv), 0)].push(svg);
  }
  let defs = `<clipPath id="dio-win"><rect x="${FR.x}" y="${FR.y}" width="${FR.w}" height="${FR.h}"/></clipPath>`;
  levels.forEach((l, i) => { if (l) defs += `<filter id="dio-b${i}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${l}"/></filter>`; });
  return `<defs>${defs}</defs><rect width="${W}" height="${H}" fill="${DIO.bg}"/>` +
    `<g clip-path="url(#dio-win)" font-family="Menlo, 'SF Mono', Consolas, 'DejaVu Sans Mono', monospace" font-weight="700" font-size="15" text-anchor="middle" dominant-baseline="central">` +
    `<g filter="url(#dio-b2)">${blockFaces()}</g>` +
    bands.map((b, i) => (b.length ? `<g${i ? ` filter="url(#dio-b${i})"` : ''}>${b.join('')}</g>` : '')).join('') + '</g>' +
    panel(DIO.frame, 0.55);
}

/* ---------- output ---------- */

export const COVERS = [
  { file: 'atlas.svg', id: 'atlas', label: 'Cover for the Atlas of Theoretical Cryptography', draw: atlas },
  { file: 'sdoc.svg', id: 'sdoc', label: 'Cover for sdoc viewer', draw: sdoc },
  { file: 'dioramas.svg', id: 'dio', label: 'Cover for ASCII Dioramas', draw: dioramas },
];

/** The standalone SVG text of one cover, with a comment naming the seed that drew it. */
export function coverSvg(cover, seed) {
  return `<!-- scripts/covers.mjs, seed ${seed} -->\n${book(cover.id, cover.label, cover.draw(seed))}\n`;
}

/** Write every cover for `seed` into assets/covers/. */
function main(seed) {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'covers');
  mkdirSync(outDir, { recursive: true });
  for (const c of COVERS) {
    const svg = coverSvg(c, seed);
    writeFileSync(join(outDir, c.file), svg);
    console.log(`${c.file}: ${(svg.length / 1024).toFixed(1)} KB`);
  }
}

const invokedDirectly = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) main(Number(process.argv[2] ?? DEFAULT_SEED));
