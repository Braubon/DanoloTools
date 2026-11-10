// ---------------------------------------------------------------------------
// Panel del DJ: personajes de la partida (importar, exportar, asignar,
// editar, eliminar, imagen), fichas de enemigo (PNJ) y estado de la
// configuración del bot.
// Requiere iniciar sesión con Discord y tener el rol DJ en el servidor.
// ---------------------------------------------------------------------------
import { cargarRaw, construirDb } from './db.js';
import * as R from './rules.js';
import { esc, initTema, leerArchivo, toast, normTxt, reducirImagen } from './ui.js';
import { resumenClases } from './ficha.js';
import * as N from './pnj.js';

const A = '/api/';
let db = null;
let sesion = null;
let personajes = [];
let plantillas = [];
let imagenes = {};
let imagenPara = null;
let miembros = { miembros: [], aviso: null };
let estado = null;
let filtro = '';
let partidaActual = new URLSearchParams(location.search).get('partida') || localStorage.getItem('fu-partida') || 'principal';
let partidas = [];
let rolesCanales = { roles: [], canales: [] };
let editandoPartida = null;

const vista = () => document.getElementById('vista');

const conPartida = (ruta) => {
  const sep = ruta.includes('?') ? '&' : '?';
  return `${ruta}${sep}partida=${encodeURIComponent(partidaActual)}`;
};

function actualizarEnlacesNav() {
  const eg = document.getElementById('enlace-generador');
  if (eg) eg.href = `../generador/index.html?partida=${encodeURIComponent(partidaActual)}`;
  const ec = document.getElementById('enlace-combate');
  if (ec) ec.href = `../visor/index.html?partida=${encodeURIComponent(partidaActual)}`;
  const ef = document.getElementById('enlace-fichas');
  if (ef) ef.href = `../ficha/index.html?partida=${encodeURIComponent(partidaActual)}`;
}

function cargarSelectorTopbar() {
  const caja = document.getElementById('caja-partida');
  const sel = document.getElementById('sel-partida');
  if (!caja || !sel) return;
  if (partidas.length) {
    sel.innerHTML = partidas.map((p) => `<option value="${esc(p.id)}" ${p.id === partidaActual ? 'selected' : ''}>${esc(p.nombre || p.id)}</option>`).join('');
    caja.classList.remove('oculto');
    sel.onchange = () => {
      partidaActual = sel.value;
      localStorage.setItem('fu-partida', partidaActual);
      const u = new URL(location);
      u.searchParams.set('partida', partidaActual);
      history.replaceState(null, '', u);
      actualizarEnlacesNav();
      recargar();
    };
  } else {
    caja.classList.add('oculto');
  }
}

async function pedir(ruta, opciones = {}) {
  let url = ruta;
  if (url.startsWith('datos/?') && !url.includes('partida=') && !url.startsWith('datos/?accion=roles-canales') && !url.startsWith('datos/?accion=partidas') && !url.startsWith('datos/?accion=estado')) {
    url = conPartida(url);
  }
  const r = await fetch(A + url, { cache: 'no-store', ...opciones, headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) } });
  let j = null;
  try { j = await r.json(); } catch (e) { /* sin json */ }
  if (!r.ok) { const err = new Error((j && j.error) || `Error ${r.status}`); err.status = r.status; err.datos = j; throw err; }
  return j;
}
const post = (ruta, cuerpo = {}) => {
  if (cuerpo && typeof cuerpo === 'object' && !cuerpo.partida && !ruta.includes('partida')) {
    cuerpo.partida = partidaActual;
  }
  return pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo) });
};

// ================================================================== arranque
async function iniciar() {
  try {
    initTema();
    const q = new URLSearchParams(location.search);
    if (q.get('login') === 'error') toast('No se pudo iniciar sesión con Discord.', 'err');
    if (q.has('login')) history.replaceState(null, '', location.pathname);
    try {
      sesion = await pedir('auth/?accion=yo');
    } catch (e) {
      vista().innerHTML = `<div class="vacio"><p><strong>El panel necesita las funciones de Vercel.</strong></p>
        <p class="small">No responde <code>/api/</code>. Si estás en local, usa <code>vercel dev</code>; si ya está publicado, revisa la guía de configuración.</p></div>`;
      return;
    }
    pintarUsuario();
    estado = await pedir('datos/?accion=estado').catch(() => null);
    if (!sesion.usuario) return pintarEntrar();
    if (!sesion.dj) return pintarSinPermiso();
    await recargar();
    abrirDesdeHash();
  } catch (err) {
    console.error('Error al inicializar el panel del DJ:', err);
    const v = vista();
    if (v) {
      v.innerHTML = `<div class="vacio"><p><strong>Error al cargar el panel</strong></p>
        <p class="small" style="color:var(--err)">${esc(err.message || String(err))}</p></div>`;
    }
  }
}

function abrirDesdeHash() {
  const m = location.hash.match(/^#pnj=(.+)$/);
  if (m) { location.href = `../pnj/index.html?id=${m[1]}`; return; }
  if (location.hash === '#enemigos') { const el = document.getElementById('enemigos'); if (el) el.scrollIntoView(); }
}

async function recargar() {
  try {
    const [l, m, partRes, rcRes] = await Promise.all([
      pedir(`datos/?accion=lista&partida=${encodeURIComponent(partidaActual)}`).catch((e) => {
        toast(`Error al cargar datos de la partida: ${e.message}`, 'err');
        return { personajes: [], plantillas: [], imagenes: [] };
      }),
      pedir('datos/?accion=miembros').catch((e) => ({ miembros: [], aviso: e.message })),
      pedir('datos/?accion=partidas').catch(() => ({ partidas: [] })),
      pedir('datos/?accion=roles-canales').catch(() => ({ roles: [], canales: [] }))
    ]);
    personajes = ((l && l.personajes) || []).map((p) => R.normalizarPersonaje(p));
    plantillas = (l && l.plantillas) || [];
    imagenes = (l && l.imagenes) || {};
    miembros = m || { miembros: [], aviso: null };
    partidas = (partRes && partRes.partidas) || [];
    rolesCanales = rcRes || { roles: [], canales: [] };
    if (!db) {
      try { db = construirDb(await cargarRaw('../data/'), null); } catch (e) { /* db opcional */ }
    }
  } catch (e) {
    console.error('Error en recargar():', e);
    toast(e.message, 'err');
  }
  cargarSelectorTopbar();
  actualizarEnlacesNav();
  pintar();
}

// ================================================================== cabecera
function pintarUsuario() {
  const u = sesion && sesion.usuario;
  document.getElementById('usuario').innerHTML = u
    ? `<span class="usuario">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : ''}${esc(u.nombre)}${sesion.dj ? ' <span class="chip acento">DJ</span>' : ''}
       <button class="btn peq fantasma" data-act="salir">Salir</button></span>` : '';
}

function urlEntrar() { return `${A}auth/?accion=entrar&volver=${encodeURIComponent(location.pathname)}`; }

function pintarEntrar() {
  vista().innerHTML = `<div class="tarjeta entrar">
      <div class="display" style="font-size:28px;margin-bottom:6px">Panel del DJ</div>
      <p class="muted">Entra con tu cuenta de Discord. Necesitas el rol <strong>${esc((estado && estado.rolDj) || 'DJ')}</strong> en el servidor de la partida.</p>
      <a class="btn primario" href="${urlEntrar()}">Entrar con Discord</a>
    </div>${htmlConfig(false)}`;
}

function pintarSinPermiso() {
  vista().innerHTML = `<div class="tarjeta entrar">
      <p><strong>Tu cuenta no tiene el rol ${esc((estado && estado.rolDj) || 'DJ')}</strong> en el servidor de la partida.</p>
      <p class="muted small">Pide que te lo asignen y vuelve a entrar. Puedes seguir la partida en la <a href="../visor/index.html">vista de combate</a>.</p>
      ${sesion.aviso ? `<p class="small" style="color:var(--err)">${esc(sesion.aviso)}</p>` : ''}
    </div>${htmlConfig(false)}`;
}

// ================================================================== panel
function pintar() {
  const q = normTxt(filtro);
  const lista = personajes.filter((p) => !q || normTxt(`${p.identidad.nombre} ${p.identidad.identidad} ${(p.discord && p.discord.nombre) || ''}`).includes(q));
  const asignados = personajes.filter((p) => p.discord && p.discord.id).length;
  const partActual = partidas.find((p) => p.id === partidaActual) || { nombre: partidaActual };
  vista().innerHTML = `
    <div class="seccion fila entre">
      <div><h2 style="font-size:20px">Personajes de ${esc(partActual.nombre || 'la partida')}</h2>
        <p class="muted small">${personajes.length} personaje${personajes.length === 1 ? '' : 's'} en esta partida · ${asignados} con jugador. Los jugadores crean su ficha en el generador, la exportan y te mandan el JSON. Un jugador puede llevar varios personajes.</p></div>
      <div class="fila">
        <button class="btn" data-act="importar">Importar JSON</button>
        <a class="btn primario" href="../generador/index.html?nube=nuevo&partida=${encodeURIComponent(partidaActual)}">Nuevo personaje</a>
      </div>
    </div>
    ${miembros.aviso ? `<p class="small" style="color:var(--warn);margin:-8px 0 12px">${esc(miembros.aviso)}</p>` : ''}
    ${personajes.length > 4 ? `<div class="buscador" style="margin-bottom:12px"><input type="search" placeholder="Buscar personaje o jugador" value="${esc(filtro)}" data-filtro="1" aria-label="Buscar"></div>` : ''}
    ${personajes.length ? `<div class="lista">${lista.map(filaPj).join('')}</div>`
      : '<div class="vacio"><p>Todavía no hay personajes en esta partida.</p><p class="small">Importa los JSON que te manden los jugadores o crea uno nuevo.</p></div>'}
    ${htmlPartidas()}
    ${htmlEnemigos()}
    ${htmlConfig(true)}`;
}

const urlImg = (clave) => (imagenes[clave] ? `${A}datos/?accion=imagen&clave=${encodeURIComponent(clave)}&v=${imagenes[clave]}` : '../assets/img/sprite-defecto.png');

function filaPj(pj) {
  const i = pj.identidad || {};
  let clases = '';
  try { clases = db ? resumenClases(pj, db) : ''; } catch (e) { clases = ''; }
  const asignado = pj.discord && pj.discord.id;
  const opciones = Array.isArray(miembros && miembros.miembros) ? [...miembros.miembros] : [];
  if (asignado && !opciones.some((m) => m.id === pj.discord.id)) opciones.unshift({ id: pj.discord.id, nombre: pj.discord.nombre || pj.discord.id });
  return `<div class="item pj-fila">
    <div class="fila" style="flex-wrap:nowrap"><img src="${esc(urlImg(`pj:${pj.id}`))}" alt="" width="40" height="40" class="miniatura"><div><a class="titulo" href="../ficha/index.html?partida=${encodeURIComponent(partidaActual)}#${encodeURIComponent(pj.id)}" style="color:var(--text)">${esc(i.nombre || 'Sin nombre')}</a>
      <div class="sub">Nivel ${pj.nivel || 1}${clases ? ' · ' + esc(clases) : ''}${i.identidad ? ' · ' + esc(i.identidad) : ''}</div></div></div>
    <select data-act="asignar" data-id="${esc(pj.id)}" aria-label="Jugador de ${esc(i.nombre || 'personaje')}">
      <option value="">Sin jugador</option>
      ${opciones.map((m) => `<option value="${esc(m.id)}" ${asignado === m.id ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}
    </select>
    <div class="botones">
      <a class="btn peq" href="../generador/index.html?nube=${encodeURIComponent(pj.id)}&partida=${encodeURIComponent(partidaActual)}">Editar</a>
      <button class="btn peq fantasma" data-act="imagen" data-clave="pj:${esc(pj.id)}">Imagen</button>
      <a class="btn peq fantasma" href="${A}datos/?accion=descargar&id=${encodeURIComponent(pj.id)}&partida=${encodeURIComponent(partidaActual)}">Exportar</a>
      <button class="btn peq fantasma peligro" data-act="eliminar" data-id="${esc(pj.id)}">Eliminar</button>
    </div>
  </div>`;
}

function htmlPartidas() {
  const rList = Array.isArray(rolesCanales && rolesCanales.roles) ? rolesCanales.roles : [];
  const cList = Array.isArray(rolesCanales && rolesCanales.canales) ? rolesCanales.canales : [];
  const nombreRol = (id) => {
    if (!id) return null;
    const r = rList.find((x) => x.id === id);
    return r ? `@${r.nombre}` : id;
  };
  const nombreCanal = (id) => {
    const c = cList.find((x) => x.id === id);
    return c ? `#${c.nombre}` : id;
  };

  const formPartida = editandoPartida ? `
    <div class="tarjeta" style="margin-bottom:16px;border-color:var(--accent)">
      <h3>${editandoPartida.esNueva ? 'Crear nueva partida' : `Editar partida «${esc(editandoPartida.nombre)}»`}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <label class="small muted" style="display:block;margin-bottom:4px">Nombre de la partida</label>
          <input type="text" id="part-nombre" value="${esc(editandoPartida.nombre || '')}" placeholder="ej. Campaña Sombras" style="width:100%" required>
        </div>
        <div>
          <label class="small muted" style="display:block;margin-bottom:4px">Identificador único (ID slug)</label>
          <input type="text" id="part-id" value="${esc(editandoPartida.id || '')}" ${editandoPartida.esNueva ? '' : 'readonly'} placeholder="ej. sombras" style="width:100%" required>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <label class="small muted" style="display:block;margin-bottom:4px">Descripción</label>
        <input type="text" id="part-desc" value="${esc(editandoPartida.descripcion || '')}" placeholder="Breve descripción o notas" style="width:100%">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <label class="small muted" style="display:block;margin-bottom:4px">Rol Discord de Jugador (acceso exclusivo)</label>
          <select id="part-rol-jugador" style="width:100%">
            <option value="">(Cualquier miembro del servidor)</option>
            ${rList.map((r) => `<option value="${esc(r.id)}" ${editandoPartida.rolJugador === r.id ? 'selected' : ''}>@${esc(r.nombre)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="small muted" style="display:block;margin-bottom:4px">Rol Discord de DJ (opcional para DJ específico)</label>
          <select id="part-rol-dj" style="width:100%">
            <option value="">(Rol DJ global del servidor)</option>
            ${rList.map((r) => `<option value="${esc(r.id)}" ${editandoPartida.rolDj === r.id ? 'selected' : ''}>@${esc(r.nombre)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label class="small muted" style="display:block;margin-bottom:4px">Canales de Discord vinculados a esta partida</label>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:6px;max-height:160px;overflow-y:auto;background:var(--surface-2);padding:8px;border-radius:6px;border:1px solid var(--line)">
          ${cList.filter((c) => c.tipo === 0).map((c) => `
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
              <input type="checkbox" name="part-canal" value="${esc(c.id)}" ${(editandoPartida.canales || []).includes(c.id) ? 'checked' : ''}>
              #${esc(c.nombre)}
            </label>
          `).join('') || '<span class="small muted">No hay canales de texto disponibles.</span>'}
        </div>
      </div>
      <div class="fila">
        <button class="btn primario" data-act="guardar-partida">Guardar partida</button>
        <button class="btn fantasma" data-act="cancelar-partida">Cancelar</button>
      </div>
    </div>
  ` : '';

  const partActual = (partidas || []).find((p) => p.id === partidaActual) || { nombre: partidaActual };

  return `
    <div class="seccion fila entre" id="partidas" style="margin-top:28px">
      <div>
        <h2 style="font-size:20px">Partidas y Campañas</h2>
        <p class="muted small">${(partidas || []).length} partida${(partidas || []).length === 1 ? '' : 's'} configurada${(partidas || []).length === 1 ? '' : 's'}. Administra partidas separadas en el mismo servidor de Discord. Partida activa actual: <strong style="color:var(--accent)">${esc(partActual.nombre || partidaActual)}</strong>.</p>
      </div>
      <div class="fila">
        <button class="btn primario" data-act="nueva-partida">+ Nueva partida</button>
      </div>
    </div>
    ${formPartida}
    <div class="lista">
      ${(partidas || []).map((p) => {
        const esActual = p.id === partidaActual;
        const rJ = nombreRol(p.rolJugador) || 'Todos los miembros';
        const rD = nombreRol(p.rolDj) || 'DJ Global';
        const cTxt = (p.canales && p.canales.length)
          ? p.canales.map(nombreCanal).join(', ')
          : 'Sin canales específicos vinculados';
        return `
          <div class="item" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;${esActual ? 'border-color:var(--accent)' : ''}">
            <div>
              <div class="fila" style="gap:8px">
                <span class="titulo">${esc(p.nombre || p.id)}</span>
                <span class="chip ${esActual ? 'acento' : 'fantasma'}">${esActual ? 'Activa en panel' : `id: ${esc(p.id)}`}</span>
              </div>
              <div class="sub" style="margin-top:4px">
                ${p.descripcion ? `${esc(p.descripcion)} · ` : ''}
                Jugadores: <span style="color:var(--text)">${esc(rJ)}</span> · DJ: <span style="color:var(--text)">${esc(rD)}</span>
              </div>
              <div class="sub muted" style="font-size:12px;margin-top:2px">
                Canales: ${esc(cTxt)}
              </div>
            </div>
            <div class="botones">
              ${!esActual ? `<button class="btn peq" data-act="seleccionar-partida" data-id="${esc(p.id)}">Seleccionar</button>` : ''}
              <button class="btn peq fantasma" data-act="editar-partida" data-id="${esc(p.id)}">Editar</button>
              ${p.id !== 'principal' ? `<button class="btn peq fantasma peligro" data-act="eliminar-partida" data-id="${esc(p.id)}">Eliminar</button>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function htmlEnemigos() {
  return `<div class="seccion fila entre" id="enemigos" style="margin-top:28px">
      <div><h2 style="font-size:20px">Fichas de enemigo y PNJ</h2>
        <p class="muted small">${plantillas.length} ficha${plantillas.length === 1 ? '' : 's'}. Los jugadores no las ven: en la <a href="../visor/index.html?partida=${encodeURIComponent(partidaActual)}">vista de combate</a> solo ven nombre, imagen, estados, daño recibido y lo que reveléis con el Estudio.</p></div>
      <div class="fila">
        <button class="btn" data-act="importar-pnj">Importar JSON</button>
        <a class="btn" href="../pnj/index.html?bestiario">Desde el bestiario</a>
        <a class="btn primario" href="../pnj/index.html?nuevo">Nueva ficha</a>
      </div>
    </div>
    ${plantillas.length ? `<div class="lista">${plantillas.map((t) => `<div class="item pnj-fila">
      <img src="${esc(urlImg(`pnj:${t.id}`))}" alt="" width="40" height="40">
      <div><span class="titulo">${esc(t.nombre)}</span>
        <div class="sub">Nivel ${t.nivel} · ${esc(N.nombreRango(t))} · ${esc(N.nombreEspecie(t.especie))} · PV ${t.pv} · PM ${t.pm}${t.villano ? ` · ${esc(N.nombreVillano(t.villano).toLowerCase())}` : ''}${t.siguiente_fase ? ' · con otra fase' : ''}${t.revelado ? ` · <span style="color:var(--accent)">revelado ${t.revelado}+</span>` : ''}</div></div>
      <div class="botones">
        <a class="btn peq" href="../pnj/index.html?id=${encodeURIComponent(t.id)}">Editar</a>
        <a class="btn peq fantasma" href="../pnj/index.html?duplicar=${encodeURIComponent(t.id)}">Duplicar</a>
        <button class="btn peq fantasma" data-act="imagen" data-clave="pnj:${esc(t.id)}">Imagen</button>
        <a class="btn peq fantasma" href="${A}datos/?accion=descargar-plantilla&id=${encodeURIComponent(t.id)}">Exportar</a>
        <button class="btn peq fantasma peligro" data-act="eliminar-pnj" data-id="${esc(t.id)}">Eliminar</button>
      </div></div>`).join('')}</div>`
      : '<div class="vacio"><p>No hay fichas de enemigo.</p><p class="small">Crea una nueva, parte de una criatura del bestiario o importa un JSON.</p></div>'}`;
}

async function importarPnj(files) {
  let ok = 0;
  for (const f of files) {
    try {
      const contenido = await leerArchivo(f);
      const lista = Array.isArray(contenido) ? contenido : [contenido];
      for (const datos of lista) {
        if (datos && datos.formato === R.FORMATO) throw new Error(`${f.name}: es un personaje jugador; impórtalo arriba, en «Personajes de la partida».`);
        const t = N.normalizarPnj(N.completarHabilidades({ ...datos, habilidades: (datos.habilidades || []).map((h) => ({ ...h })) }, (db && db.col.habilidades_pnj) || []));
        const existe = plantillas.some((x) => x.id === t.id);
        if (existe && !confirm(`«${t.nombre}» ya existe. ¿Sustituir su ficha? (se conserva su imagen y lo revelado)`)) continue;
        await post('datos/?accion=guardar-plantilla', { plantilla: datos, reemplazar: true });
        ok++;
      }
    } catch (e) { toast(e.message, 'err'); }
  }
  if (ok) toast(`${ok} ficha${ok > 1 ? 's' : ''} de PNJ importada${ok > 1 ? 's' : ''}.`);
  await recargar();
}

function htmlConfig(esDj) {
  if (!estado || !Array.isArray(estado.checks)) return '';
  const pendientes = estado.checks.filter((c) => !c.ok).length;
  const copiar = (etq, valor) => `<div class="small muted" style="margin-top:10px">${etq}</div>
    <div class="copiar"><code>${esc(valor)}</code><button class="btn peq" data-act="copiar" data-valor="${esc(valor)}">Copiar</button></div>`;
  return `<details class="tarjeta" style="margin-top:24px" ${pendientes ? 'open' : ''}>
    <summary class="fila entre" style="cursor:pointer"><strong>Configuración del bot</strong>
      <span class="chip ${pendientes ? 'err' : 'ok'}">${pendientes ? `${pendientes} pendiente${pendientes > 1 ? 's' : ''}` : 'Todo correcto'}</span></summary>
    <div style="margin-top:12px">
      ${estado.checks.map((c) => `<div class="check ${c.ok ? 'ok' : ''}"><i></i><div><strong>${esc(c.nombre)}</strong>${c.detalle ? ` <span class="muted small">— ${esc(c.detalle)}</span>` : ''}</div></div>`).join('')}
      ${(estado.urls && estado.urls.interacciones) ? copiar('Interactions Endpoint URL (Discord Developer Portal → General Information)', estado.urls.interacciones) : ''}
      ${(estado.urls && estado.urls.redireccion) ? copiar('Redirect (Discord Developer Portal → OAuth2 → Redirects)', estado.urls.redireccion) : ''}
      ${esDj ? `<div class="fila" style="margin-top:14px"><button class="btn primario" data-act="registrar">Actualizar comandos de Discord</button>
        <span class="muted small">Púlsalo la primera vez y cada vez que se añadan comandos.</span></div>` : ''}
      <p class="small muted" style="margin-top:12px">Guía paso a paso: <code>tools/fabula-ultima/docs/bot-discord.md</code></p>
    </div></details>`;
}

// ================================================================== acciones
async function importar(files) {
  let ok = 0;
  for (const f of files) {
    try {
      const datos = await leerArchivo(f);
      if (datos.formato && datos.formato !== R.FORMATO) throw new Error(`${f.name}: no es un personaje del generador.`);
      try {
        await post('datos/?accion=guardar', { personaje: datos, rev: datos.rev ?? null });
      } catch (e) {
        if (e.status !== 409) throw e;
        const nombre = (datos.identidad && datos.identidad.nombre) || f.name;
        if (!confirm(`«${nombre}» ya está en la partida.\n\n¿Sustituirlo por este archivo? Se perderán sus cambios de estado (PV, PM, PF…) hechos desde Discord.`)) continue;
        await post('datos/?accion=guardar', { personaje: datos, forzar: true });
      }
      ok++;
    } catch (e) { toast(e.message, 'err'); }
  }
  if (ok) toast(`${ok} personaje${ok > 1 ? 's' : ''} importado${ok > 1 ? 's' : ''}.`);
  await recargar();
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || t.tagName === 'SELECT') return;
  const ds = t.dataset;
  switch (ds.act) {
    case 'nueva-partida':
      editandoPartida = { esNueva: true, id: '', nombre: '', descripcion: '', rolJugador: '', rolDj: '', canales: [] };
      pintar();
      document.getElementById('part-nombre')?.focus();
      return;
    case 'editar-partida': {
      const p = partidas.find((x) => x.id === ds.id);
      if (p) {
        editandoPartida = { esNueva: false, ...p };
        pintar();
        document.getElementById('part-nombre')?.focus();
      }
      return;
    }
    case 'cancelar-partida':
      editandoPartida = null;
      pintar();
      return;
    case 'guardar-partida': {
      const idEl = document.getElementById('part-id');
      const nomEl = document.getElementById('part-nombre');
      const descEl = document.getElementById('part-desc');
      const rjEl = document.getElementById('part-rol-jugador');
      const rdEl = document.getElementById('part-rol-dj');
      const canalesSel = [...document.querySelectorAll('input[name="part-canal"]:checked')].map((c) => c.value);
      if (!nomEl || !nomEl.value.trim()) { toast('Indica el nombre de la partida.', 'warn'); return; }
      const datosPartida = {
        id: idEl.value.trim(),
        nombre: nomEl.value.trim(),
        descripcion: descEl ? descEl.value.trim() : '',
        rolJugador: rjEl && rjEl.value ? rjEl.value : null,
        rolDj: rdEl && rdEl.value ? rdEl.value : null,
        canales: canalesSel
      };
      t.disabled = true;
      try {
        await post('datos/?accion=guardar-partida', datosPartida);
        toast('Partida guardada.');
        editandoPartida = null;
        await recargar();
      } catch (err) {
        toast(err.message, 'err');
      } finally {
        t.disabled = false;
      }
      return;
    }
    case 'eliminar-partida': {
      const p = partidas.find((x) => x.id === ds.id);
      if (!p || !confirm(`¿Eliminar la partida «${p.nombre || p.id}»? Sus personajes y datos de combate dejarán de ser accesibles.`)) return;
      try {
        await post('datos/?accion=eliminar-partida', { id: ds.id });
        toast('Partida eliminada.');
        if (partidaActual === ds.id) {
          partidaActual = 'principal';
          localStorage.setItem('fu-partida', 'principal');
        }
        await recargar();
      } catch (err) {
        toast(err.message, 'err');
      }
      return;
    }
    case 'seleccionar-partida': {
      partidaActual = ds.id;
      localStorage.setItem('fu-partida', partidaActual);
      const u = new URL(location);
      u.searchParams.set('partida', partidaActual);
      history.replaceState(null, '', u);
      await recargar();
      return;
    }
    case 'salir':
      await post('auth/?accion=salir', {}).catch(() => {});
      location.reload();
      return;
    case 'importar': document.getElementById('importar').click(); return;
    case 'importar-pnj': document.getElementById('importar-pnj').click(); return;
    case 'eliminar-pnj': {
      const tp = plantillas.find((x) => x.id === ds.id);
      if (!tp || !confirm(`¿Eliminar la ficha «${tp.nombre}»? Si hay PNJ suyos en el campo, se retiran. Exporta antes su JSON si lo quieres conservar.`)) return;
      try { await post('datos/?accion=eliminar-plantilla', { id: ds.id }); toast('Ficha eliminada.'); } catch (err) { toast(err.message, 'err'); }
      await recargar();
      return;
    }
    case 'imagen': imagenPara = ds.clave; document.getElementById('subir-imagen').click(); return;
    case 'eliminar': {
      const pj = personajes.find((p) => p.id === ds.id);
      if (!pj || !confirm(`¿Eliminar a ${pj.identidad.nombre || 'este personaje'} de la partida? No se puede deshacer (exporta antes su JSON si lo quieres conservar).`)) return;
      try { await post('datos/?accion=eliminar', { id: ds.id }); toast('Personaje eliminado.'); } catch (err) { toast(err.message, 'err'); }
      await recargar();
      return;
    }
    case 'registrar':
      t.disabled = true;
      try {
        const r = await post('datos/?accion=registrar', {});
        toast(`${r.comandos.length} comandos registrados en Discord.`);
      } catch (err) { toast(err.message, 'err'); } finally { t.disabled = false; }
      return;
    case 'copiar':
      try { await navigator.clipboard.writeText(ds.valor); toast('Copiado.'); } catch (err) { toast('No se pudo copiar.', 'err'); }
      return;
    default:
  }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'importar') { await importar([...t.files]); t.value = ''; return; }
  if (t.id === 'importar-pnj') { await importarPnj([...t.files]); t.value = ''; return; }
  if (t.id === 'subir-imagen' && t.files[0] && imagenPara) {
    const f = t.files[0];
    t.value = '';
    try {
      await post('datos/?accion=subir-imagen', { clave: imagenPara, imagen: await reducirImagen(f) });
      toast('Imagen guardada.');
    } catch (err) { toast(err.message, 'err'); }
    await recargar();
    return;
  }
  if (t.dataset.act === 'asignar') {
    const m = miembros.miembros.find((x) => x.id === t.value) || (t.value ? { id: t.value, nombre: t.selectedOptions[0].textContent } : null);
    try {
      const r = await post('datos/?accion=asignar', { id: t.dataset.id, usuario: m });
      toast(m ? `Asignado a ${m.nombre}.` : 'Personaje sin jugador.');
    } catch (err) { toast(err.message, 'err'); }
    await recargar();
  }
});

document.addEventListener('input', (e) => {
  if (e.target.dataset.filtro) {
    filtro = e.target.value;
    const pos = e.target.selectionStart;
    pintar();
    const n = document.querySelector('[data-filtro]');
    if (n) { n.focus(); n.setSelectionRange(pos, pos); }
  }
});

iniciar();
