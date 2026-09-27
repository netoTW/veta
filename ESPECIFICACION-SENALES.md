# Especificación · backtest, track record en vivo y panel de señales

27-sep-2026 · **sin código**. Tres piezas nuevas. Cuando la apruebes (y el motor diseñe su parte con
los campos de §4), se construye con el mismo método que el lanzamiento: invariantes, un despliegue
por pieza, informe con evidencia.

Cada pieza trae **qué haré**, **aceptación** (verificable) y **riesgos**. Los textos entre
«comillas angulares» son los que verá el cliente y cumplen `CLAUDE.md`.

---

## 0. Decisiones (27-sep, aprobada con esto)

- **D1:** las tesis retiradas se quedan en el historial, con el resultado congelado el día del
  retiro. Desde el lanzamiento nada se saca; lo anterior es calibración y se archiva.
- **D2:** la revisión legal va en paralelo y no bloquea. La sección del backtest sólo aparece
  cuando el motor lo entregue.
- **D3:** BTC en la portada; el universo con igual peso, en el panel de admin y en la metodología.
- **D4:** lo define el motor en §24.
- **D5:** en la portada, fuera de muestra más el vivo; el período completo con el corte marcado,
  en la metodología.
- **D6:** SYN fuera de todo lo público, incluidas las listas de operaciones.

Se construye cuando el motor publique §24; lo que no dependa de él, antes. **Hecho el 27-sep**
sin esperar a §24: D1 en el historial (retiradas se quedan con su resultado congelado, lo anterior
al lanzamiento archivado), el invariante B2.1 (`probar-historial.mjs`), la lista de promesas en la
auditoría (B1.4) y la petición de §24 y el aviso §17.1 en el contrato.

### La propuesta original, para contexto

| # | Qué | Por qué | Mi propuesta |
|---|---|---|---|
| D1 | **«Ninguna se borra» choca con §17.** Hoy una tesis `retirada` sale del track record y del marcador públicos (decisión del 21-sep; por eso el track record está vacío: PUMP era la única). | El gancho de la pieza 2 es justo que no se borra nada. | **Todas las gemas que el público vio siguen en el track record para siempre.** Una retirada se queda, con su resultado congelado el día del retiro y la etiqueta «Retirada del seguimiento el 22 sep 2026», y su motivo en llano. Se cambia §17 del contrato. |
| D2 | **Un backtest en la portada es publicidad de rendimiento simulado.** En varias jurisdicciones (y en Chile, si la CMF lo mira como asesoría o publicidad de inversión) exige advertencias concretas y metodología a la vista. | `CLAUDE.md` pide que en la portada se venda y el riesgo casi no aparezca; aquí la etiqueta de simulado **tiene** que verse. | Etiqueta «Simulado» pegada a la cifra, frase corta de advertencia en la misma tarjeta y enlace a la metodología. **Revisión legal antes de publicar**: yo no puedo dar ese visto bueno. |
| D3 | **Contra qué se mide.** El seguimiento usa B1 (canasta) y B2 (regla simple), no BTC. | Las piezas nuevas piden BTC. | **BTC en las tres piezas** (se entiende a la primera); B1 y B2 se quedan en el seguimiento y en el panel de admin. |
| D4 | **Qué es «el portafolio de señales».** Hoy no existe: el motor publica gemas y análisis, no un portafolio con reglas de entrada, tamaño y salida. | Sin reglas congeladas, un backtest es una cifra inventada. | El motor define y **congela** la estrategia (reglas, costes, universo) antes de calcular, con fecha y huella del código. La portada enseña esa versión y ninguna otra. |
| D6 | **Monedas con tenencia declarada en el backtest.** SYN puede haber sido una señal. | §19: nada declarado en lo público. | Excluirla del backtest y del historial públicos y decirlo en la metodología; admin la ve. |
| D5 | **«El último año» casi todo es retroactivo.** El motor publica gemas desde septiembre de 2026: un año de backtest es aplicar las reglas de hoy al pasado. | Riesgo de sesgo de anticipación y de supervivencia. | Se enseña separado: «dentro de muestra» (con lo que se diseñaron las reglas) y «fuera de muestra» (después), y en la portada **sólo el tramo fuera de muestra más el vivo**, o todo con la línea de corte marcada. Lo decides tú. |

---

## 1. Portada comercial con el backtest

**Qué haré.** Una sección nueva en la portada (`/`), arriba, **[DISEÑO]**:

```
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  SIMULADO · últimos 12 meses                                       ◆      │
 │  Si hubieras seguido las señales desde el 27 sep 2025                     │
 │                                                                           │
 │   +XX,X %                 +YY,Y %                  −ZZ,Z %                │
 │   señales de VETA         mantener BTC             peor caída             │
 │                                                     (de las señales)      │
 │   ──────────── curva: señales (oro) · BTC (ceniza) ─────────────────      │
 │   ╱╲    ╱──╲___╱‾‾‾‾╲___╱‾‾‾‾‾‾      ← línea vertical: «desde aquí, en vivo» │
 │                                                                           │
 │  Resultado simulado con las reglas de hoy aplicadas a precios pasados.    │
 │  No es una rentabilidad obtenida ni una promesa. Cómo se calcula →        │
 └───────────────────────────────────────────────────────────────────────────┘
```

- **Tres cifras del mismo tamaño**: rendimiento de las señales, de BTC y la caída máxima. La caída
  no va en letra pequeña: el mismo peso que el rendimiento.
- **La curva** con dos líneas y, si se decide así en D5, la línea vertical donde empieza el tramo
  fuera de muestra o el vivo.
- **«Si hubieras seguido las señales desde…»**: un selector con tres puntos de partida fijos
  (hace 12, 6 y 3 meses) que da el motor. No es libre: un selector libre deja buscar el mejor
  punto de entrada, y eso sí es engañar.
- **La etiqueta «Simulado»** va arriba a la izquierda de la tarjeta, en el mismo color que el
  título, y la frase de advertencia dentro de la tarjeta, no en el pie de la página.
- **«Cómo se calcula»** lleva a una página `/metodologia#backtest` con las reglas congeladas, los
  costes, el periodo, el corte de muestra y la versión.
- Si el motor no ha entregado el backtest, **la sección no existe** (nada de «próximamente»).

**Aceptación.**
- **B1.1** Prueba en Chrome, escritorio y móvil: en la tarjeta hay un elemento visible con el
  texto «Simulado», de al menos 11 px, **dentro de la misma tarjeta** que la cifra principal y
  visible sin desplazarse cuando la cifra lo es.
- **B1.2** La caída máxima tiene el mismo tamaño de letra que el rendimiento (se compara el
  `font-size` calculado).
- **B1.3** Prueba de contrato: cada cifra de la sección sale del fichero del motor y se pinta
  con §23 (valor, unidad, redondeo y signo). Ninguna cifra la calcula la web.
- **B1.4** Auditoría de lenguaje ampliada con una lista de **promesas**: «garantiz…», «ganarás»,
  «vas a ganar», «rentabilidad asegurada», «sin riesgo», «duplica/triplica tu…», «retorno
  esperado». Cero en toda la web.
- **B1.5** Sin el fichero del motor, la sección no está en el DOM.
- **B1.6** El selector sólo ofrece los puntos de partida del fichero; los tres dan su curva y su
  cifra, y la prueba de contrato los recorre.

**Riesgos.**
- **Legal (D2):** el mayor. Sin revisión legal, mi recomendación es no publicarlo.
- **Una cifra muy buena atrae y, cuando el vivo la contradiga, pesa más.** Por eso el tramo vivo
  va en la misma curva, no en otra pantalla.
- **Sesgo (D5):** si el tramo dentro de muestra domina, el número es bonito y falso.

---

## 2. Track record en vivo como gancho

**Qué haré.** Una sección en la portada, debajo del backtest, y una página `/historial`, pública:

```
 CADA GEMA QUE PUBLICAMOS, CON SU RESULTADO. NINGUNA SE BORRA.
 ┌──────────┬─────────────┬──────────────┬──────────────┬────────────────────┐
 │ Gema     │ Publicada   │ Resultado    │ BTC igual    │ Estado             │
 ├──────────┼─────────────┼──────────────┼──────────────┼────────────────────┤
 │ PUMP     │ 19 sep 2026 │ (del motor)  │ (del motor)  │ Retirada el 22 sep │
 │ …        │ …           │ …            │ …            │ En seguimiento     │
 └──────────┴─────────────┴──────────────┴──────────────┴────────────────────┘
   N gemas publicadas · N por encima de BTC · N por debajo · N en curso
```

- **Una fila por cada gema que el público vio** (la tabla `gema_publica` ya lo registra desde el
  momento en que ocurre). Sin filtro: ni las que salieron mal, ni las retiradas (D1), ni las
  reclasificadas.
- **«Publicada»** es la fecha en que el público la vio, no la del informe.
- **«Resultado»** desde el precio al publicar hasta hoy, o hasta el cierre o el retiro.
  **«BTC igual»** es lo que hizo BTC en ese mismo periodo. Los dos los calcula el motor.
- **Estado:** en seguimiento, cerrada (con fecha), retirada (con fecha y motivo en llano) o
  invalidada (con el número que la invalidó).
- **El recuento** de arriba va en la misma letra para las que ganaron y las que perdieron.
- **Gancho, sin promesa:** «Cada gema que publicamos, con su resultado. Ninguna se borra.» y, para
  quien no tiene plan, el llamado a verlas antes (el plan Pro las ve con anticipación).
- Con cero gemas publicadas, la sección no está (hoy lo estaría: PUMP con D1).

**Aceptación.**
- **B2.1** El número de filas es **igual** al de `gema_publica`, siempre. Es un invariante nuevo:
  si alguna vez es menor, no se despliega.
- **B2.2** Una gema retirada sale con su fecha y su motivo; su resultado ya no cambia (dos
  lecturas separadas por una sincronización dan la misma cifra).
- **B2.3** Prueba de contrato sobre la tabla: resultado y «BTC igual» con §23 (signo siempre).
- **B2.4** Las filas perdedoras no tienen menos contraste ni tamaño que las ganadoras (se compara
  el estilo calculado).
- **B2.5** El recuento cuadra con las filas (la misma función que el marcador, `CLAUDE.md` ·
  trampa 1: dos pantallas que cuentan lo mismo salen de la misma función).

**Riesgos.**
- **D1 cambia una regla ya decidida.** Si no se cambia, el gancho «ninguna se borra» sería falso.
- Con pocas gemas, el recuento dice poco. Se enseña el número tal cual, sin porcentajes que
  exageren con n = 3.

---

## 3. Panel de admin de señales

**Qué haré.** `/admin/senales`, sólo admin, con el vocabulario real:

- **Tabla por señal y por tipo de tesis.** Cada fila con dos bloques, **dentro de muestra** y
  **fuera de muestra**, más un tercero **en vivo**:
  - rendimiento y rendimiento anualizado;
  - tasa de acierto (operaciones con retorno > 0 y > BTC, las dos);
  - asimetría de pago (ganancia media / pérdida media);
  - caída máxima;
  - alfa contra BTC (y beta);
  - número de operaciones y exposición media.
- **Deriva:** para cada señal, cómo va el vivo contra lo que el backtest prometía (tasa de
  acierto, alfa), con el estado que calcula el motor: `estable`, `vigilar` o `deteriorada`, desde
  qué fecha y por qué. Las `deteriorada` arriba, en oro, y en la alerta de Operación.
- **Detalle de una señal:** su curva (dentro, fuera y vivo, con los cortes marcados), sus
  operaciones una por una y las reglas congeladas.
- **Versión:** qué versión de la metodología y del código produjo cada número, y cuándo.

**Aceptación.**
- **B3.1** Matriz de acceso: `/api/admin/senales*` sólo para admin (entra en la tabla de
  `probar-matriz.mjs`; una ruta nueva sin decidir falla sola).
- **B3.2** Ningún campo del panel llega a un cliente: prueba como la del combustible (DOM y API).
- **B3.3** Prueba de contrato del panel: cada cifra desde el fichero del motor, con §23.
- **B3.4** Con una fixture donde una señal pasa a `deteriorada`, sale arriba y genera una alerta
  en Operación (una, no una por ciclo).
- **B3.5** Dentro y fuera de muestra nunca se mezclan en una misma cifra (cada una lleva su tramo
  en `data-muestra`, y la prueba lo comprueba).

**Riesgos.** El umbral de «deteriorada» lo decide el motor; si es muy sensible, el panel se llena
de falsas alarmas. Se ajusta con datos.

---

## 4. Lo que necesito del motor · propuesta para su sección nueva del contrato

Propongo **§24 · Estrategia, backtest y señales**. Tres ficheros en `base_contenido/senales/`,
escritos por el motor, que la web espeja y lee igual que el resto (nunca calcula nada):

### 4.1 `estrategia.json` · el backtest de la portada

```json
{
  "version": 1,
  "estrategia_id": "veta-senales-v1",
  "metodologia": {
    "version": "2026-09-30", "congelada_en": "2026-09-30T00:00:00Z", "huella_codigo": "git:abc1234",
    "descripcion_cliente": "Cada gema publicada entra con el mismo peso y sale al cumplirse su plazo o su invalidación.",
    "reglas": { "universo": "…", "entrada": "…", "tamano_posicion": "igual peso, máx. N", "salida": "…",
                "rebalanceo": "…", "costes_bps": 30, "deslizamiento_bps": 20, "capital_inicial": 100 },
    "limitaciones_cliente": ["Resultado simulado con las reglas de hoy aplicadas a precios pasados."],
    "limitaciones_admin": ["…"]
  },
  "tramos": {
    "dentro_de_muestra": { "desde": "2025-09-27", "hasta": "2026-03-31" },
    "fuera_de_muestra":  { "desde": "2026-04-01", "hasta": "2026-09-18" },
    "vivo":              { "desde": "2026-09-19", "hasta": "2026-09-27" }
  },
  "puntos_de_partida": ["2025-09-27", "2026-03-27", "2026-06-27"],
  "serie": [ { "fecha": "2025-09-27", "estrategia": 100, "btc": 100, "caida_estrategia": 0, "caida_btc": 0, "posiciones": 0, "tramo": "dentro_de_muestra" } ],
  "metricas": {
    "total":              { "rendimiento": 0.0, "rendimiento_btc": 0.0, "caida_maxima": 0.0, "caida_maxima_btc": 0.0,
                            "caida_desde": "…", "caida_hasta": "…", "recuperada_en": "… | null",
                            "alfa_vs_btc": 0.0, "beta_vs_btc": 0.0, "volatilidad": 0.0,
                            "tasa_acierto": 0.0, "asimetria_pago": 0.0, "operaciones": 0, "exposicion_media": 0.0 },
    "dentro_de_muestra":  { "…": "lo mismo" },
    "fuera_de_muestra":   { "…": "lo mismo" },
    "vivo":               { "…": "lo mismo" },
    "por_punto_de_partida": { "2026-03-27": { "rendimiento": 0.0, "rendimiento_btc": 0.0, "caida_maxima": 0.0 } }
  },
  "simulado": true,
  "calculado_en": "…"
}
```
- **Unidades:** rendimientos y caídas en `%` ya multiplicados por 100 (como §21); la serie en
  índice base 100. La web los pinta con §23.
- **`simulado: true`** es obligatorio salvo en el tramo `vivo`; sin él, la web no publica la sección.
- **Una versión congelada:** si cambian las reglas, cambia `metodologia.version`; la web enseña
  la versión y la fecha, y la curva vieja no se mezcla con la nueva.

### 4.2 `track_record.json` · el historial en vivo

Una fila por gema **que el público vio** (el motor lee `publicados-web.json` y la web aporta la
fecha de `gema_publica`; si hace falta, la web la añade a §22):
```json
{ "gema_id": "PUMP-20260919-…", "simbolo": "PUMP", "publicada_en": "2026-09-19T…",
  "precio_publicacion": 0.0, "estado": "en_seguimiento | cerrada | retirada | invalidada",
  "cerrada_en": "… | null", "motivo_cliente": "… | null",
  "resultado": 0.0, "resultado_btc": 0.0, "diferencia_vs_btc": 0.0,
  "resultado_congelado": true, "medido_en": "…", "fuente_precio": "…" }
```
- El resultado de una gema retirada o cerrada queda **congelado** (`resultado_congelado: true`)
  el día del cierre o del retiro.

### 4.3 `senales.json` · el panel de admin

```json
{ "version": 1, "metodologia_version": "2026-09-30",
  "senales": [ {
    "senal_id": "…", "nombre": "…", "tipo_tesis": "…",
    "dentro_de_muestra": { "rendimiento": 0.0, "rendimiento_anualizado": 0.0, "tasa_acierto": 0.0, "tasa_acierto_vs_btc": 0.0,
                           "asimetria_pago": 0.0, "caida_maxima": 0.0, "alfa_vs_btc": 0.0, "beta_vs_btc": 0.0,
                           "operaciones": 0, "exposicion_media": 0.0, "desde": "…", "hasta": "…" },
    "fuera_de_muestra":  { "…": "lo mismo" },
    "vivo":              { "…": "lo mismo" },
    "deriva": { "estado": "estable | vigilar | deteriorada", "desde": "… | null", "motivo_admin": "…",
                "metrica": "tasa_acierto | alfa_vs_btc", "esperado": 0.0, "observado": 0.0 },
    "serie": [ { "fecha": "…", "valor": 100, "btc": 100, "tramo": "…" } ],
    "operaciones": [ { "simbolo": "…", "entrada": "…", "precio_entrada": 0.0, "salida": "… | null",
                       "precio_salida": 0.0, "motivo_salida": "…", "retorno": 0.0, "retorno_btc": 0.0, "tramo": "…" } ]
  } ],
  "por_tipo_de_tesis": [ { "tipo_tesis": "…", "…": "los mismos tres bloques y la deriva" } ],
  "calculado_en": "…" }
```

### 4.4 Reglas que pido que el contrato fije

1. **Nada se calcula en la web.** Rendimientos, caídas, alfa y BTC del mismo periodo, todo del motor.
2. **Tenencia declarada (§19):** una moneda declarada no aparece en `estrategia.json` ni en
   `track_record.json` públicos, o el backtest entero lleva la declaración. Lo decides tú (D6).
3. **Sin huecos silenciosos:** si una gema del historial no tiene precio hoy, la fila sale con su
   último resultado medido y su fecha, no desaparece.
4. **Reproducible:** `huella_codigo` y `metodologia.version` en cada fichero; lo mismo con lo
   mismo da lo mismo.

---

## 5. Orden de construcción (cuando esté aprobado y el motor entregue)

1. §24 en el contrato y fixtures de los tres ficheros en `fixtures-contrato/`.
2. Pieza 3 (admin): es la que usa los datos crudos y detecta problemas antes de enseñar nada.
3. Pieza 2 (track record), con el cambio de §17 si se decide D1.
4. Pieza 1 (portada), **sólo después de la revisión legal (D2)**.

Límites que se mantienen: nada de «compra», retornos prometidos ni precios objetivo; nada de
cifras que no vengan del motor; «Simulado» a la vista; el riesgo, en su tarjeta y sin dramatismo.
