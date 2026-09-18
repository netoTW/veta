import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import {
  EffectComposer, Bloom, N8AO, ChromaticAberration, Vignette, ToneMapping, SMAA,
} from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import type { Quality } from '../lib/tier'

/* ============================================================================
   Hero — la roca que se abre y revela la veta.

   Ciclo (21 s):
     1. ceniza    polvo de mineral converge sobre una forma y se apaga al posarse
     2. grieta    la piedra se quiebra: una hendidura real avanza a saltos,
                  con ramas y micro-fisuras; en el fondo asoma el oro
     3. apertura  la roca cede en el corte y expone la veta: esmeralda con
                  transmisión, luz propia e hilos de oro
     4. sostén    la veta respira; su luz baña las caras internas del corte
     5. cierre    se cierra y se deshace en ceniza

   La grieta es GEOMETRÍA, no pintura. Cada vértice lleva su profundidad de
   surco (aGroove) y el vector de desplazamiento hacia adentro (aGrooveVec),
   calculados en CPU sobre un campo de distancia a la fractura principal y a
   sus ramas: ancho variable, bordes dentados, extremos que se cierran. El
   vertex shader aplica el surco según el avance de la propagación y funde
   las normales de la piedra intacta con las de la piedra quebrada. El fondo
   del surco lleva mineral de oro emisivo; las paredes, oclusión fuerte.

   Render: PBR escaneado (Rock035, ambientCG, CC0) en triplanar sobre una
   malla densa con desplazamiento horneado; veta con transmisión; entorno
   de estudio renderizado en vivo; post N8AO + bloom + CA + viñeta + ACES.
   ========================================================================== */

const CENIZA = new THREE.Color('#B9BBB5')
const ESMERALDA = new THREE.Color('#1FA46F')
const ESMERALDA_LUZ = new THREE.Color('#5FE0A6')
const ORO = new THREE.Color('#D9B45C')

const ROCK_POS = new THREE.Vector3(2.08, -0.02, 0)
const GAP = 0.05
const ERODE = 0.24
const K_ROCK = 0.72  // repeticiones de los mapas PBR por unidad local
const K_DET = 4.4    // grano fino
const GROOVE_W = 0.16    // ancho máximo del surco (unidades locales)
const GROOVE_D = 0.17    // profundidad máxima del surco
const LIP = 0.014        // desplazamiento entre los dos labios

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)
const damp = (cur: number, target: number, lambda: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-lambda * dt))

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeNoise(seed: number) {
  const rnd = mulberry32(seed)
  const perm = new Uint8Array(512)
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]] }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const val = (x: number, y: number, z: number) => perm[(perm[(perm[x & 255] + y) & 255] + z) & 255] / 255
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  return (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
    const xf = x - xi, yf = y - yi, zf = z - zi
    const u = fade(xf), v = fade(yf), w = fade(zf)
    return lerp(
      lerp(lerp(val(xi, yi, zi), val(xi + 1, yi, zi), u), lerp(val(xi, yi + 1, zi), val(xi + 1, yi + 1, zi), u), v),
      lerp(lerp(val(xi, yi, zi + 1), val(xi + 1, yi, zi + 1), u), lerp(val(xi, yi + 1, zi + 1), val(xi + 1, yi + 1, zi + 1), u), v),
      w,
    ) * 2 - 1
  }
}

/* ------------------------------- icosfera -------------------------------- */

/** Icosaedro subdividido, indexado desde el origen: sin fusionar vértices. */
function icosphere(detail: number) {
  const t = (1 + Math.sqrt(5)) / 2
  const base = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ]
  const verts: number[] = []
  for (const [x, y, z] of base) { const l = Math.hypot(x, y, z); verts.push(x / l, y / l, z / l) }
  let faces: number[] = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ]
  for (let d = 0; d < detail; d++) {
    const cache = new Map<number, number>()
    const mid = (a: number, b: number) => {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a
      const c = cache.get(key)
      if (c !== undefined) return c
      const x = verts[a * 3] + verts[b * 3], y = verts[a * 3 + 1] + verts[b * 3 + 1], z = verts[a * 3 + 2] + verts[b * 3 + 2]
      const l = Math.hypot(x, y, z)
      verts.push(x / l, y / l, z / l)
      const i = verts.length / 3 - 1
      cache.set(key, i)
      return i
    }
    const next: number[] = []
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i], b = faces[i + 1], c = faces[i + 2]
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a)
      next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca)
    }
    faces = next
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  g.setIndex(faces)
  return g
}

/* ------------------------------ la fractura ------------------------------ */

function fractureX(y: number, z: number) {
  return 0.30 * y
    + 0.075 * Math.sin(3.4 * y + 1.1)
    + 0.055 * Math.sin(6.1 * z + 0.4)
    + 0.03 * Math.sin(11.0 * y - 2.0 * z)
}

/** Dientes: la fractura no es lisa a escala de milímetros. */
function fractureJag(y: number, z: number) {
  // Escalones: la grieta salta de lado en tramos, no ondula.
  const step = 0.014 * Math.sign(Math.sin(29 * y + 5 * z + 0.4)) + 0.008 * Math.sign(Math.sin(67 * y - 3 * z))
  return step
    + 0.009 * Math.sin(41 * y + 7 * z)
    + 0.006 * Math.sin(97 * y - 13 * z + 1.7)
    + 0.004 * Math.sin(211 * y + 0.3)
    + 0.003 * Math.sin(53 * z + 29 * y)
}

/** Ancho de la grieta a lo largo de su recorrido (0 arriba → 1 abajo): ancha
    donde más cedió, cerrándose en los extremos. */
function fractureWidth(frac: number) {
  const env = Math.pow(Math.max(0, Math.sin(Math.PI * clamp01(frac))), 0.55)
  const var1 = 0.5 + 0.5 * Math.sin(frac * 9.1 + 0.8) * Math.sin(frac * 23.0 + 2.1)
  const var2 = 0.6 + 0.4 * Math.sin(frac * 47.0)
  return GROOVE_W * env * (0.35 + 0.65 * var1) * var2
}

const fracOf = (y: number) => clamp01((1.05 - y) / 2.1)

/** Matriz de la piedra: monolito alto, apenas girado. */
const ROCK_M = new THREE.Matrix4()
  .makeTranslation(ROCK_POS.x, ROCK_POS.y, ROCK_POS.z)
  .multiply(new THREE.Matrix4().makeRotationZ(-0.08))
  .multiply(new THREE.Matrix4().makeRotationY(0.14))
  .multiply(new THREE.Matrix4().makeScale(0.96, 1.46, 0.78))
const ROCK_N = new THREE.Matrix3().getNormalMatrix(ROCK_M)
const ROCK_L = new THREE.Matrix3().setFromMatrix4(ROCK_M)

/* -------------------------------- la roca -------------------------------- */

/** Lee un mapa de alturas a un buffer gris para hornear el desplazamiento. */
function heightField(img: HTMLImageElement | ImageBitmap, size = 512) {
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, size, size)
  const d = ctx.getImageData(0, 0, size, size).data
  const out = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) out[i] = d[i * 4] / 255
  const wrap = (v: number) => ((v % 1) + 1) % 1
  return (u: number, v: number) => {
    const fu = wrap(u * 0.5) * 2, fv = wrap(v * 0.5) * 2
    const su = (fu > 1 ? 2 - fu : fu) * (size - 1), sv = (fv > 1 ? 2 - fv : fv) * (size - 1)
    const x0 = Math.floor(su), y0 = Math.floor(sv), x1 = Math.min(x0 + 1, size - 1), y1 = Math.min(y0 + 1, size - 1)
    const tx = su - x0, ty = sv - y0
    return (out[y0 * size + x0] * (1 - tx) + out[y0 * size + x1] * tx) * (1 - ty)
      + (out[y1 * size + x0] * (1 - tx) + out[y1 * size + x1] * tx) * ty
  }
}

/** La forma de la piedra: ruido + planos de clivaje. Determinista. */
function makeShape() {
  const noise = makeNoise(20260912)
  const rnd = mulberry32(4141)
  const planes: { n: THREE.Vector3; d: number }[] = []
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rnd() * 0.5
    const n = new THREE.Vector3(Math.cos(a), (rnd() - 0.5) * 0.5, Math.sin(a)).normalize()
    planes.push({ n, d: 0.56 + rnd() * 0.16 })
  }
  for (let k = 0; k < 6; k++) {
    const n = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 1.6, rnd() - 0.5).normalize()
    planes.push({ n, d: 0.70 + rnd() * 0.18 })
  }
  planes.push({ n: new THREE.Vector3(0.25, 1, 0.12).normalize(), d: 0.84 })
  planes.push({ n: new THREE.Vector3(-0.08, -1, 0.14).normalize(), d: 0.90 })

  /** Aplica la forma a un vértice unitario (in place). */
  const apply = (v: THREE.Vector3) => {
    const n1 = noise(v.x * 1.3 + 3.1, v.y * 1.3, v.z * 1.3)
    const n2 = noise(v.x * 3.6, v.y * 3.6 + 1.7, v.z * 3.6)
    v.multiplyScalar(1 + 0.17 * n1 + 0.02 * n2)
    for (const pl of planes) {
      const d = v.dot(pl.n)
      if (d > pl.d) v.addScaledVector(pl.n, pl.d - d)
    }
    return v
  }
  /** Punto de la superficie en una dirección (aprox.: radial + recorte). */
  const surface = (dir: THREE.Vector3) => {
    const v = dir.clone().normalize()
    const n1 = noise(v.x * 1.3 + 3.1, v.y * 1.3, v.z * 1.3)
    const n2 = noise(v.x * 3.6, v.y * 3.6 + 1.7, v.z * 3.6)
    let r = 1 + 0.17 * n1 + 0.02 * n2
    for (const pl of planes) {
      const c = v.dot(pl.n)
      if (c > 1e-4) r = Math.min(r, pl.d / c)
    }
    return v.multiplyScalar(r)
  }
  return { apply, surface }
}

/** Ramas: grietas cortas que salen de la principal y mueren. Polilíneas sobre
    la superficie, en espacio local. */
interface Branch { pts: THREE.Vector3[]; rootFrac: number; width: number }

function makeBranches(surface: (d: THREE.Vector3) => THREE.Vector3): Branch[] {
  const rnd = mulberry32(777)
  const specs = [
    { frac: 0.22, side: 1, len: 0.34, w: 0.075 },
    { frac: 0.34, side: -1, len: 0.26, w: 0.058 },
    { frac: 0.47, side: 1, len: 0.40, w: 0.082 },
    { frac: 0.58, side: -1, len: 0.22, w: 0.050 },
    { frac: 0.71, side: 1, len: 0.28, w: 0.066 },
    { frac: 0.80, side: -1, len: 0.18, w: 0.044 },
  ]
  return specs.map((s) => {
    const y0 = 1.05 - s.frac * 2.1
    const pts: THREE.Vector3[] = []
    const dir = new THREE.Vector3(fractureX(y0, 0.5), y0, 0.85)
    const steps = 7
    let ang = (0.35 + rnd() * 0.3) * s.side          // se abre a un lado
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      // Cada tramo tuerce un poco: la rama zigzaguea y cae.
      ang += (rnd() - 0.5) * 0.35
      const dx = Math.cos(ang) * s.side, dy = -Math.abs(Math.sin(ang)) * 0.6 - 0.25
      if (k > 0) dir.add(new THREE.Vector3(dx, dy, (rnd() - 0.5) * 0.3).multiplyScalar(s.len / steps))
      pts.push(surface(dir))
      void t
    }
    return { pts, rootFrac: s.frac, width: s.w }
  })
}

function segDist(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, tmp: THREE.Vector3, tmp2: THREE.Vector3) {
  tmp.subVectors(b, a)
  const l2 = tmp.lengthSq()
  const t = l2 > 0 ? clamp01(tmp2.subVectors(p, a).dot(tmp) / l2) : 0
  return { d: tmp.multiplyScalar(t).add(a).distanceTo(p), t }
}

interface RockBuild {
  shell: THREE.BufferGeometry
  vein: THREE.BufferGeometry
  tipPath: THREE.Vector3[]
}

function buildRock(height: (u: number, v: number) => number): RockBuild {
  const { apply, surface } = makeShape()
  const branches = makeBranches(surface)

  /** Malla base con forma y relieve horneado. */
  const build = (detail: number) => {
    const g = icosphere(detail)
    const pos = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); apply(v); pos.setXYZ(i, v.x, v.y, v.z)
    }
    g.computeVertexNormals()
    const nrm = g.attributes.normal as THREE.BufferAttribute
    const n = new THREE.Vector3()
    const local = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nrm, i)
      let wx = Math.abs(n.x) ** 4, wy = Math.abs(n.y) ** 4, wz = Math.abs(n.z) ** 4
      const s = wx + wy + wz; wx /= s; wy /= s; wz /= s
      const h = height(v.y * K_ROCK, v.z * K_ROCK) * wx + height(v.x * K_ROCK, v.z * K_ROCK) * wy + height(v.x * K_ROCK, v.y * K_ROCK) * wz
      v.addScaledVector(n, (h - 0.5) * 0.10)
      pos.setXYZ(i, v.x, v.y, v.z)
      local[i * 3] = v.x; local[i * 3 + 1] = v.y; local[i * 3 + 2] = v.z
    }
    g.computeVertexNormals()
    const dist = new Float32Array(pos.count)
    const frac = new Float32Array(pos.count)
    for (let i = 0; i < pos.count; i++) {
      const x = local[i * 3], y = local[i * 3 + 1], z = local[i * 3 + 2]
      dist[i] = x - fractureX(y, z)
      frac[i] = fracOf(y)
    }
    g.setAttribute('aLocal', new THREE.BufferAttribute(local, 3))
    g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1))
    g.setAttribute('aFrac', new THREE.BufferAttribute(frac, 1))
    return g
  }

  /* --- cáscara: densa, con el surco de la grieta --- */
  const shell = build(6)
  /** Vértice más cercano de la malla (cara delantera): ancla a la superficie real. */
  const snap = (q: THREE.Vector3) => {
    const pos = shell.attributes.position as THREE.BufferAttribute
    let best = Infinity, bi = 0
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) < 0.15) continue
      const dx = pos.getX(i) - q.x, dy = pos.getY(i) - q.y, dz = pos.getZ(i) - q.z
      const d = dx * dx + dy * dy + dz * dz
      if (d < best) { best = d; bi = i }
    }
    return new THREE.Vector3().fromBufferAttribute(pos, bi)
  }
  for (const b of branches) for (let k = 0; k < b.pts.length; k++) b.pts[k] = snap(b.pts[k])
  // Frente de la grieta (cara delantera) muestreado a lo largo del recorrido.
  const tipPath: THREE.Vector3[] = []
  for (let k = 0; k <= 40; k++) {
    const y = 1.05 - (k / 40) * 2.1
    tipPath.push(snap(new THREE.Vector3(fractureX(y, 0.5), y, 0.85)).applyMatrix4(ROCK_M))
  }
  {
    const pos = shell.attributes.position as THREE.BufferAttribute
    const nrm = shell.attributes.normal as THREE.BufferAttribute
    const count = pos.count
    const groove = new Float32Array(count)   // profundidad normalizada 0..1
    const gfrac = new Float32Array(count)    // avance de propagación que abre este vértice
    const p = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      p.fromBufferAttribute(pos, i)
      const fr = fracOf(p.y)
      // Grieta principal: distancia a la superficie de fractura, dentada.
      const dMain = Math.abs(p.x - fractureX(p.y, p.z) - fractureJag(p.y, p.z))
      const wMain = fractureWidth(fr)
      let g = wMain > 0 ? Math.max(0, 1 - dMain / wMain) : 0
      let f = fr
      // Ramas: la que más hunda manda; propagan justo después de que pase la principal.
      for (const b of branches) {
        let best = Infinity, bt = 0
        for (let k = 0; k < b.pts.length - 1; k++) {
          const { d, t } = segDist(p, b.pts[k], b.pts[k + 1], tmp, tmp2)
          if (d < best) { best = d; bt = (k + t) / (b.pts.length - 1) }
        }
        const w = b.width * (1 - bt) * (0.7 + 0.3 * Math.sin(bt * 31))
        const gb = w > 0 ? Math.max(0, 1 - best / w) : 0
        if (gb > g) { g = gb; f = b.rootFrac + bt * 0.05 }
      }
      // Perfil: cae rápido desde el labio (paredes casi verticales) y el
      // fondo queda estrecho; el exponente bajo hace eso.
      groove[i] = Math.pow(g, 0.45)
      gfrac[i] = f
    }
    // Vector de surco: hacia adentro, por la normal de la piedra intacta.
    const grooved = new Float32Array(count * 3)
    const gvec = new Float32Array(count * 3)
    const n = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nrm, i)
      const d = groove[i] * GROOVE_D
      grooved[i * 3] = p.x - n.x * d; grooved[i * 3 + 1] = p.y - n.y * d; grooved[i * 3 + 2] = p.z - n.z * d
    }
    // Normales de la piedra quebrada: se calculan sobre una copia con el surco.
    const gq = new THREE.BufferGeometry()
    gq.setAttribute('position', new THREE.BufferAttribute(grooved, 3))
    gq.setIndex(shell.getIndex())
    gq.computeVertexNormals()
    const nq = gq.attributes.normal as THREE.BufferAttribute
    const normalG = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      tmp.set(grooved[i * 3] - pos.getX(i), grooved[i * 3 + 1] - pos.getY(i), grooved[i * 3 + 2] - pos.getZ(i)).applyMatrix3(ROCK_L)
      gvec[i * 3] = tmp.x; gvec[i * 3 + 1] = tmp.y; gvec[i * 3 + 2] = tmp.z
      tmp.fromBufferAttribute(nq, i).applyMatrix3(ROCK_N).normalize()
      normalG[i * 3] = tmp.x; normalG[i * 3 + 1] = tmp.y; normalG[i * 3 + 2] = tmp.z
    }
    if (import.meta.env.DEV) {
      let nb = 0, nm = 0
      for (let i = 0; i < count; i++) if (groove[i] > 0.3) { if (Math.abs(gfrac[i] - fracOf(pos.getY(i))) > 0.002) nb++; else nm++ }
      ;(window as unknown as Record<string, unknown>).__rockStats = {
        verts: count, grooveMain: nm, grooveBranch: nb,
        branches: branches.map((b) => b.pts.map((q) => [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)])),
      }
    }
    shell.setAttribute('aGroove', new THREE.BufferAttribute(groove, 1))
    shell.setAttribute('aGFrac', new THREE.BufferAttribute(gfrac, 1))
    shell.setAttribute('aGrooveVec', new THREE.BufferAttribute(gvec, 3))
    shell.setAttribute('aNormalG', new THREE.BufferAttribute(normalG, 3))
  }
  shell.applyMatrix4(ROCK_M)
  shell.computeVertexNormals()

  /* --- veta: menos densa, más chica, sin partir --- */
  const vein = build(5)
  {
    const vp = vein.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < vp.count; i++) {
      v.fromBufferAttribute(vp, i).multiplyScalar(0.86)
      vp.setXYZ(i, v.x, v.y, v.z)
    }
    vein.applyMatrix4(ROCK_M)
    vein.computeVertexNormals()
  }

  return { shell, vein, tipPath }
}

function sampleSurface(geo: THREE.BufferGeometry, count: number, seed: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const idx = geo.index!
  const tris = idx.count / 3
  const rnd = mulberry32(seed)
  const out = new Float32Array(count * 3)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    const t = Math.floor(rnd() * tris)
    a.fromBufferAttribute(pos, idx.getX(t * 3)); b.fromBufferAttribute(pos, idx.getX(t * 3 + 1)); c.fromBufferAttribute(pos, idx.getX(t * 3 + 2))
    let u = rnd(), w = rnd()
    if (u + w > 1) { u = 1 - u; w = 1 - w }
    out[i * 3]     = a.x + (b.x - a.x) * u + (c.x - a.x) * w
    out[i * 3 + 1] = a.y + (b.y - a.y) * u + (c.y - a.y) * w
    out[i * 3 + 2] = a.z + (b.z - a.z) * u + (c.z - a.z) * w
  }
  return out
}

/* ------------------------- parches de shader (PBR) ----------------------- */

const GLSL_TRI = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWN;
  varying float vDist;
  varying float vFrac;
  vec3 triW(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
  vec4 tri(sampler2D t, vec3 p, vec3 w, float k) {
    return texture2D(t, p.yz * k) * w.x + texture2D(t, p.xz * k) * w.y + texture2D(t, p.xy * k) * w.z;
  }
  vec3 triNormal(sampler2D t, vec3 p, vec3 w, vec3 wn, float k, float s) {
    vec3 tx = texture2D(t, p.yz * k).xyz * 2.0 - 1.0;
    vec3 ty = texture2D(t, p.xz * k).xyz * 2.0 - 1.0;
    vec3 tz = texture2D(t, p.xy * k).xyz * 2.0 - 1.0;
    tx.xy *= s; ty.xy *= s; tz.xy *= s;
    tx = vec3(tx.xy + wn.zy, abs(tx.z) * wn.x);
    ty = vec3(ty.xy + wn.xz, abs(ty.z) * wn.y);
    tz = vec3(tz.xy + wn.xy, abs(tz.z) * wn.z);
    return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
  }
  // Hilos: líneas finas donde una onda cruza cero, sólo cerca del corte.
  float threads(vec3 p, float dist) {
    float g1 = sin(p.y * 7.0 + 2.2 * sin(p.z * 4.0 + p.x * 2.5) + 0.7);
    float g2 = sin(p.z * 9.5 + 1.6 * sin(p.y * 5.5 - p.x * 3.0) + 2.1);
    float l1 = 1.0 - smoothstep(0.0, 0.045, abs(g1));
    float l2 = 1.0 - smoothstep(0.0, 0.032, abs(g2));
    return max(l1, l2 * 0.8) * exp(-abs(dist) * 4.5);
  }
`

const VERT_HEAD = /* glsl */ `
  attribute vec3 aLocal;
  attribute float aDist;
  attribute float aFrac;
  uniform float uOpen;
  uniform vec3 uSplitDir;
  varying vec3 vLocal;
  varying vec3 vWN;
  varying float vDist;
  varying float vFrac;
`

interface RockUniforms {
  uOpen: { value: number }; uCrack: { value: number }; uTime: { value: number }
  uSplitDir: { value: THREE.Vector3 }
  uColorMap: { value: THREE.Texture }; uNormalMap: { value: THREE.Texture }
  uRoughMap: { value: THREE.Texture }; uAoMap: { value: THREE.Texture }; uDetailMap: { value: THREE.Texture }
  uOreMap: { value: THREE.Texture }; uCrackMap: { value: THREE.Texture }
  uGold: { value: THREE.Color }
}

function patchRock(shader: THREE.WebGLProgramParametersWithUniforms, u: RockUniforms) {
  Object.assign(shader.uniforms, u)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_HEAD}
      attribute float aGroove;
      attribute float aGFrac;
      attribute vec3 aGrooveVec;
      attribute vec3 aNormalG;
      uniform float uCrack;
      varying float vG;
      varying float vDrawn;`)
    // La propagación: este vértice se quiebra cuando la grieta ya pasó por él.
    .replace('#include <beginnormal_vertex>', `
      float drawnV = 1.0 - smoothstep(uCrack - 0.015, uCrack + 0.005, aGFrac);
      vec3 objectNormal = normalize(mix(normal, aNormalG, drawnV));
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3( tangent.xyz );
      #endif
      vWN = normalize(mat3(modelMatrix) * objectNormal);`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed += aGrooveVec * drawnV;
      float side = clamp(aDist / 0.03, -1.0, 1.0);
      // Los dos labios no quedan a ras: uno sube apenas, y se separan un pelo.
      float lipK = drawnV * smoothstep(0.0, 0.25, aGroove) * (1.0 - uOpen);
      transformed += uSplitDir * side * ${LIP.toFixed(3)} * lipK;
      transformed += objectNormal * max(side, 0.0) * ${(LIP * 0.8).toFixed(4)} * lipK;
      transformed += uSplitDir * side * uOpen * ${GAP.toFixed(3)};
      vLocal = aLocal; vDist = aDist; vFrac = aFrac;
      vG = aGroove * drawnV; vDrawn = drawnV;`)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform sampler2D uColorMap; uniform sampler2D uNormalMap; uniform sampler2D uRoughMap;
      uniform sampler2D uAoMap; uniform sampler2D uDetailMap; uniform sampler2D uOreMap; uniform sampler2D uCrackMap;
      uniform float uOpen; uniform float uCrack; uniform float uTime; uniform vec3 uGold;
      varying float vG; varying float vDrawn;
      ${GLSL_TRI}`)
    .replace('#include <map_fragment>', `
      vec3 tw = triW(vWN);
      vec3 alb = tri(uColorMap, vLocal, tw, ${K_ROCK.toFixed(2)}).rgb;
      float det = tri(uDetailMap, vLocal, tw, ${K_DET.toFixed(2)}).r;
      alb *= mix(0.70, 1.30, det);

      // Al abrirse, la roca cede a lo largo del corte: franja dentada.
      float ad = abs(vDist);
      float erode = uOpen * ${ERODE.toFixed(2)} * (0.72 + 0.28 * sin(vLocal.y * 8.0 + vLocal.z * 6.0) * cos(vLocal.y * 3.0));
      if (ad < erode) discard;

      // Micro-fisuras: sin oro, sólo sombra. Del mapa de grietas, cerca de la
      // principal y sólo donde ya pasó la propagación.
      float crackH = tri(uCrackMap, vLocal, tw, 2.3).r;
      float fis = (1.0 - smoothstep(0.15, 0.50, crackH)) * exp(-ad * 2.6) * vDrawn;
      alb *= 1.0 - 0.9 * fis;

      // El surco: paredes en sombra, fondo con mineral de oro. El oro no es
      // uniforme: vetas gruesas, zonas donde casi desaparece, grumos.
      vec3 ore = tri(uOreMap, vLocal, tw, 3.2).rgb;
      float oreLum = dot(ore, vec3(0.30, 0.59, 0.11));
      float grum = smoothstep(0.16, 0.58, oreLum);
      // El oro sólo en lo más hondo; las paredes son roca en sombra.
      float bottom = smoothstep(0.52, 0.90, vG);
      float goldMask = bottom * (0.35 + 0.65 * grum);
      float wallDark = smoothstep(0.02, 0.50, vG);
      alb *= 1.0 - 0.78 * wallDark;
      // Dorado de verdad: tinte de oro modulado por el mineral, no el marrón del mapa.
      // El mineral manda el color: donde el mapa es oscuro, el oro se apaga en la bolsa.
      vec3 goldCol = uGold * (0.22 + 1.5 * oreLum) * vec3(1.0, 0.94, 0.78);
      // El oro alumbra sus paredes: tinte cálido tenue en toda la pared, más donde hay mineral.
      alb = mix(alb, uGold * 0.5, (0.20 + 0.35 * grum) * wallDark * (1.0 - bottom));
      diffuseColor.rgb *= mix(alb, goldCol, goldMask);
      float triRough = tri(uRoughMap, vLocal, tw, ${K_ROCK.toFixed(2)}).g;
      float triAO = tri(uAoMap, vLocal, tw, ${K_ROCK.toFixed(2)}).g;`)
    .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(roughness * mix(0.80, 1.20, triRough), 0.22 + 0.3 * crackH, goldMask);`)
    .replace('#include <metalnessmap_fragment>', `float metalnessFactor = mix(metalness, 1.0, goldMask);`)
    .replace('#include <normal_fragment_maps>', `
      vec3 wn = normalize(vWN) * faceDirection;
      vec3 wN2 = triNormal(uNormalMap, vLocal, tw, wn, ${K_ROCK.toFixed(2)}, 1.35);
      normal = normalize((viewMatrix * vec4(wN2, 0.0)).xyz);
      // Relieve del mineral dentro de la bolsa: grumos, no una lámina.
      float hGold = oreLum * goldMask;
      normal = normalize(normal + vec3(dFdx(hGold), dFdy(hGold), 0.0) * 7.0);`)
    .replace('#include <aomap_fragment>', `
      // Oclusión: la del escaneo, más la del surco (el interior es lo más
      // oscuro de la escena) y la de las micro-fisuras.
      float ambientOcclusion = mix(1.0, triAO, 0.85);
      float wallOcc = wallDark * (1.0 - goldMask);
      ambientOcclusion *= 1.0 - 0.86 * wallOcc;
      ambientOcclusion *= 1.0 - 0.6 * fis;
      reflectedLight.indirectDiffuse *= ambientOcclusion;
      reflectedLight.directDiffuse *= 1.0 - 0.6 * wallOcc;
      reflectedLight.directSpecular *= 1.0 - 0.55 * wallOcc;
      #if defined( USE_ENVMAP ) && defined( STANDARD )
        float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
        reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
      #endif`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      // El oro del fondo se ilumina solo: ahí nace el contraste con la sombra.
      // Las bolsas más ricas arden; el resto apenas tibio. grum² separa unas de otras.
      totalEmissiveRadiance += goldCol * goldMask * (1.9 + 5.5 * grum * grum) * (1.0 + 0.6 * uOpen);`)
}

interface VeinUniforms {
  uOpen: { value: number }; uTime: { value: number }; uGlow: { value: number }
  uColorMap: { value: THREE.Texture }; uNormalMap: { value: THREE.Texture }
  uGold: { value: THREE.Color }; uLuz: { value: THREE.Color }
}

function patchVein(shader: THREE.WebGLProgramParametersWithUniforms, u: VeinUniforms) {
  Object.assign(shader.uniforms, u)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n  vWN = normalize(mat3(modelMatrix) * objectNormal);`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n  vLocal = aLocal; vDist = aDist; vFrac = aFrac;`)
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform sampler2D uColorMap; uniform sampler2D uNormalMap;
      uniform float uOpen; uniform float uTime; uniform float uGlow; uniform vec3 uGold; uniform vec3 uLuz;
      ${GLSL_TRI}`)
    .replace('#include <map_fragment>', `
      vec3 tw = triW(vWN);
      vec3 alb = tri(uColorMap, vLocal, tw, 1.6).rgb;
      float lum = dot(alb, vec3(0.30, 0.59, 0.11));
      float thr = threads(vLocal * 1.3 + 0.5, vDist * 0.6);
      diffuseColor.rgb *= mix(alb, uGold, thr * 0.9);
      float veinGold = thr;
      float veinLum = lum;`)
    .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(roughness, 0.30, veinGold);`)
    .replace('#include <metalnessmap_fragment>', `float metalnessFactor = mix(metalness, 1.0, veinGold);`)
    .replace('#include <normal_fragment_maps>', `
      vec3 wn = normalize(vWN) * faceDirection;
      vec3 wN2 = triNormal(uNormalMap, vLocal, tw, wn, 1.6, 0.8);
      normal = normalize((viewMatrix * vec4(wN2, 0.0)).xyz);`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float core = exp(-abs(vDist) * 3.5);
      float glow = (0.12 + 0.88 * smoothstep(0.22, 0.75, veinLum)) * (0.45 + 0.55 * core) * uGlow;
      totalEmissiveRadiance += uLuz * glow * (1.0 - veinGold) + uGold * veinGold * uGlow * 0.6;`)
}

/* --------------------------------- ciclo --------------------------------- */

const CICLO = 21

/* La propagación no es continua: cede un tramo de golpe, se frena, vuelve a
   correr. Tramos (inicio, fin, hasta dónde llega), en tiempo normalizado de
   la fase de grieta. Entre tramos, pausa. */
const JUMPS: [number, number, number][] = [
  [0.00, 0.05, 0.13],
  [0.19, 0.24, 0.31],
  [0.36, 0.39, 0.38],
  [0.48, 0.57, 0.68],
  [0.70, 0.75, 0.84],
  [0.87, 0.95, 1.00],
]

function crackProgress(u: number) {
  let v = 0, jump = 0
  for (let i = 0; i < JUMPS.length; i++) {
    const [a, b, to] = JUMPS[i]
    if (u < a) break
    const from = i ? JUMPS[i - 1][2] : 0
    v = from + (to - from) * easeOutCubic(clamp01((u - a) / (b - a)))
    jump = i + 1
  }
  return { v, jump }
}

export function cycle(f: number) {
  let form: number, crack: number, open: number, jump = 0
  if (f < 0.28) form = easeOutCubic(clamp01(f / 0.28))
  else if (f < 0.88) form = 1
  else form = 1 - easeInOutCubic(clamp01((f - 0.88) / 0.12))

  if (f < 0.26) crack = 0
  else if (f < 0.43) { const r = crackProgress((f - 0.26) / 0.17); crack = r.v; jump = r.jump }
  else if (f < 0.86) { crack = 1; jump = JUMPS.length }
  else crack = 1 - clamp01((f - 0.86) / 0.05)

  if (f < 0.43) open = 0
  else if (f < 0.55) open = easeInOutCubic(clamp01((f - 0.43) / 0.12))
  else if (f < 0.80) open = 1
  else if (f < 0.87) open = 1 - easeInOutCubic(clamp01((f - 0.80) / 0.07))
  else open = 0
  return { form, crack, open, jump }
}

/* ------------------------------- partículas ------------------------------ */

const dustVert = /* glsl */ `
  attribute vec3 aTarget;
  attribute float aDelay;
  attribute float aSeed;
  attribute float aBright;
  uniform float uForm;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uFocal;
  varying float vT;
  varying float vBright;
  varying float vBlur;
  void main() {
    float t = clamp((uForm - aDelay) / max(1.0 - aDelay, 0.001), 0.0, 1.0);
    t = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    float s = aSeed * 6.2831853;
    vec3 caos = position;
    caos.x += sin(uTime * 0.31 + s) * 0.14;
    caos.y += cos(uTime * 0.43 + s * 1.7) * 0.15;
    caos.z += sin(uTime * 0.27 + s * 2.3) * 0.14;
    vec3 p = mix(caos, aTarget, t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 0.1);
    vBlur = smoothstep(0.6, 2.4, abs(depth - uFocal));
    float size = uSize * (0.35 + aBright * aBright * 1.1) * uPixelRatio / depth * mix(1.0, 0.4, t);
    gl_PointSize = max(size * (1.0 + vBlur * 1.6), 1.2 * uPixelRatio);
    vT = t; vBright = aBright;
  }
`
const dustFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying float vT;
  varying float vBright;
  varying float vBlur;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float edge = mix(0.10, 0.42, vBlur);
    float a = 1.0 - smoothstep(0.5 - edge, 0.5, d);
    float core = 1.0 - smoothstep(0.0, 0.16, d);
    float twinkle = 0.75 + 0.25 * sin(uTime * 2.6 + vBright * 40.0);
    float b = (0.30 + vBright * vBright * 2.0) * twinkle;
    float apagado = 1.0 - smoothstep(0.80, 1.0, vT);
    vec3 c = uColor * b + vec3(1.0) * core * vBright * 0.8;
    gl_FragColor = vec4(c, a * (0.55 + 0.45 * vBright) * (1.0 - vBlur * 0.55) * apagado);
  }
`

const fieldVert = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uFocal;
  attribute float aScale;
  attribute float aSeed;
  varying float vFade;
  varying float vBlur;
  void main() {
    vec3 p = position;
    float s = aSeed * 6.2831853;
    float t = uTime * 0.12;
    p.x += sin(t + s) * 0.12;
    p.y += cos(t * 1.21 + s * 1.7) * 0.14;
    p.z += sin(t * 0.83 + s * 2.3) * 0.10;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 0.1);
    vBlur = smoothstep(0.5, 2.6, abs(depth - uFocal));
    gl_PointSize = max(uSize * aScale * uPixelRatio / depth * (1.0 + vBlur * 1.8), 1.0 * uPixelRatio);
    vFade = aScale * smoothstep(-1.2, 1.4, p.x);
  }
`
const fieldFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying float vFade;
  varying float vBlur;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float edge = mix(0.12, 0.45, vBlur);
    float a = 1.0 - smoothstep(0.5 - edge, 0.5, d);
    float tw = 0.7 + 0.3 * sin(uTime * 1.7 + vFade * 50.0);
    gl_FragColor = vec4(uColor * (0.4 + vFade * 1.2) * tw, a * 0.42 * vFade * (1.0 - vBlur * 0.6));
  }
`

/* Astillas: polvo que salta de la grieta en cada salto de la propagación.
   Cada partícula nace con posición, velocidad y hora; el shader hace el resto. */
const BURST_N = 900
const burstVert = /* glsl */ `
  attribute vec3 aVel;
  attribute float aBirth;
  attribute float aSize;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vLife;
  void main() {
    float age = uTime - aBirth;
    float life = 1.0 - clamp(age / 1.4, 0.0, 1.0);
    vLife = (age < 0.0) ? 0.0 : life;
    vec3 p = position + aVel * age + vec3(0.0, -0.22, 0.0) * age * age;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (vLife > 0.0 ? aSize * (0.5 + 0.5 * life) * uPixelRatio / max(-mv.z, 0.1) : 0.0);
  }
`
const burstFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vLife;
  void main() {
    if (vLife <= 0.0) discard;
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float a = 1.0 - smoothstep(0.2, 0.5, d);
    gl_FragColor = vec4(uColor * (0.8 + 1.4 * vLife), a * vLife * 0.9);
  }
`

/* --------------------------------- escena -------------------------------- */

interface SceneProps {
  scrollRef: React.RefObject<number>
  pointerRef: React.RefObject<{ x: number; y: number }>
  quality: Quality
  control?: React.RefObject<Control>
}

/** Estado compartido del ciclo, escrito por Rock y leído por Rig (temblor). */
interface CycleState { jump: number; shake: number }

/* ---------- modo controlado (login) ----------
   En vez del ciclo de 21 s, la escena obedece a un objetivo que escribe la
   página: hasta dónde llega la grieta (u → saltos reales de crackProgress),
   cuánto se abre, el tinte de la veta (0 esmeralda · 1 rojo: la llave
   equivocada) y un acercamiento de cámara para el éxito. */
export interface Control {
  /** Avance objetivo de la propagación, 0..1. Se mapea a los saltos reales. */
  u: number
  open: number
  form: number
  tint: number
  /** Pulso de temblor: la escena lo consume (lo vuelve a 0). */
  shake: number
  dolly: number
}
export const controlInicial = (): Control => ({ u: 0.12, open: 0, form: 1, tint: 0, shake: 0, dolly: 0 })
const ROJO_LUZ = new THREE.Color('#FF5A46')
const ROJO = new THREE.Color('#C8352A')
const VEIN_VERDE = new THREE.Color('#1c8f62')
const VEIN_ROJO = new THREE.Color('#8a1f18')
const ATT_VERDE = new THREE.Color('#0a3d2a')
const ATT_ROJO = new THREE.Color('#3d0a0a')
const ORO_ROJO = new THREE.Color('#FF3A2A')

function Rock({ quality, timeRef, cyc, control }: { quality: Quality; timeRef: React.RefObject<number>; cyc: React.RefObject<CycleState>; control?: React.RefObject<Control> }) {
  const [colorMap, normalMap, roughMap, aoMap, detailMap, dispMap, esmColor, esmNormal, oreMap, crackMap] = useLoader(THREE.TextureLoader, [
    '/img/pbr/roca-color.webp', '/img/pbr/roca-normal.webp', '/img/pbr/roca-rough.webp',
    '/img/pbr/roca-ao.webp', '/img/pbr/roca-detalle.webp', '/img/pbr/roca-disp.webp',
    '/img/pbr/esmeralda-color.webp', '/img/pbr/esmeralda-normal.webp',
    '/img/pbr/oro-mineral.webp', '/img/pbr/grieta-height.webp',
  ])
  const { gl } = useThree()

  // Configuración de texturas antes del primer render (por eso useMemo y no useEffect).
  useMemo(() => {
    for (const t of [colorMap, normalMap, roughMap, aoMap, detailMap, esmColor, esmNormal, oreMap, crackMap]) {
      t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping
      t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
      t.colorSpace = THREE.NoColorSpace
    }
    colorMap.colorSpace = THREE.SRGBColorSpace
    esmColor.colorSpace = THREE.SRGBColorSpace
    oreMap.colorSpace = THREE.SRGBColorSpace
    return true
  }, [colorMap, normalMap, roughMap, aoMap, detailMap, esmColor, esmNormal, oreMap, crackMap, gl])

  const { shell, vein, tipPath } = useMemo(() => buildRock(heightField(dispMap.image)), [dispMap])

  const splitDir = useMemo(() => {
    const d = new THREE.Vector3(1, -0.30, 0).normalize()
    d.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.14)
    d.applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.08)
    return d
  }, [])

  const rockU = useMemo<RockUniforms>(() => ({
    uOpen: { value: 0 }, uCrack: { value: 0 }, uTime: { value: 0 }, uSplitDir: { value: splitDir },
    uColorMap: { value: colorMap }, uNormalMap: { value: normalMap }, uRoughMap: { value: roughMap },
    uAoMap: { value: aoMap }, uDetailMap: { value: detailMap }, uOreMap: { value: oreMap }, uCrackMap: { value: crackMap },
    uGold: { value: ORO.clone() },
  }), [splitDir, colorMap, normalMap, roughMap, aoMap, detailMap, oreMap, crackMap])
  const veinU = useMemo<VeinUniforms>(() => ({
    uOpen: { value: 0 }, uTime: { value: 0 }, uGlow: { value: 0 },
    uColorMap: { value: esmColor }, uNormalMap: { value: esmNormal },
    uGold: { value: ORO }, uLuz: { value: ESMERALDA_LUZ.clone() },
  }), [esmColor, esmNormal])

  const rockMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#d6d2ca', roughness: 0.84, metalness: 0.0, side: THREE.DoubleSide,
      envMapIntensity: 1.4,
    })
    m.onBeforeCompile = (s) => patchRock(s, rockU)
    m.customProgramCacheKey = () => 'veta-rock-3'
    return m
  }, [rockU])

  const veinMat = useMemo(() => {
    const high = quality === 'high'
    const m = new THREE.MeshPhysicalMaterial({
      color: '#1c8f62', roughness: 0.34, metalness: 0.0,
      transmission: high ? 0.55 : 0, thickness: 1.4, ior: 1.57,
      attenuationColor: new THREE.Color('#0a3d2a'), attenuationDistance: 0.9,
      clearcoat: 0.15, clearcoatRoughness: 0.45, specularIntensity: 0.35,
      emissive: '#000000', envMapIntensity: 1.2,
    })
    m.onBeforeCompile = (s) => patchVein(s, veinU)
    m.customProgramCacheKey = () => 'veta-vein'
    return m
  }, [veinU, quality])

  // Luces dentro del corte: tres puntos a lo largo de la fractura.
  const lightPos = useMemo(() => [0.72, 0.05, -0.62].map((y) => {
    const p = new THREE.Vector3(fractureX(y, 0.35) + 0.02, y, 0.55)
    return p.applyMatrix4(ROCK_M)
  }), [])
  const lights = useRef<(THREE.PointLight | null)[]>([])

  // Polvo que converge sobre la piedra.
  const dustCount = quality === 'high' ? 14000 : 7000
  const dust = useMemo(() => {
    const targets = sampleSurface(shell, dustCount, 777)
    const origin = new Float32Array(dustCount * 3)
    const delay = new Float32Array(dustCount)
    const seed = new Float32Array(dustCount)
    const bright = new Float32Array(dustCount)
    const rnd = mulberry32(9091)
    for (let i = 0; i < dustCount; i++) {
      const r = Math.pow(rnd(), 0.45)
      const th = rnd() * Math.PI * 2
      const ph = Math.acos(2 * rnd() - 1)
      origin[i * 3]     = ROCK_POS.x - 1.1 + Math.sin(ph) * Math.cos(th) * r * 3.8
      origin[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * r * 2.4
      origin[i * 3 + 2] = Math.cos(ph) * r * 1.8
      delay[i] = rnd() * 0.45
      seed[i] = rnd()
      bright[i] = Math.pow(rnd(), 2.6)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(origin, 3))
    g.setAttribute('aTarget', new THREE.BufferAttribute(targets, 3))
    g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('aBright', new THREE.BufferAttribute(bright, 1))
    return g
  }, [shell, dustCount])
  const dustU = useMemo(() => ({
    uForm: { value: 0 }, uTime: { value: 0 }, uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) },
    uSize: { value: 21 }, uFocal: { value: 5.6 }, uColor: { value: CENIZA },
  }), [gl])

  // Astillas de cada salto.
  const burst = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST_N * 3), 3))
    g.setAttribute('aVel', new THREE.BufferAttribute(new Float32Array(BURST_N * 3), 3))
    g.setAttribute('aBirth', new THREE.BufferAttribute(new Float32Array(BURST_N).fill(-100), 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(BURST_N), 1))
    return g
  }, [])
  const burstU = useMemo(() => ({
    uTime: { value: 0 }, uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) }, uColor: { value: new THREE.Color('#8f8c82') },
  }), [gl])
  const burstHead = useRef(0)
  const burstRnd = useMemo(() => mulberry32(313), [])

  /** Punto del frente de la grieta (cara delantera) para un avance dado. */
  const tip = useMemo(() => (frac: number) => {
    const f = clamp01(frac) * (tipPath.length - 1)
    const i = Math.min(Math.floor(f), tipPath.length - 2)
    return tipPath[i].clone().lerp(tipPath[i + 1], f - i)
  }, [tipPath])

  const spawn = (from: number, to: number, t: number) => {
    const pos = burst.attributes.position as THREE.BufferAttribute
    const vel = burst.attributes.aVel as THREE.BufferAttribute
    const birth = burst.attributes.aBirth as THREE.BufferAttribute
    const size = burst.attributes.aSize as THREE.BufferAttribute
    const n = 70
    for (let k = 0; k < n; k++) {
      const i = burstHead.current; burstHead.current = (i + 1) % BURST_N
      const p = tip(from + (to - from) * burstRnd())
      pos.setXYZ(i, p.x, p.y, p.z)
      const sp = 0.18 + burstRnd() * 0.45
      vel.setXYZ(i, (burstRnd() - 0.5) * sp, (burstRnd() * 0.5 - 0.05) * sp, (0.5 + burstRnd() * 0.6) * sp)
      birth.setX(i, t + burstRnd() * 0.08)
      size.setX(i, 3 + burstRnd() * 6)
    }
    pos.needsUpdate = true; vel.needsUpdate = true; birth.needsUpdate = true; size.needsUpdate = true
  }

  const veinRef = useRef<THREE.Mesh>(null)
  const dustMat = useRef<THREE.ShaderMaterial>(null)
  const burstMat = useRef<THREE.ShaderMaterial>(null)
  const prevJump = useRef(0)
  const prevCrack = useRef(0)
  // Estado suavizado del modo controlado.
  const ctl = useRef({ u: 0, open: 0, form: 0, tint: 0, tPrev: 0 })

  useFrame(() => {
    const t = timeRef.current ?? 0
    let form: number, crack: number, open: number, jump: number
    if (control?.current) {
      const c = control.current, st = ctl.current
      const dt = Math.min(Math.max(t - st.tPrev, 0), 0.1); st.tPrev = t
      // La grieta avanza a su ritmo y retrocede rápido (la llave equivocada la cierra de golpe).
      st.u = damp(st.u, c.u, c.u > st.u ? 1.4 : 5, dt)
      st.open = damp(st.open, c.open, 1.8, dt)
      st.form = damp(st.form, c.form, 1.6, dt)
      st.tint = damp(st.tint, c.tint, c.tint > st.tint ? 9 : 1.6, dt)
      const r = crackProgress(st.u)
      form = st.form; crack = r.v; open = st.open; jump = r.jump
      if (c.shake > 0) { if (cyc.current) cyc.current.shake = Math.max(cyc.current.shake, c.shake); c.shake = 0 }
      // Tinte: la veta y sus luces viran a rojo con la llave equivocada, y vuelven.
      veinU.uLuz.value.lerpColors(ESMERALDA_LUZ, ROJO_LUZ, st.tint)
      rockU.uGold.value.lerpColors(ORO, ORO_ROJO, st.tint)
      veinMat.color.lerpColors(VEIN_VERDE, VEIN_ROJO, st.tint)
      veinMat.attenuationColor.lerpColors(ATT_VERDE, ATT_ROJO, st.tint)
      lights.current.forEach((l, i) => { if (l) l.color.lerpColors(i === 1 ? ESMERALDA_LUZ : ESMERALDA, i === 1 ? ROJO_LUZ : ROJO, st.tint) })
    } else {
      ;({ form, crack, open, jump } = cycle((t % CICLO) / CICLO))
    }
    const breathe = 0.82 + 0.18 * Math.sin(t * 1.1)
    rockU.uOpen.value = open; rockU.uCrack.value = crack; rockU.uTime.value = t
    veinU.uOpen.value = open; veinU.uTime.value = t; veinU.uGlow.value = open * breathe * 1.05 + (control?.current ? ctl.current.tint * 0.35 : 0)
    if (veinRef.current) veinRef.current.visible = open > 0.01
    for (const l of lights.current) if (l) l.intensity = (open * breathe + (control?.current ? ctl.current.tint * 0.18 : 0)) * (quality === 'high' ? 7.5 : 6)
    if (dustMat.current) { dustMat.current.uniforms.uForm.value = form; dustMat.current.uniforms.uTime.value = t }
    if (burstMat.current) burstMat.current.uniforms.uTime.value = t

    // Un salto nuevo: astillas desde el tramo que acaba de ceder, y la piedra
    // acusa el golpe (Rig lee cyc.shake).
    if (jump !== prevJump.current) {
      if (jump > prevJump.current && jump <= JUMPS.length) {
        spawn(prevCrack.current, JUMPS[jump - 1][2], t)
        if (cyc.current) cyc.current.shake = 1
      }
      prevJump.current = jump
    }
    prevCrack.current = crack
    if (cyc.current) cyc.current.jump = jump

    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__cycle = {
        t: +t.toFixed(2), form: +form.toFixed(3), crack: +crack.toFixed(3), open: +open.toFixed(3), jump,
      }
    }
  })

  return (
    <group>
      <mesh ref={veinRef} geometry={vein} material={veinMat} frustumCulled={false} />
      <mesh geometry={shell} material={rockMat} frustumCulled={false} />
      {lightPos.map((p, i) => (
        <pointLight
          key={i}
          ref={(el) => { lights.current[i] = el }}
          position={p}
          color={i === 1 ? ESMERALDA_LUZ : ESMERALDA}
          intensity={0}
          distance={2.6}
          decay={2}
        />
      ))}
      <points geometry={dust} frustumCulled={false}>
        <shaderMaterial
          ref={dustMat} uniforms={dustU}
          vertexShader={dustVert} fragmentShader={dustFrag}
          transparent depthWrite={false} blending={THREE.AdditiveBlending}
        />
      </points>
      <points geometry={burst} frustumCulled={false}>
        <shaderMaterial
          ref={burstMat} uniforms={burstU}
          vertexShader={burstVert} fragmentShader={burstFrag}
          transparent depthWrite={false} blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}

function Field({ quality, timeRef }: { quality: Quality; timeRef: React.RefObject<number> }) {
  const { gl } = useThree()
  const mat = useRef<THREE.ShaderMaterial>(null)
  const count = quality === 'high' ? 6000 : 3000
  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const scale = new Float32Array(count)
    const seed = new Float32Array(count)
    const rnd = mulberry32(20260912)
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (rnd() - 0.5) * 11
      pos[i * 3 + 1] = (rnd() - 0.5) * 6.5
      pos[i * 3 + 2] = (rnd() - 0.5) * 4 - 0.6
      scale[i] = 0.25 + Math.pow(rnd(), 2.2) * 1.1
      seed[i] = rnd()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aScale', new THREE.BufferAttribute(scale, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    return g
  }, [count])
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uPixelRatio: { value: Math.min(gl.getPixelRatio(), 2) },
    uSize: { value: 14 }, uFocal: { value: 5.6 }, uColor: { value: CENIZA },
  }), [gl])
  useFrame(() => { if (mat.current) mat.current.uniforms.uTime.value = timeRef.current ?? 0 })
  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={mat} uniforms={uniforms}
        vertexShader={fieldVert} fragmentShader={fieldFrag}
        transparent depthWrite={false} blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

/* Entorno: un estudio oscuro, renderizado una vez a cubemap. Sin descarga. */
function Studio() {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={1}>
      <color attach="background" args={['#050607']} />
      <Lightformer form="rect" intensity={4.2} color="#f3ede0" position={[-3, 3.2, 2]} rotation={[0, 0.6, 0]} scale={[4.5, 3, 1]} />
      <Lightformer form="rect" intensity={1.6} color="#b8c4d6" position={[4.5, 1.2, -2]} rotation={[0, -1.4, 0]} scale={[1.2, 5, 1]} />
      <Lightformer form="circle" intensity={0.35} color="#6d7a88" position={[0, -4, 1]} rotation={[Math.PI / 2, 0, 0]} scale={[6, 6, 1]} />
      <Lightformer form="rect" intensity={0.5} color="#9ea8a0" position={[0, 4.5, -3]} rotation={[Math.PI / 2, 0, 0]} scale={[3, 3, 1]} />
    </Environment>
  )
}

function Post({ quality }: { quality: Quality }) {
  const high = quality === 'high'
  return (
    <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
      {/* Sin MSAA sobre el buffer HDR (caro): el antialias lo pone SMAA al final. */}
      {high ? <N8AO aoRadius={0.5} intensity={2.2} distanceFalloff={0.7} quality="low" halfRes /> : <></>}
      <Bloom luminanceThreshold={0.78} luminanceSmoothing={0.2} intensity={1.15} mipmapBlur radius={0.72} levels={7} />
      {high ? <ChromaticAberration blendFunction={BlendFunction.NORMAL} offset={new THREE.Vector2(0.0009, 0.0006)} radialModulation modulationOffset={0.4} /> : <></>}
      <Vignette eskil={false} offset={0.28} darkness={0.55} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  )
}

function Rig({ scrollRef, pointerRef, quality, control }: SceneProps) {
  const dollyRef = useRef(0)
  const mira = useMemo(() => new THREE.Vector3(), [])
  const rock = useRef<THREE.Group>(null)
  const field = useRef<THREE.Group>(null)
  const { camera, gl } = useThree()
  const timeRef = useRef(0)
  const cyc = useRef<CycleState>({ jump: 0, shake: 0 })

  useEffect(() => {
    camera.lookAt(0, 0, 0)
    // La transmisión de la veta renderiza la escena opaca a una textura por
    // fotograma. A media resolución cuesta un cuarto y, dentro del corte, no
    // se nota.
    gl.transmissionResolutionScale = quality === 'high' ? 0.35 : 0.25
  }, [camera, gl, quality])

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1)
    timeRef.current += d
    const t = timeRef.current
    const g = rock.current, f = field.current
    if (!g || !f) return
    const { x, y } = pointerRef.current
    const s = scrollRef.current ?? 0
    // En reposo la piedra oscila sola; el puntero la inclina; el scroll la retira.
    const idleY = Math.sin(t * 0.13) * 0.16
    const idleX = Math.sin(t * 0.09 + 1.3) * 0.05
    g.rotation.y = damp(g.rotation.y, idleY + x * 0.30 - s * 0.12, 2.4, d)
    g.rotation.x = damp(g.rotation.x, idleX - y * 0.10, 2.4, d)
    // Temblor: en cada salto de la grieta la piedra acusa el golpe y se calma.
    const sh = cyc.current.shake
    g.rotation.z = sh * 0.011 * Math.sin(t * 74)
    g.position.x = sh * 0.014 * Math.sin(t * 61 + 0.7)
    g.position.y = damp(g.position.y, s * 1.1, 3, d) + sh * 0.008 * Math.sin(t * 88)
    cyc.current.shake = sh * Math.exp(-6.5 * d)
    // Paralaje: el polvo se mueve menos que la piedra; el fondo (CSS) menos aún.
    f.rotation.y = damp(f.rotation.y, (idleY + x * 0.30) * 0.35, 2.4, d)
    f.rotation.x = damp(f.rotation.x, -y * 0.04, 2.4, d)
    f.position.y = damp(f.position.y, s * 0.5, 3, d)
    if (control?.current) {
      // Éxito: la cámara entra en el corte mientras la piedra se abre.
      const dolly = (dollyRef.current = damp(dollyRef.current, control.current.dolly, 1.3, d))
      camera.position.x = damp(camera.position.x, x * 0.22 + ROCK_POS.x * 0.62 * dolly, 2.2, d)
      camera.position.y = damp(camera.position.y, y * 0.14 - 0.05 * dolly, 2.2, d)
      camera.position.z = damp(camera.position.z, 6 - 2.7 * dolly, 1.6, d)
      mira.set(ROCK_POS.x * 0.78 * dolly, -0.02 * dolly, 0)
      camera.lookAt(mira)
      return
    }
    camera.position.x = damp(camera.position.x, x * 0.22, 2.2, d)
    camera.position.y = damp(camera.position.y, y * 0.14, 2.2, d)
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
      <Studio />
      <directionalLight position={[-3.5, 4.5, 6]} intensity={4.2} color="#f2ebdc" />
      <directionalLight position={[6, 2.5, -2]} intensity={1.6} color="#aebbcf" />
      <ambientLight intensity={0.12} />
      <group ref={field}>
        <Field quality={quality} timeRef={timeRef} />
      </group>
      <group ref={rock}>
        <Rock quality={quality} timeRef={timeRef} cyc={cyc} control={control} />
      </group>
      <Post quality={quality} />
    </>
  )
}

export default function HeroScene(props: SceneProps) {
  return <Rig {...props} />
}

/** La misma escena, obedeciendo a un Control en vez del ciclo (login). */
export function EscenaControlada({ pointerRef, quality, control }: { pointerRef: React.RefObject<{ x: number; y: number }>; quality: Quality; control: React.RefObject<Control> }) {
  const scrollRef = useRef(0)
  return <Rig scrollRef={scrollRef} pointerRef={pointerRef} quality={quality} control={control} />
}
