# Informe de lanzamiento · construcción de la especificación

26-sep-2026. Construido según `ESPECIFICACION-LANZAMIENTO.md` §12, con §9 primero. Siete
despliegues por `scripts/desplegar.sh`, todos con los invariantes en verde; uno más se detuvo
solo (la prueba de contrato encontró fallos) y no llegó a producción.

Cada criterio lleva su evidencia: el comando que la produce y lo que salió. Las pruebas
viven en `site/scripts/probar-*.mjs` y `site/pruebas/unidad/`; cualquiera las puede repetir.

---

## Resumen

| § | Qué | Estado |
|---|---|---|
| 0 | Contrato sincronizado; §22 y §23 escritos | ✓ |
| 9 | Invariantes y despliegue sólo por `desplegar.sh` | ✓ A9.1 ✓ A9.2 ✓ A9.3 |
| 1 | Recuperación de contraseña sin bucles | ✓ (A1.2: falta que abras el correo en producción) |
| 3 | Tiempos | ✓ A3.2 · A3.3 · A3.1 salvo la primera petición con sesión tras una pausa (427 ms) |
| 7 | `publicados-web.json` | ✓ (el motor ya lo lee) |
| 5 · 2 | Estados del pedido; nada crudo del motor | ✓ |
| 6 | Datos incompletos | ✓ |
| 8 | Prueba de contrato | ✓ (sobre las fixtures que hay: 3, no 20) |
| 4 | Ficha gratis | ✓ (p95 10,8 s del motor, por encima de su objetivo) |
| 10 | Combustible sólo admin | ✓ |
| 13 | Banco de pruebas | parcial: falta el banco de 20 informes del motor |

Además, sin estar en la lista pero dentro de tus reglas, encontré y cerré en producción:
- **SYN seguía visible** en la watchlist para cualquier cuenta Base (y en «Analiza tu moneda»).
- **El múltiplo del escenario alcista salía a todos** en la tarjeta de cifras: «12,24× – 118,85×»
  en CELO. §18 lo reserva a admin.
- **`combustible` viajaba en la API a todos** los clientes, aunque no se pintara.
- **El motivo crudo del verificador** («control de cobertura (§3)… `no_cumplido`») y trazas como
  `ModuleNotFoundError` llegaban a la pantalla del pedido.
- **Identificadores de código** en los catalizadores de STONK (`creator_fee_share_rate`).
- **Los gráficos de STONK nunca se veían** (se buscaban en la gema reclasificada).

---

## §0 · Contrato

- `CONTRATO-ANALISIS-A-PEDIDO.md` toma la copia del motor como base (§1–§21) y conserva los
  acuses de la web como sección aparte. Commit `dc8e364`.
- **§22** `publicados-web.json`: dónde, forma, escritura atómica, reglas para el motor.
- **§23** tabla de formato de cifras para el cliente.
- **Acuse de §20 y §21** con lo que la web sigue pidiendo al motor (al final del contrato).

## §9 · Invariantes antes de cada despliegue

`npm run invariantes` corta en el primer fallo: tipos, lint, navegaciones automáticas, pruebas
unitarias (37), build, lenguaje, matriz de acceso, tenencia declarada, barrido y prueba de
contrato. `scripts/desplegar.sh` es la única forma de desplegar.

**A9.3 · despliega de punta a punta y verifica.** Siete despliegues, todos «TODOS EN VERDE ·
~600 s» (el último: lenguaje 0 palabras, matriz 280 comprobaciones sin fallo, tenencia 144
respuestas y 56 pantallas sin fallo, barrido 216 páginas sin problemas graves, contrato 0
discrepancias), push con la marca, API activa, Vercel sirviendo la build y el texto nuevo en el
fragmento publicado:
```
✓ push 5214454 con la marca del árbol 116773ba…
✓ api.vetalab.io responde (a los 2 s)
✓ www.vetalab.io sirve esta build (assets/index-CblrFyAJ.js)
✓ «Combustible · sólo admin» está en el fragmento publicado InformeDetalle-Cthh8_YP.js
```

**A9.2 · un push directo no despliega.** Sin panel de Vercel ni CLI con sesión, la puerta es
`vercel.json › ignoreCommand`: sólo se construye un commit con `Invariantes-ok: <árbol>` igual a
su árbol, y esa marca la pone `desplegar.sh`. Prueba: push de `31b8f29` sin marca a las 15:02:43;
producción siguió sirviendo `index-CAtTNvNX.js` durante 6 min (37 comprobaciones), sin publicar
la build `index-Dic7azvB.js`. Además, el hook `pre-push` bloquea el push normal:
```
pre-push: estos cambios de código no pasaron los invariantes: …
error: failed to push some refs
```
Y `desplegar.sh` se niega con árbol sucio («Hay cambios sin commitear…») o si HEAD cambia
mientras corren los invariantes.

**A9.1 · cinco sabotajes, cinco paradas sin empujar.** Cada uno commiteado en local, intentado
con `desplegar.sh`, deshecho después. Durante la prueba, el push de `origin` apuntaba a ningún
sitio: un sabotaje no detectado tampoco habría llegado a producción.

| Sabotaje | Dónde se paró | Qué dijo | `origin/main` |
|---|---|---|---|
| «Si tenés dudas, escribinos» en `/nosotros` | lenguaje | «palabras distintas encontradas: 1» | sin cambios |
| La bandeja abierta a Pro (`server/admin.ts`) | matriz de acceso | «GET /api/admin/bandeja · pro: NO debía pasar y respondió 200» (y las otras rutas de la bandeja) | sin cambios |
| Sin el filtro de tenencia (`server/index.ts`) | tenencia declarada | «API visitante GET /api/contenido/noticias (200): synapse, syn», universo, resolver… | sin cambios |
| `/metodologia` lanza al montar | lenguaje (la página no llega a cargar) · y por separado el **barrido**: «NO CARGÓ /metodologia» en todos los roles, sale con 1 | | sin cambios |
| Una cifra con punto («10.193019999999999 mil USD») | la primera versión la cazó el compilador; la precisa, la **prueba de contrato**: «forma (decimal o miles con punto)» en las 4 pantallas donde sale | | sin cambios |

Al terminar: HEAD en `a63bb26` como antes, `origin/main` en `5214454` como antes, árbol limpio
y el push de `origin` restaurado. La pantalla que lanza no produce ningún bucle: 23 peticiones en
10 s y «Esta pantalla no se pudo dibujar».

## §1 · Recuperación de contraseña

**Diagnóstico reproducido en producción** antes de tocar nada (`bucle-fragmento`): con un
fragmento caído y `sessionStorage` bloqueado, **78 cargas de documento en 10 s**; pantalla en
blanco. Además `/restablecer` cargaba three.js: tareas largas de 300–380 ms.

**Después, en producción:**
```
normal      · fragmento caído · cargas de documento en 10 s: 2 · «Esta página se actualizó…»
sin storage · fragmento caído · cargas de documento en 10 s: 2 · «Esta página se actualizó…»
```
- **A1.1** `node scripts/probar-recuperacion.mjs https://www.vetalab.io` → 6/6: 0 recargas,
  formulario entre 767 y 1570 ms, tarea larga máxima 0 ms.
- **A1.2** Local, de punta a punta (`probar-recuperacion-completa.mjs`): 7/7, la nueva entra y
  la vieja no. **En producción**, el enlace para `prueba-base-20260926@vetalab.io` salió por
  Resend (id `01a0dedc-8c90-7780-a7ef-12376d55be28`); la clave de Resend del servidor sólo envía
  y el conector de Gmail pide volver a iniciar sesión, así que **falta que lo abras tú**.
- **A1.3** 6 pruebas unitarias de la guardia, en verde (dentro de los invariantes).
- **A1.4** El revisor de navegaciones falla con un fichero trampa (`location.reload()` suelto y
  `navigate()` en un efecto): 2 hallazgos, sale con 1.
- **A1.5** `volver=//evil.com`, `https://evil.com` → `/gemas`; nunca fuera del dominio.
- **A1.6** `/restablecer` ya no carga `react-three-fiber` ni `HeroScene`.
- La pantalla de enlace caducado ya no enseña un formulario muerto ni la palabra «token»:
  «Pide un enlace nuevo».

## §3 · Tiempos

Causa: no había regresión (los «0,2–0,6 s» eran la portada). Supabase en us-east-1 (100 ms por
consulta), 1 + N consultas por petición, 660 ms por conexión nueva y la sesión consultada en
cada petición.

- **A3.1 · en el VPS** (localhost, 50 peticiones por ruta, p95):

  | ruta | antes (p95) | sin sesión | con sesión (Base) | primera tras 10 min, sin sesión |
  |---|---|---|---|---|
  | `/analisis` | 305 ms (835 en frío) | 13 ms | 13 ms | 19 ms (antes 257) |
  | `/gemas` | — | 5 ms | 4 ms | 8 ms |
  | `/seguimiento` | — | 5 ms | 5 ms | 8 ms |
  | `/noticias` | — | 6 ms | 14 ms | 20 ms |
  | `/marcador` | — | 5 ms | 6 ms | 8 ms (antes 118) |

  Con sesión, antes: ~210 ms en **cada** petición (la sesión se buscaba en Supabase siempre).
  **Lo que no se cumple:** la primera petición de todas tras la pausa paga 122 ms sin sesión y
  **427 ms con sesión** (la sesión recordada caduca a los 30 s y hay que ir a Supabase, en
  us-east-1). Una vez por visitante que vuelve tras un rato; el resto de la tanda, ≤ 20 ms.
  Se arregla de raíz moviendo Supabase a Frankfurt (backlog, decisión tuya).
- **A3.2 · desde fuera** (`informes/tiempos-2026-09-26-fuera.json`, 50 por ruta): p95 de cada
  ruta ≤ p95 de `/meta` (neto entre −88 y −58 ms), muy por debajo del margen de 250 ms.
- **A3.3** `/api/contenido/analisis` pesa **34,7 KB** con los informes de hoy (antes 301 KB).

## §7 · `publicados-web.json`

- **A7.1** (`probar-publicados.mjs`): aprobar → secuencia +1 en 29 ms y el informe entra;
  despublicar → +1 en 398 ms y sale.
- **A7.2** 30 procesos que reescribían el fichero, matados a destiempo tras 362 973 escrituras:
  30/30 lecturas válidas.
- **A7.3** En producción el motor ya lo lee (`engine/agenda.py`, `servicio/operacion.py`). La
  agenda servida no tiene ningún evento de un informe fuera del fichero (hoy ningún evento
  cuelga de un informe: la comprobación es vacía, no falsa).
- En producción: `/opt/veta/gem-pipeline/base_contenido/publicados-web.json`, `veta:veta` 0644,
  con CELO y STONK y la noticia de SYN despublicada.

## §5 · §2 · Estados del pedido

`node scripts/probar-estados.mjs` (motor falso con cada estado de §20 y los registros reales de
`fixtures-contrato` como resultado): **16/16**.
- **A5.1** 10 pantallas con su titular exacto, sin jerga, nunca vacías (capturas).
- **A5.2** 31 min sin noticias: sigue en curso, **una** alerta (misma marca tras dos ciclos),
  cupo intacto.
- **A5.3** `requiere_admin`: en cola para el cliente, sin hora y sin la marca; alerta en admin.
- **A5.4** El motor no conoce el pedido desde hace 10 min: la web no lo cierra.
- **A5.5** Respuesta 500 → «Estamos comprobando tu pedido».
- **A2.1/A2.2** Los registros reales con «§3» y `ModuleNotFoundError` caen al respaldo
  genérico; admin ve el motivo crudo.
- 12 pruebas unitarias de la tabla de estados.

## §6 · Datos incompletos

`node scripts/probar-integridad.mjs` sobre las fixtures: **9/9**.
- **A6.1** Cliente: «Obtenido de …, sin verificar: …» y «No entra en este informe: …»; ninguna
  mención de lo corregido.
- **A6.2** Informe limpio: el bloque no existe en el DOM.
- **A6.3** Regla nueva en la auditoría de lenguaje (en informes): «ausente», «parcial»,
  «retirad…», «corregid…», «no disponible». La auditoría recorre ahora todos los publicados.
- **A6.4** La API no manda `retiradas` a quien no es admin (sí a admin: 7); la bandeja enseña la
  tabla de integridad y avisa antes de aprobar.

## §8 · Prueba de contrato

`node scripts/probar-contrato.mjs` (dentro de los invariantes):
```
PRUEBA DE CONTRATO · 2 registros del motor (3 en fixtures-contrato)
  visitante  /analisis …  · base  /analisis/… · … · fallos de forma 0
  TOTAL de discrepancias: 0
```
- **A8.1** 0 discrepancias en valor (cifras marcadas, leídas del registro y formateadas con una
  implementación escrita desde §23) y en forma (todo número visible, prosa incluida).
- **A8.2** Sabotaje del redondeo: 4 discrepancias con el campo exacto
  (`fundamentales.revenue_protocolo_30d`: «10 193,0 USD» y §23 dice «10 193 USD»).
- **A8.3 · ajuste:** en vez de exigir `data-cifra` en cada número (frágil y enorme), todo
  número visible tiene que cumplir la **forma** de §23; las cifras principales llevan además
  comprobación de **valor**. Ninguna cifra mal formateada se escapa; lo que no se comprueba por
  valor son las derivadas (marcas del gráfico de niveles).
- **Lo que encontró y se arregló:** «0.5×» en el eje de las varas, «0,00000223 USD» y «15 %» con
  espacio normal, «19.9 USD» en precios, catalizador e invalidación de escenarios pintados
  crudos, y el múltiplo del escenario a todos.

## §4 · Ficha gratis

- **A4.1** En producción, cuenta Base de prueba, las 20 del banco del motor + un contrato EVM y
  uno de Solana de fuera: **22/22** con 200, datos bien formados (valor null ⇔ no disponible;
  fuente y fecha en lo medido) y 4 pantallas pintadas.
  **Tiempo en frío: mediana 8,9 s, p95 10,8 s, máximo 11,3 s**: por encima del objetivo del
  motor (8 s); pedido en el contrato.
- **A4.2** Visitante: 5 y la 6.ª es 429 («Has usado tus 5 fichas de hoy. Con una cuenta gratis
  tienes 15 al día.»). Gratis: 15 y la 16.ª es 429.
- **A4.3** Visitante, gratis, base y pro ven su llamado (capturas).
- **A4.4** Ninguna ficha escribe en `solicitud` (98 → 98).
- **A4.5** Ninguna respuesta de las 22 trae `hhi`, `adv_30d`, `por_venue`, coste ni `solo_admin`.
- **A4.6** «SYN», «synapse-2» y su contrato: 404 y sin rastro.
- **La IP:** comprobado en el registro de Caddy que por Vercel la IP del cliente llega en
  `X-Vercel-Forwarded-For`; `X-Forwarded-For` llega con la de Vercel (habrían compartido límite
  todos los visitantes). Riesgo residual en `BACKLOG.md`.
- Límites cambiables en `/admin/operacion`.

## §10 · Combustible

`node scripts/probar-combustible.mjs`: **5/5**. Admin ve el panel (nocionales, lado, squeeze,
confianza, mercados); visitante, base y pro no lo tienen ni en el DOM ni en la API (detalle y
lista); con `hay_combustible: false` enseña el motivo.

## §13 · Banco de pruebas

- **Los 20 informes del banco:** el motor aún no los dejó en `fixtures-contrato/` (hay 3 aquí,
  4 en el servidor). La prueba de contrato corre sobre esos. **Pendiente del motor.**
- **La ficha para esas 20 monedas:** 22/22 (§4).
- **Registro y cambio de plan de punta a punta** (`probar-planes.mjs`, API local con base
  temporal y avisos de Whop firmados como los manda Whop): **10/10** — registro desde
  `/registro`, Base, Pro, aviso repetido sin doble efecto, aviso sin firma rechazado (401),
  baja; la matriz comprobada en el servidor en cada paso.
- **Recuperación:** ver A1.2.
- **Cada rol ve lo que dice la matriz:** `probar-matriz.mjs`, 68 rutas × 5 perfiles, 280
  comprobaciones, 0 fallos (dentro de los invariantes); y una ruta nueva sin decidir quién la ve
  hace fallar la prueba.

## Cuentas de prueba

| Cuenta | Dónde | Estado |
|---|---|---|
| `prueba-base-20260926@vetalab.io` | producción | plan Base (autorizado por chat, rastro en `acciones_admin` id 19) · **pendiente de borrar** |
| `prueba-recuperacion-*`, `prueba-ficha-*`, `prueba-planes-*` | base local o temporal | no tocan producción |

Para borrar la de producción (espera tu aprobación, como toda escritura):
```sql
-- Mismo efecto que «Borrar cuenta» de admin (server/admin.ts), en una transacción que exige 1 fila en el borrado final.
BEGIN;
UPDATE solicitud    SET usuario_id = NULL, usuario_email = NULL WHERE usuario_id = 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl';
UPDATE uso_analisis SET usuario_id = 'cuenta_borrada'         WHERE usuario_id = 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl';
UPDATE consulta_ficha SET usuario_id = NULL                   WHERE usuario_id = 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl';
DELETE FROM alerta WHERE usuario_id = 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl';
DELETE FROM prediccion WHERE usuario_id = 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl';
DELETE FROM voto WHERE usuario_id = 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl';
DELETE FROM cupo WHERE usuario_id = 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl';
DELETE FROM suscripcion WHERE usuario_id = 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl';
DELETE FROM verification WHERE value = 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl';
DELETE FROM session WHERE "userId" = 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl';
DELETE FROM account WHERE "userId" = 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl';
DELETE FROM "user" WHERE id = 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl' AND email = 'prueba-base-20260926@vetalab.io';  -- espera 1
INSERT INTO acciones_admin (admin_id, admin_email, accion, objetivo_tipo, objetivo_id, detalle, fecha)
  SELECT id, email, 'usuario.borrar', 'usuario', 'W7XaKrNaNKKZxOFiuuneWHwzW6XJU3kl',
         '{"email":"prueba-base-20260926@vetalab.io","autorizado_por":"Pablo, por chat","motivo":"cuenta de prueba del lanzamiento"}', now()::text
    FROM "user" WHERE email = 'pablitoherrera@me.com';
COMMIT;
```
Si quieres terminar A1.2 en producción, abre antes el correo de recuperación de esa cuenta.

## Lo que queda

1. **Del motor:** el banco de 20 exportaciones; ficha más rápida (p95 10,8 s); textos de
   `no_disponibles`, catalizadores y prosa limpios de origen (§A.20/§A.21 del contrato).
2. **Tuyo:** abrir el correo de recuperación de la cuenta de prueba (A1.2 en producción); el
   pago real de Base; aprobar el borrado de la cuenta de prueba.
3. **Backlog** (`BACKLOG.md`): respaldo R2, Supabase en Frankfurt, límite por IP si alguien se
   salta Vercel, y lo que ya estaba.
