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
  areas.js        countries (CL, SEC, LEG)
  topics.js       one entry per topic: label, country, summary, results, papers
  links.js        results between topics: [from, to, label]
  keywords.js     words shown around a topic when zoomed in
  reading.js      free texts and which notes cite them
  notes.js        note bodies: defining identity + text
  geo.js          generated map geometry; do not edit by hand
tools/atlas.mjs   data checker and map editor (Node, no dependencies)
```

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
5. Give it a place on the map by carving part of a sibling's province in the same country:

   ```sh
   node tools/atlas.mjs carve <new-id> <sibling-id> [share]   # share defaults to 0.45
   ```

   This takes whole cells from the sibling where it can, and otherwise cuts one cell straight across,
   then re-places both labels and their keywords.
6. `node tools/atlas.mjs check` must report `✓ consistent`. The deploy workflow runs it too.

If you move keywords between topics, run `node tools/atlas.mjs relabel <id>` for each topic touched.
