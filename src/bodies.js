// Gravity bodies you create: stars, planets and black holes.
// CPU N-body (≤ MAX bodies, softened, merging on contact) + a central galactic mass so things orbit the core.
// Body positions/masses are mirrored into a uniform array so the 240k galaxy stars feel them too.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, uniform, uniformArray, uv, length, smoothstep, mix, sin, atan, time, mx_noise_float, positionLocal,
  normalWorld, dot, max, instancedBufferAttribute, normalize,
} from 'three/tsl';

export const MAX = 32;
const TRAIL = 56;
const G = 1.0, SOFT = 0.004, CORE_MASS = 0.8;

// star colour by mass: red dwarf -> yellow -> white -> blue giant
const starColor = (m) => new THREE.Color().setHSL(THREE.MathUtils.lerp(0.02, 0.6, THREE.MathUtils.smoothstep(m, 0.3, 3.0)), 0.9, 0.62);
const radiusOf = (b) => b.type === 'star' ? 0.06 + 0.05 * Math.cbrt(b.mass) : b.type === 'planet' ? 0.04 : 0.11 * Math.cbrt(b.mass);

export class Bodies {
  constructor(scene) {
    this.scene = scene; this.list = []; this.center = new THREE.Vector3(); this.events = [];
    // mirrored for the GPU: xyz + signed mass (negative = black hole)
    this.gpu = uniformArray(Array.from({ length: MAX }, () => new THREE.Vector4(0, 0, 9999, 0)), 'vec4');
    this.geoSphere = new THREE.SphereGeometry(1, 40, 20);
    this.geoRing = new THREE.RingGeometry(1.4, 3.6, 96, 1);

    // trails: one instanced sprite batch for all bodies
    this.trailAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX * TRAIL * 4), 4); this.trailAttr.setUsage(THREE.DynamicDrawUsage);
    this.trailCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * TRAIL * 3), 3); this.trailCol.setUsage(THREE.DynamicDrawUsage);
    const T = instancedBufferAttribute(this.trailAttr), TC = instancedBufferAttribute(this.trailCol);
    const tm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    tm.positionNode = T.xyz; tm.colorNode = vec4(TC, 1);
    tm.opacityNode = smoothstep(0.5, 0.0, length(uv().sub(0.5))).mul(T.w).mul(0.7);
    tm.scaleNode = T.w.mul(0.028).add(0.004);
    this.trails = new THREE.Sprite(tm); this.trails.count = MAX * TRAIL; this.trails.frustumCulled = false;
    scene.add(this.trails);
    this.frame = 0;
  }

  setCenter(v) { this.center.copy(v); }

  add(type, pos, vel, mass) {
    if (this.list.length >= MAX) this.remove(this.list.find((b) => b.type === 'planet') || this.list[0]);
    const b = { type, pos: pos.clone(), vel: vel.clone(), mass, born: performance.now(), trail: Array.from({ length: TRAIL }, () => pos.clone()) };
    b.group = new THREE.Group(); b.group.position.copy(pos);
    if (type === 'star') this._starMesh(b);
    else if (type === 'planet') this._planetMesh(b);
    else this._holeMesh(b);
    this._resize(b);
    this.scene.add(b.group); this.list.push(b);
    gsapPop(b.group);
    return b;
  }

  remove(b) { if (!b) return; this.scene.remove(b.group); b.group.traverse((o) => o.material?.dispose?.()); this.list.splice(this.list.indexOf(b), 1); }
  clear() { [...this.list].forEach((b) => this.remove(b)); }

  _starMesh(b) {
    b.color = starColor(b.mass); b.u = { col: uniform(b.color.clone()) };
    const m = new THREE.MeshBasicNodeMaterial();
    const n = mx_noise_float(positionLocal.mul(4).add(vec3(0, time.mul(0.6), 0))).mul(0.5).add(0.5);
    m.colorNode = vec3(b.u.col).mul(n.mul(0.5).add(0.85));
    b.core = new THREE.Mesh(this.geoSphere, m); b.group.add(b.core);
    const cm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const d = length(uv().sub(0.5)).mul(2);
    const rays = sin(atan(uv().y.sub(0.5), uv().x.sub(0.5)).mul(8).add(time.mul(0.7))).mul(0.12).add(0.88);
    cm.colorNode = vec4(vec3(b.u.col).mul(1.4), 1); cm.opacityNode = smoothstep(1.0, 0.0, d).pow(2.8).mul(rays).mul(0.38);
    b.corona = new THREE.Sprite(cm); b.group.add(b.corona);
  }

  _planetMesh(b) {
    const hue = Math.random();
    const a = new THREE.Color().setHSL(hue, 0.55, 0.55), c = new THREE.Color().setHSL((hue + 0.12) % 1, 0.5, 0.3);
    b.u = { a: uniform(a), c: uniform(c), light: uniform(new THREE.Vector3(0, 1, 0)) };
    const m = new THREE.MeshBasicNodeMaterial();
    const bands = mx_noise_float(vec3(positionLocal.y.mul(9), positionLocal.x.mul(1.5), positionLocal.z.mul(1.5))).mul(0.5).add(0.5);
    const lit = max(dot(normalWorld, normalize(b.u.light)), 0.0).mul(0.95).add(0.08);
    m.colorNode = mix(vec3(b.u.c), vec3(b.u.a), bands).mul(lit).mul(1.3);
    b.core = new THREE.Mesh(this.geoSphere, m); b.group.add(b.core);
    b.color = a;
  }

  _holeMesh(b) {
    b.core = new THREE.Mesh(this.geoSphere, new THREE.MeshBasicNodeMaterial({ color: 0x000000 })); b.group.add(b.core);
    const dm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const q = uv().sub(0.5).mul(2); const r = length(q);
    const a = atan(q.y, q.x); const spin = a.add(time.mul(1.8)).sub(float(1).div(r.add(0.15)).mul(1.4));
    const swirl = mx_noise_float(vec3(sin(spin).mul(2.5), sin(spin.mul(2)).mul(1.2).add(r.mul(3)), time.mul(0.25))).mul(0.5).add(0.5);
    const glow = smoothstep(0.36, 0.46, r).mul(smoothstep(1.0, 0.55, r));
    dm.colorNode = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.9, 0.7), smoothstep(0.75, 0.42, r)).mul(swirl.mul(1.3).add(0.25)).mul(1.35);
    dm.opacityNode = glow.mul(swirl.mul(0.7).add(0.3));
    b.disk = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dm); b.group.add(b.disk);
    b.color = new THREE.Color(1, 0.55, 0.2);
  }

  _resize(b) {
    const r = radiusOf(b); b.radius = r;
    b.core.scale.setScalar(r);
    if (b.corona) b.corona.scale.setScalar(r * 5.5);
    if (b.disk) b.disk.scale.setScalar(r * 3.0);
    if (b.type === 'star') { b.color = starColor(b.mass); b.u.col.value.copy(b.color); }
  }

  /** circular-orbit velocity around the strongest attractor near `pos` (tangent in the view plane) */
  orbitVelocity(pos, viewDir) {
    let best = null, bestA = 0;
    for (const b of this.list) { if (b.type === 'planet') continue; const r = b.pos.distanceTo(pos); const a = b.mass / (r * r + 0.01); if (a > bestA) { bestA = a; best = b; } }
    const cr = pos.distanceTo(this.center); const coreA = CORE_MASS / (cr * cr + 0.01);
    const anchor = best && bestA > coreA ? best : { pos: this.center, vel: new THREE.Vector3(), mass: CORE_MASS };
    const d = pos.clone().sub(anchor.pos); const r = Math.max(0.05, d.length());
    const t = new THREE.Vector3().crossVectors(d, viewDir).normalize();
    return t.multiplyScalar(Math.sqrt(G * anchor.mass / r)).add(anchor.vel);
  }

  nearest(pos, types, within = 1) {
    let best = null, bd = within;
    for (const b of this.list) { if (!types.includes(b.type)) continue; const d = b.pos.distanceTo(pos); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  step(dt, holes) {
    const L = this.list; const sub = 3, h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (const a of L) {
        const acc = new THREE.Vector3();
        const dc = this.center.clone().sub(a.pos); const rc2 = dc.lengthSq() + 0.02;
        acc.addScaledVector(dc, G * CORE_MASS / (rc2 * Math.sqrt(rc2)));
        for (const b of L) { if (a === b) continue; const d = b.pos.clone().sub(a.pos); const r2 = d.lengthSq() + SOFT; acc.addScaledVector(d, G * b.mass / (r2 * Math.sqrt(r2))); }
        a.vel.addScaledVector(acc.clampLength(0, 60), h);
      }
      for (const a of L) a.pos.addScaledVector(a.vel, h);
      // merges: the heavier body (or the black hole) swallows the lighter one
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j]; if (!a || !b) continue;
        if (a.pos.distanceTo(b.pos) < (a.radius + b.radius) * 0.8) {
          const [big, small] = (a.type === 'hole') !== (b.type === 'hole') ? (a.type === 'hole' ? [a, b] : [b, a]) : a.mass >= b.mass ? [a, b] : [b, a];
          big.vel.multiplyScalar(big.mass).addScaledVector(small.vel, small.mass).divideScalar(big.mass + small.mass);
          big.mass += small.mass; this._resize(big);
          this.events.push({ type: 'merge', pos: big.pos.clone(), color: small.color, into: big.type, mass: small.mass });
          this.remove(small); j--;
        }
      }
    }
    // escapees far from the galaxy are let go
    for (const b of [...L]) if (b.pos.distanceTo(this.center) > 16) this.remove(b);
    // sync meshes, trails, GPU mirror
    this.frame++;
    const ta = this.trailAttr.array, tc = this.trailCol.array; ta.fill(0);
    L.forEach((b, k) => {
      b.group.position.copy(b.pos);
      if (b.disk) b.disk.lookAt(b.pos.clone().add(new THREE.Vector3(0, 1, 0.35)));
      if (this.frame % 2 === 0) { b.trail.pop(); b.trail.unshift(b.pos.clone()); }
      const col = b.color || new THREE.Color(1, 1, 1);
      if (b.type !== 'hole') b.trail.forEach((p, i) => {
        const o = (k * TRAIL + i) * 4; ta[o] = p.x; ta[o + 1] = p.y; ta[o + 2] = p.z; ta[o + 3] = (1 - i / TRAIL) * (b.type === 'star' ? 1 : 0.7);
        const c = (k * TRAIL + i) * 3; tc[c] = col.r; tc[c + 1] = col.g; tc[c + 2] = col.b;
      });
      if (b.type === 'planet') { const st = this.nearest(b.pos, ['star'], 99); b.u.light.value.copy(st ? st.pos.clone().sub(b.pos) : this.center.clone().sub(b.pos)); }
    });
    for (let k = 0; k < MAX; k++) {
      const b = L[k], v = this.gpu.array[k];
      if (b) v.set(b.pos.x, b.pos.y, b.pos.z, b.type === 'hole' ? -b.mass : b.mass * (b.type === 'planet' ? 0.3 : 1)); else v.set(0, 0, 9999, 0);
    }
    this.trailAttr.needsUpdate = true; this.trailCol.needsUpdate = true;
  }
}

function gsapPop(obj) { obj.scale.setScalar(0.01); const t0 = performance.now(); const f = () => { const t = Math.min(1, (performance.now() - t0) / 450); const e = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2); obj.scale.setScalar(Math.max(0.01, e)); if (t < 1) requestAnimationFrame(f); }; f(); }
