// ---------------------------------------------------------------------------
// Generador de personajes de Fabula Ultima
// ---------------------------------------------------------------------------
import { cargarRaw, construirDb, get, hab, tabla, param, nombreAtlas } from './db.js';
import * as R from './rules.js';
import { esc, md, initTema, descargarJson, leerArchivo, slugArchivo, toast, ICON, normTxt } from './ui.js';
import * as F from './ficha.js';

const LS_PJ = 'fu-generador-pj';
const LS_TAB = 'fu-generador-tab';

let raw, dbTodo, db, pj;
let tab = leerLS(LS_TAB) || 'contenido';
const ui = {
  tienda: { col: 'armas', rareza: 'basico', q: '', atlas: '' },
  nivel: { clase: '', habilidad: '', heroica: '', atributo: '', identidad: '', tema: '' },
  filtroClaseTag: 'todas',
  filtroSubidaTag: 'todas',
  ap: null, // arma personalizada en edición
  rm: null, // objeto raro a medida en edición
  ol: null  // objeto libre
};

function leerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function escribirLS(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }

let tGuardar = null;
function guardar() {
  clearTimeout(tGuardar);
  tGuardar = setTimeout(() => escribirLS(LS_PJ, JSON.stringify(pj)), 250);
}

const libre = () => !!pj.modo_libre;
const creando = () => !pj.creacion_completa;
const panel = () => document.getElementById('panel');

function reconstruirDb() { db = construirDb(raw, pj.contenido); }

/** Se llama tras cada modificación del personaje. */
function cambio({ panel: rp = true } = {}) {
  pj.modificado = new Date().toISOString();
  guardar();
  if (rp) renderPanel();
  renderResumen();
  renderPestanas();
}

// =========================================================== arranque
async function iniciar() {
  initTema();
  try {
    raw = await cargarRaw('../data/');
  } catch (e) {
    panel().innerHTML = `<div class="vacio"><p><strong>No se pudo cargar la base de datos.</strong></p><p class="small">${esc(e.message)}</p>
      <p class="small">Si has abierto el archivo directamente, sirve la carpeta con un servidor local (por ejemplo <code>npx serve .</code>) o súbela a Vercel.</p></div>`;
    return;
  }
  dbTodo = construirDb(raw, null);
  if (dbTodo.avisos.length) console.warn(dbTodo.avisos.join('\n'));
  const guardado = leerLS(LS_PJ);
  pj = guardado ? R.normalizarPersonaje(JSON.parse(guardado)) : R.nuevoPersonaje();
  reconstruirDb();
  render();
}

function render() { renderPestanas(); renderPanel(); renderResumen(); }

// =========================================================== pestañas
const AMBITO_TAB = { identidad: 'identidad', clases: 'clases', elecciones: 'clases', heroicas: 'clases', atributos: 'atributos', equipo: 'equipo', vinculos: 'vinculos', opcionales: 'extras' };

function listaPestanas() {
  const t = [['contenido', 'Contenido'], ['identidad', 'Identidad'], ['clases', 'Clases'], ['atributos', 'Atributos'], ['equipo', 'Equipo'], ['vinculos', 'Vínculos']];
  if (db.col.peculiaridades.length || db.col.poderes_cero_efectos.length) t.push(['extras', 'Reglas opcionales']);
  t.push(['progreso', creando() ? 'Finalizar' : 'Progreso'], ['ficha', 'Ficha']);
  return t;
}

function renderPestanas() {
  const val = R.validar(pj, db, dbTodo);
  const marca = {};
  for (const v of val) {
    const t = AMBITO_TAB[v.ambito];
    if (!t) continue;
    if (v.nivel === 'error') marca[t] = 'error'; else if (!marca[t]) marca[t] = 'aviso';
  }
  const lista = listaPestanas();
  if (!lista.some(([id]) => id === tab)) tab = 'contenido';
  document.getElementById('pestanas').innerHTML = lista.map(([id, n]) =>
    `<button role="tab" aria-selected="${id === tab}" data-act="tab" data-id="${id}">${n}${marca[id] ? `<span class="punto ${marca[id] === 'aviso' ? 'aviso' : ''}"></span>` : ''}</button>`).join('');
  const ml = document.getElementById('modo-libre');
  ml.setAttribute('aria-pressed', String(libre()));
}

function renderPanel() {
  const p = panel();
  const abiertos = new Set(
    Array.from(p.querySelectorAll('details[open][data-det]')).map((d) => d.dataset.det)
  );
  const fn = {
    contenido: panelContenido, identidad: panelIdentidad, clases: panelClases, atributos: panelAtributos,
    equipo: panelEquipo, vinculos: panelVinculos, extras: panelExtras, progreso: panelProgreso, ficha: panelFicha
  }[tab] || panelContenido;
  p.innerHTML = fn();
  for (const d of p.querySelectorAll('details[data-det]')) {
    if (abiertos.has(d.dataset.det)) d.open = true;
  }
}

// =========================================================== resumen lateral
function renderResumen() {
  const c = R.calcular(pj, dbTodo);
  const val = R.validar(pj, db, dbTodo);
  const errores = val.filter((v) => v.nivel === 'error');
  const avisos = val.filter((v) => v.nivel === 'aviso');
  const lista = [...errores, ...avisos];
  const gasto = pj.equipo.objetos.reduce((a, o) => a + (o.coste_pagado || 0), 0);
  const pres = param(db, 'presupuesto_inicial', 500);
  document.getElementById('resumen').innerHTML = `
    <div class="tarjeta">
      <div class="display" style="font-size:24px;line-height:1.1">${esc(pj.identidad.nombre || 'Sin nombre')}</div>
      <div class="muted small" style="margin:2px 0 10px">${esc(pj.identidad.identidad || 'Identidad por definir')}</div>
      <div class="fila entre small" style="margin-bottom:10px"><span>Nivel <strong>${pj.nivel}</strong></span>
        <span class="muted">${esc(F.resumenClases(pj, dbTodo))}</span></div>
      ${F.htmlStats(c, pj, { mostrarActual: !creando() })}
      <div style="margin-top:10px">${F.htmlAtributos(c)}</div>
      <div class="fila entre small" style="margin-top:10px">
        ${creando() ? `<span class="muted">Presupuesto</span><span class="mono">${pres - gasto} / ${pres} z</span>` : `<span class="muted">Zenit</span><span class="mono">${pj.zenit} z</span>`}
      </div>
      <div class="fila entre small"><span class="muted">PF · PX</span><span class="mono">${pj.pf} · ${pj.px}</span></div>
    </div>
    <div class="tarjeta validacion">
      <h3>${errores.length ? `${errores.length} pendiente${errores.length > 1 ? 's' : ''}` : 'Validación'}${libre() ? ' · modo libre' : ''}</h3>
      ${lista.length ? `<ul>${lista.slice(0, 10).map((v) => `<li class="${v.nivel}">${esc(v.msg)}</li>`).join('')}</ul>${lista.length > 10 ? `<p class="faint small">y ${lista.length - 10} más…</p>` : ''}`
        : '<p class="ok-total">La ficha cumple las reglas.</p>'}
    </div>`;
}

// =========================================================== helpers de formulario
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
  o[ks[ks.length - 1]] = val;
}
function campo(etq, path, { tipo = 'text', lista = '', ph = '', extra = '' } = {}) {
  const v = getPath(pj, path) ?? '';
  return `<label class="campo"><span>${etq}</span>
    <div class="fila" style="flex-wrap:nowrap"><input type="${tipo}" data-bind="${path}" ${tipo === 'number' ? 'data-num="1"' : ''} value="${esc(v)}" placeholder="${esc(ph)}" ${lista ? `list="${lista}"` : ''}>${extra}</div></label>`;
}
const dadoBtn = (act, titulo) => `<button class="btn icono" data-act="${act}" title="${titulo}" aria-label="${titulo}">${ICON.dado}</button>`;
const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];
const tagAtlas = (rec) => F.atlasTag(dbTodo, rec);

// =========================================================== CONTENIDO
function panelContenido() {
  const cuenta = (atlasId) => {
    const n = (col) => dbTodo.col[col].filter((x) => x._atlas === atlasId).length;
    return [['clases', 'clases'], ['habilidades_heroicas', 'heroicas'], ['conjuros', 'conjuros'], ['armas', 'armas'], ['armaduras', 'armaduras'], ['escudos', 'escudos'], ['accesorios', 'accesorios'], ['artefactos', 'artefactos'], ['peculiaridades', 'peculiaridades']]
      .map(([c, et]) => [n(c), et]).filter(([k]) => k).map(([k, et]) => `<span class="chip">${k} ${et}</span>`).join(' ');
  };
  return `<div class="seccion"><h2>Contenido disponible</h2>
    <p class="muted">Activa los libros y reglas opcionales que se usan en tu mesa. Lo desactivado desaparece de clases, equipo, habilidades heroicas y opciones. El filtro se guarda dentro del personaje.</p></div>
    ${dbTodo.atlas.map((a) => {
      const activo = a.obligatorio || pj.contenido.atlas.includes(a.id);
      const reglas = pj.contenido.reglas[a.id] || [];
      return `<div class="tarjeta">
        <label class="fila"><input type="checkbox" data-act="atlas" data-id="${a.id}" ${activo ? 'checked' : ''} ${a.obligatorio ? 'disabled' : ''}>
          <strong>${esc(a.nombre)}</strong> <span class="muted small">${esc(a.nombre_original || '')}</span>${a.obligatorio ? ' <span class="chip">Siempre activo</span>' : ''}</label>
        <p class="muted small" style="margin:6px 0 10px">${esc(a.descripcion || '')}</p>
        <div class="fila" style="margin-bottom:${(a.reglas_opcionales || []).length ? 12 : 0}px">${cuenta(a.id)}</div>
        ${(a.reglas_opcionales || []).length ? `<div class="pila" style="border-top:1px solid var(--line);padding-top:12px">
          <div class="small muted">Reglas opcionales (desactivadas por defecto)</div>
          ${a.reglas_opcionales.map((r) => `<label class="fila ${activo ? '' : 'desactivado'}"><input type="checkbox" data-act="regla" data-atlas="${a.id}" data-id="${r.id}" ${reglas.includes(r.id) ? 'checked' : ''} ${activo ? '' : 'disabled'}>
            <span>${esc(r.nombre)} <span class="muted small">— ${esc(r.descripcion || '')}</span></span></label>`).join('')}</div>` : ''}
      </div>`;
    }).join('')}`;
}

// =========================================================== IDENTIDAD
function panelIdentidad() {
  const temas = tabla(db, 'temas');
  return `<div class="seccion"><h2>Identidad</h2><p class="muted small">La especie es puramente narrativa: no da modificadores.</p></div>
    <div class="rejilla c2">
      ${campo('Nombre', 'identidad.nombre')}
      ${campo('Pronombres', 'identidad.pronombres')}
      ${campo('Jugador/a', 'identidad.jugador')}
      ${campo('Especie', 'identidad.especie', { ph: 'Humana, elfa, autómata…' })}
    </div>
    <div class="pila" style="margin-top:12px">
      ${campo('Identidad', 'identidad.identidad', { ph: 'Caballero renegado del Imperio', extra: dadoBtn('azar-identidad', 'Identidad al azar') })}
      ${campo('Tema', 'identidad.tema', { lista: 'lista-temas', ph: 'Ambición, Deber, Esperanza…', extra: dadoBtn('azar-tema', 'Tema al azar') })}
      <datalist id="lista-temas">${temas.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      ${campo('Origen', 'identidad.origen', { ph: 'Patria, enclave o región' })}
      <label class="campo"><span>Apariencia y rasgos</span><textarea data-bind="identidad.apariencia">${esc(pj.identidad.apariencia)}</textarea></label>
      <label class="campo"><span>Notas</span><textarea data-bind="notas">${esc(pj.notas)}</textarea></label>
    </div>`;
}

function htmlMejorasAtributos(pj, editable = true) {
  const umbrales = [20, 40].filter((u) => pj.nivel >= u);
  if (!umbrales.length && !(pj.atributos.mejoras || []).length) return '';

  return `<div class="tarjeta" style="border-color:var(--accent);margin-top:14px">
    <div class="fila entre" style="margin-bottom:8px">
      <strong style="color:var(--accent)">Mejoras de atributo por nivel (niveles 20 y 40)</strong>
      <span class="chip acento">+1 paso de dado (máx. d12)</span>
    </div>
    <p class="small muted" style="margin-bottom:10px">Al alcanzar los niveles 20 y 40 eliges un atributo para aumentar permanentemente su tamaño de dado base.</p>
    <div class="pila">${umbrales.map((u, i) => {
      const m = (pj.atributos.mejoras || [])[i];
      return `<div class="fila" style="gap:10px;align-items:center;margin-bottom:6px">
        <span class="muted small" style="width:75px"><strong>Nivel ${u}:</strong></span>
        <div class="segmento">${R.ATR.map((a) => {
          let dadoPrev = pj.atributos.base[a] || 8;
          for (let k = 0; k < i; k++) {
            const prevM = (pj.atributos.mejoras || [])[k];
            if (prevM && prevM.atributo === a) dadoPrev = R.subirDado(dadoPrev);
          }
          const elegido = m && m.atributo === a;
          const maximo = !elegido && dadoPrev >= 12;
          const label = elegido
            ? `${a} d${dadoPrev} → d${R.subirDado(dadoPrev)} ✓`
            : (maximo ? `${a} d12 (máx)` : `${a} d${dadoPrev} → d${R.subirDado(dadoPrev)}`);
          return `<button data-act="mejora" data-i="${i}" data-nivel="${u}" data-atr="${a}" aria-pressed="${elegido}" ${maximo || !editable ? 'disabled' : ''}>${label}</button>`;
        }).join('')}</div>
        ${!m ? '<span class="chip err">Pendiente</span>' : ''}
      </div>`;
    }).join('')}</div>
  </div>`;
}

// =========================================================== CLASES
function panelClases() {
  const editable = true;
  const asign = R.nivelesAsignados(pj);
  let h = `<div class="seccion fila entre"><div><h2>Clases</h2>
      <p class="muted small">Reparte niveles en habilidades de clase (máx. 10 por clase, hasta 3 clases sin dominar).</p></div>
    <div class="fila" style="gap:10px;align-items:center">
      <label class="fila small" style="gap:6px">
        <span class="muted">Nivel total:</span>
        <input type="number" min="5" max="50" data-act-input="fijar-nivel" value="${pj.nivel}" style="width:70px">
      </label>
      <span class="chip ${asign === pj.nivel ? 'ok' : 'err'}">Niveles asignados: ${asign} / ${pj.nivel}</span>
    </div></div>`;

  if (!pj.clases.length) h += '<div class="vacio">Todavía no has elegido clases.</div>';
  for (const c of pj.clases) h += tarjetaClase(c, editable, asign);

  if (editable) {
    const disp = db.col.clases.filter((c) => !pj.clases.some((x) => x.id === c.id));
    const noDom = R.clasesNoDominadas(pj).length;
    const puedeAnadir = noDom < param(db, 'clases_no_dominadas_max', 3) || libre();
    if (disp.length) {
      const tagActivo = ui.filtroClaseTag || 'todas';
      const tags = ['todas', 'melé', 'distancia', 'apoyo', 'tanque', 'magia'];
      const filtradas = tagActivo === 'todas'
        ? disp
        : disp.filter((c) => (c.etiquetas || []).includes(tagActivo));
      h += `<div class="tarjeta" style="margin-top:12px">
        <div class="fila entre" style="margin-bottom:8px">
          <strong>Añadir clase</strong>
          <span class="muted small">${puedeAnadir ? `${filtradas.length} disponible${filtradas.length === 1 ? '' : 's'}` : 'Máximo 3 clases sin dominar'}</span>
        </div>
        <div class="fila" style="gap:6px;margin-bottom:10px;align-items:center">
          <span class="muted small">Filtrar:</span>
          <div class="segmento">${tags.map((t) =>
            `<button data-act="filtro-clase-tag" data-tag="${t}" aria-pressed="${tagActivo === t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`
          ).join('')}</div>
        </div>
        <div class="fila" style="flex-wrap:nowrap;gap:8px">
          <select id="nueva-clase" aria-label="Clase" style="flex:1" ${!puedeAnadir && !libre() ? 'disabled' : ''}>
            ${filtradas.length ? filtradas.map((c) =>
              `<option value="${c.id}">${esc(c.nombre)}${(c.etiquetas || []).length ? ' [' + c.etiquetas.join(', ') + ']' : ''}${c._atlas !== 'basico' ? ' · ' + esc(nombreAtlas(dbTodo, c._atlas)) : ''}</option>`
            ).join('') : '<option value="">Sin clases con esta etiqueta</option>'}
          </select>
          <button class="btn primario" data-act="anadir-clase" ${filtradas.length && (puedeAnadir || libre()) ? '' : 'disabled'}>Añadir clase</button>
        </div>
        ${!puedeAnadir && !libre() ? '<p class="small faint" style="margin-top:6px">Debes dominar al menos una de tus 3 clases actuales (nivel 10) para añadir una cuarta.</p>' : ''}
      </div>`;
    }
  }

  h += htmlMejorasAtributos(pj, editable);
  h += seccionHeroicas();
  return h;
}

function tarjetaClase(c, editable, asign) {
  const def = get(dbTodo, 'clases', c.id);
  if (!def) return `<div class="tarjeta"><strong>${esc(c.id)}</strong> <span class="chip err">No encontrada</span> <button class="btn peq peligro" data-act="quitar-clase" data-id="${c.id}">Quitar</button></div>`;
  const nv = R.nivelClase(c);
  const b = def.beneficios || {};
  const comp = (b.competencias || []).map((x) => (tabla(dbTodo, 'competencias').find((y) => y.id === x) || { nombre: x }).nombre);
  const eleccion = b.eleccion ? `<div class="fila small" style="margin-top:6px"><span class="muted">Beneficio:</span><div class="segmento">${b.eleccion.map((e) =>
    `<button data-act="beneficio" data-clase="${c.id}" data-id="${e.id}" aria-pressed="${c.beneficio === e.id}">${esc(e.etiqueta)}</button>`).join('')}</div></div>` : '';
  const noDom = R.clasesNoDominadas(pj).length;
  const puedeIniciarClase = nv > 0 || noDom < param(db, 'clases_no_dominadas_max', 3) || libre();

  const habs = (def.habilidades || []).map((hd) => {
    const sl = (c.habilidades || {})[hd.id] || 0;
    const puedeSubir = libre() || (editable && sl < hd.sl_max && nv < 10 && asign < 50 && puedeIniciarClase);
    const stepper = editable ? `<span class="contador"><button data-act="sl" data-clase="${c.id}" data-id="${hd.id}" data-d="-1" ${sl <= 0 ? 'disabled' : ''} aria-label="Quitar nivel">−</button><b>${sl}</b><button data-act="sl" data-clase="${c.id}" data-id="${hd.id}" data-d="1" ${puedeSubir ? '' : 'disabled'} aria-label="Añadir nivel">+</button></span>`
      : (sl ? `<span class="chip acento">SL ${sl}</span>` : '');
    const f = { tipo: 'hab', id: hd.id };
    const extra = sl > 0 && hd.elecciones ? eleccionesHtml(f, hd, sl) : '';
    return F.htmlHabilidad(dbTodo, hd, sl, { derecha: stepper, extra, clase: sl ? '' : 'apagada', abierto: sl > 0 && pendiente(f, hd, sl) });
  }).join('');
  return `<div class="tarjeta">
    <div class="fila entre"><div class="fila"><h2 style="font-size:17px">${esc(def.nombre)}</h2><span class="muted">Nivel ${nv}</span>${nv >= 10 ? '<span class="chip acento">Dominada</span>' : ''}${F.etiquetasClase(def)}${tagAtlas(def)}</div>
      ${editable ? `<button class="btn peq fantasma peligro" data-act="quitar-clase" data-id="${c.id}">Quitar</button>` : ''}</div>
    <p class="muted small" style="margin:4px 0">${esc(b.texto || '')}</p>
    ${comp.length ? `<div class="fila">${comp.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}
    ${eleccion}
    ${nv === 0 ? '<p class="small faint" style="margin:6px 0 0">Asigna tu primer nivel a esta clase para activar sus beneficios de PV, PM y competencias.</p>' : ''}
    <div class="lista" style="margin-top:12px">${habs}</div>
  </div>`;
}

function seccionHeroicas() {
  const dom = R.clasesDominadas(pj).length;
  const pendientes = dom - pj.heroicas.length;
  let h = `<div class="seccion" style="margin-top:24px"><h2>Habilidades heroicas <span class="muted">${pj.heroicas.length} · ${dom} clase${dom === 1 ? '' : 's'} dominada${dom === 1 ? '' : 's'}</span></h2>`;
  if (!pj.heroicas.length && !pendientes && !libre()) {
    return h + '<p class="muted small">Se obtienen al dominar una clase (nivel 10).</p></div>';
  }
  h += '<div class="lista">' + pj.heroicas.map((hh, i) => {
    const d = get(dbTodo, 'habilidades_heroicas', hh.id);
    if (!d) return `<div class="item">${esc(hh.id)} <span class="chip err">No encontrada</span></div>`;
    const quitar = `<button class="btn peq fantasma peligro" data-act="quitar-heroica" data-i="${i}">Quitar</button>`;
    const f = { tipo: 'heroica', id: d.id, indice: i };
    const extra = d.elecciones ? eleccionesHtml(f, d, 1) : '';
    return heroicaHtml(d, { derecha: quitar, extra, abierto: !!d.elecciones && pendiente(f, d, 1) });
  }).join('') + '</div>';
  if (pendientes > 0 || libre()) {
    const eleg = R.heroicasElegibles(pj, db);
    h += `<details class="tarjeta" data-det="sec-heroicas" style="margin-top:12px" ${pendientes > 0 ? 'open' : ''}><summary class="fila entre" style="cursor:pointer"><strong>${pendientes > 0 ? `Elige ${pendientes} habilidad${pendientes > 1 ? 'es' : ''} heroica${pendientes > 1 ? 's' : ''}` : 'Añadir habilidad heroica (modo libre)'}</strong></summary>
      <div class="lista" style="margin-top:10px">${eleg.map((e) => heroicaHtml(e.def, {
        derecha: `<button class="btn peq ${e.ok ? 'primario' : ''}" data-act="anadir-heroica" data-id="${e.def.id}" ${e.ok || libre() ? '' : 'disabled'}>Elegir</button>`,
        nota: e.ok ? '' : e.motivos.join(' · ')
      })).join('')}</div></details>`;
  }
  return h + '</div>';
}

function heroicaHtml(d, { derecha = '', extra = '', nota = '', abierto = false } = {}) {
  return `<details class="item ${nota ? 'apagada' : ''}" ${abierto ? 'open' : ''} data-det="heroica:${esc(d.id)}" data-busqueda="${esc((d.nombre + ' ' + d.resumen).toLowerCase())}"><summary><span><span class="titulo">${esc(d.nombre)}</span><br><span class="sub">${esc(d.resumen || '')}${nota ? ` · <span style="color:var(--err)">${esc(nota)}</span>` : ''}</span></span>
    <span class="der">${tagAtlas(d)}${derecha}</span></summary>
    <div class="cuerpo"><p class="small muted"><strong>Requisitos:</strong> ${esc((d.requisitos || {}).texto || 'Ninguno.')}</p><div class="texto">${md(d.efecto)}</div>${extra}</div></details>`;
}

// ----------------------------------------------------------- elecciones
const codFuente = (f) => `${f.tipo}|${f.id}|${f.indice ?? ''}`;
const decFuente = (s) => { const [tipo, id, i] = s.split('|'); return { tipo, id, indice: i === '' ? undefined : Number(i) }; };
function storeDe(f) {
  if (f.tipo === 'hab') { const k = R.claveHab(f.id); pj.elecciones[k] = pj.elecciones[k] || {}; return pj.elecciones[k]; }
  if (f.tipo === 'heroica') { const h = pj.heroicas[f.indice]; h.elecciones = h.elecciones || {}; return h.elecciones; }
  if (f.tipo === 'peculiaridad') { const p = pj.opcionales.peculiaridad; p.elecciones = p.elecciones || {}; return p.elecciones; }
  if (f.tipo === 'poder_cero') { const p = pj.opcionales.poder_cero; p.elecciones = p.elecciones || {}; return p.elecciones; }
  return {};
}

/** ¿Quedan elecciones por completar en esta fuente? */
function pendiente(f, def, sl) {
  const vals = R.eleccionesDe(pj, f);
  const tiene = (id) => Object.values(vals).some((v) => Array.isArray(v) && v.includes(id));
  return (def.elecciones || []).some((e) => {
    if (e.requiere_opcion && !tiene(e.requiere_opcion)) return false;
    const v = vals[e.clave];
    if (e.tipo === 'texto' || e.tipo === 'texto_largo') return !v;
    const n = Array.isArray(v) ? v.filter(Boolean).length : (v ? 1 : 0);
    const [min, max] = R.rangoEleccion(e, pj, sl);
    return n < min || n > max;
  });
}

function eleccionesHtml(f, def, sl) {
  const vals = R.eleccionesDe(pj, f);
  const tiene = (id) => Object.values(vals).some((v) => Array.isArray(v) && v.includes(id));
  return '<div class="pila" style="margin-top:12px;border-top:1px dashed var(--line);padding-top:10px">'
    + (def.elecciones || []).filter((e) => !e.requiere_opcion || tiene(e.requiere_opcion)).map((e) => editorEleccion(f, e, vals[e.clave], sl)).join('') + '</div>';
}

function editorEleccion(f, e, v, sl) {
  const [min, max] = R.rangoEleccion(e, pj, sl);
  const fid = codFuente(f);
  const base = `data-f="${fid}" data-clave="${e.clave}" data-max="${max}"`;
  const arr = Array.isArray(v) ? v : (v ? [v] : []);
  const n = arr.filter(Boolean).length;
  const ok = n >= min && n <= max;
  const contador = (e.tipo === 'texto' || e.tipo === 'texto_largo') ? '' : `<span class="chip ${ok ? 'ok' : 'err'}">${n} / ${max >= 99 ? '∞' : max}</span>`;
  let h = `<div><div class="fila entre" style="margin-bottom:6px"><strong class="small">${esc(e.etiqueta)}</strong>${contador}</div>`;
  if (e.nota) h += `<p class="faint small">${esc(e.nota)}</p>`;

  if (e.tipo === 'conjuros' || e.tipo === 'opciones') {
    const cand = R.valoresEleccion(e, db);
    const elegidos = arr.map((id) => get(dbTodo, e.tipo === 'conjuros' ? 'conjuros' : 'opciones', id)).filter(Boolean);
    const lleno = n >= max && max > 1 && !libre();
    const boton = (o, sel) => {
      const reqOk = !o.requiere || o.requiere.every((r) => arr.includes(r));
      const dis = !sel && (lleno || (!reqOk && !libre()));
      const reqNombres = (o.requiere || []).map((r) => (get(dbTodo, 'opciones', r) || { nombre: r }).nombre).join(', ');
      const ttl = sel ? 'Pulsa para quitar esta elección' : (!reqOk ? 'Requiere: ' + reqNombres : (lleno ? `Máximo alcanzado (${max}). Pulsa en "Elegido ✕" arriba para cambiar una opción.` : ''));
      return `<button class="chip" data-act="elec-toggle" ${base} data-valor="${o.id}" aria-pressed="${sel}" ${dis ? 'disabled' : ''} title="${esc(ttl)}">${sel ? 'Elegido ✕' : 'Elegir'}</button>`;
    };
    const pinta = (o, sel) => (e.tipo === 'conjuros' ? F.htmlConjuro(dbTodo, o, { derecha: boton(o, sel) }) : F.htmlOpcion(dbTodo, o, { derecha: boton(o, sel) }));
    if (elegidos.length) h += `<div class="lista">${elegidos.map((o) => pinta(o, true)).join('')}</div>`;
    const resto = cand.filter((o) => !arr.includes(o.id));
    if (resto.length) {
      h += `<details ${n < min ? 'open' : ''} data-det="elec:${esc(fid)}:${esc(e.clave)}" style="margin-top:6px"><summary class="small muted" style="cursor:pointer">${n < min ? 'Opciones disponibles' : 'Ver otras opciones'} (${resto.length})</summary>
        <div class="lista" style="margin-top:6px">${resto.map((o) => pinta(o, false)).join('')}</div></details>`;
    }
  } else if (e.tipo === 'seleccion') {
    const vals = R.valoresEleccion(e, dbTodo);
    h += `<div class="fila">${vals.map((o) => {
      const sel = arr.includes(o.id);
      return `<button class="chip" data-act="elec-sel" ${base} data-valor="${esc(o.id)}" data-cant="${e.cantidad || 1}" aria-pressed="${sel}">${esc(o.nombre)}</button>`;
    }).join('')}</div>`;
  } else if (e.tipo === 'texto') {
    h += `<input type="text" data-elec-texto="1" ${base} value="${esc(v || '')}">`;
  } else if (e.tipo === 'texto_largo') {
    h += `<textarea data-elec-texto="1" ${base}>${esc(v || '')}</textarea>`;
  } else if (e.tipo === 'lista_texto') {
    h += `<div class="pila">${arr.map((x, i) => `<div class="fila" style="flex-wrap:nowrap"><input type="text" data-elec-lista="${i}" ${base} value="${esc(x)}">
      <button class="btn icono fantasma" data-act="elec-lista-quitar" ${base} data-i="${i}" aria-label="Quitar">${ICON.x}</button></div>`).join('')}
      <button class="btn peq" data-act="elec-lista-anadir" ${base} ${n >= max && !libre() ? 'disabled' : ''}>Añadir</button></div>`;
  }
  return h + '</div>';
}

// =========================================================== ATRIBUTOS
function panelAtributos() {
  const perfiles = tabla(db, 'perfiles_atributos');
  const p = perfiles.find((x) => x.id === pj.atributos.perfil);
  const c = R.calcular(pj, dbTodo);
  const editable = creando() || libre();
  let h = `<div class="seccion"><h2>Atributos</h2><p class="muted small">Elige un perfil y reparte sus dados entre Destreza, Perspicacia, Vigor y Voluntad.</p></div>
    <div class="rejilla c3">${perfiles.map((x) => `<button class="tarjeta" style="text-align:left;cursor:pointer;${x.id === pj.atributos.perfil ? 'border-color:var(--accent)' : ''}" data-act="perfil" data-id="${x.id}" ${editable ? '' : 'disabled'}>
      <div class="fila entre"><strong>${esc(x.nombre)}</strong><span class="mono muted">${x.dados.map((d) => 'd' + d).join(' ')}</span></div>
      <div class="muted small">${esc(x.descripcion || '')}</div></button>`).join('')}</div>`;
  if (p) {
    const opciones = [...new Set(p.dados)].sort((a, b) => b - a);
    h += `<div class="tarjeta" style="margin-top:12px"><h3>Reparto</h3><div class="rejilla c4">${R.ATR.map((a) => `
      <label class="campo"><span>${R.ATR_NOMBRE[a]}</span><select data-act="dado" data-atr="${a}" ${editable ? '' : 'disabled'}>
        <option value="">—</option>${opciones.map((d) => `<option value="${d}" ${pj.atributos.base[a] === d ? 'selected' : ''}>d${d}</option>`).join('')}</select></label>`).join('')}</div>
      <p class="faint small" style="margin-top:8px">Al elegir un dado ya asignado, se intercambia con el otro atributo.</p></div>`;
  }
  h += htmlMejorasAtributos(pj, true);
  // Desglose
  const otros = (stat) => c.mods.filter((m) => m.stat === stat);
  const linea = (etq, stat, total, formula) => `<div class="item"><div class="fila entre"><strong>${etq}</strong><span class="mono" style="font-size:18px">${total}</span></div>
    <div class="sub">${formula}${otros(stat).map((m) => ` + ${m.valor} (${esc(m.origen)})`).join('')}</div></div>`;
  const ben = (k) => pj.clases.reduce((a, cl) => {
    if (R.nivelClase(cl) <= 0) return a;
    const d = get(dbTodo, 'clases', cl.id); if (!d) return a;
    const e = (d.beneficios.eleccion || []).find((x) => x.id === cl.beneficio);
    return a + (d.beneficios[k] || 0) + (e ? e[k] || 0 : 0);
  }, 0);
  h += `<div class="seccion" style="margin-top:16px"><h2>Derivados</h2><div class="lista">
    ${linea('Puntos de Vida', 'pv_max', c.pv_max, `Nivel ${pj.nivel} + Vigor d${c.base.VIG} × 5${ben('pv') ? ` + ${ben('pv')} (clases)` : ''}`)}
    ${linea('Puntos de Mente', 'pm_max', c.pm_max, `Nivel ${pj.nivel} + Voluntad d${c.base.VOL} × 5${ben('pm') ? ` + ${ben('pm')} (clases)` : ''}`)}
    ${linea('Puntos de Inventario', 'pi_max', c.pi_max, `${param(db, 'pi_base', 6)}${ben('pi') ? ` + ${ben('pi')} (clases)` : ''}`)}
    ${linea('Defensa', 'def', c.def, c.equipados.armadura ? `Armadura ${esc(c.equipados.armadura.nombre)}` : `Destreza d${c.actual.DES}`)}
    ${linea('Defensa Mágica', 'mdef', c.mdef, c.equipados.armadura ? `Armadura ${esc(c.equipados.armadura.nombre)}` : `Perspicacia d${c.actual.PER}`)}
  </div></div>`;
  return h;
}

// =========================================================== EQUIPO
function gastoCreacion() { return pj.equipo.objetos.reduce((a, o) => a + (o.coste_pagado || 0), 0); }

function panelEquipo() {
  const c = R.calcular(pj, dbTodo);
  const pres = param(db, 'presupuesto_inicial', 500);
  let h = `<div class="seccion fila entre"><div><h2>Equipo</h2><p class="muted small">${creando()
    ? 'Equipo inicial: solo objetos básicos, respetando tus competencias.' : 'Compra con zenit o añade botín sin coste.'}</p></div>
    ${creando() ? `<span class="chip ${gastoCreacion() > pres ? 'err' : 'acento'}">${pres - gastoCreacion()} z restantes</span>`
      : `<label class="fila small">Zenit <input type="number" data-bind="zenit" data-num="1" value="${pj.zenit}"></label>`}</div>`;

  // Ranuras
  h += `<div class="rejilla c2" style="margin-bottom:18px">${R.RANURAS.map((r) => {
    const o = c.equipados[r];
    if (r === 'mano_secundaria' && o && c.equipados.mano_principal && o._uid === c.equipados.mano_principal._uid) {
      return `<div class="tarjeta" style="padding:12px"><span class="small muted">${F.nombreRanura(r)}</span><div class="faint" style="margin-top:2px">Ocupada por ${esc(o.nombre)} (dos manos)</div></div>`;
    }
    return `<div class="tarjeta" style="padding:12px"><div class="fila entre"><span class="small muted">${F.nombreRanura(r)}</span>
      ${o ? `<button class="btn peq fantasma" data-act="desequipar" data-ranura="${r}">Quitar</button>` : ''}</div>
      <div class="titulo" style="margin-top:2px">${o ? esc(o.nombre) : '<span class="faint">—</span>'}</div>
      ${o ? `<div class="sub mono">${esc(F.lineaObjeto(o, dbTodo))}</div>` : ''}</div>`;
  }).join('')}</div>`;

  // Ataques
  h += `<div class="seccion"><h2>Ataques</h2>${F.htmlAtaques(c, dbTodo)}</div>`;

  // Inventario
  h += `<div class="seccion"><h2>Inventario <span class="muted">${pj.equipo.objetos.length}</span></h2>`;
  if (!pj.equipo.objetos.length) h += '<div class="vacio">Inventario vacío.</div>';
  else {
    h += '<div class="lista">' + pj.equipo.objetos.map((o) => {
      const d = R.resolverObjeto(o, dbTodo);
      const equip = botonesEquipar(o, d);
      const vale = (d && d.coste) || o.comprado || 0;
      const quitar = (!creando() && vale ? `<button class="btn peq fantasma" data-act="vender-obj" data-uid="${o.uid}" title="Vender por la mitad (${Math.floor(vale / 2)} z)">Vender</button>` : '')
        + `<button class="btn peq fantasma peligro" data-act="quitar-obj" data-uid="${o.uid}" title="${creando() ? 'Quitar y recuperar el presupuesto' : 'Quitar sin vender'}">Quitar</button>`;
      const sub = o.origen === 'peculiaridad' ? ' <span class="chip">Reliquia</span>' : (o.origen === 'botin' ? ' <span class="chip">Botín</span>' : '');
      return F.htmlObjeto(dbTodo, d, { derecha: equip + quitar, sub });
    }).join('') + '</div>';
  }
  h += '</div>';

  // Constructores
  const hayAP = db.col.plantillas_arma.length > 0;
  h += `<div class="seccion"><h2>Añadir</h2><div class="fila" style="margin-bottom:12px">
    ${hayAP ? '<button class="btn" data-act="abrir-ap">Arma personalizada</button>' : ''}
    <button class="btn" data-act="abrir-rm" ${creando() && !libre() ? 'disabled title="Disponible tras la creación"' : ''}>Objeto raro a medida</button>
    <button class="btn" data-act="abrir-ol">Objeto libre</button></div>`;

  // Tienda
  const t = ui.tienda;
  const cols = [['armas', 'Armas'], ['armaduras', 'Armaduras'], ['escudos', 'Escudos'], ['accesorios', 'Accesorios'], ['artefactos', 'Artefactos']];
  const atlasActivos = db.atlas.filter((a) => a.activo);
  h += `<div class="tarjeta"><div class="fila" style="margin-bottom:10px">
      <div class="segmento">${cols.map(([id, n]) => `<button data-act="tienda-col" data-id="${id}" aria-pressed="${t.col === id}">${n}</button>`).join('')}</div>
      ${['armas', 'armaduras', 'escudos'].includes(t.col) ? `<div class="segmento">${[['basico', 'Básico'], ['raro', 'Raro']].map(([id, n]) => `<button data-act="tienda-rareza" data-id="${id}" aria-pressed="${t.rareza === id}">${n}</button>`).join('')}</div>` : ''}
      ${atlasActivos.length > 1 ? `<select data-act="tienda-atlas" style="width:auto"><option value="">Todos los libros</option>${atlasActivos.map((a) => `<option value="${a.id}" ${t.atlas === a.id ? 'selected' : ''}>${esc(a.abreviatura || a.nombre)}</option>`).join('')}</select>` : ''}
      <div class="buscador" style="flex:1;min-width:160px"><input type="search" placeholder="Buscar" value="${esc(t.q)}" data-act-input="tienda-q" aria-label="Buscar en el catálogo"></div>
    </div><div id="tienda-lista">${listaTienda()}</div></div></div>`;
  return h;
}

function botonesEquipar(o, d) {
  if (!d || d._faltante) return '';
  const eqp = pj.equipo.equipado;
  const puesto = R.RANURAS.some((r) => eqp[r] === o.uid);
  if (puesto) return '<span class="chip acento">Equipado</span>';
  const b = (r, n) => `<button class="btn peq" data-act="equipar" data-uid="${o.uid}" data-ranura="${r}">${n}</button>`;
  switch (d._col) {
    case 'armas': return d.manos === 2 ? b('mano_principal', 'Equipar') : b('mano_principal', 'Principal') + b('mano_secundaria', 'Secundaria');
    case 'escudos': return (R.tieneHabilidad(pj, 'doble-escudo') ? b('mano_principal', 'Principal') : '') + b('mano_secundaria', 'Equipar');
    case 'armaduras': return b('armadura', 'Equipar');
    case 'accesorios': return b('accesorio', 'Equipar');
    default: return '';
  }
}

function listaTienda() {
  const t = ui.tienda;
  const q = normTxt(t.q.trim());
  let items = db.col[t.col] || [];
  if (['armas', 'armaduras', 'escudos'].includes(t.col)) items = items.filter((x) => (x.rareza || 'basico') === t.rareza);
  items = items.filter((x) => x.comprable !== false);
  if (t.atlas) items = items.filter((x) => x._atlas === t.atlas);
  if (q) items = items.filter((x) => normTxt(x.nombre + ' ' + (x.cualidad || '') + ' ' + (x.efecto || '') + ' ' + (x.categoria || '')).includes(q));
  if (!items.length) return '<p class="muted small">Sin resultados con estos filtros.</p>';
  const comp = new Set(R.calcular(pj, dbTodo).competencias);
  const reliquia = pj.opcionales.peculiaridad && pj.opcionales.peculiaridad.id === 'reliquia-familiar';
  const pres = param(db, 'presupuesto_inicial', 500);
  return '<div class="lista">' + items.map((x) => {
    const raro = x.rareza === 'raro' || t.col === 'accesorios';
    const necesita = x.marcial ? (t.col === 'armas' ? (x.alcance === 'cuerpo' ? 'armas_marciales_cuerpo' : 'armas_marciales_distancia') : t.col === 'armaduras' ? 'armaduras_marciales' : 'escudos_marciales') : null;
    const sinComp = necesita && !comp.has(necesita);
    let botones = '';
    if (t.col === 'artefactos') botones = `<button class="btn peq" data-act="comprar" data-col="${t.col}" data-id="${x.id}" data-modo="gratis">Añadir</button>`;
    else {
      const bloqueado = creando() && !libre() && raro;
      const caro = creando() ? gastoCreacion() + (x.coste || 0) > pres : pj.zenit < (x.coste || 0);
      botones = `<button class="btn peq ${bloqueado || (caro && !libre()) ? '' : 'primario'}" data-act="comprar" data-col="${t.col}" data-id="${x.id}" data-modo="comprar" ${(bloqueado || caro) && !libre() ? 'disabled' : ''}>Comprar</button>`;
      if (!creando() || libre()) botones += `<button class="btn peq" data-act="comprar" data-col="${t.col}" data-id="${x.id}" data-modo="gratis" title="Añadir sin coste (botín)">Añadir</button>`;
      else if (reliquia && raro) botones += `<button class="btn peq" data-act="comprar" data-col="${t.col}" data-id="${x.id}" data-modo="reliquia" title="Reliquia familiar">Reliquia</button>`;
    }
    const sub = sinComp ? ' <span class="chip err">Sin competencia</span>' : '';
    return F.htmlObjeto(dbTodo, x, { derecha: botones, sub });
  }).join('') + '</div>';
}

function comprar(col, id, modo) {
  const d = get(db, col, id);
  if (!d) return;
  anadirObjeto({ coleccion: col, ref: id }, d.coste || 0, modo, d);
}

function anadirObjeto(base, coste, modo, def) {
  const pres = param(db, 'presupuesto_inicial', 500);
  if (modo === 'comprar') {
    if (creando()) {
      if (!libre() && def.rareza === 'raro') return toast('Al crear el personaje solo puedes comprar equipo básico.', 'err');
      if (!libre() && gastoCreacion() + coste > pres) return toast('No te llega el presupuesto inicial.', 'err');
    } else {
      if (!libre() && pj.zenit < coste) return toast('No tienes zenit suficientes.', 'err');
      pj.zenit -= coste;
    }
  }
  const obj = { uid: R.uid(), ...base, coste_pagado: modo === 'comprar' && creando() ? coste : 0 };
  if (modo === 'comprar' && !creando()) obj.coste_pagado = 0, obj.comprado = coste;
  if (modo === 'gratis') obj.origen = 'botin';
  if (modo === 'reliquia') obj.origen = 'peculiaridad';
  pj.equipo.objetos.push(obj);
  toast(`${def.nombre} añadido al inventario.`);
  cambio();
}

function equipar(uid, ranura) {
  const o = pj.equipo.objetos.find((x) => x.uid === uid);
  const d = R.resolverObjeto(o, dbTodo);
  const e = pj.equipo.equipado;
  for (const r of R.RANURAS) if (e[r] === uid) e[r] = null;
  const dosManos = (u) => { const x = pj.equipo.objetos.find((y) => y.uid === u); const dx = R.resolverObjeto(x, dbTodo); return dx && dx._col === 'armas' && dx.manos === 2; };
  if (d._col === 'armas' && d.manos === 2) { e.mano_principal = uid; e.mano_secundaria = uid; }
  else {
    if (ranura === 'mano_principal' || ranura === 'mano_secundaria') {
      const otra = ranura === 'mano_principal' ? 'mano_secundaria' : 'mano_principal';
      if (e[otra] && dosManos(e[otra])) e[otra] = null;
      if (e[ranura] && dosManos(e[ranura])) { e.mano_principal = null; e.mano_secundaria = null; }
    }
    e[ranura] = uid;
  }
  cambio();
}

function desequipar(ranura) {
  const e = pj.equipo.equipado;
  const u = e[ranura];
  for (const r of R.RANURAS) if (e[r] === u) e[r] = null;
  cambio();
}

function quitarObjeto(uid, vender) {
  const i = pj.equipo.objetos.findIndex((x) => x.uid === uid);
  if (i < 0) return;
  const o = pj.equipo.objetos[i];
  const d = R.resolverObjeto(o, dbTodo);
  for (const r of R.RANURAS) if (pj.equipo.equipado[r] === uid) pj.equipo.equipado[r] = null;
  pj.equipo.objetos.splice(i, 1);
  if (vender) { const v = Math.floor((d.coste || o.comprado || 0) / 2); pj.zenit += v; toast(`Vendido por ${v} z.`); }
  cambio();
}

// ----------------------------------------------------------- arma personalizada
function nuevaConfigAP() {
  return { nombre: '', categoria: 'espada', alcance: 'cuerpo', prec: 1, pers: [], elemento: 'fuego' };
}
function construirAP(cfg, plantilla) {
  const pers = db.col.personalizaciones_arma;
  let precBonus = 0, dano = plantilla.dano_base, tipo = plantilla.tipo_dano || 'fisico', marcial = false, escudo = false;
  const mods = [];
  for (const id of cfg.pers) {
    const p = pers.find((x) => x.id === id);
    if (!p) continue;
    if (p.marcial) marcial = true;
    if (p.arma && p.arma.precision) precBonus += p.arma.precision;
    if (p.arma && p.arma.dano) dano += (p.arma.dano_por_categoria && p.arma.dano_por_categoria[cfg.categoria]) || p.arma.dano;
    if (p.arma && p.arma.elige_tipo) tipo = cfg.elemento;
    if (p.modificadores) mods.push(...p.modificadores);
    if (p.cuenta_como_escudo) escudo = true;
  }
  const o = {
    id: 'personalizada', nombre: cfg.nombre || 'Arma personalizada', rareza: 'personalizada', categoria: cfg.categoria,
    precision: { atributos: plantilla.precision_opciones[cfg.prec], bonus: precBonus }, dano: { bonus: dano, tipo },
    manos: plantilla.manos, alcance: cfg.alcance, marcial, cualidad: '',
    personalizaciones: cfg.pers.map((id) => (pers.find((x) => x.id === id) || { nombre: id }).nombre)
  };
  if (mods.length) o.modificadores = mods;
  if (escudo) o.cuenta_como_escudo = true;
  return o;
}
function erroresAP(cfg, plantilla) {
  const pers = db.col.personalizaciones_arma;
  const err = [];
  const usadas = cfg.pers.reduce((a, id) => a + ((pers.find((x) => x.id === id) || {}).cuenta || 1), 0);
  if (usadas !== plantilla.personalizaciones) err.push(`Necesita exactamente ${plantilla.personalizaciones} personalizaciones (llevas ${usadas}).`);
  for (const id of cfg.pers) {
    const p = pers.find((x) => x.id === id);
    if (!p) continue;
    if ((p.excluye_categorias || []).includes(cfg.categoria)) err.push(`${p.nombre} no está disponible para esta categoría.`);
    for (const inc of p.incompatible || []) if (cfg.pers.includes(inc)) err.push(`${p.nombre} es incompatible con ${(pers.find((x) => x.id === inc) || {}).nombre}.`);
  }
  return [...new Set(err)];
}

function editorAP(cfg, plantilla, prefijo, forzarTransf = false) {
  const pers = db.col.personalizaciones_arma.filter((p) => !(forzarTransf && p.segunda_forma));
  const cats = tabla(dbTodo, 'categorias_arma').filter((c) => plantilla.categorias.includes(c.id));
  const o = construirAP(cfg, plantilla);
  const err = erroresAP(forzarTransf ? { ...cfg, pers: [...cfg.pers, 'transformable'] } : cfg, plantilla);
  return `<div class="pila">
    <label class="campo"><span>Nombre</span><input type="text" data-ap="${prefijo}nombre" value="${esc(cfg.nombre)}"></label>
    <div class="rejilla c3">
      <label class="campo"><span>Categoría</span><select data-ap="${prefijo}categoria">${cats.map((c) => `<option value="${c.id}" ${cfg.categoria === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
      <label class="campo"><span>Alcance</span><select data-ap="${prefijo}alcance">${plantilla.alcance_opciones.map((a) => `<option value="${a}" ${cfg.alcance === a ? 'selected' : ''}>${a === 'cuerpo' ? 'Cuerpo a cuerpo' : 'A distancia'}</option>`).join('')}</select></label>
      <label class="campo"><span>Precisión</span><select data-ap="${prefijo}prec">${plantilla.precision_opciones.map((p, i) => `<option value="${i}" ${cfg.prec === i ? 'selected' : ''}>【${p.join(' + ')}】</option>`).join('')}</select></label>
    </div>
    <div><div class="small muted" style="margin-bottom:6px">Personalizaciones${forzarTransf ? ' (Transformable ya incluida)' : ''}</div>
      <div class="lista">${pers.map((p) => `<label class="item fila" style="flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" data-ap-pers="${prefijo}" value="${p.id}" ${cfg.pers.includes(p.id) ? 'checked' : ''}>
        <span><strong>${esc(p.nombre)}</strong>${p.marcial ? ' <span class="chip">Marcial</span>' : ''}${p.cuenta > 1 ? ` <span class="chip">Cuenta ${p.cuenta}</span>` : ''}<br><span class="sub">${esc(p.efecto)}</span></span></label>`).join('')}</div></div>
    ${cfg.pers.includes('elemental') ? `<label class="campo"><span>Tipo de daño elemental</span><select data-ap="${prefijo}elemento">${tabla(dbTodo, 'tipos_dano').filter((t) => t.id !== 'fisico').map((t) => `<option value="${t.id}" ${cfg.elemento === t.id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></label>` : ''}
    <div class="tarjeta" style="padding:10px"><strong>${esc(o.nombre)}</strong> <span class="muted small mono">${esc(F.lineaObjeto({ ...o, _col: 'armas' }, dbTodo))}</span>
      ${err.length ? `<ul class="validacion" style="margin-top:6px">${err.map((x) => `<li class="error">${esc(x)}</li>`).join('')}</ul>` : ''}</div>
  </div>`;
}

function renderDialogoAP() {
  const plantilla = db.col.plantillas_arma[0];
  const cfg = ui.ap;
  const transf = cfg.pers.includes('transformable');
  if (transf && !cfg.forma2) cfg.forma2 = nuevaConfigAP();
  const coste = plantilla.coste + db.col.personalizaciones_arma.filter((p) => cfg.pers.includes(p.id)).reduce((a, p) => a + (p.coste_extra || 0), 0);
  const errs = [...erroresAP(cfg, plantilla), ...(transf ? erroresAP({ ...cfg.forma2, pers: [...cfg.forma2.pers, 'transformable'] }, plantilla).map((x) => 'Segunda forma: ' + x) : [])];
  abrirDialogo(`Arma personalizada · ${coste} z`, `<p class="muted small">${esc(plantilla.efecto)}</p>${editorAP(cfg, plantilla, '')}
    ${transf ? `<hr><h3 style="font-size:14px;margin-bottom:8px">Segunda forma</h3>${editorAP(cfg.forma2, plantilla, 'forma2.', true)}` : ''}`,
  `<button class="btn" data-act="cerrar-dialogo">Cancelar</button>
   ${creando() && !libre() ? '' : `<button class="btn" data-act="ap-crear" data-modo="gratis" ${errs.length && !libre() ? 'disabled' : ''}>Añadir sin coste</button>`}
   <button class="btn primario" data-act="ap-crear" data-modo="comprar" ${errs.length && !libre() ? 'disabled' : ''}>Comprar (${coste} z)</button>`);
}

function crearAP(modo) {
  const plantilla = db.col.plantillas_arma[0];
  const cfg = ui.ap;
  const o = construirAP(cfg, plantilla);
  const coste = plantilla.coste + db.col.personalizaciones_arma.filter((p) => cfg.pers.includes(p.id)).reduce((a, p) => a + (p.coste_extra || 0), 0);
  o.coste = coste;
  if (cfg.pers.includes('transformable')) {
    const f2 = construirAP({ ...cfg.forma2, pers: [...cfg.forma2.pers, 'transformable'] }, plantilla);
    o.forma2 = f2;
  }
  cerrarDialogo();
  anadirObjeto({ coleccion: 'armas', personalizado: o }, coste, modo, o);
}

// ----------------------------------------------------------- objeto raro a medida
function renderDialogoRM() {
  const rm = ui.rm;
  const tipoCol = { arma: 'armas', armadura: 'armaduras', escudo: 'escudos', accesorio: null }[rm.tipo];
  const bases = tipoCol ? db.col[tipoCol].filter((x) => x.rareza === 'basico' && x.comprable !== false) : [];
  const cuals = db.col.cualidades.filter((q) => q.aplica.includes(rm.tipo));
  const o = construirRM();
  abrirDialogo('Objeto raro a medida', `<div class="pila">
      <div class="segmento">${[['arma', 'Arma'], ['armadura', 'Armadura'], ['escudo', 'Escudo'], ['accesorio', 'Accesorio']].map(([id, n]) => `<button data-act="rm-tipo" data-id="${id}" aria-pressed="${rm.tipo === id}">${n}</button>`).join('')}</div>
      ${bases.length ? `<label class="campo"><span>Objeto base</span><select data-rm="base"><option value="">—</option>${bases.map((b) => `<option value="${b.id}" ${rm.base === b.id ? 'selected' : ''}>${esc(b.nombre)} · ${b.coste} z</option>`).join('')}</select></label>` : ''}
      ${rm.tipo === 'arma' ? `<label class="campo"><span>Tipo de daño (+100 z si no es físico)</span><select data-rm="elemento">${tabla(dbTodo, 'tipos_dano').map((t) => `<option value="${t.id}" ${(rm.elemento || 'fisico') === t.id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></label>` : ''}
      <label class="campo"><span>Cualidad</span><select data-rm="cualidad"><option value="">${rm.tipo === 'accesorio' ? '—' : 'Sin cualidad'}</option>${cuals.map((q) => `<option value="${q.id}" ${rm.cualidad === q.id ? 'selected' : ''}>${esc(q.nombre)} · +${q.coste} z — ${esc(q.efecto)}</option>`).join('')}</select></label>
      <label class="campo"><span>Nombre (opcional)</span><input type="text" data-rm="nombre" value="${esc(rm.nombre)}"></label>
      <label class="campo"><span>Detalle de la cualidad (tipo de daño, estado, especie…)</span><input type="text" data-rm="detalle" value="${esc(rm.detalle || '')}"></label>
      ${o ? `<div class="tarjeta" style="padding:10px"><strong>${esc(o.nombre)}</strong> · <span class="mono">${o.coste} z</span><br><span class="muted small mono">${esc(F.lineaObjeto({ ...o, _col: tipoCol || 'accesorios' }, dbTodo))}</span>${o.cualidad ? `<div class="small">${esc(o.cualidad)}</div>` : ''}</div>` : ''}
    </div>`,
  `<button class="btn" data-act="cerrar-dialogo">Cancelar</button>
   ${creando() && !libre() ? '' : `<button class="btn" data-act="rm-crear" data-modo="gratis" ${o ? '' : 'disabled'}>Añadir sin coste</button>`}
   <button class="btn primario" data-act="rm-crear" data-modo="comprar" ${o ? '' : 'disabled'}>Comprar${o ? ` (${o.coste} z)` : ''}</button>`);
}
function construirRM() {
  const rm = ui.rm;
  const tipoCol = { arma: 'armas', armadura: 'armaduras', escudo: 'escudos', accesorio: 'accesorios' }[rm.tipo];
  const q = rm.cualidad ? get(db, 'cualidades', rm.cualidad) : null;
  if (rm.tipo === 'accesorio') {
    if (!q) return null;
    return { id: 'a-medida', nombre: rm.nombre || q.nombre, rareza: 'raro', coste: q.coste, cualidad: q.efecto + (rm.detalle ? ` (${rm.detalle})` : ''), modificadores: q.modificadores || [] };
  }
  const base = rm.base ? get(db, tipoCol, rm.base) : null;
  if (!base) return null;
  const o = JSON.parse(JSON.stringify(base));
  delete o._atlas; delete o._col;
  o.id = 'a-medida'; o.rareza = 'raro';
  let coste = base.coste;
  if (rm.tipo === 'arma' && rm.elemento && rm.elemento !== 'fisico') { o.dano.tipo = rm.elemento; coste += 100; }
  if (q) { o.cualidad = q.efecto + (rm.detalle ? ` (${rm.detalle})` : ''); coste += q.coste; o.modificadores = [...(o.modificadores || []), ...(q.modificadores || [])]; }
  if (!q && !(rm.tipo === 'arma' && rm.elemento && rm.elemento !== 'fisico')) return null;
  if (o.precision && o.precision.bonus === 0) { /* conserva */ }
  o.coste = coste;
  o.nombre = rm.nombre || `${base.nombre}${q ? ' · ' + q.nombre : ''}`;
  return o;
}

function renderDialogoOL() {
  abrirDialogo('Objeto libre', `<div class="pila">
    <label class="campo"><span>Nombre</span><input type="text" data-ol="nombre" value="${esc(ui.ol.nombre)}"></label>
    <label class="campo"><span>Descripción</span><textarea data-ol="cualidad">${esc(ui.ol.cualidad)}</textarea></label></div>`,
  `<button class="btn" data-act="cerrar-dialogo">Cancelar</button><button class="btn primario" data-act="ol-crear">Añadir</button>`);
}

// ----------------------------------------------------------- diálogo genérico
function abrirDialogo(titulo, cuerpo, pie) {
  const d = document.getElementById('dialogo');
  const scroll = d.querySelector('.cuerpo-d') ? d.querySelector('.cuerpo-d').scrollTop : 0;
  d.innerHTML = `<div class="cab"><h2>${esc(titulo)}</h2><button class="btn icono fantasma" data-act="cerrar-dialogo" aria-label="Cerrar">${ICON.x}</button></div>
    <div class="cuerpo-d">${cuerpo}</div><div class="pie">${pie}</div>`;
  if (!d.open) d.showModal();
  d.querySelector('.cuerpo-d').scrollTop = scroll;
}
function cerrarDialogo() { const d = document.getElementById('dialogo'); if (d.open) d.close(); ui.ap = ui.rm = ui.ol = null; }

// =========================================================== VÍNCULOS
function panelVinculos() {
  const max = param(db, 'vinculos_max', 6);
  const pares = [['admiracion', 'inferioridad'], ['lealtad', 'desconfianza'], ['afecto', 'odio']];
  let h = `<div class="seccion fila entre"><div><h2>Vínculos</h2><p class="muted small">Hasta ${max}. Cada vínculo admite una emoción de cada pareja; su fuerza es el número de emociones. Usa el nombre exacto de otro personaje para que el visor dibuje las relaciones del grupo.</p></div>
    <span class="chip">${pj.vinculos.length} / ${max}</span></div>`;
  if (!pj.vinculos.length) h += '<div class="vacio">Sin vínculos todavía.</div>';
  h += '<div class="pila">' + pj.vinculos.map((v, i) => `<div class="tarjeta">
    <div class="fila" style="flex-wrap:nowrap"><input type="text" placeholder="Hacia quién (personaje, grupo, institución…)" data-bind="vinculos.${i}.hacia" value="${esc(v.hacia || '')}">
      <span class="chip ${v.emociones && v.emociones.length ? 'acento' : ''}" style="flex:none">Fuerza ${(v.emociones || []).length}</span>
      <button class="btn icono fantasma" data-act="quitar-vinculo" data-i="${i}" aria-label="Quitar vínculo">${ICON.x}</button></div>
    <div class="fila" style="margin-top:10px">${pares.map((par) => `<div class="segmento">${par.map((e) =>
      `<button data-act="emocion" data-i="${i}" data-e="${e}" aria-pressed="${(v.emociones || []).includes(e)}">${esc(F.nombreEmocion(dbTodo, e))}</button>`).join('')}</div>`).join('')}</div>
  </div>`).join('') + '</div>';
  h += `<button class="btn" style="margin-top:12px" data-act="anadir-vinculo" ${pj.vinculos.length >= max && !libre() ? 'disabled' : ''}>Añadir vínculo</button>`;
  return h;
}

// =========================================================== REGLAS OPCIONALES
function panelExtras() {
  let h = '';
  if (db.col.peculiaridades.length) {
    const pec = pj.opcionales.peculiaridad;
    h += `<div class="seccion"><h2>Peculiaridad</h2><p class="muted small">Una por personaje y sin repetirse en el grupo.</p></div>`;
    if (pec) {
      const d = get(dbTodo, 'peculiaridades', pec.id);
      h += `<div class="tarjeta"><div class="fila entre"><h2 style="font-size:17px">${esc(d ? d.nombre : pec.id)}</h2>
        <button class="btn peq fantasma peligro" data-act="quitar-peculiaridad">Quitar</button></div>
        ${d ? `${d.descripcion ? `<p class="muted">${esc(d.descripcion)}</p>` : ''}${d.requisitos ? `<p class="small muted"><strong>Requisito:</strong> ${esc(d.requisitos.texto)}</p>` : ''}<div class="texto">${md(d.efecto)}</div>
        ${d.elecciones ? eleccionesHtml({ tipo: 'peculiaridad', id: d.id }, d, 1) : ''}` : ''}</div>`;
    } else {
      h += '<div class="lista">' + db.col.peculiaridades.map((p) => {
        const r = R.cumpleRequisitos(p.requisitos, pj, dbTodo);
        return `<details class="item"><summary><span><span class="titulo">${esc(p.nombre)}</span><br><span class="sub">${esc(p.descripcion || (p.requisitos || {}).texto || '')}</span></span>
          <span class="der">${!r.ok ? `<span class="chip err">${esc(r.motivos.join(', '))}</span>` : ''}<button class="btn peq primario" data-act="elegir-peculiaridad" data-id="${p.id}" ${r.ok || libre() ? '' : 'disabled'}>Elegir</button></span></summary>
          <div class="cuerpo texto">${md(p.efecto)}</div></details>`;
      }).join('') + '</div>';
    }
  }
  if (db.col.poderes_cero_efectos.length) {
    const pc = pj.opcionales.poder_cero;
    const reglas = (tabla(db, 'poder_cero_reglas')[0]) || '';
    h += `<div class="seccion" style="margin-top:24px"><h2>Poder Cero</h2><div class="texto muted small">${md(reglas)}</div></div>`;
    if (!pc) h += '<button class="btn primario" data-act="crear-poder-cero">Crear Poder Cero</button>';
    else {
      const ef = pc.efecto ? get(dbTodo, 'poderes_cero_efectos', pc.efecto) : null;
      h += `<div class="tarjeta pila">
        <div class="fila entre"><strong>Configuración</strong><button class="btn peq fantasma peligro" data-act="quitar-poder-cero">Quitar</button></div>
        <label class="campo"><span>Nombre</span><div class="fila" style="flex-wrap:nowrap"><input type="text" data-bind="opcionales.poder_cero.nombre" value="${esc(pc.nombre || '')}">${dadoBtn('azar-poder-cero', 'Nombre al azar')}</div></label>
        <div><div class="small muted" style="margin-bottom:6px">Disparador</div><div class="lista">${db.col.poderes_cero_disparadores.map((d) =>
          `<div class="item fila entre" style="flex-wrap:nowrap"><span><strong>${esc(d.nombre)}</strong> <span class="muted small">· ${esc(d.secciones)} secc.</span><br><span class="sub">${esc(d.efecto)}</span></span>
          <button class="chip" data-act="pc-disparador" data-id="${d.id}" aria-pressed="${pc.disparador === d.id}">${pc.disparador === d.id ? 'Elegido' : 'Elegir'}</button></div>`).join('')}</div></div>
        <div><div class="small muted" style="margin-bottom:6px">Efecto de Cero</div><div class="lista">${db.col.poderes_cero_efectos.map((e) =>
          `<details class="item"><summary><span class="titulo">${esc(e.nombre)}</span><span class="der"><button class="chip" data-act="pc-efecto" data-id="${e.id}" aria-pressed="${pc.efecto === e.id}">${pc.efecto === e.id ? 'Elegido' : 'Elegir'}</button></span></summary>
          <div class="cuerpo texto">${md(e.efecto)}</div></details>`).join('')}</div></div>
        ${ef && ef.elecciones ? eleccionesHtml({ tipo: 'poder_cero', id: ef.id }, ef, 1) : ''}
      </div>`;
    }
  }
  return h || '<div class="vacio">No hay reglas opcionales de personaje activas. Actívalas en Contenido.</div>';
}

// =========================================================== PROGRESO / FINALIZAR
function panelProgreso() {
  return creando() ? panelFinalizar() : panelSubida();
}

function panelFinalizar() {
  const val = R.validar(pj, db, dbTodo);
  const errores = val.filter((v) => v.nivel === 'error');
  const pres = param(db, 'presupuesto_inicial', 500);
  const resto = Math.max(0, pres - gastoCreacion());
  const a = pj.ahorros;
  return `<div class="seccion"><h2>Finalizar la creación</h2><p class="muted small">Revisa los pendientes, tira los ahorros y cierra la creación. Después el personaje sube de nivel desde esta pestaña.</p></div>
    <div class="tarjeta"><h3>Ahorros iniciales</h3>
      <p>Zenit restantes del presupuesto (${resto} z) + 1d6 × 10.</p>
      <div class="fila">${a ? `<span class="chip acento">1d6 = ${a.d6} → ${a.total} z</span>` : ''}
        <button class="btn" data-act="tirar-ahorros">${ICON.dado} ${a ? 'Volver a tirar' : 'Tirar ahorros'}</button></div></div>
    <div class="tarjeta"><h3>Puntos Fábula</h3><p>Empiezas con ${param(db, 'pf_iniciales', 3)} Puntos Fábula.</p></div>
    <div class="tarjeta validacion"><h3>Pendientes</h3>${errores.length ? `<ul>${errores.map((v) => `<li class="error">${esc(v.msg)}</li>`).join('')}</ul>` : '<p class="ok-total">Todo listo.</p>'}</div>
    <div class="fila" style="margin-top:12px"><button class="btn primario" data-act="finalizar" ${errores.length && !libre() ? 'disabled' : ''}>Finalizar creación</button>
      ${libre() ? '<span class="muted small">En modo libre puedes finalizar con pendientes.</span>' : ''}</div>`;
}

function panelSubida() {
  const n = ui.nivel;
  const nuevo = pj.nivel + 1;
  const pxNivel = param(db, 'px_por_nivel', 10);
  const umbrales = param(db, 'niveles_mejora_atributo', [20, 40]);
  let h = `<div class="seccion fila entre"><div><h2>Progreso</h2><p class="muted small">Al acumular ${pxNivel} PX gastas 10 para subir un nivel: +1 PV y +1 PM máximos (sin alterar actuales) y un nivel de clase.</p></div>
    <div class="fila"><label class="fila small">PX <input type="number" data-bind="px" data-num="1" value="${pj.px}"></label>
    <label class="fila small">PF <input type="number" data-bind="pf" data-num="1" value="${pj.pf}"></label>
    ${libre() ? `<label class="fila small">Nivel <input type="number" data-bind="nivel" data-num="1" value="${pj.nivel}"></label>` : ''}</div></div>`;

  if (pj.nivel >= param(db, 'nivel_max', 50)) return h + '<div class="vacio">Nivel máximo alcanzado (50).</div>' + historialHtml();

  // Paso 1: clase (con filtro por etiquetas)
  const tagSubida = ui.filtroSubidaTag || 'todas';
  const coincideTag = (cDef) => tagSubida === 'todas' || (cDef && (cDef.etiquetas || []).includes(tagSubida));
  const actuales = pj.clases.filter((c) => {
    if (R.nivelClase(c) >= 10) return false;
    const d = get(dbTodo, 'clases', c.id);
    return coincideTag(d);
  });
  const puedeNueva = R.clasesNoDominadas(pj).length < param(db, 'clases_no_dominadas_max', 3) || libre();
  const todasNuevas = db.col.clases.filter((c) => !pj.clases.some((x) => x.id === c.id));
  const nuevas = todasNuevas.filter(coincideTag);
  const tags = ['todas', 'melé', 'distancia', 'apoyo', 'tanque', 'magia'];

  h += `<div class="tarjeta"><h3>Subir a nivel ${nuevo}</h3>
    <div class="fila entre" style="margin-bottom:8px">
      <div class="small muted">1 · Clase</div>
      <div class="fila" style="gap:4px;align-items:center">
        <span class="muted small">Filtrar:</span>
        <div class="segmento">${tags.map((t) =>
          `<button data-act="filtro-subida-tag" data-tag="${t}" aria-pressed="${tagSubida === t}">${t.charAt(0).toUpperCase() + t.slice(1)}</button>`
        ).join('')}</div>
      </div>
    </div>
    <div class="fila">${actuales.map((c) => {
      const d = get(dbTodo, 'clases', c.id);
      const nv = R.nivelClase(c);
      return `<button class="chip" data-act="nv-clase" data-id="${c.id}" aria-pressed="${n.clase === c.id}">
        ${esc(d ? d.nombre : c.id)} ${nv} → ${nv + 1}
        ${d && d.etiquetas ? `<small class="faint">· ${d.etiquetas.join(', ')}</small>` : ''}
      </button>`;
    }).join('')}
    ${puedeNueva && nuevas.length ? `<select data-act="nv-clase-nueva" style="width:auto">
      <option value="">Nueva clase… (${nuevas.length})</option>
      ${nuevas.map((c) => `<option value="${c.id}" ${n.clase === c.id ? 'selected' : ''}>${esc(c.nombre)} [${(c.etiquetas || []).join(', ')}]</option>`).join('')}
    </select>` : (!puedeNueva ? '<span class="muted small">Domina una clase para empezar otra (máx. 3 sin dominar).</span>' : (todasNuevas.length && !nuevas.length ? '<span class="muted small">Sin nuevas clases con este filtro.</span>' : ''))}
    </div>`;

  // Paso 2: habilidad
  const defC = n.clase ? get(dbTodo, 'clases', n.clase) : null;
  let domina = false;
  if (defC) {
    const c = pj.clases.find((x) => x.id === n.clase);
    const nv = c ? R.nivelClase(c) : 0;
    domina = nv + 1 === 10;
    h += `<div class="small muted" style="margin:14px 0 6px">2 · Habilidad</div><div class="lista">${defC.habilidades.map((hd) => {
      const sl = c ? (c.habilidades[hd.id] || 0) : 0;
      const lleno = sl >= hd.sl_max;
      return F.htmlHabilidad(dbTodo, hd, sl, { derecha: `<button class="chip" data-act="nv-hab" data-id="${hd.id}" aria-pressed="${n.habilidad === hd.id}" ${lleno ? 'disabled' : ''}>${lleno ? 'Máximo' : (sl ? `SL ${sl} → ${sl + 1}` : 'Nueva')}</button>` });
    }).join('')}</div>`;
    if (!c && defC.beneficios) h += `<p class="small muted" style="margin-top:6px"><strong>Beneficio gratuito:</strong> ${esc(defC.beneficios.texto || '')}</p>`;

    if (n.habilidad) {
      const hdSel = defC.habilidades.find((x) => x.id === n.habilidad);
      if (hdSel && hdSel.elecciones && hdSel.elecciones.length) {
        const slNuevo = (c ? (c.habilidades[hdSel.id] || 0) : 0) + 1;
        const f = { tipo: 'hab', id: hdSel.id };
        h += `<div class="tarjeta" style="margin-top:10px;border-color:var(--accent)">
          <div class="fila entre" style="margin-bottom:8px">
            <strong>Elecciones de ${esc(hdSel.nombre)}</strong>
            <span class="muted small">SL ${slNuevo}</span>
          </div>
          ${eleccionesHtml(f, hdSel, slNuevo)}
        </div>`;
      }
    }
  }

  // Paso 3: heroica
  if (domina && n.habilidad) {
    const sim = JSON.parse(JSON.stringify(pj));
    let sc = sim.clases.find((x) => x.id === n.clase);
    if (!sc) { sc = { id: n.clase, habilidades: {} }; sim.clases.push(sc); }
    sc.habilidades[n.habilidad] = (sc.habilidades[n.habilidad] || 0) + 1;
    sim.nivel = nuevo;
    const eleg = R.heroicasElegibles(sim, db);
    h += `<div class="small muted" style="margin:14px 0 6px">3 · Dominas ${esc(defC.nombre)}: elige una habilidad heroica</div>
      <div class="lista">${eleg.filter((e) => e.ok || libre()).map((e) => heroicaHtml(e.def, {
        derecha: `<button class="chip" data-act="nv-heroica" data-id="${e.def.id}" aria-pressed="${n.heroica === e.def.id}">${n.heroica === e.def.id ? 'Elegida' : 'Elegir'}</button>`,
        nota: e.ok ? '' : e.motivos.join(' · ')
      })).join('')}</div>`;
  }

  // Paso 4: atributo
  if (umbrales.includes(nuevo)) {
    const getBaseAtr = (a) => {
      let v = pj.atributos.base[a] || 8;
      for (const m of pj.atributos.mejoras || []) {
        if (m && m.atributo === a) v = R.subirDado(v);
      }
      return v;
    };
    h += `<div class="small muted" style="margin:14px 0 6px">${domina ? 4 : 3} · Mejora de atributo (nivel ${nuevo})</div>
      <div class="segmento">${R.ATR.map((a) => {
        const dAct = getBaseAtr(a);
        const maximo = dAct >= 12;
        return `<button data-act="nv-atr" data-id="${a}" aria-pressed="${n.atributo === a}" ${maximo ? 'disabled' : ''}>${a} d${dAct}${maximo ? ' (máx)' : ` → d${dAct + 2}`}</button>`;
      }).join('')}</div>`;
  }

  // Evolución narrativa opcional
  h += `<details class="tarjeta" style="margin-top:14px" ${n.identidad || n.tema ? 'open' : ''}>
    <summary class="small muted" style="cursor:pointer"><strong>Evolución narrativa (opcional)</strong> · Modificar Identidad o Tema</summary>
    <div class="pila" style="margin-top:10px">
      <label class="campo"><span>Nueva Identidad (dejar en blanco para conservar la actual)</span>
        <input type="text" data-nv-identidad value="${esc(n.identidad || '')}" placeholder="${esc(pj.identidad.identidad || 'Identidad actual')}">
      </label>
      <label class="campo"><span>Nuevo Tema</span>
        <select data-nv-tema>
          <option value="">Conservar actual (${esc(pj.identidad.tema || 'sin tema')})</option>
          ${tabla(db, 'temas').map((t) => `<option value="${esc(t)}" ${n.tema === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
      </label>
    </div>
  </details>`;

  const listo = n.clase && n.habilidad && (!domina || n.heroica || libre()) && (!umbrales.includes(nuevo) || n.atributo || libre());
  const faltaPx = pj.px < pxNivel && !libre();
  h += `<div class="fila" style="margin-top:16px"><button class="btn primario" data-act="subir-nivel" ${listo && !faltaPx ? '' : 'disabled'}>Subir a nivel ${nuevo}</button>
    ${faltaPx ? `<span class="muted small">Necesitas ${pxNivel} PX (tienes ${pj.px}).</span>` : ''}</div></div>`;
  return h + historialHtml();
}

function historialHtml() {
  if (!pj.historial.length) return '';
  return `<div class="seccion" style="margin-top:20px"><div class="fila entre"><h2>Historial</h2><button class="btn peq" data-act="deshacer-nivel">Deshacer último nivel</button></div>
    <div class="lista">${[...pj.historial].reverse().map((h) => {
      const c = get(dbTodo, 'clases', h.clase);
      const hd = hab(dbTodo, h.habilidad);
      const hh = h.heroica ? get(dbTodo, 'habilidades_heroicas', h.heroica) : null;
      const extra = [];
      if (hh) extra.push(`<span class="chip acento">${esc(hh.nombre)}</span>`);
      if (h.atributo) extra.push(`<span class="chip">+${h.atributo}</span>`);
      if (h.identidad_anterior) extra.push(`<span class="chip">Identidad cambiada</span>`);
      if (h.tema_anterior) extra.push(`<span class="chip">Tema cambiado</span>`);
      return `<div class="item fila"><strong style="width:72px">Nivel ${h.nivel}</strong><span>${esc(c ? c.nombre : h.clase)} · ${esc(hd ? hd.nombre : h.habilidad)}${extra.length ? ' · ' + extra.join(' ') : ''}</span></div>`;
    }).join('')}</div></div>`;
}

// =========================================================== FICHA
function panelFicha() {
  const c = R.calcular(pj, dbTodo);
  const i = pj.identidad;
  const estados = tabla(dbTodo, 'estados');
  const comp = c.competencias.map((x) => (tabla(dbTodo, 'competencias').find((y) => y.id === x) || { nombre: x }).nombre);
  const rit = c.rituales.map((x) => (tabla(dbTodo, 'disciplinas_rituales').find((y) => y.id === x) || { nombre: x }).nombre);
  return `<div class="seccion"><div class="display" style="font-size:30px">${esc(i.nombre || 'Sin nombre')}</div>
      <div class="muted">${esc([i.identidad, i.tema, i.origen].filter(Boolean).join(' · '))}</div>
      <div class="small faint">${esc([i.pronombres, i.especie, i.jugador ? 'Jugador/a: ' + i.jugador : ''].filter(Boolean).join(' · '))}</div></div>
    <div class="tarjeta"><h3>Estado actual</h3>
      <div class="rejilla c3">
        <label class="campo"><span>PV (máx. ${c.pv_max})</span><input type="number" data-bind="estado.pv" data-num="1" value="${pj.estado.pv ?? ''}"></label>
        <label class="campo"><span>PM (máx. ${c.pm_max})</span><input type="number" data-bind="estado.pm" data-num="1" value="${pj.estado.pm ?? ''}"></label>
        <label class="campo"><span>PI (máx. ${c.pi_max})</span><input type="number" data-bind="estado.pi" data-num="1" value="${pj.estado.pi ?? ''}"></label>
      </div>
      <div class="fila" style="margin-top:10px">${estados.map((e) => `<button class="chip" data-act="estado" data-id="${e.id}" aria-pressed="${pj.estado.estados.includes(e.id)}">${esc(e.nombre)}</button>`).join('')}
        <button class="btn peq" data-act="restablecer" style="margin-left:auto">Restablecer al máximo</button></div>
      <div class="rejilla c3" style="margin-top:10px">
        <label class="campo"><span>Puntos Fábula</span><input type="number" data-bind="pf" data-num="1" value="${pj.pf}"></label>
        <label class="campo"><span>PX</span><input type="number" data-bind="px" data-num="1" value="${pj.px}"></label>
        <label class="campo"><span>Zenit</span><input type="number" data-bind="zenit" data-num="1" value="${pj.zenit}"></label>
      </div></div>
    <div class="tarjeta"><h3>Combate</h3>${F.htmlStats(c, pj)}<div style="margin-top:10px">${F.htmlAtributos(c)}</div>
      <div style="margin-top:12px">${F.htmlAtaques(c, dbTodo)}</div>
      ${comp.length || rit.length ? `<div class="fila" style="margin-top:10px">${comp.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}${rit.map((x) => `<span class="chip acento">Rituales: ${esc(x)}</span>`).join('')}${c.proyectos ? '<span class="chip acento">Proyectos</span>' : ''}</div>` : ''}</div>
    <p class="muted small" style="margin-top:12px">Para ver la ficha completa con pestañas y filtros, descarga el JSON y ábrelo en el <a href="../visor/">visor</a>.</p>`;
}

// =========================================================== ACCIONES
function accion(act, ds, el, ev) {
  switch (act) {
    case 'tab': tab = ds.id; escribirLS(LS_TAB, tab); render(); window.scrollTo({ top: 0 }); return;
    case 'nuevo':
      if (!confirm('¿Empezar un personaje nuevo? Se perderán los cambios no descargados.')) return;
      { const cont = pj.contenido; pj = R.nuevoPersonaje(); pj.contenido = cont; }
      reconstruirDb(); tab = 'identidad'; ui.nivel = {}; cambio(); return;
    case 'descargar': {
      const out = R.exportar(pj, dbTodo);
      descargarJson(out, slugArchivo(pj.identidad.nombre) + '.json');
      return;
    }
    case 'modo-libre': pj.modo_libre = !pj.modo_libre; toast(pj.modo_libre ? 'Modo libre: puedes saltarte las reglas.' : 'Modo estricto activado.'); cambio(); return;

    // contenido
    case 'atlas': {
      const set = new Set(pj.contenido.atlas);
      if (el.checked) set.add(ds.id); else { set.delete(ds.id); delete pj.contenido.reglas[ds.id]; }
      pj.contenido.atlas = [...set]; reconstruirDb(); cambio(); return;
    }
    case 'regla': {
      const r = new Set(pj.contenido.reglas[ds.atlas] || []);
      if (el.checked) r.add(ds.id); else r.delete(ds.id);
      pj.contenido.reglas[ds.atlas] = [...r]; reconstruirDb(); cambio(); return;
    }

    // identidad
    case 'azar-identidad': {
      const t = (id) => azar(tabla(db, id));
      pj.identidad.identidad = `${t('identidad_concepto')} ${t('identidad_adjetivo').toLowerCase()} ${t('identidad_detalle')}`;
      cambio(); return;
    }
    case 'azar-tema': pj.identidad.tema = azar(tabla(db, 'temas')); cambio(); return;

    // clases
    case 'anadir-clase': {
      const id = document.getElementById('nueva-clase').value;
      if (id && !pj.clases.some((c) => c.id === id)) pj.clases.push({ id, habilidades: {}, beneficio: null });
      cambio(); return;
    }
    case 'quitar-clase': {
      const c = pj.clases.find((x) => x.id === ds.id);
      if (c) for (const hid of Object.keys(c.habilidades || {})) delete pj.elecciones[R.claveHab(hid)];
      pj.clases = pj.clases.filter((x) => x.id !== ds.id); cambio(); return;
    }
    case 'sl': {
      const c = pj.clases.find((x) => x.id === ds.clase);
      if (!c) return;
      const delta = Number(ds.d);
      const prevAsign = R.nivelesAsignados(pj);
      const slAct = (c.habilidades || {})[ds.id] || 0;
      const v = Math.max(0, slAct + delta);
      if (v) c.habilidades[ds.id] = v; else { delete c.habilidades[ds.id]; delete pj.elecciones[R.claveHab(ds.id)]; }

      const totalAsign = R.nivelesAsignados(pj);
      if (pj.nivel === prevAsign || totalAsign > pj.nivel) {
        pj.nivel = Math.max(5, Math.min(50, totalAsign));
      }
      pj.atributos.mejoras = (pj.atributos.mejoras || []).filter((m) => m && m.nivel <= pj.nivel);
      cambio(); return;
    }
    case 'fijar-nivel': {
      const n = Math.max(5, Math.min(50, Number(el.value) || 5));
      const totalAsign = R.nivelesAsignados(pj);
      pj.nivel = Math.max(n, totalAsign);
      el.value = pj.nivel;
      pj.atributos.mejoras = (pj.atributos.mejoras || []).filter((m) => m && m.nivel <= pj.nivel);
      cambio(); return;
    }
    case 'beneficio': { const c = pj.clases.find((x) => x.id === ds.clase); c.beneficio = ds.id; cambio(); return; }
    case 'anadir-heroica': pj.heroicas.push({ id: ds.id, elecciones: {} }); cambio(); return;
    case 'quitar-heroica': pj.heroicas.splice(Number(ds.i), 1); cambio(); return;

    // elecciones
    case 'elec-toggle': {
      const s = storeDe(decFuente(ds.f));
      let arr = Array.isArray(s[ds.clave]) ? [...s[ds.clave]] : [];
      if (arr.includes(ds.valor)) {
        arr = arr.filter((x) => x !== ds.valor);
        let changed = true;
        while (changed) {
          changed = false;
          for (const id of [...arr]) {
            const op = get(dbTodo, 'opciones', id);
            if (op && op.requiere && !op.requiere.every((r) => arr.includes(r))) {
              arr = arr.filter((x) => x !== id);
              changed = true;
            }
          }
        }
      } else {
        const mx = Number(ds.max) || 99;
        arr.push(ds.valor);
        if (mx === 1 && arr.length > 1 && !libre()) arr = arr.slice(-1);
      }
      s[ds.clave] = arr;
      cambio(); return;
    }
    case 'elec-sel': {
      const s = storeDe(decFuente(ds.f));
      const cant = Number(ds.cant) || 1;
      let arr = Array.isArray(s[ds.clave]) ? s[ds.clave] : (s[ds.clave] ? [s[ds.clave]] : []);
      if (arr.includes(ds.valor)) arr = arr.filter((x) => x !== ds.valor);
      else { arr = [...arr, ds.valor]; if (arr.length > cant) arr = arr.slice(-cant); }
      s[ds.clave] = arr; cambio(); return;
    }
    case 'elec-lista-anadir': { const s = storeDe(decFuente(ds.f)); s[ds.clave] = [...(s[ds.clave] || []), '']; cambio(); return; }
    case 'elec-lista-quitar': { const s = storeDe(decFuente(ds.f)); s[ds.clave].splice(Number(ds.i), 1); cambio(); return; }

    // atributos
    case 'perfil': {
      const p = tabla(db, 'perfiles_atributos').find((x) => x.id === ds.id);
      pj.atributos.perfil = ds.id;
      R.ATR.forEach((a, k) => { pj.atributos.base[a] = p.dados[k]; });
      cambio(); return;
    }
    case 'dado': {
      const v = el.value ? Number(el.value) : null;
      const b = pj.atributos.base;
      const prev = b[ds.atr];
      const p = tabla(db, 'perfiles_atributos').find((x) => x.id === pj.atributos.perfil);
      if (v && p) {
        const usados = R.ATR.filter((a) => a !== ds.atr && b[a] === v).length;
        const disponibles = p.dados.filter((d) => d === v).length;
        if (usados >= disponibles) { const otro = R.ATR.find((a) => a !== ds.atr && b[a] === v); b[otro] = prev; }
      }
      b[ds.atr] = v; cambio(); return;
    }
    case 'mejora': {
      pj.atributos.mejoras[Number(ds.i)] = { nivel: Number(ds.nivel), atributo: ds.atr };
      pj.atributos.mejoras = pj.atributos.mejoras.filter(Boolean); cambio(); return;
    }

    // equipo
    case 'tienda-col': ui.tienda.col = ds.id; if (!['armas', 'armaduras', 'escudos'].includes(ds.id)) ui.tienda.rareza = 'raro'; else if (ui.tienda.rareza === 'raro' && creando()) ui.tienda.rareza = 'basico'; renderPanel(); return;
    case 'tienda-rareza': ui.tienda.rareza = ds.id; renderPanel(); return;
    case 'tienda-atlas': ui.tienda.atlas = el.value; document.getElementById('tienda-lista').innerHTML = listaTienda(); return;
    case 'tienda-q': ui.tienda.q = el.value; document.getElementById('tienda-lista').innerHTML = listaTienda(); return;
    case 'comprar': comprar(ds.col, ds.id, ds.modo); return;
    case 'equipar': equipar(ds.uid, ds.ranura); return;
    case 'desequipar': desequipar(ds.ranura); return;
    case 'quitar-obj': quitarObjeto(ds.uid, false); return;
    case 'vender-obj': quitarObjeto(ds.uid, true); return;
    case 'abrir-ap': ui.ap = nuevaConfigAP(); renderDialogoAP(); return;
    case 'ap-crear': crearAP(ds.modo); return;
    case 'abrir-rm': ui.rm = { tipo: 'arma', base: '', elemento: 'fisico', cualidad: '', nombre: '', detalle: '' }; renderDialogoRM(); return;
    case 'rm-tipo': ui.rm = { ...ui.rm, tipo: ds.id, base: '', cualidad: '' }; renderDialogoRM(); return;
    case 'rm-crear': { const o = construirRM(); if (!o) return; const col = { arma: 'armas', armadura: 'armaduras', escudo: 'escudos', accesorio: 'accesorios' }[ui.rm.tipo]; cerrarDialogo(); anadirObjeto({ coleccion: col, personalizado: o }, o.coste, ds.modo, o); return; }
    case 'abrir-ol': ui.ol = { nombre: '', cualidad: '' }; renderDialogoOL(); return;
    case 'ol-crear': { if (!ui.ol.nombre.trim()) return toast('Ponle un nombre.', 'err'); const o = { id: 'libre', nombre: ui.ol.nombre, cualidad: ui.ol.cualidad }; cerrarDialogo(); anadirObjeto({ coleccion: 'otros', personalizado: o }, 0, 'gratis', o); return; }
    case 'cerrar-dialogo': cerrarDialogo(); return;

    // vínculos
    case 'anadir-vinculo': pj.vinculos.push({ hacia: '', emociones: [] }); cambio(); return;
    case 'quitar-vinculo': pj.vinculos.splice(Number(ds.i), 1); cambio(); return;
    case 'emocion': {
      const v = pj.vinculos[Number(ds.i)];
      const em = new Set(v.emociones || []);
      if (em.has(ds.e)) em.delete(ds.e); else { em.add(ds.e); em.delete(R.opuesta(ds.e)); }
      v.emociones = [...em]; cambio(); return;
    }

    // opcionales
    case 'elegir-peculiaridad': pj.opcionales.peculiaridad = { id: ds.id, elecciones: {} }; cambio(); return;
    case 'quitar-peculiaridad': pj.opcionales.peculiaridad = null; cambio(); return;
    case 'crear-poder-cero': pj.opcionales.poder_cero = { nombre: '', disparador: '', efecto: '', elecciones: {} }; cambio(); return;
    case 'quitar-poder-cero': pj.opcionales.poder_cero = null; cambio(); return;
    case 'pc-disparador': pj.opcionales.poder_cero.disparador = ds.id; cambio(); return;
    case 'pc-efecto': pj.opcionales.poder_cero.efecto = ds.id; pj.opcionales.poder_cero.elecciones = {}; cambio(); return;
    case 'azar-poder-cero': {
      const a = azar(tabla(db, 'poder_cero_nombre_accion')); const o = azar(tabla(db, 'poder_cero_nombre_origen'));
      pj.opcionales.poder_cero.nombre = `${a} ${/^(De|Del) /.test(o) ? o.toLowerCase() : o.toLowerCase()}`; cambio(); return;
    }

    // progreso
    case 'tirar-ahorros': {
      const resto = Math.max(0, param(db, 'presupuesto_inicial', 500) - gastoCreacion());
      const d6 = 1 + Math.floor(Math.random() * 6);
      pj.ahorros = { restante: resto, d6, total: resto + d6 * 10 };
      pj.zenit = pj.ahorros.total; cambio(); return;
    }
    case 'finalizar': {
      if (!pj.ahorros) accion('tirar-ahorros', {}, el, ev);
      const c = R.calcular(pj, dbTodo);
      pj.creacion_completa = true;
      pj.estado.pv = c.pv_max; pj.estado.pm = c.pm_max; pj.estado.pi = c.pi_max;
      for (const o of pj.equipo.objetos) { if (o.coste_pagado) { o.comprado = o.coste_pagado; o.coste_pagado = 0; } }
      toast('Personaje creado. Ya puedes descargarlo o subirlo de nivel.');
      ui.nivel = {}; cambio(); return;
    }
    case 'filtro-clase-tag': ui.filtroClaseTag = ds.tag; renderPanel(); return;
    case 'filtro-subida-tag': ui.filtroSubidaTag = ds.tag; renderPanel(); return;
    case 'nv-clase': ui.nivel = { ...ui.nivel, clase: ds.id, habilidad: '', heroica: '' }; renderPanel(); return;
    case 'nv-clase-nueva': ui.nivel = { ...ui.nivel, clase: el.value, habilidad: '', heroica: '' }; renderPanel(); return;
    case 'nv-hab': ui.nivel = { ...ui.nivel, habilidad: ds.id, heroica: '' }; renderPanel(); return;
    case 'nv-heroica': ui.nivel.heroica = ds.id; renderPanel(); return;
    case 'nv-atr': ui.nivel.atributo = ds.id; renderPanel(); return;
    case 'subir-nivel': {
      const r = R.subirNivel(pj, ui.nivel, db);
      if (!r.ok) { toast(r.errores[0], 'err'); return; }
      const hd = hab(dbTodo, ui.nivel.habilidad);
      toast(`¡Nivel ${pj.nivel}!${hd && hd.elecciones ? ' Elecciones guardadas o completables en Clases.' : ''}`);
      ui.nivel = { clase: '', habilidad: '', heroica: '', atributo: '', identidad: '', tema: '' };
      cambio(); return;
    }
    case 'deshacer-nivel': if (confirm('¿Deshacer la última subida de nivel?')) { R.deshacerNivel(pj, dbTodo); cambio(); } return;

    // ficha
    case 'estado': {
      const s = new Set(pj.estado.estados);
      if (s.has(ds.id)) s.delete(ds.id); else s.add(ds.id);
      pj.estado.estados = [...s]; cambio(); return;
    }
    case 'restablecer': {
      const c = R.calcular(pj, dbTodo);
      pj.estado = { ...pj.estado, pv: c.pv_max, pm: c.pm_max, pi: c.pi_max, estados: [] }; cambio(); return;
    }
    default:
  }
}

// =========================================================== eventos
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
  if (t.closest('summary')) e.preventDefault();
  if (t.disabled) return;
  accion(t.dataset.act, t.dataset, t, e);
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.act) { accion(t.dataset.act, t.dataset, t, e); return; }
  if (t.dataset.nvTema !== undefined) { ui.nivel.tema = t.value; return; }
  if (t.dataset.ap !== undefined || t.dataset.apPers !== undefined) { editarAP(t); return; }
  if (t.dataset.rm) { ui.rm[t.dataset.rm] = t.value; renderDialogoRM(); return; }
  if (t.dataset.bind && t.dataset.num) { bind(t); cambio({ panel: false }); }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.actInput) { accion(t.dataset.actInput, t.dataset, t, e); return; }
  if (t.dataset.nvIdentidad !== undefined) { ui.nivel.identidad = t.value; return; }
  if (t.dataset.bind) { bind(t); cambio({ panel: false }); return; }
  if (t.dataset.elecTexto) { storeDe(decFuente(t.dataset.f))[t.dataset.clave] = t.value; cambio({ panel: false }); return; }
  if (t.dataset.elecLista !== undefined) { const s = storeDe(decFuente(t.dataset.f)); s[t.dataset.clave][Number(t.dataset.elecLista)] = t.value; cambio({ panel: false }); return; }
  if (t.dataset.ap === 'nombre' || t.dataset.ap === 'forma2.nombre') { setPath(ui.ap, t.dataset.ap, t.value); return; }
  if (t.dataset.rm === 'nombre' || t.dataset.rm === 'detalle') { ui.rm[t.dataset.rm] = t.value; return; }
  if (t.dataset.ol) { ui.ol[t.dataset.ol] = t.value; }
});

function bind(t) {
  let v = t.value;
  if (t.dataset.num) v = v === '' ? null : Number(v);
  if (t.dataset.num && ['px', 'pf', 'zenit', 'nivel'].includes(t.dataset.bind)) v = v || 0;
  setPath(pj, t.dataset.bind, v);
}

function editarAP(t) {
  if (t.dataset.apPers !== undefined) {
    const cfg = t.dataset.apPers ? ui.ap.forma2 : ui.ap;
    const set = new Set(cfg.pers);
    if (t.checked) set.add(t.value); else set.delete(t.value);
    cfg.pers = [...set];
  } else {
    let v = t.value;
    if (t.dataset.ap.endsWith('prec')) v = Number(v);
    setPath(ui.ap, t.dataset.ap, v);
  }
  renderDialogoAP();
}

document.getElementById('cargar').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const datos = await leerArchivo(f);
    if (datos.formato && datos.formato !== R.FORMATO) throw new Error('El archivo no es un personaje de este generador.');
    pj = R.normalizarPersonaje(datos);
    delete pj.calculado;
    reconstruirDb(); ui.nivel = {}; tab = 'ficha';
    cambio();
    toast(`${pj.identidad.nombre || 'Personaje'} cargado.`);
  } catch (err) { toast(err.message, 'err'); }
  e.target.value = '';
});

document.getElementById('dialogo').addEventListener('close', () => { ui.ap = ui.rm = ui.ol = null; });

iniciar();
