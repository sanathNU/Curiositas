# Atlas engine

The page, styles and tools behind every atlas in this repo: a field of knowledge drawn as a
continent, with areas as countries, topics as provinces, a note for each topic, and the results
that connect them. An atlas is just a `data/` folder; this engine turns it into a page.
[atlas-of-crypto](../../projects/atlas-of-crypto/) is the first one.

Plain HTML, CSS and JS; D3 7.8.5 comes from cdnjs. The tools need Node 22 and nothing else.

```
index.html        page template; build fills the {{…}} fields from data/site.js
style.css         all styles, light and dark (EB Garamond); nine country colours, --f-0 … --f-8
theme.js          dark-mode toggle, shares its storage key with the Curiositas landing page
app.js            map, notes, path tracing, search, label sizing and decluttering
tools/
  atlas.mjs       CLI: check, generate, build
  generate.mjs    map generator: data → data/geo.js
  lib.mjs         data loader shared by the tools
```

## Commands

Run from the repo root; the atlas folder defaults to the current directory.

```sh
node lib/atlas/tools/atlas.mjs check    projects/<atlas>             # validate the data
node lib/atlas/tools/atlas.mjs generate projects/<atlas> [--seed N]  # redraw the map into data/geo.js
node lib/atlas/tools/atlas.mjs build    projects/<atlas> [--link]    # check, then write the page to dist/
```

`build` copies the engine and the data into `dist/`, which is what the deploy workflow publishes.
With `--link` it symlinks them instead, so edits to the engine or the data show up on refresh;
`scripts/serve.sh` serves `dist/` when it exists. `dist/` is gitignored.

## Data

An atlas folder holds `data/` with these files, loaded as plain scripts in this order:

| File | Defines | What |
|---|---|---|
| `site.js` | `SITE` | `title`, `description` (meta), `tagline`, `mapLabel` (aria-label) and `about`: the atlas's own paragraphs in the About note. Optional: `begin` ("Where to begin") and `hideReading` (ids in `RES` kept out of "Further reading"). |
| `areas.js` | `CL`, `SEC`, `LEG` | Countries. `CL[c].y` is the vertical band the generator aims for (low = top), `x` an optional nudge, `y: null` no home region (its topics settle beside what they link to). `SEC` names them, `LEG` orders the legend and the colours. |
| `topics.js` | `NODES` | One entry per topic: `id`, label `l`, country `c`, summary `s`, results `r`, papers `p`, optional bridge `b`; `k: 1` marks a key topic, whose label wins when the map is crowded. |
| `links.js` | `EDGES` | Results between topics: `[from, to, label]`. |
| `keywords.js` | `SUB` | Words shown around each topic when zoomed in (`[]` is fine). |
| `reading.js` | `RES`, `SHORT`, `NOTES` | Free texts (`[kind, title, url]`), short names, and which texts each note cites. |
| `notes.js` | `BODY` | Note bodies: optional defining identity `i`, text `t`. In note text (and in `SITE.about` and `begin`), `{{Wikipedia title\|text}}` links out, `[[id\|text]]` links to another note, and paragraphs are separated by `\n\n`. |
| `geo.js` | `GEO` | Map geometry, written by `generate`; do not edit by hand. |

Colours go to countries in `LEG` order; a tenth country starts the palette again.

## The map

`generate` draws the whole map from the data, in about half a second for 72 topics:

1. **Layout.** Countries are placed by a small force simulation over the links between them, with
   the `y` band as a soft hint and `x` as an optional nudge. Topics are then placed inside their
   country: links pull, labels collide, and topics of different countries keep a little further
   apart. A country with `y: null` has no home; its topics settle next to whatever they link to.
2. **Shapes.** Each shape is the zero contour of a signed-distance field. Land is a metaball field
   around the topics with noise for the coast. A province is its topic's cell in a power diagram
   (longer labels get larger cells), taken in slightly warped space so borders curve, then cut to the
   land; a country is the union of its topics' cells. On a shared border the two sides' fields are
   exact negatives, so their contours coincide point for point.
3. **Labels.** Each label goes where its box has the most room inside its province; keywords go on
   ellipses around it, clear of every label on the map.

The output is deterministic, so `geo.js` only changes when the data does. `--seed N` tries a different
arrangement; the knobs (spacing, landscape stretch, border wobble, coast noise) are in the `P` object at
the top of `generate.mjs`. On the page, `LABEL` in `app.js` sets how big labels are on screen: they
hold a minimum size while zoomed out, down to the whole-map view, and stop growing past a maximum
when zoomed in.

## A new atlas

1. Make `projects/<name>/data/` with the files above. Copying atlas-of-crypto's and cutting it down
   is the quickest start.
2. `node lib/atlas/tools/atlas.mjs generate projects/<name>`, then `build projects/<name> --link`,
   and look at it under `scripts/serve.sh`. Regenerate after any change to topics, labels, keywords,
   links or countries.
3. Copy `.github/workflows/atlas-of-crypto.yml` to `<name>.yml` and replace the atlas name in it
   (name, paths filter, build step, `publish_dir`, `destination_dir`).
4. Add it to the landing page (`index.html` at the repo root) and the table in the root README.
