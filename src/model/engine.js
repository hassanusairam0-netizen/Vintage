import * as THREE from 'three';
import { latheX, latheZ, lathe, rod, merge, mesh, V3, roundedBox, tube, helix, superellipse, sweep } from '../core/geo.js';

// Straight-six, single overhead camshaft. Local origin: crankshaft centre line, mid-engine.
// +X towards the radiator, +Y up, +Z to the right-hand (exhaust) side.
export const ENG = {
  r: 0.06, // crank throw (stroke 120 mm)
  l: 0.22, // connecting rod centres
  deck: 0.33,
  cylX: [0.375, 0.225, 0.075, -0.075, -0.225, -0.375],
  // crankpin phase per cylinder (deg) and firing angle in the 720° cycle, firing order 1-5-3-6-2-4
  phase: [0, 240, 120, 120, 240, 0],
  fire: [0, 480, 240, 600, 120, 360],
  valveLift: 0.011,
};

const deg = Math.PI / 180;

export function pistonPinY(alpha) {
  const { r, l } = ENG;
  const s = r * Math.sin(alpha);
  return r * Math.cos(alpha) + Math.sqrt(l * l - s * s);
}

function bump(c, center, half) {
  let d = ((c - center) % 720 + 720 + 360) % 720 - 360;
  if (Math.abs(d) >= half) return 0;
  const k = Math.cos((d / half) * (Math.PI / 2));
  return k * k;
}

/** Valve lift (m) for cylinder i at crank angle theta (rad). */
export function valveLift(i, theta, exhaust) {
  const c = (theta / deg - ENG.fire[i]);
  return ENG.valveLift * bump(c, exhaust ? 270 : 450, 115);
}

export function buildEngine(m) {
  const root = new THREE.Group();
  root.name = 'engine';
  const parts = {};
  const add = (key, obj, meta) => {
    obj.name = key;
    root.add(obj);
    parts[key] = { object: obj, ...meta };
    return obj;
  };

  // ── Block and crankcase (ghostable) ─────────────────────────────
  const block = new THREE.Group();
  const ironGeos = [];
  const bg = roundedBox(0.94, 0.33, 0.3, 0.018);
  bg.translate(0, 0.165, 0);
  ironGeos.push(bg);
  // Water jacket ribs between bores, both sides
  for (let i = 0; i < 7; i++) {
    const x = 0.45 - i * 0.15;
    for (const s of [-1, 1]) {
      const r = roundedBox(0.022, 0.29, 0.03, 0.006);
      r.translate(x, 0.17, s * 0.152);
      ironGeos.push(r);
    }
  }
  const blockIron = mesh(merge(ironGeos), m.ghostIron);
  block.add(blockIron);
  // Brass core plugs on the right flank
  const plugs = [];
  for (let i = 0; i < 6; i++) {
    const p = latheZ([[0, 0], [0.022, 0], [0.022, 0.006], [0, 0.008]], 24);
    p.translate(ENG.cylX[i], 0.2, 0.163);
    plugs.push(p);
  }
  const corePlugs = mesh(merge(plugs), m.brass.clone());
  block.add(corePlugs);
  const cc = [];
  const ccBody = roundedBox(1.0, 0.16, 0.38, 0.03);
  ccBody.translate(0, -0.08, 0);
  cc.push(ccBody);
  // Engine bearers out to the frame rails
  for (const x of [0.32, -0.36]) {
    for (const s of [-1, 1]) {
      const arm = roundedBox(0.09, 0.035, 0.25, 0.01);
      arm.translate(x, -0.02, s * 0.29);
      cc.push(arm);
    }
  }
  const crankcase = mesh(merge(cc), m.ghostAlu);
  block.add(crankcase);
  // Ghost aids: outline edges and cylinder bores
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(bg, 25), m.ghostLine);
  const edges2 = new THREE.LineSegments(new THREE.EdgesGeometry(ccBody, 25), m.ghostLine);
  block.add(edges, edges2);
  const bores = [];
  for (const x of ENG.cylX) {
    const b = new THREE.CylinderGeometry(0.05, 0.05, 0.23, 32, 1, true);
    b.translate(x, 0.215, 0);
    bores.push(b);
  }
  const boreMesh = mesh(merge(bores), m.ghostBore, { cast: false });
  boreMesh.renderOrder = 2;
  block.add(boreMesh);
  block.userData.ghost = { meshes: [blockIron, crankcase, corePlugs], lines: [edges, edges2], bores: boreMesh };
  add('block', block, { label: 'Cylinder block', note: 'Cast iron, six bores of 100 mm', anchor: V3(0.2, 0.25, 0.15) });

  // ── Crankshaft ──────────────────────────────────────────────────
  const crank = new THREE.Group();
  const cg = [];
  const mains = [0.45, 0.3, 0.15, 0, -0.15, -0.3, -0.45];
  for (const x of mains) cg.push(rod(V3(x - 0.028, 0, 0), V3(x + 0.028, 0, 0), 0.03, 0.03, 20));
  ENG.cylX.forEach((x, i) => {
    const ph = ENG.phase[i] * deg;
    const dir = V3(0, Math.cos(ph), Math.sin(ph));
    for (const s of [-1, 1]) {
      const web = roundedBox(0.016, 0.13, 0.08, 0.012);
      web.translate(0, 0.022, 0);
      web.rotateX(ph);
      web.translate(x + s * 0.044, 0, 0);
      cg.push(web);
      // counterweight
      const cw = new THREE.CylinderGeometry(0.068, 0.068, 0.016, 24, 1, false, Math.PI * 1.5 - (Math.PI - 1.2) / 2, Math.PI - 1.2);
      cw.rotateZ(Math.PI / 2);
      cw.rotateX(ph);
      cw.translate(x + s * 0.044, 0, 0);
      cg.push(cw);
    }
    const pin = rod(V3(x - 0.038, dir.y * ENG.r, dir.z * ENG.r), V3(x + 0.038, dir.y * ENG.r, dir.z * ENG.r), 0.027, 0.027, 20);
    cg.push(pin);
  });
  cg.push(rod(V3(0.47, 0, 0), V3(0.6, 0, 0), 0.024, 0.024, 16));
  cg.push(latheX([[0, -0.52], [0.09, -0.52], [0.09, -0.5], [0, -0.5]].map(([r, x]) => [r, x]), 32));
  crank.add(mesh(merge(cg), m.steel));
  add('crankshaft', crank, { label: 'Crankshaft', note: 'Seven main bearings, throws at 120°', anchor: V3(-0.15, -0.03, 0.03) });

  // ── Pistons and connecting rods ─────────────────────────────────
  const pistons = [], rods = [];
  const pistonParts = new THREE.Group();
  const rodParts = new THREE.Group();
  ENG.cylX.forEach((x, i) => {
    const ph = ENG.phase[i] * deg;
    const p = new THREE.Group();
    p.add(mesh(lathe([[0, -0.035], [0.045, -0.035], [0.046, -0.03], [0.046, 0.034], [0.044, 0.04], [0, 0.041]], 32), m.aluminium));
    for (const y of [0.028, 0.018, 0.008]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0462, 0.0016, 6, 40), m.darkSteel);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      p.add(ring);
    }
    p.add(mesh(rod(V3(-0.034, 0, 0), V3(0.034, 0, 0), 0.011, 0.011, 12), m.steel));
    p.position.set(x, pistonPinY(ph), 0);
    pistonParts.add(p);
    pistons.push({ obj: p, x, phase: ph, base: p.position.clone() });

    const r = new THREE.Group();
    const L = ENG.l;
    const rg = [];
    const small = new THREE.TorusGeometry(0.017, 0.006, 8, 20);
    small.rotateY(Math.PI / 2);
    rg.push(small);
    const shank = new THREE.CylinderGeometry(0.009, 0.014, L - 0.06, 8);
    shank.scale(1, 1, 1.9);
    shank.translate(0, -L / 2, 0);
    rg.push(shank);
    const big = new THREE.TorusGeometry(0.032, 0.009, 8, 24);
    big.rotateY(Math.PI / 2);
    big.translate(0, -L, 0);
    rg.push(big);
    const cap = roundedBox(0.026, 0.02, 0.1, 0.006);
    cap.translate(0, -L - 0.004, 0);
    rg.push(cap);
    r.add(mesh(merge(rg), m.steel));
    r.position.copy(p.position);
    rodParts.add(r);
    rods.push({ obj: r, phase: ph, base: r.position.clone() });
  });
  add('pistons', pistonParts, { label: 'Pistons', note: 'Aluminium, three rings each', anchor: V3(ENG.cylX[1], 0.28, 0.046) });
  add('rods', rodParts, { label: 'Connecting rods', note: 'Forged steel, 220 mm centres', anchor: V3(ENG.cylX[4], 0.12, 0.012) });

  // ── Cylinder head ───────────────────────────────────────────────
  const head = new THREE.Group();
  const hg = [];
  const hb = roundedBox(0.94, 0.1, 0.28, 0.012);
  hb.translate(0, 0.38, 0);
  hg.push(hb);
  ENG.cylX.forEach((x) => {
    const port = roundedBox(0.06, 0.04, 0.03, 0.008);
    port.translate(x + 0.036, 0.37, 0.15);
    hg.push(port);
    const iport = roundedBox(0.06, 0.04, 0.03, 0.008);
    iport.translate(x - 0.036, 0.37, -0.15);
    hg.push(iport);
  });
  const outlet = rod(V3(0.46, 0.4, 0), V3(0.56, 0.42, 0), 0.026, 0.024, 16);
  hg.push(outlet);
  head.add(mesh(merge(hg), m.castAlu));
  add('head', head, { label: 'Cylinder head', note: 'Four valves per cylinder in the original; two shown here', anchor: V3(0.3, 0.42, 0.14) });

  // ── Valves and springs (animated by camshaft timing) ───────────
  const valvesG = new THREE.Group();
  const valves = [];
  ENG.cylX.forEach((x, i) => {
    for (const ex of [true, false]) {
      const vx = x + (ex ? 0.036 : -0.036);
      const v = new THREE.Group();
      v.add(mesh(lathe([[0, 0.338], [0.021, 0.338], [0.021, 0.342], [0.006, 0.352], [0.0042, 0.36], [0.0042, 0.462], [0, 0.464]], 20), ex ? m.darkSteel : m.steel));
      v.add(mesh(lathe([[0, 0.455], [0.014, 0.455], [0.014, 0.46], [0, 0.46]], 20), m.steel));
      v.position.x = vx;
      const spring = mesh(helix(0.011, 0.045, 5, 0.0018, 80), m.darkSteel, { cast: false });
      spring.position.set(vx, 0.41, 0);
      valvesG.add(v, spring);
      valves.push({ obj: v, spring, cyl: i, exhaust: ex });
    }
  });
  add('valves', valvesG, { label: 'Valves and springs', note: 'Exhaust valves at the front of each bore', anchor: V3(ENG.cylX[0] + 0.036, 0.36, 0.02) });

  // ── Camshaft ────────────────────────────────────────────────────
  const cam = new THREE.Group();
  const camG = [rod(V3(-0.48, 0, 0), V3(0.5, 0, 0), 0.011, 0.011, 16)];
  ENG.cylX.forEach((x, i) => {
    for (const ex of [true, false]) {
      const peak = (ENG.fire[i] + (ex ? 270 : 450)) * deg;
      const psi = Math.PI - peak / 2;
      const vx = x + (ex ? 0.036 : -0.036);
      const lobe = rod(V3(vx - 0.009, 0, 0), V3(vx + 0.009, 0, 0), 0.019, 0.019, 24);
      lobe.translate(0, Math.cos(psi) * 0.006, Math.sin(psi) * 0.006);
      camG.push(lobe);
    }
  });
  for (let k = 0; k < 7; k++) camG.push(rod(V3(0.45 - k * 0.15 - 0.012, 0, 0), V3(0.45 - k * 0.15 + 0.012, 0, 0), 0.017, 0.017, 20));
  camG.push(rod(V3(0.5, 0, 0), V3(0.52, 0, 0), 0.04, 0.04, 30));
  cam.add(mesh(merge(camG), m.steel));
  cam.position.y = 0.49;
  add('camshaft', cam, { label: 'Overhead camshaft', note: 'Turns once for every two crank revolutions', anchor: V3(-0.1, 0.0, 0.012) });

  // ── Cam cover and vertical drive tower ─────────────────────────
  const cover = new THREE.Group();
  const cvGeo = sweep({
    path: (t) => V3(-0.48 + t * 0.98, 0.43, 0),
    profile: () => superellipse(0.13, 0.1, 3.2, 40, 0, Math.PI),
    steps: 4,
    capStart: true,
    capEnd: true,
  });
  cover.add(mesh(cvGeo, m.aluminium));
  const ribs = [];
  for (let k = 0; k < 9; k++) {
    const r = roundedBox(0.012, 0.012, 0.18, 0.004);
    r.translate(0.4 - k * 0.1, 0.528, 0);
    ribs.push(r);
  }
  cover.add(mesh(merge(ribs), m.aluminium));
  cover.add(mesh(lathe([[0, 0.52], [0.035, 0.52], [0.038, 0.545], [0.03, 0.56], [0, 0.562]], 24).translate(-0.2, 0, 0.0), m.brass));
  const vt = rod(V3(0.55, 0.0, 0.0), V3(0.55, 0.45, 0.0), 0.034, 0.034, 20);
  cover.add(mesh(vt, m.aluminium));
  add('cover', cover, { label: 'Cam cover and drive tower', note: 'A vertical shaft drives the camshaft from the crank', anchor: V3(0.0, 0.52, 0.08) });

  // ── Intake: manifold and twin carburettors ─────────────────────
  const intake = new THREE.Group();
  const ig = [];
  ig.push(rod(V3(-0.38, 0.36, -0.21), V3(0.38, 0.36, -0.21), 0.03, 0.03, 16));
  ENG.cylX.forEach((x) => ig.push(rod(V3(x - 0.036, 0.37, -0.14), V3(x - 0.036, 0.36, -0.21), 0.017, 0.02, 12)));
  for (const x of [0.19, -0.19]) ig.push(rod(V3(x, 0.355, -0.21), V3(x, 0.31, -0.29), 0.022, 0.022, 12));
  intake.add(mesh(merge(ig), m.castAlu));
  for (const x of [0.19, -0.19]) {
    const carb = new THREE.Group();
    carb.add(mesh(rod(V3(0, 0, 0.0), V3(0, 0, -0.1), 0.034, 0.034, 20), m.castAlu));
    carb.add(mesh(lathe([[0, 0], [0.034, 0], [0.034, 0.045], [0.02, 0.07], [0, 0.074]], 24).translate(0, 0.025, -0.05), m.brass));
    carb.add(mesh(lathe([[0.026, 0], [0.032, 0], [0.04, -0.03], [0.044, -0.045], [0.036, -0.045]], 24).rotateX(Math.PI / 2).translate(0, 0, -0.1), m.chrome));
    const fl = mesh(rod(V3(0, -0.05, 0), V3(0, 0.03, 0), 0.026, 0.026, 18), m.castAlu);
    fl.position.set(0.06, -0.01, -0.06);
    carb.add(fl);
    carb.position.set(x, 0.3, -0.29);
    intake.add(carb);
  }
  add('intake', intake, { label: 'Twin carburettors', note: 'Constant-vacuum, brass dashpots', anchor: V3(0.19, 0.36, -0.36) });

  // ── Exhaust manifold ───────────────────────────────────────────
  const exG = [];
  ENG.cylX.forEach((x) => exG.push(tube([V3(x + 0.036, 0.37, 0.15), V3(x + 0.03, 0.36, 0.2), V3(x + 0.0, 0.31, 0.235)], 0.019, { segs: 12, radial: 10 })));
  exG.push(tube([V3(0.42, 0.31, 0.235), V3(0, 0.3, 0.24), V3(-0.4, 0.29, 0.245), V3(-0.47, 0.22, 0.26), V3(-0.5, 0.05, 0.28), V3(-0.52, -0.12, 0.3)], 0.028, { segs: 60 }));
  const exMan = new THREE.Group();
  exMan.add(mesh(merge(exG), m.iron));
  add('exhaustManifold', exMan, { label: 'Exhaust manifold', note: 'Cast iron, six ports into one', anchor: V3(-0.1, 0.3, 0.27) });

  // ── Ignition: magneto, leads and plugs ─────────────────────────
  const ign = new THREE.Group();
  const mag = new THREE.Group();
  mag.add(mesh(rod(V3(-0.07, 0, 0), V3(0.07, 0, 0), 0.04, 0.04, 20), m.blackEnamel));
  mag.add(mesh(latheX([[0, 0.07], [0.044, 0.07], [0.044, 0.1], [0.03, 0.12], [0, 0.122]], 20), m.redLead));
  mag.position.set(0.42, 0.13, 0.22);
  ign.add(mag);
  const sparks = [];
  const plugDir = V3(0, 0.62, 0.78).normalize();
  const leads = [];
  ENG.cylX.forEach((x, i) => {
    const base = V3(x, 0.41, 0.12);
    const pl = new THREE.Group();
    pl.add(mesh(lathe([[0, 0], [0.008, 0], [0.008, 0.02], [0.014, 0.022], [0.014, 0.034], [0.009, 0.036], [0.009, 0.07], [0.005, 0.075], [0.003, 0.082], [0, 0.082]], 16), m.porcelain));
    pl.add(mesh(lathe([[0, 0.019], [0.0145, 0.019], [0.0145, 0.033], [0, 0.033]], 6), m.steel));
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), m.spark.clone());
    spark.position.y = -0.004;
    pl.add(spark);
    pl.quaternion.setFromUnitVectors(V3(0, 1, 0), plugDir);
    pl.position.copy(base);
    ign.add(pl);
    sparks.push({ mesh: spark, cyl: i });
    const term = base.clone().addScaledVector(plugDir, 0.08);
    leads.push(tube([V3(0.49, 0.15, 0.22), V3(0.5, 0.36, 0.25), V3(x + 0.04, 0.53, 0.24), term], 0.0045, { segs: 40, radial: 6 }));
  });
  ign.add(mesh(merge(leads), m.wire));
  add('ignition', ign, { label: 'Magneto and plugs', note: 'Self-generating ignition, no battery required', anchor: V3(0.42, 0.17, 0.26) });

  // ── Sump ───────────────────────────────────────────────────────
  const sump = new THREE.Group();
  const sg = [];
  const pan = roundedBox(0.82, 0.13, 0.31, 0.03);
  pan.translate(-0.01, -0.225, 0);
  sg.push(pan);
  for (let k = 0; k < 7; k++) {
    const f = roundedBox(0.76, 0.03, 0.008, 0.003);
    f.translate(-0.01, -0.29, -0.12 + k * 0.04);
    sg.push(f);
  }
  sump.add(mesh(merge(sg), m.castAlu));
  add('sump', sump, { label: 'Oil sump', note: 'Finned for cooling, 3 gallons of oil', anchor: V3(0.2, -0.27, 0.15) });

  // ── Front: water pump, fan, pulleys, belt ──────────────────────
  const front = new THREE.Group();
  front.add(mesh(latheX([[0, 0.6], [0.07, 0.6], [0.075, 0.61], [0.075, 0.635], [0.07, 0.645], [0, 0.645]], 32), m.darkSteel));
  const fanHub = new THREE.Group();
  fanHub.position.set(0.0, 0.3, 0);
  fanHub.add(mesh(latheX([[0, 0.6], [0.05, 0.6], [0.05, 0.64], [0.03, 0.66], [0, 0.66]], 28), m.darkSteel));
  for (let k = 0; k < 4; k++) {
    const blade = mesh(roundedBox(0.012, 0.16, 0.055, 0.004), m.blackEnamel);
    blade.position.set(0.665, 0, 0);
    const pivot = new THREE.Group();
    pivot.rotation.x = (k * Math.PI) / 2 + Math.PI / 4;
    blade.position.y = 0.1;
    blade.rotation.y = 0.35;
    pivot.add(blade);
    fanHub.add(pivot);
  }
  front.add(fanHub);
  front.add(mesh(new THREE.TorusGeometry(0.155, 0.007, 8, 64).rotateY(Math.PI / 2).scale(1, 1.35, 0.55).translate(0.625, 0.15, 0), m.rubber));
  front.add(mesh(rod(V3(0.5, 0.18, -0.12), V3(0.6, 0.18, -0.12), 0.04, 0.04, 20), m.castAlu));
  add('front', front, { label: 'Water pump and fan', note: 'Belt driven from the crankshaft', anchor: V3(0.665, 0.42, 0) });

  // ── Flywheel and bell housing ──────────────────────────────────
  const fly = new THREE.Group();
  fly.add(mesh(latheX([[0, -0.6], [0.165, -0.6], [0.172, -0.595], [0.172, -0.565], [0.165, -0.56], [0, -0.56]], 64), m.iron));
  const teeth = [];
  for (let k = 0; k < 72; k++) {
    const t = new THREE.BoxGeometry(0.03, 0.01, 0.008);
    t.translate(-0.58, 0.177, 0);
    t.rotateX((k / 72) * Math.PI * 2);
    teeth.push(t);
  }
  fly.add(mesh(merge(teeth), m.steel));
  add('flywheel', fly, { label: 'Flywheel', note: 'Stores momentum between power strokes', anchor: V3(-0.58, 0.16, 0.05) });

  const bell = new THREE.Group();
  bell.add(mesh(latheX([[0.21, -0.54], [0.21, -0.62], [0.17, -0.7], [0.11, -0.74], [0.09, -0.74]].map(([r, x]) => [r, x]).reverse(), 48), m.castAlu));
  const starter = mesh(rod(V3(-0.6, -0.05, -0.2), V3(-0.38, -0.05, -0.2), 0.045, 0.045, 20), m.blackEnamel);
  bell.add(starter);
  add('bellhousing', bell, { label: 'Clutch housing', note: 'Joins engine to gearbox', anchor: V3(-0.68, 0.12, 0.08) });

  // Check: every child either moves in a Part or is static. All direct children are parts.
  return { root, parts, pistons, rods, valves, cam, crank, sparks, fanHub, block, flywheel: fly };
}
