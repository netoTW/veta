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

## 14. Vigencia de los informes (2026-09-21)

La bandeja mezclaba corridas de calibración con las del sistema actual y monedas repetidas.
Desde hoy cada registro de `gema` y `analisis` lleva dos campos más:

| campo | valores | qué significa |
|---|---|---|
| `vigencia` | `vigente` · `obsoleto` · `""` | `vigente`: la corrida que representa a la moneda hoy. `obsoleto`: se conserva en el historial y **la web no lo muestra por defecto**. Vacío sólo en registros anteriores a esta regla. |
| `motivo_vigencia` | texto | por qué: "superada por <id>", "anterior al corte 07b27ad (2026-09-19T15:54 UTC)", "el rol X no corrió en claude-opus-5", "calibración: la carpeta del informe no existe en esta máquina". |

**Regla (la decide el motor, `pipeline/vigencia.py`, nunca a mano):** es vigente la corrida
más reciente de cada moneda hecha con el código posterior a los arreglos del 19-sep (A1 + A2 +
B1/C1, desplegados con `07b27ad` a las 15:54 UTC) y con todos los roles de análisis en Opus.
Una corrida detenida o bloqueada puede ser la vigente de su moneda (es lo último que el motor
dijo de ella); en ese caso `veredicto.decidido_por`/`riesgo.motivo_bloqueo` dicen por qué no
es publicable. La vigencia se recalcula sola al cerrar cada análisis (misma exportación
automática del hueco 37): la corrida nueva pasa a vigente y la anterior de esa moneda a
obsoleta, como una versión nueva del registro (`version_registro` + 1, con el cambio en
`cambios_respecto_version_anterior`).

**Lo que la web hace con esto:** listar por defecto sólo `vigencia == "vigente"`; ofrecer el
historial (obsoletos) como vista aparte, si quiere. Un registro sin el campo se trata como
vigente (es anterior a la regla). La aprobación de Pablo sigue viviendo en la bandeja del
motor: `vigente` no significa aprobado.

### 13.1 Cambios del 2026-09-21 en noticias y agenda

- **Agenda persistida.** La corrida diaria escribe el resultado completo de `engine/agenda.py::construir()` en `base_contenido/noticias/agenda.json` y lo reescribe tras cada decisión de la bandeja. Sólo eventos de hoy en adelante; los pasados salen del archivo. `GET /agenda` sigue calculando en vivo con el mismo código.
- **Fuentes: 403/429 ≠ 404/410.** Cada fuente de una pieza sale en `fuentes_casos` con su `caso`: `abre` (HTTP 200), `muerta` (404/410, se rechaza siempre), `bloqueada_aceptada` (403/429 o dominio de la lista bloqueada, aceptada porque la URL vino de los resultados de búsqueda del agente —`en_busqueda: true`— y otra fuente de la misma pieza abre —`respaldada_por`—), `bloqueada_rechazada` (sin búsqueda o sin respaldo), `no_responde`, `fuera_de_plazo`, `sin_fecha`, `url_invalida`. `fuentes` lista sólo las aceptadas.
- **Cifras.** `cifras_verificadas` (con el valor del motor y `ok`) y `cifras_no_verificadas` (con su motivo) viajan siempre, también en las publicadas.


## 15. Forma única de cada campo (2026-09-21) — AVISO A VETA

**Qué pasó.** `onchain.entidades_etiquetadas` llegaba como lista vacía `[]` cuando la moneda no
tenía entidades etiquetadas y como objeto cuando sí. Eso rompió seis informes en la web (AKT,
APT, BERA, CELO). La web ya lo tolera; el contrato pasa a tener una sola forma por campo.

**Qué cambia para la web (VETA), desde el commit que incluye esta sección:**

1. `onchain.entidades_etiquetadas` (y su copia en `niveles.onchain.avanzado`) es **siempre un
   objeto** `{n_etiquetadas, n_sin_etiquetar, por_tipo: {}, entidades: [], fuente: ""}`; con
   ceros y vacíos cuando no hay datos.
2. `escenarios[].evidencia_citada` es **siempre texto** (llegaba número en 6 escenarios).
3. `derivados` está **siempre presente** (faltaba en registros anteriores al 20-sep) y lleva
   `medido: false` con el resto de sus claves vacías cuando la corrida no consultó venues.
4. `asimetria`, `asimetria_liquidaciones`, `prosa`, `narrado` y `derivados` llevan **todas sus
   claves siempre**; sin datos, con `null`/`""`/`[]`/`{}` según el tipo.
5. `informe_cliente` cambia la convención de §11.5 ("campo ausente = no aplica"): ahora
   **una sección que no aplica viene como `null`** (objetos) o `[]` (listas), nunca ausente,
   y hay `disponible: bool` (`false` cuando no hubo narrado publicable). `lectura` siempre viene.
6. `null` sólo aparece donde la tabla dice `|null` (escalar sin dato). Una lista vacía es `[]`.
7. Los registros vigentes se reexportaron con esta forma (versión nueva de cada uno, con
   `cambios_respecto_version_anterior`). Los obsoletos no se tocan.
8. `combustible` (§D.20) está **siempre presente con `estado`**: `estimado` cuando hay lectura
   (es un modelo, nunca `medido`) o `no_disponible` con `motivo_ausencia` no vacío. Un paquete
   sin lectura de combustible sale `no_disponible` con «no medido en esta corrida», nunca `{}`.
   `validar_combustible` lo comprueba dentro de `Gema.validar()`; un registro anterior al campo
   (`estado` vacío) sólo se valida por forma.

**Validación al cierre.** `contrato/forma.py::validar_forma` corre dentro de `Gema.validar()`:
un registro que no cumple la forma no entra al contrato, el rechazo queda en
`base_contenido/exportacion-rechazos.jsonl` y sale como alerta `contrato_rechazado` en
`/operacion/estado`. Las tablas de abajo se generan con `python -m contrato.forma --md` y un
test comprueba que estén al día.

<!-- forma:inicio -->
**Primer nivel**

| campo | forma |
|---|---|
| `id` | str |
| `tipo` | str |
| `version_motor` | str |
| `version_registro` | num |
| `escrito_en` | str |
| `simbolo` | str |
| `nombre` | str |
| `cadena` | str |
| `fecha_publicacion` | str |
| `origen` | str |
| `vigencia` | str |
| `motivo_vigencia` | str |
| `misma_corrida` | bool |
| `cambios_respecto_version_anterior` | objeto de claves fijas |
| `tier` | str |
| `categoria` | str |
| `factores_del_tier` | list[str] |
| `factores_del_tier_detalle` | list[dict] (elementos de claves fijas) |
| `estado_economico` | str |
| `captura_verificada` | bool |
| `ficha_esencial` | objeto de claves fijas |
| `tesis` | str|null |
| `motivo_sin_tesis` | str |
| `motivo_sin_tesis_cliente` | str|null |
| `analizabilidad` | objeto de claves fijas |
| `analizable` | bool|null |
| `motivo_no_analizable` | str|null |
| `tesis_contradicha` | str |
| `prosa` | objeto de claves fijas |
| `invalidacion` | objeto de claves fijas |
| `varas` | objeto de claves fijas |
| `combustible` | objeto de claves fijas |
| `derivados` | objeto de claves fijas |
| `asimetria_liquidaciones` | objeto de claves fijas |
| `escenarios` | list[dict] (elementos de claves fijas) |
| `asimetria` | objeto de claves fijas |
| `riesgo` | objeto de claves fijas |
| `microestructura` | objeto de claves fijas |
| `onchain` | objeto de claves fijas |
| `fundamentales` | objeto de claves fijas |
| `esceptico` | objeto de claves fijas |
| `verificador` | objeto de claves fijas |
| `senales_sin_fuente` | list[dict] (elementos de claves fijas) |
| `calidad_por_seccion` | dict |
| `fuentes` | list[dict] (elementos de claves fijas) |
| `apto_para_gemas` | bool |
| `estado_seguimiento` | str |
| `motivo_retiro` | str |
| `retirada_en` | str |
| `conflicto_interes` | objeto de claves fijas |
| `solo_admin` | bool |
| `integridad` | objeto de claves fijas |
| `benchmark_al_publicar` | objeto de claves fijas |
| `niveles` | objeto de claves fijas |
| `narrado` | objeto de claves fijas |
| `informe_cliente` | objeto de claves fijas |
| `veredicto` | objeto de claves fijas |
| `ruta_informe` | str |

**`cambios_respecto_version_anterior`**

| clave | forma |
|---|---|
| `solo_forma` | bool |
| `campos_contenido` | list[str] |
| `detalle` | list[str] |

**`factores_del_tier_detalle[]`**

| clave | forma |
|---|---|
| `condicion` | str |
| `estado` | str |
| `op` | str |
| `umbral` | num|null |
| `unidad` | str |
| `valor` | num|null |

**`ficha_esencial`**

| clave | forma |
|---|---|
| `tesis_una_linea` | str |
| `precio_y_fecha_referencia` | dict |
| `riesgo_resumen` | str |
| `catalizadores` | list[str] |
| `catalizadores_resumen` | dict |
| `que_la_invalidaria` | str |
| `advertencias` | list[dict] |

**`analizabilidad`**

| clave | forma |
|---|---|
| `analizable` | bool |
| `cumple` | dict |
| `es_nativa` | bool |
| `evaluado_en` | str |
| `faltantes` | list[dict] |
| `medidas` | dict |
| `simbolo` | str |

**`prosa`**

| clave | forma |
|---|---|
| `vigente` | bool|null |
| `motivo` | str |
| `accion` | str |
| `campos_cambiados` | list[dict] |
| `cifras_contradichas` | list[dict] |
| `estilo_ok` | bool|null |
| `huella_actual` | dict |
| `huella_al_escribir` | dict |
| `marcada_en` | str |
| `violaciones_de_estilo` | list[dict] |

**`invalidacion`**

| clave | forma |
|---|---|
| `campo` | str |
| `direccion` | str |
| `evaluable` | bool |
| `motivo_no_evaluable` | str |
| `origen` | str |
| `texto` | str |
| `umbral` | num|null |
| `unidad` | str |
| `ventana_dias` | num|null |

**`varas`**

| clave | forma |
|---|---|
| `advertencias` | list[dict] |
| `reflexiva` | dict |
| `revenue` | dict |

**`combustible`**

| clave | forma |
|---|---|
| `calibrado` | bool |
| `confianza` | str |
| `hay_combustible` | bool |
| `indica` | str |
| `lado_dominante` | str |
| `lectura` | str |
| `motivo_ausencia` | str |
| `no_produce_magnitud` | bool |
| `notional_corto` | num|null |
| `notional_largo` | num|null |
| `squeeze_setup` | bool |
| `venues` | list[str] |
| `estado` | str |
| `fuente` | str |

**`derivados`**

| clave | forma |
|---|---|
| `medido` | bool |
| `hay_perp` | bool|null |
| `no_aplica` | bool|null |
| `declaracion` | str |
| `por_venue` | dict |
| `venues_consultados` | list[str] |
| `venues_respondieron` | list[str] |
| `venues_con_perp` | list[str] |
| `venues_caidos` | dict |
| `venues_otro_activo` | dict |

**`asimetria_liquidaciones`**

| clave | forma |
|---|---|
| `disponible` | bool |
| `ratio_long_short` | num|null |
| `lado_ejecutado` | str |
| `ventana_dias` | num|null |
| `dias_de_serie` | num|null |
| `lectura` | str |
| `motivo` | str |
| `fuente` | str |

**`escenarios[]`**

| clave | forma |
|---|---|
| `tipo` | str|null |
| `rango_min` | num|null |
| `rango_max` | num|null |
| `catalizador` | str|null |
| `catalizador_datado` | bool |
| `evidencia_citada` | str |
| `horizonte_dias` | num|null |
| `horizonte_nivel` | num|null |
| `confianza_horizonte` | str|null |
| `magnitud_origen` | str|null |
| `invalidacion` | str|null |

**`asimetria`**

| clave | forma |
|---|---|
| `dato` | str |
| `motivo` | str |
| `no_calculable_motivo` | str |
| `ratio` | num|null |
| `horizonte` | num|null |
| `confianza` | str|null |
| `recompensa` | num|null |
| `riesgo` | num|null |
| `recompensa_origen` | str|null |
| `riesgo_origen` | str|null |
| `vara_origen` | str|null |
| `regla` | str |
| `advertencias` | list[dict] |

**`riesgo`**

| clave | forma |
|---|---|
| `advertencias` | list[dict] |
| `confianza` | str |
| `cvar95_1d` | num|null |
| `cvar95_1d_empirico` | num|null |
| `cvar95_7d` | num|null |
| `cvar95_7d_bootstrap` | num|null |
| `dias_serie` | num|null |
| `empirico_vs_parametrico` | str |
| `limites_declarados` | list[str] |
| `metodo` | str |
| `nu` | num|null |
| `peor_dia_ventana` | num|null |
| `sigma_anualizada` | num|null |
| `timestamp` | str |
| `var95_1d` | num|null |
| `var95_1d_empirico` | num|null |
| `var95_7d` | num|null |

**`microestructura`**

| clave | forma |
|---|---|
| `advertencias` | list[dict] |
| `condiciones_perp_driven` | list[dict] |
| `fs` | num|null |
| `fs_24h` | num|null |
| `fs_30d` | num|null |
| `fs_7d` | num|null |
| `funding_actual` | num|null |
| `funding_percentil` | num|null |
| `lectura` | str |
| `liquidaciones` | num|null |
| `liquidez_spot_2pct_usd` | num|null |
| `liquidez_spot_sobre_oi` | num|null |
| `long_short` | num|null |
| `long_short_top_traders` | num|null |
| `oi_mcap` | num|null |
| `squeeze_setup` | bool |

**`onchain`**

| clave | forma |
|---|---|
| `advertencias` | list[dict] |
| `concentracion_top10_neta` | num|null |
| `concentracion_top50` | num|null |
| `cota_superior` | bool |
| `entidades_etiquetadas` | objeto de claves fijas |
| `hhi` | num|null |
| `hhi_etiqueta` | str|null |
| `lectura` | str |
| `n` | num|null |
| `naturaleza` | str|null |
| `netflows` | list |
| `nota_cota` | str |
| `supply_referencia` | num|null |

**`fundamentales`**

| clave | forma |
|---|---|
| `advertencias` | list[dict] |
| `captura_verificada` | bool |
| `estado_economico` | str |
| `github` | dict |
| `mecanismo_captura` | dict |
| `puntaje_total` | num|null |
| `revenue_a_holders` | num|null |
| `revenue_protocolo` | num|null |
| `revenue_protocolo_30d` | num|null |
| `revenue_sobre_mcap` | num|null |
| `rubrica` | list[dict] |
| `tvl` | num|null |
| `unlocks` | dict |
| `via_captura` | str |

**`esceptico`**

| clave | forma |
|---|---|
| `objeciones` | list[dict] |
| `veredicto_bull` | str |
| `comparables_son_comparables` | bool|null |
| `catalizador_tiene_fecha` | bool|null |
| `rechaza` | bool |
| `motivo_rechazo` | str |
| `motivo_rechazo_cliente` | str|null |

**`verificador`**

| clave | forma |
|---|---|
| `estado` | str |
| `reconsultas` | list[dict] |
| `hallazgos` | list |
| `motivo_bloqueo` | str |
| `motivo_bloqueo_cliente` | str|null |

**`senales_sin_fuente[]`**

| clave | forma |
|---|---|
| `campo` | str |
| `motivo` | str |

**`fuentes[]`**

| clave | forma |
|---|---|
| `campo` | str |
| `calidad` | str |
| `timestamp` | str |

**`conflicto_interes`**

| clave | forma |
|---|---|
| `hay` | bool |
| `quien` | str |
| `declarado_en` | str |
| `texto` | str |

**`integridad`**

| clave | forma |
|---|---|
| `no_disponibles` | list[dict] (elementos de claves fijas) |
| `retiradas` | list[dict] (elementos de claves fijas) |
| `sin_verificar` | list[dict] (elementos de claves fijas) |

**`benchmark_al_publicar`**

| clave | forma |
|---|---|
| `advertencia` | str |
| `b1_composicion` | list[str] |
| `b1_detalle` | dict |
| `b1_n` | num|null |
| `b1_nota` | str |
| `b2_parametros` | dict |
| `congelado_en` | str |
| `definicion` | dict |
| `estado_definicion` | str |
| `precio_gema_al_publicar` | num|null |
| `simbolo` | str |

**`niveles`**

| clave | forma |
|---|---|
| `asimetria` | dict |
| `combustible` | dict |
| `escenarios` | dict |
| `fundamentales` | dict |
| `microestructura` | dict |
| `onchain` | dict |
| `riesgo` | dict |
| `varas` | dict |

**`narrado`**

| clave | forma |
|---|---|
| `disponible` | bool |
| `publicable` | bool|null |
| `escrito_en` | str |
| `vueltas` | num|null |
| `veredicto` | dict |
| `motivo` | str |

**`informe_cliente`**

| clave | forma |
|---|---|
| `disponible` | bool |
| `que_paso` | dict|null |
| `lectura` | objeto de claves fijas |
| `hallazgos` | list[dict] |
| `hallazgo` | dict|null |
| `niveles` | dict|null |
| `vigilar` | dict|null |
| `invalida` | dict|null |
| `riesgos` | list[str] |
| `avanzado` | dict|null |

**`veredicto`**

| clave | forma |
|---|---|
| `base` | str |
| `condicion_invalidacion` | str |
| `decidido_por` | str |
| `direccion` | str |
| `estado_economico` | str |
| `horizonte_dias` | num|null |
| `ratio_asimetria` | num|null |
| `tier` | str |

**`onchain.entidades_etiquetadas`**

| clave | forma |
|---|---|
| `n_etiquetadas` | num |
| `n_sin_etiquetar` | num |
| `por_tipo` | dict |
| `entidades` | list[dict] |
| `fuente` | str |

**`integridad.no_disponibles[]`**

| clave | forma |
|---|---|
| `que` | str |
| `motivo_cliente` | str |

**`integridad.retiradas[]`**

| clave | forma |
|---|---|
| `que` | str |
| `seccion` | str |
| `cifra` | str |
| `motivo_interno` | str |

**`integridad.sin_verificar[]`**

| clave | forma |
|---|---|
| `que` | str |
| `fuente` | str |
| `seccion` | str |
| `cifra` | str |

**`informe_cliente.lectura`**

| clave | forma |
|---|---|
| `veredicto` | str |
| `direccion` | str|null |
| `horizonte_dias` | num|null |
| `parrafos` | list[str] |
| `decidido_por` | str |
<!-- forma:fin -->

### 15.1 Una reexportación no es una corrida nueva — AVISO A VETA (2026-09-21)

Al reexportar los 14 vigentes con la forma de §15 la web perdió las aprobaciones de la
bandeja y el sitio quedó vacío. Regla desde hoy:

- Una reexportación por cambio de contrato (forma, vigencia, reclasificación, narrado sobre
  el paquete guardado) **conserva el `id` del análisis** y escribe una versión nueva del
  mismo registro (`version_registro` + 1) con **`misma_corrida: true`**.
- `misma_corrida: false` sólo en la primera versión de una corrida (id nuevo = análisis
  nuevo, con agentes).
- VETA ata la aprobación al `id`: una versión nueva con `misma_corrida: true` la conserva.
  Sólo un `id` nuevo vuelve a la bandeja de aprobación.
- Regla operativa del motor: **antes de cualquier reexportación masiva se avisa a Pablo**.
  Las reexportaciones que dispara el cierre de un análisis (una moneda por vez) siguen
  siendo automáticas.

**Forma o contenido (segundo aviso del 21-sep).** `misma_corrida: true` dice que es la misma
corrida, no si cambió lo que dice el informe. Por eso `cambios_respecto_version_anterior`
pasa de lista a objeto:

```json
{"solo_forma": true, "campos_contenido": [], "detalle": ["onchain", "derivados"]}
{"solo_forma": false, "campos_contenido": ["tier", "veredicto", "informe_cliente"], "detalle": ["..."]}
```

- `solo_forma: true`: las dos versiones, normalizadas (claves vacías completadas, `[]`
  frente a `{}` vacío, un número escrito como texto), dicen lo mismo. La web NO avisa a
  Pablo en la bandeja; la aprobación se conserva.
- `solo_forma: false`: `campos_contenido` lista los campos de primer nivel cuyo contenido
  cambió (`tier`, `veredicto`, `informe_cliente`, `escenarios`…). La web avisa a Pablo.
- `detalle` conserva la lista de campos con diferencia literal (lo que antes era la lista).
- No cuentan como contenido: `version_motor`, `version_registro`, `escrito_en`, `vigencia`,
  `motivo_vigencia`, `misma_corrida`, `reclasificado_a`.
- La primera versión de una corrida trae `{"solo_forma": false, "campos_contenido": [], "detalle": []}`.

## 16. Invalidaciones: tres estados y cierres revocables (2026-09-21) — AVISO A VETA

**Qué pasó.** PUMP apareció públicamente con la tesis ROTA el 21-sep. La medición diaria leía
`defillama:/summary/fees/pumpswap?dataType=dailyHoldersRevenue`, que devuelve 0 porque DeFiLlama
atribuye todo el revenue a holders al producto `pump.fun`, mientras el umbral de 24.881.207 USD
se construyó sobre la entidad completa. CAKE tenía el mismo fallo con nueve productos. Los dos
cierres quedaron revocados.

**Lo que cambia para la web:**

1. `seguimiento_diario` lleva cuatro campos nuevos: `dato_confiable` (bool), `motivo_no_confiable`
   (texto), `pendiente_confirmacion` (bool) y `lecturas_que_cruzan` (entero).
2. Una lectura tiene **tres** estados, no dos. Puede cruzar el umbral y NO activar la
   invalidación: porque el dato no es confiable (cero contra un umbral positivo, dato ausente,
   caída de más del 80 % en un día) o porque falta la segunda lectura que lo confirme. La web
   sigue leyendo `invalidacion_activada` para decir "tesis rota"; `pendiente_confirmacion` y
   `dato_confiable: false` se pueden mostrar, pero **no** son una tesis rota.
3. Los cierres del `ledger` (`id` que empieza con `cierre:`) llevan `revertido` (bool) y
   `motivo_revocacion` (texto). **Un cierre con `revertido: true` no cuenta como cerrado**: la
   web no lo muestra como tesis rota ni cierra el seguimiento.
4. Ya revocados, con su motivo en el registro: `cierre:PUMP-20260919-205724` y
   `cierre:CAKE-20260919-182420`.

**Regla del motor.** Una invalidación se activa sólo con el dato confirmado en dos lecturas de
días distintos, y nunca con un dato que el motor declaró no confiable. Una lectura descartada se
reintenta en el acto y sale como alerta `dato_no_confiable` en `/operacion/alertas`; un cruce sin
confirmar sale como `invalidacion_pendiente_confirmacion`. Nada se calla: una invalidación
posible se avisa aunque no se active.

## 17. Tesis retirada del seguimiento público (2026-09-21) — AVISO A VETA

`estado_seguimiento` admite un valor más: **`retirado`**, con `motivo_retiro` (texto) y
`retirada_en` (fecha ISO). Una gema retirada **sale del track record y del marcador públicos**
y sigue visible en admin. No se borra nada: el informe, su historial y sus mediciones quedan en
la base, y el cron deja de medirla.

| estado_seguimiento | la web la muestra en… |
|---|---|
| `en_seguimiento` | track record público, marcador y admin |
| `sin_seguimiento` | admin (nunca entró al seguimiento: sin tesis o no apta) |
| `retirado` | **sólo admin**, con `motivo_retiro` a la vista |

**Primera retirada, decisión de Pablo del 21-sep:** `PUMP-20260919-205724`, con motivo «regla de
invalidación sin margen: el umbral era igual al valor al publicar; defecto del Redactor
corregido antes del lanzamiento». El track record público empieza con el lanzamiento y PUMP
queda como calibración previa.

## 18. Tesis publicada: no se toca. Y el umbral tiene margen (2026-09-21) — AVISO A VETA

**Regla cerrada, desde el lanzamiento: una tesis publicada no se modifica.** Ni el umbral de
invalidación, ni el plazo, ni el texto de la condición. Si la lectura cambia, se publica un
análisis nuevo con su propio `id`; el anterior se retira (§17) o se cierra, y las dos versiones
quedan en el historial. El motor no reescribe una tesis viva, y la web tampoco debe ofrecerlo.

**Margen del umbral.** Una condición de invalidación tiene que quedar FUERA de la banda que la
métrica recorrió de verdad. La banda se observa, no se inventa: son los valores que la métrica
tomó día a día en los últimos 30 días, medidos con la misma ventana con la que se compara. El
motor lo comprueba antes de publicar y **bloquea el informe** si el umbral cae dentro de la
banda. El registro lo dice en `invalidacion.margen`:

| campo | qué trae |
|---|---|
| `comprobado` | si el motor pudo medir la banda |
| `cumple` | si el umbral queda fuera de la banda |
| `banda_observada` | `{min, max, n_dias, fuente, ventana_dias}` |
| `margen` | distancia relativa entre el umbral y el extremo de la banda |
| `como_se_fijo` | la frase que explica cómo se fijó, para mostrar en el informe |
| `motivo` | por qué no cumple, cuando no cumple |

**Nombres de sección.** Cada sección de `niveles` trae `titulo_cliente` además de `seccion`. La
clave `seccion` no cambia nunca (es el identificador del contrato); **el título que se muestra
al cliente es `titulo_cliente`**. En particular `varas` se muestra como **«Dos referencias»**.
Los otros: escenarios → «Escenarios», asimetria → «Riesgo y recompensa», riesgo → «Riesgo de
caída», microestructura → «Cómo se mueve el precio», onchain → «Quién tiene el token»,
fundamentales → «El negocio», combustible → «Posiciones apalancadas».

**Múltiplos.** Los múltiplos de los escenarios («2,62x – 3,10x») salen del texto de cliente y de
`informe_cliente`. Siguen en los campos de admin: `escenarios[].rango_min/rango_max` del registro
y `niveles.escenarios.avanzado`.

## 19. Conflicto de interés y visibilidad solo-admin (2026-09-21) — AVISO A VETA

Dos campos nuevos en `gema`/`analisis`:

| campo | forma | qué significa |
|---|---|---|
| `conflicto_interes` | `{hay, quien, declarado_en, texto}` | tenencia declarada del operador en esa moneda. Con `hay: true`, **el texto de la declaración tiene que mostrarse junto al informe, siempre** |
| `solo_admin` | bool | `true` cuando el informe está bloqueado por el Verificador **o** hay conflicto de interés. **La web no lo muestra a clientes en ninguna forma**; en la bandeja de admin sí, con la declaración a la vista |

La lista de monedas con tenencia declarada vive en `config/conflictos_interes.yaml` y la aplica
el motor al escribir el registro: un registro con `conflicto_interes.hay` y sin `texto`, o sin
`solo_admin`, **es rechazado por el contrato**. No depende de que nadie se acuerde.

`visuales` también trae `solo_admin` y `conflicto_interes`, con el mismo criterio.

**Primera moneda declarada:** SYN, tenencia del operador, declarada el 21-sep-2026.

## 20. Estados de un pedido e integridad del informe (2026-09-26) — AVISO A VETA

Escrito por el motor según la especificación de lanzamiento aprobada (§A.2, §A.3, §I.2). Reemplaza
lo que §5 decía de `bloqueado` y de los códigos de `fallido`.

### 20.1 Estados

| estado | cuándo | qué trae | cupo |
|---|---|---|---|
| `en_cola` | espera: tope de gasto (lo pone la web), cuota de la ventana, sesión del CLI, fuente de infraestructura caída o reintento | `inicio_estimado` (ISO o `null` si no hay estimación honesta), `puesto` (1 = el próximo), `motivo_cola` en llano, `requiere_admin` | reservado |
| `en_curso` | corriendo | `etapa`, `detalle`, `avance` como en §5 | reservado |
| `listo` | entregado, con sus huecos declarados | `resultado` (registro completo, con `integridad`) | se consume |
| `no_analizable` | ninguna fuente da precio; se detecta antes de gastar | `motivo_no_analizable` en llano | se devuelve |
| `fallido` | **sólo** cancelación | `fallo: {codigo: "cancelado", texto}` | se devuelve |

- **`bloqueado` no se emite nunca más.** El verificador corrige y el informe se entrega.
- **El reloj es del motor.** Un pedido sin latido 15 min o con más de 3 h vuelve a `en_cola` y se
  relanza una vez; si vuelve a fallar queda `en_cola` con `requiere_admin: true` (el cliente lo
  ve en cola, sin hora estimada) y admin recibe la alerta. La web no cierra pedidos por tiempo.
- **Cancelar:** `POST /cancelar/:id`. Sólo se cancela lo que no terminó (409 si ya terminó).
- **`/progreso/:id`** devuelve sólo los campos públicos: `solicitud_id, estado, etapa, avance,
  detalle, etapas_hechas, iniciado, actualizado, terminado, costo_real_usd, resultado, fallo,
  verificador, inicio_estimado, puesto, requiere_admin, motivo_cola, motivo_no_analizable`. Con el
  token de operación, además, lo interno.

### 20.2 Integridad

Cada registro `gema`/`analisis` trae:

```json
"integridad": {
  "no_disponibles": [{"que": "GPUs en la red", "motivo_cliente": "no pudimos confirmar este dato en su fuente original, así que no lo usamos"}],
  "retiradas":      [{"que": "…frase…", "seccion": "advertencias", "cifra": "12.400", "motivo_interno": "…"}],
  "sin_verificar":  [{"que": "calendario de desbloqueos", "fuente": "obtenido de docs.x.io, sin verificar", "seccion": "tokenomics", "cifra": "15 %"}]
}
```

- **`retiradas` es sólo de admin.** El texto de cliente ya no contiene esas frases; la web no las
  muestra al cliente. Si la cifra retirada era un dato, el mismo dato aparece en
  `no_disponibles` con su `motivo_cliente`, y eso sí se puede mostrar.
- **`sin_verificar` es sólo para datos sin API** (desbloqueos, tokenomics, asignaciones) que el
  buscador trajo y cuya página no se pudo leer. En la prosa van con la marca `⟦sv:<índice>⟧`, que
  la web convierte en nota («obtenido de [fuente], sin verificar»).
- **Sin tesis:** si una cifra que sostenía la tesis se retira, o la invalidación no deja un umbral
  válido, el registro sale con `tesis: null` y `motivo_sin_tesis_cliente`; una gema baja a
  `analisis`. `verificador.estado` es `pasa`, `corregido` o (en registros viejos) `bloqueado`.
- El detalle interno de cada corrección (`correcciones`) queda en `verificador.json` del informe,
  no en el registro.

## 21. Ficha determinista de cualquier moneda: `POST /ficha` (2026-09-26) — AVISO A VETA

La foto de una moneda en cinco bloques, sin agentes, sin tesis y sin veredicto: lo que «Analiza tu
moneda» muestra gratis. Funciona para **cualquier moneda que se pueda resolver**, esté o no en el
universo: no lee `reports/`. Cumple lo pedido en el §4 de la especificación de VETA y lo aprobado en
§I.2 de la del motor. Código: `engine/ficha.py`; forma: `contrato/forma.py`
(`FORMA_FICHA`, `validar_dato_ficha`, `validar_ficha`); ruta: `servicio/rutas.py::ficha`.

### 21.1 Entradas

```
POST /ficha   { "consulta": "pepe" | "PEPEUSDT" | "0x6982…" | "Bz9…" }
POST /ficha   { "simbolo"?: "PEPE", "id_coingecko"?: "pepe", "contrato"?: "0x6982…", "cadena"?: "ethereum" }
```

- **Con `consulta`**, la ficha pasa por `/resolver` (§9.1) y toma la candidata más probable (mayor
  capitalización). Las demás viajan en `resolucion.otras_candidatas` para que la web ofrezca
  cambiar. Por ticker o por nombre identifica el `id_coingecko`; por contrato, el contrato.
- **Con campos**, basta uno. El que identifica sin ambigüedad es `id_coingecko` (o `contrato`, con
  `cadena` si se sabe). `simbolo` solo se desempata por capitalización. `cadena` acepta el id de
  plataforma de CoinGecko (`ethereum`, `binance-smart-chain`) o su nombre (`Ethereum`, `BNB Chain`).
- **Respuestas:** `200` ficha · `400 {error: "falta_moneda"}` sin nada que buscar ·
  `404 {error: "sin_cobertura", texto}` si no existe o si es una moneda con tenencia declarada
  (§19) y quien pregunta no es admin · `502 {error: "fuente_caida", texto}` si la fuente de
  identidad no respondió. Nunca `503`.
- **Tenencia declarada:** se comprueba antes y después de resolver. Pedida por un contrato o un id
  que no están en la lista, la moneda resuelta puede ser la declarada, y entonces también es `404`.
  Con el token de operación (admin), la ficha sale entera.

### 21.2 Forma de cada dato

```json
{ "clave": "libro_2pct", "etiqueta": "Profundidad del libro a ±2 %",
  "valor": 516223, "unidad": "USD", "estado": "medido" | "estimado" | "no_disponible",
  "fuente": "Binance · contado", "medido_en": "2026-09-26T08:00:00+00:00",
  "nota_estimado": null, "motivo_cliente": null }
```

Todas las claves están siempre. Reglas, validadas por `validar_dato_ficha` en cada ficha:

| regla | |
|---|---|
| `valor` es `null` | **si y sólo si** `estado = no_disponible` |
| `nota_estimado` (texto) | **si y sólo si** `estado = estimado`; si no, `null` |
| `motivo_cliente` (texto) | **si y sólo si** `estado = no_disponible`; si no, `null` |
| `fuente` y `medido_en` | obligatorios salvo en `no_disponible`, donde van `null` |
| `unidad` | `USD`, `%` (ya multiplicado por 100), `×`, `p` o `null` (número suelto, p. ej. tenedores) |

- `valor` es siempre un número sin redondear para mostrar: la web lo formatea con la tabla de §23.
- `fuente` y `nota_estimado` están escritos para el cliente («CoinGecko», «Binance · contado»,
  «Futuros · Binance, OKX»). La fuente técnica de cada dato queda en `solo_admin.fuentes_internas`.
- `motivo_cliente` es la frase para la línea final de no disponibles («No tiene mercado de futuros
  activo en los exchanges que consultamos.»). Si la fuente no respondió a tiempo, lo dice: «La
  fuente tardó demasiado en responder; vuelve a intentarlo en unos minutos.»
- El estado lo decide el código, no se declara a mano: sin valor ⇒ `no_disponible`; con nota ⇒
  `estimado`; un valor sin fuente o sin fecha no se publica.

### 21.3 La ficha

```json
{
  "nivel": "ficha", "version_ficha": 1,
  "simbolo": "PENDLE", "nombre": "Pendle", "cadena": "ethereum",
  "contrato": "0x8085…", "id_coingecko": "pendle",
  "fecha_datos": "…", "calculada_en": "…", "cache_hasta": "…", "desde_cache": false,
  "precio_usd": {dato}, "var_24h": {dato}, "var_7d": {dato}, "mcap_usd": {dato},
  "bloques": {
    "demanda":       { "titulo": "Qué mueve el precio", "lectura": "demanda_real" | null,
                       "lecturas_posibles": ["demanda_real", "mixta", "apalancamiento"], "datos": [{dato}, …] },
    "riesgo_cola":   { "titulo": "Caídas", … },
    "concentracion": { "titulo": "Quién la tiene", … },
    "tokenomics":    { "titulo": "Si el token cobra", … },
    "liquidez":      { "titulo": "Salida", … }
  },
  "analizable": true | false | null, "motivo_no_analizable": "…" | null,
  "resolucion": { "consulta": "", "interpretada_como": "", "otras_candidatas": [] }
}
```

- **Cabecera:** `precio_usd`, `var_24h`, `var_7d`, `mcap_usd` (datos con la forma de 21.2),
  `cadena` (id de plataforma de CoinGecko; `""` en una moneda nativa), `contrato` (`""` en una
  nativa) y `fecha_datos` (la hora del precio). Sin precio de CoinGecko, `precio_usd` toma el
  último del par de contado de Binance, con esa fuente.
- **Cierre:** `analizable` y `motivo_no_analizable`, en lenguaje de cliente. «No analizable» sólo
  sin precio reciente en ninguna fuente (§G.2, `engine/analizabilidad.py`); lo demás que falte
  sale como dato no disponible, no como bloqueo.
- `resolucion` va vacía cuando la entrada fue por campos.

### 21.4 Los cinco bloques

| bloque (`clave`) | título | datos, en este orden | lectura | la decide |
|---|---|---|---|---|
| `demanda` | Qué mueve el precio | `futuros_sobre_contado` (×), `financiacion` (%, anualizada), `oi_total` (USD), `oi_cambio_7d` (%) | `demanda_real · mixta · apalancamiento` | futuros sobre contado |
| `riesgo_cola` | Caídas | `cvar_7d` (%, peor semana de cada 20), `caida_max_90d` (%) | `contenida · alta · extrema` | CVaR de 7 días |
| `concentracion` | Quién la tiene | `top10_neto` (%, sin exchanges ni contratos), `n_tenedores` | `dispersa · concentrada · muy_concentrada` | top-10 neto |
| `tokenomics` | Si el token cobra | `ingresos_30d` (USD), `parte_al_token` (%), `tvl` (USD) | `captura_verificada · captura_declarada · captura_citada · sin_captura` | ingresos de 30 días |
| `liquidez` | Salida | `libro_2pct` (USD), `volumen_24h` (USD) | `profunda · suficiente · fina` | libro a ±2 % |

- **`lectura: null` cuando falta el dato que la decide.** Nunca la lectura cómoda por descarte: un
  dato ausente no cuenta a favor. Sin ingresos medidos, `tokenomics` es `null`, no `sin_captura`.
- Los umbrales son los de §4 (`engine/determinista.UMBRALES`): la web sólo muestra la palabra.
- `captura_citada` no sale nunca en la ficha: exige un mecanismo documentado por un analista, y la
  ficha no tiene agentes. Una captura cuyos datos reporta el propio proyecto sale como
  `captura_declarada`.
- `tvl` no está en la tabla del §4 de VETA: viaja en `tokenomics` como contexto del negocio.
- Casos que salen `estimado`, con su nota: el libro que suma pools descentralizados (su
  equivalente se calcula a partir de la liquidez del pool); futuros sobre contado medido con
  futuros de varios mercados sobre el contado de Binance; interés abierto o financiación a los que
  les falta algún mercado con futuros; cambio del interés abierto medido en un solo mercado cuando
  hay varios; CVaR o caída máxima con menos de 90 días de historia; top-10 sobre el suministro
  total porque la fuente no publica el circulante.
- **Tenedores de Blockscout:** si sólo respondió Blockscout, `top10_neto` y `n_tenedores` salen
  `no_disponible` para el cliente (sus términos dicen «internal use only»; lo decide Pablo con
  `indexador.blockscout_publicable`). Admin ve el HHI igual.

### 21.5 Bloque `solo_admin`

Sólo viaja con el token de operación. Para cualquier otro, **la respuesta de la API no lo trae**
(no es un filtro de la web: el motor lo quita). Lleva la marca `solo_admin: true` y:

| clave | qué |
|---|---|
| `adv_30d` | {dato} volumen diario medio de 30 días (CoinGecko, todos los mercados) |
| `hhi` | {dato} concentración HHI con su alcance en `etiqueta` |
| `derivados_por_venue` | `{venue: {oi_usd, volumen_24h_usd, funding_actual, funding_anualizado, precio, intervalo_funding_h}}` |
| `costo` | `{proveedores: {prov: {llamadas, creditos, lecturas_de_cache, errores}}, llamadas_total, agentes: 0, desde_cache, nota}` |
| `tiempo_s`, `tiempos_por_tarea` | lo que tardó la consulta y cada proveedor |
| `fuentes_internas` | la fuente técnica de cada dato (endpoint y parámetros) |
| `analizabilidad` | el chequeo completo, con lo que se midió |
| `errores` | fuentes que fallaron o no llegaron a tiempo, y avisos |
| `combustible` | la lectura de combustible (§D.20), con la misma forma que `combustible` del registro (§15): cuánta posición apalancada está expuesta y de qué lado, desde el mismo mapa de liquidación proyectada que el análisis completo. Indica volatilidad, no dirección, y no produce magnitud. `estado` es `estimado` (es un modelo, nunca `medido`) o `no_disponible`, y en ese caso `motivo_ausencia` dice por qué: sin perpetuo en los venues consultados, venues de derivados fuera de plazo, venues sin respuesta o mapa sin datos. No toca los cinco bloques del cliente |

Con la ficha servida desde la caché, `costo` es cero y `costo_calculo` guarda el de cuando se calculó.

### 21.6 Caché, costo y tiempos

- **Caché por moneda**, en disco (`cache/ficha/`). La ficha entera vive **15 minutos** (lo que vive
  su dato más corto, el precio y los derivados). Las fuentes guardan cada una su plazo: tenedores
  **6 h**, ingresos y TVL **24 h**; rehacer una ficha vencida no vuelve a pedirlos. Dos claves por
  ficha: la de la entrada tal como llegó y la del `id_coingecko`, así que `BTC`, `bitcoin` y un
  contrato comparten la misma ficha. Una ficha a la que le faltó una fuente (error o tardanza) vive
  **60 s**, para que la siguiente consulta la complete.
- **Costo por consulta** en `solo_admin.costo`: llamadas a la red y créditos por proveedor
  (CoinGecko, GoldRush, Helius, DefiLlama, venues…), cero agentes. En frío, CoinGecko gasta dos
  llamadas por moneda (`/coins/{id}` con `market_data`, reutilizada por la resolución, el precio y
  la capitalización, y `market_chart` de 365 días; una más para desempatar un ticker con homónimos).
- **Tiempo:** objetivo p95 ≤ 8 s en frío y ≤ 1 s con caché. Los proveedores van en paralelo; lo que
  no llegó en 7 s sale `no_disponible` con su motivo y su hilo termina solo, dejando la respuesta en
  la caché de la fuente. `/coins/list`, `/asset_platforms`, `/protocols`, `/lite/protocols2`,
  `/v2/chains`, los catálogos de `/overview/fees` por tipo de dato, `exchangeInfo` y los catálogos
  de los venues de derivados los precarga el cron diario
  (`engine.ficha.precargar`, 06:30 UTC). Medido en modo mock con las respuestas guardadas en la
  caché (sin latencia de red), 20 monedas: mediana 0,68 s y p95 1,28 s en frío; 0,1 ms y 0,2 ms con
  caché. En el servidor, con red, el suelo lo pone el limitador de CoinGecko (2,4 s entre llamadas):
  queda por medir en el banco (§E).

### 21.7 Lo que no cambia

`/determinista` y `/analizable` responden como hasta ahora. La forma de los registros `gema` y
`analisis` (§15) no cambia.

### 21.x `/determinista` desde la ficha (2026-09-26) — AVISO A VETA

`POST /determinista` responde ahora para **cualquier** moneda que la ficha pueda identificar, con
datos frescos, y ya no sólo para las que tienen un análisis guardado. La forma es la de §4, sin
cambios; `origen_motor` vale `ficha`. Si la ficha no puede (moneda no identificable o fuente
caída), responde como antes desde el último análisis guardado, y 404 si tampoco lo hay.

---

# Acuses de VETA (21-sep)

Lo que la web hizo con cada aviso del motor de §15 a §18. Se conserva tal cual se escribió
el 21-sep; lo que ha cambiado desde entonces lo fijan §20 a §23.

## A.15 Forma única de cada campo  ·  acuse

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

### A.15.1 Lo que la web pedía al motor (resuelto en §15.1 y §20–§23)

1. **El decimal y el signo de porcentaje.** En texto de cliente van con coma
   decimal y espacio duro antes del signo: «+1,2 %», no «+1.2%». Afecta al
   escenario condicional de la agenda, al informe del narrador y a cualquier
   prosa con cifras. **Commiteado por el motor en `b301733`**: formateador
   único, 80 porcentajes convertidos, mismos separadores en `plano()` y en
   `engine/formato`, y la batería de tests sin regresiones (10 fallos antes,
   10 después, 1222 pasan). Falta comprobar en producción que el escenario de
   la agenda sale con coma decimal, cuando el motor lo despliegue y corra el
   noticiero.
2. **Un aviso cuando una reexportación suba la versión de un informe ya
   aprobado.** Hoy la web no distingue «versión nueva porque cambió el
   análisis» de «versión nueva porque se reexportó con otra forma», y en las
   dos el informe desaparece del sitio público hasta que alguien lo vuelva a
   aprobar. Basta un campo en `cambios_respecto_version_anterior` que diga que
   el cambio fue de forma y no de contenido.

## A.16 Acuse de §15.1, §16, §17 y §18 (21-sep, noche)

| Sección | Lo que fija el motor | Lo que hizo la web |
|---|---|---|
| 15.1 | `misma_corrida` y aprobación atada al `id` | Ya estaba: la aprobación va por id de corrida desde el arreglo del sitio vacío. Una versión nueva la conserva; sólo un `id` nuevo vuelve a la bandeja. |
| 15.1 | `cambios_respecto_version_anterior` de lista a objeto | Se leen las dos formas mientras conviven. De la nueva se usa `campos_contenido`; con `solo_forma: true` **no** se avisa en la bandeja. |
| 16.1–2 | `dato_confiable`, `pendiente_confirmacion` | Ninguno de los dos cuenta como tesis rota. La guarda propia del cero se queda debajo como red, por si llega un registro viejo. |
| 16.3 | Cierres con `revertido` | Nada que hacer: la web no lee el ledger. El estado cerrado le llega por `seguimiento_diario`, así que basta con que el motor deje de marcarlo. |
| 16.4 | PUMP y CAKE revocados | Recibido. PUMP volvió a `INTACTA` en los datos de hoy. |
| 17 | `estado_seguimiento: retirado` | Sale del track record y del marcador públicos, y no vuelve a entrar. Sigue publicada en Gemas y entera en admin. |
| 18 | `titulo_cliente` por sección | El informe lo usa cuando llegue; mientras tanto, «Las dos referencias». «Varas» entra en la tabla de traducciones, así que el texto que mande el motor con el nombre viejo se corrige solo. |
| 18 | Los múltiplos, sólo en campos de admin | Fuera de la vista de cliente: la fila del escenario y las etiquetas del gráfico de Niveles los enseñan sólo a admin. |

**Estado al cerrar la noche.** El track record público está **vacío**, y es correcto:
PUMP era la única gema que el público llegó a ver como gema, y el motor la retiró
(«regla de invalidación sin margen: el umbral era igual al valor»). Sigue publicada
en Gemas; lo que sale es el seguimiento.

**Pendiente de comprobar:** la reexportación de los 14 vigentes todavía no ha
ocurrido —`cambios_respecto_version_anterior` sigue siendo lista y no hay
`misma_corrida`—. Cuando pase, hay que confirmar que las cuatro aprobaciones
sobreviven y que los que cambien de contenido aparecen en la bandeja con el aviso
en oro.

### Lo que la web sigue pidiendo

1. **Los múltiplos de la brecha de ingresos.** En la sección de referencias se
   enseña «lo que implicaría cerrar la brecha» como un múltiplo (`3×`). No es un
   múltiplo de escenario, así que no lo he tocado, pero es la misma familia y
   conviene decidir si también se va a admin.
2. **`titulo_cliente`** todavía no llega en ninguna de las ocho secciones.

---

## 22. Qué está publicado: `publicados-web.json` (2026-09-26) — AVISO AL MOTOR

Escrito por la web según las dos especificaciones de lanzamiento aprobadas (web §7, motor §C.15).
**La bandeja de VETA es la única autoridad sobre qué está publicado.** La web la escribe; el motor
la lee; nadie más la escribe.

### 22.1 Dónde y cómo

- Ruta: `/opt/veta/gem-pipeline/base_contenido/publicados-web.json` (en local,
  `$VETA_BASE_CONTENIDO/publicados-web.json`).
- Lo escribe `veta-web` (usuario `veta`) **de forma atómica**: escribe `publicados-web.json.tmp`
  en el mismo directorio y hace `rename`. Nunca hay un fichero a medias.
- Se reescribe **entero** en cada decisión de la bandeja (aprobar, rechazar, pedir más,
  despublicar), en cada despublicación o devolución de una noticia y al arrancar la API.
- Permisos: `veta:veta`, `0644`. El motor sólo lo lee.

### 22.2 Forma

```json
{ "version": 1,
  "generado": "2026-09-26T08:00:00.000Z",
  "secuencia": 57,
  "informes": [
    { "id": "CELO-20260919-183951", "tipo": "analisis", "estado": "publicado",
      "version_registro": 4, "decidido": "2026-09-21T15:00:00.000Z", "por": "admin" } ],
  "noticias_despublicadas": [ "not-20260922-1233-6e9641" ] }
```

| campo | significado |
|---|---|
| `secuencia` | entero que crece con cada escritura. Si el motor lee uno menor que el último que vio, alerta |
| `informes[]` | **sólo lo publicado hoy**. Lo que no está no está publicado, sea cual sea su estado en la bandeja |
| `informes[].id` + `tipo` | la clave: un mismo `id` puede existir como gema y como análisis (§12.3) |
| `informes[].version_registro` | la versión que estaba vigente cuando se aprobó (informativa: la aprobación va por `id`, §15.1) |
| `informes[].por` | siempre `"admin"`: el correo de quien decidió no sale de la web |
| `noticias_despublicadas[]` | ids de piezas que Pablo retiró; el resto de `publicable: true` sigue publicado |

### 22.3 Reglas para el motor

1. Se lee en cada uso (agenda, noticias, seguimiento, alertas). Es un fichero local: no hay caché
   ni «demasiado viejo», porque sólo cambia con una decisión.
2. **Si no existe, nada está publicado.** Nunca se cae a `ledger.veredicto_bandeja`.
3. `ledger.veredicto_bandeja` y `base_contenido/publicacion.jsonl` quedan congelados como
   histórico y ya no se leen. La web deja de escribir `publicacion.jsonl`.
4. Una moneda con tenencia declarada (§19) no cuenta como publicada aunque apareciera en el
   fichero: la exclusión del motor manda.

## 23. Tabla de formato de cifras para el cliente (2026-09-26) — AVISO AL MOTOR

Escrito por la web. Es la regla con la que la web pinta **toda cifra que ve un cliente**, y con la
que la prueba de contrato comprueba cada pantalla. El motor manda los valores **sin redondear**
(§21.2); si escribe cifras dentro de la prosa, las escribe con esta misma tabla.

**Separadores:** coma decimal; miles con espacio fino duro (U+202F); el mismo espacio entre la
cifra y su unidad (`%`, `USD`, `días`). El signo negativo es «−» (U+2212), nunca el guion.

| unidad (`unidad` del contrato) | cómo llega | cómo se pinta | ejemplo |
|---|---|---|---|
| `USD`, precio de una moneda | número | decimales según magnitud: ≥ 100 → 0; ≥ 1 → 2; ≥ 0,01 → 4; menor → 6 | `0,3010 USD` · `2,31 USD` · `64 210 USD` |
| `USD`, cantidad (volumen, libro, TVL, ingresos, capitalización) | número | sin decimales | `516 223 USD` |
| `%` | ya multiplicado por 100 (§4, §21.2) | una decimal | `33,8 %` |
| `%` de variación (`var_24h`, `var_7d`, `oi_cambio_7d`, cambios) | ya ×100 | una decimal y **signo siempre**: «+» si > 0, «−» si < 0, sin signo si 0 | `+1,2 %` · `−4,8 %` |
| `×` | número | dos decimales, sin espacio antes del signo | `2,76×` |
| `p` (percentil) | número 0–100 | sin decimales, prefijo «p» | `p90` |
| sin unidad (tenedores, días, conteos) | número | sin decimales | `12 408` |
| fecha | ISO | `D mmm AAAA`, mes en minúscula de tres letras | `26 sep 2026` |
| fecha y hora | ISO | `D mmm AAAA · HH:MM UTC` | `26 sep 2026 · 08:00 UTC` |
| rango de escenario | `rango_min`, `rango_max` | si son iguales, un solo número; si no, `A – B` con guion largo y espacios | `1,14×` · `1,10× – 1,30×` |

- Una fracción (0–1) nunca llega al cliente como tal: si un campo viaja como fracción, el contrato
  lo dice y la web lo multiplica antes de aplicar la fila `%`.
- Redondeo: al más cercano, mitades hacia arriba en valor absoluto (`toFixed`).
- Un valor `null` no se pinta (§21.2, «lo que no hay, no se muestra»): nunca «—» en una pantalla
  de cliente.

---

## A.20 · A.21 Acuse de §20 y §21 (26-sep-2026)

Lo que la web hizo con cada punto, y lo que le queda pidiendo al motor.

| Sección | Lo que fija el motor | Lo que hizo la web |
|---|---|---|
| 20.1 | Estados `en_cola` (con `inicio_estimado`, `puesto`, `motivo_cola`, `requiere_admin`), `en_curso`, `listo`, `no_analizable`, `fallido` sólo cancelación; `bloqueado` no se emite más | Una pantalla por estado (`producto/analizar/estados.ts`). `no_analizable` se guarda como `fallido` con código y sale como su estado; cupo devuelto. `bloqueado` y `fallido` viejos caen a un respaldo genérico, sin motivo crudo. `requiere_admin`: el cliente lo ve en cola sin hora; admin recibe la alerta |
| 20.1 | El reloj es del motor | La web ya no cierra pedidos (fuera el `fallido` por 404 de 60 s). Sin noticias en 30 min, una alerta en `/admin/consumo`; nada más |
| 20.1 | `POST /cancelar/:id` | No se ofrece todavía al cliente: la pantalla de «Cancelaste este análisis» existe para cuando se ofrezca |
| 20.2 | `integridad{no_disponibles, retiradas, sin_verificar}`, marca `⟦sv:i⟧`, `tesis: null` + `motivo_sin_tesis_cliente`, `verificador.estado` `pasa`/`corregido` | Bloque «Sobre los datos de este informe» (sin verificar y una línea de no disponibles); `retiradas` no sale del servidor hacia quien no es admin; la marca se vuelve nota y nunca sale cruda; «Sin tesis» arriba del informe, sin invalidación ni escenarios; `corregido` no cuenta como bloqueo en la bandeja |
| 21 | `POST /ficha`, forma de dato, cinco bloques, `lectura: null`, `solo_admin` sólo con token | `/api/analizar/ficha` con límite por usuario e IP; la pantalla de la ficha; `solo_admin` se quita también en la web por si llegara. Si la ficha no responde, cae a `/determinista` |
| 21.x | `/determinista` lee de la ficha | Sin cambios: sigue siendo el respaldo |

### Lo que la web pide al motor (abierto)

1. **`integridad.no_disponibles[].que` en lenguaje de cliente.** Llega «TVL ethena-usde y Δ30d»;
   la web lo limpia a «fondos bloqueados y variación a 30 días», pero es un parche.
2. **Prosa sin identificadores de código.** Los catalizadores de STONK traían
   `creator_fee_share_rate` y `curve_params`: la web tira la frase entera.
3. **Cifras de la prosa con la tabla de §23.** Llegan «17.676.632 USD», «17,3%» y «15 %» con
   espacio normal; la web las corrige con `numerosDeProsa`, pero es un parche.
4. **Ficha: tiempo.** Medido en producción con las 22 monedas del banco: mediana 8,9 s,
   p95 10,8 s, máximo 11,3 s en frío. El objetivo del motor era 8 s.
5. **El banco de 20 exportaciones.** `fixtures-contrato/` tiene hoy 3 registros en esta máquina
   (4 en el servidor): la prueba de contrato corre sobre ellos. «Listo» (§E) pide los 20.
6. **`catalizador` e `invalidacion` de `escenarios[]`** llegaban sin pasar por el filtro de
   lenguaje de la web; ya pasan, pero conviene que salgan limpios de origen.
