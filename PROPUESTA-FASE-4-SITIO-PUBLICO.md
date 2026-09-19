# FASE 4 [DISEÑO] — El sitio público

Propuesta. No está construido: se construye cuando lo apruebes.

---

## 1. Qué hay hoy, y por qué hay que cambiarlo

La portada (`/`) son dos piezas: `Hero` y `Sistema`.

El `Hero` está bien y se queda casi igual. El problema es todo lo que viene después.
`Sistema` son cuatro secciones —`#materiales`, `#tipografia`, `#componentes`, `#charts`—
que enseñan la paleta, las tres tipografías y los componentes de la interfaz. Es una guía
de estilo. Está publicada, es lo único que ve un visitante después del hero, y no dice
qué hace VETA, cómo lo hace ni cuánto cuesta.

Peor: los dos botones del hero, **"Analiza tu moneda"** y **"Cómo trabajamos"**,
apuntan los dos a `#sistema`. El visitante que quiere probar el producto aterriza en
una muestra de colores.

No hay páginas de nosotros, metodología, precios, términos, privacidad ni contacto.

**Lo que propongo:** sacar `Sistema` de la portada y guardarlo en `/sistema`, sin enlace
en la navegación, como referencia interna. En su lugar, cuatro páginas públicas reales.

---

## 2. El sistema visual, aplicado

Todo lo de abajo usa lo que ya existe. Nada de inventar una estética nueva.

| Pieza | De dónde sale |
|---|---|
| Roca PBR interactiva | `src/three/HeroScene.tsx`, con `Control { u, open, form, tint, shake, dolly }` |
| Paleta | `--roca-0/-2/-3`, `--hueso`, `--ceniza`, `--oro`, `--esmeralda`, `--rojo` |
| Tres tipografías | Outfit display, Geist cuerpo, JetBrains Mono números y etiquetas |
| Tres materiales | roca = el ruido · oro = la evidencia · esmeralda = la tesis |

La roca es el hilo del sitio entero: **la misma piedra en distinto estado de apertura**
según la página. Es lo que ya hace la pantalla de análisis, llevado al sitio público.

| Página | Estado de la roca | Lectura |
|---|---|---|
| Landing | `u 0.12 · open 0` | cerrada, con una veta que se insinúa |
| Nosotros | `u 0.35 · open 0.2 · tint 0` | empieza a abrirse |
| Metodología | `u` sube con el scroll, `open` sigue a la sección | se abre a medida que se explica |
| Precios | `open 0.35 / 0.7 / 1` según el plan que miras | cuanto más alto el plan, más veta |

---

## 3. Landing `/`

Seis bloques, en este orden.

1. **Hero** — el actual, con dos cambios: "Analiza tu moneda" va a `/analizar`, y
   "Cómo trabajamos" va a `/metodologia`.
2. **La promesa, en tres líneas.** Qué hace el sistema, dicho sin vocabulario de taller.
   Tesis, escenarios y riesgo de cada moneda, con cada cifra contra su fuente.
3. **Pruébalo aquí mismo.** Una caja de ticker incrustada en la portada, la misma de
   `/analizar`. Escribes RAY y ves la lectura gratis sin crear cuenta. Es la mejor
   demostración que tenemos y hoy está escondida detrás de un botón.
4. **Un informe real, recortado.** El titular, el tier y dos cifras de un análisis
   publicado, con el resto velado. Enlaza a `/gemas`. Se alimenta de lo que ya está
   aprobado; nada aprobado, no se muestra el bloque.
5. **Cómo trabajamos, en cinco pasos.** Cinco tarjetas cortas con enlace a `/metodologia`.
6. **Precios, resumidos.** Las tres columnas con el precio y una línea cada una,
   con enlace a `/precios`.

Cierre con el pie actual más los enlaces legales.

---

## 4. Nosotros `/nosotros`

La página más corta de las cuatro. Tres bloques.

- **Por qué existe VETA.** El mercado premia el ruido. Nosotros publicamos lo que
  resiste una revisión, y decimos en voz alta lo que no sabemos.
- **Cómo decidimos qué se publica.** Nada sale sin pasar por una mesa de revisión
  humana. El análisis que pide un socio es suyo aunque no se publique.
- **Qué no hacemos.** No decimos compra ni venta. No prometemos retornos. No damos
  precios objetivo. No inventamos cifras ni testimonios.

Sin fotos de equipo ni biografías por ahora, porque no hay nada real que poner.
Cuando lo haya, entra un cuarto bloque.

---

## 5. Metodología `/metodologia`

La página que convierte. Cinco secciones, y la roca se abre conforme bajas.

1. **De dónde salen los datos.** Fuentes públicas, con fecha y sello.
2. **Las dos varas.** Cómo se compara una moneda contra pares de su tamaño y su negocio.
3. **La tesis y lo que la invalidaría.** Toda tesis nuestra viene con el número que la
   tumba. Ejemplo real tomado de un informe publicado.
4. **La lectura contraria.** Antes de escribir, la tesis se ataca a propósito. Lo que
   no sobrevive no se publica.
5. **Cada cifra contra su fuente.** Si un número no coincide con su origen, el informe
   no sale. Ése es el control que más análisis frena.

Cierre: "Lo que no hay, no se muestra" y el aviso de que nada de esto es consejo de
inversión.

---

## 6. Precios `/precios`

Tres columnas. La del medio destacada.

| | **Gratis** | **Base** | **Pro** |
|---|---|---|---|
| Precio | 0 | **30 USD/mes** | **50 USD/mes** |
| Lectura instantánea de cualquier moneda | sí | sí | sí |
| Titular y tier de cada gema | sí | sí | sí |
| El informe completo | no | sí | sí |
| Análisis profundos al mes | — | 2 | 6 |
| Seguimiento diario y watchlist | no | sí | sí |
| Alertas de invalidación | no | no | sí |
| Acceso anticipado a gemas nuevas | no | no | sí |
| Voto de la moneda de la semana | no | no | sí |
| Exportar CSV y JSON | no | no | sí |

Debajo, cuatro preguntas: qué es un análisis profundo, qué pasa si falla uno,
si el cupo se acumula, y cómo se cancela.

**Una decisión que te toca a ti:** hoy no hay proveedor de pago y el plan se activa a
mano. Propongo que el botón diga **"Quiero el plan Base"** y abra un correo a VETA,
en vez de fingir un carrito que no existe. Si prefieres poner Stripe antes de publicar
precios, se invierte el orden y la página de precios espera.

---

## 7. Legales

Tres páginas sobrias, sin roca, sólo texto: `/terminos`, `/privacidad`, `/contacto`.
Enlazadas desde el pie.

Necesito de ti tres datos que no puedo inventar: la razón social o el nombre bajo el
que operas, el país desde el que facturas, y el correo de contacto. Sin eso, los
términos quedarían con huecos.

---

## 8. Orden de construcción

1. Sacar `Sistema` de la portada y arreglar los dos botones del hero. Es media hora
   y es lo que más daña hoy.
2. Metodología y Precios, que son las que convierten.
3. Landing completa con la caja de ticker incrustada.
4. Nosotros y las tres legales.

Dime qué apruebas y qué cambias, y construyo en ese orden.
