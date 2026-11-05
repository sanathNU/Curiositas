# ASCII Dioramas

Miniature 3D worlds rendered as coloured monospace glyphs with a tilt-shift blur,
seen from high above through a long lens. Each scene is a self-contained Three.js
sketch that draws instanced geometry (grass, flowers, trees, props) into a
half-float render target, then passes it through two post-processing stages:

1. **Glyph pass** — reads each cell from the 3D render, picks a character based on
   surface class and brightness, and colours it from the scene. The cell background
   is a dim copy of the render so gaps between glyphs still carry colour.
2. **Tilt-shift pass** — applies bokeh blur above and below a focus band, producing
   the miniature-photography effect.

## Running

```bash
npm install        # once, from this directory
node serve.mjs     # homepage at http://127.0.0.1:5173/
```

Opens a homepage listing all scenes; click one to open it. Every page reload
rebuilds the bundle. Press **Space** to pause. Pass a port as an argument if
5173 is taken.

Single-scene mode still works:

```bash
node serve.mjs harbour       # just harbour at http://127.0.0.1:5173/
node serve.mjs torii 5175    # torii on port 5175
```

## Scenes

| Scene | Subject | Canvas |
|---|---|---|
| `harbour` | Fishing harbour with breakwater, boats, lighthouse | 1440×1440 (square) |
| `torii` | Japanese torii gates along a cliff path to the sea | 1080×1920 (portrait) |
| `temple-south` | South Indian temple: gopuram towers, Nandi, pushkarini | 1080×1920 (portrait) |

## Project structure

```
ascii-dioramas/
  serve.mjs              custom dev server (bundles per scene, resolves shared assets)
  package.json           three + esbuild
  assets/
    models/Fox.glb       animated fox model (harbour, torii)
    tex/*.jpg            shared ground textures (Poly Haven, CC0)
  scenes/
    harbour/main.js      ~550 lines
    torii/main.js         ~540 lines
    temple-south/main.js  ~750 lines
```

Each scene is one `main.js` — no framework, no build config per scene. The serve
script bundles it with esbuild and resolves `assets/` from the project root.

## How the rendering pipeline works

### Surface classes (CLS)

Every material is tagged with a class ID (1–13) by encoding it in the alpha channel:

```
CLS = { grass: 1, leaf: 2, trunk: 3, stone: 4, stair: 5, ... }
tag(material, classId)  // sets material.alphaTest to encode the class
```

The glyph fragment shader reads the class from the alpha of the 3D render and
selects characters accordingly:

- grass → `/ | \` (lean with wind)
- foliage → `. : * + o`
- stone → `— = #`
- water → `- ~ =` with foam `* % #`
- creatures → `$ &`

### Instanced density

Scenes use `InstancedMesh` for grass (100k–200k blades), flowers (70k–85k),
leaf cards, and path props (lanterns, steps). Wind animation is done in the
vertex shader with sine-based displacement, keeping CPU cost near zero.

### Camera

The camera sits ~70 units from the subject at ~55° down, FOV ~23. It sweeps
slowly back and forth over ~14° of yaw with eased turns and a slight dolly.
The sweep period is ~24 seconds.

### Creatures

- **harbour / torii**: Fox.glb (animated GLTF, `MeshBasicMaterial` to avoid NaN
  in the half-float target). Walks a CatmullRom path with ping-pong traversal
  and delta-time animation.
- **temple-south**: Fox.glb tinted chital-brown, walking on grass beside the
  path (offset from the stone steps). Same model, warm colour multiply.

## Adding a new scene

1. `mkdir scenes/<name>` and create `main.js`
2. Copy the pipeline boilerplate from an existing scene (atlas builder, glyph
   shader, tilt-shift shader, render loop)
3. Change the terrain, props, colours, and path
4. `node serve.mjs <name>`

The serve script auto-discovers scenes by looking for `scenes/<name>/main.js`.

## Inspiration

This started as a fun side project after seeing ASCII diorama demos circulating
online — in particular the work by
[@HelloVyom](https://x.com/HelloVyom/status/2116539949080272964) and
[@dhruvtwt\_](https://x.com/dhruvtwt_/status/2117295437535482001)
([repo](https://github.com/JDhruv14/ascii-diorama)). The rendering technique
(Three.js → glyph shader → tilt-shift) comes from a shared Claude Code skill
template; these scenes build on it with different subjects and props.

## Assets and licences

| Asset | Source | Licence |
|---|---|---|
| Ground textures (`tex/*.jpg`) | [Poly Haven](https://polyhaven.com) | CC0 |
| Fox model (`Fox.glb`) | [Khronos glTF samples](https://github.com/KhronosGroup/glTF-Sample-Models) | CC-BY 4.0 |
