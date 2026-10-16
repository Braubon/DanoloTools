import './style.css';
import {
  state, WORLD, MAX_W, MAX_H, GW, GH, ASPECTS, syncAspect, shiftWorld,
  pushHistory, undo, redo, canUndo, canRedo, sprayDensity, settlementDefined, emptyLayers, paintDistrict, DISTRICTS,
} from './state.js';
import { simplify, chaikin, dist, distPointPolyline, pointInRing, lineToPath, ringsToPath, offset, outerRings, bufferLine } from './geom.js';
import { THEMES, EDITABLE, applyTheme, derive } from './themes.js';
import { generate, applyEdits } from './generate.js';
import { renderMap, PAL } from './render.js';
import { estimate, PERSONS_PER_HOUSEHOLD, M2_PER_HOUSEHOLD, HOMELESS_RATE } from './population.js';
import { randomizeAll } from './randomize.js';
import { citadelRing, snapToShore, portParts, waterShape, districtGrid } from './layers.js';

const $ = (s) => document.querySelector(s);
const svg = $('#svg'), viewG = $('#view'), mapG = $('#map'), overlay = $('#overlay'), densImg = $('#densImg');
densImg.setAttribute('width', MAX_W); densImg.setAttribute('height', MAX_H);

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
  const q = districtGrid();
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

const isDrawTool = () => state.tool === 'poly' || state.tool === 'stroke' || state.tool === 'paint';

// imagen de densidad (aerógrafo)
const dcan = document.createElement('canvas');
dcan.width = GW; dcan.height = GH;
const dctx = dcan.getContext('2d');
const dimg = dctx.createImageData(GW, GH);
function updateDensityImage() {
  const show = state.step === 1 && state.opts.showDensity && !(isDrawTool() && state.opts.element === 'district');
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
distImg.setAttribute('width', MAX_W); distImg.setAttribute('height', MAX_H);
function updateDistrictImage() {
  const d = districtGrid();
  const hasDist = (state.layers.districts && state.layers.districts.length > 0) || d.some(v => v !== 0);
  const show = state.step === 1 && state.opts.showDistricts && (hasDist || (isDrawTool() && state.opts.element === 'district'));
  distImg.style.display = show ? '' : 'none';
  if (!show) return;
  const px = qimg.data;
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
  poly: '<polygon points="12 3 21 8.5 18 19.5 6 19.5 3 8.5"/>',
  stroke: '<path d="M4 19c3-6 5-9 9-8s4 5 7-7"/><circle cx="4" cy="19" r="1.5"/><circle cx="20" cy="4" r="1.5"/>',
  paint: '<path d="M18 3a3 3 0 013 3c0 2-4 6-7 9l-4-4c3-3 7-8 8-8z"/><path d="M10 11c-3 1-5 3-5 6 0 1.7 1.3 3 3 3 3 0 5-2 6-5"/>',
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
  ['select', 'Seleccionar'],
  ['poly', 'Polígono'],
  ['stroke', 'Trazo libre'],
  ['paint', 'Pintura'],
  ['settle', 'Asentam.'],
  ['port', 'Puerto'],
  ['erase', 'Borrar'],
];
const ELEMENTS = [
  ['water', 'Agua'],
  ['road', 'Caminos'],
  ['cliff', 'Riscos'],
  ['wall', 'Muralla'],
  ['forest', 'Bosque'],
  ['citadel', 'Ciudadela'],
  ['soil', 'Suelos'],
  ['district', 'Barrios'],
];
const ELEM_NAMES = Object.fromEntries(ELEMENTS);
const TOOLS3 = [['select', 'Seleccionar'], ['merge', 'Unir'], ['delb', 'Borrar edif.'], ['path', 'Camino'], ['pathx', 'Borrar cam.'], ['hand', 'Mover']];

const HINTS = {
  poly: () => {
    const el = ELEM_NAMES[state.opts.element] || '';
    if (state.opts.polyMode === 'rect') return `Polígono (${el}) · arrastra para crear rectángulo · Mayús: cuadrado · Alt: desde el centro`;
    if (state.opts.polyMode === 'circle') return `Polígono (${el}) · arrastra desde el centro para definir el radio del círculo`;
    return `Polígono libre (${el}) · clic: vértice · arrastrar: curva · doble clic / Intro: cerrar · Esc: cancelar`;
  },
  stroke: () => `Trazo libre (${ELEM_NAMES[state.opts.element] || ''}) · clic: punto recto · arrastrar: curva · doble clic / Intro: terminar · Esc: cancelar`,
  paint: () => `Pintura (${ELEM_NAMES[state.opts.element] || ''}) · arrastra para pintar con brocha` + (state.opts.drawErase ? ' (borrando)' : ''),
  settle: () => 'Aerógrafo de asentamiento · mantén pulsado para aumentar la densidad' + (state.opts.densErase ? ' (borrador)' : ''),
  port: () => 'Clic junto a la orilla para colocar un puerto: se pega a la costa y los muelles entran en el agua',
  select: () => selList.length
    ? (state.opts.selectTransform
      ? 'Transformar · arrastra esquinas/lados para escalar (Mayús: uniforme, Alt: centro) · tirador superior: rotar · interior: mover · Mayús+clic / arrastrar fondo: multiselección'
      : 'Arrastra un punto o la forma · Mayús+clic o arrastrar en vacío: seleccionar varios · doble clic en trazo: añadir punto · Alt+clic: quitar · Supr: eliminar')
    : (state.step === 3 ? 'Clic o arrastra para seleccionar caminos dibujados en este paso' : 'Clic en un elemento, Mayús+clic o arrastra un recuadro para seleccionar varios elementos'),
  erase: () => 'Clic sobre un elemento (agua, camino, muralla, risco, bosque, ciudadela, suelo o barrio) para eliminarlo',
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
function elemButtons() {
  return `<div class="elem-grid">${ELEMENTS.map(([id, label]) =>
    `<button class="tool ${state.opts.element === id ? 'active' : ''}" data-elem="${id}"><svg viewBox="0 0 24 24">${ICONS[id]}</svg>${label}</button>`).join('')}</div>`;
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
  <label class="field"><span>Proporción del lienzo</span>
    <select id="aspectSel">${ASPECTS.map(a => `<option value="${a.id}" ${(state.params.aspect || '4:3') === a.id ? 'selected' : ''}>${a.label}</option>`).join('')}</select>
  </label>
  ${slider('mapScale', 'Tamaño real del mapa', 0.4, 4, 0.1, 'scale', 'params')}
  <p>Cambia cuántos metros representa lo que has dibujado, sin mover el terreno. Mayor tamaño → ríos y caminos más anchos en metros, casas más pequeñas en proporción y un asentamiento más denso.</p></section>`;
const pcheck = (key, label, on) => `<label class="check"><input type="checkbox" data-pcheck="${key}" ${on ? 'checked' : ''}> ${label}</label>`;
const check = (key, label) => `<label class="check"><input type="checkbox" data-check="${key}" ${state.opts[key] ? 'checked' : ''}> ${label}</label>`;

function elementSubOptions() {
  const o = state.opts, el = o.element;
  let h = '';
  if (el === 'soil') {
    h += `<div class="seg">${[['sand', 'Playa'], ['marsh', 'Pantano'], ['crops', 'Cultivos']].map(([k, l]) => `<button data-soil="${k}" class="${o.soilMode === k ? 'active' : ''}">${l}</button>`).join('')}</div>`;
  } else if (el === 'district') {
    h += `<div class="dist-grid">${DISTRICTS.slice(1).map(t => `<button data-dist="${t.id}" class="${o.districtType === t.id ? 'active' : ''}"><i style="background:rgb(${t.color.join(',')})"></i>${t.name}</button>`).join('')}</div>`;
    h += check('showDistricts', 'Mostrar barrios');
  } else if (el === 'wall' || el === 'citadel') {
    h += slider('wallWidth', 'Grosor de muralla', 1, 18, 0.2, 'dm');
    h += slider('towerR', 'Tamaño de torreones', 0, 18, 0.2, 'dm');
  }
  return h;
}

function toolOptions() {
  const t = state.tool, o = state.opts, el = o.element;
  const canErase = !['wall', 'citadel'].includes(el);
  switch (t) {
    case 'poly': {
      let h = `<h2>Elemento a añadir</h2>${elemButtons()}`;
      h += elementSubOptions();
      h += `<h2>Modo de polígono</h2><div class="seg">` +
        [['rect', 'Cuadrado'], ['circle', 'Círculo'], ['free', 'Libre']].map(([k, l]) => `<button data-pm="${k}" class="${o.polyMode === k ? 'active' : ''}">${l}</button>`).join('') +
        `</div>`;
      if (canErase) h += check('drawErase', 'Modo borrador (restar)');
      if (el === 'wall') h += '<p>Las murallas pueden dibujarse unas dentro de otras para crear recintos concéntricos o barrios amurallados.</p>';
      return h;
    }
    case 'stroke': {
      let h = `<h2>Elemento a añadir</h2>${elemButtons()}`;
      h += elementSubOptions();
      if (el === 'water') h += slider('riverWidth', 'Anchura del cauce', 4, 80, 1, 'dm');
      else if (el === 'road') h += slider('roadWidth', 'Anchura del camino', 2, 24, 0.5, 'dm');
      else if (el === 'cliff') h += slider('cliffWidth', 'Anchura de elevación', 8, 120, 1, 'dm') + check('drawErase', 'Modo borrador');
      else if (['forest', 'soil', 'district'].includes(el)) h += slider('brushR', 'Radio del trazo', 6, 150, 1, 'dm') + check('drawErase', 'Modo borrador');
      else if (el === 'wall' || el === 'citadel') h += '<p>En modo trazo libre se dibuja un lienzo de muralla abierto con torres en sus extremos y esquinas.</p>';
      return h;
    }
    case 'paint': {
      let h = `<h2>Elemento a añadir</h2>${elemButtons()}`;
      h += elementSubOptions();
      h += slider('brushR', 'Radio de brocha', 6, 150, 1, 'dm');
      if (canErase) h += check('drawErase', 'Modo borrador (restar)');
      return h;
    }
    case 'settle': return slider('brushR', 'Radio', 10, 200, 1, 'dm') + slider('densStrength', 'Intensidad', 0.05, 1, 0.05, '%') + check('densErase', 'Borrador') + check('showDensity', 'Mostrar densidad');
    case 'port': return slider('portW', 'Anchura del muelle', 15, 250, 1, 'dm') + slider('portLen', 'Longitud de los embarcaderos', 4, 120, 1, 'dm') + slider('portN', 'Embarcaderos', 0, 12, 1, '') + '<p>Se coloca en el punto de la orilla más cercano al clic. Después puedes moverlo por la costa con Seleccionar.</p>';
    case 'erase': return '<p>Elimina el elemento completo más cercano al cursor.</p>';
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
    if (opt) h += `<section>${state.tool === 'select' ? '<h2>Selección</h2>' : (isDrawTool() ? '' : '<h2>Opciones</h2>')}${opt}</section>`;
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
  document.querySelectorAll('[data-elem]').forEach(b => b.onclick = () => { state.opts.element = b.dataset.elem; cancelTool(); renderPanel(); refresh(); });
  document.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { state.opts.polyMode = b.dataset.pm; cancelTool(); renderPanel(); drawOverlay(); });
  document.querySelectorAll('[data-soil]').forEach(b => b.onclick = () => { state.opts.soilMode = b.dataset.soil; renderPanel(); });
  document.querySelectorAll('[data-dist]').forEach(b => b.onclick = () => { state.opts.districtType = +b.dataset.dist; state.opts.drawErase = false; renderPanel(); refresh(); });
  const asp = $('#aspectSel');
  if (asp) asp.onchange = () => setAspect(asp.value);
  document.querySelectorAll('[data-pcheck]').forEach(c => c.onchange = () => {
    pushHistory();
    const k = c.dataset.pcheck;
    if (k.startsWith('sp.')) state.params.specials = { ...(state.params.specials || {}), [k.slice(3)]: c.checked };
    else state.params[k] = c.checked;
    if (k !== 'scaleBar') state.edits = { merges: [], deleted: [], roads: [] };
    refresh();
  });
  document.querySelectorAll('[data-check]').forEach(c => c.onchange = () => { state.opts[c.dataset.check] = c.checked; renderPanel(); refresh(); });
  let optEditing = false;
  document.querySelectorAll('input[type=range][data-key]').forEach(inp => {
    const key = inp.dataset.key, obj = inp.dataset.obj, unit = inp.dataset.unit;
    inp.oninput = () => {
      $('#o-' + key).textContent = fmtVal(+inp.value, unit);
      if (obj === 'opts') {
        state.opts[key] = +inp.value;
        if (key === 'wallWidth' || key === 'towerR') {
          const target = state.opts.element === 'citadel' ? state.layers.citadels : state.layers.walls;
          if (target && target.length) {
            if (!optEditing) { pushHistory(); optEditing = true; }
            const prop = key === 'wallWidth' ? 'width' : 'towerR';
            for (const w of target) w[prop] = +inp.value;
            cancelAnimationFrame(gapRaf); gapRaf = requestAnimationFrame(refresh);
            return;
          }
        }
        drawOverlay();
      }
      if (key === 'buildingGap' || key === 'roofVar') { state.params[key] = +inp.value; cancelAnimationFrame(gapRaf); gapRaf = requestAnimationFrame(refresh); }
    };
    inp.onchange = () => {
      if (optEditing) { optEditing = false; refresh(); return; }
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

function setAspect(id) {
  const a = ASPECTS.find(x => x.id === id);
  if (!a || id === state.params.aspect) return;
  pushHistory();
  const oldW = WORLD.w, oldH = WORLD.h;
  state.params.aspect = id;
  syncAspect();
  shiftWorld((WORLD.w - oldW) / 2, (WORLD.h - oldH) / 2);
  state.edits = { merges: [], deleted: [], roads: [] };
  fit();
  renderPanel();
  refresh();
}

function goStep(n) {
  if (n >= 2 && !settlementDefined()) { n = 1; }
  cancelTool();
  state.step = n;
  if (n === 1 && !TOOLS1.some(t => t[0] === state.tool)) state.tool = 'poly';
  if (n === 3 && (state.tool === 'hand' || !TOOLS3.some(t => t[0] === state.tool))) state.tool = 'merge';
  if (n === 2) state.tool = 'hand';
  renderPanel();
  refresh();
}
document.querySelectorAll('#steps button').forEach(b => b.onclick = () => goStep(+b.dataset.step));

function setTool(t) { cancelTool(); state.tool = t; renderPanel(); drawOverlay(); }

// ================= Interacción con el puntero =================
let poly = null;       // dibujo de polilínea/polígono libre en curso {pts, raw, down, dragging}
let shapeDrag = null;  // dibujo de rectángulo o círculo {mode, start, cur, shift, alt}
let brush = null;      // trazo de pincel en curso
let spray = null;      // aerógrafo
let pan = null;
let spaceDown = false;
let cursor = null;
let selected = null;   // edificio seleccionado para unir
let hover = null;
let lastDown = null;
let selList = [];      // lista de elementos seleccionados [{layer, i}, ...]
let sel = null;        // primer elemento seleccionado {layer, i} o null
let drag = null;       // arrastre de vértice, cuerpo, transformación o recuadro

const isPolyVertexTool = () => (state.tool === 'poly' && state.opts.polyMode === 'free') || state.tool === 'stroke' || state.tool === 'path';
const isShapeDragTool = () => state.tool === 'poly' && (state.opts.polyMode === 'rect' || state.opts.polyMode === 'circle');
const isBrushTool = () => state.tool === 'paint';
const closedTool = () => state.tool === 'poly';

function syncSel() {
  selList = selList.filter(r => !!getItem(r));
  sel = selList[0] || null;
}
function isSelected(ref) {
  return !!ref && selList.some(s => s.layer === ref.layer && s.i === ref.i);
}
function setSelList(list) {
  const seen = new Set();
  selList = [];
  for (const r of list) {
    if (!r || !getItem(r)) continue;
    const k = r.layer + ':' + r.i;
    if (seen.has(k)) continue;
    seen.add(k);
    selList.push({ layer: r.layer, i: r.i });
  }
  syncSel();
}
function toggleSel(ref) {
  if (!ref) return;
  if (isSelected(ref)) selList = selList.filter(s => !(s.layer === ref.layer && s.i === ref.i));
  else selList.push({ layer: ref.layer, i: ref.i });
  syncSel();
}

function cancelTool() {
  poly = null; shapeDrag = null; brush = null; spray = null;
  selected = null; selList = []; sel = null; drag = null;
  drawOverlay();
}

function shapeDragRing(sd) {
  if (!sd) return [];
  const [x0, y0] = sd.start, [x1, y1] = sd.cur;
  if (sd.mode === 'rect') {
    let dx = x1 - x0, dy = y1 - y0;
    if (sd.shift) {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m;
    }
    const ax0 = sd.alt ? x0 - dx : x0, ay0 = sd.alt ? y0 - dy : y0;
    const ax1 = x0 + dx, ay1 = y0 + dy;
    const minX = Math.min(ax0, ax1), maxX = Math.max(ax0, ax1);
    const minY = Math.min(ay0, ay1), maxY = Math.max(ay0, ay1);
    if (maxX - minX < 2 || maxY - minY < 2) return [];
    return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
  }
  if (sd.mode === 'circle') {
    const r = dist([x0, y0], [x1, y1]);
    if (r < 2) return [];
    const n = 32, ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ring.push([x0 + Math.cos(a) * r, y0 + Math.sin(a) * r]);
    }
    return ring;
  }
  return [];
}

// Ajusta el punto b a múltiplos de 45° respecto a a (con Mayús pulsado)
function snap45(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], r = Math.hypot(dx, dy);
  if (r < 1e-6) return b;
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return [a[0] + Math.cos(ang) * r, a[1] + Math.sin(ang) * r];
}

svg.addEventListener('pointerdown', (e) => {
  svg.setPointerCapture(e.pointerId);
  const w = toWorld(e);
  if (e.button === 1 || e.button === 2 || spaceDown || state.tool === 'hand' || state.step === 2) {
    pan = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    svg.style.cursor = 'grabbing';
    return;
  }
  if (e.button !== 0) return;
  if (isShapeDragTool()) {
    shapeDrag = { mode: state.opts.polyMode, start: w, cur: w, shift: e.shiftKey, alt: e.altKey };
  } else if (isPolyVertexTool()) {
    const now = performance.now();
    if (poly && lastDown && now - lastDown.t < 380 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 7) {
      lastDown = null; finishPoly(); return;
    }
    lastDown = { t: now, x: e.clientX, y: e.clientY };
    if (!poly) poly = { pts: [], raw: null, down: null, dragging: false };
    const wp = (e.shiftKey && poly.pts.length) ? snap45(poly.pts[poly.pts.length - 1], w) : w;
    poly.down = { w: wp, sx: e.clientX, sy: e.clientY };
    poly.raw = [wp];
  } else if (isBrushTool()) {
    brush = { pts: [w] };
  } else if (state.tool === 'select') {
    selectDown(w, e);
  } else if (state.tool === 'settle') {
    pushHistory();
    spray = { w, last: performance.now() };
    sprayTick();
  } else clickTool(w);
  drawOverlay();
});
svg.addEventListener('pointermove', (e) => {
  const w = toWorld(e);
  cursor = (e.shiftKey && poly && poly.pts.length && !poly.dragging) ? snap45(poly.pts[poly.pts.length - 1], w) : w;
  if (pan) {
    view.x = pan.vx + e.clientX - pan.sx; view.y = pan.vy + e.clientY - pan.sy;
    applyView();
    return;
  }
  if (shapeDrag) {
    shapeDrag.cur = w; shapeDrag.shift = e.shiftKey; shapeDrag.alt = e.altKey;
    drawOverlay();
    return;
  }
  if (poly && poly.down) {
    if (!poly.dragging && Math.hypot(e.clientX - poly.down.sx, e.clientY - poly.down.sy) > 5) poly.dragging = true;
    if (poly.dragging) poly.raw.push(w);
  }
  if (brush) brush.pts.push(w);
  if (spray) spray.w = w;
  if (drag) { selectMove(w, e); return; }
  if (state.tool === 'select') hover = hitTest(w);
  if (['erase', 'merge', 'delb', 'pathx'].includes(state.tool)) hover = hitTest(w);
  drawOverlay();
});
svg.addEventListener('pointerup', () => {
  if (pan) { pan = null; svg.style.cursor = ''; return; }
  if (shapeDrag) {
    const pts = shapeDragRing(shapeDrag);
    shapeDrag = null;
    if (pts.length >= 3) {
      pushHistory();
      commitDrawnElement('poly', pts);
      renderPanel(); refresh();
    } else drawOverlay();
    return;
  }
  if (drag) {
    const moved = drag.moved, isMarquee = drag.type === 'marquee';
    drag = null;
    if (moved || isMarquee) { renderPanel(); refresh(); }
    else drawOverlay();
    return;
  }
  if (poly && poly.down) {
    if (poly.dragging) {
      const eps = 2.2 / view.k;
      let fr = chaikin(simplify(poly.raw, eps), 2);
      poly.pts.push(...(poly.pts.length ? fr.slice(1) : fr));
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

function commitDrawnElement(toolKind, pts) {
  const L = state.layers, o = state.opts, el = o.element;
  const mode = o.drawErase ? 'sub' : 'add';
  const r = o.brushR;
  if (toolKind === 'poly') {
    if (el === 'water') L.lakes.push({ pts, kind: 'poly', mode });
    else if (el === 'road') L.roads.push({ pts, kind: 'poly', mode });
    else if (el === 'cliff') L.cliffs.push({ pts, kind: 'poly', mode });
    else if (el === 'wall') L.walls.push({ pts, kind: 'poly', open: false, width: o.wallWidth, towerR: o.towerR });
    else if (el === 'forest') L.forest.push({ pts, kind: 'poly', mode });
    else if (el === 'citadel') L.citadels.push({ pts, kind: 'poly', open: false, width: o.wallWidth, towerR: o.towerR });
    else if (el === 'soil') (L[o.soilMode] = L[o.soilMode] || []).push({ pts, kind: 'poly', mode });
    else if (el === 'district') (L.districts = L.districts || []).push({ pts, kind: 'poly', type: o.districtType, mode });
  } else if (toolKind === 'stroke') {
    if (el === 'water') L.rivers.push({ pts, kind: 'stroke', width: o.riverWidth, mode: 'add' });
    else if (el === 'road') L.roads.push({ pts, kind: 'stroke', width: o.roadWidth, mode: 'add' });
    else if (el === 'cliff') L.cliffs.push({ pts, kind: 'stroke', width: o.cliffWidth, mode });
    else if (el === 'wall') L.walls.push({ pts, kind: 'stroke', open: true, width: o.wallWidth, towerR: o.towerR });
    else if (el === 'forest') L.forest.push({ pts, kind: 'stroke', r, mode });
    else if (el === 'citadel') L.citadels.push({ pts, kind: 'stroke', open: true, width: o.wallWidth, towerR: o.towerR });
    else if (el === 'soil') (L[o.soilMode] = L[o.soilMode] || []).push({ pts, kind: 'stroke', r, mode });
    else if (el === 'district') (L.districts = L.districts || []).push({ pts, kind: 'stroke', r, type: o.districtType, mode });
  } else if (toolKind === 'paint') {
    if (el === 'wall' || el === 'citadel') {
      const rings = outerRings(bufferLine(pts, r, false));
      const target = el === 'wall' ? L.walls : L.citadels;
      for (const ring of rings) {
        const simp = simplifyPts(ring, 2, true);
        if (simp.length >= 3) target.push({ pts: simp, kind: 'poly', open: false, width: o.wallWidth, towerR: o.towerR });
      }
    } else if (el === 'water') L.lakes.push({ pts, kind: 'paint', r, mode });
    else if (el === 'road') L.roads.push({ pts, kind: 'paint', r, mode });
    else if (el === 'cliff') L.cliffs.push({ pts, kind: 'paint', r, mode });
    else if (el === 'forest') L.forest.push({ pts, kind: 'paint', r, mode });
    else if (el === 'soil') (L[o.soilMode] = L[o.soilMode] || []).push({ pts, kind: 'paint', r, mode });
    else if (el === 'district') (L.districts = L.districts || []).push({ pts, kind: 'paint', r, type: o.districtType, mode });
  }
}

function finishPoly() {
  if (!poly) return;
  const pts = [];
  for (const p of poly.pts) if (!pts.length || dist(pts[pts.length - 1], p) > 0.8) pts.push(p);
  const closed = closedTool();
  poly = null;
  if (pts.length < (closed ? 3 : 2)) { drawOverlay(); return; }
  pushHistory();
  if (state.tool === 'path') state.edits.roads.push({ pts, width: state.opts.userRoadWidth });
  else commitDrawnElement(state.tool === 'poly' ? 'poly' : 'stroke', pts);
  renderPanel(); refresh();
}
function commitBrush(pts) {
  pushHistory();
  commitDrawnElement('paint', pts);
  renderPanel(); refresh();
}

// ---- pruebas de selección ----
function isClosedItem(layer, it) {
  if (!it) return false;
  if (it.x !== undefined && it.r !== undefined && !it.pts) return true;
  if (it.kind === 'poly') return true;
  if (it.kind === 'stroke' || it.kind === 'paint') return false;
  if (layer === 'walls' || layer === 'citadels') return !it.open;
  if (layer === 'cliffs') return it.width === undefined && it.r === undefined;
  return false;
}

function hitTest(w) {
  const t = state.tool;
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
  const checkItem = (layer, r, i, prio = 0) => {
    if (!r) return;
    if (!includeSub && r.mode === 'sub') return;
    if (layer === 'ports') {
      const dx = w[0] - r.x, dy = w[1] - r.y, c = Math.cos(r.ang), s2 = Math.sin(r.ang);
      const v = dx * c + dy * s2, u = -dx * s2 + dy * c;
      if (Math.abs(u) < r.w / 2 + tol && v > -6 - tol && v < r.len + 10 + tol) consider('ports', i, 0.2);
      return;
    }
    if (r.x !== undefined && r.r !== undefined && !r.pts) {
      const half = Math.max((r.width || 3) / 2, r.towerR ?? 2.6);
      const d = Math.abs(Math.hypot(w[0] - r.x, w[1] - r.y) - r.r) - half;
      if (d < tol) consider(layer, i, d);
      else if (Math.hypot(w[0] - r.x, w[1] - r.y) < r.r) consider(layer, i, tol * 0.75 + prio);
      return;
    }
    if (!r.pts || !r.pts.length) return;
    const closed = isClosedItem(layer, r);
    if (closed) {
      const edgeHalf = (layer === 'walls' || layer === 'citadels') ? Math.max((r.width || 3.6) / 2, r.towerR ?? 2.8) : 0;
      const dEdge = distPointPolyline(w, r.pts, true) - edgeHalf;
      if (dEdge < tol) consider(layer, i, dEdge + prio * 0.2);
      else if (layer !== 'walls' && pointInRing(w, r.pts)) consider(layer, i, tol * 0.8 + prio);
    } else {
      const half = (layer === 'walls' || layer === 'citadels')
        ? Math.max((r.width || 3.6) / 2, r.towerR ?? 2.8)
        : (r.width ? r.width / 2 : (r.r || 2));
      const d = distPointPolyline(w, r.pts, false) - half;
      if (d < tol) consider(layer, i, d + prio * 0.5);
    }
  };
  (L.rivers || []).forEach((r, i) => checkItem('rivers', r, i, 0.2));
  (L.roads || []).forEach((r, i) => checkItem('roads', r, i, 0.1));
  (L.walls || []).forEach((r, i) => checkItem('walls', r, i, 0));
  (L.cliffs || []).forEach((r, i) => checkItem('cliffs', r, i, 0.4));
  (L.lakes || []).forEach((r, i) => checkItem('lakes', r, i, 0.8));
  (L.forest || []).forEach((r, i) => checkItem('forest', r, i, 0.8));
  for (const k of ['sand', 'marsh', 'crops', 'districts']) (L[k] || []).forEach((r, i) => checkItem(k, r, i, 1));
  (L.citadels || []).forEach((c, i) => checkItem('citadels', c, i, 0.1));
  (L.ports || []).forEach((pt, i) => checkItem('ports', pt, i, 0));
  return best;
}

// ================= Selección y edición de elementos =================
const SEL_NAMES = {
  rivers: 'Agua (cauce)', roads: 'Camino', walls: 'Muralla', cliffs: 'Risco',
  lakes: 'Agua', forest: 'Bosque', citadels: 'Ciudadela', ports: 'Puerto',
  eroads: 'Camino', sand: 'Playa', marsh: 'Pantano', crops: 'Cultivos', districts: 'Barrio',
};
function getItem(s0) {
  if (!s0) return null;
  const arr = s0.layer === 'eroads' ? state.edits.roads : state.layers[s0.layer];
  return arr ? arr[s0.i] || null : null;
}
function layerArray(layer) { return layer === 'eroads' ? state.edits.roads : state.layers[layer]; }

const propSlider = (prop, label, min, max, step, v, unit = 'dm') =>
  `<label class="slider"><div class="top"><span>${label}</span><span id="p-${prop}">${fmtVal(v, unit)}</span></div>
  <input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-prop="${prop}" data-unit="${unit}"></label>`;

function selectionPanel() {
  syncSel();
  const modeToggle = `<div class="seg"><button data-selmode="pts" class="${!state.opts.selectTransform ? 'active' : ''}">Puntos</button><button data-selmode="xform" class="${state.opts.selectTransform ? 'active' : ''}">Transformar</button></div>`;
  if (!selList.length) {
    return modeToggle + `<p>${state.step === 3 ? 'Haz clic o arrastra sobre caminos dibujados en este paso.' : 'Haz clic sobre un elemento, usa Mayús+clic o arrastra un recuadro para seleccionar varios elementos.'}</p>`;
  }
  if (selList.length > 1) {
    let h = modeToggle;
    h += `<div class="selname">${selList.length} elementos<span>Multiselección</span></div>`;
    const wallRefs = selList.filter(r => r.layer === 'walls' || r.layer === 'citadels');
    if (wallRefs.length) {
      const w0 = getItem(wallRefs[0]);
      h += propSlider('width', 'Grosor de muralla', 1, 18, 0.2, w0?.width ?? (wallRefs[0].layer === 'citadels' ? 3 : 3.6));
      h += propSlider('towerR', 'Tamaño de torreones', 0, 18, 0.2, w0?.towerR ?? (wallRefs[0].layer === 'citadels' ? 2.6 : 2.8));
    }
    h += `<div class="btn-row"><button class="ghost" id="selDup">Duplicar (${selList.length})</button><button class="ghost danger" id="selDel">Eliminar (${selList.length})</button></div>`;
    h += `<p class="small">${state.opts.selectTransform ? 'Usa la caja delimitadora para escalar, rotar o mover todos los elementos seleccionados.' : 'Arrastra cualquiera de ellos para moverlos juntos, o activa Transformar para escalar y rotar.'}</p>`;
    return h;
  }
  const it = getItem(sel);
  let h = modeToggle;
  const dName = sel.layer === 'districts' && DISTRICTS[it.type] ? `Barrio ${DISTRICTS[it.type].name.toLowerCase()}` : SEL_NAMES[sel.layer];
  h += `<div class="selname">${dName}${it.pts ? `<span>${it.pts.length} puntos</span>` : ''}</div>`;
  if (sel.layer === 'walls' || sel.layer === 'citadels') {
    h += propSlider('width', 'Grosor de muralla', 1, 18, 0.2, it.width ?? (sel.layer === 'citadels' ? 3 : 3.6));
    h += propSlider('towerR', 'Tamaño de torreones', 0, 18, 0.2, it.towerR ?? (sel.layer === 'citadels' ? 2.6 : 2.8));
  } else if (it.width !== undefined) {
    const maxW = sel.layer === 'rivers' || sel.layer === 'cliffs' ? 120 : (sel.layer === 'eroads' ? 14 : 36);
    h += propSlider('width', 'Anchura', 1, maxW, 0.5, it.width);
  }
  if (it.r !== undefined && sel.layer !== 'citadels') {
    h += propSlider('r', 'Radio del trazo', 3, 200, 1, it.r);
  }
  if (['lakes', 'forest', 'sand', 'marsh', 'crops', 'districts', 'cliffs', 'roads'].includes(sel.layer) && !['walls', 'citadels'].includes(sel.layer) && it.kind !== 'stroke') {
    h += `<div class="seg"><button data-mode="add" class="${it.mode !== 'sub' ? 'active' : ''}">Añade</button><button data-mode="sub" class="${it.mode === 'sub' ? 'active' : ''}">Borra</button></div>`;
  }
  if (sel.layer === 'citadels' && it.r !== undefined && !it.pts) h += propSlider('r', 'Radio del recinto', 8, 120, 1, it.r);
  if (sel.layer === 'ports') {
    h += propSlider('w', 'Anchura del muelle', 15, 250, 1, it.w);
    h += propSlider('len', 'Longitud de los embarcaderos', 4, 120, 1, it.len);
    h += propSlider('n', 'Embarcaderos', 0, 12, 1, it.n, '');
  }
  h += '<div class="btn-row">';
  if (it.pts && it.pts.length > 2) h += '<button class="ghost" id="selSmooth">Suavizar</button><button class="ghost" id="selSimplify">Simplificar</button>';
  h += '<button class="ghost" id="selDup">Duplicar</button><button class="ghost danger" id="selDel">Eliminar</button></div>';
  h += `<p class="small">${state.opts.selectTransform ? 'Arrastra las esquinas/lados para escalar, el tirador superior para rotar o el interior para reposicionar.' : 'Arrastra los puntos o la forma. Doble clic en el trazo añade un punto; Alt + clic sobre un punto lo quita.'}</p>`;
  return h;
}

let propEditing = false, propRaf = 0;
function bindSelection() {
  document.querySelectorAll('[data-selmode]').forEach(b => b.onclick = () => {
    state.opts.selectTransform = b.dataset.selmode === 'xform';
    renderPanel(); drawOverlay();
  });
  document.querySelectorAll('[data-prop]').forEach(inp => {
    const prop = inp.dataset.prop;
    inp.oninput = () => {
      syncSel();
      if (!selList.length) return;
      if (!propEditing) { pushHistory(); propEditing = true; }
      for (const ref of selList) {
        const item = getItem(ref);
        if (!item) continue;
        if (selList.length === 1 || ref.layer === 'walls' || ref.layer === 'citadels' || item[prop] !== undefined) {
          item[prop] = +inp.value;
        }
      }
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
    syncSel();
    if (!selList.length) return;
    pushHistory();
    const d = 20 / view.k;
    const nextSel = [];
    for (const ref of selList) {
      const it = getItem(ref);
      if (!it) continue;
      const c = structuredClone(it);
      if (c.pts) c.pts = c.pts.map(p => [p[0] + d, p[1] + d]); else { c.x += d; c.y += d; }
      if (ref.layer === 'ports') snapPort(c, 1e9);
      const arr = layerArray(ref.layer);
      arr.push(c);
      nextSel.push({ layer: ref.layer, i: arr.length - 1 });
    }
    setSelList(nextSel);
    renderPanel(); refresh();
  });
  on('selSmooth', () => {
    const it = getItem(sel); if (!it?.pts) return;
    pushHistory();
    const closed = isClosedItem(sel.layer, it);
    it.pts = simplifyPts(chaikin(it.pts, 1, closed), 0.4, closed);
    renderPanel(); refresh();
  });
  on('selSimplify', () => {
    const it = getItem(sel); if (!it?.pts) return;
    pushHistory();
    const closed = isClosedItem(sel.layer, it);
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
  syncSel();
  if (!selList.length) return;
  pushHistory();
  const byLayer = new Map();
  for (const r of selList) {
    if (!byLayer.has(r.layer)) byLayer.set(r.layer, []);
    byLayer.get(r.layer).push(r.i);
  }
  for (const [layer, indices] of byLayer) {
    const arr = layerArray(layer);
    if (!arr) continue;
    indices.sort((a, b) => b - a);
    for (const idx of indices) arr.splice(idx, 1);
  }
  setSelList([]); hover = null;
  renderPanel(); refresh();
}

// ---- Geometría de selección múltiple y caja de transformación ----
function itemPointsForBounds(ref, it) {
  if (!it) return [];
  if (it.pts && it.pts.length) {
    if (it.pts.length === 1) {
      const p = it.pts[0], rad = Math.max(it.r || 10, 6);
      return [[p[0] - rad, p[1] - rad], [p[0] + rad, p[1] + rad]];
    }
    return it.pts;
  }
  if (ref.layer === 'ports') {
    const K = 1 / (state.params.mapScale || 1);
    const pp = portParts(it, K);
    return [...pp.quay, ...pp.piers.flat()];
  }
  if (it.x !== undefined && it.r !== undefined) {
    return [[it.x - it.r, it.y - it.r], [it.x + it.r, it.y + it.r]];
  }
  return [];
}

function getSelectionBBox(list = selList) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ref of list) {
    const it = getItem(ref);
    for (const p of itemPointsForBounds(ref, it)) {
      if (p[0] < x0) x0 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[0] > x1) x1 = p[0];
      if (p[1] > y1) y1 = p[1];
    }
  }
  if (!isFinite(x0)) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (x1 - x0 < 8) { x0 = cx - 4; x1 = cx + 4; }
  if (y1 - y0 < 8) { y0 = cy - 4; y1 = cy + 4; }
  return { x0, y0, x1, y1, cx, cy, w: x1 - x0, h: y1 - y0 };
}

function getTransformHandles(box, ang = 0) {
  const rotDist = 24 / view.k;
  const c = Math.cos(ang), s = Math.sin(ang);
  const tr = (px, py) => [box.cx + (px - box.cx) * c - (py - box.cy) * s, box.cy + (px - box.cx) * s + (py - box.cy) * c];
  return [
    { id: 'rot', p: tr(box.cx, box.y0 - rotDist), top: tr(box.cx, box.y0) },
    { id: 'nw', p: tr(box.x0, box.y0) },
    { id: 'ne', p: tr(box.x1, box.y0) },
    { id: 'se', p: tr(box.x1, box.y1) },
    { id: 'sw', p: tr(box.x0, box.y1) },
    { id: 'n', p: tr(box.cx, box.y0) },
    { id: 'e', p: tr(box.x1, box.cy) },
    { id: 's', p: tr(box.cx, box.y1) },
    { id: 'w', p: tr(box.x0, box.cy) },
  ];
}

function segIntersectsBox(a, b, x0, y0, x1, y1) {
  if ((a[0] < x0 && b[0] < x0) || (a[0] > x1 && b[0] > x1) || (a[1] < y0 && b[1] < y0) || (a[1] > y1 && b[1] > y1)) return false;
  if (a[0] >= x0 && a[0] <= x1 && a[1] >= y0 && a[1] <= y1) return true;
  if (b[0] >= x0 && b[0] <= x1 && b[1] >= y0 && b[1] <= y1) return true;
  const segSeg = (p1, p2, p3, p4) => {
    const ccw = (A, B, C) => (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
  };
  return segSeg(a, b, [x0, y0], [x1, y0]) || segSeg(a, b, [x1, y0], [x1, y1]) ||
    segSeg(a, b, [x1, y1], [x0, y1]) || segSeg(a, b, [x0, y1], [x0, y0]);
}

function itemIntersectsBox(ref, it, x0, y0, x1, y1) {
  if (!it) return false;
  if (ref.layer === 'ports') return it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1;
  const pts = it.pts ? it.pts : (it.x !== undefined && it.r !== undefined ? citadelRing(it) : []);
  if (!pts.length) return false;
  for (const p of pts) if (p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1) return true;
  const closed = isClosedItem(ref.layer, it);
  const n = pts.length, lim = closed ? n : n - 1;
  for (let i = 0; i < lim; i++) {
    if (segIntersectsBox(pts[i], pts[(i + 1) % n], x0, y0, x1, y1)) return true;
  }
  return false;
}

function itemsInBox(x0, y0, x1, y1) {
  const out = [];
  if (state.step === 3) {
    state.edits.roads.forEach((r, i) => {
      const ref = { layer: 'eroads', i };
      if (itemIntersectsBox(ref, r, x0, y0, x1, y1)) out.push(ref);
    });
    return out;
  }
  const L = state.layers;
  const layers = ['rivers', 'roads', 'walls', 'cliffs', 'lakes', 'forest', 'sand', 'marsh', 'crops', 'districts', 'citadels', 'ports'];
  for (const layer of layers) {
    (L[layer] || []).forEach((it, i) => {
      const ref = { layer, i };
      if (itemIntersectsBox(ref, it, x0, y0, x1, y1)) out.push(ref);
    });
  }
  return out;
}

function cloneSelItems() {
  return selList.map(ref => ({ ref: { ...ref }, item: structuredClone(getItem(ref)) })).filter(x => x.item);
}

function selectDown(w, e) {
  syncSel();
  const tolV = 8.5 / view.k;

  // 1) En modo Transformar, comprobar tiradores de la caja delimitadora primero
  if (state.opts.selectTransform && selList.length > 0 && !e.shiftKey) {
    const box = getSelectionBBox(selList);
    if (box) {
      const handles = getTransformHandles(box, 0);
      for (const h of handles) {
        if (dist(w, h.p) <= tolV * 1.15) {
          drag = {
            type: h.id === 'rot' ? 'xform-rot' : 'xform-scale',
            handle: h.id, start: w, box, angle: 0, orig: cloneSelItems(),
            sx: e.clientX, sy: e.clientY, moved: false,
          };
          return;
        }
      }
    }
  }

  // 2) En modo Puntos con 1 elemento seleccionado, comprobar arrastre/borrado de vértice
  if (!state.opts.selectTransform && selList.length === 1 && !e.shiftKey) {
    const it = getItem(sel);
    if (it && it.pts) {
      let bi = -1, bd = tolV;
      it.pts.forEach((p, i) => { const d = dist(p, w); if (d < bd) { bd = d; bi = i; } });
      if (bi >= 0) {
        if (e.altKey) {
          const closed = isClosedItem(sel.layer, it);
          const min = closed ? 3 : (it.kind === 'paint' || it.r !== undefined ? 1 : 2);
          if (it.pts.length > min) { pushHistory(); it.pts.splice(bi, 1); renderPanel(); refresh(); }
          return;
        }
        drag = { type: 'vertex', idx: bi, sx: e.clientX, sy: e.clientY, moved: false };
        return;
      }
    }
  }

  const hit = hitTest(w);

  // 3) Shift + clic / arrastrar: alternar selección o iniciar recuadro aditivo
  if (e.shiftKey) {
    if (hit) {
      toggleSel(hit);
      renderPanel(); drawOverlay();
    } else {
      drag = { type: 'marquee', start: w, cur: w, add: true, base: selList.slice(), sx: e.clientX, sy: e.clientY, moved: false };
    }
    return;
  }

  // 4) Si clic dentro de la caja de transformación activa (o sobre un elemento ya seleccionado), mover selección
  if (state.opts.selectTransform && selList.length > 0) {
    const box = getSelectionBBox(selList);
    const inBox = box && w[0] >= box.x0 && w[0] <= box.x1 && w[1] >= box.y0 && w[1] <= box.y1;
    if ((hit && isSelected(hit)) || (!hit && inBox)) {
      drag = { type: 'xform-move', start: w, box, orig: cloneSelItems(), sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }
  }

  // 5) Clic normal sin Shift
  if (!hit) {
    if (selList.length) { setSelList([]); renderPanel(); }
    drag = { type: 'marquee', start: w, cur: w, add: false, base: [], sx: e.clientX, sy: e.clientY, moved: false };
    return;
  }
  if (!isSelected(hit)) {
    setSelList([hit]);
    renderPanel();
  }
  drag = { type: 'xform-move', start: w, box: getSelectionBBox(selList), orig: cloneSelItems(), sx: e.clientX, sy: e.clientY, moved: false };
}

function selectMove(w, e) {
  if (!drag) return;
  if (drag.type === 'marquee') {
    drag.cur = w;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) >= 3) {
      drag.moved = true;
      const x0 = Math.min(drag.start[0], w[0]), y0 = Math.min(drag.start[1], w[1]);
      const x1 = Math.max(drag.start[0], w[0]), y1 = Math.max(drag.start[1], w[1]);
      const boxed = itemsInBox(x0, y0, x1, y1);
      setSelList(drag.add ? [...drag.base, ...boxed] : boxed);
    }
    drawOverlay();
    return;
  }
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
    drag.moved = true; pushHistory();
  }
  if (drag.type === 'vertex') {
    const it = getItem(sel);
    if (!it || !it.pts) { drag = null; return; }
    const refPt = it.pts[drag.idx > 0 ? drag.idx - 1 : (it.pts.length > 1 ? 1 : 0)];
    it.pts[drag.idx] = (e.shiftKey && refPt && it.pts.length > 1) ? snap45(refPt, w) : w;
  } else if (drag.type === 'xform-move') {
    const dx = w[0] - drag.start[0], dy = w[1] - drag.start[1];
    for (const { ref, item: orig } of drag.orig) {
      const cur = getItem(ref);
      if (!cur) continue;
      if (orig.pts) cur.pts = orig.pts.map(p => [p[0] + dx, p[1] + dy]);
      else {
        cur.x = orig.x + dx; cur.y = orig.y + dy;
        if (ref.layer === 'ports') snapPort(cur, 1e9);
      }
    }
  } else if (drag.type === 'xform-rot') {
    const { cx, cy } = drag.box;
    const a0 = Math.atan2(drag.start[1] - cy, drag.start[0] - cx);
    let da = Math.atan2(w[1] - cy, w[0] - cx) - a0;
    if (e.shiftKey) da = Math.round(da / (Math.PI / 12)) * (Math.PI / 12);
    drag.angle = da;
    const cos = Math.cos(da), sin = Math.sin(da);
    const rotPt = (p) => [cx + (p[0] - cx) * cos - (p[1] - cy) * sin, cy + (p[0] - cx) * sin + (p[1] - cy) * cos];
    for (const { ref, item: orig } of drag.orig) {
      const cur = getItem(ref);
      if (!cur) continue;
      if (orig.pts) cur.pts = orig.pts.map(rotPt);
      else if (ref.layer === 'citadels') {
        const ring = citadelRing(orig);
        delete cur.x; delete cur.y; delete cur.r;
        cur.pts = ring.map(rotPt); cur.kind = 'poly'; cur.open = false;
      } else if (ref.layer === 'ports') {
        const np = rotPt([orig.x, orig.y]);
        cur.x = np[0]; cur.y = np[1]; cur.ang = orig.ang + da;
      }
    }
  } else if (drag.type === 'xform-scale') {
    const h = drag.handle, b = drag.box;
    const ux = h.includes('w') ? -1 : h.includes('e') ? 1 : 0;
    const uy = h.includes('n') ? -1 : h.includes('s') ? 1 : 0;
    const ax = e.altKey ? b.cx : (ux === -1 ? b.x1 : ux === 1 ? b.x0 : b.cx);
    const ay = e.altKey ? b.cy : (uy === -1 ? b.y1 : uy === 1 ? b.y0 : b.cy);
    const hx = ux === -1 ? b.x0 : ux === 1 ? b.x1 : b.cx;
    const hy = uy === -1 ? b.y0 : uy === 1 ? b.y1 : b.cy;
    let sx = ux !== 0 ? (w[0] - ax) / ((hx - ax) || 1) : 1;
    let sy = uy !== 0 ? (w[1] - ay) / ((hy - ay) || 1) : 1;
    if (Math.abs(sx) < 0.05) sx = (sx < 0 ? -1 : 1) * 0.05;
    if (Math.abs(sy) < 0.05) sy = (sy < 0 ? -1 : 1) * 0.05;
    if (e.shiftKey) {
      if (ux !== 0 && uy !== 0) {
        const m = Math.max(Math.abs(sx), Math.abs(sy));
        sx = Math.sign(sx || 1) * m; sy = Math.sign(sy || 1) * m;
      } else if (ux !== 0) sy = Math.abs(sx);
      else if (uy !== 0) sx = Math.abs(sy);
    }
    const sMean = Math.sqrt(Math.abs(sx * sy));
    const scalePt = (p) => [ax + (p[0] - ax) * sx, ay + (p[1] - ay) * sy];
    for (const { ref, item: orig } of drag.orig) {
      const cur = getItem(ref);
      if (!cur) continue;
      if (orig.pts) {
        cur.pts = orig.pts.map(scalePt);
        if (orig.pts.length === 1 && orig.r !== undefined) cur.r = Math.max(2, orig.r * sMean);
      } else if (ref.layer === 'citadels') {
        const ring = citadelRing(orig);
        delete cur.x; delete cur.y; delete cur.r;
        cur.pts = ring.map(scalePt); cur.kind = 'poly'; cur.open = false;
      } else if (ref.layer === 'ports') {
        const np = scalePt([orig.x, orig.y]);
        cur.x = np[0]; cur.y = np[1];
        cur.w = Math.max(10, orig.w * Math.abs(sx));
        cur.len = Math.max(4, orig.len * Math.abs(sy));
      }
    }
  }
  drawOverlay();
  if (state.step === 1) {
    cancelAnimationFrame(propRaf);
    propRaf = requestAnimationFrame(refresh);
  }
}

function insertVertex(w) {
  if (state.opts.selectTransform || selList.length !== 1) return;
  const it = getItem(sel);
  if (!it || !it.pts || it.pts.length < 2) return;
  const closed = isClosedItem(sel.layer, it);
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
    const selB = buildings.find(x => x.ids.includes(selected));
    if (!selB || selB.ids.includes(b.ids[0])) { selected = b.ids[0]; return; }
    if (!touches(selB, b)) { selected = b.ids[0]; flashHint('Solo se pueden unir edificios contiguos'); return; }
    pushHistory();
    state.edits.merges.push([selB.ids[0], b.ids[0]]);
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
function strokePreviewWidth() {
  if (state.tool === 'path') return state.opts.userRoadWidth;
  const el = state.opts.element;
  if (el === 'wall' || el === 'citadel') return state.opts.wallWidth;
  if (state.tool !== 'stroke') return 0;
  if (el === 'water') return state.opts.riverWidth;
  if (el === 'road') return state.opts.roadWidth;
  if (el === 'cliff') return state.opts.cliffWidth;
  if (['forest', 'soil', 'district'].includes(el)) return state.opts.brushR * 2;
  return 0;
}

function drawOverlay() {
  const k = view.k;
  const sw = (px) => (px / k).toFixed(2);
  let s = '';
  const accent = '#B5552F';
  if (shapeDrag) {
    const pts = shapeDragRing(shapeDrag);
    if (pts.length >= 3) {
      s += `<path d="${lineToPath(pts, true)}" fill="${accent}" fill-opacity=".12" stroke="${accent}" stroke-width="${sw(1.5)}" stroke-dasharray="${sw(5)} ${sw(4)}"/>`;
    }
  }
  if (poly) {
    let pts = poly.pts.slice();
    if (poly.dragging && poly.raw) pts = pts.concat(poly.raw);
    const width = strokePreviewWidth();
    const all = cursor && !poly.dragging ? pts.concat([cursor]) : pts;
    if (width && pts.length > 1) s += `<path d="${lineToPath(pts, closedTool() && pts.length > 2)}" fill="none" stroke="${accent}" stroke-opacity=".22" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (closedTool() && all.length > 2) s += `<path d="${lineToPath(all, true)}" fill="${accent}" fill-opacity=".08" stroke="none"/>`;
    s += `<path d="${lineToPath(all, closedTool() && all.length > 2)}" fill="none" stroke="${accent}" stroke-width="${sw(1.5)}" stroke-dasharray="${sw(5)} ${sw(4)}"/>`;
    for (const p of poly.pts) s += `<circle cx="${p[0]}" cy="${p[1]}" r="${sw(2.5)}" fill="${accent}"/>`;
  }
  if (brush) {
    const r = state.opts.brushR;
    s += `<path d="${lineToPath(brush.pts)}" fill="none" stroke="${accent}" stroke-opacity=".25" stroke-width="${r * 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (cursor && (isBrushTool() || state.tool === 'settle')) {
    s += `<circle cx="${cursor[0]}" cy="${cursor[1]}" r="${state.opts.brushR}" fill="none" stroke="${PAL.ink}" stroke-width="${sw(1)}" stroke-dasharray="${sw(3)} ${sw(3)}"/>`;
  }
  if (cursor && state.tool === 'port') {
    const sn = snapToShore(cursor, waterShape(), 40 + 30 / view.k);
    if (sn) s += portOutline({ ...sn, w: state.opts.portW, len: state.opts.portLen, n: state.opts.portN }, accent, 0.25, sw);
  }
  if (state.tool === 'select') {
    syncSel();
    if (hover && !isSelected(hover)) s += outlineItem(hover, accent, 0.18, sw, false);
    for (const ref of selList) {
      s += outlineItem(ref, accent, 0.26, sw, true);
    }
    if (state.opts.selectTransform && selList.length > 0) {
      const box = (drag && drag.type === 'xform-rot' && drag.box) ? drag.box : getSelectionBBox(selList);
      const ang = (drag && drag.type === 'xform-rot') ? (drag.angle || 0) : 0;
      if (box) {
        const handles = getTransformHandles(box, ang);
        const byId = Object.fromEntries(handles.map(h => [h.id, h]));
        const corners = [byId.nw.p, byId.ne.p, byId.se.p, byId.sw.p];
        s += `<path d="${lineToPath(corners, true)}" fill="${accent}" fill-opacity="0.05" stroke="${accent}" stroke-width="${sw(1.5)}" stroke-dasharray="${sw(5)} ${sw(3)}"/>`;
        s += `<line x1="${byId.rot.top[0]}" y1="${byId.rot.top[1]}" x2="${byId.rot.p[0]}" y2="${byId.rot.p[1]}" stroke="${accent}" stroke-width="${sw(1.5)}"/>`;
        const hs = 4.2 / k;
        for (const h of handles) {
          if (h.id === 'rot') {
            s += `<circle cx="${h.p[0]}" cy="${h.p[1]}" r="${sw(4.8)}" fill="#fff" stroke="${accent}" stroke-width="${sw(1.8)}"/>`;
          } else {
            s += `<rect x="${h.p[0] - hs}" y="${h.p[1] - hs}" width="${hs * 2}" height="${hs * 2}" fill="#fff" stroke="${accent}" stroke-width="${sw(1.5)}"/>`;
          }
        }
      }
    } else if (selList.length === 1) {
      const it = getItem(sel);
      if (it) {
        if (it.pts) for (const p of it.pts) s += `<circle cx="${p[0]}" cy="${p[1]}" r="${sw(3.5)}" fill="#fff" stroke="${accent}" stroke-width="${sw(1.5)}"/>`;
        else s += `<circle cx="${it.x}" cy="${it.y}" r="${sw(4)}" fill="#fff" stroke="${accent}" stroke-width="${sw(1.5)}"/>`;
      }
    }
    if (drag && drag.type === 'marquee' && drag.moved) {
      const rx = Math.min(drag.start[0], drag.cur[0]), ry = Math.min(drag.start[1], drag.cur[1]);
      const rw = Math.abs(drag.cur[0] - drag.start[0]), rh = Math.abs(drag.cur[1] - drag.start[1]);
      s += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${accent}" fill-opacity="0.1" stroke="${accent}" stroke-width="${sw(1.2)}" stroke-dasharray="${sw(4)} ${sw(3)}"/>`;
    }
  }
  if (hover && state.tool === 'erase') {
    s += outlineItem(hover, accent, 0.3, sw, true);
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
  if (ref.layer === 'citadels' && !it.pts) return `<path d="${ringsToPath([citadelRing(it)])}" fill="${color}" fill-opacity="${op}" stroke="${color}" stroke-width="${sw(strong ? 2 : 1.5)}"/>`;
  if (!it.pts || !it.pts.length) return '';
  const closed = isClosedItem(ref.layer, it);
  const isWall = ref.layer === 'walls' || ref.layer === 'citadels';
  const w = closed ? (isWall ? (it.width || 3.6) : 0) : (it.width || (it.r ? it.r * 2 : 0));
  let s = '';
  if (w) s += `<path d="${lineToPath(it.pts, closed)}" fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (closed && !isWall) s += `<path d="${lineToPath(it.pts, true)}" fill="${color}" fill-opacity="${op * 0.5}" stroke="none"/>`;
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
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.tool === 'select' && selList.length) { e.preventDefault(); deleteSelected(); }
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; svg.style.cursor = ''; } });
void paintDistrict;

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
    gw: GW, gh: GH,
    density: b64(state.density), districts: b64(state.districts), theme: themeState,
  };
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'mapa.cartografo.json');
}
function unpackGrid(str, gw, gh) {
  if (gw === GW && gh === GH) return unb64(str || '', GW * GH);
  const src = unb64(str || '', gw * gh);
  const dst = new Uint8Array(GW * GH);
  for (let y = 0; y < Math.min(gh, GH); y++) dst.set(src.subarray(y * gw, y * gw + Math.min(gw, GW)), y * GW);
  return dst;
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
      syncAspect();
      state.edits = d.edits || { merges: [], deleted: [], roads: [] };
      const gw = d.gw || 160, gh = d.gh || 120;
      state.density = unpackGrid(d.density, gw, gh);
      state.districts = unpackGrid(d.districts, gw, gh);
      if (d.theme && d.theme.id) { themeState = d.theme; applyTheme(currentBase()); saveTheme(); }
      state.gen = null;
      fit();
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
