# Especificación de lanzamiento

**Aprobada el 26-sep-2026** con las decisiones de Pablo (§0). Se construye según §12, con §9
primero, sin consultar salvo bloqueos, y se entrega un único informe final con evidencia. Lo que
no está aquí vive en `BACKLOG.md`.

Cada punto trae: **diagnóstico**, **qué haré**, **aceptación** (verificable por alguien que no
soy yo) y **riesgos**. Documento interno: usa vocabulario de taller. Los textos entre
«comillas angulares» son los que ve el cliente y cumplen `CLAUDE.md`.

Hace pareja con `gem-pipeline/ESPECIFICACION-LANZAMIENTO.md` (la del motor). Donde las dos
tocan lo mismo, manda lo que dice §0.

---

## 0. Decisiones tomadas (26-sep)

| Tema | Decisión |
|---|---|
| SYN | Despublicado por Pablo desde la bandeja (fila `publicacion` 5, 05:56 UTC). La noticia `not-20260922-1233-6e9641`, despublicada también. Comprobado sin sesión y con cuenta de prueba. |
| Tenencia declarada | **Ninguna moneda con tenencia declarada aparece en nada público, ficha incluida.** El motor la excluye (`f17836c`); la web lo comprueba en sus invariantes (§9). |
| No disponible | Una línea discreta al final, nunca una caja vacía. Excepción escrita en `CLAUDE.md`. |
| Verificador | **Corrige, no bloquea.** Desaparecen la pantalla «no pasó el control», `cifras_fallidas`, `motivo_bloqueo_cliente` y los códigos `fuente_caida`, `sin_serie_suficiente` y `sin_cobertura`. |
| Correcciones | El cliente **no ve las retiradas**: sólo «sin verificar» y la línea de no disponibles. Admin lo ve todo. |
| Reloj | **Es del motor.** La web nunca cierra un pedido por su cuenta. |
| Ficha | El motor adopta la forma de campo y los cinco bloques de §4, con `lectura: null` cuando faltan datos. La web filtra lo que es sólo de admin. |
| Publicación | `publicados-web.json` tal cual (§7). La web escribe §22 del contrato, y §23 con la tabla de formato. El motor escribe §20 y §21. |
| Pruebas de contrato | Con las exportaciones que el motor deja en `base_contenido/fixtures-contrato/`. |
| Despliegue | Se desactiva el despliegue automático de Vercel (§9). |
| Noticias | Siguen fuera de la bandeja. |
| Legales | Nombre y RUT fuera. Términos se queda como está; §11 pasa a `BACKLOG.md`. |
| Cuentas de prueba | Prefijo `prueba-`, borradas al final y listadas en el informe. |
| Escrituras en producción | Cada comando se muestra antes y Pablo lo aprueba en el momento. |

---

## 1. Bucle en la recuperación de contraseña

**Diagnóstico.**
- La autenticación es **better-auth**. Supabase es sólo la base Postgres: el evento
  `PASSWORD_RECOVERY` no existe en este sistema.
- Las redirecciones del servidor están sanas. El enlace del correo redirige una vez a
  `/restablecer?token=…`, o a `?error=INVALID_TOKEN`.
- Hay dos causas candidatas, sin ver todavía en un navegador:
  1. **`lazySeguro()` recarga sin fin si `sessionStorage` falla** (visores de clientes de
     correo, almacenamiento bloqueado). Además, la marca es global, la borra cualquier carga buena
     y la hora guardada no se lee nunca.
  2. **La escena 3D de las páginas de acceso.** `Paginas.tsx:6` importa `three/HeroScene`
     de forma estática (416 KB) y el Canvas se redibuja en cada fotograma: puede bloquear el hilo
     principal antes del primer pintado.
- Al lado hay una redirección abierta: `Paginas.tsx:103` acepta `?volver=//otro-dominio`.

**Qué haré.**
1. **Reproducir primero** en Chrome, con captura. Tres casos (enlace de correo real de una cuenta
   de prueba, token caducado y ruta directa), cada uno con almacenamiento normal y bloqueado.
2. **Guardia única** `src/lib/guardaNavegacion.ts`, con `puedo(tipo, clave)`:
   - Una recarga o redirección automática con la misma clave no se repite en 10 s.
   - Si falla `sessionStorage`, usa `window.name` como respaldo; si también falla, **niega**.
   - Cada negativa se registra en `/api/fallo`.
3. **Todo lo automático pasa por ella:** `lazySeguro`, las `nav()` dentro de efectos (con
   `useNavegarUnaVez`) y el plugin de redirección de better-auth.
4. **Regla de lint** que prohíbe `location.reload/assign/replace`, `location.href =` y
   `useNavigate()` dentro de un efecto fuera de la guardia.
5. **Páginas de acceso ligeras.** `controlInicial` pasa a un módulo sin three.js. La escena 3D
   se monta después del primer pintado; `/restablecer` y `/recuperar` no la llevan.
6. `volver` sólo acepta rutas propias.

**Aceptación.**
- **A1.1** Playwright con Chrome real, 3 casos × 2 almacenamientos. En cada uno: como mucho una
  navegación de documento en 10 s, el formulario visible en menos de 2 s y ninguna tarea larga
  de más de 200 ms.
- **A1.2** Recuperación de punta a punta con una cuenta de prueba. La contraseña nueva entra y
  la vieja no.
- **A1.3** Prueba unitaria de la guardia: la segunda llamada en 10 s se niega, y con
  almacenamiento roto se niega siempre.
- **A1.4** El lint falla con un `location.reload()` suelto.
- **A1.5** `/entrar?volver=//evil.com` deja en `/`.
- **A1.6** El bundle de `/restablecer` no incluye three.js.

**Riesgos.**
- Puede que no se reproduzca en mi equipo. Si pasa, basta A1.1 en las seis variantes, y Pablo
  lo prueba en el suyo.
- La guardia puede frenar una recarga legítima: como mucho sale el límite de error con
  «Recargar».

---

## 2. Registros viejos con `bloqueado` y textos crudos

**Diagnóstico.**
- El motor deja de emitir `bloqueado`: el verificador corrige y entrega (motor A.2).
- Aun así, en la base de la web hay pedidos viejos con `estado = 'bloqueado'`.
- Hoy `Analizar.tsx:309` pinta `motivo_bloqueo` crudo, con «§3» y backticks, y `:310` pinta
  `fallo.texto`, que puede traer un `ModuleNotFoundError`.

**Qué haré.**
- **Respaldo genérico para `bloqueado`:** «Este análisis no se completó. No se descontó de tu
  cupo: puedes pedirlo de nuevo.»
- El motivo crudo **no se muestra nunca al cliente**. En admin sí.
- `detalle` y `fallo.texto` pasan siempre por `prosaDeCliente`. Si el filtro los vacía, sale el
  texto fijo de su estado (§5).

**Aceptación.**
- **A2.1** Con las fixtures reales `sol-20260917-ff4ce9.json`, `sol-20260919-900003.json` y
  `sol-20260920-a5a5a5.json`, el cliente ve el respaldo genérico y ninguna de estas cadenas:
  «§», `no_cumplido`, «tesis latente», «Verificador». El admin ve el motivo crudo.
- **A2.2** Un `fallo.texto` con `ModuleNotFoundError` no llega al cliente.

**Riesgos.** Ninguno relevante.

---

## 3. Tiempos de respuesta

**Diagnóstico.**
- **No hay regresión.** Los «0,2–0,6 s» eran la portada estática. Por tramos, en
  `/api/contenido/analisis`:

| tramo | tiempo |
|---|---|
| aplicación en el VPS | 305 ms en caliente, 835 ms en frío |
| suelo de red | ~0,5 s |
| desde fuera | p50 1,27 s, p95 3,3 s |

- **Supabase está en `us-east-1`:** 100 ms por consulta y 660 ms por conexión nueva. El pool
  cierra las conexiones tras 30 s.
- **Consultas N+1:** `analisisPara` hace 1 + 14 consultas. La lista pesa 301 KB para 3 informes.

**Qué haré.**
1. Caché en memoria de las decisiones de publicación. Se carga al arrancar y se invalida en cada
   decisión (la misma función que escribe `publicados-web.json`, §7). Se recarga además cada 60 s.
2. Caché de los resultados a pedido, invalidada al pasar a `listo`.
3. Pool en caliente: `idleTimeoutMillis` de 10 min y un `SELECT 1` cada 4 min.
4. Lista ligera en `/api/contenido/analisis`. El registro completo, sólo en `/:id`.
5. `scripts/medir.mjs`, que deja el resultado en `informes/tiempos-<fecha>.json`.

**Aceptación.**
- **A3.1** En el VPS (localhost, 50 peticiones por ruta, con y sin sesión, incluida la primera
  tras 10 min sin tráfico): **p95 ≤ 50 ms** en `/api/contenido/{analisis,gemas,seguimiento,noticias,marcador}`.
- **A3.2** Desde fuera (www, 50 peticiones): el **p95 de cada ruta ≤ p95 de `/meta` + 250 ms**.
- **A3.3** `/api/contenido/analisis` pesa ≤ 40 KB sin comprimir.

**Riesgos.** Sesión, cupo y admin siguen pagando 100 ms por consulta. Mover Supabase a
Frankfurt está en el backlog como decisión.

---

## 4. «Analiza tu moneda» gratis

**Diagnóstico.**
- El motor no calcula nada: `/determinista` lee `reports/`, y sólo 30 de 405 monedas tienen
  lectura.
- `/analizable` tarda unos 30 s.
- No hay límite de consultas, y cada lectura escribe dos filas.
- `captura_citada` no tiene etiqueta en la web.

**Contrato.**
- El motor escribe §21, con `POST /ficha`.
- **La forma de cada dato:**
  ```json
  { "clave": "libro_2pct", "etiqueta": "Profundidad del libro a ±2 %",
    "valor": 516223, "unidad": "USD", "estado": "medido" | "estimado" | "no_disponible",
    "fuente": "Binance · spot", "medido_en": "2026-09-26T08:00:00Z",
    "nota_estimado": "a partir de los 3 mayores libros" }
  ```
  - `valor` es null si y sólo si `no_disponible`.
  - `nota_estimado` va si y sólo si `estimado`.
  - `fuente` y `medido_en` son obligatorios salvo en `no_disponible`.
- **Los cinco bloques**, cada uno con su palabra de lectura. `lectura: null` cuando faltan datos.

| bloque | datos | lectura |
|---|---|---|
| Qué mueve el precio | futuros sobre contado, financiación, interés abierto 7 d | `demanda_real · mixta · apalancamiento` |
| Caídas | peor semana de cada 20 (CVaR 7 d), caída máxima 90 d | `contenida · alta · extrema` |
| Quién la tiene | top-10 neto, n.º de tenedores | `dispersa · concentrada · muy_concentrada` |
| Si el token cobra | ingresos 30 d, parte que llega al token | `captura_verificada · captura_declarada · captura_citada · sin_captura` |
| Salida | libro a ±2 %, volumen 24 h | `profunda · suficiente · fina` |

- **Cabecera:** `precio_usd`, `var_24h`, `var_7d`, `mcap_usd`, `cadena`, `contrato`, `fecha_datos`.
- **Cierre:** `analizable` y `motivo_no_analizable`.
- **Lo que la web filtra (sólo admin):** `hhi`, `adv_30d`, `por_venue` y el coste por consulta.
  Nunca llegan al cliente, ni en la respuesta de la API: el servidor los quita según el rol.

**Pantalla** (**[DISEÑO]**, aprobada):
```
 CELO · Celo · Ethereum                                 datos de hoy 08:00
 0,3010 USD   +1,2 % en 24 h
 ─────────────────────────────────────────────────────────────────────────
 QUÉ MUEVE EL PRECIO                                         Demanda real
   Futuros sobre contado      2,76 ×          medido · Binance
 SALIDA                                                          Suficiente
   Libro a ±2 %               516 223 USD     estimado · 3 mayores libros
 …
   No entra en esta ficha: concentración de tenedores.
 ─────────────────────────────────────────────────────────────────────────
 Esto es la foto. El análisis completo te dice qué hacer con ella:
 la tesis, los escenarios y el número exacto que la invalida.
                                   [ Pide el análisis completo · Plan Base ]
```
- **Medido:** cifra en blanco, con la fuente en gris.
- **Estimado:** cifra en gris claro y «estimado», con la nota al pasar el ratón o al tocar.
- **No disponible:** no hay fila. Todo se junta en una línea final. Un bloque sin nada
  desaparece y su nombre va a esa línea.
- **Bloque con `lectura: null`:** se ven sus datos, sin palabra.
- **Llamado según quién mira:**
  - Visitante: «Crea tu cuenta y pide el análisis completo».
  - Gratis: «Pasa a Base: 2 análisis completos al mes».
  - Base o Pro con cupo: botón directo.
  - Sin cupo: «Te quedan 0 este mes · pasa a Pro».
  - `analizable: false`: «Para esta moneda te damos la foto; el análisis completo necesita {motivo}».

**Límite de consultas.** Se aplica en el servidor y se ajusta desde `/admin/operacion`:

| quién | por día | ráfaga |
|---|---|---|
| visitante, por IP | 5 | 1 cada 5 s |
| gratis, por usuario | 15 | 1 cada 3 s |
| Base / Pro | 60 | 1 cada 2 s |
| admin | sin límite | — |

- Al pasarse, respuesta `429` con `reintentar_en` y uno de estos textos:
  - Visitante: «Has usado tus 5 fichas de hoy. Con una cuenta gratis tienes 15 al día.»
  - Registrado: «Has usado tus fichas de hoy. Mañana tienes 15 más.»
- La IP se toma del primer salto que añade Vercel.

**Tenencia declarada.** El motor excluye esas monedas de `/universo`, `/resolver`, `/ficha` y
demás (`f17836c`). La web **además** comprueba en sus invariantes que ninguna aparece (§9).

**Qué haré en la web.**
- Cliente de `/ficha` con 15 s de límite. Mientras el motor no la tenga, sigue la ruta actual.
- La pantalla, el límite, el llamado por rol y la etiqueta `captura_citada`.
- Contador propio `consulta_ficha`, con día, IP en hash, usuario y símbolo. Deja de escribir en
  `solicitud` y `uso_analisis`.

**Aceptación.**
- **A4.1** Las 20 monedas del banco del motor (§13), más un contrato EVM y uno de Solana de fuera
  del universo, cumplen todo esto:
  - ficha completa;
  - cada dato con «medido» o «estimado» y su fuente;
  - los no disponibles, sólo en la línea final;
  - ni pantallas en blanco ni 503.

  Una captura por moneda.
- **A4.2** La consulta 6 de un visitante y la 16 de un gratis reciben 429 con su texto.
- **A4.3** Cada rol ve su llamado: 5 capturas.
- **A4.4** Ninguna ficha escribe en `solicitud`.
- **A4.5** La respuesta de `/ficha` para un no admin no contiene `hhi`, `adv_30d`, `por_venue`
  ni el coste.
- **A4.6** Con SYN (tenencia declarada), la ficha no existe para nadie que no sea admin.

**Riesgos.**
- Sin `POST /ficha` del motor, A4.1 no se cumple. Es el bloqueo más probable.
- DefiLlama falla el 35 %: saldrán fichas con varios no disponibles.

---

## 5. Cada estado de un pedido de análisis tiene su pantalla

**Diagnóstico.**
- El motor pasa a tres estados finales: `entregado` (viaja como `listo`), `no_analizable` y
  `en_cola`. Mantiene `en_curso` mientras trabaja.
- El reloj es del motor: 15 min sin latido, el pedido vuelve a la cola. A las 3 h relanza una
  vez y luego marca `requiere_admin`.
- `fallido` queda sólo para una cancelación.
- Hoy la web no tiene ninguna pantalla para «sin tesis» ni para `requiere_admin`.
- En admin hay voseo: «Subilo para que pasen al motor».

**Reglas de la web.**
- **La web nunca cierra un pedido por su cuenta.** Se retira el cierre por 404 de 60 s
  (`SIN_REGISTRO_MS`, `server/analizar.ts:74`).
- **Si el motor no actualiza un pedido no terminal en 30 min** (`actualizado` sin moverse), se
  crea una alerta en admin (`/admin/consumo` y Operación). El cliente no ve nada distinto.
- **`requiere_admin: true`:** el cliente ve el pedido en cola y el admin recibe una alerta.
- **Tiempo estimado:** `inicio_estimado` y `puesto`, del motor. Si no llegan, se muestra sólo el
  puesto que conoce la web y «Te avisamos en cuanto empiece». No se inventa un tiempo.
- **Cupo:**
  - `listo`: se consume.
  - `no_analizable` o `cancelado`: se devuelve.
  - `en_cola` y `en_curso`: sigue reservado.

**Textos** (`{nombre}` es la moneda):

| estado | titular | cuerpo | acción |
|---|---|---|---|
| **en cola** (incluido `requiere_admin`) | «Tu análisis de {nombre} está en la cola» | «Puesto {n}. Empieza hacia las {hora}.» *(sin estimación: «Te avisamos en cuanto empiece.»)* «Tu cupo está reservado, no gastado: sólo se descuenta cuando el informe está listo.» | «Puedes cerrar esta página» |
| **reservado** (tope de gasto) | «Tu análisis de {nombre} está reservado» | «Arranca en el próximo turno de análisis, sin que tengas que hacer nada. Te avisamos en cuanto empiece.» | — |
| **en curso** | «Analizando {nombre}» | Barra por etapa: «Reuniendo datos de mercado, de la cadena y del protocolo» → «Calculando riesgo, liquidez y niveles» → «Buscando lo que podría salir mal» → «Escribiendo tu informe» → «Comprobando cada cifra contra su fuente». Debajo, el `detalle` filtrado. | «Puedes cerrar esta página: te avisamos al terminar» |
| **entregado** | «Tu análisis de {nombre} está listo» | La primera línea del veredicto. | «Abrir el informe» |
| **entregado sin tesis** (`tesis: null`) | «Tu análisis de {nombre} está listo» | «Esta vez no hay tesis: {motivo_sin_tesis_cliente}. Tienes la foto completa: riesgo, liquidez, quién la tiene y lo que podría salir mal.» | «Abrir el informe» |
| **no analizable** | «{nombre} no da para un análisis completo» | «{motivo_no_analizable}. No se descontó nada de tu cupo.» | «Ver su ficha gratis» · «Elegir otra moneda» |
| **cancelado** | «Cancelaste este análisis» | «No se descontó nada de tu cupo.» | «Pedirlo de nuevo» |
| **respaldo** (`bloqueado` viejo, `fallido` viejo con cualquier código) | «Este análisis no se completó» | «No se descontó de tu cupo: puedes pedirlo de nuevo.» | «Pedirlo de nuevo» |
| **estado desconocido** (red caída, forma rara) | «Estamos comprobando tu pedido» | «Tu cupo está a salvo. Esta página se actualiza sola.» | «Actualizar» |

**El informe sin tesis.**
- La cabecera del informe dice «Sin tesis» en vez del veredicto, y debajo va
  `motivo_sin_tesis_cliente`.
- «Qué vigilar y qué invalida» y «Niveles» con escenarios no se pintan.
- El resto de las secciones, igual.
- Una gema que baja a análisis se publica como análisis.

**Admin.**
- Los mismos estados con vocabulario real.
- Una alerta por `requiere_admin` y otra por 30 min sin actualizar.
- El bloque `correcciones` en la bandeja (§6).
- Arreglo el voseo.

**Aceptación.**
- **A5.1** Una fixture por fila de la tabla (9). La prueba recorre `/analizar/s/:id` y comprueba
  el titular exacto, que la pantalla no queda vacía y que pasa la auditoría de lenguaje. Una
  captura de cada una.
- **A5.2** Un pedido `en_curso` con `actualizado` de hace 31 min:
  - la web **no** cambia su estado;
  - el cupo sigue reservado;
  - se crea **una** alerta en admin, y no una por ciclo.
- **A5.3** Con `requiere_admin: true`, el cliente ve «en cola» y el admin, la alerta.
- **A5.4** Un 404 de `/progreso` durante 10 min no cierra el pedido.
- **A5.5** Un estado inventado o un 500 muestra «Estamos comprobando tu pedido».
- **A5.6** Un informe con `tesis: null` muestra la cabecera «Sin tesis» con su motivo y no
  muestra el bloque de invalidación.

**Riesgos.** Si el motor se cae del todo, los pedidos quedan en cola sin cerrarse. Ése es el
comportamiento acordado: la alerta de 30 min avisa al admin.

---

## 6. Informes con datos incompletos

**Diagnóstico.**
- El motor marca hoy `fuentes[].calidad`, `senales_sin_fuente`, `*.dato = 'ausente'` y
  `reconsultas`.
- `TablaFuentes` pinta al cliente «ausente» y «parcial» en crudo.
- Con el verificador que corrige, las cifras malas se quitan antes de exportar y quedan
  registradas en `correcciones`, que es sólo de admin.

**Contrato.** El motor escribe §20 y la web se adapta a lo que escriba. Espera esto:
```json
"integridad": {
  "no_disponibles": [ { "que": "concentración de tenedores", "motivo_cliente": "la cadena no publica sus tenedores" } ],
  "sin_verificar":  [ { "que": "ingresos 30 d", "fuente": "Token Terminal", "seccion": "lectura", "cifra": "13 066 866 USD" } ],
  "correcciones":   [ … sólo admin … ]
}
```
Las cifras sin verificar llevan la marca `⟦sv:<índice>⟧` en la prosa. Sólo afecta a datos sin
API (motor B.8).

**Qué ve el cliente.**
- **«Sin verificar»:** la cifra lleva un subrayado punteado y, al pasar el ratón o al tocar,
  la nota «Obtenido de {fuente}, sin verificar».
- **Bloque «Sobre los datos de este informe»**, después de «Lo que podría salir mal». Sólo
  aparece si hay algo:
  - una línea por cifra sin verificar: «Obtenido de Token Terminal, sin verificar: ingresos de
    30 días (13 066 866 USD).»;
  - al final, **una sola línea** de no disponibles: «No entra en este informe: concentración de
    tenedores.»
- **Las retiradas no se ven.** Ni marca ni mención.
- **`TablaFuentes`:** fuente, fecha y «verificada» o «sin verificar». Nada de «ausente» ni
  «parcial».

**Qué ve el admin.**
- `correcciones` completo: qué se quitó, dónde, por qué y qué se rehízo.
- `senales_sin_fuente` traducidas y la calidad cruda de las fuentes.
- En la bandeja, un aviso antes de aprobar si hubo correcciones.

**Mientras el motor no mande `integridad`:** `fuentes[].calidad = ausente` pasa a la línea de
no disponibles, y ninguna cifra sale marcada como sin verificar.

**Aceptación.**
- **A6.1** Con una fixture con sin verificar, no disponibles y correcciones:
  - el cliente ve la nota y el bloque con sus líneas, y **ninguna mención** de lo corregido;
  - el admin ve `correcciones`.
  - Capturas de los dos.
- **A6.2** Una fixture limpia: el bloque no existe en el DOM.
- **A6.3** Una regla nueva de la auditoría de lenguaje: en pantallas de cliente no aparecen
  «ausente», «parcial», «retirad», «corregid» ni «no disponible» fuera del bloque.
- **A6.4** La respuesta de la API para un no admin no contiene `correcciones`.

**Riesgos.** Depende de §20 del motor para «sin verificar».

---

## 7. Autoridad única sobre qué está publicado

**Diagnóstico.** Hoy hay tres fuentes de verdad: la tabla `publicacion` de la web, el ledger
del motor (que lee la agenda) y `publicable` en las noticias.

**La regla.** La bandeja es la única verdad. La web la escribe, el motor la lee y nadie más la
escribe.

**El archivo.** `/opt/veta/gem-pipeline/base_contenido/publicados-web.json`:
- Se reescribe de forma atómica (temporal + `rename`) en cada decisión y al arrancar.
- Contiene sólo lo publicado, y las noticias despublicadas. Lo que no está no está publicado.
- `secuencia` crece con cada decisión.
```json
{ "generado": "2026-09-26T08:00:00Z", "secuencia": 57,
  "informes": [ { "id": "CELO-20260919-183951", "tipo": "analisis", "estado": "publicado",
                  "decidido": "2026-09-21T15:00:00Z", "por": "admin" } ],
  "noticias_despublicadas": [ "not-20260922-1233-6e9641" ] }
```
- El motor lo lee en cada uso y alerta si `secuencia` retrocede o si el archivo falta. Mientras
  no exista, el motor no da nada por publicado.
- Las noticias siguen fuera de la bandeja: el motor las publica y la web sólo despublica.

**Qué haré.**
- Escritor atómico, con el mismo disparador que la caché de §3.
- Dejar de escribir `publicacion.jsonl`.
- **§22 del contrato** con la forma y las reglas.
- El instalador crea la ruta con los permisos que acuerde el motor.

**Aceptación.**
- **A7.1** Aprobar o despublicar en la vista previa cambia el archivo en menos de 1 s, con
  `secuencia` + 1.
- **A7.2** Matar el proceso a mitad de escritura deja el archivo anterior, válido.
- **A7.3** Invariante: la agenda servida sólo contiene `informe_id` que están en el archivo.

**Riesgos.** El directorio es del motor: los permisos se acuerdan en §22.

---

## 8. Prueba de contrato

**Diagnóstico.**
- No hay tests en la web.
- `pct` y `conUnidad('%')` no son coherentes entre sí.
- El contrato no tiene una tabla de formato.

**Qué haré.**
1. **§23 del contrato: tabla de formato por unidad.**
   - `USD` precio: decimales según magnitud.
   - `USD` cantidad: sin decimales, espacio duro de miles.
   - `%`: una decimal, coma y espacio duro antes del signo.
   - `×`: dos decimales.
   - `p`: sin decimales.
   - Fecha: `26 sep 2026`.
   - Signo: «+» sólo en variaciones, «−» tipográfico.
   - Si mínimo = máximo, un solo número.
2. **Un único formateador** `cifraCliente(valor, unidad, contexto)`. Cada cifra en el DOM lleva
   `data-cifra="<ruta del campo>"`.
3. **Datos:** las exportaciones de `base_contenido/fixtures-contrato/`, que deja el motor. Se
   copian a `site/pruebas/contrato/fixtures/`.
4. **La prueba**, con Puppeteer contra la vista previa servida con esas fixtures:
   - Recorre cada pantalla de cliente de cada registro.
   - Compara cada `data-cifra` con una **implementación independiente**, escrita desde la tabla
     de §23: valor, unidad, redondeo y signo.
5. **La inversa:** cualquier número visible sin `data-cifra` falla, salvo la lista blanca (año
   del pie, puesto en la cola).
6. Los números dentro de la prosa del motor se comprueban sólo por forma.

**Aceptación.**
- **A8.1** 0 discrepancias sobre todas las fixtures, con el recuento de cifras por pantalla.
- **A8.2** Un sabotaje del redondeo de `%` hace fallar la prueba con el campo exacto.
- **A8.3** 0 números sin etiqueta fuera de la lista blanca.

**Riesgos.**
- Etiquetar todas las cifras es mucho trabajo mecánico.
- Mientras la carpeta del motor no exista, la prueba corre con los 14 vigentes y lo digo en el
  informe.

---

## 9. Invariantes antes de cada despliegue · PRIMERO

**Diagnóstico.**
- `auditar-lenguaje.mjs` y `barrido.mjs` salen siempre con 0.
- No hay CI.
- Vercel despliega en cada push.
- Nadie comprueba que el servidor aplica la matriz ruta por ruta.

**Qué haré.** **`npm run invariantes`**, que corta al primer fallo:
1. `typecheck` (app y server) y lint.
2. **Auditoría de lenguaje:** sale con 1 si encuentra algo.
3. **Matriz de acceso en el servidor:**
   - tabla rol × ruta × código esperado, generada desde `MATRIZ`;
   - se lanza contra la vista previa con 5 sesiones;
   - una ruta sin entrada en la tabla falla.
4. **Tenencia declarada:**
   - lee la lista de monedas declaradas (`config/conflictos_interes.yaml` del motor, espejada);
   - recorre, con visitante, gratis, base y pro, toda respuesta de la API pública y todas las
     pantallas de cliente;
   - falla si aparece su símbolo, su nombre o su id. Admin, excluido.
5. **Barrido:** 5 roles × 2 anchos. Sale con 1 ante una pantalla en blanco, un error de consola
   o una petición fallida.
6. **Prueba de contrato** (§8), desde que exista. Hasta entonces se salta con aviso.

**`scripts/desplegar.sh`.** Es la única forma de desplegar:
1. Corre los invariantes.
2. Push.
3. `vercel deploy --prod`.
4. Despliega la API.
5. Verifica en producción: el texto nuevo en el fragmento servido y `is-active`.

**Vercel sin despliegue automático:**
- `git.deploymentEnabled: false` en `vercel.json` para `main`.
- Un hook `pre-push` que corre los invariantes, por si alguien empuja a mano.

**Aceptación.**
- **A9.1** Cinco sabotajes: un «tenés», una ruta de admin abierta a `pro`, un componente que
  lanza al montar, una cifra con punto decimal y SYN visible en una respuesta pública. Con cada
  uno, `desplegar.sh` se detiene sin empujar. Guardo la salida.
- **A9.2** Un `git push` directo a `main` no crea un despliegue en Vercel.
- **A9.3** Sin sabotajes, `desplegar.sh` despliega de punta a punta y verifica.

**Riesgos.**
- `vercel deploy` necesita la CLI con sesión: si no está en el Mac, es un bloqueo y lo digo.
- Los invariantes tardan minutos.

---

## 10. Vista de combustible (sólo admin) · al final

- **Qué haré:** un panel en la bandeja y en el informe de admin, con los datos de `combustible`
  y `niveles.combustible`:
  - lado dominante;
  - nocionales;
  - `squeeze_setup`;
  - lectura, confianza y calibrado;
  - mercados usados;
  - motivo de ausencia.
- **A10.1** Aparece en admin y no existe para ningún otro rol, ni en el DOM ni en la API.
- **A10.2** Con `hay_combustible: false`, enseña el motivo.

---

## 11. Términos y Privacidad

Fuera del lanzamiento: pasa a `BACKLOG.md`. Los textos siguen como están, y no se ponen nombre
ni RUT.

---

## 12. Orden de construcción

Cada arreglo lleva un commit y un despliegue con `desplegar.sh`.

0. **Sincronizar la copia del contrato** con la del motor: §13.1, §14, §19 y lo que haya de §20
   y §21. Escribir §22 y §23.
1. **§9** Invariantes y `desplegar.sh`. Vercel, sin despliegue automático.
2. **§1** Recuperación de contraseña y guardia de navegación.
3. **§3** Tiempos, con la caché de publicación que reutiliza §7.
4. **§7** `publicados-web.json`.
5. **§5 y §2** Estados del pedido, sin tesis, `requiere_admin`, respaldo y alertas.
6. **§6** Datos incompletos.
7. **§8** Prueba de contrato, que entra en los invariantes.
8. **§4** Ficha: límite, pantalla y llamado ya; `/ficha` cuando llegue.
9. **§10** Combustible.
10. **§13** Banco completo e informe final.

**Escrituras en producción:** cada comando se muestra antes y se ejecuta sólo cuando Pablo lo
aprueba en el momento.

---

## 13. Banco de pruebas: la definición de «listo»

**El banco es el del motor** (su §E): 20 monedas pedidas como un cliente:
- BTC, SOL, HYPE, SUI, AAVE, UNI, GMX, JOE, ENA, AERO (por contrato), BRETT (por contrato),
  CAKE, LSK, JUP, BONK (por contrato), USELESS, KMNO, TIA, APT y KAS;
- sus exportaciones quedan en `base_contenido/fixtures-contrato/`;
- no se publica nada del banco.

**«Listo» es que pasen las tres cosas, con evidencia:**
1. **Los 20 informes** se ven completos en cliente y en admin, y la prueba de contrato da 0
   discrepancias.
2. **La ficha gratis** funciona para esas 20 monedas (A4.1).
3. **Punta a punta en producción**, con cuentas `prueba-<rol>-<fecha>@vetalab.io`:
   - registro;
   - recuperación de contraseña (A1.2);
   - cambio de plan:
     - subida con avisos de Whop firmados, simulados contra la vista previa;
     - cambio manual desde admin en producción;
     - baja por `membership.deactivated`;
   - cada rol ve lo que dice la matriz.

   Las cuentas se borran al final y se listan en el informe.

El pago real de Base lo hace Pablo al final. Después compruebo `pago_evento` y el plan, sin tocar
nada más.

**Límites:** no apruebo ni publico informes, no hago pagos, no toco el repo del motor, y cada
escritura en producción lleva la aprobación de Pablo en el momento.
