// Any picture as a diorama source: the image takes the place of the 3D render, and each pixel's
// surface class is guessed from its colour, its local texture and where it sits in the frame.
// With a depth map (tools/depth.py) the picture also becomes a 2.5D relief the camera can sway
// around, the sky and walls-versus-ground come from geometry instead of guesses, and the tilt-shift
// blur follows real distance. Everything after that (glyph pass, quality tiers, menu, recording)
// is the shared engine.
import * as THREE from 'three';
import { g } from './glyphs.js';
import { glf } from './noise.js';
import { runDiorama, readFlags } from './run.js';
import { estimateDepth } from './depth-browser.js';
import { Q, onTier } from './quality.js';

/** Classes a picture is split into (the class view colours them with CLASS_COLORS). */
export const PIC_CLS = { sky: 1, water: 2, foliage: 3, warm: 4, sand: 5, ground: 6, dark: 7, bright: 8, wall: 9 };

/**
 * Per-pixel classifier, in sRGB terms so the thresholds read like a colour picker:
 *   dark     very low luminance
 *   sky      with depth: the far plane; without: smooth (little texture) and above `horizon`
 *   bright   near-white and unsaturated (clouds, foam, glare)
 *   ground   unsaturated and lying flat (paving, rock, sand in shade)
 *   wall     unsaturated and standing up (facades, posts); only with depth, else it is ground
 *   water    blue to cyan
 *   foliage  yellow-green to green, plus dim olive
 *   sand     straw, ochre, gold
 *   warm     reds, oranges, browns, magentas (brick, roofs, clothes)
 * "Lying flat" means inverse depth grows toward the bottom of the frame, as it does on any floor.
 */
const classifyGLSL = ({ horizon, smooth, gray, skyDepth, groundSlope }) => /* glsl */`
float lumS(vec3 c){ return dot(c,vec3(.25,.6,.15)); }
vec3 srgb(vec2 uv, float lod){ return pow(max(textureLod(uImg,uv,lod).rgb,0.),vec3(1./2.2)); }
float dep(vec2 uv){ return textureLod(uDepth,uv,1.).r; }
float classify(vec2 uv){
  vec3 s = srgb(uv,1.);
  float l = lumS(s), mx = max(s.r,max(s.g,s.b)), mn = min(s.r,min(s.g,s.b)), sat = mx>.001 ? (mx-mn)/mx : 0.;
  float h = 0.;
  if(mx-mn>.001){
    if(mx==s.r) h = mod((s.g-s.b)/(mx-mn),6.);
    else if(mx==s.g) h = (s.b-s.r)/(mx-mn)+2.;
    else h = (s.r-s.g)/(mx-mn)+4.;
    h /= 6.;
  }
  vec2 d = 2.5/vec2(textureSize(uImg,0));
  float tex = abs(lumS(srgb(uv+vec2(d.x,0),1.))-lumS(srgb(uv-vec2(d.x,0),1.)))+abs(lumS(srgb(uv+vec2(0,d.y),1.))-lumS(srgb(uv-vec2(0,d.y),1.)));
  bool lying = true;
  if(uHasDepth>.5){
    float e = 8./float(textureSize(uDepth,0).y);
    float slope = (dep(uv-vec2(0,e))-dep(uv+vec2(0,e)))/(2.*e); // > 0 where nearer toward the bottom
    if(dep(uv)<${glf(skyDepth)} && tex<${glf(smooth * 2)}) return ${PIC_CLS.sky}.;
    lying = slope>${glf(groundSlope)};
  } else if(tex<${glf(smooth)} && uv.y>${glf(horizon)}) return ${PIC_CLS.sky}.;
  if(l<.09) return ${PIC_CLS.dark}.;
  bool blue = h>.42 && h<.72;
  if(sat<${glf(gray)}) return l>.82 ? ${PIC_CLS.bright}. : lying ? ${PIC_CLS.ground}. : ${PIC_CLS.wall}.;
  if(blue) return lying ? ${PIC_CLS.water}. : ${PIC_CLS.wall}.;
  if(h>.18 && h<=.42) return ${PIC_CLS.foliage}.;
  if(h>.1 && h<=.18 && l<.3 && s.g>s.r*.8) return ${PIC_CLS.foliage}.; // olive: foliage in warm or dim light
  if(h>.11 && h<=.18) return ${PIC_CLS.sand}.;
  return ${PIC_CLS.warm}.;
}`;

/** Default glyph rules for picture classes; any scene-style `rules` string can replace them. */
export const pictureRules = /* glsl */`
  if(cls<1.5){        // sky: sparse and soft, so the colour carries it
    gl = L<.5?${g('.')}:L<.75?${g("'")}:${g('`')};
    if(h21(cell)>.55) gl = ${g(' ')};
  } else if(cls<2.5){ // water: ripples drift with the wind field
    gl = L<.15?${g('.')}:L<.3?${g('-')}:(w>.15?${g('~')}:${g('=')});
  } else if(cls<3.5){ // foliage
    gl = L<.12?${g('.')}:L<.22?${g(':')}:L<.32?${g('*')}:L<.45?${g('+')}:${g('o')};
    if(w>.55) gl = ${g('/')};
  } else if(cls<4.5){ // warm: brick, roofs, people
    gl = mag>.12?edgeG:(L<.2?${g(':')}:L<.4?${g('%')}:L<.6?${g('#')}:${g('&')});
  } else if(cls<5.5){ // sand, ochre
    gl = mag>.12?edgeG:(L<.3?${g(':')}:L<.5?${g('=')}:L<.7?${g('+')}:${g('*')});
  } else if(cls<6.5){ // ground: paving in flat strokes, joints as edges
    gl = mag>.1?edgeG:(L<.2?${g('.')}:L<.38?${g(':')}:L<.55?${g('=')}:L<.72?${g('—')}:${g('#')});
  } else if(cls<7.5){ // dark
    gl = L<.04?${g(' ')}:${g('.')};
  } else if(cls<8.5){ // bright: glare, foam, white stone
    gl = mag>.12?edgeG:(L<.85?${g('o')}:${g('@')});
  } else {            // wall: upright strokes
    gl = mag>.1?edgeG:(L<.2?${g(':')}:L<.4?${g('|')}:L<.6?${g('#')}:${g('8')});
  }`;

const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;

/**
 * Depth models draw object edges as soft ramps a few pixels wide, and a relief built on a ramp
 * stretches across it as the camera moves. This snaps each ramp into a step: where depth varies by
 * more than `range` within `radius` (a share of the width) of a pixel, the pixel takes the nearer of
 * the local minimum and maximum. Gentle slopes such as floors vary less and are left alone. Runs
 * once per depth map, on a copy at most 768 px wide (the relief grid is coarser than that anyway).
 */
function sharpenDepth(tex, { radius = .012, range = .1 } = {}) {
  const img = tex.image, sw = img.width, sh = img.height;
  const w = Math.min(768, sw), h = Math.max(1, Math.round(sh * w / sw)), r = Math.max(1, Math.round(radius * w));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  const px = x.getImageData(0, 0, w, h).data, d = new Uint8Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = px[i * 4];
  // separable sliding min and max over a (2r+1)² box
  const pass = (src, horizontal, pick) => {
    const out = new Uint8Array(src.length), n = horizontal ? w : h, m = horizontal ? h : w;
    for (let line = 0; line < m; line++) for (let i = 0; i < n; i++) {
      let v = pick === 'min' ? 255 : 0;
      for (let k = Math.max(0, i - r), e = Math.min(n - 1, i + r); k <= e; k++) {
        const s = src[horizontal ? line * w + k : k * w + line];
        v = pick === 'min' ? Math.min(v, s) : Math.max(v, s);
      }
      out[horizontal ? line * w + i : i * w + line] = v;
    }
    return out;
  };
  const lo = pass(pass(d, true, 'min'), false, 'min'), hi = pass(pass(d, true, 'max'), false, 'max');
  const t = range * 255, out = new Uint8Array(w * h * 4);
  for (let i = 0; i < d.length; i++) {
    const v = hi[i] - lo[i] > t ? (d[i] - lo[i] < hi[i] - d[i] ? lo[i] : hi[i]) : d[i];
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  // canvas rows run top-down; flip so the texture lines up with image textures (flipY)
  const flipped = new Uint8Array(out.length), row = w * 4;
  for (let y = 0; y < h; y++) flipped.set(out.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
  const res = new THREE.DataTexture(flipped, w, h, THREE.RGBAFormat);
  res.colorSpace = THREE.NoColorSpace; res.magFilter = THREE.LinearFilter; res.minFilter = THREE.LinearMipmapLinearFilter;
  res.generateMipmaps = true; res.needsUpdate = true;
  return res;
}

/**
 * The picture as a mesh: with depth, a grid displaced along each pixel's view ray (inverse depth
 * mapped between `near` and `far`), seen through a camera that sways around the focus distance;
 * without depth, a flat card at the focus distance (the same camera then shows it unchanged).
 * Writes linear colour and class into the engine's render target, plus a blur map for tilt-shift.
 */
function pictureSource(texture, depthTex, opts) {
  const { near = 2.6, far = 40, focus = .24, blur = [.1, .6], sway = [2, 1], parallax = true, exposure = 1, tear = 6, fill = .06 } = opts;
  const imgAspect = () => texture.image.width / texture.image.height;
  const tan0 = Math.tan(THREE.MathUtils.degToRad(20)); // image frustum: 40° vertical
  const uniforms = {
    uImg: { value: texture }, uDepth: { value: depthTex ? sharpenDepth(depthTex) : black }, uHasDepth: { value: depthTex ? 1 : 0 },
    uTan: { value: new THREE.Vector2(tan0 * imgAspect(), tan0) }, uNear: { value: near }, uFar: { value: far },
    uFocus: { value: focus }, uBlur: { value: new THREE.Vector2(...blur) },
  };
  // inverse depth d (1 near, 0 far) -> distance along the view ray; without depth everything sits at the focus.
  // The mesh reaches 12% past each image edge, repeating the edge pixels, so swaying never shows a gap.
  //
  // Depth edges: one continuous sheet would stretch triangles across every jump in depth (a tower
  // against the sky) and smear as the camera moves. So the relief is three layers:
  //   front     the picture itself, torn wherever depth changes faster than `tear` (inverse depth
  //             per image width) inside one triangle
  //   back      depth and colour of the farthest point within `fill` of each point: what is
  //             plausibly behind an edge, shown through the front layer's tears; torn the same
  //             way, because its own jump (where the search stops reaching the background) would
  //             otherwise stretch across the hole too
  //   backdrop  the picture blurred on the far plane, for any gap the other two leave
  // sharpenDepth() first turns the model's soft edge ramps into steps that the tear test can see.
  const LAYERS = { front: 0, back: 1, far: 2 };
  const vertexShader = (kind) => /* glsl */`
uniform sampler2D uDepth; uniform float uHasDepth, uNear, uFar, uFocus, uFill; uniform vec2 uTan;
varying vec2 vUv, vGrid; varying float vD;
float depthAt(vec2 p){ return textureLod(uDepth,p,1.).r; }
void main(){
  vec2 u = uv*1.24-.12, c = clamp(u,0.,1.);
  float d = uHasDepth>.5 ? depthAt(c) : uFocus;
  vec2 src = c;${kind === 'back' ? `
  if(uHasDepth>.5){
    vec2 r = vec2(uFill, uFill*uTan.x/uTan.y); // a circle in image pixels
    for(int i=0;i<12;i++){
      vec2 dir = vec2(cos(float(i)*.5236), sin(float(i)*.5236));
      for(int k=1;k<=4;k++){
        vec2 q = clamp(c+dir*r*float(k)/4.,0.,1.); float dq = depthAt(q);
        if(dq<d){ d = dq; src = q; }
      }
    }
  }` : ''}${kind === 'far' ? `
  d = 0.;` : ''}
  vUv = src; vGrid = u; vD = d;
  float z = 1./mix(1./uFar,1./uNear,d)${{ front: '', back: '*1.02', far: '*1.06' }[kind]};
  vec3 p = vec3((u.x-.5)*2.*uTan.x,(u.y-.5)*2.*uTan.y,-1.)*z;
  gl_Position = projectionMatrix*viewMatrix*vec4(p,1.);
}`;
  // Drop triangles that span a depth jump (not the backdrop, which is flat). The test needs depth's
  // gradient across the image, not across the screen: a triangle stretched by the camera changes
  // screen-space derivatives, so solve them back through the image-to-screen Jacobian.
  const tearGLSL = (kind) => kind === 'far' ? '' : /* glsl */`
  if(uHasDepth>.5){
    vec2 a = dFdx(vGrid), b = dFdy(vGrid), D = vec2(dFdx(vD), dFdy(vD));
    float det = a.x*b.y-a.y*b.x;
    vec2 grad = vec2(b.y*D.x-a.y*D.y, a.x*D.y-b.x*D.x)/(abs(det)>1e-12 ? det : 1e-12);
    if(length(grad)>uTear) discard;
  }`;
  Object.assign(uniforms, { uTear: { value: tear }, uFill: { value: fill } });
  const colorFrag = (kind) => /* glsl */`
uniform sampler2D uImg, uDepth; uniform float uHasDepth, uTear;
varying vec2 vUv, vGrid; varying float vD;
${classifyGLSL(opts)}
void main(){${tearGLSL(kind)}
  gl_FragColor = vec4(textureLod(uImg,vUv,${{ front: '0.', back: '1.', far: '3.5' }[kind]}).rgb*${glf(exposure)}, classify(vUv)/16.);
}`;
  // tilt-shift strength from distance to the focus depth (0 sharp .. 1 full blur)
  const blurFrag = (kind) => /* glsl */`
uniform float uFocus, uHasDepth, uTear; uniform vec2 uBlur;
varying vec2 vUv, vGrid; varying float vD;
void main(){${tearGLSL(kind)}
  float k = pow(smoothstep(uBlur.x,uBlur.y,abs(vD-uFocus)),1.6); gl_FragColor = vec4(k,k,k,1.);
}`;
  const mat = (frag, kind) => new THREE.ShaderMaterial({ uniforms, vertexShader: vertexShader(kind), fragmentShader: frag(kind) });
  const hasDepth = () => uniforms.uHasDepth.value > .5;
  // relief detail follows the quality tier (depth may arrive later, so the grid is always there)
  const SEGS = { high: 360, mid: 240, low: 160 };
  const grid = (segs) => new THREE.PlaneGeometry(1, 1, segs, Math.max(1, Math.round(segs / imgAspect())));
  let geo = grid(parallax ? SEGS[Q.name] : 1);
  const layer = (m, kind) => { const x = new THREE.Mesh(geo, m); x.frustumCulled = false; x.userData.kind = kind; return x; };
  const kinds = Object.keys(LAYERS);
  const meshes = kinds.map(k => layer(mat(colorFrag, k), k));
  const blurMeshes = kinds.map(k => layer(mat(blurFrag, k), k));
  const scene = new THREE.Scene(); scene.add(...meshes);
  const blurScene = new THREE.Scene(); blurScene.add(...blurMeshes);
  /** The back layer and backdrop only matter once the relief has depth to tear. */
  const syncLayers = () => [...meshes, ...blurMeshes].forEach(m => { if (m.userData.kind !== 'front') m.visible = parallax && hasDepth(); });
  syncLayers();
  if (parallax) onTier((q) => {
    if (SEGS[q.name] === geo.parameters.widthSegments) return;
    const old = geo; geo = grid(SEGS[q.name]);
    [...meshes, ...blurMeshes].forEach(m => { m.geometry = geo; });
    old.dispose();
  });
  const blurRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });

  const camera = new THREE.PerspectiveCamera(40, 1, .5, far * 4);
  const focusZ = () => 1 / THREE.MathUtils.lerp(1 / far, 1 / near, focus);
  let screenAspect = 1;
  const resize = (a = screenAspect) => {
    screenAspect = a;
    const tx0 = tan0 * imgAspect(), margin = parallax && hasDepth() ? .95 : 1; // crop a little: the repeated edge pixels stay out of view
    const ty = (a > imgAspect() ? tx0 / a : tan0) * margin;                 // cover: crop whichever side overflows
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(ty)); camera.aspect = a; camera.updateProjectionMatrix();
    uniforms.uTan.value.set(tx0, tan0);
  };
  const D = THREE.MathUtils.degToRad, pivot = new THREE.Vector3();
  /** Slow automatic sway plus a damped share of the viewer's own orbit and zoom. */
  function update(t, dt, state) {
    const on = parallax && hasDepth(), o = state?.orbit ?? { yaw: 0, el: 0, zoom: 1 };
    const yaw = on ? D(sway[0] * Math.sin(t * .3) + THREE.MathUtils.clamp(o.yaw * .1, -3, 3)) : 0;
    const el = on ? D(sway[1] * Math.sin(t * .23 + 1) + THREE.MathUtils.clamp(o.el * .1, -2, 2)) : 0;
    const R = focusZ() * (on ? THREE.MathUtils.clamp(o.zoom, .75, 1.1) : 1);
    pivot.set(0, 0, -focusZ());
    camera.position.set(Math.sin(yaw) * Math.cos(el) * R, Math.sin(el) * R, -focusZ() + Math.cos(yaw) * Math.cos(el) * R);
    camera.lookAt(pivot); camera.updateMatrixWorld();
  }
  const src = {
    scene, camera, resize, update,
    /** Bumped on every picture or depth change, so a paused frame still redraws. */
    version: 0,
    hasDepth,
    /** Per-pixel tilt-shift strength for the tilt pass (run.js); only while a depth map is in use. */
    blur: {
      texture: blurRT.texture,
      get enabled() { return hasDepth(); },
      setSize(w, h) { blurRT.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); },
      render(renderer) { renderer.setRenderTarget(blurRT); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.render(blurScene, camera); },
    },
    /** Swap the picture; without a depth map it is shown flat until setDepth(). */
    setImage(t, depth = null) {
      const old = uniforms.uImg.value; uniforms.uImg.value = texture = t;
      src.setDepth(depth); if (old !== t) old.dispose();
    },
    setDepth(depth) {
      const old = uniforms.uDepth.value, sharp = depth ? sharpenDepth(depth) : black;
      if (depth) depth.dispose();
      uniforms.uDepth.value = sharp; uniforms.uHasDepth.value = depth ? 1 : 0;
      if (old !== black) old.dispose();
      resize(); syncLayers(); src.version++;
    },
  };
  return src;
}

const loadTexture = (url, srgb = true) => new THREE.TextureLoader().loadAsync(url).then(t => {
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
});

/**
 * Run a picture as a diorama. `src` is any image URL the page may load; `depth` an optional
 * depth map for it (tools/depth.py: white near, black far), or 'auto' to estimate one in the
 * browser right away; `cell` is the glyph cell size in image pixels. Dropping an image file on
 * the page, or "Choose image", swaps the picture (read locally, never uploaded). A picture without
 * depth shows flat, with an "Add depth" button that estimates it on this device
 * (depth-browser.js); after the first time, new pictures get depth automatically (not on the
 * low tier). The relief's grid detail follows the quality tier.
 * Classifier: `horizon` (0 bottom .. 1 top, used without depth), `smooth`, `gray`, `skyDepth`,
 * `groundSlope`. Depth: `near`, `far`, `focus` (inverse depth in focus), `blur` ([sharp, full]
 * distance from focus), `sway` (auto camera sway in degrees), `parallax`, `tear` (depth change per
 * image width where the relief tears) and `fill` (how far, as a share of the width, the back layer
 * looks for what is behind an edge). `rules`, `glyphs` and
 * `tilt` override the glyph rules, grading and the screen-space tilt used without depth.
 */
export async function runPicture({ src, depth = null, title, cell = [6, 12], horizon = .4, smooth = .035, gray = .16, skyDepth = .03, groundSlope = .3,
  rules = pictureRules, glyphs = {}, tilt = { focus: .4, start: .2, end: .55 }, ...depthOpts }) {
  const auto = depth === 'auto';
  const [texture, depthTex] = await Promise.all([loadTexture(src), depth && !auto ? loadTexture(depth, false) : null]);
  const { width: w, height: h } = texture.image;
  const source = pictureSource(texture, depthTex, { horizon, smooth, gray, skyDepth, groundSlope, ...depthOpts });
  const show = readFlags().ui;
  const bar = toolbar(show);
  const button = depthButton(source, src, { show, bar });
  addUpload(source, button, bar);
  if (auto) button.run();
  return runDiorama({
    title, size: [w, h], grid: [Math.round(w / cell[0]), Math.round(h / cell[1])],
    source, tilt,
    glyphs: { rules, saturation: 1.25, gain: 1.35, bg: .28, bgByClass: { [PIC_CLS.sky]: .85, [PIC_CLS.bright]: .55, [PIC_CLS.water]: .4 }, wind: { drift: [.2, .05] }, ...glyphs },
  });
}

/**
 * Bring your own picture: a "Choose image" button (works on phones too) and drag-and-drop.
 * Files are read locally; nothing is uploaded anywhere. Once depth has been used, a new picture
 * gets depth too.
 */
function addUpload(source, button, bar) {
  let lastUrl = null;
  async function use(f) {
    if (!f?.type.startsWith('image/')) return;
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    const url = lastUrl = URL.createObjectURL(f);
    source.setImage(await loadTexture(url));
    button.picture(url);
  }
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
  input.style.display = 'none';
  input.addEventListener('change', () => { use(input.files?.[0]); input.value = ''; });
  const choose = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Choose image' });
  choose.title = 'Show your own picture as glyphs. It is read on this device, not uploaded.';
  choose.style.cssText = BUTTON_CSS; choose.addEventListener('click', () => input.click());
  bar.prepend(choose, input);
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => { e.preventDefault(); use([...(e.dataTransfer?.files ?? [])].find(f => f.type.startsWith('image/'))); });
}

const BUTTON_CSS = `padding:6px 11px;border-radius:3px;cursor:pointer;
  font:italic 15px/1.3 "EB Garamond",Garamond,Georgia,serif;color:#f2e6cc;background:rgba(20,16,12,.6);
  border:1px solid rgba(242,230,204,.28);box-shadow:0 4px 16px rgba(0,0,0,.35)`;

/** Bottom-left row for the picture controls; hidden with ?ui=off. */
function toolbar(show) {
  const bar = document.createElement('div');
  bar.style.cssText = `position:fixed;left:14px;bottom:14px;z-index:20;display:${show ? 'flex' : 'none'};gap:8px;flex-wrap:wrap;max-width:calc(100vw - 28px)`;
  document.body.append(bar);
  return bar;
}

/**
 * "Add depth" control for pictures without a depth map. Nothing is downloaded until it is
 * clicked (or ?depth=auto). After one success, later pictures get depth without asking.
 */
function depthButton(source, firstUrl, { show, bar }) {
  const el = document.createElement('button');
  el.type = 'button'; el.style.cssText = BUTTON_CSS;
  let url = firstUrl, busy = false, enabled = false;
  const idle = () => {
    el.textContent = 'Add depth · runs on this device, about 50 MB once';
    el.title = 'Estimates a depth map with Depth Anything V2 Small in your browser. The picture stays on this device.';
  };
  const visible = () => { el.style.display = show && (busy || !source.hasDepth()) ? '' : 'none'; };
  async function run() {
    if (busy) return;
    busy = true; enabled = true; el.disabled = true; visible();
    const target = url;
    try {
      const tex = await estimateDepth(target, {
        onStage: (s) => { el.textContent = s === 'loading' ? 'Loading depth model…' : 'Estimating depth…'; },
        onProgress: ({ loaded, total }) => { if (total > 1e6) el.textContent = `Loading depth model ${(loaded / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB`; },
      });
      if (target === url) source.setDepth(tex); else tex.dispose(); // a newer picture arrived meanwhile
      busy = false; idle();
      if (target !== url) run();
    } catch (e) {
      console.error(e);
      busy = false; enabled = false; el.textContent = `Depth failed: ${e.message ?? e}. Try again?`;
    } finally { el.disabled = false; visible(); }
  }
  el.addEventListener('click', run);
  idle(); bar.append(el); visible();
  return {
    run,
    /**
     * A new picture was shown (flat): estimate right away if depth is already in use, except on
     * the low tier, where each estimate is a long pause on the CPU and stays the viewer's choice.
     */
    picture(next) { url = next; if (enabled && Q.name !== 'low') run(); else { idle(); visible(); } },
  };
}
