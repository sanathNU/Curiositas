// Shared by serve.mjs (dev) and build.mjs (static): scene list, page HTML, bundling.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Homepage entries. A scene folder without an entry here still shows, with its folder name.
 * `canvas` is the aspect the scene was composed for; every scene fills whatever screen it is on.
 */
export const SCENE_META = {
  harbour: { title: 'Harbour', desc: 'Fishing harbour: a cliff path down to a wooden pier and moored boats', canvas: 'composed 1:1' },
  mangroves: { title: 'Mangroves', desc: 'Dusk in a mangrove swamp: a lantern-lit boardwalk to a stilt hut, trees on arching prop roots', canvas: 'composed 9:16' },
  summit: { title: 'Summit', desc: 'Himalayan summit: prayer flags streaming in the wind above a sea of cloud', canvas: 'composed 9:16' },
  'temple-south': { title: 'Temple South', desc: 'South Indian temple: gopuram towers, Nandi, pushkarini', canvas: 'composed 9:16' },
  picture: { title: 'Picture', desc: 'Any picture drawn as glyphs: colours sorted into surfaces, the same glyph and tilt-shift passes', canvas: 'any image' },
  torii: { title: 'Torii', desc: 'Senbon torii: vermilion gates and stone lanterns down a cliff to the sea', canvas: 'composed 9:16' },
};
const meta = (name) => SCENE_META[name] ?? { title: name, desc: '', canvas: '' };

export function discoverScenes() {
  const dir = path.join(root, 'scenes');
  return fs.readdirSync(dir).filter(d => fs.existsSync(path.join(dir, d, 'main.js'))).sort();
}

export function loadEsbuild() {
  try { return createRequire(path.join(root, 'x.js'))('esbuild'); } catch { console.error('esbuild not found: run `npm install` in ascii-dioramas/'); process.exit(1); }
}

/** Bundle scenes/<name>/main.js (and the engine it imports) into one ES module. */
export function bundleScene(esbuild, name, outfile, { minify = false } = {}) {
  return esbuild.build({ entryPoints: [path.join(root, 'scenes', name, 'main.js')], bundle: true, format: 'esm', minify, outfile, logLevel: 'warning' });
}

export function sceneHtml(name) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${meta(name).title} · ASCII Dioramas</title><style>html,body{margin:0;background:#000}canvas{display:block}</style><script type="module" src="build/main.js"></script>`;
}

/** Curiositas-styled index. `base` prefixes every link (the Pages subpath); `home` is the back link. */
export function homepageHtml(scenes, { base = '', home = 'https://github.com/sanathNU/Curiositas' } = {}) {
  const items = scenes.map(name => {
    const m = meta(name);
    return `    <li>
      <a class="scene-link" href="${base}/${name}/">
        <img class="thumb" src="${base}/assets/thumbs/${name}.jpg" alt="${m.title}" loading="lazy">
        <div class="scene-text">
          <strong>${m.title}</strong> <span class="dim">${m.canvas}</span>
          <br><span class="scene-desc">${m.desc}</span>
        </div>
      </a>
    </li>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ASCII Dioramas · Curiositas</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap">
<style>
  :root {
    --bg: #fff; --fg: #222; --muted: #666; --rule: #999; --link: #1a4f8b;
    font-family: "EB Garamond", Garamond, Georgia, serif; font-size: 20px; line-height: 1.5; color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --bg: #161616; --fg: #e4e4e4; --muted: #999; --rule: #666; --link: #8db4e2; color-scheme: dark; }
  }
  :root[data-theme="dark"] { --bg: #161616; --fg: #e4e4e4; --muted: #999; --rule: #666; --link: #8db4e2; color-scheme: dark; }
  body { margin: 0 auto; padding: 2.5rem 16px; max-width: 760px; background: var(--bg); color: var(--fg); }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  header { display: flex; justify-content: space-between; align-items: baseline; }
  h1 { font-weight: 400; font-size: 2.2rem; margin: 0; }
  hr { border: none; border-top: 1px solid var(--rule); margin: 0.4rem 0 1rem; }
  h2 { font-weight: 400; font-size: 1.3rem; margin: 2rem 0 0.6rem; padding-bottom: 0.15rem; border-bottom: 1px dashed var(--rule); }
  code { font-size: 0.85em; }
  .scenes { list-style: none; padding: 0; margin: 0; }
  .scenes li { margin: 0.8rem 0; }
  .scene-link { display: flex; align-items: flex-start; gap: 1rem; color: inherit; text-decoration: none; padding: 0.5rem; margin: -0.5rem; border-radius: 4px; transition: background 0.15s; }
  .scene-link:hover { background: color-mix(in srgb, var(--fg) 6%, transparent); text-decoration: none; }
  .scene-link:hover strong { color: var(--link); }
  .thumb { width: 120px; height: 80px; object-fit: cover; border-radius: 3px; flex-shrink: 0; border: 1px solid var(--rule); }
  .scene-text { padding-top: 0.1rem; min-width: 0; }
  .scene-text strong { font-weight: 600; }
  .scene-desc { color: var(--muted); font-size: 0.92rem; }
  .dim { color: var(--muted); font-size: 0.85rem; }
  .about p { margin: 0.5rem 0; }
  .note { font-size: 0.88rem; color: var(--muted); font-style: italic; margin-top: 0.8rem; }
  footer { margin-top: 3rem; font-size: 0.85rem; color: var(--muted); }
  #theme-toggle { font: inherit; color: var(--muted); background: none; border: none; cursor: pointer; padding: 0.2rem 0.4rem; }
  #theme-toggle:hover { color: var(--fg); }
</style>
<script>
(function () {
  var KEY = "curiositas-theme", root = document.documentElement;
  try { var s = localStorage.getItem(KEY); if (s === "light" || s === "dark") root.dataset.theme = s; } catch (_) {}
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.getElementById("theme-toggle");
    if (!b) return;
    b.addEventListener("click", function () {
      var next = (root.dataset.theme || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light")) === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch (_) {}
    });
  });
})();
</script>
</head>
<body>
  <header>
    <h1>ASCII Dioramas</h1>
    <button id="theme-toggle" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">&#9680;</button>
  </header>
  <hr>
  <p>Miniature 3D worlds rendered as coloured monospace glyphs with a tilt-shift blur, seen from high above through a long lens.</p>

  <h2>Scenes</h2>
  <ul class="scenes">
${items}
  </ul>
  <p class="note">Scenes fill any screen, phone to ultrawide. <kbd>S</kbd> plays each scene's own polyrhythmic music. Space pauses. Add <code>?fox=still</code>, <code>?fox=off</code>, <code>?tilt=off</code>, <code>?title=off</code>, <code>?t=12</code> (frozen at 12&nbsp;s) or <code>?res=phone</code> (also <code>tablet</code>, <code>laptop</code>, <code>desktop</code>, <code>4k</code>, <code>ultrawide</code>, <code>1280x720</code>) to any scene's address.</p>

  <h2>About</h2>
  <div class="about">
    <p>Started in November 2026 as a side project inside
    <a href="https://github.com/sanathNU/Curiositas">Curiositas</a>, after seeing
    ASCII diorama demos circulating online&mdash;in particular the work by
    <a href="https://x.com/HelloVyom/status/2116539949080272964">@HelloVyom</a> and
    <a href="https://x.com/dhruvtwt_/status/2117295437535482001">@dhruvtwt_</a>
    (<a href="https://github.com/JDhruv14/ascii-diorama">repo</a>).</p>
    <p>Each scene is a short <code>main.js</code> on a shared engine: it shapes the land,
    places instanced grass, flowers, trees and props, and renders them into a half-float
    target. A glyph shader then redraws every cell as a character chosen by surface and
    brightness, and a tilt-shift pass blurs the top and bottom like a miniature photograph.
    The camera sweeps slowly back and forth while a small creature walks through.</p>
  </div>

  <footer>
    <a href="${home}">&larr; Curiositas</a> &middot;
    <a href="https://sanathnu.github.io/TechnicaInsania/">Blog</a> &middot;
    <a href="https://github.com/sanathNU/Curiositas">Source</a>
  </footer>
</body>
</html>`;
}
