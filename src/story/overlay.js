import * as THREE from 'three';
import { CARDS, ANNOTATIONS, STEPS, CHAPTERS } from './script.js';

const FADE = 0.14;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** Visibility of a window [a, b] at u, with soft edges. */
export function windowAmount(u, [a, b], fade = FADE) {
  if (u <= a - 1e-6 && a <= 0) return 1;
  return clamp01((u - a) / fade) * clamp01((b - u) / fade);
}

export function createOverlay({ registry }) {
  const cardsEl = document.getElementById('cards');
  const labelsEl = document.getElementById('labels');
  const svg = document.getElementById('leaders');

  // ── Captions ────────────────────────────────────────────────
  const cards = CARDS.map((c) => {
    const el = document.createElement('article');
    el.className = `card card--${c.side}`;
    el.innerHTML = `
      <p class="card__kicker">${c.numeral ? `<span class="card__numeral">${c.numeral}</span>` : ''}${c.kicker}</p>
      <h2 class="card__title">${c.title}</h2>
      <p class="card__body">${c.body}</p>`;
    cardsEl.appendChild(el);
    return { ...c, el, last: -1 };
  });

  // ── Fixed pieces: hero, engine readout, reconstruction steps, finale ──
  const hero = document.getElementById('hero');
  const readout = document.getElementById('readout');
  const crankEl = document.getElementById('crank-angle');
  const fireEl = document.getElementById('firing');
  const stepsEl = document.getElementById('steps');
  const stepItems = STEPS.map((s) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="steps__n">${String(s.n).padStart(2, '0')}</span><span class="steps__t">${s.title}</span><span class="steps__bar"><i></i></span>`;
    stepsEl.querySelector('ol').appendChild(li);
    return { ...s, li, bar: li.querySelector('i') };
  });
  const finaleA = document.getElementById('finale-a');
  const finaleB = document.getElementById('finale-b');
  const navLinks = [...document.querySelectorAll('[data-chapter]')];
  const progressBar = document.getElementById('progress-bar');

  // ── Annotations ─────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg';
  const notes = ANNOTATIONS.map((a) => {
    const target = registry(a.part);
    if (!target) return null;
    const anchor = a.at ? target.object.worldToLocal(new THREE.Vector3(...a.at)) : target.anchor?.clone() || new THREE.Vector3();
    const el = document.createElement('div');
    el.className = 'note';
    el.innerHTML = `<span class="note__title">${a.title || target.label}</span><span class="note__text">${a.note || target.note || ''}</span>`;
    labelsEl.appendChild(el);
    const line = document.createElementNS(NS, 'polyline');
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', '3.5');
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('r', '9');
    ring.setAttribute('class', 'ring');
    svg.append(line, ring, dot);
    return { ...a, target, anchor, el, line, dot, ring, w: 0, h: 0, visible: false };
  }).filter(Boolean);

  const v = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const toPt = new THREE.Vector3();

  function measure() {
    for (const n of notes) {
      n.w = n.el.offsetWidth;
      n.h = n.el.offsetHeight;
    }
  }

  let lastU = -1;
  let readoutOn = 0;
  function update(u, camera, size, { compact }) {
    const changed = Math.abs(u - lastU) > 1e-5;
    lastU = u;
    const { width: W, height: H } = size;

    if (changed) {
      // Hero
      const h = 1 - clamp01((u - 0.45) / 0.3);
      hero.style.opacity = h;
      hero.style.transform = `translate3d(0, ${(1 - h) * -24}px, 0)`;
      hero.style.visibility = h > 0.001 ? 'visible' : 'hidden';

      for (const c of cards) {
        const a = windowAmount(u, c.u);
        if (Math.abs(a - c.last) < 1e-4) continue;
        c.last = a;
        c.el.style.opacity = a;
        c.el.style.transform = `translate3d(0, ${(1 - a) * 18}px, 0)`;
        c.el.style.visibility = a > 0.001 ? 'visible' : 'hidden';
      }

      // Reconstruction steps
      const s = windowAmount(u, [14.05, 17.95]);
      stepsEl.style.opacity = s;
      stepsEl.style.visibility = s > 0.001 ? 'visible' : 'hidden';
      for (const it of stepItems) {
        const p = clamp01((u - it.u[0]) / (it.u[1] - it.u[0]));
        it.bar.style.transform = `scaleX(${p})`;
        it.li.classList.toggle('is-active', p > 0 && p < 1);
        it.li.classList.toggle('is-done', p >= 1);
      }

      // Finale
      const fa = clamp01((u - 18.0) / 0.35);
      const fb = clamp01((u - 18.6) / 0.35);
      finaleA.style.opacity = fa;
      finaleA.style.transform = `translate3d(0, ${(1 - fa) * 20}px, 0)`;
      finaleA.style.visibility = fa > 0.001 ? 'visible' : 'hidden';
      finaleB.style.opacity = fb;
      finaleB.style.transform = `translate3d(0, ${(1 - fb) * 14}px, 0)`;
      finaleB.style.visibility = fb > 0.001 ? 'visible' : 'hidden';

      // Navigation
      let active = 0;
      CHAPTERS.forEach((c, i) => { if (u >= c.u - 0.05) active = i; });
      navLinks.forEach((a) => a.classList.toggle('is-active', a.dataset.chapter === CHAPTERS[active].id));
      progressBar.style.transform = `scaleX(${u / 20})`;
    }

    // Annotations follow the 3D anchors every frame
    camera.getWorldDirection(camDir);
    const placed = { left: [], right: [] };
    for (const n of notes) {
      let a = windowAmount(u, n.u, 0.1);
      if (compact && n.compactHide) a = 0;
      if (a <= 0.001) {
        if (n.visible) {
          n.el.style.visibility = 'hidden';
          n.line.style.opacity = n.dot.style.opacity = n.ring.style.opacity = 0;
          n.visible = false;
        }
        continue;
      }
      n.target.object.localToWorld(v.copy(n.anchor));
      toPt.copy(v).sub(camera.position);
      if (toPt.dot(camDir) <= 0.1) { a = 0; }
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * W;
      const y = (-v.y * 0.5 + 0.5) * H;
      if (x < -50 || x > W + 50 || y < -50 || y > H + 50) a = 0;
      if (!n.visible) {
        n.el.style.visibility = 'visible';
        n.visible = true;
        if (!n.w) { n.w = n.el.offsetWidth; n.h = n.el.offsetHeight; }
      }
      const side = x > W * 0.5 ? 'right' : 'left';
      placed[side].push({ n, x, y, a });
    }
    // Lay labels out beside their anchors, then push apart vertically per side.
    const lead = compact ? 28 : 56;
    for (const side of ['left', 'right']) {
      const list = placed[side].sort((p, q) => p.y - q.y);
      let floor = -Infinity;
      for (const p of list) {
        const h = p.n.h || 34;
        let ly = p.y - lead * 0.8 - h / 2;
        if (ly < floor + 8) ly = floor + 8;
        const top = side === 'right' && readoutOn > 0.01 && !compact ? 250 : 74;
        ly = Math.max(top, Math.min(H - h - 20, ly));
        floor = ly + h;
        p.ly = ly;
      }
      for (const p of list) {
        const { n, x, y, a } = p;
        const w = n.w || 140;
        let lx = side === 'right' ? x + lead : x - lead - w;
        lx = Math.max(12, Math.min(W - w - 12, lx));
        const elbowX = side === 'right' ? lx - 6 : lx + w + 6;
        const midY = p.ly + (n.h || 34) / 2;
        n.el.style.opacity = a;
        n.el.style.transform = `translate3d(${lx.toFixed(1)}px, ${p.ly.toFixed(1)}px, 0)`;
        n.el.classList.toggle('note--left', side === 'left');
        const kx = side === 'right' ? elbowX - 14 : elbowX + 14;
        n.line.setAttribute('points', `${x.toFixed(1)},${y.toFixed(1)} ${kx.toFixed(1)},${midY.toFixed(1)} ${elbowX.toFixed(1)},${midY.toFixed(1)}`);
        n.line.style.opacity = a;
        n.dot.setAttribute('cx', x.toFixed(1));
        n.dot.setAttribute('cy', y.toFixed(1));
        n.dot.style.opacity = a;
        n.ring.setAttribute('cx', x.toFixed(1));
        n.ring.setAttribute('cy', y.toFixed(1));
        n.ring.style.opacity = a * 0.7;
      }
    }
  }

  function setReadout(amount, angleDeg, cyl) {
    readoutOn = amount;
    readout.style.opacity = amount;
    readout.style.visibility = amount > 0.001 ? 'visible' : 'hidden';
    crankEl.textContent = String(Math.round(angleDeg) % 360).padStart(3, '0');
    fireEl.textContent = String(cyl);
  }

  return { update, setReadout, measure };
}
