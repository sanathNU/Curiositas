// South Indian temple: tiered gopuram towers along stone ghats descending to a pushkarini tank.
// Dravidian granite, coconut palms, polychrome gopuram sculpture.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  runDiorama, buildLand, terrainMesh, waterPlane, seaGLSL, grass, flowers, makeTrees, rocks, drifters,
  tag, tex, colored, bladeWind, leafWind, g, sstep, fract, fbm, seeded,
} from '../../engine/index.js';

const CLS = { grass: 1, leaf: 2, flower: 3, stone: 4, stair: 5, gopuram: 6, wood: 7, sand: 8, water: 9, lotus: 10, fox: 11, diya: 12, rock: 13 };
const rnd = seeded(42);

// ---------- land ----------
const coastZ = (x) => 8.5 + .18 * x + (fbm(x * .1 + 2, 1.3) - .5) * 7;
const ROCKS = [];
for (let i = 0; i < 40; i++) {
  const x = -30 + rnd() * 60, off = -2 + rnd() * rnd() * 10, r = .3 + rnd() * rnd() * 1.3;
  ROCKS.push([x, coastZ(x) + off, r]);
}
ROCKS.push([4, coastZ(4) + 5.5, 1.6], [-6, coastZ(-6) + 4, 1.3], [8, coastZ(8) + 6, 1.1]);

const land = buildLand({
  path: [[9, -18], [7, -13], [4.5, -9], [2, -5], [.5, -.5], [-.8, 3.5], [-2.8, 7], [-4.2, 10.5]],
  pathFloor: .12,
  rawH(x, z) {
    const d = coastZ(x) - z;
    let y = d < 0 ? d * .42 : 4.2 * (1 - Math.exp(-d * .42)) + d * .34;
    y += sstep(0, 5, d) * ((fbm(x * .09, z * .09) - .5) * 4.2 + (fbm(x * .4, z * .4) - .5) * .8);
    for (const [rx, rz, r] of ROCKS) { const q = ((x - rx) ** 2 + (z - rz) ** 2) / (r * r); if (q < 4) y += Math.exp(-q * 1.4) * r * 1.2; }
    return y;
  },
});
const { H, pathD, pathY } = land;
const flowerField = (x, z) => fbm(x * .085 + 11, z * .1 - 4);

function paint(x, z, y, pd, T, pick) {
  const d = coastZ(x) - z, n = fbm(x * .3, z * .3);
  if (pd < 1.6) { const c = pick(T.castle_wall_slates, x, z, 3); return [c[0] * .7, c[1] * .68, c[2] * .72, CLS.stair]; }
  if (y < 1.3 + n * 1.4 && d < 7) {
    if (y < .55 + n * .5 && d > -2.5 && n > .36) { const c = pick(T.coast_sand_01, x, z, 3.2); return [c[0] * 1.1, c[1], c[2] * .82, CLS.sand]; }
    const c = pick(T.aerial_rocks_02, x, z, 7); return [c[0] * .6, c[1] * .62, c[2] * .68, CLS.rock];
  }
  const c = pick(T.leafy_grass, x, z, 2.6), v = .62 + .95 * fbm(x * .16 + 5, z * .16);
  const r = c[0] * .55 * v, gr = c[1] * 1.08 * v, b = c[2] * .35 * v;
  return flowerField(x, z) > .58 ? [r * .65 + 55, gr * .6 + 25, b * .4 + 5, CLS.grass] : [r, gr, b, CLS.grass];
}

// ---------- coconut palms + canopy trees ----------
function buildTrees(scene) {
  const T = makeTrees({ H, rnd }), spots = [];
  for (let guard = 0; spots.length < 80 && guard < 9000; guard++) {
    const x = -24 + rnd() * 48, z = -28 + rnd() * 26;
    if (pathD(x, z) < (z > -9 ? 6.5 : 3.8) || spots.some(s => (s.x - x) ** 2 + (s.z - z) ** 2 < 7)) continue;
    if (x > 2 && x < 13 && z > -24 && z < -14) continue;
    const nearWater = coastZ(x) - z < 8;
    spots.push({ x, z, s: .8 + rnd() * .5, kind: nearWater && rnd() < .4 ? 'palm' : rnd() < .2 ? 'gold' : 'green' });
  }
  for (const [x, z, s, kind] of [[-12, -8, 1.05, 'green'], [-10.5, -2, .85, 'palm'], [12, -8, 1.1, 'green'], [13, -2, .95, 'palm'], [-13, 4, .95, 'green'], [12, 3, .8, 'palm'], [-9, -13, 1.0, 'green'], [-12, -6, 1.1, 'green'], [10, -7, .95, 'green'], [11, -12, 1.05, 'gold']]) spots.push({ x, z, s, kind });
  const pal = {
    gold: [[.2, .42, .1], [.26, .48, .13], [.15, .33, .08], [.32, .52, .15]],
    green: [[.1, .36, .07], [.18, .42, .1], [.07, .26, .05], [.26, .48, .12]],
    palm: [[.15, .45, .1], [.2, .52, .14], [.1, .35, .08], [.25, .5, .12]],
  };
  for (const t of spots) {
    if (t.kind !== 'palm') { T.canopy(t, pal[t.kind], { perLobe: 140 }); continue; }
    // tall curved trunk, then drooping fronds of leaf cards
    const y0 = H(t.x, t.z), H0 = 7.5 * t.s, segs = 12, pts = [];
    const lean = (rnd() - .5) * 2.5, leanZ = (rnd() - .5) * 1.5;
    for (let i = 0; i <= segs; i++) { const f = i / segs; pts.push(new THREE.Vector3(t.x + lean * f * f, y0 + f * H0, t.z + leanZ * f * f)); }
    for (let i = 0; i < segs; i++) {
      const r0 = (.15 - .08 * (i / segs)) * t.s, r1 = (.15 - .08 * ((i + 1) / segs)) * t.s, len = pts[i + 1].distanceTo(pts[i]);
      if (len < .01) continue;
      const seg = new THREE.CylinderGeometry(r1, r0, len, 6), mid = pts[i].clone().lerp(pts[i + 1], .5), dir = pts[i + 1].clone().sub(pts[i]).divideScalar(len);
      if (Math.abs(dir.x) + Math.abs(dir.z) >= .001) seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      seg.translate(mid.x, mid.y, mid.z); T.trunks.push(seg);
    }
    const top = pts[segs];
    for (let f = 0; f < 9; f++) {
      const a = f / 9 * 6.28 + rnd() * .3, frondLen = (2.8 + rnd() * 1.5) * t.s, droop = .6 + rnd() * .4;
      for (let l = 0; l < 28; l++) {
        const k = l / 28, p = pal.palm[(rnd() * pal.palm.length) | 0], lit = .7 + .5 * (1 - k);
        T.leaves.push(top.x + Math.cos(a) * k * frondLen + (rnd() - .5) * .15, top.y + .3 - k * k * droop * frondLen * .5, top.z + Math.sin(a) * k * frondLen + (rnd() - .5) * .15, p[0] * lit, p[1] * lit, p[2] * lit);
      }
    }
  }
  T.finish(scene, { leafCls: CLS.leaf, woodCls: CLS.wood, wind: leafWind({ rate: 1.4, bob: .03, sway: .05, swayRate: .5 }), barkTex: tex('assets/tex/bark_brown_02.jpg', 1, 2), barkColor: '#bfb8ae' });
}

// ---------- gopuram towers (Dravidian tiered gateway) ----------
function gopuramGeo(w = 2.4, totalH = 5.5) {
  const parts = [], granite = '#8a8078', cream = '#e8dcc8', tierColors = ['#d04030', '#e8a020', '#3080d0', '#d04030', '#e8a020'];
  const baseH = totalH * .22;
  for (const s of [-1, 1]) { const wall = new THREE.BoxGeometry(w * .35, baseH, w * .3); wall.translate(s * w * .32, baseH / 2, 0); parts.push(colored(wall, granite)); }
  const lintel = new THREE.BoxGeometry(w * .95, baseH * .18, w * .32); lintel.translate(0, baseH, 0); parts.push(colored(lintel, granite));
  let yOff = baseH + baseH * .08;
  for (let t = 0; t < 5; t++) {
    const frac = 1 - t / 5, tw = w * .9 * frac, th = (totalH - baseH) / 5 * .82, td = w * .28 * frac;
    const tier = new THREE.BoxGeometry(tw, th, td); tier.translate(0, yOff + th / 2, 0); parts.push(colored(tier, tierColors[t]));
    const bumps = Math.max(2, Math.floor(tw / .35));
    for (let b = 0; b < bumps; b++) { const bump = new THREE.SphereGeometry(.06 * frac, 4, 3); bump.translate(-tw / 2 + (b + .5) / bumps * tw, yOff + th * .7, td / 2 + .03); parts.push(colored(bump, cream)); }
    yOff += th + .04;
  }
  const capW = w * .25, capH = totalH * .12;
  const cap = new THREE.CylinderGeometry(capW * .4, capW * .6, capH, 8); cap.translate(0, yOff + capH / 2, 0); parts.push(colored(cap, '#d04030'));
  const kal = new THREE.SphereGeometry(.1, 6, 5); kal.translate(0, yOff + capH + .1, 0); parts.push(colored(kal, '#ffcc30'));
  const spike = new THREE.ConeGeometry(.04, .25, 4); spike.translate(0, yOff + capH + .3, 0); parts.push(colored(spike, '#ffcc30'));
  const m = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; })); m.computeVertexNormals();
  return m;
}
function buildGopurams(scene) {
  const at = [{ u: .08, scale: 1.5 }];
  for (let i = 1; i < 5; i++) at.push({ u: .08 + i * .18, scale: .85 + rnd() * .3 });
  const im = new THREE.InstancedMesh(gopuramGeo(), tag(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#2a1505', emissiveIntensity: .3 }), CLS.gopuram), at.length);
  const o = new THREE.Object3D();
  at.forEach(({ u, scale }, i) => { const { p, yaw } = land.frame(u); o.position.set(p.x, pathY(p.x, p.z) - .04, p.z); o.rotation.set(0, yaw, 0); o.scale.setScalar(scale); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}
function buildGhatSteps(scene) {
  const steps = Math.floor(land.length / .4);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, .18, .45), tag(new THREE.MeshLambertMaterial({ map: tex('assets/tex/castle_wall_slates.jpg', .4, .2), color: '#a09888' }), CLS.stair), steps);
  const o = new THREE.Object3D();
  for (let i = 0; i < steps; i++) { const { p, yaw } = land.frame((i + .5) / steps); o.position.set(p.x, pathY(p.x, p.z), p.z); o.rotation.set(0, yaw, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }
  im.receiveShadow = true; im.castShadow = true; scene.add(im);
}
// stone pillared corridors (prakarams) flanking the path
function buildPrakarams(scene) {
  const pillarG = new THREE.CylinderGeometry(.08, .11, 1.8, 8), beamG = new THREE.BoxGeometry(.22, .12, 1.2), parts = [];
  for (let i = 0; i < 22; i++) {
    const u = .12 + i * .035; if (u > .82) break;
    const { p, nx, nz, yaw } = land.frame(u);
    for (const s of [-1, 1]) {
      const x = p.x + nx * s * 2.8, z = p.z + nz * s * 2.8, y = H(x, z);
      if (y < 1.2) continue;
      const pg = pillarG.clone(); pg.translate(x, y + .9, z); parts.push(pg);
      const bg = beamG.clone(); bg.rotateY(yaw); bg.translate(x, y + 1.86, z); parts.push(bg);
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), tag(new THREE.MeshLambertMaterial({ map: tex('assets/tex/castle_wall_slates.jpg', .3, .5), color: '#b0a898' }), CLS.stone));
  mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
}
function buildDiyas(scene) {
  const bowl = new THREE.CylinderGeometry(.16, .1, .14, 8); bowl.translate(0, .07, 0);
  const flame = new THREE.ConeGeometry(.05, .2, 5); flame.translate(0, .24, 0);
  const dg = mergeGeometries([bowl, flame].map(p => { p.deleteAttribute('uv'); return p.toNonIndexed(); })); dg.computeVertexNormals();
  const n = 22, im = new THREE.InstancedMesh(dg, tag(new THREE.MeshLambertMaterial({ color: '#d89030', emissive: '#ff7a08', emissiveIntensity: .7 }), CLS.diya), n), o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const { p, nx, nz } = land.frame(.05 + i / n * .9), s = i % 2 ? 1 : -1, x = p.x + nx * s * 1.9, z = p.z + nz * s * 1.9;
    o.position.set(x, H(x, z) + .02, z); o.rotation.y = rnd(); o.scale.setScalar(1.3); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
  }
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}
// Nandi, the seated bull, beside the path midpoint
function buildNandi(scene) {
  const grp = new THREE.Group(), body = tag(new THREE.MeshLambertMaterial({ color: '#2a2a2a' }), CLS.rock), stone = tag(new THREE.MeshLambertMaterial({ color: '#a09080' }), CLS.stone);
  const add = (geo, mat, pos, rot = [0, 0, 0], scl = [1, 1, 1]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...scl); grp.add(m); };
  add(new THREE.CapsuleGeometry(.35, .8, 6, 10), body, [0, .5, 0], [0, 0, Math.PI / 2]);
  add(new THREE.SphereGeometry(.22, 6, 5), body, [.55, .72, 0], [0, 0, 0], [1, .85, .9]);
  add(new THREE.CylinderGeometry(.08, .12, .2, 6), body, [.72, .65, 0], [0, 0, Math.PI / 2]);
  for (const s of [-1, 1]) add(new THREE.ConeGeometry(.04, .3, 5), tag(new THREE.MeshLambertMaterial({ color: '#888070' }), CLS.stone), [.48, .9, s * .15], [s * .2, 0, s * .4]);
  for (const [lx, lz] of [[-.25, .18], [-.25, -.18], [.2, .18], [.2, -.18]]) add(new THREE.CylinderGeometry(.06, .07, .35, 5), body, [lx, .17, lz]);
  add(new THREE.SphereGeometry(.18, 5, 4), body, [.1, .88, 0], [0, 0, 0], [1, .7, 1]);
  add(new THREE.BoxGeometry(1.2, .15, .8), stone, [0, -.02, 0]);
  const { p, t, yaw } = land.frame(.45);
  grp.position.set(p.x + t.z * 3.2, pathY(p.x, p.z) + .08, p.z - t.x * 3.2); grp.rotation.y = yaw + Math.PI / 2; grp.scale.setScalar(1.3);
  grp.traverse(o => { o.castShadow = true; o.receiveShadow = true; }); scene.add(grp);
}
function buildLotus(scene) {
  const lg = new THREE.PlaneGeometry(.22, .22); lg.rotateX(-Math.PI / 2);
  const N = 500, im = new THREE.InstancedMesh(lg, tag(new THREE.MeshLambertMaterial({ color: '#f0a0b0', side: THREE.DoubleSide }), CLS.lotus, leafWind({ rate: 1.4, bob: .03, sway: .05, swayRate: .5 })), N);
  const o = new THREE.Object3D(), c = new THREE.Color();
  let i = 0;
  for (let guard = 0; i < N && guard < 50000; guard++) {
    const x = -18 + rnd() * 36, z = coastZ(x) + 1 + rnd() * 14;
    if (pathD(x, z) < 3) continue;
    o.position.set(x, .08 + rnd() * .04, z); o.rotation.y = rnd() * 6.28; o.scale.setScalar(.5 + rnd() * .7); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    const r = rnd(); c.setRGB(r < .35 ? .9 : .96, r < .35 ? .5 : .88, r < .35 ? .6 : .85); im.setColorAt(i++, c);
  }
  im.count = i; scene.add(im);
}

const rules = /* glsl */`
  if(cls<1.5){        // grass
    gl = L<.1?${g('.')}:L<.17?${g(':')}:(w<-.2?${g('\\')}:w>.2?${g('/')}:${g('|')});
  } else if(cls<2.5){ // leaves
    gl = L<.12?${g('.')}:L<.24?${g(':')}:L<.38?${g('*')}:L<.5?${g('+')}:${g('o')};
  } else if(cls<3.5){ // flowers
    gl = L<.34?${g(':')}:L<.55?${g('*')}:L<.76?${g('%')}:${g('#')};
  } else if(cls<4.5){ // stone
    gl = L<.22?${g(':')}:L<.42?${g('%')}:${g('#')};
    if(mag>.16) gl = edgeG;
  } else if(cls<5.5){ // ghat stairs
    gl = L<.12?${g(':')}:L<.24?${g('=')}:L<.5?${g('\u2014')}:${g('#')};
  } else if(cls<6.5){ // gopuram
    gl = L<.08?${g(':')}:L<.18?${g('=')}:${g('#')};
    if(mag>.18 && L>.06) gl = edgeG;
  } else if(cls<7.5){ // wood, trunks
    gl = L<.14?${g(':')}:(mag>.1?edgeG:(L<.34?${g('|')}:${g('#')}));
  } else if(cls<8.5){ // sand
    gl = L<.3?${g(':')}:L<.6?${g(';')}:${g('=')};
  } else if(cls<9.5){ // pushkarini water
    gl = L<.22?${g('-')}:L<.45?(w>0.?${g('~')}:${g('-')}):L<.72?${g('~')}:${g('=')};
  } else if(cls<10.5){ // lotus, foam
    gl = L<.5?${g('*')}:L<.75?${g('o')}:${g('%')};
  } else if(cls<11.5){ // creature
    gl = L<.4?${g('&')}:${g('$')};
  } else if(cls<12.5){ // diya
    gl = L<.35?${g(':')}:L<.6?${g('*')}:${g('#')};
    if(mag>.2) gl = edgeG;
  } else {            // rock
    gl = L<.12?${g('.')}:L<.26?${g(':')}:L<.42?${g('%')}:${g('#')};
    if(mag>.2) gl = edgeG;
  }`;

const blades = bladeWind({ amp: .14, lean: 0, gust: .4, flutter: .2, flutterRate: 1.1, rate: .5 });
runDiorama({
  size: [1080, 1920], grid: [200, 178],
  light: { sun: { color: '#ffd8a0', intensity: 3.2, position: [-28, 40, 18], target: [0, 4, -2] }, sky: ['#e8d8b8', '#5a5830', 1.2] },
  camera: { target: [0, 5.2, 2], radius: 74, elevation: 54, wobble: 1.2 },
  glyphs: { rules, saturation: 1.38, gain: 1.42, lift: .015, bg: .18, wind: { drift: [.15, .04] } },
  // Fox.glb tinted chital-brown, walking on the grass beside the ghats
  creature: { land, cls: CLS.fox, scale: .015, tint: [1.1, .85, .55], u: [.35, .72], speed: .25, offset: 3.5 },
  async build(scene) {
    scene.add(await terrainMesh(land, { textures: ['leafy_grass', 'coast_sand_01', 'aerial_rocks_02', 'castle_wall_slates'], paint }));
    scene.add(waterPlane(land, seaGLSL({ shallow: [.22, .42, .38], mid: [.04, .28, .3], deep: [.01, .1, .18], foam: [.95, .98, .92], speed: .72, band: 6, swash: [.2, .14], caustic: [.12, .22, .18], sparkle: [0, 0, 0] })));
    grass(scene, {
      cls: CLS.grass, rnd, H, count: 200000, area: [-24, 24, -34, 24], height: [.3, .28], wind: blades,
      accept: (x, z, y) => y >= 1.4 + fbm(x * .3, z * .3) * 1.4 && pathD(x, z) >= 1.6 && coastZ(x) - z >= 2,
      color(c, x, z, r) { const v = .5 + r() * .7, tone = fbm(x * .16 + 5, z * .16), dk = .5 + 1.1 * tone; c.setRGB((.08 * v + tone * .06) * dk, .38 * v * dk, .035 * v * dk); },
    });
    flowers(scene, {
      cls: CLS.flower, rnd, H, count: 70000, area: [-24, 24, -30, 22], lift: [.18, .14], scale: [.7, .85], wind: blades,
      accept: (x, z, y) => flowerField(x, z) >= .56 + rnd() * .05 && y >= 1.8 && pathD(x, z) >= 2.2 && coastZ(x) - z >= 2.5 && fbm(x * .9, z * .9) >= .47,
      color(c, r) { // kumkum red, turmeric yellow, jasmine white
        const k = r();
        if (k < .45) c.setRGB(.92 + r() * .08, .15 + r() * .15, .05 + r() * .08);
        else if (k < .8) c.setRGB(.95 + r() * .05, .72 + r() * .18, .05 + r() * .1);
        else c.setRGB(.98, .92, .85);
      },
    });
    buildTrees(scene);
    buildGopurams(scene); buildGhatSteps(scene); buildPrakarams(scene); buildDiyas(scene); buildNandi(scene); buildLotus(scene);
    rocks(scene, ROCKS, { cls: CLS.rock, rnd, y: (x, z, r) => r * .15, map: tex('assets/tex/aerial_rocks_02.jpg', 1.5, 1.5), color: [.65, .68, .74], scale: .9 });
    return drifters(scene, { // kumkum petals
      count: 120, cls: CLS.flower, rnd, color: [1.4, .3, .15],
      place(s, t, d) {
        const x = -14 + fract(s[0] + t * (.015 + s[3] * .01)) * 28 + Math.sin(t * .5 + s[1] * 9) * .4, z = -20 + s[2] * 34;
        d.position.set(x, H(x, z) + 1 + s[1] * 4.5 + Math.sin(t * .8 + s[3] * 11) * .3, z);
        d.rotation.set(t + s[0] * 9, t * .6, s[1]); d.scale.setScalar(.7 + s[3] * .7);
      },
    });
  },
}).catch(e => console.error(e));
