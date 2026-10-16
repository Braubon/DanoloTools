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

/** ¿El usuario tiene el rol DJ en el servidor configurado? (para la web; caché 5 min) */
export async function usuarioEsDj(userId) {
  const guild = env('DISCORD_GUILD_ID');
  if (!guild || !userId) return false;
  const clave = `fu:cache:dj:${userId}`;
  const cache = await getJSON(clave).catch(() => null);
  if (cache !== null) return cache;
  let es = false;
  try {
    const m = await api(`/guilds/${guild}/members/${userId}`);
    es = await miembroEsDj(m, guild);
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  await setJSON(clave, es, 300).catch(() => {});
  return es;
}

export const nombreUsuario = (u) => (u ? (u.global_name || u.username || u.id) : '');
