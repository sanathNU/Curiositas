// Screen-size handling: device profiles, named resolutions, render size, glyph grid, camera framing.
// A scene declares the frame it was composed for (`size`) and its glyph density there (`grid`);
// everything here adapts that to whatever screen it lands on.

/** Named resolutions for ?res=<name>. Rendered at exactly this size, letterboxed into the window. */
export const RESOLUTIONS = {
  phone: [1170, 2532], 'phone-land': [2532, 1170],
  tablet: [1640, 2360], 'tablet-land': [2360, 1640],
  laptop: [2560, 1600], desktop: [1920, 1080], '4k': [3840, 2160],
  ultrawide: [3440, 1440], square: [1440, 1440],
};
const PRESET_PROFILE = { phone: 'phone', 'phone-land': 'phone', tablet: 'tablet', 'tablet-land': 'tablet', '4k': 'large' };

/**
 * Device classes. `budget` caps render pixels (the 3D pass and both post passes run per pixel);
 * `cellScale` grows glyph cells on big, dense screens so characters stay readable.
 * (How much work each frame does is the quality tier's job; see quality.js.)
 */
export const PROFILES = {
  phone: { budget: 2.2e6, cellScale: 1 },
  tablet: { budget: 3.2e6, cellScale: 1.05 },
  desktop: { budget: 4.2e6, cellScale: 1.15 },
  large: { budget: 6.5e6, cellScale: 1.3 },
};

/** Parse ?res=: a preset name, "frame" (the scene's own composed size), or "<w>x<h>". */
export function parseRes(value, frame) {
  if (!value) return null;
  if (value === 'frame') return { size: frame, profile: 'desktop', name: 'frame' };
  if (RESOLUTIONS[value]) return { size: RESOLUTIONS[value], profile: PRESET_PROFILE[value] ?? 'desktop', name: value };
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(value);
  if (!m) return null;
  const size = [+m[1], +m[2]];
  return { size, profile: size[0] * size[1] > 7e6 ? 'large' : 'desktop', name: value };
}

function autoProfile(cssW, cssH, dpr) {
  const short = Math.min(cssW, cssH), px = cssW * cssH * dpr * dpr;
  if (short < 600) return 'phone';
  if (short < 1000 && Math.max(cssW, cssH) < 1400) return 'tablet';
  return px > 7e6 ? 'large' : 'desktop';
}

/**
 * Work out render size and glyph grid.
 * Fill mode (default): render the window's own shape at device resolution, scaled down to the
 * profile's pixel budget. Forced mode (?res=): render exactly that size and letterbox it.
 */
export function layout({ frame, grid, forced, viewport = [innerWidth, innerHeight], dpr = devicePixelRatio || 1 }) {
  let w, h, profile;
  if (forced) {
    [w, h] = forced.size; profile = forced.profile;
  } else {
    const [cssW, cssH] = viewport;
    profile = autoProfile(cssW, cssH, dpr);
    const s = Math.min(dpr, Math.sqrt(PROFILES[profile].budget / (cssW * cssH)));
    w = Math.max(64, Math.round(cssW * s)); h = Math.max(64, Math.round(cssH * s));
  }
  const p = PROFILES[profile], cellW = frame[0] / grid[0] * p.cellScale, cellH = frame[1] / grid[1] * p.cellScale;
  return { w, h, cols: Math.max(20, Math.round(w / cellW)), rows: Math.max(12, Math.round(h / cellH)), profile, fill: !forced, name: forced?.name ?? 'auto' };
}

/**
 * Fit the scene's composed frame (aspect a0) into a screen of aspect a, keeping the long lens.
 * Narrower screen: keep the composed width by widening the field of view up to maxFov, then
 * pulling the camera back. Wider screen: show at most `maxWiden` times the composed width and
 * crop height, which zooms in on the focal band. Returns the camera distance multiplier.
 */
export function frameCamera(camera, a0, a, { fov = 23, maxWiden = 1.8, maxFov = 34 } = {}) {
  const r = Math.PI / 360, t0 = Math.tan(fov * r);
  let tv, dist = 1;
  if (a >= a0) tv = t0 * Math.min(1, maxWiden * a0 / a);
  else {
    tv = t0 * a0 / a;
    const cap = Math.tan(maxFov * r);
    if (tv > cap) { dist = tv / cap; tv = cap; }
  }
  camera.fov = Math.atan(tv) / r; camera.aspect = a; camera.updateProjectionMatrix();
  return dist;
}
