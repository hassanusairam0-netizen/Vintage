import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const V2 = (x, y) => new THREE.Vector2(x, y);
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Sweep a 2D cross-section along a 3D path.
 * profile(t) returns Vector2[] where x runs along `up` (the lateral axis) and y along the path normal.
 * The frame is (B = up projected ⟂ T, N = B × T), so for a path along +X with up = +Z, N = +Y.
 */
export function sweep({ path, profile, steps = 64, closed = false, up = V3(0, 0, 1), capStart = false, capEnd = false, closedPath = false }) {
  const M = profile(0).length;
  const pos = [], uv = [], idx = [];
  const P = V3(), T = V3(), B = V3(), N = V3();
  const eps = 1e-3;
  const frames = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    P.copy(path(t));
    if (closedPath) T.copy(path((t + eps) % 1)).sub(path((t - eps + 1) % 1)).normalize();
    else T.copy(path(Math.min(1, t + eps))).sub(path(Math.max(0, t - eps))).normalize();
    B.copy(up).addScaledVector(T, -up.dot(T)).normalize();
    N.crossVectors(B, T).normalize();
    frames.push([P.clone(), T.clone(), B.clone(), N.clone()]);
    const prof = profile(t);
    let acc = 0;
    const lens = [0];
    for (let j = 1; j < M; j++) { acc += prof[j].distanceTo(prof[j - 1]); lens.push(acc); }
    for (let j = 0; j < M; j++) {
      const p = prof[j];
      pos.push(P.x + B.x * p.x + N.x * p.y, P.y + B.y * p.x + N.y * p.y, P.z + B.z * p.x + N.z * p.y);
      uv.push(lens[j] / (acc || 1), t);
    }
  }
  // Orientation: CCW profiles produce outward normals with (a, b, d) winding.
  const p0 = profile(0.5);
  let area = 0;
  for (let j = 0; j < M; j++) { const a = p0[j], b = p0[(j + 1) % M]; area += a.x * b.y - b.x * a.y; }
  const flip = area < 0;
  const segs = closed ? M : M - 1;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * M + j, b = (i + 1) * M + j, c = (i + 1) * M + ((j + 1) % M), d = i * M + ((j + 1) % M);
      if (flip) idx.push(a, d, b, b, d, c);
      else idx.push(a, b, d, b, c, d);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const caps = [];
  if (capStart) caps.push(capGeometry(profile(0), frames[0], -1));
  if (capEnd) caps.push(capGeometry(profile(1), frames[steps], 1));
  if (caps.length) g = mergeGeometries([g, ...caps.map((c) => c)]);
  return g;
}

function capGeometry(prof, [P, T, B, N], dir) {
  const shape = new THREE.Shape(prof.map((p) => V2(p.x, p.y)));
  const g = new THREE.ShapeGeometry(shape, 4);
  // ShapeGeometry lies in XY with +Z normal; map x→B, y→N, z→T
  const m = new THREE.Matrix4().makeBasis(B, N, T).setPosition(P);
  g.applyMatrix4(m);
  // Make the cap face along dir*T: fix winding from the actual triangle, then set flat normals.
  const want = T.clone().multiplyScalar(dir);
  const pos = g.attributes.position, index = g.index.array;
  const a = V3().fromBufferAttribute(pos, index[0]), b = V3().fromBufferAttribute(pos, index[1]), c = V3().fromBufferAttribute(pos, index[2]);
  const face = b.sub(a).cross(c.sub(a));
  if (face.dot(want) < 0) {
    for (let i = 0; i < index.length; i += 3) { const t = index[i]; index[i] = index[i + 2]; index[i + 2] = t; }
  }
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, want.x, want.y, want.z);
  return g;
}

/** Superellipse outline (a, b half-sizes, n exponent). Angles in radians, CCW. */
export function superellipse(a, b, n, count = 48, a0 = 0, a1 = Math.PI * 2, cx = 0, cy = 0) {
  const pts = [];
  const closed = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  const cnt = closed ? count : count + 1;
  for (let i = 0; i < cnt; i++) {
    const t = a0 + ((a1 - a0) * i) / count;
    const c = Math.cos(t), s = Math.sin(t);
    pts.push(V2(cx + a * Math.sign(c) * Math.abs(c) ** (2 / n), cy + b * Math.sign(s) * Math.abs(s) ** (2 / n)));
  }
  return pts;
}

export function roundedRect(w, h, r, seg = 4) {
  const pts = [];
  const corners = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI], [w / 2 - r, -h / 2 + r, Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (Math.PI / 2) * (i / seg);
      pts.push(V2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  }
  return pts;
}

export function roundedBox(w, h, d, r = 0.01, seg = 3) {
  const shape = new THREE.Shape(roundedRect(w, h, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4), seg));
  const bevel = Math.min(r, d / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, d - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6,
    bevelSegments: seg, curveSegments: 4,
  });
  g.translate(0, 0, -(d - bevel * 2) / 2);
  return g;
}

export function curvePath(points, { closed = false, tension = 0.5, type = 'catmullrom' } = {}) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V3(...p))), closed, type, tension);
  return { curve: c, at: (t) => c.getPointAt(Math.min(1, Math.max(0, t))) };
}

export function tube(points, radius, { segs = 64, radial = 10, closed = false } = {}) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V3(...p))), closed, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(c, segs, radius, radial, closed);
}

/** Cylinder between two points. */
export function rod(a, b, r0, r1 = r0, radial = 12) {
  const A = a.isVector3 ? a : V3(...a), Bv = b.isVector3 ? b : V3(...b);
  const len = A.distanceTo(Bv);
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), Bv.clone().sub(A).normalize());
  g.applyQuaternion(q);
  const mid = A.clone().add(Bv).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

export function lathe(points, segs = 48) {
  return new THREE.LatheGeometry(points.map((p) => V2(p[0], p[1])), segs);
}

/** Lathe built around the X axis (for things that spin along the car's length). */
export function latheX(points, segs = 48) {
  const g = lathe(points, segs);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Lathe built around the Z axis (wheels, drums, lamps facing sideways). */
export function latheZ(points, segs = 48) {
  const g = lathe(points, segs);
  g.rotateX(Math.PI / 2);
  return g;
}

export function merge(geos) {
  const prepared = geos.map((g) => {
    let x = g.index ? g.toNonIndexed() : g;
    if (!x.attributes.uv) x.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
    if (!x.attributes.normal) x.computeVertexNormals();
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k);
    return x;
  });
  return mergeGeometries(prepared);
}

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function at(obj, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, rz);
  return obj;
}

export function helix(radius, height, turns, wire, segs = 120) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * turns * Math.PI * 2;
    pts.push(V3(Math.cos(a) * radius, t * height, Math.sin(a) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, wire, 6, false);
}
