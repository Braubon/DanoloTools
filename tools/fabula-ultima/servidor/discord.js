// ---------------------------------------------------------------------------
// Utilidades de Discord: verificación de firmas, API REST y rol DJ.
// ---------------------------------------------------------------------------
import { getJSON, setJSON } from './kv.js';

export const API = () => (process.env.DISCORD_API_BASE || 'https://discord.com/api/v10').replace(/\/$/, '');
export const env = (k) => (process.env[k] || '').trim();
export const nombreRolDj = () => env('DJ_ROLE_NAME') || 'DJ';

const hex = (s) => new Uint8Array((s.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));

/** Comprueba la firma Ed25519 que Discord envía con cada interacción. */
export async function verificarFirma(cuerpo, firma, marca) {
  const clave = env('DISCORD_PUBLIC_KEY');
  if (!clave || !firma || !marca) return false;
  try {
    const k = await crypto.subtle.importKey('raw', hex(clave), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, k, hex(firma), new TextEncoder().encode(marca + cuerpo));
  } catch (e) {
    return false;
  }
}

/** Llamada a la API de Discord con el token del bot. */
export async function api(ruta, { method = 'GET', body, auth } = {}) {
  const headers = { Authorization: auth || `Bot ${env('DISCORD_BOT_TOKEN')}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(API() + ruta, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch (e) { datos = texto; }
  if (!r.ok) {
    const msg = (datos && datos.message) || texto || r.status;
    const err = new Error(`Discord ${r.status}: ${msg}`);
    err.status = r.status; err.datos = datos;
    throw err;
  }
  return datos;
}

/** Ids de los roles del servidor cuyo nombre coincide con el rol de DJ. */
export async function rolesDj(guildId) {
  if (!guildId || !env('DISCORD_BOT_TOKEN')) return [];
  const clave = `fu:cache:roles-dj:${guildId}`;
  const cache = await getJSON(clave).catch(() => null);
  if (cache) return cache;
  const roles = await api(`/guilds/${guildId}/roles`);
  const nombre = nombreRolDj().toLowerCase();
  const ids = roles.filter((r) => r.name.trim().toLowerCase() === nombre).map((r) => r.id);
  await setJSON(clave, ids, 600).catch(() => {});
  return ids;
}

/** ¿El miembro (tal como llega en la interacción) tiene el rol DJ? */
export async function miembroEsDj(member, guildId) {
  if (!member) return false;
  const ids = await rolesDj(guildId).catch(() => []);
  return (member.roles || []).some((r) => ids.includes(r));
}

/**
 * Papel del usuario en el servidor de la partida (para la web; caché 5 min):
 * 'dj' si tiene el rol DJ, 'jugador' si es miembro del servidor, null si no.
 */
export async function rolUsuario(userId) {
  const guild = env('DISCORD_GUILD_ID');
  if (!guild || !userId) return null;
  const clave = `fu:cache:rol:${userId}`;
  const cache = await getJSON(clave).catch(() => null);
  if (cache) return cache.rol;
  let rol = null;
  try {
    const m = await api(`/guilds/${guild}/members/${userId}`);
    rol = (await miembroEsDj(m, guild)) ? 'dj' : 'jugador';
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  await setJSON(clave, { rol }, 300).catch(() => {});
  return rol;
}

/**
 * Información completa del miembro en el servidor (roles, nick, etc.).
 */
export async function miembroServidor(userId) {
  const guild = env('DISCORD_GUILD_ID');
  if (!guild || !userId) return null;
  const clave = `fu:cache:miembro:${userId}`;
  const cache = await getJSON(clave).catch(() => null);
  if (cache) return cache;
  try {
    const m = await api(`/guilds/${guild}/members/${userId}`);
    const esDjGlobal = await miembroEsDj(m, guild);
    const data = {
      id: userId,
      esDjGlobal,
      roles: m.roles || [],
      nick: m.nick || null,
      nombre: m.user ? (m.nick || m.user.global_name || m.user.username) : userId
    };
    await setJSON(clave, data, 300).catch(() => {});
    return data;
  } catch (e) {
    if (e.status !== 404) throw e;
    return null;
  }
}

/** Lista de roles y canales de texto del servidor de Discord para el panel del DJ. */
export async function listaRolesYCanales(guildId) {
  const guild = guildId || env('DISCORD_GUILD_ID');
  if (!guild || !env('DISCORD_BOT_TOKEN')) return { roles: [], canales: [] };
  const clave = `fu:cache:roles-canales:${guild}`;
  const cache = await getJSON(clave).catch(() => null);
  if (cache) return cache;
  try {
    const [rRes, cRes] = await Promise.all([
      api(`/guilds/${guild}/roles`).catch(() => []),
      api(`/guilds/${guild}/channels`).catch(() => [])
    ]);
    const roles = (Array.isArray(rRes) ? rRes : [])
      .filter((r) => r.name !== '@everyone')
      .map((r) => ({ id: r.id, nombre: r.name, color: r.color }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    const canales = (Array.isArray(cRes) ? cRes : [])
      .filter((c) => c.type === 0 || c.type === 4) // 0 = texto, 4 = categoria
      .map((c) => ({ id: c.id, nombre: c.name, tipo: c.type, categoria: c.parent_id }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    const resultado = { roles, canales };
    await setJSON(clave, resultado, 300).catch(() => {});
    return resultado;
  } catch (e) {
    return { roles: [], canales: [] };
  }
}

/** ¿El usuario tiene el rol DJ en el servidor configurado? */
export const usuarioEsDj = async (userId) => (await rolUsuario(userId)) === 'dj';

export const nombreUsuario = (u) => (u ? (u.global_name || u.username || u.id) : '');
