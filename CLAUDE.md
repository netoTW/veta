# Reglas permanentes de VETA

Estas reglas mandan sobre cualquier costumbre anterior del repositorio. Valen para el producto,
para los documentos y para los mensajes al usuario.

## Idioma

**Español neutro con tuteo.** Nunca voseo ni modismos argentinos.

| no | sí |
|---|---|
| sos, tenés, podés, querés, sabés, hacés, decís, elegís | eres, tienes, puedes, quieres, sabes, haces, dices, eliges |
| mirá, entrá, probá, pedí, elegí, tocá, votá, escribí, dejá, cerrá, pasá | mira, entra, prueba, pide, elige, toca, vota, escribe, deja, cierra, pasa |
| decime, avisale, fijate, quedate, acordate | dime, avísale, fíjate, quédate, acuérdate |
| acá, allá, plata, laburo, recién (como "hace un momento") | aquí, allí, dinero, trabajo, hace un momento |
| "quién sos", "vos elegís" | "quién eres", "tú eliges" |

Aplica también a los mensajes de esta sesión con el usuario.

## Tono

**Vendedor, seguro, sin modestia.** El objetivo es que la persona quiera comprar. Se afirma lo
que el producto hace bien, sin rodeos ni disculpas.

- El **riesgo vive dentro del informe**, en un bloque claro, en palabras normales y sin
  dramatismo. No se reparte por toda la pantalla ni tiñe la interfaz de rojo.
- En **landing, noticias y páginas públicas** el riesgo casi no aparece: ahí se vende.
- Nada de falsa humildad («quizá», «puede que», «no somos perfectos»).

## Límites que no se cruzan

- Nada de **«compra»**, **retornos prometidos** ni **precios objetivo**.
- Nada de **cifras, clientes, testimonios ni nombres inventados**. Si no existe el dato, no se
  escribe.
- Nada de consejo financiero personalizado.

## Cero lenguaje interno en vistas de cliente

Estas palabras **no pueden aparecer** en nada que vea un cliente: *motor, Escéptico,
Verificador, Redactor, criterio, umbral, observable, §, versión del registro, hueco del
contrato, paquete, corrida, scanner*.

Se traducen así:

| interno | de cara al cliente |
|---|---|
| Objeciones del Escéptico | Lo que podría salir mal |
| El Verificador bloqueó el informe | No pasó nuestro control de calidad |
| umbral / observable | el número que la invalida / la señal que se vigila |
| criterio de corte, mínimo N | no se muestra |
| limitación de datos, dato ausente, no medible | no se muestra: lo que no hay, no se enseña |
| motor, scanner, corrida | VETA, rastreo, pasada |

**Lo que no hay, no se muestra.** Nunca una casilla que diga que falta un dato.

En **admin** sí se usa el vocabulario real: ahí trabaja quien conoce el sistema.

## Método de trabajo

Para cada pieza visual: **construir → captura fija → criticar sin piedad → rehacer.** Ninguna
pieza se da por buena sin mirar una captura.

Todo lo marcado **[DISEÑO]** se propone antes de construir.

## Dónde está lo demás

**Para retomar: `TRASPASO.md` primero.** Estado, pendientes con prioridad,
decisiones y su motivo, reglas de coordinación y dónde está cada cosa en el
servidor. Con ése, este archivo y el contrato, basta para seguir.

`ESTADO-WEB.md` (estado, operación y qué falta), `SISTEMA-VISUAL.md` (paleta y piezas),
`DESPLIEGUE.md` (producción), `HUECOS-CONTRATO.md` (lo que falta del motor),
`CONTRATO-ANALISIS-A-PEDIDO.md` (la interfaz con el motor),
`PATRONES-PROSA-MOTOR.md` (lo que el filtro de lenguaje atrapa, para el Narrador).
