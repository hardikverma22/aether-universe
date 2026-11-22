// Camera rig: spherical orbit around a target with damping, plus cinematic fly-to.
import * as THREE from 'three/webgpu';
import gsap from 'gsap';

export class Rig {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3();
    this.sph = new THREE.Spherical(8.5, 1.1, 0);         // current
    this.goal = { radius: 8.5, theta: 0, phi: 1.1 };      // damped toward
    this.min = 3; this.max = 1200; this.busy = false;
    this.lookAt = new THREE.Vector3();
  }

  /** place the camera so it looks at `target` from direction `dir` (unit vector) at `radius` */
  setFrom(target, dir, radius) {
    this.target.copy(target); this.lookAt.copy(target);
    const s = new THREE.Spherical().setFromVector3(dir.clone().normalize());
    Object.assign(this.goal, { radius, theta: s.theta, phi: s.phi });
    this.sph.set(radius, s.phi, s.theta);
  }

  orbit(dTheta, dPhi) { if (this.busy) return; this.goal.theta += dTheta; this.goal.phi = THREE.MathUtils.clamp(this.goal.phi + dPhi, 0.08, Math.PI - 0.08); }
  zoom(factor) { if (this.busy) return; this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * factor, this.min, this.max); }

  /** fly to look at `target` from `dir` at `radius`; returns a promise */
  flyTo(target, dir, radius, duration = 2.6, onUpdate) {
    this.busy = true;
    const fromT = this.target.clone(), fromPos = this.camera.position.clone();
    const s = new THREE.Spherical().setFromVector3(dir.clone().normalize());
    const toPos = target.clone().add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius, s.phi, s.theta)));
    const mid = fromPos.clone().lerp(toPos, 0.5).add(new THREE.Vector3(0, fromPos.distanceTo(toPos) * 0.12, 0)); // gentle arc
    const st = { t: 0 };
    return new Promise((resolve) => gsap.to(st, {
      t: 1, duration, ease: 'power3.inOut',
      onUpdate: () => {
        const t = st.t, a = fromPos.clone().lerp(mid, t), b = mid.clone().lerp(toPos, t);
        this.camera.position.copy(a.lerp(b, t));
        this.lookAt.copy(fromT).lerp(target, Math.min(1, t * 1.6));
        this.camera.lookAt(this.lookAt);
        onUpdate?.(t);
      },
      onComplete: () => { this.setFrom(target, dir, radius); this.busy = false; resolve(); },
    }));
  }

  update(dt) {
    if (this.busy) return;
    const k = 1 - Math.exp(-dt * 6);
    this.sph.radius += (this.goal.radius - this.sph.radius) * k;
    this.sph.theta += (this.goal.theta - this.sph.theta) * k;
    this.sph.phi += (this.goal.phi - this.sph.phi) * k;
    this.camera.position.copy(this.target).add(new THREE.Vector3().setFromSpherical(this.sph));
    this.camera.lookAt(this.target);
  }
}
