// The frame loop every scene shares: renderer, lights, camera sweep, creature, the two post passes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { tag, time } from './materials.js';
import { GLYPHS, buildAtlas, asciiFrag, tiltFrag } from './glyphs.js';

/**
 * URL flags, the same for every scene:
 *   ?fox=walk|still|off  creature walks its path (default), stands and looks around, or is absent
 *   ?tilt=off            skip the tilt-shift pass (whole frame sharp)
 *   ?t=<seconds>         start paused at that time (Space resumes); for screenshots and comparisons
 *   ?view=render|classes show a pipeline stage: the graded 3D render, or each cell's surface class
 */
export function readFlags(search = location.search) {
  const q = new URLSearchParams(search), t = q.get('t');
  return {
    fox: q.get('fox') || 'walk', tilt: q.get('tilt') !== 'off', view: q.get('view') || 'glyphs',
    freeze: t !== null && t !== '' && Number.isFinite(+t) ? +t : null,
  };
}

function addLights(scene, { sun, sky, shadowFar = 130 }) {
  const s = new THREE.DirectionalLight(sun.color, sun.intensity);
  s.position.set(...sun.position); s.target.position.set(...sun.target);
  s.castShadow = true; s.shadow.mapSize.set(4096, 4096);
  Object.assign(s.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 5, far: shadowFar });
  s.shadow.bias = -.0005; s.shadow.normalBias = .03;
  scene.add(s, s.target, new THREE.HemisphereLight(...sky));
}

/** Slow eased sweep: yaw ±yaw°, elevation wobble and a slight push in, once per `duration` s, then back. */
function sweepCamera(camera, { target, radius = 76, elevation = 52, wobble = 1.4, yaw = 7, dolly = 2.5 }, duration) {
  const T = new THREE.Vector3(...target);
  return (t) => {
    const k = .5 - .5 * Math.cos(Math.PI * t / duration);
    const az = THREE.MathUtils.degToRad(-yaw + 2 * yaw * k), el = THREE.MathUtils.degToRad(elevation + wobble * Math.sin(k * 3.14)), R = radius - dolly * k;
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
  const { size: [W, HH], grid, duration = 24 } = cfg, flags = readFlags();
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, HH);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  addLights(scene, cfg.light);
  const update = await cfg.build(scene);
  const creature = cfg.creature && flags.fox !== 'off' ? await loadCreature(scene, cfg.creature, flags.fox) : null;

  const camera = new THREE.PerspectiveCamera(cfg.camera.fov ?? 23, W / HH, 5, 400);
  const placeCamera = sweepCamera(camera, cfg.camera, duration);

  const rt = new THREE.WebGLRenderTarget(W, HH, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const art = new THREE.WebGLRenderTarget(W, HH, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const vtx = `in vec3 position; in vec2 uv; out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }`;
  const ascii = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vtx, fragmentShader: asciiFrag(cfg.glyphs, flags.view), depthTest: false, depthWrite: false,
    uniforms: { uScene: { value: rt.texture }, uAtlas: { value: buildAtlas() }, uGrid: { value: new THREE.Vector2(...grid) }, uTime: time, uN: { value: GLYPHS.length } } });
  const tilt = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vtx, fragmentShader: tiltFrag(cfg.tilt), depthTest: false, depthWrite: false,
    uniforms: { uA: { value: art.texture }, uRes: { value: new THREE.Vector2(W, HH) } } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ascii); quad.frustumCulled = false;
  const post = new THREE.Scene(); post.add(quad); const postCam = new THREE.Camera();

  function drawFrame(t, dt) {
    time.value = t; placeCamera(t);
    creature?.(t, dt); update?.(t, dt);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
    quad.material = ascii; renderer.setRenderTarget(flags.tilt ? art : null); renderer.render(post, postCam);
    if (flags.tilt) { quad.material = tilt; renderer.setRenderTarget(null); renderer.render(post, postCam); }
  }

  const aspect = W / HH;
  Object.assign(renderer.domElement.style, { width: `min(100vw, ${100 * aspect}vh)`, height: `min(${100 / aspect}vw, 100vh)`, margin: 'auto' });
  Object.assign(document.body.style, { display: 'grid', placeItems: 'center', height: '100vh' });
  let paused = flags.freeze !== null, clock = flags.freeze ?? 0, last = performance.now();
  addEventListener('keydown', (e) => { if (e.code === 'Space') { paused = !paused; e.preventDefault(); } });
  const loop = (now) => {
    const dt = Math.min(.1, (now - last) / 1000);
    if (!paused) clock += dt;
    last = now;
    drawFrame(clock, paused ? 0 : dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
