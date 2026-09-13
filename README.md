# sdocx viewer

A fully client-side viewer for Samsung Notes files (`.sdocx` and older `.sdoc`).
Browses the Zip container (structure, embedded media, metadata) and renders
handwriting via the reverse-engineered
[`@twango/sdocx`](https://github.com/twangodev/sdocx) WASM parser.

Everything runs in the browser. **No file is ever uploaded** — the note never
leaves your machine, which makes this safe to host as a static site.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173, opens automatically
```

Drop a `.sdocx` file onto the page.

## Build & deploy

It's a static site — build once, serve the `dist/` folder anywhere.

```bash
npm run build      # -> dist/
npm run preview    # serve the production build locally at :4173
```

Config notes that make it host-anywhere:

- `base: './'` in `vite.config.js` — assets use relative paths, so the build
  works from a bare domain **or** a subpath (`example.com/sdocx-viewer/`)
  without changes.
- `build.target: 'esnext'` — the wasm-bindgen bundle needs top-level await,
  emitted natively at this target (no `vite-plugin-top-level-await` required).
- The `.wasm` is emitted as a fingerprinted, fetched asset, not inlined.

### Static hosts

Zero-config on any static host. Config files are included for the two most
common:

| Host    | File           | Deploy                                            |
|---------|----------------|---------------------------------------------------|
| Netlify | `netlify.toml` | connect the repo, or `netlify deploy --prod`      |
| Vercel  | `vercel.json`  | connect the repo, or `vercel --prod`              |
| Any     | —              | `npm run build`, upload `dist/`                    |

Both config files set `Content-Type: application/wasm` on `.wasm` responses.
Most hosts already do this; if handwriting fails to load on some other host,
that header is the first thing to check.

The app needs no server, no environment variables, and no cross-origin
isolation headers (it doesn't use threads or `SharedArrayBuffer`).

## Tabs

- **Pages** — handwriting, rendered stroke-by-stroke on canvas (needs the ink engine)
- **Media** — embedded images and audio extracted from the container
- **Structure** — the internal Zip entry tree; click a `.note`/`.dat` to inspect text/hex
- **Raw** — the full parsed document object plus the Zip manifest as JSON

## Known limitation: dropped strokes

`@twango/sdocx` is a reverse-engineered parser and mis-decodes a fraction of
strokes into uninitialized-memory garbage — whole strokes of huge (`2.8e+160`)
or denormal (`9e-271`) float coordinates. Left in, these blow up the page
bounds and push everything off-canvas.

The renderer filters them out per stroke: a coordinate is treated as real only
when it is `0` or `|v|` in `[1e-3, 1e5]` (page pixels live in ~`0..2000`).
Corruption is always whole-stroke, never mixed within a stroke, so this drops
the bad strokes cleanly without bridging real ones. On a typical note that's
~7% of strokes silently missing. The text remains readable; it's a parser
defect, not a renderer bug.

If strokes render but look *wrong* (offset, mis-colored) rather than missing,
open the **Raw** tab — it shows the real field names from your file, the ground
truth for tuning the renderer.

## Zero-browser alternative (Rust)

To just confirm a file parses, or to convert it:

```bash
cargo install sdocx-cli
sdocx-cli your-note.sdocx          # prints pages, strokes, colors
```

For vector PDF output, see `squ1dd13/sdocx2pdf`.
