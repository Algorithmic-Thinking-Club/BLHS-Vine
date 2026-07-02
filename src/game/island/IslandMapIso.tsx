import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Culler, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js'
import { ISLANDS } from './registry'
import {
  ISLE_CX, ISLE_CY, LAGOONS, LANDS, MAP_COLS, MAP_ROWS, POOL, PORT_THETA, VC,
  beachKAt, beachKTheta, channelDistUW, coastDist, coastDistUW, coastPoint, freshDist,
  isleCell, isleLift, isleLiftUW, isleSlope, lagoonK, levelAtUW, txOf, tyOf, uOf, vnoise2, wOf,
} from './shape'
import { PROP_SRC, PROP_TINT, composeIsland, composePortDressing } from './compose'

// THE ISLAND MAP — fresh build (2026-07-02 restart; docs/place-specs/island-map.md).
// The canvas pass renders what the references actually show: a DARK sea that plunges within a
// few units of every cliff coast, designed turquoise lagoons with reef blotches and a boat
// channel (never a glow halo — that system is deleted), surf breaking offshore at the reef
// edge, foam collars at the rock bases, and an island built from stacked terrace levels whose
// rims are real cliff walls with hard AO. Beach systems that survive: normalized variant tiles
// with tint-owned hue, the parametric surf-dab tide at true beaches, the surface/collision
// engine, Culler. True 2:1 iso, 100% PixelLab tiles/props, no shaders.

const HW = 32, HH = 16
const isoX = (tx: number, ty: number) => (tx - ty) * HW
const isoY = (tx: number, ty: number) => (tx + ty) * HH
const dirs8 = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']
const cardinals = ['south', 'north', 'east', 'west']
const cardinalOf = (d: string) => cardinals.includes(d) ? d : d.includes('south') ? 'south' : d.includes('north') ? 'north' : d.includes('east') ? 'east' : 'west'
function dirFromAngle(dx: number, dy: number) {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI
  if (a >= -22.5 && a < 22.5) return 'east'; if (a >= 22.5 && a < 67.5) return 'south-east'
  if (a >= 67.5 && a < 112.5) return 'south'; if (a >= 112.5 && a < 157.5) return 'south-west'
  if (a >= 157.5 || a < -157.5) return 'west'; if (a >= -157.5 && a < -112.5) return 'north-west'
  if (a >= -112.5 && a < -67.5) return 'north'; return 'north-east'
}
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return s - Math.floor(s) }
const smooth01 = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k) }

// variant pools over the shared normalized tile families (same as the beach)
const SAND_COMMON = [0, 1, 2, 3, 7, 9]
const W_CALM = [0, 12, 15], W_SOFT = [3, 2, 8], W_TEX = [1, 10, 4, 6], W_SWELL = [13, 14, 11, 9, 7, 5]
const W_BASE = [205, 235, 229]
const SAND_BASE = [246, 229, 180]
const JUNGLE_BASE = [82, 124, 72]
const ROCK_BASE = [110, 108, 90]
// ONE depth ramp, lagoon-bright to abyss-dark: the DEPTH FIELD (not the ramp) now carries the
// design — lagoons hold the top stops, open water falls through the bottom ones fast
const W_RAMP: [number, number][] = [
  [0.0, 0x9fe0cf], [0.10, 0x63cbbd], [0.18, 0x3db3ab], [0.30, 0x27999b],
  [0.45, 0x1a7f8b], [0.62, 0x115d70], [0.80, 0x0b4757], [1.0, 0x073442],
]
const ABYSS = 0x073442
// fresh water is DARK in every reference (SoS river gorge): deep teal, never lagoon-cyan
const FRESH_RAMP: [number, number][] = [[0, 0x2e6b63], [0.5, 0x1d4a4a], [1, 0x123338]]

function rampAt(stops: [number, number][], t: number) {
  if (t <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]
      return mix(c0, c1, (t - t0) / (t1 - t0))
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

// the tide cycle (the beach's), driving the wash at true beaches only
const TIDE_T = 9, TIDE_AMP = 1.4
function tidePhase(u: number): [number, number] {
  u = ((u % TIDE_T) + TIDE_T) % TIDE_T
  if (u < 2.2) { const k = u / 2.2, e = 1 - Math.pow(1 - k, 3); return [e, 0.45 + 0.55 * k] }
  if (u < 2.9) return [1, 1]
  if (u < 6.6) { const k = (u - 2.9) / 3.7, e = 0.5 - 0.5 * Math.cos(Math.PI * k); return [1 - e, 1 - 0.8 * k] }
  const k = (u - 6.6) / (TIDE_T - 6.6)
  return [0, 0.2 * (1 - k)]
}

export default function IslandMapIso() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let app: Application | null = null, destroyed = false
    const keys: Record<string, boolean> = {}
    let jumpQueued = false
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') { jumpQueued = true; e.preventDefault() } }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    const start = async () => {
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const instance = new Application()
      await instance.init({ background: ABYSS, antialias: false, resizeTo: ref.current ?? window })
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance; ref.current.appendChild(instance.canvas)
      const ZOOM = parseFloat(new URLSearchParams(location.search).get('zoom') ?? '') || 1.4

      const tex: Record<string, Texture> = {}
      const load = async (k: string, u: string) => { try { tex[k] = await Assets.load(u) } catch { /* */ } }
      await Promise.all([
        load('foamlace', '/art/intro/foam-lace.png'), load('foamlace2', '/art/intro/foam-lace2.png'),
        load('sparkle', '/art/intro/sparkle.png'), load('skirt', '/art/intro/shallow-skirt.png'),
        load('pierIso', '/art/intro/port/pier-iso2.png'), load('dockPlat', '/art/intro/port/dock-platform2.png'),
        load('lanternPost', '/art/intro/port/lantern-post.png'),
        ...Object.entries(PROP_SRC).map(([k, u]) => load(k, u)),
      ])
      const sandV: Texture[] = [], waterV: Texture[] = [], jungleV: Texture[] = [], rockV: Texture[] = []
      await Promise.all([
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-n/${i}.png`).then((t) => { sandV[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/water-n/${i}.png`).then((t) => { waterV[i] = t }).catch(() => {})),
        ...Array.from({ length: 12 }, (_, i) => Assets.load(`/art/intro/jungle-n/${i}.png`).then((t) => { jungleV[i] = t }).catch(() => {})),
        ...Array.from({ length: 4 }, (_, i) => Assets.load(`/art/intro/rock-n/${i}.png`).then((t) => { rockV[i] = t }).catch(() => {})),
      ])
      // Thor
      const idle: Record<string, Texture> = {}
      await Promise.all(dirs8.map((d) => load('idle_' + d, `/art/characters/thor/walk/${d}/0.png`).then(() => { idle[d] = tex['idle_' + d] })))
      const walk: Record<string, Texture[]> = {}
      await Promise.all(dirs8.map(async (d) => {
        try { walk[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`))) } catch { /* */ }
      }))
      if (destroyed) { instance.destroy(true); return }

      // ---- drawn-geometry measurement (place/collide by pixels, never canvas boxes) ----
      type BaseInfo = { feet: number; pts: { x: number; y: number; hw: number }[] }
      const baseCache = new Map<Texture, Map<number, BaseInfo | null>>()
      const measureBase = (t: Texture, frac = 0.12): BaseInfo | null => {
        let byFrac = baseCache.get(t)
        if (!byFrac) { byFrac = new Map(); baseCache.set(t, byFrac) }
        const hit = byFrac.get(frac)
        if (hit !== undefined) return hit
        let out: BaseInfo | null = null
        try {
          const w = t.source.pixelWidth, h = t.source.pixelHeight
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h
          const g = cv.getContext('2d', { willReadFrequently: true })!
          g.drawImage(t.source.resource as CanvasImageSource, 0, 0)
          const d = g.getImageData(0, 0, w, h).data
          const a = (x: number, y: number) => d[(y * w + x) * 4 + 3]
          let feet = -1, top = h
          for (let y = h - 1; y >= 0 && feet < 0; y--) for (let x = 0; x < w; x++) if (a(x, y) > 40) { feet = y; break }
          for (let y = 0; y < h && top === h; y++) for (let x = 0; x < w; x++) if (a(x, y) > 40) { top = y; break }
          if (feet >= 0) {
            const band = Math.max(5, Math.round((feet - top) * frac))
            let mnx = w, mxx = -1
            for (let y = feet - band; y <= feet; y++) for (let x = 0; x < w; x++) if (a(x, y) > 40) { if (x < mnx) mnx = x; if (x > mxx) mxx = x }
            const span = mxx - mnx + 1, n = span > 46 ? 3 : 1, pts: BaseInfo['pts'] = []
            for (let i = 0; i < n; i++) {
              const x0 = mnx + (span * i) / n, x1 = mnx + (span * (i + 1)) / n
              let sx = 0, sy = 0, c = 0, bmn = w, bmx = -1
              for (let y = feet - band; y <= feet; y++) for (let x = Math.floor(x0); x < x1; x++) if (a(x, y) > 40) { sx += x; sy += y; c++; if (x < bmn) bmn = x; if (x > bmx) bmx = x }
              if (c) pts.push({ x: sx / c, y: sy / c, hw: (bmx - bmn + 1) / 2 })
            }
            out = { feet, pts }
          }
        } catch { /* canvas unavailable */ }
        byFrac.set(frac, out)
        return out
      }
      const trimmed = (t: Texture): Texture => {
        const m = measureBase(t)
        if (!m || m.feet >= t.source.pixelHeight - 1) return t
        return new Texture({ source: t.source, frame: new Rectangle(0, 0, t.source.pixelWidth, m.feet + 1) })
      }
      for (const d of dirs8) {
        if (idle[d]) idle[d] = trimmed(idle[d])
        if (walk[d]) walk[d] = walk[d].map(trimmed)
      }

      const world = new Container(); world.scale.set(ZOOM); world.sortableChildren = true
      instance.stage.addChild(world)
      // MAP-LOCAL grade: moody-lush — crushed floor, warm key, never high-key flat
      const grade = new ColorMatrixFilter()
      grade.saturate(0.12, true); grade.contrast(0.12, true); grade.brightness(0.945, true)
      const wm = grade.matrix; wm[0] *= 1.05; wm[12] *= 0.90; grade.matrix = wm
      world.filters = [grade]

      // ---- THE ABYSS PLANE: one sprite is the entire open ocean ----
      {
        const plane = new Sprite(Texture.WHITE)
        plane.tint = ABYSS
        plane.position.set(-MAP_COLS * HW, 0)
        plane.width = 2 * MAP_COLS * HW; plane.height = (MAP_COLS + MAP_ROWS) * HH
        plane.zIndex = -100000
        world.addChild(plane)
      }

      // ---- ISLAND TILES ----
      const waterSprites: { sp: Sprite; ph: number; ph2: number; base: number; amp: number }[] = []
      const walkable = new Map<string, boolean>()
      const wk = (x: number, y: number) => x + ',' + y
      const POOL_LIFT = Math.max(0, isleLift(txOf(POOL.u, POOL.w + POOL.r + 1.2), tyOf(POOL.u, POOL.w + POOL.r + 1.2)) - 4)
      // lazy lift memo — walls/AO/lips sample neighbors constantly
      const liftMemo = new Map<string, number>()
      const liftAt = (tx: number, ty: number) => {
        const k = tx + ',' + ty
        let v = liftMemo.get(k)
        if (v === undefined) { v = isleLift(tx, ty); liftMemo.set(k, v) }
        return v
      }
      for (const isle of ISLANDS) {
        const RR = isle.radius + 18
        const s0 = isle.cx + isle.cy
        for (let s = s0 - 2 * RR; s <= s0 + 2 * RR; s++) {
          for (let d = -RR; d <= RR; d++) {
            const tx = (s + d) / 2, ty = (s - d) / 2
            if (tx !== Math.round(tx)) continue
            if (tx < 2 || ty < 2 || tx > MAP_COLS - 2 || ty > MAP_ROWS - 2) continue
            const u = uOf(tx, ty), w = wOf(tx, ty)
            const cd = coastDistUW(u, w)
            const cell = isleCell(tx, ty)
            const isSea = cell === 'sea'
            let dep = 0
            if (isSea) {
              // THE DEPTH FIELD IS THE DESIGN: open water plunges dark within ~6 units of a
              // coast; lagoon blobs hold a bright structured shelf (reef heads, sand bars,
              // the boat channel); everything converges to the abyss plane.
              const lag = smooth01(lagoonK(u, w) * 1.35)
              // the bright shelf's width follows the COAST TYPE: a real shallow apron off
              // beaches, a fast plunge to dark at every cliff (the uniform halo is the
              // amateur read — this line is what killed it)
              const bK = beachKAt(u, w)
              let depOpen = Math.min(1, 0.55 * Math.min(1, -cd / (0.5 + 3.5 * bK)) + 0.45 * Math.min(1, -cd / 8))
              // cliff coasts hold DEEP water to the rock: the ramp's bright stops are
              // reserved for beach shallows (SoS: dark teal + a foam collar, nothing else)
              depOpen = Math.max(depOpen, 0.62 * (1 - bK * 1.05) * Math.min(1, -cd / 0.5))
              let depLag = 0.07 + 0.26 * Math.min(1, -cd / 15)
              const bn = vnoise2(u / 3.4 + 9, w / 3.4 + 5)
              if (lag > 0.1 && bn > 0.60) depLag += (bn - 0.60) * 1.7 // submerged reef heads
              const bn2 = vnoise2(u / 5 + 40, w / 5 + 21)
              if (lag > 0.3 && bn2 > 0.74) depLag -= 0.05 // sand-bar glints
              dep = depOpen * (1 - lag) + depLag * lag
              const chD = channelDistUW(u, w)
              if (chD < 1.8) dep = Math.max(dep, mix01(0.52, dep, smooth01((chD - 0.9) / 0.9)))
              // dither fades with depth: the deep ring must melt into the abyss smoothly,
              // not as patchwork strips
              dep += (hash(tx * 7.7, ty * 5.3) - 0.5) * (dep < 0.2 ? 0.05 : dep > 0.7 ? 0.01 : 0.03)
              dep = Math.min(1, Math.max(0, dep))
              if (dep > 0.985) continue // the abyss plane owns it from here
            }
            const slope = isleSlope(tx, ty)
            const { lvl } = isSea ? { lvl: 0 } : levelAtUW(u, w)
            const lift = isSea ? 0 : cell === 'fresh' ? 0 : liftAt(tx, ty)
            walkable.set(wk(tx, ty), (cell === 'wet' || cell === 'sand' || cell === 'grass' || cell === 'jungle' || cell === 'bank')
              && slope <= 5.5 && lvl <= 1)
            let landBase = SAND_BASE
            let base: Texture | undefined
            if (isSea) {
              const h = hash(tx * 1.3, ty * 2.7)
              const pool = dep < 0.1 ? W_CALM
                : dep < 0.3 ? (h < 0.6 ? W_CALM : W_SOFT)
                  : dep < 0.55 ? (h < 0.5 ? W_SOFT : W_TEX)
                    : (h < 0.55 ? W_TEX : W_SWELL)
              base = waterV[pool[Math.floor(hash(tx * 3.1, ty * 1.9) * pool.length)]]
            } else if (cell === 'fresh') {
              base = waterV[W_CALM[Math.floor(hash(tx * 3.1, ty * 1.9) * W_CALM.length)]]
            } else if (cell === 'cliff' || cell === 'rock' || (lvl >= 4 && cell !== 'sand' && cell !== 'wet')) {
              base = rockV.length ? rockV[Math.floor(hash(tx * 2.9, ty * 3.7) * rockV.length)] : sandV[0]
              landBase = ROCK_BASE
            } else if (cell === 'jungle' || cell === 'bank') {
              base = jungleV.length ? jungleV[Math.floor(hash(tx * 3.3, ty * 4.1) * jungleV.length)] : sandV[0]
              landBase = JUNGLE_BASE
            } else {
              base = sandV[SAND_COMMON[Math.floor(hash(tx * 3.3, ty * 4.1) * SAND_COMMON.length)]]
            }
            if (!base) continue
            const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
            const fx = vnoise2(tx / 7 + 4, ty / 7 + 11) > 0.5 ? -1 : 1
            const os = isSea || cell === 'fresh' ? 1.12 : 1.09
            sp.scale.set(fx * os, os)
            const inPool = cell === 'fresh' && Math.hypot(u - POOL.u, w - POOL.w) < POOL.r + 2
            let dLift = lift
            if (cell === 'fresh') dLift = inPool ? POOL_LIFT : Math.max(0, liftAt(tx, ty) - 5)
            else if (!isSea) {
              const dPool = Math.hypot(u - POOL.u, w - POOL.w) - (POOL.r + 0.5)
              if (dPool < 3.5) {
                const k = Math.min(1, Math.max(0, (dPool - 0.2) / 3.3))
                dLift = (POOL_LIFT + 4) * (1 - k) + dLift * k
              }
            }
            sp.position.set(isoX(tx, ty), isoY(tx, ty) - dLift); sp.zIndex = (tx + ty) * 16
            if (isSea) {
              // patch texture eases with depth (big bright streaks over dark water read as
              // banding artifacts from the air, not swell)
              const patchAmp = 0.09 * (1 - 0.55 * Math.min(1, dep / 0.5))
              const patch = 1 - patchAmp / 2 + patchAmp * vnoise2(tx / 22 + 7, ty / 22 + 2)
              const grain = 0.997 + 0.006 * hash(tx, ty)
              let col = shadeHex(tintFor(rampAt(W_RAMP, dep), W_BASE), patch * grain)
              // melt into the abyss plane (no seam where the tile ring ends)
              if (dep > 0.88) col = mix(col, ABYSS, smooth01((dep - 0.88) / 0.10))
              sp.tint = col
              const lag = smooth01(lagoonK(u, w) * 1.35)
              waterSprites.push({
                sp, base: col,
                ph: (tx + ty) * 0.5 + 0.35 * Math.sin((tx - ty) * 0.18),
                ph2: (tx + ty) * 0.21 - (tx - ty) * 0.07,
                amp: 0.016 + 0.05 * dep * (1 - lag * 0.7),
              })
            } else if (cell === 'fresh') {
              const f = -freshDist(tx, ty) + (hash(tx * 6.1, ty * 4.3) - 0.5) * 0.9
              sp.tint = tintFor(shadeHex(rampAt(FRESH_RAMP, Math.min(1, Math.max(0, f / 4.5))), 0.98 + 0.04 * hash(tx, ty)), W_BASE)
            } else {
              // ---- LAND COLOR: keyed by coast type + terrace level + moisture, moody ----
              const grain = 0.994 + 0.012 * hash(tx * 1.3, ty * 2.1)
              const drift = 0.958 + 0.07 * vnoise2(tx / 16 + 3, ty / 16 + 5)
              const j = (hash(tx * 5.7, ty * 3.9) - 0.5) * 1.1
              const B = beachKAt(u, w)
              const moist = vnoise2(u / 9 + 3, w / 9 + 8) + (freshDist(tx, ty) < 4 ? 0.25 : 0)
              let col: number
              if (cell === 'wet') col = mix(0x8f7a52, 0xbfa06b, Math.min(1, Math.max(0, (cd + j * 0.3) / 1.2)))
              else if (cell === 'sand') col = rampAt([[0, 0xbfa06b], [0.5, 0xd8bd86], [1, 0xe8d4a2]], Math.min(1, (cd - 1.2 + j * 0.4) / (1 + 5.2 * B)))
              else if (cell === 'grass') col = mix(0xcdb27e, 0x3f6234, Math.min(1, Math.max(0, (cd - (1 + 5.2 * B) + j * 0.8) / 1.6)))
              else if (cell === 'cliff') {
                // waterline basalt: dark, wet sheen at the base
                col = shadeHex(0x3a3b33, 0.82 + 0.3 * vnoise2(tx / 2.9 + 17, ty / 2.9 + 4))
                if (cd < 0.7) col = mix(0x22282a, col, cd / 0.7)
              } else if (cell === 'rock') {
                const { frac } = levelAtUW(u, w)
                const dc = Math.hypot(u - VC.u, w - VC.w)
                // cool gray basalt (the warm ramp read as mud from the air); light enough
                // that the sun shading can model it
                col = rampAt([[0, 0x6d7060], [0.5, 0x54584a], [1, 0x3a3e34]], Math.min(1, (lvl - 2.5) / 2 + frac * 0.4 + j * 0.1))
                const shelf = 0.84 + 0.28 * vnoise2(tx / 3.1 + 17, ty / 3.1 + 4)
                col = shadeHex(col, shelf)
                // the crater bowl: char + the ember heart (tight — the bowl must read as a
                // feature IN the summit, never swallow it)
                if (dc < 3.4) {
                  const k = 1 - dc / 3.4
                  col = mix(col, 0x2b2724, Math.min(1, k * 1.8))
                  if (dc < 1.4) col = mix(col, 0x8a4a22, Math.pow(1 - dc / 1.4, 1.8) * 0.85)
                } else if (dc < 5 && lvl >= 4) {
                  // the rim: sun catches the far lip, the near inner wall shadows
                  col = shadeHex(col, (u - VC.u) + (w - VC.w) < 0 ? 0.78 : 1.12)
                }
              } else if (cell === 'bank') col = shadeHex(0x36452e, 0.9 + 0.16 * hash(tx * 3.7, ty * 1.9))
              else {
                // jungle floor: moisture-keyed value ramp of the litter base, darker + more
                // clumped than attempt 1 (the flat lime field is the amateur read)
                const clump = vnoise2(u / 14 + 21, w / 14 + 6) // macro light/dark patches
                const t = Math.min(1, Math.max(0, 0.78 - 0.30 * moist - 0.26 * clump + j * 0.08))
                col = rampAt([[0, 0x3d5c36], [0.35, 0x324c2c], [0.7, 0x273c24], [1, 0x1f301d]], t)
                if (lvl >= 3) col = mix(col, 0x647c44, Math.min(0.45, (lvl - 2) * 0.22 + (moist < 0.4 ? 0.1 : 0)))
              }
              // TERRACE LIPS + HARD AO (the refs' law: sun catches the top edge of every
              // band; the ground under a wall sits in its shadow)
              const gapSE = dLift - liftAt(tx + 1, ty + 1)
              const gapUp = liftAt(tx - 1, ty - 1) - dLift
              const gapL = liftAt(tx - 1, ty) - dLift, gapR = liftAt(tx, ty - 1) - dLift
              let shade = 1
              if (gapSE > 15) shade *= 1.12
              if (gapUp > 15) shade *= 0.66
              else if (gapL > 15 || gapR > 15) shade *= 0.84
              // smooth directional sun (upper-left key): slopes facing the sun lighten,
              // slopes falling away sink — this is what keeps the massif from reading flat
              const gDn = (liftAt(tx + 1, ty + 1) - liftAt(tx - 1, ty - 1)) / 2
              const gAc = (liftAt(tx + 1, ty - 1) - liftAt(tx - 1, ty + 1)) / 2
              shade *= Math.min(1.15, Math.max(0.78, 1 - gDn * 0.009 + gAc * 0.007))
              sp.tint = shadeHex(tintFor(col, landBase), grain * drift * shade)
              // ---- THE TERRACE WALLS: stacked basalt courses fill the drop under every rim
              // (the structural cliff read; the PixelLab cliff faces dress these in piece 2) ----
              if (gapSE > 15 && rockV.length) {
                const nW = Math.min(7, Math.ceil((gapSE - 2) / 14))
                for (let i = 1; i <= nW; i++) {
                  const wsp = new Sprite(rockV[Math.floor(hash(tx * 9.1 + i, ty * 5.3) * rockV.length)])
                  wsp.anchor.set(0.5, 0.25)
                  wsp.scale.set((hash(tx + i, ty) > 0.5 ? -1 : 1) * 1.12, 1.12)
                  wsp.position.set(isoX(tx, ty), isoY(tx, ty) - dLift + 14 * i)
                  wsp.zIndex = (tx + ty + 2) * 16 + 1
                  // cooler + darker than every plateau top: the wall must read as a
                  // SHADOWED FACE, not more ground
                  let wc = shadeHex(0x343830, 0.94 - i * 0.09)
                  if (i === 1 && lvl <= 3) wc = mix(wc, 0x3d4c34, 0.35) // mossy top course
                  wsp.tint = tintFor(wc, ROCK_BASE)
                  world.addChild(wsp)
                }
              }
            }
            world.addChild(sp)
          }
        }
      }

      // ---- THE BREAKERS: surf breaking OFFSHORE along each lagoon's reef edge (the aerial
      // signature: a white ring away from the sand, not foam glued to the coast) ----
      const breakers: { sp: Sprite; arc: number; ph: number }[] = []
      if (tex['foamlace']) {
        for (let li = 0; li < LAGOONS.length; li++) {
          const L = LAGOONS[li]
          const per = (L.ru + L.rw) * 1.6
          for (let t = 0; t < Math.PI * 2; t += 0.09) {
            const bu = L.cu + L.ax * L.ru * Math.cos(t) - L.ay * L.rw * Math.sin(t)
            const bw = L.cw + L.ay * L.ru * Math.cos(t) + L.ax * L.rw * Math.sin(t)
            if (coastDistUW(bu, bw) > -1.8) continue // only the seaward arc breaks
            const laceT = hash(t * 31, li) > 0.5 && tex['foamlace2'] ? tex['foamlace2'] : tex['foamlace']
            const fr = new Rectangle(Math.floor(t * 160) % Math.max(32, laceT.width - 32), 0, 32, laceT.height)
            const x = isoX(ISLE_CX, ISLE_CY) + bu * HW
            const y = isoY(ISLE_CX, ISLE_CY) + bw * 2 * HH
            for (let row = 0; row < 2; row++) {
              const sp2 = new Sprite(new Texture({ source: laceT.source, frame: fr }))
              sp2.anchor.set(0.5, 0.6)
              sp2.scale.set(row ? 1.0 : 1.35, row ? 0.8 : 1)
              sp2.position.set(x - row * 6, y + row * 7)
              sp2.alpha = 0
              sp2.zIndex = (y / HH) * 16 + 5 - row
              world.addChild(sp2)
              breakers.push({ sp: sp2, arc: t * per, ph: li * 3 + row * 0.9 })
            }
          }
        }
      }

      // ---- THE SURF DABS: coast-type aware. True beaches get the living tide wash; cliff
      // coasts get a pinned foam collar swelling against the rock ----
      type Dab = {
        x: number; y: number; nx: number; ny: number; s: number; arc: number
        skirt?: Sprite; seam?: Sprite; foam: Sprite[]; flankK: number; beach: number
      }
      const dabs: Dab[] = []
      if (tex['skirt'] && tex['foamlace']) {
        const skT = tex['skirt']
        for (let li = 0; li < LANDS.length; li++) {
          const cx = isoX(ISLE_CX, ISLE_CY), cyw = isoY(ISLE_CX, ISLE_CY)
          const roughR = li === 0 ? 42 : 7
          let arc = li * 173
          let prev: { x: number; y: number } | null = null
          for (let th = 0; th < Math.PI * 2; th += 1.0 / roughR) {
            const cp = coastPoint(th, li)
            const B = beachKTheta(li, th)
            const x = cx + cp.u * HW, y = cyw + cp.w * 2 * HH
            if (prev) arc += Math.hypot(x - prev.x, y - prev.y)
            prev = { x, y }
            const s = y / HH
            const flankK = Math.min(1, Math.abs(cp.nx) / 0.85)
            const fr = new Rectangle((Math.floor(arc) % Math.max(32, skT.width - 32)), 0, 32, skT.height)
            const mkSk = (ay: number, sy: number, tint: number | null, alpha: number, dz: number) => {
              const sp2 = new Sprite(new Texture({ source: skT.source, frame: fr }))
              sp2.anchor.set(0.5, ay); sp2.scale.set(1, sy)
              if (tint !== null) sp2.tint = tint
              sp2.alpha = alpha; sp2.position.set(x, y); sp2.zIndex = s * 16 + dz
              world.addChild(sp2)
              return sp2
            }
            const d: Dab = { x, y, nx: cp.nx, ny: cp.ny, s, arc, foam: [], flankK, beach: B }
            // the seam: dark waterline everywhere (deeper-toned against cliff bases)
            d.seam = mkSk(0.3, 0.55, B > 0.35 ? 0x113238 : 0x0c2126, B > 0.35 ? 0.45 : 0.6, 1)
            // the skirt at HALF strength: it buries the tile sawtooth, it must never read as
            // a white outline drawn around the island
            if (B > 0.3) d.skirt = mkSk(0.62, 1.4, null, 0.55, 2)
            const nFoam = B > 0.45 ? 2 : 1
            for (let f = 0; f < nFoam; f++) {
              const laceT = (f === 1 && tex['foamlace2']) ? tex['foamlace2'] : tex['foamlace']
              const period = Math.max(32, laceT.width - 32)
              const off = Math.floor(arc + f * 160) % period
              const fsp = new Sprite(new Texture({ source: laceT.source, frame: new Rectangle(off, 0, 32, laceT.height) }))
              fsp.anchor.set(0.5, 0.84)
              if (cp.ny < 0) fsp.scale.y = -1
              fsp.position.set(x, y); fsp.alpha = 0
              world.addChild(fsp); d.foam.push(fsp)
            }
            dabs.push(d)
          }
        }
      }

      // ---- THE FALLS BASIN dressing (the head's pool site — full set-piece in piece 5) ----
      const shadowTex = makeShadow()
      const poolFx: { sp: Sprite; ph: number; kind: 'churn' | 'glint' }[] = []
      if (tex['skirt']) {
        const skT = tex['skirt']
        const pcx = POOL.u * HW
        const pcy = (ISLE_CX + ISLE_CY + 2 * POOL.w) * HH - POOL_LIFT
        for (let th = 0; th < Math.PI * 2; th += 0.21) {
          const rx = Math.cos(th) * POOL.r * HW * 0.99
          const ry = -Math.sin(th) * POOL.r * HH * 2 * 0.99
          const fr = new Rectangle(Math.floor(th * 90) % Math.max(32, skT.width - 32), 0, 32, skT.height)
          const groundS = (pcy + ry + POOL_LIFT) / HH
          const seam = new Sprite(new Texture({ source: skT.source, frame: fr }))
          seam.anchor.set(0.5, 0.5); seam.scale.set(1, 0.7); seam.tint = 0x0f2a28; seam.alpha = 0.5
          seam.position.set(pcx + rx, pcy + ry); seam.zIndex = groundS * 16 + 4
          world.addChild(seam)
        }
        for (let i = 0; i < 3; i++) {
          const c = new Sprite(shadowTex); c.anchor.set(0.5)
          c.tint = 0xf2fff8; c.blendMode = 'add'
          c.width = 46 - i * 9; c.height = 17 - i * 3
          c.position.set(pcx + (i - 1) * 20, pcy - POOL.r * HH * 2 * 0.62 + i * 5)
          c.zIndex = ((pcy + POOL_LIFT) / HH) * 16 + 6
          world.addChild(c); poolFx.push({ sp: c, ph: i * 2.1, kind: 'churn' })
        }
        for (let i = 0; i < 6; i++) {
          const g = new Sprite(tex['sparkle'] ?? Texture.WHITE); g.anchor.set(0.5); g.blendMode = 'add'
          const a = hash(i, 7) * Math.PI * 2, rr = Math.sqrt(hash(i, 3)) * 0.75
          g.position.set(pcx + Math.cos(a) * rr * POOL.r * HW, pcy - Math.sin(a) * rr * POOL.r * HH * 2)
          g.scale.set(0.5); g.alpha = 0
          g.zIndex = ((pcy + POOL_LIFT) / HH) * 16 + 6
          world.addChild(g); poolFx.push({ sp: g, ph: hash(i, 11) * 9, kind: 'glint' })
        }
      }

      // ---- THE VOLCANO BREATHES: steam off the crater blowhole ----
      const steamTex = radial(96, [[0, 'rgba(226,224,218,0.5)'], [0.5, 'rgba(210,208,204,0.22)'], [1, 'rgba(210,208,204,0)']])
      const ventX = VC.u * HW
      const ventY = (ISLE_CX + ISLE_CY + 2 * VC.w) * HH - isleLiftUW(VC.u, VC.w) - 10
      const steam: { sp: Sprite; age: number; life: number; drift: number }[] = []
      let lastSteam = 0

      // ---- open-sea life: lagoon sun glints, sparse drifting flecks, sea-mist streaks,
      // cloud shadows (aerial depth without a single glow halo) ----
      const sparkles: { sp: Sprite; ph: number; sc: number; roam: boolean }[] = []
      if (tex['sparkle']) {
        for (let i = 0; i < 110; i++) {
          const roam = i >= 70
          const sp2 = new Sprite(tex['sparkle']); sp2.anchor.set(0.5)
          const sc = roam ? 0.3 + hash(i * 7, i * 2) * 0.3 : 0.4 + hash(i * 7, i * 2) * 0.45
          sp2.scale.set(sc); sp2.alpha = 0; sp2.blendMode = 'add'
          if (!roam) {
            // glints live in the lagoons (the sun plays on the shallow shelf)
            const L = LAGOONS[i % LAGOONS.length]
            const a = hash(i * 3.7, i) * Math.PI * 2, q = Math.sqrt(hash(i, i * 1.9)) * 0.92
            const bu = L.cu + L.ax * L.ru * q * Math.cos(a) - L.ay * L.rw * q * Math.sin(a)
            const bw = L.cw + L.ay * L.ru * q * Math.cos(a) + L.ax * L.rw * q * Math.sin(a)
            if (coastDistUW(bu, bw) > -0.5) { sp2.destroy(); continue }
            const x = isoX(ISLE_CX, ISLE_CY) + bu * HW
            const y = isoY(ISLE_CX, ISLE_CY) + bw * 2 * HH
            sp2.position.set(x, y); sp2.zIndex = (y / HH) * 16 + 19
          } else sp2.zIndex = 200000
          world.addChild(sp2); sparkles.push({ sp: sp2, ph: hash(i, i * 5) * 20, sc, roam })
        }
      }
      const mists: { sp: Sprite; ph: number; v: number }[] = []
      {
        const mistTex = radial(256, [[0, 'rgba(224,240,236,0.17)'], [0.5, 'rgba(224,240,236,0.08)'], [1, 'rgba(224,240,236,0)']])
        for (const [mu, mw, scw] of [[-38, 30, 1.3], [50, -6, 1.0], [-52, -24, 1.15], [18, 46, 0.9]] as const) {
          const m = new Sprite(mistTex); m.anchor.set(0.5); m.blendMode = 'screen'
          m.width = 2600 * scw; m.height = 250 * scw
          m.position.set(isoX(ISLE_CX, ISLE_CY) + mu * HW, isoY(ISLE_CX, ISLE_CY) + mw * 2 * HH)
          m.zIndex = 200000
          world.addChild(m); mists.push({ sp: m, ph: hash(mu, mw) * 8, v: 5 + hash(mw, mu) * 4 })
        }
      }
      const clouds: { sp: Sprite; vx: number; vy: number }[] = []
      for (let i = 0; i < 5; i++) {
        const c = new Sprite(radial(256, [[0, 'rgba(10,28,34,0.14)'], [0.55, 'rgba(10,28,34,0.08)'], [1, 'rgba(10,28,34,0)']]))
        c.anchor.set(0.5); c.blendMode = 'multiply'
        c.width = 2200 + hash(i, 3) * 1600; c.height = c.width * 0.38
        c.position.set(isoX(ISLE_CX, ISLE_CY) + (hash(i, 7) - 0.5) * 7000, isoY(ISLE_CX, ISLE_CY) + (hash(i, 9) - 0.5) * 4200)
        c.zIndex = 400000
        world.addChild(c)
        clouds.push({ sp: c, vx: 6 + hash(i, 11) * 5, vy: 2.4 + hash(i, 13) * 2 })
      }

      // ---- surfaces + colliders (the beach's engine, verbatim patterns) ----
      type Surf = { walk: boolean; layer: number; lift: number; z: number; trans?: boolean }
      const surf = new Map<string, Surf>()
      const setSurf = (x: number, y: number, s: Surf) => surf.set(x + ',' + y, s)
      type Collider = { cx: number; cy: number; r: number }
      const colliders: Collider[] = []
      const colMap = new Map<string, number[]>()
      const addCollider = (cx: number, cy: number, r: number) => {
        const i = colliders.push({ cx, cy, r }) - 1
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
          const k = (Math.round(cx) + dx) + ',' + (Math.round(cy) + dy)
          const arr = colMap.get(k) ?? []
          arr.push(i); colMap.set(k, arr)
        }
      }
      const THOR_R = 0.17
      const COLLIDE = new Set(['palmA', 'palmB', 'palmC', 'palmD', 'bushA', 'bushB', 'bushC',
        'rockA', 'rockB', 'logdrift', 'crates', 'rowboat', 'tidepool',
        'treeA', 'treeB', 'treeC', 'palmE', 'treefern', 'banana', 'boulder', 'fernA', 'ruinGate'])
      const HULL = new Set(['rowboat', 'logdrift', 'crates', 'tidepool', 'boulder'])

      // ---- props (empty on the canvas; pieces 3-5 compose them by hand) ----
      const swaying: { sp: Sprite; ph: number; amp: number }[] = []
      const props = [...composeIsland(), ...composePortDressing()]
      for (const p of props) {
        const t0 = tex[p.img]; if (!t0) continue
        const lift = p.sea ? 0 : isleLift(p.tx, p.ty)
        const x = isoX(p.tx, p.ty), y = isoY(p.tx, p.ty) - lift, z = (p.tx + p.ty) * 16
        if (p.ground) {
          const sc0 = p.h / t0.height
          const sp2 = new Sprite(t0); sp2.anchor.set(0.5, 0.6); sp2.scale.set(p.flip ? -sc0 : sc0, sc0)
          sp2.position.set(x, y); sp2.zIndex = z + 3
          const gt = p.tint ?? PROP_TINT[p.img]; if (gt) sp2.tint = gt
          world.addChild(sp2)
          continue
        }
        const t = trimmed(t0)
        const sc = p.h / t.height
        const tall = p.h > 140
        const sh = new Sprite(shadowTex); sh.anchor.set(0.28, 0.5)
        sh.width = Math.max(26, t.width * sc * (p.sea ? 0.8 : tall ? 1.7 : 1.4))
        sh.height = Math.max(11, t.width * sc * (tall ? 0.22 : 0.32))
        sh.rotation = 0.2
        sh.alpha = p.sea ? 0.3 : tall ? 0.62 : 0.66; sh.position.set(x + 5, y + 2)
        sh.zIndex = z + 17
        world.addChild(sh)
        const sp2 = new Sprite(t); sp2.anchor.set(0.5, 1.0); sp2.scale.set(p.flip ? -sc : sc, sc)
        sp2.position.set(x, y + (p.sea ? 5 : 0))
        sp2.zIndex = z + 8
        const pt = p.tint ?? PROP_TINT[p.img]; if (pt) sp2.tint = pt
        world.addChild(sp2)
        if (p.img.startsWith('palm')) swaying.push({ sp: sp2, ph: hash(p.tx * 3.1, p.ty * 1.7) * 6.28, amp: 0.014 + 0.008 * hash(p.tx, p.ty * 9) })
        else if (p.img.startsWith('tree')) swaying.push({ sp: sp2, ph: hash(p.tx * 1.9, p.ty * 2.9) * 6.28, amp: 0.005 })
        else if (p.img.startsWith('bush') || p.img.startsWith('fern') || p.img === 'dunegrass' || p.img === 'heliconia' || p.img === 'banana' || p.img === 'monstera') swaying.push({ sp: sp2, ph: hash(p.tx * 2.3, p.ty * 4.1) * 6.28, amp: 0.006 })
        if (!p.noBlock && COLLIDE.has(p.img)) {
          const m = measureBase(t, HULL.has(p.img) ? 0.45 : 0.12)
          if (m) for (const b of m.pts) {
            const sdx = (b.x - t.width * 0.5) * sc * (p.flip ? -1 : 1)
            const sdy = (b.y - m.feet) * sc + (p.sea ? 5 : 0)
            const uu = sdx / (2 * HW), vv = sdy / (2 * HH)
            addCollider(p.tx + uu + vv, p.ty + vv - uu, Math.max(0.09, (b.hw * sc * 0.9) / (HW * Math.SQRT2)))
          }
        }
      }

      // ---- warm lantern glows ----
      const glows: { sp: Sprite; ph: number }[] = []
      const glowTex = radial(96, [[0, 'rgba(255,196,110,0.5)'], [0.4, 'rgba(255,176,90,0.18)'], [1, 'rgba(255,176,90,0)']])
      const addGlow = (gx: number, gy: number, size: number, z: number) => {
        const g = new Sprite(glowTex); g.anchor.set(0.5); g.blendMode = 'add'
        g.width = g.height = size; g.position.set(gx, gy); g.zIndex = z
        world.addChild(g); glows.push({ sp: g, ph: hash(gx, gy) * 6.28 })
      }

      // ---- THE EAST PORT (the intro arrival; other ports come with their own pieces) ----
      const DECK_LIFT = 30
      const placePort = (thetaDeg: number) => {
        if (!tex['pierIso'] || !tex['dockPlat']) return
        const th = (thetaDeg * Math.PI) / 180
        const cp = coastPoint(th)
        const neAxis = (cp.nx > 0) === (cp.ny < 0)
        const seaUp = cp.ny < 0
        const rtx = Math.round(txOf(cp.u - cp.nx * 2.2, cp.w - cp.ny * 2.2))
        const rty = Math.round(tyOf(cp.u - cp.nx * 2.2, cp.w - cp.ny * 2.2))
        const A = { x: isoX(rtx, rty), y: isoY(rtx, rty) - DECK_LIFT }
        const mirror = !neAxis
        const place = (t: Texture, lx: number, ly: number, wx: number, wy: number, z: number, scl = 1) => {
          const sp2 = new Sprite(t)
          sp2.anchor.set(0, 0)
          sp2.scale.set(mirror ? -scl : scl, scl)
          sp2.position.set(mirror ? wx + lx * scl : wx - lx * scl, wy - ly * scl)
          sp2.zIndex = z
          world.addChild(sp2)
          return (px2: number, py2: number) => ({
            x: mirror ? sp2.position.x - px2 * scl : sp2.position.x + px2 * scl,
            y: sp2.position.y + py2 * scl,
          })
        }
        const stepTx = neAxis ? 0 : (seaUp ? -1 : 1)
        const stepTy = neAxis ? (seaUp ? -1 : 1) : 0
        const sdx = isoX(stepTx, stepTy), sdy = isoY(stepTx, stepTy)
        const WALK_N = 9
        const rootS = rtx + rty, stepS = stepTx + stepTy
        const jettyZ = rootS * 16 + 9
        const pierZ = seaUp ? jettyZ - 4 : (rootS + stepS * WALK_N) * 16 + 7
        const platZ = seaUp ? pierZ - 5 : (rootS + stepS * (WALK_N + 3)) * 16 + 9
        const capL: [number, number] = seaUp ? [20, 120] : [187.5, 36]
        for (let i = 0; i < 2; i++) {
          place(tex['pierIso'], capL[0], capL[1], A.x + sdx * (i * 5), A.y + sdy * (i * 5), pierZ - i)
          const shp = new Sprite(shadowTex); shp.anchor.set(0.5)
          shp.rotation = mirror ? 0.4636 : -0.4636
          shp.width = 300; shp.height = 46; shp.alpha = 0.2
          const mx2 = A.x + sdx * (i * 5 + 2.5), my2 = A.y + sdy * (i * 5 + 2.5)
          shp.position.set(mx2 + 26, my2 + DECK_LIFT + 34)
          shp.zIndex = ((my2 + DECK_LIFT + 34) / HH) * 16 + 3
          world.addChild(shp)
        }
        for (let i = 2; i <= WALK_N + 2; i += 2) {
          const ptx = rtx + stepTx * i, pty = rty + stepTy * i
          if (coastDist(ptx, pty) > 0) continue
          const ring = new Sprite(shadowTex); ring.anchor.set(0.5)
          ring.tint = 0xeafff6; ring.blendMode = 'add'; ring.width = 30; ring.height = 10; ring.alpha = 0.24
          ring.position.set(isoX(ptx, pty), isoY(ptx, pty) + 10)
          ring.zIndex = (ptx + pty) * 16 + 8
          world.addChild(ring)
        }
        const E = { x: A.x + sdx * (WALK_N - 0.19), y: A.y + sdy * (WALK_N - 0.19) }
        const platL: [number, number] = seaUp ? [77, 102] : [171, 70]
        place(tex['dockPlat'], platL[0], platL[1], E.x, E.y, platZ)
        if (tex['lanternPost']) {
          const JSC = 0.63
          const loc = place(tex['lanternPost'], 90, 84, A.x + 2, A.y - 1, jettyZ, JSC)
          const lamp = loc(26, 65)
          addGlow(lamp.x, lamp.y, 54, jettyZ + 3)
        }
        for (let i = 0; i <= WALK_N; i++)
          setSurf(rtx + stepTx * i, rty + stepTy * i, { walk: true, layer: 1, lift: DECK_LIFT, z: (i === 0 ? jettyZ : pierZ) + 2 })
        for (let a = -1; a <= 1; a++) for (let b = 0; b <= 2; b++) {
          const px2 = rtx + stepTx * (WALK_N + b) + (neAxis ? a : 0)
          const py2 = rty + stepTy * (WALK_N + b) + (neAxis ? 0 : a)
          if (a === 0 && b === 1) continue
          setSurf(px2, py2, { walk: true, layer: 1, lift: DECK_LIFT, z: (seaUp ? pierZ : platZ) + 2 })
        }
        setSurf(rtx - stepTx, rty - stepTy, { walk: true, layer: 1, lift: 14, z: jettyZ + 2, trans: true })
        setSurf(rtx - 2 * stepTx, rty - 2 * stepTy, { walk: true, layer: 1, lift: 4, z: jettyZ + 2, trans: true })
        addCollider(rtx - 0.6 * stepTx, rty - 0.6 * stepTy, 0.55)
      }
      placePort(PORT_THETA.east)

      // ---- Thor ----
      const thorShadow = new Sprite(shadowTex); thorShadow.anchor.set(0.5, 0.5)
      thorShadow.width = 32; thorShadow.height = 16; thorShadow.alpha = 0.62
      world.addChild(thorShadow)
      const THOR_SC = 0.58
      const thor = new Sprite(idle['south'] ?? Texture.WHITE); thor.anchor.set(0.5, 1.0); thor.scale.set(THOR_SC)
      thor.zIndex = 0; world.addChild(thor)
      const jump = { active: false, t: 0 }
      const spawnP = (new URLSearchParams(location.search).get('spawn') ?? '').split(',').map(Number)
      const ecp = coastPoint((PORT_THETA.east * Math.PI) / 180)
      const pos = {
        tx: spawnP.length === 2 && !isNaN(spawnP[0]) ? spawnP[0] : Math.round(txOf(ecp.u - ecp.nx * 4, ecp.w - ecp.ny * 4)),
        ty: spawnP.length === 2 && !isNaN(spawnP[1]) ? spawnP[1] : Math.round(tyOf(ecp.u - ecp.nx * 4, ecp.w - ecp.ny * 4)),
      }
      let facing = 'south', at = 0, renderLift = 0

      const surfAt = (x: number, y: number): Surf => {
        const o = surf.get(x + ',' + y)
        if (o) return o
        return { walk: !!walkable.get(x + ',' + y), layer: 0, lift: 0, z: 0 }
      }
      const canGo = (fx: number, fy: number, tx2: number, ty2: number) => {
        const t = surfAt(Math.round(tx2), Math.round(ty2))
        if (!t.walk) return false
        const f = surfAt(Math.round(fx), Math.round(fy))
        return t.layer === f.layer || !!t.trans || !!f.trans
      }
      const collideMove = (x0: number, y0: number, x1: number, y1: number) => {
        if (surfAt(Math.round(x1), Math.round(y1)).layer !== 0) return false
        const arr = colMap.get(Math.round(x1) + ',' + Math.round(y1))
        if (!arr) return false
        const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy
        for (const i of arr) {
          const c = colliders[i], R = c.r + THOR_R
          const d0 = Math.hypot(c.cx - x0, c.cy - y0)
          if (d0 < R) {
            if (Math.hypot(c.cx - x1, c.cy - y1) <= d0 + 1e-4) return true
            continue
          }
          let t = l2 ? ((c.cx - x0) * dx + (c.cy - y0) * dy) / l2 : 0
          t = t < 0 ? 0 : t > 1 ? 1 : t
          if (Math.hypot(x0 + t * dx - c.cx, y0 + t * dy - c.cy) < R) return true
        }
        return false
      }
      const CR = 0.22, LANE = 0.27
      const probeX = (nx: number, aty: number) => {
        const sgn = Math.sign(nx - pos.tx)
        return canGo(pos.tx, aty, nx + sgn * CR, aty - CR) && canGo(pos.tx, aty, nx + sgn * CR, aty + CR) && !collideMove(pos.tx, pos.ty, nx, aty)
      }
      const probeY = (ny: number, atx: number) => {
        const sgn = Math.sign(ny - pos.ty)
        return canGo(atx, pos.ty, atx - CR, ny + sgn * CR) && canGo(atx, pos.ty, atx + CR, ny + sgn * CR) && !collideMove(pos.tx, pos.ty, atx, ny)
      }

      for (const c of world.children) c.cullable = true
      instance.ticker.add((tk) => {
        Culler.shared.cull(world, { x: 0, y: 0, width: instance.renderer.width, height: instance.renderer.height })
        const dt = tk.deltaTime
        let dx = 0, dy = 0
        if (keys['w'] || keys['arrowup']) dy -= 1
        if (keys['s'] || keys['arrowdown']) dy += 1
        if (keys['a'] || keys['arrowleft']) dx -= 1
        if (keys['d'] || keys['arrowright']) dx += 1
        const moving = dx || dy
        const sprinting = !!keys['shift'] && moving
        if (moving) {
          const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, sp = (sprinting ? 0.128 : 0.075) * Math.min(dt, 2)
          const ntx = pos.tx + ux * sp, nty = pos.ty + uy * sp
          const onDeck = surfAt(Math.round(pos.tx), Math.round(pos.ty)).layer > 0
          if (ux !== 0) {
            if (probeX(ntx, pos.ty)) pos.tx = ntx
            else {
              const cy = Math.round(pos.ty)
              for (const cand of onDeck ? [cy, cy - 1, cy + 1] : [cy]) {
                const tyC = Math.max(cand - LANE, Math.min(cand + LANE, pos.ty))
                if (tyC === pos.ty || !probeX(ntx, tyC)) continue
                const gy = pos.ty + Math.sign(tyC - pos.ty) * Math.min(Math.abs(tyC - pos.ty), sp)
                if (probeY(gy, pos.tx)) { pos.ty = gy; break }
              }
            }
          }
          if (uy !== 0) {
            if (probeY(nty, pos.tx)) pos.ty = nty
            else {
              const cx = Math.round(pos.tx)
              for (const cand of onDeck ? [cx, cx - 1, cx + 1] : [cx]) {
                const txC = Math.max(cand - LANE, Math.min(cand + LANE, pos.tx))
                if (txC === pos.tx || !probeY(nty, txC)) continue
                const gx = pos.tx + Math.sign(txC - pos.tx) * Math.min(Math.abs(txC - pos.tx), sp)
                if (probeX(gx, pos.ty)) { pos.tx = gx; break }
              }
            }
          }
          facing = dirFromAngle(isoX(dx, dy), (dx + dy) * HH)
        }
        let pen = 0
        if (surfAt(Math.round(pos.tx), Math.round(pos.ty)).layer === 0) {
          const parr = colMap.get(Math.round(pos.tx) + ',' + Math.round(pos.ty))
          if (parr) for (const i of parr) {
            const c = colliders[i], R = c.r + THOR_R, d = Math.hypot(c.cx - pos.tx, c.cy - pos.ty)
            if (d < R) {
              pen = Math.max(pen, R - d)
              const k = Math.min(R - d, 0.03 * dt) / (d || 1)
              const nx2 = pos.tx + (pos.tx - c.cx) * k, ny2 = pos.ty + (pos.ty - c.cy) * k
              if (d > 0 && canGo(pos.tx, pos.ty, nx2, ny2)) { pos.tx = nx2; pos.ty = ny2 }
            }
          }
        }
        const here = surfAt(Math.round(pos.tx), Math.round(pos.ty))
        const targetLift = here.layer > 0 || here.trans ? here.lift : isleLift(pos.tx, pos.ty)
        renderLift += (targetLift - renderLift) * Math.min(1, dt * 0.28)
        const x = isoX(pos.tx, pos.ty), y = isoY(pos.tx, pos.ty) - renderLift
        if (jumpQueued && !jump.active) { jump.active = true; jump.t = 0 }
        jumpQueued = false
        let jy = 0, stretch = 1
        if (jump.active) {
          jump.t += tk.deltaMS
          const k = jump.t / 520
          if (k >= 1) jump.active = false
          else { jy = -44 * Math.sin(Math.PI * k); stretch = 1 + 0.14 * Math.sin(Math.PI * k) }
        }
        const breath = (!moving && !jump.active) ? 1 + 0.03 * Math.sin(at / 430) : 1
        thor.scale.set(THOR_SC, THOR_SC * breath * stretch)
        thor.position.set(x, y + jy)
        thor.zIndex = here.layer > 0 ? here.z + 2 : Math.floor(pos.tx + pos.ty) * 16 + 18
        ;(window as unknown as { __thor: object }).__thor = { tx: pos.tx, ty: pos.ty, layer: here.layer, lift: renderLift, pen }
        const shf = Math.max(0.55, 1 - (-jy) / 110)
        thorShadow.width = 32 * shf; thorShadow.height = 16 * shf
        thorShadow.alpha = 0.62 * Math.max(0.32, 1 - (-jy) / 90)
        thorShadow.position.set(x, y + 3); thorShadow.zIndex = thor.zIndex - 1
        at += tk.deltaMS
        const wf = walk[facing] ?? walk[cardinalOf(facing)]
        thor.texture = (moving && wf) ? wf[Math.floor(at / (sprinting ? 68 : 110)) % wf.length] : (idle[facing] ?? idle['south'] ?? thor.texture)
        const vw = instance.renderer.width, vh = instance.renderer.height
        if (world.scale.x !== ZOOM) world.scale.set(ZOOM)
        world.x = vw / 2 - x * ZOOM; world.y = vh * 0.58 - y * ZOOM
        const wt = performance.now() / 1000
        for (const w2 of waterSprites) {
          const fct = 1 + w2.amp * (Math.sin(w2.ph - wt * 1.05) + 0.55 * Math.sin(w2.ph2 - wt * 0.42 + 1.7))
          w2.sp.tint = shadeHex(w2.base, fct)
        }
        // breakers roll along the reef edge in slow traveling sets
        for (const b of breakers) {
          const k = Math.max(0, Math.sin(wt * 0.8 - b.arc * 0.010 + b.ph))
          b.sp.alpha = 0.10 + 0.55 * Math.pow(k, 1.6)
        }
        for (let i = 0; i < dabs.length; i++) {
          const d = dabs[i]
          const washAmp = TIDE_AMP * (1 - 0.85 * d.flankK) * Math.min(1, Math.max(0.12, (d.beach - 0.2) * 1.6))
          for (let f = 0; f < d.foam.length; f++) {
            const [reach, foamA] = tidePhase(wt - f * TIDE_T / 2 - d.arc * 0.011)
            const fsp = d.foam[f]
            if (d.beach > 0.45) {
              const ox = -d.nx * reach * washAmp * HW * 0.9, oy = -d.ny * reach * washAmp * 2 * HH * 0.9
              fsp.position.set(d.x + ox, d.y + oy)
              fsp.zIndex = (d.y + oy) / HH * 16 + 6
              fsp.alpha = foamA * 0.72 * (1 - 0.55 * d.flankK)
            } else {
              // the collar: pinned lace swelling against the rock base
              fsp.position.set(d.x, d.y + 1.5 * Math.sin(wt * 1.1 + d.arc * 0.03))
              fsp.zIndex = d.y / HH * 16 + 6
              fsp.alpha = 0.12 + 0.24 * Math.max(0, Math.sin(wt * 0.9 + d.arc * 0.04))
            }
          }
          if (d.skirt) d.skirt.position.y = d.y + 1.2 * Math.sin(wt * 0.9 + d.arc * 0.02)
        }
        for (const s of sparkles) {
          const k = Math.max(0, Math.sin(wt * 0.9 + s.ph) - 0.55) / 0.45
          s.sp.alpha = k * (s.roam ? 0.4 : 0.75)
          s.sp.scale.set(s.sc * (0.7 + 0.3 * k))
          if (s.roam && k < 0.02) {
            const wx = (vw * (hash(s.ph, wt | 0) - 0.5)) / ZOOM + (x)
            const wy2 = (vh * (hash(s.ph * 3, wt | 0) - 0.5)) / ZOOM + (y)
            s.sp.position.set(wx, wy2)
          }
        }
        for (const p of poolFx) {
          if (p.kind === 'churn') {
            p.sp.alpha = 0.3 + 0.14 * Math.sin(wt * 2.4 + p.ph)
            p.sp.scale.set(1 + 0.1 * Math.sin(wt * 3.1 + p.ph * 1.7), 1)
          } else {
            const k = Math.max(0, Math.sin(wt * 0.8 + p.ph) - 0.6) / 0.4
            p.sp.alpha = k * 0.8
          }
        }
        for (const m of mists) {
          m.sp.x += m.v * tk.deltaMS / 1000
          m.sp.alpha = 0.55 + 0.45 * Math.sin(wt * 0.13 + m.ph)
          if (m.sp.x > isoX(ISLE_CX, ISLE_CY) + 4200) m.sp.x -= 8400
        }
        if (wt - lastSteam > 0.55) {
          lastSteam = wt
          const sp2 = new Sprite(steamTex); sp2.anchor.set(0.5); sp2.blendMode = 'screen'
          sp2.position.set(ventX + (hash(wt, 1) - 0.5) * 24, ventY + (hash(wt, 3) - 0.5) * 8)
          sp2.alpha = 0; sp2.width = sp2.height = 44 + hash(wt, 5) * 28
          sp2.zIndex = 300000
          world.addChild(sp2)
          steam.push({ sp: sp2, age: 0, life: 4600 + hash(wt, 7) * 1800, drift: 5 + hash(wt, 9) * 5 })
        }
        for (let i = steam.length - 1; i >= 0; i--) {
          const s2 = steam[i]
          s2.age += tk.deltaMS
          const k = s2.age / s2.life
          if (k >= 1) { s2.sp.destroy(); steam.splice(i, 1); continue }
          s2.sp.y -= 14 * tk.deltaMS / 1000
          s2.sp.x += s2.drift * tk.deltaMS / 1000
          s2.sp.alpha = 0.4 * Math.sin(Math.PI * Math.min(1, k * 1.15))
          const g2 = 1 + k * 2.1
          s2.sp.scale.set(g2)
        }
        for (const s of swaying) s.sp.rotation = s.amp * (Math.sin(wt * 0.7 + s.ph) + 0.35 * Math.sin(wt * 1.9 + s.ph * 2.3))
        for (const g of glows) g.sp.alpha = 0.75 + 0.25 * Math.sin(wt * 1.6 + g.ph)
        for (const c of clouds) {
          c.sp.x += c.vx * tk.deltaMS / 1000
          c.sp.y += c.vy * tk.deltaMS / 1000
          const lim = 8000
          if (c.sp.x > isoX(ISLE_CX, ISLE_CY) + lim) c.sp.x -= 2 * lim
          if (c.sp.y > isoY(ISLE_CX, ISLE_CY) + lim * 0.6) c.sp.y -= 1.2 * lim
        }
        resizeFx(vw, vh)
      })

      // ---- MAP-LOCAL atmosphere: warm key upper-left, moody floor, gentle vignette ----
      const warm = new Sprite(Texture.WHITE); warm.tint = 0xffd291; warm.alpha = 0.05; instance.stage.addChild(warm)
      const sun = new Sprite(radial(512, [[0, 'rgba(255,222,160,0.16)'], [0.5, 'rgba(255,210,140,0.05)'], [1, 'rgba(255,210,140,0)']])); sun.anchor.set(0.5); sun.blendMode = 'add'; instance.stage.addChild(sun)
      const vig = new Sprite(radial(512, [[0, 'rgba(0,0,0,0)'], [0.46, 'rgba(0,0,0,0)'], [0.72, 'rgba(10,14,12,0.34)'], [1, 'rgba(5,8,7,0.74)']])); instance.stage.addChild(vig)
      const resizeFx = (vw: number, vh: number) => {
        warm.width = vw; warm.height = vh
        sun.width = sun.height = Math.max(vw, vh) * 1.5; sun.position.set(vw * 0.28, vh * 0.02)
        vig.width = vw * 1.5; vig.height = vh * 1.5; vig.position.set(-vw * 0.25, -vh * 0.25)
      }
      resizeFx(instance.renderer.width, instance.renderer.height)

      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    }

    start().catch((err) => { console.error('[IslandMapIso] failed', err) })
    return () => { destroyed = true; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); if (app) app.destroy(true, { children: true }) }
  }, [])
  return <div ref={ref} style={{ position: 'fixed', inset: 0, background: '#073442' }} />
}

// ---- helpers ----
function mix01(a: number, b: number, t: number) { return a + (b - a) * t }
function shadeHex(hex: number, f: number) {
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f)
  return (r << 16) | (g << 8) | b
}
function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  return ((ar + (br - ar) * t) << 16) | ((ag + (bg - ag) * t) << 8) | (ab + (bb - ab) * t) | 0
}
function radial(size: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
function makeShadow() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(40,42,72,0.92)'); g.addColorStop(0.45, 'rgba(40,42,72,0.55)'); g.addColorStop(0.8, 'rgba(40,42,72,0.16)'); g.addColorStop(1, 'rgba(40,42,72,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
