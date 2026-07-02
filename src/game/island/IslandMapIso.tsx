import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Culler, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js'
import { ISLANDS } from './registry'
import {
  ISLE_CX, ISLE_CY, LANDS, MAP_COLS, MAP_ROWS, POOL, PORT_THETA,
  coastDist, coastDistUW, coastPoint, freshDist, isleCell, isleLift, isleSlope, pathDist,
  shoreScaleUW, txOf, tyOf, uOf, vnoise2, wOf,
} from './shape'
import { PROP_SRC, PROP_TINT, composeIsland, composePortDressing } from './compose'

// THE ISLAND MAP — the game's main map: one vast ocean, mostly water, the Central Island at
// its heart (GAME-DESIGN §3.1/§3.2). Built by COPYING the beach's proven systems (BeachIso.tsx
// is never edited): the normalized-tile + depth-ramp + aerial-veil ocean, the living tide (here
// wrapped around a closed coastline as parametric surf dabs), the surface/collision engine, the
// per-map atmosphere. The open sea beyond each island's depth ring IS the abyss color the ramp
// converges to, so the map's vastness costs nothing; every island the registry holds
// materializes its own ring of live tiles. True 2:1 iso, 100% PixelLab tiles/props, no shaders.

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

// variant pools over the shared normalized tile families (same as the beach)
const SAND_COMMON = [0, 1, 2, 3, 7, 9]
const W_CALM = [0, 12, 15], W_SOFT = [3, 2, 8], W_TEX = [1, 10, 4, 6], W_SWELL = [13, 14, 11, 9, 7, 5]
const W_BASE = [205, 235, 229]
const SAND_BASE = [246, 229, 180]
const JUNGLE_BASE = [82, 124, 72]  // normalize_tiles.py targets — ~1.5x the family's natural median:
const ROCK_BASE = [110, 108, 90]   // enough tint headroom to grade DARK, not so much the texture pastelizes
const W_RAMP: [number, number][] = [
  [0.0, 0xa8e2d2], [0.09, 0x8ed8c6], [0.14, 0x4dbcb2], [0.24, 0x35a5a2],
  [0.38, 0x24909a], [0.54, 0x187a89], [0.68, 0x0f586c], [1.0, 0x073442],
]
const ABYSS = 0x073442
const DEPTH_RANGE = 13 // 32px units of radial ring from waterline to abyss (same 416px band as the beach)
// land color ramps (tint over the normalized sand micro-texture; the tint owns the hue)
const FRESH_RAMP: [number, number][] = [[0, 0x9fdccb], [0.5, 0x4dbcb2], [1, 0x2f9a97]]

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

// the tide cycle (identical feel to the beach; the wash direction here is each dab's own
// inland normal, so the surf wraps the whole coastline)
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
      // MAP-LOCAL zoom (open-sea map reads a touch wider than the beach); ?zoom= for validation
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

      // ---- drawn-geometry measurement (the beach's lesson: place/collide by pixels, never
      // canvas boxes) — trims dead padding below the feet, finds true ground points ----
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
      // MAP-LOCAL grade: bright open-sea golden — warm but airier than the beach cove
      const grade = new ColorMatrixFilter()
      grade.saturate(0.05, true); grade.contrast(0.02, true)
      const wm = grade.matrix; wm[0] *= 1.05; wm[6] *= 1.0; wm[12] *= 0.91; grade.matrix = wm
      world.filters = [grade]

      // ---- THE ABYSS PLANE: one sprite is the entire open ocean. The depth ramp and the
      // aerial veil converge to this exact color, so each island's ring melts into it and the
      // sea reads endless in every direction for free. ----
      {
        const plane = new Sprite(Texture.WHITE)
        plane.tint = ABYSS
        plane.position.set(-MAP_COLS * HW, 0)
        plane.width = 2 * MAP_COLS * HW; plane.height = (MAP_COLS + MAP_ROWS) * HH
        plane.zIndex = -100000
        world.addChild(plane)
      }

      // ---- ISLAND TILES: each registry island materializes its ring + landmass. Water gets
      // the beach's exact depth-ramp treatment (radial here); land climbs the mountain via
      // lift with slope shading; paths wear into the ground; fresh water carves the river. ----
      const waterSprites: { sp: Sprite; ph: number; ph2: number; base: number; amp: number }[] = []
      const walkable = new Map<string, boolean>()
      const wk = (x: number, y: number) => x + ',' + y
      const POOL_LIFT = Math.max(0, isleLift(txOf(POOL.u, POOL.w + POOL.r + 1.5), tyOf(POOL.u, POOL.w + POOL.r + 1.5)) - 6)
      for (const isle of ISLANDS) {
        // bbox in (tx,ty): |u| <= R+ring, |w| <= R+ring
        const RR = isle.radius + DEPTH_RANGE + 2
        const s0 = isle.cx + isle.cy
        for (let s = s0 - 2 * RR; s <= s0 + 2 * RR; s++) {
          for (let d = -RR; d <= RR; d++) {
            const tx = (s + d) / 2, ty = (s - d) / 2
            if (tx !== Math.round(tx)) continue
            if (tx < 2 || ty < 2 || tx > MAP_COLS - 2 || ty > MAP_ROWS - 2) continue
            const cd = coastDist(tx, ty)
            if (cd < -DEPTH_RANGE - 1.5) continue // beyond the ring: the abyss plane owns it
            const cell = isleCell(tx, ty)
            const slope = isleSlope(tx, ty)
            let landBase = SAND_BASE // which normalized family's median divides the tint
            // the mountain is climbed by the falls staircase, not free-walked: steep ground
            // and the upper cone are closed (colliders do the mid-slope work; this is the law)
            walkable.set(wk(tx, ty), (cell === 'sand' || cell === 'grass' || cell === 'jungle' || cell === 'bank')
              && slope <= 5.5 && isleLift(tx, ty) <= 100)
            let base: Texture | undefined
            const isSea = cell === 'sea'
            if (isSea) {
              const raw = -cd / DEPTH_RANGE
              const dAmp = raw < 0.14 ? 0.1 : raw < 0.55 ? 0.022 : 0.05
              const dep = Math.min(1, Math.max(0, raw + (hash(tx * 7.7, ty * 5.3) - 0.5) * dAmp))
              const h = hash(tx * 1.3, ty * 2.7)
              const pool = dep < 0.1 ? W_CALM
                : dep < 0.3 ? (h < 0.6 ? W_CALM : W_SOFT)
                  : dep < 0.55 ? (h < 0.5 ? W_SOFT : W_TEX)
                    : (h < 0.55 ? W_TEX : W_SWELL)
              base = waterV[pool[Math.floor(hash(tx * 3.1, ty * 1.9) * pool.length)]]
            } else if (cell === 'fresh') {
              base = waterV[W_CALM[Math.floor(hash(tx * 3.1, ty * 1.9) * W_CALM.length)]]
            } else {
              // land textures by zone (the tint ramp owns hue; the texture owns material):
              // sand family on the shore ring + worn paths, REAL jungle-floor litter inland,
              // broken basalt on the volcano's bare heights — dithered at every family seam
              const jj = (hash(tx * 5.7, ty * 3.9) - 0.5) * 1.3
              const liftT = isleLift(tx, ty)
              const pdT = pathDist(tx, ty) + jj * 0.5
              if (liftT + jj * 8 > 100 && jungleV.length && rockV.length && pdT > 1.1) {
                base = rockV[Math.floor(hash(tx * 2.9, ty * 3.7) * rockV.length)]
                landBase = ROCK_BASE
              } else if (coastDist(tx, ty) * shoreScaleUW(uOf(tx, ty), wOf(tx, ty)) + jj > 5.2 && pdT > 1.1 && jungleV.length) {
                base = jungleV[Math.floor(hash(tx * 3.3, ty * 4.1) * jungleV.length)]
                landBase = JUNGLE_BASE
              } else
                base = sandV[SAND_COMMON[Math.floor(hash(tx * 3.3, ty * 4.1) * SAND_COMMON.length)]]
            }
            if (!base) continue
            const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
            const fx = vnoise2(tx / 7 + 4, ty / 7 + 11) > 0.5 ? -1 : 1
            const os = isSea || cell === 'fresh' ? 1.12 : 1.09 // land overlaps a touch more (mountain relief gaps)
            sp.scale.set(fx * os, os)
            // fresh water: the pool holds ONE flat surface level (per-tile terrain lift turned
            // it into a stepped pyramid); the river sinks 5px into its valley
            const inPool = cell === 'fresh' && Math.hypot((tx - ty) - POOL.u, (tx + ty - (ISLE_CX + ISLE_CY)) / 2 - POOL.w) < POOL.r + 2
            let lift = isSea ? 0 : cell === 'fresh' ? (inPool ? POOL_LIFT : Math.max(0, isleLift(tx, ty) - 5)) : isleLift(tx, ty)
            // the pool's rim settles to its surface so the bowl doesn't step (river banks
            // keep their own descent)
            if (!isSea && cell !== 'fresh') {
              const dPool = Math.hypot((tx - ty) - POOL.u, (tx + ty - (ISLE_CX + ISLE_CY)) / 2 - POOL.w) - (POOL.r + 0.5)
              if (dPool < 3.5) {
                const k = Math.min(1, Math.max(0, (dPool - 0.2) / 3.3))
                lift = (POOL_LIFT + 4) * (1 - k) + lift * k
              }
            }
            sp.position.set(isoX(tx, ty), isoY(tx, ty) - lift); sp.zIndex = (tx + ty) * 16
            if (isSea) {
              const raw = -cd / DEPTH_RANGE
              const dAmp = raw < 0.14 ? 0.1 : raw < 0.55 ? 0.022 : 0.05
              const dep = Math.min(1, Math.max(0, raw + (hash(tx * 7.7, ty * 5.3) - 0.5) * dAmp))
              const patch = 0.955 + 0.09 * vnoise2(tx / 22 + 7, ty / 22 + 2)
              const grain = 0.997 + 0.006 * hash(tx, ty)
              const col = shadeHex(tintFor(rampAt(W_RAMP, dep), W_BASE), patch * grain)
              sp.tint = col
              waterSprites.push({
                sp, base: col,
                ph: (tx + ty) * 0.5 + 0.35 * Math.sin((tx - ty) * 0.18),
                ph2: (tx + ty) * 0.21 - (tx - ty) * 0.07,
                amp: 0.022 + 0.055 * dep,
              })
            } else if (cell === 'fresh') {
              // dithered depth so the pool reads as one soft bowl, not banded terraces
              const f = -freshDist(tx, ty) + (hash(tx * 6.1, ty * 4.3) - 0.5) * 0.9
              sp.tint = tintFor(shadeHex(rampAt(FRESH_RAMP, Math.min(1, Math.max(0, f / 4.5))), 0.98 + 0.04 * hash(tx, ty)), W_BASE)
            } else {
              // land: ONE CONTINUOUS colormap over (shore distance, altitude) with per-tile
              // jitter, so zone boundaries dither into each other instead of stamping hard
              // diamond staircases. wet sand -> dry sand -> dune grass -> lowland jungle ->
              // deep jungle -> mossy rock -> bare crown, all one surface.
              const grain = 0.994 + 0.012 * hash(tx * 1.3, ty * 2.1)
              const drift = 0.955 + 0.075 * vnoise2(tx / 16 + 3, ty / 16 + 5)
              // DIRECTIONAL relief: the sun sits upper-left, so faces climbing toward it
              // catch light and faces falling away sink into shadow — this is what makes
              // the volcano and the hill country READ as height instead of dye
              const dLift = isleLift(tx + 0.5, ty + 0.5) - isleLift(tx - 0.5, ty - 0.5) // down-screen gradient
              const dLiftX = isleLift(tx + 0.5, ty - 0.5) - isleLift(tx - 0.5, ty + 0.5) // across-screen gradient
              const shade = Math.min(1.12, Math.max(0.6, 1 - dLift * 0.022 + dLiftX * 0.014))
              const j = (hash(tx * 5.7, ty * 3.9) - 0.5) * 1.3 // boundary dither
              const cdj = cd * shoreScaleUW(uOf(tx, ty), wOf(tx, ty)) + j
              let col: number
              if (cdj < 1.5) col = mix(0xb5945e, 0xd8bd86, Math.min(1, Math.max(0, cdj / 1.5)))
              else if (cdj < 3.4) col = rampAt([[0, 0xd8bd86], [0.6, 0xead6a3], [1, 0xf0e2b4]], (cdj - 1.5) / 1.9)
              // jungle ramp colors are pure VALUE-scales of the family's base hue (82,124,72):
              // uniform tints grade brightness without blue-shifting the litter texture to sage
              else if (cdj < 5.2) col = mix(0xf0e2b4, 0x50793f, (cdj - 3.4) / 1.8) // sand fades under dune grass
              else if (cdj < 7.5) col = mix(0x50793f, 0x46693d, (cdj - 5.2) / 2.3)
              else col = rampAt([[0, 0x46693d], [0.4, 0x385431], [0.75, 0x2d4428], [1, 0x263921]],
                Math.min(1, (cdj - 7.5) / 22 + 0.5 * Math.min(1, lift / 130))) // DARK muted BLHS green, never lime
              // altitude: mossy rock blends in high up; the crown reads as cool broken basalt
              // (banded by slope + noise so it reads as rock shelves, never felt) — the carved
              // head takes this seat later
              const rockK = Math.min(1, Math.max(0, (lift + j * 8 - 118) / 30))
              if (rockK > 0) {
                const shelf = 0.82 + 0.3 * vnoise2(tx / 3.1 + 17, ty / 3.1 + 4) // broken banding
                const crag = Math.max(0, Math.abs(dLift) - 3) * 0.035           // crevice dark on steeps
                let rc = rampAt([[0, 0x5e5c4d], [0.6, 0x4d4c3f], [1, 0x3d3b32]], Math.min(1, (lift - 118) / 60)) // value-scales of the rock base hue
                rc = shadeHex(rc, Math.max(0.6, shelf - crag))
                col = mix(col, rc, rockK)
              }
              // THE BLOWHOLE: inside the crater rim the ground chars to vent basalt with a
              // faint ember heart — the volcano is alive (smoke plume rides the art pass)
              const dVent = Math.hypot((tx - ty) - 0, (tx + ty - (ISLE_CX + ISLE_CY)) / 2 + 6)
              if (dVent < 3.4) {
                const k = 1 - dVent / 3.4
                col = mix(col, mix(0x2e2a26, 0x5a3220, Math.pow(k, 2.2)), Math.min(1, k * 2.2))
              }
              // fresh-water banks darken to damp earth
              const fd = cd > 2.5 ? freshDist(tx, ty) : 9
              if (fd < 1.9) col = mix(0x6b7a4e, col, Math.max(0, (fd - 0.6) / 1.3))
              // the worn trail: compacted earth, feathered
              if (cdj > 3) {
                const pd = pathDist(tx, ty) + j * 0.5
                if (pd < 1.6) col = mix(0x9a8a62, col, Math.max(0, (pd - 0.6) / 1.0))
              }
              sp.tint = shadeHex(tintFor(col, landBase), grain * drift * shade)
            }
            world.addChild(sp)
          }
        }
      }

      // ---- AERIAL-PERSPECTIVE VEIL per island (the beach's exact trick, radial): melts the
      // ring's tile texture into the abyss with distance, sliced per s-row for honest depth ----
      for (const isle of ISLANDS) {
        const RES = 4
        const RR = isle.radius + DEPTH_RANGE + 2
        const s0 = isle.cx + isle.cy
        const x0 = -RR * HW + isoX(isle.cx, isle.cy)
        const cw = Math.ceil((2 * RR * HW) / RES)
        const y0 = (s0 - 2 * RR) * HH
        const ch = Math.ceil((4 * RR * HH) / RES)
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
        const g = cv.getContext('2d')!
        const img = g.createImageData(cw, ch)
        const px = img.data
        const rowLive: boolean[] = []
        for (let cy = 0; cy < ch; cy++) {
          const wy = y0 + (cy + 0.5) * RES
          const w = (wy / HH - s0) / 2
          let live = false
          for (let cx = 0; cx < cw; cx++) {
            const wx = x0 + (cx + 0.5) * RES
            const u = wx / HW
            const dep = Math.min(1, -coastDistUW(u, w) / DEPTH_RANGE)
            let a = 0
            if (dep > 0.09) {
              const k = Math.min(1, (dep - 0.09) / 0.48)
              a = 0.5 * k * k * (3 - 2 * k)
              if (dep > 0.78) { const kk = Math.min(1, (dep - 0.78) / 0.22); a += 0.24 * kk * kk }
              a *= 0.86 + 0.28 * vnoise2(wx / 1250 + 3.2, wy / 720 + 8.1)
            }
            if (a > 0) {
              const col = rampAt(W_RAMP, Math.min(1, dep + 0.1))
              const o = (cy * cw + cx) * 4
              px[o] = (col >> 16) & 255; px[o + 1] = (col >> 8) & 255; px[o + 2] = col & 255
              px[o + 3] = Math.round(Math.min(1, a) * 255)
              live = true
            }
          }
          rowLive[cy] = live
        }
        g.putImageData(img, 0, 0)
        const washT = Texture.from(cv)
        washT.source.scaleMode = 'linear'
        const rowsPerS = HH / RES
        for (let s = 0; s < Math.ceil(ch / rowsPerS); s++) {
          const cy0 = s * rowsPerS
          let live = false
          for (let r = 0; r < rowsPerS; r++) if (rowLive[cy0 + r]) { live = true; break }
          if (!live) continue
          const strip = new Sprite(new Texture({ source: washT.source, frame: new Rectangle(0, cy0, cw, Math.min(rowsPerS, ch - cy0)) }))
          strip.position.set(x0, y0 + cy0 * RES); strip.scale.set(RES, RES)
          const sRow = (y0 + cy0 * RES) / HH
          strip.zIndex = sRow * 16 + 18
          world.addChild(strip)
        }
      }

      // ---- THE SURF: parametric dabs around the coastline — skirt (buries the tile staircase),
      // dark seam, and two staggered foam fronts that wash INLAND along each dab's own normal
      // and retract, the break sweeping around the island. Flank dabs (coast running steep on
      // screen) keep the collar but ease off the wash so nothing slides sideways. ----
      type Dab = {
        x: number; y: number; nx: number; ny: number; s: number; arc: number
        skirt?: Sprite; seam?: Sprite; foam: Sprite[]; flankK: number
      }
      const dabs: Dab[] = []
      if (tex['skirt'] && tex['foamlace']) {
        const skT = tex['skirt']
        for (let li = 0; li < LANDS.length; li++) {
          const cx = isoX(ISLE_CX, ISLE_CY), cyw = isoY(ISLE_CX, ISLE_CY)
          const roughR = li === 0 ? 46 : 13
          let arc = li * 173 // offset each land's slice walk so no two coasts show the same lace
          let prev: { x: number; y: number } | null = null
          for (let th = 0; th < Math.PI * 2; th += 1.0 / roughR) {
            const cp = coastPoint(th, li)
            const x = cx + cp.u * HW, y = cyw + cp.w * 2 * HH
            if (prev) arc += Math.hypot(x - prev.x, y - prev.y)
            prev = { x, y }
            const s = y / HH
            // how vertical the coast runs on screen here: 0 = horizontal (full wash), 1 = vertical
            const flankK = Math.min(1, Math.abs(cp.nx) / 0.85)
            const fr = new Rectangle((Math.floor(arc) % Math.max(32, skT.width - 32)), 0, 32, skT.height)
            const mkSk = (ay: number, sy: number, tint: number | null, alpha: number, dz: number) => {
              const sp = new Sprite(new Texture({ source: skT.source, frame: fr }))
              sp.anchor.set(0.5, ay); sp.scale.set(1, sy)
              if (tint !== null) sp.tint = tint
              sp.alpha = alpha; sp.position.set(x, y); sp.zIndex = s * 16 + dz
              world.addChild(sp)
              return sp
            }
            const d: Dab = { x, y, nx: cp.nx, ny: cp.ny, s, arc, foam: [], flankK }
            d.seam = mkSk(0.3, 0.55, 0x113238, 0.45, 1)
            d.skirt = mkSk(0.62, 1.9, null, 0.9, 2)
            // two foam fronts (alternating lace variants); flipped vertically when the
            // scalloped leading edge must face up-screen (south shores)
            for (let f = 0; f < 2; f++) {
              const laceT = (f === 1 && tex['foamlace2']) ? tex['foamlace2'] : tex['foamlace']
              const period = Math.max(32, laceT.width - 32)
              const off = Math.floor(arc + f * 160) % period
              const fsp = new Sprite(new Texture({ source: laceT.source, frame: new Rectangle(off, 0, 32, laceT.height) }))
              fsp.anchor.set(0.5, 0.84)
              if (cp.ny < 0) fsp.scale.y = -1 // leading edge faces the land side
              fsp.position.set(x, y); fsp.alpha = 0
              world.addChild(fsp); d.foam.push(fsp)
            }
            dabs.push(d)
          }
        }
      }

      // ---- open-sea life: sun sparkles in the ring + roaming abyss glints + cloud shadows ----
      const sparkles: { sp: Sprite; ph: number; sc: number; roam: boolean }[] = []
      if (tex['sparkle']) {
        for (let i = 0; i < 150; i++) {
          const roam = i >= 90
          const sp = new Sprite(tex['sparkle']); sp.anchor.set(0.5)
          const sc = 0.4 + hash(i * 7, i * 2) * 0.5
          sp.scale.set(sc); sp.alpha = 0; sp.blendMode = 'add'
          if (!roam) {
            // in the island's depth ring, denser toward the sun (upper-left)
            const th = hash(i * 3.7, i) * Math.PI * 2
            const back = 1.5 + hash(i, i * 1.9) * 10
            const cp = coastPoint(th)
            const x = isoX(ISLE_CX, ISLE_CY) + (cp.u + cp.nx * back) * HW
            const y = isoY(ISLE_CX, ISLE_CY) + (cp.w + cp.ny * back) * 2 * HH
            sp.position.set(x, y); sp.zIndex = (y / HH) * 16 + 19
          } else sp.zIndex = 200000
          world.addChild(sp); sparkles.push({ sp, ph: hash(i, i * 5) * 20, sc, roam })
        }
      }
      const shadowTex = makeShadow()
      const clouds: { sp: Sprite; vx: number; vy: number }[] = []
      for (let i = 0; i < 5; i++) {
        // barely-there drifting cloud shade: a whisper, never a stain
        const c = new Sprite(radial(256, [[0, 'rgba(10,28,34,0.13)'], [0.55, 'rgba(10,28,34,0.07)'], [1, 'rgba(10,28,34,0)']]))
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
        'kapokA', 'kapokB', 'banyan', 'broadA', 'broadB', 'boulder', 'fernA', 'ruinGate'])
      const HULL = new Set(['rowboat', 'logdrift', 'crates', 'tidepool', 'boulder'])

      // ---- props ----
      const swaying: { sp: Sprite; ph: number; amp: number }[] = []
      const props = [...composeIsland(), ...composePortDressing()]
      for (const p of props) {
        const t0 = tex[p.img]; if (!t0) continue
        const lift = p.sea ? 0 : isleLift(p.tx, p.ty)
        const x = isoX(p.tx, p.ty), y = isoY(p.tx, p.ty) - lift, z = (p.tx + p.ty) * 16
        if (p.ground) {
          const sc0 = p.h / t0.height
          const sp = new Sprite(t0); sp.anchor.set(0.5, 0.6); sp.scale.set(p.flip ? -sc0 : sc0, sc0)
          sp.position.set(x, y); sp.zIndex = z + 3
          const gt = p.tint ?? PROP_TINT[p.img]; if (gt) sp.tint = gt
          world.addChild(sp)
          continue
        }
        const t = trimmed(t0)
        const sc = p.h / t.height
        const tall = p.h > 140
        const sh = new Sprite(shadowTex); sh.anchor.set(0.28, 0.5)
        sh.width = Math.max(26, t.width * sc * (p.sea ? 0.8 : tall ? 1.7 : 1.4))
        sh.height = Math.max(11, t.width * sc * (tall ? 0.22 : 0.32))
        sh.rotation = 0.2
        sh.alpha = p.sea ? 0.3 : tall ? 0.5 : 0.55; sh.position.set(x + 5, y + 2)
        sh.zIndex = z + 17
        world.addChild(sh)
        const sp = new Sprite(t); sp.anchor.set(0.5, 1.0); sp.scale.set(p.flip ? -sc : sc, sc)
        sp.position.set(x, y + (p.sea ? 5 : 0))
        sp.zIndex = z + 8
        const pt = p.tint ?? PROP_TINT[p.img]; if (pt) sp.tint = pt
        world.addChild(sp)
        if (p.img.startsWith('palm')) swaying.push({ sp, ph: hash(p.tx * 3.1, p.ty * 1.7) * 6.28, amp: 0.014 + 0.008 * hash(p.tx, p.ty * 9) })
        else if (p.img.startsWith('kapok') || p.img === 'banyan' || p.img.startsWith('broad')) swaying.push({ sp, ph: hash(p.tx * 1.9, p.ty * 2.9) * 6.28, amp: 0.005 }) // big trees barely stir
        else if (p.img.startsWith('bush') || p.img.startsWith('fern') || p.img === 'dunegrass' || p.img === 'heliconia') swaying.push({ sp, ph: hash(p.tx * 2.3, p.ty * 4.1) * 6.28, amp: 0.006 })
        if (!p.noBlock && COLLIDE.has(p.img)) {
          const m = measureBase(t, HULL.has(p.img) ? 0.45 : 0.12)
          if (m) for (const b of m.pts) {
            const sdx = (b.x - t.width * 0.5) * sc * (p.flip ? -1 : 1)
            const sdy = (b.y - m.feet) * sc + (p.sea ? 5 : 0)
            const u = sdx / (2 * HW), v = sdy / (2 * HH)
            addCollider(p.tx + u + v, p.ty + v - u, Math.max(0.09, (b.hw * sc * 0.9) / (HW * Math.SQRT2)))
          }
        }
      }

      // ---- warm lantern glows (ports) ----
      const glows: { sp: Sprite; ph: number }[] = []
      const glowTex = radial(96, [[0, 'rgba(255,196,110,0.5)'], [0.4, 'rgba(255,176,90,0.18)'], [1, 'rgba(255,176,90,0)']])
      const addGlow = (gx: number, gy: number, size: number, z: number) => {
        const g = new Sprite(glowTex); g.anchor.set(0.5); g.blendMode = 'add'
        g.width = g.height = size; g.position.set(gx, gy); g.zIndex = z
        world.addChild(g); glows.push({ sp: g, ph: hash(gx, gy) * 6.28 })
      }

      // ---- THE FOUR PORTS: the beach pier kit rebuilt as a parameterized assembly. Each pier
      // runs a true iso diagonal from the cove sand across the surf to a dock platform; mirrored
      // art serves the NW-axis ports. Deck surfaces + stairs ride the same surface engine. ----
      const DECK_LIFT = 30
      const placePort = (thetaDeg: number) => {
        if (!tex['pierIso'] || !tex['dockPlat']) return
        const th = (thetaDeg * Math.PI) / 180
        const cp = coastPoint(th)
        // the pier axis: NE-axis (tx const, the beach's own art direction) when the outward
        // normal leans up-right or down-left; NW-axis (ty const, mirrored art) otherwise
        const neAxis = (cp.nx > 0) === (cp.ny < 0)
        const seaUp = cp.ny < 0 // does the walkway head up-screen toward the sea?
        // root tile: on the cove sand just inside the waterline, snapped
        const rtx = Math.round(txOf(cp.u - cp.nx * 2.2, cp.w - cp.ny * 2.2))
        const rty = Math.round(tyOf(cp.u - cp.nx * 2.2, cp.w - cp.ny * 2.2))
        const A = { x: isoX(rtx, rty), y: isoY(rtx, rty) - DECK_LIFT } // deck-top over the root tile
        const mirror = !neAxis
        // place a sprite so its LOCAL landmark (lx,ly in unscaled art px) lands on a world
        // point; returns local->world so glows can anchor to measured pixels. Mirrored art
        // draws leftward from pos, so local x inverts around the anchor.
        const place = (t: Texture, lx: number, ly: number, wx: number, wy: number, z: number, scl = 1) => {
          const sp = new Sprite(t)
          sp.anchor.set(0, 0)
          sp.scale.set(mirror ? -scl : scl, scl)
          sp.position.set(mirror ? wx + lx * scl : wx - lx * scl, wy - ly * scl)
          sp.zIndex = z
          world.addChild(sp)
          return (px2: number, py2: number) => ({
            x: mirror ? sp.position.x - px2 * scl : sp.position.x + px2 * scl,
            y: sp.position.y + py2 * scl,
          })
        }
        // seaward walkway step in tiles + screen px
        const stepTx = neAxis ? 0 : (seaUp ? -1 : 1)
        const stepTy = neAxis ? (seaUp ? -1 : 1) : 0
        const sdx = isoX(stepTx, stepTy), sdy = isoY(stepTx, stepTy)
        const WALK_N = 9
        // z-order: every element must draw over the LAST water row it spans. A sea-UP pier
        // (beach case) spans rows behind its root, so root keys everything; a sea-DOWN pier
        // spans rows in FRONT of its root, so its far end keys the walkway and platform
        // (without this, the sea tiles drew over the east/south piers entirely).
        const rootS = rtx + rty, stepS = stepTx + stepTy
        const jettyZ = rootS * 16 + 9
        const pierZ = seaUp ? jettyZ - 4 : (rootS + stepS * WALK_N) * 16 + 7
        const platZ = seaUp ? pierZ - 5 : (rootS + stepS * (WALK_N + 3)) * 16 + 9
        // pier segments chain along the axis, anchored by the cap midpoint at the LAND end of
        // each segment: the low (SW-local) cap when the sea is up-screen, the high (NE-local)
        // cap when the sea is down-screen (measured on pier-iso2: SW cap (20,120), NE (187.5,36))
        const capL: [number, number] = seaUp ? [20, 120] : [187.5, 36]
        for (let i = 0; i < 2; i++)
          place(tex['pierIso'], capL[0], capL[1], A.x + sdx * (i * 5), A.y + sdy * (i * 5), pierZ - i)
        // the dock platform at the sea end, its walkway-facing deck-edge midpoint tucked 0.19
        // steps back so the cap planks lap onto the deck (the beach's -6/+3 tuck, generalized).
        // Facing midpoints on dock-platform2: SW (77,102); NE (171,70) (center-mirrored estimate)
        const E = { x: A.x + sdx * (WALK_N - 0.19), y: A.y + sdy * (WALK_N - 0.19) }
        const platL: [number, number] = seaUp ? [77, 102] : [171, 70]
        place(tex['dockPlat'], platL[0], platL[1], E.x, E.y, platZ)
        // the lantern jetty at the land end (landmark (90,84), lamp at (26,65) — beach-measured)
        if (tex['lanternPost']) {
          const JSC = 0.63
          const loc = place(tex['lanternPost'], 90, 84, A.x + 2, A.y - 1, jettyZ, JSC)
          const lamp = loc(26, 65)
          addGlow(lamp.x, lamp.y, 54, jettyZ + 3)
        }
        // surfaces: walkway column + platform block + entry stairs
        for (let i = 0; i <= WALK_N; i++)
          setSurf(rtx + stepTx * i, rty + stepTy * i, { walk: true, layer: 1, lift: DECK_LIFT, z: (i === 0 ? jettyZ : pierZ) + 2 })
        for (let a = -1; a <= 1; a++) for (let b = 0; b <= 2; b++) {
          const px2 = rtx + stepTx * (WALK_N + b) + (neAxis ? a : 0)
          const py2 = rty + stepTy * (WALK_N + b) + (neAxis ? 0 : a)
          if (a === 0 && b === 1) continue // the platform's barrel tile: walk around it
          setSurf(px2, py2, { walk: true, layer: 1, lift: DECK_LIFT, z: (seaUp ? pierZ : platZ) + 2 })
        }
        setSurf(rtx - stepTx, rty - stepTy, { walk: true, layer: 1, lift: 14, z: jettyZ + 2, trans: true })
        setSurf(rtx - 2 * stepTx, rty - 2 * stepTy, { walk: true, layer: 1, lift: 4, z: jettyZ + 2, trans: true })
        // the pier's legs block sand-Thor
        addCollider(rtx - 0.6 * stepTx, rty - 0.6 * stepTy, 0.55)
      }
      for (const p of Object.values(PORT_THETA)) placePort(p)

      // ---- Thor ----
      const thorShadow = new Sprite(shadowTex); thorShadow.anchor.set(0.5, 0.5)
      thorShadow.width = 32; thorShadow.height = 16; thorShadow.alpha = 0.62
      world.addChild(thorShadow)
      const THOR_SC = 0.58
      const thor = new Sprite(idle['south'] ?? Texture.WHITE); thor.anchor.set(0.5, 1.0); thor.scale.set(THOR_SC)
      thor.zIndex = 0; world.addChild(thor)
      const jump = { active: false, t: 0 }
      const spawnP = (new URLSearchParams(location.search).get('spawn') ?? '').split(',').map(Number)
      // default spawn: the east-port sand (the intro's arrival shore)
      const ecp = coastPoint((PORT_THETA.east * Math.PI) / 180)
      const pos = {
        tx: spawnP.length === 2 && !isNaN(spawnP[0]) ? spawnP[0] : Math.round(txOf(ecp.u - ecp.nx * 4, ecp.w - ecp.ny * 4)),
        ty: spawnP.length === 2 && !isNaN(spawnP[1]) ? spawnP[1] : Math.round(tyOf(ecp.u - ecp.nx * 4, ecp.w - ecp.ny * 4)),
      }
      let facing = 'south', at = 0, renderLift = 0

      const GROUND: Surf = { walk: false, layer: 0, lift: 0, z: 0 }
      const surfAt = (x: number, y: number): Surf => {
        const o = surf.get(x + ',' + y)
        if (o) return o
        return { walk: !!walkable.get(x + ',' + y), layer: 0, lift: 0, z: 0 }
      }
      void GROUND
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

      // a map this size lives or dies on culling: ~20k display objects exist, but only the
      // viewport's worth may render. Everything in the world is cullable; the ticker culls
      // against the screen each frame (the beach never needed this; the island map does).
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
        // depenetration net
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
        // camera
        const vw = instance.renderer.width, vh = instance.renderer.height
        if (world.scale.x !== ZOOM) world.scale.set(ZOOM)
        world.x = vw / 2 - x * ZOOM; world.y = vh * 0.58 - y * ZOOM
        // water: traveling swell brightness
        const wt = performance.now() / 1000
        for (const w of waterSprites) {
          const fct = 1 + w.amp * (Math.sin(w.ph - wt * 1.05) + 0.55 * Math.sin(w.ph2 - wt * 0.42 + 1.7))
          w.sp.tint = shadeHex(w.base, fct)
        }
        // the surf: the break sweeps around the island; each dab washes inland on its normal
        for (let i = 0; i < dabs.length; i++) {
          const d = dabs[i]
          for (let f = 0; f < d.foam.length; f++) {
            const [reach, foamA] = tidePhase(wt - f * TIDE_T / 2 - d.arc * 0.011)
            const amp = TIDE_AMP * (1 - 0.85 * d.flankK)
            const ox = -d.nx * reach * amp * HW * 0.9, oy = -d.ny * reach * amp * 2 * HH * 0.9
            const fsp = d.foam[f]
            fsp.position.set(d.x + ox, d.y + oy)
            fsp.zIndex = (d.y + oy) / HH * 16 + 6
            fsp.alpha = foamA * 0.9 * (1 - 0.55 * d.flankK)
          }
          if (d.skirt) d.skirt.position.y = d.y + 1.2 * Math.sin(wt * 0.9 + d.arc * 0.02)
        }
        for (const s of sparkles) {
          const k = Math.max(0, Math.sin(wt * 0.9 + s.ph) - 0.55) / 0.45
          s.sp.alpha = k * 0.85
          s.sp.scale.set(s.sc * (0.7 + 0.3 * k))
          if (s.roam) {
            // keep the roaming abyss glints inside the current view
            if (k < 0.02) {
              const wx = (vw * (hash(s.ph, wt | 0) - 0.5)) / ZOOM + (x)
              const wy2 = (vh * (hash(s.ph * 3, wt | 0) - 0.5)) / ZOOM + (y)
              s.sp.position.set(wx, wy2)
            }
          }
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

      // ---- MAP-LOCAL atmosphere: bright open-sea golden hour — airier than the beach cove,
      // sun high-left, a soft horizon glimmer, a gentler vignette ----
      const warm = new Sprite(Texture.WHITE); warm.tint = 0xffd291; warm.alpha = 0.06; instance.stage.addChild(warm)
      const sun = new Sprite(radial(512, [[0, 'rgba(255,222,160,0.18)'], [0.5, 'rgba(255,210,140,0.06)'], [1, 'rgba(255,210,140,0)']])); sun.anchor.set(0.5); sun.blendMode = 'add'; instance.stage.addChild(sun)
      const horizon = new Sprite(vgradient(256, [[0, 'rgba(255,200,128,0.13)'], [0.55, 'rgba(255,200,128,0.05)'], [1, 'rgba(255,200,128,0)']]))
      horizon.blendMode = 'add'; instance.stage.addChild(horizon)
      const vig = new Sprite(radial(512, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0)'], [0.78, 'rgba(18,14,8,0.24)'], [1, 'rgba(10,7,3,0.6)']])); instance.stage.addChild(vig)
      const resizeFx = (vw: number, vh: number) => {
        warm.width = vw; warm.height = vh
        sun.width = sun.height = Math.max(vw, vh) * 1.5; sun.position.set(vw * 0.3, vh * 0.02)
        horizon.width = vw; horizon.height = vh * 0.22; horizon.position.set(0, 0)
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

// ---- helpers (the beach's) ----
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
function vgradient(size: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = size
  const ctx = cv.getContext('2d')!, g = ctx.createLinearGradient(0, 0, 0, size)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g; ctx.fillRect(0, 0, 8, size)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
function makeShadow() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(40,42,72,0.92)'); g.addColorStop(0.45, 'rgba(40,42,72,0.55)'); g.addColorStop(0.8, 'rgba(40,42,72,0.16)'); g.addColorStop(1, 'rgba(40,42,72,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
