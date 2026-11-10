// Utilidades geométricas. Formas = arrays de anillos [[x,y],...] en metros.
// Las operaciones booleanas y offsets usan Clipper (enteros, escala SCALE).
import ClipperLib from 'clipper-lib';

const SCALE = 10;
const C = ClipperLib;

export function toC(rings) {
  return rings.map(r => r.map(p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })));
}
export function fromC(paths) {
  return paths.filter(p => p.length >= 3).map(p => p.map(q => [q.X / SCALE, q.Y / SCALE]));
}

function exec(type, subj, clip, fill = C.PolyFillType.pftNonZero) {
  const c = new C.Clipper();
  if (subj.length) c.AddPaths(toC(subj), C.PolyType.ptSubject, true);
  if (clip && clip.length) c.AddPaths(toC(clip), C.PolyType.ptClip, true);
  const sol = new C.Paths();
  c.Execute(type, sol, fill, fill);
  return fromC(sol);
}

export const union = (a, b = []) => exec(C.ClipType.ctUnion, a, b);
export const difference = (a, b) => (b && b.length ? exec(C.ClipType.ctDifference, a, b) : a);
export const intersection = (a, b) => exec(C.ClipType.ctIntersection, a, b);
// Unión de una lista de formas evenodd (resultado de clipper) respetando agujeros.
export function unionAll(shapes) {
  let acc = [];
  for (const s of shapes) if (s && s.length) acc = acc.length ? exec(C.ClipType.ctUnion, acc, s) : normalize(s);
  return acc;
}
export function normalize(s) {
  return exec(C.ClipType.ctUnion, s, [], C.PolyFillType.pftEvenOdd);
}

// Buffer de una polilínea (abierta o cerrada) con extremos redondeados.
export function bufferLine(points, half, closed = false) {
  if (!points || points.length < 1) return [];
  const co = new C.ClipperOffset(2, 0.25 * SCALE);
  const path = points.map(p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) }));
  co.AddPath(path, C.JoinType.jtRound, closed ? C.EndType.etClosedLine : C.EndType.etOpenRound);
  const sol = new C.Paths();
  co.Execute(sol, half * SCALE);
  return fromC(sol);
}

// Offset de polígonos (delta negativo = encoger)
export function offset(rings, delta, join = 'miter') {
  if (!rings.length) return [];
  const jt = join === 'round' ? C.JoinType.jtRound : join === 'square' ? C.JoinType.jtSquare : C.JoinType.jtMiter;
  const co = new C.ClipperOffset(2.5, 0.25 * SCALE);
  co.AddPaths(toC(rings), jt, C.EndType.etClosedPolygon);
  const sol = new C.Paths();
  co.Execute(sol, delta * SCALE);
  return fromC(sol);
}

export function ringArea(r) {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i], q = r[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
export function shapeArea(rings) {
  return Math.abs(rings.reduce((s, r) => s + ringArea(r), 0));
}
export function outerRings(rings) {
  if (!rings.length) return [];
  // el anillo con mayor |área| define la orientación "exterior"
  let big = rings[0];
  for (const r of rings) if (Math.abs(ringArea(r)) > Math.abs(ringArea(big))) big = r;
  const s = Math.sign(ringArea(big));
  return rings.filter(r => Math.sign(ringArea(r)) === s);
}
// Agrupa anillos en polígonos {outer, holes}
export function polygons(rings) {
  const outs = outerRings(rings);
  const holes = rings.filter(r => !outs.includes(r));
  return outs.map(o => ({
    outer: o,
    holes: holes.filter(h => pointInRing(h[0], o)),
  }));
}

export function centroid(r) {
  let x = 0, y = 0, a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i], q = r[(i + 1) % n];
    const f = p[0] * q[1] - q[0] * p[1];
    x += (p[0] + q[0]) * f; y += (p[1] + q[1]) * f; a += f;
  }
  if (Math.abs(a) < 1e-9) {
    const m = r.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
    return [m[0] / r.length, m[1] / r.length];
  }
  return [x / (3 * a), y / (3 * a)];
}

export function pointInRing(pt, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// even-odd sobre todos los anillos
export function pointInShape(pt, rings) {
  let c = 0;
  for (const r of rings) if (pointInRing(pt, r)) c++;
  return c % 2 === 1;
}

export function bbox(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) {
    if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1 };
}
export const bboxOverlap = (a, b, m = 0) => a.x0 - m <= b.x1 && a.x1 + m >= b.x0 && a.y0 - m <= b.y1 && a.y1 + m >= b.y0;

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function distPointSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export function distPointPolyline(p, pts, closed = false) {
  let d = Infinity;
  const n = pts.length;
  if (n === 1) return dist(p, pts[0]);
  for (let i = 0; i < n - 1 + (closed ? 1 : 0); i++) d = Math.min(d, distPointSeg(p, pts[i], pts[(i + 1) % n]));
  return d;
}
export function distPointShapeEdge(p, rings) {
  let d = Infinity;
  for (const r of rings) d = Math.min(d, distPointPolyline(p, r, true));
  return d;
}

// Intersección de segmentos: devuelve {t,u,p} o null
export function segIntersect(a, b, c, d) {
  const r0 = b[0] - a[0], r1 = b[1] - a[1], s0 = d[0] - c[0], s1 = d[1] - c[1];
  const den = r0 * s1 - r1 * s0;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den;
  const u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, p: [a[0] + t * r0, a[1] + t * r1] };
}

// Cruces de una polilínea con los bordes de una forma (cerrada o abierta)
export function polylineCrossings(pts, rings, closed = true) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const segLen = dist(a, b);
    for (const r of rings) {
      const m = closed ? r.length : Math.max(0, r.length - 1);
      for (let j = 0; j < m; j++) {
        const c = r[j], d = r[(j + 1) % r.length];
        const hit = segIntersect(a, b, c, d);
        if (hit) {
          const dir = [(b[0] - a[0]) / (segLen || 1), (b[1] - a[1]) / (segLen || 1)];
          const edge = [d[0] - c[0], d[1] - c[1]];
          out.push({ p: hit.p, s: acc + hit.t * segLen, dir, edge, seg: i });
        }
      }
    }
    acc += segLen;
  }
  out.sort((x, y) => x.s - y.s);
  return out;
}

export function polylineLength(pts) {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += dist(pts[i], pts[i + 1]);
  return l;
}
// Punto y dirección a distancia s a lo largo de la polilínea
export function pointAt(pts, s) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = dist(pts[i], pts[i + 1]);
    if (acc + l >= s || i === pts.length - 2) {
      const t = l ? Math.max(0, Math.min(1, (s - acc) / l)) : 0;
      const a = pts[i], b = pts[i + 1];
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: [(b[0] - a[0]) / (l || 1), (b[1] - a[1]) / (l || 1)] };
    }
    acc += l;
  }
  return { p: pts[0], dir: [1, 0] };
}

// Ramer–Douglas–Peucker
export function simplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  let idx = -1, dmax = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distPointSeg(pts[i], a, b);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const l = simplify(pts.slice(0, idx + 1), eps);
    const r = simplify(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [a, b];
}

// Suavizado Chaikin (mantiene extremos si es abierta)
export function chaikin(pts, iter = 2, closed = false) {
  let p = pts;
  for (let k = 0; k < iter; k++) {
    if (p.length < 3) return p;
    const out = closed ? [] : [p[0]];
    const n = p.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

// Divide un anillo por una recta (punto + dirección) en dos formas
export function splitByLine(ring, pt, dir, gap = 0) {
  const n = [-dir[1], dir[0]];
  const B = 1e5;
  const half = (sgn) => {
    const o = [pt[0] + n[0] * gap * 0.5 * sgn, pt[1] + n[1] * gap * 0.5 * sgn];
    const a = [o[0] - dir[0] * B, o[1] - dir[1] * B];
    const b = [o[0] + dir[0] * B, o[1] + dir[1] * B];
    return [[a, b, [b[0] + n[0] * B * sgn, b[1] + n[1] * B * sgn], [a[0] + n[0] * B * sgn, a[1] + n[1] * B * sgn]]];
  };
  return [intersection([ring], half(1)), intersection([ring], half(-1))];
}

// Elimina aristas cortas de un anillo (lo vuelve más "cuadrangular")
export function collapseShortEdges(ring, minLen) {
  let r = ring.slice();
  let changed = true;
  while (changed && r.length > 4) {
    changed = false;
    let bi = -1, bl = minLen;
    for (let i = 0; i < r.length; i++) {
      const l = dist(r[i], r[(i + 1) % r.length]);
      if (l < bl) { bl = l; bi = i; }
    }
    if (bi >= 0) {
      const a = r[bi], b = r[(bi + 1) % r.length];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      r[bi] = m;
      r.splice((bi + 1) % r.length, 1);
      changed = true;
    }
  }
  return r;
}

// Rectángulo orientado
export function orientedRect(cx, cy, w, h, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

export function regularPoly(cx, cy, r, n, rot = 0, jitter = 0, rng = Math.random) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const rr = r * (1 + (rng() * 2 - 1) * jitter);
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return out;
}

// Ejes principales de un anillo: dirección de la arista más larga
export function mainAxis(ring) {
  let bl = 0, dir = [1, 0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const l = dist(a, b);
    if (l > bl) { bl = l; dir = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
  }
  return dir;
}
export function extents(ring, dir) {
  const n = [-dir[1], dir[0]];
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const p of ring) {
    const u = p[0] * dir[0] + p[1] * dir[1], v = p[0] * n[0] + p[1] * n[1];
    a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v);
  }
  return { a0, a1, b0, b1, n };
}

const f = (v) => Math.round(v * 10) / 10;
export function ringsToPath(rings) {
  let d = '';
  for (const r of rings) {
    if (r.length < 2) continue;
    d += 'M' + f(r[0][0]) + ' ' + f(r[0][1]);
    for (let i = 1; i < r.length; i++) d += 'L' + f(r[i][0]) + ' ' + f(r[i][1]);
    d += 'Z';
  }
  return d;
}
export function lineToPath(pts, closed = false) {
  if (!pts.length) return '';
  let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
  for (let i = 1; i < pts.length; i++) d += 'L' + f(pts[i][0]) + ' ' + f(pts[i][1]);
  return closed ? d + 'Z' : d;
}
