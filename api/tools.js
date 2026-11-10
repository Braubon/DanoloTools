// Función de Vercel: /api/tools/ — lista las carpetas de tools/ que tengan index.html
// (nombre y descripción opcionales en tools/<carpeta>/meta.json: { "name": "...", "desc": "..." }).
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const formatName = (folder) =>
  folder.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

function listTools() {
  const toolsDir = join(process.cwd(), 'tools');
  return readdirSync(toolsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(toolsDir, e.name, 'index.html')))
    .map(e => {
      let name = formatName(e.name);
      let desc = '';
      try {
        const meta = JSON.parse(readFileSync(join(toolsDir, e.name, 'meta.json'), 'utf-8'));
        if (meta.name) name = meta.name;
        if (meta.desc) desc = meta.desc;
      } catch {}
      return { folder: e.name, name, desc };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export default {
  fetch() {
    const headers = { 'Cache-Control': 'no-store' };
    try {
      return Response.json(listTools(), { headers });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500, headers });
    }
  },
};
