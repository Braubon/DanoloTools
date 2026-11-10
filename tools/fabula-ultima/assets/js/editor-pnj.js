// ---------------------------------------------------------------------------
// Editor visual de fichas de PNJ (pnj/). Solo para el DJ.
//   ?id=<id>        edita una ficha de la partida
//   ?nuevo          ficha en blanco
//   ?duplicar=<id>  copia de una ficha de la partida
//   ?bestiario      abre el selector del bestiario de los libros
// Los cálculos del libro (assets/js/pnj.js → calcularPnj) se muestran como
// sugerencia al lado de cada valor; el DJ decide si los aplica.
// ---------------------------------------------------------------------------
import { cargarRaw, construirDb, nombreAtlas } from './db.js';
import * as N from './pnj.js';
import * as VP from './vista-pnj.js';
import { esc, initTema, toast, descargarJson, leerArchivo, normTxt, ICON } from './ui.js';

const A = '/api/';
const DADOS = [6, 8, 10, 12];
const TABS = [['identidad', 'Identidad'], ['valores', 'Atributos y valores'], ['afinidades', 'Afinidades'], ['ataques', 'Ataques y conjuros'], ['habilidades', 'Habilidades y reglas'], ['notas', 'Notas y botín'], ['avanzado', 'JSON']];

let db = null;
let catalogo = [];
let plantillas = [];
let t = null;             // ficha en edición (sin normalizar)
let idAnterior = null;    // id con el que está guardada en la partida (null = nueva)
let idManual = false;
let sucio = false;
let tab = 'identidad';
let previa = 'dj';
let filtroBestiario = '';

const $ = (id) => document.getElementById(id);

// ================================================================== red
async function pedir(ruta, opciones = {}) {
  const r = await fetch(A + ruta, { cache: 'no-store', ...opciones, headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) } });
  let j = null;
  try { j = await r.json(); } catch (e) { /* sin json */ }
  if (!r.ok) { const err = new Error((j && j.error) || `Error ${r.status}`); err.status = r.status; throw err; }
  return j;
}
const post = (ruta, cuerpo) => pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo) });

// ================================================================== estado
/** Prepara una ficha para editarla: normalizada, con habilidades completas y 4 huecos de rasgos. */
function paraEditar(datos) {
  const x = N.completarHabilidades(N.normalizarPnj(datos), catalogo);
  delete x.formato; delete x.version; delete x.modificado;
  while (x.rasgos.length < 4) x.rasgos.push('');
  return x;
}
/** Ficha normalizada (o el error que impide normalizarla). */
function normal() {
  try { return { t: N.completarHabilidades(N.normalizarPnj(t), catalogo) }; } catch (e) { return { error: e.message }; }
}
const libro = () => N.calcularPnj(normal().t || t, catalogo);
function marcar() {
  sucio = true;
  const s = document.querySelector('.cab-editor .sucio');
  if (s) s.textContent = 'Cambios sin guardar';
}

function ruta(obj, path, valor) {
  const p = path.split('.');
  let o = obj;
  for (let i = 0; i < p.length - 1; i++) o = o[/^\d+$/.test(p[i]) ? Number(p[i]) : p[i]];
  const k = /^\d+$/.test(p[p.length - 1]) ? Number(p[p.length - 1]) : p[p.length - 1];
  if (valor === undefined) return o[k];
  o[k] = valor;
  return valor;
}

// ================================================================== arranque
async function iniciar() {
  initTema();
  let sesion;
  try { sesion = await pedir('auth/?accion=yo'); } catch (e) {
    $('vista').innerHTML = '<div class="vacio"><p><strong>El editor necesita las funciones de Vercel (/api/).</strong></p></div>';
    return;
  }
  const u = sesion.usuario;
  $('usuario').innerHTML = u ? `<span class="fila small muted" style="flex-wrap:nowrap">${esc(u.nombre)}${sesion.dj ? ' <span class="chip acento">DJ</span>' : ''}</span>` : '';
  if (!sesion.dj) {
    $('vista').innerHTML = `<div class="tarjeta" style="text-align:center;padding:40px 16px"><p><strong>El editor de PNJ es solo para el DJ.</strong></p>
      ${u ? '<p class="muted small">Tu cuenta no tiene el rol DJ en el servidor de la partida.</p>' : `<a class="btn primario" href="${A}auth/?accion=entrar&volver=${encodeURIComponent(location.pathname + location.search)}">Entrar con Discord</a>`}</div>`;
    return;
  }
  const [raw, lista] = await Promise.all([cargarRaw('../data/'), pedir('datos/?accion=plantillas')]);
  db = construirDb(raw, null);
  catalogo = db.col.habilidades_pnj || [];
  plantillas = lista.plantillas || [];

  const q = new URLSearchParams(location.search);
  if (q.get('id')) {
    const p = plantillas.find((x) => x.id === q.get('id'));
    if (!p) { toast('Esa ficha ya no existe. Empiezas una nueva.', 'err'); t = paraEditar(N.pnjVacio()); } else { t = paraEditar(p); idAnterior = p.id; idManual = true; }
  } else if (q.get('duplicar')) {
    const p = plantillas.find((x) => x.id === q.get('duplicar'));
    t = paraEditar(p || N.pnjVacio());
    if (p) duplicarEstado();
  } else {
    t = paraEditar(N.pnjVacio());
    t.id = '';
    const c = N.calcularPnj(t, catalogo);
    for (const k of ['pv', 'pm', 'iniciativa', 'defensa', 'defensa_magica']) t[k] = c[k];
    t.ataques = [N.ataqueNuevo(t)];
  }
  pintar();
  if (q.has('bestiario')) abrirBestiario();
}

function duplicarEstado() {
  t.nombre = `${t.nombre} (copia)`;
  let id = N.slug(t.nombre);
  for (let k = 2; plantillas.some((x) => x.id === id); k++) id = N.slug(`${t.nombre} ${k}`);
  t.id = id;
  idAnterior = null;
  idManual = false;
  sucio = true;
}

// ================================================================== pintar
function pintar() {
  const nt = normal();
  $('vista').innerHTML = `
    <div class="cab-editor">
      <div class="display titulo-ed" id="titulo-ed">${esc(t.nombre || 'Sin nombre')}</div>
      <span class="sucio">${sucio ? 'Cambios sin guardar' : idAnterior ? 'Guardada en la partida' : 'Ficha nueva'}</span>
      <button class="btn fantasma" data-act="bestiario">Desde el bestiario</button>
      <button class="btn fantasma" data-act="importar">Abrir JSON</button>
      <button class="btn fantasma" data-act="exportar">Exportar</button>
      ${idAnterior ? '<button class="btn fantasma" data-act="duplicar">Duplicar</button>' : ''}
      <button class="btn primario" data-act="guardar">Guardar</button>
    </div>
    <div class="editor">
      <div class="form-pnj">
        <nav class="pestanas" role="tablist">${TABS.map(([id, n]) => `<button role="tab" aria-selected="${tab === id}" data-act="tab" data-id="${id}">${n}</button>`).join('')}</nav>
        <div id="contenido-tab">${contenidoTab()}</div>
      </div>
      <aside class="previa" id="previa">${htmlPrevia(nt)}</aside>
    </div>`;
}

function refrescar() {
  const nt = normal();
  $('previa').innerHTML = htmlPrevia(nt);
  $('titulo-ed').textContent = t.nombre || 'Sin nombre';
  const c = libro();
  document.querySelectorAll('[data-lib]').forEach((el) => {
    const k = el.dataset.lib;
    const v = c[k];
    el.innerHTML = `Libro: <b>${v}</b>`;
    el.classList.toggle('distinto', Number(t[k]) !== v);
  });
  const cupo = document.getElementById('cupo-num');
  if (cupo) { cupo.textContent = `${c.cupo.usadas} / ${c.cupo.total}`; cupo.classList.toggle('pasado', c.cupo.usadas > c.cupo.total); }
}

function repintarTab() {
  const scroll = window.scrollY;
  $('contenido-tab').innerHTML = contenidoTab();
  refrescar();
  window.scrollTo(0, scroll);
}

// ------------------------------------------------------------------ vista previa
function htmlPrevia(nt) {
  const niveles = [['dj', 'DJ'], [0, 'Jug. 0'], [10, '10+'], [13, '13+'], [16, '16+']];
  const seg = `<div class="segmento" role="group" aria-label="Vista previa">${niveles.map(([k, n]) => `<button data-act="previa" data-nivel="${k}" aria-pressed="${String(previa) === String(k)}">${n}</button>`).join('')}</div>`;
  if (nt.error) return `${seg}<div class="tarjeta"><p style="color:var(--err);margin:0">${esc(nt.error)}</p></div>`;
  const f = nt.t;
  const c = N.calcularPnj(f, catalogo);
  const avisos = c.avisos.length ? `<ul class="avisos-ed">${c.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '';
  const img = idAnterior ? `${A}datos/?accion=imagen&clave=${encodeURIComponent('pnj:' + idAnterior)}` : '../assets/img/sprite-defecto.png';
  const e = { nombre: f.nombre, lado: 'enemigo', dano: 0, estados: [] };
  const cab = (sub) => `<div class="cab"><img src="${esc(img)}" alt=""><div><div class="display nombre">${esc(f.nombre)}</div><div class="sub">${esc(sub)}</div></div><span></span></div>`;
  let cuerpo;
  if (previa === 'dj') {
    cuerpo = `${cab(VP.subtituloPnj(e, true, f))}${f.descripcion ? `<div class="bloque"><p class="small muted" style="margin:0"><em>${esc(f.descripcion)}</em></p></div>` : ''}${VP.htmlPnjCompleto(f, [])}`;
  } else {
    const nivel = Number(previa);
    const info = { ...(nivel >= 10 ? { nombre: f.nombre, descripcion: f.descripcion } : {}), ...N.vistaRevelada(f, nivel) };
    const ej = { ...e, info, ...(nivel >= 10 ? { pv: f.pv, pm: f.pm } : {}) };
    cuerpo = `${cab(VP.subtituloPnj(ej, false))}${VP.htmlPnjJugador(ej)}`;
  }
  return `${seg}${avisos}<div class="detalle-panel">${cuerpo}</div>
    <p class="nota-ed">${previa === 'dj' ? 'Así la ves tú en la vista de combate.' : `Así la ve un jugador con lo revelado a ${previa}+ (sin daño ni estados).`}</p>`;
}

// ------------------------------------------------------------------ pestañas
const campo = (etq, html, cls = '') => `<label class="campo ${cls}"><span>${etq}</span>${html}</label>`;
const inTxt = (path, ph = '', extra = '') => `<input type="text" data-campo="${path}" value="${esc(ruta(t, path) ?? '')}" placeholder="${esc(ph)}" ${extra}>`;
const inNum = (path, extra = '') => { const v = ruta(t, path); return `<input type="number" data-campo="${path}" data-tipo="num" value="${v === null || v === undefined ? '' : esc(v)}" ${extra}>`; };
const inArea = (path, ph = '', filas = 3) => `<textarea data-campo="${path}" rows="${filas}" placeholder="${esc(ph)}">${esc(ruta(t, path) ?? '')}</textarea>`;
const sel = (path, opciones, extra = '') => `<select data-campo="${path}" ${extra}>${opciones.map(([v, n]) => `<option value="${esc(v)}" ${String(ruta(t, path) ?? '') === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
const selDado = (path) => `<select data-campo="${path}" data-tipo="num">${DADOS.map((d) => `<option value="${d}" ${Number(ruta(t, path)) === d ? 'selected' : ''}>d${d}</option>`).join('')}</select>`;
const selAtr = (path) => sel(path, N.ATR.map((a) => [a, a]));
const selTipo = (path, vacio = false) => sel(path, [...(vacio ? [['', '—']] : []), ...N.TIPOS_DANO]);

function contenidoTab() {
  switch (tab) {
    case 'identidad': return tabIdentidad();
    case 'valores': return tabValores();
    case 'afinidades': return tabAfinidades();
    case 'ataques': return tabAtaques();
    case 'habilidades': return tabHabilidades();
    case 'notas': return tabNotas();
    case 'avanzado': return tabAvanzado();
    default: return '';
  }
}

function tabIdentidad() {
  const esp = N.ESPECIES_INFO[t.especie] || {};
  const fases = plantillas.filter((p) => p.id !== t.id && p.id !== idAnterior).map((p) => [p.id, `${p.nombre} · Nv ${p.nivel}`]);
  return `<div class="seccion-ed"><h3>Identidad</h3><div class="rejilla-campos">
      ${campo('Nombre', inTxt('nombre', 'Nombre del PNJ'), 'ancho2')}
      ${campo('Identificador', inTxt('id', 'se genera del nombre', 'data-id-campo="1"'), '')}
      ${campo('Nivel', inNum('nivel', 'min="1" max="99"'))}
      ${campo('Descripción', inArea('descripcion', 'Una o dos frases que lo describan', 2), 'todo')}
    </div><p class="nota-ed">El identificador distingue la ficha: si importas otra con el mismo, la sustituye. Las copias en combate («Lobo A», «Lobo B»…) comparten ficha.</p></div>
    <div class="seccion-ed"><h3>Especie y rango</h3><div class="rejilla-campos">
      ${campo('Especie', sel('especie', N.ESPECIES, 'data-repinta="1"'))}
      ${campo('Rango', sel('rango', N.RANGOS, 'data-repinta="1"'))}
      ${t.rango === 'campeon' ? campo('Campeón (N)', inNum('rango_n', 'min="2" max="9"')) : ''}
    </div>
    <p class="nota-ed"><strong>${esc(N.nombreEspecie(t.especie))}:</strong> ${esc(esp.nota || '')} ${esp.habilidades ? `${esp.habilidades} habilidades gratuitas.` : ''}
      ${esp.afinidades || esp.inmune ? '<button class="btn peq" data-act="reglas-especie" style="margin-left:6px">Aplicar afinidades e inmunidades de especie</button>' : ''}</p>
    ${t.rango !== 'soldado' ? `<p class="nota-ed">${t.rango === 'elite' ? 'Élite: PV ×2, +2 a la iniciativa, 1 habilidad más y dos turnos por asalto.' : `Campeón (${t.rango_n || 2}): PV ×${t.rango_n || 2}, PM ×2, +${t.rango_n || 2} a la iniciativa, ${t.rango_n || 2} habilidades más y ${t.rango_n || 2} turnos por asalto.`} Los valores sugeridos en «Atributos y valores» ya lo tienen en cuenta.</p>` : ''}</div>
    <div class="seccion-ed"><h3>Rasgos <span class="der"><button class="btn peq fantasma" data-act="mas-rasgo">Añadir</button></span></h3>
      <div class="rejilla-campos">${t.rasgos.map((r, i) => `<input type="text" data-campo="rasgos.${i}" value="${esc(r)}" placeholder="Rasgo ${i + 1}">`).join('')}</div>
      <p class="nota-ed">Cuatro rasgos que resuman su personalidad, cuerpo, origen o función. Los jugadores los ven con un Estudio de 13+.</p></div>
    <div class="seccion-ed"><h3>Villano y fases</h3><div class="rejilla-campos">
      ${campo('Villano', sel('villano', [['', 'No es un villano'], ...N.VILLANOS.map(([k, n]) => [k, n])], 'data-repinta="1"'))}
      ${t.villano ? campo('Puntos Última', inNum('puntos_ultima', 'min="0" max="99"')) : ''}
      ${campo('Al caer pasa a la fase', sel('siguiente_fase', [['', 'Ninguna (cae normalmente)'], ...fases]), 'ancho2')}
    </div><p class="nota-ed">Los villanos empiezan cada combate con sus Puntos Última (menor 5, mayor 10, supremo 15) y los gastas desde la vista de combate o con <code>/enemigo pu</code>. Para un jefe con varias fases, crea una ficha por fase y enlázalas aquí: al llegar a 0 PV no se anuncia que cae y puedes pasarlo a la siguiente.</p></div>`;
}

function tabValores() {
  const c = libro();
  const fila = (k, etq) => `<span>${etq}</span>${inNum(k)}<span class="lib ${Number(t[k]) !== c[k] ? 'distinto' : ''}" data-lib="${k}">Libro: <b>${c[k]}</b></span><button class="btn peq fantasma" data-act="usar" data-k="${k}">Usar</button>`;
  return `<div class="seccion-ed"><h3>Atributos</h3>
      <div class="fila" style="margin-bottom:12px">${N.PERFILES_ATRIBUTOS.map(([id, n, d]) => `<button class="btn peq" data-act="perfil" data-id="${id}" title="${d.map((x) => 'd' + x).join(', ')}">${n}</button>`).join('')}</div>
      <div class="rejilla-campos">${N.ATR.map((a) => campo(a, selDado(`atributos.${a}`))).join('')}</div>
      <p class="nota-ed">Los perfiles reparten los dados en orden DES, PER, VIG, VOL; cámbialos después si lo necesitas. En los niveles 20, 40 y 60 el PNJ sube un atributo un tamaño de dado.</p></div>
    <div class="seccion-ed"><h3>Valores <span class="der"><button class="btn peq" data-act="usar-todo">Usar todos los del libro</button></span></h3>
      <div class="valores">${fila('pv', 'PV máximos')}${fila('pm', 'PM máximos')}${fila('iniciativa', 'Iniciativa')}${fila('defensa', 'Defensa')}${fila('defensa_magica', 'Defensa Mágica')}</div>
      <p class="nota-ed">«Libro» es lo que dan las reglas de creación de PNJ con su nivel, atributos, rango y habilidades (Puntos de Vida extra, Defensas extra…). Si tu criatura es distinta, deja tu valor: en amarillo, los que no coinciden. Crisis: ${Math.floor((Number(t.pv) || 0) / 2)}.</p>
      <p class="nota-ed">Bonificador por nivel a Precisión y Magia: <strong>+${c.bonus_precision}</strong>${c.bonus_magia !== c.bonus_precision ? ` / +${c.bonus_magia}` : ''} · daño extra por nivel: <strong>+${c.dano_extra}</strong>. Los ataques y conjuros nuevos ya los incluyen.</p></div>`;
}

function tabAfinidades() {
  const ciclo = ['', 'VU', 'RS', 'IM', 'AS'];
  const esp = N.ESPECIES_INFO[t.especie] || {};
  return `<div class="seccion-ed"><h3>Afinidades al daño</h3>
      <div class="afin-ed">${N.TIPOS_DANO.map(([k, n]) => { const v = t.afinidades[k] || ''; return `<button class="${v}" data-act="afinidad" data-k="${k}" title="${esc(n)}: ${v ? N.AFINIDADES[v] : 'normal'} (pulsa para cambiar)">${esc(n)}<b>${v || '—'}</b></button>`; }).join('')}</div>
      <p class="nota-ed">Pulsa para cambiar: — normal · ${ciclo.slice(1).map((x) => `${x} ${N.AFINIDADES[x].toLowerCase()}`).join(' · ')}. Cada vulnerabilidad le da una habilidad más (dos si es al daño físico).</p></div>
    <div class="seccion-ed"><h3>Inmunidad a estados</h3>
      <div class="estados-sel fila">${N.ESTADOS.map(([id, n]) => `<button class="chip" data-act="inmunidad" data-id="${id}" aria-pressed="${t.inmunidades_estados.includes(id)}">${n}</button>`).join('')}</div>
      <p class="nota-ed">La vista de combate y el bot no le pondrán estos estados.${esp.inmune ? ` Por ser ${N.nombreEspecie(t.especie).toLowerCase()} es inmune a: ${esp.inmune.map(N.nombreEstado).join(', ').toLowerCase()}.` : ''}</p></div>`;
}

function htmlAtaque(a, i) {
  return `<div class="elemento">
    <div class="barra-el">${inTxt(`ataques.${i}.nombre`, 'Nombre del ataque')}
      <button class="btn peq fantasma" data-act="mover" data-lista="ataques" data-i="${i}" data-dir="-1" title="Subir">↑</button>
      <button class="btn peq fantasma" data-act="mover" data-lista="ataques" data-i="${i}" data-dir="1" title="Bajar">↓</button>
      <button class="btn peq fantasma peligro" data-act="quitar" data-lista="ataques" data-i="${i}" title="Quitar">${ICON.x}</button></div>
    <div class="rejilla-campos">
      ${campo('Alcance', sel(`ataques.${i}.alcance`, [['cuerpo', 'Cuerpo a cuerpo'], ['distancia', 'A distancia']]))}
      ${campo('Precisión', `<div class="fila" style="flex-wrap:nowrap">${selAtr(`ataques.${i}.precision.0`)}${selAtr(`ataques.${i}.precision.1`)}</div>`)}
      ${campo('Bonificador', inNum(`ataques.${i}.bonus`))}
      ${campo('Daño (TM + …)', inNum(`ataques.${i}.dano`))}
      ${campo('Tipo de daño', selTipo(`ataques.${i}.tipo`))}
      ${campo('Contra', sel(`ataques.${i}.contra`, [['def', 'Defensa'], ['mdef', 'Defensa Mágica']]))}
      ${campo('Efecto', inArea(`ataques.${i}.efecto`, 'Estados, efectos de oportunidad…', 2), 'todo')}
    </div></div>`;
}

function htmlConjuro(c, i) {
  return `<div class="elemento">
    <div class="barra-el">${inTxt(`conjuros.${i}.nombre`, 'Nombre del conjuro')}
      <button class="btn peq fantasma" data-act="mover" data-lista="conjuros" data-i="${i}" data-dir="-1" title="Subir">↑</button>
      <button class="btn peq fantasma" data-act="mover" data-lista="conjuros" data-i="${i}" data-dir="1" title="Bajar">↓</button>
      <button class="btn peq fantasma peligro" data-act="quitar" data-lista="conjuros" data-i="${i}" title="Quitar">${ICON.x}</button></div>
    <div class="rejilla-campos">
      ${campo('PM', inNum(`conjuros.${i}.pm`))}
      ${campo('Coste', `<label class="fila small" style="height:36px"><input type="checkbox" data-campo="conjuros.${i}.por_objetivo" data-tipo="bool" ${c.por_objetivo ? 'checked' : ''}> × objetivo</label>`)}
      ${campo('Objetivo', inTxt(`conjuros.${i}.objetivo`, 'Una criatura'))}
      ${campo('Duración', inTxt(`conjuros.${i}.duracion`, 'Instantánea'))}
      ${campo('Ofensivo', `<label class="fila small" style="height:36px"><input type="checkbox" data-campo="conjuros.${i}.ofensivo" data-tipo="bool" data-repinta="1" ${c.ofensivo ? 'checked' : ''}> prueba de magia</label>`)}
      ${c.ofensivo ? campo('Prueba de magia', `<div class="fila" style="flex-wrap:nowrap">${selAtr(`conjuros.${i}.precision.0`)}${selAtr(`conjuros.${i}.precision.1`)}</div>`) + campo('Bonificador', inNum(`conjuros.${i}.bonus`)) : ''}
      ${campo('Daño (TM + …)', inNum(`conjuros.${i}.dano`, 'placeholder="sin daño"'))}
      ${campo('Tipo de daño', selTipo(`conjuros.${i}.tipo`, true))}
      ${campo('Efecto', inArea(`conjuros.${i}.efecto`, 'Efecto completo', 3), 'todo')}
    </div></div>`;
}

function tabAtaques() {
  const grupos = new Map();
  for (const cj of db.col.conjuros) {
    const k = cj.lista === 'pnj' ? 'Conjuros de PNJ' : `Clase: ${cj.lista}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(cj);
  }
  const opciones = [...grupos.entries()].sort(([a], [b]) => (a === 'Conjuros de PNJ' ? -1 : b === 'Conjuros de PNJ' ? 1 : a.localeCompare(b)))
    .map(([g, l]) => `<optgroup label="${esc(g)}">${l.map((cj) => `<option value="${esc(cj.id)}">${esc(cj.nombre)} · ${esc(cj.pm)} PM</option>`).join('')}</optgroup>`).join('');
  return `<div class="seccion-ed"><h3>Ataques básicos <span class="der"><button class="btn peq" data-act="nuevo-ataque">Añadir ataque</button></span></h3>
      ${t.ataques.map(htmlAtaque).join('') || '<p class="muted small">Sin ataques.</p>'}
      <p class="nota-ed">El bonificador de precisión ya incluye el de nivel (como en el bestiario). Los ataques nuevos empiezan con los valores del libro para su nivel.</p></div>
    <div class="seccion-ed"><h3>Conjuros</h3>
      <div class="fila" style="margin-bottom:12px"><select id="conjuro-db" style="flex:1;min-width:200px">${opciones}</select>
        <button class="btn peq" data-act="conjuro-db">Añadir de la lista</button><button class="btn peq fantasma" data-act="nuevo-conjuro">En blanco</button></div>
      ${t.conjuros.map(htmlConjuro).join('') || '<p class="muted small">Sin conjuros.</p>'}
      <p class="nota-ed">Los conjuros de la lista se copian con su coste, objetivo, duración y efecto; el daño se calcula con el nivel del PNJ. Recuerda que aprender conjuros cuesta la habilidad «Lanzador de conjuros».</p></div>`;
}

function htmlHabilidad(h, i) {
  const def = h.id && catalogo.find((x) => x.id === h.id);
  const quitar = `<button class="btn peq fantasma peligro" data-act="quitar" data-lista="habilidades" data-i="${i}" title="Quitar">${ICON.x}</button>`;
  if (def) {
    return `<div class="elemento"><div class="barra-el"><strong style="flex:1">${esc(def.nombre)}</strong>${def.limitada ? '<span class="chip">Limitada</span>' : ''}${quitar}</div>
      <div class="rejilla-campos">
        ${def.opciones ? campo('Opción', sel(`habilidades.${i}.opcion`, [['', 'Elige…'], ...def.opciones.map((o) => [o.id, o.etiqueta])], 'data-repinta="1"'), 'ancho2') : ''}
        ${campo('Nota', inTxt(`habilidades.${i}.nota`, def.nota || 'Detalles de esta criatura (opcional)'), 'todo')}
      </div><p class="nota-ed">${esc(def.efecto.replace(/\*\*/g, ''))}</p></div>`;
  }
  return `<div class="elemento"><div class="barra-el">${inTxt(`habilidades.${i}.nombre`, 'Nombre de la habilidad')}${quitar}</div>
    ${inArea(`habilidades.${i}.efecto`, 'Efecto (por ejemplo, una habilidad de clase de PJ)', 3)}</div>`;
}

function tabHabilidades() {
  const c = libro();
  const usos = (id) => t.habilidades.filter((h) => h.id === id).length;
  const catalogoHtml = catalogo.map((d) => {
    const max = d.limitada ? 1 : d.max || 99;
    const excluida = (d.especies_excluidas || []).includes(t.especie);
    const lleno = usos(d.id) >= max;
    return `<details class="item"><summary><span class="titulo">${esc(d.nombre)}</span>${d.limitada ? '<span class="chip">Limitada</span>' : d.max ? `<span class="chip">hasta ${d.max}</span>` : ''}${(d.gratis_para || []).includes(t.especie) ? '<span class="chip acento">Gratis</span>' : ''}
      <span class="der"><button class="btn peq" data-act="nueva-hab" data-id="${d.id}" ${excluida || lleno ? 'disabled' : ''} title="${excluida ? 'Esta especie no puede tenerla' : lleno ? 'Ya la tiene el máximo de veces' : 'Añadir'}">Añadir</button></span></summary>
      <div class="cuerpo small">${esc(d.efecto.replace(/\*\*/g, ''))}</div></details>`;
  }).join('');
  const lista = (clave, titulo, ph) => `<div class="seccion-ed"><h3>${titulo} <span class="der"><button class="btn peq" data-act="nuevo-texto" data-lista="${clave}">Añadir</button></span></h3>
    ${t[clave].map((x, i) => `<div class="elemento"><div class="barra-el">${inTxt(`${clave}.${i}.nombre`, 'Nombre')}
      <button class="btn peq fantasma peligro" data-act="quitar" data-lista="${clave}" data-i="${i}" title="Quitar">${ICON.x}</button></div>${inArea(`${clave}.${i}.efecto`, ph, 3)}</div>`).join('') || '<p class="muted small">Ninguna.</p>'}</div>`;
  return `<div class="seccion-ed"><h3>Habilidades</h3>
      <div class="cupo"><span class="num ${c.cupo.usadas > c.cupo.total ? 'pasado' : ''}" id="cupo-num">${c.cupo.usadas} / ${c.cupo.total}</span>
        <span class="muted">${c.cupo.detalle.map(([n, x]) => `${esc(n)} +${x}`).join(' · ') || 'Sin habilidades disponibles'}</span></div>
      ${t.habilidades.map(htmlHabilidad).join('') || '<p class="muted small">Todavía no tiene habilidades.</p>'}
      <div class="fila" style="margin-top:6px"><button class="btn peq fantasma" data-act="hab-libre">Añadir habilidad libre (de clase u otra)</button></div></div>
    <div class="seccion-ed"><h3>Catálogo de habilidades de PNJ</h3><div class="lista catalogo">${catalogoHtml}</div>
      <p class="nota-ed">Las que dan cifras (Puntos de Vida extra, Iniciativa extra, Defensas extra, Especialización, Lanzador de conjuros) se suman a los valores sugeridos del libro.</p></div>
    ${lista('otras_acciones', 'Otras acciones', 'Qué hace y cuándo puede usarla')}
    ${lista('reglas', 'Reglas especiales', 'Reglas propias de esta criatura')}`;
}

function tabNotas() {
  return `<div class="seccion-ed"><h3>Equipo</h3>${inTxt('equipo', 'Armas y armaduras que lleva (informativo)')}</div>
    <div class="seccion-ed"><h3>Botín</h3>${inArea('botin', 'Qué deja al vencerlo: objetos, zenit, cartas…', 3)}<p class="nota-ed">Solo lo ves tú.</p></div>
    <div class="seccion-ed"><h3>Notas</h3>${inArea('notas', 'Tácticas, descripción en combate…', 6)}<p class="nota-ed">Solo lo ves tú. Admite **negrita**, *cursiva* y listas con «- ».</p></div>`;
}

function tabAvanzado() {
  const nt = normal();
  const json = nt.t ? N.exportarPnj(nt.t) : t;
  return `<div class="seccion-ed"><h3>JSON de la ficha</h3>
    <textarea id="json-ed" spellcheck="false" style="min-height:55vh;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace">${esc(JSON.stringify(json, null, 2))}</textarea>
    <div class="fila" style="margin-top:10px"><button class="btn" data-act="aplicar-json">Aplicar este JSON al editor</button><span class="nota-ed" style="margin:0">Formato en <code>docs/esquema-datos.md</code>, sección 9.</span></div></div>`;
}

// ================================================================== bestiario
function abrirBestiario() {
  let d = $('bestiario');
  if (!d) { d = document.createElement('dialog'); d.id = 'bestiario'; document.body.appendChild(d); }
  d.innerHTML = `<div class="cab"><h2>Crear desde el bestiario</h2><button class="btn icono fantasma" data-act="cerrar-bestiario" aria-label="Cerrar">${ICON.x}</button></div>
    <div class="cuerpo-d"><div class="buscador" style="margin-bottom:10px"><input type="search" id="buscar-bestiario" placeholder="Buscar por nombre, especie o nivel" value="${esc(filtroBestiario)}"></div>
      <div id="lista-bestiario"></div></div>`;
  pintarBestiario();
  d.showModal();
  $('buscar-bestiario').focus();
}
function pintarBestiario() {
  const q = normTxt(filtroBestiario);
  const lista = (db.col.bestiario || []).filter((b) => !q || normTxt(`${b.nombre} ${N.nombreEspecie(b.especie)} ${b.nivel}`).includes(q))
    .sort((a, b) => a.nivel - b.nivel || a.nombre.localeCompare(b.nombre));
  $('lista-bestiario').innerHTML = (db.col.bestiario || []).length
    ? (lista.length ? `<div class="lista">${lista.map((b) => `<div class="item fila entre" data-act="elegir-bestiario" data-id="${esc(b.id)}" role="button" tabindex="0">
        <span><span class="titulo">${esc(b.nombre)}</span> <span class="muted small">Nivel ${b.nivel} · ${esc(N.nombreEspecie(b.especie))} · ${esc(N.nombreRango({ rango: b.rango || 'soldado', rango_n: b.rango_n }))}</span></span>
        <span class="etiqueta-atlas">${esc(nombreAtlas(db, b._atlas))}</span></div>`).join('')}</div>` : '<p class="muted">Ninguna criatura coincide.</p>')
    : '<p class="muted">El bestiario está vacío. Las criaturas de los libros se añaden en <code>data/&lt;libro&gt;/bestiario.json</code>.</p>';
}
function elegirBestiario(id) {
  const b = (db.col.bestiario || []).find((x) => x.id === id);
  if (!b) return;
  if (sucio && !confirm('¿Sustituir la ficha que estás editando por esta criatura? Perderás los cambios sin guardar.')) return;
  const copia = JSON.parse(JSON.stringify(b));
  delete copia._atlas; delete copia._col;
  t = paraEditar(copia);
  idAnterior = null;
  idManual = true;
  sucio = true;
  if (plantillas.some((x) => x.id === t.id)) toast(`Ya tienes una ficha «${t.id}» en la partida: al guardar te preguntaré si la sustituyes.`);
  $('bestiario').close();
  history.replaceState(null, '', '?nuevo');
  tab = 'identidad';
  pintar();
}

// ================================================================== acciones
async function guardar() {
  const nt = normal();
  if (nt.error) { toast(nt.error, 'err'); return; }
  const id = nt.t.id;
  const cambiaId = idAnterior && idAnterior !== id;
  if ((!idAnterior || cambiaId) && plantillas.some((x) => x.id === id) && !confirm(`Ya hay una ficha con el identificador «${id}» en la partida. ¿Sustituirla?`)) return;
  try {
    await post('datos/?accion=guardar-plantilla', { plantilla: N.exportarPnj(nt.t), reemplazar: true, idAnterior: cambiaId ? idAnterior : null });
  } catch (e) { toast(e.message, 'err'); return; }
  idAnterior = id;
  t.id = id;
  idManual = true;
  sucio = false;
  plantillas = (await pedir('datos/?accion=plantillas')).plantillas || plantillas;
  history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
  toast(`«${nt.t.nombre}» guardado en la partida.`);
  pintar();
}

const LISTAS_NUEVAS = {
  'nuevo-ataque': () => t.ataques.push(N.ataqueNuevo(t)),
  'nuevo-conjuro': () => { const c = N.calcularPnj(t, catalogo); t.conjuros.push({ nombre: 'Conjuro', pm: 10, por_objetivo: false, objetivo: 'Una criatura', duracion: 'Instantánea', ofensivo: true, precision: ['PER', 'VOL'], bonus: c.bonus_magia, dano: null, tipo: null, efecto: '' }); },
  'hab-libre': () => t.habilidades.push({ id: null, opcion: null, nombre: '', efecto: '', nota: '' })
};

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const ds = el.dataset;
  switch (ds.act) {
    case 'tab': tab = ds.id; repintarTab(); document.querySelectorAll('.pestanas button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === tab))); return;
    case 'previa': previa = ds.nivel === 'dj' ? 'dj' : Number(ds.nivel); refrescar(); return;
    case 'guardar': await guardar(); return;
    case 'duplicar': duplicarEstado(); history.replaceState(null, '', '?nuevo'); pintar(); toast('Copia creada. Cámbiale lo que quieras y guárdala.'); return;
    case 'exportar': {
      const nt = normal();
      if (nt.error) { toast(nt.error, 'err'); return; }
      descargarJson(N.exportarPnj(nt.t), `${nt.t.id}.json`);
      return;
    }
    case 'importar': $('importar-json').click(); return;
    case 'bestiario': abrirBestiario(); return;
    case 'cerrar-bestiario': $('bestiario').close(); return;
    case 'elegir-bestiario': elegirBestiario(ds.id); return;
    case 'perfil': {
      const p = N.PERFILES_ATRIBUTOS.find(([id]) => id === ds.id);
      N.ATR.forEach((a, i) => { t.atributos[a] = p[2][i]; });
      marcar(); repintarTab(); return;
    }
    case 'usar': t[ds.k] = libro()[ds.k]; marcar(); repintarTab(); return;
    case 'usar-todo': { const c = libro(); for (const k of ['pv', 'pm', 'iniciativa', 'defensa', 'defensa_magica']) t[k] = c[k]; marcar(); repintarTab(); return; }
    case 'reglas-especie': {
      const esp = N.ESPECIES_INFO[t.especie] || {};
      Object.assign(t.afinidades, esp.afinidades || {});
      t.inmunidades_estados = [...new Set([...t.inmunidades_estados, ...(esp.inmune || [])])];
      marcar(); repintarTab(); toast('Afinidades e inmunidades de especie aplicadas.'); return;
    }
    case 'afinidad': {
      const ciclo = ['', 'VU', 'RS', 'IM', 'AS'];
      const sig = ciclo[(ciclo.indexOf(t.afinidades[ds.k] || '') + 1) % ciclo.length];
      if (sig) t.afinidades[ds.k] = sig; else delete t.afinidades[ds.k];
      marcar(); repintarTab(); return;
    }
    case 'inmunidad': {
      const s = new Set(t.inmunidades_estados);
      if (s.has(ds.id)) s.delete(ds.id); else s.add(ds.id);
      t.inmunidades_estados = [...s];
      marcar(); repintarTab(); return;
    }
    case 'mas-rasgo': t.rasgos.push(''); repintarTab(); return;
    case 'nuevo-ataque': case 'nuevo-conjuro': case 'hab-libre': LISTAS_NUEVAS[ds.act](); marcar(); repintarTab(); return;
    case 'nuevo-texto': t[ds.lista].push({ nombre: '', efecto: '' }); marcar(); repintarTab(); return;
    case 'conjuro-db': {
      const cj = db.col.conjuros.find((x) => x.id === $('conjuro-db').value);
      if (cj) { t.conjuros.push(N.conjuroDesdeDb(cj, t)); marcar(); repintarTab(); toast(`${cj.nombre} añadido.`); }
      return;
    }
    case 'nueva-hab': {
      const d = catalogo.find((x) => x.id === ds.id);
      if (!d) return;
      t.habilidades.push({ id: d.id, opcion: d.opciones ? d.opciones[0].id : null, nombre: d.nombre + (d.opciones ? ` (${d.opciones[0].etiqueta})` : ''), efecto: d.efecto, nota: '' });
      marcar(); repintarTab(); return;
    }
    case 'quitar': t[ds.lista].splice(Number(ds.i), 1); marcar(); repintarTab(); return;
    case 'mover': {
      const l = t[ds.lista]; const i = Number(ds.i); const j = i + Number(ds.dir);
      if (j < 0 || j >= l.length) return;
      [l[i], l[j]] = [l[j], l[i]];
      marcar(); repintarTab(); return;
    }
    case 'aplicar-json': {
      let datos;
      try { datos = JSON.parse($('json-ed').value); paraEditar(datos); } catch (e) { toast(e.message.startsWith('Unexpected') ? 'El JSON no es válido.' : e.message, 'err'); return; }
      const ant = idAnterior;
      t = paraEditar(datos);
      idAnterior = ant;
      marcar(); pintar(); toast('JSON aplicado. Pulsa Guardar para guardarlo en la partida.');
      return;
    }
    default:
  }
});

function leerValor(el) {
  if (el.dataset.tipo === 'bool') return el.checked;
  if (el.dataset.tipo === 'num') return el.value === '' ? null : Number(el.value);
  return el.value;
}

document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.id === 'buscar-bestiario') { filtroBestiario = el.value; pintarBestiario(); return; }
  if (!el.dataset.campo || el.tagName === 'SELECT' || el.type === 'checkbox') return;
  ruta(t, el.dataset.campo, leerValor(el));
  if (el.dataset.campo === 'nombre' && !idManual && !idAnterior) {
    t.id = N.slug(t.nombre);
    const idEl = document.querySelector('[data-id-campo]');
    if (idEl) idEl.value = t.id;
  }
  if (el.dataset.idCampo) idManual = true;
  marcar();
  refrescar();
});

document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.id === 'importar-json' && el.files[0]) {
    try {
      const datos = await leerArchivo(el.files[0]);
      if (sucio && !confirm('¿Sustituir la ficha que estás editando por la del archivo?')) { el.value = ''; return; }
      t = paraEditar(Array.isArray(datos) ? datos[0] : datos);
      idAnterior = plantillas.some((x) => x.id === t.id) && t.id === idAnterior ? idAnterior : null;
      idManual = true; sucio = true;
      pintar();
      toast('Ficha cargada. Pulsa Guardar para guardarla en la partida.');
    } catch (e) { toast(e.message, 'err'); }
    el.value = '';
    return;
  }
  if (!el.dataset.campo || !(el.tagName === 'SELECT' || el.type === 'checkbox')) return;
  let v = leerValor(el);
  if (el.dataset.campo === 'villano' || el.dataset.campo === 'siguiente_fase') v = v || null;
  ruta(t, el.dataset.campo, v);
  if (el.dataset.campo === 'villano' && v) t.puntos_ultima = (N.VILLANOS.find(([k]) => k === v) || [0, 0, 5])[2];
  if (el.dataset.campo === 'rango' && v === 'campeon' && !t.rango_n) t.rango_n = 2;
  const m = el.dataset.campo.match(/^habilidades\.(\d+)\.opcion$/);
  if (m) {
    const h = t.habilidades[Number(m[1])];
    const d = catalogo.find((x) => x.id === h.id);
    const op = d && (d.opciones || []).find((o) => o.id === h.opcion);
    h.nombre = d ? d.nombre + (op ? ` (${op.etiqueta})` : '') : h.nombre;
  }
  marcar();
  if (el.dataset.repinta) repintarTab(); else refrescar();
});

document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); guardar(); }
  if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.act === 'elegir-bestiario') elegirBestiario(ev.target.dataset.id);
});
addEventListener('beforeunload', (ev) => { if (sucio) { ev.preventDefault(); ev.returnValue = ''; } });

iniciar();
