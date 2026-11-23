// Small animated hand skeletons for the home screen, drawn in the same dot-and-bone style the app uses
// to show your tracked hand. Each one loops a gesture: hold a pinch -> star, quick pinch -> planet, peace sign -> black hole.
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const P = (s) => s.trim().split(/\s+/).map((pt) => pt.split(',').map(Number));
// 21 landmarks (MediaPipe order) in a 100x100 box, palm facing you
const OPEN = P(`50,92 36,84 26,72 20,60 16,50 38,58 36,40 35,29 34,19 50,56 50,36 50,24 50,13 61,58 63,40 64,29 65,20 71,63 75,49 77,40 79,32`);
const PINCH = P(`50,92 38,84 30,72 27,59 29,47 38,58 33,44 29,40 30,46 50,56 50,36 50,24 50,13 61,58 63,40 64,29 65,20 71,63 75,49 77,40 79,32`);
const FIST = P(`50,92 38,84 32,72 38,64 46,64 38,58 38,46 42,52 42,60 50,56 50,44 53,51 52,59 61,58 61,46 62,53 60,60 71,63 71,52 71,58 69,63`);

// ✌️ index and middle up, ring and pinky curled, thumb tucked
const VICTORY = OPEN.map((p, i) => ([1, 2, 3, 4, 13, 14, 15, 16, 17, 18, 19, 20].includes(i) ? FIST[i] : p)).map((p, i) => (i === 8 ? [28, 21] : i === 7 ? [31, 31] : i === 12 ? [56, 14] : i === 11 ? [54, 25] : p));
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent?.appendChild(e); return e; };
const mix = (a, b, t) => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]);
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

function makeHand(svg, transform) {
  const g = el('g', { transform }, svg);
  const lines = BONES.map(() => el('line', { class: 'bone' }, g));
  const dots = OPEN.map((_, i) => el('circle', { r: i % 4 === 0 && i ? 2.6 : 2, class: 'joint' }, g));
  return (pts) => {
    BONES.forEach(([a, b], i) => { const l = lines[i]; l.setAttribute('x1', pts[a][0]); l.setAttribute('y1', pts[a][1]); l.setAttribute('x2', pts[b][0]); l.setAttribute('y2', pts[b][1]); });
    pts.forEach((p, i) => { dots[i].setAttribute('cx', p[0]); dots[i].setAttribute('cy', p[1]); });
  };
}

const GESTURES = {
  // hold a pinch: a ball of light grows between the fingers, then becomes a star when you let go
  star(svg) {
    const hand = makeHand(svg, 'translate(4 4) scale(.92)');
    const glow = el('circle', { class: 'glow', cx: 31, cy: 45 }, svg), core = el('circle', { class: 'core', cx: 31, cy: 45 }, svg);
    return (t) => { // 3.2 s loop
      const c = (t % 3.2), close = ease(c / 0.35) * (1 - ease((c - 2.1) / 0.3));
      hand(mix(OPEN, PINCH, close));
      const grow = c < 0.35 ? 0 : c < 2.1 ? (c - 0.35) / 1.75 : 1, born = ease((c - 2.1) / 0.25) * (1 - ease((c - 2.8) / 0.4));
      const r = 1.5 + grow * 5 + born * 4;
      core.setAttribute('r', c < 0.35 || c > 3.15 ? 0 : r); glow.setAttribute('r', c < 0.35 || c > 3.15 ? 0 : r * 2.4);
      core.style.opacity = glow.style.opacity = c > 2.8 ? 1 - ease((c - 2.8) / 0.4) : 1;
    };
  },
  // quick pinch: a small planet flies off along a curve
  planet(svg) {
    const hand = makeHand(svg, 'translate(4 4) scale(.92)');
    const orbit = el('path', { class: 'orbit', d: 'M31 45 C 52 18, 86 22, 88 48' }, svg);
    const len = orbit.getTotalLength(); orbit.style.strokeDasharray = `2 3`;
    const ball = el('circle', { class: 'planet', r: 3.4 }, svg);
    return (t) => { // 2.4 s loop
      const c = t % 2.4, close = ease(c / 0.18) * (1 - ease((c - 0.4) / 0.15));
      hand(mix(OPEN, PINCH, close));
      const fly = c < 0.45 ? -1 : Math.min(1, (c - 0.45) / 1.1);
      if (fly < 0) { ball.style.opacity = c > 0.18 ? 1 : 0; ball.setAttribute('cx', 31); ball.setAttribute('cy', 45); }
      else { const p = orbit.getPointAtLength(len * (1 - (1 - fly) ** 2)); ball.setAttribute('cx', p.x); ball.setAttribute('cy', p.y); ball.style.opacity = 1 - ease((c - 1.7) / 0.5); }
      orbit.style.opacity = fly < 0 ? 0 : 0.6 * (1 - ease((c - 1.7) / 0.5));
    };
  },
  // hold a peace sign: a dark disc with a bright rim opens above the hand
  hole(svg) {
    const hand = makeHand(svg, 'translate(4 10) scale(.88)');
    const ring = el('circle', { class: 'ring', cx: 50, cy: 16 }, svg), disc = el('circle', { class: 'disc', cx: 50, cy: 16 }, svg);
    return (t) => { // 3 s loop
      const c = t % 3, v = ease(c / 0.35) * (1 - ease((c - 2.4) / 0.4));
      hand(mix(OPEN, VICTORY, v));
      const h = ease((c - 0.8) / 0.5) * (1 - ease((c - 2.4) / 0.5)), r = h * 9;
      ring.setAttribute('r', r + 1.6); disc.setAttribute('r', r); ring.style.opacity = h;
    };
  },
};

export function startHeroHands(root) {
  if (!root) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const players = [...root.querySelectorAll('[data-g]')].map((li) => {
    const svg = li.querySelector('svg'); return GESTURES[li.dataset.g](svg);
  });
  if (still) { players.forEach((p, i) => p([1.6, 0.3, 1.5][i])); return; }
  const t0 = performance.now();
  const tick = (now) => {
    if (root.closest('#intro')?.hidden) return;   // stop once the experience has started
    const t = (now - t0) / 1000; players.forEach((p, i) => p(t + i * 0.7));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
