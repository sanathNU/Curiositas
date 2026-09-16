import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

// vite-plugin-wasm lets Vite instantiate the wasm-bindgen build of
// @twango/sdocx (bundler target). It relies on top-level await, which the
// `esnext` build target below emits natively — no top-level-await plugin
// needed (that plugin's swc pass crashes on this input during `vite build`).
export default defineConfig({
  // Relative base so the built site works from any path — a bare domain, a
  // project subpath (e.g. /unsdocx/), or a preview URL — without config.
  base: './',
  plugins: [wasm()],
  optimizeDeps: {
    // don't pre-bundle the wasm package; let the plugins process it
    exclude: ['@twango/sdocx'],
  },
  build: {
    // wasm + top-level await need a modern output target
    target: 'esnext',
    // keep the .wasm as a fetched asset (don't inline the 224 KB binary)
    assetsInlineLimit: 0,
  },
  server: { port: 5173, open: true },
  preview: { port: 4173 },
});
