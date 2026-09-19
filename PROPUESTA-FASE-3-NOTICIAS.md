# FASE 3 [DISEÑO] — Noticias

Propuesta. No está construido.

Antes de proponer fui a ver qué materia prima existe de verdad. El resultado cambia
la sección respecto a como la planteaste, así que empiezo por ahí.

---

## 1. Lo que hay y lo que no

### No existe, y no por olvido

- **No hay fuente de noticias.** Ni feeds, ni RSS, ni prensa. CryptoPanic estaba y se
  quitó a propósito: su plan gratuito se discontinuó y la regla del sistema es no
  depender de datos de pago.
- **No hay agenda macro.** Nada de FOMC, halving ni CPI. Los tres calendarios cripto
  se evaluaron y se descartaron por escrito: uno exige clave de pago, otro devuelve un
  error con apariencia de éxito, y el tercero no lista un solo evento de nuestras monedas.
- **No hay tendencias diarias.** No existe ningún cálculo de movimiento diario ni semanal.
- **No hay creador de contenido.** No hay nada que genere hilos, posts ni boletines.
  El redactor que sí existe escribe la prosa del informe, no material para publicar afuera.

Si construyéramos la sección tal como la pediste, el 80 % del contenido habría que
inventarlo. Eso choca de frente con las dos reglas del proyecto: nada inventado, y
lo que no hay no se muestra.

### Sí existe, y es bueno

| Material | Dónde | Cuánto hay hoy |
|---|---|---|
| Catalizadores por moneda, con su escenario condicional | `escenarios[].catalizador` de cada informe | 36 de 37 informes; **17 con fecha** |
| Desbloqueos de tokens con fecha y porcentaje | `fundamentales.unlocks` | **9 datados**, cada uno con su enlace de origen |
| Disparadores del rastreo semanal | `ranking.jsonl`, campo `disparadores` | 20 candidatas por pasada, con frase, cifra y fuente |
| Cambios detectados en páginas oficiales | Vigía → `vigia/hits.jsonl` | **5 hits, todos de una moneda**, y el texto es HTML crudo |
| Seguimiento diario de lo publicado | `seguimiento_diario.jsonl` | 98 filas, 6 fechas, **1 sola moneda** |

Los dos últimos no están listos para mostrarse. Los dos primeros sí.

---

## 2. Lo que propongo construir

Una sección **`/agenda`** en vez de `/noticias`. El nombre importa: no tenemos noticias,
tenemos fechas que ya están escritas en nuestros informes y que nadie está mirando juntas.

### Bloque 1 — Lo que viene, con fecha

Una línea de tiempo con los **17 catalizadores datados** y los **9 desbloqueos**, ordenados
por fecha. Cada fila:

```
14 OCT 2026 · RAY
Vence el periodo de recompras anunciado para el trimestre.
Si se renueva, el escenario base sigue en pie. Si no, cae al escenario bajo.
                                               fuente: docs.raydium.io  ·  publicado 12 sep
```

El escenario condicional no hay que escribirlo: **ya está escrito** en el informe, en el
campo `catalizador` de cada escenario, con la forma "si X, entonces Y". Se muestra tal cual,
pasado por el mismo filtro de lenguaje que el resto.

Cada fila enlaza a su informe. Las de monedas no publicadas no aparecen.

### Bloque 2 — Qué cambió en lo que seguimos

Para las gemas ya publicadas: si el seguimiento diario marcó un cambio de estado de la
tesis, una invalidación activada o un catalizador vencido, aparece aquí con su fecha.
Hoy da para una moneda. Crecerá solo, a medida que haya más publicadas.

### Bloque 3 — Movimientos de la pasada *(con una salvedad de acceso)*

Los disparadores del rastreo son el mejor material que tenemos: *"la rotación diaria
está 3.9 desviaciones por encima de su normal"*, con su cifra y su fuente.

**Pero esa lista es la materia prima de la votación semanal, y hoy está velada a propósito
para todo el que no es Pro.** Publicarla abierta destaparía el embudo entero.

Tres salidas, elige una:

1. **Sólo Pro**, íntegra. Refuerza el plan alto y no rompe nada. *(La que recomiendo.)*
2. **Abierta pero sin nombres**: "quince monedas dispararon por volumen anómalo esta
   semana; tres de ellas, además, por ingresos sobre capitalización". Vende el método
   sin regalar la lista.
3. **Sólo las que ya se publicaron.** Honesto, pero queda casi vacío.

### Lo que NO propongo construir

Noticias de prensa y agenda macro. No mientras no haya una fuente gratuita y fiable.
Si en algún momento quieres esa sección de verdad, lo que hace falta es una decisión
tuya de presupuesto, no una tarea de programación.

---

## 3. Panel de administración

### Despublicar: ya está hecho

Existe desde antes. En el detalle de la bandeja, cualquier informe publicado tiene el
botón **Despublicar**, y la acción queda registrada con autor y fecha en la pestaña
Acciones. No hay nada que construir aquí.

### La pestaña Contenido

El creador de contenido no existe en el sistema de análisis. Así que hay dos caminos y
son excluyentes.

**Camino A — construir la pestaña sobre lo que ya hay. Se puede hacer esta semana.**

Una pestaña que toma un informe **ya aprobado** y arma tres piezas listas para copiar,
sin llamar a ningún modelo: el titular con la cifra que lo sostiene, los tres puntos de
la ficha esencial, y la línea de riesgo. Vista previa, botón de copiar y descarga en
texto plano. Todo sale de campos que ya están verificados, así que ninguna cifra puede
salir inventada.

**Camino B — pedir al sistema de análisis un agente nuevo.** Escribiría las piezas con
criterio editorial propio. Es trabajo del motor, no de la web, y hay que especificarlo
en el contrato antes. Vale la pena, pero no es de esta tanda.

Propongo el camino A ahora y dejar el B anotado como hueco del contrato.

---

## 4. Lo que necesito que decidas

1. **`/agenda` en vez de `/noticias`**, con los tres bloques de arriba. ¿Va?
2. **Quién ve los movimientos de la pasada**: sólo Pro, en agregado sin nombres, o sólo
   lo publicado.
3. **Pestaña Contenido**: camino A ahora, o esperar al B.

Con eso construyo. Si prefieres noticias de prensa de verdad, dímelo y te preparo el
cálculo de qué costaría la fuente, sin construir nada mientras tanto.
