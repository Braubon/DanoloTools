// ---------------------------------------------------------------------------
// Bot de Discord para Fabula Ultima: manejadores de comandos, botones y
// autocompletado. Cada comando de servidor/comandos.js tiene aquí su función.
// ---------------------------------------------------------------------------
import { get } from '../assets/js/db.js';
import { esSoloDj } from './comandos.js';
import { miembroEsDj, nombreUsuario } from './discord.js';
import * as P from './personajes.js';
import * as E from './escena.js';
import * as M from './motor.js';
import * as N from '../assets/js/pnj.js';
import * as Partidas from './partidas.js';

const { R } = M;
const COLOR = { normal: 0xd4b072, critico: 0x6fcf97, pifia: 0xe0727c, info: 0x6fa6dc, enemigo: 0xb07ad4 };
const EFIMERO = 64;

class Aviso extends Error {}

// ------------------------------------------------------------------ respuestas
const mensaje = (data, efimero = false) => ({ type: 4, data: { allowed_mentions: { parse: [] }, ...data, ...(efimero ? { flags: EFIMERO } : {}) } });
const texto = (content, efimero = false) => mensaje({ content }, efimero);
const actualizar = (data) => ({ type: 7, data: { allowed_mentions: { parse: [] }, ...data } });
const boton = (label, custom_id, style = 2) => ({ type: 2, style, label, custom_id });
const fila = (...botones) => ({ type: 1, components: botones.filter(Boolean) });
const filasBotones = (botones) => {
  const validos = (botones || []).filter(Boolean);
  const rows = [];
  for (let idx = 0; idx < validos.length && rows.length < 5; idx += 5) {
    rows.push(fila(...validos.slice(idx, idx + 5)));
  }
  return rows;
};
const signo = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '');

// ------------------------------------------------------------------ contexto
function opciones(i) {
  let lista = (i.data && i.data.options) || [];
  let sub = null;
  if (lista[0] && (lista[0].type === 1 || lista[0].type === 2)) { sub = lista[0].name; lista = lista[0].options || []; }
  const o = {};
  let enfocada = null;
  for (const x of lista) { o[x.name] = x.value; if (x.focused) enfocada = x; }
  return { o, sub, enfocada };
}

async function contexto(i, origen) {
  const u = (i.member && i.member.user) || i.user || {};
  const { o, sub, enfocada } = opciones(i);

  let pjId = o.personaje || null;
  if (!pjId && i.type === 3 && i.data && i.data.custom_id) {
    const parts = i.data.custom_id.split(':');
    if (['pm', 'ap'].includes(parts[0])) pjId = parts[1];
    else if (parts[0] === 'rr' && parts[2]) pjId = parts[2];
  }

  const memberRoles = (i.member && i.member.roles) || [];
  const partidaId = await Partidas.determinarPartida({
    channelId: i.channel_id,
    userId: u.id,
    memberRoles,
    pjId
  });
  const partida = await Partidas.obtener(partidaId);
  const esDjGlobal = i.guild_id ? await miembroEsDj(i.member, i.guild_id) : false;
  const rol = Partidas.rolEnPartida(partida, i.member ? { esDjGlobal, roles: memberRoles } : null);

  const ctx = {
    i, o, sub, enfocada, origen,
    user: { id: u.id, nombre: (i.member && i.member.nick) || nombreUsuario(u) },
    guild: i.guild_id,
    partidaId,
    partida,
    rol,
    dj: rol === 'dj',
    db: await M.baseDatos(),
    _todos: null
  };
  ctx.todos = async () => (ctx._todos || (ctx._todos = await P.listar(ctx.partidaId)));
  return ctx;
}

const urlVisor = (ctx, pj) => {
  const pParam = `partida=${encodeURIComponent(ctx.partidaId || 'principal')}`;
  return pj
    ? `${ctx.origen}/tools/fabula-ultima/ficha/index.html?${pParam}#${encodeURIComponent(pj.id)}`
    : `${ctx.origen}/tools/fabula-ultima/visor/index.html?${pParam}`;
};
const urlComandos = (ctx) => `${ctx.origen}/tools/fabula-ultima/comandos/index.html`;
const puedeEditar = (ctx, pj) => ctx.dj || (pj.discord && pj.discord.id === ctx.user.id);

/** Convierte un PNJ de la escena en una estructura compatible para tiradas. */
function convertirPnjAPj(inst, t) {
  return {
    id: inst.id,
    instId: inst.id,
    plantillaId: t.id,
    esPnj: true,
    inst,
    t,
    identidad: {
      nombre: inst.nombre,
      identidad: `${N.nombreRango(t)} · ${N.nombreEspecie(t.especie)}`,
      pronombres: ''
    },
    nivel: t.nivel,
    atributos: { base: t.atributos },
    estado: {
      pv: inst.pv,
      pm: inst.pm,
      estados: inst.estados || []
    },
    pf: inst.pu || 0,
    clases: [],
    calculado: {
      actual: t.atributos,
      init: t.iniciativa || 0,
      def: t.defensa || 0,
      mdef: t.defensa_magica || 0,
      crisis: N.crisisPnj(t),
      pv_max: t.pv,
      pm_max: t.pm,
      pi_max: 0,
      ataques: (t.ataques || []).map((a) => ({
        nombre: a.nombre,
        tipo: a.tipo,
        dano: a.dano,
        precision: a.precision,
        bonus: a.bonus
      }))
    }
  };
}

const calcPj = (pj, db) => (pj.esPnj ? pj.calculado : M.calc(pj, db));
const dadosPj = (pj, c) => (pj.esPnj ? N.dadosPnj(pj.t, pj.inst.estados) : M.dadosEfectivos(pj, c));

/** Busca el personaje indicado o el asignado al usuario. */
async function resolverPj(ctx, valor, { editar = false } = {}) {
  const todos = await ctx.todos();
  let pj;
  if (valor) {
    const n = P.norm(valor);
    pj = todos.find((p) => p.id === valor) || todos.find((p) => P.norm(M.nombre(p)) === n) || todos.find((p) => P.norm(M.nombre(p)).includes(n));
    if (!pj) {
      if (ctx.dj) {
        const c = await E.campo(ctx.partidaId);
        const inst = E.buscarInstancia(c, valor);
        if (inst) {
          const t = await E.plantilla(inst.plantilla);
          if (t) return convertirPnjAPj(inst, t);
        }
      }
      throw new Aviso(`No encuentro el personaje «${valor}».`);
    }
  } else {
    const mios = todos.filter((p) => p.discord && p.discord.id === ctx.user.id);
    if (mios.length > 1) throw new Aviso(`Llevas varios personajes (${mios.map(M.nombre).join(', ')}): indica cuál con la opción «personaje».`);
    pj = mios[0];
    if (!pj) throw new Aviso(ctx.dj ? 'Indica el personaje con la opción «personaje».' : 'No tienes personaje asignado. Pide al DJ que use /asignar.');
  }
  if (editar && !puedeEditar(ctx, pj)) throw new Aviso('Solo el DJ puede modificar personajes de otros jugadores.');
  return pj;
}

/** Busca uno o varios personajes (o "todos" / lista separada por comas). */
async function resolverPjs(ctx, valor, { editar = false } = {}) {
  const todos = await ctx.todos();
  if (!valor) {
    const pj = await resolverPj(ctx, valor, { editar });
    return pj ? [pj] : [];
  }
  const normVal = P.norm(String(valor).trim());
  if (normVal === 'todos' || normVal === 'all' || normVal === 'grupo') {
    if (!todos.length) throw new Aviso('No hay personajes en la partida.');
    if (editar && !ctx.dj) throw new Aviso('Solo el DJ puede modificar varios personajes a la vez.');
    return todos;
  }
  if (normVal === 'todos_enemigos' || normVal === 'enemigos') {
    if (!ctx.dj) throw new Aviso('Solo el DJ puede seleccionar a todos los enemigos.');
    const c = await E.campo(ctx.partidaId);
    if (!c.enemigos || !c.enemigos.length) throw new Aviso('No hay enemigos en el combate.');
    const res = [];
    for (const inst of c.enemigos) {
      const t = await E.plantilla(inst.plantilla);
      if (t) res.push(convertirPnjAPj(inst, t));
    }
    return res;
  }
  if (String(valor).includes(',') || String(valor).includes('+')) {
    const trozos = String(valor).split(/[,+]/).map((s) => s.trim()).filter(Boolean);
    const seleccionados = [];
    let campoCache = null;
    for (const t of trozos) {
      const nt = P.norm(t);
      if (nt === 'todos' || nt === 'all' || nt === 'grupo') {
        for (const p of todos) {
          if (!seleccionados.some((s) => s.id === p.id)) seleccionados.push(p);
        }
        continue;
      }
      if (nt === 'todos_enemigos' || nt === 'enemigos') {
        if (!campoCache) campoCache = await E.campo(ctx.partidaId);
        for (const inst of campoCache.enemigos || []) {
          const templ = await E.plantilla(inst.plantilla);
          if (templ && !seleccionados.some((s) => s.id === inst.id)) {
            seleccionados.push(convertirPnjAPj(inst, templ));
          }
        }
        continue;
      }
      const match = todos.find((p) => p.id === t) ||
                    todos.find((p) => P.norm(M.nombre(p)) === nt) ||
                    todos.find((p) => P.norm(M.nombre(p)).includes(nt));
      if (match) {
        if (!seleccionados.some((s) => s.id === match.id)) {
          if (editar && !puedeEditar(ctx, match)) throw new Aviso(`Solo el DJ puede modificar a ${M.nombre(match)}.`);
          seleccionados.push(match);
        }
        continue;
      }
      if (ctx.dj) {
        if (!campoCache) campoCache = await E.campo(ctx.partidaId);
        const inst = E.buscarInstancia(campoCache, t);
        if (inst) {
          const templ = await E.plantilla(inst.plantilla);
          if (templ && !seleccionados.some((s) => s.id === inst.id)) {
            seleccionados.push(convertirPnjAPj(inst, templ));
            continue;
          }
        }
      }
      throw new Aviso(`No encuentro «${t}».`);
    }
    if (!seleccionados.length) throw new Aviso('No se ha seleccionado ningún personaje o enemigo.');
    return seleccionados;
  }
  const pj = await resolverPj(ctx, valor, { editar });
  return [pj];
}

/** Personajes «del grupo»: los asignados a un jugador o, si no hay ninguno, todos. */
async function grupo(ctx) {
  const todos = await ctx.todos();
  const asignados = todos.filter((p) => p.discord && p.discord.id);
  return asignados.length ? asignados : todos;
}

// ------------------------------------------------------------------ pruebas
function embedPrueba({ titulo, r, etiquetas, extra = [], pie = '', color }) {
  const dados = `${etiquetas[0]} **${r.d1}**   ·   ${etiquetas[1]} **${r.d2}**${r.bono ? `   ·   ${signo(r.bono)}` : ''}`;
  const lineas = [dados, `**Total ${r.total}**   ·   Tirada mayor ${r.tm}`];
  if (r.dif !== null) lineas.push(r.exito ? `✅ Supera ND ${r.dif}` : `❌ No supera ND ${r.dif}`);
  if (r.critico) lineas.push('**¡Crítico!** Éxito automático y una oportunidad.');
  if (r.pifia) lineas.push('**Pifia.** Fallo automático y el DJ obtiene una oportunidad.');
  lineas.push(...extra);
  return { title: titulo, description: lineas.join('\n'), color: color || (r.critico ? COLOR.critico : r.pifia ? COLOR.pifia : COLOR.normal), footer: pie ? { text: pie } : undefined };
}

function resumenBufo(b) {
  const parts = [];
  if (b.def) parts.push(`${b.def > 0 ? '+' : ''}${b.def} DEF`);
  if (b.mdef) parts.push(`${b.mdef > 0 ? '+' : ''}${b.mdef} D.Mág`);
  if (b.dano) parts.push(`${b.dano > 0 ? '+' : ''}${b.dano} daño`);
  if (b.tipo_dano) parts.push(`tipo ${N.nombreTipoDano(b.tipo_dano).toLowerCase()}`);
  if (b.precision) parts.push(`${b.precision > 0 ? '+' : ''}${b.precision} prec.`);
  if (b.init) parts.push(`${b.init > 0 ? '+' : ''}${b.init} inic.`);
  if (b.pv_max) parts.push(`${b.pv_max > 0 ? '+' : ''}${b.pv_max} PV máx`);
  if (b.pm_max) parts.push(`${b.pm_max > 0 ? '+' : ''}${b.pm_max} PM máx`);
  if (b.atributos) {
    for (const [k, v] of Object.entries(b.atributos)) {
      if (v) parts.push(`${k} ${v > 0 ? '+' : ''}${v} paso${Math.abs(v) > 1 ? 's' : ''}`);
    }
  }
  if (b.afinidades) {
    for (const [k, v] of Object.entries(b.afinidades)) {
      if (v) parts.push(`${N.nombreTipoDano(k)} ${v}`);
    }
  }
  if (b.duracion) parts.push(`(${b.duracion})`);
  return parts.join(' · ') || 'Sin modificadores numéricos';
}

function notaEstados(pj, c, dados, atributos) {
  const red = [...new Set(atributos)].filter((a) => R.ATR.includes(a) && dados[a] < c.actual[a]);
  if (!red.length) return '';
  return 'Estados: ' + red.map((a) => `${a} d${c.actual[a]}→d${dados[a]}`).join(', ');
}

/** Si la tirada es pifia de un PJ, suma 1 PF. Devuelve la línea a mostrar. */
async function pifiaPf(pj, r, partidaId) {
  if (!pj || !r.pifia) return '';
  if (pj.esPnj) return '';
  pj.pf = (pj.pf || 0) + 1;
  await P.escribir(pj, partidaId);
  return `+1 Punto Fábula por la pifia (ahora ${pj.pf}).`;
}

const botonRepetir = (r, id) => (!r.critico && !r.pifia ? boton('Repetir (1 PF)', id) : null);

// --- tirada
async function hacerTirada(ctx, { a1, a2, bono, dif, pjValor }) {
  const necesitaPj = [a1, a2].some((a) => R.ATR.includes(a));
  let pjs = [];
  if (pjValor) {
    pjs = await resolverPjs(ctx, pjValor);
  } else if (necesitaPj) {
    pjs = [await resolverPj(ctx, undefined)];
  }

  if (!pjs.length) {
    const caras = (a) => Number(String(a).replace('d', ''));
    const r = M.prueba(caras(a1), caras(a2), bono, dif);
    const embed = embedPrueba({ titulo: `${ctx.user.nombre} · ${a1} + ${a2}`, r, etiquetas: [String(a1), String(a2)] });
    return { embeds: [embed], components: [] };
  }

  if (pjs.length === 1) {
    const pj = pjs[0];
    const c = calcPj(pj, ctx.db);
    const dados = dadosPj(pj, c);
    if (necesitaPj && [a1, a2].some((a) => R.ATR.includes(a) && !dados[a])) {
      throw new Aviso(`${M.nombre(pj)} no tiene atributos definidos.`);
    }
    const caras = (a) => (R.ATR.includes(a) ? dados[a] : Number(String(a).replace('d', '')));
    const r = M.prueba(caras(a1), caras(a2), bono, dif);
    const et = (a) => (R.ATR.includes(a) ? `${a} d${dados[a]}` : a);
    const extra = [await pifiaPf(pj, r, ctx.partidaId)].filter(Boolean);
    const embed = embedPrueba({
      titulo: `${M.nombre(pj)} · ${a1} + ${a2}`,
      r,
      etiquetas: [et(a1), et(a2)],
      extra,
      pie: pj.esPnj ? notaEstadosPnj(pj.t, dados, [a1, a2]) : notaEstados(pj, c, dados, [a1, a2]),
      color: pj.esPnj ? (r.critico ? COLOR.critico : r.pifia ? COLOR.pifia : COLOR.enemigo) : undefined
    });
    const rep = !pj.esPnj ? botonRepetir(r, `rr:t:${pj.id}:${a1}:${a2}:${bono || 0}:${dif ?? ''}`) : null;
    return { embeds: [embed], components: rep ? [fila(rep)] : [] };
  }

  const embeds = [];
  const botones = [];
  for (const pj of pjs.slice(0, 10)) {
    const c = calcPj(pj, ctx.db);
    const dados = dadosPj(pj, c);
    if (necesitaPj && [a1, a2].some((a) => R.ATR.includes(a) && !dados[a])) {
      throw new Aviso(`${M.nombre(pj)} no tiene atributos definidos.`);
    }
    const caras = (a) => (R.ATR.includes(a) ? dados[a] : Number(String(a).replace('d', '')));
    const r = M.prueba(caras(a1), caras(a2), bono, dif);
    const et = (a) => (R.ATR.includes(a) ? `${a} d${dados[a]}` : a);
    const extra = [await pifiaPf(pj, r, ctx.partidaId)].filter(Boolean);
    embeds.push(embedPrueba({
      titulo: `${M.nombre(pj)} · ${a1} + ${a2}`,
      r,
      etiquetas: [et(a1), et(a2)],
      extra,
      pie: pj.esPnj ? notaEstadosPnj(pj.t, dados, [a1, a2]) : notaEstados(pj, c, dados, [a1, a2]),
      color: pj.esPnj ? (r.critico ? COLOR.critico : r.pifia ? COLOR.pifia : COLOR.enemigo) : undefined
    }));
    if (!pj.esPnj && !r.critico && !r.pifia) {
      botones.push(boton(`Repetir ${M.nombre(pj)} (1 PF)`, `rr:t:${pj.id}:${a1}:${a2}:${bono || 0}:${dif ?? ''}`));
    }
  }
  return { embeds, components: filasBotones(botones) };
}

// --- ataque
async function hacerAtaque(ctx, { arma, bono, pjValor, objetivo }) {
  const pj = await resolverPj(ctx, pjValor);
  const c = M.calc(pj, ctx.db);
  const dados = M.dadosEfectivos(pj, c);
  let idx = 0;
  if (arma !== undefined && arma !== null && arma !== '') {
    idx = /^\d+$/.test(String(arma)) ? Number(arma) : c.ataques.findIndex((a) => P.norm(a.nombre).includes(P.norm(arma)));
    if (idx < 0 || !c.ataques[idx]) throw new Aviso(`${M.nombre(pj)} no tiene equipada el arma «${arma}».`);
  }
  const at = c.ataques[idx];
  const [x, y] = at.precision.atributos;
  if (!dados[x] || !dados[y]) throw new Aviso(`${M.nombre(pj)} no tiene atributos definidos.`);
  const r = M.prueba(dados[x], dados[y], (at.precision.bonus || 0) + (bono || 0));
  const extra = [];
  if (!r.pifia) extra.push(`Daño: TM ${r.tm} + ${at.dano.bonus} = **${r.tm + at.dano.bonus}** ${M.nombreTipo(ctx.db, at.dano.tipo)}`);
  const pf = await pifiaPf(pj, r, ctx.partidaId);
  if (pf) extra.push(pf);
  if (at.cualidad) extra.push(`*${at.cualidad.length > 180 ? at.cualidad.slice(0, 177) + '…' : at.cualidad}*`);
  let aplicado = null;
  if (objetivo) {
    const g = await golpearPnj(objetivo, r, 'def', r.pifia ? null : r.tm + at.dano.bonus, at.dano.tipo, ctx.partidaId);
    extra.push(...g.lineas);
    aplicado = g;
  }
  const embed = embedPrueba({
    titulo: `${M.nombre(pj)} ataca con ${at.nombre}${aplicado ? ` a ${aplicado.inst.nombre}` : ''}`, r, etiquetas: [`${x} d${dados[x]}`, `${y} d${dados[y]}`], extra,
    pie: [at.precision.bonus || bono ? `Incluye ${signo((at.precision.bonus || 0) + (bono || 0))} a la precisión` : '', notaEstados(pj, c, dados, [x, y])].filter(Boolean).join(' · ')
  });
  embed.description = embed.description.replace('**Total', '**Precisión');
  const rep = botonRepetir(r, `rr:a:${pj.id}:${idx}:${bono || 0}${aplicado ? `:${aplicado.inst.id}:${aplicado.delta}` : ''}`);
  const comps = [rep, aplicado ? botonEstado(aplicado.inst) : null].filter(Boolean);
  return { embeds: [embed], components: comps.length ? [fila(...comps)] : [] };
}

// --- PJ contra PNJ
/**
 * Resuelve un ataque o conjuro de un PJ contra un PNJ del campo: compara con
 * su defensa (sin mostrarla) y aplica el daño con sus afinidades.
 * Devuelve { inst, lineas, delta } (delta = cambio de PV aplicado, para deshacer).
 */
async function golpearPnj(valor, r, contra, dano, tipo, partidaId = 'principal') {
  const c = await E.campo(partidaId);
  const inst = E.buscarInstancia(c, valor);
  if (!inst) throw new Aviso(`No hay ningún PNJ «${valor}» en el campo.`);
  const t = await E.plantilla(inst.plantilla);
  if (!t) throw new Aviso('La ficha de ese PNJ ya no existe.');
  const st = N.statsEfectivasPnj(t, inst);
  const defensa = contra === 'mdef' ? st.mdef : st.def;
  const impacta = r.critico || (!r.pifia && r.total >= defensa);
  const lineas = [impacta ? `🎯 **Impacta a ${inst.nombre}**` : `❌ **Falla contra ${inst.nombre}**`];
  let delta = 0;
  if (impacta && dano !== null && dano !== undefined) {
    const d = E.danar(inst, t, dano, tipo);
    delta = d.despues - d.antes;
    lineas.push(lineaDanoPnj(inst, t, d, tipo));
    await E.guardarCampo(c, partidaId);
  }
  return { inst, lineas, delta };
}

function lineaDanoPnj(inst, t, d, tipo) {
  const tn = N.nombreTipoDano(tipo).toLowerCase();
  const af = { VU: ' · ¡Vulnerable!', RS: ' · Resiste', IM: ' · Inmune' }[d.res.afinidad] || '';
  let l = d.res.cura
    ? `🩸 **${inst.nombre}** absorbe el daño ${tipo === 'fisico' ? 'físico' : `de ${tn}`} y recupera **${d.res.final}** PV`
    : `💥 **${inst.nombre}** recibe **${d.res.final}** de daño ${tipo === 'fisico' ? 'físico' : `de ${tn}`}${af}`;
  l += ` · daño total recibido ${Math.max(0, t.pv - inst.pv)}`;
  if (d.cae) l += t.siguiente_fase ? `\n⚠️ **${inst.nombre} queda a 0 PV…**` : `\n💀 **${inst.nombre} cae.**`;
  return l;
}

/** Deshace un cambio de PV hecho a un PNJ (al repetir una tirada). */
async function deshacerPnj(instId, delta, partidaId = 'principal') {
  if (!delta) return;
  const c = await E.campo(partidaId);
  const inst = c.enemigos.find((i) => i.id === instId);
  if (!inst) return;
  const t = await E.plantilla(inst.plantilla);
  inst.pv = Math.max(0, Math.min(t ? t.pv : inst.pv - delta, inst.pv - delta));
  await E.guardarCampo(c, partidaId);
}

const botonEstado = (inst) => boton('Estado (DJ)', `ev:${inst.id}`);

// --- conjuro
function conjurosDe(pj, db) {
  const vistos = new Set();
  return R.conjurosConocidos(pj, db).flatMap((g) => g.conjuros).filter((cj) => !cj._faltante && !vistos.has(cj.id) && vistos.add(cj.id));
}

const TIPO_POR_NOMBRE = { fisico: 'fisico', aire: 'aire', rayo: 'rayo', oscuro: 'oscuro', sombra: 'oscuro', tierra: 'tierra', fuego: 'fuego', hielo: 'hielo', luz: 'luz', veneno: 'veneno' };

async function hacerConjuro(ctx, { conjuro, objetivos, bono, atributos, pjValor, objetivo }) {
  const pj = await resolverPj(ctx, pjValor);
  const lista = conjurosDe(pj, ctx.db);
  const cj = lista.find((x) => x.id === conjuro) || lista.find((x) => P.norm(x.nombre) === P.norm(conjuro)) || lista.find((x) => P.norm(x.nombre).includes(P.norm(conjuro)));
  if (!cj) throw new Aviso(`${M.nombre(pj)} no conoce el conjuro «${conjuro}».`);
  const c = M.calc(pj, ctx.db);
  const coste = M.costeConjuro(cj, objetivos || 1);
  const meta = [cj.pm ? `${cj.pm} PM` : '', cj.objetivo, cj.duracion, cj.ofensivo ? 'Ofensivo' : ''].filter(Boolean).join(' · ');
  const efecto = cj.efecto.length > 900 ? cj.efecto.slice(0, 897) + '…' : cj.efecto;
  const rec = M.recursos(pj, c);
  const botones = [];
  if (coste) botones.push(boton(`Gastar ${coste} PM`, `pm:${pj.id}:${coste}`, 1));
  let embed;
  if (cj.ofensivo) {
    const [x, y] = (atributos || 'PER+VOL').split('+');
    const dados = M.dadosEfectivos(pj, c);
    const r = M.prueba(dados[x], dados[y], (c.magia || 0) + (bono || 0));
    const extra = [];
    const f = M.formulaDano(cj);
    if (f !== null && !r.pifia && !objetivo) {
      const plus = c.dano_conjuros || 0;
      extra.push(`Daño: TM ${r.tm} + ${f}${plus ? ` + ${plus}` : ''} = **${r.tm + f + plus}** ${M.tipoDanoTexto(cj)}`.trim());
    }
    const pf = await pifiaPf(pj, r, ctx.partidaId);
    if (pf) extra.push(pf);
    let aplicado = null;
    if (objetivo) {
      const plus = c.dano_conjuros || 0;
      const tipo = TIPO_POR_NOMBRE[P.norm(M.tipoDanoTexto(cj))] || null;
      const dano = f !== null && tipo && !r.pifia ? r.tm + f + plus : null;
      aplicado = await golpearPnj(objetivo, r, 'mdef', dano, tipo, ctx.partidaId);
      extra.push(...aplicado.lineas);
    }
    extra.push(`Coste: ${coste !== null ? `**${coste} PM**` : cj.pm} · ${M.nombre(pj)} tiene ${rec.pm} PM`);
    embed = embedPrueba({ titulo: `${M.nombre(pj)} lanza ${cj.nombre}${aplicado ? ` sobre ${aplicado.inst.nombre}` : ''}`, r, etiquetas: [`${x} d${dados[x]}`, `${y} d${dados[y]}`], extra, pie: meta });
    embed.description = embed.description.replace('**Total', '**Magia');
    embed.fields = [{ name: 'Efecto', value: efecto }];
    const rep = botonRepetir(r, `rr:c:${pj.id}:${cj.id}:${objetivos || 1}:${bono || 0}:${atributos || 'PER+VOL'}${aplicado ? `:${aplicado.inst.id}:${aplicado.delta}` : ''}`);
    if (rep) botones.push(rep);
    if (aplicado) botones.push(botonEstado(aplicado.inst));
  } else {
    embed = {
      title: `${M.nombre(pj)} lanza ${cj.nombre}`, color: COLOR.info,
      description: `${efecto}\n\nCoste: ${coste !== null ? `**${coste} PM**` : cj.pm} · ${M.nombre(pj)} tiene ${rec.pm} PM`,
      footer: { text: meta }
    };
  }
  return { embeds: [embed], components: botones.length ? [fila(...botones)] : [] };
}


// --- estudio
async function hacerEstudio(ctx, { inst, t, pjValor, bono }) {
  const pj = await resolverPj(ctx, pjValor);
  const c = M.calc(pj, ctx.db);
  const dados = M.dadosEfectivos(pj, c);
  if (!dados.PER) throw new Aviso(`${M.nombre(pj)} no tiene atributos definidos.`);
  const r = M.prueba(dados.PER, dados.PER, bono || 0);
  const nivel = r.pifia ? 0 : N.nivelPorResultado(r.total);
  let tf = t;
  const extra = [];
  if (nivel > (t.revelado || 0)) {
    tf = await E.revelar(t.id, nivel);
    extra.push(`🔎 **Descubre:** ${N.textoRevelado(nivel, t.revelado || 0)}.`);
  } else if (nivel) extra.push('No descubre nada que el grupo no supiera.');
  else extra.push('No descubre nada.');
  const pf = await pifiaPf(pj, r, ctx.partidaId);
  if (pf) extra.push(pf);
  const embed = embedPrueba({ titulo: `${M.nombre(pj)} estudia a ${inst.nombre}`, r, etiquetas: [`PER d${dados.PER}`, `PER d${dados.PER}`], extra, pie: notaEstados(pj, c, dados, ['PER']) });
  const embeds = [embed];
  if (nivel > (t.revelado || 0)) embeds.push(embedRevelado(tf, tf.nombre));
  const rep = botonRepetir(r, `rr:e:${pj.id}:${inst.id}:${bono || 0}`);
  return { embeds, components: rep ? [fila(rep)] : [] };
}

// ------------------------------------------------------------------ ficha
function embedFicha(ctx, pj) {
  const db = ctx.db;
  const c = M.calc(pj, db);
  const rec = M.recursos(pj, c);
  const dados = M.dadosEfectivos(pj, c);
  const i = pj.identidad || {};
  const estados = (pj.estado && pj.estado.estados) || [];
  const linea = (k, act, max) => `${M.barra(act, max)}  **${act}** / ${max}`;
  const atr = R.ATR.map((a) => `${a} d${dados[a] || '—'}${dados[a] !== c.actual[a] ? ` (d${c.actual[a]})` : ''}`).join(' · ');
  const at = c.ataques[0];
  const fields = [
    { name: `PV${rec.pv <= c.crisis ? ' · En Crisis' : ''}`, value: linea('PV', rec.pv, c.pv_max), inline: false },
    { name: 'PM', value: linea('PM', rec.pm, c.pm_max), inline: false },
    { name: 'PI', value: linea('PI', rec.pi, c.pi_max), inline: false },
    { name: 'Defensas', value: `DEF **${c.def}** · D. Mág **${c.mdef}** · Inic. **${signo(c.init) || '0'}**`, inline: false },
    { name: 'Atributos', value: atr, inline: false },
    { name: 'Puntos', value: `PF **${pj.pf || 0}** · PX **${pj.px || 0}** · **${pj.zenit || 0}** z`, inline: false }
  ];
  if (at) fields.push({ name: 'Ataque', value: `${at.nombre}: 【${at.precision.atributos.join(' + ')}】${at.precision.bonus ? ' ' + signo(at.precision.bonus) : ''} · 【TM + ${at.dano.bonus}】 ${M.nombreTipo(db, at.dano.tipo)}`, inline: false });
  if (estados.length) fields.push({ name: 'Estados', value: estados.map((s) => M.nombreEstado(db, s)).join(', '), inline: false });
  return {
    title: M.nombre(pj),
    url: urlVisor(ctx, pj),
    description: [i.identidad, i.tema, `Nivel ${pj.nivel} · ${M.resumenClases(pj, db)}`].filter(Boolean).join('\n'),
    color: rec.pv <= c.crisis ? COLOR.pifia : COLOR.normal,
    fields,
    footer: { text: pj.discord && pj.discord.nombre ? `Jugador: ${pj.discord.nombre}` : 'Sin jugador asignado' }
  };
}

// --- recursos
async function cambiarRecurso(ctx, clave) {
  const valor = ctx.o.valor;
  const pj = await resolverPj(ctx, ctx.o.personaje, { editar: valor !== undefined });
  const c = M.calc(pj, ctx.db);
  const rec = M.recursos(pj, c);
  const max = { pv: c.pv_max, pm: c.pm_max, pi: c.pi_max, pf: null }[clave];
  const actual = clave === 'pf' ? (pj.pf || 0) : rec[clave];
  const etiqueta = clave.toUpperCase();
  if (valor === undefined) {
    const extra = clave === 'pv' ? (actual <= c.crisis ? ' · **En Crisis**' : ` · Crisis ≤ ${c.crisis}`) : '';
    return texto(`**${M.nombre(pj)}** · ${etiqueta} ${max !== null ? `${M.barra(actual, max)} **${actual}** / ${max}` : `**${actual}**`}${extra}`);
  }
  let nuevo;
  try { nuevo = M.aplicarValor(actual, valor, max); } catch (e) { throw new Aviso(e.message); }
  if (clave === 'pf') pj.pf = nuevo;
  else { pj.estado = pj.estado || {}; pj.estado[clave] = nuevo; }
  await P.escribir(pj, ctx.partidaId);
  const lineas = [`**${M.nombre(pj)}** · ${etiqueta} ${actual} → **${nuevo}**${max !== null ? ` / ${max}` : ''}${nuevo !== actual ? ` (${signo(nuevo - actual)})` : ''}`];
  if (clave === 'pv') {
    if (nuevo === 0) lineas.push('💀 **Cae a 0 PV.** Debe rendirse o sacrificarse.');
    else if (nuevo <= c.crisis && actual > c.crisis) lineas.push(`⚠️ **Entra en Crisis** (≤ ${c.crisis}).`);
    else if (nuevo > c.crisis && actual <= c.crisis) lineas.push('Sale de Crisis.');
  }
  return texto(lineas.join('\n'));
}

// ------------------------------------------------------------------ relojes
function dibujoReloj(r) {
  const llenas = Math.min(r.llenas, r.secciones);
  return `${'●'.repeat(llenas)}${'○'.repeat(r.secciones - llenas)}  ${llenas}/${r.secciones}`;
}
async function buscarReloj(nombre, partidaId = 'principal') {
  const r = await P.reloj(nombre, partidaId);
  if (r) return r;
  const todos = await P.relojes(partidaId);
  const n = P.norm(nombre);
  const enc = todos.find((x) => P.norm(x.nombre).includes(n));
  if (!enc) throw new Aviso(`No hay ningún reloj «${nombre}».`);
  return enc;
}

// ------------------------------------------------------------------ combate
async function textoCombate(ctx, cb) {
  if (!cb) return 'No hay ningún conflicto en curso. El DJ puede empezar uno con `/combate iniciar`.';
  const pjs = await grupo(ctx);
  const hechos = new Set(cb.actuados || []);
  const faltan = pjs.filter((p) => !hechos.has(p.id));
  const lineas = [`**Conflicto · ronda ${cb.ronda}** · empiezan ${cb.empieza === 'pj' ? 'los jugadores' : 'los enemigos'}`];
  lineas.push(pjs.map((p) => `${hechos.has(p.id) ? '✅' : '⬜'} ${M.nombre(p)}`).join('   '));
  const campo = await E.campo(ctx.partidaId);
  const enem = campo.enemigos.filter((i) => i.lado === 'enemigo');
  if (enem.length) lineas.push(`Enemigos: ${enem.map((i) => `${(cb.enemigos || []).some((n) => P.norm(n) === P.norm(i.nombre)) ? '✅' : '⬜'} ${i.nombre}${i.estados && i.estados.length ? ` (${i.estados.map(N.nombreEstado).join(', ').toLowerCase()})` : ''}`).join('   ')}`);
  else if ((cb.enemigos || []).length) lineas.push(`Enemigos que han actuado: ${cb.enemigos.join(', ')}`);
  if (!faltan.length) lineas.push('Todos los jugadores han actuado.');
  else if (cb.ultimo) lineas.push(`Siguiente turno: **${cb.ultimo === 'pj' ? 'enemigos' : 'jugadores'}**.`);
  else lineas.push(`Siguiente turno: **${cb.empieza === 'pj' ? 'jugadores' : 'enemigos'}**.`);
  return lineas.join('\n');
}


// ------------------------------------------------------------------ PNJ
/** Busca un PNJ del campo y su ficha. */
async function resolverPnj(valor, partidaId = 'principal') {
  const c = await E.campo(partidaId);
  const inst = E.buscarInstancia(c, valor);
  if (!inst) throw new Aviso(`No hay ningún PNJ «${valor}» en el campo.`);
  const t = await E.plantilla(inst.plantilla);
  if (!t) throw new Aviso('La ficha de ese PNJ ya no existe.');
  return { c, inst, t };
}

async function buscarPlantilla(valor) {
  const lista = await E.plantillas();
  const n = P.norm(valor);
  const t = lista.find((x) => x.id === valor) || lista.find((x) => P.norm(x.nombre) === n) || lista.find((x) => P.norm(x.nombre).includes(n));
  if (!t) throw new Aviso(`No hay ninguna ficha de PNJ «${valor}». Créala o impórtala en el panel del DJ.`);
  return t;
}

const etiquetaFila = (inst) => `${inst.fila === 'retaguardia' ? 'retaguardia' : 'vanguardia'} ${inst.lado === 'aliado' ? 'aliada' : 'enemiga'}`;

function notaEstadosPnj(t, dados, atributos) {
  const red = [...new Set(atributos)].filter((a) => dados[a] < t.atributos[a]);
  return red.length ? 'Estados: ' + red.map((a) => `${a} d${t.atributos[a]}→d${dados[a]}`).join(', ') : '';
}

/** Línea de estado del PNJ (solo para el DJ). */
function estadoPnjDj(inst, t) {
  const cr = N.crisisPnj(t);
  const est = (inst.estados || []).map(N.nombreEstado).join(', ');
  const extra = [t.villano ? `PU **${inst.pu || 0}** (${N.nombreVillano(t.villano).toLowerCase()})` : '', t.siguiente_fase ? `Siguiente fase: \`${t.siguiente_fase}\`${inst.pv === 0 ? ' → usa /enemigo fase' : ''}` : ''].filter(Boolean).join(' · ');
  return `**${inst.nombre}** · PV ${M.barra(inst.pv, t.pv)} **${inst.pv}** / ${t.pv}${inst.pv === 0 ? ' · **Caído**' : inst.pv <= cr ? ` · **En Crisis** (≤ ${cr})` : ` · Crisis ≤ ${cr}`}\nPM **${inst.pm}** / ${t.pm}${est ? ` · ${est}` : ''} · ${etiquetaFila(inst)}${extra ? `\n${extra}` : ''}`;
}

const recortar = (s, n = 1000) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Campos de embed con la información de una ficha de PNJ (completa o revelada). */
function camposPnj(t, v = t, { completo = false } = {}) {
  const f = [];
  const nivel = completo ? 16 : v.revelado || 0;
  if (nivel >= 10 || completo) f.push({ name: 'Perfil', value: `${completo ? `Nivel ${t.nivel} · ` : ''}${N.nombreRango(t)} · ${N.nombreEspecie(t.especie)}\nPV **${t.pv}** · PM **${t.pm}**${completo ? ` · Inic. ${t.iniciativa}` : ''}` });
  if (nivel >= 13) {
    f.push({ name: 'Atributos y defensas', value: `${N.ATR.map((a) => `${a} d${t.atributos[a]}`).join(' · ')}\nDEF **${t.defensa}** · D. Mág **${t.defensa_magica}**${t.rasgos.length ? `\nRasgos: ${t.rasgos.join(', ')}` : ''}` });
    f.push({ name: 'Afinidades', value: N.textoAfinidades(t) + ((t.inmunidades_estados || []).length ? `\nInmune a: ${t.inmunidades_estados.map(N.nombreEstado).join(', ').toLowerCase()}` : '') });
  }
  if (nivel >= 16) {
    if (t.ataques.length) f.push({ name: 'Ataques básicos', value: recortar(t.ataques.map((a) => `**${a.nombre}** ${N.textoAtaque(a)}${a.efecto ? ` — ${a.efecto}` : ''}`).join('\n')) });
    if (t.conjuros.length) f.push({ name: 'Conjuros', value: recortar(t.conjuros.map((c) => `**${c.nombre}** · ${N.metaConjuroPnj(c)} — ${c.efecto}`).join('\n')) });
    if (t.otras_acciones.length) f.push({ name: 'Otras acciones', value: recortar(t.otras_acciones.map((x) => `**${x.nombre}** — ${x.efecto}`).join('\n')) });
    const reglas = N.reglasVisibles(t);
    if (reglas.length) f.push({ name: 'Habilidades y reglas especiales', value: recortar(reglas.map((x) => `**${x.nombre}** — ${x.efecto}`).join('\n')) });
  }
  return f.slice(0, 10);
}

/** Embed público con lo que se ha revelado de una ficha. */
function embedRevelado(t, titulo) {
  const f = camposPnj(t, t);
  return { title: titulo, description: t.revelado ? `Se conoce: ${N.textoRevelado(t.revelado)}.` : 'No se conoce nada de su perfil.', color: COLOR.enemigo, fields: f };
}

/** Busca el PJ objetivo de un PNJ (por id o nombre). */
async function pjObjetivo(ctx, valor) {
  if (!valor) return null;
  const todos = await ctx.todos();
  const n = P.norm(valor);
  const pj = todos.find((p) => p.id === valor) || todos.find((p) => P.norm(M.nombre(p)) === n) || todos.find((p) => P.norm(M.nombre(p)).includes(n));
  if (!pj) throw new Aviso(`No encuentro el personaje «${valor}».`);
  return pj;
}

const botonAplicar = (pj, dano, tipo) => boton(`Aplicar ${dano} a ${M.nombre(pj)}`.slice(0, 80), `ap:${pj.id}:${dano}:${tipo || ''}`, 4);

const SUB_ENEMIGO = {
  async sacar(ctx) {
    const o = ctx.o;
    const t = await buscarPlantilla(o.plantilla);
    let nuevos;
    try { nuevos = await E.sacar(t, { cantidad: o.cantidad || 1, fila: o.fila, lado: o.lado, nombre: o.nombre }, ctx.partidaId); } catch (e) { throw new Aviso(e.message); }
    const lista = nuevos.map((i) => `**${i.nombre}**`).join(', ');
    const aliado = nuevos[0].lado === 'aliado';
    return texto(`${aliado ? '🤝' : '⚔️'} ${aliado ? `Se ${nuevos.length > 1 ? 'unen' : 'une'} al grupo` : `Entra${nuevos.length > 1 ? 'n' : ''} en escena`}: ${lista} (${etiquetaFila(nuevos[0])}). [Vista de combate](<${urlVisor(ctx)}>)`);
  },
  async retirar(ctx) {
    if (ctx.o.todos) {
      const n = await E.vaciar('enemigo', ctx.partidaId);
      return texto(n ? `Se retiran ${n} enemigo${n > 1 ? 's' : ''} del campo.` : 'No había enemigos en el campo.');
    }
    if (!ctx.o.enemigo) throw new Aviso('Indica el PNJ o usa todos:True.');
    const { inst } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
    await E.retirar(inst.id, ctx.partidaId);
    return texto(`**${inst.nombre}** sale del campo.`);
  },
  async daño(ctx) {
    const { c, inst, t } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
    const d = E.danar(inst, t, ctx.o.cantidad, ctx.o.tipo, { ignoraResistencia: !!ctx.o.ignora_resistencia });
    await E.guardarCampo(c, ctx.partidaId);
    return mensaje({ content: lineaDanoPnj(inst, t, d, ctx.o.tipo), components: [fila(botonEstado(inst))] });
  },
  async pv(ctx) { return recursoPnj(ctx, 'pv'); },
  async pm(ctx) { return recursoPnj(ctx, 'pm'); },
  async estado(ctx) {
    const { c, inst, t } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
    const { accion, estado } = ctx.o;
    const set = new Set(inst.estados || []);
    if (accion === 'limpiar') set.clear();
    else {
      if (!estado) throw new Aviso('Elige el estado.');
      if (accion === 'anadir' && N.inmuneA(t, estado)) return texto(`**${inst.nombre}** es inmune a ${N.nombreEstado(estado).toLowerCase()}.`);
      if (accion === 'anadir') set.add(estado); else set.delete(estado);
    }
    inst.estados = [...set];
    await E.guardarCampo(c, ctx.partidaId);
    const lista = inst.estados.map(N.nombreEstado).join(', ') || 'ninguno';
    const verbo = accion === 'limpiar' ? 'Estados eliminados' : `${N.nombreEstado(estado)} ${accion === 'anadir' ? 'añadido' : 'quitado'}`;
    return texto(`**${inst.nombre}** · ${verbo}. Estados: ${lista}.`);
  },
  async atacar(ctx) {
    const { inst, t } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
    const st = N.statsEfectivasPnj(t, inst);
    if (!st.ataques.length) throw new Aviso(`${t.nombre} no tiene ataques básicos en su ficha.`);
    let a = st.ataques[0];
    if (ctx.o.ataque !== undefined && ctx.o.ataque !== '') {
      a = /^\d+$/.test(String(ctx.o.ataque)) ? st.ataques[Number(ctx.o.ataque)] : st.ataques.find((x) => P.norm(x.nombre).includes(P.norm(ctx.o.ataque)));
      if (!a) throw new Aviso(`${t.nombre} no tiene el ataque «${ctx.o.ataque}».`);
    }
    const dados = st.dados;
    const [x, y] = a.precision;
    const r = M.prueba(dados[x], dados[y], a.bonus + (ctx.o.bono || 0));
    const dano = r.tm + a.dano;
    const extra = [];
    const botones = [];
    const pj = await pjObjetivo(ctx, ctx.o.objetivo);
    if (pj) {
      const c = M.calc(pj, ctx.db);
      const def = a.contra === 'mdef' ? c.mdef : c.def;
      const impacta = r.critico || (!r.pifia && r.total >= def);
      extra.push(impacta ? `🎯 **Impacta a ${M.nombre(pj)}** (${a.contra === 'mdef' ? 'D. Mág' : 'DEF'} ${def})` : `❌ **Falla contra ${M.nombre(pj)}** (${a.contra === 'mdef' ? 'D. Mág' : 'DEF'} ${def})`);
      if (impacta) botones.push(botonAplicar(pj, dano, a.tipo));
    }
    if (!r.pifia) extra.push(`Daño: TM ${r.tm} + ${a.dano} = **${dano}** ${N.nombreTipoDano(a.tipo).toLowerCase()}`);
    if (a.efecto) extra.push(`*${a.efecto}*`);
    const embed = embedPrueba({
      titulo: `${inst.nombre} · ${a.nombre}${pj ? ` contra ${M.nombre(pj)}` : ''}`, r, etiquetas: [`${x} d${dados[x]}`, `${y} d${dados[y]}`], extra,
      pie: [a.alcance === 'distancia' ? 'A distancia' : 'Cuerpo a cuerpo', a.contra === 'mdef' ? 'contra D. Mág' : '', notaEstadosPnj(t, dados, [x, y])].filter(Boolean).join(' · '),
      color: r.critico ? COLOR.critico : r.pifia ? COLOR.pifia : COLOR.enemigo
    });
    embed.description = embed.description.replace('**Total', '**Precisión');
    return mensaje({ embeds: [embed], components: botones.length ? [fila(...botones)] : [] });
  },
  async conjuro(ctx) {
    const { c: campo, inst, t } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
    const n = P.norm(ctx.o.conjuro);
    const cj = (/^\d+$/.test(String(ctx.o.conjuro)) ? t.conjuros[Number(ctx.o.conjuro)] : null) || t.conjuros.find((x) => P.norm(x.nombre) === n) || t.conjuros.find((x) => P.norm(x.nombre).includes(n));
    if (!cj) throw new Aviso(`${t.nombre} no tiene el conjuro «${ctx.o.conjuro}».`);
    const objetivos = [];
    for (const k of ['objetivo', 'objetivo2', 'objetivo3']) if (ctx.o[k]) objetivos.push(await pjObjetivo(ctx, ctx.o[k]));
    const coste = N.costePnj(cj, objetivos.length || 1);
    if (inst.pm < coste) throw new Aviso(`${inst.nombre} solo tiene ${inst.pm} PM y ${cj.nombre} cuesta ${coste}.`);
    inst.pm -= coste;
    await E.guardarCampo(campo, ctx.partidaId);
    const meta = N.metaConjuroPnj(cj);
    const botones = [];
    let embed;
    if (cj.ofensivo) {
      const dados = N.dadosPnj(t, inst.estados);
      const [x, y] = cj.precision;
      const r = M.prueba(dados[x], dados[y], cj.bonus + (ctx.o.bono || 0));
      const extra = [];
      const dano = cj.dano !== null && !r.pifia ? r.tm + cj.dano : null;
      if (dano !== null) extra.push(`Daño: TM ${r.tm} + ${cj.dano} = **${dano}**${cj.tipo ? ' ' + N.nombreTipoDano(cj.tipo).toLowerCase() : ''}`);
      for (const pj of objetivos) {
        const mdef = M.calc(pj, ctx.db).mdef;
        const impacta = r.critico || (!r.pifia && r.total >= mdef);
        extra.push(impacta ? `🎯 **Afecta a ${M.nombre(pj)}** (D. Mág ${mdef})` : `❌ **${M.nombre(pj)} lo evita** (D. Mág ${mdef})`);
        if (impacta && dano !== null) botones.push(botonAplicar(pj, dano, cj.tipo));
      }
      extra.push(`Coste: **${coste} PM**`);
      embed = embedPrueba({ titulo: `${inst.nombre} lanza ${cj.nombre}`, r, etiquetas: [`${x} d${dados[x]}`, `${y} d${dados[y]}`], extra, pie: [meta, notaEstadosPnj(t, dados, [x, y])].filter(Boolean).join(' · '), color: r.critico ? COLOR.critico : r.pifia ? COLOR.pifia : COLOR.enemigo });
      embed.description = embed.description.replace('**Total', '**Magia');
    } else {
      embed = { title: `${inst.nombre} lanza ${cj.nombre}`, color: COLOR.enemigo, description: `Coste: **${coste} PM**${objetivos.length ? ` · Sobre ${objetivos.map(M.nombre).join(', ')}` : ''}`, footer: { text: meta } };
    }
    embed.fields = [{ name: 'Efecto', value: recortar(cj.efecto || '—', 900) }];
    botones.push(botonEstado(inst));
    return mensaje({ embeds: [embed], components: [fila(...botones.slice(0, 5))] });
  },
  async tirada(ctx) {
    const { inst, t } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
    const { atributo1: a1, atributo2: a2 } = ctx.o;
    const dados = N.dadosPnj(t, inst.estados);
    const r = M.prueba(dados[a1], dados[a2], ctx.o.bono || 0, ctx.o.dificultad);
    const embed = embedPrueba({ titulo: `${inst.nombre} · ${a1} + ${a2}`, r, etiquetas: [`${a1} d${dados[a1]}`, `${a2} d${dados[a2]}`], pie: notaEstadosPnj(t, dados, [a1, a2]), color: r.critico ? COLOR.critico : r.pifia ? COLOR.pifia : COLOR.enemigo });
    return mensaje({ embeds: [embed] });
  },
  async pu(ctx) {
    const { c, inst, t } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
    if (!t.villano) throw new Aviso(`${t.nombre} no es un villano: márcalo como villano en su ficha para que tenga Puntos Última.`);
    const antes = inst.pu || 0;
    if (ctx.o.valor !== undefined) {
      try { inst.pu = M.aplicarValor(antes, ctx.o.valor, null); } catch (e) { throw new Aviso(e.message); }
      await E.guardarCampo(c, ctx.partidaId);
    }
    return texto(`**${inst.nombre}** · Puntos Última ${ctx.o.valor !== undefined ? `${antes} → ` : ''}**${inst.pu || 0}**`, true);
  },
  async fase(ctx) {
    const { c, inst, t } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
    if (!t.siguiente_fase) throw new Aviso(`${t.nombre} no tiene una fase siguiente en su ficha.`);
    const sig = await E.plantilla(t.siguiente_fase);
    if (!sig) throw new Aviso(`No existe la ficha de la fase siguiente («${t.siguiente_fase}»). Créala en el panel.`);
    const antes = inst.nombre;
    E.cambiarFase(inst, t, sig);
    await E.guardarCampo(c, ctx.partidaId);
    return mensaje({ content: `🔥 **${antes}** se transforma${inst.nombre !== antes ? `: **${inst.nombre}**` : ''}. ¡Comienza su siguiente fase!`, components: [fila(botonEstado(inst))] });
  },
  async ver(ctx) {
    const { inst, t } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
    const embed = {
      title: `${inst.nombre}${inst.nombre !== t.nombre ? ` · ${t.nombre}` : ''}`, url: urlVisor(ctx), color: COLOR.enemigo,
      description: [estadoPnjDj(inst, t), t.descripcion ? `*${t.descripcion}*` : '', `Revelado a los jugadores: ${N.NIVELES_ESTUDIO.find(([n]) => n === (t.revelado || 0))[1]}`].filter(Boolean).join('\n'),
      fields: camposPnj(t, t, { completo: true })
    };
    return mensaje({ embeds: [embed] }, true);
  }
};

async function recursoPnj(ctx, clave) {
  const { c, inst, t } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
  const max = t[clave];
  if (ctx.o.valor !== undefined) {
    const antes = inst[clave];
    try { inst[clave] = M.aplicarValor(antes, ctx.o.valor, max); } catch (e) { throw new Aviso(e.message); }
    await E.guardarCampo(c, ctx.partidaId);
    const x = clave === 'pv' ? E.cruces(antes, inst.pv, t) : {};
    const nota = x.cae ? ' · **Caído**' : x.entraCrisis ? ' · **Entra en Crisis**' : x.saleCrisis ? ' · Sale de Crisis' : '';
    return texto(`**${inst.nombre}** · ${clave.toUpperCase()} ${antes} → **${inst[clave]}** / ${max}${nota}`, true);
  }
  return texto(estadoPnjDj(inst, t), true);
}

// ------------------------------------------------------------------ comandos
const MANEJADORES = {
  async tirada(ctx) {
    const o = ctx.o;
    return mensaje(await hacerTirada(ctx, { a1: o.atributo1, a2: o.atributo2, bono: o.bono || 0, dif: o.dificultad, pjValor: o.personaje }));
  },
  async atacar(ctx) {
    return mensaje(await hacerAtaque(ctx, { arma: ctx.o.arma, bono: ctx.o.bono || 0, pjValor: ctx.o.personaje, objetivo: ctx.o.objetivo }));
  },
  async conjuro(ctx) {
    const o = ctx.o;
    return mensaje(await hacerConjuro(ctx, { conjuro: o.conjuro, objetivos: o.objetivos, bono: o.bono || 0, atributos: o.atributos, pjValor: o.personaje, objetivo: o.objetivo }));
  },
  async dados(ctx) {
    let r;
    try { r = M.tiradaLibre(ctx.o.expresion); } catch (e) { throw new Aviso(e.message); }
    return mensaje({ embeds: [{ title: `${ctx.user.nombre} · ${ctx.o.expresion}`, description: `${r.detalle}\n**Total ${r.total}**`, color: COLOR.normal }] });
  },
  async ficha(ctx) {
    const pjs = await resolverPjs(ctx, ctx.o.personaje);
    if (!pjs.length) throw new Aviso('No hay personajes.');
    if (pjs.length === 1) {
      const pj = pjs[0];
      if (pj.esPnj) {
        if (ctx.dj) {
          const f = camposPnj(pj.t, pj.t, { completo: true });
          return mensaje({ embeds: [{ title: `${pj.inst.nombre} (PNJ · Nivel ${pj.t.nivel})`, color: COLOR.enemigo, description: estadoPnjDj(pj.inst, pj.t), fields: f }] });
        }
        return mensaje({ embeds: [embedRevelado(pj.t, pj.inst.nombre)] });
      }
      return mensaje({ embeds: [embedFicha(ctx, pj)] });
    }
    return mensaje({ embeds: pjs.slice(0, 10).map((pj) => (pj.esPnj ? embedRevelado(pj.t, pj.inst.nombre) : embedFicha(ctx, pj))) });
  },
  pv: (ctx) => cambiarRecurso(ctx, 'pv'),
  pm: (ctx) => cambiarRecurso(ctx, 'pm'),
  pi: (ctx) => cambiarRecurso(ctx, 'pi'),
  pf: (ctx) => cambiarRecurso(ctx, 'pf'),
  async estado(ctx) {
    const { accion, estado } = ctx.o;
    const pj = await resolverPj(ctx, ctx.o.personaje, { editar: true });
    pj.estado = pj.estado || {};
    const set = new Set(pj.estado.estados || []);
    if (accion === 'limpiar') set.clear();
    else {
      if (!estado) throw new Aviso('Elige el estado.');
      if (accion === 'anadir') set.add(estado); else set.delete(estado);
    }
    pj.estado.estados = [...set];
    await P.escribir(pj, ctx.partidaId);
    const lista = pj.estado.estados.map((s) => M.nombreEstado(ctx.db, s)).join(', ') || 'ninguno';
    const verbo = accion === 'limpiar' ? 'Estados eliminados' : `${M.nombreEstado(ctx.db, estado)} ${accion === 'anadir' ? 'añadido' : 'quitado'}`;
    return texto(`**${M.nombre(pj)}** · ${verbo}. Estados: ${lista}.`);
  },
  async descanso(ctx) {
    let lista;
    if (ctx.o.todos) {
      if (!ctx.dj) throw new Aviso('Solo el DJ puede hacer descansar a todo el grupo.');
      lista = await grupo(ctx);
    } else lista = [await resolverPj(ctx, ctx.o.personaje, { editar: true })];
    for (const pj of lista) {
      const c = M.calc(pj, ctx.db);
      pj.estado = { ...(pj.estado || {}), pv: c.pv_max, pm: c.pm_max, estados: [] };
      await P.escribir(pj, ctx.partidaId);
    }
    return texto(`🛏️ Descanso: ${lista.map((p) => `**${M.nombre(p)}**`).join(', ')} ${lista.length > 1 ? 'recuperan' : 'recupera'} PV y PM y ${lista.length > 1 ? 'se libran' : 'se libra'} de los estados alterados.`);
  },
  async grupo(ctx) {
    const pjs = await ctx.todos();
    if (!pjs.length) return texto('Todavía no hay personajes guardados.', true);
    const fields = pjs.slice(0, 25).map((pj) => {
      const c = M.calc(pj, ctx.db);
      const r = M.recursos(pj, c);
      const est = ((pj.estado && pj.estado.estados) || []).map((s) => M.nombreEstado(ctx.db, s)).join(', ');
      return {
        name: `${M.nombre(pj)} · Nv ${pj.nivel}${r.pv <= c.crisis ? ' · Crisis' : ''}`,
        value: `PV **${r.pv}**/${c.pv_max} · PM **${r.pm}**/${c.pm_max} · PI **${r.pi}**/${c.pi_max}\nDEF ${c.def} · D.Mág ${c.mdef} · Inic. ${signo(c.init) || '0'} · PF ${pj.pf || 0}${est ? `\n${est}` : ''}`,
        inline: true
      };
    });
    return mensaje({ embeds: [{ title: 'Grupo', url: urlVisor(ctx), color: COLOR.normal, fields }] });
  },

  async reloj(ctx) {
    const { nombre, secciones, cantidad } = ctx.o;
    switch (ctx.sub) {
      case 'crear': {
        if (await P.reloj(nombre, ctx.partidaId)) throw new Aviso(`Ya existe el reloj «${nombre}».`);
        const r = { nombre: nombre.trim(), secciones, llenas: 0, creado: new Date().toISOString() };
        await P.guardarReloj(r, ctx.partidaId);
        return texto(`🕒 **${r.nombre}**\n${dibujoReloj(r)}`);
      }
      case 'avanzar':
      case 'retroceder': {
        const r = await buscarReloj(nombre, ctx.partidaId);
        const n = (cantidad || 1) * (ctx.sub === 'avanzar' ? 1 : -1);
        const antes = r.llenas;
        r.llenas = Math.max(0, Math.min(r.secciones, r.llenas + n));
        await P.guardarReloj(r, ctx.partidaId);
        const completo = r.llenas >= r.secciones && antes < r.secciones;
        return texto(`🕒 **${r.nombre}** ${signo(r.llenas - antes) || '±0'}\n${dibujoReloj(r)}${completo ? '\n**¡Reloj completo!**' : ''}`);
      }
      case 'ver': {
        const lista = nombre ? [await buscarReloj(nombre, ctx.partidaId)] : await P.relojes(ctx.partidaId);
        if (!lista.length) return texto('No hay relojes activos.', true);
        return texto(lista.map((r) => `🕒 **${r.nombre}**\n${dibujoReloj(r)}`).join('\n\n'));
      }
      case 'borrar': {
        const r = await buscarReloj(nombre, ctx.partidaId);
        await P.borrarReloj(r.nombre, ctx.partidaId);
        return texto(`Reloj **${r.nombre}** eliminado.`);
      }
      default: throw new Aviso('Subcomando desconocido.');
    }
  },

  async iniciativa(ctx) {
    const { dificultad, bono } = ctx.o;
    if (ctx.o.personaje) {
      const pjs = await resolverPjs(ctx, ctx.o.personaje);
      if (!pjs.length) throw new Aviso('No hay personajes.');
      if (pjs.length === 1) {
        const pj = pjs[0];
        const c = calcPj(pj, ctx.db);
        const dados = dadosPj(pj, c);
        const r = M.prueba(dados.DES, dados.PER, c.init + (bono || 0), dificultad);
        const extra = [r.exito ? (pj.esPnj ? '**Empiezan los enemigos.**' : '**Los jugadores eligen quién empieza.**') : (pj.esPnj ? '**Los jugadores eligen quién empieza.**' : '**Empiezan los enemigos.**')];
        const pf = await pifiaPf(pj, r, ctx.partidaId);
        if (pf) extra.push(pf);
        const embed = embedPrueba({
          titulo: `Iniciativa · ${M.nombre(pj)}`, r, etiquetas: [`DES d${dados.DES}`, `PER d${dados.PER}`], extra,
          pie: [
            `Inic. ${signo(c.init) || '0'}${bono ? ` · bono ${signo(bono)}` : ''}`,
            pj.esPnj ? notaEstadosPnj(pj.t, dados, ['DES', 'PER']) : notaEstados(pj, c, dados, ['DES', 'PER'])
          ].filter(Boolean).join(' · '),
          color: pj.esPnj ? (r.critico ? COLOR.critico : r.pifia ? COLOR.pifia : COLOR.enemigo) : undefined
        });
        const rep = !pj.esPnj ? botonRepetir(r, `rr:t:${pj.id}:DES:PER:${(c.init + (bono || 0))}:${dificultad ?? ''}`) : null;
        return mensaje({ embeds: [embed], components: rep ? [fila(rep)] : [] });
      }

      const embeds = [];
      const botones = [];
      for (const pj of pjs.slice(0, 10)) {
        const c = calcPj(pj, ctx.db);
        const dados = dadosPj(pj, c);
        const r = M.prueba(dados.DES, dados.PER, c.init + (bono || 0), dificultad);
        const extra = [r.exito ? (pj.esPnj ? '✅ **Supera la iniciativa (empiezan enemigos)**' : '✅ **Supera la iniciativa**') : '❌ **No supera la iniciativa**'];
        const pf = await pifiaPf(pj, r, ctx.partidaId);
        if (pf) extra.push(pf);
        const pie = [
          `Inic. ${signo(c.init) || '0'}${bono ? ` · bono ${signo(bono)}` : ''}`,
          pj.esPnj ? notaEstadosPnj(pj.t, dados, ['DES', 'PER']) : notaEstados(pj, c, dados, ['DES', 'PER'])
        ].filter(Boolean).join(' · ');
        embeds.push(embedPrueba({
          titulo: `Iniciativa · ${M.nombre(pj)}`,
          r,
          etiquetas: [`DES d${dados.DES}`, `PER d${dados.PER}`],
          extra,
          pie,
          color: pj.esPnj ? (r.critico ? COLOR.critico : r.pifia ? COLOR.pifia : COLOR.enemigo) : undefined
        }));
        if (!pj.esPnj && !r.critico && !r.pifia) {
          botones.push(boton(`Repetir ${M.nombre(pj)} (1 PF)`, `rr:t:${pj.id}:DES:PER:${(c.init + (bono || 0))}:${dificultad ?? ''}`));
        }
      }
      return mensaje({ embeds, components: filasBotones(botones) });
    }

    const pjs = await grupo(ctx);
    if (!pjs.length) throw new Aviso('No hay personajes en la partida.');
    const pj = pjs.map((p) => ({ p, init: M.calc(p, ctx.db).init })).sort((a, b) => b.init - a.init)[0].p;
    const c = M.calc(pj, ctx.db);
    const dados = M.dadosEfectivos(pj, c);
    const r = M.prueba(dados.DES, dados.PER, c.init + (bono || 0), dificultad);
    const extra = [r.exito ? '**Los jugadores eligen quién empieza.**' : '**Empiezan los enemigos.**'];
    const pf = await pifiaPf(pj, r, ctx.partidaId);
    if (pf) extra.push(pf);
    const embed = embedPrueba({
      titulo: `Iniciativa · lidera ${M.nombre(pj)}`, r, etiquetas: [`DES d${dados.DES}`, `PER d${dados.PER}`], extra,
      pie: [
        `Inic. ${signo(c.init) || '0'}${bono ? ` · bono ${signo(bono)}` : ''}`,
        notaEstados(pj, c, dados, ['DES', 'PER'])
      ].filter(Boolean).join(' · ')
    });
    const rep = botonRepetir(r, `rr:t:${pj.id}:DES:PER:${(c.init + (bono || 0))}:${dificultad ?? ''}`);
    return mensaje({ embeds: [embed], components: rep ? [fila(rep)] : [] });
  },

  async combate(ctx) {
    let cb = await P.combate(ctx.partidaId);
    switch (ctx.sub) {
      case 'iniciar':
        cb = { ronda: 1, empieza: ctx.o.empieza, actuados: [], enemigos: [], ultimo: null, inicio: new Date().toISOString() };
        await P.guardarCombate(cb, ctx.partidaId);
        return texto(`⚔️ ${await textoCombate(ctx, cb)}`);
      case 'turno': {
        if (!cb) throw new Aviso('No hay ningún conflicto en curso.');
        if (ctx.o.enemigo) {
          if (!ctx.dj) throw new Aviso('Solo el DJ marca los turnos de los enemigos.');
          cb.enemigos = [...(cb.enemigos || []), ctx.o.enemigo.trim()];
          cb.ultimo = 'enemigo';
        } else {
          const pj = await resolverPj(ctx, ctx.o.personaje, { editar: true });
          if (!cb.actuados.includes(pj.id)) cb.actuados.push(pj.id);
          cb.ultimo = 'pj';
        }
        await P.guardarCombate(cb, ctx.partidaId);
        return texto(await textoCombate(ctx, cb));
      }
      case 'ronda':
        if (!cb) throw new Aviso('No hay ningún conflicto en curso.');
        cb = { ...cb, ronda: cb.ronda + 1, actuados: [], enemigos: [], ultimo: null };
        await P.guardarCombate(cb, ctx.partidaId);
        return texto(`⚔️ ${await textoCombate(ctx, cb)}`);
      case 'ver':
        return texto(await textoCombate(ctx, cb), !cb);
      case 'terminar': {
        if (!cb) throw new Aviso('No hay ningún conflicto en curso.');
        await P.terminarCombate(ctx.partidaId);
        const n = await E.vaciar('enemigo', ctx.partidaId);
        const todosPjs = await ctx.todos();
        for (const pj of todosPjs) {
          const estadosPrevios = pj.estado && pj.estado.estados && pj.estado.estados.length > 0;
          const bufosPrevios = pj.estado && pj.estado.bufos && pj.estado.bufos.length > 0;
          if (estadosPrevios || bufosPrevios) {
            pj.estado.estados = [];
            pj.estado.bufos = [];
            await P.escribir(pj, ctx.partidaId);
          }
        }
        const cCampo = await E.campo(ctx.partidaId);
        let campoTocado = false;
        for (const inst of (cCampo.enemigos || [])) {
          if ((inst.estados && inst.estados.length > 0) || (inst.bufos && inst.bufos.length > 0)) {
            inst.estados = [];
            inst.bufos = [];
            campoTocado = true;
          }
        }
        if (campoTocado) await E.guardarCampo(cCampo, ctx.partidaId);
        return texto(`Conflicto terminado tras ${cb.ronda} ronda${cb.ronda > 1 ? 's' : ''}.${n ? ` ${n} enemigo${n > 1 ? 's' : ''} retirado${n > 1 ? 's' : ''} del campo.` : ''} Se han eliminado los estados alterados y bufos de combate de los personajes.`);
      }
      default: throw new Aviso('Subcomando desconocido.');
    }
  },

  async bufo(ctx) {
    const sub = ctx.sub;
    const submanejadores = {
      async aplicar(ctx) {
        const o = ctx.o;
        if (!o.nombre) throw new Aviso('Indica el nombre del bufo o conjuro.');
        const pj = await resolverPj(ctx, o.personaje);
        if (!pj) throw new Aviso('No se encontró el objetivo.');
        if (pj.esPnj && !ctx.dj) throw new Aviso('Solo el DJ puede aplicar bufos a enemigos.');

        const bufo = {
          id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          nombre: o.nombre.trim().slice(0, 60)
        };
        if (o.def !== undefined && o.def !== null) bufo.def = Number(o.def);
        if (o.mdef !== undefined && o.mdef !== null) bufo.mdef = Number(o.mdef);
        if (o.dano !== undefined && o.dano !== null) bufo.dano = Number(o.dano);
        if (o.tipo_dano) bufo.tipo_dano = o.tipo_dano;
        if (o.precision !== undefined && o.precision !== null) bufo.precision = Number(o.precision);
        if (o.init !== undefined && o.init !== null) bufo.init = Number(o.init);
        if (o.pv_max !== undefined && o.pv_max !== null) bufo.pv_max = Number(o.pv_max);
        if (o.pm_max !== undefined && o.pm_max !== null) bufo.pm_max = Number(o.pm_max);
        if (o.duracion) bufo.duracion = o.duracion.trim().slice(0, 50);

        const afs = {};
        if (o.resistencia) afs[o.resistencia] = 'RS';
        if (o.inmunidad) afs[o.inmunidad] = 'IM';
        if (o.vulnerabilidad) afs[o.vulnerabilidad] = 'VU';
        if (Object.keys(afs).length) bufo.afinidades = afs;

        if (o.atributo) {
          bufo.atributos = { [o.atributo]: o.pasos !== undefined && o.pasos !== null ? Number(o.pasos) : 1 };
        }

        const resumen = resumenBufo(bufo);

        if (pj.esPnj) {
          const c = await E.campo(ctx.partidaId);
          const inst = c.enemigos.find((x) => x.id === pj.id);
          if (!inst) throw new Aviso('El enemigo ya no está en el campo.');
          inst.bufos = Array.isArray(inst.bufos) ? inst.bufos : [];
          inst.bufos.push(bufo);
          await E.guardarCampo(c, ctx.partidaId);
          const st = N.statsEfectivasPnj(pj.t, inst);
          const embed = {
            title: `✨ Bufo «${bufo.nombre}» aplicado a ${inst.nombre}`,
            description: `**Efecto**: ${resumen}\n\n**Estadísticas de combate**: DEF **${st.def}** · D.Mág **${st.mdef}** · Inic. **${st.init}** · PV **${inst.pv}/${st.pv_max}**`,
            color: COLOR.enemigo
          };
          return mensaje({ embeds: [embed] });
        }

        pj.estado = pj.estado || {};
        pj.estado.bufos = Array.isArray(pj.estado.bufos) ? pj.estado.bufos : [];
        pj.estado.bufos.push(bufo);
        await P.escribir(pj, ctx.partidaId);
        const calc = M.calc(pj, ctx.db);
        const rec = M.recursos(pj, calc);
        const embed = {
          title: `✨ Bufo «${bufo.nombre}» aplicado a ${M.nombre(pj)}`,
          description: `**Efecto**: ${resumen}\n\n**Estadísticas de combate**: DEF **${calc.def}** · D.Mág **${calc.mdef}** · Inic. **${signo(calc.init) || '0'}** · PV **${rec.pv}/${calc.pv_max}** · PM **${rec.pm}/${calc.pm_max}**`,
          color: COLOR.info
        };
        return mensaje({ embeds: [embed] });
      },

      async quitar(ctx) {
        const o = ctx.o;
        if (!o.nombre) throw new Aviso('Indica el nombre del bufo a retirar.');
        const pj = await resolverPj(ctx, o.personaje);
        if (!pj) throw new Aviso('No se encontró el objetivo.');
        if (pj.esPnj && !ctx.dj) throw new Aviso('Solo el DJ puede retirar bufos de enemigos.');

        const busq = P.norm(o.nombre);

        if (pj.esPnj) {
          const c = await E.campo(ctx.partidaId);
          const inst = c.enemigos.find((x) => x.id === pj.id);
          if (!inst) throw new Aviso('El enemigo ya no está en el campo.');
          const prev = inst.bufos || [];
          const idx = prev.findIndex((b) => b.id === o.nombre || P.norm(b.nombre) === busq || P.norm(b.nombre).includes(busq));
          if (idx < 0) throw new Aviso(`«${inst.nombre}» no tiene ningún bufo que coincida con «${o.nombre}».`);
          const [quitado] = inst.bufos.splice(idx, 1);
          await E.guardarCampo(c, ctx.partidaId);
          return texto(`✨ Bufo «${quitado.nombre}» retirado de **${inst.nombre}**.`);
        }

        const bufos = pj.estado && pj.estado.bufos ? pj.estado.bufos : [];
        const idx = bufos.findIndex((b) => b.id === o.nombre || P.norm(b.nombre) === busq || P.norm(b.nombre).includes(busq));
        if (idx < 0) throw new Aviso(`«${M.nombre(pj)}» no tiene ningún bufo que coincida con «${o.nombre}».`);
        const [quitado] = pj.estado.bufos.splice(idx, 1);
        await P.escribir(pj, ctx.partidaId);
        return texto(`✨ Bufo «${quitado.nombre}» retirado de **${M.nombre(pj)}**.`);
      },

      async ver(ctx) {
        const valor = ctx.o.personaje;
        if (valor) {
          const pj = await resolverPj(ctx, valor);
          if (pj.esPnj) {
            const st = N.statsEfectivasPnj(pj.t, pj.inst);
            const lista = (pj.inst.bufos || []).map((b) => `• **${b.nombre}**: ${resumenBufo(b)}`).join('\n') || '*(Sin bufos activos)*';
            const embed = {
              title: `✨ Bufos activos · ${pj.inst.nombre}`,
              description: `${lista}\n\n**Estadísticas efectivas**: DEF **${st.def}** · D.Mág **${st.mdef}** · Inic. **${st.init}** · PV **${pj.inst.pv}/${st.pv_max}**`,
              color: COLOR.enemigo
            };
            return mensaje({ embeds: [embed] });
          }
          const c = M.calc(pj, ctx.db);
          const rec = M.recursos(pj, c);
          const lista = (pj.estado && pj.estado.bufos ? pj.estado.bufos : []).map((b) => `• **${b.nombre}**: ${resumenBufo(b)}`).join('\n') || '*(Sin bufos activos)*';
          const embed = {
            title: `✨ Bufos activos · ${M.nombre(pj)}`,
            description: `${lista}\n\n**Estadísticas efectivas**: DEF **${c.def}** · D.Mág **${c.mdef}** · Inic. **${signo(c.init) || '0'}** · PV **${rec.pv}/${c.pv_max}** · PM **${rec.pm}/${c.pm_max}**`,
            color: COLOR.info
          };
          return mensaje({ embeds: [embed] });
        }

        // Vista de todo el combate
        const todosPjs = await ctx.todos();
        const lineasPj = [];
        for (const p of todosPjs) {
          const bs = (p.estado && p.estado.bufos) || [];
          if (bs.length) {
            lineasPj.push(`**${M.nombre(p)}**:\n` + bs.map((b) => `  • ${b.nombre}: ${resumenBufo(b)}`).join('\n'));
          }
        }
        let lineasEnem = [];
        if (ctx.dj) {
          const c = await E.campo(ctx.partidaId);
          for (const i of c.enemigos || []) {
            const bs = i.bufos || [];
            if (bs.length) {
              lineasEnem.push(`**${i.nombre}**:\n` + bs.map((b) => `  • ${b.nombre}: ${resumenBufo(b)}`).join('\n'));
            }
          }
        }
        const contenido = [...lineasPj, ...lineasEnem].join('\n\n') || 'No hay bufos activos en ningún personaje ni enemigo.';
        return mensaje({ embeds: [{ title: '✨ Bufos activos en combate', description: contenido, color: COLOR.info }] });
      },

      async limpiar(ctx) {
        const val = ctx.o.personaje;
        const normVal = P.norm(val);
        if (normVal === 'todos' || normVal === 'all') {
          if (!ctx.dj) throw new Aviso('Solo el DJ puede limpiar los bufos de todo el combate.');
          const todosPjs = await ctx.todos();
          for (const p of todosPjs) {
            if (p.estado && p.estado.bufos && p.estado.bufos.length) {
              p.estado.bufos = [];
              await P.escribir(p, ctx.partidaId);
            }
          }
          const c = await E.campo(ctx.partidaId);
          let modif = false;
          for (const i of c.enemigos || []) {
            if (i.bufos && i.bufos.length) {
              i.bufos = [];
              modif = true;
            }
          }
          if (modif) await E.guardarCampo(c, ctx.partidaId);
          return texto('✨ Se han eliminado todos los bufos de combate de todos los personajes y enemigos.');
        }

        const pj = await resolverPj(ctx, val);
        if (!pj) throw new Aviso('No se encontró el objetivo.');
        if (pj.esPnj) {
          if (!ctx.dj) throw new Aviso('Solo el DJ puede limpiar bufos de enemigos.');
          const c = await E.campo(ctx.partidaId);
          const inst = c.enemigos.find((x) => x.id === pj.id);
          if (inst) {
            inst.bufos = [];
            await E.guardarCampo(c, ctx.partidaId);
          }
          return texto(`✨ Se han eliminado todos los bufos de **${pj.inst.nombre}**.`);
        }

        pj.estado = pj.estado || {};
        pj.estado.bufos = [];
        await P.escribir(pj, ctx.partidaId);
        return texto(`✨ Se han eliminado todos los bufos de **${M.nombre(pj)}**.`);
      }
    };

    const handler = submanejadores[sub];
    if (!handler) throw new Aviso('Subcomando de bufo no reconocido.');
    return handler(ctx);
  },

  async importar(ctx) {
    const adj = ctx.i.data.resolved && ctx.i.data.resolved.attachments && ctx.i.data.resolved.attachments[ctx.o.archivo];
    if (!adj) throw new Aviso('No he recibido el archivo.');
    if (adj.size > 2_000_000) throw new Aviso('El archivo es demasiado grande.');
    let datos;
    try {
      const r = await fetch(adj.url);
      datos = JSON.parse(await r.text());
    } catch (e) { throw new Aviso('No he podido leer el archivo: ¿es el JSON exportado desde el generador?'); }
    let pj;
    try { pj = P.preparar(datos); } catch (e) { throw new Aviso(e.message); }
    const existia = await P.obtener(pj.id, ctx.partidaId);
    await P.guardar(pj, { forzar: true }, ctx.partidaId);
    let extra = '';
    if (ctx.o.jugador) {
      const u = ctx.i.data.resolved.users[ctx.o.jugador];
      const m = ctx.i.data.resolved.members && ctx.i.data.resolved.members[ctx.o.jugador];
      await P.asignar(pj.id, { id: u.id, nombre: (m && m.nick) || nombreUsuario(u) }, ctx.partidaId);
      extra = ` y asignado a <@${u.id}>`;
    }
    return texto(`📥 **${M.nombre(pj)}** (nivel ${pj.nivel}) ${existia ? 'actualizado' : 'importado'}${extra}.`, true);
  },

  async exportar(ctx) {
    const pj = await resolverPj(ctx, ctx.o.personaje);
    const url = `${ctx.origen}/api/datos/?accion=descargar&id=${encodeURIComponent(pj.id)}&partida=${encodeURIComponent(ctx.partidaId)}`;
    return mensaje({ content: `📤 JSON de **${M.nombre(pj)}**: ${url}\nPuedes abrirlo en el generador con «Cargar».` }, true);
  },

  async asignar(ctx) {
    const pj = await resolverPj(ctx, ctx.o.personaje);
    if (!ctx.o.jugador) {
      await P.asignar(pj.id, null, ctx.partidaId);
      return texto(`**${M.nombre(pj)}** ya no está asignado a ningún jugador.`);
    }
    const u = ctx.i.data.resolved.users[ctx.o.jugador];
    const m = ctx.i.data.resolved.members && ctx.i.data.resolved.members[ctx.o.jugador];
    await P.asignar(pj.id, { id: u.id, nombre: (m && m.nick) || nombreUsuario(u) }, ctx.partidaId);
    return texto(`**${M.nombre(pj)}** asignado a <@${u.id}>.`);
  },

  async personajes(ctx) {
    const pjs = await ctx.todos();
    if (!pjs.length) return texto('Todavía no hay personajes guardados. El DJ puede usar /importar.', true);
    const lineas = pjs.map((pj) => `**${M.nombre(pj)}** · Nv ${pj.nivel} · ${M.resumenClases(pj, ctx.db)} · ${pj.discord && pj.discord.id ? `<@${pj.discord.id}>` : '*sin jugador*'}`);
    return mensaje({ embeds: [{ title: 'Personajes', url: urlVisor(ctx), description: lineas.join('\n').slice(0, 4000), color: COLOR.normal }] });
  },

  async px(ctx) {
    const lista = ctx.o.personaje ? await resolverPjs(ctx, ctx.o.personaje) : await grupo(ctx);
    if (!lista.length) throw new Aviso('No hay personajes.');
    const lineas = [];
    for (const pj of lista) {
      pj.px = Math.max(0, (pj.px || 0) + ctx.o.cantidad);
      await P.escribir(pj, ctx.partidaId);
      lineas.push(`**${M.nombre(pj)}** · ${pj.px} PX${pj.px >= 10 ? ' · ⬆️ puede subir de nivel' : ''}`);
    }
    return texto(`✨ ${signo(ctx.o.cantidad)} PX\n${lineas.join('\n')}`);
  },

  async zenit(ctx) {
    const lista = ctx.o.personaje ? await resolverPjs(ctx, ctx.o.personaje) : await grupo(ctx);
    if (!lista.length) throw new Aviso('No hay personajes.');
    const lineas = [];
    for (const pj of lista) {
      pj.zenit = Math.max(0, (pj.zenit || 0) + ctx.o.cantidad);
      await P.escribir(pj, ctx.partidaId);
      lineas.push(`**${M.nombre(pj)}** · ${pj.zenit} z`);
    }
    return texto(`💰 ${signo(ctx.o.cantidad)} z\n${lineas.join('\n')}`);
  },

  async enemigo(ctx) {
    const fn = SUB_ENEMIGO[ctx.sub];
    if (!fn) throw new Aviso('Subcomando desconocido.');
    return fn(ctx);
  },

  async estudiar(ctx) {
    const { inst, t } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
    return mensaje(await hacerEstudio(ctx, { inst, t, pjValor: ctx.o.personaje, bono: ctx.o.bono || 0 }));
  },

  async revelar(ctx) {
    const { inst } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
    const t = await E.revelar(inst.plantilla, ctx.o.nivel);
    return mensaje({ embeds: [embedRevelado(t, t.revelado ? `🔎 Información sobre ${t.nombre}` : `${t.nombre}: perfil oculto`)] });
  },

  async ayuda(ctx) {
    return texto(`📖 Lista de comandos: ${urlComandos(ctx)}`, true);
  }
};

// ------------------------------------------------------------------ botones
async function pulsarBoton(ctx) {
  const partes = ctx.i.data.custom_id.split(':');
  const [tipo] = partes;
  const original = (ctx.i.message && ctx.i.message.embeds && ctx.i.message.embeds[0]) || null;

  if (tipo === 'pm') {
    const [, id, costeTxt] = partes;
    const coste = Number(costeTxt);
    const pj = await P.obtener(id, ctx.partidaId);
    if (!pj) throw new Aviso('El personaje ya no existe.');
    if (!puedeEditar(ctx, pj)) throw new Aviso('Solo su jugador o el DJ pueden gastar esos PM.');
    const c = M.calc(pj, ctx.db);
    const rec = M.recursos(pj, c);
    if (rec.pm < coste) throw new Aviso(`${M.nombre(pj)} solo tiene ${rec.pm} PM.`);
    pj.estado = pj.estado || {};
    pj.estado.pm = rec.pm - coste;
    await P.escribir(pj, ctx.partidaId);
    const comps = (ctx.i.message.components || []).map((f) => ({ ...f, components: f.components.filter((b) => !b.custom_id.startsWith('pm:')) })).filter((f) => f.components.length);
    const embeds = original ? [{ ...original, footer: { text: `${original.footer ? original.footer.text + ' · ' : ''}Gastados ${coste} PM (quedan ${pj.estado.pm})` } }] : [];
    return actualizar({ embeds, components: comps });
  }

  if (tipo === 'ev') {
    if (!ctx.dj) throw new Aviso('Solo el DJ puede ver el estado de los PNJ.');
    const c = await E.campo(ctx.partidaId);
    const inst = c.enemigos.find((i) => i.id === partes[1]);
    if (!inst) throw new Aviso('Ese PNJ ya no está en el campo.');
    const t = await E.plantilla(inst.plantilla);
    return texto(estadoPnjDj(inst, t), true);
  }

  if (tipo === 'ap') {
    const [, id, danoTxt, tipoDano] = partes;
    const pj = await P.obtener(id, ctx.partidaId);
    if (!pj) throw new Aviso('El personaje ya no existe.');
    if (!puedeEditar(ctx, pj)) throw new Aviso('Solo su jugador o el DJ pueden aplicar ese daño.');
    const c = M.calc(pj, ctx.db);
    const rec = M.recursos(pj, c);
    let dano = Number(danoTxt) || 0;
    let afinidadNota = '';
    if (tipoDano && c.afinidades && c.afinidades[tipoDano]) {
      const af = c.afinidades[tipoDano];
      if (af === 'VU') { dano = dano * 2; afinidadNota = ' · ¡Vulnerable!'; }
      else if (af === 'RS') { dano = Math.floor(dano / 2); afinidadNota = ' · Resiste'; }
      else if (af === 'IM') { dano = 0; afinidadNota = ' · Inmune'; }
      else if (af === 'AS') { dano = -dano; afinidadNota = ' · ¡Absorbe!'; }
    }
    const nuevo = dano < 0 ? Math.min(c.pv_max, rec.pv - dano) : Math.max(0, rec.pv - dano);
    pj.estado = pj.estado || {};
    pj.estado.pv = nuevo;
    await P.escribir(pj, ctx.partidaId);
    let nota = dano < 0
      ? `${M.nombre(pj)} absorbe el daño y recupera ${-dano} PV (${rec.pv} → ${nuevo})`
      : `${M.nombre(pj)} pierde ${dano} PV (${rec.pv} → ${nuevo})${afinidadNota}`;
    if (nuevo === 0) nota += ' · cae a 0 PV';
    else if (nuevo <= c.crisis && rec.pv > c.crisis) nota += ' · entra en Crisis';
    const comps = (ctx.i.message.components || []).map((f) => ({ ...f, components: f.components.filter((b) => b.custom_id !== ctx.i.data.custom_id) })).filter((f) => f.components.length);
    const embeds = original ? [{ ...original, footer: { text: `${original.footer ? original.footer.text + ' · ' : ''}${nota}` } }] : [];
    return actualizar({ embeds, components: comps });
  }

  if (tipo === 'rr') {
    const [, sub, id, ...resto] = partes;
    const pj = await P.obtener(id, ctx.partidaId);
    if (!pj) throw new Aviso('El personaje ya no existe.');
    if (!puedeEditar(ctx, pj)) throw new Aviso('Solo su jugador o el DJ pueden repetir esta tirada.');
    if ((pj.pf || 0) < 1) throw new Aviso(`${M.nombre(pj)} no tiene Puntos Fábula.`);
    pj.pf -= 1;
    await P.escribir(pj, ctx.partidaId);
    ctx._todos = null;
    let res;
    if (sub === 't') {
      const [a1, a2, bono, dif] = resto;
      res = await hacerTirada(ctx, { a1, a2, bono: Number(bono) || 0, dif: dif === '' ? null : Number(dif), pjValor: id });
    } else if (sub === 'a') {
      const [idx, bono, instId, delta] = resto;
      if (instId) await deshacerPnj(instId, Number(delta) || 0, ctx.partidaId);
      res = await hacerAtaque(ctx, { arma: idx, bono: Number(bono) || 0, pjValor: id, objetivo: instId || undefined });
    } else if (sub === 'c') {
      const [cjId, obj, bono, atr, instId, delta] = resto;
      if (instId) await deshacerPnj(instId, Number(delta) || 0, ctx.partidaId);
      res = await hacerConjuro(ctx, { conjuro: cjId, objetivos: Number(obj) || 1, bono: Number(bono) || 0, atributos: atr, pjValor: id, objetivo: instId || undefined });
    } else if (sub === 'e') {
      const [instId, bono] = resto;
      const { inst, t } = await resolverPnj(instId, ctx.partidaId);
      res = await hacerEstudio(ctx, { inst, t, pjValor: id, bono: Number(bono) || 0 });
    } else throw new Aviso('Botón desconocido.');
    const yaGastado = !(ctx.i.message.components || []).some((f) => (f.components || []).some((b) => (b.custom_id || '').startsWith('pm:')));
    if (yaGastado) res.components = (res.components || []).map((f) => ({ ...f, components: f.components.filter((b) => !b.custom_id.startsWith('pm:')) })).filter((f) => f.components.length);
    const pjAhora = await P.obtener(id, ctx.partidaId);
    const nota = `🔁 Repetida con 1 PF (quedan ${pjAhora.pf || 0}). Antes: ${original ? (original.description || '').split('\n')[1] || '' : ''}`.replace(/\*\*/g, '');
    res.embeds[0].footer = { text: [nota, res.embeds[0].footer && res.embeds[0].footer.text].filter(Boolean).join(' · ') };
    return actualizar(res);
  }
  throw new Aviso('Botón desconocido.');
}

// ------------------------------------------------------------------ autocompletado
async function autocompletar(ctx) {
  const f = ctx.enfocada;
  if (!f) return { type: 8, data: { choices: [] } };
  const q = P.norm(f.value);
  const qWords = q ? q.split(/\s+/).filter(Boolean) : [];
  const coincide = (texto, query, queryWords) => {
    if (!query) return true;
    const n = P.norm(texto);
    if (n.includes(query)) return true;
    const nWords = n.split(/[^a-z0-9]+/i).filter(Boolean);
    return queryWords.every((qw) => nWords.some((nw) => nw.startsWith(qw)));
  };
  const filtra = (lista) => lista.filter((x) => coincide(x.name, q, qWords)).slice(0, 25);
  let choices = [];
  try {
    const cmdNombre = ctx.i.data.name;
    const enCampo = async (lado = null) => (await E.campo(ctx.partidaId)).enemigos.filter((i) => !lado || i.lado === lado);
    if (f.name === 'personaje') {
      const todos = await ctx.todos();
      const mios = (p) => (p.discord && p.discord.id === ctx.user.id ? 0 : 1);
      const listaPjs = [...todos].sort((a, b) => mios(a) - mios(b));
      const comandosConTodos = ['tirada', 'ficha', 'iniciativa', 'px', 'bufo'];
      let enemigosCampo = [];
      if (ctx.dj) {
        try {
          const c = await E.campo(ctx.partidaId);
          enemigosCampo = c && Array.isArray(c.enemigos) ? c.enemigos : [];
        } catch (e) { enemigosCampo = []; }
      }
      const trozos = (f.value || '').split(/[,+]/);
      if (trozos.length > 1 && comandosConTodos.includes(cmdNombre)) {
        const prefijo = trozos.slice(0, -1).map((s) => s.trim()).filter(Boolean).join(', ') + ', ';
        const ultimo = P.norm(trozos[trozos.length - 1].trim());
        const ultimoWords = ultimo ? ultimo.split(/\s+/).filter(Boolean) : [];
        const yaElegidos = trozos.slice(0, -1).map((s) => P.norm(s.trim()));
        const candidatos = [];
        for (const p of listaPjs) {
          const nm = M.nombre(p);
          if (!yaElegidos.some((y) => y === P.norm(nm) || y === p.id)) {
            candidatos.push({
              name: `${prefijo}${nm}${p.discord && p.discord.nombre ? ` · ${p.discord.nombre}` : ''}`.slice(0, 100),
              value: `${prefijo}${nm}`.slice(0, 100),
              search: nm
            });
          }
        }
        for (const i of enemigosCampo) {
          if (!yaElegidos.some((y) => y === P.norm(i.nombre) || y === i.id)) {
            candidatos.push({
              name: `${prefijo}👹 ${i.nombre}${i.lado === 'aliado' ? ' (aliado)' : ' (enemigo)'}`.slice(0, 100),
              value: `${prefijo}${i.nombre}`.slice(0, 100),
              search: i.nombre
            });
          }
        }
        choices = candidatos
          .filter((c) => coincide(c.search, ultimo, ultimoWords))
          .slice(0, 25)
          .map((c) => ({ name: c.name, value: c.value }));
      } else {
        const base = listaPjs.map((p) => ({
          name: `${M.nombre(p)}${p.discord && p.discord.nombre ? ` · ${p.discord.nombre}` : ''}`.slice(0, 100),
          value: p.id
        }));
        const baseEnemigos = enemigosCampo.map((i) => ({
          name: `👹 ${i.nombre}${i.lado === 'aliado' ? ' (aliado)' : ' (enemigo)'}`.slice(0, 100),
          value: i.nombre.slice(0, 100)
        }));
        let lista = [];
        if (comandosConTodos.includes(cmdNombre)) {
          lista.push({ name: '👥 Todos los personajes', value: 'todos' });
          if (ctx.dj && enemigosCampo.length) {
            lista.push({ name: '👹 Todos los enemigos en combate', value: 'todos_enemigos' });
          }
        }
        lista = [...lista, ...base, ...baseEnemigos];
        choices = filtra(lista);
      }
    } else if (f.name === 'enemigo') {
      const lista = await enCampo(cmdNombre === 'combate' ? 'enemigo' : null);
      choices = filtra(lista.map((i) => ({ name: `${i.nombre}${i.lado === 'aliado' ? ' (aliado)' : ''}`.slice(0, 100), value: cmdNombre === 'combate' ? i.nombre.slice(0, 100) : i.id })));
    } else if (f.name === 'plantilla') {
      choices = filtra((await E.plantillas()).map((t) => ({ name: `${t.nombre} · Nv ${t.nivel}`.slice(0, 100), value: t.id })));
    } else if (/^objetivo\d?$/.test(f.name) && cmdNombre === 'enemigo') {
      const form = await E.formacion(ctx.partidaId);
      choices = filtra((await ctx.todos()).filter((p) => (form[p.id] || {}).fila !== 'fuera').map((p) => ({ name: M.nombre(p).slice(0, 100), value: p.id })));
    } else if (f.name === 'objetivo') {
      const lista = await enCampo();
      choices = filtra([...lista].sort((a, b) => (a.lado === 'enemigo' ? 0 : 1) - (b.lado === 'enemigo' ? 0 : 1)).map((i) => ({ name: i.nombre.slice(0, 100), value: i.id })));
    } else if (f.name === 'ataque') {
      const { t } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
      choices = filtra(t.ataques.map((a, k) => ({ name: `${a.nombre} · ${a.alcance === 'distancia' ? 'distancia' : 'cuerpo a cuerpo'}`.slice(0, 100), value: String(k) })));
    } else if (f.name === 'conjuro' && cmdNombre === 'enemigo') {
      const { t } = await resolverPnj(ctx.o.enemigo, ctx.partidaId);
      choices = filtra(t.conjuros.map((c, k) => ({ name: `${c.nombre} · ${c.pm}${c.por_objetivo ? ' × obj.' : ''} PM`.slice(0, 100), value: String(k) })));
    } else if (f.name === 'arma') {
      const pj = await resolverPj(ctx, ctx.o.personaje);
      choices = filtra(M.calc(pj, ctx.db).ataques.map((a, i) => ({ name: a.nombre.slice(0, 100), value: String(i) })));
    } else if (f.name === 'conjuro') {
      const pj = await resolverPj(ctx, ctx.o.personaje);
      choices = filtra(conjurosDe(pj, ctx.db).map((c) => ({ name: `${c.nombre} · ${c.pm} PM`.slice(0, 100), value: c.id })));
    } else if (f.name === 'nombre' && cmdNombre === 'bufo') {
      const pj = await resolverPj(ctx, ctx.o.personaje).catch(() => null);
      if (pj) {
        const bufos = pj.esPnj ? (pj.inst.bufos || []) : ((pj.estado && pj.estado.bufos) || []);
        choices = filtra(bufos.map((b) => ({ name: `${b.nombre} · ${resumenBufo(b)}`.slice(0, 100), value: b.nombre.slice(0, 100) })));
      }
    } else if (f.name === 'nombre') {
      choices = filtra((await P.relojes(ctx.partidaId)).map((r) => ({ name: `${r.nombre} (${r.llenas}/${r.secciones})`.slice(0, 100), value: r.nombre.slice(0, 100) })));
    }
  } catch (e) { choices = []; }
  return { type: 8, data: { choices } };
}

// ------------------------------------------------------------------ entrada
/** Procesa una interacción ya verificada y devuelve el JSON de respuesta. */
export async function manejarInteraccion(i, origen) {
  if (i.type === 1) return { type: 1 };
  if (!i.guild_id) return texto('Este bot solo funciona dentro del servidor de la partida.', true);
  let ctx;
  try {
    ctx = await contexto(i, origen);
    if (ctx.rol === 'bloqueado') throw new Aviso('No tienes acceso a la partida configurada para este canal.');
    await P.registrarUsuario(ctx.user);
    if (i.type === 4) return await autocompletar(ctx);
    if (i.type === 3) return await pulsarBoton(ctx);
    if (i.type === 2) {
      const nombre = i.data.name;
      if (esSoloDj(nombre, ctx.sub) && !ctx.dj) throw new Aviso('Este comando es solo para el DJ.');
      const fn = MANEJADORES[nombre];
      if (!fn) throw new Aviso('Comando desconocido. Puede que haga falta actualizar los comandos desde el panel.');
      return await fn(ctx);
    }
    return texto('Interacción no soportada.', true);
  } catch (e) {
    if (e instanceof Aviso) return texto(e.message, true);
    console.error('Error en el bot:', e);
    return texto(`Algo ha fallado: ${e.message}`, true);
  }
}

export { MANEJADORES, autocompletar };
