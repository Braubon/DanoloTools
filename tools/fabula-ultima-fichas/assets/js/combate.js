// ---------------------------------------------------------------------------
// Vista de combate (sustituye al antiguo visor).
// Cuatro columnas: retaguardia y vanguardia enemigas | vanguardia y
// retaguardia aliadas. Sin enemigos en el campo, solo el grupo en formación.
//
// Lo que ve cada uno lo decide el servidor (/api/datos/?accion=campo):
//   espectador → posiciones, nombres e imágenes
//   jugador    → fichas de los PJ y lo revelado de los PNJ; mueve sus PJ
//   dj         → todo, y además coloca, ajusta y revela PNJ
// La vista consulta cambios cada pocos segundos mientras está visible.
// ---------------------------------------------------------------------------
import { cargarRaw, construirDb, get } from './db.js';
import * as R from './rules.js';
import * as N from './pnj.js';
import * as F from './ficha.js';
import * as VP from './vista-pnj.js';
import { esc, md, initTema, toast, ICON, reducirImagen } from './ui.js';

const A = '/api/';
const SPRITE = '../assets/img/sprite-defecto.png';
const INTERVALO = 4000;
const FILAS = [['retaguardia', 'Retaguardia'], ['vanguardia', 'Vanguardia']];
const ABREV = { confundido: 'Conf', debil: 'Déb', enfurecido: 'Enf', envenenado: 'Env', estremecido: 'Estr', lento: 'Lent' };

let datos = null;          // última respuesta de la API
let version = 0;
let db = null;
let seleccion = null;      // clave seleccionada ('pj:…' | 'pnj:…')
let sinApi = false;
let pidiendo = false;
let imagenPara = null;     // clave a la que se sube la imagen
let partidaActual = new URLSearchParams(location.search).get('partida') || localStorage.getItem('fu-partida') || 'principal';

const $ = (id) => document.getElementById(id);
const esDj = () => datos && datos.rol === 'dj';
const ve = () => datos && datos.rol !== 'espectador';

const conPartida = (ruta) => {
  const sep = ruta.includes('?') ? '&' : '?';
  return `${ruta}${sep}partida=${encodeURIComponent(partidaActual)}`;
};

function actualizarEnlacesNav() {
  const ef = $('enlace-fichas');
  if (ef) ef.href = `../ficha/index.html?partida=${encodeURIComponent(partidaActual)}`;
  const ep = $('enlace-panel');
  if (ep) ep.href = `../panel/index.html?partida=${encodeURIComponent(partidaActual)}`;
}

async function cargarPartidas() {
  const caja = $('caja-partida');
  const sel = $('sel-partida');
  if (!caja || !sel) return;
  try {
    const res = await pedir('datos/?accion=partidas');
    const lista = (res && res.partidas) || [];
    if (lista.length > 1 || (datos && datos.rol === 'dj')) {
      sel.innerHTML = lista.map((p) => `<option value="${esc(p.id)}" ${p.id === partidaActual ? 'selected' : ''}>${esc(p.nombre || p.id)}</option>`).join('');
      caja.classList.remove('oculto');
      sel.onchange = () => {
        partidaActual = sel.value;
        localStorage.setItem('fu-partida', partidaActual);
        const u = new URL(location);
        u.searchParams.set('partida', partidaActual);
        history.replaceState(null, '', u);
        actualizarEnlacesNav();
        version = 0;
        datos = null;
        actualizar(true);
      };
    } else {
      caja.classList.add('oculto');
    }
  } catch (e) {
    caja.classList.add('oculto');
  }
}

// ================================================================== red
async function pedir(ruta, opciones = {}) {
  let url = ruta;
  if (url.startsWith('datos/?') && !url.includes('partida=')) {
    url = conPartida(url);
  }
  const r = await fetch(A + url, { cache: 'no-store', ...opciones, headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) } });
  let j = null;
  try { j = await r.json(); } catch (e) { /* sin json */ }
  if (!r.ok) { const err = new Error((j && j.error) || `Error ${r.status}`); err.status = r.status; throw err; }
  return j;
}
const post = (ruta, cuerpo = {}) => {
  if (cuerpo && typeof cuerpo === 'object' && !cuerpo.partida) {
    cuerpo.partida = partidaActual;
  }
  return pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo) });
};

let otraVez = false;
async function actualizar(forzar = false) {
  if (pidiendo) { if (forzar) otraVez = true; return; }
  pidiendo = true;
  try {
    const j = await pedir(`datos/?accion=campo${!forzar && version ? `&v=${version}` : ''}`);
    if (j.sinCambios) return;
    version = j.version;
    datos = j;
    if (ve() && !db) db = construirDb(await cargarRaw('../data/'), null);
    pintar();
    cargarPartidas();
  } catch (e) {
    if (e.status === 403) {
      $('vista').innerHTML = `<div class="vacio"><p><strong>Acceso restringido</strong></p>
        <p class="small">${esc(e.message)}</p></div>`;
      cargarPartidas();
      return;
    }
    if (!datos) { sinApi = true; pintarSinApi(); }
  } finally {
    pidiendo = false;
    // Si se pidió refrescar durante una consulta en curso, vuelve a pedir: la respuesta anterior podía ser vieja.
    if (otraVez) { otraVez = false; actualizar(true); }
  }
}

setInterval(() => { if (document.visibilityState === 'visible' && !sinApi && !arrastre) actualizar(); }, INTERVALO);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !sinApi) actualizar(); });

// ================================================================== utilidades de datos
const pjDe = (e) => (e && e.datos ? R.normalizarPersonaje(e.datos) : null);
function calcPj(e) {
  const pj = pjDe(e);
  if (!pj || !db) return null;
  const c = R.calcular(pj, db);
  const s = pj.estado || {};
  const v = (x, max) => (x === null || x === undefined ? max : x);
  return { pj, c, pv: v(s.pv, c.pv_max), pm: v(s.pm, c.pm_max), pi: v(s.pi, c.pi_max), estados: s.estados || [], bufos: s.bufos || [] };
}
const entidad = (clave) => (datos ? [...datos.pjs, ...datos.pnj].find((x) => x.clave === clave) : null);
const ladoDe = (e) => (e.clave.startsWith('pj:') ? 'aliado' : e.lado);
const imagenDe = (e) => e.imagen || SPRITE;
const hayEnemigos = () => datos.pnj.some((p) => p.lado === 'enemigo') || !!datos.combate;
const puedeMover = (e) => esDj() || (e.clave.startsWith('pj:') && e.propio);
const puedeModificar = (e) => esDj() || (e.clave.startsWith('pj:') && e.propio);

/** Entidades de una columna, ordenadas. */
function columna(lado, fila) {
  const lista = lado === 'aliado'
    ? [...datos.pjs.filter((p) => p.fila === fila), ...datos.pnj.filter((p) => p.lado === 'aliado' && p.fila === fila)]
    : datos.pnj.filter((p) => p.lado === 'enemigo' && p.fila === fila);
  return lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

// ================================================================== pintar
function pintarSinApi() {
  $('vista').innerHTML = `<div class="vacio"><p><strong>La vista de combate necesita las funciones de Vercel.</strong></p>
    <p class="small">No responde <code>/api/</code>. En local puedes consultar las fichas de ejemplo en <a href="../ficha/index.html">Fichas</a>.</p></div>`;
}

function pintarUsuario() {
  const u = datos.usuario;
  const volver = encodeURIComponent(location.pathname);
  $('usuario').innerHTML = u
    ? `<span class="fila small muted">${u.avatar ? `<img src="${esc(u.avatar)}" alt="" width="22" height="22" style="border-radius:50%">` : ''}${esc(u.nombre)}${esDj() ? ' <span class="chip acento">DJ</span>' : ''}<button class="btn peq fantasma" data-act="salir">Salir</button></span>`
    : `<a class="btn primario" href="${A}auth/?accion=entrar&volver=${volver}">Entrar con Discord</a>`;
  $('enlace-panel').classList.toggle('oculto', !esDj());
}

function pintar() {
  pintarUsuario();
  const conEnemigos = hayEnemigos();
  const col = (lado, fila, titulo) => {
    const lista = columna(lado, fila);
    return `<section class="columna ${lado}" data-lado="${lado}" data-fila="${fila}" aria-label="${esc(titulo)}">
      <h3>${esc(titulo)}</h3>
      ${lista.map(token).join('') || '<div class="vacia">—</div>'}
    </section>`;
  };
  const enemigas = conEnemigos ? `${col('enemigo', 'retaguardia', 'Retaguardia enemiga')}${col('enemigo', 'vanguardia', 'Vanguardia enemiga')}<div class="division" aria-hidden="true"></div>` : '';
  const fuera = datos.pjs.filter((p) => p.fila === 'fuera');
  const avisoEsp = !datos.usuario
    ? '<p class="small muted" style="margin:-6px 0 14px">Estás viendo como espectador. Entra con Discord para ver las fichas.</p>'
    : datos.rol === 'espectador' ? '<p class="small" style="margin:-6px 0 14px;color:var(--warn)">Tu cuenta de Discord no está en el servidor de la partida: solo ves la formación.</p>' : '';
  $('vista').innerHTML = `
    <div class="cabeza-campo">
      <h2>${datos.combate ? `Conflicto · <span class="ronda">ronda ${datos.combate.ronda}</span>` : conEnemigos ? 'Enemigos a la vista' : 'Grupo en formación'}</h2>
      ${puedeArrastrar() ? '<span class="small faint">Arrastra las fichas para cambiarlas de fila.</span>' : ''}
    </div>
    ${avisoEsp}
    ${esDj() ? barraDj() : ''}
    <div class="campo ${conEnemigos ? '' : 'sin-enemigos'}">
      ${enemigas}${col('aliado', 'vanguardia', 'Vanguardia')}${col('aliado', 'retaguardia', 'Retaguardia')}
    </div>
    ${esDj() && fuera.length ? `<div class="fuera-campo"><h3 class="small muted" style="margin-bottom:6px">Fuera del campo (solo lo ves tú)</h3><div class="fila">${fuera.map((p) => `<button class="chip" data-act="ver" data-clave="${esc(p.clave)}">${esc(p.nombre)}</button>`).join('')}</div></div>` : ''}
    ${!datos.pjs.length && !datos.pnj.length ? '<div class="vacio" style="margin-top:16px">Todavía no hay personajes en la partida. El DJ los importa desde el panel.</div>' : ''}`;
  pintarDetalle();
}

const puedeArrastrar = () => matchMedia('(pointer: fine)').matches && (esDj() || datos.pjs.some((p) => p.propio));

function barraDj() {
  const pl = datos.plantillas || [];
  if (!pl.length) return `<div class="barra-dj small"><span class="muted">No hay fichas de enemigo.</span><a class="btn peq" href="../panel/index.html#enemigos">Crear o importar en el panel</a></div>`;
  return `<div class="barra-dj">
    <strong class="small">Sacar PNJ</strong>
    <select id="dj-plantilla" aria-label="Ficha de PNJ">${pl.map((t) => `<option value="${esc(t.id)}">${esc(t.nombre)} · Nv ${t.nivel}</option>`).join('')}</select>
    <input type="number" id="dj-cantidad" min="1" max="12" value="1" aria-label="Cantidad">
    <select id="dj-lado" aria-label="Bando"><option value="enemigo">Enemigo</option><option value="aliado">Aliado</option></select>
    <select id="dj-fila" aria-label="Fila"><option value="vanguardia">Vanguardia</option><option value="retaguardia">Retaguardia</option></select>
    <button class="btn primario peq" data-act="sacar">Sacar</button>
    <span class="sep"></span>
    <button class="btn peq fantasma" data-act="vaciar" ${datos.pnj.some((p) => p.lado === 'enemigo') ? '' : 'disabled'}>Retirar enemigos</button>
    <a class="btn peq fantasma" href="../panel/index.html#enemigos">Fichas de PNJ</a>
  </div>`;
}

function token(e) {
  const pj = e.clave.startsWith('pj:');
  let mini = '', marcas = '', dano = '', clase = '', tag = '';
  if (pj && ve()) {
    const x = calcPj(e);
    if (x) {
      const pct = (a, m) => Math.max(0, Math.min(100, (a / (m || 1)) * 100));
      mini = `<div class="mini"><div class="barra pv" title="PV ${x.pv}/${x.c.pv_max}"><i style="width:${pct(x.pv, x.c.pv_max)}%"></i></div><div class="barra pm" title="PM ${x.pm}/${x.c.pm_max}"><i style="width:${pct(x.pm, x.c.pm_max)}%"></i></div></div>`;
      const bufoTag = (x.bufos && x.bufos.length) ? '<span class="marca-bufo" title="Con bufos activos">✨</span>' : '';
      marcas = x.estados.map((s) => `<span class="marca-est" title="${esc(N.nombreEstado(s))}">${ABREV[s] || esc(s)}</span>`).join('') + bufoTag;
      if (x.pv === 0) clase = 'ko'; else if (x.pv <= x.c.crisis) clase = 'crisis';
    }
  } else if (!pj && ve()) {
    if (e.dano) dano = `<span class="dano" title="Daño recibido">−${e.dano}</span>`;
    const bufoTag = (e.bufos && e.bufos.length) ? '<span class="marca-bufo" title="Con bufos activos">✨</span>' : '';
    marcas = (e.estados || []).map((s) => `<span class="marca-est" title="${esc(N.nombreEstado(s))}">${ABREV[s] || esc(s)}</span>`).join('') + bufoTag;
    const max = e.ficha ? e.ficha.pv : e.info && e.info.pv;
    if (e.pv !== undefined && max) {
      if (e.pv === 0) clase = 'ko'; else if (esDj() && e.pv <= Math.floor(max / 2)) clase = 'crisis';
      if (esDj() || e.lado === 'aliado') mini = `<div class="mini"><div class="barra pv"><i style="width:${Math.max(0, Math.min(100, (e.pv / max) * 100))}%"></i></div></div>`;
    }
    if (e.lado === 'aliado') tag = '<span class="tag">PNJ</span>';
  }
  const arr = puedeMover(e) && puedeArrastrar() ? 'arrastrable' : '';
  return `<button class="token ${clase} ${arr}" data-act="ver" data-clave="${esc(e.clave)}" aria-pressed="${seleccion === e.clave}" title="${esc(e.nombre)}">
    ${tag}${dano}<img src="${esc(imagenDe(e))}" alt="" width="124" height="124" draggable="false" loading="lazy">
    <span class="nombre">${esc(e.nombre)}</span>${mini}${marcas ? `<span class="marcas">${marcas}</span>` : ''}
  </button>`;
}

// ================================================================== panel de detalle
function pintarDetalle() {
  const panel = $('detalle');
  const e = seleccion && entidad(seleccion);
  document.body.classList.toggle('con-detalle', !!e);
  if (!e) { panel.hidden = true; panel.innerHTML = ''; seleccion = null; return; }
  // No repintar mientras se escribe en el panel.
  if (panel.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && !panel.hidden && panel.dataset.clave === e.clave) return;
  const abiertos = new Set([...panel.querySelectorAll('details[open]')].map((d) => d.dataset.det || d.dataset.bloque).filter(Boolean));
  const scroll = panel.scrollTop;
  panel.dataset.clave = e.clave;
  panel.innerHTML = e.clave.startsWith('pj:') ? detallePj(e) : detallePnj(e);
  panel.querySelectorAll('details').forEach((d) => { if (abiertos.has(d.dataset.det || d.dataset.bloque)) d.open = true; });
  panel.hidden = false;
  panel.scrollTop = scroll;
}

function cabecera(e, sub) {
  return `<div class="cab"><img src="${esc(imagenDe(e))}" alt="">
    <div><div class="display nombre">${esc(e.nombre)}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    <button class="btn icono fantasma" data-act="cerrar" aria-label="Cerrar">${ICON.x}</button></div>`;
}

const barraRec = VP.barraRec;
const seg = (n) => `${n >= 0 ? '+' : ''}${n}`;

function controlesMover(e) {
  if (!puedeMover(e)) return '';
  const filas = [['vanguardia', 'Vanguardia'], ['retaguardia', 'Retaguardia'], ...(esDj() && e.clave.startsWith('pj:') ? [['fuera', 'Fuera']] : [])];
  return `<div class="bloque"><h4>Posición</h4><div class="fila">
    <div class="segmento">${filas.map(([f, n]) => `<button data-act="fila" data-fila="${f}" aria-pressed="${e.fila === f}">${n}</button>`).join('')}</div>
    ${e.fila !== 'fuera' ? `<button class="btn peq" data-act="orden" data-dir="-1" title="Subir en la columna">↑</button><button class="btn peq" data-act="orden" data-dir="1" title="Bajar en la columna">↓</button>` : ''}
    ${esDj() && e.clave.startsWith('pnj:') ? `<div class="segmento">${[['enemigo', 'Enemigo'], ['aliado', 'Aliado']].map(([l, n]) => `<button data-act="lado" data-lado="${l}" aria-pressed="${e.lado === l}">${n}</button>`).join('')}</div>` : ''}
  </div></div>`;
}

function selectorEstados(actuales, inmunes = []) {
  return `<div class="estados-sel">${N.ESTADOS.map(([id, n]) => inmunes.includes(id) && !actuales.includes(id)
    ? `<button class="chip inmune" disabled title="Inmune">${n} · inmune</button>`
    : `<button class="chip" data-act="estado" data-estado="${id}" aria-pressed="${actuales.includes(id)}">${n}</button>`).join('')}</div>`;
}
/** Bloque visible (solo DJ) para marcar y desmarcar estados alterados con un clic. */
const bloqueEstados = (actuales, inmunes = []) => `<div class="bloque"><h4>Estados alterados</h4>${selectorEstados(actuales, inmunes)}
  <p class="nota" style="margin:6px 0 0">Pulsa para marcar o quitar. Reducen sus dados en las tiradas del bot.</p></div>`;

function htmlSeccionBufos(e, bufos = [], editable = false) {
  let lista = '';
  if (bufos.length) {
    lista = `<div class="lista-bufos">${bufos.map((b, idx) => {
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
      const btnQuitar = editable
        ? `<button class="btn icono fantasma peq" data-act="quitar-bufo" data-clave="${esc(e.clave)}" data-bufo-id="${esc(b.id || String(idx))}" title="Quitar bufo">✕</button>`
        : '';
      return `<div class="item bufo-item"><div class="fila entre"><span class="titulo">✨ ${esc(b.nombre || 'Efecto')}</span>${btnQuitar}</div><div class="sub small">${esc(sub)}</div></div>`;
    }).join('')}</div>`;
  }

  if (!editable) {
    return bufos.length ? `<div class="bloque"><h4>Bufos y efectos activos</h4>${lista}</div>` : '';
  }

  return `<div class="bloque">
    <div class="fila entre" style="margin-bottom:6px">
      <h4 style="margin:0">Bufos y modificaciones</h4>
      ${bufos.length ? `<button class="btn fantasma peq peligro" data-act="limpiar-bufos" data-clave="${esc(e.clave)}">Limpiar todos</button>` : ''}
    </div>
    ${lista || '<p class="small muted" style="margin:0 0 8px">Sin bufos activos en este momento.</p>'}
    <details class="dj bufo-editor" data-bloque="editor-bufo">
      <summary>+ Añadir bufo / modificar atributos</summary>
      <div class="controles form-bufo" style="margin-top:8px">
        <div class="fila">
          <label class="small muted">Preajuste</label>
          <select id="bf-preset" aria-label="Preajuste rápido">
            <option value="">Personalizado…</option>
            <option value="barrera">Barrera (+2 D.Mág)</option>
            <option value="espectral">Armadura espectral (+2 DEF)</option>
            <option value="furia">Furia (+5 daño)</option>
            <option value="arma_fuego">Arma Ígnea (+5 daño Fuego)</option>
            <option value="arma_hielo">Arma Helada (+5 daño Hielo)</option>
            <option value="res_fuego">Protección Ígnea (RS Fuego)</option>
            <option value="res_hielo">Protección Helada (RS Hielo)</option>
            <option value="res_rayo">Protección Eléctrica (RS Rayo)</option>
            <option value="vigor">Vigor (+1 paso VIG)</option>
            <option value="agilidad">Agilidad (+1 paso DES)</option>
            <option value="fortaleza">Fortaleza (+10 PV máx)</option>
          </select>
        </div>
        <div class="fila">
          <label class="small muted">Nombre</label>
          <input type="text" id="bf-nombre" placeholder="Barrera, Furia, etc." aria-label="Nombre del bufo" style="flex:1">
        </div>
        <div class="fila">
          <label class="small muted">DEF</label>
          <input type="number" id="bf-def" placeholder="+2" aria-label="Bono a DEF" style="width:60px">
          <label class="small muted">D.Mág</label>
          <input type="number" id="bf-mdef" placeholder="+2" aria-label="Bono a D.Mág" style="width:60px">
          <label class="small muted">Inic</label>
          <input type="number" id="bf-init" placeholder="+2" aria-label="Bono a Iniciativa" style="width:60px">
        </div>
        <div class="fila">
          <label class="small muted">Daño</label>
          <input type="number" id="bf-dano" placeholder="+5" aria-label="Bono a daño" style="width:60px">
          <label class="small muted">Prec</label>
          <input type="number" id="bf-prec" placeholder="+1" aria-label="Bono a precisión" style="width:60px">
          <select id="bf-tipo-dano" aria-label="Tipo de daño de ataque" style="flex:1">
            <option value="">(tipo original)</option>
            ${N.TIPOS_DANO.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}
          </select>
        </div>
        <div class="fila">
          <label class="small muted">PV máx</label>
          <input type="number" id="bf-pv" placeholder="+10" aria-label="PV máx adicional" style="width:70px">
          <label class="small muted">PM máx</label>
          <input type="number" id="bf-pm" placeholder="+10" aria-label="PM máx adicional" style="width:70px">
        </div>
        <div class="fila">
          <label class="small muted">Afinidad</label>
          <select id="bf-af-tipo" aria-label="Elemento">
            <option value="">(ninguno)</option>
            ${N.TIPOS_DANO.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}
          </select>
          <select id="bf-af-grado" aria-label="Grado">
            <option value="RS">RS (Resistente)</option>
            <option value="IM">IM (Inmune)</option>
            <option value="AS">AS (Absorbe)</option>
            <option value="VU">VU (Vulnerable)</option>
          </select>
        </div>
        <div class="fila">
          <label class="small muted">Dado atributo</label>
          <select id="bf-atr" aria-label="Atributo">
            <option value="">(ninguno)</option>
            <option value="DES">DES</option>
            <option value="PER">PER</option>
            <option value="VIG">VIG</option>
            <option value="VOL">VOL</option>
          </select>
          <select id="bf-atr-pasos" aria-label="Pasos de dado">
            <option value="1">+1 paso (ej. d8→d10)</option>
            <option value="2">+2 pasos</option>
            <option value="-1">−1 paso</option>
          </select>
        </div>
        <div class="fila" style="margin-top:6px">
          <button class="btn primario peq" data-act="guardar-bufo" data-clave="${esc(e.clave)}">Aplicar bufo</button>
        </div>
      </div>
    </details>
  </div>`;
}

// ------------------------------------------------------------------ PJ
function detallePj(e) {
  if (!ve()) return `${cabecera(e, '')}<div class="bloque"><p class="muted">Entra con tu cuenta de Discord del servidor para ver su ficha.</p></div>`;
  const x = calcPj(e);
  if (!x) return `${cabecera(e, '')}<div class="bloque"><p class="muted">Cargando reglas…</p></div>`;
  const { pj, c } = x;
  const dados = N.dadosPnj({ atributos: c.actual }, x.estados);
  const habs = R.habilidadesPJ(pj, db).filter((h) => h.def);
  const conj = [];
  const vistos = new Set();
  for (const g of R.conjurosConocidos(pj, db)) for (const cj of g.conjuros) if (!cj._faltante && !vistos.has(cj.id)) { vistos.add(cj.id); conj.push(cj); }
  const opciones = R.opcionesElegidas(pj, db);
  const heroicas = pj.heroicas.map((h) => get(db, 'habilidades_heroicas', h.id)).filter(Boolean);
  const crisis = x.pv <= c.crisis;
  const sub = esc([`Nivel ${pj.nivel}`, F.resumenClases(pj, db)].filter(Boolean).join(' · '));
  const tieneModDef = c.mods.some((m) => m.stat === 'def' && m.origen.startsWith('Bufo'));
  const tieneModMdef = c.mods.some((m) => m.stat === 'mdef' && m.origen.startsWith('Bufo'));
  return `${cabecera(e, sub)}
    <div class="bloque">
      ${barraRec('PV', 'pv', x.pv, c.pv_max)}${barraRec('PM', 'pm', x.pm, c.pm_max)}${barraRec('PI', 'pi', x.pi, c.pi_max)}
      <div class="fila small" style="margin-top:4px"><span class="chip acento">PF ${pj.pf || 0}</span>${crisis && x.pv > 0 ? '<span class="chip err">En Crisis</span>' : `<span class="faint">Crisis ≤ ${c.crisis}</span>`}${x.pv === 0 ? '<span class="chip err">A 0 PV</span>' : ''}${esDj() ? '' : x.estados.map((s) => `<span class="chip err">${esc(N.nombreEstado(s))}</span>`).join('')}</div>
    </div>
    ${esDj() ? bloqueEstados(x.estados) : ''}
    ${htmlSeccionBufos(e, x.bufos, puedeModificar(e))}
    <div class="bloque"><div class="numeros">
      <div class="stat"><div class="k">DEF</div><div class="v ${tieneModDef ? 'acento' : ''}">${c.def}</div></div>
      <div class="stat"><div class="k">D. Mág</div><div class="v ${tieneModMdef ? 'acento' : ''}">${c.mdef}</div></div>
      <div class="stat"><div class="k">Inic.</div><div class="v">${seg(c.init)}</div></div>
      <div class="stat"><div class="k">Magia</div><div class="v">${seg(c.magia || 0)}</div></div>
    </div></div>
    <div class="bloque"><h4>Atributos</h4><div class="atributos">${R.ATR.map((a) => `<div class="atributo"><div class="k">${a}</div><div class="v ${dados[a] < c.actual[a] ? 'baja' : ''}">d${dados[a] || '—'}</div><div class="b">${dados[a] < c.actual[a] ? `de d${c.actual[a]}` : '&nbsp;'}</div></div>`).join('')}</div></div>
    ${c.afinidades && Object.keys(c.afinidades).length ? `<div class="bloque"><h4>Resistencias y afinidades temporales</h4>${VP.htmlAfinidades(c.afinidades)}</div>` : ''}
    <div class="bloque"><h4>Ataque básico</h4><div class="lista">${c.ataques.map((a) => `<div class="item"><div class="fila entre"><span class="titulo">${esc(a.nombre)}</span><span class="muted small">${a.alcance === 'cuerpo' ? 'Cuerpo a cuerpo' : 'A distancia'}</span></div>
      <div class="mono small">${esc(R.fmtPrecision(a.precision))} → ${esc(R.fmtDano(a.dano, db))}</div>${a.cualidad ? `<div class="sub">${esc(a.cualidad)}</div>` : ''}</div>`).join('')}</div></div>
    ${habs.length || heroicas.length ? `<div class="bloque"><h4>Habilidades</h4><div class="lista">${habs.map((h) => F.htmlHabilidad(db, h.def, h.sl)).join('')}${heroicas.map((d) => `<details class="item" data-det="hh:${esc(d.id)}"><summary><span class="titulo">${esc(d.nombre)}</span><span class="der"><span class="chip acento">Heroica</span></span></summary><div class="cuerpo texto">${md(d.efecto)}</div></details>`).join('')}</div></div>` : ''}
    ${conj.length ? `<div class="bloque"><h4>Conjuros</h4><div class="lista">${conj.map((cj) => F.htmlConjuro(db, cj)).join('')}</div></div>` : ''}
    ${opciones.map((g) => `<div class="bloque"><h4>${esc(g.etiqueta)}</h4><div class="lista">${g.opciones.map((o) => F.htmlOpcion(db, o)).join('')}</div></div>`).join('')}
    <div class="acciones-pj">
      <a class="btn primario" href="../ficha/index.html#${encodeURIComponent(e.id)}" target="_blank" rel="noopener">Detalles</a>
      ${esDj() ? `<button class="btn" data-act="imagen">Imagen</button>${e.imagen ? '<button class="btn fantasma" data-act="quitar-imagen">Quitar imagen</button>' : ''}` : ''}
    </div>
    ${controlesMover(e)}
    ${esDj() ? `<div class="bloque"><details class="dj" data-bloque="ajustes-pj"><summary>Ajustes del DJ</summary><div class="controles">
      <div class="fila"><label class="small muted" style="width:28px">PV</label><input type="text" id="aj-pv" placeholder="-10, +5, max" aria-label="PV"><label class="small muted" style="width:28px">PM</label><input type="text" id="aj-pm" placeholder="-10" aria-label="PM"><label class="small muted" style="width:28px">PF</label><input type="text" id="aj-pf" placeholder="+1" aria-label="PF"><button class="btn peq" data-act="ajustar">Aplicar</button></div>
    </div></details></div>` : ''}`;
}

// ------------------------------------------------------------------ PNJ
function detallePnj(e) {
  if (!ve()) return `${cabecera(e, '')}<div class="bloque"><p class="muted">Entra con tu cuenta de Discord del servidor para ver lo que el grupo sabe de él.</p></div>`;
  const estados = e.estados || [];
  if (!esDj()) return `${cabecera(e, esc(VP.subtituloPnj(e, false)))}${VP.htmlPnjJugador(e)}`;
  const t = e.ficha;
  const st = N.statsEfectivasPnj(t, e);
  const cr = st.crisis;
  return `${cabecera(e, esc(VP.subtituloPnj(e, true, t)))}
    <div class="bloque">${barraRec('PV', 'pv', e.pv, st.pv_max)}${barraRec('PM', 'pm', e.pm, st.pm_max)}
      <div class="fila small">${e.pv === 0 ? '<span class="chip err">Caído</span>' : e.pv <= cr ? '<span class="chip err">En Crisis</span>' : `<span class="faint">Crisis ≤ ${cr}</span>`}<span class="faint">· Los jugadores ven ${e.dano ? `−${e.dano} de daño` : 'que está intacto'}</span></div>
      ${t.villano ? `<div class="fila small" style="margin-top:8px"><span class="chip acento">PU ${e.pu || 0}</span><button class="btn peq" data-act="pu" data-valor="-1" ${e.pu ? '' : 'disabled'}>Gastar 1 PU</button><button class="btn peq fantasma" data-act="pu" data-valor="+1">+1</button></div>` : ''}
      ${e.siguiente ? `<div class="fila small" style="margin-top:8px"><button class="btn peq ${e.pv === 0 ? 'primario' : ''}" data-act="fase">Pasar a la fase siguiente: ${esc(e.siguiente.nombre)}</button></div>` : ''}
      ${t.descripcion ? `<p class="small muted" style="margin-top:8px"><em>${esc(t.descripcion)}</em></p>` : ''}</div>
    ${bloqueEstados(estados, t.inmunidades_estados || [])}
    ${htmlSeccionBufos(e, e.bufos || [], true)}
    <div class="bloque"><details class="dj" open data-bloque="ajustes-pnj"><summary>Ajustes del DJ</summary><div class="controles">
      <div class="fila"><label class="small muted">Daño</label><input type="text" id="aj-dano" inputmode="numeric" placeholder="12" aria-label="Daño">
        <select id="aj-tipo" aria-label="Tipo de daño">${N.TIPOS_DANO.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
        <label class="small fila" style="gap:4px"><input type="checkbox" id="aj-ignora"> ignora RS</label>
        <button class="btn peq primario" data-act="danar">Aplicar</button></div>
      <div class="fila"><label class="small muted" style="width:28px">PV</label><input type="text" id="aj-pv" placeholder="+10, max" aria-label="PV"><label class="small muted" style="width:28px">PM</label><input type="text" id="aj-pm" placeholder="-10" aria-label="PM"><button class="btn peq" data-act="ajustar">Fijar</button></div>
      <div><div class="small muted" style="margin-bottom:4px">Revelado a los jugadores</div>
        <select id="aj-revelado" data-act="revelar">${N.NIVELES_ESTUDIO.map(([n, txt]) => `<option value="${n}" ${(t.revelado || 0) === n ? 'selected' : ''}>${esc(txt)}</option>`).join('')}</select></div>
      <p class="nota" style="margin:0">El nivel revelado vale para todos los PNJ de la ficha «${esc(t.nombre)}».</p>
    </div></details></div>
    ${controlesMover(e)}
    ${VP.htmlPnjCompleto(t, estados, e)}
    <div class="acciones-pj">
      <button class="btn" data-act="imagen">Imagen</button>${e.imagen ? '<button class="btn fantasma" data-act="quitar-imagen">Quitar imagen</button>' : ''}
      <a class="btn fantasma" href="../pnj/index.html?id=${encodeURIComponent(t.id)}" target="_blank" rel="noopener">Editar ficha</a>
      <button class="btn fantasma peligro" data-act="retirar">Retirar del campo</button>
    </div>`;
}

// ================================================================== acciones
async function accion(fn, ok) {
  try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); } catch (err) { toast(err.message, 'err'); }
  await actualizar(true);
}

/** Mueve una entidad a una columna y posición (o al final si indice es null). */
async function moverA(e, lado, fila, indice = null) {
  const destino = fila === 'fuera' ? [] : columna(lado, fila).filter((x) => x.clave !== e.clave);
  const i = indice === null ? destino.length : Math.max(0, Math.min(destino.length, indice));
  destino.splice(i, 0, e);
  // Cambio local inmediato
  e.fila = fila; if (e.clave.startsWith('pnj:')) e.lado = lado;
  destino.forEach((x, k) => { x.orden = k; });
  pintar();
  await accion(() => post('datos/?accion=mover', { movida: e.clave, lado, fila, claves: destino.map((x) => x.clave) }));
}

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-act]');
  if (!t) return;
  if (t.classList.contains('token') && arrastreReciente) return;
  const ds = t.dataset;
  const e = seleccion && entidad(seleccion);
  switch (ds.act) {
    case 'ver': seleccion = seleccion === ds.clave && t.classList.contains('token') ? null : ds.clave; pintar(); return;
    case 'cerrar': seleccion = null; pintar(); return;
    case 'salir': await post('auth/?accion=salir', {}).catch(() => {}); location.reload(); return;
    case 'sacar': {
      const cuerpo = { plantilla: $('dj-plantilla').value, cantidad: Number($('dj-cantidad').value) || 1, lado: $('dj-lado').value, fila: $('dj-fila').value };
      await accion(() => post('datos/?accion=sacar', cuerpo), (r) => `${r.nuevos.map((x) => x.nombre).join(', ')} en el campo.`);
      return;
    }
    case 'vaciar':
      if (!confirm('¿Retirar a todos los enemigos del campo?')) return;
      await accion(() => post('datos/?accion=retirar', { lado: 'enemigo' }), 'Enemigos retirados.');
      return;
    case 'retirar':
      if (!e) return;
      seleccion = null;
      await accion(() => post('datos/?accion=retirar', { id: e.id }), `${e.nombre} sale del campo.`);
      return;
    case 'fila': if (e) await moverA(e, ladoDe(e), ds.fila); return;
    case 'lado': if (e) await moverA(e, ds.lado, e.fila); return;
    case 'orden': {
      if (!e) return;
      const lista = columna(ladoDe(e), e.fila);
      const i = lista.findIndex((x) => x.clave === e.clave);
      await moverA(e, ladoDe(e), e.fila, i + Number(ds.dir));
      return;
    }
    case 'estado': {
      if (!e) return;
      const actuales = new Set(e.clave.startsWith('pj:') ? (calcPj(e) || { estados: [] }).estados : e.estados || []);
      if (actuales.has(ds.estado)) actuales.delete(ds.estado); else actuales.add(ds.estado);
      await accion(() => post('datos/?accion=ajustar', { clave: e.clave, estados: [...actuales] }));
      return;
    }
    case 'ajustar': {
      if (!e) return;
      const val = (id) => ($(id) ? $(id).value.trim() : '');
      const cuerpo = { clave: e.clave, pv: val('aj-pv'), pm: val('aj-pm'), pf: val('aj-pf') };
      if (!cuerpo.pv && !cuerpo.pm && !cuerpo.pf) return;
      document.activeElement.blur();
      await accion(() => post('datos/?accion=ajustar', cuerpo), 'Hecho.');
      return;
    }
    case 'danar': {
      if (!e) return;
      const cantidad = Number($('aj-dano').value);
      if (!Number.isFinite(cantidad) || cantidad < 0) { toast('Indica el daño.', 'err'); return; }
      document.activeElement.blur();
      await accion(() => post('datos/?accion=ajustar', { clave: e.clave, dano: { cantidad, tipo: $('aj-tipo').value, ignora: $('aj-ignora').checked } }), (r) => r.texto || 'Hecho.');
      return;
    }
    case 'pu': if (e) await accion(() => post('datos/?accion=ajustar', { clave: e.clave, pu: ds.valor })); return;
    case 'fase':
      if (!e || !confirm(`¿Pasar a ${e.nombre} a su siguiente fase (${e.siguiente.nombre})? Recupera todos sus PV y PM.`)) return;
      await accion(() => post('datos/?accion=ajustar', { clave: e.clave, fase: true }), (r) => r.texto || 'Siguiente fase.');
      return;
    case 'imagen': if (e) { imagenPara = e.clave.startsWith('pj:') ? `pj:${e.id}` : `pnj:${e.plantilla}`; $('subir-imagen').click(); } return;
    case 'quitar-imagen':
      if (!e) return;
      await accion(() => post('datos/?accion=quitar-imagen', { clave: e.clave.startsWith('pj:') ? `pj:${e.id}` : `pnj:${e.plantilla}` }), 'Imagen quitada.');
      return;
    case 'guardar-bufo': {
      if (!e) return;
      const nom = $('bf-nombre') ? $('bf-nombre').value.trim() : '';
      const def = $('bf-def') ? $('bf-def').value.trim() : '';
      const mdef = $('bf-mdef') ? $('bf-mdef').value.trim() : '';
      const init = $('bf-init') ? $('bf-init').value.trim() : '';
      const dano = $('bf-dano') ? $('bf-dano').value.trim() : '';
      const prec = $('bf-prec') ? $('bf-prec').value.trim() : '';
      const tipoDano = $('bf-tipo-dano') ? $('bf-tipo-dano').value : '';
      const pvMax = $('bf-pv') ? $('bf-pv').value.trim() : '';
      const pmMax = $('bf-pm') ? $('bf-pm').value.trim() : '';
      const afTipo = $('bf-af-tipo') ? $('bf-af-tipo').value : '';
      const afGrado = $('bf-af-grado') ? $('bf-af-grado').value : 'RS';
      const atr = $('bf-atr') ? $('bf-atr').value : '';
      const atrPasos = $('bf-atr-pasos') ? $('bf-atr-pasos').value : '1';

      const bufo = { nombre: nom || 'Efecto' };
      if (def) bufo.def = Number(def);
      if (mdef) bufo.mdef = Number(mdef);
      if (init) bufo.init = Number(init);
      if (dano) bufo.dano = Number(dano);
      if (prec) bufo.precision = Number(prec);
      if (tipoDano) bufo.tipo_dano = tipoDano;
      if (pvMax) bufo.pv_max = Number(pvMax);
      if (pmMax) bufo.pm_max = Number(pmMax);
      if (afTipo) bufo.afinidades = { [afTipo]: afGrado };
      if (atr) bufo.atributos = { [atr]: Number(atrPasos) || 1 };

      await accion(() => post('datos/?accion=ajustar', { clave: ds.clave, anadirBufo: bufo }), (r) => r.texto || 'Bufo aplicado.');
      return;
    }
    case 'quitar-bufo': {
      if (!e) return;
      await accion(() => post('datos/?accion=ajustar', { clave: ds.clave, quitarBufo: ds.bufoId }), (r) => r.texto || 'Bufo retirado.');
      return;
    }
    case 'limpiar-bufos': {
      if (!e || !confirm('¿Eliminar todos los bufos de combate de esta ficha?')) return;
      await accion(() => post('datos/?accion=ajustar', { clave: ds.clave, limpiarBufos: true }), 'Bufos eliminados.');
      return;
    }
    default:
  }
});

document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t && t.id === 'bf-preset') {
    const val = t.value;
    const setVal = (id, v) => { if ($(id)) $(id).value = v; };
    if (val === 'barrera') {
      setVal('bf-nombre', 'Barrera'); setVal('bf-mdef', '2'); setVal('bf-def', ''); setVal('bf-dano', ''); setVal('bf-tipo-dano', ''); setVal('bf-af-tipo', ''); setVal('bf-atr', ''); setVal('bf-pv', ''); setVal('bf-pm', ''); setVal('bf-init', '');
    } else if (val === 'espectral') {
      setVal('bf-nombre', 'Armadura espectral'); setVal('bf-def', '2'); setVal('bf-mdef', ''); setVal('bf-dano', ''); setVal('bf-tipo-dano', ''); setVal('bf-af-tipo', ''); setVal('bf-atr', ''); setVal('bf-pv', ''); setVal('bf-pm', ''); setVal('bf-init', '');
    } else if (val === 'furia') {
      setVal('bf-nombre', 'Furia'); setVal('bf-dano', '5'); setVal('bf-def', ''); setVal('bf-mdef', ''); setVal('bf-tipo-dano', ''); setVal('bf-af-tipo', ''); setVal('bf-atr', ''); setVal('bf-pv', ''); setVal('bf-pm', ''); setVal('bf-init', '');
    } else if (val === 'arma_fuego') {
      setVal('bf-nombre', 'Arma Ígnea'); setVal('bf-dano', '5'); setVal('bf-tipo-dano', 'fuego'); setVal('bf-def', ''); setVal('bf-mdef', ''); setVal('bf-af-tipo', ''); setVal('bf-atr', ''); setVal('bf-pv', ''); setVal('bf-pm', ''); setVal('bf-init', '');
    } else if (val === 'arma_hielo') {
      setVal('bf-nombre', 'Arma Helada'); setVal('bf-dano', '5'); setVal('bf-tipo-dano', 'hielo'); setVal('bf-def', ''); setVal('bf-mdef', ''); setVal('bf-af-tipo', ''); setVal('bf-atr', ''); setVal('bf-pv', ''); setVal('bf-pm', ''); setVal('bf-init', '');
    } else if (val === 'res_fuego') {
      setVal('bf-nombre', 'Protección Ígnea'); setVal('bf-af-tipo', 'fuego'); setVal('bf-af-grado', 'RS'); setVal('bf-def', ''); setVal('bf-mdef', ''); setVal('bf-dano', ''); setVal('bf-atr', ''); setVal('bf-pv', ''); setVal('bf-pm', ''); setVal('bf-init', '');
    } else if (val === 'res_hielo') {
      setVal('bf-nombre', 'Protección Helada'); setVal('bf-af-tipo', 'hielo'); setVal('bf-af-grado', 'RS'); setVal('bf-def', ''); setVal('bf-mdef', ''); setVal('bf-dano', ''); setVal('bf-atr', ''); setVal('bf-pv', ''); setVal('bf-pm', ''); setVal('bf-init', '');
    } else if (val === 'res_rayo') {
      setVal('bf-nombre', 'Protección Eléctrica'); setVal('bf-af-tipo', 'rayo'); setVal('bf-af-grado', 'RS'); setVal('bf-def', ''); setVal('bf-mdef', ''); setVal('bf-dano', ''); setVal('bf-atr', ''); setVal('bf-pv', ''); setVal('bf-pm', ''); setVal('bf-init', '');
    } else if (val === 'vigor') {
      setVal('bf-nombre', 'Vigor'); setVal('bf-atr', 'VIG'); setVal('bf-atr-pasos', '1'); setVal('bf-def', ''); setVal('bf-mdef', ''); setVal('bf-dano', ''); setVal('bf-af-tipo', ''); setVal('bf-pv', ''); setVal('bf-pm', ''); setVal('bf-init', '');
    } else if (val === 'agilidad') {
      setVal('bf-nombre', 'Agilidad'); setVal('bf-atr', 'DES'); setVal('bf-atr-pasos', '1'); setVal('bf-def', ''); setVal('bf-mdef', ''); setVal('bf-dano', ''); setVal('bf-af-tipo', ''); setVal('bf-pv', ''); setVal('bf-pm', ''); setVal('bf-init', '');
    } else if (val === 'fortaleza') {
      setVal('bf-nombre', 'Fortaleza'); setVal('bf-pv', '10'); setVal('bf-def', ''); setVal('bf-mdef', ''); setVal('bf-dano', ''); setVal('bf-af-tipo', ''); setVal('bf-atr', ''); setVal('bf-pm', ''); setVal('bf-init', '');
    }
  }
  if (t.id === 'aj-revelado') {
    const e = seleccion && entidad(seleccion);
    if (!e) return;
    t.blur();
    await accion(() => post('datos/?accion=revelar', { plantilla: e.plantilla, nivel: Number(t.value) }), 'Información revelada actualizada.');
  }
  if (t.id === 'subir-imagen' && t.files[0] && imagenPara) {
    const f = t.files[0];
    t.value = '';
    try {
      const datosUrl = await reducirImagen(f);
      await accion(() => post('datos/?accion=subir-imagen', { clave: imagenPara, imagen: datosUrl }), imagenPara.startsWith('pnj:') ? 'Imagen guardada para todos los PNJ de esa ficha.' : 'Imagen guardada.');
    } catch (err) { toast(err.message, 'err'); }
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && seleccion) { seleccion = null; pintar(); }
  if (ev.key === 'Enter' && ev.target.closest && ev.target.closest('#detalle input[type=text]')) {
    ev.preventDefault();
    const b = ev.target.id === 'aj-dano' ? '[data-act=danar]' : '[data-act=ajustar]';
    const btn = $('detalle').querySelector(b);
    if (btn) btn.click();
  }
});

// ================================================================== arrastrar (ratón)
let arrastre = null;
let arrastreReciente = false;

document.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'touch' || ev.button !== 0) return;
  const tk = ev.target.closest('.token.arrastrable');
  if (!tk) return;
  const e = entidad(tk.dataset.clave);
  if (!e || !puedeMover(e)) return;
  arrastre = { e, tk, x: ev.clientX, y: ev.clientY, activo: false, fantasma: null };
});

document.addEventListener('pointermove', (ev) => {
  if (!arrastre) return;
  if (!arrastre.activo) {
    if (Math.hypot(ev.clientX - arrastre.x, ev.clientY - arrastre.y) < 6) return;
    arrastre.activo = true;
    arrastre.tk.classList.add('arrastrando');
    const f = document.createElement('img');
    f.src = imagenDe(arrastre.e); f.className = 'fantasma-arrastre'; f.alt = '';
    document.body.appendChild(f);
    arrastre.fantasma = f;
    document.querySelectorAll('.columna').forEach((c) => c.classList.toggle('no-destino', !destinoValido(c, arrastre.e)));
  }
  arrastre.fantasma.style.left = ev.clientX + 'px';
  arrastre.fantasma.style.top = ev.clientY + 'px';
  const col = columnaBajo(ev, arrastre.e);
  document.querySelectorAll('.columna').forEach((c) => c.classList.toggle('destino', c === col));
});

document.addEventListener('pointerup', async (ev) => {
  if (!arrastre) return;
  const a = arrastre;
  arrastre = null;
  if (!a.activo) return;
  a.fantasma.remove();
  document.querySelectorAll('.columna').forEach((c) => c.classList.remove('destino', 'no-destino'));
  a.tk.classList.remove('arrastrando');
  arrastreReciente = true;
  setTimeout(() => { arrastreReciente = false; }, 50);
  const col = columnaBajo(ev, a.e);
  if (!col) return;
  const tokens = [...col.querySelectorAll('.token')].filter((t) => t.dataset.clave !== a.e.clave);
  let indice = tokens.length;
  for (let k = 0; k < tokens.length; k++) {
    const r = tokens[k].getBoundingClientRect();
    const fila = getComputedStyle(col).flexDirection === 'row';
    if (fila ? (ev.clientY < r.bottom && ev.clientX < r.left + r.width / 2) || ev.clientY < r.top : ev.clientY < r.top + r.height / 2) { indice = k; break; }
  }
  await moverA(a.e, col.dataset.lado, col.dataset.fila, indice);
});

function destinoValido(col, e) {
  if (!e) return false;
  if (e.clave.startsWith('pj:')) return col.dataset.lado === 'aliado';
  return esDj();
}
function columnaBajo(ev, e) {
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  const col = el && el.closest('.columna');
  return col && destinoValido(col, e) ? col : null;
}

// ================================================================== inicio
const medirBarra = () => {
  const b = document.querySelector('.topbar');
  const fija = b && getComputedStyle(b).position === 'sticky';
  document.documentElement.style.setProperty('--alto-barra', fija ? `${b.offsetHeight}px` : '0px');
};
addEventListener('resize', medirBarra);
medirBarra();
initTema();
actualizarEnlacesNav();
cargarPartidas();
actualizar(true);
