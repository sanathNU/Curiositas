// Fishing harbour: a cliff path leading to a wooden pier over turquoise water, with moored boats.
// Runs live in the browser and loops forever (Space pauses).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const W = 1440, HH = 1440, DURATION = 24;
const COLS = 200, ROWS = 100;
const CLS = { grass: 1, leaf: 2, flower: 3, stone: 4, stair: 5, pier: 6, wood: 7, sand: 8, water: 9, foam: 10, fox: 11, boat: 12, rock: 13 };
const PIER_Y = 2.2;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = x => x - Math.floor(x);
const hash2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  return (hash2(i, j) * (1 - u) + hash2(i + 1, j) * u) * (1 - v) + (hash2(i, j + 1) * (1 - u) + hash2(i + 1, j + 1) * u) * v;
}
const fbm = (x, y) => vnoise(x, y) * .5 + vnoise(x * 2.1 + 3, y * 2.1) * .28 + vnoise(x * 4.3, y * 4.3 + 5) * .15 + vnoise(x * 8.7, y * 8.7) * .07;
let seed = 23;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const time = { value: 0 };
function tag(mat, cls, extra) {
  mat.onBeforeCompile = (s) => {
    extra?.(s);
    s.fragmentShader = s.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n gl_FragColor.a = ${(cls / 16).toFixed(4)};`);
  };
  mat.customProgramCacheKey = () => `c${cls}${extra ? extra.toString().length : 0}`;
  return mat;
}
const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
function pixels(img, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  return { d: x.getImageData(0, 0, w, h).data, w, h };
}
const texLoader = new THREE.TextureLoader();
function tex(url, rx = 1, ry = 1) { const t = texLoader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; }

// ---------- land ----------
const coastZ = (x) => 10.6 + .24 * x + (fbm(x * .1 + 2, 1.3) - .5) * 9;
const ROCKS = [];
for (let i = 0; i < 46; i++) {
  const x = -30 + rnd() * 60, off = -2 + rnd() * rnd() * 12, r = .35 + rnd() * rnd() * 1.5;
  ROCKS.push([x, coastZ(x) + off, r]);
}
ROCKS.push([3, coastZ(3) + 6.5, 1.9], [5.1, coastZ(5) + 6.2, 1.2], [-8, coastZ(-8) + 5, 1.6]);
function rawH(x, z) {
  const d = coastZ(x) - z;
  let y = d < 0 ? d * .42 : 4.2 * (1 - Math.exp(-d * .42)) + d * .34;
  y += sstep(0, 5, d) * ((fbm(x * .09, z * .09) - .5) * 4.2 + (fbm(x * .4, z * .4) - .5) * .8);
  for (const [rx, rz, r] of ROCKS) { const q = ((x - rx) ** 2 + (z - rz) ** 2) / (r * r); if (q < 4) y = Math.max(y, y + Math.exp(-q * 1.4) * r * 1.2); }
  return y;
}
const PATH = [[8.5, -17], [6.4, -12.5], [3.4, -8.5], [1.4, -4.5], [.6, -.5], [-.6, 3], [-2, 7], [-2.8, 12], [-3, 17], [-2.5, 22]];
const pathCurve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', .5);
const pathLen = pathCurve.getLength();
const pathS = [];
for (let i = 0; i <= 500; i++) { const p = pathCurve.getPointAt(i / 500); pathS.push({ x: p.x, z: p.z, y: rawH(p.x, p.z) }); }
for (let pass = 0; pass < 7; pass++) {
  const c = pathS.map(s => s.y);
  for (let i = 0; i < c.length; i++) { let a = 0, n = 0; for (let k = -9; k <= 9; k++) { const v = c[i + k]; if (v !== undefined) { a += v; n++; } } pathS[i].y = a / n; }
}
pathS.forEach(s => { s.y = Math.max(s.y, .12); });
const X0 = -45, X1 = 45, Z0 = -52, Z1 = 42, FW = 600, FH = 626;
const fD = new Float32Array(FW * FH), fY = new Float32Array(FW * FH), fH = new Float32Array(FW * FH);
for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
  const x = X0 + (X1 - X0) * i / (FW - 1), z = Z0 + (Z1 - Z0) * j / (FH - 1);
  let best = 1e9, by = 0;
  for (let k = 0; k < pathS.length; k += 3) { const s = pathS[k], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < best) { best = d; by = s.y; } }
  const D = Math.sqrt(best), k = sstep(3, 1.4, D);
  fD[j * FW + i] = D; fY[j * FW + i] = by;
  fH[j * FW + i] = rawH(x, z) * (1 - k) + (by - .03) * k;
}
function samp(f, x, z) {
  const u = clamp((x - X0) / (X1 - X0)) * (FW - 1), v = clamp((z - Z0) / (Z1 - Z0)) * (FH - 1);
  const i = Math.min(FW - 2, u | 0), j = Math.min(FH - 2, v | 0), a = u - i, b = v - j;
  return (f[j * FW + i] * (1 - a) + f[j * FW + i + 1] * a) * (1 - b) + (f[(j + 1) * FW + i] * (1 - a) + f[(j + 1) * FW + i + 1] * a) * b;
}
const H = (x, z) => samp(fH, x, z);
const pathD = (x, z) => samp(fD, x, z);
const flowerField = (x, z) => fbm(x * .085 + 11, z * .1 - 4);

async function buildTerrain() {
  const [grass, sand, rock, slate] = await Promise.all(['leafy_grass', 'coast_sand_01', 'aerial_rocks_02', 'castle_wall_slates'].map(n => loadImg(`assets/tex/${n}.jpg`).then(i => pixels(i, 512, 512))));
  const TW = 2048, TH = 2140, col = new Uint8Array(TW * TH * 4), cls = new Uint8Array(TW * TH * 4);
  const pick = (t, x, z, m) => { const o = (((fract(z / m) * t.h) | 0) * t.w + ((fract(x / m) * t.w) | 0)) * 4; return [t.d[o], t.d[o + 1], t.d[o + 2]]; };
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const x = X0 + (X1 - X0) * i / (TW - 1), z = Z0 + (Z1 - Z0) * j / (TH - 1), y = H(x, z), d = coastZ(x) - z, pd = pathD(x, z);
    const n = fbm(x * .3, z * .3);
    let c, k;
    const nearSea = y < 1.3 + n * 1.4 && d < 7;
    if (pd < 1.45) { c = pick(slate, x, z, 3); c = [c[0] * .9, c[1] * .9, c[2] * .9]; k = CLS.stair; }
    else if (nearSea) {
      if (y < .55 + n * .5 && d > -2.5 && n > .36) { c = pick(sand, x, z, 3.2); c = [c[0] * 1.22, c[1] * 1.12, c[2] * .9]; k = CLS.sand; }
      else { c = pick(rock, x, z, 7); c = [c[0] * .68, c[1] * .72, c[2] * .78]; k = CLS.rock; }
    } else {
      c = pick(grass, x, z, 2.6); const v = .62 + .95 * fbm(x * .16 + 5, z * .16);
      c = [c[0] * .78 * v, c[1] * 1.1 * v, c[2] * .42 * v]; k = CLS.grass;
      if (flowerField(x, z) > .575) { c = [c[0] * .85 + 40, c[1] * .85 + 40, c[2] * .85 + 42]; }
    }
    const o = (j * TW + i) * 4;
    col[o] = Math.min(255, c[0]); col[o + 1] = Math.min(255, c[1]); col[o + 2] = Math.min(255, c[2]); col[o + 3] = 255; cls[o] = k * 16;
  }
  const colTex = new THREE.DataTexture(col, TW, TH, THREE.RGBAFormat);
  colTex.colorSpace = THREE.SRGBColorSpace; colTex.magFilter = THREE.LinearFilter; colTex.minFilter = THREE.LinearMipmapLinearFilter; colTex.generateMipmaps = true; colTex.anisotropy = 8; colTex.needsUpdate = true;
  const clsTex = new THREE.DataTexture(cls, TW, TH, THREE.RGBAFormat); clsTex.magFilter = clsTex.minFilter = THREE.NearestFilter; clsTex.needsUpdate = true;
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, 480, 500); g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, H(x, z)); uv.setXY(i, (x - X0) / (X1 - X0), (z - Z0) / (Z1 - Z0)); }
  g.computeVertexNormals();
  const m = new THREE.MeshLambertMaterial({ map: colTex });
  m.onBeforeCompile = (s) => {
    s.uniforms.clsTex = { value: clsTex };
    s.fragmentShader = 'uniform sampler2D clsTex;\n' + s.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n gl_FragColor.a = texture2D(clsTex, vMapUv).r;`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

// ---------- sea ----------
function buildSea() {
  const depth = new Float32Array(FW * FH * 4);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) depth[(j * FW + i) * 4] = -fH[j * FW + i];
  const dt = new THREE.DataTexture(depth, FW, FH, THREE.RGBAFormat, THREE.FloatType);
  dt.magFilter = dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
  const m = new THREE.ShaderMaterial({
    uniforms: { uD: { value: dt }, uT: time, uB: { value: new THREE.Vector4(X0, Z0, X1 - X0, Z1 - Z0) } },
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vW,1.); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uD; uniform float uT; uniform vec4 uB; varying vec3 vW;
      float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ return vn(p)*.55+vn(p*2.1+3.1)*.3+vn(p*4.3+7.7)*.15; }
      void main(){
        vec2 uv = (vW.xz-uB.xy)/uB.zw;
        float d = texture2D(uD,uv).r;
        if(d<-.05) discard;
        float n = fbm(vW.xz*.32+vec2(uT*.08,uT*.05));
        float dd = max(d,0.);
        float dist = sqrt(dd);
        float ph = dist*7.2+uT*1.05+n*3.6;
        float saw = fract(ph/6.2832);
        float lace = smoothstep(.36,.6,fbm(vW.xz*1.25+vec2(uT*.2,-uT*.1)));
        float range = smoothstep(4.6,1.6,dist)*smoothstep(.0,.3,dist);
        float trail = smoothstep(0.,.03,saw)*(1.-smoothstep(.04,.34,saw));
        float foam = trail*range*mix(.3,1.,lace);
        float swash = .22+.16*sin(uT*.8+vW.x*.25+n*5.);
        float rim = smoothstep(swash+.32,swash,dd)*(.45+.55*lace);
        vec3 shallow = vec3(.62,.86,.68), mid = vec3(.03,.62,.62), deep = vec3(.006,.17,.32);
        vec3 c = mix(shallow,mid,smoothstep(.05,1.6,dist));
        c = mix(c,deep,smoothstep(1.6,4.8,dist));
        c *= .86+.3*vn(vW.xz*vec2(.9,.5)+uT*vec2(.2,.32));
        c *= 1.-.22*smoothstep(.65,1.,saw)*range;
        float caustic = pow(vn(vW.xz*2.2+uT*.3)*vn(vW.xz*1.7-uT*.26+4.),2.);
        c += vec3(.25,.42,.4)*caustic*smoothstep(3.6,.8,dist);
        float sp = smoothstep(.8,.9,vn(vW.xz*vec2(1.6,3.8)+uT*vec2(.3,.5)));
        c += vec3(.5,.55,.5)*sp*smoothstep(1.2,3.,dist);
        float cls = 9.;
        float f = max(foam,rim);
        if(f>.3){ c = mix(c,vec3(1.1,1.12,1.08),clamp(f*1.6,0.,1.)); cls = 10.; }
        gl_FragColor = vec4(c,cls/16.);
      }`,
  });
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0); g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  return new THREE.Mesh(g, m);
}

// ---------- wind for everything soft ----------
function bladeWind(s) {
  s.uniforms.uT = time;
  s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float ph = instanceMatrix[3].x*.34+instanceMatrix[3].z*.22;
    float gust = sin(uT*.75-ph)*.5+.5;
    transformed.x += (sin(uT*1.6+ph*2.)*.28+gust*.6)*.22*position.y*position.y;`);
}
function leafWind(s) {
  s.uniforms.uT = time;
  s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float ph = instanceMatrix[3].x*.9+instanceMatrix[3].z*.7+instanceMatrix[3].y*.8;
    transformed.y += sin(uT*2.1+ph)*.035;
    transformed += vec3(1.,0.,.4)*sin(uT*.8+instanceMatrix[3].x*.22)*.06;`);
}

function buildGrass(scene) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-.045, 0, 0, .045, 0, 0, .012, .6, 0, -.045, 0, 0, .012, .6, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const N = 170000, im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), CLS.grass, bladeWind), N);
  const o = new THREE.Object3D(), c = new THREE.Color();
  let i = 0, guard = 0;
  while (i < N && guard++ < 5e6) {
    const x = -24 + rnd() * 48, z = -34 + rnd() * 58, y = H(x, z);
    if (y < 1.4 + fbm(x * .3, z * .3) * 1.4 || pathD(x, z) < 1.5 || coastZ(x) - z < 2) continue;
    o.position.set(x, y - .02, z); o.rotation.y = rnd() * 6.28;
    const s = .32 + rnd() * .3; o.scale.set(1.5, s, 1.5); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    const v = .55 + rnd() * .75, tone = fbm(x * .16 + 5, z * .16);
    const dk = .55 + 1.1 * tone; c.setRGB((.13 * v + tone * .1) * dk, .4 * v * dk, .05 * v * dk); im.setColorAt(i++, c);
  }
  im.count = i; im.receiveShadow = true; scene.add(im);
}
function buildFlowers(scene) {
  const g = new THREE.PlaneGeometry(.14, .14); g.rotateX(-Math.PI / 2 + .25);
  const N = 70000, im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), CLS.flower, bladeWind), N);
  const o = new THREE.Object3D(), c = new THREE.Color();
  let i = 0, guard = 0;
  while (i < N && guard++ < 6e6) {
    const x = -24 + rnd() * 48, z = -30 + rnd() * 54, y = H(x, z);
    const ff = flowerField(x, z);
    if (ff < .565 + rnd() * .05 || y < 1.8 || pathD(x, z) < 2 || coastZ(x) - z < 2.4) continue;
    if (fbm(x * .9, z * .9) < .47) continue;
    o.position.set(x, y + .2 + rnd() * .16, z); o.rotation.y = rnd() * 6.28; o.scale.setScalar(.8 + rnd() * .9); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    const r = rnd(); c.setRGB(.74 + r * .05, r < .35 ? .48 : .7, r < .35 ? .56 : .68); im.setColorAt(i++, c);
  }
  im.count = i; im.receiveShadow = true; scene.add(im);
}

// ---------- trees ----------
function buildTrees(scene, barkTex) {
  const spots = [];
  const push = (x, z, s, kind) => spots.push({ x, z, s, kind });
  let guard = 0;
  while (spots.length < 96 && guard++ < 9000) {
    const x = -24 + rnd() * 48, z = -28 + rnd() * 27;
    if (pathD(x, z) < (z > -9 ? 6.5 : 3.6) || spots.some(s => (s.x - x) ** 2 + (s.z - z) ** 2 < 8)) continue;
    if (Math.abs(x + 2) < 3 && z > 4 && z < 10) continue; // keep pier entrance clear
    push(x, z, .85 + rnd() * .55, rnd() < .15 ? 'gold' : rnd() < .4 ? 'gold' : 'green');
  }
  for (const [x, z, s, k] of [[-13, -9, 1.1, 'green'], [-11.5, -2.5, .9, 'green'], [12.5, -9, 1.15, 'gold'], [13.5, -3, 1, 'green'], [-14, 4, 1, 'green'], [13, 3, .85, 'green'], [-9.5, -13.5, 1.05, 'green'], [-12.5, -7, 1.15, 'gold'], [10.5, -7.5, 1, 'green'], [12, -12.5, 1.1, 'gold'], [-1, -16, .9, 'green'], [9.5, 8.5, .8, 'green']]) push(x, z, s, k);
  const leaves = [], pal = {
    gold: [[.98, .68, .1], [.86, .52, .05], [1, .78, .2], [.7, .55, .1], [.6, .5, .14]],
    red: [[.82, .1, .04], [.95, .2, .05], [.6, .05, .04], [1, .35, .1]],
    green: [[.2, .42, .1], [.3, .5, .12], [.14, .3, .09], [.45, .55, .15]],
  };
  const trunks = [];
  for (const t of spots) {
    const y0 = H(t.x, t.z), H0 = 5.3 * t.s;
    const tg = new THREE.CylinderGeometry(.09 * t.s, .22 * t.s, H0, 7); tg.translate(t.x, y0 + H0 / 2, t.z);
    trunks.push(tg);
    for (let b = 0; b < 3; b++) { const a = rnd() * 6.28; const bg = new THREE.CylinderGeometry(.03 * t.s, .08 * t.s, 2.2 * t.s, 5); bg.rotateZ(.8); bg.rotateY(a); bg.translate(t.x + Math.cos(a) * .6 * t.s, y0 + H0 * .72, t.z - Math.sin(a) * .6 * t.s); trunks.push(bg); }
    const lobes = 11;
    for (let l = 0; l < lobes; l++) {
      const a = rnd() * 6.28, r = rnd() ** .6 * 2.5 * t.s, lx = t.x + Math.cos(a) * r, lz = t.z + Math.sin(a) * r, ly = y0 + H0 * .8 + (rnd() - .35) * 1.8 * t.s + (1 - r / (2.6 * t.s)) * 1.3 * t.s;
      const lr = (.75 + rnd() * .55) * t.s, n = 145;
      for (let i = 0; i < n; i++) {
        const u = rnd() * 2 - 1, th = rnd() * 6.28, q = Math.sqrt(1 - u * u), rr = lr * Math.cbrt(rnd());
        const p = pal[t.kind][(rnd() * pal[t.kind].length) | 0], lit = .72 + .6 * clamp(u * .5 + .5);
        leaves.push(lx + q * Math.cos(th) * rr, ly + u * rr * .75, lz + q * Math.sin(th) * rr, p[0] * lit, p[1] * lit, p[2] * lit);
      }
    }
  }
  const barkMat = tag(new THREE.MeshLambertMaterial({ map: barkTex, color: '#e8dfd2' }), CLS.wood);
  const trunk = new THREE.Mesh(mergeGeometries(trunks), barkMat); trunk.castShadow = true; scene.add(trunk);
  const g = new THREE.PlaneGeometry(.3, .24);
  const count = leaves.length / 6, im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), CLS.leaf, leafWind), count);
  const o = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    o.position.set(leaves[i * 6], leaves[i * 6 + 1], leaves[i * 6 + 2]); o.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    c.setRGB(leaves[i * 6 + 3], leaves[i * 6 + 4], leaves[i * 6 + 5]); im.setColorAt(i, c);
  }
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}

// ---------- pier, bollards, boats ----------
function buildPier(scene) {
  const plankTex = tex('assets/tex/weathered_planks.jpg', 2, 1);
  const slateTex = tex('assets/tex/castle_wall_slates.jpg', .4, .2);
  const o = new THREE.Object3D();
  const steps = Math.floor(pathLen / .43);
  const landSteps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.75, .2, .4), tag(new THREE.MeshLambertMaterial({ map: slateTex, color: '#cfcac4' }), CLS.stair), steps);
  const pierPlanks = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, .16, .42), tag(new THREE.MeshLambertMaterial({ map: plankTex, color: '#b09a82' }), CLS.pier), steps);
  let li = 0, pi = 0;
  for (let i = 0; i < steps; i++) {
    const u = (i + .5) / steps, p = pathCurve.getPointAt(u), t = pathCurve.getTangentAt(u);
    const y = samp(fY, p.x, p.z), cz = coastZ(p.x);
    o.rotation.set(0, Math.atan2(t.x, t.z), 0); o.scale.set(1, 1, 1);
    if (p.z < cz - 2) {
      o.position.set(p.x, y, p.z); o.updateMatrix(); landSteps.setMatrixAt(li++, o.matrix);
    } else {
      o.position.set(p.x, Math.max(y, PIER_Y), p.z); o.updateMatrix(); pierPlanks.setMatrixAt(pi++, o.matrix);
    }
  }
  landSteps.count = li; pierPlanks.count = pi;
  landSteps.receiveShadow = true; landSteps.castShadow = true; scene.add(landSteps);
  pierPlanks.receiveShadow = true; pierPlanks.castShadow = true; scene.add(pierPlanks);
  // pier posts
  const posts = [];
  for (let i = 0; i < pathS.length; i += 10) {
    const s = pathS[i]; if (!s || s.z < coastZ(s.x) - 1) continue;
    for (const side of [-1, 1]) {
      const h = PIER_Y + 1.6;
      const pg = new THREE.CylinderGeometry(.09, .13, h, 7);
      pg.translate(s.x + side * 1.15, h / 2 - 1.0, s.z);
      posts.push(pg);
    }
  }
  if (posts.length) {
    const merged = mergeGeometries(posts); merged.computeVertexNormals();
    const mesh = new THREE.Mesh(merged, tag(new THREE.MeshLambertMaterial({ map: plankTex, color: '#7a6a55' }), CLS.pier));
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  }
  // railings (horizontal beams between posts)
  const rails = [];
  for (let i = 0; i < pathS.length; i += 10) {
    const s = pathS[i]; if (!s || s.z < coastZ(s.x) - 1) continue;
    const next = pathS[Math.min(i + 10, pathS.length - 1)];
    if (!next || next.z < coastZ(next.x) - 1) continue;
    const dx = next.x - s.x, dz = next.z - s.z, len = Math.sqrt(dx * dx + dz * dz);
    if (len < .1) continue;
    for (const side of [-1, 1]) {
      const rg = new THREE.CylinderGeometry(.035, .035, len, 5);
      rg.rotateZ(Math.PI / 2);
      const mx = (s.x + next.x) / 2 + side * 1.15, mz = (s.z + next.z) / 2;
      const ang = Math.atan2(dx, dz);
      const m = new THREE.Matrix4().makeRotationY(ang).setPosition(mx, PIER_Y + .9, mz);
      rg.applyMatrix4(m);
      rails.push(rg);
    }
  }
  if (rails.length) {
    const merged = mergeGeometries(rails); merged.computeVertexNormals();
    const mesh = new THREE.Mesh(merged, tag(new THREE.MeshLambertMaterial({ map: plankTex, color: '#8a7a65' }), CLS.pier));
    mesh.castShadow = true; scene.add(mesh);
  }
}
function buildBollards(scene) {
  const parts = [];
  const add = (g, y) => { g.translate(0, y, 0); g.deleteAttribute('uv'); parts.push(g.index ? g.toNonIndexed() : g); };
  add(new THREE.CylinderGeometry(.16, .2, .75, 8), .38);
  add(new THREE.SphereGeometry(.18, 8, 6), .78);
  const g = mergeGeometries(parts); g.computeVertexNormals();
  const n = 10, im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ color: '#c8bfb0' }), CLS.stone), n), o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const u = .42 + i / n * .52, p = pathCurve.getPointAt(u), t = pathCurve.getTangentAt(u), s = i % 2 ? 1 : -1;
    const x = p.x - t.z * s * 1.7, z = p.z + t.x * s * 1.7;
    const y = Math.max(H(x, z), PIER_Y);
    o.position.set(x, y - .02, z); o.rotation.y = rnd(); o.scale.setScalar(1.1); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
  }
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}
function buildBoats(scene) {
  const wood = tag(new THREE.MeshLambertMaterial({ map: tex('assets/tex/weathered_planks.jpg', 1.5, 1), color: '#a4593a' }), CLS.wood);
  const hullBlue = tag(new THREE.MeshLambertMaterial({ color: '#2266aa', side: THREE.DoubleSide }), CLS.boat);
  const hullRed = tag(new THREE.MeshLambertMaterial({ color: '#cc3322', side: THREE.DoubleSide }), CLS.boat);
  const boats = [[-5, 17.5, .4, hullBlue], [-1.2, 20, -.6, hullRed], [-6.2, 14.5, .9, hullBlue]];
  for (const [bx, bz, rot, mat] of boats) {
    const g = new THREE.Group();
    const hg = new THREE.BoxGeometry(1.3, .5, 3, 6, 1, 10);
    const p = hg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), t = 1 - Math.pow(Math.abs(z) / 1.5, 2.2) * .45;
      p.setX(i, p.getX(i) * t);
      if (p.getY(i) < 0) p.setX(i, p.getX(i) * .7);
    }
    hg.computeVertexNormals();
    const hm = new THREE.Mesh(hg, mat); hm.position.y = .32; g.add(hm);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, 2.6, 6), wood);
    mast.position.y = 1.6; g.add(mast);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.5, 5), wood);
    boom.rotation.z = .55; boom.position.set(.35, 1.7, 0); g.add(boom);
    g.position.set(bx, .12, bz); g.rotation.y = rot;
    g.traverse(o => { o.castShadow = true; o.receiveShadow = true; }); scene.add(g);
  }
}
function buildRocks(scene) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i), k = .72 + fbm(v.x * 1.7 + 4, v.y * 1.7 + v.z) * .6; p.setXYZ(i, v.x * k, v.y * k * .7, v.z * k); }
  g.scale(1, .62, 1); g.computeVertexNormals();
  const im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ map: tex('assets/tex/aerial_rocks_02.jpg', 1.5, 1.5), color: new THREE.Color(.72, .78, .86) }), CLS.rock), ROCKS.length), o = new THREE.Object3D();
  ROCKS.forEach(([x, z, r], i) => { o.position.set(x, r * .15, z); o.rotation.y = rnd() * 6; o.scale.setScalar(r * .95); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}

// ---------- ascii + tilt shift ----------
const GLYPHS = " .'`,:;-~=+*oOsS$%&8#@/\\|_^v\u2014";
const GI = Object.fromEntries([...GLYPHS].map((c, i) => [c, i]));
const gg = (c) => GI[c].toFixed(1);
function buildAtlas() {
  const tw = 64, th = 120, c = document.createElement('canvas');
  c.width = tw * GLYPHS.length; c.height = th;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 100px Menlo, Monaco, monospace';
  [...GLYPHS].forEach((ch, i) => { if (ch === '\u2014') x.fillRect(i * tw, th * .44, tw, th * .12); else x.fillText(ch, (i + .5) * tw, th * .52); });
  const t = new THREE.CanvasTexture(c); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.flipY = false;
  return t;
}
const asciiFrag = /* glsl */`
precision highp float;
uniform sampler2D uScene, uAtlas; uniform vec2 uGrid; uniform float uTime, uN;
in vec2 vUv; out vec4 outColor;
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float lum(vec3 c){ return dot(c,vec3(.25,.6,.15)); }
vec3 grade(vec3 c){
  c = max(c,0.); c = c/(1.+c*.12); c = pow(c,vec3(1./2.2));
  c = mix(c,c*c*(3.-2.*c),.5);
  float l = lum(c); c = mix(vec3(l),c,1.22);
  return clamp(c,0.,1.);
}
void main(){
  vec2 g = vUv*uGrid, cell = floor(g), cuv = (cell+.5)/uGrid;
  ivec2 sz = textureSize(uScene,0);
  float lodC = log2(float(sz.x)/uGrid.x)+.05;
  vec3 col = grade(textureLod(uScene,cuv,lodC).rgb);
  float cls = floor(texelFetch(uScene,ivec2(cuv*vec2(sz)),0).a*16.+.5);
  float L = lum(col);
  vec2 e = 1./uGrid;
  float lx0=lum(grade(textureLod(uScene,cuv-vec2(e.x,0),lodC).rgb)), lx1=lum(grade(textureLod(uScene,cuv+vec2(e.x,0),lodC).rgb));
  float ly0=lum(grade(textureLod(uScene,cuv-vec2(0,e.y),lodC).rgb)), ly1=lum(grade(textureLod(uScene,cuv+vec2(0,e.y),lodC).rgb));
  vec2 grad = vec2(lx1-lx0,(ly1-ly0)*.55); float mag = length(grad);
  float a4 = mod(atan(grad.y,grad.x)+.3927,3.14159)/.7854;
  float edgeG = a4<1.?${gg('|')}:a4<2.?${gg('\\')}:a4<3.?${gg('\u2014')}:${gg('/')};
  float w = vn(cell*vec2(.05,.09)+vec2(-uTime*.28,uTime*.07))*2.-1.;
  float gl = ${gg('.')};
  if(cls<1.5){        // grass
    gl = L<.1?${gg('.')}:L<.17?${gg(':')}:(w<-.2?${gg('\\')}:w>.2?${gg('/')}:${gg('|')});
  } else if(cls<2.5){ // leaves
    gl = L<.12?${gg('.')}:L<.24?${gg(':')}:L<.38?${gg('*')}:L<.5?${gg('+')}:${gg('o')};
  } else if(cls<3.5){ // flowers
    gl = L<.34?${gg(':')}:L<.55?${gg('*')}:L<.76?${gg('%')}:${gg('#')};
  } else if(cls<4.5){ // stone bollard
    gl = L<.22?${gg(':')}:L<.42?${gg('%')}:${gg('#')};
    if(mag>.16) gl = edgeG;
  } else if(cls<5.5){ // stairs
    gl = L<.12?${gg(':')}:L<.24?${gg('=')}:L<.5?${gg('\u2014')}:${gg('#')};
  } else if(cls<6.5){ // pier planks & posts
    gl = L<.14?${gg(':')}:L<.3?${gg('=')}:L<.55?${gg('|')}:${gg('#')};
    if(mag>.18) gl = edgeG;
  } else if(cls<7.5){ // wood, trunks, masts
    gl = L<.14?${gg(':')}:(mag>.1?edgeG:(L<.34?${gg('|')}:${gg('#')}));
  } else if(cls<8.5){ // sand
    gl = L<.3?${gg(':')}:L<.6?${gg(';')}:${gg('=')};
  } else if(cls<9.5){ // water
    gl = L<.22?${gg('-')}:L<.45?(w>0.?${gg('~')}:${gg('-')}):L<.72?${gg('~')}:${gg('=')};
  } else if(cls<10.5){ // foam
    gl = L<.6?${gg('*')}:L<.82?${gg('%')}:${gg('#')};
  } else if(cls<11.5){ // harbour cat
    gl = L<.4?${gg('&')}:${gg('$')};
  } else if(cls<12.5){ // boat hull
    gl = L<.2?${gg(':')}:L<.4?${gg('=')}:${gg('\u2014')};
    if(mag>.22) gl = edgeG;
  } else { // rock
    gl = L<.12?${gg('.')}:L<.26?${gg(':')}:L<.42?${gg('%')}:${gg('#')};
    if(mag>.2) gl = edgeG;
  }
  vec2 gv = g-cell, dx = dFdx(g), dy = dFdy(g);
  float ink = smoothstep(.12,.78,textureGrad(uAtlas,vec2((gl+gv.x)/uN,1.-gv.y),dx/uN,dy).r);
  vec3 blur = grade(textureLod(uScene,vUv,lodC+1.2).rgb);
  outColor = vec4(mix(blur*.2,col*1.32+.012,ink),1.);
}`;
const tiltFrag = /* glsl */`
precision highp float;
uniform sampler2D uA; uniform sampler2D uRaw; uniform vec2 uRes;
in vec2 vUv; out vec4 outColor;
void main(){
  float dy = abs(vUv.y-.42);
  float r = pow(smoothstep(.27,.6,dy),1.6)*26.;
  vec3 c = vec3(0.); float tw = 0.;
  if(r<.2){ outColor = vec4(texture(uA,vUv).rgb,1.); return; }
  float lod = max(log2(r/4.),0.);
  for(int i=0;i<36;i++){
    float t = float(i)+.5, a = t*2.39996, rr = sqrt(t/36.)*r;
    vec2 o = vec2(cos(a),sin(a))*rr/uRes;
    c += textureLod(uA,vUv+o,lod).rgb; tw += 1.;
  }
  outColor = vec4(c/tw,1.);
}`;

async function main() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, HH);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight('#ffe7c4', 3.3); sun.position.set(-30, 44, 20); sun.target.position.set(0, 4, -2);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 5, far: 130 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .03;
  scene.add(sun, sun.target, new THREE.HemisphereLight('#efe6d8', '#6d6236', 1.0));

  const barkTex = tex('assets/tex/bark_brown_02.jpg', 1, 2);
  scene.add(await buildTerrain(), buildSea());
  buildGrass(scene); buildFlowers(scene); buildTrees(scene, barkTex);
  buildPier(scene); buildBollards(scene); buildBoats(scene); buildRocks(scene);

  const fg = await new GLTFLoader().loadAsync('assets/models/Fox.glb');
  const fox = fg.scene; fox.scale.setScalar(.0125);
  fox.traverse(o => { if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = true; o.material = tag(new THREE.MeshBasicMaterial({ map: o.material.map, color: new THREE.Color(1.4, 1.15, .75) }), CLS.fox); } });
  scene.add(fox);
  const foxMix = new THREE.AnimationMixer(fox);
  foxMix.clipAction(fg.animations.find(a => /walk/i.test(a.name))).play();

  const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(.09, .09), tag(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.4, 1.35), side: THREE.DoubleSide }), CLS.flower), 150);
  scene.add(petals);
  const petalS = Array.from({ length: 150 }, () => [rnd(), rnd(), rnd(), rnd()]);

  const camera = new THREE.PerspectiveCamera(23, W / HH, 5, 400);
  const TARGET = new THREE.Vector3(-1, 4.8, 5);
  function placeCamera(t) {
    const k = .5 - .5 * Math.cos(Math.PI * t / DURATION), az = THREE.MathUtils.degToRad(-7 + 14 * k), el = THREE.MathUtils.degToRad(52 + 1.4 * Math.sin(k * 3.14)), R = 76 - 2.5 * k;
    camera.position.set(TARGET.x + Math.sin(az) * Math.cos(el) * R, TARGET.y + Math.sin(el) * R, TARGET.z + Math.cos(az) * Math.cos(el) * R);
    camera.lookAt(TARGET); camera.updateMatrixWorld();
  }

  const rt = new THREE.WebGLRenderTarget(W, HH, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const art = new THREE.WebGLRenderTarget(W, HH, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const vtx = `in vec3 position; in vec2 uv; out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }`;
  const ascii = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vtx, fragmentShader: asciiFrag, depthTest: false, depthWrite: false,
    uniforms: { uScene: { value: rt.texture }, uAtlas: { value: buildAtlas() }, uGrid: { value: new THREE.Vector2(COLS, ROWS) }, uTime: time, uN: { value: GLYPHS.length } } });
  const tilt = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vtx, fragmentShader: tiltFrag, depthTest: false, depthWrite: false,
    uniforms: { uA: { value: art.texture }, uRes: { value: new THREE.Vector2(W, HH) } } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ascii); quad.frustumCulled = false;
  const post = new THREE.Scene(); post.add(quad); const postCam = new THREE.Camera();

  const dummy = new THREE.Object3D(), SPEED = .78, FOX_U0 = .15, FOX_U1 = .85;
  function drawFrame(t, dt) {
    time.value = t; placeCamera(t);
    const span = FOX_U1 - FOX_U0, phase = ((t * SPEED / pathLen) % (2 * span));
    const u = phase < span ? FOX_U0 + phase : FOX_U1 - (phase - span);
    const p = pathCurve.getPointAt(clamp(u)), tg = pathCurve.getTangentAt(clamp(u));
    const fy = samp(fY, p.x, p.z);
    const dir = phase < span ? 1 : -1;
    fox.position.set(p.x, Math.max(fy, PIER_Y) + .1, p.z); fox.rotation.y = Math.atan2(tg.x * dir, tg.z * dir);
    foxMix.update(dt);
    petalS.forEach((s, i) => {
      const k = fract(s[0] + t * (.018 + s[3] * .012));
      const x = -16 + k * 32 + Math.sin(t * .6 + s[1] * 9) * .5, z = -22 + s[2] * 38;
      dummy.position.set(x, H(x, z) + 1.2 + s[1] * 5 + Math.sin(t * .9 + s[3] * 12) * .35, z);
      dummy.rotation.set(t + s[0] * 9, t * .7, s[1]); dummy.scale.setScalar(.8 + s[3] * .8); dummy.updateMatrix(); petals.setMatrixAt(i, dummy.matrix);
    });
    petals.instanceMatrix.needsUpdate = true;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
    quad.material = ascii; renderer.setRenderTarget(art); renderer.render(post, postCam);
    quad.material = tilt; renderer.setRenderTarget(null); renderer.render(post, postCam);
  }
  Object.assign(renderer.domElement.style, { width: 'min(100vw, 100vh)', height: 'min(100vw, 100vh)', margin: 'auto' });
  Object.assign(document.body.style, { display: 'grid', placeItems: 'center', height: '100vh' });
  let paused = false, clock = 0, last = performance.now();
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
main().catch(e => console.error(e));
