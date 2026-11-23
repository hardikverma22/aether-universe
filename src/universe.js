// The universe: a seeded cosmic web of procedural galaxies (instanced impostors), filament dust and far stars.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, uv, cameraPosition, distance, length, atan, cos, exp, smoothstep, mix, clamp, abs, pow, select, instancedBufferAttribute, hash, uniformArray, int,
} from 'three/tsl';

export const PALETTES = {
  Classic: ['#ffd194', '#db6bf2', '#5285ff'],
  Ember: ['#fff0b3', '#ff8a2b', '#c4162a'],
  Ice: ['#f2fbff', '#6fe3ff', '#2442d9'],
  Synthwave: ['#ffd6f5', '#ff2fb4', '#2ee6ff'],
  Aurora: ['#e9ffb3', '#2fe0b0', '#7a3cff'],
  Gold: ['#fff6dc', '#ffc247', '#a8572a'],
};
export const SHAPES = ['Spiral', 'Barred spiral', 'Elliptical', 'Ring'];

const SYL = ['Ae', 'Vel', 'Ora', 'Thal', 'Nyx', 'Lum', 'Ser', 'Cass', 'Ith', 'Zir', 'Eon', 'Kae', 'Myr', 'Sol', 'Ves', 'Tau', 'Ori', 'Lyr', 'Cyg', 'Pho'];
const END = ['ara', 'is', 'eon', 'ia', 'or', 'ix', 'una', 'eth', 'os', 'ae'];

export function mulberry32(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function makeUniverse({ seed = 7, galaxies: N = 110, dust = 150000 } = {}) {
  const rnd = mulberry32(seed);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const R = 300;

  // ---- cosmic web skeleton: cluster nodes joined to their nearest neighbours by filaments ----
  const nodes = Array.from({ length: 16 }, () => new THREE.Vector3((rnd() * 2 - 1) * R, (rnd() * 2 - 1) * R * 0.55, (rnd() * 2 - 1) * R));
  const edges = [];
  nodes.forEach((a, i) => {
    nodes.map((b, j) => [j, a.distanceTo(b)]).filter(([j]) => j !== i).sort((x, y) => x[1] - y[1]).slice(0, 3)
      .forEach(([j]) => { if (!edges.some(([p, q]) => (p === j && q === i))) edges.push([i, j]); });
  });
  const onFilament = (scatter) => { const [i, j] = edges[Math.floor(rnd() * edges.length)]; const t = rnd();
    return nodes[i].clone().lerp(nodes[j], t).add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(scatter)); };
  const nearCluster = (scatter) => nodes[Math.floor(rnd() * nodes.length)].clone().add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(scatter));

  // ---- galaxy catalogue ----
  const palNames = Object.keys(PALETTES);
  const shapeOf = () => { const x = rnd(); return x < 0.45 ? 0 : x < 0.7 ? 1 : x < 0.88 ? 2 : 3; };
  const list = [];
  for (let k = 0; k < N; k++) {
    let p; let tries = 0;
    do { p = rnd() < 0.55 ? nearCluster(22) : onFilament(10); tries++; } while (tries < 20 && list.some((g) => g.pos.distanceTo(p) < 14));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI * 2, rnd() * Math.PI));
    const shape = k === 0 ? 0 : shapeOf();
    list.push({
      id: k, pos: k === 0 ? new THREE.Vector3(0, 0, 0) : p, quat: k === 0 ? new THREE.Quaternion() : q,
      shape, arms: shape === 1 ? 2 : 2 + Math.floor(rnd() * 4), twist: 1.2 + rnd() * 1.5, size: 0.85 + rnd() * 0.45,
      palette: k === 0 ? 'Classic' : palNames[Math.floor(rnd() * palNames.length)],
      name: SYL[Math.floor(rnd() * SYL.length)] + END[Math.floor(rnd() * END.length)] + ' ' + (100 + Math.floor(rnd() * 900)),
    });
  }
  list[0].name = 'Aether Prime';
  // every galaxy holds a few visitable star systems, placed in its disc (galaxy frame); Aether Prime holds Sol
  const SYS = ['Kep', 'Tra', 'Gli', 'Wol', 'Ros', 'Lal', 'Hel', 'Ara', 'Vel', 'Ori', 'Zeta', 'Nyx'];
  list.forEach((g) => {
    const n = 3 + Math.floor(rnd() * 3); g.systems = [];
    for (let i = 0; i < n; i++) {
      const r = 0.9 + rnd() * 1.6, a = rnd() * Math.PI * 2;
      g.systems.push({ name: SYS[Math.floor(rnd() * SYS.length)] + 'ler-' + (10 + Math.floor(rnd() * 990)), local: new THREE.Vector3(Math.cos(a) * r * g.size, (rnd() - 0.5) * 0.08, Math.sin(a) * r * g.size), seed: Math.floor(rnd() * 1e9) });
    }
  });
  list[0].systems[0] = { name: 'Sol', real: true, local: new THREE.Vector3(1.7, 0.02, 0.6), seed: 1 };

  const group = new THREE.Group();

  // ---- impostors: one instanced plane per galaxy, procedural shader per instance ----
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2); geo.deleteAttribute('normal'); // disc in XZ, normal +Y (matches the sim frame)
  const aParams = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); // shape, arms, twist, palette index
  // palettes live in one uniform table (keeps us under WebGPU's 8 vertex-buffer limit)
  const palColors = palNames.flatMap((n) => PALETTES[n].map((hex) => new THREE.Color(hex)));
  const palTable = uniformArray(palColors, 'color');
  const aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(N).fill(1), 1); aAlpha.setUsage(THREE.DynamicDrawUsage);
  const mesh = new THREE.InstancedMesh(geo, null, N);
  const m4 = new THREE.Matrix4();
  list.forEach((g, i) => {
    const s = 2 * 3.6 * g.size;
    m4.compose(g.pos, g.quat, new THREE.Vector3(s, s, s)); mesh.setMatrixAt(i, m4);
    aParams.setXYZW(i, g.shape, g.arms, g.twist, palNames.indexOf(g.palette));
  });
  const P = instancedBufferAttribute(aParams), A = instancedBufferAttribute(aAlpha);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const shade = Fn(() => {
    const q = uv().sub(0.5).mul(2); const rr = length(q); const Rg = rr.mul(3.6); const th = atan(q.y, q.x);
    const shape = P.x, arms = P.y, twist = P.z;
    const armWave = pow(cos(th.sub(Rg.mul(twist)).mul(arms)).mul(0.5).add(0.5), 3.0);
    const discFall = exp(Rg.mul(-1.15));
    const spiral = discFall.mul(armWave.mul(0.85).add(0.15));
    const bar = exp(q.y.mul(q.y).mul(-260)).mul(smoothstep(0.32, 0.18, abs(q.x))).mul(1.2);
    const ellip = exp(Rg.mul(Rg).mul(-0.55)).mul(1.4);
    const ring = exp(Rg.sub(2.0).pow(2).mul(-9)).mul(0.9);
    const core = exp(Rg.mul(Rg).mul(-6)).mul(2.2);
    const dens = select(shape.equal(2), ellip, select(shape.equal(3), ring.add(core.mul(0.6)), select(shape.equal(1), spiral.add(bar), spiral).add(core)));
    const pi = int(P.w).mul(3);
    const C0 = vec3(palTable.element(pi)), C1 = vec3(palTable.element(pi.add(1))), C2 = vec3(palTable.element(pi.add(2)));
    const grain = hash(uv().mul(431.7)).mul(0.35).add(0.75);
    const c = mix(mix(C0, C1, smoothstep(0.0, 1.4, Rg)), C2, smoothstep(1.0, 3.0, Rg));
    const edge = smoothstep(1.0, 0.82, rr);
    return vec4(c.mul(dens).mul(grain).mul(1.25), clamp(dens, 0, 1).mul(edge).mul(A));
  })();
  mat.colorNode = shade.rgb; mat.opacityNode = shade.a;
  mesh.material = mat; mesh.frustumCulled = false;
  group.add(mesh);

  // ---- filament dust + cluster haze (static instanced sprites) ----
  const dPos = new THREE.InstancedBufferAttribute(new Float32Array(dust * 4), 4);
  for (let i = 0; i < dust; i++) {
    const p = rnd() < 0.7 ? onFilament(7 + rnd() * 6) : nearCluster(30);
    dPos.setXYZW(i, p.x, p.y, p.z, rnd());
  }
  const DP = instancedBufferAttribute(dPos);
  const dMat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  dMat.positionNode = DP.xyz;
  dMat.colorNode = vec4(mix(vec3(0.35, 0.42, 1.0), vec3(0.85, 0.5, 1.0), DP.w), 1);
  dMat.opacityNode = smoothstep(0.5, 0.0, length(uv().sub(0.5))).mul(0.16).mul(smoothstep(12, 60, distance(DP.xyz, cameraPosition))); // fade near the camera
  dMat.scaleNode = float(0.55).mul(DP.w.add(0.5));
  const dustSprite = new THREE.Sprite(dMat); dustSprite.count = dust; dustSprite.frustumCulled = false;
  group.add(dustSprite);

  // ---- far starfield shell ----
  const FS = 7000; const fPos = new THREE.InstancedBufferAttribute(new Float32Array(FS * 4), 4);
  for (let i = 0; i < FS; i++) { const v = new THREE.Vector3(gauss(), gauss(), gauss()).normalize().multiplyScalar(1600 + rnd() * 900); fPos.setXYZW(i, v.x, v.y, v.z, rnd()); }
  const FP = instancedBufferAttribute(fPos);
  const fMat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  fMat.positionNode = FP.xyz; fMat.colorNode = vec4(mix(vec3(0.7, 0.8, 1), vec3(1, 0.85, 0.7), FP.w), 1);
  fMat.opacityNode = smoothstep(0.5, 0.0, length(uv().sub(0.5))).mul(FP.w.mul(0.6).add(0.2));
  fMat.scaleNode = float(3.2).mul(FP.w.add(0.4));
  const far = new THREE.Sprite(fMat); far.count = FS; far.frustumCulled = false;
  group.add(far);

  return {
    group, list, nodes, edges,
    setAlpha(i, a) { aAlpha.setX(i, a); aAlpha.needsUpdate = true; },
  };
}
