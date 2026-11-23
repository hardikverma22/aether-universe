// Aether — make stars, planets and black holes with your hands.
// Places: Playground (create freely) · Solar System (real, create too) · Universe (Universe › Galaxy › System › Planet)
import * as THREE from 'three/webgpu';
import {
  Fn, pass, screenUV, vec2, vec3, vec4, float, uniform, mix, smoothstep, length, texture, convertToTexture, max, uv,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import gsap from 'gsap';
import { startHeroHands } from './heroHands.js';
import { makeGalaxy } from './sim.js';
import { Bodies } from './bodies.js';
import { makeNebula } from './nebula.js';
import { Hands, CONNECTIONS } from './hands.js';
import { makeUniverse, PALETTES, SHAPES } from './universe.js';
import { makeSystemView, SOL, makeExoSystem, PLANET_FACTS, SUN_MASS, prefetchSol } from './system.js';
import { formatDate, moonKm } from './ephem.js';
import { makeCreator } from './create.js';
import * as sfx from './audio.js';
import { Rig } from './rig.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);

// ================================================================ renderer, scene, post
const renderer = new THREE.WebGPURenderer({ canvas: $('gl'), antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); // leave GPU headroom for hand tracking
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
await renderer.init();
if (!renderer.backend?.isWebGPUBackend) $('intro').querySelector('.lede').textContent = 'This needs WebGPU — try the latest Chrome, Edge or Safari.';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.02, 8000);
const rig = new Rig(camera);

const video = $('video');
const videoTex = new THREE.VideoTexture(video); videoTex.colorSpace = THREE.SRGBColorSpace;
const U = { feed: uniform(0), cover: uniform(new THREE.Vector2(1, 1)), bangUV: uniform(new THREE.Vector2(0.5, 0.5)), lens: uniform(0), chroma: uniform(0), flash: uniform(0), shadowUV: uniform(new THREE.Vector2(0.5, 0.5)), shadowR: uniform(0), shadow: uniform(0) };
scene.backgroundNode = Fn(() => {
  const s = screenUV;
  const space = mix(vec3(0.03, 0.03, 0.075), vec3(0.004, 0.004, 0.012), smoothstep(0.0, 0.75, length(s.sub(vec2(0.5, 0.45)))));
  const vuv = vec2(0.5).add(s.sub(0.5).mul(U.cover));
  const cam = texture(videoTex, vec2(float(1).sub(vuv.x), float(1).sub(vuv.y))).rgb;
  const lum = cam.dot(vec3(0.299, 0.587, 0.114));
  const duo = mix(vec3(0.01, 0.012, 0.035), vec3(0.3, 0.34, 0.6), smoothstep(0.15, 0.95, lum)).mul(0.3);
  const vign = smoothstep(0.95, 0.25, length(s.sub(0.5).mul(vec2(1.2, 1))));
  return mix(space, duo.mul(vign).add(space.mul(0.4)), U.feed);
})();

const universe = makeUniverse({ seed: +(q.get('seed') || 7) });
scene.add(universe.group);
const small = matchMedia('(max-width: 700px)').matches;
const bodies = new Bodies(scene);
const galaxy = makeGalaxy({ count: small ? 90000 : 240000, bodies: bodies.gpu });
scene.add(galaxy.sprite);
const nebula = makeNebula({ count: small ? 16000 : 40000 });
scene.add(nebula.sprite);
const systemView = makeSystemView(scene);

const pipeline = new THREE.RenderPipeline(renderer);
const scenePass = pass(scene, camera);
const glowFx = bloom(scenePass, 0.8, 0.6, 0.22);
const lit = convertToTexture(scenePass.add(glowFx));
pipeline.outputNode = Fn(() => {
  const uvn = screenUV; const asp = float(innerWidth / innerHeight);
  const d = uvn.sub(U.bangUV).mul(vec2(asp, 1)); const r = length(d).add(1e-3); const dir = d.div(r).div(vec2(asp, 1));
  const warp = U.lens.mul(0.035).div(r.add(0.06)).mul(smoothstep(0.0, 0.06, r));
  const uv2 = uvn.sub(dir.mul(warp));
  const ca = dir.mul(U.chroma.mul(0.02).mul(r.add(0.2)));
  const col = vec3(lit.sample(uv2.add(ca)).r, lit.sample(uv2).g, lit.sample(uv2.sub(ca)).b);
  const hole = float(1).sub(U.lens.mul(smoothstep(0.05, 0.0, r)));
  const rs = length(uvn.sub(U.shadowUV).mul(vec2(asp, 1)));
  const shade = float(1).sub(U.shadow.mul(smoothstep(U.shadowR, U.shadowR.mul(0.55), rs)));
  return vec4(col.mul(max(hole, 0.0)).mul(shade).add(U.flash.mul(vec3(1.0, 0.92, 0.82))), 1);
})();
const LOOK = {
  playground: { exp: 0.95, glow: 0.7, thr: 0.3 }, universe: { exp: 0.95, glow: 0.8, thr: 0.22 }, galaxy: { exp: 0.95, glow: 0.8, thr: 0.22 },
  system: { exp: 0.9, glow: 0.45, thr: 0.62 }, star: { exp: 0.5, glow: 0.35, thr: 0.85 }, planet: { exp: 0.95, glow: 0.35, thr: 0.7 },
};
function setLook(k, d = 1.4) { const L = LOOK[k]; gsap.to(renderer, { toneMappingExposure: L.exp, duration: d }); gsap.to(glowFx.strength, { value: L.glow, duration: d }); gsap.to(glowFx.threshold, { value: L.thr, duration: d }); }
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); sizeOverlay(); updateCover(); });

// ================================================================ state
// mode: 'playground' | 'universe' | 'galaxy' | 'system' | 'flying'; focus = close-up of one body
let mode = 'playground', current = universe.list[0], currentSystem = null, focus = null, started = false;
const GALAXY_R = 8.5, SYSTEM_R = 24, OVERVIEW_R = 640, PLAY_R = 9;
const viewDir = (g) => { const n = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quat), p = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quat); return n.multiplyScalar(0.88).add(p.multiplyScalar(0.47)).normalize(); };
const sysWorld = (g, s) => g.pos.clone().add(s.local.clone().applyQuaternion(g.quat));
const ORIGIN = new THREE.Vector3();

const markers = new THREE.Group(); scene.add(markers);
function buildMarkers(g) {
  markers.clear();
  g.systems.forEach((s) => {
    const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const d = length(uv().sub(0.5)).mul(2);
    m.colorNode = vec4(s.real ? vec3(1.0, 0.86, 0.6) : vec3(0.75, 0.85, 1.0), 1);
    m.opacityNode = smoothstep(0.22, 0.0, d).add(smoothstep(1.0, 0.0, d).pow(3).mul(0.5)).add(smoothstep(0.06, 0.0, d.sub(0.7).abs()).mul(0.6));
    const sp = new THREE.Sprite(m); sp.scale.setScalar(s.real ? 0.32 : 0.24); sp.position.copy(sysWorld(g, s)); sp.userData.sys = s; markers.add(sp);
  });
}
function galaxyLook(g) {
  const u = galaxy.u;
  u.center.value.copy(g.pos); u.orient.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(g.quat));
  u.shape.value = g.shape; u.arms.value = g.arms; u.twist.value = g.twist; u.size.value = g.size;
  PALETTES[g.palette].forEach((hex, i) => [u.c0, u.c1, u.c2][i].value.set(hex));
  u.starPull.value = 0.22; u.gather.value = 19;
  renderer.compute(galaxy.init);
}
function loadGalaxy(g) { galaxyLook(g); bodies.clear(); buildMarkers(g); }
// the Playground: a soft stardust nebula at the origin; stars you make swirl the dust around them
const PLAY = { pos: new THREE.Vector3(0, 0, 0), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0.05)) };
function loadPlayground() {
  const u = galaxy.u;
  u.center.value.copy(PLAY.pos); u.orient.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(PLAY.quat));
  u.shape.value = 4; u.size.value = 1; ['#fff1dc', '#b9a3ff', '#5b7dff'].forEach((hex, i) => [u.c0, u.c1, u.c2][i].value.set(hex));
  u.starPull.value = 0.75; u.gather.value = 30;
  renderer.compute(galaxy.init);
  bodies.clear(); bodies.setCenter(PLAY.pos); bodies.configure({ coreMass: 0, coreSoft: 1, sizeMul: 1.6, escape: 30 });
  universe.group.visible = false; markers.visible = false; systemView.setVisible(false);
  galaxy.sprite.visible = true; galaxy.u.fade.value = 1; currentSystem = null; focus = null;
  rig.min = 3; rig.max = 30; rig.setFrom(PLAY.pos, new THREE.Vector3(0, 0.55, 1), PLAY_R);
}

// ================================================================ coordinate mapping
function updateCover() { const sa = innerWidth / innerHeight, va = (video.videoWidth || 16) / (video.videoHeight || 9); U.cover.value.set(sa > va ? 1 : sa / va, sa > va ? va / sa : 1); }
const videoToScreen = (x, y) => ({ x: 0.5 + (x - 0.5) / U.cover.value.x, y: 0.5 + (y - 0.5) / U.cover.value.y });
const _fwd = new THREE.Vector3();
const toWorld = (nx, ny, depth = 0) => {
  const dir = new THREE.Vector3(nx * 2 - 1, -(ny * 2 - 1), 0.5).unproject(camera).sub(camera.position).normalize();
  camera.getWorldDirection(_fwd);
  const D = camera.position.distanceTo(rig.target) * (1 - depth * 0.16);
  return camera.position.clone().addScaledVector(dir, D / Math.max(0.2, dir.dot(_fwd)));
};
const toScreen = (v) => { const s = v.clone().project(camera); return { x: (s.x * 0.5 + 0.5) * innerWidth, y: (0.5 - s.y * 0.5) * innerHeight, front: s.z < 1 }; };

// ================================================================ hands + creation
const hands = new Hands(video);
let sayT;
// name card: the title's letters rise into place, the line under it eases in; it leaves the same way.
// `stay` keeps it up (used while you're looking at a close-up) until the next card or unfocus.
const card = { tl: null, timer: 0, key: '' };
function splitChars(el, text) {
  el.textContent = '';
  for (const word of text.split(' ')) {
    const w = document.createElement('span'); w.className = 'w';
    for (const ch of word) { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; w.appendChild(c); }
    el.appendChild(w); el.appendChild(document.createTextNode(' '));
  }
  return el.querySelectorAll('.c');
}
function hideCard(fast) {
  const el = $('toast'); clearTimeout(card.timer); card.key = '';
  card.tl?.kill();
  card.tl = gsap.timeline()
    .to(el.querySelectorAll('.tname .c'), { yPercent: -105, opacity: 0, duration: fast ? 0.25 : 0.45, ease: 'power3.in', stagger: fast ? 0.008 : 0.015 })
    .to(el.querySelector('.tsub'), { opacity: 0, y: -6, filter: 'blur(4px)', duration: fast ? 0.2 : 0.35, ease: 'power2.in' }, 0);
  return card.tl;
}
function say(title, sub = '', stay = false) {
  const el = $('toast'); const key = title + '|' + sub;
  if (key === card.key) { clearTimeout(card.timer); if (!stay) card.timer = setTimeout(() => hideCard(), 2600 + sub.length * 22); return; }
  const show = () => {
    card.key = key; el.style.opacity = 1;
    const chars = splitChars(el.querySelector('.tname'), title); const subEl = el.querySelector('.tsub'); subEl.textContent = sub;
    card.tl = gsap.timeline()
      .fromTo(chars, { yPercent: 105, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.9, ease: 'expo.out', stagger: Math.min(0.035, 0.5 / chars.length) })
      .fromTo(subEl, { opacity: 0, y: 10, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8, ease: 'power3.out' }, 0.18);
    clearTimeout(card.timer); if (!stay) card.timer = setTimeout(() => hideCard(), 2600 + sub.length * 22);
  };
  if (card.key) hideCard(true).eventCallback('onComplete', show); else { card.tl?.kill(); show(); }
}
const made = { star: 0, planet: 0, hole: 0, supernova: 0 };
const creator = makeCreator({ scene, camera, bodies, nebula, hands, toWorld, toScreen, say, events: (kind, b) => {
  if (made[kind] != null) made[kind]++;
  if (kind === 'star' && made.star === 1) say('A star is born', 'Now pinch quickly near it and let go — a planet');
  if (kind === 'planet' && made.planet === 1) say('It\'s orbiting', 'Your first solar system');
  if (kind === 'hole') say('Black hole', 'It swallows anything that comes too close');
  if (kind === 'supernova') { say('Supernova', 'You pulled a star apart'); U.flash.value = 0.3; nova.chroma = 0.8; galaxy.u.bangPos.value.copy(b.pos); nova.explode = 0.5; }
  if (kind === 'tool') $('btnHole').classList.remove('on');
} });

// ================================================================ picking
function pickGalaxy(px, py, extra = 0) {
  let best = null, bestD = 1e9;
  for (const g of universe.list) {
    const s = toScreen(g.pos); if (!s.front) continue;
    const radPx = Math.max(14 + extra, (3.6 * g.size / camera.position.distanceTo(g.pos)) * innerHeight * 1.2);
    const d = Math.hypot(s.x - px, s.y - py); if (d < radPx && d < bestD) { best = g; bestD = d; }
  }
  return best;
}
function pickMarker(px, py, radius = 34) {
  let best = null, bd = radius;
  for (const m of markers.children) { const s = toScreen(m.position); if (!s.front) continue; const d = Math.hypot(s.x - px, s.y - py); if (d < bd) { bd = d; best = m.userData.sys; } }
  return best;
}
const sunObj = { name: 'sun', isSun: true, pos: new THREE.Vector3(), radius: 1 };
function pickWorld(px, py, extra = 0) {
  const cands = [...(mode === 'system' ? systemView.visitables : []), ...bodies.list, ...(mode === 'system' ? [Object.assign(sunObj, { radius: systemView.sunRadius })] : [])];
  let best = null, bd = 1e9;
  for (const b of cands) {
    const s = toScreen(b.pos); if (!s.front) continue;
    const rpx = Math.max(16 + extra, (b.radius / camera.position.distanceTo(b.pos)) * innerHeight * 1.2);
    const d = Math.hypot(s.x - px, s.y - py); if (d < rpx && d < bd) { bd = d; best = b; }
  }
  return best;
}

// ================================================================ places and transitions
const warp = (to, d = 0.6) => new Promise((res) => gsap.to('#warp', { opacity: to, duration: d, ease: 'power2.inOut', onComplete: res }));
async function goPlayground() {
  if (mode === 'playground' || rig.busy) return;
  mode = 'flying'; refreshHUD(); await warp(1, 0.45);
  loadPlayground(); setLook('playground', 0.1); mode = 'playground'; refreshHUD(); await warp(0, 0.8); coachFor('playground');
}
async function goUniverse() {
  if (mode === 'universe' || rig.busy) return;
  mode = 'flying'; refreshHUD(); await warp(1, 0.45);
  systemView.setVisible(false); bodies.clear(); focus = null; currentSystem = null;
  universe.group.visible = true; markers.visible = false; galaxy.u.fade.value = 0; galaxy.sprite.visible = false;
  universe.setAlpha(current.id, 1);
  rig.min = 30; rig.max = 1400; rig.setFrom(ORIGIN, new THREE.Vector3(0.2, 0.45, 1), OVERVIEW_R); setLook('universe', 0.1);
  mode = 'universe'; refreshHUD(); await warp(0, 0.8); coachFor('universe');
}
async function goSolarSystem() { if (rig.busy) return; current = universe.list[0]; await enterSystem(current.systems.find((s) => s.real), true); }
async function enterGalaxy(g) {
  if (mode !== 'universe' || rig.busy) return;
  mode = 'flying'; hover = null; dwell = 0; refreshHUD();
  current = g; let loaded = false; galaxy.u.fade.value = 0; galaxy.sprite.visible = true;
  say(g.name, `${SHAPES[g.shape]} galaxy · ${g.systems.length} star systems to visit`); sfx.whoosh();
  await rig.flyTo(g.pos, viewDir(g), GALAXY_R, 3.0, (t) => {
    if (t > 0.55 && !loaded) { loaded = true; loadGalaxy(g); bodies.configure({ coreMass: 0.8, coreSoft: 1.2, sizeMul: 1, escape: 16 }); bodies.setCenter(g.pos); }
    if (loaded) galaxy.u.fade.value = Math.min(1, (t - 0.55) / 0.4);
    universe.setAlpha(g.id, Math.max(0, 1 - Math.max(0, t - 0.6) / 0.35));
  });
  mode = 'galaxy'; rig.min = 4; rig.max = 40; markers.visible = true; refreshHUD(); coachFor('galaxy');
}
async function exitGalaxy() {
  if (mode !== 'galaxy' || rig.busy) return;
  mode = 'flying'; refreshHUD(); markers.visible = false;
  const g = current; const back = camera.position.clone().sub(g.pos).normalize();
  gsap.to(galaxy.u.fade, { value: 0, duration: 1.2 });
  await rig.flyTo(ORIGIN, back.lengthSq() ? back : new THREE.Vector3(0, 0.4, 1), OVERVIEW_R, 2.8, (t) => universe.setAlpha(g.id, Math.min(1, t * 2)));
  mode = 'universe'; rig.min = 30; rig.max = 1400; refreshHUD();
}
async function enterSystem(s, direct = false) {
  if ((!direct && mode !== 'galaxy') || rig.busy) return;
  const from = mode; mode = 'flying'; hover = null; dwell = 0; refreshHUD();
  say(s.real ? 'The Solar System' : s.name, s.real ? 'Our home: the real planets, where they are today' : 'A star system: you can create here');
  if (from === 'galaxy') { const wp = sysWorld(current, s); await rig.flyTo(wp, camera.position.clone().sub(wp).normalize(), 0.5, 1.6, (t) => { if (t > 0.6) galaxy.u.fade.value = Math.max(0, 1 - (t - 0.6) / 0.4); }); }
  sfx.whoosh(); await warp(1, 0.4);
  currentSystem = s.real ? SOL : makeExoSystem(s.seed, s.name);
  systemView.load(currentSystem); systemView.setVisible(true);
  universe.group.visible = false; markers.visible = false; galaxy.sprite.visible = false; galaxy.u.fade.value = 0;
  bodies.clear(); bodies.setCenter(ORIGIN); bodies.configure({ coreMass: SUN_MASS, coreSoft: 0.02, sizeMul: 2.4, escape: 40 });
  rig.min = 2.5; rig.max = 60; rig.setFrom(ORIGIN, new THREE.Vector3(0.2, 0.55, 1), 9); rig.goal.radius = SYSTEM_R;
  setLook('system', 0.1); focus = null;
  mode = 'system'; refreshHUD(); await warp(0, 0.9); coachFor(isSol() ? 'sol' : 'system');
}
async function exitSystem() {
  if (mode !== 'system' || rig.busy) return;
  focus = null; mode = 'flying'; refreshHUD(); await warp(1, 0.45);
  systemView.setVisible(false); bodies.clear(); bodies.configure({ coreMass: 0.8, coreSoft: 1.2, sizeMul: 1, escape: 16 }); bodies.setCenter(current.pos);
  universe.group.visible = true; galaxyLook(current); buildMarkers(current); markers.visible = true; galaxy.sprite.visible = true; galaxy.u.fade.value = 1;
  rig.min = 4; rig.max = 40; rig.setFrom(current.pos, viewDir(current), GALAXY_R); setLook('galaxy', 0.1); currentSystem = null;
  mode = 'galaxy'; refreshHUD(); await warp(0, 0.8);
}
const describe = (b) => {
  if (b.isSun) return [currentSystem?.name === 'Sol' ? 'The Sun' : `${currentSystem?.name} (star)`, `${Math.round(currentSystem?.star.temp || 5778).toLocaleString()} K`];
  if (b.def) return [b.name, PLANET_FACTS[b.name] || b.fact || b.def.kind || ''];
  return b.type === 'hole' ? ['Black hole', `${b.mass.toFixed(1)} masses`] : b.type === 'star' ? [`${b.cls}-type star`, `${Math.round(b.temp).toLocaleString()} K · you made this`] : [({ terran: 'Ocean world', desert: 'Desert world', ice: 'Ice world', lava: 'Lava world', gas: 'Gas giant' })[b.kind] || 'World', 'you made this'];
};
function focusOn(b) {
  if (!b || (mode !== 'system' && mode !== 'playground')) return;
  focus = b; rig.min = b.radius * 1.6;
  rig.goal.radius = focusDist(b);
  const [t, sub] = describe(b); say(t, sub, true); refreshHUD(); setLook(b.isSun || b.type === 'star' ? 'star' : 'planet');
  systemView.visitables.forEach((o) => o.orbitLine && gsap.to(o.orbitLine.material, { opacity: 0.025, duration: 1 }));
}
function unfocus() {
  if (!focus) return; focus = null; hideCard();
  systemView.visitables.forEach((o) => o.orbitLine && gsap.to(o.orbitLine.material, { opacity: 0.12, duration: 1 }));
  if (mode === 'system') { rig.min = 2.5 * Math.pow(0.004, systemView.scale.k); rig.goal.radius = viewR(); setLook('system'); } else { rig.min = 3; rig.goal.radius = PLAY_R; setLook('playground'); }
  refreshHUD();
}
let focusLast = null; const _fv = new THREE.Vector3();
function updateFocus(dt) {
  if (focus && focus.type && !bodies.list.includes(focus)) unfocus();
  if (rig.busy) return;
  const goal = focus ? focus.pos : mode === 'system' ? ORIGIN : mode === 'galaxy' ? current.pos : mode === 'playground' ? PLAY.pos : null;
  // ride along with a moving focus exactly (planets move many times their own size per second at true scale), then ease in the rest
  if (focus) { if (focusLast && focusLast.b === focus) rig.target.add(_fv.subVectors(focus.pos, focusLast.p)); focusLast = { b: focus, p: focus.pos.clone() }; } else focusLast = null;
  if (goal) rig.target.lerp(goal, 1 - Math.exp(-dt * (focus ? 6 : 3)));
}
function goUp() { if (focus) unfocus(); else if (mode === 'system') exitSystem(); else if (mode === 'galaxy') exitGalaxy(); }

// ================================================================ effects: Big Bang (galaxy), supernova flash, black-hole lensing
const bang = { state: 'idle', charge: 0, startD: 0, t: 0, explode: 0 };
const nova = { explode: 0, chroma: 0 };
function updateEffects(dt) {
  const [a, b] = hands.hands; const both = mode === 'galaxy' && a.active > 0.8 && b.active > 0.8 && a.open > 0.5 && b.open > 0.5;
  const d = both ? a.pos.distanceTo(b.pos) : 99;
  if (bang.state === 'idle' && both && d < 1.0) { bang.state = 'charging'; bang.startD = d; bang.charge = 0; }
  if (bang.state === 'charging') {
    galaxy.u.bangPos.value.lerp(both ? a.pos.clone().add(b.pos).multiplyScalar(0.5) : galaxy.u.bangPos.value, 0.3); bang.charge = Math.min(1, bang.charge + dt / 1.2);
    if (!both || d > bang.startD + 0.9) { if (bang.charge > 0.35) { bang.state = 'exploding'; bang.explode = 1; bang.t = 0; sfx.boom(); } else bang.state = 'idle'; }
  }
  if (bang.state === 'exploding') { bang.t += dt; bang.explode *= Math.exp(-dt * 2.2); if (bang.t > 2.2) bang.state = 'idle'; }
  galaxy.u.implode.value += ((bang.state === 'charging' ? bang.charge : 0) - galaxy.u.implode.value) * 0.2;
  galaxy.u.explode.value = bang.state === 'exploding' ? bang.explode : nova.explode;
  const s = galaxy.u.bangPos.value.clone().project(camera); U.bangUV.value.set(s.x * 0.5 + 0.5, 0.5 - s.y * 0.5);
  U.lens.value = galaxy.u.implode.value * 0.9;
  const bh = bodies.list.filter((x) => x.type === 'hole').sort((x, y) => y.mass - x.mass)[0];
  if (bh) {
    const c = bh.pos.clone().project(camera); const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const e = bh.pos.clone().addScaledVector(right, bh.radius * 2.2).project(camera);
    if (galaxy.u.implode.value < 0.05) { U.bangUV.value.set(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5); U.lens.value = Math.min(0.22, 0.06 * Math.sqrt(bh.mass)); }
    U.shadowUV.value.set(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5); U.shadowR.value = Math.abs(e.x - c.x) * 0.5 * (innerWidth / innerHeight); U.shadow.value += (0.92 - U.shadow.value) * 0.1;
  } else U.shadow.value *= 0.9;
  U.chroma.value = galaxy.u.explode.value + nova.chroma;
  U.flash.value = bang.state === 'exploding' ? Math.max(0, 1 - bang.t * 3) ** 2 * 0.9 : Math.max(0, U.flash.value - dt);
  nova.explode *= Math.exp(-dt * 2.5); nova.chroma *= Math.exp(-dt * 2.0); if (nova.explode < 0.01) nova.explode = 0;
}
function bodyEvents() {
  for (const ev of bodies.events.splice(0)) {
    nebula.emitBurst(ev.pos, ev.into === 'hole' ? new THREE.Color(1, 0.55, 0.2) : ev.color || new THREE.Color(1, 1, 1), 700, 0.5);
    nova.chroma = Math.max(nova.chroma, 0.25); sfx.thump();
  }
}

// ================================================================ hands: point to go closer, both palms to go back, open palm turns systems
let hover = null, dwell = 0, stillPalms = 0;
const POINT_HOLD = 0.7, PALMS_HOLD = 0.8;
function handNavigation(dt) {
  handNavigation.tip = null; handNavigation.target = null;
  if (hands.mode !== 'camera' || !started) return;
  const act = hands.hands.filter((h) => h.active > 0.7);
  const pointer = act.find((h) => h.point > 0.6 && (h.draw || h.screen));
  const tp = pointer ? (pointer.draw || pointer.screen)[8] : null; const tip = tp ? { x: tp.x * innerWidth, y: tp.y * innerHeight } : null;
  const target = !tip ? null : mode === 'universe' ? pickGalaxy(tip.x, tip.y, 40) : mode === 'galaxy' ? pickMarker(tip.x, tip.y, 80) : (mode === 'system' || mode === 'playground') ? pickWorld(tip.x, tip.y, 40) : null;
  handNavigation.tip = tip; handNavigation.target = target;
  if (target && target === hover) { dwell += dt / POINT_HOLD; if (dwell >= 1) { dwell = 0; if (mode === 'universe') enterGalaxy(target); else if (mode === 'galaxy') enterSystem(target); else if (focus !== target) focusOn(target); } }
  else if (tip) { hover = target; dwell = 0; } else dwell = Math.max(0, dwell - dt * 3);
  if (mode === 'universe' || mode === 'system') {
    const palm = act.find((h) => h.open > 0.6 && h.point < 0.3);
    if (palm && act.length === 1 && !creator.isBusy()) rig.orbit(-palm.vel.x * dt * 0.09, palm.vel.y * dt * 0.06);
  }
  const still = act.length === 2 && act.every((h) => h.open > 0.7 && h.vel.length() < 0.8 && h.screen) && Math.abs(act[0].screen[0].x - act[1].screen[0].x) > 0.3;
  stillPalms = still && (mode === 'galaxy' || mode === 'system' || focus) ? stillPalms + dt : 0;
  $('exitRing').style.setProperty('--p', Math.min(1, stillPalms / PALMS_HOLD));
  if (stillPalms > PALMS_HOLD) { stillPalms = 0; goUp(); }
}

// ================================================================ overlay
const overlay = $('overlay'), ctx = overlay.getContext('2d');
function sizeOverlay() { const r = Math.min(devicePixelRatio, 2); overlay.width = innerWidth * r; overlay.height = innerHeight * r; ctx.setTransform(r, 0, 0, r, 0, 0); }
sizeOverlay();
let mouseHover = null;
function pill(text, x, y, warm) {
  if (!text) return; ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
  ctx.font = '600 13px ui-sans-serif, -apple-system, sans-serif'; const w = ctx.measureText(text).width + 18;
  ctx.fillStyle = 'rgba(10,10,24,0.72)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 12, w, 24, 12); ctx.fill();
  ctx.fillStyle = warm ? '#ffd6aa' : '#e8ecff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1); ctx.restore();
}
// legend (right side) and markers for bodies too small to see; both list the Sun, planets, Moon and spacecraft
const BODY_COL = { 'The Sun': '#ffc861', Mercury: '#b9b0a6', Venus: '#e9cd92', Earth: '#5f9dff', Moon: '#d6d6d6', Mars: '#e2713f', Jupiter: '#dcb68c', Saturn: '#ead49c', Uranus: '#a3e5ea', Neptune: '#5577ff' };
const legendBodies = () => isSol() ? [Object.assign(sunObj, { radius: systemView.sunRadius }), ...systemView.visitables] : [];
const nameOf = (b) => (b.isSun ? 'The Sun' : b.name);
let legendHover = null, legendKey = '';
function buildLegend() {
  const list = legendBodies(); const key = list.map(nameOf).join(',');
  $('legend').hidden = !list.length || !started; if (!list.length || key === legendKey) return; legendKey = key;
  const rows = []; let craftHead = false;
  for (const b of list) {
    if (b.def?.craft && !craftHead) { rows.push('<li class="lhead">Spacecraft</li>'); craftHead = true; }
    const n = nameOf(b), col = BODY_COL[n] || '#cfe5ff';
    rows.push(`<li><button data-n="${n}" class="${b.parent ? 'sub' : ''}${b.def?.craft ? ' craft' : ''}"><i style="--c:${col}"></i><span>${n}</span><em></em></button></li>`);
  }
  $('legendList').innerHTML = rows.join('');
  $('legendList').querySelectorAll('button').forEach((btn) => {
    const b = () => legendBodies().find((x) => nameOf(x) === btn.dataset.n);
    btn.onclick = () => { const t = b(); if (t) focus === t ? unfocus() : focusOn(t); };
    btn.onmouseenter = () => (legendHover = btn.dataset.n); btn.onmouseleave = () => (legendHover = null);
  });
}
let legendT = 0;
function updateLegend(dt) {
  buildLegend(); if ($('legend').hidden) return;
  legendT -= dt; const sun = new THREE.Vector3();
  const list = legendBodies();
  $('legendList').querySelectorAll('button').forEach((btn) => {
    const b = list.find((x) => nameOf(x) === btn.dataset.n); if (!b) return;
    btn.classList.toggle('on', focus === b);
    if (legendT <= 0 && !b.isSun) btn.querySelector('em').textContent = distanceLabel(b);
  });
  if (legendT <= 0) legendT = 0.5;
}
function distanceLabel(b) {
  if (b.def?.craft) return b.host ? `at ${b.host}` : 'interstellar';
  if (b.parent) return `${Math.round(moonKm(systemView.clock.date)).toLocaleString()} km`;
  const au = systemView.realDistance?.(b.name);
  return au ? `${au.toFixed(2)} AU` : '';
}
function drawMarkers() {
  if (!isSol()) return;
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.font = '500 12px Onest, ui-sans-serif, sans-serif'; ctx.textBaseline = 'middle';
  const placed = [];
  for (const b of legendBodies()) {
    if (b === focus) continue;
    const s = toScreen(b.pos); if (!s.front) continue;
    const d = camera.position.distanceTo(b.pos); const px = (b.radius / d) * innerHeight * 1.2;
    const n = nameOf(b), hot = legendHover === n;
    if (px > 6 && !hot) continue;                                   // big enough to see: no marker needed
    if (b.def?.craft && !hot && focus?.name !== b.host) continue;   // spacecraft: only around the planet you're visiting
    if (!hot && placed.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < 18)) continue;   // don't stack markers (Moon/ISS on Earth)
    placed.push(s);
    const col = BODY_COL[n] || '#cfe5ff', a = hot ? 1 : b.def?.craft ? 0.55 : 0.8;
    ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = hot ? 2 : 1.4;
    ctx.beginPath(); ctx.arc(s.x, s.y, hot ? 9 : 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = hot ? '#fff' : 'rgba(232,236,255,0.85)'; ctx.fillText(n, s.x + (hot ? 15 : 10), s.y);
  }
  ctx.restore();
}
function drawOverlay() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  drawMarkers();
  ctx.globalCompositeOperation = 'lighter';
  for (const h of hands.hands) {
    if (h.active < 0.02 || hands.mode !== 'camera' || !h.screen) continue;
    const P = (h.draw || h.screen).map((p) => [p.x * innerWidth, p.y * innerHeight]);
    ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(170,190,255,${0.24 * h.active})`; ctx.lineWidth = 1.3; ctx.shadowColor = 'rgba(140,170,255,0.9)'; ctx.shadowBlur = 12;
    ctx.beginPath(); for (const [a, b] of CONNECTIONS) { ctx.moveTo(...P[a]); ctx.lineTo(...P[b]); } ctx.stroke();
    ctx.fillStyle = `rgba(230,236,255,${0.6 * h.active})`; for (const i of [4, 8, 12, 16, 20]) { ctx.beginPath(); ctx.arc(...P[i], 2.4, 0, 7); ctx.fill(); }
    const g = h.point > 0.6 ? '👉 point' : h.lat.pinch.on ? '🤏 pinch' : h.lat.fist.on ? '✊ fist' : h.open > 0.6 ? '✋ open' : '';
    pill(g, P[0][0], P[0][1] + 60, h.point > 0.6 || h.lat.pinch.on || h.lat.fist.on);
  }
  for (const l of creator.labels) pill(l.text, l.x, l.y, true);
  const T = handNavigation.tip;
  if (started && T && mode !== 'flying') {
    const tgt = handNavigation.target; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
    ctx.strokeStyle = tgt ? 'rgba(255,214,170,0.95)' : 'rgba(220,228,255,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(T.x, T.y, 20, 0, 7); ctx.stroke();
    ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(T.x + dx * 26, T.y + dy * 26); ctx.lineTo(T.x + dx * 34, T.y + dy * 34); } ctx.stroke();
    if (tgt && dwell > 0) { ctx.strokeStyle = 'rgba(255,214,170,1)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(T.x, T.y, 20, -Math.PI / 2, -Math.PI / 2 + Math.min(1, dwell) * Math.PI * 2); ctx.stroke(); }
    pill(tgt ? 'hold to go closer' : mode === 'universe' ? 'point at a galaxy' : mode === 'galaxy' ? 'point at a glowing star system' : 'point at a planet or star', T.x, T.y + 54, !!tgt);
  }
  const label = $('label'); const h = hover || mouseHover;
  const pos = !h || mode === 'flying' ? null : mode === 'galaxy' ? (h.local ? sysWorld(current, h) : null) : h.pos;
  if (h && pos) {
    const s = toScreen(pos);
    label.hidden = false; label.style.transform = `translate(${s.x + 34}px, ${s.y - 14}px)`;
    const [title, sub] = mode === 'universe' ? [h.name, `${SHAPES[h.shape]} · ${h.systems.length} star systems`]
      : mode === 'galaxy' ? [h.real ? 'Sol' : h.name, (h.real ? 'Our Solar System' : 'Star system') + (hands.mode === 'camera' ? ' — point & hold' : ' — click to visit')]
      : describe(h);
    label.innerHTML = `<b>${title}</b><span>${sub}</span>`;
  } else label.hidden = true;
  if (started && mode === 'galaxy' && current.id === 0 && !h) {
    const solM = markers.children.find((m) => m.userData.sys.real);
    if (solM) { const s = toScreen(solM.position); if (s.front) { ctx.globalCompositeOperation = 'source-over'; ctx.font = '500 13px ui-sans-serif, -apple-system, sans-serif'; ctx.fillStyle = 'rgba(255,230,190,0.95)'; ctx.textAlign = 'left'; ctx.fillText('Sol · our Solar System', s.x + 18, s.y + 4); } }
  }
}

// ================================================================ mouse + keys
const glc = $('gl'); let drag = null;
// our real Solar System is for exploring; you create in the Playground and in the other star systems
const isSol = () => mode === 'system' && currentSystem === SOL;
const creating = () => mode === 'playground' || (mode === 'system' && !isSol());
const picking = () => creating() || mode === 'system';
glc.addEventListener('pointerdown', (e) => {
  if (!started) return; const now = performance.now();
  // a click on one of the system's own planets (or its sun) is for visiting it, never for creating
  const own = mode === 'system' && !creator.mouseTool ? pickWorld(e.clientX, e.clientY) : null;
  const ownHit = own && !bodies.list.includes(own);
  if (creating() && !ownHit && hands.mode === 'mouse' && creator.mouseDown(e, now)) { drag = { x: e.clientX, y: e.clientY, moved: 0, creating: true }; return; }
  drag = { x: e.clientX, y: e.clientY, moved: 0 };
});
addEventListener('pointermove', (e) => {
  if (!started) return; const now = performance.now();
  if (drag?.creating) { if (!creator.mouseMove(e, now)) drag.creating = false; else return; }
  if (drag && mode !== 'galaxy' && mode !== 'flying') { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); rig.orbit(-dx * 0.004, -dy * 0.004); drag.x = e.clientX; drag.y = e.clientY; }
  else if (drag) drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
  mouseHover = mode === 'universe' ? pickGalaxy(e.clientX, e.clientY) : mode === 'galaxy' ? pickMarker(e.clientX, e.clientY) : picking() ? pickWorld(e.clientX, e.clientY) : null;
});
addEventListener('pointerup', (e) => {
  if (!started) return; const now = performance.now();
  if (drag?.creating) { const r = creator.mouseUp(e, now); drag = null; if (r?.body) focusOn(r.body); return; }
  if (drag && drag.moved < 6) {
    if (mode === 'universe') { const g = pickGalaxy(e.clientX, e.clientY); if (g) enterGalaxy(g); }
    else if (mode === 'galaxy') { const s = pickMarker(e.clientX, e.clientY); if (s) enterSystem(s); }
    else if (picking()) { const b = pickWorld(e.clientX, e.clientY); if (b) focusOn(b); }
  }
  drag = null;
});
glc.addEventListener('dblclick', (e) => { if (started && picking()) { const b = pickWorld(e.clientX, e.clientY); if (b) focusOn(b); } });
glc.addEventListener('wheel', (e) => {
  e.preventDefault(); if (!started) return; rig.zoom(Math.exp(e.deltaY * 0.0012));
  if (e.deltaY > 0 && focus && rig.goal.radius > focus.radius * 22) unfocus();
  else if (e.deltaY > 0 && rig.goal.radius >= rig.max - 0.5 && (mode === 'galaxy' || mode === 'system')) goUp();
}, { passive: false });
addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.key === 'Escape') goUp();
  if (e.key === 'b' && creating()) toggleHoleTool();
  if (e.key === 'r') toggleRecord();
  if (e.key === 'v') $('btnFeed').click();
  if (e.key === 't') setTrueScale(systemView.scale.k < 0.5);
  if (e.key === '1') goPlayground(); if (e.key === '2') goSolarSystem(); if (e.key === '3') goUniverse();
});
creator.blocked = (x, y) => { if (mode !== 'system') return false; const b = pickWorld(x, y); return !!b && !bodies.list.includes(b); };
function toggleHoleTool() { const on = creator.mouseTool !== 'hole'; creator.setTool(on ? 'hole' : null); $('btnHole').classList.toggle('on', on); if (on) say('Black hole', 'Click where it should appear'); }

// ================================================================ recording (9:16)
const rec = { on: false, r: null, cv: document.createElement('canvas') };
rec.cv.width = 1080; rec.cv.height = 1920; const rctx = rec.cv.getContext('2d');
function recordFrame() {
  if (!rec.on) return;
  const sh = glc.height, sw = sh * 9 / 16; rctx.drawImage(glc, (glc.width - sw) / 2, 0, sw, sh, 0, 0, 1080, 1920);
  const osh = overlay.height, osw = osh * 9 / 16; rctx.globalCompositeOperation = 'lighter'; rctx.drawImage(overlay, (overlay.width - osw) / 2, 0, osw, osh, 0, 0, 1080, 1920); rctx.globalCompositeOperation = 'source-over';
}
function toggleRecord() {
  const btn = $('btnRec'); if (rec.on) { rec.r.stop(); return; }
  const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const chunks = []; rec.r = new MediaRecorder(rec.cv.captureStream(60), { mimeType: type, videoBitsPerSecond: 14e6 });
  rec.r.ondataavailable = (e) => chunks.push(e.data);
  rec.r.onstop = () => { rec.on = false; btn.classList.remove('on'); btn.textContent = '● Record'; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type })); a.download = `aether-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`; a.click(); };
  rec.r.start(250); rec.on = true; btn.classList.add('on'); btn.textContent = '■ Stop';
}

// ================================================================ HUD: places, breadcrumb, one short panel, coach
const PANEL = {
  playground: { title: 'Playground', cam: ['🤏 <b>Pinch &amp; hold</b>, let go → star', '🤏 <b>Quick pinch</b> near a star → planet', '✊✊ <b>Two fists</b> together → black hole', '🤏 <b>Pinch a world</b> to grab and throw it'], mouse: ['<b>Hold</b> in space, release → star', '<b>Click</b> near a star → planet', '<b>Drag</b> a world to throw it', '<b>B</b> → black hole'] },
  system: { title: 'Star system', cam: ['🤏 <b>Pinch</b> to add planets and stars', '👉 <b>Point &amp; hold</b> a planet → close-up', '✋✋ <b>Both palms</b> → back'], mouse: ['<b>Hold / click</b> in space to add worlds', '<b>Click</b> a planet → close-up', '<b>Drag</b> to turn · <b>Esc</b> back'] },
  galaxy: { title: 'A galaxy', cam: ['✋ <b>Move your hand</b> through the stars', '👉 <b>Point &amp; hold</b> a glowing star system', '✋✋ <b>Both palms</b> → back'], mouse: ['<b>Move</b> through the stars', '<b>Click</b> a glowing star system', '<b>Esc</b> → back'] },
  universe: { title: 'The universe', cam: ['✋ <b>Open palm</b> turns the sky', '👉 <b>Point &amp; hold</b> a galaxy to fly in'], mouse: ['<b>Drag</b> to turn, <b>scroll</b> to zoom', '<b>Click</b> a galaxy to fly in'] },
  sol: { title: 'The Solar System', cam: ['👉 <b>Point &amp; hold</b> a planet → close-up', '✋ <b>Open palm</b> turns the view', '✋✋ <b>Both palms</b> → back'], mouse: ['<b>Click</b> a planet → close-up', '<b>Drag</b> to turn · <b>scroll</b> to zoom', '<b>Esc</b> → back'] },
  planet: { title: 'Close-up', cam: ['✋✋ <b>Both palms</b> → back'], mouse: ['<b>Drag</b> to look around · <b>Esc</b> back'] },
};
function refreshHUD() {
  if (refreshHUD.lastMode !== mode) { hover = null; mouseHover = null; dwell = 0; refreshHUD.lastMode = mode; }
  const key = focus ? 'planet' : mode === 'flying' ? null : isSol() ? 'sol' : mode;
  const cam = hands.mode === 'camera';
  if (key) { $('panelTitle').textContent = PANEL[key].title; $('guide').innerHTML = PANEL[key][cam ? 'cam' : 'mouse'].map((t) => `<li>${t}</li>`).join(''); }
  $('panel').style.opacity = key ? 1 : 0;
  const place = mode === 'playground' ? 'playground' : (mode === 'system' && currentSystem === SOL) ? 'sol' : mode === 'flying' ? null : 'universe';
  document.querySelectorAll('#places [data-place]').forEach((b) => b.classList.toggle('on', b.dataset.place === place));
  const crumbs = [];
  if (mode === 'galaxy' || (mode === 'system' && currentSystem !== SOL)) crumbs.push(['universe', 'Universe'], ['galaxy', current.name]);
  if (mode === 'system' && currentSystem && currentSystem !== SOL) crumbs.push(['system', currentSystem.name]);
  if (focus) crumbs.push(['planet', describe(focus)[0]]);
  $('crumbs').innerHTML = crumbs.map(([k, n], i) => i < crumbs.length - 1 ? `<button data-go="${k}">${n}</button><span>›</span>` : `<b>${n}</b>`).join('');
  $('crumbs').hidden = !crumbs.length;
  $('crumbs').querySelectorAll('[data-go]').forEach((b) => (b.onclick = async () => { const k = b.dataset.go; if (k === 'universe') { if (mode === 'system') await exitSystem(); if (mode === 'galaxy') exitGalaxy(); } if (k === 'galaxy' && mode === 'system') exitSystem(); if (k === 'system') unfocus(); }));
  $('tools2').hidden = !creating() || hands.mode === 'camera' && false;
  $('timebar').hidden = !isSol(); syncTimebar(); $('credit').hidden = !isSol();
}

const settled = (h) => h.active > 0.8 && performance.now() - (h.since || 0) > 400;
const COACH = {
  playground: {
    camera: [
      { text: '✋ Raise one hand so the camera can see it', done: () => hands.hands.some((h) => h.active > 0.8), ok: 'Got your hand' },
      { text: '🤏 Pinch your thumb and finger, and hold — watch the stardust gather', done: () => creator.gatherHeld > 0.6, ok: 'Gathering stardust…' },
      { text: 'Let go — a star is born', done: () => made.star > 0, ok: 'A star!' },
      { text: '🤏 Now a quick pinch near your star, and let go', done: () => made.planet > 0, ok: 'A planet in orbit' },
      { text: '✊✊ Two fists together → a black hole', done: () => made.hole > 0, ok: 'A black hole' },
    ],
    mouse: [
      { text: 'Press and hold in space — watch the stardust gather', done: () => creator.gatherHeld > 0.6, ok: 'Gathering stardust…' },
      { text: 'Release — a star is born', done: () => made.star > 0, ok: 'A star!' },
      { text: 'Click near your star — a planet', done: () => made.planet > 0, ok: 'A planet in orbit' },
      { text: 'Press B, then click, for a black hole', done: () => made.hole > 0, ok: 'A black hole' },
    ],
  },
  sol: { camera: [{ text: '👉 Point at a planet and hold for a close-up', done: () => !!focus, ok: 'Close-up' }], mouse: [{ text: 'Click a planet for a close-up', done: () => !!focus, ok: 'Close-up' }] },
  system: { camera: [{ text: '🤏 Pinch near the Sun and let go — add a world to the system', done: () => made.planet + made.star > 0, ok: 'Added to the system' }, { text: '👉 Point & hold a planet for a close-up', done: () => !!focus, ok: 'Close-up' }], mouse: [{ text: 'Click in space to add a world to the system', done: () => made.planet + made.star > 0, ok: 'Added to the system' }, { text: 'Click a planet for a close-up', done: () => !!focus, ok: 'Close-up' }] },
  universe: { camera: [{ text: '👉 Point at a galaxy and hold to fly in', done: () => mode === 'galaxy', ok: 'Into a galaxy' }], mouse: [{ text: 'Click any galaxy to fly in', done: () => mode === 'galaxy', ok: 'Into a galaxy' }] },
  galaxy: { camera: [{ text: '👉 Point & hold a glowing star system to visit it', done: () => mode === 'system', ok: 'A new star system' }], mouse: [{ text: 'Click a glowing star system to visit it', done: () => mode === 'system', ok: 'A new star system' }] },
};
const coach = { steps: null, done: [], t: [], flash: 0, flashText: '', seen: new Set() };
function coachFor(level) {
  const key = level + (hands.mode === 'camera' ? 'c' : 'm'); if (coach.seen.has(key)) { $('coach').hidden = true; return; }
  coach.seen.add(key); coach.steps = COACH[level][hands.mode === 'camera' ? 'camera' : 'mouse'];
  coach.done = coach.steps.map(() => false); coach.t = coach.steps.map(() => 0); coach.flash = 0; $('coach').hidden = false; coachRender();
}
const coachCur = () => coach.done.indexOf(false);
function coachRender() {
  const el = $('coach'); const st = coach.steps; const i = coachCur();
  if (!st || (i < 0 && coach.flash <= 0)) { el.hidden = true; return; }
  const showOk = coach.flash > 0;
  el.querySelector('.ctext').textContent = showOk ? '✓ ' + coach.flashText : st[i].text; el.classList.toggle('ok', showOk);
  el.querySelector('.cdots').innerHTML = st.map((_, k) => `<i class="${coach.done[k] ? 'd' : k === i ? 'c' : ''}"></i>`).join('');
  el.querySelector('.cstep').textContent = i < 0 ? 'All done' : `Step ${i + 1} of ${st.length}`;
}
function coachTick(dt) {
  if (!coach.steps || $('coach').hidden) return;
  if (coach.flash > 0) { coach.flash -= dt; if (coach.flash <= 0) coachRender(); return; }
  const k = coachCur(); if (k < 0) return;
  const s = coach.steps[k]; const now = s.done(); coach.t[k] = now ? coach.t[k] + dt : 0;
  if (now && coach.t[k] >= (s.hold || 0)) { coach.done[k] = true; coach.flash = 1.1; coach.flashText = s.ok; coachRender(); }
}

// ================================================================ home (attract mode: a little solar system forms behind the title) + start
function attract() {
  loadPlayground();
  const c = PLAY.pos.clone().add(new THREE.Vector3(1.4, 0, 0));
  rig.setFrom(c, new THREE.Vector3(0, 0.42, 1), 8.6);
  bodies.calm = true; galaxy.u.starPull.value = 0;   // home: perfect orbits that never decay, stardust that doesn't clump
  const sun = bodies.add('star', c, new THREE.Vector3(), 1.9);
  [[1.15, 'lava', 0.4], [1.75, 'terran', 2.6], [2.45, 'ice', 4.4], [3.3, 'gas', 1.5]].forEach(([r, kind, a]) => {
    const p = c.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    const t = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(Math.sqrt(sun.mass / r)); bodies.add('planet', p, t, 0.01, kind);
  });
}
// on the home screen the scene is framed to the right of the headline (below it on a phone); eased away on start
const homeShift = { k: 1 };
function applyHomeShift() {
  if (homeShift.k <= 0.001) { if (camera.view?.enabled) camera.clearViewOffset(); return; }
  const w = innerWidth, h = innerHeight, phone = w < 760;
  camera.setViewOffset(w, h, phone ? 0 : -w * 0.17 * homeShift.k, phone ? -h * 0.14 * homeShift.k : 0, w, h);
}
attract();
startHeroHands($('gestures'));
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  gsap.from('#title .ln > span', { yPercent: 110, duration: 1.2, ease: 'expo.out', stagger: 0.09, delay: 0.2 });
  gsap.from('#intro .lede, #intro .cta, #gestures li, #intro .fine', { y: 20, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.07, delay: 0.55 });
}
const status = $('status'); const simDate = $('simDate');
async function start(m) {
  document.querySelectorAll('.cta button').forEach((b) => (b.disabled = true));
  sfx.initAudio();
  try { if (m === 'camera') { status.textContent = 'Waking the stars…'; await hands.initCamera(); updateCover(); } else hands.initMouse(glc); }
  catch (e) { console.warn(e); hands.initMouse(glc); banner('Camera unavailable — using the mouse. Allow camera access, then click 🖱 Mouse to switch.'); }
  gsap.to('#intro', { opacity: 0, duration: 0.9, ease: 'power2.inOut', onComplete: () => ($('intro').hidden = true) });
  bodies.clear(); bodies.calm = false; galaxy.u.starPull.value = 0.75; renderer.compute(galaxy.init); gsap.to(homeShift, { k: 0, duration: 1.6, ease: 'power2.inOut' }); gsap.to(rig.goal, { radius: PLAY_R, phi: 1.068, duration: 1.6, ease: 'power2.inOut' });
  gsap.to(rig.target, { x: PLAY.pos.x, y: PLAY.pos.y, z: PLAY.pos.z, duration: 1.6, ease: 'power2.inOut' });
  started = true; $('hud').hidden = false; status.textContent = ''; updateInputButton(); refreshHUD();
  gsap.from('#panel, #tools, #places', { y: 12, opacity: 0, duration: 0.9, delay: 0.4 });
  setTimeout(() => say('Your playground', 'Make anything — nothing can go wrong'), 900);
  coachFor('playground');
  setTimeout(prefetchSol, 3000);
}
function updateInputButton() { $('btnFeed').hidden = hands.mode !== 'camera'; $('btnInput').textContent = hands.mode === 'camera' ? '✋ Hands' : '🖱 Mouse'; $('btnInput').title = hands.mode === 'camera' ? 'Using your hands — click to use the mouse' : 'Using the mouse — click to use your hands'; }
function banner(text) { const b = $('banner'); b.textContent = text; b.hidden = !text; }
async function switchInput() {
  if (hands.mode === 'camera') hands.initMouse(glc);
  else { try { if (!hands.worker) await hands.initCamera(); else hands.mode = 'camera'; updateCover(); banner(''); } catch (e) { console.warn(e); hands.initMouse(glc); banner('Camera unavailable (' + (e.name || 'error') + '). Allow camera access in the address bar, then try again.'); } }
  updateInputButton(); refreshHUD(); coach.seen.clear(); coachFor(mode === 'flying' ? 'playground' : isSol() ? 'sol' : mode);
}

$('btnCam').onclick = () => start('camera');
$('btnMouse').onclick = () => start('mouse');
$('btnRec').onclick = toggleRecord;
$('btnInput').onclick = switchInput;
$('coachSkip').onclick = () => { $('coach').hidden = true; };
$('btnFeed').onclick = () => { gsap.to(U.feed, { value: U.feed.value > 0.5 ? 0 : 1, duration: 0.8 }); $('btnFeed').classList.toggle('on', U.feed.value <= 0.5); };
$('btnHole').onclick = toggleHoleTool;
// true scale: real sizes and distances, blended smoothly; the camera keeps whatever you were looking at framed
const viewR = () => SYSTEM_R * Math.pow(150 / SYSTEM_R, systemView.scale.k);
const focusDist = (b) => b.radius * (b.def?.rings ? 7 : b.isSun ? 4.5 : 5.5);
function setTrueScale(on) {
  if (!isSol()) return;
  gsap.to(systemView.scale, { k: on ? 1 : 0, duration: 2.6, ease: 'power2.inOut', overwrite: true });
  $('btnScale').classList.toggle('on', on);
  say(on ? 'True scale' : 'Compact view', on ? 'Real sizes and distances. Planets become specks; use the list on the right to find them' : 'Sizes and distances squeezed so everything fits');
}
function syncTimebar() { const c = systemView.clock; $('btnScale').onclick = () => setTrueScale(systemView.scale.k < 0.5);
document.querySelectorAll('#timebar [data-speed]').forEach((b) => b.classList.toggle('on', c.live ? b.dataset.speed === 'live' : +b.dataset.speed === c.speed)); }
document.querySelectorAll('#timebar [data-speed]').forEach((b) => (b.onclick = () => { const c = systemView.clock; if (b.dataset.speed === 'live') c.live = true; else { c.live = false; c.speed = +b.dataset.speed; } syncTimebar(); }));
$('btnClear').onclick = () => { bodies.clear(); say('Cleared', ''); };
document.querySelectorAll('#places [data-place]').forEach((b) => (b.onclick = () => ({ playground: goPlayground, sol: goSolarSystem, universe: goUniverse })[b.dataset.place]()));

// ================================================================ loop
let last = performance.now();
const FRAME_MS = 1000 / 61;
const FAR = new THREE.Vector3(0, 0, 1e4);
renderer.setAnimationLoop((now) => {
  if (now - last < FRAME_MS - 1) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  hands.update(now, dt, videoToScreen, toWorld);
  handNavigation(dt);
  if (mode === 'system') systemView.update(dt);   // move the worlds first so the camera follows this frame's positions
  updateFocus(dt);
  if (!started) rig.orbit(dt * 0.03, 0);   // slow drift on the home screen
  applyHomeShift();
  rig.update(dt);
  const u = galaxy.u; u.time.value = now / 1000; u.dt.value = dt; camera.getWorldDirection(u.viewDir.value);
  const live = started && (mode === 'galaxy' || mode === 'playground') && !focus;
  hands.hands.forEach((h, i) => {
    const t = u.hands[i];
    t.pos.value.copy(h.pos); t.vel.value.copy(h.vel).clampLength(0, 14);
    // in the Playground pinching gathers stardust into your fingers; in a galaxy hands just stir the stars
    t.active.value = live ? h.active : 0; t.pinch.value = mode === 'playground' && hands.mode === 'camera' ? h.pinch : 0; t.fist.value = 0; t.open.value = h.open; t.burst.value = 0; t.point.value = 0;
    for (let j = 0; j < 21; j++) u.joints.array[i * 21 + j].copy(live && h.active > 0.3 && hands.mode === 'camera' ? h.world[j] : FAR);
  });
  if (hands.mode === 'mouse' && live) { u.hands[0].active.value = creator.isBusy() ? 1 : 0.6; u.hands[0].pinch.value = mode === 'playground' && creator.gatherHeld > 0 ? 1 : 0; }
  creator.enabled = started && creating() && !focus;
  creator.tickMouse(now); creator.update(dt, now);
  coachTick(dt);
  if (isSol()) {
    const k = systemView.scale.k; rig.max = 60 * Math.pow(7, k);
    const moving = k > 0.001 && k < 0.999;
    if (focus) { rig.min = focus.radius * 1.6; if (moving) rig.goal.radius = focusDist(focus); }
    else { rig.min = 2.5 * Math.pow(0.004, k); if (moving) rig.goal.radius = viewR(); }
    const near = THREE.MathUtils.clamp(camera.position.distanceTo(rig.target) * 0.05, 1e-6, 0.02);
    if (Math.abs(near - camera.near) / camera.near > 0.1) { camera.near = near; camera.updateProjectionMatrix(); }
    const t = (systemView.clock.live ? 'Now · ' : '') + formatDate(systemView.clock.date); if (simDate.textContent !== t) simDate.textContent = t;
  } else {
    if (camera.near !== 0.02) { camera.near = 0.02; camera.updateProjectionMatrix(); }
    if (systemView.scale.k) { gsap.killTweensOf(systemView.scale); systemView.scale.k = 0; $('btnScale').classList.remove('on'); }
  }
  if (mode === 'system' || mode === 'playground' || !started) bodies.step(dt);
  bodyEvents();
  updateEffects(dt);
  nebula.update(renderer, dt, now / 1000);
  if (galaxy.sprite.visible && u.fade.value > 0.001) renderer.compute(galaxy.compute);
  pipeline.render();
  updateLegend(dt);
  drawOverlay();
  recordFrame();
});

if (q.has('debug')) {
  const el = document.createElement('div'); el.id = 'debug'; el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);font:12px ui-monospace,monospace;color:#9fb4ff;z-index:9';
  document.body.append(el); let frames = 0, t = performance.now(), lastR = last;
  (function loop() { if (last !== lastR) { frames++; lastR = last; } const n = performance.now(); if (n - t > 500) { const st = hands.stats;
    el.textContent = `render ${(frames * 1000 / (n - t)).toFixed(0)} fps · tracking ${(st.hz || 0).toFixed(0)} Hz · ${mode}${focus ? ' · ' + describe(focus)[0] : ''} · bodies ${bodies.list.length}`; frames = 0; t = n; }
    requestAnimationFrame(loop); })();
}
window.__aether = { renderer, galaxy, hands, camera, rig, universe, systemView, bodies, nebula, creator, enterGalaxy, exitGalaxy, enterSystem, exitSystem, goPlayground, goSolarSystem, goUniverse, focusOn, unfocus, goUp, get mode() { return mode; }, get current() { return current; }, get focus() { return focus; }, made };
