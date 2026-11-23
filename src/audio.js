// Tiny synthesized sound design (Web Audio, no files): chimes for births, a thump for merges,
// a boom for supernovae and a low hum that swells near black holes.
let ac = null, master, verb, hum, humGain;

function impulse(seconds = 2.4) {
  const len = ac.sampleRate * seconds, buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  return buf;
}

export function initAudio() {
  if (ac) { ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
  verb = ac.createConvolver(); verb.buffer = impulse(); const wet = ac.createGain(); wet.gain.value = 0.45; verb.connect(wet).connect(master);
  // black-hole hum: two detuned low sines through a lowpass, silent until a hole exists
  humGain = ac.createGain(); humGain.gain.value = 0; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
  humGain.connect(lp).connect(master);
  hum = [48, 48.7].map((f) => { const o = ac.createOscillator(); o.frequency.value = f; o.connect(humGain); o.start(); return o; });
}
export const audioOn = () => !!ac && ac.state === 'running';
export function setMuted(m) { if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ac.currentTime, 0.1); }

function voice(freq, t0, dur, type = 'sine', gain = 0.2, dest) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest || master); g.connect(verb); o.start(t0); o.stop(t0 + dur + 0.05);
}

/** a soft bell: higher and brighter for small things, deeper chord for stars */
export function chime(size = 0.5) {
  if (!ac) return; const t = ac.currentTime;
  const base = 880 / (1 + size * 2.2);
  [1, 2.01, 3.02].forEach((h, i) => voice(base * h, t + i * 0.004, 1.6 - i * 0.35, 'sine', 0.14 / (i + 1)));
  if (size > 0.6) [1.25, 1.5].forEach((r) => voice(base * r, t + 0.06, 2.2, 'sine', 0.06));
}
export function thump() { if (!ac) return; const t = ac.currentTime; const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.35); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); o.connect(g).connect(master); g.connect(verb); o.start(t); o.stop(t + 0.5); }
export function boom() {
  if (!ac) return; const t = ac.currentTime;
  const n = ac.createBufferSource(); n.buffer = impulse(1.6); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(120, t + 1.4);
  const g = ac.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8); n.connect(f).connect(g).connect(master); g.connect(verb); n.start(t);
  const o = ac.createOscillator(), og = ac.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.2); og.gain.setValueAtTime(0.6, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.4); o.connect(og).connect(master); o.start(t); o.stop(t + 1.5);
}
export function whoosh() { if (!ac) return; const t = ac.currentTime; const n = ac.createBufferSource(); n.buffer = impulse(0.8); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.5); const g = ac.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); n.connect(f).connect(g).connect(master); n.start(t); }
/** 0..1: how present black holes are on screen */
export function setHum(level) { if (humGain) humGain.gain.setTargetAtTime(Math.min(1, level) * 0.32, ac.currentTime, 0.4); }
/** gentle rising tone while gathering stardust */
let gatherOsc = null, gatherGain = null;
export function gathering(on, amount = 0) {
  if (!ac) return;
  if (on && !gatherOsc) { gatherOsc = ac.createOscillator(); gatherGain = ac.createGain(); gatherGain.gain.value = 0; gatherOsc.type = 'triangle'; gatherOsc.connect(gatherGain).connect(verb); gatherOsc.start(); }
  if (gatherOsc) { gatherOsc.frequency.setTargetAtTime(220 + amount * 300, ac.currentTime, 0.1); gatherGain.gain.setTargetAtTime(on ? 0.05 + amount * 0.04 : 0, ac.currentTime, 0.08); }
}

// ---------------------------------------------------------------- music of the spheres
// Every planet gets a note from a D-major pentatonic scale (any mix of them sounds consonant): gas giants low,
// rocky and ocean worlds in the middle, ice worlds high. It rings softly each time the planet completes an orbit.
const PENTA = [0, 2, 4, 7, 9];
const noteHz = (i) => { const m = 50 + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5]; return 440 * Math.pow(2, (m - 69) / 12); };
const RANGE = { gas: [2, 6], terran: [7, 10], desert: [6, 9], lava: [8, 11], ice: [10, 14] };
export function noteFor(kind) { const [a, b] = RANGE[kind] || [6, 11]; return a + Math.floor(Math.random() * (b - a + 1)); }

/** a soft bell (sine with two quiet partials), panned left/right */
function bell(freq, gain = 0.12, pan = 0, dur = 2.6) {
  if (!ac) return; const t = ac.currentTime;
  const p = ac.createStereoPanner ? ac.createStereoPanner() : null; if (p) p.pan.value = Math.max(-1, Math.min(1, pan));
  const out = ac.createGain(); out.gain.value = 1; (p ? out.connect(p) : out); const dest = p || out;
  [[1, 1], [2.0, 0.22], [3.01, 0.08]].forEach(([r, g]) => {
    const o = ac.createOscillator(), e = ac.createGain(); o.type = 'sine'; o.frequency.value = freq * r;
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(gain * g, t + 0.008); e.gain.exponentialRampToValueAtTime(0.0001, t + dur / r);
    o.connect(e).connect(out); o.start(t); o.stop(t + dur + 0.1);
  });
  dest.connect(master); dest.connect(verb);
}
let lastChimes = [];
/** a planet's own note; rate-limited so busy skies stay gentle */
export function planetNote(note, size = 0.5, pan = 0) {
  if (!ac) return; const now = ac.currentTime; lastChimes = lastChimes.filter((x) => now - x < 1);
  if (lastChimes.length >= 6) return; lastChimes.push(now);
  bell(noteHz(note), 0.07 + Math.min(0.08, size * 0.06), pan);
}
/** a new planet: its note, a little brighter */
export function planetBorn(note, pan = 0) { bell(noteHz(note), 0.16, pan, 3); }
/** a new star: a warm chord that swells and fades (root, fifth, ninth), lower for bigger stars */
export function starBorn(size = 0.5, pan = 0) {
  if (!ac) return; const t = ac.currentTime; const root = Math.max(0, 7 - Math.round(size * 4));
  [0, 3, 6].forEach((step, k) => {
    const f = noteHz(root + step), o = ac.createOscillator(), e = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 1400;
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.06 / (k + 1) + 0.03, t + 0.25 + k * 0.06); e.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    o.connect(lp).connect(e); e.connect(master); e.connect(verb); o.start(t); o.stop(t + 3.6);
  });
  bell(noteHz(root + 10), 0.06, pan, 2.4);
}
/** two worlds merge: a soft low bloom instead of a thud */
export function mergeBloom(pan = 0) { bell(noteHz(3), 0.14, pan, 2.2); setTimeout(() => bell(noteHz(1), 0.1, pan, 2.6), 90); }
/** a black hole forms: a deep falling tone */
export function holeBorn() {
  if (!ac) return; const t = ac.currentTime; const o = ac.createOscillator(), e = ac.createGain(), lp = ac.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(noteHz(5), t); o.frequency.exponentialRampToValueAtTime(noteHz(0) / 2, t + 2.2);
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 2.2);
  e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.18, t + 0.1); e.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  o.connect(lp).connect(e); e.connect(master); e.connect(verb); o.start(t); o.stop(t + 2.7);
}
/** after the boom: a rising shimmer of scale notes */
export function shimmer() { [10, 12, 14, 15, 17].forEach((n, i) => setTimeout(() => bell(noteHz(n), 0.07, (i - 2) * 0.3, 2.4), 120 + i * 90)); }
