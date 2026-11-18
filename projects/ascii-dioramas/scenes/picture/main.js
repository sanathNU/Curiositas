// Any picture drawn by the diorama engine. ?img=<url> picks the image (same origin, or a server
// that allows cross-origin loads) and ?depth=<url> its depth map (tools/depth.py); ?depth=off
// draws the picture flat, ?depth=auto estimates depth in the browser. Dropping an image file on
// the page swaps it; "Add depth" estimates depth on this device.
// Default: Venice waterfront at sunset, cropped from Poly Haven's "venice_sunset" (CC0).
import { runPicture } from '../../engine/index.js';

const q = new URLSearchParams(location.search);
const img = q.get('img') || 'assets/pictures/venice.jpg';
const depth = q.get('depth') === 'off' ? null : q.get('depth') || (q.get('img') ? null : 'assets/pictures/venice.depth.png');
runPicture({ src: img, depth, title: 'Picture', parallax: q.get('parallax') !== 'off' }).catch(e => console.error(e));
