import * as THREE from 'three';
import * as T from './textures.js';

// One shared material library. Parts that need to fade (the ghosted engine block)
// get their own clones so nothing else changes with them.
export function createMaterials() {
  const leatherBump = T.grainBump(11, 512, 1.0);
  leatherBump.repeat.set(3, 3);
  const castBump = T.grainBump(23, 256, 0.7);
  castBump.repeat.set(24, 24);
  const brushedBump = T.brushed();

  const m = {
    paint: new THREE.MeshPhysicalMaterial({
      color: 0x0e2c1e,
      metalness: 0.0,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
      envMapIntensity: 1.25,
      sheen: 0.25,
      sheenColor: new THREE.Color(0x2c5a40),
      sheenRoughness: 0.5,
    }),
    // Fabric-covered rear body and wing undersides read slightly duller
    paintSatin: new THREE.MeshPhysicalMaterial({
      color: 0x0d281b,
      roughness: 0.45,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
    }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, metalness: 1, roughness: 0.045, envMapIntensity: 1.35 }),
    nickel: new THREE.MeshStandardMaterial({ color: 0xe6dfcf, metalness: 1, roughness: 0.12 }),
    aluminium: new THREE.MeshStandardMaterial({
      color: 0xc9c7c1, metalness: 1, roughness: 0.3, bumpMap: brushedBump, bumpScale: 0.25,
    }),
    castAlu: new THREE.MeshStandardMaterial({
      color: 0xa9a69f, metalness: 0.9, roughness: 0.42, bumpMap: castBump, bumpScale: 0.35,
    }),
    iron: new THREE.MeshStandardMaterial({
      color: 0x2c2d2b, metalness: 0.6, roughness: 0.5, bumpMap: castBump, bumpScale: 0.5,
    }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9da0a3, metalness: 1, roughness: 0.22 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x3b3d40, metalness: 0.9, roughness: 0.35 }),
    blackEnamel: new THREE.MeshPhysicalMaterial({
      color: 0x111312, metalness: 0.1, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2,
    }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc19a52, metalness: 1, roughness: 0.22 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb8714a, metalness: 1, roughness: 0.28 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0, roughness: 0.88 }),
    tyre: new THREE.MeshStandardMaterial({
      color: 0x161616, metalness: 0, roughness: 0.82, bumpMap: T.tyreBump(), bumpScale: 3.2,
    }),
    leather: new THREE.MeshPhysicalMaterial({
      color: 0x7b4526, roughness: 0.58, metalness: 0, bumpMap: leatherBump, bumpScale: 0.9,
      sheen: 0.6, sheenColor: new THREE.Color(0xd6a070), sheenRoughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.5,
    }),
    strap: new THREE.MeshPhysicalMaterial({
      color: 0x4a2b18, roughness: 0.62, bumpMap: leatherBump, bumpScale: 1.0, sheen: 0.4, sheenColor: new THREE.Color(0x8a5a36),
    }),
    hood: new THREE.MeshStandardMaterial({ color: 0x1b1d1c, roughness: 0.9, bumpMap: leatherBump, bumpScale: 1.4 }),
    carpet: new THREE.MeshStandardMaterial({ color: 0x23302a, roughness: 1 }),
    walnut: new THREE.MeshPhysicalMaterial({
      map: T.walnut(), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.16,
      envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide,
    }),
    lens: new THREE.MeshPhysicalMaterial({
      color: 0xf6f2e8, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.45,
      clearcoat: 1, depthWrite: false,
    }),
    reflector: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.18 }),
    radiatorCore: new THREE.MeshStandardMaterial({
      map: T.honeycomb(), metalness: 0.6, roughness: 0.55,
    }),
    stoneGuard: new THREE.MeshStandardMaterial({
      color: 0xd8d8d8, metalness: 1, roughness: 0.2, alphaMap: T.meshAlpha(), transparent: true,
      depthWrite: false, side: THREE.DoubleSide,
    }),
    porcelain: new THREE.MeshPhysicalMaterial({ color: 0xf2efe6, roughness: 0.18, clearcoat: 1 }),
    wire: new THREE.MeshStandardMaterial({ color: 0x2a1410, roughness: 0.6 }),
    redLead: new THREE.MeshStandardMaterial({ color: 0x7a1d17, roughness: 0.5 }),
    badge: new THREE.MeshPhysicalMaterial({
      map: T.badge(), transparent: true, alphaTest: 0.3, metalness: 0.4, roughness: 0.25, clearcoat: 1,
    }),
    tailLens: new THREE.MeshPhysicalMaterial({ color: 0x8a0d0a, roughness: 0.1, clearcoat: 1, emissive: 0x2a0000 }),
    spark: new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    gauges: {
      speed: new THREE.MeshPhysicalMaterial({ map: T.gaugeFace('speed'), roughness: 0.4, clearcoat: 1 }),
      rev: new THREE.MeshPhysicalMaterial({ map: T.gaugeFace('rev'), roughness: 0.4, clearcoat: 1 }),
      oil: new THREE.MeshPhysicalMaterial({ map: T.gaugeFace('oil'), roughness: 0.4, clearcoat: 1 }),
      fuel: new THREE.MeshPhysicalMaterial({ map: T.gaugeFace('fuel'), roughness: 0.4, clearcoat: 1 }),
    },
  };

  // Ghostable copies for the engine block and crankcase.
  m.ghostIron = m.iron.clone();
  m.ghostAlu = m.castAlu.clone();
  for (const g of [m.ghostIron, m.ghostAlu]) g.transparent = true;
  m.ghostLine = new THREE.LineBasicMaterial({ color: 0x3a3a36, transparent: true, opacity: 0, depthWrite: false });
  m.ghostBore = new THREE.MeshStandardMaterial({
    color: 0x8b8f92, metalness: 0.9, roughness: 0.3, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  return m;
}
