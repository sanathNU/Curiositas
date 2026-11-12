// Mangroves at dusk: a lantern-lit boardwalk winds through a dense mangrove swamp to a stilt hut.
// Low warm sun, dark teal water carrying lantern reflections, trees on cages of arching prop roots,
// lily pads, fireflies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  runDiorama, buildLand, terrainMesh, waterPlane, grass, makeTrees, drifters,
  tag, tex, bladeWind, leafWind, g, glf, fbm, seeded,
} from '../../engine/index.js';

const CLS = { grass: 1, leaf: 2, lily: 3, hut: 4, plank: 5, thatch: 6, wood: 7, mud: 8, water: 9, glint: 10, fox: 11, glow: 12, root: 13 };
const DECK_Y = .75;
const rnd = seeded(11);

// ---------- layout: trail, hut spur, lanterns and trees are placed before the land is baked ----------
const PATH = [[9.5, -19], [6.6, -13], [4.6, -7.5], [2.2, -2.4], [-.8, 2.6], [-3.4, 7.6], [-5.4, 12.6], [-7.2, 18.5]];
const curve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', .5);
const trailPts = curve.getSpacedPoints(160);
const frameAt = (u) => { const p = curve.getPointAt(u), t = curve.getTangentAt(u); return { p, t, nx: -t.z, nz: t.x }; };
const distTo = (pts, x, z) => Math.sqrt(Math.min(...pts.map(p => (p.x - x) ** 2 + (p.z - z) ** 2)));

// the hut sits off the trail toward the frame's centre (-x), at the end of a short spur
const SPUR_U = .3, spurF = frameAt(SPUR_U), SPUR_SIDE = spurF.nx < 0 ? 1 : -1;
const spurDir = { x: spurF.nx * SPUR_SIDE, z: spurF.nz * SPUR_SIDE };
const HUT = { x: spurF.p.x + spurDir.x * 5.6, z: spurF.p.z + spurDir.z * 5.6, yaw: Math.atan2(spurDir.x, spurDir.z) };
const spurPts = Array.from({ length: 12 }, (_, i) => new THREE.Vector3(spurF.p.x + spurDir.x * i * .45, 0, spurF.p.z + spurDir.z * i * .45));

// lanterns every ~3.4 units, alternating sides; their positions also drive the water reflections
const LANTERNS = [];
{
  const n = Math.floor(curve.getLength() / 3.4);
  for (let i = 0; i < n; i++) {
    const { p, nx, nz } = frameAt(.05 + i / n * .9), s = i % 2 ? 1 : -1;
    LANTERNS.push([p.x + nx * s * .95, p.z + nz * s * .95]);
  }
  LANTERNS.push([HUT.x - spurDir.x * 1.9 + spurDir.z * 1.1, HUT.z - spurDir.z * 1.9 - spurDir.x * 1.1]);
}

const TREES = [];
for (let guard = 0; TREES.length < 58 && guard < 9000; guard++) {
  const x = -17 + rnd() * 34, z = -32 + rnd() * 56, s = .95 + rnd() * .75;
  if (distTo(trailPts, x, z) < 3 + s * 1.5 || distTo(spurPts, x, z) < 2.6 + s * 1.4) continue;
  if ((x - HUT.x) ** 2 + (z - HUT.z) ** 2 < (4.4 + s * 1.8) ** 2) continue;
  if (fbm(x * .09 + 4, z * .09) < .32) continue; // leave open channels of water
  if (TREES.some(([tx, tz, ts]) => (tx - x) ** 2 + (tz - z) ** 2 < (1.65 * (s + ts)) ** 2)) continue;
  TREES.push([x, z, s]);
}

const land = buildLand({
  path: PATH,
  rawH(x, z) {
    let y = -1 + (fbm(x * .07, z * .07) - .5) * .8;
    for (const [tx, tz, s] of TREES) { const q = ((x - tx) ** 2 + (z - tz) ** 2) / (1.9 * s) ** 2; if (q < 1) y = Math.max(y, .1 + .18 * s + (fbm(x * .8, z * .8) - .5) * .2 - q * (1.1 + .2 * s)); }
    return y;
  },
});
const { H } = land;

function paint(x, z, y, pd, T, pick) {
  if (y < -.04) return [10, 40, 36, CLS.water];
  const l = pick(T.coast_sand_01, x, z, 2.2).reduce((a, b) => a + b) / 3;
  if (fbm(x * .9 + 2, z * .9) > .52) return [l * .2 + 8, l * .3 + 12, l * .12 + 4, CLS.grass]; // moss
  return [l * .32 + 10, l * .24 + 8, l * .16 + 5, CLS.mud];
}

// Dark teal swamp water: slow colour drift, faint ripple sheen, and each lantern's reflection
// smeared toward the camera (+z) with a flicker. Reflections become class 10.
const lagoonGLSL = /* glsl */`
  vec2 p = vW.xz;
  float dd = max(d,0.);
  float n = fbm(p*.18+vec2(uT*.02,uT*.015));
  c = mix(vec3(.012,.1,.09),vec3(.035,.2,.17),smoothstep(.3,.75,n));
  c += vec3(.025,.055,.045)*smoothstep(.55,.92,vn(p*vec2(1.4,.6)+vec2(0.,uT*.25)));
  float glow = 0.;
  ${LANTERNS.map(([x, z]) => `glow += exp(-pow((p.x-(${glf(x)}))/.34,2.)-pow((p.y-(${glf(z)})-1.1)/1.6,2.));`).join('\n  ')}
  glow *= .6+.4*vn(p*vec2(3.,1.)+vec2(0.,uT*1.2));
  c += vec3(.9,.42,.1)*glow*.85;
  float rim = smoothstep(.28,0.,dd)*smoothstep(.45,.72,fbm(p*1.6+uT*.1));
  c = mix(c,vec3(.16,.26,.2),rim*.55);
  cls = glow>.22 ? 10. : 9.;`;

// ---------- mangroves ----------
function buildMangroves(scene) {
  const T = makeTrees({ H, rnd }), roots = [];
  const pal = [[.025, .14, .05], [.05, .22, .07], [.09, .32, .09], [.16, .44, .11], [.3, .56, .13]];
  const tube = (pts, r, seg = 10) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 5, false);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const [tx, tz, s] of TREES) {
    const knee = (1.1 + rnd() * .4) * s, H0 = (3.2 + rnd() * 2.4) * s, lean = (rnd() - .5) * .6, tint = .85 + rnd() * .3;
    const top = V(tx + lean, H0, tz + (rnd() - .5) * .5);
    T.trunks.push(tube([V(tx, knee * .5, tz), V(tx + lean * .3, (knee + H0) * .5, tz), top], .17 * s));
    // a cage of prop roots arching from the lower trunk into the water, with drop roots off the arches
    for (let i = 0, n = 15 + (rnd() * 8 | 0); i < n; i++) {
      const a = i / n * 6.283 + rnd() * .35, reach = (1.2 + rnd() * 1.4) * s, h0 = knee * (.5 + rnd() * .65);
      const ca = Math.cos(a), sa = Math.sin(a), ex = tx + ca * reach, ez = tz + sa * reach;
      const mid = V(tx + ca * reach * .45, h0 + (.3 + rnd() * .35) * s, tz + sa * reach * .45);
      roots.push(tube([V(tx + ca * .1 * s, h0, tz + sa * .1 * s), mid, V(ex, Math.min(H(ex, ez), 0) - .3, ez)], (.05 + rnd() * .035) * s));
      if (rnd() < .5) {
        const b = a + (rnd() - .5) * .9, r2 = reach * (.55 + rnd() * .4), bx = tx + Math.cos(b) * r2, bz = tz + Math.sin(b) * r2;
        const end = V(bx, Math.min(H(bx, bz), 0) - .3, bz);
        roots.push(tube([mid.clone(), mid.clone().lerp(end, .5).setY(mid.y * .7), end], .035 * s, 6));
      }
    }
    // limbs fan out from the top; each carries two or three heavy crown lobes, lighter on top
    for (let l = 0, limbs = 4 + (rnd() * 3 | 0); l < limbs; l++) {
      const a = l / limbs * 6.283 + rnd() * .7, r = (1 + rnd() * 1.1) * s;
      const end = V(top.x + Math.cos(a) * r, top.y + (.5 + rnd() * .9) * s, top.z + Math.sin(a) * r);
      T.trunks.push(tube([top.clone().setY(top.y - .6 * s), top.clone().lerp(end, .5).setY(top.y + .25 * s), end], .075 * s, 6));
      for (let k = 0, lobes = 2 + (rnd() * 2 | 0); k < lobes; k++) {
        const lx = end.x + (rnd() - .5) * 1.2 * s, lz = end.z + (rnd() - .5) * 1.2 * s, ly = end.y + (rnd() - .2) * .7 * s, lr = (.8 + rnd() * .5) * s;
        for (let i = 0; i < 115; i++) {
          const u = rnd() * 2 - 1, th = rnd() * 6.28, q = Math.sqrt(1 - u * u), rr = lr * Math.cbrt(rnd());
          const p = pal[Math.min(pal.length - 1, ((u * .5 + .5) * pal.length + rnd() * 1.6 - .8) | 0)] ?? pal[0], lit = (.75 + .5 * (u * .5 + .5)) * tint;
          T.leaves.push(lx + q * Math.cos(th) * rr, ly + u * rr * .7, lz + q * Math.sin(th) * rr, p[0] * lit, p[1] * lit, p[2] * lit);
        }
      }
    }
  }
  T.finish(scene, { leafCls: CLS.leaf, woodCls: CLS.wood, wind: leafWind({ rate: 1.1, bob: .025, sway: .04, swayRate: .45 }), barkColor: '#5a3a22', leafSize: [.34, .28] });
  const rm = new THREE.Mesh(mergeGeometries(roots), tag(new THREE.MeshLambertMaterial({ color: '#86512a' }), CLS.root));
  rm.castShadow = true; rm.receiveShadow = true; scene.add(rm);
}

// ---------- boardwalk, rope railings, lanterns, hut, boat ----------
const ropeBetween = (a, b, out) => out.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, a.clone().lerp(b, .5).setY((a.y + b.y) / 2 - .13), b]), 6, .022, 4, false));
function buildBoardwalk(scene) {
  const o = new THREE.Object3D(), c = new THREE.Color(), len = land.length;
  const steps = Math.floor(len / .4), spurSteps = 11;
  const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, .1, .36), tag(new THREE.MeshLambertMaterial(), CLS.plank), steps + spurSteps);
  const tone = () => { const v = .75 + rnd() * .45; return c.setRGB(.56 * v, .34 * v, .18 * v); };
  for (let i = 0; i < steps; i++) {
    const { p, yaw } = land.frame((i + .5) / steps);
    o.position.set(p.x, DECK_Y + (rnd() - .5) * .03, p.z); o.rotation.set((rnd() - .5) * .04, yaw + (rnd() - .5) * .05, 0); o.updateMatrix();
    planks.setMatrixAt(i, o.matrix); planks.setColorAt(i, tone());
  }
  for (let i = 0; i < spurSteps; i++) {
    const d = 1 + i * .4;
    o.position.set(spurF.p.x + spurDir.x * d, DECK_Y, spurF.p.z + spurDir.z * d); o.rotation.set(0, HUT.yaw, 0); o.scale.set(.8, 1, 1); o.updateMatrix();
    planks.setMatrixAt(steps + i, o.matrix); planks.setColorAt(steps + i, tone());
  }
  planks.castShadow = true; planks.receiveShadow = true; scene.add(planks);

  const posts = [], ropes = [];
  const post = (x, z, top) => { const pg = new THREE.CylinderGeometry(.07, .09, top + 1.4, 6); pg.translate(x, top - (top + 1.4) / 2, z); posts.push(pg); return new THREE.Vector3(x, top - .06, z); };
  for (const s of [-1, 1]) {
    let prev = null;
    for (let u = .01; u < 1; u += 1.45 / len) {
      const { p, nx, nz } = land.frame(u), x = p.x + nx * s * .86, z = p.z + nz * s * .86;
      if (s === SPUR_SIDE && Math.abs(u - SPUR_U) < .04) { prev = null; continue; } // gap where the spur joins
      const top = post(x, z, DECK_Y + .72);
      if (prev) ropeBetween(prev, top, ropes);
      prev = top;
    }
  }
  const pm = new THREE.Mesh(mergeGeometries(posts), tag(new THREE.MeshLambertMaterial({ color: '#5a3a22' }), CLS.wood)); pm.castShadow = true; scene.add(pm);
  const rp = new THREE.Mesh(mergeGeometries(ropes), tag(new THREE.MeshLambertMaterial({ color: '#c9a36a' }), CLS.wood)); scene.add(rp);
}
function buildLanterns(scene) {
  const poles = [], caps = [], lamps = [];
  for (const [x, z] of LANTERNS) {
    const pg = new THREE.CylinderGeometry(.06, .08, DECK_Y + 2.9, 6); pg.translate(x, (DECK_Y + 1.5) - (DECK_Y + 2.9) / 2, z); poles.push(pg);
    const lg = new THREE.BoxGeometry(.24, .3, .24); lg.translate(x, DECK_Y + 1.68, z); lamps.push(lg);
    const cg = new THREE.ConeGeometry(.22, .16, 4); cg.rotateY(Math.PI / 4); cg.translate(x, DECK_Y + 1.91, z); caps.push(cg);
    const light = new THREE.PointLight('#ffae4a', 9, 7.5, 2); light.position.set(x, DECK_Y + 1.7, z); scene.add(light);
  }
  const wood = tag(new THREE.MeshLambertMaterial({ color: '#4a2e1a' }), CLS.wood);
  const pm = new THREE.Mesh(mergeGeometries([...poles, ...caps.map(c => c.toNonIndexed())].map(g => (g.index ? g.toNonIndexed() : g))), wood); pm.castShadow = true; scene.add(pm);
  scene.add(new THREE.Mesh(mergeGeometries(lamps), tag(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.35, .45) }), CLS.glow)));
}
function buildHut(scene) {
  const grp = new THREE.Group(), add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; grp.add(m); return m; };
  const deck = tag(new THREE.MeshLambertMaterial({ color: '#a06a3c' }), CLS.plank), walls = tag(new THREE.MeshLambertMaterial({ map: tex('assets/tex/weathered_planks.jpg', 1.5, 1), color: new THREE.Color(1.6, 1.12, .72) }), CLS.hut);
  const thatch = tag(new THREE.MeshLambertMaterial({ color: '#e8c47c', side: THREE.DoubleSide }), CLS.thatch);
  const glow = tag(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.3, .45) }), CLS.glow), dark = tag(new THREE.MeshLambertMaterial({ color: '#2a1a10' }), CLS.wood);
  add(new THREE.BoxGeometry(4, .14, 3.6), deck, 0, DECK_Y, 0);
  for (const [px, pz] of [[-1.8, -1.6], [1.8, -1.6], [-1.8, 1.6], [1.8, 1.6], [0, 1.6], [0, -1.6]]) add(new THREE.CylinderGeometry(.1, .12, 2.4, 6), dark, px, DECK_Y - 1.2, pz);
  add(new THREE.BoxGeometry(2.8, 1.5, 2.3), walls, 0, DECK_Y + .82, -.2);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(3.5, .14, 1.85), thatch, 0, DECK_Y + 2.12, -.2 + s * .78, s * .62);
  add(new THREE.BoxGeometry(3.6, .2, .26), thatch, 0, DECK_Y + 2.62, -.2);
  for (const wx of [-.75, .75]) add(new THREE.BoxGeometry(.5, .42, .06), glow, wx, DECK_Y + 1, .97);
  add(new THREE.BoxGeometry(.06, .4, .5), glow, 1.42, DECK_Y + 1, -.3);
  add(new THREE.BoxGeometry(.5, .9, .06), dark, 0, DECK_Y + .55, .97);
  grp.position.set(HUT.x, 0, HUT.z); grp.rotation.y = HUT.yaw + Math.PI;
  grp.traverse(m => { m.castShadow = true; m.receiveShadow = true; }); scene.add(grp);
  const light = new THREE.PointLight('#ffa040', 12, 8, 2); light.position.set(HUT.x - spurDir.x * 1.6, DECK_Y + 1.1, HUT.z - spurDir.z * 1.6); scene.add(light);
}
function buildBoat(scene) {
  const grp = new THREE.Group(), wood = tag(new THREE.MeshLambertMaterial({ map: tex('assets/tex/weathered_planks.jpg', 1.5, 1), color: '#8a5a34' }), CLS.wood);
  const hg = new THREE.BoxGeometry(1.1, .4, 2.8, 6, 1, 10), pos = hg.attributes.position;
  for (let i = 0; i < pos.count; i++) { pos.setX(i, pos.getX(i) * (1 - Math.pow(Math.abs(pos.getZ(i)) / 1.4, 2.2) * .55)); if (pos.getY(i) < 0) pos.setX(i, pos.getX(i) * .7); }
  hg.computeVertexNormals();
  const hull = new THREE.Mesh(hg, tag(new THREE.MeshLambertMaterial({ color: '#6a4026', side: THREE.DoubleSide }), CLS.wood)); hull.position.y = .14; grp.add(hull);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(.8, .05, .22), wood); seat.position.set(0, .34, .2); grp.add(seat);
  const oar = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 2, 4), wood); oar.rotation.set(0, 0, Math.PI / 2 - .25); oar.position.set(.2, .38, -.3); grp.add(oar);
  grp.position.set(HUT.x + spurDir.z * 2.6 - spurDir.x * .6, .02, HUT.z - spurDir.x * 2.6 - spurDir.z * .6); grp.rotation.y = HUT.yaw + .35;
  grp.traverse(m => { m.castShadow = true; m.receiveShadow = true; }); scene.add(grp);
}
function buildLilies(scene) {
  const pad = new THREE.CircleGeometry(.24, 12, .35, 5.8); pad.rotateX(-Math.PI / 2);
  const N = 900, im = new THREE.InstancedMesh(pad, tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), CLS.lily, leafWind({ rate: .8, bob: .008, sway: .015, swayRate: .3 })), N);
  const o = new THREE.Object3D(), c = new THREE.Color(), at = [];
  let i = 0;
  for (let guard = 0; i < N && guard < 60000; guard++) {
    const x = -16 + rnd() * 32, z = -26 + rnd() * 48;
    if (H(x, z) > -.15 || distTo(trailPts, x, z) < 1.3 || fbm(x * .3 + 7, z * .3) < .54) continue;
    o.position.set(x, .015, z); o.rotation.y = rnd() * 6.28; o.scale.setScalar(.7 + rnd() * .8); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    const v = .6 + rnd() * .6; im.setColorAt(i++, c.setRGB(.12 * v, .32 * v, .08 * v)); at.push([x, z]);
  }
  im.count = i; im.receiveShadow = true; scene.add(im);
  const bloom = new THREE.PlaneGeometry(.14, .14); bloom.rotateX(-Math.PI / 2 + .3);
  const B = 90, bm = new THREE.InstancedMesh(bloom, tag(new THREE.MeshLambertMaterial({ color: '#f4a0c0', emissive: '#4a1a2a', side: THREE.DoubleSide }), CLS.lily), B);
  for (let k = 0; k < B; k++) { const [x, z] = at[(rnd() * at.length) | 0]; o.position.set(x + .05, .07, z); o.rotation.y = rnd() * 6; o.scale.setScalar(1); o.updateMatrix(); bm.setMatrixAt(k, o.matrix); }
  scene.add(bm);
}

const rules = /* glsl */`
  if(cls<1.5){        // moss and sedge on the mud mounds
    gl = L<.08?${g('.')}:L<.15?${g(':')}:(w<-.2?${g('\\')}:w>.2?${g('/')}:${g('|')});
  } else if(cls<2.5){ // crowns: dark undersides to bright lumpy tops
    gl = L<.05?${g('.')}:L<.1?${g(':')}:L<.17?${g('*')}:L<.26?${g('+')}:L<.38?${g('o')}:${g('8')};
  } else if(cls<3.5){ // lily pads, blossoms
    gl = L<.15?${g(':')}:L<.35?${g('o')}:L<.55?${g('%')}:${g('*')};
  } else if(cls<4.5){ // hut walls
    gl = L<.12?${g(':')}:L<.3?${g('|')}:${g('#')};
    if(mag>.14) gl = edgeG;
  } else if(cls<5.5){ // boardwalk planks
    gl = L<.12?${g(':')}:L<.26?${g('=')}:L<.5?${g('\u2014')}:${g('#')};
  } else if(cls<6.5){ // thatch
    gl = mag>.08?edgeG:(L<.3?${g(';')}:${g('%')});
  } else if(cls<7.5){ // trunks, limbs, posts, rope, boat
    gl = L<.14?${g(':')}:(mag>.1?edgeG:(L<.34?${g('|')}:${g('#')}));
  } else if(cls<8.5){ // mud
    gl = L<.1?${g('.')}:L<.2?${g(':')}:${g(';')};
  } else if(cls<9.5){ // dark water
    gl = L<.05?${g('.')}:L<.11?${g('-')}:(w>.2?${g('~')}:${g('=')});
  } else if(cls<10.5){ // lantern reflections
    gl = L<.4?${g('~')}:L<.7?${g('=')}:${g('\u2014')};
  } else if(cls<11.5){ // fox
    gl = L<.4?${g('&')}:${g('$')};
  } else if(cls<12.5){ // lantern light, windows, fireflies
    gl = L<.4?${g('*')}:L<.7?${g('o')}:${g('#')};
  } else {            // prop roots: tangles of edge strokes
    gl = mag>.04?edgeG:(L<.06?${g('.')}:L<.14?${g(':')}:${g('%')});
  }`;

runDiorama({
  title: 'Mangroves', size: [1080, 1920], grid: [200, 178],
  light: { sun: { color: '#ffc68c', intensity: 3, position: [-36, 24, 18], target: [0, 0, -2] }, sky: ['#5f8f86', '#17201a', 1.05], shadowFar: 150 },
  camera: { target: [1.5, 1, -5], elevation: 48 },
  glyphs: { rules, saturation: 1.45, gain: 1.75, bg: .26, bgByClass: { 12: .5, 10: .45, 9: .32 }, wind: { drift: [.15, .04] } },
  creature: { land, cls: CLS.fox, tint: [1.3, 1.05, .75], u: [.3, .9], speed: .5, y: () => DECK_Y + .02 },
  async build(scene) {
    scene.add(await terrainMesh(land, { textures: ['coast_sand_01'], paint }), waterPlane(land, lagoonGLSL));
    grass(scene, {
      cls: CLS.grass, rnd, H, count: 14000, area: [-17, 17, -30, 22], height: [.16, .18],
      wind: bladeWind({ amp: .14, lean: .05, gust: .3, flutter: .18, flutterRate: 1.2, rate: .5 }),
      accept: (x, z, y) => y > .08 && land.pathD(x, z) > 1.3,
      color(c, x, z, r) { const v = .5 + r() * .6; c.setRGB(.14 * v, .3 * v, .06 * v); },
    });
    buildMangroves(scene); buildBoardwalk(scene); buildLanterns(scene); buildHut(scene); buildBoat(scene); buildLilies(scene);
    const fly = Array.from({ length: 140 }, () => [-15 + rnd() * 30, -24 + rnd() * 44, .8 + rnd() * 3.5]);
    return drifters(scene, { // fireflies wandering among the roots and crowns
      count: fly.length, cls: CLS.glow, rnd, color: [1.9, 1.75, .6], geometry: new THREE.PlaneGeometry(.07, .07).rotateX(-Math.PI / 2),
      place(s, t, d) {
        const [x, z, y] = fly[Math.floor(s[0] * fly.length)], a = t * (.3 + s[1] * .4) + s[2] * 6.28;
        d.position.set(x + Math.cos(a) * .6, y + Math.sin(t * .8 + s[3] * 9) * .3, z + Math.sin(a * 1.3) * .6);
        d.scale.setScalar(.6 + .7 * (Math.sin(t * 2.3 + s[3] * 20) * .5 + .5));
      },
    });
  },
}).catch(e => console.error(e));
