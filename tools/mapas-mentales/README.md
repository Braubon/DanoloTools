# Mapas mentales

Aplicación web autocontenida para crear mapas mentales. No necesita instalación ni servidor.

## Uso

Abre `mapas-mentales.html` en cualquier navegador moderno (Chrome, Edge, Firefox o Safari), en ordenador o en móvil.

- Los mapas se guardan automáticamente en el navegador (localStorage).
- Para pasar mapas entre dispositivos o hacer copias de seguridad, usa **Exportar → JSON** e **Importar**.
- La sincronización con la cuenta solo funciona cuando la página se abre dentro de Claude. Fuera de Claude, la app funciona igual, con guardado local.
- Las fuentes (Figtree y Bricolage Grotesque) se cargan de Google Fonts. Sin conexión se usan las fuentes del sistema.

## Estructura del código fuente

`mapas-mentales.html` es el resultado de unir, en orden, los archivos de `src/`:

| Archivo | Contenido |
|---|---|
| `1-head.html` | Cabecera, fuentes y todos los estilos (CSS) |
| `2-body.html` | Estructura de la página: lienzo, barras y paneles |
| `3-core.js` | Utilidades, iconos, modelo de datos, guardado local, dibujo de cuadros y líneas, vista y minimapa |
| `4-interact.js` | Historial, sincronización, edición de texto, gestos de ratón y táctiles, teclado y algoritmos de organización |
| `5-ui.js` | Paneles emergentes, etiquetas y filtro, búsqueda, diálogos y avisos |
| `6-app.js` | Exportar (JSON, PNG, SVG), importar, lista de mapas, mapa de ejemplo e inicio |

Para regenerar el HTML después de editar `src/`:

```sh
./build.sh
```

## Formato JSON

```json
{
  "format": "mapamental",
  "version": 1,
  "name": "Mi mapa",
  "nodes": [
    { "id": "a", "x": 0, "y": 0, "text": "Idea central", "color": "#F2B544",
      "fontSize": 22, "bold": true, "width": "auto", "tags": ["t1"], "collapsed": false }
  ],
  "edges": [
    { "id": "e1", "from": "a", "to": "b", "label": "", "style": "curve",
      "arrow": "none", "color": null, "dashed": false, "width": 2 }
  ],
  "tags": [ { "id": "t1", "name": "pendiente", "color": "#E5484D" } ],
  "settings": { "edge": { "style": "curve", "arrow": "none", "color": null, "dashed": false, "width": 2 }, "flow": "auto" }
}
```

- `style` puede ser `curve`, `straight` u `ortho`.
- `arrow` puede ser `none`, `end`, `start` o `both`.
- `width` del cuadro puede ser `auto`, `160`, `240` o `320`.
- En `tags` de un cuadro también se aceptan nombres en vez de ids; las etiquetas que no existan se crean al importar.
- Una copia de seguridad de varios mapas usa `{"format": "mapamental-coleccion", "maps": [ … ]}`.
