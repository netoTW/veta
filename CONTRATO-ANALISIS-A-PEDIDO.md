# Contrato: análisis a pedido (web ⇄ motor)

Este archivo lo implementa el motor. La web ya lo cumple de su lado y hoy responde un
**simulador** (`site/server/motorSimulado.ts`) que recorre las etapas sin gastar. Cuando el
motor implemente lo de abajo, la web se enchufa con `VETA_MOTOR=http` y `VETA_MOTOR_URL` sin
tocar una línea de interfaz (`site/server/motorHttp.ts` es el cliente).

Reglas que la web ya aplica y el motor no tiene que resolver:
- El **determinista es gratis y no consume cupo**; el **profundo consume cupo** (base 2, pro 6,
  admin sin cupo) y la web lo reserva al pedir y **lo devuelve si el resultado es `fallido` o
  `bloqueado`**. El motor sólo tiene que reportar el estado con honestidad.
- El motor **nunca declara "es gema"**. Devuelve el informe completo; el sello editorial lo pone
  la bandeja. Aunque el registro traiga `apto_para_gemas`, la web lo ignora en este flujo.
- El **tope mensual de gasto** lo aplica la web antes de pedir; el motor sólo informa
  `costo_real_usd` al terminar.

## 1. Vocabulario

```
nivel   = 'determinista' | 'profundo'
estado  = 'en_cola' | 'en_curso' | 'listo' | 'fallido' | 'bloqueado'
etapa   = 'recolectando' | 'calculando' | 'esceptico' | 'redactando' | 'verificando'
```

Orden fijo de etapas del profundo: recolectando → calculando → esceptico → redactando →
verificando. El determinista no tiene etapas: responde en la misma llamada.

## 2. Solicitud (web → motor)

```json
{
  "tipo": "analisis_solicitado",
  "id": "sol-20260913-a1b2c3",
  "nivel": "profundo",
  "simbolo": "RAY",
  "id_coingecko": "raydium",
  "usuario": { "id": "…", "email": "…", "plan": "base" },
  "origen": "analiza_tu_moneda",
  "fecha": "2026-09-13T21:04:11.000Z",
  "consume_cupo": true
}
```

- `id` lo pone la web y es la clave de todo lo demás. Formato `sol-YYYYMMDD-hex6`.
- `usuario` es `null` cuando el origen es `votacion_semanal` (lo pide el admin, sin cupo).
  Esas líneas traen además `semana`, `votacion_id` y `solicitado_por`.
- `origen`: `analiza_tu_moneda` | `votacion_semanal`.
- `id_coingecko` puede faltar; `simbolo` siempre está, en mayúsculas.

La web la manda de dos formas a la vez; el motor elige una y puede ignorar la otra:
1. **HTTP** `POST {VETA_MOTOR_URL}/profundo` con el JSON de arriba (respuesta `202` vacía o
   `{ ok: true }`).
2. **Archivo** `base_contenido/cola-web.jsonl`, una línea por pedido, append-only. Sirve para
   correr el motor por lotes sin servicio.

## 3. Servicio HTTP del motor

Cuatro rutas, JSON, sin autenticación (corre en la misma máquina; si algún día no, se pone
un token en cabecera y se documenta acá).

| ruta | qué hace | responde |
|---|---|---|
| `GET /universo` | monedas que el motor puede analizar hoy | `[{ simbolo, nombre, id_coingecko?, cadena?, con_informe }]` |
| `POST /determinista` `{ simbolo }` | lectura estructural, instantánea (≤ 3 s) | `LecturaDeterminista` (§4) o `404` si no cubre la moneda |
| `POST /profundo` `Solicitud` | encola o arranca el análisis | `202` |
| `GET /progreso/:id` | estado del pedido | `Progreso` (§5) o `404` si no lo conoce |

La web pregunta `/progreso/:id` cada 2–3 s mientras el estado no sea terminal. Un `404` en
progreso se trata como "el motor no lo tomó todavía" durante 60 s y después como `fallido`
(`motor_no_disponible`).

## 4. Lectura determinista (respuesta de `/determinista`)

Cinco preguntas, cinco bloques. Cada bloque lleva una `lectura` en una palabra (enumerada),
una frase llana, cifras con unidad y la fuente. **Sin tesis, sin escenarios, sin veredicto.**

```json
{
  "nivel": "determinista",
  "origen_motor": "motor",
  "simbolo": "RAY", "nombre": "Raydium", "cadena": "Solana", "id_coingecko": "raydium",
  "fecha_datos": "2026-09-13T02:37:42+00:00",
  "precio_usd": 2.31,
  "demanda":       { "lectura": "demanda_real | apalancamiento | mixta | sin_dato", "texto": "…", "fuente": "binance:futures + spot", "cifras": [ { "k": "futuros sobre spot", "v": 2.76, "unidad": "×" } ], "condiciones": [ { "nombre": "F/S alto", "cumple": false, "detalle": "…" } ] },
  "riesgo_cola":   { "lectura": "contenida | alta | extrema | sin_dato", "texto": "…", "fuente": "…", "cifras": [ { "k": "semana mala (1 de 20)", "v": 33.8, "unidad": "%" } ] },
  "concentracion": { "lectura": "dispersa | concentrada | muy_concentrada | sin_dato", "texto": "…", "fuente": "…", "cifras": [ … ] },
  "tokenomics":    { "lectura": "captura_verificada | captura_declarada | sin_captura | sin_dato", "texto": "…", "fuente": "…", "cifras": [ … ] },
  "liquidez":      { "lectura": "profunda | suficiente | fina | sin_dato", "texto": "…", "fuente": "…", "cifras": [ { "k": "libro a ±2 %", "v": 516223, "unidad": "USD" } ] },
  "advertencias": [ { "tipo": "…", "severidad": "COMPROMETE_TESIS | LIMITA_LECTURA | CONTEXTO", "seccion": "…", "texto": "…", "campo_afectado": "…" } ],
  "fuentes": [ { "campo": "…", "fuente": "…", "timestamp": "…", "calidad": "ok | parcial | ausente" } ]
}
```

- `unidad` ∈ `%` (ya multiplicado por 100), `USD`, `×`, `p` (percentil) o ausente (número
  suelto). `v` puede ser `null` (la web no dibuja la cifra) o texto.
- Umbrales sugeridos para la lectura (los fija el motor, la web sólo muestra la palabra):
  riesgo de cola por CVaR 7 d: < 20 % contenida, < 40 % alta, ≥ 40 % extrema; concentración
  por top-10 neto: < 20 % dispersa, < 45 % concentrada; liquidez por libro a ±2 %: > 2 M
  profunda, > 300 k suficiente.
- Las secciones deterministas que el motor ya calcula (riesgo, microestructura, on-chain,
  fundamentales) alcanzan para llenar esto: el simulador lo hace exactamente así a partir de
  un informe existente (`motorSimulado.ts › deterministaDeInforme`).

## 5. Progreso (respuesta de `/progreso/:id`)

```json
{
  "solicitud_id": "sol-20260913-a1b2c3",
  "estado": "en_curso",
  "etapa": "esceptico",
  "avance": 0.42,
  "detalle": "preguntando si el catalizador tiene fecha",
  "etapas_hechas": ["recolectando", "calculando"],
  "iniciado": "2026-09-13T21:04:14.000Z",
  "actualizado": "2026-09-13T21:05:31.000Z",
  "terminado": null,
  "costo_real_usd": null,
  "resultado": null,
  "fallo": null,
  "verificador": null
}
```

- `avance` es 0..1 **dentro de la etapa**, o `null` si la etapa no lo sabe. La web no lo
  necesita para funcionar: mueve la roca por etapa, y el avance sólo afina.
- `detalle` es una frase llana de lo que está haciendo ahora. Se muestra tal cual al usuario:
  sin nombres de agentes, sin versiones, sin `§`. "el escéptico" está bien; "Redactor v5.1" no.
- Al terminar:
  - `estado: 'listo'` → `resultado` es el **registro completo del informe** con la misma forma
    que `gemas.jsonl` / `analisis.jsonl` (id, tipo, versión, ficha_esencial, niveles, riesgo,
    microestructura, onchain, fundamentales, escenarios, esceptico, verificador, fuentes…), con
    `origen: 'a_pedido'` y `solicitud: { id, usuario_email, nivel }`. Ese registro entra a la
    bandeja como cualquier otro; el `id` conviene que sea `AP-<SIMBOLO>-<YYYYMMDD>-<hex>`.
    `costo_real_usd` con el gasto real de API.
  - `estado: 'bloqueado'` → `verificador: { estado: 'bloqueado', motivo_bloqueo }` y sin
    resultado. La web devuelve el cupo.
  - `estado: 'fallido'` → `fallo: { codigo, texto }`. Códigos conocidos: `sin_cobertura`,
    `fuente_caida`, `sin_serie_suficiente`, `motor_no_disponible`, `cancelado`. `texto` en
    llano, se muestra al usuario. La web devuelve el cupo.
- `estado: 'en_cola'` lo usa la web cuando el pedido espera por el tope de gasto; el motor
  puede devolverlo también si tiene su propia cola.

## 6. Qué pasa después del `listo`

- El resultado es del usuario de inmediato (`/analizar/s/:id`).
- Aparece en la bandeja del admin como `analisis · a pedido de <email>`. Si se aprueba, se
  publica para todos en `/analisis` como cualquier informe; la publicación queda en
  `publicacion.jsonl` como siempre.
- La web registra en `uso_analisis`: usuario, símbolo, fecha, tipo, si consumió cupo y
  `costo_real_usd`.

## 7. Lo que falta del lado del motor (para el otro Claude Code)

1. Servicio HTTP con las cuatro rutas de §3 (o un consumidor de `cola-web.jsonl` que escriba
   `base_contenido/progreso-web/<id>.json` con la forma de §5; si se elige esta vía, avisar y
   la web agrega ese lector al lado del HTTP).
2. `POST /determinista` reutilizando las etapas deterministas ya existentes del pipeline,
   con los enumerados de §4.
3. Reportar `etapa`, `detalle` y `avance` desde el orquestador de agentes; `costo_real_usd` al
   cerrar.
4. `origen: 'a_pedido'` y `solicitud` en el registro resultante; `id` con prefijo `AP-`.
5. El universo: `GET /universo` con lo que el motor puede analizar hoy (hoy la web usa los
   informes existentes más el ranking del scanner).

## 8. Conectado (2026-09-14): lo que el motor decidió y la web respeta

- **`VETA_MOTOR=http` está activo.** El servicio se levanta con
  `.venv/bin/python gem-pipeline/servicio/app.py` (puerto 8787) y tiene que estar corriendo
  junto con la web, como ngrok.
- **404 en `/determinista` = "no hay NINGÚN dato guardado de la moneda"**, no "no la
  cubrimos". Si hay datos y falta un campo, el bloque viene `sin_dato` con su motivo. La web
  distingue tres casos: fuera del universo (404 propio, «no está entre las 350 que cubrimos»),
  en el universo sin datos («cubierta · sin datos todavía», y se ofrece el profundo, que los
  crea), y lectura con bloques `sin_dato` (chip gris «Sin dato» y el motivo como texto).
- **`mixta` en demanda** = futuros sobre contado entre 3× y 10×. Debajo, `demanda_real`;
  encima, `apalancamiento`. Queda definido acá.
- **`/profundo` deja el pedido `en_cola` y no lo arranca.** Es deliberado: nada gasta sin
  lanzamiento explícito (`pipeline/lanzar_pedidos.py --lanzar <id>` o `--todos`). La web se lo
  dice al usuario sin prometer tiempo («los lanza el equipo a mano; puede ser en minutos o al
  día siguiente»), muestra el puesto en la cola y avisa al arrancar y al terminar; el admin ve
  la cola pendiente arriba de todo en `/admin/consumo`, con el comando exacto.
- La web distingue **retenido por el tope** (el motor no lo conoce todavía; `enviada = 0`) de
  **en cola del motor** (`enviada = 1`). Sólo los primeros se reenvían.
- Si `/progreso/:id` devuelve 404 durante más de 60 s para un pedido enviado, la web lo marca
  `fallido` (`motor_no_disponible`), devuelve el cupo y avisa.
- Los textos y fuentes del motor pueden traer referencias internas («· motor §4.1», «§8 S7»):
  la web las quita antes de mostrarlas.

---

# §9. Lo que la fase 2 necesita del motor (2026-09-19)

Cuatro añadidos. La web ya está construida contra ellos: mientras no existan, cae a un modo
degradado que se describe en cada punto, así que **no rompen nada al llegar**.

## 9.1 `POST /resolver` — de lo que escribe el usuario a una moneda concreta

Hoy la web sólo puede buscar por coincidencia de ticker dentro de `/universo`, que trae una
entrada por símbolo y sin dirección de contrato. Eso deja fuera dos casos reales: el mismo
ticker en varias cadenas, y el usuario que pega un contrato.

```
POST /resolver   { "consulta": "btc" | "0xA0b8…" | "pepe" }
```

```json
{
  "consulta": "pepe",
  "interpretada_como": "ticker",
  "candidatas": [
    { "simbolo": "PEPE", "nombre": "Pepe", "id_coingecko": "pepe", "cadena": "Ethereum",
      "contrato": "0x6982508145454ce325ddbe47a25d4ec3d2311933",
      "mcap_usd": 4100000000, "vol24h_usd": 890000000, "con_informe": true,
      "analizable": true, "motivo_no_analizable": "" },
    { "simbolo": "PEPE", "nombre": "Pepe (Solana)", "id_coingecko": "pepe-sol", "cadena": "Solana",
      "contrato": "Bz9…", "mcap_usd": 1200000, "vol24h_usd": 40000, "con_informe": false,
      "analizable": false, "motivo_no_analizable": "volumen por debajo de 2.000.000 USD al día" }
  ]
}
```

- `interpretada_como`: `ticker` | `contrato` | `nombre`.
- **Orden**: la más probable primero (capitalización descendente). La web muestra la lista tal
  como llega.
- **Una candidata** → la web sigue directo. **Varias** → el usuario elige. **Ninguna** → 404
  con `{ "error": "sin_cobertura", "texto": "…" }`.
- Se aceptan direcciones EVM (`0x` + 40 hex) y base58 de Solana. Si la consulta es un contrato
  y existe, `candidatas` trae una sola entrada.
- **Sufijos de par**: si llega `BTCUSDT`, `BTC-PERP` o `BTC/USD`, se resuelve como `BTC` y se
  devuelve `"normalizada": "BTC"` para que la web pueda avisarlo.

*Mientras no exista:* la web resuelve contra `/universo` por coincidencia de símbolo y nombre,
nunca ofrece elegir entre candidatas y rechaza las direcciones de contrato con un mensaje claro.

## 9.2 `analizable` — el chequeo que hoy la web improvisa (cierra el hueco 39)

Campo nuevo en `/resolver`, en cada entrada de `/universo` y en la respuesta de
`/determinista`:

```json
"analizable": false,
"motivo_no_analizable": "sin ingresos ni capital depositado medibles: no hay con qué construir una lectura"
```

El motivo va **en lenguaje de cliente**: es lo que se le muestra a quien pidió la moneda.

Regla dura de la web: **si `analizable` es `false`, el análisis profundo no se ofrece y no se
descuenta cupo.** Si el motor acepta un pedido profundo sobre una moneda no analizable, la web
lo trata como error del pedido, no como análisis fallido.

*Mientras no exista:* la web aplica su propia regla (hay ingresos del protocolo o capital
depositado) y lo dice como estimación propia.

## 9.3 `POST /profundo` acepta contrato

Además de `simbolo`, la solicitud puede traer `contrato` y `cadena`. Al menos uno de los dos
caminos tiene que identificar la moneda sin ambigüedad:

```json
{ "id": "sol-…", "nivel": "profundo", "simbolo": "PEPE",
  "id_coingecko": "pepe", "contrato": "0x6982…", "cadena": "Ethereum", … }
```

Cuando el usuario eligió entre candidatas, la web manda **siempre** `id_coingecko`, que es la
identificación sin ambigüedad. `simbolo` viaja igual, para los registros.

## 9.4 `narrado` — el informe escrito para el cliente (capa de cliente del hueco 40)

Hoy el texto del informe mezcla lectura y control interno, y la web lo filtra frase por frase.
Ese filtro es un parche: recorta de más y a veces deja un bloque vacío.

En `Progreso.resultado`, junto al registro completo, un objeto nuevo:

```json
"narrado": {
  "titular": "Raydium factura de verdad y el token cobra parte de esa caja.",
  "parrafos": [
    "El protocolo cobra comisiones por cada intercambio y el 12 % financia recompras…",
    "Frente a protocolos del mismo tamaño y el mismo negocio, cotiza en línea…"
  ],
  "riesgos": [
    "La mayor parte de las comisiones viene de un solo producto; si pierde cuota, la caja se achica.",
    "Cuatro de las diez mayores posiciones no están identificadas."
  ],
  "cierre": "Lo que habría que ver para cambiar de opinión: que el TVL baje de 843 M USD durante 30 días."
}
```

Reglas del campo:
- **Escrito para el cliente.** Nada de *criterio, umbral, observable, Escéptico, Verificador,
  motor, §, corrida, paquete*, ni listas de descarte, ni «no se pudo medir».
- `riesgos` es la fuente del bloque **«Lo que podría salir mal»**. Ahí va el riesgo real, en
  palabras normales, sin dramatismo.
- Nada de «compra», retornos prometidos ni precios objetivo.
- Si un dato no existe, no se menciona.

**La lista de todo lo que hay que dejar de escribir está en `PATRONES-PROSA-MOTOR.md`**,
generada desde el propio filtro sobre los informes reales, con cuántas veces aparece cada cosa.

*Mientras no exista:* la web sigue componiendo el texto desde `ficha_esencial` y `niveles`, con
el filtro por frases. **Cuando `narrado` llegue, el filtro se retira** y el informe pasa a ser
la pieza central de la pantalla de resultado.

---

## 9.5 `/determinista` tiene que respetar la moneda elegida  ·  HUECO ABIERTO

`POST /resolver` ya desambigua: con `pepe` devuelve **ocho** monedas distintas, cada una con
su contrato y su cadena. La web las muestra y quien pregunta elige una.

Pero `POST /determinista` recibe sólo el símbolo y busca `reports/<SÍMBOLO>-*`. Si se le
manda `contrato` y `cadena`, los ignora: se le pidió el PEPE de Base con su contrato y
devolvió el PEPE de Ethereum.

**Qué manda ya la web** (desde hoy, en `/determinista` y en `/profundo`):

```json
{ "simbolo": "PEPE",
  "contrato": "0x52b492a33e447cdb854c7fc19f1e57e8bfa1777d",
  "cadena": "base" }
```

**Qué hace falta del motor:**

1. Que `/determinista` use `contrato` (y `cadena` como respaldo) para elegir el informe, y
   devuelva **404** cuando no tenga uno de *esa* moneda, en vez del de su homónima.
2. Que `/profundo` guarde `contrato` y `cadena` junto al pedido, para que la corrida analice
   la moneda que se pidió.

**Mientras tanto,** la web compara la cadena que eligió el usuario con la que vuelve en la
lectura y, si no coinciden, lo dice en pantalla: «de las monedas que se llaman PEPE, la única
con datos guardados es Pepe en Ethereum». No se hace pasar una por otra. Cuando el motor
cierre este hueco, ese aviso se quita.

---

# 10. Noticias, agenda y tendencias  ·  la parte que le toca a la web

Escrito contra `gem-pipeline/DISENO-FASES-3-5.md` (fase 4 del motor). El motor ya definió el
agente, la verificación y la cadencia. Aquí va sólo lo que la web necesita para pintarlo, y los
cinco puntos donde hay que ponerse de acuerdo antes de construir.

Decisiones ya tomadas por Pablo (2026-09-19): la sección se llama **Noticias** y muestra lo que
produce el motor. La **Agenda** va como bloque dentro de esa sección.

## 10.1 Lo que la web va a pedir

| Ruta | Cuándo | Para qué |
|---|---|---|
| `GET /noticias?dia=YYYY-MM-DD` | al abrir la sección | las piezas del día |
| `GET /agenda?desde=&hasta=` | con la sección | el bloque de fechas |
| `GET /tendencias` | con la sección | el bloque determinista |

`dia` se interpreta en **UTC** y sin él devuelve el último día con piezas. Si un día no tiene
nada, **200 con la lista vacía**, nunca 404: la web necesita distinguir «hoy no hubo» de «el
motor no responde», y son dos pantallas distintas.

## 10.2 Cinco cosas que hay que cerrar

### 1. Despublicar lo escribe la web, no el motor

El diseño dice que Pablo despublica desde el admin cambiando `publicada: false`. Eso obligaría a
la web a escribir en el motor, y hoy la web **nunca** le escribe: para los informes, la decisión
editorial vive en la tabla `publicacion` de la web y el motor ni se entera.

**Propongo lo mismo aquí.** El motor publica y marca `publicada: true`; la web guarda sus propias
filas de `publicacion` con `tipo: 'noticia'` y filtra al servir. Ventajas: despublicar funciona
aunque el motor esté caído, queda registrado con autor y fecha como el resto, y el motor sigue
siendo de sólo lectura para la web. **Si el motor prefiere su propio campo, hace falta un
endpoint de escritura autenticado y decidir quién gana cuando los dos discrepan.**

### 2. La agenda no puede filtrar informes sin aprobar

El diseño dice que los eventos de moneda salen «de los informes en la bandeja o publicados».
**Los de la bandeja no pueden salir a un cliente**: son informes que todavía no aprobó nadie, y
enseñar sus catalizadores destapa qué estamos analizando antes de tiempo.

La web puede filtrarlos ella misma, pero necesita el identificador exacto: que `origen` traiga
el **`informe_id` tal cual** lo usa la web (`RAY-20260912-012647`), no una ruta ni un texto. Con
eso, la web cruza contra su tabla `publicacion` y muestra sólo lo aprobado.

Y una fila de agenda necesita `id` propio y estable, para que `agenda_ids[]` de cada noticia
enganche con ella.

### 3. Quién ve las tendencias

Pablo decidió: **el agregado, para todos; la lista con nombres, sólo Pro.**

Ojo con no mezclar dos cosas distintas:

- **Tendencias de CoinGecko** (`/search/trending`): dato público. Se puede mostrar entero a
  cualquiera, con nombres.
- **El cruce con el rastreo** (volumen sobre su media, si tiene informe en la bandeja): eso es
  nuestro embudo y es lo que se vela. Para quien no es Pro va en agregado y sin nombres.

Por eso `GET /tendencias` tiene que separar los dos bloques en la respuesta, y marcar cuál es
cuál. Si vienen mezclados en una sola lista, la web no puede aplicar la regla sin adivinar.

### 4. El texto sale en español neutro con tuteo

Las noticias se leen tal cual, sin que nadie las revise antes. Hoy el motor escribe en voseo:
`/determinista` devuelve, literal, *«todavía no hay datos guardados de RAY… pedí uno profundo»*.
La web lo corrige al mostrarlo, pero eso es un parche y con textos largos no alcanza.

**Que el prompt del agente de noticias lo exija:** español neutro con tuteo, nunca voseo
(*pedí, mirá, tenés, sos*), y primera letra en mayúscula. La lista negra que ya tiene el
verificador es el sitio natural para comprobarlo.

Al vocabulario prohibido que ya está en el diseño hay que sumarle el interno de siempre:
*motor, Escéptico, Verificador, Redactor, criterio, umbral, observable, §, corrida, paquete,
scanner*.

### 5. Lo que no hay, no se muestra

Si una pieza no trae `escenario_condicional` porque no hubo historial suficiente, que **no venga
el campo**, en vez de venir vacío o con un texto de relleno. Lo mismo con `monedas` y con
`cifras_verificadas`. La web no pinta huecos con nombre.

## 10.3 Forma de `GET /tendencias` que la web puede pintar

Lo que falta en el diseño. Propuesta:

```json
{ "calculado_en": "2026-09-19T12:35:00Z",
  "publico": {
    "monedas": [{"simbolo": "BTC", "nombre": "Bitcoin", "var_24h": 0.031, "var_7d": -0.048}],
    "categorias": [{"nombre": "Restaking", "var_24h": 0.11}]
  },
  "rastreo": {
    "agregado": {"n_monedas": 15, "por_volumen_anomalo": 15, "por_ingresos_sobre_capitalizacion": 3},
    "monedas": [{"simbolo": "RAY", "vol_sobre_adv30": 3.9, "con_informe": true}]
  } }
```

`publico` se muestra a todos. De `rastreo`, `agregado` se muestra a todos y `monedas` sólo a Pro.
Servido así, la web aplica la regla sin decidir nada.

## 10.4 Lo que la web construye cuando esto exista

- **Sección Noticias**: las piezas del día, cada una con su fuente y su fecha a la vista.
- **Bloque Agenda** dentro de la sección: lo que viene con fecha, y qué cambió en lo que ya
  seguimos.
- **Bloque Tendencias**: el público entero, el del rastreo según el plan.
- **Admin**: despublicar una pieza, con el mismo registro de autor y fecha que los informes.

### 9.5.1 Lo que se resolvió el 2026-09-19

`GET /analizable?simbolo=&cadena=&id=&contrato=` **ya existe en el motor y la web ya lo usa.**
Con eso, una moneda de fuera del universo deja de ser un callejón sin salida:

- Si el motor dice que **sí** da para analizar, la web muestra lo que él midió (capitalización,
  volumen diario, días de historia de precio y de ingresos) y ofrece el análisis completo.
- Si dice que **no**, la web muestra los motivos con las palabras del propio motor, que ya
  vienen llanas en `faltantes[].cliente`. No se descuenta nada.
- **Nunca más «no se encontró»** para una moneda que `/resolver` acaba de encontrar.

`POST /profundo` ahora recibe siempre `contrato` y `cadena`, y la web los guarda junto al
pedido, porque el mensaje que viaja al motor se reconstruye desde esa fila.

### 9.5.2 Lo que sigue abierto

1. **`/determinista` sigue eligiendo el informe por símbolo.** Con ocho PEPE o dos STONK,
   devuelve el de la carpeta que coincida de nombre. La web avisa cuando la cadena que vuelve
   no es la elegida, pero eso es un parche.
2. **`registrada_reciente(simbolo)` también va por símbolo.** Dos monedas homónimas comparten
   el veredicto de analizabilidad: la grande puede heredar el «no» de la pequeña, o al revés.
   Debería ir por contrato cuando lo haya.
3. **No hay lectura rápida para monedas de fuera del universo.** Hoy se muestran las medidas de
   `/analizable`, que ya es bastante. Si el motor pudiera calcular las cinco señales
   (qué mueve el precio, caídas, concentración, si el token cobra, salida) sin un análisis
   completo, la lectura gratis valdría para cualquier moneda y no sólo para las ya analizadas.

---

# 11. El informe de cliente en cinco secciones  ·  coordinación

Decidido por Pablo el 2026-09-19: el motor exporta **cinco secciones fijas más un bloque
Avanzado**. Esto reemplaza al `narrado` de §9.4, que queda absorbido aquí.

| # | Sección | Qué responde |
|---|---|---|
| 1 | **Qué pasó** | El hecho concreto y datado que hace que esta moneda esté sobre la mesa |
| 2 | **Nuestra lectura** | El veredicto en una línea, y en qué se apoya |
| 3 | **Lo que el resto no ve** | El hallazgo propio: lo que sale de mirar donde nadie mira |
| 4 | **Niveles** | Precio hoy, máximo, y los rangos de los escenarios con su plazo |
| 5 | **Qué vigilar y qué invalida** | La señal a seguir y el número exacto que tumba la tesis |
| — | **Avanzado** | Todo lo actual: varas, asimetría, riesgo de cola, microestructura, notas de método |

## 11.1 Las tres reglas que gobiernan las cinco secciones

1. **Escritas para el cliente, en español neutro con tuteo.** Sin vocabulario de taller. La
   lista de lo que hoy se cuela está en `PATRONES-PROSA-MOTOR.md`, medida sobre 70 informes.
2. **Lo que no aplica no viene.** Si una sección no tiene nada verdadero que decir para esta
   moneda, **se omite el campo entero**. Nada de `n/d`, `null`, `"no se pudo"`, `"dato ausente"`
   ni `"calidad parcial"`. La web oculta la sección y no deja hueco.
3. **Las notas de método van a Avanzado.** *Student-t, bootstrap, skew, adapter, ventana
   observada, VaR₉₅* y demás no son riesgos de la moneda: son cómo se midió. Hoy salen mezcladas
   en las advertencias y acaban en «Lo que podría salir mal».

## 11.2 Forma propuesta

```json
"informe_cliente": {
  "que_paso":  { "titular": "…", "parrafos": ["…"], "cuando": "2026-09-11", "fuentes": [{"url":"…","fecha":"…"}] },
  "lectura":   { "veredicto": "…una línea…", "parrafos": ["…"], "apoyos": [{"que":"…","cifra":"13.066.866 USD","periodo":"30 d","fuente_url":"…"}] },
  "hallazgo":  { "titular": "…", "parrafos": ["…"], "por_que_no_se_ve": "…" },
  "niveles":   { "precio_usd": 0.301029, "fecha": "2026-09-19",
                 "maximo": { "valor_usd": 0.342971, "fecha": "2026-09-11" },
                 "escenarios": [{ "nombre":"…", "min_x":1.14, "max_x":1.14, "dias":90, "condicion":"si…" }],
                 "serie": [{ "t":"2026-08-04", "c":0.21, "v":1234567 }] },
  "vigilar":   { "senal": "…", "cada": "semanal", "fuente_url": "…" },
  "invalida":  { "condicion": "…", "cifra": 6243666, "unidad": "USD", "plazo": "próxima medición", "fuente_url": "…" },
  "riesgos":   [ "…riesgo real, en palabras normales…" ]
}
```

Todo campo es opcional salvo `lectura.veredicto`. **Ausente significa «no aplica».**

## 11.3 Lo que hace falta para el gráfico de Niveles  ·  HUECO

La pantalla de Niveles lleva un **gráfico de precio con el máximo histórico marcado y las zonas
de volumen**. Hoy no se puede dibujar: el informe **no trae ninguna serie temporal**.

Lo que sí trae, y con lo que la web ya puede construir una escala de niveles sin serie:

| Dato | En STONK |
|---|---|
| `ficha_esencial.precio_y_fecha_referencia` | 0,301029 USD el 2026-09-19 |
| `varas.reflexiva.maximo_valor` / `maximo_fecha` | 0,342971 USD el 2026-09-11 |
| `varas.reflexiva.fraccion_del_maximo` | 88 % del máximo |
| `escenarios[].rango_min` / `rango_max` / `horizonte_dias` | 1,14x – 1,14x en 90 días |
| `analizabilidad.medidas.dias_precio` | 47 días |

**Lo que falta:** `niveles.serie`, una fila por día con fecha, cierre y volumen. Con 90 días
basta. Sin eso, la web dibuja la escala de niveles (precio, máximo y rangos) y **no** finge una
línea de precio, porque una línea inventada es una cifra inventada.

## 11.4 Un detalle de los escenarios

`escenarios[]` no trae `nombre` ni `probabilidad`: trae `tipo` (`bull_reflexivo`), que es
vocabulario interno, y rangos iguales en mínimo y máximo (`1.1393` – `1.1393`), que en pantalla
se lee como un rango que no es rango. Para la sección Niveles hacen falta un **nombre legible**
y, si existe, la **probabilidad**; y si el mínimo y el máximo coinciden, decirlo como un solo
número y no como un intervalo.

---

# 12. Vigencia de un informe en la bandeja

Pablo pidió que la bandeja muestre por defecto sólo lo vigente, una tarjeta por moneda, con
un filtro aparte para el historial. La web ya lo hace.

## 12.1 El campo que la web espera

En cada registro de `gema.jsonl` y `analisis.jsonl`:

```json
"vigente": true
```

`true` si es el informe que vale hoy para esa moneda; `false` si es historial. La web usa ese
campo en cuanto exista. Vale también `"obsoleto": true` como forma negativa.

**Mientras no llegue**, la web lo deduce: de cada moneda vale el registro escrito más
recientemente, y uno con `reclasificado_a` nunca vale. Sobre los datos de hoy, eso reduce la
bandeja de 118 registros a 37 tarjetas, una por moneda.

## 12.2 Marca de informe de cinco secciones

Cada tarjeta dice si el registro trae `informe_cliente.lectura.veredicto` (contrato §11). Hoy lo
traen 39 de 118. No hace falta nada del motor: se lee del propio registro.

## 12.3 Dos registros comparten identificador  ·  HUECO

Cuando una gema se reclasifica a análisis, **los dos registros conservan el mismo `id`**. Por
ejemplo `AKE-20260918-041146` existe como gema (con `reclasificado_a: "analisis"`) y como
análisis. Hoy hay **diez** casos.

Eso rompe cualquier cosa que identifique un informe sólo por su `id`. En la web causaba dos
fallos, ya corregidos añadiendo el tipo a la clave:

- El estado de publicación se leía compartido: aprobar el análisis marcaba también la gema.
- La ruta de decisión resolvía por `id` y podía actuar sobre el registro equivocado.

**Lo que hace falta del motor:** que un identificador designe un único registro. Si una
reclasificación crea un registro nuevo, que lleve identificador nuevo y que el viejo apunte al
nuevo. Mientras tanto la web usa `id` + `tipo`, que funciona pero es un parche sobre algo que
debería ser único por definición.

## 15. Forma única de cada campo  ·  ACUSE DE RECIBO

El motor añadió esta sección el 21-sep-2026 con siete cambios. Aquí queda **qué
hizo la web con cada uno**, para que ninguno se dé por aplicado sin estarlo.

| # | Lo que fija el motor | Lo que hizo la web |
|---|---|---|
| 1 | `onchain.entidades_etiquetadas` siempre objeto | El informe ya lo toleraba desde el arreglo de la pantalla en blanco. **La tolerancia se queda**: los obsoletos no se reexportaron y siguen trayendo `[]`, y la bandeja los enseña con el filtro de historial. |
| 2 | `escenarios[].evidencia_citada` siempre texto | Ya estaba tipado `string` y se pinta tal cual. Sin cambio. |
| 3 | `derivados` siempre presente, con `medido: false` | La web no lee ese campo. Sin cambio. |
| 4 | `asimetria`, `asimetria_liquidaciones`, `prosa`, `narrado`, `derivados` con todas sus claves | El informe ya decide por `niveles.<sección>.disponible`, no por si la clave está. Sin cambio. |
| 5 | `informe_cliente`: sección que no aplica = `null`, nunca ausente; `disponible: bool`; `lectura` siempre | Tipos al día (`\| null` explícito) y la marca de cinco secciones pasa a leer `disponible`, con el veredicto como respaldo para los registros viejos. |
| 6 | `null` sólo donde la tabla lo dice; lista vacía es `[]` | Nada que adaptar. |
| 7 | Vigentes reexportados con versión nueva | **Ojo:** cada reexportación sube `version_registro`, y una aprobación de la bandeja vale para la versión que aprobó. Los informes vuelven a `nueva_version` y hay que aprobarlos otra vez. |

**Por qué el punto 5 no obligó a tocar el render.** Las cinco secciones ya
degradaban solas: `null` es falso igual que ausente, y cada sección cae a su
dato de ficha. Un informe sin narrado enseña tesis, niveles e invalidación en
vez de cinco cajas vacías.

### 15.1 Lo que la web pide al motor  ·  ABIERTO

1. **El decimal y el signo de porcentaje.** En texto de cliente van con coma
   decimal y espacio duro antes del signo: «+1,2 %», no «+1.2%». Afecta al
   escenario condicional de la agenda, al informe del narrador y a cualquier
   prosa con cifras. Hay un cambio preparado en el repositorio del motor,
   pendiente de que esa sesión lo revise y lo commitee: formateador único,
   80 porcentajes convertidos, y la batería de tests sin regresiones (10
   fallos antes, 10 después, 1222 pasan).
2. **Un aviso cuando una reexportación suba la versión de un informe ya
   aprobado.** Hoy la web no distingue «versión nueva porque cambió el
   análisis» de «versión nueva porque se reexportó con otra forma», y en las
   dos el informe desaparece del sitio público hasta que alguien lo vuelva a
   aprobar. Basta un campo en `cambios_respecto_version_anterior` que diga que
   el cambio fue de forma y no de contenido.
