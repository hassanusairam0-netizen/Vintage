import '@fontsource/cormorant-garamond/latin-300.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-300-italic.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import './style.css';

import * as THREE from 'three';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import {
  EffectComposer, RenderPass, EffectPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

import { createMaterials } from './core/materials.js';
import { Part, stageFactor, smooth } from './core/part.js';
import { buildStudio } from './scene/studio.js';
import { createContactShadows } from './scene/contactShadows.js';
import { buildCar } from './model/car.js';
import { ENG, pistonPinY, valveLift } from './model/engine.js';
import { U_TOTAL, CHAPTERS, CAMERA, FOCUS, ENGINE_FX, STEPS, carStages, engineStages } from './story/script.js';
import { createOverlay, windowAmount } from './story/overlay.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('still');
// Tweens run on wall-clock time, so a slow first frame never stalls the loader.
gsap.ticker.lagSmoothing(0);

// ── Device tier ─────────────────────────────────────────────────
function pickQuality() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  const high = !coarse && !small && cores >= 4;
  const params = new URLSearchParams(location.search);
  const forced = params.get('quality');
  const tier = forced || (high ? 'high' : 'low');
  return tier === 'high'
    ? { tier, dpr: Math.min(devicePixelRatio, 1.75), ao: true, reflections: true, shadow: 2048 }
    : { tier, dpr: Math.min(devicePixelRatio, 1.35), ao: false, reflections: false, shadow: 1024 };
}

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// ── Loader ──────────────────────────────────────────────────────
const loaderEl = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const loaderMsg = document.getElementById('loader-msg');
const loaderPct = document.getElementById('loader-pct');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
async function progress(p, msg) {
  loaderBar.style.transform = `scaleX(${p})`;
  loaderPct.textContent = String(Math.round(p * 100)).padStart(2, '0');
  if (msg) loaderMsg.textContent = msg;
  await nextFrame();
  await nextFrame();
}

// ── Camera path ─────────────────────────────────────────────────
const KEYS = CAMERA.map((k) => ({
  u: k.u, pos: new THREE.Vector3(...k.pos), tgt: new THREE.Vector3(...k.tgt), fov: k.fov, shift: k.shift,
}));
function cr(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  return out.set(0, 0, 0)
    .addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t)
    .addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1)
    .addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t)
    .addScaledVector(p3, 0.5 * t3 - 0.5 * t2);
}
const shot = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 30, shift: 0 };
function cameraAt(u) {
  let i = 0;
  while (i < KEYS.length - 2 && u > KEYS[i + 1].u) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smooth(clamp01((u - a.u) / (b.u - a.u)));
  const p0 = KEYS[Math.max(0, i - 1)], p3 = KEYS[Math.min(KEYS.length - 1, i + 2)];
  cr(p0.pos, a.pos, b.pos, p3.pos, t, shot.pos);
  cr(p0.tgt, a.tgt, b.tgt, p3.tgt, t, shot.tgt);
  // Hold exactly on a key so the final frame equals the opening frame.
  if (t === 0) { shot.pos.copy(a.pos); shot.tgt.copy(a.tgt); }
  if (t === 1) { shot.pos.copy(b.pos); shot.tgt.copy(b.tgt); }
  shot.fov = a.fov + (b.fov - a.fov) * t;
  shot.shift = a.shift + (b.shift - a.shift) * t;
  return shot;
}

async function boot() {
  if (!webglOK()) {
    document.documentElement.classList.add('no-webgl');
    loaderEl.remove();
    return;
  }
  let quality = pickQuality();
  document.documentElement.dataset.tier = quality.tier;
  await progress(0.04, 'Preparing the studio');

  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(quality.dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(27, innerWidth / innerHeight, 0.1, 140);

  await progress(0.12, 'Mixing the paint');
  const m = createMaterials();
  await progress(0.3, 'Lighting the studio');
  const studio = buildStudio(renderer, scene, quality);
  await progress(0.42, 'Machining the engine');
  const car = buildCar(m);
  scene.add(car.root);
  // Fog belongs to the studio floor only; the car is never veiled by distance.
  car.root.traverse((o) => { if (o.material) o.material.fog = false; });
  await progress(0.62, 'Fitting the coachwork');

  // ── Parts ─────────────────────────────────────────────────────
  const parts = [];
  for (const [key, p] of Object.entries(car.parts)) {
    p.part = new Part(p.object, { name: key, system: p.system, stages: carStages(key) });
    parts.push(p.part);
  }
  for (const [key, p] of Object.entries(car.engine.parts)) {
    p.part = new Part(p.object, { name: key, stages: engineStages(key) });
    parts.push(p.part);
  }
  const eng = car.engine;
  const P = (k) => car.parts[k]?.part;
  const crankPart = eng.parts.crankshaft.part;
  const camPart = eng.parts.camshaft.part;
  const flyPart = eng.parts.flywheel.part;
  const ghost = eng.block.userData.ghost;
  const ghostMats = ghost.meshes.map((g) => g.material);
  const wheels = ['wheelFR', 'wheelFL', 'wheelRR', 'wheelRL'].map((k) => car.parts[k].object.userData.spinner);
  const sparks = eng.sparks;
  const contact = createContactShadows(renderer, scene, {
    x: -0.1, hide: [studio.floor, ...(studio.reflector ? [studio.reflector] : [])],
  });
  scene.updateMatrixWorld(true);

  const registry = (key) => {
    if (key.startsWith('engine.')) return eng.parts[key.slice(7)];
    return car.parts[key];
  };
  const overlay = createOverlay({ registry });

  // ── Post-processing ───────────────────────────────────────────
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  const ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
  ao.configuration.aoRadius = 0.55;
  ao.configuration.distanceFalloff = 0.6;
  ao.configuration.intensity = 2.4;
  ao.configuration.halfRes = true;
  ao.configuration.gammaCorrection = false;
  ao.enabled = quality.ao;
  composer.addPass(ao);
  composer.addPass(new EffectPass(camera,
    new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    new VignetteEffect({ offset: 0.32, darkness: 0.32 })));
  composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));

  // ── Story state ───────────────────────────────────────────────
  const scroller = document.getElementById('scroll');
  let unit = innerHeight;
  function layout() {
    unit = Math.max(560, innerHeight) * 0.95;
    scroller.style.height = `${U_TOTAL * unit + innerHeight}px`;
    document.querySelectorAll('[data-chapter]').forEach((a) => {
      const ch = CHAPTERS.find((c) => c.id === a.dataset.chapter);
      a.setAttribute('href', `#${ch.id}`);
    });
  }
  layout();

  const lenis = new Lenis({ lerp: reducedMotion ? 1 : 0.075, smoothWheel: !reducedMotion, wheelMultiplier: 0.9 });
  const scrollToU = (u) => lenis.scrollTo(u * unit, { duration: reducedMotion ? 0 : Math.min(4, 1.2 + Math.abs(u - uNow) * 0.25) });
  document.querySelectorAll('[data-chapter]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToU(CHAPTERS.find((c) => c.id === a.dataset.chapter).u + 0.02);
    });
  });
  document.getElementById('restart').addEventListener('click', () => scrollToU(0));
  document.getElementById('scroll-cue').addEventListener('click', () => scrollToU(1.35));
  if (location.hash) {
    const ch = CHAPTERS.find((c) => `#${c.id}` === location.hash);
    if (ch) requestAnimationFrame(() => lenis.scrollTo(ch.u * unit, { immediate: true }));
  }

  let uNow = 0;
  let lastShadowSig = -1;
  let uShown = -1;
  const compact = () => innerWidth < 760;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  });
  const intro = { k: reducedMotion ? 0 : 1 };

  const X = new THREE.Vector3(1, 0, 0);
  const qCrank = new THREE.Quaternion(), qCam = new THREE.Quaternion();
  crankPart.extraQuat = qCrank;
  flyPart.extraQuat = qCrank;
  camPart.extraQuat = qCam;
  const right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function applyStory(u) {
    for (const p of parts) p.update(u);

    // Engine mechanism: crank angle is a pure function of scroll
    const c = ENGINE_FX.crank;
    const k = smooth(clamp01((u - c.from) / (c.to - c.from)));
    const theta = k * c.revs * Math.PI * 2;
    qCrank.setFromAxisAngle(X, theta);
    qCam.setFromAxisAngle(X, theta / 2);
    for (const p of eng.pistons) p.obj.position.y = pistonPinY(theta + p.phase);
    for (const r of eng.rods) {
      const a = theta + r.phase;
      r.obj.position.y = pistonPinY(a);
      r.obj.rotation.x = -Math.asin((ENG.r * Math.sin(a)) / ENG.l);
    }
    for (const v of eng.valves) {
      const lift = valveLift(v.cyl, theta, v.exhaust);
      v.obj.position.y = -lift;
      v.spring.scale.y = (0.045 - lift) / 0.045;
    }
    eng.fanHub.rotation.x = theta * 1.35;
    const deg = (theta * 180) / Math.PI;
    let firing = 1, best = 1e9;
    for (const s of sparks) {
      const cyc = (((deg - ENG.fire[s.cyl]) % 720) + 720) % 720;
      s.mesh.material.opacity = k > 0 && k < 1 && cyc < 28 ? (1 - cyc / 28) * 0.95 : 0;
      if (cyc < best) { best = cyc; firing = s.cyl + 1; }
    }
    const engineOn = windowAmount(u, [8.5, 10.9], 0.15);
    overlay.setReadout(engineOn, deg, firing);

    // Ghosted block
    const g = stageFactor(u, ENGINE_FX.ghost);
    for (const mat of ghostMats) {
      mat.opacity = 1 - 0.86 * g;
      mat.transparent = g > 0;
      mat.depthWrite = g < 0.4;
    }
    m.ghostLine.opacity = 0.55 * g;
    m.ghostBore.opacity = 0.32 * g;
    ghost.bores.visible = g > 0;
    for (const l of ghost.lines) l.visible = g > 0;

    // Knock-off spinners: loosened before the wheels come off, given a final turn as they lock (step 8)
    const loosen = smooth(clamp01((u - 6.0) / 0.15));
    const tighten = smooth(clamp01((u - STEPS[7].u[0]) / (STEPS[7].u[1] - STEPS[7].u[0])));
    wheels.forEach((s, i) => { s.rotation.z = 1.2 * loosen * (1 - tighten) * (i % 2 ? -1 : 1); });

    // Focus light and a closing rim light sweep
    let fi = 0;
    for (const f of FOCUS) {
      const a = windowAmount(u, f.u, 0.25);
      if (a > fi) {
        fi = a;
        studio.focus.position.set(...f.from);
        studio.focus.target.position.set(...f.at);
        studio.focus.intensity = a * f.intensity;
      }
    }
    if (fi === 0) studio.focus.intensity = 0;
    const sweep = windowAmount(u, [17.4, 18.6], 0.4);
    studio.rim.intensity = sweep * 1.6;
    studio.rim.position.set(-6 + 12 * clamp01((u - 17.3) / 1.4), 5, -6);
  }

  function frameCamera(u) {
    const s = cameraAt(u);
    const aspect = innerWidth / innerHeight;
    // Keep the horizontal field of a 16:9 frame on narrower screens.
    const ref = 16 / 9;
    let fov = s.fov;
    if (aspect < ref) {
      const h = 2 * Math.atan(Math.tan((s.fov * Math.PI) / 360) * ref);
      const coverage = aspect < 1 ? 0.7 : 0.94;
      fov = (2 * Math.atan(Math.tan(h / 2) * coverage / aspect) * 180) / Math.PI;
      fov = Math.min(fov, 62);
    }
    camera.fov = fov;
    camera.position.copy(s.pos);
    // Intro dolly: starts wide and low, settles exactly onto the hero frame.
    if (intro.k > 0) {
      tmp.copy(s.pos).sub(s.tgt);
      camera.position.copy(s.tgt).addScaledVector(tmp, 1 + 0.16 * intro.k);
      camera.position.y -= 0.18 * intro.k;
    }
    camera.lookAt(s.tgt);
    camera.updateMatrixWorld();
    // Pointer parallax
    if (!reducedMotion) {
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      const d = camera.position.distanceTo(s.tgt) * 0.012;
      camera.position.addScaledVector(right, pointer.sx * d).addScaledVector(up, -pointer.sy * d * 0.6);
      camera.lookAt(s.tgt);
    }
    const shift = compact() ? 0 : s.shift;
    if (Math.abs(shift) > 1e-4) camera.setViewOffset(innerWidth, innerHeight, -shift * innerWidth, 0, innerWidth, innerHeight);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  // ── Resize ────────────────────────────────────────────────────
  let dirty = true;
  function resize() {
    renderer.setPixelRatio(quality.dpr);
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setSize(innerWidth, innerHeight);
    studio.resize(innerWidth, innerHeight, quality.dpr);
    camera.aspect = innerWidth / innerHeight;
    layout();
    overlay.measure();
    dirty = true;
  }
  addEventListener('resize', resize);

  // ── Adaptive quality ─────────────────────────────────────────
  const samples = [];
  let level = 0;
  const lockQuality = new URLSearchParams(location.search).has('lock');
  function degrade() {
    level++;
    if (level === 1) {
      quality.dpr = Math.max(1, quality.dpr * 0.75);
      ao.configuration.halfRes = true;
    } else if (level === 2) {
      ao.enabled = false;
      studio.disableReflections();
    } else if (level === 3) {
      quality.dpr = 1;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      studio.key.shadow.map?.dispose();
      studio.key.shadow.map = null;
    }
    resize();
  }

  // ── Compile and reveal ───────────────────────────────────────
  await progress(0.78, 'Polishing the chrome');
  applyStory(0);
  frameCamera(0);
  scene.updateMatrixWorld(true);
  contact.update();
  studio.renderReflection(camera);
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    renderer.compile(scene, camera);
  }
  await progress(0.92, 'Opening the doors');
  composer.render();
  await progress(1, 'Ready');

  gsap.to(loaderEl, {
    opacity: 0, duration: reducedMotion ? 0.2 : 1.1, delay: 0.15, ease: 'power2.inOut',
    onComplete: () => loaderEl.remove(),
  });
  document.documentElement.classList.add('is-ready');
  if (!reducedMotion) {
    gsap.to(intro, { k: 0, duration: 3.2, ease: 'power3.out', delay: 0.2, onUpdate: () => { dirty = true; } });
    gsap.from('.hero__line', { yPercent: 110, opacity: 0, duration: 1.4, stagger: 0.12, ease: 'power3.out', delay: 0.6 });
    gsap.from('.hero__meta, .scroll-cue, .masthead', { opacity: 0, duration: 1.2, delay: 1.3, ease: 'power2.out' });
  }

  // ── Loop ─────────────────────────────────────────────────────
  let last = performance.now();
  let hidden = false;
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });
  function loop(time) {
    requestAnimationFrame(loop);
    lenis.raf(time);
    if (hidden) return;
    const dt = Math.min(0.1, (time - last) / 1000);
    last = time;

    const target = Math.min(U_TOTAL, Math.max(0, (lenis.animatedScroll ?? scrollY) / unit));
    uNow = target;
    pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 3));
    pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 3));
    const pointerMoving = Math.abs(pointer.x - pointer.sx) + Math.abs(pointer.y - pointer.sy) > 0.0005;

    if (Math.abs(uNow - uShown) > 1e-5 || dirty || pointerMoving || intro.k > 0) {
      const storyMoved = Math.abs(uNow - uShown) > 1e-5 || dirty;
      if (storyMoved) applyStory(uNow);
      frameCamera(uNow);
      // Re-cast contact shadows only when a component actually moved.
      if (storyMoved) {
        let sig = 0;
        for (const p of parts) sig += p.motion * (1 + (p.name.length % 7));
        if (dirty || Math.abs(sig - lastShadowSig) > 1e-6) {
          lastShadowSig = sig;
          car.root.updateMatrixWorld(true);
          contact.update();
        }
      }
      studio.renderReflection(camera);
      composer.render(dt);
      overlay.update(uNow, camera, { width: innerWidth, height: innerHeight }, { compact: compact() });
      uShown = uNow;
      dirty = false;
      // Measure real frame cost while the scene is moving
      samples.push(time - (loop.prev || time));
      loop.prev = time;
      if (samples.length > 50) {
        const sorted = samples.slice().sort((a, b) => a - b);
        const median = sorted[25];
        samples.length = 0;
        if (median > 42 && level < 3 && !lockQuality) degrade();
      }
    } else {
      loop.prev = undefined;
    }
  }
  requestAnimationFrame(loop);

  // Expose a small hook for automated checks.
  window.__story = {
    setU: (u) => { lenis.scrollTo(u * unit, { immediate: true }); },
    parts,
    unit: () => unit,
    homeError: () => {
      let worst = 0;
      for (const p of parts) {
        worst = Math.max(worst, p.object.position.distanceTo(p.basePos), 1 - Math.abs(p.object.quaternion.dot(p.baseQuat)));
      }
      return worst;
    },
  };
}

boot().catch((err) => {
  console.error(err);
  loaderMsg.textContent = 'The studio could not be prepared on this device.';
  document.documentElement.classList.add('no-webgl');
});
