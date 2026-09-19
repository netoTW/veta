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

*Mientras no exista:* la web sigue componiendo el texto desde `ficha_esencial` y `niveles`, con
el filtro por frases. **Cuando `narrado` llegue, el filtro se retira** y el informe pasa a ser
la pieza central de la pantalla de resultado.
