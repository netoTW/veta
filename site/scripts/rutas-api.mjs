/* Todas las rutas de la API con quién puede usarlas. La leen probar-matriz.mjs
   (acceso por rol) y probar-tenencia.mjs (nada declarado sale hacia un cliente). */
/* Quién pasa:
   'todos'         cualquiera
   'sesion'        cualquiera con sesión
   'admin'         sólo admin
   'sec:<sección>' quien la matriz deja en esa sección (y, si la ruta lo exige, con sesión)
   'firma'         nadie sin firma válida (webhook)
   Modo: 'lee' se prueba con todos; 'escribe' sólo con quien no debe pasar;
   'externa' no se llama (tiene efectos fuera: crea un cobro en Whop). */
export const T = [
  ['GET', '/api/yo', 'todos', 'lee'],
  ['GET', '/api/planes', 'todos', 'lee'],
  ['GET', '/api/cuenta', 'sesion', 'lee'],
  ['POST', '/api/fallo', 'todos', 'escribe'],
  ['GET', '/api/prediccion', 'sesion', 'lee'],
  ['POST', '/api/prediccion/:gemaId', 'sec:gemas.informe+sesion', 'escribe'],
  ['GET', '/api/contenido/meta', 'todos', 'lee'],
  ['GET', '/api/contenido/gemas', 'todos', 'lee'],
  ['GET', '/api/contenido/gemas/:id', 'todos', 'lee'],
  ['GET', '/api/contenido/analisis', 'todos', 'lee'],
  ['GET', '/api/contenido/analisis/:id', 'todos', 'lee'],
  ['GET', '/api/contenido/marcador', 'todos', 'lee'],
  ['GET', '/api/contenido/visuales/:id', 'todos', 'lee'],
  ['GET', '/api/contenido/noticias', 'todos', 'lee'],
  ['GET', '/api/contenido/seguimiento', 'sec:seguimiento', 'lee'],
  ['GET', '/api/contenido/benchmark', 'sec:seguimiento', 'lee'],
  ['GET', '/api/contenido/watchlist', 'sec:watchlist', 'lee'],
  ['GET', '/api/contenido/alertas', 'sec:alertas', 'lee'],
  ['GET', '/api/contenido/exportar/:que', 'sec:exportar', 'lee'],
  ['GET', '/api/analizar/universo', 'todos', 'lee'],
  ['GET', '/api/analizar/cupo', 'todos', 'lee'],
  ['POST', '/api/analizar/resolver', 'todos', 'escribe'],
  ['POST', '/api/analizar/analizable', 'todos', 'escribe'],
  ['POST', '/api/analizar/determinista', 'sec:analiza.determinista', 'escribe'],
  ['POST', '/api/analizar/profundo', 'sec:analiza.profundo+sesion', 'escribe'],
  ['GET', '/api/analizar/solicitudes', 'todos', 'lee'],   // sin sesión: lista vacía
  ['GET', '/api/analizar/solicitudes/:id', 'todos', 'lee'], // la lectura gratis se comparte por enlace; lo profundo ajeno da 404
  ['POST', '/api/analizar/solicitudes/:id/vista', 'sesion', 'escribe'],
  ['GET', '/api/analizar/activas', 'todos', 'lee'],
  ['GET', '/api/votacion', 'todos', 'lee'],
  ['POST', '/api/votacion/:id/voto', 'sec:scanner.solicitar+sesion', 'escribe'],
  ['GET', '/api/ir/:slug', 'todos', 'lee'],
  ['GET', '/api/pagos/checkout/:plan', 'todos', 'externa'],
  ['POST', '/api/pagos/whop', 'firma', 'escribe'],
  // admin
  ['GET', '/api/admin/bandeja', 'admin', 'lee'],
  ['GET', '/api/admin/bandeja/:id', 'admin', 'lee'],
  ['POST', '/api/admin/bandeja/:id/decision', 'admin', 'escribe'],
  ['GET', '/api/admin/usuarios', 'admin', 'lee'],
  ['POST', '/api/admin/usuarios', 'admin', 'escribe'],
  ['GET', '/api/admin/usuarios/:id', 'admin', 'lee'],
  ['PATCH', '/api/admin/usuarios/:id/plan', 'admin', 'escribe'],
  ['PATCH', '/api/admin/usuarios/:id/rol', 'admin', 'escribe'],
  ['PATCH', '/api/admin/usuarios/:id/estado', 'admin', 'escribe'],
  ['PATCH', '/api/admin/usuarios/:id/cupo', 'admin', 'escribe'],
  ['POST', '/api/admin/usuarios/:id/borrar', 'admin', 'escribe'],
  ['POST', '/api/admin/usuarios/:id/impersonar', 'admin', 'escribe'],
  ['GET', '/api/admin/acciones', 'admin', 'lee'],
  ['GET', '/api/admin/consumo', 'admin', 'lee'],
  ['PATCH', '/api/admin/consumo/tope', 'admin', 'escribe'],
  ['GET', '/api/admin/operacion/estado', 'admin', 'lee'],
  ['GET', '/api/admin/operacion/resumen', 'admin', 'lee'],
  ['GET', '/api/admin/operacion/alertas', 'admin', 'lee'],
  ['GET', '/api/admin/operacion/cola', 'admin', 'lee'],
  ['GET', '/api/admin/operacion/hits', 'admin', 'lee'],
  ['POST', '/api/admin/operacion/lanzar', 'admin', 'escribe'],
  ['POST', '/api/admin/operacion/sincronizar', 'admin', 'escribe'],
  ['GET', '/api/admin/votacion', 'admin', 'lee'],
  ['GET', '/api/admin/votacion/ranking', 'admin', 'lee'],
  ['POST', '/api/admin/votacion', 'admin', 'escribe'],
  ['POST', '/api/admin/votacion/:id/lanzar', 'admin', 'escribe'],
  ['POST', '/api/admin/votacion/:id/cerrar', 'admin', 'escribe'],
  ['POST', '/api/admin/noticias/:id/:accion', 'admin', 'escribe'],
  ['GET', '/api/admin/enlaces', 'admin', 'lee'],
  ['POST', '/api/admin/enlaces', 'admin', 'escribe'],
  ['POST', '/api/admin/enlaces/:slug/borrar', 'admin', 'escribe'],
]
