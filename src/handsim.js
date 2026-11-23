// Dev tool (?handsim): feeds simulated hand landmarks into the real gesture pipeline, skipping only MediaPipe's
// detection, so gestures can be tested without a camera. Use window.__sim.set(hand, pose, x, y) with pose
// 'open' | 'pinch' | 'fist' | 'point' | null and x, y as screen fractions (where the user sees their hand).
const P = (s) => s.trim().split(/\s+/).map((pt) => pt.split(',').map(Number));
const OPEN = P(`50,92 36,84 26,72 20,60 16,50 38,58 36,40 35,29 34,19 50,56 50,36 50,24 50,13 61,58 63,40 64,29 65,20 71,63 75,49 77,40 79,32`);
const PINCH = P(`50,92 38,84 30,72 27,59 29,47 38,58 33,44 29,40 30,46 50,56 50,36 50,24 50,13 61,58 63,40 64,29 65,20 71,63 75,49 77,40 79,32`);
const FIST = P(`50,92 38,84 32,72 38,64 46,64 38,58 38,46 42,52 42,60 50,56 50,44 53,51 52,59 61,58 61,46 62,53 60,60 71,63 71,52 71,58 69,63`);
const POINT = OPEN.map((p, i) => (i >= 5 && i <= 8 ? p : FIST[i]));
const POSES = { open: OPEN, pinch: PINCH, fist: FIST, point: POINT };
// offsets from (x, y) to the fingertip (point) and to the pinch midpoint, in screen fractions
export const TIP = { x: -0.032, y: -0.146 }, PINCHPT = { x: -0.041, y: -0.051 };

export function startHandSim(hands) {
  Object.defineProperty(hands.video, 'readyState', { get: () => 4, configurable: true });
  hands.mode = 'camera'; hands.busy = true; hands.lastResultT = performance.now();
  const state = [null, null];
  const lm = (pose, x, y) => POSES[pose].map(([u, v]) => ({ x: 1 - (x + (u - 50) / 100 * 0.2), y: y + (v - 60) / 100 * 0.2 * (16 / 9), z: 0 }));
  (function tick() {
    const landmarks = [], handedness = [];
    state.forEach((h, i) => { if (h) { landmarks.push(lm(h.pose, h.x, h.y)); handedness.push(i === 0 ? 'Right' : 'Left'); } });
    hands.latest = { landmarks, handedness }; hands.busy = true; requestAnimationFrame(tick);
  })();
  window.__sim = { set(i, pose, x, y) { state[i] = pose ? { pose, x, y } : null; }, clear() { state[0] = state[1] = null; }, TIP, PINCHPT };
}
