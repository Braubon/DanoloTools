// Convierte los trazos del usuario de cada capa en una única geometría fusionada.
import { state, hash2, mulberry32, GW, GH, DENS_RES } from './state.js';
import { bufferLine, union, difference, normalize, regularPoly, offset, bbox, pointInShape } from './geom.js';

const cache = new Map();
function memo(key, deps, fn) {
  const k = JSON.stringify(deps);
  const c = cache.get(key);
  if (c && c.k === k) return c.v;
  const v = fn();
  cache.set(key, { k, v });
  return v;
}

export function citadelRing(c) {
  const rng = mulberry32(hash2(c.x, c.y, 7));
  const n = 7 + Math.floor(rng() * 3);
  return regularPoly(c.x, c.y, c.r, n, rng() * Math.PI, 0.18, rng);
}

export function itemShape(it, defaultClosed = false) {
  if (!it) return [];
  if (it.x !== undefined && it.r !== undefined && !it.pts) return [citadelRing(it)];
  if (!it.pts || !it.pts.length) return [];
  if (it.kind === 'poly') return it.pts.length >= 3 ? normalize([it.pts]) : [];
  if (it.kind === 'stroke') return bufferLine(it.pts, (it.width || (it.r ? it.r * 2 : 8)) / 2, false);
  if (it.kind === 'paint' || it.r !== undefined) return bufferLine(it.pts, it.r || 15, false);
  if (it.width !== undefined) return bufferLine(it.pts, it.width / 2, false);
  if (defaultClosed && it.pts.length >= 3) return normalize([it.pts]);
  return [];
}

function layerShape(items, defaultClosed = false) {
  let acc = [];
  for (const s of items || []) {
    const g = itemShape(s, defaultClosed);
    if (!g.length) continue;
    acc = s.mode === 'sub' ? difference(acc, g) : union(acc, g);
  }
  return acc;
}

export function waterShape(L = state.layers) {
  return memo('water', [L.rivers, L.lakes], () => {
    let acc = layerShape(L.rivers, false);
    for (const s of L.lakes || []) {
      const g = itemShape(s, true);
      if (!g.length) continue;
      acc = s.mode === 'sub' ? difference(acc, g) : union(acc, g);
    }
    // suaviza ligeramente esquinas
    return acc.length ? offset(offset(acc, -1.5, 'round'), 1.5, 'round') : acc;
  });
}
export function forestShape(L = state.layers) {
  return memo('forest', [L.forest], () => layerShape(L.forest, false));
}
export function sandShape(L = state.layers) {
  return memo('sand', [L.sand || []], () => layerShape(L.sand || [], false));
}
export function marshShape(L = state.layers) {
  return memo('marsh', [L.marsh || []], () => layerShape(L.marsh || [], false));
}
export function cropShape(L = state.layers) {
  return memo('crops', [L.crops || []], () => layerShape(L.crops || [], false));
}
let distCache = { key: null, grid: null };
export function districtGrid(L = state.layers) {
  const items = L.districts || [];
  let h = 0;
  for (let i = 0; i < state.districts.length; i += 4) h = Math.imul(h ^ state.districts[i], 16777619);
  const key = JSON.stringify(items) + ':' + h;
  if (distCache.key === key && distCache.grid) return distCache.grid;
  const grid = state.districts.slice();
  for (const it of items) {
    const sh = itemShape(it, it.kind === 'poly');
    if (!sh.length) continue;
    const bb = bbox(sh);
    const gx0 = Math.max(0, Math.floor(bb.x0 / DENS_RES)), gx1 = Math.min(GW - 1, Math.ceil(bb.x1 / DENS_RES));
    const gy0 = Math.max(0, Math.floor(bb.y0 / DENS_RES)), gy1 = Math.min(GH - 1, Math.ceil(bb.y1 / DENS_RES));
    const val = it.mode === 'sub' ? 0 : (it.type || 1);
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      if (pointInShape([(gx + 0.5) * DENS_RES, (gy + 0.5) * DENS_RES], sh)) grid[gy * GW + gx] = val;
    }
  }
  distCache = { key, grid };
  return grid;
}
export function districtAtGrid(x, y) {
  const g = districtGrid();
  const gx = Math.max(0, Math.min(GW - 1, Math.floor(x / DENS_RES)));
  const gy = Math.max(0, Math.min(GH - 1, Math.floor(y / DENS_RES)));
  return g[gy * GW + gx];
}
export function cliffShape(L = state.layers) {
  return memo('cliffs', [L.cliffs], () => layerShape(L.cliffs, true));
}
export function roadShape(L = state.layers) {
  return memo('roads', [L.roads], () => layerShape(L.roads, false));
}

// Trazos individuales de muralla (cerrados o abiertos, permite murallas anidadas unas dentro de otras)
export function wallPaths(L = state.layers) {
  return (L.walls || [])
    .filter((w) => w && w.pts && w.pts.length >= (w.open ? 2 : 3))
    .map((w) => ({ pts: w.pts, open: !!w.open, width: w.width, towerR: w.towerR }));
}
// Superficie interior amurallada (unión de recintos cerrados)
export function wallShape(L = state.layers) {
  return memo('walls', [L.walls], () => {
    let acc = [];
    for (const w of L.walls || []) {
      if (w.open || !w.pts || w.pts.length < 3) continue;
      acc = union(acc, normalize([w.pts]));
    }
    return acc;
  });
}
// Barrera física de todas las murallas (exteriores, interiores anidadas y tramos abiertos)
export function wallBarrierShape(L = state.layers, half = 4.5) {
  return memo('wallBarrier:' + half, [L.walls], () => {
    let acc = [];
    for (const w of L.walls || []) {
      if (!w.pts || w.pts.length < (w.open ? 2 : 3)) continue;
      const wh = Math.max(half, (w.width ?? 3.6) / 2 + 1.5, (w.towerR ?? 2.8) * 0.9);
      acc = union(acc, bufferLine(w.pts, wh, !w.open));
    }
    return acc;
  });
}

export function citadelPaths(L = state.layers) {
  return (L.citadels || [])
    .map((c) => {
      const pts = c.pts ? c.pts : (c.x !== undefined && c.r !== undefined ? citadelRing(c) : []);
      return { pts, open: !!c.open, width: c.width, towerR: c.towerR, raw: c };
    })
    .filter((c) => c.pts.length >= (c.open ? 2 : 3));
}
export function citadelShape(L = state.layers) {
  return memo('citadels', [L.citadels], () => {
    let acc = [];
    for (const c of citadelPaths(L)) {
      if (c.open) continue;
      acc = union(acc, normalize([c.pts]));
    }
    return acc;
  });
}
export function citadelBarrierShape(L = state.layers, half = 6) {
  return memo('citadelBarrier:' + half, [L.citadels], () => {
    let acc = [];
    for (const c of citadelPaths(L)) {
      const ch = Math.max(half, (c.width ?? 3) / 2 + 2.5, (c.towerR ?? 2.6) * 0.95);
      acc = union(acc, bufferLine(c.pts, ch, !c.open));
    }
    return acc;
  });
}

// ---------------- Puertos ----------------
// Punto de la orilla más cercano a `pt` y dirección hacia el agua
export function snapToShore(pt, water, maxDist = Infinity) {
  let best = null, bd = maxDist;
  for (const r of water) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (!l2) continue;
    const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2));
    const q = [a[0] + dx * t, a[1] + dy * t];
    const d = Math.hypot(pt[0] - q[0], pt[1] - q[1]);
    if (d < bd) { bd = d; best = { p: q, tan: [dx / Math.sqrt(l2), dy / Math.sqrt(l2)] }; }
  }
  if (!best) return null;
  let n = [-best.tan[1], best.tan[0]];
  const probe = [best.p[0] + n[0] * 1.5, best.p[1] + n[1] * 1.5];
  if (!pointInShapeEO(probe, water)) n = [-n[0], -n[1]];
  return { x: best.p[0], y: best.p[1], ang: Math.atan2(n[1], n[0]) };
}
function pointInShapeEO(pt, rings) {
  let c = 0;
  for (const r of rings) {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) c++;
  }
  return c % 2 === 1;
}

// Geometría de un puerto. k = unidades de dibujo por metro real (detalles en metros).
// Devuelve el muelle de ribera (quay), los embarcaderos (piers) y barcos.
export function portParts(pt, k = 1) {
  const d = [Math.cos(pt.ang), Math.sin(pt.ang)];
  const t = [-d[1], d[0]];
  const at = (u, v) => [pt.x + t[0] * u + d[0] * v, pt.y + t[1] * u + d[1] * v];
  const rect = (u0, u1, v0, v1) => [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
  const land = Math.max(1.5, 3 * k), qd = Math.max(2, 5 * k);
  const quay = rect(-pt.w / 2, pt.w / 2, -land, qd);
  const piers = [], heads = [], boats = [];
  const n = Math.max(0, Math.round(pt.n));
  const pw = Math.max(1.2, 3.5 * k);
  const rng = mulberry32(hash2(pt.x, pt.y, 11));
  for (let i = 0; i < n; i++) {
    const u = -pt.w / 2 + (pt.w * (i + 0.5)) / n;
    const len = pt.len * (0.85 + rng() * 0.3);
    piers.push(rect(u - pw / 2, u + pw / 2, qd - 0.2, qd + len));
    if (len > 12 * k && rng() < 0.6) heads.push(rect(u - pw * 1.8, u + pw * 1.8, qd + len - pw * 1.4, qd + len));
    // barcos amarrados a ambos lados
    for (const side of [-1, 1]) {
      if (rng() < 0.35) continue;
      const bl = Math.max(4, (9 + rng() * 7) * k), bb = Math.max(1.5, (3 + rng() * 1.5) * k);
      if (bl > len * 0.95) continue;
      const v = qd + bl / 2 + rng() * Math.max(0, len - bl);
      boats.push(hull(at(u + side * (pw / 2 + bb / 2 + 0.4 * k), v), pt.ang + (rng() < 0.5 ? 0 : Math.PI), bl, bb));
    }
  }
  // algún barco fondeado
  if (rng() < 0.7) {
    const bl = Math.max(5, (12 + rng() * 10) * k);
    boats.push(hull(at((rng() - 0.5) * pt.w, qd + pt.len + bl * (0.8 + rng())), pt.ang + Math.PI / 2 + (rng() - 0.5) * 0.8, bl, bl * 0.3));
  }
  return { quay, piers, heads, boats };
}
function hull([cx, cy], ang, L, B) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const pts = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const u = -1 + (2 * i) / N;
    const hw = (B / 2) * Math.pow(1 - u * u, 0.55) * (u > 0 ? 1 : 0.92 + 0.08 * (1 + u));
    pts.push([u * L / 2, hw]);
  }
  for (let i = N - 1; i > 0; i--) pts.push([pts[i][0], -pts[i][1]]);
  return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
export function portShape(L = state.layers, k = 1) {
  const ports = L.ports || [];
  let acc = [];
  for (const p of ports) {
    const pp = portParts(p, k);
    acc = union(acc, [pp.quay, ...pp.piers, ...pp.heads]);
  }
  return acc;
}
