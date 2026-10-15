# Plan de trabajo — Atlas de Tecnofantasía (Techno Fantasy Atlas)

> **Documento de trabajo interno para la Fase 0.** Define el mapeo de contenidos originales a los ficheros de entrega finales, las secciones a omitir y resumir, y los criterios de edición para la exportación a EPUB mediante Pandoc.

---

## 1. Identificación del manual fuente

- **Fichero original:** `Manuales oficiales/Fabula_Ultima_Atlas_Techno_Fantasy.pdf`
- **Título:** *Fabula Ultima — Techno Fantasy Atlas*
- **Idioma:** Inglés
- **Extensión:** 218 páginas
- **Texto extraíble:** Sí (403.034 caracteres extraídos íntegramente a `manuales resumidos/_extraccion/05_techno_fantasy_atlas_full.txt`)

---

## 2. Mapa de contenidos: original → ficheros de salida

| Capítulo / Sección original | Págs. fuente | Fichero de salida | Criterio editorial |
| :--- | :---: | :--- | :--- |
| Portada, créditos y Table of Contents | 1–6 | `00_indice.md` | Índice general reestructurado con anclas para Pandoc. Créditos omitidos. |
| 1. Introduction (Techno Fantasy Pillars, Before We Start) | 7–16 | `01_introduccion.md` | Pilares y pautas de diseño condensados en estilo de reglamento técnico. |
| 2. The World (10 Techno Fantasy Locations: Agathyon, Axis, Bentham, Donum Cœli, Extractor 7, Nautiloss, Nidavellir, Septentrion, Soul Nexus, Vragarath) | 17–61 | `02_01_ambientacion_tecno_fantasia.md` | Resumido en fichas de síntesis (*At a Glance*, ganchos, tablas de viaje). |
| Conflicts (Vehicle-Scale Battles, The Group Vehicle), Magic & Rituals (Magic 2.0, Soul Network), Technology (Cybernetics, Space Travel), Rare Items & Artifacts | 62–96 | `02_02_reglas_vehiculos_magia_equipo.md` | Reglas íntegras de batallas de vehículos, vehículo de grupo, cibernética, catálogo completo de equipo raro y artefactos. |
| 3. Protagonists (Themes, Custom Weapons, Quirks, Technospheres) | 97–147 | `03_01_opciones_armas_tecnoesferas.md` | Temas de personaje, 7 armas personalizadas, 15 peculiaridades y catálogo íntegro de Tecnoesferas. |
| New Classes (Esper, Mutant, Pilot) | 148–171 | `03_02_clases_tecno_fantasia.md` | 3 clases completas íntegras: Esper (talentos psíquicos), Mutante (teratologías) y Piloto (módulos, armaduras de combate y mechas). |
| New Heroic Skills | 172–180 | `03_03_habilidades_heroicas.md` | Catálogo íntegro de las Habilidades Heroicas de Tecnofantasía con tabla resumen y fichas completas. |
| 4. Antagonists (Techno Fantasy Villains, Commissioner Vyne, Ardent Squadron, Deepfusion, Admiral Ceryon, Innocentius XV) | 181–215 | `04_01_antagonistas_y_jefes.md` | Directrices de villanos y fichas completas de combate de los 5 jefes con todas sus fases y aliados. |
| Index | 216–218 | *(Omitido)* | Índice temático original sustituido por `00_indice.md`. |

---

## 3. Justificación de omisiones y condensaciones

### Secciones a omitir (según directrices §5)
- **Créditos, licencias y agradecimientos (pp. 1–4):** Material editorial no reglamentario.
- **Ficción de apertura, citas literarias y diálogos narrativos:** Eliminados.
- **Ejemplos narrativos de muestra sin reglas:** Condensados en 1–2 líneas precedidas por «*Ejemplo:*».
- **Ilustraciones, planos de naves decorativos e imágenes:** Descartados por completo.
- **Índice alfabético original (pp. 216–218):** Se compila `00_indice.md` estructurado.

### Secciones a resumir (según directrices §4 y §5)
- **Introducción y pilares (pp. 7–16):** Sintetizados en principios directos.
- **Localizaciones (pp. 17–61):** Fichas sintéticas con palabras clave, descripciones concisas, preguntas de creación y tablas íntegras de viaje d6–d20.

### Secciones a conservar íntegras (sin pérdida de datos)
- **Combate con vehículos (pp. 62–71):** Procedimiento de combate a escala vehicular, estadísticas de vehículos, chasis, armas y módulos del vehículo de grupo.
- **Magia 2.0 y Red de Almas (pp. 72–77):** Subsistemas de rituales informáticos y cibernéticos.
- **Cibernética y equipo raro (pp. 78–96):** Catálogo íntegro de implantes, armas, armaduras, escudos, accesorios y artefactos.
- **Armas personalizadas, peculiaridades y tecnoesferas (pp. 114–147):** Todas las fórmulas, combinaciones, catálogo de peculiaridades y tecnoesferas con costes y efectos.
- **Clases de Tecnofantasía (pp. 148–171):** Esper, Mutante y Piloto íntegros con todos sus subsistemas (disciplinas psíquicas, teratologías y módulos de mecha).
- **Habilidades Heroicas (pp. 172–180):** Todas las habilidades con requisitos y efectos mecánicos.
- **Jefes y antagonistas (pp. 181–215):** 5 jefes con perfiles completos de atributos, PV, PM, DEF, M.DEF, afinidades, equipo, ataques, conjuros, fases y reglas especiales.
