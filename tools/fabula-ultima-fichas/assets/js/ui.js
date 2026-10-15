// Utilidades de interfaz compartidas: escape, markdown mínimo, tema, ficheros.

/** Minúsculas sin tildes, para búsquedas. */
export const normTxt = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\(#[^)]*\)/g, '$1')
    .replace(/【/g, '[').replace(/】/g, ']');
}

/** Markdown mínimo: párrafos, listas anidadas, tablas, negrita, cursiva. */
export function md(src) {
  if (!src) return '';
  const lines = String(src).split('\n');
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    if (ln.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim()); i++; }
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\|\s*:?-/.test(r));
      const [head, ...rest] = body;
      html += '<div class="tabla-scroll"><table><thead><tr>' + cells(head).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
        + rest.map((r) => '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
      continue;
    }
    if (/^\s*- /.test(ln)) {
      const items = [];
      while (i < lines.length && /^\s*- /.test(lines[i])) {
        const depth = lines[i].match(/^\s*/)[0].length >= 2 ? 1 : 0;
        items.push({ depth, t: lines[i].replace(/^\s*- /, '') });
        i++;
      }
      let out = '<ul>';
      let open = false;
      items.forEach((it, k) => {
        if (it.depth === 1 && !open) { out = out.replace(/<\/li>$/, ''); out += '<ul>'; open = true; }
        if (it.depth === 0 && open) { out += '</ul></li>'; open = false; }
        out += `<li>${inline(it.t)}</li>`;
        if (k === items.length - 1 && open) out += '</ul></li>';
      });
      html += out + '</ul>';
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*- /.test(lines[i]) && !lines[i].trim().startsWith('|')) { para.push(lines[i].trim()); i++; }
    html += `<p>${inline(para.join(' '))}</p>`;
  }
  return html;
}

// ------------------------------------------------------------------ tema
export function initTema() {
  const btn = document.querySelector('[data-tema-toggle]');
  const aplicar = (t) => {
    document.documentElement.dataset.theme = t;
    if (btn) { btn.setAttribute('aria-label', t === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'); btn.innerHTML = t === 'dark' ? ICON.sol : ICON.luna; }
  };
  aplicar(document.documentElement.dataset.theme || 'dark');
  if (btn) btn.addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('fu-tema', t); } catch (e) { /* sin almacenamiento */ }
    aplicar(t);
  });
}

// ------------------------------------------------------------------ ficheros
export function descargarJson(obj, nombre) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export const leerArchivo = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => { try { res(JSON.parse(r.result)); } catch (e) { rej(new Error(`${file.name} no es un JSON válido.`)); } };
  r.onerror = () => rej(r.error);
  r.readAsText(file);
});

export const slugArchivo = (s) => (s || 'personaje').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'personaje';

export function toast(msg, tipo = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add('fuera'), 2600);
  setTimeout(() => t.remove(), 3100);
}

export const ICON = {
  sol: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  luna: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  dado: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};
