---
name: incorporar-atlas
description: Incorpora un nuevo atlas o suplemento de Fabula Ultima (clases, habilidades heroicas, conjuros, opciones, equipo, artefactos y reglas opcionales) a la base de datos JSON de data/, o amplía uno existente. Úsala cuando el usuario pida añadir contenido de un libro a las webs.
---

# Incorporar un atlas a la base de datos

Las dos webs leen todo de `data/`. No hay que tocar código para añadir clases, equipo u opciones: basta con JSON bien formado. Lee `docs/esquema-datos.md` antes de empezar; es la referencia de cada campo.

## 0. Material de partida

El usuario suele aportar el atlas ya transcrito a markdown en español (índice, ambientación, reglas, clases, heroicas, antagonistas). Localiza:

| Busca en el libro | Va a |
| --- | --- |
| Clases nuevas y sus habilidades | `clases.json` |
| Catálogos que una habilidad deja elegir (danzas, símbolos, arcanos, claves…) | `opciones.json` |
| Conjuros de clase | `conjuros.json` (+ lista nueva en `tablas.json`) |
| Habilidades heroicas | `habilidades_heroicas.json` |
| Armas / armaduras / escudos / accesorios raros | `armas.json`, `armaduras.json`, `escudos.json`, `accesorios.json` |
| Artefactos | `artefactos.json` |
| Reglas opcionales de personaje | archivos propios con `regla_opcional` |
| Temas, identidades, tablas que amplían las del básico | `tablas.json` (se fusionan por `id`) |

Ignora ambientación, antagonistas, jefes y consejos de DJ: las webs solo gestionan personajes jugadores.

## 1. Crear la carpeta del atlas

1. `id` en kebab-case sin tildes (`fantasia-natural`, `fantasia-tecnologica`). Carpeta `data/<id>/`.
2. Crea `data/<id>/atlas.json` copiando la forma de `data/alta-fantasia/atlas.json`: `tipo: "atlas"`, `obligatorio: false`, `abreviatura` corta.
3. Añade la entrada al final de `data/manifest.json`.

## 2. Reglas opcionales: cómo decidir y cómo declararlas

**Es regla opcional** todo lo que el libro presenta como opcional o que una mesa puede no usar sin que las clases del atlas dejen de funcionar: peculiaridades, poderes especiales, armas o vehículos personalizados, subsistemas de facción, etc.

**No es regla opcional** lo que forma parte del atlas en sí: clases, sus habilidades, los catálogos que esas habilidades necesitan (danzas, símbolos…), sus habilidades heroicas y las opciones nuevas para clases del básico (p. ej. nuevos arcanos). Eso entra en cuanto se activa el atlas.

**Convención fija:** el equipo raro y los artefactos de cada atlas son siempre la regla opcional `equipo-raro`.

Todas las reglas opcionales empiezan **desactivadas**. Para declararlas:

```json
"reglas_opcionales": [
  { "id": "equipo-raro", "nombre": "Equipo raro y artefactos", "nombre_original": "Rare Items & Artifacts", "descripcion": "Una frase." },
  { "id": "mi-regla", "nombre": "…", "nombre_original": "…", "descripcion": "Una frase que diga qué aporta." }
],
"archivos": [
  { "coleccion": "armas", "ruta": "armas.json", "regla_opcional": "equipo-raro" },
  { "coleccion": "peculiaridades", "ruta": "peculiaridades.json", "regla_opcional": "mi-regla" }
]
```

Elige el encaje de cada regla opcional en este orden:

1. **Encaja en una colección existente** (`peculiaridades`, `poderes_cero_*`, `personalizaciones_arma`, `plantillas_arma`, `opciones`, `armas`…). Úsala con `regla_opcional` en el archivo. Si un atlas trae «peculiaridades» propias, van a la colección `peculiaridades` con el `id` de regla de ese atlas: el generador ya las muestra en «Reglas opcionales».
2. **Es una elección hecha desde una habilidad o heroica**: modélala como `opciones` de un `grupo` nuevo y referencia el grupo en `elecciones`.
3. **Modifica cifras** (PV, Defensa, precisión…): `modificadores` en el registro.
4. **Subsistema nuevo sin encaje** (un reloj propio, un vehículo con ficha…). Requiere código; hazlo de forma mínima:
   - añade el nombre de la colección a `COLECCIONES` en `assets/js/db.js`;
   - en `assets/js/generador.js`, dentro de `panelExtras`, añade una sección que solo aparezca si `db.col.<coleccion>.length` y guarde la elección en `pj.opcionales.<clave>`;
   - en `assets/js/visor.js`, muéstralo en `tabNotas`;
   - en `tools/validar.mjs`, añade sus comprobaciones.
   No cambies el formato de lo que ya existe en el personaje.

Si una regla del atlas **modifica** una regla del básico, no edites el básico; hazlo desde un archivo con `regla_opcional`:
- Otro parámetro de creación (presupuesto, PI base…): tabla `{ "id": "creacion", "valores": [ { "id": "presupuesto_inicial", "valor": 800 } ] }`. El último valor cargado gana.
- Otra versión de un registro (clase, objeto…): mismo `id` y `"reemplaza": true`.
- Sustituir una tabla entera: mismo `id` y `"reemplaza": true`; sin ese campo, sus valores se añaden a los existentes.

## 3. Clases

Para cada clase:
- `beneficios` con `pv`, `pm`, `pi`, `competencias`, `rituales`, `proyectos` y `texto` literal. Si el beneficio es a elegir, usa `eleccion`.
- Una entrada por habilidad, con `sl_max`, `tipo` (`pasiva` | `accion` | `reaccion` | `otra`), `activacion` y `efecto` completo.
- Bonos fijos → `modificadores` (p. ej. `{ "stat": "pv_max", "valor": "SL*3" }`).
- Habilidades que enseñan conjuros u opciones por nivel → `elecciones` con `min`/`max` en función de `SL`.
- Habilidades que dan rituales → `"rituales": ["…"]`.

Comprueba que los `id` de habilidad no existan ya en otra clase.

## 4. Habilidades heroicas

Convierte el requisito a datos: `dominar.clases` (ids), `dominar.n` si pide varias, `habilidades` si exige una concreta, `nivel_min`. Copia el texto literal en `requisitos.texto`. Si enseñan un conjuro supremo, créalo en `conjuros.json` con `supremo: true` y referéncialo en `otorga_conjuros`.

## 5. Equipo

Una entrada por fila de tabla. Marca `marcial: true` si el libro usa ⚔ o [M]. Traduce la precisión a `{ atributos, bonus }` y el daño a `{ bonus, tipo }`. Si la cualidad da DEF, D. Mág, iniciativa, PV/PM, precisión o magia fijas, añade `modificadores`; lo demás queda en `cualidad`.

## 6. Texto y terminología

Sigue el apartado 7 de `docs/esquema-datos.md`: sin anclas ni enlaces, fórmulas entre corchetes y términos unificados (estremecido, confundido, envenenado, oscuro, Brecha, Robaalmas, Antimagia, TM…). Conserva el texto de las reglas completo; no resumas efectos.

## 7. Validar y probar

1. `node tools/validar.mjs` → debe terminar en `✓ Sin errores.` Corrige todo lo marcado con ✗.
2. `npx serve .` y abre `/generador/`:
   - En Contenido activa el atlas y comprueba que aparecen sus clases; desactívalo y comprueba que desaparecen.
   - Activa cada regla opcional por separado y verifica que su contenido solo aparece con ella.
   - Crea un personaje con una clase nueva, completa sus elecciones y súbelo un nivel.
3. Abre `/visor/` y carga ese personaje.

## 8. Lista de comprobación

- [ ] `data/<id>/atlas.json` creado y registrado en `manifest.json`.
- [ ] Reglas opcionales declaradas, con `equipo-raro` para equipo raro y artefactos.
- [ ] Ningún `id` duplicado; heroicas con requisitos en datos.
- [ ] Elecciones y modificadores donde el libro da opciones o cifras fijas.
- [ ] Validador sin errores y prueba manual hecha.
- [ ] `README.md` actualizado con el nuevo libro.
