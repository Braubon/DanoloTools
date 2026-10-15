# Clases de Tecnofantasía: Ésper, Mutante y Piloto {#clases-tecno-fantasia}

Este capítulo presenta de forma íntegra las tres clases exclusivas de tecnofantasía: el **Ésper**, el **Mutante** y el **Piloto**, junto con sus respectivos subsistemas de Dones Psíquicos, Terioformas y Módulos de Vehículo Personal.

---

## Ésper (*Esper*) {#clase-esper}
*Usuario de disciplinas mentales conectado a la Red de Almas para alterar la materia y la conciencia ajena.*
- **Beneficios gratuitos:** Aumenta tus Puntos de Mente máximos en +5 de forma permanente.
- **Competencias:** Ninguna adicional.

### Habilidades del Ésper
#### Enfoque cognitivo (*Cognitive Focus*) — SL máx. 5 {#hab-enfoque-cognitivo}
- **Activación / coste:** Inicio de tu turno en conflicto / Gratuito.
- **Efecto:** Puedes designar como tu **foco** (*focus*) a un aliado capaz de escucharte o a un enemigo visible que sufra al menos uno de los siguientes estados: aturdido (*dazed*), enfurecido (*enraged*) o sacudido (*shaken*). Dicha criatura es tu foco hasta el inicio de tu próximo turno. Obtienes un bonificador igual a [SL] a las tiradas para examinar a tu foco, así como a tus Tiradas de Precisión y Tiradas Mágicas ofensivas (r) que lo incluyan entre sus objetivos. Cuando hagas que tu foco recupere PV o PM, recupera `[SL × 2]` PV o PM adicionales, respectivamente.

#### Hipercognición (*Hypercognition*) — SL máx. 5 {#hab-hipercognicion}
- **Activación / coste:** Permanente.
- **Efecto:** El coste total en PM de tus conjuros y versos que incluyan a tu foco entre sus objetivos se reduce en [SL], o en `[SL × 2]` si tu foco es el único objetivo (hasta un coste mínimo de 0 PM).

#### Navegante (*Navigator*) — SL máx. 1 {#hab-navegante}
- **Activación / coste:** Permanente.
- **Efecto:** Puedes comunicarte telepáticamente con cualquier aliado consciente situado a 1 día de viaje o menos de ti; os escucháis mutuamente a efectos de activación de Habilidades y efectos. Obtienes la capacidad de realizar Rituales de la disciplina Ritualismo. Además, puedes emplear Ritualismo para trasladar entidades dentro y fuera de la Red de Almas, y para rastrear información y entidades dentro de dicha red.

#### Dones psíquicos (*Psychic Gifts*) — SL máx. 5 {#hab-dones-psiquicos}
- **Activación / coste:** Especial (ver reglas de dones).
- **Efecto:** Cada vez que adquieres esta habilidad, aprendes un don psíquico de la tabla inferior y comienzas un Reloj de Ondas Cerebrales.

#### Psicocinesis (*Psychokinesis*) — SL máx. 1 {#hab-psicocinesis}
- **Activación / coste:** Al realizar una Tirada de Precisión / Gratuito.
- **Efecto:** Puedes reemplazar uno de los dados de atributo de tu Tirada de Precisión por Voluntad (por ejemplo, 【DES + VOL】 con un arco corto). Además, tus ataques cuerpo a cuerpo con armas de las categorías Arcana o Espada pueden alcanzar a criaturas voladoras.

---

### Subsistema de Dones Psíquicos y Reloj de Ondas Cerebrales {#dones-psiquicos}

#### El Reloj de Ondas Cerebrales (*Brainwave Clock*)
- Posee **4 secciones** y comienza vacío al inicio de cada escena.
- Tras resolver el efecto de un don, **llenas 1 sección** del reloj (se llena tras calcular y aplicar el efecto).
- Las secciones solo pueden llenarse mediante el uso de dones y solo pueden vaciarse mediante la Habilidad Heroica *Descarga de ondas cerebrales* (*Brainwave Discharge*) o efectos que interactúen explícitamente con este reloj.
- Puedes continuar usando dones incluso si el reloj está completamente lleno.

#### Activación de dones
- Cada don se activa ante un **evento específico**.
- Al desencadenarse el evento, puedes pagar una cantidad de PM igual a:
  $$\text{Coste en PM} = \text{secciones llenas del reloj} \times 5 \quad (\text{mínimo } 5 \text{ PM})$$
- Solo puedes emplear un único don por evento.
- Si un don genera recuperación de PV o PM, o causa pérdida de PM, las cantidades se incrementan en **+10** si eres de nivel 20+, o en **+20** si eres de nivel 40+.

#### Tabla de dones psíquicos {#tabla-dones-psiquicos}

| Don psíquico | Evento desencadenante | Efecto completo |
| :--- | :--- | :--- |
| **Atmocinesis** (*Atmokinesis*) | Al infligir daño | Ese daño se convierte en **aire** o **rayo**, y su fuente causa daño adicional igual a `【2 + secciones llenas del reloj】`. |
| **Clarividencia** (*Clairvoyance*) | Cuando un PNJ pasa a ser tu foco o cuando creas un Vínculo hacia él | Formula una pregunta directa al DJ sobre ese PNJ, que debe responder con veracidad. Describe qué sensación te reveló el dato. Solo utilizable una vez por cada PNJ. |
| **Gravitocinesis** (*Gravitokinesis*) | Al infligir daño | Ese daño se convierte en **tierra** o **físico**, y su fuente causa daño adicional igual a `【2 + secciones llenas del reloj】`. Si la fuente inflige daño a una o más criaturas voladoras, se ven forzadas a aterrizar de inmediato. |
| **Transferencia vital** (*Life Transference*) | Al hacer que uno o más enemigos pierdan PV | Elígete a ti mismo o a un aliado que sea tu foco: si la criatura elegida se halla en Crisis, recupera una cantidad de PV igual a `【5 + (secciones llenas del reloj × 5)】`. |
| **Fotocinesis** (*Photokinesis*) | Al infligir daño | Ese daño se convierte en **oscuridad** o **luz**, y su fuente causa daño adicional igual a `【2 + secciones llenas del reloj】`. |
| **Retroceso psíquico** (*Psychic Backlash*) | Tras tener éxito un enemigo en una Tirada Enfrentada contra ti o causarte pérdida de PV | Dicho enemigo pierde una cantidad de PM igual a `【5 + (secciones llenas del reloj × 5)】`. Luego, elige una opción: el enemigo sufre el estado **aturdido** (*dazed*) o el estado **sacudido** (*shaken*). |
| **Escudo psíquico** (*Psychic Shield*) | Tras realizar una Tirada de Precisión o Tirada Mágica un enemigo visible | A efectos de esa tirada enemiga, tratas tu Defensa y Defensa Mágica como iguales a `【dado actual de Voluntad + (secciones llenas del reloj × 2)】` (puedes conservar tus puntuaciones normales si son superiores). |
| **Presencia tranquilizadora** (*Reassuring Presence*) | Tras cubrir a un aliado con la acción Guardia | Dicho aliado recupera una cantidad de PM igual a `【10 + (secciones llenas del reloj × 5)】`. Si además es tu foco, se cura de un estado alterado a su elección entre aturdido, enfurecido o sacudido. |
| **Termocinesis** (*Thermokinesis*) | Al infligir daño | Ese daño se convierte en **fuego** o **hielo**, y su fuente causa daño adicional igual a `【2 + secciones llenas del reloj】`. |

---

## Mutante (*Mutant*) {#clase-mutante}
*Individuo cuyo organismo ha sido reconfigurado por radiación magitech, contaminación química o cirugía de quimeras.*
- **Beneficios gratuitos:** Aumenta tus Puntos de Vida máximos en +5 de forma permanente.
- **Competencias:** Ninguna adicional.

### Habilidades del Mutante
#### Acromorfosis (*Akromorphosis*) — SL máx. 3 {#hab-acromorfosis}
- **Activación / coste:** Permanente / Inicio de turno (Gratuito).
- **Efecto:** Tus golpes desarmados infligen `【6 + (SL × 2)】` puntos de daño adicional y obtienes un bonificador igual a [SL] a tus Tiradas de Precisión con ellos. Al inicio de tu turno en conflicto, puedes elegir una categoría de arma distinta de Pelea: tus golpes desarmados pasan a pertenecer a esa categoría hasta el inicio de tu próximo turno. Si eliges Arco, Arma de fuego o Arrojadiza, se convierten en armas a distancia en lugar de cuerpo a cuerpo. Si eliges Daga o Espada, no pueden usarse con *Corte triple* (*Triple Slash*).

#### Biofagia (*Biophagy*) — SL máx. 4 {#hab-biofagia}
- **Activación / coste:** Tras causar pérdida de PV a enemigos / Gratuito.
- **Efecto:** Tras hacer que uno o más enemigos pierdan PV mediante un ataque o conjuro ofensivo (r), si te hallas en Crisis, puedes recuperar `[SL × 5]` Puntos de Vida.

#### Muda (*Ecdysis*) — SL máx. 1 {#hab-muda}
- **Activación / coste:** Tras perder PV por daño no físico / 10 PV.
- **Efecto:** Tras sufrir daño elemental (no físico), puedes gastar 10 PV para obtener **Resistencia a ese tipo de daño** hasta que vuelvas a utilizar esta habilidad. No puedes activarla si el coste te redujera a 0 PV.

#### Genoclepsis (*Genoclepsis*) — SL máx. 2 {#hab-genoclepsis}
- **Activación / coste:** Al dañar a uno o más PNJ / Gratuito.
- **Efecto:** Conoces la especie del PNJ y el DJ selecciona [SL] terioformas apropiadas para esa criatura: si posees la habilidad *Teriomorfosis*, puedes pagar inmediatamente su coste en PV para manifestar dichas terioformas (incluso si no las habías aprendido previamente).

#### Teriomorfosis (*Theriomorphosis*) — SL máx. 6 {#hab-teriomorfosis}
- **Activación / coste:** Acción / 1/3 de tus PV actuales (redondeado hacia abajo).
- **Efecto:** Cada vez que adquieres esta habilidad aprendes una terioforma de la lista inferior. Al activarla en combate, manifiestas los efectos de hasta **dos terioformas aprendidas**.

---

### Subsistema de Terioformas (*Therioforms*) {#terioformas}

- **Duración:** Las terioformas activadas permanecen hasta el final de la escena. Finalizan prematuramente si caes a 0 PV, realizas la acción Guardia o vuelves a usar *Teriomorfosis*.
- **Desactivación:** Puedes cancelar la transformación en cualquier momento (en conflicto, solo en tu turno antes o después de una acción).
- **Persistencia entre escenas:** Al terminar una escena bajo los efectos de *Teriomorfosis*, puedes gastar 10 PM para prolongar la mutación activa a la siguiente escena.

#### Catálogo de terioformas {#catalogo-terioformas}

| Terioforma | Sugerencias Genoclepsis | Efecto completo |
| :--- | :--- | :--- |
| **Amphibia** | Ranas, salamandras, monstruos acuáticos o regenerativos | Respiras bajo el agua y ves en la penumbra. Cuando recuperes PV, restauras **5 PV adicionales** y te curas de un estado alterado a tu elección. |
| **Arpaktida** | Lobos, rapaces, depredadores con sentidos agudos | Tratas tu Intuición como un tamaño de dado superior (máximo d12). La primera vez que inflijas daño durante tu turno, si al menos un blanco está en Crisis, causas **5 puntos de daño adicional** a cada uno de ellos. |
| **Dynamotheria** | Osos, dinosaurios, bestias titánicas masivas | Tratas tu Vigor como un tamaño de dado superior (máximo d12). Cuando superes una tirada para avanzar o retrasar un Reloj que incluya Vigor, marcas o borras **1 sección adicional**. |
| **Electrophora** | Anguilas eléctricas, elementales de rayo, robots | Al dañar con un ataque o conjuro, puedes convertir todo el daño en **rayo**. Mientras tus ataques desarmados inflijan daño de rayo, cualquier enemigo que pierda 20+ PV por un golpe desarmado sufre además el estado **lento** (*slow*). |
| **Neurophagoida** | Parásitos, no muertos, comedores de almas | Al usar *Biofagia*, recuperas también una cantidad de PM igual a `【4 + SL en Teriomorfosis】`. |
| **Placophora** | Crustáceos, tortugas, vehículos blindados | Tratas tu Defensa como igual a `【13 + (SL en Teriomorfosis ÷ 2)】` (puedes conservar tu valor si es superior). |
| **Pneumophora** | Moluscos de propulsión, grandes bestias aladas | Al dañar con un ataque o conjuro, puedes convertir todo el daño en **aire**. Mientras tus golpes desarmados inflijan daño de aire, cualquier enemigo que pierda 20+ PV por un golpe desarmado sufre además el estado **débil** (*weak*). |
| **Polypoda** | Pulpos, calamares, enredaderas tentaculares | Tus ataques con golpes desarmados adquieren la propiedad **multi (3)**. |
| **Pterotheria** | Murciélagos, pájaros, insectos voladores | **Capacidad de vuelo:** Tus ataques cuerpo a cuerpo pueden alcanzar a voladores y solo puedes ser alcanzado cuerpo a cuerpo por voladores o atacantes con alcance aéreo. Se pierde temporalmente si no hay espacio para volar o tras sufrir daño de aire, rayo o hielo hasta tu próximo turno. |
| **Pyrophora** | Escarabajos bombardero, elementales de fuego | Al dañar con un ataque o conjuro, puedes convertir todo el daño en **fuego**. Mientras tus golpes desarmados inflijan daño de fuego, cualquier enemigo que pierda 20+ PV por un golpe desarmado sufre además el estado **aturdido** (*dazed*). |
| **Tachytheria** | Felinos, gacelas, criaturas ágiles y veloces | Tratas tu Destreza como un tamaño de dado superior (máximo d12). Cuando superes una tirada para avanzar o retrasar un Reloj que incluya Destreza, marcas o borras **1 sección adicional**. |
| **Toxicophora** | Arañas, serpientes, masas tóxicas venenosas | Al dañar con un ataque o conjuro, puedes convertir todo el daño en **veneno**. Mientras tus golpes desarmados inflijan daño de veneno, cualquier enemigo que pierda 20+ PV por un golpe desarmado sufre además el estado **envenenado** (*poisoned*). |

---

## Piloto (*Pilot*) {#clase-piloto}
*Especialista en combate mecanizado que maneja armaduras de combate, mechas o monturas artilladas.*
- **Beneficios gratuitos:** Aumenta tus Puntos de Vida máximos en +5 de forma permanente. Ganas competencia para equipar **todas las armas cuerpo a cuerpo y a distancia marciales**.
- **Competencias:** Armas marciales cuerpo a cuerpo y a distancia.

### Habilidades del Piloto
#### Tecnología de compresión (*Compression Tech*) — SL máx. 1 {#hab-tecnologia-compresion}
- **Activación / coste:** Acción de Inventario / 2 Puntos de Inventario.
- **Efecto:** Mientras no haya nadie a bordo de tu vehículo personal, puedes hacer que se desmaterialice y desaparezca del mundo de forma segura en cualquier momento. Si el vehículo no está presente y te hallas en un espacio suficiente para albergarlo, puedes gastar 2 PI para hacer que se materialice junto a ti y montarte en él inmediatamente de forma gratuita.

#### Configuración flexible (*Flexible Configuration*) — SL máx. 4 {#hab-configuracion-flexible}
- **Activación / coste:** Al realizar la acción Equipo o Guardia a los mandos / Gratuito.
- **Efecto:** Puedes elegir hasta [SL] módulos habilitados de tu vehículo personal y deshabilitarlos. Si lo haces, habilitas una cantidad igual de módulos que estuvieran deshabilitados.

#### Corazón en el motor (*Heart in the Engine*) — SL máx. 3 {#hab-corazon-en-el-motor}
- **Activación / coste:** Inicio de tu turno a los mandos en conflicto / 10 PM.
- **Efecto:** Elige una opción: la próxima vez que inflijas daño durante este turno, causas `[SL × 2]` puntos de daño adicional; o la próxima vez que sufras daño antes de tu próximo turno, dicho daño se reduce en `[SL × 2]` (antes de afinidades); o te curas del estado lento (*slow*) o del estado débil (*weak*).

#### Vehículo personal (*Personal Vehicle*) — SL máx. 5 {#hab-vehiculo-personal}
- **Activación / coste:** Permanente.
- **Efecto:** Obtienes un vehículo personal con el **chasis** (*frame*) que elijas y **tres módulos diferentes** a tu elección de las listas de armas, armadura o soporte. Cada vez que vuelves a subir de nivel esta habilidad, obtienes **dos módulos adicionales** a tu elección.

#### Agarre firme (*Strong Grip*) — SL máx. 1 {#hab-agarre-firme}
- **Activación / coste:** Al realizar una Tirada de Precisión con módulo de arma / Gratuito.
- **Efecto:** Puedes sustituir uno de los atributos de la tirada por Vigor (por ejemplo, 【VIG + VOL】 con un módulo arcano).

---

### Subsistema del Vehículo Personal {#reglas-vehiculo-personal}

- **Embarque y desembarque:** Montar durante un conflicto exige la acción Objetivo (sin tirada salvo que el DJ imponga un Reloj por obstáculos; si es accesible al inicio del conflicto, se monta gratis antes de la tirada de iniciativa). Desmontar no requiere acción (en conflicto, solo en tu turno antes o después de una acción).
- **Límite de módulos habilitados simultáneos:**
  $$\text{Módulos habilitados simultáneos} = 3 + \text{SL en Vehículo personal}$$
- **Daño y reparaciones:** El vehículo no tiene estadísticas de PV independientes; es una extensión del Piloto. Si el Piloto se Rinde, el vehículo puede quedar temporalmente averiado; repararlo cuesta `【SL en Vehículo personal × 100】` zenit. Solo puede ser destruido si el jugador lo acepta voluntariamente.
- **Módulos de armadura:** Ocupan el espacio de armadura del Piloto y fijan su Defensa y Defensa Mágica a valores absolutos.
- **Módulos de armas:** Ocupan los espacios de manos del Piloto. Cuentan como armas a una mano no marciales (salvo el Escudo, que cuenta como escudo equipado). Si dos módulos de arma habilitados comparten categoría, permiten el combate con dos armas.

---

### Chasis (*Frames*) {#chasis-vehiculos}

| Chasis | Pasajeros | Multiplicador de distancia | Capacidad de módulos y reglas especiales |
| :--- | :---: | :---: | :--- |
| **Exoesqueleto** (*Exoskeleton*) | Ninguno | Sin modificador | Hasta 2 módulos de arma, 1 de armadura y cualquier número de soporte habilitados. Si usas *Tecnología de compresión*, ignora el coste en PI. |
| **Mecha** (*Mecha*) | Ninguno | ×2 | Hasta 2 módulos de arma, 1 de armadura y cualquier número de soporte habilitados. |
| **Corcel** (*Steed*) | Hasta 1 | ×2 | Hasta 1 módulo de arma, 1 de armadura y cualquier número de soporte habilitados. Si usas *Corazón en el motor*, ignora el coste en PM. |

---

### Módulos de armadura (*Armor Modules*) {#modulos-armadura}

| Módulo de armadura | Defensa | Defensa Mágica | Reglas especiales |
| :--- | :---: | :---: | :--- |
| **Blindaje flexible** (*Flexible Plating*) | Dado DES +2 | Dado INT +1 | No marcial. |
| **Blindaje estándar** (*Standard Plating*) [E] | 11 | 10 | Marcial. |
| **Blindaje pesado** (*Heavy Plating*) [E] | 12 | 8 | Marcial. |
| **Blindaje rúnico** (*Runic Plating*) [E] | 10 | 11 | Marcial. |

---

### Módulos de armas (*Weapon Modules*) {#modulos-armas}

Todos los módulos de armas tienen un coste base de 500 zenit, son armas a una mano y no marciales.

| Módulo de arma | Precisión | Daño | Categoría / Alcance | Reglas especiales |
| :--- | :---: | :---: | :--- | :--- |
| **Arcano** (*Arcane*) | 【DES + VOL】 | 【HR + 8】 físico | Arcana w Cuerpo a cuerpo | Sin cualidades. |
| **Hacha** (*Axe*) | 【DES + INT】 | 【HR + 12】 físico | Pesada w Cuerpo a cuerpo | Sin cualidades. |
| **Hoja** (*Blade*) | 【DES + INT】 | 【HR + 6】 físico | Daga w Cuerpo a cuerpo | Sin cualidades. |
| **Arco** (*Bow*) | 【DES + INT】 | 【HR + 12】 físico | Arco w A distancia | No permite tener ningún otro módulo de arma habilitado. |
| **Cañón** (*Cannon*) | 【DES + INT】 | 【HR + 14】 físico | Arma de fuego w A distancia | No permite tener ningún otro módulo de arma habilitado. |
| **Garra** (*Claw*) | 【DES + INT】 +1 | 【HR + 8】 físico | Pelea w Cuerpo a cuerpo | Puede usarse para manipular objetos como una mano libre normal. |
| **Mandoble** (*Claymore*) | 【DES + INT】 +1 | 【HR + 14】 físico | Espada w Cuerpo a cuerpo | No permite tener ningún otro módulo de arma habilitado. |
| **Esotérico** (*Esoteric*) | 【DES + VOL】 | 【HR + 12】 físico | Arcana w Cuerpo a cuerpo | No permite tener ningún otro módulo de arma habilitado. |
| **Mangual** (*Flail*) | 【DES + INT】 | 【HR + 10】 físico | Mangual w Cuerpo a cuerpo | Sin cualidades. |
| **Lanzallamas** (*Flamer*) | 【DES + INT】 | 【HR + 8】 fuego | Arma de fuego w Cuerpo a cuerpo | Sin cualidades. |
| **Ametralladora** (*Machine Gun*) | 【DES + INT】 | 【HR + 10】 físico | Arma de fuego w A distancia | No permite tener otros módulos de armas habilitados. Al Atacar, puedes realizar dos ataques separados (combate con dos armas: pierden multi y consideran HR como 0 para el daño). |
| **Fusil** (*Rifle*) | 【DES + INT】 | 【HR + 10】 físico | Arma de fuego w A distancia | Sin cualidades. |
| **Guadaña** (*Scythe*) | 【DES + INT】 | 【HR + 16】 físico | Pesada w Cuerpo a cuerpo | No permite tener ningún otro módulo de arma habilitado. |
| **Escudo** (*Shield*) | — | — | Escudo | Solo para Exoesqueleto y Mecha. Confiere **+2 a Defensa y +2 a M.DEF**. Cuenta como escudo equipado. No puede equiparse en la mano principal salvo con *Portador de doble escudo*. |
| **Lanza** (*Spear*) | 【DES + INT】 | 【HR + 10】 físico | Lanza w Cuerpo a cuerpo | Sin cualidades. |
| **Espada** (*Sword*) | 【DES + INT】 +1 | 【HR + 8】 físico | Espada w Cuerpo a cuerpo | Sin cualidades. |
| **Tridente** (*Trident*) | 【DES + INT】 +1 | 【HR + 14】 físico | Lanza w Cuerpo a cuerpo | No permite tener ningún otro módulo de arma habilitado. |

---

### Módulos de soporte (*Support Modules*) {#modulos-soporte}

| Módulo de soporte | Restricción | Efecto completo |
| :--- | :--- | :--- |
| **Módulo aéreo** (*Aerial Module*) | Cuenta como 2 módulos | El vehículo adquiere capacidad de vuelo y su multiplicador de distancia pasa a ser **×3**. Tus ataques cuerpo a cuerpo impactan a voladores y nadie a bordo puede ser alcanzado cuerpo a cuerpo por no voladores. Se suspende si estás en Crisis, si el vehículo queda inactivo o tras sufrir daño de aire, rayo o hielo hasta tu próximo turno. |
| **Antielemental** (*Anti-Element*) | Ninguna | Al habilitarlo, elige: aire, rayo, tierra, fuego o hielo. Todos los ocupantes adquieren Resistencia a ese tipo de daño. |
| **Puntería avanzada** (*Advanced Targeting*) | Ninguna | Bonificador de +2 a tus Tiradas de Precisión y Tiradas Mágicas ofensivas (r). |
| **Contraataque** (*Counterstrike*) | Ninguna | Tras ser alcanzado un ocupante por un ataque a distancia, puedes gastar 1 PI para que el agresor sufra 10 puntos de daño físico (15 si eres nivel 20+, 20 si eres nivel 40+). |
| **Excavación** (*Excavation*) | Ninguna | Permite desplazarse bajo tierra e incorpora focos de alta potencia. |
| **Blindaje expandido** (*Expanded Plating*) | Solo Mecha y Corcel | Extiende los valores de Defensa y M.DEF del módulo de armadura instalado a todos los pasajeros a bordo. |
| **Magiestático** (*Magistatic*) | Arma arcana | Tras pagar el coste en PM de un Arcano, conjuro o verso a los mandos, recuperas 5 PM (o 10 PM si el coste fue de 30+ PM). |
| **Potencia** (*Power*) | Solo Exoesqueleto y Mecha | Bonificador de +2 a Tiradas Enfrentadas basadas en fuerza bruta o resistencia física. |
| **Interfaz rápida** (*Rapid Interface*) | Ninguna | Al montar en el vehículo en tu turno durante un conflicto, ejecutas inmediatamente una acción adicional. |
| **Marino** (*Seafarer*) | Ninguna | Permite navegar sobre la superficie del agua y sumergirse bajo ella. |
| **Asiento** (*Seat*) | Solo Mecha y Corcel | Permite transportar a un pasajero humanoide adicional. |
| **Ofensiva secundaria** (*Secondary Offensive*) | Solo Exoesqueleto y Mecha | Vincula un módulo de arma deshabilitado: mientras esté deshabilitado, puedes usar una acción para ejecutar un ataque gratuito con él. |
| **Sensor** (*Sensor*) | Ninguna | Bonificador de +2 a Tiradas Abiertas para examinar criaturas, lugares y objetos cercanos. |
| **Turbo** (*Turbo*) | Ninguna | Bonificador de +2 a Tiradas Enfrentadas basadas en velocidad y maniobras de aceleración. |
