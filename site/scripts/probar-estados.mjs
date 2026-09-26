/* Cada estado de un pedido tiene su pantalla, y el reloj es del motor
   (ESPECIFICACION-LANZAMIENTO.md §5, contrato §20). A5.1 a A5.5.

   Levanta un motor falso (en un puerto libre) que contesta /progreso con cada estado de §20
   (con los registros reales de base_contenido/fixtures-contrato como resultado),
   arranca la API local contra él, siembra pedidos de base@veta.local en la base
   local y comprueba, en Chrome, el titular exacto de cada pantalla, que no queda
   en blanco y que no se cuela jerga. Después, el reloj: un pedido sin noticias en
   31 min no se cierra y deja UNA alerta en admin; uno que el motor no conoce desde
   hace 10 min tampoco se cierra. Al final borra lo sembrado.

   Uso: node scripts/probar-estados.mjs [carpeta-capturas]   Sale con 1 si algo falla. */
import http from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import puppeteer from 'puppeteer-core'
import { BASE, env, entrar } from './sesiones.mjs'

const OUT = process.argv[2] ?? null
const Database = createRequire(import.meta.url)('better-sqlite3')
const FIX = resolve(homedir(), 'Documents/Crypto sistem/gem-pipeline/base_contenido/fixtures-contrato')
const fixture = (f) => JSON.parse(readFileSync(`${FIX}/${f}`, 'utf8'))
const ahora = () => new Date().toISOString()
const hace = (min) => new Date(Date.now() - min * 60_000).toISOString()
const dentro = (min) => new Date(Date.now() + min * 60_000).toISOString()
const fallos = []
const ok = (c, t) => { console.log(`  ${c ? '✓' : '✗'} ${t}`); if (!c) fallos.push(t) }

/* ---------- el motor falso ---------- */
const prog = (id, o) => ({ solicitud_id: id, estado: 'en_curso', etapa: null, avance: null, detalle: '', etapas_hechas: [], iniciado: hace(5), actualizado: ahora(), terminado: null, costo_real_usd: null, resultado: null, fallo: null, verificador: null, ...o })
const MOTOR = {
  'est-cola': () => prog('est-cola', { estado: 'en_cola', puesto: 2, inicio_estimado: dentro(150) }),
  'est-cola-adm': () => prog('est-cola-adm', { estado: 'en_cola', puesto: 1, inicio_estimado: dentro(30), requiere_admin: true, motivo_cola: 'la sesión del CLI no está vigente' }),
  'est-curso': () => prog('est-curso', { estado: 'en_curso', etapa: 'esceptico', etapas_hechas: ['recolectando', 'calculando'], avance: 0.4, detalle: 'preguntando si el catalizador tiene fecha' }),
  'est-listo': () => prog('est-listo', { estado: 'listo', terminado: ahora(), resultado: fixture('analisis.json'), costo_real_usd: 1.2 }),
  'est-sintesis': () => prog('est-sintesis', { estado: 'listo', terminado: ahora(), resultado: fixture('sin_tesis_tres_integridades.json'), costo_real_usd: 1.4 }),
  'est-noanal': () => prog('est-noanal', { estado: 'no_analizable', terminado: ahora(), motivo_no_analizable: 'Ninguna fuente da un precio reciente de esta moneda' }),
  'est-cancel': () => prog('est-cancel', { estado: 'fallido', terminado: ahora(), fallo: { codigo: 'cancelado', texto: 'cancelado por el usuario' } }),
  'est-parado': () => prog('est-parado', { estado: 'en_curso', etapa: 'redactando', actualizado: hace(31) }),
}
const motor = http.createServer((req, res) => {
  const m = req.url.match(/^\/progreso\/([^/?]+)/)
  if (m && MOTOR[m[1]]) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(MOTOR[m[1]]())) }
  if (req.url.startsWith('/profundo')) { res.writeHead(503); return res.end('{}') } // el reservado no llega a enviarse
  if (req.url.startsWith('/universo')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('[]') }
  res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"no_encontrada"}')
}).listen(0, '127.0.0.1')
await new Promise((x) => motor.once('listening', x))
const PUERTO_MOTOR = motor.address().port // uno libre: el 8799 lo tenía ocupado un proceso de otra sesión

/* ---------- la API local contra ese motor ---------- */
spawnSync('pkill', ['-f', 'tsx server/index.ts']); await new Promise((x) => setTimeout(x, 1200))
import { openSync } from 'node:fs'
const registro = openSync(process.env.REGISTRO_API ?? '/dev/null', 'w')
const api = spawn('npx', ['tsx', 'server/index.ts'], { detached: true, stdio: ['ignore', registro, registro], env: { ...process.env, PORT: '5310', VETA_SERVIR_DIST: '1', BETTER_AUTH_URL: BASE, VETA_MOTOR: 'http', VETA_MOTOR_URL: `http://127.0.0.1:${PUERTO_MOTOR}`, VETA_SYNC_MINUTOS: '0' } })
for (let i = 0; i < 60; i++) { await new Promise((x) => setTimeout(x, 1000)); if (await fetch(`${BASE}/api/contenido/meta`).then((r) => r.ok).catch(() => false)) break }

/* ---------- siembra ---------- */
const db = new Database(env.VETA_DB ?? 'server/data/veta.sqlite')
const base = db.prepare('SELECT id FROM "user" WHERE email = ?').get('base@veta.local')
const periodo = db.prepare('SELECT periodo FROM cupo WHERE usuario_id = ? ORDER BY periodo DESC LIMIT 1').get(base.id)?.periodo ?? null
// Sólo los que siguen vivos llevan cupo: son los que tienen que dejarlo intacto (los terminales devolverían lo que nadie reservó).
const VIVOS_CON_CUPO = ['est-parado', 'est-perdido', 'est-cola-adm']
const IDS = ['est-cola', 'est-cola-adm', 'est-reserv', 'est-curso', 'est-listo', 'est-sintesis', 'est-noanal', 'est-cancel', 'est-bloq', 'est-viejo', 'est-parado', 'est-perdido']
db.prepare(`DELETE FROM solicitud WHERE id IN (${IDS.map(() => '?').join(',')})`).run(...IDS)
const sembrar = (id, o = {}) => {
  const f = { id, usuario_id: base.id, usuario_email: 'base@veta.local', simbolo: 'CELO', nombre: 'Celo', nivel: 'profundo', origen: 'analiza_tu_moneda', estado: 'en_curso', etapas_hechas: '[]', consume_cupo: VIVOS_CON_CUPO.includes(id) ? 1 : 0, cupo_periodo: periodo, motor: 'http', creada: hace(20), iniciada: hace(10), actualizada: hace(1), enviada: 1, vista: 1, ...o }
  const ks = Object.keys(f)
  db.prepare(`INSERT INTO solicitud (${ks.join(',')}) VALUES (${ks.map(() => '?').join(',')})`).run(...ks.map((k) => f[k]))
}
for (const id of Object.keys(MOTOR)) sembrar(id, { estado: MOTOR[id]().estado === 'en_cola' ? 'en_cola' : 'en_curso' })
sembrar('est-reserv', { estado: 'en_cola', enviada: 0, iniciada: null })
sembrar('est-bloq', { estado: 'bloqueado', terminada: hace(60), verificador: JSON.stringify({ estado: 'bloqueado', motivo_bloqueo: 'control de cobertura (§3): contradicción de tiempo — la tesis latente se declara `no_cumplido`' }) })
sembrar('est-viejo', { estado: 'fallido', terminada: hace(60), fallo: JSON.stringify({ codigo: 'motor_no_disponible', texto: "ModuleNotFoundError: No module named 'engine'" }) })
sembrar('est-perdido', { estado: 'en_curso', iniciada: hace(10), motor_actualizado: null })
const usadosAntes = periodo ? db.prepare('SELECT analisis_usados FROM cupo WHERE usuario_id = ? AND periodo = ?').get(base.id, periodo).analisis_usados : null

/* ---------- A5.1 · cada pantalla ---------- */
const cookie = await entrar('base@veta.local')
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1440, height: 1000 })
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await p.setCookie(...cookie.split('; ').map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: BASE })))
const PROHIBIDO = /§|verificador|motor|bloque|no_cumplido|tesis latente|ModuleNotFound|tenés|podés|pedí/i
const ESPERADO = {
  'est-cola': [/^Tu análisis de Celo está en la cola$/, /Puesto 2\. Empieza (hacia las|mañana)/],
  'est-cola-adm': [/^Tu análisis de Celo está en la cola$/, /Puesto 1\. Te avisamos en cuanto empiece/],
  'est-reserv': [/^Tu análisis de Celo está reservado$/, /próximo turno/],
  'est-curso': [/^Analizando Celo$/, /Buscando lo que podría salir mal/],
  'est-listo': [/^Tu análisis de Celo está listo$/, null],
  'est-sintesis': [/^Tu análisis de Celo está listo$/, /Esta vez sin tesis/],
  'est-noanal': [/^Celo no da para un análisis completo$/, /Ninguna fuente da un precio reciente de esta moneda\. No se descontó nada de tu cupo\./],
  'est-cancel': [/^Cancelaste este análisis$/, /No se descontó nada/],
  'est-bloq': [/^Este análisis no se completó$/, /No se descontó de tu cupo/],
  'est-viejo': [/^Este análisis no se completó$/, /No se descontó de tu cupo/],
}
await new Promise((x) => setTimeout(x, 4000)) // un ciclo de sincronización (cada 3 s)
for (const [id, [titular, cuerpo]] of Object.entries(ESPERADO)) {
  await p.goto(`${BASE}/analizar/s/${id}`, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {})
  await new Promise((x) => setTimeout(x, 1500))
  const h1 = (await p.$eval('.an-espera__t', (e) => e.textContent.trim()).catch(() => '')) || ''
  const panel = await p.$eval('.an-espera__panel', (e) => e.innerText).catch(() => '')
  const cuerpoTexto = await p.evaluate(() => document.body.innerText)
  if (OUT) await p.screenshot({ path: `${OUT}/${id}.png` })
  const jerga = panel.match(PROHIBIDO)?.[0]
  ok(titular.test(h1) && (!cuerpo || cuerpo.test(panel)) && !jerga && cuerpoTexto.length > 200,
    `A5.1 ${id.padEnd(13)} «${h1}»${jerga ? ` · JERGA: ${jerga}` : ''}`)
}

/* ---------- A5.5 · la API contesta 500: nunca en blanco ---------- */
await p.setRequestInterception(true)
p.on('request', (r) => (r.url().includes('/api/analizar/solicitudes/est-curso') ? r.respond({ status: 500, contentType: 'application/json', body: '{"error":"interno"}' }) : r.continue()))
await p.goto(`${BASE}/analizar/s/est-curso`, { waitUntil: 'networkidle0' }).catch(() => {})
await new Promise((x) => setTimeout(x, 1500))
const t500 = await p.evaluate(() => document.body.innerText)
if (OUT) await p.screenshot({ path: `${OUT}/est-500.png` })
ok(/Estamos comprobando tu pedido/.test(t500) && /Tu cupo está a salvo/.test(t500), 'A5.5 respuesta 500 → «Estamos comprobando tu pedido»')
await b.close()

/* ---------- A5.2 · A5.3 · A5.4 · el reloj es del motor ---------- */
const fila = (id) => db.prepare('SELECT estado, alerta_admin_en, cola FROM solicitud WHERE id = ?').get(id)
const parado1 = fila('est-parado')
await new Promise((x) => setTimeout(x, 7000)) // dos ciclos más
const parado2 = fila('est-parado')
ok(parado2.estado === 'en_curso' && !!parado1.alerta_admin_en && parado1.alerta_admin_en === parado2.alerta_admin_en,
  `A5.2 31 min sin noticias: sigue ${parado2.estado}, una sola alerta (${parado1.alerta_admin_en} = ${parado2.alerta_admin_en})`)
const usadosDespues = periodo ? db.prepare('SELECT analisis_usados FROM cupo WHERE usuario_id = ? AND periodo = ?').get(base.id, periodo).analisis_usados : null
const admin = await entrar(env.VETA_ADMIN_EMAIL)
const cons = await (await fetch(`${BASE}/api/admin/consumo`, { headers: { Cookie: admin } })).json()
const alertas = (cons.alertas ?? []).map((a) => a.id)
ok(alertas.includes('est-parado') && alertas.includes('est-cola-adm') && alertas.filter((x) => x === 'est-parado').length === 1, `A5.2/A5.3 alertas en admin: ${alertas.join(', ')}`)
const clienteAdm = await (await fetch(`${BASE}/api/analizar/solicitudes/est-cola-adm`, { headers: { Cookie: cookie } })).json()
ok(clienteAdm.solicitud.estado === 'en_cola' && !('requiere_admin' in clienteAdm.solicitud) && clienteAdm.solicitud.inicio_estimado === null, 'A5.3 requiere_admin: el cliente lo ve en cola, sin hora y sin la marca')
const perdido = fila('est-perdido')
ok(perdido.estado === 'en_curso', `A5.4 el motor no lo conoce desde hace 10 min: sigue ${perdido.estado} (la web no lo cierra)`)
ok(usadosAntes === usadosDespues, `cupo intacto durante la prueba (usados ${usadosAntes} → ${usadosDespues})`)

/* ---------- limpieza ---------- */
db.prepare(`DELETE FROM solicitud WHERE id IN (${IDS.map(() => '?').join(',')})`).run(...IDS)
db.prepare("DELETE FROM alerta WHERE gema_id LIKE 'est-%'").run()
db.close(); motor.close()
try { process.kill(-api.pid) } catch { /* ya terminó */ }
console.log(`  TOTAL de fallos: ${fallos.length}\n`)
process.exit(fallos.length ? 1 : 0)
