# Cartógrafo — diseñador de asentamientos de fantasía

Web-app (Vite + JavaScript puro + SVG) para diseñar mapas de ciudades y pueblos en tres pasos.

## Uso
```
npm install
npm run dev      # servidor de desarrollo
npm run build    # genera dist/index.html autocontenido (se abre con doble clic)
```

## Estructura
- `src/state.js` — estado, historial (deshacer/rehacer), rejilla de densidad del aerógrafo.
- `src/geom.js` — utilidades geométricas (booleanas y offsets con Clipper).
- `src/layers.js` — fusiona los trazos de cada capa en una única forma (agua, riscos, caminos, bosque, murallas, ciudadelas).
- `src/generate.js` — paso 2: semillas en quadtree orientado → Voronoi → manzanas → parcelas (subdivisión recursiva con frente a calle) → granjas, plazas, árboles. También aplica las ediciones del paso 3.
- `src/render.js` — dibujo SVG: puentes, puertas, escaleras, torres, campos.
- `src/population.js` — fórmula de población.
- `src/randomize.js` — mapa aleatorio completo.
- `src/main.js` — interfaz, herramientas y exportación SVG/PNG.

## Fórmula de población
Hogares por edificio = máx(1, redondeo(superficie × plantas ÷ 60 m²)), con 1–2,2 plantas según la densidad;
4,5 personas por hogar; edificios > 400 m² = públicos (1 hogar cada 200 m²); granjas = 6 personas;
+10 % de población sin hogar fijo.

## Novedades
- **Archivo → Guardar / Abrir proyecto** (`.cartografo.json`, también Ctrl+S / Ctrl+O).
- **Exportar → SVG por capas** (capas con nombre para Inkscape/Illustrator/Affinity) y **PNG 2× / 4×**.
- **Suelos** (paso 1): playas, pantanos y cultivos pintados a mano.
- **Barrios** (paso 1): rico, pobre, mercantil y religioso; cambian parcelas, jardines y tejados.
- **Edificios singulares** (paso 2): templo, ayuntamiento, mercado cubierto, cuarteles y molinos.
- **Sendas automáticas** entre granjas y caminos a los puertos; **escala gráfica** en metros.
