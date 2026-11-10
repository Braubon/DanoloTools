// Genera un mapa totalmente aleatorio (todos los pasos)
import { state, WORLD, GW, GH, emptyLayers, sprayDensity, mulberry32 } from './state.js';
import { chaikin, regularPoly, pointInRing } from './geom.js';
import { snapToShore, waterShape } from './layers.js';

export function randomizeAll(forcedSeed) {
  const seed = forcedSeed ?? ((Math.random() * 1e9) | 0);
  const rng = mulberry32(seed);
  const R = (a, b) => a + rng() * (b - a);
  const L = emptyLayers();
  const cx = WORLD.w / 2 + R(-140, 140), cy = WORLD.h / 2 + R(-90, 90);

  // río
  if (rng() < 0.7) {
    const horizontal = rng() < 0.5;
    const off = R(140, 320) * (rng() < 0.5 ? -1 : 1);
    const pts = [];
    const N = 9;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const wob = Math.sin(t * Math.PI * R(1.5, 2.5) + R(0, 6)) * R(30, 90) + R(-25, 25);
      if (horizontal) pts.push([-40 + t * (WORLD.w + 80), cy + off + wob]);
      else pts.push([cx + off + wob, -40 + t * (WORLD.h + 80)]);
    }
    L.rivers.push({ pts: chaikin(pts, 3), width: R(18, 34) });
  }
  // lago / costa
  if (rng() < 0.25) {
    const a = R(0, Math.PI * 2);
    const lx = cx + Math.cos(a) * R(420, 600), ly = cy + Math.sin(a) * R(350, 480);
    const pts = [];
    for (let k = 0; k < 6; k++) pts.push([lx + R(-90, 90), ly + R(-60, 60)]);
    L.lakes.push({ pts: chaikin(pts, 2), r: R(45, 80), mode: 'add' });
  }
  // riscos
  if (rng() < 0.55) {
    const a = R(0, Math.PI * 2), d = R(150, 380);
    const poly = regularPoly(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R(70, 150), 9, R(0, 6), 0.3, rng);
    L.cliffs.push({ pts: chaikin(poly, 2, true) });
  }
  // caminos principales: del centro hacia los bordes
  const nRoads = 2 + Math.floor(rng() * 3);
  const angles = [];
  const base = R(0, Math.PI * 2);
  for (let i = 0; i < nRoads; i++) angles.push(base + (i / nRoads) * Math.PI * 2 + R(-0.35, 0.35));
  for (const a of angles) {
    const pts = [[cx + R(-15, 15), cy + R(-15, 15)]];
    const len = 1100;
    let ang = a;
    for (let k = 1; k <= 7; k++) {
      ang += R(-0.18, 0.18);
      pts.push([pts[k - 1][0] + Math.cos(ang) * len / 7, pts[k - 1][1] + Math.sin(ang) * len / 7]);
    }
    L.roads.push({ pts: chaikin(pts, 2), width: R(8, 11) });
  }
  // bosques lejos del centro
  const nF = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < nF; i++) {
    const a = R(0, Math.PI * 2), d = R(430, 700);
    const fx = cx + Math.cos(a) * d, fy = cy + Math.sin(a) * d * 0.8;
    const pts = [];
    for (let k = 0; k < 5; k++) pts.push([fx + R(-80, 80), fy + R(-60, 60)]);
    L.forest.push({ pts: chaikin(pts, 2), r: R(30, 60), mode: 'add' });
  }
  // muralla o área de asentamiento
  state.density.fill(0);
  state.districts.fill(0);
  const wallR = R(170, 260);
  let wall = null;
  if (rng() < 0.65) {
    wall = regularPoly(cx, cy, wallR, 11 + Math.floor(rng() * 6), R(0, 6), 0.13, rng);
    L.walls.push({ pts: wall });
    if (rng() < 0.45) {
      const a = R(0, Math.PI * 2);
      for (let k = 0; k < 40; k++) sprayDensity(cx + Math.cos(a) * (wallR + 50) + R(-60, 60), cy + Math.sin(a) * (wallR + 50) + R(-60, 60), 60, 0.12, false);
    }
  } else {
    for (let k = 0; k < 140; k++) {
      const a = R(0, Math.PI * 2), d = Math.abs(R(-1, 1) * R(0, 1)) * 280;
      sprayDensity(cx + Math.cos(a) * d * 1.2, cy + Math.sin(a) * d, R(50, 90), R(0.12, 0.22), false);
    }
    // densidad a lo largo de los caminos
    for (const r of L.roads) for (let k = 0; k < r.pts.length; k += 3) {
      const [x, y] = r.pts[k];
      if (Math.hypot(x - cx, y - cy) < 420) sprayDensity(x, y, 45, 0.25, false);
    }
  }
  // ciudadela
  if (rng() < 0.4) {
    const a = R(0, Math.PI * 2);
    const d = wall ? wallR * 0.72 : R(80, 160);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    if (!wall || pointInRing([x, y], wall)) L.citadels.push({ x, y, r: R(30, 45) });
  }

  state.layers = L;
  // puerto en la orilla más cercana al centro
  if ((L.rivers.length || L.lakes.length) && rng() < 0.6) {
    const sn = snapToShore([cx, cy], waterShape(), 420);
    if (sn) L.ports.push({ ...sn, w: R(40, 90), len: R(18, 34), n: 2 + Math.floor(rng() * 3) });
  }
  state.edits = { merges: [], deleted: [], roads: [] };
  state.params = {
    ...state.params,
    seed: (rng() * 1e9) | 0,
    blockSize: Math.round(R(34, 52)),
    lotSize: Math.round(R(75, 125)),
    plazas: Math.floor(R(1, 4)),
    trees: Math.round(R(0.3, 0.8) * 100) / 100,
    farmRing: Math.round(R(110, 220)),
  };
  void GW; void GH;
}
