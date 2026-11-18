// The frame loop every scene shares: renderer, lights, camera sweep, creature, the two post passes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { tag, time } from './materials.js';
import { GLYPHS, VIEWS, buildAtlas, cellFrag, glyphFrag, tiltFrag } from './glyphs.js';
import { mountControls } from './controls.js';
import { parseRes, layout, frameCamera } from './display.js';
import { Q, TIERS, setTier, detectTier, governor } from './quality.js';
import { mountTitle } from './title.js';
import { mountMusic } from './music.js';

/**
 * URL flags, the same for every scene:
 *   ?fox=walk|still|off  creature walks its path (default), stands and looks around, or is absent
 *   ?tilt=off            skip the tilt-shift pass (whole frame sharp)
 *   ?t=<seconds>         start paused at that time (Space resumes); for screenshots and comparisons
 *   ?view=render|classes start in the plain 3D view or the class map (the menu or V switches live)
 *   ?res=<name>|WxH|frame render at a fixed resolution (see RESOLUTIONS) instead of filling the window
 *   ?title=off           hide the scene title
 *   ?ui=off              hide the menu button (keys and camera gestures still work)
 *   ?sound=on|off        start the scene's music on the first click or key, or leave it out entirely
 *   ?q=high|mid|low      fix the quality tier (see quality.js) instead of picking it from the device
 */
export function readFlags(search = location.search) {
  const q = new URLSearchParams(search), t = q.get('t');
  return {
    fox: q.get('fox') || 'walk', tilt: q.get('tilt') !== 'off', view: q.get('view') || 'glyphs', res: q.get('res'),
    title: q.get('title') !== 'off', ui: q.get('ui') !== 'off', sound: q.get('sound'), q: q.get('q'),
    freeze: t !== null && t !== '' && Number.isFinite(+t) ? +t : null,
  };
}

function addLights(scene, { sun, sky, shadowFar = 130 }) {
  const s = new THREE.DirectionalLight(sun.color, sun.intensity);
  s.position.set(...sun.position); s.target.position.set(...sun.target);
  s.castShadow = true;
  Object.assign(s.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 5, far: shadowFar });
  s.shadow.bias = -.0005; s.shadow.normalBias = .03;
  scene.add(s, s.target, new THREE.HemisphereLight(...sky));
  return s;
}

/**
 * Slow eased sweep: yaw ±yaw°, elevation wobble and a slight push in, once per `duration` s, then back.
 * `distance()` scales the radius when a narrow screen needs the camera pulled back; `orbit` adds
 * the viewer's own drag (yaw, elevation in degrees) and zoom on top of the sweep.
 */
function sweepCamera(camera, { target, radius = 76, elevation = 52, wobble = 1.4, yaw = 7, dolly = 2.5 }, duration, distance, orbit) {
  const T = new THREE.Vector3(...target), D = THREE.MathUtils.degToRad;
  return (t) => {
    const k = .5 - .5 * Math.cos(Math.PI * t / duration);
    const az = D(-yaw + 2 * yaw * k + orbit.yaw), el = D(Math.min(86, Math.max(14, elevation + wobble * Math.sin(k * 3.14) + orbit.el)));
    const R = (radius - dolly * k) * distance() * orbit.zoom;
    camera.position.set(T.x + Math.sin(az) * Math.cos(el) * R, T.y + Math.sin(el) * R, T.z + Math.cos(az) * Math.cos(el) * R);
    camera.lookAt(T); camera.updateMatrixWorld();
  };
}

/**
 * Animated glTF creature. Walking: ping-pongs along the land's trail between u[0] and u[1] at
 * `speed` units/s, `offset` units to the side, heading along the tangent. Still: stands at
 * `still` [x, z, yaw] (default: middle of its walk) playing the look-around clip.
 * Drawn unlit: a lit skinned mesh can write NaN into the half-float target, and mipmapping
 * spreads NaN as black squares.
 */
async function loadCreature(scene, c, mode) {
  const { land, model = 'assets/models/Fox.glb', scale = .0125, tint = [1, 1, 1], cls, u = [.15, .85], speed = .6, offset = 0 } = c;
  const yAt = c.y ?? land.pathY;
  const gl = await new GLTFLoader().loadAsync(model);
  const obj = gl.scene; obj.scale.setScalar(scale);
  obj.traverse(o => { if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; o.material = tag(new THREE.MeshBasicMaterial({ map: o.material.map, color: new THREE.Color(...tint) }), cls); } });
  scene.add(obj);
  const mixer = new THREE.AnimationMixer(obj), still = mode === 'still';
  mixer.clipAction(gl.animations.find(a => (still ? /survey/i : /walk/i).test(a.name))).play();
  if (still) {
    const f = land.frame((u[0] + u[1]) / 2);
    const [x, z, yaw] = c.still ?? [f.p.x + f.nx * offset, f.p.z + f.nz * offset, 0];
    obj.position.set(x, land.H(x, z) + .05, z); obj.rotation.y = yaw;
    return (t, dt) => mixer.update(dt);
  }
  const span = u[1] - u[0];
  return (t, dt) => {
    const phase = (t * speed / land.length) % (2 * span), out = phase < span;
    const f = land.frame(out ? u[0] + phase : u[1] - (phase - span)), dir = out ? 1 : -1;
    const x = f.p.x + f.nx * offset, z = f.p.z + f.nz * offset;
    obj.position.set(x, yAt(x, z) + .1, z); obj.rotation.y = Math.atan2(f.t.x * dir, f.t.z * dir);
    mixer.update(dt);
  };
}

/**
 * Run a diorama. `build(scene)` adds everything and may return update(t, dt) for per-frame work.
 * See README for each option; scenes/summit/main.js is the most complete example.
 * Instead of `build`, `source` ({ scene, camera, resize?(aspect), update?(t, dt) }) supplies a
 * ready-made scene that writes colour and class into the render target, e.g. a picture (picture.js);
 * then there are no lights, shadows, creature or camera sweep.
 */
export async function runDiorama(cfg) {
  // `size` is the frame the scene was composed for and `grid` its glyph density there;
  // the actual render size follows the screen (see display.js).
  const { size: frame, grid, duration = 24 } = cfg, flags = readFlags();
  const forced = parseRes(flags.res, frame);
  // live viewer state, changed by the menu, keys and camera gestures (controls.js)
  const state = { view: Math.max(0, VIEWS.indexOf(flags.view)), tilt: flags.tilt, paused: flags.freeze !== null, orbit: { yaw: 0, el: 0, zoom: 1 } };
  let L = layout({ frame, grid, forced });

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  // the sun and land never move, so the shadow map is redrawn only every few frames (for wind and the creature)
  renderer.shadowMap.autoUpdate = false;
  const autoTier = !TIERS[flags.q];
  setTier(autoTier ? detectTier(renderer, L.profile) : flags.q);

  const src = cfg.source;
  const scene = src ? src.scene : new THREE.Scene();
  const sun = src ? null : addLights(scene, cfg.light);
  const update = src ? src.update : await cfg.build(scene);
  const creature = !src && cfg.creature && flags.fox !== 'off' ? await loadCreature(scene, cfg.creature, flags.fox) : null;

  // far plane reaches the horizon of the extended sea/cloud plane on low orbits
  const camera = src ? src.camera : new THREE.PerspectiveCamera(cfg.camera.fov ?? 23, 1, 5, 1500);
  const sky = new THREE.Color(cfg.sky ?? '#000000');
  let camDist = 1;
  const placeCamera = src ? () => {} : sweepCamera(camera, cfg.camera, duration, () => camDist, state.orbit);

  // rt: the 3D render, at a few texels per glyph cell (full screen size only for the plain render view);
  // cells: one texel per glyph cell (cell step output); art: the glyph image the tilt pass blurs.
  const rtOpts = { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter };
  const rt = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, type: THREE.HalfFloatType });
  const cells = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const art = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, depthBuffer: false });
  const vtx = `in vec3 position; in vec2 uv; out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }`;
  const grid2 = new THREE.Vector2();
  const raw = (fragmentShader, uniforms) => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vtx, fragmentShader, uniforms, depthTest: false, depthWrite: false });
  const cellMat = raw(cellFrag(cfg.glyphs), { uScene: { value: rt.texture }, uGrid: { value: grid2 }, uTime: time });
  const ascii = raw(glyphFrag(cfg.glyphs), { uScene: { value: rt.texture }, uCells: { value: cells.texture }, uAtlas: { value: buildAtlas() }, uGrid: { value: grid2 }, uN: { value: GLYPHS.length }, uView: { value: state.view } });
  const tilt = raw(tiltFrag(cfg.tilt), { uA: { value: art.texture }, uRes: { value: new THREE.Vector2() }, uMaxR: { value: 26 }, uTaps: { value: Q.taps } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ascii); quad.frustumCulled = false;
  const post = new THREE.Scene(); post.add(quad); const postCam = new THREE.Camera();

  // The stage is sized like the visible frame (full window, or letterboxed for ?res=); the canvas
  // fills it and the title sits on top, sized in the stage's container units.
  const canvas = renderer.domElement, stage = document.createElement('div');
  Object.assign(document.documentElement.style, { height: '100%', background: '#000' });
  Object.assign(document.body.style, { margin: '0', height: '100%', overflow: 'hidden', display: 'grid', placeItems: 'center' });
  Object.assign(stage.style, { position: 'relative', containerType: 'size' });
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
  stage.append(canvas); document.body.append(stage);
  if (cfg.title && flags.title) mountTitle(stage, cfg.title);
  const music = cfg.music && flags.sound !== 'off' ? mountMusic(cfg.music) : null;
  mountControls(stage, canvas, state, { name: location.pathname.split('/').filter(Boolean).pop() || 'diorama', menu: flags.ui, music, soundFlag: flags.sound });
  // render-target sizes follow the layout, the quality tier and the view
  let W = 1, Hh = 1;
  function sizeTargets() {
    const [tx, ty] = Q.texel;
    if (VIEWS[state.view] === 'render') rt.setSize(W, Hh);
    else rt.setSize(Math.round(L.cols * Math.min(tx, W / L.cols)), Math.round(L.rows * Math.min(ty, Hh / L.rows)));
  }
  function apply() {
    W = Math.max(64, Math.round(L.w * Q.screen)); Hh = Math.max(64, Math.round(L.h * Q.screen));
    renderer.setSize(W, Hh, false);
    sizeTargets(); cells.setSize(L.cols, L.rows); art.setSize(W, Hh);
    grid2.set(L.cols, L.rows);
    tilt.uniforms.uRes.value.set(W, Hh);
    tilt.uniforms.uMaxR.value = (cfg.tilt?.maxR ?? 26) * Hh / frame[1];
    tilt.uniforms.uTaps.value = Q.taps;
    if (sun && sun.shadow.mapSize.x !== Q.shadow) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    shadowDirty = true;
    if (src) src.resize?.(L.w / L.h);
    else camDist = frameCamera(camera, frame[0] / frame[1], L.w / L.h, cfg.camera);
    const a = L.w / L.h;
    Object.assign(stage.style, L.fill
      ? { width: '100vw', height: '100dvh' }
      : { width: `min(100vw, ${100 * a}dvh)`, height: `min(${100 / a}vw, 100dvh)` });
    canvas.dataset.layout = `${L.name} ${L.profile} ${W}x${Hh} grid ${L.cols}x${L.rows} q:${Q.name}`;
  }
  let shadowDirty = true;
  apply();
  // Re-layout when the window size or pixel ratio changes (rotation, resizing, moving to another
  // monitor). Polled from the frame loop rather than resize events, which throttled background
  // tabs and emulated viewports don't always deliver; waits until the size has held for 150 ms.
  const screenKey = () => `${innerWidth}x${innerHeight}@${devicePixelRatio}`;
  let shownKey = screenKey(), seenKey = shownKey, seenAt = 0;
  function watchSize(now) {
    if (forced) return;
    const k = screenKey();
    if (k !== seenKey) { seenKey = k; seenAt = now; }
    else if (k !== shownKey && now - seenAt > 150) { shownKey = k; L = layout({ frame, grid }); apply(); }
  }

  let shownView = state.view, frameNo = 0;
  function drawFrame(t, dt) {
    time.value = t; placeCamera(t);
    creature?.(t, dt); update?.(t, dt);
    if (state.view !== shownView) { shownView = state.view; sizeTargets(); }
    renderer.shadowMap.needsUpdate = shadowDirty || frameNo++ % Q.shadowEvery === 0; shadowDirty = false;
    renderer.setRenderTarget(rt); renderer.setClearColor(sky, 0); renderer.clear(); renderer.render(scene, camera);
    ascii.uniforms.uView.value = state.view;
    if (VIEWS[state.view] === 'glyphs') { quad.material = cellMat; renderer.setRenderTarget(cells); renderer.render(post, postCam); }
    quad.material = ascii; renderer.setRenderTarget(state.tilt ? art : null); renderer.render(post, postCam);
    if (state.tilt) { quad.material = tilt; renderer.setRenderTarget(null); renderer.render(post, postCam); }
  }

  // Live tier changes: the build-time knobs (terrain detail) stay, everything else follows.
  const gov = governor((name) => { setTier(name); apply(); });

  // Frames are capped at the tier's rate. While paused nothing moves, so a frame is drawn only
  // when the view changes (orbit, zoom, menu toggles, resize, tier).
  let clock = flags.freeze ?? 0, last = performance.now(), drawnKey = '';
  const viewKey = () => `${state.view}|${state.tilt}|${state.orbit.yaw}|${state.orbit.el}|${state.orbit.zoom}|${W}x${Hh}|${Q.name}`;
  const loop = (now) => {
    requestAnimationFrame(loop);
    watchSize(now);
    if (now - last < 1000 / Q.fps - 2) return;
    const ms = now - last, dt = Math.min(.1, ms / 1000);
    last = now;
    if (!state.paused) clock += dt;
    music?.update(clock, state.paused);
    const key = viewKey();
    if (state.paused && key === drawnKey) return;
    drawnKey = key;
    if (autoTier && !state.paused) gov.sample(ms);
    drawFrame(clock, state.paused ? 0 : dt);
  };
  requestAnimationFrame(loop);
}
