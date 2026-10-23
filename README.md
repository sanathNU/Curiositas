# Curiositas

Small web experiments, each in its own folder under `projects/` with its own toolchain.
Served at `https://sanathnu.github.io/Curiositas/<project>/`; each project's workflow deploys
only itself into its subfolder of the `gh-pages` branch. Write-ups live on
[Technica Insania](https://sanathnu.github.io/TechnicaInsania/).

## Projects

| Project | What it is | Toolchain |
|---|---|---|
| [atlas-of-crypto](projects/atlas-of-crypto/) | Theoretical cryptography as a map: topics as provinces, a note for each, results as links. [Live](https://sanathnu.github.io/Curiositas/atlas-of-crypto/) | plain static |
| [sdoc-viewer](projects/sdoc-viewer/) | Client-side reader for Samsung Notes (`.sdocx` / `.sdoc`) files, with handwriting rendered by a WASM parser. [Live](https://sanathnu.github.io/Curiositas/sdoc-viewer/) | Vite + WASM |

## Local preview

```sh
scripts/serve.sh        # http://localhost:8000/Curiositas/
```

Mirrors the Pages layout with symlinks, so edits show up on refresh.

## Adding a project

1. Put it in `projects/<kebab-case-name>/`. That name becomes the URL segment.
2. Copy `.github/workflows/atlas-of-crypto.yml` to `<name>.yml`, then change the name, the paths
   filter, the build/staging step and `destination_dir`. Keep `concurrency: gh-pages-deploy` so
   deploys don't race.
3. Use relative asset paths: pages are served under `/Curiositas/<name>/`, not `/`.
4. Add a line to the project list in `index.html` and to the table above.

Removing a project doesn't delete its folder from `gh-pages`; delete it on that branch by hand.
