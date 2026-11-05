#!/usr/bin/env node
// Static build into dist/ for GitHub Pages (or any static host).
//
//   node build.mjs                                  -> links relative to the site root
//   node build.mjs --base /Curiositas/ascii-dioramas
//
// dist/index.html, dist/<scene>/index.html + build/main.js, and assets/ copied into each scene
// folder too, because scenes load textures by relative path (assets/tex/...).
import fs from 'node:fs';
import path from 'node:path';
import { root, discoverScenes, loadEsbuild, bundleScene, sceneHtml, homepageHtml } from './site.mjs';

const args = process.argv.slice(2), bi = args.indexOf('--base');
const base = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : '';
const home = base ? base.replace(/\/[^/]+$/, '') + '/' : 'https://github.com/sanathNU/Curiositas';

const esbuild = loadEsbuild(), dist = path.join(root, 'dist'), scenes = discoverScenes();
fs.rmSync(dist, { recursive: true, force: true });
console.log(`building ${scenes.length} scenes…`);
for (const name of scenes) {
  const out = path.join(dist, name);
  await bundleScene(esbuild, name, path.join(out, 'build', 'main.js'), { minify: true });
  fs.writeFileSync(path.join(out, 'index.html'), sceneHtml(name));
  fs.cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
  console.log(`  ${name} ✓`);
}
fs.cpSync(path.join(root, 'assets', 'thumbs'), path.join(dist, 'assets', 'thumbs'), { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), homepageHtml(scenes, { base, home }));
console.log(`\ndist/ ready (${scenes.length} scenes)`);
