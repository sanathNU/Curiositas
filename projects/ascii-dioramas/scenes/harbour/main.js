// Fishing harbour: a cliff path leading to a wooden pier over turquoise water, with moored boats.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  runDiorama, buildLand, terrainMesh, waterPlane, seaGLSL, grass, flowers, makeTrees, rocks, drifters,
  tag, tex, bladeWind, leafWind, g, sstep, fract, fbm, seeded,
} from '../../engine/index.js';

const CLS = { grass: 1, leaf: 2, flower: 3, stone: 4, stair: 5, pier: 6, wood: 7, sand: 8, water: 9, foam: 10, fox: 11, boat: 12, rock: 13 };
const PIER_Y = 2.2;
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
  path: [[8.5, -17], [6.4, -12.5], [3.4, -8.5], [1.4, -4.5], [.6, -.5], [-.6, 3], [-2, 7], [-2.8, 12], [-3, 17], [-2.5, 22]],
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
  if (pd < 1.45) { const c = pick(T.castle_wall_slates, x, z, 3); return [c[0] * .9, c[1] * .9, c[2] * .9, CLS.stair]; }
  if (y < 1.3 + n * 1.4 && d < 7) {
    if (y < .55 + n * .5 && d > -2.5 && n > .36) { const c = pick(T.coast_sand_01, x, z, 3.2); return [c[0] * 1.22, c[1] * 1.12, c[2] * .9, CLS.sand]; }
    const c = pick(T.aerial_rocks_02, x, z, 7); return [c[0] * .68, c[1] * .72, c[2] * .78, CLS.rock];
  }
  const c = pick(T.leafy_grass, x, z, 2.6), v = .62 + .95 * fbm(x * .16 + 5, z * .16);
  const r = c[0] * .78 * v, gr = c[1] * 1.1 * v, b = c[2] * .42 * v;
  return flowerField(x, z) > .575 ? [r * .85 + 40, gr * .85 + 40, b * .85 + 42, CLS.grass] : [r, gr, b, CLS.grass];
}

// ---------- trees ----------
function buildTrees(scene) {
  const T = makeTrees({ H, rnd }), spots = [];
  for (let guard = 0; spots.length < 96 && guard < 9000; guard++) {
    const x = -24 + rnd() * 48, z = -28 + rnd() * 27;
    if (pathD(x, z) < (z > -9 ? 6.5 : 3.6) || spots.some(s => (s.x - x) ** 2 + (s.z - z) ** 2 < 8)) continue;
    if (Math.abs(x + 2) < 3 && z > 4 && z < 10) continue; // keep the pier entrance clear
    spots.push({ x, z, s: .85 + rnd() * .55, kind: rnd() < .15 ? 'gold' : rnd() < .4 ? 'gold' : 'green' });
  }
  for (const [x, z, s, kind] of [[-13, -9, 1.1, 'green'], [-11.5, -2.5, .9, 'green'], [12.5, -9, 1.15, 'gold'], [13.5, -3, 1, 'green'], [-14, 4, 1, 'green'], [13, 3, .85, 'green'], [-9.5, -13.5, 1.05, 'green'], [-12.5, -7, 1.15, 'gold'], [10.5, -7.5, 1, 'green'], [12, -12.5, 1.1, 'gold'], [-1, -16, .9, 'green'], [9.5, 8.5, .8, 'green']]) spots.push({ x, z, s, kind });
  const pal = {
    gold: [[.98, .68, .1], [.86, .52, .05], [1, .78, .2], [.7, .55, .1], [.6, .5, .14]],
    green: [[.2, .42, .1], [.3, .5, .12], [.14, .3, .09], [.45, .55, .15]],
  };
  for (const t of spots) T.canopy(t, pal[t.kind]);
  T.finish(scene, { leafCls: CLS.leaf, woodCls: CLS.wood, wind: leafWind({ rate: 2.1, bob: .035, sway: .06, swayRate: .8 }), barkTex: tex('assets/tex/bark_brown_02.jpg', 1, 2) });
}

// ---------- pier, bollards, boats ----------
const onPier = (s) => s && s.z >= coastZ(s.x) - 1;
function buildPier(scene) {
  const plankTex = tex('assets/tex/weathered_planks.jpg', 2, 1), o = new THREE.Object3D(), steps = Math.floor(land.length / .43);
  const landSteps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.75, .2, .4), tag(new THREE.MeshLambertMaterial({ map: tex('assets/tex/castle_wall_slates.jpg', .4, .2), color: '#cfcac4' }), CLS.stair), steps);
  const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, .16, .42), tag(new THREE.MeshLambertMaterial({ map: plankTex, color: '#b09a82' }), CLS.pier), steps);
  let li = 0, pi = 0;
  for (let i = 0; i < steps; i++) {
    const { p, yaw } = land.frame((i + .5) / steps), y = pathY(p.x, p.z);
    o.rotation.set(0, yaw, 0);
    if (p.z < coastZ(p.x) - 2) { o.position.set(p.x, y, p.z); o.updateMatrix(); landSteps.setMatrixAt(li++, o.matrix); }
    else { o.position.set(p.x, Math.max(y, PIER_Y), p.z); o.updateMatrix(); planks.setMatrixAt(pi++, o.matrix); }
  }
  landSteps.count = li; planks.count = pi;
  for (const m of [landSteps, planks]) { m.receiveShadow = true; m.castShadow = true; scene.add(m); }

  const posts = [], rails = [], S = land.pathS;
  for (let i = 0; i < S.length; i += 10) {
    const s = S[i]; if (!onPier(s)) continue;
    for (const side of [-1, 1]) { const pg = new THREE.CylinderGeometry(.09, .13, PIER_Y + 1.6, 7); pg.translate(s.x + side * 1.15, (PIER_Y + 1.6) / 2 - 1, s.z); posts.push(pg); }
    const next = S[Math.min(i + 10, S.length - 1)];
    if (!onPier(next)) continue;
    const dx = next.x - s.x, dz = next.z - s.z, len = Math.hypot(dx, dz);
    if (len < .1) continue;
    for (const side of [-1, 1]) {
      const rg = new THREE.CylinderGeometry(.035, .035, len, 5); rg.rotateZ(Math.PI / 2);
      rg.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(dx, dz)).setPosition((s.x + next.x) / 2 + side * 1.15, PIER_Y + .9, (s.z + next.z) / 2));
      rails.push(rg);
    }
  }
  for (const [parts, color, shadow] of [[posts, '#7a6a55', true], [rails, '#8a7a65', false]]) {
    if (!parts.length) continue;
    const mg = mergeGeometries(parts); mg.computeVertexNormals();
    const mesh = new THREE.Mesh(mg, tag(new THREE.MeshLambertMaterial({ map: plankTex, color }), CLS.pier));
    mesh.castShadow = true; mesh.receiveShadow = shadow; scene.add(mesh);
  }
}
function buildBollards(scene) {
  const post = new THREE.CylinderGeometry(.16, .2, .75, 8); post.translate(0, .38, 0);
  const cap = new THREE.SphereGeometry(.18, 8, 6); cap.translate(0, .78, 0);
  const bg = mergeGeometries([post, cap].map(p => { p.deleteAttribute('uv'); return p.toNonIndexed(); })); bg.computeVertexNormals();
  const n = 10, im = new THREE.InstancedMesh(bg, tag(new THREE.MeshLambertMaterial({ color: '#c8bfb0' }), CLS.stone), n), o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const { p, nx, nz } = land.frame(.42 + i / n * .52), s = i % 2 ? 1 : -1, x = p.x + nx * s * 1.7, z = p.z + nz * s * 1.7;
    o.position.set(x, Math.max(H(x, z), PIER_Y) - .02, z); o.rotation.y = rnd(); o.scale.setScalar(1.1); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
  }
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}
function buildBoats(scene) {
  const wood = tag(new THREE.MeshLambertMaterial({ map: tex('assets/tex/weathered_planks.jpg', 1.5, 1), color: '#a4593a' }), CLS.wood);
  const hull = (color) => tag(new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }), CLS.boat);
  const blue = hull('#2266aa'), red = hull('#cc3322');
  for (const [bx, bz, rot, mat] of [[-5, 17.5, .4, blue], [-1.2, 20, -.6, red], [-6.2, 14.5, .9, blue]]) {
    const grp = new THREE.Group(), hg = new THREE.BoxGeometry(1.3, .5, 3, 6, 1, 10), p = hg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setX(i, p.getX(i) * (1 - Math.pow(Math.abs(p.getZ(i)) / 1.5, 2.2) * .45));
      if (p.getY(i) < 0) p.setX(i, p.getX(i) * .7);
    }
    hg.computeVertexNormals();
    const hm = new THREE.Mesh(hg, mat); hm.position.y = .32; grp.add(hm);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, 2.6, 6), wood); mast.position.y = 1.6; grp.add(mast);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.5, 5), wood); boom.rotation.z = .55; boom.position.set(.35, 1.7, 0); grp.add(boom);
    grp.position.set(bx, .12, bz); grp.rotation.y = rot;
    grp.traverse(o => { o.castShadow = true; o.receiveShadow = true; }); scene.add(grp);
  }
}

const rules = /* glsl */`
  if(cls<1.5){        // grass
    gl = L<.1?${g('.')}:L<.17?${g(':')}:(w<-.2?${g('\\')}:w>.2?${g('/')}:${g('|')});
  } else if(cls<2.5){ // leaves
    gl = L<.12?${g('.')}:L<.24?${g(':')}:L<.38?${g('*')}:L<.5?${g('+')}:${g('o')};
  } else if(cls<3.5){ // flowers
    gl = L<.34?${g(':')}:L<.55?${g('*')}:L<.76?${g('%')}:${g('#')};
  } else if(cls<4.5){ // stone bollards
    gl = L<.22?${g(':')}:L<.42?${g('%')}:${g('#')};
    if(mag>.16) gl = edgeG;
  } else if(cls<5.5){ // stairs
    gl = L<.12?${g(':')}:L<.24?${g('=')}:L<.5?${g('\u2014')}:${g('#')};
  } else if(cls<6.5){ // pier planks and posts
    gl = L<.14?${g(':')}:L<.3?${g('=')}:L<.55?${g('|')}:${g('#')};
    if(mag>.18) gl = edgeG;
  } else if(cls<7.5){ // wood, trunks, masts
    gl = L<.14?${g(':')}:(mag>.1?edgeG:(L<.34?${g('|')}:${g('#')}));
  } else if(cls<8.5){ // sand
    gl = L<.3?${g(':')}:L<.6?${g(';')}:${g('=')};
  } else if(cls<9.5){ // water
    gl = L<.22?${g('-')}:L<.45?(w>0.?${g('~')}:${g('-')}):L<.72?${g('~')}:${g('=')};
  } else if(cls<10.5){ // foam
    gl = L<.6?${g('*')}:L<.82?${g('%')}:${g('#')};
  } else if(cls<11.5){ // fox
    gl = L<.4?${g('&')}:${g('$')};
  } else if(cls<12.5){ // boat hulls
    gl = L<.2?${g(':')}:L<.4?${g('=')}:${g('\u2014')};
    if(mag>.22) gl = edgeG;
  } else {            // rock
    gl = L<.12?${g('.')}:L<.26?${g(':')}:L<.42?${g('%')}:${g('#')};
    if(mag>.2) gl = edgeG;
  }`;

const blades = bladeWind({ amp: .22, lean: 0, gust: .6, flutter: .28, flutterRate: 1.6, rate: .75 });
runDiorama({
  title: 'Harbour', size: [1440, 1440], grid: [200, 100],
  light: { sun: { color: '#ffe7c4', intensity: 3.3, position: [-30, 44, 20], target: [0, 4, -2] }, sky: ['#efe6d8', '#6d6236', 1] },
  camera: { target: [-1, 4.8, 5] },
  glyphs: { rules, saturation: 1.22, gain: 1.32, wind: { drift: [.28, .07] } },
  tilt: { focus: .42 },
  creature: { land, cls: CLS.fox, tint: [1.4, 1.15, .75], u: [.15, .85], speed: .78, y: (x, z) => Math.max(pathY(x, z), PIER_Y) },
  async build(scene) {
    scene.add(await terrainMesh(land, { textures: ['leafy_grass', 'coast_sand_01', 'aerial_rocks_02', 'castle_wall_slates'], paint }));
    scene.add(waterPlane(land, seaGLSL({ shallow: [.62, .86, .68], mid: [.03, .62, .62], deep: [.006, .17, .32], foam: [1.1, 1.12, 1.08], speed: 1.25, caustic: [.25, .42, .4], sparkle: [.5, .55, .5] })));
    grass(scene, {
      cls: CLS.grass, rnd, H, count: 170000, area: [-24, 24, -34, 24], guard: 5e6, height: [.32, .3], wind: blades,
      accept: (x, z, y) => y >= 1.4 + fbm(x * .3, z * .3) * 1.4 && pathD(x, z) >= 1.5 && coastZ(x) - z >= 2,
      color(c, x, z, r) { const v = .55 + r() * .75, tone = fbm(x * .16 + 5, z * .16), dk = .55 + 1.1 * tone; c.setRGB((.13 * v + tone * .1) * dk, .4 * v * dk, .05 * v * dk); },
    });
    flowers(scene, {
      cls: CLS.flower, rnd, H, count: 70000, area: [-24, 24, -30, 24], wind: blades,
      accept: (x, z, y) => flowerField(x, z) >= .565 + rnd() * .05 && y >= 1.8 && pathD(x, z) >= 2 && coastZ(x) - z >= 2.4 && fbm(x * .9, z * .9) >= .47,
      color(c, r) { const k = r(); c.setRGB(.74 + k * .05, k < .35 ? .48 : .7, k < .35 ? .56 : .68); },
    });
    buildTrees(scene);
    buildPier(scene); buildBollards(scene); buildBoats(scene);
    rocks(scene, ROCKS, { cls: CLS.rock, rnd, y: (x, z, r) => r * .15, map: tex('assets/tex/aerial_rocks_02.jpg', 1.5, 1.5), color: [.72, .78, .86] });
    return drifters(scene, {
      count: 150, cls: CLS.flower, rnd, color: [1.4, 1.4, 1.35],
      place(s, t, d) {
        const x = -16 + fract(s[0] + t * (.018 + s[3] * .012)) * 32 + Math.sin(t * .6 + s[1] * 9) * .5, z = -22 + s[2] * 38;
        d.position.set(x, H(x, z) + 1.2 + s[1] * 5 + Math.sin(t * .9 + s[3] * 12) * .35, z);
        d.rotation.set(t + s[0] * 9, t * .7, s[1]); d.scale.setScalar(.8 + s[3] * .8);
      },
    });
  },
}).catch(e => console.error(e));
