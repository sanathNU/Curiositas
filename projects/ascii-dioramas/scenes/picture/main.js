// Any picture drawn by the diorama engine. ?img=<url> picks the image (same origin, or a server
// that allows cross-origin loads); dropping an image file on the page swaps it.
// Default: Venice waterfront at sunset, cropped from Poly Haven's "venice_sunset" (CC0).
import { runPicture } from '../../engine/index.js';

const img = new URLSearchParams(location.search).get('img') || 'assets/pictures/venice.jpg';
runPicture({ src: img, title: 'Picture' }).catch(e => console.error(e));
