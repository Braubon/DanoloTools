// ---------------------------------------------------------------------------
// Fichas completas de Fabula Ultima (solo lectura). La abre el botón
// «Detalles» de la vista de combate.
// Carga los personajes de la partida (/api/datos/), que exige iniciar sesión
// con una cuenta de Discord del servidor. Si la API no está disponible (por
// ejemplo en local), usa los listados en /personajes/index.json.
// ---------------------------------------------------------------------------
import { cargarRaw, construirDb, get, hab, tabla } from './db.js';
import * as R from './rules.js';
import { esc, md, initTema, leerArchivo, toast, ICON, normTxt } from './ui.js';
import * as F from './ficha.js';

const CARPETA = '../personajes/';
const LS_LOCALES = 'fu-visor-locales';

let raw, db;
const pjs = [];           // { key, pj, origen: 'nube'|'carpeta'|'local' }
const API_PUBLICO = '/api/datos/?accion=publico';
let acceso = null;        // { motivo } si la API pide iniciar sesión
let actual = 'grupo';     // 'grupo' | key
let pestana = 'resumen';
const filtro = { q: '', hab: 'todas', clase: '', magia: 'todos', equipo: 'todo' };

const vista = () => document.getElementById('vista');

async function iniciar() {
  initTema();
  try {
    raw = await cargarRaw('../data/');
  } catch (e) {
    vista().innerHTML = `<div class="vacio"><p><strong>No se pudo cargar la base de datos.</strong></p><p class="small">${esc(e.message)}</p>
      <p class="small">Sirve la carpeta del proyecto con un servidor (por ejemplo <code>npx serve .</code>) o súbela a Vercel.</p></div>`;
    return;
  }
  db = construirDb(raw, null);
  const nube = await cargarNube();
  if (nube === false) await cargarCarpeta();
  pintarUsuario();
  cargarLocales();
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash && pjs.some((p) => p.key === hash)) actual = hash;
  render();
}

/** true = cargado; 'login' = la API pide sesión; false = no hay API (local). */
async function cargarNube() {
  try {
    const r = await fetch(API_PUBLICO, { cache: 'no-store' });
    if (!(r.headers.get('content-type') || '').includes('json')) return false;
    const j = await r.json();
    if (r.status === 401 || r.status === 403) { acceso = { motivo: j.error, status: r.status }; return 'login'; }
    if (!r.ok || !Array.isArray(j.personajes)) return false;
    j.personajes.forEach((d) => { try { anadir(d, 'nube'); } catch (e) { console.warn(e); } });
    return true;
  } catch (e) { return false; }
}

let sesion = null;
async function pintarUsuario() {
  try { sesion = await (await fetch('/api/auth/?accion=yo', { cache: 'no-store' })).json(); } catch (e) { return; }
  const u = sesion && sesion.usuario;
  document.getElementById('usuario').innerHTML = u
    ? `<span class="fila small muted">${u.avatar ? `<img src="${esc(u.avatar)}" alt="" width="22" height="22" style="border-radius:50%">` : ''}${esc(u.nombre)}<button class="btn peq fantasma" data-act="salir">Salir</button></span>`
    : '';
}
const urlEntrar = () => `/api/auth/?accion=entrar&volver=${encodeURIComponent(location.pathname + location.hash)}`;

async function cargarCarpeta() {
  let lista = [];
  try {
    const r = await fetch(CARPETA + 'index.json', { cache: 'no-cache' });
    if (r.ok) lista = (await r.json()).personajes || [];
  } catch (e) { /* sin carpeta */ }
  const res = await Promise.allSettled(lista.map(async (f) => {
    const r = await fetch(CARPETA + f, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return { f, datos: await r.json() };
  }));
  for (const x of res) {
    if (x.status === 'fulfilled') anadir(x.value.datos, 'carpeta', x.value.f);
    else console.warn('No se pudo cargar', x.reason);
  }
}

function cargarLocales() {
  try {
    const l = JSON.parse(localStorage.getItem(LS_LOCALES) || '[]');
    l.forEach((d) => anadir(d, 'local'));
  } catch (e) { /* nada */ }
}
function guardarLocales() {
  try { localStorage.setItem(LS_LOCALES, JSON.stringify(pjs.filter((p) => p.origen === 'local').map((p) => p.pj))); } catch (e) { /* lleno */ }
}

function anadir(datos, origen, archivo = '') {
  if (datos.formato && datos.formato !== R.FORMATO) throw new Error(`${archivo || 'Archivo'}: no es una ficha de personaje.`);
  const pj = R.normalizarPersonaje(datos);
  const key = pj.id || archivo || R.uid();
  const i = pjs.findIndex((p) => p.key === key);
  const entrada = { key, pj, origen, archivo };
  if (i >= 0) pjs[i] = entrada; else pjs.push(entrada);
  return key;
}

// ============================================================== render
function render() {
  renderSelector();
  const p = pjs.find((x) => x.key === actual);
  if (!p) { actual = 'grupo'; vista().innerHTML = vistaGrupo(); return; }
  vista().innerHTML = vistaPersonaje(p);
  aplicarFiltros();
}

function renderSelector() {
  document.getElementById('selector').innerHTML = `<button class="pj solo" data-act="ver" data-key="grupo" aria-current="${actual === 'grupo'}">Grupo <small>${pjs.length}</small></button>`
    + pjs.map((p) => `<span class="pj" role="button" tabindex="0" data-act="ver" data-key="${esc(p.key)}" aria-current="${actual === p.key}">
      ${esc(p.pj.identidad.nombre || 'Sin nombre')} <small>Nv ${p.pj.nivel}</small>
      <span class="quitar" data-act="quitar" data-key="${esc(p.key)}" title="Quitar de la vista" aria-label="Quitar">${ICON.x}</span></span>`).join('');
}

// ------------------------------------------------------------ grupo
function vistaGrupo() {
  if (!pjs.length && acceso) {
    return `<div class="tarjeta" style="text-align:center;padding:40px 16px">
      <div class="display" style="font-size:26px;margin-bottom:6px">Fichas del grupo</div>
      <p class="muted">${acceso.status === 403 ? esc(acceso.motivo) : 'Entra con tu cuenta de Discord del servidor de la partida para ver las fichas.'}</p>
      ${acceso.status === 403 ? '' : `<a class="btn primario" href="${urlEntrar()}">Entrar con Discord</a>`}</div>`;
  }
  if (!pjs.length) {
    return `<div class="vacio"><p><strong>No hay personajes cargados.</strong></p>
      <p class="small">Usa «Cargar fichas» o añade archivos a la carpeta <code>personajes/</code> y lístalos en <code>personajes/index.json</code>.</p></div>`;
  }
  const datos = pjs.map((p) => ({ p, c: R.calcular(p.pj, db) }));
  const tarjetas = datos.map(({ p, c }) => {
    const e = p.pj.estado;
    const pv = e.pv ?? c.pv_max, pm = e.pm ?? c.pm_max, pi = e.pi ?? c.pi_max;
    const linea = (k, act, max, cls) => `<div class="linea"><span class="faint">${k}</span><div class="barra ${cls}"><i style="width:${Math.max(0, Math.min(100, (act / max) * 100))}%"></i></div><span class="mono">${act}/${max}</span></div>`;
    const crisis = pv <= c.crisis;
    return `<button class="miembro ${crisis ? 'en-crisis' : ''}" data-act="ver" data-key="${esc(p.key)}">
      <div class="fila entre"><span class="display nombre">${esc(p.pj.identidad.nombre || 'Sin nombre')}</span><span class="chip">Nv ${p.pj.nivel}</span></div>
      <div class="muted small">${esc(F.resumenClases(p.pj, db))}</div>
      ${linea('PV', pv, c.pv_max, 'pv')}${linea('PM', pm, c.pm_max, 'pm')}${linea('PI', pi, c.pi_max, 'pi')}
      <div class="def"><span>DEF <b>${c.def}</b></span><span>D.Mág <b>${c.mdef}</b></span><span>Inic. <b>${c.init >= 0 ? '+' : ''}${c.init}</b></span><span>PF <b>${p.pj.pf}</b></span></div>
      ${crisis || (e.estados || []).length ? `<div class="fila" style="margin-top:8px">${crisis ? '<span class="chip err">En Crisis</span>' : ''}${(e.estados || []).map((s) => `<span class="chip">${esc(F.nombreEstado(db, s))}</span>`).join('')}</div>` : ''}
    </button>`;
  }).join('');

  // Relaciones
  const nombres = pjs.map((p) => p.pj.identidad.nombre);
  const norm = (s) => (s || '').trim().toLowerCase();
  const POS = new Set(['admiracion', 'lealtad', 'afecto']);
  const celda = (de, a) => {
    if (de === a) return '<td class="yo"></td>';
    const v = (de.pj.vinculos || []).find((x) => norm(x.hacia) === norm(a.pj.identidad.nombre));
    if (!v) return '<td class="faint">—</td>';
    return `<td>${(v.emociones || []).map((e) => `<span class="em ${POS.has(e) ? 'emo-pos' : 'emo-neg'}">${esc(F.nombreEmocion(db, e))}</span>`).join('')}<span class="fz">Fuerza ${(v.emociones || []).length}</span></td>`;
  };
  const matriz = pjs.length > 1 ? `<div class="matriz"><table><thead><tr><th>De ↓ · Hacia →</th>${pjs.map((p) => `<th>${esc(p.pj.identidad.nombre)}</th>`).join('')}</tr></thead>
    <tbody>${pjs.map((de) => `<tr><th>${esc(de.pj.identidad.nombre)}</th>${pjs.map((a) => celda(de, a)).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  const externos = pjs.flatMap((p) => (p.pj.vinculos || []).filter((v) => !nombres.some((n) => norm(n) === norm(v.hacia))).map((v) => ({ de: p.pj.identidad.nombre, v })));
  const ext = externos.length ? `<div class="seccion" style="margin-top:18px"><h2>Otros vínculos</h2><div class="lista">${externos.map(({ de, v }) =>
    `<div class="item fila entre"><span><span class="muted">${esc(de)} →</span> <span class="titulo">${esc(v.hacia || '—')}</span></span>
     <span class="muted small">${(v.emociones || []).map((e) => esc(F.nombreEmocion(db, e))).join(', ')} · Fuerza ${(v.emociones || []).length}</span></div>`).join('')}</div></div>` : '';

  const nivelMedio = Math.round(pjs.reduce((a, p) => a + p.pj.nivel, 0) / pjs.length);
  const orden = [...datos].sort((a, b) => b.c.init - a.c.init).map(({ p, c }) => `${esc(p.pj.identidad.nombre)} (${c.init >= 0 ? '+' : ''}${c.init})`).join(' · ');
  return `<div class="seccion fila entre"><h2 style="font-size:20px">Grupo</h2>
      <span class="muted small">${pjs.length} personaje${pjs.length > 1 ? 's' : ''} · nivel del grupo ${Math.max(...pjs.map((p) => p.pj.nivel))} · medio ${nivelMedio}</span></div>
    <div class="miembros">${tarjetas}</div>
    <p class="small muted" style="margin:-8px 0 18px">Modificadores de iniciativa: ${orden}</p>
    ${matriz ? `<div class="seccion"><h2>Relaciones</h2>${matriz}</div>` : ''}${ext}`;
}

// ------------------------------------------------------------ personaje
const PESTANAS = [['resumen', 'Resumen'], ['habilidades', 'Habilidades'], ['magia', 'Magia'], ['equipo', 'Equipo'], ['vinculos', 'Vínculos'], ['notas', 'Notas']];

function vistaPersonaje(p) {
  const pj = p.pj;
  const c = R.calcular(pj, db);
  const i = pj.identidad;
  const magia = R.conjurosConocidos(pj, db).length + R.opcionesElegidas(pj, db).length;
  const tabs = PESTANAS.filter(([id]) => id !== 'magia' || magia);
  if (!tabs.some(([id]) => id === pestana)) pestana = 'resumen';
  const e = pj.estado;
  const recurso = (k, cls, act, max, extra = '') => {
    const a = act ?? max;
    return `<div class="recurso ${cls}"><div class="fila"><span class="k">${k}</span>${extra}</div>
      <div class="v">${a}<small> / ${max}</small></div><div class="barra ${cls}"><i style="width:${Math.max(0, Math.min(100, (a / max) * 100))}%"></i></div></div>`;
  };
  const pv = e.pv ?? c.pv_max;
  return `<div class="cabecera">
      <div><div class="display nombre">${esc(i.nombre || 'Sin nombre')}</div>
        <div class="meta">${esc([i.identidad, i.tema, i.origen].filter(Boolean).join(' · '))}</div>
        <div class="meta2">${esc([`Nivel ${pj.nivel}`, F.resumenClases(pj, db), i.especie, i.pronombres, i.jugador ? 'Jugador/a: ' + i.jugador : ''].filter(Boolean).join(' · '))}</div></div>
      <div class="chips"><span class="chip acento">PF ${pj.pf}</span><span class="chip">PX ${pj.px}</span><span class="chip">${pj.zenit} z</span>
        ${p.origen === 'nube' ? '<span class="chip" title="Guardado en la partida">Partida</span>' : p.origen === 'carpeta' ? '<span class="chip" title="Cargado desde la carpeta personajes/">Carpeta</span>' : '<span class="chip" title="Cargado desde tu equipo">Local</span>'}</div>
    </div>
    <div class="recursos">
      ${recurso('Puntos de Vida', 'pv', e.pv, c.pv_max, pv <= c.crisis ? '<span class="crisis">En Crisis</span>' : `<span class="faint small">Crisis ${c.crisis}</span>`)}
      ${recurso('Puntos de Mente', 'pm', e.pm, c.pm_max)}
      ${recurso('Puntos de Inventario', 'pi', e.pi, c.pi_max)}
    </div>
    <div class="defensas">
      <div class="stat"><div class="k">Defensa</div><div class="v">${c.def}</div></div>
      <div class="stat"><div class="k">D. Mágica</div><div class="v">${c.mdef}</div></div>
      <div class="stat"><div class="k">Iniciativa</div><div class="v">${c.init >= 0 ? '+' : ''}${c.init}</div></div>
      ${R.ATR.map((a) => `<div class="atributo"><div class="k">${a}</div><div class="v">${R.fmtDado(c.actual[a])}</div><div class="b">${c.actual[a] !== c.base[a] ? 'base d' + c.base[a] : R.ATR_NOMBRE[a]}</div></div>`).join('')}
    </div>
    ${(e.estados || []).length ? `<div class="fila" style="margin:-8px 0 16px">${e.estados.map((s) => `<span class="chip err">${esc(F.nombreEstado(db, s))}</span>`).join('')}</div>` : ''}
    <nav class="pestanas" role="tablist">${tabs.map(([id, n]) => `<button role="tab" aria-selected="${pestana === id}" data-act="pestana" data-id="${id}">${n}</button>`).join('')}</nav>
    ${barraFiltros(pj)}
    <section id="contenido-pestana">${({ resumen: tabResumen, habilidades: tabHabilidades, magia: tabMagia, equipo: tabEquipo, vinculos: tabVinculos, notas: tabNotas })[pestana](pj, c)}</section>`;
}

function barraFiltros(pj) {
  if (pestana === 'resumen' || pestana === 'vinculos') return '';
  const seg = (clave, ops) => `<div class="segmento">${ops.map(([id, n]) => `<button data-act="filtro" data-clave="${clave}" data-id="${id}" aria-pressed="${filtro[clave] === id}">${n}</button>`).join('')}</div>`;
  let extra = '';
  if (pestana === 'habilidades') {
    extra = seg('hab', [['todas', 'Todas'], ['pasiva', 'Pasivas'], ['accion', 'Acciones'], ['reaccion', 'Reacciones'], ['otra', 'Especiales']]);
    if (pj.clases.length > 1) extra += `<select data-act="filtro-clase" style="width:auto"><option value="">Todas las clases</option>${pj.clases.map((cl) => `<option value="${cl.id}" ${filtro.clase === cl.id ? 'selected' : ''}>${esc((get(db, 'clases', cl.id) || { nombre: cl.id }).nombre)}</option>`).join('')}<option value="heroicas" ${filtro.clase === 'heroicas' ? 'selected' : ''}>Habilidades heroicas</option></select>`;
  }
  if (pestana === 'magia') extra = seg('magia', [['todos', 'Todo'], ['ofensivo', 'Ofensivos'], ['apoyo', 'Apoyo']]);
  if (pestana === 'equipo') extra = seg('equipo', [['todo', 'Todo'], ['equipado', 'Equipado'], ['armas', 'Armas'], ['armaduras', 'Armaduras'], ['escudos', 'Escudos'], ['accesorios', 'Accesorios'], ['otros', 'Otros']]);
  return `<div class="barra-filtros"><div class="buscador"><input type="search" placeholder="Buscar en esta pestaña" value="${esc(filtro.q)}" data-filtro-q="1" aria-label="Buscar"></div>${extra}</div>`;
}

function tabResumen(pj, c) {
  const comp = c.competencias.map((x) => (tabla(db, 'competencias').find((y) => y.id === x) || { nombre: x }).nombre);
  const rit = c.rituales.map((x) => (tabla(db, 'disciplinas_rituales').find((y) => y.id === x) || { nombre: x }).nombre);
  const habs = R.habilidadesPJ(pj, db).filter((h) => h.def && (h.def.tipo === 'accion' || h.def.tipo === 'otra'));
  const conj = R.conjurosConocidos(pj, db).flatMap((g) => g.conjuros);
  return `<div class="rejilla c2">
    <div><div class="seccion"><h2>Ataques</h2>${F.htmlAtaques(c, db)}</div>
      ${comp.length || rit.length || c.proyectos ? `<div class="seccion"><h2>Competencias</h2><div class="fila">${comp.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}${rit.map((x) => `<span class="chip acento">Rituales · ${esc(x)}</span>`).join('')}${c.proyectos ? '<span class="chip acento">Proyectos</span>' : ''}</div></div>` : ''}
      ${c.magia ? `<p class="small muted">Bonificador a pruebas de magia: +${c.magia}</p>` : ''}</div>
    <div>${habs.length ? `<div class="seccion"><h2>Acciones de habilidad</h2><div class="lista">${habs.map((h) => F.htmlHabilidad(db, h.def, h.sl)).join('')}</div></div>` : ''}
      ${conj.length ? `<div class="seccion"><h2>Conjuros</h2><div class="lista">${conj.map((cj) => `<div class="item fila entre"><span class="titulo">${esc(cj.nombre)}</span><span class="muted small">${esc(F.metaConjuro(cj))}</span></div>`).join('')}</div></div>` : ''}
      ${pj.heroicas.length ? `<div class="seccion"><h2>Habilidades heroicas</h2><div class="fila">${pj.heroicas.map((hh) => `<span class="chip acento">${esc((get(db, 'habilidades_heroicas', hh.id) || { nombre: hh.id }).nombre)}</span>`).join('')}</div></div>` : ''}
    </div></div>`;
}

/** Resumen legible de las elecciones de una fuente. */
function textoElecciones(def, valores) {
  return (def.elecciones || []).map((e) => {
    const v = valores[e.clave];
    if (!v || (Array.isArray(v) && !v.length)) return '';
    let txt;
    if (e.tipo === 'conjuros') txt = v.map((id) => (get(db, 'conjuros', id) || { nombre: id }).nombre).join(', ');
    else if (e.tipo === 'opciones') txt = v.map((id) => (get(db, 'opciones', id) || { nombre: id }).nombre).join(', ');
    else if (e.tipo === 'seleccion') txt = (Array.isArray(v) ? v : [v]).map((id) => (R.valoresEleccion(e, db).find((x) => x.id === id) || { nombre: id }).nombre).join(', ');
    else if (Array.isArray(v)) txt = v.filter(Boolean).join(' · ');
    else txt = v;
    return `<div class="elec">${esc(e.etiqueta)}: <b>${esc(txt)}</b></div>`;
  }).join('');
}

function tabHabilidades(pj) {
  let h = '';
  for (const cl of pj.clases) {
    const def = get(db, 'clases', cl.id);
    if (!def) continue;
    const nv = R.nivelClase(cl);
    const habs = (def.habilidades || []).filter((x) => (cl.habilidades || {})[x.id]);
    const ben = def.beneficios && def.beneficios.eleccion && cl.beneficio ? (def.beneficios.eleccion.find((x) => x.id === cl.beneficio) || {}).etiqueta : '';
    h += `<div class="grupo-clase" data-clase="${cl.id}"><div class="fila"><h3>${esc(def.nombre)}</h3><span class="muted">Nivel ${nv}</span>${nv >= 10 ? '<span class="chip acento">Dominada</span>' : ''}${F.etiquetasClase(def)}${F.atlasTag(db, def)}</div>
      <p class="small muted">${esc(def.beneficios ? def.beneficios.texto : '')}${ben ? ` <b>(${esc(ben)})</b>` : ''}</p>
      <div class="lista">${habs.map((x) => {
        const sl = cl.habilidades[x.id];
        return F.htmlHabilidad(db, x, sl, { extra: x.elecciones ? textoElecciones(x, pj.elecciones[R.claveHab(x.id)] || {}) : '' }).replace('<details class="item ', `<details data-tipo="${x.tipo}" class="item `);
      }).join('')}</div></div>`;
  }
  if (pj.heroicas.length) {
    h += `<div class="grupo-clase" data-clase="heroicas"><div class="fila"><h3>Habilidades heroicas</h3></div><div class="lista">${pj.heroicas.map((hh) => {
      const d = get(db, 'habilidades_heroicas', hh.id);
      if (!d) return '';
      return `<details class="item" data-tipo="heroica" data-busqueda="${esc((d.nombre + ' ' + d.efecto).toLowerCase())}"><summary><span><span class="titulo">${esc(d.nombre)}</span><br><span class="sub">${esc(d.resumen || '')}</span></span><span class="der">${F.atlasTag(db, d)}</span></summary>
        <div class="cuerpo"><div class="texto">${md(d.efecto)}</div>${textoElecciones(d, hh.elecciones || {})}</div></details>`;
    }).join('')}</div></div>`;
  }
  return h || '<div class="vacio">Sin habilidades.</div>';
}

function tabMagia(pj) {
  let h = '';
  for (const g of R.conjurosConocidos(pj, db)) {
    h += `<div class="seccion grupo-filtrable"><h2>${esc(g.origen)} <span class="muted">${g.conjuros.length}</span></h2><div class="lista">${g.conjuros.map((cj) => F.htmlConjuro(db, cj)).join('')}</div></div>`;
  }
  for (const g of R.opcionesElegidas(pj, db)) {
    h += `<div class="seccion grupo-filtrable"><h2>${esc(g.etiqueta)} <span class="muted">${esc(g.origen)}</span></h2><div class="lista">${g.opciones.map((o) => F.htmlOpcion(db, o).replace('<details class="item"', '<details class="item" data-tipo="apoyo"')).join('')}</div></div>`;
  }
  return h || '<div class="vacio">Sin conjuros ni opciones mágicas.</div>';
}

function tabEquipo(pj, c) {
  const eq = pj.equipo.equipado;
  const puesto = (uid) => R.RANURAS.filter((r) => eq[r] === uid);
  const objs = pj.equipo.objetos.map((o) => ({ o, d: R.resolverObjeto(o, db), r: puesto(o.uid) }));
  const ranuras = `<div class="rejilla c4" style="margin-bottom:16px">${R.RANURAS.map((r) => {
    const o = c.equipados[r];
    return `<div class="stat"><div class="k">${F.nombreRanura(r)}</div><div style="font-weight:600;margin-top:2px">${o ? esc(o.nombre) : '<span class="faint">—</span>'}</div></div>`;
  }).join('')}</div>`;
  const lista = objs.length ? `<div class="lista">${objs.map(({ o, d, r }) => F.htmlObjeto(db, d, {
    derecha: r.length ? `<span class="chip acento">${r.map(F.nombreRanura).join(' + ')}</span>` : '',
    sub: o.origen === 'peculiaridad' ? ' <span class="chip">Reliquia</span>' : ''
  }).replace('<details class="item"', `<details class="item" data-equipado="${r.length ? 1 : 0}"`)).join('')}</div>` : '<div class="vacio">Inventario vacío.</div>';
  return `${ranuras}<div class="seccion"><h2>Ataques</h2>${F.htmlAtaques(c, db)}</div><div class="seccion"><h2>Inventario <span class="muted">${objs.length}</span></h2>${lista}</div>`;
}

function tabVinculos(pj) {
  if (!pj.vinculos.length) return '<div class="vacio">Sin vínculos.</div>';
  return `<div class="lista">${pj.vinculos.map((v) => F.htmlVinculo(db, v)).join('')}</div>
    <p class="small muted" style="margin-top:10px">La fuerza de un vínculo es su número de emociones.</p>`;
}

function tabNotas(pj) {
  const i = pj.identidad;
  let h = '';
  if (i.apariencia) h += `<div class="seccion item-notas" data-busqueda="${esc(i.apariencia.toLowerCase())}"><h2>Apariencia</h2><div class="texto">${md(i.apariencia)}</div></div>`;
  const pec = pj.opcionales.peculiaridad;
  if (pec) {
    const d = get(db, 'peculiaridades', pec.id);
    if (d) h += `<div class="seccion"><h2>Peculiaridad</h2><div class="lista"><details class="item" open data-busqueda="${esc((d.nombre + ' ' + d.efecto).toLowerCase())}"><summary><span class="titulo">${esc(d.nombre)}</span><span class="der">${F.atlasTag(db, d)}</span></summary>
      <div class="cuerpo"><div class="texto">${md(d.efecto)}</div>${textoElecciones(d, pec.elecciones || {})}</div></details></div></div>`;
  }
  const pc = pj.opcionales.poder_cero;
  if (pc) {
    const dis = get(db, 'poderes_cero_disparadores', pc.disparador);
    const ef = get(db, 'poderes_cero_efectos', pc.efecto);
    h += `<div class="seccion"><h2>Poder Cero${pc.nombre ? ` · ${esc(pc.nombre)}` : ''}</h2><div class="lista">
      ${dis ? `<div class="item" data-busqueda="${esc(dis.nombre.toLowerCase())}"><span class="titulo">Disparador: ${esc(dis.nombre)}</span> <span class="muted small">(${esc(dis.secciones)} secc.)</span><div class="sub">${esc(dis.efecto)}</div></div>` : ''}
      ${ef ? `<details class="item" open data-busqueda="${esc((ef.nombre + ' ' + ef.efecto).toLowerCase())}"><summary><span class="titulo">Efecto: ${esc(ef.nombre)}</span></summary><div class="cuerpo"><div class="texto">${md(ef.efecto)}</div>${textoElecciones(ef, pc.elecciones || {})}</div></details>` : ''}
    </div><p class="small muted" style="margin-top:6px">Reloj de Cero de 6 secciones.</p></div>`;
  }
  if (pj.notas) h += `<div class="seccion" data-busqueda="${esc(pj.notas.toLowerCase())}"><h2>Notas</h2><div class="texto">${md(pj.notas)}</div></div>`;
  if (pj.historial.length) {
    h += `<div class="seccion"><h2>Historial de niveles</h2><div class="lista">${pj.historial.map((x) => {
      const cl = get(db, 'clases', x.clase); const hd = hab(db, x.habilidad);
      const hh = x.heroica ? get(db, 'habilidades_heroicas', x.heroica) : null;
      return `<div class="item fila" data-busqueda="${esc(((cl || {}).nombre + ' ' + (hd || {}).nombre).toLowerCase())}"><strong style="width:72px">Nivel ${x.nivel}</strong><span>${esc(cl ? cl.nombre : x.clase)} · ${esc(hd ? hd.nombre : x.habilidad)}${hh ? ` · ${esc(hh.nombre)}` : ''}${x.atributo ? ` · +${x.atributo}` : ''}</span></div>`;
    }).join('')}</div></div>`;
  }
  return h || '<div class="vacio">Sin notas.</div>';
}

// ============================================================== filtros
function aplicarFiltros() {
  const cont = document.getElementById('contenido-pestana');
  if (!cont) return;
  const q = normTxt(filtro.q.trim());
  cont.querySelectorAll('[data-busqueda]').forEach((el) => {
    let ok = !q || normTxt(el.dataset.busqueda).includes(q);
    if (pestana === 'habilidades' && filtro.hab !== 'todas') ok = ok && el.dataset.tipo === filtro.hab;
    if (pestana === 'magia' && filtro.magia !== 'todos') ok = ok && el.dataset.tipo === filtro.magia;
    if (pestana === 'equipo' && filtro.equipo !== 'todo') {
      if (filtro.equipo === 'equipado') ok = ok && el.dataset.equipado === '1';
      else if (filtro.equipo === 'otros') ok = ok && !['armas', 'armaduras', 'escudos', 'accesorios'].includes(el.dataset.tipo);
      else ok = ok && el.dataset.tipo === filtro.equipo;
    }
    el.classList.toggle('oculto', !ok);
  });
  if (pestana === 'habilidades') {
    cont.querySelectorAll('.grupo-clase').forEach((g) => {
      const visibleClase = !filtro.clase || g.dataset.clase === filtro.clase;
      const alguno = g.querySelector('[data-busqueda]:not(.oculto)');
      g.classList.toggle('oculto', !visibleClase || !alguno);
    });
  }
  if (pestana === 'magia') {
    cont.querySelectorAll('.grupo-filtrable').forEach((g) => g.classList.toggle('oculto', !g.querySelector('[data-busqueda]:not(.oculto)')));
  }
}

// ============================================================== eventos
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const ds = t.dataset;
  switch (ds.act) {
    case 'ver': actual = ds.key; history.replaceState(null, '', ds.key === 'grupo' ? location.pathname : '#' + encodeURIComponent(ds.key)); render(); window.scrollTo({ top: 0 }); break;
    case 'quitar': {
      e.stopPropagation();
      const i = pjs.findIndex((p) => p.key === ds.key);
      if (i >= 0) { const [p] = pjs.splice(i, 1); if (p.origen === 'local') guardarLocales(); if (actual === p.key) actual = 'grupo'; render(); toast(`${p.pj.identidad.nombre || 'Personaje'} quitado de la vista.`); }
      break;
    }
    case 'pestana': pestana = ds.id; filtro.q = ''; render(); break;
    case 'salir': fetch('/api/auth/?accion=salir', { method: 'POST' }).finally(() => location.reload()); break;
    case 'filtro': filtro[ds.clave] = ds.id; render(); break;
    default:
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.pj[role="button"]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('change', (e) => {
  if (e.target.dataset.act === 'filtro-clase') { filtro.clase = e.target.value; aplicarFiltros(); }
});
document.addEventListener('input', (e) => {
  if (e.target.dataset.filtroQ) { filtro.q = e.target.value; aplicarFiltros(); }
});
document.getElementById('cargar').addEventListener('change', async (e) => {
  let ultimo = null;
  for (const f of e.target.files) {
    try { ultimo = anadir(await leerArchivo(f), 'local', f.name); } catch (err) { toast(err.message, 'err'); }
  }
  guardarLocales();
  if (ultimo) { actual = e.target.files.length > 1 ? 'grupo' : ultimo; render(); toast(`${e.target.files.length} ficha${e.target.files.length > 1 ? 's' : ''} cargada${e.target.files.length > 1 ? 's' : ''}.`); }
  e.target.value = '';
});

iniciar();
