# Fabula Ultima · Fichas

Generador de personajes, vista de combate y bot de Discord para *Fabula Ultima*. Web estática: HTML, CSS y JavaScript sin compilación, lista para Vercel.

| Web | Ruta | Para qué |
| --- | --- | --- |
| Generador | `/generador/` | Crear personajes paso a paso, subirlos de nivel, cargar y descargar JSON. |
| Combate | `/visor/` | Vista de combate: el grupo y los enemigos en vanguardia y retaguardia, con una ficha rápida al pulsar cada uno. |
| Fichas | `/ficha/` | Fichas completas con pestañas y filtros, y el grupo con sus relaciones. La abre el botón «Detalles» de la vista de combate. |
| Panel del DJ | `/panel/` | Personajes y fichas de enemigo de la partida: importar, exportar, asignar a jugadores, editar, imágenes. Configuración del bot. |
| Comandos | `/comandos/` | Consulta de todos los comandos del bot de Discord, para jugadores y DJ. |

El bot de Discord y la partida en la nube funcionan con funciones de Vercel (`/api/`) y Upstash Redis. Configuración paso a paso: **`docs/bot-discord.md`**.

## Contenido incluido

- **Manual básico**: 15 clases, 54 conjuros (incluidos supremos y de PNJ), 31 habilidades heroicas, equipo básico y raro, cualidades y artefactos.
- **Atlas de Alta Fantasía**: Cantor, Comandante, Bailarín y Simbolista con sus claves, tonos, danzas y símbolos; 24 habilidades heroicas; dos Arcanos nuevos. Reglas opcionales: peculiaridades, poderes cero, armas personalizadas y equipo raro/artefactos del atlas.
- **Atlas de Baja Fantasía**: Cazador, Ilusionista y Monje; 12 conjuros de ilusionista, 8 habilidades heroicas y 15 trampas.
- **Atlas de Fantasía Natural**: Florista, Gourmet, Invocador y Mercader; 21 habilidades heroicas, magisemillas, manjares, invocaciones y 15 actividades de campamento. Reglas opcionales: peculiaridades, actividades de campamento, armas personalizadas y equipo raro/artefactos.
- **Atlas de Tecnofantasía**: Ésper, Mutante y Piloto; 18 habilidades heroicas, dones psíquicos, terioformas, módulos vehiculares (chasis, armadura, armas y soporte) y tecnoesferas (36 hoplosferas). Reglas opcionales: peculiaridades, tecnoesferas, armas personalizadas y equipo raro/artefactos.

En la pestaña **Contenido** del generador se activan los atlas y, dentro de cada uno, sus reglas opcionales (todas desactivadas por defecto). Lo desactivado desaparece de clases, equipo, heroicas y opciones.

## Generador

- Creación guiada: identidad, clases (5 niveles entre 2 y 3 clases), atributos, equipo con presupuesto de 500 z, vínculos, reglas opcionales y ahorros.
- Validación de reglas en tiempo real; **Modo libre** convierte los errores en avisos para casos especiales.
- Subida de nivel: clase nueva o existente, habilidad, habilidad heroica al dominar una clase y mejora de atributo en los niveles 20 y 40. Se puede deshacer.
- Tienda filtrable, arma personalizada, objeto raro a medida (base + cualidad) y objetos libres.
- Guarda automáticamente en el navegador. **Descargar JSON** / **Cargar** para mover el personaje.

## Combate (`/visor/`)

- Cuatro columnas: retaguardia y vanguardia enemigas | vanguardia y retaguardia aliadas. Sin enemigos en el campo se ve solo el grupo en formación.
- Cada ficha tiene una imagen de 124 × 124 (por defecto `assets/img/sprite-defecto.png`; el DJ la cambia con el botón **Imagen**).
- Al pulsar un personaje: PV, PM, PI, PF, ataque básico, defensas, iniciativa, atributos (con los estados aplicados), habilidades y conjuros desplegables, y **Detalles** (ficha completa en otra pestaña).
- Lo que ve cada uno lo decide el servidor según la cuenta de Discord:
  - **Espectador** (sin entrar, o sin estar en el servidor): posiciones, nombres e imágenes.
  - **Jugador** (miembro del servidor): las fichas de los PJ; de los enemigos, el nombre, la imagen, los estados, el daño recibido y lo revelado con el Estudio. Mueve sus propios PJ.
  - **DJ**: todo. Saca PNJ de sus fichas, aplica daño con afinidades, PV, PM y estados, revela información y mueve cualquier ficha.
- Se actualiza sola cada pocos segundos mientras la pestaña está visible.

## Fichas (`/ficha/`)

- Carga los personajes de la partida (exige entrar con Discord). Si la API no está disponible (en local sin `vercel dev`), usa las fichas de `personajes/`. También puedes abrir otras con **Abrir JSON** (se recuerdan en el navegador).
- Por personaje: Resumen, Habilidades, Magia, Equipo, Vínculos y Notas, con buscador y filtros por tipo.
- **Grupo**: PV, PM, PI, defensas, estados, orden de iniciativa y matriz de relaciones entre los personajes.

## Enemigos y PNJ

- Las fichas de PNJ se guardan en la partida (panel del DJ → **Fichas de enemigo y PNJ**): importar JSON, crear, editar el JSON a mano, imagen, exportar y eliminar. Formato en `docs/esquema-datos.md`.
- `enemigos/` trae seis criaturas del manual básico como ejemplo; el panel las importa con **Cargar ejemplos**.
- Cada PNJ colocado en el campo es una copia con sus propios PV, PM y estados («Aullador gris A», «B»…). Lo revelado con el Estudio vale para todas las copias de la misma ficha y se conserva para la próxima vez.

## Probar en local

Hace falta un servidor (los navegadores bloquean la carga de JSON desde `file://`):

```bash
npx serve .
# o
python3 -m http.server 8000
```

Abre `http://localhost:3000/` (o el puerto que indique).

## Publicar en Vercel

1. Sube la carpeta a un repositorio de GitHub.
2. En Vercel: *Add New → Project*, importa el repositorio. *Framework Preset*: **Other**. Sin comando de build ni directorio de salida.
3. Cada vez que cambies `personajes/` o `data/`, haz commit y Vercel vuelve a desplegar.

## Partida en la nube y bot de Discord

- **Panel del DJ** (`/panel/`): entra con Discord; solo quien tenga el rol `DJ` en el servidor puede gestionar personajes.
- **Generador**: si has entrado como DJ, aparece **Guardar en la partida**. Desde el panel, **Editar** abre un personaje de la partida en el generador.
- **Bot**: tiradas, ataques, conjuros, PV/PM/PI/PF, estados, relojes, iniciativa, combate, enemigos (`/enemigo`, `/estudiar`, `/revelar`) y gestión. Lista completa en `/comandos/`.
- Código del servidor en `servidor/` (sin dependencias); funciones de entrada en `/api/` de la raíz del repositorio.
- Guía de configuración: `docs/bot-discord.md`.

Para probar las funciones en local hace falta la CLI de Vercel (`vercel dev`) con las variables de entorno.

## Personajes de ejemplo

`personajes/` contiene tres fichas de ejemplo que la página de fichas solo usa si no hay API (ver `personajes/LEEME.md`). Puedes importarlas en el panel para probar el bot. `enemigos/` contiene seis fichas de enemigo de ejemplo (ver `enemigos/LEEME.md`).

## Añadir más atlas

Las instrucciones para Gemini en Antigravity están en:
- `GEMINI.md`: reglas del proyecto.
- `.agents/skills/incorporar-atlas/SKILL.md`: procedimiento para incorporar un libro, incluidas sus reglas opcionales.
- `docs/esquema-datos.md`: referencia de todos los campos.

Tras añadir datos, valida con:

```bash
node tools/validar.mjs
```

## Estructura

```
index.html            Portada
generador/            Generador de personajes
visor/                Vista de combate
ficha/                Fichas completas
panel/  comandos/     Panel del DJ y consulta de comandos
assets/               CSS, módulos JS compartidos e imagen por defecto
data/                 Base de datos por libro
servidor/             Bot de Discord y API (funciones de Vercel)
personajes/           Personajes de ejemplo
enemigos/             Fichas de enemigo de ejemplo
tools/validar.mjs     Validador de datos y personajes
docs/                 Esquema de datos
```
