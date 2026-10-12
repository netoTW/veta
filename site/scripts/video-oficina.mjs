/* Video de la oficina viva con datos reales (uso local): node scripts/video-oficina.mjs <carpeta> <ancho> <alto> <movil> <segundos en vivo> */
import { chromium } from 'playwright'
import { renameSync } from 'node:fs'
import { BASE, entrar, env } from './sesiones.mjs'
const [OUT, ANCHO, ALTO, MOVIL, VIVO] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4]), process.argv[5] === 'si', Number(process.argv[6] ?? 40)]
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const cookie = await entrar(env.VETA_ADMIN_EMAIL)
const b = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: MOVIL ? 2 : 1, isMobile: MOVIL, hasTouch: MOVIL, recordVideo: { dir: OUT, size: { width: ANCHO, height: ALTO } } })
await ctx.addCookies(cookie.split('; ').map((c) => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), url: BASE } }))
const p = await ctx.newPage()
const aLaSala = () => p.evaluate(() => { const el = document.querySelector('.lf-ofi2__sala'); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 76, behavior: 'smooth' }) })
await p.goto(`${BASE}/luffy/oficina`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-prueba="escena"]', { timeout: 30000 })
await espera(1500); await aLaSala()
await espera(VIVO * 1000)
// el día de Luffy y la repetición de su turno más largo
await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await espera(900)
await p.locator('[data-prueba="tarjeta-luffy"] .lf-ag__abrir').click()
await p.waitForSelector('[data-prueba="hoja-luffy"] [data-prueba="repetir-turno"]:not([disabled])', { timeout: 30000 })
await espera(2200)
const i = await p.evaluate(() => { const rs = [...document.querySelectorAll('[data-prueba="hoja-luffy"] .lf-linea__r')]; let mejor = 0, n = -1; rs.forEach((r, k) => { const m = (r.textContent ?? '').match(/(\d+) herramientas/i); const v = m ? Number(m[1]) : 0; if (v > n && r.querySelector('[data-prueba="repetir-turno"]:not([disabled])')) { n = v; mejor = k } }); return mejor })
const fila = p.locator('[data-prueba="hoja-luffy"] .lf-linea__r').nth(i)
await fila.scrollIntoViewIfNeeded(); await espera(500)
await fila.locator('.lf-linea__abrir').click(); await espera(2600)
await fila.locator('[data-prueba="repetir-turno"]').click()
await p.waitForSelector('[data-prueba="repeticion"]')
await espera(800); await aLaSala()
await p.waitForFunction(() => /Fin del turno/.test(document.querySelector('[data-prueba="rep-paso"]')?.textContent ?? ''), null, { timeout: 90000 }).catch(() => {})
await espera(1500)
await p.locator('[data-prueba="rep-salir"]').click(); await espera(1200)
// la salud de una fuente
await p.locator('[data-prueba="objeto-parabolica"] .es-plato').click({ force: true })
await p.waitForSelector('[data-prueba="hoja-fuentes"]'); await espera(3500)
await p.keyboard.press('Escape'); await espera(600)
// Jev, por hora
await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await espera(700)
if (MOVIL) await p.locator('[data-prueba="tarjetas-agentes"]').evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' }))
await espera(900)
await p.locator('[data-prueba="tarjeta-jev"] .lf-ag__abrir').click(); await espera(3200)
await p.keyboard.press('Escape'); await espera(500)
// una moneda: su ficha
await aLaSala(); await espera(1200)
await p.locator('.es-ficha:not(.is-apagada)').first().click({ force: true })
await p.waitForURL(/\/luffy\/terminal\//, { timeout: 15000 }).catch(() => {})
await espera(3500)
const v = p.video()
await ctx.close(); await b.close()
const ruta = await v.path()
const final = `${OUT}/oficina-viva-${MOVIL ? 'telefono' : 'escritorio'}.webm`
renameSync(ruta, final); console.log(final)
