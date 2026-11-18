// Any picture as a diorama source: the image takes the place of the 3D render, and each pixel's
// surface class is guessed from its colour, its local texture and where it sits in the frame.
// With a depth map (tools/depth.py) the picture also becomes a 2.5D relief the camera can sway
// around, the sky and walls-versus-ground come from geometry instead of guesses, and the tilt-shift
// blur follows real distance. Everything after that (glyph pass, quality tiers, menu, recording)
// is the shared engine.
import * as THREE from 'three';
import { g } from './glyphs.js';
import { glf } from './noise.js';
import { runDiorama } from './run.js';

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
 * The picture as a mesh: with depth, a grid displaced along each pixel's view ray (inverse depth
 * mapped between `near` and `far`), seen through a camera that sways around the focus distance;
 * without depth, a flat card at the focus distance (the same camera then shows it unchanged).
 * Writes linear colour and class into the engine's render target, plus a blur map for tilt-shift.
 */
function pictureSource(texture, depthTex, opts) {
  const { near = 2.6, far = 40, focus = .24, blur = [.1, .6], sway = [2, 1], parallax = true, exposure = 1 } = opts;
  const imgAspect = () => texture.image.width / texture.image.height;
  const tan0 = Math.tan(THREE.MathUtils.degToRad(20)); // image frustum: 40° vertical
  const uniforms = {
    uImg: { value: texture }, uDepth: { value: depthTex ?? black }, uHasDepth: { value: depthTex ? 1 : 0 },
    uTan: { value: new THREE.Vector2(tan0 * imgAspect(), tan0) }, uNear: { value: near }, uFar: { value: far },
    uFocus: { value: focus }, uBlur: { value: new THREE.Vector2(...blur) },
  };
  // inverse depth d (1 near, 0 far) -> distance along the view ray; without depth everything sits at the focus.
  // The mesh reaches 12% past each image edge, repeating the edge pixels, so swaying never shows a gap.
  const vertexShader = /* glsl */`
uniform sampler2D uDepth; uniform float uHasDepth, uNear, uFar, uFocus; uniform vec2 uTan;
varying vec2 vUv;
void main(){
  vec2 u = uv*1.24-.12;
  vUv = clamp(u,0.,1.);
  float d = uHasDepth>.5 ? textureLod(uDepth,vUv,2.).r : uFocus;
  float z = 1./mix(1./uFar,1./uNear,d);
  vec3 p = vec3((u.x-.5)*2.*uTan.x,(u.y-.5)*2.*uTan.y,-1.)*z;
  gl_Position = projectionMatrix*viewMatrix*vec4(p,1.);
}`;
  const colorMat = new THREE.ShaderMaterial({
    uniforms, vertexShader, depthWrite: true,
    fragmentShader: /* glsl */`
uniform sampler2D uImg, uDepth; uniform float uHasDepth;
varying vec2 vUv;
${classifyGLSL(opts)}
void main(){ gl_FragColor = vec4(textureLod(uImg,vUv,0.).rgb*${glf(exposure)}, classify(vUv)/16.); }`,
  });
  // tilt-shift strength from distance to the focus depth (0 sharp .. 1 full blur)
  const blurMat = new THREE.ShaderMaterial({
    uniforms, vertexShader,
    fragmentShader: /* glsl */`
uniform sampler2D uDepth; uniform float uFocus; uniform vec2 uBlur;
varying vec2 vUv;
void main(){ float k = pow(smoothstep(uBlur.x,uBlur.y,abs(textureLod(uDepth,vUv,1.).r-uFocus)),1.6); gl_FragColor = vec4(k,k,k,1.); }`,
  });
  const segs = parallax && depthTex ? 360 : 1;
  const geo = new THREE.PlaneGeometry(1, 1, segs, Math.max(1, Math.round(segs / imgAspect())));
  const mesh = new THREE.Mesh(geo, colorMat); mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  const blurMesh = new THREE.Mesh(geo, blurMat); blurMesh.frustumCulled = false;
  const blurScene = new THREE.Scene(); blurScene.add(blurMesh);
  const blurRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });

  const camera = new THREE.PerspectiveCamera(40, 1, .5, far * 4);
  const focusZ = () => 1 / THREE.MathUtils.lerp(1 / far, 1 / near, focus);
  let screenAspect = 1;
  const resize = (a = screenAspect) => {
    screenAspect = a;
    const tx0 = tan0 * imgAspect(), margin = parallax && depthTex ? .95 : 1; // crop a little: the repeated edge pixels stay out of view
    const ty = (a > imgAspect() ? tx0 / a : tan0) * margin;                 // cover: crop whichever side overflows
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(ty)); camera.aspect = a; camera.updateProjectionMatrix();
    uniforms.uTan.value.set(tx0, tan0);
  };
  const D = THREE.MathUtils.degToRad, pivot = new THREE.Vector3();
  /** Slow automatic sway plus a damped share of the viewer's own orbit and zoom. */
  function update(t, dt, state) {
    const on = parallax && depthTex, o = state?.orbit ?? { yaw: 0, el: 0, zoom: 1 };
    const yaw = on ? D(sway[0] * Math.sin(t * .3) + THREE.MathUtils.clamp(o.yaw * .1, -6, 6)) : 0;
    const el = on ? D(sway[1] * Math.sin(t * .23 + 1) + THREE.MathUtils.clamp(o.el * .1, -4, 4)) : 0;
    const R = focusZ() * (on ? THREE.MathUtils.clamp(o.zoom, .75, 1.1) : 1);
    pivot.set(0, 0, -focusZ());
    camera.position.set(Math.sin(yaw) * Math.cos(el) * R, Math.sin(el) * R, -focusZ() + Math.cos(yaw) * Math.cos(el) * R);
    camera.lookAt(pivot); camera.updateMatrixWorld();
  }
  return {
    scene, camera, resize, update,
    /** Per-pixel tilt-shift strength for the tilt pass (run.js); only while a depth map is in use. */
    blur: {
      texture: blurRT.texture,
      get enabled() { return uniforms.uHasDepth.value > .5; },
      setSize(w, h) { blurRT.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); },
      render(renderer) { renderer.setRenderTarget(blurRT); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.render(blurScene, camera); },
    },
    /** Swap the picture. A dropped image has no depth map, so it is shown flat. */
    setImage(t, depth = null) {
      const old = uniforms.uImg.value; uniforms.uImg.value = texture = t;
      uniforms.uDepth.value = depth ?? black; uniforms.uHasDepth.value = depth ? 1 : 0;
      resize(); if (old !== t) old.dispose();
    },
  };
}

const loadTexture = (url, srgb = true) => new THREE.TextureLoader().loadAsync(url).then(t => {
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
});

/**
 * Run a picture as a diorama. `src` is any image URL the page may load; `depth` an optional
 * depth map for it (tools/depth.py: white near, black far); `cell` is the glyph cell size in
 * image pixels. Dropping an image file on the page swaps the picture (shown flat).
 * Classifier: `horizon` (0 bottom .. 1 top, used without depth), `smooth`, `gray`, `skyDepth`,
 * `groundSlope`. Depth: `near`, `far`, `focus` (inverse depth in focus), `blur` ([sharp, full]
 * distance from focus), `sway` (auto camera sway in degrees), `parallax`. `rules`, `glyphs` and
 * `tilt` override the glyph rules, grading and the screen-space tilt used without depth.
 */
export async function runPicture({ src, depth = null, title, cell = [6, 12], horizon = .4, smooth = .035, gray = .16, skyDepth = .03, groundSlope = .3,
  rules = pictureRules, glyphs = {}, tilt = { focus: .4, start: .2, end: .55 }, ...depthOpts }) {
  const [texture, depthTex] = await Promise.all([loadTexture(src), depth ? loadTexture(depth, false) : null]);
  const { width: w, height: h } = texture.image;
  const source = pictureSource(texture, depthTex, { horizon, smooth, gray, skyDepth, groundSlope, ...depthOpts });
  addDrop(source);
  return runDiorama({
    title, size: [w, h], grid: [Math.round(w / cell[0]), Math.round(h / cell[1])],
    source, tilt,
    glyphs: { rules, saturation: 1.25, gain: 1.35, bg: .28, bgByClass: { [PIC_CLS.sky]: .85, [PIC_CLS.bright]: .55, [PIC_CLS.water]: .4 }, wind: { drift: [.2, .05] }, ...glyphs },
  });
}

/** Drag an image file onto the page to see it as glyphs. */
function addDrop(source) {
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = [...(e.dataTransfer?.files ?? [])].find(f => f.type.startsWith('image/'));
    if (!f) return;
    const url = URL.createObjectURL(f);
    try { source.setImage(await loadTexture(url)); } finally { URL.revokeObjectURL(url); }
  });
}
