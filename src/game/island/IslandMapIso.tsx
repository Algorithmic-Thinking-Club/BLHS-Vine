import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Texture } from 'pixi.js'
import {
  isoX, isoY, hash, vnoise, shadeHex, rampAt, tintFor,
  loadWaterVariants, seaTile, animSwells, type SwellSprite,
} from '../ocean'
import { CX, CY, coastDs, coastR, shelfW, lagoonK, cliffK, setSkeleton, CHANNEL, lavaDist, LAVA, HEAD_L, HEAD_R } from './terrain'
import { coneLvl, coneBand, coneH, gullyK, craterK, coneLit, stripeK } from './volcano'
import { PLAZA, PLAZA_R, GROVES, HARBOR, harborAt, riverD, pathD, onPathTile, coveNotchK, vegK, clearingK, SHADOW, initHubLayout } from './hub-layout'

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
}
// the coast grammar mask lives in terrain.ts (cliffK) — one truth for elevation, sand
// gating and the underwater shelf alike. The layout's designed notches (the WEST quiet
// cove + the NORTH jetty nook, GAME-DESIGN's four ports) open narrow breaks in the
// cliff arc so those coasts can hold their small landing beaches.
const cliffMask = (theta: number) => cliffK(theta) * (1 - coveNotchK(theta))
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
      // the layout derives every place from the REAL coastline — it must compute
      // AFTER the skeleton fetch above (module-load values sit on the fallback coast)
      initHubLayout()

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

      // The approved 3D block-tile island IS the default view now (?tiletest=0 for the
      // old pre-approval heightfield branch, kept only as history). Plain
      // ?scene=islandmap shows the clean volcano base without needing the flag.
      const TILETEST = params.get('tiletest') !== '0'
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
        // DIP KILLER: a tile sitting LOWER than 3+ of its land neighbours is a 1-tile
        // pockmark — at play zoom the meadow read as randomly pitted (dark riser
        // dashes scattered through the flat interior). Raise it to the lowest of the
        // higher neighbours. Coast/bench range only; the cone's authored rings stay.
        {
          const prev = Int8Array.from(LV)
          for (let ty = 1; ty < ROWS - 1; ty++) for (let tx = 1; tx < COLS - 1; tx++) {
            const L = prev[ty * COLS + tx]
            if (L < 0 || L > PLAT_L) continue
            const nb = [prev[ty * COLS + tx + 1], prev[ty * COLS + tx - 1], prev[(ty + 1) * COLS + tx], prev[(ty - 1) * COLS + tx]].filter((v) => v >= 0)
            const higher = nb.filter((v) => v > L)
            if (nb.length >= 3 && higher.length >= 3) LV[ty * COLS + tx] = Math.min(...higher)
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
            // the riser color follows the tile's SURFACE BAND so a vegetated slope reads
            // as a grassy bank (soft shadow), not a bright pink rock contour line — only
            // the BARE-ROCK upper flank (band 2) shows real strata faces (c3's exposed rock)
            const band = coneBand(tx2, ty2)
            const cl = coneLit(tx2, ty2)
            // NEAR-INVISIBLE riser (matched to the meadow top value) so the ~15 stacked
            // 1-level skirt steps melt into ONE smooth grassy slope (c3), not a ziggurat.
            // The contour lines were pure VALUE CONTRAST — a 26%-darker riser next to the
            // grass top drew a line at every level. Pull the riser to within ~8% of the top.
            const lo = 0.92 + 0.08 * cl
            if (band === 0) {
              // grass skirt: the face wears GRASS TEXTURE, not tinted rock — the
              // strata grain (even value-matched) printed every 10px step as a wood
              // plank line and the whole skirt read as diagonal striping (round 8).
              // A crop of the flat grass tile itself + a soft shade = a turf crease.
              const gt2 = flatG.length ? flatG : grassV.filter(Boolean)
              if (gt2.length) {
                const g2 = gt2[Math.floor(vnoise(tx2 / 5 + 3, ty2 / 5 + 8) * gt2.length) % gt2.length]
                const gh = Math.min(g2.height - 6, need)
                seg.texture = new Texture({ source: g2.source, frame: new Rectangle(0, 6, Math.min(64, g2.width), gh) })
                if (need > gh) seg.scale.y = need / gh
              }
              seg.tint = tint24(lo * 0.74, lo * 0.8, lo * 0.46)
            } else if (band === 1) {
              // merge belt: dry earthy-olive bank (grass meshing into rock, c3)
              seg.tint = tint24(lo * 0.72, lo * 0.66, lo * 0.40)
            } else {
              // bare rock upper flank: real strata face, matches the tread value
              const k = dropPx >= CSTEP * 2 ? 0.97 : 0.88
              const [r, g, b] = coneTint(tx2, ty2)
              seg.tint = tint24(r * k, g * k, b * Math.min(1, k + 0.03))
            }
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
        const drawColumn = (bx2: number, by2: number, m: number, toSea: boolean, tx2: number, ty2: number, zBase2: number, volc = false, grassy = false) => {
          if (!rockW.length || m <= 0) return
          // a GRASS-topped inland step is a turf SLOPE, not a rock wall: its riser reads
          // as shaded meadow (Ash's "contour lines" were warm rock faces printed under
          // green tops). Coast cliffs (toSea) stay rock. Turf tint ladders with the drift.
          const turf = grassy && !toSea
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
            under.tint = turf ? 0x556831 : 0x6a6058
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
            if (turf) {
              // grassy bank matched to the meadow's MEAN value. Texture variance only
              // on REAL drops (2+ levels — the naked-riser fix): on 1-level lips the
              // variance re-printed the scattered-dash noise across the flat meadow
              const tex2 = m >= 2 ? 0.9 + 0.16 * vnoise(tx2 / 2.3 + 6, ty2 / 2.3 + k * 0.7 + 2) : 1
              const d2 = drift * tex2 * (0.97 - 0.02 * (m - 1 - k))
              if (m === 1) {
                // a lone 1-level meadow step is a soft SHADED CREASE, not a bank: at
                // meadow value it printed as scattered tan planks across the flat
                seg.tint = tint24(d2 * 0.45, d2 * 0.53, d2 * 0.3)
              } else {
                seg.tint = tint24(d2 * 0.66, d2 * 0.72, d2 * 0.40)
              }
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

        // THE PLACES (plaza, promenade, ports, river, paths, POIs) live in hub-layout.ts
        // now — the master layout data module (Phase A of the hub method). The renderer
        // only asks "how far is this tile from X".
        const plazaD = (tx2: number, ty2: number) => Math.hypot(tx2 - PLAZA[0], ty2 - PLAZA[1])
        void pathD // paths render in the global green pass (Phase B)

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
                // a lava tile's step pours EVERYWHERE, benches included — below the
                // cone the flow's steps drew charred columns and the river read as
                // dashes with dark gaps at every bench lip
                const moltenStep = !NOCONE && !toSea && (lavaDist(tx, ty) < 1.25 || craterK(tx, ty) > 0.32)
                if (isCone || (moltenStep && L > 0)) {
                  // the cone's own steps wear the block skin — one strip, one tint field;
                  // river tiles pour over their steps as burning falls
                  drawFace(bx, by, lift - liftOf(floorMin), tx, ty, zBase, moltenStep)
                } else {
                  const charred = !NOCONE && (lavaDist(tx, ty) < 1.55 || craterK(tx, ty) > 0.4)
                  // a grass-topped inland step wears a turf riser (kills the pink
                  // rock contour lines under the meadow); sand beaches + coast cliffs
                  // + charred channel keep rock
                  const grassy = !sand && !charred && cliffMask(Math.atan2(ty - CY, tx - CX)) < 0.35
                  drawColumn(bx, by, L - floorMin, toSea, tx, ty, zBase, charred, grassy)
                }
                // TARGETED CHANNEL VOID FILL: the steep lava river drops fast, so its
                // BACK edges over a 2+level-lower neighbour open real black slots (the
                // one place the cone's 10px steps aren't self-covering). Fill ONLY the
                // channel, charred-dark so it recedes — NOT the broad fills Ash circled
                // (those tinted bright rock across the whole flank). Grass/rock steps
                // stay unfilled (their 1-level slivers read fine).
                const inChannel = !NOCONE && (lavaDist(tx, ty) < 1.7 || craterK(tx, ty) > 0.3)
                if (inChannel && (sideL.length || sideW.length)) {
                  const fam = sideL.length ? sideL : sideW
                  for (const [ox, oy] of [[-1, 0], [0, -1], [-1, -1]] as [number, number][]) {
                    const nl = eLvl(tx + ox, ty + oy)
                    if (nl < 0 || nl >= L - 1) continue
                    const vH = Math.min(60, lift - liftOf(nl) - (ox && oy ? 32 : 16))
                    if (vH <= 4) continue
                    const tex = fam[Math.floor(vnoise(tx / 4 + 6.3, ty / 16 + 2.9) * fam.length) % fam.length]
                    const fh = Math.min(tex.height - 36, vH)
                    const fr = new Texture({ source: tex.source, frame: new Rectangle(0, 36, 64, fh) })
                    const seg = new Sprite(fr); seg.anchor.set(0.5, 1)
                    seg.width = ox && oy ? 38 : 34
                    seg.position.set(bx + (ox - oy) * 16, by - (ox && oy ? 10 : 0) + 9)
                    if (vH > fh) seg.scale.y *= vH / fh
                    seg.tint = 0x3a2a1e     // charred basalt bank
                    seg.zIndex = zBase + 1
                    world.addChild(seg)
                  }
                }
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
            // ribbon width 1.25, NOT 0.95: at 0.95 a diagonal flow rasterized into a
            // corner-connected single-tile chain — molten diamonds touching only at
            // their points, reading as broken orange DASHES down the whole flank
            const isLava = !NOCONE && lavaT.length > 0 && L > 0 && (ld < 1.25 || ck > 0.32)
            // the bed hugs the future ribbon (a 4-tile charred swath read as a black scar)
            const isBed = !NOCONE && !isLava && L > 0 && (ld < 1.7 || ck > 0.4)
            // the worn path wears dry sand through the meadow (grass ring only, never
            // up the cone or over the beach's own sand)
            // paths may cross the grassy cone toe (the lawn IS mostly toe) — never the
            // rock bands, never the beach's own sand
            // the worn paths + plaza floor are BACK (Phase B of the hub method): they
            // render the master layout's walkable spine — meadow ground only, never
            // the cone's rock bands, never the beach sand, never over lava/river
            const pdst = plazaD(tx, ty)
            const onPlaza = !sand && L > 0 && pdst < 5.5
            const pD = pathD(tx, ty)
            const onPath = !onPlaza && !sand && L > 0 && coneBand(tx, ty) === 0
              && lavaDist(tx, ty) > 1.4 && onPathTile(tx, ty)
            // the river renders ONLY as the flat tidal estuary at the cove (L 0-1):
            // on the terraced ring the water tiles stepped down the benches as floating
            // mint checkers — a broken river is worse than none (the full flank river
            // waits for a dedicated waterfall pass)
            // even the estuary stub read as floating mint checkers at the south
            // shore (3 orphan water diamonds above the sand) — the river paints
            // NOTHING until the dedicated falls/river pass draws all of it
            const RIVER_ON = false
            const onRiver = RIVER_ON && !sand && !isLava && !isBed && L > 0 && L <= 1 && riverD(tx, ty) < 0.8
            const vs = band >= 1 && rockTop.length ? rockTop : undefined
            const pool = sand ? st
              : isLava ? (ck > 0.32 && lakeT.length ? lakeT : lavaT)
                : isBed && volcT.length ? volcT
                  : onRiver && waterV.length ? waterV
                    : (onPath || onPlaza) && st.length ? st : vs || gt
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
              } else if (onPlaza) {
                // the flagstone courtyard: cool weathered stone, warmer sun-worn flags in
                // the centre, a darker mortar rim ring reading its edge against the meadow
                const rim = pdst > PLAZA_R - 1.2 ? 0.82 : 1       // the defined outer ring
                const flag = 0.9 + 0.16 * vnoise(tx / 2.3 + 40, ty / 2.3 + 12)  // per-flag value break
                const v = flag * grain * rim * (1 + 0.08 * rk)
                top.tint = warmCool(shadeHex(0xbcae94, v), rk * 0.5)
              } else if (onPath) {
                // the trail: pale dry trodden earth through the green (c3's cream
                // paths) — light enough to read at map zoom, never orange carpet
                const v = (0.99 + 0.05 * vnoise(tx / 7 + 3, ty / 7 + 9)) * grain * (1 + 0.08 * rk)
                top.tint = warmCool(shadeHex(0xe6d6ac, v), rk * 0.4)
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
                // path fringe: the grass dries pale where feet leave the trail — melts
                // the path's tile-quantized edge instead of a hard sand/green seam
                const dry = Math.max(0, 1 - pD / 1.2) * 0.32
                // canopy AO: the ground darkens under the jungle belt so the green
                // masses SIT IN the meadow instead of standing on a bright carpet
                const vShade = 1 - 0.15 * smooth(0.45, 0.95, vegK(tx, ty))
                const lit = patch * grain * (1 + 0.13 * rk) * (1.03 - 0.07 * zone) * (1 + 0.14 * cl) * vShade * (1 + 0.1 * dry)
                const tv2 = Math.max(0, tval - 0.32 * dry)
                top.tint = warmCool(tintFor(shadeHex(rampAt(GRASS_RAMP, tv2), lit), GRASS_BASE), rk)
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

        // ---- ASSETS STRIPPED (2026-07-07, Ash: remove all placed prop assets — they read
        // as slop). The island is now the CLEAN BASE only: tile terrain + the volcano +
        // lava + ocean, plus crater steam + drifting cloud shade. Every placed prop removed
        // (groves, plaza monument, panther heads, harbor, lighthouse, ruin, gulls). Rebuild here.
        const flyers: { sp: Sprite; cx: number; cy: number; r: number; spd: number; ph: number }[] = []

        // ---- THE GREEN PASS (Phase B, docs/place-specs/hub-island-method.md): the
        // island's vegetation as ONE global system driven by hub-layout's vegK field.
        // Composition grammar = the beach's proven jungle wall: masses are built by
        // OVERLAPPING individual palms + understory with scale/mirror/tint variance
        // (canopy-mass sprites were tried and REJECTED — their mini-crowns break the
        // world's one scale). Every plant is grounded by a low-sun cast shadow along
        // the layout's ONE shadow direction, back plants darken for depth, and the
        // whole canopy sways. All art newly generated this run, style-anchored on the
        // approved beach palms (the family Ash gated) into this island's own crops.
        const vegT: Record<string, Texture> = {}
        const VEGF = ['palm-b', 'coco-v1', 'coco-v2', 'coco-v3', 'fan-1', 'tfern-1', 'palm-a',
          'bush-a', 'bush-b', 'fernclump-1', 'banana-1', 'heliconia-1', 'boulder-1', 'boulder-2',
          'coco-lean', 'coco-sapling', 'palm-fallen', 'tuft-1', 'tuft-2']
        await Promise.all(VEGF.map(async (n) => {
          try {
            const t: Texture = await Assets.load(`/art/island/veg/${n}.png`)
            t.source.scaleMode = 'nearest'; vegT[n] = t
          } catch { /* piece not generated yet — the pass degrades gracefully */ }
        }))
        const sways: { sp: Sprite; amp: number; w: number; ph: number }[] = []
        // the one cast-shadow texture: a soft cool-violet pool, stretched along the
        // sun's shadow line per plant (the beach lesson: shadows must be DENSE enough
        // to register under the warm grade, or nothing reads as grounded)
        // flat-cored falloff: a soft-edged gradient dies under the warm grade — the
        // beach lesson (round 3 there too): shadows must hold their core density
        const shadTex = radial(64, [[0, 'rgba(24,18,54,0.95)'], [0.72, 'rgba(24,18,54,0.6)'], [1, 'rgba(24,18,54,0)']])
        const shadAng = Math.atan2(SHADOW.dy * 0.5, SHADOW.dx)   // squashed into iso ground plane
        const TALL = new Set(['palm-b', 'coco-v1', 'coco-v2', 'coco-v3', 'fan-1', 'tfern-1', 'palm-a'])
        const putPlant = (name: string, px: number, py: number, o: { sc?: number; flip?: boolean; dark?: number; sway?: number; noShadow?: boolean } = {}) => {
          const t = vegT[name]
          if (!t) return
          if (harborAt(Math.round(px), Math.round(py))) return   // nothing sprouts through a deck
          const L2 = eLvl(Math.round(px), Math.round(py))
          if (L2 <= 0) return
          // ground-sitting rule: WIDE props (boulders, logs) need level ground —
          // straddling a bench step reads as floating (Ash: "don't sit properly")
          if (!TALL.has(name) && t.width > 100) {
            if (eLvl(Math.round(px + 0.6), Math.round(py)) !== L2 || eLvl(Math.round(px), Math.round(py + 0.6)) !== L2
              || eLvl(Math.round(px - 0.6), Math.round(py)) !== L2 || eLvl(Math.round(px), Math.round(py - 0.6)) !== L2) return
          }
          const lift = liftOf(L2)
          const sc = o.sc ?? 1
          const bx2 = isoX(px, py), by2 = isoY(px, py) - lift + GY + 11
          const zB = (Math.round(px) + Math.round(py)) * 4000 + lift * 2
          const tall = TALL.has(name)
          // the cast shadow: tall trunks throw long blades toward the lower-right,
          // low clumps pool a short one at their feet. The shadow FALLS ACROSS the
          // rows in front of the plant, so its z must ride ~2 rows forward — at the
          // plant's own row the fronting tiles' tops paint straight over it (the
          // invisible-shadow bug of round 1). It stays under plants (+700) there.
          if (!o.noShadow) {
            const sh = new Sprite(shadTex)
            sh.anchor.set(0.32, 0.5)
            sh.rotation = shadAng
            sh.width = (tall ? t.height * 1.05 : t.width * 0.6) * sc
            sh.height = Math.max(12, t.width * (tall ? 0.24 : 0.3) * sc)
            sh.alpha = SHADOW.alpha * (o.dark ?? 1)
            sh.position.set(bx2 + 4 * sc, by2 - 3)
            sh.zIndex = (Math.round(px) + Math.round(py) + 2) * 4000 + 320
            if (params.get('shdbg')) { sh.tint = 0xff0000; sh.alpha = 1 }
            world.addChild(sh)
          }
          const sp = new Sprite(t)
          sp.anchor.set(0.5, 1)
          sp.position.set(bx2, by2)
          sp.scale.set((o.flip ? -1 : 1) * sc, sc)
          if (o.dark !== undefined && o.dark < 1) {
            const vv = Math.round(255 * o.dark)
            sp.tint = (vv << 16) | (vv << 8) | Math.min(255, vv + 14)  // depth rows cool as they darken
          }
          sp.zIndex = zB + 700
          world.addChild(sp)
          if (o.sway) sways.push({ sp, amp: o.sway, w: 0.5 + 0.5 * hash(px * 1.7, py * 2.9), ph: hash(px, py) * 6.3 })
          return sp
        }
        // THE GROVES, PLACED DIRECTLY (Ash's steer: a walkable island of designed
        // stands, not a forest): every hub-layout grove site is GUARANTEED its 4-8
        // palm mass + understory + shade pool — composition by authorship, never a
        // density lottery (half the sites came up empty when seeds rolled dice).
        const PALMS = ['palm-b', 'coco-v1', 'coco-v2', 'coco-v3', 'coco-lean', 'coco-sapling']
        const RARE = ['fan-1', 'palm-a', 'palm-a', 'tfern-1']   // tfern's loud crown stays rare
        const UNDER = ['bush-a', 'bush-b', 'fernclump-1']
        for (let gi = 0; gi < GROVES.length; gi++) {
          const [gx, gy, gr] = GROVES[gi]
          if (DBG) {
            const dot = new Sprite(Texture.WHITE)
            dot.tint = 0xff00ff; dot.width = 60; dot.height = 60
            dot.anchor.set(0.5)
            dot.position.set(isoX(gx, gy), isoY(gx, gy) + GY)
            dot.zIndex = 90_000_000
            world.addChild(dot)
          }
          if (eLvl(Math.round(gx), Math.round(gy)) <= 0) continue
          // the grove's pooled canopy shade first
          const pool = new Sprite(shadTex)
          pool.anchor.set(0.5, 0.5)
          pool.width = 150 + gr * 55
          pool.height = 66 + gr * 22
          pool.alpha = 0.2
          pool.position.set(isoX(gx, gy), isoY(gx, gy) - liftOf(eLvl(Math.round(gx), Math.round(gy))) + GY + 6)
          pool.zIndex = (Math.round(gx + gy) + 1) * 4000 + 300
          world.addChild(pool)
          const n = 6 + Math.floor(hash(gi * 3.7 + 2, gi * 1.9 + 5) * 6)
          for (let i = 0; i < n; i++) {
            const ang = hash(gi * 7.3 + i * 2.1, gi + i) * Math.PI * 2
            const rad = gr * (0.15 + 0.85 * hash(gi + i * 3.3, gi * 5.1 + i))
            const jx = gx + Math.cos(ang) * rad
            const jy = gy + Math.sin(ang) * rad * 0.85
            // palms may stand right beside a path (they frame it — c3); only the
            // path bed itself and hard clearings (plaza floor, port aprons) reject
            if (clearingK(jx, jy) > 0.8 || coastDs(jx, jy) < 1.4 || lavaDist(jx, jy) < 2) continue
            const r2 = hash(jx * 3.1, jy * 1.7)
            const dark = 1 - 0.2 * hash(jx + 9, jy + 4)
            if (r2 < 0.8) {
              const nm = PALMS[Math.floor(hash(jx * 5.3, jy * 7.7) * PALMS.length) % PALMS.length]
              putPlant(nm, jx, jy, { sc: 0.72 + 0.5 * hash(jx + 1, jy + 8), flip: hash(jx + 4, jy) > 0.5, dark, sway: 0.014 })
            } else {
              const nm = RARE[Math.floor(hash(jx * 2.9, jy * 4.3) * RARE.length) % RARE.length]
              putPlant(nm, jx, jy, { sc: 0.72 + 0.3 * hash(jx + 2, jy + 5), flip: hash(jx, jy + 6) > 0.5, dark, sway: 0.012 })
            }
          }
          // understory + a tuft or two at the grove floor
          const n2 = 3 + Math.floor(hash(gi * 9.1, gi * 4.7) * 4)
          for (let i = 0; i < n2; i++) {
            const ang = hash(gi * 5.9 + i * 4.3, gi * 2.3 + i) * Math.PI * 2
            const rad = gr * (0.3 + 0.75 * hash(gi + i * 6.7, gi + i * 1.1))
            const jx = gx + Math.cos(ang) * rad
            const jy = gy + Math.sin(ang) * rad * 0.85
            if (clearingK(jx, jy) > 0.8 || coastDs(jx, jy) < 1.4 || lavaDist(jx, jy) < 2) continue
            const nm = UNDER[Math.floor(hash(jx * 8.3, jy * 5.9) * UNDER.length) % UNDER.length]
            putPlant(nm, jx, jy, { sc: 0.55 + 0.3 * hash(jx + 3, jy + 7), flip: hash(jx + 5, jy + 4) > 0.5, dark: 0.88, sway: 0.006 })
          }
        }
        for (let sy = 3; sy < ROWS - 3; sy += 3) {
          for (let sx = 3; sx < COLS - 3; sx += 3) {
            let k = vegK(sx, sy)
            // c3's palm ranks along the terrace lips: a bench edge boosts its azimuth
            const Ls = eLvl(sx, sy)
            const lip = Ls > 0 && Ls <= PLAT_L && (eLvl(sx + 1, sy) < Ls || eLvl(sx, sy + 1) < Ls)
            if (lip) k = Math.min(1, k + 0.28)
            if (k <= 0.08) continue
            // fire less often, plant more per firing: grove-and-clearing rhythm —
            // even spacing was the reviewer's "stamped, not grown" tell
            if (hash(sx * 2.1 + 3, sy * 3.3 + 7) > k * 1.12) continue
            const n = Math.max(1, Math.round(k * 4.3 + hash(sx, sy * 1.3) * 2))
            const deep = smooth(0.55, 0.95, k)
            // the grove's pooled canopy shade: one wide soft shadow under the whole
            // cluster seats it into the meadow (the 8-rules AO pool)
            if (deep > 0.15 && eLvl(sx, sy) > 0) {
              const pool = new Sprite(shadTex)
              pool.anchor.set(0.5, 0.5)
              pool.width = 210 + 120 * deep
              pool.height = 90 + 50 * deep
              pool.alpha = 0.14 + 0.1 * deep
              pool.position.set(isoX(sx, sy), isoY(sx, sy) - liftOf(eLvl(sx, sy)) + GY + 6)
              pool.zIndex = (sx + sy + 1) * 4000 + 300
              world.addChild(pool)
            }
            for (let i = 0; i < n; i++) {
              // wide jitter (±2.3 tiles) — the tight ±1.5 left the 3-lattice showing
              // as diagonal palm ranks across the cone skirt at far zoom
              const jx = sx + (hash(sx + i * 7.1, sy + 2) - 0.5) * 4.6
              const jy = sy + (hash(sx + 3, sy + i * 5.7) - 0.5) * 4.6
              if (vegK(jx, jy) <= 0.05 && !lip) continue
              const r = hash(jx * 3.1, jy * 1.7)
              const dark = 1 - 0.3 * deep * hash(jx + 9, jy + 4)
              // the cone's gully tongues wear SMALLER growth hugging the slope —
              // full-height palms on the stepped flank read as stilts
              const flank = coneH(jx, jy) > 7
              if (r < (flank ? 0.4 : 0.62)) {
                const nm = PALMS[Math.floor(hash(jx * 5.3, jy * 7.7) * PALMS.length) % PALMS.length]
                putPlant(nm, jx, jy, { sc: (flank ? 0.58 : 0.74) + 0.48 * hash(jx + 1, jy + 8), flip: hash(jx + 4, jy) > 0.5, dark, sway: 0.014 })
              } else if (r < 0.76) {
                const nm = RARE[Math.floor(hash(jx * 2.9, jy * 4.3) * RARE.length) % RARE.length]
                putPlant(nm, jx, jy, { sc: 0.75 + 0.3 * hash(jx + 2, jy + 5), flip: hash(jx, jy + 6) > 0.5, dark, sway: 0.012 })
              } else {
                const nm = UNDER[Math.floor(hash(jx * 6.1, jy * 3.7) * UNDER.length) % UNDER.length]
                putPlant(nm, jx, jy, { sc: 0.6 + 0.3 * hash(jx + 6, jy + 1), flip: hash(jx + 2, jy + 2) > 0.5, dark: Math.min(1, dark + 0.06), sway: 0.007 })
              }
            }
            // the belt's shaded floor: extra understory packed between the trunks so
            // the jungle interior reads layered, not stilts on a lawn
            const n2 = Math.round(deep * 2.4)
            for (let i = 0; i < n2; i++) {
              const jx = sx + (hash(sx + i * 3.9 + 11, sy + 6) - 0.5) * 3.4
              const jy = sy + (hash(sx + 8, sy + i * 4.7 + 13) - 0.5) * 3.4
              if (vegK(jx, jy) <= 0.3) continue
              const nm = UNDER[Math.floor(hash(jx * 8.3, jy * 5.9) * UNDER.length) % UNDER.length]
              putPlant(nm, jx, jy, { sc: 0.55 + 0.35 * hash(jx + 3, jy + 7), flip: hash(jx + 5, jy + 4) > 0.5, dark: 0.82 + 0.14 * hash(jx, jy + 11), sway: 0.006 })
            }
            // banana + heliconia: rare jewels at the jungle's sunny edges, small and
            // tucked between palms — never a striped sail or a red flagpole
            if (k > 0.3 && hash(sx * 6.3, sy * 8.7) < 0.12) {
              putPlant('banana-1', sx + hash(sx + 1, sy) * 2.4 - 1.2, sy + hash(sy + 1, sx) * 2.4 - 1.2, { sc: 0.42 + 0.14 * hash(sx + 4, sy + 1), flip: hash(sx, sy + 8) > 0.5, dark: 0.9, sway: 0.008 })
            }
            if (k > 0.25 && k < 0.6 && hash(sx * 7.7, sy * 9.1) < 0.07) {
              putPlant('heliconia-1', sx + hash(sx, sy) * 2 - 1, sy + hash(sy, sx) * 2 - 1, { sc: 0.45 + 0.12 * hash(sx + 2, sy + 3), sway: 0.01 })
            }
          }
        }
        // THE OPEN MEADOW'S LIFE (the walkable ground between groves is a place,
        // not a void): grass tufts + wildflower drifts, sparse boulders, and the
        // occasional fallen trunk telling a small story
        for (let sy = 4; sy < ROWS - 4; sy += 2) {
          for (let sx = 4; sx < COLS - 4; sx += 2) {
            const L3 = eLvl(sx, sy)
            if (L3 <= 0 || L3 > PLAT_L) continue
            if (coastDs(sx, sy) < 2.5 || lavaDist(sx, sy) < 2 || coneH(sx, sy) > 4) continue
            if (clearingK(sx, sy) > 0.4) continue
            const r = hash(sx * 4.9, sy * 6.1)
            const jx = sx + hash(sx, sy + 3) * 1.8 - 0.9
            const jy = sy + hash(sx + 5, sy) * 1.8 - 0.9
            if (r < 0.055) {
              putPlant(hash(sx + 2, sy) > 0.5 ? 'tuft-1' : 'tuft-2', jx, jy, { sc: 0.42 + 0.3 * hash(sx + 7, sy + 2), flip: hash(sx + 1, sy + 9) > 0.5, noShadow: true })
            } else if (r < 0.062) {
              // darkened — at native tint the terracotta+violet faces read as
              // loud pink blobs against the meadow at mid zoom
              putPlant(hash(sx, sy) > 0.75 ? 'boulder-1' : 'boulder-2', jx, jy, { sc: 0.5 + 0.35 * hash(sx + 7, sy + 2), flip: hash(sx + 1, sy + 9) > 0.5, dark: 0.8 })
            } else if (r < 0.0655) {
              putPlant('palm-fallen', jx, jy, { sc: 0.5 + 0.15 * hash(sx + 4, sy + 6), flip: hash(sx + 3, sy + 1) > 0.5 })
            }
          }
        }

        // ---- THE EAST HARBOR (Phase C1 rebuilt after Ash's "glorious harbor, not
        // some ragdoll port" verdict): a tile-level STRUCTURE from HARBOR data —
        // block columns + flat material tops per tile, painter-sorted exactly like
        // the land itself, with per-tile lift/walk data as the future collision
        // truth. The raised stone quay cuts the waterline, the timber main pier
        // runs seaward, a rock breakwater arm encloses the basin; the bell, crane,
        // lanterns and cargo MOUNT ON the deck; boats ride the basin with foam and
        // bob. No sprite is nudged by eye — every anchor comes from the plan.
        const bobs: { sp: Sprite; y0: number; w: number; ph: number }[] = []
        try {
          const hb: Record<string, Texture> = {}
          for (const n of ['stone-block-a', 'stone-block-b', 'plank-block-a', 'crane', 'sloop', 'rowboat', 'warehouse', 'panther-statue', 'net-rack', 'beacon', 'deck-top-0', 'deck-top-1', 'deck-top-2', 'riprap-a', 'riprap-b', 'riprap-c', 'bollard-b']) {
            try {
              const t: Texture = await Assets.load(`/art/island/harbor/${n}.png?v=5`)
              t.source.scaleMode = 'nearest'; hb[n] = t
            } catch { /* not landed yet */ }
          }
          const pt: Record<string, Texture> = {}
          for (const n of ['bell-frame', 'cargo-a', 'lantern-post', 'bollard-a', 'harbor-shed', 'harbor-sign']) {
            try {
              const t: Texture = await Assets.load(`/art/island/port/${n}.png?v=2`)
              t.source.scaleMode = 'nearest'; pt[n] = t
            } catch { /* */ }
          }
          if (hb['stone-block-a'] && hb['plank-block-a'] && HARBOR.tiles.length) {
            const topOf = (t: Texture) => new Texture({ source: t.source, frame: new Rectangle(0, 0, 64, 36) })
            const faceOf = (t: Texture) => new Texture({ source: t.source, frame: new Rectangle(0, 18, 64, 46) })
            // ONE stone variant for the whole quay (mixing light/dark tops printed
            // a checkerboard)
            const stoneT = [topOf(hb['stone-block-a']), topOf(hb['stone-block-a'])]
            const stoneF = faceOf(hb['stone-block-a'])
            // the deck TOP is the REAL beach-pier wood (Ash: "an actual normal
            // port-wood plank texture brown") — three plank diamonds harvested
            // straight off the approved beach pier's deck, hash-picked per tile,
            // quiet low-frequency drift keeping the run from checkering
            const plankTops = [0, 1, 2]
              .map(i => hb[`deck-top-${i}`])
              .filter((t): t is Texture => !!t)
            if (!plankTops.length) plankTops.push(topOf(hb['plank-block-a']))
            const plankF = faceOf(hb['plank-block-a'])
            // the beam FASCIA for open-piling tiles: a slim drawn band hugging
            // the deck's two visible edges (the block face stretched to the
            // drop filled the whole 14px air gap — a solid wall, no daylight)
            const skirtCv = document.createElement('canvas')
            skirtCv.width = 64; skirtCv.height = 42
            {
              const g3 = skirtCv.getContext('2d')!
              g3.beginPath()
              g3.moveTo(0, 17); g3.lineTo(32, 34); g3.lineTo(64, 17)
              g3.lineTo(64, 23); g3.lineTo(32, 40); g3.lineTo(0, 23)
              g3.closePath()
              g3.fillStyle = '#6e4830'; g3.fill()
              g3.strokeStyle = 'rgba(38,24,14,0.6)'; g3.lineWidth = 1
              g3.beginPath(); g3.moveTo(0, 22.5); g3.lineTo(32, 39.5); g3.lineTo(64, 22.5); g3.stroke()
            }
            const skirtT = Texture.from(skirtCv)
            // a timber PILING: a tiny drawn post, stretched per tile drop
            const postCv = document.createElement('canvas')
            postCv.width = 6; postCv.height = 24
            {
              const g3 = postCv.getContext('2d')!
              g3.fillStyle = '#4a3323'; g3.fillRect(0, 0, 6, 24)
              g3.fillStyle = '#6a4a30'; g3.fillRect(0, 0, 2, 24)
              g3.fillStyle = '#2c1e13'; g3.fillRect(5, 0, 1, 24)
            }
            const postT = Texture.from(postCv)
            const isH = (x: number, y: number) => !!harborAt(x, y)
            for (const ht of HARBOR.tiles) {
              const bx2 = isoX(ht.tx, ht.ty), byTop = isoY(ht.tx, ht.ty) + GY - ht.lift
              const zB = (ht.tx + ht.ty) * 4000 + ht.lift * 2
              if (ht.mat === 'rock') {
                // the breakwater: bespoke WET RIP-RAP art, sea-born (the meadow
                // boulders carried baked-in grass skirts into the water and their
                // flat column tops read as crates — twice). One low rubble
                // cluster per tile, jittered/flipped/stretched, the overlaps
                // fusing the arc into one continuous rubble arm.
                const rrT = ['riprap-a', 'riprap-b', 'riprap-c'].map(n => hb[n]).filter(Boolean)
                if (rrT.length) {
                  const jx = ht.tx + (hash(ht.tx * 3.1, ht.ty * 1.7) - 0.5) * 0.5
                  const jy = ht.ty + (hash(ht.tx * 2.3, ht.ty * 5.1) - 0.5) * 0.5
                  const sp = new Sprite(rrT[Math.floor(hash(ht.tx * 5.9, ht.ty * 4.3) * rrT.length * 0.999)])
                  sp.anchor.set(0.5, 0.74)               // waist-deep in the sea
                  sp.position.set(isoX(jx, jy), isoY(jx, jy) + GY + 3)
                  const sc2 = 0.85 + 0.45 * hash(jx * 7.7, jy * 3.9)
                  sp.scale.set((hash(jx, jy) > 0.5 ? -1 : 1) * sc2, sc2 * (0.82 + 0.3 * hash(jy * 3.3, jx * 6.1)))
                  sp.zIndex = Math.floor(jx + jy) * 4000 + 630
                  world.addChild(sp)
                  const fm = new Sprite(foamTex); fm.anchor.set(0.5, 0.5)
                  fm.width = 70; fm.height = 18; fm.alpha = 0.5
                  fm.position.set(bx2, isoY(ht.tx, ht.ty) + GY + 6)
                  fm.zIndex = (ht.tx + ht.ty) * 4000 + 604
                  world.addChild(fm)
                }
              } else {
                // ---- THE UNDERSTRUCTURE, graded by distance from shore (Ash:
                // "the harbor is elevated and sits on rocks for a bit, but as it
                // goes further out the rocks disappear and it becomes beams").
                // Near-shore tiles stand on a ROCK footing; open-water tiles
                // stand on timber PILINGS under a beam fascia. Only the screen-S
                // and screen-E sides can show — a same-or-higher deck neighbor
                // masks its side, so interior tiles draw no understructure.
                const ds2 = coastDs(ht.tx, ht.ty)
                const onRock = ds2 > -1.5
                const exposed = ([[1, 0], [0, 1]] as [number, number][]).filter(([ox, oy]) => {
                  const nb = harborAt(ht.tx + ox, ht.ty + oy)
                  return !(nb && nb.mat !== 'rock' && nb.lift >= ht.lift)
                })
                // a dark waterline reflection under every exposed edge seats
                // the whole structure ON the sea instead of hovering over it
                for (const [ox, oy] of exposed) {
                  if (dsAt(ht.tx + ox, ht.ty + oy) > 0) continue   // sand takes no reflection
                  const rx = ht.tx + ox * 0.62, ry2 = ht.ty + oy * 0.62
                  const rf = new Sprite(shadTex); rf.anchor.set(0.5, 0.5)
                  rf.width = 54; rf.height = 13; rf.alpha = 0.3; rf.tint = 0x0a2a30
                  rf.position.set(isoX(rx, ry2), isoY(rx, ry2) + GY + 2)
                  rf.zIndex = zB + 1
                  world.addChild(rf)
                }
                if (exposed.length && (onRock || ht.mat === 'stone')) {
                  // the shore footing: the full shaded face down to the ground...
                  const face = new Sprite(ht.mat === 'stone' ? stoneF : plankF)
                  face.anchor.set(0.5, 0)
                  face.position.set(bx2, byTop)
                  const need = ht.lift + 14 + 18
                  face.scale.y = need / 46
                  if (ht.mat === 'plank') {
                    const dv = 0.94 + 0.1 * vnoise(ht.tx / 4 + 3, ht.ty / 4 + 7)
                    face.tint = (Math.min(255, Math.round(0x9a * dv)) << 16) | (Math.min(255, Math.round(0x85 * dv)) << 8) | Math.min(255, Math.round(0x70 * dv))
                  }
                  face.zIndex = zB + 1
                  world.addChild(face)
                  // ...with the SHORT wet rip-rap (never the tall meadow
                  // boulders — those overshot the plank top by ~40px and erupted
                  // THROUGH the deck). Base-anchored at the waterline on the OUTER
                  // exposed edge, scale capped to the deck gap so a rock can never
                  // rise above the plank surface.
                  const rrF = ['riprap-a', 'riprap-b', 'riprap-c'].map((n) => hb[n]).filter(Boolean)
                  if (rrF.length) {
                    for (const [ox, oy] of exposed) {
                      // one low pile pushed OUT past the deck edge into the shallows
                      const jx = ht.tx + ox * 0.5, jy = ht.ty + oy * 0.5
                      const rr = rrF[Math.floor(hash(ht.tx * 5.3 + ox, ht.ty * 7.1 + oy) * rrF.length * 0.999)]
                      const sp = new Sprite(rr)
                      sp.anchor.set(0.5, 1)                       // base sits at the waterline
                      sp.position.set(isoX(jx, jy), isoY(jx, jy) + GY + 9)
                      // cap height to the gap between waterline and deck underside
                      const maxSc = (ht.lift + 18) / rr.height
                      const sc2 = Math.min(maxSc, 0.3 + 0.12 * hash(jx * 7.7, jy * 3.9))
                      sp.scale.set((hash(jx, jy) > 0.5 ? -1 : 1) * sc2, sc2)
                      sp.tint = hash(jx + 1, jy + 2) > 0.5 ? 0xb0a89c : 0x9a9288
                      sp.zIndex = zB + 3
                      world.addChild(sp)
                    }
                  }
                } else if (exposed.length) {
                  // the open-water spans: a slim beam skirt hugs the deck edge,
                  // discrete pilings drop into the water under it — daylight and
                  // sea showing between the posts, a real pier's anatomy
                  for (const [ox] of exposed) {
                    const pts: [number, number][] = ox
                      ? [[ht.tx + 0.4, ht.ty - 0.2], [ht.tx + 0.4, ht.ty + 0.24]]
                      : [[ht.tx - 0.2, ht.ty + 0.4], [ht.tx + 0.24, ht.ty + 0.4]]
                    for (const [px2, py2] of pts) {
                      const sp = new Sprite(postT)
                      sp.anchor.set(0.5, 1)
                      sp.position.set(isoX(px2, py2), isoY(px2, py2) + GY + 14)
                      sp.width = 6
                      sp.height = ht.lift + 26
                      sp.zIndex = zB + 2
                      world.addChild(sp)
                    }
                  }
                  const skirt = new Sprite(skirtT)
                  skirt.anchor.set(0.5, 0)
                  skirt.position.set(bx2, byTop - 17)
                  const dv = 0.9 + 0.16 * vnoise(ht.tx / 4 + 3, ht.ty / 4 + 7)
                  const vv = Math.min(255, Math.round(255 * dv))
                  skirt.tint = (vv << 16) | (vv << 8) | vv
                  skirt.zIndex = zB + 3
                  world.addChild(skirt)
                }
                const top = new Sprite(ht.mat === 'stone'
                  ? stoneT[Math.floor(hash(ht.tx * 2.7, ht.ty * 3.3) * 4) % 2 === 0 ? 0 : 1]
                  : plankTops[Math.floor(hash(ht.tx * 3.7, ht.ty * 2.9) * plankTops.length * 0.999)])
                top.anchor.set(0.5, 0.5)
                top.position.set(bx2, byTop)
                top.zIndex = zB + 5
                if (ht.mat === 'plank') {
                  // quiet LOW-FREQUENCY value drift is ALL the extra variation —
                  // the wood grain itself carries the texture now
                  const dv = 0.97 + 0.05 * vnoise(ht.tx / 6 + 5, ht.ty / 6 + 9)
                  const vv = Math.min(255, Math.round(255 * dv))
                  top.tint = (vv << 16) | (vv << 8) | vv
                  top.scale.set(1.06)   // melt the seams like the land tops
                }
                world.addChild(top)
              }
              // foam laps every waterline face on exposed sea edges
              for (const [ox, oy] of [[1, 0], [0, 1]] as [number, number][]) {
                if (isH(ht.tx + ox, ht.ty + oy) || dsAt(ht.tx + ox, ht.ty + oy) > 0) continue
                const fm = new Sprite(foamTex); fm.anchor.set(0.5, 0.5)
                fm.width = 52; fm.height = 11; fm.alpha = 0.4
                fm.position.set(isoX(ht.tx + ox * 0.5, ht.ty + oy * 0.5), isoY(ht.tx + ox * 0.5, ht.ty + oy * 0.5) + GY + 4)
                fm.zIndex = Math.max(zB, (ht.tx + ox + ht.ty + oy) * 4000) + 64
                world.addChild(fm)
              }
            }
            // ---- the deck mounts: every anchor from the HARBOR plan, lifted to
            // the deck surface, grounded by a tight contact pool at deck z
            const mount = (t: Texture | undefined, at: [number, number], o: { sc?: number; flip?: boolean; glow?: boolean; deck?: boolean } = {}) => {
              if (DBG) {
                const dot = new Sprite(Texture.WHITE)
                dot.tint = t ? 0xffff00 : 0xff0000; dot.width = 24; dot.height = 24; dot.anchor.set(0.5)
                dot.position.set(isoX(at[0], at[1]), isoY(at[0], at[1]) + GY)
                dot.zIndex = 92_000_000
                world.addChild(dot)
              }
              if (!t) return
              // a mount stands at the height of the structure tile UNDER it
              const under = harborAt(Math.round(at[0]), Math.round(at[1]))
              const lift = o.deck === false ? 0 : under?.lift ?? 0
              const bx2 = isoX(at[0], at[1]), by2 = isoY(at[0], at[1]) + GY - lift + 8
              const zB = Math.floor(at[0] + at[1]) * 4000 + lift * 2
              const sh = new Sprite(shadTex)
              sh.anchor.set(0.4, 0.5)
              sh.width = t.width * (o.sc ?? 1) * 0.75; sh.height = Math.max(8, t.width * (o.sc ?? 1) * 0.22)
              sh.alpha = 0.34
              sh.position.set(bx2 + 3, by2 - 2)
              sh.zIndex = zB + 7
              world.addChild(sh)
              const sp = new Sprite(t); sp.anchor.set(0.5, 1)
              sp.position.set(bx2, by2)
              sp.scale.set((o.flip ? -1 : 1) * (o.sc ?? 1), o.sc ?? 1)
              sp.zIndex = zB + 720
              world.addChild(sp)
              if (o.glow) {
                // the lamp itself glows...
                const g = new Sprite(foamTex); g.anchor.set(0.5, 0.5); g.blendMode = 'add'
                g.tint = 0xffb050; g.width = 60; g.height = 40; g.alpha = 0.34
                g.position.set(bx2 + 2, by2 - t.height * (o.sc ?? 1) + 24)
                g.zIndex = zB + 724
                world.addChild(g)
                glows.push({ sp: g, ph: hash(at[0], at[1]) * 6.3, a: 0.34 })
                // ...and pools warm light on the DECK at its foot (golden-hour
                // light doing work — the reviewer's biggest "expensive" cue)
                const pool = new Sprite(foamTex); pool.anchor.set(0.5, 0.5); pool.blendMode = 'add'
                pool.tint = 0xffa848; pool.width = 84; pool.height = 46; pool.alpha = 0.26
                pool.position.set(bx2 + 2, by2 - 2)
                pool.zIndex = zB + 6
                world.addChild(pool)
                glows.push({ sp: pool, ph: hash(at[0], at[1]) * 6.3, a: 0.26 })
              }
              return sp
            }
            // PLACEMENT GUARD (Ash: "assets not sitting properly... the bell on
            // half port floating over water"). A big solid prop must stand on a
            // fully-supported INTERIOR deck tile — every one of its 4 neighbours
            // is also deck — so it can never straddle the water-facing lip. Snap
            // each solid prop's anchor to the nearest such tile centre.
            const isDeckT = (tx: number, ty: number) => { const t = harborAt(tx, ty); return !!t && t.mat !== 'rock' }
            const isInterior = (tx: number, ty: number) =>
              isDeckT(tx, ty) && isDeckT(tx + 1, ty) && isDeckT(tx - 1, ty) && isDeckT(tx, ty + 1) && isDeckT(tx, ty - 1)
            const deckCtr = (at: [number, number]): [number, number] => {
              let best = at, bd = 1e9
              for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
                const tx = Math.round(at[0]) + dx, ty = Math.round(at[1]) + dy
                if (!isInterior(tx, ty)) continue
                const d = Math.hypot(tx - at[0], ty - at[1])
                if (d < bd) { bd = d; best = [tx, ty] }
              }
              return best
            }
            mount(pt['bell-frame'], deckCtr(HARBOR.bell), { sc: 0.72 })
            // cool the crane timber a touch so its A-frame reads APART from the warm
            // ship hull behind it (reject: the crane+ship merged into one smear)
            { const cr = mount(hb['crane'], deckCtr(HARBOR.crane), {}); if (cr) cr.tint = 0xc7b9a6 }
            // the cargo yard: freight stacked at every work point, varied scale/flip
            for (let ci = 0; ci < HARBOR.cargo.length; ci++) {
              mount(pt['cargo-a'], deckCtr(HARBOR.cargo[ci]), { sc: 0.62 + 0.16 * hash(ci * 3.1 + 1, ci * 1.7 + 2), flip: ci % 2 === 1 })
            }
            for (const L2 of HARBOR.lanterns) mount(pt['lantern-post'], L2, { sc: 0.72, glow: true })
            for (const B of HARBOR.bollards) mount(hb['bollard-b'] ?? pt['bollard-a'], B, { sc: hb['bollard-b'] ? 0.2 : 0.34 })
            // mooring posts pace the boardwalk's seaward lip (the beach pier's
            // post rhythm at harbor scale)
            for (const E of HARBOR.edgePosts) mount(hb['bollard-b'] ?? pt['bollard-a'], E, { sc: hb['bollard-b'] ? 0.15 : 0.24 })
            // the harbor BEACON at the breakwater tip, its lamp breathing
            if (DBG) {
              const dot = new Sprite(Texture.WHITE)
              dot.tint = hb['beacon'] ? 0x00ff00 : 0xff0000; dot.width = 30; dot.height = 30; dot.anchor.set(0.5)
              dot.position.set(isoX(HARBOR.beacon[0], HARBOR.beacon[1]), isoY(HARBOR.beacon[0], HARBOR.beacon[1]) + GY)
              dot.zIndex = 93_000_000
              world.addChild(dot)
            }
            if (hb['beacon']) {
              const at = HARBOR.beacon
              const BSC = 1.32     // the HERO of the harbor — the tall vertical anchor
              const bx2 = isoX(at[0], at[1]), by2 = isoY(at[0], at[1]) + GY - 8
              const zB = Math.floor(at[0] + at[1]) * 4000
              const sp = new Sprite(hb['beacon']); sp.anchor.set(0.5, 0.97)
              sp.position.set(bx2, by2); sp.scale.set(BSC); sp.zIndex = zB + 940
              world.addChild(sp)
              const lampY = by2 - hb['beacon'].height * BSC + 44
              // a broad warm HALO + a bright lamp core, both breathing — the one
              // light source in the frame doing real work at golden hour
              const halo = new Sprite(foamTex); halo.anchor.set(0.5, 0.5); halo.blendMode = 'add'
              halo.tint = 0xffb84e; halo.width = 190; halo.height = 130; halo.alpha = 0.32
              halo.position.set(bx2, lampY); halo.zIndex = zB + 943
              world.addChild(halo)
              glows.push({ sp: halo, ph: 0.4, a: 0.34 })
              const g = new Sprite(foamTex); g.anchor.set(0.5, 0.5); g.blendMode = 'add'
              g.tint = 0xffe08a; g.width = 84; g.height = 58; g.alpha = 0.55
              g.position.set(bx2, lampY)
              g.zIndex = zB + 944
              world.addChild(g)
              glows.push({ sp: g, ph: 0.4, a: 0.55 })
            }
            // the teal school pennant flies at the pier's T-head
            try {
              const pnT: Texture = await Assets.load('/art/intro/props/pennant.png')
              pnT.source.scaleMode = 'nearest'
              const at = HARBOR.pennant
              const sp = new Sprite(pnT); sp.anchor.set(0.5, 1)
              sp.position.set(isoX(at[0], at[1]), isoY(at[0], at[1]) + GY - 14 + 8)
              sp.zIndex = Math.floor(at[0] + at[1]) * 4000 + 14 * 2 + 730
              world.addChild(sp)
              sways.push({ sp, amp: 0.03, w: 1.3, ph: 2.1 })
            } catch { /* pennant art optional */ }
            // gulls work the breakwater (the beach's own birds — shared island life)
            try {
              const gfT: Texture = await Assets.load('/art/intro/props/gull-fly.png')
              gfT.source.scaleMode = 'nearest'
              for (let gi = 0; gi < 3; gi++) {
                const sp = new Sprite(gfT); sp.anchor.set(0.5, 0.5)
                sp.zIndex = 5_000_000
                world.addChild(sp)
                flyers.push({
                  sp,
                  cx: isoX(HARBOR.beacon[0] - 2 - gi * 3, HARBOR.beacon[1] + 3 + gi),
                  cy: isoY(HARBOR.beacon[0] - 2 - gi * 3, HARBOR.beacon[1] + 3 + gi) + GY - 120 - gi * 30,
                  r: 130 + gi * 45, spd: (gi % 2 ? -1 : 1) * (0.16 + 0.05 * gi), ph: gi * 2.1,
                })
              }
              const gsT: Texture = await Assets.load('/art/intro/props/gull.png')
              gsT.source.scaleMode = 'nearest'
              // one gull stands watch on a breakwater boulder
              const rk = HARBOR.tiles.filter((t2) => t2.mat === 'rock')[2]
              if (rk) {
                const sp = new Sprite(gsT); sp.anchor.set(0.5, 1)
                sp.position.set(isoX(rk.tx, rk.ty), isoY(rk.tx, rk.ty) + GY - 26)
                sp.scale.set(0.8)
                sp.zIndex = Math.floor(rk.tx + rk.ty) * 4000 + 700
                world.addChild(sp)
              }
            } catch { /* gull art optional */ }
            // the waterfront buildings + dressing on the SAND behind the boardwalk —
            // every anchor coast-relative at ITS OWN row (offsets from the harbor
            // root drifted onto the deck where the coast bulges)
            const inland = (dy: number, back: number): [number, number] => {
              const y = HARBOR.root[1] + dy
              const wx = HARBOR.tiles.reduce((m, t2) => (t2.ty === Math.round(y) && t2.mat === 'plank' ? Math.min(m, t2.tx) : m), 999)
              let x = (wx === 999 ? HARBOR.root[0] : wx) - back
              // walk inland until the tile is SOLID FLAT SAND — off the waterline
              // (so it doesn't float) and below the grass riser (so it isn't clipped
              // half-away by the terrace edge — Ash's "half generated shack")
              let guard = 0
              while (guard++ < 7 && !(dsAt(Math.round(x), Math.round(y)) > 2 && eLvl(Math.round(x), Math.round(y)) === 0)) x -= 1
              return [x, y]
            }
            // the port SETTLEMENT — buildings clustered on the sand behind the
            // quay as one little yard (Ash: the warehouse had drifted far up the
            // beach, orphaned; a port's buildings sit together AT the harbor)
            // spread so no two silhouettes merge (reject #1: warehouse+shed stacked):
            // warehouse set back NORTH, sign alone on clear sand, shed dropped SOUTH
            // and smaller, net-rack furthest south — each with a full sand gap
            mount(hb['warehouse'], inland(-3.2, 4.2), { deck: false, sc: 1.06 })
            mount(pt['harbor-sign'], inland(-0.6, 2.6), { sc: 0.8, deck: false })
            mount(pt['harbor-shed'], inland(3.4, 2.8), { deck: false, sc: 0.86 })
            mount(hb['net-rack'], inland(5.4, 2.0), { deck: false, sc: 0.78 })
            // ---- the basin's boats: afloat with a foam ring, riding a slow bob
            const boat = (t: Texture | undefined, at: [number, number], sc = 1, flip = false) => {
              if (DBG) {
                const dot = new Sprite(Texture.WHITE)
                dot.tint = 0x00ffff; dot.width = 40; dot.height = 40; dot.anchor.set(0.5)
                dot.position.set(isoX(at[0], at[1]), isoY(at[0], at[1]) + GY)
                dot.zIndex = 91_000_000
                world.addChild(dot)
              }
              if (!t) return
              const bx2 = isoX(at[0], at[1]), by2 = isoY(at[0], at[1]) + GY + 6
              const zB = Math.floor(at[0] + at[1]) * 4000
              // a boat SITS IN the water: a dark displacement pool + a BOLD foam
              // collar right at the waterline, and the hull anchored near its own
              // waterline (0.9) so the keel tucks under the foam instead of the
              // whole hull floating proud on the teal
              const rf = new Sprite(shadTex); rf.anchor.set(0.5, 0.5)
              rf.width = t.width * sc * 0.92; rf.height = 20; rf.alpha = 0.4
              rf.tint = 0x08222a
              rf.position.set(bx2, by2 + 3)
              rf.zIndex = zB + 604
              world.addChild(rf)
              const fm = new Sprite(foamTex); fm.anchor.set(0.5, 0.5)
              fm.width = t.width * sc * 1.18; fm.height = 24; fm.alpha = 0.72
              fm.position.set(bx2, by2 + 1)
              fm.zIndex = zB + 646        // OVER the hull's waterline, hiding the keel seam
              world.addChild(fm)
              const sp = new Sprite(t); sp.anchor.set(0.5, 0.9)
              sp.position.set(bx2, by2)
              sp.scale.set((flip ? -1 : 1) * sc, sc)
              sp.zIndex = zB + 640
              world.addChild(sp)
              bobs.push({ sp, y0: by2, w: 0.55 + 0.3 * hash(at[0], at[1]), ph: hash(at[1], at[0]) * 6.3 })
              return sp
            }
            boat(hb['sloop'], HARBOR.sloop)
            // the second fisher is visibly DISTINCT (a weathered blue-grey hull),
            // not an obvious copy of the first (reviewer: duplicated boats read cheap)
            const sloop2Sp = boat(hb['sloop'], HARBOR.sloop2, 0.82, true)
            if (sloop2Sp) sloop2Sp.tint = 0x8fb0b8
            // the rowboat is HAULED UP on the sand — a beached vignette, not afloat
            mount(hb['rowboat'], HARBOR.rowboat, { deck: false, sc: 0.8, flip: true })
            // THE SHIP HERSELF at the berth — the approved 16-view painted rigger,
            // moored along the main pier's north face, bow seaward (v1 = the +x
            // diagonal). Her mass is what makes the harbor read as a real port.
            try {
              const shipT: Texture = await Assets.load('/art/intro/port/ship16/v1.png')
              shipT.source.scaleMode = 'nearest'
              const at = HARBOR.berth
              const bx2 = isoX(at[0], at[1]), by2 = isoY(at[0], at[1]) + GY + 4
              const zB = Math.floor(at[0] + at[1]) * 4000
              // a BOLD dark contact shadow pooled under the hull grounds the
              // ship's mass IN the water (the reviewer's #1: the biggest object
              // was floating on the teal)
              const rf = new Sprite(shadTex); rf.anchor.set(0.5, 0.5)
              rf.width = shipT.width * 0.82; rf.height = 30; rf.alpha = 0.5; rf.tint = 0x06202a
              rf.position.set(bx2, by2 + 7); rf.zIndex = zB + 600
              world.addChild(rf)
              const fm = new Sprite(foamTex); fm.anchor.set(0.5, 0.5)
              fm.width = shipT.width * 1.0; fm.height = 30; fm.alpha = 0.6
              fm.position.set(bx2, by2 + 2); fm.zIndex = zB + 602
              world.addChild(fm)
              const sp = new Sprite(shipT); sp.anchor.set(0.5, 0.86)
              sp.position.set(bx2, by2); sp.zIndex = zB + 900
              world.addChild(sp)
              bobs.push({ sp, y0: by2, w: 0.45, ph: 1.7 })
            } catch { /* ship art unavailable — the berth waits */ }
          }
        } catch { /* the harbor pass degrades gracefully until its art lands */ }

        // ---- THE GATE COMPLEX (Phase C2, rebuilt 2026-07-10): the two carved
        // panther heads at the lava mouths. These are NOT framed facade posters
        // (rejected) — each is a volumetric head SCULPTED from the massif's own
        // terracotta basalt (best-of-8 PixelLab, cracked-facet surround edge-faded
        // so it dissolves INTO the flank), placed big and low so the head reads as
        // carved OUT of the mountain. The SE head's maw is the dark Maw gateway;
        // the SW head POURS the molten flow (its glow breathes). The twin lava
        // curtains pour down in front, framing them.
        if (!NOCONE) {
          try {
            const spoutT: Texture = await Assets.load('/art/island/gate/head-spout.png?v=1')
            spoutT.source.scaleMode = 'nearest'
            // the gargoyle-SPOUT head (bon4 angle): juts out and DOWN the flank,
            // muzzle foreshortened toward the viewer, set in a rock socket, its
            // maw pouring the molten flow straight down — NOT a front-on portrait.
            // The head's own lava column merges into the in-engine flank flow.
            const carveHead = (site: [number, number], sc: number, flip: boolean) => {
              const rx = Math.round(site[0]), ry2 = Math.round(site[1])
              const lift = liftOf(eLvl(rx, ry2))
              const bx2 = isoX(site[0], site[1]), byBase = isoY(site[0], site[1]) + GY - lift + 10
              const zB = (rx + ry2) * 4000 + lift * 2 + 760
              // a DEEP carved socket: a broad AO pool the head sits in + a tighter,
              // darker core hugging the muzzle, so the head reads recessed INTO the
              // flank (Ash: carved OUT of the mountain, not a pasted medallion)
              const shOuter = new Sprite(shadTex)
              shOuter.anchor.set(0.5, 0.5)
              shOuter.width = spoutT.width * sc * 1.12; shOuter.height = spoutT.width * sc * 0.4; shOuter.alpha = 0.34
              shOuter.tint = 0x2a140a
              shOuter.position.set(bx2, byBase - spoutT.height * sc * 0.46); shOuter.zIndex = zB - 3
              world.addChild(shOuter)
              const sh = new Sprite(shadTex)
              sh.anchor.set(0.5, 0.5)
              sh.width = spoutT.width * sc * 0.84; sh.height = spoutT.width * sc * 0.28; sh.alpha = 0.5
              sh.position.set(bx2, byBase - spoutT.height * sc * 0.42); sh.zIndex = zB - 2
              world.addChild(sh)
              const sp = new Sprite(spoutT); sp.anchor.set(0.5, 0.86)   // the lava-column base at the site
              sp.position.set(bx2, byBase)
              sp.scale.set((flip ? -1 : 1) * sc, sc)
              sp.zIndex = zB
              world.addChild(sp)
              // the maw breathes molten (the mouth sits ~0.58 down the sprite)
              const g = new Sprite(foamTex); g.anchor.set(0.5, 0.5); g.blendMode = 'add'
              g.tint = 0xff7a28
              g.width = spoutT.width * sc * 0.34; g.height = spoutT.width * sc * 0.26
              g.position.set(bx2, byBase - spoutT.height * sc * 0.28)
              g.alpha = 0.4; g.zIndex = zB + 4
              world.addChild(g)
              glows.push({ sp: g, ph: 2.4, a: 0.42 })
            }
            // both flanks wear a carved head (GAME-DESIGN §3.2: two lava-spewing
            // heads). SE faces down-right; SW flipped to face down-left.
            carveHead(HEAD_R, 1.32, false)
            carveHead(HEAD_L, 1.26, true)
          } catch { /* carved heads optional until the art lands */ }
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
          // the canopy breathes: gentle per-plant rotation about the rooted base
          for (const s of sways) s.sp.rotation = s.amp * Math.sin(t * s.w + s.ph)
          // moored boats ride the basin's slow swell
          for (const b of bobs) b.sp.y = b.y0 + Math.sin(t * b.w + b.ph) * 2.2
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
