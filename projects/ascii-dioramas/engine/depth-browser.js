// Depth estimation in the browser, for pictures that come without a depth map (a dropped file,
// ?img= without ?depth=). Runs Depth Anything V2 Small through Transformers.js, on the GPU via
// WebGPU when the device supports half floats, otherwise on the CPU via WebAssembly.
// The image never leaves the device; the library, ONNX Runtime and the model weights are fetched
// once (about 50 MB) from jsDelivr and Hugging Face and then cached by the browser.
// Model: Yang et al., "Depth Anything V2" (2024), https://arxiv.org/abs/2406.09414
import * as THREE from 'three';

// pinned: a self-contained ESM build (ONNX Runtime bundled), loaded only when depth is asked for
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
const MODEL = 'onnx-community/depth-anything-v2-small';
// a variable specifier, so the bundler leaves this import to the browser
const importUrl = (url) => import(/* @vite-ignore */ url);

let estimator = null;

/** WebGPU with shader-f16 runs the 19 MB q4f16 weights; everything else the 27 MB int8 weights on WASM. */
async function pickBackend() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter?.features.has('shader-f16')) return { device: 'webgpu', dtype: 'q4f16' };
  } catch { /* no WebGPU */ }
  return { device: 'wasm', dtype: 'q8' };
}

/**
 * Load the depth pipeline once. `onProgress({ loaded, total })` reports model download bytes.
 * @returns {Promise<Function>} the Transformers.js depth-estimation pipeline
 */
function loadEstimator(onProgress) {
  estimator ??= (async () => {
    const { pipeline, env } = await importUrl(TRANSFORMERS);
    env.allowLocalModels = false;
    const files = new Map();
    const progress_callback = (p) => {
      if (p.status !== 'progress' || !p.total) return;
      files.set(p.file, p);
      let loaded = 0, total = 0; for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      onProgress?.({ loaded, total });
    };
    const backend = await pickBackend();
    // The CPU path runs on the main thread, so the page pauses while it estimates (about 5 s on a
    // fast laptop). ONNX Runtime's worker proxy avoided that but measured about 6x slower.
    try {
      return await pipeline('depth-estimation', MODEL, { ...backend, progress_callback });
    } catch (e) {
      if (backend.device === 'wasm') throw e;
      return pipeline('depth-estimation', MODEL, { device: 'wasm', dtype: 'q8', progress_callback }); // WebGPU refused: fall back
    }
  })();
  estimator.catch(() => { estimator = null; }); // let a later attempt retry
  return estimator;
}

/**
 * Estimate a depth map for the image at `url` (any URL the page can fetch, blob: URLs included).
 * Returns a texture in the same convention as tools/depth.py: white near, black far, rows the
 * same way up as an image texture.
 * @param {string} url
 * @param {{ onProgress?: (p: { loaded: number, total: number }) => void, onStage?: (stage: string) => void }} [hooks]
 * @returns {Promise<THREE.Texture>}
 */
export async function estimateDepth(url, { onProgress, onStage } = {}) {
  onStage?.('loading');
  const run = await loadEstimator(onProgress);
  onStage?.('estimating');
  const { depth } = await run(url);
  const tex = new THREE.CanvasTexture(depth.toCanvas());
  tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  return tex;
}
