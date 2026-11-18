# ASCII Dioramas

Miniature 3D worlds rendered as coloured monospace glyphs with a tilt-shift blur,
seen from high above through a long lens. Every scene is a short `main.js` on a
shared engine: it shapes the land, places instanced grass, flowers, trees and
props, and hands the rest to the engine, which renders the scene into a small
half-float target (a few texels per glyph cell, since each glyph only shows its
cell's average) and runs two post passes:

1. **Glyph pass**: each grid cell becomes one character, chosen by the surface
   it shows (its *class*), its brightness and the direction of any edge, and
   coloured from the render. That choice is made once per cell, into a
   cols×rows target; the screen pass then only stamps glyphs from the atlas.
   The cell background is a dim copy of the render, so gaps between glyphs
   still carry colour.
2. **Tilt-shift pass**: blur grows above and below a focus band, like a
   photograph of a model.

## Running

```bash
npm install        # once, from this directory
node serve.mjs     # homepage at http://127.0.0.1:5173/
```

The homepage lists every scene; each one lives at `/<name>/`. A reload rebuilds
that scene's bundle. Space pauses. `node serve.mjs 5175` picks another port;
`node serve.mjs torii` prints the torii URL as well.

### URL flags (every scene)

| Flag | Effect |
|---|---|
| `?fox=walk` | creature walks its path (default) |
| `?fox=still` | creature stands still and plays the model's look-around clip |
| `?fox=off` | no creature |
| `?tilt=off` | skip the tilt-shift pass, whole frame sharp |
| `?title=off` | hide the scene title |
| `?t=12` | start paused at 12 s (Space resumes); repeatable frames for screenshots |
| `?view=render` / `?view=classes` | start in the plain 3D view, or the surface-class map |
| `?res=phone` | render at a fixed resolution and letterbox it (see below) |
| `?ui=off` | hide the menu button (keys and camera gestures still work) |
| `?sound=on` / `?sound=off` | start the music on the first click or key, or leave it out entirely |
| `?q=high` / `mid` / `low` | fix the quality tier instead of picking it from the device (see below) |

Combine them: `/summit/?fox=still&tilt=off&t=8`.

### Looking around

Every scene can be explored by hand while its camera keeps sweeping:

- **Drag** to orbit (up to ±80° around, 14°–86° elevation), **scroll** or
  **pinch** to zoom, **double-click** to reset.
- A faint **menu button** in the top-right corner opens: back to all scenes,
  ASCII / 3D / Classes view, tilt-shift on or off, sound, pause, reset camera, and
  **Record video**, which saves what the canvas shows (any view) as a WebM or
  MP4 file, with the music when it is on. The title overlay and the menu are not
  part of the recording.
- Keys: `M` menu, `V` next view, `T` tilt-shift, `S` sound, `Space` pause, `R`
  start/stop recording, `0` or `Esc` reset camera.

### Screens

By default a scene fills the window at its real pixel density, on any shape:
phone, tablet, laptop, ultrawide, or an odd window size. It re-lays out live on
resize, rotation, or a move to a monitor with a different pixel ratio.

- **Device profile** (picked from the window size): sets the screen pixel
  budget and glyph size.

  | Profile | When | Max screen pixels | Glyph cell |
  |---|---|---|---|
  | phone | shorter side < 600 CSS px | 2.2 M | ×1 |
  | tablet | shorter side < 1000, longer < 1400 | 3.2 M | ×1.05 |
  | desktop | anything else | 4.2 M | ×1.15 |
  | large | over 7 M device pixels | 6.5 M | ×1.3 |

- **Glyph grid**: keeps each scene's cell size (5.4 × 10.8 px for the portrait
  scenes) times the profile's factor, so a phone gets fewer columns and a big
  monitor more, with the same look.
- **Framing**: each scene keeps the shape it was composed for. On a narrower
  screen the lens widens (up to 34°), then the camera pulls back, so nothing is
  cropped from the sides. On a wider screen it shows at most 1.8× the composed
  width and crops height, which zooms toward the focal band.
- **Quality tier** (`engine/quality.js`): how much work each frame and the
  startup bake do. It starts from what the browser reports: software rendering
  or ≤ 2 GB memory gives `low`; a phone, ≤ 4 cores, ≤ 4 GB or a mobile or
  integrated GPU gives `mid`; anything else gives `high`. If frames keep
  running more than 30% over budget (measured over 3 s), it steps down one
  tier, live. `?q=` fixes the tier and turns that off.

  | Tier | 3D texels per cell | Screen scale | Shadow map | Shadow redraw | Blur taps | FPS cap | Grass / flowers | Terrain texture |
  |---|---|---|---|---|---|---|---|---|
  | high | 4 × 8 | 1 | 4096 | every 2nd frame | 36 | 60 | all | 2048 × 2140 |
  | mid | 3 × 6 | 1 | 2048 | every 3rd | 24 | 30 | 70% | 70% |
  | low | 2 × 4 | 0.75 | 1024 | every 6th | 12 | 30 | 45% | 50% |

  Grass and flowers are always placed in full, so every tier has the same
  layout; lower tiers draw an even subset. Mangroves keeps every 2nd (mid) or
  3rd (low) lantern as a real light, brighter and reaching further. While
  paused, a frame is drawn only when the view changes.
- **Fixed resolutions**: `?res=` takes `phone` (1170×2532), `phone-land`,
  `tablet` (1640×2360), `tablet-land`, `laptop` (2560×1600), `desktop`
  (1920×1080), `4k`, `ultrawide` (3440×1440), `square`, `frame` (the scene's
  composed size) or any `WxH` such as `?res=1366x768`.

## Scenes

| Scene | Subject | Composed for | Cell |
|---|---|---|---|
| `harbour` | Fishing harbour: a cliff path down to a wooden pier and moored boats | 1:1 (1440×1440) | 7.2 × 14.4 px |
| `mangroves` | Dusk in a mangrove swamp: lantern-lit boardwalk to a stilt hut, prop-root mangroves, lily pads, fireflies | 9:16 | 5.4 × 10.8 px |
| `summit` | Himalayan summit: prayer flags in the wind above a sea of cloud | 9:16 | 5.4 × 10.8 px |
| `temple-south` | South Indian temple: gopuram towers, ghats, Nandi, pushkarini | 9:16 | 5.4 × 10.8 px |
| `torii` | Senbon torii: vermilion gates and stone lanterns down a cliff to the sea | 9:16 | 5.4 × 10.8 px |

## Project structure

```
ascii-dioramas/
  engine/
    noise.js      clamp, smoothstep, value noise, fbm, seeded random, GLSL twins
    materials.js  tag() (class in alpha), wind shaders, textures, vertex colours
    terrain.js    buildLand (height + trail grids), terrainMesh, waterPlane, sea / cloud shaders
    fill.js       grass, flowers, trees, rocks, drifting particles
    glyphs.js     glyph atlas, glyph pass (cell step + screen step), tilt-shift pass
    display.js    resolutions, device profiles, render size and grid, camera framing
    quality.js    quality tiers, device detection, frame-time governor, grass thinning
    title.js      scene title overlay
    music.js      generative polyrhythm music: Web Audio instruments, reverb, beat scheduler
    controls.js   orbit and zoom gestures, hidden menu, keys, video recording
    run.js        runDiorama: renderer, lights, camera sweep, creature, URL flags, loop
  scenes/<name>/main.js   one scene: land, paint, props, glyph rules, config
  site.mjs        scene list, homepage and scene page HTML, bundling (shared by the two below)
  serve.mjs       dev server
  build.mjs       static build into dist/ (used by the Pages workflow)
  assets/
    models/Fox.glb   animated fox
    tex/*.jpg        ground textures (Poly Haven)
    thumbs/*.jpg     homepage thumbnails
```

## Writing a scene

A scene is config plus whatever is unique to it. `scenes/summit/main.js` uses
every part of the engine; `scenes/torii/main.js` is the plainest.

```js
const rnd = seeded(23);                       // same seed → same scene every load
const land = buildLand({ path: [[x, z], …], rawH: (x, z) => height });

runDiorama({
  title: 'Torii',                             // shown over the frame; ?title=off hides it
  size: [1080, 1920], grid: [200, 178],       // frame it was composed for, and glyph density there
  light: { sun: { color, intensity, position, target }, sky: [skyColor, groundColor, intensity] },
  camera: { target: [x, y, z] },              // radius 76, 52° down, ±7° sweep unless overridden
  glyphs: { rules, saturation, gain, bg, bgByClass, wind },
  tilt: { focus: .44 },                       // optional
  creature: { land, cls, tint, u: [.15, .85], speed, offset, still },   // optional
  async build(scene) {
    scene.add(await terrainMesh(land, { textures: [...], paint }));
    scene.add(waterPlane(land, seaGLSL({ shallow, mid, deep })));
    grass(scene, { … }); flowers(scene, { … }); /* props */
    return (t, dt) => { /* optional per-frame work */ };
  },
});
```

- **`paint(x, z, y, pathD, T, pick)`** returns `[r, g, b, cls]` for every texel
  of the 2048×2140 ground texture; `pick(T.leafy_grass, x, z, tile)` samples a
  photo texture.
- **`rules`** is GLSL that sets `gl` from `cls`, `L` (luminance), `mag`/`edgeG`
  (edge strength and the matching `| \ — /`), `w`/`gust` (wind field) and
  `cell`. Write glyphs as `${g('#')}`; `g()` throws if the glyph is not in the atlas.
- **Classes** are scene-local numbers 1–13 written into alpha by `tag(material, cls)`.
  Nothing may use transparency, because blending would mix the class values.

New scenes are picked up from `scenes/<name>/main.js`; add a line to
`SCENE_META` in `site.mjs` and a thumbnail in `assets/thumbs/` for the homepage.

## Motion

Nothing is simulated; everything is a function of time, so scenes loop and
never drift.

- **Camera**: eased sweep `k = ½ − ½cos(πt/24)`, yaw −7°→+7°, slight push in, then back.
- **Wind**: one gust band `smoothstep(.15, 1, ½ + ½ sin(rate·t − .28x + .07z))`
  bends grass blades (more at the tip, `y²`) and streams cloth. The glyph pass
  has a matching screen-space band so gusts also tip grass glyphs from `|` to `/`.
- **Water**: foam bands are a sawtooth in `√depth + time`, so they roll toward
  the shore; a swash rim oscillates at the waterline. Clouds are two drifting
  fbm layers, lit by comparing density with a sample nudged toward the sun.
- **Creature**: Fox.glb's walk clip, ping-ponging along the trail at constant
  speed and facing along the tangent. Drawn unlit, because a lit skinned mesh
  can write NaN into the half-float target and mipmapping spreads it as black squares.
- **Particles**: petals and blown snow are instanced cards repositioned each
  frame from `fract(seed + t·speed)`, so they wrap.

## Music

Each scene has its own background music, off until the viewer presses `S` or
picks **Sound** in the menu (browsers only start audio after a gesture). Once
turned on it stays on from scene to scene. Every score is a polyrhythm: a few
voices pulsing n₁ : n₂ : n₃ times over one shared cycle, so they drift apart and
land together on every cycle boundary, where the beat is accented.

| Scene | Polyrhythm | Cycle | Voices |
|---|---|---|---|
| `harbour` | 2 : 3 : 4 : 5 | 12 s | waves, bass mallet, a sparse marimba tune, an occasional bell buoy; F major pentatonic |
| `mangroves` | 3 : 5 : 7 | 12 s | a few kalimba notes, scattered crickets and tree frogs over a breathing drone; E minor pentatonic |
| `summit` | 2 : 3 : 5 | 12 s | two singing bowls a fifth apart, tingsha, a gust with flag flutter, low drone |
| `temple-south` | tisra over Adi tala | 16 s | one avartanam of Adi tala per cycle: talam (clap, finger counts, wave), mridangam phrasing in threes (12 a cycle), veena in raga Mohanam (6 a cycle, 3 against 4) with slides and kampita, tanpura |
| `torii` | 2 : 3 : 5 | 8 s | surf, fūrin chime, koto in the in scale on D, a bonshō each cycle |

Like the motion, the music is a function of time: beat k of an n-voice falls at
`t = k · cycle / n` on the scene clock and plays `notes[k mod notes.length]`, with
a per-beat hash for velocity and optional skipped beats. Pausing stops it, and
every cycle divides the 48 s camera sweep, so sound and picture loop together.
Everything is synthesised (additive bells and bowls, Karplus–Strong strings for
the veena and tanpura, modal mridangam strokes, noise swells, a generated reverb
impulse); there are no samples.

A scene adds a `music` score to its `runDiorama` config:

```js
music: {
  tonic: 146.83, cycle: 8,                     // Hz; notes are semitones above it, null is a rest
  reverb: { seconds: 6, wet: .4, tone: .55 },
  pad: { notes: [-12, -5], gain: .03 },        // optional sustained drone
  voices: [{ n: 5, inst: 'pluck', notes: [12, 13, null, 17], gain: .12, pan: .25, prob: .85 }, …],
}
```

Instruments are `bell` (also bowls and chimes, via `partials` and `beat`),
`string` (Karplus–Strong, with `bend` and `kampita` gamakas), `tanpura`,
`mridangam` and `clap` (notes are stroke names: `thom`, `nam`, `dhin`, `ta`,
`ki`, `gumki`; `clap`, `tap`), `pluck`, `mallet`, `tick`, `chirp` and `swell`;
see `engine/music.js` for their options. A score may name its rhythm with `label`. `renderMusic(score, seconds)` renders a score offline, for
checking levels.

## Inspiration

This started as a fun side project after seeing ASCII diorama demos circulating
online, in particular the work by
[@HelloVyom](https://x.com/HelloVyom/status/2116539949080272964) and
[@dhruvtwt\_](https://x.com/dhruvtwt_/status/2117295437535482001)
([repo](https://github.com/JDhruv14/ascii-diorama)). The rendering technique
(Three.js → glyph shader → tilt-shift) comes from a shared Claude Code skill
template; these scenes build on it with different subjects and props.

## Assets and licences

Everything else (terrain, props, water, clouds, the glyph atlas) is generated in code.

| Asset | Source | Licence |
|---|---|---|
| Ground textures (`tex/*.jpg`) | [Poly Haven](https://polyhaven.com) | CC0 |
| Fox model (`Fox.glb`) | [Khronos glTF samples](https://github.com/KhronosGroup/glTF-Sample-Models) | CC-BY 4.0 |
