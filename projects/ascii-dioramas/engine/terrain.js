// Land: height field + trail baked into lookup grids, the painted terrain mesh, and the
// y = 0 plane that becomes sea or cloud wherever the land dips below it.
import * as THREE from 'three';
import { clamp, sstep, fract, GLSL_NOISE, glf, glv3 } from './noise.js';
import { time } from './materials.js';

export const BOUNDS = { X0: -45, X1: 45, Z0: -52, Z1: 42, FW: 600, FH: 626 };

/**
 * Bake a scene's height function and trail into grids.
 * The trail is a Catmull-Rom curve through `path` ([x, z] points, far end first). Its height is
 * sampled 501 times and box-smoothed so it doesn't follow every bump; land within 1.4–3 units of
 * the trail blends down to that height, cutting the trail into the slope.
 */
export function buildLand({ rawH, path, pathFloor = -Infinity, bounds = BOUNDS }) {
  const { X0, X1, Z0, Z1, FW, FH } = bounds;
  const curve = new THREE.CatmullRomCurve3(path.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', .5);
  const length = curve.getLength();
  const pathS = [];
  for (let i = 0; i <= 500; i++) { const p = curve.getPointAt(i / 500); pathS.push({ x: p.x, z: p.z, y: rawH(p.x, p.z) }); }
  for (let pass = 0; pass < 7; pass++) {
    const c = pathS.map(s => s.y);
    for (let i = 0; i < c.length; i++) { let a = 0, n = 0; for (let k = -9; k <= 9; k++) { const v = c[i + k]; if (v !== undefined) { a += v; n++; } } pathS[i].y = a / n; }
  }
  pathS.forEach(s => { s.y = Math.max(s.y, pathFloor); });

  const fD = new Float32Array(FW * FH), fY = new Float32Array(FW * FH), fH = new Float32Array(FW * FH);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const x = X0 + (X1 - X0) * i / (FW - 1), z = Z0 + (Z1 - Z0) * j / (FH - 1);
    let best = 1e9, by = 0;
    for (let k = 0; k < pathS.length; k += 3) { const s = pathS[k], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < best) { best = d; by = s.y; } }
    const D = Math.sqrt(best), k = sstep(3, 1.4, D);
    fD[j * FW + i] = D; fY[j * FW + i] = by;
    fH[j * FW + i] = rawH(x, z) * (1 - k) + (by - .03) * k;
  }
  const samp = (f, x, z) => {
    const u = clamp((x - X0) / (X1 - X0)) * (FW - 1), v = clamp((z - Z0) / (Z1 - Z0)) * (FH - 1);
    const i = Math.min(FW - 2, u | 0), j = Math.min(FH - 2, v | 0), a = u - i, b = v - j;
    return (f[j * FW + i] * (1 - a) + f[j * FW + i + 1] * a) * (1 - b) + (f[(j + 1) * FW + i] * (1 - a) + f[(j + 1) * FW + i + 1] * a) * b;
  };
  return {
    curve, length, pathS, bounds, fH,
    /** Ground height including the trail cut. */
    H: (x, z) => samp(fH, x, z),
    /** Distance to the trail centreline. */
    pathD: (x, z) => samp(fD, x, z),
    /** Height of the nearest trail point (for props and creatures on the trail). */
    pathY: (x, z) => samp(fY, x, z),
    /** Point, tangent, left normal and yaw at curve parameter u. */
    frame(u) {
      const p = curve.getPointAt(clamp(u)), t = curve.getTangentAt(clamp(u));
      return { p, t, nx: -t.z, nz: t.x, yaw: Math.atan2(t.x, t.z) };
    },
  };
}

const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
function pixels(img, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  return { d: x.getImageData(0, 0, w, h).data, w, h };
}
/** Sample a texture's pixels as a tile repeating every m world units. */
const pick = (t, x, z, m) => { const o = (((fract(z / m) * t.h) | 0) * t.w + ((fract(x / m) * t.w) | 0)) * 4; return [t.d[o], t.d[o + 1], t.d[o + 2]]; };

/**
 * Terrain mesh with a baked colour texture and a nearest-filtered class texture.
 * `paint(x, z, y, pathD, T, pick)` returns [r, g, b, cls] for each texel; T holds the named
 * textures' pixels (assets/tex/<name>.jpg, read into JS at 512²).
 */
export async function terrainMesh(land, { textures, paint, size = [2048, 2140] }) {
  const { X0, X1, Z0, Z1 } = land.bounds;
  const T = {};
  await Promise.all(textures.map(async n => { T[n] = pixels(await loadImg(`assets/tex/${n}.jpg`), 512, 512); }));
  const [TW, TH] = size, col = new Uint8Array(TW * TH * 4), cls = new Uint8Array(TW * TH * 4);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const x = X0 + (X1 - X0) * i / (TW - 1), z = Z0 + (Z1 - Z0) * j / (TH - 1);
    const [r, g, b, k] = paint(x, z, land.H(x, z), land.pathD(x, z), T, pick);
    const o = (j * TW + i) * 4;
    col[o] = Math.min(255, r); col[o + 1] = Math.min(255, g); col[o + 2] = Math.min(255, b); col[o + 3] = 255; cls[o] = k * 16;
  }
  const colTex = new THREE.DataTexture(col, TW, TH, THREE.RGBAFormat);
  colTex.colorSpace = THREE.SRGBColorSpace; colTex.magFilter = THREE.LinearFilter; colTex.minFilter = THREE.LinearMipmapLinearFilter; colTex.generateMipmaps = true; colTex.anisotropy = 8; colTex.needsUpdate = true;
  const clsTex = new THREE.DataTexture(cls, TW, TH, THREE.RGBAFormat); clsTex.magFilter = clsTex.minFilter = THREE.NearestFilter; clsTex.needsUpdate = true;
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, 480, 500); g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, land.H(x, z)); uv.setXY(i, (x - X0) / (X1 - X0), (z - Z0) / (Z1 - Z0)); }
  g.computeVertexNormals();
  const m = new THREE.MeshLambertMaterial({ map: colTex });
  m.onBeforeCompile = (s) => {
    s.uniforms.clsTex = { value: clsTex };
    s.fragmentShader = 'uniform sampler2D clsTex;\n' + s.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n gl_FragColor.a = texture2D(clsTex, vMapUv).r;`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

/**
 * The y = 0 plane. Its shader gets `d` (depth of the land below the plane; negative where land
 * sticks out, which is discarded) and `vW` (world position), and must set `vec3 c` and `float cls`.
 */
export function waterPlane(land, body) {
  const { X0, X1, Z0, Z1, FW, FH } = land.bounds;
  const depth = new Float32Array(FW * FH * 4);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) depth[(j * FW + i) * 4] = -land.fH[j * FW + i];
  const dt = new THREE.DataTexture(depth, FW, FH, THREE.RGBAFormat, THREE.FloatType);
  dt.magFilter = dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
  const m = new THREE.ShaderMaterial({
    uniforms: { uD: { value: dt }, uT: time, uB: { value: new THREE.Vector4(X0, Z0, X1 - X0, Z1 - Z0) } },
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vW,1.); }`,
    fragmentShader: `uniform sampler2D uD; uniform float uT; uniform vec4 uB; varying vec3 vW;
${GLSL_NOISE}
void main(){
  vec2 uv = (vW.xz-uB.xy)/uB.zw;
  float d = texture2D(uD,uv).r;
  if(d<-.05) discard;
  vec3 c; float cls = 9.;
  ${body}
  gl_FragColor = vec4(c,cls/16.);
}`,
  });
  const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0); g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  return new THREE.Mesh(g, m);
}

/**
 * Shoreline sea: depth-graded colour, foam bands that roll in (a sawtooth in √depth + time),
 * a swash rim at the waterline, caustics and sparkle. Foam pixels become class 10.
 * `speed` scales every time rate together.
 */
export function seaGLSL({ shallow, mid, deep, foam = [1.05, 1.08, 1.02], speed = 1, band = 7.2, swash = [.22, .16], caustic = [.15, .28, .25], sparkle = [.3, .35, .3] }) {
  const k = (x) => glf(x * speed);
  return `
  float n = fbm(vW.xz*.32+vec2(uT*${k(.06)},uT*${k(.04)}));
  float dd = max(d,0.), dist = sqrt(dd);
  float saw = fract((dist*${glf(band)}+uT*${k(.85)}+n*3.6)/6.2832);
  float lace = smoothstep(.36,.6,fbm(vW.xz*1.25+vec2(uT*${k(.15)},-uT*${k(.08)})));
  float range = smoothstep(4.6,1.6,dist)*smoothstep(.0,.3,dist);
  float trail = smoothstep(0.,.03,saw)*(1.-smoothstep(.04,.34,saw));
  float foamK = trail*range*mix(.3,1.,lace);
  float swash = ${glf(swash[0])}+${glf(swash[1])}*sin(uT*${k(.6)}+vW.x*.25+n*5.);
  float rim = smoothstep(swash+.32,swash,dd)*(.45+.55*lace);
  c = mix(${glv3(shallow)},${glv3(mid)},smoothstep(.05,1.6,dist));
  c = mix(c,${glv3(deep)},smoothstep(1.6,4.8,dist));
  c *= .86+.3*vn(vW.xz*vec2(.9,.5)+uT*vec2(${k(.15)},${k(.25)}));
  c *= 1.-.22*smoothstep(.65,1.,saw)*range;
  float caustic = pow(vn(vW.xz*2.2+uT*${k(.25)})*vn(vW.xz*1.7-uT*${k(.2)}+4.),2.);
  c += ${glv3(caustic)}*caustic*smoothstep(3.6,.8,dist);
  float sp = smoothstep(.8,.9,vn(vW.xz*vec2(1.6,3.8)+uT*vec2(${k(.25)},${k(.4)})));
  c += ${glv3(sparkle)}*sp*smoothstep(1.2,3.,dist);
  float f = max(foamK,rim);
  if(f>.3){ c = mix(c,${glv3(foam)},clamp(f*1.6,0.,1.)); cls = 10.; }`;
}

/**
 * Sea of cloud: two drifting fbm layers; shading compares density with a sample nudged toward
 * the sun, so puffs get lit tops. Puffs and wisps on the rock become class 10.
 */
export function cloudGLSL({ shade = [.22, .27, .4], body = [.44, .49, .6], top = [.66, .68, .74], drift = .045 } = {}) {
  return `
  vec2 p = vW.xz*vec2(.1,.13)-vec2(uT*${glf(drift)},-uT*.008);
  float pf = fbm(p)*.65+fbm(p*2.3+5.-vec2(uT*.025,0.))*.35;
  vec2 q = p+vec2(-.07,.05);
  float ps = fbm(q)*.65+fbm(q*2.3+5.-vec2(uT*.025,0.))*.35;
  float lit = clamp((pf-ps)*10.+.5,0.,1.);
  c = mix(${glv3(shade)},${glv3(body)},smoothstep(.32,.58,pf));
  c = mix(c,${glv3(top)},lit*smoothstep(.42,.7,pf));
  float wisp = smoothstep(1.1,0.,max(d,0.))*smoothstep(.38,.62,fbm(vW.xz*.8-vec2(uT*.22,0.)));
  c = mix(c,${glv3(top)}*1.08,wisp*.7);
  cls = (pf>.6||wisp>.45) ? 10. : 9.;`;
}
