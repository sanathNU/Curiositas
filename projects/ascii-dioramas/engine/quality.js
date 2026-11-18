// Quality tiers: how much work each frame and the startup bake may do.
// The tier is picked from the device at load (or forced with ?q=high|mid|low), and stepped down
// live when frames keep running long. Scenes read `Q` while they build; live knobs are applied by
// run.js and by whoever registered with onTier().

/**
 * texel   3D-render texels per glyph cell [x, y]; the glyph pass only reads a per-cell average,
 *         so rendering the scene at full screen resolution is wasted work
 * screen  scale of the canvas against the layout size (the browser upscales the rest)
 * shadow  shadow-map size; shadowEvery redraws it every n-th frame (the sun never moves)
 * taps    tilt-shift blur taps; fps caps the frame rate
 * density share of grass blades and flower cards drawn; lights share of optional scene lights
 * paint   terrain texture resolution and mesh detail, applied once while the scene builds
 */
export const TIERS = {
  high: { name: 'high', texel: [4, 8], screen: 1, shadow: 4096, shadowEvery: 2, taps: 36, fps: 60, density: 1, lights: 1, paint: 1, mesh: 1 },
  mid: { name: 'mid', texel: [3, 6], screen: 1, shadow: 2048, shadowEvery: 3, taps: 24, fps: 30, density: .7, lights: .5, paint: .7, mesh: .6 },
  low: { name: 'low', texel: [2, 4], screen: .75, shadow: 1024, shadowEvery: 6, taps: 12, fps: 30, density: .45, lights: .34, paint: .5, mesh: .5 },
};
export const ORDER = ['high', 'mid', 'low'];

/** Current tier settings, mutated in place by setTier(). */
export const Q = { ...TIERS.high };

const listeners = [];
/** Run `fn(Q)` now and again whenever the tier changes (live knobs a scene owns, e.g. lights). */
export function onTier(fn) { listeners.push(fn); fn(Q); }

/** Switch tier; run.js re-applies its own knobs after this. */
export function setTier(name) {
  Object.assign(Q, TIERS[name]);
  listeners.forEach(fn => fn(Q));
}

/**
 * Starting tier from what the browser tells us: software rendering or tiny memory → low;
 * phones, few cores, little memory or a mobile/integrated GPU → mid; everything else → high.
 */
export function detectTier(renderer, profile) {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu) || mem <= 2) return 'low';
  if (profile === 'phone' || cores <= 4 || mem <= 4 || /intel|mali|adreno|powervr|videocore/i.test(gpu)) return 'mid';
  return 'high';
}

/**
 * Instanced meshes that may be thinned (grass, flowers). All instances are placed at build time,
 * in random order, so drawing the first `density` share is an even subset and the scene's random
 * stream (and so its layout) is the same on every tier.
 */
const thinnable = [];
export function thin(im) {
  im.userData.full = im.count; thinnable.push(im);
  im.count = Math.round(im.userData.full * Q.density);
  return im;
}
onTier(q => thinnable.forEach(im => { im.count = Math.round(im.userData.full * q.density); }));

/**
 * Watches drawn-frame intervals and steps the tier down when they stay over budget.
 * Ignores the first moments after a change (shader compiles, texture uploads) and stalls over
 * 250 ms (background tabs, debugger pauses). Never steps back up within a page load.
 */
export function governor(step) {
  let warm = 2, sum = 0, n = 0;
  return {
    reset() { warm = 2; sum = 0; n = 0; },
    sample(ms) {
      if (ms > 250 || document.hidden) return;
      if ((warm -= ms / 1000) > 0) return;
      sum += ms; n++;
      if (sum < 3000) return;
      const avg = sum / n; sum = 0; n = 0;
      if (avg > 1.3 * 1000 / Q.fps) { const next = ORDER[ORDER.indexOf(Q.name) + 1]; if (next) { step(next); warm = 2; } }
    },
  };
}
