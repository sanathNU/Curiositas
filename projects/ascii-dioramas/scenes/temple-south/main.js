// South Indian temple: tiered gopuram towers along stone ghats descending to a pushkarini tank.
// Dravidian granite, coconut palms, polychrome gopuram sculpture. Portrait 9:16.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const W = 1080, HH = 1920, DURATION = 24;
const COLS = 150, ROWS = 134;
const CLS = { grass: 1, leaf: 2, flower: 3, stone: 4, stair: 5, gopuram: 6, wood: 7, sand: 8, water: 9, lotus: 10, fox: 11, diya: 12, rock: 13 };

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = x => x - Math.floor(x);
const hash2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  return (hash2(i, j) * (1 - u) + hash2(i + 1, j) * u) * (1 - v) + (hash2(i, j + 1) * (1 - u) + hash2(i + 1, j + 1) * u) * v;
}
const fbm = (x, y) => vnoise(x, y) * .5 + vnoise(x * 2.1 + 3, y * 2.1) * .28 + vnoise(x * 4.3, y * 4.3 + 5) * .15 + vnoise(x * 8.7, y * 8.7) * .07;
let seed = 42;
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

// ---------- land shape ----------
const coastZ = (x) => 8.5 + .18 * x + (fbm(x * .1 + 2, 1.3) - .5) * 7;
const ROCKS = [];
for (let i = 0; i < 40; i++) {
  const x = -30 + rnd() * 60, off = -2 + rnd() * rnd() * 10, r = .3 + rnd() * rnd() * 1.3;
  ROCKS.push([x, coastZ(x) + off, r]);
}
ROCKS.push([4, coastZ(4) + 5.5, 1.6], [-6, coastZ(-6) + 4, 1.3], [8, coastZ(8) + 6, 1.1]);
function rawH(x, z) {
  const d = coastZ(x) - z;
  let y = d < 0 ? d * .42 : 4.2 * (1 - Math.exp(-d * .42)) + d * .34;
  y += sstep(0, 5, d) * ((fbm(x * .09, z * .09) - .5) * 4.2 + (fbm(x * .4, z * .4) - .5) * .8);
  for (const [rx, rz, r] of ROCKS) { const q = ((x - rx) ** 2 + (z - rz) ** 2) / (r * r); if (q < 4) y = Math.max(y, y + Math.exp(-q * 1.4) * r * 1.2); }
  return y;
}
// wider ghat path — broader steps down to tank
const PATH = [[9, -18], [7, -13], [4.5, -9], [2, -5], [.5, -.5], [-.8, 3.5], [-2.8, 7], [-4.2, 10.5]];
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
    if (pd < 1.6) {
      c = pick(slate, x, z, 3); c = [c[0] * .7, c[1] * .68, c[2] * .72]; k = CLS.stair;
    } else if (nearSea) {
      if (y < .55 + n * .5 && d > -2.5 && n > .36) { c = pick(sand, x, z, 3.2); c = [c[0] * 1.1, c[1] * 1.0, c[2] * .82]; k = CLS.sand; }
      else { c = pick(rock, x, z, 7); c = [c[0] * .6, c[1] * .62, c[2] * .68]; k = CLS.rock; }
    } else {
      c = pick(grass, x, z, 2.6); const v = .62 + .95 * fbm(x * .16 + 5, z * .16);
      c = [c[0] * .55 * v, c[1] * 1.08 * v, c[2] * .35 * v]; k = CLS.grass;
      if (flowerField(x, z) > .58) { c = [c[0] * .65 + 55, c[1] * .6 + 25, c[2] * .4 + 5]; }
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

// ---------- temple tank (pushkarini) ----------
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
        float n = fbm(vW.xz*.32+vec2(uT*.04,uT*.03));
        float dd = max(d,0.);
        float dist = sqrt(dd);
        float ph = dist*6.+uT*.65+n*3.2;
        float saw = fract(ph/6.2832);
        float lace = smoothstep(.36,.6,fbm(vW.xz*1.25+vec2(uT*.1,-uT*.06)));
        float range = smoothstep(4.6,1.6,dist)*smoothstep(.0,.3,dist);
        float trail = smoothstep(0.,.03,saw)*(1.-smoothstep(.04,.34,saw));
        float foam = trail*range*mix(.3,1.,lace);
        float swash = .2+.14*sin(uT*.5+vW.x*.2+n*4.);
        float rim = smoothstep(swash+.3,swash,dd)*(.4+.5*lace);
        // darker, greener pushkarini water
        vec3 shallow = vec3(.22,.42,.38), mid = vec3(.04,.28,.3), deep = vec3(.01,.1,.18);
        vec3 c = mix(shallow,mid,smoothstep(.05,1.6,dist));
        c = mix(c,deep,smoothstep(1.6,4.8,dist));
        c *= .86+.25*vn(vW.xz*vec2(.9,.5)+uT*vec2(.1,.18));
        c *= 1.-.18*smoothstep(.65,1.,saw)*range;
        float caustic = pow(vn(vW.xz*2.2+uT*.2)*vn(vW.xz*1.7-uT*.15+4.),2.);
        c += vec3(.12,.22,.18)*caustic*smoothstep(3.6,.8,dist);
        float cls = 9.;
        float f = max(foam,rim);
        if(f>.3){ c = mix(c,vec3(.95,.98,.92),clamp(f*1.4,0.,1.)); cls = 10.; }
        gl_FragColor = vec4(c,cls/16.);
      }`,
  });
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0); g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  return new THREE.Mesh(g, m);
}

// ---------- wind ----------
function bladeWind(s) {
  s.uniforms.uT = time;
  s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float ph = instanceMatrix[3].x*.34+instanceMatrix[3].z*.22;
    float gust = sin(uT*.5-ph)*.5+.5;
    transformed.x += (sin(uT*1.1+ph*2.)*.2+gust*.4)*.14*position.y*position.y;`);
}
function leafWind(s) {
  s.uniforms.uT = time;
  s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float ph = instanceMatrix[3].x*.9+instanceMatrix[3].z*.7+instanceMatrix[3].y*.8;
    transformed.y += sin(uT*1.4+ph)*.03;
    transformed += vec3(1.,0.,.4)*sin(uT*.5+instanceMatrix[3].x*.2)*.05;`);
}

function buildGrass(scene) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-.045, 0, 0, .045, 0, 0, .012, .6, 0, -.045, 0, 0, .012, .6, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const N = 200000, im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), CLS.grass, bladeWind), N);
  const o = new THREE.Object3D(), c = new THREE.Color();
  let i = 0, guard = 0;
  while (i < N && guard++ < 6e6) {
    const x = -24 + rnd() * 48, z = -34 + rnd() * 58, y = H(x, z);
    if (y < 1.4 + fbm(x * .3, z * .3) * 1.4 || pathD(x, z) < 1.6 || coastZ(x) - z < 2) continue;
    o.position.set(x, y - .02, z); o.rotation.y = rnd() * 6.28;
    const s = .3 + rnd() * .28; o.scale.set(1.5, s, 1.5); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    const v = .5 + rnd() * .7, tone = fbm(x * .16 + 5, z * .16);
    const dk = .5 + 1.1 * tone; c.setRGB((.08 * v + tone * .06) * dk, .38 * v * dk, .035 * v * dk); im.setColorAt(i++, c);
  }
  im.count = i; im.receiveShadow = true; scene.add(im);
}
function buildFlowers(scene) {
  const g = new THREE.PlaneGeometry(.14, .14); g.rotateX(-Math.PI / 2 + .25);
  const N = 70000, im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), CLS.flower, bladeWind), N);
  const o = new THREE.Object3D(), c = new THREE.Color();
  let i = 0, guard = 0;
  while (i < N && guard++ < 6e6) {
    const x = -24 + rnd() * 48, z = -30 + rnd() * 52, y = H(x, z);
    const ff = flowerField(x, z);
    if (ff < .56 + rnd() * .05 || y < 1.8 || pathD(x, z) < 2.2 || coastZ(x) - z < 2.5) continue;
    if (fbm(x * .9, z * .9) < .47) continue;
    o.position.set(x, y + .18 + rnd() * .14, z); o.rotation.y = rnd() * 6.28; o.scale.setScalar(.7 + rnd() * .85); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    // kumkum red and turmeric yellow mix
    const r = rnd();
    if (r < .45) c.setRGB(.92 + rnd() * .08, .15 + rnd() * .15, .05 + rnd() * .08); // kumkum red
    else if (r < .8) c.setRGB(.95 + rnd() * .05, .72 + rnd() * .18, .05 + rnd() * .1); // turmeric yellow
    else c.setRGB(.98, .92, .85); // jasmine white
    im.setColorAt(i++, c);
  }
  im.count = i; im.receiveShadow = true; scene.add(im);
}

// ---------- coconut palms + canopy trees ----------
function buildTrees(scene, barkTex) {
  const spots = [];
  const push = (x, z, s, kind) => spots.push({ x, z, s, kind });
  let guard = 0;
  // coconut palms closer to water, canopy trees inland
  while (spots.length < 80 && guard++ < 9000) {
    const x = -24 + rnd() * 48, z = -28 + rnd() * 26;
    if (pathD(x, z) < (z > -9 ? 6.5 : 3.8) || spots.some(s => (s.x - x) ** 2 + (s.z - z) ** 2 < 7)) continue;
    if (x > 2 && x < 13 && z > -24 && z < -14) continue;
    const nearWater = coastZ(x) - z < 8;
    push(x, z, .8 + rnd() * .5, nearWater && rnd() < .4 ? 'palm' : rnd() < .2 ? 'gold' : 'green');
  }
  for (const [x, z, s, k] of [[-12, -8, 1.05, 'green'], [-10.5, -2, .85, 'palm'], [12, -8, 1.1, 'green'], [13, -2, .95, 'palm'], [-13, 4, .95, 'green'], [12, 3, .8, 'palm'], [-9, -13, 1.0, 'green'], [-12, -6, 1.1, 'green'], [10, -7, .95, 'green'], [11, -12, 1.05, 'gold']]) push(x, z, s, k);
  const leaves = [], pal = {
    gold: [[.2, .42, .1], [.26, .48, .13], [.15, .33, .08], [.32, .52, .15]],
    green: [[.1, .36, .07], [.18, .42, .1], [.07, .26, .05], [.26, .48, .12]],
    palm: [[.15, .45, .1], [.2, .52, .14], [.1, .35, .08], [.25, .5, .12]],
  };
  const trunks = [];
  for (const t of spots) {
    const y0 = H(t.x, t.z);
    if (t.kind === 'palm') {
      // tall curved trunk
      const H0 = 7.5 * t.s;
      const segs = 12, pts = [];
      const lean = (rnd() - .5) * 2.5, leanZ = (rnd() - .5) * 1.5;
      for (let i = 0; i <= segs; i++) {
        const frac = i / segs;
        pts.push(new THREE.Vector3(t.x + lean * frac * frac, y0 + frac * H0, t.z + leanZ * frac * frac));
      }
      for (let i = 0; i < segs; i++) {
        const r0 = (.15 - .08 * (i / segs)) * t.s, r1 = (.15 - .08 * ((i + 1) / segs)) * t.s;
        const len = pts[i + 1].distanceTo(pts[i]);
        if (len < .01) continue;
        const seg = new THREE.CylinderGeometry(r1, r0, len, 6);
        const mid = pts[i].clone().lerp(pts[i + 1], .5);
        const dir = pts[i + 1].clone().sub(pts[i]).divideScalar(len);
        if (Math.abs(dir.x) + Math.abs(dir.z) < .001) {
          seg.translate(mid.x, mid.y, mid.z);
        } else {
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          seg.applyQuaternion(q); seg.translate(mid.x, mid.y, mid.z);
        }
        trunks.push(seg);
      }
      // palm fronds — long drooping leaf cards
      const top = pts[segs];
      const fronds = 9;
      for (let f = 0; f < fronds; f++) {
        const a = f / fronds * 6.28 + rnd() * .3;
        const frondLen = (2.8 + rnd() * 1.5) * t.s;
        const droop = .6 + rnd() * .4;
        const nLeaves = 28;
        for (let l = 0; l < nLeaves; l++) {
          const frac = l / nLeaves;
          const fx = top.x + Math.cos(a) * frac * frondLen + (rnd() - .5) * .15;
          const fz = top.z + Math.sin(a) * frac * frondLen + (rnd() - .5) * .15;
          const fy = top.y + .3 - frac * frac * droop * frondLen * .5;
          const p = pal.palm[(rnd() * pal.palm.length) | 0];
          const lit = .7 + .5 * (1 - frac);
          leaves.push(fx, fy, fz, p[0] * lit, p[1] * lit, p[2] * lit);
        }
      }
    } else {
      // standard canopy tree
      const H0 = 5.3 * t.s;
      const tg = new THREE.CylinderGeometry(.09 * t.s, .22 * t.s, H0, 7); tg.translate(t.x, y0 + H0 / 2, t.z);
      trunks.push(tg);
      for (let b = 0; b < 3; b++) { const a = rnd() * 6.28; const bg = new THREE.CylinderGeometry(.03 * t.s, .08 * t.s, 2.2 * t.s, 5); bg.rotateZ(.8); bg.rotateY(a); bg.translate(t.x + Math.cos(a) * .6 * t.s, y0 + H0 * .72, t.z - Math.sin(a) * .6 * t.s); trunks.push(bg); }
      const lobes = 11;
      for (let l = 0; l < lobes; l++) {
        const a = rnd() * 6.28, r = rnd() ** .6 * 2.5 * t.s, lx = t.x + Math.cos(a) * r, lz = t.z + Math.sin(a) * r, ly = y0 + H0 * .8 + (rnd() - .35) * 1.8 * t.s + (1 - r / (2.6 * t.s)) * 1.3 * t.s;
        const lr = (.75 + rnd() * .55) * t.s, n = 140;
        for (let i = 0; i < n; i++) {
          const u = rnd() * 2 - 1, th = rnd() * 6.28, q = Math.sqrt(1 - u * u), rr = lr * Math.cbrt(rnd());
          const p = pal[t.kind][(rnd() * pal[t.kind].length) | 0], lit = .72 + .6 * clamp(u * .5 + .5);
          leaves.push(lx + q * Math.cos(th) * rr, ly + u * rr * .75, lz + q * Math.sin(th) * rr, p[0] * lit, p[1] * lit, p[2] * lit);
        }
      }
    }
  }
  const barkMat = tag(new THREE.MeshLambertMaterial({ map: barkTex, color: '#d8d0c4' }), CLS.wood);
  if (trunks.length) { const trunk = new THREE.Mesh(mergeGeometries(trunks), barkMat); trunk.castShadow = true; scene.add(trunk); }
  const g = new THREE.PlaneGeometry(.3, .24);
  const count = leaves.length / 6, im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), CLS.leaf, leafWind), count);
  const o = new THREE.Object3D(), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    o.position.set(leaves[i * 6], leaves[i * 6 + 1], leaves[i * 6 + 2]); o.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    c.setRGB(leaves[i * 6 + 3], leaves[i * 6 + 4], leaves[i * 6 + 5]); im.setColorAt(i, c);
  }
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}

// ---------- gopuram towers (Dravidian tiered gateway) ----------
function colored(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}
function gopuramGeo(w = 2.4, totalH = 5.5) {
  const parts = [];
  const granite = '#8a8078', cream = '#e8dcc8';
  const tierColors = ['#d04030', '#e8a020', '#3080d0', '#d04030', '#e8a020'];
  // base wall with doorway
  const baseH = totalH * .22;
  for (const s of [-1, 1]) {
    const wall = new THREE.BoxGeometry(w * .35, baseH, w * .3); wall.translate(s * w * .32, baseH / 2, 0); parts.push(colored(wall, granite));
  }
  const lintel = new THREE.BoxGeometry(w * .95, baseH * .18, w * .32); lintel.translate(0, baseH, 0); parts.push(colored(lintel, granite));
  // tiered pyramid
  const tiers = 5;
  let yOff = baseH + baseH * .08;
  for (let t = 0; t < tiers; t++) {
    const frac = 1 - t / tiers;
    const tw = w * .9 * frac, th = (totalH - baseH) / tiers * .82, td = w * .28 * frac;
    const tier = new THREE.BoxGeometry(tw, th, td); tier.translate(0, yOff + th / 2, 0);
    parts.push(colored(tier, tierColors[t % tierColors.length]));
    // decorative bumps on each tier
    const bumps = Math.max(2, Math.floor(tw / .35));
    for (let b = 0; b < bumps; b++) {
      const bx = -tw / 2 + (b + .5) / bumps * tw;
      const bump = new THREE.SphereGeometry(.06 * frac, 4, 3); bump.translate(bx, yOff + th * .7, td / 2 + .03);
      parts.push(colored(bump, cream));
    }
    yOff += th + .04;
  }
  // barrel vault (vimana top)
  const capW = w * .25, capH = totalH * .12;
  const cap = new THREE.CylinderGeometry(capW * .4, capW * .6, capH, 8); cap.translate(0, yOff + capH / 2, 0);
  parts.push(colored(cap, '#d04030'));
  // kalasha finial
  const kal = new THREE.SphereGeometry(.1, 6, 5); kal.translate(0, yOff + capH + .1); parts.push(colored(kal, '#ffcc30'));
  const spike = new THREE.ConeGeometry(.04, .25, 4); spike.translate(0, yOff + capH + .3); parts.push(colored(spike, '#ffcc30'));
  const m = mergeGeometries(parts.map(g => { g.deleteAttribute('uv'); return g; })); m.computeVertexNormals();
  return m;
}
function buildGopurams(scene) {
  // main gopuram at top of path, smaller ones along it
  const mat = tag(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#2a1505', emissiveIntensity: .3 }), CLS.gopuram);
  const positions = [];
  // large gopuram near path start (top of scene)
  const u0 = .08, p0 = pathCurve.getPointAt(u0), t0 = pathCurve.getTangentAt(u0);
  positions.push({ u: u0, px: p0.x, pz: p0.z, tx: t0.x, tz: t0.z, scale: 1.5 });
  // medium gopurams along path
  for (let i = 1; i < 5; i++) {
    const u = .08 + i * .18;
    if (u > .92) break;
    const p = pathCurve.getPointAt(u), t = pathCurve.getTangentAt(u);
    positions.push({ u, px: p.x, pz: p.z, tx: t.x, tz: t.z, scale: .85 + rnd() * .3 });
  }
  const im = new THREE.InstancedMesh(gopuramGeo(), mat, positions.length);
  const o = new THREE.Object3D();
  positions.forEach((g, i) => {
    o.position.set(g.px, samp(fY, g.px, g.pz) - .04, g.pz);
    o.rotation.set(0, Math.atan2(g.tx, g.tz), 0);
    o.scale.setScalar(g.scale); o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}
function buildGhatSteps(scene) {
  const steps = Math.floor(pathLen / .4);
  const sim = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.2, .18, .45),
    tag(new THREE.MeshLambertMaterial({ map: tex('assets/tex/castle_wall_slates.jpg', .4, .2), color: '#a09888' }), CLS.stair),
    steps
  );
  const o = new THREE.Object3D();
  for (let i = 0; i < steps; i++) {
    const u = (i + .5) / steps, p = pathCurve.getPointAt(u), t = pathCurve.getTangentAt(u);
    o.position.set(p.x, samp(fY, p.x, p.z), p.z); o.rotation.set(0, Math.atan2(t.x, t.z), 0); o.scale.set(1, 1, 1); o.updateMatrix(); sim.setMatrixAt(i, o.matrix);
  }
  sim.receiveShadow = true; sim.castShadow = true; scene.add(sim);
}
// stone pillared corridors (prakarams) flanking path
function buildPrakarams(scene) {
  const pillarG = new THREE.CylinderGeometry(.08, .11, 1.8, 8);
  const beamG = new THREE.BoxGeometry(.22, .12, 1.2);
  const mat = tag(new THREE.MeshLambertMaterial({ map: tex('assets/tex/castle_wall_slates.jpg', .3, .5), color: '#b0a898' }), CLS.stone);
  const pillars = [], beams = [];
  for (let i = 0; i < 22; i++) {
    const u = .12 + i * .035;
    if (u > .82) break;
    const p = pathCurve.getPointAt(u), t = pathCurve.getTangentAt(u);
    for (const s of [-1, 1]) {
      const x = p.x - t.z * s * 2.8, z = p.z + t.x * s * 2.8, y = H(x, z);
      if (y < 1.2) continue;
      const pg = pillarG.clone(); pg.translate(x, y + .9, z); pillars.push(pg);
      const bg = beamG.clone();
      bg.rotateY(Math.atan2(t.x, t.z));
      bg.translate(x, y + 1.86, z); beams.push(bg);
    }
  }
  if (pillars.length) {
    const mesh = new THREE.Mesh(mergeGeometries([...pillars, ...beams]), mat);
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  }
}
function buildDiyas(scene) {
  const parts = [];
  const add = (g, y) => { g.translate(0, y, 0); g.deleteAttribute('uv'); parts.push(g.index ? g.toNonIndexed() : g); };
  add(new THREE.CylinderGeometry(.16, .1, .14, 8), .07);
  add(new THREE.ConeGeometry(.05, .2, 5), .24);
  const g = mergeGeometries(parts); g.computeVertexNormals();
  const n = 22, im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ color: '#d89030', emissive: '#ff7a08', emissiveIntensity: .7 }), CLS.diya), n), o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const u = .05 + i / n * .9, p = pathCurve.getPointAt(u), t = pathCurve.getTangentAt(u), s = i % 2 ? 1 : -1;
    const x = p.x - t.z * s * 1.9, z = p.z + t.x * s * 1.9;
    o.position.set(x, H(x, z) + .02, z); o.rotation.y = rnd(); o.scale.setScalar(1.3); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
  }
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}
// nandi (bull) statue at path midpoint
function buildNandi(scene) {
  const g = new THREE.Group();
  // simplified seated bull from primitives
  const bodyMat = tag(new THREE.MeshLambertMaterial({ color: '#2a2a2a' }), CLS.rock);
  // body
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.35, .8, 6, 10), bodyMat);
  body.rotation.z = Math.PI / 2; body.position.y = .5; g.add(body);
  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(.22, 6, 5), bodyMat);
  head.position.set(.55, .72, 0); head.scale.set(1, .85, .9); g.add(head);
  // snout
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(.08, .12, .2, 6), bodyMat);
  snout.rotation.z = Math.PI / 2; snout.position.set(.72, .65, 0); g.add(snout);
  // horns
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(.04, .3, 5), tag(new THREE.MeshLambertMaterial({ color: '#888070' }), CLS.stone));
    horn.position.set(.48, .9, s * .15); horn.rotation.z = s * .4; horn.rotation.x = s * .2; g.add(horn);
  }
  // legs
  for (const [lx, lz] of [[-.25, .18], [-.25, -.18], [.2, .18], [.2, -.18]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .35, 5), bodyMat);
    leg.position.set(lx, .17, lz); g.add(leg);
  }
  // hump
  const hump = new THREE.Mesh(new THREE.SphereGeometry(.18, 5, 4), bodyMat);
  hump.position.set(.1, .88, 0); hump.scale.y = .7; g.add(hump);
  // pedestal
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.2, .15, .8), tag(new THREE.MeshLambertMaterial({ color: '#a09080' }), CLS.stone));
  pedestal.position.y = -.02; g.add(pedestal);

  const u = .45, p = pathCurve.getPointAt(u), t = pathCurve.getTangentAt(u);
  g.position.set(p.x + t.z * 3.2, samp(fY, p.x, p.z) + .08, p.z - t.x * 3.2);
  g.rotation.y = Math.atan2(t.x, t.z) + Math.PI / 2;
  g.scale.setScalar(1.3);
  g.traverse(o => { o.castShadow = true; o.receiveShadow = true; }); scene.add(g);
}
function buildLotus(scene) {
  const g = new THREE.PlaneGeometry(.22, .22); g.rotateX(-Math.PI / 2);
  const N = 500, im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ color: '#f0a0b0', side: THREE.DoubleSide }), CLS.lotus, leafWind), N);
  const o = new THREE.Object3D(), c = new THREE.Color();
  let i = 0, guard = 0;
  while (i < N && guard++ < 50000) {
    const x = -18 + rnd() * 36, z = coastZ(x) + 1 + rnd() * 14;
    if (pathD(x, z) < 3) continue;
    o.position.set(x, .08 + rnd() * .04, z); o.rotation.y = rnd() * 6.28; o.scale.setScalar(.5 + rnd() * .7); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    const r = rnd(); c.setRGB(r < .35 ? .9 : .96, r < .35 ? .5 : .88, r < .35 ? .6 : .85); im.setColorAt(i++, c);
  }
  im.count = i; scene.add(im);
}
function buildRocks(scene) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i), k = .72 + fbm(v.x * 1.7 + 4, v.y * 1.7 + v.z) * .6; p.setXYZ(i, v.x * k, v.y * k * .7, v.z * k); }
  g.scale(1, .62, 1); g.computeVertexNormals();
  const im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ map: tex('assets/tex/aerial_rocks_02.jpg', 1.5, 1.5), color: new THREE.Color(.65, .68, .74) }), CLS.rock), ROCKS.length), o = new THREE.Object3D();
  ROCKS.forEach(([x, z, r], i) => { o.position.set(x, r * .15, z); o.rotation.y = rnd() * 6; o.scale.setScalar(r * .9); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
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
  float w = vn(cell*vec2(.05,.09)+vec2(-uTime*.15,uTime*.04))*2.-1.;
  float gl = ${gg('.')};
  if(cls<1.5){        // grass
    gl = L<.1?${gg('.')}:L<.17?${gg(':')}:(w<-.2?${gg('\\')}:w>.2?${gg('/')}:${gg('|')});
  } else if(cls<2.5){ // leaves
    gl = L<.12?${gg('.')}:L<.24?${gg(':')}:L<.38?${gg('*')}:L<.5?${gg('+')}:${gg('o')};
  } else if(cls<3.5){ // flowers
    gl = L<.34?${gg(':')}:L<.55?${gg('*')}:L<.76?${gg('%')}:${gg('#')};
  } else if(cls<4.5){ // stone
    gl = L<.22?${gg(':')}:L<.42?${gg('%')}:${gg('#')};
    if(mag>.16) gl = edgeG;
  } else if(cls<5.5){ // ghat stairs
    gl = L<.12?${gg(':')}:L<.24?${gg('=')}:L<.5?${gg('\u2014')}:${gg('#')};
  } else if(cls<6.5){ // gopuram
    gl = L<.08?${gg(':')}:L<.18?${gg('=')}:${gg('#')};
    if(mag>.18 && L>.06) gl = edgeG;
  } else if(cls<7.5){ // wood/trunks
    gl = L<.14?${gg(':')}:(mag>.1?edgeG:(L<.34?${gg('|')}:${gg('#')}));
  } else if(cls<8.5){ // sand
    gl = L<.3?${gg(':')}:L<.6?${gg(';')}:${gg('=')};
  } else if(cls<9.5){ // pushkarini water
    gl = L<.22?${gg('-')}:L<.45?(w>0.?${gg('~')}:${gg('-')}):L<.72?${gg('~')}:${gg('=')};
  } else if(cls<10.5){ // lotus/foam
    gl = L<.5?${gg('*')}:L<.75?${gg('o')}:${gg('%')};
  } else if(cls<11.5){ // creature
    gl = L<.4?${gg('&')}:${gg('$')};
  } else if(cls<12.5){ // diya
    gl = L<.35?${gg(':')}:L<.6?${gg('*')}:${gg('#')};
    if(mag>.2) gl = edgeG;
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
uniform sampler2D uA; uniform vec2 uRes;
in vec2 vUv; out vec4 outColor;
void main(){
  float dy = abs(vUv.y-.44);
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
  // warmer, slightly lower sun for South Indian golden hour feel
  const sun = new THREE.DirectionalLight('#ffd8a0', 3.2); sun.position.set(-28, 40, 18); sun.target.position.set(0, 4, -2);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 5, far: 130 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .03;
  scene.add(sun, sun.target, new THREE.HemisphereLight('#e8d8b8', '#5a5830', 1.2));

  const barkTex = tex('assets/tex/bark_brown_02.jpg', 1, 2);
  scene.add(await buildTerrain(), buildSea());
  buildGrass(scene); buildFlowers(scene); buildTrees(scene, barkTex);
  buildGopurams(scene); buildGhatSteps(scene); buildPrakarams(scene); buildDiyas(scene); buildNandi(scene); buildLotus(scene); buildRocks(scene);

  // chital deer (spotted deer) from primitives
  const deerMat = tag(new THREE.MeshBasicMaterial({ color: '#c4854a' }), CLS.fox);
  const deerWhite = tag(new THREE.MeshBasicMaterial({ color: '#e8dcc8' }), CLS.fox);
  const deerDk = tag(new THREE.MeshBasicMaterial({ color: '#4a3020' }), CLS.fox);
  const deer = new THREE.Group();
  // body
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.18, .55, 6, 10), deerMat);
  body.rotation.z = Math.PI / 2; body.position.set(0, .55, 0); deer.add(body);
  // spots (white dots on body)
  for (let i = 0; i < 14; i++) {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(.035, 4, 3), deerWhite);
    const a = rnd() * 6.28, r = .12 + rnd() * .06;
    spot.position.set((rnd() - .5) * .5, .55 + Math.sin(a) * r, Math.cos(a) * r);
    deer.add(spot);
  }
  // belly (lighter underside)
  const belly = new THREE.Mesh(new THREE.CapsuleGeometry(.14, .4, 5, 8), deerWhite);
  belly.rotation.z = Math.PI / 2; belly.position.set(0, .48, 0); deer.add(belly);
  // neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, .35, 6), deerMat);
  neck.position.set(.32, .78, 0); neck.rotation.z = -.5; deer.add(neck);
  // head group (will animate)
  const headGroup = new THREE.Group(); headGroup.position.set(.42, .9, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.1, 6, 5), deerMat);
  head.scale.set(1.1, .9, .9); headGroup.add(head);
  // snout
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(.04, .06, .12, 5), deerMat);
  snout.rotation.z = Math.PI / 2; snout.position.set(.1, -.02, 0); headGroup.add(snout);
  // nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.025, 4, 3), deerDk);
  nose.position.set(.16, -.03, 0); headGroup.add(nose);
  // ears
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.04, .12, 4), deerMat);
    ear.position.set(-.02, .1, s * .08); ear.rotation.z = s * .3; ear.rotation.x = s * .15;
    headGroup.add(ear);
  }
  // antlers (small, Y-branched)
  for (const s of [-1, 1]) {
    const main = new THREE.Mesh(new THREE.CylinderGeometry(.012, .018, .22, 4), deerDk);
    main.position.set(-.02, .15, s * .06); main.rotation.z = s * .2; main.rotation.x = -.15;
    headGroup.add(main);
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(.008, .012, .1, 3), deerDk);
    branch.position.set(-.04, .24, s * .08); branch.rotation.z = s * .6;
    headGroup.add(branch);
  }
  deer.add(headGroup);
  // legs
  const legPositions = [[-.2, 0, .1], [-.2, 0, -.1], [.2, 0, .1], [.2, 0, -.1]];
  const legs = [];
  for (const [lx, , lz] of legPositions) {
    const legGroup = new THREE.Group(); legGroup.position.set(lx, .42, lz);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, .25, 5), deerMat);
    upper.position.y = -.12; legGroup.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(.018, .025, .2, 5), deerMat);
    lower.position.y = -.32; legGroup.add(lower);
    const hoof = new THREE.Mesh(new THREE.SphereGeometry(.022, 4, 3), deerDk);
    hoof.position.y = -.42; hoof.scale.y = .6; legGroup.add(hoof);
    deer.add(legGroup); legs.push(legGroup);
  }
  // tail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(.03, .15, 4), deerWhite);
  tail.position.set(-.35, .6, 0); tail.rotation.z = 1.2; deer.add(tail);
  deer.scale.setScalar(3.0);
  deer.traverse(o => { o.castShadow = true; o.frustumCulled = false; });
  scene.add(deer);
  // deer animation state
  const deerAnim = { headBob: 0, legPhase: 0 };

  // drifting flower petals — kumkum red
  const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(.09, .09), tag(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, .3, .15), side: THREE.DoubleSide }), CLS.flower), 120);
  scene.add(petals);
  const petalS = Array.from({ length: 120 }, () => [rnd(), rnd(), rnd(), rnd()]);

  const camera = new THREE.PerspectiveCamera(23, W / HH, 5, 400);
  const TARGET = new THREE.Vector3(0, 5.2, 2);
  function placeCamera(t) {
    const k = .5 - .5 * Math.cos(Math.PI * t / DURATION), az = THREE.MathUtils.degToRad(-7 + 14 * k), el = THREE.MathUtils.degToRad(54 + 1.2 * Math.sin(k * 3.14)), R = 74 - 2.5 * k;
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

  const dummy = new THREE.Object3D(), SPEED = .55, DEER_U0 = .18, DEER_U1 = .82;
  function drawFrame(t, dt) {
    time.value = t; placeCamera(t);
    const span = DEER_U1 - DEER_U0, phase = ((t * SPEED / pathLen) % (2 * span));
    const u = phase < span ? DEER_U0 + phase : DEER_U1 - (phase - span);
    const p = pathCurve.getPointAt(clamp(u)), tg = pathCurve.getTangentAt(clamp(u));
    const dir = phase < span ? 1 : -1;
    deer.position.set(p.x, samp(fY, p.x, p.z) + .02, p.z);
    deer.rotation.y = Math.atan2(tg.x * dir, tg.z * dir);
    // leg walk cycle
    const walkSpeed = 6.5;
    for (let i = 0; i < 4; i++) {
      const offset = i < 2 ? 0 : Math.PI;
      const side = i % 2 === 0 ? 0 : Math.PI * .5;
      legs[i].rotation.x = Math.sin(t * walkSpeed + offset + side) * .25;
    }
    // head bob — occasional dip to graze
    const graze = Math.sin(t * .8) * .5 + .5;
    const dip = graze > .85 ? (graze - .85) / .15 * .4 : 0;
    headGroup.rotation.z = -.1 + dip;
    headGroup.position.y = .9 - dip * .15;
    // tail flick
    tail.rotation.x = Math.sin(t * 3.2) * .15;
    petalS.forEach((s, i) => {
      const k = fract(s[0] + t * (.015 + s[3] * .01));
      const x = -14 + k * 28 + Math.sin(t * .5 + s[1] * 9) * .4, z = -20 + s[2] * 34;
      dummy.position.set(x, H(x, z) + 1.0 + s[1] * 4.5 + Math.sin(t * .8 + s[3] * 11) * .3, z);
      dummy.rotation.set(t + s[0] * 9, t * .6, s[1]); dummy.scale.setScalar(.7 + s[3] * .7); dummy.updateMatrix(); petals.setMatrixAt(i, dummy.matrix);
    });
    petals.instanceMatrix.needsUpdate = true;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
    quad.material = ascii; renderer.setRenderTarget(art); renderer.render(post, postCam);
    quad.material = tilt; renderer.setRenderTarget(null); renderer.render(post, postCam);
  }
  const aspect = W / HH;
  Object.assign(renderer.domElement.style, { width: `min(100vw, ${100 * aspect}vh)`, height: `min(${100 / aspect}vw, 100vh)`, margin: 'auto' });
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
