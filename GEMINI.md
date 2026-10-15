# DanoloTools — Guía de Proyecto y Directrices Permanentes

## 1. Propósito del Proyecto
**DanoloTools** (`danolotools.vercel.app`) es un portal web de utilidades y herramientas prácticas, rápidas y orientadas a la productividad, diseño, vídeo y desarrollo.
- **Alojamiento y Despliegue**: Repositorio en GitHub desplegado automáticamente en **Vercel**.
- **Arquitectura**: Arquitectura web estática ligera (HTML5, CSS moderno nativo y JavaScript modular ES6+). Sin dependencias de compilación pesadas para garantizar carga instantánea, 0 fallos de build y máxima longevidad sin mantenimiento.

---

## 2. Sistema de Diseño: Estilo Maximalista Dark Mode

Todas las herramientas actuales y futuras deben seguir de manera rigurosa esta identidad visual y funcional:

### A. Paleta de Color (Modo Oscuro Profundo & Acentos Eléctricos)
- **Fondo Primario (Canvas)**: `#08090e` (obsidiana profunda) con sutiles mallas o rejillas técnicas.
- **Superficie de Tarjetas / Paneles**: `#0f111a` y `#141724`.
- **Bordes & Separadores**: `1px` o `1.5px` en `#23273b` y `#323854` con sutiles reflejos de luz.
- **Acentos Maximalistas**:
  - **Electric Cyan**: `#00f0ff` (Acento principal para foco, visualizadores y estados activos).
  - **Neon Lime / Mint**: `#00ff88` (Éxito, badges activos, confirmaciones).
  - **Cyber Magenta / Violet**: `#a855f7` / `#ff007a` (Acentos secundarios y gradientes).
- **Tipografía y Contrastes**:
  - Texto Principal: `#f8fafc` (blanco nítido, máxima legibilidad).
  - Texto Secundario: `#94a3b8` (gris neutro balanceado).
  - Texto Terciario / Muted: `#64748b`.

### B. Tipografías Optimizadas para Web
Importadas vía Google Fonts con `preconnect` y `display=swap`:
1. **Titulares y Display**: `'Syne', sans-serif` (pesos 700, 800) o `'Space Grotesk', sans-serif` (pesos 600, 700). Tipografía maximalista de alto impacto visual, carácter audaz y tracking ajustado.
2. **Cuerpo y Controles de UI**: `'Plus Jakarta Sans', sans-serif` (pesos 400, 500, 600, 700). Diseñada para interfaces legibles y nítidas en cualquier pantalla.
3. **Métricas, Código y Datos Numéricos**: `'JetBrains Mono', monospace` (pesos 500, 700). Para valores de píxeles, proporciones, código CSS y etiquetas técnicas.

### C. Características UI & Componentes
- **Inputs & Controles**: Campos contrastados con etiquetas técnicas en mayúsculas (`UPPERCASE`, tracking amplio, tamaño reducido), bordes nítidos, focus ring en `Electric Cyan` con halo sutil.
- **Botones Táctiles**: Estilo maximalista con micro-interacciones rápidas (`active: scale(0.98)`), bordes definidos y transiciones suaves (150-200ms).
- **Badges & Tags**: Píldoras con borde fino y puntos pulsantes (`● LIVE`, `● ACTIVE`, `HERRAMIENTA`).
- **Visualizadores**: Fondos con patrones geométricos o de rayas diagonales técnicas (`repeating-linear-gradient`), cajas dinámicas con CSS `aspect-ratio` y badges de información integrados.
- **Feedback**: Sistema de toast no invasivo para acciones rápidas ("Copiado al portapapeles", "Orientación invertida").

---

## 3. Estructura de Rutas y Nuevas Herramientas
Cada nueva herramienta se añadirá como una carpeta independiente o ruta limpia:
- `/` (`index.html`): Directorio principal y selector de herramientas con buscador y filtros.
- `/<nombre-herramienta>/index.html`: Página dedicada a la herramienta.
- `/css/design-system.css`: Tokens de diseño, variables CSS globales y tipografías.
- `/css/components.css`: Componentes reutilizables (navbar común, footer, cards, toasts).
- `/js/shared.js`: Navegación unificada, atajos de teclado y utilidades globales.

---

## 4. Estándares Técnicos
- **Zero-lag**: Cálculos en tiempo real al vuelo mediante eventos `input`.
- **Accesibilidad y Atajos**: Soporte de teclado (tabulación fluida, atajos como `Swap` y `Copy`).
- **Totalmente Responsive**: Válido en pantallas móviles (smartphones) y monitores ultra panorámicos.
- **Copy Utilities**: Facilitar siempre botones para copiar resoluciones, proporciones y snippets CSS con un clic.
