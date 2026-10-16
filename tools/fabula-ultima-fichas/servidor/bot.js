// ---------------------------------------------------------------------------
// Bot de Discord para Fabula Ultima: manejadores de comandos, botones y
// autocompletado. Cada comando de servidor/comandos.js tiene aquí su función.
// ---------------------------------------------------------------------------
import { get } from '../assets/js/db.js';
import { esSoloDj } from './comandos.js';
import { miembroEsDj, nombreUsuario } from './discord.js';
import * as P from './personajes.js';
import * as M from './motor.js';

const { R } = M;
const COLOR = { normal: 0xd4b072, critico: 0x6fcf97, pifia: 0xe0727c, info: 0x6fa6dc };
const EFIMERO = 64;

class Aviso extends Error {}

// ------------------------------------------------------------------ respuestas
const mensaje = (data, efimero = false) => ({ type: 4, data: { allowed_mentions: { parse: [] }, ...data, ...(efimero ? { flags: EFIMERO } : {}) } });
const texto = (content, efimero = false) => mensaje({ content }, efimero);
const actualizar = (data) => ({ type: 7, data: { allowed_mentions: { parse: [] }, ...data } });
const boton = (label, custom_id, style = 2) => ({ type: 2, style, label, custom_id });
const fila = (...botones) => ({ type: 1, components: botones.filter(Boolean) });
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
  const ctx = {
    i, o, sub, enfocada, origen,
    user: { id: u.id, nombre: (i.member && i.member.nick) || nombreUsuario(u) },
    guild: i.guild_id,
    db: await M.baseDatos(),
    _todos: null
  };
  ctx.dj = i.guild_id ? await miembroEsDj(i.member, i.guild_id) : false;
  ctx.todos = async () => (ctx._todos || (ctx._todos = await P.listar()));
  return ctx;
}

const urlVisor = (ctx, pj) => `${ctx.origen}/tools/fabula-ultima-fichas/visor/index.html${pj ? '#' + encodeURIComponent(pj.id) : ''}`;
const urlComandos = (ctx) => `${ctx.origen}/tools/fabula-ultima-fichas/comandos/index.html`;
const puedeEditar = (ctx, pj) => ctx.dj || (pj.discord && pj.discord.id === ctx.user.id);

/** Busca el personaje indicado o el asignado al usuario. */
async function resolverPj(ctx, valor, { editar = false } = {}) {
  const todos = await ctx.todos();
  let pj;
  if (valor) {
    const n = P.norm(valor);
    pj = todos.find((p) => p.id === valor) || todos.find((p) => P.norm(M.nombre(p)) === n) || todos.find((p) => P.norm(M.nombre(p)).includes(n));
    if (!pj) throw new Aviso(`No encuentro el personaje «${valor}».`);
  } else {
    pj = todos.find((p) => p.discord && p.discord.id === ctx.user.id);
    if (!pj) throw new Aviso(ctx.dj ? 'Indica el personaje con la opción «personaje».' : 'No tienes personaje asignado. Pide al DJ que use /asignar.');
  }
  if (editar && !puedeEditar(ctx, pj)) throw new Aviso('Solo el DJ puede modificar personajes de otros jugadores.');
  return pj;
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

function notaEstados(pj, c, dados, atributos) {
  const red = [...new Set(atributos)].filter((a) => R.ATR.includes(a) && dados[a] < c.actual[a]);
  if (!red.length) return '';
  return 'Estados: ' + red.map((a) => `${a} d${c.actual[a]}→d${dados[a]}`).join(', ');
}

/** Si la tirada es pifia de un PJ, suma 1 PF. Devuelve la línea a mostrar. */
async function pifiaPf(pj, r) {
  if (!pj || !r.pifia) return '';
  pj.pf = (pj.pf || 0) + 1;
  await P.escribir(pj);
  return `+1 Punto Fábula por la pifia (ahora ${pj.pf}).`;
}

const botonRepetir = (r, id) => (!r.critico && !r.pifia ? boton('Repetir (1 PF)', id) : null);

// --- tirada
async function hacerTirada(ctx, { a1, a2, bono, dif, pjValor }) {
  const necesitaPj = [a1, a2].some((a) => R.ATR.includes(a));
  let pj = null, c = null, dados = null;
  if (necesitaPj || pjValor) {
    pj = await resolverPj(ctx, pjValor);
    c = M.calc(pj, ctx.db);
    dados = M.dadosEfectivos(pj, c);
    if (necesitaPj && [a1, a2].some((a) => R.ATR.includes(a) && !dados[a])) throw new Aviso(`${M.nombre(pj)} no tiene atributos definidos.`);
  }
  const caras = (a) => (R.ATR.includes(a) ? dados[a] : Number(String(a).replace('d', '')));
  const r = M.prueba(caras(a1), caras(a2), bono, dif);
  const et = (a) => (R.ATR.includes(a) ? `${a} d${dados[a]}` : a);
  const extra = [await pifiaPf(pj, r)].filter(Boolean);
  const quien = pj ? M.nombre(pj) : ctx.user.nombre;
  const embed = embedPrueba({ titulo: `${quien} · ${a1} + ${a2}`, r, etiquetas: [et(a1), et(a2)], extra, pie: pj ? notaEstados(pj, c, dados, [a1, a2]) : '' });
  const rep = pj ? botonRepetir(r, `rr:t:${pj.id}:${a1}:${a2}:${bono || 0}:${dif ?? ''}`) : null;
  return { embeds: [embed], components: rep ? [fila(rep)] : [] };
}

// --- ataque
async function hacerAtaque(ctx, { arma, bono, pjValor }) {
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
  const pf = await pifiaPf(pj, r);
  if (pf) extra.push(pf);
  if (at.cualidad) extra.push(`*${at.cualidad.length > 180 ? at.cualidad.slice(0, 177) + '…' : at.cualidad}*`);
  const embed = embedPrueba({
    titulo: `${M.nombre(pj)} ataca con ${at.nombre}`, r, etiquetas: [`${x} d${dados[x]}`, `${y} d${dados[y]}`], extra,
    pie: [at.precision.bonus || bono ? `Incluye ${signo((at.precision.bonus || 0) + (bono || 0))} a la precisión` : '', notaEstados(pj, c, dados, [x, y])].filter(Boolean).join(' · ')
  });
  embed.description = embed.description.replace('**Total', '**Precisión');
  const rep = botonRepetir(r, `rr:a:${pj.id}:${idx}:${bono || 0}`);
  return { embeds: [embed], components: rep ? [fila(rep)] : [] };
}

// --- conjuro
function conjurosDe(pj, db) {
  const vistos = new Set();
  return R.conjurosConocidos(pj, db).flatMap((g) => g.conjuros).filter((cj) => !cj._faltante && !vistos.has(cj.id) && vistos.add(cj.id));
}

async function hacerConjuro(ctx, { conjuro, objetivos, bono, atributos, pjValor }) {
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
    if (f !== null && !r.pifia) {
      const plus = c.dano_conjuros || 0;
      extra.push(`Daño: TM ${r.tm} + ${f}${plus ? ` + ${plus}` : ''} = **${r.tm + f + plus}** ${M.tipoDanoTexto(cj)}`.trim());
    }
    const pf = await pifiaPf(pj, r);
    if (pf) extra.push(pf);
    extra.push(`Coste: ${coste !== null ? `**${coste} PM**` : cj.pm} · ${M.nombre(pj)} tiene ${rec.pm} PM`);
    embed = embedPrueba({ titulo: `${M.nombre(pj)} lanza ${cj.nombre}`, r, etiquetas: [`${x} d${dados[x]}`, `${y} d${dados[y]}`], extra, pie: meta });
    embed.description = embed.description.replace('**Total', '**Magia');
    embed.fields = [{ name: 'Efecto', value: efecto }];
    const rep = botonRepetir(r, `rr:c:${pj.id}:${cj.id}:${objetivos || 1}:${bono || 0}:${atributos || 'PER+VOL'}`);
    if (rep) botones.push(rep);
  } else {
    embed = {
      title: `${M.nombre(pj)} lanza ${cj.nombre}`, color: COLOR.info,
      description: `${efecto}\n\nCoste: ${coste !== null ? `**${coste} PM**` : cj.pm} · ${M.nombre(pj)} tiene ${rec.pm} PM`,
      footer: { text: meta }
    };
  }
  return { embeds: [embed], components: botones.length ? [fila(...botones)] : [] };
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
  await P.escribir(pj);
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
async function buscarReloj(nombre) {
  const r = await P.reloj(nombre);
  if (r) return r;
  const todos = await P.relojes();
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
  if ((cb.enemigos || []).length) lineas.push(`Enemigos que han actuado: ${cb.enemigos.join(', ')}`);
  if (!faltan.length) lineas.push('Todos los jugadores han actuado.');
  else if (cb.ultimo) lineas.push(`Siguiente turno: **${cb.ultimo === 'pj' ? 'enemigos' : 'jugadores'}**.`);
  else lineas.push(`Siguiente turno: **${cb.empieza === 'pj' ? 'jugadores' : 'enemigos'}**.`);
  return lineas.join('\n');
}

// ------------------------------------------------------------------ comandos
const MANEJADORES = {
  async tirada(ctx) {
    const o = ctx.o;
    return mensaje(await hacerTirada(ctx, { a1: o.atributo1, a2: o.atributo2, bono: o.bono || 0, dif: o.dificultad, pjValor: o.personaje }));
  },
  async atacar(ctx) {
    return mensaje(await hacerAtaque(ctx, { arma: ctx.o.arma, bono: ctx.o.bono || 0, pjValor: ctx.o.personaje }));
  },
  async conjuro(ctx) {
    const o = ctx.o;
    return mensaje(await hacerConjuro(ctx, { conjuro: o.conjuro, objetivos: o.objetivos, bono: o.bono || 0, atributos: o.atributos, pjValor: o.personaje }));
  },
  async dados(ctx) {
    let r;
    try { r = M.tiradaLibre(ctx.o.expresion); } catch (e) { throw new Aviso(e.message); }
    return mensaje({ embeds: [{ title: `${ctx.user.nombre} · ${ctx.o.expresion}`, description: `${r.detalle}\n**Total ${r.total}**`, color: COLOR.normal }] });
  },
  async ficha(ctx) {
    const pj = await resolverPj(ctx, ctx.o.personaje);
    return mensaje({ embeds: [embedFicha(ctx, pj)] });
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
    await P.escribir(pj);
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
      await P.escribir(pj);
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
        if (await P.reloj(nombre)) throw new Aviso(`Ya existe el reloj «${nombre}».`);
        const r = { nombre: nombre.trim(), secciones, llenas: 0, creado: new Date().toISOString() };
        await P.guardarReloj(r);
        return texto(`🕒 **${r.nombre}**\n${dibujoReloj(r)}`);
      }
      case 'avanzar':
      case 'retroceder': {
        const r = await buscarReloj(nombre);
        const n = (cantidad || 1) * (ctx.sub === 'avanzar' ? 1 : -1);
        const antes = r.llenas;
        r.llenas = Math.max(0, Math.min(r.secciones, r.llenas + n));
        await P.guardarReloj(r);
        const completo = r.llenas >= r.secciones && antes < r.secciones;
        return texto(`🕒 **${r.nombre}** ${signo(r.llenas - antes) || '±0'}\n${dibujoReloj(r)}${completo ? '\n**¡Reloj completo!**' : ''}`);
      }
      case 'ver': {
        const lista = nombre ? [await buscarReloj(nombre)] : await P.relojes();
        if (!lista.length) return texto('No hay relojes activos.', true);
        return texto(lista.map((r) => `🕒 **${r.nombre}**\n${dibujoReloj(r)}`).join('\n\n'));
      }
      case 'borrar': {
        const r = await buscarReloj(nombre);
        await P.borrarReloj(r.nombre);
        return texto(`Reloj **${r.nombre}** eliminado.`);
      }
      default: throw new Aviso('Subcomando desconocido.');
    }
  },

  async iniciativa(ctx) {
    const { dificultad, bono } = ctx.o;
    let pj;
    if (ctx.o.personaje) pj = await resolverPj(ctx, ctx.o.personaje);
    else {
      const pjs = await grupo(ctx);
      if (!pjs.length) throw new Aviso('No hay personajes en la partida.');
      pj = pjs.map((p) => ({ p, init: M.calc(p, ctx.db).init })).sort((a, b) => b.init - a.init)[0].p;
    }
    const c = M.calc(pj, ctx.db);
    const dados = M.dadosEfectivos(pj, c);
    const r = M.prueba(dados.DES, dados.PER, c.init + (bono || 0), dificultad);
    const extra = [r.exito ? '**Los jugadores eligen quién empieza.**' : '**Empiezan los enemigos.**'];
    const pf = await pifiaPf(pj, r);
    if (pf) extra.push(pf);
    const embed = embedPrueba({
      titulo: `Iniciativa · lidera ${M.nombre(pj)}`, r, etiquetas: [`DES d${dados.DES}`, `PER d${dados.PER}`], extra,
      pie: `Incluye modificador de iniciativa ${signo(c.init) || '0'}${bono ? ` y bono ${signo(bono)}` : ''}`
    });
    return mensaje({ embeds: [embed] });
  },

  async combate(ctx) {
    let cb = await P.combate();
    switch (ctx.sub) {
      case 'iniciar':
        cb = { ronda: 1, empieza: ctx.o.empieza, actuados: [], enemigos: [], ultimo: null, inicio: new Date().toISOString() };
        await P.guardarCombate(cb);
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
        await P.guardarCombate(cb);
        return texto(await textoCombate(ctx, cb));
      }
      case 'ronda':
        if (!cb) throw new Aviso('No hay ningún conflicto en curso.');
        cb = { ...cb, ronda: cb.ronda + 1, actuados: [], enemigos: [], ultimo: null };
        await P.guardarCombate(cb);
        return texto(`⚔️ ${await textoCombate(ctx, cb)}`);
      case 'ver':
        return texto(await textoCombate(ctx, cb), !cb);
      case 'terminar':
        if (!cb) throw new Aviso('No hay ningún conflicto en curso.');
        await P.terminarCombate();
        return texto(`Conflicto terminado tras ${cb.ronda} ronda${cb.ronda > 1 ? 's' : ''}.`);
      default: throw new Aviso('Subcomando desconocido.');
    }
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
    const existia = await P.obtener(pj.id);
    await P.guardar(pj, { forzar: true });
    let extra = '';
    if (ctx.o.jugador) {
      const u = ctx.i.data.resolved.users[ctx.o.jugador];
      const m = ctx.i.data.resolved.members && ctx.i.data.resolved.members[ctx.o.jugador];
      await P.asignar(pj.id, { id: u.id, nombre: (m && m.nick) || nombreUsuario(u) });
      extra = ` y asignado a <@${u.id}>`;
    }
    return texto(`📥 **${M.nombre(pj)}** (nivel ${pj.nivel}) ${existia ? 'actualizado' : 'importado'}${extra}.`, true);
  },

  async exportar(ctx) {
    const pj = await resolverPj(ctx, ctx.o.personaje);
    const url = `${ctx.origen}/api/datos/?accion=descargar&id=${encodeURIComponent(pj.id)}`;
    return mensaje({ content: `📤 JSON de **${M.nombre(pj)}**: ${url}\nPuedes abrirlo en el generador con «Cargar».` }, true);
  },

  async asignar(ctx) {
    const pj = await resolverPj(ctx, ctx.o.personaje);
    if (!ctx.o.jugador) {
      await P.asignar(pj.id, null);
      return texto(`**${M.nombre(pj)}** ya no está asignado a ningún jugador.`);
    }
    const u = ctx.i.data.resolved.users[ctx.o.jugador];
    const m = ctx.i.data.resolved.members && ctx.i.data.resolved.members[ctx.o.jugador];
    const { liberados } = await P.asignar(pj.id, { id: u.id, nombre: (m && m.nick) || nombreUsuario(u) });
    return texto(`**${M.nombre(pj)}** asignado a <@${u.id}>.${liberados ? ' Su personaje anterior queda libre.' : ''}`);
  },

  async personajes(ctx) {
    const pjs = await ctx.todos();
    if (!pjs.length) return texto('Todavía no hay personajes guardados. El DJ puede usar /importar.', true);
    const lineas = pjs.map((pj) => `**${M.nombre(pj)}** · Nv ${pj.nivel} · ${M.resumenClases(pj, ctx.db)} · ${pj.discord && pj.discord.id ? `<@${pj.discord.id}>` : '*sin jugador*'}`);
    return mensaje({ embeds: [{ title: 'Personajes', url: urlVisor(ctx), description: lineas.join('\n').slice(0, 4000), color: COLOR.normal }] });
  },

  async px(ctx) {
    const lista = ctx.o.personaje ? [await resolverPj(ctx, ctx.o.personaje)] : await grupo(ctx);
    if (!lista.length) throw new Aviso('No hay personajes.');
    const lineas = [];
    for (const pj of lista) {
      pj.px = Math.max(0, (pj.px || 0) + ctx.o.cantidad);
      await P.escribir(pj);
      lineas.push(`**${M.nombre(pj)}** · ${pj.px} PX${pj.px >= 10 ? ' · ⬆️ puede subir de nivel' : ''}`);
    }
    return texto(`✨ ${signo(ctx.o.cantidad)} PX\n${lineas.join('\n')}`);
  },

  async zenit(ctx) {
    const lista = ctx.o.personaje ? [await resolverPj(ctx, ctx.o.personaje)] : await grupo(ctx);
    if (!lista.length) throw new Aviso('No hay personajes.');
    const lineas = [];
    for (const pj of lista) {
      pj.zenit = Math.max(0, (pj.zenit || 0) + ctx.o.cantidad);
      await P.escribir(pj);
      lineas.push(`**${M.nombre(pj)}** · ${pj.zenit} z`);
    }
    return texto(`💰 ${signo(ctx.o.cantidad)} z\n${lineas.join('\n')}`);
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
    const pj = await P.obtener(id);
    if (!pj) throw new Aviso('El personaje ya no existe.');
    if (!puedeEditar(ctx, pj)) throw new Aviso('Solo su jugador o el DJ pueden gastar esos PM.');
    const c = M.calc(pj, ctx.db);
    const rec = M.recursos(pj, c);
    if (rec.pm < coste) throw new Aviso(`${M.nombre(pj)} solo tiene ${rec.pm} PM.`);
    pj.estado = pj.estado || {};
    pj.estado.pm = rec.pm - coste;
    await P.escribir(pj);
    const comps = (ctx.i.message.components || []).map((f) => ({ ...f, components: f.components.filter((b) => !b.custom_id.startsWith('pm:')) })).filter((f) => f.components.length);
    const embeds = original ? [{ ...original, footer: { text: `${original.footer ? original.footer.text + ' · ' : ''}Gastados ${coste} PM (quedan ${pj.estado.pm})` } }] : [];
    return actualizar({ embeds, components: comps });
  }

  if (tipo === 'rr') {
    const [, sub, id, ...resto] = partes;
    const pj = await P.obtener(id);
    if (!pj) throw new Aviso('El personaje ya no existe.');
    if (!puedeEditar(ctx, pj)) throw new Aviso('Solo su jugador o el DJ pueden repetir esta tirada.');
    if ((pj.pf || 0) < 1) throw new Aviso(`${M.nombre(pj)} no tiene Puntos Fábula.`);
    pj.pf -= 1;
    await P.escribir(pj);
    ctx._todos = null;
    let res;
    if (sub === 't') {
      const [a1, a2, bono, dif] = resto;
      res = await hacerTirada(ctx, { a1, a2, bono: Number(bono) || 0, dif: dif === '' ? null : Number(dif), pjValor: id });
    } else if (sub === 'a') {
      const [idx, bono] = resto;
      res = await hacerAtaque(ctx, { arma: idx, bono: Number(bono) || 0, pjValor: id });
    } else if (sub === 'c') {
      const [cjId, obj, bono, atr] = resto;
      res = await hacerConjuro(ctx, { conjuro: cjId, objetivos: Number(obj) || 1, bono: Number(bono) || 0, atributos: atr, pjValor: id });
    } else throw new Aviso('Botón desconocido.');
    const yaGastado = !(ctx.i.message.components || []).some((f) => (f.components || []).some((b) => (b.custom_id || '').startsWith('pm:')));
    if (yaGastado) res.components = (res.components || []).map((f) => ({ ...f, components: f.components.filter((b) => !b.custom_id.startsWith('pm:')) })).filter((f) => f.components.length);
    const pjAhora = await P.obtener(id);
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
  const filtra = (lista) => lista.filter((x) => !q || P.norm(x.name).includes(q)).slice(0, 25);
  let choices = [];
  try {
    if (f.name === 'personaje') {
      choices = filtra((await ctx.todos()).map((p) => ({ name: `${M.nombre(p)}${p.discord && p.discord.nombre ? ` · ${p.discord.nombre}` : ''}`.slice(0, 100), value: p.id })));
    } else if (f.name === 'arma') {
      const pj = await resolverPj(ctx, ctx.o.personaje);
      choices = filtra(M.calc(pj, ctx.db).ataques.map((a, i) => ({ name: a.nombre.slice(0, 100), value: String(i) })));
    } else if (f.name === 'conjuro') {
      const pj = await resolverPj(ctx, ctx.o.personaje);
      choices = filtra(conjurosDe(pj, ctx.db).map((c) => ({ name: `${c.nombre} · ${c.pm} PM`.slice(0, 100), value: c.id })));
    } else if (f.name === 'nombre') {
      choices = filtra((await P.relojes()).map((r) => ({ name: `${r.nombre} (${r.llenas}/${r.secciones})`.slice(0, 100), value: r.nombre.slice(0, 100) })));
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

export { MANEJADORES };
