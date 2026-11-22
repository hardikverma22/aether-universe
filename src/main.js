// Aether — one continuous journey: Universe › Galaxy › Star system › Planet
import * as THREE from 'three/webgpu';
import {
  Fn, pass, screenUV, vec2, vec3, vec4, float, uniform, mix, smoothstep, length, texture, convertToTexture, max, uv,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import gsap from 'gsap';
import { makeGalaxy } from './sim.js';
import { Bodies } from './bodies.js';
import { makeNebula } from './nebula.js';
import { Hands, CONNECTIONS } from './hands.js';
import { makeUniverse, PALETTES, SHAPES } from './universe.js';
import { makeSystemView, SOL, makeExoSystem, PLANET_FACTS, SUN_MASS } from './system.js';
import { Rig } from './rig.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);

// ================================================================ renderer, scene, post
const renderer = new THREE.WebGPURenderer({ canvas: $('gl'), antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); // leave GPU headroom for hand tracking
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
await renderer.init();
if (!renderer.backend?.isWebGPUBackend) $('intro').querySelector('.lede').textContent = 'This needs WebGPU — try the latest Chrome, Edge or Safari.';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.02, 8000);
const rig = new Rig(camera);

// background: deep space, optionally blended with a stylized mirrored camera feed ("You" button; off by default)
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
const LOOK = { // per-level exposure + glow
  universe: { exp: 0.95, glow: 0.8, thr: 0.22 }, galaxy: { exp: 0.95, glow: 0.8, thr: 0.22 },
  system: { exp: 0.9, glow: 0.45, thr: 0.62 }, star: { exp: 0.5, glow: 0.35, thr: 0.85 }, planet: { exp: 0.95, glow: 0.35, thr: 0.7 },
};
function setLook(k, d = 1.4) { const L = LOOK[k]; gsap.to(renderer, { toneMappingExposure: L.exp, duration: d }); gsap.to(glowFx.strength, { value: L.glow, duration: d }); gsap.to(glowFx.threshold, { value: L.thr, duration: d }); }

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); sizeOverlay(); updateCover(); });

// ================================================================ state
// level: 'universe' | 'galaxy' | 'system'; focus = a planet/moon/star close-up inside a system
let mode = 'galaxy', current = universe.list[0], currentSystem = null, focus = null, started = false;
const GALAXY_R = 8.5, SYSTEM_R = 24, OVERVIEW_R = 640;

const viewDir = (g) => { const n = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quat), p = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quat); return n.multiplyScalar(0.88).add(p.multiplyScalar(0.47)).normalize(); };
const sysWorld = (g, s) => g.pos.clone().add(s.local.clone().applyQuaternion(g.quat));

// glowing star-system markers inside the current galaxy
const markers = new THREE.Group(); scene.add(markers);
function buildMarkers(g) {
  markers.clear();
  g.systems.forEach((s) => {
    const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const d = length(uv().sub(0.5)).mul(2);
    const core = smoothstep(0.22, 0.0, d), halo = smoothstep(1.0, 0.0, d).pow(3).mul(0.5);
    const ring = smoothstep(0.06, 0.0, d.sub(0.7).abs()).mul(0.6);
    m.colorNode = vec4(s.real ? vec3(1.0, 0.86, 0.6) : vec3(0.75, 0.85, 1.0), 1); m.opacityNode = core.add(halo).add(ring);
    const sp = new THREE.Sprite(m); sp.scale.setScalar(s.real ? 0.32 : 0.24); sp.position.copy(sysWorld(g, s)); sp.userData.sys = s;
    markers.add(sp);
  });
}
function loadGalaxy(g) {
  const u = galaxy.u;
  u.center.value.copy(g.pos); u.orient.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(g.quat));
  u.shape.value = g.shape; u.arms.value = g.arms; u.twist.value = g.twist; u.size.value = g.size;
  PALETTES[g.palette].forEach((hex, i) => [u.c0, u.c1, u.c2][i].value.set(hex));
  renderer.compute(galaxy.init);
  bodies.clear(); buildMarkers(g);
}
loadGalaxy(current); universe.setAlpha(0, 0);
rig.setFrom(current.pos, viewDir(current), GALAXY_R);

// ================================================================ coordinate mapping
function updateCover() {
  const sa = innerWidth / innerHeight, va = (video.videoWidth || 16) / (video.videoHeight || 9);
  U.cover.value.set(sa > va ? 1 : sa / va, sa > va ? va / sa : 1);
}
const videoToScreen = (x, y) => ({ x: 0.5 + (x - 0.5) / U.cover.value.x, y: 0.5 + (y - 0.5) / U.cover.value.y });
// screen point -> world point on a plane facing the camera through whatever we're looking at
const _fwd = new THREE.Vector3();
const toWorld = (nx, ny, depth = 0) => {
  const dir = new THREE.Vector3(nx * 2 - 1, -(ny * 2 - 1), 0.5).unproject(camera).sub(camera.position).normalize();
  camera.getWorldDirection(_fwd);
  const D = camera.position.distanceTo(rig.target) * (1 - depth * 0.16);
  return camera.position.clone().addScaledVector(dir, D / Math.max(0.2, dir.dot(_fwd)));
};
const toScreen = (v) => { const s = v.clone().project(camera); return { x: (s.x * 0.5 + 0.5) * innerWidth, y: (0.5 - s.y * 0.5) * innerHeight, front: s.z < 1 }; };
const camFwd = () => camera.getWorldDirection(new THREE.Vector3());

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
function pickWorld(px, py, extra = 0) { // planets, moons, the sun, and anything you created
  const cands = [...systemView.visitables, ...bodies.list, { ...sunObj, radius: currentSystem?.star.radius || 1 }];
  let best = null, bd = 1e9;
  for (const b of cands) {
    const s = toScreen(b.pos); if (!s.front) continue;
    const rpx = Math.max(16 + extra, (b.radius / camera.position.distanceTo(b.pos)) * innerHeight * 1.2);
    const d = Math.hypot(s.x - px, s.y - py); if (d < rpx && d < bd) { bd = d; best = b; }
  }
  return best;
}

// ================================================================ level transitions
const warp = (to, d = 0.6) => new Promise((res) => gsap.to('#warp', { opacity: to, duration: d, ease: 'power2.inOut', onComplete: res }));

async function enterGalaxy(g) {
  if (mode !== 'universe' || rig.busy) return;
  mode = 'flying'; hover = null; dwell = 0; refreshHUD();
  current = g; let loaded = false; galaxy.u.fade.value = 0;
  say(g.name, `${SHAPES[g.shape]} galaxy · ${g.systems.length} star systems to visit`);
  await rig.flyTo(g.pos, viewDir(g), GALAXY_R, 3.2, (t) => {
    if (t > 0.55 && !loaded) { loaded = true; loadGalaxy(g); }
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
  await rig.flyTo(new THREE.Vector3(0, 0, 0), back.lengthSq() ? back : new THREE.Vector3(0, 0.4, 1), OVERVIEW_R, 3.0, (t) => universe.setAlpha(g.id, Math.min(1, t * 2)));
  mode = 'universe'; rig.min = 30; rig.max = 1400; refreshHUD(); coachFor('universe');
}
async function enterSystem(s) {
  if (mode !== 'galaxy' || rig.busy) return;
  mode = 'flying'; hover = null; dwell = 0; refreshHUD();
  const wp = sysWorld(current, s);
  say(s.real ? 'Sol' : s.name, s.real ? 'Our Solar System' : 'Star system');
  await rig.flyTo(wp, camera.position.clone().sub(wp).normalize(), 0.5, 1.9, (t) => { if (t > 0.6) galaxy.u.fade.value = Math.max(0, 1 - (t - 0.6) / 0.4); });
  await warp(1, 0.45);
  // swap worlds: the galaxy steps back, the star system takes over the scene
  currentSystem = s.real ? SOL : makeExoSystem(s.seed, s.name);
  systemView.load(currentSystem); systemView.setVisible(true);
  universe.group.visible = false; markers.visible = false; galaxy.sprite.visible = false; galaxy.u.fade.value = 0;
  bodies.clear(); bodies.setCenter(new THREE.Vector3()); bodies.configure({ coreMass: SUN_MASS, coreSoft: 0.02, sizeMul: 2.4, escape: 40 });
  rig.min = 2.5; rig.max = 60;
  rig.setFrom(new THREE.Vector3(), new THREE.Vector3(0.2, 0.55, 1), 9); rig.goal.radius = SYSTEM_R;
  setLook('system', 0.1);
  mode = 'system'; refreshHUD();
  await warp(0, 1.0);
  coachFor('system');
}
async function exitSystem() {
  if (mode !== 'system' || rig.busy) return;
  unfocus(true); if (createMode) setCreate(false);
  mode = 'flying'; refreshHUD();
  await warp(1, 0.5);
  systemView.setVisible(false); bodies.clear(); bodies.configure({ coreMass: 0.8, coreSoft: 1.2, sizeMul: 1, escape: 16 }); bodies.setCenter(current.pos);
  universe.group.visible = true; markers.visible = true; galaxy.sprite.visible = true; galaxy.u.fade.value = 1;
  rig.min = 4; rig.max = 40; rig.setFrom(current.pos, viewDir(current), GALAXY_R);
  setLook('galaxy', 0.1); currentSystem = null;
  mode = 'galaxy'; refreshHUD();
  await warp(0, 0.9);
}
// planet / moon / sun close-ups (level 4)
const describe = (b) => {
  if (b.isSun) return [currentSystem?.name === 'Sol' ? 'The Sun' : `${currentSystem?.name} (star)`, `${Math.round(currentSystem?.star.temp || 5778).toLocaleString()} K`];
  if (b.def) return [b.name, PLANET_FACTS[b.name] || b.def.kind || ''];
  return b.type === 'hole' ? ['Black hole', `${b.mass.toFixed(1)} masses`] : b.type === 'star' ? [`${b.cls}-type star`, `${Math.round(b.temp).toLocaleString()} K`] : ['New world', 'one you made'];
};
function focusOn(b) {
  if (!b || mode !== 'system') return;
  focus = b; const r = b.radius; rig.min = r * 1.6; rig.max = 60;
  rig.goal.radius = r * (b.def?.rings ? 7 : b.isSun ? 4.5 : 5);
  const [t, sub] = describe(b); say(t, sub); refreshHUD();
  setLook(b.isSun ? 'star' : 'planet');
  systemView.visitables.forEach((o) => o.orbitLine && gsap.to(o.orbitLine.material, { opacity: 0.025, duration: 1 })); // orbit lines step back in close-ups
}
function unfocus(silent) { if (!focus) return; focus = null; systemView.visitables.forEach((o) => o.orbitLine && gsap.to(o.orbitLine.material, { opacity: 0.12, duration: 1 })); rig.min = 2.5; rig.max = 60; rig.goal.radius = SYSTEM_R; if (!silent) setLook('system'); refreshHUD(); }
function updateFocus(dt) {
  if (focus && focus.type && !bodies.list.includes(focus)) unfocus();
  if (rig.busy) return;
  if (mode === 'system') rig.target.lerp(focus ? focus.pos : new THREE.Vector3(), 1 - Math.exp(-dt * (focus ? 5 : 3)));
  if (mode === 'galaxy') rig.target.lerp(current.pos, 1 - Math.exp(-dt * 3));
}
// one "go up a level" action used by Esc, scroll-out, palms gesture, and the breadcrumb
function goUp() { if (focus) unfocus(); else if (mode === 'system') exitSystem(); else if (mode === 'galaxy') exitGalaxy(); }
async function goTo(level) {
  if (level === 'universe') { if (mode === 'system') { await exitSystem(); } if (mode === 'galaxy') await exitGalaxy(); }
  if (level === 'galaxy' && mode === 'system') await exitSystem();
  if (level === 'system') unfocus();
}

// ================================================================ Big Bang (galaxy level: two hands together, then apart)
const bang = { state: 'idle', charge: 0, startD: 0, t: 0, explode: 0 };
const nova = { explode: 0, chroma: 0 };
function updateBang(dt) {
  const [a, b] = hands.hands; const both = mode === 'galaxy' && a.active > 0.8 && b.active > 0.8;
  const d = both ? a.pos.distanceTo(b.pos) : 99;
  const mid = both ? a.pos.clone().add(b.pos).multiplyScalar(0.5) : galaxy.u.bangPos.value;
  if (bang.state === 'idle' && both && d < 1.0) { bang.state = 'charging'; bang.startD = d; bang.charge = 0; }
  if (bang.state === 'charging') {
    galaxy.u.bangPos.value.lerp(mid, 0.3); bang.charge = Math.min(1, bang.charge + dt / 1.4);
    if (!both || d > bang.startD + 0.9) { if (bang.charge > 0.35) { bang.state = 'exploding'; bang.explode = 1; bang.t = 0; } else bang.state = 'idle'; }
  }
  if (bang.state === 'exploding') { bang.t += dt; bang.explode *= Math.exp(-dt * 2.2); if (bang.t > 2.2) bang.state = 'idle'; }
  galaxy.u.implode.value += ((bang.state === 'charging' ? bang.charge : 0) - galaxy.u.implode.value) * 0.2;
  galaxy.u.explode.value = bang.state === 'exploding' ? bang.explode : nova.explode;
  const s = galaxy.u.bangPos.value.clone().project(camera);
  U.bangUV.value.set(s.x * 0.5 + 0.5, 0.5 - s.y * 0.5);
  U.lens.value = galaxy.u.implode.value * 0.9;
  const bh = mode === 'system' ? bodies.list.filter((x) => x.type === 'hole').sort((x, y) => y.mass - x.mass)[0] : null;
  if (bh) {
    const c = bh.pos.clone().project(camera); const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const e = bh.pos.clone().addScaledVector(right, bh.radius * 2.2).project(camera);
    U.bangUV.value.set(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5); U.lens.value = Math.min(0.22, 0.06 * Math.sqrt(bh.mass));
    U.shadowUV.value.set(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5); U.shadowR.value = Math.abs(e.x - c.x) * 0.5 * (innerWidth / innerHeight); U.shadow.value += (0.92 - U.shadow.value) * 0.1;
  } else U.shadow.value *= 0.9;
  U.chroma.value = galaxy.u.explode.value + Math.max(...hands.hands.map((h) => h.burst)) * (mode === 'galaxy' ? 0.4 : 0) + nova.chroma;
  U.flash.value = bang.state === 'exploding' ? Math.max(0, 1 - bang.t * 3) ** 2 * 0.9 : Math.max(0, U.flash.value - dt);
}

// ================================================================ CREATE (star-system level)
let createMode = false, tool = 'planet';
const hueColor = (t) => new THREE.Color().setHSL((t * 0.05) % 1, 0.75, 0.6);
function makePlanet(pos, vel) { return bodies.add('planet', pos, vel ?? bodies.orbitVelocity(pos, new THREE.Vector3(0, 1, 0)), 0.002); }
function makeStar(pos, vel, mass) { nebula.emitBurst(pos, new THREE.Color(1, 0.8, 0.55), 900, 0.5); return bodies.add('star', pos, vel ?? bodies.orbitVelocity(pos, new THREE.Vector3(0, 1, 0)), mass * 0.05); }
function makeHole(pos) { nebula.emitBurst(pos, new THREE.Color(0.32, 0.18, 0.75), 450, 1.3); nova.chroma = 0.4; return bodies.add('hole', pos, new THREE.Vector3(), 0.6); }
function supernova(star) {
  const p = star.pos.clone(), c = star.color.clone(); bodies.remove(star);
  nebula.emitBurst(p, c, 4500, 1.6); nova.chroma = 0.6; U.flash.value = 0.22; say('Supernova', 'Its gas seeds the next stars');
}
function bodyEvents() {
  for (const ev of bodies.events.splice(0)) {
    nebula.emitBurst(ev.pos, ev.into === 'hole' ? new THREE.Color(1, 0.55, 0.2) : ev.color || new THREE.Color(1, 1, 1), 600, 0.5);
    nova.chroma = Math.max(nova.chroma, 0.2);
  }
}
const hc = [0, 1].map(() => ({ pinching: false, t0: 0, tip: null, burstWas: 0 }));
let fistsT = 0, holeCooldown = 0; const protostars = [];
function handCreate(dt, now) {
  protostars.length = 0;
  if (!createMode || mode !== 'system' || hands.mode !== 'camera') return;
  hands.hands.forEach((h, i) => {
    const c = hc[i]; if (h.active < 0.7) { c.pinching = false; c.tip = null; return; }
    const on = h.lat.pinch.on;
    if (on && !c.pinching) { c.pinching = true; c.t0 = now; }
    if (on) { const held = (now - c.t0) / 1000; if (held > 0.3) { const s = toScreen(h.pos); protostars.push({ x: s.x, y: s.y, r: 8 + Math.min(held, 3) * 14 }); } }
    if (!on && c.pinching) {
      c.pinching = false; const held = (now - c.t0) / 1000;
      const fling = h.vel.clone().multiplyScalar(0.4).clampLength(0, 4); const vel = fling.length() > 0.5 ? fling : null;
      if (held < 0.3) makePlanet(h.pos, vel); else makeStar(h.pos, vel, THREE.MathUtils.clamp(held * 0.9, 0.3, 3));
    }
    if (h.point > 0.6 && h.world) { const tip = h.world[8].clone(); if (c.tip && c.tip.distanceTo(tip) > 0.01) nebula.emitStroke(c.tip, tip, hueColor(now / 1000)); c.tip = tip; } else c.tip = null;
    if (h.burst > 0.9 && c.burstWas <= 0.9) { const st = bodies.nearest(h.pos, ['star'], 2); if (st) supernova(st); }
    c.burstWas = h.burst;
  });
  const [a, b] = hands.hands;
  const fists = a.active > 0.7 && b.active > 0.7 && a.fist > 0.8 && b.fist > 0.8 && a.pos.distanceTo(b.pos) < 3;
  fistsT = fists ? fistsT + dt : 0; holeCooldown -= dt;
  if (fistsT > 0.8 && holeCooldown <= 0) { makeHole(a.pos.clone().add(b.pos).multiplyScalar(0.5)); fistsT = 0; holeCooldown = 2; say('Black hole', 'It swallows anything that gets too close'); }
  if (fistsT > 0) { const m = toScreen(a.pos.clone().add(b.pos).multiplyScalar(0.5)); protostars.push({ x: m.x, y: m.y, r: 10 + fistsT * 40, hole: true }); }
}
const mc = { down: false, t0: 0, x: 0, y: 0, world: null, last: null, lastT: 0 };
const screenWorld = (x, y) => toWorld(x / innerWidth, y / innerHeight, 0);
function mouseCreateDown(e) {
  if (pickWorld(e.clientX, e.clientY) && tool !== 'nova') return; // clicking a world selects it (double-click = close-up)
  Object.assign(mc, { down: true, t0: performance.now(), x: e.clientX, y: e.clientY, world: screenWorld(e.clientX, e.clientY), last: screenWorld(e.clientX, e.clientY), lastT: performance.now() });
  if (tool === 'hole') { makeHole(mc.world); say('Black hole', 'It swallows anything that gets too close'); mc.down = false; }
  if (tool === 'nova') { const st = bodies.nearest(mc.world, ['star'], 2.5); if (st) supernova(st); else say('Click a star you made', 'to make it go supernova'); mc.down = false; }
}
function mouseCreateMove(e) {
  if (!mc.down) return; const w = screenWorld(e.clientX, e.clientY);
  if (tool === 'nebula') nebula.emitStroke(mc.last, w, hueColor(performance.now() / 1000));
  mc.vel = w.clone().sub(mc.last).divideScalar(Math.max(0.008, (performance.now() - mc.lastT) / 1000)); mc.last = w; mc.lastT = performance.now();
}
function mouseCreateUp(e) {
  if (!mc.down) return; mc.down = false;
  const w = screenWorld(e.clientX, e.clientY); const held = (performance.now() - mc.t0) / 1000; const moved = Math.hypot(e.clientX - mc.x, e.clientY - mc.y);
  const fling = moved > 12 && mc.vel ? mc.vel.clone().multiplyScalar(0.3).clampLength(0, 4) : null;
  if (tool === 'planet') makePlanet(moved > 12 ? mc.world : w, fling);
  if (tool === 'star') makeStar(moved > 12 ? mc.world : w, fling, THREE.MathUtils.clamp(0.3 + held * 0.9, 0.3, 3));
}
function setCreate(on) {
  createMode = on && mode === 'system'; refreshHUD();
  if (createMode) say('Create', hands.mode === 'camera' ? 'Pinch & release to launch a planet into orbit' : 'Pick a tool, then click in space');
}
function selectTool(t) { tool = t; document.querySelectorAll('#tools2 [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t)); }

// ================================================================ hands: navigation per level
let hover = null, dwell = 0, stillPalms = 0;
function handNavigation(dt) {
  if (hands.mode !== 'camera' || !started) return;
  const act = hands.hands.filter((h) => h.active > 0.7);
  const pointer = act.find((h) => h.point > 0.6 && h.screen);
  const tip = pointer ? { x: pointer.screen[8].x * innerWidth, y: pointer.screen[8].y * innerHeight } : null;
  // point at something and hold for a second to go into it
  const target = !tip ? null : mode === 'universe' ? pickGalaxy(tip.x, tip.y, 40) : mode === 'galaxy' ? pickMarker(tip.x, tip.y, 80) : mode === 'system' && !createMode ? pickWorld(tip.x, tip.y, 40) : null;
  handNavigation.tip = tip; handNavigation.target = target;
  if (target && target === hover) { dwell += dt / 1.2; if (dwell >= 1) { dwell = 0; if (mode === 'universe') enterGalaxy(target); else if (mode === 'galaxy') enterSystem(target); else if (focus !== target) focusOn(target); } }
  else if (tip) { hover = target; dwell = 0; } else dwell = Math.max(0, dwell - dt * 2);
  if (mode === 'universe' || (mode === 'system' && !createMode)) {
    const palm = act.find((h) => h.open > 0.6 && h.point < 0.3);
    if (palm && act.length === 1) rig.orbit(-palm.vel.x * dt * 0.09, palm.vel.y * dt * 0.06);
    if (act.length === 2 && act.every((h) => h.open > 0.6) && !stillPalms) { const d = act[0].pos.distanceTo(act[1].pos); if (handNavigation.lastD) rig.zoom(Math.exp(-(d - handNavigation.lastD) * 0.25)); handNavigation.lastD = d; } else handNavigation.lastD = 0;
  }
  // hold both open palms still, wide apart = go up a level
  const still = act.length === 2 && act.every((h) => h.open > 0.7 && h.vel.length() < 0.6) && toScreen(act[0].pos).x - toScreen(act[1].pos).x !== 0 && Math.abs(act[0].screen[0].x - act[1].screen[0].x) > 0.35;
  stillPalms = still && mode !== 'universe' ? stillPalms + dt : 0;
  $('exitRing').style.setProperty('--p', Math.min(1, stillPalms / 1.3));
  if (stillPalms > 1.3) { stillPalms = 0; goUp(); }
}

// ================================================================ overlay (hand skeletons, gesture labels, hover rings, labels)
const hands = new Hands(video);
const overlay = $('overlay'), ctx = overlay.getContext('2d');
function sizeOverlay() { const r = Math.min(devicePixelRatio, 2); overlay.width = innerWidth * r; overlay.height = innerHeight * r; ctx.setTransform(r, 0, 0, r, 0, 0); }
sizeOverlay();
let mouseHover = null;
function drawOverlay() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.globalCompositeOperation = 'lighter';
  for (const h of hands.hands) {
    if (h.active < 0.02) continue;
    if (hands.mode === 'camera' && h.screen) {
      const P = h.screen.map((p) => [p.x * innerWidth, p.y * innerHeight]);
      ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(170,190,255,${0.22 * h.active})`; ctx.lineWidth = 1.2; ctx.shadowColor = 'rgba(140,170,255,0.9)'; ctx.shadowBlur = 12;
      ctx.beginPath(); for (const [a, b] of CONNECTIONS) { ctx.moveTo(...P[a]); ctx.lineTo(...P[b]); } ctx.stroke();
      ctx.fillStyle = `rgba(230,236,255,${0.55 * h.active})`;
      for (const i of [4, 8, 12, 16, 20]) { ctx.beginPath(); ctx.arc(...P[i], 2.2, 0, 7); ctx.fill(); }
      const g = h.point > 0.6 ? '👉 Point' : h.lat.pinch.on ? '🤏 Pinch' : h.lat.fist.on ? '✊ Fist' : h.open > 0.6 ? '✋ Open' : '· Relaxed';
      const top = P[0][1] + 66, cx = P[0][0]; // label sits below the wrist, never on the fingertip
      ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
      ctx.font = '600 14px ui-sans-serif, -apple-system, sans-serif'; const w = ctx.measureText(g).width + 20;
      ctx.fillStyle = 'rgba(10,10,24,0.72)'; ctx.beginPath(); ctx.roundRect(cx - w / 2, top - 40, w, 26, 13); ctx.fill();
      ctx.fillStyle = h.point > 0.6 || h.lat.pinch.on || h.lat.fist.on ? '#ffd6aa' : '#e8ecff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g, cx, top - 27);
      ctx.restore();
    }
    if (mode !== 'galaxy') continue;
    if (h.point > 0.6) continue; // pointing shows the reticle instead
    const s = toScreen(h.pos); const g = Math.max(h.pinch, h.fist), r = 16 + g * 26 + h.burst * 90;
    const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    grd.addColorStop(0, `rgba(255,214,170,${(0.08 + g * 0.32 + h.burst * 0.5) * h.active})`); grd.addColorStop(1, 'rgba(255,180,120,0)');
    ctx.shadowBlur = 0; ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 7); ctx.fill();
  }
  for (const p of protostars) {
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    if (p.hole) { grd.addColorStop(0, 'rgba(0,0,0,0.9)'); grd.addColorStop(0.6, 'rgba(160,90,255,0.35)'); grd.addColorStop(1, 'rgba(160,90,255,0)'); }
    else { grd.addColorStop(0, 'rgba(255,240,210,0.95)'); grd.addColorStop(0.35, 'rgba(255,190,120,0.45)'); grd.addColorStop(1, 'rgba(255,160,90,0)'); }
    ctx.globalCompositeOperation = p.hole ? 'source-over' : 'lighter'; ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  // pointing: a reticle on the fingertip that fills while you hold it on something
  const T = handNavigation.tip;
  if (started && T && mode !== 'flying') {
    const tgt = handNavigation.target;
    ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
    ctx.strokeStyle = tgt ? 'rgba(255,214,170,0.95)' : 'rgba(220,228,255,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(T.x, T.y, 20, 0, 7); ctx.stroke();
    ctx.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(T.x + dx * 26, T.y + dy * 26); ctx.lineTo(T.x + dx * 34, T.y + dy * 34); } ctx.stroke();
    if (tgt && dwell > 0) { ctx.strokeStyle = 'rgba(255,214,170,1)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(T.x, T.y, 20, -Math.PI / 2, -Math.PI / 2 + Math.min(1, dwell) * Math.PI * 2); ctx.stroke(); }
    ctx.font = '500 12px ui-sans-serif, -apple-system, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(232,236,255,0.85)';
    const hint = tgt ? 'hold to open' : mode === 'universe' ? 'point at a galaxy' : mode === 'galaxy' ? 'point at a glowing star system' : createMode ? '' : 'point at a planet';
    if (hint) ctx.fillText(hint, T.x, T.y + 52);
  }
  // hover target: ring + dwell progress + label
  ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
  const label = $('label'); const h = hover || mouseHover;
  const pos = !h || mode === 'flying' ? null : mode === 'galaxy' ? (h.local ? sysWorld(current, h) : null) : h.pos;
  if (h && pos) {
    const s = toScreen(pos);
    ctx.strokeStyle = 'rgba(220,228,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(s.x, s.y, 26, 0, 7); ctx.stroke();
    if (dwell > 0) { ctx.strokeStyle = 'rgba(255,214,170,0.95)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(s.x, s.y, 26, -Math.PI / 2, -Math.PI / 2 + dwell * Math.PI * 2); ctx.stroke(); }
    label.hidden = false; label.style.transform = `translate(${s.x + 34}px, ${s.y - 14}px)`;
    const [title, sub] = mode === 'universe' ? [h.name, `${SHAPES[h.shape]} · ${h.systems.length} star systems`]
      : mode === 'galaxy' ? [h.real ? 'Sol' : h.name, (h.real ? 'Our Solar System' : 'Star system') + (hands.mode === 'camera' ? ' — point & hold to visit' : ' — click to visit')]
      : describe(h);
    label.innerHTML = `<b>${title}</b><span>${sub}</span>`;
  } else label.hidden = true;
  // always label Sol in Aether Prime so the way in is obvious
  if (started && mode === 'galaxy' && current.id === 0 && !h) {
    const solM = markers.children.find((m) => m.userData.sys.real);
    if (solM) { const s = toScreen(solM.position); if (s.front) { ctx.font = '500 13px ui-sans-serif, -apple-system, sans-serif'; ctx.fillStyle = 'rgba(255,230,190,0.9)'; ctx.textAlign = 'left'; ctx.fillText('Sol · our Solar System', s.x + 18, s.y + 4); } }
  }
}

// ================================================================ mouse + keys
const glc = $('gl'); let drag = null;
glc.addEventListener('pointerdown', (e) => {
  if (!started) return;
  if (mode === 'system' && createMode) return mouseCreateDown(e);
  if (mode === 'universe' || mode === 'system') drag = { x: e.clientX, y: e.clientY, moved: 0 };
  if (mode === 'galaxy') drag = { x: e.clientX, y: e.clientY, moved: 0, click: true };
});
addEventListener('pointermove', (e) => {
  if (!started) return;
  if (mode === 'system' && createMode) mouseCreateMove(e);
  if (drag && (mode === 'universe' || mode === 'system') && !createMode) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); rig.orbit(-dx * 0.004, -dy * 0.004); drag.x = e.clientX; drag.y = e.clientY; }
  else if (drag) drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
  mouseHover = mode === 'universe' ? pickGalaxy(e.clientX, e.clientY) : mode === 'galaxy' ? pickMarker(e.clientX, e.clientY) : mode === 'system' ? pickWorld(e.clientX, e.clientY) : null;
});
addEventListener('pointerup', (e) => {
  if (!started) return;
  if (mode === 'system' && createMode) mouseCreateUp(e);
  if (drag && drag.moved < 6) {
    if (mode === 'universe') { const g = pickGalaxy(e.clientX, e.clientY); if (g) enterGalaxy(g); }
    else if (mode === 'galaxy') { const s = pickMarker(e.clientX, e.clientY); if (s) enterSystem(s); }
    else if (mode === 'system' && !createMode) { const b = pickWorld(e.clientX, e.clientY); if (b) focusOn(b); }
  }
  drag = null;
});
glc.addEventListener('wheel', (e) => {
  e.preventDefault(); if (!started) return; rig.zoom(Math.exp(e.deltaY * 0.0012));
  if (e.deltaY > 0 && rig.goal.radius >= rig.max - 0.5) goUp();
  if (e.deltaY > 0 && focus && rig.goal.radius > focus.radius * 22) unfocus();
}, { passive: false });
addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.key === 'Escape') goUp();
  if (e.key === 'c' && mode === 'system') setCreate(!createMode);
  if (createMode && '1234'.includes(e.key)) selectTool(['planet', 'star', 'hole', 'nebula'][+e.key - 1]);
  if (e.key === 'r') toggleRecord();
  if (e.key === 'v') $('btnFeed').click();
});

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

// ================================================================ HUD: breadcrumb, "what you can do here", toasts
const PANEL = {
  universe: { title: 'The universe', cam: ['✋ <b>Open palm</b> turns the sky', '✋✋ <b>Spread both palms</b> to zoom', '👉 <b>Point at a galaxy</b> and hold to fly in'], mouse: ['<b>Drag</b> to turn', '<b>Scroll</b> to zoom', '<b>Click a galaxy</b> to fly in'] },
  galaxy: { title: 'Inside a galaxy', cam: ['✋ <b>Sweep</b> to blow the stars', '🤏 <b>Pinch</b> to gather', '✊ <b>Fist → open</b> to explode', '✋✋ <b>Hands together, then apart</b> = Big Bang', '👉 <b>Point at a glowing star system</b> and hold to visit', '✋✋ <b>Hold both palms still</b> to go back'], mouse: ['<b>Move</b> to blow the stars', '<b>Hold</b> to gather, <b>release</b> to explode', '<b>Click a glowing star system</b> to visit it', '<b>Esc</b> or scroll out to go back'] },
  system: { title: 'Star system', cam: ['👉 <b>Point at a planet</b> and hold for a close-up', '✋ <b>Open palm</b> to turn', '<b>✦ Create</b> to make your own worlds', '✋✋ <b>Hold both palms still</b> to go back'], mouse: ['<b>Click a planet</b> (or the Sun) for a close-up', '<b>Drag</b> to turn, <b>scroll</b> to zoom', '<b>✦ Create</b> to make your own worlds', '<b>Esc</b> to go back'] },
  create: { title: 'Create', cam: ['🤏 <b>Pinch &amp; release</b> = planet (it orbits)', '🤏 <b>Pinch &amp; hold</b> = star', '✊✊ <b>Two fists together</b> = black hole', '👉 <b>Point</b> to paint a nebula', '✊ <b>Fist → open</b> by a star = supernova'], mouse: ['<b>1</b> Planet: click = orbit, drag = fling', '<b>2</b> Star: hold longer for bigger', '<b>3</b> Black hole', '<b>4</b> Nebula: drag to paint'] },
  planet: { title: 'Close-up', cam: ['✋✋ <b>Hold both palms still</b> to go back'], mouse: ['<b>Drag</b> to look around', '<b>Esc</b> or scroll out to go back'] },
};
function refreshHUD() {
  if (refreshHUD.lastMode !== mode) { hover = null; mouseHover = null; dwell = 0; refreshHUD.lastMode = mode; }
  const key = mode === 'system' ? (focus ? 'planet' : createMode ? 'create' : 'system') : mode === 'flying' ? null : mode;
  const cam = hands.mode === 'camera';
  if (key) { $('panelTitle').textContent = PANEL[key].title; $('guide').innerHTML = PANEL[key][cam ? 'cam' : 'mouse'].map((t) => `<li>${t}</li>`).join(''); }
  $('panel').style.opacity = key ? 1 : 0;
  // breadcrumb
  const crumbs = [['universe', 'Universe']];
  if (mode !== 'universe') crumbs.push(['galaxy', current.name]);
  if (mode === 'system' && currentSystem) crumbs.push(['system', currentSystem.name === 'Sol' ? 'Sol · Solar System' : currentSystem.name]);
  if (focus) crumbs.push(['planet', describe(focus)[0]]);
  $('crumbs').innerHTML = crumbs.map(([k, n], i) => i < crumbs.length - 1 ? `<button data-go="${k}">${n}</button><span>›</span>` : `<b>${n}</b>`).join('');
  $('crumbs').querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => goTo(b.dataset.go)));
  $('btnCreate').hidden = mode !== 'system' || !!focus; $('btnCreate').classList.toggle('on', createMode);
  $('tools2').hidden = !(mode === 'system' && createMode);
}
let sayT;
function say(title, sub) {
  const el = $('toast'); el.innerHTML = `<b>${title}</b><span>${sub || ''}</span>`;
  gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8 }); clearTimeout(sayT);
  sayT = setTimeout(() => gsap.to(el, { opacity: 0, duration: 1 }), 2800);
}

// ================================================================ guided tutorial, one level at a time
const settled = (h) => h.active > 0.8 && performance.now() - (h.since || 0) > 600;
const COACH = {
  galaxy: {
    camera: [
      { text: '✋ Raise one hand so the camera can see it', done: () => hands.hands.some((h) => h.active > 0.8), ok: 'Got your hand' },
      { text: '✋ Sweep your open hand sideways through the stars', done: () => hands.hands.some((h) => settled(h) && h.vel.length() > 1.8), hold: 0.2, ok: 'You moved the stars' },
      { text: '🤏 Pinch your thumb and index finger together', done: () => hands.hands.some((h) => settled(h) && h.lat.pinch.on), hold: 0.35, ok: 'Gathering stars' },
      { text: '✊ Make a fist… then open it fast', done: () => hands.hands.some((h) => settled(h) && h.burst > 0.8), ok: 'Boom' },
      { text: '👉 Point at the glowing “Sol” and hold to visit our Solar System', done: () => mode === 'system', ok: 'Welcome to the Solar System' },
    ],
    mouse: [
      { text: 'Move your mouse through the stars', done: () => hands.hands[0].vel.length() > 1.2, hold: 0.12, ok: 'You moved the stars' },
      { text: 'Click and hold to gather stars, then let go', done: () => hands.hands[0].burst > 0.8, ok: 'Boom' },
      { text: 'Click the glowing “Sol” to visit our Solar System', done: () => mode === 'system', ok: 'Welcome to the Solar System' },
    ],
  },
  system: {
    camera: [
      { text: '👉 Point at a planet and hold for a close-up', done: () => !!focus, ok: 'Close-up' },
      { text: '✋✋ Hold both palms still to step back', done: () => !focus, ok: 'Back to the system' },
      { text: 'Press ✦ Create, then 🤏 pinch & release to launch a planet', done: () => bodies.list.some((b) => b.type === 'planet'), ok: 'A new world is orbiting' },
    ],
    mouse: [
      { text: 'Click a planet for a close-up', done: () => !!focus, ok: 'Close-up' },
      { text: 'Press Esc (or scroll out) to step back', done: () => !focus, ok: 'Back to the system' },
      { text: 'Press ✦ Create, then click in space to launch a planet', done: () => bodies.list.some((b) => b.type === 'planet'), ok: 'A new world is orbiting' },
    ],
  },
  universe: { camera: [{ text: '👉 Point at any galaxy and hold to fly into it', done: () => mode === 'galaxy', ok: 'Into a new galaxy' }], mouse: [{ text: 'Click any galaxy to fly into it', done: () => mode === 'galaxy', ok: 'Into a new galaxy' }] },
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
  el.querySelector('.ctext').textContent = showOk ? '✓ ' + coach.flashText : st[i].text;
  el.classList.toggle('ok', showOk);
  el.querySelector('.cdots').innerHTML = st.map((_, k) => `<i class="${coach.done[k] ? 'd' : k === i ? 'c' : ''}"></i>`).join('');
  el.querySelector('.cstep').textContent = i < 0 ? 'All done' : `Step ${i + 1} of ${st.length}`;
}
function coachTick(dt) {
  if (!coach.steps || $('coach').hidden) return;
  if (coach.flash > 0) { coach.flash -= dt; if (coach.flash <= 0) coachRender(); return; }
  const k = coachCur(); if (k < 0) return;
  const s = coach.steps[k]; const now = s.done(); coach.t[k] = now ? coach.t[k] + dt : 0;
  if (now && coach.t[k] >= (s.hold || 0)) { coach.done[k] = true; coach.flash = 1.4; coach.flashText = s.ok; coachRender(); }
}

// ================================================================ intro + input
const title = $('title');
title.innerHTML = [...title.textContent].map((c) => `<span class="ch">${c}</span>`).join('');
gsap.from('#title .ch', { y: 50, opacity: 0, filter: 'blur(14px)', duration: 1.8, ease: 'expo.out', stagger: 0.08, delay: 0.3 });
gsap.from(['.eyebrow', '.lede', '.cta', '.fine'], { y: 14, opacity: 0, duration: 1.2, ease: 'power3.out', stagger: 0.12, delay: 0.9 });
const status = $('status');
async function start(m) {
  document.querySelectorAll('.cta button').forEach((b) => (b.disabled = true));
  try { if (m === 'camera') { status.textContent = 'Waking the stars…'; await hands.initCamera(); updateCover(); } else hands.initMouse(glc); }
  catch (e) { console.warn(e); hands.initMouse(glc); banner('Camera unavailable — using the mouse. Allow camera access, then click 🖱 Mouse to switch.'); }
  setLook('galaxy', 2.2); started = true;
  gsap.to('#intro', { opacity: 0, duration: 1.2, ease: 'power2.inOut', onComplete: () => ($('intro').hidden = true) });
  $('hud').hidden = false; status.textContent = ''; updateInputButton(); refreshHUD();
  gsap.from('#panel, #tools, #crumbs', { y: 12, opacity: 0, duration: 1, delay: 0.6 });
  setTimeout(() => say('Aether Prime', 'Your home galaxy · find the glowing “Sol” to visit our Solar System'), 1800);
  coachFor('galaxy');
}
function updateInputButton() { $('btnInput').textContent = hands.mode === 'camera' ? '✋ Hands' : '🖱 Mouse'; $('btnInput').title = hands.mode === 'camera' ? 'Using your hands — click to use the mouse' : 'Using the mouse — click to use your hands'; }
function banner(text) { const b = $('banner'); b.textContent = text; b.hidden = !text; }
async function switchInput() {
  if (hands.mode === 'camera') hands.initMouse(glc);
  else { try { if (!hands.worker) await hands.initCamera(); else hands.mode = 'camera'; updateCover(); banner(''); } catch (e) { console.warn(e); hands.initMouse(glc); banner('Camera unavailable (' + (e.name || 'error') + '). Allow camera access in the address bar, then try again.'); } }
  updateInputButton(); refreshHUD(); coach.seen.clear(); coachFor(mode === 'flying' ? 'galaxy' : mode);
}

$('btnCam').onclick = () => start('camera');
$('btnMouse').onclick = () => start('mouse');
$('btnRec').onclick = toggleRecord;
$('btnInput').onclick = switchInput;
$('coachSkip').onclick = () => { $('coach').hidden = true; };
$('btnFeed').onclick = () => { gsap.to(U.feed, { value: U.feed.value > 0.5 ? 0 : 1, duration: 0.8 }); $('btnFeed').classList.toggle('on', U.feed.value <= 0.5); };
$('btnCreate').onclick = () => setCreate(!createMode);
document.querySelectorAll('#tools2 [data-tool]').forEach((b) => (b.onclick = () => selectTool(b.dataset.tool)));
$('btnClear').onclick = () => { bodies.clear(); say('Cleared', ''); };

// ================================================================ loop
let last = performance.now();
const FRAME_MS = 1000 / 61;
const FAR = new THREE.Vector3(0, 0, 1e4);
renderer.setAnimationLoop((now) => {
  if (now - last < FRAME_MS - 1) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  hands.update(now, dt, videoToScreen, toWorld);
  handNavigation(dt);
  updateFocus(dt);
  rig.update(dt);
  const u = galaxy.u; u.time.value = now / 1000; u.dt.value = dt;
  const live = mode === 'galaxy';
  hands.hands.forEach((h, i) => {
    const t = u.hands[i];
    t.pos.value.copy(h.pos); t.vel.value.copy(h.vel).clampLength(0, 14);
    t.active.value = live ? h.active : 0; t.pinch.value = h.pinch; t.fist.value = h.fist; t.open.value = h.open; t.burst.value = live ? h.burst : 0; t.point.value = 0; // pointing selects, it never pushes stars
    for (let j = 0; j < 21; j++) u.joints.array[i * 21 + j].copy(live && h.active > 0.3 && hands.mode === 'camera' ? h.world[j] : FAR);
  });
  handCreate(dt, now);
  coachTick(dt);
  if (mode === 'system') { systemView.update(dt); bodies.step(dt); }
  bodyEvents();
  nova.explode *= Math.exp(-dt * 2.5); nova.chroma *= Math.exp(-dt * 2.0); if (nova.explode < 0.01) nova.explode = 0;
  updateBang(dt);
  nebula.update(renderer, dt, now / 1000);
  if (u.fade.value > 0.001 && galaxy.sprite.visible) renderer.compute(galaxy.compute);
  if (mode !== 'system') galaxy.sprite.visible = u.fade.value > 0.001;
  pipeline.render();
  drawOverlay();
  recordFrame();
});

if (q.has('debug')) {
  const el = document.createElement('div'); el.id = 'debug'; el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);font:12px ui-monospace,monospace;color:#9fb4ff;z-index:9';
  document.body.append(el); let frames = 0, t = performance.now(), lastR = last;
  (function loop() { if (last !== lastR) { frames++; lastR = last; } const n = performance.now(); if (n - t > 500) { const st = hands.stats;
    el.textContent = `render ${(frames * 1000 / (n - t)).toFixed(0)} fps · tracking ${(st.hz || 0).toFixed(0)} Hz · ${mode}${focus ? ' · ' + describe(focus)[0] : ''}`; frames = 0; t = n; }
    requestAnimationFrame(loop); })();
}
window.__aether = { renderer, galaxy, hands, camera, rig, universe, systemView, bodies, nebula, enterGalaxy, exitGalaxy, enterSystem, exitSystem, focusOn, unfocus, setCreate, selectTool, goUp, get mode() { return mode; }, get current() { return current; }, get focus() { return focus; } };
