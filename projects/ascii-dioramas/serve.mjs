#!/usr/bin/env node
// Dev server: homepage at /, each scene at /<name>/, shared assets at /assets/ and /<name>/assets/.
// A scene's bundle is rebuilt whenever its page asks for it, so a reload picks up edits.
//
//   node serve.mjs [port]           -> http://127.0.0.1:<port>/   (default 5173)
//   node serve.mjs <scene> [port]   -> same server, prints that scene's URL
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { root, discoverScenes, loadEsbuild, bundleScene, sceneHtml, homepageHtml } from './site.mjs';

const esbuild = loadEsbuild();
const args = process.argv.slice(2);
const focus = args[0] && !/^\d+$/.test(args[0]) ? args.shift() : null;
const port = +(args[0] || 5173);
const scenes = discoverScenes();
if (focus && !scenes.includes(focus)) { console.error(`unknown scene: ${focus}\navailable: ${scenes.join(', ')}`); process.exit(1); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.json': 'application/json', '.css': 'text/css' };
const send = (res, type, body) => { res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
const sendFile = (res, p) => { res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); fs.createReadStream(p).pipe(res); };
const isFile = (p) => p.startsWith(root + path.sep) && fs.existsSync(p) && fs.statSync(p).isFile();

http.createServer(async (q, res) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/' || url === '/index.html') return send(res, 'text/html', homepageHtml(discoverScenes()));

  const [name, ...rest] = url.slice(1).split('/');
  if (scenes.includes(name)) {
    if (!rest.length) { res.writeHead(302, { location: `/${name}/` }); return res.end(); }
    const sub = rest.join('/');
    if (sub === '' || sub === 'index.html') return send(res, 'text/html', sceneHtml(name));
    if (sub === 'build/main.js') {
      const out = path.join(root, 'scenes', name, 'build', 'main.js');
      try { await bundleScene(esbuild, name, out); } catch (e) { console.log(e.message); }
      return sendFile(res, out);
    }
    // scene-local file first, then the shared project root (assets/…)
    for (const p of [path.join(root, 'scenes', name, sub), path.join(root, sub)]) if (isFile(p)) return sendFile(res, p);
  } else if (isFile(path.join(root, url))) return sendFile(res, path.join(root, url));

  res.writeHead(404); res.end();
}).listen(port, '127.0.0.1', () => {
  console.log(`\nASCII Dioramas: http://127.0.0.1:${port}/${focus ? `${focus}/` : ''}\n`);
  scenes.forEach(s => console.log(`  /${s}/`));
  console.log('\nflags: ?fox=walk|still|off  ?tilt=off  ?t=<seconds>   (Space pauses, reload rebuilds)\n');
});
