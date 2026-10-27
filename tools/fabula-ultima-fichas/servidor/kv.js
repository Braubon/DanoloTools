// ---------------------------------------------------------------------------
// Cliente mínimo de Redis (Upstash, API REST). Sin dependencias.
// Variables: KV_REST_API_URL + KV_REST_API_TOKEN (las crea la integración de
// Upstash en Vercel) o UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
// Fuera de Vercel y sin variables, usa memoria (solo para pruebas locales).
// ---------------------------------------------------------------------------

const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
export const kvConfigurado = () => !!(url() && token());
const usarMemoria = () => !kvConfigurado() && !process.env.VERCEL;

async function rest(ruta, cuerpo) {
  if (!kvConfigurado()) {
    if (usarMemoria()) return null;
    throw new Error('La base de datos no está conectada: añade Upstash Redis al proyecto en Vercel.');
  }
  const r = await fetch(url().replace(/\/$/, '') + ruta, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  const j = await r.json().catch(() => ({ error: `respuesta no válida (${r.status})` }));
  if (!r.ok || (j && j.error)) throw new Error('Base de datos: ' + (j.error || r.status));
  return j;
}

export async function cmd(...args) {
  if (usarMemoria()) return memoria(args);
  return (await rest('', args.map(String))).result;
}

export async function pipe(cmds) {
  if (!cmds.length) return [];
  if (usarMemoria()) return cmds.map(memoria);
  const j = await rest('/pipeline', cmds.map((c) => c.map(String)));
  return j.map((x) => { if (x.error) throw new Error('Base de datos: ' + x.error); return x.result; });
}

// ------------------------------------------------------------------ JSON
const parse = (s) => { if (s == null) return null; try { return JSON.parse(s); } catch (e) { return null; } };
export const getJSON = async (k) => parse(await cmd('GET', k));
export const setJSON = (k, v, ex) => (ex ? cmd('SET', k, JSON.stringify(v), 'EX', ex) : cmd('SET', k, JSON.stringify(v)));
export const del = (k) => cmd('DEL', k);
export const hgetJSON = async (h, f) => parse(await cmd('HGET', h, f));
export const hsetJSON = (h, f, v) => cmd('HSET', h, f, JSON.stringify(v));
export const hdel = (h, f) => cmd('HDEL', h, f);
export async function hgetallJSON(h) {
  const plano = (await cmd('HGETALL', h)) || [];
  const out = {};
  if (Array.isArray(plano)) for (let i = 0; i < plano.length; i += 2) out[plano[i]] = parse(plano[i + 1]);
  else for (const [k, v] of Object.entries(plano)) out[k] = parse(v);
  return out;
}

/** Hash sin interpretar como JSON (por ejemplo, imágenes en base64). */
export async function hgetall(h) {
  const plano = (await cmd('HGETALL', h)) || [];
  const out = {};
  if (Array.isArray(plano)) for (let i = 0; i < plano.length; i += 2) out[plano[i]] = plano[i + 1];
  else Object.assign(out, plano);
  return out;
}

/** Marca que algo de la partida ha cambiado (la vista de combate lo consulta). */
export const tocar = () => cmd('INCR', 'fu:version').catch(() => null);
export const versionPartida = async () => Number(await cmd('GET', 'fu:version').catch(() => 0)) || 0;

// ------------------------------------------------------------------ memoria (local)
const MEM = globalThis.__fuMemoria || (globalThis.__fuMemoria = new Map());
function vivo(k) {
  const e = MEM.get(k);
  if (e && e.exp && e.exp < Date.now()) { MEM.delete(k); return undefined; }
  return e;
}
function memoria([op, k, ...a]) {
  op = String(op).toUpperCase();
  const e = vivo(k);
  switch (op) {
    case 'GET': return e ? e.v : null;
    case 'SET': {
      const exp = String(a[1] || '').toUpperCase() === 'EX' ? Date.now() + Number(a[2]) * 1000 : 0;
      MEM.set(k, { v: String(a[0]), exp }); return 'OK';
    }
    case 'DEL': return MEM.delete(k) ? 1 : 0;
    case 'EXPIRE': if (e) e.exp = Date.now() + Number(a[0]) * 1000; return e ? 1 : 0;
    case 'HGET': return e && e.v[a[0]] !== undefined ? e.v[a[0]] : null;
    case 'HSET': {
      const h = e ? e.v : {};
      let n = 0;
      for (let i = 0; i < a.length; i += 2) { if (h[a[i]] === undefined) n++; h[a[i]] = String(a[i + 1]); }
      MEM.set(k, { v: h, exp: 0 }); return n;
    }
    case 'HDEL': if (!e || e.v[a[0]] === undefined) return 0; delete e.v[a[0]]; return 1;
    case 'HGETALL': return e ? Object.entries(e.v).flat() : [];
    case 'INCR': { const n = (e ? Number(e.v) : 0) + 1; MEM.set(k, { v: String(n), exp: 0 }); return n; }
    case 'PING': return 'PONG';
    default: throw new Error('Operación no soportada en memoria: ' + op);
  }
}
