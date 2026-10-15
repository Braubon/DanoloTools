# Fabula Ultima · Fichas

Generador y visor de personajes de *Fabula Ultima*. Web estática: HTML, CSS y JavaScript sin compilación, lista para Vercel.

| Web | Ruta | Para qué |
| --- | --- | --- |
| Generador | `/generador/` | Crear personajes paso a paso, subirlos de nivel, cargar y descargar JSON. |
| Visor | `/visor/` | Ver varias fichas, navegar entre ellas con pestañas y filtros, y ver el grupo con sus relaciones. |

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

## Visor

- Carga por defecto las fichas de `personajes/` (lista en `personajes/index.json`) y las que subas con **Cargar fichas** (se recuerdan en el navegador).
- Por personaje: Resumen, Habilidades, Magia, Equipo, Vínculos y Notas, con buscador y filtros por tipo.
- **Grupo**: PV, PM, PI, defensas, estados, orden de iniciativa y matriz de relaciones entre los personajes.

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

## Personajes del visor

Ver `personajes/LEEME.md`. Copia los JSON exportados a `personajes/` y añádelos a `personajes/index.json`. Los tres incluidos son de ejemplo.

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
generador/  visor/    Las dos webs
assets/               CSS y módulos JS compartidos
data/                 Base de datos por libro
personajes/           Fichas por defecto del visor
tools/validar.mjs     Validador de datos y personajes
docs/                 Esquema de datos
```
