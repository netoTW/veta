# Especificación de lanzamiento

Fase 1 · 26-sep-2026 · **sin código**. Cuando la apruebes, construyo todo sin consultarte salvo
bloqueos y entrego un único informe final con evidencia. Lo que no está aquí va a `BACKLOG.md`.

Cada punto trae: **diagnóstico** (lo que encontré hoy, con evidencia), **qué haré**,
**aceptación** (cómo se comprueba, verificable por alguien que no soy yo) y **riesgos**.

Documento interno: usa vocabulario de taller. Los textos entre «comillas angulares» son los que
verá el cliente, y cumplen `CLAUDE.md`.

---

## 0. Antes de empezar: cinco cosas que necesito de ti

Ninguna frena la especificación, pero las marco porque condicionan partes del trabajo.

| # | Qué | Por qué | Mi propuesta |
|---|---|---|---|
| D1 | **SYN está publicado sin declarar tu tenencia.** El contrato del motor (§19, 21-sep) declara SYN con conflicto de interés y lo marca `solo_admin`. El registro que sirve hoy la web es anterior: `solo_admin: false`, sin declaración. La web ya oculta todo `solo_admin` (`server/contenido.ts:62,141`), así que se arreglará solo cuando el motor reexporte… pero hoy está a la vista. | Tenencia no declarada junto al informe. No puedo despublicar sin que me lo pidas. | **Despublicar SYN desde la bandeja ahora**, o pídeme que lo haga. |
| D2 | **«Lo que no hay, no se muestra» choca con dos encargos.** La ficha gratis pide marcar cada dato como *no disponible*, y los informes incompletos piden enseñar el dato ausente o la cifra quitada. | `CLAUDE.md` lo prohíbe expresamente. | La forma de §4 y §6: **nunca una casilla vacía con nombre**, sino una sola línea discreta al final del bloque. Si la apruebas, actualizo `CLAUDE.md` con la excepción. |
| D3 | **Nombre y RUT** para Términos y Privacidad. | Es lo único que falta (§11). | Me los pasas y los pongo. |
| D4 | **Cuentas de prueba en producción.** El banco (§13) exige registro, recuperación y cambio de plan de punta a punta en los cinco roles. | Crear y luego borrar cuentas es de las cosas que no hago sin permiso. | Aprobando esta especificación me autorizas a crear `prueba-<rol>-<fecha>@vetalab.io` y a borrarlas al terminar. Ni pago ni apruebo nada con ellas. |
| D5 | **Fila de prueba que dejé en la base.** Al diagnosticar la ficha gratis, una consulta a `/api/analizar/determinista` (CELO) insertó `solicitud sol-20260926-58311b` y su fila en `uso_analisis`. | Error mío. Contamina el recuento de uso. | La borro al aprobar. |

---

## 1. Bucle en la recuperación de contraseña

**Diagnóstico.**
- **Corrección de partida:** la autenticación no es de Supabase, es **better-auth**. Supabase es sólo la base Postgres. El evento `PASSWORD_RECOVERY` no existe en este sistema.
- **El flujo del servidor está sano.** Probado con curl: el enlace `/api/auth/reset-password/<token>?callbackURL=/restablecer` redirige **una sola vez** a `/restablecer?token=…`, o a `?error=INVALID_TOKEN` si el token no vale. `/restablecer` responde 200 sin redirecciones. En el código no hay ningún `<Navigate>` ni guardia que lleve a `/entrar`.
- **Dos causas candidatas.** Ninguna está vista todavía en un navegador:
  1. **`lazySeguro()` puede recargar sin fin** (`src/lib/fragmentos.ts`). Recuerda que ya recargó en `sessionStorage`. Si `sessionStorage` falla, `yaRecargo()` devuelve siempre `false`, la anotación falla en silencio y recarga para siempre. Pasa en los visores integrados de algunos clientes de correo y con el almacenamiento bloqueado, lo que encaja con «desde el enlace del correo». Además, la marca es una sola clave global que borra cualquier fragmento que cargue bien, y la hora que guarda no se lee nunca: no hay ventana de tiempo.
  2. **La escena 3D de las páginas de acceso.**
     - `src/auth/Paginas.tsx:6` importa `controlInicial` desde `three/HeroScene` de forma estática, lo que arrastra three.js (416 KB) a `/restablecer`.
     - `AuthEscena` monta un Canvas que se redibuja en cada fotograma.
     - Compilar los shaders puede bloquear el hilo principal antes del primer pintado: pantalla en blanco y ventilador a tope, sin que haya bucle.
     - Si es esto, `/entrar` y `/registro` también fallan en ese mismo equipo.
- **Hueco de seguridad al lado:** `Paginas.tsx:103` acepta `?volver=//otro-dominio`, porque `startsWith('/')` lo deja pasar. Es una redirección abierta tras entrar.

**Qué haré.**
1. **Reproducir primero**, en Chrome y con captura:
   - `/restablecer`, `/restablecer?error=INVALID_TOKEN` y un enlace real de recuperación de una cuenta de prueba.
   - En cada caso, con `sessionStorage` normal y bloqueado.
   - Cuento navegaciones en Network y tareas largas en Performance.
   - Anoto cuál de las dos causas es la real. Si aparece una tercera, la arreglo igual y la documento.
2. **Guardia única de navegación.** Un módulo nuevo, `src/lib/guardaNavegacion.ts`, con `puedo(tipo, clave)`:
   - Una recarga o redirección automática con la misma clave **no se repite dentro de 10 s**.
   - Si `sessionStorage` falla, usa `window.name` como respaldo. Si también falla, **niega**: ante la duda, no recarga.
   - Cada negativa se registra en `POST /api/fallo`.
3. Todo lo automático pasa por ella:
   - `lazySeguro`.
   - Las `nav()` dentro de efectos (`Paginas.tsx:107`), mediante `useNavegarUnaVez`.
   - El plugin de redirección del cliente de better-auth, envuelto en `src/lib/auth.ts`.
4. **Regla de lint**, `no-restricted-syntax` en oxlint/eslint: prohíbe `location.reload/assign/replace`, `location.href =` y `useNavigate()` dentro de `useEffect` fuera de la guardia. Así no vuelve a entrar un bucle nuevo sin que el compilador lo diga.
5. **Páginas de acceso ligeras.**
   - `controlInicial` pasa a un módulo sin three.js.
   - La escena 3D se monta después del primer pintado y sólo si el equipo es de gama alta.
   - `/restablecer` y `/recuperar` no la llevan: formulario sobre fondo fijo.
6. `volver` sólo acepta rutas propias: empieza por `/` y no por `//`.

**Aceptación.**
- **A1.1** Prueba Playwright con Chrome real, tres casos: enlace de correo válido, token caducado y ruta directa. Cada uno se prueba con almacenamiento normal y con `sessionStorage` lanzando excepción. En los seis:
  - como mucho **una** navegación de documento en 10 s;
  - el formulario visible en menos de 2 s;
  - ninguna tarea larga de más de 200 ms en el hilo principal.
- **A1.2** Recuperación de punta a punta con una cuenta de prueba: pedir el enlace, abrir el correo, fijar la contraseña nueva, entrar con ella y comprobar que la vieja ya no entra.
- **A1.3** Prueba unitaria de `guardaNavegacion`: la segunda llamada en menos de 10 s se niega; con almacenamiento roto se niega siempre.
- **A1.4** El lint falla si se añade un `location.reload()` suelto (lo compruebo con un fichero trampa y lo quito).
- **A1.5** `/entrar?volver=//evil.com` deja en `/`.
- **A1.6** El bundle de `/restablecer` no incluye three.js (lo comprueba el manifiesto de Vite).

**Riesgos.**
- Puede que no lo reproduzca en mi equipo. Tomo como aceptación A1.1 en las seis variantes y te pido que lo pruebes en el tuyo al entregar.
- La guardia podría frenar una recarga legítima, por ejemplo un despliegue a mitad de sesión. Con 10 s de ventana, lo peor que pasa es que se ve el límite de error con el botón «Recargar».

---

## 2. Detalle cuando un análisis no pasa la verificación

**Diagnóstico.**
- **Lo que llega al bloquearse** es sólo `verificador: { estado: 'bloqueado', motivo_bloqueo }` (`servicio/estado.py:266-278`). El motivo es el texto crudo del motor, con §, backticks y jerga. Ejemplo real: «control de cobertura (§3): contradicción de tiempo — la tesis latente se declara `no_cumplido`…».
- **La web lo pinta tal cual** (`Analizar.tsx:309`), sin pasarlo por el filtro de lenguaje. Hoy se le cuela al cliente. Lo mismo con `fallo.texto`, que puede traer `ModuleNotFoundError`.
- **Las cifras fallidas existen en el motor** (`verificador.reconsultas[]` con `valor_informe`, `valor_fuente`, `coincide`, `fuente_url`), pero sólo dentro del registro completo, y un registro bloqueado nunca entra en la base. **Al cliente no le llega ninguna cifra.**

**Qué pido al motor** (contrato, §20.1 nuevo). En `Progreso.verificador` al bloquear:
```json
"verificador": {
  "estado": "bloqueado",
  "motivo_bloqueo": "…crudo, sólo admin…",
  "motivo_bloqueo_cliente": "Dos cifras del informe no coinciden con su fuente.",
  "cifras_fallidas": [
    { "que": "GPUs en la red", "valor_informe": "446", "valor_fuente": "418",
      "fuente": "Akash Network · estadísticas", "fuente_url": "https://…", "consultado": "2026-09-19T17:27:36Z" }
  ]
}
```
`que` y `fuente` vienen en lenguaje de cliente. Los valores, ya formateados con coma decimal y espacio duro.

**Qué haré.**
- Pantalla de bloqueo (texto en §5, estado «no pasó el control»): la lista de cifras fallidas, una por línea, con enlace a la fuente.
- Mientras el motor no mande `cifras_fallidas`, **no se inventa nada**: se muestra el texto general y el motivo crudo **nunca**.
- Admin ve el motivo crudo y las `reconsultas` completas en `/admin/consumo` y en la bandeja.
- `fallo.texto` y `detalle` pasan siempre por `prosaDeCliente`. Si el filtro los vacía, cae el texto fijo de su código (§5).

**Aceptación.**
- **A2.1** Hay una fixture de progreso bloqueado con dos `cifras_fallidas`. La pantalla muestra las dos: qué, cifra del informe, cifra de la fuente y fuente enlazada. Captura incluida.
- **A2.2** Con la fixture real `sol-20260919-900003.json` (motivo con «§3» y backticks), el cliente no ve ni «§», ni `no_cumplido`, ni «tesis latente». La auditoría de lenguaje pasa en esa pantalla.
- **A2.3** El admin, sobre el mismo pedido, ve el motivo crudo.

**Riesgos.** Depende de que el motor añada `cifras_fallidas`. Sin eso, el detalle por cifra queda sin probar con datos reales y lo marco como pendiente del motor en el informe final.

---

## 3. Tiempos de respuesta

**Diagnóstico** (medido hoy, con números).
- **No hay regresión: la comparación partía de un error.** Los «0,2–0,6 s» de `TRASPASO.md` eran la portada estática de Vercel, que sigue en 0,24–0,36 s. Las rutas de la API nunca estuvieron ahí. Desde el 21-sep, el único cambio en `server/` es el arreglo del arranque.
- **Por tramos**, para `/api/contenido/analisis`:

| tramo | tiempo |
|---|---|
| aplicación en el VPS | 305 ms en caliente · 835 ms en frío |
| suelo de red Brasil → Vercel → Alemania (ruta sin base) | ~0,5 s |
| desde fuera, 20 peticiones | p50 1,27 s · p95 3,3 s |

- **Supabase está en `us-east-1`** y el VPS en Alemania: **100 ms por consulta** y 660 ms por conexión nueva. El pool cierra las conexiones tras 30 s de inactividad, así que la primera petición después de una pausa paga los 660 ms.
- **Consultas N+1:** `analisisPara` hace 1 + 14 consultas (`estadoPublicacion` por registro) para 4 decisiones que caben en memoria. `anticipadasPara` hace otras N en serie.
- **La lista de análisis pesa 301 KB** para 3 informes: manda el registro completo.

**Qué haré.**
1. **Caché en memoria de las decisiones de publicación.** Un mapa `informe_id → estado`, cargado en una consulta al arrancar e invalidado en cada decisión de la bandeja. Lo usan `analisisPara`, `gemasPara`, `anticipadasPara` y `marcadorAgregado`: **cero consultas por petición** para el contenido público.
2. Caché de los resultados a pedido, invalidada cuando una solicitud pasa a `listo`.
3. **Pool en caliente:** `idleTimeoutMillis` a 10 min y un `SELECT 1` cada 4 min.
4. **Lista ligera:** `/api/contenido/analisis` devuelve lo que pinta la lista (titular, veredicto, fecha, símbolo, estado). El registro completo va sólo en `/api/contenido/analisis/:id`.
5. `scripts/medir.mjs` mide y deja el resultado en `informes/tiempos-<fecha>.json`.

**Objetivo verificable.**
- **A3.1 · En el VPS** (`localhost:8790`, 50 peticiones por ruta, con y sin sesión, incluida la primera tras 10 min sin tráfico): **p95 ≤ 50 ms** en `/api/contenido/{analisis,gemas,seguimiento,noticias,marcador}`.
- **A3.2 · Desde fuera** (`www.vetalab.io`, 50 peticiones): **p95 de cada ruta ≤ p95 de `/api/contenido/meta` + 250 ms**. Se resta `meta` para no culpar a la aplicación de la red de quien mide.
- **A3.3** `/api/contenido/analisis` pesa **≤ 40 KB** sin comprimir con los informes de hoy.

**Riesgos.**
- **La distancia a Supabase queda.** Con la caché no afecta al contenido público, pero sí a sesión, cupo y admin (100 ms por consulta). **Mover Supabase a Frankfurt** lo arregla de raíz. Toca servidor y base, así que va a `BACKLOG.md` como decisión tuya y no forma parte de la aceptación.
- **Invalidación de la caché:** si una decisión se escribe por otra vía que no sea la bandeja, la caché miente. Mitigación: la bandeja es la única vía que escribe (ver §7), y la caché se recarga además cada 60 s.

---

## 4. «Analiza tu moneda» gratis

**Diagnóstico.** No está roto: **está diseñado para no funcionar con monedas nuevas.**
- **El motor no calcula nada:** `/determinista` lee el último `reports/<SÍMBOLO>-*/paquete.json` y, si no existe, devuelve 404 (`servicio/rutas.py:102-118`). Del universo de **405 monedas, sólo 30 tienen informe**: las otras 375 y cualquier contrato de fuera ven «todavía no tiene lectura guardada». El contrato pedía otra cosa (§3: «instantánea, ≤ 3 s»; §7.2: «reutilizando las etapas deterministas»).
- **Además:**
  - `/analizable` tarda 27–30 s y `/resolver` con contrato, 7 s, contra el límite de 8 s de la web.
  - GENIUS, ICP y MORPHO pasan a veces de 10 s y la web devuelve 503. MORPHO es el ejemplo del placeholder.
  - Los datos son del 17 al 22-sep.
  - El motor manda `tokenomics.lectura = "captura_citada"`, que la web no conoce, y el chip desaparece.
  - Los textos traen «§» y «motor».
  - **No hay ningún límite de consultas**, y cada lectura escribe dos filas.

**Lo que necesito que el motor exponga** (§21 del contrato, la ficha determinista). Lo escribo como **necesidades**, para que calce con la especificación del motor.

*Ruta:* `POST /ficha { simbolo?, id_coingecko?, contrato?, cadena? }`. Sirve para **cualquier** moneda que `/resolver` encuentre, dentro o fuera del universo, calculada al momento o desde una caché de ≤ 24 h. Plazo: **p95 ≤ 10 s**.

*Por cada dato de la ficha*, la misma forma:
```json
{ "clave": "libro_2pct", "etiqueta": "Profundidad del libro a ±2 %",
  "valor": 516223, "unidad": "USD",
  "estado": "medido" | "estimado" | "no_disponible",
  "fuente": "Binance · spot", "medido_en": "2026-09-26T08:00:00Z",
  "nota_estimado": "a partir de los 3 mayores libros" }
```
- `estado` es obligatorio. `valor` es `null` si y sólo si `no_disponible`. `nota_estimado`, si y sólo si `estimado`.
- `fuente` y `medido_en` son obligatorios salvo en `no_disponible`.

*Los datos que necesito mostrar*, agrupados en las cinco preguntas que ya pinta la web:

| bloque | datos | lectura en una palabra |
|---|---|---|
| Qué mueve el precio | futuros sobre contado, financiación, interés abierto 7 d | `demanda_real · mixta · apalancamiento` |
| Caídas | peor semana de cada 20 (CVaR 7 d), caída máxima 90 d | `contenida · alta · extrema` |
| Quién la tiene | top-10 neto de exchanges y contratos, n.º de tenedores | `dispersa · concentrada · muy_concentrada` |
| Si el token cobra | ingresos 30 d, parte que llega al token | `captura_verificada · captura_declarada · captura_citada · sin_captura` |
| Salida | libro a ±2 %, volumen 24 h | `profunda · suficiente · fina` |

- Cabecera: `precio_usd`, `var_24h`, `var_7d`, `mcap_usd`, `cadena`, `contrato`, `fecha_datos`.
- Cierre: `analizable` y `motivo_no_analizable` (en lenguaje de cliente), para decidir el llamado al análisis completo.
- **Lectura de bloque cuando sus datos no bastan:** el bloque trae `lectura: null` y la web no pone palabra.

**Cómo lo muestro.** Es **[DISEÑO]**, y va aquí para que lo apruebes.
```
 CELO · Celo · Ethereum                                 datos de hoy 08:00
 0,3010 USD   +1,2 % en 24 h
 ─────────────────────────────────────────────────────────────────────────
 QUÉ MUEVE EL PRECIO                                         Demanda real
   Futuros sobre contado      2,76 ×          medido · Binance
   Financiación               0,01 %          medido · Binance
 SALIDA                                                          Suficiente
   Libro a ±2 %               516 223 USD     estimado · 3 mayores libros
 …
   No entra en esta ficha: concentración de tenedores.          ← D2
 ─────────────────────────────────────────────────────────────────────────
 Esto es la foto. El análisis completo te dice qué hacer con ella:
 la tesis, los escenarios y el número exacto que la invalida.
                                   [ Pide el análisis completo · Plan Base ]
```
- **Medido:** la cifra en blanco, con la fuente en gris al lado.
- **Estimado:** la cifra en gris claro y la palabra «estimado» con su nota al pasar el ratón o al tocar. Nunca en rojo.
- **No disponible (D2):** no hay fila con hueco. Los no disponibles de todo el bloque se juntan en **una línea** al final de la ficha: «No entra en esta ficha: …». Si un bloque entero no tiene nada, desaparece y su nombre va a esa línea.
- **Llamado al plan pago**, según quién mira:
  - Visitante: «Crea tu cuenta y pide el análisis completo».
  - Gratis: «Pasa a Base: 2 análisis completos al mes».
  - Base o Pro con cupo: botón directo.
  - Sin cupo: «Te quedan 0 este mes · pasa a Pro».
- Si `analizable` es `false`: «Para esta moneda te damos la foto; el análisis completo necesita {motivo}». Sin botón de pago.

**Límite de consultas.** Se aplica en el servidor, con valores ajustables desde `/admin/operacion` sin desplegar:

| quién | por día | ráfaga |
|---|---|---|
| visitante, por IP | 5 | 1 cada 5 s |
| gratis, por usuario (y su IP) | 15 | 1 cada 3 s |
| Base / Pro | 60 | 1 cada 2 s |
| admin | sin límite | — |

- **Al llegar al límite:**
  - Visitante: «Has usado tus 5 fichas de hoy. Con una cuenta gratis tienes 15 al día.» y el botón de registro.
  - Registrado: «Has usado tus fichas de hoy. Mañana tienes 15 más.»
  - Respuesta `429` con `reintentar_en`.
- La IP se toma de `X-Forwarded-For`, puesta por Caddy y Vercel: se confía sólo en el primer salto que añade Vercel.

**Qué haré en la web.**
- Cliente de `/ficha` con límite de 15 s y pantalla de espera por bloques. Mientras el motor no la tenga, sigue funcionando la ruta actual.
- La pantalla de arriba, el límite de consultas y el llamado por rol.
- `captura_citada` en las etiquetas.
- Dejo de escribir en `solicitud` y `uso_analisis` por cada ficha: un contador propio, `consulta_ficha`, con día, IP con hash, usuario y símbolo.
- Mientras `/analizable` tarde 30 s, la pantalla de «no da para análisis» se pinta con lo que `/resolver` ya devolvió y el veredicto llega después, sin bloquear.

**Aceptación.**
- **A4.1** Las 20 monedas del banco (§13), más un contrato EVM y uno de Solana de fuera del universo:
  - la ficha se ve completa;
  - cada dato lleva «medido» o «estimado» con fuente;
  - los no disponibles sólo aparecen en la línea de cierre;
  - ninguna pantalla en blanco ni 503.
  - Capturas de las 22.
- **A4.2** La consulta número 6 de un visitante desde la misma IP recibe 429 y el texto de arriba. La número 16 de un gratis, igual. Pruebas automáticas contra la vista previa.
- **A4.3** Cada rol ve su llamado correcto: 5 capturas.
- **A4.4** Una ficha no escribe en `solicitud`.
- **A4.5** La auditoría de lenguaje pasa en la ficha de las 22.

**Riesgos.**
- **Depende del motor:** sin `POST /ficha` sólo cubro las 30 con informe, y A4.1 queda sin cumplir. Es el bloqueo más probable de toda la lista.
- Las fuentes de pago o con límite (DefiLlama falla el 35 %) pueden hacer que muchas fichas salgan con datos «no disponibles».
- El límite por IP castiga a quien comparte red (oficinas, móviles con CGNAT): por eso el de un registrado es por usuario.

---

## 5. Cada estado de un pedido de análisis tiene su pantalla

**Diagnóstico.**
- Hoy existen los cinco estados, más «retenido por tope» (`en_cola` con `enviada = 0`).
- **No hay tiempo máximo:** un pedido `en_curso` o `en_cola` enviado puede quedarse así para siempre, con el cupo reservado y sin aviso.
- La cola no da ningún tiempo estimado: los profundos se lanzan a mano.
- El motivo de bloqueo y el `fallo.texto` salen crudos (§2).
- En admin hay voseo: «Subilo para que pasen al motor».

**Tiempo estimado en cola.**
- Lo ideal es que lo dé el motor: pido `inicio_estimado` (ISO) en `Progreso` cuando esté `en_cola`.
- Mientras no llegue, lo calculo con la mediana de espera, de `en_cola` a `en_curso`, de los últimos 20 pedidos, **si hay al menos 5**. Con menos historia, no pongo cifra. No se inventa un tiempo.

**Tiempo máximo.**
- `en_curso` sin que `actualizado` se mueva en **30 min**, o **3 h** desde `iniciado`, pasa a `fallido` con código `tiempo_agotado`: cupo devuelto y aviso.
- Los dos valores se ajustan en admin. Antes de fijarlos por defecto, reviso las duraciones reales en `progreso-web/`.
- La cola **no caduca**: esperar el lanzamiento es parte del servicio, y el cupo reservado no se descuenta.

**Textos** (el `{nombre}` es el de la moneda):

| estado | titular | cuerpo | acción |
|---|---|---|---|
| **en cola** | «Tu análisis de {nombre} está en la cola» | «Puesto {n}. Suele empezar en unas {h} horas.» *(sin historia suficiente: «Te avisamos en cuanto empiece.»)* «Tu cupo está reservado, no gastado: sólo se descuenta cuando el informe está listo y pasa nuestro control de calidad.» | «Puedes cerrar esta página» |
| **reservado** (tope) | «Tu análisis de {nombre} está reservado» | «Arranca en el próximo turno de análisis, sin que tengas que hacer nada. Te avisamos en cuanto empiece.» | — |
| **en curso** | «Analizando {nombre}» | Barra por etapa, con la actual resaltada: «Reuniendo datos de mercado, de la cadena y del protocolo» → «Calculando riesgo, liquidez y niveles» → «Buscando lo que podría salir mal» → «Escribiendo tu informe» → «Comprobando cada cifra contra su fuente». Debajo, el `detalle` del motor filtrado. | «Puedes cerrar esta página: te avisamos al terminar» |
| **entregado** | «Tu análisis de {nombre} está listo» | La primera línea del veredicto. | «Abrir el informe» |
| **no analizable** | «{nombre} no da para un análisis completo» | «{motivo en lenguaje de cliente}. No se descontó nada de tu cupo.» | «Ver su ficha gratis» · «Elegir otra moneda» |
| **no pasó el control** | «Este análisis no pasó nuestro control de calidad» | «Preferimos no entregarte un informe con cifras que no cuadran.» Lista de §2: «{que}: el informe decía {valor_informe}; {fuente} marca {valor_fuente}.» «No se descontó de tu cupo.» | «Pedirlo de nuevo» |
| **tiempo agotado** | «Este análisis tardó más de lo que aceptamos» | «Lo detuvimos para no hacerte esperar más. Tu cupo está intacto.» | «Pedirlo de nuevo» |
| **no terminó** · `fuente_caida` | «Una fuente de datos no respondió» | «Sin ella no firmamos un informe. Tu cupo está intacto.» | «Pedirlo de nuevo» |
| **no terminó** · `sin_serie_suficiente` | «{nombre} tiene muy poca historia todavía» | «Hace falta más historia de precio para un análisis serio. Tu cupo está intacto.» | «Ver su ficha gratis» |
| **no terminó** · `sin_cobertura` | «{nombre} está fuera de lo que cubrimos» | «Tu cupo está intacto.» | «Elegir otra moneda» |
| **no terminó** · `motor_no_disponible`, `cancelado` u otro | «Este análisis no terminó» | «Tu cupo está intacto: puedes pedirlo de nuevo.» | «Pedirlo de nuevo» |
| **estado desconocido** (red caída, respuesta rara) | «Estamos comprobando tu pedido» | «Tu cupo está a salvo. Esta página se actualiza sola.» | «Actualizar» |

- La barra y el aviso del navegador usan los mismos titulares.
- En admin, los mismos estados con vocabulario real y el motivo crudo. Arreglo el voseo.

**Aceptación.**
- **A5.1** Una fixture de progreso por fila de la tabla (13). La prueba recorre `/analizar/s/:id` con cada una y comprueba el titular exacto, que la pantalla no queda vacía y que la auditoría de lenguaje pasa. Capturas de las 13.
- **A5.2** Tiempo agotado: se simula un `en_curso` con `actualizado` de hace 31 min. A la siguiente sincronización pasa a `tiempo_agotado`, el cupo reservado vuelve (la cuenta cuadra en `cupo`) y se crea la alerta.
- **A5.3** Estado inventado `"raro"` o respuesta 500 de `/progreso`: sale «Estamos comprobando tu pedido», nunca en blanco.
- **A5.4** Con menos de 5 pedidos históricos, la cola no muestra horas. Con una fixture de 20, muestra la mediana.

**Riesgos.**
- Las duraciones reales del profundo pueden ser mayores de lo que creo. Por eso los plazos se ajustan en admin y reviso antes los datos.
- Un `tiempo_agotado` sobre un análisis que el motor sí termina después: el resultado llega, pero el pedido ya se cerró. Lo guardo igualmente y aviso al admin, sin descontar cupo.

---

## 6. Informes con datos incompletos

**Diagnóstico.**
- **Lo que el motor marca hoy:**
  - `fuentes[].calidad` (`ok · parcial · ausente`: 2386 / 234 / 680 en la base).
  - `senales_sin_fuente[]`.
  - `*.dato = 'ausente'`, `no_disponible_motivo`.
  - `reconsultas[].coincide = false`.
- **No existe una marca de «cifra quitada por el verificador».** Cuando no coincide, la cifra **se queda en el texto**.
- **Tampoco existe una marca de «obtenido de X, sin verificar».**
- **La web** oculta casi todo (`CATALOGO_MOTOR` lo trata como interno), pero `TablaFuentes` pinta `calidad` en crudo («ausente», «parcial») a los clientes.

**Lo que pido al motor** (§20.2 del contrato), en el registro:
```json
"integridad": {
  "no_disponibles": [ { "que": "concentración de tenedores", "motivo_cliente": "la cadena no publica sus tenedores" } ],
  "retiradas":      [ { "que": "GPUs en la red", "seccion": "lectura",
                        "motivo_cliente": "no coincidía con la fuente",
                        "motivo_interno": "reconsulta 3: 446 vs 334+84", "fuente_url": "…" } ],
  "sin_verificar":  [ { "que": "ingresos 30 d", "fuente": "Token Terminal", "seccion": "lectura", "cifra": "13 066 866 USD" } ]
}
```
- **Una cifra retirada sale del texto antes de exportar.** El motor no la deja en la prosa.
- **Las cifras sin verificar** llevan en la prosa una marca estable, `⟦sv:<índice>⟧`, que la web convierte en nota.

**Cómo lo muestro** (**[DISEÑO]**).
- **Un bloque «Sobre los datos de este informe»**, dentro del informe y justo después de «Lo que podría salir mal». Mismo tono sobrio, sin rojo, sólo si hay algo que decir:
  - «Obtenido de Token Terminal, sin verificar: ingresos de 30 días (13 066 866 USD).»
  - «Retiramos una cifra que no coincidía con su fuente: GPUs en la red.»
  - «No entra en este informe: concentración de tenedores (la cadena no publica sus tenedores).»
- **En el texto**, la cifra sin verificar lleva un subrayado punteado y la misma nota al pasar el ratón o al tocar.
- **`TablaFuentes`** deja de enseñar `ausente` y `parcial`:
  - Cliente: fuente, fecha y «verificada» o «sin verificar».
  - Admin: además la calidad cruda.
- **Admin**, en la bandeja: el bloque completo con `motivo_interno`, las `reconsultas` y `senales_sin_fuente` traducidas. Si hay retiradas o sin verificar, un aviso para que lo veas antes de aprobar.
- **Mientras el motor no mande `integridad`**, la web lo construye con lo que ya hay: `fuentes[].calidad = ausente` → no disponibles; `reconsultas[].coincide = false` → sólo admin, porque no puedo quitar la cifra del texto sin riesgo de romperlo.

**Aceptación.**
- **A6.1** Una fixture con los tres tipos. El bloque aparece con las tres líneas en tuteo, en el orden de arriba, y la cifra sin verificar lleva su nota. Captura en cliente y en admin.
- **A6.2** Una fixture sin nada incompleto: el bloque **no existe** en el DOM.
- **A6.3** Ninguna pantalla de cliente contiene las cadenas «ausente», «parcial», «calidad» ni «no disponible» fuera de ese bloque. Lo comprueba una regla nueva de la auditoría de lenguaje.
- **A6.4** En admin, la bandeja muestra `motivo_interno` y el aviso previo a aprobar.

**Riesgos.**
- Choca con «lo que no hay, no se muestra» (**D2**).
- Si el motor tarda, sólo cubro «no disponible» y «sin verificar a nivel de fuente». «Retirada» queda para admin.

---

## 7. Autoridad única sobre qué está publicado

**Diagnóstico.** Hoy hay **tres** fuentes de verdad:
1. **La web:** la tabla `publicacion`, que decides tú en la bandeja. Además hace un append a `base_contenido/publicacion.jsonl`, que **nadie lee**.
2. **La agenda del motor:** `engine/agenda.py:20-25` decide qué está publicado con `ledger.veredicto_bandeja == 'aprobado'`, que escribe la CLI del motor. Los 12 registros del ledger están en `None`, así que **la agenda nunca ve un informe aprobado por ti**.
3. **Las noticias:** salen con `publicable: true` sin pasar por la bandeja. La web sólo puede despublicarlas.

**La regla.** Lo que decides en la bandeja es la única verdad. La web la escribe, el motor la lee y **nadie más la escribe**.

**Cómo lo lee el motor.** Hay dos vías y propongo la primera:
- **(A · propuesta) Un fichero en el mismo servidor.**
  - En cada decisión de la bandeja, la web reescribe de forma atómica (temporal + `rename`) `/opt/veta/gem-pipeline/base_contenido/publicados-web.json`:
    ```json
    { "generado": "2026-09-26T08:00:00Z", "secuencia": 57,
      "informes": [ { "id": "CELO-20260919-183951", "tipo": "analisis", "estado": "publicado",
                      "decidido": "2026-09-21T15:00:00Z", "por": "admin" } ],
      "noticias_despublicadas": [ "not-20260925-03" ] }
    ```
  - Sólo aparecen las publicadas y las noticias despublicadas: **lo que no está, no está publicado**. `secuencia` crece con cada decisión y deja detectar un fichero viejo.
  - El motor lo lee cada vez que lo necesita (agenda, noticias, alertas) y **retira `veredicto_bandeja` del ledger** como fuente de publicación.
  - No hay red de por medio. Funciona aunque la API esté caída: queda el último fichero bueno.
- **(B)** `GET api.vetalab.io/api/motor/publicados` con token. Sirve si algún día el motor sale del VPS. Lo dejo en el backlog.

**Noticias.** El motor sigue marcando `publicable` como **candidatura**. La web publica por defecto lo que llega con `publicable: true`, porque las noticias no pasan por la bandeja, decisión del 19-sep. La despublicación sigue siendo sólo de la web y llega al motor por el mismo fichero.
- Si prefieres que las noticias pasen también por la bandeja, es un cambio de una línea en la regla. Dímelo.

**Qué haré.**
- El escritor atómico en la web, llamado tras cada decisión y al arrancar.
- Dejar de escribir `publicacion.jsonl`.
- Pedir al motor en el contrato (§20.3) que lea `publicados-web.json` y retire la otra vía.
- Un invariante (§9): la agenda servida sólo contiene `informe_id` que están en el fichero.

**Aceptación.**
- **A7.1** Aprobar y despublicar en la vista previa cambia el fichero en menos de 1 s, con `secuencia` + 1. Prueba automática.
- **A7.2** Con el API caído, el fichero sigue existiendo y es JSON válido: se mata el proceso a mitad de escritura en la prueba y queda el anterior.
- **A7.3** Cuando el motor lo implemente: la agenda de producción no contiene ningún `informe_id` ausente del fichero. Es un chequeo en el invariante de despliegue.

**Riesgos.**
- **El motor tiene que cambiar `agenda.py`.** Hasta entonces, la agenda sigue ciega a tus aprobaciones, como hoy. Lo marco como dependencia.
- **Permisos:** la web escribe en un directorio del motor. Lo hace como `veta:veta` y sólo en ese fichero, así que lo acuerdo en el contrato.

---

## 8. Prueba de contrato

**Diagnóstico.**
- **No hay tests en la web.** Ni vitest ni jest, sólo `typecheck` y lint.
- **Los helpers de formato no son coherentes entre sí:** `pct` espera una fracción y pone signo, mientras que `conUnidad('%')` espera el valor ya en porcentaje, con 2 decimales y sin signo.
- **El contrato no tiene una tabla de formato** que diga cómo se pinta cada cifra: sólo reglas sueltas (§4, §15.1).

**Qué haré.**
1. **Tabla de formato en el contrato** (§20.4), escrita por la web y confirmada por el motor. Por unidad:
   - `USD` precio: decimales según magnitud, igual que `precio()` hoy.
   - `USD` cantidad: sin decimales y espacio duro de miles.
   - `%`: una decimal, coma y espacio duro antes del signo.
   - `×`: dos decimales.
   - `p`: sin decimales.
   - Fecha: `26 sep 2026`.
   - Signo: «+» sólo en variaciones y «−» tipográfico.
   - Un solo número si mínimo = máximo.
2. **Un único formateador**, `cifraCliente(valor, unidad, contexto)`. Todas las pantallas de cliente pasan por él y cada cifra sale en el DOM con `data-cifra="<ruta del campo>"`.
3. **Datos de prueba:** exportaciones reales del motor, copiadas a `site/pruebas/contrato/fixtures/`. Son los 20 del banco (§13) y, mientras no existan, los 14 vigentes más los 30 `reports/`.
4. **La prueba**, con Playwright contra la vista previa servida con esas fixtures. Recorre cada pantalla de cliente de cada registro: informe, lista, gemas, seguimiento, ficha y noticias. Por cada `data-cifra`, lee el valor crudo del registro y lo formatea con una **implementación independiente** escrita directamente desde la tabla del contrato, no con `cifraCliente`. Compara texto contra texto: valor, unidad, redondeo y signo.
5. Además, una comprobación inversa: cualquier número visible sin `data-cifra` en una pantalla de cliente falla la prueba. Así ninguna cifra se escapa.

**Aceptación.**
- **A8.1** La prueba pasa con 0 discrepancias sobre todas las fixtures y lista cuántas cifras comprobó por pantalla.
- **A8.2** Se estropea a propósito el redondeo de `%` en `cifraCliente` y la prueba falla con el campo exacto. Luego se revierte.
- **A8.3** Cero números sin etiqueta en pantallas de cliente, salvo la lista blanca: año del pie, puesto en la cola.

**Riesgos.**
- Es la pieza más grande. Etiquetar cada cifra toca muchas pantallas: es mucho trabajo, pero mecánico.
- Números dentro de la prosa del motor («el TVL bajó un 12 %»): no son campos, así que se comprueban sólo por forma (coma decimal, espacio duro y signo) con expresiones regulares, no contra un valor.

---

## 9. Invariantes antes de cada despliegue

**Diagnóstico.**
- `auditar-lenguaje.mjs` y `barrido.mjs` **siempre salen con código 0**: no pueden frenar nada.
- No hay CI.
- **Vercel publica solo en cada `git push` a `main`**, así que hoy nada impide desplegar el front sin pasar las pruebas.
- La matriz de acceso es una sola y la comparten front y servidor (`src/lib/matriz.ts`), pero nadie comprueba que el servidor la aplica ruta por ruta.

**Qué haré.**
- **`npm run invariantes`** corre, en este orden, y cualquier fallo corta:
  1. `typecheck` (app y server) y lint, incluida la regla de navegación de §1.
  2. **Auditoría de lenguaje**: sale con 1 si encuentra algo. Amplío la lista con §6 y con los términos de `CLAUDE.md` que falten.
  3. **Matriz de acceso en el servidor**: una tabla generada desde `MATRIZ` de rol × ruta de API × código esperado. Se lanza contra la vista previa con cinco sesiones reales (visitante, gratis, base, pro, admin). Cualquier ruta nueva sin entrada en la tabla también falla.
  4. **Barrido**: los 5 roles × 2 anchos. Sale con 1 si hay una pantalla en blanco, un error de consola o una petición fallida.
  5. **Prueba de contrato** (§8).
- **`scripts/desplegar.sh`** es la única forma de desplegar. Corre los invariantes; si pasan, hace push, espera el despliegue del front, despliega la API y verifica en producción: busca el texto nuevo en el fragmento servido y comprueba que `systemctl is-active` responde.
- **Cerrar la puerta de Vercel.** Desactivo el despliegue automático de `main` (Ignored Build Step devolviendo 0), y `desplegar.sh` publica con `vercel deploy --prod` tras los invariantes. Además, un hook `pre-push` local que corre los invariantes, por si alguien empuja a mano.

**Aceptación.**
- **A9.1** Cuatro sabotajes, uno por invariante: un «tenés» en una pantalla, una ruta de admin abierta a `pro`, un componente que lanza al montar y una cifra con punto decimal. Con cada uno, `desplegar.sh` se detiene sin empujar nada. Guardo la salida de las cuatro pruebas.
- **A9.2** Un `git push` directo a `main` no despliega en Vercel: lo compruebo con el panel o con el id de despliegue sin cambiar.
- **A9.3** Sin sabotajes, `desplegar.sh` despliega de punta a punta y la verificación en producción sale bien.

**Riesgos.**
- **Cambiar el despliegue de Vercel toca la configuración de producción.** Va incluido en esta aprobación. Si prefieres no hacerlo, queda sólo el hook `pre-push`, que se puede saltar.
- Los invariantes tardan varios minutos, porque el barrido son 216 páginas. Lo acepto: un arreglo, un despliegue.

---

## 10. Vista de combustible (sólo admin) · al final

**Diagnóstico.**
- **El motor ya calcula combustible** (`engine/combustible.py`) y lo exporta en el registro, como `combustible` y como `niveles.combustible`, con la etiqueta «Posiciones apalancadas».
- La web no lo lee en ningún sitio.

**Qué haré.** Un panel en la bandeja y en el informe en modo admin con:
- lado dominante, nocional largo y corto, `squeeze_setup`, `lectura`, `confianza`, `calibrado`;
- los mercados usados;
- el motivo de ausencia, si lo hay.

Vocabulario real: es admin.

**Aceptación.**
- **A10.1** Con una fixture que trae combustible, el panel aparece en admin y **no** existe para ningún otro rol, ni en el DOM ni en la respuesta de la API. Lo comprueba la matriz de §9.
- **A10.2** Con `hay_combustible: false`, el panel enseña el motivo.

**Riesgos.** Va el último y no frena nada. Si el motor cambia la forma, se adapta.

---

## 11. Términos y Privacidad

**Diagnóstico.**
- **Ya están en producción** (`/terminos` y `/privacidad`, commit `13afbe1`, del 20-sep). `TRASPASO.md` decía «sin desplegar», y lo corrijo.
- **Faltan dos huecos:**
  - «Quién presta el servicio» (`Legales.tsx:48-49`) dice «una persona natural con domicilio en Chile».
  - El responsable del tratamiento en Privacidad (`:84`).

**Qué haré.**
- Pongo nombre y RUT (**D3**) en los dos sitios.
- Quito la frase «Borrador funcional, pendiente de revisión legal» del comentario del código. Ningún cliente la ve, pero engaña a quien lee el código.

**Aceptación.**
- **A11.1** El nombre y el RUT aparecen en `/terminos` y `/privacidad` en producción, comprobados en el fragmento servido.

**Riesgos.** Ninguno técnico. La revisión por un abogado sigue siendo cosa tuya.

---

## 12. Orden de construcción

Un arreglo, un commit y un despliegue por `desplegar.sh`.
- **Excepción:** §9 va **primero**, para que todo lo demás se despliegue ya con los invariantes.
- **La prueba de contrato** entra en los invariantes en cuanto existe. Hasta entonces, el paso 5 se salta con aviso.

1. §9 Invariantes y `desplegar.sh` (sin la prueba de contrato)
2. §1 Recuperación de contraseña y guardia de navegación
3. §3 Tiempos
4. §5 Estados del pedido y §2 detalle del bloqueo (misma pantalla)
5. §7 Autoridad de publicación (lado web)
6. §6 Datos incompletos (lado web, con lo que ya hay)
7. §8 Prueba de contrato, que se suma a los invariantes
8. §4 Ficha gratis: límite, pantalla y llamado ya; `/ficha` cuando el motor la tenga
9. §11 Legales (cuando llegue D3)
10. §10 Combustible
11. §13 Banco de pruebas completo e informe final

**Lo que pido al motor**, escrito en el contrato como §20 y §21 en cuanto apruebes:
- `cifras_fallidas` y `motivo_bloqueo_cliente`;
- `inicio_estimado`;
- `integridad`;
- leer `publicados-web.json` y retirar la otra vía;
- confirmar la tabla de formato;
- `POST /ficha`;
- **el banco de 20 informes**.

Además, sincronizo nuestra copia del contrato con la del motor: le faltan §13.1, §14 y §19.

---

## 13. Banco de pruebas: la definición de «listo»

**Diagnóstico.** **El banco de 20 informes del motor no existe todavía.** Lo que hay en `gem-pipeline`:
- `benchmark-congelado.json` (rendimiento, no informes);
- una regresión (`regresion_stonk.json`);
- respuestas de API grabadas;
- 37 carpetas de pasadas reales en `reports/`.

**Tiene que definirlo el motor:** 20 exportaciones congeladas, que cubran análisis y gema, con y sin datos incompletos, bloqueado, retirado y conflicto de interés. **Es el bloqueo principal del lanzamiento.**

**«Listo» es que pasen las tres, con evidencia en el informe final:**
1. **Los 20 informes** se ven completos en cliente y en admin, y la prueba de contrato (§8) da 0 discrepancias sobre ellos. Evidencia: salida de la prueba y una captura por informe.
2. **La ficha gratis** (§4) funciona para esas 20 monedas: A4.1 sobre ellas. Evidencia: 20 capturas y tiempos.
3. **Punta a punta en producción**, con cuentas de prueba (**D4**), en los cinco roles:
   - **Registro** y confirmación de correo.
   - **Recuperación de contraseña** (A1.2).
   - **Cambio de plan:**
     - subida gratis → base → pro, simulando el aviso de Whop firmado contra la vista previa (los mismos eventos que manda Whop);
     - en producción, el cambio manual desde admin;
     - la baja por `membership.deactivated`.
   - Cada rol ve exactamente lo que la matriz dice.
   - Evidencia: vídeo o secuencia de capturas por flujo y el resultado de la matriz.

**El pago real de Base lo haces tú al final.**
- La prueba de Whop con dinero real sigue abierta (`pago_evento` está vacío). Ese pago es el que cierra el último tramo: que el aviso traiga el origen de la visita.
- Tras hacerlo, compruebo la fila en `pago_evento` y el plan de la cuenta, sin tocar nada más.

**Límites que respeto:** no apruebo ni publico informes, no hago pagos y no toco el repo del motor. Todo lo del motor se pide por el contrato.
