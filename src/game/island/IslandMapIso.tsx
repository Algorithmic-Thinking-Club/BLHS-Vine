import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Culler, MeshRope, Point, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js'
import {
  LANDS, MAP, beachKTheta, coastDist, coastDistUW, coastInfoUW, coastPoint,
  isClaw, lagReachTheta, txOf, tyOf, vnoise2,
} from './paw'

// THE ISLAND MAP — fresh build 4, PHASE A: THE VAST SEA + THE DESIGNED COAST.
//
// The water DNA is BeachIso.tsx VERBATIM (ramp, variant pools, depth-keyed dither, coherent
// patch mirroring, oversize blend, two-sine swell) — never reinvented (STATE-OF-PLAY §4: four
// reinventions all died). What Phase A builds ON it:
//   - a 1024-tile world: Thor and the ship never see an edge; only viewport chunks exist,
//     with zoom-adaptive tile stride, so the vast ocean costs the same at every zoom.
//   - THE HALO IS DEAD (law #2): shallows are the paw's DESIGNED lagoon system — the big
//     east arrival lagoon (reef blotches, sand bars, a dark boat channel), the south cove
//     apron, warm straits under the toes — and the deep sea runs nearly to the rock
//     everywhere else. Depth reads the lagoon field in paw.ts, not a distance glow.
//   - THE COAST IS PAINTED, NOT PASTED: the waterline seam + broken static foam + the
//     reef-edge surf line are drawn into the same smooth per-chunk canvas as the aerial
//     veil, so they follow every curve of the coast with zero sprite seams. The animated
//     life on top (tide wash on the beaches, collar breath on the cliffs, rolling breaker
//     pulses on the reef) is tangent-ROTATED foam lace that hugs the curve.
//   - open-sea life for the wide zoom: sun path, drifting cloud shadows, huge slow mist
//     streaks (sos-7's atmosphere), crest streaks, sparkles.

const HW = 32, HH = 16
const S0 = MAP // tile-space center (512,512) -> s = 1024
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
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}
const smooth01 = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k) }

// ---- the beach's water DNA, verbatim ----
const SAND_COMMON = [0, 1, 2, 3, 7, 9]
const W_CALM = [0, 12, 15], W_SOFT = [3, 2, 8], W_TEX = [1, 10, 4, 6], W_SWELL = [13, 14, 11, 9, 7, 5]
const W_BASE = [205, 235, 229]
const SAND_BASE = [246, 229, 180]
// the beach's ramp lifted one warm-turquoise step per stop: THIS map's sea is tropical noon,
// not the beach's deep golden-hour cold (Ash: "slightly brighter... it's a tropical ocean")
const W_RAMP: [number, number][] = [
  [0.0, 0xbceee0], [0.09, 0xa0e4d2], [0.14, 0x60cec0], [0.24, 0x45b8b0],
  [0.38, 0x31a4aa], [0.54, 0x228f9d], [0.68, 0x176e86], [1.0, 0x0c4a5e],
]
const ABYSS = 0x0c4a5e

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

// geometry comes from paw.ts (the panther-paw archipelago)
const uOf = (tx: number, ty: number) => tx - ty
const wOf = (tx: number, ty: number) => (tx + ty - S0) / 2
// the jungle floor's normalized tile family base (same normalize_tiles.py law as water/sand)
const JUNGLE_BASE = [82, 124, 72]

const lerpN = (a: number, b: number, t: number) => a + (b - a) * t

/** the designed lagoon's wobbled outer reach at a point (shared by depth, the painted
 *  reef surf, and the breaker sprites so they always agree) */
function reachAt(li: number, th: number, u: number, w: number) {
  const base = lagReachTheta(li, th)
  return Math.max(0.8, base + (base > 3.5
    ? (vnoise(u / 16 + 40, w / 16 + 7) - 0.5) * 2.4
    : (vnoise(u / 6 + 40, w / 6 + 7) - 0.5) * 0.8))
}

// the east pass: the boat channel's direction (out through the arrival bay at θ=315°)
const CH_D = { u: Math.SQRT1_2, w: Math.SQRT1_2 }

/** THE DESIGNED DEPTH (law #2): inside a lagoon the water stays shallow-bright with real
 *  structure (reef blotches, sand bars, the channel); past the reef edge it drops to the
 *  abyss within ~6 units — deep water nearly at the rock, never a coast-hugging glow. */
function depFromInfo(cd: number, li: number, th: number, u: number, w: number) {
  if (cd >= 0) return -1
  const d = -cd
  const base = lagReachTheta(li, th)
  const reach = reachAt(li, th, u, w)
  let t: number
  if (d < reach) {
    const k = d / reach
    if (base <= 1.4) {
      // cliff coasts: NO bright inner band — the water is already waist-deep at the rock
      // (the constant pale rim on every coast was the last ghost of the halo)
      t = 0.2 + 0.34 * smooth01(k)
    } else {
      t = 0.05 + 0.3 * smooth01(k)
      if (base > 3.5) {
        if (k > 0.36) { // coral-head blotches toward the outer lagoon (Bora Bora's mosaic)
          const b = 0.62 * vnoise(u / 4.6 + 17, w / 4.6 + 3) + 0.38 * vnoise(u / 9.5 + 4, w / 9.5 + 28)
          if (b > 0.55) t += 0.3 * smooth01((b - 0.55) / 0.16) * smooth01((k - 0.36) / 0.26)
        }
        if (k < 0.45) { // pale sand-bar streaks, elongated along the shore
          const s = vnoise(u / 9 + 51, w / 3.4 + 22)
          if (s > 0.7) t *= 0.42
        }
      }
    }
  } else {
    t = (base <= 1.4 ? 0.54 : 0.36) + (1 - (base <= 1.4 ? 0.54 : 0.36)) * smooth01((d - reach) / 6.2)
  }
  if (base > 8 && d < reach + 3) {
    // the dark boat channel, S-curving out through the big lagoon; its head FADES in
    // over ~6 units so it never cuts a hard elbow into the bay's shallows
    const r = u * CH_D.u + w * CH_D.w
    if (r > 29) {
      const perp = Math.abs(-u * CH_D.w + w * CH_D.u - 2.0 * Math.sin(r * 0.17 + 1.2))
      if (perp < 1.8) {
        const chT = lerpN(0.58, t, smooth01(perp / 1.8))
        t = Math.max(t, lerpN(t, chT, smooth01((r - 29) / 6)))
      }
    }
  }
  // faint shoal drift so the vast deep never sits at one exact hue
  if (t > 0.5) t += (vnoise(u / 34 + 9, w / 34 + 3) - 0.5) * 0.12 * smooth01((t - 0.5) * 3)
  return Math.min(1, Math.max(0, t))
}
function depField(u: number, w: number) {
  const [cd, li, th] = coastInfoUW(u, w)
  return depFromInfo(cd, li, th, u, w)
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
        load('washband', '/art/island/wash-band.png'), load('washband2', '/art/island/wash-band2.png'),
        load('sparkle', '/art/intro/sparkle.png'),
      ])
      const sandV: Texture[] = [], waterV: Texture[] = [], jungleV: Texture[] = []
      await Promise.all([
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-n/${i}.png`).then((t) => { sandV[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/water-n/${i}.png`).then((t) => { waterV[i] = t }).catch(() => {})),
        // variant 11 carries a big pale stone patch that reads as a gray diamond in the
        // canopy field — excluded (12-15 are a different olive family, also out)
        ...Array.from({ length: 11 }, (_, i) => Assets.load(`/art/intro/jungle-n/${i}.png`).then((t) => { jungleV[i] = t }).catch(() => {})),
      ])
      const idle: Record<string, Texture> = {}
      await Promise.all(dirs8.map((d) => load('idle_' + d, `/art/characters/thor/walk/${d}/0.png`).then(() => { idle[d] = tex['idle_' + d] })))
      const walk: Record<string, Texture[]> = {}
      await Promise.all(dirs8.map(async (d) => {
        try { walk[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`))) } catch { /* */ }
      }))
      if (destroyed) { instance.destroy(true); return }

      const trimmed = (t: Texture): Texture => {
        try {
          const w = t.source.pixelWidth, h = t.source.pixelHeight
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h
          const g = cv.getContext('2d', { willReadFrequently: true })!
          g.drawImage(t.source.resource as CanvasImageSource, 0, 0)
          const d = g.getImageData(0, 0, w, h).data
          let feet = -1
          for (let y = h - 1; y >= 0 && feet < 0; y--) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { feet = y; break }
          if (feet >= 0 && feet < h - 1) return new Texture({ source: t.source, frame: new Rectangle(0, 0, w, feet + 1) })
        } catch { /* */ }
        return t
      }
      for (const d of dirs8) {
        if (idle[d]) idle[d] = trimmed(idle[d])
        if (walk[d]) walk[d] = walk[d].map(trimmed)
      }

      const world = new Container(); world.scale.set(ZOOM); world.sortableChildren = true
      instance.stage.addChild(world)
      // THE ISLAND MAP'S OWN LIGHT (not the beach's golden hour): clean bright tropical noon
      // over open water, a touch cooler and clearer — the jungle mystery tint arrives with
      // the island's ground in phase 2
      // gentle like the beach's (its contrast is 0.02 — anything stronger amplifies
      // tile-to-tile variance into a checker); the lean is cool-clean instead of amber
      const grade = new ColorMatrixFilter()
      grade.brightness(1.0, false); grade.saturate(0.07, true); grade.contrast(0.02, true)
      const wm = grade.matrix; wm[0] *= 1.01; wm[6] *= 1.005; wm[12] *= 0.965; grade.matrix = wm
      world.filters = [grade]

      // the abyss floor behind everything (chunks stream on top; the ramp converges to it)
      {
        const plane = new Sprite(Texture.WHITE)
        plane.tint = ABYSS
        plane.position.set(-MAP * HW, 0)
        plane.width = 2 * MAP * HW; plane.height = 2 * MAP * HH
        plane.zIndex = -100000
        world.addChild(plane)
      }

      // ---- THE CHUNK-STREAMED OCEAN ----
      type WaterAnim = { sp: Sprite; base: number; ph: number; ph2: number; amp: number }
      type Chunk = { sprites: Sprite[]; anims: WaterAnim[] }
      const CH = 16
      const chunks = new Map<string, Chunk>()
      const waterAnims = new Set<WaterAnim>()
      let curStride = 1

      const buildTile = (tx: number, ty: number, stride: number, chunk: Chunk) => {
        if (tx < 0 || ty < 0 || tx >= MAP || ty >= MAP) return
        const u = uOf(tx, ty), w = wOf(tx, ty)
        const [cd, li, th] = coastInfoUW(u, w)
        const isSea = cd < 0
        const B = beachKTheta(li, th)
        const clawL = isClaw(li)
        const rockCoast = clawL || B < 0.2
        let base: Texture | undefined
        let dep = 0
        if (isSea) {
          const raw = depFromInfo(cd, li, th, u, w)
          // dither must stay TINY in the bright lagoon band — the ramp's early stops sit
          // close together there, so even ±0.05 dep is a full color step = the checker.
          // The lagoon's variety comes from its DESIGNED structure, not noise.
          const dAmp = (raw < 0.4 ? 0.018 : raw < 0.55 ? 0.03 : 0.05) * (stride > 1 ? 1.15 : 1)
          dep = Math.min(1, Math.max(0, raw + (hash(tx * 7.7, ty * 5.3) - 0.5) * dAmp))
          // THE CHECKER KILLER (reviewer fix #1): texture busyness is selected by LOW-
          // FREQUENCY world noise, not per-tile hash — glass and textured tiles arrive in
          // organic 3-4 tile patches (sun on water), never alternating diamonds. The
          // visible band leans glassy; busy swell texture lives deep, under the veil.
          const vsel = vnoise(tx / 3.5 + 50, ty / 3.5 + 9)
          const pool = dep < 0.12 ? W_CALM
            : dep < 0.3 ? (vsel < 0.72 ? W_CALM : W_SOFT)
              : dep < 0.55 ? (vsel < 0.5 ? W_CALM : W_SOFT)
                : dep < 0.75 ? (vsel < 0.55 ? W_SOFT : W_TEX)
                  : (vsel < 0.5 ? W_TEX : W_SWELL)
          base = waterV[pool[Math.floor(vnoise(tx / 2.6 + 21, ty / 2.6 + 33) * pool.length) % pool.length]]
        } else if (!rockCoast && cd >= (0.8 + 4.0 * B) * (li > 0 ? 0.6 : 1) + 1.6) {
          base = jungleV.length ? jungleV[Math.floor(hash(tx * 3.3, ty * 4.1) * jungleV.length)] : sandV[0]
        } else if (rockCoast && !clawL && cd >= 2.4) {
          base = jungleV.length ? jungleV[Math.floor(hash(tx * 3.3, ty * 4.1) * jungleV.length)] : sandV[0]
        } else {
          base = sandV[SAND_COMMON[Math.floor(hash(tx * 3.3, ty * 4.1) * SAND_COMMON.length)]]
        }
        if (!base) return
        const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
        const fx = (isSea && dep < 0.12) ? 1 : vnoise(tx / 7 + 4, ty / 7 + 11) > 0.5 ? -1 : 1
        // extra overlap in the bright shallows: neighboring lagoon tiles blend into each
        // other instead of meeting at diamond edges; the innermost band also skips the
        // mirror flip (mirrored bright texture against unmirrored = the alternating read)
        const os = (isSea ? (dep < 0.12 ? 1.22 : dep < 0.4 ? 1.18 : 1.12) : 1.08) * stride
        sp.scale.set(fx * os, os)
        sp.position.set(isoX(tx, ty), isoY(tx, ty))
        sp.zIndex = (tx + ty) * 16
        sp.cullable = true
        if (isSea) {
          const patch = 0.955 + 0.09 * vnoise(tx / 22 + 7, ty / 22 + 2)
          const grain = 0.997 + 0.006 * hash(tx, ty)
          const col = shadeHex(tintFor(rampAt(W_RAMP, dep), W_BASE), patch * grain)
          sp.tint = col
          // the beach's exact per-tile life: two slow interfering sines, calm at the
          // shore, rolling out deep — every tile breathes, nothing is static
          const anim: WaterAnim = {
            sp, base: col,
            ph: (tx + ty) * 0.5 + 0.35 * Math.sin((tx - ty) * 0.18),
            ph2: (tx + ty) * 0.21 - (tx - ty) * 0.07,
            amp: 0.022 + 0.055 * dep,
          }
          chunk.anims.push(anim); waterAnims.add(anim)
        } else {
          const bw = (0.8 + 4.0 * B) * (li > 0 ? 0.6 : 1)
          if (clawL || (rockCoast && cd < 2.4)) {
            // basalt shore shelf: cliff coasts (and the bare claws) meet the water as
            // dark rock, not sand — the SoS column-islet read until Phase B's real cliffs
            const t = Math.min(1, cd / 2.6) + (hash(tx * 6.1, ty * 4.3) - 0.5) * 0.22
            const col = rampAt([[0, 0x322f2b], [0.45, 0x46423b], [1, 0x565148]], Math.max(0, t))
            sp.tint = tintFor(shadeHex(col, 0.97 + 0.06 * hash(tx, ty)), SAND_BASE)
          } else if (rockCoast || cd >= bw + 1.6) {
            // the island floor: deep mossy green with slow moisture drift — the "slight
            // green tint" jungle ground Ash asked for (canopy + detail arrive in C)
            const moist = vnoise2(u / 9 + 3, w / 9 + 8)
            const clump = vnoise2(u / 17 + 21, w / 17 + 6)
            const t = Math.min(1, Math.max(0, 0.62 - 0.3 * moist + 0.25 * clump + (hash(tx * 5.7, ty * 3.9) - 0.5) * 0.1))
            const col = rampAt([[0, 0x4a7040], [0.4, 0x3a5a33], [0.75, 0x2e4829], [1, 0x263c22]], t)
            sp.tint = tintFor(shadeHex(col, 0.985 + 0.03 * hash(tx, ty)), JUNGLE_BASE)
          } else if (cd >= bw) {
            // the dune-grass seam between sand and jungle — DITHERED per tile, so the
            // boundary interleaves instead of stepping (the reviewer's sawtooth kill)
            const k = Math.min(1, Math.max(0, (cd - bw) / 1.6))
            const gate = vnoise(tx * 1.7 + 5, ty * 1.7 + 12)
            const col = gate < k * 1.15 - 0.08 ? 0x466b39 : mix(0xcdb27e, 0x5d7a44, k * 0.55)
            sp.tint = tintFor(shadeHex(col, 0.985 + 0.03 * hash(tx, ty)), SAND_BASE)
          } else {
            // wet waterline -> warm dry -> pale high sand (the beach's full sand read)
            const col = cd < 1.4
              ? mix(0xb5945e, 0xd8bd86, Math.min(1, Math.max(0, cd / 1.4)))
              : rampAt([[0, 0xd8bd86], [0.55, 0xead6a3], [1, 0xf0e2b4]], Math.min(1, (cd - 1.4) / 4.5))
            sp.tint = tintFor(shadeHex(col, 0.985 + 0.03 * hash(tx, ty)), SAND_BASE)
          }
        }
        world.addChild(sp)
        chunk.sprites.push(sp)
      }

      const buildChunk = (cx: number, cy: number, stride: number): Chunk => {
        const chunk: Chunk = { sprites: [], anims: [] }
        for (let ty = cy * CH; ty < (cy + 1) * CH; ty += stride) {
          for (let tx = cx * CH; tx < (cx + 1) * CH; tx += stride) {
            buildTile(tx, ty, stride, chunk)
          }
        }
        // ---- THE COAST CANVAS (grew out of the beach's aerial veil): one smooth canvas
        // ABOVE the tiles carries (1) the deep-melt veil, (2) the reef-edge surf line,
        // (3) the waterline seam, (4) broken static foam — so the coast is PAINTED along
        // its true curve with zero sprite seams, at every angle of shoreline ----
        const X0 = cx * CH, X1 = (cx + 1) * CH, Y0 = cy * CH, Y1 = (cy + 1) * CH
        const RES = 4
        const px0 = (X0 - Y1) * HW - HW, py0 = (X0 + Y0) * HH - HH
        const cw = Math.ceil(((2 * CH + 2) * HW) / RES), chh = Math.ceil(((2 * CH + 2) * HH) / RES)
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh
        const g = cv.getContext('2d')!
        const img = g.createImageData(cw, chh)
        const px = img.data
        let any = false
        const acc = { r: 0, g: 0, b: 0, a: 0 }
        const paint = (col: number, a: number) => {
          if (a <= 0) return
          const na = a + acc.a * (1 - a)
          acc.r = (((col >> 16) & 255) * a + acc.r * acc.a * (1 - a)) / na
          acc.g = (((col >> 8) & 255) * a + acc.g * acc.a * (1 - a)) / na
          acc.b = ((col & 255) * a + acc.b * acc.a * (1 - a)) / na
          acc.a = na
        }
        for (let cyy = 0; cyy < chh; cyy++) {
          const wy = py0 + (cyy + 0.5) * RES
          const w2 = (wy / HH - S0) / 2
          for (let cxx = 0; cxx < cw; cxx++) {
            const wx = px0 + (cxx + 0.5) * RES
            const u2 = wx / HW
            const [cd, li, th] = coastInfoUW(u2, w2)
            if (cd >= 0.6) continue // dry inland past the seam: nothing to paint
            acc.r = 0; acc.g = 0; acc.b = 0; acc.a = 0
            const B = beachKTheta(li, th)
            const cliff = isClaw(li) || B < 0.2
            if (cd < 0) {
              const dep = depFromInfo(cd, li, th, u2, w2)
              if (dep >= 0.02) {
                // the veil starts INSIDE the lagoon now (a gentle glaze that melts the
                // shallow tiles together), then runs the beach's abyss curve past it
                const k = Math.min(1, (dep - 0.03) / 0.54)
                let a = 0.22 * smooth01(Math.min(1, (dep - 0.02) / 0.06)) + 0.4 * k * k * (3 - 2 * k)
                if (dep > 0.78) { const kk = Math.min(1, (dep - 0.78) / 0.22); a += 0.24 * kk * kk }
                a *= 0.86 + 0.28 * vnoise(wx / 1250 + 3.2, wy / 720 + 8.1)
                let col = rampAt(W_RAMP, Math.min(1, dep + 0.1))
                if (dep > 0.45) {
                  // SWELL BANDS: long diagonal brightness waves rolling through the deep —
                  // the wide zoom's water carries visible sea texture, never a flat field
                  const ph = vnoise(u2 / 21 + 8, w2 / 21 + 61) * 6.3
                  const band = Math.sin((u2 * 0.72 + w2 * 1.9) * 0.5 + ph)
                  col = shadeHex(col, 1 + 0.05 * band * smooth01((dep - 0.45) / 0.3))
                }
                paint(col, Math.min(1, a))
              }
              if (cd > -1.6 && B > 0.35) {
                // the sandy shallow film: warm aqua where inches of water sit over sand —
                // eats the sand/water staircase. BEACHES ONLY: a cliff meets dark water.
                const s = cd + 0.45
                const varK = 0.66 + 0.5 * vnoise(u2 / 7 + 44, w2 / 7 + 9)
                paint(0xa8dcc4, 0.44 * varK * Math.exp(-(s * s) / 0.26))
              }
              if (lagReachTheta(li, th) > 4.5) {
                // the reef surf: the broken white line where the lagoon meets the deep,
                // offshore where real surf breaks — never at the sand
                const e = Math.abs(-cd - reachAt(li, th, u2, w2))
                if (e < 1.4) {
                  const gate = smooth01((vnoise(u2 * 1.6 + 31, w2 * 1.6 + 12) - 0.42) / 0.2)
                  paint(0xf0fdf8, 0.52 * Math.exp(-(e * e) / 0.4) * gate)
                }
              }
              // WORLD FRAMING: the vast sea deepens away from the island, so the island
              // reads as the bright focal of a framed ocean at any zoom
              if (dep > 0.9) {
                const d2 = Math.hypot(u2, w2)
                if (d2 > 58) paint(0x0a4456, Math.min(0.3, (d2 - 58) / 200))
              }
            }
            if (cd > -1.35) {
              // the waterline seam: a soft dark line hugging every coast (this buried the
              // tile staircase and replaced the pasted skirt strips)
              const s = cd + 0.05
              paint(cliff ? 0x0d2429 : 0x123238, (cliff ? 0.5 : 0.4) * Math.exp(-(s * s) / 0.405))
            }
            if (cd > -0.85 && cd < 0.05) {
              // broken static foam at the waterline — the animated lace's quiet base coat;
              // sparse chunks against cliffs (deep water slaps rock), fuller lace on sand
              const s = cd + 0.3
              const gate = smooth01((vnoise(u2 * 2.3 + 9, w2 * 2.3 + 4) - (cliff ? 0.55 : 0.4)) / 0.2)
              paint(0xf2fffa, (cliff ? 0.42 : 0.52) * Math.exp(-(s * s) / 0.115) * gate)
            }
            if (acc.a <= 0.004) continue
            const o = (cyy * cw + cxx) * 4
            px[o] = Math.round(acc.r); px[o + 1] = Math.round(acc.g); px[o + 2] = Math.round(acc.b)
            px[o + 3] = Math.round(Math.min(1, acc.a) * 255)
            any = true
          }
        }
        if (any) {
          g.putImageData(img, 0, 0)
          const vt = Texture.from(cv); vt.source.scaleMode = 'linear'
          const vs = new Sprite(vt)
          vs.position.set(px0, py0); vs.scale.set(RES, RES)
          vs.zIndex = (X1 + Y1 - 2) * 16 + 14
          vs.cullable = true
          world.addChild(vs)
          chunk.sprites.push(vs)
        }
        return chunk
      }
      const dropChunk = (key: string) => {
        const c = chunks.get(key)
        if (!c) return
        for (const a of c.anims) waterAnims.delete(a)
        for (const s of c.sprites) s.destroy()
        chunks.delete(key)
      }
      /** stream chunks for the current camera view (call every frame; cheap when settled) */
      const streamOcean = (camX: number, camY: number, vw: number, vh: number, zoom: number) => {
        const stride = zoom >= 0.55 ? 1 : zoom >= 0.26 ? 2 : 4
        if (stride !== curStride) { for (const k of [...chunks.keys()]) dropChunk(k); curStride = stride }
        // viewport corners -> tile space (inverse iso), padded one chunk out
        const xs = [camX - vw / (2 * zoom), camX + vw / (2 * zoom)]
        const ys = [camY - vh / (2 * zoom), camY + vh / (2 * zoom)]
        let tMinX = 1e9, tMaxX = -1e9, tMinY = 1e9, tMaxY = -1e9
        for (const x of xs) for (const y of ys) {
          const tx = (x / HW + y / HH) / 2, ty = (y / HH - x / HW) / 2
          tMinX = Math.min(tMinX, tx); tMaxX = Math.max(tMaxX, tx)
          tMinY = Math.min(tMinY, ty); tMaxY = Math.max(tMaxY, ty)
        }
        const c0x = Math.floor((tMinX - CH) / CH), c1x = Math.floor((tMaxX + CH) / CH)
        const c0y = Math.floor((tMinY - CH) / CH), c1y = Math.floor((tMaxY + CH) / CH)
        for (let cy = c0y; cy <= c1y; cy++) {
          for (let cx = c0x; cx <= c1x; cx++) {
            if (cx < 0 || cy < 0 || cx * CH >= MAP || cy * CH >= MAP) continue
            const key = cx + ',' + cy
            if (!chunks.has(key)) chunks.set(key, buildChunk(cx, cy, curStride))
          }
        }
        // retire far chunks
        for (const key of [...chunks.keys()]) {
          const [cx, cy] = key.split(',').map(Number)
          if (cx < c0x - 2 || cx > c1x + 2 || cy < c0y - 2 || cy > c1y + 2) dropChunk(key)
        }
      }

      // ---- THE LIVING SHORELINE: the beach's tide, wrapped around every curve. Each
      // lace slice is ROTATED to its coast tangent (local +y = seaward), so the wash
      // hugs the shore at any angle instead of reading as pasted horizontal strips.
      // Sandy arcs get the full wash-hold-retract cycle; cliff arcs keep a quiet collar
      // breath over the canvas's painted collar. ----
      const TIDE_T = 9, TIDE_AMP = 1.4
      const tidePhase = (u: number): [number, number] => {
        u = ((u % TIDE_T) + TIDE_T) % TIDE_T
        if (u < 2.2) { const k = u / 2.2, e = 1 - Math.pow(1 - k, 3); return [e, 0.45 + 0.55 * k] }
        if (u < 2.9) return [1, 1]
        if (u < 6.6) { const k = (u - 2.9) / 3.7, e = 0.5 - 0.5 * Math.cos(Math.PI * k); return [1 - e, 1 - 0.8 * k] }
        const k = (u - 6.6) / (TIDE_T - 6.6)
        return [0, 0.2 * (1 - k)]
      }
      type Dab = { x: number; y: number; nx: number; ny: number; arc: number; foam: Sprite[]; beach: number }
      const dabs: Dab[] = []
      type Breaker = { sp: Sprite; arc: number; ph: number }
      const breakers: Breaker[] = []
      // THE WASH ROPES: on every sandy arc the tide is ONE continuous lace ribbon (a
      // MeshRope bent along the coast polyline), its points riding their own normals
      // through the wash-hold-retract cycle with a phase lag that sweeps the break along
      // the shore. Slices could never do this on a curve — they dash on convex bends and
      // stack into cotton on concave ones.
      type WashPt = { pt: Point; bx: number; by: number; nx: number; ny: number; au: number }
      type Wash = { rope: MeshRope; pts: WashPt[]; f: number; amp: number }
      const washes: Wash[] = []
      const cx0 = isoX(MAP / 2, MAP / 2), cy0 = isoY(MAP / 2, MAP / 2)
      type RunPt = { u: number; w: number; nx: number; ny: number; au: number; B: number }
      const makeWash = (run: RunPt[], f: number, avgB: number) => {
        // the wash-band texture is the foam lace smeared seamless along x — bent into a
        // rope it reads as a soft water film edge; the LACY breakup lives in the painted
        // canvas foam beneath, so the pair reads organic instead of comb-toothed
        const laceT = (f === 1 && tex['washband2']) ? tex['washband2'] : (tex['washband'] ?? tex['foamlace'])
        laceT.source.addressMode = 'repeat'
        const fy = Math.floor(laceT.height * 0.12), fh = Math.ceil(laceT.height * 0.58)
        const band = new Texture({ source: laceT.source, frame: new Rectangle(0, fy, laceT.width, fh) })
        const pts: WashPt[] = run.map((p) => {
          const bx = cx0 + p.u * HW, by = cy0 + p.w * 2 * HH
          return { pt: new Point(bx, by), bx, by, nx: p.nx, ny: p.ny, au: p.au }
        })
        const rope = new MeshRope({ texture: band, points: pts.map((p) => p.pt), textureScale: f === 0 ? 0.9 : 0.7 })
        // ADDITIVE at low alpha (the wake's lesson): normal blend smears the lace's dark
        // under-shading across the sand ('screen' is NOT core in pixi v8 — it silently
        // falls back to normal, which is exactly the dark-bristle bug); soft add at a
        // pale tint keeps only the foam light without burning a white zipper
        rope.blendMode = 'add'
        rope.tint = 0xdcf5ec
        rope.alpha = 0.34
        rope.zIndex = (Math.max(...pts.map((p) => p.by)) / HH) * 16 + 6
        rope.cullable = true
        world.addChild(rope)
        washes.push({ rope, pts, f, amp: TIDE_AMP * (0.3 + 0.7 * avgB) })
      }
      if (tex['foamlace']) {
        for (let li = 0; li < LANDS.length; li++) {
          // start the sweep on a cliff stretch so beach runs never split across the seam
          let th0 = -1
          for (let t2 = 0; t2 < Math.PI * 2; t2 += 0.05) if (beachKTheta(li, t2) <= 0.35) { th0 = t2; break }
          if (th0 < 0) th0 = 0
          let run: RunPt[] = []
          const flush = () => {
            if (run.length >= 5) {
              const avgB = run.reduce((s, p) => s + p.B, 0) / run.length
              makeWash(run, 0, avgB)
              if (avgB > 0.6) makeWash(run, 1, avgB)
            }
            run = []
          }
          let arc = li * 173
          let arcU = 0
          let th = th0
          while (th < th0 + Math.PI * 2) {
            const cp = coastPoint(th, li)
            const B = beachKTheta(li, th)
            if (B > 0.35) {
              run.push({ u: cp.u, w: cp.w, nx: cp.nx, ny: cp.ny, au: arcU, B })
            } else {
              flush()
              // cliff arcs keep a sparse breathing collar over the painted one
              const x = cx0 + cp.u * HW, y = cy0 + cp.w * 2 * HH
              const laceT = hash(th * 71, li) > 0.5 && tex['foamlace2'] ? tex['foamlace2'] : tex['foamlace']
              const fy = Math.floor(laceT.height * 0.1), fh = Math.ceil(laceT.height * 0.62)
              const off = Math.floor(arc * 0.9) % Math.max(32, laceT.width - 40)
              const fsp = new Sprite(new Texture({ source: laceT.source, frame: new Rectangle(off, fy, 40, fh) }))
              fsp.anchor.set(0.5, 0.8)
              fsp.rotation = Math.atan2(-cp.nx, cp.ny)
              fsp.scale.set(0.85, 0.55)
              fsp.position.set(x, y); fsp.alpha = 0; fsp.cullable = true
              world.addChild(fsp)
              dabs.push({ x, y, nx: cp.nx, ny: cp.ny, arc, foam: [fsp], beach: B })
            }
            const stepU = B > 0.35 ? 0.9 : 1.45
            th += stepU / Math.max(2, LANDS[li].R(th))
            arc += stepU * 32
            arcU += stepU
          }
          flush()
        }
        // THE REEF BREAKERS: rolling white pulses along the big lagoons' outer edges —
        // the surf breaks offshore at the reef (Bora Bora's law), not on the sand
        let rarc = 0
        let th = 0
        while (th < Math.PI * 2) {
          const base = lagReachTheta(0, th)
          const cp = coastPoint(th, 0)
          const rr = Math.max(2, LANDS[0].R(th))
          if (base > 7) {
            const p0u = cp.u + cp.nx * base, p0w = cp.w + cp.ny * base
            const reach = reachAt(0, th, p0u, p0w)
            const pu = cp.u + cp.nx * reach, pw = cp.w + cp.ny * reach
            const laceT = hash(th * 91, 3) > 0.5 && tex['foamlace2'] ? tex['foamlace2'] : tex['foamlace']
            const off = Math.floor(rarc * 1.7) % Math.max(32, laceT.width - 52)
            const sp = new Sprite(new Texture({ source: laceT.source, frame: new Rectangle(off, 0, 52, laceT.height) }))
            sp.anchor.set(0.5, 0.6)
            sp.rotation = Math.atan2(-cp.nx, cp.ny)
            sp.scale.set(1.4 + hash(th * 37, 7) * 0.5, 0.7)
            sp.tint = 0xf4fffb
            sp.position.set(cx0 + pu * HW, cy0 + pw * 2 * HH)
            sp.alpha = 0; sp.cullable = true
            sp.zIndex = ((cy0 + pw * 2 * HH) / HH) * 16 + 5
            world.addChild(sp)
            breakers.push({ sp, arc: rarc, ph: hash(th * 53, 11) * 6.3 })
          }
          const stepU = 1.25
          th += stepU / (rr + Math.max(0, base))
          rarc += stepU
        }
      }

      // ---- open-sea life: a coherent SUN PATH (the reviewer's "the water has no sky
      // above it" fix) — one soft band of light crossing the sea, glints concentrated
      // inside it, plus slow crest streaks drifting through the deep ----
      const SUN_P0 = { x: isoX(MAP / 2, MAP / 2) - 2600, y: isoY(MAP / 2, MAP / 2) - 1500 }
      const SUN_DIR = (() => { const l = Math.hypot(1, 0.62); return { x: 1 / l, y: 0.62 / l } })()
      const sunBandDist = (wx: number, wy: number) => {
        const rx = wx - SUN_P0.x, ry = wy - SUN_P0.y
        return Math.abs(rx * -SUN_DIR.y + ry * SUN_DIR.x)
      }
      {
        const band = new Sprite(radial(256, [[0, 'rgba(214,244,232,0.038)'], [0.55, 'rgba(214,244,232,0.018)'], [1, 'rgba(214,244,232,0)']]))
        band.anchor.set(0.5); band.blendMode = 'add'
        band.width = 7000; band.height = 1700
        band.rotation = Math.atan2(SUN_DIR.y, SUN_DIR.x)
        band.position.set(isoX(MAP / 2, MAP / 2), isoY(MAP / 2, MAP / 2))
        band.zIndex = 190000
        world.addChild(band)
      }
      const sparkles: { sp: Sprite; ph: number; sc: number }[] = []
      if (tex['sparkle']) {
        for (let i = 0; i < 120; i++) {
          const sp = new Sprite(tex['sparkle']); sp.anchor.set(0.5)
          const sc = 0.35 + hash(i * 7, i * 2) * 0.5
          sp.scale.set(sc); sp.alpha = 0; sp.blendMode = 'add'; sp.zIndex = 200000
          world.addChild(sp); sparkles.push({ sp, ph: hash(i, i * 5) * 20, sc })
        }
      }
      // crest streaks: thin pale dashes riding the deep on long slow cycles — surface
      // life for the far field, nothing like popping whitecaps
      type Streak = { sp: Sprite; age: number; life: number }
      const streaks: Streak[] = []
      const spawnStreak = (camX: number, camY: number, vw: number, vh: number, zoom: number) => {
        if (!tex['foamlace'] || streaks.length >= 26) return
        for (let tries = 0; tries < 5; tries++) {
          const wx = camX + (hash(performance.now() * 1.3, tries) - 0.5) * vw / zoom * 1.2
          const wy = camY + (hash(performance.now() * 2.7, tries * 3) - 0.5) * vh / zoom * 1.2
          const uu = wx / HW, ww = (wy / HH - S0) / 2
          if (depField(uu, ww) < 0.5) continue
          const laceT = hash(wx, wy) > 0.5 && tex['foamlace2'] ? tex['foamlace2'] : tex['foamlace']
          const off = Math.floor(hash(wy, wx) * Math.max(32, laceT.width - 60))
          const fy = Math.floor(laceT.height * 0.15), fh = Math.ceil(laceT.height * 0.5)
          const sp = new Sprite(new Texture({ source: laceT.source, frame: new Rectangle(off, fy, 56, fh) }))
          sp.anchor.set(0.5, 0.6); sp.tint = 0xeafff8
          // long low crest lines riding the sun diagonal — the deep's visible life
          sp.rotation = 0.24
          sp.scale.set(2.2 + hash(wx, 3) * 1.4, 0.5); sp.alpha = 0
          sp.position.set(wx, wy); sp.zIndex = (wy / HH) * 16 + 5; sp.cullable = true
          world.addChild(sp)
          streaks.push({ sp, age: 0, life: 9000 + hash(wx * 3, wy) * 5000 })
          break
        }
      }
      const clouds: { sp: Sprite; vx: number; vy: number }[] = []
      for (let i = 0; i < 8; i++) {
        const c = new Sprite(radial(256, [[0, 'rgba(8,26,32,0.13)'], [0.55, 'rgba(8,26,32,0.07)'], [1, 'rgba(8,26,32,0)']]))
        c.anchor.set(0.5); c.blendMode = 'multiply'
        c.width = 2400 + hash(i, 3) * 2800; c.height = c.width * 0.36
        c.position.set(isoX(MAP / 2, MAP / 2) + (hash(i, 7) - 0.5) * 13000, isoY(MAP / 2, MAP / 2) + (hash(i, 9) - 0.5) * 7500)
        c.zIndex = 400000
        world.addChild(c)
        clouds.push({ sp: c, vx: 7 + hash(i, 11) * 6, vy: 2.6 + hash(i, 13) * 2.4 })
      }
      // huge, slow, barely-there mist streaks gliding over the deep (sos-7's sea-fog
      // read at wide zoom — aerial depth for a vast ocean, nothing sits still)
      const mists: { sp: Sprite; vx: number; vy: number }[] = []
      for (let i = 0; i < 3; i++) {
        const m = new Sprite(radial(256, [[0, 'rgba(216,242,238,0.055)'], [0.5, 'rgba(216,242,238,0.025)'], [1, 'rgba(216,242,238,0)']]))
        m.anchor.set(0.5); m.blendMode = 'add' // 'screen' is not core in v8 (silent normal fallback)
        m.width = 5200 + hash(i, 21) * 3600; m.height = m.width * 0.2
        m.rotation = 0.52
        m.position.set(isoX(MAP / 2, MAP / 2) + (hash(i, 23) - 0.5) * 12000, isoY(MAP / 2, MAP / 2) + (hash(i, 29) - 0.5) * 7000)
        m.zIndex = 350000
        world.addChild(m)
        mists.push({ sp: m, vx: 5.5 + hash(i, 31) * 5, vy: 2 + hash(i, 33) * 2 })
      }

      // ---- Thor on the spit ----
      const shadowTex = makeShadow()
      const thorShadow = new Sprite(shadowTex); thorShadow.anchor.set(0.5, 0.5)
      thorShadow.width = 32; thorShadow.height = 16; thorShadow.alpha = 0.62
      world.addChild(thorShadow)
      const THOR_SC = 0.58
      const thor = new Sprite(idle['south'] ?? Texture.WHITE); thor.anchor.set(0.5, 1.0); thor.scale.set(THOR_SC)
      thor.zIndex = 0; world.addChild(thor)
      const jump = { active: false, t: 0 }
      const spawnP = (new URLSearchParams(location.search).get('spawn') ?? '').split(',').map(Number)
      // default spawn: the east arrival bay's sand (the intro's landfall)
      const ecp = coastPoint((315 * Math.PI) / 180)
      const pos = {
        tx: spawnP.length === 2 && !isNaN(spawnP[0]) ? spawnP[0] : Math.round(txOf(ecp.u - ecp.nx * 3.5, ecp.w - ecp.ny * 3.5)),
        ty: spawnP.length === 2 && !isNaN(spawnP[1]) ? spawnP[1] : Math.round(tyOf(ecp.u - ecp.nx * 3.5, ecp.w - ecp.ny * 3.5)),
      }
      let facing = 'south', at = 0
      const walkableAt = (tx: number, ty: number) => coastDist(tx, ty) > 0.4
      const canGo = (tx2: number, ty2: number) => walkableAt(Math.round(tx2), Math.round(ty2))
      const CR = 0.22
      const probeX = (nx: number, aty: number) => {
        const sgn = Math.sign(nx - pos.tx)
        return canGo(nx + sgn * CR, aty - CR) && canGo(nx + sgn * CR, aty + CR)
      }
      const probeY = (ny: number, atx: number) => {
        const sgn = Math.sign(ny - pos.ty)
        return canGo(atx - CR, ny + sgn * CR) && canGo(atx + CR, ny + sgn * CR)
      }

      instance.ticker.add((tk) => {
        const dt = tk.deltaTime
        const wt = performance.now() / 1000
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
          if (ux !== 0 && probeX(ntx, pos.ty)) pos.tx = ntx
          if (uy !== 0 && probeY(nty, pos.tx)) pos.ty = nty
          facing = dirFromAngle(isoX(dx, dy), (dx + dy) * HH)
        }
        const x = isoX(pos.tx, pos.ty), y = isoY(pos.tx, pos.ty)
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
        thor.zIndex = Math.floor(pos.tx + pos.ty) * 16 + 18
        ;(window as unknown as { __thor: object }).__thor = { tx: pos.tx, ty: pos.ty, chunks: chunks.size, anims: waterAnims.size }
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

        // stream the ocean for wherever the camera is, then cull to the screen
        streamOcean(x, y - vh * 0.08 / ZOOM, vw, vh, ZOOM)
        Culler.shared.cull(world, { x: 0, y: 0, width: vw, height: vh })

        // the water breathes: the beach's per-tile two-sine pulse, nothing static
        for (const w2 of waterAnims) {
          const fct = 1 + w2.amp * (Math.sin(w2.ph - wt * 1.05) + 0.55 * Math.sin(w2.ph2 - wt * 0.42 + 1.7))
          w2.sp.tint = shadeHex(w2.base, fct)
        }
        // the tide: every wash rope's points ride their normals through the cycle, the
        // phase lag sweeping the break along the shore — one unbroken lace line washes
        // up the sand, holds, and slides home. Alpha breathes but never dies: a real
        // shore always keeps some working foam at the waterline.
        for (const wsh of washes) {
          for (const p of wsh.pts) {
            const [reach] = tidePhase(wt - wsh.f * TIDE_T / 2 - p.au * 0.352)
            const k = reach * wsh.amp * 0.9 * 32
            p.pt.set(p.bx - p.nx * k, p.by - p.ny * k)
          }
          wsh.rope.alpha = (wsh.f === 0 ? 0.34 : 0.24) + 0.09 * Math.sin(wt * 0.7 + wsh.f * 2.6)
        }
        // the cliff collars: a low breath against the rock, never a bead necklace
        for (const d of dabs) {
          const fsp = d.foam[0]
          const bob = 1.6 * Math.sin(wt * 1.05 + d.arc * 0.03)
          fsp.position.set(d.x + d.nx * bob, d.y + d.ny * bob)
          fsp.zIndex = d.y / HH * 16 + 6
          fsp.alpha = 0.04 + 0.1 * Math.pow(Math.max(0, Math.sin(wt * 0.85 + d.arc * 0.04)), 2)
        }
        // the reef breakers: slow white pulses rolling ALONG the reef line — a breaker
        // sweeps down the reef, swells, and dissolves, offshore where surf really breaks
        for (const b of breakers) {
          const k = Math.pow(Math.max(0, Math.sin(wt * 0.5 - b.arc * 0.16 + b.ph * 0.25)), 2)
          b.sp.alpha = 0.55 * k
          b.sp.scale.y = 0.55 + 0.4 * k
        }
        for (const s of sparkles) {
          const k = Math.max(0, Math.sin(wt * 0.9 + s.ph) - 0.55) / 0.45
          // glints burn brightest inside the sun path, faint outside it
          const inBand = sunBandDist(s.sp.x, s.sp.y) < 950 ? 1 : 0.35
          s.sp.alpha = k * 0.75 * inBand
          s.sp.scale.set(s.sc * (0.7 + 0.3 * k))
          if (k < 0.02) {
            // respawn on WATER, biased toward the sun band
            let wx = 0, wy2 = 0, ok = false
            for (let t2 = 0; t2 < 4; t2++) {
              wx = (vw * (hash(s.ph + t2, wt | 0) - 0.5)) / ZOOM + x
              wy2 = (vh * (hash(s.ph * 3 + t2, wt | 0) - 0.5)) / ZOOM + y
              if (coastDistUW(wx / HW, (wy2 / HH - S0) / 2) >= -0.5) continue // land or shore: retry
              ok = true
              if (sunBandDist(wx, wy2) < 950) break
            }
            if (ok) s.sp.position.set(wx, wy2)
            else s.sp.alpha = 0
          }
        }
        // crest streaks: born in the deep, breathing over long cycles
        if (hash(wt * 9.1, 5) < 0.09) spawnStreak(x, y, vw, vh, ZOOM)
        for (let i = streaks.length - 1; i >= 0; i--) {
          const st = streaks[i]
          st.age += tk.deltaMS
          const k = st.age / st.life
          if (k >= 1) { st.sp.destroy(); streaks.splice(i, 1); continue }
          st.sp.x += 0.35 * tk.deltaMS / 16.7
          st.sp.alpha = 0.22 * Math.sin(Math.PI * k)
        }
        for (const c of clouds) {
          c.sp.x += c.vx * tk.deltaMS / 1000
          c.sp.y += c.vy * tk.deltaMS / 1000
          const lim = 13000
          if (c.sp.x > isoX(MAP / 2, MAP / 2) + lim) c.sp.x -= 2 * lim
          if (c.sp.y > isoY(MAP / 2, MAP / 2) + lim * 0.6) c.sp.y -= 1.2 * lim
        }
        for (const m of mists) {
          m.sp.x += m.vx * tk.deltaMS / 1000
          m.sp.y += m.vy * tk.deltaMS / 1000
          const lim = 12000
          if (m.sp.x > isoX(MAP / 2, MAP / 2) + lim) m.sp.x -= 2 * lim
          if (m.sp.y > isoY(MAP / 2, MAP / 2) + lim * 0.6) m.sp.y -= 1.2 * lim
        }
        resizeFx(vw, vh)
      })

      // ---- atmosphere: clean tropical light, soft vignette (its own map, not the beach) ----
      const sun = new Sprite(radial(512, [[0, 'rgba(235,248,240,0.10)'], [0.5, 'rgba(220,240,235,0.04)'], [1, 'rgba(220,240,235,0)']]))
      sun.anchor.set(0.5); sun.blendMode = 'add'; instance.stage.addChild(sun)
      const vig = new Sprite(radial(512, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0)'], [0.75, 'rgba(6,14,16,0.26)'], [1, 'rgba(4,10,12,0.6)']]))
      instance.stage.addChild(vig)
      const resizeFx = (vw: number, vh: number) => {
        sun.width = sun.height = Math.max(vw, vh) * 1.6; sun.position.set(vw * 0.3, vh * 0.05)
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
function makeShadow() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(40,42,72,0.92)'); g.addColorStop(0.45, 'rgba(40,42,72,0.55)'); g.addColorStop(0.8, 'rgba(40,42,72,0.16)'); g.addColorStop(1, 'rgba(40,42,72,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
