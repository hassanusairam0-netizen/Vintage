# The Art of the Automobile

A scroll-driven 3D film of a 1930 six-and-a-half-litre open tourer. Scrolling plays one continuous
sequence: the exterior, a full disassembly, the engine turning over inside a glass block, the
engineering of each system, and a reconstruction in which every part travels back to the exact
place it started. Made by Usairam Hassan.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static site in dist/
npm run preview   # serve dist/ at http://localhost:4173
```

The build is fully static (`base: './'`), so `dist/` can be dropped onto any static host.

## How it is built

- **Three.js** renders the studio and the car. **Lenis** smooths wheel and trackpad input; touch
  uses native scrolling. **GSAP** drives the loader and intro reveal. **postprocessing** + **N8AO**
  add ambient occlusion, tone mapping, vignette and SMAA.
- **No external model files.** The car is modelled in code (`src/model/`) as 41 independent
  components, and the engine as 16 more (block, crankshaft, six pistons and rods, head, twelve
  valves and springs, camshaft, cover, intake and carburettors, exhaust manifold, magneto and
  plugs, sump, water pump and fan, flywheel, clutch housing). Every part is its own `Group`,
  so the disassembly and the reconstruction move real parts, never a crossfade.
- **One number drives everything.** Scroll position maps to story time `u` (0 to 20). Each part's
  pose, the camera, the captions and the labels are pure functions of `u`
  (`src/story/script.js`), so scrolling backwards replays the film exactly in reverse.
- **Exact return.** `Part` (`src/core/part.js`) stores each component's assembled transform once.
  Stage factors are exactly zero outside their windows, so when the reconstruction ends every
  part is restored to that stored transform, not to an approximation.
- **The engine mechanism is real kinematics.** Piston height follows
  `r·cos α + √(l² − r²·sin² α)`, rods swing by `−asin(r·sin α / l)`, the camshaft turns at half
  crank speed, and valve lift and the spark in each cylinder follow the 1-5-3-6-2-4 firing order.
  The crank turns a whole number of revolutions across the chapter so it ends where it began.

## Project layout

| Path | What it holds |
| --- | --- |
| `src/model/car.js` | Chassis, axles, coachwork, interior, fuel, cooling, exhaust, steering |
| `src/model/engine.js` | Straight-six engine, crank geometry and valve timing |
| `src/model/wheel.js` | Wire wheels and finned brake drums |
| `src/core/` | Geometry helpers (sweeps, lathes), procedural textures, materials, `Part` |
| `src/scene/` | Studio lighting, environment, reflective floor, contact shadows |
| `src/story/script.js` | The choreography: part timings, camera path, captions, labels |
| `src/story/overlay.js` | Captions, leader-line labels, reconstruction steps, engine readout |

## Quality and fallbacks

- Desktop devices get ambient occlusion, floor reflections and 2048 px shadows. Phones and
  small screens start on a lighter tier, and any device that renders slower than about 24 fps
  steps down automatically (resolution, then AO and reflections, then shadow filtering).
- Browsers without WebGL see a typographic fallback. `prefers-reduced-motion` turns off scroll
  smoothing, the intro and pointer parallax.
- URL flags for testing: `?quality=high|low` forces a tier, `?lock` disables automatic
  downgrades, `?still` skips the intro animation. `#engine`, `#reconstruction` and the other
  chapter ids deep-link to a chapter.
