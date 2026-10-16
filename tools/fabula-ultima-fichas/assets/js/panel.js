// ---------------------------------------------------------------------------
// Panel del DJ: personajes de la partida (importar, exportar, asignar,
// editar, eliminar) y estado de la configuración del bot.
// Requiere iniciar sesión con Discord y tener el rol DJ en el servidor.
// ---------------------------------------------------------------------------
import { cargarRaw, construirDb } from './db.js';
import * as R from './rules.js';
import { esc, initTema, leerArchivo, toast, normTxt } from './ui.js';
import { resumenClases } from './ficha.js';

const A = '/api/';
let db = null;
let sesion = null;
let personajes = [];
let miembros = { miembros: [], aviso: null };
let estado = null;
let filtro = '';

const vista = () => document.getElementById('vista');

async function pedir(ruta, opciones = {}) {
  const r = await fetch(A + ruta, { cache: 'no-store', ...opciones, headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) } });
  let j = null;
  try { j = await r.json(); } catch (e) { /* sin json */ }
  if (!r.ok) { const err = new Error((j && j.error) || `Error ${r.status}`); err.status = r.status; err.datos = j; throw err; }
  return j;
}
const post = (ruta, cuerpo) => pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo) });

// ================================================================== arranque
async function iniciar() {
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
}

async function recargar() {
  try {
    const [l, m] = await Promise.all([pedir('datos/?accion=lista'), pedir('datos/?accion=miembros').catch((e) => ({ miembros: [], aviso: e.message }))]);
    personajes = l.personajes.map((p) => R.normalizarPersonaje(p));
    miembros = m;
    if (!db) db = construirDb(await cargarRaw('../data/'), null);
  } catch (e) { toast(e.message, 'err'); }
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
      <p class="muted small">Pide que te lo asignen y vuelve a entrar. Puedes consultar las fichas en el <a href="../visor/index.html">visor</a>.</p>
      ${sesion.aviso ? `<p class="small" style="color:var(--err)">${esc(sesion.aviso)}</p>` : ''}
    </div>${htmlConfig(false)}`;
}

// ================================================================== panel
function pintar() {
  const q = normTxt(filtro);
  const lista = personajes.filter((p) => !q || normTxt(`${p.identidad.nombre} ${p.identidad.identidad} ${(p.discord && p.discord.nombre) || ''}`).includes(q));
  const asignados = personajes.filter((p) => p.discord && p.discord.id).length;
  vista().innerHTML = `
    <div class="seccion fila entre">
      <div><h2 style="font-size:20px">Personajes de la partida</h2>
        <p class="muted small">${personajes.length} personaje${personajes.length === 1 ? '' : 's'} · ${asignados} con jugador. Los jugadores crean su ficha en el generador, la exportan y te mandan el JSON.</p></div>
      <div class="fila">
        <button class="btn" data-act="importar">Importar JSON</button>
        <a class="btn primario" href="../generador/index.html?nube=nuevo">Nuevo personaje</a>
      </div>
    </div>
    ${miembros.aviso ? `<p class="small" style="color:var(--warn);margin:-8px 0 12px">${esc(miembros.aviso)}</p>` : ''}
    ${personajes.length > 4 ? `<div class="buscador" style="margin-bottom:12px"><input type="search" placeholder="Buscar personaje o jugador" value="${esc(filtro)}" data-filtro="1" aria-label="Buscar"></div>` : ''}
    ${personajes.length ? `<div class="lista">${lista.map(filaPj).join('')}</div>`
      : '<div class="vacio"><p>Todavía no hay personajes en la partida.</p><p class="small">Importa los JSON que te manden los jugadores o crea uno nuevo.</p></div>'}
    ${htmlConfig(true)}`;
}

function filaPj(pj) {
  const i = pj.identidad;
  let clases = '';
  try { clases = db ? resumenClases(pj, db) : ''; } catch (e) { clases = ''; }
  const asignado = pj.discord && pj.discord.id;
  const opciones = [...miembros.miembros];
  if (asignado && !opciones.some((m) => m.id === pj.discord.id)) opciones.unshift({ id: pj.discord.id, nombre: pj.discord.nombre || pj.discord.id });
  return `<div class="item pj-fila">
    <div><a class="titulo" href="../visor/index.html#${encodeURIComponent(pj.id)}" style="color:var(--text)">${esc(i.nombre || 'Sin nombre')}</a>
      <div class="sub">Nivel ${pj.nivel}${clases ? ' · ' + esc(clases) : ''}${i.identidad ? ' · ' + esc(i.identidad) : ''}</div></div>
    <select data-act="asignar" data-id="${esc(pj.id)}" aria-label="Jugador de ${esc(i.nombre)}">
      <option value="">Sin jugador</option>
      ${opciones.map((m) => `<option value="${esc(m.id)}" ${asignado === m.id ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}
    </select>
    <div class="botones">
      <a class="btn peq" href="../generador/index.html?nube=${encodeURIComponent(pj.id)}">Editar</a>
      <a class="btn peq fantasma" href="${A}datos/?accion=descargar&id=${encodeURIComponent(pj.id)}">Exportar</a>
      <button class="btn peq fantasma peligro" data-act="eliminar" data-id="${esc(pj.id)}">Eliminar</button>
    </div>
  </div>`;
}

function htmlConfig(esDj) {
  if (!estado) return '';
  const pendientes = estado.checks.filter((c) => !c.ok).length;
  const copiar = (etq, valor) => `<div class="small muted" style="margin-top:10px">${etq}</div>
    <div class="copiar"><code>${esc(valor)}</code><button class="btn peq" data-act="copiar" data-valor="${esc(valor)}">Copiar</button></div>`;
  return `<details class="tarjeta" style="margin-top:24px" ${pendientes ? 'open' : ''}>
    <summary class="fila entre" style="cursor:pointer"><strong>Configuración del bot</strong>
      <span class="chip ${pendientes ? 'err' : 'ok'}">${pendientes ? `${pendientes} pendiente${pendientes > 1 ? 's' : ''}` : 'Todo correcto'}</span></summary>
    <div style="margin-top:12px">
      ${estado.checks.map((c) => `<div class="check ${c.ok ? 'ok' : ''}"><i></i><div><strong>${esc(c.nombre)}</strong>${c.detalle ? ` <span class="muted small">— ${esc(c.detalle)}</span>` : ''}</div></div>`).join('')}
      ${copiar('Interactions Endpoint URL (Discord Developer Portal → General Information)', estado.urls.interacciones)}
      ${copiar('Redirect (Discord Developer Portal → OAuth2 → Redirects)', estado.urls.redireccion)}
      ${esDj ? `<div class="fila" style="margin-top:14px"><button class="btn primario" data-act="registrar">Actualizar comandos de Discord</button>
        <span class="muted small">Púlsalo la primera vez y cada vez que se añadan comandos.</span></div>` : ''}
      <p class="small muted" style="margin-top:12px">Guía paso a paso: <code>tools/fabula-ultima-fichas/docs/bot-discord.md</code></p>
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
    case 'salir':
      await post('auth/?accion=salir', {}).catch(() => {});
      location.reload();
      return;
    case 'importar': document.getElementById('importar').click(); return;
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
  if (t.dataset.act === 'asignar') {
    const m = miembros.miembros.find((x) => x.id === t.value) || (t.value ? { id: t.value, nombre: t.selectedOptions[0].textContent } : null);
    try {
      const r = await post('datos/?accion=asignar', { id: t.dataset.id, usuario: m });
      toast(m ? `Asignado a ${m.nombre}.${r.liberados ? ' Su personaje anterior queda libre.' : ''}` : 'Personaje sin jugador.');
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
