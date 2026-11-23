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
