// ---------------------------------------------------------------------------
// Almacén de personajes y estado de partida en Redis.
//   fu:[<partida>:]personajes  hash  id → JSON del personaje (con rev y discord)
//   fu:[<partida>:]relojes     hash  clave → { nombre, secciones, llenas }
//   fu:[<partida>:]combate     JSON  estado del conflicto
//   fu:usuarios                hash  id de Discord → { id, nombre, visto }
// ---------------------------------------------------------------------------
import { hgetallJSON, hgetJSON, hsetJSON, hdel, getJSON, setJSON, del, tocar } from './kv.js';
import { normalizarPersonaje, FORMATO } from '../assets/js/rules.js';

const H_USR = 'fu:usuarios';

export function kPj(partidaId) {
  return (!partidaId || partidaId === 'principal' || partidaId === 'default') ? 'fu:personajes' : `fu:partida:${partidaId}:personajes`;
}
export function kReloj(partidaId) {
  return (!partidaId || partidaId === 'principal' || partidaId === 'default') ? 'fu:relojes' : `fu:partida:${partidaId}:relojes`;
}
export function kCombate(partidaId) {
  return (!partidaId || partidaId === 'principal' || partidaId === 'default') ? 'fu:combate' : `fu:partida:${partidaId}:combate`;
}

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export class Conflicto extends Error {}

// ------------------------------------------------------------------ personajes
export async function listar(partidaId = 'principal') {
  const todos = Object.values(await hgetallJSON(kPj(partidaId))).filter(Boolean);
  return todos.sort((a, b) => norm(a.identidad && a.identidad.nombre).localeCompare(norm(b.identidad && b.identidad.nombre)));
}

export async function obtener(id, partidaId = null) {
  if (partidaId) {
    return (await hgetJSON(kPj(partidaId), id)) || null;
  }
  // Si no se indica partidaId, busca primero en la principal
  let pj = await hgetJSON(kPj('principal'), id);
  if (pj) return pj;
  // Búsqueda en caso de partidaId omitido: comprobar partidas si existe
  const partidasMapa = await hgetallJSON('fu:partidas');
  for (const p of Object.values(partidasMapa || {}).filter(Boolean)) {
    if (p.id === 'principal') continue;
    const encontrado = await hgetJSON(kPj(p.id), id);
    if (encontrado) return encontrado;
  }
  return null;
}

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
export async function guardar(pj, opts = {}, partidaIdArg = null) {
  const pId = partidaIdArg || (typeof opts === 'string' ? opts : opts.partidaId) || 'principal';
  const rev = (opts && opts.rev !== undefined) ? opts.rev : null;
  const forzar = !!(opts && opts.forzar);
  const previo = await obtener(pj.id, pId);
  if (previo && !forzar) {
    if (rev === null || rev === undefined) throw new Conflicto('Ya existe un personaje con este identificador.');
    if (Number(rev) !== Number(previo.rev || 0)) throw new Conflicto('El personaje ha cambiado desde que lo cargaste (quizá desde Discord).');
  }
  pj.discord = previo ? (previo.discord || null) : (pj.discord && pj.discord.id ? pj.discord : null);
  return escribir(pj, previo, pId);
}

/** Escribe un personaje ya leído de la base de datos (cambios del bot). */
export async function escribir(pj, previoOrPartidaId = undefined, partidaIdArg = 'principal') {
  let previo = undefined;
  let pId = partidaIdArg;
  if (typeof previoOrPartidaId === 'string') {
    pId = previoOrPartidaId;
    previo = undefined;
  } else {
    previo = previoOrPartidaId;
  }
  const base = previo === undefined ? await obtener(pj.id, pId) : previo;
  pj.rev = Number((base && base.rev) || 0) + 1;
  pj.modificado = new Date().toISOString();
  await hsetJSON(kPj(pId), pj.id, pj);
  await tocar(pId);
  return pj;
}

export async function eliminar(id, partidaId = 'principal') {
  await hdel(kPj(partidaId), id);
  await tocar(partidaId);
}

/**
 * Asigna un personaje a un usuario de Discord (o lo deja libre con null).
 * Un jugador puede llevar varios personajes.
 */
export async function asignar(id, usuario, partidaId = 'principal') {
  const pj = await obtener(id, partidaId);
  if (!pj) throw new Error('Personaje no encontrado.');
  pj.discord = usuario ? { id: usuario.id, nombre: usuario.nombre } : null;
  pj.rev = Number(pj.rev || 0) + 1;
  pj.modificado = new Date().toISOString();
  await hsetJSON(kPj(partidaId), pj.id, pj);
  await tocar(partidaId);
  return { pj, liberados: 0 };
}

/** Versión pública (visor): sin el id de Discord. */
export function publico(pj) {
  const p = { ...pj };
  if (p.discord) p.discord = { nombre: p.discord.nombre };
  return p;
}

// ------------------------------------------------------------------ relojes
export const relojes = async (partidaId = 'principal') =>
  Object.values(await hgetallJSON(kReloj(partidaId))).filter(Boolean)
    .sort((a, b) => (a.creado || '').localeCompare(b.creado || ''));

export const reloj = (nombre, partidaId = 'principal') => hgetJSON(kReloj(partidaId), norm(nombre));
export const guardarReloj = (r, partidaId = 'principal') => hsetJSON(kReloj(partidaId), norm(r.nombre), r);
export const borrarReloj = (nombre, partidaId = 'principal') => hdel(kReloj(partidaId), norm(nombre));

// ------------------------------------------------------------------ combate
export const combate = (partidaId = 'principal') => getJSON(kCombate(partidaId));
export async function guardarCombate(c, partidaId = 'principal') { await setJSON(kCombate(partidaId), c); await tocar(partidaId); }
export async function terminarCombate(partidaId = 'principal') { await del(kCombate(partidaId)); await tocar(partidaId); }

// ------------------------------------------------------------------ usuarios conocidos
export async function registrarUsuario(u) {
  if (!u || !u.id) return;
  await hsetJSON(H_USR, u.id, { id: u.id, nombre: u.nombre, visto: new Date().toISOString() }).catch(() => {});
}
export const usuarios = async () => Object.values(await hgetallJSON(H_USR)).filter(Boolean);
