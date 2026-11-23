// Realistic looks for created bodies (all procedural, TSL):
//  - stars: blackbody colour from temperature, limb darkening, granulation cells, sunspots, faculae, corona streamers
//  - planets: terran (oceans + glint, continents, ice caps, clouds, city lights, Rayleigh-ish rim), desert, ice, lava,
//    gas giants (turbulent latitude bands with differential flow + a great storm) with lit, shadowed rings
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, uniform, uv, length, normalize, dot, max, min, mix, smoothstep, pow, abs, sin, cos, atan, exp, clamp,
  time, positionLocal, positionWorld, normalWorld, cameraPosition, mx_noise_float, mx_fractal_noise_float, mx_worley_noise_float, select, sqrt, reflect,
} from 'three/tsl';

// ---- blackbody colour (Tanner Helland fit, 1000–40000 K) ----
export function blackbody(K) {
  const t = K / 100; let r, g, b;
  r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v) => Math.min(255, Math.max(0, v)) / 255;
  return new THREE.Color(c(r), c(g), c(b));
}
export const starTemp = (mass) => 2800 + 27000 * Math.pow(THREE.MathUtils.clamp((mass - 0.25) / 2.75, 0, 1), 1.6);
export const spectralClass = (K) => K > 25000 ? 'O' : K > 10000 ? 'B' : K > 7500 ? 'A' : K > 6000 ? 'F' : K > 5200 ? 'G' : K > 3700 ? 'K' : 'M';

const SPHERE = new THREE.SphereGeometry(1, 96, 48);

// ======================================================================= STAR
export function makeStarLook(b) {
  const u = { col: uniform(blackbody(starTemp(b.mass))), center: uniform(b.pos.clone()), seed: uniform(Math.random() * 100) };
  const N = normalize(positionWorld.sub(u.center)); const V = normalize(cameraPosition.sub(positionWorld));
  const mu = clamp(dot(N, V), 0, 1);
  const surf = Fn(() => {
    const p = positionLocal.mul(1.0).add(u.seed);
    // convection granules: bright cell centres, dark lanes (slowly boiling)
    const gran = float(1).sub(mx_worley_noise_float(p.mul(34).add(vec3(0, time.mul(0.05), 0)))).pow(1.8);
    const fine = mx_noise_float(p.mul(60).add(time.mul(0.2))).mul(0.5).add(0.5);
    // sunspots (dark umbra + penumbra) and bright faculae
    const big = mx_fractal_noise_float(p.mul(4.5).add(vec3(time.mul(0.01), 0, 0)), 4, 2.0, 0.5, 1.0);
    const spot = smoothstep(0.56, 0.62, big).mul(0.45).add(smoothstep(0.62, 0.66, big).mul(0.4));   // penumbra + umbra
    const fac = smoothstep(0.15, 0.4, big).mul(pow(float(1).sub(mu), 2)).mul(0.5);
    // limb darkening I(mu) = 1 - u(1 - mu), plus reddening toward the limb
    const limb = float(1).sub(float(0.62).mul(float(1).sub(mu)));
    const tint = mix(vec3(1.0, 0.55, 0.32), vec3(1.0), pow(mu, 0.45));
    const I = gran.mul(0.45).add(0.75).mul(fine.mul(0.12).add(0.94)).mul(float(1).sub(spot)).add(fac).mul(limb);
    // saturate the blackbody colour so hot and cool stars stay visibly blue or orange after bloom and tone mapping
    const lum = dot(vec3(u.col), vec3(0.3, 0.55, 0.15)); const vivid = max(mix(vec3(lum), vec3(u.col), 1.8), vec3(0));
    return vivid.mul(tint).mul(I).mul(1.0);
  });
  const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = surf();
  const core = new THREE.Mesh(SPHERE, m);

  // corona: a radial glow with slowly turning streamers (screen-facing sprite)
  const cm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const q = uv().sub(0.5).mul(2); const d = length(q); const a = atan(q.y, q.x);
  const streamers = mx_noise_float(vec2(sin(a).mul(5.0).add(cos(a).mul(5.0)), time.mul(0.05).add(u.seed))).mul(0.5).add(0.5)
    .mul(mx_noise_float(vec2(a.mul(14.0), u.seed)).mul(0.5).add(0.5)).pow(1.5);
  const fall = exp(max(d.sub(0.3), 0).mul(-5.5)).mul(smoothstep(0.27, 0.31, d));
  const corona = fall.mul(streamers.mul(1.1).add(0.2)).add(exp(max(d.sub(0.3), 0).mul(-14.0)).mul(0.5));
  const clum = dot(vec3(u.col), vec3(0.3, 0.55, 0.15)); const cviv = max(mix(vec3(clum), vec3(u.col), 2.0), vec3(0));
  cm.colorNode = vec4(cviv.mul(1.1), 1); cm.opacityNode = corona.mul(smoothstep(1.0, 0.75, d)).mul(0.6);
  const coronaSprite = new THREE.Sprite(cm);
  return { core, extras: [coronaSprite], u, scaleExtras: (r) => coronaSprite.scale.setScalar(r * 4.6), update(bb) { u.center.value.copy(bb.pos); } };
}

// ======================================================================= PLANETS
const KINDS = {
  terran: { radius: 0.07 }, desert: { radius: 0.06 }, ice: { radius: 0.055 }, lava: { radius: 0.05 }, gas: { radius: 0.15 },
};
export const PLANET_KINDS = Object.keys(KINDS);
export const planetRadius = (kind) => KINDS[kind].radius;

const GAS_PALETTES = [
  [vec3(0.86, 0.76, 0.62), vec3(0.64, 0.45, 0.31), vec3(0.95, 0.92, 0.85), vec3(0.72, 0.36, 0.22)],  // Jupiter
  [vec3(0.92, 0.84, 0.62), vec3(0.78, 0.66, 0.44), vec3(0.97, 0.93, 0.78), vec3(0.85, 0.72, 0.5)],   // Saturn
  [vec3(0.32, 0.52, 0.92), vec3(0.2, 0.33, 0.75), vec3(0.62, 0.78, 0.98), vec3(0.15, 0.2, 0.55)],    // Neptune
  [vec3(0.6, 0.86, 0.88), vec3(0.45, 0.72, 0.78), vec3(0.8, 0.95, 0.95), vec3(0.4, 0.6, 0.7)],       // Uranus
];

export function makePlanetLook(b, kind) {
  const seed = Math.random() * 100;
  const u = { center: uniform(b.pos.clone()), lightPos: uniform(new THREE.Vector3(0, 10, 0)), lightCol: uniform(new THREE.Color(1, 0.95, 0.85)), seed: uniform(seed), lightOn: uniform(1) };
  const N = normalize(positionWorld.sub(u.center));
  const L = normalize(u.lightPos.sub(positionWorld));
  const V = normalize(cameraPosition.sub(positionWorld));
  const NdL = dot(N, L);
  const day = smoothstep(-0.08, 0.28, NdL);                 // soft terminator
  const P = positionLocal.add(u.seed);
  const groups = [];

  let albedo, emissive = vec3(0), spec = float(0), atmoCol = null, atmoStrength = 0, clouds = false, rings = false;
  if (kind === 'terran' || kind === 'desert' || kind === 'ice') {
    const warp = mx_fractal_noise_float(P.mul(1.3), 3, 2.0, 0.5, 1.0);
    const h = mx_fractal_noise_float(P.mul(2.1).add(warp.mul(0.6)), 6, 2.05, 0.5, 1.0);  // terrain height
    const lat = abs(positionLocal.y);
    if (kind === 'terran') {
      const sea = h.lessThan(0.02);
      const ocean = mix(vec3(0.015, 0.06, 0.2), vec3(0.05, 0.32, 0.48), smoothstep(-0.3, 0.02, h));
      const land = mix(mix(vec3(0.16, 0.38, 0.1), vec3(0.62, 0.52, 0.3), smoothstep(0.06, 0.3, h)), vec3(0.72, 0.68, 0.64), smoothstep(0.3, 0.48, h));
      const ice = smoothstep(0.78, 0.86, lat.add(h.mul(0.15)));
      albedo = mix(select(sea, ocean, land), vec3(0.92, 0.95, 0.98), ice);
      spec = select(sea, float(1), float(0)).mul(float(1).sub(ice));
      // city lights on the night side of land
      const city = smoothstep(0.62, 0.8, mx_noise_float(P.mul(48))).mul(select(sea, float(0), float(1))).mul(smoothstep(0.32, 0.08, h)).mul(float(1).sub(ice));
      emissive = vec3(1.0, 0.72, 0.38).mul(city).mul(smoothstep(0.05, -0.15, NdL)).mul(1.4);
      atmoCol = vec3(0.35, 0.6, 1.0); atmoStrength = 1; clouds = true;
    } else if (kind === 'desert') {
      const dunes = sin(P.x.mul(40).add(h.mul(12))).mul(0.5).add(0.5);
      albedo = mix(mix(vec3(0.56, 0.3, 0.16), vec3(0.82, 0.58, 0.36), smoothstep(-0.3, 0.3, h)), vec3(0.9, 0.75, 0.55), dunes.mul(0.15));
      albedo = mix(albedo, vec3(0.95, 0.93, 0.9), smoothstep(0.88, 0.94, lat));
      atmoCol = vec3(1.0, 0.62, 0.38); atmoStrength = 0.45;
    } else {
      const crack = smoothstep(0.03, 0.0, abs(mx_noise_float(P.mul(9))));
      albedo = mix(mix(vec3(0.62, 0.74, 0.86), vec3(0.93, 0.97, 1.0), smoothstep(-0.2, 0.4, h)), vec3(0.3, 0.45, 0.62), crack.mul(0.7));
      spec = float(0.35); atmoCol = vec3(0.6, 0.8, 1.0); atmoStrength = 0.35;
    }
  } else if (kind === 'lava') {
    const warpL = mx_noise_float(P.mul(3)).mul(0.8);
    const cracks = smoothstep(0.07, 0.0, abs(mx_noise_float(P.mul(5).add(warpL))));   // ridged glowing fissures
    albedo = mix(vec3(0.06, 0.05, 0.05), vec3(0.16, 0.12, 0.1), mx_noise_float(P.mul(20)).mul(0.5).add(0.5));
    const flow = mx_noise_float(P.mul(4).add(time.mul(0.15))).mul(0.5).add(0.5);
    emissive = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.75, 0.25), flow).mul(cracks).mul(2.2);
    atmoCol = vec3(1.0, 0.35, 0.1); atmoStrength = 0.5;
  } else { // gas giant
    const pal = GAS_PALETTES[Math.floor(Math.random() * GAS_PALETTES.length)];
    const lat = positionLocal.y;
    // latitude bands, sheared by flow that runs at different speeds per band, with turbulent eddies at the boundaries
    const speed = sin(lat.mul(14)).mul(0.04);
    const lon = atan(positionLocal.z, positionLocal.x).add(time.mul(speed));
    const q = vec3(cos(lon).mul(sqrt(float(1).sub(lat.mul(lat)))), lat, sin(lon).mul(sqrt(float(1).sub(lat.mul(lat)))));
    const turb = mx_fractal_noise_float(q.mul(vec3(3.5, 11, 3.5)).add(u.seed), 5, 2.1, 0.55, 1.0);
    const bandv = lat.mul(10).add(turb.mul(0.9));
    const b1 = smoothstep(0.25, 0.75, sin(bandv.mul(2.3)).mul(0.5).add(0.5)), b2 = sin(bandv.mul(6.1).add(1.7)).mul(0.5).add(0.5);
    const fineB = mx_fractal_noise_float(q.mul(vec3(8, 40, 8)).add(u.seed), 3, 2.0, 0.5, 1.0).mul(0.18);
    let col = mix(mix(pal[1], pal[2], b1), pal[3], smoothstep(0.55, 0.9, b2).mul(0.7)).mul(fineB.add(1));
    // great storm: an oval vortex at a fixed latitude, drifting with its band
    const sLat = float(-0.32), sLon = float(seed % 6.28);
    const dLon = atan(sin(lon.sub(sLon)), cos(lon.sub(sLon)));
    const sd = length(vec2(dLon.mul(0.55), lat.sub(sLat).mul(2.6)));
    const swirl = sin(atan(lat.sub(sLat), dLon).mul(2).add(sd.mul(26)).sub(time.mul(0.5))).mul(0.5).add(0.5);
    const storm = smoothstep(0.17, 0.05, sd);
    col = mix(col, mix(vec3(0.75, 0.32, 0.18), vec3(0.9, 0.55, 0.38), swirl), storm.mul(0.85));
    albedo = col; atmoCol = pal[2]; atmoStrength = 0.4;
    rings = Math.random() < 0.7;
  }

  // lighting: diffuse with soft terminator, ocean glint (Blinn-Phong), scattering tint near the terminator
  const H = normalize(L.add(V));
  const glint = pow(max(dot(N, H), 0), 90).mul(spec).mul(day).mul(2.2);
  const dusk = smoothstep(0.35, 0.0, abs(NdL)).mul(0.35);
  const lit = albedo.mul(vec3(u.lightCol)).mul(day.add(0.012)).mul(mix(vec3(1), vec3(1.0, 0.6, 0.4), dusk.mul(atmoStrength)));
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = lit.add(vec3(u.lightCol).mul(glint)).add(emissive);
  const core = new THREE.Mesh(SPHERE, m); groups.push(core);
  const extras = [];

  if (clouds) {
    const cmat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const cl = mx_fractal_noise_float(positionLocal.mul(2.6).add(vec3(time.mul(0.012), 0, 0)).add(u.seed.mul(1.7)), 5, 2.1, 0.5, 1.0);
    const cov = smoothstep(0.05, 0.45, cl);
    cmat.colorNode = vec3(1).mul(day.mul(1.1).add(0.02)).mul(vec3(u.lightCol));
    cmat.opacityNode = cov.mul(0.85);
    const cloudMesh = new THREE.Mesh(SPHERE, cmat); cloudMesh.scale.setScalar(1.012); core.add(cloudMesh);
  }
  if (atmoCol) {
    // atmosphere rim: thin glow strongest at the limb on the day side, reddening toward the terminator
    const am = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
    const Na = normalize(positionWorld.sub(u.center)); const rim = pow(float(1).sub(abs(dot(Na, V))), 2.2);
    const sun = smoothstep(-0.25, 0.4, dot(Na, L));
    am.colorNode = mix(vec3(1.0, 0.45, 0.2), atmoCol, smoothstep(0.0, 0.35, dot(Na, L))).mul(vec3(u.lightCol));
    am.opacityNode = rim.mul(sun).mul(atmoStrength).mul(1.2);
    const atmo = new THREE.Mesh(SPHERE, am); atmo.scale.setScalar(1.08); core.add(atmo);
    const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const rim2 = pow(float(1).sub(max(dot(N, V), 0)), 3.0);
    fm.colorNode = atmoCol.mul(vec3(u.lightCol)); fm.opacityNode = rim2.mul(day).mul(atmoStrength).mul(0.9);
    const fres = new THREE.Mesh(SPHERE, fm); fres.scale.setScalar(1.002); core.add(fres);
  }
  if (rings) {
    const inner = 1.35, outer = 2.4;
    const rg = new THREE.RingGeometry(inner, outer, 160, 1);
    const rm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const rr = length(positionLocal.xy); const t = rr.sub(inner).div(outer - inner);
    const bands = mx_noise_float(vec2(t.mul(60), u.seed)).mul(0.5).add(0.5).mul(mx_noise_float(vec2(t.mul(13), u.seed.add(4))).mul(0.4).add(0.6));
    const gaps = smoothstep(0.0, 0.02, abs(t.sub(0.62))).mul(smoothstep(0.0, 0.015, abs(t.sub(0.83))));
    const dens = bands.mul(gaps).mul(smoothstep(0.0, 0.06, t)).mul(smoothstep(1.0, 0.9, t));
    // planet's shadow on the rings: does the ray toward the star hit the planet?
    const toC = u.center.sub(positionWorld); const tt = dot(toC, L); const closest = length(toC.sub(L.mul(tt)));
    const radius = b.radius || planetRadius('gas');
    const shadow = select(tt.greaterThan(0).and(closest.lessThan(float(radius))), float(0.08), float(1));
    rm.colorNode = mix(vec3(0.62, 0.55, 0.45), vec3(0.95, 0.9, 0.8), bands).mul(vec3(u.lightCol)).mul(shadow).mul(1.1);
    rm.opacityNode = dens.mul(0.85);
    const ring = new THREE.Mesh(rg, rm); ring.rotation.x = -Math.PI / 2 + 0.45; ring.rotation.y = 0.2;
    extras.push(ring);
  }
  return {
    core, extras, u, kind,
    scaleExtras: (r) => extras.forEach((e) => e.scale.setScalar(r)),
    update(bb, light) {
      u.center.value.copy(bb.pos);
      if (light) { u.lightPos.value.copy(light.pos); u.lightCol.value.copy(light.color).multiplyScalar(Math.min(1.15, 0.6 / Math.max(0.05, light.pos.distanceTo(bb.pos)))); }
      core.rotation.y += 0.002;
    },
  };
}
