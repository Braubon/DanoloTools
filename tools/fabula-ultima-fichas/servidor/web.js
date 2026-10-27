// ---------------------------------------------------------------------------
// Manejadores HTTP de las funciones de Vercel:
//   /api/discord/  → interacciones del bot
//   /api/auth/     → inicio de sesión con Discord (panel del DJ)
//   /api/datos/    → personajes, enemigos y escena de combate para las webs
//
// Permisos en la web (cuenta de Discord):
//   espectador  sin sesión o sin pertenecer al servidor: posiciones e imágenes
//   jugador     miembro del servidor: fichas de los PJ y lo revelado de los PNJ;
//               mueve sus propios PJ
//   dj          rol DJ: todo
// ---------------------------------------------------------------------------
import { randomBytes } from 'node:crypto';
import { verificarFirma, api, env, rolUsuario, nombreUsuario, rolesDj, API } from './discord.js';
import { getJSON, setJSON, del, cmd, kvConfigurado, versionPartida, tocar } from './kv.js';
import { manejarInteraccion } from './bot.js';
import { paraDiscord } from './comandos.js';
import * as P from './personajes.js';
import * as E from './escena.js';
import { vistaRevelada, exportarPnj } from '../assets/js/pnj.js';
import { aplicarValor, R } from './motor.js';
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

/** Sesión y papel del visitante: { s, rol: 'espectador'|'jugador'|'dj' }. */
async function quien(req) {
  const s = await sesion(req);
  if (!s) return { s: null, rol: 'espectador' };
  let rol = null;
  try { rol = await rolUsuario(s.id); } catch (e) { rol = null; }
  return { s, rol: rol || 'espectador' };
}

/** Exige una sesión con rol DJ. Devuelve el usuario o lanza una Response. */
async function exigirDj(req) {
  const { s, rol } = await quien(req);
  if (!s) throw error('Inicia sesión con Discord.', 401);
  if (rol !== 'dj') throw error(`Tu cuenta no tiene el rol ${env('DJ_ROLE_NAME') || 'DJ'} en el servidor.`, 403);
  return s;
}

/** Exige ser miembro del servidor (jugador o DJ). */
async function exigirMiembro(req) {
  const q = await quien(req);
  if (!q.s) throw error('Inicia sesión con Discord para ver las fichas.', 401);
  if (q.rol === 'espectador') throw error('Tu cuenta de Discord no está en el servidor de la partida.', 403);
  return q;
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
    if (!s) return json({ usuario: null, dj: false, rol: 'espectador' });
    let rol = null, aviso = null;
    try { rol = await rolUsuario(s.id); } catch (e) { aviso = e.message; }
    return json({ usuario: s, dj: rol === 'dj', rol: rol || 'espectador', aviso });
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
    // ---------------- vista de combate (cualquiera; el contenido depende del papel)
    case 'campo': {
      const v = Number(url.searchParams.get('v')) || 0;
      const ver = await versionPartida();
      if (v && v === ver) return json({ sinCambios: true, version: ver });
      const q = await quien(req);
      return json({ version: ver, ...(await vistaCampo(q)) });
    }
    case 'imagen': {
      const clave = url.searchParams.get('clave') || '';
      const img = /^(pj|pnj):[\w-]{1,80}$/.test(clave) ? await E.imagen(clave) : null;
      const m = img && img.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (!m) return new Response(null, { status: 302, headers: { Location: '/tools/fabula-ultima-fichas/assets/img/sprite-defecto.png' } });
      return new Response(Buffer.from(m[2], 'base64'), { headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=31536000, immutable' } });
    }
    case 'mover': {
      if (!post) return error('Usa POST.', 405);
      const q = await exigirMiembro(req);
      return json(await mover(q, await cuerpo(req)));
    }

    // ---------------- miembros del servidor (fichas completas)
    case 'publico': {
      await exigirMiembro(req);
      return json({ personajes: (await P.listar()).map(P.publico) });
    }
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
      const [personajes, plantillas, imagenes] = await Promise.all([P.listar(), E.plantillas(), E.versionesImagen()]);
      return json({ personajes, plantillas, imagenes });
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
      await E.olvidarPj(b.id);
      return json({ ok: true });
    }

    // ---------------- DJ: enemigos y escena
    case 'plantillas': {
      await exigirDj(req);
      return json({ plantillas: await E.plantillas() });
    }
    case 'guardar-plantilla': {
      if (!post) return error('Usa POST.', 405);
      await exigirDj(req);
      const b = await cuerpo(req);
      try {
        const r = await E.guardarPlantilla(b.plantilla, { reemplazar: !!b.reemplazar });
        if (b.idAnterior && b.idAnterior !== r.plantilla.id) await renombrarPlantilla(b.idAnterior, r.plantilla.id);
        return json(r);
      } catch (e) {
        return json({ error: e.message, conflicto: !!e.conflicto }, e.conflicto ? 409 : 400);
      }
    }
    case 'eliminar-plantilla': {
      if (!post) return error('Usa POST.', 405);
      await exigirDj(req);
      await E.eliminarPlantilla((await cuerpo(req)).id);
      return json({ ok: true });
    }
    case 'descargar-plantilla': {
      await exigirDj(req);
      const t = id && await E.plantilla(id);
      if (!t) return error('PNJ no encontrado.', 404);
      const limpio = exportarPnj(t); delete limpio.modificado;
      return new Response(JSON.stringify(limpio, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${t.id}.json"`, 'Cache-Control': 'no-store' } });
    }
    case 'sacar': {
      if (!post) return error('Usa POST.', 405);
      await exigirDj(req);
      const b = await cuerpo(req);
      const t = await E.plantilla(b.plantilla);
      if (!t) return error('PNJ no encontrado.', 404);
      try { return json({ nuevos: await E.sacar(t, b) }); } catch (e) { return error(e.message); }
    }
    case 'retirar': {
      if (!post) return error('Usa POST.', 405);
      await exigirDj(req);
      const b = await cuerpo(req);
      if (b.id) await E.retirar(b.id); else await E.vaciar(b.lado || null);
      return json({ ok: true });
    }
    case 'ajustar': {
      if (!post) return error('Usa POST.', 405);
      await exigirDj(req);
      try { return json(await ajustar(await cuerpo(req))); } catch (e) { return error(e.message); }
    }
    case 'revelar': {
      if (!post) return error('Usa POST.', 405);
      await exigirDj(req);
      const b = await cuerpo(req);
      try { await E.revelar(b.plantilla, b.nivel); } catch (e) { return error(e.message, 404); }
      return json({ ok: true });
    }
    case 'subir-imagen': {
      if (!post) return error('Usa POST.', 405);
      await exigirDj(req);
      const b = await cuerpo(req);
      try { return json({ version: await E.guardarImagen(b.clave, b.imagen) }); } catch (e) { return error(e.message); }
    }
    case 'quitar-imagen': {
      if (!post) return error('Usa POST.', 405);
      await exigirDj(req);
      await E.borrarImagen((await cuerpo(req)).clave);
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

// ================================================================== escena
const urlImagen = (clave, vers) => (vers[clave] ? `/api/datos/?accion=imagen&clave=${encodeURIComponent(clave)}&v=${vers[clave]}` : null);

/** Datos de la vista de combate según el papel del visitante. */
async function vistaCampo({ s, rol }) {
  const [pjs, c, form, vers, lista, cb] = await Promise.all([P.listar(), E.campo(), E.formacion(), E.versionesImagen(), E.plantillas(), P.combate()]);
  const tpl = Object.fromEntries(lista.map((t) => [t.id, t]));
  const ve = rol !== 'espectador';
  const out = {
    rol,
    usuario: s ? { id: s.id, nombre: s.nombre, avatar: s.avatar } : null,
    combate: cb ? { ronda: cb.ronda } : null,
    pjs: pjs.map((pj) => {
      const f = form[pj.id] || {};
      const propio = !!(s && pj.discord && pj.discord.id === s.id);
      return {
        clave: `pj:${pj.id}`, id: pj.id, nombre: (pj.identidad && pj.identidad.nombre) || 'Sin nombre',
        fila: E.FILAS.includes(f.fila) || f.fila === 'fuera' ? f.fila : 'vanguardia', orden: Number(f.orden) || 0,
        imagen: urlImagen(`pj:${pj.id}`, vers), propio,
        ...(ve ? { datos: rol === 'dj' ? pj : P.publico(pj) } : {})
      };
    }),
    pnj: c.enemigos.filter((i) => tpl[i.plantilla]).map((i) => {
      const t = tpl[i.plantilla];
      const base = { clave: `pnj:${i.id}`, id: i.id, plantilla: t.id, nombre: i.nombre, lado: i.lado, fila: i.fila, orden: Number(i.orden) || 0, imagen: urlImagen(`pnj:${t.id}`, vers) };
      if (!ve) return base;
      if (rol === 'dj') return { ...base, pv: i.pv, pm: i.pm, estados: i.estados || [], dano: Math.max(0, t.pv - i.pv), ficha: t };
      const aliado = i.lado === 'aliado';
      const info = aliado ? vistaRevelada(t, 16) : vistaRevelada(t);
      return { ...base, estados: i.estados || [], dano: Math.max(0, t.pv - i.pv), info: { nombre: t.nombre, descripcion: t.descripcion, ...info }, ...(aliado || info.revelado >= 10 ? { pv: i.pv, pm: i.pm } : {}) };
    })
  };
  if (rol === 'dj') out.plantillas = lista.map((t) => ({ id: t.id, nombre: t.nombre, nivel: t.nivel, especie: t.especie, revelado: t.revelado || 0 }));
  return out;
}

/**
 * Reordena una columna. Cuerpo: { movida: clave, lado, fila, claves: [orden final de la columna] }
 * El jugador solo puede mover sus PJ (y siempre en el lado aliado).
 */
async function mover({ s, rol }, b) {
  const lado = E.LADOS.includes(b.lado) ? b.lado : 'aliado';
  const fila = E.FILAS.includes(b.fila) || (b.fila === 'fuera' && rol === 'dj') ? b.fila : null;
  if (!fila) throw error('Fila no válida.');
  const claves = Array.isArray(b.claves) ? b.claves.map(String).slice(0, 60) : [];
  const [tipo, id] = String(b.movida || '').split(':');
  if (rol !== 'dj') {
    if (tipo !== 'pj' || lado !== 'aliado' || fila === 'fuera') throw error('Solo puedes mover tus personajes.', 403);
    const pj = await P.obtener(id);
    if (!pj || !pj.discord || pj.discord.id !== s.id) throw error('Solo puedes mover tus personajes.', 403);
  }
  if (tipo === 'pj' && lado !== 'aliado') throw error('Los personajes jugadores van en el lado aliado.');
  const c = await E.campo();
  let cambiaCampo = false;
  for (const [k, clave] of (claves.includes(b.movida) ? claves : [...claves, b.movida]).entries()) {
    const [t2, id2] = clave.split(':');
    if (t2 === 'pj') {
      if (clave === b.movida) await E.colocarPj(id2, { fila, orden: k });
      else await E.colocarPj(id2, { orden: k });
    } else if (t2 === 'pnj') {
      const i = c.enemigos.find((x) => x.id === id2);
      if (!i) continue;
      if (clave === b.movida) { if (rol !== 'dj') continue; i.fila = fila === 'fuera' ? i.fila : fila; i.lado = lado; }
      i.orden = k; cambiaCampo = true;
    }
  }
  if (cambiaCampo) await E.guardarCampo(c); else await tocar();
  return { ok: true };
}

/** Ajustes rápidos del DJ desde la vista: PV, PM, estados o daño con afinidades. */
async function ajustar(b) {
  const [tipo, id] = String(b.clave || '').split(':');
  const lineas = [];
  if (tipo === 'pnj') {
    const c = await E.campo();
    const i = c.enemigos.find((x) => x.id === id);
    if (!i) throw new Error('Ese PNJ ya no está en el campo.');
    const t = await E.plantilla(i.plantilla);
    if (!t) throw new Error('La ficha de ese PNJ ya no existe.');
    if (b.dano) {
      const r = E.danar(i, t, b.dano.cantidad, b.dano.tipo, { ignoraResistencia: !!b.dano.ignora });
      lineas.push(`${i.nombre}: ${r.res.cura ? `absorbe y recupera ${r.res.final}` : `pierde ${r.res.final}`} PV (${r.antes} → ${r.despues}).`);
    }
    if (b.pv !== undefined && b.pv !== '') i.pv = aplicarValor(i.pv, b.pv, t.pv);
    if (b.pm !== undefined && b.pm !== '') i.pm = aplicarValor(i.pm, b.pm, t.pm);
    if (Array.isArray(b.estados)) i.estados = b.estados.filter((x) => typeof x === 'string').slice(0, 6);
    if (b.nombre) i.nombre = String(b.nombre).trim().slice(0, 60) || i.nombre;
    await E.guardarCampo(c);
    return { ok: true, texto: lineas.join(' ') };
  }
  if (tipo === 'pj') {
    const pj = await P.obtener(id);
    if (!pj) throw new Error('Personaje no encontrado.');
    const c = R.calcular(pj, await baseDatos());
    pj.estado = pj.estado || {};
    const act = (k, max) => (pj.estado[k] === null || pj.estado[k] === undefined ? max : pj.estado[k]);
    if (b.pv !== undefined && b.pv !== '') pj.estado.pv = aplicarValor(act('pv', c.pv_max), b.pv, c.pv_max);
    if (b.pm !== undefined && b.pm !== '') pj.estado.pm = aplicarValor(act('pm', c.pm_max), b.pm, c.pm_max);
    if (b.pf !== undefined && b.pf !== '') pj.pf = aplicarValor(pj.pf || 0, b.pf, null);
    if (Array.isArray(b.estados)) pj.estado.estados = b.estados.filter((x) => typeof x === 'string').slice(0, 6);
    if (b.fila && (E.FILAS.includes(b.fila) || b.fila === 'fuera')) await E.colocarPj(id, { fila: b.fila });
    await P.escribir(pj);
    return { ok: true };
  }
  throw new Error('Clave no válida.');
}

/** Si el DJ cambia el identificador de una ficha, mueve sus instancias e imagen. */
async function renombrarPlantilla(viejo, nuevo) {
  const c = await E.campo();
  let n = 0;
  for (const i of c.enemigos) if (i.plantilla === viejo) { i.plantilla = nuevo; n++; }
  if (n) await E.guardarCampo(c);
  const img = await E.imagen(`pnj:${viejo}`);
  if (img) await E.guardarImagen(`pnj:${nuevo}`, img);
  await E.eliminarPlantilla(viejo);
}

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
