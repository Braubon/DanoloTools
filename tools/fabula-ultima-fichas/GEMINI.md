# Fabula Ultima · Fichas — reglas del proyecto

Dos webs estáticas para el juego de rol *Fabula Ultima*, en español:
- `generador/` crea personajes, los sube de nivel y los exporta/importa en JSON.
- `visor/` muestra varias fichas en solo lectura, con pestañas, filtros y una vista de grupo.

- `panel/` es el panel del DJ (personajes de la partida en la nube, configuración del bot).
- `comandos/` es la página de consulta de los comandos del bot.
- `servidor/` es el código del bot de Discord y de la API (Node, sin dependencias); lo ejecutan las funciones de `/api/` en la raíz del repositorio.

Todas comparten la base de datos `data/` y el código de `assets/`.

## Estructura

```
data/                      Base de datos (un directorio por libro). Ver docs/esquema-datos.md
  manifest.json            Lista y orden de los libros
  basico/                  Manual básico (siempre activo)
  alta-fantasia/           Atlas de Alta Fantasía
personajes/                Fichas de ejemplo (el visor las usa si no hay API)
servidor/comandos.js       Definición de los comandos del bot (la usan Discord y comandos/)
servidor/bot.js            Manejadores de cada comando, botones y autocompletado
servidor/web.js            Funciones HTTP: /api/discord/, /api/auth/, /api/datos/
servidor/personajes.js     Almacén en Redis (personajes, relojes, combate)
servidor/kv.js · discord.js · motor.js   Redis REST, API de Discord, dados y reglas
assets/js/panel.js         Panel del DJ · assets/js/ayuda.js  Página de comandos
docs/bot-discord.md        Configuración del bot y de la base de datos
assets/js/db.js            Carga y filtrado de la base de datos (sin DOM)
assets/js/rules.js         Motor de reglas: cálculo, validación, subida de nivel (sin DOM)
assets/js/ficha.js         Piezas de HTML compartidas por las dos webs
assets/js/generador.js     Interfaz del generador
assets/js/visor.js         Interfaz del visor
assets/css/                base.css (tokens y componentes) + visor.css
tools/validar.mjs          Valida datos y personajes: node tools/validar.mjs
docs/esquema-datos.md      Referencia de todos los campos JSON
.agents/skills/incorporar-atlas/SKILL.md   Procedimiento para añadir libros
```

## Añadir contenido de un libro

Sigue la skill `incorporar-atlas` (`.agents/skills/incorporar-atlas/SKILL.md`) y la referencia `docs/esquema-datos.md`. Resumen:

1. Carpeta `data/<id-atlas>/` con `atlas.json` y un JSON por colección; regístrala en `data/manifest.json`.
2. Clases, sus catálogos y sus heroicas se activan con el atlas. Todo lo opcional (peculiaridades, poderes especiales, armas personalizadas, subsistemas…) se declara en `reglas_opcionales` y se marca con `regla_opcional` en el archivo. El equipo raro y los artefactos de cada atlas son siempre la regla opcional `equipo-raro`. Todas empiezan desactivadas.
3. Cifras fijas → `modificadores`; decisiones del jugador → `elecciones`; requisitos de heroicas → `requisitos.dominar / habilidades / nivel_min`.
4. Ejecuta `node tools/validar.mjs` hasta ver `✓ Sin errores.` y prueba en el navegador.

Nunca edites los archivos de `data/basico/` para meter contenido de otro libro: un atlas añade o, con `"reemplaza": true`, sustituye.

## Reglas para modificar el código

- Sin compilación ni dependencias: HTML + CSS + módulos ES nativos. No introduzcas frameworks, bundlers ni `npm install`.
- Rutas relativas (`../assets/`, `../data/`, `../personajes/`) para que funcione en Vercel y en cualquier subcarpeta.
- `db.js` y `rules.js` no tocan el DOM: el validador de Node los importa.
- Interfaz en español, minimalista, tema oscuro por defecto con alternancia a claro. Usa los tokens de color de `base.css`; no metas colores sueltos.
- El formato del personaje (`formato: "fabula-ultima-pj"`, `version: 1`) debe seguir abriéndose. Si añades campos, que sean opcionales y complétalos en `normalizarPersonaje`. Si un cambio rompe compatibilidad, sube `VERSION` en `rules.js` y migra en `normalizarPersonaje`.
- Toda regla de juego que afecte a cálculos va en `rules.js` (`calcular`, `validar`, `subirNivel`), no en la interfaz.
- Nuevo `stat` o `condicion` de modificador → `rules.js` y los conjuntos `STATS` / `CONDICIONES` de `tools/validar.mjs`, y documéntalo en `docs/esquema-datos.md`.
- En modo libre los errores de validación pasan a avisos; no bloquees nada en modo libre.

## Comprobar

```bash
node tools/validar.mjs          # datos + personajes de personajes/index.json
npx serve .                     # abre http://localhost:3000/generador/ y /visor/
```

Abrir los HTML con doble clic no funciona: los navegadores bloquean `fetch` en `file://`.

## Personajes por defecto del visor

Copia los `.json` exportados por el generador a `personajes/` y añade sus nombres de archivo a `personajes/index.json`. El visor los carga al abrirse; además el usuario puede cargar otros desde su equipo.

## Bot de Discord

- Para añadir un comando: defínelo en `servidor/comandos.js`, escribe su función en `MANEJADORES` de `servidor/bot.js`, despliega y pulsa «Actualizar comandos de Discord» en el panel. La página `comandos/` se genera sola.
- Toda lógica de reglas reutiliza `assets/js/rules.js`; no la dupliques en el servidor.
- `servidor/` no puede usar dependencias de npm ni APIs del navegador; `servidor/comandos.js` tampoco puede usar APIs de Node (lo importa el navegador).
- Los personajes guardados tienen `rev` (versión) y `discord` (jugador asignado). La web envía `rev` al guardar para detectar cambios hechos desde Discord.
- Nunca escribas secretos en el código: van en variables de entorno de Vercel (`.env.example` en la raíz).
