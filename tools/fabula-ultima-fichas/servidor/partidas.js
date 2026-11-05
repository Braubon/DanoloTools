// ---------------------------------------------------------------------------
// Gestión de partidas múltiples para Fábula RO.
//   fu:partidas    hash  id → JSON de la partida
// ---------------------------------------------------------------------------
import { hgetallJSON, hgetJSON, hsetJSON, hdel, tocar } from './kv.js';
import * as P from './personajes.js';

const H_PARTIDAS = 'fu:partidas';
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const PARTIDA_DEFECTO = {
  id: 'principal',
  nombre: 'Partida Principal',
  descripcion: 'Partida por defecto',
  rolJugador: null,
  rolDj: null,
  canales: [],
  activa: true
};

/** Lista todas las partidas guardadas. Si no hay ninguna, inicializa la principal. */
export async function listar() {
  const mapa = await hgetallJSON(H_PARTIDAS);
  const lista = Object.values(mapa || {}).filter(Boolean);
  if (!lista.length) {
    const d = { ...PARTIDA_DEFECTO, creado: new Date().toISOString() };
    await hsetJSON(H_PARTIDAS, d.id, d).catch(() => {});
    return [d];
  }
  return lista.sort((a, b) => (a.nombre || a.id).localeCompare(b.nombre || b.id));
}

/** Obtiene una partida por su ID. */
export async function obtener(id) {
  const pId = (!id || id === 'default') ? 'principal' : id;
  const p = await hgetJSON(H_PARTIDAS, pId);
  if (p) return p;
  if (pId === 'principal') return { ...PARTIDA_DEFECTO, creado: new Date().toISOString() };
  return null;
}

/** Guarda o actualiza una partida. */
export async function guardar(datos) {
  if (!datos || typeof datos !== 'object') throw new Error('Datos de partida no válidos.');
  let id = String(datos.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  if (!id) id = norm(datos.nombre).replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9_-]{2,40}$/.test(id)) throw new Error('El ID de la partida debe tener entre 2 y 40 caracteres alfanuméricos o guiones.');

  const previo = await hgetJSON(H_PARTIDAS, id);
  const partida = {
    id,
    nombre: String(datos.nombre || id).trim().slice(0, 60),
    descripcion: String(datos.descripcion || '').trim().slice(0, 200),
    rolJugador: datos.rolJugador ? String(datos.rolJugador).trim() : null,
    rolDj: datos.rolDj ? String(datos.rolDj).trim() : null,
    canales: Array.isArray(datos.canales) ? datos.canales.map(String).map((s) => s.trim()).filter(Boolean) : [],
    activa: datos.activa !== false,
    creado: (previo && previo.creado) || new Date().toISOString(),
    modificado: new Date().toISOString()
  };
  await hsetJSON(H_PARTIDAS, id, partida);
  await tocar(id);
  return partida;
}

/** Elimina una partida. */
export async function eliminar(id) {
  if (!id || id === 'principal') throw new Error('No puedes eliminar la partida principal.');
  await hdel(H_PARTIDAS, id);
  await tocar(id);
  return true;
}

/** Comprueba el rol del usuario en una partida específica. */
export function rolEnPartida(partida, miembroInfo) {
  if (!miembroInfo) return 'espectador';
  if (miembroInfo.esDjGlobal) return 'dj';
  if (partida.rolDj && miembroInfo.roles.includes(partida.rolDj)) return 'dj';
  if (partida.rolJugador) {
    return miembroInfo.roles.includes(partida.rolJugador) ? 'jugador' : 'bloqueado';
  }
  // Sin rol específico de jugador: cualquier miembro del servidor tiene acceso de jugador
  return 'jugador';
}

/** Determina la partida correspondiente según el canal, rol o personaje. */
export async function determinarPartida({ channelId, userId, memberRoles = [], pjId = null }) {
  const todas = await listar();
  if (todas.length <= 1) return (todas[0] && todas[0].id) || 'principal';

  // 1. Por canal de Discord vinculado
  if (channelId) {
    const cMatch = todas.find((p) => (p.canales || []).includes(String(channelId)));
    if (cMatch) return cMatch.id;
  }

  // 2. Por personaje concreto si se pasa pjId
  if (pjId) {
    for (const p of todas) {
      const tienePj = await P.obtener(pjId, p.id);
      if (tienePj) return p.id;
    }
  }

  // 3. Por personaje asignado al usuario
  if (userId) {
    const partidasConPj = [];
    for (const p of todas) {
      const pjs = await P.listar(p.id);
      if (pjs.some((pj) => pj.discord && pj.discord.id === userId)) {
        partidasConPj.push(p.id);
      }
    }
    if (partidasConPj.length === 1) return partidasConPj[0];
  }

  // 4. Por rol exclusivo del usuario
  if (memberRoles.length) {
    const porRol = todas.filter((p) =>
      (p.rolJugador && memberRoles.includes(p.rolJugador)) ||
      (p.rolDj && memberRoles.includes(p.rolDj))
    );
    if (porRol.length === 1) return porRol[0].id;
  }

  return 'principal';
}
