// Convierte los trazos del usuario de cada capa en una única geometría fusionada.
import { state, hash2, mulberry32 } from './state.js';
import { bufferLine, union, difference, normalize, regularPoly, offset } from './geom.js';

const cache = new Map();
function memo(key, deps, fn) {
  const k = JSON.stringify(deps);
  const c = cache.get(key);
  if (c && c.k === k) return c.v;
  const v = fn();
  cache.set(key, { k, v });
  return v;
}

function brushLayer(strokes) {
  let acc = [];
  for (const s of strokes) {
    const g = bufferLine(s.pts, s.r, false);
    acc = s.mode === 'sub' ? difference(acc, g) : union(acc, g);
  }
  return acc;
}

export function waterShape(L = state.layers) {
  return memo('water', [L.rivers, L.lakes], () => {
    let acc = [];
    for (const r of L.rivers) acc = union(acc, bufferLine(r.pts, r.width / 2));
    for (const s of L.lakes) {
      const g = bufferLine(s.pts, s.r);
      acc = s.mode === 'sub' ? difference(acc, g) : union(acc, g);
    }
    // suaviza ligeramente esquinas
    return acc.length ? offset(offset(acc, -1.5, 'round'), 1.5, 'round') : acc;
  });
}
export function forestShape(L = state.layers) {
  return memo('forest', [L.forest], () => brushLayer(L.forest));
}
export function sandShape(L = state.layers) {
  return memo('sand', [L.sand || []], () => brushLayer(L.sand || []));
}
export function marshShape(L = state.layers) {
  return memo('marsh', [L.marsh || []], () => brushLayer(L.marsh || []));
}
export function cropShape(L = state.layers) {
  return memo('crops', [L.crops || []], () => brushLayer(L.crops || []));
}
export function cliffShape(L = state.layers) {
  return memo('cliffs', [L.cliffs], () => {
    let acc = [];
    for (const c of L.cliffs) acc = union(acc, normalize([c.pts]));
    return acc;
  });
}
export function roadShape(L = state.layers) {
  return memo('roads', [L.roads], () => {
    let acc = [];
    for (const r of L.roads) acc = union(acc, bufferLine(r.pts, r.width / 2));
    return acc;
  });
}
export function wallShape(L = state.layers) {
  return memo('walls', [L.walls], () => {
    let acc = [];
    for (const w of L.walls) acc = union(acc, normalize([w.pts]));
    return acc;
  });
}
export function citadelRing(c) {
  const rng = mulberry32(hash2(c.x, c.y, 7));
  const n = 7 + Math.floor(rng() * 3);
  return regularPoly(c.x, c.y, c.r, n, rng() * Math.PI, 0.18, rng);
}
export function citadelShape(L = state.layers) {
  return memo('citadels', [L.citadels], () => {
    let acc = [];
    for (const c of L.citadels) acc = union(acc, [citadelRing(c)]);
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
