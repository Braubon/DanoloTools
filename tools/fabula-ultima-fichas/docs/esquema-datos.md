# Esquema de la base de datos

Referencia completa de los JSON de `data/`. El generador, el visor y `tools/validar.mjs` dependen de estos campos: respétalos al añadir contenido.

## 1. Estructura

```
data/
├── manifest.json            ← lista de libros (orden de carga)
├── basico/                  ← manual básico (obligatorio, siempre activo)
│   ├── atlas.json
│   └── *.json               ← una colección por archivo
└── <id-del-atlas>/
    ├── atlas.json
    └── *.json
```

### manifest.json
```json
{ "version": 1, "atlas": [ { "id": "basico", "ruta": "basico/atlas.json" }, { "id": "alta-fantasia", "ruta": "alta-fantasia/atlas.json" } ] }
```
El manual básico va siempre primero.

### atlas.json
| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | string | Igual que el nombre de la carpeta, en kebab-case. |
| `nombre`, `nombre_original`, `abreviatura` | string | `abreviatura` aparece en las etiquetas de origen. |
| `tipo` | `"base"` \| `"atlas"` | |
| `obligatorio` | bool | Solo `true` en el básico. |
| `descripcion` | string | Una frase. Se muestra en la pestaña Contenido. |
| `reglas_opcionales` | array | `{ id, nombre, nombre_original, descripcion }`. Todas empiezan **desactivadas**. |
| `archivos` | array | `{ coleccion, ruta, regla_opcional? }`. |

## 2. Filtro de contenido

- Un atlas desactivado no aporta nada (ni clases, ni equipo, ni opciones, ni heroicas).
- Un archivo con `regla_opcional` solo se carga si ese atlas está activo **y** la regla está marcada.
- Un registro suelto también puede llevar `"regla_opcional": "<id>"`.
- El filtro se guarda en el personaje (`contenido.atlas` y `contenido.reglas`).

## 3. Identificadores y fusión

- `id` en minúsculas, sin tildes, con guiones: `danza-del-fenix`.
- Único **dentro de cada colección en todos los libros**. Un duplicado se ignora y el validador lo marca.
- Para sustituir a propósito un registro de otro libro: mismo `id` y `"reemplaza": true`.
- Los `id` de habilidades de clase son únicos en todo el juego (las heroicas los referencian).
- `tablas` se **fusionan** por `id`: los `valores` de un atlas se añaden a los del básico (así el atlas añade el tema «Redención»).

## 4. Colecciones

Campos comunes: `id`, `nombre`, `nombre_original` (inglés). Los textos admiten el markdown mínimo del apartado 7.

### clases
```json
{
  "id": "cantor", "nombre": "Cantor", "nombre_original": "Chanter", "descripcion": "…",
  "beneficios": {
    "pv": 0, "pm": 5, "pi": 0,
    "competencias": ["armas_marciales_cuerpo"],
    "rituales": ["ritualismo"],
    "proyectos": false,
    "eleccion": [ { "id": "pv", "etiqueta": "+5 PV máximos", "pv": 5 }, { "id": "pm", "etiqueta": "+5 PM máximos", "pm": 5 } ],
    "texto": "Texto literal del beneficio gratuito."
  },
  "habilidades": [ /* ver abajo */ ]
}
```
Competencias válidas: `armas_marciales_cuerpo`, `armas_marciales_distancia`, `armaduras_marciales`, `escudos_marciales`. Rituales: ids de la tabla `disciplinas_rituales`. `eleccion` solo si el beneficio es a elegir.

**Habilidad de clase**
| Campo | Notas |
| --- | --- |
| `id`, `nombre`, `nombre_original` | |
| `sl_max` | Nivel máximo de habilidad (1 si no se repite). |
| `tipo` | `pasiva` · `accion` · `reaccion` · `otra` (sin acción / especial). Alimenta el filtro del visor. |
| `activacion` | Texto de «Activación / coste». |
| `efecto` | Texto completo. |
| `modificadores` | Opcional. Apartado 5. |
| `elecciones` | Opcional. Apartado 6. |
| `rituales` | Opcional. Disciplinas que habilita. |

### conjuros
```json
{ "id": "ignis", "nombre": "Ignis", "nombre_original": "Ignis", "lista": "elementalista",
  "pm": "10 × obj.", "objetivo": "Hasta tres criaturas", "duracion": "Instantánea", "ofensivo": true,
  "efecto": "…", "oportunidad": "…", "supremo": false }
```
`pm` es texto (puede ser «Hasta 20»). Una lista nueva se declara en la tabla `listas_conjuros` del atlas. Los conjuros supremos (`supremo: true`) solo se obtienen con heroicas (`otorga_conjuros`).

### opciones
Rasgos elegibles dentro de una habilidad: arcanos, danzas, símbolos, claves y tonos, disciplinas tecnológicas…
```json
{ "id": "danza-del-fenix", "grupo": "danza", "nombre": "Danza del fénix", "duracion": "Hasta el inicio de tu siguiente turno", "efecto": "…" }
{ "id": "arcano-tauro", "grupo": "arcano", "nombre": "Arcano de Tauro", "detalles": [ { "etiqueta": "Fusión", "texto": "…" } ] }
{ "id": "alquimia-avanzada", "grupo": "disciplina_tecnologica", "requiere": ["alquimia-base"], "efecto": "…" }
```
`grupo` agrupa; una elección de tipo `opciones` filtra por `grupos`. Un atlas puede añadir opciones a un grupo del básico (p. ej. nuevos arcanos): el Arcanista los ve sin tocar su clase.

### habilidades_heroicas
```json
{ "id": "bimago", "nombre": "Bimago", "nombre_original": "Bimagus",
  "requisitos": { "texto": "Literal del libro.", "dominar": { "clases": ["elementalista", "entropista", "espiritista"], "n": 2 },
                  "habilidades": [], "nivel_min": 30 },
  "resumen": "Una línea.", "efecto": "…",
  "modificadores": [], "elecciones": [], "otorga_conjuros": [], "max_veces": 1 }
```
- `dominar.clases` vacío o ausente = cualquier clase dominada. `n` = cuántas de la lista (por defecto 1).
- `habilidades`: ids de habilidades de clase que hay que poseer.
- `tema`: Tema obligatorio (lo usa alguna peculiaridad).

### armas
```json
{ "id": "katana", "nombre": "Katana", "rareza": "basico", "categoria": "espada", "coste": 200,
  "precision": { "atributos": ["DES", "PER"], "bonus": 1 }, "dano": { "bonus": 10, "tipo": "fisico" },
  "manos": 2, "alcance": "cuerpo", "marcial": true, "cualidad": "", "modificadores": [], "comprable": true }
```
`categoria`: `arcana arco pelea daga fuego flagelo pesada lanza espada arrojadiza`. `alcance`: `cuerpo` | `distancia`. `rareza`: `basico` | `raro`. Atributos: `DES PER VIG VOL` (INT del inglés = PER). Tipos de daño: `fisico aire rayo oscuro tierra fuego hielo luz veneno`.

### armaduras
```json
{ "id": "brigantina", "rareza": "basico", "coste": 150, "def": { "fijo": 10 }, "mdef": { "dado": "PER", "bonus": 0 }, "init": -2, "marcial": true, "cualidad": "" }
```
`def` / `mdef`: `{ "fijo": n }` o `{ "dado": "DES"|"PER", "bonus": n }`. `cuenta_como_arma_arcana: true` para casos como la Túnica roja.

### escudos
`def`, `mdef`, `init` son números (bonificadores). `marcial`, `rareza`, `coste`, `cualidad`.

### accesorios
`coste`, `cualidad`, `modificadores`, `rareza: "raro"`.

### cualidades
Para el constructor de objetos raros a medida: `aplica` (`["arma"]`, `["armadura","escudo"]`, `["accesorio"]`), `grupo`, `coste`, `efecto`, `modificadores`.

### artefactos
`descripcion` (apariencia) y `efecto`. Sin precio.

### peculiaridades (regla opcional)
`descripcion`, `efecto`, `requisitos?` (mismo formato que heroicas), `elecciones?`, `modificadores?`.

### poderes_cero_disparadores / poderes_cero_efectos (regla opcional)
Disparador: `secciones` (texto), `efecto`. Efecto: `efecto`, `elecciones?`.

### personalizaciones_arma / plantillas_arma (regla opcional)
Plantilla: `coste`, `manos`, `dano_base`, `tipo_dano`, `personalizaciones` (cuántas), `precision_opciones`, `alcance_opciones`, `categorias`, `efecto`.
Personalización: `marcial`, `cuenta`, `coste_extra?`, `arma { precision?, dano?, dano_por_categoria?, elige_tipo? }`, `modificadores?`, `cuenta_como_escudo?`, `excluye_categorias?`, `incompatible?`, `segunda_forma?`.

### tablas
`{ "id", "nombre", "valores": [...] }`. El motor usa: `atributos`, `perfiles_atributos`, `tipos_dano`, `estados`, `emociones`, `categorias_arma`, `competencias`, `disciplinas_rituales`, `listas_conjuros`, `especies_pnj`, `temas`, `identidad_*`, `creacion` (parámetros numéricos: nivel inicial, presupuesto, PI base, límites…).

## 5. Modificadores

Bonos numéricos permanentes que el motor suma automáticamente:
```json
"modificadores": [ { "stat": "def", "valor": "SL", "condicion": "sin_armadura_marcial_ni_escudo" } ]
```
**stat**: `pv_max pm_max pi_max def mdef init precision precision_cuerpo precision_distancia magia dano_cuerpo dano_distancia dano_conjuros dado_DES dado_PER dado_VIG dado_VOL` (`dado_*` sube tamaños de dado: 1 = d8→d10).

**valor**: número o expresión con `SL`, `NIVEL`, `CLASES`, `DOMINADAS`, `+ - * / ( ) ? : >= <= > < ==`. Ej.: `"SL*3"`, `"NIVEL>=40?20:10"`, `"2*CLASES"`.

**condicion** (opcional): `sin_armadura_marcial_ni_escudo`, `sin_armadura_marcial`, `sin_armas_ni_escudos`, `arma_y_escudo`, `daga_equipada`, `arma_arcana_equipada`.

En objetos, los modificadores solo cuentan si el objeto está equipado. Lo situacional (resistencias, «mientras estés en Crisis», daño contra especies) se deja en el texto.

Si un libro nuevo necesita un `stat` o una `condicion` que no existe, añádelo en `assets/js/rules.js` (`calcular` / `COND`) y en los conjuntos `STATS` / `CONDICIONES` de `tools/validar.mjs`.

## 6. Elecciones

Decisiones que el jugador toma al adquirir algo (conjuros, opciones, textos):
```json
"elecciones": [ { "clave": "conjuros", "tipo": "conjuros", "etiqueta": "Conjuros de Elementalista", "filtro": { "lista": ["elementalista"] }, "min": "SL", "max": "SL" } ]
```
| tipo | Campos | Se guarda como |
| --- | --- | --- |
| `conjuros` | `filtro { lista[], supremo?, excluir[] }`, `min`, `max`, `misma_lista?` | array de ids |
| `opciones` | `grupos[]`, `min`, `max`, `min_por_grupo?` | array de ids |
| `seleccion` | `valores[]` o `tabla`, `cantidad` | array de valores |
| `texto` / `texto_largo` | — | string |
| `lista_texto` | `min`, `max` | array de strings |

Comunes: `clave` (única en la fuente), `etiqueta`, `nota?`, `requiere_opcion?` (solo aparece si ya se eligió esa opción). `min`/`max` admiten expresiones. Por defecto los conjuros supremos quedan fuera.

En el personaje: habilidades de clase → `elecciones["hab:<id>"][clave]`; heroicas → `heroicas[i].elecciones`; peculiaridad → `opcionales.peculiaridad.elecciones`; poder cero → `opcionales.poder_cero.elecciones`.

## 7. Convenciones de texto

- Markdown mínimo: `**negrita**`, `*cursiva*`, listas con `- ` (subnivel con dos espacios), tablas `| … |`, párrafos separados por línea en blanco.
- Sin anclas `{#…}` ni enlaces `[texto](#…)`.
- Fórmulas entre corchetes: `[DES + PER]`, `[TM + 10]`, `[SL × 5]`.
- Términos unificados con el manual básico: estados *confundido, débil, enfurecido, envenenado, estremecido, lento* (sacudido → estremecido, aturdido → confundido, avenenado → envenenado); daño *oscuro* (sombra / oscuridad); Brecha (no Fisura); Robaalmas; Antimagia (no Disipar); Agarre del mono; multi (no multigolpe); Tirada Mayor = TM (no TA).

## 8. Formato del personaje (resumen)

`formato: "fabula-ultima-pj"`, `version: 1`. Campos principales: `contenido`, `modo_libre`, `creacion_completa`, `identidad`, `nivel`, `px`, `pf`, `zenit`, `atributos { perfil, base, mejoras[] }`, `clases[] { id, habilidades { id: SL }, beneficio }`, `heroicas[]`, `elecciones`, `equipo { equipado, objetos[] }`, `vinculos[] { hacia, emociones[] }`, `opcionales`, `estado { pv, pm, pi, estados[] }`, `notas`, `historial[]`, `calculado` (solo informativo). El nivel de una clase es la suma de los SL de sus habilidades. Los objetos de inventario apuntan a la base de datos (`coleccion` + `ref`) o llevan su definición en `personalizado`.
