import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Texture } from 'pixi.js'
import {
  isoX, isoY, hash, vnoise, shadeHex, rampAt, tintFor,
  loadWaterVariants, seaTile, animSwells, type SwellSprite,
} from '../ocean'
import { CX, CY, coastDs, coastR, shelfW, lagoonK, cliffK, setSkeleton, CHANNEL } from './terrain'
import { coneLvl, coneBand, gullyK } from './volcano'

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
const SEA_R = 86 // live sea builds inside this radius; beyond it the far field has
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
const GRASS_RAMP: [number, number][] = [[0, 0xaec06a], [0.5, 0x91ae56], [1, 0x6d8d40]]

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
      grade.brightness(1.02, false); grade.saturate(0.13, true); grade.contrast(0.05, true)
      const wm = grade.matrix; wm[0] *= 1.13; wm[6] *= 1.02; wm[12] *= 0.8; grade.matrix = wm
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
          try { const t: Texture = await Assets.load(`/art/island/flat/grass-${i}.png?v=4`); t.source.scaleMode = 'nearest'; flatG.push(t) } catch { /* */ }
          try { const t: Texture = await Assets.load(`/art/island/flat/sand-${i}.png?v=4`); t.source.scaleMode = 'nearest'; flatS.push(t) } catch { /* */ }
        }
        // the WARM blocks: rock-N's carved sides remapped onto c3's sunlit terracotta ramp
        // (the original maroon sat at 0.35-0.5 luminance — the golden grade crushed it to
        // the near-black dashes; a multiply tint can only darken, so brightness must live
        // in the ASSET). Moss tops untouched (they peek 2px past the flat top: a grass lip).
        const sideW: Texture[] = []                           // mossless: lower courses + wet feet
        const volcW: Texture[] = []                           // the volcano's basalt courses
        const volcT: Texture[] = []                           // bare basalt flat tops (upper cone)
        for (let i = 2; i <= 5; i++) {
          try { const t: Texture = await Assets.load(`/art/island/blocks3/rock-${i}-warm.png`); t.source.scaleMode = 'nearest'; rockW.push(t) } catch { /* */ }
          try { const t: Texture = await Assets.load(`/art/island/blocks3/rock-${i}-side.png`); t.source.scaleMode = 'nearest'; sideW.push(t) } catch { /* */ }
          try { const t: Texture = await Assets.load(`/art/island/blocks3/volc-${i}-side.png`); t.source.scaleMode = 'nearest'; volcW.push(t) } catch { /* */ }
        }
        for (let i = 0; i < 16; i++) {
          try { const t: Texture = await Assets.load(`/art/island/flat/volc-${i}.png`); t.source.scaleMode = 'nearest'; volcT.push(t) } catch { /* */ }
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
          return base >= PLAT_L ? base + coneLvl(tx, ty) : base
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
          // rock variant in smooth ZONES (2-4 tile runs share a block) — per-tile random
          // picks flickered into patchwork on turning coasts, one lone rock read flat.
          // Each course shifts the zone seed so tall stacks don't repeat one texture.
          const fam = volc && volcW.length ? volcW : sideW
          const pick = (k: number) => Math.floor(vnoise(tx2 / 2.7 + 1.3 + k * 0.9, ty2 / 2.7 + 8.1 + k * 1.7) * rockW.length) % rockW.length
          // a submerged echo of the bottom course first: the cliff foot runs 12px under the
          // waterline so the diagonal bottom silhouette never opens a notch above the sea
          if (toSea && sideW.length) {
            const wet = new Sprite(sideW[pick(m)])
            wet.anchor.set(0.5, 18 / 64)
            wet.position.set(bx2, by2 + (m - 1) * STEP + 12)
            wet.tint = 0xb8a898
            if (DBG) wet.tint = 0x2020ff
            wet.zIndex = zBase2; world.addChild(wet)
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
            // the cone's radial ribbing on the WALLS: gully columns darken, ridge
            // columns stay lit — vertical streaks fanning from the summit (c3's ribs)
            if (volc) drift *= 1 - 0.18 * gullyK(tx2, ty2)
            const vv = Math.min(255, Math.round(drift * 255))
            seg.tint = (vv << 16) | (vv << 8) | vv
            if (DBG) seg.tint = 0xff2020
            seg.zIndex = zBase2 + 1 + (m - 1 - k)
            world.addChild(seg)
          }
        }

        const waterS: SwellSprite[] = []
        for (let ty = 0; ty < ROWS; ty++) {
          for (let tx = 0; tx < COLS; tx++) {
            const dx = tx - CX, dy = ty - CY
            if (dx * dx + dy * dy > SEA_R * SEA_R) continue
            const dsq = dsAt(tx, ty)
            if (dsq <= 0) { seaTile(world, tx, ty, dsq, waterV, undefined, waterS); continue }
            const L = eLvl(tx, ty)                          // beaches = 0 → flush, no gap
            // sea-level land on a beach azimuth wears sand; on mixed azimuths it stays grass
            const sand = L === 0 && cliffMask(Math.atan2(ty - CY, tx - CX)) < 0.35
            const lift = L * STEP
            const bx = isoX(tx, ty), by = isoY(tx, ty) - lift + GY
            // lift*8 overflowed the 4000 row separation once the cone stacked past L~15
            // (a summit tile out-sorted the row in front of it); *4 keeps the tallest
            // summit (L~18 -> 2304) safely inside its own row band
            const zBase = (tx + ty) * 4000 + lift * 4


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
                drawColumn(bx, by, L - floorMin, toSea, tx, ty, zBase, L > PLAT_L)
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
            const pool = sand ? st : band === 2 && volcT.length ? volcT : gt
            const g = pool.length ? pool[Math.floor(hash(tx * 5.1 + 2, ty * 2.9 + 4) * pool.length) % pool.length] : undefined
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
              } else if (band === 2) {
                // bare basalt: neutral value drift + the radial GULLY streaks (ridges
                // catch the light, gullies sink) — the c3 ribbing at map zoom
                const hFrac = Math.min(1, (L - PLAT_L) / 14)
                const v = (0.92 + 0.1 * vnoise(tx / 5 + 4, ty / 5 + 12)) * (1 + 0.12 * rk) * (1 - 0.18 * hFrac) * (1 - 0.22 * gullyK(tx, ty))
                top.tint = warmCool(shadeHex(0xffffff, v), rk * 0.8)
              } else if (band === 1) {
                // dry scrub: the grass art pushed warm/parched — the transition belt
                const patch = 0.98 + 0.05 * vnoise(tx / 9 + 5, ty / 9 + 2)
                const lit = patch * grain * (1 + 0.12 * rk) * (1 - 0.14 * gullyK(tx, ty))
                top.tint = warmCool(tintFor(shadeHex(0xb99e58, lit), GRASS_BASE), rk * 0.9)
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
                const lit = patch * grain * (1 + 0.13 * rk) * (1.03 - 0.07 * zone)
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

            // BACK-EDGE SHADOW FILL: a tile higher than its back (screen NE/NW) neighbour leaves
            // an occlusion void in its own footprint — the lifted top moves up, the wall faces
            // away, and the neighbour only covers its own diamond, so the abyss showed through
            // as dark teal slots. A near-black rock fill spanning the exact drop plugs the void
            // and reads as the terrace's shaded back wall — the c3 cliff-top line on sea rims.
            if (L > 0 && rockW.length && !params.get('nofills')) {
              for (const [ox, oy] of [[-1, 0], [0, -1]] as [number, number][]) {
                const nb = eLvl(tx + ox, ty + oy)
                const floorB = nb < 0 ? 0 : nb
                if (L <= floorB) continue                     // back neighbour level or higher
                const toSea = nb < 0
                // GEOMETRY TRUTH: a back edge faces AWAY from the camera — its wall is never
                // visible. Over the SEA the correct picture is grass edge → water behind and
                // below, marked only by a THIN rock lip under the rim (c3's plateau-edge
                // line). INLAND steps still need the full-drop fill (the terrace behind sits
                // higher on screen and leaves an occlusion void). Same c3-warm material as
                // the faces, only modestly darker — the step's shadowed inner wall.
                const bH = toSea ? 8 : (L - floorB) * STEP + 8
                // occlusion SHADOW, not lit material — the step's shaded inner wall (c3's
                // dark plateau-rim line). A band crop off the warm block keeps the texture.
                // soft, not black: at 0.58 the grade turned every step crease into a hard
                // near-black outline (part of the cut-out read)
                const bv = toSea ? 0.74 : 0.7
                const P0x = ox === -1 ? -32 : 32              // the low corner (left / right)
                for (let s = 0; s < 2; s++) {
                  const cxs = bx + P0x * (0.75 - 0.5 * s)     // segment centre x (quarter points)
                  const cys = by - 18 * (0.25 + 0.5 * s) - 5  // edge height there, tucked up under the top
                  const fillRk = L > PLAT_L && volcW.length ? volcW[0] : rockW[0]
                  const fill = new Sprite(new Texture({ source: fillRk.source, frame: new Rectangle(20 + s * 12, 38, 24, 22) }))
                  fill.anchor.set(0.5, 0)
                  fill.width = 18; fill.height = bH
                  fill.position.set(cxs, cys)
                  const vv = Math.round(bv * 255)
                  fill.tint = (vv << 16) | (Math.round(vv * 0.92) << 8) | Math.round(vv * 0.86)
                  if (DBG) fill.tint = toSea ? 0x2040ff : 0x20e0ff // DBG: back fill sea blue / inland cyan
                  fill.zIndex = zBase + 2
                  world.addChild(fill)
                }
              }
              // and the BACK-DIAGONAL corner: higher than the tile behind the top corner while
              // both direct back neighbours hold level — the void mirror of the front corner.
              // Over the sea the same thin-lip rule: the corner faces away, rim only.
              const bdl = eLvl(tx - 1, ty - 1)
              const bdF = bdl < 0 ? 0 : bdl
              if (L > bdF && eLvl(tx - 1, ty) >= L && eLvl(tx, ty - 1) >= L) {
                const drop = bdl < 0 ? 8 : (L - bdF) * STEP + 3
                const nubRk = L > PLAT_L && volcW.length ? volcW[0] : rockW[0]
                const fill = new Sprite(new Texture({ source: nubRk.source, frame: new Rectangle(20, 38, 24, 22) }))
                fill.anchor.set(0.5, 0)
                fill.width = 26; fill.height = drop
                fill.position.set(isoX(tx - 0.5, ty - 0.5), isoY(tx - 0.5, ty - 0.5) - lift + GY + 1)
                const vv = Math.round(0.7 * 255)
                fill.tint = (vv << 16) | (Math.round(vv * 0.92) << 8) | Math.round(vv * 0.86)
                if (DBG) fill.tint = 0xff20ff                 // DBG: back-corner nub magenta
                fill.zIndex = zBase + 2
                world.addChild(fill)
              }
            }
          }
        }

        app.ticker.add(() => { animSwells(waterS, performance.now() / 1000, () => 0) })
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
      const warmMul = new Sprite(Texture.WHITE); warmMul.tint = 0xffd08a; warmMul.blendMode = 'multiply'; warmMul.alpha = 0.5; app.stage.addChild(warmMul)
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
