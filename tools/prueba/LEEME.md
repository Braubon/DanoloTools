# Wildcarder

Generador de prompts con wildcards, con la misma filosofía que los wildcards de ComfyUI: cada lista es un archivo `.txt`, una opción por línea, y `__nombre__` en el prompt se sustituye por una línea al azar.

```
wildcarder/
├─ Wildcarder (Windows).bat    ← doble clic en Windows
├─ Wildcarder (Mac).command    ← doble clic en Mac
├─ wildcarder-linux.sh         ← Linux
├─ index.html                  ← la web
├─ server/                     ← el pequeño servidor local (no hace falta tocarlo)
└─ wildcards/                  ← tus listas .txt (176 archivos, ~3.500 entradas)
```

## Cómo usarla

1. Haz doble clic en el lanzador de tu sistema. Se abre una ventana negra y el navegador con la web, que ya tiene cargada la carpeta `wildcards` del proyecto.
2. Escribe tu prompt. Al teclear `__` aparece un buscador de wildcards (flechas + `Tab`/`Enter`).
3. Pulsa **Generar** (o `Ctrl + Enter`).

Deja la ventana negra abierta mientras uses la web y ciérrala para terminar. Si haces doble clic en el lanzador estando ya abierto, solo abre otra pestaña.

Si abres `index.html` directamente con el lanzador en marcha, la web salta sola a la versión conectada.

### Editar las listas

Edita los `.txt` de `wildcards/` con tu editor (Bloc de notas, VS Code, Notepad++…) y guarda. La web se actualiza en uno o dos segundos sin hacer nada. Puedes crear, borrar o renombrar archivos y carpetas: la lista de la izquierda cambia sola.

Atajos desde la web:

- **Abrir carpeta wildcards** (arriba) abre la carpeta en el Explorador / Finder.
- **Editar el .txt** (pestaña Archivo) abre ese archivo en tu editor de texto predeterminado.

Guarda los `.txt` en UTF-8 (el Bloc de notas actual lo hace por defecto).

### La primera vez

- **Windows**: no hace falta instalar nada (usa PowerShell, que viene con Windows). Si aparece «Windows protegió su PC», pulsa *Más información → Ejecutar de todas formas*. Para que no vuelva a salir: clic derecho en el ZIP → *Propiedades → Desbloquear* antes de descomprimir.
- **Mac**: necesita Python 3. Si no lo tienes, macOS te ofrecerá instalar las herramientas de desarrollo: acepta. Si dice que el archivo es de un desarrollador no identificado, clic derecho → *Abrir* → *Abrir*.
- **Linux**: `./wildcarder-linux.sh` (necesita `python3`).

La web usa el puerto 8765 de tu ordenador y solo es accesible desde él.

### Sin lanzador

Si abres `index.html` sin el lanzador, la web te deja elegir la carpeta a mano (botón **Elegir carpeta**, mejor en Chrome o Edge), pero tendrás que hacerlo cada vez.

## Sintaxis

| Escribe | Resultado |
|---|---|
| `__color__` | Una línea al azar de `wildcards/color.txt` |
| `__color/warm__` | Subcarpetas: `wildcards/color/warm.txt` |
| `__color/*__` | Junta todas las líneas de todos los `.txt` de `color/` (con subcarpetas) |
| `__*/fantasy__` | El asterisco vale en cualquier parte del nombre |
| `{red\|blue\|green}` | Una de las opciones |
| `{2$$a\|b\|c}` | 2 opciones distintas separadas por coma |
| `{1-3$$a\|b\|c}` | Entre 1 y 3 opciones |
| `{2$$ and $$a\|b\|c}` | Separador propio |
| `{3::a\|b}` | Peso: «a» sale 3 veces más |

Dentro de los `.txt`:

- Una opción por línea. Las líneas vacías y las que empiezan por `#` se ignoran (la primera línea de cada archivo es un comentario que dice qué es).
- Una línea puede contener otros wildcards y variantes, así se anidan las listas.
- Repetir una línea hace que salga más a menudo.
- Los nombres no distinguen mayúsculas.

La sintaxis es la de Dynamic Prompts e Impact Pack, así que puedes copiar la carpeta `wildcards` tal cual a la carpeta de wildcards de tu ComfyUI.

## Cómo están organizadas las listas

Convención: un archivo y una carpeta con el mismo nombre. El archivo mezcla el contenido de la carpeta.

- `__elemental__` → elige entre `__elemental/fire__`, `__elemental/water__`… (efectos: «drifting embers», «crashing waves»)
- `__elemental/type__` → solo la palabra: fire, frost, void…
- `__inspiration__` → llama a `__inspiration/culture__`, `__art/movement__`, `__inspiration/genre__`, `__elemental__`, `__art/style__`…
- `__character/fantasy__` → descripción completa construida con raza, clase, cara, pelo, ropa…
- `__template/...__` → las **ideas base** de la web (prompts completos)

Listas disponibles, agrupadas por carpeta:

- **art**: camera, camera/angle, camera/lens, camera/shot, composition, lighting, mood, movement, quality, style, style/craft, style/digital, style/drawing, style/illustration, style/painting, style/photo
- **character**: character, age, body, class, class/civilian, class/magic, class/ranger, class/rogue, class/scifi, class/support, class/warrior, face, face/expression, face/eye_color, face/eyes, face/facial_hair, face/marks, face/mouth, face/nose, face/shape, face/skin, fantasy, gender, hair, hair/color, hair/style, outfit, outfit/accessory, outfit/armor, outfit/cyberware, outfit/fantasy, outfit/scifi, pose, race, race/beastfolk, race/fantasy, race/mythic, race/scifi, race/spirit, race/undead, scifi, trait
- **color**: color, basic, cool, dark, earth, jewel, metallic, neon, neutral, palette, pastel, warm
- **creature**: creature, alien, anatomy, beast, construct, horror, mythic, robot, size
- **elemental**: elemental, air, arcane, earth, fire, ice, light, lightning, nature, poison, shadow, type, void, water
- **inspiration**: inspiration, concept, culture, era, genre, myth, nature
- **landscape**: landscape, alien, desert, fantasy, feature, forest, frozen, mountain, plains, underground, volcanic, wasteland, water
- **location**: location, architecture, fantasy, ruin, scifi, urban
- **material**: material, exotic, fabric, finish, gem, leather, metal, organic, stone, synthetic, wood
- **object**: object, animal, food, gadget, household, plant, toy
- **prop**: prop, armor, artifact, book, condition, container, detail, furniture, instrument, jewelry, potion, tech, tool, weapon, weapon/focus, weapon/melee, weapon/ranged, weapon/scifi
- **scene**: scene, atmosphere, season, time, weather
- **template**: creature, fantasy_character, landscape, location, mashup, prop, random, scifi_character, still_life, vehicle
- **vehicle**: vehicle, air, fantasy, ground, sea, space

Ejemplo: `__character/race/fantasy__` es el archivo `wildcards/character/race/fantasy.txt`.

## Añadir tus propias ideas base

Crea o edita cualquier `.txt` dentro de `wildcards/template/`. Cada línea es un prompt completo con wildcards. Aparecen en la pestaña **Ideas base** y también puedes usarlos como `__template/tu_archivo__`.

## Trucos de la web

- **Ver origen**: cada parte del resultado se colorea según el wildcard del que sale. Pasa el ratón para ver la cadena completa (`__character/fantasy__ › __character/race__ › __character/race/fantasy__`) y haz clic para abrir ese `.txt`.
- **Fijar semilla**: repite exactamente los mismos resultados mientras ajustas el prompt o los `.txt`.
- **Limpiar comas**: quita comas dobles y espacios sobrantes y corrige «a elf» → «an elf».
- **Descargar .txt**: guarda los resultados, uno por línea. Si lo metes en `wildcards/` se convierte en otro wildcard.
- Doble clic en un archivo de la lista lo inserta en el prompt.
