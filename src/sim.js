// Galaxy of GPU particles (TSL compute) that hands can blow, grab and explode.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, uniform, instancedArray, instanceIndex, hash, sin, cos, sqrt, pow, exp, mix,
  clamp, smoothstep, length, normalize, cross, dot, max, min, mx_noise_vec3, uv, PI2, select, uniformArray, Loop, int, abs, If, distance, cameraPosition,
} from 'three/tsl';

export function makeGalaxy({ count, bodies }) {
  const pos = instancedArray(count, 'vec4');  // xyz, w = brightness seed
  const vel = instancedArray(count, 'vec4');  // xyz, w = heat (recent speed)
  const home = instancedArray(count, 'vec4'); // xyz in galaxy frame, w = radius 0..1

  const u = {
    time: uniform(0), dt: uniform(1 / 60), tilt: uniform(1.08), spin: uniform(1), alpha: uniform(0.26), nearFade: uniform(new THREE.Vector2(0.25, 1.2)),
    hands: [0, 1].map(() => ({ pos: uniform(new THREE.Vector3()), vel: uniform(new THREE.Vector3()),
      active: uniform(0), pinch: uniform(0), fist: uniform(0), open: uniform(0), burst: uniform(0), point: uniform(0) })),
    // all 42 hand landmarks in world space (z = 99 when a hand is absent): stars flow around your fingers
    joints: uniformArray(Array.from({ length: 42 }, () => new THREE.Vector3(0, 0, 99)), 'vec3'),
    // two-hand Big Bang: implode toward a point, then explode
    bangPos: uniform(new THREE.Vector3()), implode: uniform(0), explode: uniform(0),
    // per-galaxy identity: where it sits in the universe, how it's oriented, its shape and palette
    center: uniform(new THREE.Vector3()), orient: uniform(new THREE.Matrix3()), fade: uniform(1),
    shape: uniform(0), arms: uniform(3), twist: uniform(1.75), size: uniform(1),
    c0: uniform(new THREE.Color(1.0, 0.82, 0.58)), c1: uniform(new THREE.Color(0.86, 0.42, 0.95)), c2: uniform(new THREE.Color(0.32, 0.52, 1.0)),
  };

  // ---------- init: a 3-arm spiral galaxy + a soft halo ----------
  const init = Fn(() => {
    const id = float(instanceIndex);
    const h1 = hash(id.mul(0.1031)), h2 = hash(id.mul(0.1030).add(7.1)), h3 = hash(id.mul(0.0973).add(3.3)), h4 = hash(id.mul(0.1099).add(1.7));
    const isHalo = hash(id.mul(0.31).add(9.9)).lessThan(0.12);
    const r = pow(h1, 0.7).mul(2.7).add(0.04);
    // spiral arms (shape 0), barred spiral (1): arms start at the ends of a central bar
    const isBar = u.shape.equal(1).and(r.lessThan(0.9));
    const arm = h2.mul(u.arms).floor();
    const ang = arm.mul(PI2.div(u.arms)).add(r.mul(u.twist)).add(h3.sub(0.5).mul(0.55).div(r.mul(0.6).add(0.4)));
    const scatter = h4.sub(0.5).mul(r.mul(0.22).add(0.05));
    const thick = h3.sub(0.5).mul(0.16).mul(exp(r.negate().mul(0.8))).add(h4.sub(0.5).mul(0.03));
    const spiral = vec3(cos(ang).mul(r).add(scatter), thick, sin(ang).mul(r).add(scatter.mul(0.7)));
    const bar = vec3(h1.sub(0.5).mul(1.9), thick, h4.sub(0.5).mul(0.28));
    // elliptical (2): a soft 3-D ellipsoid
    const er = pow(h1, 1.6).mul(2.4).add(0.03); const eth = h2.mul(PI2), eph = h3.mul(2).sub(1).acos();
    const ellip = vec3(sin(eph).mul(cos(eth)), cos(eph).mul(0.62), sin(eph).mul(sin(eth)).mul(0.85)).mul(er);
    // ring (3): a bright core plus a wide ring
    const inRing = h4.greaterThan(0.25);
    const rr0 = select(inRing, float(2.0).add(h3.sub(0.5).mul(0.55)), pow(h1, 2.0).mul(0.6));
    const ring = vec3(cos(h2.mul(PI2)).mul(rr0), thick.mul(0.6), sin(h2.mul(PI2)).mul(rr0));
    const disc = select(u.shape.equal(2), ellip, select(u.shape.equal(3), ring, select(isBar, bar, spiral)));
    const rad01 = select(u.shape.equal(2), er.div(2.4), select(u.shape.equal(3), rr0.div(2.3), r.div(2.7)));
    // halo: points on a fuzzy sphere
    const th = h2.mul(PI2), ph = h3.mul(2).sub(1).acos(), rr = pow(h1, 0.5).mul(3.2).add(0.6);
    const halo = vec3(sin(ph).mul(cos(th)), cos(ph).mul(0.6), sin(ph).mul(sin(th))).mul(rr);
    const p = select(isHalo, halo, disc).mul(u.size);
    home.element(instanceIndex).assign(vec4(p, select(isHalo, float(1.2), rad01)));
    pos.element(instanceIndex).assign(vec4(u.center.add(u.orient.mul(p.mul(3.0))), hash(id.mul(0.77))));
    vel.element(instanceIndex).assign(vec4(0));
  })().compute(count);

  // galaxy frame -> world: differential rotation around Y, then tilt toward the camera
  const toWorld = (p, r) => {
    const a = u.time.mul(u.spin).mul(0.16).div(r.mul(1.2).add(0.35));
    const ry = vec3(p.x.mul(cos(a)).sub(p.z.mul(sin(a))), p.y, p.x.mul(sin(a)).add(p.z.mul(cos(a))));
    return u.center.add(u.orient.mul(ry));
  };

  // ---------- update ----------
  const update = Fn(() => {
    const P = pos.element(instanceIndex), V = vel.element(instanceIndex), Hm = home.element(instanceIndex);
    const p = P.xyz, v = V.xyz;
    const target = toWorld(Hm.xyz, Hm.w);
    const grabAll = float(0).toVar();
    const force = vec3(0).toVar();
    for (const h of u.hands) {
      const d = h.pos.sub(p); const r2 = dot(d, d); const r = sqrt(r2).add(1e-3); const dn = d.div(r);
      const near = exp(r2.div(0.55).negate());            // ~0.75 radius
      const far = exp(r2.div(2.2).negate());              // ~1.5 radius
      const grab = h.pinch.add(h.fist.mul(1.3)).mul(h.active);
      grabAll.assign(max(grabAll, grab.mul(far)));
      force.addAssign(h.vel.mul(near).mul(3.4).mul(h.active));                                  // wind from a sweeping hand
      force.addAssign(cross(dn, vec3(0, 0, 1)).mul(near).mul(1.1).mul(h.active));               // gentle vortex around the hand
      force.addAssign(dn.mul(grab).mul(far).mul(19).mul(smoothstep(0.04, 0.32, r)));            // gather into a knot
      force.addAssign(cross(dn, normalize(vec3(0.3, 1, 0.2))).mul(grab).mul(far).mul(5));       // ...that swirls
      force.addAssign(dn.mul(h.burst).mul(exp(r2.div(6).negate())).mul(-42));                    // explode outward
      // star-trail spell: pointing pulls stars tightly onto the fingertip, leaving a comet tail
      force.addAssign(d.mul(h.point).mul(h.active).mul(exp(r2.div(1.6).negate())).mul(26));
      grabAll.assign(max(grabAll, h.point.mul(h.active).mul(exp(r2.div(1.6).negate()))));
    }
    // whole-hand colliders: every joint gently pushes stars aside so they wrap around the hand
    Loop({ start: int(0), end: int(42) }, ({ i }) => {
      const dj = p.sub(u.joints.element(i)); const r2j = dot(dj, dj);
      force.addAssign(dj.div(r2j.add(0.004)).mul(exp(r2j.div(0.035).negate())).mul(0.9));
    });
    // Big Bang: swirl into a singularity, then blast outward
    const db = u.bangPos.sub(p); const rb = length(db).add(1e-3);
    force.addAssign(db.div(rb).mul(u.implode).mul(30).mul(smoothstep(0.02, 0.4, rb)));
    force.addAssign(cross(db.div(rb), vec3(0, 0, 1)).mul(u.implode).mul(14).mul(exp(rb.negate())));
    force.addAssign(db.div(rb).mul(u.explode).mul(-70).mul(exp(rb.div(4).negate())));
    grabAll.assign(max(grabAll, u.implode));
    // gravity from the stars, planets and black holes you created; black holes swallow what crosses the horizon
    const captured = float(0).toVar();
    if (bodies) Loop({ start: int(0), end: int(bodies.array.length) }, ({ i }) => {
      const b = bodies.element(i); const m = b.w; const am = abs(m);
      const dbd = b.xyz.sub(p); const r2b = dot(dbd, dbd).add(0.02); const rbd = sqrt(r2b);
      const k = select(m.lessThan(0), float(2.4), float(0.22)); // black holes pull hard; stars and planets only nudge
      force.addAssign(clamp(dbd.mul(am.mul(k).div(r2b.mul(rbd))), -25, 25));
      grabAll.assign(max(grabAll, min(am.mul(exp(r2b.div(0.25).negate())).mul(0.6), 0.9).mul(select(m.lessThan(0), float(1), float(0.15)))));
      // black holes: stars spiral in as an accretion disk and vanish well outside the visible horizon (dark shadow)
      const isHole = select(m.lessThan(0), float(1), float(0));
      force.addAssign(cross(dbd.div(rbd), normalize(vec3(0, 1, 0.35))).mul(am.mul(1.4).div(r2b.add(0.05))).mul(isHole));
      If(m.lessThan(0).and(rbd.lessThan(pow(am, 0.3333).mul(0.3))), () => { captured.assign(1); });
    });
    const spring = float(1.5).mul(grabAll.oneMinus().mul(0.95).add(0.05));
    force.addAssign(target.sub(p).mul(spring));
    force.addAssign(mx_noise_vec3(p.mul(0.7).add(vec3(0, u.time.mul(0.07), 0))).mul(0.35));    // living drift
    const nv0 = v.add(force.mul(u.dt)).mul(exp(u.dt.mul(-2.6)));
    const nv = select(captured.greaterThan(0.5), vec3(0), nv0);
    const np = select(captured.greaterThan(0.5), target, p.add(nv0.mul(u.dt)));   // swallowed stars are recycled into their orbit
    const heat = mix(V.w, clamp(length(nv).mul(0.45), 0, 2), 0.15);
    V.assign(vec4(nv, heat));
    P.assign(vec4(np, P.w));
  });
  const compute = update().compute(count);

  // ---------- render ----------
  const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const P = pos.toAttribute(), V = vel.toAttribute(), Hm = home.toAttribute();
  mat.positionNode = P.xyz;
  const rad = Hm.w, heat = V.w;
  const core = vec3(u.c0), mid = vec3(u.c1), outer = vec3(u.c2), hot = vec3(1.0, 0.62, 0.28);
  const base = mix(mix(core, mid, smoothstep(0.0, 0.45, rad)), outer, smoothstep(0.4, 1.0, rad));
  const col = mix(base, hot, smoothstep(0.15, 1.1, heat)).mul(P.w.mul(0.7).add(0.5)).mul(heat.mul(0.9).add(1));
  mat.colorNode = vec4(col, 1);
  const soft = smoothstep(0.5, 0.0, length(uv().sub(0.5)));
  // particles right next to the camera fade out (no blurry blobs in close-ups)
  mat.opacityNode = soft.mul(u.alpha).mul(u.fade).mul(smoothstep(u.nearFade.x, u.nearFade.y, distance(P.xyz, cameraPosition))).mul(select(rad.greaterThan(1.1), float(0.35), float(1)));
  mat.scaleNode = float(0.013).mul(P.w.mul(0.8).add(0.5)).mul(heat.mul(0.5).add(1));
  const sprite = new THREE.Sprite(mat);
  sprite.count = count; sprite.frustumCulled = false;
  return { sprite, init, compute, u };
}
