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
const optEnemigo = (desc = 'PNJ en el campo', required = true) => ({ type: T.TEXTO, name: 'enemigo', description: desc, required, autocomplete: true });
const TIPOS_DANO = [['fisico', 'Físico'], ['aire', 'Aire'], ['rayo', 'Rayo'], ['oscuro', 'Oscuro'], ['tierra', 'Tierra'], ['fuego', 'Fuego'], ['hielo', 'Hielo'], ['luz', 'Luz'], ['veneno', 'Veneno']]
  .map(([value, name]) => ({ name, value }));
const ATRIBUTOS = ['DES', 'PER', 'VIG', 'VOL'].map((v) => ({ name: v, value: v }));
const optObjetivoPj = (name = 'objetivo', desc = 'Personaje atacado (compara con su defensa)') => ({ type: T.TEXTO, name, description: desc, autocomplete: true });

export const CATEGORIAS = [
  { id: 'tiradas', nombre: 'Tiradas' },
  { id: 'recursos', nombre: 'Ficha y recursos' },
  { id: 'relojes', nombre: 'Relojes' },
  { id: 'combate', nombre: 'Iniciativa y combate' },
  { id: 'enemigos', nombre: 'Enemigos y PNJ' },
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
    ayuda: 'Tira dos dados y los suma. Si eliges atributos (DES, PER, VIG, VOL) usa los dados de tu personaje, ya reducidos por sus estados alterados. Con «todos» o varios personajes separados por comas, realiza la tirada para cada uno de ellos. También puedes elegir dados sueltos (d8, d10…) para PNJ o tiradas improvisadas. Muestra el total, la tirada mayor (TM), si es crítico (dos dados iguales de 6 o más) o pifia (dos unos) y, si indicas dificultad, si la superas. Una pifia te da 1 Punto Fábula automáticamente. Debajo aparece el botón «Repetir (1 PF)».',
    ejemplos: ['/tirada atributo1:DES atributo2:PER', '/tirada atributo1:DES atributo2:PER personaje:todos', '/tirada atributo1:VIG atributo2:VIG bono:1 dificultad:10'],
    options: [
      { type: T.TEXTO, name: 'atributo1', description: 'Primer atributo o dado', required: true, choices: DADOS },
      { type: T.TEXTO, name: 'atributo2', description: 'Segundo atributo o dado', required: true, choices: DADOS },
      optBono,
      { type: T.ENTERO, name: 'dificultad', description: 'Nivel de dificultad (ND) a superar', min_value: 1, max_value: 40 },
      optPersonaje('Personaje que tira (por defecto el tuyo; o "todos")')
    ]
  },
  {
    name: 'atacar', description: 'Ataque con un arma equipada: precisión, tirada mayor y daño',
    categoria: 'tiradas', dj: false,
    ayuda: 'Usa la fórmula de precisión del arma equipada (con todos sus bonificadores) y calcula el daño: tirada mayor + daño del arma, con su tipo. Si no indicas arma, usa la primera equipada; sin armas, el golpe desarmado. Con «objetivo» atacas a un PNJ del campo: el bot dice si impacta (sin mostrar su Defensa) y le aplica el daño con sus afinidades. Si repites la tirada con un Punto Fábula, el daño anterior se deshace.',
    ejemplos: ['/atacar', '/atacar arma:Katana bono:2', '/atacar objetivo:Lobo A'],
    options: [
      { type: T.TEXTO, name: 'arma', description: 'Arma equipada', autocomplete: true },
      { type: T.TEXTO, name: 'objetivo', description: 'PNJ del campo al que atacas (aplica el daño)', autocomplete: true },
      optBono,
      optPersonaje('Personaje que ataca (por defecto, el tuyo)')
    ]
  },
  {
    name: 'conjuro', description: 'Lanza un conjuro conocido: prueba de magia, daño y coste en PM',
    categoria: 'tiradas', dj: false,
    ayuda: 'Muestra el coste en PM y el efecto. Si el conjuro es ofensivo, hace la prueba de magia (PER + VOL por defecto) y calcula el daño cuando el conjuro tiene fórmula [TM + X]. El botón «Gastar PM» descuenta el coste de tu ficha. Para conjuros con coste por objetivo, indica cuántos objetivos. Con «objetivo» lanzas un conjuro ofensivo contra un PNJ del campo: el bot dice si impacta y, si el conjuro tiene daño, se lo aplica con sus afinidades.',
    ejemplos: ['/conjuro conjuro:Ignis objetivos:3', '/conjuro conjuro:Sanación objetivos:2', '/conjuro conjuro:Fulgur atributos:VOL+VOL', '/conjuro conjuro:Ignis objetivo:Diablillo'],
    options: [
      { type: T.TEXTO, name: 'conjuro', description: 'Conjuro conocido por el personaje', required: true, autocomplete: true },
      { type: T.TEXTO, name: 'objetivo', description: 'PNJ del campo (conjuros ofensivos; aplica el daño)', autocomplete: true },
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
    ayuda: 'Muestra nivel, clases, PV, PM, PI, defensas, atributos (con estados aplicados), estados alterados, Puntos Fábula y arma equipada, con enlace a su ficha completa. Con «todos» o varios personajes separados por comas, muestra las fichas de todos los elegidos.',
    ejemplos: ['/ficha', '/ficha personaje:Nim', '/ficha personaje:todos'],
    options: [optPersonaje('Personaje a consultar (por defecto el tuyo; o "todos")')]
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
    ayuda: 'Tirada de iniciativa de DES + PER + modificador contra la dificultad (normalmente la iniciativa más alta de los enemigos). Sin personaje, tira el que tenga mejor modificador de iniciativa. Con «todos» o varios personajes separados por comas, tira la iniciativa por cada uno de ellos. Si se supera, los PJ eligen quién empieza; si no, empiezan los enemigos.',
    ejemplos: ['/iniciativa dificultad:10', '/iniciativa dificultad:10 personaje:todos', '/iniciativa dificultad:12 personaje:Aria Valen bono:2'],
    options: [
      { type: T.ENTERO, name: 'dificultad', description: 'Iniciativa a superar', required: true, min_value: 1, max_value: 40 },
      optPersonaje('Personaje que lidera la tirada (por defecto, el de mejor iniciativa; o "todos")'),
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
        ayuda: 'Cada jugador marca su turno al terminarlo. El DJ puede marcar el de cualquier personaje o el de un enemigo.',
        ejemplos: ['/combate turno', '/combate turno enemigo:Lobo A'],
        options: [
          optPersonaje('Personaje que ha actuado (por defecto, el tuyo)'),
          { type: T.TEXTO, name: 'enemigo', description: 'Enemigo que ha actuado (solo DJ)', max_length: 60, autocomplete: true }
        ] },
      { type: T.SUB, name: 'ronda', description: 'Pasa a la siguiente ronda (solo DJ)', dj: true,
        ayuda: 'Reinicia los turnos y suma una ronda.', ejemplos: ['/combate ronda'], options: [] },
      { type: T.SUB, name: 'ver', description: 'Muestra la ronda y quién falta por actuar', dj: false,
        ayuda: 'Estado del conflicto.', ejemplos: ['/combate ver'], options: [] },
      { type: T.SUB, name: 'terminar', description: 'Cierra el conflicto y retira a los enemigos (solo DJ)', dj: true,
        ayuda: 'Termina el conflicto, retira del campo a los enemigos y elimina los estados alterados de los personajes. Los PNJ aliados se quedan con el grupo.', ejemplos: ['/combate terminar'], options: [] }
    ]
  },

  // ------------------------------------------------------------------ enemigos
  {
    name: 'enemigo', description: 'PNJ en combate: sacar, daño, ataques, conjuros… (solo DJ)',
    categoria: 'enemigos',
    options: [
      { type: T.SUB, name: 'sacar', description: 'Coloca PNJ de una ficha en el campo', dj: true,
        ayuda: 'Pone en el campo una o varias copias de una ficha de PNJ, cada una con sus propios PV, PM y estados. Con varias copias se llaman «Lobo A», «Lobo B»… Con lado «aliado» se colocan junto al grupo.',
        ejemplos: ['/enemigo sacar plantilla:Aullador gris cantidad:3', '/enemigo sacar plantilla:Mercenario fila:retaguardia', '/enemigo sacar plantilla:Gárgola lado:aliado nombre:Piedrecita'],
        options: [
          { type: T.TEXTO, name: 'plantilla', description: 'Ficha de PNJ', required: true, autocomplete: true },
          { type: T.ENTERO, name: 'cantidad', description: 'Cuántos (por defecto 1)', min_value: 1, max_value: 12 },
          { type: T.TEXTO, name: 'fila', description: 'Fila (por defecto vanguardia)', choices: [{ name: 'Vanguardia', value: 'vanguardia' }, { name: 'Retaguardia', value: 'retaguardia' }] },
          { type: T.TEXTO, name: 'lado', description: 'Bando (por defecto enemigo)', choices: [{ name: 'Enemigo', value: 'enemigo' }, { name: 'Aliado', value: 'aliado' }] },
          { type: T.TEXTO, name: 'nombre', description: 'Nombre propio (por defecto el de la ficha)', max_length: 60 }
        ] },
      { type: T.SUB, name: 'retirar', description: 'Quita un PNJ del campo (o todos los enemigos)', dj: true,
        ayuda: 'Retira un PNJ del campo (huye, muere…). Con «todos» retira a todos los enemigos.',
        ejemplos: ['/enemigo retirar enemigo:Lobo B', '/enemigo retirar todos:True'],
        options: [optEnemigo('PNJ a retirar', false), { type: T.BOOL, name: 'todos', description: 'Retirar a todos los enemigos' }] },
      { type: T.SUB, name: 'daño', description: 'Daño a un PNJ aplicando sus afinidades', dj: true,
        ayuda: 'Resta PV aplicando sus afinidades: vulnerable ×2, resistente ½, inmune 0, absorbe = cura. Los jugadores ven el daño, pero no su vida máxima. Si cae a 0 se anuncia; si entra en Crisis, solo lo ves tú con el botón «Estado (DJ)».',
        ejemplos: ['/enemigo daño enemigo:Lobo A cantidad:12 tipo:Fuego', '/enemigo daño enemigo:Diablillo cantidad:30 tipo:Hielo ignora_resistencia:True'],
        options: [
          optEnemigo(),
          { type: T.ENTERO, name: 'cantidad', description: 'Daño antes de afinidades', required: true, min_value: 0, max_value: 999 },
          { type: T.TEXTO, name: 'tipo', description: 'Tipo de daño', required: true, choices: TIPOS_DANO },
          { type: T.BOOL, name: 'ignora_resistencia', description: 'El daño ignora Resistencias' }
        ] },
      { type: T.SUB, name: 'pv', description: 'Consulta o ajusta los PV de un PNJ (solo lo ves tú)', dj: true,
        ayuda: 'Igual que /pv, sin afinidades: +N cura, -N resta, N fija, max restablece. La respuesta solo la ves tú.',
        ejemplos: ['/enemigo pv enemigo:Lobo A', '/enemigo pv enemigo:Lobo A valor:+10'],
        options: [optEnemigo(), { type: T.TEXTO, name: 'valor', description: '+N, -N, N o max', max_length: 10 }] },
      { type: T.SUB, name: 'pm', description: 'Consulta o ajusta los PM de un PNJ (solo lo ves tú)', dj: true,
        ayuda: 'Como /enemigo pv, para los Puntos de Mente.',
        ejemplos: ['/enemigo pm enemigo:Diablillo valor:-10'],
        options: [optEnemigo(), { type: T.TEXTO, name: 'valor', description: '+N, -N, N o max', max_length: 10 }] },
      { type: T.SUB, name: 'estado', description: 'Añade o quita estados alterados a un PNJ', dj: true,
        ayuda: 'Los estados reducen sus dados en las tiradas del bot, igual que en los PJ. Los jugadores los ven en la vista de combate. Si su ficha lo hace inmune a un estado, el bot no se lo pone y lo indica.',
        ejemplos: ['/enemigo estado enemigo:Lobo A accion:añadir estado:Lento'],
        options: [
          optEnemigo(),
          { type: T.TEXTO, name: 'accion', description: 'Qué hacer', required: true,
            choices: [{ name: 'añadir', value: 'anadir' }, { name: 'quitar', value: 'quitar' }, { name: 'limpiar todos', value: 'limpiar' }] },
          { type: T.TEXTO, name: 'estado', description: 'Estado alterado', choices: ESTADOS }
        ] },
      { type: T.SUB, name: 'atacar', description: 'Ataque básico de un PNJ', dj: true,
        ayuda: 'Tira la precisión del ataque con los dados del PNJ (ya reducidos por sus estados) y su bonificador. Con «objetivo» la compara con la Defensa (o la Defensa Mágica) del personaje y ofrece un botón para aplicarle el daño.',
        ejemplos: ['/enemigo atacar enemigo:Lobo A objetivo:Nim', '/enemigo atacar enemigo:Mercenario ataque:Pistola objetivo:Lio Arden'],
        options: [
          optEnemigo(),
          { type: T.TEXTO, name: 'ataque', description: 'Ataque (por defecto, el primero)', autocomplete: true },
          optObjetivoPj(),
          optBono
        ] },
      { type: T.SUB, name: 'conjuro', description: 'Conjuro de un PNJ', dj: true,
        ayuda: 'Descuenta los PM del PNJ y muestra el efecto. Si es ofensivo, hace la prueba de magia contra la Defensa Mágica de cada objetivo (hasta tres) y ofrece botones para aplicar el daño.',
        ejemplos: ['/enemigo conjuro enemigo:Gárgola conjuro:Andanada de rocas objetivo:Aria Valen'],
        options: [
          optEnemigo(),
          { type: T.TEXTO, name: 'conjuro', description: 'Conjuro del PNJ', required: true, autocomplete: true },
          optObjetivoPj('objetivo', 'Primer objetivo'),
          optObjetivoPj('objetivo2', 'Segundo objetivo'),
          optObjetivoPj('objetivo3', 'Tercer objetivo'),
          optBono
        ] },
      { type: T.SUB, name: 'tirada', description: 'Tirada libre de dos atributos de un PNJ', dj: true,
        ayuda: 'Como /tirada, con los dados del PNJ (reducidos por sus estados).',
        ejemplos: ['/enemigo tirada enemigo:Lobo A atributo1:VIG atributo2:VIG dificultad:10'],
        options: [
          optEnemigo(),
          { type: T.TEXTO, name: 'atributo1', description: 'Primer atributo', required: true, choices: ATRIBUTOS },
          { type: T.TEXTO, name: 'atributo2', description: 'Segundo atributo', required: true, choices: ATRIBUTOS },
          optBono,
          { type: T.ENTERO, name: 'dificultad', description: 'Dificultad a superar', min_value: 1, max_value: 40 }
        ] },
      { type: T.SUB, name: 'pu', description: 'Consulta o ajusta los Puntos Última de un villano (solo lo ves tú)', dj: true,
        ayuda: 'Los villanos empiezan con los Puntos Última de su ficha (menor 5, mayor 10, supremo 15). -1 gasta uno; +N los suma; un número los fija.',
        ejemplos: ['/enemigo pu enemigo:Ángela', '/enemigo pu enemigo:Ángela valor:-1'],
        options: [optEnemigo(), { type: T.TEXTO, name: 'valor', description: '+N, -N o N', max_length: 10 }] },
      { type: T.SUB, name: 'fase', description: 'Pasa a un jefe a su siguiente fase', dj: true,
        ayuda: 'Para jefes con varias fases: cambia el PNJ a la ficha de su fase siguiente, con los PV y PM al máximo y sin estados. Cuando un jefe con otra fase llega a 0 PV, el bot no anuncia que cae.',
        ejemplos: ['/enemigo fase enemigo:Ángela'],
        options: [optEnemigo()] },
      { type: T.SUB, name: 'ver', description: 'Ficha completa de un PNJ (solo la ves tú)', dj: true,
        ayuda: 'Muestra su ficha completa y su estado actual en un mensaje que solo ves tú.',
        ejemplos: ['/enemigo ver enemigo:Lobo A'],
        options: [optEnemigo()] }
    ]
  },
  {
    name: 'estudiar', description: 'Acción de Estudio: PER + PER para descubrir el perfil de un PNJ',
    categoria: 'enemigos', dj: false,
    ayuda: 'Tira PER + PER del personaje y revela a todo el grupo lo que corresponde al resultado: 10+ rango, especie, PV y PM; 13+ además rasgos, atributos, defensas y afinidades; 16+ además ataques, conjuros, otras acciones y reglas. Lo revelado aparece en el panel del PNJ en la vista de combate y vale para todos los PNJ de esa misma ficha. Recuerda: no se puede repetir el Estudio contra el mismo tipo de criatura en la misma sesión.',
    ejemplos: ['/estudiar enemigo:Lobo A', '/estudiar enemigo:Diablillo personaje:Lio Arden bono:2'],
    options: [optEnemigo('PNJ a estudiar'), optPersonaje('Personaje que estudia (por defecto, el tuyo)'), optBono]
  },
  {
    name: 'revelar', description: 'Revela a los jugadores el perfil de un PNJ (solo DJ)',
    categoria: 'enemigos', dj: true,
    ayuda: 'Fija a mano el nivel de información revelado de una ficha de PNJ (como si se hubiera hecho un Estudio). Con «nada» se vuelve a ocultar.',
    ejemplos: ['/revelar enemigo:Lobo A nivel:13+'],
    options: [
      optEnemigo('PNJ (se revela para todos los de su ficha)'),
      { type: T.ENTERO, name: 'nivel', description: 'Nivel revelado', required: true,
        choices: [{ name: 'Nada', value: 0 }, { name: '10+ · rango, especie, PV y PM', value: 10 }, { name: '13+ · rasgos, atributos, defensas, afinidades', value: 13 }, { name: '16+ · todo', value: 16 }] }
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
    ayuda: 'Liga el personaje a un jugador de Discord: a partir de ahí, sus comandos usan ese personaje y puede moverlo en la vista de combate. Un jugador puede llevar varios personajes; en ese caso sus comandos le piden elegir con la opción «personaje». Sin jugador, el personaje queda libre.',
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
    ayuda: 'Suma PX a un personaje, a varios separados por comas o, sin personaje o con «todos», a todos los que tienen jugador asignado. Avisa de quién puede subir de nivel (10 PX). La subida se hace en el generador.',
    ejemplos: ['/px cantidad:7', '/px cantidad:5 personaje:todos', '/px cantidad:2 personaje:Nim'],
    options: [
      { type: T.ENTERO, name: 'cantidad', description: 'PX (puede ser negativo)', required: true, min_value: -100, max_value: 100 },
      optPersonaje('Personaje (vacío o "todos" para todo el grupo)')
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
