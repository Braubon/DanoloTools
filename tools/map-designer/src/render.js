// Dibujo del mapa en SVG (estilo plano, sin sombras)
import { state, WORLD, mulberry32, hash2 } from './state.js';
import {
  ringsToPath, lineToPath, polylineCrossings, pointAt, polylineLength, pointInShape, dist, bbox,
  orientedRect, offset, outerRings, centroid, intersection, difference, union, bufferLine, polygons, ringArea,
} from './geom.js';
import { waterShape, forestShape, cliffShape, roadShape, wallShape, citadelShape, portParts, sandShape, marshShape, cropShape } from './layers.js';

export const PAL = {
  paper: '#E8E1CF',
  street: '#F5F0E4',
  roadEdge: '#ADA389',
  block: '#E8E1CF',
  building: '#C8BCA3',
  buildingAlt: '#BFB298',
  keep: '#A99C82',
  ink: '#37312A',
  water: '#A8BDC1',
  waterEdge: '#6F8387',
  tree: '#ADB38B',
  treeEdge: '#5E6148',
  forest: '#DAD9BF',
  field: '#E2DAC2',
  field2: '#DAD1B5',
  furrow: '#C6BB9C',
  huerta: '#CDD0AE',
  huertaRow: '#9EA37E',
  fence: '#8B8169',
  cliff: '#5E5648',
  cliffFace: '#B3A790',
  cliffFoot: '#8E836D',
  plateau: '#F2EDE1',
  wood: '#C4AE88',
  sand: '#EFDFB4',
  sandDot: '#CDB984',
  marsh: '#CBCFAE',
  reed: '#7C8460',
  boat: '#DCCDAF',
};

const n1 = (v) => Math.round(v * 10) / 10;
// K = unidades de dibujo por metro real (1 / escala del mapa)
let K = 1;
const kk = (v, min = 0) => Math.max(min, v * K);
const n2 = (v) => Math.round(v * 100) / 100;

function defs() {
  let s = '<defs>';
  for (let k = 0; k < 12; k++) {
    const a = `${k * 15}) scale(${n2(K)}`;
    s += `<pattern id="fu${k}" patternUnits="userSpaceOnUse" width="3.2" height="3.2" patternTransform="rotate(${a})"><rect width="3.2" height="3.2" fill="${PAL.field}"/><line x1="0" y1="1.6" x2="3.2" y2="1.6" stroke="${PAL.furrow}" stroke-width="0.55"/></pattern>`;
    s += `<pattern id="fv${k}" patternUnits="userSpaceOnUse" width="4.5" height="4.5" patternTransform="rotate(${a})"><rect width="4.5" height="4.5" fill="${PAL.field2}"/><line x1="0" y1="2.25" x2="4.5" y2="2.25" stroke="${PAL.furrow}" stroke-width="0.5"/></pattern>`;
    s += `<pattern id="hu${k}" patternUnits="userSpaceOnUse" width="1.8" height="1.8" patternTransform="rotate(${a})"><rect width="1.8" height="1.8" fill="${PAL.huerta}"/><line x1="0" y1="0.9" x2="1.8" y2="0.9" stroke="${PAL.huertaRow}" stroke-width="0.6" stroke-dasharray="0.9 0.5"/></pattern>`;
  }
  // pantano: matas de juncos
  const tuft = `M0.6 3.2l0.6-1.8M1.5 3.2V1.0M2.4 3.2l-0.6-1.8`;
  s += `<pattern id="marshp" patternUnits="userSpaceOnUse" width="7" height="6" patternTransform="scale(${n2(K)})"><rect width="7" height="6" fill="${PAL.marsh}"/><path d="${tuft}" stroke="${PAL.reed}" stroke-width="0.35" fill="none" stroke-linecap="round"/><path d="M4.3 6.2l0.5-1.5M5 6.2V4.3M5.8 6.2l-0.5-1.5" stroke="${PAL.reed}" stroke-width="0.35" fill="none" stroke-linecap="round" transform="translate(0 -1.6)"/><path d="M3.6 1.2h1.6" stroke="${PAL.water}" stroke-width="0.5" stroke-linecap="round"/></pattern>`;
  s += `<pattern id="sandp" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="scale(${n2(K)})"><rect width="5" height="5" fill="${PAL.sand}"/><circle cx="1.2" cy="1.4" r="0.22" fill="${PAL.sandDot}"/><circle cx="3.6" cy="3.5" r="0.22" fill="${PAL.sandDot}"/><circle cx="3.9" cy="0.9" r="0.16" fill="${PAL.sandDot}"/></pattern>`;
  return s + '</defs>';
}
const angIdx = (a) => {
  let d = ((a * 180) / Math.PI) % 180;
  if (d < 0) d += 180;
  return Math.round(d / 15) % 12;
};

// ---------- árboles de bosque ----------
let forestCache = { key: null, trees: [] };
function forestTrees(forest) {
  const key = JSON.stringify(state.layers.forest) + K;
  if (forestCache.key === key) return forestCache.trees;
  const trees = [];
  if (forest.length) {
    const bb = bbox(forest);
    const rng = mulberry32(99);
    const s = kk(6.2, 2.4);
    for (let y = bb.y0; y <= bb.y1; y += s) for (let x = bb.x0; x <= bb.x1; x += s) {
      const px = x + (rng() - 0.5) * s * 0.9, py = y + (rng() - 0.5) * s * 0.9;
      if (pointInShape([px, py], forest)) trees.push([px, py, Math.max(s * 0.5, kk(3 + rng() * 1.6))]);
    }
  }
  forestCache = { key, trees };
  return trees;
}
// Árboles: las copas que se tocan se funden en una sola masa con contorno festoneado
const massCache = new WeakMap();
function treeMass(trees) {
  let d = massCache.get(trees);
  if (d !== undefined) return d;
  const polys = [];
  for (const [x, y, r] of trees) {
    const n = 12, ring = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ring.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
    polys.push(ring);
  }
  if (!polys.length) { massCache.set(trees, ''); return ''; }
  // cierre morfológico: rellena los huecos entre copas y deja el borde festoneado
  const rr = trees.reduce((m, t) => m + t[2], 0) / trees.length;
  const closed = offset(offset(union(polys), rr * 0.7, 'round'), -rr * 0.7, 'round');
  const minHole = (rr * 5) ** 2;
  const rings = [];
  for (const pg of polygons(closed)) {
    rings.push(pg.outer);
    for (const h of pg.holes) if (Math.abs(ringArea(h)) > minHole) rings.push(h);
  }
  d = ringsToPath(rings);
  massCache.set(trees, d);
  return d;
}
function treesSvg(trees) {
  if (!trees.length) return '';
  return `<path d="${treeMass(trees)}" fill="${PAL.tree}" stroke="${PAL.treeEdge}" stroke-width="${n2(kk(0.5, 0.14))}" stroke-linejoin="round" fill-rule="evenodd"/>`;
}
const hexRGB = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixC = (a, b, t) => { const A = hexRGB(a), B = hexRGB(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

// ---------- riscos: contorno + trazos perpendiculares hacia abajo ----------
// Riscos: meseta ligeramente más clara, cantil con dientes de roca hacia la parte baja
const cliffFace = () => kk(10, 4);
function cliffSvg(cliffs) {
  if (!cliffs.length) return '';
  const F = cliffFace();
  const band = difference(offset(cliffs, F, 'round'), cliffs);
  const step = kk(3.4, 1.5), base = kk(3, 1.3);
  let teeth = '';
  for (const r of cliffs) {
    const n = r.length;
    let acc = 0, k = 0;
    for (let i = 0; i < n; i++) {
      const a = r[i], b = r[(i + 1) % n];
      const L = dist(a, b);
      if (L < 0.01) continue;
      const dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      let nr = [-dir[1], dir[0]];
      const mid = [(a[0] + b[0]) / 2 + nr[0] * 0.5, (a[1] + b[1]) / 2 + nr[1] * 0.5];
      if (pointInShape(mid, cliffs)) nr = [-nr[0], -nr[1]];
      let t = (step - (acc % step)) % step;
      while (t < L) {
        const p = [a[0] + dir[0] * t, a[1] + dir[1] * t];
        const len = F * (k++ % 3 === 1 ? 0.55 : 0.9 + ((k * 7) % 3) * 0.05);
        const h = base / 2;
        teeth += `M${n1(p[0] - dir[0] * h)} ${n1(p[1] - dir[1] * h)}L${n1(p[0] + nr[0] * len)} ${n1(p[1] + nr[1] * len)}L${n1(p[0] + dir[0] * h)} ${n1(p[1] + dir[1] * h)}Z`;
        t += step;
      }
      acc += L;
    }
  }
  return `<path d="${ringsToPath(cliffs)}" fill="${PAL.plateau}" fill-rule="evenodd"/>` +
    `<path d="${ringsToPath(band)}" fill="${PAL.cliffFace}" fill-rule="evenodd"/>` +
    `<path d="${teeth}" fill="${PAL.cliff}"/>` +
    `<path d="${ringsToPath(band)}" fill="none" stroke="${PAL.cliffFoot}" stroke-width="${n2(kk(0.5, 0.15))}"/>` +
    `<path d="${ringsToPath(cliffs)}" fill="none" stroke="${PAL.ink}" stroke-width="${n2(kk(1.3, 0.4))}" stroke-linejoin="round"/>`;
}

// ---------- puentes / escaleras ----------
function subPath(pts, s0, s1, step = 2) {
  const out = [];
  for (let s = s0; s < s1; s += step) out.push(pointAt(pts, s).p);
  out.push(pointAt(pts, s1).p);
  return out;
}
function allRoads() {
  return [...state.layers.roads, ...state.edits.roads];
}
function bridgesSvg(water) {
  if (!water.length) return '';
  let s = '';
  for (const r of allRoads()) {
    const cr = polylineCrossings(r.pts, water);
    const total = polylineLength(r.pts);
    const marks = [0, ...cr.map(c => c.s), total];
    for (let i = 0; i < marks.length - 1; i++) {
      const a = marks[i], b = marks[i + 1];
      if (b - a < 0.5) continue;
      const mid = pointAt(r.pts, (a + b) / 2).p;
      if (!pointInShape(mid, water)) continue;
      if (b - a > 180) continue;
      const s0 = Math.max(0, a - 3), s1 = Math.min(total, b + 3);
      const d = lineToPath(subPath(r.pts, s0, s1));
      const w = Math.max(r.width * 0.75, 3.5);
      s += `<path d="${d}" fill="none" stroke="${PAL.ink}" stroke-width="${n1(w + 1.6)}" stroke-linecap="butt" stroke-linejoin="round"/>`;
      s += `<path d="${d}" fill="none" stroke="${PAL.street}" stroke-width="${n1(w)}" stroke-linecap="butt" stroke-linejoin="round"/>`;
    }
  }
  return s;
}
function stairsSvg(cliffs) {
  if (!cliffs.length) return '';
  let s = '';
  for (const r of allRoads()) {
    for (const c0 of polylineCrossings(r.pts, cliffs)) {
      const w = r.width * 0.9;
      let d = '';
      const F = cliffFace();
      // la escalera ocupa el cantil (fuera de la meseta)
      const sg = pointInShape([c0.p[0] + c0.dir[0] * F * 0.5, c0.p[1] + c0.dir[1] * F * 0.5], cliffs) ? -1 : 1;
      const c = { ...c0, p: [c0.p[0] + c0.dir[0] * sg * F * 0.45, c0.p[1] + c0.dir[1] * sg * F * 0.45] };
      const L = F * 1.25, nSteps = Math.max(4, Math.round(L / kk(1.1, 0.5)));
      for (let k = 0; k <= nSteps; k++) {
        const t = -L / 2 + (L * k) / nSteps;
        const px = c.p[0] + c.dir[0] * t, py = c.p[1] + c.dir[1] * t;
        const nx = -c.dir[1] * w / 2, ny = c.dir[0] * w / 2;
        d += `M${n1(px - nx)} ${n1(py - ny)}L${n1(px + nx)} ${n1(py + ny)}`;
      }
      const rect = orientedRect(c.p[0], c.p[1], L + 1, w + 0.6, Math.atan2(c.dir[1], c.dir[0]));
      s += `<path d="${ringsToPath([rect])}" fill="${PAL.street}" stroke="${PAL.ink}" stroke-width="${n2(kk(0.6, 0.2))}"/>`;
      s += `<path d="${d}" stroke="${PAL.ink}" stroke-width="${n2(kk(0.45, 0.15))}"/>`;
    }
  }
  return s;
}

// ---------- puertos ----------
export function portsSvg(ports, water) {
  if (!ports || !ports.length) return '';
  let quays = '', piers = '', boats = '';
  const inWater = water.length ? offset(water, -kk(1, 0.3)) : [];
  for (const pt of ports) {
    const pp = portParts(pt, K);
    quays += ringsToPath([pp.quay]);
    // los embarcaderos no pasan de la orilla de enfrente
    const pr = inWater.length ? intersection([...pp.piers, ...pp.heads], inWater) : [...pp.piers, ...pp.heads];
    piers += ringsToPath(pr);
    for (const bt of pp.boats) if (!water.length || bt.every(q => pointInShape(q, water))) boats += ringsToPath([bt]);
  }
  const sw = n2(kk(0.6, 0.15));
  return `<path d="${piers}" fill="${PAL.wood}" stroke="${PAL.ink}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<path d="${quays}" fill="${PAL.street}" stroke="${PAL.ink}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<path d="${boats}" fill="${PAL.boat}" stroke="${PAL.ink}" stroke-width="${n2(kk(0.5, 0.12))}" stroke-linejoin="round"/>`;
}

// ---------- murallas, puertas y torres ----------
function wallSvg(rings, opts) {
  if (!rings.length) return '';
  let { width = 3.6, towerR = 2.8, roads, everyVertex = false, center, water = [] } = opts;
  width = kk(width, 1.2); towerR = kk(towerR, 1);
  let s;
  const wet = (p) => water.length && pointInShape(p, water);
  if (water.length) {
    // la muralla se interrumpe en el agua; torre en cada punto donde entra o sale
    let body = [];
    for (const r of rings) body = union(body, bufferLine(r, width / 2, true));
    body = difference(body, water);
    s = `<path d="${ringsToPath(body)}" fill="${PAL.ink}" fill-rule="nonzero"/>`;
    for (const r of rings) for (const c of polylineCrossings([...r, r[0]], water))
      s += `<circle cx="${n1(c.p[0])}" cy="${n1(c.p[1])}" r="${n2(towerR * 1.15)}" fill="${PAL.ink}"/>`;
  } else {
    s = `<path d="${ringsToPath(rings)}" fill="none" stroke="${PAL.ink}" stroke-width="${width}" stroke-linejoin="round"/>`;
  }
  const gates = [];
  for (const r of roads) for (const c of polylineCrossings(r.pts, rings)) gates.push({ ...c, w: r.width });
  if (everyVertex && !gates.length && center) {
    // ciudadela sin camino: puerta hacia el centro urbano
    const ring = rings[0];
    const c0 = centroid(ring);
    let best = null, bd = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const d = dist(m, center);
      if (d < bd) { bd = d; best = { p: m, edge: [b[0] - a[0], b[1] - a[1]] }; }
    }
    if (best) gates.push({ ...best, w: 4 });
    void c0;
  }
  // torres
  const towers = [];
  for (const ring of rings) {
    const n = ring.length;
    let since = 999;
    for (let i = 0; i < n; i++) {
      const p0 = ring[(i - 1 + n) % n], p = ring[i], p1 = ring[(i + 1) % n];
      const a0 = Math.atan2(p[1] - p0[1], p[0] - p0[0]), a1 = Math.atan2(p1[1] - p[1], p1[0] - p[0]);
      let da = Math.abs(a1 - a0); if (da > Math.PI) da = 2 * Math.PI - da;
      since += dist(p0, p);
      if (everyVertex || da > 0.45 || since > kk(42, 12)) { towers.push(p); since = 0; }
    }
  }
  for (const t of towers) {
    if (gates.some(g => dist(g.p, t) < g.w / 2 + kk(9, 3))) continue;
    if (wet(t)) continue;
    s += `<circle cx="${n1(t[0])}" cy="${n1(t[1])}" r="${towerR}" fill="${PAL.ink}"/>`;
  }
  for (const g of gates) {
    if (wet(g.p)) continue;
    const el = Math.hypot(g.edge[0], g.edge[1]) || 1;
    const ed = [g.edge[0] / el, g.edge[1] / el];
    const ang = Math.atan2(ed[1], ed[0]);
    const gw = Math.max(g.w, 4) + 1.5;
    s += `<path d="${ringsToPath([orientedRect(g.p[0], g.p[1], gw, width + kk(3, 1), ang)])}" fill="${PAL.street}"/>`;
    for (const sg of [-1, 1]) {
      const tw = kk(5.2, 1.6), th = kk(6.4, 2);
      const tx = g.p[0] + ed[0] * sg * (gw / 2 + tw / 2), ty = g.p[1] + ed[1] * sg * (gw / 2 + tw / 2);
      s += `<path d="${ringsToPath([orientedRect(tx, ty, tw, th, ang)])}" fill="${PAL.ink}"/>`;
    }
  }
  return s;
}

// ---------- granjas ----------
function farmsSvg(farms) {
  let fields = '', fences = '';
  for (const f of farms) {
    for (const fl of f.fields) {
      const pid = (fl.tone > 0.5 ? 'fu' : 'fv') + angIdx(fl.angle);
      fields += `<path d="${ringsToPath([fl.ring])}" fill="url(#${pid})"/>`;
    }
    for (const h of f.huertas) fields += `<path d="${ringsToPath([h.ring])}" fill="url(#hu${angIdx(h.angle)})" stroke="${PAL.fence}" stroke-width="${n2(kk(0.4, 0.1))}"/>`;
    fences += ringsToPath([f.fence]);
  }
  return fields + `<path d="${fences}" fill="none" stroke="${PAL.fence}" stroke-width="${n2(kk(0.55, 0.12))}" stroke-dasharray="${n2(kk(2.2))} ${n2(kk(1.1))}"/>`;
}

function plazasSvg(plazas) {
  let s = '';
  for (const p of plazas) {
    const [x, y] = p.c;
    if (p.feature === 'covered') continue;
    if (p.feature === 'well') {
      s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n2(kk(3.2))}" fill="${PAL.water}" stroke="${PAL.ink}" stroke-width="${n2(kk(0.7, 0.15))}"/>`;
    } else {
      const rng = mulberry32(hash2(x, y, 3));
      let d = '';
      for (let k = 0; k < 6; k++) {
        const a = rng() * Math.PI * 2, r = kk(4 + rng() * 9);
        d += ringsToPath([orientedRect(x + Math.cos(a) * r, y + Math.sin(a) * r, kk(3), kk(2.2), rng() * 0.4)]);
      }
      s += `<path d="${d}" fill="${PAL.building}" stroke="${PAL.ink}" stroke-width="${n2(kk(0.45, 0.1))}"/>`;
    }
  }
  return s;
}

const SPECIAL = ['temple', 'hall', 'market', 'barracks', 'keep'];
function buildingsSvg(buildings) {
  // variaciones de color en los tejados (deterministas por edificio) + tinte por barrio
  const v = state.params.roofVar ?? 0.5; // 0 = uniforme, 1 = muy variado
  const tint = (dist) => {
    const B0 = PAL.building;
    if (dist === 1) return [mixC(B0, PAL.keep, 0.45), mixC(PAL.buildingAlt, PAL.keep, 0.45)];
    if (dist === 2) { const g = mixC(PAL.paper, PAL.ink, 0.45); return [mixC(B0, g, 0.35), mixC(PAL.buildingAlt, g, 0.35)]; }
    if (dist === 3) return [mixC(B0, PAL.wood, 0.45), mixC(PAL.buildingAlt, PAL.wood, 0.45)];
    if (dist === 4) return [mixC(B0, PAL.paper, 0.3), mixC(PAL.buildingAlt, PAL.paper, 0.3)];
    return [B0, PAL.buildingAlt];
  };
  const shadeSets = new Map();
  const shadesFor = (dist) => {
    if (shadeSets.has(dist)) return shadeSets.get(dist);
    const [B, A] = tint(dist);
    const set = [
      B, mixC(B, PAL.ink, 0.16 * v), mixC(B, PAL.paper, 0.32 * v), mixC(B, A, Math.min(1, 1.6 * v)),
      mixC(mixC(B, A, Math.min(1, 1.6 * v)), PAL.ink, 0.12 * v), mixC(B, '#B0643C', 0.22 * v),
      mixC(B, '#6E7C8A', 0.18 * v), mixC(mixC(B, PAL.paper, 0.18 * v), '#A08A50', 0.14 * v),
    ];
    shadeSets.set(dist, set);
    return set;
  };
  const groups = new Map();
  const add = (fill, d) => groups.set(fill, (groups.get(fill) || '') + d);
  let special = '', details = '', detailPolys = '', dashed = '', blades = '';
  const specialFill = { temple: mixC(PAL.keep, PAL.paper, 0.18), hall: PAL.keep, market: mixC(PAL.keep, PAL.wood, 0.4), barracks: mixC(PAL.keep, PAL.ink, 0.12), keep: PAL.keep };
  const specialGroups = new Map();
  for (const bl of buildings) {
    const d = ringsToPath([bl.ring]);
    if (SPECIAL.includes(bl.kind)) specialGroups.set(bl.kind, (specialGroups.get(bl.kind) || '') + d);
    else if (bl.kind === 'mill' || bl.kind === 'windmill') add(PAL.wood, d);
    else {
      let h = Math.imul(bl.id ^ 0x5bd1e995, 2654435761) >>> 0;
      h ^= h >>> 15;
      const set = shadesFor(bl.district || 0);
      add(set[(h >>> 0) % set.length], d);
    }
    if (bl.detail) {
      for (const l of bl.detail.lines || []) (bl.kind === 'windmill' ? (blades += lineToPath(l)) : (details += lineToPath(l)));
      if (bl.detail.polys) detailPolys += ringsToPath(bl.detail.polys);
      if (bl.detail.dashed) dashed += ringsToPath(bl.detail.dashed);
    }
  }
  const st = `stroke="${PAL.ink}" stroke-width="${n2(kk(0.55, 0.14))}" stroke-linejoin="round"`;
  let out = '';
  for (const [fill, d] of groups) out += `<path d="${d}" fill="${fill}" ${st}/>`;
  for (const [kind, d] of specialGroups) out += `<path d="${d}" fill="${specialFill[kind]}" stroke="${PAL.ink}" stroke-width="${n2(kk(0.9, 0.22))}" stroke-linejoin="round"/>`;
  if (details) out += `<path d="${details}" stroke="${PAL.ink}" stroke-width="${n2(kk(0.45, 0.12))}" fill="none" stroke-linecap="round"/>`;
  if (dashed) out += `<path d="${dashed}" stroke="${PAL.ink}" stroke-width="${n2(kk(0.4, 0.1))}" fill="none" stroke-dasharray="${n2(kk(1.2))} ${n2(kk(0.9))}"/>`;
  if (detailPolys) out += `<path d="${detailPolys}" fill="${mixC(PAL.keep, PAL.ink, 0.22)}" stroke="${PAL.ink}" stroke-width="${n2(kk(0.5, 0.12))}"/>`;
  if (blades) out += `<path d="${blades}" stroke="${PAL.ink}" stroke-width="${n2(kk(1.1, 0.3))}" fill="none" stroke-linecap="round"/>`;
  return out;
}

// ---------- escala gráfica ----------
function scaleBarSvg() {
  const S = state.params.mapScale || 1;
  const target = (WORLD.w * S) / 7;
  const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
  let Lm = nice[0];
  for (const n of nice) if (Math.abs(n - target) < Math.abs(Lm - target)) Lm = n;
  const L = Lm / S, x = 36, y = WORLD.h - 44, h = 6;
  let s = `<rect x="${x - 14}" y="${y - 22}" width="${n1(L + 60)}" height="${h + 40}" rx="4" fill="${PAL.paper}" fill-opacity="0.85"/>`;
  for (let i = 0; i < 4; i++) s += `<rect x="${n1(x + (L / 4) * i)}" y="${y}" width="${n1(L / 4)}" height="${h}" fill="${i % 2 ? PAL.paper : PAL.ink}" stroke="${PAL.ink}" stroke-width="0.8"/>`;
  const t = (tx, txt, anchor = 'middle') => `<text x="${n1(tx)}" y="${y - 6}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${PAL.ink}" text-anchor="${anchor}">${txt}</text>`;
  const fmt = (m) => m.toLocaleString('es-ES');
  s += t(x, '0') + t(x + L / 2, fmt(Lm / 2)) + t(x + L, fmt(Lm)) + `<text x="${n1(x + L + 8)}" y="${y + h}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" fill="${PAL.ink}">m</text>`;
  return s;
}

const layer = (id, label, content) => (content ? `<g id="${id}" inkscape:groupmode="layer" inkscape:label="${label}">${content}</g>` : '');
export function renderMap({ gen, buildings, showGen }) {
  K = 1 / (state.params.mapScale || 1);
  const water = waterShape(), forest = forestShape(), cliffs = cliffShape();
  const walls = wallShape(), cit = citadelShape();
  const sand = sandShape(), marsh = marshShape();
  const G = showGen && gen;
  let roads = roadShape();
  if (G && gen.portRoadPoly && gen.portRoadPoly.length) roads = union(roads, gen.portRoadPoly);
  let s = defs();
  s += layer('fondo', 'Fondo', `<rect x="0" y="0" width="${WORLD.w}" height="${WORLD.h}" fill="${PAL.paper}"/>`);
  let soil = '';
  if (forest.length) soil += `<path d="${ringsToPath(forest)}" fill="${PAL.forest}" fill-rule="evenodd"/>`;
  if (sand.length) soil += `<path d="${ringsToPath(sand)}" fill="url(#sandp)" fill-rule="evenodd"/>`;
  if (marsh.length) soil += `<path d="${ringsToPath(marsh)}" fill="url(#marshp)" fill-rule="evenodd" stroke="${PAL.reed}" stroke-width="${n2(kk(0.4, 0.12))}" stroke-dasharray="${n2(kk(1.5))} ${n2(kk(1.2))}"/>`;
  // cultivos pintados: en el paso 1 se muestran como campo; al generar, los ocupan granjas
  const crops = cropShape();
  if (!G && crops.length) soil += `<path d="${ringsToPath(crops)}" fill="url(#fu3)" fill-rule="evenodd" stroke="${PAL.fence}" stroke-width="${n2(kk(0.6, 0.15))}" stroke-dasharray="${n2(kk(2.2))} ${n2(kk(1.1))}"/>`;
  s += layer('suelos', 'Suelos', soil);
  let fields = '';
  if (G && gen.lanes && gen.lanes.length) fields += `<path d="${ringsToPath(gen.lanes)}" fill="${PAL.street}" fill-rule="nonzero"/>`;
  if (G) fields += farmsSvg(gen.farms);
  s += layer('campos', 'Campos y sendas', fields);
  let streets = '';
  // contorno de caminos (queda oculto dentro del casco urbano)
  if (roads.length) streets += `<path d="${ringsToPath(roads)}" fill="${PAL.street}" stroke="${PAL.roadEdge}" stroke-width="1.6" fill-rule="nonzero"/>`;
  if (G) {
    streets += `<path d="${ringsToPath(gen.urbanArea)}" fill="${PAL.street}"/>`;
    streets += `<path d="${ringsToPath(gen.blocks.flat())}" fill="${PAL.block}" fill-rule="evenodd"/>`;
    // patio de armas de las ciudadelas: limpio, separado de la ciudad
    if (cit.length) streets += `<path d="${ringsToPath(offset(cit, kk(4, 1.5), 'round'))}" fill="${PAL.street}"/>`;
  }
  s += layer('calles', 'Calles y manzanas', streets);
  s += layer('riscos', 'Riscos', cliffSvg(cliffs));
  let rd = '';
  if (roads.length) rd += `<path d="${ringsToPath(roads)}" fill="${PAL.street}"/>`;
  for (const r of state.edits.roads) rd += `<path d="${lineToPath(r.pts)}" fill="none" stroke="${PAL.street}" stroke-width="${r.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += layer('caminos', 'Caminos', rd);
  if (water.length) s += layer('agua', 'Agua', `<path d="${ringsToPath(water)}" fill="${PAL.water}" stroke="${PAL.waterEdge}" stroke-width="0.9" fill-rule="evenodd" stroke-linejoin="round"/>`);
  s += layer('puentes', 'Puentes, puertos y escaleras', bridgesSvg(water) + portsSvg(state.layers.ports, water) + stairsSvg(cliffs));
  if (G) {
    s += layer('arboles-ciudad', 'Árboles de la ciudad', plazasSvg(gen.plazas) + treesSvg(gen.trees));
    s += layer('edificios', 'Edificios', buildingsSvg(buildings));
  }
  const allR = allRoads();
  s += layer('murallas', 'Murallas', wallSvg(walls, { roads: allR, water }) +
    wallSvg(cit, { roads: allR, width: 3, towerR: 2.6, everyVertex: true, water, center: gen?.center || [WORLD.w / 2, WORLD.h / 2] }));
  s += layer('bosques', 'Bosques', treesSvg(forestTrees(forest)));
  if (state.params.scaleBar !== false) s += layer('escala', 'Escala gráfica', scaleBarSvg());
  return s;
}
void outerRings; void offset;
