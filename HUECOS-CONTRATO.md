# VETA — Huecos del contrato de datos

Campos que las pantallas necesitan y el motor no entrega (o entrega como
texto). Regla: la plataforma no calcula nada; lo que falta acá no se inventó
en el frontend. Fecha: 2026-09-12. Base de contenido `5.1.0+1b8e61d`.

**Sprint 6 (motor 5.1.0):** los tres bloqueantes (1, 2, 3) y el 18 quedaron
resueltos; el 17 también. Lo que cambió en el contrato y cómo lo consume la
web está al final, en «Resuelto en el Sprint 6».

## Bloqueantes para lo que se pidió en esta fase

> 1, 2 y 3: **resueltos** en el Sprint 6 (ver al final). Se dejan como estaban para el historial.

1. **Invalidación: valor actual y umbral vienen dentro de `nota` como texto.**
   `seguimiento_diario.nota` trae `"tvl_usd = 1.14134e+09 contra umbral < 8.43285e+08 · B1 no medible: … · B2 no medible: …"`.
   La UI lo muestra tal cual (partiendo por " · "), pero para mostrar "valor
   actual contra umbral" como dato se necesita algo como:
   `invalidacion: { observable, valor_actual, umbral, operador, unidad, fuente, timestamp, evaluable: bool, motivo_no_evaluable }`.
   Hoy además el número llega en notación científica.

2. **Benchmarks no medibles: el motivo también viene sólo en `nota`.**
   `benchmark_canasta` y `benchmark_regla_simple` son `null` y la razón está
   en el texto ("B1 no medible: sin universo elegible…", "B2 no medible:
   todavía no hay días transcurridos"). Se necesita
   `benchmark_canasta_motivo` y `benchmark_regla_simple_motivo` (o un objeto
   `{ valor, medible, motivo }`).

3. **Advertencias sin tipo ni sección.** `ficha_esencial.advertencias` y las
   `advertencias` de cada sección son strings. El brief pide destacar "toda
   advertencia que cambie la decisión (dato ausente, brecha objetada,
   catalizador sin fecha, riesgo no consolidado)"; hoy la UI las muestra todas
   con la misma marca porque no puede clasificarlas. Se necesita
   `{ texto, tipo: dato_ausente | objetada | sin_fecha | no_consolidado | otro, seccion, cambia_decision: bool }`.

4. **Catalizador con fecha: falta la fecha.** `escenarios[].catalizador_datado`
   existe pero cuando es `true` (bear de RAY y ORCA) no hay `catalizador_fecha`
   ni `catalizador_ventana`. Y `esceptico.catalizador_tiene_fecha` viene `null`.

5. **Fecha de cierre del horizonte.** Sólo hay `dias_al_cierre` y
   `horizonte_dias`; no hay `fecha_cierre`. La UI no la deriva
   (sería calcular). Se necesita `fecha_cierre` en la gema o en el seguimiento.

## Necesarios para la matriz de acceso (planes/roles)

> 6–10: **resueltos en la fase de autenticación** (2026-09-13). El acceso anticipado sale de la fecha de aprobación en la bandeja más `VETA_HORAS_ANTICIPO`; las alertas de la tabla `alerta` (se crean para pro/admin cuando el seguimiento trae una invalidación activada); la exportación la sirve el servidor por plan; la bandeja y la impersonación son de admin real. Nada de esto lo entrega el motor: es estado de la plataforma.

6. **Acceso anticipado (pro).** No hay `fecha_publicacion_pro` /
   `publicado_para_base_en`. Sin eso, "anticipado" no se puede mostrar ni
   simular. (Y `[JUICIO]` cuántas horas.)

7. **Alertas en tiempo real (pro).** No existe un registro `alerta`
   (`usuario_id · tipo · gema_id · fecha · leida`, §6 del spec). La UI muestra
   "sin alertas" leyendo `invalidacion_activada` del seguimiento; no es un
   flujo de alertas.

8. **Ledger / track record.** No hay registros de gemas cerradas ni un
   agregado del historial. La sección "Ledger" (resumen para visitante,
   detalle para base, bloqueados para admin) no se construyó por falta de
   fuente. Los watchlist con `origen_bloqueado: true` sí se marcan para admin.

9. **Bandeja de aprobación (admin).** Requiere el estado del motor
   (informes pendientes con paquete + objeción + reporte del Verificador) y
   una acción de publicar/despublicar: es backend, fuera de esta fase.

10. **Cupos y uso** (`cupo`, `uso_analisis`): fuera de esta fase por ser datos
    de usuario. El selector de rol es simulado.

## Menores / calidad de datos

11. `fundamentales.rubrica[].fuente` viene `null` en los 8 ítems de las tres
    monedas: la rúbrica muestra evidencia sin fuente.
12. `varas.revenue` cambia de forma: en RAY/ORCA trae comparables; en SSV es
    `{ hay_brecha: false, no_disponible_motivo }`. La UI soporta ambas, pero
    conviene que el contrato fije una sola (mantener `comparables: []` y
    `no_disponible_motivo`).
13. `ruta_informe` es una ruta local del motor (`/Users/pabloherreran1/…`).
    Se elimina al compilar; si el informe narrativo (`informe.md`) debe
    publicarse, hace falta que venga en la base de contenido.
14. `watchlist.tier_actual` viene vacío y `historial_revisiones` vacío en las
    17 filas; `valor_al_anotar` es `null` en las de radar.
15. `esceptico.objeciones[].fuente` mezcla URLs separadas por " | " con texto
    libre ("paquete del motor §2.5 …"). La UI enlaza las URL y muestra el
    resto como texto; sería mejor `fuentes: string[]`.
16. `onchain.concentracion_top50` es `null` en las tres; `hhi` es `null` en
    SSV. Se muestran como "no calculable".
17. *(resuelto: RAY y ORCA v3 traen `congelado` y B1 con 100 monedas)* `benchmark_al_publicar.estado_definicion` dice `propuesta_sin_congelar`
    en las gemas, pero `benchmark-congelado.json` está `congelado` el mismo
    día. La UI muestra la advertencia de la gema tal cual; conviene que las
    gemas publicadas después del congelamiento lo reflejen.
18. *(resuelto: `plano()` en el motor; test sobre la base)* Números del motor en notación científica dentro de textos
    (`4.533e+06 USD`, `1e+07`): se muestran tal cual porque son texto.

## Qué sí está y se usa

`ficha_esencial` completa (tesis, precio+fecha, riesgo, catalizadores,
invalidación, advertencias), `niveles.*.esencial/avanzado` para las siete
secciones, `varas` (las dos, lado a lado), `escenarios`, `asimetria`,
`riesgo`, `microestructura`, `onchain`, `fundamentales`, `esceptico`,
`verificador`, `fuentes` (60 campos con timestamp y calidad),
`senales_sin_fuente`, `calidad_por_seccion`, `benchmark_al_publicar`,
`seguimiento_diario` (con versiones), `watchlist`, `benchmark-congelado`.

## Encontrados en el rediseño de jerarquía (2026-09-13)

19. **La prosa del Redactor no se regenera cuando el motor recalcula.** Tras las etiquetas de
    Arkham RAY bajó de ALTO a MEDIO (2 factores) y `ficha_esencial.tesis_una_linea` / `tesis`
    siguen diciendo "Tier ALTO: sostenido por seis incumplimientos… concentración top-10 en
    disputa". SSV dice "top-10 = 85,3 %" y el motor tiene 60,9 %; ORCA nombra "tres
    incumplimientos" como historia (narrativa del cambio, no contradicción). La web ahora
    DETECTA estas contradicciones (`src/lib/contradicciones.ts`: tier nombrado, número de
    incumplimientos, concentración top-10) y desautoriza la prosa visiblemente: la tacha, dice
    qué afirma el motor hoy y muestra en su lugar una lectura compuesta sólo con frases del
    contrato. La bandeja marca "prosa contradice al motor · n". Lo que falta del lado del motor:
    regenerar la prosa del Redactor (o marcar `tesis_contradicha`) cuando cambie el tier, los
    factores o la concentración; y que `tesis_una_linea` sea una tesis (qué es y por qué
    interesa) y no un resumen del triage.
20. **Watchlist: las filas del radar no tienen contenido propio.** En 16 de 17 filas
    `escenario_que_la_activaria` y `observable` son el mismo texto de plantilla ("el protocolo
    ya tiene producto y tracción; si emite token…" / "el token aparece cotizando con
    identificador de mercado"); `tier_actual` viene vacío en las 17, `historial_revisiones`
    vacío, `valor_al_anotar` null en el radar, y no hay ningún dato del protocolo (TVL,
    revenue, categoría, por qué está en radar). La web deja de mostrar el texto de plantilla
    (lo detecta por repetición) y muestra sólo lo estructurado: `observable_tipo`,
    `observable_param.slug`, fuente, fecha de alta, motivo de cierre. Para que el radar informe
    hace falta que el motor entregue por fila: `protocolo { nombre, categoria, tvl_usd,
    revenue_30d_usd, fuente, timestamp }` y un `por_que_en_radar` escrito por fila.

## Encontrados al visualizar (2026-09-13)

21. **El mapa de liquidación proyectado no estaba en el contrato.** El motor lo calculaba
    (`engine/liquidacion_proyectada.py`) pero sólo `pipeline/verificar_s7.py` lo imprimía como
    conteo de cubetas. Resuelto del lado del motor con `pipeline/exportar_visuales.py`, que
    escribe `base_contenido/visuales.jsonl` (mapa con supuestos, limitaciones, venues, fuente y
    timestamp; RAY 53 cubetas vía OKX, ORCA 51 vía Bybit, SSV 43 vía Bybit y OKX). Falta que
    corra como paso de cada corrida y del cron, no a mano.
22. **TVL sin serie.** El paquete guarda TVL de hoy y de hace 30 días (`dl_tvl_usd`,
    `dl_tvl_30d_atras`, `dl_tvl_cambio_30d`); DeFiLlama entrega la serie completa
    (`/protocol/<slug>` → `tvl[]`). La web muestra los dos puntos y lo declara. Hace falta
    `dl_serie_tvl_diario: [{t, v}]`.
23. **Tenedores sin porcentaje en las fotos.** `snapshots_holders/*.jsonl` guarda balances con
    `pct: null` y `direccion: null`; sin porcentaje no hay serie de concentración por fecha.
    Hace falta `pct` sobre el supply de referencia en cada foto (y la fecha del supply).
24. **El mapa no cubre Binance para RAY** (perp en SETTLING) ni los venues caídos: se declara en
    el propio mapa (`venues`, `venues_caidos`). Sigue **sin calibrar** hasta que la serie propia
    de liquidaciones (§7) permita comparar lo proyectado contra lo ocurrido; la web lo dice
    arriba, en rojo, no al pie.
25. **Serie de precio: dos fuentes con distinto largo.** `klines_spot_1w` da 266 semanas para
    RAY pero 93 para ORCA (Binance lista desde 2024); el máximo histórico de ORCA (2021) queda
    fuera del lienzo y sólo aparece como línea. Para que el máximo esté siempre dentro hace
    falta una serie semanal de CoinGecko de historia completa (`market_chart days=max`).

26. **Benchmark en primer plano: lo que falta del contrato.** Para decir "le gana por N puntos"
    hace falta `ventaja_vs_b1` / `ventaja_vs_b2` en el seguimiento diario (la web no resta).
    Para "quedan X de Y días" hace falta `horizonte_dias` o `fecha_cierre` en el seguimiento
    (hoy se toma el horizonte del escenario alcista del informe). B1 hoy vale exactamente 0,0
    en las dos gemas al día 2: conviene que el cron declare si es "sin variación medida" o un
    valor real. Y el marcador agregado necesitaría, cuando haya gemas cerradas, el veredicto
    final por gema (`veredicto_b1`, `veredicto_b2`) para separar "cerradas" de "vivas" sin
    inferirlo por `dias_al_cierre`.

27. **Votación semanal: el ranking del scanner no está en `base_contenido`.** *(2026-09-14: el motor ya exporta `base_contenido/ranking.jsonl` «al contrato»; la web todavía lee la copia manual en `scanner/candidatas-*.jsonl`. Pendiente cambiar el lector.)* La lista de
    candidatas sale de `gem-pipeline/scanner/candidatas-YYYY-MM-DD.jsonl` (una corrida, un
    archivo). Para que la web lo lea se copió a mano a
    `datos-motor/base_contenido/scanner/candidatas-2026-09-10.jsonl`. Hace falta que el scanner
    (o `exportar_visuales.py`) lo deje ahí como parte del contrato, con `tipo: 'corrida'` en la
    primera línea (embudo, cupo, consumo) y una fila por candidata.
28. **La corrida es vieja y la web no lo puede saber por contrato.** El archivo lleva
    `generado` (2026-09-10) y la web lo muestra («revisión del 10 sep») y avisa en admin si tiene
    más de 7 días; pero no hay campo que diga cada cuánto se corre ni cuál es la próxima. Un
    `proxima_corrida` o un `periodicidad_dias` en la fila `corrida` resolvería el aviso.
29. **Dos formatos de ranking.** La v1 (`candidatas-*.jsonl`, con `disparadores[]`, `metricas`,
    `razon`, `seriedad`) es la que se consume; la v2 del 2026-09-11 es un CSV con otras columnas.
    La votación necesita la forma v1 (los disparadores son lo que se dibuja en la piedra). Si el
    scanner pasa a v2, tiene que seguir exportando esos campos en JSONL.
30. **Sin cadena ni dirección de contrato por candidata.** Cada fila trae `id_coingecko`,
    `protocolo_slug` y `categoria`, pero no la cadena (Solana, Ethereum…) ni el contrato; la
    piedra no puede decir «en Solana» aunque el usuario lo pregunta primero. Falta `cadena` (y
    opcionalmente `contrato`).
31. **El lanzamiento del análisis no tiene consumidor.** «Lanzar» escribe una línea en
    `base_contenido/cola-web.jsonl` `{ tipo: 'analisis_solicitado', origen: 'votacion_semanal',
    semana, simbolo, solicitado_por, fecha, votacion_id }` y marca la votación como lanzada.
    Ningún script del motor lee esa cola todavía; la web tampoco puede saber si el motor tomó el
    pedido, sólo si apareció un informe publicado de ese símbolo con fecha posterior al cierre
    (así enlaza «Leer el análisis»). Hace falta un `estado` de vuelta (`tomado`, `en_curso`,
    `publicado`, `rechazado`) o que el informe lleve `origen_solicitud: { votacion_id }`.
32. **Los disparadores vienen en texto.** `disparador` es una frase («revenue alto frente a su
    capitalización»); la web los reconoce por expresión regular para elegir la piedra y el
    material (oro = caja/ingresos, esmeralda = volumen/liquidez, hueso = joven). Un
    `disparador_codigo` enumerado (`volumen_anomalo`, `revenue_sobre_mcap`, `participa_caja`,
    `token_joven`, `tvl_por_antiguedad`) evitaría que un cambio de redacción rompa el mapeo.

33. ~~**Analiza tu moneda: el motor no tiene servicio a pedido.**~~ **Resuelto 2026-09-14**: servicio HTTP en `gem-pipeline/servicio/` con las cuatro rutas; la web corre con `VETA_MOTOR=http`. Queda la salvedad del lanzamiento manual (CONTRATO §8). Todo el flujo (determinista
    gratis, profundo con cupo, progreso por etapas, resultado a la bandeja) corre hoy contra un
    simulador. Lo que el motor tiene que implementar está en `CONTRATO-ANALISIS-A-PEDIDO.md`
    (cuatro rutas HTTP o un consumidor de `cola-web.jsonl`). Hasta entonces, la web marca todo
    resultado con `origen_motor: 'simulador'` y lo dice en pantalla.
34. ~~**La lectura determinista no existe como salida propia del motor.**~~ **Resuelto 2026-09-14**: `/determinista` la deriva de lo ya calculado, sin agentes; `mixta` quedó definida (3×–10×). Las secciones que la
    componen (riesgo, microestructura, on-chain, fundamentales) ya se calculan dentro del
    análisis completo; falta exponerlas solas, con los enumerados de lectura del contrato §4
    (`demanda_real | apalancamiento | mixta`, etc.), sin pasar por los agentes.
35. ~~**Costo real por análisis.**~~ **Resuelto 2026-09-14** del lado del contrato: el motor reporta `costo_real_usd` al cerrar; se verifica con el primer pedido lanzado de verdad. `uso_analisis.costo_real_usd` hoy lo llena el simulador con un
    número inventado alrededor de 1,80 USD. El motor tiene que reportar el gasto real de API al
    cerrar cada pedido (`Progreso.costo_real_usd`), que es lo que alimenta el tope mensual.

36. **La tanda no existe para `/operacion`.** `/operacion/cola` muestra pedidos sueltos
    (en_cola / en_curso / cerrados) con `etapa`, `avance` y `detalle`, pero no agrupa una tanda
    ni dice cuántas monedas la componen, cuántas van, cuál corre ahora ni cuánto tardó cada
    una: las filas no traen `iniciado`/`terminado` ni el `motivo` del bloqueo o fallo. La
    pestaña Operación muestra el progreso desde `/operacion/cola` y la **última tanda** desde
    `base_contenido/tanda_depuracion/rendimiento.jsonl` sincronizado (moneda, tier, tesis,
    bloqueada y motivo, tiempo por moneda, tokens, campos). Falta un `GET /operacion/tanda`
    (o un `tanda_id` por pedido y `iniciado/terminado/motivo` en `/operacion/cola`).
37. **Los informes de la tanda no llegan a `base_contenido`.** Las 8 corridas del 16 de
    septiembre existen en `rendimiento.jsonl` (6 completas, 2 bloqueadas) y sus paquetes en
    `reports/<corrida>/` del Mac, pero ni `gema.jsonl` ni `analisis.jsonl` ni `reports/` del
    servidor los tienen: la bandeja sincroniza bien y sigue viendo sólo RAY, ORCA y SSV. Hace
    falta que el corredor de la tanda exporte cada corrida como registro (y su paquete a
    `reports/`) en el servidor.
38. **`/operacion/lanzar` responde 503** en el servidor (`sin_runtime_de_analisis`: no tiene el
    CLI de los agentes, P8). El botón de la pestaña lo muestra tal cual y el pedido sigue en
    cola intacto.

## Resuelto en el Sprint 6

| hueco | campo nuevo | cómo lo muestra la web |
|---|---|---|
| 1 · invalidación en texto | `gema.invalidacion { campo, direccion, umbral, unidad, ventana_dias, fuente, texto, evaluable, origen }` y `seguimiento_diario.evaluacion_invalidacion { campo, valor, umbral, direccion, unidad, cumple, evaluable, motivo, fuente, timestamp }` | Ficha y tarjeta: «TVL por debajo de 843 284 646 USD · ventana 30 días» formateado por `conUnidad()` con la unidad del contrato. Seguimiento: valor de hoy contra umbral lado a lado; `cumple` lo dice el motor; `cumple: null` se muestra como «sin evaluar» con la regla de que un dato ausente no cuenta a favor. Registros anteriores a 5.1 caen al texto de la nota. |
| 2 · motivo de benchmark en texto | `benchmark_canasta_detalle` / `benchmark_regla_simple_detalle { medible, motivo_codigo, motivo_texto, valor, fuente }` | Código enumerado con etiqueta propia (`sin_dias_transcurridos` → «sin días transcurridos») más el texto del motor; si es medible, el valor y su fuente. |
| 3 · advertencias sin tipo | `advertencias[] { tipo, severidad, seccion, texto, campo_afectado }` en ficha y en ambos niveles de cada sección | Ordenadas por severidad, agrupadas: COMPROMETE_TESIS (rojo), LIMITA_LECTURA (oro), CONTEXTO (ceniza); cada una con tipo y campo afectado. Contador «4 compromete · 8 limita · 2 contexto» en tarjetas y bloque. **Se siguen mostrando todas en esencial y en avanzado.** |
| 17 · definición sin congelar | `benchmark_al_publicar.estado_definicion = congelado`, `b1_n = 100` | La sección Benchmark muestra la definición y su fecha; B1 pasa de «no medible» a «100 monedas». |
| 18 · notación científica | ningún texto del contrato la lleva (test en el motor) | Nada que hacer en la web. |
| — | `factores_del_tier_detalle[] { condicion, estado, valor, umbral, op, unidad }` | Vacío en los registros migrados (el paquete viejo sólo guardó texto); la web lo tipa y lo usará cuando venga. |

Lo que sigue abierto de esta lista: 4 (fecha del catalizador), 5 (fecha de cierre), 6–10 (matriz de acceso), 11–16.
