import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Texture } from 'pixi.js'
import {
  isoX, isoY, hash, vnoise, shadeHex, rampAt, tintFor,
  loadWaterVariants, seaTile, animSwells, type SwellSprite,
} from '../ocean'
import { CX, CY, coastDs, coastR, shelfW, lagoonK, cliffK, setSkeleton, CHANNEL } from './terrain'

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
          try { const t: Texture = await Assets.load(`/art/island/flat/grass-${i}.png`); t.source.scaleMode = 'nearest'; flatG.push(t) } catch { /* */ }
          try { const t: Texture = await Assets.load(`/art/island/flat/sand-${i}.png`); t.source.scaleMode = 'nearest'; flatS.push(t) } catch { /* */ }
        }
        for (let i = 2; i <= 5; i++) {
          try { const t: Texture = await Assets.load(`/art/island/blocks3/rock-${i}.png`); t.source.scaleMode = 'nearest'; rockW.push(t) } catch { /* */ }
        }
        const gt = flatG.length ? flatG : grassV.filter(Boolean)
        const st = flatS.length ? flatS : sandV.filter(Boolean)
        // DISCRETE 3D iso TILES (Ash's locked spec — NOT smooth hillshade): each land tile
        // sits at a discrete elevation LEVEL, its flat top blends into the surface, and its
        // real 3D comes from DECORATED SIDE FACES on the downhill edges. Beach sand lives ONLY
        // in the designed BAYS (never bleeding inside the cliff coasts).
        // WIDE beaches on the non-cliff coasts (bon3), the flat sea-level sand shelf; the
        // cliff coasts (screen N + W) meet the water as raised banded rock, never sand.
        const isSandT = (tx: number, ty: number) => {
          if (coastDs(tx, ty) <= 0 || coastDs(tx, ty) > 14) return false
          return cliffMask(thJit(tx, ty)) < 0.35 && elevF(tx, ty) < 0.09
        }
        // the LEVEL GRID: computed once, then cleaned — a lone tile whose level matches no
        // neighbour snaps to the level most of them share. Wandering contours kept flipping
        // single tiles, and every orphan wore a rock face: debris floating on a flat field.
        const LV = new Int8Array(COLS * ROWS)
        for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
          LV[ty * COLS + tx] = coastDs(tx, ty) <= 0 ? -1 : (isSandT(tx, ty) ? 0 : levelAt(tx, ty))
        }
        for (let pass = 0; pass < 2; pass++) {
          const prev = Int8Array.from(LV)
          for (let ty = 1; ty < ROWS - 1; ty++) for (let tx = 1; tx < COLS - 1; tx++) {
            const L = prev[ty * COLS + tx]
            if (L < 0) continue
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

        // LAND↔SEA LATTICE ALIGNMENT: seaTile anchors its soft 64x64 water sprites at
        // (0.5, 0.25), which puts the water diamond's centre ~14px BELOW isoY; the flat land
        // tops anchor centred. Without this drop the whole landmass floated above the sea
        // lattice and every camera-facing shoreline edge exposed a background wedge (the
        // "gap between ocean and sand"), and cliff feet hovered above their own waterline.
        const GY = Number(params.get('gy') || 14)

        // a foam collar at a wall's waterline foot — drawn ABOVE the fronting sea tile (which
        // submerges the wall base); at wall-z the sea drew over it and the join showed as notches
        const foamCollar = (fx: number, fy: number, zBase: number, frontSum: number) => {
          const foam = new Sprite(foamTex); foam.anchor.set(0.5, 0.5)
          foam.width = 58; foam.height = 20; foam.alpha = 0.75
          foam.position.set(fx, fy)
          foam.zIndex = Math.max(zBase, frontSum * 4000) + 62
          world.addChild(foam)
        }

        const waterS: SwellSprite[] = []
        for (let ty = 0; ty < ROWS; ty++) {
          for (let tx = 0; tx < COLS; tx++) {
            const dx = tx - CX, dy = ty - CY
            if (dx * dx + dy * dy > SEA_R * SEA_R) continue
            const dsq = dsAt(tx, ty)
            if (dsq <= 0) { seaTile(world, tx, ty, dsq, waterV, undefined, waterS); continue }
            const L = eLvl(tx, ty)                          // beaches = 0 → flush, no gap
            const sand = L === 0 && isSandT(tx, ty)         // grid-cleaned: a snapped tile keeps its new level's coat
            const lift = L * STEP
            const bx = isoX(tx, ty), by = isoY(tx, ty) - lift + GY
            const zBase = (tx + ty) * 4000 + lift * 8


            // DECORATED SIDE FACES on the two downhill front edges (SE, SW) — the tile's real
            // 3D face, sized to the discrete drop. Sea = banded rock strata (variety per tile);
            // inland step = a grassy-soil bank (the grass block's own dirt side). Never bricks.
            for (const [ox, oy] of [[1, 0], [0, 1]] as [number, number][]) {
              const nlv = eLvl(tx + ox, ty + oy)
              const floorL = nlv < 0 ? 0 : nlv              // the sea is the floor at the coast
              if (L <= floorL) continue
              const drop = (L - floorL) * STEP
              const toSea = nlv < 0
              const ex = isoX(tx + ox * 0.5, ty + oy * 0.5), ey = isoY(tx + ox * 0.5, ty + oy * 0.5) - lift + GY
              const fv = ox === 1 ? 0.74 : 0.96             // SE face shadowed, SW sunlit (sun UL)
              let seg: Sprite
              if (!rockW.length) continue
              // ALL sides are ROCK (Ash: a cliff feel, not green grass) — but RUN-COHERENT:
              // a wall line keeps ONE stratum with a slow value drift along it, so a tall
              // cliff reads as one banded rock face stepping along the coast (c3), not a
              // curtain of mismatched shingles. SE faces run along constant tx; SW along ty.
              const runKey = ox === 1 ? tx : ty
              const runPos = ox === 1 ? ty : tx
              const vi = Math.floor(hash(runKey * 3.7 + ox * 5, 13.1) * 997)
              const drift = 0.95 + 0.1 * vnoise(runPos / 5.5 + runKey * 2.2, 7.7)
              const rk = rockW[vi % rockW.length]
              // the face is drawn from 9px above the edge MIDPOINT (the edge's upper-corner
              // height) and extended past the drop: a horizontal-topped rect on a sloped
              // diamond edge otherwise leaves bare triangles at both ends. The tile's own
              // top (drawn later) masks the overshoot above the edge; the fronting tile
              // masks the overshoot below. TALL drops STACK band segments instead of
              // stretching one crop — a 37px crop pulled to 80px smeared the strata into
              // the "weird 2D image" read.
              // CROP TRUTH: the block textures are FULL iso blocks — the mossy top diamond
              // owns y 0-34, the true rock SIDE FACES live at y 35-56. The old crops started
              // at y~15, so every wall's upper half was the block's green TOP stretched down
              // the cliff: Ash's "weird image on top" breaking the 3D. Each face now crops its
              // own side of the face zone (the block's built-in directional shading).
              const totalH = drop + (toSea ? 21 : 23)
              const nSeg = Math.max(1, Math.ceil(totalH / 26))
              const vv = Math.round(fv * drift * 255)
              const segTint = toSea
                ? (Math.round(vv * 0.82) << 16) | (Math.round(vv * 0.82) << 8) | Math.round(vv * 0.92)
                : (Math.round(vv * 1.0) << 16) | (Math.round(vv * 0.88) << 8) | Math.round(vv * 0.70)
              const faceFrame = ox === 1 ? new Rectangle(33, 35, 28, 20) : new Rectangle(3, 35, 28, 20)
              for (let si = 0; si < nSeg; si++) {
                seg = new Sprite(new Texture({ source: rk.source, frame: faceFrame }))
                seg.anchor.set(0.5, 0)
                seg.width = toSea ? 54 : 48
                seg.height = totalH / nSeg + (si < nSeg - 1 ? 1 : 0)   // 1px overlap between bands
                seg.position.set(ex, ey - 9 + si * (totalH / nSeg))
                // each lower band a whisper darker — strata depth without visible banding
                seg.tint = si === 0 ? segTint : shadeHex(segTint, 1 - 0.035 * si)
                seg.zIndex = zBase + 1
                world.addChild(seg)
              }
              if (toSea) {                                  // a foam collar hugging the cliff foot
                foamCollar(ex, ey + drop + 2, zBase, tx + ox + ty + oy)
              }
            }

            // CORNER IN-FILL: when the drop happens only DIAGONALLY (the SE+SW neighbours hold
            // the level but the front corner tile sits lower), neither edge draws a wall and the
            // gap showed the abyss as a dark parallelogram. A narrow rock sliver plugs the corner.
            {
              const dlv = eLvl(tx + 1, ty + 1)
              const dFloor = dlv < 0 ? 0 : dlv
              if (L > dFloor && eLvl(tx + 1, ty) >= L && eLvl(tx, ty + 1) >= L && rockW.length) {
                const drop = (L - dFloor) * STEP
                const toSea = dlv < 0
                const cxp = isoX(tx + 0.5, ty + 0.5), cyp = isoY(tx + 0.5, ty + 0.5) - lift + GY
                // matches the SE face run it sits between, so the plug continues the wall
                const vi = Math.floor(hash(tx * 3.7 + 5, 13.1) * 997)
                const rk = rockW[vi % rockW.length]
                const totalH = drop + (toSea ? 12 : 14)
                const nSeg = Math.max(1, Math.ceil(totalH / 40))
                const vv = Math.round(0.8 * (0.94 + 0.12 * ((vi % 5) / 5)) * 255)
                const plugTint = toSea
                  ? (Math.round(vv * 0.82) << 16) | (Math.round(vv * 0.82) << 8) | Math.round(vv * 0.92)
                  : (Math.round(vv * 1.0) << 16) | (Math.round(vv * 0.88) << 8) | Math.round(vv * 0.70)
                for (let si = 0; si < nSeg; si++) {
                  // the SIDE-FACE zone of the block (y 35+), never the green top
                  const seg = new Sprite(new Texture({ source: rk.source, frame: new Rectangle(19, 35, 26, 20) }))
                  seg.anchor.set(0.5, 0)
                  seg.width = 30
                  seg.height = totalH / nSeg + (si < nSeg - 1 ? 1 : 0)
                  seg.position.set(cxp, cyp + si * (totalH / nSeg))
                  seg.tint = si === 0 ? plugTint : shadeHex(plugTint, 1 - 0.035 * si)
                  seg.zIndex = zBase + 1
                  world.addChild(seg)
                }
                if (toSea) foamCollar(cxp, cyp + drop + 2, zBase, tx + ty + 2)
              }
            }

            // TOP: one flat blended diamond (old-map recipe: narrow ramp + low-freq patch),
            // ~1.14 overlap so neighbours melt together. NO hillshade — the decorated SIDE
            // faces carry the 3D, and the flat tops stay a seamless surface like the old map.
            const pool = sand ? st : gt
            const g = pool.length ? pool[Math.floor(hash(tx * 5.1 + 2, ty * 2.9 + 4) * pool.length) % pool.length] : undefined
            if (g) {
              // both families at 1.14: sand ran 1.08 and its AA mask edges let the abyss bleed
              // through between neighbours as navy dash seams
              const top = new Sprite(g); top.anchor.set(0.5, 18 / 36); top.scale.set(1.14)
              top.position.set(bx, by); top.zIndex = zBase + 5
              const grain = 0.995 + 0.01 * hash(tx * 1.3, ty * 2.1)
              // per-tile jitter on the rake input: shallow smooth gradients otherwise quantize
              // into clean equal-tint contour lines (the "zigzag across the island")
              const rk = rakeAt(tx, ty) + (hash(tx * 2.7, ty * 3.9) - 0.5) * 0.1
              if (sand) {
                const tt = Math.min(1, dsq / 5)
                const v = (0.965 + 0.06 * vnoise(tx / 16 + 3, ty / 16 + 5)) * grain * (1 + 0.1 * rk)
                top.tint = warmCool(shadeHex(tintFor(rampAt(SAND_RAMP, tt), SAND_BASE), v), rk * 0.7)
              } else {
                // the plateau's ground mosaic: a LARGE meadow↔deep-green zone field (24-tile
                // landform scale — per-tile tint noise is the banned "poop") over the mid-scale
                // patchwork, so the flat top reads as dry sunlit meadows drifting into richer
                // green swaths instead of one olive slab
                const zone = vnoise(tx / 24 + 9, ty / 24 + 17)
                const patch = 0.96 + 0.08 * vnoise(tx / 14 + 2, ty / 14 + 6)
                // gentler zone swing + a per-tile dither so the drift never prints contour lines
                const tval = Math.max(0, Math.min(1,
                  0.1 + 0.3 * vnoise(tx / 13 + 2, ty / 13 + 6) + 0.42 * zone + (hash(tx * 7.3, ty * 9.1) - 0.5) * 0.06))
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
                const drop = (L - floorB) * STEP + (toSea ? 6 : 3)
                // run-coherent like the front faces (NW fills run along ty, NE along tx)
                const rk = rockW[Math.floor(hash((ox === -1 ? ty : tx) * 3.7 - 5, 13.1) * rockW.length) % rockW.length]
                // SOLID ROCK, same construction as the front faces — one material everywhere.
                // (Water-tinted fills flashed as mint bars between the dark walls, and a basalt
                // lip strip dotted an outline around the whole island. With the crop bug fixed,
                // plain rock is what reads as a real 3D block side.) Darker than the front
                // faces: this is the step's shadowed inner wall.
                const bvv = Math.round((toSea ? 0.6 : 0.52) * (0.92 + 0.16 * hash(tx * 1.9 + ox, ty * 2.7 + oy)) * 255)
                const backTint = toSea
                  ? (Math.round(bvv * 0.82) << 16) | (Math.round(bvv * 0.82) << 8) | Math.round(bvv * 0.95)
                  : (bvv << 16) | (Math.round(bvv * 0.88) << 8) | Math.round(bvv * 0.76)
                const backFrame = ox === -1 ? new Rectangle(33, 35, 28, 20) : new Rectangle(3, 35, 28, 20)
                // the void is a PARALLELOGRAM with vertical sides — covered as two stepped
                // half-edge segments (the pixel staircase), tucked up under the overlapping
                // tops, each stacking strata bands like the front faces (never one long stretch)
                const P0x = ox === -1 ? -32 : 32              // the low corner (left / right)
                const bH = drop + 5
                const nB = Math.max(1, Math.ceil(bH / 26))
                for (let s = 0; s < 2; s++) {
                  const cxs = bx + P0x * (0.75 - 0.5 * s)     // segment centre x (quarter points)
                  const cys = by - 18 * (0.25 + 0.5 * s) - 5  // edge height there, tucked up under the top
                  for (let si = 0; si < nB; si++) {
                    const fill = new Sprite(new Texture({ source: rk.source, frame: backFrame }))
                    fill.anchor.set(0.5, 0)
                    fill.width = 18; fill.height = bH / nB + (si < nB - 1 ? 1 : 0)
                    fill.position.set(cxs, cys + si * (bH / nB))
                    fill.tint = si === 0 ? backTint : shadeHex(backTint, 1 - 0.04 * si)
                    fill.zIndex = zBase + 2
                    world.addChild(fill)
                  }
                }
              }
              // and the BACK-DIAGONAL corner: higher than the tile behind the top corner while
              // both direct back neighbours hold level — the void mirror of the front corner
              const bdl = eLvl(tx - 1, ty - 1)
              const bdF = bdl < 0 ? 0 : bdl
              if (L > bdF && eLvl(tx - 1, ty) >= L && eLvl(tx, ty - 1) >= L) {
                const drop = (L - bdF) * STEP + (bdl < 0 ? 6 : 3)
                const rk = rockW[Math.floor(hash(tx * 5.9 + 4, ty * 6.1 + 2) * rockW.length) % rockW.length]
                const fill = new Sprite(new Texture({ source: rk.source, frame: new Rectangle(18, 14, 28, 38) }))
                fill.anchor.set(0.5, 0)
                fill.width = 26; fill.height = drop
                fill.position.set(isoX(tx - 0.5, ty - 0.5), isoY(tx - 0.5, ty - 0.5) - lift + GY + 1)
                const vv = 62 + Math.floor(20 * hash(tx * 2.9, ty * 3.7))
                fill.tint = (vv << 16) | (Math.round(vv * 0.88) << 8) | Math.round(vv * 0.8)
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
