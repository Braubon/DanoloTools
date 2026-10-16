// ---------------------------------------------------------------------------
// Almacén de personajes y estado de partida en Redis.
//   fu:personajes  hash  id → JSON del personaje (con rev y discord)
//   fu:relojes     hash  clave → { nombre, secciones, llenas }
//   fu:combate     JSON  estado del conflicto
//   fu:usuarios    hash  id de Discord → { id, nombre, visto }
// ---------------------------------------------------------------------------
import { hgetallJSON, hgetJSON, hsetJSON, hdel, getJSON, setJSON, del, pipe } from './kv.js';
import { normalizarPersonaje, FORMATO } from '../assets/js/rules.js';

const H_PJ = 'fu:personajes';
const H_RELOJ = 'fu:relojes';
const K_COMBATE = 'fu:combate';
const H_USR = 'fu:usuarios';

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export class Conflicto extends Error {}

// ------------------------------------------------------------------ personajes
export async function listar() {
  const todos = Object.values(await hgetallJSON(H_PJ)).filter(Boolean);
  return todos.sort((a, b) => norm(a.identidad && a.identidad.nombre).localeCompare(norm(b.identidad && b.identidad.nombre)));
}
export const obtener = (id) => hgetJSON(H_PJ, id);

/** Valida y prepara un JSON recibido (importación o generador). */
export function preparar(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('El archivo no contiene un personaje.');
  if (datos.formato && datos.formato !== FORMATO) throw new Error('El archivo no es un personaje del generador.');
  if (!datos.identidad || !Array.isArray(datos.clases)) throw new Error('El archivo no tiene el formato de personaje esperado.');
  const pj = normalizarPersonaje(datos);
  delete pj.calculado;
  return pj;
}

/**
 * Guarda un personaje recibido desde fuera (web o importación).
 * - rev: versión con la que se cargó. Si el personaje existe y la versión no
 *   coincide (o no se indica), lanza Conflicto salvo que forzar sea true.
 * - La asignación a jugador (discord) solo cambia con asignar(); aquí se
 *   conserva la guardada. En personajes nuevos se acepta la que venga.
 */
export async function guardar(pj, { rev = null, forzar = false } = {}) {
  const previo = await obtener(pj.id);
  if (previo && !forzar) {
    if (rev === null || rev === undefined) throw new Conflicto('Ya existe un personaje con este identificador.');
    if (Number(rev) !== Number(previo.rev || 0)) throw new Conflicto('El personaje ha cambiado desde que lo cargaste (quizá desde Discord).');
  }
  pj.discord = previo ? (previo.discord || null) : (pj.discord && pj.discord.id ? pj.discord : null);
  return escribir(pj, previo);
}

/** Escribe un personaje ya leído de la base de datos (cambios del bot). */
export async function escribir(pj, previo) {
  const base = previo === undefined ? await obtener(pj.id) : previo;
  pj.rev = Number((base && base.rev) || 0) + 1;
  pj.modificado = new Date().toISOString();
  await hsetJSON(H_PJ, pj.id, pj);
  return pj;
}

export const eliminar = (id) => hdel(H_PJ, id);

/** Asigna un personaje a un usuario de Discord (y libera el que tuviera antes). */
export async function asignar(id, usuario) {
  const todos = await listar();
  const pj = todos.find((p) => p.id === id);
  if (!pj) throw new Error('Personaje no encontrado.');
  const cambios = [];
  if (usuario) {
    for (const p of todos) {
      if (p.id !== id && p.discord && p.discord.id === usuario.id) {
        p.discord = null; p.rev = Number(p.rev || 0) + 1;
        cambios.push(['HSET', H_PJ, p.id, JSON.stringify(p)]);
      }
    }
  }
  pj.discord = usuario ? { id: usuario.id, nombre: usuario.nombre } : null;
  pj.rev = Number(pj.rev || 0) + 1;
  pj.modificado = new Date().toISOString();
  cambios.push(['HSET', H_PJ, pj.id, JSON.stringify(pj)]);
  await pipe(cambios);
  return { pj, liberados: cambios.length - 1 };
}

/** Versión pública (visor): sin el id de Discord. */
export function publico(pj) {
  const p = { ...pj };
  if (p.discord) p.discord = { nombre: p.discord.nombre };
  return p;
}

// ------------------------------------------------------------------ relojes
export const relojes = async () => Object.values(await hgetallJSON(H_RELOJ)).filter(Boolean)
  .sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));
export const reloj = (nombre) => hgetJSON(H_RELOJ, norm(nombre));
export const guardarReloj = (r) => hsetJSON(H_RELOJ, norm(r.nombre), r);
export const borrarReloj = (nombre) => hdel(H_RELOJ, norm(nombre));

// ------------------------------------------------------------------ combate
export const combate = () => getJSON(K_COMBATE);
export const guardarCombate = (c) => setJSON(K_COMBATE, c);
export const terminarCombate = () => del(K_COMBATE);

// ------------------------------------------------------------------ usuarios conocidos
export async function registrarUsuario(u) {
  if (!u || !u.id) return;
  await hsetJSON(H_USR, u.id, { id: u.id, nombre: u.nombre, visto: new Date().toISOString() }).catch(() => {});
}
export const usuarios = async () => Object.values(await hgetallJSON(H_USR)).filter(Boolean);
