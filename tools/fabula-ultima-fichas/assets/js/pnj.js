// ---------------------------------------------------------------------------
// Fichas de PNJ (enemigos y aliados controlados por el DJ).
// Módulo compartido por el navegador (vista de combate, panel) y el servidor
// (bot, API). Sin dependencias: no importes nada de Node ni del DOM.
//
// Formato de una ficha (plantilla). Ver docs/esquema-datos.md:
// {
//   formato: 'fabula-ultima-pnj', version: 1, id, nombre, descripcion,
//   nivel, rango: 'soldado'|'elite'|'campeon', rango_n, especie,
//   rasgos: [], atributos: { DES, PER, VIG, VOL }, pv, pm, iniciativa,
//   defensa, defensa_magica, afinidades: { tipo: 'VU'|'RS'|'IM'|'AS' },
//   ataques: [{ nombre, alcance, precision: [A, B], bonus, dano, tipo, contra, efecto }],
//   conjuros: [{ nombre, pm, por_objetivo, objetivo, duracion, ofensivo, precision, bonus, dano, tipo, efecto }],
//   otras_acciones: [{ nombre, efecto }], reglas: [{ nombre, efecto }],
//   equipo, notas,
//   revelado: 0|10|13|16   (lo gestiona el servidor: nivel del Estudio)
// }
// La imagen se guarda aparte (ver servidor/escena.js).
// ---------------------------------------------------------------------------

export const FORMATO_PNJ = 'fabula-ultima-pnj';
export const VERSION_PNJ = 1;
export const ATR = ['DES', 'PER', 'VIG', 'VOL'];

export const TIPOS_DANO = [
  ['fisico', 'Físico'], ['aire', 'Aire'], ['rayo', 'Rayo'], ['oscuro', 'Oscuro'], ['tierra', 'Tierra'],
  ['fuego', 'Fuego'], ['hielo', 'Hielo'], ['luz', 'Luz'], ['veneno', 'Veneno']
];
export const nombreTipoDano = (id) => ((TIPOS_DANO.find(([k]) => k === id) || [id, id || ''])[1]);

export const AFINIDADES = { VU: 'Vulnerable', RS: 'Resistente', IM: 'Inmune', AS: 'Absorbe' };
export const ESPECIES = [
  ['bestia', 'Bestia'], ['constructo', 'Constructo'], ['demonio', 'Demonio'], ['elemental', 'Elemental'],
  ['monstruo', 'Monstruo'], ['no-muerto', 'No muerto'], ['planta', 'Planta'], ['humanoide', 'Humanoide']
];
export const nombreEspecie = (id) => ((ESPECIES.find(([k]) => k === id) || [id, id || ''])[1]);
export const RANGOS = [['soldado', 'Soldado'], ['elite', 'Élite'], ['campeon', 'Campeón']];
export function nombreRango(t) {
  const n = (RANGOS.find(([k]) => k === t.rango) || [t.rango, t.rango || ''])[1];
  return t.rango === 'campeon' && t.rango_n ? `${n} (${t.rango_n})` : n;
}

export const ESTADOS = [
  ['confundido', 'Confundido'], ['debil', 'Débil'], ['enfurecido', 'Enfurecido'],
  ['envenenado', 'Envenenado'], ['estremecido', 'Estremecido'], ['lento', 'Lento']
];
export const nombreEstado = (id) => ((ESTADOS.find(([k]) => k === id) || [id, id])[1]);
const REDUCE = { lento: ['DES'], confundido: ['PER'], debil: ['VIG'], estremecido: ['VOL'], enfurecido: ['DES', 'PER'], envenenado: ['VIG', 'VOL'] };

/** Niveles de la acción de Estudio y lo que revela cada uno. */
export const NIVELES_ESTUDIO = [
  [0, 'Nada'],
  [10, '10+ · rango, especie, PV y PM'],
  [13, '13+ · y rasgos, atributos, defensas, afinidades'],
  [16, '16+ · perfil completo']
];
export const nivelPorResultado = (total) => (total >= 16 ? 16 : total >= 13 ? 13 : total >= 10 ? 10 : 0);
const QUE_REVELA = { 10: 'rango, especie, PV y PM máximos', 13: 'rasgos, atributos, defensas y afinidades', 16: 'ataques, conjuros, otras acciones y reglas especiales' };
/** Qué se descubre al pasar de un nivel revelado a otro (por defecto, todo lo conocido). */
export function textoRevelado(hasta, desde = 0) {
  if (hasta >= 16 && desde === 0) return 'su perfil completo';
  const partes = [10, 13, 16].filter((n) => n > desde && n <= hasta).map((n) => QUE_REVELA[n]);
  return partes.join('; ') || 'nada';
}

// ------------------------------------------------------------------ utilidades
const txt = (v, max = 4000) => String(v ?? '').trim().slice(0, max);
const ent = (v, def = 0, min = -999, max = 9999) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const dado = (v) => {
  const n = Number(String(v ?? '').replace(/^d/i, ''));
  return [6, 8, 10, 12].includes(n) ? n : null;
};
export const slug = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const tipoValido = (t) => (TIPOS_DANO.some(([k]) => k === t) ? t : (t === 'sombra' ? 'oscuro' : 'fisico'));
const parAtr = (p, def) => {
  const l = (Array.isArray(p) ? p : String(p || '').split(/[+\s,]+/)).map((x) => String(x).toUpperCase()).filter((x) => ATR.includes(x));
  return l.length === 2 ? l : def;
};

/**
 * Valida y completa una ficha de PNJ (importada o editada a mano).
 * Lanza Error con un mensaje en castellano si no es válida.
 */
export function normalizarPnj(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('La ficha de PNJ debe ser un objeto JSON.');
  if (d.formato && d.formato !== FORMATO_PNJ) throw new Error(`«${d.nombre || 'Ficha'}» no es una ficha de PNJ (formato ${d.formato}).`);
  const nombre = txt(d.nombre, 80);
  if (!nombre) throw new Error('La ficha de PNJ necesita un nombre.');
  const atributos = {};
  for (const a of ATR) {
    atributos[a] = dado((d.atributos || {})[a]);
    if (!atributos[a]) throw new Error(`«${nombre}»: el atributo ${a} debe ser d6, d8, d10 o d12.`);
  }
  const pv = ent(d.pv, 0, 1, 99999);
  if (!pv) throw new Error(`«${nombre}»: indica sus PV máximos.`);
  const afinidades = {};
  for (const [k, v] of Object.entries(d.afinidades || {})) {
    const t = tipoValido(k);
    const a = String(v || '').toUpperCase();
    if (AFINIDADES[a]) afinidades[t] = a;
  }
  const rango = RANGOS.some(([k]) => k === d.rango) ? d.rango : 'soldado';
  return {
    formato: FORMATO_PNJ,
    version: VERSION_PNJ,
    id: slug(d.id) || slug(nombre) || 'pnj',
    nombre,
    descripcion: txt(d.descripcion, 600),
    nivel: ent(d.nivel, 5, 1, 99),
    rango,
    rango_n: rango === 'campeon' ? ent(d.rango_n, 2, 2, 9) : null,
    especie: ESPECIES.some(([k]) => k === d.especie) ? d.especie : (slug(d.especie) || 'monstruo'),
    rasgos: (Array.isArray(d.rasgos) ? d.rasgos : String(d.rasgos || '').split(',')).map((x) => txt(x, 40)).filter(Boolean).slice(0, 8),
    atributos,
    pv,
    pm: ent(d.pm, 0, 0, 99999),
    iniciativa: ent(d.iniciativa, 0, -20, 99),
    defensa: ent(d.defensa, atributos.DES, 0, 99),
    defensa_magica: ent(d.defensa_magica, atributos.PER, 0, 99),
    afinidades,
    ataques: (d.ataques || []).filter((a) => a && a.nombre).slice(0, 12).map((a) => ({
      nombre: txt(a.nombre, 60),
      alcance: a.alcance === 'distancia' ? 'distancia' : 'cuerpo',
      precision: parAtr(a.precision, ['DES', 'VIG']),
      bonus: ent(a.bonus, 0, -20, 40),
      dano: ent(a.dano, 5, 0, 999),
      tipo: tipoValido(a.tipo),
      contra: a.contra === 'mdef' ? 'mdef' : 'def',
      efecto: txt(a.efecto, 600)
    })),
    conjuros: (d.conjuros || []).filter((c) => c && c.nombre).slice(0, 12).map((c) => ({
      nombre: txt(c.nombre, 60),
      pm: ent(c.pm, 0, 0, 999),
      por_objetivo: !!c.por_objetivo,
      objetivo: txt(c.objetivo, 60),
      duracion: txt(c.duracion, 40),
      ofensivo: !!c.ofensivo,
      precision: parAtr(c.precision, ['PER', 'VOL']),
      bonus: ent(c.bonus, 0, -20, 40),
      dano: c.dano === null || c.dano === undefined || c.dano === '' ? null : ent(c.dano, 0, 0, 999),
      tipo: c.tipo ? tipoValido(c.tipo) : null,
      efecto: txt(c.efecto, 1200)
    })),
    otras_acciones: (d.otras_acciones || []).filter((x) => x && x.nombre).slice(0, 12).map((x) => ({ nombre: txt(x.nombre, 60), efecto: txt(x.efecto, 1200) })),
    reglas: (d.reglas || []).filter((x) => x && x.nombre).slice(0, 12).map((x) => ({ nombre: txt(x.nombre, 60), efecto: txt(x.efecto, 1200) })),
    equipo: txt(d.equipo, 300),
    notas: txt(d.notas, 4000),
    revelado: [0, 10, 13, 16].includes(Number(d.revelado)) ? Number(d.revelado) : 0
  };
}

/** Copia para exportar (sin los campos que gestiona la partida). */
export function exportarPnj(t) {
  const out = { ...t };
  delete out.revelado;
  return out;
}

export const crisisPnj = (t) => Math.floor((t.pv || 0) / 2);

/** Dados actuales tras los estados alterados (mínimo d6). */
export function dadosPnj(t, estados = []) {
  const d = { ...t.atributos };
  for (const s of estados || []) for (const a of REDUCE[s] || []) if (d[a]) d[a] = Math.max(6, d[a] - 2);
  return d;
}

/**
 * Daño tras afinidades. Devuelve { final, afinidad, cura }.
 * final es lo que pierde (o, si cura, lo que recupera).
 */
export function aplicarAfinidad(t, cantidad, tipo, { ignoraResistencia = false } = {}) {
  const base = Math.max(0, Math.round(Number(cantidad) || 0));
  let af = (t && t.afinidades && t.afinidades[tipoValido(tipo)]) || null;
  if (af === 'RS' && ignoraResistencia) af = null;
  switch (af) {
    case 'VU': return { final: base * 2, afinidad: af, cura: false };
    case 'RS': return { final: Math.floor(base / 2), afinidad: af, cura: false };
    case 'IM': return { final: 0, afinidad: af, cura: false };
    case 'AS': return { final: base, afinidad: af, cura: true };
    default: return { final: base, afinidad: null, cura: false };
  }
}

/** Coste en PM de un conjuro de PNJ. */
export const costePnj = (c, objetivos = 1) => (c.por_objetivo ? c.pm * Math.max(1, objetivos) : c.pm);

// ------------------------------------------------------------------ textos
export const fmtPrecisionPnj = (p, bonus) => `【${p.join(' + ')}】${bonus ? (bonus > 0 ? ' +' : ' ') + bonus : ''}`;
export function textoAtaque(a) {
  return `${a.alcance === 'distancia' ? '🏹' : '⚔'} ${fmtPrecisionPnj(a.precision, a.bonus)} · 【TM + ${a.dano}】 ${nombreTipoDano(a.tipo).toLowerCase()}${a.contra === 'mdef' ? ' · contra D. Mág' : ''}`;
}
export function metaConjuroPnj(c) {
  return [c.pm ? `${c.pm}${c.por_objetivo ? ' × obj.' : ''} PM` : '', c.objetivo, c.duracion,
    c.ofensivo ? `Ofensivo ${fmtPrecisionPnj(c.precision, c.bonus)}` : ''].filter(Boolean).join(' · ');
}
export function textoAfinidades(t) {
  const l = TIPOS_DANO.filter(([k]) => t.afinidades && t.afinidades[k]).map(([k, n]) => `${n} ${t.afinidades[k]}`);
  return l.length ? l.join(' · ') : 'Sin afinidades';
}

/**
 * Lo que pueden ver los jugadores de una plantilla según el nivel revelado.
 * Nivel 0: nada (solo nombre e imagen, que van aparte).
 */
export function vistaRevelada(t, nivel = t.revelado || 0) {
  const v = { revelado: nivel };
  if (nivel >= 10) Object.assign(v, { rango: t.rango, rango_n: t.rango_n, especie: t.especie, pv: t.pv, pm: t.pm });
  if (nivel >= 13) Object.assign(v, { rasgos: t.rasgos, atributos: t.atributos, defensa: t.defensa, defensa_magica: t.defensa_magica, afinidades: t.afinidades });
  if (nivel >= 16) Object.assign(v, { ataques: t.ataques, conjuros: t.conjuros, otras_acciones: t.otras_acciones, reglas: t.reglas });
  return v;
}

/** Plantilla vacía para crear una ficha nueva en el editor. */
export function pnjVacio() {
  return {
    formato: FORMATO_PNJ, version: VERSION_PNJ, id: '', nombre: 'Nuevo enemigo', descripcion: '',
    nivel: 5, rango: 'soldado', rango_n: null, especie: 'monstruo', rasgos: ['', '', '', ''],
    atributos: { DES: 8, PER: 8, VIG: 8, VOL: 8 }, pv: 50, pm: 45, iniciativa: 8, defensa: 8, defensa_magica: 8,
    afinidades: {},
    ataques: [{ nombre: 'Ataque', alcance: 'cuerpo', precision: ['DES', 'VIG'], bonus: 0, dano: 5, tipo: 'fisico', contra: 'def', efecto: '' }],
    conjuros: [], otras_acciones: [], reglas: [], equipo: '', notas: ''
  };
}
