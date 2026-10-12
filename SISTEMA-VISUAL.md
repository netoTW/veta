# VETA — Sistema visual

Estado: identidad, hero y grieta aprobados. Pantallas de producto (fase 4) construidas con los datos reales del motor, pendientes de aprobación.
Fecha: 2026-09-12.

## 1. La metáfora

**La roca que se abre y revela la veta.** El producto no inventa valor: lo
encuentra en el ruido. Todo lo visual sale de ahí, en tres materiales y una
proporción fija:

| Material | Qué es | Cuánto | Dónde |
|---|---|---|---|
| Roca | Negro mate, fracturado, con grano | 80 % de la superficie | Fondos, paneles, la piedra del hero, las losas de los iconos |
| Esmeralda | Translúcida, con luz interna | Sólo donde hay algo que revelar | La veta, lo positivo, la tesis, énfasis en texto |
| Oro | Hilos finos, nunca masas (kintsugi) | Líneas, nunca rellenos | La grieta, bordes de botón, subrayados, lo destacado en charts |

Regla de oro: **si el oro cubre un área, está mal.** Botones sin relleno,
barras nunca doradas, un hilo encima de lo destacado.

## 2. Paleta

Roca (nunca negro puro):

| Token | Hex | Uso |
|---|---|---|
| `--roca-0` | `#070809` | Fondo más profundo |
| `--roca` | `#0C0E10` | Fondo base de la web |
| `--roca-2` | `#15181B` | Superficies: tarjetas, paneles |
| `--roca-3` | `#1F2327` | Superficies elevadas, bordes |
| `--grano` | `#2B3035` | Hairline fuerte, separadores |

Esmeralda:

| Token | Hex | Uso |
|---|---|---|
| `--esmeralda-sombra` | `#0F5A3C` | Fondo de la veta, área bajo curva |
| `--esmeralda` | `#1FA46F` | Positivo, series principales, la tesis |
| `--esmeralda-luz` | `#5FE0A6` | Luz interna: énfasis en texto, hover |

Oro:

| Token | Hex | Uso |
|---|---|---|
| `--oro-sombra` | `#8A6A2A` | Hilos en sombra |
| `--oro` | `#C9A24B` | Evidencia, destacado, bordes de botón |
| `--oro-luz` | `#EAD189` | Punta del hilo, texto de botón |

Texto y negativo:

| Token | Hex | Uso |
|---|---|---|
| `--hueso` | `#ECE6D8` | Texto principal, wordmark (el blanco cálido del logo) |
| `--ceniza` | `#8E918C` | Texto secundario, partículas: el ruido |
| `--ceniza-2` | `#5C605D` | Texto terciario, ejes |
| `--rojo` | `#B5473E` | Negativo apagado, error |
| `--rojo-luz` | `#D9695F` | Negativo en texto pequeño |

Hairlines: `rgba(236,230,216,0.10)` y `0.06`. Radio: desde la v2 (§20) la roca va pulida:
14 px en tarjetas, 10 px en controles, cápsula en chips. (Hasta la fase 6a: 2 px, la roca cortada.)

## 3. Tipografía

| Rol | Fuente | Peso | Ajustes |
|---|---|---|---|
| Display (títulos) | Outfit | 300 | tracking –0.015em, interlínea 1.02 |
| Wordmark | Outfit | 500 | mayúsculas, tracking +0.42em (como el logo) |
| Subtítulo de marca | Outfit | 400 | mayúsculas, tracking +0.34em, en oro |
| Cuerpo | Geist | 400 | 15–17 px, interlínea 1.6 |
| Números y etiquetas | JetBrains Mono | 500 | tabulares; etiquetas en mayúsculas, tracking 0.12em |

Todas auto-hospedadas en `site/public/fonts/` (OFL). El énfasis en títulos
(`<em>`) va en `--esmeralda-luz`, peso 400: es la veta dentro de la frase.

## 4. Hero

Composición: texto a la izquierda (título máx. 14ch), monolito a la derecha
en el tercio derecho, polvo de mineral en todo el fondo, adelgazado donde va
el titular.

Render (iteración 2, calidad fotorrealista):

- Roca: malla de 82k triángulos (icosaedro subdividido, ruido, planos de
  clivaje) con el desplazamiento del escaneo horneado en CPU. Material
  `MeshStandardMaterial` con mapas PBR escaneados de Rock035 (ambientCG,
  CC0): albedo desaturado y oscurecido, normal, roughness, AO, más un grano
  fino de detalle generado. Todo en triplanar, sin UV ni costuras.
- Veta: `MeshPhysicalMaterial` con transmisión 0.55, grosor 1.4, IOR 1.57,
  albedo de esmeralda generado (jardín, inclusiones), normal derivada,
  emisiva donde el jardín es claro. Tres luces puntuales verdes dentro del
  corte que se encienden con la apertura y bañan las caras internas.
- Grieta (iteración 3): geometría, no pintura. Cada vértice lleva la
  profundidad de surco y su vector hacia adentro, calculados en CPU sobre un
  campo de distancia a la fractura principal (dentada, con escalones, ancho
  variable que se cierra en los extremos) y a seis ramas cortas. El vertex
  shader hunde el surco según el avance de la propagación y funde las
  normales de piedra intacta con las de piedra quebrada; los dos labios
  quedan desplazados. Paredes con oclusión fuerte; en el fondo, mineral de
  oro (albedo generado) emisivo, con grumos y zonas donde desaparece.
  Micro-fisuras sin oro alrededor, desde un mapa de alturas generado. La
  propagación avanza en seis saltos con pausas; en cada salto la piedra
  tiembla y saltan astillas desde el frente de la grieta.
- Oro en la fase abierta: hilos sobre la veta, metálicos, emisivos.
- Entorno: estudio oscuro renderizado en vivo a cubemap con Lightformers
  (cero bytes): clave cálida arriba-izquierda, filo frío a la derecha.
- Post: N8AO (oclusión), bloom (umbral 0.78), aberración cromática radial,
  viñeta, tone mapping ACES sobre buffer half-float, SMAA.
- Polvo: 14k partículas que convergen + 6k suspendidas; puntos nítidos con
  desenfoque por distancia al foco, brillo variable; las más brillantes pasan
  el umbral del bloom.
- Interacción: el puntero inclina la piedra (±0.30 rad, amortiguado); en
  reposo oscila sola; paralaje en tres capas (piedra, polvo a 0.35×, fondo
  CSS a menos); el scroll la retira.

Ciclo de 21 s, gobernado por tres uniforms:

| Fase | Segundos | Qué pasa |
|---|---|---|
| Ceniza | 0–5.9 | El polvo converge sobre la piedra; al posarse se apaga |
| Grieta | 5.5–9.0 | La hendidura se propaga a saltos, con ramas, temblor y astillas; el oro asoma al fondo |
| Apertura | 9–11.5 | La roca cede en el corte y expone la veta; se encienden las luces |
| Sostén | 11.5–17 | La veta respira; su luz baña las caras internas del corte |
| Cierre | 17–21 | Se cierra y se deshace en polvo. Otra moneda |

Gamas: `full/high` (todo lo anterior, DPR ≤ 1.5), `full/medium` (sin N8AO,
sin aberración, sin transmisión, mitad de partículas, DPR ≤ 1.25),
`mobile` (poster generado + canvas 2D con polvo y pulso, giroscopio),
`basic` / sin WebGL / movimiento reducido (poster estático). `?q=high` o
`?q=medium` en la URL fuerza la calidad para revisar.

Medido en un MacBook M1 (Chrome, 1440×900, DPR 2):

| Gama | Fase cerrada | Fase abierta |
|---|---|---|
| high | 60 fps | 53–60 fps (ver nota) |
| medium | 60 fps | 60 fps |

Nota (iteración 3): con la grieta geométrica la fase abierta baja a 53 fps
en M1 a DPR 1.5; se bajó el DPR de la gama alta a 1.4 y la transmisión a
0.35 de resolución para recuperar los 60.

Peso del hero (lo que baja una gama `full`, además de la página):

| Recurso | Peso |
|---|---|
| Texturas PBR (`img/pbr/`, WebP, incl. oro mineral y mapa de grietas) | 2.91 MB |
| JS: escena + post (gzip) | 129 KB |
| JS: three + R3F (gzip) | 235 KB |
| Total hero | ≈ 3.3 MB |

La página sin 3D (gama móvil/básica) pesa ≈ 0.3 MB: app 71 KB gz, fuentes
144 KB, poster 52 KB (1440) / 181 KB (móvil).

## 5. Componentes

- **Carga (`Loader`)**: losa de roca con una grieta de oro que avanza y una
  veta que asoma detrás. Determinado (`progress`) cuando el motor reporta
  avance; indeterminado si no. Las esperas de minutos usan el determinado.
- **Riesgo (`TierIcon`)**: misma piedra, distinta veta expuesta. Bajo: veta
  ancha y clara. Medio: parcial. Alto: apenas una grieta de oro. Vector; se
  lee a 16 px y a 64 px.
- **Estados (`EmptyState`)**: `vacio` (piedra intacta), `sin-datos` (grieta
  punteada: se buscó y no había veta; es un resultado, no un fallo), `error`
  (piedra partida, marcador rojo). Texto corto, sin exclamar.
- **Botones**: primario = línea de oro sin relleno; secundario = hairline;
  `--esmeralda` sólo para acciones que revelan (abrir informe).

## 6. Charts sobre negro

| Token | Hex | Uso |
|---|---|---|
| `--chart-pos` | `#1FA46F` | Positivo, serie principal |
| `--chart-pos-2` | `#5FE0A6` | Punto final, énfasis |
| `--chart-hi` | `#C9A24B` | Destacado: un hilo encima, nunca relleno |
| `--chart-neg` | `#B5473E` | Negativo |
| `--chart-ctx` | `#8E918C` | Contexto, series secundarias |
| `--chart-grid` | hueso 8 % | Grilla |
| `--chart-axis` | `#5C605D` | Ejes |

Reglas: una sola escala Y por chart; marcas finas (líneas 2 px); grilla
recesiva; números en mono tabular; el texto nunca lleva el color de la
serie; hover con crosshair y tooltip; vista tabla siempre disponible.
Advertencia validada: oro y esmeralda quedan cerca para protanopia (ΔE 6.5),
así que lo destacado lleva siempre etiqueta o marcador, nunca sólo color.
Las pantallas de datos van sin 3D de fondo.

## 7. Recursos y dónde va cada uno

Originales en `recursos/`; versiones web en `site/public/img/`.

| Recurso | Origen | Original | Web | Uso |
|---|---|---|---|---|
| PBR roca (color, normal, roughness, AO, displacement) | ambientCG Rock035, CC0 | `recursos/texturas/pbr-rock035/` (2K JPG) | `img/pbr/roca-*.webp` (color y normal 1536, resto 1024, disp 512) | Material de la piedra |
| Grano basalto (detalle) | Higgsfield | `recursos/texturas/basalto-albedo-2048.png` | `img/pbr/roca-detalle.webp` | Grano fino sobre el albedo |
| Esmeralda (jardín) | Higgsfield | `recursos/texturas/esmeralda-albedo-2048.png` | `img/pbr/esmeralda-color.webp`, `-normal.webp` (derivada) | Albedo y normal de la veta; muestra en Materiales |
| Oro mineral (fondo de la grieta) | Higgsfield | `recursos/texturas/oro-mineral-albedo-2048.png` | `img/pbr/oro-mineral.webp` (1024) | Grumos y color del oro dentro del surco |
| Mapa de grietas (alturas) | Higgsfield | `recursos/texturas/grieta-height-2048.png` | `img/pbr/grieta-height.webp` (1024) | Micro-fisuras y rugosidad del oro |
| Grano basalto v1 | Higgsfield | `recursos/texturas/grano-basalto-1024.png` | `img/tex-grano.webp`, `img/grano-512.webp` | Fondos CSS |
| Matcaps roca/esmeralda/oro | Higgsfield | `recursos/matcaps/` | (retirados de la web) | Iteración 1; quedan como referencia de material |
| Poster hero | Higgsfield | `recursos/posters/hero-monolito-16x9.png` | `img/hero-poster*.webp` | Fallback sin WebGL y poster mientras carga el 3D |
| Poster móvil | Higgsfield | `recursos/posters/hero-movil-9x16.png` | `img/hero-poster-m.webp` | Hero móvil |
| Bloque de roca | Higgsfield | `recursos/posters/roca-bloque-16x9.png` | `img/roca-bloque.webp` | Reservado para "analiza tu moneda" |
| Logo | `marca/` | — | `img/logo-mark.webp`, `img/logo-lockup.webp`, favicons | Nav, footer, pestaña |
| Candidatos PBR descartados | ambientCG Rock031/047/048 | (no archivados) | — | Ver `recursos/capturas/candidatos-pbr.png` |

Créditos Higgsfield: 25 de 150 en total (iteración 1: 13; iteración 2: 6;
iteración 3: 6, dos texturas 2K en calidad alta). Saldo real 295: entre las
14:54 y las 15:43 del 12-09 hubo siete generaciones de GPT Image 2.0 (6,5 cada
una, 45,5 en total) que no salieron de esta sesión.

## 8. Sobre el video de brand reveal

`marca/generados/` (5 s, 576×768, vertical). No sirve para la web tal como
está y no conviene usarlo como pieza de marca sin regenerar: los frames 2–3
meten anillos tipo HUD con iconos tech y los 4–5 un sunburst dorado con
partículas. Eso es exactamente el "futurista genérico / to the moon" que la
marca rechaza. Además la resolución es baja para cualquier uso que no sea
una historia. El primer segundo (logo con un destello verde contenido) sí
está en tono. No se regeneró: la web no lo necesita (el hero es 3D), y si se
quiere un reveal para redes conviene un brief nuevo: sólo la piedra, la
grieta y la veta, sin HUD ni rayos.

## 9. Qué se reutilizó del sitio de referencia

- **Tal cual**: arquitectura de gamas (`tier.ts`), `GLBoundary`, carga
  diferida de Three/GSAP/Lenis (`motion.ts`, `Hero3D`), puntero en `window`,
  frameloop apagado fuera de vista, reveals por `data-reveal`, técnica de
  partículas con destino y retardo por atributo, normales planas por
  derivadas, muestreo de matcap por normal de vista, estructura de nav.
- **Recoloreado**: nada. La paleta se reescribió entera desde el logo.
- **De cero**: la piedra (malla densa con desplazamiento horneado, PBR
  triplanar, fractura por atributo, erosión en el corte), la veta física, el
  post-procesado, las partículas nítidas, el ciclo de cinco fases, el hero móvil (poster + ceniza + pulso), loader, iconos de riesgo,
  estados vacíos, muestra de charts, sistema tipográfico.

## 10. Pantallas de producto (fase 4)

Sobre el mismo sistema, sin 3D. Rutas en `site/`: `/gemas`, `/gemas/:id`,
`/seguimiento`, `/analisis`, `/analisis/:id`, `/watchlist`. El rol se simula
con el selector flotante o con `?rol=visitante|base|pro|admin`.

- **Datos**: `scripts/datos.mjs` compila `datos-motor/base_contenido/*.jsonl`
  a `public/datos/*.json` tomando la última versión de cada registro. No se
  calcula nada: `src/lib/contrato.ts` tipa lo que el motor entrega y
  `src/lib/formato.ts` sólo decide decimales y separadores.
- **Acceso**: `src/lib/acceso.ts` es la matriz §4 del spec de planes. La
  pieza `Puerta` bloquea una sección diciendo qué plan la abre.
- **Gemas**: listado por tier con los iconos de veta expuesta; tarjeta =
  ficha esencial del contrato, con las advertencias que cambian la decisión
  contadas y listadas. Tiers vacíos se declaran en una línea.
- **Informe**: abre en Esencial (la frase del contrato por sección) y el
  Avanzado despliega todos los números con fuente y timestamp. El bloque
  "Cambia la decisión" y las advertencias por sección se ven en ambos
  niveles. Las dos varas van lado a lado con la regla del motor entre ambas.
  Escenarios sobre una escala logarítmica común de múltiplos (0.5× a 16×).
  Datos ausentes se declaran con su motivo, nunca se ocultan.
- **Seguimiento**: estado de la tesis, precio y retorno del registro del
  día, días al cierre, condición de invalidación con la lectura del día tal
  como la escribió el motor, B1/B2 "no medible" con motivo, y la definición
  congelada de los benchmarks. Pro ve el panel de alertas.
- **Análisis**: monedas sin tesis con "Por qué no es gema" en esmeralda como
  bloque principal; el detalle reutiliza el informe.
- **Watchlist**: vigilando / radar / cerradas, con escenario, observable,
  fuente, umbral y motivo de cierre. Admin ve la marca de origen bloqueado.
- **Huecos del contrato**: `HUECOS-CONTRATO.md`.
- Capturas por rol en `recursos/capturas/producto/`.

## 11. Pendiente de aprobación / siguientes pasos

- Aprobación de las pantallas de producto (fase 4): capturas en
  `recursos/capturas/producto/`.
- Contrato: resolver los huecos bloqueantes de `HUECOS-CONTRATO.md`
  (invalidación estructurada, motivos de benchmark, tipo de advertencia).
- Cuando el motor defina su contrato: pantallas de gemas, informes y tablas
  sobre estos tokens, sin 3D de fondo.
- Sección "analiza tu moneda" con el bloque de roca como escenario.

## 12. Advertencias con severidad (Sprint 6)

Una sola regla del contrato manda: **tipar no es esconder**. Todas las advertencias siguen en los dos niveles; la severidad ordena y marca.

| severidad | marca | color | cuándo |
|---|---|---|---|
| COMPROMETE_TESIS | ◆ con halo | rojo luz `#D9695F` | si el lector no la lee, puede decidir distinto |
| LIMITA_LECTURA | ◆ | oro `#C9A24B` | falta un dato o el modelo declara un límite |
| CONTEXTO | ◆ | ceniza `#5C605D` | regla de metodología |

Cada advertencia lleva encima, en mono pequeño: severidad · tipo · campo afectado. El bloque de la ficha se agrupa por severidad y su borde pasa a rojo si hay alguna que comprometa. En las tarjetas se muestran las tres primeras ya ordenadas y un contador por severidad.

La invalidación estructurada se escribe como frase con números: `TVL por debajo de 843 284 646 USD · ventana 30 días`. En Seguimiento, el valor de hoy y el umbral van lado a lado con el signo del motor; si `cumple` es `null` el bloque se pinta en oro con «sin evaluar». Los benchmarks no medibles llevan el código enumerado en oro y el texto del motor debajo.

Capturas: `recursos/capturas/producto-s6/`.

## 13. Calidad de ejecución en las piezas de producto (iteración gráfica)

Diagnóstico aceptado: el hero estaba a un nivel y las piezas de producto a otro. El método
que faltó y que ahora se aplica a cada pieza: **construir → captura fija → criticar → rehacer**.
Herramientas: la ruta `/piezas` (laboratorio, no enlazada) muestra cada pieza aislada sobre
roca, y `scripts/shots-piezas.mjs` la fotografía a 2× (con estado hover cuando la pieza lo
tiene). Ninguna pieza se da por buena sin pasar por ahí.

**Regla que no cambia:** mismo cuidado en todo, misma cantidad de espectáculo no. Materialidad
rica sólo en badge de plan, iconos de tier, puertas, vacíos y loader. Tablas, listas de
advertencias y comparables siguen planos: ahí manda densidad y legibilidad.

### Iconos de tier: piedra fotografiada
`public/img/tier/{bajo,medio,alto}-{480,96}.webp` (≈ 190 KB en total). Generadas con Higgsfield
(GPT Image 2.5, fondo transparente) como **un solo tríptico** para que la piedra sea la misma;
recortadas por alfa con `scripts/piedras.py`. La versión de 96 px lleva la roca un 85 % más
clara (sólo la roca; la veta no se toca) para que la silueta se separe de `#0C0E10` a 24 px;
la de 480 px un 35 %. **Bajo y alto tienen la misma apertura e intensidad** (la piedra abierta
de par en par, la veta sangrando luz sobre la roca): esmeralda en bajo, **rojo intenso en alto**
(el color del riesgo). Medio es la piedra abierta a medias, con la veta más angosta. La verde
de bajo es la roja recoloreada por tono (sólo los píxeles rojos; el oro no se toca), así la
geometría es idéntica. La piedra cerrada de la
primera ronda queda como `cerrada-480.webp` para el loader. `TierIcon` elige el recorte por
tamaño (≤ 48 px → 96). `drop-shadow` esmeralda en bajo y medio, rojo en alto; la etiqueta de
alto va en rojo luz.

**Hover:** al pasar por encima (de la piedra o de su badge), la roca crece un 14 % y gira
4°, y la veta late: verde cada 1,6 s en bajo y medio; en alto late en rojo cada 0,9 s, más
fuerte y con un punto más de brillo. Con `prefers-reduced-motion` sólo crece, sin latido.

### Estado de plan: `PlanBadge`
Una sola pieza en la barra, la puerta y el laboratorio. Gratis: línea punteada, gris. Base: la
veta asoma (tinte esmeralda, gema facetada). **Pro: vidrio oscuro con borde de oro** (gradiente
de oro-sombra a luz, reflejo diagonal cada 7 s, halo de 22 px) y la barra superior se
cristaliza: su borde inferior pasa a esmeralda→oro y **sangra verde** 28 px hacia abajo, a
16 % de opacidad. Se siente al entrar y no compite con el contenido. Admin: hueso.

### Puerta de acceso
La piedra intacta (`public/img/vacio/intacta-480.webp`) es el contenido cerrado; el plan que la
abre va como `PlanBadge` real, no como texto. Hilo vertical de oro con halo (esmeralda si lo
abre Base). Versión compacta para dentro de tarjetas.

### Estados vacíos
Tríptico propio, misma piedra: intacta (vacío), abierta y vacía por dentro (sin datos), partida
con una esquirla (error, con gema roja como marca). Los vacíos de una línea llevan la piedra
intacta a 26 px.

### Loader
La piedra cerrada (tier alto) con la abierta (tier bajo) revelándose de arriba abajo por una
máscara suave; encima, la grieta de oro trazada **sobre la veta real** (centroide por fila del
verde de la foto). Determinado por `--p`; indeterminado con `@property`.

### Barrido
Botones con hilo de oro en gradiente y halo al pasar; tarjetas con un hilo de oro que se cierra
arriba al pasar y entrada suave de página; gemas facetadas en chips de estado de tesis y de
vigilancia; reglas de sección que arrancan en oro; chips con tinte.

Capturas: `recursos/capturas/piezas/` (`antes/`, `final/`, `antes-despues-*.png`,
`tiers-lamina.png`) y `recursos/capturas/producto-s7/` (pantallas completas).
Generaciones: `recursos/generados/tiers-r{1,2,3}/`. Créditos Higgsfield de esta iteración: 32 (28 + 4 de la piedra roja, generada con el tríptico anterior como referencia para que fuera la misma roca).

## 14. El login como momento de marca

`/entrar`, `/registro`, `/recuperar`, `/restablecer` comparten un marco (`src/auth/Paginas.tsx`):
la roca del hero a la derecha, obedeciendo al formulario, y un panel de vidrio a la izquierda.
La escena es la misma del hero (`HeroScene.tsx`) en **modo controlado**: en vez del ciclo de
21 s, un `Control` con objetivo de avance de la grieta (`u`, mapeado a los saltos reales),
apertura, tinte de la veta y acercamiento de cámara.

| estado | qué pasa en la piedra | qué pasa en el panel |
|---|---|---|
| reposo | la grieta apenas asoma (u 0,12) | hilo de oro tenue |
| atenta (hay algo válido) | la grieta avanza a saltos hasta la mitad | hilo de oro pleno |
| enviando | corre hasta 0,8 con un temblor | botón "Comprobando…" |
| éxito | se abre del todo, la veta inunda, la cámara entra en el corte; a 1,7 s el producto | borde esmeralda, destello, fundido a roca |
| error | la grieta se cierra de golpe, la piedra tiembla, el mineral del fondo se enciende **rojo** un instante y vuelve | borde rojo, temblor, mensaje |

Sin WebGL queda el poster con una luz en CSS que responde a los mismos estados. Móvil: poster
y panel a ancho completo. Capturas: `recursos/capturas/auth/login-0{1..5}-*.png`, `m-login.png`.

### Administración: la mesa de corte
El admin está por encima del Pro y se ve: identidad **platino** (badge de vidrio con borde de
plata y reflejo; la barra superior se cristaliza con los tres materiales, esmeralda → hueso →
oro). Cada página de admin abre con una **cabecera con la mesa** (`AdminCab`): una fotografía
generada del banco del lapidario (`public/img/admin/mesa-*.webp`: la piedra abierta con lupa,
calibre y pesa; `tres-*.webp`: las tres piedras de los tiers, para Cuentas), velo denso a la
izquierda, título con degradado esmeralda → hueso → oro y **tiles** con gema y hilo de color.

Piezas propias: **sello del Verificador** (doble línea, gema esmeralda; en rojo y latiendo si
está bloqueado), **barra de severidad** (rojo · oro · ceniza, con conteos), filas de la bandeja
con la piedra del tier a 52 px y una **cinta de estado** en el borde derecho (oro pendiente,
esmeralda publicado, rojo rechazado), barra de decisión de vidrio con hilo del color del estado
y botones con gema (aprobar esmeralda, pedir más oro, rechazar rojo), **control segmentado de
plan** en cuentas, y el registro como **línea de tiempo** con gemas por tipo de acción. Las
tablas siguen planas. Capturas: `recursos/capturas/admin-v2/`.

## 15. Jerarquía de información del informe

No es estética: es qué se ve primero y con qué peso. Regla que no se rompe: nada se esconde
ni se suaviza; todo sigue en ambos niveles.

1. **Ficha**: símbolo, tier y precio · **la tesis en grande** · **las cifras que venden**
   (`src/producto/cifras.tsx`: asimetría, rango del escenario alcista con el bajista al lado,
   fracción del máximo histórico, revenue verificado, captura de valor; con color y tamaño,
   sin inventar nada) · catalizadores · qué la invalidaría · advertencias.
2. **Advertencias**: COMPROMETE_TESIS siempre abierta y primero; LIMITA_LECTURA y CONTEXTO
   plegadas con su contador ("7 limitaciones de datos +"); el total arriba.
3. **Prosa desautorizada**: si la prosa del Redactor contradice campos del motor
   (`src/lib/contradicciones.ts`), se muestra tachada en un plegable rojo con la explicación,
   y arriba "Lo que dice el motor hoy" compuesto sólo con frases del contrato.
4. **Lenguaje llano en esencial** (`src/lib/lenguaje.ts`): los factores del tier, el estado
   económico y la lectura de microestructura traducidos; el vocabulario del motor (F/S,
   ANCHORED, §8.3, ids y versiones, señales sin fuente) queda en la vista avanzada. Las fuentes
   con fecha siguen al pie, plegadas, en ambos niveles.
5. **Análisis diario**: una pieza por día ("esto encontramos") con su lectura, cifras y "qué le
   falta para ser gema" a un lado; la semana acumula.
6. **Watchlist**: los textos de plantilla (repetidos en 3 o más filas) no se muestran; queda el
   gatillo estructurado, la fuente y el origen.

Capturas antes/después: `recursos/capturas/jerarquia/_ad-*.png`.

**Regla fijada después (lenguaje interno):** la transparencia de VETA es sobre los datos y los
riesgos de la moneda, no sobre el sistema. En las vistas de cliente no aparece el motor, el
Redactor, el Verificador, versiones, ids de registro, referencias tipo §8.3, "hueco del
contrato" ni "parser". La tesis se muestra siempre con la misma tipografía, venga de la prosa
del Redactor o de la lectura compuesta desde el contrato: el origen es invisible. Si la prosa
contradice campos del motor o habla del proceso (versiones anteriores, correcciones,
vocabulario del triage), se usa la compuesta sin avisar; el detalle vive sólo en la bandeja
(`ProsaVsMotor`). Las casillas destacadas muestran sólo cifras con valor: un dato ausente va
abajo, entre las limitaciones. Capturas: `recursos/capturas/limpieza/`.

## 16. Charts y liquidación proyectada

Los charts son contenido, no fondo: van junto a la sección que ilustran, nunca sobre tablas ni
detrás del texto. SVG a mano (`src/producto/charts/`), sin librería. Paleta: esmeralda positivo,
oro destacado, rojo apagado negativo, números en mono. Nada se calcula: el motor exporta lo
que se dibuja (`base_contenido/visuales.jsonl`, endpoint `/api/contenido/visuales/:id` con la
misma puerta que el informe).

- **Liquidación proyectada** (sección Microestructura). Nunca "mapa de liquidaciones" a secas:
  es una estimación con supuestos declarados. Una sola codificación: barras horizontales con
  eje de magnitud desde una columna central de precio; largos que se liquidarían si baja a la
  izquierda, cortos si sube a la derecha. **Ámbar en los dos lados**: el color no carga
  significado (esmeralda y rojo se reservan para donde sí lo tienen). **"Hoy" es una fila
  propia** en su lugar exacto del eje, en hueso. El rango se recorta a la ventana contigua que
  reúne el 90 % del notional; lo que queda fuera se dice en cifras ("fuera del gráfico, por
  debajo: X USD por debajo de Y"). Las zonas más densas llevan su cifra al extremo de la barra.
  El sello **SIN CALIBRAR** va arriba; supuestos y limitaciones, visibles al pie. En móvil es
  otro gráfico: filas de 24 px que juntan dos cubetas, lienzo de 400, la mitad de las marcas
  del eje, tooltip fijo debajo. Criterio: en cinco segundos se ve dónde está el precio, hacia
  qué lado hay más riesgo y cuánto.
- **Precio con máximos** (Las dos varas): serie semanal en escala logarítmica, máximo
  histórico como línea y rombo de oro, máximos de ciclo con su múltiplo, "hoy" en esmeralda; el
  titular "1/11 de su máximo histórico" se ve.
- **Revenue diario** y **TVL hoy contra hace 30 d** (Fundamentales); **concentración de
  tenedores** con las posiciones descontadas (On-chain); el rango de escenarios en escala
  logarítmica ya existía (Escala).

Capturas: `recursos/capturas/charts/` (escritorio, hover y móvil).

## 17. El benchmark en primer plano

Es la carta más fuerte: nadie mide sus picks contra un rival definido y congelado antes de ver
resultados. Por eso deja de vivir al fondo de Seguimiento y pasa a ser lo primero que se
entiende de VETA (`src/producto/marcador.tsx`).

- **Marcador vivo por gema**, arriba del informe, después de las cifras que venden: la gema, B1
  (la canasta) y B2 (la regla técnica) con su retorno, "va ganando / va perdiendo" por
  comparación, los días que quedan y "veredicto al cierre". Un benchmark no medible dice su
  motivo; nunca se muestra como cero. Nunca "ganó" antes del cierre.
- **Marcador agregado** en Seguimiento: cuántas tesis vivas van ganando o perdiendo contra
  cada benchmark y una frase ("VETA va ganando / perdiendo / parejo", hoy). Es la razón para
  volver mañana.
- **El visitante lo ve**: el agregado va antes de la puerta de acceso en Seguimiento y en Gemas.
  Es evidencia de método, no contenido de pago; el detalle por tesis sí es del plan Base.
- **Explicación donde se ve**: "Cómo se mide, y por qué casi nadie lo hace", en llano, desplegable
  junto a cada marcador; la definición congelada con fecha, debajo.
- **Predicción del usuario** (autenticado, plan con informe): "creo que le gana / no le gana a la
  canasta", una sola vez por gema, con fecha y con el estado del marcador al marcar; no se
  cambia (el servidor rechaza la segunda). Marcador personal: cuántas va acertando contra
  cuántas va acertando VETA (cada gema publicada es una apuesta de VETA a ganarle a la canasta).
  El acierto es "por ahora" hasta el cierre.

Regla de cálculo: los tres retornos vienen del cron del motor; la web sólo compara y cuenta.
No se muestran diferencias en puntos porque eso sería calcular (hueco 26). Capturas:
`recursos/capturas/benchmark/`.

## 18. La votación semanal (Pro)

`/votacion` (`src/producto/paginas/Votacion.tsx`, piezas en `src/producto/votacion/piezasVoto.tsx`,
estilos en `styles/votacion.css`). Es la segunda pantalla con espectáculo después del hero y el
login, y lo justifica: es lo que vende el plan Pro.

**La mesa.** Las candidatas son **piedras cerradas**: nadie las analizó todavía, así que no llevan
el tier (verde/rojo) sino la señal que el scanner detectó, asomando en la superficie. Cinco
firmas minerales (`public/img/voto/{triple,doble,oro,esmeralda,joven}-{480,96}.webp`), una sola
lámina generada con Higgsfield (GPT Image 2.5 con el tríptico de tiers como referencia, para que
sea la misma roca), reescalada a 4k y recortada por alfa con `scripts/piedras.py`:
- *triple*: grieta con esmeralda + dos hilos de oro + nódulos (volumen + ingresos + caja);
- *doble*: grieta esmeralda + un hilo de oro (volumen + ingresos);
- *oro*: sólo hilos de oro (ingresos, caja);
- *esmeralda*: sólo la grieta (volumen o TVL);
- *joven*: piedra recién partida, cara clara (token muy joven, carril B).
El mapeo está en `firmaDe()`; los materiales de los chips siguen la misma regla (oro = caja e
ingresos, esmeralda = movimiento, hueso = joven, rojo = alerta).

**En vivo.** La más votada lleva la etiqueta «lidera» y se ilumina: halo de oro detrás, brillo
en pantalla encima (`mix-blend-mode: screen`) y respiración de 2,6 s. El recuento se refresca
cada 12 s. Al pasar por encima la piedra sube y la veta late en esmeralda.

**El voto pesa.** Tocar una piedra la eleva y apaga las otras; aparece la confirmación con la
regla («es uno solo y no se cambia; queda con tu nombre y la fecha»). Al confirmar: la piedra
cae y rebota (`vt-cae`), la veta destella (`vt-flash`), dos ondas de oro se expanden, la sección
tiembla medio segundo y queda estampado el sello «Tu voto · fecha». Después el botón queda
deshabilitado: no hay vuelta atrás, y el servidor lo garantiza (una fila por usuario y votación).

**La mecha.** La cuenta regresiva es un hilo de oro que se consume de la apertura al cierre, con
una brasa en la punta; los segundos en oro parpadean. Con menos de 6 h el número pasa a oro;
vencido el plazo queda en 00 y avisa que el recuento es manual. Cerrada, el hilo es ceniza.

**El cierre.** La última votación cerrada se muestra como escena: la ganadora grande, iluminada,
con onda; las otras chicas y apagadas (saturación 0,25, opacidad 0,38), reveladas al entrar en
pantalla (IntersectionObserver sobre la ganadora, para que en móvil también dispare). Debajo,
el estado de la cola: en cola / análisis en marcha / **análisis publicado → enlace**.

**Velada (Base y Gratis).** La misma mesa, con las mismas piedras (la firma sale de cuántas
señales hubo y el carril, que sí se manda), desenfocadas y sin nombre (`▮▮▮▮` con
`color: transparent` y sombra). Encima, la puerta con vidrio: cuántos socios votaron, cuántos
nombres hay, quién ganó la semana pasada, `PlanBadge` Pro y «Pasar a Pro». Sin promesas de
rendimiento: se vende el trabajo de descartar, no el resultado.

**Admin** (`/admin/votacion`): mesa «tres» de fondo, KPIs (abierta/votos/por lanzar/edad del
ranking), recuento en vivo con quién votó qué, cierre manual con confirmación, «Lanzar análisis»
con confirmación explícita de costo, y la tabla del ranking del scanner para armar la próxima
(entre 2 y 6, sólo del ranking). Todo queda en el registro de acciones.

Capturas: `recursos/capturas/votacion/` (pro-01…10, base-01…03, visitante-01, admin-01…04).
Generaciones: `recursos/generados/votacion-r1/`. Créditos Higgsfield: 6 (4 de dos láminas + 2
del reescalado a 4k). Acumulado del proyecto: 67 de 150.

## 19. Analiza tu moneda: la espera como momento

`/analizar` (`src/producto/paginas/Analizar.tsx`, piezas en `src/producto/analizar/`, estilos en
`styles/analizar.css`). Tres tiempos y una regla: **primero la lectura gratis, después la
decisión, y la espera se ve**.

**La lectura (gratis, para todos).** Búsqueda sobria con sugerencias del universo cubierto.
Cinco bloques planos (Demanda · Riesgo de cola · Concentración · Tokenomics · Liquidez), cada
uno con la pregunta en llano, una palabra de lectura como chip (esmeralda = sana, oro =
atención, rojo = problema, ceniza = sin dato), una frase y sus cifras en `Dato`. Ningún bloque
dice "es gema"; no hay tesis ni escenarios. Las fuentes con ruta de archivo o `§` no se muestran.

**La decisión.** Una tarjeta con hilo de oro: qué trae el profundo (cuatro líneas), la regla
(tarda minutos, podés irte, si falla no se descuenta), el contador de cupo y el botón que dice
cuánto usa («· usa 1»). Confirmación en dos pasos. Visitante: la `Puerta` compacta del plan
Base. Cupo agotado: contador en rojo, fecha de reinicio y `PlanBadge` Pro con «seis al mes».
El contador vive además en la barra (`CupoBarra`), siempre visible para Base y Pro.

**La espera.** Dos columnas: la **roca del hero en modo controlado** (la misma `AuthEscena`
del login, reencuadrada al 190 % de ancho para que la roca quede en el centro del lienzo) y el
panel de etapas. La roca obedece al **progreso real** que reporta el sistema: la grieta avanza
por etapa (`u` 0,16 → 0,34 → 0,50 → 0,62 → 0,80), tiembla al cambiar de etapa, y en
«Buscando objeciones» **se enrojece a golpes** (`tint` 0,9 → 0,25) como en el error del login.
El panel lista las cinco etapas con gema de oro (hecha), esmeralda latiendo (actual, con el
detalle llano que manda el sistema y una barra de avance) o ceniza (pendiente); tiempo
transcurrido vivo; «Podés irte» con aviso opcional del navegador.

**El resultado.** La roca se abre según el riesgo: **bajo** = abierta de par en par con la veta
plena y dolly; **medio** = medio abierta; **alto** = apenas una grieta con el oro enrojecido
(`open` 0,14, `tint` 0,45). El panel pasa a esmeralda, muestra el `TierBadge` y dos notas: «este
análisis es tuyo, sin sello editorial» y, si aplica, «resultado de simulación». Debajo, el informe
completo con el mismo `Cuerpo` de las gemas. Bloqueado o fallido: roca cerrada con la veta roja,
hilo rojo, la etapa rota en rojo y «no se descontó de tu cupo».

**Los avisos.** En la barra, un pill esmeralda latiendo con «RAY · buscando objeciones» mientras
hay un análisis en marcha; al terminar, un aviso flotante abajo a la derecha («RAY está listo ·
Ver») y, si el usuario lo permitió, una notificación del navegador.

**Admin · Consumo** (`/admin/consumo`): gasto del mes contra el tope con barra, tope editable,
tabla por usuario (cupo, profundos, listos, sin terminar, costo real) y pedido a pedido.

Capturas: `recursos/capturas/analizar/` (01–22). Sin créditos Higgsfield: se reutilizó la roca
del hero.

## 20. v2 — roca pulida (fase 6b, 12-oct-2026)

La misma identidad con otro acabado: la roca deja de verse cortada en bruto y pasa a verse
pulida, como obsidiana con su veta de oro. El kintsugi sigue: **el oro es la costura, no la
superficie**. Se mantienen la paleta, las tipografías, los números tabulares, la textura y el 3D
de la portada. Cambian los radios, la carcasa (vidrio) y el borde (hilo metálico). Se aplica por
tokens en todo el sitio, público incluido, sin reestructurar páginas: `src/styles/pulida.css` se
carga la última y viste los selectores existentes.

### Tokens (`base.css`)

| Token | Valor | Dónde |
|---|---|---|
| `--r-tarjeta` | 14 px | tarjetas, modales, gráficos, propuestas, puertas, vacíos |
| `--r-hoja` | 16 px | hojas inferiores, cajones, menús; la burbuja del usuario |
| `--r-control` | 10 px | botones, campos, selectores segmentados (`--r` apunta aquí) |
| `--r-capsula` | 999 px | chips, estados de plan, la barra de escritura del chat |
| `--r-leve` | 6 px | leyendas sobre el lienzo, miniaturas, tooltips, código en línea |
| `--vidrio` | roca-2 al 74 % | superficies de vidrio pequeñas (barra de escritura, menús, tooltips) |
| `--vidrio-denso` | roca al 86 % | barras fijas, hojas y cajones (la legibilidad manda) |
| `--vidrio-solido` | `#15181B` | la alternativa cuando no hay desenfoque |
| `--vidrio-luz` | sombra interior 1 px hueso 10 % | el filo de luz en el borde superior de todo vidrio |
| `--vidrio-sombra` | sombra exterior suave | lo que flota: barra de escritura, menús |
| `--hilo-metal` | degradado oro-sombra → oro-luz → oro | el borde de lo que flota: línea, nunca relleno |
| `--hilo-suave` | degradado hueso 16 % → oro 26 % | el borde de tarjetas y menús |

### Reglas

- **Vidrio sólo en lo fijo y lo pequeño:** barras, la barra de escritura, hojas, cajones, menús y
  tooltips (`backdrop-filter: blur(18–22px) saturate(150%)`). Las tarjetas son sólidas. **Nunca
  detrás de un gráfico:** los lienzos van sobre fondo sólido dentro de tarjetas redondeadas
  (`.lf-g` con `overflow: hidden`), las velas se leen perfectas.
- **Sin desenfoque, mismo dibujo:** `@supports not (backdrop-filter)` cambia el vidrio por
  `--vidrio-solido`; nada depende del efecto.
- **El hilo metálico con radio:** `border-image` no sabe de esquinas, así que el borde degradado
  es una capa `::before` enmascarada al borde (`mask-composite: exclude`, 1 px). Lo usan el
  primario (`.btn`), la barra de escritura, menús, tarjetas de tablero, puertas y vacíos.
- **Barra de escritura tipo Siri:** cápsula de vidrio separada del borde, sombra suave, el
  adjunto como botón redondo y «Enviar» como cápsula. Mientras Luffy piensa (`.is-pensando`),
  un hilo de luz esmeralda → oro recorre el borde (gradiente cónico animado por `@property
  --lf-ang`, con un halo desenfocado detrás): es un hilo, no una mancha. Sin `@property`, queda
  un borde esmeralda-oro fijo.
- **Movimiento:** las vistas entran con un desplazamiento de 6 px y fundido (280 ms); hojas y
  cajones con `--ease-piedra`; los gráficos funden al cambiar de datos. Todo se apaga con
  `prefers-reduced-motion`.
- **Rendimiento:** el desenfoque sólo en elementos fijos o de pocos píxeles; nada de vidrio en
  listas largas ni en tarjetas, para mantener 60 fps al hacer scroll en el chat y en el terminal.

Capturas antes/después: `recursos/capturas/pulida/antes-despues-*.png` (portada, chat, barra
pensando, hoja del laboratorio, gemas; escritorio y teléfono).
