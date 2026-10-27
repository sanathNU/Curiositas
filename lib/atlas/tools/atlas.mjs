#!/usr/bin/env node
// Atlas CLI. No dependencies.
//
//   node lib/atlas/tools/atlas.mjs check    [atlas dir]              validate the data
//   node lib/atlas/tools/atlas.mjs generate [atlas dir] [--seed N]   draw the map into data/geo.js
//   node lib/atlas/tools/atlas.mjs build    [atlas dir] [--link]     check, then write the page to dist/
//
// The atlas dir (default: the current directory) holds data/. --link symlinks the engine and the data
// into dist/ instead of copying them, so edits show up on refresh under scripts/serve.sh. Figures in
// data/figs/ are inlined into dist/figs.js by every build, so a changed figure needs a new build.
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { DATA, engine, load, saveGeo } from "./lib.mjs";
import { generate } from "./generate.mjs";

const PAGE = ["style.css", "theme.js", "app.js"];          // engine files copied next to index.html
const SITE_TEXT = ["title", "description", "tagline", "mapLabel", "about"];
const COLOURS = 9;                                          // --f-0 … --f-8 in style.css
const FIG_W = 420;                                          // every figure's viewBox width, so text sizes match
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Validate loaded atlas data. Returns a list of problems, empty when the atlas is consistent. */
function check(D) {
  const ids = new Set(D.NODES.map(n => n.id)), errs = [];
  const links = (where, text) => { for (const [, ref] of String(text).matchAll(/\[\[([^|\]]+)/g)) if (!ids.has(ref)) errs.push(`${where} links to unknown [[${ref}]]`); };
  SITE_TEXT.forEach(k => { if (typeof D.SITE[k] !== "string" || !D.SITE[k]) errs.push(`SITE.${k} is missing`); });
  ["about", "begin"].forEach(k => links(`SITE.${k}`, D.SITE[k] || ""));
  (D.SITE.hideReading || []).forEach(r => { if (!D.RES[r]) errs.push(`SITE.hideReading: unknown text ${r}`); });
  Object.keys(D.CL).forEach(c => { if (!D.LEG.includes(c)) errs.push(`country ${c}: missing in LEG`); if (!D.SEC[c]) errs.push(`country ${c}: missing in SEC`); });
  D.LEG.forEach(c => { if (!D.CL[c]) errs.push(`LEG: unknown country ${c}`); });
  if (!D.GEO) errs.push("data/geo.js is missing: run atlas.mjs generate");
  const GEO = D.GEO || { prov: {}, main: {}, subs: [] };
  const need = { BODY: D.BODY, SUB: D.SUB, NOTES: D.NOTES, ...(D.GEO && { "GEO.prov": GEO.prov, "GEO.main": GEO.main }) };
  D.NODES.forEach(n => {
    if (!D.CL[n.c]) errs.push(`${n.id}: unknown country ${n.c}`);
    for (const [k, m] of Object.entries(need)) if (!m[n.id]) errs.push(`${n.id}: missing in ${k}`);
  });
  for (const [k, m] of Object.entries(need)) for (const id of Object.keys(m)) if (!ids.has(id)) errs.push(`${k}: stray id ${id}`);
  D.EDGES.forEach(([s, t]) => { if (!ids.has(s) || !ids.has(t)) errs.push(`edge ${s} -> ${t}: unknown topic`); });
  Object.entries(D.NOTES).forEach(([id, rs]) => rs.forEach(r => { if (!D.RES[r]) errs.push(`${id}: unknown text ${r}`); }));
  Object.entries(D.BODY).forEach(([id, b]) => links(`${id}: note`, b.t));
  GEO.subs.forEach(([w, id]) => { if (!(D.SUB[id] || []).includes(w)) errs.push(`GEO.subs: '${w}' not a keyword of ${id}`); });
  if (D.GEO) Object.entries(D.SUB).forEach(([id, ws]) => ws.forEach(w => {
    if (!GEO.subs.some(s => s[0] === w && s[1] === id)) errs.push(`${id}: keyword '${w}' has no map position (regenerate the map)`);
  }));
  [...ids].filter(id => !D.EDGES.some(([s, t]) => s === id || t === id)).forEach(id => errs.push(`${id}: no links`));
  errs.push(...checkFigures(D, ids, links));
  return errs;
}

/** Figures: one per topic at most, captioned in notes.js, sized and labelled alike, with ids that stay
 *  unique when several notes are open, and no scripts. */
function checkFigures(D, ids, links) {
  const errs = [];
  Object.entries(D.FIG).forEach(([id, svg]) => {
    const at = `figs/${id}.svg`;
    if (!ids.has(id)) errs.push(`${at}: unknown topic`);
    if (!/^<svg[\s>]/.test(svg)) errs.push(`${at}: must start with <svg>`);
    if (!new RegExp(`viewBox="0 0 ${FIG_W} [\\d.]+"`).test(svg)) errs.push(`${at}: viewBox must be "0 0 ${FIG_W} <height>"`);
    if (!/aria-label="[^"]+"/.test(svg)) errs.push(`${at}: needs an aria-label`);
    if (/<script|\son\w+\s*=/i.test(svg)) errs.push(`${at}: no scripts or event handlers`);
    for (const [, x] of svg.matchAll(/\sid="([^"]*)"/g)) if (!x.startsWith(id + "-")) errs.push(`${at}: id "${x}" must start with "${id}-"`);
    if (!D.BODY[id]?.f) errs.push(`${id}: figure has no caption (f in notes.js)`);
  });
  Object.entries(D.BODY).forEach(([id, b]) => {
    if (b.f && !D.FIG[id]) errs.push(`${id}: caption but no data/figs/${id}.svg`);
    if (b.f) links(`${id}: caption`, b.f);
  });
  return errs;
}

/** Print the check result for an atlas; true when it passed. */
function report(D) {
  const errs = check(D);
  console.log(`${D.NODES.length} topics, ${D.EDGES.length} links, ${D.GEO ? D.GEO.subs.length : 0} keywords, `
    + `${Object.keys(D.FIG).length} figures`);
  if (D.LEG.length > COLOURS) console.log(`  note: ${D.LEG.length} countries share ${COLOURS} colours`);
  errs.forEach(e => console.log("  ✗ " + e));
  if (!errs.length) console.log("  ✓ consistent");
  return !errs.length;
}

/** Fill the engine's index.html from SITE and put it, the engine files, the data and the inlined figures
 *  (figs.js) into <dir>/dist. */
function build(dir, link) {
  const out = join(dir, "dist"), D = load(dir);
  if (!report(D)) return false;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out);
  writeFileSync(join(out, "figs.js"), "// Generated by atlas.mjs build from data/figs/. Do not edit by hand.\n"
    + `const FIG = ${JSON.stringify(D.FIG)};\n`);
  const scripts = [...DATA.map(f => `data/${f}.js`), "figs.js"].map(s => `<script src="${s}"></script>`).join("\n");
  const html = readFileSync(join(engine, "index.html"), "utf8").replace(/^<!--.*-->\n/m, "")
    .replace(/\{\{(\w+)\}\}/g, (m, k) => (k === "scripts" ? scripts : esc(D.SITE[k])));
  writeFileSync(join(out, "index.html"), html);
  const put = (src, name) => (link ? symlinkSync(relative(out, src), join(out, name)) : cpSync(src, join(out, name), { recursive: true }));
  PAGE.forEach(f => put(join(engine, f), f));
  put(join(dir, "data"), "data");
  const shown = relative(process.cwd(), out);
  console.log(`  ${link ? "linked" : "built"} ${shown.startsWith("..") ? out : shown}`);
  return true;
}

function draw(dir, seed) {
  const D = load(dir), t0 = Date.now(), { geo, pieces, countries } = generate(D, seed), bytes = saveGeo(dir, geo);
  console.log(`seed ${seed}: ${D.NODES.length} provinces, ${countries.length} countries, map ${geo.W}×${geo.H}, `
    + `geo.js ${(bytes / 1024).toFixed(0)} KB, ${Date.now() - t0} ms`);
  if (pieces.length) console.log(`  provinces in several pieces: ${pieces.join(" ")}`);
  console.log("  countries: " + countries.join(" "));
}

const args = process.argv.slice(2), seedAt = args.indexOf("--seed");
const seed = seedAt >= 0 ? Number(args[seedAt + 1]) : 7;
const [cmd, dirArg = "."] = args.filter((a, i) => !a.startsWith("--") && (seedAt < 0 || i !== seedAt + 1));
const dir = resolve(dirArg);
if (cmd === "check") process.exitCode = report(load(dir)) ? 0 : 1;
else if (cmd === "generate") draw(dir, seed);
else if (cmd === "build") process.exitCode = build(dir, args.includes("--link")) ? 0 : 1;
else { console.log("usage: node lib/atlas/tools/atlas.mjs check|generate|build [atlas dir] [--seed N] [--link]"); process.exitCode = 2; }
