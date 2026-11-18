// Any picture as a diorama source: the image takes the place of the 3D render, and each pixel's
// surface class is guessed from its colour, its local texture and where it sits in the frame.
// Everything after that (glyph pass, tilt-shift, quality tiers, menu, recording) is the shared engine.
import * as THREE from 'three';
import { g } from './glyphs.js';
import { glf } from './noise.js';
import { runDiorama } from './run.js';

/** Classes a picture is split into (the class view colours them with CLASS_COLORS). */
export const PIC_CLS = { sky: 1, water: 2, foliage: 3, warm: 4, sand: 5, stone: 6, dark: 7, bright: 8 };

/**
 * Per-pixel classifier, in sRGB terms so the thresholds read like a colour picker:
 *   dark     very low luminance
 *   sky      smooth (little local texture) and above `horizon`, whatever its hue (sunsets too)
 *   bright   near-white and unsaturated (clouds, foam, glare)
 *   stone    unsaturated: pavement, walls, concrete, rock
 *   water    blue to cyan with texture (ripples)
 *   foliage  yellow-green to green, plus dim olive
 *   sand     straw, ochre, gold
 *   warm     reds, oranges, browns, magentas (brick, roofs, clothes)
 */
const classifyGLSL = ({ horizon, smooth, gray }) => /* glsl */`
float lumS(vec3 c){ return dot(c,vec3(.25,.6,.15)); }
vec3 srgb(vec2 uv, float lod){ return pow(max(textureLod(uImg,uv,lod).rgb,0.),vec3(1./2.2)); }
float classify(vec2 uv){
  vec3 s = srgb(uv,1.);
  float l = lumS(s), mx = max(s.r,max(s.g,s.b)), mn = min(s.r,min(s.g,s.b)), sat = mx>.001 ? (mx-mn)/mx : 0.;
  float h = 0.;
  if(mx-mn>.001){
    if(mx==s.r) h = mod((s.g-s.b)/(mx-mn),6.);
    else if(mx==s.g) h = (s.b-s.r)/(mx-mn)+2.;
    else h = (s.r-s.g)/(mx-mn)+4.;
    h /= 6.;
  }
  vec2 d = 2.5/vec2(textureSize(uImg,0));
  float tex = abs(lumS(srgb(uv+vec2(d.x,0),1.))-lumS(srgb(uv-vec2(d.x,0),1.)))+abs(lumS(srgb(uv+vec2(0,d.y),1.))-lumS(srgb(uv-vec2(0,d.y),1.)));
  if(l<.09) return ${PIC_CLS.dark}.;
  if(tex<${glf(smooth)} && uv.y>${glf(horizon)}) return ${PIC_CLS.sky}.;
  bool blue = h>.42 && h<.72;
  if(sat<${glf(gray)}) return l>.82 ? ${PIC_CLS.bright}. : ${PIC_CLS.stone}.;
  if(blue) return ${PIC_CLS.water}.;
  if(h>.18 && h<=.42) return ${PIC_CLS.foliage}.;
  if(h>.1 && h<=.18 && l<.3 && s.g>s.r*.8) return ${PIC_CLS.foliage}.; // olive: foliage in warm or dim light
  if(h>.11 && h<=.18) return ${PIC_CLS.sand}.;
  return ${PIC_CLS.warm}.;
}`;

/** Default glyph rules for picture classes; any scene-style `rules` string can replace them. */
export const pictureRules = /* glsl */`
  if(cls<1.5){        // sky: sparse and soft, so the colour carries it
    gl = L<.5?${g('.')}:L<.75?${g("'")}:${g('`')};
    if(h21(cell)>.55) gl = ${g(' ')};
  } else if(cls<2.5){ // water: ripples drift with the wind field
    gl = L<.15?${g('.')}:L<.3?${g('-')}:(w>.15?${g('~')}:${g('=')});
  } else if(cls<3.5){ // foliage
    gl = L<.12?${g('.')}:L<.22?${g(':')}:L<.32?${g('*')}:L<.45?${g('+')}:${g('o')};
    if(w>.55) gl = ${g('/')};
  } else if(cls<4.5){ // warm: brick, roofs, people
    gl = mag>.12?edgeG:(L<.2?${g(':')}:L<.4?${g('%')}:L<.6?${g('#')}:${g('&')});
  } else if(cls<5.5){ // sand, ochre
    gl = mag>.12?edgeG:(L<.3?${g(':')}:L<.5?${g('=')}:L<.7?${g('+')}:${g('*')});
  } else if(cls<6.5){ // stone: paving and walls, edges drawn as strokes
    gl = mag>.1?edgeG:(L<.2?${g('.')}:L<.38?${g(':')}:L<.55?${g('=')}:L<.72?${g('—')}:${g('#')});
  } else if(cls<7.5){ // dark
    gl = L<.04?${g(' ')}:${g('.')};
  } else {            // bright: glare, foam, white stone
    gl = mag>.12?edgeG:(L<.85?${g('o')}:${g('@')});
  }`;

/**
 * A full-screen quad that writes the picture (linear colour) and its class (alpha) into the
 * engine's render target, cropping to fill the screen ("cover"). Returned as { scene, camera,
 * resize(aspect), setImage(texture) } for runDiorama's `source` option.
 */
function pictureSource(texture, opts) {
  const imgAspect = () => texture.image.width / texture.image.height;
  const uScale = new THREE.Vector2(1, 1);
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
    uniforms: { uImg: { value: texture }, uScale: { value: uScale } },
    vertexShader: `in vec3 position; in vec2 uv; out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }`,
    fragmentShader: /* glsl */`
precision highp float;
uniform sampler2D uImg; uniform vec2 uScale;
in vec2 vUv; out vec4 outColor;
${classifyGLSL(opts)}
void main(){
  vec2 uv = (vUv-.5)*uScale+.5;
  outColor = vec4(textureLod(uImg,uv,0.).rgb*${glf(opts.exposure)}, classify(uv)/16.);
}`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  let screenAspect = 1;
  const resize = (a = screenAspect) => {
    screenAspect = a; const r = a / imgAspect();
    uScale.set(Math.min(1, r), Math.min(1, 1 / r)); // crop whichever side overflows
  };
  return {
    scene, camera: new THREE.Camera(), resize,
    setImage(t) { const old = mat.uniforms.uImg.value; mat.uniforms.uImg.value = texture = t; resize(); if (old !== t) old.dispose(); },
  };
}

const loadTexture = (url) => new THREE.TextureLoader().loadAsync(url).then(t => {
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
});

/**
 * Run a picture as a diorama. `src` is any image URL the page may load; `cell` is the glyph cell
 * size in image pixels. Dropping an image file on the page swaps the picture.
 * `horizon` (0 bottom .. 1 top), `smooth` and `gray` tune the classifier; `rules` and `glyphs`
 * override the glyph rules and grading; `tilt` is passed to the tilt-shift pass.
 */
export async function runPicture({ src, title, cell = [6, 12], horizon = .4, smooth = .035, gray = .16, exposure = 1, rules = pictureRules, glyphs = {}, tilt = { focus: .4, start: .2, end: .55 } }) {
  const texture = await loadTexture(src);
  const { width: w, height: h } = texture.image;
  const source = pictureSource(texture, { horizon, smooth, gray, exposure });
  addDrop(source);
  return runDiorama({
    title, size: [w, h], grid: [Math.round(w / cell[0]), Math.round(h / cell[1])],
    source, tilt,
    glyphs: { rules, saturation: 1.25, gain: 1.35, bg: .28, bgByClass: { [PIC_CLS.sky]: .85, [PIC_CLS.bright]: .55, [PIC_CLS.water]: .4 }, wind: { drift: [.2, .05] }, ...glyphs },
  });
}

/** Drag an image file onto the page to see it as glyphs. */
function addDrop(source) {
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = [...(e.dataTransfer?.files ?? [])].find(f => f.type.startsWith('image/'));
    if (!f) return;
    const url = URL.createObjectURL(f);
    try { source.setImage(await loadTexture(url)); } finally { URL.revokeObjectURL(url); }
  });
}
