// Any picture drawn by the diorama engine. ?img=<url> picks the image (same origin, or a server
// that allows cross-origin loads) and ?depth=<url> its depth map (tools/depth.py); ?depth=off
// draws the picture flat, ?depth=auto estimates depth in the browser. Dropping an image file on
// the page swaps it; "Add depth" estimates depth on this device.
// Default: Venice waterfront at sunset, cropped from Poly Haven's "venice_sunset" (CC0).
import { runPicture } from '../../engine/index.js';

const q = new URLSearchParams(location.search);
const img = q.get('img') || 'assets/pictures/venice.jpg';
const depth = q.get('depth') === 'off' ? null : q.get('depth') || (q.get('img') ? null : 'assets/pictures/venice.depth.png');
// ?tear=off keeps the relief one continuous sheet (stretching across depth edges), for comparison;
// ?tear=<n> sets where it tears (depth change per image width)
const tear = q.get('tear') === 'off' ? { tear: 1e9, fill: 0 } : Number.isFinite(+q.get('tear')) && q.get('tear') ? { tear: +q.get('tear') } : {};
// ?sway=<degrees> widens the automatic sway (default 2)
const sway = +q.get('sway') > 0 ? { sway: [+q.get('sway'), +q.get('sway') / 2] } : {};
runPicture({ src: img, depth, title: 'Picture', parallax: q.get('parallax') !== 'off', ...tear, ...sway }).catch(e => console.error(e));
