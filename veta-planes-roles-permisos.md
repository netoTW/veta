# VETA — Planes, roles y permisos

**Qué define este documento:** quién ve qué, qué se cobra y cómo se acota el costo variable.
Es el paso previo a construir las pantallas: cada sección de la plataforma se construye
sabiendo qué muestra a cada tipo de usuario.

**Principio económico que gobierna todo:** el producto es **Gemas** (costo fijo de producción,
ingreso que escala con suscriptores). El análisis on-demand es **costo variable por usuario** y
por eso nunca es el centro: se acota con cupos, no se vende.

**Tags:** `[DECIDIDO]` · `[JUICIO]` número o detalle que Pablo fija · `[DESPUÉS]`.

---

## 1. Por qué cupos y no créditos `[DECIDIDO]`

Se evaluó vender créditos de análisis y se descartó:
- Fricción de compra: el usuario tiene que decidir dos veces (suscribirse y luego comprar).
- Sistema de saldo, recargas y caducidad: complejidad de producto y de cobro.
- Psicología adversa: la gente usa menos de lo que pagó, o se enoja cuando se le acaba.

**Cupo mensual que se reinicia.** No hay saldo, no hay compra extra, no hay fricción. Si se
agota, el usuario espera al ciclo siguiente o sube de plan. **El costo máximo por suscriptor
queda acotado por diseño**, que es lo que protege el margen.

---

## 2. Los tres niveles `[DECIDIDO estructura, JUICIO precios]`

### 2.1 GRATIS — adquisición y demo
Costo para VETA: **~$0** (nada aquí consume agentes).
- **Análisis determinista instantáneo** de cualquier moneda: estructura de mercado (¿demanda
  real o castillo de apalancamiento?), riesgo de cola traducido, concentración, tokenomics,
  liquidez. Sin tesis, sin escenarios, sin informe narrativo.
- **Ledger público** con el track record **incluidos los fallos**. Es la credibilidad y es lo
  que nadie más muestra.
- **Sección Análisis**: las monedas analizadas que NO son gema, con su `motivo_sin_tesis`. Ya
  están pagadas; publicarlas es costo cero y es contenido de alto valor ("por qué SYN no es
  gema" evita que alguien se coma el próximo).
- Gemas: solo el titular y el tier, sin tesis ni escenarios.

### 2.2 BASE — el producto
Costo máximo para VETA: **~$5/usuario/mes**.
- **Todo el contenido de Gemas**: tesis, dos varas, escenarios con catalizador y horizonte,
  asimetría, riesgo, on-chain, fundamentales, objeciones del Escéptico.
- **Los dos niveles de lectura**: esencial y avanzado.
- **Seguimiento diario** de todas las gemas publicadas.
- **Watchlist y radar** con sus gatillos.
- Historial completo y ledger detallado.
- **1–2 análisis on-demand al mes** `[JUICIO]` — gancho, no propuesta central.

### 2.3 PRO — diferenciación por cosas de costo marginal cero
Costo máximo para VETA: **~$20/usuario/mes**.
Todo lo del base, más:
- **Cupo mayor de análisis on-demand**: 5–8 al mes `[JUICIO]`.
- **Acceso anticipado** a gemas nuevas (unas horas antes que el base) `[JUICIO: cuántas horas]`.
- **Alertas en tiempo real** cuando se activa una invalidación o un gatillo del watchlist.
  Esto sale del cron determinista: **costo marginal cero y valor alto**. Es de lo mejor que
  puede haber en este plan.
- **Exportación de datos** (CSV/JSON de gemas, seguimiento, ledger).
- **Solicitar que una moneda entre a la cola del scanner** (§4.2).

### 2.4 La lógica de la diferenciación
Lo que separa base de pro son **cosas que no cuestan más producirlas** (anticipación, alertas,
exportación, historial) **más un cupo mayor**. Así el margen crece con el precio sin que crezca
el costo. Nunca se diferencia por algo que multiplique el costo variable.

---

## 3. Roles `[DECIDIDO]`

| Rol | Quién | Qué puede |
|---|---|---|
| **visitante** | sin cuenta | contenido gratis (§2.1) |
| **suscriptor_base** | pago | §2.2 |
| **suscriptor_pro** | pago | §2.3 |
| **admin** | Pablo y socios | todo lo anterior + **bandeja de aprobación**, publicar/despublicar, ver el estado del motor, disparar análisis sin cupo, ver el ledger interno (incluidos los bloqueados) |

**La bandeja de aprobación es parte de la plataforma**, no una herramienta aparte. Ahí el admin
ve cada informe con su paquete, la objeción del Escéptico y el reporte del Verificador, y
aprueba o rechaza. **Nada se publica sin ese clic** (regla heredada del motor).

`[DESPUÉS]` rol **analista** (colaborador que puede revisar pero no publicar) si el equipo crece.

---

## 4. Matriz de acceso por sección

| Sección | Visitante | Base | Pro | Admin |
|---|---|---|---|---|
| **Gemas** — titular y tier | ✅ | ✅ | ✅ | ✅ |
| **Gemas** — tesis, escenarios, varas, riesgo (2 niveles) | ❌ | ✅ | ✅ | ✅ |
| **Gemas** — acceso anticipado | ❌ | ❌ | ✅ | ✅ |
| **Seguimiento** | ❌ | ✅ | ✅ | ✅ |
| **Alertas en tiempo real** | ❌ | ❌ | ✅ | ✅ |
| **Watchlist / Radar** | ❌ | ✅ | ✅ | ✅ |
| **Análisis** (monedas sin tesis) | ✅ | ✅ | ✅ | ✅ |
| **Ledger / track record** | ✅ resumen | ✅ detalle | ✅ detalle | ✅ + bloqueados |
| **Analiza tu moneda** — determinista | ✅ | ✅ | ✅ | ✅ |
| **Analiza tu moneda** — profundo | ❌ | cupo | cupo mayor | sin cupo |
| **Solicitar moneda al scanner** | ❌ | ❌ | ✅ | ✅ |
| **Exportación de datos** | ❌ | ❌ | ✅ | ✅ |
| **Noticias** | `[JUICIO]` | ✅ | ✅ | ✅ |
| **Bandeja de aprobación** | ❌ | ❌ | ❌ | ✅ |

---

## 5. Mecánica del cupo `[DECIDIDO]`

1. El cupo se **reinicia el día de renovación** del plan, no el 1 de cada mes.
2. **No se acumula** entre meses (si no lo usaste, se pierde). Esto evita que un usuario
   acumule seis meses y dispare todo junto, rompiendo el presupuesto.
3. Antes de consumir cupo, la plataforma **muestra el análisis determinista gratis**. Recién
   si el usuario pide el profundo se descuenta. Así nadie gasta cupo sin saber qué recibe.
4. El contador de cupo restante es visible en todo momento.
5. **Al agotarse:** mensaje claro con la fecha de reinicio y la opción de subir de plan. Nunca
   un error críptico ni la posibilidad de comprar más suelto.
6. **Un análisis que falla o queda bloqueado por el Verificador NO consume cupo.** El usuario
   no paga por un informe que no se le entregó.
7. **Tope global de gasto mensual** en la plataforma `[JUICIO]`: si el agregado de todos los
   análisis on-demand supera el techo, se encolan y se avisa. Red de seguridad contra un pico
   inesperado.

### 4.2 Solicitar moneda al scanner (pro)
En vez de gastar cupo en un análisis privado, el pro puede **proponer una moneda a la cola del
scanner**. Si pasa el filtro por mérito, se analiza y **se publica para todos**. Alinea lo que
el usuario quiere con lo que a VETA le conviene producir: convierte un costo variable en
contenido reutilizable. `[JUICIO]` cuántas solicitudes al mes.

---

## 6. Qué se agrega al modelo de datos

Complementa el contrato del Sprint 5 (que cubre el contenido). Esto cubre usuarios:

```
usuario { id · email · rol · plan · fecha_alta · estado }
suscripcion { usuario_id · plan · estado (activa|vencida|cancelada) ·
              fecha_renovacion · proveedor_pago · id_externo }
cupo { usuario_id · periodo · analisis_incluidos · analisis_usados ·
       solicitudes_scanner_usadas · fecha_reinicio }
uso_analisis { usuario_id · simbolo · fecha · tipo (determinista|profundo) ·
               consumio_cupo (bool) · costo_real_usd · resultado }
alerta { usuario_id · tipo (invalidacion|gatillo) · gema_id · fecha · leida }
```

`uso_analisis.costo_real_usd` importa: es lo que te deja ver **el costo real por usuario** y
ajustar los cupos con datos en vez de con intuición.

---

## 7. Precios — suposiciones, no decisiones `[JUICIO]`

Rango de partida propuesto: **base ~$30/mes, pro ~$80–100/mes.**

**Advertencia honesta:** cualquier número hoy es una suposición. Nadie ha comprado esto
todavía. Lo que sí es difícil de cambiar después es la **estructura** (qué es gratis, qué es
de pago, qué es cupo); el precio es un campo en una tabla.

Recomendación: fijar la estructura ahora, validar los números con las primeras conversaciones
con usuarios reales, y **no anclar barato "por empezar"** — subir precios después es mucho más
costoso que bajarlos, y un precio bajo señala commodity. La palanca de entrada no es el precio:
es el trial y la prueba gratis.

`[JUICIO]` ¿hay trial? Propuesta: sí, 7–14 días del plan base, sin tarjeta si el proveedor de
pago lo permite. Elimina fricción sin regalar el producto.

---

## 8. Decisiones pendientes de Pablo
1. Precios exactos de base y pro (§7).
2. Cupo de análisis: base 1 o 2; pro 5 u 8.
3. Horas de acceso anticipado del pro.
4. ¿Trial? ¿De cuántos días?
5. ¿Noticias es gratis o de pago?
6. Solicitudes al scanner por mes (pro).
7. Tope global de gasto mensual de la plataforma.
8. Proveedor de pago (Stripe u otro) — ver §9.

---

## 9. Nota operativa: los pagos son trámite, no técnica `[IMPORTANTE]`
Montar el cobro no es el problema técnico; es el **trámite**. El proveedor exige verificación
de la entidad (persona o empresa), datos bancarios, y en Chile hay consideraciones sobre cómo
se recibe dinero del exterior si se cobra en dólares. **Eso toma más tiempo que cualquier
desarrollo y conviene empezarlo antes de necesitarlo** — es lo que frena lanzamientos por
papeleo, no por código.
