import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js'

// PHASE I-1 — the opening beach, built as a TRUE 2:1 ISOMETRIC tilemap on the same engine that
// renders the campus (HW=32/HH=16 diamonds, level heights, walkable grid, depth-sorted billboard
// props, collision, Thor walking). Sea sits in the far (small tx+ty), a wavy foam shoreline, then
// a sand beach you walk. Palms / rocks / driftwood are upright iso billboards with grounded
// shadows and collision. This replaces the flat front-on backdrop: it is a real isometric, walkable
// beach, the basic floor the whole intro is built on.

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
// smooth value noise in [0,1] for large-scale sand tonal drift (breaks the per-tile grid repeat)
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}

const COLS = 104, ROWS = 104, MARGIN = 32 // big map; Thor is boundary-stopped MARGIN tiles before the edge so the blue void never shows (more beach/sea beyond view)
// shoreline: sea where (tx+ty) is small (far/back), beach in front. A vast ocean: the waterline sits
// near the map's diagonal centre so the sea fills roughly the back half. GENTLE sweep (a steep curve
// quantizes into a sawtooth of tile diamonds and stair-steps the foam band).
const shoreAt = (d: number) => 104 + 10 * Math.sin(d * 0.028) + 5 * Math.sin(d * 0.06 + 1.3)
// Variant pools over the NORMALIZED tiles (water-n/sand-n: every tile recolored to one shared base
// so the runtime ramp owns the value; texture survives as luma deviation). Pools sorted by measured
// busyness (normalize_tiles.py report): calm glass near the shore, textured swell far out.
const SAND_COMMON = [0, 1, 2, 3, 7, 9], SAND_PEBBLE = [8], SAND_RIPPLE = [12, 13, 14, 15]
const W_CALM = [0, 12, 15], W_SOFT = [3, 2, 8], W_TEX = [1, 10, 4, 6], W_SWELL = [13, 14, 11, 9, 7, 5]
// the ocean depth ramp (references: Sea of Stars / Ocean's Heart): glassy waterline aqua ->
// turquoise shallows -> teal -> deep blue-teal -> navy abyss. The ramp IS the ocean's body.
const W_BASE = [205, 235, 229] // shared median of the normalized water tiles
const W_RAMP: [number, number][] = [
  [0.0, 0x9fdccf], [0.1, 0x5ec6ba], [0.22, 0x39aca7], [0.36, 0x27939a],
  [0.52, 0x1b7c8a], [0.72, 0x115a6d], [1.0, 0x0a3f4e],
]
const DEPTH_RANGE = 30 // diagonal tiles from waterline to abyss — the whole drama lives in the visible band
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
// convert a DISPLAY color into the pixi tint that produces it over the normalized base texture
function tintFor(display: number, base: number[]) {
  const r = Math.min(255, Math.round(((display >> 16) & 255) * 255 / base[0]))
  const g = Math.min(255, Math.round(((display >> 8) & 255) * 255 / base[1]))
  const b = Math.min(255, Math.round((display & 255) * 255 / base[2]))
  return (r << 16) | (g << 8) | b
}

// ---- the TIDE: one smooth continuous wave cycle — wash up fast, hold, retract slow, lull ----
const TIDE_T = 9 // seconds per wave
const TIDE_AMP = 1.7 // diagonal tile units a wave washes past the waterline
const SWEEP = 0.028 // seconds of phase lag per shore column — the break sweeps along the beach
// [reach 0..1 up the sand, foam alpha, trail-bubbles alpha]
function tidePhase(u: number): [number, number, number] {
  u = ((u % TIDE_T) + TIDE_T) % TIDE_T
  const trail = Math.max(0, 1 - Math.abs(u - 4.6) / 3.1)
  if (u < 2.2) { const k = u / 2.2, e = 1 - Math.pow(1 - k, 3); return [e, 0.45 + 0.55 * k, trail] }
  if (u < 2.9) return [1, 1, trail]
  if (u < 6.6) { const k = (u - 2.9) / 3.7, e = 0.5 - 0.5 * Math.cos(Math.PI * k); return [1 - e, 1 - 0.8 * k, trail] }
  const k = (u - 6.6) / (TIDE_T - 6.6)
  return [0, 0.2 * (1 - k), trail * (1 - k)]
}
type Cell = 'sea' | 'wet' | 'sand'
function cellAt(tx: number, ty: number): Cell {
  const s = tx + ty, sh = shoreAt(tx - ty)
  if (s < sh) return 'sea'
  if (s < sh + 1.0) return 'wet'
  return 'sand'
}

type PropDef = { tx: number; ty: number; img: string; h: number } // h = target on-screen height in px @ zoom 1
function buildProps(): PropDef[] {
  const out: PropDef[] = []
  const sandOK = (tx: number, ty: number) => tx > 1 && ty > 1 && tx < COLS - 2 && ty < ROWS - 2 && cellAt(tx, ty) === 'sand'
  const add = (tx: number, ty: number, img: string, h: number) => { if (sandOK(tx, ty)) out.push({ tx, ty, img, h }) }
  // left frame: a palm grove framing the left of the play area (visible band)
  for (const [tx, ty, h] of [[10, 24, 188], [7, 21, 168], [13, 30, 200], [9, 34, 176], [5, 27, 150]] as const) add(tx, ty, 'palmB', h)
  add(11, 27, 'grass', 46); add(12, 33, 'rocks', 66); add(8, 30, 'grass', 40); add(14, 36, 'driftwood', 44); add(6, 23, 'grass', 38)
  // right frame: palm grove down the right screen edge (high tx, low ty)
  for (const [tx, ty, h] of [[44, 26, 196], [40, 22, 168], [46, 32, 180], [42, 36, 204], [47, 24, 150]] as const) add(tx, ty, 'palmB', h)
  add(43, 30, 'grass', 46); add(45, 35, 'rocks', 60); add(41, 25, 'grass', 40); add(44, 40, 'driftwood', 44)
  // back headland clusters near the shore corners (enclose the NE/NW)
  add(20, 13, 'rocks', 78); add(18, 12, 'palmB', 150); add(22, 15, 'grass', 42)
  add(33, 18, 'rocks', 74); add(35, 17, 'palmB', 150); add(31, 19, 'grass', 42)
  // mid-beach FOCAL ANCHOR: the boulder cluster (panther-rock placeholder)
  add(27, 24, 'rocks', 104); add(24, 26, 'grass', 50); add(30, 26, 'driftwood', 50); add(28, 21, 'grass', 38)
  // scattered grouped detail on the open sand (never single)
  add(18, 34, 'grass', 44); add(20, 36, 'grass', 36); add(19, 38, 'driftwood', 42)
  add(34, 32, 'grass', 44); add(36, 34, 'grass', 36); add(38, 30, 'driftwood', 42)
  add(28, 40, 'grass', 42); add(30, 42, 'grass', 36)
  // reeds + grass lining the wet shoreline: walk the first sand row behind the foam at each column
  for (let tx = 4; tx < COLS - 4; tx++) {
    for (let ty = 4; ty < ROWS - 4; ty++) {
      if (cellAt(tx, ty) === 'sand' && cellAt(tx, ty - 1) !== 'sand') {
        if (hash(tx * 2.1, ty) > 0.62) out.push({ tx, ty, img: 'reeds', h: 40 + hash(tx, ty) * 14 })
        else if (hash(tx, ty * 1.7) > 0.7) add(tx, ty, 'grass', 34)
        break
      }
    }
  }
  return out
}

const PROP_SRC: Record<string, string> = {
  palmB: '/art/intro/palm-b.png', rocks: '/art/intro/rocks.png',
  driftwood: '/art/intro/driftwood.png', grass: '/art/intro/grass.png', reeds: '/art/iso/props/reeds.png',
}

export default function BeachIso() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let app: Application | null = null, destroyed = false
    const keys: Record<string, boolean> = {}
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    const start = async () => {
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const instance = new Application()
      await instance.init({ background: 0x0a3f4e, antialias: false, resizeTo: ref.current ?? window }) // abyss = the deep end of the ramp, so off-map sea blends
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance; ref.current.appendChild(instance.canvas)
      const ZOOM = 1.15 // BEACH-LOCAL zoom (Thor reads bigger; each map sets its own)

      const tex: Record<string, Texture> = {}
      const load = async (k: string, u: string) => { try { tex[k] = await Assets.load(u) } catch { /* */ } }
      await Promise.all([
        load('sand', '/art/iso/sand.png'), load('water', '/art/iso/water.png'), load('water2', '/art/iso/water2.png'),
        load('foamlace', '/art/intro/foam-lace.png'), load('foamlace2', '/art/intro/foam-lace2.png'),
        load('foamtrail', '/art/intro/foam-trail.png'), load('sparkle', '/art/intro/sparkle.png'),
        load('skirt', '/art/intro/shallow-skirt.png'),
        ...Object.entries(PROP_SRC).map(([k, u]) => load(k, u)),
      ])
      const idle: Record<string, Texture> = {}
      await Promise.all(dirs8.map((d) => load('idle_' + d, `/art/characters/thor/walk/${d}/0.png`).then(() => { idle[d] = tex['idle_' + d] })))
      const walk: Record<string, Texture[]> = {}
      await Promise.all(dirs8.map(async (d) => {
        try { walk[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`))) } catch { /* */ }
      }))
      // 16 NORMALIZED PixelLab variant tiles each for sand + water (shared base color; the
      // depth ramp tints them so adjacent tiles are continuous by construction)
      const sandV: Texture[] = [], waterV: Texture[] = []
      await Promise.all([
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-n/${i}.png`).then((t) => { sandV[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/water-n/${i}.png`).then((t) => { waterV[i] = t }).catch(() => {})),
      ])
      if (destroyed) { instance.destroy(true); return }

      const world = new Container(); world.scale.set(ZOOM); world.sortableChildren = true
      instance.stage.addChild(world)
      const grade = new ColorMatrixFilter()
      // BEACH-LOCAL grade: smooth warm TROPICAL wash, not a hard golden-hour (the sand is already
      // brownish, so keep contrast low). Soft, slightly desaturated for a nostalgic film look.
      grade.brightness(0.99, false); grade.saturate(-0.05, true); grade.contrast(-0.01, true)
      const wm = grade.matrix; wm[0] *= 1.045; wm[12] *= 0.94; grade.matrix = wm
      world.filters = [grade]

      // ---- ground: iso diamond tiles, sea -> wet -> sand. ONE body of water: a smooth depth
      // ramp carries the value; normalized variant tiles carry only micro-texture; broad value-
      // noise patches drift the surface so nothing bands or checkers. ----
      const SAND_BASE = [246, 229, 180]
      const waterSprites: { sp: Sprite; ph: number; ph2: number; base: number; amp: number; shoreD?: number }[] = []
      const walkable: boolean[][] = []
      for (let ty = 0; ty < ROWS; ty++) {
        walkable[ty] = []
        for (let tx = 0; tx < COLS; tx++) {
          const c = cellAt(tx, ty)
          walkable[ty][tx] = c === 'sand'
          const isSea = c === 'sea'
          const ds = (tx + ty) - shoreAt(tx - ty) // signed diagonal distance from the waterline (+ = onto land)
          let base: Texture | undefined
          if (isSea) {
            // depth in [0,1], DITHERED per tile so the ramp steps interleave instead of banding
            // (stronger dither in the shallows where each tile row would otherwise read as a step)
            const raw = -ds / DEPTH_RANGE
            const dep = Math.min(1, Math.max(0, raw + (hash(tx * 7.7, ty * 5.3) - 0.5) * (raw < 0.18 ? 0.11 : 0.06)))
            const h = hash(tx * 1.3, ty * 2.7)
            const pool = dep < 0.1 ? W_CALM
              : dep < 0.3 ? (h < 0.6 ? W_CALM : W_SOFT)
                : dep < 0.55 ? (h < 0.5 ? W_SOFT : W_TEX)
                  : (h < 0.55 ? W_TEX : W_SWELL)
            base = waterV[pool[Math.floor(hash(tx * 3.1, ty * 1.9) * pool.length)]] ?? tex['water']
          } else {
            const h = hash(tx * 2.1, ty * 1.7)
            const pool = c === 'sand' && h > 0.985 ? SAND_PEBBLE
              : c === 'sand' && ds > 12 && h < 0.03 ? SAND_RIPPLE // wind-ripple texture, sparse, upper beach only
                : SAND_COMMON
            base = sandV[pool[Math.floor(hash(tx * 3.3, ty * 4.1) * pool.length)]] ?? tex['sand']
          }
          if (!base) continue
          const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
          const fx = hash(tx * 3, ty * 7) > 0.5 ? -1 : 1
          const os = isSea ? 1.12 : 1.04   // oversize sea tiles a bit so they overlap and blend (soften the grid)
          sp.scale.set(fx * os, os)
          sp.position.set(isoX(tx, ty), isoY(tx, ty)); sp.zIndex = (tx + ty) * 16
          if (isSea) {
            const raw = -ds / DEPTH_RANGE
            const dep = Math.min(1, Math.max(0, raw + (hash(tx * 7.7, ty * 5.3) - 0.5) * (raw < 0.18 ? 0.11 : 0.06)))
            // broad drifting patches (cloud-light) + faint per-tile grain, all riding the one ramp
            const patch = 0.965 + 0.07 * vnoise(tx / 16 + 7, ty / 16 + 2)
            const grain = 0.994 + 0.012 * hash(tx, ty)
            const col = shadeHex(tintFor(rampAt(W_RAMP, dep), W_BASE), patch * grain)
            sp.tint = col
            waterSprites.push({
              sp, base: col,
              ph: (tx + ty) * 0.5 + 0.35 * Math.sin((tx - ty) * 0.18), // swell front, wobbled along the shore axis
              ph2: (tx + ty) * 0.21 - (tx - ty) * 0.07,
              amp: 0.022 + 0.055 * dep, // calm at the shore, rolling out deep
              shoreD: ds > -2.5 ? tx - ty : undefined, // waterline rows surge with the tide
            })
          } else if (c === 'wet') {
            // permanently damp band right at the waterline (the smooth wet SHEET rides above it)
            sp.tint = tintFor(shadeHex(0xc3a877, 0.985 + 0.03 * hash(tx, ty)), SAND_BASE)
          } else {
            // dry sand: warm near the water -> pale high beach, with broad dune drift
            const t = Math.min(1, Math.max(0, (ds - 1.6) / 26))
            const dune = 0.965 + 0.055 * vnoise(tx / 16 + 3, ty / 16 + 5)
            const grain = 0.994 + 0.012 * hash(tx * 1.3, ty * 2.1)
            sp.tint = shadeHex(tintFor(rampAt([[0, 0xdcbf87], [0.45, 0xe9d5a2], [1, 0xf3e4b5]], t), SAND_BASE), dune * grain)
          }
          world.addChild(sp)
        }
      }

      // ---- the FOAM BAND: two staggered wave fronts, each a continuous row of 32px segments
      // sliced from a seamless-x PixelLab lace strip, riding the smooth shore curve. The whole
      // band slides up the sand and retracts with the tide; trailing bubbles dissolve behind it. ----
      const trailT = tex['foamtrail']
      const dMin = -88, dMax = 88
      // WATERLINE SKIRT: a static band of glassy shallow water hugging the exact smooth shore
      // curve at sub-tile precision — it buries the hard diamond zigzag where sea tiles meet sand.
      const skirtSegs: { sp: Sprite; d: number }[] = []
      // the WET SHEET: a smooth dark band recording how far up the sand recent waves reached,
      // drying (fading) over seconds — sub-tile, so no diamond teeth along the swash zone
      const wetSegs: { sp: Sprite; d: number; reach: number; at: number }[] = []
      if (tex['skirt']) {
        const skT = tex['skirt']
        for (let d = dMin; d <= dMax; d++) {
          const fr = new Rectangle(((d - dMin) * 32) % Math.max(32, skT.width - 32), 0, 32, skT.height)
          const s = shoreAt(d)
          const wp = new Sprite(new Texture({ source: skT.source, frame: fr }))
          wp.anchor.set(0.5, 0); wp.position.set(d * HW, s * HH - 4)
          wp.tint = 0x6e563c; wp.alpha = 0; wp.zIndex = s * 16 + 1
          world.addChild(wp); wetSegs.push({ sp: wp, d, reach: 0, at: -99 })
          const sp = new Sprite(new Texture({ source: skT.source, frame: fr }))
          sp.anchor.set(0.5, 0.62); sp.scale.set(1, 2) // tall enough to straddle the tile staircase
          sp.position.set(d * HW, s * HH); sp.zIndex = s * 16 + 2; sp.alpha = 0.85
          world.addChild(sp); skirtSegs.push({ sp, d })
          // a feather row seaward of the waterline softens the pale-shallow tile steps
          const f2 = new Sprite(new Texture({ source: skT.source, frame: fr }))
          f2.anchor.set(0.5, 0.62); f2.scale.set(1, 2.4)
          f2.position.set(d * HW, (s - 0.85) * HH); f2.zIndex = (s - 0.85) * 16 + 2; f2.alpha = 0.4
          world.addChild(f2)
        }
      }
      type FoamSeg = { sp: Sprite; d: number; jit: number }
      const fronts: { segs: FoamSeg[]; trail: FoamSeg[]; film: FoamSeg[]; off: number }[] = []
      if (tex['foamlace']) {
        for (let f = 0; f < 2; f++) {
          const laceT = (f === 1 && tex['foamlace2']) ? tex['foamlace2'] : tex['foamlace'] // fronts alternate lace variants
          const segs: FoamSeg[] = [], trailSegs: FoamSeg[] = [], filmSegs: FoamSeg[] = []
          for (let d = dMin; d <= dMax; d++) {
            const jit = (hash(d * 3.3, f * 7.1) - 0.5) * 4 // static y jitter hides the 32px slice edges
            // the water FILM: a thin translucent sheet stretching from the waterline to the foam
            // front, so a washed-up wave stays CONNECTED to the sea instead of a dry white line
            if (tex['skirt']) {
              const skT = tex['skirt']
              const frF = new Rectangle(((d - dMin) * 32 + f * 96) % Math.max(32, skT.width - 32), 0, 32, skT.height)
              const fp = new Sprite(new Texture({ source: skT.source, frame: frF }))
              fp.anchor.set(0.5, 1); fp.position.set(d * HW, shoreAt(d) * HH); fp.alpha = 0
              world.addChild(fp); filmSegs.push({ sp: fp, d, jit })
            }
            const fr = new Rectangle(((d - dMin) * 32 + f * 160) % Math.max(32, laceT.width - 32), 0, 32, laceT.height)
            const sp = new Sprite(new Texture({ source: laceT.source, frame: fr }))
            sp.anchor.set(0.5, 0.84) // scalloped leading edge rides just below the front line
            sp.position.set(d * HW, shoreAt(d) * HH); sp.alpha = 0
            world.addChild(sp); segs.push({ sp, d, jit })
            if (trailT && d % 2 === 0) {
              const fw = Math.min(64, trailT.width)
              const fr2 = new Rectangle(((d - dMin) * 24) % Math.max(32, trailT.width - fw), 0, fw, trailT.height)
              const tp = new Sprite(new Texture({ source: trailT.source, frame: fr2 }))
              tp.anchor.set(0.5, 0.6); tp.position.set(d * HW, shoreAt(d) * HH); tp.alpha = 0
              world.addChild(tp); trailSegs.push({ sp: tp, d, jit })
            }
          }
          fronts.push({ segs, trail: trailSegs, film: filmSegs, off: (f * TIDE_T) / 2 })
        }
      }
      // sun glints twinkling on the open water, denser toward the sun (upper-left of the sea)
      const sparkles: { sp: Sprite; ph: number; sc: number }[] = []
      if (tex['sparkle']) {
        for (let i = 0; i < 64; i++) {
          const d = -80 + hash(i * 3.7, i) * 160
          const back = 3 + hash(i, i * 1.9) * 26 // diagonal units seaward of the waterline
          const s = shoreAt(d) - back
          const sp = new Sprite(tex['sparkle']); sp.anchor.set(0.5)
          const sc = 0.4 + hash(i * 7, i * 2) * 0.5
          sp.scale.set(sc); sp.position.set(d * HW, s * HH); sp.zIndex = s * 16 + 2
          sp.alpha = 0; sp.blendMode = 'add'
          world.addChild(sp); sparkles.push({ sp, ph: hash(i, i * 5) * 20, sc })
        }
      }

      // (ground decals + decorative props are stripped during the terrain phase — focus is on making
      // the sand + ocean themselves read at the bar before anything is placed.)
      void makeFleck
      const shadowTex = makeShadow()
      const blocked = new Set<string>()
      for (const p of [] as PropDef[]) {
        const t = tex[p.img]; if (!t) continue
        const x = isoX(p.tx, p.ty), y = isoY(p.tx, p.ty), z = (p.tx + p.ty) * 16
        const sc = p.h / t.height
        const sh = new Sprite(shadowTex); sh.anchor.set(0.5, 0.5); sh.width = Math.max(18, t.width * sc * 0.66); sh.height = sh.width * 0.42
        sh.alpha = 0.32; sh.position.set(x, y); sh.zIndex = z + 1; world.addChild(sh)
        const sp = new Sprite(t); sp.anchor.set(0.5, 0.94); sp.scale.set(sc); sp.position.set(x, y); sp.zIndex = z + 8
        world.addChild(sp)
        blocked.add(Math.round(p.tx) + ',' + Math.round(p.ty))
        if (p.h > 120) blocked.add(Math.round(p.tx) + ',' + Math.round(p.ty + 1)) // tall trunks block one deeper too
      }

      // ---- Thor ----
      const thor = new Sprite(idle['south'] ?? tex['sand']); thor.anchor.set(0.5, 0.9); thor.scale.set(0.62)
      thor.zIndex = 0; world.addChild(thor)
      void buildProps
      const pos = { tx: 61, ty: 61 }; let facing = 'south', at = 0

      const walkableAt = (tx: number, ty: number) => {
        const x = Math.round(tx), y = Math.round(ty)
        if (x < MARGIN || y < MARGIN || x > COLS - MARGIN || y > ROWS - MARGIN) return false // invisible boundary, well inside the map edge
        return walkable[y][x] && !blocked.has(x + ',' + y)
      }

      instance.ticker.add((tk) => {
        const dt = tk.deltaTime
        let dx = 0, dy = 0
        if (keys['w'] || keys['arrowup']) dy -= 1
        if (keys['s'] || keys['arrowdown']) dy += 1
        if (keys['a'] || keys['arrowleft']) dx -= 1
        if (keys['d'] || keys['arrowright']) dx += 1
        const moving = dx || dy
        if (moving) {
          const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, sp = 0.075 * dt
          const ntx = pos.tx + ux * sp, nty = pos.ty + uy * sp
          if (walkableAt(ntx + Math.sign(ux) * 0.25, pos.ty)) pos.tx = ntx
          if (walkableAt(pos.tx, nty + Math.sign(uy) * 0.25)) pos.ty = nty
          facing = dirFromAngle(isoX(dx, dy), (dx + dy) * HH)
        }
        const x = isoX(pos.tx, pos.ty), y = isoY(pos.tx, pos.ty)
        thor.position.set(x, y); thor.zIndex = Math.floor(pos.tx + pos.ty) * 16 + 12
        at += tk.deltaMS
        const wf = walk[facing] ?? walk[cardinalOf(facing)]
        thor.texture = (moving && wf) ? wf[Math.floor(at / 110) % wf.length] : (idle[facing] ?? idle['south'] ?? thor.texture)
        // camera follow
        const vw = instance.renderer.width, vh = instance.renderer.height
        // follow Thor, biased down so the vast ocean fills the frame above him
        world.x = vw / 2 - x * ZOOM; world.y = vh * 0.64 - y * ZOOM
        // FLOWING WATER: brightness swells TRAVEL shoreward across the pixel tiles (phase runs
        // along tx+ty, i.e. down-screen toward the beach) with a slower crossing wave underneath,
        // so the sea reads as rolling toward the sand — no shader, the tiles Ashwath likes.
        const wt = performance.now() / 1000
        const reachOf = (d: number) => {
          let m = 0
          for (const fr of fronts) { const r = tidePhase(wt - fr.off - d * SWEEP)[0]; if (r > m) m = r }
          return m
        }
        for (const w of waterSprites) {
          let fct = 1 + w.amp * (Math.sin(w.ph - wt * 1.05) + 0.55 * Math.sin(w.ph2 - wt * 0.42 + 1.7))
          if (w.shoreD !== undefined) fct *= 1 + 0.1 * reachOf(w.shoreD) // the shallows surge as a wave launches
          w.sp.tint = shadeHex(w.base, fct)
        }
        // THE TIDE: fronts sweep along the beach (per-column phase lag), wash up, hold, retract
        for (const fr of fronts) {
          for (const seg of fr.segs) {
            const [reach, foamA] = tidePhase(wt - fr.off - seg.d * SWEEP)
            const s = shoreAt(seg.d) + reach * TIDE_AMP + 0.1 * Math.sin(seg.d * 0.7 + wt * 1.4)
            seg.sp.position.y = s * HH + seg.jit
            seg.sp.zIndex = s * 16 + 6
            seg.sp.alpha = foamA * 0.9
          }
          for (const seg of fr.film) {
            const [reach, foamA] = tidePhase(wt - fr.off - seg.d * SWEEP)
            const sShore = shoreAt(seg.d)
            const s = sShore + reach * TIDE_AMP
            const gap = (s - sShore) * HH + 6
            seg.sp.position.y = s * HH + seg.jit - 2
            seg.sp.scale.y = gap / seg.sp.texture.height
            seg.sp.zIndex = s * 16 + 5
            seg.sp.alpha = 0.4 * foamA * Math.min(1, reach * 3)
          }
          for (const seg of fr.trail) {
            const [reach, , trailA] = tidePhase(wt - fr.off - seg.d * SWEEP)
            const s = shoreAt(seg.d) + TIDE_AMP * (0.5 + 0.3 * reach)
            seg.sp.position.y = s * HH + seg.jit; seg.sp.zIndex = s * 16 + 5
            seg.sp.alpha = trailA * 0.45
          }
        }
        // the waterline itself breathes a little
        for (const sk of skirtSegs) sk.sp.position.y = (shoreAt(sk.d) + 0.06 * Math.sin(wt * 0.9 + sk.d * 0.3)) * HH
        // wet-sand memory: the sheet stretches to the furthest recent reach, then dries away
        for (const w of wetSegs) {
          const r = reachOf(w.d)
          if (r >= w.reach) { w.reach = r; w.at = wt }
          const dry = Math.min(1, Math.max(0, (wt - w.at) / 7))
          if (dry >= 1) w.reach = Math.min(w.reach, r)
          const gap = w.reach * TIDE_AMP * HH + 8
          w.sp.scale.y = gap / w.sp.texture.height
          w.sp.alpha = 0.5 * (1 - dry * dry) + 0.1
        }
        // sparkles twinkle on a slow individual clock
        for (const s of sparkles) {
          const k = Math.max(0, Math.sin(wt * 0.9 + s.ph) - 0.55) / 0.45
          s.sp.alpha = k * 0.85
          s.sp.scale.set(s.sc * (0.7 + 0.3 * k))
        }
        resizeFx(vw, vh)
      })

      // ---- golden-hour atmosphere: a warm low sun glow + a broad warm horizon haze + a soft warm
      // vignette, layered over the composited world so the beach feels dreamy and sun-soaked. ----
      // BEACH-LOCAL atmosphere, now actually visible: a full-screen warm tropical tint for cohesive
      // warmth, a soft golden sun glow upper-left, and a real (but warm + soft, not black) cinematic
      // vignette framing the scene.
      const warm = new Sprite(Texture.WHITE); warm.tint = 0xffcb82; warm.alpha = 0.13; instance.stage.addChild(warm)
      const sun = new Sprite(radial(512, [[0, 'rgba(255,224,166,0.17)'], [0.5, 'rgba(255,214,150,0.05)'], [1, 'rgba(255,214,150,0)']])); sun.anchor.set(0.5); sun.blendMode = 'add'; instance.stage.addChild(sun)
      const vig = new Sprite(radial(512, [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,0)'], [0.72, 'rgba(30,19,8,0.34)'], [1, 'rgba(16,9,3,0.78)']])); instance.stage.addChild(vig)
      const resizeFx = (vw: number, vh: number) => {
        warm.width = vw; warm.height = vh
        sun.width = sun.height = Math.max(vw, vh) * 1.4; sun.position.set(vw * 0.42, vh * 0.02)
        vig.width = vw * 1.5; vig.height = vh * 1.5; vig.position.set(-vw * 0.25, -vh * 0.25)
      }
      resizeFx(instance.renderer.width, instance.renderer.height)

      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    }

    start().catch((err) => { console.error('[BeachIso] failed', err) })
    return () => { destroyed = true; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); if (app) app.destroy(true, { children: true }) }
  }, [])
  return <div ref={ref} style={{ position: 'fixed', inset: 0, background: '#0a3f4e' }} />
}

// ---- helpers ----
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
function makeFleck(a: number, b: number) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 12
  const ctx = cv.getContext('2d')!
  const hx = (h: number) => '#' + h.toString(16).padStart(6, '0')
  ctx.fillStyle = hx(b); ctx.beginPath(); ctx.ellipse(6, 7, 4, 2.4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = hx(a); ctx.beginPath(); ctx.ellipse(6, 6, 3.4, 2, 0, 0, Math.PI * 2); ctx.fill()
  const t = Texture.from(cv); t.source.scaleMode = 'nearest'; return t
}
function makeShadow() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(20,40,36,0.55)'); g.addColorStop(0.7, 'rgba(20,40,36,0.18)'); g.addColorStop(1, 'rgba(20,40,36,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
