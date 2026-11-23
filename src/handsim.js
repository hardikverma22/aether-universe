// Dev tool (?handsim): feeds simulated hand landmarks into the real gesture pipeline, skipping only MediaPipe's
// detection, so gestures can be tested without a camera. Use window.__sim.set(hand, pose, x, y) with pose
// 'open' | 'pinch' | 'fist' | 'point' | 'victory' | null and x, y as screen fractions (where the user sees their hand).
const P = (s) => s.trim().split(/\s+/).map((pt) => pt.split(',').map(Number));
const OPEN = P(`50,92 36,84 26,72 20,60 16,50 38,58 36,40 35,29 34,19 50,56 50,36 50,24 50,13 61,58 63,40 64,29 65,20 71,63 75,49 77,40 79,32`);
const PINCH = P(`50,92 38,84 30,72 27,59 29,47 38,58 33,44 29,40 30,46 50,56 50,36 50,24 50,13 61,58 63,40 64,29 65,20 71,63 75,49 77,40 79,32`);
const FIST = P(`50,92 38,84 32,72 38,64 46,64 38,58 38,46 42,52 42,60 50,56 50,44 53,51 52,59 61,58 61,46 62,53 60,60 71,63 71,52 71,58 69,63`);
const POINT = OPEN.map((p, i) => (i >= 5 && i <= 8 ? p : FIST[i]));
const VICTORY = OPEN.map((p, i) => ([1, 2, 3, 4, 13, 14, 15, 16, 17, 18, 19, 20].includes(i) ? FIST[i] : p)).map((p, i) => (i === 8 ? [28, 21] : i === 7 ? [31, 31] : i === 12 ? [56, 14] : i === 11 ? [54, 25] : p));
const POSES = { open: OPEN, pinch: PINCH, fist: FIST, point: POINT, victory: VICTORY };
// what MediaPipe's gesture model would report for each pose
const GESTURE = { open: 'Open_Palm', fist: 'Closed_Fist', point: 'Pointing_Up', victory: 'Victory', pinch: 'None' };
// offsets from (x, y) to the fingertip (point) and to the pinch midpoint, in screen fractions
export const TIP = { x: -0.032, y: -0.146 }, PINCHPT = { x: -0.041, y: -0.051 };

export function startHandSim(hands) {
  Object.defineProperty(hands.video, 'readyState', { get: () => 4, configurable: true });
  hands.mode = 'camera'; hands.busy = true; hands.lastResultT = performance.now();
  const state = [null, null];
  const lm = (pose, x, y) => POSES[pose].map(([u, v]) => ({ x: 1 - (x + (u - 50) / 100 * 0.2), y: y + (v - 60) / 100 * 0.2 * (16 / 9), z: 0 }));
  (function tick() {
    const landmarks = [], handedness = [], gestures = [];
    state.forEach((h, i) => { if (h) { landmarks.push(lm(h.pose, h.x, h.y)); handedness.push(i === 0 ? 'Right' : 'Left'); gestures.push({ name: GESTURE[h.pose], score: 0.9 }); } });
    hands.latest = { landmarks, handedness, gestures }; hands.busy = true; requestAnimationFrame(tick);
  })();
  const sleep = (t) => new Promise((r) => setTimeout(r, t));
  // aim so the fingertip (point) or the pinch midpoint lands on screen pixel (px, py), correcting for the camera mapping
  async function aim(i, pose, px, py, tries = 6) {
    let x = px / innerWidth - (pose === 'pinch' ? PINCHPT.x : TIP.x), y = py / innerHeight - (pose === 'pinch' ? PINCHPT.y : TIP.y);
    for (let k = 0; k < tries; k++) {
      state[i] = { pose, x, y }; await sleep(160);
      const s = hands.hands[i].screen; if (!s) continue;
      const tx = pose === 'pinch' ? (s[4].x + s[8].x) / 2 : s[8].x, ty = pose === 'pinch' ? (s[4].y + s[8].y) / 2 : s[8].y;
      x += px / innerWidth - tx; y += py / innerHeight - ty;
    }
    state[i] = { pose, x, y };
  }
  window.__sim = { set(i, pose, x, y) { state[i] = pose ? { pose, x, y } : null; }, clear() { state[0] = state[1] = null; }, aim, TIP, PINCHPT };
}
