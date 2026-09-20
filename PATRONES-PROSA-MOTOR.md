# Patrones de prosa que la web tiene que tapar

Lista para el motor, de cara al **Narrador** (fase 3 de `DISENO-FASES-3-5.md`, hueco 40
del contrato).

Hoy la prosa del informe mezcla dos cosas: lo que se le cuenta a un cliente y el control
interno del método. La web las separa a la fuerza, frase por frase, al mostrarlas. Eso es
un parche: recorta de más, a veces deja un bloque vacío, y hay cosas que una sustitución
de palabras no puede arreglar.

**Cuando el Narrador entregue el texto de cliente ya separado, el filtro se quita entero.**
Mientras tanto, esta es la lista de todo lo que atrapa, para que el Narrador no lo escriba.

---

## Cómo se mantiene

La lista **no se escribe a mano**. Sale del propio filtro, pasado sobre los informes reales:

```bash
cd site
npx tsx scripts/patrones-prosa.ts          # resumen en pantalla
npx tsx scripts/patrones-prosa.ts --md     # la tabla de abajo
```

Los patrones viven en `site/src/lib/lenguaje.ts`, en cuatro listas enumerables:
`FAMILIAS_INTERNAS`, `TRADUCCIONES`, `VOSEO` y `REPAROS`. Añadir uno ahí lo añade al filtro
y a esta lista a la vez, así que no pueden desincronizarse.

---

## Las siete familias, y qué debería hacer el Narrador

### 1. Criterios y mínimos del método
*«sólo 0 pasan el criterio y el mínimo es 3, así que NO se calcula brecha por valuación
relativa»*

Es la regla de decisión, no la lectura. **El Narrador no la menciona.** Si por esa regla no
hay una comparación, el texto de cliente simplemente no habla de comparaciones.

### 2. Nombres de los agentes y del sistema
*Escéptico, Verificador, Redactor, el motor, umbral, observable.*

Nombres de la cocina. **Nunca en el texto de cliente.** «Lo que podría salir mal» en vez de
«objeciones del Escéptico»; «no pasó nuestro control de calidad» en vez de «el Verificador
lo bloqueó».

### 3. Listas de descarte
*«Quedaron fuera 2 protocolos por incoherencia de modelo de negocio», «top-10 bruto», «se
descontaron 4 posiciones».*

Trabajo interno. El cliente quiere el resultado, no el recuento de lo que se tiró.

### 4. Decir que un dato falta
*«dato ausente → cuenta como incumplimiento», «no se pudo medir cuánto del circulante está
en pocas manos», «la estimación NO está calibrada».*

**El más frecuente de todos: 22 de 37 informes, 128 apariciones.** La regla del producto es
que lo que no hay no se muestra. Si falta un dato, el texto de cliente no lo nombra ni deja
un hueco con su nombre: se escribe sobre lo que sí hay.

### 5. Puntajes internos y rutas técnicas
*«Puntaje de fundamentales: 25 sobre 40», «Fuente: fapi/v1/exchangeInfo».*

Aparece en 22 de 37 informes, pegado al final de una frase por lo demás buena. El puntaje es
de uso interno y la ruta de una API no le dice nada a nadie.

### 6. Hablar de nuestro propio proceso
*«y una magnitud sin respaldo no se publica».*

El informe no debe narrar sus propias reglas editoriales mientras las aplica.

### 8. Notas de método estadístico o de fuente
*«el ajuste Student-t (ν=2.55 sobre 46 observaciones) da VaR₉₅ 1d 47%»*, *«riesgo a 7 días por
bootstrap de bloques»*, *«los retornos son asimétricos hacia arriba (skew +1.54)»*, *«El adapter
de DeFiLlama lo envió y lo mantiene una cuenta del propio proyecto»*.

Son notas del método, no riesgos de la moneda. **Van al bloque Avanzado**, nunca a «Lo que
podría salir mal», que es donde aparecían.

### 9. Marcadores de dato que no aplica
*«1 de cada 20 días la caída supera **n/d**»*, *«la microestructura no se pudo evaluar»*,
*«no alcanzan los datos»*, *«calidad parcial»*.

Si un dato no aplica a esta moneda, la frase entera sobra. En STONK, cuatro de los ocho bloques
de lectura se caen enteros por esto, y eso está bien: mejor cuatro bloques verdaderos que ocho
con huecos.

### 7. No hay con qué comparar
*«no se puede comparar con pares: el protocolo no tiene categoría en DeFiLlama».*

Es un hueco de datos contado como si fuera una conclusión. O hay comparación, o no se habla
del asunto.

---

## Tres cosas que una sustitución de palabras no arregla

Esto es lo que justifica el Narrador, más que ninguna lista.

1. **El género y el número se rompen.** Cambiar `TVL` por «fondos bloqueados» convierte
   «el TVL» en «el fondos bloqueados». Se puede parchear caso por caso, y así está hecho,
   pero cada artículo nuevo es un parche nuevo.
2. **La frase buena y la mala van pegadas.** *«las diez mayores posiciones tienen 42,9 % del
   circulante, y la lectura de flujos es "sin lectura"»* es una sola frase: media vale y
   media no. El filtro corta por punto, así que o la deja entera o la tira entera.
3. **Voseo y minúscula inicial.** El sistema escribe *«todavía no hay datos guardados de
   RAY… pedí uno profundo»*. La web lo pasa a tuteo y lo capitaliza al mostrarlo, pero con
   textos largos eso no alcanza. La regla es **español neutro con tuteo**, siempre.

---

## Tabla completa, medida sobre los informes de hoy

<!-- Generado por site/scripts/patrones-prosa.ts sobre 70 informes. No editar a mano. -->

| Patrón | Qué es | Informes | Veces | Ejemplo real |
|---|---|---:|---:|---|
| `habla de un dato que falta` | habla de un dato que falta | 36 | 247 | …terminado por datos ausentes · OI/mcap: dato ausente → cuenta como incumplimiento (§8.3) |
| `\bsupply\b` | inglés sin traducir → circulante | 36 | 96 | …iez mayores posiciones tienen 42.9% del supply de referencia, y la lectura de flujos es 'sin lectura'. |
| `puntaje de` | Puntajes internos y rutas técnicas | 36 | 70 | …pa de esa caja por una vía verificable. Puntaje de fundamentales: 25 sobre 40. |
| `sobre 40` | Puntajes internos y rutas técnicas | 36 | 70 | …rificable. Puntaje de fundamentales: 25 sobre 40. |
| `puntaje interno` | puntaje interno | 36 | 70 | …pa de esa caja por una vía verificable. Puntaje de fundamentales: 25 sobre 40. |
| `colas gruesas` | Notas de método estadístico o de fuente | 36 | 70 | …aída media es 12.5%, según el modelo de colas gruesas sobre 500 días de historia. |
| `no hay dato` | Decir que un dato falta | 33 | 114 | No hay dato para medir esto: sin asimetría favorable por fundamentales: no hay escenario alcista cuantificado por valuación relativa. Ver la vara refl… |
| `no está calibrada` | Decir que un dato falta | 33 | 50 | …mbustible que una subida. la estimación NO está calibrada: el reparto de apalancamiento es una convención y no un dato medido, y se corrige cuando hay… |
| `no se puede comparar` | No hay con qué comparar: es un hueco | 26 | 46 | no se puede comparar con pares: el protocolo no tiene categoría en DeFiLlama: no se puede armar un set de comparables por categoría y cotiza a 1/2 de… |
| `,?\s*y la lectura de [^.]*?es '?sin lectura'?` | coletilla que dice que falta el dato → (se quita) | 22 | 44 | …es tienen 42.9% del supply de referencia, y la lectura de flujos es 'sin lectura'. |
| `vocabulario interno` | vocabulario interno | 20 | 80 | …/ capitalización de mercado, campo del paquete) · por debajo de 0.0164 (mediana de los comparables ANCHORED usados en §2.5) |
| `el mínimo` | Criterios y mínimos del método | 20 | 55 | …les válidos: sólo 0 pasan el criterio y el mínimo es 3, así que NO se calcula brecha por valuación relativa. Quedaron fuera: 1 donde el negocio compar… |
| `\brevenue\b` | inglés sin traducir → ingresos | 16 | 74 | …captura de valor verificada (ANCHORED, revenue/mcap 9.45%) pero tier MEDIO: dos de los tres incumplimientos que lo llevaban a ALTO fueron corregidos… |
| `no se pudo medir` | Decir que un dato falta | 15 | 26 | no se pudo medir cuánto del supply está en pocas manos. |
| `arriesgás` | voseo → arriesgas | 14 | 38 | …– 10.26x en 172 días; y esto es lo que arriesgás: 0.68x – 1.00x si se cumple la condición de invalidación. |
| `\s*§\s*[\d.]+(\s*S\d+)?` | referencia a un apartado del método → (se quita) | 14 | 37 | …o ausente → cuenta como incumplimiento (§8.3) |
| `referencia a un apartado` | referencia a un apartado | 14 | 37 | …o ausente → cuenta como incumplimiento (§8.3) |
| `\bTVL\b` | sigla sin explicar → fondos bloqueados | 13 | 49 | TVL de Raydium en DeFiLlama (dl_tvl_usd, protocolo raydium-amm) · por debajo de 843.284.646 USD (nivel registrado 30 días antes de este informe, previ… |
| `pasan el criterio` | Criterios y mínimos del método | 13 | 29 | …pares: sin comparables válidos: sólo 0 pasan el criterio y el mínimo es 3, así que NO se calcula brecha por valuación relativa. Quedaron fuera: 1 don… |
| `sin comparables válidos` | Listas de descarte: trabajo interno, no lectura | 13 | 29 | no se puede comparar con pares: sin comparables válidos: sólo 0 pasan el criterio y el mínimo es 3, así que NO se calcula brecha por valuación relativ… |
| `no se publica` | Hablar de nuestro propio proceso editorial | 12 | 24 | …implicaría, y una magnitud sin respaldo no se publica |
| `sin respaldo` | Hablar de nuestro propio proceso editorial | 12 | 24 | …ue medir qué implicaría, y una magnitud sin respaldo no se publica |
| `con los? que medir` | No hay con qué comparar: es un hueco | 12 | 24 | …izador identificado pero no comparables con los que medir qué implicaría, y una magnitud sin respaldo no se publica |
| `habla de nuestro proceso` | habla de nuestro proceso | 12 | 24 | …ue medir qué implicaría, y una magnitud sin respaldo no se publica |
| `quedaron fuera` | Listas de descarte: trabajo interno, no lectura | 11 | 27 | …calcula brecha por valuación relativa. Quedaron fuera: 1 donde el negocio comparado es una esquina de lo que factura la entidad (SOSO) y cotiza a 1/1… |
| `\b(el|El)\s+revenue\b` | singular masculino: conserva verbo y adjetivo → $1 ingreso | 10 | 16 | Si el revenue del protocolo en 30 días queda por debajo de 97.979 USD en la próxima medición, la quema de gas, única vía de captura de APT, se estaría… |
| `identificador técnico` | identificador técnico | 9 | 49 | TVL de Raydium en DeFiLlama (dl_tvl_usd, protocolo raydium-amm) · por debajo de 843.284.646 USD (nivel registrado 30 días antes de este informe, previ… |
| `una esquina de lo que factura` | Listas de descarte: trabajo interno, no lectura | 9 | 21 | …fuera: 1 donde el negocio comparado es una esquina de lo que factura la entidad (SOSO) y cotiza a 1/10 de su máximo histórico de 1.5200 USD (2024-04-… |
| `banda de tamaño` | Listas de descarte: trabajo interno, no lectura | 8 | 21 | …fuera: 12 del mismo negocio fuera de la banda de tamaño (G, ADA, SOL, ZK, MOVE, BERA, XTZ, TRX, S, BERA, MON, XPL) y cotiza a 1/28 de su máximo histór… |
| `dato ausente` | Decir que un dato falta | 7 | 17 | …terminado por datos ausentes · OI/mcap: dato ausente → cuenta como incumplimiento (§8.3) |
| `con los? que construir` | No hay con qué comparar: es un hueco | 5 | 11 | …neda no tiene revenue, TVL ni tenedores con los que construir un múltiplo comparable y cotiza a 1/27 de su máximo histórico de 19.9200 USD (2023-01-26… |
| `no tiene revenue` | No hay con qué comparar: es un hueco | 5 | 11 | …se puede comparar con pares: la moneda no tiene revenue, TVL ni tenedores con los que construir un múltiplo comparable y cotiza a 1/27 de su máximo h… |
| `ni tenedores` | No hay con qué comparar: es un hueco | 5 | 11 | …pares: la moneda no tiene revenue, TVL ni tenedores con los que construir un múltiplo comparable y cotiza a 1/27 de su máximo histórico de 19.9200 US… |
| `voseo` | voseo | 5 | 8 | …debajo de 250.112.124 USD, el nivel de hace 30 días, en la medición de los próximos 30 días: se revertiría la base de liquidez que acompañó al mes de… |
| `el motor` | Nombres de los agentes y del sistema | 5 | 7 | …za el 'unlock 60d' que sigue AUSENTE en el motor (sin fecha) |
| `no se pudo evaluar` | Marcadores de dato que no aplica | 5 | 6 | …ra verificable, pero la microestructura no se pudo evaluar: ANCHORED exige no ser perp-driven y eso no está comprobado. Puntaje de fundamentales: 19 s… |
| `no está comprobado` | Marcadores de dato que no aplica | 5 | 6 | …ANCHORED exige no ser perp-driven y eso no está comprobado. Puntaje de fundamentales: 19 sobre 40. |
| `\bn/d\b` | Marcadores de dato que no aplica | 4 | 7 | 1 de cada 20 días la caída supera n/d, y cuando eso pasa la caída media es n/d, según el modelo de colas gruesas sobre 47 días de historia. |
| `\bN/D\b` | Marcadores de dato que no aplica | 4 | 7 | 1 de cada 20 días la caída supera n/d, y cuando eso pasa la caída media es n/d, según el modelo de colas gruesas sobre 47 días de historia. |
| `no alcanzan los datos` | Marcadores de dato que no aplica | 4 | 6 | no alcanzan los datos para decir si el precio lo mueve el apalancamiento o la compra al contado. |
| `\b(el|El)\s+TVL\b` | sigla con artículo: cambia el número → los fondos bloqueados | 3 | 8 | …ital hacia AMMs de Solana que ya empujó el TVL de Orca +8.1% en 30 días se sostiene |
| `\brevenue anualizado\b` | inglés sin traducir → ingresos anualizados | 2 | 13 | revenue_sobre_mcap (revenue anualizado del protocolo / capitalización de mercado, campo del paquete) · por debajo de 0.0164 (mediana de los comparable… |
| `observable` | Nombres de los agentes y del sistema | 2 | 4 | …en la que SHIB lideró y PEPE acompañó, observable en el volumen de los pares meme en los exchanges centralizados. |
| `\bobservable\b` | término del taller → señal | 2 | 4 | …en la que SHIB lideró y PEPE acompañó, observable en el volumen de los pares meme en los exchanges centralizados. |
| `campo del paquete` | Puntajes internos y rutas técnicas | 1 | 12 | …protocolo / capitalización de mercado, campo del paquete) · por debajo de 0.0164 (mediana de los comparables ANCHORED usados en §2.5) |
| `comparables cumplen` | Criterios y mínimos del método | 1 | 12 | …n valuación relativa disponible: solo 0 comparables cumplen el criterio y el mínimo es 3. y cotiza a 1/24 de su máximo histórico de 65.8200 USD (2024-… |
| `cuenta como ausente` | Decir que un dato falta | 1 | 6 | …róximo unlock de tokens: no verificado, cuenta como ausente y no a favor (sin fecha) |
| `umbral` | Nombres de los agentes y del sistema | 1 | 4 | …ido el crecimiento que acerca a USDe al umbral de 7.500M USD del que depende la recompra. |
| `\bumbral\b` | término del taller → límite | 1 | 4 | …ido el crecimiento que acerca a USDe al umbral de 7.500M USD del que depende la recompra. |
| `fuente: [a-z0-9/._-]+$` | Puntajes internos y rutas técnicas | 1 | 3 | …derivados = ausente (§8.3 'sin perp'). Fuente: fapi/v1/exchangeInfo |
| `\bVaR\b` | Notas de método estadístico o de fuente | 1 | 2 | …la fecha de aprobación de la propuesta varía según la fuente. (sin fecha) |
| `\badapter\b` | Notas de método estadístico o de fuente | 1 | 2 | …ondos a mercados Midnight de tasa fija (adapter de vaults) (sin fecha) |
| `\bcorrida\b` | término del taller → pasada | 1 | 1 | …recio de BTC en CoinGecko en la próxima corrida, contra el piso de la zona densa de liquidaciones de largos proyectadas. |
| `supply total` | Listas de descarte: trabajo interno, no lectura | 1 | 1 | Objetivo de tokenómica: reducir ~20% el supply total de CAKE. (sin fecha) |
| `\bdel\s+revenue\b` | contracción en singular → del ingreso | 1 | 1 | Que la recompra y quema del 50% del revenue siga ejecutándose durante el año programado desde el 2026-04-28. |
| `sin medición` | Decir que un dato falta | 1 | 1 | …con cada pago desde marzo de 2026, pero sin medición de que esa quema retire tokens en neto y con su cadena a punto de migrar sin destino elegido. |
