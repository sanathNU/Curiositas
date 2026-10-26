# Atlas of Theoretical Cryptography

Theoretical cryptography drawn as a continent. Areas (hardness assumptions, primitives, proof
systems, advanced constructions, neighbouring theory) are countries, topics are provinces, and the
faint lines between provinces are results: an arrow from one topic to another means the first is
used to build, prove or understand the second. Every topic has a note, and notes open beside each
other like pages on a desk.

Live at <https://sanathnu.github.io/Curiositas/atlas-of-crypto/>.

## Layout

Plain HTML, CSS and JS. No build step; D3 7.8.5 comes from cdnjs.

```
index.html        page shell
style.css         all styles, light and dark (EB Garamond)
theme.js          dark-mode toggle, shares its storage key with the Curiositas landing page
app.js            map, notes, path tracing, search, label decluttering
data/
  areas.js        countries (CL, SEC, LEG) and their layout hints
  topics.js       one entry per topic: label, country, summary, results, papers
  links.js        results between topics: [from, to, label]
  keywords.js     words shown around a topic when zoomed in
  reading.js      free texts and which notes cite them
  notes.js        note bodies: defining identity + text
  geo.js          map geometry, generated from the files above; do not edit by hand
tools/
  generate.mjs    map generator: data → data/geo.js (Node, no dependencies)
  atlas.mjs       data checker, run by the deploy workflow
  lib.mjs         shared loader
```

## The map

`node tools/generate.mjs` draws the whole map from the data, in about half a second:

1. **Layout.** Countries are placed by a small force simulation over the links between them, with
   the `y` band in `areas.js` as a soft hint (low numbers at the top) and `x` as an optional nudge.
   Topics are then placed inside their country: links pull, labels collide, and topics of different
   countries keep a little further apart. A country with `y: null` (Neighbouring areas) has no home;
   its topics settle next to whatever they link to.
2. **Shapes.** Each shape is the zero contour of a signed-distance field. Land is a metaball field
   around the topics with noise for the coast. A province is its topic's cell in a power diagram
   (longer labels get larger cells), taken in slightly warped space so borders curve, then cut to the
   land; a country is the union of its topics' cells. On a shared border the two sides' fields are
   exact negatives, so their contours coincide point for point.
3. **Labels.** Each label goes where its box has the most room inside its province; keywords go on
   ellipses around it, clear of every label on the map.

The output is deterministic, so `geo.js` only changes when the data does. `--seed N` tries a different
arrangement; the knobs (spacing, landscape stretch, border wobble, coast noise) are in the `P` object at
the top of the generator.

## Run locally

From the repo root, `scripts/serve.sh` serves everything with the same layout as GitHub Pages;
open <http://localhost:8000/Curiositas/atlas-of-crypto/>. Opening `index.html` directly also works.

## Adding a topic

1. `data/topics.js`: add `{id, l, c, s, r, p}`. Use `k:1` for a key topic, whose label wins when the
   map is crowded.
2. `data/notes.js`: add `id: {i, t}`. In `t`, `{{Wikipedia title|text}}` links out and `[[id|text]]`
   links to another note. Paragraphs are separated by `\n\n`.
3. `data/links.js`: at least one `[from, to, label]` edge.
4. `data/keywords.js` and the `NOTES` map in `data/reading.js`: an entry each (`[]` is fine).
5. Redraw the map: `node tools/generate.mjs`. Neighbouring provinces move to make room, so look at
   the result before committing.
6. `node tools/atlas.mjs check` must report `✓ consistent`. The deploy workflow runs it too.

The same goes for any change to labels, keywords, links or countries: edit the data, then regenerate.
