// Nebula gas: a ring buffer of soft glowing puffs on the GPU.
// emitStroke() paints gas along a segment; emitBurst() blows a spherical shell (supernovae, merges).
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, uniform, instancedArray, instanceIndex, hash, mix, smoothstep, length, uv, select, mx_noise_vec3, exp, sin, cos, PI2, sqrt, max, If,
} from 'three/tsl';

export function makeNebula({ count = 40000 } = {}) {
  const pos = instancedArray(count, 'vec4'); // xyz, w = life 1 -> 0
  const vel = instancedArray(count, 'vec4'); // xyz, w = size seed
  const col = instancedArray(count, 'vec4'); // rgb, a = kind (0 stroke, 1 burst)
  const u = {
    dt: uniform(1 / 60), time: uniform(0), start: uniform(0), n: uniform(0), mode: uniform(0),
    p0: uniform(new THREE.Vector3()), p1: uniform(new THREE.Vector3()), color: uniform(new THREE.Color()), speed: uniform(0.3),
  };
  let cursor = 0;

  const kernel = Fn(() => {
    const i = float(instanceIndex);
    const P = pos.element(instanceIndex), V = vel.element(instanceIndex), C = col.element(instanceIndex);
    const rel = i.sub(u.start).add(count).mod(count);
    const seed = i.mul(0.618).add(u.time);
    If_(rel.lessThan(u.n), () => {
      const t = rel.div(max(u.n, 1));
      const h1 = hash(seed), h2 = hash(seed.add(3.7)), h3 = hash(seed.add(9.1));
      const dir = vec3(sin(h2.mul(PI2)).mul(sqrt(h1.mul(h1.oneMinus()).mul(4))), h1.mul(2).sub(1), cos(h2.mul(PI2)).mul(sqrt(h1.mul(h1.oneMinus()).mul(4))));
      const strokeP = mix(u.p0, u.p1, t).add(dir.mul(h3.pow(0.5).mul(0.2)));
      const burstP = u.p0.add(dir.mul(h3.mul(0.05)));
      P.assign(vec4(select(u.mode.equal(0), strokeP, burstP), 1));
      V.assign(vec4(dir.mul(select(u.mode.equal(0), h3.mul(0.12).add(0.03), h3.mul(0.5).add(0.5).mul(u.speed))), hash(seed.add(1.3))));
      const tint = hash(seed.add(5.5));
      const shade = mix(vec3(u.color), vec3(u.color).zxy, tint.mul(0.35)).mul(tint.mul(0.5).add(0.6));
      C.assign(vec4(shade, u.mode));
    }, () => {
      If_(P.w.greaterThan(0), () => {
        const curl = mx_noise_vec3(P.xyz.mul(1.6).add(vec3(0, u.time.mul(0.05), 0))).mul(0.05);
        const v = V.xyz.mul(exp(u.dt.mul(-0.9))).add(curl.mul(u.dt));
        V.assign(vec4(v, V.w));
        P.assign(vec4(P.xyz.add(v.mul(u.dt)), P.w.sub(u.dt.div(select(C.a.equal(1), float(6), float(10))))));
      });
    });
  });
  const compute = kernel().compute(count);

  const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const PA = pos.toAttribute(), VA = vel.toAttribute(), CA = col.toAttribute();
  mat.positionNode = PA.xyz;
  const life = max(PA.w, 0);
  const fadeIn = smoothstep(1.0, 0.93, life), fadeOut = smoothstep(0.0, 0.35, life);
  mat.colorNode = vec4(CA.rgb, 1);
  mat.opacityNode = smoothstep(0.5, 0.0, length(uv().sub(0.5))).pow(1.6).mul(fadeIn).mul(fadeOut).mul(select(CA.a.equal(1), float(0.085), float(0.05)));
  mat.scaleNode = VA.w.mul(0.3).add(0.1).mul(life.oneMinus().mul(1.8).add(0.7));
  const sprite = new THREE.Sprite(mat); sprite.count = count; sprite.frustumCulled = false;

  let pending = null; // one emission per frame (merged), applied in update()
  return {
    sprite, u,
    // strokes arriving in the same frame are merged into one segment; density scales with length (no dashes)
    emitStroke(a, b, color) {
      if (pending && pending.mode === 0) { pending.b.copy(b); pending.len += a.distanceTo(b); }
      else pending = { mode: 0, a: a.clone(), b: b.clone(), color, len: a.distanceTo(b), speed: 0.3 };
      pending.n = Math.round(Math.min(900, Math.max(12, pending.len * 320)));
    },
    emitBurst(p, color, n = 3000, speed = 1.4) { pending = { mode: 1, a: p.clone(), b: p.clone(), color, n, speed }; },
    update(renderer, dt, t) {
      u.dt.value = dt; u.time.value = t;
      if (pending) {
        u.mode.value = pending.mode; u.p0.value.copy(pending.a); u.p1.value.copy(pending.b); u.color.value.copy(pending.color);
        u.n.value = Math.min(pending.n, count); u.start.value = cursor; u.speed.value = pending.speed;
        cursor = (cursor + pending.n) % count; pending = null;
      } else u.n.value = 0;
      renderer.compute(compute);
    },
  };
}

function If_(c, a, b) { const n = If(c, a); if (b) n.Else(b); return n; }
