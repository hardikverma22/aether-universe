// Real spacecraft (NASA 3D Resources glTF models) placed where they really are, plus
// an asteroid belt of light instanced rocks. Spacecraft are enlarged so they can be seen at all; their labels say so.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { poleToScene, AU, kmToScene } from './ephem.js';
import { mulberry32 } from './universe.js';

const draco = new DRACOLoader().setDecoderPath('/draco/');
const loader = new GLTFLoader().setDRACOLoader(draco);
const load = (url) => new Promise((res, rej) => loader.load(url, (g) => res(g.scene), undefined, rej));

/** fit a model so its longest side is `size` scene units, centred on its origin */
function fit(obj, size) {
  const box = new THREE.Box3().setFromObject(obj), s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const inner = new THREE.Group(); obj.position.sub(c); inner.add(obj);
  inner.scale.setScalar(size / Math.max(s.x, s.y, s.z)); const outer = new THREE.Group(); outer.add(inner); return outer;
}

// name, model, size, what it is, how it moves (relative to its host)
export const CRAFT = [
  { name: 'ISS', file: 'iss.glb', size: 0.03, host: 'Earth', orbit: 1.09, period: 24, incl: 0.9, fact: 'International Space Station · 400 km up, 16 sunrises a day · shown enlarged' },
  { name: 'Hubble', file: 'hubble.glb', size: 0.026, host: 'Earth', orbit: 1.14, period: 28, incl: 0.5, phase: 2.2, fact: 'Hubble Space Telescope · in orbit since 1990 · shown enlarged' },
  { name: 'James Webb', file: 'jwst.glb', size: 0.05, host: 'Earth', l2: 1.15, fact: 'James Webb Space Telescope · 1.5 million km beyond Earth, at the L2 point · shown enlarged' },
  { name: 'Juno', file: 'juno.glb', size: 0.05, host: 'Jupiter', orbit: 1.5, period: 70, polar: true, fact: 'Juno · arrived at Jupiter in 2016 · shown enlarged' },
  { name: 'Cassini', file: 'cassini.glb', size: 0.06, host: 'Saturn', orbit: 2.7, period: 90, incl: 0.3, fact: 'Cassini · explored Saturn from 2004 to 2017 · shown enlarged' },
  { name: 'Voyager 1', file: 'voyager.glb', size: 0.12, far: [258.75, 12.1], dist: 21, fact: 'Voyager 1 · the farthest human-made object, in interstellar space since 2012 · shown enlarged' },
];

export function makeCraft(root) {
  const group = new THREE.Group(); root.add(group);
  // the spacecraft and asteroids use standard PBR materials, lit by the Sun
  const sunLight = new THREE.PointLight(0xfff4e6, 3.2, 0, 0); group.add(sunLight);
  group.add(new THREE.HemisphereLight(0x8899bb, 0x050507, 0.08));
  const items = CRAFT.map((c) => ({ ...c, def: { kind: 'Spacecraft', craft: true }, radius: c.size * 0.6, pos: new THREE.Vector3(), group: null }));
  items.forEach((it) => load('/models/' + it.file).then((obj) => {
    obj.traverse((m) => { if (m.isMesh && m.material) m.material.side = THREE.DoubleSide; });
    it.group = fit(obj, it.size); group.add(it.group);
  }).catch((e) => console.warn('model', it.file, e)));

  // asteroid belt between Mars and Jupiter: one light, lumpy rock shape (42 points), instanced; rocks are only a few pixels wide
  const rockGeo = new THREE.IcosahedronGeometry(1, 1); {
    const P = rockGeo.attributes.position, v3 = new THREE.Vector3(), r = mulberry32(3);
    const bumps = Array.from({ length: 6 }, () => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
    for (let i = 0; i < P.count; i++) { v3.fromBufferAttribute(P, i); let k = 1; for (const b of bumps) k -= Math.max(0, v3.dot(b)) * 0.18; v3.multiplyScalar(k); P.setXYZ(i, v3.x, v3.y, v3.z); }
    rockGeo.computeVertexNormals();
  }
  const rockMat = new THREE.MeshStandardNodeMaterial({ color: 0x8a8178, roughness: 0.95, metalness: 0, flatShading: true });
  const N = 900, rnd = mulberry32(7); const belt = new THREE.InstancedMesh(rockGeo, rockMat, N);
  { const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const r = 5.55 + (rnd() + rnd() + rnd()) / 3 * 0.9, a = rnd() * Math.PI * 2, y = (rnd() - 0.5) * 0.28 * (r / 6);
      p.set(Math.cos(a) * r, y, Math.sin(a) * r); q.setFromEuler(e.set(rnd() * 6, rnd() * 6, rnd() * 6));
      const k = 0.0025 + Math.pow(rnd(), 4) * 0.011; s.set(k, k * (0.7 + rnd() * 0.5), k);
      belt.setMatrixAt(i, m4.compose(p, q, s));
    }
    belt.computeBoundingSphere(); }
  group.add(belt);

  const v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function update(dt, t, bodiesByName, k = 0, camera = null, focus = null) {
    const geo = (a, b) => a * Math.pow(b / a, k);
    for (const it of items) {
      let size = 1;
      if (it.far) { const d = geo(it.dist, 163 * AU); it.pos.copy(poleToScene(...it.far)).multiplyScalar(d); size = d / it.dist; }
      else {
        const host = bodiesByName[it.host]; if (!host) continue; size = host.radius / host.r0;   // keep the same size relative to its planet
        if (it.l2) { v.copy(host.pos).normalize().multiplyScalar(geo(it.l2, kmToScene(1.5e6))); it.pos.copy(host.pos).add(v); }
        else {
          const a = (it.phase || 0) + t * (2 * Math.PI / it.period), r = host.radius * it.orbit;
          if (it.polar) v.set(Math.cos(a) * r, Math.sin(a) * r, 0); else v.set(Math.cos(a) * r, Math.sin(a) * r * Math.sin(it.incl), Math.sin(a) * r * Math.cos(it.incl));
          it.pos.copy(host.pos).add(v);
        }
      }
      it.radius = it.size * 0.6 * size;
      if (it.group) {
        it.group.position.copy(it.pos); it.group.scale.setScalar(size); it.group.rotation.y += dt * 0.15;
        // skip drawing a spacecraft smaller than a pixel (most of the time): it costs as much as a visible one
        const px = camera ? (it.size * size / camera.position.distanceTo(it.pos)) * innerHeight : 99;
        it.group.visible = px > 0.6 || focus === it;
      }
    }
    belt.rotation.y -= dt * 0.004; belt.scale.setScalar(geo(1, 2.7 * AU / 6)); belt.visible = !lite;
  }
  let lite = false;
  return { group, items, update, setVisible(on) { group.visible = on; }, setLite(on) { lite = on; } };
}
