// Creation, designed to feel like magic:
//  🤏 pinch in space -> stardust gathers into a glowing ball that grows while you hold
//  let go quickly -> planet · hold longer -> star (bigger and bluer the longer) · move as you let go -> throw
//  a golden line previews the orbit while you hold · rough throws near a star get a gentle orbit assist
//  🤏 pinch an existing body -> grab it, move it, throw it · 🤏🤏 two hands on one star, pull apart -> giant -> supernova
//  ✊✊ two fists together -> black hole
// Mouse: press-and-hold in space = gather, release = create, drag while releasing = throw; press on a body = grab.
import * as THREE from 'three/webgpu';
import { uv, length, smoothstep, vec4, vec3, uniform, mix } from 'three/tsl';
import * as sfx from './audio.js';

const PLANET_HOLD = 0.42;                     // seconds: shorter = planet, longer = star
const STEPS = 150, STEP_DT = 0.035;

export function makeCreator({ scene, camera, bodies, nebula, hands, toWorld, toScreen, say, events }) {
  // glowing "protostar" that grows while gathering (one per hand + mouse)
  const glowMat = () => {
    const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const col = uniform(new THREE.Color(1, 0.8, 0.55)); const d = length(uv().sub(0.5)).mul(2);
    m.colorNode = vec4(vec3(col).mul(1.6), 1); m.opacityNode = smoothstep(1.0, 0.0, d).pow(2.2).add(smoothstep(0.25, 0.0, d)).mul(0.9);
    m.userData.col = col; return m;
  };
  const glows = [0, 1, 2].map(() => { const s = new THREE.Sprite(glowMat()); s.visible = false; scene.add(s); return s; });
  // orbit preview line
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STEPS * 3), 3));
  const lineMat = new THREE.LineBasicNodeMaterial({ color: 0xffd9a8, transparent: true, opacity: 0.6, depthWrite: false });
  const line = new THREE.Line(lineGeo, lineMat); line.frustumCulled = false; line.visible = false; scene.add(line);

  const st = [0, 1, 2].map(() => ({ mode: null, t0: 0, held: 0, body: null, partner: null, d0: 0, m0: 0 })); // [hand0, hand1, mouse]
  const api = { enabled: false, gatherHeld: 0, labels: [] };
  const camFwd = () => camera.getWorldDirection(new THREE.Vector3());

  // ---- physics helpers
  function anchorFor(pos) {
    let best = null, bestA = 0;
    for (const b of bodies.list) { if (b.type === 'planet') continue; const r = b.pos.distanceTo(pos); const a = b.mass / (r * r + 0.01); if (a > bestA) { bestA = a; best = b; } }
    if (bodies.coreMass > 0) { const r = pos.distanceTo(bodies.center); const a = bodies.coreMass / (r * r + bodies.coreSoft); if (a > bestA) return { pos: bodies.center, vel: new THREE.Vector3(), mass: bodies.coreMass }; }
    return best;
  }
  /** nudge a rough throw into a nice orbit around the nearest star/black hole (hard throws keep their speed) */
  function assist(pos, vel) {
    const a = anchorFor(pos); if (!a) return vel;
    const d = pos.clone().sub(a.pos); const r = Math.max(0.15, d.length()); if (r > 5) return vel;
    const vc = Math.sqrt(a.mass / r); const rel = vel.clone().sub(a.vel || new THREE.Vector3());
    if (rel.length() > vc * 1.7) return vel;                                   // a real throw: let it fly
    const t = new THREE.Vector3().crossVectors(d, camFwd()).normalize(); if (rel.dot(t) < 0 && rel.length() > 0.15) t.negate();
    return (a.vel ? a.vel.clone() : new THREE.Vector3()).add(rel.lerp(t.multiplyScalar(vc), 0.82));
  }
  function predict(pos, vel, ignore) {
    const arr = lineGeo.attributes.position.array; const p = pos.clone(), v = vel.clone(); let n = 0;
    for (let i = 0; i < STEPS; i++) {
      const acc = new THREE.Vector3();
      if (bodies.coreMass > 0) { const dc = bodies.center.clone().sub(p); const r2 = dc.lengthSq() + bodies.coreSoft; acc.addScaledVector(dc, bodies.coreMass / (r2 * Math.sqrt(r2))); }
      let hit = false;
      for (const b of bodies.list) { if (b === ignore) continue; const d = b.pos.clone().sub(p); const r2 = d.lengthSq() + 0.004; acc.addScaledVector(d, b.mass / (r2 * Math.sqrt(r2))); if (Math.sqrt(r2) < b.radius) hit = true; }
      v.addScaledVector(acc.clampLength(0, 60), STEP_DT); p.addScaledVector(v, STEP_DT);
      arr[n * 3] = p.x; arr[n * 3 + 1] = p.y; arr[n * 3 + 2] = p.z; n++;
      if (hit || p.distanceTo(bodies.center) > bodies.escape) break;
    }
    lineGeo.attributes.position.needsUpdate = true; lineGeo.setDrawRange(0, n); line.visible = n > 2;
  }
  const throwVel = (v) => v.clone().multiplyScalar(0.42).clampLength(0, 4.5);

  // ---- making things
  function makePlanet(pos, vel) { const b = bodies.add('planet', pos, assist(pos, vel), 0.01); sfx.chime(0.2); events?.('planet', b); return b; }
  function makeStar(pos, vel, held) {
    const mass = THREE.MathUtils.clamp(0.35 + (held - PLANET_HOLD) * 1.1, 0.35, 3.2);
    nebula.emitBurst(pos, new THREE.Color(1, 0.8, 0.55), 900, 0.45);
    const b = bodies.add('star', pos, assist(pos, vel), mass); sfx.chime(0.9); events?.('star', b); return b;
  }
  function makeHole(pos) { nebula.emitBurst(pos, new THREE.Color(0.32, 0.18, 0.75), 450, 1.2); const b = bodies.add('hole', pos, new THREE.Vector3(), 2.2); sfx.boom(); events?.('hole', b); return b; }
  function supernova(star) {
    const p = star.pos.clone(), c = star.color.clone(), m = star.mass; bodies.remove(star);
    nebula.emitBurst(p, c, 5000, 1.8); sfx.boom(); events?.('supernova', { pos: p, mass: m });
    if (m > 2.4) setTimeout(() => bodies.add('hole', p, new THREE.Vector3(), m * 0.5), 450);
  }
  const bodyNearScreen = (sx, sy, px = 55) => {
    let best = null, bd = Infinity;
    for (const b of bodies.list) { const s = toScreen(b.pos); if (!s.front) continue; const rpx = Math.max(px, (b.radius / camera.position.distanceTo(b.pos)) * innerHeight * 1.3); const d = Math.hypot(s.x - sx, s.y - sy); if (d < rpx && d < bd) { bd = d; best = b; } }
    return best;
  };

  // ---- one input slot (hand or mouse) stepping through: idle -> gather | grab -> release
  function begin(k, pos, sx, sy, now) {
    const s = st[k]; const b = bodyNearScreen(sx, sy);
    // second hand pinching the star the other hand holds = stretch it
    const other = st[1 - k]; if (k < 2 && b && other?.mode === 'grab' && other.body === b && b.type === 'star') { s.mode = 'stretch'; s.body = b; other.partner = k; s.d0 = 0; s.m0 = b.mass; return; }
    if (b) { s.mode = 'grab'; s.body = b; s.t0 = now; sfx.whoosh(); return; }
    if (api.blocked?.(sx, sy)) { s.mode = null; return; }   // pinching a world that isn't yours (a system's own planet): not a creation
    s.mode = 'gather'; s.t0 = now; s.held = 0;
  }
  function hold(k, pos, vel, dt) {
    const s = st[k]; const g = glows[k];
    if (s.mode === 'gather') {
      s.held += dt; api.gatherHeld = Math.max(api.gatherHeld, s.held);
      const star = s.held > PLANET_HOLD; const r = star ? 0.18 + Math.min(1.6, s.held) * 0.18 : 0.1 + s.held * 0.25;
      g.visible = true; g.position.copy(pos); g.scale.setScalar(r * 2.2);
      g.material.userData.col.value.set(star ? new THREE.Color().setHSL(THREE.MathUtils.lerp(0.09, 0.58, Math.min(1, (s.held - PLANET_HOLD) / 2.2)), 0.85, 0.7) : new THREE.Color(0.75, 0.85, 1.0));
      sfx.gathering(true, Math.min(1, s.held / 2.5));
      predict(pos, assist(pos, throwVel(vel)), null);
      const sp = toScreen(pos); api.labels.push({ x: sp.x, y: sp.y - 46, text: star ? (s.held > 1.6 ? '✦ big star' : '✦ star') : '● planet' });
    } else if (s.mode === 'grab' && s.body) {
      if (!bodies.list.includes(s.body)) { s.mode = null; return; }
      if (s.partner != null && st[s.partner].mode === 'stretch') return;   // the stretch drives it now
      s.body.pos.lerp(pos, 0.5); s.body.vel.copy(throwVel(vel));
      predict(s.body.pos, assist(s.body.pos, throwVel(vel)), s.body);
    } else if (s.mode === 'stretch' && s.body) {
      const a = hands.hands[0].pos, b2 = hands.hands[1].pos; const d = a.distanceTo(b2); if (!s.d0) s.d0 = Math.max(0.3, d);
      const ratio = d / s.d0; s.body.mass = s.m0 * Math.max(0.6, ratio * ratio); bodies._resize?.(s.body);
      s.body.pos.lerp(a.clone().add(b2).multiplyScalar(0.5), 0.3); s.body.vel.set(0, 0, 0);
      const sp = toScreen(s.body.pos); api.labels.push({ x: sp.x, y: sp.y - 60, text: ratio > 2.2 ? '⚠ about to explode' : 'stretching…' });
      if (ratio > 2.7) { supernova(s.body); st.forEach((x) => { if (x.body === s.body) { x.mode = null; x.body = null; } }); }
    }
  }
  function end(k, pos, vel) {
    const s = st[k]; glows[k].visible = false;
    if (s.mode === 'gather') { if (s.held < PLANET_HOLD) makePlanet(pos, throwVel(vel)); else makeStar(pos, throwVel(vel), s.held); }
    if (s.mode === 'grab' && s.body && bodies.list.includes(s.body)) s.body.vel.copy(assist(s.body.pos, throwVel(vel)));
    if (s.mode === 'stretch') { const o = st.find((x) => x.partner === k); if (o) o.partner = null; }
    const was = s.mode; s.mode = null; s.body = null; s.partner = null; return was;
  }

  // ---- hands
  let fistsT = 0, holeCooldown = 0; const wasPinch = [false, false];
  function update(dt, now) {
    api.labels.length = 0; api.gatherHeld = 0; line.visible = false;
    if (!api.enabled) { glows.forEach((g) => (g.visible = false)); sfx.gathering(false); return; }
    if (hands.mode === 'camera') {
      hands.hands.forEach((h, k) => {
        const on = h.active > 0.6 && h.lat.pinch.on && h.point < 0.5;
        const sp = toScreen(h.pos);
        if (on && !wasPinch[k]) begin(k, h.pos, sp.x, sp.y, now);
        if (on) hold(k, h.pos, h.vel, dt);
        if (!on && wasPinch[k]) end(k, h.pos, h.vel);
        wasPinch[k] = on;
      });
      const [a, b] = hands.hands;
      const fists = a.active > 0.7 && b.active > 0.7 && a.lat.fist.on && b.lat.fist.on && toScreen(a.pos).x !== null && a.pos.distanceTo(b.pos) < 2.6;
      fistsT = fists ? fistsT + dt : 0; holeCooldown -= dt;
      if (fists) { const m = toScreen(a.pos.clone().add(b.pos).multiplyScalar(0.5)); api.labels.push({ x: m.x, y: m.y - 40, text: fistsT > 0.15 ? '◉ black hole…' : '' }); }
      if (fistsT > 0.6 && holeCooldown <= 0) { makeHole(a.pos.clone().add(b.pos).multiplyScalar(0.5)); fistsT = 0; holeCooldown = 1.5; }
    }
    if (st[2].mode && mouse.pos) hold(2, mouse.pos, mouse.vel, dt);
    if (!st.some((s) => s.mode === 'gather')) sfx.gathering(false);
    // black-hole hum follows how many holes are on screen
    sfx.setHum(bodies.list.filter((b) => b.type === 'hole' && toScreen(b.pos).front).length * 0.6);
  }

  // ---- mouse
  const mouse = { down: false, pending: null, pos: null, vel: new THREE.Vector3(), last: null, lastT: 0, tool: null };
  const world = (x, y) => toWorld(x / innerWidth, y / innerHeight, 0);
  /** returns true if the mouse is now creating/grabbing (caller should not rotate the camera) */
  function mouseDown(e, now) {
    if (!api.enabled) return false;
    const p = world(e.clientX, e.clientY);
    if (mouse.tool === 'hole') { makeHole(p); mouse.tool = null; events?.('tool', null); return true; }
    const b = bodyNearScreen(e.clientX, e.clientY);
    Object.assign(mouse, { down: true, pos: p, last: p.clone(), lastT: now, x: e.clientX, y: e.clientY, t0: now, vel: new THREE.Vector3() });
    if (b) { begin(2, p, e.clientX, e.clientY, now); return true; }
    mouse.pending = true; return true;                 // decide on move: drag = rotate, still = gather
  }
  function mouseMove(e, now) {
    if (!mouse.down) return false;
    const p = world(e.clientX, e.clientY); const dtm = Math.max(0.008, (now - mouse.lastT) / 1000);
    mouse.vel.lerp(p.clone().sub(mouse.last).divideScalar(dtm), 0.5); mouse.last = p; mouse.lastT = now; mouse.pos = p;
    if (mouse.pending) {
      if (Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y) > 10 && now - mouse.t0 < 170) { mouse.pending = false; mouse.down = false; return false; } // it's a camera drag
    }
    return true;
  }
  function tickMouse(now) { if (mouse.pending && mouse.down && now - mouse.t0 > 170) { mouse.pending = false; begin(2, mouse.pos, mouse.x, mouse.y, now); } }
  /** returns 'click-body' when a body was clicked without moving (caller can open a close-up) */
  function mouseUp(e, now) {
    if (!mouse.down) return null; mouse.down = false;
    if (mouse.pending) { mouse.pending = false; begin(2, mouse.pos, mouse.x, mouse.y, now); st[2].held = 0; } // a quick click = a planet
    const s = st[2]; const clicked = s.mode === 'grab' && Math.hypot(e.clientX - mouse.x, e.clientY - mouse.y) < 6 && now - mouse.t0 < 260 ? s.body : null;
    end(2, mouse.pos || world(e.clientX, e.clientY), mouse.vel);
    return clicked ? { body: clicked } : null;
  }

  return Object.assign(api, { update, mouseDown, mouseMove, mouseUp, tickMouse, makeHole, supernova, setTool(t) { mouse.tool = t; }, get mouseTool() { return mouse.tool; }, isBusy: () => st.some((s) => s.mode) || mouse.down });
}
