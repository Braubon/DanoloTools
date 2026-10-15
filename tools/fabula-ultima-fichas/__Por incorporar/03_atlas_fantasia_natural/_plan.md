# Plan de trabajo — Atlas de Fantasía Natural (Natural Fantasy Atlas)

> **Documento de trabajo interno para la Fase 0.** No forma parte del libro final compilado.

---

## 1. Información de la fuente

| Parámetro | Detalle |
| :--- | :--- |
| **Fichero fuente** | `Manuales oficiales/Fabula Ultima - Atlas - Natural Fantasy_cjsPg3.pdf` |
| **Libro** | *Fabula Ultima TTJRPG — Natural Fantasy Atlas* |
| **Idioma original** | Inglés |
| **Total de páginas** | 211 páginas |
| **Estado de extracción** | Texto 100 % extraíble de forma íntegra |

---

## 2. Mapa de capítulos originales a ficheros de salida

Cada fichero contendrá un único `# Título` y anclas explícitas (`{#id}`). Toda regla que modifique o amplíe el manual básico indicará explícitamente:
`> **Modifica:** Manual básico → [capítulo / sección]`

| Fichero de salida | Capítulo / secciones originales | Páginas fuente | Contenido principal |
| :--- | :--- | :---: | :--- |
| `00_indice.md` | — | — | Tabla de contenidos del atlas con enlaces internos anclados. |
| `01_introduccion.md` | *Introduction* (pp. 7–16) | 7–15 | Definición de la Fantasía Natural en Fabula Ultima y los pilares temáticos de la Fantasía Natural (resumidos). |
| `02_01_ambientacion_fantasia_natural.md` | *The World: Locations* (pp. 18–63) | 18–63 | Resumen estructurado en párrafos concisos y tablas de las 10 localizaciones y mundos verticales (Badger Temple, Breezeburg, Candle Bay, Cerulean Jungle, Darkdepth, Eisenstadt, Golden City, Lowtide, Rocky Desert, Vertigo Peak y Mundos Verticales), conservando nombres, rasgos y efectos mecánicos. |
| `02_02_reglas_forja_y_equipo.md` | *The World: Rules, Crafting, Items* (pp. 64–96) | 64–96 | Nuevas reglas para conflictos en entornos naturales, magia y rituales naturales, tecnología, reglas completas de Materiales y Forja (*Materials and Forging*), tabla generadora aleatoria de materiales, catálogo íntegro de cualidades y objetos raros de fantasía natural (armas, armaduras, escudos y accesorios) y catálogo completo de artefactos. |
| `03_01_opciones_armas_campamento.md` | *Protagonists: Options* (pp. 110–135) | 110–135 | Nuevas tablas de identidades, temas y orígenes; variantes de armas personalizadas (*Custom Weapons*); catálogo completo de Peculiaridades de fantasía natural (*Quirks*); y reglas completas de Actividades de Campamento (*Camp Activities*). |
| `03_02_clases_fantasia_natural.md` | *Protagonists: Classes* (pp. 140–161) | 140–161 | Fichas íntegras de las 4 nuevas clases: Florista (*Floralist*, con reglas de cultivo, crecimiento y las 12 flores), Gourmet (*Gourmet*, con reglas de cocina, ingredientes y recetario), Invocador (*Invoker*, con las 5 invocaciones elementales) y Mercader (*Merchant*, con reglas de comercio y reserva privada). |
| `03_03_habilidades_heroicas.md` | *Protagonists: Heroic Skills* (pp. 162–172) | 162–172 | Catálogo completo de las 20 Habilidades Heroicas de Fantasía Natural, con sus requisitos de clase y efectos mecánicos íntegros. |
| `04_01_antagonistas_y_jefes.md` | *Antagonists* (pp. 173–207) | 173–207 | Reglas de villanos y antagonistas ambientales (*Environmental Antagonists*), y fichas completas de los 5 jefes: Tonitranea Rex (*Tonitranea Rex*); Node y Dylon (*Node and Dylon*); Brightvale (*Brightvale*); Titania, Reina de las Hadas (*Titania, Queen of Fairies*); y Eldgren (*Eldgren*). |

---

## 3. Secciones que se propone OMITIR y motivo

| Sección original | Páginas | Motivo de omisión |
| :--- | :---: | :--- |
| *Table of Contents* & Créditos | 1–6 | Índice original y licencias/agradecimientos. |
| *Natural Fantasy Heroes* (prosa narrativa) | 98–109 | Consejos sobre introspección, vida comunitaria y personajes clásicos de ejemplo pregenerados; se salvan los elementos conceptuales. |
| *New Classic Characters* | 136–139 | Ejemplos pregenerados de personajes sin reglas nuevas. |
| *Natural Fantasy Villains* (consejos narrativos) | 174–176 | Consejos narrativos sobre motivaciones comprensibles y arcos redentores; se conservan íntegras las reglas mecánicas de antagonistas ambientales. |
| *Index* | 208–211 | Índice original alfabético. |
| Ilustraciones, mapas y fondos artísticos | Todo el libro | Prohibición explícita de incluir imágenes o describirlas decorativamente. |

---

## 4. Secciones que se propone RESUMIR y motivo

| Sección original | Páginas | Tratamiento propuesto |
| :--- | :---: | :--- |
| *Natural Fantasy Pillars* | 10–13 | Se condensan en viñetas directas de 1–2 líneas por pilar sin prosa accesoria. |
| *Natural Fantasy Locations* | 18–63 | Se resumen en párrafos concisos y tablas de referencia rápida, conservando nombres propios, flora, fauna, peligros y rasgos mecánicos. |

---

## 5. Elementos que se conservarán ÍNTEGROS

1. **Reglas adicionales y variantes:** Reglas de conflictos naturales, rituales, materiales y forja, señalizadas con `> **Modifica:** Manual básico → [...]`.
2. **Generador de materiales:** Tabla completa con todas las combinaciones y propiedades de materiales.
3. **Actividades de campamento:** Procedimientos, costes, tiradas y efectos íntegros para las escenas de descanso y viaje.
4. **Armas personalizadas y Peculiaridades:** Catálogos completos con todos sus efectos, activaciones y restricciones.
5. **4 Nuevas Clases:** Florista, Gourmet, Invocador y Mercader, con todas sus habilidades completas, catálogo de las 12 flores del Florista, recetario del Gourmet y las 5 invocaciones del Invocador.
6. **Habilidades Heroicas:** Las 20 habilidades heroicas de fantasía natural íntegras con requisitos y efectos mecánicos.
7. **Equipo raro y artefactos:** Tablas completas con todas sus propiedades, costes y cualidades de fantasía natural.
8. **Jefes y Antagonistas Ambientales:** Fichas íntegras de Tonitranea Rex, Node y Dylon, Brightvale, Titania y Eldgren, con todas sus estadísticas, ataques, conjuros y fases.
