// Piezas de presentación compartidas por el generador y el visor.
import { esc, md } from './ui.js';
import { get, tabla, nombreAtlas } from './db.js';
import { ATR, nivelClase, fmtPrecision, fmtDano, fmtDado, RANURA_NOMBRE } from './rules.js';

const TIPO_HAB = { pasiva: 'Pasiva', accion: 'Acción', reaccion: 'Reacción', otra: 'Especial' };
export const nombreTipoHab = (t) => TIPO_HAB[t] || t || '';

export const nombreDano = (db, id) => (tabla(db, 'tipos_dano').find((x) => x.id === id) || { nombre: id }).nombre;
export const nombreCategoria = (db, id) => (tabla(db, 'categorias_arma').find((x) => x.id === id) || { nombre: id || '' }).nombre;
export const nombreEmocion = (db, id) => (tabla(db, 'emociones').find((x) => x.id === id) || { nombre: id }).nombre;
export const nombreEstado = (db, id) => (tabla(db, 'estados').find((x) => x.id === id) || { nombre: id }).nombre;

export function resumenClases(pj, db) {
  if (!pj.clases.length) return 'Sin clases';
  return pj.clases.map((c) => `${(get(db, 'clases', c.id) || { nombre: c.id }).nombre} ${nivelClase(c)}`).join(' · ');
}

export const atlasTag = (db, rec, mostrar = true) => (mostrar && rec && rec._atlas && rec._atlas !== 'basico'
  ? `<span class="etiqueta-atlas">${esc(nombreAtlas(db, rec._atlas))}</span>` : '');

export function etiquetasClase(def) {
  if (!def || !Array.isArray(def.etiquetas) || !def.etiquetas.length) return '';
  return def.etiquetas.map((t) => `<span class="etiqueta-rol">${esc(t)}</span>`).join('');
}

export function slDots(sl, max) {
  if (max <= 1) return '';
  const n = Math.min(max, 10);
  let h = '<span class="sl" aria-label="SL ' + sl + ' de ' + max + '">';
  for (let i = 1; i <= n; i++) h += `<i class="${i <= sl ? 'on' : ''}"></i>`;
  return h + '</span>';
}

/** Estadísticas principales. estado = { pv, pm, pi } actuales (opcional). */
export function htmlStats(c, pj, { mostrarActual = true } = {}) {
  const e = pj.estado || {};
  const nd = c.incompleto;
  const par = (act, max) => (nd ? '—' : (mostrarActual && act !== null && act !== undefined ? `${act}<small> / ${max}</small>` : `${max}`));
  const sig = (n) => (nd ? '—' : `${n >= 0 ? '+' : ''}${n}`);
  return `<div class="stats">
    <div class="stat pv"><div class="k">PV${nd ? '' : ` <span class="faint">· Crisis ${c.crisis}</span>`}</div><div class="v">${par(e.pv, c.pv_max)}</div></div>
    <div class="stat pm"><div class="k">PM</div><div class="v">${par(e.pm, c.pm_max)}</div></div>
    <div class="stat pi"><div class="k">PI</div><div class="v">${par(e.pi, c.pi_max)}</div></div>
    <div class="stat"><div class="k">DEF</div><div class="v">${nd ? '—' : c.def}</div></div>
    <div class="stat"><div class="k">D. Mág</div><div class="v">${nd ? '—' : c.mdef}</div></div>
    <div class="stat"><div class="k">Inic.</div><div class="v">${sig(c.init)}</div></div>
  </div>`;
}

export function htmlAtributos(c) {
  return '<div class="atributos">' + ATR.map((a) => `
    <div class="atributo"><div class="k">${a}</div><div class="v">${fmtDado(c.actual[a])}</div>
    <div class="b">${c.actual[a] !== c.base[a] ? 'base ' + fmtDado(c.base[a]) : '&nbsp;'}</div></div>`).join('') + '</div>';
}

export function htmlAtaques(c, db) {
  return '<div class="lista">' + c.ataques.map((a) => `
    <div class="item">
      <div class="fila entre"><span class="titulo">${esc(a.nombre)}</span>
        <span class="muted small">${esc(nombreCategoria(db, a.categoria))} · ${a.alcance === 'cuerpo' ? 'Cuerpo a cuerpo' : 'A distancia'} · ${a.manos === 2 ? '2 manos' : '1 mano'}${a.marcial ? ' · Marcial' : ''}</span></div>
      <div class="fila mono"><span>${esc(fmtPrecision(a.precision))}</span><span class="faint">→</span><span>${esc(fmtDano(a.dano, db))}</span></div>
      ${a.cualidad ? `<div class="sub">${esc(a.cualidad)}</div>` : ''}
    </div>`).join('') + '</div>';
}

export function htmlDetalles(def) {
  let h = '';
  if (def.detalles) h += '<dl class="detalle">' + def.detalles.map((d) => `<dt>${esc(d.etiqueta)}</dt><dd class="texto">${md(d.texto)}</dd>`).join('') + '</dl>';
  if (def.efecto) h += `<div class="texto">${md(def.efecto)}</div>`;
  return h;
}

export function htmlHabilidad(db, def, sl, { extra = '', abierto = false, derecha = '', clase = '' } = {}) {
  if (!def) return '';
  return `<details class="item ${clase}" ${abierto ? 'open' : ''} data-busqueda="${esc((def.nombre + ' ' + (def.efecto || '')).toLowerCase())}">
    <summary><span class="titulo">${esc(def.nombre)}</span>
      ${def.sl_max > 1 ? `<span class="muted small">SL ${sl}/${def.sl_max}</span>` : ''}
      <span class="der">${derecha}<span class="chip">${nombreTipoHab(def.tipo)}</span></span></summary>
    <div class="cuerpo">
      ${def.activacion ? `<p class="small muted"><strong>Activación:</strong> ${esc(def.activacion)}</p>` : ''}
      <div class="texto">${md(def.efecto)}</div>${extra}
    </div></details>`;
}

export function metaConjuro(cj) {
  return [cj.pm ? cj.pm + ' PM' : '', cj.objetivo, cj.duracion, cj.ofensivo ? 'Ofensivo' : ''].filter(Boolean).join(' · ');
}
export function htmlConjuro(db, cj, { derecha = '' } = {}) {
  return `<details class="item" data-tipo="${cj.ofensivo ? 'ofensivo' : 'apoyo'}" data-busqueda="${esc((cj.nombre + ' ' + (cj.efecto || '')).toLowerCase())}"><summary><span class="titulo">${esc(cj.nombre)}</span>
    <span class="muted small">${esc(metaConjuro(cj))}</span><span class="der">${derecha}${atlasTag(db, cj)}</span></summary>
    <div class="cuerpo texto">${md(cj.efecto)}${cj.oportunidad ? `<p><strong>Oportunidad:</strong> ${esc(cj.oportunidad)}</p>` : ''}</div></details>`;
}

export function htmlOpcion(db, op, { derecha = '' } = {}) {
  const meta = op.duracion ? `<span class="muted small">${esc(op.duracion)}</span>` : '';
  return `<details class="item" data-busqueda="${esc((op.nombre + ' ' + (op.efecto || '') + ' ' + (op.detalles || []).map((d) => d.texto).join(' ')).toLowerCase())}"><summary><span class="titulo">${esc(op.nombre)}</span>${meta}
    <span class="der">${derecha}${atlasTag(db, op)}</span></summary><div class="cuerpo">${htmlDetalles(op)}</div></details>`;
}

/** Línea de características de un objeto según su tipo. */
export function lineaObjeto(o, db) {
  if (!o) return '';
  switch (o._col) {
    case 'armas': return [nombreCategoria(db, o.categoria), fmtPrecision(o.precision), fmtDano(o.dano, db),
      o.manos === 2 ? '2 manos' : '1 mano', o.alcance === 'cuerpo' ? 'Cuerpo a cuerpo' : 'Distancia', o.marcial ? 'Marcial' : ''].filter(Boolean).join(' · ');
    case 'armaduras': {
      const d = (x, k) => (x.fijo !== undefined ? x.fijo : `${k}${x.bonus ? ' +' + x.bonus : ''}`);
      return [`DEF ${d(o.def, 'DES')}`, `D.Mág ${d(o.mdef, 'PER')}`, `Inic. ${o.init || 0}`, o.marcial ? 'Marcial' : ''].filter(Boolean).join(' · ');
    }
    case 'escudos': return [`DEF +${o.def || 0}`, `D.Mág +${o.mdef || 0}`, o.init ? `Inic. ${o.init}` : '', o.marcial ? 'Marcial' : ''].filter(Boolean).join(' · ');
    default: return '';
  }
}

export function htmlObjeto(db, o, { derecha = '', sub = '' } = {}) {
  const coste = o.coste ? `<span class="muted small mono">${o.coste} z</span>` : '';
  const linea = lineaObjeto(o, db);
  const extra = [];
  if (o.descripcion) extra.push(`<p class="muted">${esc(o.descripcion)}</p>`);
  if (o.cualidad) extra.push(`<div class="texto">${md(o.cualidad)}</div>`);
  if (o.efecto) extra.push(`<div class="texto">${md(o.efecto)}</div>`);
  if (o.forma2) extra.push(`<p class="small"><strong>Segunda forma:</strong> ${esc(o.forma2.nombre)} — ${esc(lineaObjeto({ ...o.forma2, _col: 'armas' }, db))}</p>`);
  if (o.personalizaciones && o.personalizaciones.length) extra.push(`<p class="small muted">Personalizaciones: ${esc(o.personalizaciones.join(', '))}</p>`);
  if (o.notas) extra.push(`<p class="small muted">${esc(o.notas)}</p>`);
  return `<details class="item" data-tipo="${esc(o._col || '')}" data-busqueda="${esc((o.nombre + ' ' + linea + ' ' + (o.cualidad || '') + ' ' + (o.efecto || '')).toLowerCase())}"><summary>
    <span><span class="titulo">${esc(o.nombre)}</span>${o.rareza === 'raro' ? ' <span class="chip acento">Raro</span>' : ''}${o.rareza === 'personalizada' ? ' <span class="chip acento">Personalizada</span>' : ''}${o._faltante ? ' <span class="chip err">No encontrado</span>' : ''}
    ${linea ? `<br><span class="muted small mono">${esc(linea)}</span>` : ''}${sub}</span>
    <span class="der">${coste}${atlasTag(db, o)}${derecha}</span></summary>
    <div class="cuerpo">${extra.join('') || '<p class="muted small">Sin cualidad.</p>'}</div></details>`;
}

export function htmlVinculo(db, v) {
  const fuerza = (v.emociones || []).length;
  return `<div class="item fila entre"><span><span class="titulo">${esc(v.hacia || '—')}</span>
    <span class="muted small"> · ${(v.emociones || []).map((e) => esc(nombreEmocion(db, e))).join(', ') || 'sin emociones'}</span></span>
    <span class="chip ${fuerza ? 'acento' : ''}">Fuerza ${fuerza}</span></div>`;
}

export const nombreRanura = (r) => RANURA_NOMBRE[r] || r;
