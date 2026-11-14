// Senbon torii: vermilion torii gates over stone steps running down a cliff to a turquoise sea,
// stone tōrō lanterns, a shrine hall at the top, maples, ginkgo and sakura, drifting petals.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  runDiorama, buildLand, terrainMesh, waterPlane, seaGLSL, grass, flowers, makeTrees, rocks, drifters,
  tag, tex, colored, bladeWind, leafWind, g, sstep, fract, fbm, seeded,
} from '../../engine/index.js';

const CLS = { grass: 1, leaf: 2, flower: 3, stone: 4, stair: 5, torii: 6, wood: 7, sand: 8, water: 9, foam: 10, fox: 11, lantern: 12, rock: 13 };
const rnd = seeded(23);

// ---------- land ----------
const coastZ = (x) => 10.6 + .24 * x + (fbm(x * .1 + 2, 1.3) - .5) * 9;
const ROCKS = [];
for (let i = 0; i < 46; i++) {
  const x = -30 + rnd() * 60, off = -2 + rnd() * rnd() * 12, r = .35 + rnd() * rnd() * 1.5;
  ROCKS.push([x, coastZ(x) + off, r]);
}
ROCKS.push([3, coastZ(3) + 6.5, 1.9], [5.1, coastZ(5) + 6.2, 1.2], [-8, coastZ(-8) + 5, 1.6]);

const land = buildLand({
  path: [[8.5, -17], [6.4, -12.5], [3.4, -8.5], [1.4, -4.5], [.6, -.5], [-.6, 3], [-2.6, 6.2], [-4.4, 9], [-5.6, 11.8]],
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
const SHRINE = { x: 7.2, z: -20.8 };

function paint(x, z, y, pd, T, pick) {
  const d = coastZ(x) - z, n = fbm(x * .3, z * .3);
  if (pd < 1.45) { const c = pick(T.castle_wall_slates, x, z, 3); return [c[0] * .95, c[1] * .9, c[2] * .84, CLS.stair]; }
  if (y < 1.3 + n * 1.4 && d < 7) {
    if (y < .55 + n * .5 && d > -2.5 && n > .36) { const c = pick(T.coast_sand_01, x, z, 3.2); return [c[0] * 1.22, c[1] * 1.12, c[2] * .9, CLS.sand]; }
    const c = pick(T.aerial_rocks_02, x, z, 7); return [c[0] * .68, c[1] * .72, c[2] * .78, CLS.rock];
  }
  const c = pick(T.leafy_grass, x, z, 2.6), v = .62 + .95 * fbm(x * .16 + 5, z * .16);
  const r = c[0] * .7 * v, gr = c[1] * 1.15 * v, b = c[2] * .38 * v;
  return flowerField(x, z) > .575 ? [r * .85 + 44, gr * .8 + 36, b * .85 + 46, CLS.grass] : [r, gr, b, CLS.grass];
}

// ---------- maples, ginkgo, sakura ----------
function buildTrees(scene) {
  const T = makeTrees({ H, rnd }), spots = [];
  for (let guard = 0; spots.length < 96 && guard < 9000; guard++) {
    const x = -24 + rnd() * 48, z = -28 + rnd() * 27;
    if (pathD(x, z) < (z > -9 ? 6.5 : 3.6) || spots.some(s => (s.x - x) ** 2 + (s.z - z) ** 2 < 8)) continue;
    if (x > 1.5 && x < 12.5 && z > -25 && z < -14) continue; // shrine clearing
    const k = rnd();
    spots.push({ x, z, s: .85 + rnd() * .55, kind: k < .12 ? 'sakura' : k < .32 ? 'maple' : k < .5 ? 'ginkgo' : 'green' });
  }
  for (const [x, z, s, kind] of [[-13, -9, 1.1, 'maple'], [-11.5, -2.5, .9, 'green'], [12.5, -9, 1.15, 'green'], [13.5, -3, 1, 'sakura'], [-14, 4, 1, 'green'], [13, 3, .85, 'ginkgo'], [-9.5, -13.5, 1.05, 'green'], [-12.5, -7, 1.15, 'ginkgo'], [10.5, -7.5, 1, 'maple'], [12, -12.5, 1.1, 'green'], [-1, -16, .9, 'sakura'], [9.5, 8.5, .8, 'green']]) spots.push({ x, z, s, kind });
  const pal = {
    maple: [[.82, .1, .04], [.95, .2, .05], [.6, .05, .04], [1, .35, .1]],
    ginkgo: [[.98, .68, .1], [.86, .52, .05], [1, .78, .2], [.7, .55, .1]],
    sakura: [[.95, .62, .7], [1, .72, .8], [.88, .5, .62], [1, .82, .86]],
    green: [[.12, .38, .08], [.2, .45, .12], [.08, .28, .06], [.28, .5, .14]],
  };
  for (const t of spots) T.canopy(t, pal[t.kind]);
  T.finish(scene, { leafCls: CLS.leaf, woodCls: CLS.wood, wind: leafWind(), barkTex: tex('assets/tex/bark_brown_02.jpg', 1, 2), barkColor: '#cfc4b6' });
}

// ---------- torii gates, steps, tōrō lanterns, shrine ----------
const bend = (geo, half, lift) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.pow(Math.abs(p.getX(i)) / half, 2.4) * lift); return geo; };
function toriiGeo(w = 2.1, h = 3) {
  const red = '#e2401c', parts = [];
  for (const s of [-1, 1]) {
    const pillar = new THREE.CylinderGeometry(.12, .15, h, 10); pillar.translate(s * w / 2, h / 2, 0); parts.push(colored(pillar, red));
    const foot = new THREE.CylinderGeometry(.19, .2, .26, 10); foot.translate(s * w / 2, .13, 0); parts.push(colored(foot, '#2a1a14'));
  }
  const nuki = new THREE.BoxGeometry(w + .55, .15, .14); nuki.translate(0, h * .76, 0); parts.push(colored(nuki, red));
  const strut = new THREE.BoxGeometry(.12, h * .16, .12); strut.translate(0, h * .84 + .07, 0); parts.push(colored(strut, red));
  // the two top beams sweep up at the ends; kept vermilion on top so the gates read from above
  const shimaki = bend(new THREE.BoxGeometry(w + .85, .14, .22, 12, 1, 1), w / 2 + .43, .1); shimaki.translate(0, h - .02, 0); parts.push(colored(shimaki, red));
  const kasagi = bend(new THREE.BoxGeometry(w + 1.15, .14, .3, 12, 1, 1), w / 2 + .58, .2); kasagi.translate(0, h + .12, 0); parts.push(colored(kasagi, '#cc341a'));
  const m = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; })); m.computeVertexNormals();
  return m;
}
function buildToriis(scene) {
  const n = Math.floor(land.length / 2.1) - 2;
  const im = new THREE.InstancedMesh(toriiGeo(), tag(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#5a1606', emissiveIntensity: .35 }), CLS.torii), n);
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const { p, yaw } = land.frame((i + 1.1) * 2.1 / land.length);
    o.position.set(p.x, pathY(p.x, p.z) - .02, p.z); o.rotation.set(0, yaw, 0); o.scale.setScalar(i === 0 ? 1.3 : 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
  }
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}
function buildSteps(scene) {
  const steps = Math.floor(land.length / .43);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1.85, .2, .4), tag(new THREE.MeshLambertMaterial({ map: tex('assets/tex/castle_wall_slates.jpg', .4, .2), color: '#d4ccc0' }), CLS.stair), steps);
  const o = new THREE.Object3D();
  for (let i = 0; i < steps; i++) { const { p, yaw } = land.frame((i + .5) / steps); o.position.set(p.x, pathY(p.x, p.z), p.z); o.rotation.set(0, yaw, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }
  im.receiveShadow = true; im.castShadow = true; scene.add(im);
}
function buildLanterns(scene) {
  const at = (geo, y) => { geo.translate(0, y, 0); geo.deleteAttribute('uv'); return geo.index ? geo.toNonIndexed() : geo; };
  const roof = new THREE.ConeGeometry(.34, .2, 4); roof.rotateY(Math.PI / 4);
  const stoneG = mergeGeometries([
    at(new THREE.CylinderGeometry(.2, .24, .12, 8), .06), at(new THREE.CylinderGeometry(.06, .08, .55, 8), .395),
    at(new THREE.BoxGeometry(.4, .08, .4), .71), at(roof, 1.1), at(new THREE.SphereGeometry(.06, 6, 4), 1.24),
  ]); stoneG.computeVertexNormals();
  const fireG = new THREE.BoxGeometry(.24, .22, .24); fireG.translate(0, .86, 0);
  const n = 16, stone = new THREE.InstancedMesh(stoneG, tag(new THREE.MeshLambertMaterial({ color: '#bdb6aa' }), CLS.stone), n);
  const fire = new THREE.InstancedMesh(fireG, tag(new THREE.MeshLambertMaterial({ color: '#f0c070', emissive: '#ff9a20', emissiveIntensity: .7 }), CLS.lantern), n);
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const { p, nx, nz } = land.frame(.06 + i / n * .88), s = i % 2 ? 1 : -1, x = p.x + nx * s * 2.2, z = p.z + nz * s * 2.2;
    o.position.set(x, H(x, z) + .02, z); o.rotation.y = rnd(); o.scale.setScalar(1.4); o.updateMatrix(); stone.setMatrixAt(i, o.matrix); fire.setMatrixAt(i, o.matrix);
  }
  for (const m of [stone, fire]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
}
function buildShrine(scene) {
  const grp = new THREE.Group(), y = H(SHRINE.x, SHRINE.z);
  const mat = (color, cls, extra = {}) => tag(new THREE.MeshLambertMaterial({ color, ...extra }), cls);
  const add = (geo, m, pos, rotX = 0) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(...pos); mesh.rotation.x = rotX; grp.add(mesh); };
  add(new THREE.BoxGeometry(4.6, .4, 3.8), mat('#b8b0a4', CLS.stone, { map: tex('assets/tex/castle_wall_slates.jpg', 1, 1) }), [0, .2, 0]);
  add(new THREE.BoxGeometry(3.2, 1.6, 2.4), mat('#7a4428', CLS.wood), [0, 1.2, 0]);
  const red = mat('#e2401c', CLS.torii, { emissive: '#5a1606', emissiveIntensity: .35 });
  for (const [px, pz] of [[-1.7, 1.35], [1.7, 1.35], [-1.7, -1.35], [1.7, -1.35]]) add(new THREE.CylinderGeometry(.1, .12, 2.1, 8), red, [px, 1.45, pz]);
  // gabled copper roof: two slabs meeting at a ridge, eaves overhanging the hall
  const roof = mat('#6f8f80', CLS.stone, { side: THREE.DoubleSide });
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(4.4, .12, 2.1), roof, [0, 2.85, s * .88], s * .5);
  add(new THREE.BoxGeometry(4.6, .18, .22), mat('#3c4a44', CLS.stone), [0, 3.32, 0]);
  grp.position.set(SHRINE.x, y - .06, SHRINE.z); grp.rotation.y = -.12;
  grp.traverse(o => { o.castShadow = true; o.receiveShadow = true; }); scene.add(grp);
}

const rules = /* glsl */`
  if(cls<1.5){        // grass
    gl = L<.1?${g('.')}:L<.17?${g(':')}:(w<-.2?${g('\\')}:w>.2?${g('/')}:${g('|')});
  } else if(cls<2.5){ // leaves
    gl = L<.12?${g('.')}:L<.24?${g(':')}:L<.38?${g('*')}:L<.5?${g('+')}:${g('o')};
  } else if(cls<3.5){ // flowers
    gl = L<.34?${g(':')}:L<.55?${g('*')}:L<.76?${g('%')}:${g('#')};
  } else if(cls<4.5){ // stone: lanterns, shrine base and roof
    gl = L<.22?${g(':')}:L<.42?${g('%')}:${g('#')};
    if(mag>.16) gl = edgeG;
  } else if(cls<5.5){ // stone steps
    gl = L<.12?${g(':')}:L<.24?${g('=')}:L<.5?${g('\u2014')}:${g('#')};
  } else if(cls<6.5){ // torii vermilion
    gl = L<.08?${g(':')}:L<.2?${g('=')}:${g('#')};
    if(mag>.2 && L>.08) gl = edgeG;
  } else if(cls<7.5){ // wood, trunks
    gl = L<.14?${g(':')}:(mag>.1?edgeG:(L<.34?${g('|')}:${g('#')}));
  } else if(cls<8.5){ // sand
    gl = L<.3?${g(':')}:L<.6?${g(';')}:${g('=')};
  } else if(cls<9.5){ // sea
    gl = L<.22?${g('-')}:L<.45?(w>0.?${g('~')}:${g('-')}):L<.72?${g('~')}:${g('=')};
  } else if(cls<10.5){ // foam
    gl = L<.6?${g('*')}:L<.82?${g('%')}:${g('#')};
  } else if(cls<11.5){ // fox
    gl = L<.4?${g('&')}:${g('$')};
  } else if(cls<12.5){ // lantern light
    gl = L<.35?${g(':')}:L<.6?${g('*')}:${g('#')};
  } else {            // rock
    gl = L<.12?${g('.')}:L<.26?${g(':')}:L<.42?${g('%')}:${g('#')};
    if(mag>.2) gl = edgeG;
  }`;

const blades = bladeWind({ amp: .16, lean: 0, gust: .45, flutter: .22, flutterRate: 1.2, rate: .55 });
// ---------- music: in-scale koto, wind chimes and surf ----------
// 2 : 3 : 5 over an 8 s cycle, in the Japanese in scale on D (D E♭ G A B♭). Waves break twice a
// cycle, the fūrin chime three times, the koto plucks five; a deep bonshō marks each cycle.
const MUSIC = {
  tonic: 146.83, cycle: 8, reverb: { seconds: 6, wet: .4, tone: .55 },
  voices: [
    { n: 2, inst: 'swell', freq: 900, gain: .09, rise: 1.6, fall: 3.4, accent: 1.1, wet: .2 },
    { n: 3, inst: 'bell', notes: [36, 43, 41], gain: .04, pan: -.42, prob: .7, decay: 2.2,
      partials: [[1, 1, 1], [2.42, .35, .5], [5.9, .15, .25]] },
    { n: 5, inst: 'pluck', notes: [12, 13, null, 17, 19, 20, null, 19, 17, 13], gain: .12, pan: .26, prob: .85,
      wave: 'triangle', bright: 12, damp: .12, decay: 2.2, bend: 1, bendProb: .2 },
    { n: 1, inst: 'bell', notes: [-12], gain: .16, decay: 9, attack: .03, beat: .7, accent: 1,
      partials: [[1, 1, 1], [2.71, .45, .7], [5.15, .2, .45], [8.43, .07, .25]] },
  ],
};

runDiorama({
  music: MUSIC,
  title: 'Torii', size: [1080, 1920], grid: [200, 178], sky: '#cfdcea',
  light: { sun: { color: '#ffe2b8', intensity: 3.5, position: [-30, 44, 20], target: [0, 4, -2] }, sky: ['#f0e0c8', '#6d6236', 1.1] },
  camera: { target: [0, 5.4, 3] },
  glyphs: { rules, saturation: 1.26, gain: 1.34, wind: { drift: [.18, .05] } },
  creature: { land, cls: CLS.fox, tint: [1.4, 1.15, .75], u: [.15, .85], speed: .78 },
  async build(scene) {
    scene.add(await terrainMesh(land, { textures: ['leafy_grass', 'coast_sand_01', 'aerial_rocks_02', 'castle_wall_slates'], paint }));
    scene.add(waterPlane(land, seaGLSL({ shallow: [.5, .8, .66], mid: [.02, .55, .58], deep: [.005, .15, .3] })));
    grass(scene, {
      cls: CLS.grass, rnd, H, count: 200000, area: [-24, 24, -34, 24], height: [.32, .3], wind: blades,
      accept: (x, z, y) => y >= 1.4 + fbm(x * .3, z * .3) * 1.4 && pathD(x, z) >= 1.5 && coastZ(x) - z >= 2,
      color(c, x, z, r) { const v = .55 + r() * .75, tone = fbm(x * .16 + 5, z * .16), dk = .55 + 1.1 * tone; c.setRGB((.1 * v + tone * .08) * dk, .42 * v * dk, .04 * v * dk); },
    });
    flowers(scene, {
      cls: CLS.flower, rnd, H, count: 85000, area: [-24, 24, -30, 24], wind: blades,
      accept: (x, z, y) => flowerField(x, z) >= .565 + rnd() * .05 && y >= 1.8 && pathD(x, z) >= 2 && coastZ(x) - z >= 2.4 && fbm(x * .9, z * .9) >= .47,
      color(c, r) { if (r() < .55) c.setRGB(1, .97, .94); else c.setRGB(.98, .7 + r() * .1, .8); },
    });
    buildTrees(scene);
    buildToriis(scene); buildSteps(scene); buildLanterns(scene); buildShrine(scene);
    rocks(scene, ROCKS, { cls: CLS.rock, rnd, y: (x, z, r) => r * .15, map: tex('assets/tex/aerial_rocks_02.jpg', 1.5, 1.5), color: [.72, .78, .86] });
    return drifters(scene, { // sakura petals
      count: 150, cls: CLS.flower, rnd, color: [1.5, .8, .92],
      place(s, t, d) {
        const x = -16 + fract(s[0] + t * (.018 + s[3] * .012)) * 32 + Math.sin(t * .6 + s[1] * 9) * .5, z = -22 + s[2] * 38;
        d.position.set(x, H(x, z) + 1.2 + s[1] * 5 + Math.sin(t * .9 + s[3] * 12) * .35, z);
        d.rotation.set(t + s[0] * 9, t * .7, s[1]); d.scale.setScalar(.8 + s[3] * .8);
      },
    });
  },
}).catch(e => console.error(e));
