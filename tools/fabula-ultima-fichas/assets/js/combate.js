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

const $ = (id) => document.getElementById(id);
const esDj = () => datos && datos.rol === 'dj';
const ve = () => datos && datos.rol !== 'espectador';

// ================================================================== red
async function pedir(ruta, opciones = {}) {
  const r = await fetch(A + ruta, { cache: 'no-store', ...opciones, headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) } });
  let j = null;
  try { j = await r.json(); } catch (e) { /* sin json */ }
  if (!r.ok) { const err = new Error((j && j.error) || `Error ${r.status}`); err.status = r.status; throw err; }
  return j;
}
const post = (ruta, cuerpo) => pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo) });

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
  } catch (e) {
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
  return { pj, c, pv: v(s.pv, c.pv_max), pm: v(s.pm, c.pm_max), pi: v(s.pi, c.pi_max), estados: s.estados || [] };
}
const entidad = (clave) => (datos ? [...datos.pjs, ...datos.pnj].find((x) => x.clave === clave) : null);
const ladoDe = (e) => (e.clave.startsWith('pj:') ? 'aliado' : e.lado);
const imagenDe = (e) => e.imagen || SPRITE;
const hayEnemigos = () => datos.pnj.some((p) => p.lado === 'enemigo') || !!datos.combate;
const puedeMover = (e) => esDj() || (e.clave.startsWith('pj:') && e.propio);

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
      marcas = x.estados.map((s) => `<span class="marca-est" title="${esc(N.nombreEstado(s))}">${ABREV[s] || esc(s)}</span>`).join('');
      if (x.pv === 0) clase = 'ko'; else if (x.pv <= x.c.crisis) clase = 'crisis';
    }
  } else if (!pj && ve()) {
    if (e.dano) dano = `<span class="dano" title="Daño recibido">−${e.dano}</span>`;
    marcas = (e.estados || []).map((s) => `<span class="marca-est" title="${esc(N.nombreEstado(s))}">${ABREV[s] || esc(s)}</span>`).join('');
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

const barraRec = (k, cls, act, max) => `<div class="rec"><span class="k">${k}</span><div class="barra ${cls}"><i style="width:${Math.max(0, Math.min(100, (act / (max || 1)) * 100))}%"></i></div><span class="v">${act}<small> / ${max}</small></span></div>`;
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

function selectorEstados(actuales) {
  return `<div class="estados-sel">${N.ESTADOS.map(([id, n]) => `<button class="chip" data-act="estado" data-estado="${id}" aria-pressed="${actuales.includes(id)}">${n}</button>`).join('')}</div>`;
}
/** Bloque visible (solo DJ) para marcar y desmarcar estados alterados con un clic. */
const bloqueEstados = (actuales) => `<div class="bloque"><h4>Estados alterados</h4>${selectorEstados(actuales)}
  <p class="nota" style="margin:6px 0 0">Pulsa para marcar o quitar. Reducen sus dados en las tiradas del bot.</p></div>`;

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
  return `${cabecera(e, sub)}
    <div class="bloque">
      ${barraRec('PV', 'pv', x.pv, c.pv_max)}${barraRec('PM', 'pm', x.pm, c.pm_max)}${barraRec('PI', 'pi', x.pi, c.pi_max)}
      <div class="fila small" style="margin-top:4px"><span class="chip acento">PF ${pj.pf || 0}</span>${crisis && x.pv > 0 ? '<span class="chip err">En Crisis</span>' : `<span class="faint">Crisis ≤ ${c.crisis}</span>`}${x.pv === 0 ? '<span class="chip err">A 0 PV</span>' : ''}${esDj() ? '' : x.estados.map((s) => `<span class="chip err">${esc(N.nombreEstado(s))}</span>`).join('')}</div>
    </div>
    ${esDj() ? bloqueEstados(x.estados) : ''}
    <div class="bloque"><div class="numeros">
      <div class="stat"><div class="k">DEF</div><div class="v">${c.def}</div></div>
      <div class="stat"><div class="k">D. Mág</div><div class="v">${c.mdef}</div></div>
      <div class="stat"><div class="k">Inic.</div><div class="v">${seg(c.init)}</div></div>
      <div class="stat"><div class="k">Magia</div><div class="v">${seg(c.magia || 0)}</div></div>
    </div></div>
    <div class="bloque"><h4>Atributos</h4><div class="atributos">${R.ATR.map((a) => `<div class="atributo"><div class="k">${a}</div><div class="v ${dados[a] < c.actual[a] ? 'baja' : ''}">d${dados[a] || '—'}</div><div class="b">${dados[a] < c.actual[a] ? `de d${c.actual[a]}` : '&nbsp;'}</div></div>`).join('')}</div></div>
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
const afinidades = (af) => `<div class="afin">${N.TIPOS_DANO.map(([k, n]) => `<div class="${af[k] || ''}" title="${esc(n)}${af[k] ? ': ' + N.AFINIDADES[af[k]] : ''}">${esc(n.slice(0, 3))}<b>${af[k] || '—'}</b></div>`).join('')}</div>`;
const listaPnj = (titulo, items) => (items && items.length ? `<div class="bloque"><h4>${titulo}</h4><div class="lista">${items.join('')}</div></div>` : '');

/** Secciones de la ficha de un PNJ con lo que se conoce (v = plantilla o vista revelada). */
function seccionesPnj(v, estados, completo) {
  const nivel = completo ? 16 : v.revelado || 0;
  let h = '';
  if (nivel >= 13 && v.atributos) {
    const dados = N.dadosPnj(v, estados);
    h += `<div class="bloque"><div class="numeros">
        <div class="stat"><div class="k">DEF</div><div class="v">${v.defensa}</div></div>
        <div class="stat"><div class="k">D. Mág</div><div class="v">${v.defensa_magica}</div></div>
        ${completo ? `<div class="stat"><div class="k">Inic.</div><div class="v">${v.iniciativa}</div></div><div class="stat"><div class="k">Nivel</div><div class="v">${v.nivel}</div></div>` : ''}
      </div></div>
      <div class="bloque"><h4>Atributos</h4><div class="atributos">${N.ATR.map((a) => `<div class="atributo"><div class="k">${a}</div><div class="v ${dados[a] < v.atributos[a] ? 'baja' : ''}">d${dados[a]}</div><div class="b">${dados[a] < v.atributos[a] ? `de d${v.atributos[a]}` : '&nbsp;'}</div></div>`).join('')}</div></div>
      <div class="bloque"><h4>Afinidades</h4>${afinidades(v.afinidades || {})}</div>
      ${v.rasgos && v.rasgos.length ? `<div class="bloque"><h4>Rasgos</h4><div class="fila">${v.rasgos.map((r) => `<span class="chip">${esc(r)}</span>`).join('')}</div></div>` : ''}`;
  }
  if (nivel >= 16) {
    h += listaPnj('Ataques básicos', (v.ataques || []).map((a) => `<div class="item"><div class="titulo">${esc(a.nombre)}</div><div class="mono small">${esc(N.textoAtaque(a))}</div>${a.efecto ? `<div class="sub">${esc(a.efecto)}</div>` : ''}</div>`));
    h += listaPnj('Conjuros', (v.conjuros || []).map((c, k) => `<details class="item" data-det="pcj:${k}"><summary><span class="titulo">${esc(c.nombre)}</span><span class="muted small">${esc(N.metaConjuroPnj(c))}</span></summary><div class="cuerpo texto">${md(c.efecto)}</div></details>`));
    h += listaPnj('Otras acciones', (v.otras_acciones || []).map((x, k) => `<details class="item" data-det="poa:${k}"><summary><span class="titulo">${esc(x.nombre)}</span></summary><div class="cuerpo texto">${md(x.efecto)}</div></details>`));
    h += listaPnj('Reglas especiales', (v.reglas || []).map((x, k) => `<details class="item" data-det="prg:${k}"><summary><span class="titulo">${esc(x.nombre)}</span></summary><div class="cuerpo texto">${md(x.efecto)}</div></details>`));
  }
  return h;
}

function detallePnj(e) {
  if (!ve()) return `${cabecera(e, '')}<div class="bloque"><p class="muted">Entra con tu cuenta de Discord del servidor para ver lo que el grupo sabe de él.</p></div>`;
  const estados = e.estados || [];
  const chipsEstado = estados.length ? `<div class="fila small" style="margin-top:6px">${estados.map((s) => `<span class="chip err">${esc(N.nombreEstado(s))}</span>`).join('')}</div>` : '';
  if (esDj()) {
    const t = e.ficha;
    const cr = N.crisisPnj(t);
    const sub = esc(`${t.nombre !== e.nombre ? t.nombre + ' · ' : ''}Nivel ${t.nivel} · ${N.nombreRango(t)} · ${N.nombreEspecie(t.especie)}`);
    return `${cabecera(e, sub)}
      <div class="bloque">${barraRec('PV', 'pv', e.pv, t.pv)}${barraRec('PM', 'pm', e.pm, t.pm)}
        <div class="fila small">${e.pv === 0 ? '<span class="chip err">Caído</span>' : e.pv <= cr ? '<span class="chip err">En Crisis</span>' : `<span class="faint">Crisis ≤ ${cr}</span>`}<span class="faint">· Los jugadores ven ${e.dano ? `−${e.dano} de daño` : 'que está intacto'}</span></div>
        ${t.descripcion ? `<p class="small muted" style="margin-top:8px"><em>${esc(t.descripcion)}</em></p>` : ''}</div>
      ${bloqueEstados(estados)}
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
      <div class="bloque"><div class="numeros"><div class="stat"><div class="k">PV máx</div><div class="v">${t.pv}</div></div><div class="stat"><div class="k">PM máx</div><div class="v">${t.pm}</div></div><div class="stat"><div class="k">Crisis</div><div class="v">${cr}</div></div><div class="stat"><div class="k">Rango</div><div class="v small" style="font-size:13px">${esc(N.nombreRango(t))}</div></div></div></div>
      ${seccionesPnj(t, estados, true)}
      ${t.equipo ? `<div class="bloque"><h4>Equipo</h4><p class="small">${esc(t.equipo)}</p></div>` : ''}
      ${t.notas ? `<div class="bloque"><h4>Notas</h4><div class="texto small">${md(t.notas)}</div></div>` : ''}
      <div class="acciones-pj">
        <button class="btn" data-act="imagen">Imagen</button>${e.imagen ? '<button class="btn fantasma" data-act="quitar-imagen">Quitar imagen</button>' : ''}
        <a class="btn fantasma" href="../panel/index.html#pnj=${encodeURIComponent(t.id)}">Editar ficha</a>
        <button class="btn fantasma peligro" data-act="retirar">Retirar del campo</button>
      </div>`;
  }
  // Jugador: lo revelado
  const v = e.info || { revelado: 0 };
  const nivel = v.revelado || 0;
  const sub = nivel >= 10 ? esc(`${N.nombreRango(v)} · ${N.nombreEspecie(v.especie)}`) : (e.lado === 'aliado' ? 'Aliado' : 'Perfil desconocido');
  let rec = '';
  if (e.pv !== undefined && v.pv) rec = `${barraRec('PV', 'pv', e.pv, v.pv)}${e.pm !== undefined && v.pm ? barraRec('PM', 'pm', e.pm, v.pm) : ''}`;
  return `${cabecera(e, sub)}
    <div class="bloque">${rec}
      <div class="fila small">${e.dano ? `<span class="chip err">Daño recibido: ${e.dano}</span>` : '<span class="faint">Sin daño recibido</span>'}</div>${chipsEstado}
      ${v.descripcion && nivel >= 10 ? `<p class="small muted" style="margin-top:8px"><em>${esc(v.descripcion)}</em></p>` : ''}
      ${nivel < 16 && e.lado !== 'aliado' ? `<p class="nota" style="margin-top:10px">${nivel ? `Sabéis: ${esc(N.textoRevelado(nivel))}.` : 'No sabéis nada de su perfil.'} Usa <code>/estudiar</code> en Discord para descubrir más.</p>` : ''}
    </div>
    ${seccionesPnj(v, estados, false)}`;
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
    case 'imagen': if (e) { imagenPara = e.clave.startsWith('pj:') ? `pj:${e.id}` : `pnj:${e.plantilla}`; $('subir-imagen').click(); } return;
    case 'quitar-imagen':
      if (!e) return;
      await accion(() => post('datos/?accion=quitar-imagen', { clave: e.clave.startsWith('pj:') ? `pj:${e.id}` : `pnj:${e.plantilla}` }), 'Imagen quitada.');
      return;
    default:
  }
});

document.addEventListener('change', async (ev) => {
  const t = ev.target;
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
actualizar(true);
