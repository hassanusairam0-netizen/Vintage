import * as THREE from 'three';
import { latheZ, rod, merge, mesh, V3, roundedBox } from '../core/geo.js';

// Dimensions in metres. Wheel axis is local +Z, outer face toward +Z.
export const WHEEL = { R: 0.44, rimR: 0.29, width: 0.15 };

/** 21-inch wire wheel with tyre, centre-lock hub and two-eared knock-off spinner. */
export function buildWheel(m) {
  const g = new THREE.Group();
  g.name = 'wheel';

  // Tyre: balloon section, beads seated on the rim
  const R = WHEEL.R, r0 = WHEEL.rimR, hw = WHEEL.width / 2;
  const prof = [];
  const steps = 28;
  // Balloon section from bead to bead: starts on the rim, swells out to the tread, returns.
  const cr = (R - r0) / 2;
  const cx = r0 + cr;
  for (let i = 0; i <= steps + 8; i++) {
    const a = -Math.PI * 0.86 + (Math.PI * 1.72 * i) / (steps + 8);
    const x = cx + Math.cos(a) * cr * 1.04;
    const y = Math.sin(a) * hw * 1.1;
    prof.push([Math.max(r0 + 0.004, x), y]);
  }
  const tyreGeo = latheZ(prof.map(([x, y]) => [x, y]), 96);
  g.add(mesh(tyreGeo, m.tyre));

  // Rim: well-base rim with beaded edges
  const rimProf = [
    [r0 - 0.012, -hw * 0.86], [r0 + 0.012, -hw * 0.9], [r0 + 0.016, -hw * 0.82], [r0 + 0.002, -hw * 0.7],
    [r0 - 0.002, -hw * 0.25], [r0 - 0.03, -hw * 0.15], [r0 - 0.03, hw * 0.15], [r0 - 0.002, hw * 0.25],
    [r0 + 0.002, hw * 0.7], [r0 + 0.016, hw * 0.82], [r0 + 0.012, hw * 0.9], [r0 - 0.012, hw * 0.86],
  ];
  g.add(mesh(latheZ(rimProf, 96), m.paint));

  // Hub barrel with spoke flanges
  const hubProf = [
    [0.0, -0.11], [0.05, -0.11], [0.062, -0.095], [0.066, -0.08], [0.05, -0.06], [0.045, 0.0],
    [0.048, 0.04], [0.058, 0.05], [0.058, 0.06], [0.044, 0.07], [0.04, 0.1], [0.0, 0.1],
  ];
  g.add(mesh(latheZ(hubProf, 48), m.paint));

  // Spokes: three-row Rudge-Whitworth style lacing, tangential, so the wheel reads as wire-built.
  const spokes = [];
  const n = 20;
  const rows = [
    { hubZ: -0.085, rimZ: -0.02, hubR: 0.064, twist: 0.18 },
    { hubZ: -0.085, rimZ: 0.015, hubR: 0.064, twist: -0.18 },
    { hubZ: 0.052, rimZ: -0.008, hubR: 0.056, twist: 0.0 },
  ];
  rows.forEach((row, ri) => {
    for (let i = 0; i < n; i++) {
      const a = ((i + ri / 3) / n) * Math.PI * 2;
      const b = a + row.twist;
      const A = V3(Math.cos(a) * row.hubR, Math.sin(a) * row.hubR, row.hubZ);
      const B = V3(Math.cos(b) * (r0 - 0.028), Math.sin(b) * (r0 - 0.028), row.rimZ);
      spokes.push(rod(A, B, 0.0028, 0.0028, 5));
    }
  });
  g.add(mesh(merge(spokes), m.steel));

  // Knock-off spinner
  const spinner = new THREE.Group();
  spinner.add(mesh(latheZ([[0, 0.1], [0.05, 0.1], [0.055, 0.108], [0.045, 0.125], [0.03, 0.135], [0, 0.138]], 6), m.chrome));
  for (const s of [-1, 1]) {
    const ear = mesh(roundedBox(0.11, 0.022, 0.018, 0.008), m.chrome);
    ear.position.set(s * 0.07, 0, 0.12);
    ear.rotation.z = 0;
    spinner.add(ear);
  }
  g.add(spinner);
  g.userData.spinner = spinner;
  return g;
}

/** Finned brake drum with backplate. Axis local +Z, drum opening facing -Z (inboard). */
export function buildBrake(m) {
  const g = new THREE.Group();
  g.name = 'brake';
  const alongZ = (geo) => geo.rotateX(Math.PI / 2);
  const shell = alongZ(new THREE.CylinderGeometry(0.205, 0.205, 0.1, 72, 1, true));
  shell.translate(0, 0, -0.01);
  const face = new THREE.RingGeometry(0.07, 0.205, 72);
  face.translate(0, 0, 0.04);
  const inner = alongZ(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 72, 1, true));
  inner.translate(0, 0, -0.01);
  inner.scale(1, 1, 1);
  const lip = new THREE.RingGeometry(0.19, 0.205, 72);
  lip.rotateY(Math.PI);
  lip.translate(0, 0, -0.06);
  const drumMat = m.iron.clone();
  drumMat.side = THREE.DoubleSide;
  g.add(mesh(merge([shell, face, inner, lip]), drumMat));
  // Cooling fins around the drum
  const fins = [];
  for (let i = 0; i < 6; i++) {
    const z = 0.028 - i * 0.015;
    const f = alongZ(new THREE.CylinderGeometry(0.234, 0.234, 0.005, 72, 1, false));
    f.translate(0, 0, z);
    fins.push(f);
  }
  g.add(mesh(merge(fins), m.darkSteel));
  // Hub boss
  g.add(mesh(alongZ(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 32)).translate(0, 0, 0.05), m.darkSteel));
  // Backplate and actuating lever
  const back = alongZ(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 64));
  back.translate(0, 0, -0.076);
  g.add(mesh(back, m.blackEnamel));
  const lever = mesh(roundedBox(0.03, 0.12, 0.012, 0.004), m.darkSteel);
  lever.position.set(-0.05, 0.16, -0.095);
  lever.rotation.z = 0.5;
  g.add(lever);
  return g;
}
