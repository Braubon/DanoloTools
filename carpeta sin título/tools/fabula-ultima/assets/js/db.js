// ---------------------------------------------------------------------------
// Base de datos: carga data/manifest.json y los archivos de cada atlas, y
// construye una vista filtrada según los atlas y reglas opcionales activos.
// No depende del navegador: el validador de Node la usa con otro "fetcher".
// ---------------------------------------------------------------------------

export const COLECCIONES = [
  'tablas', 'clases', 'conjuros', 'opciones', 'habilidades_heroicas',
  'armas', 'armaduras', 'escudos', 'accesorios', 'cualidades', 'artefactos',
  'peculiaridades', 'poderes_cero_disparadores', 'poderes_cero_efectos',
  'personalizaciones_arma', 'plantillas_arma',
  'habilidades_pnj', 'bestiario'
];

const fetchJson = async (url) => {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`No se pudo cargar ${url} (${r.status})`);
  return r.json();
};

/** Descarga todos los atlas declarados en el manifiesto (sin filtrar). */
export async function cargarRaw(base = '../data/', fetcher = fetchJson) {
  const manifest = await fetcher(base + 'manifest.json');
  const atlas = [];
  for (const ref of manifest.atlas) {
    const dir = ref.ruta.includes('/') ? ref.ruta.slice(0, ref.ruta.lastIndexOf('/') + 1) : '';
    const meta = await fetcher(base + ref.ruta);
    const archivos = await Promise.all((meta.archivos || []).map(async (a) => ({
      ...a, datos: await fetcher(base + dir + a.ruta)
    })));
    atlas.push({ meta, archivos });
  }
  return { manifest, atlas };
}

/**
 * Construye la base de datos.
 * @param raw     resultado de cargarRaw
 * @param filtro  { atlas: ['basico', ...], reglas: { 'alta-fantasia': ['peculiaridades'] } }
 *                null = todo activo (lo usa el visor)
 */
export function construirDb(raw, filtro = null) {
  const db = { atlas: [], col: {}, idx: {}, tablas: {}, avisos: [] };
  for (const c of COLECCIONES) { db.col[c] = []; db.idx[c] = new Map(); }
  db.idx.habilidades = new Map();

  for (const { meta, archivos } of raw.atlas) {
    const activo = !!(meta.obligatorio || !filtro || (filtro.atlas || []).includes(meta.id));
    const reglas = !filtro
      ? (meta.reglas_opcionales || []).map((r) => r.id)
      : ((filtro.reglas || {})[meta.id] || []);
    db.atlas.push({ ...meta, activo, reglasActivas: activo ? reglas : [] });
    if (!activo) continue;

    for (const arch of archivos) {
      if (arch.regla_opcional && !reglas.includes(arch.regla_opcional)) continue;
      const col = arch.coleccion;
      if (!db.col[col]) { db.col[col] = []; db.idx[col] = new Map(); }
      for (const rec of arch.datos || []) {
        if (rec.regla_opcional && !reglas.includes(rec.regla_opcional)) continue;
        const r = { ...rec, _atlas: meta.id, _col: col };
        if (col === 'tablas') { fusionarTabla(db, r); continue; }
        const previo = db.idx[col].get(r.id);
        if (previo) {
          if (r.reemplaza) {
            db.col[col][db.col[col].indexOf(previo)] = r;
          } else {
            db.avisos.push(`Id duplicado en ${col}: "${r.id}" (${meta.id}); se ignora.`);
            continue;
          }
        } else {
          db.col[col].push(r);
        }
        db.idx[col].set(r.id, r);
      }
    }
  }

  // Índice de habilidades de clase
  for (const clase of db.col.clases) {
    for (const h of clase.habilidades || []) {
      db.idx.habilidades.set(h.id, { ...h, _clase: clase.id, _atlas: clase._atlas });
    }
  }
  return db;
}

function fusionarTabla(db, t) {
  const prev = db.tablas[t.id];
  if (!prev || t.reemplaza) { db.tablas[t.id] = { ...t, valores: [...(t.valores || [])] }; return; }
  prev.valores.push(...(t.valores || []));
}

// ----------------------------------------------------------------- consultas
export const get = (db, col, id) => (db.idx[col] && db.idx[col].get(id)) || null;
export const hab = (db, id) => db.idx.habilidades.get(id) || null;
export const tabla = (db, id) => (db.tablas[id] ? db.tablas[id].valores : []);
export const param = (db, id, def) => {
  // El último valor cargado gana: un atlas o regla opcional puede redefinir un parámetro.
  const v = [...tabla(db, 'creacion')].reverse().find((x) => x.id === id);
  return v ? v.valor : def;
};
export const nombreAtlas = (db, id) => {
  const a = db.atlas.find((x) => x.id === id);
  return a ? (a.abreviatura || a.nombre) : id;
};
export const reglaActiva = (db, reglaId) => db.atlas.some((a) => a.activo && a.reglasActivas.includes(reglaId));
