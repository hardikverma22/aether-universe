// Where things really are: planet and Moon positions for any date (astronomy-engine, MIT), real spin-axis
// directions (IAU pole RA/Dec) and Earth's true rotation (sidereal time), mapped into scene space.
// Scene axes: x = vernal equinox, y = ecliptic north, z = -(ecliptic y).
import * as A from 'astronomy-engine';
import * as THREE from 'three/webgpu';

const OBL = 23.4393 * Math.PI / 180;
/** true-scale units: scene units per astronomical unit (Earth's compact orbit is 3.9) */
export const AU = 3.9;
const KM = AU / 149597870.7;
const RADIUS_KM = { Sun: 695700, Mercury: 2439.7, Venus: 6051.8, Earth: 6371, Moon: 1737.4, Mars: 3389.5, Jupiter: 69911, Saturn: 58232, Uranus: 25362, Neptune: 24622 };
export const trueRadius = (name) => RADIUS_KM[name] * KM;
export const kmToScene = (km) => km * KM;
export const MOON_DIST = 384400 * KM;
const D2R = Math.PI / 180;
/** equatorial J2000 vector -> scene vector */
export function eqjToScene(x, y, z, out = new THREE.Vector3()) {
  const ey = Math.cos(OBL) * y + Math.sin(OBL) * z, ez = -Math.sin(OBL) * y + Math.cos(OBL) * z;
  return out.set(x, ez, -ey);
}
/** IAU north pole (RA, Dec in degrees) -> unit scene vector */
export function poleToScene(ra, dec) {
  const r = ra * D2R, d = dec * D2R;
  return eqjToScene(Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)).normalize();
}

// mean distance (AU), sidereal orbit (days), sidereal rotation (hours; negative = retrograde), IAU pole
export const REAL = {
  Sun: { rot: 609.12, pole: [286.13, 63.87] },
  Mercury: { a: 0.387, period: 87.97, rot: 1407.6, pole: [281.01, 61.42] },
  Venus: { a: 0.723, period: 224.7, rot: -5832.5, pole: [272.76, 67.16] },
  Earth: { a: 1.0, period: 365.256, rot: 23.934, pole: [0, 90] },
  Mars: { a: 1.524, period: 686.98, rot: 24.623, pole: [317.68, 52.89] },
  Jupiter: { a: 5.203, period: 4332.6, rot: 9.925, pole: [268.06, 64.5] },
  Saturn: { a: 9.537, period: 10759, rot: 10.656, pole: [40.59, 83.54] },
  Uranus: { a: 19.19, period: 30687, rot: -17.24, pole: [257.31, -15.18] },
  Neptune: { a: 30.07, period: 60190, rot: 16.11, pole: [299.36, 43.46] },
};

/** heliocentric scene position, with distance scaled so the mean orbit lands on `orbit` scene units */
export function planetPos(name, date, orbit, out = new THREE.Vector3()) {
  const v = A.HelioVector(A.Body[name], date);
  return eqjToScene(v.x, v.y, v.z, out).multiplyScalar(orbit / REAL[name].a);
}
/** direction and relative distance of the Moon from Earth (1 = mean distance) */
export function moonOffset(date, dist, out = new THREE.Vector3()) {
  const v = A.GeoMoon(date); eqjToScene(v.x, v.y, v.z, out);
  return out.multiplyScalar(dist / 0.00257);   // 0.00257 AU = mean Earth–Moon distance
}
/** a closed path through one real orbit, for the orbit line */
export function orbitPath(name, date, orbit, n = 256) {
  const P = REAL[name].period, pts = [];
  for (let i = 0; i <= n; i++) pts.push(planetPos(name, new Date(date.getTime() + (i / n) * P * 864e5), orbit));
  return pts;
}
/** real Earth–Moon distance, km */
export const moonKm = (date) => { const v = A.GeoMoon(date); return Math.hypot(v.x, v.y, v.z) * 149597870.7; };
/** real distance from the Sun, AU */
export const sunDistance = (name, date) => A.HelioDistance(A.Body[name], date);
/** Earth's prime-meridian angle from the equinox, radians (apparent sidereal time) */
export const earthSpin = (date) => A.SiderealTime(date) * 15 * D2R;
export function formatDate(d) { return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
