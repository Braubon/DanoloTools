// Página de consulta de los comandos del bot. Se genera a partir de la misma
// definición que se registra en Discord (servidor/comandos.js).
import { COMANDOS, CATEGORIAS, T } from '../../servidor/comandos.js';
import { esc, initTema, normTxt } from './ui.js';

const LS = 'fu-comandos-filtro';
let quien = (() => { try { return localStorage.getItem(LS) || 'todos'; } catch (e) { return 'todos'; } })();
let q = '';

const TIPO = { [T.TEXTO]: 'texto', [T.ENTERO]: 'número', [T.BOOL]: 'sí/no', [T.USUARIO]: '@jugador', [T.ADJUNTO]: 'archivo' };

/** Una entrada por comando o subcomando. */
const entradas = COMANDOS.flatMap((c) => {
  const subs = (c.options || []).filter((o) => o.type === T.SUB);
  if (!subs.length) return [{ id: c.name, nombre: `/${c.name}`, cat: c.categoria, dj: !!c.dj, desc: c.description, ayuda: c.ayuda, ejemplos: c.ejemplos || [], opciones: c.options || [] }];
  return subs.map((s) => ({ id: `${c.name}-${s.name}`, nombre: `/${c.name} ${s.name}`, cat: c.categoria, dj: !!s.dj, desc: s.description, ayuda: s.ayuda, ejemplos: s.ejemplos || [], opciones: s.options || [] }));
});

function uso(e) {
  const ops = e.opciones.map((o) => (o.required ? `<span class="req">${esc(o.name)}</span>` : `<span class="opc">[${esc(o.name)}]</span>`)).join(' ');
  return `${esc(e.nombre)} ${ops}`;
}

function tarjeta(e) {
  const filas = e.opciones.map((o) => {
    const valores = o.choices ? o.choices.map((c) => c.name).join(', ') : (o.autocomplete ? 'sugerencias al escribir' : TIPO[o.type] || '');
    return `<tr><td>${esc(o.name)}${o.required ? '' : ' <span class="faint">(opcional)</span>'}</td><td>${esc(o.description)}${valores ? ` <span class="faint">· ${esc(valores)}</span>` : ''}</td></tr>`;
  }).join('');
  return `<div class="item cmd" id="${esc(e.id)}">
    <div class="fila entre" style="flex-wrap:nowrap;align-items:flex-start"><div class="uso">${uso(e)}</div>${e.dj ? '<span class="chip acento" style="flex:none">Solo DJ</span>' : ''}</div>
    <p>${esc(e.ayuda || e.desc)}</p>
    ${filas ? `<table>${filas}</table>` : ''}
    ${e.ejemplos.length ? `<div class="ej">${e.ejemplos.map((x) => `<code>${esc(x)}</code>`).join('')}</div>` : ''}
  </div>`;
}

function pintar() {
  const t = normTxt(q);
  const visibles = entradas.filter((e) => (quien === 'todos' || (quien === 'dj' ? e.dj : !e.dj))
    && (!t || normTxt(`${e.nombre} ${e.desc} ${e.ayuda} ${e.opciones.map((o) => o.name).join(' ')}`).includes(t)));
  const cats = CATEGORIAS.map((c) => ({ ...c, items: visibles.filter((e) => e.cat === c.id) })).filter((c) => c.items.length);
  document.getElementById('vista').innerHTML = `
    <div class="seccion"><h2 style="font-size:22px">Comandos del bot</h2>
      <p class="muted">Escribe <code>/</code> en el canal de la partida y Discord te sugiere los comandos y sus opciones. Las opciones entre corchetes son opcionales.</p></div>
    <div class="notas">
      <div class="tarjeta"><strong>Tu personaje</strong><p>El DJ te asigna un personaje. Todos tus comandos lo usan sin tener que nombrarlo.</p></div>
      <div class="tarjeta"><strong>Repetir con Puntos Fábula</strong><p>Debajo de cada tirada aparece «Repetir (1 PF)»: gasta un Punto Fábula y vuelve a tirar.</p></div>
      <div class="tarjeta"><strong>Estados alterados</strong><p>Reducen un tamaño los dados de atributo en las tiradas (mínimo d6). Una pifia suma 1 PF automáticamente.</p></div>
    </div>
    <div class="filtros-cmd">
      <div class="segmento">${[['todos', 'Todos'], ['jugador', 'Jugadores'], ['dj', 'DJ']].map(([id, n]) => `<button data-quien="${id}" aria-pressed="${quien === id}">${n}</button>`).join('')}</div>
      <div class="buscador"><input type="search" placeholder="Buscar comando" value="${esc(q)}" id="buscar" aria-label="Buscar comando"></div>
    </div>
    <nav class="indice">${cats.map((c) => `<a class="chip" href="#cat-${c.id}">${esc(c.nombre)}</a>`).join('')}</nav>
    ${cats.map((c) => `<h2 class="cat" id="cat-${c.id}">${esc(c.nombre)}</h2><div class="lista">${c.items.map(tarjeta).join('')}</div>`).join('')
      || '<div class="vacio">Ningún comando coincide con la búsqueda.</div>'}`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-quien]');
  if (!b) return;
  quien = b.dataset.quien;
  try { localStorage.setItem(LS, quien); } catch (err) { /* nada */ }
  pintar();
});
document.addEventListener('input', (e) => {
  if (e.target.id !== 'buscar') return;
  q = e.target.value;
  const pos = e.target.selectionStart;
  pintar();
  const n = document.getElementById('buscar');
  n.focus(); n.setSelectionRange(pos, pos);
});

initTema();
pintar();
