import * as THREE from 'three';
import {
  sweep, superellipse, roundedRect, roundedBox, curvePath, tube, rod, lathe, latheX, latheZ, merge, mesh, V2, V3,
} from '../core/geo.js';
import { buildWheel, buildBrake, WHEEL } from './wheel.js';
import { buildEngine } from './engine.js';

// A 1930 six-and-a-half-litre open tourer, modelled as ~40 independent components.
// World units are metres. +X points to the front of the car, +Y up, +Z to the right-hand (driver's) side.
export const DIM = {
  FX: 1.6, // front axle
  RX: -1.7, // rear axle
  WZ: 0.7, // wheel centre, lateral
  WY: WHEEL.R, // wheel centre height
  RAIL_Z: 0.4,
  ENGINE: V3(1.05, 0.62, 0),
};

const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Re-centre a group built in world coordinates so it pivots about its own centre. */
function centred(group) {
  const box = new THREE.Box3().setFromObject(group);
  const c = box.getCenter(new THREE.Vector3());
  for (const ch of group.children) ch.position.sub(c);
  group.position.copy(c);
  return group;
}

/** Bonnet / scuttle cross-section: vertical sides, superellipse crown. Open at the bottom. */
function hoodProfile(hw, top, crown, bottom, n = 4.2, count = 36) {
  const shoulder = top - crown;
  const pts = [];
  // right side, bottom → shoulder (in profile coords: x lateral, y height)
  for (let i = 0; i <= 6; i++) pts.push(V2(hw + 0.004 * Math.sin((i / 6) * Math.PI), lerp(bottom, shoulder, i / 6)));
  const arc = superellipse(hw, crown, n, count, 0, Math.PI, 0, shoulder);
  for (let i = 1; i < arc.length - 1; i++) pts.push(arc[i]);
  for (let i = 0; i <= 6; i++) pts.push(V2(-hw - 0.004 * Math.sin((i / 6) * Math.PI), lerp(shoulder, bottom, i / 6)));
  return pts;
}

/** Open-topped tourer tub section. */
function tubProfile(hw, top, bottom) {
  const L = [
    V2(hw - 0.035, top - 0.012), V2(hw - 0.022, top + 0.006), V2(hw - 0.006, top + 0.006), V2(hw + 0.004, top - 0.012),
    V2(hw + 0.008, top - 0.08), V2(hw + 0.01, lerp(top, bottom, 0.45)), V2(hw + 0.004, bottom + 0.06),
    V2(hw - 0.012, bottom + 0.012), V2(hw - 0.04, bottom),
  ];
  const R = L.map((p) => V2(-p.x, p.y)).reverse();
  return [...L, ...R];
}

const wingSection = (w, crown = 0.05, lip = 0.03, t = 0.007) => {
  const top = [], bot = [];
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const u = lerp(w / 2, -w / 2, i / N);
    const k = Math.abs(u) / (w / 2);
    const v = crown * (1 - k * k) - lip * sstep(0.82, 1, k);
    top.push(V2(u, v));
  }
  for (let i = N; i >= 0; i--) {
    const p = top[i];
    const k = Math.abs(p.x) / (w / 2);
    bot.push(V2(p.x * (1 - 0.02 * sstep(0.8, 1, k)), p.y - t));
  }
  return [...top, ...bot];
};

export function buildCar(m) {
  const root = new THREE.Group();
  root.name = 'car';
  const parts = {};
  const { FX, RX, WZ, WY } = DIM;

  function addPart(key, group, meta) {
    group.name = key;
    root.add(group);
    const anchorWorld = meta.anchor ? meta.anchor.clone() : null;
    parts[key] = { object: group, ...meta, anchorWorld };
    return group;
  }
  // Called after all parts are placed: convert world anchors into each part's local frame.
  function finaliseAnchors() {
    root.updateMatrixWorld(true);
    for (const p of Object.values(parts)) {
      if (p.anchorWorld) p.anchor = p.object.worldToLocal(p.anchorWorld.clone());
    }
  }

  // ── Chassis frame ─────────────────────────────────────────────
  const frame = new THREE.Group();
  {
    const railPath = curvePath([
      [-2.16, 0.64, 0], [-1.98, 0.72, 0], [-1.85, 0.74, 0], [-1.52, 0.74, 0], [-1.3, 0.66, 0], [-1.1, 0.615, 0],
      [0.2, 0.615, 0], [1.6, 0.615, 0], [1.95, 0.6, 0], [2.18, 0.57, 0],
    ]);
    const railSection = (t) => {
      const h = lerp(0.15, 0.11, sstep(0.8, 1, t));
      return [V2(0.025, -h / 2), V2(0.025, h / 2), V2(-0.025, h / 2), V2(-0.025, -h / 2)];
    };
    const g = [];
    for (const s of [-1, 1]) {
      const r = sweep({ path: railPath.at, profile: railSection, steps: 90, closed: true, capStart: true, capEnd: true });
      r.translate(0, 0, s * DIM.RAIL_Z);
      g.push(r);
    }
    for (const [x, y] of [[1.98, 0.6], [-0.45, 0.65], [-1.15, 0.65], [-2.12, 0.66]]) {
      g.push(rod(V3(x, y, -0.4), V3(x, y, 0.4), 0.028, 0.028, 16));
    }
    // Rivet rows along the rails
    const rivets = [];
    for (let i = 0; i < 46; i++) {
      const x = -1.05 + i * 0.06;
      for (const s of [-1, 1]) {
        const r = new THREE.SphereGeometry(0.006, 6, 4);
        r.translate(x, 0.66, s * (DIM.RAIL_Z + 0.026));
        rivets.push(r);
        const r2 = r.clone();
        r2.translate(0, -0.09, 0);
        rivets.push(r2);
      }
    }
    // Spring hangers
    for (const s of [-1, 1]) {
      for (const x of [FX - 0.47, FX + 0.47, RX - 0.47, RX + 0.47]) {
        const hy = x < 0 ? 0.62 : 0.55;
        const hb = roundedBox(0.05, 0.08, 0.06, 0.01);
        hb.translate(x, hy, s * DIM.RAIL_Z);
        g.push(hb);
      }
    }
    frame.add(mesh(merge(g), m.blackEnamel));
    frame.add(mesh(merge(rivets), m.blackEnamel, { cast: false }));
  }
  addPart('frame', centred(frame), {
    label: 'Chassis frame', note: 'Pressed-steel ladder, riveted', system: 'chassis', anchor: V3(-1.0, 0.69, 0.425),
  });

  // ── Leaf spring helper ────────────────────────────────────────
  function leafSpring(cx, cyTop, z, half = 0.47, leaves = 6, camber = 0.065) {
    const geos = [];
    for (let k = 0; k < leaves; k++) {
      const h = half - k * 0.065;
      const y0 = cyTop - k * 0.009;
      const path = (t) => {
        const x = lerp(-h, h, t);
        return V3(cx + x, y0 + camber * (x / half) ** 2, z);
      };
      geos.push(sweep({
        path, steps: 24, closed: true, capStart: true, capEnd: true,
        profile: () => [V2(0.025, -0.0035), V2(0.025, 0.0035), V2(-0.025, 0.0035), V2(-0.025, -0.0035)],
      }));
    }
    // eyes and U-bolts
    for (const sx of [-1, 1]) {
      const eye = new THREE.TorusGeometry(0.014, 0.005, 6, 14);
      eye.translate(cx + sx * half, cyTop + camber + 0.012, z);
      geos.push(eye);
    }
    for (const dx of [-0.035, 0.035]) geos.push(rod(V3(cx + dx, cyTop - leaves * 0.009 - 0.04, z), V3(cx + dx, cyTop + 0.01, z), 0.005, 0.005, 6));
    return merge(geos);
  }

  // ── Front axle, springs and friction dampers ─────────────────
  const fAxle = new THREE.Group();
  {
    const beam = sweep({
      path: curvePath([[FX, 0.45, -0.56], [FX, 0.43, -0.4], [FX, 0.4, -0.2], [FX, 0.4, 0.2], [FX, 0.43, 0.4], [FX, 0.45, 0.56]]).at,
      up: V3(1, 0, 0),
      steps: 40, closed: true, capStart: true, capEnd: true,
      profile: () => [
        V2(0.03, -0.03), V2(0.03, -0.022), V2(0.007, -0.02), V2(0.007, 0.02), V2(0.03, 0.022), V2(0.03, 0.03),
        V2(-0.03, 0.03), V2(-0.03, 0.022), V2(-0.007, 0.02), V2(-0.007, -0.02), V2(-0.03, -0.022), V2(-0.03, -0.03),
      ],
    });
    const g = [beam];
    for (const s of [-1, 1]) {
      g.push(rod(V3(FX, 0.39, s * 0.56), V3(FX, 0.51, s * 0.56), 0.028, 0.028, 16)); // kingpin boss
      g.push(rod(V3(FX, WY, s * 0.53), V3(FX, WY, s * 0.6), 0.032, 0.026, 16)); // stub axle
    }
    fAxle.add(mesh(merge(g), m.blackEnamel));
    for (const s of [-1, 1]) fAxle.add(mesh(leafSpring(FX, 0.535, s * DIM.RAIL_Z, 0.47, 6, 0.012), m.darkSteel));
    // Friction dampers on the dumb irons
    for (const s of [-1, 1]) {
      const d = new THREE.Group();
      d.add(mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.016, 32).rotateX(Math.PI / 2).translate(0, 0, -0.012), m.darkSteel));
      d.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 32).rotateX(Math.PI / 2), m.brass));
      d.add(mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.016, 32).rotateX(Math.PI / 2).translate(0, 0, 0.012), m.darkSteel));
      d.add(mesh(roundedBox(0.2, 0.025, 0.015, 0.006).translate(-0.07, -0.04, 0).rotateZ(0.5), m.darkSteel));
      d.position.set(FX + 0.32, 0.6, s * 0.46);
      fAxle.add(d);
    }
  }
  addPart('frontAxle', centred(fAxle), {
    label: 'Front axle and springs', note: 'Forged I-beam on semi-elliptic leaves', system: 'suspension', anchor: V3(FX, 0.42, 0.25),
  });

  // ── Rear axle with differential ───────────────────────────────
  const rAxle = new THREE.Group();
  {
    const g = [];
    g.push(rod(V3(RX, WY, -0.62), V3(RX, WY, 0.62), 0.042, 0.042, 20));
    for (const s of [-1, 1]) g.push(rod(V3(RX, WY, s * 0.18), V3(RX, WY, s * 0.36), 0.07, 0.044, 20));
    const banjo = latheX([[0, -0.13], [0.07, -0.125], [0.14, -0.08], [0.155, 0], [0.14, 0.07], [0.09, 0.12], [0.06, 0.2], [0.05, 0.28], [0, 0.29]], 40);
    banjo.translate(RX, WY, 0);
    g.push(banjo);
    rAxle.add(mesh(merge(g), m.blackEnamel));
    for (const s of [-1, 1]) rAxle.add(mesh(leafSpring(RX, 0.505, s * DIM.RAIL_Z, 0.47, 7, 0.1), m.darkSteel));
  }
  addPart('rearAxle', centred(rAxle), {
    label: 'Rear axle', note: 'Spiral-bevel final drive, 3.53 : 1', system: 'drivetrain', anchor: V3(RX + 0.15, WY + 0.1, 0.0),
  });

  // ── Wheels and brakes ─────────────────────────────────────────
  const wheelDefs = [
    ['wheelFR', FX, 1], ['wheelFL', FX, -1], ['wheelRR', RX, 1], ['wheelRL', RX, -1],
  ];
  for (const [key, x, s] of wheelDefs) {
    const w = buildWheel(m);
    w.position.set(x, WY, s * WZ);
    if (s < 0) w.rotation.y = Math.PI;
    addPart(key, w, {
      label: 'Wire wheel', note: '21 in., sixty spokes, centre-lock', system: 'wheels', anchor: V3(x + 0.18, WY + 0.2, s * (WZ + 0.06)),
    });
    const b = buildBrake(m);
    b.position.set(x, WY, s * 0.6);
    if (s < 0) b.rotation.y = Math.PI;
    addPart(key.replace('wheel', 'brake'), b, {
      label: 'Brake drum', note: '16 in. finned drum, rod operated', system: 'brakes', anchor: V3(x, WY + 0.2, s * 0.62),
    });
  }

  // ── Engine ────────────────────────────────────────────────────
  const engine = buildEngine(m);
  engine.root.position.copy(DIM.ENGINE);
  addPart('engine', engine.root, {
    label: 'Engine', note: '6½ litres, straight six', system: 'engine', anchor: V3(1.2, 1.12, 0.12),
  });

  // ── Gearbox with external change lever ───────────────────────
  const gbox = new THREE.Group();
  {
    const g = [];
    const body = latheX([[0.06, -0.16], [0.11, -0.14], [0.12, 0.0], [0.12, 0.26], [0.13, 0.33], [0.11, 0.36], [0.05, 0.37]], 32);
    g.push(body);
    const top = roundedBox(0.36, 0.06, 0.2, 0.02);
    top.translate(0.08, 0.12, 0);
    g.push(top);
    const mesh1 = mesh(merge(g), m.castAlu);
    mesh1.position.set(0, 0.6, 0);
    gbox.add(mesh1);
    gbox.add(mesh(rod(V3(-0.05, 0.66, 0.08), V3(-0.05, 0.66, 0.62), 0.012, 0.012, 10), m.darkSteel));
    gbox.add(mesh(rod(V3(-0.05, 0.62, 0.62), V3(-0.09, 1.1, 0.63), 0.009, 0.007, 10), m.chrome));
    gbox.add(mesh(new THREE.SphereGeometry(0.024, 16, 12).translate(-0.09, 1.12, 0.63), m.blackEnamel));
    const gate = roundedBox(0.16, 0.024, 0.04, 0.008);
    gate.translate(-0.05, 0.92, 0.62);
    gbox.add(mesh(gate, m.chrome));
  }
  addPart('gearbox', centred(gbox), {
    label: 'Four-speed gearbox', note: 'Right-hand change, outside the body', system: 'transmission', anchor: V3(0.15, 0.72, 0.08),
  });

  // ── Propeller shaft ──────────────────────────────────────────
  const prop = new THREE.Group();
  {
    const A = V3(-0.2, 0.6, 0), B = V3(RX + 0.28, WY + 0.02, 0);
    prop.add(mesh(rod(A, B, 0.028, 0.028, 16), m.blackEnamel));
    for (const p of [A, B]) {
      const uj = new THREE.Group();
      uj.add(mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 16).rotateY(Math.PI / 2), m.steel));
      uj.add(mesh(rod(V3(0, -0.035, 0), V3(0, 0.035, 0), 0.008, 0.008, 8), m.steel));
      uj.position.copy(p);
      prop.add(uj);
    }
  }
  addPart('propshaft', centred(prop), {
    label: 'Propeller shaft', note: 'Open shaft with two universal joints', system: 'drivetrain', anchor: V3(-0.9, 0.53, 0.03),
  });

  // ── Exhaust system ───────────────────────────────────────────
  const exh = new THREE.Group();
  {
    const z = 0.31;
    const pipe = tube([
      [0.53, 0.5, 0.3], [0.42, 0.46, z], [0.22, 0.46, z], [0.12, 0.46, z],
    ], 0.026, { segs: 16 });
    const pipe2 = tube([
      [-0.92, 0.46, z], [-1.2, 0.46, z], [-1.45, 0.52, z], [-1.7, 0.62, z], [-1.95, 0.55, z], [-2.2, 0.48, z], [-2.36, 0.47, z],
    ], 0.026, { segs: 60 });
    exh.add(mesh(merge([pipe, pipe2]), m.darkSteel));
    const sil = latheX([[0.02, -0.92], [0.06, -0.9], [0.075, -0.85], [0.075, 0.07], [0.06, 0.11], [0.02, 0.13]], 32);
    sil.translate(0, 0.46, z);
    exh.add(mesh(sil, m.darkSteel));
    const fish = latheX([[0.026, -2.36], [0.03, -2.4], [0.05, -2.47], [0.055, -2.48]].map(([r, x]) => [r, x]).reverse(), 24);
    fish.scale(1, 0.45, 1.35);
    fish.translate(0, 0.47, z);
    exh.add(mesh(fish, m.chrome));
  }
  addPart('exhaust', centred(exh), {
    label: 'Exhaust system', note: 'Long silencer, fishtail outlet', system: 'exhaust', anchor: V3(-0.4, 0.53, 0.33),
  });

  // ── Radiator core and hoses (cooling) ────────────────────────
  const rad = new THREE.Group();
  {
    const core = mesh(new THREE.BoxGeometry(0.08, 0.56, 0.46), m.radiatorCore);
    core.position.set(1.8, 0.92, 0);
    rad.add(core);
    const tank = roundedBox(0.1, 0.06, 0.48, 0.02);
    tank.translate(1.8, 1.22, 0);
    const tank2 = roundedBox(0.1, 0.05, 0.48, 0.02);
    tank2.translate(1.8, 0.62, 0);
    rad.add(mesh(merge([tank, tank2]), m.brass));
    const top = tube([[1.76, 1.17, 0], [1.7, 1.12, 0], [1.64, 1.06, 0], [1.6, 1.04, 0]], 0.026, { segs: 16 });
    const bot = tube([[1.76, 0.68, 0], [1.68, 0.7, -0.06], [1.6, 0.76, -0.11], [1.56, 0.8, -0.12]], 0.026, { segs: 16 });
    rad.add(mesh(merge([top, bot]), m.rubber));
  }
  addPart('radiator', centred(rad), {
    label: 'Radiator', note: 'Honeycomb core, 4½ gallons of water', system: 'cooling', anchor: V3(1.84, 1.0, 0.18),
  });

  // ── Radiator shell, stone guard, badge and cap ───────────────
  const grille = new THREE.Group();
  {
    const cy = 0.93, a = 0.27, b = 0.315;
    const outline = superellipse(a, b, 5, 96);
    const pathPts = outline.map((p) => V3(1.87, cy + p.y, p.x));
    const pc = new THREE.CatmullRomCurve3(pathPts, true, 'centripetal');
    const shell = sweep({
      path: (t) => pc.getPointAt(t), closedPath: true, up: V3(1, 0, 0), steps: 160, closed: true,
      profile: () => roundedRect(0.085, 0.05, 0.018, 3).map((p) => V2(p.x, p.y)),
    });
    grille.add(mesh(shell, m.chrome));
    const guardShape = new THREE.Shape(superellipse(a - 0.012, b - 0.012, 5, 64));
    const guard = new THREE.ShapeGeometry(guardShape, 8);
    const uv = guard.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / (2 * a) + 0.5, uv.getY(i) / (2 * b) + 0.5);
    guard.rotateY(Math.PI / 2);
    guard.translate(1.9, cy, 0);
    grille.add(mesh(guard, m.stoneGuard, { cast: false }));
    const badge = new THREE.PlaneGeometry(0.22, 0.11);
    badge.rotateY(Math.PI / 2);
    badge.translate(1.915, 1.19, 0);
    grille.add(mesh(badge, m.badge, { cast: false }));
    const cap = lathe([[0, 0], [0.045, 0], [0.05, 0.02], [0.035, 0.035], [0.02, 0.06], [0.03, 0.075], [0.03, 0.09], [0, 0.095]], 32);
    cap.translate(1.85, 1.245, 0);
    grille.add(mesh(cap, m.chrome));
    // Motometer
    const mm = new THREE.Group();
    mm.add(mesh(latheZ([[0, -0.012], [0.03, -0.012], [0.032, 0], [0.03, 0.012], [0, 0.012]], 32), m.chrome));
    mm.add(mesh(new THREE.CircleGeometry(0.026, 32).translate(0, 0, 0.0125), m.gauges.oil));
    mm.rotation.y = Math.PI / 2;
    mm.position.set(1.85, 1.375, 0);
    grille.add(mm);
  }
  addPart('grille', centred(grille), {
    label: 'Radiator shell and stone guard', note: 'Nickel-plated brass, woven wire guard', system: 'body', anchor: V3(1.9, 1.08, -0.2),
  });

  // ── Lamps ────────────────────────────────────────────────────
  function lamp(r, depth) {
    const g = new THREE.Group();
    const s = r / 0.13;
    g.add(mesh(latheX([[0, -0.13], [0.06, -0.12], [0.1, -0.09], [0.125, -0.04], [0.13, 0.015], [0.137, 0.028], [0.132, 0.042], [0.118, 0.044]].map(([a, b]) => [a * s, b * s * depth]), 48), m.chrome));
    g.add(mesh(latheX([[0, -0.1], [0.05, -0.09], [0.1, -0.04], [0.118, 0.02], [0.113, 0.02]].map(([a, b]) => [a * s, b * s * depth]).reverse(), 48), m.reflector));
    g.add(mesh(new THREE.CircleGeometry(0.118 * s, 48).rotateY(Math.PI / 2).translate(0.04 * s * depth, 0, 0), m.lens, { cast: false }));
    const bulb = new THREE.SphereGeometry(0.018 * s, 16, 12);
    bulb.translate(-0.02 * s, 0, 0);
    g.add(mesh(bulb, m.porcelain, { cast: false }));
    return g;
  }
  const lamps = new THREE.Group();
  {
    const bar = tube([[1.95, 0.86, -0.66], [1.97, 0.8, -0.45], [1.98, 0.78, 0], [1.97, 0.8, 0.45], [1.95, 0.86, 0.66]], 0.016, { segs: 50 });
    lamps.add(mesh(bar, m.chrome));
    for (const s of [-1, 1]) {
      const L = lamp(0.13, 1);
      // wire stone guard over each headlamp
      const guard = new THREE.CircleGeometry(0.122, 40);
      const uv = guard.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
      guard.rotateY(Math.PI / 2);
      guard.translate(0.05, 0, 0);
      L.add(mesh(guard, m.stoneGuard, { cast: false }));
      L.position.set(2.0, 0.99, s * 0.43);
      lamps.add(L);
      lamps.add(mesh(rod(V3(1.98, 0.79, s * 0.43), V3(1.96, 0.88, s * 0.43), 0.014, 0.014, 10), m.chrome));
    }
    const pass = lamp(0.075, 1);
    pass.position.set(2.04, 0.8, 0);
    lamps.add(pass);
  }
  addPart('lamps', centred(lamps), {
    label: 'Headlamps', note: '10 in. reflectors behind wire guards', system: 'body', anchor: V3(2.06, 1.02, 0.5),
  });

  // ── Bonnet with louvres and leather straps ───────────────────
  const BON = { x0: 0.42, x1: 1.76 };
  const bonnetAt = (t) => ({
    hw: lerp(0.31, 0.278, t), top: lerp(1.225, 1.2, t), crown: 0.15, bottom: 0.72,
  });
  const bonnet = new THREE.Group();
  {
    const shell = sweep({
      path: (t) => V3(lerp(BON.x0, BON.x1, t), 0, 0),
      profile: (t) => { const p = bonnetAt(t); return hoodProfile(p.hw, p.top, p.crown, p.bottom); },
      steps: 40,
    });
    const shellMat = m.paint.clone();
    shellMat.side = THREE.DoubleSide;
    bonnet.add(mesh(shell, shellMat));
    // Centre hinge
    bonnet.add(mesh(rod(V3(BON.x0, 1.229, 0), V3(BON.x1, 1.204, 0), 0.008, 0.008, 10), m.chrome));
    // Louvres: raised pressings with a dark slot beneath each
    const louv = [], slots = [];
    for (let i = 0; i < 17; i++) {
      const x = 0.66 + i * 0.054;
      const t = (x - BON.x0) / (BON.x1 - BON.x0);
      const hw = bonnetAt(t).hw;
      for (const s of [-1, 1]) {
        const l = new THREE.CylinderGeometry(0.009, 0.009, 0.2, 12, 1, false, 0, Math.PI);
        l.rotateY(s > 0 ? Math.PI / 2 : -Math.PI / 2);
        l.scale(1, 1, 0.8);
        l.translate(x, 0.91, s * (hw + 0.004));
        louv.push(l);
        const sl = new THREE.BoxGeometry(0.006, 0.19, 0.004);
        sl.translate(x - 0.011, 0.91, s * (hw + 0.002));
        slots.push(sl);
      }
    }
    bonnet.add(mesh(merge(louv), m.paint));
    bonnet.add(mesh(merge(slots), m.rubber, { cast: false }));
    // Straps
    for (const x of [1.4, 0.98]) {
      const t = (x - BON.x0) / (BON.x1 - BON.x0);
      const p = bonnetAt(t);
      const prof = hoodProfile(p.hw + 0.007, p.top + 0.007, p.crown + 0.007, p.bottom + 0.1);
      const pts = prof.map((q) => V3(x, q.y, q.x));
      const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const strap = sweep({
        path: (tt) => c.getPointAt(tt), up: V3(1, 0, 0), steps: 70, closed: true,
        profile: () => [V2(0.024, -0.003), V2(0.024, 0.003), V2(-0.024, 0.003), V2(-0.024, -0.003)],
      });
      bonnet.add(mesh(strap, m.strap));
      for (const s of [-1, 1]) {
        const buckle = roundedBox(0.05, 0.035, 0.012, 0.004);
        buckle.translate(x, 1.0, s * (p.hw + 0.016));
        bonnet.add(mesh(buckle, m.chrome));
      }
    }
  }
  addPart('bonnet', centred(bonnet), {
    label: 'Bonnet', note: 'Louvred side panels, leather straps', system: 'body', anchor: V3(1.2, 1.215, 0.12),
  });

  // ── Scuttle (cowl) ───────────────────────────────────────────
  const scuttle = new THREE.Group();
  {
    const g = sweep({
      path: (t) => V3(lerp(-0.13, BON.x0 + 0.002, t), 0, 0),
      profile: (t) => {
        const e = sstep(0, 1, t);
        return hoodProfile(lerp(0.552, 0.31, Math.pow(e, 0.7)), lerp(1.27, 1.226, e), lerp(0.2, 0.15, e), 0.7);
      },
      steps: 30, capStart: true,
    });
    const mat = m.paint.clone();
    mat.side = THREE.DoubleSide;
    scuttle.add(mesh(g, mat));
    // Fuel autovac on the bulkhead
    scuttle.add(mesh(lathe([[0, 0], [0.05, 0], [0.05, 0.16], [0.03, 0.18], [0, 0.18]], 24).translate(0.3, 0.86, -0.22), m.blackEnamel));
  }
  addPart('scuttle', centred(scuttle), {
    label: 'Scuttle', note: 'Steel cowl between bonnet and screen', system: 'body', anchor: V3(0.1, 1.24, 0.2),
  });

  // ── Body tub ─────────────────────────────────────────────────
  const TUB = { x0: -2.0, x1: -0.125 };
  const tubAt = (x) => {
    const d = Math.max(0, (-1.72 - x) / 0.3);
    const hw = 0.552 * Math.sqrt(Math.max(0.2, 1 - d * d * 0.5));
    const top = lerp(1.09, 1.12, (x - TUB.x0) / (TUB.x1 - TUB.x0));
    const bottom = lerp(0.84, 0.7, sstep(-1.55, -1.3, x));
    return { hw, top, bottom };
  };
  const body = new THREE.Group();
  {
    const g = sweep({
      path: (t) => V3(lerp(TUB.x0, TUB.x1, t), 0, 0),
      profile: (t) => { const p = tubAt(lerp(TUB.x0, TUB.x1, t)); return tubProfile(p.hw, p.top, p.bottom); },
      steps: 80, capStart: true,
    });
    const mat = m.paint.clone();
    mat.side = THREE.DoubleSide;
    body.add(mesh(g, mat));
    // Shut lines either side of each door
    const lines = [];
    for (const x of [-0.31, -0.86, -1.04, -1.56]) {
      const p = tubAt(x);
      for (const s of [-1, 1]) {
        const l = new THREE.BoxGeometry(0.004, p.top - p.bottom - 0.1, 0.003);
        l.translate(x, (p.top + p.bottom) / 2 - 0.02, s * (p.hw + 0.016));
        lines.push(l);
      }
    }
    body.add(mesh(merge(lines), m.rubber, { cast: false }));
  }
  addPart('body', centred(body), {
    label: 'Tourer body', note: 'Ash frame, steel panels, hand finished', system: 'body', anchor: V3(-1.25, 0.95, 0.56),
  });

  // ── Doors ────────────────────────────────────────────────────
  const doorDefs = [['doorFR', -0.86, -0.31, 1], ['doorFL', -0.86, -0.31, -1], ['doorRR', -1.56, -1.04, 1], ['doorRL', -1.56, -1.04, -1]];
  for (const [key, xa, xb, s] of doorDefs) {
    const d = new THREE.Group();
    const g = sweep({
      path: (t) => V3(lerp(xa + 0.004, xb - 0.004, t), 0, 0),
      profile: (t) => {
        const p = tubAt(lerp(xa, xb, t));
        const full = tubProfile(p.hw + 0.004, p.top, p.bottom);
        const side = full.slice(2, 8);
        return s > 0 ? side : side.map((q) => V2(-q.x, q.y)).reverse();
      },
      steps: 20, closed: false,
    });
    const mat = m.paint.clone();
    mat.side = THREE.DoubleSide;
    d.add(mesh(g, mat));
    const p = tubAt(xb);
    const handle = new THREE.Group();
    handle.add(mesh(roundedBox(0.075, 0.016, 0.014, 0.006), m.chrome));
    handle.add(mesh(rod(V3(0.03, 0, -0.012), V3(0.03, 0, 0.0), 0.007, 0.007, 8), m.chrome));
    handle.position.set(xb - 0.08, p.top - 0.07, s * (p.hw + 0.03));
    d.add(handle);
    addPart(key, centred(d), {
      label: 'Door', note: 'Cut-down tourer door', system: 'body', anchor: V3(xb - 0.08, p.top - 0.07, s * (p.hw + 0.03)),
    });
  }

  // ── Wings and running boards ─────────────────────────────────
  const Rw = WHEEL.R + 0.09;
  const arcPts = (cx, a0, a1, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = lerp(a0, a1, i / n) * (Math.PI / 180);
      out.push([cx + Rw * Math.cos(a), WY + Rw * Math.sin(a), 0]);
    }
    return out;
  };
  const frontPath = curvePath([[0.7, 0.43, 0], [0.92, 0.47, 0], [1.06, 0.58, 0], ...arcPts(FX, 148, 12, 9)], { type: 'centripetal' });
  const rearPath = curvePath([...arcPts(RX, 168, 32, 9), [-1.08, 0.56, 0], [-0.96, 0.43, 0]], { type: 'centripetal' });

  function sideLamp() {
    const g = lamp(0.045, 1.4);
    return g;
  }

  for (const s of [-1, 1]) {
    const fw = new THREE.Group();
    const g = sweep({
      path: frontPath.at, steps: 90, closed: true,
      profile: (t) => wingSection(lerp(0.31, 0.27, sstep(0, 0.25, t)), 0.05, 0.035),
    });
    g.translate(0, 0, s * WZ);
    fw.add(mesh(g, m.paint));
    const sl = sideLamp();
    sl.position.set(FX - 0.05, WY + Rw + 0.075, s * WZ);
    fw.add(sl);
    fw.add(mesh(rod(V3(FX - 0.05, WY + Rw + 0.04, s * WZ), V3(FX - 0.05, WY + Rw + 0.01, s * WZ), 0.01, 0.014, 10), m.chrome));
    // wing stay to the frame
    fw.add(mesh(rod(V3(FX + 0.25, 0.85, s * (WZ - 0.1)), V3(FX + 0.3, 0.62, s * 0.43), 0.009, 0.009, 8), m.blackEnamel));
    addPart(s > 0 ? 'wingFR' : 'wingFL', centred(fw), {
      label: 'Front wing', note: 'Flowing steel wing with side lamp', system: 'body', anchor: V3(FX + 0.32, WY + 0.43, s * (WZ + 0.12)),
    });

    const rw = new THREE.Group();
    const g2 = sweep({
      path: rearPath.at, steps: 80, closed: true,
      profile: (t) => wingSection(lerp(0.27, 0.31, sstep(0.75, 1, t)), 0.05, 0.035),
    });
    g2.translate(0, 0, s * WZ);
    rw.add(mesh(g2, m.paint));
    addPart(s > 0 ? 'wingRR' : 'wingRL', centred(rw), {
      label: 'Rear wing', note: 'Matched to the front wing line', system: 'body', anchor: V3(RX - 0.3, WY + 0.45, s * (WZ + 0.12)),
    });

    const rb = new THREE.Group();
    const board = roundedBox(1.7, 0.026, 0.3, 0.008);
    board.translate(-0.12, 0.418, s * WZ);
    rb.add(mesh(board, m.blackEnamel));
    const strips = [];
    for (let k = 0; k < 6; k++) {
      const st = roundedBox(1.64, 0.008, 0.012, 0.003);
      st.translate(-0.12, 0.434, s * (WZ - 0.11 + k * 0.044));
      strips.push(st);
    }
    rb.add(mesh(merge(strips), m.aluminium));
    const edge = roundedBox(1.7, 0.03, 0.012, 0.005);
    edge.translate(-0.12, 0.42, s * (WZ + 0.152));
    rb.add(mesh(edge, m.chrome));
    // valance between board and body
    const val = new THREE.BoxGeometry(1.7, 0.27, 0.01);
    val.translate(-0.12, 0.565, s * 0.555);
    rb.add(mesh(val, m.paint));
    addPart(s > 0 ? 'runningBoardR' : 'runningBoardL', centred(rb), {
      label: 'Running board', note: 'Ribbed aluminium tread strips', system: 'body', anchor: V3(-0.3, 0.44, s * (WZ + 0.1)),
    });
  }

  // ── Windscreen ───────────────────────────────────────────────
  const screen = new THREE.Group();
  {
    const inner = new THREE.Group();
    const w = 1.02, h = 0.36;
    const outline = roundedRect(w, h, 0.03, 4).map((p) => V3(0, p.y + h / 2, p.x));
    const c = new THREE.CatmullRomCurve3(outline, true, 'centripetal');
    inner.add(mesh(sweep({
      path: (t) => c.getPointAt(t), closedPath: true, up: V3(1, 0, 0), steps: 120, closed: true,
      profile: () => roundedRect(0.024, 0.022, 0.008, 2),
    }), m.chrome));
    const glass = new THREE.PlaneGeometry(w - 0.02, h - 0.02);
    glass.rotateY(Math.PI / 2);
    glass.translate(0, h / 2, 0);
    inner.add(mesh(glass, m.glass, { cast: false }));
    inner.add(mesh(rod(V3(0, h * 0.52, -w / 2), V3(0, h * 0.52, w / 2), 0.006, 0.006, 8), m.chrome));
    // wipers
    for (const z of [-0.22, 0.22]) {
      inner.add(mesh(rod(V3(0.01, h, z), V3(0.012, h - 0.24, z + 0.1), 0.0035, 0.0035, 6), m.darkSteel));
    }
    inner.position.set(-0.1, 1.27, 0);
    inner.rotation.z = 0.14;
    screen.add(inner);
    for (const s of [-1, 1]) {
      screen.add(mesh(rod(V3(-0.1, 1.16, s * 0.53), V3(-0.12, 1.47, s * 0.53), 0.014, 0.011, 10), m.chrome));
    }
    // mirror
    const mir = new THREE.Group();
    mir.add(mesh(latheX([[0, -0.012], [0.05, -0.01], [0.05, 0.004], [0, 0.006]].reverse(), 32), m.chrome));
    mir.add(mesh(new THREE.CircleGeometry(0.046, 32).rotateY(-Math.PI / 2).translate(-0.013, 0, 0), m.reflector));
    mir.position.set(-0.17, 1.69, 0.32);
    screen.add(mir);
  }
  addPart('windscreen', centred(screen), {
    label: 'Windscreen', note: 'Twin-pane, nickel frame', system: 'body', anchor: V3(-0.16, 1.62, -0.35),
  });

  // ── Folded hood ──────────────────────────────────────────────
  const hood = new THREE.Group();
  {
    const g = sweep({
      path: (t) => V3(0, 0, lerp(-0.47, 0.47, t)), up: V3(1, 0, 0), steps: 30, closed: true, capStart: true, capEnd: true,
      profile: (t) => {
        const k = 1 - 0.25 * Math.pow(Math.abs(t - 0.5) * 2, 6);
        return roundedRect(0.34 * k, 0.15 * k, 0.07 * k, 6);
      },
    });
    g.translate(-1.97, 1.16, 0);
    hood.add(mesh(g, m.hood));
    for (const s of [-1, 1]) {
      hood.add(mesh(rod(V3(-1.72, 1.08, s * 0.5), V3(-2.02, 1.12, s * 0.49), 0.012, 0.012, 8), m.blackEnamel));
    }
  }
  addPart('hood', centred(hood), {
    label: 'Folded hood', note: 'Black twill, stowed behind the rear seat', system: 'body', anchor: V3(-1.92, 1.24, 0.3),
  });

  // ── Fuel tank, filler and tail lamp ─────────────────────────
  const tank = new THREE.Group();
  {
    const tb = roundedBox(0.4, 0.3, 0.86, 0.06, 4);
    tb.translate(-2.38, 0.69, 0);
    tank.add(mesh(tb, m.paint));
    for (const z of [-0.3, 0.3]) {
      const band = roundedBox(0.42, 0.32, 0.03, 0.065);
      band.translate(-2.38, 0.69, z);
      tank.add(mesh(band, m.blackEnamel));
    }
    const filler = lathe([[0, 0], [0.075, 0], [0.08, 0.02], [0.07, 0.04], [0.06, 0.045], [0, 0.046]], 40);
    filler.translate(-2.36, 0.84, 0.24);
    tank.add(mesh(filler, m.chrome));
    tank.add(mesh(roundedBox(0.03, 0.012, 0.12, 0.005).translate(-2.36, 0.89, 0.24), m.chrome));
    for (const z of [-0.43, 0.43]) {
      tank.add(mesh(rod(V3(-2.18, 0.66, z * 0.93), V3(-2.12, 0.66, z * 0.93), 0.012, 0.012, 8), m.blackEnamel));
    }
    const tl = new THREE.Group();
    tl.add(mesh(latheX([[0, -0.05], [0.04, -0.045], [0.045, 0.0], [0, 0.002]], 24), m.chrome));
    tl.add(mesh(new THREE.CircleGeometry(0.038, 24).rotateY(-Math.PI / 2).translate(-0.051, 0, 0), m.tailLens));
    tl.position.set(-2.55, 0.66, -0.38);
    tl.rotation.y = 0;
    tank.add(tl);
    // Copper fuel line forward to the autovac
    const line = tube([
      [-2.18, 0.6, -0.32], [-1.6, 0.6, -0.33], [-0.5, 0.6, -0.33], [0.2, 0.62, -0.32], [0.32, 0.8, -0.24], [0.3, 0.86, -0.22],
    ], 0.006, { segs: 80, radial: 6 });
    tank.add(mesh(line, m.copper, { cast: false }));
  }
  addPart('fuelTank', centred(tank), {
    label: 'Fuel tank', note: '25 gallons, quick-release filler', system: 'fuel', anchor: V3(-2.36, 0.88, 0.24),
  });

  // ── Steering gear ────────────────────────────────────────────
  const WHEEL_POS = V3(-0.36, 1.19, 0.3);
  const BOX_POS = V3(1.24, 0.64, 0.22);
  const colDir = WHEEL_POS.clone().sub(BOX_POS).normalize();
  const steer = new THREE.Group();
  {
    const box = new THREE.Group();
    box.add(mesh(rod(V3(0, -0.08, 0), V3(0, 0.08, 0), 0.05, 0.05, 20), m.castAlu));
    box.position.copy(BOX_POS);
    box.quaternion.setFromUnitVectors(V3(0, 1, 0), colDir);
    steer.add(box);
    steer.add(mesh(rod(BOX_POS, WHEEL_POS.clone().addScaledVector(colDir, -0.06), 0.02, 0.02, 12), m.blackEnamel));
    const g = [];
    g.push(rod(V3(1.24, 0.6, 0.23), V3(1.24, 0.46, 0.25), 0.012, 0.012, 8)); // drop arm
    g.push(rod(V3(1.24, 0.46, 0.25), V3(FX - 0.03, 0.46, 0.53), 0.011, 0.011, 8)); // drag link
    g.push(rod(V3(FX - 0.03, 0.46, 0.53), V3(FX, 0.47, 0.56), 0.011, 0.011, 8));
    g.push(rod(V3(1.45, 0.42, -0.55), V3(1.45, 0.42, 0.55), 0.012, 0.012, 10)); // track rod
    for (const s of [-1, 1]) g.push(rod(V3(1.45, 0.42, s * 0.55), V3(FX, 0.45, s * 0.565), 0.012, 0.012, 8));
    steer.add(mesh(merge(g), m.darkSteel));
  }
  addPart('steering', centred(steer), {
    label: 'Steering gear', note: 'Worm and wheel, drag link to the right stub axle', system: 'steering', anchor: V3(1.24, 0.66, 0.26),
  });

  // ── Brake rods and outside handbrake ─────────────────────────
  const brakeRods = new THREE.Group();
  {
    const g = [];
    for (const s of [-1, 1]) {
      g.push(rod(V3(-0.1, 0.56, s * 0.47), V3(FX - 0.06, 0.6, s * 0.5), 0.006, 0.006, 6));
      g.push(rod(V3(-0.1, 0.56, s * 0.47), V3(RX - 0.06, 0.6, s * 0.5), 0.006, 0.006, 6));
    }
    g.push(rod(V3(-0.1, 0.56, -0.47), V3(-0.1, 0.56, 0.62), 0.014, 0.014, 10));
    brakeRods.add(mesh(merge(g), m.darkSteel));
    brakeRods.add(mesh(rod(V3(-0.52, 0.6, 0.62), V3(-0.57, 1.1, 0.63), 0.01, 0.008, 10), m.chrome));
    brakeRods.add(mesh(rod(V3(-0.57, 1.1, 0.63), V3(-0.57, 1.15, 0.63), 0.009, 0.009, 10), m.chrome));
    const quad = new THREE.TorusGeometry(0.22, 0.01, 6, 24, 0.7);
    quad.rotateZ(1.2);
    quad.translate(-0.45, 0.62, 0.62);
    brakeRods.add(mesh(quad, m.chrome));
  }
  addPart('brakeRods', centred(brakeRods), {
    label: 'Brake linkage', note: 'Rods to all four drums; handbrake outside the body', system: 'brakes', anchor: V3(-0.57, 1.12, 0.64),
  });

  // ── Interior ─────────────────────────────────────────────────
  function pleatedBack(width, height, pleats, tilt) {
    const g = new THREE.Group();
    const pw = width / pleats;
    for (let i = 0; i < pleats; i++) {
      const z = -width / 2 + pw * (i + 0.5);
      const curve = 0.05 * Math.pow((z / (width / 2)), 2);
      const p = new THREE.CapsuleGeometry(pw * 0.52, height - pw, 6, 12);
      p.scale(0.55, 1, 1);
      p.translate(curve * 1.0, height / 2, z);
      g.add(mesh(p, m.leather));
    }
    const roll = new THREE.CapsuleGeometry(0.04, width - 0.06, 6, 16);
    roll.rotateX(Math.PI / 2);
    roll.translate(0.0, height + 0.01, 0);
    g.add(mesh(roll, m.leather));
    g.rotation.z = tilt;
    return g;
  }
  function cushion(depth, width, pleats) {
    const g = new THREE.Group();
    const pw = width / pleats;
    for (let i = 0; i < pleats; i++) {
      const c = new THREE.CapsuleGeometry(pw * 0.5, depth - pw, 6, 12);
      c.rotateZ(Math.PI / 2);
      c.scale(1, 0.5, 1);
      c.translate(0, 0, -width / 2 + pw * (i + 0.5));
      g.add(mesh(c, m.leather));
    }
    const base = roundedBox(depth, 0.08, width, 0.02);
    base.translate(0, -0.06, 0);
    g.add(mesh(base, m.leather));
    return g;
  }

  const seatsF = new THREE.Group();
  for (const s of [-1, 1]) {
    const seat = new THREE.Group();
    const c = cushion(0.46, 0.44, 5);
    c.position.set(0, 0.86, 0);
    seat.add(c);
    const b = pleatedBack(0.44, 0.48, 5, 0.2);
    b.position.set(-0.24, 0.86, 0);
    seat.add(b);
    seat.position.set(-0.72, 0, s * 0.27);
    seatsF.add(seat);
  }
  addPart('seatsFront', centred(seatsF), {
    label: 'Front seats', note: 'Hand-pleated hide over horsehair', system: 'interior', anchor: V3(-0.98, 1.3, 0.27),
  });

  const seatR = new THREE.Group();
  {
    const c = cushion(0.42, 0.96, 10);
    c.position.set(-1.5, 0.94, 0);
    seatR.add(c);
    const b = pleatedBack(0.98, 0.34, 10, 0.24);
    b.position.set(-1.74, 0.94, 0);
    seatR.add(b);
  }
  addPart('seatRear', centred(seatR), {
    label: 'Rear seat', note: 'Bench for two, matched pleats', system: 'interior', anchor: V3(-1.5, 1.02, -0.35),
  });

  const dash = new THREE.Group();
  {
    const board = roundedBox(0.03, 0.22, 1.04, 0.012);
    board.translate(-0.15, 1.06, 0);
    dash.add(mesh(board, m.walnut));
    const gauges = [[0.3, 1.08, 'speed', 0.06], [0.12, 1.08, 'rev', 0.06], [-0.08, 1.1, 'oil', 0.04], [-0.24, 1.1, 'fuel', 0.04]];
    for (const [z, y, kind, r] of gauges) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CircleGeometry(r, 40), m.gauges[kind], { cast: false }));
      g.add(mesh(new THREE.TorusGeometry(r + 0.006, 0.007, 8, 40), m.chrome));
      g.rotation.y = -Math.PI / 2;
      g.position.set(-0.177, y, z);
      dash.add(g);
    }
    for (let i = 0; i < 5; i++) {
      const sw = rod(V3(-0.17, 0.99, -0.05 + i * 0.05), V3(-0.195, 0.99, -0.05 + i * 0.05), 0.006, 0.006, 8);
      dash.add(mesh(sw, m.chrome, { cast: false }));
    }
  }
  addPart('dashboard', centred(dash), {
    label: 'Dashboard', note: 'Burr walnut, four instruments', system: 'interior', anchor: V3(-0.17, 1.1, 0.3),
  });

  const sw = new THREE.Group();
  {
    const inner = new THREE.Group();
    inner.add(mesh(new THREE.TorusGeometry(0.23, 0.013, 12, 72), m.blackEnamel));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      for (const off of [-0.012, 0.012]) {
        inner.add(mesh(rod(V3(0, 0, 0.03), V3(Math.cos(a) * 0.225 + off * Math.sin(a), Math.sin(a) * 0.225 - off * Math.cos(a), 0), 0.003, 0.003, 6), m.chrome));
      }
    }
    inner.add(mesh(latheZ([[0, -0.03], [0.04, -0.03], [0.045, 0.02], [0.03, 0.04], [0, 0.042]], 32), m.chrome));
    inner.add(mesh(new THREE.CircleGeometry(0.028, 24).translate(0, 0, 0.043), m.blackEnamel));
    inner.position.copy(WHEEL_POS);
    inner.quaternion.setFromUnitVectors(V3(0, 0, -1), colDir);
    sw.add(inner);
  }
  addPart('steeringWheel', centred(sw), {
    label: 'Steering wheel', note: '18 in. sprung spokes', system: 'interior', anchor: WHEEL_POS.clone().add(V3(0, 0.2, 0.15)),
  });

  const trim = new THREE.Group();
  {
    const g = sweep({
      path: (t) => V3(lerp(TUB.x0 + 0.03, TUB.x1 - 0.005, t), 0, 0),
      profile: (t) => {
        const p = tubAt(lerp(TUB.x0 + 0.03, TUB.x1, t));
        const hw = p.hw - 0.032;
        const fl = p.bottom + 0.05;
        const L = [V2(hw, p.top - 0.01), V2(hw, lerp(p.top, fl, 0.5)), V2(hw - 0.01, fl), V2(hw - 0.05, fl)];
        return [...L, ...L.map((q) => V2(-q.x, q.y)).reverse()];
      },
      steps: 60,
    });
    const lm = m.leather.clone();
    lm.side = THREE.DoubleSide;
    trim.add(mesh(g, lm));
    // Cockpit roll along the top edge
    const rollPts = [];
    for (let i = 0; i <= 30; i++) {
      const x = lerp(TUB.x1 - 0.01, TUB.x0 + 0.06, i / 30);
      const p = tubAt(x);
      rollPts.push(V3(x, p.top + 0.008, p.hw - 0.028));
    }
    const back = rollPts.slice().reverse().map((p) => V3(p.x, p.y, -p.z));
    const roll = tube([...rollPts, V3(TUB.x0 + 0.02, tubAt(TUB.x0).top + 0.008, 0), ...back], 0.014, { segs: 200, radial: 8 });
    trim.add(mesh(roll, m.leather));
    const carpet = new THREE.PlaneGeometry(1.25, 0.96);
    carpet.rotateX(-Math.PI / 2);
    carpet.translate(-0.78, 0.752, 0);
    const carpet2 = new THREE.PlaneGeometry(0.5, 0.86);
    carpet2.rotateX(-Math.PI / 2);
    carpet2.translate(-1.68, 0.892, 0);
    trim.add(mesh(merge([carpet, carpet2]), m.carpet, { cast: false }));
  }
  addPart('trim', centred(trim), {
    label: 'Interior trim', note: 'Leather-lined, rolled cockpit edge', system: 'interior', anchor: V3(-1.2, 1.1, -0.52),
  });

  finaliseAnchors();
  return { root, parts, engine };
}
