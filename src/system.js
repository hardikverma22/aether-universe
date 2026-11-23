// Star-system level: our real Solar System (NASA-based Solar System Scope textures, CC BY 4.0) or a procedural
// exoplanet system built from the same real surfaces (tinted). Kinematic Keplerian orbits; distances and sizes are
// compressed so everything is visible at once, but order, relative sizes, tilts and colours follow reality.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, uniform, texture, uv, length, normalize, dot, max, mix, smoothstep, pow, abs, atan, exp, clamp,
  time, positionLocal, positionWorld, cameraPosition, mx_noise_float, select, sin, cross, modelWorldMatrix,
} from 'three/tsl';
import { REAL, poleToScene, planetPos, moonOffset, orbitPath, earthSpin, AU, trueRadius, MOON_DIST, sunDistance } from './ephem.js';
import { makeCraft } from './craft.js';
import { blackbody, makePlanetLook } from './looks.js';
import { mulberry32 } from './universe.js';

const loader = new THREE.TextureLoader();
const cache = new Map();
export function tex(name, srgb = true) {
  if (!cache.has(name)) {
    const t = loader.load(`/textures/${name}`); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
    cache.set(name, t);
  }
  return cache.get(name);
}

const SPHERE = new THREE.SphereGeometry(1, 128, 64);
const EARTH_YEAR = 70; // seconds for one Earth orbit
export const SUN_MASS = Math.pow((2 * Math.PI / EARTH_YEAR) * 3.9, 2) * 3.9; // so created planets orbit at matching speeds

// ---------------------------------------------------------------- our Solar System (compressed scale)
export const SOL = {
  name: 'Sol', real: true, star: { temp: 5778, radius: 1.0, texture: '4k_sun.jpg' },
  planets: [
    { name: 'Mercury', map: '4k_mercury.jpg', r: 0.12, orbit: 2.2, airless: true },
    { name: 'Venus', map: '4k_venus_atmosphere.jpg', r: 0.22, orbit: 3.0, atmo: [1.0, 0.82, 0.5, 0.7] },
    { name: 'Earth', map: '8k_earth_daymap.jpg', r: 0.24, orbit: 3.9, earth: true, normal: '4k_earth_normal_map.jpg', atmo: [0.35, 0.6, 1.0, 1.0],
      moons: [{ name: 'Moon', map: '4k_moon.jpg', height: 'moon_height_4k.jpg', r: 0.065, orbit: 0.55, airless: true }] },
    { name: 'Mars', map: '4k_mars.jpg', r: 0.16, orbit: 4.9, atmo: [1.0, 0.55, 0.35, 0.35] },
    { name: 'Jupiter', map: '4k_jupiter.jpg', r: 0.62, orbit: 7.2, atmo: [0.95, 0.85, 0.7, 0.3] },
    { name: 'Saturn', map: '4k_saturn.jpg', r: 0.52, orbit: 9.6, rings: '8k_saturn_ring_alpha.png', atmo: [0.98, 0.9, 0.7, 0.25] },
    { name: 'Uranus', map: '2k_uranus.jpg', r: 0.36, orbit: 12.0, atmo: [0.6, 0.9, 0.95, 0.45] },
    { name: 'Neptune', map: '2k_neptune.jpg', r: 0.35, orbit: 14.2, atmo: [0.35, 0.55, 1.0, 0.5] },
  ],
};
export const PLANET_FACTS = {
  Mercury: 'Smallest planet · no atmosphere · 430 °C days, −180 °C nights',
  Venus: 'Thick sulphuric clouds · hottest planet at 465 °C · spins backwards',
  Earth: 'Oceans, life and city lights · one Moon',
  Mars: 'Red iron-oxide dust · polar ice caps · Olympus Mons',
  Jupiter: 'Largest planet · the Great Red Spot is a storm wider than Earth',
  Saturn: 'Rings of ice and rock · lighter than water',
  Uranus: 'Ice giant tipped on its side (98° tilt)',
  Neptune: 'Supersonic winds · deep methane blue',
  Moon: 'Earth\'s only natural satellite · tidally locked',
};

// ---------------------------------------------------------------- procedural exoplanet systems (real surfaces, tinted)
const SURFACES = [
  { map: '2k_earth_daymap.jpg', earth: true, atmo: [0.35, 0.6, 1.0, 1.0], kind: 'Ocean world' },
  { map: '2k_mars.jpg', atmo: [1.0, 0.55, 0.35, 0.35], kind: 'Desert world' },
  { map: '2k_venus_atmosphere.jpg', atmo: [1.0, 0.82, 0.5, 0.7], kind: 'Cloud world' },
  { map: '2k_mercury.jpg', kind: 'Rocky world' }, { map: '2k_moon.jpg', kind: 'Cratered world' },
  { map: '2k_jupiter.jpg', gas: true, atmo: [0.95, 0.85, 0.7, 0.3], kind: 'Gas giant' },
  { map: '2k_saturn.jpg', gas: true, rings: true, atmo: [0.98, 0.9, 0.7, 0.25], kind: 'Ringed giant' },
  { map: '2k_neptune.jpg', gas: true, atmo: [0.35, 0.55, 1.0, 0.5], kind: 'Ice giant' },
  { lava: true, kind: 'Lava world' },
];
const SYL = ['Kep', 'Tra', 'Gli', 'Wol', 'Ros', 'Lal', 'Hel', 'Tau', 'Ara', 'Vel'];
export function makeExoSystem(seed, name) {
  const rnd = mulberry32(seed);
  const temp = [3300, 4200, 5200, 5800, 6600, 8500][Math.floor(rnd() * 6)];
  const n = 3 + Math.floor(rnd() * 4); let orbit = 2.0 + rnd() * 0.6; const planets = [];
  // rocky worlds close in, giants further out; shuffled decks so a system never repeats the same kind of world
  const shuffle = (arr) => arr.map((v) => [rnd(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const rocky = shuffle(SURFACES.filter((s) => !s.gas)), giants = shuffle(SURFACES.filter((s) => s.gas));
  for (let i = 0; i < n; i++) {
    const outer = i >= n / 2;
    const s = outer ? giants.shift() || rocky.shift() : rocky.shift() || giants.shift();
    const tint = new THREE.Color().setHSL(rnd(), 0.35 * rnd(), 0.5);
    planets.push({ ...s, name: `${name} ${String.fromCharCode(98 + i)}`, r: s.gas ? 0.4 + rnd() * 0.3 : 0.12 + rnd() * 0.14, orbit, tilt: rnd() * 0.6, spin: 0.5 + rnd() * 2,
      tint: s.earth ? null : [0.75 + tint.r * 0.5, 0.75 + tint.g * 0.5, 0.75 + tint.b * 0.5], phase: rnd() * Math.PI * 2 });
    orbit *= 1.35 + rnd() * 0.25;
  }
  return { name, star: { temp, radius: temp > 7000 ? 1.25 : temp < 4000 ? 0.7 : 1.0 }, planets };
}
export const exoName = (rnd) => SYL[Math.floor(rnd() * SYL.length)] + 'ler-' + (10 + Math.floor(rnd() * 990));

/** start downloading our Solar System's textures in the background, so they're ready when you visit */
export function prefetchSol() {
  const maps = [SOL.star.texture, ...SOL.planets.flatMap((p) => [p.map, p.normal, p.height, typeof p.rings === 'string' ? p.rings : null, ...(p.moons || []).flatMap((m) => [m.map, m.height])]),
    '8k_earth_clouds.jpg', '4k_earth_nightmap.jpg', '4k_earth_specular_map.jpg'].filter(Boolean);
  maps.forEach((m, i) => setTimeout(() => tex(m, !/normal|height|specular/.test(m)), i * 120));
}
// ---------------------------------------------------------------- materials
function sunMesh(def) {
  const col = uniform(blackbody(def.temp));
  const m = new THREE.MeshBasicNodeMaterial();
  const V = normalize(cameraPosition.sub(positionWorld)); const N = normalize(positionWorld);
  const mu = clamp(dot(N, V), 0, 1);
  const wob = vec2(mx_noise_float(positionLocal.mul(3).add(time.mul(0.05))), mx_noise_float(positionLocal.mul(3).add(7.3).add(time.mul(0.05)))).mul(0.004);
  const surf = def.texture ? texture(tex(def.texture), uv().add(wob)).rgb : vec3(1);
  const gray = surf.dot(vec3(0.3, 0.5, 0.2));
  const boil = mx_noise_float(positionLocal.mul(40).add(time.mul(0.25))).mul(0.06).add(1);
  const limb = float(1).sub(float(0.6).mul(float(1).sub(mu)));
  const tint = mix(vec3(1.0, 0.55, 0.3), vec3(1), pow(mu, 0.5));
  m.colorNode = vec3(col).mul(gray.mul(1.3).add(0.25)).mul(tint).mul(limb).mul(boil).mul(1.25);
  const mesh = new THREE.Mesh(SPHERE, m); mesh.scale.setScalar(def.radius);
  // corona + soft glare
  const cm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const q = uv().sub(0.5).mul(2); const d = length(q); const a = atan(q.y, q.x);
  const rays = mx_noise_float(vec2(a.mul(9), time.mul(0.04))).mul(0.5).add(0.5).mul(mx_noise_float(vec2(a.mul(23), 3.1)).mul(0.5).add(0.5));
  const glow = exp(max(d.sub(0.22), 0).mul(-6)).mul(smoothstep(0.2, 0.235, d)).mul(rays.mul(0.9).add(0.25)).add(exp(d.mul(-4.5)).mul(0.22));
  cm.colorNode = vec4(vec3(col).mul(1.2), 1); cm.opacityNode = glow.mul(smoothstep(1.0, 0.7, d)).mul(0.5);
  const corona = new THREE.Sprite(cm); corona.scale.setScalar(def.radius * 7);
  const g = new THREE.Group(); g.add(mesh, corona);
  return { group: g, color: blackbody(def.temp) };
}

// realistic lit planet: sun at the system origin. Surface detail from normal or height maps (tangent frame built from
// the sphere itself), lunar-Lambert shading for airless worlds, Earth's night lights, ocean glint, clouds and their
// shadows, Saturn's ring shadow on the planet and the planet's shadow on the rings.
const RING_IN = 1.24, RING_OUT = 2.27;
function planetMesh(p, sunColor) {
  const center = uniform(new THREE.Vector3());
  const L = normalize(positionWorld.negate()); const V = normalize(cameraPosition.sub(positionWorld));
  const toW = (v) => normalize(modelWorldMatrix.mul(vec4(v, 0)).xyz);
  const Nl = normalize(positionLocal); const Tl = normalize(vec3(Nl.z, 0, Nl.x.negate()).add(vec3(1e-5, 0, 0))); const Bl = cross(Nl, Tl);
  const N = toW(Nl), T = toW(Tl), B = toW(Bl);
  const NdL = dot(N, L); const day = smoothstep(-0.06, 0.22, NdL);
  const sun = uniform(sunColor.clone());
  const group = new THREE.Group(); const spinner = new THREE.Group(); group.add(spinner);
  const ringAxis = uniform(new THREE.Vector3(0, 1, 0)); const radU = uniform(p.r);   // current world radius (changes with true scale)
  let core;
  if (p.lava) {
    const fake = { pos: new THREE.Vector3(), radius: 1 };
    const look = makePlanetLook(fake, 'lava'); core = look.core; look.u.lightPos.value.set(0, 0, 0);
    p._look = look; p._fake = fake;
  } else {
    const m = new THREE.MeshBasicNodeMaterial();
    let alb = texture(tex(p.map), uv()).rgb;
    if (p.tint) alb = alb.mul(vec3(...p.tint));
    // surface normal: from a tangent-space normal map, or from a height map's slope
    let Ns = N;
    if (p.normal) {
      const n = texture(tex(p.normal, false), uv()).rgb.mul(2).sub(1);
      Ns = normalize(T.mul(n.x.mul(1.6)).add(B.mul(n.y.mul(1.6))).add(N.mul(n.z)));
    } else if (p.height) {
      const ht = tex(p.height, false), e = 1 / 4096;
      const h0 = texture(ht, uv()).r, hx = texture(ht, uv().add(vec2(e, 0))).r, hy = texture(ht, uv().add(vec2(0, e))).r;
      Ns = normalize(N.sub(T.mul(hx.sub(h0).mul(55))).sub(B.mul(hy.sub(h0).mul(55))));
    }
    const mu0 = max(dot(Ns, L), 0), mu = max(dot(N, V), 0.05);
    // airless bodies (Moon, Mercury) don't darken toward the limb: lunar-Lambert; others: Lambert with a soft terminator
    const shade = p.airless ? mu0.mul(2).div(mu0.add(mu)).mul(smoothstep(-0.02, 0.08, NdL)) : mix(mu0, day, 0.35).mul(smoothstep(-0.06, 0.1, NdL));
    let lightAmt = shade;
    if (p.earth) { // cloud shadows: sample the clouds a little toward the sun
      const off = vec2(dot(L, T), dot(L, B)).mul(0.0025);
      const cs = texture(tex('8k_earth_clouds.jpg'), uv().add(off).add(vec2(time.mul(0.002), 0))).r;
      lightAmt = lightAmt.mul(float(1).sub(smoothstep(0.2, 0.9, cs).mul(0.45)));
    }
    if (p.rings) { // the rings' shadow across the planet
      const P0 = positionWorld.sub(center); const t = dot(P0, ringAxis).negate().div(dot(L, ringAxis));
      const hit = P0.add(L.mul(t)); const d = length(hit).div(radU).sub(RING_IN).div(RING_OUT - RING_IN);
      const ra = texture(tex(p.rings), vec2(clamp(d, 0.001, 0.999), 0.5)).a;
      const inRing = t.greaterThan(0).and(d.greaterThan(0)).and(d.lessThan(1));
      lightAmt = lightAmt.mul(select(inRing, float(1).sub(ra.mul(0.8)), float(1)));
    }
    let col = alb.mul(vec3(sun)).mul(lightAmt.mul(1.15).add(0.006));
    if (p.earth) {
      const spec = texture(tex('4k_earth_specular_map.jpg', false), uv()).r;
      const H = normalize(L.add(V)); const glint = pow(max(dot(N, H), 0), 260).mul(spec).mul(day).mul(0.9).add(pow(max(dot(N, H), 0), 30).mul(spec).mul(day).mul(0.06));
      const night = texture(tex('4k_earth_nightmap.jpg'), uv()).rgb.mul(smoothstep(0.08, -0.18, NdL)).mul(1.8);
      const dusk = smoothstep(0.3, 0.0, abs(NdL)).mul(day).mul(0.35);
      col = col.mul(mix(vec3(1), vec3(1.0, 0.62, 0.42), dusk)).add(vec3(sun).mul(glint)).add(night.mul(vec3(1.0, 0.82, 0.55)));
    }
    m.colorNode = col;
    core = new THREE.Mesh(SPHERE, m);
    if (p.earth) {
      const cm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
      const c = texture(tex('8k_earth_clouds.jpg'), uv().add(vec2(time.mul(0.002), 0))).r;
      cm.colorNode = vec3(sun).mul(day.mul(1.08).add(0.004)).mul(mix(vec3(1.0, 0.7, 0.5), vec3(1), smoothstep(0.0, 0.3, NdL)));
      cm.opacityNode = smoothstep(0.12, 0.8, c).mul(0.95);
      const clouds = new THREE.Mesh(SPHERE, cm); clouds.scale.setScalar(1.006); core.add(clouds);
    }
  }
  core.scale.setScalar(p.r); spinner.add(core);
  if (p.atmo) {
    const [r, g, b, s] = p.atmo; const ac = vec3(r, g, b);
    const am = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
    const rim = pow(float(1).sub(abs(dot(N, V))), 2.4); const lit = smoothstep(-0.25, 0.45, NdL);
    am.colorNode = mix(vec3(1.0, 0.45, 0.2), ac, smoothstep(0.0, 0.35, NdL)).mul(vec3(sun)); am.opacityNode = rim.mul(lit).mul(s).mul(0.8);
    const atmo = new THREE.Mesh(SPHERE, am); atmo.scale.setScalar(p.r * 1.025); spinner.add(atmo);
    const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    fm.colorNode = ac.mul(vec3(sun)); fm.opacityNode = pow(float(1).sub(max(dot(N, V), 0)), 3).mul(day).mul(s).mul(0.8);
    const fres = new THREE.Mesh(SPHERE, fm); fres.scale.setScalar(p.r * 1.003); spinner.add(fres);
  }
  if (p.rings) {
    const inner = p.r * RING_IN, outer = p.r * RING_OUT;
    const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const t = length(positionLocal.xy).sub(inner).div(outer - inner);
    const ringTex = texture(tex(typeof p.rings === 'string' ? p.rings : '2k_saturn_ring_alpha.png'), vec2(clamp(t, 0.001, 0.999), 0.5));
    // planet's shadow on the rings
    const toC = center.sub(positionWorld); const tt = dot(toC, L); const closest = length(toC.sub(L.mul(tt)));
    const shadow = select(tt.greaterThan(0).and(closest.lessThan(radU)), float(0.03), float(1));
    // lit face vs unlit face: from the dark side you only see light scattered through the thinner parts
    const litFace = dot(ringAxis, L).mul(dot(ringAxis, V)).greaterThan(0);
    const through = float(1).sub(ringTex.a).mul(0.9).add(0.08);
    const bright = select(litFace, float(1.05), through.mul(0.6));
    rm.colorNode = ringTex.rgb.mul(vec3(sun)).mul(shadow).mul(bright); rm.opacityNode = ringTex.a.mul(0.97);
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 256, 1), rm); ring.rotation.x = -Math.PI / 2;
    group.add(ring);
  }
  group.rotation.z = p.tilt || 0;   // procedural worlds: a simple axial tilt (real worlds get their true pole in the view)
  return { group, spinner, center, ringAxis, radU };
}

// ---------------------------------------------------------------- the view
export function makeSystemView(scene, camera, focusRef = { current: null }) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  // Milky Way sky (we're inside a galaxy now)
  const sm = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  sm.colorNode = texture(tex('8k_stars_milky_way.jpg'), uv()).rgb.mul(0.55);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 64, 32), sm); sky.renderOrder = -2;
  root.add(sky);
  let objs = [], sun = null, def = null, t0 = 0;
  const craft = makeCraft(root); craft.setVisible(false); const byName = {};
  // the clock for our real Solar System: starts at this moment; `speed` = simulated days per real second (0 = live, real time)
  const clock = { date: new Date(), speed: 1, live: false };
  // 0 = compact (everything visible at once), 1 = true scale (real sizes and distances, 1 AU = AU scene units); blended geometrically
  const scale = { k: 0 }; const geo = (a, b) => a * Math.pow(b / a, scale.k); let sunR = 1;
  const UP = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), qs = new THREE.Quaternion(), v = new THREE.Vector3();

  // free everything a system built (materials compile GPU pipelines; the shared sphere and cached textures are kept)
  function dispose(obj) { obj.traverse((m) => { if (m.geometry && m.geometry !== SPHERE) m.geometry.dispose(); const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []; mats.forEach((x) => x.dispose()); }); }
  function clear() {
    objs.forEach((o) => { root.remove(o.group); dispose(o.group); root.remove(o.orbitLine); dispose(o.orbitLine); o.moons.forEach((m) => { root.remove(m.group); dispose(m.group); }); });
    if (sun) { root.remove(sun.group); dispose(sun.group); } objs = []; sun = null;
  }
  function load(d) {
    clear(); def = d; t0 = performance.now() / 1000; clock.date = new Date(); craft.setVisible(!!d.real); sunR = d.star.radius; if (!d.real) scale.k = 0;
    sun = sunMesh(d.star); root.add(sun.group);
    if (d.real) sun.group.children[0].quaternion.setFromUnitVectors(UP, poleToScene(...REAL.Sun.pole));
    d.planets.forEach((p, i) => {
      const pm = planetMesh(p, sun.color);
      const o = { def: p, name: p.name, group: pm.group, spinner: pm.spinner, center: pm.center, ringAxis: pm.ringAxis, radU: pm.radU, r0: p.r, radius: p.r, pos: new THREE.Vector3(), phase: p.phase ?? i * 2.4, moons: [] };
      if (d.real) { o.real = REAL[p.name]; o.pole = poleToScene(...o.real.pole); pm.group.rotation.set(0, 0, 0); pm.group.quaternion.setFromUnitVectors(UP, o.pole); }
      // orbit line: the real orbit's shape and tilt for our Solar System, a circle elsewhere
      const pts = d.real ? orbitPath(p.name, clock.date, p.orbit) : Array.from({ length: 257 }, (_, k) => { const a = (k / 256) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit); });
      const lm = new THREE.LineBasicNodeMaterial({ color: 0x8899ff, transparent: true, opacity: 0.12, depthWrite: false });
      o.orbitLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm); root.add(o.orbitLine);
      (p.moons || []).forEach((md) => { const mm = planetMesh({ ...md, tilt: 0 }, sun.color); root.add(mm.group); o.moons.push({ def: md, name: md.name, group: mm.group, spinner: mm.spinner, center: mm.center, radU: mm.radU, r0: md.r, radius: md.r, pos: new THREE.Vector3(), parent: o }); });
      root.add(pm.group); objs.push(o); byName[o.name] = o;
    });
  }
  // spin shown on screen: real rate when live; when time is sped up, capped so worlds don't blur
  const spinRate = (hours) => { const r = (2 * Math.PI / (hours * 3600)) * (clock.live ? 1 : clock.speed * 86400); return Math.sign(r) * Math.min(Math.abs(r), 0.35); };
  function update(dt) {
    if (!def) return;
    if (def.real) {
      clock.date = clock.live ? new Date() : new Date(clock.date.getTime() + dt * clock.speed * 864e5);
      sunR = geo(def.star.radius, trueRadius('Sun')); sun.group.scale.setScalar(sunR / def.star.radius);
      for (const o of objs) {
        const f = geo(1, AU * REAL[o.name].a / o.def.orbit);   // distance factor
        planetPos(o.name, clock.date, o.def.orbit, o.pos).multiplyScalar(f); o.orbitLine.scale.setScalar(f);
        o.radius = geo(o.r0, trueRadius(o.name)); o.group.scale.setScalar(o.radius / o.r0); o.radU.value = o.radius;
        o.group.position.copy(o.pos); o.center.value.copy(o.pos);
        if (o.name === 'Earth') o.spinner.rotation.y = earthSpin(clock.date);   // true time of day on Earth
        else o.spinner.rotation.y += dt * spinRate(o.real.rot);
        o.ringAxis.value.copy(o.pole);
        for (const m of o.moons) {
          moonOffset(clock.date, geo(m.def.orbit, MOON_DIST), v); m.pos.copy(o.pos).add(v);
          m.radius = geo(m.r0, trueRadius(m.name)); m.group.scale.setScalar(m.radius / m.r0); m.radU.value = m.radius;
          m.group.position.copy(m.pos); m.center.value.copy(m.pos);
          m.spinner.rotation.y = Math.atan2(v.z, -v.x);   // tidally locked: the same face always toward Earth
        }
      }
      craft.update(dt, performance.now() / 1000 - t0, byName, scale.k, camera, focusRef.current);
      return;
    }
    const t = performance.now() / 1000 - t0;
    for (const o of objs) {
      const w = (2 * Math.PI / EARTH_YEAR) * Math.pow(3.9 / o.def.orbit, 1.5);   // Kepler's third law
      const a = o.phase + t * w;
      o.pos.set(Math.cos(a) * o.def.orbit, 0, Math.sin(a) * o.def.orbit);
      o.group.position.copy(o.pos); o.center.value.copy(o.pos);
      o.spinner.rotation.y += dt * 0.15 * (o.def.spin || 1);
      o.ringAxis.value.copy(UP).applyQuaternion(o.group.quaternion);
      if (o.def._look) { o.def._fake.pos.copy(o.pos); o.def._look.u.center.value.copy(o.pos); o.def._look.u.lightPos.value.set(0, 0, 0); o.def._look.u.lightCol.value.copy(sun.color); }
      for (const m of o.moons) {
        const ma = t * (2 * Math.PI / (m.def.period || 9));
        m.pos.set(o.pos.x + Math.cos(ma) * m.def.orbit, o.pos.y + Math.sin(ma) * m.def.orbit * 0.15, o.pos.z + Math.sin(ma) * m.def.orbit);
        m.group.position.copy(m.pos); m.center.value.copy(m.pos); m.spinner.rotation.y = -ma;
      }
    }
  }
  return {
    root, sky, load, update, clock, scale, setLite: (on) => craft.setLite(on),
    get sunRadius() { return sunR; },
    realDistance: (name) => (def?.real && REAL[name]?.a ? sunDistance(name, clock.date) : 0),
    get def() { return def; },
    get sunColor() { return sun?.color; },
    /** everything you can click/visit: planets and moons */
    get visitables() { return [...objs.flatMap((o) => [o, ...o.moons]), ...(def?.real ? craft.items.filter((c) => c.group) : [])]; },
    setVisible(v) { root.visible = v; },
  };
}
