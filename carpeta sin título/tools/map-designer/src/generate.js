// Paso 2: generación procedural (Voronoi relajado → manzanas → parcelas / granjas)
import { Delaunay } from 'd3-delaunay';
import { state, WORLD, DENS_RES, GW, GH, densityAt, mulberry32 } from './state.js';
import {
  union, difference, intersection, offset, bufferLine, polygons, outerRings, ringArea, shapeArea,
  centroid, pointInShape, pointInRing, collapseShortEdges, orientedRect, mainAxis, extents, splitByLine,
  distPointPolyline, dist, bbox, bboxOverlap, unionAll, polylineCrossings, pointAt, polylineLength, regularPoly,
} from './geom.js';
import {
  waterShape, forestShape, cliffShape, roadShape, wallShape, wallPaths, wallBarrierShape,
  citadelShape, citadelPaths, citadelBarrierShape, citadelRing, portShape, sandShape, marshShape, cropShape, snapToShore, districtAtGrid,
} from './layers.js';

// Tamaño del mundo en metros reales (el dibujo × escala del mapa)
let BW = WORLD.w, BH = WORLD.h;

// ---------------------------------------------------------------
function buildZones(walls, water, crops = []) {
  const hasWalls = walls.length > 0;
  const urban = new Uint8Array(GW * GH);
  const crop = new Uint8Array(GW * GH);
  const cbb = crops.length ? bbox(crops) : null;
  const dens = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = (gx + 0.5) * DENS_RES, y = (gy + 0.5) * DENS_RES;
    const i = gy * GW + gx;
    if (cbb && x >= cbb.x0 && x <= cbb.x1 && y >= cbb.y0 && y <= cbb.y1 && pointInShape([x, y], crops)) crop[i] = 1;
    let d = state.density[i] / 255;
    if (hasWalls) {
      const inside = pointInShape([x, y], walls);
      if (inside) { d = Math.max(d, 0.78); urban[i] = 1; }
    } else if (d >= 0.4) urban[i] = 1;
    dens[i] = d;
  }
  // transformada de distancia (chamfer) a la zona urbana, en metros
  const INF = 1e9;
  const dt = new Float32Array(GW * GH).fill(INF);
  for (let i = 0; i < dt.length; i++) if (urban[i]) dt[i] = 0;
  const R = DENS_RES, D = DENS_RES * Math.SQRT2;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x; let v = dt[i];
    if (x > 0) v = Math.min(v, dt[i - 1] + R);
    if (y > 0) v = Math.min(v, dt[i - GW] + R);
    if (x > 0 && y > 0) v = Math.min(v, dt[i - GW - 1] + D);
    if (x < GW - 1 && y > 0) v = Math.min(v, dt[i - GW + 1] + D);
    dt[i] = v;
  }
  for (let y = GH - 1; y >= 0; y--) for (let x = GW - 1; x >= 0; x--) {
    const i = y * GW + x; let v = dt[i];
    if (x < GW - 1) v = Math.min(v, dt[i + 1] + R);
    if (y < GH - 1) v = Math.min(v, dt[i + GW] + R);
    if (x < GW - 1 && y < GH - 1) v = Math.min(v, dt[i + GW + 1] + D);
    if (x > 0 && y < GH - 1) v = Math.min(v, dt[i + GW - 1] + D);
    dt[i] = v;
  }
  const at = (arr, x, y) => {
    const gx = Math.max(0, Math.min(GW - 1, Math.floor(x / DENS_RES)));
    const gy = Math.max(0, Math.min(GH - 1, Math.floor(y / DENS_RES)));
    return arr[gy * GW + gx];
  };
  let ux = 0, uy = 0, un = 0;
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) if (urban[gy * GW + gx]) { ux += gx; uy += gy; un++; }
  const center = un ? [(ux / un + 0.5) * DENS_RES, (uy / un + 0.5) * DENS_RES] : [WORLD.w / 2, WORLD.h / 2];
  return {
    center,
    hasWalls,
    isUrban: (x, y) => at(urban, x, y) === 1,
    isCrop: (x, y) => at(crop, x, y) === 1,
    dens: (x, y) => (hasWalls && at(urban, x, y) ? Math.max(0.78, densityAt(x, y)) : densityAt(x, y)),
    distUrban: (x, y) => at(dt, x, y),
  };
}

function zoneOf(Z, x, y, p) {
  if (Z.isUrban(x, y)) return 'urban';
  if (Z.isCrop(x, y)) return 'farm';
  const d = Z.dens(x, y);
  if (d >= 0.06 || Z.distUrban(x, y) <= p.farmRing) return 'farm';
  return 'none';
}

// Semillas en quadtree orientado: produce celdas de aspecto cuadrangular/rectangular
function seeds(Z, p, rng, theta, origin) {
  const B = p.blockSize;
  const rOf = (x, y) => {
    const z = zoneOf(Z, x, y, p);
    if (z === 'urban') return B * (1.2 - 0.45 * Math.min(1, Z.dens(x, y)));
    if (z === 'farm') return B * 2.4;
    return B * 4.2;
  };
  const c = Math.cos(theta), s = Math.sin(theta);
  const toW = (u, v) => [origin[0] + u * c - v * s, origin[1] + u * s + v * c];
  const pts = [];
  const S0 = B * 4.5;
  const ext = Math.hypot(BW, BH);
  const M = S0;
  const rec = (u, v, w, h, depth) => {
    const ctr = toW(u + w / 2, v + h / 2);
    if (ctr[0] < -M || ctr[1] < -M || ctr[0] > BW + M || ctr[1] > BH + M) return;
    const r = rOf(ctr[0], ctr[1]);
    const size = Math.max(w, h);
    if (depth < 8 && size > r * 1.2 && size > B * 0.55) {
      if (w > h * 1.4) { rec(u, v, w / 2, h, depth + 1); rec(u + w / 2, v, w / 2, h, depth + 1); return; }
      if (h > w * 1.4) { rec(u, v, w, h / 2, depth + 1); rec(u, v + h / 2, w, h / 2, depth + 1); return; }
      if (size < r * 1.9 && rng() < 0.45) {
        // dos rectángulos en vez de cuatro cuadrados
        const t = 0.4 + rng() * 0.2;
        if (rng() < 0.5) { rec(u, v, w * t, h, depth + 1); rec(u + w * t, v, w * (1 - t), h, depth + 1); }
        else { rec(u, v, w, h * t, depth + 1); rec(u, v + h * t, w, h * (1 - t), depth + 1); }
        return;
      }
      const tx = 0.42 + rng() * 0.16, ty = 0.42 + rng() * 0.16;
      rec(u, v, w * tx, h * ty, depth + 1); rec(u + w * tx, v, w * (1 - tx), h * ty, depth + 1);
      rec(u, v + h * ty, w * tx, h * (1 - ty), depth + 1); rec(u + w * tx, v + h * ty, w * (1 - tx), h * (1 - ty), depth + 1);
      return;
    }
    const j = 0.13;
    pts.push(toW(u + w * (0.5 + (rng() - 0.5) * 2 * j), v + h * (0.5 + (rng() - 0.5) * 2 * j)));
  };
  for (let u = -ext; u < ext; u += S0) for (let v = -ext; v < ext; v += S0) rec(u, v, S0, S0, 0);
  return pts;
}

function voronoiCells(pts) {
  const del = Delaunay.from(pts);
  const vor = del.voronoi([0, 0, BW, BH]);
  const cells = [];
  for (let i = 0; i < pts.length; i++) {
    const c = vor.cellPolygon(i);
    cells.push(c ? c.slice(0, -1) : null);
  }
  return cells;
}

function relax(pts, iters, Z, p) {
  for (let k = 0; k < iters; k++) {
    const cells = voronoiCells(pts);
    pts = pts.map((q, i) => {
      if (!cells[i]) return q;
      const c = centroid(cells[i]);
      // no movemos semillas "vacías" para no perder el gradiente de densidad
      return zoneOf(Z, q[0], q[1], p) === 'none' ? q : c;
    });
  }
  return pts;
}

const mergeRings = (rings) => {
  const g = union(rings.flatMap(r => offset([r], 0.25)));
  const o = offset(g, -0.25);
  return outerRings(o).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0] || rings[0];
};
export { mergeRings };

function ringsTouch(a, b, tol = 0.6) {
  for (const p of a) if (distPointPolyline(p, b, true) < tol) return true;
  return false;
}

// ----------- parcelas: subdivisión recursiva con frente a la calle -----------
// Si la pieza es más gruesa que dos fondos de parcela se parte "espalda con espalda"
// (paralelo al eje largo); si no, se corta en perpendicular al eje largo.
function lotsForBlock(block, d, p, rng) {
  const target = p.lotSize * (1.5 - 0.5 * d);
  const depthMax = Math.sqrt(target) * (1.15 + 0.55 * d);
  const outer = outerRings(block);
  const out = [];
  const rec = (ring, depth) => {
    const A = Math.abs(ringArea(ring));
    if (depth > 14 || A < target * (0.65 + rng() * 0.7)) { out.push(ring); return; }
    const dir = mainAxis(ring);
    const e = extents(ring, dir);
    const la = e.a1 - e.a0, lb = e.b1 - e.b0;
    const longIsA = la >= lb;
    const shortLen = longIsA ? lb : la;
    let pt, ldir;
    const mid = (lo, hi, t) => lo + (hi - lo) * t;
    if (shortLen > 2 * depthMax * (0.9 + rng() * 0.2)) {
      // corte paralelo al eje largo
      const t = 0.42 + rng() * 0.16;
      if (longIsA) { pt = [dir[0] * mid(e.a0, e.a1, 0.5) + e.n[0] * mid(e.b0, e.b1, t), dir[1] * mid(e.a0, e.a1, 0.5) + e.n[1] * mid(e.b0, e.b1, t)]; ldir = dir; }
      else { pt = [dir[0] * mid(e.a0, e.a1, t) + e.n[0] * mid(e.b0, e.b1, 0.5), dir[1] * mid(e.a0, e.a1, t) + e.n[1] * mid(e.b0, e.b1, 0.5)]; ldir = e.n; }
    } else {
      const t = 0.3 + rng() * 0.4;
      if (longIsA) { pt = [dir[0] * mid(e.a0, e.a1, t) + e.n[0] * mid(e.b0, e.b1, 0.5), dir[1] * mid(e.a0, e.a1, t) + e.n[1] * mid(e.b0, e.b1, 0.5)]; ldir = e.n; }
      else { pt = [dir[0] * mid(e.a0, e.a1, 0.5) + e.n[0] * mid(e.b0, e.b1, t), dir[1] * mid(e.a0, e.a1, 0.5) + e.n[1] * mid(e.b0, e.b1, t)]; ldir = dir; }
    }
    const [s1, s2] = splitByLine(ring, pt, ldir, 0.3);
    const parts = [...outerRings(s1), ...outerRings(s2)];
    if (parts.length < 2) { out.push(ring); return; }
    for (const r of parts) if (Math.abs(ringArea(r)) > 4) rec(r, depth + 1);
  };
  for (const r of outer) rec(r, 0);
  const lots = [], yards = [];
  for (const r0 of out) {
    // apertura morfológica: elimina astillas y picos finos
    for (const r of outerRings(offset(offset([r0], -0.9), 0.9))) {
      if (Math.abs(ringArea(r)) < target * 0.2) continue;
      if (outer.some(o => ringsTouch(r, o, 1.2))) lots.push(r); else yards.push(r);
    }
  }
  return { lots, yards, target };
}

// subdivisión recursiva (campos de cultivo)
function subdivide(ring, target, rng, depth = 0, out = []) {
  const A = Math.abs(ringArea(ring));
  if (A < target * (0.7 + rng() * 0.7) || depth > 8) { out.push(ring); return out; }
  const dir = mainAxis(ring);
  const e = extents(ring, dir);
  const la = e.a1 - e.a0, lb = e.b1 - e.b0;
  let pt, ldir;
  if (la >= lb) {
    const u = e.a0 + la * (0.35 + rng() * 0.3), v = (e.b0 + e.b1) / 2;
    pt = [dir[0] * u + e.n[0] * v, dir[1] * u + e.n[1] * v]; ldir = e.n;
  } else {
    const u = (e.a0 + e.a1) / 2, v = e.b0 + lb * (0.35 + rng() * 0.3);
    pt = [dir[0] * u + e.n[0] * v, dir[1] * u + e.n[1] * v]; ldir = dir;
  }
  const [s1, s2] = splitByLine(ring, pt, ldir, 0.6);
  for (const r of [...outerRings(s1), ...outerRings(s2)]) if (Math.abs(ringArea(r)) > 20) subdivide(r, target, rng, depth + 1, out);
  return out;
}

// ---------------------------------------------------------------
export function generate() {
  const p = state.params;
  const S = p.mapScale || 1;
  const gen = generateMeters(p, S);
  gen.scale = S;
  return S === 1 ? gen : scaleGen(gen, 1 / S);
}

const scaleDetail = (d, k) => ({
  lines: (d.lines || []).map(l => l.map(q => [q[0] * k, q[1] * k])),
  polys: scRings(d.polys || [], k),
  dashed: scRings(d.dashed || [], k),
});
// Escala geometría [x,y] por un factor
const scRings = (rings, k) => rings.map(r => r.map(q => [q[0] * k, q[1] * k]));
function scaleGen(g, k) {
  return {
    ...g,
    urbanArea: scRings(g.urbanArea, k),
    blocks: g.blocks.map(b => scRings(b, k)),
    lots: g.lots.map(l => ({ ...l, ring: scRings([l.ring], k)[0], detail: l.detail && scaleDetail(l.detail, k) })),
    lanes: scRings(g.lanes || [], k),
    portRoadPoly: scRings(g.portRoadPoly || [], k),
    trees: g.trees.map(([x, y, r]) => [x * k, y * k, r * k]),
    plazas: g.plazas.map(pl => ({ ...pl, rings: scRings(pl.rings, k), c: [pl.c[0] * k, pl.c[1] * k] })),
    farms: g.farms.map(f => ({
      fence: scRings([f.fence], k)[0],
      fields: f.fields.map(x => ({ ...x, ring: scRings([x.ring], k)[0] })),
      huertas: f.huertas.map(x => ({ ...x, ring: scRings([x.ring], k)[0] })),
    })),
    center: [g.center[0] * k, g.center[1] * k],
  };
}

// Toda la generación trabaja en metros reales: el terreno dibujado se amplía por S
function generateMeters(p, S) {
  BW = WORLD.w * S; BH = WORLD.h * S;
  const rng = mulberry32(p.seed);
  const water = scRings(waterShape(), S), forest = scRings(forestShape(), S), cliffs = scRings(cliffShape(), S);
  const roads = scRings(roadShape(), S), walls = scRings(wallShape(), S), citadels = scRings(citadelShape(), S);
  const wallBarriers = scRings(wallBarrierShape(state.layers, 4.5 / S), S);
  const citBarriers = scRings(citadelBarrierShape(state.layers, 8 / S), S);
  const ports = scRings(portShape(state.layers, 1 / S), S);
  const sand = scRings(sandShape(), S), marsh = scRings(marshShape(), S);
  const Z0 = buildZones(wallShape(), water, cropShape());
  const Z = {
    hasWalls: Z0.hasWalls,
    center: [Z0.center[0] * S, Z0.center[1] * S],
    isUrban: (x, y) => Z0.isUrban(x / S, y / S),
    isCrop: (x, y) => Z0.isCrop(x / S, y / S),
    dens: (x, y) => Z0.dens(x / S, y / S),
    distUrban: (x, y) => Z0.distUrban(x / S, y / S) * S,
  };

  // orientación: camino principal más cercano al centro urbano
  const uc = Z.center;
  let theta = rng() * Math.PI, bestD = Infinity;
  for (const r of state.layers.roads) {
    if (!r.pts || r.pts.length < 2) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = [r.pts[i][0] * S, r.pts[i][1] * S], b = [r.pts[i + 1][0] * S, r.pts[i + 1][1] * S];
      const d = distPointPolyline(uc, [a, b]);
      if (d < bestD) { bestD = d; theta = Math.atan2(b[1] - a[1], b[0] - a[0]); }
    }
  }
  let pts = seeds(Z, p, rng, theta, uc);
  if (pts.length < 4) return emptyGen();
  const cells = voronoiCells(pts);

  // obstáculos
  // borde del risco + cantil (10 m hacia la parte baja): no se edifica
  const cliffEdges = cliffs.length ? difference(offset(cliffs, 12, 'round'), offset(cliffs, -3)) : [];
  const obstUrban = unionAll([offset(water, 1.5), offset(roads, 1), forest, cliffEdges, offset(citadels, 10), citBarriers, wallBarriers, offset(ports, 4), sand, marsh]);
  const obstFarm = unionAll([offset(water, 3), offset(roads, 3), forest, cliffEdges, offset(citadels, 8), citBarriers, wallBarriers, offset(ports, 6), sand, marsh]);
  const obsU = polygons(obstUrban).map(pg => ({ rings: [pg.outer, ...pg.holes], bb: bbox([pg.outer]) }));
  const obsF = polygons(obstFarm).map(pg => ({ rings: [pg.outer, ...pg.holes], bb: bbox([pg.outer]) }));
  const cut = (shape, obs) => {
    const bb = bbox(shape);
    const rel = obs.filter(o => bboxOverlap(o.bb, bb, 1)).flatMap(o => o.rings);
    return rel.length ? difference(shape, rel) : shape;
  };
  const wallIn = Z.hasWalls ? difference(offset(walls, -4.5), wallBarriers) : null;
  const wallOut = Z.hasWalls ? union(offset(walls, 6), wallBarriers) : null;
  const wbAll = wallBarriers.length ? bbox(wallBarriers) : (Z.hasWalls ? bbox(walls) : null);

  const urbanPieces = []; // {shape, d}
  const farmPieces = [];
  for (let i = 0; i < pts.length; i++) {
    const c = cells[i];
    if (!c) continue;
    const ring = collapseShortEdges(c, p.blockSize * 0.2);
    const [sx, sy] = pts[i];
    const zone = zoneOf(Z, sx, sy, p);
    if (Z.hasWalls && wbAll) {
      const cb = bbox([ring]);
      const touchesWall = bboxOverlap(cb, wbAll, 10);
      if (touchesWall) {
        const inPart = intersection([ring], wallIn);
        for (const pg of polygons(inPart)) {
          const sh = [pg.outer, ...pg.holes];
          urbanPieces.push({ shape: sh, d: Z.dens(...centroid(pg.outer)) });
        }
        const outPart = difference([ring], wallOut);
        if (outPart.length && zone !== 'none') {
          const cc = centroid(outerRings(outPart)[0] || ring);
          if (zoneOf(Z, cc[0], cc[1], p) !== 'none' || zone === 'urban') farmPieces.push({ shape: outPart });
        }
        continue;
      }
    }
    if (zone === 'urban') urbanPieces.push({ shape: [ring], d: Z.dens(sx, sy) });
    else if (zone === 'farm') {
      // densidad baja → probabilidad de granja
      farmPieces.push({ shape: [ring] });
    }
  }

  // ---- zona urbana ----
  const blocks = [];
  let urbanArea = [];
  const streetHalf = Math.min(p.streetWidth, 1 + p.blockSize * 0.1) / 2;
  for (const up of urbanPieces) {
    urbanArea.push(difference(up.shape, water));
    const sh = cut(up.shape, obsU);
    if (!sh.length) continue;
    const blk = offset(sh, -streetHalf);
    for (const pg of polygons(blk)) {
      const A = Math.abs(ringArea(pg.outer));
      if (A < p.lotSize * 0.7) continue;
      const c = centroid(pg.outer);
      blocks.push({ rings: [pg.outer, ...pg.holes], d: up.d, area: A, c, district: districtAtGrid(c[0] / S, c[1] / S) });
    }
  }
  urbanArea = unionAll(urbanArea.map(s => offset(s, 0.3)));

  // caminos a los puertos: del muelle al camino o calle más cercanos
  const portRoads = [];
  if (p.lanes !== false) {
    const targets = [...roads, ...urbanArea];
    for (const pt0 of state.layers.ports || []) {
      const d = [Math.cos(pt0.ang), Math.sin(pt0.ang)];
      const start = [pt0.x * S - d[0] * 6, pt0.y * S - d[1] * 6];
      if (urbanArea.length && pointInShape(start, urbanArea)) continue;
      const tg = snapToShore(start, targets, 900);
      if (!tg || Math.hypot(tg.x - start[0], tg.y - start[1]) < 4) continue;
      const end = [tg.x, tg.y];
      // pequeño quiebro para que no parezca una regla
      const mid = [(start[0] + end[0]) / 2 + (rng() - 0.5) * 12, (start[1] + end[1]) / 2 + (rng() - 0.5) * 12];
      portRoads.push(chaikinOpen([[pt0.x * S, pt0.y * S], start, mid, end]));
    }
  }
  let portRoadPoly = [];
  for (const r of portRoads) portRoadPoly = union(portRoadPoly, bufferLine(r, 2.4));
  if (portRoadPoly.length) {
    const cutter = offset(portRoadPoly, 1.5);
    const cb = bbox(cutter);
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (!bboxOverlap(bbox(b.rings), cb)) continue;
      const rest = polygons(difference(b.rings, cutter));
      blocks.splice(i, 1);
      for (const pg of rest) {
        const A = Math.abs(ringArea(pg.outer));
        if (A >= p.lotSize * 0.7) blocks.push({ ...b, rings: [pg.outer, ...pg.holes], area: A, c: centroid(pg.outer) });
      }
    }
  }

  // plazas: manzanas cercanas al centro con algo de azar
  let cx = 0, cy = 0, tw = 0;
  for (const b of blocks) { cx += b.c[0] * b.area; cy += b.c[1] * b.area; tw += b.area; }
  cx /= tw || 1; cy /= tw || 1;
  const plazas = [];
  if (p.plazas > 0 && blocks.length > 6) {
    const cand = blocks
      .map((b, i) => ({ i, s: Math.hypot(b.c[0] - cx, b.c[1] - cy) * (0.6 + rng() * 0.9) }))
      .sort((a, b) => a.s - b.s);
    const chosen = [];
    for (const c of cand) {
      if (chosen.length >= p.plazas) break;
      const b = blocks[c.i];
      if (b.area > p.blockSize * p.blockSize * 2.2) continue;
      if (chosen.some(j => dist(blocks[j].c, b.c) < p.blockSize * 2.5)) continue;
      chosen.push(c.i);
    }
    for (const j of chosen) {
      blocks[j].plaza = true;
      plazas.push({ rings: offset(blocks[j].rings, streetHalf + 0.3), c: centroid(blocks[j].rings[0]), feature: rng() < 0.5 ? 'well' : 'market' });
    }
  }

  const lots = [];
  const trees = [];
  let nextId = 1;
  const courtyards = [];
  for (const b of blocks) {
    if (b.plaza) continue;
    const DX = DISTRICT_FX[b.district] || DISTRICT_FX[0];
    const { lots: lr, yards } = lotsForBlock(b.rings, b.d, { ...p, lotSize: p.lotSize * DX.lot }, rng);
    const core = yards;
    courtyards.push(core);
    // fusiones aleatorias (edificios mayores, formas en L)
    const used = new Set();
    const final = [];
    for (let i = 0; i < lr.length; i++) {
      if (used.has(i)) continue;
      let r = lr[i];
      if (rng() < DX.merge) {
        for (let j = i + 1; j < lr.length; j++) {
          if (used.has(j)) continue;
          if (ringsTouch(lr[i], lr[j])) { r = mergeRings([r, lr[j]]); used.add(j); break; }
        }
      }
      final.push(r);
    }
    for (const r of final) {
      const A = Math.abs(ringArea(r));
      // densidad baja → huecos (jardines) y casas exentas
      if (rng() < (1 - b.d) * (b.d > 0.6 ? 0.3 : 0.55) * DX.drop + DX.garden) {
        if (rng() < p.trees * DX.trees) { const cc = centroid(r); trees.push([cc[0], cc[1], 2.2 + rng() * 1.6]); }
        continue;
      }
      let ring = r;
      if (b.d < 0.55) {
        const sh = offset([r], -(0.8 + (0.55 - b.d) * 4));
        const o = outerRings(sh)[0];
        if (!o || Math.abs(ringArea(o)) < 18) continue;
        ring = o;
      }
      lots.push({ id: nextId++, ring, kind: 'house', d: b.d, district: b.district, block: b, area: Math.abs(ringArea(ring)) || A });
    }
    // árboles en patios
    for (const pg of core.map(r => ({ outer: r, holes: [] }))) {
      const A = Math.abs(ringArea(pg.outer));
      if (A < 30) continue;
      const bb = bbox([pg.outer]);
      const n = Math.round((A / 90) * p.trees * DX.trees);
      for (let k = 0; k < n * 3 && n > 0; k++) {
        const x = bb.x0 + rng() * (bb.x1 - bb.x0), y = bb.y0 + rng() * (bb.y1 - bb.y0);
        if (!pointInRing([x, y], pg.outer) || pg.holes.some(h => pointInRing([x, y], h))) continue;
        const r = 2 + rng() * 1.8;
        if (distPointPolyline([x, y], pg.outer, true) < r * 0.8) continue;
        if (trees.some(t => Math.hypot(t[0] - x, t[1] - y) < (t[2] + r) * 0.8)) continue;
        trees.push([x, y, r]);
        if (trees.length > 6000) break;
      }
    }
  }

  // ciudadelas: torre del homenaje
  for (const cp of citadelPaths()) {
    if (cp.open) continue;
    const ringM = scRings([cp.pts], S)[0];
    if (!ringM || ringM.length < 3) continue;
    const [kx, ky] = centroid(ringM);
    const kr = Math.sqrt(Math.abs(ringArea(ringM)) / Math.PI);
    if (kr < 8) continue;
    const ang = Math.atan2(cy - ky, cx - kx);
    const keepRect = orientedRect(kx, ky, Math.min(kr * 0.75, 42), Math.min(kr * 0.55, 30), ang);
    const inner4 = offset([ringM], -4);
    const keepRing = outerRings(inner4.length ? intersection([keepRect], inner4) : [keepRect])[0] || keepRect;
    lots.push({ id: nextId++, ring: keepRing, kind: 'keep', d: 1, area: Math.abs(ringArea(keepRing)) });
    // pequeñas dependencias interiores
    const inner = offset([ringM], -6);
    const ir = outerRings(inner)[0];
    if (ir && rng() < 0.9) {
      const a2 = ang + Math.PI * (0.7 + rng() * 0.6);
      const px = kx + Math.cos(a2) * kr * 0.62, py = ky + Math.sin(a2) * kr * 0.62;
      const rr = orientedRect(px, py, Math.min(kr * 0.45, 24), 7, a2 + Math.PI / 2);
      const keepZone = offset([keepRing], 3);
      const clip = outerRings(difference(intersection([rr], [ir]), keepZone)).sort((x, y) => Math.abs(ringArea(y)) - Math.abs(ringArea(x)))[0];
      if (clip && Math.abs(ringArea(clip)) > 20) lots.push({ id: nextId++, ring: clip, kind: 'house', d: 1, area: Math.abs(ringArea(clip)) });
    }
  }

  // ---- edificios singulares ----
  const ctr = { next: nextId };
  const mills = placeSpecials({ p, rng, blocks, lots, plazas, cx, cy, S, water, walls, citadels, Z, ctr });
  nextId = ctr.next;

  // ---- granjas ----
  const farms = [];
  const laneSrc = [];
  const millZone = mills.length ? offset(mills, 4) : [];
  const cutF = (shape) => {
    let r = cut(shape, obsF);
    if (portRoadPoly.length) r = difference(r, offset(portRoadPoly, 2));
    if (millZone.length) r = difference(r, millZone);
    return r;
  };
  for (const fp of farmPieces) {
    const sh = cutF(fp.shape);
    if (p.lanes !== false) for (const r of outerRings(sh)) if (Math.abs(ringArea(r)) > 700) laneSrc.push(r);
    for (const pg of polygons(offset(sh, -3.2))) {
      const fence = pg.outer;
      const A = Math.abs(ringArea(fence));
      if (A < 700) continue;
      const fc = centroid(fence);
      const farm = { fence, fields: [], huertas: [] };
      // ¿granja habitada? (más probable cerca del pueblo)
      const near = Math.max(0, 1 - Z.distUrban(fc[0], fc[1]) / (p.farmRing + 60));
      const inhabited = A > 1500 && rng() < 0.45 + near * 0.4;
      let reserved = [];
      if (inhabited) {
        // arista más cercana al centro urbano
        let best = null, bd = Infinity;
        const s = Math.sign(ringArea(fence));
        for (let i = 0; i < fence.length; i++) {
          const a = fence[i], b = fence[(i + 1) % fence.length];
          const L = dist(a, b);
          if (L < 22) continue;
          const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const dd = Math.hypot(m[0] - cx, m[1] - cy);
          if (dd < bd) { bd = dd; best = { a, b, L, m }; }
        }
        if (best) {
          const dir = [(best.b[0] - best.a[0]) / best.L, (best.b[1] - best.a[1]) / best.L];
          const nin = s > 0 ? [-dir[1], dir[0]] : [dir[1], -dir[0]];
          const ang = Math.atan2(dir[1], dir[0]);
          const w = 10 + rng() * 5, h = 6.5 + rng() * 2;
          const off = (rng() - 0.5) * Math.max(0, best.L - w - 20) * 0.6;
          const hx = best.m[0] + dir[0] * off + nin[0] * (h / 2 + 2.5), hy = best.m[1] + dir[1] * off + nin[1] * (h / 2 + 2.5);
          const house = orientedRect(hx, hy, w, h, ang);
          const parts = [house];
          if (rng() < 0.6) {
            const bw = 7 + rng() * 5, bh = 6 + rng() * 3;
            const sgn = rng() < 0.5 ? -1 : 1;
            const bx = hx + dir[0] * sgn * (w / 2 + bw / 2 + 3) + nin[0] * (bh - h) / 2, by = hy + dir[1] * sgn * (w / 2 + bw / 2 + 3) + nin[1] * (bh - h) / 2;
            parts.push(orientedRect(bx, by, bw, bh, ang));
          }
          for (const r of parts) {
            const clip = outerRings(intersection([r], [fence]))[0];
            if (clip && Math.abs(ringArea(clip)) > 25) lots.push({ id: nextId++, ring: clip, kind: 'farm', d: 0.2, area: Math.abs(ringArea(clip)) });
          }
          // huerta detrás de la casa
          const hw = 14 + rng() * 8, hh = 10 + rng() * 6;
          const gx = hx + nin[0] * (h / 2 + hh / 2 + 3), gy = hy + nin[1] * (h / 2 + hh / 2 + 3);
          const hu = outerRings(intersection([orientedRect(gx, gy, hw, hh, ang)], [fence]))[0];
          if (hu) { farm.huertas.push({ ring: hu, angle: ang }); parts.push(hu); }
          reserved = parts;
          if (rng() < p.trees) trees.push([hx - dir[0] * (w / 2 + 5), hy - dir[1] * (w / 2 + 5), 3 + rng() * 1.5]);
        }
      }
      const fieldArea = reserved.length ? difference([fence], offset(union(reserved), 2.5)) : [fence];
      const tgt = 1100 + rng() * 1600;
      for (const fpg of polygons(fieldArea)) {
        for (const r of subdivide(fpg.outer, tgt, rng)) {
          const ax = mainAxis(r);
          let ang = Math.atan2(ax[1], ax[0]);
          if (rng() < 0.5) ang += Math.PI / 2;
          const shr = outerRings(offset([r], -0.6))[0];
          if (shr && Math.abs(ringArea(shr)) > 60) farm.fields.push({ ring: shr, angle: ang, tone: rng() });
        }
      }
      farms.push(farm);
    }
  }

  // molinos de viento en el campo
  if ((p.specials || {}).mills !== false) {
    const big = farms.filter(f => Math.abs(ringArea(f.fence)) > 3500);
    const placed = [];
    for (let tries = 0; tries < 12 && placed.length < 2 && big.length; tries++) {
      const f = big[Math.floor(rng() * big.length)];
      const fc = centroid(f.fence), vtx = f.fence[Math.floor(rng() * f.fence.length)];
      const c = [fc[0] + (vtx[0] - fc[0]) * 0.35, fc[1] + (vtx[1] - fc[1]) * 0.35];
      if (!pointInRing(c, f.fence) || placed.some(q => dist(q, c) < 220)) continue;
      const body = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; body.push([c[0] + Math.cos(a) * 3.6, c[1] + Math.sin(a) * 3.6]); }
      const a0 = rng() * Math.PI / 2, blades = [];
      for (let k = 0; k < 4; k++) { const a = a0 + (k * Math.PI) / 2; blades.push([c, [c[0] + Math.cos(a) * 10, c[1] + Math.sin(a) * 10]]); }
      const zone = [regularPoly(c[0], c[1], 7, 10)];
      f.fields = f.fields.flatMap(fl => outerRings(difference([fl.ring], zone)).filter(r => Math.abs(ringArea(r)) > 40).map(r => ({ ...fl, ring: r })));
      lots.push({ id: nextId++, ring: body, kind: 'windmill', d: 0.3, area: 40, detail: { lines: blades } });
      placed.push(c);
    }
  }

  // sendas entre granjas: siguen los lindes de las parcelas agrícolas
  let lanes = [];
  if (laneSrc.length) {
    lanes = union(laneSrc.flatMap(r => bufferLine(r, 1.5, true)));
    lanes = difference(lanes, offset(water, 0.5));
  }
  for (const l of lots) delete l.block;
  return { urbanArea, blocks: blocks.filter(b => !b.plaza).map(b => b.rings), lots, trees, plazas, farms, lanes, portRoadPoly, center: [cx, cy] };
}

function emptyGen() {
  return { urbanArea: [], blocks: [], lots: [], trees: [], plazas: [], farms: [], lanes: [], portRoadPoly: [], center: [BW / 2, BH / 2] };
}

// ----- Aplicación de ediciones del paso 3 -----
export function applyEdits(gen, edits) {
  if (!gen) return [];
  const S2 = (gen.scale || 1) ** 2; // unidades de dibujo² → m²
  const byId = new Map(gen.lots.map(l => [l.id, l]));
  // union-find de fusiones
  const parent = new Map();
  const find = (x) => { while (parent.has(x) && parent.get(x) !== x) x = parent.get(x); return x; };
  for (const [a, b] of edits.merges) {
    if (!byId.has(a) || !byId.has(b)) continue;
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }
  const groups = new Map();
  for (const l of gen.lots) {
    const r = find(l.id);
    (groups.get(r) || groups.set(r, []).get(r)).push(l);
  }
  const deleted = new Set(edits.deleted);
  let out = [];
  for (const [root, members] of groups) {
    if (members.some(m => deleted.has(m.id))) continue;
    if (members.length === 1) out.push({ ...members[0], ids: [members[0].id] });
    else {
      const ring = mergeRings(members.map(m => m.ring));
      const kind = members.some(m => m.kind === 'keep') ? 'keep' : members[0].kind;
      out.push({ id: root, ids: members.map(m => m.id), ring, kind, d: members[0].d, area: Math.abs(ringArea(ring)) * S2 });
    }
  }
  // caminos dibujados por el usuario recortan edificios
  if (edits.roads.length) {
    let rs = [];
    for (const r of edits.roads) rs = union(rs, bufferLine(r.pts, r.width / 2 + 0.6));
    const rb = bbox(rs);
    const res = [];
    for (const b of out) {
      const bb = bbox([b.ring]);
      if (!bboxOverlap(bb, rb)) { res.push(b); continue; }
      const pieces = outerRings(difference([b.ring], rs)).filter(r => Math.abs(ringArea(r)) * S2 > 10);
      pieces.forEach((r, k) => res.push({ ...b, ring: r, area: Math.abs(ringArea(r)) * S2, sub: k }));
    }
    out = res;
  }
  return out;
}

export { shapeArea };

function chaikinOpen(pts) {
  let p = pts;
  for (let k = 0; k < 2; k++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

// Efecto de cada tipo de barrio sobre las parcelas
//  lot: multiplica la superficie de parcela · merge: prob. de fusionar parcelas
//  drop/garden: huecos y jardines · trees: árboles
const DISTRICT_FX = {
  0: { lot: 1, merge: 0.12, drop: 1, garden: 0, trees: 1 },
  1: { lot: 1.9, merge: 0.3, drop: 0.6, garden: 0.12, trees: 2.2 },   // rico
  2: { lot: 0.6, merge: 0.03, drop: 0.35, garden: 0, trees: 0.2 },    // pobre
  3: { lot: 1.45, merge: 0.28, drop: 0.3, garden: 0, trees: 0.5 },    // mercantil
  4: { lot: 1.3, merge: 0.15, drop: 1, garden: 0.06, trees: 1.6 },    // religioso
};

// ----------------- Edificios singulares -----------------
function blockAxes(ring) {
  const dir = mainAxis(ring);
  const e = extents(ring, dir);
  const la = e.a1 - e.a0, lb = e.b1 - e.b0;
  return la >= lb ? { u: dir, v: e.n, long: la, short: lb } : { u: e.n, v: dir, long: lb, short: la };
}
const P = (c, u, v, a, b) => [c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b];
const rectUV = (c, u, v, L, W) => [P(c, u, v, -L / 2, -W / 2), P(c, u, v, L / 2, -W / 2), P(c, u, v, L / 2, W / 2), P(c, u, v, -L / 2, W / 2)];

// Coloca `shape` en la manzana: quita las parcelas que choquen. Devuelve el anillo ajustado o null.
function claim(lots, shapeRings, inside, clearance) {
  const fit = outerRings(intersection(shapeRings, inside)).sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))[0];
  if (!fit) return null;
  const want = shapeArea(shapeRings);
  if (Math.abs(ringArea(fit)) < want * 0.75) return null;
  const zone = offset([fit], clearance);
  const zb = bbox(zone);
  for (let i = lots.length - 1; i >= 0; i--) {
    const l = lots[i];
    if (l.kind !== 'house') continue;
    if (!bboxOverlap(bbox([l.ring]), zb)) continue;
    if (intersection([l.ring], zone).length) lots.splice(i, 1);
  }
  return fit;
}

function placeSpecials({ p, rng, blocks, lots, plazas, cx, cy, S, water, walls, citadels, Z, ctr }) {
  const sp = p.specials || {};
  const free = blocks.filter(b => !b.plaza);
  const take = (b) => { b.used = true; };
  const mills = [];

  // --- templo / catedral: planta de cruz con ábside ---
  if (sp.temple !== false && free.length > 3) {
    const cand = free.filter(b => b.area > 700)
      .map(b => ({ b, s: Math.hypot(b.c[0] - cx, b.c[1] - cy) * (b.district === 4 ? 0.25 : 1) * (0.7 + rng() * 0.6) }))
      .sort((a, b) => a.s - b.s);
    for (const { b } of cand.slice(0, 6)) {
      const ring = b.rings[0];
      const { u, v, long, short } = blockAxes(ring);
      const inside = offset(b.rings, -1.5);
      let done = false;
      for (const k of [1, 0.85, 0.7]) {
        const L = Math.min(long * 0.78, 72) * k, W = Math.max(6, Math.min(short * 0.3, 17) * k);
        if (L < 18) break;
        const c = b.c;
        const nave = rectUV(c, u, v, L, W);
        const tc = P(c, u, v, L * 0.16, 0);
        const transept = rectUV(tc, u, v, W * 0.95, Math.min(short * 0.72, W * 2.7));
        const ac = P(c, u, v, L / 2, 0), apse = [];
        for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; apse.push(P(ac, u, v, Math.cos(a) * W * 0.5, Math.sin(a) * W * 0.5)); }
        const cross = union([nave, transept, apse]);
        const fit = claim(lots, cross, inside, 3);
        if (!fit) continue;
        const front = P(c, u, v, -L / 2 + W * 0.45, 0);
        lots.push({
          id: ctr.next++, ring: fit, kind: 'temple', d: 1, area: Math.abs(ringArea(fit)),
          detail: { lines: [[P(c, u, v, -L / 2, 0), P(c, u, v, L / 2, 0)], [P(tc, u, v, 0, -Math.min(short * 0.72, W * 2.7) / 2), P(tc, u, v, 0, Math.min(short * 0.72, W * 2.7) / 2)]], polys: [rectUV(front, u, v, W * 0.8, W * 0.8)] },
        });
        take(b); done = true; break;
      }
      if (done) break;
    }
  }

  // --- ayuntamiento: junto a la plaza principal ---
  if (sp.hall !== false) {
    const ref = plazas[0] ? plazas[0].c : [cx, cy];
    const cand = free.filter(b => !b.used && b.area > 500).sort((a, b) => dist(a.c, ref) - dist(b.c, ref));
    for (const b of cand.slice(0, 5)) {
      const { u, v, long, short } = blockAxes(b.rings[0]);
      const L = Math.min(long * 0.62, 36), W = Math.min(short * 0.55, 18);
      if (L < 14 || W < 8) continue;
      const fit = claim(lots, [rectUV(b.c, u, v, L, W)], offset(b.rings, -1.5), 2.5);
      if (!fit) continue;
      const tw = P(b.c, u, v, -L / 2 + W * 0.3, 0);
      lots.push({ id: ctr.next++, ring: fit, kind: 'hall', d: 1, area: Math.abs(ringArea(fit)),
        detail: { lines: [[P(b.c, u, v, -L / 2, 0), P(b.c, u, v, L / 2, 0)]], polys: [rectUV(tw, u, v, W * 0.42, W * 0.42)] } });
      take(b); break;
    }
  }

  // --- mercado cubierto: en una plaza ---
  if (sp.market !== false && plazas.length) {
    const pl = plazas.find(x => x.feature === 'market') || plazas[plazas.length - 1];
    const ring = outerRings(pl.rings)[0];
    if (ring) {
      const { u, v, long, short } = blockAxes(ring);
      const L = Math.min(long * 0.5, 32), W = Math.min(short * 0.42, 15);
      if (L > 10 && W > 6) {
        const c = centroid(ring);
        const fit = outerRings(intersection([rectUV(c, u, v, L, W)], offset([ring], -4)))[0];
        if (fit && Math.abs(ringArea(fit)) > L * W * 0.7) {
          pl.feature = 'covered';
          lots.push({ id: ctr.next++, ring: fit, kind: 'market', d: 1, area: Math.abs(ringArea(fit)),
            detail: { dashed: outerRings(offset([fit], -1.4)), lines: [[P(c, u, v, -L / 2, 0), P(c, u, v, L / 2, 0)]] } });
        }
      }
    }
  }

  // --- cuarteles: junto a una puerta de la muralla o a la ciudadela ---
  if (sp.barracks !== false) {
    let refs = [];
    const wPaths = wallPaths();
    if (wPaths.length) {
      for (const r of state.layers.roads) {
        if (!r.pts || r.pts.length < 2 || r.kind === 'poly' || r.kind === 'paint') continue;
        const rPts = r.pts.map(q => [q[0] * S, q[1] * S]);
        for (const w of wPaths) {
          refs.push(...polylineCrossings(rPts, [w.pts.map(q => [q[0] * S, q[1] * S])], !w.open).map(c => c.p));
        }
      }
      if (!refs.length) refs = wPaths[0].pts.map(q => [q[0] * S, q[1] * S]).filter((_, i) => i % 3 === 0);
    } else if (citadels.length) refs = [centroid(citadels[0])];
    if (refs.length) {
      const cand = free.filter(b => !b.used && b.area > 450)
        .map(b => ({ b, d: Math.min(...refs.map(r => dist(r, b.c))) })).sort((a, b) => a.d - b.d);
      for (const { b } of cand.slice(0, 6)) {
        const { u, v, long, short } = blockAxes(b.rings[0]);
        const L = Math.min(long * 0.8, 46), W = Math.min(short * 0.38, 10);
        if (L < 16 || W < 6) continue;
        const fit = claim(lots, [rectUV(b.c, u, v, L, W)], offset(b.rings, -1.5), 2.5);
        if (!fit) continue;
        lots.push({ id: ctr.next++, ring: fit, kind: 'barracks', d: 1, area: Math.abs(ringArea(fit)),
          detail: { lines: [[P(b.c, u, v, -L / 2, 0), P(b.c, u, v, L / 2, 0)]] } });
        take(b); break;
      }
    }
  }

  // --- molinos: de agua en los ríos y de viento en el campo ---
  if (sp.mills !== false) {
    for (const rv of state.layers.rivers) {
      if (!rv.pts || rv.pts.length < 2 || rv.kind === 'poly' || rv.kind === 'paint') continue;
      const rw = rv.width || 22;
      const pts = rv.pts.map(q => [q[0] * S, q[1] * S]);
      const len = polylineLength(pts);
      let placed = 0, last = -1e9;
      const start = rng() * 60;
      for (let s0 = start; s0 < len && placed < 2; s0 += 18) {
        const { p: q, dir } = pointAt(pts, s0);
        const du = Z.distUrban(q[0], q[1]);
        if (du < 30 || du > p.farmRing + 160 || s0 - last < 220 || rng() > 0.25) continue;
        const side = rng() < 0.5 ? 1 : -1;
        const probe = [q[0] - dir[1] * side * (rw * S / 2 + 6), q[1] + dir[0] * side * (rw * S / 2 + 6)];
        if (pointInShape(probe, water)) continue;
        const sn = snapToShore(probe, water, 40);
        if (!sn) continue;
        const d = [Math.cos(sn.ang), Math.sin(sn.ang)], t = [-d[1], d[0]];
        const hc = [sn.x - d[0] * 5, sn.y - d[1] * 5];
        const house = rectUV(hc, t, d, 11, 8);
        const wc = [sn.x + d[0] * 1.6, sn.y + d[1] * 1.6];
        const wheel = rectUV(wc, t, d, 6, 1.8);
        const paddles = [];
        for (let i = -2; i <= 2; i++) paddles.push([P(wc, t, d, i * 1.2, -1.4), P(wc, t, d, i * 1.2, 1.4)]);
        lots.push({ id: ctr.next++, ring: house, kind: 'mill', d: 0.3, area: 88, detail: { polys: [wheel], lines: paddles } });
        mills.push(house);
        placed++; last = s0;
      }
    }
  }
  void citadelRing;
  return mills;
}
