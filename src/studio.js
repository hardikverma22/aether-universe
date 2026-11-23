// Playground studio: choose what you make, its colour or type, bend time and gravity, recolour the stardust,
// start from a scene, and share what you made as a link.
import * as THREE from 'three/webgpu';
import gsap from 'gsap';

export const THEMES = {
  Nebula: ['#fff1dc', '#b9a3ff', '#5b7dff'],
  Aurora: ['#eafff6', '#5effc8', '#2a7bff'],
  Ember: ['#fff3d6', '#ffb35c', '#ff4d3d'],
  Glacier: ['#f4fbff', '#9fd8ff', '#4a6bff'],
  Rose: ['#fff0f6', '#ff8fc8', '#8a5cff'],
  Gold: ['#fffbea', '#ffd773', '#c46b2a'],
  Mono: ['#ffffff', '#c9ccd6', '#6f7686'],
};
const STARS = [['Red dwarf', 3200], ['Orange', 4400], ['Yellow, like the Sun', 5800], ['White', 8500], ['Blue giant', 16000]];
const KINDS = [['Random', null], ['Ocean', 'terran'], ['Rocky', 'desert'], ['Ice', 'ice'], ['Lava', 'lava'], ['Gas giant', 'gas']];
const MAKES = [['Auto', 'auto', 'Quick pinch or click makes a planet, hold for a star'], ['Star', 'star', ''], ['Planet', 'planet', ''], ['Black hole', 'hole', '']];
const SPEEDS = [['Pause', 0], ['½×', 0.5], ['1×', 1], ['2×', 2], ['4×', 4]];

export function makeStudio({ bodies, creator, galaxy, center, quat, say }) {
  const st = { theme: 'Nebula', time: 1, trails: true, g: 1 };
  const el = document.getElementById('studio');
  const chips = (items, cls, attr) => items.map(([label, val, title]) => `<button class="${cls}" data-${attr}="${val}"${title ? ` title="${title}"` : ''}>${label}</button>`).join('');
  el.innerHTML = `
    <button class="shead" aria-expanded="true"><span>Customise</span><i aria-hidden="true">⌄</i></button>
    <div class="sbody">
      <section><h3>Make</h3><div class="row">${chips(MAKES, 'chip', 'make')}</div></section>
      <section class="for-star"><h3>Star colour</h3><div class="row">${STARS.map(([n, t]) => `<button class="sw star" data-temp="${t}" title="${n} · ${t.toLocaleString()} K" aria-label="${n}" style="--c:${tempCss(t)}"></button>`).join('')}<button class="sw any" data-temp="0" title="Decided by size" aria-label="Decided by size">Any</button></div></section>
      <section class="for-planet"><h3>Planet type</h3><div class="row">${chips(KINDS.map(([n, k]) => [n, k ?? '']), 'chip sm', 'kind')}</div></section>
      <section><h3>Time</h3><div class="row">${chips(SPEEDS, 'chip sm', 'time')}</div></section>
      <section><h3>Gravity <output id="gOut">1×</output></h3><input id="gRange" type="range" min="0.25" max="3" step="0.05" value="1" aria-label="Gravity strength"></section>
      <section><h3>Stardust</h3><div class="row">${Object.entries(THEMES).map(([n, c]) => `<button class="sw theme" data-theme="${n}" title="${n}" aria-label="${n} stardust" style="--a:${c[0]};--b:${c[1]};--c:${c[2]}"></button>`).join('')}</div></section>
      <section><h3>Start from a scene</h3><div class="row scenes">
        <button class="chip" data-scene="solar">Solar system</button><button class="chip" data-scene="binary">Binary stars</button>
        <button class="chip" data-scene="feast">Black hole feast</button><button class="chip" data-scene="crash">Planet crash</button>
        <button class="chip" data-scene="cluster">Star cluster</button><button class="chip hot" data-scene="surprise">Surprise me</button></div></section>
      <section class="foot"><label class="tog"><input id="trailsTog" type="checkbox" checked> Trails</label><span class="sp"></span><button class="chip" id="stClear">Clear</button><button class="chip hot" id="stShare">Share link</button></section>
    </div>`;
  const $$ = (sel) => el.querySelectorAll(sel);
  const sync = () => {
    $$('[data-make]').forEach((b) => b.classList.toggle('on', b.dataset.make === creator.opt.make));
    $$('[data-temp]').forEach((b) => b.classList.toggle('on', +b.dataset.temp === creator.opt.temp));
    $$('[data-kind]').forEach((b) => b.classList.toggle('on', (b.dataset.kind || null) === creator.opt.kind));
    $$('[data-time]').forEach((b) => b.classList.toggle('on', +b.dataset.time === st.time));
    $$('[data-theme]').forEach((b) => b.classList.toggle('on', b.dataset.theme === st.theme));
    el.querySelector('.for-star').hidden = !['auto', 'star'].includes(creator.opt.make);
    el.querySelector('.for-planet').hidden = !['auto', 'planet'].includes(creator.opt.make);
    el.querySelector('#gOut').textContent = `${st.g.toFixed(2).replace(/\.?0+$/, '')}×`;
  };
  $$('[data-make]').forEach((b) => (b.onclick = () => { creator.opt.make = b.dataset.make; sync(); }));
  $$('[data-temp]').forEach((b) => (b.onclick = () => { creator.opt.temp = +b.dataset.temp; if (creator.opt.make === 'planet') creator.opt.make = 'auto'; sync(); }));
  $$('[data-kind]').forEach((b) => (b.onclick = () => { creator.opt.kind = b.dataset.kind || null; if (creator.opt.make === 'star') creator.opt.make = 'auto'; sync(); }));
  $$('[data-time]').forEach((b) => (b.onclick = () => { st.time = +b.dataset.time; sync(); }));
  $$('[data-theme]').forEach((b) => (b.onclick = () => { applyTheme(b.dataset.theme); sync(); }));
  $$('[data-scene]').forEach((b) => (b.onclick = () => scene(b.dataset.scene)));
  const gRange = el.querySelector('#gRange'); gRange.oninput = () => { st.g = +gRange.value; sync(); };
  el.querySelector('#trailsTog').onchange = (e) => { st.trails = e.target.checked; };
  el.querySelector('#stClear').onclick = () => { bodies.clear(); say('Cleared', 'An empty sky, ready for you'); };
  el.querySelector('#stShare').onclick = share;
  const head = el.querySelector('.shead');
  head.onclick = () => { const open = el.classList.toggle('closed') === false; head.setAttribute('aria-expanded', String(open)); };
  if (matchMedia('(max-width: 760px)').matches) { el.classList.add('closed'); head.setAttribute('aria-expanded', 'false'); }

  function applyTheme(name, instant = false) {
    st.theme = THEMES[name] ? name : 'Nebula'; const u = galaxy.u;
    THEMES[st.theme].forEach((hex, i) => { const c = new THREE.Color(hex), t = [u.c0, u.c1, u.c2][i].value; instant ? t.copy(c) : gsap.to(t, { r: c.r, g: c.g, b: c.b, duration: 1.2, ease: 'power2.inOut' }); });
  }

  // ---------- scenes: everything in orbit on the Playground's own plane
  const P = (x, z, y = 0) => new THREE.Vector3(x, y, z).applyQuaternion(quat).add(center);
  const V = (x, z) => new THREE.Vector3(x, 0, z).applyQuaternion(quat);
  const circ = (M, r) => Math.sqrt(st.g * M / r);
  function ring(M, r, a, kind, f = 1, mass = 0.01) { bodies.add('planet', P(Math.cos(a) * r, Math.sin(a) * r), V(-Math.sin(a), Math.cos(a)).multiplyScalar(circ(M, r) * f), mass, kind); }
  function scene(name) {
    const names = ['solar', 'binary', 'feast', 'crash', 'cluster'];
    if (name === 'surprise') { name = names[Math.floor(Math.random() * names.length)]; const t = Object.keys(THEMES); applyTheme(t[Math.floor(Math.random() * t.length)]); sync(); }
    bodies.clear();
    if (name === 'solar') {
      bodies.add('star', P(0, 0), new THREE.Vector3(), 1.6, undefined, { temp: 5800 });
      [[0.9, 'lava'], [1.45, 'terran'], [2.05, 'desert'], [2.9, 'gas'], [3.6, 'ice']].forEach(([r, k], i) => ring(1.6, r, i * 2.4, k));
      say('A solar system', 'Five worlds around a Sun-like star. Throw in a black hole?');
    } else if (name === 'binary') {
      const m = 1.0, d = 1.1, v = Math.sqrt(st.g * m / (2 * d));
      bodies.add('star', P(-d / 2, 0), V(0, -v), m, undefined, { temp: 4300 });
      bodies.add('star', P(d / 2, 0), V(0, v), m, undefined, { temp: 11000 });
      ring(2 * m, 3.0, 0.5, 'terran'); ring(2 * m, 3.7, 3.4, 'ice');
      say('Binary stars', 'An orange star and a blue star dancing, with worlds circling both');
    } else if (name === 'feast') {
      bodies.add('hole', P(0, 0), new THREE.Vector3(), 2.2);
      for (let i = 0; i < 10; i++) ring(2.2, 2.0 + (i % 3) * 0.55, i * 0.63, undefined, 0.78 + (i % 4) * 0.04);
      bodies.add('star', P(3.4, 0), V(0, 1).multiplyScalar(circ(2.2, 3.4) * 0.85), 0.5, undefined, { temp: 5200 });
      say('Black hole feast', 'Everything here is falling in. Watch the streams');
    } else if (name === 'crash') {
      bodies.add('star', P(0, 0), new THREE.Vector3(), 1.5, undefined, { temp: 6200 });
      ring(1.5, 2.2, 0, 'terran', 1); ring(1.5, 2.2, Math.PI * 0.55, 'gas', -1);
      say('Planet crash', 'Two worlds on the same orbit, going opposite ways');
    } else if (name === 'cluster') {
      // a young cluster in slow orbit around its own centre, spread out so the stars don't collide at once
      const n = 7, masses = Array.from({ length: n }, () => 0.25 + Math.random() * 0.45), M = masses.reduce((a, b) => a + b, 0);
      masses.forEach((m, i) => {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, r = 1.6 + Math.random() * 2.0, t = STARS[Math.floor(Math.random() * STARS.length)][1];
        bodies.add('star', P(Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 0.4), V(-Math.sin(a), Math.cos(a)).multiplyScalar(circ(M * 0.55, r) * (0.85 + Math.random() * 0.2)), m, undefined, { temp: t });
      });
      say('A star cluster', 'Young stars of every colour, pulling on each other');
    }
  }

  // ---------- share: the whole creation lives in the link
  function encode() {
    const r = (n) => Math.round(n * 1000) / 1000;
    const b = bodies.list.map((x) => { const p = x.pos.clone().sub(center), v = x.vel; return [x.type[0], x.kind || '', r(p.x), r(p.y), r(p.z), r(v.x), r(v.y), r(v.z), r(x.mass), x.fixedTemp || 0]; });
    return btoa(JSON.stringify({ v: 1, t: st.theme, g: st.g, b })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function share() {
    if (!bodies.list.length) { say('Nothing to share yet', 'Make a star or pick a scene first'); return; }
    const url = `${location.origin}${location.pathname}#s=${encode()}`;
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); say('Link copied', 'Anyone who opens it sees exactly what you made'); }
    catch { say('Link ready', 'Copy it from the address bar'); }
  }
  function loadFromHash() {
    const m = location.hash.match(/s=([\w-]+)/); if (!m) return false;
    try {
      const d = JSON.parse(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')));
      bodies.clear(); st.g = d.g || 1; gRange.value = st.g; applyTheme(d.t, true);
      const T = { s: 'star', p: 'planet', h: 'hole' };
      for (const [t, kind, x, y, z, vx, vy, vz, mass, temp] of d.b.slice(0, 64)) {
        const type = T[t]; if (!type) continue;
        // planets store their effective mass; bodies.add multiplies gas giants by 5, so undo that
        bodies.add(type, new THREE.Vector3(x, y, z).add(center), new THREE.Vector3(vx, vy, vz), type === 'planet' && kind === 'gas' ? mass / 5 : mass, kind || undefined, temp ? { temp } : {});
      }
      sync(); say('A shared universe', 'Someone made this and sent it to you'); return true;
    } catch (e) { console.warn('bad share link', e); return false; }
  }

  sync();
  return {
    st, applyTheme, scene, loadFromHash, sync,
    get timeScale() { return st.time; }, get trails() { return st.trails; }, get g() { return st.g; },
    setMake(m) { creator.opt.make = m; sync(); },
  };
}

function tempCss(t) {
  // rough blackbody colours for the swatches
  if (t < 3800) return '#ff9c5a'; if (t < 5000) return '#ffc27a'; if (t < 6500) return '#fff1d0'; if (t < 10000) return '#e6eeff'; return '#9fbaff';
}
