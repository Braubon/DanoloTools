// Estado global de la aplicación + historial (deshacer / rehacer)
export const WORLD = { w: 1600, h: 1200 };
export const MAX_W = 2000, MAX_H = 2000;
export const DENS_RES = 5; // metros por celda de la rejilla de densidad
export const GW = Math.ceil(MAX_W / DENS_RES);
export const GH = Math.ceil(MAX_H / DENS_RES);

export const ASPECTS = [
  { id: '4:3', name: '4:3 apaisado', w: 1600, h: 1200 },
  { id: '3:2', name: '3:2 apaisado', w: 1700, h: 1130 },
  { id: 'A4h', name: 'A4 / A3 apaisado', w: 1650, h: 1170 },
  { id: '16:9', name: '16:9 panorámico', w: 1840, h: 1040 },
  { id: '2:1', name: '2:1 panorámico', w: 1960, h: 980 },
  { id: '1:1', name: '1:1 cuadrado', w: 1390, h: 1390 },
  { id: '3:4', name: '3:4 vertical', w: 1200, h: 1600 },
  { id: '2:3', name: '2:3 vertical', w: 1130, h: 1700 },
  { id: 'A4v', name: 'A4 / A3 vertical', w: 1170, h: 1650 },
  { id: '9:16', name: '9:16 vertical', w: 1040, h: 1840 },
];
export function syncAspect() {
  const a = ASPECTS.find(x => x.id === state.params.aspect) || ASPECTS[0];
  WORLD.w = a.w; WORLD.h = a.h;
}

export function emptyLayers() {
  return {
    rivers: [],   // {pts, width}
    lakes: [],    // {pts, r, mode:'add'|'sub'}
    cliffs: [],   // {pts} cerrado
    roads: [],    // {pts, width}
    forest: [],   // {pts, r, mode}
    walls: [],    // {pts} cerrado
    citadels: [], // {x, y, r}
    ports: [],    // {x, y, ang, w, len, n}  (x,y en la orilla; ang hacia el agua)
    sand: [],     // playas y arenales {pts, r, mode}
    marsh: [],    // pantanos {pts, r, mode}
    crops: [],    // cultivos pintados a mano {pts, r, mode}
    districts: [], // barrios {pts, kind, r, width, type, mode}
  };
}

export const state = {
  step: 1,
  tool: 'poly',
  layers: emptyLayers(),
  density: new Uint8Array(GW * GH),
  districts: new Uint8Array(GW * GH), // 0 ninguno · 1 rico · 2 pobre · 3 mercantil · 4 religioso
  params: {
    seed: 1234,
    blockSize: 42,     // tamaño de manzana (m)
    lotSize: 95,       // superficie media de parcela (m²)
    streetWidth: 4,    // anchura calle secundaria (m)
    plazas: 2,
    trees: 0.5,
    farmRing: 160,     // anillo de granjas (m)
    buildingGap: 0,    // separación entre casas (m)
    roofVar: 0.5,      // variación de color de los tejados
    mapScale: 1,       // metros reales por unidad de dibujo
    aspect: '4:3',
    specials: { temple: true, market: true, hall: true, barracks: true, mills: true },
    lanes: true,       // caminos secundarios automáticos (granjas y puertos)
    scaleBar: true,    // escala gráfica
  },
  opts: {
    element: 'wall',   // 'water' | 'road' | 'cliff' | 'wall' | 'forest' | 'citadel' | 'soil' | 'district'
    polyMode: 'free',  // 'rect' | 'circle' | 'free'
    selectTransform: false,
    drawErase: false,
    roadWidth: 9,
    riverWidth: 22,
    cliffWidth: 28,
    wallWidth: 3.6,
    towerR: 2.8,
    brushR: 30,
    densStrength: 0.5,
    densErase: false,
    lakeErase: false,
    forestErase: false,
    citadelR: 38,
    portW: 60,
    portLen: 26,
    portN: 3,
    userRoadWidth: 4,
    waterMode: 'river',
    showDensity: true,
    soilMode: 'sand',
    soilErase: false,
    districtType: 1,
    districtErase: false,
    showDistricts: true,
  },
  edits: { merges: [], deleted: [], roads: [] },
  gen: null,      // resultado de la generación
  genDirty: true,
};

// ---------- Historial ----------
const undoStack = [];
const redoStack = [];
const LIMIT = 80;

function snapshot() {
  return {
    layers: structuredClone(state.layers),
    density: state.density.slice(),
    districts: state.districts.slice(),
    params: structuredClone(state.params),
    edits: structuredClone(state.edits),
  };
}
function restore(s) {
  state.layers = s.layers;
  state.density = s.density;
  if (s.districts) state.districts = s.districts;
  state.params = s.params;
  state.edits = s.edits;
  syncAspect();
}

export function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > LIMIT) undoStack.shift();
  redoStack.length = 0;
}
export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  return true;
}
export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  return true;
}
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

// ---------- RNG determinista ----------
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, y, s = 0) {
  let h = (Math.imul(Math.round(x * 10), 374761393) + Math.imul(Math.round(y * 10), 668265263) + s * 2654435761) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// ---------- Densidad ----------
export function densityAt(x, y) {
  const gx = x / DENS_RES - 0.5, gy = y / DENS_RES - 0.5;
  const x0 = Math.max(0, Math.min(GW - 1, Math.floor(gx))), y0 = Math.max(0, Math.min(GH - 1, Math.floor(gy)));
  const x1 = Math.min(GW - 1, x0 + 1), y1 = Math.min(GH - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, gx - x0)), ty = Math.max(0, Math.min(1, gy - y0));
  const d = state.density;
  const a = d[y0 * GW + x0] * (1 - tx) + d[y0 * GW + x1] * tx;
  const b = d[y1 * GW + x0] * (1 - tx) + d[y1 * GW + x1] * tx;
  return (a * (1 - ty) + b * ty) / 255;
}
export function sprayDensity(x, y, r, amount, erase) {
  const R = r / DENS_RES;
  const cx = x / DENS_RES, cy = y / DENS_RES;
  const gx0 = Math.max(0, Math.floor(cx - R)), gx1 = Math.min(GW - 1, Math.ceil(cx + R));
  const gy0 = Math.max(0, Math.floor(cy - R)), gy1 = Math.min(GH - 1, Math.ceil(cy + R));
  const d = state.density;
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const dd = Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy) / R;
    if (dd >= 1) continue;
    const w = (1 - dd * dd) * amount * 255;
    const i = gy * GW + gx;
    d[i] = erase ? Math.max(0, d[i] - w) : Math.min(255, d[i] + w);
  }
}
export function hasDensity() {
  const d = state.density;
  for (let i = 0; i < d.length; i++) if (d[i] > 40) return true;
  return false;
}
export function settlementDefined() {
  return state.layers.walls.length > 0 || hasDensity();
}

// ---------- Barrios ----------
export function paintDistrict(x, y, r, type) {
  const R = r / DENS_RES, cx = x / DENS_RES, cy = y / DENS_RES;
  const gx0 = Math.max(0, Math.floor(cx - R)), gx1 = Math.min(GW - 1, Math.ceil(cx + R));
  const gy0 = Math.max(0, Math.floor(cy - R)), gy1 = Math.min(GH - 1, Math.ceil(cy + R));
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++)
    if (Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy) < R) state.districts[gy * GW + gx] = type;
}
export function districtAt(x, y) {
  const gx = Math.max(0, Math.min(GW - 1, Math.floor(x / DENS_RES)));
  const gy = Math.max(0, Math.min(GH - 1, Math.floor(y / DENS_RES)));
  return state.districts[gy * GW + gx];
}
export const DISTRICTS = [
  null,
  { id: 1, name: 'Rico', color: [196, 150, 40] },
  { id: 2, name: 'Pobre', color: [120, 100, 90] },
  { id: 3, name: 'Mercantil', color: [60, 120, 170] },
  { id: 4, name: 'Religioso', color: [150, 80, 160] },
];

export function shiftWorld(dx, dy) {
  const s = (p) => [p[0] + dx, p[1] + dy];
  for (const arr of Object.values(state.layers)) {
    for (const u of arr) {
      if (u.pts) u.pts = u.pts.map(s);
      if (typeof u.x === 'number') { u.x += dx; u.y += dy; }
    }
  }
  for (const r of state.edits.roads) r.pts = r.pts.map(s);
  const gx = Math.round(dx / DENS_RES), gy = Math.round(dy / DENS_RES);
  const shiftGrid = (src) => {
    const out = new Uint8Array(GW * GH);
    for (let y = 0; y < GH; y++) {
      const sy = y - gy;
      if (sy < 0 || sy >= GH) continue;
      for (let x = 0; x < GW; x++) {
        const sx = x - gx;
        if (sx >= 0 && sx < GW) out[y * GW + x] = src[sy * GW + sx];
      }
    }
    return out;
  };
  state.density = shiftGrid(state.density);
  state.districts = shiftGrid(state.districts);
}
