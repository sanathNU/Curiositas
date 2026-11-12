// The frame loop every scene shares: renderer, lights, camera sweep, creature, the two post passes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { tag, time } from './materials.js';
import { GLYPHS, buildAtlas, asciiFrag, tiltFrag } from './glyphs.js';
import { PROFILES, parseRes, layout, frameCamera } from './display.js';
import { mountTitle } from './title.js';

/**
 * URL flags, the same for every scene:
 *   ?fox=walk|still|off  creature walks its path (default), stands and looks around, or is absent
 *   ?tilt=off            skip the tilt-shift pass (whole frame sharp)
 *   ?t=<seconds>         start paused at that time (Space resumes); for screenshots and comparisons
 *   ?view=render|classes show a pipeline stage: the graded 3D render, or each cell's surface class
 *   ?res=<name>|WxH|frame render at a fixed resolution (see RESOLUTIONS) instead of filling the window
 *   ?title=off           hide the scene title
 */
export function readFlags(search = location.search) {
  const q = new URLSearchParams(search), t = q.get('t');
  return {
    fox: q.get('fox') || 'walk', tilt: q.get('tilt') !== 'off', view: q.get('view') || 'glyphs', res: q.get('res'), title: q.get('title') !== 'off',
    freeze: t !== null && t !== '' && Number.isFinite(+t) ? +t : null,
  };
}

function addLights(scene, { sun, sky, shadowFar = 130 }, shadowSize) {
  const s = new THREE.DirectionalLight(sun.color, sun.intensity);
  s.position.set(...sun.position); s.target.position.set(...sun.target);
  s.castShadow = true; s.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(s.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 5, far: shadowFar });
  s.shadow.bias = -.0005; s.shadow.normalBias = .03;
  scene.add(s, s.target, new THREE.HemisphereLight(...sky));
}

/**
 * Slow eased sweep: yaw ±yaw°, elevation wobble and a slight push in, once per `duration` s, then back.
 * `distance()` scales the radius when a narrow screen needs the camera pulled back.
 */
function sweepCamera(camera, { target, radius = 76, elevation = 52, wobble = 1.4, yaw = 7, dolly = 2.5 }, duration, distance) {
  const T = new THREE.Vector3(...target);
  return (t) => {
    const k = .5 - .5 * Math.cos(Math.PI * t / duration);
    const az = THREE.MathUtils.degToRad(-yaw + 2 * yaw * k), el = THREE.MathUtils.degToRad(elevation + wobble * Math.sin(k * 3.14)), R = (radius - dolly * k) * distance();
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
 */
export async function runDiorama(cfg) {
  // `size` is the frame the scene was composed for and `grid` its glyph density there;
  // the actual render size follows the screen (see display.js).
  const { size: frame, grid, duration = 24 } = cfg, flags = readFlags();
  const forced = parseRes(flags.res, frame);
  let L = layout({ frame, grid, forced });

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  addLights(scene, cfg.light, PROFILES[L.profile].shadow);
  const update = await cfg.build(scene);
  const creature = cfg.creature && flags.fox !== 'off' ? await loadCreature(scene, cfg.creature, flags.fox) : null;

  const camera = new THREE.PerspectiveCamera(cfg.camera.fov ?? 23, 1, 5, 400);
  let camDist = 1;
  const placeCamera = sweepCamera(camera, cfg.camera, duration, () => camDist);

  const rtOpts = { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter };
  const rt = new THREE.WebGLRenderTarget(L.w, L.h, { ...rtOpts, type: THREE.HalfFloatType });
  const art = new THREE.WebGLRenderTarget(L.w, L.h, { ...rtOpts, depthBuffer: false });
  const vtx = `in vec3 position; in vec2 uv; out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }`;
  const ascii = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vtx, fragmentShader: asciiFrag(cfg.glyphs, flags.view), depthTest: false, depthWrite: false,
    uniforms: { uScene: { value: rt.texture }, uAtlas: { value: buildAtlas() }, uGrid: { value: new THREE.Vector2() }, uTime: time, uN: { value: GLYPHS.length } } });
  const tilt = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vtx, fragmentShader: tiltFrag(cfg.tilt), depthTest: false, depthWrite: false,
    uniforms: { uA: { value: art.texture }, uRes: { value: new THREE.Vector2() }, uMaxR: { value: 26 } } });
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
  function apply() {
    renderer.setSize(L.w, L.h, false);
    rt.setSize(L.w, L.h); art.setSize(L.w, L.h);
    ascii.uniforms.uGrid.value.set(L.cols, L.rows);
    tilt.uniforms.uRes.value.set(L.w, L.h);
    tilt.uniforms.uMaxR.value = (cfg.tilt?.maxR ?? 26) * L.h / frame[1];
    camDist = frameCamera(camera, frame[0] / frame[1], L.w / L.h, cfg.camera);
    const a = L.w / L.h;
    Object.assign(stage.style, L.fill
      ? { width: '100vw', height: '100dvh' }
      : { width: `min(100vw, ${100 * a}dvh)`, height: `min(${100 / a}vw, 100dvh)` });
    canvas.dataset.layout = `${L.name} ${L.profile} ${L.w}x${L.h} grid ${L.cols}x${L.rows}`;
  }
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

  function drawFrame(t, dt) {
    time.value = t; placeCamera(t);
    creature?.(t, dt); update?.(t, dt);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
    quad.material = ascii; renderer.setRenderTarget(flags.tilt ? art : null); renderer.render(post, postCam);
    if (flags.tilt) { quad.material = tilt; renderer.setRenderTarget(null); renderer.render(post, postCam); }
  }

  let paused = flags.freeze !== null, clock = flags.freeze ?? 0, last = performance.now();
  addEventListener('keydown', (e) => { if (e.code === 'Space') { paused = !paused; e.preventDefault(); } });
  const loop = (now) => {
    const dt = Math.min(.1, (now - last) / 1000);
    if (!paused) clock += dt;
    last = now;
    watchSize(now);
    drawFrame(clock, paused ? 0 : dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
