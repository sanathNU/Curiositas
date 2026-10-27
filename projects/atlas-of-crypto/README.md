# Atlas of Theoretical Cryptography

Theoretical cryptography drawn as a continent. Areas (hardness assumptions, primitives, proof
systems, advanced constructions, neighbouring theory) are countries, topics are provinces, and the
faint lines between provinces are results: an arrow from one topic to another means the first is
used to build, prove or understand the second. Every topic has a note, and notes open beside each
other like pages on a desk.

Live at <https://sanathnu.github.io/Curiositas/atlas-of-crypto/>.

This folder is only the content. The page and the tools are the shared
[atlas engine](../../lib/atlas/), whose README describes the data files and how the map is drawn.

```
data/
  site.js         title, meta text and the About note's opening
  areas.js        countries and their layout hints
  topics.js       one entry per topic: label, country, summary, results, papers
  links.js        results between topics: [from, to, label]
  keywords.js     words shown around a topic when zoomed in
  reading.js      free texts and which notes cite them
  notes.js        note bodies: defining identity, figure caption, text
  geo.js          map geometry, generated; do not edit by hand
  figs/           optional figure per note: <id>.svg
dist/             built page (gitignored)
```

## Run locally

From the repo root:

```sh
node lib/atlas/tools/atlas.mjs build projects/atlas-of-crypto --link   # once
scripts/serve.sh                                                       # http://localhost:8000/Curiositas/atlas-of-crypto/
```

With `--link`, edits to the data or the engine show up on refresh.

## Adding a topic

1. `data/topics.js`: add `{id, l, c, s, r, p}`. Use `k:1` for a key topic, whose label wins when the
   map is crowded.
2. `data/notes.js`: add `id: {i, t}`. In `t`, `{{Wikipedia title|text}}` links out and `[[id|text]]`
   links to another note. Paragraphs are separated by `\n\n`.
3. `data/links.js`: at least one `[from, to, label]` edge.
4. `data/keywords.js` and the `NOTES` map in `data/reading.js`: an entry each (`[]` is fine).
5. Redraw the map: `node lib/atlas/tools/atlas.mjs generate projects/atlas-of-crypto`. Neighbouring
   provinces move to make room, so look at the result before committing.
6. `node lib/atlas/tools/atlas.mjs check projects/atlas-of-crypto` must report `✓ consistent`. The
   deploy workflow checks too, before it builds.

The same goes for any change to labels, keywords, links or countries: edit the data, then regenerate.

## Adding a figure

1. Draw `data/figs/<id>.svg` by the rules in the [engine README](../../lib/atlas/README.md#figures):
   420 wide, colours from classes, ids starting with the topic id.
2. Add its caption as `f` to the note in `data/notes.js`: how to read the picture, not a repeat of the text.
3. `node lib/atlas/tools/atlas.mjs build projects/atlas-of-crypto --link` again (figures are inlined at
   build time), then look at the note in light, dark and at phone width.
