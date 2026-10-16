# Carpeta de personajes de ejemplo

Con la partida en la nube configurada (ver `../docs/bot-discord.md`), el visor, el panel y el bot usan los personajes guardados en la base de datos y **no leen esta carpeta**. Solo se usa como alternativa cuando no hay API (por ejemplo, sirviendo la web en local con un servidor estático).

## Formato de los archivos

Cada `.json` es un personaje con el mismo formato que devuelve **Exportar** en el panel del DJ (o `/exportar` en Discord):

- `"formato": "fabula-ultima-pj"` y `"version": 1`.
- Sin `rev` ni `discord`: la versión y el jugador asignado solo existen en la base de datos.
- Sin `calculado`: PV, PM, Defensa, etc. se recalculan siempre a partir de los libros.

Los archivos que descarga el generador con **Descargar JSON** añaden un bloque `calculado` de solo lectura. Es opcional: el panel, el bot y el visor lo ignoran, así que ambos formatos se importan igual.

## Pasar estos personajes a la partida

Panel del DJ → **Importar JSON** y selecciona los archivos. También puedes hacerlo en Discord con `/importar archivo:… jugador:@…`.

## Usarlos sin nube (local)

El visor carga las fichas listadas en `index.json`:

1. Descarga el personaje desde el panel (**Exportar**) o desde el generador (**Descargar JSON**).
2. Copia el archivo a esta carpeta.
3. Añade su nombre a `index.json`:

```json
{
  "personajes": ["aria-valen.json", "lio-arden.json", "nim.json", "mi-personaje.json"]
}
```

4. Recarga el servidor local (o vuelve a desplegar).

Los tres personajes incluidos (Aria Valen, Lio Arden y Nim) son ejemplos validados con los datos actuales de los libros. Bórralos y quítalos de `index.json` cuando tengas los vuestros.

Para que la pestaña **Grupo** dibuje las relaciones, el campo «Hacia quién» de cada vínculo debe coincidir con el nombre exacto de otro personaje cargado.
