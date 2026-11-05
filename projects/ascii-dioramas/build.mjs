#!/usr/bin/env node
// Build all scenes into a static site under dist/.
//
//   node build.mjs           -> dist/ ready for static hosting
//   node build.mjs --base /ascii-dioramas   -> set <base> for GH Pages subfolder
//
// Output:
//   dist/index.html           homepage
//   dist/<scene>/index.html   scene page
//   dist/<scene>/build/main.js bundled scene
//   dist/assets/...           shared assets (textures, models, thumbs)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(path.join(root, 'x.js'));
let esbuild;
try { esbuild = req('esbuild'); } catch { console.error('esbuild not found: run `npm install`'); process.exit(1); }

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const base = baseIdx >= 0 ? args[baseIdx + 1].replace(/\/$/, '') : '';

const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

function discoverScenes() {
  const scenesDir = path.join(root, 'scenes');
  return fs.readdirSync(scenesDir).filter(d =>
    fs.existsSync(path.join(scenesDir, d, 'main.js'))
  ).sort();
}

const SCENE_META = {
  harbour:        { title: 'Harbour',       desc: 'Fishing harbour with breakwater, boats, lighthouse', canvas: '1440×1440' },
  torii:          { title: 'Torii',          desc: 'Japanese torii gates along a cliff path to the sea', canvas: '1080×1920' },
  'temple-south': { title: 'Temple South',  desc: 'South Indian temple: gopuram towers, Nandi, pushkarini', canvas: '1080×1920' },
};

const scenes = discoverScenes();
console.log(`building ${scenes.length} scenes…`);

// bundle each scene
for (const name of scenes) {
  const sceneDir = path.join(root, 'scenes', name);
  const outDir = path.join(dist, name);
  fs.mkdirSync(path.join(outDir, 'build'), { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(sceneDir, 'main.js')],
    bundle: true, format: 'esm', minify: true,
    outfile: path.join(outDir, 'build', 'main.js'),
    logLevel: 'warning',
  });

  // scene index.html — assets resolve relative to base
  fs.writeFileSync(path.join(outDir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><style>html,body{margin:0;background:#000}canvas{display:block}</style><script type="module" src="build/main.js"></script>`);

  // copy shared assets into scene dir so relative paths (assets/tex/...) resolve
  copyDir(path.join(root, 'assets'), path.join(outDir, 'assets'));

  // copy scene-local assets on top (overrides shared if same name)
  const sceneAssets = path.join(sceneDir, 'assets');
  if (fs.existsSync(sceneAssets)) copyDir(sceneAssets, path.join(outDir, 'assets'));

  console.log(`  ${name} ✓`);
}

// copy shared assets
copyDir(path.join(root, 'assets'), path.join(dist, 'assets'));

// generate homepage
const items = scenes.map(name => {
  const m = SCENE_META[name] || { title: name, desc: '', canvas: '' };
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

const homepage = `<!doctype html>
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
    --bg: #fff;
    --fg: #222;
    --muted: #666;
    --rule: #999;
    --link: #1a4f8b;
    font-family: "EB Garamond", Garamond, Georgia, serif;
    font-size: 20px;
    line-height: 1.5;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #161616;
      --fg: #e4e4e4;
      --muted: #999;
      --rule: #666;
      --link: #8db4e2;
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #161616;
    --fg: #e4e4e4;
    --muted: #999;
    --rule: #666;
    --link: #8db4e2;
    color-scheme: dark;
  }
  body {
    margin: 0 auto;
    padding: 2.5rem 16px;
    max-width: 760px;
    background: var(--bg);
    color: var(--fg);
  }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  h1 { font-weight: 400; font-size: 2.2rem; margin: 0; }
  hr { border: none; border-top: 1px solid var(--rule); margin: 0.4rem 0 1rem; }
  h2 {
    font-weight: 400;
    font-size: 1.3rem;
    margin: 2rem 0 0.6rem;
    padding-bottom: 0.15rem;
    border-bottom: 1px dashed var(--rule);
  }
  .scenes { list-style: none; padding: 0; margin: 0; }
  .scenes li { margin: 0.8rem 0; }
  .scene-link {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    color: inherit;
    text-decoration: none;
    padding: 0.5rem;
    margin: -0.5rem;
    border-radius: 4px;
    transition: background 0.15s;
  }
  .scene-link:hover { background: color-mix(in srgb, var(--fg) 6%, transparent); text-decoration: none; }
  .scene-link:hover strong { color: var(--link); }
  .thumb {
    width: 120px;
    height: 80px;
    object-fit: cover;
    border-radius: 3px;
    flex-shrink: 0;
    border: 1px solid var(--rule);
  }
  .scene-text { padding-top: 0.1rem; }
  .scene-text strong { font-weight: 600; }
  .scene-desc { color: var(--muted); font-size: 0.92rem; }
  .dim { color: var(--muted); font-size: 0.85rem; }
  .about { margin-top: 0.4rem; }
  .about p { margin: 0.5rem 0; }
  .note {
    font-size: 0.88rem;
    color: var(--muted);
    font-style: italic;
    margin-top: 0.5rem;
  }
  footer {
    margin-top: 3rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  #theme-toggle {
    font: inherit;
    color: var(--muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.2rem 0.4rem;
  }
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
  <p class="note">Press Space to pause.</p>

  <h2>About</h2>
  <div class="about">
    <p>Started in November 2026 as a side project inside
    <a href="https://github.com/sanathNU/Curiositas">Curiositas</a>, after seeing
    ASCII diorama demos circulating online—in particular the work by
    <a href="https://x.com/HelloVyom/status/2116539949080272964">@HelloVyom</a> and
    <a href="https://x.com/dhruvtwt_/status/2117295437535482001">@dhruvtwt_</a>
    (<a href="https://github.com/JDhruv14/ascii-diorama">repo</a>).</p>
    <p>Each scene is a single <code>main.js</code> that draws instanced geometry
    (grass, flowers, trees, props) into a half-float render target, then runs it
    through a glyph shader that picks characters by surface class and brightness,
    followed by a tilt-shift bokeh pass. The camera sweeps slowly back and forth;
    a small creature walks through.</p>
  </div>

  <footer>
    <a href="https://github.com/sanathNU/Curiositas">&larr; Curiositas</a> &middot;
    <a href="https://sanathnu.github.io/TechnicaInsania/">Blog</a> &middot;
    <a href="https://github.com/sanathNU/Curiositas">Source</a>
  </footer>
</body>
</html>`;

fs.writeFileSync(path.join(dist, 'index.html'), homepage);
console.log(`\ndist/ ready (${scenes.length} scenes)`);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
