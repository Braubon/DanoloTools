// ---------------------------------------------------------------------------
// Escena de combate en Redis:
//   fu:pnj         hash  id → ficha de PNJ (plantilla, ver assets/js/pnj.js)
//   fu:campo       JSON  { enemigos: [instancia] }  PNJ colocados en el campo
//   fu:formacion   hash  id de PJ → { fila, orden }
//   fu:imagenes    hash  'pj:<id>' | 'pnj:<id>' → imagen en data URL (124×124)
//   fu:imgver      hash  misma clave → versión (para refrescar la caché)
//
// Instancia: { id, plantilla, nombre, lado: 'enemigo'|'aliado',
//              fila: 'vanguardia'|'retaguardia', orden, pv, pm, estados: [] }
// Las estadísticas salen siempre de la plantilla; la instancia solo guarda
// su estado. Al borrar una plantilla se retiran sus instancias.
// ---------------------------------------------------------------------------
import { hgetallJSON, hgetJSON, hsetJSON, hdel, getJSON, setJSON, cmd, hgetall, tocar } from './kv.js';
import { normalizarPnj, crisisPnj, aplicarAfinidad } from '../assets/js/pnj.js';

const H_PNJ = 'fu:pnj';
const K_CAMPO = 'fu:campo';
const H_FORM = 'fu:formacion';
const H_IMG = 'fu:imagenes';
const H_IMGV = 'fu:imgver';

export const FILAS = ['vanguardia', 'retaguardia'];
export const LADOS = ['enemigo', 'aliado'];
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const uid = () => Math.random().toString(36).slice(2, 8);

// ------------------------------------------------------------------ plantillas
export async function plantillas() {
  return Object.values(await hgetallJSON(H_PNJ)).filter(Boolean).sort((a, b) => norm(a.nombre).localeCompare(norm(b.nombre)));
}
export const plantilla = (id) => hgetJSON(H_PNJ, id);

/** Guarda una ficha de PNJ. Conserva el nivel revelado si ya existía. */
export async function guardarPlantilla(datos, { reemplazar = true } = {}) {
  const t = normalizarPnj(datos);
  const previo = await plantilla(t.id);
  if (previo && !reemplazar) { const e = new Error(`Ya existe un PNJ con el identificador «${t.id}».`); e.conflicto = true; throw e; }
  t.revelado = previo ? previo.revelado || 0 : 0;
  t.modificado = new Date().toISOString();
  await hsetJSON(H_PNJ, t.id, t);
  // Ajusta los PV/PM de sus instancias si el máximo ha bajado.
  const c = await campo();
  let cambia = false;
  for (const i of c.enemigos.filter((x) => x.plantilla === t.id)) {
    if (i.pv > t.pv) { i.pv = t.pv; cambia = true; }
    if (i.pm > t.pm) { i.pm = t.pm; cambia = true; }
  }
  if (cambia) await setJSON(K_CAMPO, c);
  await tocar();
  return { plantilla: t, existia: !!previo };
}

export async function eliminarPlantilla(id) {
  await hdel(H_PNJ, id);
  await borrarImagen(`pnj:${id}`);
  const c = await campo();
  const antes = c.enemigos.length;
  c.enemigos = c.enemigos.filter((i) => i.plantilla !== id);
  if (c.enemigos.length !== antes) await setJSON(K_CAMPO, c);
  await tocar();
}

export async function revelar(id, nivel) {
  const t = await plantilla(id);
  if (!t) throw new Error('Ese PNJ ya no existe.');
  t.revelado = [0, 10, 13, 16].includes(Number(nivel)) ? Number(nivel) : 0;
  await hsetJSON(H_PNJ, id, t);
  await tocar();
  return t;
}

// ------------------------------------------------------------------ campo
export async function campo() {
  const c = await getJSON(K_CAMPO);
  return c && Array.isArray(c.enemigos) ? c : { enemigos: [] };
}
export async function guardarCampo(c) { await setJSON(K_CAMPO, c); await tocar(); }

/** Nombres libres: «Lobo», o «Lobo A», «Lobo B»… si hay varios. */
function nombresLibres(base, n, ocupados) {
  const usados = new Set(ocupados.map(norm));
  if (n === 1 && !usados.has(norm(base)) && !ocupados.some((x) => norm(x).startsWith(norm(base) + ' '))) return [base];
  const out = [];
  for (let k = 0; out.length < n && k < 200; k++) {
    const letra = k < 26 ? String.fromCharCode(65 + k) : String(k + 1);
    const nombre = `${base} ${letra}`;
    if (!usados.has(norm(nombre))) { out.push(nombre); usados.add(norm(nombre)); }
  }
  return out;
}

/** Coloca PNJ de una plantilla en el campo. */
export async function sacar(t, { cantidad = 1, fila = 'vanguardia', lado = 'enemigo', nombre = '' } = {}) {
  const c = await campo();
  const base = String(nombre || t.nombre).trim().slice(0, 60) || t.nombre;
  const n = Math.max(1, Math.min(12, Number(cantidad) || 1));
  if (c.enemigos.length + n > 30) throw new Error('Máximo 30 PNJ en el campo.');
  // Si ya había uno con el nombre base a secas, pasa a llamarse «… A».
  const solo = c.enemigos.find((i) => i.plantilla === t.id && norm(i.nombre) === norm(base));
  if (solo && !nombre) solo.nombre = nombresLibres(base, 1, c.enemigos.filter((x) => x !== solo).map((x) => x.nombre).concat([base]))[0];
  const nombres = nombresLibres(base, n, c.enemigos.map((i) => i.nombre));
  const f = FILAS.includes(fila) ? fila : 'vanguardia';
  const l = LADOS.includes(lado) ? lado : 'enemigo';
  const orden = c.enemigos.filter((i) => i.lado === l && i.fila === f).length;
  const nuevos = nombres.map((nm, k) => ({ id: uid(), plantilla: t.id, nombre: nm, lado: l, fila: f, orden: orden + k, pv: t.pv, pm: t.pm, estados: [] }));
  c.enemigos.push(...nuevos);
  await guardarCampo(c);
  return nuevos;
}

/** Busca una instancia por id o por nombre (exacto o parcial). */
export function buscarInstancia(c, valor) {
  if (!valor) return null;
  const n = norm(valor);
  return c.enemigos.find((i) => i.id === valor) || c.enemigos.find((i) => norm(i.nombre) === n) || c.enemigos.find((i) => norm(i.nombre).includes(n)) || null;
}

export async function retirar(id) {
  const c = await campo();
  const i = c.enemigos.find((x) => x.id === id);
  c.enemigos = c.enemigos.filter((x) => x.id !== id);
  await guardarCampo(c);
  return i;
}

/** Retira todos los PNJ de un lado (o todos si no se indica). */
export async function vaciar(lado = null) {
  const c = await campo();
  const antes = c.enemigos.length;
  c.enemigos = lado ? c.enemigos.filter((i) => i.lado !== lado) : [];
  if (c.enemigos.length !== antes) await guardarCampo(c);
  return antes - c.enemigos.length;
}

/**
 * Daño a una instancia con las afinidades de su plantilla. Muta la instancia.
 * Devuelve { antes, despues, res, entraCrisis, saleCrisis, cae }.
 */
export function danar(inst, t, cantidad, tipo, { ignoraResistencia = false } = {}) {
  const res = aplicarAfinidad(t, cantidad, tipo, { ignoraResistencia });
  const antes = inst.pv;
  inst.pv = res.cura ? Math.min(t.pv, inst.pv + res.final) : Math.max(0, inst.pv - res.final);
  return { antes, despues: inst.pv, res, ...cruces(antes, inst.pv, t) };
}

export function cruces(antes, despues, t) {
  const cr = crisisPnj(t);
  return { entraCrisis: despues <= cr && antes > cr && despues > 0, saleCrisis: despues > cr && antes <= cr, cae: despues === 0 && antes > 0 };
}

// ------------------------------------------------------------------ formación de PJ
export const formacion = async () => hgetallJSON(H_FORM);
export async function colocarPj(id, datos) {
  const previo = (await hgetJSON(H_FORM, id)) || {};
  await hsetJSON(H_FORM, id, { ...previo, ...datos });
}
export async function olvidarPj(id) {
  await hdel(H_FORM, id);
  await borrarImagen(`pj:${id}`);
}

// ------------------------------------------------------------------ imágenes
const MAX_IMAGEN = 160 * 1024;
export const versionesImagen = () => hgetall(H_IMGV);
export const imagen = async (clave) => cmd('HGET', H_IMG, clave);

export async function guardarImagen(clave, dataUrl) {
  if (!/^(pj|pnj):[\w-]{1,80}$/.test(clave)) throw new Error('Clave de imagen no válida.');
  if (!/^data:image\/(png|webp|jpeg|gif);base64,[A-Za-z0-9+/=]+$/.test(String(dataUrl || ''))) throw new Error('La imagen debe ser PNG, WebP, JPEG o GIF.');
  if (dataUrl.length > MAX_IMAGEN) throw new Error('La imagen es demasiado grande (máximo unos 120 KB).');
  const ver = Date.now().toString(36);
  await cmd('HSET', H_IMG, clave, dataUrl);
  await cmd('HSET', H_IMGV, clave, ver);
  await tocar();
  return ver;
}

export async function borrarImagen(clave) {
  await hdel(H_IMG, clave);
  await hdel(H_IMGV, clave);
  await tocar();
}
