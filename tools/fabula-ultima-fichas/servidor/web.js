// ---------------------------------------------------------------------------
// Manejadores HTTP de las funciones de Vercel:
//   /api/discord/  → interacciones del bot
//   /api/auth/     → inicio de sesión con Discord (panel del DJ)
//   /api/datos/    → personajes para el visor, el generador y el panel
// ---------------------------------------------------------------------------
import { randomBytes } from 'node:crypto';
import { verificarFirma, api, env, usuarioEsDj, nombreUsuario, rolesDj, API } from './discord.js';
import { getJSON, setJSON, del, cmd, kvConfigurado } from './kv.js';
import { manejarInteraccion } from './bot.js';
import { paraDiscord } from './comandos.js';
import * as P from './personajes.js';
import { baseDatos } from './motor.js';

const RUTA_PANEL = '/tools/fabula-ultima-fichas/panel/index.html';
const SESION = 'fu_sesion';
const DURACION = 60 * 60 * 24 * 14; // 14 días

// ------------------------------------------------------------------ utilidades
const json = (datos, status = 200, extra = {}) => new Response(JSON.stringify(datos), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }
});
const error = (msg, status = 400) => json({ error: msg }, status);
const origen = (req) => (env('PUBLIC_URL') || new URL(req.url).origin).replace(/\/$/, '');

function cookies(req) {
  const out = {};
  for (const p of (req.headers.get('cookie') || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return out;
}
const segura = (req) => new URL(req.url).protocol === 'https:';
const cookie = (req, nombre, valor, maxAge) =>
  `${nombre}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${segura(req) ? '; Secure' : ''}`;

async function sesion(req) {
  const t = cookies(req)[SESION];
  if (!t || !/^[a-f0-9]{48}$/.test(t)) return null;
  return getJSON(`fu:sesion:${t}`);
}

/** Exige una sesión con rol DJ. Devuelve el usuario o lanza una Response. */
async function exigirDj(req) {
  const s = await sesion(req);
  if (!s) throw error('Inicia sesión con Discord.', 401);
  if (!(await usuarioEsDj(s.id))) throw error(`Tu cuenta no tiene el rol ${env('DJ_ROLE_NAME') || 'DJ'} en el servidor.`, 403);
  return s;
}

async function cuerpo(req) {
  try { return await req.json(); } catch (e) { throw error('Cuerpo JSON no válido.'); }
}

const envoltorio = (fn) => async (req) => {
  try { return await fn(req); } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return error(e.message || 'Error interno', 500);
  }
};

// ================================================================== /api/discord/
export const discord = envoltorio(async (req) => {
  if (req.method !== 'POST') return new Response('Endpoint de interacciones de Discord.', { status: 200 });
  const texto = await req.text();
  const ok = await verificarFirma(texto, req.headers.get('x-signature-ed25519'), req.headers.get('x-signature-timestamp'));
  if (!ok) return new Response('Firma no válida', { status: 401 });
  const i = JSON.parse(texto);
  return json(await manejarInteraccion(i, origen(req)));
});

// ================================================================== /api/auth/
export const auth = envoltorio(async (req) => {
  const url = new URL(req.url);
  const accion = url.searchParams.get('accion');
  const redirectUri = `${origen(req)}/api/auth/`;

  // Vuelta desde Discord
  if (url.searchParams.has('code') || url.searchParams.has('error')) {
    const c = cookies(req).fu_oauth || '';
    const [estado, ...resto] = c.split('|');
    const volver = resto.join('|') || RUTA_PANEL;
    const limpiar = cookie(req, 'fu_oauth', '', 0);
    const ir = (destino, extraCookies = []) => new Response(null, { status: 302, headers: [['Location', destino], ['Set-Cookie', limpiar], ...extraCookies.map((x) => ['Set-Cookie', x])] });
    if (url.searchParams.has('error') || !estado || estado !== url.searchParams.get('state')) return ir(`${volver}?login=error`);
    const tok = await fetch(`${API()}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env('DISCORD_APP_ID'), client_secret: env('DISCORD_CLIENT_SECRET'),
        grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: redirectUri
      })
    }).then((r) => r.json());
    if (!tok.access_token) return ir(`${volver}?login=error`);
    const u = await api('/users/@me', { auth: `Bearer ${tok.access_token}` });
    const s = { id: u.id, nombre: nombreUsuario(u), avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null };
    const t = randomBytes(24).toString('hex');
    await setJSON(`fu:sesion:${t}`, s, DURACION);
    await P.registrarUsuario({ id: s.id, nombre: s.nombre });
    return ir(volver, [cookie(req, SESION, t, DURACION)]);
  }

  if (accion === 'entrar') {
    if (!env('DISCORD_APP_ID') || !env('DISCORD_CLIENT_SECRET')) return error('Faltan DISCORD_APP_ID y DISCORD_CLIENT_SECRET en Vercel.', 500);
    const volver = url.searchParams.get('volver') || RUTA_PANEL;
    const destino = volver.startsWith('/') && !volver.startsWith('//') ? volver : RUTA_PANEL;
    const estado = randomBytes(16).toString('hex');
    const q = new URLSearchParams({ client_id: env('DISCORD_APP_ID'), response_type: 'code', scope: 'identify', redirect_uri: redirectUri, state: estado, prompt: 'none' });
    return new Response(null, { status: 302, headers: { Location: `https://discord.com/oauth2/authorize?${q}`, 'Set-Cookie': cookie(req, 'fu_oauth', `${estado}|${destino}`, 600) } });
  }

  if (accion === 'yo') {
    const s = await sesion(req);
    if (!s) return json({ usuario: null, dj: false });
    let dj = false, aviso = null;
    try { dj = await usuarioEsDj(s.id); } catch (e) { aviso = e.message; }
    return json({ usuario: s, dj, aviso });
  }

  if (accion === 'salir') {
    const t = cookies(req)[SESION];
    if (t) await del(`fu:sesion:${t}`).catch(() => {});
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(req, SESION, '', 0) });
  }
  return error('Acción desconocida.', 404);
});

// ================================================================== /api/datos/
export const datos = envoltorio(async (req) => {
  const url = new URL(req.url);
  const accion = url.searchParams.get('accion');
  const id = url.searchParams.get('id');
  const post = req.method === 'POST';

  switch (accion) {
    // ---------------- público
    case 'publico':
      return json({ personajes: (await P.listar()).map(P.publico) });
    case 'descargar': {
      const pj = id && await P.obtener(id);
      if (!pj) return error('Personaje no encontrado.', 404);
      const nombre = String((pj.identidad && pj.identidad.nombre) || 'personaje').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'personaje';
      const limpio = P.publico(pj);
      delete limpio.discord; delete limpio.rev;
      return new Response(JSON.stringify(limpio, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}.json"`, 'Cache-Control': 'no-store' } });
    }
    case 'estado':
      return json(await diagnostico(req));

    // ---------------- DJ
    case 'uno': {
      await exigirDj(req);
      const pj = id && await P.obtener(id);
      return pj ? json({ personaje: pj }) : error('Personaje no encontrado.', 404);
    }
    case 'lista': {
      await exigirDj(req);
      return json({ personajes: await P.listar() });
    }
    case 'guardar': {
      if (!post) return error('Usa POST.', 405);
      await exigirDj(req);
      const b = await cuerpo(req);
      let pj;
      try { pj = P.preparar(b.personaje); } catch (e) { return error(e.message); }
      try {
        pj = await P.guardar(pj, { rev: b.rev ?? null, forzar: !!b.forzar });
      } catch (e) {
        if (e instanceof P.Conflicto) return json({ error: e.message, conflicto: true, actual: await P.obtener(pj.id) }, 409);
        throw e;
      }
      return json({ personaje: pj });
    }
    case 'eliminar': {
      if (!post) return error('Usa POST.', 405);
      await exigirDj(req);
      const b = await cuerpo(req);
      await P.eliminar(b.id);
      return json({ ok: true });
    }
    case 'asignar': {
      if (!post) return error('Usa POST.', 405);
      await exigirDj(req);
      const b = await cuerpo(req);
      const r = await P.asignar(b.id, b.usuario && b.usuario.id ? { id: String(b.usuario.id), nombre: b.usuario.nombre || '' } : null);
      return json({ personaje: r.pj, liberados: r.liberados });
    }
    case 'miembros': {
      await exigirDj(req);
      return json(await miembros());
    }
    case 'registrar': {
      if (!post) return error('Usa POST.', 405);
      await exigirDj(req);
      const app = env('DISCORD_APP_ID'), guild = env('DISCORD_GUILD_ID');
      if (!app || !guild) return error('Faltan DISCORD_APP_ID o DISCORD_GUILD_ID.', 500);
      const res = await api(`/applications/${app}/guilds/${guild}/commands`, { method: 'PUT', body: paraDiscord() });
      return json({ ok: true, comandos: res.map((c) => c.name) });
    }
    default:
      return error('Acción desconocida.', 404);
  }
});

/** Miembros del servidor para el selector de jugadores. */
async function miembros() {
  const conocidos = await P.usuarios();
  const guild = env('DISCORD_GUILD_ID');
  try {
    const lista = await api(`/guilds/${guild}/members?limit=1000`);
    return {
      fuente: 'servidor',
      miembros: lista.filter((m) => !m.user.bot).map((m) => ({ id: m.user.id, nombre: m.nick || nombreUsuario(m.user) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
    };
  } catch (e) {
    return { fuente: 'conocidos', aviso: 'No se puede leer la lista de miembros (activa «Server Members Intent» en el portal de Discord). Se muestran los usuarios que ya han usado el bot o el panel.', miembros: conocidos.sort((a, b) => a.nombre.localeCompare(b.nombre)) };
  }
}

/** Comprobación de la configuración, visible en el panel (sin secretos). */
async function diagnostico(req) {
  const o = origen(req);
  const vars = ['DISCORD_APP_ID', 'DISCORD_PUBLIC_KEY', 'DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID'];
  const out = {
    urls: { interacciones: `${o}/api/discord/`, redireccion: `${o}/api/auth/` },
    variables: Object.fromEntries(vars.map((v) => [v, !!env(v)])),
    rolDj: env('DJ_ROLE_NAME') || 'DJ',
    checks: []
  };
  const check = (nombre, ok, detalle = '') => out.checks.push({ nombre, ok, detalle });
  for (const v of vars) if (!env(v)) check(`Variable ${v}`, false, 'Falta en Vercel → Settings → Environment Variables.');
  try {
    if (!kvConfigurado() && process.env.VERCEL) throw new Error('No conectada');
    await cmd('PING');
    check('Base de datos', true, kvConfigurado() ? 'Upstash Redis conectado.' : 'Memoria local (solo pruebas).');
  } catch (e) { check('Base de datos', false, 'Conecta Upstash Redis desde Vercel → Storage.'); }
  try {
    await baseDatos();
    check('Libros de reglas', true);
  } catch (e) { check('Libros de reglas', false, e.message); }
  if (env('DISCORD_BOT_TOKEN')) {
    try {
      const yo = await api('/users/@me');
      check('Bot', true, `Conectado como ${yo.username}.`);
    } catch (e) { check('Bot', false, 'El token del bot no es válido.'); }
    if (env('DISCORD_GUILD_ID')) {
      try {
        const g = await api(`/guilds/${env('DISCORD_GUILD_ID')}`);
        check('Servidor', true, `El bot está en «${g.name}».`);
        const roles = await rolesDj(env('DISCORD_GUILD_ID'));
        check(`Rol ${out.rolDj}`, roles.length > 0, roles.length ? 'Encontrado.' : `Crea un rol llamado «${out.rolDj}» y asígnatelo.`);
      } catch (e) { check('Servidor', false, 'El bot no está en ese servidor o el DISCORD_GUILD_ID es incorrecto.'); }
    }
  }
  out.ok = out.checks.every((c) => c.ok);
  return out;
}
