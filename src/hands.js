// Hand input: MediaPipe hand tracking in a worker (2 hands) with a mouse fallback.
// Per hand: a filtered control point, all 21 landmarks in world space, and debounced gestures.
import * as THREE from 'three/webgpu';

export const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// One Euro filter: smooth when slow, responsive when fast (Casiez et al. 2012)
class OneEuro {
  constructor(minCutoff = 1.6, beta = 0.9, dCutoff = 1.0) { Object.assign(this, { minCutoff, beta, dCutoff }); this.x = null; this.dx = 0; }
  static a(cutoff, dt) { const r = 2 * Math.PI * cutoff * dt; return r / (r + 1); }
  filter(v, dt) {
    if (this.x === null) { this.x = v; return v; }
    const dx = (v - this.x) / dt; this.dx += OneEuro.a(this.dCutoff, dt) * (dx - this.dx);
    this.x += OneEuro.a(this.minCutoff + this.beta * Math.abs(this.dx), dt) * (v - this.x); return this.x;
  }
  reset() { this.x = null; this.dx = 0; }
}

// Debounced on/off gesture with hysteresis
class Latch {
  constructor(on, off) { this.onT = on; this.offT = off; this.on = false; this.v = 0; }
  update(raw) { if (!this.on && raw > this.onT) this.on = true; else if (this.on && raw < this.offT) this.on = false; this.v += ((this.on ? 1 : 0) - this.v) * 0.8; return this.v; }
}

function makeHand() {
  return {
    active: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), pinch: 0, fist: 0, open: 0, point: 0, burst: 0,
    lm: null, screen: null, world: Array.from({ length: 21 }, () => new THREE.Vector3(0, 0, 99)),
    draw: null, sVel: Array.from({ length: 21 }, () => ({ x: 0, y: 0 })), // smoothed + predicted landmarks for drawing
    target: new THREE.Vector3(), mvel: new THREE.Vector3(), tResult: 0, _fistT: -1e9, _burstT: -1e9,
    f: [new OneEuro(), new OneEuro(), new OneEuro(0.8, 0.4)],
    lat: { pinch: new Latch(0.6, 0.35), fist: new Latch(0.65, 0.4), point: new Latch(0.62, 0.38), victory: new Latch(0.55, 0.3) }, victory: 0, gesture: 'None',   // quick to engage, hysteresis to stay stable
  };
}

export class Hands {
  constructor(video) { this.video = video; this.hands = [makeHand(), makeHand()]; this.mode = 'none'; this.lastVideoTime = -1; this.stats = { n: 0 }; }

  async initCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } } });
    this.video.srcObject = stream; await this.video.play();
    const q = new URLSearchParams(location.search);
    this.worker = new Worker(new URL('./handWorker.js', import.meta.url), { type: 'module' });
    await new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'ready') { this.stats.delegate = d.delegate; resolve(); }
        else if (d.type === 'error') reject(new Error(d.message));
        else if (d.type === 'result') { this.busy = false; this.latest = d; this.stats.n++; this.stats.ms = d.ms; }
      };
      this.worker.postMessage({ type: 'init', wasmBase: new URL('/mediapipe-wasm', location.href).href, delegate: q.get('delegate') || 'GPU', numHands: +(q.get('hands') || 2) });
    });
    this.busy = false; this.latest = null; this.lastResultT = performance.now(); this.mode = 'camera';
  }

  initMouse(el) {
    this.mode = 'mouse';
    if (this._mouseBound) return; this._mouseBound = true;
    const h = this.hands[0]; const m = (this.mouse = { x: 0.5, y: 0.5, down: false, downT: 0, inside: false });
    const at = (e) => { m.x = e.clientX / innerWidth; m.y = e.clientY / innerHeight; m.inside = true; };
    el.addEventListener('pointermove', at);
    el.addEventListener('pointerleave', () => (m.inside = false));
    el.addEventListener('pointerdown', (e) => { at(e); m.down = true; m.downT = performance.now(); });
    addEventListener('pointerup', () => { if (m.down && performance.now() - m.downT > 350) h.burst = 1; m.down = false; });
  }

  /**
   * @param videoToScreen (x, y) mirrored video coords 0..1 -> screen coords 0..1 (matches the displayed feed)
   * @param toWorld (sx, sy, depth) -> Vector3
   */
  update(now, dt, videoToScreen, toWorld) {
    for (const h of this.hands) h.burst *= Math.exp(-dt * 3.2);
    if (this.mode === 'mouse') return this._updateMouse(dt, toWorld);
    if (this.mode !== 'camera' || this.video.readyState < 2) return;
    if (!this.busy && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime; this.busy = true;
      createImageBitmap(this.video, { resizeWidth: 480, resizeHeight: Math.round(480 * this.video.videoHeight / this.video.videoWidth), resizeQuality: 'low' })
        .then((bitmap) => this.worker.postMessage({ type: 'frame', bitmap, t: performance.now() }, [bitmap]))
        .catch(() => (this.busy = false));
    }
    if (this.latest) {
      const res = this.latest; this.latest = null;
      const rdt = Math.max(1 / 120, (now - this.lastResultT) / 1000); this.lastResultT = now;
      this.stats.hz = this.stats.hz ? this.stats.hz * 0.9 + 0.1 / rdt : 1 / rdt;
      const found = [false, false];
      res.landmarks.forEach((lm, k) => {
        let slot = res.handedness[k] === 'Left' ? 1 : 0; if (found[slot]) slot = 1 - slot; found[slot] = true;
        this._apply(this.hands[slot], lm, rdt, videoToScreen, toWorld, res.gestures?.[k]);
      });
      this.hands.forEach((h, i) => {
        if (found[i]) return;
        h.active = Math.max(0, h.active - rdt * 5);
        if (h.active === 0) { h.lm = null; h.f.forEach((f) => f.reset()); h.world.forEach((w) => w.setZ(99)); }
      });
    }
    this._predict(dt);
  }

  _apply(h, lm, dt, videoToScreen, toWorld, g) {
    const mir = lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
    const size = dist(mir[0], mir[9]) + 1e-4;
    const ext = (tip) => dist(mir[tip], mir[0]) / size;              // finger extension
    const tips = (ext(8) + ext(12) + ext(16) + ext(20)) / 4;
    // pointing = index straight, the other three curled; it takes priority over fist and pinch
    const others = (ext(12) + ext(16) + ext(20)) / 3;
    // MediaPipe's built-in gestures: ✌️ Victory makes a black hole; it must never read as pointing (two fingers up)
    h.gesture = g?.name || 'None';
    // geometric ✌️ as well (MediaPipe alone missed ~4 of 9 real V-sign photos, e.g. sideways 'scissors'):
    // index and middle out and spread apart, ring and little finger curled; joint distances don't depend on rotation
    const vGeo = ss(1.5, 1.8, ext(8)) * ss(1.5, 1.8, ext(12)) * (1 - ss(1.25, 1.55, (ext(16) + ext(20)) / 2)) * ss(0.28, 0.5, dist(mir[8], mir[12]) / size);
    const victoryRaw = Math.max(h.gesture === 'Victory' ? g.score : 0, vGeo);
    h.victory = h.lat.victory.update(victoryRaw);
    const pointRaw = ss(1.65, 1.95, ext(8)) * (1 - ss(1.2, 1.5, others)) * ss(0.35, 0.6, dist(mir[4], mir[8]) / size) * (1 - ss(0.3, 0.6, victoryRaw)) * (h.victory > 0.5 ? 0 : 1);
    // a pinch made with the other fingers curled (how many people pinch) looks like a fist by finger extension alone;
    // the difference: thumb and index tips touch while the index tip reaches forward, away from its own knuckle
    // (measured on real photos: curled pinch 1.27, fist 0.14 index-tip-to-knuckle, in hand sizes)
    const pinchLike = (1 - ss(0.18, 0.35, dist(mir[4], mir[8]) / size)) * ss(0.35, 0.55, dist(mir[8], mir[5]) / size);
    const fistRaw = (1 - ss(1.05, 1.5, tips)) * (1 - ss(1.35, 1.65, ext(8))) * (1 - pointRaw) * (1 - pinchLike);   // a fist needs the index curled too
    const openRaw = ss(1.55, 1.95, tips) * (1 - pointRaw);
    // pinch = fingertips actually touching: real pinches measure 0.08–0.13 hand sizes apart, a relaxed open 'C' hand
    // ~0.3–0.4 (measured on real photos); the old 0.22–0.5 window let a relaxed hand count as a pinch
    const pinchRaw = (1 - ss(0.13, 0.24, dist(mir[4], mir[8]) / size)) * (1 - fistRaw) * (1 - pointRaw);
    h.pinch = h.lat.pinch.update(pinchRaw); h.fist = h.lat.fist.update(fistRaw); h.point = h.lat.point.update(pointRaw);
    h.open += (openRaw - h.open) * 0.6;
    const now = performance.now();
    if (h.lat.fist.on) h._fistT = now;
    if (!h.lat.fist.on && openRaw > 0.6 && now - h._fistT < 450 && now - h._burstT > 900) { h.burst = 1; h._burstT = now; } // fist -> open = explode (with cooldown)

    // control point: index tip when pointing, thumb-index midpoint when pinching, else palm centre
    const palm = [0, 5, 9, 13, 17].reduce((a, i) => ({ x: a.x + mir[i].x / 5, y: a.y + mir[i].y / 5 }), { x: 0, y: 0 });
    const pt = h.point > 0.5 ? mir[8]
      : { x: palm.x + ((mir[4].x + mir[8].x) / 2 - palm.x) * h.pinch, y: palm.y + ((mir[4].y + mir[8].y) / 2 - palm.y) * h.pinch };
    const depth = THREE.MathUtils.clamp((size - 0.16) * 6, -1, 1.2);
    const sp = videoToScreen(pt.x, pt.y);
    const fx = h.f[0].filter(sp.x, dt), fy = h.f[1].filter(sp.y, dt), fd = h.f[2].filter(depth, dt);
    const target = toWorld(fx, fy, fd);
    const wasActive = h.active > 0.5;
    if (!wasActive) { h.target.copy(target); h.pos.copy(target); h.mvel.set(0, 0, 0); }
    else { h.mvel.lerp(target.clone().sub(h.target).divideScalar(Math.max((now - h.tResult) / 1000, 1 / 120)).clampLength(0, 25), 0.6); h.target.copy(target); }
    h.tResult = now;
    // all landmarks -> screen + world (overlay + whole-hand colliders)
    const ns = mir.map((p) => videoToScreen(p.x, p.y));
    if (h.screen && wasActive) ns.forEach((p, i) => { const v = h.sVel[i]; v.x += ((p.x - h.screen[i].x) / dt - v.x) * 0.5; v.y += ((p.y - h.screen[i].y) / dt - v.y) * 0.5; });
    else h.sVel.forEach((v) => { v.x = 0; v.y = 0; });
    h.screen = ns; if (!h.draw || !wasActive) h.draw = ns.map((p) => ({ ...p }));
    h.screen.forEach((s, i) => { const w = toWorld(s.x, s.y, fd - mir[i].z * 4); if (wasActive) h.world[i].lerp(w, 0.7); else h.world[i].copy(w); });
    if (h.active <= 0.05) h.since = performance.now(); // when this hand (re)appeared
    h.active = Math.min(1, h.active + dt * 6); h.lm = mir;
  }

  // tracking arrives at ~30-60 Hz, render at 60: extrapolate along measured velocity, chase quickly
  _predict(dt) {
    const now = performance.now();
    for (const h of this.hands) {
      if (h.active <= 0) continue;
      const age = Math.min((now - h.tResult) / 1000, 0.06);
      h.pos.lerp(h.target.clone().addScaledVector(h.mvel, age), 1 - Math.exp(-dt * 30));
      h.vel.lerp(h.mvel, 1 - Math.exp(-dt * 20));
      // drawn skeleton: extrapolate each joint along its velocity, then glide toward it (smooth at 60 fps)
      if (h.screen && h.draw) {
        const k = 1 - Math.exp(-dt * 24);
        for (let i = 0; i < 21; i++) { const p = h.screen[i], v = h.sVel[i], d = h.draw[i]; d.x += (p.x + v.x * age - d.x) * k; d.y += (p.y + v.y * age - d.y) * k; }
      }
    }
  }

  _updateMouse(dt, toWorld) {
    const h = this.hands[0], m = this.mouse; if (!m) return;   // mouse input not set up yet
    const target = toWorld(m.x, m.y, 0); const prev = h.pos.clone();
    if (h.active < 0.5) prev.copy(target);
    h.pos.lerp(target, 0.5);
    h.vel.lerp(h.pos.clone().sub(prev).divideScalar(Math.max(dt, 1 / 120)), 0.4);
    h.active += ((m.inside ? 1 : 0) - h.active) * 0.2;
    h.fist += ((m.down ? 1 : 0) - h.fist) * 0.25;
    h.pinch = 0; h.point = 0; h.open = m.down ? 0 : 1;
  }
}
