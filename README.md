# unsdocx

A fully client-side viewer for Samsung Notes files (`.sdocx` and older `.sdoc`) —
because Samsung won't ship one.

Samsung Notes can export to PDF, but only from a Samsung device with the app
installed. If you have the `.sdocx` and not the phone, the file is effectively
a brick. This reads it in a browser tab: the Zip container (structure, embedded
media, metadata) plus full page rendering — ink, imported slides, photos —
through the reverse-engineered
[`@twango/sdocx`](https://github.com/twangodev/sdocx) WASM parser.

Everything runs locally. **No file is ever uploaded** — the note never leaves
your machine, which is what makes it safe to host as a static site.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173, opens automatically
```

Drop a `.sdocx` onto the page, or use the fixture committed at
`test/Testing doc.sdocx`.

## Tabs

| Tab | What it shows |
|-----|---------------|
| **Pages** | Full page rendering: ink plus imported slides and photos (needs the ink engine) |
| **Media** | Embedded images and audio extracted from the container |
| **Structure** | The internal Zip entry tree; click a `.note`/`.dat` to inspect text or hex |
| **Raw** | The parsed document object, engine diagnostics, and the Zip manifest as JSON |

### Getting a page out

Hover a page and hit **Save PNG**. Pages are rasterized at 2× their intrinsic
size (1600×2262 → 3200×4524) on an opaque background, so they stay sharp when
printed or zoomed and don't come out transparent.

Works on phones too — the sidebar becomes a drawer and the save button is
always visible where there's no hover.

## How pages are rendered

Pages go through `DocumentSession.render_svg()` from `@twango/sdocx` 0.4.0 —
the parser rasterizes each page to SVG in Rust, and the viewer shows the result
as an `<img>`. Rendering lives in the engine rather than in this repo on
purpose.

An earlier version drew `page.strokes` onto a canvas by hand. That worked for
pure-handwriting notes and broke badly on anything built from imported PDFs or
slides:

- It never drew `page.elements`, so a page whose content is an imported image
  rendered completely blank.
- It passed `pen_width` to `ctx.lineWidth` unsanitized. The decoder emits
  uninitialized-memory garbage in that field — values like `4.05e+31` — which
  became a page-filling black rectangle.

Delegating to the engine also sidesteps `element.media_index`, which can't be
resolved from JavaScript: it restarts at `0` on every page, and no offset into
the flat `metadata.media_assets` list reproduces the correct mapping.

Two consequences worth knowing:

- Each page SVG is 5–14 MB, so pages render lazily as you scroll rather than
  all at once.
- The engine bakes the color mode into the SVG, so flipping the theme
  re-renders the visible pages.

It's still a reverse-engineered parser, so a page can come out incomplete. If
something looks wrong, open the **Raw** tab — it shows the parsed fields from
your own file plus any diagnostics the engine reported.

## Build & deploy

It's a static site — build once, serve `dist/` anywhere.

```bash
npm run build      # -> dist/
npm run preview    # serve the production build locally at :4173
```

Config choices that make it host-anywhere:

- `base: './'` in `vite.config.js` — assets use relative paths, so the build
  works from a bare domain **or** a subpath (`example.com/unsdocx/`) with no
  changes.
- `build.target: 'esnext'` — the wasm-bindgen bundle needs top-level await,
  emitted natively at this target (no `vite-plugin-top-level-await`, whose swc
  pass crashes on this input).
- The `.wasm` is emitted as a fingerprinted, fetched asset rather than inlined.

### Static hosts

| Host    | File           | Deploy                                       |
|---------|----------------|----------------------------------------------|
| Netlify | `netlify.toml` | connect the repo, or `netlify deploy --prod` |
| Vercel  | `vercel.json`  | connect the repo, or `vercel --prod`         |
| Any     | —              | `npm run build`, upload `dist/`              |

Both config files set `Content-Type: application/wasm` on `.wasm` responses.
Most hosts do this already; if the ink engine fails to load on some other host,
that header is the first thing to check.

No server, no environment variables, and no cross-origin isolation headers —
it doesn't use threads or `SharedArrayBuffer`.

## Zero-browser alternative (Rust)

To just confirm a file parses, or to convert it:

```bash
cargo install sdocx-cli
sdocx-cli your-note.sdocx          # prints pages, strokes, colors
```

For vector PDF output, see
[`squ1dd13/sdocx2pdf`](https://github.com/squ1dd13/sdocx2pdf).

## License

[MIT](LICENSE) for the source in this repository.

Note that a build is a different matter: `dist/` bundles a compiled copy of
`@twango/sdocx`, which is **GPL-3.0**. The MIT grant doesn't extend to that
binary, so redistributing a build means distributing GPL-3.0 code and taking on
its obligations. Cloning and building for yourself is unaffected; read the
GPL-3.0 terms before shipping a build to others.

Samsung Notes and the `.sdocx` format are Samsung's. This is an independent,
reverse-engineered reader with no affiliation or endorsement.
