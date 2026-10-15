#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Validador de la base de datos y de los personajes.
//   node tools/validar.mjs                → valida data/ y personajes/
//   node tools/validar.mjs ruta/pj.json   → además valida ese personaje
// Sale con código 1 si hay errores.
// ---------------------------------------------------------------------------
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cargarRaw, construirDb, COLECCIONES } from '../assets/js/db.js';
import * as R from '../assets/js/rules.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = async (p) => JSON.parse(await readFile(p, 'utf8'));
const errores = [];
const avisos = [];
const err = (m) => errores.push(m);
const avi = (m) => avisos.push(m);

const STATS = new Set(['pv_max', 'pm_max', 'pi_max', 'def', 'mdef', 'init', 'precision', 'precision_cuerpo', 'precision_distancia',
  'magia', 'dano_cuerpo', 'dano_distancia', 'dano_conjuros', 'dado_DES', 'dado_PER', 'dado_VIG', 'dado_VOL']);
const CONDICIONES = new Set(['sin_armadura_marcial_ni_escudo', 'sin_armadura_marcial', 'sin_armas_ni_escudos', 'arma_y_escudo', 'daga_equipada', 'arma_arcana_equipada']);
const TIPOS_ELECCION = new Set(['conjuros', 'opciones', 'seleccion', 'texto', 'texto_largo', 'lista_texto']);
const TIPOS_HAB = new Set(['pasiva', 'accion', 'reaccion', 'otra']);

// ------------------------------------------------------------------ carga
let raw;
try {
  raw = await cargarRaw(path.join(raiz, 'data') + path.sep, (p) => leer(p));
} catch (e) {
  console.error('✗ No se pudo cargar la base de datos:', e.message);
  process.exit(1);
}
const db = construirDb(raw, null);
db.avisos.forEach(err);

// ------------------------------------------------------------------ atlas
const idsAtlas = new Set();
for (const { meta, archivos } of raw.atlas) {
  if (idsAtlas.has(meta.id)) err(`Atlas duplicado: ${meta.id}`);
  idsAtlas.add(meta.id);
  for (const k of ['id', 'nombre', 'tipo', 'archivos']) if (meta[k] === undefined) err(`${meta.id}/atlas.json: falta "${k}"`);
  const reglas = new Set((meta.reglas_opcionales || []).map((r) => r.id));
  for (const a of archivos) {
    if (!COLECCIONES.includes(a.coleccion)) err(`${meta.id}/${a.ruta}: colección desconocida "${a.coleccion}"`);
    if (a.regla_opcional && !reglas.has(a.regla_opcional)) err(`${meta.id}/${a.ruta}: regla opcional "${a.regla_opcional}" no declarada en atlas.json`);
    if (!Array.isArray(a.datos)) { err(`${meta.id}/${a.ruta}: debe ser un array`); continue; }
    for (const r of a.datos) {
      if (!r.id) err(`${meta.id}/${a.ruta}: registro sin id (${r.nombre || JSON.stringify(r).slice(0, 40)})`);
      else if (!/^[a-z0-9_]+(?:[-_][a-z0-9]+)*$/.test(r.id)) err(`${meta.id}/${a.ruta}: id no válido "${r.id}" (usa minúsculas y guiones)`);
      if (a.coleccion !== 'tablas' && !r.nombre) err(`${meta.id}/${a.ruta}: "${r.id}" sin nombre`);
    }
  }
}

// ------------------------------------------------------------------ comprobaciones
const ctx = { SL: 3, NIVEL: 25, CLASES: 3, DOMINADAS: 1 };
const comprobarMods = (donde, mods) => (mods || []).forEach((m) => {
  if (!STATS.has(m.stat)) err(`${donde}: stat desconocido "${m.stat}"`);
  if (m.condicion && !CONDICIONES.has(m.condicion)) err(`${donde}: condición desconocida "${m.condicion}"`);
  try { R.evalExpr(m.valor, ctx); } catch (e) { err(`${donde}: ${e.message}`); }
});
const comprobarElecciones = (donde, elec) => (elec || []).forEach((e) => {
  if (!e.clave) err(`${donde}: elección sin "clave"`);
  if (!TIPOS_ELECCION.has(e.tipo)) err(`${donde}: tipo de elección desconocido "${e.tipo}"`);
  for (const k of ['min', 'max']) if (e[k] !== undefined) { try { R.evalExpr(e[k], ctx); } catch (x) { err(`${donde}: ${x.message}`); } }
  if (e.tipo === 'opciones') for (const g of e.grupos || []) if (!db.col.opciones.some((o) => o.grupo === g)) err(`${donde}: no hay opciones del grupo "${g}"`);
  if (e.tipo === 'conjuros') for (const l of (e.filtro || {}).lista || []) if (!db.col.conjuros.some((c) => c.lista === l)) err(`${donde}: no hay conjuros de la lista "${l}"`);
  if (e.tipo === 'seleccion' && !e.valores && !(e.tabla && db.tablas[e.tabla])) err(`${donde}: selección sin valores ni tabla válida`);
  if (e.requiere_opcion && !db.idx.opciones.has(e.requiere_opcion)) err(`${donde}: requiere_opcion "${e.requiere_opcion}" no existe`);
});

const idsHab = new Map();
for (const c of db.col.clases) {
  if (!c.beneficios) err(`clase ${c.id}: faltan beneficios`);
  for (const k of (c.beneficios || {}).competencias || []) if (!db.tablas.competencias.valores.some((x) => x.id === k)) err(`clase ${c.id}: competencia desconocida "${k}"`);
  if (!(c.habilidades || []).length) err(`clase ${c.id}: sin habilidades`);
  for (const h of c.habilidades || []) {
    if (idsHab.has(h.id)) err(`Habilidad repetida "${h.id}" en ${c.id} y ${idsHab.get(h.id)}`);
    idsHab.set(h.id, c.id);
    if (!(h.sl_max >= 1)) err(`habilidad ${h.id}: sl_max no válido`);
    if (!TIPOS_HAB.has(h.tipo)) err(`habilidad ${h.id}: tipo "${h.tipo}" no válido`);
    if (!h.efecto) err(`habilidad ${h.id}: sin efecto`);
    comprobarMods(`habilidad ${h.id}`, h.modificadores);
    comprobarElecciones(`habilidad ${h.id}`, h.elecciones);
  }
}
for (const h of db.col.habilidades_heroicas) {
  const r = h.requisitos || {};
  for (const c of (r.dominar || {}).clases || []) if (!db.idx.clases.has(c)) err(`heroica ${h.id}: clase requerida "${c}" no existe`);
  for (const x of r.habilidades || []) if (!idsHab.has(x)) err(`heroica ${h.id}: habilidad requerida "${x}" no existe`);
  for (const x of h.otorga_conjuros || []) if (!db.idx.conjuros.has(x)) err(`heroica ${h.id}: conjuro "${x}" no existe`);
  comprobarMods(`heroica ${h.id}`, h.modificadores);
  comprobarElecciones(`heroica ${h.id}`, h.elecciones);
}
for (const o of db.col.opciones) for (const r of o.requiere || []) if (!db.idx.opciones.has(r)) err(`opción ${o.id}: requiere "${r}" inexistente`);
for (const p of db.col.peculiaridades) { comprobarMods(`peculiaridad ${p.id}`, p.modificadores); comprobarElecciones(`peculiaridad ${p.id}`, p.elecciones); }
for (const e of db.col.poderes_cero_efectos) comprobarElecciones(`poder cero ${e.id}`, e.elecciones);
const tipos = new Set(db.tablas.tipos_dano.valores.map((t) => t.id));
const cats = new Set(db.tablas.categorias_arma.valores.map((t) => t.id));
for (const a of db.col.armas) {
  if (!cats.has(a.categoria)) err(`arma ${a.id}: categoría "${a.categoria}" no válida`);
  if (!a.precision || !Array.isArray(a.precision.atributos) || a.precision.atributos.some((x) => !R.ATR.includes(x))) err(`arma ${a.id}: precisión no válida`);
  if (!a.dano || !tipos.has(a.dano.tipo)) err(`arma ${a.id}: tipo de daño no válido`);
  if (![1, 2].includes(a.manos)) err(`arma ${a.id}: manos debe ser 1 o 2`);
  if (!['cuerpo', 'distancia'].includes(a.alcance)) err(`arma ${a.id}: alcance no válido`);
  comprobarMods(`arma ${a.id}`, a.modificadores);
}
for (const a of db.col.armaduras) {
  for (const k of ['def', 'mdef']) { const d = a[k]; if (!d || (d.fijo === undefined && !R.ATR.includes(d.dado))) err(`armadura ${a.id}: ${k} no válido`); }
  comprobarMods(`armadura ${a.id}`, a.modificadores);
}
for (const col of ['escudos', 'accesorios', 'cualidades']) for (const o of db.col[col]) comprobarMods(`${col} ${o.id}`, o.modificadores);
for (const c of db.col.conjuros) if (!db.tablas.listas_conjuros.valores.some((l) => l.id === c.lista)) avi(`conjuro ${c.id}: lista "${c.lista}" no declarada en tablas.listas_conjuros`);

// ------------------------------------------------------------------ personajes
const personajes = [];
try {
  const idx = await leer(path.join(raiz, 'personajes', 'index.json'));
  for (const f of idx.personajes || []) personajes.push(path.join(raiz, 'personajes', f));
} catch (e) { avi('personajes/index.json no encontrado o no válido'); }
for (const extra of process.argv.slice(2)) personajes.push(path.resolve(extra));
for (const p of personajes) {
  let pj;
  try { pj = R.normalizarPersonaje(await leer(p)); } catch (e) { err(`${path.basename(p)}: ${e.message}`); continue; }
  const dbPj = construirDb(raw, pj.contenido);
  const val = R.validar(pj, dbPj, db);
  for (const v of val) (v.nivel === 'error' ? err : avi)(`${path.basename(p)} (${pj.identidad.nombre}): ${v.msg}`);
  const c = R.calcular(pj, db);
  console.log(`· ${pj.identidad.nombre} — nivel ${pj.nivel}, PV ${c.pv_max}, PM ${c.pm_max}, PI ${c.pi_max}, DEF ${c.def}, D.MÁG ${c.mdef}, INIC ${c.init}`);
}

// ------------------------------------------------------------------ informe
const cuenta = Object.entries(db.col).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.length}`).join(' · ');
console.log(`\nBase de datos: ${raw.atlas.length} libros · ${cuenta}`);
avisos.forEach((a) => console.log('  ⚠', a));
errores.forEach((e) => console.log('  ✗', e));
console.log(errores.length ? `\n✗ ${errores.length} error(es).` : '\n✓ Sin errores.');
process.exit(errores.length ? 1 : 0);
