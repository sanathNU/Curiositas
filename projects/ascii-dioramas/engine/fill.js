// Dense fill: instanced grass, flower cards, tree crowns, rocks and drifting particles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, fbm } from './noise.js';
import { tag } from './materials.js';

/** Rejection-sample up to `count` spots in `area` [x0, x1, z0, z1] that pass `accept(x, z, y)`. */
function scatter({ count, area, H, rnd, accept, guard = 6e6 }, place) {
  const [x0, x1, z0, z1] = area;
  let i = 0, tries = 0;
  while (i < count && tries++ < guard) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0), y = H(x, z);
    if (!accept(x, z, y)) continue;
    place(i++, x, y, z);
  }
  return i;
}

/**
 * Grass: one two-triangle blade instanced up to `count` times with random yaw and height.
 * `color(c, x, z, rnd)` sets each blade's colour.
 */
export function grass(scene, { cls, wind, height = [.3, .28], color, ...opts }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-.045, 0, 0, .045, 0, 0, .012, .6, 0, -.045, 0, 0, .012, .6, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), cls, wind), opts.count);
  const o = new THREE.Object3D(), c = new THREE.Color(), rnd = opts.rnd;
  im.count = scatter(opts, (i, x, y, z) => {
    o.position.set(x, y - .02, z); o.rotation.y = rnd() * 6.28;
    o.scale.set(1.5, height[0] + rnd() * height[1], 1.5); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    color(c, x, z, rnd); im.setColorAt(i, c);
  });
  im.receiveShadow = true; scene.add(im);
  return im;
}

/** Flower heads: small tilted cards lifted `lift` [base, range] above the ground. */
export function flowers(scene, { cls, wind, size = .14, lift = [.2, .16], scale = [.8, .9], color, ...opts }) {
  const g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2 + .25);
  const im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), cls, wind), opts.count);
  const o = new THREE.Object3D(), c = new THREE.Color(), rnd = opts.rnd;
  im.count = scatter(opts, (i, x, y, z) => {
    o.position.set(x, y + lift[0] + rnd() * lift[1], z); o.rotation.y = rnd() * 6.28; o.scale.setScalar(scale[0] + rnd() * scale[1]); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    color(c, rnd); im.setColorAt(i, c);
  });
  im.receiveShadow = true; scene.add(im);
  return im;
}

/**
 * Tree builder. Push trunk geometry into `trunks` and leaf cards ([x, y, z, r, g, b] per card)
 * into `leaves`, then call finish() once. canopy() makes a standard broadleaf: a tapered trunk,
 * three branches and 11 spherical lobes of leaf cards, brighter on top.
 */
export function makeTrees({ H, rnd }) {
  const leaves = [], trunks = [];
  function canopy(t, pal, { lobes = 11, perLobe = 145 } = {}) {
    const y0 = H(t.x, t.z), H0 = 5.3 * t.s;
    const tg = new THREE.CylinderGeometry(.09 * t.s, .22 * t.s, H0, 7); tg.translate(t.x, y0 + H0 / 2, t.z); trunks.push(tg);
    for (let b = 0; b < 3; b++) {
      const a = rnd() * 6.28, bg = new THREE.CylinderGeometry(.03 * t.s, .08 * t.s, 2.2 * t.s, 5);
      bg.rotateZ(.8); bg.rotateY(a); bg.translate(t.x + Math.cos(a) * .6 * t.s, y0 + H0 * .72, t.z - Math.sin(a) * .6 * t.s); trunks.push(bg);
    }
    for (let l = 0; l < lobes; l++) {
      const a = rnd() * 6.28, r = rnd() ** .6 * 2.5 * t.s, lx = t.x + Math.cos(a) * r, lz = t.z + Math.sin(a) * r;
      const ly = y0 + H0 * .8 + (rnd() - .35) * 1.8 * t.s + (1 - r / (2.6 * t.s)) * 1.3 * t.s, lr = (.75 + rnd() * .55) * t.s;
      for (let i = 0; i < perLobe; i++) {
        const u = rnd() * 2 - 1, th = rnd() * 6.28, q = Math.sqrt(1 - u * u), rr = lr * Math.cbrt(rnd());
        const p = pal[(rnd() * pal.length) | 0], lit = .72 + .6 * clamp(u * .5 + .5);
        leaves.push(lx + q * Math.cos(th) * rr, ly + u * rr * .75, lz + q * Math.sin(th) * rr, p[0] * lit, p[1] * lit, p[2] * lit);
      }
    }
  }
  function finish(scene, { leafCls, woodCls, wind, barkTex, barkColor = '#e8dfd2', leafSize = [.3, .24] }) {
    if (trunks.length) {
      const trunk = new THREE.Mesh(mergeGeometries(trunks), tag(new THREE.MeshLambertMaterial({ color: barkColor, ...(barkTex && { map: barkTex }) }), woodCls));
      trunk.castShadow = true; scene.add(trunk);
    }
    const count = leaves.length / 6;
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(...leafSize), tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), leafCls, wind), count);
    const o = new THREE.Object3D(), c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      o.position.set(leaves[i * 6], leaves[i * 6 + 1], leaves[i * 6 + 2]); o.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      c.setRGB(leaves[i * 6 + 3], leaves[i * 6 + 4], leaves[i * 6 + 5]); im.setColorAt(i, c);
    }
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  }
  return { leaves, trunks, canopy, finish };
}

/** Boulders: one lumpy flattened icosahedron instanced per [x, z, r]; `y(x, z, r)` seats each one. */
export function rocks(scene, list, { cls, rnd, y, map, color = [.72, .78, .86], flatten = .62, scale = .95 }) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i), k = .72 + fbm(v.x * 1.7 + 4, v.y * 1.7 + v.z) * .6; p.setXYZ(i, v.x * k, v.y * k * .7, v.z * k); }
  g.scale(1, flatten, 1); g.computeVertexNormals();
  const im = new THREE.InstancedMesh(g, tag(new THREE.MeshLambertMaterial({ color: new THREE.Color(...color), ...(map && { map }) }), cls), list.length), o = new THREE.Object3D();
  list.forEach(([x, z, r], i) => { o.position.set(x, y(x, z, r), z); o.rotation.y = rnd() * 6; o.scale.setScalar(r * scale); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
  im.castShadow = true; im.receiveShadow = true; scene.add(im);
}

/**
 * Drifting particles (petals, blown snow). Each gets four random seeds; `place(s, t, d)` positions
 * the Object3D `d` for time t. Returns an update(t) for the frame loop.
 */
export function drifters(scene, { count, cls, rnd, color, geometry = new THREE.PlaneGeometry(.09, .09), place }) {
  const im = new THREE.InstancedMesh(geometry, tag(new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), side: THREE.DoubleSide }), cls), count);
  scene.add(im);
  const seeds = Array.from({ length: count }, () => [rnd(), rnd(), rnd(), rnd()]), d = new THREE.Object3D();
  return (t) => {
    seeds.forEach((s, i) => { place(s, t, d); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    im.instanceMatrix.needsUpdate = true;
  };
}
