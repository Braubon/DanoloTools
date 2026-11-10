// ---------------------------------------------------------------------------
// Presentación de fichas de PNJ (HTML). La usan la vista de combate y la
// vista previa del editor de PNJ, para que se vean igual en los dos sitios.
// Estilos: assets/css/combate.css (clases .bloque, .numeros, .afin…).
// ---------------------------------------------------------------------------
import * as N from './pnj.js';
import { esc, md } from './ui.js';

export const barraRec = (k, cls, act, max) => `<div class="rec"><span class="k">${k}</span><div class="barra ${cls}"><i style="width:${Math.max(0, Math.min(100, (act / (max || 1)) * 100))}%"></i></div><span class="v">${act}<small> / ${max}</small></span></div>`;

export const htmlAfinidades = (af) => `<div class="afin">${N.TIPOS_DANO.map(([k, n]) => `<div class="${af[k] || ''}" title="${esc(n)}${af[k] ? ': ' + N.AFINIDADES[af[k]] : ''}">${esc(n.slice(0, 3))}<b>${af[k] || '—'}</b></div>`).join('')}</div>`;
const listaPnj = (titulo, items) => (items && items.length ? `<div class="bloque"><h4>${titulo}</h4><div class="lista">${items.join('')}</div></div>` : '');

export function htmlBufos(bufos = [], { permitirQuitar = false, clave = '' } = {}) {
  if (!bufos || !bufos.length) return '';
  return `<div class="bloque"><h4>Bufos y efectos activos</h4><div class="lista">${bufos.map((b, idx) => {
    const detalles = [];
    if (b.def) detalles.push(`${b.def > 0 ? '+' : ''}${b.def} DEF`);
    if (b.mdef) detalles.push(`${b.mdef > 0 ? '+' : ''}${b.mdef} D.Mág`);
    if (b.dano) detalles.push(`${b.dano > 0 ? '+' : ''}${b.dano} Daño`);
    if (b.tipo_dano) detalles.push(`Tipo ${N.nombreTipoDano(b.tipo_dano).toLowerCase()}`);
    if (b.precision) detalles.push(`${b.precision > 0 ? '+' : ''}${b.precision} Prec`);
    if (b.init) detalles.push(`${b.init > 0 ? '+' : ''}${b.init} Inic`);
    if (b.pv_max) detalles.push(`${b.pv_max > 0 ? '+' : ''}${b.pv_max} PV máx`);
    if (b.pm_max) detalles.push(`${b.pm_max > 0 ? '+' : ''}${b.pm_max} PM máx`);
    if (b.atributos) {
      for (const [k, v] of Object.entries(b.atributos)) {
        if (v) detalles.push(`${k} ${v > 0 ? '+' : ''}${v} paso${Math.abs(v) > 1 ? 's' : ''}`);
      }
    }
    if (b.afinidades) {
      for (const [k, v] of Object.entries(b.afinidades)) {
        if (v) detalles.push(`${N.nombreTipoDano(k)} ${v}`);
      }
    }
    if (b.duracion) detalles.push(b.duracion);
    const sub = detalles.join(' · ') || 'Efecto activo';
    const btnQuitar = permitirQuitar
      ? `<button class="btn icono fantasma peq" data-act="quitar-bufo" data-clave="${esc(clave)}" data-bufo-id="${esc(b.id || String(idx))}" data-bufo-nombre="${esc(b.nombre || '')}" title="Quitar bufo" aria-label="Quitar bufo">✕</button>`
      : '';
    return `<div class="item bufo-item"><div class="fila entre"><span class="titulo">✨ ${esc(b.nombre || 'Efecto')}</span>${btnQuitar}</div><div class="sub small">${esc(sub)}</div></div>`;
  }).join('')}</div></div>`;
}

/**
 * Secciones de la ficha con lo que se conoce.
 * v = ficha completa (completo = true) o vista revelada (vistaRevelada de pnj.js).
 */
export function htmlSeccionesPnj(v, estados = [], completo = false, inst = null) {
  const nivel = completo ? 16 : v.revelado || 0;
  let h = '';
  if (nivel >= 13 && v.atributos) {
    const st = inst && inst.bufos ? N.statsEfectivasPnj(v, inst) : null;
    const def = st ? st.def : v.defensa;
    const mdef = st ? st.mdef : v.defensa_magica;
    const init = st ? st.init : v.iniciativa;
    const dados = st ? st.dados : N.dadosPnj(v, estados);
    const afins = st ? st.afinidades : (v.afinidades || {});
    const baseAtr = st ? st.atributos : v.atributos;
    const inm = v.inmunidades_estados || [];
    h += `<div class="bloque"><div class="numeros">
        <div class="stat"><div class="k">DEF</div><div class="v ${st && st.mods.def ? 'acento' : ''}">${def}</div></div>
        <div class="stat"><div class="k">D. Mág</div><div class="v ${st && st.mods.mdef ? 'acento' : ''}">${mdef}</div></div>
        ${completo ? `<div class="stat"><div class="k">Inic.</div><div class="v ${st && st.mods.init ? 'acento' : ''}">${init}</div></div><div class="stat"><div class="k">Nivel</div><div class="v">${v.nivel}</div></div>` : ''}
      </div></div>
      <div class="bloque"><h4>Atributos</h4><div class="atributos">${N.ATR.map((a) => `<div class="atributo"><div class="k">${a}</div><div class="v ${dados[a] < baseAtr[a] ? 'baja' : ''}">d${dados[a]}</div><div class="b">${dados[a] < baseAtr[a] ? `de d${baseAtr[a]}` : '&nbsp;'}</div></div>`).join('')}</div></div>
      <div class="bloque"><h4>Afinidades</h4>${htmlAfinidades(afins)}
        ${inm.length ? `<div class="fila small" style="margin-top:6px"><span class="muted">Inmune a</span>${inm.map((e) => `<span class="chip">${esc(N.nombreEstado(e))}</span>`).join('')}</div>` : ''}</div>
      ${v.rasgos && v.rasgos.length ? `<div class="bloque"><h4>Rasgos</h4><div class="fila">${v.rasgos.map((r) => `<span class="chip">${esc(r)}</span>`).join('')}</div></div>` : ''}`;
  }
  if (nivel >= 16) {
    const st = inst && inst.bufos ? N.statsEfectivasPnj(v, inst) : null;
    const ataques = st ? st.ataques : (v.ataques || []);
    const reglas = completo ? N.reglasVisibles(v) : v.reglas || [];
    h += listaPnj('Ataques básicos', ataques.map((a) => `<div class="item"><div class="titulo">${esc(a.nombre)}</div><div class="mono small">${esc(N.textoAtaque(a))}</div>${a.efecto ? `<div class="sub">${esc(a.efecto)}</div>` : ''}</div>`));
    h += listaPnj('Conjuros', (v.conjuros || []).map((c, k) => `<details class="item" data-det="pcj:${k}"><summary><span class="titulo">${esc(c.nombre)}</span><span class="muted small">${esc(N.metaConjuroPnj(c))}</span></summary><div class="cuerpo texto">${md(c.efecto)}</div></details>`));
    h += listaPnj('Otras acciones', (v.otras_acciones || []).map((x, k) => `<details class="item" data-det="poa:${k}"><summary><span class="titulo">${esc(x.nombre)}</span></summary><div class="cuerpo texto">${md(x.efecto)}</div></details>`));
    h += listaPnj('Habilidades y reglas especiales', reglas.map((x, k) => `<details class="item" data-det="prg:${k}"><summary><span class="titulo">${esc(x.nombre)}</span></summary><div class="cuerpo texto">${md(x.efecto)}</div></details>`));
  }
  return h;
}

/** Todo lo que ve el DJ de una ficha, salvo el estado del combate. */
export function htmlPnjCompleto(t, estados = [], inst = null) {
  const st = inst && inst.bufos ? N.statsEfectivasPnj(t, inst) : null;
  const pvMax = st ? st.pv_max : t.pv;
  const pmMax = st ? st.pm_max : t.pm;
  const cr = st ? st.crisis : N.crisisPnj(t);
  return `<div class="bloque"><div class="numeros">
      <div class="stat"><div class="k">PV máx</div><div class="v ${st && st.mods.pv_max ? 'acento' : ''}">${pvMax}</div></div>
      <div class="stat"><div class="k">PM máx</div><div class="v ${st && st.mods.pm_max ? 'acento' : ''}">${pmMax}</div></div>
      <div class="stat"><div class="k">Crisis</div><div class="v">${cr}</div></div>
      <div class="stat"><div class="k">Rango</div><div class="v" style="font-size:13px">${esc(N.nombreRango(t))}</div></div>
    </div>${t.villano ? `<div class="fila small" style="margin-top:6px"><span class="chip acento">${esc(N.nombreVillano(t.villano))}</span><span class="muted">${t.puntos_ultima} Puntos Última</span></div>` : ''}
    ${t.siguiente_fase ? `<p class="nota" style="margin:6px 0 0">Al caer pasa a la fase: <code>${esc(t.siguiente_fase)}</code></p>` : ''}</div>
    ${htmlSeccionesPnj(t, estados, true, inst)}
    ${t.equipo ? `<div class="bloque"><h4>Equipo</h4><p class="small">${esc(t.equipo)}</p></div>` : ''}
    ${t.botin ? `<div class="bloque"><h4>Botín</h4><div class="texto small">${md(t.botin)}</div></div>` : ''}
    ${t.notas ? `<div class="bloque"><h4>Notas</h4><div class="texto small">${md(t.notas)}</div></div>` : ''}`;
}

/**
 * Lo que ve un jugador de un PNJ (sin cabecera).
 * e = { info: vistaRevelada + nombre/descripcion, dano, estados, pv?, pm?, lado }
 */
export function htmlPnjJugador(e) {
  const v = e.info || { revelado: 0 };
  const nivel = v.revelado || 0;
  const estados = e.estados || [];
  let rec = '';
  if (e.pv !== undefined && v.pv) rec = `${barraRec('PV', 'pv', e.pv, v.pv)}${e.pm !== undefined && v.pm ? barraRec('PM', 'pm', e.pm, v.pm) : ''}`;
  return `<div class="bloque">${rec}
      <div class="fila small">${e.dano ? `<span class="chip err">Daño recibido: ${e.dano}</span>` : '<span class="faint">Sin daño recibido</span>'}</div>
      ${estados.length ? `<div class="fila small" style="margin-top:6px">${estados.map((s) => `<span class="chip err">${esc(N.nombreEstado(s))}</span>`).join('')}</div>` : ''}
      ${v.descripcion && nivel >= 10 ? `<p class="small muted" style="margin-top:8px"><em>${esc(v.descripcion)}</em></p>` : ''}
      ${nivel < 16 && e.lado !== 'aliado' ? `<p class="nota" style="margin-top:10px">${nivel ? `Sabéis: ${esc(N.textoRevelado(nivel))}.` : 'No sabéis nada de su perfil.'} Usa <code>/estudiar</code> en Discord para descubrir más.</p>` : ''}
    </div>
    ${htmlBufos(e.bufos || [], { permitirQuitar: false, clave: e.clave || '' })}
    ${htmlSeccionesPnj(v, estados, false, e)}`;
}

/** Subtítulo de la cabecera según lo que se conoce. */
export function subtituloPnj(e, completo, t) {
  if (completo) return `${t.nombre !== e.nombre ? t.nombre + ' · ' : ''}Nivel ${t.nivel} · ${N.nombreRango(t)} · ${N.nombreEspecie(t.especie)}`;
  const v = e.info || {};
  return (v.revelado || 0) >= 10 ? `${N.nombreRango(v)} · ${N.nombreEspecie(v.especie)}` : (e.lado === 'aliado' ? 'Aliado' : 'Perfil desconocido');
}
