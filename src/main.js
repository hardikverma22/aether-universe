import * as THREE from 'three/webgpu';
import {
  Fn, pass, screenUV, vec2, vec3, vec4, float, uniform, mix, smoothstep, length, normalize, texture, convertToTexture, max, clamp,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import gsap from 'gsap';
import { makeGalaxy } from './sim.js';
import { Hands, CONNECTIONS } from './hands.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);

// ---------------------------------------------------------------- renderer + scene
const renderer = new THREE.WebGPURenderer({ canvas: $('gl'), antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); // leave GPU headroom for hand tracking
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55; // dim behind the intro, brightens on start
await renderer.init();
if (!renderer.backend?.isWebGPUBackend) $('intro').querySelector('.lede').textContent = 'This needs WebGPU — try the latest Chrome, Edge or Safari.';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 100);
camera.position.set(0, 0, 8.5);

// background: deep-space gradient, blended with a stylized (duotone, dim) mirrored camera feed once the camera is on
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

const small = matchMedia('(max-width: 700px)').matches;
const galaxy = makeGalaxy({ count: small ? 90000 : 240000 });
scene.add(galaxy.sprite);
renderer.compute(galaxy.init);

// post: bloom, then gravitational lensing + chromatic aberration + flash for the Big Bang
const pipeline = new THREE.RenderPipeline(renderer);
const scenePass = pass(scene, camera);
const lit = convertToTexture(scenePass.add(bloom(scenePass, 0.8, 0.6, 0.22)));
pipeline.outputNode = Fn(() => {
  const uvn = screenUV; const asp = float(innerWidth / innerHeight);
  const d = uvn.sub(U.bangUV).mul(vec2(asp, 1)); const r = length(d).add(1e-3); const dir = d.div(r).div(vec2(asp, 1));
  const warp = U.lens.mul(0.035).div(r.add(0.06)).mul(smoothstep(0.0, 0.06, r));            // pull light toward the singularity
  const uv2 = uvn.sub(dir.mul(warp));
  const ca = dir.mul(U.chroma.mul(0.02).mul(r.add(0.2)));
  const col = vec3(lit.sample(uv2.add(ca)).r, lit.sample(uv2).g, lit.sample(uv2.sub(ca)).b);
  const hole = smoothstep(0.0, 0.05, r).mul(U.lens).oneMinus().mul(U.lens).oneMinus();    // dark event horizon
  return vec4(col.mul(max(hole, 0.0)).add(U.flash.mul(vec3(1.0, 0.92, 0.82))), 1);
})();

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); sizeOverlay(); updateCover(); });

// ---------------------------------------------------------------- coordinate mapping
// displayed feed uses "cover" fit; hand landmarks are mapped through the same transform so they line up
function updateCover() {
  const sa = innerWidth / innerHeight, va = (video.videoWidth || 16) / (video.videoHeight || 9);
  U.cover.value.set(sa > va ? 1 : sa / va, sa > va ? va / sa : 1);
}
const videoToScreen = (x, y) => ({ x: 0.5 + (x - 0.5) / U.cover.value.x, y: 0.5 + (y - 0.5) / U.cover.value.y });
const toWorld = (nx, ny, depth = 0) => {
  const z = depth * 1.4;
  const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - z);
  return new THREE.Vector3((nx - 0.5) * h * camera.aspect, (0.5 - ny) * h, z);
};

// ---------------------------------------------------------------- hands + overlay
const hands = new Hands(video);
const overlay = $('overlay'), ctx = overlay.getContext('2d');
function sizeOverlay() { const r = Math.min(devicePixelRatio, 2); overlay.width = innerWidth * r; overlay.height = innerHeight * r; ctx.setTransform(r, 0, 0, r, 0, 0); }
sizeOverlay();

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
    const s = h.pos.clone().project(camera);
    const x = (s.x * 0.5 + 0.5) * innerWidth, y = (0.5 - s.y * 0.5) * innerHeight;
    const g = Math.max(h.pinch, h.fist, h.point * 0.7);
    const r = 16 + g * 26 + h.burst * 90;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,214,170,${(0.08 + g * 0.32 + h.burst * 0.5) * h.active})`); grd.addColorStop(1, 'rgba(255,180,120,0)');
    ctx.shadowBlur = 0; ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
}

// ---------------------------------------------------------------- Big Bang (two hands together, then pull apart)
const bang = { state: 'idle', charge: 0, startD: 0, t: 0, explode: 0 };
function updateBang(dt) {
  const [a, b] = hands.hands; const both = a.active > 0.8 && b.active > 0.8;
  const d = both ? a.pos.distanceTo(b.pos) : 99;
  const mid = both ? a.pos.clone().add(b.pos).multiplyScalar(0.5) : galaxy.u.bangPos.value;
  if (bang.state === 'idle' && both && d < 1.0) { bang.state = 'charging'; bang.startD = d; bang.charge = 0; }
  if (bang.state === 'charging') {
    galaxy.u.bangPos.value.lerp(mid, 0.3);
    bang.charge = Math.min(1, bang.charge + dt / 1.4);
    const release = !both || d > bang.startD + 0.9;
    if (release) {
      if (bang.charge > 0.35) { bang.state = 'exploding'; bang.explode = 1; bang.t = 0; }
      else bang.state = 'idle';
    }
  }
  if (bang.state === 'exploding') { bang.t += dt; bang.explode *= Math.exp(-dt * 2.2); if (bang.t > 2.2) bang.state = 'idle'; }
  const implode = bang.state === 'charging' ? bang.charge : 0;
  galaxy.u.implode.value += (implode - galaxy.u.implode.value) * 0.2;
  galaxy.u.explode.value = bang.state === 'exploding' ? bang.explode : 0;
  const s = galaxy.u.bangPos.value.clone().project(camera);
  U.bangUV.value.set(s.x * 0.5 + 0.5, 0.5 - s.y * 0.5);
  U.lens.value = galaxy.u.implode.value * 0.9;
  U.chroma.value = galaxy.u.explode.value + Math.max(...hands.hands.map((h) => h.burst)) * 0.4;
  U.flash.value = bang.state === 'exploding' ? Math.max(0, 1 - bang.t * 3) ** 2 * 0.9 : 0;
}

// ---------------------------------------------------------------- vertical clip recording (9:16)
const rec = { on: false, r: null, cv: document.createElement('canvas') };
rec.cv.width = 1080; rec.cv.height = 1920; const rctx = rec.cv.getContext('2d');
function recordFrame() {
  if (!rec.on) return;
  const src = $('gl'); const sh = src.height, sw = sh * 9 / 16, sx = (src.width - sw) / 2;
  rctx.drawImage(src, sx, 0, sw, sh, 0, 0, 1080, 1920);
  const o = overlay; const osh = o.height, osw = osh * 9 / 16; rctx.globalCompositeOperation = 'lighter';
  rctx.drawImage(o, (o.width - osw) / 2, 0, osw, osh, 0, 0, 1080, 1920); rctx.globalCompositeOperation = 'source-over';
  rec.frames = (rec.frames || 0) + 1;
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

// ---------------------------------------------------------------- intro + start
const title = $('title');
title.innerHTML = [...title.textContent].map((c) => `<span class="ch">${c}</span>`).join('');
gsap.from('#title .ch', { y: 50, opacity: 0, filter: 'blur(14px)', duration: 1.8, ease: 'expo.out', stagger: 0.08, delay: 0.3 });
gsap.from(['.eyebrow', '.lede', '.cta', '.fine'], { y: 14, opacity: 0, duration: 1.2, ease: 'power3.out', stagger: 0.12, delay: 0.9 });

const status = $('status');
async function start(mode) {
  document.querySelectorAll('.cta button').forEach((b) => (b.disabled = true));
  try {
    if (mode === 'camera') { status.textContent = 'Waking the stars…'; await hands.initCamera(); updateCover(); }
    else hands.initMouse($('gl'));
  } catch (e) { console.warn(e); hands.initMouse($('gl')); status.textContent = 'Camera unavailable — using the mouse'; }
  gsap.to(renderer, { toneMappingExposure: 0.95, duration: 2.2, ease: 'power2.inOut' });
  if (hands.mode === 'camera') gsap.to(U.feed, { value: q.has('nofeed') ? 0 : 1, duration: 2.5, ease: 'power2.inOut' });
  gsap.to('#intro', { opacity: 0, duration: 1.2, ease: 'power2.inOut', onComplete: () => ($('intro').hidden = true) });
  $('hud').hidden = false;
  if (hands.mode === 'mouse') $('guide').innerHTML = '<li><b>Move</b> to blow the stars</li><li><b>Hold</b> to gather them</li><li><b>Release</b> after a moment to explode</li>';
  gsap.from('#guide li, #tools', { y: 12, opacity: 0, duration: 1, stagger: 0.1, delay: 0.6 });
  status.textContent = hands.mode === 'camera' ? 'Raise your hands' : '';
}
$('btnCam').onclick = () => start('camera');
$('btnMouse').onclick = () => start('mouse');
$('btnRec').onclick = toggleRecord;
$('btnFeed').onclick = () => gsap.to(U.feed, { value: U.feed.value > 0.5 ? 0 : 1, duration: 0.8 });
addEventListener('keydown', (e) => { if (e.key === 'r') toggleRecord(); if (e.key === 'v') $('btnFeed').click(); });

// ---------------------------------------------------------------- loop
let last = performance.now(), seenHand = false;
const FRAME_MS = 1000 / 61; // cap ~60 fps so the hand tracker gets GPU time
renderer.setAnimationLoop((now) => {
  if (now - last < FRAME_MS - 1) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  hands.update(now, dt, videoToScreen, toWorld);
  const u = galaxy.u;
  u.time.value = now / 1000; u.dt.value = dt;
  hands.hands.forEach((h, i) => {
    const t = u.hands[i];
    t.pos.value.copy(h.pos); t.vel.value.copy(h.vel).clampLength(0, 14);
    t.active.value = h.active; t.pinch.value = h.pinch; t.fist.value = h.fist; t.open.value = h.open; t.burst.value = h.burst; t.point.value = h.point;
    for (let j = 0; j < 21; j++) u.joints.array[i * 21 + j].copy(h.active > 0.3 && hands.mode === 'camera' ? h.world[j] : new THREE.Vector3(0, 0, 99));
  });
  updateBang(dt);
  if (!seenHand && hands.mode === 'camera' && hands.hands.some((h) => h.active > 0.5)) { seenHand = true; gsap.to(status, { opacity: 0, duration: 1 }); }
  renderer.compute(galaxy.compute);
  pipeline.render();
  drawOverlay();
  recordFrame();
});

// ?debug: live render / tracking speed
if (q.has('debug')) {
  const el = document.createElement('div'); el.id = 'debug'; el.style.cssText = 'position:fixed;top:8px;right:10px;font:12px ui-monospace,monospace;color:#9fb4ff;z-index:9;text-align:right';
  document.body.append(el); let frames = 0, t = performance.now(), lastR = last;
  (function loop() { if (last !== lastR) { frames++; lastR = last; } const n = performance.now(); if (n - t > 500) { const st = hands.stats;
    el.textContent = `render ${(frames * 1000 / (n - t)).toFixed(0)} fps · tracking ${(st.hz || 0).toFixed(0)} Hz · ${(st.ms || 0).toFixed(0)} ms ${st.delegate || ''} · bang ${bang.state}`; frames = 0; t = n; }
    requestAnimationFrame(loop); })();
}
window.__aether = { renderer, galaxy, hands, camera, toWorld, U, bang };
