# Traspaso — estado al 26-sep-2026

Para retomar hace falta leer **tres archivos y nada más**: `CLAUDE.md` (las reglas
que mandan sobre todo lo demás), `CONTRATO-ANALISIS-A-PEDIDO.md` (la interfaz con
el motor, que es donde se pide lo que no es mío) y este.

Lo que este archivo no repite: `ESTADO-WEB.md` cuenta cómo funciona cada parte por
dentro, `DESPLIEGUE.md` cómo se instala, `SISTEMA-VISUAL.md` la paleta y las piezas.
Aquí va sólo lo que hace falta para **seguir trabajando**.

---

## 1. Reglas de coordinación  ·  LO PRIMERO

**No se edita el repositorio del motor.** `~/Documents/Crypto sistem/gem-pipeline`
es de otra sesión. Leerlo, ejecutarlo y correr sus tests, sí; modificar sus
ficheros, no. Lo que se necesite de ese lado **se escribe en el contrato** y Pablo
se lo encarga a la sesión del motor. Los cambios sin commitear que aparezcan ahí
son de esa sesión: no se tocan ni se commitean.

*(Los 39 ficheros del arreglo de formato del 21-sep ya los revisó y commiteó la
sesión del motor, en `b301733`. Su árbol está limpio: no queda nada mío ahí.)*

**Un arreglo, un commit, un despliegue, una verificación.** Sin acumular. Se
verifica **en producción**, no en local, antes de pasar al siguiente.

**Lo que no se hace sin que Pablo lo pida:** aprobar o despublicar informes, pedir
análisis nuevos, hacer pagos, reescribir historia de git, borrar datos o cuentas.

**Si algo necesita una decisión suya:** se anota y se sigue con lo demás. No se
bloquea el trabajo esperando.

---

## 2. Dónde está cada cosa

### En el Mac
| | |
|---|---|
| Web (mía) | `~/Documents/VETA` · el código en `site/` |
| Motor (ajeno) | `~/Documents/Crypto sistem/gem-pipeline` |
| Datos del motor espejados | `~/Documents/VETA/datos-motor/base_contenido` |
| Archivo de calibración | `~/Documents/VETA/archivo/` (fuera de git) |

### En el servidor (Contabo, `144.91.123.49`, acceso `ssh -i ~/.ssh/veta_vps root@…`)
| Ruta | Qué es |
|---|---|
| `/opt/veta-web` | clon de la web · 286 MB |
| `/opt/veta-web/site/.env` | secretos de la web · `veta:veta`, 600 |
| `/opt/veta-web/datos/` | los 7 JSON que sirve la API · **tiene que ser de `veta:veta`** |
| `/opt/veta/gem-pipeline/` | el motor · `base_contenido/` 148 MB, `reports/` 30 MB |
| `/opt/veta/gem-pipeline/base_contenido/noticias/` | piezas, agenda y tendencias del noticiero |
| `/opt/veta/archivo/` | lo archivado de la calibración · 87 MB |

### Servicios y temporizadores
`veta-web` (la API, siempre activa) · `veta-servicio` (el motor por HTTP, :8787) ·
`veta-grabador` (liquidaciones, siempre activo) · y por temporizador:
`veta-cron` (diario 08:37 CEST), `veta-noticias` (12:30 UTC), `veta-snapshots`,
`veta-fotos`, `veta-backup`.

### Dominios
`www.vetalab.io` → Vercel (el front) · `api.vetalab.io` → Caddy → `veta-web` en el
VPS. Vercel reescribe `/api/*` hacia `api.vetalab.io`. **El webhook de Whop apunta
al dominio de la API directamente**, para que el cuerpo crudo llegue intacto a la
firma.

---

## 3. Qué está hecho

Todo desplegado y verificado en producción. El último despliegue es del **26-sep
07:25 CEST** (`5f4ab30`, la espera a Supabase, ver pendiente 2).

- **Cobro con Whop** encendido. `POST /api/pagos/whop` (firma obligatoria,
  idempotente por id de mensaje, avisos desordenados que no pisan a uno nuevo) y
  `GET /api/pagos/checkout/:plan`, que crea la sesión con el origen de la visita
  dentro. Cinco eventos: `payment.succeeded` y `membership.activated` suben,
  `membership.deactivated` es la **única** vía de baja, `payment.failed` y
  `membership.cancel_at_period_end_changed` sólo se anotan.
- **Enlaces cortos** `/ig`, `/tiktok`, `/x`, gobernados desde `/admin/enlaces` sin
  desplegar. 302, y el origen de la visita se guarda 30 días en el navegador
  (manda el primero, no el último).
- **Noticias y agenda** en `/noticias`, del plan Base en adelante, con el recorte
  decidido en el servidor.
- **Sitio público** entero: portada, metodología, nosotros, precios, legales, gracias.
- **Límite de error** en todas las rutas: ninguna pantalla se queda en blanco, y el
  fallo se registra en `POST /api/fallo`.
- **Archivado de la calibración**: 620 registros fuera de producción, con copia
  verificada en el Mac. Quedaron 14 informes vigentes.

---

## 4. Pendientes, por prioridad

### Alta

1. **Dos encargos que no llegaron al código.** Pablo dio por hechos «el bucle en la
   recuperación de contraseña» y «el detalle de las cifras que fallan cuando un
   análisis no pasa la verificación». **No hay rastro de ninguno** — cero commits, y
   no aparecen en el historial de la sesión del 21-sep. Hay que pedirle que los
   repita antes de tocar nada.
2. **El arranque muere si la base no responde · ARREGLADO Y DESPLEGADO (26-sep).** El 25-sep,
   entre las 12:00 y las 12:19 CEST, el servicio cayó y volvió **41 veces**:
   `Connection terminated due to connection timeout` contra Supabase, siempre en la
   primera conexión. `4ce99f0` (26-sep, sesión ya cerrada) añade `esperarBase()` en
   `server/bd.ts`: `SELECT 1` con espera creciente (1 s → 30 s) durante ~5 min antes
   de soltar `bd`, así que cubre las tablas de `db.ts` y todo lo que cuelga detrás.
   **Revisado el 26-sep:** compila, y probado en local contra una base que nunca
   contesta (reintenta 1, 2, 4 s…) y contra una que arranca tarde (entra al quinto
   intento y consulta bien). Límites conocidos, aceptables: sólo protege la primera
   conexión (un corte justo después sigue tumbando el proceso y systemd lo levanta
   en 5 s), y mientras espera la API no escucha, así que Caddy da 502 como antes.
   **Desplegado el 26-sep 07:25 CEST** (`5f4ab30`): arrancó a la primera, sin
   errores, con los mismos 3 publicados que antes, y la API responde 200 desde fuera.
   Queda por ver en la próxima caída de Supabase que aparezcan los reintentos
   `[bd] postgres no responde` en lugar de reinicios. Se puede quitar de la lista.
3. **El respaldo fuera del servidor no ha funcionado nunca.** `veta-backup` en
   `failed` desde el primer día: las credenciales de R2 en `/opt/veta/.env` siguen
   siendo marcadores `<ACCOUNT_ID>`. **No hay copia externa de nada.**

### Media

4. **El pago real nunca se hizo.** La tabla `pago_evento` está vacía: no ha llegado
   ni un aviso. Falta comprobar el último tramo, que Whop devuelva el metadato con
   el origen en el webhook.
5. **La reexportación de los 14 vigentes no ha ocurrido.**
   `cambios_respecto_version_anterior` sigue siendo lista y no hay `misma_corrida`.
   Cuando pase: confirmar que las 4 aprobaciones sobreviven y que los que cambien de
   contenido salen en la bandeja con el aviso en oro.
6. **Términos y Privacidad, escritos y sin desplegar.** Esperan el visto bueno de
   Pablo. Falta decidir si llevan nombre y RUT en «Quién presta el servicio».
7. **DefiLlama falla mucho**: 81 errores de 231 llamadas este mes (35 %). Es la
   fuente que provocó la invalidación falsa de PUMP.

### Baja

8. `/gemas` se desplaza de lado en móvil **sólo con sesión de admin** (122 px).
   Ningún cliente lo sufre. Aparcado por decisión de Pablo. Perseguido con cuatro
   métodos sin aislar la causa: ningún elemento sobresale, no es transitorio, no son
   márgenes ni `min-width`.
9. `/piezas` y `/admin/operacion` también desbordan en móvil.
10. **Los múltiplos de la brecha de ingresos** (`3×`) siguen a la vista del cliente
    en la sección de referencias. No son múltiplos de escenario —ésos ya están sólo
    en admin— pero son la misma familia. Pendiente de decisión.
11. `test1@gmail.com` (plan pro, creada el 20-sep) sigue sin decidir si se borra.

---

## 5. Decisiones tomadas, y por qué

| Decisión | Por qué |
|---|---|
| **La aprobación se ata al `id` de la corrida**, no a `version_registro` ni al tipo | Una reexportación del motor subió la versión de todos y el sitio público se quedó en cero sin que nadie decidiera nada. Y por id **también cuando cambia de tipo**: una gema reclasificada a análisis conserva el id, es la misma corrida. |
| **Nada se despublica solo** | Si cambia el contenido, el informe sigue publicado y se marca en oro para que Pablo lo mire. Bajar algo sin que nadie lo decida es cómo se llega a un sitio vacío. |
| **El track record es sólo lo que el público vio como gema** | No se deduce del dato de hoy: se marca cuando ocurre, en `gema_publica`. Una vez dentro no sale, aunque el motor la reclasifique. Un track record del que se caen las que salieron mal no es un track record. |
| **`retirado` es retirado en todas partes** | §17 del contrato. Estaba sólo en el seguimiento y PUMP seguía en Gemas. |
| **Una invalidación con valor cero no rompe una tesis** | Un cero casi nunca es una medición: es una fuente caída. Se muestra «Dato en revisión». Decirle a un suscriptor que su tesis se rompió por eso es el peor error de esa pantalla. |
| **Al suscriptor sólo se le avisa de lo que puede abrir** | Las alertas iban sobre el seguimiento crudo y avisaban de gemas que el público nunca vio. Admin las sigue recibiendo todas. |
| **302 en los enlaces cortos, nunca 301** | Un permanente se queda pegado en cada navegador y cambiar el destino después dejaría fuera a quien ya pasó. |
| **Firmado o nada en el webhook** | Sin secreto configurado, la ruta contesta 503 y no mira el cuerpo. |
| **El enrutado de enlaces cortos va por lista positiva** | Primero las 21 pantallas por nombre, después lo que queda al resolvedor. Una expresión negativa mal puesta se lleva por delante el sitio entero. |
| **Los múltiplos de escenario, sólo en admin** | Se parecen demasiado a una promesa de retorno. |
| **Coma decimal y espacio duro antes del %** | Se arregla donde nace el número. Un reemplazo al final no distingue un decimal de un separador de miles. |

---

## 6. Lo que se le ha pedido al motor  ·  vive en el contrato

Todo esto está escrito en `CONTRATO-ANALISIS-A-PEDIDO.md`, en los acuses de §15,
§15.1/§16/§17/§18. Lo abierto hoy:

- **El formato de decimales.** Revisado y commiteado por el motor en `b301733`
  (formateador único, mismos separadores en `plano()` y en `engine/formato`).
  Falta comprobar en producción que el escenario de la agenda ya sale con coma
  decimal, cuando el motor lo despliegue y corra el noticiero.
- **`titulo_cliente`** no llega todavía en ninguna de las ocho secciones. Mientras
  tanto el informe usa «Las dos referencias».
- **Un aviso cuando una reexportación suba la versión de un informe ya aprobado**,
  para distinguir cambio de forma de cambio de contenido.

---

## 7. Trampas conocidas  ·  leer antes de tocar

Cada una costó un incidente. Están aquí para no repetirlas.

1. **Dos cálculos para una sola verdad.** Es el error que más veces ha aparecido:
   la cabecera contra el marcador, el marcador contra el seguimiento, `visiblePara`
   contra la lista de anticipadas. **Si dos pantallas cuentan lo mismo, tienen que
   salir de la misma función.** El guardia único es `ocultoSiempre()` en
   `server/contenido.ts`.
2. **Los ficheros de `/opt/veta-web/datos/` tienen que ser de `veta:veta`.** Un
   script de mantenimiento corrido con `sudo` los dejó de root, la sincronización
   falló cada diez minutos y la excepción tumbaba el proceso. Ya se comprueba al
   instalar, en cada sincronización y al arrancar la API.
3. **Cada despliegue borra los fragmentos de código anteriores.** Una pestaña
   abierta desde antes pide nombres que ya dan 404. Resuelto con `lazySeguro()` en
   `src/lib/fragmentos.ts`, que recarga una vez.
4. **Colisión de nombres al importar.** Importar `pct` rompió 24 tests del motor
   porque varios módulos ya usaban `pct` como variable local. Alias privados.
5. **`npx tsc -p tsconfig.json` no comprueba nada** (es una solución con
   `files: []`). Los de verdad son `tsconfig.app.json` y `tsconfig.server.json`.
6. **Vercel descarta el cuerpo de las peticiones DELETE.** Por eso borrar cuentas es
   un POST.
7. **El motor manda formas que el contrato no promete.** `entidades_etiquetadas`
   llegaba como `[]` en vez de objeto y dejó seis informes en blanco. Cuando el tipo
   diga la verdad, el compilador encuentra el resto de los sitios.

---

## 8. Cómo desplegar y verificar

```bash
cd ~/Documents/VETA/site
npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.server.json --noEmit
npm run build
git add -A && git commit && git push origin main        # Vercel publica el front solo
ssh -i ~/.ssh/veta_vps root@144.91.123.49 \
  'cd /opt/veta-web && git fetch -q origin && git reset -q --hard origin/main \
   && systemctl restart veta-web && sleep 7 && systemctl is-active veta-web'
```

El front tarda un par de minutos en Vercel. **Para comprobar que el cambio está
publicado de verdad**, no basta con que el despliegue diga que sí: hay que buscar el
texto nuevo dentro del fragmento servido.

```bash
f=$(grep -l "el texto que cambié" dist/assets/*.js | head -1 | xargs basename)
curl -s "https://www.vetalab.io/assets/$f" | grep -c "el texto que cambié"
```

**Herramientas de revisión** (necesitan la vista previa en `:5310`):

```bash
node scripts/auditar-lenguaje.mjs   # 21 rutas + los correos: voseo, jerga, texto de máquina
node scripts/barrido.mjs            # 5 roles × 2 anchos: pantallas en blanco, consola,
                                    # peticiones fallidas, aviso legal, desbordes
```

Ambas tienen que salir en **0**. La última pasada completa dio 0 y 0 sobre 216 páginas.

---

## 9. Estado de producción al cerrar

Servicio activo y estable desde el 25-sep 12:19 CEST. Cero avisos en `/api/fallo`
desde el 21-sep. El sitio responde 200 entre 0,2 y 0,6 s.

**Publicado:** 3 análisis (CELO, STONK, SYN) y 1 gema (PUMP, retirada del
seguimiento por el motor: «regla de invalidación sin margen»). El **track record
público está vacío**, y es correcto: PUMP era la única que el público vio como
gema. 4 decisiones de publicación en la base, 2 cuentas.

**Alertas del motor (4, todas medias):** serie de tenedores parada desde el 22-sep,
el respaldo fuera del servidor sin producir nunca (dos alertas) y el Vigía sin filas
que vigilar.

**Noticiero:** corrió el 25-sep a las 12:30, 6 piezas publicadas y 1 rechazada.
