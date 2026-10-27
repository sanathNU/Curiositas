const byId = Object.fromEntries(NODES.map(n => [n.id, n]));
const ins = {}, outs = {};
NODES.forEach(n => { ins[n.id] = []; outs[n.id] = []; });
const LINKS = EDGES.map(([s,t,l]) => ({s, t, l, key:s+">"+t}));
LINKS.forEach(e => { outs[e.s].push(e); ins[e.t].push(e); });
NODES.forEach(n => { n.deg = ins[n.id].length + outs[n.id].length; n.kw = SUB[n.id] || []; });
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => window.matchMedia("(max-width:760px)").matches;
const wikiURL = t => "https://en.wikipedia.org/wiki/" + encodeURIComponent(t.replace(/ /g, "_"));
const wikiSearch = t => "https://en.wikipedia.org/w/index.php?search=" + encodeURIComponent(t);
const scholar = t => "https://scholar.google.com/scholar?q=" + encodeURIComponent(t);
const ext = (href, text) => `<a class="ext" href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
const int = id => `<a class="int" data-open="${id}" data-pop="${id}" href="#${id}">${esc(byId[id].l)}</a>`;
const firstSentence = s => s.split(/(?<=\.)\s/)[0];
const fill = c => `var(--f-${LEG.indexOf(c) % 9})`;   // style.css has nine country colours, given out in legend order
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/* ---------- notes ---------- */
function paper(p){
  const m = p.match(/^(.*?)(?:, (.*))? \((\d{4})\)$/);
  if (!m) return `<li>${esc(p)}</li>`;
  const [ , au, ti, yr] = m;
  return `<li><a href="${scholar((ti || "") + " " + au)}" target="_blank" rel="noopener noreferrer" title="Search Google Scholar">${esc(au)}${ti ? `, <i>${esc(ti)}</i>` : ""}</a>, ${yr}</li>`;
}
function inline(text){
  return text
    .replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (m, id, tx) => `<a class="int" data-open="${id}" data-pop="${id}" href="#${id}">${tx || esc(byId[id].l)}</a>`)
    .replace(/\{\{([^|}]+)(?:\|([^}]+))?\}\}/g, (m, ti, tx) => ext(wikiURL(ti), tx || ti));
}
function md(text){ return text.split("\n\n").map(p => "<p>" + inline(p) + "</p>").join(""); }
function cite(p){
  const m = p.match(/^(.*?)(?:, (.*))? \((\d{4})\)$/);
  if (!m) return `<li>${esc(p)}</li>`;
  const [ , au, ti, yr] = m;
  return `<li>${esc(au)}${ti ? `, <i>${esc(ti)}</i>` : ""} (${yr})</li>`;
}
function noteHTML(id){
  if (id === "about") return aboutHTML();
  if (id.startsWith("path~")) return pathHTML(id);
  const n = byId[id], B = BODY[id] || {t: esc(n.s)};
  const books = (NOTES[n.id] || []).filter(k => RES[k] && !(SITE.hideReading || []).includes(k)).map(k => ext(RES[k][2], esc(RES[k][1])));
  const leads = outs[n.id].map(e => `<li>${int(e.t)} <span class="via">— ${esc(e.l)}</span></li>`).join("");
  const back = ins[n.id].map(e => `<a class="bl" data-open="${e.s}" href="#${e.s}"><b>${esc(byId[e.s].l)}</b><span class="via">${esc(e.l)}</span><span class="snip">${esc(firstSentence(byId[e.s].s))}</span></a>`).join("");
  return `<h1>${esc(n.l)}</h1>
    <p class="meta">${plural(n.deg, "connection")} · <a data-fly="${n.id}">show on map</a></p>
    ${B.i ? `<div class="eq">${B.i}</div>` : ""}
    ${FIG[id] ? `<figure class="fig" style="--acc:${fill(n.c)}">${FIG[id]}<figcaption>${inline(B.f || "")}</figcaption></figure>` : ""}
    <div class="body">${md(B.t)}</div>
    ${leads ? `<h2>Where it leads</h2><ul class="leads">${leads}</ul>` : ""}
    <h2>Further reading</h2>
    ${books.length ? `<p class="books">Free texts that treat this well: ${books.join("; ")}.</p>` : ""}
    <ol class="refs">${n.p.map(cite).join("")}</ol>
    <div class="backlinks"><h2>Links to this note</h2>${back || `<p class="muted">No incoming links yet.</p>`}</div>`;
}
function aboutHTML(){
  return `<h1>About this atlas</h1>
    <p class="meta">${esc(SITE.tagline)}</p>
    <div class="body">
    ${md(SITE.about)}
    <p>Notes open beside each other, like pages laid out on a desk. A link inside a note opens its target to the right and closes anything further along; clicking the map adds a note at the end. When the desk is full, older notes fold into spines at the left, and clicking a spine brings one back. The address bar records the whole stack, so a copied link reopens the same set of notes.</p>
    <h2>On the map</h2>
    <p><b>Find</b> searches topics and keywords, opens the note and flies the map there. <b>All links</b> draws every connection at once. <b>Path</b> traces the shortest chain of results between two topics and opens it as a note. Zooming in reveals keywords around each topic, and clicking one opens its topic with the word marked. Hovering a province or a link previews it. Where the map is crowded, labels of smaller topics step aside; zoom in and they return.</p>
    <p>Keys: <span class="sc">/</span> focuses Find, <span class="sc">Esc</span> closes the last note, <span class="sc">F</span> fits the map.</p>
    ${SITE.begin ? `<h2>Where to begin</h2>${md(SITE.begin)}` : ""}
    </div>`;
}

/* ---------- path ---------- */
function shortestPath(a, b){
  const adj = {}; NODES.forEach(n => adj[n.id] = []);
  LINKS.forEach(e => { adj[e.s].push([e.t, e]); adj[e.t].push([e.s, e]); });
  const prev = {[a]:null}, q = [a];
  while (q.length){ const u = q.shift(); if (u === b) break; for (const [v, e] of adj[u]) if (!(v in prev)){ prev[v] = [u, e]; q.push(v); } }
  if (a === b || !(b in prev)) return null;
  const steps = []; let cur = b;
  while (prev[cur]){ const [u, e] = prev[cur]; steps.unshift({from:u, to:cur, e}); cur = u; }
  return steps;
}
function pathHTML(id){
  const [, a, b] = id.split("~"); const steps = byId[a] && byId[b] ? shortestPath(a, b) : null;
  if (!steps) return `<h1>Path</h1><p class="muted">No connection found between these topics.</p>`;
  return `<h1>From ${esc(byId[a].l)} to ${esc(byId[b].l)}</h1>
    <p class="meta">${plural(steps.length, "step")} · <a data-flypath="${id}">show on map</a></p>
    <ol class="pathsteps"><li>${int(a)}</li>${steps.map(s => `<li><span class="via">${s.e.s === s.from ? "leads to" : "is built on by"}: ${esc(s.e.l)}</span>${int(s.to)}</li>`).join("")}</ol>`;
}

/* ---------- stack ---------- */
const stackEl = document.getElementById("stack");
const state = { stack:[], hover:null, path:null, flashKw:{} };
function titleOf(id){ if (id === "about") return "About this atlas"; if (id.startsWith("path~")){ const [,a,b] = id.split("~"); return `${byId[a]?.l || "?"} → ${byId[b]?.l || "?"}`; } return byId[id]?.l || id; }
function makePane(id){
  const sec = document.createElement("section");
  sec.className = "pane note"; sec.dataset.id = id;
  const crumb = byId[id] ? SEC[byId[id].c] : (id === "about" ? "About" : "Path");
  sec.innerHTML = `<div class="spine" data-goto="${esc(id)}"><span>${esc(titleOf(id))}</span></div>
    <div class="pane-in"><div class="pbar"><a class="mback" data-goto="map">‹ Map</a><span class="sc">${esc(crumb)}</span><span class="sp"></span><button class="x" aria-label="Close note" data-close="${esc(id)}">×</button></div>
    <article>${noteHTML(id)}</article></div>`;
  const kw = state.flashKw[id];
  if (kw) markKeyword(sec.querySelector(".body"), kw);
  return sec;
}
function markKeyword(root, kw){
  if (!root) return;
  const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())){
    const m = node.nodeValue.match(re);
    if (m){
      const r = document.createRange(); r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length);
      const mk = document.createElement("mark"); r.surroundContents(mk); return;
    }
  }
  root.insertAdjacentHTML("afterbegin", `<p class="kwnote">From the map: <mark>${esc(kw)}</mark></p>`);
}
function syncPanes(push){
  const panes = [...stackEl.querySelectorAll(".pane.note")];
  let keep = 0;
  while (keep < panes.length && keep < state.stack.length && panes[keep].dataset.id === state.stack[keep] && !state.flashKw[state.stack[keep]]) keep++;
  panes.slice(keep).forEach(p => p.remove());
  state.stack.slice(keep).forEach(id => stackEl.appendChild(makePane(id)));
  state.flashKw = {};
  [...stackEl.querySelectorAll(".pane")].forEach((p, i) => p.style.setProperty("--i", i));
  sizeMap();
  const h = "#" + state.stack.map(encodeURIComponent).join("/");
  if (location.hash !== h){ try { push ? history.pushState(null, "", h || "#") : history.replaceState(null, "", h || "#"); } catch(e){} }
  markOpen(); updateSpines();
}
function scrollToPane(id, flash){
  const el = id === "map" ? document.getElementById("p-map") : stackEl.querySelector(`.pane.note[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const kids = [...stackEl.children], i = kids.indexOf(el);
  const L = kids.slice(0, i).reduce((s, k) => s + k.offsetWidth, 0);
  const target = narrow() ? L : Math.max(0, L - i * parseInt(getComputedStyle(document.documentElement).getPropertyValue("--spine")));
  const right = L + el.offsetWidth - stackEl.clientWidth;
  const left = narrow() ? target : (stackEl.scrollLeft > target ? target : Math.max(stackEl.scrollLeft, right));
  stackEl.scrollTo({left, behavior: reduceMotion ? "auto" : "smooth"});
  if (flash){ const a = el.querySelector("article"); if (a){ a.classList.remove("flash"); void a.offsetWidth; a.classList.add("flash"); } }
}
function open(id, fromIndex, opts = {}){
  if (!(byId[id] || id === "about" || id.startsWith("path~"))) return;
  if (opts.kw) state.flashKw[id] = opts.kw;
  const at = state.stack.indexOf(id);
  if (at >= 0 && !opts.kw){ scrollToPane(id, true); return; }
  if (fromIndex === undefined || fromIndex < 0){ if (at >= 0) state.stack.splice(at, 1); state.stack.push(id); }
  else { state.stack = state.stack.slice(0, fromIndex); state.stack.push(id); }
  syncPanes(true);
  requestAnimationFrame(() => scrollToPane(id, false));
}
function close(id){ state.stack = state.stack.filter(x => x !== id); syncPanes(true); }
function sizeMap(){
  const vw = stackEl.clientWidth || window.innerWidth;
  const pw = Math.min(576, vw);
  const n = state.stack.length;
  const mw = narrow() ? vw : Math.max(Math.round(vw * 0.5), vw - n * pw);
  const p = document.getElementById("p-map");
  const old = p.offsetWidth;
  if (Math.abs(old - mw) > 1){
    const c = mapCenter();
    p.style.setProperty("--mapw", mw + "px");
    if (c) requestAnimationFrame(() => svg.call(zoom.translateTo, c[0], c[1], [viewW() / 2, svg.node().clientHeight / 2]));
  }
}
function updateSpines(){
  const panes = [...stackEl.querySelectorAll(".pane")];
  if (narrow()){ panes.forEach(p => p.classList.remove("obscured")); return; }
  panes.forEach((p, i) => {
    const nx = panes[i+1]; if (!nx){ p.classList.remove("obscured"); return; }
    const a = p.getBoundingClientRect(), b = nx.getBoundingClientRect();
    p.classList.toggle("obscured", b.left < a.left + 60);
  });
}
stackEl.addEventListener("scroll", () => requestAnimationFrame(updateSpines), {passive:true});
window.addEventListener("popstate", fromHash);
function fromHash(){
  const ids = decodeURIComponent(location.hash.slice(1)).split("/").filter(id => byId[id] || id === "about" || id.startsWith("path~"));
  state.stack = ids; syncPanes(false);
  const last = ids[ids.length - 1]; if (last) requestAnimationFrame(() => scrollToPane(last, false));
  const p = ids.find(x => x.startsWith("path~")); drawPath(p || null);
}

/* clicks */
document.addEventListener("click", e => {
  const o = e.target.closest("[data-open]");
  if (o){ e.preventDefault(); hidePop(); const pane = o.closest(".pane.note"); const idx = pane ? state.stack.indexOf(pane.dataset.id) + 1 : -1; open(o.dataset.open, pane ? idx : -1); return; }
  const g = e.target.closest("[data-goto]"); if (g){ e.preventDefault(); scrollToPane(g.dataset.goto, false); return; }
  const c = e.target.closest("[data-close]"); if (c){ close(c.dataset.close); return; }
  const f = e.target.closest("[data-fly]"); if (f){ e.preventDefault(); scrollToPane("map", false); setTimeout(() => flyTo(f.dataset.fly), reduceMotion ? 0 : 560); return; }
  const fp = e.target.closest("[data-flypath]"); if (fp){ e.preventDefault(); scrollToPane("map", false); setTimeout(() => drawPath(fp.dataset.flypath, true), reduceMotion ? 0 : 560); return; }
});

/* ---------- popups ---------- */
const pop = document.getElementById("pop");
const canHover = window.matchMedia("(hover: hover)").matches;
let popT, hideT;
function popHTML(id){
  const n = byId[id]; if (!n) return "";
  return `<span class="pt">${esc(n.l)}</span>${esc(n.s)}<span class="pm">${esc(SEC[n.c])} · ${plural(n.deg, "link")} · ${plural(n.p.length, "reference")}</span>`;
}
function placePop(x, y){
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let left = x + 14, top = y + 16;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  if (top + h > window.innerHeight - 8) top = y - h - 14;
  pop.style.left = Math.max(8, left) + "px"; pop.style.top = Math.max(8, top) + "px";
}
function showPop(html, x, y, delay){
  if (!canHover || !html) return;
  clearTimeout(hideT); clearTimeout(popT);
  popT = setTimeout(() => { pop.innerHTML = html; pop.hidden = false; placePop(x, y); }, delay);
}
function hidePop(){ clearTimeout(popT); hideT = setTimeout(() => pop.hidden = true, 60); }
document.addEventListener("mouseover", e => { const a = e.target.closest("a[data-pop]"); if (!a) return; const r = a.getBoundingClientRect(); showPop(popHTML(a.dataset.pop), r.left, r.bottom - 6, 260); });
document.addEventListener("mouseout", e => { if (e.target.closest("a[data-pop]")) hidePop(); });

/* ---------- map ---------- */
let svg, world, zoom, curK = 1, homeK = 1, provSel, edgeSel, lmSel, lsSel, spokeSel, pathG;
/* On-screen label sizes in px for topics (lm) and keywords (ls); `map` is the size the generator lays
   them out at. Zoomed out, labels hold `min` px (growing on the map) until the whole map is in view,
   then shrink with it. Zoomed in, they follow the map up to `max` px and settle there. */
const LABEL = { lm: {map: 11, min: 10.5, max: 15}, ls: {map: 7.2, min: 8.5, max: 12} };
const labelSize = (o, k) => Math.min(o.max, Math.max(o.map * k, o.min * Math.min(1, k / homeK))) / k;
function wrap(s, w){ const out = []; let line = ""; s.split(" ").forEach(word => { if ((line + " " + word).trim().length > w && line){ out.push(line); line = word; } else line = (line + " " + word).trim(); }); if (line) out.push(line); return out; }
function addText(sel, lines, lh){
  sel.each(function(d){ const t = d3.select(this), L = lines(d), off = -(L.length - 1) / 2;
    L.forEach((ln, i) => t.append("tspan").attr("x", t.attr("x")).attr("dy", i === 0 ? `${off * lh + 0.35}em` : `${lh}em`).text(ln)); });
}
function buildMap(){
  svg = d3.select("#map");
  world = svg.append("g");
  // land underlay in the border colour: where three countries meet, any sliver between fills reads as a junction dot
  world.append("path").attr("class","land").attr("d", GEO.coast).attr("fill-rule","evenodd");
  const gC = world.append("g");
  LEG.forEach(c => gC.append("path").attr("class","cl-fill").attr("d", GEO.clusters[c]).attr("fill", fill(c)).attr("fill-rule","evenodd"));
  provSel = world.append("g").selectAll("path").data(NODES).join("path").attr("class","prov").attr("d", d => GEO.prov[d.id]).attr("fill-rule","evenodd")
    .attr("tabindex", -1).attr("aria-label", d => d.l);
  const gL = world.append("g");
  LEG.forEach(c => gL.append("path").attr("class","cl-line").attr("d", GEO.clusters[c]));
  world.append("path").attr("class","coast").attr("d", GEO.coast);
  const P = id => GEO.main[id];
  edgeSel = world.append("g").selectAll("line").data(LINKS).join("line").attr("class","edge")
    .attr("x1", d => P(d.s)[0]).attr("y1", d => P(d.s)[1]).attr("x2", d => P(d.t)[0]).attr("y2", d => P(d.t)[1]);
  spokeSel = world.append("g").selectAll("line").data(GEO.subs).join("line").attr("class","spoke")
    .attr("x1", d => P(d[1])[0]).attr("y1", d => P(d[1])[1]).attr("x2", d => d[2]).attr("y2", d => d[3]);
  pathG = world.append("g");
  lsSel = world.append("g").selectAll("text").data(GEO.subs).join("text").attr("class","ls").attr("x", d => d[2]).attr("y", d => d[3]);
  addText(lsSel, d => wrap(d[0], 14), 1.05);
  lmSel = world.append("g").selectAll("text").data(NODES).join("text").attr("class","lm").attr("x", d => P(d.id)[0]).attr("y", d => P(d.id)[1])
    .attr("tabindex", 0).attr("role","link");
  addText(lmSel, d => wrap(d.l, 16), 1.0);

  const enter = (e, d) => { state.hover = d.id; markOpen(); showPop(popHTML(d.id), e.clientX, e.clientY, 120); };
  const move = e => { if (!pop.hidden) placePop(e.clientX, e.clientY); };
  const leave = () => { state.hover = null; markOpen(); hidePop(); };
  [provSel, lmSel].forEach(sel => sel.on("mouseenter", enter).on("mousemove", move).on("mouseleave", leave)
    .on("click", (e, d) => { if (e.defaultPrevented) return; hidePop(); open(d.id, -1); }));
  lmSel.on("keydown", (e, d) => { if (e.key === "Enter"){ e.preventDefault(); open(d.id, -1); } });
  lsSel.on("mouseenter", (e, d) => { state.hover = d[1]; markOpen(); showPop(`<span class="pt">${esc(d[0])}</span><span class="pm">Keyword in ${esc(byId[d[1]].l)}</span>`, e.clientX, e.clientY, 150); })
    .on("mousemove", move).on("mouseleave", leave)
    .on("click", (e, d) => { hidePop(); open(d[1], -1, {kw:d[0]}); });

  zoom = d3.zoom().scaleExtent([0.4, 6]).on("zoom", e => {
    world.attr("transform", e.transform); curK = e.transform.k;
    lmSel.attr("font-size", labelSize(LABEL.lm, curK));
    lsSel.attr("font-size", labelSize(LABEL.ls, curK));
    svg.classed("nosub", curK < 1.25);
    declutter();
  });
  svg.call(zoom).on("dblclick.zoom", null);
  document.getElementById("zin").onclick = () => svg.transition().duration(reduceMotion ? 0 : 220).call(zoom.scaleBy, 1.4);
  document.getElementById("zout").onclick = () => svg.transition().duration(reduceMotion ? 0 : 220).call(zoom.scaleBy, 1/1.4);
  fit(false);
}
function viewW(){
  const el = svg.node(), r = el.getBoundingClientRect(); let w = r.width;
  const first = stackEl.querySelector(".pane.note");
  if (first && !narrow()){ const fr = first.getBoundingClientRect(); if (fr.left < r.right) w = Math.max(240, Math.min(r.width, fr.left - r.left)); }
  return w;
}
function mapCenter(){ if (!svg) return null; const el = svg.node(), t = d3.zoomTransform(el); return t.invert([viewW() / 2, el.clientHeight / 2]); }
const boxK = (x0, y0, x1, y1, maxK = 4) => Math.min(viewW() / (x1 - x0), svg.node().clientHeight / (y1 - y0), maxK);
function fitBox(x0, y0, x1, y1, animate, maxK = 4){
  const W = viewW(), H = svg.node().clientHeight, k = boxK(x0, y0, x1, y1, maxK);
  const t = d3.zoomIdentity.translate(W/2 - k*(x0+x1)/2, H/2 - k*(y0+y1)/2).scale(k);
  (animate && !reduceMotion ? svg.transition().duration(500) : svg).call(zoom.transform, t);
}
function fit(animate){ const b = [-20, -10, GEO.W + 20, GEO.H + 10]; homeK = boxK(...b); fitBox(...b, animate); }
function flyTo(id){ const [x, y] = GEO.main[id]; fitBox(x - 170, y - 110, x + 170, y + 110, true, 2.2); }
function markOpen(){
  if (!provSel) return;
  const open = new Set(state.stack.filter(id => byId[id]));
  const f = state.hover || state.stack.filter(id => byId[id]).slice(-1)[0];
  const nb = new Set(); if (f){ ins[f].forEach(e => nb.add(e.s)); outs[f].forEach(e => nb.add(e.t)); }
  provSel.classed("open", d => open.has(d.id)).classed("hov", d => d.id === state.hover).classed("nb", d => nb.has(d.id) && !open.has(d.id));
  lmSel.classed("open", d => open.has(d.id));
  declutter();
  edgeSel.classed("on", d => f && (d.s === f || d.t === f));
  document.querySelectorAll("a.int").forEach(a => a.classList.toggle("isopen", open.has(a.dataset.open)));
}
/* Hide labels that would overlap at the current zoom: open and hovered topics first, then by
   number of connections. Hidden labels come back as you zoom in; their provinces stay clickable. */
let declutterQueued = false;
function declutter(){
  if (!lmSel || declutterQueued) return;
  declutterQueued = true;
  requestAnimationFrame(() => {
    declutterQueued = false;
    const open = new Set(state.stack), rank = d => (d.id === state.hover ? 1e4 : open.has(d.id) ? 1e3 : 0) + (d.k ? 100 : 0) + d.deg;
    const placed = [], pad = 2;
    lmSel.nodes().map(el => [el, d3.select(el).datum()]).sort((a, b) => rank(b[1]) - rank(a[1])).forEach(([el, d]) => {
      const b = el.getBBox(), r = [b.x * curK - pad, b.y * curK - pad, (b.x + b.width) * curK + pad, (b.y + b.height) * curK + pad];
      const hit = placed.some(q => r[0] < q[2] && q[0] < r[2] && r[1] < q[3] && q[1] < r[3]);
      el.classList.toggle("hid", hit);
      if (!hit) placed.push(r);
    });
  });
}
function drawPath(pid, fly){
  if (!pathG) return;
  pathG.selectAll("*").remove();
  if (!pid) return;
  const [, a, b] = pid.split("~"); const steps = byId[a] && byId[b] ? shortestPath(a, b) : null; if (!steps) return;
  const ids = [a, ...steps.map(s => s.to)], pts = ids.map(id => GEO.main[id]);
  pathG.append("path").attr("class","pathline").attr("d", d3.line().curve(d3.curveCatmullRom.alpha(0.5))(pts));
  pathG.selectAll("circle").data(pts).join("circle").attr("class","pathdot").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("r", 4.5);
  if (fly){ const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); fitBox(Math.min(...xs) - 120, Math.min(...ys) - 80, Math.max(...xs) + 120, Math.max(...ys) + 80, true, 2.2); }
}

/* ---------- controls ---------- */
function buildControls(){
  const lg = document.getElementById("legend");
  lg.insertAdjacentHTML("beforeend", LEG.map(c => `<button data-cl="${c}"><i style="background:${fill(c)}"></i><span>${esc(SEC[c])}</span></button>`).join(""));
  lg.addEventListener("click", e => {
    const b = e.target.closest("[data-cl]"); if (!b) return;
    const pts = NODES.filter(n => n.c === b.dataset.cl).map(n => GEO.main[n.id]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    fitBox(Math.min(...xs) - 110, Math.min(...ys) - 80, Math.max(...xs) + 110, Math.max(...ys) + 80, true, 2.4);
  });
  lg.addEventListener("mouseover", e => { const b = e.target.closest("[data-cl]"); if (b && provSel) provSel.classed("dimc", d => d.c !== b.dataset.cl); });
  lg.addEventListener("mouseleave", () => provSel && provSel.classed("dimc", false));
  const names = new Map(); NODES.forEach(n => { names.set(n.l, n.id); n.kw.forEach(k => { if (!names.has(k)) names.set(k, n.id); }); });
  document.getElementById("names").innerHTML = [...names.keys()].sort((a,b) => a.localeCompare(b)).map(v => `<option value="${esc(v)}"></option>`).join("");
  const q = document.getElementById("q");
  const find = () => {
    const v = q.value.trim().toLowerCase(); if (!v) return;
    let id = null, kw = null;
    for (const [name, nid] of names){ if (name.toLowerCase() === v){ id = nid; if (!byId[nid] || byId[nid].l !== name) kw = name; break; } }
    if (!id){ const n = NODES.find(n => n.l.toLowerCase().includes(v)); if (n) id = n.id; }
    if (!id){ const n = NODES.find(n => n.kw.some(k => k.toLowerCase().includes(v))); if (n){ id = n.id; kw = n.kw.find(k => k.toLowerCase().includes(v)); } }
    if (!id){ const n = NODES.find(n => (n.r.join(" ") + " " + n.p.join(" ")).toLowerCase().includes(v)); if (n) id = n.id; }
    if (id){ q.setCustomValidity(""); open(id, -1, kw ? {kw} : {}); setTimeout(() => flyTo(id), reduceMotion ? 0 : 560); q.value = ""; q.blur(); }
    else { q.setCustomValidity("Nothing matches"); q.reportValidity(); }
  };
  q.addEventListener("change", find);
  q.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); find(); } });
  q.addEventListener("input", () => q.setCustomValidity(""));
  const toggle = (btn, fn) => btn.addEventListener("click", () => { const on = btn.getAttribute("aria-pressed") !== "true"; btn.setAttribute("aria-pressed", on); fn(on); });
  toggle(document.getElementById("b-links"), on => svg && svg.classed("alllinks", on));
  toggle(document.getElementById("b-path"), on => document.getElementById("pathform").classList.toggle("on", on));
  document.getElementById("b-fit").onclick = () => fit(true);
  const sorted = [...NODES].sort((a,b) => a.l.localeCompare(b.l));
  const opts = sorted.map(n => `<option value="${n.id}">${esc(n.l)}</option>`).join("");
  const pa = document.getElementById("pa"), pb = document.getElementById("pb");
  pa.innerHTML = opts; pb.innerHTML = opts; pa.value = "avgcase"; pb.value = "folding";
  document.getElementById("b-trace").onclick = () => {
    if (pa.value === pb.value) return;
    const pid = `path~${pa.value}~${pb.value}`;
    state.stack = state.stack.filter(x => !x.startsWith("path~"));
    open(pid, -1); setTimeout(() => drawPath(pid, true), reduceMotion ? 0 : 560);
  };
}
document.addEventListener("keydown", e => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.key === "/" && !typing){ e.preventDefault(); document.getElementById("q").focus(); }
  else if (typing) return;
  else if (e.key === "Escape"){ hidePop(); if (state.stack.length) close(state.stack[state.stack.length - 1]); }
  else if ((e.key === "f" || e.key === "F") && svg) fit(true);
});
let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { sizeMap(); updateSpines(); }, 150); });

buildControls();
if (window.d3) buildMap();
else document.querySelector(".map-wrap").insertAdjacentHTML("beforeend", `<p style="position:absolute;top:50%;left:0;right:0;text-align:center">The map could not load. Open <a data-open="about">About</a> to browse the notes.</p>`);
if (location.hash.length > 1) fromHash();
else if (!narrow()){ state.stack = ["about"]; syncPanes(false); }
if (svg) requestAnimationFrame(() => fit(false));
