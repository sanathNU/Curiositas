// Generative background music: a few voices pulsing n₁ : n₂ : n₃… times per shared cycle.
//
// Like everything else in a scene, the music is a function of time: beat k of a voice with n
// beats per cycle falls at t = k · cycle / n, and its note is notes[k mod notes.length]. All voices
// land together on every cycle boundary (that beat is accented), so the polyrhythm is audible as
// pulses drifting apart and meeting again. Everything is synthesised with Web Audio, no samples.
//
//   music: {
//     tonic: 146.83,                 // Hz (D3); notes are semitones above it, null is a rest,
//                                    // a string is a stroke name for percussion ('thom', 'clap'…)
//     cycle: 8,                      // seconds; 48 / cycle should be whole so music and camera loop together
//     volume: 2,                     // master gain (default 2, about −24 dBFS RMS for these scores)
//     reverb: { seconds: 6, wet: .4, tone: .5 },
//     pad: { notes: [0, 7, 15], gain: .05 },           // optional sustained drone
//     voices: [{ n: 3, inst: 'bell', notes: [12, 19], gain: .2, pan: -.3, prob: .8, ...instrument options }],
//   }

const TAU = Math.PI * 2;
const LOOKAHEAD = .3;   // seconds of music scheduled ahead of the frame loop
const LATENCY = .06;

/** Deterministic hash → [0, 1), so a given beat always plays the same way. */
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const hz = (tonic, semi) => tonic * 2 ** (semi / 12);

// ---------- instruments: (ctx, out, at, freq, vel, opts, h) where h is the beat's hash ----------

/** Exponential-decay gain envelope; returns the gain node. `d` is roughly the time to −40 dB. */
function envGain(ctx, at, attack, peak, d) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setTargetAtTime(0, at + attack, d / 4.6);
  return g;
}

function osc(ctx, type, f, at, stop) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at);
  o.start(at); o.stop(stop); return o;
}

/** Additive bell: sine partials [ratio, amp, decay fraction], each optionally doubled with a beating twin. */
function bell(ctx, out, at, f, vel, o) {
  const partials = o.partials ?? [[1, 1, 1], [2, .45, .6], [2.76, .32, .45], [4.07, .16, .3], [5.4, .08, .2]];
  const decay = o.decay ?? 4, attack = o.attack ?? .006, beat = o.beat ?? 0;
  for (const [r, a, df] of partials) {
    const fr = f * r;
    if (fr > 12000) continue;
    for (const d of beat ? [-beat / 2, beat / 2] : [0]) {
      const g = envGain(ctx, at, attack, vel * a / (beat ? 2 : 1), decay * df);
      osc(ctx, 'sine', fr + d * r, at, at + attack + decay * df + .2).connect(g).connect(out);
    }
  }
}

/** Plucked string: bright saw/triangle closing to a dark lowpass; `bend` semitones of slide into the note. */
function pluck(ctx, out, at, f, vel, o, h) {
  const decay = o.decay ?? 2.4, stop = at + decay + .2;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = o.q ?? .8;
  lp.frequency.setValueAtTime(Math.min(f * (o.bright ?? 9), 9000), at);
  lp.frequency.setTargetAtTime(f * 1.4, at, o.damp ?? .18);
  const g = envGain(ctx, at, .004, vel, decay);
  lp.connect(g).connect(out);
  const bend = o.bend && h < (o.bendProb ?? .5) ? o.bend : 0;
  for (const [type, det, amp] of [[o.wave ?? 'sawtooth', 0, .6], ['triangle', 4, .5]]) {
    const s = osc(ctx, type, f, at, stop); s.detune.value = det;
    if (bend) { s.frequency.setValueAtTime(hz(f, -bend), at); s.frequency.exponentialRampToValueAtTime(f, at + .11); }
    const m = ctx.createGain(); m.gain.value = amp; s.connect(m).connect(lp);
  }
}

// ---------- plucked strings: Karplus–Strong, rendered once per pitch and cached ----------

const ksCache = new WeakMap();

/**
 * Karplus–Strong string (Karplus & Strong 1983; Jaffe & Smith 1983 for the tuning and pick-position
 * extensions). A noise burst circulates in a delay line one period long, averaged each pass, so high
 * partials die first like a real string. `t60` is the decay to −60 dB in seconds, `bright` (0–.5)
 * weights the averaging toward the newer sample (slower high-frequency loss), `pick` (0–.5) is the
 * pluck position along the string. Returns { buffer, rate }: play at `rate` for exact pitch, since the
 * delay line is a whole number of samples.
 */
function ksString(ctx, f, { t60 = 3, bright = 0, pick = .13, seconds = t60 + .3 } = {}) {
  let cache = ksCache.get(ctx);
  if (!cache) ksCache.set(ctx, (cache = new Map()));
  const key = `${f.toFixed(3)}|${t60}|${bright}|${pick}`;
  if (cache.has(key)) return cache.get(key);
  const sr = ctx.sampleRate, P = sr / f, N = Math.max(2, Math.floor(P - .5 - bright));
  const len = Math.ceil(seconds * sr), buf = ctx.createBuffer(1, len, sr), y = buf.getChannelData(0);
  const loss = .001 ** (1 / (f * t60)), a = .5 + bright, M = Math.round(N * pick);
  let seed = Math.round(f * 1000) % 2147483646 + 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 1073741823.5 - 1;
  const exc = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += .6 * (rnd() - lp); exc[i] = lp; }           // slightly soft pluck
  for (let i = 0; i < N; i++) y[i] = exc[i] - (i >= M ? exc[i - M] : 0) * .9;      // comb: pick position
  for (let i = N; i < len; i++) y[i] = loss * (a * y[i - N] + (1 - a) * y[i - N - 1 < 0 ? 0 : i - N - 1]);
  let peak = 0; for (let i = 0; i < N * 4 && i < len; i++) peak = Math.max(peak, Math.abs(y[i]));
  for (let i = 0; i < len; i++) y[i] /= peak || 1;
  const out = { buffer: buf, rate: (N + 1 - a) / P };  // loop period is N + (1 − a) samples; stretch to P
  cache.set(key, out);
  return out;
}

/**
 * Pitch movement for a string note, as playbackRate automation. Carnatic-style gamakas: `bend`
 * semitones of slide up into the note (probability bendProb), or kampita, a slow oscillation from a
 * semitone or two below up to the note while it sustains (probability kampita).
 */
function gamaka(src, at, rate, o, h) {
  const r = src.playbackRate;
  if (o.bend && h < (o.bendProb ?? .35)) {
    r.setValueAtTime(rate * 2 ** (-o.bend / 12), at);
    r.setValueAtTime(rate * 2 ** (-o.bend / 12), at + .05);
    r.exponentialRampToValueAtTime(rate, at + .22);
  } else if (o.kampita && h > 1 - o.kampita) {
    const dur = 1.6, n = 64, depth = o.kampitaDepth ?? 1.4, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), w = Math.sin(Math.PI * t) ** .7;               // swells in, settles on the note
      curve[i] = rate * 2 ** (-depth * w * (.5 - .5 * Math.cos(TAU * 2.2 * t)) / 12);
    }
    r.setValueAtTime(rate, at);
    r.setValueCurveAtTime(curve, at + .35, dur);
  } else r.setValueAtTime(rate, at);
}

/** Plucked string (veena, koto…): a Karplus–Strong note through a small body resonance, with gamakas. */
function string(ctx, out, at, f, vel, o, h) {
  const t60 = o.decay ?? 3.5, { buffer, rate } = ksString(ctx, f, { t60, bright: o.bright ?? .02, pick: o.pick ?? .13 });
  const src = ctx.createBufferSource(); src.buffer = buffer;
  gamaka(src, at, rate, o, h);
  const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = o.body ?? 240; body.Q.value = 1.2; body.gain.value = 5;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = o.cutoff ?? 5200;
  const g = ctx.createGain(); g.gain.value = vel * .55;
  src.connect(body).connect(tone).connect(g).connect(out);
  src.start(at); src.stop(at + buffer.duration / rate + .5);
}

/**
 * Tanpura string: a long, bright Karplus–Strong pluck plus the jawari shimmer, a resonant band-pass
 * that sweeps up through the harmonics after the pluck and settles, the way the bridge makes the tone bloom.
 */
function tanpura(ctx, out, at, f, vel, o) {
  const t60 = o.decay ?? 8, { buffer, rate } = ksString(ctx, f, { t60, bright: .22, pick: .07 });
  const src = ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = rate;
  const end = at + buffer.duration / rate;
  const dry = ctx.createBiquadFilter(); dry.type = 'lowpass'; dry.frequency.value = f * 9;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5;
  bp.frequency.setValueAtTime(f * 3, at);
  bp.frequency.linearRampToValueAtTime(f * 14, at + 1.8);
  bp.frequency.linearRampToValueAtTime(f * 7, at + 4.5);
  const sh = ctx.createGain(); sh.gain.value = 1.6;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel * .45, at + .03);
  src.connect(dry).connect(g); src.connect(bp).connect(sh).connect(g); g.connect(out);
  src.start(at); src.stop(end + .1);
}

// ---------- percussion ----------

/** A short burst of the shared noise buffer through a filter. */
function noiseHit(ctx, out, at, { type = 'bandpass', freq, q = 1, peak, decay, offset }, noise) {
  const src = ctx.createBufferSource(); src.buffer = noise;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
  const g = envGain(ctx, at, .001, peak, decay);
  src.connect(fl).connect(g).connect(out);
  src.start(at, offset % 4); src.stop(at + decay + .1);
}

/** Pitched membrane mode: sine with an optional pitch glide from `from`·f to f over `glide` s. */
function mode(ctx, out, at, f, peak, decay, from = 1, glide = .05) {
  const s = osc(ctx, 'sine', f * from, at, at + decay + .2);
  if (from !== 1) s.frequency.exponentialRampToValueAtTime(f, at + glide);
  s.connect(envGain(ctx, at, .002, peak, decay)).connect(out);
}

/**
 * Mridangam. The right (valanthalai) head is tuned to Sa = f and rings with near-harmonic modes,
 * the left (thoppi) head gives the bass. `stroke` comes from the voice's notes:
 *   thom  open bass        nam  ringing treble     dhin  nam + thom, fuller ring
 *   ta    damped treble    ki   muted click        gumki bass that slides upward
 */
function mridangam(ctx, out, at, f, vel, o, h, noise) {
  const sa = f, bass = o.bass ?? 92;
  const treble = (ring) => {
    [[1, 1, 1], [2, .55, .7], [3, .38, .5], [4, .22, .35], [5, .12, .25]].forEach(([r, a, d]) => mode(ctx, out, at, sa * r * (1 + (h - .5) * .004), vel * a * .5, ring * d));
    noiseHit(ctx, out, at, { freq: 3200, q: 1.5, peak: vel * .25, decay: .025, offset: h * 3 }, noise);
  };
  const thom = (peak, decay) => {
    mode(ctx, out, at, bass, vel * peak, decay, 1.45, .07);
    noiseHit(ctx, out, at, { type: 'lowpass', freq: 380, peak: vel * .35, decay: .06, offset: h * 2 }, noise);
  };
  switch (o.stroke) {
    case 'thom': thom(.9, .45); break;
    case 'gumki': { const s = osc(ctx, 'sine', bass * .95, at, at + .9); s.frequency.setValueAtTime(bass * .95, at + .04);
      s.frequency.exponentialRampToValueAtTime(bass * 1.5, at + .32); s.connect(envGain(ctx, at, .004, vel * .8, .75)).connect(out); break; }
    case 'nam': treble(1.1); break;
    case 'dhin': treble(1.6); thom(.55, .4); break;
    case 'ta': treble(.22); break;
    case 'ki': noiseHit(ctx, out, at, { freq: 1900, q: 2.5, peak: vel * .5, decay: .035, offset: h * 4 }, noise);
      mode(ctx, out, at, sa * 2, vel * .15, .05); break;
  }
}

/** Talam, the hand keeping the tala: 'clap' (palm), 'tap' (finger count, softer); null is the silent wave. */
function clap(ctx, out, at, f, vel, o, h, noise) {
  if (o.stroke === 'tap') { noiseHit(ctx, out, at, { freq: 2400, q: 1.8, peak: vel * .3, decay: .03, offset: h * 4 }, noise); return; }
  for (let i = 0; i < 3; i++) noiseHit(ctx, out, at + i * .009, { freq: 1150, q: 1.1, peak: vel * (1 - i * .25), decay: i === 2 ? .12 : .02, offset: h * 4 + i }, noise);
}

/** Soft mallet (marimba / kalimba): sine with a quickly fading overtone near 4×. */
function mallet(ctx, out, at, f, vel, o) {
  const decay = o.decay ?? 1.3;
  for (const [r, a, df] of [[1, 1, 1], [o.over ?? 3.95, .22, .22], [10.1, .05, .06]]) {
    if (f * r > 12000) continue;
    const g = envGain(ctx, at, .003, vel * a, decay * df);
    osc(ctx, 'sine', f * r, at, at + decay * df + .2).connect(g).connect(out);
  }
}

/** Noise through a band-pass: insects (count > 1 gives a rapid double tick). */
function tick(ctx, out, at, f, vel, o, h, noise) {
  const count = o.count ?? 1, gap = o.gap ?? .05;
  for (let i = 0; i < count; i++) {
    const t = at + i * gap;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * (1 + (h - .5) * .06); bp.Q.value = o.q ?? 14;
    const g = envGain(ctx, t, .002, vel * (1 - i * .18), o.decay ?? .07);
    src.connect(bp).connect(g).connect(out);
    src.start(t, (h * 5 + i * .37) % 5); src.stop(t + .3);
  }
}

/** Frog: short sine chirps that fall in pitch. */
function chirp(ctx, out, at, f, vel, o) {
  const count = o.count ?? 2, gap = o.gap ?? .09;
  for (let i = 0; i < count; i++) {
    const t = at + i * gap, s = osc(ctx, 'sine', f * 1.35, t, t + .2);
    s.frequency.exponentialRampToValueAtTime(f, t + .06);
    const g = envGain(ctx, t, .006, vel, o.decay ?? .09);
    s.connect(g).connect(out);
  }
}

/** Swell of filtered noise: sea waves (lowpass) or wind (band-pass, with flag flutter). */
function swell(ctx, out, at, f, vel, o, h, noise) {
  const rise = o.rise ?? 1.8, fall = o.fall ?? 3.5, end = at + rise + fall;
  const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = o.filter ?? 'lowpass'; fl.Q.value = o.q ?? .7;
  fl.frequency.setValueAtTime(f * .4, at);
  fl.frequency.linearRampToValueAtTime(f * (1 + h * .4), at + rise);
  fl.frequency.linearRampToValueAtTime(f * .3, end);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vel, at + rise);
  g.gain.linearRampToValueAtTime(0, end);
  let node = src.connect(fl);
  if (o.flutter) { // cloth snapping in the gust: amplitude wobble at a few Hz
    const am = ctx.createGain(); am.gain.value = 1 - o.flutter;
    const lfo = osc(ctx, 'sine', 6 + h * 4, at, end); const depth = ctx.createGain(); depth.gain.value = o.flutter;
    lfo.connect(depth).connect(am.gain); node = node.connect(am);
  }
  node.connect(g).connect(out);
  src.start(at, h * 4); src.stop(end + .1);
}

export const INSTRUMENTS = { bell, pluck, string, tanpura, mridangam, clap, mallet, tick, chirp, swell };

// ---------- graph pieces ----------

function noiseBuffer(ctx, seconds = 5) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate), d = b.getChannelData(0);
  let s = 1;
  for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
  return b;
}

/** Synthetic hall: decaying stereo noise, low-passed by a one-pole filter (`tone` 0 dark … 1 bright). */
function reverbIR(ctx, seconds, tone) {
  const n = Math.round(ctx.sampleRate * seconds), b = ctx.createBuffer(2, n, ctx.sampleRate), k = .08 + tone * .6;
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let y = 0, s = 7 + c * 31;
    for (let i = 0; i < n; i++) {
      s = (s * 16807) % 2147483647;
      y += k * ((s / 1073741823.5 - 1) - y);
      d[i] = y * (1 - i / n) ** 2.2 * (i < ctx.sampleRate * .02 ? 0 : 1);
    }
  }
  return b;
}

/** Sustained drone: detuned triangle pairs through a slowly breathing low-pass. */
function makePad(ctx, out, tonic, { notes, gain = .05, cutoff = 900, breathe = .06 }) {
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = .5;
  const lfo = ctx.createOscillator(); lfo.frequency.value = breathe;
  const depth = ctx.createGain(); depth.gain.value = cutoff * .45;
  lfo.connect(depth).connect(lp.frequency); lfo.start();
  const level = ctx.createGain(); level.gain.value = 0;
  notes.forEach((semi, i) => {
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz(tonic, semi); o.detune.value = det;
      const m = ctx.createGain(); m.gain.value = gain / notes.length / (1 + i * .3);
      o.connect(m).connect(lp); o.start();
    }
  });
  lp.connect(level).connect(out);
  return level;
}

/**
 * Wire one score into an audio context: master → compressor → destination, a shared reverb, one
 * gain/pan bus per voice and the optional pad. Works on a live AudioContext or an OfflineAudioContext.
 */
function createGraph(ctx, score) {
  const { tonic, voices, reverb = {}, pad } = score;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = .02; comp.release.value = .4;
  const master = ctx.createGain(); master.gain.value = 0;
  master.connect(comp).connect(ctx.destination);
  const verb = ctx.createConvolver(); verb.buffer = reverbIR(ctx, reverb.seconds ?? 5, reverb.tone ?? .5);
  verb.connect(master);
  const noise = noiseBuffer(ctx);
  const route = (gain, pan, wet) => {
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const send = ctx.createGain(); send.gain.value = wet;
    g.connect(p); p.connect(master); p.connect(send).connect(verb);
    return g;
  };
  const bus = voices.map((v) => route(v.gain ?? .2, v.pan ?? 0, v.wet ?? reverb.wet ?? .35));
  const padLevel = pad ? makePad(ctx, route(1, 0, reverb.wet ?? .35), tonic, pad) : null;

  /** Play beat k of voice vi at audio time `at`. */
  function play(vi, k, at) {
    const v = voices[vi], h = hash(vi + 1, k), down = k % v.n === 0;
    if (!down && v.prob !== undefined && hash(k, vi + 7) > v.prob) return;
    const note = v.notes ? v.notes[((k % v.notes.length) + v.notes.length) % v.notes.length] : 0;
    if (note === null) return;
    const vel = (1 - (v.humanize ?? .15) * h) * (down ? v.accent ?? 1.35 : 1);
    // a string note names a stroke (mridangam, talam) played at the voice's pitch
    const stroke = typeof note === 'string', opts = stroke ? { ...v, stroke: note } : v;
    INSTRUMENTS[v.inst](ctx, bus[vi], at, v.freq ?? hz(tonic, stroke ? v.semi ?? 0 : note), vel, opts, h, noise);
  }
  return { master, out: comp, padLevel, play };
}

/** Beats of every voice with scene time in [from, to): calls fn(voiceIndex, k, time). */
function eachBeat(score, from, to, fn) {
  score.voices.forEach((v, vi) => {
    const per = score.cycle / v.n;
    for (let k = Math.ceil(from / per - 1e-9); k * per < to; k++) fn(vi, k, k * per);
  });
}

/** "2 : 3 : 5", the pulse counts of a score, unless it names itself with `label`. */
export const scoreLabel = (score) => score.label ?? [...new Set(score.voices.map((v) => v.n).filter((n) => n > 1))].sort((a, b) => a - b).join(' : ');

/**
 * Render `seconds` of a score offline (scene time 0 onward). For checking levels and looking at
 * the result; returns the AudioBuffer.
 */
export async function renderMusic(score, seconds, sampleRate = 44100) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const G = createGraph(ctx, score);
  G.master.gain.value = score.volume ?? 2;
  if (G.padLevel) G.padLevel.gain.value = 1;
  eachBeat(score, 0, seconds, (vi, k, te) => G.play(vi, k, te));
  return ctx.startRendering();
}

/**
 * Live music for one scene. Nothing is created until `enable()` (browsers only start audio after a
 * user gesture). Call `update(t, paused)` from the frame loop with the scene clock.
 */
export function mountMusic(score) {
  const volume = score.volume ?? 2;
  let ctx = null, G = null, streamDest = null;
  let on = false, until = null, lastT = 0, playing = false;

  function build() {
    ctx = new AudioContext({ latencyHint: 'playback' });
    G = createGraph(ctx, score);
    document.addEventListener('visibilitychange', () => {
      if (on) document.hidden ? ctx.suspend() : ctx.resume();
    });
  }

  function setPlaying(p) {
    if (p !== playing && G.padLevel) G.padLevel.gain.setTargetAtTime(p ? 1 : 0, ctx.currentTime, p ? 1.5 : .6);
    playing = p;
  }

  return {
    get on() { return on; },
    label: scoreLabel(score),
    enable() {
      if (!ctx) build();
      on = true; until = null;
      ctx.resume();
      G.master.gain.cancelScheduledValues(ctx.currentTime);
      G.master.gain.setTargetAtTime(volume, ctx.currentTime, .5);
    },
    disable() {
      if (!ctx) return;
      on = false;
      G.master.gain.cancelScheduledValues(ctx.currentTime);
      G.master.gain.setTargetAtTime(0, ctx.currentTime, .25);
      setTimeout(() => { if (!on) ctx.suspend(); }, 1500);
    },
    toggle() { on ? this.disable() : this.enable(); return on; },
    /** Audio for the video recorder (created on first request). */
    stream() {
      if (!ctx) return null;
      if (!streamDest) { streamDest = ctx.createMediaStreamDestination(); G.out.connect(streamDest); }
      return streamDest.stream;
    },
    /** Schedule every beat with scene time in [until, t + LOOKAHEAD). */
    update(t, paused) {
      if (!on || !ctx) return;
      setPlaying(!paused);
      if (paused || ctx.state !== 'running') { until = null; return; }
      if (until === null || t < lastT - .001 || t > until + 1) until = t; // start, seek or stall
      lastT = t;
      const horizon = t + LOOKAHEAD, now = ctx.currentTime + LATENCY;
      eachBeat(score, until, horizon, (vi, k, te) => { if (te >= t - .05) G.play(vi, k, now + Math.max(0, te - t)); });
      until = horizon;
    },
  };
}
