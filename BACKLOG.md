# Backlog

Lo que no entra en `ESPECIFICACION-LANZAMIENTO.md`. Ordenado por lo que más duele si no se hace.
Nada de esto se toca hasta que el lanzamiento esté cerrado, salvo que lo pidas.

## Antes de lanzar convendría mirarlo (decisión tuya)

- **Respaldo fuera del servidor: no ha funcionado nunca.** `veta-backup` en `failed` desde el
  primer día; las credenciales de R2 en `/opt/veta/.env` siguen siendo marcadores. Hoy no hay
  copia externa de la base ni de los datos. Lanzar con clientes pagando y sin copia es un riesgo
  real. Necesita tus credenciales de Cloudflare R2.
- **Mover Supabase a Frankfurt (`eu-central-1`).** Hoy está en `us-east-1` y el VPS en Alemania:
  100 ms por consulta, 660 ms por conexión nueva. La especificación deja el contenido público
  rápido con caché; esto arregla también sesión, cupo y admin. Toca servidor y base.
- **DefiLlama falla el 35 %** (81 de 231 llamadas este mes). Provocó la invalidación falsa de
  PUMP y va a dejar huecos en la ficha gratis. Es del motor.

## Del motor (se pide por contrato cuando toque)

- La reexportación de los 14 vigentes no ha ocurrido (`cambios_respecto_version_anterior` sigue
  siendo lista, no hay `misma_corrida`). Cuando pase: confirmar que las 4 aprobaciones sobreviven.
- `titulo_cliente` no llega en ninguna de las ocho secciones.
- `/determinista` y `registrada_reciente()` eligen por símbolo, no por contrato (§9.5.2).
- Aviso de «versión nueva sólo de forma» al reexportar un informe aprobado (§15.1.2).
- `/analizable` tarda 27–30 s; `/resolver` con contrato, 7 s.
- RAY tiene informe en local pero no en el servidor.
- Vía B de publicación: `GET /api/motor/publicados` con token, si el motor sale del VPS.

## Web, pequeño

- `/gemas` se desplaza de lado en móvil sólo con sesión de admin (122 px). Aparcado por ti.
- `/piezas` y `/admin/operacion` desbordan en móvil.
- Los múltiplos de la brecha de ingresos (`3×`) siguen a la vista del cliente en referencias.
  Pendiente de decisión.
- `test1@gmail.com` (plan pro, 20-sep): decidir si se borra.
- Cambiar de plan desde la propia web (hoy se remite al panel de Whop). El texto obsoleto de
  `Cuenta.tsx:171` («se activa a mano») sí entra en el lanzamiento, dentro del cambio de plan.
- Que las noticias pasen por la bandeja antes de publicarse (hoy se publican solas y se
  despublican desde la web). Sólo si lo decides.
