// Material tagging (surface class in alpha) and the vertex-shader wind used by soft things.
import * as THREE from 'three';
import { glf } from './noise.js';

/** Shared time uniform; the run loop writes it every frame. */
export const time = { value: 0 };

/**
 * Patch a material so its fragment alpha carries the surface class (cls / 16).
 * The glyph pass reads that alpha to pick a character set, so nothing in a scene may blend.
 * `extra` is an optional onBeforeCompile hook (wind etc.); give it a `.key` when its params vary.
 */
export function tag(mat, cls, extra) {
  mat.onBeforeCompile = (s) => {
    extra?.(s);
    s.fragmentShader = s.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n gl_FragColor.a = ${(cls / 16).toFixed(4)};`);
  };
  mat.customProgramCacheKey = () => `c${cls}:${extra?.key ?? ''}`;
  return mat;
}

const texLoader = new THREE.TextureLoader();
/** Repeating sRGB texture from the shared assets folder. */
export function tex(url, rx = 1, ry = 1) {
  const t = texLoader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8;
  return t;
}

const keyed = (fn, key) => Object.assign(fn, { key });
const inject = (s, body) => {
  s.uniforms.uT = time;
  s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${body}`);
};

/**
 * Gust band shared by grass and cloth: travels downwind (+x) at rate/.28 units per second.
 * `ip` is the instance position.
 */
export const gustGLSL = (rate) => `smoothstep(.15,1.,sin(uT*${glf(rate)}-ip.x*.28+ip.z*.07)*.5+.5)`;

/**
 * Bend instanced blades toward world +x, more at the tip (y²).
 * upNormals keeps the blade's up-facing normal on back faces instead of DoubleSide's flip,
 * so blades seen from behind are not lit as if they faced the ground.
 */
export function bladeWind({ amp = .22, lean = .35, gust = .8, flutter = .12, flutterRate = 4.2, rate = 1.1, drop = 0, upNormals = false } = {}) {
  return keyed((s) => {
    inject(s, `
    vec3 ip = instanceMatrix[3].xyz;
    vec2 wl = normalize(vec2(instanceMatrix[0].x, instanceMatrix[2].x));
    float gust = ${gustGLSL(rate)};
    float bend = (${glf(lean)}+gust*${glf(gust)}+sin(uT*${glf(flutterRate)}+ip.x*1.7+ip.z*2.3)*${glf(flutter)})*${glf(amp)}*position.y*position.y;
    transformed.xz += wl*bend;
    transformed.y -= gust*${glf(drop)}*position.y*position.y;`);
    if (upNormals) s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  }, `blade${amp}${lean}${gust}${flutter}${flutterRate}${rate}${drop}${upNormals}`);
}

/** Small bob and sway for leaf cards, petals on water and flower heads. */
export function leafWind({ rate = 1.6, bob = .025, sway = .04, swayRate = .6 } = {}) {
  return keyed((s) => inject(s, `
    float ph = instanceMatrix[3].x*.9+instanceMatrix[3].z*.7+instanceMatrix[3].y*.8;
    transformed.y += sin(uT*${glf(rate)}+ph)*${glf(bob)};
    transformed += vec3(1.,0.,.4)*sin(uT*${glf(swayRate)}+instanceMatrix[3].x*.22)*${glf(sway)};`), `leaf${rate}${bob}${sway}${swayRate}`);
}

/**
 * Cloth hanging from its top edge (local y ≤ 0): streams out downwind and ripples.
 * The flag swings toward whichever side of its line faces +x.
 */
export function clothWind({ rate = 1.1, base = .7, gust = .6, flutter = .18, flapRate = 7.5 } = {}) {
  return keyed((s) => inject(s, `
    vec3 ip = instanceMatrix[3].xyz;
    float sgn = instanceMatrix[2].x >= 0. ? 1. : -1.;
    float depth = -position.y;
    float gust = ${gustGLSL(rate)};
    float ph = uT*${glf(flapRate)}+ip.x*3.1+ip.z*2.3-depth*9.+position.x*6.;
    float ang = ${glf(base)}+gust*${glf(gust)}+sin(ph)*${glf(flutter)};
    transformed.y = -depth*cos(ang);
    transformed.z = sgn*depth*sin(ang)+sin(ph*1.3+1.)*.08*depth;`), `cloth${rate}${base}${gust}${flutter}${flapRate}`);
}

/** Give a geometry one flat vertex colour (for merged multi-colour props). */
export function colored(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}
