#!/usr/bin/env node
// Data checker for the atlas. No dependencies; run with `node tools/atlas.mjs check`.
// The deploy workflow runs it, so it must pass before anything ships.
import { load } from "./lib.mjs";

function check(D) {
  const ids = new Set(D.NODES.map(n => n.id)), errs = [];
  if (!D.GEO) errs.push("data/geo.js is missing: run node tools/generate.mjs");
  const GEO = D.GEO || { prov: {}, main: {}, subs: [] };
  const need = { BODY: D.BODY, SUB: D.SUB, NOTES: D.NOTES, "GEO.prov": GEO.prov, "GEO.main": GEO.main };
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
  GEO.subs.forEach(([w, id]) => { if (!(D.SUB[id] || []).includes(w)) errs.push(`GEO.subs: '${w}' not a keyword of ${id}`); });
  Object.entries(D.SUB).forEach(([id, ws]) => ws.forEach(w => {
    if (!GEO.subs.some(s => s[0] === w && s[1] === id)) errs.push(`${id}: keyword '${w}' has no map position (regenerate the map)`);
  }));
  const orphan = [...ids].filter(id => !D.EDGES.some(([s, t]) => s === id || t === id));
  orphan.forEach(id => errs.push(`${id}: no links`));
  console.log(`${ids.size} topics, ${D.EDGES.length} links, ${GEO.subs.length} keywords`);
  errs.forEach(e => console.log("  ✗ " + e));
  if (errs.length) process.exitCode = 1; else console.log("  ✓ consistent");
}

const [cmd] = process.argv.slice(2);
if (cmd === "check") check(load());
else { console.log("usage: node tools/atlas.mjs check   (to rebuild the map: node tools/generate.mjs)"); process.exitCode = 2; }
