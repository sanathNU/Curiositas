// Viewer controls: orbit and zoom the camera by hand, plus a hidden menu (small corner button)
// with back to home, ASCII / 3D / class view, tilt-shift, sound, pause, camera reset and recording.
//
//   drag            orbit around the scene (pinch or scroll to zoom, double-click resets)
//   M  V  T  S  Space  R  0/Esc   menu, next view, tilt-shift, sound, pause, record, reset camera
import { VIEWS } from './glyphs.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const LABELS = { glyphs: 'ASCII', render: '3D', classes: 'Classes' };

const CSS = `
.dio-menu-btn { position: absolute; top: max(12px, env(safe-area-inset-top, 0px)); right: max(12px, env(safe-area-inset-right, 0px)); z-index: 3;
  width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer; display: grid; place-items: center;
  background: rgba(8, 12, 10, .45); color: #f2e6cc; opacity: .35; transition: opacity .3s, background .3s; }
.dio-menu-btn:hover, .dio-menu-btn:focus-visible, .dio-menu-btn[aria-expanded="true"] { opacity: 1; background: rgba(8, 12, 10, .7); }
.dio-menu-btn:focus-visible { outline: 1.5px solid #f2e6cc; outline-offset: 2px; }
.dio-menu-btn svg { width: 16px; height: 16px; }
.dio-menu { position: absolute; top: calc(max(12px, env(safe-area-inset-top, 0px)) + 46px); right: max(12px, env(safe-area-inset-right, 0px)); z-index: 3;
  min-width: 210px; padding: 10px 6px; border-radius: 12px; background: rgba(8, 12, 10, .82); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  color: #f2e6cc; font: 16px/1.25 "EB Garamond", Garamond, Georgia, serif; box-shadow: 0 8px 28px rgba(0,0,0,.45); user-select: none; }
.dio-menu[hidden] { display: none; }
.dio-menu a, .dio-menu button { display: flex; justify-content: space-between; gap: 16px; width: 100%; box-sizing: border-box; padding: 7px 12px;
  font: inherit; color: inherit; text-decoration: none; background: none; border: 0; border-radius: 7px; cursor: pointer; text-align: left; }
.dio-menu a:hover, .dio-menu button:hover { background: rgba(242, 230, 204, .1); }
.dio-menu a:focus-visible, .dio-menu button:focus-visible { outline: 1.5px solid #f2e6cc; outline-offset: -1px; }
.dio-menu .key { color: rgba(242, 230, 204, .5); font-size: 13px; font-style: italic; }
.dio-menu .label { padding: 8px 12px 3px; color: rgba(242, 230, 204, .55); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
.dio-menu .views { display: flex; gap: 4px; padding: 2px 6px 4px; }
.dio-menu .views button { justify-content: center; padding: 6px 0; flex: 1; }
.dio-menu button[aria-pressed="true"] { background: rgba(242, 230, 204, .2); }
.dio-menu hr { border: 0; border-top: 1px solid rgba(242, 230, 204, .18); margin: 6px 8px; }
.dio-menu .rec[aria-pressed="true"] { color: #ff9a8a; }
.dio-hint { position: absolute; left: 50%; bottom: max(16px, 3%); transform: translateX(-50%); z-index: 2; color: rgba(242, 230, 204, .8);
  font: italic 14px/1.2 "EB Garamond", Garamond, Georgia, serif; text-shadow: 0 1px 3px rgba(0,0,0,.8); pointer-events: none; transition: opacity .6s; white-space: nowrap; }`;

/**
 * `state` is shared with the frame loop: { view (index into VIEWS), tilt, paused, orbit: { yaw, el, zoom } }.
 * `menu` false keeps gestures and keys but hides the menu button (?ui=off).
 * `music` (engine/music.js) adds a sound toggle; it starts on the first click or key when the viewer
 * turned it on in an earlier scene, or with ?sound=on (browsers allow audio only after a gesture).
 */
export function mountControls(stage, canvas, state, { name, menu = true, music = null, soundFlag = null }) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const resetOrbit = () => Object.assign(state.orbit, { yaw: 0, el: 0, zoom: 1 });

  // ---- orbit and zoom ----
  Object.assign(canvas.style, { touchAction: 'none', cursor: 'grab' });
  const ptrs = new Map();
  let pinch0 = 0, zoom0 = 1;
  const spread = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); canvas.style.cursor = 'grabbing';
    if (ptrs.size === 2) { pinch0 = spread(); zoom0 = state.orbit.zoom; }
    closeMenu();
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = ptrs.get(e.pointerId); if (!prev) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) {
      // ±80°: further round, you'd be looking at the back edge of the diorama where the world stops
      state.orbit.yaw = clamp(state.orbit.yaw - (e.clientX - prev[0]) * .3, -80, 80);
      state.orbit.el = clamp(state.orbit.el + (e.clientY - prev[1]) * .2, -36, 34);
    } else if (ptrs.size === 2) state.orbit.zoom = clamp(zoom0 * pinch0 / spread(), .45, 2.2);
  });
  const release = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); state.orbit.zoom = clamp(state.orbit.zoom * Math.exp(e.deltaY * .0012), .45, 2.2); }, { passive: false });
  canvas.addEventListener('dblclick', resetOrbit);

  // ---- hint line ----
  const hintEl = document.createElement('div'); hintEl.className = 'dio-hint'; stage.append(hintEl);
  let hintTimer;
  const hint = (text, ms) => { hintEl.textContent = text; hintEl.style.opacity = 1; clearTimeout(hintTimer); hintTimer = setTimeout(() => { hintEl.style.opacity = 0; }, ms); };

  // ---- recording ----
  let rec = null, recStart = 0;
  function toggleRecord() {
    if (rec) { rec.stop(); return; }
    const audio = music?.on ? music.stream()?.getAudioTracks() ?? [] : [];
    const types = audio.length ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    const type = types.find(t => window.MediaRecorder?.isTypeSupported?.(t));
    if (!type || !canvas.captureStream) { hint('This browser cannot record the canvas', 3000); return; }
    const stream = canvas.captureStream(30), chunks = [];
    audio.forEach(t => stream.addTrack(t.clone())); // clones: stopping them afterwards leaves the music running
    rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 16e6 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const a = document.createElement('a'), stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = URL.createObjectURL(new Blob(chunks, { type })); a.download = `${name}-${VIEWS[state.view]}-${stamp}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      rec = null; sync(); hint('Recording saved to your downloads', 2500);
    };
    rec.start(500); recStart = performance.now(); sync(); hint('Recording. Press R or Stop recording in the menu to finish', 3000);
  }

  // ---- menu ----
  let menuBtn = null, panel = null;
  const viewButtons = [];
  let tiltB, soundB, pauseB, recB;
  function openMenu() { if (!panel) return; panel.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { if (!panel || panel.hidden) return; panel.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  if (menu) {
    menuBtn = document.createElement('button');
    Object.assign(menuBtn, { type: 'button', className: 'dio-menu-btn', title: 'Menu (M)' });
    menuBtn.setAttribute('aria-label', 'Menu'); menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    menuBtn.addEventListener('click', () => (panel.hidden ? openMenu() : closeMenu()));

    panel = document.createElement('div'); panel.className = 'dio-menu'; panel.hidden = true; panel.setAttribute('role', 'menu');
    const item = (label, key, onClick, cls = '') => {
      const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.setAttribute('role', 'menuitem');
      b.innerHTML = `<span></span><span class="key">${key}</span>`; b.firstChild.textContent = label;
      b.addEventListener('click', () => { onClick(); sync(); }); panel.append(b); return b;
    };
    const home = document.createElement('a'); home.href = '../'; home.setAttribute('role', 'menuitem');
    home.innerHTML = '<span>← Back to all scenes</span>'; panel.append(home);
    panel.append(document.createElement('hr'));
    panel.append(Object.assign(document.createElement('div'), { className: 'label', textContent: 'View' }));
    const views = Object.assign(document.createElement('div'), { className: 'views' });
    VIEWS.forEach((v, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = LABELS[v]; b.title = `${LABELS[v]} view (V cycles)`;
      b.addEventListener('click', () => { state.view = i; sync(); }); views.append(b); viewButtons.push(b);
    });
    panel.append(views);
    tiltB = item('Tilt-shift', 'T', () => { state.tilt = !state.tilt; });
    if (music) soundB = item('Sound', 'S', toggleSound);
    pauseB = item('Pause', 'Space', () => { state.paused = !state.paused; });
    item('Reset camera', '0', resetOrbit);
    recB = item('Record video', 'R', toggleRecord, 'rec');
    panel.append(document.createElement('hr'));
    panel.append(Object.assign(document.createElement('div'), { className: 'label', textContent: 'Drag to orbit · scroll or pinch to zoom' }));
    stage.append(menuBtn, panel);
  }

  function sync() {
    if (!panel) return;
    viewButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(state.view === i)));
    tiltB.setAttribute('aria-pressed', String(state.tilt)); tiltB.firstChild.textContent = state.tilt ? 'Tilt-shift on' : 'Tilt-shift off';
    if (soundB) { soundB.setAttribute('aria-pressed', String(music.on)); soundB.firstChild.textContent = music.on ? `Sound on · ${music.label}` : 'Sound off'; }
    pauseB.firstChild.textContent = state.paused ? 'Play' : 'Pause';
    recB.setAttribute('aria-pressed', String(!!rec));
    if (!rec) recB.firstChild.textContent = 'Record video';
  }
  setInterval(() => { if (rec && recB) { const s = (performance.now() - recStart) / 1000 | 0; recB.firstChild.textContent = `Stop recording ${s / 60 | 0}:${String(s % 60).padStart(2, '0')}`; } }, 250);

  // ---- sound ----
  const SOUND_KEY = 'dio-sound';
  const remember = (v) => { try { localStorage.setItem(SOUND_KEY, v ? 'on' : 'off'); } catch {} };
  function toggleSound() {
    const now = music.toggle(); remember(now);
    hint(now ? `Sound on · ${music.label} polyrhythm` : 'Sound off', 2200);
  }
  if (music) {
    let want = soundFlag === 'on';
    try { want ||= soundFlag === null && localStorage.getItem(SOUND_KEY) === 'on'; } catch {}
    if (want) {
      // a pointer or key press other than S itself unlocks audio; S toggles on its own
      const start = (e) => {
        if (e.type === 'keydown' && e.key.toLowerCase() === 's') return;
        removeEventListener('pointerdown', start, true); removeEventListener('keydown', start, true);
        if (!music.on) { music.enable(); sync(); }
      };
      addEventListener('pointerdown', start, true); addEventListener('keydown', start, true);
    } else setTimeout(() => { if (!music.on) hint('Press S, or open the menu, for sound', 3500); }, 1200);
  }

  // ---- keys ----
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { state.paused = !state.paused; e.preventDefault(); }
    else if (k === 'm') panel?.hidden ? openMenu() : closeMenu();
    else if (k === 'v') state.view = (state.view + 1) % VIEWS.length;
    else if (k === 't') state.tilt = !state.tilt;
    else if (k === 's' && music) toggleSound();
    else if (k === 'r') toggleRecord();
    else if (k === '0') resetOrbit();
    else if (k === 'escape') { if (panel && !panel.hidden) closeMenu(); else resetOrbit(); }
    else return;
    sync();
  });
  sync();
}
