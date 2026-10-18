import * as THREE from 'three';

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x) => x * x * x * (x * (x * 6 - 15) + 10); // smootherstep
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/**
 * Factor for one stage at story time u.
 * Rises over [dis0, dis1], holds, then falls over [rec0, rec1]. Exactly 0 outside.
 */
export function stageFactor(u, s) {
  if (u <= s.dis[0] || u >= s.rec[1]) return 0;
  if (u < s.dis[1]) return easeInOut((u - s.dis[0]) / (s.dis[1] - s.dis[0]));
  if (u <= s.rec[0]) return 1;
  return 1 - easeInOut((u - s.rec[0]) / (s.rec[1] - s.rec[0]));
}

const _q = new THREE.Quaternion();
const _id = new THREE.Quaternion();
const _off = new THREE.Vector3();

/**
 * A component of the car. Its assembled transform is captured once and every
 * animated pose is computed from it, so a part with all stages at zero is
 * restored to that transform exactly, whatever direction the visitor scrolls.
 */
export class Part {
  constructor(object, { name, system, stages = [] } = {}) {
    this.object = object;
    this.name = name;
    this.system = system;
    this.stages = stages.map((s) => ({
      offset: new THREE.Vector3(...(s.offset || [0, 0, 0])),
      rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(...(s.rot || [0, 0, 0]))),
      arc: s.arc || 0,
      dis: s.dis,
      rec: s.rec,
    }));
    this.basePos = object.position.clone();
    this.baseQuat = object.quaternion.clone();
    this.extraQuat = null; // mechanism rotation (crankshaft, camshaft, rods)
    this.extraPos = null; // mechanism translation (pistons, valves)
    this.amount = 0;
    this.motion = 0;
  }

  update(u) {
    const o = this.object;
    o.position.copy(this.basePos);
    o.quaternion.copy(this.baseQuat);
    let total = 0, sum = 0;
    for (const s of this.stages) {
      const f = stageFactor(u, s);
      if (f === 0) continue;
      total = Math.max(total, f);
      sum += f;
      _off.copy(s.offset).multiplyScalar(f);
      o.position.add(_off);
      if (s.arc) o.position.y += Math.sin(Math.PI * f) * s.arc;
      _q.copy(_id).slerp(s.rot, f);
      o.quaternion.premultiply(_q);
    }
    if (this.extraPos) o.position.add(this.extraPos);
    if (this.extraQuat) o.quaternion.multiply(this.extraQuat);
    this.amount = total;
    this.motion = sum;
  }

  get isHome() {
    return this.amount === 0;
  }
}
