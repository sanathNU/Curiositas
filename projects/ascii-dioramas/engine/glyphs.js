// The two post passes: render → coloured glyphs, then glyphs → tilt-shift blur.
import * as THREE from 'three';
import { glf } from './noise.js';

export const GLYPHS = " .'`,:;-~=+*oOsS$%&8#@/\\|_^v\u2014";
const GI = Object.fromEntries([...GLYPHS].map((c, i) => [c, i]));
/** Glyph index as a GLSL float literal, for use inside glyph rules: `${g('#')}`. */
export const g = (c) => {
  if (!(c in GI)) throw new Error(`glyph ${JSON.stringify(c)} is not in the atlas`);
  return GI[c].toFixed(1);
};

/** Atlas: every glyph drawn once in bold Menlo, 64×120 px per glyph, mipmapped. */
export function buildAtlas() {
  const tw = 64, th = 120, c = document.createElement('canvas');
  c.width = tw * GLYPHS.length; c.height = th;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 100px Menlo, Monaco, monospace';
  [...GLYPHS].forEach((ch, i) => { if (ch === '\u2014') x.fillRect(i * tw, th * .44, tw, th * .12); else x.fillText(ch, (i + .5) * tw, th * .52); });
  const t = new THREE.CanvasTexture(c); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.flipY = false;
  return t;
}

/**
 * The glyph pass runs in two steps. The cell step draws one fragment per glyph cell into a small
 * cols×rows target and does all the per-cell work there (colour, class, gradient, wind, rules);
 * the screen step then only looks the cell up and stamps its glyph from the atlas.
 * Per cell the cell step provides to `rules`:
 *   cls   surface class (unfiltered, from the cell centre)
 *   L     luminance of the graded cell colour
 *   mag   luminance gradient magnitude across neighbouring cells
 *   edgeG the edge glyph (| \ — /) matching that gradient's direction
 *   w     wind field: drifting noise plus the gust band (summit tips grass to '/' with it)
 *   gust  the screen-space gust band alone, 0..1
 *   cell  integer cell coordinates (for static per-cell variation with h21)
 * `rules` must assign `gl` (a glyph index from g()).
 */
export const VIEWS = ['glyphs', 'render', 'classes'];

const gradeGLSL = (saturation) => /* glsl */`
float lum(vec3 c){ return dot(c,vec3(.25,.6,.15)); }
vec3 grade(vec3 c){
  c = max(c,0.); c = c/(1.+c*.12); c = pow(c,vec3(1./2.2));
  c = mix(c,c*c*(3.-2.*c),.5);
  float l = lum(c); c = mix(vec3(l),c,${glf(saturation)});
  return clamp(c,0.,1.);
}`;

/**
 * Cell step. Writes the glyph's ink colour to rgb, and packs the glyph index and the cell's
 * background strength into alpha as `index + round(bgK·64)/64` (exact in a half-float target).
 * Glyph 0 (space) marks sky: no ink, soft background only.
 */
export function cellFrag({ rules, saturation = 1.3, gain = 1.36, lift = .012, bg = .2, bgByClass = {}, wind = {} }) {
  const { drift = [.28, .07], spread = 2, bias = 0, gust = 0 } = wind;
  const bgRules = Object.entries(bgByClass).map(([k, v]) => `if(abs(cls-${glf(k)})<.5) bgK = ${glf(v)};`).join(' ');
  return /* glsl */`
precision highp float;
uniform sampler2D uScene; uniform vec2 uGrid; uniform float uTime;
out vec4 outColor;
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
${gradeGLSL(saturation)}
void main(){
  vec2 cell = floor(gl_FragCoord.xy), cuv = (cell+.5)/uGrid;
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
  float edgeG = a4<1.?${g('|')}:a4<2.?${g('\\')}:a4<3.?${g('\u2014')}:${g('/')};
  float gust = smoothstep(.25,1.,sin(cell.x*.045+cell.y*.012-uTime*1.1)*.5+.5);
  float w = vn(cell*vec2(.05,.09)+vec2(-uTime*${glf(drift[0])},uTime*${glf(drift[1])}))*${glf(spread)}-${glf(spread / 2)}+${glf(bias)}+gust*${glf(gust)};
  float gl = ${g('.')};
  ${rules}
  float bgK = ${glf(bg)}; ${bgRules}
  if(cls<.5){ gl = 0.; bgK = .95; } // sky (nothing drawn): plain soft colour, no glyphs
  outColor = vec4(col*${glf(gain)}+${glf(lift)}, max(gl,0.)+clamp(floor(bgK*64.+.5),0.,62.)/64.);
}`;
}

/**
 * Screen step: stamp each cell's glyph over a dim, blurred copy of the render.
 * `uView` (an index into VIEWS) switches live between glyphs, the plain 3D render and the class map.
 */
export function glyphFrag({ saturation = 1.3 } = {}) {
  return /* glsl */`
precision highp float;
uniform sampler2D uScene, uAtlas, uCells; uniform vec2 uGrid; uniform float uN; uniform int uView;
in vec2 vUv; out vec4 outColor;
${CLASS_PALETTE}
${gradeGLSL(saturation)}
void main(){
  if(uView==1){ outColor = vec4(grade(texture(uScene,vUv).rgb),1.); return; }
  vec2 g = vUv*uGrid, cell = min(floor(g),uGrid-1.);
  ivec2 sz = textureSize(uScene,0);
  if(uView==2){
    float cls = floor(texelFetch(uScene,ivec2((cell+.5)/uGrid*vec2(sz)),0).a*16.+.5);
    outColor = vec4(CLASS_COLORS[int(clamp(cls,0.,13.))],1.); return;
  }
  vec4 C = texelFetch(uCells,ivec2(cell),0);
  float gl = floor(C.a), bgK = C.a-gl;
  vec2 gv = g-cell, dx = dFdx(g), dy = dFdy(g);
  float ink = gl<.5 ? 0. : smoothstep(.12,.78,textureGrad(uAtlas,vec2((gl+gv.x)/uN,1.-gv.y),dx/uN,dy).r);
  float lodC = log2(float(sz.x)/uGrid.x)+.05;
  vec3 blur = grade(textureLod(uScene,vUv,lodC+1.2).rgb);
  outColor = vec4(mix(blur*bgK,C.rgb,ink),1.);
}`;
}

/** Class-view palette, indexed by class number (meanings are per scene; see each CLS table). */
export const CLASS_COLORS = ['#000000', '#7cc242', '#1f7a3a', '#e055c8', '#a8aeb8', '#e8b04a', '#e0302a', '#8a5a3a', '#ffffff', '#3a7bd5', '#9fd8ff', '#ff8c00', '#ffe14a', '#4a4f5a'];
const CLASS_PALETTE = `const vec3 CLASS_COLORS[14] = vec3[14](${CLASS_COLORS.map(h => { const n = parseInt(h.slice(1), 16); return `vec3(${glf((n >> 16) / 255)},${glf(((n >> 8) & 255) / 255)},${glf((n & 255) / 255)})`; }).join(',')});`;

/**
 * Tilt-shift: sharp within `start` of the focus line, blur radius rising to uMaxR px by `end`;
 * uTaps (up to 36, set by the quality tier) taps on a golden-angle disc, read from a mip level
 * matched to the radius. uMaxR is set per screen so the blur keeps its size relative to the frame height.
 * With uBlurMap = 1 the strength comes from uBlur instead (0..1 per pixel, e.g. from a depth map).
 */
export function tiltFrag({ focus = .44, start = .27, end = .6 } = {}) {
  return /* glsl */`
precision highp float;
uniform sampler2D uA, uBlur; uniform vec2 uRes; uniform float uMaxR; uniform int uTaps, uBlurMap;
in vec2 vUv; out vec4 outColor;
void main(){
  float dy = abs(vUv.y-${glf(focus)});
  float r = (uBlurMap==1 ? texture(uBlur,vUv).r : pow(smoothstep(${glf(start)},${glf(end)},dy),1.6))*uMaxR;
  if(r<.2){ outColor = vec4(texture(uA,vUv).rgb,1.); return; }
  vec3 c = vec3(0.);
  float n = float(uTaps), lod = max(log2(r*6./sqrt(n)/4.),0.);
  for(int i=0;i<36;i++){
    if(i>=uTaps) break;
    float t = float(i)+.5, a = t*2.39996, rr = sqrt(t/n)*r;
    c += textureLod(uA,vUv+vec2(cos(a),sin(a))*rr/uRes,lod).rgb;
  }
  outColor = vec4(c/n,1.);
}`;
}
