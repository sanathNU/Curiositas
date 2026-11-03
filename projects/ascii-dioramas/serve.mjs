#!/usr/bin/env node
// Serve a diorama scene: bundles scenes/<name>/main.js, serves assets from project root.
// Every page reload rebuilds.
//
//   node serve.mjs <scene-name> [port]   -> http://127.0.0.1:<port>/
//   node serve.mjs harbour               -> serves scenes/harbour/main.js
//   node serve.mjs temple-south 5175     -> port 5175
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const name = process.argv[2];
if (!name) { console.error('usage: node serve.mjs <scene-name> [port]'); process.exit(1); }

const sceneDir = path.join(root, 'scenes', name);
if (!fs.existsSync(path.join(sceneDir, 'main.js'))) {
  console.error(`no main.js in scenes/${name}/`);
  const avail = fs.readdirSync(path.join(root, 'scenes')).filter(d => fs.existsSync(path.join(root, 'scenes', d, 'main.js')));
  if (avail.length) console.error(`available: ${avail.join(', ')}`);
  process.exit(1);
}

const port = +(process.argv[3] || 5173);
const req = createRequire(path.join(root, 'x.js'));
let esbuild;
try { esbuild = req('esbuild'); } catch { console.error('esbuild not found: run `npm install` in the dioramas root'); process.exit(1); }

const buildDir = path.join(sceneDir, 'build');
fs.mkdirSync(buildDir, { recursive: true });

const bundle = () => esbuild.build({
  entryPoints: [path.join(sceneDir, 'main.js')],
  bundle: true, format: 'esm',
  outfile: path.join(buildDir, 'main.js'),
  logLevel: 'warning',
});
await bundle();

if (!fs.existsSync(path.join(sceneDir, 'index.html'))) {
  fs.writeFileSync(path.join(sceneDir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><style>html,body{margin:0;background:#000}canvas{display:block}</style><script type="module" src="./build/main.js"></script>`);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.json': 'application/json', '.bin': 'application/octet-stream', '.hdr': 'application/octet-stream' };

http.createServer(async (q, res) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/build/main.js') { try { await bundle(); } catch (e) { console.log(e.message); } }

  // resolve: scene dir first, then project root (for shared assets/)
  const scenePath = path.join(sceneDir, url === '/' ? '/index.html' : url);
  const rootPath = path.join(root, url === '/' ? '/index.html' : url);

  let p;
  if (scenePath.startsWith(sceneDir) && fs.existsSync(scenePath) && !fs.statSync(scenePath).isDirectory()) {
    p = scenePath;
  } else if (rootPath.startsWith(root) && fs.existsSync(rootPath) && !fs.statSync(rootPath).isDirectory()) {
    p = rootPath;
  } else {
    res.writeHead(404); return res.end();
  }

  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`${name}: http://127.0.0.1:${port}/  (reload rebuilds, Space pauses)`));
