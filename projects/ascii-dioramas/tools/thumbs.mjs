#!/usr/bin/env node
// Capture homepage thumbnails: each scene frozen at t = 8 s, title and menu hidden, in a portrait
// 3:4 window, saved as assets/thumbs/<scene>.jpg. Drives headless Chrome over the DevTools protocol
// (no npm dependencies). Needs the dev server running.
//
//   node serve.mjs 5175 &
//   node tools/thumbs.mjs [http://127.0.0.1:5175] [scene ...]
//
// CHROME=/path/to/chrome overrides the browser (default: Google Chrome on macOS).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const base = /^https?:/.test(args[0] ?? '') ? args.shift() : 'http://127.0.0.1:5175';
const SIZE = { width: 600, height: 800 };
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9333;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const scenes = args.length ? args : fs.readdirSync(path.join(root, 'scenes'))
  .filter(d => d !== 'picture' && fs.existsSync(path.join(root, 'scenes', d, 'main.js'))).sort();

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbs-'));
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--hide-scrollbars', `--window-size=${SIZE.width},${SIZE.height}`, 'about:blank'], { stdio: 'ignore' });

/** Minimal DevTools client: send(method, params) resolves with the result. */
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      let id = 0; const waiting = new Map();
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
      const send = (method, params = {}) => new Promise((res, rej) => {
        const n = ++id; waiting.set(n, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
        ws.send(JSON.stringify({ id: n, method, params }));
      });
      return { send, close: () => ws.close() };
    } catch { await sleep(200); }
  }
  throw new Error('Chrome did not start');
}

try {
  const cdp = await connect();
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...SIZE, deviceScaleFactor: 1, mobile: false });
  for (const name of scenes) {
    await cdp.send('Page.navigate', { url: `${base}/${name}/?t=8&ui=off&title=off&sound=off&q=high` });
    let ready = false;
    for (let i = 0; i < 150 && !ready; i++) {
      await sleep(200);
      const r = await cdp.send('Runtime.evaluate', { expression: "document.querySelector('canvas')?.dataset.layout ?? ''", returnByValue: true });
      ready = !!r.result.value;
    }
    if (!ready) { console.log(`  ${name}: timed out`); continue; }
    await sleep(1500); // first frame, mip uploads
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 84 });
    const out = path.join(root, 'assets', 'thumbs', `${name}.jpg`);
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(`  ${name}: ${path.relative(root, out)}`);
  }
  cdp.close();
} finally {
  proc.kill();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });
}
