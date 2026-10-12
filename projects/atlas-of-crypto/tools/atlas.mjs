#!/usr/bin/env node
// Maintenance tool for the atlas data. No dependencies; run with `node tools/atlas.mjs <command>`.
//
//   check                      cross-check every data file against the topic list
//   carve <new> <parent> [f]   give topic <new> a share f (default 0.45) of <parent>'s province,
//                              then re-place both labels and their keywords; rewrites data/geo.js
//   relabel <id>               re-place one topic's label and keywords inside its own cells
//
// Provinces in GEO.prov are unions of convex cells (one "M…Z" ring per cell). Carving hands over
// whole cells when that lands near the requested share, and otherwise cuts the largest cell straight
// across its long axis, which matches the straight cell edges elsewhere on the map.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = ["areas", "topics", "links", "keywords", "reading", "notes", "geo"];
const NAMES = ["CL", "SEC", "LEG", "NODES", "EDGES", "SUB", "RES", "SHORT", "NOTES", "BODY", "GEO"];

function load() {
  const src = DATA.map(f => readFileSync(join(root, "data", f + ".js"), "utf8")).join("\n");
  return vm.runInNewContext(`${src}\n;({${NAMES.join(",")}})`);
}

/* ---------- geometry ---------- */
const rings = d => d.split("M").filter(Boolean)
  .map(r => r.replace(/Z/g, "").trim().split(/\s*L/).map(p => p.split(",").map(Number)));
const toPath = rs => rs.map(r => "M" + r.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L") + "Z").join("");
const area = r => Math.abs(r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const centroid = r => { const n = r.length; return [r.reduce((a, p) => a + p[0], 0) / n, r.reduce((a, p) => a + p[1], 0) / n]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function inside([x, y], rs) {   // even-odd rule, matching fill-rule on the map
  let c = false;
  for (const r of rs) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function edgeDist(p, rs) {
  let best = Infinity;
  for (const r of rs) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, dist(p, [a[0] + t * dx, a[1] + t * dy]));
  }
  return best;
}

/** Interior point farthest from any edge (a grid-search pole of inaccessibility), biased to wide labels. */
function labelPoint(rs) {
  const xs = rs.flat().map(p => p[0]), ys = rs.flat().map(p => p[1]);
  let best = null, score = -1;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2)
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 2) {
      if (!inside([x, y], rs)) continue;
      // horizontal room counts double: labels are wider than tall
      const s = Math.min(edgeDist([x, y], rs), edgeDist([x - 12, y], rs) + 6, edgeDist([x + 12, y], rs) + 6);
      if (s > score) { score = s; best = [x, y]; }
    }
  return best.map(v => Math.round(v * 10) / 10);
}

/** Keyword anchors on rings around the label, inside the province when possible. */
function keywordPoints(rs, centre, count) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const ang = -Math.PI / 2 + (2 * Math.PI * k) / count + 0.35;
    let p = null;
    for (const rad of [58, 50, 42, 34, 26]) {
      const q = [centre[0] + rad * Math.cos(ang), centre[1] + rad * 0.72 * Math.sin(ang)];
      if (inside(q, rs)) { p = q; break; }
    }
    p ??= [centre[0] + 30 * Math.cos(ang), centre[1] + 22 * Math.sin(ang)];
    out.push(p.map(v => Math.round(v * 10) / 10));
  }
  return out;
}

/* ---------- commands ---------- */
function relabel(D, id) {
  const rs = rings(D.GEO.prov[id]);
  // label sits in the largest cell so it never lands on a border between cells of the same province
  const big = rs.reduce((a, r) => (area(r) > area(a) ? r : a));
  D.GEO.main[id] = labelPoint([big]);
  const kws = D.SUB[id] || [];
  const pts = keywordPoints(rs, D.GEO.main[id], kws.length);
  D.GEO.subs = D.GEO.subs.filter(s => s[1] !== id).concat(kws.map((w, i) => [w, id, ...pts[i]]));
}

/** Sutherland–Hodgman clip of ring r to the half-plane n·p >= c (cells are convex, so this is exact). */
function clipHalf(r, n, c) {
  const out = [], f = p => n[0] * p[0] + n[1] * p[1] - c;
  r.forEach((p, i) => {
    const q = r[(i + 1) % r.length], fp = f(p), fq = f(q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
  });
  return out;
}

/** Cut ring r across its long axis so the piece facing away from `keep` has area ≈ want. */
function splitCell(r, want, keep) {
  const [cx, cy] = centroid(r);
  let sxx = 0, syy = 0, sxy = 0;
  r.forEach(([x, y]) => { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); });
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let n = [Math.cos(th), Math.sin(th)];                       // long axis; cuts run perpendicular to it
  if ((cx - keep[0]) * n[0] + (cy - keep[1]) * n[1] < 0) n = [-n[0], -n[1]];   // point away from what stays
  const proj = r.map(p => n[0] * p[0] + n[1] * p[1]);
  let lo = Math.min(...proj), hi = Math.max(...proj);
  for (let k = 0; k < 40; k++) { const c = (lo + hi) / 2; area(clipHalf(r, n, c)) > want ? (lo = c) : (hi = c); }
  return [clipHalf(r, n, lo), clipHalf(r, [-n[0], -n[1]], -lo)];   // [given away, kept]
}

function carve(D, id, parent, share = 0.45) {
  share = Number(share);
  const rs = rings(D.GEO.prov[parent]), total = rs.reduce((a, r) => a + area(r), 0);
  // walk outward from the cell farthest from the parent's label, so the new province is one piece
  const anchor = D.GEO.main[parent];
  const far = rs.map((r, i) => [dist(centroid(r), anchor), i]).sort((a, b) => b[0] - a[0])[0][1];
  const order = rs.map((r, i) => [dist(centroid(r), centroid(rs[far])), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  // take whole cells while they fit under the target, then cut the next one for the remainder
  const target = share * total, give = [];
  let acc = 0, k = 0;
  while (k < order.length - 1 && acc + area(rs[order[k]]) <= target) acc += area(rs[order[k++]]);
  const keep = order.slice(k + 1).map(i => rs[i]);
  const next = rs[order[k]], rest = target - acc;
  if (rest > 0.1 * total && rest < area(next) - 0.1 * total) {
    const away = keep.length ? centroid(keep.flat()) : anchor;
    const [g, kept] = splitCell(next, rest, away);
    give.push(g); keep.push(kept);
  } else keep.push(next);
  give.unshift(...order.slice(0, k).map(i => rs[i]));
  if (!give.length) throw new Error(`could not carve ${share} of ${parent}`);
  D.GEO.prov[id] = toPath(give);
  D.GEO.prov[parent] = toPath(keep);
  relabel(D, parent);
  relabel(D, id);
  return (give.reduce((a, r) => a + area(r), 0) / total).toFixed(2);
}

function check(D) {
  const ids = new Set(D.NODES.map(n => n.id)), errs = [];
  const need = { BODY: D.BODY, SUB: D.SUB, NOTES: D.NOTES, "GEO.prov": D.GEO.prov, "GEO.main": D.GEO.main };
  D.NODES.forEach(n => {
    if (!D.CL[n.c]) errs.push(`${n.id}: unknown country ${n.c}`);
    for (const [k, m] of Object.entries(need)) if (!m[n.id]) errs.push(`${n.id}: missing in ${k}`);
  });
  for (const [k, m] of Object.entries(need)) for (const id of Object.keys(m)) if (!ids.has(id)) errs.push(`${k}: stray id ${id}`);
  D.EDGES.forEach(([s, t]) => { if (!ids.has(s) || !ids.has(t)) errs.push(`edge ${s} -> ${t}: unknown topic`); });
  Object.entries(D.NOTES).forEach(([id, rs]) => rs.forEach(r => { if (!D.RES[r]) errs.push(`${id}: unknown text ${r}`); }));
  Object.entries(D.BODY).forEach(([id, b]) => {
    for (const [, ref] of b.t.matchAll(/\[\[([^|\]]+)/g)) if (!ids.has(ref)) errs.push(`${id}: note links to unknown [[${ref}]]`);
  });
  D.GEO.subs.forEach(([w, id]) => { if (!(D.SUB[id] || []).includes(w)) errs.push(`GEO.subs: '${w}' not a keyword of ${id}`); });
  Object.entries(D.SUB).forEach(([id, ws]) => ws.forEach(w => {
    if (!D.GEO.subs.some(s => s[0] === w && s[1] === id)) errs.push(`${id}: keyword '${w}' has no map position`);
  }));
  const orphan = [...ids].filter(id => !D.EDGES.some(([s, t]) => s === id || t === id));
  orphan.forEach(id => errs.push(`${id}: no links`));
  console.log(`${ids.size} topics, ${D.EDGES.length} links, ${D.GEO.subs.length} keywords`);
  errs.forEach(e => console.log("  ✗ " + e));
  if (errs.length) process.exitCode = 1; else console.log("  ✓ consistent");
}

function saveGeo(D) {
  const head = "// Generated map geometry. Edit with tools/atlas.mjs, not by hand.\n";
  writeFileSync(join(root, "data", "geo.js"), `${head}const GEO = ${JSON.stringify(D.GEO)};\n`);
}

const [cmd, ...args] = process.argv.slice(2);
const D = load();
if (cmd === "check") check(D);
else if (cmd === "carve") { const f = carve(D, ...args); saveGeo(D); console.log(`carved ${args[0]} from ${args[1]} (${f} of its area)`); }
else if (cmd === "relabel") { relabel(D, args[0]); saveGeo(D); }
else { console.log("usage: node tools/atlas.mjs check | carve <new> <parent> [share] | relabel <id>"); process.exitCode = 2; }
