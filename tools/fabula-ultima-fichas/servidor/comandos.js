// ---------------------------------------------------------------------------
// Definición de los comandos del bot de Discord.
// Fuente única: la usan el servidor (para registrarlos en Discord) y la web
// de consulta (comandos/). No importes nada de Node aquí.
//
// Para añadir un comando:
//   1. Añade su definición a COMANDOS (formato de Discord + campos de ayuda).
//   2. Añade su función en servidor/bot.js (objeto MANEJADORES).
//   3. Despliega y pulsa «Actualizar comandos» en el panel del DJ.
// ---------------------------------------------------------------------------

// Tipos de opción de Discord
export const T = { SUB: 1, TEXTO: 3, ENTERO: 4, BOOL: 5, USUARIO: 6, ADJUNTO: 11 };

const DADOS = ['DES', 'PER', 'VIG', 'VOL', 'd6', 'd8', 'd10', 'd12', 'd20'].map((v) => ({ name: v, value: v }));
const ESTADOS = [
  ['confundido', 'Confundido'], ['debil', 'Débil'], ['enfurecido', 'Enfurecido'],
  ['envenenado', 'Envenenado'], ['estremecido', 'Estremecido'], ['lento', 'Lento']
].map(([value, name]) => ({ name, value }));

const optPersonaje = (desc = 'Personaje (por defecto, el tuyo). Solo el DJ puede elegir otro para modificarlo.') =>
  ({ type: T.TEXTO, name: 'personaje', description: desc, autocomplete: true });
const optBono = { type: T.ENTERO, name: 'bono', description: 'Bonificador o penalizador a la tirada', min_value: -20, max_value: 20 };

export const CATEGORIAS = [
  { id: 'tiradas', nombre: 'Tiradas' },
  { id: 'recursos', nombre: 'Ficha y recursos' },
  { id: 'relojes', nombre: 'Relojes' },
  { id: 'combate', nombre: 'Iniciativa y combate' },
  { id: 'gestion', nombre: 'Gestión de personajes' },
  { id: 'otros', nombre: 'Otros' }
];

/**
 * Campos de ayuda (no se envían a Discord):
 *   categoria, dj (true = solo DJ), uso, ayuda, ejemplos[]
 * En subcomandos, cada subcomando lleva su propio dj / ayuda / ejemplos.
 */
export const COMANDOS = [
  // ------------------------------------------------------------------ tiradas
  {
    name: 'tirada', description: 'Tirada de dos atributos (o dados) con total, tirada mayor, crítico y pifia',
    categoria: 'tiradas', dj: false,
    ayuda: 'Tira dos dados y los suma. Si eliges atributos (DES, PER, VIG, VOL) usa los dados de tu personaje, ya reducidos por sus estados alterados. También puedes elegir dados sueltos (d8, d10…) para PNJ o tiradas improvisadas. Muestra el total, la tirada mayor (TM), si es crítico (dos dados iguales de 6 o más) o pifia (dos unos) y, si indicas dificultad, si la superas. Una pifia te da 1 Punto Fábula automáticamente. Debajo aparece el botón «Repetir (1 PF)».',
    ejemplos: ['/tirada atributo1:DES atributo2:PER', '/tirada atributo1:VIG atributo2:VIG bono:1 dificultad:10', '/tirada atributo1:d10 atributo2:d8'],
    options: [
      { type: T.TEXTO, name: 'atributo1', description: 'Primer atributo o dado', required: true, choices: DADOS },
      { type: T.TEXTO, name: 'atributo2', description: 'Segundo atributo o dado', required: true, choices: DADOS },
      optBono,
      { type: T.ENTERO, name: 'dificultad', description: 'Nivel de dificultad (ND) a superar', min_value: 1, max_value: 40 },
      optPersonaje('Personaje que tira (por defecto, el tuyo)')
    ]
  },
  {
    name: 'atacar', description: 'Ataque con un arma equipada: precisión, tirada mayor y daño',
    categoria: 'tiradas', dj: false,
    ayuda: 'Usa la fórmula de precisión del arma equipada (con todos sus bonificadores) y calcula el daño: tirada mayor + daño del arma, con su tipo. Si no indicas arma, usa la primera equipada; sin armas, el golpe desarmado.',
    ejemplos: ['/atacar', '/atacar arma:Katana bono:2'],
    options: [
      { type: T.TEXTO, name: 'arma', description: 'Arma equipada', autocomplete: true },
      optBono,
      optPersonaje('Personaje que ataca (por defecto, el tuyo)')
    ]
  },
  {
    name: 'conjuro', description: 'Lanza un conjuro conocido: prueba de magia, daño y coste en PM',
    categoria: 'tiradas', dj: false,
    ayuda: 'Muestra el coste en PM y el efecto. Si el conjuro es ofensivo, hace la prueba de magia (PER + VOL por defecto) y calcula el daño cuando el conjuro tiene fórmula [TM + X]. El botón «Gastar PM» descuenta el coste de tu ficha. Para conjuros con coste por objetivo, indica cuántos objetivos.',
    ejemplos: ['/conjuro conjuro:Ignis objetivos:3', '/conjuro conjuro:Sanación objetivos:2', '/conjuro conjuro:Fulgur atributos:VOL+VOL'],
    options: [
      { type: T.TEXTO, name: 'conjuro', description: 'Conjuro conocido por el personaje', required: true, autocomplete: true },
      { type: T.ENTERO, name: 'objetivos', description: 'Número de objetivos (para costes «× obj.»)', min_value: 1, max_value: 10 },
      optBono,
      { type: T.TEXTO, name: 'atributos', description: 'Atributos de la prueba de magia (por defecto PER + VOL)',
        choices: ['PER+VOL', 'VOL+VOL', 'VIG+VOL', 'PER+PER'].map((v) => ({ name: v.replace('+', ' + '), value: v })) },
      optPersonaje('Personaje que lanza (por defecto, el tuyo)')
    ]
  },
  {
    name: 'dados', description: 'Tirada libre de dados, por ejemplo 2d6+3',
    categoria: 'tiradas', dj: false,
    ayuda: 'Para cualquier otra tirada. Admite varios grupos de dados y modificadores.',
    ejemplos: ['/dados expresion:d20', '/dados expresion:2d6+3', '/dados expresion:1d8+1d10-2'],
    options: [{ type: T.TEXTO, name: 'expresion', description: 'Por ejemplo 2d6+3 o 1d8+1d10', required: true, max_length: 60 }]
  },

  // ------------------------------------------------------------------ ficha y recursos
  {
    name: 'ficha', description: 'Resumen de la ficha de un personaje y enlace a la ficha completa',
    categoria: 'recursos', dj: false,
    ayuda: 'Muestra nivel, clases, PV, PM, PI, defensas, atributos (con estados aplicados), estados alterados, Puntos Fábula y arma equipada, con enlace al visor.',
    ejemplos: ['/ficha', '/ficha personaje:Nim'],
    options: [optPersonaje('Personaje a consultar (por defecto, el tuyo)')]
  },
  ...['pv', 'pm', 'pi'].map((k) => ({
    name: k,
    description: { pv: 'Consulta o modifica los Puntos de Vida', pm: 'Consulta o modifica los Puntos de Mente', pi: 'Consulta o modifica los Puntos de Inventario' }[k],
    categoria: 'recursos', dj: false,
    ayuda: `Sin valor, muestra los ${k.toUpperCase()} actuales. Con +N o -N los suma o resta; con un número solo, los fija; «max» los restablece al máximo.${k === 'pv' ? ' Avisa al entrar o salir de Crisis y al caer a 0.' : ''}`,
    ejemplos: [`/${k}`, `/${k} valor:-12`, `/${k} valor:+10`, `/${k} valor:max`],
    options: [
      { type: T.TEXTO, name: 'valor', description: '+N suma, -N resta, N fija, max restablece', max_length: 10 },
      optPersonaje()
    ]
  })),
  {
    name: 'pf', description: 'Consulta o modifica los Puntos Fábula',
    categoria: 'recursos', dj: false,
    ayuda: 'Sin valor, muestra los Puntos Fábula. Con +N o -N los suma o resta; con un número solo, los fija.',
    ejemplos: ['/pf', '/pf valor:-1', '/pf valor:+2'],
    options: [{ type: T.TEXTO, name: 'valor', description: '+N suma, -N resta, N fija', max_length: 10 }, optPersonaje()]
  },
  {
    name: 'estado', description: 'Añade o quita estados alterados',
    categoria: 'recursos', dj: false,
    ayuda: 'Los estados reducen los dados de atributo en las tiradas del bot: lento (DES), confundido (PER), débil (VIG), estremecido (VOL), enfurecido (DES y PER), envenenado (VIG y VOL). Nunca bajan de d6.',
    ejemplos: ['/estado accion:añadir estado:Lento', '/estado accion:quitar estado:Lento', '/estado accion:limpiar'],
    options: [
      { type: T.TEXTO, name: 'accion', description: 'Qué hacer', required: true,
        choices: [{ name: 'añadir', value: 'anadir' }, { name: 'quitar', value: 'quitar' }, { name: 'limpiar todos', value: 'limpiar' }] },
      { type: T.TEXTO, name: 'estado', description: 'Estado alterado', choices: ESTADOS },
      optPersonaje()
    ]
  },
  {
    name: 'descanso', description: 'Descanso: recupera PV y PM al máximo y quita los estados',
    categoria: 'recursos', dj: false,
    ayuda: 'Restablece PV y PM al máximo y elimina los estados alterados. Los PI no se recuperan. El DJ puede hacer descansar a todo el grupo.',
    ejemplos: ['/descanso', '/descanso todos:True'],
    options: [
      optPersonaje(),
      { type: T.BOOL, name: 'todos', description: 'Todo el grupo (solo DJ)' }
    ]
  },
  {
    name: 'grupo', description: 'Estado de todo el grupo: PV, PM, PI, defensas y estados',
    categoria: 'recursos', dj: false,
    ayuda: 'Resumen de todos los personajes de la partida en un mensaje.',
    ejemplos: ['/grupo'],
    options: []
  },

  // ------------------------------------------------------------------ relojes
  {
    name: 'reloj', description: 'Relojes de progreso',
    categoria: 'relojes',
    options: [
      { type: T.SUB, name: 'crear', description: 'Crea un reloj (solo DJ)', dj: true,
        ayuda: 'Crea un reloj con el número de secciones indicado (normalmente 4, 6, 8 o 10).',
        ejemplos: ['/reloj crear nombre:Huida del castillo secciones:6'],
        options: [
          { type: T.TEXTO, name: 'nombre', description: 'Nombre del reloj', required: true, max_length: 60 },
          { type: T.ENTERO, name: 'secciones', description: 'Número de secciones', required: true, min_value: 2, max_value: 20 }
        ] },
      { type: T.SUB, name: 'avanzar', description: 'Rellena secciones de un reloj', dj: false,
        ayuda: 'Rellena una o más secciones. Avisa cuando el reloj se completa.',
        ejemplos: ['/reloj avanzar nombre:Huida del castillo', '/reloj avanzar nombre:Ritual cantidad:2'],
        options: [
          { type: T.TEXTO, name: 'nombre', description: 'Reloj', required: true, autocomplete: true },
          { type: T.ENTERO, name: 'cantidad', description: 'Secciones (por defecto 1)', min_value: 1, max_value: 20 }
        ] },
      { type: T.SUB, name: 'retroceder', description: 'Vacía secciones de un reloj', dj: false,
        ayuda: 'Vacía una o más secciones.',
        ejemplos: ['/reloj retroceder nombre:Alarma'],
        options: [
          { type: T.TEXTO, name: 'nombre', description: 'Reloj', required: true, autocomplete: true },
          { type: T.ENTERO, name: 'cantidad', description: 'Secciones (por defecto 1)', min_value: 1, max_value: 20 }
        ] },
      { type: T.SUB, name: 'ver', description: 'Muestra los relojes activos', dj: false,
        ayuda: 'Sin nombre muestra todos los relojes.',
        ejemplos: ['/reloj ver'],
        options: [{ type: T.TEXTO, name: 'nombre', description: 'Reloj concreto', autocomplete: true }] },
      { type: T.SUB, name: 'borrar', description: 'Elimina un reloj (solo DJ)', dj: true,
        ayuda: 'Elimina el reloj.',
        ejemplos: ['/reloj borrar nombre:Alarma'],
        options: [{ type: T.TEXTO, name: 'nombre', description: 'Reloj', required: true, autocomplete: true }] }
    ]
  },

  // ------------------------------------------------------------------ combate
  {
    name: 'iniciativa', description: 'Tirada de iniciativa del grupo (solo DJ)',
    categoria: 'combate', dj: true,
    ayuda: 'Tirada de grupo de DES + PER + modificador de iniciativa contra la dificultad que indiques (normalmente la iniciativa más alta de los enemigos). Si no eliges personaje, tira el que tenga mejor modificador de iniciativa. Si se supera, los PJ eligen quién empieza; si no, empiezan los enemigos.',
    ejemplos: ['/iniciativa dificultad:10', '/iniciativa dificultad:12 personaje:Aria Valen bono:2'],
    options: [
      { type: T.ENTERO, name: 'dificultad', description: 'Iniciativa a superar', required: true, min_value: 1, max_value: 40 },
      optPersonaje('Personaje que lidera la tirada (por defecto, el de mejor iniciativa)'),
      { type: T.ENTERO, name: 'bono', description: 'Bonificador (por ejemplo, +1 por cada aliado que apoye)', min_value: -10, max_value: 20 }
    ]
  },
  {
    name: 'combate', description: 'Control de rondas y turnos del conflicto',
    categoria: 'combate',
    options: [
      { type: T.SUB, name: 'iniciar', description: 'Empieza un conflicto (solo DJ)', dj: true,
        ayuda: 'Abre el conflicto en la ronda 1 indicando qué bando empieza. Los turnos se alternan entre bandos.',
        ejemplos: ['/combate iniciar empieza:Jugadores'],
        options: [{ type: T.TEXTO, name: 'empieza', description: 'Bando que empieza cada ronda', required: true,
          choices: [{ name: 'Jugadores', value: 'pj' }, { name: 'Enemigos', value: 'enemigos' }] }] },
      { type: T.SUB, name: 'turno', description: 'Marca un turno como hecho', dj: false,
        ayuda: 'Cada jugador marca su turno al terminarlo. El DJ puede marcar el de cualquier personaje o el de un enemigo escribiendo su nombre.',
        ejemplos: ['/combate turno', '/combate turno enemigo:Dragón de llamas'],
        options: [
          optPersonaje('Personaje que ha actuado (por defecto, el tuyo)'),
          { type: T.TEXTO, name: 'enemigo', description: 'Nombre del enemigo que ha actuado (solo DJ)', max_length: 60 }
        ] },
      { type: T.SUB, name: 'ronda', description: 'Pasa a la siguiente ronda (solo DJ)', dj: true,
        ayuda: 'Reinicia los turnos y suma una ronda.', ejemplos: ['/combate ronda'], options: [] },
      { type: T.SUB, name: 'ver', description: 'Muestra la ronda y quién falta por actuar', dj: false,
        ayuda: 'Estado del conflicto.', ejemplos: ['/combate ver'], options: [] },
      { type: T.SUB, name: 'terminar', description: 'Cierra el conflicto (solo DJ)', dj: true,
        ayuda: 'Termina el conflicto.', ejemplos: ['/combate terminar'], options: [] }
    ]
  },

  // ------------------------------------------------------------------ gestión
  {
    name: 'importar', description: 'Importa un personaje desde su archivo JSON (solo DJ)',
    categoria: 'gestion', dj: true,
    ayuda: 'Adjunta el JSON exportado desde el generador. Si el personaje ya existía, se actualiza. Opcionalmente, asígnalo a un jugador en el mismo paso.',
    ejemplos: ['/importar archivo:(adjunto) jugador:@Marta'],
    options: [
      { type: T.ADJUNTO, name: 'archivo', description: 'Archivo .json del personaje', required: true },
      { type: T.USUARIO, name: 'jugador', description: 'Jugador al que asignarlo' }
    ]
  },
  {
    name: 'exportar', description: 'Enlace para descargar el JSON de un personaje',
    categoria: 'gestion', dj: false,
    ayuda: 'Devuelve un enlace de descarga del JSON del personaje, que se puede abrir en el generador.',
    ejemplos: ['/exportar', '/exportar personaje:Lio Arden'],
    options: [optPersonaje('Personaje a exportar (por defecto, el tuyo)')]
  },
  {
    name: 'asignar', description: 'Asigna un personaje a un jugador (solo DJ)',
    categoria: 'gestion', dj: true,
    ayuda: 'Liga el personaje a un jugador de Discord: a partir de ahí, sus comandos usan ese personaje. Cada jugador tiene un único personaje asignado; asignarle otro libera el anterior. Sin jugador, el personaje queda libre.',
    ejemplos: ['/asignar personaje:Nim jugador:@Sergio', '/asignar personaje:Nim'],
    options: [
      { type: T.TEXTO, name: 'personaje', description: 'Personaje', required: true, autocomplete: true },
      { type: T.USUARIO, name: 'jugador', description: 'Jugador (vacío para liberar el personaje)' }
    ]
  },
  {
    name: 'personajes', description: 'Lista de personajes de la partida y sus jugadores',
    categoria: 'gestion', dj: false,
    ayuda: 'Muestra todos los personajes guardados, su nivel y el jugador asignado.',
    ejemplos: ['/personajes'],
    options: []
  },
  {
    name: 'px', description: 'Da puntos de experiencia (solo DJ)',
    categoria: 'gestion', dj: true,
    ayuda: 'Suma PX a un personaje o, sin personaje, a todos los que tienen jugador asignado. Avisa de quién puede subir de nivel (10 PX). La subida se hace en el generador.',
    ejemplos: ['/px cantidad:7', '/px cantidad:2 personaje:Nim'],
    options: [
      { type: T.ENTERO, name: 'cantidad', description: 'PX (puede ser negativo)', required: true, min_value: -100, max_value: 100 },
      optPersonaje('Personaje (vacío para todo el grupo)')
    ]
  },
  {
    name: 'zenit', description: 'Da o quita zenit (solo DJ)',
    categoria: 'gestion', dj: true,
    ayuda: 'Suma o resta zenit a un personaje o, sin personaje, a cada personaje con jugador asignado.',
    ejemplos: ['/zenit cantidad:150', '/zenit cantidad:-50 personaje:Aria Valen'],
    options: [
      { type: T.ENTERO, name: 'cantidad', description: 'Zenit (puede ser negativo)', required: true, min_value: -100000, max_value: 100000 },
      optPersonaje('Personaje (vacío para todo el grupo)')
    ]
  },

  // ------------------------------------------------------------------ otros
  {
    name: 'ayuda', description: 'Enlace a la lista de comandos',
    categoria: 'otros', dj: false,
    ayuda: 'Devuelve el enlace a esta página.',
    ejemplos: ['/ayuda'],
    options: []
  }
];

const CAMPOS_AYUDA = ['categoria', 'dj', 'uso', 'ayuda', 'ejemplos'];
function limpiar(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (CAMPOS_AYUDA.includes(k)) continue;
    out[k] = k === 'options' ? v.map(limpiar) : v;
  }
  return out;
}

/** Definiciones listas para PUT /applications/{app}/guilds/{guild}/commands */
export function paraDiscord() {
  return COMANDOS.map((c) => ({ ...limpiar(c), type: 1, contexts: [0], integration_types: [0] }));
}

/** ¿Es un comando (o subcomando) exclusivo del DJ? */
export function esSoloDj(nombre, sub) {
  const c = COMANDOS.find((x) => x.name === nombre);
  if (!c) return false;
  if (sub) { const s = (c.options || []).find((o) => o.type === T.SUB && o.name === sub); return !!(s && s.dj); }
  return !!c.dj;
}
