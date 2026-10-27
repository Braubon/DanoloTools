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

/**
 * Secciones de la ficha con lo que se conoce.
 * v = ficha completa (completo = true) o vista revelada (vistaRevelada de pnj.js).
 */
export function htmlSeccionesPnj(v, estados = [], completo = false) {
  const nivel = completo ? 16 : v.revelado || 0;
  let h = '';
  if (nivel >= 13 && v.atributos) {
    const dados = N.dadosPnj(v, estados);
    const inm = v.inmunidades_estados || [];
    h += `<div class="bloque"><div class="numeros">
        <div class="stat"><div class="k">DEF</div><div class="v">${v.defensa}</div></div>
        <div class="stat"><div class="k">D. Mág</div><div class="v">${v.defensa_magica}</div></div>
        ${completo ? `<div class="stat"><div class="k">Inic.</div><div class="v">${v.iniciativa}</div></div><div class="stat"><div class="k">Nivel</div><div class="v">${v.nivel}</div></div>` : ''}
      </div></div>
      <div class="bloque"><h4>Atributos</h4><div class="atributos">${N.ATR.map((a) => `<div class="atributo"><div class="k">${a}</div><div class="v ${dados[a] < v.atributos[a] ? 'baja' : ''}">d${dados[a]}</div><div class="b">${dados[a] < v.atributos[a] ? `de d${v.atributos[a]}` : '&nbsp;'}</div></div>`).join('')}</div></div>
      <div class="bloque"><h4>Afinidades</h4>${htmlAfinidades(v.afinidades || {})}
        ${inm.length ? `<div class="fila small" style="margin-top:6px"><span class="muted">Inmune a</span>${inm.map((e) => `<span class="chip">${esc(N.nombreEstado(e))}</span>`).join('')}</div>` : ''}</div>
      ${v.rasgos && v.rasgos.length ? `<div class="bloque"><h4>Rasgos</h4><div class="fila">${v.rasgos.map((r) => `<span class="chip">${esc(r)}</span>`).join('')}</div></div>` : ''}`;
  }
  if (nivel >= 16) {
    const reglas = completo ? N.reglasVisibles(v) : v.reglas || [];
    h += listaPnj('Ataques básicos', (v.ataques || []).map((a) => `<div class="item"><div class="titulo">${esc(a.nombre)}</div><div class="mono small">${esc(N.textoAtaque(a))}</div>${a.efecto ? `<div class="sub">${esc(a.efecto)}</div>` : ''}</div>`));
    h += listaPnj('Conjuros', (v.conjuros || []).map((c, k) => `<details class="item" data-det="pcj:${k}"><summary><span class="titulo">${esc(c.nombre)}</span><span class="muted small">${esc(N.metaConjuroPnj(c))}</span></summary><div class="cuerpo texto">${md(c.efecto)}</div></details>`));
    h += listaPnj('Otras acciones', (v.otras_acciones || []).map((x, k) => `<details class="item" data-det="poa:${k}"><summary><span class="titulo">${esc(x.nombre)}</span></summary><div class="cuerpo texto">${md(x.efecto)}</div></details>`));
    h += listaPnj('Habilidades y reglas especiales', reglas.map((x, k) => `<details class="item" data-det="prg:${k}"><summary><span class="titulo">${esc(x.nombre)}</span></summary><div class="cuerpo texto">${md(x.efecto)}</div></details>`));
  }
  return h;
}

/** Todo lo que ve el DJ de una ficha, salvo el estado del combate. */
export function htmlPnjCompleto(t, estados = []) {
  const cr = N.crisisPnj(t);
  return `<div class="bloque"><div class="numeros">
      <div class="stat"><div class="k">PV máx</div><div class="v">${t.pv}</div></div>
      <div class="stat"><div class="k">PM máx</div><div class="v">${t.pm}</div></div>
      <div class="stat"><div class="k">Crisis</div><div class="v">${cr}</div></div>
      <div class="stat"><div class="k">Rango</div><div class="v" style="font-size:13px">${esc(N.nombreRango(t))}</div></div>
    </div>${t.villano ? `<div class="fila small" style="margin-top:6px"><span class="chip acento">${esc(N.nombreVillano(t.villano))}</span><span class="muted">${t.puntos_ultima} Puntos Última</span></div>` : ''}
    ${t.siguiente_fase ? `<p class="nota" style="margin:6px 0 0">Al caer pasa a la fase: <code>${esc(t.siguiente_fase)}</code></p>` : ''}</div>
    ${htmlSeccionesPnj(t, estados, true)}
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
    ${htmlSeccionesPnj(v, estados, false)}`;
}

/** Subtítulo de la cabecera según lo que se conoce. */
export function subtituloPnj(e, completo, t) {
  if (completo) return `${t.nombre !== e.nombre ? t.nombre + ' · ' : ''}Nivel ${t.nivel} · ${N.nombreRango(t)} · ${N.nombreEspecie(t.especie)}`;
  const v = e.info || {};
  return (v.revelado || 0) >= 10 ? `${N.nombreRango(v)} · ${N.nombreEspecie(v.especie)}` : (e.lado === 'aliado' ? 'Aliado' : 'Perfil desconocido');
}
