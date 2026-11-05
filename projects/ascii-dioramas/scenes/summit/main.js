// Himalayan summit: a single peak pokes out of a sea of cloud; a trail climbs from the cloud line
// to a prayer-flag mast on the top. Wind blows toward +x: grass leans, flags stream, snow drifts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  runDiorama, buildLand, terrainMesh, waterPlane, cloudGLSL, grass, flowers, makeTrees, rocks, drifters,
  tag, bladeWind, leafWind, clothWind, g, clamp, sstep, fract, fbm, seeded,
} from '../../engine/index.js';

const CLS = { grass: 1, leaf: 2, flower: 3, stone: 4, trail: 5, flag: 6, wood: 7, snow: 8, cloud: 9, puff: 10, fox: 11, flake: 12, rock: 13 };
const rnd = seeded(41);

// ---------- land: one peak centred on C; the cloud sea is the plane y = 0 ----------
const C = { x: 1, z: -2 }, PEAK = 11.5, SUMMIT_Y = PEAK - 1.5;
const PATH = [[1, -2.4], [3.6, .4], [3.9, 3.6], [1.2, 6.3], [-2.6, 8.5], [-5.6, 11], [-7.8, 14], [-9, 17]];
const FAR_PEAKS = [[-13, -30, 9, 9], [11, -36, 11, 11], [19, -22, 7, 7], [-21, -15, 6, 6], [-4, -23, 7.5, 6.5], [7, -20, 6, 5]];

function peakH(x, z) {
  const dx = x - C.x, dz = z - C.z, r0 = Math.hypot(dx, dz), th = Math.atan2(dz, dx);
  const warp = (fbm(Math.cos(th) * 1.4 + 4, Math.sin(th) * 1.4 + 1) - .5) * 6 + (fbm(x * .12, z * .12) - .5) * 3;
  const t = clamp(1 - (r0 + warp * sstep(1, 6, r0)) / 17);
  let y = PEAK * t ** 1.45 - 1.8;
  const spur = 1 - Math.abs(Math.sin(th * 2.5 + fbm(r0 * .1, 3) * 2));
  y += spur * spur * 2.4 * sstep(1.5, 6, r0) * t;
  y += (fbm(x * .4, z * .4) - .5) * .8 * sstep(1, 4, r0);
  for (const [px, pz, h, R] of FAR_PEAKS) {
    const r = Math.hypot(x - px, z - pz) + (fbm(x * .2 + px, z * .2) - .5) * 3;
    y = Math.max(y, h * clamp(1 - r / R) ** 1.2 - 1.5);
  }
  return y;
}

const trailPts = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', .5).getSpacedPoints(119);
const ROCKS = [];
for (let guard = 0; ROCKS.length < 50 && guard < 2000; guard++) {
  const a = rnd() * 6.283, r = 3 + rnd() * 10, x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r;
  if (!trailPts.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 2.6 ** 2)) ROCKS.push([x, z, .3 + rnd() * rnd() * 1.1]);
}

const land = buildLand({
  path: PATH,
  rawH(x, z) {
    let y = peakH(x, z);
    const k = sstep(16, 2, (x - C.x) ** 2 + (z - C.z) ** 2);
    y = y * (1 - k) + (SUMMIT_Y + (fbm(x * .5, z * .5) - .5) * .3) * k;
    for (const [rx, rz, r] of ROCKS) { const q = ((x - rx) ** 2 + (z - rz) ** 2) / (r * r); if (q < 4) y += Math.exp(-q * 1.4) * r * 1.2; }
    return y;
  },
});
const { H } = land;

const flowerField = (x, z) => fbm(x * .085 + 11, z * .1 - 4);
// Snow line drops on the far (north) face and on the distant peaks.
const snowY = (x, z) => 7.4 - sstep(C.z + 1, C.z - 8, z) * 3 - sstep(-12, -22, z) * 3.6 + (fbm(x * .12 + 7, z * .12) - .5) * 3;
function zone(x, z, y) {
  const sy = snowY(x, z);
  const slope = Math.hypot(H(x + .3, z) - H(x - .3, z), H(x, z + .3) - H(x, z - .3)) / .6;
  if (y > sy && (slope > 2.2 || fbm(x * .22 - 4, z * .3 + 2) > .67)) return 'rock';
  if (y > sy || (y > sy - 2.5 && fbm(x * .35 + 1, z * .35 - 6) > .64)) return 'snow';
  const n = fbm(x * .2 + 3, z * .2 - 2);
  if (slope > 1.9 || n > .67 || y < .5 + n * .6) return 'rock';
  return 'grass';
}
const lumOf = (c) => (c[0] + c[1] + c[2]) / 3;
function paint(x, z, y, pd, T, pick) {
  const zn = zone(x, z, y);
  if (zn === 'snow') {
    const v = .86 + .16 * lumOf(pick(T.aerial_rocks_02, x, z, 5)) / 255 - (pd < 1.05 ? .14 : 0);
    return [212 * v, 220 * v, 236 * v, CLS.snow];
  }
  if (pd < 1.05) { const c = pick(T.castle_wall_slates, x, z, 3), l = lumOf(c); return [l * .86 + c[0] * .1, l * .8 + c[1] * .1, l * .72 + c[2] * .1, CLS.trail]; }
  if (zn === 'rock') { const l = lumOf(pick(T.aerial_rocks_02, x, z, 6)); return [l * .42 + 6, l * .45 + 8, l * .52 + 14, CLS.rock]; }
  const gt = pick(T.leafy_grass, x, z, 2.6), l = gt[0] * .3 + gt[1] * .55 + gt[2] * .15;
  const v = .88 + .7 * fbm(x * .16 + 5, z * .16), gr = fbm(x * .11 - 3, z * .11 + 8);
  const c = [l * (1.3 - gr * .6) * v, l * (1.08 - gr * .05) * v, l * .34 * v];
  return flowerField(x, z) > .6 ? [c[0] * .8 + 28, c[1] * .72 + 14, c[2] + 46, CLS.grass] : [...c, CLS.grass];
}

// ---------- prayer flags, poles, cairns ----------
const FLAG_COLORS = ['#2a62d8', '#f2efe6', '#e0302a', '#2a9c48', '#f2c418'].map(h => new THREE.Color(h));
function buildPrayerFlags(scene) {
  const flagsAt = [], poles = [];
  const addLine = (a, b, sag) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], n = Math.max(2, Math.floor(Math.hypot(dx, dy, dz) / .54));
    const yaw = Math.atan2(-dz, dx);
    for (let i = 1; i < n; i++) { const t = i / n; flagsAt.push([a[0] + dx * t, a[1] + dy * t - sag * 4 * t * (1 - t), a[2] + dz * t, yaw, (i - 1) % 5]); }
  };
  const pole = (x, z, h, r) => { const pg = new THREE.CylinderGeometry(r * .7, r, h, 6); pg.translate(x, H(x, z) + h / 2 - .1, z); poles.push(pg); return [x, H(x, z) + h - .15, z]; };

  for (let u = .17; u < .88; u += .09) {
    const { p, t, nx, nz } = land.frame(u);
    const half = 2.3 + rnd() * .6, skew = (rnd() - .5) * 1.4;
    const a = pole(p.x + nx * half + t.x * skew, p.z + nz * half + t.z * skew, 2.4 + rnd() * .6, .05);
    const b = pole(p.x - nx * half - t.x * skew, p.z - nz * half - t.z * skew, 2.4 + rnd() * .6, .05);
    addLine(a, b, .45);
  }
  const mx = C.x - .3, mz = C.z - 1.2, top = pole(mx, mz, 4.6, .1);
  for (let k = 0; k < 10; k++) {
    const ang = k / 10 * 6.283 + .3, r = 5.4 + rnd() * 1.4;
    addLine(top, pole(mx + Math.cos(ang) * r, mz + Math.sin(ang) * r, .9, .04), .3);
  }

  const fg = new THREE.PlaneGeometry(.46, .54, 4, 3); fg.translate(0, -.27, 0);
  const im = new THREE.InstancedMesh(fg, tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: '#2a2a2a' }), CLS.flag, clothWind()), flagsAt.length);
  const o = new THREE.Object3D();
  flagsAt.forEach(([x, y, z, yaw, ci], i) => { o.position.set(x, y, z); o.rotation.set(0, yaw, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, FLAG_COLORS[ci]); });
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
  const pm = new THREE.Mesh(mergeGeometries(poles), tag(new THREE.MeshLambertMaterial({ color: '#6a4a32' }), CLS.wood));
  pm.castShadow = true; scene.add(pm);
  return [mx, mz];
}
function buildCairns(scene, mast) {
  const stone = () => {
    const sg = new THREE.IcosahedronGeometry(1, 1), p = sg.attributes.position, sx = .8 + rnd() * .4, off = rnd() * 7;
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i), k = .8 + fbm(v.x * 2 + off, v.z * 2 + v.y) * .4; p.setXYZ(i, v.x * k * sx, v.y * k * .42, v.z * k); }
    return sg;
  };
  const parts = [];
  const cairn = (x, z, s) => {
    let y = H(x, z) - .05 * s;
    for (let l = 0; l < 6; l++) {
      const r = s * (1 - l * .14), sg = stone(); sg.scale(r, r, r); sg.rotateY(rnd() * 6); sg.translate(x + (rnd() - .5) * .08 * s, y + r * .38, z + (rnd() - .5) * .08 * s);
      parts.push(sg); y += r * .74;
    }
  };
  cairn(mast[0], mast[1], .55);
  for (let i = 0; i < 7; i++) {
    const { p, nx, nz } = land.frame(.14 + i * .11), sd = i % 2 ? 1 : -1;
    cairn(p.x + nx * sd * 1.9, p.z + nz * sd * 1.9, .28 + rnd() * .12);
  }
  const cg = mergeGeometries(parts); cg.computeVertexNormals();
  const m = new THREE.Mesh(cg, tag(new THREE.MeshLambertMaterial({ color: '#656c78' }), CLS.stone));
  m.castShadow = true; m.receiveShadow = true; scene.add(m);
}

// ---------- glyph rules, by surface class ----------
const rules = /* glsl */`
  if(cls<1.5){        // tussock grass, leaning downwind
    gl = L<.1?${g('.')}:L<.17?${g(':')}:(w<-.25?${g('\\')}:w>.15?${g('/')}:${g('|')});
  } else if(cls<2.5){ // juniper
    gl = L<.1?${g('.')}:L<.2?${g(':')}:L<.34?${g('*')}:${g('+')};
  } else if(cls<3.5){ // alpine flowers
    gl = L<.3?${g(':')}:L<.5?${g('*')}:${g('o')};
  } else if(cls<4.5){ // cairn stones
    gl = L<.22?${g(':')}:L<.42?${g('%')}:${g('#')};
    if(mag>.16) gl = edgeG;
  } else if(cls<5.5){ // trail
    gl = L<.14?${g('.')}:L<.26?${g(':')}:L<.4?${g('=')}:${g('#')};
  } else if(cls<6.5){ // prayer flags
    gl = L<.1?${g(':')}:L<.26?${g('=')}:L<.5?${g('%')}:${g('#')};
  } else if(cls<7.5){ // poles
    gl = L<.12?${g(':')}:(mag>.12?edgeG:${g('|')});
  } else if(cls<8.5){ // snow: sparse marks over a bright cell background
    gl = L<.4?${g('.')}:L<.62?${g(':')}:(h21(cell)>.72?${g('*')}:${g(':')});
    if(L>.45 && w>.62) gl = ${g('~')};
    if(mag>.34) gl = edgeG;
  } else if(cls<9.5){ // cloud sea
    gl = L<.3?${g('-')}:L<.48?(w>.3?${g('~')}:${g('-')}):L<.66?${g('~')}:${g('=')};
  } else if(cls<10.5){ // cloud tops, wisps on the rock
    gl = L<.55?${g('~')}:L<.75?${g('+')}:${g('*')};
  } else if(cls<11.5){ // fox
    gl = L<.4?${g('&')}:${g('$')};
  } else if(cls<12.5){ // blown snow
    gl = L<.5?${g("'")}:L<.75?${g('-')}:${g('~')};
  } else {            // rock
    gl = L<.15?${g('.')}:L<.32?${g(':')}:${g('%')};
    if(mag>.2) gl = edgeG;
  }`;

runDiorama({
  size: [1080, 1920], grid: [200, 178],
  light: { sun: { color: '#fff0da', intensity: 3.8, position: [C.x - 20, 58, C.z + 28], target: [C.x, 4, C.z] }, sky: ['#d8e4ff', '#7a6a48', 1.5], shadowFar: 150 },
  camera: { target: [C.x, SUMMIT_Y, C.z - 1.2] },
  glyphs: { rules, saturation: 1.3, gain: 1.36, bgByClass: { 8: .62, 9: .36, 10: .36 }, wind: { drift: [.32, .04], spread: 1.4, bias: .05, gust: .9 } },
  creature: { land, cls: CLS.fox, tint: [1.3, 1, .7], u: [.08, .55], speed: .6, still: [C.x + 1.5, C.z + .8, .6] },
  async build(scene) {
    scene.add(await terrainMesh(land, { textures: ['leafy_grass', 'aerial_rocks_02', 'castle_wall_slates'], paint }), waterPlane(land, cloudGLSL()));
    const gold = new THREE.Color(.4, .33, .15), green = new THREE.Color(.15, .29, .09);
    grass(scene, {
      cls: CLS.grass, rnd, H, count: 180000, area: [-20, 20, -22, 18], height: [.26, .28],
      wind: bladeWind({ amp: .22, lean: .35, gust: .8, flutter: .12, drop: .1, upNormals: true }),
      accept: (x, z, y) => y >= .4 && land.pathD(x, z) >= 1.2 && zone(x, z, y) === 'grass',
      color(c, x, z, r) { const v = .45 + r() * .7, dk = .45 + 1.1 * fbm(x * .16 + 5, z * .16); c.copy(gold).lerp(green, fbm(x * .11 - 3, z * .11 + 8) * .85).multiplyScalar(v * dk); },
    });
    flowers(scene, {
      cls: CLS.flower, rnd, H, count: 30000, area: [-20, 20, -20, 16], size: .12, lift: [.12, .1], scale: [.8, .8],
      wind: leafWind({ rate: 2.4, bob: .03, swayRate: 1.1, sway: .05 }),
      accept: (x, z, y) => flowerField(x, z) >= .59 + rnd() * .05 && land.pathD(x, z) >= 2 && zone(x, z, y) === 'grass',
      color(c, r) { const k = r(); if (k < .55) c.setRGB(.32, .45, .98); else if (k < .8) c.setRGB(.82, .3, .78); else c.setRGB(1, .82, .2); },
    });
    const shrubs = makeTrees({ H, rnd });
    for (let n = 0, guard = 0; n < 30 && guard < 20000; guard++) {
      const x = -16 + rnd() * 32, z = -14 + rnd() * 28, y = H(x, z);
      if (y < 1 || y > 5.5 || land.pathD(x, z) < 3.5 || zone(x, z, y) !== 'grass') continue;
      n++;
      const s = .5 + rnd() * .6, lobes = 3 + (rnd() * 3 | 0);
      for (let l = 0; l < lobes; l++) {
        const lx = x + (rnd() - .5) * 1.6 * s, lz = z + (rnd() - .5) * 1.6 * s, ly = H(lx, lz) + .25 * s, lr = (.45 + rnd() * .35) * s;
        for (let k = 0; k < 60; k++) {
          const u = rnd() * 2 - 1, th = rnd() * 6.28, q = Math.sqrt(1 - u * u), rr = lr * Math.cbrt(rnd()), lit = .7 + .55 * clamp(u * .5 + .5);
          shrubs.leaves.push(lx + q * Math.cos(th) * rr, ly + Math.abs(u) * rr * .6, lz + q * Math.sin(th) * rr, .11 * lit, .28 * lit, .15 * lit);
        }
      }
    }
    shrubs.finish(scene, { leafCls: CLS.leaf, wind: leafWind({ rate: 2.4, bob: .03, swayRate: 1.1, sway: .05 }), leafSize: [.24, .2] });
    buildCairns(scene, buildPrayerFlags(scene));
    rocks(scene, ROCKS, { cls: CLS.rock, rnd, y: (x, z, r) => H(x, z) - r * .3, color: [.3, .32, .36], flatten: .5 });
    return drifters(scene, {
      count: 320, cls: CLS.flake, rnd, color: [1.25, 1.3, 1.4], geometry: new THREE.PlaneGeometry(.16, .05).rotateX(-Math.PI / 2 + .6),
      place(s, t, d) {
        const x = -16 + fract(s[0] + t * (.06 + s[3] * .05)) * 32, z = -24 + s[2] * 40;
        d.position.set(x, Math.max(H(x, z), 0) + .3 + s[1] * 3 + Math.sin(t * 1.3 + s[3] * 9) * .3, z);
        d.rotation.set(0, Math.sin(t * 2 + s[1] * 9) * .3, 0); d.scale.setScalar(.7 + s[3] * .8);
      },
    });
  },
}).catch(e => console.error(e));
