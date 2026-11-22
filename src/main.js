import * as THREE from 'three/webgpu';
import {
  Fn, pass, screenUV, vec2, vec3, vec4, float, uniform, mix, smoothstep, length, texture, convertToTexture, max,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import gsap from 'gsap';
import { makeGalaxy } from './sim.js';
import { Hands, CONNECTIONS } from './hands.js';
import { makeUniverse, PALETTES, SHAPES } from './universe.js';
import { Rig } from './rig.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);

// ---------------------------------------------------------------- renderer + scene
const renderer = new THREE.WebGPURenderer({ canvas: $('gl'), antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); // leave GPU headroom for hand tracking
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
await renderer.init();
if (!renderer.backend?.isWebGPUBackend) $('intro').querySelector('.lede').textContent = 'This needs WebGPU — try the latest Chrome, Edge or Safari.';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 8000);
const rig = new Rig(camera);

// background: deep-space gradient blended with a stylized mirrored camera feed
const video = $('video');
const videoTex = new THREE.VideoTexture(video); videoTex.colorSpace = THREE.SRGBColorSpace;
const U = { feed: uniform(0), cover: uniform(new THREE.Vector2(1, 1)), bangUV: uniform(new THREE.Vector2(0.5, 0.5)), lens: uniform(0), chroma: uniform(0), flash: uniform(0) };
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

// the universe + the one galaxy you are inside (full simulation)
const universe = makeUniverse({ seed: +(q.get('seed') || 7) });
scene.add(universe.group);
const small = matchMedia('(max-width: 700px)').matches;
const galaxy = makeGalaxy({ count: small ? 90000 : 240000 });
scene.add(galaxy.sprite);

// post: bloom, then gravitational lensing + chromatic aberration + flash
const pipeline = new THREE.RenderPipeline(renderer);
const scenePass = pass(scene, camera);
const lit = convertToTexture(scenePass.add(bloom(scenePass, 0.8, 0.6, 0.22)));
pipeline.outputNode = Fn(() => {
  const uvn = screenUV; const asp = float(innerWidth / innerHeight);
  const d = uvn.sub(U.bangUV).mul(vec2(asp, 1)); const r = length(d).add(1e-3); const dir = d.div(r).div(vec2(asp, 1));
  const warp = U.lens.mul(0.035).div(r.add(0.06)).mul(smoothstep(0.0, 0.06, r));
  const uv2 = uvn.sub(dir.mul(warp));
  const ca = dir.mul(U.chroma.mul(0.02).mul(r.add(0.2)));
  const col = vec3(lit.sample(uv2.add(ca)).r, lit.sample(uv2).g, lit.sample(uv2.sub(ca)).b);
  const hole = smoothstep(0.0, 0.05, r).mul(U.lens).oneMinus().mul(U.lens).oneMinus();
  return vec4(col.mul(max(hole, 0.0)).add(U.flash.mul(vec3(1.0, 0.92, 0.82))), 1);
})();

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); sizeOverlay(); updateCover(); });

// ---------------------------------------------------------------- galaxies: identity + viewpoint
const GALAXY_R = 8.5;
const viewDir = (g) => { const n = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quat), p = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quat); return n.multiplyScalar(0.88).add(p.multiplyScalar(0.47)).normalize(); };
function loadGalaxy(g) {
  const u = galaxy.u;
  u.center.value.copy(g.pos); u.orient.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(g.quat));
  u.shape.value = g.shape; u.arms.value = g.arms; u.twist.value = g.twist; u.size.value = g.size;
  PALETTES[g.palette].forEach((hex, i) => [u.c0, u.c1, u.c2][i].value.set(hex));
  renderer.compute(galaxy.init); // stars start scattered and settle into the new shape
}

let mode = 'galaxy', current = universe.list[0];
loadGalaxy(current); universe.setAlpha(0, 0);
rig.setFrom(current.pos, viewDir(current), GALAXY_R);

// ---------------------------------------------------------------- coordinate mapping
function updateCover() {
  const sa = innerWidth / innerHeight, va = (video.videoWidth || 16) / (video.videoHeight || 9);
  U.cover.value.set(sa > va ? 1 : sa / va, sa > va ? va / sa : 1);
}
const videoToScreen = (x, y) => ({ x: 0.5 + (x - 0.5) / U.cover.value.x, y: 0.5 + (y - 0.5) / U.cover.value.y });
// screen point -> world point on a plane facing the camera, `GALAXY_R - depth` in front of it
const _fwd = new THREE.Vector3();
const toWorld = (nx, ny, depth = 0) => {
  const dir = new THREE.Vector3(nx * 2 - 1, -(ny * 2 - 1), 0.5).unproject(camera).sub(camera.position).normalize();
  camera.getWorldDirection(_fwd);
  const D = GALAXY_R - depth * 1.4;
  return camera.position.clone().addScaledVector(dir, D / Math.max(0.2, dir.dot(_fwd)));
};
const toScreen = (v) => { const s = v.clone().project(camera); return { x: (s.x * 0.5 + 0.5) * innerWidth, y: (0.5 - s.y * 0.5) * innerHeight, front: s.z < 1 }; };

// ---------------------------------------------------------------- hands + overlay
const hands = new Hands(video);
const overlay = $('overlay'), ctx = overlay.getContext('2d');
function sizeOverlay() { const r = Math.min(devicePixelRatio, 2); overlay.width = innerWidth * r; overlay.height = innerHeight * r; ctx.setTransform(r, 0, 0, r, 0, 0); }
sizeOverlay();

let hoverG = null, dwell = 0;
function drawOverlay() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.globalCompositeOperation = 'lighter';
  for (const h of hands.hands) {
    if (h.active < 0.02) continue;
    if (hands.mode === 'camera' && h.screen) {
      const P = h.screen.map((p) => [p.x * innerWidth, p.y * innerHeight]);
      ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(170,190,255,${0.18 * h.active})`; ctx.lineWidth = 1.2; ctx.shadowColor = 'rgba(140,170,255,0.9)'; ctx.shadowBlur = 12;
      ctx.beginPath(); for (const [a, b] of CONNECTIONS) { ctx.moveTo(...P[a]); ctx.lineTo(...P[b]); } ctx.stroke();
      ctx.fillStyle = `rgba(230,236,255,${0.55 * h.active})`;
      for (const i of [4, 8, 12, 16, 20]) { ctx.beginPath(); ctx.arc(...P[i], 2.2, 0, 7); ctx.fill(); }
    }
    if (mode !== 'galaxy') continue;
    const s = toScreen(h.pos);
    const g = Math.max(h.pinch, h.fist, h.point * 0.7), r = 16 + g * 26 + h.burst * 90;
    const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    grd.addColorStop(0, `rgba(255,214,170,${(0.08 + g * 0.32 + h.burst * 0.5) * h.active})`); grd.addColorStop(1, 'rgba(255,180,120,0)');
    ctx.shadowBlur = 0; ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 7); ctx.fill();
  }
  // universe: highlight the galaxy under the pointer / fingertip, with a dwell ring
  ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
  const label = $('label');
  if (mode === 'universe' && hoverG) {
    const s = toScreen(hoverG.pos);
    ctx.strokeStyle = 'rgba(220,228,255,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(s.x, s.y, 26, 0, 7); ctx.stroke();
    if (dwell > 0) { ctx.strokeStyle = 'rgba(255,214,170,0.95)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(s.x, s.y, 26, -Math.PI / 2, -Math.PI / 2 + dwell * Math.PI * 2); ctx.stroke(); }
    label.hidden = false; label.style.transform = `translate(${s.x + 34}px, ${s.y - 14}px)`;
    label.innerHTML = `<b>${hoverG.name}</b><span>${SHAPES[hoverG.shape]} · ${hoverG.palette}</span>`;
  } else label.hidden = true;
}

// nearest galaxy to a screen point (pixels), weighted by apparent size
function pickGalaxy(px, py) {
  let best = null, bestD = 1e9;
  for (const g of universe.list) {
    const s = toScreen(g.pos); if (!s.front) continue;
    const dist = camera.position.distanceTo(g.pos);
    const radPx = Math.max(14, (3.6 * g.size / dist) * innerHeight * 1.2);
    const d = Math.hypot(s.x - px, s.y - py);
    if (d < radPx && d < bestD) { best = g; bestD = d; }
  }
  return best;
}

// ---------------------------------------------------------------- mode transitions
const OVERVIEW_R = 640;
async function enterGalaxy(g) {
  if (mode !== 'universe' || rig.busy) return;
  mode = 'flying'; hoverG = null; dwell = 0; setGuide();
  current = g; let loaded = false;
  galaxy.u.fade.value = 0;
  say(g.name, SHAPES[g.shape]);
  await rig.flyTo(g.pos, viewDir(g), GALAXY_R, 3.2, (t) => {
    if (t > 0.55 && !loaded) { loaded = true; loadGalaxy(g); }
    if (loaded) galaxy.u.fade.value = Math.min(1, (t - 0.55) / 0.4);
    universe.setAlpha(g.id, Math.max(0, 1 - Math.max(0, t - 0.6) / 0.35));
  });
  mode = 'galaxy'; rig.min = 4; rig.max = 40; setGuide();
}
async function exitGalaxy() {
  if (mode !== 'galaxy' || rig.busy) return;
  mode = 'flying'; setGuide();
  const g = current; const back = camera.position.clone().sub(g.pos).normalize();
  gsap.to(galaxy.u.fade, { value: 0, duration: 1.2 });
  await rig.flyTo(new THREE.Vector3(0, 0, 0), back.lengthSq() ? back : new THREE.Vector3(0, 0.4, 1), OVERVIEW_R, 3.0, (t) => universe.setAlpha(g.id, Math.min(1, t * 2)));
  mode = 'universe'; rig.min = 30; rig.max = 1400; setGuide();
}

// ---------------------------------------------------------------- Big Bang (two hands together, then pull apart)
const bang = { state: 'idle', charge: 0, startD: 0, t: 0, explode: 0 };
function updateBang(dt) {
  const [a, b] = hands.hands; const both = mode === 'galaxy' && a.active > 0.8 && b.active > 0.8;
  const d = both ? a.pos.distanceTo(b.pos) : 99;
  const mid = both ? a.pos.clone().add(b.pos).multiplyScalar(0.5) : galaxy.u.bangPos.value;
  if (bang.state === 'idle' && both && d < 1.0) { bang.state = 'charging'; bang.startD = d; bang.charge = 0; }
  if (bang.state === 'charging') {
    galaxy.u.bangPos.value.lerp(mid, 0.3);
    bang.charge = Math.min(1, bang.charge + dt / 1.4);
    if (!both || d > bang.startD + 0.9) { if (bang.charge > 0.35) { bang.state = 'exploding'; bang.explode = 1; bang.t = 0; } else bang.state = 'idle'; }
  }
  if (bang.state === 'exploding') { bang.t += dt; bang.explode *= Math.exp(-dt * 2.2); if (bang.t > 2.2) bang.state = 'idle'; }
  galaxy.u.implode.value += ((bang.state === 'charging' ? bang.charge : 0) - galaxy.u.implode.value) * 0.2;
  galaxy.u.explode.value = bang.state === 'exploding' ? bang.explode : 0;
  const s = galaxy.u.bangPos.value.clone().project(camera);
  U.bangUV.value.set(s.x * 0.5 + 0.5, 0.5 - s.y * 0.5);
  U.lens.value = galaxy.u.implode.value * 0.9;
  U.chroma.value = galaxy.u.explode.value + Math.max(...hands.hands.map((h) => h.burst)) * 0.4;
  U.flash.value = bang.state === 'exploding' ? Math.max(0, 1 - bang.t * 3) ** 2 * 0.9 : 0;
}

// ---------------------------------------------------------------- hand navigation (universe) + exit gesture (galaxy)
let stillPalms = 0;
function handNavigation(dt) {
  if (hands.mode !== 'camera') return;
  const act = hands.hands.filter((h) => h.active > 0.7);
  if (mode === 'universe') {
    // an open palm drags the sky; pointing at a galaxy and holding flies you in
    const palm = act.find((h) => h.open > 0.6 && h.point < 0.3);
    if (palm && act.length === 1) rig.orbit(-palm.vel.x * dt * 0.09, palm.vel.y * dt * 0.06);
    if (act.length === 2 && act.every((h) => h.open > 0.6)) { // two open palms: spread = zoom in, together = zoom out
      const d = act[0].pos.distanceTo(act[1].pos); if (handNavigation.lastD) rig.zoom(Math.exp(-(d - handNavigation.lastD) * 0.25)); handNavigation.lastD = d;
    } else handNavigation.lastD = 0;
    const pointer = act.find((h) => h.point > 0.6 && h.screen);
    if (pointer) {
      const tip = pointer.screen[8]; const g = pickGalaxy(tip.x * innerWidth, tip.y * innerHeight);
      if (g && g === hoverG) { dwell += dt / 1.0; if (dwell >= 1) enterGalaxy(g); } else { hoverG = g; dwell = 0; }
    } else if (hands.mode === 'camera') dwell = Math.max(0, dwell - dt * 2);
  }
  if (mode === 'galaxy') {
    // hold both open palms still for a moment to zoom back out to the universe
    const still = act.length === 2 && act.every((h) => h.open > 0.7 && h.vel.length() < 0.6) && act[0].pos.distanceTo(act[1].pos) > 2.2;
    stillPalms = still ? stillPalms + dt : 0;
    $('exitRing').style.setProperty('--p', Math.min(1, stillPalms / 1.3));
    if (stillPalms > 1.3) { stillPalms = 0; exitGalaxy(); }
  }
}

// ---------------------------------------------------------------- mouse / keys navigation
const glc = $('gl'); let drag = null;
glc.addEventListener('pointerdown', (e) => { if (mode === 'universe') drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
addEventListener('pointermove', (e) => {
  if (mode === 'universe') {
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); rig.orbit(-dx * 0.004, -dy * 0.004); drag.x = e.clientX; drag.y = e.clientY; }
    else if (hands.mode !== 'camera' || !hands.hands.some((h) => h.point > 0.6)) hoverG = pickGalaxy(e.clientX, e.clientY);
  }
});
addEventListener('pointerup', (e) => { if (mode === 'universe' && drag && drag.moved < 6) { const g = pickGalaxy(e.clientX, e.clientY); if (g) enterGalaxy(g); } drag = null; });
glc.addEventListener('wheel', (e) => {
  e.preventDefault();
  rig.zoom(Math.exp(e.deltaY * 0.0012));
  if (mode === 'galaxy' && rig.goal.radius >= rig.max - 0.5 && e.deltaY > 0) exitGalaxy();
}, { passive: false });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') exitGalaxy();
  if (e.key === 'r') toggleRecord();
  if (e.key === 'v') $('btnFeed').click();
  if (e.key === 'u') (mode === 'galaxy' ? exitGalaxy() : null);
});

// ---------------------------------------------------------------- vertical clip recording (9:16)
const rec = { on: false, r: null, cv: document.createElement('canvas') };
rec.cv.width = 1080; rec.cv.height = 1920; const rctx = rec.cv.getContext('2d');
function recordFrame() {
  if (!rec.on) return;
  const src = glc; const sh = src.height, sw = sh * 9 / 16;
  rctx.drawImage(src, (src.width - sw) / 2, 0, sw, sh, 0, 0, 1080, 1920);
  const o = overlay; const osh = o.height, osw = osh * 9 / 16; rctx.globalCompositeOperation = 'lighter';
  rctx.drawImage(o, (o.width - osw) / 2, 0, osw, osh, 0, 0, 1080, 1920); rctx.globalCompositeOperation = 'source-over';
}
function toggleRecord() {
  const btn = $('btnRec');
  if (rec.on) { rec.r.stop(); return; }
  const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const chunks = []; rec.r = new MediaRecorder(rec.cv.captureStream(60), { mimeType: type, videoBitsPerSecond: 14e6 });
  rec.r.ondataavailable = (e) => chunks.push(e.data);
  rec.r.onstop = () => { rec.on = false; btn.classList.remove('on'); btn.textContent = '● Record';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type })); a.download = `aether-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`; a.click(); };
  rec.r.start(250); rec.on = true; btn.classList.add('on'); btn.textContent = '■ Stop';
}

// ---------------------------------------------------------------- HUD
const GUIDES = {
  galaxy: (cam) => cam
    ? ['<b>Sweep</b> to blow', '<b>Pinch</b> to gather', '<b>Point</b> to draw a comet', '<b>Fist → open</b> to explode', '<b>Hands together</b>, then apart', '<b>Hold both palms still</b> to zoom out']
    : ['<b>Move</b> to blow', '<b>Hold</b> to gather', '<b>Release</b> to explode', '<b>Scroll out</b> or <b>Esc</b> for the universe'],
  universe: (cam) => cam
    ? ['<b>Open palm</b> to turn the sky', '<b>Both palms</b> spread to zoom', '<b>Point and hold</b> on a galaxy to fly in']
    : ['<b>Drag</b> to turn', '<b>Scroll</b> to zoom', '<b>Click</b> a galaxy to fly in'],
  flying: () => [],
};
function setGuide() {
  $('guide').innerHTML = GUIDES[mode](hands.mode === 'camera').map((t) => `<li>${t}</li>`).join('');
  $('btnUniverse').textContent = mode === 'galaxy' ? 'Universe' : 'Universe';
  $('btnUniverse').hidden = mode !== 'galaxy';
}
let sayT;
function say(title, sub) {
  const el = $('toast'); el.innerHTML = `<b>${title}</b><span>${sub || ''}</span>`;
  gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8 }); clearTimeout(sayT);
  sayT = setTimeout(() => gsap.to(el, { opacity: 0, duration: 1 }), 2600);
}

// ---------------------------------------------------------------- intro + start
const title = $('title');
title.innerHTML = [...title.textContent].map((c) => `<span class="ch">${c}</span>`).join('');
gsap.from('#title .ch', { y: 50, opacity: 0, filter: 'blur(14px)', duration: 1.8, ease: 'expo.out', stagger: 0.08, delay: 0.3 });
gsap.from(['.eyebrow', '.lede', '.cta', '.fine'], { y: 14, opacity: 0, duration: 1.2, ease: 'power3.out', stagger: 0.12, delay: 0.9 });

const status = $('status');
async function start(m) {
  document.querySelectorAll('.cta button').forEach((b) => (b.disabled = true));
  try {
    if (m === 'camera') { status.textContent = 'Waking the stars…'; await hands.initCamera(); updateCover(); }
    else hands.initMouse(glc);
  } catch (e) { console.warn(e); hands.initMouse(glc); status.textContent = 'Camera unavailable — using the mouse'; }
  gsap.to(renderer, { toneMappingExposure: 0.95, duration: 2.2, ease: 'power2.inOut' });
  if (hands.mode === 'camera') gsap.to(U.feed, { value: q.has('nofeed') ? 0 : 1, duration: 2.5, ease: 'power2.inOut' });
  gsap.to('#intro', { opacity: 0, duration: 1.2, ease: 'power2.inOut', onComplete: () => ($('intro').hidden = true) });
  $('hud').hidden = false; setGuide();
  gsap.from('#guide, #tools', { y: 12, opacity: 0, duration: 1, delay: 0.6 });
  status.textContent = hands.mode === 'camera' ? 'Raise your hands' : '';
  setTimeout(() => say('Aether Prime', 'One galaxy among hundreds — scroll out, or hold both palms still'), 2500);
}
$('btnCam').onclick = () => start('camera');
$('btnMouse').onclick = () => start('mouse');
$('btnRec').onclick = toggleRecord;
$('btnFeed').onclick = () => gsap.to(U.feed, { value: U.feed.value > 0.5 ? 0 : 1, duration: 0.8 });
$('btnUniverse').onclick = () => exitGalaxy();

// ---------------------------------------------------------------- loop
let last = performance.now(), seenHand = false;
const FRAME_MS = 1000 / 61;
const FAR = new THREE.Vector3(0, 0, 1e4);
renderer.setAnimationLoop((now) => {
  if (now - last < FRAME_MS - 1) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  hands.update(now, dt, videoToScreen, toWorld);
  handNavigation(dt);
  rig.update(dt);
  const u = galaxy.u; u.time.value = now / 1000; u.dt.value = dt;
  const live = mode === 'galaxy';
  hands.hands.forEach((h, i) => {
    const t = u.hands[i];
    t.pos.value.copy(h.pos); t.vel.value.copy(h.vel).clampLength(0, 14);
    t.active.value = live ? h.active : 0; t.pinch.value = h.pinch; t.fist.value = h.fist; t.open.value = h.open; t.burst.value = live ? h.burst : 0; t.point.value = h.point;
    for (let j = 0; j < 21; j++) u.joints.array[i * 21 + j].copy(live && h.active > 0.3 && hands.mode === 'camera' ? h.world[j] : FAR);
  });
  updateBang(dt);
  if (!seenHand && hands.mode === 'camera' && hands.hands.some((h) => h.active > 0.5)) { seenHand = true; gsap.to(status, { opacity: 0, duration: 1 }); }
  if (u.fade.value > 0.001) renderer.compute(galaxy.compute);
  galaxy.sprite.visible = u.fade.value > 0.001;
  pipeline.render();
  drawOverlay();
  recordFrame();
});

// ?debug: live render / tracking speed
if (q.has('debug')) {
  const el = document.createElement('div'); el.id = 'debug'; el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);font:12px ui-monospace,monospace;color:#9fb4ff;z-index:9';
  document.body.append(el); let frames = 0, t = performance.now(), lastR = last;
  (function loop() { if (last !== lastR) { frames++; lastR = last; } const n = performance.now(); if (n - t > 500) { const st = hands.stats;
    el.textContent = `render ${(frames * 1000 / (n - t)).toFixed(0)} fps · tracking ${(st.hz || 0).toFixed(0)} Hz · ${(st.ms || 0).toFixed(0)} ms · ${mode}`; frames = 0; t = n; }
    requestAnimationFrame(loop); })();
}
window.__aether = { renderer, galaxy, hands, camera, rig, universe, enterGalaxy, exitGalaxy, get mode() { return mode; } };
