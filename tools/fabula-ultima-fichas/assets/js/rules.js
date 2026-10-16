// ---------------------------------------------------------------------------
// Motor de reglas de Fabula Ultima. Funciones puras compartidas por el
// generador, el visor y el validador de Node.
// ---------------------------------------------------------------------------
import { get, hab, tabla, param } from './db.js';

export const ATR = ['DES', 'PER', 'VIG', 'VOL'];
export const ATR_NOMBRE = { DES: 'Destreza', PER: 'Perspicacia', VIG: 'Vigor', VOL: 'Voluntad' };
export const RANURAS = ['mano_principal', 'mano_secundaria', 'armadura', 'accesorio'];
export const RANURA_NOMBRE = { mano_principal: 'Mano principal', mano_secundaria: 'Mano secundaria', armadura: 'Armadura', accesorio: 'Accesorio' };
export const FORMATO = 'fabula-ultima-pj';
export const VERSION = 1;

// ------------------------------------------------------------- expresiones
const cacheExpr = new Map();
/** Evalúa expresiones de datos como "SL*3" o "NIVEL>=40?20:10". */
export function evalExpr(expr, ctx = {}) {
  if (expr === null || expr === undefined || expr === '') return 0;
  if (typeof expr === 'number') return expr;
  const s = String(expr).trim();
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (!/^[\sA-Z0-9_+\-*/().?:<>=!&|]*$/.test(s)) throw new Error('Expresión no válida: ' + s);
  const vars = ['SL', 'NIVEL', 'CLASES', 'DOMINADAS'];
  let fn = cacheExpr.get(s);
  if (!fn) {
    fn = Function(...vars, `"use strict"; return (${s});`); // eslint-disable-line no-new-func
    cacheExpr.set(s, fn);
  }
  const r = fn(...vars.map((v) => ctx[v] ?? 0));
  return typeof r === 'boolean' ? (r ? 1 : 0) : Math.floor(r);
}

// --------------------------------------------------------------- utilidades
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const subirDado = (d, pasos = 1) => Math.min(12, (d || 0) + 2 * pasos);

export function nuevoPersonaje() {
  const ahora = new Date().toISOString();
  return {
    formato: FORMATO, version: VERSION, id: uid(), creado: ahora, modificado: ahora,
    contenido: { atlas: ['basico'], reglas: {} },
    modo_libre: false,
    creacion_completa: false,
    identidad: { nombre: '', pronombres: '', jugador: '', identidad: '', tema: '', origen: '', especie: '', apariencia: '' },
    nivel: 5, px: 0, pf: 3, zenit: 0, ahorros: null,
    atributos: { perfil: '', base: { DES: null, PER: null, VIG: null, VOL: null }, mejoras: [] },
    clases: [],
    heroicas: [],
    elecciones: {},
    equipo: { equipado: { mano_principal: null, mano_secundaria: null, armadura: null, accesorio: null }, objetos: [] },
    vinculos: [],
    opcionales: { peculiaridad: null, poder_cero: null },
    estado: { pv: null, pm: null, pi: null, estados: [] },
    notas: '',
    historial: []
  };
}

/** Completa campos ausentes en personajes antiguos o editados a mano. */
export function normalizarPersonaje(pj) {
  const base = nuevoPersonaje();
  const out = { ...base, ...pj };
  for (const k of ['identidad', 'atributos', 'equipo', 'opcionales', 'estado', 'contenido']) {
    out[k] = { ...base[k], ...(pj[k] || {}) };
  }
  out.atributos.base = { ...base.atributos.base, ...((pj.atributos || {}).base || {}) };
  out.atributos.mejoras = (pj.atributos || {}).mejoras || [];
  out.equipo.equipado = { ...base.equipo.equipado, ...((pj.equipo || {}).equipado || {}) };
  out.equipo.objetos = (pj.equipo || {}).objetos || [];
  out.contenido.atlas = Array.from(new Set(['basico', ...(out.contenido.atlas || [])]));
  out.contenido.reglas = out.contenido.reglas || {};
  for (const k of ['clases', 'heroicas', 'vinculos', 'historial']) out[k] = Array.isArray(pj[k]) ? pj[k] : [];
  out.elecciones = pj.elecciones || {};
  out.estado.estados = out.estado.estados || [];
  return out;
}

// --------------------------------------------------------------- clases
export const nivelClase = (c) => Object.values(c.habilidades || {}).reduce((a, b) => a + (b || 0), 0);
export const clasesDominadas = (pj) => pj.clases.filter((c) => nivelClase(c) >= 10).map((c) => c.id);
export const clasesNoDominadas = (pj) => pj.clases.filter((c) => nivelClase(c) < 10);
export const nivelesAsignados = (pj) => pj.clases.reduce((a, c) => a + nivelClase(c), 0);

/** Habilidades que posee el personaje: [{ def, sl, claseId }] */
export function habilidadesPJ(pj, db) {
  const out = [];
  for (const c of pj.clases) {
    for (const [hid, sl] of Object.entries(c.habilidades || {})) {
      if (!sl) continue;
      out.push({ def: hab(db, hid), id: hid, sl, claseId: c.id });
    }
  }
  return out;
}
export const tieneHabilidad = (pj, hid) => pj.clases.some((c) => (c.habilidades || {})[hid] > 0);
export const slHabilidad = (pj, hid) => pj.clases.reduce((a, c) => a + ((c.habilidades || {})[hid] || 0), 0);

// --------------------------------------------------------------- equipo
const COL_TIPO = { armas: 'arma', armaduras: 'armadura', escudos: 'escudo', accesorios: 'accesorio', artefactos: 'artefacto', otros: 'objeto' };
export const tipoObjeto = (col) => COL_TIPO[col] || 'objeto';

/** Devuelve la definición completa de un objeto del inventario. */
export function resolverObjeto(obj, db) {
  if (!obj) return null;
  if (obj.personalizado) return { ...obj.personalizado, _col: obj.coleccion, _uid: obj.uid, _personal: true };
  const def = get(db, obj.coleccion, obj.ref);
  if (!def) return { id: obj.ref, nombre: obj.nombre || obj.ref, _col: obj.coleccion, _uid: obj.uid, _faltante: true };
  return { ...def, _uid: obj.uid };
}

export function equipados(pj, db) {
  const out = {};
  for (const r of RANURAS) {
    const u = pj.equipo.equipado[r];
    const o = u ? pj.equipo.objetos.find((x) => x.uid === u) : null;
    out[r] = o ? resolverObjeto(o, db) : null;
  }
  return out;
}

export const esEscudo = (o) => !!o && (o._col === 'escudos');
export const esArma = (o) => !!o && o._col === 'armas';

// --------------------------------------------------------------- elecciones
export const claveHab = (hid) => 'hab:' + hid;
export function eleccionesDe(pj, fuente) {
  // fuente: { tipo: 'hab'|'heroica'|'peculiaridad'|'poder_cero', id, indice }
  if (fuente.tipo === 'hab') return pj.elecciones[claveHab(fuente.id)] || {};
  if (fuente.tipo === 'heroica') return (pj.heroicas[fuente.indice] || {}).elecciones || {};
  if (fuente.tipo === 'peculiaridad') return (pj.opcionales.peculiaridad || {}).elecciones || {};
  if (fuente.tipo === 'poder_cero') return (pj.opcionales.poder_cero || {}).elecciones || {};
  return {};
}

/** Todas las fuentes de elecciones del personaje, con su definición. */
export function fuentesElecciones(pj, db) {
  const out = [];
  for (const h of habilidadesPJ(pj, db)) {
    if (h.def && h.def.elecciones) out.push({ tipo: 'hab', id: h.id, def: h.def, sl: h.sl, valores: eleccionesDe(pj, { tipo: 'hab', id: h.id }) });
  }
  pj.heroicas.forEach((hh, i) => {
    const def = get(db, 'habilidades_heroicas', hh.id);
    if (def && def.elecciones) out.push({ tipo: 'heroica', id: hh.id, indice: i, def, sl: 1, valores: hh.elecciones || {} });
  });
  const pec = pj.opcionales.peculiaridad;
  if (pec) {
    const def = get(db, 'peculiaridades', pec.id);
    if (def && def.elecciones) out.push({ tipo: 'peculiaridad', id: pec.id, def, sl: 1, valores: pec.elecciones || {} });
  }
  const pc = pj.opcionales.poder_cero;
  if (pc && pc.efecto) {
    const def = get(db, 'poderes_cero_efectos', pc.efecto);
    if (def && def.elecciones) out.push({ tipo: 'poder_cero', id: pc.efecto, def, sl: 1, valores: pc.elecciones || {} });
  }
  return out;
}

export function ctxExpr(pj, sl = 0) {
  return { SL: sl, NIVEL: pj.nivel, CLASES: pj.clases.length, DOMINADAS: clasesDominadas(pj).length };
}

/** Rango [min, max] de una elección. */
export function rangoEleccion(e, pj, sl) {
  const ctx = ctxExpr(pj, sl);
  if (e.tipo === 'seleccion') { const n = e.cantidad || 1; return [n, n]; }
  if (e.tipo === 'texto' || e.tipo === 'texto_largo') return [0, 1];
  return [evalExpr(e.min ?? '0', ctx), evalExpr(e.max ?? '99', ctx)];
}

/** Valores posibles de una elección (para selectores). */
export function valoresEleccion(e, db) {
  if (e.tipo === 'conjuros') {
    const f = e.filtro || {};
    return db.col.conjuros.filter((c) => (!f.lista || f.lista.includes(c.lista))
      && (f.supremo === undefined || !!c.supremo === f.supremo)
      && !(f.excluir || []).includes(c.id)
      && (f.supremo !== undefined || !c.supremo));
  }
  if (e.tipo === 'opciones') return db.col.opciones.filter((o) => (e.grupos || []).includes(o.grupo));
  if (e.tipo === 'seleccion') {
    if (e.tabla) return tabla(db, e.tabla).map((v) => (typeof v === 'string' ? { id: v, nombre: v } : v));
    return (e.valores || []).map((v) => ({ id: v, nombre: v }));
  }
  return [];
}

// --------------------------------------------------------------- cálculo
const COND = {
  sin_armadura_marcial_ni_escudo: (s) => !s.armaduraMarcial && !s.llevaEscudo,
  sin_armadura_marcial: (s) => !s.armaduraMarcial,
  sin_armas_ni_escudos: (s) => s.armas.length === 0 && !s.llevaEscudo,
  arma_y_escudo: (s) => esArma(s.eq.mano_principal) && esEscudo(s.eq.mano_secundaria),
  daga_equipada: (s) => s.armas.some((a) => a.categoria === 'daga'),
  arma_arcana_equipada: (s) => s.armas.some((a) => a.categoria === 'arcana') || !!(s.eq.armadura && s.eq.armadura.cuenta_como_arma_arcana)
};

/**
 * Calcula todas las estadísticas derivadas del personaje.
 * Devuelve también la lista de modificadores aplicados (para mostrar su origen).
 */
export function calcular(pj, db) {
  const nivel = pj.nivel || 1;
  // Atributos base (con mejoras de los niveles 20 y 40)
  const base = {};
  for (const a of ATR) base[a] = pj.atributos.base[a] || 0;
  for (const m of pj.atributos.mejoras || []) if (m && m.atributo) base[m.atributo] = subirDado(base[m.atributo]);

  const eq = equipados(pj, db);
  const manos = [eq.mano_principal, eq.mano_secundaria].filter(Boolean);
  const unicas = manos.filter((o, i) => manos.findIndex((x) => x._uid === o._uid) === i);
  const armas = unicas.filter(esArma);
  const escudos = unicas.filter(esEscudo);
  const llevaEscudo = escudos.length > 0 || armas.some((a) => a.cuenta_como_escudo);
  const s = { eq, armas, escudos, llevaEscudo, armaduraMarcial: !!(eq.armadura && eq.armadura.marcial) };

  // Recopilar modificadores
  const mods = [];
  const add = (lista, origen, sl) => {
    for (const m of lista || []) {
      if (m.condicion && COND[m.condicion] && !COND[m.condicion](s)) continue;
      mods.push({ stat: m.stat, valor: evalExpr(m.valor, ctxExpr(pj, sl)), origen });
    }
  };
  for (const h of habilidadesPJ(pj, db)) if (h.def) add(h.def.modificadores, h.def.nombre, h.sl);
  for (const hh of pj.heroicas) { const d = get(db, 'habilidades_heroicas', hh.id); if (d) add(d.modificadores, d.nombre, 1); }
  if (pj.opcionales.peculiaridad) { const d = get(db, 'peculiaridades', pj.opcionales.peculiaridad.id); if (d) add(d.modificadores, d.nombre, 1); }
  const vistos = new Set();
  for (const r of RANURAS) {
    const o = eq[r];
    if (!o || vistos.has(o._uid)) continue;
    vistos.add(o._uid);
    add(o.modificadores, o.nombre, 1);
  }
  const suma = (stat) => mods.filter((m) => m.stat === stat).reduce((a, m) => a + m.valor, 0);

  // Dados actuales
  const actual = {};
  for (const a of ATR) actual[a] = subirDado(base[a], suma('dado_' + a));

  // Beneficios gratuitos de clase
  let bpv = 0, bpm = 0, bpi = 0;
  const competencias = new Set();
  const rituales = new Set();
  let proyectos = false;
  for (const c of pj.clases) {
    const def = get(db, 'clases', c.id);
    if (!def) continue;
    const b = def.beneficios || {};
    bpv += b.pv || 0; bpm += b.pm || 0; bpi += b.pi || 0;
    (b.competencias || []).forEach((x) => competencias.add(x));
    (b.rituales || []).forEach((x) => rituales.add(x));
    if (b.proyectos) proyectos = true;
    if (b.eleccion && c.beneficio) {
      const e = b.eleccion.find((x) => x.id === c.beneficio);
      if (e) { bpv += e.pv || 0; bpm += e.pm || 0; bpi += e.pi || 0; }
    }
  }
  for (const h of habilidadesPJ(pj, db)) (h.def && h.def.rituales || []).forEach((x) => rituales.add(x));

  const pi_base = param(db, 'pi_base', 6);
  const pv_max = nivel + base.VIG * 5 + bpv + suma('pv_max');
  const pm_max = nivel + base.VOL * 5 + bpm + suma('pm_max');
  const pi_max = pi_base + bpi + suma('pi_max');

  // Defensas
  const arm = eq.armadura;
  const defDe = (d, dadoDef) => (!d ? actual[dadoDef] : (d.fijo !== undefined ? d.fijo : actual[d.dado] + (d.bonus || 0)));
  let def = arm ? defDe(arm.def, 'DES') : actual.DES;
  let mdef = arm ? defDe(arm.mdef, 'PER') : actual.PER;
  let init = arm ? (arm.init || 0) : 0;
  for (const e of escudos) { def += e.def || 0; mdef += e.mdef || 0; init += e.init || 0; }
  def += suma('def'); mdef += suma('mdef'); init += suma('init');

  // Ataques
  const precGen = suma('precision');
  const ataques = (armas.length ? armas : [{ nombre: 'Golpe desarmado', categoria: 'pelea', alcance: 'cuerpo', precision: { atributos: ['DES', 'VIG'], bonus: 0 }, dano: { bonus: 0, tipo: 'fisico' }, manos: 1 }])
    .map((a) => {
      const cuerpo = a.alcance === 'cuerpo';
      const bonusP = (a.precision ? a.precision.bonus || 0 : 0) + precGen + (cuerpo ? suma('precision_cuerpo') : suma('precision_distancia'));
      const bonusD = (a.dano ? a.dano.bonus || 0 : 0) + (cuerpo ? suma('dano_cuerpo') : suma('dano_distancia'));
      const at = a.precision ? a.precision.atributos : ['DES', 'VIG'];
      return {
        nombre: a.nombre, uid: a._uid, categoria: a.categoria, alcance: a.alcance, manos: a.manos, marcial: a.marcial,
        precision: { atributos: at, bonus: bonusP, dados: at.map((x) => actual[x]) },
        dano: { bonus: bonusD, tipo: (a.dano && a.dano.tipo) || 'fisico' },
        cualidad: a.cualidad || ''
      };
    });

  return {
    nivel, base, actual, incompleto: ATR.some((a) => !base[a]),
    pv_max, pm_max, pi_max, crisis: Math.floor(pv_max / 2),
    def, mdef, init,
    magia: suma('magia'), dano_conjuros: suma('dano_conjuros'),
    competencias: [...competencias], rituales: [...rituales], proyectos,
    ataques, mods, equipados: eq,
    dominadas: clasesDominadas(pj),
    fuerzaVinculos: pj.vinculos.map((v) => (v.emociones || []).length)
  };
}

/** Conjuros conocidos agrupados por origen: [{ origen, lista, conjuros: [def] }] */
export function conjurosConocidos(pj, db) {
  const grupos = [];
  const push = (origen, ids, extra = {}) => {
    const conj = (ids || []).map((id) => get(db, 'conjuros', id) || { id, nombre: id, _faltante: true });
    if (conj.length) grupos.push({ origen, conjuros: conj, ...extra });
  };
  for (const f of fuentesElecciones(pj, db)) {
    for (const e of f.def.elecciones || []) {
      if (e.tipo !== 'conjuros') continue;
      push(e.clave === 'magisferas' ? 'Magisferas' : f.def.nombre, f.valores[e.clave], { clave: e.clave });
    }
  }
  for (const hh of pj.heroicas) {
    const d = get(db, 'habilidades_heroicas', hh.id);
    if (d && d.otorga_conjuros) push(d.nombre, d.otorga_conjuros);
  }
  return grupos;
}

/** Opciones elegidas (arcanos, danzas, símbolos...) agrupadas. */
export function opcionesElegidas(pj, db) {
  const grupos = [];
  for (const f of fuentesElecciones(pj, db)) {
    for (const e of f.def.elecciones || []) {
      if (e.tipo !== 'opciones') continue;
      const ops = (f.valores[e.clave] || []).map((id) => get(db, 'opciones', id) || { id, nombre: id, _faltante: true });
      if (ops.length) grupos.push({ origen: f.def.nombre, etiqueta: e.etiqueta, opciones: ops });
    }
  }
  return grupos;
}

// --------------------------------------------------------------- heroicas
export function cumpleRequisitos(req, pj, db) {
  if (!req) return { ok: true, motivos: [] };
  const motivos = [];
  const dom = clasesDominadas(pj);
  if (req.dominar) {
    const n = req.dominar.n || 1;
    const lista = req.dominar.clases || [];
    const cuenta = lista.length ? lista.filter((c) => dom.includes(c)).length : dom.length;
    if (cuenta < n) motivos.push(lista.length ? `Dominar ${n > 1 ? n + ' de: ' : ''}${lista.map((c) => (get(db, 'clases', c) || { nombre: c }).nombre).join(', ')}` : 'Dominar una clase');
  }
  for (const h of req.habilidades || []) if (!tieneHabilidad(pj, h)) motivos.push(`Habilidad ${(hab(db, h) || { nombre: h }).nombre}`);
  if (req.nivel_min && pj.nivel < req.nivel_min) motivos.push(`Nivel ${req.nivel_min}+`);
  if (req.tema && (pj.identidad.tema || '').toLowerCase() !== req.tema.toLowerCase()) motivos.push(`Tema: ${req.tema}`);
  return { ok: motivos.length === 0, motivos };
}

export function heroicasElegibles(pj, db, { ignorarPropias = false } = {}) {
  return db.col.habilidades_heroicas.map((h) => {
    const veces = pj.heroicas.filter((x) => x.id === h.id).length;
    const max = h.max_veces || 1;
    const r = cumpleRequisitos(h.requisitos, pj, db);
    const repetida = !ignorarPropias && veces >= max;
    return { def: h, ok: r.ok && !repetida, motivos: repetida ? ['Ya adquirida'] : r.motivos };
  });
}

// --------------------------------------------------------------- vínculos
const OPUESTA = { admiracion: 'inferioridad', inferioridad: 'admiracion', lealtad: 'desconfianza', desconfianza: 'lealtad', afecto: 'odio', odio: 'afecto' };
export const opuesta = (e) => OPUESTA[e];

// --------------------------------------------------------------- validación
/**
 * Valida el personaje. Devuelve [{ nivel: 'error'|'aviso', ambito, msg }].
 * En modo libre los errores se degradan a avisos.
 */
export function validar(pj, db, dbTodo = db) {
  const out = [];
  const err = (ambito, msg) => out.push({ nivel: 'error', ambito, msg });
  const aviso = (ambito, msg) => out.push({ nivel: 'aviso', ambito, msg });
  const creando = !pj.creacion_completa;
  const nivelIni = param(db, 'nivel_inicial', 5);

  // Identidad
  if (!pj.identidad.nombre.trim()) aviso('identidad', 'Falta el nombre.');
  if (!pj.identidad.identidad.trim()) aviso('identidad', 'Falta la Identidad.');
  if (!pj.identidad.tema.trim()) aviso('identidad', 'Falta el Tema.');
  if (!pj.identidad.origen.trim()) aviso('identidad', 'Falta el Origen.');

  // Clases
  const asignados = nivelesAsignados(pj);
  if (creando && pj.nivel !== nivelIni) err('clases', `Un personaje nuevo empieza en nivel ${nivelIni}.`);
  if (asignados !== pj.nivel) err('clases', `Niveles de clase asignados: ${asignados} de ${pj.nivel}.`);
  if (creando) {
    const min = param(db, 'clases_iniciales_min', 2), max = param(db, 'clases_iniciales_max', 3);
    if (pj.clases.length < min || pj.clases.length > max) err('clases', `Al crear el personaje debes repartir los niveles entre ${min} y ${max} clases.`);
  }
  if (clasesNoDominadas(pj).length > param(db, 'clases_no_dominadas_max', 3)) err('clases', 'No puedes tener más de tres clases sin dominar.');
  for (const c of pj.clases) {
    const def = get(dbTodo, 'clases', c.id);
    if (!def) { err('clases', `Clase desconocida: ${c.id}.`); continue; }
    if (!get(db, 'clases', c.id)) aviso('clases', `${def.nombre} no está disponible con el filtro de contenido actual.`);
    const nv = nivelClase(c);
    if (nv > 10) err('clases', `${def.nombre} supera el nivel 10.`);
    if (nv === 0) aviso('clases', `${def.nombre} no tiene niveles asignados.`);
    if (def.beneficios && def.beneficios.eleccion && !c.beneficio) err('clases', `${def.nombre}: elige su beneficio gratuito.`);
    for (const [hid, sl] of Object.entries(c.habilidades || {})) {
      const h = (def.habilidades || []).find((x) => x.id === hid);
      if (!h) { err('clases', `${def.nombre}: habilidad desconocida ${hid}.`); continue; }
      if (sl > h.sl_max) err('clases', `${h.nombre}: SL ${sl} supera el máximo (${h.sl_max}).`);
    }
  }

  // Elecciones
  for (const f of fuentesElecciones(pj, dbTodo)) {
    for (const e of f.def.elecciones || []) {
      if (e.requiere_opcion) {
        const tiene = Object.values(f.valores).some((v) => Array.isArray(v) && v.includes(e.requiere_opcion));
        if (!tiene) continue;
      }
      const v = f.valores[e.clave];
      const [min, max] = rangoEleccion(e, pj, f.sl);
      const n = Array.isArray(v) ? v.filter(Boolean).length : (v ? 1 : 0);
      const nombre = `${f.def.nombre} · ${e.etiqueta}`;
      if (e.tipo === 'texto' || e.tipo === 'texto_largo') { if (!v) aviso('elecciones', `${nombre}: sin completar.`); continue; }
      if (n < min) err('elecciones', `${nombre}: elegidos ${n} de ${min}.`);
      if (n > max) err('elecciones', `${nombre}: elegidos ${n}, máximo ${max}.`);
      if (Array.isArray(v) && e.tipo === 'opciones') {
        for (const id of v) {
          const o = get(dbTodo, 'opciones', id);
          if (o && o.requiere && !o.requiere.every((r) => v.includes(r))) err('elecciones', `${o.nombre} requiere ${o.requiere.map((r) => (get(dbTodo, 'opciones', r) || { nombre: r }).nombre).join(', ')}.`);
          if (o && !get(db, 'opciones', id)) aviso('elecciones', `${o.nombre} no está disponible con el filtro actual.`);
        }
        if (e.min_por_grupo) {
          for (const g of e.grupos) {
            const k = v.filter((id) => (get(dbTodo, 'opciones', id) || {}).grupo === g).length;
            if (k < e.min_por_grupo && n >= min) err('elecciones', `${nombre}: necesitas al menos ${e.min_por_grupo} de cada tipo.`);
          }
        }
      }
      if (Array.isArray(v) && e.tipo === 'conjuros' && e.misma_lista) {
        const listas = new Set(v.map((id) => (get(dbTodo, 'conjuros', id) || {}).lista));
        if (listas.size > 1) err('elecciones', `${nombre}: deben ser de la misma lista.`);
      }
    }
  }

  // Habilidades heroicas
  const dom = clasesDominadas(pj).length;
  if (pj.heroicas.length > dom) err('heroicas', `Tienes ${pj.heroicas.length} habilidades heroicas y ${dom} clases dominadas.`);
  pj.heroicas.forEach((hh) => {
    const d = get(dbTodo, 'habilidades_heroicas', hh.id);
    if (!d) { err('heroicas', `Habilidad heroica desconocida: ${hh.id}.`); return; }
    const r = cumpleRequisitos(d.requisitos, pj, dbTodo);
    if (!r.ok) err('heroicas', `${d.nombre}: no cumples ${r.motivos.join('; ')}.`);
    const veces = pj.heroicas.filter((x) => x.id === hh.id).length;
    if (veces > (d.max_veces || 1)) err('heroicas', `${d.nombre} repetida.`);
  });

  // Atributos
  const perfil = tabla(db, 'perfiles_atributos').find((p) => p.id === pj.atributos.perfil);
  if (!perfil) err('atributos', 'Elige un perfil de atributos.');
  else {
    const dados = ATR.map((a) => pj.atributos.base[a]).filter(Boolean).sort();
    const esperados = [...perfil.dados].sort();
    if (dados.length < 4) err('atributos', 'Asigna un dado a cada atributo.');
    else if (dados.join() !== esperados.join()) err('atributos', `Los dados no corresponden al perfil ${perfil.nombre}.`);
  }
  const umbrales = param(db, 'niveles_mejora_atributo', [20, 40]).filter((n) => pj.nivel >= n);
  if ((pj.atributos.mejoras || []).length < umbrales.length) err('atributos', `Te falta la mejora de atributo de nivel ${umbrales.slice((pj.atributos.mejoras || []).length).join(' y ')}.`);

  // Equipo
  const c = calcular(pj, dbTodo);
  const comp = new Set(c.competencias);
  for (const r of RANURAS) {
    const o = c.equipados[r];
    if (!o) continue;
    if (o._faltante) { err('equipo', `${o.nombre}: objeto no encontrado en la base de datos.`); continue; }
    if (o.marcial) {
      const need = o._col === 'armas' ? (o.alcance === 'cuerpo' ? 'armas_marciales_cuerpo' : 'armas_marciales_distancia')
        : o._col === 'armaduras' ? 'armaduras_marciales' : o._col === 'escudos' ? 'escudos_marciales' : null;
      if (need && !comp.has(need)) err('equipo', `${o.nombre} es marcial y no tienes la competencia necesaria.`);
    }
  }
  const mp = c.equipados.mano_principal, ms = c.equipados.mano_secundaria;
  if (mp && mp._col === 'armas' && mp.manos === 2 && ms && ms._uid !== mp._uid) err('equipo', `${mp.nombre} requiere las dos manos.`);
  if (ms && ms._col === 'armas' && ms.manos === 2 && (!mp || mp._uid !== ms._uid)) err('equipo', `${ms.nombre} requiere las dos manos.`);
  if (mp && mp._col === 'escudos' && !tieneHabilidad(pj, 'doble-escudo')) err('equipo', 'Solo puedes llevar un escudo en la mano principal con Doble escudo.');
  if (creando) {
    const gasto = pj.equipo.objetos.reduce((a, o) => a + (o.coste_pagado || 0), 0);
    const pres = param(db, 'presupuesto_inicial', 500);
    if (gasto > pres) err('equipo', `Has gastado ${gasto} z de ${pres} z.`);
    for (const o of pj.equipo.objetos) {
      const d = resolverObjeto(o, dbTodo);
      if (d && d.rareza === 'raro' && !o.origen) err('equipo', `${d.nombre}: el equipo inicial solo puede ser básico.`);
    }
  }

  // Vínculos
  const vmax = param(db, 'vinculos_max', 6);
  if (pj.vinculos.length > vmax) err('vinculos', `Máximo ${vmax} vínculos.`);
  pj.vinculos.forEach((v, i) => {
    const em = v.emociones || [];
    if (!v.hacia) aviso('vinculos', `Vínculo ${i + 1}: sin destinatario.`);
    if (!em.length) aviso('vinculos', `Vínculo con ${v.hacia || '…'}: sin emociones.`);
    if (em.some((e) => em.includes(OPUESTA[e]))) err('vinculos', `Vínculo con ${v.hacia}: emociones opuestas.`);
  });

  // Reglas opcionales
  const pec = pj.opcionales.peculiaridad;
  if (pec) {
    const d = get(dbTodo, 'peculiaridades', pec.id);
    if (!get(db, 'peculiaridades', pec.id)) aviso('opcionales', 'La peculiaridad no está activa en el filtro de contenido.');
    if (d && d.requisitos) { const r = cumpleRequisitos(d.requisitos, pj, dbTodo); if (!r.ok) err('opcionales', `${d.nombre}: ${r.motivos.join('; ')}.`); }
  }

  if (pj.modo_libre) out.forEach((x) => { if (x.nivel === 'error') x.nivel = 'aviso'; });
  return out;
}

// --------------------------------------------------------------- progreso
/**
 * Sube un nivel. paso = { clase, habilidad, heroica?, atributo? }.
 * Devuelve { ok, errores }. Muta pj si ok.
 */
export function subirNivel(pj, paso, db) {
  const errores = [];
  const libre = pj.modo_libre;
  const nmax = param(db, 'nivel_max', 50);
  const pxNivel = param(db, 'px_por_nivel', 10);
  const nuevo = pj.nivel + 1;
  if (nuevo > nmax) errores.push(`El nivel máximo es ${nmax}.`);
  if (!libre && pj.px < pxNivel) errores.push(`Necesitas ${pxNivel} PX (tienes ${pj.px}).`);
  const defC = get(db, 'clases', paso.clase);
  if (!defC) errores.push('Elige una clase.');
  let c = pj.clases.find((x) => x.id === paso.clase);
  if (defC && !c) {
    if (clasesNoDominadas(pj).length >= param(db, 'clases_no_dominadas_max', 3) && !libre) errores.push('Ya tienes tres clases sin dominar.');
  }
  const h = defC && (defC.habilidades || []).find((x) => x.id === paso.habilidad);
  if (defC && !h) errores.push('Elige una habilidad de la clase.');
  const slAct = c ? ((c.habilidades || {})[paso.habilidad] || 0) : 0;
  if (h && slAct + 1 > h.sl_max) errores.push(`${h.nombre} ya está al máximo.`);
  const nvClase = c ? nivelClase(c) : 0;
  if (nvClase >= 10) errores.push('Esa clase ya está dominada.');
  const domina = nvClase + 1 === 10;
  if (domina && !paso.heroica && !libre) errores.push('Al dominar la clase eliges una habilidad heroica.');
  const umbrales = param(db, 'niveles_mejora_atributo', [20, 40]);
  if (umbrales.includes(nuevo) && !paso.atributo && !libre) errores.push(`Al llegar a nivel ${nuevo} mejoras un atributo.`);
  if (paso.atributo) {
    if (!ATR.includes(paso.atributo)) errores.push(`Atributo no válido: ${paso.atributo}.`);
    else {
      let val = pj.atributos.base[paso.atributo] || 0;
      for (const m of pj.atributos.mejoras || []) {
        if (m && m.atributo === paso.atributo) val = subirDado(val);
      }
      if (val >= 12) errores.push(`${ATR_NOMBRE[paso.atributo] || paso.atributo} ya está en d12 (máximo).`);
    }
  }
  if (errores.length) return { ok: false, errores };

  if (!c) { c = { id: paso.clase, habilidades: {}, beneficio: null }; pj.clases.push(c); }
  c.habilidades[paso.habilidad] = slAct + 1;
  const pxGastados = pj.px >= pxNivel ? pxNivel : 0;
  pj.px -= pxGastados;
  pj.nivel = nuevo;
  let heroicaIndice = null;
  if (paso.heroica) { pj.heroicas.push({ id: paso.heroica, elecciones: {} }); heroicaIndice = pj.heroicas.length - 1; }
  if (paso.atributo) pj.atributos.mejoras.push({ nivel: nuevo, atributo: paso.atributo });

  const hist = {
    nivel: nuevo, clase: paso.clase, habilidad: paso.habilidad, nueva_clase: nvClase === 0,
    heroica: paso.heroica || null, atributo: paso.atributo || null, px_gastados: pxGastados, fecha: new Date().toISOString()
  };
  if (paso.identidad && paso.identidad.trim() && paso.identidad.trim() !== pj.identidad.identidad) {
    hist.identidad_anterior = pj.identidad.identidad;
    pj.identidad.identidad = paso.identidad.trim();
  }
  if (paso.tema && paso.tema.trim() && paso.tema.trim() !== pj.identidad.tema) {
    hist.tema_anterior = pj.identidad.tema;
    pj.identidad.tema = paso.tema.trim();
  }
  pj.historial.push(hist);

  // Salud y mente: regla oficial del manual: "este incremento no altera los PV ni los PM actuales del personaje."
  return { ok: true, errores: [], heroicaIndice };
}

/** Deshace la última subida de nivel registrada en el historial. */
export function deshacerNivel(pj, db) {
  const ult = pj.historial.pop();
  if (!ult) return false;
  const c = pj.clases.find((x) => x.id === ult.clase);
  if (c) {
    c.habilidades[ult.habilidad] = Math.max(0, (c.habilidades[ult.habilidad] || 0) - 1);
    if (!c.habilidades[ult.habilidad]) delete c.habilidades[ult.habilidad];
    if (!nivelClase(c)) pj.clases = pj.clases.filter((x) => x !== c);
  }
  if (ult.heroica) {
    const i = pj.heroicas.map((x) => x.id).lastIndexOf(ult.heroica);
    if (i >= 0) pj.heroicas.splice(i, 1);
  }
  if (ult.atributo) {
    const i = pj.atributos.mejoras.findIndex((m) => m.nivel === ult.nivel);
    if (i >= 0) pj.atributos.mejoras.splice(i, 1);
  }
  if (ult.identidad_anterior !== undefined) pj.identidad.identidad = ult.identidad_anterior;
  if (ult.tema_anterior !== undefined) pj.identidad.tema = ult.tema_anterior;
  pj.nivel -= 1;
  pj.px += ult.px_gastados || 0;
  if (db) {
    const calc = calcular(pj, db);
    if (pj.estado.pv !== null && pj.estado.pv > calc.pv_max) pj.estado.pv = calc.pv_max;
    if (pj.estado.pm !== null && pj.estado.pm > calc.pm_max) pj.estado.pm = calc.pm_max;
  }
  return true;
}

// --------------------------------------------------------------- exportación
/** Copia lista para descargar, con un resumen calculado legible por humanos. */
export function exportar(pj, db) {
  const c = calcular(pj, db);
  const out = JSON.parse(JSON.stringify(pj));
  out.modificado = new Date().toISOString();
  out.calculado = {
    nota: 'Valores derivados en el momento de exportar. El visor los recalcula a partir de la base de datos.',
    pv_max: c.pv_max, pm_max: c.pm_max, pi_max: c.pi_max, crisis: c.crisis,
    def: c.def, mdef: c.mdef, init: c.init, atributos: c.actual,
    clases: pj.clases.map((x) => ({ id: x.id, nivel: nivelClase(x) }))
  };
  return out;
}

// --------------------------------------------------------------- formato
export const fmtPrecision = (p) => `【${p.atributos.join(' + ')}】${p.bonus ? (p.bonus > 0 ? ' +' : ' ') + p.bonus : ''}`;
export const fmtDano = (d, db) => {
  const t = tabla(db, 'tipos_dano').find((x) => x.id === d.tipo);
  return `【TM + ${d.bonus}】 ${t ? t.nombre.toLowerCase() : d.tipo}`;
};
export const fmtDado = (n) => (n ? 'd' + n : '—');
