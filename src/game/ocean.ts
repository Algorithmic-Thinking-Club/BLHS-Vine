// THE OCEAN — the game's shared water system, extracted VERBATIM from BeachIso.tsx (2026-07-02).
// This is the transport layer every map sails on: the beach imports it, the island map imports it,
// every future map imports it. It is never re-implemented (STATE-OF-PLAY §3: enhance, don't replace).
//
// What lives here (all values byte-identical to the beach the day of extraction):
//   - the 16 NORMALIZED water variant tiles (water-n/: shared base color, texture as luma deviation)
//   - the depth ramp W_RAMP (glassy waterline aqua -> turquoise -> teal -> navy abyss) + the
//     depth-keyed dither that kills ramp banding without re-introducing the diamond checker
//   - traveling swell brightness waves (phase along tx+ty with a slower crossing wave)
//   - the AERIAL PERSPECTIVE veil (world-space canvas sliced per s-row so depth sorting stays honest)
//   - the TIDE: two staggered foam-lace fronts + water film + trail bubbles + waterline skirt/seam +
//     the wet-sand memory sheet, all riding the map's smooth shore curve at sub-tile precision
//   - sun glints twinkling on the open water
//
// Geometry is the CALLER's: every builder takes the map's own shoreAt(d) curve (and the tile loop
// passes ds = signed diagonal distance from the waterline), so the beach keeps its cove and the
// island map feeds its own coast while the water itself stays the same water.

import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js'

// ---- the 2:1 iso metric every map shares ----
export const HW = 32, HH = 16
export const isoX = (tx: number, ty: number) => (tx - ty) * HW
export const isoY = (tx: number, ty: number) => (tx + ty) * HH

// ---- shared value math (the water's texture and drift are built on these) ----
export const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return s - Math.floor(s) }
// smooth value noise in [0,1] for large-scale tonal drift (breaks the per-tile grid repeat)
export function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}
export function shadeHex(hex: number, f: number) {
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f)
  return (r << 16) | (g << 8) | b
}
export function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  return ((ar + (br - ar) * t) << 16) | ((ag + (bg - ag) * t) << 8) | (ab + (bb - ab) * t) | 0
}
export function rampAt(stops: [number, number][], t: number) {
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
export function tintFor(display: number, base: number[]) {
  const r = Math.min(255, Math.round(((display >> 16) & 255) * 255 / base[0]))
  const g = Math.min(255, Math.round(((display >> 8) & 255) * 255 / base[1]))
  const b = Math.min(255, Math.round((display & 255) * 255 / base[2]))
  return (r << 16) | (g << 8) | b
}

// ---- the water's body ----
// Variant pools over the NORMALIZED tiles, sorted by measured busyness (normalize_tiles.py
// report): calm glass near the shore, textured swell far out.
export const W_CALM = [0, 12, 15], W_SOFT = [3, 2, 8], W_TEX = [1, 10, 4, 6], W_SWELL = [13, 14, 11, 9, 7, 5]
// the ocean depth ramp (references: Sea of Stars / Ocean's Heart): glassy waterline aqua ->
// turquoise shallows -> teal -> deep blue-teal -> navy abyss. The ramp IS the ocean's body.
export const W_BASE = [205, 235, 229] // shared median of the normalized water tiles
// a distinct pale-turquoise SHALLOW SHELF hugs the coast (plateau near 0), then the floor drops:
// deep-shadow water against bright foam is the value contrast the references live on
export const W_RAMP: [number, number][] = [
  [0.0, 0xa8e2d2], [0.09, 0x8ed8c6], [0.14, 0x4dbcb2], [0.24, 0x35a5a2],
  [0.38, 0x24909a], [0.54, 0x187a89], [0.68, 0x0f586c], [1.0, 0x073442],
]
export const DEPTH_RANGE = 30 // diagonal tiles from waterline to abyss — the whole drama lives in the visible band

// ---- the TIDE: one smooth continuous wave cycle — wash up fast, hold, retract slow, lull ----
export const TIDE_T = 9 // seconds per wave
export const TIDE_AMP = 1.7 // diagonal tile units a wave washes past the waterline
export const SWEEP = 0.028 // seconds of phase lag per shore column — the break sweeps along the beach
// [reach 0..1 up the sand, foam alpha, trail-bubbles alpha]
export function tidePhase(u: number): [number, number, number] {
  u = ((u % TIDE_T) + TIDE_T) % TIDE_T
  const trail = Math.max(0, 1 - Math.abs(u - 4.6) / 3.1)
  if (u < 2.2) { const k = u / 2.2, e = 1 - Math.pow(1 - k, 3); return [e, 0.45 + 0.55 * k, trail] }
  if (u < 2.9) return [1, 1, trail]
  if (u < 6.6) { const k = (u - 2.9) / 3.7, e = 0.5 - 0.5 * Math.cos(Math.PI * k); return [1 - e, 1 - 0.8 * k, trail] }
  const k = (u - 6.6) / (TIDE_T - 6.6)
  return [0, 0.2 * (1 - k), trail * (1 - k)]
}

// the 16 normalized water variants (the tiles Ash likes; the ramp tints them so adjacent tiles
// are continuous by construction)
export async function loadWaterVariants(): Promise<Texture[]> {
  const waterV: Texture[] = []
  await Promise.all(Array.from({ length: 16 }, (_, i) =>
    Assets.load(`/art/intro/water-n/${i}.png`).then((t: Texture) => { waterV[i] = t }).catch(() => {})))
  return waterV
}

export type SwellSprite = { sp: Sprite; ph: number; ph2: number; base: number; amp: number; shoreD?: number }

// ONE sea tile: depth-ramp tint + micro-texture variant + swell phases. ds = signed diagonal
// distance from the waterline (negative out to sea). The caller owns the loop and the geometry.
export function seaTile(world: Container, tx: number, ty: number, ds: number, waterV: Texture[], fallback: Texture | undefined, out: SwellSprite[]) {
  // depth in [0,1], DITHERED per tile so the ramp steps interleave instead of banding.
  // The dither is DEPTH-KEYED: strong on the shallow plateau (flat ramp, banding risk,
  // cheap dither), near-zero through the lit mid-band where the ramp is STEEP — there
  // a +-0.04 dep dither was +-10 luma per tile, i.e. the visible diamond checker
  const raw = -ds / DEPTH_RANGE
  const dAmp = raw < 0.14 ? 0.1 : raw < 0.55 ? 0.022 : 0.05
  const dep = Math.min(1, Math.max(0, raw + (hash(tx * 7.7, ty * 5.3) - 0.5) * dAmp))
  const h = hash(tx * 1.3, ty * 2.7)
  const pool = dep < 0.1 ? W_CALM
    : dep < 0.3 ? (h < 0.6 ? W_CALM : W_SOFT)
      : dep < 0.55 ? (h < 0.5 ? W_SOFT : W_TEX)
        : (h < 0.55 ? W_TEX : W_SWELL)
  const base = waterV[pool[Math.floor(hash(tx * 3.1, ty * 1.9) * pool.length)]] ?? fallback
  if (!base) return
  const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
  // mirror tiles in COHERENT PATCHES (not per-tile random) — random flips make an X-checker
  const fx = vnoise(tx / 7 + 4, ty / 7 + 11) > 0.5 ? -1 : 1
  sp.scale.set(fx * 1.12, 1.12) // oversize so tiles overlap and blend (soften the grid)
  sp.position.set(isoX(tx, ty), isoY(tx, ty)); sp.zIndex = (tx + ty) * 16
  // broad drifting patches (cloud-light) — NO per-tile grain (any per-tile value step
  // reads as a checkerboard at distance; the ramp + patches carry all variation)
  const patch = 0.955 + 0.09 * vnoise(tx / 22 + 7, ty / 22 + 2)
  const grain = 0.997 + 0.006 * hash(tx, ty)
  const col = shadeHex(tintFor(rampAt(W_RAMP, dep), W_BASE), patch * grain)
  sp.tint = col
  world.addChild(sp)
  out.push({
    sp, base: col,
    ph: (tx + ty) * 0.5 + 0.35 * Math.sin((tx - ty) * 0.18), // swell front, wobbled along the shore axis
    ph2: (tx + ty) * 0.21 - (tx - ty) * 0.07,
    amp: 0.022 + 0.055 * dep, // calm at the shore, rolling out deep
    shoreD: ds > -2.5 ? tx - ty : undefined, // waterline rows surge with the tide
  })
}

// ---- AERIAL PERSPECTIVE WASH: the far field flattens toward the abyss so the per-tile
// texture (and any hint of the diamond lattice) dissolves with distance, the way the
// reference oceans read. One world-space canvas follows the exact shore-depth math, then
// gets sliced into a strip per s-row so depth sorting stays honest: sea props and boats
// keep a waterline immersion on their bottom rows, towers above it stay untouched. ----
export function buildAerialVeil(world: Container, o: { x0: number; spanPx: number; sMax: number; shoreAt: (d: number) => number; res?: number }) {
  const RES = o.res ?? 4 // world px per canvas px (a veil, not detail — low res is free)
  const x0 = o.x0, cw = Math.ceil(o.spanPx / RES), sMax = o.sMax, ch = Math.ceil((sMax * HH) / RES)
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
  const g = cv.getContext('2d')!
  const img = g.createImageData(cw, ch)
  const px = img.data
  const shoreCol: number[] = []
  for (let cx = 0; cx < cw; cx++) shoreCol[cx] = o.shoreAt((x0 + (cx + 0.5) * RES) / HW)
  const rowMaxA: number[] = []
  for (let cy = 0; cy < ch; cy++) {
    const wy = (cy + 0.5) * RES, s = wy / HH
    let maxA = 0
    for (let cx = 0; cx < cw; cx++) {
      const dep = Math.min(1, (shoreCol[cx] - s) / DEPTH_RANGE)
      let a = 0
      if (dep > 0.09) {
        const k = Math.min(1, (dep - 0.09) / 0.48)
        a = 0.5 * k * k * (3 - 2 * k) // smoothstep body
        // the abyss flattens FULLY: at the frame's top edge the sea resolves into one
        // deep body (no tile rows dying unresolved against the map edge)
        if (dep > 0.78) { const kk = Math.min(1, (dep - 0.78) / 0.22); a += 0.24 * kk * kk }
        // huge slow value clouds break any residual regularity in the veil itself
        const wx = x0 + (cx + 0.5) * RES
        a *= 0.86 + 0.28 * vnoise(wx / 1250 + 3.2, wy / 720 + 8.1)
      }
      if (a > 0) {
        const col = rampAt(W_RAMP, Math.min(1, dep + 0.1))
        const oo = (cy * cw + cx) * 4
        px[oo] = (col >> 16) & 255; px[oo + 1] = (col >> 8) & 255; px[oo + 2] = col & 255
        px[oo + 3] = Math.round(a * 255)
        if (a > maxA) maxA = a
      }
    }
    rowMaxA[cy] = maxA
  }
  g.putImageData(img, 0, 0)
  const washT = Texture.from(cv)
  washT.source.scaleMode = 'linear' // a veil wants to stay smooth, not chunk at 4x
  const rowsPerS = HH / RES
  for (let s = 0; s < sMax; s++) {
    const cy0 = s * rowsPerS
    let live = false
    for (let r = 0; r < rowsPerS; r++) if (rowMaxA[cy0 + r] > 0) { live = true; break }
    if (!live) continue
    const strip = new Sprite(new Texture({ source: washT.source, frame: new Rectangle(0, cy0, cw, rowsPerS) }))
    strip.position.set(x0, s * HH); strip.scale.set(RES, RES)
    strip.zIndex = s * 16 + 18 // over this band's own tile rows, under the props in front
    world.addChild(strip)
  }
}

// ---- the FOAM BAND: two staggered wave fronts, each a continuous row of 32px segments
// sliced from a seamless-x PixelLab lace strip, riding the smooth shore curve. The whole
// band slides up the sand and retracts with the tide; trailing bubbles dissolve behind it. ----
export type FoamSeg = { sp: Sprite; d: number; jit: number; alt?: Texture[]; altRun?: boolean[]; cy?: number }
export type Front = { segs: FoamSeg[]; trail: FoamSeg[]; film: FoamSeg[]; off: number }
export type SkirtSeg = { sp: Sprite; d: number }
export type WetSeg = { sp: Sprite; d: number; reach: number; at: number }

export function buildShoreFoam(
  world: Container,
  t: { skirt?: Texture; foamlace?: Texture; foamlace2?: Texture; foamtrail?: Texture },
  o: { shoreAt: (d: number) => number; dMin: number; dMax: number },
): { skirtSegs: SkirtSeg[]; wetSegs: WetSeg[]; fronts: Front[] } {
  const { shoreAt, dMin, dMax } = o
  const trailT = t.foamtrail
  // WATERLINE SKIRT: a static band of glassy shallow water hugging the exact smooth shore
  // curve at sub-tile precision — it buries the hard diamond zigzag where sea tiles meet sand.
  const skirtSegs: SkirtSeg[] = []
  // the WET SHEET: a smooth dark band recording how far up the sand recent waves reached,
  // drying (fading) over seconds — sub-tile, so no diamond teeth along the swash zone
  const wetSegs: WetSeg[] = []
  if (t.skirt) {
    const skT = t.skirt
    for (let d = dMin; d <= dMax; d++) {
      const fr = new Rectangle(((d - dMin) * 32) % Math.max(32, skT.width - 32), 0, 32, skT.height)
      const s = shoreAt(d)
      const wp = new Sprite(new Texture({ source: skT.source, frame: fr }))
      wp.anchor.set(0.5, 0); wp.position.set(d * HW, s * HH - 4)
      wp.tint = 0x584430; wp.alpha = 0; wp.zIndex = s * 16 + 1
      world.addChild(wp); wetSegs.push({ sp: wp, d, reach: 0, at: -99 })
      // crisp dark seam right AT the waterline — the deep-value line the shore sits against
      const seam = new Sprite(new Texture({ source: skT.source, frame: fr }))
      seam.anchor.set(0.5, 0.3); seam.scale.set(1, 0.55); seam.tint = 0x113238
      seam.alpha = 0.5; seam.position.set(d * HW, s * HH - 1); seam.zIndex = s * 16 + 1
      world.addChild(seam)
      const sp = new Sprite(new Texture({ source: skT.source, frame: fr }))
      sp.anchor.set(0.5, 0.62); sp.scale.set(1, 2) // tall enough to straddle the tile staircase
      sp.position.set(d * HW, s * HH); sp.zIndex = s * 16 + 2; sp.alpha = 0.92
      world.addChild(sp); skirtSegs.push({ sp, d })
      // a feather row seaward of the waterline softens the pale-shallow tile steps
      const f2 = new Sprite(new Texture({ source: skT.source, frame: fr }))
      f2.anchor.set(0.5, 0.62); f2.scale.set(1, 2.4)
      f2.position.set(d * HW, (s - 0.85) * HH); f2.zIndex = (s - 0.85) * 16 + 2; f2.alpha = 0.5
      world.addChild(f2)
    }
  }
  const fronts: Front[] = []
  if (t.foamlace) {
    for (let f = 0; f < 2; f++) {
      const laceT = (f === 1 && t.foamlace2) ? t.foamlace2 : t.foamlace // fronts alternate lace variants
      const segs: FoamSeg[] = [], trailSegs: FoamSeg[] = [], filmSegs: FoamSeg[] = []
      for (let d = dMin; d <= dMax; d++) {
        const jit = (hash(d * 3.3, f * 7.1) - 0.5) * 4 // static y jitter hides the 32px slice edges
        // the water FILM: a thin translucent sheet stretching from the waterline to the foam
        // front, so a washed-up wave stays CONNECTED to the sea instead of a dry white line
        if (t.skirt) {
          const skT = t.skirt
          const frF = new Rectangle(((d - dMin) * 32 + f * 96) % Math.max(32, skT.width - 32), 0, 32, skT.height)
          const fp = new Sprite(new Texture({ source: skT.source, frame: frF }))
          fp.anchor.set(0.5, 1); fp.position.set(d * HW, shoreAt(d) * HH); fp.alpha = 0
          world.addChild(fp); filmSegs.push({ sp: fp, d, jit })
        }
        // alternate strip halves run MIRRORED so the lace motif's repeat period doubles
        // (foam is stochastic — a mirrored continuation still reads continuous); each segment
        // carries TWO slices at different offsets and swaps during the lull, so consecutive
        // waves never show the same lace shapes
        const period = Math.max(32, laceT.width - 32)
        const sliceAt = (base: number) => {
          const run = Math.floor(base / period) % 2 === 1
          const off = base % period
          return { fr: new Rectangle(run ? period - 32 - off : off, 0, 32, laceT.height), run }
        }
        const a = sliceAt((d - dMin) * 32 + f * 160), b = sliceAt((d - dMin) * 32 + f * 160 + 137)
        const texA = new Texture({ source: laceT.source, frame: a.fr })
        const texB = new Texture({ source: laceT.source, frame: b.fr })
        const sp = new Sprite(texA)
        sp.anchor.set(0.5, 0.84) // scalloped leading edge rides just below the front line
        if (a.run) sp.scale.x = -1
        sp.position.set(d * HW, shoreAt(d) * HH); sp.alpha = 0
        world.addChild(sp); segs.push({ sp, d, jit, alt: [texA, texB], altRun: [a.run, b.run], cy: 0 })
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
  return { skirtSegs, wetSegs, fronts }
}

// sun glints twinkling on the open water, denser toward the sun (upper-left of the sea)
export type Sparkle = { sp: Sprite; ph: number; sc: number }
export function buildSparkles(world: Container, sparkleTex: Texture, shoreAt: (d: number) => number): Sparkle[] {
  const sparkles: Sparkle[] = []
  for (let i = 0; i < 96; i++) {
    const h0 = hash(i * 3.7, i)
    const d = h0 < 0.62 ? -70 + h0 * 105 : -80 + h0 * 160 // ~2/3 gather on the sun side
    const back = 3 + hash(i, i * 1.9) * 26 // diagonal units seaward of the waterline
    const s = shoreAt(d) - back
    const sp = new Sprite(sparkleTex); sp.anchor.set(0.5)
    const sc = 0.4 + hash(i * 7, i * 2) * 0.5
    sp.scale.set(sc); sp.position.set(d * HW, s * HH); sp.zIndex = s * 16 + 2
    sp.alpha = 0; sp.blendMode = 'add'
    world.addChild(sp); sparkles.push({ sp, ph: hash(i, i * 5) * 20, sc })
  }
  return sparkles
}

// ---- per-frame animation (call each from the map's ticker with wt = performance.now()/1000) ----

// the furthest tide reach at shore column d right now (drives shallows surge + the wet sheet)
export function makeReachOf(fronts: Front[], wt: number) {
  return (d: number) => {
    let m = 0
    for (const fr of fronts) { const r = tidePhase(wt - fr.off - d * SWEEP)[0]; if (r > m) m = r }
    return m
  }
}

// FLOWING WATER: brightness swells TRAVEL shoreward across the pixel tiles (phase runs
// along tx+ty, i.e. down-screen toward the shore) with a slower crossing wave underneath,
// so the sea reads as rolling toward the sand — no shader, the tiles Ashwath likes.
export function animSwells(waterSprites: SwellSprite[], wt: number, reachOf: (d: number) => number) {
  for (const w of waterSprites) {
    let fct = 1 + w.amp * (Math.sin(w.ph - wt * 1.05) + 0.55 * Math.sin(w.ph2 - wt * 0.42 + 1.7))
    if (w.shoreD !== undefined) fct *= 1 + 0.1 * reachOf(w.shoreD) // the shallows surge as a wave launches
    w.sp.tint = shadeHex(w.base, fct)
  }
}

// THE TIDE: fronts sweep along the shore (per-column phase lag), wash up, hold, retract
export function animTide(fronts: Front[], wt: number, shoreAt: (d: number) => number) {
  for (const fr of fronts) {
    for (const seg of fr.segs) {
      const u = wt - fr.off - seg.d * SWEEP
      const [reach, foamA] = tidePhase(u)
      const s = shoreAt(seg.d) + reach * TIDE_AMP + 0.1 * Math.sin(seg.d * 0.7 + wt * 1.4)
      seg.sp.position.y = s * HH + seg.jit
      seg.sp.zIndex = s * 16 + 6
      seg.sp.alpha = foamA * 0.9
      // swap the lace slice while invisible, so every wave wears a different shape
      const cy = Math.floor(u / TIDE_T)
      if (seg.alt && cy !== seg.cy && foamA < 0.06) {
        const i = ((cy % 2) + 2) % 2
        seg.cy = cy; seg.sp.texture = seg.alt[i]; seg.sp.scale.x = seg.altRun![i] ? -1 : 1
      }
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
}

// the waterline itself breathes a little; wet-sand memory stretches to the furthest recent
// reach, then dries away
export function animShoreline(skirtSegs: SkirtSeg[], wetSegs: WetSeg[], wt: number, shoreAt: (d: number) => number, reachOf: (d: number) => number) {
  for (const sk of skirtSegs) sk.sp.position.y = (shoreAt(sk.d) + 0.06 * Math.sin(wt * 0.9 + sk.d * 0.3)) * HH
  for (const w of wetSegs) {
    const r = reachOf(w.d)
    if (r >= w.reach) { w.reach = r; w.at = wt }
    const dry = Math.min(1, Math.max(0, (wt - w.at) / 7))
    if (dry >= 1) w.reach = Math.min(w.reach, r)
    const gap = w.reach * TIDE_AMP * HH + 8
    w.sp.scale.y = gap / w.sp.texture.height
    w.sp.alpha = 0.72 * (1 - dry * dry) + 0.14
  }
}

// sparkles twinkle on a slow individual clock
export function animSparkles(sparkles: Sparkle[], wt: number) {
  for (const s of sparkles) {
    const k = Math.max(0, Math.sin(wt * 0.9 + s.ph) - 0.55) / 0.45
    s.sp.alpha = k * 0.85
    s.sp.scale.set(s.sc * (0.7 + 0.3 * k))
  }
}
