import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Texture } from 'pixi.js'
import {
  isoX, isoY, hash, vnoise, shadeHex, rampAt, tintFor,
  loadWaterVariants, seaTile, animSwells, type SwellSprite,
} from '../ocean'
import { CX, CY, coastDs, coastR, shelfW, lagoonK, cliffK, setSkeleton, CHANNEL, lavaDist, LAVA } from './terrain'
import { coneLvl, coneBand, coneH, gullyK, craterK, coneLit, stripeK } from './volcano'

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
}
// the coast grammar mask lives in terrain.ts (cliffK) — one truth for elevation, sand
// gating and the underwater shelf alike
const cliffMask = cliffK
// the coast masks sample azimuth through a soft wander so cliff↔beach handoffs meander
// like geology instead of cutting along straight radial lines
const thJit = (tx: number, ty: number) =>
  Math.atan2(ty - CY, tx - CX) + 0.22 * (vnoise(tx / 9 + 21, ty / 9 + 13) - 0.5)

// GOLDEN-HOUR sun rake (Ash: kill the bland flat colours, make it a low sunset). +1 = full
// sunlit (screen upper-left, toward the low sun), -1 = shade (lower-right). Screen-up = small
// (tx+ty); screen-left = small (tx-ty). This is what lifts the flat plateau off a dead slab.
const rakeAt = (tx: number, ty: number) => {
  const up = (CX + CY) - (tx + ty)   // + = higher on screen (toward the sun)
  const left = (ty - tx)             // + = further screen-left (toward the sun)
  // soft saturation, not a hard clamp — the clamp's kink lines (and the zero crossing)
  // quantized into visible zigzag contours running across the whole flat interior
  const r = (up * 0.8 + left * 0.45) / 44
  return r / (1 + Math.abs(r))
}
const clampB = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
// warm the sunlit side toward gold, cool the shade side toward violet-blue (the sunset split)
const warmCool = (hex: number, rk: number) => {
  let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255
  if (rk >= 0) { const t = rk * 0.15; r += (255 - r) * t; g += (222 - g) * t * 0.55; b -= b * t * 0.18 }
  else { const t = -rk * 0.17; r -= r * t * 0.12; g -= g * t * 0.04; b += (205 - b) * t * 0.32 }
  return (clampB(Math.round(r)) << 16) | (clampB(Math.round(g)) << 8) | clampB(Math.round(b))
}

// THE ISLAND MAP, v5 (2026-07-02, Ash's construction order) — the island's terrain is
// built IN THE TILE SYSTEM on the iso engine, exactly like the beach built its ground:
//   1. the EMPTY ISLAND: the entire landmass is the default sand-beach tiles (the
//      beach's normalized sand-n family + its dry-sand ramp) sitting on the live sea.
//   2. a NEW soft light-green tropical grass tile family lays OVER the interior, so the
//      sand survives as the coast fringe — bon3's exact read (peach ring, green heart).
//   3. only then, gated one at a time: gentle elevation, the volcano, vegetation,
//      lagoon detail. NO pasted scene-PNGs — every visible thing is a tile or a
//      properly placed sprite the engine sorts.
// The sea is the shared ocean module (Ash: "really good if not perfect"), untouched.

const COLS = 200, ROWS = 200 // a vast, mostly-ocean map
const SEA_R = 94 // live sea builds inside this radius; beyond it the far field has
// flattened into the abyss color, which IS the app background — endless without 100k sprites

// the sailing sea's depth profile (unchanged — approved). Shelf hugs the coast, widens
// into the lagoon windows, open sea holds dark-but-alive, far field eases to the abyss.
function dsAt(tx: number, ty: number) {
  const ds = coastDs(tx, ty)
  if (ds >= 0) return ds
  const w = shelfW(tx, ty)
  const c = -ds
  let cEff = c <= w ? c * (3.5 / w) : 3.5 + (c - w)
  const th = Math.atan2(ty - CY, tx - CX)
  let dth = Math.abs(th - CHANNEL.theta)
  if (dth > Math.PI) dth = Math.PI * 2 - dth
  // both boosts EASE out past the shelf lip — the old hard if-gates printed a seam ring
  // (a dim rectangle-read east of the island) where the terms switched off mid-water
  const fade = 1 - smooth(w, w * 1.4, c)
  cEff += Math.max(0, 1 - dth / CHANNEL.w) * lagoonK(tx, ty) * 7 * fade
  cEff += Math.max(0, vnoise(tx / 4.5 + 11, ty / 4.5 + 4) - 0.58) * lagoonK(tx, ty) * 6 * fade
  if (cEff <= 18) return -cEff
  if (cEff <= 40) return -(18 + (cEff - 18) * 0.27)
  return -Math.min(30, 24 + (cEff - 40) * 0.2)
}

// the beach's dry-sand language (BeachIso's own values): warm near the water, paling
// inland, broad dune drift + fine grain so the field reads worked-in, never flat
const SAND_BASE = [246, 229, 180]
const SAND_RAMP: [number, number][] = [[0, 0xdcbf87], [0.45, 0xead6a3], [1, 0xf7ecc2]]
// the NEW tropical grass family (normalized to its own shared base when it lands);
// value ramp: sunlit warm light-green at the fringe -> a touch richer inland
const GRASS_BASE = [126, 158, 96]
// widened for golden hour: a warm dry sun-green at the light end, a deep cool green in the
// hollows — the sun rake (warmCool) then splits warm/cool across it so the field reads lit
// warmed a step toward bon3's golden-green (the sunlit meadow is gold-kissed, the
// hollows keep the cool deep green)
const GRASS_RAMP: [number, number][] = [[0, 0xbcc468], [0.5, 0x9cb058], [1, 0x6f8c42]]

export default function IslandMapIso() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let destroyed = false
    let instance: Application | null = null

    const start = async () => {
      const app = new Application()
      await app.init({ background: new URLSearchParams(location.search).get('bgtest') ? '#ff00ff' : '#073442', resizeTo: host, antialias: false })
      if (destroyed) { app.destroy(true); return }
      instance = app
      host.appendChild(app.canvas)

      const params = new URLSearchParams(location.search)
      // ?dbg=1 — forensic overlay: pure-hue tints per wall draw type (front faces RED,
      // corner plugs YELLOW, back fills BLUE, back-corner nubs MAGENTA) so a screenshot
      // says exactly which draw call owns every rock pixel. Never ships.
      const DBG = !!params.get('dbg')
      // ?nocone=1 — render the approved base only (flat plateau, no block cone, no lava):
      // the clean stage the painted volcano hero is composited onto (final-push plan §2)
      const NOCONE = !!params.get('nocone')
      // ?probe=fills|plugs|props|sky — temporarily skip one draw layer to isolate an
      // artifact empirically (dbg tints only go so far). Never ships.
      const PROBE = params.get('probe') || ''
      const ZOOM = Number(params.get('zoom') || 0.62) || 0.62
      const cam = (params.get('cam') || `${CX},${CY}`).split(',').map(Number)
      const camTx = cam[0] ?? CX, camTy = cam[1] ?? CY
      // HEIGHT-TILE terrain: real per-tile elevation levels (→ faces, collision, depth)
      const NLEV = Number(params.get('nlev') || 5)   // discrete elevation levels (real tiles)
      const STEP = Number(params.get('step') || 20)  // world px per elevation level (taller = vaster cliffs)

      const sandV: Texture[] = []
      const grassV: Texture[] = []
      let waterV: Texture[] = []
      let faceTex: Texture | undefined
      await Promise.all([
        fetch('/art/island/skeleton.json').then((r) => r.json()).then(setSkeleton).catch(() => {}),
        loadWaterVariants().then((v) => { waterV = v }),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-n/${i}.png`).then((t: Texture) => { sandV[i] = t }).catch(() => {})),
        // the new tropical grass variants (staged as they come out of the normalizer)
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/grass-n/${i}.png`).then((t: Texture) => { grassV[i] = t }).catch(() => {})),
        Assets.load('/art/island/cliffs/face-cliff.png').then((t: Texture) => { t.source.scaleMode = 'nearest'; faceTex = t }).catch(() => {}),
      ])
      if (destroyed) return

      const world = new Container()
      world.scale.set(ZOOM)
      world.sortableChildren = true
      app.stage.addChild(world)

      // GOLDEN HOUR (Ash): the island wears the beach's own late-sun grade — one world,
      // one light. Rich warmth, blue pulled down, the teal sea stays alive under it.
      const grade = new ColorMatrixFilter()
      // c3's read is CLEAR and deep, not milky: more chroma + contrast, and the blue
      // channel keeps enough life that the teal sea and violet shade stay saturated
      grade.brightness(1.02, false); grade.saturate(0.22, true); grade.contrast(0.09, true)
      const wm = grade.matrix; wm[0] *= 1.12; wm[6] *= 1.02; wm[12] *= 0.88; grade.matrix = wm
      world.filters = [grade]

      // THE ISLAND HEIGHTFIELD (real elevation data → faces, collision, depth). Low
      // beaches at the water, terraces rising inland, up to the volcano — organic
      // (spokes + noise), never concentric rings. Beaches (the designed bays) stay at
      // sea level; cliff coasts are already raised right at the water.
      const elevF = (tx: number, ty: number): number => {
        if (coastDs(tx, ty) <= 0) return 0
        const th = Math.atan2(ty - CY, tx - CX)
        const R = coastR(th)
        const d = Math.hypot(tx - CX, ty - CY)
        const u = Math.max(0, 1 - d / R)                    // 0 coast → 1 centre
        // FRESH TERRAIN v2 (2026-07-05, Ash's c3 steer: NO terracing — mostly FLAT, raised
        // HIGH, tall cliffs, only a couple small steps). The interior is one FLAT raised
        // PLATEAU (the volcano rises from it later — nothing to un-terrace). Two coast types:
        //   • CLIFF coasts (screen N + W, c3): the plateau runs to the waterline and drops as
        //     ONE tall banded cliff — "flat, just raised high with the cliffs".
        //   • BEACH coasts (most of the ring, bon3): the plateau steps DOWN over a short band
        //     (a couple steps) to a wide flat sand shelf at the water.
        const cliffAmt = cliffMask(thJit(tx, ty))
        const PLATEAU = Number(params.get('plat') || 0.62)  // the flat raised interior (~level 3)
        let e = PLATEAU
        // a WIDE flat sand shelf at the coast (Ash: much more beach), then a short 2-step ramp
        // up to the plateau. beachShelf = 1 for the outer band → e forced to sea-level sand.
        // The cliff factor is HARDENED (smooth-thresholded): a cliff azimuth holds the full
        // plateau all the way to the waterline. The old linear taper left partial-height bands
        // whose wandering contours shed rock-face dashes all over the flat interior.
        const bw = Number(params.get('bw') || 0.2)          // beach width (fraction of radius)
        const cf = smooth(0.3, 0.55, cliffAmt)
        const beachShelf = (1 - cf) * (1 - smooth(bw, bw + 0.1, u))
        e *= 1 - beachShelf
        return Math.max(0, Math.min(1, e))
      }
      const levelAt = (tx: number, ty: number): number =>
        coastDs(tx, ty) <= 0 ? 0 : Math.round(elevF(tx, ty) * NLEV)

      // ---- the ground: live sea outside, tile terrain on the island ----
      const foamTex = radial(48, [[0, 'rgba(255,255,255,0.85)'], [0.45, 'rgba(224,248,242,0.4)'], [1, 'rgba(224,248,242,0)']])

      // TILE-UNIT VALIDATION (?tiletest=1): a small terraced hill built from REAL 3D
      // iso block tiles (decorated top + decorated sides + height), drawn back-to-front
      // so they occlude naturally. Proving the UNIT before anything touches the island.
      const TILETEST = !!params.get('tiletest')
      if (TILETEST) {
        // ---- THE ISLAND as FLAT, BLENDED ground (the beach map's language) with real
        // rock WALLS only where the land steps DOWN. The killer lesson: at map zoom a
        // block-per-tile reads as Minecraft; a flat blended TOP surface (front neighbours
        // hide any thickness) melts into one skin exactly like the old sand+grass map, and
        // height shows only as cliffs/steps at the coast + massif. Tops = clean flat
        // diamonds (masked from the tile blocks); walls = rock strata sized to the drop. ----
        const flatG: Texture[] = [], flatS: Texture[] = [], rockW: Texture[] = []
        for (let i = 0; i < 16; i++) {
          try { const t: Texture = await Assets.load(`/art/island/flat/grass-${i}.png?v=7`); t.source.scaleMode = 'nearest'; flatG.push(t) } catch { /* */ }
          try { const t: Texture = await Assets.load(`/art/island/flat/sand-${i}.png?v=7`); t.source.scaleMode = 'nearest'; flatS.push(t) } catch { /* */ }
        }
        // the WARM blocks: rock-N's carved sides remapped onto c3's sunlit terracotta ramp
        // (the original maroon sat at 0.35-0.5 luminance — the golden grade crushed it to
        // the near-black dashes; a multiply tint can only darken, so brightness must live
        // in the ASSET). Moss tops untouched (they peek 2px past the flat top: a grass lip).
        const sideW: Texture[] = []                           // mossless: lower courses + wet feet
        const volcW: Texture[] = []                           // the volcano's basalt courses
        const volcT: Texture[] = []                           // bare basalt flat tops (upper cone)
        const sideL: Texture[] = []                           // the cone's lit-amber remap
        for (let i = 2; i <= 5; i++) {
          try { const t: Texture = await Assets.load(`/art/island/blocks3/rock-${i}-warm.png`); t.source.scaleMode = 'nearest'; rockW.push(t) } catch { /* */ }
          try { const t: Texture = await Assets.load(`/art/island/blocks3/rock-${i}-side.png`); t.source.scaleMode = 'nearest'; sideW.push(t) } catch { /* */ }
          try { const t: Texture = await Assets.load(`/art/island/blocks3/rock-${i}-lit.png`); t.source.scaleMode = 'nearest'; sideL.push(t) } catch { /* */ }
          try { const t: Texture = await Assets.load(`/art/island/blocks3/volc-${i}-side.png`); t.source.scaleMode = 'nearest'; volcW.push(t) } catch { /* */ }
        }
        for (let i = 0; i < 16; i++) {
          try { const t: Texture = await Assets.load(`/art/island/flat/volc-${i}.png`); t.source.scaleMode = 'nearest'; volcT.push(t) } catch { /* */ }
        }
        // MOLTEN tile tops (self-bright, untinted): lava2-0..7 = the flowing river,
        // lava2-8..11 = the white-hot crater lake. The old ember-fleck lava-N family
        // read as dark gravel ("pathetic") — molten means BRIGHT.
        const lavaT: Texture[] = []
        const lakeT: Texture[] = []
        for (let i = 0; i < 8; i++) {
          try { const t: Texture = await Assets.load(`/art/island/flat/lava2-${i}.png`); t.source.scaleMode = 'nearest'; lavaT.push(t) } catch { /* */ }
        }
        for (let i = 8; i < 12; i++) {
          try { const t: Texture = await Assets.load(`/art/island/flat/lava2-${i}.png`); t.source.scaleMode = 'nearest'; lakeT.push(t) } catch { /* */ }
        }
        if (!lavaT.length) for (let i = 0; i < 4; i++) {
          try { const t: Texture = await Assets.load(`/art/island/flat/lava-${i}.png`); t.source.scaleMode = 'nearest'; lavaT.push(t) } catch { /* */ }
        }
        // THE VSLOPE FAMILY (final-push stage 1): the cone's skin. Tops + faces harvested
        // off the picked volc-a painting, normalized to ONE shared lit-amber base — every
        // value change on the flank comes from the coneTint field in long runs, never
        // from per-course art flips (the value flip at each lip WAS the ziggurat read).
        const vsT: Texture[] = []
        const vsF: Texture[] = []
        for (let i = 0; i < 16; i++) {
          try { const t: Texture = await Assets.load(`/art/island/vslope/top-${i}.png`); t.source.scaleMode = 'nearest'; vsT.push(t) } catch { /* */ }
        }
        for (let i = 0; i < 8; i++) {
          try { const t: Texture = await Assets.load(`/art/island/vslope/face-${i}.png`); t.source.scaleMode = 'nearest'; vsF.push(t) } catch { /* */ }
        }
        const gt = flatG.length ? flatG : grassV.filter(Boolean)
        const st = flatS.length ? flatS : sandV.filter(Boolean)
        // DISCRETE 3D iso TILES (Ash's locked spec — NOT smooth hillshade): each land tile
        // sits at a discrete elevation LEVEL, its flat top blends into the surface, and its
        // real 3D comes from DECORATED SIDE FACES on the downhill edges. Beach sand lives ONLY
        // in the designed BAYS (never bleeding inside the cliff coasts).
        // WIDE beaches on the non-cliff coasts (bon3), the flat sea-level sand shelf; the
        // cliff coasts (screen N + W) meet the water as raised banded rock, never sand.
        // the LEVEL GRID — the beach ramp is authored as CONTIGUOUS BENCHES that follow the
        // coast (bands of coastDs with one low-freq wiggle), not a rounded continuous field:
        // rounding made the mid-levels scatter into busy 1-tile interleaved strips. Cliff
        // azimuths hold the full plateau to the waterline; the two benches are the "2 small
        // steps" between beach and plateau. Then cleaned: a lone tile whose level matches no
        // neighbour snaps to the level most of them share.
        const PLAT_L = 3
        // THE CONE'S OWN STEP (the slope-surface fix): at STEP 20 > the 16px row
        // spacing, a 1-level-per-tile slope draws MORE WALL THAN TOP — the flank became
        // thousands of tiny cliffs (the herringbone). Cone levels above the plateau rise
        // CSTEP px instead: tops tile into a continuous visible slope with thin crease
        // faces, exactly how a painted mountain shows its surface. Coast/bench levels
        // keep STEP (tall cliffs are their whole point). Back-steps also nearly close
        // (10 < 16), so the descending-away voids collapse to slivers.
        const CSTEP = Number(params.get('cstep') || 10)
        const liftOf = (l: number) =>
          l <= 0 ? 0 : Math.min(l, PLAT_L) * STEP + Math.max(0, l - PLAT_L) * CSTEP
        // gentler + longer-wave than the old /9 x2.4: the tight jitter carved 1-tile notches
        // into every bench line — the "badly cut paper cutout" zigzag. Long straight runs
        // with occasional 2-3 tile steps is how c3 draws its terrace lines.
        const bandJ = (tx: number, ty: number) => (vnoise(tx / 14 + 31, ty / 14 + 47) - 0.5) * 1.6
        // TRUE DISTANCE-TO-SEA (a BFS distance transform on the tile grid). The radial
        // coastDs approximation collapses inside protruding lobes — its "near-coast" bands
        // reached deep into the island, dragging bench walls across the interior (the
        // zigzag), bloating the beach and eating the plateau the volcano needs. With real
        // distance the contours PARALLEL the coastline everywhere: tight steps at the edge,
        // the plateau owning the whole interior. This grid is also the future collision truth.
        const DIST = new Float32Array(COLS * ROWS).fill(1e9)
        {
          const qx: number[] = [], qy: number[] = []
          for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
            if (coastDs(tx, ty) <= 0) { DIST[ty * COLS + tx] = 0; qx.push(tx); qy.push(ty) }
          }
          const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
          for (let h = 0; h < qx.length; h++) {
            const x = qx[h], y = qy[h], d = DIST[y * COLS + x]
            for (const [ox, oy] of NB8) {
              const nx = x + ox, ny = y + oy
              if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
              if (DIST[ny * COLS + nx] > d + 1) { DIST[ny * COLS + nx] = d + 1; qx.push(nx); qy.push(ny) }
            }
          }
        }
        // SMOOTH the distance field before banding: the raw BFS distance is integer
        // chamfer, so its level sets are inherently 1-tile staircases wherever the coast
        // runs diagonally — the "badly cut paper cutout" chop. Two 3x3 mean passes turn
        // it into a continuous field whose contours hold long straight runs and round
        // the corners; the bench thresholds then cut clean terrace lines.
        for (let pass = 0; pass < 2; pass++) {
          const src = Float32Array.from(DIST)
          for (let ty = 1; ty < ROWS - 1; ty++) for (let tx = 1; tx < COLS - 1; tx++) {
            let sum = 0
            for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) sum += src[(ty + oy) * COLS + tx + ox]
            DIST[ty * COLS + tx] = sum / 9
          }
        }
        // PURE-AZIMUTH grammar (no per-tile jitter in discrete decisions); the low-freq
        // bandJ wiggle is the only organic term. Beach azimuths: a generous flat sand shelf,
        // then the "2 small steps" right at the plateau edge. Cliff azimuths: plateau to water.
        const lvlOf = (tx: number, ty: number) => {
          if (coastDs(tx, ty) <= 0) return -1
          const d = DIST[ty * COLS + tx]
          const cf = smooth(0.35, 0.6, cliffMask(Math.atan2(ty - CY, tx - CX)))
          const j = bandJ(tx, ty) * 0.7
          // tighter shelf (Ash: the wide beach ate the plateau the volcano needs) —
          // ~4 tiles of sand, then the two steps hugging the plateau edge
          const beachL = d <= 4.5 + j ? 0 : d <= 6 + j ? 1 : d <= 7.5 + j ? 2 : PLAT_L
          const base = Math.round(beachL * (1 - cf) + PLAT_L * cf)
          // THE VOLCANO rises out of the flat plateau (handoff §6): extra J-curve levels
          // from the cone field. Only full-plateau tiles climb — the coast grammar
          // (beaches, benches, cliffs) never feels the mountain.
          return !NOCONE && base >= PLAT_L ? base + coneLvl(tx, ty) : base
        }
        const LV = new Int8Array(COLS * ROWS)
        for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
          LV[ty * COLS + tx] = lvlOf(tx, ty)
        }
        for (let pass = 0; pass < 3; pass++) {
          const prev = Int8Array.from(LV)
          for (let ty = 1; ty < ROWS - 1; ty++) for (let tx = 1; tx < COLS - 1; tx++) {
            const L = prev[ty * COLS + tx]
            if (L < 0) continue
            // the snap is a COAST cleaner; on the cone it flattened the tight upper
            // rings into wide terraces — the volcano's levels are authored, leave them
            if (L > PLAT_L) continue
            const nb = [prev[ty * COLS + tx + 1], prev[ty * COLS + tx - 1], prev[(ty + 1) * COLS + tx], prev[(ty - 1) * COLS + tx]]
            if (nb.includes(L)) continue
            const land = nb.filter((v) => v >= 0)
            if (!land.length) continue
            const counts = new Map<number, number>()
            for (const v of land) counts.set(v, (counts.get(v) || 0) + 1)
            let best = L, bc = 1
            for (const [v, c] of counts) if (c > bc || (c === bc && v !== L)) { best = v; bc = c }
            if (bc >= 2) LV[ty * COLS + tx] = best
          }
        }
        // SPIKE KILLER: a bench tile standing HIGHER than 3+ of its land neighbours is a
        // 1-tile promontory — an isolated tall wall column that reads as a floating
        // plank (Ash circled two). Snap it down to its tallest neighbour.
        {
          const prev = Int8Array.from(LV)
          for (let ty = 1; ty < ROWS - 1; ty++) for (let tx = 1; tx < COLS - 1; tx++) {
            const L = prev[ty * COLS + tx]
            if (L <= 0 || L > PLAT_L) continue
            const nb = [prev[ty * COLS + tx + 1], prev[ty * COLS + tx - 1], prev[(ty + 1) * COLS + tx], prev[(ty - 1) * COLS + tx]].filter((v) => v >= 0)
            const lower = nb.filter((v) => v < L)
            if (nb.length >= 3 && lower.length >= 3) LV[ty * COLS + tx] = Math.max(...lower)
          }
        }
        // NOTCH KILLER: a tile whose level disagrees with 3 of its 4 land neighbours is a
        // 1-tile dent or bump in an otherwise straight contour — snap it to the majority.
        // Straight runs and true corners (2/2 splits) are untouched; this is what turns
        // the paper-cut jags into long clean terrace lines. Runs on the cone too (it
        // smooths lone ring bumps without touching the crown, which is 2+ tiles wide).
        for (let pass = 0; pass < 2; pass++) {
          const prev = Int8Array.from(LV)
          for (let ty = 1; ty < ROWS - 1; ty++) for (let tx = 1; tx < COLS - 1; tx++) {
            const L = prev[ty * COLS + tx]
            if (L < 0) continue
            const nb = [prev[ty * COLS + tx + 1], prev[ty * COLS + tx - 1], prev[(ty + 1) * COLS + tx], prev[(ty - 1) * COLS + tx]].filter((v) => v >= 0)
            const counts = new Map<number, number>()
            for (const v of nb) counts.set(v, (counts.get(v) || 0) + 1)
            for (const [v, c] of counts) if (v !== L && c >= 3) { LV[ty * COLS + tx] = v; break }
          }
        }
        const eLvl = (tx: number, ty: number) =>
          tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? -1 : LV[ty * COLS + tx]
        if (DBG) (window as unknown as { __LV?: unknown }).__LV = { LV, COLS, ROWS }

        // LAND↔SEA LATTICE ALIGNMENT: seaTile anchors its soft 64x64 water sprites at
        // (0.5, 0.25), which puts the water diamond's centre ~14px BELOW isoY; the flat land
        // tops anchor centred. Without this drop the whole landmass floated above the sea
        // lattice and every camera-facing shoreline edge exposed a background wedge (the
        // "gap between ocean and sand"), and cliff feet hovered above their own waterline.
        const GY = Number(params.get('gy') || 14)

        // a foam collar at a wall's waterline foot — drawn ABOVE the fronting sea tile (which
        // submerges the wall base); at wall-z the sea drew over it and the join showed as notches
        const foamCollar = (fx: number, fy: number, zBase: number, frontSum: number) => {
          // THIN and quiet: the old 58x20 alpha-.75 blob scaled into a blurry brown smudge
          // pasted over the crisp wall at any real zoom. A low lap line at the waterline only.
          const foam = new Sprite(foamTex); foam.anchor.set(0.5, 0.5)
          foam.width = 50; foam.height = 9; foam.alpha = 0.5
          foam.position.set(fx, fy)
          foam.zIndex = Math.max(zBase, frontSum * 4000) + 62
          world.addChild(foam)
        }

        // ONE tint for the whole cone surface (volc-a's palette). The family base IS the
        // sunlit amber; this multiplies DOWN toward maroon-violet on the shade flank, with
        // radial stripe ribs, gully sinks, and char reserved to the crown belt + crater
        // bowl (char as background — Ash's rule). Tops and faces share it, so no course
        // lip can flip value; faces ride ~12% darker as the one consistent form break.
        const coneTint = (tx2: number, ty2: number): [number, number, number] => {
          const cl = coneLit(tx2, ty2)                 // -1 shade .. +1 lit
          const stripe = stripeK(tx2, ty2)             // radial ribs
          const gy = gullyK(tx2, ty2)
          const ck = craterK(tx2, ty2)
          const hFrac = Math.min(1, coneH(tx2, ty2) / 92)   // rim ≈ 92 levels at CONE_H 175
          const warm = 0.5 + 0.5 * cl
          // stripes carry the RIDGE read now that the texture is damped — but ribs SHADE
          // (~30% down), they never go black: the stacked gully+shade+stripe minima at a
          // 0.46 floor printed near-black contour strings under the golden grade
          let v = 0.96 + 0.18 * cl + (0.11 + 0.06 * (1 - warm)) * stripe - 0.1 * gy
          v *= 1 - 0.22 * smooth(0.85, 1, hFrac)       // char hugs the crown only (background char)
          v *= 1 - 0.3 * smooth(0.3, 1, ck)            // the bowl darkens to the vent
          v = Math.max(0.55, Math.min(1.06, v))        // floor WELL above the grade's crush point
          // shade pulls to warm maroon-violet, not lavender
          const r = v * (0.7 + 0.32 * warm)
          const g = v * (0.54 + 0.48 * warm)
          const b = v * (0.9 - 0.18 * warm)
          return [Math.min(1, r), Math.min(1, g), Math.min(1, b)]
        }
        const tint24 = (r: number, g: number, b: number) =>
          (Math.min(255, Math.round(r * 255)) << 16) | (Math.min(255, Math.round(g * 255)) << 8) | Math.min(255, Math.round(b * 255))
        // a cone tile's face: ONE cropped slope strip sized to the exact drop — no stacked
        // courses, no per-course value ladder (the 20px course rhythm was the staircase).
        // Row 0 of the face art sits at the top diamond's vertical middle; the shaped top
        // 18 rows tuck under the tile's own top, the straight rows carry the drop; the
        // fronting tiles' tops bury the overshoot exactly like the old courses relied on.
        // the cone tile's face uses THE PROVEN BLOCK MATERIAL (blocks3 rock-N-warm, the
        // family Ash gated on the coast — "the sides can be varying rock"): cropped from
        // the block's own diamond-middle down, so the shaped top tucks under the tread
        // and the drawn parallelogram sides + corner verticals read as real 3D tile
        // sides. ONE crop per drop, no stacked-course rhythm; tint = the coneTint field.
        // the cone's TREADS crop the very same blocks' top diamonds — top and face are
        // literally one material, so no lip can flip value or hue
        const rockTop: Texture[] = (sideL.length ? sideL : sideW).map((t) => new Texture({ source: t.source, frame: new Rectangle(0, 0, 64, 36) }))
        const drawFace = (bx2: number, by2: number, dropPx: number, tx2: number, ty2: number, zBase2: number, molten = false) => {
          const fam = sideL.length ? sideL : sideW.length ? sideW : vsF
          if (!fam.length || dropPx <= 0) return
          const need = 18 + dropPx + 8
          const tex = fam[Math.floor(vnoise((tx2 - ty2) / 4 + 6.3, (tx2 + ty2) / 16 + 2.9) * fam.length) % fam.length]
          const srcH = tex.height - 18
          const frameH = Math.min(srcH, need)
          const fr = new Texture({ source: tex.source, frame: new Rectangle(0, 18, 64, frameH) })
          const seg = new Sprite(fr); seg.anchor.set(0.5, 0)
          seg.position.set(bx2, by2)
          if (need > srcH) seg.scale.y = need / srcH
          if (molten) {
            // a LAVA FALL: the river pours over the step — the face burns instead of
            // showing rock, with its own glow at the lip
            seg.tint = 0xffa640
            const glow = new Sprite(foamTex)
            glow.anchor.set(0.5, 0.5); glow.blendMode = 'add'
            glow.tint = 0xff8a30; glow.width = 120; glow.height = 60 + dropPx
            glow.alpha = 0.3
            glow.position.set(bx2, by2 + dropPx * 0.5); glow.zIndex = zBase2 + 8
            world.addChild(glow)
            glows.push({ sp: glow, ph: -Math.hypot(tx2 - CX, ty2 - CY) * 1.1, a: 0.28 })
          } else {
            // the face matches the tread value on the steep flank (one slope, no per-step
            // value flip — the ziggurat killer); gentle single steps keep a soft break
            const k = dropPx >= CSTEP * 2 ? 0.97 : 0.88
            const [r, g, b] = coneTint(tx2, ty2)
            seg.tint = tint24(r * k, g * k, b * Math.min(1, k + 0.03))
          }
          if (DBG) seg.tint = 0x20ffff
          seg.zIndex = zBase2 + 1
          world.addChild(seg)
        }

        // THE 3D TILE UNIT (rebuilt 2026-07-06 after "the sides are even less recognizable"):
        // a downhill tile is a real BLOCK COLUMN — the FULL 64x64 block sprite stacked one
        // course per level, 1:1 pixels, NO crops, NO stretching. The block art's own
        // parallelogram faces, corner verticals and diagonal bottom silhouette ARE the
        // "proper 3D tile" read; every failed round (28x20 sliver stacks, then the continuous
        // cliff band) died because it cropped rectangles out of that silhouette. Masking is
        // pure painter's order: the tile's flat top hides each course's moss cap, the
        // fronting/lower tiles hide the overshoot below. Never crop the blocks again.
        const drawColumn = (bx2: number, by2: number, m: number, toSea: boolean, tx2: number, ty2: number, zBase2: number, volc = false) => {
          if (!rockW.length || m <= 0) return
          // rock variant in smooth ZONES — per-tile random picks flickered into patchwork
          // on turning coasts, and re-rolling the variant EVERY COURSE made the tall cone
          // flank read as bright-chip gravel. One variant per column, in wide zones; the
          // per-course value ladder supplies the strata variation.
          const fam = volc && volcW.length ? volcW : sideW
          const zf = volc ? 5.2 : 2.7
          const pick = (k: number) => Math.floor(vnoise(tx2 / zf + 1.3 + k * 0.13, ty2 / zf + 8.1 + k * 0.21) * rockW.length) % rockW.length
          // a submerged echo of the bottom course first: the cliff foot runs 12px under the
          // waterline so the diagonal bottom silhouette never opens a notch above the sea
          if (toSea && sideW.length) {
            const wet = new Sprite(sideW[pick(m)])
            wet.anchor.set(0.5, 18 / 64)
            wet.position.set(bx2, by2 + (m - 1) * STEP + 12)
            wet.tint = 0xb8a898
            if (DBG) wet.tint = 0x2020ff
            wet.zIndex = zBase2; world.addChild(wet)
          } else if (fam.length) {
            // inland wall feet: the fronting tiles' diamonds taper to zero at their shared
            // vertex, leaving a 1px background pinhole at every wall's bottom corner. A
            // dark underlay course below the bottom course plugs it and reads as the
            // foot's contact shadow.
            const under = new Sprite(fam[pick(m + 1)])
            under.anchor.set(0.5, 18 / 64)
            under.position.set(bx2, by2 + (m - 1) * STEP + 8)
            under.tint = 0x6a6058
            if (DBG) under.tint = 0x20ff60
            under.zIndex = zBase2; world.addChild(under)
          }
          for (let k = m - 1; k >= 0; k--) {                // bottom course first, uppers mask
            // EVERY course is mossless: the warm block's moss cap peeked ~2px around the
            // flat top and outlined each edge tile as a cut-out diamond (Ash's "visible
            // boundaries per each tile"). Anchor 18/64 tucks the block's top diamond fully
            // under the flat top on the uphill edges; the 2-4px rock rim that remains on
            // the DOWNHILL edges is the natural cliff lip.
            const seg = new Sprite(fam.length ? fam[pick(k)] : rockW[pick(k)])
            seg.anchor.set(0.5, 18 / 64)
            seg.position.set(bx2, by2 + k * STEP)
            let drift = 0.96 + 0.06 * vnoise(tx2 / 6 + 2.2, ty2 / 6 + 7.7) - 0.02 * k
            if (volc) {
              // c3's flank language on the WALLS: one hard sun across the cone (west
              // face warm-lit, east face purple shade) + radial rib stripes + darker
              // gully columns — long directional color, not repeated grey courses
              const lit = coneLit(tx2, ty2)
              const stripe = stripeK(tx2, ty2)
              const warm = 0.5 + 0.5 * lit
              // stripes push HARDER on the shade side — one flat lit term made the whole
              // east face a detail-less dark blob; c3's shadow flank keeps its ribs and
              // reads violet, not black-brown
              drift *= (1 + 0.16 * lit + (0.09 + 0.07 * (1 - warm)) * stripe) * (1 - 0.16 * gullyK(tx2, ty2))
              const vv2 = Math.min(255, Math.round(drift * 255))
              seg.tint = (Math.min(255, Math.round(vv2 * (0.88 + 0.24 * warm))) << 16)
                | (Math.min(255, Math.round(vv2 * (0.86 + 0.12 * warm))) << 8)
                | Math.min(255, Math.round(vv2 * (1.16 - 0.4 * warm)))
              if (DBG) seg.tint = 0xff2020
              seg.zIndex = zBase2 + 1 + (m - 1 - k)
              world.addChild(seg)
              continue
            }
            const vv = Math.min(255, Math.round(drift * 255))
            seg.tint = (vv << 16) | (vv << 8) | vv
            if (DBG) seg.tint = 0xff2020
            seg.zIndex = zBase2 + 1 + (m - 1 - k)
            world.addChild(seg)
          }
        }

        // THE WORN PATH (P2c): one designed trail from the pier root along the meadow
        // ring toward the south cove — a polyline like the lava's, rendered as dry
        // sand-worn tops. Ports send paths inward (the master plan); more come with
        // later vignettes.
        // hand-authored features ride the island's hub scale (terrain SCALE 1.32)
        const SC = (x: number, y: number): [number, number] => [CX + (x - CX) * 1.32, CY + (y - CY) * 1.32]
        // THE SOUTH RIVER (master plan: a spring on the south flank feeds the cove):
        // a fresh turquoise thread cutting the meadow ring to the south pocket
        const RIVER: [number, number][] = ([[114, 106], [119, 110], [124, 115], [128, 120], [131, 124]] as [number, number][]).map(([x, y]) => SC(x, y))
        const riverD = (tx2: number, ty2: number) => {
          let best = 99
          for (let i = 0; i < RIVER.length - 1; i++) {
            const [x0, y0] = RIVER[i], [x1, y1] = RIVER[i + 1]
            const vx = x1 - x0, vy = y1 - y0
            const L2 = vx * vx + vy * vy
            let t = L2 > 0 ? ((tx2 - x0) * vx + (ty2 - y0) * vy) / L2 : 0
            t = Math.max(0, Math.min(1, t))
            const dx = tx2 - (x0 + vx * t), dy = ty2 - (y0 + vy * t)
            const d = Math.sqrt(dx * dx + dy * dy)
            if (d < best) best = d
          }
          return best
        }

        const PATH: [number, number][] = ([[127, 86], [121, 95], [116, 105], [109, 115], [100, 122]] as [number, number][]).map(([x, y]) => SC(x, y))
        // the NW branch: from the ring's shoulder around the cone's north toe out onto
        // the wide NW lawn (the plan's meadow ring — every port sends a path inward,
        // and the empty lawn finally has somewhere to walk to)
        const PATH2: [number, number][] = ([[121, 95], [112, 88], [102, 82], [92, 76], [82, 74], [73, 78], [68, 86]] as [number, number][]).map(([x, y]) => SC(x, y))
        const PATHS = [PATH, PATH2]
        const pathD = (tx2: number, ty2: number) => {
          let best = 99
          for (const P of PATHS) for (let i = 0; i < P.length - 1; i++) {
            const [x0, y0] = P[i], [x1, y1] = P[i + 1]
            const vx = x1 - x0, vy = y1 - y0
            const L2 = vx * vx + vy * vy
            let t = L2 > 0 ? ((tx2 - x0) * vx + (ty2 - y0) * vy) / L2 : 0
            t = Math.max(0, Math.min(1, t))
            const dx = tx2 - (x0 + vx * t), dy = ty2 - (y0 + vy * t)
            const d = Math.sqrt(dx * dx + dy * dy)
            if (d < best) best = d
          }
          return best
        }

        const waterS: SwellSprite[] = []
        const glows: { sp: Sprite; ph: number; a: number }[] = []
        for (let ty = 0; ty < ROWS; ty++) {
          for (let tx = 0; tx < COLS; tx++) {
            const dx = tx - CX, dy = ty - CY
            if (dx * dx + dy * dy > SEA_R * SEA_R) continue
            const dsq = dsAt(tx, ty)
            if (dsq <= 0) { seaTile(world, tx, ty, dsq, waterV, undefined, waterS); continue }
            const L = eLvl(tx, ty)                          // beaches = 0 → flush, no gap
            // sea-level land on a beach azimuth wears sand; on mixed azimuths it stays grass
            const sand = L === 0 && cliffMask(Math.atan2(ty - CY, tx - CX)) < 0.35
            const lift = liftOf(L)
            const bx = isoX(tx, ty), by = isoY(tx, ty) - lift + GY
            // lift*8 overflowed the 4000 row separation once the cone stacked tall
            // (a summit tile out-sorted the row in front of it); *2 keeps even the
            // ~35-level summit (lift 1120 -> 2240) safely inside its own row band
            const zBase = (tx + ty) * 4000 + lift * 2


            // THE BLOCK COLUMN: if ANY of the 8 neighbours sits lower, this tile is a real
            // block column down to the DEEPEST of them. One full block per level. Painter's
            // order does ALL the masking: land neighbours in front (higher z) cover whatever
            // face doesn't actually drop, so inland back-steps draw a hidden column (cheap,
            // harmless) — but at a SILHOUETTE coast (sea behind-left/right) nothing fronts
            // the tile and the column IS the visible cliff. Checking only the three front
            // floors left every second staircase tile on the west coast overhanging bare
            // void (v34's floating grass diamonds).
            {
              let floorMin = L, toSea = false
              for (const [ox, oy] of [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
                const nl = eLvl(tx + ox, ty + oy)
                if (nl < 0) toSea = true
                const fl = nl < 0 ? 0 : nl
                if (fl < floorMin) floorMin = fl
              }
              if (L > floorMin) {
                // basalt courses only where the surface has left the meadow — the green
                // lower flank keeps the warm rock ribs (c3's grass-through-rock mesh).
                // UNDITHERED switch: the band dither made each tile's walls flip family
                // independently, printing an orange/dark checker across the transition —
                // walls follow the smooth field so the families change in long runs.
                // Channel walls char: the lava bed's risers go basalt regardless of band.
                const isCone = !NOCONE && L > PLAT_L && coneH(tx, ty) > 0 && !toSea && (sideW.length > 0 || vsF.length > 0)
                if (isCone) {
                  // the cone's own steps wear the block skin — one strip, one tint field;
                  // river tiles pour over their steps as burning falls
                  const moltenFace = lavaDist(tx, ty) < 0.95 || craterK(tx, ty) > 0.32
                  drawFace(bx, by, lift - liftOf(floorMin), tx, ty, zBase, moltenFace)
                } else {
                  const charred = !NOCONE && (lavaDist(tx, ty) < 1.1 || craterK(tx, ty) > 0.4)
                  drawColumn(bx, by, L - floorMin, toSea, tx, ty, zBase, charred)
                }
                // NO BACK-VOID FILLS. (Removed 2026-07-07 — Ash circled them: the strips
                // stacked into a curtain wall behind the summit and floating planks on
                // the skirt, reading as pasted 2D images. With the cone's 10px steps the
                // projection gaps behind steps are thin slivers; live with the crease.
                // The doctrine held: do not reintroduce fills.)
                // a foam collar hugging the cliff foot on each sea-facing front edge
                for (const [ox, oy] of [[1, 0], [0, 1]] as [number, number][]) {
                  if (eLvl(tx + ox, ty + oy) >= 0) continue
                  const ex = isoX(tx + ox * 0.5, ty + oy * 0.5), ey = isoY(tx + ox * 0.5, ty + oy * 0.5) + GY
                  foamCollar(ex, ey + 2, zBase, tx + ox + ty + oy)
                }
              }
            }

            // TOP: one flat blended diamond (old-map recipe: narrow ramp + low-freq patch),
            // ~1.14 overlap so neighbours melt together. NO hillshade — the decorated SIDE
            // faces carry the 3D, and the flat tops stay a seamless surface like the old map.
            // the cone's surface bands: grass skirt -> dry scrub -> bare basalt (coneBand
            // carries its own dither so the transitions never draw as clean rings)
            const band = !sand && L > PLAT_L ? coneBand(tx, ty) : 0
            // THE LAVA (P1): two channels spill from the crater down the flanks to the
            // coast (terrain's LAVA polylines). Core tiles wear the self-bright ember
            // art; a charcoal BED shoulders each channel; the crater bowl burns at the
            // vent and chars around it. Glow sprites pulse on the cores (the ticker).
            const ld = dsq > 0 ? lavaDist(tx, ty) : 99
            const ck = L > PLAT_L ? craterK(tx, ty) : 0
            // THE LAVA IS TILES (the confirmed 3d tile format): a contiguous MOLTEN core
            // ~two tiles wide down the flank, shouldered by the dark charred bed — and
            // the whole crater bowl burns as a lava lake (Ash: "orange lava filling
            // inside the blowhole")
            const isLava = !NOCONE && lavaT.length > 0 && L > 0 && (ld < 0.95 || ck > 0.32)
            // the bed hugs the future ribbon (a 4-tile charred swath read as a black scar)
            const isBed = !NOCONE && !isLava && L > 0 && (ld < 1.3 || ck > 0.4)
            // the worn path wears dry sand through the meadow (grass ring only, never
            // up the cone or over the beach's own sand)
            // paths may cross the grassy cone toe (the lawn IS mostly toe) — never the
            // rock bands, never the beach's own sand
            const onPath = !sand && L > 0 && pathD(tx, ty) < 0.75
              && (L <= PLAT_L || (band === 0 && coneH(tx, ty) < 6))
            // the river renders ONLY as the flat tidal estuary at the cove (L 0-1):
            // on the terraced ring the water tiles stepped down the benches as floating
            // mint checkers — a broken river is worse than none (the full flank river
            // waits for a dedicated waterfall pass)
            const onRiver = !sand && !isLava && !isBed && L > 0 && L <= 1 && riverD(tx, ty) < 0.8
            const vs = band >= 1 && rockTop.length ? rockTop : undefined
            const pool = sand ? st
              : isLava ? (ck > 0.32 && lakeT.length ? lakeT : lavaT)
                : isBed && volcT.length ? volcT
                  : onRiver && waterV.length ? waterV
                    : onPath && st.length ? st : vs || gt
            // cone rock tops pick in smooth ZONES (like the walls): per-tile hash churn
            // re-rolled the texture every diamond and the flank read as shredded scales
            const g = !pool.length ? undefined
              : pool === vs ? pool[Math.floor(vnoise(tx / 6 + 4.2, ty / 6 + 1.8) * pool.length) % pool.length]
                : pool[Math.floor(hash(tx * 5.1 + 2, ty * 2.9 + 4) * pool.length) % pool.length]
            if (g) {
              // scale 1.0, exact 64x36 diamonds on the 64x32 lattice — the 2px vertical bleed
              // over neighbours is the tile family's own melt (the beach's block style). A
              // strict-32 rebuild was tried and REVERTED: it broke the melt and read worse.
              const top = new Sprite(g); top.anchor.set(0.5, 0.5); top.scale.set(1)
              top.position.set(bx, by); top.zIndex = zBase + 5
              const grain = 0.995 + 0.01 * hash(tx * 1.3, ty * 2.1)
              // continuous jitter on the rake input: shallow smooth gradients otherwise
              // quantize into clean equal-tint contour lines (the "zigzag across the island")
              const rk = rakeAt(tx, ty) + (vnoise(tx / 2.3 + 14, ty / 2.3 + 3) - 0.5) * 0.1
              if (sand) {
                const tt = Math.min(1, dsq / 5)
                const v = (0.965 + 0.06 * vnoise(tx / 16 + 3, ty / 16 + 5)) * grain * (1 + 0.1 * rk)
                top.tint = warmCool(shadeHex(tintFor(rampAt(SAND_RAMP, tt), SAND_BASE), v), rk * 0.7)
                if (ld < 3) {
                  // the BLACK DELTA: cooled basalt sand fanning where the flow met the
                  // water — blend the beach toward charcoal as the channel closes in
                  const k = (1 - ld / 3) * 0.8
                  const t0 = top.tint as number
                  const dr = Math.round(((t0 >> 16) & 255) * (1 - k) + 0x4a * k)
                  const dg = Math.round(((t0 >> 8) & 255) * (1 - k) + 0x42 * k)
                  const db = Math.round((t0 & 255) * (1 - k) + 0x3e * k)
                  top.tint = (dr << 16) | (dg << 8) | db
                }
              } else if (isLava) {
                top.tint = 0xffffff                           // self-bright art, untinted
                const glow = new Sprite(foamTex)              // soft radial, re-tinted ember
                glow.anchor.set(0.5, 0.5); glow.blendMode = 'add'
                glow.tint = 0xff8a30; glow.width = 150; glow.height = 84
                glow.alpha = 0.34
                glow.position.set(bx, by); glow.zIndex = zBase + 7
                world.addChild(glow)
                // phase keyed to distance from the vent: the pulse TRAVELS downstream —
                // the cheap cue that the river flows instead of blinking in place
                glows.push({ sp: glow, ph: -Math.hypot(tx - CX, ty - CY) * 1.1 + hash(tx, ty) * 0.8, a: 0.3 })
              } else if (isBed) {
                // the charred channel shoulder / crater bowl floor — dark UMBER, not black
                // (the grade crushes anything below ~0.5 into hole-black)
                const v = 0.54 + 0.12 * vnoise(tx / 4 + 8, ty / 4 + 3)
                const vv = Math.round(v * 255)
                top.tint = (vv << 16) | (Math.round(vv * 0.82) << 8) | Math.round(vv * 0.72)
              } else if (onRiver) {
                // fresh water: pale sunlit turquoise over the live water texture, with
                // a gentle glint pulse via the ember array (reused, tinted cool)
                top.tint = 0x93cfc4
                if (hash(tx * 3.7, ty * 1.9) > 0.72) {
                  const glint = new Sprite(foamTex)
                  glint.anchor.set(0.5, 0.5); glint.blendMode = 'add'
                  glint.tint = 0xbfffec; glint.width = 46; glint.height = 22
                  glint.alpha = 0.16
                  glint.position.set(bx, by); glint.zIndex = zBase + 7
                  world.addChild(glint)
                  glows.push({ sp: glint, ph: hash(tx, ty * 3.1) * 6.3, a: 0.14 })
                }
              } else if (onPath) {
                // the trail: dry trodden earth through the green — deep enough to read
                // as a path at map zoom, not a pale ghost
                const v = (0.99 + 0.05 * vnoise(tx / 7 + 3, ty / 7 + 9)) * grain * (1 + 0.1 * rk)
                top.tint = warmCool(shadeHex(0xc9a26e, v), rk * 0.7)
              } else if (band >= 1 && vs) {
                // the cone's rock treads: the SAME coneTint field the faces wear, PULLED
                // DOWN toward the carved sides' own value (the block art's bright top vs
                // dark side is the bench flash — closing it makes the flank one strata
                // surface). The merge belt (band 1) eases the meadow's olive in (c3).
                const [r0, g0, b0] = coneTint(tx, ty)
                const t = Math.max(0, Math.min(1, (coneH(tx, ty) - 14) / 22))
                const mix = band === 1 ? 0.45 + 0.55 * t : 1
                const dk = grain
                const r = (r0 * mix + 0.61 * (1 - mix)) * dk
                const g = (g0 * mix + 0.67 * (1 - mix)) * dk
                const b = (b0 * mix + 0.32 * (1 - mix)) * dk
                top.tint = tint24(r, g, b)
              } else {
                // the plateau's ground mosaic: a LARGE meadow↔deep-green zone field (24-tile
                // landform scale — per-tile tint noise is the banned "poop") over the mid-scale
                // patchwork, so the flat top reads as dry sunlit meadows drifting into richer
                // green swaths instead of one olive slab
                // the bench ribbons are only 1-2 tiles wide: at full swing every bench tile
                // samples a different zone/patch value and the band reads as per-tile
                // patchwork ("visible boundaries"). Damp the variation near the coast so
                // each bench reads as ONE surface; the wide plateau keeps the full drift.
                const damp = L < PLAT_L ? 0.35 : Math.min(1, DIST[ty * COLS + tx] / 12)
                const zone = 0.5 + (vnoise(tx / 24 + 9, ty / 24 + 17) - 0.5) * damp
                const patch = 1.0 + 0.08 * (vnoise(tx / 14 + 2, ty / 14 + 6) - 0.5) * 2 * damp
                // gentler zone swing + a HIGH-FREQ CONTINUOUS dither: it still breaks contour
                // alignment, but neighbouring tiles stay correlated — a per-tile hash printed
                // hard diamond boundaries once the tops stopped overlapping
                const tval = Math.max(0, Math.min(1,
                  0.1 + 0.3 * vnoise(tx / 13 + 2, ty / 13 + 6) + 0.42 * zone + (vnoise(tx / 2.1 + 5, ty / 2.1 + 9) - 0.5) * 0.06))
                // meadow that has climbed onto the cone wraps its form: the flank's own
                // directional sun folds into the green (c3's grass curving up the slope)
                const cl = L > PLAT_L ? coneLit(tx, ty) : 0
                const lit = patch * grain * (1 + 0.13 * rk) * (1.03 - 0.07 * zone) * (1 + 0.14 * cl)
                top.tint = warmCool(tintFor(shadeHex(rampAt(GRASS_RAMP, tval), lit), GRASS_BASE), rk)
              }
              world.addChild(top)
            }

            // FOAM SHORELINE: a soft lace where land meets sea — BEACH tiles only (L 0, flush
            // with the water). It used to wrap raised coast tiles too, which parked sea foam on
            // top of the cliffs and flattened the whole north coast into a sea-level read.
            if (L === 0 && coastDs(tx, ty) < 2.4) {
              for (const [ox, oy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as [number, number][]) {
                if (dsAt(tx + ox, ty + oy) > 0) continue      // neighbour is land, no shore here
                const fx = isoX(tx + ox * 0.5, ty + oy * 0.5)
                const fy = isoY(tx + ox * 0.5, ty + oy * 0.5) - lift + GY
                const foam = new Sprite(foamTex); foam.anchor.set(0.5, 0.5)
                foam.width = 46; foam.height = 26; foam.alpha = 0.5
                foam.position.set(fx, fy)
                foam.zIndex = Math.max(zBase, (tx + ox + ty + oy) * 4000) + 60
                world.addChild(foam)
              }
            }

            // NO BACK-EDGE FILLS. (Deleted 2026-07-06 — Ash: "all the backsides… have the
            // zig zag".) The whole back-edge machinery (quarter-segment shadow fills, 8px
            // sea lips, diagonal corner nubs) was painting dark serrated chips along every
            // raised tile's NW/NE edges — the zigzag outline on every step. Geometrically
            // NOTHING is needed there: the screen strip a lifted top reveals behind itself
            // belongs to farther-back rows, which are already drawn — lower terraces show
            // their own ground, coast rims show water. Terrain only lies if it drops faster
            // than one level per row, which the coast staircase columns already cover.
            // Do not reintroduce fills; if a rim ever needs a crease, shade the top's own
            // edge pixels instead of stamping sprites behind it.
          }
        }

        // ---- P2: THE COMPOSED LIFE. Designed sites, never sprinkle (the locked law).
        // Palms in GROVES with clearings (bon3's amounts), rock outcrops as accents, one
        // ruin, and the east PORT vignette at the harbor. Every prop is grounded with a
        // contact shadow and depth-sorts with the terrain.
        const propTex: Record<string, Texture> = {}
        await Promise.all(Object.entries({
          palmA: '/art/intro/palm-a.png', palmB: '/art/intro/palm-b.png',
          palmC: '/art/intro/props/palm-c.png', palmD: '/art/intro/props/palm-d.png',
          bushA: '/art/intro/props/bush-a.png', bushC: '/art/intro/props/bush-c.png',
          rockA: '/art/intro/props/rock-a.png', rockB: '/art/intro/props/rock-b.png',
          pier: '/art/intro/port/pier-iso.png', pierEnd: '/art/intro/port/pier-end.png',
          boatA: '/art/intro/port/boat-anchored.png', boatF: '/art/intro/port/boat-fishing.png',
          rowboat: '/art/intro/port/rowboat.png', crates: '/art/intro/port/crates.png',
          lantern: '/art/intro/port/lantern-post.png', ruin: '/art/island/ruin.png',
          crag: '/art/island/crag-a.png',
          head: '/art/island/panther-head-lava.png', hut: '/art/island/harbor-hut.png',
          bridge: '/art/island/rope-bridge.png', boathouse: '/art/island/boathouse.png',
          lighthouse: '/art/island/lighthouse.png', pennant: '/art/intro/props/pennant.png',
          gull: '/art/intro/props/gull.png', gullFly: '/art/intro/props/gull-fly.png',
        }).map(([k, p]) => Assets.load(p).then((t: Texture) => { t.source.scaleMode = 'nearest'; propTex[k] = t }).catch(() => {})))

        const shadowTex = radial(64, [[0, 'rgba(20,16,10,0.4)'], [0.7, 'rgba(20,16,10,0.18)'], [1, 'rgba(20,16,10,0)']])
        const prop = (px: number, py: number, key: string, hpx: number, o: { flip?: boolean; sea?: boolean; tint?: number; noShadow?: boolean } = {}) => {
          const t = propTex[key]
          if (!t || PROBE === 'props') return
          const L2 = o.sea ? 0 : Math.max(0, eLvl(Math.round(px), Math.round(py)))
          const lift = liftOf(L2)
          const wx = isoX(px, py), wy = isoY(px, py) - lift + GY + (o.sea ? 6 : 0)
          const z = (Math.round(px) + Math.round(py)) * 4000 + lift * 2 + 700
          if (!o.noShadow && !o.sea) {
            const sh = new Sprite(shadowTex); sh.anchor.set(0.5, 0.5)
            sh.width = hpx * 0.62; sh.height = hpx * 0.2
            sh.position.set(wx + hpx * 0.05, wy + 1); sh.zIndex = z - 1
            world.addChild(sh)
          }
          const sp = new Sprite(t); sp.anchor.set(0.5, 1)
          sp.height = hpx; sp.scale.x = Math.abs(sp.scale.y) * (o.flip ? -1 : 1)
          if (o.tint !== undefined) sp.tint = o.tint
          sp.position.set(wx, wy + 4); sp.zIndex = z
          world.addChild(sp)
        }
        // a grove site: the nearest breathable meadow tile at this azimuth/inset —
        // walked inward until it lands on grass ring off the cone and off the lava
        const site = (az: number, inset: number): [number, number] | null => {
          for (let k = 0; k < 10; k++) {
            const r = coastR(az) - inset + k * 1.2   // walk OUTWARD: the cone's skirt owns
            const sx = CX + Math.cos(az) * r, sy = CY + Math.sin(az) * r   // the inland side now
            const l = eLvl(Math.round(sx), Math.round(sy))
            if (l >= 1 && l <= PLAT_L + 2 && coneH(sx, sy) < 5 && coneBand(Math.round(sx), Math.round(sy)) === 0
              && lavaDist(sx, sy) > 3 && pathD(sx, sy) > 1.2) return [sx, sy]
          }
          return null
        }
        const palmKeys = ['palmA', 'palmB', 'palmC', 'palmD']
        // each grove: a hand-shaped cluster (big anchors + leaners + a bush), a clearing
        // kept open. The -2.3..-2.75 band = the wide NW lawn (the empty third of the
        // island): two loose groves + the shrine vignette give the plateau its places,
        // with the new NW path arriving between them.
        const GROVES: [number, number, number][] = [
          [-0.85, 8, 7], [-0.15, 7, 8], [0.55, 8, 6], [1.05, 7, 7], [2.0, 9, 4], [-1.5, 9, 4],
          [2.52, 15, 8], [-2.78, 9, 5], [2.3, 12, 5], [2.85, 10, 4],
        ]
        const OFFS: [number, number, number][] = [
          [0, 0, 168], [1.6, -0.7, 142], [-1.3, 0.9, 132], [0.8, 1.4, 154], [-0.6, -1.5, 120],
          [2.3, 0.6, 112], [-2.1, -0.3, 126], [1.1, -1.8, 104],
        ]
        for (const [az, inset, n] of GROVES) {
          const s = site(az, inset)
          if (!s) continue
          for (let i = 0; i < Math.min(n, OFFS.length); i++) {
            const [dx, dy, hp] = OFFS[i]
            prop(s[0] + dx, s[1] + dy, palmKeys[(i + Math.round(az * 3)) & 3], hp, { flip: hash(az * 7 + i, 3) > 0.5 })
          }
          prop(s[0] - 0.8, s[1] - 0.4, hash(az, 9) > 0.5 ? 'bushA' : 'bushC', 52, { flip: hash(az, 4) > 0.5 })
        }
        // rock outcrops + the one ruin: sparse designed accents on the open meadow
        const OUTCROPS: [number, number][] = [[0.42, 12], [1.6, 9], [-1.15, 10], [2.62, 13]]
        for (const [az, inset] of OUTCROPS) {
          const s = site(az, inset)
          if (!s) continue
          prop(s[0], s[1], 'rockA', 56); prop(s[0] + 1.1, s[1] + 0.5, 'rockB', 40, { flip: true })
        }
        {
          // the SHRINE MEADOW (NW lawn vignette): the mossy arch flanked by rocks and a
          // bush ring, where the NW path ends — the island's first quiet BLHS-ruin beat
          const s = site(2.45, 12)
          if (s) {
            prop(s[0], s[1], 'ruin', 92)
            prop(s[0] - 1.6, s[1] + 0.8, 'rockB', 38)
            prop(s[0] + 1.5, s[1] - 0.5, 'rockA', 44, { flip: true })
            prop(s[0] + 0.8, s[1] + 1.4, 'bushA', 46)
          }
        }

        // THE PANTHER HEADS — placed below after the monumental carved-relief art, at
        // the lava sources on the front flank (c1/bon4: big, carved INTO the massif).

        // THE PANTHER LIGHTHOUSE (NE coast, GAME-DESIGN outdoor feature): on its own
        // rock islet where a sailor and the player can actually see it (the tall summit
        // hides the whole N sea from this camera)
        {
          const [lx, ly] = SC(103, 57)
          prop(lx, ly, 'lighthouse', 168, { sea: true, noShadow: true })
          const lg = new Sprite(foamTex)
          lg.anchor.set(0.5, 0.5); lg.blendMode = 'add'
          lg.tint = 0xffd890; lg.width = 100; lg.height = 60; lg.alpha = 0.3
          lg.position.set(isoX(lx, ly), isoY(lx, ly) + GY - 146)
          lg.zIndex = (Math.round(lx + ly)) * 4000 + 900
          world.addChild(lg)
          glows.push({ sp: lg, ph: 1.7, a: 0.26 })
        }

        // THE RIVER-COVE FISHING VIGNETTE (master plan: the south cove): boats at the
        // river mouth, a lantern on the bank, the rope bridge over the estuary
        {
          const cove = (x: number, y: number) => SC(x, y)
          prop(...cove(133, 127.5), 'boatF', 72, { sea: true, noShadow: true, flip: true })
          prop(...cove(129.6, 123.4), 'rowboat', 46)
          prop(...cove(128.2, 121.6), 'lantern', 76)
          prop(...cove(129.2, 120.8), 'bridge', 64, { noShadow: true })
        }

        // P2b THE PORT: the arrival vignette at the harbor — a pier reaching into the
        // lagoon, boats riding at anchor, dockside clutter, one lantern
        {
          // find the arrival shore ROBUSTLY on the hub island: scan OUTWARD from a point
          // safely inside the coast until we cross into the sea, then step back one — the
          // last land tile is the pier root (module-const HARBOR is stale vs the async
          // skeleton, so recompute here where coastR + eLvl are live)
          const seaward: [number, number] = [Math.cos(-0.5), Math.sin(-0.5)]
          let rx = CX + seaward[0] * 20, ry = CY + seaward[1] * 20
          for (let k = 0; k < 60; k++) {
            const nx = rx + seaward[0] * 0.6, ny = ry + seaward[1] * 0.6
            if (eLvl(Math.round(nx), Math.round(ny)) < 0) break   // next step is sea → stop at shore
            rx = nx; ry = ny
          }
          // real scale against 32px-tall tiles: a pier segment spans ~1.5 tiles, a boat
          // reads ~2 tiles long — the first sizes were dollhouse specks
          // one continuous pier run (overlapping segments — the gapped spacing read as
          // broken planks floating on the lagoon)
          prop(rx + seaward[0] * 1.1, ry + seaward[1] * 1.1, 'pier', 84, { sea: true, noShadow: true })
          prop(rx + seaward[0] * 2.4, ry + seaward[1] * 2.4, 'pier', 84, { sea: true, noShadow: true })
          prop(rx + seaward[0] * 3.7, ry + seaward[1] * 3.7, 'pier', 84, { sea: true, noShadow: true })
          prop(rx + seaward[0] * 7.4 + 1.4, ry + seaward[1] * 7.4 - 1.0, 'boatA', 76, { sea: true, noShadow: true })
          prop(rx + seaward[0] * 6.2 - 1.8, ry + seaward[1] * 6.2 + 1.6, 'boatF', 68, { sea: true, noShadow: true, flip: true })
          prop(rx - 0.6, ry + 1.1, 'rowboat', 44)
          prop(rx - 1.4, ry - 0.7, 'crates', 52)
          prop(rx - 0.4, ry - 1.5, 'lantern', 78)
          // the harbor's life: a stilted hut with its warm window, the teal BLHS
          // pennant, gulls loitering on the sand — the fresh island port Thor lands on
          prop(rx - 3.2, ry - 2.6, 'hut', 104)
          prop(rx + 1.4, ry - 3.4, 'boathouse', 98)
          prop(rx - 1.9, ry + 2.2, 'pennant', 62)
          prop(rx + 0.8, ry + 2.8, 'gull', 18)
          prop(rx - 2.6, ry + 1.6, 'gull', 16, { flip: true })
          // a warm hearth glow breathing in the hut window
          {
            const hx2 = isoX(rx - 3.2, ry - 2.6), hy2 = isoY(rx - 3.2, ry - 2.6) - liftOf(Math.max(0, eLvl(Math.round(rx - 3.2), Math.round(ry - 2.6)))) + GY
            const wg = new Sprite(foamTex)
            wg.anchor.set(0.5, 0.5); wg.blendMode = 'add'
            wg.tint = 0xffc060; wg.width = 60; wg.height = 40; wg.alpha = 0.22
            wg.position.set(hx2, hy2 - 40)
            wg.zIndex = (Math.round(rx - 3.2) + Math.round(ry - 2.6)) * 4000 + 900
            world.addChild(wg)
            glows.push({ sp: wg, ph: 3.9, a: 0.2 })
          }
        }

        // AMBIENT LIFE: two gulls gliding lazy loops over the lagoon and the meadow
        // ring — the motion cue that sells a live world (with the clouds + steam)
        const flyers: { sp: Sprite; cx: number; cy: number; r: number; spd: number; ph: number }[] = []
        if (propTex.gullFly) {
          for (const [gcx, gcy, gr, spd] of [[128, 96, 420, 0.14], [88, 118, 360, -0.11]] as [number, number, number, number][]) {
            const sp = new Sprite(propTex.gullFly)
            sp.anchor.set(0.5, 0.5); sp.height = 22; sp.scale.x = Math.abs(sp.scale.y)
            sp.zIndex = 3_200_000
            world.addChild(sp)
            flyers.push({ sp, cx: isoX(gcx, gcy), cy: isoY(gcx, gcy) + GY - 130, r: gr, spd, ph: gcx * 0.7 })
          }
        }

        // THE STEAM (P1d): a plume of soft puffs rising off the crater, drifting with
        // the wind and dissolving; two small wisps where the flows quench in the sea.
        // Sprite-space animation only — no shaders (banned).
        const steamTex = radial(96, [[0, 'rgba(255,250,240,0.5)'], [0.55, 'rgba(240,232,224,0.22)'], [1, 'rgba(235,228,220,0)']])
        const rimLift = liftOf(PLAT_L + coneLvl(CX + 8.5, CY))   // the real crown height
        const puffs: { sp: Sprite; ph: number; spd: number; big: boolean }[] = []
        for (let i = 0; !NOCONE && i < 6; i++) {
          const sp = new Sprite(steamTex); sp.anchor.set(0.5, 0.5)
          sp.position.set(isoX(CX, CY), isoY(CX, CY) - rimLift + GY)
          sp.zIndex = 4_000_000
          world.addChild(sp)
          puffs.push({ sp, ph: (i / 6) * Math.PI * 2, spd: 0.85 + 0.3 * hash(i * 3.7, 1.2), big: true })
        }
        for (const line of NOCONE ? [] : LAVA) {
          const [ex, ey2] = line[line.length - 1]
          for (let i = 0; i < 2; i++) {
            const sp = new Sprite(steamTex); sp.anchor.set(0.5, 0.5)
            sp.position.set(isoX(ex, ey2), isoY(ex, ey2) + GY)
            sp.zIndex = (ex + ey2 + 2) * 4000 + 900
            world.addChild(sp)
            puffs.push({ sp, ph: i * 2.6 + ex * 0.1, spd: 0.6 + 0.25 * hash(ex + i, ey2), big: false })
          }
        }
        const steamBase = puffs.map((p) => ({ x: p.sp.x, y: p.sp.y }))

        // THE MOUNTAIN'S CAST SHADOW (bon3/c3's strongest grounding cue): the cone
        // throws a long soft violet-teal shade to the screen-SE — across its own SE
        // foot, the meadow, the beach and out over the water — fading with distance.
        // Same layer trick as the cloud shadows (above the tiles, below the sun wash).
        {
          const cv = document.createElement('canvas'); cv.width = 640; cv.height = 320
          const g = cv.getContext('2d')!
          const grad = g.createLinearGradient(40, 160, 640, 160)
          grad.addColorStop(0, 'rgba(20,18,44,0.30)')
          grad.addColorStop(0.45, 'rgba(20,20,48,0.17)')
          grad.addColorStop(1, 'rgba(20,22,52,0)')
          g.fillStyle = grad
          g.beginPath(); g.ellipse(320, 160, 316, 130, 0, 0, Math.PI * 2); g.fill()
          const sh = new Sprite(Texture.from(cv))
          sh.anchor.set(0.06, 0.5)
          sh.position.set(isoX(CX + 6, CY + 6), isoY(CX + 6, CY + 6) + GY)
          sh.rotation = 0.46
          sh.scale.set(2.4, 2.0)
          sh.zIndex = 2_900_000
          world.addChild(sh)
        }

        // P3: CLOUD SHADOWS — three soft shades drifting slowly across the island with
        // the wind. The subtle motion cue that makes a still map read as a live world.
        const cloudTex = radial(256, [[0, 'rgba(16,20,30,0.26)'], [0.6, 'rgba(16,20,30,0.15)'], [1, 'rgba(16,20,30,0)']])
        const clouds: { sp: Sprite; spd: number; y0: number }[] = []
        for (let i = 0; i < 3; i++) {
          const sp = new Sprite(cloudTex); sp.anchor.set(0.5, 0.5)
          sp.scale.set(4.5 + i * 1.5, 2.1 + i * 0.6)
          sp.zIndex = 3_000_000
          const y0 = isoY(CX, CY) - 500 + i * 640
          sp.position.set(isoX(CX, CY) - 1400 + i * 1100, y0)
          world.addChild(sp)
          clouds.push({ sp, spd: 9 + i * 3.5, y0 })
        }

        app.ticker.add(() => {
          const t = performance.now() / 1000
          animSwells(waterS, t, () => 0)
          // ember pulse: slow independent breathing per core tile
          for (const g of glows) g.sp.alpha = g.a * (0.72 + 0.28 * Math.sin(t * 1.3 + g.ph))
          // clouds drift screen-right and wrap around the island's span
          for (const c of clouds) {
            c.sp.x += c.spd * (app.ticker.deltaMS / 1000)
            if (c.sp.x > isoX(CX, CY) + 2400) c.sp.x = isoX(CX, CY) - 2400
            c.sp.y = c.y0 + Math.sin(c.sp.x * 0.0007) * 90
          }
          // gulls glide their loops, banking with the turn
          for (const f of flyers) {
            const a = t * f.spd + f.ph
            f.sp.position.set(f.cx + Math.cos(a) * f.r, f.cy + Math.sin(a) * f.r * 0.42 + Math.sin(t * 0.9 + f.ph) * 8)
            f.sp.scale.x = Math.abs(f.sp.scale.y) * (Math.sin(a) > 0 ? 1 : -1) * (f.spd > 0 ? 1 : -1)
          }
          // steam: each puff loops a rise — grows, drifts downwind (screen right), thins
          for (let i = 0; i < puffs.length; i++) {
            const p = puffs[i], b = steamBase[i]
            const u = ((t * 0.09 * p.spd) + p.ph / (Math.PI * 2)) % 1
            const rise = p.big ? 150 : 60
            p.sp.position.set(b.x + u * (p.big ? 70 : 34) + Math.sin(t * 0.7 + p.ph) * 6, b.y - u * rise)
            const s = (p.big ? 2.1 : 0.8) * (0.5 + u * 1.15)
            p.sp.scale.set(s)
            p.sp.alpha = (p.big ? 0.66 : 0.4) * (u < 0.18 ? u / 0.18 : 1 - (u - 0.18) / 0.82)
          }
        })
      }

      const waterSprites: SwellSprite[] = []
      for (let ty = 0; !TILETEST && ty < ROWS; ty++) {
        for (let tx = 0; tx < COLS; tx++) {
          const dx = tx - CX, dy = ty - CY
          if (dx * dx + dy * dy > SEA_R * SEA_R) continue
          const ds = dsAt(tx, ty)
          if (ds <= 0) { seaTile(world, tx, ty, ds, waterV, undefined, waterSprites); continue }

          // HEIGHT-TILE: the tile is a standard iso diamond raised to its elevation
          // level. Top = a normal grass/sand tile (matches the flat ground); a drawn
          // rock FACE only appears on an edge whose neighbour is LOWER, sized to the
          // exact drop — so cliffs vary in size straight from the data.
          const L = levelAt(tx, ty)
          const lift = L * STEP
          const isSand = L === 0 // sea-level land = beach
          const fam = isSand ? sandV : grassV
          const base = fam[Math.floor(hash(tx * 3.3, ty * 4.1) * 16) % 16]
          if (!base) continue
          const fx = vnoise(tx / 7 + 4, ty / 7 + 11) > 0.5 ? -1 : 1
          const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
          sp.scale.set(fx * 1.08, 1.08)
          sp.position.set(isoX(tx, ty), isoY(tx, ty) - lift)
          sp.zIndex = (tx + ty) * 16 + 1
          // wall-foot AO: a tile tucked below a higher back neighbour sits in its shade
          const bL = Math.max(levelAt(tx - 1, ty), levelAt(tx, ty - 1))
          const ao = bL > L ? Math.min(0.24, (bL - L) * 0.13) : 0
          if (isSand) {
            const t = Math.min(1, ds / 5)
            const dune = 0.965 + 0.06 * vnoise(tx / 16 + 3, ty / 16 + 5)
            const grain = 0.994 + 0.012 * hash(tx * 1.3, ty * 2.1)
            sp.tint = shadeHex(tintFor(rampAt(SAND_RAMP, t), SAND_BASE), dune * grain)
          } else {
            const t = Math.min(1, L / NLEV) // higher terraces a touch richer
            const patch = 0.96 + 0.08 * vnoise(tx / 14 + 2, ty / 14 + 6)
            const grain = 0.995 + 0.01 * hash(tx * 1.3, ty * 2.1)
            sp.tint = tintFor(shadeHex(rampAt(GRASS_RAMP, t), patch * grain * (1 - ao)), GRASS_BASE)
          }
          world.addChild(sp)

          // FACES on the two camera-facing downhill edges (SE, SW): a drawn strata slice
          // sized to the exact height drop. Foam where the foot meets the sea.
          if (faceTex && L > 0) {
            for (const [ox, oy] of [[1, 0], [0, 1]] as [number, number][]) {
              const nL = levelAt(tx + ox, ty + oy)
              if (nL >= L) continue // neighbour is level or higher — no face here
              const drop = (L - nL) * STEP
              const ex = isoX(tx + ox * 0.5, ty + oy * 0.5)
              const ey = isoY(tx + ox * 0.5, ty + oy * 0.5) - lift
              const sw = 58
              const sx = Math.floor(hash(tx * 3.1 + ox * 7, ty * 2.7 + oy * 5) * (faceTex.width - sw))
              const fr = new Texture({ source: faceTex.source, frame: new Rectangle(sx, 0, sw, faceTex.height) })
              const seg = new Sprite(fr); seg.anchor.set(0.5, 0)
              seg.scale.set((38 / sw) * 1.16, (drop + 6) / faceTex.height)
              seg.position.set(ex, ey)
              seg.zIndex = (tx + ty) * 16 + lift + 30 // overhang the lower front tiles
              const fv = ox === 1 ? 0.76 : 0.98 // SE face shadowed, SW face sunlit (sun UL)
              const vv = Math.round(fv * 255); seg.tint = (vv << 16) | (vv << 8) | vv
              world.addChild(seg)
              // foam only where this drop lands in the SEA (a true sea cliff)
              if (dsAt(tx + ox, ty + oy) <= 0.3) {
                const foam = new Sprite(foamTex); foam.anchor.set(0.5, 0.5)
                foam.width = 40; foam.height = 15
                foam.position.set(ex, ey + drop + 5)
                foam.zIndex = (tx + ty) * 16 + lift + 29
                foam.alpha = 0.6 + 0.3 * hash(tx * 2.1 + ox, ty * 3.3 + oy)
                world.addChild(foam)
              }
            }
          }
        }
      }

      // ---- GOLDEN-HOUR SUNSET (bon3): a warm gold cast over the whole scene, a low sun
      // raking from the upper-left, a cool violet wash on the shadow side, and a warm
      // vignette. This is the beauty layer Ash called out — the world sits IN the sunset. ----
      // 1) warm gold cast (multiply toward gold → warms mids + shadows, kills the flat look)
      // eased from 0.5: the heavy gold multiply was the milky wash — c3 keeps its warmth
      // in the light, not smeared over the whole frame
      const warmMul = new Sprite(Texture.WHITE); warmMul.tint = 0xffd08a; warmMul.blendMode = 'multiply'; warmMul.alpha = 0.3; app.stage.addChild(warmMul)
      // 2) the low SUN raking from the upper-left (a big soft golden glow, additive). Core kept
      // gentle + its centre pushed OFF-frame so the land catches the falloff warmth, never a white-out.
      const sun = new Sprite(radial(512, [[0, 'rgba(255,224,158,0.30)'], [0.32, 'rgba(255,198,124,0.14)'], [0.66, 'rgba(255,172,100,0.04)'], [1, 'rgba(255,172,100,0)']]))
      sun.anchor.set(0.5); sun.blendMode = 'add'; app.stage.addChild(sun)
      // 3) a raked warm-to-cool GRADIENT across the frame (gold sun side → violet shade side)
      const rake = new Sprite(linGrad(1024, 0xffcaa0, 0.16, 0x2a2350, 0.26)); rake.blendMode = 'overlay'; app.stage.addChild(rake)
      // 4) warm sunset vignette
      const vig = new Sprite(radial(512, [[0, 'rgba(0,0,0,0)'], [0.52, 'rgba(0,0,0,0)'], [0.78, 'rgba(46,22,10,0.30)'], [1, 'rgba(24,10,6,0.68)']]))
      app.stage.addChild(vig)
      const resizeFx = () => {
        const vw = app.screen.width, vh = app.screen.height
        warmMul.width = vw; warmMul.height = vh
        rake.width = vw; rake.height = vh
        sun.width = sun.height = Math.max(vw, vh) * 1.9; sun.position.set(vw * 0.05, vh * -0.16)
        vig.width = vw * 1.5; vig.height = vh * 1.5; vig.position.set(-vw * 0.25, -vh * 0.25)
        world.x = vw / 2 - isoX(camTx, camTy) * ZOOM
        world.y = vh * 0.5 - isoY(camTx, camTy) * ZOOM
      }
      resizeFx()
      app.renderer.on('resize', resizeFx)

      app.ticker.add(() => {
        const wt = performance.now() / 1000
        animSwells(waterSprites, wt, () => 0)
      })
    }

    start().catch((err) => { console.error('[IslandMapIso] failed', err) })
    return () => { destroyed = true; if (instance) instance.destroy(true, { children: true }) }
  }, [])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#073442' }} />
}

// soft radial gradient texture (map-local atmosphere)
function radial(size: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [t, c] of stops) grad.addColorStop(t, c)
  g.fillStyle = grad; g.fillRect(0, 0, size, size)
  return Texture.from(cv)
}

// diagonal warm→cool gradient (golden sun corner → violet shade corner) for the sunset rake
function linGrad(size: number, c1: number, a1: number, c2: number, a2: number) {
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size
  const g = cv.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, size, size)
  const rgb = (c: number) => `${(c >> 16) & 255},${(c >> 8) & 255},${c & 255}`
  grad.addColorStop(0, `rgba(${rgb(c1)},${a1})`)
  grad.addColorStop(0.48, `rgba(${rgb(c1)},0)`)
  grad.addColorStop(0.56, `rgba(${rgb(c2)},0)`)
  grad.addColorStop(1, `rgba(${rgb(c2)},${a2})`)
  g.fillStyle = grad; g.fillRect(0, 0, size, size)
  return Texture.from(cv)
}
