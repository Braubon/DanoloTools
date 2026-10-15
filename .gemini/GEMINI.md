# DanoloTools — Guía de Proyecto y Directrices Permanentes

## 1. Propósito del Proyecto
**DanoloTools** (`danolotools.vercel.app`) es un portal personal de utilidades y herramientas prácticas para uso propio cotidiano (variadas: cálculo, vídeo, imagen, utilidades de texto, conversiones, etc.).
- **Enfoque**: Herramientas directas, sin ruido visual, sin textos explicativos ni marketing innecesario.
- **Alojamiento y Despliegue**: Repositorio en GitHub desplegado automáticamente en **Vercel**, funcional también en local (`file://` o servidor estático).
- **Arquitectura**: Web estática nativa (HTML5, CSS moderno y JS modular). Las herramientas se organizan en subcarpetas dentro de `tools/` (ej. `tools/aspect-ratio/index.html`, `tools/map-designer/index.html`, `tools/fabula-ultima-fichas/index.html`). Enlaces relativos explícitos a `index.html` (con `../../index.html` para retornar a la raíz) para compatibilidad tanto en servidor web como abriendo archivos directamente desde disco (`file://`).

---

## 2. Sistema de Diseño: Estilo Maximalista Dark Mode

- **Paleta de Color**:
  - Fondo Canvas: `#06070a` / `#08090e`.
  - Tarjetas y Controles: `#0f111a` y `#141724`.
  - Bordes: `1px` en `#1e2235` y `#2b324d`.
  - Acentos Eléctricos: `Electric Cyan` (`#00f0ff`), `Neon Lime` (`#00ff88`), `Cyan Glow`.
  - Tipografía: Blanco nítido (`#f8fafc`) y gris neutro (`#94a3b8`).
- **Tipografías Web**:
  - Títulos: `'Syne', sans-serif` / `'Space Grotesk', sans-serif`.
  - Cuerpo / UI: `'Plus Jakarta Sans', sans-serif`.
  - Métricas / Código: `'JetBrains Mono', monospace`.
- **Criterio UI**:
  - Cero ruido: Ir directo a la herramienta y su funcionalidad.
  - Toda la tarjeta o botón debe ser directamente interactivo y accionable.
  - Visualizadores limpios y en tiempo real.
