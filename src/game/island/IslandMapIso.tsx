import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Culler, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js'

// THE ISLAND MAP — fresh build 4 (2026-07-05), PHASE 1: THE VAST OCEAN.
//
// Ash's brief: a huge map that is mostly ocean, carrying the beach's water — the only water
// he has ever liked — extended past the bar: alive at every zoom, rolling, no shaders, all
// PixelLab art animated in code. The island (paw + volcano + the two panther heads) lands on
// this water in phase 2; a small sand spit stands in at the center so the shore systems and
// Thor are provable now.
//
// The water DNA is BeachIso.tsx VERBATIM (ramp, variant pools, depth-keyed dither, coherent
// patch mirroring, oversize blend, two-sine swell) — never reinvented (STATE-OF-PLAY §4: four
// reinventions all died). What's NEW here, built ON that system:
//   - CHUNK STREAMING: the map is 384x384 but only viewport chunks exist, with zoom-adaptive
//     tile stride, so the vast ocean costs the same at every zoom.
//   - SWELL TRAINS: a third, long-wavelength brightness wave sweeps the deep in coherent
//     bands — the ocean visibly ROLLS at wide zoom instead of twinkling in place.
//   - WHITECAPS: foam-lace crests fade in on the swell bands, ride them a few feet, and
//     dissolve — sparse, drifting, never cotton balls.
//   - open-water SHOALS: a broad depth drift so a vast ocean has structure, not one flat hue.

const HW = 32, HH = 16
const MAP = 384
const S0 = MAP // tile-space center (192,192) -> s = 384
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
const DEPTH_UW = 15 // the beach's exact 30-diagonal drama band

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

// ---- phase-1 geometry: the dev spit (the paw replaces this in phase 2; every shore/depth
// code path below is the real one) ----
const uOf = (tx: number, ty: number) => tx - ty
const wOf = (tx: number, ty: number) => (tx + ty - S0) / 2
const SPIT_R = 7
function coastDistUW(u: number, w: number) {
  const r = Math.hypot(u, w)
  return SPIT_R + 0.9 * Math.sin(3 * Math.atan2(-w, u) + 1.2) - r
}
const coastDist = (tx: number, ty: number) => coastDistUW(uOf(tx, ty), wOf(tx, ty))

/** the smooth depth field (tiles add their own per-tile dither; the veil reads it raw):
 *  contour-wander keeps ramp stops from drawing rings on a closed coast; a faint shoal
 *  drift keeps the vast deep from sitting at one exact hue */
function depField(u: number, w: number) {
  const cd = coastDistUW(u, w)
  if (cd >= 0) return -1
  const cdN = cd - 3.2 * (vnoise(u / 9 + 14, w / 9 + 5) - 0.5) * 2 * smooth01(-cd / 4)
  const raw = -cdN / DEPTH_UW
  const shoal = (vnoise(u / 34 + 9, w / 34 + 3) - 0.5) * 0.12 * smooth01(raw * 2)
  return Math.max(0, raw + shoal)
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
      ])
      const sandV: Texture[] = [], waterV: Texture[] = []
      await Promise.all([
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-n/${i}.png`).then((t) => { sandV[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/water-n/${i}.png`).then((t) => { waterV[i] = t }).catch(() => {})),
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
        const cd = coastDistUW(u, w)
        const isSea = cd < 0
        let base: Texture | undefined
        let dep = 0
        if (isSea) {
          const raw = depField(u, w)
          // dither widened a step past the beach's (reviewer: dissolve the ramp contours);
          // boosted further at coarse strides where banding is the bigger enemy
          const dAmp = (raw < 0.14 ? 0.1 : raw < 0.55 ? 0.034 : 0.055) * (stride > 1 ? 1.6 : 1)
          dep = Math.min(1, Math.max(0, raw + (hash(tx * 7.7, ty * 5.3) - 0.5) * dAmp))
          // THE CHECKER KILLER (reviewer fix #1): texture busyness is selected by LOW-
          // FREQUENCY world noise, not per-tile hash — glass and textured tiles arrive in
          // organic 3-4 tile patches (sun on water), never alternating diamonds. The
          // visible band leans glassy; busy swell texture lives deep, under the veil.
          const vsel = vnoise(tx / 3.5 + 50, ty / 3.5 + 9)
          const pool = dep < 0.3 ? (vsel < 0.72 ? W_CALM : W_SOFT)
            : dep < 0.55 ? (vsel < 0.5 ? W_CALM : W_SOFT)
              : dep < 0.75 ? (vsel < 0.55 ? W_SOFT : W_TEX)
                : (vsel < 0.5 ? W_TEX : W_SWELL)
          base = waterV[pool[Math.floor(vnoise(tx / 2.6 + 21, ty / 2.6 + 33) * pool.length) % pool.length]]
        } else {
          base = sandV[SAND_COMMON[Math.floor(hash(tx * 3.3, ty * 4.1) * SAND_COMMON.length)]]
        }
        if (!base) return
        const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
        const fx = vnoise(tx / 7 + 4, ty / 7 + 11) > 0.5 ? -1 : 1
        const os = (isSea ? 1.12 : 1.06) * stride
        sp.scale.set(fx * os, os)
        // the dev spit lies flat — lift stagger on bare sand tiles reads as shingles
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
          // wet waterline -> warm dry -> pale high sand (the beach's full sand read)
          const col = cd < 1.4
            ? mix(0xb5945e, 0xd8bd86, Math.min(1, Math.max(0, cd / 1.4)))
            : rampAt([[0, 0xd8bd86], [0.55, 0xead6a3], [1, 0xf0e2b4]], Math.min(1, (cd - 1.4) / 4.5))
          sp.tint = tintFor(shadeHex(col, 0.985 + 0.03 * hash(tx, ty)), SAND_BASE)
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
        // ---- the beach's AERIAL VEIL, chunk-sized: a soft canvas ABOVE the tiles melts
        // their texture into the abyss with depth (the beach's exact alpha curve; this is
        // what keeps far water smooth without touching tile opacity) ----
        const X0 = cx * CH, X1 = (cx + 1) * CH, Y0 = cy * CH, Y1 = (cy + 1) * CH
        const RES = 4
        const px0 = (X0 - Y1) * HW - HW, py0 = (X0 + Y0) * HH - HH
        const cw = Math.ceil(((2 * CH + 2) * HW) / RES), chh = Math.ceil(((2 * CH + 2) * HH) / RES)
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = chh
        const g = cv.getContext('2d')!
        const img = g.createImageData(cw, chh)
        const px = img.data
        let any = false
        for (let cyy = 0; cyy < chh; cyy++) {
          const wy = py0 + (cyy + 0.5) * RES
          const w2 = (wy / HH - S0) / 2
          for (let cxx = 0; cxx < cw; cxx++) {
            const wx = px0 + (cxx + 0.5) * RES
            const u2 = wx / HW
            const dep = depField(u2, w2)
            if (dep < 0.09) continue
            const k = Math.min(1, (dep - 0.09) / 0.48)
            let a = 0.5 * k * k * (3 - 2 * k)
            if (dep > 0.78) { const kk = Math.min(1, (dep - 0.78) / 0.22); a += 0.24 * kk * kk }
            a *= 0.86 + 0.28 * vnoise(wx / 1250 + 3.2, wy / 720 + 8.1)
            if (a <= 0) continue
            const col = rampAt(W_RAMP, Math.min(1, dep + 0.1))
            const o = (cyy * cw + cxx) * 4
            px[o] = (col >> 16) & 255; px[o + 1] = (col >> 8) & 255; px[o + 2] = col & 255
            px[o + 3] = Math.round(Math.min(1, a) * 255)
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

      // ---- THE SPIT'S SURF (the beach's living tide wrapped around the stand-in coast —
      // proves the shore systems on this map; the paw inherits them) ----
      const TIDE_T = 9, TIDE_AMP = 1.4
      const tidePhase = (u: number): [number, number] => {
        u = ((u % TIDE_T) + TIDE_T) % TIDE_T
        if (u < 2.2) { const k = u / 2.2, e = 1 - Math.pow(1 - k, 3); return [e, 0.45 + 0.55 * k] }
        if (u < 2.9) return [1, 1]
        if (u < 6.6) { const k = (u - 2.9) / 3.7, e = 0.5 - 0.5 * Math.cos(Math.PI * k); return [1 - e, 1 - 0.8 * k] }
        const k = (u - 6.6) / (TIDE_T - 6.6)
        return [0, 0.2 * (1 - k)]
      }
      type Dab = { x: number; y: number; nx: number; ny: number; arc: number; foam: Sprite[]; skirt?: Sprite; flankK: number }
      const dabs: Dab[] = []
      if (tex['skirt'] && tex['foamlace']) {
        const skT = tex['skirt']
        let arc = 0, prev: { x: number; y: number } | null = null
        for (let th = 0; th < Math.PI * 2; th += 1.0 / (SPIT_R + 2)) {
          const rr = SPIT_R + 0.9 * Math.sin(3 * th + 1.2)
          const u = rr * Math.cos(th), w = -rr * Math.sin(th)
          const x = isoX(MAP / 2, MAP / 2) + u * HW, y = isoY(MAP / 2, MAP / 2) + w * 2 * HH
          if (prev) arc += Math.hypot(x - prev.x, y - prev.y)
          prev = { x, y }
          let nx = Math.cos(th), ny = -Math.sin(th)
          const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl
          const flankK = Math.min(1, Math.abs(nx) / 0.85)
          const fr = new Rectangle(Math.floor(arc) % Math.max(32, skT.width - 32), 0, 32, skT.height)
          // seam + skirt hang toward the WATER side: flip on the up-screen arc or they
          // drape onto the sand
          const flipV = ny < 0 ? -1 : 1
          const seam = new Sprite(new Texture({ source: skT.source, frame: fr }))
          seam.anchor.set(0.5, 0.3); seam.scale.set(1, 0.55 * flipV); seam.tint = 0x113238; seam.alpha = 0.45
          seam.position.set(x, y); seam.zIndex = (y / HH) * 16 + 1; seam.cullable = true
          world.addChild(seam)
          const skirt = new Sprite(new Texture({ source: skT.source, frame: fr }))
          skirt.anchor.set(0.5, 0.62); skirt.scale.set(1, 1.5 * flipV); skirt.alpha = 0.6
          skirt.position.set(x, y); skirt.zIndex = (y / HH) * 16 + 2; skirt.cullable = true
          world.addChild(skirt)
          const d: Dab = { x, y, nx, ny, arc, foam: [], skirt, flankK }
          for (let f = 0; f < 2; f++) {
            const laceT = (f === 1 && tex['foamlace2']) ? tex['foamlace2'] : tex['foamlace']
            const period = Math.max(32, laceT.width - 32)
            const off = Math.floor(arc + f * 160) % period
            const fsp = new Sprite(new Texture({ source: laceT.source, frame: new Rectangle(off, 0, 32, laceT.height) }))
            fsp.anchor.set(0.5, 0.84)
            if (ny < 0) fsp.scale.y = -1
            fsp.position.set(x, y); fsp.alpha = 0; fsp.cullable = true
            world.addChild(fsp); d.foam.push(fsp)
          }
          dabs.push(d)
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
        if (!tex['foamlace'] || streaks.length >= 14) return
        for (let tries = 0; tries < 5; tries++) {
          const wx = camX + (hash(performance.now() * 1.3, tries) - 0.5) * vw / zoom * 1.2
          const wy = camY + (hash(performance.now() * 2.7, tries * 3) - 0.5) * vh / zoom * 1.2
          const uu = wx / HW, ww = (wy / HH - S0) / 2
          if (depField(uu, ww) < 0.5) continue
          const laceT = hash(wx, wy) > 0.5 && tex['foamlace2'] ? tex['foamlace2'] : tex['foamlace']
          const off = Math.floor(hash(wy, wx) * Math.max(32, laceT.width - 60))
          const sp = new Sprite(new Texture({ source: laceT.source, frame: new Rectangle(off, 0, 56, laceT.height) }))
          sp.anchor.set(0.5, 0.6); sp.tint = 0xeafff8
          sp.scale.set(1.5, 0.5); sp.alpha = 0
          sp.position.set(wx, wy); sp.zIndex = (wy / HH) * 16 + 5; sp.cullable = true
          world.addChild(sp)
          streaks.push({ sp, age: 0, life: 9000 + hash(wx * 3, wy) * 5000 })
          break
        }
      }
      const clouds: { sp: Sprite; vx: number; vy: number }[] = []
      for (let i = 0; i < 6; i++) {
        const c = new Sprite(radial(256, [[0, 'rgba(8,26,32,0.13)'], [0.55, 'rgba(8,26,32,0.07)'], [1, 'rgba(8,26,32,0)']]))
        c.anchor.set(0.5); c.blendMode = 'multiply'
        c.width = 2000 + hash(i, 3) * 1800; c.height = c.width * 0.36
        c.position.set(isoX(MAP / 2, MAP / 2) + (hash(i, 7) - 0.5) * 9000, isoY(MAP / 2, MAP / 2) + (hash(i, 9) - 0.5) * 5000)
        c.zIndex = 400000
        world.addChild(c)
        clouds.push({ sp: c, vx: 7 + hash(i, 11) * 6, vy: 2.6 + hash(i, 13) * 2.4 })
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
      const pos = {
        tx: spawnP.length === 2 && !isNaN(spawnP[0]) ? spawnP[0] : MAP / 2 + 2,
        ty: spawnP.length === 2 && !isNaN(spawnP[1]) ? spawnP[1] : MAP / 2 + 2,
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
        // the spit's tide
        for (const d of dabs) {
          for (let f = 0; f < d.foam.length; f++) {
            const [reach, foamA] = tidePhase(wt - f * TIDE_T / 2 - d.arc * 0.011)
            const amp = TIDE_AMP * (1 - 0.85 * d.flankK)
            const ox = -d.nx * reach * amp * HW * 0.9, oy = -d.ny * reach * amp * 2 * HH * 0.9
            const fsp = d.foam[f]
            fsp.position.set(d.x + ox, d.y + oy)
            fsp.zIndex = (d.y + oy) / HH * 16 + 6
            fsp.alpha = foamA * 0.85 * (1 - 0.55 * d.flankK)
          }
          if (d.skirt) d.skirt.position.y = d.y + 1.2 * Math.sin(wt * 0.9 + d.arc * 0.02)
        }
        for (const s of sparkles) {
          const k = Math.max(0, Math.sin(wt * 0.9 + s.ph) - 0.55) / 0.45
          // glints burn brightest inside the sun path, faint outside it
          const inBand = sunBandDist(s.sp.x, s.sp.y) < 950 ? 1 : 0.35
          s.sp.alpha = k * 0.75 * inBand
          s.sp.scale.set(s.sc * (0.7 + 0.3 * k))
          if (k < 0.02) {
            // respawn biased toward the band: most tries land in the light
            let wx = 0, wy2 = 0
            for (let t2 = 0; t2 < 3; t2++) {
              wx = (vw * (hash(s.ph + t2, wt | 0) - 0.5)) / ZOOM + x
              wy2 = (vh * (hash(s.ph * 3 + t2, wt | 0) - 0.5)) / ZOOM + y
              if (sunBandDist(wx, wy2) < 950) break
            }
            s.sp.position.set(wx, wy2)
          }
        }
        // crest streaks: born in the deep, breathing over long cycles
        if (hash(wt * 9.1, 5) < 0.05) spawnStreak(x, y, vw, vh, ZOOM)
        for (let i = streaks.length - 1; i >= 0; i--) {
          const st = streaks[i]
          st.age += tk.deltaMS
          const k = st.age / st.life
          if (k >= 1) { st.sp.destroy(); streaks.splice(i, 1); continue }
          st.sp.x += 0.35 * tk.deltaMS / 16.7
          st.sp.alpha = 0.15 * Math.sin(Math.PI * k)
        }
        for (const c of clouds) {
          c.sp.x += c.vx * tk.deltaMS / 1000
          c.sp.y += c.vy * tk.deltaMS / 1000
          const lim = 9000
          if (c.sp.x > isoX(MAP / 2, MAP / 2) + lim) c.sp.x -= 2 * lim
          if (c.sp.y > isoY(MAP / 2, MAP / 2) + lim * 0.6) c.sp.y -= 1.2 * lim
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
