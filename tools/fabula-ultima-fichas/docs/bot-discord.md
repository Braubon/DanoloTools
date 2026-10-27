# Bot de Discord y partida en la nube — guía de configuración

Se hace una sola vez. Calcula unos 20 minutos. Necesitas: tu cuenta de Discord con permisos de administración en el servidor de la partida y acceso al proyecto **danolotools** en Vercel.

En esta guía, `https://danolotools.vercel.app` es la dirección de tu web. Si usas otro dominio, cámbialo en todas las URL.

---

## 1. Crear la aplicación en Discord

1. Entra en <https://discord.com/developers/applications> y pulsa **New Application**. Nómbrala (por ejemplo «Fabula Ultima»).
2. En **General Information** copia y guarda:
   - **Application ID** → será `DISCORD_APP_ID`
   - **Public Key** → será `DISCORD_PUBLIC_KEY`
   Deja **Interactions Endpoint URL** vacío por ahora (paso 6).
3. En **Bot**:
   - Pulsa **Reset Token**, confirma y copia el token → será `DISCORD_BOT_TOKEN`. No lo compartas con nadie.
   - Activa **Server Members Intent** (sirve para que el panel muestre la lista de jugadores). Guarda los cambios.
4. En **OAuth2**:
   - Pulsa **Reset Secret** y copia el **Client Secret** → será `DISCORD_CLIENT_SECRET`.
   - En **Redirects**, pulsa **Add Redirect** y escribe exactamente `https://danolotools.vercel.app/api/auth/` (con la barra final). Guarda.

## 2. Invitar el bot a tu servidor

1. En **OAuth2 → URL Generator** marca los scopes **bot** y **applications.commands**.
2. En **Bot Permissions** marca **Send Messages**, **Embed Links** y **Read Message History**.
3. Copia la URL generada abajo del todo, ábrela en el navegador, elige el servidor de la partida y acepta.

## 3. Preparar el servidor de Discord

1. **Ajustes del servidor → Roles → Crear rol** llamado `DJ` (exactamente así). Asígnatelo. Cualquiera con este rol podrá usar los comandos de DJ y editar personajes en el panel.
2. Activa el modo desarrollador: **Ajustes de usuario → Avanzado → Modo desarrollador**.
3. Clic derecho sobre el icono del servidor → **Copiar ID del servidor** → será `DISCORD_GUILD_ID`.

## 4. Base de datos en Vercel

1. En Vercel abre el proyecto **danolotools** → pestaña **Storage** → **Create Database**.
2. Elige **Upstash for Redis** (Marketplace). El plan gratuito sobra para una partida.
3. Créala y, cuando te lo pregunte, **conéctala al proyecto danolotools** en todos los entornos. Vercel añade solas las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.

## 5. Variables de entorno

En el proyecto → **Settings → Environment Variables**, añade (entorno *Production*, y también *Preview* si quieres probar ramas):

| Nombre | Valor |
| --- | --- |
| `DISCORD_APP_ID` | Application ID (paso 1.2) |
| `DISCORD_PUBLIC_KEY` | Public Key (paso 1.2) |
| `DISCORD_BOT_TOKEN` | Token del bot (paso 1.3) |
| `DISCORD_CLIENT_SECRET` | Client Secret (paso 1.4) |
| `DISCORD_GUILD_ID` | ID del servidor (paso 3.3) |
| `DJ_ROLE_NAME` | *(opcional)* Nombre del rol de DJ si no se llama `DJ` |

Después, en **Deployments**, abre el último despliegue y pulsa **Redeploy** para que tome las variables.

## 6. Activar el bot

1. Abre `https://danolotools.vercel.app/tools/fabula-ultima-fichas/panel/index.html`.
2. Despliega **Configuración del bot**: todo debe salir en verde. Si algo falla, el propio panel dice qué.
3. Pulsa **Entrar con Discord** y autoriza.
4. En **Configuración del bot**, pulsa **Actualizar comandos de Discord**.
5. Vuelve al portal de Discord → **General Information → Interactions Endpoint URL** y pega `https://danolotools.vercel.app/api/discord/` (con la barra final). Pulsa **Save Changes**. Discord comprueba la URL en el momento: si la acepta, está todo listo.
6. En cualquier canal del servidor escribe `/ayuda`.

---

## Uso diario

- **Personajes nuevos**: los jugadores crean la ficha en el generador (no necesitan cuenta), pulsan **Descargar JSON** y te la mandan. Tú la subes con **Importar JSON** en el panel, o con `/importar archivo:… jugador:@…` en Discord.
- **Asignar**: en el panel, elige el jugador en el desplegable de cada personaje; o en Discord `/asignar personaje:… jugador:@…`. Un jugador puede llevar varios personajes; si tiene más de uno, sus comandos le piden elegir con la opción `personaje`.
- **Editar**: en el panel, **Editar** abre el personaje en el generador; al terminar pulsa **Guardar en la partida**. Si mientras tanto cambió desde Discord (PV, PM…), te pregunta antes de sobrescribir.
- **Subir de nivel**: `/px` reparte experiencia; la subida de nivel se hace en el generador (Editar → Progreso → Guardar en la partida).
- **Vista de combate** (`…/tools/fabula-ultima-fichas/visor/`): el grupo en formación y, cuando sacas enemigos, las cuatro columnas. Quien entra con una cuenta de Discord del servidor ve las fichas de los PJ y lo que se sabe de los enemigos; sin entrar, solo posiciones e imágenes. Tú (rol DJ) ves y ajustas todo.
- **Fichas completas** (`…/ficha/`): el botón «Detalles» de la vista de combate. `/ficha` enlaza directamente a cada personaje. Exige entrar con Discord.
- **Imágenes**: botón **Imagen** en el panel o en la vista de combate (solo DJ). Se ajustan solas a 124 × 124 (sin deformarlas). La de un enemigo vale para todas sus copias.
- **Enemigos**: crea o importa sus fichas en el panel (**Fichas de enemigo y PNJ**; **Cargar ejemplos** añade seis del manual básico). Sácalos al campo desde la vista de combate o con `/enemigo sacar`. El daño con afinidades, los estados, sus ataques y conjuros van con `/enemigo …` o desde su panel en la vista. `/estudiar` (jugadores) y `/revelar` (DJ) deciden qué ven los jugadores de su perfil. `/combate terminar` retira a los enemigos (los PNJ aliados se quedan).
- **Comandos**: la lista completa está en `…/tools/fabula-ultima-fichas/comandos/index.html` (o con `/ayuda`).

## Si algo falla

| Síntoma | Causa probable |
| --- | --- |
| Discord no acepta la Interactions Endpoint URL | `DISCORD_PUBLIC_KEY` mal copiada, falta la barra final de la URL o no has redesplegado tras añadir variables. |
| Los comandos no aparecen al escribir `/` | No has pulsado **Actualizar comandos de Discord**, o el bot no está en el servidor (paso 2). |
| «Este comando es solo para el DJ» siendo DJ | El rol no se llama exactamente `DJ` (o el valor de `DJ_ROLE_NAME`). Los cambios de rol tardan hasta 10 minutos en notarse. |
| Al entrar en el panel vuelve con error | El Redirect del paso 1.4 no coincide exactamente con `https://danolotools.vercel.app/api/auth/`. |
| «La base de datos no está conectada» | Falta conectar Upstash al proyecto (paso 4) o redesplegar. |
| El desplegable de jugadores sale casi vacío | Activa **Server Members Intent** (paso 1.3). Mientras tanto aparecen quienes ya han usado el bot o el panel. |
| «No tienes personaje asignado» | Asígnalo desde el panel o con `/asignar`. |
| No aparecen `/enemigo`, `/estudiar` o `/revelar` | Tras actualizar la web, pulsa **Actualizar comandos de Discord** en el panel. |
| Un jugador solo ve la formación, sin fichas | Debe entrar con la cuenta de Discord que está en el servidor de la partida. |

## Añadir comandos más adelante

1. Define el comando en `servidor/comandos.js` (nombre, opciones y textos de ayuda).
2. Escribe su función en `servidor/bot.js`, dentro de `MANEJADORES`.
3. Despliega y pulsa **Actualizar comandos de Discord** en el panel.

La página de comandos se actualiza sola a partir de la misma definición.
