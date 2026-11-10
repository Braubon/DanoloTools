// ---------------------------------------------------------------------------
// Reglas en el servidor: base de datos de los libros, dados y cálculos de
// personaje para el bot. Reutiliza db.js y rules.js de las webs.
// ---------------------------------------------------------------------------
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { cargarRaw, construirDb, get, tabla } from '../assets/js/db.js';
import * as R from '../assets/js/rules.js';

export { R };
const DATA = fileURLToPath(new URL('../data/', import.meta.url));

let cache = null;
/** Base de datos completa (todos los libros). Se carga una vez por instancia. */
export function baseDatos() {
  if (!cache) {
    cache = cargarRaw(DATA, async (p) => JSON.parse(await readFile(p, 'utf8')))
      .then((raw) => construirDb(raw, null))
      .catch((e) => { cache = null; throw e; });
  }
  return cache;
}

// ------------------------------------------------------------------ dados
export const tirar = (caras) => randomInt(1, caras + 1);

/** Prueba de dos dados según las reglas de Fabula Ultima. */
export function prueba(caras1, caras2, bono = 0, dificultad = null) {
  const d1 = tirar(caras1), d2 = tirar(caras2);
  const pifia = d1 === 1 && d2 === 1;
  const critico = !pifia && d1 === d2 && d1 >= 6;
  const total = d1 + d2 + (bono || 0);
  const dif = dificultad === undefined || dificultad === null || dificultad === '' ? null : Number(dificultad);
  return {
    d1, d2, caras1, caras2, bono: bono || 0, total, tm: Math.max(d1, d2), critico, pifia, dif,
    exito: dif === null ? null : (critico || (!pifia && total >= dif))
  };
}

/** Tirada libre: "2d6+3", "1d8+1d10-2", "d20". */
export function tiradaLibre(expr) {
  const limpio = String(expr || '').toLowerCase().replace(/\s+/g, '');
  if (!limpio || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(limpio)) throw new Error('Expresión no válida. Ejemplos: d20, 2d6+3, 1d8+1d10-2.');
  const partes = limpio.match(/[+-]?(\d*d\d+|\d+)/g);
  let total = 0, numDados = 0;
  const detalle = [];
  for (const p of partes) {
    const signo = p.startsWith('-') ? -1 : 1;
    const t = p.replace(/^[+-]/, '');
    if (t.includes('d')) {
      const [n, c] = t.split('d').map((x) => (x === '' ? 1 : Number(x)));
      if (n < 1 || c < 2 || c > 1000) throw new Error('Dados no válidos.');
      numDados += n;
      if (numDados > 50) throw new Error('Máximo 50 dados por tirada.');
      const res = Array.from({ length: n }, () => tirar(c));
      total += signo * res.reduce((a, b) => a + b, 0);
      detalle.push(`${signo < 0 ? '−' : ''}${n}d${c} [${res.join(', ')}]`);
    } else {
      total += signo * Number(t);
      detalle.push(`${signo < 0 ? '−' : '+'}${t}`);
    }
  }
  return { total, detalle: detalle.join(' ').replace(/^\+/, '') };
}

// ------------------------------------------------------------------ personaje
const REDUCE = { lento: ['DES'], confundido: ['PER'], debil: ['VIG'], estremecido: ['VOL'], enfurecido: ['DES', 'PER'], envenenado: ['VIG', 'VOL'] };

export function calc(pj, db) { return R.calcular(pj, db); }

/** Dados actuales tras aplicar los estados alterados (mínimo d6). */
export function dadosEfectivos(pj, c) {
  const d = {};
  for (const a of R.ATR) d[a] = c.actual[a] || 0;
  for (const s of (pj.estado && pj.estado.estados) || []) for (const a of REDUCE[s] || []) if (d[a]) d[a] = Math.max(6, d[a] - 2);
  return d;
}

export function recursos(pj, c) {
  const e = pj.estado || {};
  const v = (x, max) => (x === null || x === undefined ? max : x);
  return { pv: v(e.pv, c.pv_max), pm: v(e.pm, c.pm_max), pi: v(e.pi, c.pi_max) };
}

export const nombre = (pj) => (pj && pj.identidad && pj.identidad.nombre) || 'Sin nombre';
export const nombreTipo = (db, id) => ((tabla(db, 'tipos_dano').find((x) => x.id === id) || { nombre: id || '' }).nombre || '').toLowerCase();
export const nombreEstado = (db, id) => (tabla(db, 'estados').find((x) => x.id === id) || { nombre: id }).nombre;
export const nombreClase = (db, id) => (get(db, 'clases', id) || { nombre: id }).nombre;

export function resumenClases(pj, db) {
  const act = (pj.clases || []).filter((c) => R.nivelClase(c) > 0);
  return act.length ? act.map((c) => `${nombreClase(db, c.id)} ${R.nivelClase(c)}`).join(' · ') : 'Sin clases';
}

/** Barra de texto para Discord. */
export function barra(actual, max, ancho = 10) {
  if (!max) return '';
  const n = Math.max(0, Math.min(ancho, Math.round((actual / max) * ancho)));
  return '▰'.repeat(n) + '▱'.repeat(ancho - n);
}

/** Interpreta "+5", "-12", "30", "max". Devuelve el nuevo valor. */
export function aplicarValor(actual, texto, max = null) {
  const t = String(texto).trim().toLowerCase().replace(',', '.');
  let v;
  if (['max', 'máx', 'maximo', 'máximo', 'lleno', 'full'].includes(t)) {
    if (max === null) throw new Error('Este recurso no tiene máximo.');
    v = max;
  } else if (/^[+-]\d+$/.test(t)) v = actual + Number(t);
  else if (/^\d+$/.test(t)) v = Number(t);
  else throw new Error('Valor no válido. Usa +N, -N, un número o «max».');
  v = Math.max(0, v);
  if (max !== null) v = Math.min(max, v);
  return v;
}

/** Coste en PM de un conjuro, si es numérico. */
export function costeConjuro(cj, objetivos = 1) {
  const t = String(cj.pm || '');
  const m = t.match(/(\d+)/);
  if (!m || /hasta/i.test(t)) return null;
  const base = Number(m[1]);
  return /×|x\s*(obj|b)/i.test(t) ? base * (objetivos || 1) : base;
}

/** Bonificador de daño fijo de un conjuro con fórmula [TM + X]. */
export function formulaDano(cj) {
  const m = String(cj.efecto || '').match(/\[T[MA]\s*\+\s*(\d+)\]/);
  return m ? Number(m[1]) : null;
}

export function tipoDanoTexto(cj) {
  const m = String(cj.efecto || '').match(/daño (?:de )?(físico|aire|rayo|oscuro|tierra|fuego|hielo|luz|veneno)/i);
  return m ? m[1].toLowerCase() : '';
}
