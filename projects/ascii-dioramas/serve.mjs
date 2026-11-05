#!/usr/bin/env node
// Serve all diorama scenes from one server.
//
//   node serve.mjs [port]         -> homepage at http://127.0.0.1:<port>/
//   node serve.mjs harbour [port] -> single scene (legacy)
//
// Homepage lists every scene; clicking one opens it at /<name>/.
// Each scene's bundle rebuilds on page reload.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const req = createRequire(path.join(root, 'x.js'));
let esbuild;
try { esbuild = req('esbuild'); } catch { console.error('esbuild not found: run `npm install` in the dioramas root'); process.exit(1); }

function discoverScenes() {
  const scenesDir = path.join(root, 'scenes');
  if (!fs.existsSync(scenesDir)) return [];
  return fs.readdirSync(scenesDir).filter(d =>
    fs.existsSync(path.join(scenesDir, d, 'main.js'))
  ).sort();
}

const SCENE_META = {
  harbour:       { title: 'Harbour',       desc: 'Fishing harbour with breakwater, boats, lighthouse', canvas: '1440×1440' },
  torii:         { title: 'Torii',          desc: 'Japanese torii gates along a cliff path to the sea', canvas: '1080×1920' },
  'temple-south': { title: 'Temple South', desc: 'South Indian temple: gopuram towers, Nandi, pushkarini', canvas: '1080×1920' },
};

function buildBundle(name) {
  const sceneDir = path.join(root, 'scenes', name);
  const buildDir = path.join(sceneDir, 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  return esbuild.build({
    entryPoints: [path.join(sceneDir, 'main.js')],
    bundle: true, format: 'esm',
    outfile: path.join(buildDir, 'main.js'),
    logLevel: 'warning',
  });
}

function ensureSceneHtml(name) {
  const sceneDir = path.join(root, 'scenes', name);
  const htmlPath = path.join(sceneDir, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    fs.writeFileSync(htmlPath,
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><style>html,body{margin:0;background:#000}canvas{display:block}</style><script type="module" src="./build/main.js"></script>`);
  }
}

function homepageHtml(scenes) {
  const items = scenes.map(name => {
    const m = SCENE_META[name] || { title: name, desc: '', canvas: '' };
    return `    <li>
      <a class="scene-link" href="/${name}/">
        <img class="thumb" src="/assets/thumbs/${name}.jpg" alt="${m.title}" loading="lazy">
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
  <p class="note">Press Space to pause. Each reload rebuilds the bundle.</p>

  <h2>About</h2>
  <div class="about">
    <p>Started in November 2026 as a side project inside
    <a href="https://github.com/sanathNU/Curiositas">Curiositas</a>, after seeing
    ASCII diorama demos circulating online&mdash;in particular the work by
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
}

// --- legacy single-scene mode ---
const firstArg = process.argv[2];
const isLegacy = firstArg && isNaN(+firstArg);
const port = +(isLegacy ? (process.argv[3] || 5173) : (firstArg || 5173));

const scenes = discoverScenes();
if (!scenes.length) { console.error('no scenes found in scenes/'); process.exit(1); }

if (isLegacy && !scenes.includes(firstArg)) {
  console.error(`unknown scene: ${firstArg}\navailable: ${scenes.join(', ')}`);
  process.exit(1);
}

// pre-build all scenes (or just the one in legacy mode)
const toBuild = isLegacy ? [firstArg] : scenes;
for (const s of toBuild) {
  ensureSceneHtml(s);
  await buildBundle(s);
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.json': 'application/json', '.bin': 'application/octet-stream',
  '.hdr': 'application/octet-stream', '.css': 'text/css',
};

http.createServer(async (q, res) => {
  const url = decodeURIComponent(q.url.split('?')[0]);

  // legacy single-scene mode: same as before
  if (isLegacy) {
    const sceneDir = path.join(root, 'scenes', firstArg);
    if (url === '/build/main.js') { try { await buildBundle(firstArg); } catch (e) { console.log(e.message); } }
    const scenePath = path.join(sceneDir, url === '/' ? '/index.html' : url);
    const rootPath = path.join(root, url === '/' ? '/index.html' : url);
    let p;
    if (scenePath.startsWith(sceneDir) && fs.existsSync(scenePath) && !fs.statSync(scenePath).isDirectory()) p = scenePath;
    else if (rootPath.startsWith(root) && fs.existsSync(rootPath) && !fs.statSync(rootPath).isDirectory()) p = rootPath;
    else { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    return fs.createReadStream(p).pipe(res);
  }

  // --- multi-scene mode ---

  // homepage
  if (url === '/' || url === '/index.html') {
    const html = homepageHtml(discoverScenes());
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return res.end(html);
  }

  // scene routes: /<name>/ or /<name>/...
  const parts = url.replace(/^\//, '').split('/');
  const sceneName = parts[0];

  // redirect /<name> -> /<name>/ so relative paths resolve
  if (scenes.includes(sceneName) && !url.endsWith('/') && parts.length === 1) {
    res.writeHead(302, { location: `/${sceneName}/` });
    return res.end();
  }

  if (scenes.includes(sceneName)) {
    const sceneDir = path.join(root, 'scenes', sceneName);
    const rest = '/' + parts.slice(1).join('/');

    // rebuild on bundle request
    if (rest === '/build/main.js') {
      try { await buildBundle(sceneName); } catch (e) { console.log(e.message); }
    }

    const scenePath = path.join(sceneDir, rest === '/' ? '/index.html' : rest);
    const rootPath = path.join(root, rest === '/' ? '/index.html' : rest);

    let p;
    if (scenePath.startsWith(sceneDir) && fs.existsSync(scenePath) && !fs.statSync(scenePath).isDirectory()) {
      p = scenePath;
    } else if (rootPath.startsWith(root) && fs.existsSync(rootPath) && !fs.statSync(rootPath).isDirectory()) {
      p = rootPath;
    } else {
      res.writeHead(404); return res.end();
    }

    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    return fs.createReadStream(p).pipe(res);
  }

  // shared assets at root level (e.g. /assets/models/Fox.glb)
  const rootPath = path.join(root, url);
  if (rootPath.startsWith(root) && fs.existsSync(rootPath) && !fs.statSync(rootPath).isDirectory()) {
    res.writeHead(200, { 'content-type': MIME[path.extname(rootPath)] || 'application/octet-stream', 'cache-control': 'no-store' });
    return fs.createReadStream(rootPath).pipe(res);
  }

  res.writeHead(404);
  res.end();
}).listen(port, '127.0.0.1', () => {
  if (isLegacy) {
    console.log(`${firstArg}: http://127.0.0.1:${port}/  (reload rebuilds, Space pauses)`);
  } else {
    console.log(`\nASCII Dioramas: http://127.0.0.1:${port}/\n`);
    scenes.forEach(s => console.log(`  /${s}/`));
    console.log('\nreload rebuilds, Space pauses\n');
  }
});
