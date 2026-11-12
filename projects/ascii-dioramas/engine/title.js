// Scene title over the top of the frame: italic serif name between ruled lines and sparkles.
// Sized in container units, so it scales with the rendered frame on any screen.

const FONT = 'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@1,500&display=swap';

// Two rules fading toward the outside edge, then a large and two small four-point sparkles
// beside the text. Drawn for the left side; the right side is the same SVG mirrored.
const star = (x, y, s) => `M${x},${y - s}Q${x},${y} ${x + s},${y}Q${x},${y} ${x},${y + s}Q${x},${y} ${x - s},${y}Q${x},${y} ${x},${y - s}Z`;
const ornament = (id) => `<svg viewBox="0 0 120 20" aria-hidden="true" focusable="false">
  <defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="currentColor" stop-opacity="0"/><stop offset=".35" stop-color="currentColor" stop-opacity=".9"/><stop offset="1" stop-color="currentColor"/></linearGradient></defs>
  <rect x="0" y="8.2" width="94" height="1.5" fill="url(#${id})"/>
  <rect x="22" y="11.6" width="72" height=".8" fill="url(#${id})"/>
  <path d="${star(105, 9, 5)}${star(113.5, 14.5, 2.4)}${star(112, 3.5, 1.8)}" fill="currentColor"/>
</svg>`;

/** Add the title to `stage` (an element sized like the frame). Returns the title element. */
export function mountTitle(stage, text) {
  if (!document.querySelector(`link[href="${FONT}"]`)) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = FONT; document.head.append(link);
  }
  const style = document.createElement('style');
  style.textContent = `
    .diorama-title { position: absolute; left: 50%; top: 3%; transform: translateX(-50%);
      display: flex; align-items: center; gap: .45em; white-space: nowrap; pointer-events: none; user-select: none;
      color: #f2e6cc; font: italic 500 max(15px, min(7.5cqw, 4.2cqh))/1 "EB Garamond", Garamond, Georgia, serif;
      letter-spacing: .01em; text-shadow: 0 1px 2px rgba(0,0,0,.55), 0 0 18px rgba(0,0,0,.45); }
    .diorama-title svg { width: 3.4em; height: .57em; overflow: visible; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.6)); }
    .diorama-title svg:last-child { transform: scaleX(-1); }`;
  document.head.append(style);
  const el = document.createElement('div');
  el.className = 'diorama-title';
  el.innerHTML = `${ornament('title-l')}<span></span>${ornament('title-r')}`;
  el.querySelector('span').textContent = text;
  stage.append(el);
  return el;
}
