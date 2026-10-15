import './style.css';
import {
  state, WORLD, GW, GH, pushHistory, undo, redo, canUndo, canRedo, sprayDensity, settlementDefined, emptyLayers, paintDistrict, DISTRICTS,
} from './state.js';
import { simplify, chaikin, dist, distPointPolyline, pointInRing, lineToPath, ringsToPath, offset, outerRings } from './geom.js';
import { THEMES, EDITABLE, applyTheme, derive } from './themes.js';
import { generate, applyEdits } from './generate.js';
import { renderMap, PAL } from './render.js';
import { estimate, PERSONS_PER_HOUSEHOLD, M2_PER_HOUSEHOLD, HOMELESS_RATE } from './population.js';
import { randomizeAll } from './randomize.js';
import { citadelRing, snapToShore, portParts, waterShape } from './layers.js';

const $ = (s) => document.querySelector(s);
const svg = $('#svg'), viewG = $('#view'), mapG = $('#map'), overlay = $('#overlay'), densImg = $('#densImg');
densImg.setAttribute('width', WORLD.w); densImg.setAttribute('height', WORLD.h);

// ================= Vista (zoom / desplazamiento) =================
const view = { x: 0, y: 0, k: 1 };
function applyView() { viewG.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`); }
function fit() {
  const r = svg.getBoundingClientRect();
  const k = Math.min(r.width / WORLD.w, r.height / WORLD.h) * 0.96;
  view.k = k; view.x = (r.width - WORLD.w * k) / 2; view.y = (r.height - WORLD.h * k) / 2;
  applyView();
}
function zoomAt(sx, sy, f) {
  const k = Math.max(0.15, Math.min(12, view.k * f));
  const wx = (sx - view.x) / view.k, wy = (sy - view.y) / view.k;
  view.k = k; view.x = sx - wx * k; view.y = sy - wy * k;
  applyView();
}
function toWorld(e) {
  const r = svg.getBoundingClientRect();
  return [(e.clientX - r.left - view.x) / view.k, (e.clientY - r.top - view.y) / view.k];
}
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = svg.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
$('#zoomIn').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.3); };
$('#zoomOut').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1 / 1.3); };
$('#zoomFit').onclick = fit;

// ================= Render =================
let buildings = [];
function densityHash() {
  let h = 2166136261;
  const d = state.density;
  for (let i = 0; i < d.length; i += 3) h = Math.imul(h ^ d[i], 16777619);
  const q = state.districts;
  for (let i = 0; i < q.length; i += 2) h = Math.imul(h ^ (q[i] * 7 + 1), 16777619);
  return h >>> 0;
}
// la separación entre casas se aplica al dibujar: no obliga a regenerar
let gapRaf = 0;
function insetBuildings(list) {
  const g = (state.params.buildingGap || 0) / (state.params.mapScale || 1);
  if (g <= 0) return list;
  const out = [];
  for (const b of list) {
    const r = outerRings(offset([b.ring], -g / 2, 'miter'))[0];
    if (r && r.length >= 3) out.push({ ...b, ring: r });
  }
  return out;
}
const genKey = () => JSON.stringify([state.layers, { ...state.params, buildingGap: 0, roofVar: 0, scaleBar: 0 }]) + densityHash();

let genTimer = null;
function ensureGen(cb) {
  if (state.step < 2) return cb && cb();
  const key = genKey();
  if (state.gen && state.gen.key === key) return cb && cb();
  $('#busy').classList.add('on');
  clearTimeout(genTimer);
  genTimer = setTimeout(() => {
    const t0 = performance.now();
    try {
      state.gen = generate();
      state.gen.key = key;
    } catch (err) {
      console.error(err);
      state.gen = null;
    }
    console.log('generación', Math.round(performance.now() - t0), 'ms');
    $('#busy').classList.remove('on');
    refresh();
    cb && cb();
  }, 30);
}

function refresh() {
  const showGen = state.step >= 2 && !!state.gen && state.gen.key === genKey();
  buildings = showGen ? insetBuildings(applyEdits(state.gen, state.edits)) : [];
  mapG.innerHTML = renderMap({ gen: state.gen, buildings, showGen });
  updateDensityImage();
  updateDistrictImage();
  updateStats(showGen);
  $('#undo').disabled = !canUndo();
  $('#redo').disabled = !canRedo();
  if (state.step >= 2 && !showGen) ensureGen();
  drawOverlay();
}

// imagen de densidad (aerógrafo)
const dcan = document.createElement('canvas');
dcan.width = GW; dcan.height = GH;
const dctx = dcan.getContext('2d');
const dimg = dctx.createImageData(GW, GH);
function updateDensityImage() {
  const show = state.step === 1 && state.opts.showDensity && state.tool !== 'district';
  densImg.style.display = show ? '' : 'none';
  if (!show) return;
  const d = state.density, px = dimg.data;
  for (let i = 0; i < d.length; i++) {
    px[i * 4] = 190; px[i * 4 + 1] = 86; px[i * 4 + 2] = 50;
    px[i * 4 + 3] = d[i] * 0.55;
  }
  dctx.putImageData(dimg, 0, 0);
  densImg.setAttribute('href', dcan.toDataURL());
}
const qcan = document.createElement('canvas');
qcan.width = GW; qcan.height = GH;
const qctx = qcan.getContext('2d');
const qimg = qctx.createImageData(GW, GH);
const distImg = $('#distImg');
distImg.setAttribute('width', WORLD.w); distImg.setAttribute('height', WORLD.h);
function updateDistrictImage() {
  const show = state.step === 1 && (state.opts.showDistricts || state.tool === 'district');
  distImg.style.display = show ? '' : 'none';
  if (!show) return;
  const d = state.districts, px = qimg.data;
  for (let i = 0; i < d.length; i++) {
    const t = DISTRICTS[d[i]];
    if (!t) { px[i * 4 + 3] = 0; continue; }
    px[i * 4] = t.color[0]; px[i * 4 + 1] = t.color[1]; px[i * 4 + 2] = t.color[2]; px[i * 4 + 3] = 95;
  }
  qctx.putImageData(qimg, 0, 0);
  distImg.setAttribute('href', qcan.toDataURL());
}

function updateStats(showGen) {
  const el = $('#stats');
  if (!showGen) { el.innerHTML = ''; return; }
  const s = estimate(buildings);
  const fmt = (n) => n.toLocaleString('es-ES');
  const tip = `Estimación: cada edificio aloja ⌈superficie × plantas ÷ ${M2_PER_HOUSEHOLD} m²⌉ hogares de ${String(PERSONS_PER_HOUSEHOLD).replace('.', ',')} personas (1–2,2 plantas según densidad); edificios > 400 m² cuentan como públicos; granjas = 6 personas. Se suma un ${HOMELESS_RATE * 100} % de población sin hogar fijo.`;
  el.innerHTML = `
    <div class="stat"><b>${fmt(s.buildings)}</b><span>Edificios</span></div>
    <div class="stat"><b>${fmt(Math.round(s.households))}</b><span>Hogares</span></div>
    <div class="stat" title="${tip}"><b>~${fmt(s.total)}</b><span class="info">Habitantes</span></div>
    <div class="stat" title="${tip}"><b>~${fmt(s.homeless)}</b><span class="info">Sin hogar</span></div>`;
}

// ================= Herramientas =================
const ICONS = {
  water: '<path d="M3 8c2-2 4 2 6 0s4 2 6 0 3 1 4 0M3 13c2-2 4 2 6 0s4 2 6 0 3 1 4 0"/>',
  cliff: '<path d="M3 17l5-9 4 5 3-4 5 8z"/><path d="M8 8v3M12 13v2M15 9v3"/>',
  road: '<path d="M7 20L10 3M17 20L14 3M12 17v2M12 11v2M12 5v2"/>',
  forest: '<circle cx="8" cy="9" r="4"/><circle cx="15" cy="12" r="4"/><circle cx="9" cy="16" r="3"/>',
  wall: '<path d="M4 18V9h3v2h3V9h4v2h3V9h3v9z"/>',
  settle: '<circle cx="12" cy="12" r="7" stroke-dasharray="2 2"/><circle cx="12" cy="12" r="3"/>',
  citadel: '<path d="M5 19V8l3 2V6l4 3 4-3v4l3-2v11z"/>',
  erase: '<path d="M4 15l8-8 6 6-5 5H8zM10 19h10"/>',
  port: '<path d="M12 5v15M8.5 9h7M5 13.5a7 7 0 0014 0"/><circle cx="12" cy="3.8" r="1.6"/>',
  soil: '<path d="M3 17c3-1 5-1 9 0s6 1 9 0"/><path d="M5 13l1-2M9 12.5V10M13 13l-1-2M16 12l1-2"/><circle cx="8" cy="7" r="0.6"/><circle cx="14" cy="6" r="0.6"/>',
  district: '<path d="M3 4h8v7H3zM13 4h8v4h-8zM13 10h8v10h-8zM3 13h8v7H3z"/>',
  select: '<path d="M6 3l12 9-5.6 1.3L15.5 20l-2.6 1.1-3-6.4L6 18.2z"/>',
  hand: '<path d="M8 12V6a1.5 1.5 0 013 0v5V4.5a1.5 1.5 0 013 0V11V6a1.5 1.5 0 013 0v8a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2.5-4a1.4 1.4 0 012.3-1.6L8 13"/>',
  merge: '<rect x="3" y="6" width="8" height="8"/><rect x="11" y="10" width="9" height="8"/>',
  delb: '<rect x="5" y="7" width="12" height="11"/><path d="M8 4h6M3 7h16"/>',
  path: '<path d="M4 20c4-2 4-8 8-9s5-5 8-7"/>',
  pathx: '<path d="M4 20c4-2 4-8 8-9"/><path d="M15 5l5 5M20 5l-5 5"/>',
};
const TOOLS1 = [
  ['select', 'Seleccionar'], ['water', 'Agua'], ['cliff', 'Riscos'], ['road', 'Caminos'], ['forest', 'Bosque'], ['wall', 'Muralla'],
  ['settle', 'Asentam.'], ['citadel', 'Ciudadela'], ['port', 'Puerto'], ['soil', 'Suelos'], ['district', 'Barrios'], ['erase', 'Borrar'],
];
const TOOLS3 = [['select', 'Seleccionar'], ['merge', 'Unir'], ['delb', 'Borrar edif.'], ['path', 'Camino'], ['pathx', 'Borrar cam.'], ['hand', 'Mover']];
const HINTS = {
  water: () => state.opts.waterMode === 'river'
    ? 'Río · clic: punto recto · arrastrar: curva · doble clic / Intro: terminar · Esc: cancelar'
    : 'Lago · arrastra para pintar' + (state.opts.lakeErase ? ' (borrando)' : ''),
  cliff: () => 'Área de elevación · clic / arrastrar · doble clic para cerrar el área',
  road: () => 'Camino principal · clic: recta · arrastrar: curva · doble clic: terminar',
  forest: () => 'Bosque · arrastra para pintar' + (state.opts.forestErase ? ' (borrando)' : ''),
  wall: () => 'Muralla · clic / arrastrar · doble clic para cerrar el recinto',
  settle: () => 'Aerógrafo de asentamiento · mantén pulsado para aumentar la densidad' + (state.opts.densErase ? ' (borrador)' : ''),
  citadel: () => 'Clic para colocar una ciudadela',
  soil: () => ({ sand: 'Playa o arenal', marsh: 'Pantano', crops: 'Cultivos (fuerza granjas aquí)' })[state.opts.soilMode] + ' · arrastra para pintar' + (state.opts.soilErase ? ' (borrando)' : ''),
  district: () => (state.opts.districtErase ? 'Borrando barrios' : 'Barrio ' + DISTRICTS[state.opts.districtType].name.toLowerCase()) + ' · arrastra para pintar la zona',
  port: () => 'Clic junto a la orilla para colocar un puerto: se pega a la costa y los muelles entran en el agua',
  select: () => sel
    ? 'Arrastra un punto para moverlo · arrastra la forma para desplazarla · doble clic en el trazo: añadir punto · Alt + clic en un punto: quitarlo · Supr: eliminar'
    : (state.step === 3 ? 'Clic sobre un camino dibujado en este paso para seleccionarlo' : 'Clic sobre un elemento para seleccionarlo y editarlo'),
  erase: () => 'Clic sobre un trazo (río, lago, camino, muralla, risco, bosque o ciudadela) para eliminarlo',
  hand: () => 'Arrastra para desplazar · rueda para hacer zoom · también: espacio + arrastrar',
  merge: () => 'Clic en un edificio y luego en los contiguos para unirlos · Esc: soltar',
  delb: () => 'Clic en un edificio para borrarlo',
  path: () => 'Nuevo camino · clic / arrastrar · doble clic para terminar (recorta edificios)',
  pathx: () => 'Clic sobre un camino dibujado en este paso para eliminarlo',
};

function toolButtons(list) {
  return `<div class="tools">${list.map(([id, label]) =>
    `<button class="tool ${state.tool === id ? 'active' : ''}" data-tool="${id}"><svg viewBox="0 0 24 24">${ICONS[id]}</svg>${label}</button>`).join('')}</div>`;
}
const slider = (key, label, min, max, step, unit = '', obj = 'opts') => {
  const v = state[obj][key];
  return `<label class="slider"><div class="top"><span>${label}</span><span id="o-${key}">${fmtVal(v, unit)}</span></div>
  <input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-key="${key}" data-obj="${obj}" data-unit="${unit}"></label>`;
};
// Las medidas de dibujo ('dm') se muestran en metros reales según la escala del mapa
const fmtVal = (v, u) => {
  const S = state.params.mapScale || 1;
  if (u === '%') return Math.round(v * 100) + ' %';
  if (u === 'scale') return `${Math.round(WORLD.w * v).toLocaleString('es-ES')} × ${Math.round(WORLD.h * v).toLocaleString('es-ES')} m`;
  if (u === 'dm') { const m = v * S; return (m < 10 ? m.toFixed(1).replace('.', ',') : Math.round(m).toLocaleString('es-ES')) + ' m'; }
  return (Math.round(v * 100) / 100).toLocaleString('es-ES') + (u ? ' ' + u : '');
};
const scaleSection = () => `<section><h2>Escala del mapa</h2>
  ${slider('mapScale', 'Tamaño real del mapa', 0.4, 4, 0.1, 'scale', 'params')}
  <p>Cambia cuántos metros representa lo que has dibujado, sin mover el terreno. Mayor tamaño → ríos y caminos más anchos en metros, casas más pequeñas en proporción y un asentamiento más denso.</p></section>`;
const pcheck = (key, label, on) => `<label class="check"><input type="checkbox" data-pcheck="${key}" ${on ? 'checked' : ''}> ${label}</label>`;
const check = (key, label) => `<label class="check"><input type="checkbox" data-check="${key}" ${state.opts[key] ? 'checked' : ''}> ${label}</label>`;

function toolOptions() {
  const t = state.tool, o = state.opts;
  switch (t) {
    case 'water':
      return `<div class="seg"><button data-wm="river" class="${o.waterMode === 'river' ? 'active' : ''}">Río</button><button data-wm="lake" class="${o.waterMode === 'lake' ? 'active' : ''}">Lago / mar</button></div>` +
        (o.waterMode === 'river' ? slider('riverWidth', 'Anchura del río', 4, 80, 1, 'dm') : slider('brushR', 'Radio del pincel', 6, 150, 1, 'dm') + check('lakeErase', 'Modo borrador'));
    case 'road': return slider('roadWidth', 'Anchura', 2, 20, 0.5, 'dm');
    case 'forest': return slider('brushR', 'Radio del pincel', 6, 150, 1, 'dm') + check('forestErase', 'Modo borrador');
    case 'settle': return slider('brushR', 'Radio', 10, 200, 1, 'dm') + slider('densStrength', 'Intensidad', 0.05, 1, 0.05, '%') + check('densErase', 'Borrador') + check('showDensity', 'Mostrar densidad');
    case 'citadel': return slider('citadelR', 'Radio', 10, 80, 1, 'dm');
    case 'soil': return `<div class="seg">${[['sand', 'Playa'], ['marsh', 'Pantano'], ['crops', 'Cultivos']].map(([k, l]) => `<button data-soil="${k}" class="${o.soilMode === k ? 'active' : ''}">${l}</button>`).join('')}</div>` +
      slider('brushR', 'Radio del pincel', 6, 150, 1, 'dm') + check('soilErase', 'Modo borrador') +
      '<p>Playas y pantanos no se edifican. En los cultivos siempre se generan granjas.</p>';
    case 'district': return `<div class="dist-grid">${DISTRICTS.slice(1).map(t => `<button data-dist="${t.id}" class="${o.districtType === t.id && !o.districtErase ? 'active' : ''}"><i style="background:rgb(${t.color.join(',')})"></i>${t.name}</button>`).join('')}</div>` +
      slider('brushR', 'Radio', 10, 200, 1, 'dm') + check('districtErase', 'Borrador') + check('showDistricts', 'Mostrar barrios') +
      '<p><b>Rico:</b> parcelas grandes, jardines y tejados nobles. <b>Pobre:</b> casas pequeñas y apiñadas. <b>Mercantil:</b> almacenes grandes. <b>Religioso:</b> patios y prioridad para el templo.</p>';
    case 'port': return slider('portW', 'Anchura del muelle', 15, 250, 1, 'dm') + slider('portLen', 'Longitud de los embarcaderos', 4, 120, 1, 'dm') + slider('portN', 'Embarcaderos', 0, 12, 1, '') + '<p>Se coloca en el punto de la orilla más cercano al clic. Después puedes moverlo por la costa con Seleccionar.</p>';
    case 'cliff': return '<p>Las zonas encerradas quedan elevadas. Los trazos perpendiculares apuntan hacia la parte baja.</p>';
    case 'wall': return '<p>Dentro de la muralla se genera la ciudad; fuera, granjas y huertas. Varios recintos se funden en uno.</p>';
    case 'erase': return '<p>Elimina el trazo completo más cercano al cursor.</p>';
    case 'select': return selectionPanel();
    case 'path': return slider('userRoadWidth', 'Anchura', 1, 14, 0.5, 'dm');
    default: return '';
  }
}

function renderPanel() {
  const p = $('#panel');
  document.querySelectorAll('#steps button').forEach(b => b.classList.toggle('active', +b.dataset.step === state.step));
  let h = '';
  if (state.step === 1) {
    h += `<section><h2>Terreno</h2>${toolButtons(TOOLS1)}</section>`;
    const opt = toolOptions();
    if (opt) h += `<section><h2>${state.tool === 'select' ? 'Selección' : 'Opciones'}</h2>${opt}</section>`;
    h += scaleSection();
    h += `<section class="grow"><div class="keys"><kbd>Ctrl Z</kbd> deshacer · <kbd>Esc</kbd> cancelar · <kbd>⌫</kbd> quitar punto<br><kbd>Espacio</kbd> o botón derecho + arrastrar: mover · rueda: zoom</div>
      <button class="ghost btn-block" id="clearAll" style="margin-top:12px">Vaciar mapa</button></section>`;
    const ok = settlementDefined();
    if (!ok) h += `<div class="warn">Delimita el área edificable con una <b>muralla</b> o pintando con el <b>aerógrafo de asentamiento</b> para continuar.</div>`;
    h += `<div class="nav"><button class="primary" id="next" ${ok ? '' : 'disabled'}>Generar asentamiento →</button></div>`;
  } else if (state.step === 2) {
    h += scaleSection();
    h += `<section><h2>Manzanas</h2>
      ${slider('blockSize', 'Tamaño de celda', 24, 90, 1, 'm', 'params')}
      ${slider('lotSize', 'Superficie de parcela', 40, 220, 5, 'm²', 'params')}
      ${slider('streetWidth', 'Anchura de calles', 2, 9, 0.5, 'm', 'params')}
      ${slider('buildingGap', 'Separación entre casas', 0, 4, 0.1, 'm', 'params')}
      ${slider('roofVar', 'Variación de tejados', 0, 1, 0.05, '%', 'params')}
      <button class="ghost btn-block" id="reseed">Nueva semilla aleatoria</button>
      <div class="seed">Semilla ${state.params.seed}</div></section>
      <section><h2>Detalles</h2>
      ${slider('plazas', 'Plazas', 0, 8, 1, '', 'params')}
      ${slider('trees', 'Árboles', 0, 1, 0.05, '%', 'params')}
      ${slider('farmRing', 'Anillo de granjas', 0, 450, 10, 'm', 'params')}
      ${pcheck('lanes', 'Sendas entre granjas y caminos a los puertos', state.params.lanes !== false)}
      ${pcheck('scaleBar', 'Escala gráfica', state.params.scaleBar !== false)}</section>
      <section><h2>Edificios singulares</h2>
      ${[['temple', 'Templo o catedral'], ['hall', 'Ayuntamiento'], ['market', 'Mercado cubierto'], ['barracks', 'Cuarteles'], ['mills', 'Molinos de agua y viento']].map(([k, l]) => pcheck('sp.' + k, l, (state.params.specials || {})[k] !== false)).join('')}</section>
      <section class="grow"><p>Celdas más pequeñas → asentamiento más denso. La densidad pintada con el aerógrafo modula el tamaño de manzana, la profundidad de las parcelas y los huecos entre casas.</p></section>
      <div class="nav"><button class="ghost" id="prev">← Terreno</button><button class="primary" id="next">Editar →</button></div>`;
  } else {
    h += `<section><h2>Edición</h2>${toolButtons(TOOLS3)}</section>`;
    const opt = toolOptions();
    if (opt) h += `<section><h2>${state.tool === 'select' ? 'Selección' : 'Opciones'}</h2>${opt}</section>`;
    h += `<section class="grow"><button class="ghost btn-block" id="resetEdits">Descartar ediciones</button></section>
      <div class="nav"><button class="ghost" id="prev">← Generación</button></div>`;
  }
  p.innerHTML = h;
  $('#hint').textContent = HINTS[state.tool] ? HINTS[state.tool]() : '';
  bindPanel();
}

function bindPanel() {
  document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  document.querySelectorAll('[data-soil]').forEach(b => b.onclick = () => { state.opts.soilMode = b.dataset.soil; renderPanel(); });
  document.querySelectorAll('[data-dist]').forEach(b => b.onclick = () => { state.opts.districtType = +b.dataset.dist; state.opts.districtErase = false; renderPanel(); refresh(); });
  document.querySelectorAll('[data-pcheck]').forEach(c => c.onchange = () => {
    pushHistory();
    const k = c.dataset.pcheck;
    if (k.startsWith('sp.')) state.params.specials = { ...(state.params.specials || {}), [k.slice(3)]: c.checked };
    else state.params[k] = c.checked;
    if (k !== 'scaleBar') state.edits = { merges: [], deleted: [], roads: [] };
    refresh();
  });
  document.querySelectorAll('[data-wm]').forEach(b => b.onclick = () => { state.opts.waterMode = b.dataset.wm; cancelTool(); renderPanel(); });
  document.querySelectorAll('[data-check]').forEach(c => c.onchange = () => { state.opts[c.dataset.check] = c.checked; renderPanel(); refresh(); });
  document.querySelectorAll('input[type=range]').forEach(inp => {
    const key = inp.dataset.key, obj = inp.dataset.obj, unit = inp.dataset.unit;
    inp.oninput = () => {
      $('#o-' + key).textContent = fmtVal(+inp.value, unit);
      if (obj === 'opts') { state.opts[key] = +inp.value; drawOverlay(); }
      if (key === 'buildingGap' || key === 'roofVar') { state.params[key] = +inp.value; cancelAnimationFrame(gapRaf); gapRaf = requestAnimationFrame(refresh); }
    };
    inp.onchange = () => {
      if (obj === 'params' && (key === 'buildingGap' || key === 'roofVar')) {
        pushHistory(); state.params[key] = +inp.value; refresh(); return;
      }
      if (obj === 'params') {
        pushHistory();
        state.params[key] = +inp.value;
        state.edits = { merges: [], deleted: [], roads: [] };
        if (key === 'mapScale') renderPanel();
        refresh();
      }
    };
  });
  bindSelection();
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('next', () => goStep(state.step + 1));
  on('prev', () => goStep(state.step - 1));
  on('reseed', () => {
    pushHistory();
    state.params.seed = (Math.random() * 1e9) | 0;
    state.edits = { merges: [], deleted: [], roads: [] };
    renderPanel(); ensureGen();
  });
  on('clearAll', () => {
    pushHistory();
    state.layers = emptyLayers(); state.density.fill(0); state.districts.fill(0);
    state.edits = { merges: [], deleted: [], roads: [] };
    renderPanel(); refresh();
  });
  on('resetEdits', () => { pushHistory(); state.edits = { merges: [], deleted: [], roads: [] }; refresh(); });
}

function goStep(n) {
  if (n >= 2 && !settlementDefined()) { n = 1; }
  cancelTool();
  state.step = n;
  if (n === 1 && !TOOLS1.some(t => t[0] === state.tool)) state.tool = 'road';
  if (n === 3 && (state.tool === 'hand' || !TOOLS3.some(t => t[0] === state.tool))) state.tool = 'merge';
  if (n === 2) state.tool = 'hand';
  renderPanel();
  refresh();
}
document.querySelectorAll('#steps button').forEach(b => b.onclick = () => goStep(+b.dataset.step));

function setTool(t) { cancelTool(); state.tool = t; renderPanel(); drawOverlay(); }

// ================= Interacción con el puntero =================
let poly = null;       // dibujo de polilínea en curso {pts, raw, down, dragging}
let brush = null;      // trazo de pincel en curso
let spray = null;      // aerógrafo
let pan = null;
let spaceDown = false;
let cursor = null;
let selected = null;   // edificio seleccionado para unir
let hover = null;
let lastDown = null;
let districtPainting = false;
let sel = null;        // elemento del terreno seleccionado {layer, i}
let drag = null;       // arrastre de vértice o de forma

const isPolyTool = () => ['cliff', 'road', 'wall', 'path'].includes(state.tool) || (state.tool === 'water' && state.opts.waterMode === 'river');
const isBrushTool = () => state.tool === 'forest' || state.tool === 'soil' || (state.tool === 'water' && state.opts.waterMode === 'lake');
const closedTool = () => state.tool === 'cliff' || state.tool === 'wall';

function cancelTool() { poly = null; brush = null; spray = null; selected = null; sel = null; drag = null; drawOverlay(); }

svg.addEventListener('pointerdown', (e) => {
  svg.setPointerCapture(e.pointerId);
  const w = toWorld(e);
  if (e.button === 1 || e.button === 2 || spaceDown || state.tool === 'hand' || state.step === 2) {
    pan = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    svg.style.cursor = 'grabbing';
    return;
  }
  if (e.button !== 0) return;
  if (isPolyTool()) {
    const now = performance.now();
    if (poly && lastDown && now - lastDown.t < 380 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 7) {
      lastDown = null; finishPoly(); return;
    }
    lastDown = { t: now, x: e.clientX, y: e.clientY };
    if (!poly) poly = { pts: [], raw: null, down: null, dragging: false };
    poly.down = { w, sx: e.clientX, sy: e.clientY };
    poly.raw = [w];
  } else if (isBrushTool()) {
    brush = { pts: [w] };
  } else if (state.tool === 'select') {
    selectDown(w, e);
  } else if (state.tool === 'district') {
    pushHistory();
    paintDistrict(w[0], w[1], state.opts.brushR, state.opts.districtErase ? 0 : state.opts.districtType);
    districtPainting = true; updateDistrictImage();
  } else if (state.tool === 'settle') {
    pushHistory();
    spray = { w, last: performance.now() };
    sprayTick();
  } else clickTool(w);
  drawOverlay();
});
svg.addEventListener('pointermove', (e) => {
  const w = toWorld(e);
  cursor = w;
  if (pan) {
    view.x = pan.vx + e.clientX - pan.sx; view.y = pan.vy + e.clientY - pan.sy;
    applyView();
    return;
  }
  if (poly && poly.down) {
    if (!poly.dragging && Math.hypot(e.clientX - poly.down.sx, e.clientY - poly.down.sy) > 5) poly.dragging = true;
    if (poly.dragging) poly.raw.push(w);
  }
  if (brush) brush.pts.push(w);
  if (spray) spray.w = w;
  if (districtPainting) { paintDistrict(w[0], w[1], state.opts.brushR, state.opts.districtErase ? 0 : state.opts.districtType); updateDistrictImage(); }
  if (drag) { selectMove(w, e); return; }
  if (state.tool === 'select') hover = hitTest(w);
  if (['erase', 'merge', 'delb', 'pathx'].includes(state.tool)) hover = hitTest(w);
  drawOverlay();
});
svg.addEventListener('pointerup', (e) => {
  if (pan) { pan = null; svg.style.cursor = ''; return; }
  if (drag) { const moved = drag.moved; drag = null; if (moved) { renderPanel(); refresh(); } return; }
  if (poly && poly.down) {
    if (poly.dragging) {
      const eps = 2.2 / view.k;
      let fr = chaikin(simplify(poly.raw, eps), 2);
      poly.pts.push(...(poly.pts.length ? fr.slice(1) : fr));
      if (poly.pts.length && poly.pts.length === fr.length) {} // primer tramo
    } else {
      poly.pts.push(poly.down.w);
    }
    poly.down = null; poly.dragging = false; poly.raw = null;
  }
  if (brush) {
    const pts = simplify(brush.pts, 1.5 / view.k);
    commitBrush(pts.length ? pts : [brush.pts[0]]);
    brush = null;
  }
  if (spray) { spray = null; renderPanel(); refresh(); }
  if (districtPainting) { districtPainting = false; refresh(); }
  drawOverlay();
});
svg.addEventListener('dblclick', (e) => { e.preventDefault(); if (state.tool === 'select') insertVertex(toWorld(e)); else finishPoly(); });
svg.addEventListener('contextmenu', (e) => e.preventDefault());
svg.addEventListener('pointerleave', () => { cursor = null; hover = null; drawOverlay(); });

function sprayTick() {
  if (!spray) return;
  const now = performance.now();
  const dt = Math.min(60, now - spray.last); spray.last = now;
  sprayDensity(spray.w[0], spray.w[1], state.opts.brushR, state.opts.densStrength * dt * 0.004, state.opts.densErase);
  updateDensityImage();
  requestAnimationFrame(sprayTick);
}

function finishPoly() {
  if (!poly) return;
  const pts = [];
  for (const p of poly.pts) if (!pts.length || dist(pts[pts.length - 1], p) > 0.8) pts.push(p);
  const closed = closedTool();
  poly = null;
  if (pts.length < (closed ? 3 : 2)) { drawOverlay(); return; }
  pushHistory();
  const L = state.layers;
  switch (state.tool) {
    case 'water': L.rivers.push({ pts, width: state.opts.riverWidth }); break;
    case 'road': L.roads.push({ pts, width: state.opts.roadWidth }); break;
    case 'cliff': L.cliffs.push({ pts }); break;
    case 'wall': L.walls.push({ pts }); break;
    case 'path': state.edits.roads.push({ pts, width: state.opts.userRoadWidth }); break;
  }
  renderPanel(); refresh();
}
function commitBrush(pts) {
  pushHistory();
  if (state.tool === 'forest') state.layers.forest.push({ pts, r: state.opts.brushR, mode: state.opts.forestErase ? 'sub' : 'add' });
  else if (state.tool === 'soil') {
    const k = state.opts.soilMode;
    (state.layers[k] = state.layers[k] || []).push({ pts, r: state.opts.brushR, mode: state.opts.soilErase ? 'sub' : 'add' });
  }
  else state.layers.lakes.push({ pts, r: state.opts.brushR, mode: state.opts.lakeErase ? 'sub' : 'add' });
  refresh();
}

// ---- pruebas de selección ----
function hitTest(w) {
  const t = state.tool, L = state.layers;
  const tol = 6 / view.k + 2;
  if (t === 'select') {
    if (state.step === 3) {
      let best = null, bd = Infinity;
      state.edits.roads.forEach((r, i) => { const d = distPointPolyline(w, r.pts) - r.width / 2; if (d < tol && d < bd) { bd = d; best = { layer: 'eroads', i }; } });
      return best;
    }
    return hitLayers(w, tol, true);
  }
  if (t === 'erase') return hitLayers(w, tol, false);
  if (t === 'merge' || t === 'delb') {
    for (const b of buildings) if (pointInRing(w, b.ring)) return b;
    return null;
  }
  if (t === 'pathx') {
    let best = null, bd = Infinity;
    state.edits.roads.forEach((r, i) => { const d = distPointPolyline(w, r.pts) - r.width / 2; if (d < tol && d < bd) { bd = d; best = i; } });
    return best;
  }
  return null;
}

function hitLayers(w, tol, includeSub) {
  const L = state.layers;
  let best = null, bd = Infinity;
  const consider = (layer, i, d) => { if (d < bd) { bd = d; best = { layer, i }; } };
  L.rivers.forEach((r, i) => { const d = distPointPolyline(w, r.pts) - r.width / 2; if (d < tol) consider('rivers', i, d); });
  L.roads.forEach((r, i) => { const d = distPointPolyline(w, r.pts) - r.width / 2; if (d < tol) consider('roads', i, d); });
  L.walls.forEach((r, i) => { const d = distPointPolyline(w, r.pts, true); if (d < tol) consider('walls', i, d); });
  L.cliffs.forEach((r, i) => { const d = pointInRing(w, r.pts) ? 1 : distPointPolyline(w, r.pts, true); if (d < tol) consider('cliffs', i, d + 0.5); });
  L.lakes.forEach((r, i) => { const d = distPointPolyline(w, r.pts) - r.r; if (d < tol && (includeSub || r.mode === 'add')) consider('lakes', i, d + 1); });
  L.forest.forEach((r, i) => { const d = distPointPolyline(w, r.pts) - r.r; if (d < tol && (includeSub || r.mode === 'add')) consider('forest', i, d + 1); });
  for (const k of ['sand', 'marsh', 'crops']) (L[k] || []).forEach((r, i) => { const d = distPointPolyline(w, r.pts) - r.r; if (d < tol && (includeSub || r.mode === 'add')) consider(k, i, d + 1.2); });
  L.citadels.forEach((c, i) => { const d = Math.hypot(w[0] - c.x, w[1] - c.y) - c.r; if (d < tol) consider('citadels', i, d); });
  (L.ports || []).forEach((pt, i) => {
    const dx = w[0] - pt.x, dy = w[1] - pt.y, c = Math.cos(pt.ang), s2 = Math.sin(pt.ang);
    const v = dx * c + dy * s2, u = -dx * s2 + dy * c;
    if (Math.abs(u) < pt.w / 2 + tol && v > -6 - tol && v < pt.len + 10 + tol) consider('ports', i, 0.2);
  });
  return best;
}

// ================= Selección y edición de elementos =================
const SEL_NAMES = { rivers: 'Río', roads: 'Camino principal', walls: 'Muralla', cliffs: 'Risco', lakes: 'Lago / mar', forest: 'Bosque', citadels: 'Ciudadela', ports: 'Puerto', eroads: 'Camino', sand: 'Playa', marsh: 'Pantano', crops: 'Cultivos' };
const CLOSED_LAYERS = ['walls', 'cliffs'];
function getItem(s0) {
  if (!s0) return null;
  const arr = s0.layer === 'eroads' ? state.edits.roads : state.layers[s0.layer];
  return arr ? arr[s0.i] || null : null;
}
function selArray() { return sel.layer === 'eroads' ? state.edits.roads : state.layers[sel.layer]; }

const propSlider = (prop, label, min, max, step, v, unit = 'dm') =>
  `<label class="slider"><div class="top"><span>${label}</span><span id="p-${prop}">${fmtVal(v, unit)}</span></div>
  <input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-prop="${prop}" data-unit="${unit}"></label>`;

function selectionPanel() {
  const it = getItem(sel);
  if (!it) {
    sel = null;
    return `<p>${state.step === 3 ? 'Haz clic sobre un camino dibujado en este paso.' : 'Haz clic sobre un río, camino, muralla, risco, lago, bosque o ciudadela para editarlo.'}</p>`;
  }
  let h = `<div class="selname">${SEL_NAMES[sel.layer]}${it.pts ? `<span>${it.pts.length} puntos</span>` : ''}</div>`;
  if (sel.layer === 'rivers') h += propSlider('width', 'Anchura', 2, 120, 0.5, it.width);
  if (sel.layer === 'roads') h += propSlider('width', 'Anchura', 1, 30, 0.5, it.width);
  if (sel.layer === 'eroads') h += propSlider('width', 'Anchura', 1, 14, 0.5, it.width);
  if (['lakes', 'forest', 'sand', 'marsh', 'crops'].includes(sel.layer)) {
    h += propSlider('r', 'Radio del trazo', 3, 200, 1, it.r);
    h += `<div class="seg"><button data-mode="add" class="${it.mode !== 'sub' ? 'active' : ''}">Añade</button><button data-mode="sub" class="${it.mode === 'sub' ? 'active' : ''}">Borra</button></div>`;
  }
  if (sel.layer === 'citadels') h += propSlider('r', 'Radio', 8, 120, 1, it.r);
  if (sel.layer === 'ports') {
    h += propSlider('w', 'Anchura del muelle', 15, 250, 1, it.w);
    h += propSlider('len', 'Longitud de los embarcaderos', 4, 120, 1, it.len);
    h += propSlider('n', 'Embarcaderos', 0, 12, 1, it.n, '');
  }
  h += '<div class="btn-row">';
  if (it.pts && it.pts.length > 2) h += '<button class="ghost" id="selSmooth">Suavizar</button><button class="ghost" id="selSimplify">Simplificar</button>';
  h += '<button class="ghost" id="selDup">Duplicar</button><button class="ghost danger" id="selDel">Eliminar</button></div>';
  h += '<p class="small">Arrastra los puntos o la forma en el mapa. Doble clic en el trazo añade un punto; Alt + clic sobre un punto lo quita.</p>';
  return h;
}

let propEditing = false, propRaf = 0;
function bindSelection() {
  document.querySelectorAll('[data-prop]').forEach(inp => {
    const prop = inp.dataset.prop;
    inp.oninput = () => {
      const it = getItem(sel); if (!it) return;
      if (!propEditing) { pushHistory(); propEditing = true; }
      it[prop] = +inp.value;
      $('#p-' + prop).textContent = fmtVal(+inp.value, inp.dataset.unit);
      drawOverlay();
      cancelAnimationFrame(propRaf);
      propRaf = requestAnimationFrame(refresh);
    };
    inp.onchange = () => { propEditing = false; refresh(); };
  });
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    const it = getItem(sel); if (!it) return;
    pushHistory(); it.mode = b.dataset.mode; renderPanel(); refresh();
  });
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('selDel', deleteSelected);
  on('selDup', () => {
    const it = getItem(sel); if (!it) return;
    pushHistory();
    const c = structuredClone(it);
    const d = 20 / view.k;
    if (c.pts) c.pts = c.pts.map(p => [p[0] + d, p[1] + d]); else { c.x += d; c.y += d; }
    if (sel.layer === 'ports') snapPort(c, 1e9);
    const arr = selArray(); arr.push(c); sel = { layer: sel.layer, i: arr.length - 1 };
    renderPanel(); refresh();
  });
  on('selSmooth', () => {
    const it = getItem(sel); if (!it?.pts) return;
    pushHistory();
    const closed = CLOSED_LAYERS.includes(sel.layer);
    it.pts = simplifyPts(chaikin(it.pts, 1, closed), 0.4, closed);
    renderPanel(); refresh();
  });
  on('selSimplify', () => {
    const it = getItem(sel); if (!it?.pts) return;
    pushHistory();
    const closed = CLOSED_LAYERS.includes(sel.layer);
    const before = it.pts.length;
    let eps = 1.5;
    let r = simplifyPts(it.pts, eps, closed);
    while (r.length > Math.max(closed ? 3 : 2, before * 0.6) && eps < 40) { eps *= 1.6; r = simplifyPts(it.pts, eps, closed); }
    it.pts = r;
    renderPanel(); refresh();
  });
}
function simplifyPts(pts, eps, closed) {
  if (!closed) return simplify(pts, eps);
  const r = simplify([...pts, pts[0]], eps).slice(0, -1);
  return r.length >= 3 ? r : pts;
}
function deleteSelected() {
  if (!getItem(sel)) return;
  pushHistory();
  selArray().splice(sel.i, 1);
  sel = null; hover = null;
  renderPanel(); refresh();
}

function selectDown(w, e) {
  const tolV = 8 / view.k;
  const it = getItem(sel);
  if (it && it.pts) {
    let bi = -1, bd = tolV;
    it.pts.forEach((p, i) => { const d = dist(p, w); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0) {
      if (e.altKey) {
        const min = CLOSED_LAYERS.includes(sel.layer) ? 3 : (['lakes', 'forest', 'sand', 'marsh', 'crops'].includes(sel.layer) ? 1 : 2);
        if (it.pts.length > min) { pushHistory(); it.pts.splice(bi, 1); renderPanel(); refresh(); }
        return;
      }
      drag = { type: 'vertex', idx: bi, sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }
  }
  const hit = hitTest(w);
  if (!hit) { if (sel) { sel = null; renderPanel(); } return; }
  if (!sel || hit.layer !== sel.layer || hit.i !== sel.i) { sel = hit; renderPanel(); }
  const cur = getItem(sel);
  drag = { type: 'body', start: w, orig: structuredClone(cur), sx: e.clientX, sy: e.clientY, moved: false };
}
function selectMove(w, e) {
  const it = getItem(sel);
  if (!it) { drag = null; return; }
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
    drag.moved = true; pushHistory();
  }
  if (drag.type === 'vertex') it.pts[drag.idx] = w;
  else {
    const dx = w[0] - drag.start[0], dy = w[1] - drag.start[1];
    if (it.pts) it.pts = drag.orig.pts.map(p => [p[0] + dx, p[1] + dy]);
    else { it.x = drag.orig.x + dx; it.y = drag.orig.y + dy; if (sel.layer === 'ports') snapPort(it, 1e9); }
  }
  drawOverlay();
}
function insertVertex(w) {
  const it = getItem(sel);
  if (!it || !it.pts || it.pts.length < 2) return;
  const closed = CLOSED_LAYERS.includes(sel.layer);
  const n = it.pts.length;
  let bi = -1, bd = 12 / view.k + (it.width || 0) / 2;
  for (let i = 0; i < n - 1 + (closed ? 1 : 0); i++) {
    const d = distPointPolyline(w, [it.pts[i], it.pts[(i + 1) % n]]);
    if (d < bd) { bd = d; bi = i; }
  }
  if (bi < 0) return;
  pushHistory();
  it.pts.splice(bi + 1, 0, w);
  renderPanel(); refresh();
}

function touches(a, b) {
  for (const p of a.ring) if (distPointPolyline(p, b.ring, true) < 1.8) return true;
  for (const p of b.ring) if (distPointPolyline(p, a.ring, true) < 1.8) return true;
  return false;
}

function clickTool(w) {
  const t = state.tool;
  if (t === 'port') {
    const sn = snapToShore(w, waterShape(), 40 + 30 / view.k);
    if (!sn) { flashHint('Haz clic más cerca de la orilla de un río, lago o mar'); return; }
    pushHistory();
    state.layers.ports = state.layers.ports || [];
    state.layers.ports.push({ ...sn, w: state.opts.portW, len: state.opts.portLen, n: state.opts.portN });
    renderPanel(); refresh(); return;
  }
  if (t === 'citadel') {
    pushHistory();
    state.layers.citadels.push({ x: w[0], y: w[1], r: state.opts.citadelR });
    renderPanel(); refresh(); return;
  }
  if (t === 'erase') {
    const h = hitTest(w);
    if (!h) return;
    pushHistory();
    state.layers[h.layer].splice(h.i, 1);
    hover = null; renderPanel(); refresh(); return;
  }
  if (t === 'delb') {
    const b = hitTest(w);
    if (!b) return;
    pushHistory();
    state.edits.deleted.push(...b.ids);
    hover = null; refresh(); return;
  }
  if (t === 'merge') {
    const b = hitTest(w);
    if (!b) { selected = null; return; }
    if (!selected) { selected = b.ids[0]; return; }
    const sel = buildings.find(x => x.ids.includes(selected));
    if (!sel || sel.ids.includes(b.ids[0])) { selected = b.ids[0]; return; }
    if (!touches(sel, b)) { selected = b.ids[0]; flashHint('Solo se pueden unir edificios contiguos'); return; }
    pushHistory();
    state.edits.merges.push([sel.ids[0], b.ids[0]]);
    refresh(); return;
  }
  if (t === 'pathx') {
    const i = hitTest(w);
    if (i == null) return;
    pushHistory();
    state.edits.roads.splice(i, 1);
    hover = null; refresh();
  }
}
let hintTimer;
function flashHint(msg) {
  const el = $('#hint');
  el.textContent = msg;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { el.textContent = HINTS[state.tool] ? HINTS[state.tool]() : ''; }, 1800);
}

// ---- capa de previsualización ----
function drawOverlay() {
  const k = view.k;
  const sw = (px) => (px / k).toFixed(2);
  let s = '';
  const accent = '#B5552F';
  if (poly) {
    let pts = poly.pts.slice();
    if (poly.dragging && poly.raw) pts = pts.concat(poly.raw);
    const width = state.tool === 'road' ? state.opts.roadWidth : state.tool === 'water' ? state.opts.riverWidth : state.tool === 'path' ? state.opts.userRoadWidth : 0;
    const all = cursor && !poly.dragging ? pts.concat([cursor]) : pts;
    if (width && pts.length > 1) s += `<path d="${lineToPath(pts)}" fill="none" stroke="${accent}" stroke-opacity=".22" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (closedTool() && all.length > 2) s += `<path d="${lineToPath(all, true)}" fill="${accent}" fill-opacity=".08" stroke="none"/>`;
    s += `<path d="${lineToPath(all)}" fill="none" stroke="${accent}" stroke-width="${sw(1.5)}" stroke-dasharray="${sw(5)} ${sw(4)}"/>`;
    for (const p of poly.pts) s += `<circle cx="${p[0]}" cy="${p[1]}" r="${sw(2.5)}" fill="${accent}"/>`;
  }
  if (brush) {
    const r = state.opts.brushR;
    s += `<path d="${lineToPath(brush.pts)}" fill="none" stroke="${accent}" stroke-opacity=".25" stroke-width="${r * 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (cursor && (isBrushTool() || state.tool === 'settle' || state.tool === 'district')) {
    s += `<circle cx="${cursor[0]}" cy="${cursor[1]}" r="${state.opts.brushR}" fill="none" stroke="${PAL.ink}" stroke-width="${sw(1)}" stroke-dasharray="${sw(3)} ${sw(3)}"/>`;
  }
  if (cursor && state.tool === 'port') {
    const sn = snapToShore(cursor, waterShape(), 40 + 30 / view.k);
    if (sn) s += portOutline({ ...sn, w: state.opts.portW, len: state.opts.portLen, n: state.opts.portN }, accent, 0.25, sw);
  }
  if (cursor && state.tool === 'citadel') {
    s += `<path d="${ringsToPath([citadelRing({ x: cursor[0], y: cursor[1], r: state.opts.citadelR })])}" fill="none" stroke="${accent}" stroke-width="${sw(1.5)}" stroke-dasharray="${sw(4)} ${sw(3)}"/>`;
  }
  if (state.tool === 'select') {
    if (hover && !(sel && hover.layer === sel.layer && hover.i === sel.i)) s += outlineItem(hover, accent, 0.18, sw, false);
    const it = getItem(sel);
    if (it) {
      s += outlineItem(sel, accent, 0.28, sw, true);
      if (it.pts) for (const p of it.pts) s += `<circle cx="${p[0]}" cy="${p[1]}" r="${sw(3.5)}" fill="#fff" stroke="${accent}" stroke-width="${sw(1.5)}"/>`;
      else s += `<circle cx="${it.x}" cy="${it.y}" r="${sw(4)}" fill="#fff" stroke="${accent}" stroke-width="${sw(1.5)}"/>`;
    }
  }
  if (hover && state.tool === 'erase') {
    const L = state.layers, it = L[hover.layer][hover.i];
    if (hover.layer === 'citadels') s += `<circle cx="${it.x}" cy="${it.y}" r="${it.r}" fill="${accent}" fill-opacity=".2" stroke="${accent}" stroke-width="${sw(2)}"/>`;
    else {
      const closed = hover.layer === 'walls' || hover.layer === 'cliffs';
      const w = it.width || (it.r ? it.r * 2 : 0);
      if (w) s += `<path d="${lineToPath(it.pts)}" fill="none" stroke="${accent}" stroke-opacity=".3" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
      s += `<path d="${lineToPath(it.pts, closed)}" fill="none" stroke="${accent}" stroke-width="${sw(2)}"/>`;
    }
  }
  if (hover && state.tool === 'pathx' && state.edits.roads[hover]) {
    const r = state.edits.roads[hover];
    s += `<path d="${lineToPath(r.pts)}" fill="none" stroke="${accent}" stroke-opacity=".45" stroke-width="${r.width + 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (hover && (state.tool === 'merge' || state.tool === 'delb') && hover.ring) {
    s += `<path d="${ringsToPath([hover.ring])}" fill="${accent}" fill-opacity="${state.tool === 'delb' ? 0.55 : 0.3}" stroke="${accent}" stroke-width="${sw(1.5)}"/>`;
  }
  if (selected != null && state.tool === 'merge') {
    const b = buildings.find(x => x.ids.includes(selected));
    if (b) s += `<path d="${ringsToPath([b.ring])}" fill="${accent}" fill-opacity=".55" stroke="${accent}" stroke-width="${sw(2)}"/>`;
  }
  overlay.innerHTML = s;
}

function snapPort(it, maxD) {
  const sn = snapToShore([it.x, it.y], waterShape(), maxD);
  if (sn) Object.assign(it, sn);
}
function portOutline(pt, color, op, sw) {
  const K = 1 / (state.params.mapScale || 1);
  const pp = portParts(pt, K);
  return `<path d="${ringsToPath([pp.quay, ...pp.piers, ...pp.heads])}" fill="${color}" fill-opacity="${op}" stroke="${color}" stroke-width="${sw(1.5)}"/>`;
}
function outlineItem(ref, color, op, sw, strong) {
  const it = getItem(ref);
  if (!it) return '';
  if (ref.layer === 'ports') return portOutline(it, color, op, sw);
  if (ref.layer === 'citadels') return `<path d="${ringsToPath([citadelRing(it)])}" fill="${color}" fill-opacity="${op}" stroke="${color}" stroke-width="${sw(strong ? 2 : 1.5)}"/>`;
  const closed = CLOSED_LAYERS.includes(ref.layer);
  const w = it.width || (it.r ? it.r * 2 : 0);
  let s = '';
  if (w) s += `<path d="${lineToPath(it.pts)}" fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (closed) s += `<path d="${lineToPath(it.pts, true)}" fill="${color}" fill-opacity="${op * 0.5}" stroke="none"/>`;
  s += `<path d="${lineToPath(it.pts, closed)}" fill="none" stroke="${color}" stroke-width="${sw(strong ? 2 : 1.5)}"${strong ? '' : ` stroke-dasharray="${sw(4)} ${sw(3)}"`}/>`;
  return s;
}

// ---- teclado ----
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    cancelTool();
    if (e.shiftKey ? redo() : undo()) { renderPanel(); refresh(); }
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); if (redo()) { renderPanel(); refresh(); } return; }
  if (e.key === ' ') { spaceDown = true; svg.style.cursor = 'grab'; e.preventDefault(); }
  if (e.key === 'Escape') cancelTool();
  if (e.key === 'Enter') finishPoly();
  if (e.key === 'Backspace' && poly && poly.pts.length) { poly.pts.pop(); drawOverlay(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.tool === 'select' && sel) { e.preventDefault(); deleteSelected(); }
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; svg.style.cursor = ''; } });

$('#undo').onclick = () => { cancelTool(); if (undo()) { renderPanel(); refresh(); } };
$('#redo').onclick = () => { cancelTool(); if (redo()) { renderPanel(); refresh(); } };

// ================= Aleatorizar y exportar =================
$('#random').onclick = () => {
  pushHistory();
  cancelTool();
  randomizeAll();
  state.step = 2; state.tool = 'hand';
  renderPanel(); refresh();
};

function exportSvgString() {
  const showGen = state.step >= 2 && !!state.gen;
  const body = renderMap({ gen: state.gen, buildings, showGen });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 ${WORLD.w} ${WORLD.h}" width="${WORLD.w}" height="${WORLD.h}">${body}</svg>`;
}
async function download(blob, name) {
  // Publicado como Artifact en claude.ai: usa la capacidad "downloads"
  if (window.claude?.use) {
    try {
      const dl = await window.claude.use('downloads');
      if (dl) {
        try { await dl.save({ filename: name, data: blob }); } catch (err) { if (err?.code !== 'declined') flashHint('No se pudo descargar el archivo aquí'); }
        return;
      }
    } catch { /* sigue con la descarga normal */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportPng(scale) {
  flashHint(`Preparando PNG a ${scale}×…`);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([exportSvgString()], { type: 'image/svg+xml' }));
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = WORLD.w * scale; c.height = WORLD.h * scale;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    c.toBlob(b => download(b, `mapa-${scale}x.png`), 'image/png');
  };
  img.src = url;
}

// ---- proyecto: guardar / abrir ----
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (str, n) => { const bin = atob(str); const u = new Uint8Array(n); for (let i = 0; i < Math.min(n, bin.length); i++) u[i] = bin.charCodeAt(i); return u; };
function saveProject() {
  const data = {
    app: 'cartografo', version: 1, savedAt: new Date().toISOString(), step: state.step,
    layers: state.layers, params: state.params, edits: state.edits,
    density: b64(state.density), districts: b64(state.districts), theme: themeState,
  };
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'mapa.cartografo.json');
}
function openProject(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (d.app !== 'cartografo') throw new Error('formato');
      pushHistory();
      cancelTool();
      state.layers = { ...emptyLayers(), ...d.layers };
      state.params = { ...state.params, ...d.params };
      state.edits = d.edits || { merges: [], deleted: [], roads: [] };
      state.density = unb64(d.density || '', GW * GH);
      state.districts = unb64(d.districts || '', GW * GH);
      if (d.theme && d.theme.id) { themeState = d.theme; applyTheme(currentBase()); saveTheme(); }
      state.gen = null;
      goStep(Math.min(3, Math.max(1, d.step || 1)));
      flashHint('Proyecto abierto');
    } catch (err) {
      flashHint('No se pudo abrir: el archivo no es un proyecto del Cartógrafo');
    }
  };
  fr.readAsText(file);
}
const fileInput = document.createElement('input');
fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.hidden = true;
document.body.appendChild(fileInput);
fileInput.onchange = () => { if (fileInput.files[0]) openProject(fileInput.files[0]); fileInput.value = ''; };

// ---- menús desplegables ----
function setupMenu(btnId, panelId, items) {
  const btn = $('#' + btnId), panel = $('#' + panelId);
  panel.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button data-i="${i}"><b>${it.label}</b>${it.sub ? `<span>${it.sub}</span>` : ''}</button>`).join('');
  panel.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { panel.hidden = true; items[+b.dataset.i].run(); });
  btn.onclick = (e) => { e.stopPropagation(); document.querySelectorAll('.menu-panel, .theme-panel').forEach(p => { if (p !== panel) p.hidden = true; }); panel.hidden = !panel.hidden; };
  document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) panel.hidden = true; });
}
setupMenu('fileBtn', 'fileMenu', [
  { label: 'Guardar proyecto', sub: 'Archivo .json para seguir editando', run: saveProject },
  { label: 'Abrir proyecto…', sub: 'Carga un .json guardado antes', run: () => fileInput.click() },
]);
setupMenu('exportBtn', 'exportMenu', [
  { label: 'SVG por capas', sub: 'Capas para Illustrator, Inkscape o Affinity', run: () => download(new Blob([exportSvgString()], { type: 'image/svg+xml' }), 'mapa.svg') },
  '-',
  { label: 'PNG 2×', sub: `${WORLD.w * 2} × ${WORLD.h * 2} px`, run: () => exportPng(2) },
  { label: 'PNG 4×', sub: `${WORLD.w * 4} × ${WORLD.h * 4} px`, run: () => exportPng(4) },
]);
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); fileInput.click(); }
});

// ================= Temas =================
const THEME_KEY = 'cartografo.theme';
let themeState = { id: 'pergamino', custom: null };
try { const t = JSON.parse(localStorage.getItem(THEME_KEY) || 'null'); if (t && t.id) themeState = t; } catch { /* sin almacenamiento */ }
function saveTheme() { try { localStorage.setItem(THEME_KEY, JSON.stringify(themeState)); } catch { /* sin almacenamiento */ } }
function currentBase() {
  if (themeState.id === 'custom' && themeState.custom) return themeState.custom;
  return (THEMES.find(t => t.id === themeState.id) || THEMES[0]).base;
}
function setTheme(id) {
  if (id === 'custom' && !themeState.custom) themeState.custom = { ...derive(currentBase()) };
  themeState.id = id;
  applyTheme(currentBase()); saveTheme();
  renderThemePanel(); refresh();
}
const swatch = (b) => `<span class="sw">${['paper', 'building', 'water', 'tree', 'ink'].map(k => `<i style="background:${(derive(b))[k]}"></i>`).join('')}</span>`;
function renderThemePanel() {
  const el = $('#themePanel');
  let h = '<div class="theme-list">';
  for (const t of THEMES) h += `<button class="theme-item ${themeState.id === t.id ? 'active' : ''}" data-theme="${t.id}">${swatch(t.base)}<span>${t.name}</span></button>`;
  h += `<button class="theme-item ${themeState.id === 'custom' ? 'active' : ''}" data-theme="custom">${swatch(themeState.custom || currentBase())}<span>Personalizado</span></button></div>`;
  if (themeState.id === 'custom') {
    const b = derive(themeState.custom);
    h += '<div class="theme-custom">' + EDITABLE.map(([k, label]) =>
      `<label><input type="color" data-color="${k}" value="${b[k].toLowerCase()}"><span>${label}</span></label>`).join('') + '</div>';
    h += '<div class="theme-actions"><span>Partir de:</span><select id="customFrom"><option value="">elige un tema…</option>' + THEMES.map(t => `<option value="${t.id}">${t.name}</option>`).join('') + '</select></div>';
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => setTheme(b.dataset.theme));
  let raf = 0;
  el.querySelectorAll('[data-color]').forEach(inp => inp.oninput = () => {
    themeState.custom[inp.dataset.color] = inp.value.toUpperCase();
    applyTheme(themeState.custom); saveTheme();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(refresh);
  });
  const from = el.querySelector('#customFrom');
  if (from) from.onchange = () => {
    const t = THEMES.find(x => x.id === from.value);
    if (t) { themeState.custom = { ...derive(t.base) }; applyTheme(themeState.custom); saveTheme(); renderThemePanel(); refresh(); }
  };
}
$('#themeBtn').onclick = (e) => {
  e.stopPropagation();
  const el = $('#themePanel');
  el.hidden = !el.hidden;
  if (!el.hidden) renderThemePanel();
};
document.addEventListener('pointerdown', (e) => {
  const el = $('#themePanel');
  if (!el.hidden && !el.contains(e.target) && e.target !== $('#themeBtn')) el.hidden = true;
});
applyTheme(currentBase());

// ================= Inicio =================
window.addEventListener('resize', () => {});
renderPanel();
fit();
refresh();
window.__app = { state, refresh, goStep, view, applyView, randomizeAll: (sd) => { pushHistory(); cancelTool(); randomizeAll(sd); state.step = 2; state.tool = 'hand'; renderPanel(); refresh(); } };
