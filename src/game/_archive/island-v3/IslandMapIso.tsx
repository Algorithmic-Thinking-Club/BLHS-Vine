import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Culler, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js'
import {
  ABYSS, BLOBS, HH, HW, MAP, SPAWN, STACKS, W_BASE, W_RAMP,
  blobEdge, depAt, hash, landF, liftAt, smooth01, surfLine, tileOf, vnoise,
} from './sea'

// THE ISLAND MAP (2026-07-02 restart, build 3). The ocean is the BEACH'S OCEAN, verbatim:
// normalized variant tiles whose value the depth ramp owns, depth-keyed dither, coherent
// patch mirroring, the aerial-perspective veil, sparkles. The swell brightness rolls ALONG
// THE ISO DIAGONAL (Ash: waves flow isometrically — crests ride constant-tx lines and
// travel screen-SE, never straight down the screen). The island is the PANTHER PAW, and it
// is ISOMETRIC: coasts lift out of the sea as cliff walls with real side faces, the pad
// climbs toward its center. Detailed terrain/art lands in the next rounds on this massing.
// True 2:1 iso on the campus/beach engine. 100% PixelLab art animated in code. No shaders.

const isoX = (tx: number, ty: number) => (tx - ty) * HW
const isoY = (tx: number, ty: number) => (tx + ty) * HH
const SKEW = Math.atan(HH / HW) // the iso edge slope: cliff side faces shear to match

// variant pools over the normalized water tiles, sorted by measured busyness (the beach's)
const W_CALM = [0, 12, 15], W_SOFT = [3, 2, 8], W_TEX = [1, 10, 4, 6], W_SWELL = [13, 14, 11, 9, 7, 5]
const GRASS_BASE = [61, 105, 66] // normalized grass carries the land top this round
const ROCK_BASE = [110, 108, 90] // normalized rock carries the cliff side faces

// smoothstep inside each segment: a piecewise-LINEAR ramp leaves a slope break at every stop
// and the eye turns each break into a Mach band — on the beach the surf/texture buried it, on
// a naked open-sea gradient the bands read as giant terraces (measured via ?dbg=2)
function rampAt(stops: [number, number][], t: number) {
  if (t <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]
      const k = (t - t0) / (t1 - t0)
      return mix(c0, c1, k * k * (3 - 2 * k))
    }
  }
  return stops[stops.length - 1][1]
}
function tintFor(display: number, base: number[]) {
  const r = Math.min(255, Math.round(((display >> 16) & 255) * 255 / base[0]))
  const g = Math.min(255, Math.round(((display >> 8) & 255) * 255 / base[1]))
  const b = Math.min(255, Math.round((display & 255) * 255 / base[2]))
  return (r << 16) | (g << 8) | b
}
function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)
}
function shadeHex(hex: number, f: number) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f)), g = Math.min(255, Math.round(((hex >> 8) & 255) * f)), b = Math.min(255, Math.round((hex & 255) * f))
  return (r << 16) | (g << 8) | b
}

export default function IslandMapIso() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let app: Application | null = null, destroyed = false
    const keys: Record<string, boolean> = {}
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }
    let hud: HTMLDivElement | null = null
    let dragPt: { x: number; y: number } | null = null
    const camRef = { x: 0, y: 0, z: 1 }
    const mm = (e: MouseEvent) => {
      if (!dragPt) return
      camRef.x -= (e.clientX - dragPt.x) / camRef.z; camRef.y -= (e.clientY - dragPt.y) / camRef.z
      dragPt = { x: e.clientX, y: e.clientY }
    }
    const mu = () => { dragPt = null }

    const start = async () => {
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const instance = new Application()
      await instance.init({ background: ABYSS, antialias: false, resizeTo: ref.current ?? window })
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance; ref.current.appendChild(instance.canvas)
      const params = new URLSearchParams(location.search)
      let ZOOM = parseFloat(params.get('zoom') ?? '') || 1.7 // the beach's own zoom; ?zoom= for shots
      const DBG = params.get('dbg') // 1 = uniform texture, 2 = + pure ramp (banding isolation)

      const tex: Record<string, Texture> = {}
      const load = async (k: string, u: string) => { try { tex[k] = await Assets.load(u) } catch { /* */ } }
      const waterV: Texture[] = [], grassV: Texture[] = [], rockV: Texture[] = []
      await Promise.all([
        load('foamlace', '/art/intro/foam-lace.png'), load('foamlace2', '/art/intro/foam-lace2.png'),
        load('sparkle', '/art/intro/sparkle.png'), load('skirt', '/art/intro/shallow-skirt.png'),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/water-n/${i}.png`).then((t) => { waterV[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/grass-n/${i}.png`).then((t) => { grassV[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/rock-n/${i}.png`).then((t) => { rockV[i] = t }).catch(() => {})),
      ])
      if (destroyed) { instance.destroy(true); return }

      const world = new Container(); world.scale.set(ZOOM); world.sortableChildren = true
      instance.stage.addChild(world)
      // the beach's golden-hour grade, verbatim — one sun across the whole game's sea
      const grade = new ColorMatrixFilter()
      grade.brightness(1.0, false); grade.saturate(0.06, true); grade.contrast(0.02, true)
      const wm = grade.matrix; wm[0] *= 1.07; wm[6] *= 1.005; wm[12] *= 0.885; grade.matrix = wm
      world.filters = [grade]

      // ---- the tile field ----
      type WS = { sp: Sprite; base: number; ph: number; ph2: number; amp: number; x: number }
      const wBuckets = new Map<number, WS[]>()
      let spriteCount = 0
      const seaAt = (x: number, y: number) => landF(x, y) <= 0
      for (let ty = 0; ty < MAP; ty++) {
        for (let tx = 0; tx < MAP; tx++) {
          const f = landF(tx, ty)
          if (f > 0) {
            const lift = liftAt(tx, ty)
            // land top: single tiles along the rim band, 2x blocks inside (overlapping zones
            // so no parity tile goes bare); every top rides its elevation
            if (f <= 7) {
              // a QUIET dark mass this round (real terrain next): one calm variant, slow
              // value drift — per-tile variant chaos read as speckle noise at far zoom
              const sp = new Sprite(grassV[0] ?? Texture.WHITE)
              sp.anchor.set(0.5, 0.25); sp.cullable = true
              const fx = vnoise(tx / 9 + 4, ty / 9 + 11) > 0.5 ? -1 : 1
              sp.scale.set(fx * 1.08, 1.08)
              sp.position.set(isoX(tx, ty), isoY(tx, ty) - lift); sp.zIndex = (tx + ty) * 16 + 2
              const k = smooth01(f / 5)
              const patch = 0.96 + 0.08 * vnoise(tx / 14 + 2, ty / 14 + 6)
              sp.tint = shadeHex(tintFor(mix(0x18271c, 0x223626, k), GRASS_BASE), patch)
              world.addChild(sp); spriteCount++
              // CLIFF SIDE FACES: where this tile's SE/SW edge meets the sea, the land shows a
              // real iso wall dropping to the waterline — the island stands out of the water
              if (lift > 3) {
                const wallTex = rockV[Math.floor(hash(tx * 5.1, ty * 6.3) * 16)]
                const putWall = (se: boolean) => {
                  if (!wallTex) return
                  const sp2 = new Sprite(wallTex)
                  sp2.anchor.set(0, 0); sp2.cullable = true
                  sp2.width = 38; sp2.height = lift + 3
                  sp2.skew.y = se ? -SKEW : SKEW
                  if (se) sp2.position.set(isoX(tx, ty), isoY(tx, ty) + 26 - lift)
                  else sp2.position.set(isoX(tx, ty) - 34.5, isoY(tx, ty) + 8.6 - lift)
                  // the sun sits upper-left: SE faces catch light, SW faces fall to shadow
                  sp2.tint = tintFor(se ? 0x4a4438 : 0x2b2820, ROCK_BASE)
                  sp2.zIndex = (tx + ty + Math.ceil(lift / HH)) * 16 + 4
                  world.addChild(sp2); spriteCount++
                }
                if (!seaAt(tx + 1, ty)) { /* land continues */ } else putWall(true)
                if (!seaAt(tx, ty + 1)) { /* land continues */ } else putWall(false)
              }
            }
            if (f > 4 && tx % 2 === 0 && ty % 2 === 0) {
              const lc = liftAt(tx + 0.5, ty + 0.5)
              const sp = new Sprite(grassV[0] ?? Texture.WHITE)
              sp.anchor.set(0.5, 0.25); sp.cullable = true
              sp.scale.set(2.3, 2.3)
              sp.position.set(isoX(tx + 0.5, ty + 0.5), isoY(tx + 0.5, ty + 0.5) - lc); sp.zIndex = (tx + ty + 1) * 16
              const patch = 0.96 + 0.08 * vnoise(tx / 16 + 2, ty / 16 + 6)
              sp.tint = shadeHex(tintFor(0x223626, GRASS_BASE), patch)
              world.addChild(sp); spriteCount++
            }
            continue
          }
          const dep0 = depAt(tx, ty)
          if (dep0 < 0) continue
          // LOD, the one concession to a map 6x the beach's area: single tiles carry the whole
          // visible depth drama; where the veil has flattened the sea the texture merges into
          // 2x then 4x diamond blocks. Zones overlap; any hairline gap shows abyss-on-abyss.
          const seaTile = (x: number, y: number, sc: number) => {
            const dd = depAt(x, y)
            if (dd < 0) return
            const dAmp = dd < 0.14 ? 0.07 : dd < 0.55 ? 0.022 : 0.05
            const dep = Math.min(1, Math.max(0, dd + (hash(x * 7.7, y * 5.3) - 0.5) * dAmp))
            const h = hash(x * 1.3, y * 2.7)
            // merged blocks take the calm pools: their texture pixels render 2-4x bigger, so
            // the busy swell variants would read as rectangles of chunk
            const pool = sc > 1 ? (h < 0.6 ? W_CALM : W_SOFT)
              : dep < 0.1 ? W_CALM
                : dep < 0.3 ? (h < 0.6 ? W_CALM : W_SOFT)
                  : dep < 0.55 ? (h < 0.5 ? W_SOFT : W_TEX)
                    : (h < 0.55 ? W_TEX : W_SWELL)
            const base = DBG ? waterV[0] : waterV[pool[Math.floor(hash(x * 3.1, y * 1.9) * pool.length)]]
            if (!base) return
            const sp = new Sprite(base); sp.anchor.set(0.5, 0.25); sp.cullable = true
            const fx = vnoise(x / 7 + 4, y / 7 + 11) > 0.5 ? -1 : 1 // coherent patch mirroring
            sp.scale.set((DBG ? 1 : fx) * 1.12 * sc, 1.12 * sc)
            sp.position.set(isoX(x, y), isoY(x, y)); sp.zIndex = (x + y) * 16 + (sc > 1 ? -2 : 0)
            // value-cloud drift scales with depth: on pale shallows a 9% swing is blotch
            const pA = 0.03 + 0.06 * Math.min(1, dep * 2)
            const patch = 1 - pA / 2 + pA * vnoise(x / 22 + 7, y / 22 + 2)
            const grain = 0.997 + 0.006 * hash(x, y)
            const col = DBG === '2' ? tintFor(rampAt(W_RAMP, dd), W_BASE)
              : shadeHex(tintFor(rampAt(W_RAMP, dep), W_BASE), patch * grain)
            sp.tint = col
            world.addChild(sp); spriteCount++
            if (sc > 2) return // the far abyss doesn't pay for animation it can't show
            const s = Math.round(x + y)
            let b = wBuckets.get(s); if (!b) { b = []; wBuckets.set(s, b) }
            // THE ISO FLOW (Ash): crests ride constant-tx lines (screen diagonals) and travel
            // +tx = screen-SE; a slower crossing swell rides the other diagonal underneath
            b.push({
              sp, base: col,
              ph: x * 0.62 + 0.3 * Math.sin(y * 0.16),
              ph2: y * 0.3 - x * 0.05,
              amp: 0.022 + 0.055 * dep,
              x: isoX(x, y),
            })
          }
          if (dep0 < 0.98) seaTile(tx, ty, 1)
          if (tx % 2 === 0 && ty % 2 === 0 && f > -55) {
            const dc = depAt(tx + 0.5, ty + 0.5)
            if (dc > 0.86) seaTile(tx + 0.5, ty + 0.5, 2)
          }
          if (tx % 4 === 0 && ty % 4 === 0 && landF(tx + 1.5, ty + 1.5) < -50) seaTile(tx + 1.5, ty + 1.5, 4)
        }
      }

      // ---- AERIAL PERSPECTIVE WASH, the beach's: melts far texture into one abyss body ----
      {
        const RES = 8
        const x0 = -MAP * HW, y0 = 0
        const cw = Math.ceil((2 * MAP * HW) / RES), ch = Math.ceil((2 * MAP * HH) / RES)
        const GN = MAP * 2 + 2
        const grid = new Float32Array(GN * GN)
        for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) grid[j * GN + i] = depAt(i * 0.5, j * 0.5)
        const depG = (fx: number, fy: number) => {
          const gi = fx * 2, gj = fy * 2
          const i0 = Math.floor(gi), j0 = Math.floor(gj)
          if (i0 < 0 || j0 < 0 || i0 >= GN - 1 || j0 >= GN - 1) return 1
          const u = gi - i0, v = gj - j0
          const a = grid[j0 * GN + i0], b = grid[j0 * GN + i0 + 1], c = grid[(j0 + 1) * GN + i0], d = grid[(j0 + 1) * GN + i0 + 1]
          if (a < 0 || b < 0 || c < 0 || d < 0) return -1 // touching land: veil stays off
          return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
        }
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
        const g = cv.getContext('2d')!
        const img = g.createImageData(cw, ch); const px = img.data
        const rowMaxA: number[] = []
        for (let cy = 0; cy < ch; cy++) {
          const wy = y0 + (cy + 0.5) * RES
          let maxA = 0
          for (let cx = 0; cx < cw; cx++) {
            const wx = x0 + (cx + 0.5) * RES
            const fx = (wx / HW + wy / HH) / 2, fy = (wy / HH - wx / HW) / 2
            const dep = depG(fx, fy)
            if (dep < 0.09) continue
            const k = Math.min(1, (dep - 0.09) / 0.48)
            let a = 0.5 * k * k * (3 - 2 * k)
            if (dep > 0.78) { const kk = Math.min(1, (dep - 0.78) / 0.22); a += 0.24 * kk * kk }
            a *= 0.86 + 0.28 * vnoise(wx / 1250 + 3.2, wy / 720 + 8.1)
            if (a <= 0.004) continue
            const col = rampAt(W_RAMP, Math.min(1, dep + 0.1))
            const o = (cy * cw + cx) * 4
            px[o] = (col >> 16) & 255; px[o + 1] = (col >> 8) & 255; px[o + 2] = col & 255
            px[o + 3] = Math.round(a * 255)
            if (a > maxA) maxA = a
          }
          rowMaxA[cy] = maxA
        }
        g.putImageData(img, 0, 0)
        const washT = Texture.from(cv)
        washT.source.scaleMode = 'linear'
        const rowsPerS = HH / RES
        for (let s = 0; s < MAP * 2; s++) {
          const cy0 = Math.round((s * HH - y0) / RES)
          let live = false
          for (let r = 0; r < rowsPerS; r++) if ((rowMaxA[cy0 + r] ?? 0) > 0) { live = true; break }
          if (!live) continue
          const strip = new Sprite(new Texture({ source: washT.source, frame: new Rectangle(0, cy0, cw, rowsPerS) }))
          strip.position.set(x0, s * HH); strip.scale.set(RES, RES); strip.cullable = true
          strip.zIndex = s * 16 + 18
          world.addChild(strip)
        }
      }

      // ---- shore dressing ----
      const laceT = tex['foamlace'], laceT2 = tex['foamlace2']
      const slice = (t: Texture, w: number, seed: number) => {
        const ox = Math.floor(hash(seed, seed * 2.7) * Math.max(1, t.width - w))
        return new Texture({ source: t.source, frame: new Rectangle(ox, 0, Math.min(w, t.width), t.height) })
      }
      // WATERLINE SKIRT around every coast, the beach's shore law: a glassy sub-tile band
      // hugging the smooth contour buries the diamond staircase; a crisp dark seam AT the
      // waterline is the value break the shore stands against. One ring per paw blob.
      if (tex['skirt']) {
        const skT = tex['skirt']
        for (const b of BLOBS) {
          const rmin = Math.max(6, Math.min(b.rx, b.ry))
          const da = 1.7 / rmin
          let i = 0
          for (let a = 0; a < Math.PI * 2; a += da) {
            const e = blobEdge(b, a)
            const put = (out: number, sy: number, tint: number, alpha: number, zo: number) => {
              const q = tileOf(e.u + Math.cos(a) * out, e.v + Math.sin(a) * out)
              const sp = new Sprite(slice(skT, 64, b.seed + i * 3.1 + out * 7))
              sp.anchor.set(0.5, 0.62); sp.cullable = true
              sp.scale.set(1, sy)
              sp.position.set(isoX(q.x, q.y), isoY(q.x, q.y))
              sp.tint = tint; sp.alpha = alpha; sp.zIndex = (q.x + q.y) * 16 + zo
              world.addChild(sp)
            }
            // subtle by law: at far zoom a bright ring fuses into a glow halo (banned) —
            // the skirt is a glassy hint at the waterline, never an outline
            put(0.2, 0.35, 0x113238, 0.38, 3) // the dark waterline seam
            put(1.0, 1.25, 0xcdeee2, 0.5, 4)  // the glassy skirt straddling the tile steps
            put(2.6, 1.8, 0xcdeee2, 0.16, 4)  // the feather row seaward
            i++
          }
        }
      }
      // surf breaking where the lagoon meets the deep — the two mouths beside the outer toes
      type Surf = { sp: Sprite; ph: number; along: number }
      const surfs: Surf[] = []
      if (laceT) {
        surfLine().forEach((p, i) => {
          for (const row of [0, 1]) {
            const sp = new Sprite(slice(row ? laceT2 ?? laceT : laceT, 44, i * 13.7 + row * 5))
            sp.anchor.set(0.5, 0.5); sp.cullable = true
            sp.position.set(isoX(p.x, p.y), isoY(p.x, p.y) + row * 5)
            sp.scale.set(1.15 - row * 0.2, 0.62)
            sp.zIndex = (p.x + p.y) * 16 + 6
            sp.alpha = 0
            world.addChild(sp)
            surfs.push({ sp, ph: row * 1.6, along: i * 0.42 })
          }
        })
      }
      // foam collars breathing at the sea stacks
      type Collar = { sp: Sprite; ph: number }
      const collars: Collar[] = []
      if (tex['skirt']) {
        for (const b of STACKS) {
          const n = Math.max(8, Math.round(Math.min(b.rx, b.ry) * 2.2))
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2
            const e = blobEdge(b, a)
            const q = tileOf(e.u + Math.cos(a) * 0.6, e.v + Math.sin(a) * 0.6)
            const sp = new Sprite(slice(tex['skirt'], 30, b.seed + i * 3.3))
            sp.anchor.set(0.5, 0.55); sp.cullable = true
            sp.position.set(isoX(q.x, q.y), isoY(q.x, q.y))
            sp.scale.set(0.9, 0.6)
            sp.zIndex = (q.x + q.y) * 16 + 5
            sp.alpha = 0.4
            world.addChild(sp)
            collars.push({ sp, ph: hash(b.seed, i) * 6.3 })
          }
        }
      }

      // ---- sparkles: mid-depth water, slow individual clocks (the beach's) ----
      type Spark = { sp: Sprite; ph: number; sc: number }
      const sparks: Spark[] = []
      if (tex['sparkle']) {
        let placed = 0, tries = 0
        while (placed < 130 && tries < 4000) {
          tries++
          const tx = hash(tries, 211) * MAP, ty = hash(tries, 223) * MAP
          const dep = depAt(tx, ty)
          if (dep < 0.12 || dep > 0.85) continue
          const sp = new Sprite(tex['sparkle']); sp.anchor.set(0.5); sp.cullable = true
          const sc = 0.5 + 0.5 * hash(tries, 227)
          sp.position.set(isoX(tx, ty), isoY(tx, ty))
          sp.zIndex = (tx + ty) * 16 + 21
          sp.alpha = 0
          world.addChild(sp)
          sparks.push({ sp, ph: hash(tries, 229) * 20, sc })
          placed++
        }
      }

      // ---- camera: a free sea camera for this round (the ship will own it later).
      // WASD/arrows pan, wheel zooms, drag pans. ?spawn=tx,ty + ?zoom= for validation shots. ----
      const spawnP = (params.get('spawn') ?? '').split(',').map(Number)
      camRef.x = isoX(SPAWN.x, SPAWN.y); camRef.y = isoY(SPAWN.x, SPAWN.y); camRef.z = ZOOM
      if (spawnP.length === 2 && !spawnP.some(isNaN)) { camRef.x = isoX(spawnP[0], spawnP[1]); camRef.y = isoY(spawnP[0], spawnP[1]) }
      const vw = () => instance.renderer.width / instance.renderer.resolution
      const vh = () => instance.renderer.height / instance.renderer.resolution
      const wheel = (e: WheelEvent) => {
        e.preventDefault()
        ZOOM = Math.min(2.6, Math.max(0.3, ZOOM * (e.deltaY > 0 ? 1 / 1.12 : 1.12)))
        camRef.z = ZOOM
      }
      const md = (e: MouseEvent) => { dragPt = { x: e.clientX, y: e.clientY } }
      instance.canvas.addEventListener('wheel', wheel, { passive: false })
      instance.canvas.addEventListener('mousedown', md)
      window.addEventListener('mousemove', mm)
      window.addEventListener('mouseup', mu)
      window.addEventListener('keydown', kd)
      window.addEventListener('keyup', ku)

      // dev HUD (?fps=1): honest numbers or nothing
      if (params.get('fps')) {
        hud = document.createElement('div')
        hud.style.cssText = 'position:fixed;top:8px;left:8px;color:#9fe8d8;background:rgba(4,24,30,.7);font:12px monospace;padding:4px 8px;z-index:99;pointer-events:none'
        document.body.appendChild(hud)
      }
      let emaMs = 16.7, hudAt = 0

      const tick = () => {
        const wt = performance.now() / 1000
        const dtMs = instance.ticker.deltaMS
        emaMs += (dtMs - emaMs) * 0.05
        // camera
        const pan = 620 * (dtMs / 1000) / ZOOM * (keys['shift'] ? 2.4 : 1)
        if (keys['a'] || keys['arrowleft']) camRef.x -= pan
        if (keys['d'] || keys['arrowright']) camRef.x += pan
        if (keys['w'] || keys['arrowup']) camRef.y -= pan
        if (keys['s'] || keys['arrowdown']) camRef.y += pan
        camRef.x = Math.max(-170 * HW, Math.min(170 * HW, camRef.x))
        camRef.y = Math.max(70 * HH, Math.min(440 * HH, camRef.y))
        const camX = camRef.x, camY = camRef.y
        world.scale.set(ZOOM)
        world.x = vw() / 2 - camX * ZOOM
        world.y = vh() / 2 - camY * ZOOM

        // FLOWING WATER, iso-flowing: brightness swells travel along the +tx diagonal with a
        // slower crossing wave underneath; only the rows on screen pay for animation
        const sMin = Math.floor((camY - vh() / (2 * ZOOM)) / HH) - 3
        const sMax = Math.ceil((camY + vh() / (2 * ZOOM)) / HH) + 3
        const xMin = camX - vw() / (2 * ZOOM) - HW * 2, xMax = camX + vw() / (2 * ZOOM) + HW * 2
        for (let s = sMin; s <= sMax; s++) {
          const b = wBuckets.get(s)
          if (!b) continue
          for (const w of b) {
            if (w.x < xMin || w.x > xMax) continue
            const fct = 1 + w.amp * (Math.sin(w.ph - wt * 1.05) + 0.55 * Math.sin(w.ph2 - wt * 0.42 + 1.7))
            w.sp.tint = shadeHex(w.base, fct)
          }
        }
        // surf rolls along the lagoon mouths, the brightest thing on the water
        for (const sf of surfs) {
          const k = ((wt * 0.21 - sf.along * 0.11 + sf.ph) % 1 + 1) % 1
          const a = k < 0.22 ? smooth01(k / 0.22) : 1 - smooth01((k - 0.22) / 0.78)
          sf.sp.alpha = 0.14 + a * 0.72
        }
        // collars breathe against the rocks
        for (const cl of collars) cl.sp.alpha = 0.3 + 0.18 * Math.sin(wt * 0.8 + cl.ph)
        // sparkles twinkle on slow individual clocks
        for (const s of sparks) {
          const k = Math.max(0, Math.sin(wt * 0.9 + s.ph) - 0.55) / 0.45
          s.sp.alpha = k * 0.8
          s.sp.scale.set(s.sc * (0.7 + 0.3 * k))
        }
        Culler.shared.cull(world, new Rectangle(0, 0, vw(), vh()))
        if (hud && wt - hudAt > 0.5) {
          hudAt = wt
          hud.textContent = `${(1000 / emaMs).toFixed(0)}fps  ${spriteCount} tiles  zoom ${ZOOM.toFixed(2)}`
        }
      }
      instance.ticker.add(tick)
    }
    start().catch((err) => { console.error('[IslandMapIso] failed', err) })

    return () => {
      destroyed = true
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('mousemove', mm)
      window.removeEventListener('mouseup', mu)
      hud?.remove()
      app?.destroy(true)
      app = null
    }
  }, [])
  return <div ref={ref} style={{ position: 'fixed', inset: 0, background: '#073442' }} />
}
