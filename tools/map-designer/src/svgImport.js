// Importación de terreno desde SVG (Illustrator / Inkscape / Affinity) + SVG de ejemplo
import { state, WORLD, ASPECTS, emptyLayers, syncAspect, sprayDensity, DENS_RES, GW, GH } from './state.js';
import { pointInRing, centroid, bbox, dist } from './geom.js';
import { waterShape, snapToShore } from './layers.js';

// Paleta de referencia (también usada en el SVG de ejemplo para Illustrator)
export const SVG_GUIDE = [
  { cat: 'walls',    layer: 'murallas',          hex: '#C0392B', label: 'Murallas',            hint: 'Cerrada = recinto · Abierta = lienzo (grosor = ancho)' },
  { cat: 'citadels', layer: 'ciudadelas',        hex: '#4A148C', label: 'Ciudadelas',          hint: 'Polígono cerrado (o abierto)' },
  { cat: 'water',    layer: 'agua / rios',       hex: '#2196F3', label: 'Agua y ríos',         hint: 'Relleno/cerrado = mar o lago · Trazo = río (grosor = cauce)' },
  { cat: 'roads',    layer: 'caminos',           hex: '#D35400', label: 'Caminos',             hint: 'Trazo abierto (grosor = anchura del camino)' },
  { cat: 'cliffs',   layer: 'riscos',            hex: '#5D4037', label: 'Riscos / elevación',  hint: 'Polígono cerrado o trazo abierto' },
  { cat: 'forest',   layer: 'bosques',           hex: '#2E7D32', label: 'Bosques',             hint: 'Polígono cerrado o trazo grueso' },
  { cat: 'sand',     layer: 'playas',            hex: '#F4D03F', label: 'Playas / arena',      hint: 'Polígono cerrado o trazo grueso' },
  { cat: 'marsh',    layer: 'pantanos',          hex: '#6B7B3A', label: 'Pantanos',            hint: 'Polígono cerrado o trazo grueso' },
  { cat: 'crops',    layer: 'cultivos',          hex: '#AED581', label: 'Cultivos',            hint: 'Polígono cerrado o trazo grueso' },
  { cat: 'density',  layer: 'densidad',          hex: '#E91E63', label: 'Asentamiento s/m',    hint: 'Zona edificable sin muralla (arrabal / aldea)' },
  { cat: 'ports',    layer: 'puertos',           hex: '#00BFA5', label: 'Puertos',             hint: 'Círculo o marca junto a la orilla del agua' },
  { cat: 'dist:1',   layer: 'barrio-rico',       hex: '#C49628', label: 'Barrio rico',         hint: 'Zona cerrada o trazo' },
  { cat: 'dist:2',   layer: 'barrio-pobre',      hex: '#78645A', label: 'Barrio pobre',        hint: 'Zona cerrada o trazo' },
  { cat: 'dist:3',   layer: 'barrio-mercantil',  hex: '#3C78AA', label: 'Barrio mercantil',    hint: 'Zona cerrada o trazo' },
  { cat: 'dist:4',   layer: 'barrio-religioso',  hex: '#9650A0', label: 'Barrio religioso',    hint: 'Zona cerrada o trazo' },
];

const IGNORE_LAYERS = new Set([
  'fondo', 'background', 'papel', 'escala', 'leyenda', 'guia', 'guias',
  'referencia', 'legend', 'guide', 'guides', 'defs', 'grid', 'rejilla',
]);

const GENERIC_LAYER = /^(capa|layer|grupo|group|g|svg)[_-]?\d*$/i;

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- Colores ----
const NAMED_COLORS = {
  black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF',
  yellow: '#FFFF00', orange: '#FFA500', purple: '#800080', brown: '#A52A2A', cyan: '#00FFFF',
  teal: '#008080', olive: '#808000', navy: '#000080', gray: '#808080', grey: '#808080',
  magenta: '#FF00FF', pink: '#FFC0CB',
};

function parseColor(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s || s === 'none' || s === 'transparent' || s.startsWith('url(')) return null;
  if (NAMED_COLORS[s]) return hexToRgb(NAMED_COLORS[s]);
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length === 8) h = h.slice(0, 6);
    if (h.length !== 6) return null;
    return hexToRgb('#' + h);
  }
  const m = s.match(/^rgba?\(\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)/);
  if (m) {
    const ch = (v) => (v.endsWith('%') ? Math.round(parseFloat(v) * 2.55) : Math.round(parseFloat(v)));
    return [ch(m[1]), ch(m[2]), ch(m[3])];
  }
  return null;
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const COLOR_PALETTE = [
  ...SVG_GUIDE.map((g) => ({ cat: g.cat, rgb: hexToRgb(g.hex) })),
  // Colores del propio exportador de Cartógrafo por si se reimporta
  { cat: 'walls',    rgb: hexToRgb('#37312A') },
  { cat: 'water',    rgb: hexToRgb('#A8BDC1') },
  { cat: 'water',    rgb: hexToRgb('#6F8387') },
  { cat: 'roads',    rgb: hexToRgb('#ADA389') },
  { cat: 'cliffs',   rgb: hexToRgb('#5E5648') },
  { cat: 'cliffs',   rgb: hexToRgb('#B3A790') },
  { cat: 'forest',   rgb: hexToRgb('#ADB38B') },
  { cat: 'forest',   rgb: hexToRgb('#DAD9BF') },
  { cat: 'sand',     rgb: hexToRgb('#EFDFB4') },
  { cat: 'marsh',    rgb: hexToRgb('#CBCFAE') },
  { cat: 'crops',    rgb: hexToRgb('#E2DAC2') },
];

function classifyByColor(rgb) {
  if (!rgb) return null;
  let best = null, bd = 46;
  for (const p of COLOR_PALETTE) {
    const d = rgbDist(rgb, p.rgb);
    if (d < bd) { bd = d; best = p.cat; }
  }
  return best;
}

function classifyByLayerName(name) {
  const n = norm(name);
  if (!n || GENERIC_LAYER.test(n)) return null;
  if (IGNORE_LAYERS.has(n)) return 'ignore';
  if (/muralla|walls?\b/.test(n)) return 'walls';
  if (/ciudadela|citadel|castillo|alcazar|fortaleza/.test(n)) return 'citadels';
  if (/\brios?\b|\brivers?\b/.test(n)) return 'rivers';
  if (/agua|lagos?|lakes?|\bmar\b|\bsea\b|costa|water/.test(n)) return 'water';
  if (/camino|carretera|calle|senda|roads?|streets?/.test(n)) return 'roads';
  if (/risco|acantilado|elevacion|cliffs?/.test(n)) return 'cliffs';
  if (/bosque|forest|arbol|trees?/.test(n)) return 'forest';
  if (/playa|arena|sand|beach/.test(n)) return 'sand';
  if (/pantano|cienaga|marsh|swamp/.test(n)) return 'marsh';
  if (/cultivo|campo|granja|crops?|farms?/.test(n)) return 'crops';
  if (/densidad|ciudad|asentamiento|urbano|density|urban/.test(n)) return 'density';
  if (/puerto|muelle|ports?|harbor/.test(n)) return 'ports';
  if (/barrio-rico|\brico\b|\brich\b/.test(n)) return 'dist:1';
  if (/barrio-pobre|\bpobre\b|\bpoor\b/.test(n)) return 'dist:2';
  if (/barrio-mercantil|mercantil|mercado|merchant/.test(n)) return 'dist:3';
  if (/barrio-religioso|religioso|templo|religious/.test(n)) return 'dist:4';
  return null;
}

// ---- CSS <style> y atributos ----
function parseCssRules(doc) {
  const rules = new Map();
  for (const st of doc.querySelectorAll('style')) {
    const txt = (st.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(txt))) {
      const decls = parseStyleText(m[2]);
      for (const sel of m[1].split(',')) {
        const key = sel.trim();
        if (key) rules.set(key, { ...(rules.get(key) || {}), ...decls });
      }
    }
  }
  return rules;
}

function parseStyleText(txt) {
  const out = {};
  if (!txt) return out;
  for (const part of txt.split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim().toLowerCase();
    const v = part.slice(idx + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

const STYLE_KEYS = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'opacity', 'display', 'visibility'];

function resolveStyle(el, parentStyle, cssRules) {
  const s = { ...parentStyle };
  // 1. atributos de presentación
  for (const k of STYLE_KEYS) {
    const v = el.getAttribute(k);
    if (v !== null && v !== '') s[k] = v.trim();
  }
  // 2. clases CSS (.cls-1, etc.)
  const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
  for (const c of cls) {
    const r = cssRules.get('.' + c);
    if (r) Object.assign(s, r);
  }
  const id = el.getAttribute('id');
  if (id && cssRules.has('#' + id)) Object.assign(s, cssRules.get('#' + id));
  const tagRule = cssRules.get(el.tagName.toLowerCase());
  if (tagRule) Object.assign(s, tagRule);
  // 3. estilo inline (prioridad máxima)
  const inline = parseStyleText(el.getAttribute('style'));
  Object.assign(s, inline);
  return s;
}

// ---- Matrices afines 2D: [a, b, c, d, e, f] ----
const ID_MAT = [1, 0, 0, 1, 0, 0];
const mulMat = (m1, m2) => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];
const applyMat = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const matScale = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

function parseTransform(str) {
  if (!str) return ID_MAT;
  let m = ID_MAT;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(str))) {
    const fn = match[1].toLowerCase();
    const nums = (match[2].match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []).map(Number);
    let t = ID_MAT;
    if (fn === 'matrix' && nums.length >= 6) t = nums.slice(0, 6);
    else if (fn === 'translate') t = [1, 0, 0, 1, nums[0] || 0, nums[1] || 0];
    else if (fn === 'scale') { const sx = nums[0] ?? 1, sy = nums[1] ?? sx; t = [sx, 0, 0, sy, 0, 0]; }
    else if (fn === 'rotate') {
      const a = ((nums[0] || 0) * Math.PI) / 180;
      const c = Math.cos(a), s = Math.sin(a);
      const cx = nums[1] || 0, cy = nums[2] || 0;
      t = mulMat([1, 0, 0, 1, cx, cy], mulMat([c, s, -s, c, 0, 0], [1, 0, 0, 1, -cx, -cy]));
    } else if (fn === 'skewx') {
      t = [1, 0, Math.tan(((nums[0] || 0) * Math.PI) / 180), 1, 0, 0];
    } else if (fn === 'skewy') {
      t = [1, Math.tan(((nums[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    }
    m = mulMat(m, t);
  }
  return m;
}

// ---- Parser de <path d="..."> y primitivas ----
function tokenizePath(d) {
  const out = [];
  const re = /([a-zA-Z])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
  let m;
  while ((m = re.exec(d))) out.push(m[1] ? m[1] : parseFloat(m[2]));
  return out;
}

function cubicPts(p0, p1, p2, p3, out, tol = 1.4, depth = 0) {
  const dx = p3[0] - p0[0], dy = p3[1] - p0[1];
  const l = Math.hypot(dx, dy);
  let d1, d2;
  if (l < 1e-6) {
    d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    d2 = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
  } else {
    d1 = Math.abs((p1[0] - p3[0]) * dy - (p1[1] - p3[1]) * dx) / l;
    d2 = Math.abs((p2[0] - p3[0]) * dy - (p2[1] - p3[1]) * dx) / l;
  }
  if ((d1 + d2 <= tol && depth >= 1) || depth >= 6) {
    out.push(p3);
    return;
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const p01 = mid(p0, p1), p12 = mid(p1, p2), p23 = mid(p2, p3);
  const p012 = mid(p01, p12), p123 = mid(p12, p23), p0123 = mid(p012, p123);
  cubicPts(p0, p01, p012, p0123, out, tol, depth + 1);
  cubicPts(p0123, p123, p23, p3, out, tol, depth + 1);
}

function quadPts(p0, p1, p2, out, tol = 1.4, depth = 0) {
  const c1 = [p0[0] + (2 / 3) * (p1[0] - p0[0]), p0[1] + (2 / 3) * (p1[1] - p0[1])];
  const c2 = [p2[0] + (2 / 3) * (p1[0] - p2[0]), p2[1] + (2 / 3) * (p1[1] - p2[1])];
  cubicPts(p0, c1, c2, p2, out, tol, depth);
}

function arcPts(p0, rx0, ry0, phiDeg, largeArc, sweep, p1, out) {
  if (p0[0] === p1[0] && p0[1] === p1[1]) return;
  let rx = Math.abs(rx0), ry = Math.abs(ry0);
  if (rx < 1e-6 || ry < 1e-6) { out.push(p1); return; }
  const phi = (phiDeg * Math.PI) / 180;
  const cosphi = Math.cos(phi), sinphi = Math.sin(phi);
  const dx2 = (p0[0] - p1[0]) / 2, dy2 = (p0[1] - p1[1]) / 2;
  const x1p = cosphi * dx2 + sinphi * dy2;
  const y1p = -sinphi * dx2 + cosphi * dy2;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const rx2 = rx * rx, ry2 = ry * ry, x1p2 = x1p * x1p, y1p2 = y1p * y1p;
  let num = Math.max(0, rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2);
  const den = rx2 * y1p2 + ry2 * x1p2;
  let k = den > 1e-12 ? Math.sqrt(num / den) : 0;
  if (largeArc === sweep) k = -k;
  const cxp = (k * rx * y1p) / ry;
  const cyp = (-k * ry * x1p) / rx;
  const cx = cosphi * cxp - sinphi * cyp + (p0[0] + p1[0]) / 2;
  const cy = sinphi * cxp + cosphi * cyp + (p0[1] + p1[1]) / 2;
  const vecAng = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, len ? dot / len : 1)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const a1 = vecAng(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let da = vecAng((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && da > 0) da -= Math.PI * 2;
  if (sweep && da < 0) da += Math.PI * 2;
  const steps = Math.max(4, Math.ceil((Math.abs(da) / (Math.PI * 2)) * 28));
  for (let i = 1; i <= steps; i++) {
    const a = a1 + (da * i) / steps;
    const px = rx * Math.cos(a), py = ry * Math.sin(a);
    out.push([cosphi * px - sinphi * py + cx, sinphi * px + cosphi * py + cy]);
  }
}

function parsePathSubpaths(d) {
  const tk = tokenizePath(d || '');
  const subs = [];
  let i = 0, cmd = '';
  let cur = [0, 0], start = [0, 0];
  let pts = [];
  let lastCp = null, lastCmd = '';

  const finish = (closed) => {
    if (pts.length) {
      if (closed && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 0.5) pts.pop();
      subs.push({ pts, closed });
    }
    pts = [];
  };

  while (i < tk.length) {
    if (typeof tk[i] === 'string') {
      cmd = tk[i++];
      if (cmd === 'Z' || cmd === 'z') {
        finish(true);
        cur = [...start];
        lastCp = null; lastCmd = cmd;
        continue;
      }
    } else if (!cmd) { i++; continue; }

    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const num = () => (typeof tk[i] === 'number' ? tk[i++] : 0);
    const pt = () => {
      const x = num() + (rel ? cur[0] : 0);
      const y = num() + (rel ? cur[1] : 0);
      return [x, y];
    };

    if (C === 'M') {
      finish(false);
      cur = pt();
      start = [...cur];
      pts = [cur];
      cmd = rel ? 'l' : 'L';
      lastCp = null;
    } else if (C === 'L') {
      cur = pt();
      pts.push(cur);
      lastCp = null;
    } else if (C === 'H') {
      cur = [num() + (rel ? cur[0] : 0), cur[1]];
      pts.push(cur);
      lastCp = null;
    } else if (C === 'V') {
      cur = [cur[0], num() + (rel ? cur[1] : 0)];
      pts.push(cur);
      lastCp = null;
    } else if (C === 'C') {
      const p1 = pt(), p2 = pt(), p3 = pt();
      if (!pts.length) pts.push([...cur]);
      cubicPts(cur, p1, p2, p3, pts);
      lastCp = p2; cur = p3;
    } else if (C === 'S') {
      const p1 = (lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's') && lastCp
        ? [2 * cur[0] - lastCp[0], 2 * cur[1] - lastCp[1]] : [...cur];
      const p2 = pt(), p3 = pt();
      if (!pts.length) pts.push([...cur]);
      cubicPts(cur, p1, p2, p3, pts);
      lastCp = p2; cur = p3;
    } else if (C === 'Q') {
      const p1 = pt(), p2 = pt();
      if (!pts.length) pts.push([...cur]);
      quadPts(cur, p1, p2, pts);
      lastCp = p1; cur = p2;
    } else if (C === 'T') {
      const p1 = (lastCmd === 'Q' || lastCmd === 'q' || lastCmd === 'T' || lastCmd === 't') && lastCp
        ? [2 * cur[0] - lastCp[0], 2 * cur[1] - lastCp[1]] : [...cur];
      const p2 = pt();
      if (!pts.length) pts.push([...cur]);
      quadPts(cur, p1, p2, pts);
      lastCp = p1; cur = p2;
    } else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), la = num(), sw = num();
      const p1 = pt();
      if (!pts.length) pts.push([...cur]);
      arcPts(cur, rx, ry, rot, la, sw, p1, pts);
      cur = p1; lastCp = null;
    } else {
      break;
    }
    lastCmd = cmd;
  }
  finish(false);
  return subs;
}

function parsePointsAttr(str) {
  const nums = (str || '').match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
  if (!nums) return [];
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([parseFloat(nums[i]), parseFloat(nums[i + 1])]);
  return pts;
}

function elementSubpaths(el) {
  const tag = el.tagName.toLowerCase();
  const f = (a) => parseFloat(el.getAttribute(a) || '0') || 0;
  if (tag === 'path') return parsePathSubpaths(el.getAttribute('d'));
  if (tag === 'polygon') return [{ pts: parsePointsAttr(el.getAttribute('points')), closed: true }];
  if (tag === 'polyline') return [{ pts: parsePointsAttr(el.getAttribute('points')), closed: false }];
  if (tag === 'line') return [{ pts: [[f('x1'), f('y1')], [f('x2'), f('y2')]], closed: false }];
  if (tag === 'rect') {
    const x = f('x'), y = f('y'), w = f('width'), h = f('height');
    if (w <= 0 || h <= 0) return [];
    return [{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }];
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = f('cx'), cy = f('cy');
    const rx = tag === 'circle' ? f('r') : f('rx');
    const ry = tag === 'circle' ? f('r') : f('ry');
    if (rx <= 0 || ry <= 0) return [];
    const pts = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return [{ pts, closed: true }];
  }
  return [];
}

function dedupePts(pts, closed) {
  const out = [];
  for (const p of pts) {
    if (!out.length || dist(out[out.length - 1], p) > 0.4) out.push(p);
  }
  if (closed && out.length > 2 && dist(out[0], out[out.length - 1]) < 0.4) out.pop();
  return out;
}

function parseLengthPx(v) {
  if (!v) return 0;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  if (v.endsWith('pt')) return n * 1.3333;
  if (v.endsWith('mm')) return n * 3.7795;
  if (v.endsWith('cm')) return n * 37.795;
  if (v.endsWith('in')) return n * 96;
  return n;
}

function closestAspect(w, h) {
  const r = w / Math.max(1, h);
  let best = ASPECTS[0], bd = Infinity;
  for (const a of ASPECTS) {
    const d = Math.abs(a.w / a.h - r);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Parsea un SVG y carga sus capas/elementos en `state`.
 * Devuelve un resumen `{ counts, aspect, total }`.
 */
export function importSvgText(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() === 'parsererror' || doc.querySelector('parsererror')) {
    throw new Error('El archivo no es un SVG válido.');
  }

  // 1. Dimensiones y proporción
  let vbX = 0, vbY = 0, vbW = 0, vbH = 0;
  const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) {
    [vbX, vbY, vbW, vbH] = vb;
  } else {
    vbW = parseLengthPx(root.getAttribute('width')) || 1600;
    vbH = parseLengthPx(root.getAttribute('height')) || 1200;
  }

  const aspect = closestAspect(vbW, vbH);
  state.params.aspect = aspect.id;
  syncAspect();

  const scale = Math.min(WORLD.w / vbW, WORLD.h / vbH);
  const offX = (WORLD.w - vbW * scale) / 2 - vbX * scale;
  const offY = (WORLD.h - vbH * scale) / 2 - vbY * scale;
  const toWorld = ([x, y]) => [x * scale + offX, y * scale + offY];

  // 2. Reiniciar capas del terreno
  const layers = emptyLayers();
  const density = new Uint8Array(GW * GH);
  const cssRules = parseCssRules(doc);
  const pendingPorts = [];
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };

  const SHAPE_TAGS = new Set(['path', 'polygon', 'polyline', 'rect', 'circle', 'ellipse', 'line']);

  function walk(node, mat, parentStyle, layerHint) {
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'defs' || tag === 'style' || tag === 'title' || tag === 'desc' || tag === 'metadata' || tag === 'text' || tag === 'tspan') return;

    const st = resolveStyle(node, parentStyle, cssRules);
    if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return;

    const label = node.getAttribute('data-name') || node.getAttribute('inkscape:label') || node.getAttribute('id') || '';
    const ownCat = classifyByLayerName(label);
    if (ownCat === 'ignore') return;
    const hint = ownCat || layerHint;

    const nextMat = mulMat(mat, parseTransform(node.getAttribute('transform')));

    if (tag === 'g' || tag === 'svg') {
      for (const ch of node.children) walk(ch, nextMat, st, hint);
      return;
    }

    if (!SHAPE_TAGS.has(tag)) return;

    const subs = elementSubpaths(node);
    if (!subs.length) return;

    const fillRgb = parseColor(st.fill);
    const strokeRgb = parseColor(st.stroke);
    const hasFill = !!fillRgb && parseFloat(st['fill-opacity'] ?? '1') > 0;
    const hasStroke = !!strokeRgb && parseFloat(st['stroke-opacity'] ?? '1') > 0;
    const swRaw = parseFloat(st['stroke-width']) || 0;
    const swWorld = (swRaw > 0 ? swRaw : 4) * matScale(nextMat) * scale;

    for (const sub of subs) {
      const pts = dedupePts(sub.pts.map((p) => toWorld(applyMat(nextMat, p))), sub.closed);
      if (pts.length < (sub.closed ? 3 : 2)) continue;

      // Determinar categoría: capa primero, color si no hay capa explícita
      let cat = hint;
      if (!cat) {
        cat = sub.closed
          ? (classifyByColor(fillRgb) || classifyByColor(strokeRgb))
          : (classifyByColor(strokeRgb) || classifyByColor(fillRgb));
      }
      if (!cat || cat === 'ignore') continue;

      // Ignorar rectángulos de fondo que cubren todo el lienzo si no vienen de una capa de terreno explícita
      if (!hint && sub.closed && pts.length === 4) {
        const bb = bbox([pts]);
        if ((bb.x1 - bb.x0) * (bb.y1 - bb.y0) > WORLD.w * WORLD.h * 0.92) continue;
      }

      const isStrokeOnly = !sub.closed || (!hasFill && hasStroke);

      if (cat === 'walls') {
        layers.walls.push({
          pts,
          open: !sub.closed,
          kind: sub.closed ? 'poly' : 'stroke',
          width: clamp(swRaw > 0 ? swWorld : 3.6, 1.5, 18),
          towerR: state.opts.towerR || 2.8,
        });
        bump('murallas');
      } else if (cat === 'citadels') {
        layers.citadels.push({
          pts,
          open: !sub.closed,
          kind: sub.closed ? 'poly' : 'stroke',
          width: clamp(swRaw > 0 ? swWorld : 3, 1.5, 18),
          towerR: 2.6,
        });
        bump('ciudadelas');
      } else if (cat === 'rivers' || (cat === 'water' && isStrokeOnly)) {
        const pList = sub.closed ? [...pts, pts[0]] : pts;
        layers.rivers.push({ pts: pList, kind: 'stroke', width: clamp(swRaw > 0 ? swWorld : 22, 4, 80) });
        bump('ríos');
      } else if (cat === 'water') {
        layers.lakes.push({ pts, kind: 'poly', mode: 'add' });
        bump('agua');
      } else if (cat === 'roads') {
        const pList = sub.closed && !hasFill ? [...pts, pts[0]] : pts;
        layers.roads.push({ pts: pList, kind: 'stroke', width: clamp(swRaw > 0 ? swWorld : 9, 2, 30) });
        bump('caminos');
      } else if (cat === 'cliffs') {
        if (isStrokeOnly) layers.cliffs.push({ pts, kind: 'stroke', width: clamp(swRaw > 0 ? swWorld : 28, 6, 120), mode: 'add' });
        else layers.cliffs.push({ pts, kind: 'poly', mode: 'add' });
        bump('riscos');
      } else if (cat === 'forest' || cat === 'sand' || cat === 'marsh' || cat === 'crops') {
        if (isStrokeOnly) layers[cat].push({ pts, kind: 'stroke', r: clamp(swWorld / 2, 5, 150), mode: 'add' });
        else layers[cat].push({ pts, kind: 'poly', mode: 'add' });
        bump(cat);
      } else if (cat.startsWith('dist:')) {
        const type = Number(cat.split(':')[1]) || 1;
        if (isStrokeOnly) layers.districts.push({ pts, kind: 'stroke', width: clamp(swWorld, 10, 200), type, mode: 'add' });
        else layers.districts.push({ pts, kind: 'poly', type, mode: 'add' });
        bump('barrios');
      } else if (cat === 'density') {
        if (sub.closed) {
          const bb = bbox([pts]);
          const gx0 = Math.max(0, Math.floor(bb.x0 / DENS_RES)), gx1 = Math.min(GW - 1, Math.ceil(bb.x1 / DENS_RES));
          const gy0 = Math.max(0, Math.floor(bb.y0 / DENS_RES)), gy1 = Math.min(GH - 1, Math.ceil(bb.y1 / DENS_RES));
          for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
            if (pointInRing([(gx + 0.5) * DENS_RES, (gy + 0.5) * DENS_RES], pts)) {
              const idx = gy * GW + gx;
              density[idx] = Math.max(density[idx], 210);
            }
          }
        } else {
          const prev = state.density;
          state.density = density;
          const r = clamp(swWorld / 2, 12, 160);
          for (let k = 0; k < pts.length; k++) sprayDensity(pts[k][0], pts[k][1], r, 0.85, false);
          state.density = prev;
        }
        bump('densidad');
      } else if (cat === 'ports') {
        const c = sub.closed ? centroid(pts) : pts[0];
        pendingPorts.push(c);
        bump('puertos');
      }
    }
  }

  // En Illustrator los atributos por defecto son fill:#000000, stroke:none
  walk(root, ID_MAT, { fill: '#000000', stroke: 'none', 'stroke-width': '1', opacity: '1' }, null);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) {
    throw new Error('No se encontraron capas ni colores reconocibles en el SVG. Descarga el SVG de ejemplo para ver cómo prepararlo.');
  }

  // Puertos: ajustar al borde del agua si hay agua importada
  if (pendingPorts.length) {
    const water = waterShape(layers);
    for (const pt of pendingPorts) {
      const snapped = water.length ? snapToShore(pt, water, 180) : null;
      if (snapped) layers.ports.push({ ...snapped, w: 60, len: 26, n: 3 });
      else layers.ports.push({ x: pt[0], y: pt[1], ang: 0, w: 60, len: 26, n: 3 });
    }
  }

  state.layers = layers;
  state.density = density;
  state.districts = new Uint8Array(GW * GH);
  state.edits = { merges: [], deleted: [], roads: [] };
  state.gen = null;

  return { counts, aspect, total };
}

// ---- SVG de ejemplo listo para Illustrator ----
export function exampleSvgString() {
  const sw = (hex, label, hint, y) => `<g transform="translate(1225 ${y})">
    <rect x="0" y="-11" width="16" height="16" rx="3" fill="${hex}" stroke="#37312A" stroke-width="0.8"/>
    <text x="24" y="1" font-family="Inter, Helvetica, Arial, sans-serif" font-size="11" font-weight="600" fill="#24211C">${label}</text>
    <text x="24" y="13" font-family="Inter, Helvetica, Arial, sans-serif" font-size="9.5" fill="#6E665B">${hex} · capa: ${hint}</text>
  </g>`;

  const legend = SVG_GUIDE.map((g, i) => sw(g.hex, g.label, g.layer, 82 + i * 31)).join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 1600 1200" width="1600" height="1200">
  <!--
    PLANTILLA PARA ADOBE ILLUSTRATOR / INKSCAPE / AFFINITY -> CARTÓGRAFO
    Cómo funciona la importación:
    1. Por NOMBRE DE CAPA (recomendado): organiza los objetos en capas con estos nombres
       (sin importar el color). Capas como "fondo" o "guia" se ignoran automáticamente.
    2. Por COLOR: si todo está en una misma capa, Cartógrafo reconoce los colores hex
       de la leyenda.
    3. Trazo abierto (sin relleno) = ríos, caminos o murallas abiertas (el grosor del trazo
       define la anchura). Forma cerrada = recintos, lagos/mar, bosques, riscos o barrios.
  -->

  <g id="fondo" inkscape:groupmode="layer" inkscape:label="fondo">
    <rect x="0" y="0" width="1600" height="1200" fill="#F4EFE2"/>
  </g>

  <g id="agua" inkscape:groupmode="layer" inkscape:label="agua">
    <polygon points="0,720 140,730 270,790 380,880 430,1010 470,1200 0,1200" fill="#2196F3" fill-opacity="0.55" stroke="#1565C0" stroke-width="2"/>
  </g>

  <g id="playas" inkscape:groupmode="layer" inkscape:label="playas">
    <polygon points="10,700 155,712 295,780 400,875 450,1010 490,1200 445,1200 405,1020 355,895 255,805 135,745 0,735" fill="#F4D03F" fill-opacity="0.7"/>
  </g>

  <g id="pantanos" inkscape:groupmode="layer" inkscape:label="pantanos">
    <path d="M 480,990 C 520,940 610,950 640,1010 C 665,1065 615,1135 540,1130 C 475,1125 450,1035 480,990 Z" fill="#6B7B3A" fill-opacity="0.65"/>
  </g>

  <g id="rios" inkscape:groupmode="layer" inkscape:label="rios">
    <path d="M 1180,60 C 1070,160 1090,260 980,350 C 870,440 720,420 620,520 C 520,620 470,740 310,850" fill="none" stroke="#2196F3" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <g id="cultivos" inkscape:groupmode="layer" inkscape:label="cultivos">
    <polygon points="890,640 1110,630 1135,790 910,810" fill="#AED581" fill-opacity="0.7"/>
    <polygon points="900,835 1120,825 1135,960 915,975" fill="#AED581" fill-opacity="0.7"/>
  </g>

  <g id="bosques" inkscape:groupmode="layer" inkscape:label="bosques">
    <path d="M 110,120 C 210,80 340,110 380,200 C 415,280 350,375 230,370 C 125,365 55,210 110,120 Z" fill="#2E7D32" fill-opacity="0.55"/>
    <path d="M 790,940 C 860,910 920,970 905,1050 C 890,1125 785,1140 745,1075 C 715,1020 735,965 790,940 Z" fill="#2E7D32" fill-opacity="0.55"/>
  </g>

  <g id="riscos" inkscape:groupmode="layer" inkscape:label="riscos">
    <polygon points="800,110 980,95 1040,185 990,290 830,300 760,210" fill="#5D4037" fill-opacity="0.5"/>
  </g>

  <g id="barrio-rico" inkscape:groupmode="layer" inkscape:label="barrio-rico">
    <polygon points="560,295 730,310 745,455 570,455" fill="#C49628" fill-opacity="0.32"/>
  </g>

  <g id="barrio-mercantil" inkscape:groupmode="layer" inkscape:label="barrio-mercantil">
    <polygon points="405,470 595,460 585,660 390,645" fill="#3C78AA" fill-opacity="0.32"/>
  </g>

  <g id="barrio-religioso" inkscape:groupmode="layer" inkscape:label="barrio-religioso">
    <polygon points="735,450 855,475 840,635 710,630" fill="#9650A0" fill-opacity="0.32"/>
  </g>

  <g id="barrio-pobre" inkscape:groupmode="layer" inkscape:label="barrio-pobre">
    <polygon points="605,650 825,650 790,775 585,760" fill="#78645A" fill-opacity="0.32"/>
  </g>

  <g id="densidad" inkscape:groupmode="layer" inkscape:label="densidad">
    <path d="M 520,790 C 595,780 680,805 690,875 C 695,935 615,965 545,945 C 485,925 470,810 520,790 Z" fill="#E91E63" fill-opacity="0.35"/>
  </g>

  <g id="caminos" inkscape:groupmode="layer" inkscape:label="caminos">
    <path d="M 80,520 C 230,525 360,555 520,565 C 670,575 820,545 1170,560" fill="none" stroke="#D35400" stroke-width="10" stroke-linecap="round"/>
    <path d="M 615,120 C 610,280 620,440 605,600 C 590,770 580,930 620,1150" fill="none" stroke="#D35400" stroke-width="9" stroke-linecap="round"/>
    <path d="M 275,785 C 335,710 410,640 490,565" fill="none" stroke="#D35400" stroke-width="8" stroke-linecap="round"/>
  </g>

  <g id="murallas" inkscape:groupmode="layer" inkscape:label="murallas">
    <!-- Recinto amurallado principal (cerrado) -->
    <polygon points="440,320 620,270 790,330 875,495 825,705 645,790 435,735 375,525" fill="none" stroke="#C0392B" stroke-width="4.5" stroke-linejoin="round"/>
    <!-- Lienzo de muralla exterior abierta (defensa del arrabal) -->
    <polyline points="465,830 510,940 650,965 735,890" fill="none" stroke="#C0392B" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <g id="ciudadelas" inkscape:groupmode="layer" inkscape:label="ciudadelas">
    <polygon points="575,305 660,295 705,365 655,425 570,405" fill="none" stroke="#4A148C" stroke-width="3.5" stroke-linejoin="round"/>
  </g>

  <g id="puertos" inkscape:groupmode="layer" inkscape:label="puertos">
    <circle cx="275" cy="792" r="14" fill="#00BFA5"/>
  </g>

  <!-- Capa de guía: se ignora al importar el SVG -->
  <g id="guia" inkscape:groupmode="layer" inkscape:label="guia">
    <rect x="1205" y="24" width="372" height="585" rx="10" fill="#FFFFFF" fill-opacity="0.92" stroke="#D0C8B8" stroke-width="1.2"/>
    <text x="1225" y="50" font-family="Inter, Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="#24211C">Guía para Illustrator → Cartógrafo</text>
    <text x="1225" y="65" font-family="Inter, Helvetica, Arial, sans-serif" font-size="10" fill="#6E665B">Usa estos nombres de capa o colores (esta caja se ignora).</text>
    ${legend}
    <text x="1225" y="566" font-family="Inter, Helvetica, Arial, sans-serif" font-size="10" font-weight="600" fill="#24211C">Consejos al exportar desde Illustrator:</text>
    <text x="1225" y="581" font-family="Inter, Helvetica, Arial, sans-serif" font-size="9.5" fill="#6E665B">• Exportar como SVG (con "Atributos de presentación" o CSS).</text>
    <text x="1225" y="595" font-family="Inter, Helvetica, Arial, sans-serif" font-size="9.5" fill="#6E665B">• Las capas "fondo" y "guia" se descartan automáticamente.</text>
  </g>
</svg>`;
}
