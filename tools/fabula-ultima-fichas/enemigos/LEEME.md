# Fichas de enemigo de ejemplo

Seis criaturas del manual básico para probar la vista de combate y los comandos `/enemigo`:

| Archivo | Criatura | Nivel | Para probar |
| --- | --- | --- | --- |
| `aullador-gris.json` | Aullador gris | 5 | Ataque cuerpo a cuerpo con bonificador alto |
| `rata-gigante.json` | Rata gigante | 5 | Vulnerable al fuego, ataque que envenena |
| `murcielago-vampiro.json` | Murciélago vampiro | 5 | Ataque a distancia, regla Volador |
| `diablillo.json` | Diablillo | 5 | Conjuros, inmune al fuego, ataque contra D. Mág |
| `gargola.json` | Gárgola | 10 | Constructo, conjuro con daño |
| `mercenario.json` | Mercenario | 10 | Dos armas, otras acciones |

**Importarlas**: panel del DJ → **Fichas de enemigo y PNJ** → **Cargar ejemplos** (solo añade las que falten). También puedes subir cualquier `.json` con **Importar JSON** (un objeto o una lista de objetos).

**Crear las tuyas**: copia uno de estos archivos y cámbialo, o pulsa **Nueva ficha** en el panel y edita el JSON. El formato completo está en `../docs/esquema-datos.md`, sección 9. Para pasar criaturas del bestiario del libro, pide a tu asistente que genere el JSON siguiendo esa sección.

Para que **Cargar ejemplos** incluya un archivo nuevo de esta carpeta, añádelo a `index.json`.
