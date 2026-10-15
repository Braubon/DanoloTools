# Plan de trabajo — Atlas de Baja Fantasía (The Low Fantasy Atlas)

> **Documento de trabajo interno para la Fase 0.** Define el mapeo de contenidos originales a los ficheros de entrega finales, las secciones a omitir y resumir, y los criterios de edición para la exportación a EPUB mediante Pandoc.

---

## 1. Identificación del manual fuente

- **Fichero original:** `Manuales oficiales/The Low Fantasy Atlas.pdf`
- **Título:** *The Low Fantasy Atlas*
- **Idioma:** Inglés
- **Extensión:** 120 páginas
- **Texto extraíble:** Sí (193.855 caracteres extraídos íntegramente a `manuales resumidos/_extraccion/04_the_low_fantasy_atlas_full.txt`)

---

## 2. Mapa de contenidos: original → ficheros de salida

| Capítulo / Sección original | Págs. fuente | Fichero de salida | Criterio editorial |
| :--- | :---: | :--- | :--- |
| Portada, créditos y disclaimer | 1–3 | *(Omitido)* | Créditos y licencias eliminados según directrices §5. |
| Prefacio y Table of Contents | 4–6 | `00_indice.md` | Índice general reestructurado con anclas para Pandoc. |
| 1. Introduction (What Defines Low Fantasy, Pillars, Before We Start) | 7–16 | `01_introduccion.md` | Resumido en tono de reglamento; pilares y directrices condensados. |
| 2. The World (Low Fantasy Locations: Shibuya, Imunnen, Mirathis, Obsidian Lyceum, Paris, Sopp, Victorian London) | 17–65 | `02_01_ambientacion_baja_fantasia.md` | Resumido en fichas de síntesis (*At a Glance*, ganchos, tablas de viaje). |
| Conflicts, Magic & Rituals, Technology, Genre Mosh Pit, Rare Items & Artifacts | 66–78 | `02_02_reglas_magia_y_equipo.md` | Reglas íntegras de agotamiento/tensión, magia ritual, objetos raros y artefactos. |
| 3. Protagonists (Sample PCs, Hunter, Illusionist, Monk) | 79–104 | `03_01_clases_baja_fantasia.md` | Opciones de PJ y 3 clases completas íntegras (Cazador + trampas, Ilusionista + fantasmas, Monje + cuentas del alma). |
| 4. Antagonists (Another Way of Thinking About Villains, Clocks Examples 1, 2, 3) | 105–114 | `04_01_antagonistas_y_relojes.md` | Reglas y procedimiento completo de Villanos con Relojes de Colapso escalonados. |
| List of Figures | 115–120 | *(Omitido)* | Lista de ilustraciones descartada según directrices §5. |

---

## 3. Justificación de omisiones y condensaciones

### Secciones a omitir (según directrices §5)
- **Créditos, disclaimer, mecenas y agradecimientos (pp. 1–3):** Información no reglamentaria.
- **Prefacio narrativo y anécdotas de mesa (p. 4):** Ficción y memorias de partida del autor.
- **Lista de figuras e ilustraciones (pp. 115–120):** Las imágenes no forman parte del texto técnico.
- **Arte, mapas y viñetas decorativas en todo el documento:** Descartados por completo.

### Secciones a resumir (según directrices §4 y §5)
- **Introducción y pilares (pp. 7–16):** Condensados en directrices conceptuales y mecánicas sin prosa introductoria redundante.
- **Localizaciones de Baja Fantasía (pp. 17–65):** Fichas sintéticas con palabras clave, descripciones breves de enclaves, preguntas de creación compartida, ganchos de historia y tablas de viaje d6 a d20 íntegras.

### Secciones a conservar íntegras (sin pérdida de datos)
- **Reglas de conflicto y tensión (pp. 66–69):** Todos los números, procedimientos y fórmulas.
- **Magia ritual y tecnología (pp. 70–75):** Reglas completas de ritualismo y mezclas de géneros (*Genre Mosh Pit*).
- **Catálogo de Objetos Raros y Artefactos (pp. 76–78):** Todas las propiedades, costes, tipos y reglas.
- **Clases completas (pp. 87–104):** Cazador, Ilusionista y Monje con todos sus beneficios gratuitos, competencias, habilidades con costes y SL, catálogo de trampas, conjuros de ilusión, reglas de fantasmas y perfiles de cuentas del alma.
- **Antagonistas y relojes de colapso (pp. 105–114):** Procedimiento paso a paso y los 3 ejemplos estructurados con reglas mecánicas completas.
