// The whole film is one number, u, that runs from 0 to U_TOTAL as the visitor scrolls.
// Every pose, camera move, caption and label below is a pure function of u, so the
// story plays identically forwards and backwards.

export const U_TOTAL = 20;

export const CHAPTERS = [
  { id: 'prologue', numeral: '', title: 'The Art of Motion', u: 0 },
  { id: 'exterior', numeral: 'I', title: 'The Exterior', u: 1.0 },
  { id: 'disassembly', numeral: 'II', title: 'The Disassembly', u: 5.2 },
  { id: 'engine', numeral: 'III', title: 'The Engine', u: 8.0 },
  { id: 'engineering', numeral: 'IV', title: 'Engineering', u: 11.0 },
  { id: 'reconstruction', numeral: 'V', title: 'Reconstruction', u: 14.0 },
  { id: 'finale', numeral: '', title: 'Finale', u: 18.0 },
];

// ── Part choreography ──────────────────────────────────────────
// offset is in the part's parent frame (world for the car, engine-local for engine parts).
// dis = window over which it separates, rec = window over which it returns home.
const S = (offset, dis, rec, extra = {}) => ({ offset, dis, rec, ...extra });

// Reconstruction steps, in the order the brief lays them out.
export const STEPS = [
  { n: 1, title: 'The chassis aligns', u: [14.2, 14.7] },
  { n: 2, title: 'Engine and gearbox mount', u: [14.65, 15.2] },
  { n: 3, title: 'Suspension, brakes, wheels, drivetrain', u: [15.05, 15.7] },
  { n: 4, title: 'Cooling, exhaust and fuel', u: [15.55, 16.1] },
  { n: 5, title: 'Interior and trim', u: [16.0, 16.55] },
  { n: 6, title: 'Coachwork, bonnet, grille and lamps', u: [16.5, 17.25] },
  { n: 7, title: 'The wheels align', u: [17.1, 17.45] },
  { n: 8, title: 'Every component locks', u: [17.45, 17.8] },
];

export function carStages(key) {
  const side = key.endsWith('L') ? -1 : 1;
  const front = /F[LR]$/.test(key);
  const fx = front ? 0.35 : -0.35;
  switch (key) {
    // Step 1: chassis
    case 'frame': return [S([0, 0.45, 0], [6.75, 7.35], [14.2, 14.7])];
    // Step 2: engine and transmission
    case 'engine': return [
      S([0, 1.0, 0], [6.8, 7.45], [14.65, 15.15]),
      // Showcase: out to the side, then hoisted above the exploded car against a clean backdrop
      // (it slides back a little first so it clears the floating front wing)
      S([-0.5, 0.15, 2.3], [8.0, 8.4], [10.65, 11.0]),
      S([0.9, 2.85, 0], [8.35, 8.85], [10.3, 10.7]),
    ];
    case 'gearbox': return [S([0, 0.75, 0], [6.85, 7.45], [14.75, 15.2])];
    // Step 3: suspension, brakes, wheels, drivetrain
    case 'frontAxle': return [S([0.35, 0, 0], [6.55, 7.1], [15.05, 15.45])];
    case 'rearAxle': return [S([-0.35, 0, 0], [6.55, 7.1], [15.08, 15.48])];
    case 'steering': return [S([0, 0.55, 0], [6.75, 7.3], [15.1, 15.5])];
    case 'propshaft': return [S([0, 0.32, 0], [6.7, 7.25], [15.15, 15.55])];
    case 'brakeRods': return [S([0, 0.2, 0], [6.6, 7.1], [15.3, 15.65])];
    case 'brakeFR': case 'brakeFL': case 'brakeRR': case 'brakeRL': {
      const k = ['brakeFR', 'brakeFL', 'brakeRR', 'brakeRL'].indexOf(key) * 0.04;
      return [S([fx, 0, side * 0.45], [6.3 + k, 6.85 + k], [15.2 + k, 15.55 + k])];
    }
    case 'wheelFR': case 'wheelFL': case 'wheelRR': case 'wheelRL': {
      const k = ['wheelFR', 'wheelFL', 'wheelRR', 'wheelRL'].indexOf(key) * 0.05;
      return [
        S([fx, 0, side * 0.88], [6.25 + k, 6.85 + k], [15.25 + k, 15.62 + k], { rot: [0, 0, side * 0.9] }),
        S([0, 0, side * 0.12], [6.1 + k * 0.5, 6.3 + k * 0.5], [17.1 + k * 0.5, 17.42 + k * 0.5]),
      ];
    }
    // Step 4: cooling, exhaust, fuel
    case 'radiator': return [S([0.6, 0.62, 0], [6.45, 7.0], [15.55, 15.95])];
    case 'exhaust': return [S([0, 0, 0.95], [6.4, 6.95], [15.65, 16.05])];
    case 'fuelTank': return [S([-0.75, 0.28, 0], [6.4, 6.95], [15.7, 16.1])];
    // Step 5: interior
    case 'trim': return [S([0, 1.15, 0], [6.0, 6.55], [16.0, 16.35])];
    case 'seatsFront': return [S([0, 1.25, 0], [6.05, 6.6], [16.05, 16.4])];
    case 'seatRear': return [S([0, 1.3, 0], [6.1, 6.65], [16.1, 16.45])];
    case 'dashboard': return [S([0.1, 1.45, 0], [6.05, 6.6], [16.15, 16.5])];
    case 'steeringWheel': return [S([-0.3, 1.55, 0], [6.0, 6.55], [16.2, 16.55])];
    // Step 6: coachwork
    case 'runningBoardR': case 'runningBoardL': return [S([0, 0.35, side * 1.1], [5.75, 6.3], [16.5, 16.85])];
    case 'body': return [S([0, 2.4, 0], [5.6, 6.15], [16.55, 16.9])];
    case 'scuttle': return [S([0, 2.4, 0], [5.6, 6.15], [16.6, 16.95])];
    case 'wingFR': case 'wingFL': return [S([0.15, 1.1, side * 0.75], [5.7, 6.25], [16.62, 16.97])];
    case 'wingRR': case 'wingRL': return [S([-0.15, 1.1, side * 0.75], [5.7, 6.25], [16.64, 16.99])];
    case 'doorFR': case 'doorFL': case 'doorRR': case 'doorRL':
      return [S([0, 2.4, side * 0.6], [5.65, 6.2], [16.68, 17.02], { rot: [0, side * 0.28, 0] })];
    case 'hood': return [S([-0.35, 2.7, 0], [5.55, 6.1], [16.72, 17.05])];
    case 'windscreen': return [S([0, 3.05, 0], [5.5, 6.05], [16.78, 17.1])];
    case 'bonnet': return [S([0, 2.55, 0], [5.4, 5.95], [16.85, 17.18])];
    case 'grille': return [S([0.95, 1.2, 0], [5.45, 6.0], [16.9, 17.2])];
    case 'lamps': return [S([1.45, 0.8, 0], [5.5, 6.05], [16.95, 17.25])];
    default: return [];
  }
}

// Engine internals (offsets in the engine's local frame)
export function engineStages(key) {
  switch (key) {
    case 'head': return [S([0, 0.3, 0], [9.0, 9.6], [10.4, 10.85])];
    case 'cover': return [S([0, 0.62, 0], [8.95, 9.55], [10.45, 10.9])];
    case 'camshaft': return [S([0, 0.47, 0], [9.05, 9.65], [10.4, 10.85])];
    case 'valves': return [S([0, 0.15, 0], [9.1, 9.7], [10.35, 10.8])];
    case 'sump': return [S([0, -0.32, 0], [9.0, 9.6], [10.4, 10.85])];
    case 'intake': return [S([0, 0.05, -0.38], [9.1, 9.7], [10.35, 10.8])];
    case 'exhaustManifold': return [S([0, -0.02, 0.36], [9.15, 9.75], [10.3, 10.75])];
    case 'ignition': return [S([0, 0.32, 0.42], [9.2, 9.8], [10.3, 10.75])];
    case 'front': return [S([0.42, 0, 0], [9.1, 9.7], [10.35, 10.8])];
    case 'flywheel': return [S([-0.3, 0, 0], [9.15, 9.75], [10.35, 10.8])];
    case 'bellhousing': return [S([-0.55, 0, 0], [9.1, 9.7], [10.3, 10.75])];
    default: return [];
  }
}

export const ENGINE_FX = {
  ghost: { dis: [8.5, 8.95], rec: [10.5, 10.95] },
  crank: { from: 8.45, to: 10.95, revs: 6 }, // whole revolutions so the crank ends where it began
};

// ── Camera ─────────────────────────────────────────────────────
// shift moves the subject sideways in frame (fraction of width) to leave room for type.
const K = (u, pos, tgt, fov = 30, shift = 0) => ({ u, pos, tgt, fov, shift });
export const HERO = K(0, [5.75, 1.28, 6.1], [-0.15, 0.66, 0], 27, 0.135);

export const CAMERA = [
  HERO,
  K(0.6, [5.45, 1.22, 5.78], [-0.15, 0.66, 0], 27, 0.135),
  // I. Exterior
  K(1.35, [4.35, 0.98, 2.15], [1.85, 0.95, 0.12], 30, -0.14),
  K(1.95, [4.1, 1.08, 2.55], [1.75, 0.96, 0.1], 30, -0.14),
  K(2.45, [2.75, 2.05, 2.95], [0.98, 1.04, 0], 32, 0.14),
  K(3.0, [2.35, 1.85, 3.1], [0.92, 1.0, 0], 32, 0.14),
  K(3.5, [-0.05, 0.92, 7.45], [-0.2, 0.7, 0], 30, 0),
  K(3.95, [0.15, 0.95, 7.2], [-0.2, 0.7, 0], 30, 0),
  K(4.45, [-5.0, 1.35, 3.5], [-1.45, 0.78, 0], 30, -0.12),
  K(4.95, [-5.15, 1.5, 3.05], [-1.45, 0.78, 0], 30, -0.12),
  // II. Disassembly
  K(5.65, [5.7, 3.7, 7.6], [0.0, 1.2, 0], 32, 0.08),
  K(6.9, [5.8, 5.3, 10.9], [-0.1, 1.95, 0], 33, 0.08),
  K(7.85, [8.2, 5.0, 9.5], [0.1, 1.95, 0.1], 33, 0.08),
  // III. Engine (hoisted: centre ≈ 1.45, 4.62, 2.3)
  K(8.85, [4.25, 4.25, 5.7], [1.45, 4.68, 2.3], 30, 0.13),
  K(9.5, [4.15, 4.85, 6.35], [1.4, 4.88, 2.3], 31, 0.13),
  K(10.25, [2.5, 5.0, 6.55], [1.3, 4.88, 2.3], 31, 0.13),
  K(10.95, [6.2, 4.6, 9.2], [0.2, 1.7, 0.5], 33, 0),
  // IV. Engineering
  K(11.3, [4.6, 1.6, 3.1], [1.8, 0.72, 0.3], 32, -0.12),
  K(11.8, [3.45, 1.25, 3.35], [1.95, 0.5, 1.12], 30, -0.12),
  K(12.3, [0.25, 3.3, 4.7], [-0.7, 0.78, 0], 34, 0.1),
  K(12.8, [3.2, 5.3, 4.2], [-0.15, 1.0, 0], 34, 0.12),
  K(13.3, [0.3, 2.05, 8.2], [-0.25, 1.25, 0], 33, -0.06),
  K(13.8, [-3.1, 2.95, 2.35], [-0.85, 2.05, 0], 34, -0.12),
  // V. Reconstruction
  K(14.35, [7.5, 5.0, 8.9], [0, 1.4, 0], 33, 0),
  K(15.6, [7.7, 3.6, 8.7], [-0.1, 1.1, 0], 31, 0),
  K(16.8, [6.7, 2.2, 7.6], [-0.12, 0.8, 0], 29, 0.06),
  { ...HERO, u: 17.85 },
  { ...HERO, u: U_TOTAL },
];

// Focus light: where to put the soft highlight in each beat.
export const FOCUS = [
  { u: [1.05, 2.1], at: [1.9, 0.95, 0], from: [3.4, 2.4, 1.8], intensity: 18 },
  { u: [2.25, 3.1], at: [1.0, 1.15, 0.2], from: [1.6, 3.2, 2.2], intensity: 14 },
  { u: [3.25, 4.0], at: [1.6, 0.44, 0.75], from: [2.6, 1.8, 2.6], intensity: 12 },
  { u: [4.2, 5.0], at: [-2.3, 0.75, 0.2], from: [-3.6, 2.2, 1.8], intensity: 14 },
  { u: [8.7, 10.4], at: [1.45, 4.75, 2.3], from: [3.2, 6.6, 4.4], intensity: 16 },
  { u: [11.05, 11.5], at: [1.9, 0.6, 0.3], from: [3.0, 2.0, 1.8], intensity: 12 },
  { u: [11.55, 12.0], at: [1.95, 0.45, 1.05], from: [2.9, 1.7, 2.2], intensity: 14 },
  { u: [13.55, 14.0], at: [-0.85, 2.1, 0], from: [-2.4, 3.2, 1.8], intensity: 12 },
];

// ── Annotations ────────────────────────────────────────────────
// part: key in the car (or 'engine.<key>' for internals). at: optional world-space point
// at assembly, converted to the part's local frame at load.
const A = (part, u, extra = {}) => ({ part, u, ...extra });
export const ANNOTATIONS = [
  // I. Exterior
  A('grille', [1.15, 2.05]),
  A('lamps', [1.25, 2.05]),
  A('bonnet', [2.3, 3.05], { title: 'Leather bonnet straps', note: 'Hold the panels shut at 100 mph' }),
  A('bonnet', [2.4, 3.05], { title: 'Louvres', note: 'Seventeen pressings each side release engine heat', at: [1.18, 0.92, 0.3] }),
  A('wheelFR', [3.3, 3.98]),
  A('runningBoardR', [3.38, 3.98]),
  A('doorFR', [3.45, 3.98], { title: 'Door handle', note: 'Nickel-plated, flush with the panel' }),
  A('fuelTank', [4.25, 4.98]),
  A('exhaust', [4.3, 4.98], { title: 'Fishtail exhaust', note: 'Spreads the gas flow, softens the note', at: [-2.45, 0.47, 0.31] }),
  A('hood', [4.35, 4.98]),
  // II. Disassembly — major systems only
  A('bonnet', [6.15, 7.95], { title: 'Coachwork', note: 'Bonnet, body, wings and doors' }),
  A('seatsFront', [6.6, 7.95], { title: 'Interior', note: 'Seats, dashboard, trim' }),
  A('wheelFR', [6.85, 7.95], { title: 'Wheels and brakes', note: 'Four corners, centre-lock hubs' }),
  A('engine', [7.3, 7.95]),
  A('gearbox', [7.4, 7.95], { title: 'Transmission', note: 'Gearbox and open propeller shaft' }),
  A('frame', [7.45, 7.95], { title: 'Chassis', note: 'The foundation everything hangs from' }),
  // III. Engine
  A('engine.block', [8.75, 9.05]),
  A('engine.pistons', [8.8, 9.05]),
  A('engine.crankshaft', [8.85, 9.05]),
  A('engine.rods', [8.9, 9.05]),
  A('engine.head', [9.6, 10.0]),
  A('engine.camshaft', [9.62, 10.0]),
  A('engine.valves', [9.64, 10.0]),
  A('engine.cover', [9.66, 10.0]),
  A('engine.intake', [9.68, 10.0]),
  A('engine.ignition', [10.0, 10.38]),
  A('engine.exhaustManifold', [10.02, 10.38]),
  A('engine.sump', [10.04, 10.38]),
  A('engine.front', [10.06, 10.38]),
  A('engine.flywheel', [10.08, 10.38]),
  // IV. Engineering
  A('frontAxle', [11.1, 11.5]),
  A('steering', [11.12, 11.5]),
  A('brakeFR', [11.6, 12.0]),
  A('wheelFR', [11.62, 12.0], { title: 'Knock-off spinner', note: 'One copper mallet blow releases the wheel', at: [1.6, 0.44, 0.83] }),
  A('gearbox', [12.1, 12.5]),
  A('propshaft', [12.12, 12.5]),
  A('rearAxle', [12.14, 12.5]),
  A('frame', [12.6, 13.0]),
  A('radiator', [13.1, 13.5]),
  A('fuelTank', [13.12, 13.5]),
  A('exhaust', [13.14, 13.5]),
  A('seatsFront', [13.6, 14.0]),
  A('dashboard', [13.62, 14.0]),
  A('steeringWheel', [13.64, 14.0]),
];

// ── Captions ───────────────────────────────────────────────────
export const CARDS = [
  {
    id: 'c1a', u: [1.05, 2.08], side: 'right', numeral: 'I', kicker: 'The Exterior',
    title: 'The face of the car', body: 'A nickel radiator shell, a woven stone guard against flying gravel, and lamps the size of dinner plates. It was designed to be recognised long before it could be heard.',
  },
  {
    id: 'c1b', u: [2.25, 3.08], side: 'left', kicker: 'I · Bonnet',
    title: 'Half the car is engine', body: 'The bonnet runs nearly two metres. Two leather straps keep it closed at speed, and rows of louvres let the heat of six cylinders escape.',
  },
  {
    id: 'c1c', u: [3.25, 4.0], side: 'left', kicker: 'I · Profile',
    title: 'One unbroken line', body: 'From the front wing, along the running board and over the rear wheel. The wheels are 21-inch wire wheels, each held by a single knock-off spinner.',
  },
  {
    id: 'c1d', u: [4.2, 5.0], side: 'right', kicker: 'I · The tail',
    title: 'Built to cross a continent', body: 'A cut-down tourer body, a folded hood, and a 25-gallon tank between the rear dumb irons, enough for a day of fast running between towns.',
  },
  {
    id: 'c2a', u: [5.45, 6.35], side: 'left', numeral: 'II', kicker: 'The Disassembly',
    title: 'Beneath the paint, a machine', body: 'Keep scrolling and the car comes apart. Each panel leaves along the path it was fitted, so every part keeps its place in the car’s geometry.',
  },
  {
    id: 'c2b', u: [6.45, 7.98], side: 'left', kicker: 'II · Exploded view',
    title: 'Forty-one components', body: 'Coachwork rises highest. Below it the interior, then the engine and gearbox, then the frame, with the axles and wheels left at the corners where they stood.',
  },
  {
    id: 'c3a', u: [8.1, 9.08], side: 'left', numeral: 'III', kicker: 'The Engine',
    title: 'Six cylinders, six and a half litres', body: 'The iron block turns to glass. Inside, six aluminium pistons ride on a crankshaft carried in seven main bearings. Scroll to turn the engine over.',
  },
  {
    id: 'c3b', u: [9.18, 10.4], side: 'left', kicker: 'III · Exploded engine',
    title: 'One camshaft, twelve valves', body: 'A single overhead camshaft turns at half crankshaft speed and opens each valve in the firing order 1-5-3-6-2-4. A magneto makes its own spark, so the engine needs no battery to run.',
  },
  {
    id: 'c4a', u: [11.05, 11.52], side: 'right', numeral: 'IV', kicker: 'IV.1 · Suspension and steering',
    title: 'Leaves and links', body: 'Semi-elliptic leaf springs on beam axles front and rear, damped by friction discs. A worm-and-wheel box turns the front wheels through a drag link and track rod.',
  },
  {
    id: 'c4b', u: [11.55, 12.02], side: 'right', kicker: 'IV.2 · Braking',
    title: 'Sixteen-inch drums', body: 'Finned drums almost as wide as the wheel rims, worked by rods from a single pedal. The handbrake lever sits outside the body, by the driver’s right hand.',
  },
  {
    id: 'c4c', u: [12.05, 12.52], side: 'left', kicker: 'IV.3 · Wheels and drivetrain',
    title: 'From flywheel to tyre', body: 'A four-speed gearbox sends power through an open propeller shaft and two universal joints to a spiral-bevel rear axle.',
  },
  {
    id: 'c4d', u: [12.55, 13.02], side: 'left', kicker: 'IV.4 · Chassis',
    title: 'A ladder of steel', body: 'Two pressed-steel side members, riveted and tied by tubular cross-members, kick up over the rear axle. Everything else hangs from them.',
  },
  {
    id: 'c4e', u: [13.05, 13.52], side: 'right', kicker: 'IV.5 · Fuel and cooling',
    title: 'Fuel forward, heat out', body: 'Petrol is drawn forward from the rear tank by vacuum feed. Water circulates from a pump on the nose of the engine to the honeycomb radiator behind the stone guard.',
  },
  {
    id: 'c4f', u: [13.55, 14.02], side: 'right', kicker: 'IV.6 · Interior',
    title: 'Made by hand', body: 'Pleated hide over horsehair, a burr-walnut dashboard with four instruments, and an 18-inch wheel with sprung spokes to take the sting out of a long day.',
  },
];
