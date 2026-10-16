# Carpeta de personajes de ejemplo

Con la partida en la nube configurada (ver `../docs/bot-discord.md`), el visor muestra los personajes guardados en el panel del DJ y **no usa esta carpeta**. Solo se usa como alternativa cuando no hay API (por ejemplo, sirviendo la web en local con un servidor estático).

En ese caso, el visor carga las fichas listadas en `index.json`.

1. Exporta el personaje desde el generador con **Descargar JSON**.
2. Copia el archivo a esta carpeta.
3. Añade su nombre a `index.json`:

```json
{
  "personajes": ["aria-valen.json", "lio-arden.json", "nim.json", "mi-personaje.json"]
}
```

4. Vuelve a desplegar en Vercel (o recarga el servidor local).

Los tres personajes incluidos son ejemplos: bórralos y quítalos de `index.json` cuando tengas los vuestros.

Para que la pestaña **Grupo** dibuje las relaciones, el campo «Hacia quién» de cada vínculo debe coincidir con el nombre exacto de otro personaje cargado.
