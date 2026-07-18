import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Matrix, Rectangle, RenderTexture, Sprite, Text, TextStyle, Texture, TilingSprite } from 'pixi.js'
import {
  isoX, isoY, hash, vnoise, shadeHex, rampAt, tintFor,
  loadWaterVariants, seaTile, configSeaTile, animSwells, type SwellSprite, HW, HH, DEPTH_RANGE,
} from '../ocean'
import { CX, CY, coastDs, coastR, shelfW, lagoonK, cliffK, setSkeleton, CHANNEL, lavaDist, LAVA, MOUTH_L, MOUTH_R } from './terrain'
import { coneLvl, coneBand, coneH, gullyK, craterK, coneLit, stripeK } from './volcano'
import { PLAZA, PLAZA_R, GROVES, HARBOR, harborAt, pathD, coveNotchK, vegK, clearingK, SHADOW, initHubLayout, crossingD, riverD, RIVER, FALLS, FORD, STELES, TONGUE, TIDEPOOLS, WEST_OVERLOOK } from './hub-layout'
import { DECK_TILES, DECK_SET, DECK_LIFT, DECK_OBJECTS, DECK_LAMPS, BLOCKED, BERTH_SHIP, MOOR_BOATS, deckKey } from './harbor-deck'
import { reportIslandAudit } from './island-audit'
import { headField, inHeadBBox } from './heads'

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
// P2 · THE CAST SHADOW FIELD (shared by meadow, sand, and the SEA — c3's shadow pool
// crosses the lagoon): a soft wedge thrown DOWN-SUN of the cone (sun az 2.85 → shadow
// az 2.85-π, screen SE), wandering edge, fading with distance. Pure (tx,ty).
const castShadowK = (tx: number, ty: number) => {
  const dxs = tx - CX, dys = ty - CY
  const dc = Math.hypot(dxs, dys)
  if (dc < 14 || dc > 68) return 0            // the cone's base owns its value; far sea clear
  const azT = Math.atan2(dys, dxs)
  const rel = azT - (2.85 - Math.PI)
  const dAz = Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel)))
    + (vnoise(tx / 7 + 41, ty / 7 + 8) - 0.5) * 0.16
  return smooth(0.52, 0.18, dAz) * smooth(64, 30, dc)
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
      // FRESH BASE (Ash, 2026-07-13) STANDS (re-confirmed 2026-07-16: flipping the
      // old decor set back on "botched the entire map with the old shit"). The OLD
      // dressing (steles, braziers, plaza, statue, paths, stair, river, ford,
      // tidepools, overlook) stays OFF behind ?decor=1 until the Places Campaign
      // rebuilds each zone properly. Only REBUILT work ships un-gated: the forest
      // (VEG), the harbor (HARBOR_ON), and the heads + their flows below.
      const DECOR = params.get('decor') === '1'
      // THE FOREST IS BACK (Ash, 2026-07-16: "bring back the old version... that forest
      // spread across the map was nice, just put it here"): the green pass — groves,
      // vegK field ranks, tufts/boulders/trunks — runs on the BASE now, un-gated from
      // DECOR by his direct call. ?veg=0 keeps a clean-capture switch.
      const VEG = params.get('veg') !== '0'
      const ZOOM = Number(params.get('zoom') || 0.62) || 0.62
      const cam = (params.get('cam') || `${CX},${CY}`).split(',').map(Number)
      // clamp the camera well inside WORLD_R (600): the ocean must reach past every
      // viewport edge — nobody ever sees the world's rim (the vast-sea law)
      const camTx = Math.max(CX - 420, Math.min(CX + 420, cam[0] ?? CX))
      const camTy = Math.max(CY - 420, Math.min(CY + 420, cam[1] ?? CY))
      // HEIGHT-TILE terrain: real per-tile elevation levels (→ faces, collision, depth)
      const NLEV = Number(params.get('nlev') || 5)   // discrete elevation levels (real tiles)
      const STEP = Number(params.get('step') || 20)  // world px per elevation level (taller = vaster cliffs)
      // hoisted for the walk system (defined inside the terrain block below)
      let eLvlG: (tx: number, ty: number) => number = () => 0
      let GYG = 14

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
      // the mechanical gate: reachability, lava continuity, grounding — checked as
      // DATA on the live layout every load (a red console line = the map is broken
      // no matter how good the screenshot looks). DECOR-gated: its flood-fill seeds
      // from the harbor deck, which the fresh base does not render.
      if (DECOR) reportIslandAudit()

      const world = new Container()
      world.scale.set(ZOOM)
      world.sortableChildren = true
      app.stage.addChild(world)
      // camera position set EARLY (resizeFx re-derives the same values later) so the
      // virtual sea can unproject the real viewport during the build, not after it
      world.x = app.screen.width / 2 - isoX(camTx, camTy) * ZOOM
      world.y = app.screen.height * 0.5 - isoY(camTx, camTy) * ZOOM
      // the grade filter must never measure 30k+ sprite bounds to size its framebuffer.
      // v8 semantics: filterArea is LOCAL space (feeding it the screen rect clips the
      // world to a phantom rectangle at the origin — found live, P0). boundsArea is the
      // v8 tool: declare the world's local extent once, bounds become O(1).
      world.boundsArea = new Rectangle(-40000, -18000, 80000, 46000)

      // ---- P0: THE VAST SEA + BAND PARTITION (the world becomes huge) ----
      // Two structures. (1) seaLayer: the open ocean is VIRTUAL — any point with
      // dsAt<0 is water all the way out to WORLD_R; a sprite pool draws only the
      // viewport's sea (block-LOD at far zooms) and re-points as the view changes.
      // (2) bands: every land sprite already encodes painter depth as
      // zIndex = (tx+ty)*4000 + eps, so after the build the flat sprite soup is
      // regrouped — SAME total draw order — into diagonal-band containers the
      // ticker culls against the viewport. Sky sprites (steam/clouds/gulls >= 3M)
      // and the coords scaffold stay directly on world, above every band.
      const WORLD_R = 600           // tiles of ocean in every direction — mostly-sea by law
      const BANDW = 4               // tile-diagonals per culling band
      const seaLayer = new Container()
      seaLayer.zIndex = -1
      seaLayer.sortableChildren = true
      // its OWN render group: v8 caches draw instructions PER GROUP, and by default the
      // whole stage is one group — so one animated tint anywhere re-recorded all 6k+
      // static sea sprites every frame (measured 23fps at far zoom). Isolated, the
      // static field records once and replays from cache.
      seaLayer.isRenderGroup = true
      world.addChild(seaLayer)
      const bands: (Container | undefined)[] = []
      const bandFor = (z: number) => {
        const b = Math.max(0, Math.floor(z / (BANDW * 4000)))
        let c = bands[b]
        if (!c) {
          c = new Container()
          c.sortableChildren = true
          c.zIndex = b * BANDW * 4000
          c.isRenderGroup = true   // static band content: record once, replay from cache
          bands[b] = c
          world.addChild(c)
        }
        return c
      }
      let refreshSea: () => void = () => {}   // assigned inside the tile build; resize re-fills the pool
      // dev handle for the perf probe: pump app.ticker.update() in a loop to measure
      // real frame cost — the Glance browser throttles rAF to ~1Hz when occluded, so
      // wall-clock FPS lies (the documented lesson)
      ;(window as unknown as Record<string, unknown>).__app = app
      // dev probe: name every sprite under a screen point (the only honest way
      // to identify a mystery pixel — hypothesis-chasing burned an hour tonight)
      ;(window as unknown as Record<string, unknown>).__probe = (sx2: number, sy2: number) => {
        const hits: string[] = []
        for (const c of world.children) {
          const s = c as Sprite
          if (!s.getBounds) continue
          const b = s.getBounds()
          if (sx2 >= b.x && sx2 <= b.x + b.width && sy2 >= b.y && sy2 <= b.y + b.height) {
            const src = (s.texture?.source as unknown as { label?: string })?.label ?? 'canvas'
            hits.push(`${src} z=${s.zIndex} w=${Math.round(s.width)} h=${Math.round(s.height)} tint=${s.tint?.toString(16)}`)
          }
        }
        return hits.slice(-14)
      }

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
          // sand-8..11 carry baked-in driftwood logs / pebble clusters — hash-
          // scattered over every beach they read as random litter (Ash 2026-07-16:
          // "remove all the logs"). The beach wears only the clean ripple variants.
          if (i >= 8 && i <= 11) continue
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
        // P3 SKIN: the carved heads' own block family (Ash-picked C primary + A variant,
        // monument-graded dark basalt) — tops and faces crop from THE SAME blocks, so
        // the monument is literally one material (P1's law on the head itself)
        const headW: Texture[] = []
        for (let i = 0; i < 2; i++) {
          try { const t: Texture = await Assets.load(`/art/island/heads/block-${i}.png`); t.source.scaleMode = 'nearest'; headW.push(t) } catch { /* */ }
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
        // THE MOLTEN STRIP: a seamless scrolling texture built from the river's
        // OWN lava2 tile pixels (fully-opaque center crops, torus-stamped so the
        // wrap is seamless BY CONSTRUCTION — every stamp crossing an edge repeats
        // on the far side). The maw cascades and the river veins both scroll this,
        // so the pour and the river are literally one material in motion. Painted
        // pixels; code only composites/masks/animates (the no-shader law).
        const moltenStrip = (W: number, H: number): Texture | null => {
          if (!lavaT.length) return null
          const cv = document.createElement('canvas')
          cv.width = W; cv.height = H
          const g3 = cv.getContext('2d')!
          const n = Math.ceil(((W * H) / (32 * 16)) * 2.4)
          for (let i = 0; i < n; i++) {
            const t = lavaT[Math.floor(hash(i * 3.7 + W, i * 1.9 + H) * lavaT.length * 0.999)]
            const src = t.source.resource as CanvasImageSource
            const dx = Math.floor(hash(i * 2.3, i * 5.1 + W) * W) - 16
            const dy = Math.floor(hash(i * 7.7 + H, i * 1.3) * H) - 8
            for (const [ox, oy] of [[0, 0], [W, 0], [-W, 0], [0, H], [0, -H], [W, H], [-W, -H], [W, -H], [-W, H]])
              g3.drawImage(src, 16, 10, 32, 16, dx + ox, dy + oy, 32, 16)
          }
          const t2 = Texture.from(cv)
          t2.source.scaleMode = 'nearest'
          t2.source.addressMode = 'repeat'
          return t2
        }
        const stripV = moltenStrip(64, 128)   // the maw cascades (scrolls down)
        const stripH = moltenStrip(128, 40)   // the river veins (scrolls downstream)
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
        // FINGER KILLER (the last speckle class): every pass above works on LONE
        // tiles, so a 2-wide bench PENINSULA jutting through the flat beach strip
        // survives them all — and prints as a run of orphan riser slabs lying on
        // open grass (probe-proven at tile 87,65 on the north shore; the west-cove
        // "sand potholes" are the same disease inverted). A tile ringed by 5+ of
        // its 8 land neighbours on ONE side of its level, with at most 1 on the
        // other, is part of a thin finger/trench, not a terrace edge (a real bench
        // lip has higher ground behind it): pull it to the near side. 3 passes eat
        // a finger from the tip and flanks inward.
        for (let pass = 0; pass < 3; pass++) {
          const prev = Int8Array.from(LV)
          for (let ty = 1; ty < ROWS - 1; ty++) for (let tx = 1; tx < COLS - 1; tx++) {
            const L = prev[ty * COLS + tx]
            if (L < 0 || L > PLAT_L) continue
            let lowN = 0, hiN = 0, lowBest = -9, hiBest = 99
            for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
              if (!ox && !oy) continue
              const v = prev[(ty + oy) * COLS + tx + ox]
              if (v < 0) continue
              if (v < L) { lowN++; if (v > lowBest) lowBest = v }
              else if (v > L) { hiN++; if (v < hiBest) hiBest = v }
            }
            if (lowN >= 5 && hiN <= 1 && lowBest >= 0) LV[ty * COLS + tx] = lowBest
            else if (hiN >= 5 && lowN <= 1) LV[ty * COLS + tx] = Math.min(hiBest, PLAT_L)
          }
        }
        // THE PLAZA IS A DESIGNED BENCH: the meadow's natural steps ran straight
        // through the court, so the level-clamped flagstone disc shrank to a
        // fragment and the rim braziers stood on four different terraces — the
        // Opus review's "fire bowls sprinkled on a hillside, no floor". A real
        // courtyard is CUT INTO the hill: one flat level for the whole disc plus
        // a working apron for the brazier ring.
        {
          const pcx = Math.round(PLAZA[0]), pcy = Math.round(PLAZA[1])
          const pl = LV[pcy * COLS + pcx]
          // the site sits on the cone TOE (the azimuth scan allows coneH<1.2),
          // so its levels run ABOVE PLAT_L — a PLAT_L guard here silently
          // skipped the whole cut and left the "fire bowls on a hillside".
          // Cut into the slope: everything up to 4 levels above the court
          // planes down to it; the taller toe beyond stands as the courtyard's
          // carved back wall (c3's own terrace language).
          if (DECOR && pl > 0) {
            for (let ty = pcy - 8; ty <= pcy + 8; ty++) for (let tx = pcx - 8; tx <= pcx + 8; tx++) {
              if (Math.hypot(tx - PLAZA[0], ty - PLAZA[1]) > PLAZA_R + 1.8) continue
              const L = LV[ty * COLS + tx]
              if (L > 0 && L >= pl - 2 && L <= pl + 4) LV[ty * COLS + tx] = pl
            }
          }
        }
        // P3 · THE CARVED HEADS MERGE (heads.ts — real structure, real levels, real
        // collision; NEVER a sprite). Rushmore construction: the alcove field REPLACES
        // the flank inside its soft mask (a recessed face-plane + sculpted features +
        // the maw cut), and the ears merge as plain additive peaks on the crest above.
        // Merged AFTER every cleanup pass: the forms are authored, no snap eats an ear.
        if (!NOCONE) {
          for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
            if (!inHeadBBox(tx, ty)) continue
            const k = ty * COLS + tx
            if (LV[k] < 0) continue
            const hf = headField(tx, ty)
            if (hf) {
              const rel = LV[k] - PLAT_L
              LV[k] = PLAT_L + Math.round(rel + (hf.h - rel) * Math.min(1, hf.k))
            }
          }
        }
        const eLvl = (tx: number, ty: number) =>
          tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS ? -1 : LV[ty * COLS + tx]
        eLvlG = eLvl
        if (DBG) (window as unknown as { __LV?: unknown }).__LV = { LV, COLS, ROWS }

        // LAND↔SEA LATTICE ALIGNMENT: seaTile anchors its soft 64x64 water sprites at
        // (0.5, 0.25), which puts the water diamond's centre ~14px BELOW isoY; the flat land
        // tops anchor centred. Without this drop the whole landmass floated above the sea
        // lattice and every camera-facing shoreline edge exposed a background wedge (the
        // "gap between ocean and sand"), and cliff feet hovered above their own waterline.
        const GY = Number(params.get('gy') || 14)
        GYG = GY

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
          // P2 · THE TERMINATOR IS THE MOUNTAIN'S VALUE STRUCTURE: base pulled down
          // (0.96 → 0.88) and the sun swing deepened (0.18 → 0.28) so the shade flank
          // falls into real maroon-violet mass while the lit flank keeps its amber —
          // bon3/c1's cones live in the dark third of the histogram; ours was one
          // bright terracotta sheet (s2 dark-mass 0.10 vs ref 0.69)
          let v = 0.88 + 0.28 * cl + (0.11 + 0.07 * (1 - warm)) * stripe - 0.12 * gy
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
        // the head skin's treads: the monument blocks' own top diamonds
        const headTop: Texture[] = headW.map((t) => new Texture({ source: t.source, frame: new Rectangle(0, 0, 64, 36) }))
        const drawFace = (bx2: number, by2: number, dropPx: number, tx2: number, ty2: number, zBase2: number, molten = false) => {
          const fam = sideL.length ? sideL : sideW.length ? sideW : vsF
          if (!fam.length || dropPx <= 0) return
          const need = 18 + dropPx + 8
          const tex = fam[Math.floor(vnoise((tx2 - ty2) / 4 + 6.3, (tx2 + ty2) / 16 + 2.9) * fam.length) % fam.length]
          const srcH = tex.height - 18
          const frameH = Math.min(srcH, need)
          // P2: the crop starts at row 26, not 18 — rows 18-26 carry the block-top
          // diamond's bright lower-rim bevel, and on the cone's 10px steps that rim
          // printed a bright crescent per tread (the shingle-band read at map zoom).
          // Full width keeps the art's own V-taper meshing under the tile top.
          const fr = new Texture({ source: tex.source, frame: new Rectangle(0, 26, 64, Math.min(tex.height - 26, frameH)) })
          const seg = new Sprite(fr); seg.anchor.set(0.5, 0)
          seg.position.set(bx2, by2)
          if (need > fr.frame.height) seg.scale.y = need / fr.frame.height
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
            // the BARE-ROCK upper flank (band 2) shows real strata faces (c3's exposed rock).
            // P3: a carved head's faces are always the monument's rock — its OWN blocks,
            // its OWN cool-dark value world (never the warm cone tint).
            const hk2 = inHeadBBox(tx2, ty2) ? headField(tx2, ty2)?.k ?? 0 : 0
            if (hk2 > 0.25 && headW.length) {
              const ht = headW[Math.floor(vnoise(tx2 / 3 + 5, ty2 / 3 + 11) * headW.length) % headW.length]
              const hh = Math.min(ht.height - 26, need)
              seg.texture = new Texture({ source: ht.source, frame: new Rectangle(0, 26, 64, hh) })
              seg.scale.x = 1
              if (need > hh) seg.scale.y = need / hh
              const v3 = (0.8 - 0.24 * hk2) * (1 + 0.08 * coneLit(tx2, ty2))
              seg.tint = tint24(v3 * 0.8, v3 * 0.77, v3 * 0.88)
              if (DBG) seg.tint = 0xff20ff
              seg.zIndex = zBase2 + 1
              world.addChild(seg)
              return
            }
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
                seg.scale.x = 1   // the grass crop is full-width; undo the strata stretch
                if (need > gh) seg.scale.y = need / gh
              }
              seg.tint = tint24(lo * 0.74, lo * 0.8, lo * 0.46)
            } else if (band === 1) {
              // merge belt: dry earthy-olive bank (grass meshing into rock, c3)
              // — pulled greener/darker: at 0.72/0.66 the scrub risers printed
              // terracotta dash clusters across the shallow west toe
              seg.tint = tint24(lo * 0.6, lo * 0.65, lo * 0.38)
            } else {
              // bare rock upper flank: real strata face, matches the tread value
              const k = dropPx >= CSTEP * 2 ? 0.97 : 0.88
              const [r, g, b] = coneTint(tx2, ty2)
              // the SAME sun/rib/gully language the block walls wear — the NW
              // face is built ENTIRELY of these strata segs (probe-proven), and
              // raw coneTint left it one naked red sheet at play zoom: warm-lit
              // west, violet shade east, rib stripes, darker gully columns
              const lit = coneLit(tx2, ty2)
              const stripe = stripeK(tx2, ty2)
              const warm = 0.5 + 0.5 * lit
              // P2: the long-run ribs carry more of the face — the quieted grain hands
              // the striation job to the tint field
              const mod = (1 + 0.22 * lit + (0.17 + 0.1 * (1 - warm)) * stripe) * (1 - 0.3 * gullyK(tx2, ty2))
              seg.tint = tint24(
                r * k * mod * (0.94 + 0.12 * warm),
                g * k * mod,
                b * Math.min(1, k + 0.03) * mod * (1.14 - 0.24 * warm))
            }
          }
          if (DBG) seg.tint = 0x20ffff
          seg.zIndex = zBase2 + 1
          world.addChild(seg)
        }

        // P1 · THE MELT RISER: a 1-level step that is NOT a designed edge draws this
        // instead of a wall — the tile's own ground texture carried down the drop, tinted
        // from THE TOP'S OWN COMPUTED TINT x a whisper of AO. One value field, no second
        // function, so no lip can flip value (the bright-top/dark-face flip on every
        // bench WAS the cube-read). Works for any top material by construction: meadow,
        // sand, bed-char, river, path — each melts in its own color.
        const meltRiser = (bx2: number, by2: number, dropPx: number, tx2: number, ty2: number, zBase2: number, topTint: number, sandy: boolean, ao = 0.9) => {
          if (dropPx <= 0) return
          const fam2 = sandy ? (flatS.length ? flatS : sandV.filter(Boolean)) : (flatG.length ? flatG : grassV.filter(Boolean))
          if (!fam2.length) return
          const need = 18 + dropPx + 8
          const g2 = fam2[Math.floor(vnoise(tx2 / 5 + 3, ty2 / 5 + 8) * fam2.length) % fam2.length]
          const gh = Math.min(g2.height - 6, need)
          // an OPAQUE underquad first: the grass/sand crop is a diamond with transparent
          // corners, and the fronting tiles' diamonds taper to zero at their shared
          // vertex — without a backing, the sea printed a teal pinprick at every melted
          // lip's foot (drawColumn's under-course used to plug exactly this). The plug
          // is cut from the tile texture's OPAQUE CENTER BAND — the top tints are
          // engineered to multiply against this family's own pixels (Texture.WHITE
          // rendered them cream: the tint is not the color, texture x tint is).
          const plug = new Sprite(new Texture({ source: g2.source, frame: new Rectangle(16, 10, 32, 16) }))
          plug.anchor.set(0.5, 0)
          plug.width = 64; plug.height = need
          plug.position.set(bx2, by2)
          plug.tint = shadeHex(topTint, ao)
          plug.zIndex = zBase2 + 1
          world.addChild(plug)
          const seg = new Sprite(new Texture({ source: g2.source, frame: new Rectangle(0, 6, Math.min(64, g2.width), gh) }))
          seg.anchor.set(0.5, 0)
          seg.position.set(bx2, by2)
          if (need > gh) seg.scale.y = need / gh
          // 0.9 default: a soft crease, not a wall — the slope reads through the large
          // value field (sun rake + zone drift), never through a per-lip contrast step.
          // Real terraces pass a deeper ao (~0.8): a visible shaded bank, still the
          // top's own turf — rock-block texture under green tint flashed warm grain
          // through and printed "scattered chips" (the documented probe-proven failure).
          seg.tint = shadeHex(topTint, ao)
          if (DBG) seg.tint = 0xff8800
          seg.zIndex = zBase2 + 2   // the grain strip rides its own plug
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
        const drawColumn = (bx2: number, by2: number, m: number, toSea: boolean, tx2: number, ty2: number, zBase2: number, volc = false, grassy = false, topTint?: number) => {
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
              // reads violet, not black-brown. Contrast raised across the board (0.16/
              // 0.09/0.16): at the old values the NW face read as one naked wall of
              // identical red cubes at play zoom (sweep-proven) — the ribs and gullies
              // have to carry the flank when no dressing does.
              drift *= (1 + 0.22 * lit + (0.14 + 0.09 * (1 - warm)) * stripe) * (1 - 0.28 * gullyK(tx2, ty2))
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
              // P1: the terrace bank derives from THE TOP'S OWN TINT x one AO factor
              // (~0.85) — the same field, one consistent form break, never a value flip.
              // (The old fixed 0.55-0.63 olive was ~40% darker than the sunlit top:
              // one dark line per level = the cube lattice.) Texture variance kept on
              // real drops so tall banks stay banks.
              const tex2 = 0.94 + 0.1 * vnoise(tx2 / 2.3 + 6, ty2 / 2.3 + k * 0.7 + 2)
              const v2 = tex2 * (0.86 - 0.025 * (m - 1 - k))
              seg.tint = shadeHex(topTint ?? 0x8aa054, Math.max(0.62, v2))
              seg.zIndex = zBase2 + 1 + (m - 1 - k)
              world.addChild(seg)
              continue
            }
            if (topTint !== undefined) {
              // P1: inland non-turf steps (the beach ramp's sand benches) shade in the
              // TOP's own field too — pale sand risers under pale sand tops, not grey
              // rock lines through the shore staircase
              seg.tint = shadeHex(topTint, drift * 0.86)
            } else {
              const vv = Math.min(255, Math.round(drift * 255))
              seg.tint = (vv << 16) | (vv << 8) | vv
            }
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
        // the mouth pours' falling gobs: y0→y0+h loops (the visible DOWNWARD motion)
        const pourPulses: { sp: Sprite; y0: number; h: number; spd: number; ph: number }[] = []
        // the pour waterfalls: molten TilingSprites whose texture scrolls down forever
        const pourSheets: { sp: TilingSprite; spd: number }[] = []
        // every molten tile registers here: the ticker cycles its texture with a
        // DOWNSTREAM-keyed phase, so the churn pattern itself travels mouth->sea
        // (the classic 16-bit flipbook flow — the surface moves, not sparkles on it)
        const lavaFlow: { sp: Sprite; off: number; pool: Texture[] }[] = []

        // ---- THE TONGUE-STAIR AS MATERIAL (the third and final form): decals
        // failed twice (buried at back-row z, floating at front-row z, and even
        // in the tile's own band the front tile's overlapping diamond covers a
        // decal's lower half — the "brick chips", flash-proven). The worn path
        // reads perfectly because it IS the tile — so the stair is a MATERIAL:
        // stone tiles in the ground itself, with alternating tread values.
        const stairInfo = new Map<number, number>()
        if (!NOCONE && TONGUE.length > 1) {
          let ord = 0
          for (let i = 0; i < TONGUE.length - 1; i++) {
            const [x0, y0] = TONGUE[i], [x1, y1] = TONGUE[i + 1]
            const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.3))
            for (let s = 0; s < n; s++) {
              const x = x0 + ((x1 - x0) * s) / n, y = y0 + ((y1 - y0) * s) / n
              // the stair ends at the forecourt threshold, clear of the melt
              if (lavaDist(x, y) < 2.2) continue
              const k = Math.round(y) * COLS + Math.round(x)
              if (!stairInfo.has(k)) stairInfo.set(k, ord++)
            }
          }
          // the threshold LANDING: a slab cross at the stair tile nearest the melt
          let bd = 99, lk = -1
          for (const k of stairInfo.keys()) {
            const d = lavaDist(k % COLS, Math.floor(k / COLS))
            if (d < bd) { bd = d; lk = k }
          }
          if (lk >= 0) {
            const lx = lk % COLS, ly = Math.floor(lk / COLS)
            for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
              if (lavaDist(lx + ox, ly + oy) < 1.6) continue
              const k = (ly + oy) * COLS + (lx + ox)
              if (!stairInfo.has(k)) stairInfo.set(k, -1)   // -1 = landing pad
            }
          }
        }

        // ---- THE RIVER (P3): a mountain stream DESIGNED as pool-step-pool —
        // flat water rides each bench at the terrain's own level, a white
        // cascade drops at every lip, the falls bench widens into a fed pool,
        // and the chain ends where the cove takes over. (The old attempt painted
        // stepped water as floating mint checkers; the steps ARE the design now.)
        type RiverTile = { lvl: number; drop: number; ddir: [number, number]; i: number }
        const riverInfo = new Map<number, RiverTile>()
        if (!NOCONE && RIVER.length) {
          const chain: [number, number][] = []
          const seenR = new Set<number>()
          const addR = (cx2: number, cy2: number) => {
            const k = cy2 * COLS + cx2
            if (!seenR.has(k)) { seenR.add(k); chain.push([cx2, cy2]) }
          }
          for (let i = 0; i < RIVER.length - 1; i++) {
            const [x0, y0] = RIVER[i], [x1, y1] = RIVER[i + 1]
            const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.15))
            for (let s = 0; s <= n; s++) {
              const cx2 = Math.round(x0 + ((x1 - x0) * s) / n), cy2 = Math.round(y0 + ((y1 - y0) * s) / n)
              const last = chain[chain.length - 1]
              // 4-connect diagonal jumps so the water never dashes
              if (last && Math.abs(cx2 - last[0]) === 1 && Math.abs(cy2 - last[1]) === 1) addR(cx2, last[1])
              addR(cx2, cy2)
            }
          }
          const kept: [number, number, number][] = []
          for (const [cx2, cy2] of chain) {
            // run INTO the shallows (-1.5, was 0): the land pass skips ds<=0
            // tiles anyway (the sea paints them), so the overshoot costs
            // nothing — but breaking at 0 let one radial pocket cut the chain
            // while dry sand still sat between the mouth and the tide
            if (dsAt(cx2, cy2) <= -1.5) break                // the cove takes over
            kept.push([cx2, cy2, Math.max(0, eLvl(cx2, cy2))])
          }
          kept.forEach(([cx2, cy2, lv], i) => {
            const nxt = kept[Math.min(i + 1, kept.length - 1)]
            riverInfo.set(cy2 * COLS + cx2, {
              lvl: lv, i,
              drop: Math.max(0, lv - nxt[2]),
              ddir: [Math.sign(nxt[0] - cx2), Math.sign(nxt[1] - cy2)] as [number, number],
            })
          })
          // the FALLS POOL: the bench at the falls widens into a fed pool
          const fi = kept.findIndex(([cx2, cy2]) => Math.hypot(cx2 - FALLS[0], cy2 - FALLS[1]) < 1.8)
          if (fi >= 0) {
            const [fx2, fy2, flv] = kept[fi]
            for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as [number, number][]) {
              const k = (fy2 + oy) * COLS + (fx2 + ox)
              if (!riverInfo.has(k) && eLvl(fx2 + ox, fy2 + oy) === flv && dsAt(fx2 + ox, fy2 + oy) > 0.5) {
                riverInfo.set(k, { lvl: flv, i: fi, drop: 0, ddir: [0, 0] })
              }
            }
          }
          // THE RUN WIDENS DOWN-SCREEN: every chain tile claims its two down-
          // screen neighbours where the bench allows (same level only, so the
          // pool-step truth holds) — a 1-wide diagonal ribbon loses its lower
          // half to the next row's grass top (the estuary's own nibble) and
          // read as detached mint stepping-stones the whole descent (Opus #5/#9)
          kept.forEach(([cx2, cy2, lv], i) => {
            for (const [ox, oy] of [[0, 1], [1, 0]] as [number, number][]) {
              const k = (cy2 + oy) * COLS + (cx2 + ox)
              if (!riverInfo.has(k) && eLvl(cx2 + ox, cy2 + oy) === lv && dsAt(cx2 + ox, cy2 + oy) > 0.5) {
                riverInfo.set(k, { lvl: lv, i, drop: 0, ddir: [0, 0] })
              }
            }
          })
          // THE SPRING: the river is BORN somewhere — the head tile widens into
          // a small source pool (a stream starting mid-slope from nothing was
          // the review's "placement nonsense"; the rock collar mounts with the
          // ford stones below)
          if (kept.length) {
            const [hx2, hy2, hlv] = kept[0]
            for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
              const k = (hy2 + oy) * COLS + (hx2 + ox)
              if (!riverInfo.has(k) && eLvl(hx2 + ox, hy2 + oy) === hlv && dsAt(hx2 + ox, hy2 + oy) > 0.5) {
                riverInfo.set(k, { lvl: hlv, i: 0, drop: 0, ddir: [0, 0] })
              }
            }
          }
          // the ESTUARY AS A FIELD (the lava ribbon's own recipe): on the flat
          // beach the 1-wide chain always loses to the lattice — the next row's
          // sand top covers each river tile's lower half (the stair's z-band
          // nibble, probe-proven twice) and the mouth read as detached slivers.
          // Two chain-side fan passes failed; an AREA fill within the mouth's
          // half-width of the polyline is edge-connected by construction. Level
          // 0 only — the bench run upstream keeps the chain's pool-step truth.
          {
            const segDist = (px3: number, py3: number) => {
              let best = 99
              for (let i = 0; i < RIVER.length - 1; i++) {
                const [x0, y0] = RIVER[i], [x1, y1] = RIVER[i + 1]
                const vx = x1 - x0, vy = y1 - y0
                const L2 = vx * vx + vy * vy
                let t = L2 > 0 ? ((px3 - x0) * vx + (py3 - y0) * vy) / L2 : 0
                t = Math.max(0, Math.min(1, t))
                const d = Math.hypot(px3 - (x0 + vx * t), py3 - (y0 + vy * t))
                if (d < best) best = d
              }
              return best
            }
            const tail = RIVER.slice(-14)
            const minX = Math.floor(Math.min(...tail.map((p) => p[0])) - 3), maxX = Math.ceil(Math.max(...tail.map((p) => p[0])) + 3)
            const minY = Math.floor(Math.min(...tail.map((p) => p[1])) - 3), maxY = Math.ceil(Math.max(...tail.map((p) => p[1])) + 3)
            for (let ty3 = minY; ty3 <= maxY; ty3++) for (let tx3 = minX; tx3 <= maxX; tx3++) {
              const ds3 = dsAt(tx3, ty3)
              if (ds3 <= -1.5 || ds3 > 5.5) continue
              if (eLvl(tx3, ty3) !== 0) continue
              if (segDist(tx3, ty3) > 1.6) continue
              const k = ty3 * COLS + tx3
              if (!riverInfo.has(k)) riverInfo.set(k, { lvl: 0, i: 9999, drop: 0, ddir: [0, 0] })
            }
          }
        }
        // ---- P4 · THE CANOPY MASSES (composed, each with a reason — never sprinkle).
        // c3's whole read is carried by palm MASSES with clearings between them; the
        // ground darkens under each mass (real canopy AO) and the palms plant densest
        // at each core, thinning to understory at the fringe. Open by design: the E
        // arrival corridor, the gate forecourt, and the cast-shadow wedge.
        const MASSES: [number, number, number, string][] = [
          [132, 72, 8, 'frames the arrival bay from the north'],
          [144, 102, 6, 'flanks the future steles walk on its south side'],
          [72, 66, 9, 'the NW back-mass — the far-zoom green anchor'],
          [58, 96, 7, 'the west meadow band'],
          [84, 131, 8, 'south of the west flow — closes the SW corner'],
          [124, 127, 7, 'between the gate approach and the south coast'],
          [104, 58, 6, 'the north toe grove'],
        ]
        const massK = (tx2: number, ty2: number) => {
          let k = 0
          for (const [mx, my, r] of MASSES) {
            const d = Math.hypot(tx2 - mx, ty2 - my)
            k = Math.max(k, 1 - smooth(r * 0.55, r * 1.15, d))
          }
          return k
        }

        for (let ty = 0; ty < ROWS; ty++) {
          for (let tx = 0; tx < COLS; tx++) {
            const dx = tx - CX, dy = ty - CY
            if (dx * dx + dy * dy > SEA_R * SEA_R) continue
            const dsq = dsAt(tx, ty)
            if (dsq <= 0) continue   // P0: ALL water is the virtual sea layer's job now
            const L = eLvl(tx, ty)                          // beaches = 0 → flush, no gap
            // sea-level land on a beach azimuth wears sand; on mixed azimuths it stays grass
            const sand = L === 0 && cliffMask(Math.atan2(ty - CY, tx - CX)) < 0.35
            const lift = liftOf(L)
            const bx = isoX(tx, ty), by = isoY(tx, ty) - lift + GY
            // lift*8 overflowed the 4000 row separation once the cone stacked tall
            // (a summit tile out-sorted the row in front of it); *2 keeps even the
            // ~35-level summit (lift 1120 -> 2240) safely inside its own row band
            const zBase = (tx + ty) * 4000 + lift * 2


            // THE BLOCK COLUMN / FACE EMISSION moved BELOW the top block (P1): risers
            // now inherit the top's computed tint, so the gate runs after it exists.

            // TOP: one flat blended diamond (old-map recipe: narrow ramp + low-freq patch),
            // ~1.14 overlap so neighbours melt together. NO hillshade — the decorated SIDE
            // faces carry the 3D, and the flat tops stay a seamless surface like the old map.
            // the cone's surface bands: grass skirt -> dry scrub -> bare basalt (coneBand
            // carries its own dither so the transitions never draw as clean rings).
            // P3: inside a carved head's mask the material is ALWAYS bare rock — a
            // monument is one hewn mass; meadow tints on a jowl camouflaged the form
            const inHead = !NOCONE && inHeadBBox(tx, ty) && (headField(tx, ty)?.k ?? 0) > 0.25
            const band = inHead ? 2 : !sand && L > PLAT_L ? coneBand(tx, ty) : 0
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
            // ribbon width 1.45 (was 1.25, was 0.95): under ~1.3 a diagonal flow
            // rasterizes into an ALTERNATING lava/bed checker down the flank (tile
            // centres fall in and out of the band as the line crosses the lattice) —
            // Ash read it as a broken staircase. 1.45 keeps the core edge-connected
            // and solid the whole run.
            // the flow crosses the BEACH to the sea (Ash: the trail bleeds into the
            // ocean) — L>0 gated it to the terraces and the ribbon died at the lip
            // the COOLED-CRUST CROSSINGS: where a flow severs the promenade ring, a
            // slab of solidified crust bridges it (walkable in hub-mechanics) — the
            // slab outranks molten so the walk reads as stone over the fire
            const onCross = DECOR && !NOCONE && ld < 2.4 && crossingD(tx, ty) < 1.5
            // the river BREATHES: its width swells and narrows along the run (a
            // uniform band read as a string of lozenges — reviewer verdict). Floor
            // 1.2 keeps the diagonal core edge-connected.
            const wMod = 0.85 + 0.35 * vnoise(tx / 5 + 21, ty / 5 + 7)
            // (the mouth-delta widening is DEAD — swelling the ribbon at the steep
            // birth benches rasterized into exactly the blocky clutter Ash circled;
            // the birth's gush lives in the stream vein now, which follows the slope)
            const isLava = !NOCONE && !onCross && lavaT.length > 0 && (ld < 1.45 * wMod || (L > 0 && ck > 0.32))
            // the bed MATERIAL swap only on rock and sand — on grass a hard swap
            // rasterizes into a dark checker along the diagonal (the same disease
            // the molten core had); the meadow chars by TINT BLEND instead (the
            // beach delta's own recipe), which cannot checker
            const grassy = !sand && band < 1
            const isBed = !NOCONE && !isLava && (onCross || ((ld < 2.1 || (L > 0 && ck > 0.4)) && !grassy))
            // the worn path wears dry sand through the meadow (grass ring only, never
            // up the cone or over the beach's own sand)
            // paths may cross the grassy cone toe (the lawn IS mostly toe) — never the
            // rock bands, never the beach's own sand
            // the worn paths + plaza floor are BACK (Phase B of the hub method): they
            // render the master layout's walkable spine — meadow ground only, never
            // the cone's rock bands, never the beach sand, never over lava/river
            const pdst = plazaD(tx, ty)
            // the court holds ONE bench (a courtyard is FLAT): the raw disc
            // draped flagstone over four terrace steps and read as paved slope
            const onPlaza = DECOR && !sand && L > 0 && pdst < 5.5 && L === eLvl(Math.round(PLAZA[0]), Math.round(PLAZA[1]))
            // the carved stair to the maw IS the ground (material, never a decal)
            const stairOrd = stairInfo.get(ty * COLS + tx)
            const onStair = DECOR && stairOrd !== undefined
            const pD = pathD(tx, ty)
            // the path yields to the channel EXCEPT at a crust crossing, where it
            // runs right up to the slab (a dead-end path beside a walkable bridge
            // reads as "you can't cross here")
            // the path ends at a STABLE line where the scrub belt starts: testing
            // the dithered coneBand made inclusion flicker per tile across the
            // whole merge belt — the forecourt climb rendered as scattered pale
            // dashes. A designed trail is cut by the landform, not by dither.
            // MEMBERSHIP IS DISTANCE, not the rasterized set: rounding a diagonal
            // polyline into cells left corner-linked diamonds (dash/checker read
            // on every slanted run); the continuous band can't disconnect, and a
            // soft noise on its edge keeps the margin organic instead of ruled.
            const onPath = DECOR && !onPlaza && !sand && L > 0 && coneH(tx, ty) < 18
              && (lavaDist(tx, ty) > 1.4 || crossingD(tx, ty) < 2.2)
              && pD < 0.72 + 0.34 * vnoise(tx / 3.1 + 21, ty / 3.1 + 8)
            // THE RIVER lives (P3): the chain map is the truth — pool-step-pool
            // water at the terrain's own benches, never orphan checkers
            const rv = DECOR ? riverInfo.get(ty * COLS + tx) : undefined
            const onRiver = !!rv && !isLava && !isBed
            // the head wears its OWN monument family; the flank keeps the strata crops
            const vs = inHead && headTop.length ? headTop
              : band >= 1 && rockTop.length ? rockTop : undefined
            // molten core + charred bed OUTRANK sand so the flow owns its beach
            // crossing; the river outranks sand too (its estuary rides the cove flat)
            const pool = isLava ? (ck > 0.32 && lakeT.length ? lakeT : lavaT)
              : isBed && volcT.length ? volcT
                : onRiver && waterV.length ? waterV
                  : onStair && st.length ? st
                    : sand ? st
                      : (onPath || onPlaza) && st.length ? st : vs || gt
            // cone rock tops pick in smooth ZONES (like the walls): per-tile hash churn
            // re-rolled the texture every diamond and the flank read as shredded scales
            const g = !pool.length ? undefined
              : pool === vs ? pool[Math.floor(vnoise(tx / 6 + 4.2, ty / 6 + 1.8) * pool.length) % pool.length]
                : pool[Math.floor(hash(tx * 5.1 + 2, ty * 2.9 + 4) * pool.length) % pool.length]
            let topTintHex: number | undefined   // P1: the risers inherit this below
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
              // the cast shadow (module-level castShadowK — shared with the sand and
              // the sea layer, one wedge across every surface it crosses)
              const shadowK = castShadowK(tx, ty)
              // THE MEADOW FIELD (the else-branch's math, verbatim — extracted so the
              // belt can blend toward the exact same field): a LARGE meadow↔deep-green
              // zone drift (24-tile landform scale) over mid-scale patchwork, damped on
              // the narrow coast benches, with cone-wrap sun, path-fringe dry, canopy AO.
              const meadowTopTint = () => {
                const damp = L < PLAT_L ? 0.35 : Math.min(1, DIST[ty * COLS + tx] / 12)
                const zone = 0.5 + (vnoise(tx / 24 + 9, ty / 24 + 17) - 0.5) * damp
                const patch = 1.0 + 0.08 * (vnoise(tx / 14 + 2, ty / 14 + 6) - 0.5) * 2 * damp
                const tval = Math.max(0, Math.min(1,
                  0.1 + 0.3 * vnoise(tx / 13 + 2, ty / 13 + 6) + 0.42 * zone + (vnoise(tx / 2.1 + 5, ty / 2.1 + 9) - 0.5) * 0.06))
                const cl = L > PLAT_L ? coneLit(tx, ty) : 0
                const dry = Math.max(0, 1 - pD / 1.2) * 0.32
                const vShade = (1 - 0.15 * smooth(0.45, 0.95, vegK(tx, ty)))
                  * (1 - 0.13 * smooth(0.25, 0.9, massK(tx, ty)))   // canopy AO under the masses
                // value range widened (P1 round 2): the melt deleted the lattice darks,
                // so the LARGE fields must own real range — deeper zone swing + rake,
                // and the cast shadow multiplied in (floor ~0.78, above the crush)
                const lit = patch * grain * (1 + 0.17 * rk) * (1.05 - 0.13 * zone) * (1 + 0.14 * cl) * vShade * (1 + 0.1 * dry)
                  * (1 - 0.3 * shadowK)
                const tv2 = Math.max(0, Math.min(1, tval - 0.32 * dry + 0.24 * shadowK))
                return warmCool(tintFor(shadeHex(rampAt(GRASS_RAMP, tv2), lit), GRASS_BASE), rk)
              }
              if (onRiver) {
                // fresh water: RICH teal in the sea's own family (the first pass
                // read as a flat mint stripe), value wobble per tile so the
                // surface lives, easing toward the sea's turquoise at the mouth
                const wob = 0.86 + 0.24 * vnoise(tx / 2.7 + 7, ty / 2.7 + 2)
                // est caps at 0.6: a full blend washed the mouth into the bright
                // sand and the ribbon lost its identity crossing the beach
                const est = 0.6 * Math.min(1, Math.max(0, 1 - dsq / 5))
                // a step cooler/deeper than the first pass — the bright mint
                // fought the warm scene (Opus: "ocean aqua against warm ground")
                const base = rv && rv.drop > 0 ? 0x84c6ba : 0x519f96
                const t0 = shadeHex(base, wob)
                // the blend target sits BETWEEN the river's teal and the tide
                // band's pale: at deep turquoise the junction jumped a value
                // step; at full tide-pale the mouth washed into the sand and
                // the ribbon lost its identity mid-beach (both screenshot-proven)
                const sr = Math.round(((t0 >> 16) & 255) * (1 - est) + 0x7c * est)
                const sg = Math.round(((t0 >> 8) & 255) * (1 - est) + 0xcf * est)
                const sb = Math.round((t0 & 255) * (1 - est) + 0xc0 * est)
                top.tint = (sr << 16) | (sg << 8) | sb
                if (hash(tx * 3.7, ty * 1.9) > 0.6) {
                  const glint = new Sprite(foamTex)
                  glint.anchor.set(0.5, 0.5); glint.blendMode = 'add'
                  glint.tint = 0xbfffec; glint.width = 46; glint.height = 22
                  glint.alpha = 0.16
                  glint.position.set(bx, by); glint.zIndex = zBase + 7
                  world.addChild(glint)
                  glows.push({ sp: glint, ph: hash(tx, ty * 3.1) * 6.3, a: 0.14 })
                }
                // soft banks: a dark wet seam hugging the water so the stream sits
                // IN the meadow instead of floating on it (foamTex tinted dark —
                // shadTex isn't declared yet at this point in the pass). NOT on
                // drop tiles: there the dark seam painted over the fall's own
                // gap and the cascade read as a black hole between benches.
                if (!rv || !rv.drop) {
                  const bank = new Sprite(foamTex)
                  bank.anchor.set(0.5, 0.5)
                  bank.width = 72; bank.height = 38; bank.alpha = 0.26; bank.tint = 0x0a2620
                  bank.position.set(bx, by); bank.zIndex = zBase + 3
                  world.addChild(bank)
                }
              } else if (sand) {
                const tt = Math.min(1, dsq / 5)
                const v = (0.965 + 0.06 * vnoise(tx / 16 + 3, ty / 16 + 5)) * grain * (1 + 0.1 * rk)
                  * (1 - 0.18 * shadowK)   // the cone's shadow crosses the SE beach (c3)
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
                // INTERNAL RIVER STRUCTURE (reviewer): a white-hot CORE down the
                // centreline, a cooling skin toward the banks, dark crust plates
                // floating on the body — three value zones across the width so the
                // band reads as molten rock, not lit floor tiles. The mouth-strike
                // tiles stay core-hot so the sprite's flow hands off without a pinch.
                const nearMouth = Math.min(
                  Math.hypot(tx - MOUTH_R[0], ty - MOUTH_R[1]),
                  Math.hypot(tx - MOUTH_L[0], ty - MOUTH_L[1]))
                const core = ld < 0.62 * wMod || nearMouth < 1.7 || (L > 0 && ck > 0.32)
                // DE-WALLPAPER (Opus: "identical crescent highlight on a rigid
                // grid defeats the river"): mirror roughly half the tiles by
                // hash and wobble each tile's value a few % — the same frames
                // stop lining their scallops up across the lattice
                if (hash(tx * 3.7 + 5, ty * 2.3 + 1) > 0.5) top.scale.x = -1
                const lw = 0.94 + 0.1 * vnoise(tx / 3.1 + 31, ty / 3.1 + 6)
                if (core) {
                  const cv = Math.round(255 * Math.min(1, lw + 0.03))
                  top.tint = (cv << 16) | (cv << 8) | cv       // near-white, wobbled
                } else {
                  // cooling skin: pull the art toward dim red-brown at the bank
                  // edge — deepened (0.5 -> 0.62) so the banks visibly crust and
                  // the centreline vein carries the run as ONE river
                  const k = Math.min(1, Math.max(0, (ld - 0.62 * wMod) / (0.83 * wMod))) * 0.62
                  const vv = Math.round(255 * (1 - k * 0.45) * lw)
                  top.tint = (vv << 16) | (Math.round(vv * (1 - k * 0.35)) << 8) | Math.round(vv * (1 - k * 0.55))
                }
                // the surface itself FLOWS: downstream-phased texture cycling
                // (crust plates now DRIFT with the current — spawned in the
                // animation pass, not parked per-tile). A per-tile phase jitter
                // keeps the flipbook's frames from banding row by row.
                // the river COOLS INTO the sea (Ash, circled twice: the mouth ended
                // as a hard bright bar). Over the last beach tiles the melt crusts
                // toward the delta's charcoal, so the run visibly dies into the
                // black fan instead of stopping at a straight cut.
                const seaK = Math.max(0, Math.min(1, 1 - dsq / 7)) * 0.92
                if (seaK > 0) {
                  const t0 = top.tint as number
                  top.tint = (Math.round(((t0 >> 16) & 255) * (1 - seaK) + 0x4a * seaK) << 16)
                    | (Math.round(((t0 >> 8) & 255) * (1 - seaK) + 0x42 * seaK) << 8)
                    | Math.round((t0 & 255) * (1 - seaK) + 0x3e * seaK)
                }
                lavaFlow.push({
                  sp: top, off: Math.hypot(tx - CX, ty - CY) + hash(tx * 1.9, ty * 4.1) * 0.7,
                  pool: ck > 0.32 && lakeT.length ? lakeT : lavaT,
                })
                const glow = new Sprite(foamTex)              // soft radial, re-tinted ember
                glow.anchor.set(0.5, 0.5); glow.blendMode = 'add'
                glow.tint = core ? 0xffa040 : 0xff8a30
                glow.width = 150; glow.height = 84
                glow.alpha = (core ? 0.4 : 0.28) * (1 - seaK)
                glow.position.set(bx, by); glow.zIndex = zBase + 7
                world.addChild(glow)
                // phase keyed to distance from the vent: the pulse TRAVELS downstream —
                // the cheap cue that the river flows instead of blinking in place
                glows.push({ sp: glow, ph: -Math.hypot(tx - CX, ty - CY) * 1.1 + hash(tx, ty) * 0.8, a: core ? 0.34 : 0.24 })
              } else if (isBed) {
                // the charred channel shoulder / crater bowl floor — dark UMBER, not black
                // (the grade crushes anything below ~0.5 into hole-black). The cooled
                // CROSSING slabs sit a clear step lighter so the walk reads as stone
                // laid over the fire, with an ember seam breathing at each lip
                const v = (onCross ? 0.74 : 0.54) + 0.12 * vnoise(tx / 4 + 8, ty / 4 + 3)
                const vv = Math.round(v * 255)
                top.tint = (vv << 16) | (Math.round(vv * 0.82) << 8) | Math.round(vv * 0.72)
                if (onCross && ld < 1.45) {
                  const seam = new Sprite(foamTex)
                  seam.anchor.set(0.5, 0.5); seam.blendMode = 'add'
                  seam.tint = 0xff6a1e; seam.width = 82; seam.height = 40
                  seam.alpha = 0.2
                  seam.position.set(bx, by); seam.zIndex = zBase + 7
                  world.addChild(seam)
                  glows.push({ sp: seam, ph: hash(tx * 1.7, ty * 2.3) * 6.3, a: 0.16 })
                }
              } else if (onStair) {
                // the carved stair: pale cut stone, treads alternating a value
                // step so each reads as a separate slab climbing the flank; the
                // landing pads (ord -1) sit a shade warmer
                const alt = stairOrd === -1 ? 1 : stairOrd % 2 ? 0.8 : 1
                const v = (0.94 + 0.1 * vnoise(tx / 2.1 + 22, ty / 2.1 + 9)) * alt * grain
                // COOL cut stone — at warm beige the stair vanished into lit
                // grass; grey separates it from both the meadow and the path
                top.tint = warmCool(shadeHex(stairOrd === -1 ? 0xb9a683 : 0xaaa79e, v), rk * 0.25)
              } else if (onPlaza) {
                // the packed-earth court: sun-worn floor, a PALE stone medallion
                // under the statue, and a firmly darker rim course so the court
                // edge reads against both meadow and beach (at 0.82 the rim
                // vanished and the floor read as more path)
                const rim = pdst > PLAZA_R - 1.2 ? 0.72 : 1
                const med = pdst < 2.1 ? 1.08 : 1
                const flag = 0.9 + 0.16 * vnoise(tx / 2.3 + 40, ty / 2.3 + 12)  // per-flag value break
                const v = flag * grain * rim * med * (1 + 0.08 * rk)
                top.tint = warmCool(shadeHex(pdst < 2.1 ? 0xb7ad9c : 0xbcae94, v), rk * 0.5)
              } else if (onPath) {
                // the trail: pale dry trodden earth through the green (c3's cream
                // paths) — light enough to read at map zoom, never orange carpet
                const v = (0.99 + 0.05 * vnoise(tx / 7 + 3, ty / 7 + 9)) * grain * (1 + 0.08 * rk)
                top.tint = warmCool(shadeHex(0xe6d6ac, v), rk * 0.4)
              } else if (inHead && vs) {
                // P3 SKIN · the monument's own value world: cool violet-grey stone,
                // darker toward the pocket's heart (the void), a whisper of the sun's
                // side — NEVER the warm cone tint (dark carved basalt, anti-lion law).
                const k2 = headField(tx, ty)?.k ?? 0
                const v2 = (0.86 - 0.3 * k2) * (1 + 0.1 * coneLit(tx, ty)) * grain
                top.tint = tint24(v2 * 0.8, v2 * 0.77, v2 * 0.88)
              } else if (band >= 1 && vs) {
                // P1 · THE BELT IS A BLEND, NOT A BAND: the tread tint mixes coneTint
                // toward THIS TILE'S OWN MEADOW TINT along one continuous field. The
                // old binary band switch (dithered per tile) printed a green/terracotta
                // checker across the whole merge belt — and every riser inherited it.
                // The texture still swaps to strata at the band frontier; tinted in the
                // meadow's color that difference reads as grain (c3's grass-through-rock
                // mesh), never as a checker.
                const [r0, g0, b0] = coneTint(tx, ty)
                const vBelt = coneH(tx, ty) + (vnoise(tx / 6.2 + 11, ty / 6.2 + 23) - 0.5) * 4 - gullyK(tx, ty) * 26
                const beltK = smooth(16, 36, vBelt)
                const mt = meadowTopTint()
                const dk = grain
                const r = (r0 * beltK + (((mt >> 16) & 255) / 255) * (1 - beltK)) * dk
                const g2 = (g0 * beltK + (((mt >> 8) & 255) / 255) * (1 - beltK)) * dk
                const b2 = (b0 * beltK + ((mt & 255) / 255) * (1 - beltK)) * dk
                top.tint = tint24(r, g2, b2)
              } else {
                // the plateau's ground mosaic (math lives in meadowTopTint above so the
                // belt can blend toward the very same field)
                top.tint = meadowTopTint()
                if (!NOCONE && ld < 3.6) {
                  // the CHAR FRINGE: meadow scorched toward the channel by smooth
                  // tint blend (the beach delta's recipe) — a hard bed-material
                  // swap here rasterized into a dark checker on the diagonal.
                  // Two tiers (reviewer): a BLOTCHY brown scorch reaching into the
                  // grass in uneven fingers, and a near-BLACK burnt lip hugging the
                  // molten edge (the hottest ground must be the darkest, and an
                  // even-width halo reads airbrushed)
                  // the noise wanders the fringe's EDGE, not its strength: the
                  // old k*blotch product let a vnoise hot-spot fire an isolated
                  // scorch diamond two tiles out in clean grass (Opus caught
                  // two orphans) — with a wandering reach the falloff stays
                  // monotonic in ld and orphans are impossible by construction
                  // widened (1.8 -> 2.2, 0.8 -> 0.86): at map zoom the scorch
                  // margin read too thin and the lava still sat on the green as
                  // a crisp painted stripe (final gate verdict)
                  const reach = 2.2 * (0.45 + 0.55 * vnoise(tx / 3.2 + 31, ty / 3.2 + 13))
                  const k = Math.min(1, Math.max(0, 1 - (ld - 1.3) / reach)) * 0.86
                  const t0 = top.tint as number
                  let dr = Math.round(((t0 >> 16) & 255) * (1 - k) + 0x46 * k)
                  let dg = Math.round(((t0 >> 8) & 255) * (1 - k) + 0x3a * k)
                  let db = Math.round((t0 & 255) * (1 - k) + 0x30 * k)
                  const k2 = Math.min(1, Math.max(0, 1 - (ld - 1.3) / 0.55)) * 0.88
                  dr = Math.round(dr * (1 - k2) + 0x20 * k2)
                  dg = Math.round(dg * (1 - k2) + 0x18 * k2)
                  db = Math.round(db * (1 - k2) + 0x12 * k2)
                  top.tint = (dr << 16) | (dg << 8) | db
                }
              }
              topTintHex = top.tint as number
              world.addChild(top)
            }

            // P1 · THE BLOCK COLUMN / FACE EMISSION — after the top, so risers inherit
            // its tint. Drawn faces survive ONLY at DESIGNED edges: coast silhouettes
            // (toSea — the cliff IS the silhouette), real terraces (2+ levels), lava
            // lips + the charred channel ring, and the cone's bare-rock crags. Every
            // other 1-level riser MELTS (meltRiser: the top's own texture + tint x 0.9),
            // so value lives in the LARGE fields — sun rake, zone drift, AO — never in
            // a per-lip contrast step. That step, repeated on the lattice, was the
            // island's whole cube-read (baseline repeat 0.57-0.88).
            {
              let floorMin = L, toSea = false
              for (const [ox, oy] of [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
                const nl = eLvl(tx + ox, ty + oy)
                if (nl < 0) toSea = true
                const fl = nl < 0 ? 0 : nl
                if (fl < floorMin) floorMin = fl
              }
              if (L > floorMin) {
                const drop = L - floorMin
                // a lava tile's step pours EVERYWHERE, benches included — below the
                // cone the flow's steps drew charred columns and the river read as
                // dashes with dark gaps at every bench lip
                const moltenStep = !NOCONE && !toSea && (lavaDist(tx, ty) < 1.25 || craterK(tx, ty) > 0.32)
                // TIGHT charred ring: the channel's own dark banks stay drawn walls
                const charred = !NOCONE && (lavaDist(tx, ty) < 1.3 || craterK(tx, ty) > 0.4)
                // the cone's faces: bare-rock crags (band 2+) at any drop; the grass
                // skirt + merge belt only at real terraces — their 1-level lips melt.
                // A carved head's steps are ALWAYS monument faces (P3).
                const coneFace = !NOCONE && L > PLAT_L && (coneH(tx, ty) > 0 || inHead) && !toSea && (sideW.length > 0 || vsF.length > 0)
                  && (inHead || coneBand(tx, ty) >= 2 || (coneBand(tx, ty) >= 1 && drop >= 2))
                const designed = toSea || drop >= 2 || moltenStep || charred || coneFace
                if (!designed) {
                  meltRiser(bx, by, lift - liftOf(floorMin), tx, ty, zBase, topTintHex ?? 0x8aa054, sand)
                } else if (coneFace || (moltenStep && L > 0)) {
                  // the cone's own steps wear the block skin — one strip, one tint field;
                  // river tiles pour over their steps as burning falls
                  drawFace(bx, by, lift - liftOf(floorMin), tx, ty, zBase, moltenStep)
                } else {
                  // a grass-topped terrace wears a TURF BANK: the top's own texture at
                  // a deeper shade (0.8) — a real terrace step in the meadow's own
                  // field. Rock-block courses under green tint flashed warm grain and
                  // read as scattered chips. Sand ramps + coast cliffs + the charred
                  // channel keep the real rock language.
                  const grassy2 = !sand && !charred && cliffMask(Math.atan2(ty - CY, tx - CX)) < 0.35
                  if (grassy2 && topTintHex !== undefined) {
                    // 0.72: a real designed terrace bank — sparse, long, landform-following
                    // darks are structure, not lattice (c3's own contour lines are visible)
                    meltRiser(bx, by, lift - liftOf(floorMin), tx, ty, zBase, topTintHex, false, 0.72)
                  } else {
                    drawColumn(bx, by, drop, toSea, tx, ty, zBase, charred, grassy2, toSea ? undefined : topTintHex)
                  }
                }
                // TARGETED CHANNEL VOID FILL: the steep lava river drops fast, so its
                // BACK edges over a 2+level-lower neighbour open real black slots (the
                // one place the cone's 10px steps aren't self-covering). Fill ONLY the
                // channel, charred-dark so it recedes — NOT the broad fills Ash circled
                // (those tinted bright rock across the whole flank). Grass/rock steps
                // stay unfilled (their 1-level slivers read fine).
                const inChannel = !NOCONE && !params.get('novoid') && (lavaDist(tx, ty) < 1.7 || craterK(tx, ty) > 0.3)
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
                    // inside the molten core the slot glows ember instead of reading as
                    // a black hole punched in the flow (P2: one continuous river)
                    seg.tint = lavaDist(tx, ty) < 1.5 ? 0x8a4418 : 0x3a2a1e
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

            // THE CASCADES: where the river chain steps down a bench, a white
            // fall pours over the lip — sheet + soft veil + churning foam at the
            // plunge, with the churn breathing via the glow ticker
            if (rv && rv.drop > 0 && (rv.ddir[0] || rv.ddir[1])) {
              const dh = lift - liftOf(rv.lvl - rv.drop)
              const fx2 = isoX(tx + rv.ddir[0] * 0.5, ty + rv.ddir[1] * 0.5)
              const fy2 = isoY(tx + rv.ddir[0] * 0.5, ty + rv.ddir[1] * 0.5) - lift + GY
              // above the downstream tile's TOP (zBase + lift*2 + 5) or the fall
              // paints first and the tile top buries it — the invisible-falls bug
              const zF = (tx + rv.ddir[0] + ty + rv.ddir[1]) * 4000 + lift * 2 + 620
              // veil spans the whole tile width (58 read as a thin thread and
              // the drops still showed dark gaps — Opus: "stepping stones, not
              // water")
              const veil = new Sprite(foamTex); veil.anchor.set(0.5, 0)
              veil.width = 68; veil.height = dh + 30; veil.alpha = 0.62; veil.tint = 0xd8f6ee
              veil.position.set(fx2, fy2 - 2); veil.zIndex = zF
              world.addChild(veil)
              const sheet = new Sprite(foamTex); sheet.anchor.set(0.5, 0)
              sheet.width = 40; sheet.height = dh + 20; sheet.alpha = 0.95; sheet.tint = 0xf6fefc
              sheet.position.set(fx2, fy2 + 1); sheet.zIndex = zF + 1
              world.addChild(sheet)
              // the bright lip line where the water breaks over the edge
              const lip = new Sprite(foamTex); lip.anchor.set(0.5, 0.5)
              lip.width = 42; lip.height = 8; lip.alpha = 0.9; lip.tint = 0xffffff
              lip.position.set(fx2, fy2 + 1); lip.zIndex = zF + 3
              world.addChild(lip)
              const churn = new Sprite(foamTex); churn.anchor.set(0.5, 0.5)
              churn.width = 58; churn.height = 22; churn.alpha = 0.85; churn.tint = 0xffffff
              churn.position.set(fx2, fy2 + dh + 16); churn.zIndex = zF + 2
              world.addChild(churn)
              glows.push({ sp: churn, ph: hash(tx * 2.3, ty * 5.1) * 6.3, a: 0.75 })
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

        // ---- P3 · THE CARVED HEADS' FACES: one meshed head piece per site, INPAINTED
        // into a live capture of the gate site (value/light/scale mesh by construction —
        // never a cold decal), mounted back at the measured anchor rect and depth-sorted
        // by its structure tile. The structure owns the void, the collision, and the
        // pour; the piece owns the panther. The maw's fire breathes as a live glow.
        try {
          if (params.get('norelief')) throw new Error('relief off (clean-structure captures)')
          // THE GATE HEAD — the TWIN GUARDIAN: the west patch MIRRORED (temple gates
          // pair identical carved heads; the mirror makes the pair matched by
          // construction). Its painted pour flows lower-right over the gate's own
          // molten gutter; the mouth-fire carries the light through the flip.
          // Three gate-site inpaints painted plain rock (the context is too uniform
          // to hook a head) — the twin is the working construction, stop-loss honored.
          // THE HEADS, FINAL CONSTRUCTION (both poles failed: small meshed patches
          // "barely visible"; a mounted 400px colossus "too large, wrong angle,
          // doesn't mesh"). The answer is the inpaint at DOUBLE WORLD COVERAGE: each
          // head painted into a 200px live capture of its own site taken at zoom .5
          // (the API's canvas cap, but twice the world per pixel) — the world's own
          // camera angle, bon4's foreshortened-spout language, torn edges into the
          // real blocks — alpha-cut and remounted at the measured rect: ~8 tiles of
          // gaping monument literally made of its mountainside.
          // the dark ALCOVE COLLAR both heads sit in: a near-black pool behind each
          // silhouette so no green bench ever peeks around the torn edge — the head
          // reads as carved INTO shadowed rock, not resting on the lawn
          // (foamTex, not shadTex — shadTex is declared later in the green pass and
          // the TDZ throw silently killed both heads once already)
          const collar = (cx2: number, cy2: number, z2: number) => {
            const c = new Sprite(foamTex)
            c.anchor.set(0.5, 0.5)
            // sized for the 1.45 guardians (the 440-wide pool let green benches
            // peek past the bigger silhouettes' torn shoulders)
            c.width = 580; c.height = 430
            c.tint = 0x16121a; c.alpha = 0.95
            c.position.set(cx2, cy2 + 12)
            c.zIndex = z2 - 2
            world.addChild(c)
          }
          try {
            const gateT: Texture = await Assets.load('/art/island/heads/gaping-torn.png')
            gateT.source.scaleMode = 'nearest'
            const gp = new Sprite(gateT)
            gp.anchor.set(0.5, 0.5)
            // BIGGER AND PROUD OF THE FLANK (Ash: at 1.1 sunk low it went "way too
            // deep into the volcano"): 1.45 fills its pocket, crown into the dark
            // rock, chin overhanging the open slope — a guardian carved OUT of the
            // mountain, not a face at the bottom of a hole
            gp.scale.set(-1.45, 1.45)
            // SEATED AT THE SOURCE (Ash: the maws must FORM the rivers): the maw
            // hangs just up-slope of MOUTH_R's first lava tile (iso 499,3133) —
            // the spill bridges maw -> birth, and the river visibly leaves the jaw
            gp.position.set(429, 3010)
            // z at the pocket's mid diagonal: the front jambs (higher diag) draw
            // AFTER the head and overlap its chin — sunk into the rock by painter's
            // order, the torn silhouette burying the cutout edge
            gp.zIndex = (118 + 101) * 4000 + liftOf(eLvl(118, 101)) * 2 + 1400
            collar(429, 3010, gp.zIndex)
            world.addChild(gp)
            const gglow = new Sprite(foamTex)
            gglow.anchor.set(0.5, 0.5); gglow.blendMode = 'add'
            gglow.tint = 0xff7a26; gglow.width = 200; gglow.height = 120; gglow.alpha = 0.3
            gglow.position.set(499, 3108)
            gglow.zIndex = gp.zIndex + 1
            world.addChild(gglow)
            glows.push({ sp: gglow, ph: 1.3, a: 0.26 })
          } catch { /* gate head piece not on disk yet */ }
          try {
            const westT: Texture = await Assets.load('/art/island/heads/gaping-torn.png')
            westT.source.scaleMode = 'nearest'
            const wp = new Sprite(westT)
            wp.anchor.set(0.5, 0.5)
            // the twin at the same guardian scale, maw over MOUTH_L's birth
            wp.scale.set(1.45)
            wp.position.set(-429, 3008)
            wp.zIndex = (101 + 118) * 4000 + liftOf(Math.max(0, eLvl(101, 118))) * 2 + 1400
            collar(-429, 3008, wp.zIndex)
            world.addChild(wp)
            const wglow = new Sprite(foamTex)
            wglow.anchor.set(0.5, 0.5); wglow.blendMode = 'add'
            wglow.tint = 0xff7a26; wglow.width = 200; wglow.height = 120; wglow.alpha = 0.28
            wglow.position.set(-499, 3106)
            wglow.zIndex = wp.zIndex + 1
            world.addChild(wglow)
            glows.push({ sp: wglow, ph: 2.9, a: 0.24 })
          } catch { /* west head piece not on disk yet */ }

          // THE MOUTH GLOW (the vertical pour sheets are DEAD — a plumb-vertical
          // column reads wrong in an iso world where lava descends a SLOPE; the
          // river's birth now lives in the stream vein, which follows the real
          // slope and gushes widest at the jaw). Each maw keeps its breathing fire.
          {
            const zG = 219 * 4000 + liftOf(eLvl(118, 101)) * 2 + 1440
            const zW = 219 * 4000 + liftOf(Math.max(0, eLvl(101, 118))) * 2 + 1440
            // THE MAW CASCADE (Ash 2026-07-16: the braided spill sprites read as
            // "two little lava studs... i wanted lava flowing from the panther's
            // gaping mouths, ANIMATED flowing lava, and flowing into the river").
            // Not a static sprite: a genuinely MOVING torrent — the river's own
            // molten strip texture scrolling downward inside a soft tapered
            // ribbon mask, maw -> channel head, with an additive hot core
            // streaming faster inside it. Top edge fades out INSIDE the maw's
            // dark void (the flow emerges from darkness); the fan lands on the
            // river's first tile at its real drawn height and the strike bloom
            // welds the seam. Its scroll speed matches the river veins' — one
            // molten body from jaw to sea.
            const ribbonMask = (W: number, H: number): Texture => {
              const cv = document.createElement('canvas')
              cv.width = Math.ceil(W); cv.height = Math.ceil(H)
              const g3 = cv.getContext('2d')!
              const cx4 = W / 2
              for (let y = 0; y < H; y++) {
                const u = y / H
                // throat -> body -> delta fan (capped at the canvas edge)
                const half = W * Math.min(0.5, 0.24 + 0.1 * u + 0.22 * Math.pow(Math.max(0, (u - 0.68) / 0.32), 1.5))
                const wob = Math.sin(u * 17 + W) * 1.5 + Math.sin(u * 6.1 + H) * 2
                const a = Math.min(1, y / 12) * (u > 0.94 ? (1 - u) / 0.06 * 0.6 + 0.4 : 1)
                g3.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
                g3.fillRect(cx4 + wob - half, y, half * 2, 1)
              }
              // feathered edges: redraw through a 2px blur (mask alpha only —
              // the visible pixels stay the painted molten strip)
              const cv2 = document.createElement('canvas')
              cv2.width = cv.width; cv2.height = cv.height
              const g4 = cv2.getContext('2d')!
              g4.filter = 'blur(2px)'
              g4.drawImage(cv, 0, 0)
              return Texture.from(cv2)
            }
            // the maw's world point, derived from the head mounts (centre ± the
            // measured per-unit maw offset 48.2,67.3 at scale 1.45)
            const MAWS: [number, number, number, number, boolean, [number, number]][] = [
              [499, 3108, 0.2, zG, false, MOUTH_R],
              [-499, 3106, 0.35, zW, true, MOUTH_L],
            ]
            for (const [mx3, my3, sd, z3, , mouthT] of MAWS) {
              // the river head's true drawn top: tile iso pos lifted by its level
              const rx4 = Math.round(mouthT[0]), ry4 = Math.round(mouthT[1])
              const bLift = liftOf(Math.max(0, eLvl(rx4, ry4)))
              const bx4 = isoX(mouthT[0], mouthT[1])
              const by4 = isoY(mouthT[0], mouthT[1]) + GY - bLift + 10   // +10: land IN the channel, past its top lip
              if (stripV) {
                const W4 = 84
                // -14, not -26: at -26 the cascade's top rose past the fang row
                // and licked the muzzle — the flow must be born UNDER the fangs
                const topY = my3 - 14                          // inside the maw's dark void, below the fang tips
                const H4 = Math.max(56, by4 + 8 - topY)        // down onto the channel head
                const mkT = ribbonMask(W4, H4)
                const layer = (w: number, alpha: number, add: boolean, tint: number, spd: number) => {
                  const mk = new Sprite(mkT)
                  mk.anchor.set(0.5, 0)
                  mk.position.set(bx4, topY)
                  mk.width = w; mk.height = H4
                  // masks live OUTSIDE the band partition/bake (z >= 3M is the
                  // global set): a mask whose band is culled or baked would
                  // orphan its cascade mid-animation
                  mk.zIndex = 5_000_000
                  world.addChild(mk)
                  const sl = new TilingSprite({ texture: stripV, width: w, height: H4 })
                  sl.anchor.set(0.5, 0)
                  sl.position.set(bx4, topY)
                  sl.tileScale.set(w / 64 * 1.1, 1.15)
                  if (add) sl.blendMode = 'add'
                  sl.alpha = alpha; sl.tint = tint
                  sl.zIndex = z3 + 8
                  sl.mask = mk
                  world.addChild(sl)
                  pourSheets.push({ sp: sl, spd })
                }
                layer(W4, 1, false, 0xffffff, 46 + sd * 12)    // the torrent body
                layer(W4 * 0.46, 0.5, true, 0xffd890, 78)     // the white-hot core, streaming faster
                // the upper lip's shadow: a slim dark pool over the cascade's top
                // edge so the flow reads as emerging from UNDER the fangs
                const hood = new Sprite(foamTex)
                hood.anchor.set(0.5, 0.5)
                hood.tint = 0x140c10; hood.alpha = 0.8
                hood.width = W4 * 0.86; hood.height = 20
                hood.position.set(bx4, topY + 7)
                hood.zIndex = z3 + 12
                world.addChild(hood)
                // a hot seam pool where the fan meets the channel — welds the
                // scrolling cascade and the tile river into one molten body
                const weld = new Sprite(foamTex)
                weld.anchor.set(0.5, 0.5); weld.blendMode = 'add'
                weld.tint = 0xffb050; weld.width = 140; weld.height = 48; weld.alpha = 0.42
                weld.position.set(bx4, by4 - 2)
                weld.zIndex = z3 + 10
                world.addChild(weld)
                glows.push({ sp: weld, ph: sd * 6 + 3.4, a: 0.4 })
              }
              const fg = new Sprite(foamTex)
              fg.anchor.set(0.5, 0.5); fg.blendMode = 'add'
              fg.tint = 0xff9036; fg.width = 150; fg.height = 96; fg.alpha = 0.3
              fg.position.set(mx3, my3)
              fg.zIndex = z3
              world.addChild(fg)
              glows.push({ sp: fg, ph: sd * 6, a: 0.28 })
            }
          }
        } catch { /* relief disabled */ }

        // ?coords=1 — the tile-coordinate scaffold (spatial-craft law #1): a label every
        // 8 tiles riding the terrain height, plus a tick at the exact tile centre, so every
        // verdict and edit note can cite tiles ("the checker band at 96,120"), never prose.
        // Labels counter-scale against ZOOM so they read the same at far and play zooms.
        if (params.get('coords')) {
          const cst = new TextStyle({
            fontFamily: 'Consolas, monospace', fontSize: 11, fill: 0xffffff,
            stroke: { color: 0x000000, width: 3 },
          })
          const lsc = Math.min(3.2, 0.62 / ZOOM)
          for (let cty = 0; cty < ROWS; cty += 8) {
            for (let ctx = 0; ctx < COLS; ctx += 8) {
              const cdx = ctx - CX, cdy = cty - CY
              if (cdx * cdx + cdy * cdy > SEA_R * SEA_R) continue
              const cl = dsAt(ctx, cty) > 0 ? eLvl(ctx, cty) : 0
              const tick = new Sprite(Texture.WHITE)
              tick.anchor.set(0.5); tick.width = 3 * lsc; tick.height = 3 * lsc; tick.tint = 0xff3355
              tick.position.set(isoX(ctx, cty), isoY(ctx, cty) - liftOf(cl))
              tick.zIndex = 1e9
              world.addChild(tick)
              const lbl = new Text({ text: `${ctx},${cty}`, style: cst })
              lbl.anchor.set(0.5, 1)
              lbl.scale.set(lsc)
              lbl.position.set(isoX(ctx, cty), isoY(ctx, cty) - liftOf(cl) - 3 * lsc)
              lbl.zIndex = 1e9
              world.addChild(lbl)
            }
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

        // ---- P4 · PLANTING THE MASSES: the accepted palm family (style-anchored on the
        // approved beach palms) composed into the MASSES — dense tall palms at each
        // core, understory + ferns at the fringe, every plant grounded by a violet
        // cast shadow along the ONE shadow direction, the whole canopy swaying.
        // (Runs AFTER vegT/sways/shadTex exist — the first draft ran before them and
        // the TDZ throw silently killed everything downstream of the planter.)
        const plantMasses = () => {
          const TALLP = ['palm-b', 'coco-v1', 'coco-v2', 'coco-v3', 'fan-1', 'tfern-1', 'palm-a']
          const LOWP = ['bush-a', 'bush-b', 'fernclump-1', 'banana-1', 'heliconia-1', 'tuft-1', 'tuft-2']
          const placed: [number, number][] = []
          const rej = { tex: 0, lvl: 0, lava: 0, head: 0, coast: 0, space: 0, ok: 0 }
          const put2 = (name: string, px2: number, py2: number, tall: boolean, h2: number) => {
            const t = vegT[name]
            if (!t) { rej.tex++; return }
            const rx = Math.round(px2), ry = Math.round(py2)
            const L2 = eLvl(rx, ry)
            // the meadow ring + the grassy lower toe (c3's palms CLIMB the flank);
            // never sand, lava, heads, bare cone rock, or water
            if (L2 < 1 || L2 > PLAT_L + 8) { rej.lvl++; return }   // benches OK — coast palms are the tropics
            if (!NOCONE && (lavaDist(px2, py2) < 3.5 || coneBand(rx, ry) > 0)) { rej.lava++; return }
            if (inHeadBBox(rx, ry)) { rej.head++; return }
            if (dsAt(px2, py2) < 3) { rej.coast++; return }
            for (const [qx2, qy2] of placed) {
              if (Math.hypot(px2 - qx2, py2 - qy2) < (tall ? 1.05 : 0.8)) { rej.space++; return }
            }
            rej.ok++
            placed.push([px2, py2])
            const lift2 = liftOf(L2)
            const bx2 = isoX(px2, py2), by2 = isoY(px2, py2) - lift2 + GY
            const zB = (rx + ry) * 4000 + lift2 * 2
            const sc = ((tall ? 108 : 46) / t.height) * (0.82 + 0.36 * h2)
            const sh = new Sprite(shadTex)
            sh.anchor.set(0.5, 0.5)
            sh.width = t.width * sc * (tall ? 1.15 : 0.9); sh.height = sh.width * 0.42
            sh.rotation = shadAng
            sh.alpha = 0.42
            sh.position.set(bx2 + 6, by2 + 1)
            sh.zIndex = zB + 6
            world.addChild(sh)
            const sp = new Sprite(t)
            sp.anchor.set(0.5, 0.97)
            sp.scale.set(hash(px2 * 3.7, py2 * 1.9) > 0.5 ? -sc : sc, sc)
            sp.position.set(bx2, by2 + 2)
            sp.tint = tint24(0.9 + 0.1 * h2, 0.9 + 0.1 * h2, 0.86 + 0.12 * h2)
            sp.zIndex = zB + 10
            world.addChild(sp)
            sways.push({ sp, amp: (tall ? 0.011 : 0.02) + 0.012 * h2, w: 0.45 + 0.65 * h2, ph: h2 * 6.3 })
          }
          MASSES.forEach(([mx, my, r], mi) => {
            const n = Math.round(r * r * 2.2)   // over-attempt; the gates self-select the valid ring
            for (let i = 0; i < n; i++) {
              const h1 = hash(mi * 17.3 + i * 3.1, i * 7.7 + 2)
              const h2 = hash(i * 5.3 + mi, mi * 11.9 + i)
              const ang = h1 * Math.PI * 2
              const dist = r * Math.pow(h2, 0.62)          // denser core, feathered fringe
              const px2 = mx + Math.cos(ang) * dist + (hash(i, mi * 3) - 0.5) * 1.2
              const py2 = my + Math.sin(ang) * dist * 0.92 + (hash(mi, i * 5) - 0.5) * 1.2
              const fringe = dist > r * 0.68
              const pool2 = fringe && h1 > 0.45 ? LOWP : TALLP
              const name = pool2[Math.floor(hash(i * 1.7, mi * 9.1) * pool2.length) % pool2.length]
              put2(name, px2, py2, pool2 === TALLP, hash(i * 2.9, mi * 4.3))
            }
          })
          if (DBG) console.log('[MASSES]', JSON.stringify(rej))
        }
        plantMasses()
        const putPlant = (name: string, px: number, py: number, o: { sc?: number; flip?: boolean; dark?: number; sway?: number; noShadow?: boolean } = {}) => {
          if (!VEG) return                                     // ?veg=0: clean-capture switch
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
          // a TALL trunk may stand near a lip (the c3 palm ranks) but its BASE
          // must sit on its own tile — a base hanging over the riser face reads
          // as floating (Opus review). Pull straddlers to their tile centre
          // instead of rejecting them, so the designed lip ranks survive intact.
          if (TALL.has(name)) {
            const cx4 = Math.round(px), cy4 = Math.round(py)
            if (eLvl(Math.round(px + 0.4), Math.round(py)) !== L2 || eLvl(Math.round(px), Math.round(py + 0.4)) !== L2
              || eLvl(Math.round(px - 0.4), Math.round(py)) !== L2 || eLvl(Math.round(px), Math.round(py - 0.4)) !== L2) {
              px = cx4 + (px - cx4) * 0.2; py = cy4 + (py - cy4) * 0.2
            }
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
          if (!VEG) break                                      // ?veg=0: clean-capture switch
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
        for (let sy = 3; VEG && sy < ROWS - 3; sy += 3) {
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
        // (The open-meadow scatter — lone tufts, boulders, fallen trunks — and the
        // flank's gully tufts are REMOVED, Ash 2026-07-16: "remove all the logs,
        // random shrubs... unnecessary random assets across the island." Only the
        // COMPOSED vegetation stands: the mass groves and their own understory.
        // The meadow between them is clean walkable ground, a place by shape.)

        // ---- THE EAST HARBOR (Phase C1 rebuilt after Ash's "glorious harbor, not
        // some ragdoll port" verdict): a tile-level STRUCTURE from HARBOR data —
        // block columns + flat material tops per tile, painter-sorted exactly like
        // the land itself, with per-tile lift/walk data as the future collision
        // truth. The raised stone quay cuts the waterline, the timber main pier
        // runs seaward, a rock breakwater arm encloses the basin; the bell, crane,
        // lanterns and cargo MOUNT ON the deck; boats ride the basin with foam and
        // bob. No sprite is nudged by eye — every anchor comes from the plan.
        const bobs: { sp: Sprite; y0: number; w: number; ph: number }[] = []
        // THE HARBOR IS BACK (Ash: "move onto a proper beautiful harbor" — the v3
        // build he accepted returns from behind the decor gate, like the forest;
        // ?harbor=0 keeps a clean-capture switch)
        const HARBOR_ON = params.get('harbor') !== '0'
        // ?bigpiece=1 — THE UNIT-OF-ART A/B (2026-07-17): the market pod rendered
        // as ONE whole painted piece (single 400px generation: deck + stalls +
        // goods + lamps + bunting painted together) instead of the composited
        // tile-deck + prop mounts. Same footprint, same camera — the honest test
        // of whether the whole-picture unit clears the eye where the composite
        // never has. When on: the pod's tiles, railing, and props are suppressed
        // and the piece stands in the water on its own painted stilts.
        // THE POD SYSTEM (the A/B verdict, 2026-07-17): every harbor STRUCTURE is
        // ONE painted piece — deck, buildings, goods, lamps and their light
        // painted together at native world scale — standing in the water on its
        // own stilts. The tile system keeps what tiles are good at: the
        // connective walkways, the sea, the contact. ?pods=0 = the old composite.
        // THE SCRATCH HARBOR (Ash 2026-07-17, the final-straw test): the ENTIRE
        // legacy harbor — tile walkways, railings, breakwater, bell, props, the
        // pod stitching — is suppressed. The harbor rebuilds as ONE PICTURE
        // with counted seams: THE GRAND WHARF (one painting), a gangway to the
        // beach, the beacon islet, the ship and boats, and nothing else but
        // water. ?scratch=0 restores the old network for comparison.
        const SCRATCH = params.get('scratch') !== '0'
        const BIGPIECE = !SCRATCH && params.get('pods') !== '0'
        // LEGACYP: the old composite props render ONLY in the full-legacy view
        // (?scratch=0&pods=0) — under scratch the suppressed decks left them
        // floating on open water (the hut-in-the-sea bug)
        const LEGACYP = !BIGPIECE && !SCRATCH
        const hx0 = HARBOR.bollards[1][0]           // pierhead east column
        const PODS: { key: string; x0: number; y0: number; x1: number; y1: number; legs: number; dx: number; dy: number }[] = [
          // dx/dy: the one-time mounting calibration per piece (painted decks
          // aren't perfectly centred/sized in their canvases) — seated to KISS
          // the walk ends, planes matched, then locked
          { key: 'pod-market', x0: HARBOR.root[0] - 2, y0: HARBOR.root[1] - 8, x1: HARBOR.root[0] + 2, y1: HARBOR.root[1] - 5, legs: 48, dx: -6, dy: 16 },
          { key: 'pod-office', x0: HARBOR.root[0], y0: HARBOR.root[1] + 6, x1: HARBOR.root[0] + 3, y1: HARBOR.root[1] + 9, legs: 47, dx: 10, dy: 14 },
          { key: 'pod-pierhead', x0: hx0 - 3, y0: HARBOR.root[1] - 1, x1: hx0, y1: HARBOR.root[1] + 2, legs: 52, dx: -6, dy: 16 },
        ]
        const inMarketPod = (tx: number, ty: number) =>
          BIGPIECE && PODS.some((p) => tx >= p.x0 && tx <= p.x1 && ty >= p.y0 && ty <= p.y1)
        if (HARBOR_ON) try {
          const hb: Record<string, Texture> = {}
          for (const n of ['stone-block-a', 'stone-block-b', 'plank-block-a', 'crane', 'sloop', 'rowboat', 'boathouse', 'panther-statue', 'net-rack', 'beacon', 'deck-top-0', 'deck-top-1', 'deck-top-2', 'deck-top-v5-0', 'deck-top-v5-1', 'deck-top-v5-2', 'riprap-a', 'riprap-b', 'riprap-c', 'bollard-b', 'house-v4', 'house-v5', 'lamp-v4', 'stall-a', 'stall-b', 'stall-a2', 'stall-b2', 'cargo-b', 'cargo-c', 'fishing-boat', 'court-stone-a', 'gate-arch', 'gate-arch2', 'pavilion', 'bunting']) {
            try {
              // BUMP THIS whenever a file is rewritten in place (bg strip, regen
              // under the same name) — a stale cache kept serving the white-panel
              // pavilion long after the disk was clean (Ash saw the old bytes)
              const t: Texture = await Assets.load(`/art/island/harbor/${n}.png?v=7`)
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
            // the ARRIVAL COURT paves with the v6 warm sandstone (the old
            // quay-block's fitted-stone top was itself a checkerboard — 25 tiles
            // of it screamed); one variant, uniform, value-drifted like the planks
            const courtT = hb['court-stone-a']
            const stoneT = courtT ? [topOf(courtT), topOf(courtT)] : [topOf(hb['stone-block-a']), topOf(hb['stone-block-a'])]
            const stoneF = courtT ? faceOf(courtT) : faceOf(hb['stone-block-a'])
            // the deck TOP is the REAL beach-pier wood (Ash: "an actual normal
            // port-wood plank texture brown") — three plank diamonds harvested
            // straight off the approved beach pier's deck, hash-picked per tile,
            // quiet low-frequency drift keeping the run from checkering
            // v5 GOLDEN-BROWN tops (deck_v5.py — Ash's called direction: "a beautiful,
            // golden brown harbor"; the v4 grey was wrong, the v3 orange-brick was wrong)
            const plankTops = [0, 1, 2]
              .map(i => hb[`deck-top-v5-${i}`] ?? hb[`deck-top-${i}`])
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
            for (const ht of SCRATCH ? [] : HARBOR.tiles) {
              if (BIGPIECE && inMarketPod(ht.tx, ht.ty)) continue   // the piece IS the pod
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
                // one material law: STONE stands on a rock footing, TIMBER stands
                // on pilings. (The old near-shore rule gave the plank pods lone
                // rip-rap clumps at their lips — Ash's "dark chunk" glitch.)
                const onRock = ht.mat === 'stone'
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
                  // jittered per tile — identical stamps repeated down the edge
                  // read as one copy-pasted rot patch (reviewer FAIL C)
                  const jr = hash(ht.tx * 4.7 + ox, ht.ty * 6.1 + oy)
                  rf.width = 42 + 20 * jr; rf.height = 10 + 5 * jr
                  rf.alpha = 0.2 + 0.12 * hash(ht.tx * 2.9, ht.ty * 8.3)
                  rf.scale.x *= jr > 0.5 ? -1 : 1
                  rf.tint = 0x0a2a30
                  rf.position.set(isoX(rx, ry2), isoY(rx, ry2) + GY + 2)
                  rf.zIndex = zB + 1
                  world.addChild(rf)
                }
                if (exposed.length && (onRock || ht.mat === 'stone')) {
                  // the shore footing: the shaded face drops to the WATERLINE on sea
                  // edges but only just under the SAND on beach edges (the full-length
                  // face on sand read as a dark board stabbing into the ground)
                  const seaEdge = exposed.some(([ox, oy]) => dsAt(ht.tx + ox, ht.ty + oy) <= 0)
                  const face = new Sprite(ht.mat === 'stone' ? stoneF : plankF)
                  face.anchor.set(0.5, 0)
                  face.position.set(bx2, byTop)
                  const need = ht.lift + (seaEdge ? 32 : 6)
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
                      // rip-rap seats only IN THE WATER — piles shoved onto the dry
                      // beach read as gritty litter at the deck/sand junction
                      if (dsAt(ht.tx + ox, ht.ty + oy) > 0) continue
                      // one low pile pushed OUT past the deck edge into the shallows
                      const jx = ht.tx + ox * 0.5, jy = ht.ty + oy * 0.5
                      const rr = rrF[Math.floor(hash(ht.tx * 5.3 + ox, ht.ty * 7.1 + oy) * rrF.length * 0.999)]
                      const sp = new Sprite(rr)
                      sp.anchor.set(0.5, 1)                       // base sits at the waterline
                      sp.position.set(isoX(jx, jy), isoY(jx, jy) + GY + 9)
                      // cap height to the gap between waterline and deck underside
                      const maxSc = (ht.lift + 18) / rr.height
                      // smaller + lighter than the first pass: the piles massed
                      // into one dark blob at the platform lips (Ash 2026-07-17)
                      const sc2 = Math.min(maxSc, 0.24 + 0.08 * hash(jx * 7.7, jy * 3.9))
                      sp.scale.set((hash(jx, jy) > 0.5 ? -1 : 1) * sc2, sc2)
                      sp.tint = hash(jx + 1, jy + 2) > 0.5 ? 0xc8c0b2 : 0xb2aa9e
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
                if (ht.mat === 'stone') {
                  // the arrival court reads BUILT, not beach: stepped down toward
                  // terracotta (at neutral value the pale sandstone matched the
                  // sand exactly and the bell/arch looked planted on the beach)
                  const dv = 0.95 + 0.09 * vnoise(ht.tx / 5 + 8, ht.ty / 5 + 3)
                  top.tint = (Math.min(255, Math.round(232 * dv)) << 16)
                    | (Math.min(255, Math.round(196 * dv)) << 8)
                    | Math.min(255, Math.round(164 * dv))
                  top.scale.set(1.06)
                }
                if (ht.mat === 'plank') {
                  // quiet LOW-FREQUENCY value drift is ALL the extra variation —
                  // the wood grain itself carries the texture (driftwood lives in
                  // the v4 ASSET now; a multiply tint can't desaturate)
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
                const jf = hash(ht.tx * 3.7 + ox, ht.ty * 5.3 + oy)
                fm.width = 44 + 16 * jf; fm.height = 9 + 4 * jf
                fm.alpha = 0.3 + 0.18 * hash(ht.tx * 7.1, ht.ty * 2.3)
                fm.scale.x *= jf > 0.5 ? -1 : 1
                fm.position.set(isoX(ht.tx + ox * 0.5, ht.ty + oy * 0.5), isoY(ht.tx + ox * 0.5, ht.ty + oy * 0.5) + GY + 4)
                fm.zIndex = Math.max(zB, (ht.tx + ox + ht.ty + oy) * 4000) + 64
                world.addChild(fm)
              }
            }
            // ---- THE RAILING: rope-and-post pacing every visible sea-facing deck
            // edge — the built detail that makes the wharf read as a crafted place
            // instead of planks scattered on the coast. Working faces stay open:
            // the ship's berth (mid-pier south face), the T-head's east loading
            // face, and the whole fishing jetty.
            {
              const rootX = HARBOR.root[0], rootY = HARBOR.root[1]
              const planks = SCRATCH ? [] : HARBOR.tiles.filter((t2) => t2.mat === 'plank' && t2.lift >= 8
                && !(BIGPIECE && inMarketPod(t2.tx, t2.ty)))
              const posts: { sx: number; sy: number; z: number; n: number }[] = []
              for (const ht of planks) {
                if (ht.ty >= rootY + 4) continue                          // the jetty works open
                for (const [ox, oy] of [[1, 0], [0, 1]] as [number, number][]) {
                  const nb = harborAt(ht.tx + ox, ht.ty + oy)
                  if (nb && nb.mat === 'plank' && nb.lift >= 8) continue  // interior edge
                  // the EAST lip is the promenade balustrade — it runs the whole
                  // waterfront (over sand or sea; skipping sand left the wharf
                  // railless wherever the coast bulged). South faces rail only
                  // over water so the beach stays open to walk off.
                  if (oy === 1 && dsAt(ht.tx + ox, ht.ty + oy) > 0) continue
                  // ONLY the ship's actual berth span stays unbounded (reviewer:
                  // every other raised water edge must read bounded) — v6: the
                  // grand pier's south face, the full hull span
                  if (oy === 1 && ht.ty === rootY + 1 && ht.tx >= rootX + 3 && ht.tx <= rootX + 10) continue
                  const jx = ht.tx + ox * 0.42, jy = ht.ty + oy * 0.42
                  const sx = isoX(jx, jy), sy = isoY(jx, jy) + GY - ht.lift + 2
                  const z = (ht.tx + ht.ty) * 4000 + ht.lift * 2 + 716
                  const bT = hb['bollard-b']
                  const post = new Sprite(bT ?? postT)
                  post.anchor.set(0.5, 1)
                  if (bT) post.scale.set(0.24)
                  else { post.width = 7; post.height = 22 }
                  post.position.set(sx, sy)
                  post.zIndex = z
                  world.addChild(post)
                  posts.push({ sx, sy, z, n: 0 })
                }
              }
              // rope sags between neighbouring post tops
              posts.sort((a, b) => a.sy - b.sy || a.sx - b.sx)
              for (let i = 0; i < posts.length; i++) {
                for (let j = i + 1; j < posts.length; j++) {
                  const a = posts[i], b = posts[j]
                  if (a.n >= 2 || b.n >= 2) continue
                  const d = Math.hypot(b.sx - a.sx, b.sy - a.sy)
                  if (d > 44) continue    // adjacent posts only
                  const rope = new Sprite(Texture.WHITE)
                  rope.anchor.set(0, 0.5)
                  rope.width = d; rope.height = 3
                  rope.tint = 0x4e3620; rope.alpha = 0.95
                  rope.position.set(a.sx, a.sy - 18)
                  rope.rotation = Math.atan2(b.sy - a.sy, b.sx - a.sx)
                  rope.zIndex = Math.max(a.z, b.z) + 1
                  world.addChild(rope)
                  a.n++; b.n++
                }
              }
            }
            // ---- the deck mounts: every anchor from the HARBOR plan, lifted to
            // the deck surface, grounded by a tight contact pool at deck z
            const mount = (t: Texture | undefined, at: [number, number], o: { sc?: number; flip?: boolean; glow?: boolean; deck?: boolean; sink?: number } = {}) => {
              if (DBG) {
                const dot = new Sprite(Texture.WHITE)
                dot.tint = t ? 0xffff00 : 0xff0000; dot.width = 24; dot.height = 24; dot.anchor.set(0.5)
                dot.position.set(isoX(at[0], at[1]), isoY(at[0], at[1]) + GY)
                dot.zIndex = 92_000_000
                world.addChild(dot)
              }
              if (!t) return
              // a mount stands at the height of the structure tile UNDER it;
              // sink presses frontal-perspective props a few px INTO the sand so
              // their straight base rails don't read as hovering on the iso ground
              const under = harborAt(Math.round(at[0]), Math.round(at[1]))
              const lift = o.deck === false ? 0 : under?.lift ?? 0
              const bx2 = isoX(at[0], at[1]), by2 = isoY(at[0], at[1]) + GY - lift + 8 + (o.sink ?? 0)
              const zB = Math.floor(at[0] + at[1]) * 4000 + lift * 2
              // one shadow POLICY (reviewer: some props shadowed, others not =
              // inconsistent): slim contact shadows on deck props, a fuller
              // grounded shadow under free-standing sand props
              const sh = new Sprite(shadTex)
              sh.anchor.set(0.4, 0.5)
              const shw = o.deck === false ? 0.72 : 0.62
              sh.width = t.width * (o.sc ?? 1) * shw; sh.height = Math.max(6, t.width * (o.sc ?? 1) * (o.deck === false ? 0.2 : 0.15))
              sh.alpha = o.deck === false ? 0.3 : 0.22
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
            // HARBOR v4 · PHASE 1 (Ash: the old harbor was "crowded... visually ugly"
            // — full rebuild wanted): DECLUTTER + LIGHT first. The crane, shed, sign,
            // stilt-office and net-rack are GONE; what remains is the arrival's
            // essentials — the bell, the lanterns, the beacon, the ship, two boats —
            // with room to breathe. The fresh art kit is phase 2.
            // the arrivals bell ON THE SHORE at the gangway landing (deck:false —
            // it stands on the sand, its own vignette, clear of the arch)
            if (!SCRATCH) mount(pt['bell-frame'], HARBOR.bell, { deck: false, sc: 0.5, sink: 4 })
            // (THE GATEWAY ARCH IS CUT, 2026-07-17: both generations came back
            // FRONTAL — a flat gate spanning a DIAGONAL walkway is impossible
            // geometry and read as the goofiest thing in the frame. Flawless
            // beats cute; the pavilion + bell + stalls carry the composition.)
            // FREIGHT, base-free (Ash 2026-07-16 glitch sweep: cargo-a was pale
            // grey steel out of the island's palette; cargo-b carried a baked-in
            // sandstone slab that double-floored the deck). ONE warm timber
            // stack, two moments: the pierhead yard + the jetty. The third
            // bollard-side stack is gone — it crowded the pierhead.
            const cargoT = hb['cargo-c'] ?? hb['cargo-b'] ?? pt['cargo-a']
            // THE PIERHEAD PAVILION — the port's hero structure (TavernWorld:
            // a focal roof, not a bare deck). Open timber, terracotta + teal,
            // its own hung lanterns; the freight tucks beside its west post.
            const headX = HARBOR.bollards[1][0]   // the pierhead's east column
            if (LEGACYP) {
              mount(hb['pavilion'], [headX - 1.6, HARBOR.root[1] + 0.6], { sc: 0.85, glow: true })
              // ONE freight beat, at the pierhead yard (the second stack sat alone
              // mid-jetty and read as a random crate on the path — restraint wins)
              if (cargoT) mount(cargoT, [headX - 2.7, HARBOR.root[1] + 1.3], { sc: 0.5 })
            }
            for (const L2 of SCRATCH ? [] : HARBOR.lanterns) {
              if (BIGPIECE && inMarketPod(Math.round(L2[0]), Math.round(L2[1]))) continue

              // v4: the new driftwood dock lamp (teal pennant, warm glass) replaces
              // the old lantern-post where it has landed
              mount(hb['lamp-v4'] ?? pt['lantern-post'], L2, { sc: hb['lamp-v4'] ? 0.52 : 0.72, glow: true })
              // v4: each lantern throws a WARM POOL onto the deck — the TavernWorld
              // grammar (warm pools on cool ground) doing the "stunning" work
              const lx = isoX(L2[0], L2[1]), ly = isoY(L2[0], L2[1]) + GY
              const pool2 = new Sprite(foamTex)
              pool2.anchor.set(0.5, 0.5); pool2.blendMode = 'add'
              pool2.tint = 0xffb44e; pool2.width = 120; pool2.height = 56; pool2.alpha = 0.22
              pool2.position.set(lx, ly + 4)
              pool2.zIndex = Math.floor(L2[0] + L2[1]) * 4000 + 620
              world.addChild(pool2)
              glows.push({ sp: pool2, ph: hash(L2[0], L2[1]) * 6, a: 0.2 })
            }
            for (const B of SCRATCH ? [] : HARBOR.bollards) mount(hb['bollard-b'] ?? pt['bollard-a'], B, { sc: hb['bollard-b'] ? 0.2 : 0.34 })
            // mooring posts pace the boardwalk's seaward lip (the beach pier's
            // post rhythm at harbor scale)
            for (const E of SCRATCH ? [] : HARBOR.edgePosts) mount(hb['bollard-b'] ?? pt['bollard-a'], E, { sc: hb['bollard-b'] ? 0.15 : 0.24 })
            // the harbor BEACON at the breakwater tip, its lamp breathing
            if (DBG) {
              const dot = new Sprite(Texture.WHITE)
              dot.tint = hb['beacon'] ? 0x00ff00 : 0xff0000; dot.width = 30; dot.height = 30; dot.anchor.set(0.5)
              dot.position.set(isoX(HARBOR.beacon[0], HARBOR.beacon[1]), isoY(HARBOR.beacon[0], HARBOR.beacon[1]) + GY)
              dot.zIndex = 93_000_000
              world.addChild(dot)
            }
            if (!SCRATCH && hb['beacon']) {
              const at = HARBOR.beacon
              const BSC = 1.32     // the HERO of the harbor — the tall vertical anchor
              // seated IN the sea (+2, was -8 hovering) with a displacement pool
              // + foam collar at its islet base, exactly like the hulls
              const bx2 = isoX(at[0], at[1]), by2 = isoY(at[0], at[1]) + GY + 2
              const zB = Math.floor(at[0] + at[1]) * 4000
              const brf = new Sprite(shadTex); brf.anchor.set(0.5, 0.5)
              brf.width = 130; brf.height = 26; brf.alpha = 0.4; brf.tint = 0x08222a
              brf.position.set(bx2, by2 + 2); brf.zIndex = zB + 600
              world.addChild(brf)
              const bfm = new Sprite(foamTex); bfm.anchor.set(0.5, 0.5)
              bfm.width = 150; bfm.height = 30; bfm.alpha = 0.62
              bfm.position.set(bx2, by2 - 2); bfm.zIndex = zB + 602
              world.addChild(bfm)
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
            // the breakwater sits IN the sea, not on it: a broken foam lace along
            // every rock/water contact — the islet's hard flat cut against the
            // teal read as a pasted sticker (final gate verdict)
            for (const t2 of SCRATCH ? [] : HARBOR.tiles) {
              if (t2.mat !== 'rock') continue
              for (const [ox, oy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as [number, number][]) {
                const nx = Math.round(t2.tx) + ox, ny = Math.round(t2.ty) + oy
                if (harborAt(nx, ny)) continue
                if (dsAt(nx, ny) > 0) continue
                if (hash(nx * 1.3 + ox, ny * 2.7 + oy) > 0.6) continue   // lace, not a ring
                const fx = isoX(t2.tx + ox * 0.5, t2.ty + oy * 0.5)
                const fy = isoY(t2.tx + ox * 0.5, t2.ty + oy * 0.5) + GY + 4
                const foam = new Sprite(foamTex); foam.anchor.set(0.5, 0.5)
                foam.width = 44; foam.height = 20; foam.alpha = 0.42
                foam.position.set(fx, fy)
                foam.zIndex = Math.max(Math.round(t2.tx + t2.ty), nx + ny) * 4000 + 62
                world.addChild(foam)
              }
            }
            // the teal school pennant flies at the pier's T-head
            if (LEGACYP) try {
              const pnT: Texture = await Assets.load('/art/intro/props/pennant.png')
              pnT.source.scaleMode = 'nearest'
              const at = HARBOR.pennant
              const sp = new Sprite(pnT); sp.anchor.set(0.5, 1)
              sp.position.set(isoX(at[0], at[1]), isoY(at[0], at[1]) + GY - 14 + 8)
              sp.scale.set(0.8)   // full-size it out-shouted the pierhead (Ash: out-of-style reads)
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
              const rk = SCRATCH ? undefined : HARBOR.tiles.filter((t2) => t2.mat === 'rock')[2]
              if (rk) {
                const sp = new Sprite(gsT); sp.anchor.set(0.5, 1)
                sp.position.set(isoX(rk.tx, rk.ty), isoY(rk.tx, rk.ty) + GY - 26)
                sp.scale.set(0.8)
                sp.zIndex = Math.floor(rk.tx + rk.ty) * 4000 + 700
                world.addChild(sp)
              }
            } catch { /* gull art optional */ }
            // (inland(), the sand-anchor walker, retired with the settlement-on-
            // sand era — every structure now stands on a stilt-platform pod)
            // the port SETTLEMENT — buildings clustered on the sand behind the
            // quay as one little yard (Ash: the warehouse had drifted far up the
            // beach, orphaned; a port's buildings sit together AT the harbor)
            // spread so no two silhouettes merge: the boathouse stands ON the north
            // annex platform (harbor office on stilts — the sand behind the north
            // walk is too thin for a building), sign alone on clear sand, shed
            // SOUTH, net-rack + hauled rowboat further south
            // v4: ONE well-made harbormaster's house on the sand behind the quay —
            // driftwood walls, teal shutters, its own lantern — instead of the old
            // four competing silhouettes (boathouse/sign/shed/net-rack, all gone)
            // v7: the harbormaster's house stands ON its stilt platform over the
            // water — a stilt-port office, the pod built for exactly this
            // v8: house-v5 is BASE-FREE (v4 baked its own flagstone yard + palm —
            // on the stilt platform the pad double-floored the deck and the palm
            // grew out of the planks: Ash's "halfway into the ground" class)
            if (LEGACYP) mount(hb['house-v5'] ?? hb['house-v4'], deckCtr([HARBOR.root[0] + 2, HARBOR.root[1] + 8]), { sc: hb['house-v5'] ? 0.9 : 0.95 })
            // v5 BUSTLE · the MARKET ROW: two stalls on the sand north of the
            // apron, facing the boardwalk — Thor steps off the pier into a
            // WORKING waterfront (fruit + fish), the house anchoring the south.
            // Same sand-safe inland() anchor as the house so neither stall can
            // drift onto the deck or up the lawn.
            // v7: BOTH stalls own the MARKET PLATFORM pod — a market over the
            // water, one stall behind the other in the cluster grammar, deck
            // tiles flat by construction so nothing can seam-clip
            // v8 stalls are BASE-FREE (the v7 pair carried baked plank podiums
            // with dark skirts — a platform pasted on the platform, Ash's
            // "out-of-style / placed wrongly" read). Mounted DIRECT as one
            // overlapping market CLUSTER (the TavernWorld grammar: goods stalls
            // lean into each other with freight between, never one prop per pod
            // centered by a snap — the interior snap shoved the fruit stall onto
            // the pod's back lip where it hung over the water)
            // v9: BOTH stalls regenerated in STRICT 2:1 iso (the old pair were
            // quasi-frontal — "leaning in weird angles... goofy and glitched",
            // Ash 2026-07-17). Placed on the pod's LONG DIAGONAL — back-right
            // and front-left sit at the same depth row, so two full stalls fit
            // side by side with zero occlusion (stacked overlap made a mutant
            // double-roof; a 5x4 pod has no room for "artful" overlap).
            if (LEGACYP) {
              mount(hb['stall-a2'] ?? hb['stall-a'], [HARBOR.root[0] + 0.9, HARBOR.root[1] - 7.4], { sc: 0.88 })
              mount(hb['stall-b2'] ?? hb['stall-b'], [HARBOR.root[0] - 1.15, HARBOR.root[1] - 5.35], { sc: 0.88, flip: true })
              if (cargoT) mount(cargoT, [HARBOR.root[0] - 1.7, HARBOR.root[1] - 5.3], { sc: 0.42, flip: true })
            }
            // the whole-piece pod: one painted structure standing in the sea,
            // seated like the hulls (displacement pool + foam at its stilts)
            // THE PODS, mounted by measurement: each piece renders at NATIVE
            // scale (the density law — downscaling was the "pasted diorama"
            // seam), its deck-front corner seated on the walk's deck plane by
            // its measured legs constant, its stilts standing in the sea with
            // displacement + foam. No tint beyond a whisper — the palette is
            // in the generation.
            // ---- THE SCRATCH HARBOR COMPOSITION: one wharf painting in open
            // water, a gangway to the beach, the beacon islet — every seam is
            // either the sea (code-owned) or ONE calibrated deck kiss.
            // THE PORT'S ANATOMY (Ash: two masses in open water are "floating
            // boards, not a harbor"): a harbor is a SHAPE — one PIER SPINE
            // running from the beach into the bay, the wharf as its T-head,
            // the annex hung south of the spine, the ship at the outer face.
            // The wharf stands a full pier's reach off the beach.
            // +3.9 (was +5.2): slid the whole frame shoreward so the pier's
            // west tip plants on DRY sand — the pier-wharf tuck is WX-relative
            // and survives the slide untouched
            const WX = HARBOR.root[0] + 3.9, WY = HARBOR.root[1] - 1
            // THE PLATE REGIME (2026-07-17, "scrap out both harbors"): the
            // harbor is now a Pro-inpaint PLATE painted into the live bay.
            // ?plate=0 falls back to the scratch pieces; ?noport=1 renders an
            // EMPTY bay (the capture mode plates are generated against).
            const NOPORT = params.get('noport') === '1'
            const PLATE = !NOPORT && params.get('plate') !== '0'
            // ---- PLATE PILOT (?pilot=1): the Pro-inpaint port, mounted at the
            // exact world position its source crop was captured from (zoom=1,
            // cam=143,105, crop origin screen 740,310 -> world px below). The
            // overlay holds ONLY the painted-changed pixels, so the live sea
            // animates around it. Demo artifact, not the final harbor.
            if (params.get('pilot') === '1') {
              try {
                // v2: structure-only extraction (the naive diff kept the
                // model's subtle water-repaint — the 'tinted sheet' Ash caught)
                const pt: Texture = await Assets.load('/art/island/pilot-port.png?v=2')
                pt.source.scaleMode = 'nearest'
                const ps = new Sprite(pt)
                ps.position.set(740 - 683 + isoX(143, 105), 310 - 384 + isoY(143, 105))
                ps.zIndex = Math.floor((ps.position.y + 430) / 16) * 4000 + 900
                world.addChild(ps)
              } catch { /* pilot art absent */ }
            }
            // ---- THE PLATE HARBOR: one Pro-inpaint painting, composed by the
            // model INTO a live capture of this exact bay (zoom=1 cam=146,77,
            // crop origin screen 520,140 -> world px 2045,3324). The overlay
            // holds only painted-changed pixels: structures, foam, reflections.
            // The sea animates around it; sand and water under it are live.
            // ---- THE PHYSICAL HARBOR: the grid owns the deck. Every walkable
            // tile is authored data (harbor-deck.ts), rendered with kit tiles
            // MINED from the Pro plates — the painted look on engine truth.
            // Objects are registered footprints; collision is tile membership;
            // nothing walkable is a painting.
            if (PLATE) {
              try {
                const kit = async (n: string) => {
                  // v4: stalls restored un-erased (the cool-pass ate its shaded
                  // body and left the awning floating)
                  const t: Texture = await Assets.load(`/art/island/harbor/${n}.png?v=4`)
                  t.source.scaleMode = 'nearest'
                  return t
                }
                const tops = await Promise.all([1, 2, 3, 4, 5].map((i) => kit(`kit/deck-top-${i}`)))
                const faces = await Promise.all([0, 1, 2].map((i) => kit(`kit/edge-face-${i}`)))
                const pilings = await Promise.all([0, 1, 2].map((i) => kit(`kit/piling-${i}`)))
                const bollardT = await kit('bollard-b')
                const lampT = await kit('lamp-v4')
                // deck tiles: top diamond + exposed front skirt + pilings + foam
                for (const [dtx, dty] of DECK_TILES) {
                  const bx2 = isoX(dtx, dty), by2 = isoY(dtx, dty) + GY - DECK_LIFT
                  const row = dtx + dty
                  const top = new Sprite(tops[Math.floor(hash(dtx, dty) * tops.length)])
                  top.anchor.set(0.5, 0.5)
                  top.position.set(bx2, by2)
                  top.zIndex = row * 4000 + 300
                  world.addChild(top)
                  const openE = !DECK_SET.has(deckKey(dtx + 1, dty))
                  const openS = !DECK_SET.has(deckKey(dtx, dty + 1))
                  if (openE || openS) {
                    const face = new Sprite(faces[Math.floor(hash(dty, dtx) * faces.length)])
                    face.anchor.set(0.5, 0)
                    face.position.set(bx2, by2 + 8)
                    face.zIndex = row * 4000 + 320
                    world.addChild(face)
                    // pilings + foam only where the deck stands in the sea
                    if (dsAt(dtx, dty) < 0.4 && hash(dtx * 3, dty * 7) > 0.4) {
                      const pil = new Sprite(pilings[Math.floor(hash(dtx * 5, dty) * pilings.length)])
                      pil.anchor.set(0.5, 0)
                      pil.position.set(bx2, by2 + 22)
                      pil.zIndex = row * 4000 + 315
                      world.addChild(pil)
                      const fmp = new Sprite(foamTex); fmp.anchor.set(0.5, 0.5)
                      fmp.width = 34; fmp.height = 12; fmp.alpha = 0.42
                      fmp.position.set(bx2, by2 + 22 + 68)
                      fmp.zIndex = row * 4000 + 314
                      world.addChild(fmp)
                    }
                    // rim bollards at rhythm (never on lamp tiles)
                    if ((dtx + dty) % 2 === 0 && !DECK_LAMPS.some(([lx2, ly2]) => lx2 === dtx && ly2 === dty)) {
                      const bol = new Sprite(bollardT)
                      bol.anchor.set(0.5, 1)
                      bol.scale.set(0.5)
                      bol.position.set(bx2 + (openE ? 18 : -18), by2 + (openE ? 10 : 10))
                      bol.zIndex = row * 4000 + 1250
                      world.addChild(bol)
                    }
                  }
                }
                // registered objects standing on the deck
                for (const ob of DECK_OBJECTS) {
                  const t = await kit(ob.file)
                  const sp = new Sprite(t)
                  sp.anchor.set(0.5, 1)
                  const cxo = ob.tile[0] + ob.foot[0] / 2 - 0.5, cyo = ob.tile[1] + ob.foot[1] / 2 - 0.5
                  sp.position.set(isoX(cxo, cyo) + ob.ax, isoY(cxo, cyo) + GY - DECK_LIFT + 16 + ob.ay)
                  sp.zIndex = (ob.tile[0] + ob.foot[0] - 1 + ob.tile[1] + ob.foot[1] - 1) * 4000 + 1200
                  world.addChild(sp)
                }
                // rim lamps + breathing glow
                const glowTex = radial(64, [[0, 'rgba(255,196,112,0.9)'], [0.5, 'rgba(255,164,72,0.32)'], [1, 'rgba(255,164,72,0)']])
                const glows: { g: Sprite; a0: number; ph: number }[] = []
                for (const [lx2, ly2] of DECK_LAMPS) {
                  const bx2 = isoX(lx2, ly2), by2 = isoY(lx2, ly2) + GY - DECK_LIFT + 12
                  const lamp = new Sprite(lampT)
                  lamp.anchor.set(0.5, 1)
                  lamp.scale.set(0.62)
                  lamp.position.set(bx2, by2)
                  lamp.zIndex = (lx2 + ly2) * 4000 + 1200
                  world.addChild(lamp)
                  const g = new Sprite(glowTex)
                  g.anchor.set(0.5, 0.5)
                  g.width = 46; g.height = 32
                  g.tint = 0xffb054; g.alpha = 0.34
                  g.blendMode = 'add'
                  g.position.set(bx2, by2 - lampT.height * 0.62 + 10)
                  g.zIndex = 3_000_000 + 10
                  world.addChild(g)
                  glows.push({ g, a0: 0.34, ph: hash(lx2, ly2) * 6.3 })
                }
                app.ticker.add(() => {
                  const t = performance.now() / 1000
                  for (const gl of glows) gl.g.alpha = gl.a0 + Math.sin(t * 1.7 + gl.ph) * 0.07
                })
                // SCENERY (never walkable, physics-free): the breakwater mole
                // plate + the lighthouse standing in open water
                const moleT = await kit('plate-3')
                const mole = new Sprite(moleT)
                mole.position.set(2383, 3700)
                mole.zIndex = 254 * 4000 + 900
                world.addChild(mole)
                const lh = new Sprite(await kit('lighthouse'))
                lh.anchor.set(0.5, 1)
                lh.position.set(2383 + 415, 3700 + 232)
                lh.zIndex = 254 * 4000 + 950
                world.addChild(lh)
                // THOR'S SHIP along the T-head's seaward face, on her lines
                const shipT2: Texture = await Assets.load('/art/intro/port/ship16/v1.png')
                shipT2.source.scaleMode = 'nearest'
                const sbx = isoX(BERTH_SHIP[0], BERTH_SHIP[1]), sby = isoY(BERTH_SHIP[0], BERTH_SHIP[1]) + GY
                const shRf = new Sprite(shadTex); shRf.anchor.set(0.5, 0.5)
                shRf.width = shipT2.width * 0.82; shRf.height = 30; shRf.alpha = 0.5; shRf.tint = 0x06202a
                shRf.position.set(sbx, sby + 7); shRf.zIndex = Math.floor(BERTH_SHIP[0] + BERTH_SHIP[1]) * 4000 + 600
                world.addChild(shRf)
                const shFm = new Sprite(foamTex); shFm.anchor.set(0.5, 0.5)
                shFm.width = shipT2.width; shFm.height = 30; shFm.alpha = 0.6
                shFm.position.set(sbx, sby + 2); shFm.zIndex = Math.floor(BERTH_SHIP[0] + BERTH_SHIP[1]) * 4000 + 602
                world.addChild(shFm)
                const shSp = new Sprite(shipT2); shSp.anchor.set(0.5, 0.86)
                shSp.position.set(sbx, sby)
                shSp.zIndex = Math.floor(BERTH_SHIP[0] + BERTH_SHIP[1]) * 4000 + 900
                world.addChild(shSp)
                bobs.push({ sp: shSp, y0: sby, w: 0.45, ph: 1.7 })
                for (const [mx, my] of [[161.8, 73.0], [161.8, 75.6]] as [number, number][]) {
                  const ax2 = isoX(mx, my), ay2 = isoY(mx, my) + GY - DECK_LIFT + 4
                  const line = new Sprite(Texture.WHITE)
                  line.anchor.set(0, 0.5)
                  line.width = Math.hypot(sbx - 30 - ax2, sby - 26 - ay2); line.height = 2
                  line.tint = 0x3e2c18; line.alpha = 0.85
                  line.position.set(ax2, ay2)
                  line.rotation = Math.atan2(sby - 26 - ay2, sbx - 30 - ax2)
                  line.zIndex = Math.floor(mx + my) * 4000 + 1400
                  world.addChild(line)
                }
                // working boats at the arm's south face (painted hull bobbing)
                const boatT = await kit('obj/p1-boat')
                for (const [mbx, mby] of MOOR_BOATS) {
                  const b = new Sprite(boatT)
                  b.anchor.set(0.5, 0.8)
                  const bx3 = isoX(mbx, mby), by3 = isoY(mbx, mby) + GY
                  b.position.set(bx3, by3)
                  b.zIndex = Math.floor(mbx + mby) * 4000 + 900
                  world.addChild(b)
                  bobs.push({ sp: b, y0: by3, w: 0.5, ph: hash(mbx, mby) * 6.3 })
                }
              } catch (err) { console.error('[harbor] failed', err) }
            }
            if (SCRATCH && !PLATE && !NOPORT) {
              const piece = async (file: string, at: [number, number], o: { legs?: number; foamW?: number; z?: number } = {}) => {
                try {
                  // v3: islet ripple-ring erased, pier-spine landed (bump on every in-place rewrite)
                  const t: Texture = await Assets.load(`/art/island/harbor/${file}.png?v=3`)
                  t.source.scaleMode = 'nearest'
                  const bx2 = isoX(at[0], at[1]), by2 = isoY(at[0], at[1]) + GY + (o.legs ?? 0)
                  const zB = Math.floor(at[0] + at[1]) * 4000 + (o.z ?? 900)
                  const rf = new Sprite(shadTex); rf.anchor.set(0.5, 0.5)
                  rf.width = (o.foamW ?? 280) * 0.94; rf.height = 38; rf.alpha = 0.32; rf.tint = 0x08222a
                  rf.position.set(bx2, by2 - 4); rf.zIndex = zB - 300
                  world.addChild(rf)
                  const fm = new Sprite(foamTex); fm.anchor.set(0.5, 0.5)
                  fm.width = o.foamW ?? 280; fm.height = 40; fm.alpha = 0.48
                  fm.position.set(bx2, by2 - 6); fm.zIndex = zB - 298
                  world.addChild(fm)
                  const sp = new Sprite(t); sp.anchor.set(0.5, 1)
                  sp.position.set(bx2, by2)
                  sp.zIndex = zB
                  world.addChild(sp)
                  return sp
                } catch { return undefined /* piece not on disk yet */ }
              }
              // THE PIER SPINE (z 880): west tip ON the dry sand, the run
              // crossing the surf, its east end tucked UNDER the wharf's west
              // lip — the seam swallowed by the wharf's own edge shadow. The
              // west corridor stays EMPTY so the approach reads at a glance.
              // [-9.1,+0.3] ran PARALLEL to the wharf's NW edge, one street
              // north — +4.5/+4.5 drops it straight down the screen onto the
              // lip (equal +x+y = pure vertical in iso)
              await piece('pier-spine', [WX - 4.6, WY + 4.8], { legs: 6, foamW: 260, z: 880 })
              await piece('wharf-grand', [WX, WY], { legs: 10, foamW: 360 })
              await piece('beacon-islet', HARBOR.beacon as [number, number], { legs: 8, foamW: 190 })
              // the ANNEX stands BEHIND-RIGHT of the wharf (deep-water side),
              // a TRUE water gap between the two masses — at [+3,-3.5] its deck
              // kissed the wharf's east lip with a misaligned plank line
              await piece('wharf-annex', [WX + 4.5, WY - 5.2], { legs: 10, foamW: 300 })
            }
            if (BIGPIECE) for (const pod of PODS) {
              try {
                const bpT: Texture = await Assets.load(`/art/island/harbor/${pod.key}.png?v=1`)
                bpT.source.scaleMode = 'nearest'
                // centre-x and front-corner y derived from the pod's tile rect
                const bx2 = (isoX(pod.x0, pod.y0) + isoX(pod.x1, pod.y1)) / 2 + pod.dx
                const cornerY = isoY(pod.x1 + 0.5, pod.y1 + 0.5) + GY - 12
                const by2 = cornerY + pod.legs + pod.dy
                const zB = (pod.x1 + pod.y1) * 4000
                const rf = new Sprite(shadTex); rf.anchor.set(0.5, 0.5)
                rf.width = 270; rf.height = 36; rf.alpha = 0.32; rf.tint = 0x08222a
                rf.position.set(bx2, by2 - 2); rf.zIndex = zB + 600
                world.addChild(rf)
                const fm = new Sprite(foamTex); fm.anchor.set(0.5, 0.5)
                fm.width = 290; fm.height = 38; fm.alpha = 0.48
                fm.position.set(bx2, by2 - 4); fm.zIndex = zB + 602
                world.addChild(fm)
                const sp = new Sprite(bpT); sp.anchor.set(0.5, 1)
                sp.position.set(bx2, by2)
                sp.zIndex = zB + 900
                world.addChild(sp)
              } catch { /* piece not on disk yet — the pod waits */ }
            }
            // festival bunting strung stall-to-stall — anchored on real posts at
            // both ends (a string hung on nothing is the floating-asset class)
            if (LEGACYP && hb['bunting']) {
              const mLift = harborAt(Math.round(HARBOR.root[0]), Math.round(HARBOR.root[1] - 6))?.lift ?? 0
              const ax = isoX(HARBOR.root[0] - 1.15, HARBOR.root[1] - 5.35)
              const ay = isoY(HARBOR.root[0] - 1.15, HARBOR.root[1] - 5.35) + GY - mLift + 8 - 108
              const bx3 = isoX(HARBOR.root[0] + 0.9, HARBOR.root[1] - 7.4)
              const by3 = isoY(HARBOR.root[0] + 0.9, HARBOR.root[1] - 7.4) + GY - mLift + 8 - 108
              const st = new Sprite(hb['bunting'])
              st.anchor.set(0, 0.32)               // the rope line rides the strip's top
              const d2 = Math.hypot(bx3 - ax, by3 - ay)
              st.position.set(ax + 12, ay)
              st.rotation = Math.atan2(by3 - ay, bx3 - ax)
              st.width = Math.max(40, d2 - 20); st.height = 34
              st.zIndex = Math.floor(HARBOR.root[0] + 1.1 + HARBOR.root[1] - 5.7) * 4000 + 740
              world.addChild(st)
              sways.push({ sp: st, amp: 0.02, w: 1.1, ph: 0.7 })
            }
            // hauled a tile further up-beach: at the plan point the bow still
            // straddled the tide seam (final-sweep catch — neither beached nor
            // afloat reads wrong at every zoom)
            // (-1.1 overshot up-beach onto the GRASS — a hull on the lawn; -0.3
            // keeps the bow clear of the tide seam while staying on dry sand)
            // v6: the esplanade is 2 tiles wider — haul the boat further up-beach
            // so the hull clears the deck's landward lip
            mount(hb['rowboat'], HARBOR.rowboat, { deck: false, sc: 0.8, flip: true, sink: 3 })
            // (The mini-port dressing and the west-cove vignette are REMOVED with
            // the mini-ports themselves — Ash 2026-07-16: "remove... the other
            // ports & unnecessary random assets." One harbor, three wild coasts.)
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
            if (!PLATE && !NOPORT) boat(hb['sloop'], SCRATCH ? [WX + 9, WY - 1.5] : HARBOR.sloop)
            // the second fisher is visibly DISTINCT (a weathered blue-grey hull),
            // not an obvious copy of the first (reviewer: duplicated boats read cheap)
            const sloop2Sp = (!PLATE && !NOPORT) ? boat(hb['sloop'], SCRATCH ? [WX + 1.5, WY + 9.5] : HARBOR.sloop2, 0.82, true) : undefined
            if (sloop2Sp) sloop2Sp.tint = 0x8fb0b8
            // v5 BUSTLE · the FLEET: a port with traffic, not two lonely hulls.
            // The fishing smack (its own silhouette — nets, furled tan sail)
            // rides close in by the wharf; a third sloop stands off the T-head
            // in the deep lane, sun-bleached so the three hulls read as three
            // different working boats
            // v7: the smack ties up along the FLEET SPUR's south face; the
            // bleached third sloop stands off south of the pierhead, both in
            // open water the network leaves visible
            // OUTSIDE the network's pockets: in the inner basin the smack's wide
            // hull rode up onto the fleet spur's deck — "boats sitting halfway on
            // the harbor, noclipping" (Ash 2026-07-17). Open water east of the
            // spur tip; the pierhead sloop stands a full lane off the south face.
            // NW open water — parked behind the wharf at [-6,-4] it hid whole
            // behind the stall canvas
            if (!PLATE && !NOPORT) boat(hb['fishing-boat'], SCRATCH ? [WX - 12, WY - 5] : [HARBOR.sloop[0] + 3, HARBOR.sloop[1] - 3], 0.72)
            const sloop3Sp = (!PLATE && !NOPORT) ? boat(hb['sloop'], SCRATCH ? [WX + 7.4, WY + 4.6] : [HARBOR.pennant[0] - 1.2, HARBOR.pennant[1] + 5.6], 0.7) : undefined
            if (sloop3Sp) sloop3Sp.tint = 0xd8c8a8
            // (scratch: no extra dinghy — the pier-drop buried it under the
            // spine's canvas, and the legacy beached rowboat already reads)
            if (!SCRATCH && !NOPORT) boat(hb['rowboat'], [HARBOR.cargo[1][0] + 2.6, HARBOR.cargo[1][1] + 2.3], 0.6, true)
            // (the rowboat mounts with the settlement above — same sand-safe anchor)
            // THE SHIP HERSELF at the berth — the approved 16-view painted rigger,
            // moored along the main pier's north face, bow seaward (v1 = the +x
            // diagonal). Her mass is what makes the harbor read as a real port.
            // (suppressed under the plate — the plate paints its own moorings;
            // she returns as an open-water anchor once the plate port stands)
            if (!PLATE && !NOPORT) try {
              const shipT: Texture = await Assets.load('/art/intro/port/ship16/v1.png')
              shipT.source.scaleMode = 'nearest'
              // moored at the wharf's south face, east half — the arrival reads
              // against open water at the port's outermost point
              const at = SCRATCH ? [WX + 2, WY + 4] as [number, number] : HARBOR.berth
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
              // MOORED, not parked: two taut lines from bow and stern down to the
              // pier bollards — the physical connection is what sells the berth
              for (const [hx, hy, bx3, by3] of [
                [at[0] - 1.6, at[1] - 0.4, at[0] - 2.1, at[1] - 1.05],
                [at[0] + 1.5, at[1] - 0.3, at[0] + 2.0, at[1] - 1.0],
              ]) {
                const ax = isoX(hx, hy), ay = isoY(hx, hy) + GY - 26
                const bx4 = isoX(bx3, by3), by4 = isoY(bx3, by3) + GY - 8
                const line = new Sprite(Texture.WHITE)
                line.anchor.set(0, 0.5)
                line.width = Math.hypot(bx4 - ax, by4 - ay); line.height = 2
                line.tint = 0x3e2c18; line.alpha = 0.9
                line.position.set(ax, ay)
                line.rotation = Math.atan2(by4 - ay, bx4 - ax)
                line.zIndex = zB + 905
                world.addChild(line)
              }
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
        // (The tawny head-gape gate complex is DELETED, 2026-07-16 — Ash: the black
        // panthers are THE heads; the tawny lion doubling under them was "the old
        // shit". Its one proven idea — anchoring the painted pour's exit pixel on
        // the LAVA polyline's first tile — lives on in the black heads' pours.)

        // ---- P3: THE JOURNEY INWARD dressing — the POWER steles pacing the
        // approach, living fire braziers on the plaza + gate forecourt, and the
        // stepping-stone ford where the promenade crosses the river.
        if (DECOR && !NOCONE) {                                // fresh base: no POI dressing
          try {
            const stA: Texture = await Assets.load('/art/island/poi/stele-a.png')
            const stB: Texture = await Assets.load('/art/island/poi/stele-b.png')
            const brA: Texture = await Assets.load('/art/island/poi/brazier-a.png')
            const brB: Texture = await Assets.load('/art/island/poi/brazier-b.png')
            for (const t of [stA, stB, brA, brB]) t.source.scaleMode = 'nearest'
            // FLAT SNAP (the Opus reviews' #1 systemic finding): a standing prop
            // whose anchor lands ON a terrace lip hangs over the riser face and
            // reads as floating no matter how good its shadow is. Snap every
            // stele/brazier to the nearest tile whose whole 3x3 neighbourhood
            // shares one level — inset from every lip BY CONSTRUCTION.
            const flatSnap = (at: [number, number], r = 3): [number, number] => {
              const cx3 = Math.round(at[0]), cy3 = Math.round(at[1])
              // a flat tile also stands CLEAR of the melt: near the channel the
              // r=3 spiral could come up empty and the raw fallback parked a
              // stele half over the lava lip (Opus #8) — the char band is never
              // a place to plant a monument
              const flat = (tx3: number, ty3: number) => {
                const L = eLvl(tx3, ty3)
                if (L <= 0) return false
                if (lavaDist(tx3, ty3) < 2.1) return false
                for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++)
                  if (eLvl(tx3 + ox, ty3 + oy) !== L) return false
                return true
              }
              if (flat(cx3, cy3)) return at
              for (const rr of [r, r + 3]) {
                let best: [number, number] | null = null, bd3 = 1e9
                for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
                  if (!flat(cx3 + dx, cy3 + dy)) continue
                  const d = dx * dx + dy * dy
                  if (d < bd3) { bd3 = d; best = [cx3 + dx, cy3 + dy] }
                }
                if (best) return best
              }
              return at
            }
            const place = (t: Texture, rawAt: [number, number], sc: number, flip = false) => {
              const at = flatSnap(rawAt)
              const lift2 = liftOf(eLvl(Math.round(at[0]), Math.round(at[1])))
              const bx2 = isoX(at[0], at[1]), by2 = isoY(at[0], at[1]) + GY - lift2 + 8
              const zB = Math.floor(at[0] + at[1]) * 4000 + lift2 * 2
              // heavier grounding than the harbor props: a monument must feel
              // WEIGHTED (final verdict: steles read inserted, not planted)
              const sh = new Sprite(shadTex); sh.anchor.set(0.4, 0.5)
              sh.width = t.width * sc * 0.98; sh.height = t.width * sc * 0.28
              sh.alpha = 0.38; sh.position.set(bx2 + 4, by2 - 2); sh.zIndex = zB + 7
              world.addChild(sh)
              const sp = new Sprite(t); sp.anchor.set(0.5, 1)
              sp.position.set(bx2, by2)
              sp.scale.set((flip ? -1 : 1) * sc, sc)
              sp.zIndex = zB + 720
              world.addChild(sp)
              return { bx2, by2, zB, hpx: t.height * sc }
            }
            // THE STELES WALK: five POWER markers pacing the approach — the two
            // carvings alternate, scale + flip vary so no pair reads stamped
            STELES.forEach((s, i) => {
              const m = place(i % 2 ? stB : stA, s, 0.88 + 0.05 * (i % 3), i % 3 === 1)
              // the carved emblem breathes ember light
              const g = new Sprite(foamTex); g.anchor.set(0.5, 0.5); g.blendMode = 'add'
              g.tint = 0xffa040; g.width = 34; g.height = 26; g.alpha = 0.26
              g.position.set(m.bx2, m.by2 - m.hpx * 0.66)
              g.zIndex = m.zB + 724
              world.addChild(g)
              glows.push({ sp: g, ph: i * 1.3, a: 0.26 })
            })
            // LIVING FIRE: braziers pacing the plaza rim + flanking the tongue base
            const fire = (at: [number, number], v: 0 | 1, flip = false) => {
              const m = place(v ? brB : brA, at, 0.72, flip)
              const core = new Sprite(foamTex); core.anchor.set(0.5, 0.5); core.blendMode = 'add'
              core.tint = 0xffc860; core.width = 30; core.height = 38; core.alpha = 0.5
              core.position.set(m.bx2, m.by2 - m.hpx * 0.78); core.zIndex = m.zB + 726
              world.addChild(core)
              glows.push({ sp: core, ph: hash(at[0], at[1]) * 6.3, a: 0.5 })
              const halo = new Sprite(foamTex); halo.anchor.set(0.5, 0.5); halo.blendMode = 'add'
              halo.tint = 0xff8a30; halo.width = 110; halo.height = 60; halo.alpha = 0.2
              halo.position.set(m.bx2, m.by2 - 6); halo.zIndex = m.zB + 8
              world.addChild(halo)
              glows.push({ sp: halo, ph: hash(at[1], at[0]) * 6.3 + 1.7, a: 0.2 })
            }
            for (let i = 0; i < 4; i++) {
              const a = Math.PI * 0.25 + (i * Math.PI) / 2
              fire([PLAZA[0] + Math.cos(a) * (PLAZA_R - 0.6), PLAZA[1] + Math.sin(a) * (PLAZA_R - 0.6)], (i % 2) as 0 | 1, i > 1)
            }
            // the gate forecourt pair flanks the tongue's base, lighting the climb
            if (TONGUE.length > 1) {
              const [b0, b1] = [TONGUE[0], TONGUE[1]]
              const dl = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) || 1
              const px2 = -(b1[1] - b0[1]) / dl, py2 = (b1[0] - b0[0]) / dl
              fire([b0[0] + px2 * 1.7, b0[1] + py2 * 1.7], 0)
              fire([b0[0] - px2 * 1.7, b0[1] - py2 * 1.7], 1, true)
            }
            // THE COURT'S HEART: the panther on its stone plinth — the school's
            // own icon holding the gathering place (the ring of fire finally
            // reads as FOR something; the statue was in the kit, never mounted)
            try {
              const statT: Texture = await Assets.load('/art/island/harbor/panther-statue.png')
              statT.source.scaleMode = 'nearest'
              place(statT, [PLAZA[0], PLAZA[1]], 1.05)
            } catch { /* statue optional */ }
            // THE FORD: three worn stepping stones carrying the promenade across
            // the river (the walkmap's one river crossing — audit-proven).
            // FLAT SLABS, not rubble: riprap's jagged cone silhouette stacked
            // into "a dark pile plugging the mouth" (Opus + probe agreed) — a
            // stepping stone is a worn flat top, so it uses the quay stone's
            // own top diamond.
            try {
              const blkT: Texture = await Assets.load('/art/island/harbor/stone-block-a.png')
              blkT.source.scaleMode = 'nearest'
              const rkT = new Texture({ source: blkT.source, frame: new Rectangle(0, 0, 64, 36) })
              // the stones stand IN the actual rasterized water (snapping to the
              // polyline beached them on dry sand — the chain wanders ~a tile)
              let fx3 = FORD[0], fy3 = FORD[1], bd2 = 99
              for (const k of riverInfo.keys()) {
                const tx3 = k % COLS, ty3 = Math.floor(k / COLS)
                const d = Math.hypot(tx3 - FORD[0], ty3 - FORD[1])
                if (d < bd2) { bd2 = d; fx3 = tx3; fy3 = ty3 }
              }
              // crossing direction = perpendicular to the local river run
              let dir: [number, number] = [1, 0]
              {
                const rv3 = riverInfo.get(fy3 * COLS + fx3)
                if (rv3 && (rv3.ddir[0] || rv3.ddir[1])) {
                  const dl2 = Math.hypot(rv3.ddir[0], rv3.ddir[1])
                  dir = [-rv3.ddir[1] / dl2, rv3.ddir[0] / dl2]
                }
              }
              for (const k of [-1.05, 0, 1.05]) {
                const at: [number, number] = [fx3 + dir[0] * k, fy3 + dir[1] * k]
                const lift2 = liftOf(eLvl(Math.round(at[0]), Math.round(at[1])))
                const sp = new Sprite(rkT); sp.anchor.set(0.5, 0.55)
                sp.position.set(isoX(at[0], at[1]), isoY(at[0], at[1]) + GY - lift2 + 4)
                sp.tint = 0xd9c9ae   // warm worn stone, not the breakwater's cold navy
                // stepping stones, not boulders: at 0.34 the riprap cones
                // overlapped into one dark rubble lump plugging the mouth (probed)
                sp.scale.set(0.42 + 0.04 * hash(k * 3.1, 2.2))
                sp.zIndex = Math.floor(at[0] + at[1]) * 4000 + lift2 * 2 + 640
                world.addChild(sp)
                const rf2 = new Sprite(foamTex); rf2.anchor.set(0.5, 0.5)
                rf2.width = 30; rf2.height = 12; rf2.alpha = 0.5
                rf2.position.set(isoX(at[0], at[1]), isoY(at[0], at[1]) + GY - lift2 + 7)
                rf2.zIndex = Math.floor(at[0] + at[1]) * 4000 + lift2 * 2 + 634
                world.addChild(rf2)
              }
              // THE SPRING'S ROCK COLLAR: a broken ring of mother rock on the
              // uphill side of the source pool — the river visibly rises from
              // UNDER the mountain's stone, not from open grass
              const rbT: Texture = await Assets.load('/art/island/harbor/riprap-b.png')
              rbT.source.scaleMode = 'nearest'
              {
                const [spx, spy] = RIVER[0]
                for (const [ox, oy, s3, fl] of [[-0.9, -0.5, 0.3, false], [0.7, -0.9, 0.26, true], [-0.15, -1.15, 0.22, false]] as [number, number, number, boolean][]) {
                  const rx3 = spx + ox, ry3 = spy + oy
                  const rlf = liftOf(eLvl(Math.round(rx3), Math.round(ry3)))
                  const sp3 = new Sprite(rbT); sp3.anchor.set(0.5, 0.78)
                  sp3.position.set(isoX(rx3, ry3), isoY(rx3, ry3) + GY - rlf + 4)
                  sp3.tint = 0xcdb9a4
                  sp3.scale.set((fl ? -1 : 1) * s3, s3)
                  sp3.zIndex = (Math.round(rx3) + Math.round(ry3)) * 4000 + rlf * 2 + 700
                  world.addChild(sp3)
                }
              }
              // THE TIDEPOOLS (Z11's hidden find): rock-rimmed basins holding
              // still sea water on the tide flat — a quiet discovery for the
              // player who walks the far shore, not a monument. The POI existed
              // as bare data; now the place exists.
              {
                const [tpx, tpy] = TIDEPOOLS
                const pools: [number, number, number][] = [[0, 0, 1], [1.7, 1.1, 0.7], [-1.3, 1.5, 0.5]]
                for (const [ox, oy, s4] of pools) {
                  const px4 = tpx + ox, py4 = tpy + oy
                  const bx4 = isoX(px4, py4), by4 = isoY(px4, py4) + GY
                  const zB4 = (Math.round(px4) + Math.round(py4)) * 4000
                  // the read is built dark-to-light: wet ring, deep held water,
                  // bright shallows, one live glint — the first soft-wash pass
                  // vanished into the bright sand and read as debris specks
                  const wet = new Sprite(shadTex); wet.anchor.set(0.5, 0.5)
                  wet.width = 110 * s4; wet.height = 50 * s4; wet.alpha = 0.5; wet.tint = 0x0e2a30
                  wet.position.set(bx4, by4 + 2); wet.zIndex = zB4 + 40
                  world.addChild(wet)
                  const deep = new Sprite(shadTex); deep.anchor.set(0.5, 0.5)
                  deep.width = 74 * s4; deep.height = 33 * s4; deep.alpha = 0.9; deep.tint = 0x3aa89c
                  deep.position.set(bx4, by4 + 1); deep.zIndex = zB4 + 42
                  world.addChild(deep)
                  const wtr = new Sprite(foamTex); wtr.anchor.set(0.5, 0.5)
                  wtr.width = 52 * s4; wtr.height = 22 * s4; wtr.alpha = 0.7; wtr.tint = 0x7ce4d4
                  wtr.position.set(bx4 - 2 * s4, by4); wtr.zIndex = zB4 + 43
                  world.addChild(wtr)
                  const gl = new Sprite(foamTex); gl.anchor.set(0.5, 0.5); gl.blendMode = 'add'
                  gl.width = 30 * s4; gl.height = 12 * s4; gl.alpha = 0.34; gl.tint = 0xd9fff2
                  gl.position.set(bx4 - 6 * s4, by4 - 2); gl.zIndex = zB4 + 44
                  world.addChild(gl)
                  glows.push({ sp: gl, ph: hash(px4, py4) * 6.3, a: 0.34 })
                  const n4 = 6 + Math.round(s4 * 2)
                  for (let i4 = 0; i4 < n4; i4++) {
                    const a4 = (i4 / n4) * Math.PI * 2 + hash(px4 + i4, py4) * 0.7
                    if (hash(i4 * 3.3, px4) > 0.85) continue        // the ring stays broken
                    const rx4 = bx4 + Math.cos(a4) * 38 * s4
                    const ry4 = by4 + Math.sin(a4) * 17 * s4 + 1
                    // pale worn slabs carry the rim (riprap's dark navy can't be
                    // tint-lifted and read as black spikes); one jagged accent
                    // rock per ring keeps it natural
                    const spike = hash(i4 * 2.9, py4 * 1.3) > 0.8
                    const rk4 = new Sprite(spike ? rbT : rkT); rk4.anchor.set(0.5, spike ? 0.8 : 0.6)
                    const rs4 = s4 * (spike ? 0.17 : 0.3 + 0.08 * hash(i4, py4))
                    rk4.scale.set((hash(i4 * 1.7, px4) > 0.5 ? -1 : 1) * rs4, rs4)
                    rk4.tint = spike ? 0xa7b5b0 : 0xd8c9ae
                    rk4.position.set(rx4, ry4)
                    rk4.zIndex = zB4 + 46 + (ry4 > by4 ? 4 : 0)
                    world.addChild(rk4)
                  }
                }
              }
              // THE WEST OVERLOOK (Z9's vista): two worn sitting stones facing
              // the west head across the flow — the quiet counterpart to the
              // gate's roar. A vista POI with nothing standing at it read as a
              // lie on the map (the tidepools' own lesson).
              {
                const [ovx, ovy] = WEST_OVERLOOK
                // 0.62/0.5 (was 0.4/0.32): at 26px the pale slabs melted into
                // the sunlit grass entirely (probe-found, invisible on screen)
                for (const [ox, oy, s5, fl] of [[0, 0, 0.62, false], [1.2, 0.6, 0.5, true]] as [number, number, number, boolean][]) {
                  const rx5 = ovx + ox, ry5 = ovy + oy
                  const rlf = liftOf(eLvl(Math.round(rx5), Math.round(ry5)))
                  const zB5 = (Math.round(rx5) + Math.round(ry5)) * 4000 + rlf * 2
                  const sh5 = new Sprite(shadTex); sh5.anchor.set(0.5, 0.5)
                  sh5.width = 78 * s5; sh5.height = 30 * s5; sh5.alpha = 0.3
                  sh5.position.set(isoX(rx5, ry5) + 2, isoY(rx5, ry5) + GY - rlf + 5)
                  sh5.zIndex = zB5 + 696
                  world.addChild(sh5)
                  const sp5 = new Sprite(rkT); sp5.anchor.set(0.5, 0.6)
                  sp5.position.set(isoX(rx5, ry5), isoY(rx5, ry5) + GY - rlf + 4)
                  sp5.tint = 0xbfae94
                  sp5.scale.set((fl ? -1 : 1) * s5, s5)
                  sp5.zIndex = zB5 + 700
                  world.addChild(sp5)
                }
              }
            } catch { /* ford stones optional */ }
            // THE TONGUE-STAIR is a MATERIAL now (stairInfo, computed before the
            // tile loop) — here only the maw light pooling down the climb's top
            {
              const [mx2, my2] = TONGUE[TONGUE.length - 1]
              const lfM = liftOf(eLvl(Math.round(mx2), Math.round(my2)))
              const spill = new Sprite(foamTex); spill.anchor.set(0.5, 0.5); spill.blendMode = 'add'
              spill.tint = 0xff8a30; spill.width = 170; spill.height = 84; spill.alpha = 0.22
              spill.position.set(isoX(mx2, my2), isoY(mx2, my2) + GY - lfM - 8)
              spill.zIndex = (Math.round(mx2) + Math.round(my2)) * 4000 + lfM * 2 + 410
              world.addChild(spill)
              glows.push({ sp: spill, ph: 1.1, a: 0.22 })
            }
          } catch { /* POI art optional until it lands */ }
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
          // a steam BANK, not two wisps: at map zoom the quench read as a hard
          // orange band simply stopping at the teal (the final gate verdict's
          // recurring immersion-killer) — four spread puffs + a breathing sea-
          // contact glow make the collision an EVENT
          for (let i = 0; i < 4; i++) {
            const sp = new Sprite(steamTex); sp.anchor.set(0.5, 0.5)
            sp.position.set(isoX(ex, ey2) + (i - 1.5) * 18, isoY(ex, ey2) + GY - (i % 2) * 6)
            sp.zIndex = (ex + ey2 + 2) * 4000 + 900
            world.addChild(sp)
            puffs.push({ sp, ph: i * 1.7 + ex * 0.1, spd: 0.55 + 0.22 * hash(ex + i, ey2), big: false })
          }
          const qg = new Sprite(foamTex); qg.anchor.set(0.5, 0.5); qg.blendMode = 'add'
          qg.tint = 0xff9040; qg.width = 130; qg.height = 56; qg.alpha = 0.34
          qg.position.set(isoX(ex, ey2), isoY(ex, ey2) + GY + 2)
          qg.zIndex = (ex + ey2 + 2) * 4000 + 880
          world.addChild(qg)
          glows.push({ sp: qg, ph: hash(ex, ey2) * 6.3, a: 0.32 })
        }
        // falls mist: two cool wisps hanging over the river's big drop
        if (DECOR && !NOCONE && RIVER.length) {
          const fl = liftOf(eLvl(Math.round(FALLS[0]), Math.round(FALLS[1])))
          for (let i = 0; i < 2; i++) {
            const sp = new Sprite(steamTex); sp.anchor.set(0.5, 0.5)
            sp.tint = 0xe8fff8
            sp.position.set(isoX(FALLS[0], FALLS[1]) + i * 14, isoY(FALLS[0], FALLS[1]) + GY - fl - 8)
            sp.zIndex = (Math.round(FALLS[0]) + Math.round(FALLS[1]) + 2) * 4000 + 900
            world.addChild(sp)
            puffs.push({ sp, ph: 1.4 + i * 2.9, spd: 0.5 + 0.2 * i, big: false })
          }
        }
        // THE QUENCH (Ash: the trail "bleeds into the ocean"): where each flow
        // meets the sea — a cooling basalt fan half in the water, the molten
        // core's contact glow breathing against it, a foam arc where the sea
        // fights back. The flows now END past the waterline (hub-layout extends
        // the tails), so this is the thread's final beat: mouth -> flank ->
        // delta -> sea.
        if (!NOCONE) {
          try {
            const rrQ: Texture[] = []
            for (const n of ['riprap-a', 'riprap-b', 'riprap-c']) {
              const t = await Assets.load(`/art/island/harbor/${n}.png`)
              t.source.scaleMode = 'nearest'
              rrQ.push(t)
            }
            for (const line of LAVA) {
              const [ex, ey2] = line[line.length - 1]
              const bx2 = isoX(ex, ey2), by2 = isoY(ex, ey2) + GY
              const zQ = Math.floor(ex + ey2) * 4000
              // the dark basalt pool spreading under the contact
              const pool = new Sprite(shadTex); pool.anchor.set(0.5, 0.5)
              pool.width = 150; pool.height = 42; pool.alpha = 0.45; pool.tint = 0x14100e
              pool.position.set(bx2, by2 + 4); pool.zIndex = zQ + 580
              world.addChild(pool)
              // the cooled fan: charcoal rocks half-sunk where the flow froze
              for (let i = 0; i < 4; i++) {
                const jx = ex + (hash(ex * 3.1 + i, ey2 * 1.7) - 0.5) * 2.4
                const jy = ey2 + (hash(ex * 1.3, ey2 * 4.9 + i) - 0.5) * 1.6
                const rk = new Sprite(rrQ[i % 3]); rk.anchor.set(0.5, 0.78)
                const sc2 = 0.3 + 0.2 * hash(jx, jy + i)
                rk.scale.set((hash(jx + i, jy) > 0.5 ? -1 : 1) * sc2, sc2)
                rk.tint = i % 2 === 0 ? 0x3a2e30 : 0x4a3a38
                rk.position.set(isoX(jx, jy), isoY(jx, jy) + GY + 4)
                rk.zIndex = zQ + 590 + i
                world.addChild(rk)
              }
              // the molten core's contact glow, breathing against the rocks
              const gq = new Sprite(foamTex); gq.anchor.set(0.5, 0.5); gq.blendMode = 'add'
              gq.tint = 0xff6a1e; gq.width = 110; gq.height = 44; gq.alpha = 0.4
              gq.position.set(bx2, by2); gq.zIndex = zQ + 600
              world.addChild(gq)
              glows.push({ sp: gq, ph: hash(ex, ey2) * 6, a: 0.42 })
              // the sea fighting back: a bright foam arc around the fan
              const fq = new Sprite(foamTex); fq.anchor.set(0.5, 0.5)
              fq.width = 170; fq.height = 40; fq.alpha = 0.5
              fq.position.set(bx2 + 8, by2 + 8); fq.zIndex = zQ + 585
              world.addChild(fq)
            }
          } catch { /* quench dressing is optional */ }
        }
        const steamBase = puffs.map((p) => ({ x: p.sp.x, y: p.sp.y }))

        // THE LAVA LIVES (Ash: "the entire lava thing animated awesomely" —
        // sprite-space only, shaders banned): molten SURGES ride each river from
        // the mouth to the sea, EMBERS rise off the melt and die in the air, and
        // each maw drops GOBBETS down its fall onto a flickering strike pool —
        // constant motion across the mouth->river seam is what fuses the two.
        const pulseTex = radial(40, [[0, 'rgba(255,232,170,0.9)'], [0.5, 'rgba(255,150,60,0.5)'], [1, 'rgba(255,120,40,0)']])
        type FlowPt = { x: number; y: number; z: number }
        const flowPaths: FlowPt[][] = []
        for (const line of NOCONE ? [] : LAVA) {
          const pts: FlowPt[] = []
          let reachedSea = false
          for (let i = 0; i < line.length - 1 && !reachedSea; i++) {
            const [x0, y0] = line[i], [x1, y1] = line[i + 1]
            const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.4))
            for (let s = 0; s < n; s++) {
              const x = x0 + ((x1 - x0) * s) / n, y = y0 + ((y1 - y0) * s) / n
              // the moving overlays END where the molten TILES end: the beach is
              // the SAND branch (charred delta tint), so the bright river stops at
              // the first sea-level tile — a waterline clip still left the vein
              // running naked over the delta as a rigid bar (Ash, circled twice)
              if (eLvl(Math.round(x), Math.round(y)) <= 0) { reachedSea = true; break }
              const lf = liftOf(eLvl(Math.round(x), Math.round(y)))
              pts.push({ x: isoX(x, y), y: isoY(x, y) + GY - lf, z: Math.floor(x + y) * 4000 + lf * 2 + 40 })
            }
          }
          if (pts.length > 1) flowPaths.push(pts)
        }
        // THE CONTINUOUS STREAM (Ash: "continuous flow, not broken chunks"): a
        // scrolling molten vein laid ALONG each flow path — TilingSprite segments
        // following the terrain-corrected polyline, texture streaming downstream at
        // one coherent speed. The tile lava beneath carries the body and the banks;
        // this carries the MOTION and fuses the whole run into one moving river.
        const streamSegs: { sp: TilingSprite; spd: number }[] = []
        // the vein streams the river's OWN molten strip (Ash 2026-07-16: the
        // orange-tinted ROCK texture it scrolled before "looks pretty cheap and
        // bad") — same material as the maw cascades, one speed, one body
        if (stripH) {
          for (let pi = 0; pi < flowPaths.length; pi++) {
            const path = flowPaths[pi]
            // SEGN 5 (was 9): the long straight segments cut the doglegs and the
            // molten texture painted over the green bank tops at every bend
            const SEGN = 5
            for (let i = 0; i + 2 < path.length; i += SEGN - 1) {
              const a = path[i], b = path[Math.min(path.length - 1, i + SEGN)]
              const len = Math.hypot(b.x - a.x, b.y - a.y)
              if (len < 8) continue
              // the birth GUSHES: widest at the jaw (i=0), tapering to the run's
              // steady vein over the first ~2 segments — the slope-following pour
              const hgt = 26 + 22 * Math.max(0, 1 - i / 18)
              const seg = new TilingSprite({ texture: stripH, width: len + 10, height: hgt })
              seg.anchor.set(0, 0.5)
              seg.position.set(a.x, a.y)
              seg.rotation = Math.atan2(b.y - a.y, b.x - a.x)
              seg.alpha = 0.82
              seg.tileScale.set(0.9, hgt / 40)
              // +2 rows: the fronting bench tiles were drawing OVER the vein at every
              // lip — the exact dark breaks Ash called "broken chunks"
              seg.zIndex = Math.max(a.z, b.z) + 8000 + 18
              world.addChild(seg)
              streamSegs.push({ sp: seg, spd: 40 + 10 * hash(pi, i) })
            }
          }
        }
        // hot tongues + drifting crust plates all move at ONE coherent slow
        // current speed — mixed fast speeds read as sparkle, one speed reads
        // as a flowing surface. Dark plates riding the current are the
        // strongest "this surface moves" cue.
        const surges: { sp: Sprite; path: FlowPt[]; u0: number; spd: number }[] = []
        for (let pi = 0; pi < flowPaths.length; pi++) {
          for (let k = 0; k < 5; k++) {
            const sp = new Sprite(pulseTex); sp.anchor.set(0.5, 0.5); sp.blendMode = 'add'
            // slimmer + calmer than the first pass (116/0.34 strobed — "cheap")
            sp.width = 92; sp.height = 20
            world.addChild(sp)
            surges.push({ sp, path: flowPaths[pi], u0: k / 5 + hash(pi * 3.1, k * 1.7) * 0.1, spd: 0.016 + 0.004 * (k % 2) })
          }
        }
        const plates: { sp: Sprite; path: FlowPt[]; u0: number; spd: number; jx: number }[] = []
        for (let pi = 0; pi < flowPaths.length; pi++) {
          for (let k = 0; k < 8; k++) {
            const sp = new Sprite(pulseTex); sp.anchor.set(0.5, 0.5)
            sp.tint = 0x241610
            sp.width = 18 + 16 * hash(k * 1.9, pi * 5.7)
            sp.height = 9 + 6 * hash(k * 4.1, pi * 2.3)
            world.addChild(sp)
            plates.push({
              sp, path: flowPaths[pi], u0: k / 8 + hash(pi, k * 2.7) * 0.09,
              spd: 0.014 + 0.006 * hash(k * 3.3, pi * 1.1),
              jx: (hash(k * 7.1, pi * 4.3) - 0.5) * 22,
            })
          }
        }
        const embers: { sp: Sprite; hx: number; hy: number; z: number; ph: number; spd: number }[] = []
        for (let pi = 0; pi < flowPaths.length; pi++) {
          const path = flowPaths[pi]
          for (let k = 0; k < 12; k++) {
            const p = path[Math.floor(hash(pi * 7.7, k * 3.3) * path.length) % path.length]
            const sp = new Sprite(pulseTex); sp.anchor.set(0.5, 0.5); sp.blendMode = 'add'
            const d = 6 + 5 * hash(k, pi)
            sp.width = d; sp.height = d
            sp.tint = 0xffc06a
            world.addChild(sp)
            embers.push({
              sp, hx: p.x + (hash(k * 1.3, pi) - 0.5) * 44, hy: p.y, z: p.z + 60,
              ph: hash(pi, k) * 7, spd: 0.2 + 0.18 * hash(k * 2.1, pi * 1.7),
            })
          }
        }
        // the maw gobbets + strike pools (the mouth->river fuse)
        const gobbets: { sp: Sprite; x: number; yTop: number; yBot: number; ph: number; spd: number }[] = []
        for (const m of NOCONE ? [] : [MOUTH_R, MOUTH_L]) {
          const lf = liftOf(eLvl(Math.round(m[0]), Math.round(m[1])))
          const sx2 = isoX(m[0], m[1]), sy2 = isoY(m[0], m[1]) + GY - lf
          const zM = (Math.round(m[0]) + Math.round(m[1])) * 4000 + lf * 2 + 790
          // the strike BLOOM sells the fuse: the painted tongue and the tile
          // river are two styles, and the seam between them hides under a
          // white-hot core + a wide ember wash (Opus: the pour "hard-cuts"
          // into the tiles — the bloom is the dissolve between the two)
          const pool = new Sprite(pulseTex); pool.anchor.set(0.5, 0.5); pool.blendMode = 'add'
          pool.width = 118; pool.height = 54; pool.alpha = 0.62
          pool.position.set(sx2, sy2 + 2); pool.zIndex = zM
          world.addChild(pool)
          glows.push({ sp: pool, ph: hash(m[0], m[1]) * 6.3, a: 0.58 })
          const hot = new Sprite(pulseTex); hot.anchor.set(0.5, 0.5); hot.blendMode = 'add'
          hot.width = 52; hot.height = 24; hot.alpha = 0.85; hot.tint = 0xfff2d8
          hot.position.set(sx2, sy2 + 1); hot.zIndex = zM + 2
          world.addChild(hot)
          glows.push({ sp: hot, ph: hash(m[1], m[0]) * 6.3 + 2.1, a: 0.8 })
          // gobbets fall from the carved maw's height — the heads ship with the
          // base now (un-gated 2026-07-16), so their falling melt does too.
          for (let k = 0; k < 3; k++) {
            const sp = new Sprite(pulseTex); sp.anchor.set(0.5, 0.5); sp.blendMode = 'add'
            sp.width = 8; sp.height = 12
            sp.zIndex = zM + 6
            world.addChild(sp)
            gobbets.push({ sp, x: sx2 + (k - 1) * 5, yTop: sy2 - 138, yBot: sy2 - 2, ph: k / 3, spd: 0.55 + 0.18 * k })
          }
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

        // ---- P0 · THE BAND PARTITION: regroup every built land sprite into its
        // diagonal band by the depth its zIndex already encodes. Total draw order is
        // IDENTICAL (containers sort by band start, sprites by their old zIndex inside),
        // but the ticker can now cull whole bands instead of pushing 30k+ off-screen
        // sprites through the renderer every frame. Snapshot first: reparenting and
        // band creation both mutate world.children.
        {
          // movers travel ACROSS bands while they animate (surge tongues ride the whole
          // flow) — banding one would cull it by its birth position. They stay global.
          const movers = new Set<unknown>(
            [...surges, ...plates, ...embers, ...gobbets].map((o) => o.sp))
          const built = world.children.slice()
          for (const c of built) {
            if (c === seaLayer || movers.has(c)) continue
            if (c.zIndex >= 3_000_000) continue      // sky layer + coords scaffold stay global
            bandFor(c.zIndex).addChild(c)
          }
        }
        // ---- P0 · FAR-ZOOM BAKE: at map zooms the whole island is in frame, so band
        // culling saves nothing and ~30k static sprites drown the frame (measured 10fps).
        // The static land bakes ONCE into a single island-sized RenderTexture at screen
        // resolution (~600px wide at 0.07); animated ground sprites (the lava flipbook,
        // the breathing glows) hop back to world and stay LIVE on top, so the far view
        // keeps its molten life. Play zooms skip this and run on culled live bands.
        let landBaked = false
        if (ZOOM < 0.35) {
          // every ticker-animated sprite hops back to world FIRST — it must stay live
          // (and must NOT be in the bake: additive glows would double). Nothing is ever
          // destroyed: the ticker keeps valid references no matter what animates later.
          const animated = new Set<unknown>([
            ...lavaFlow.map((l) => l.sp), ...glows.map((g) => g.sp), ...puffs.map((p) => p.sp),
            ...sways.map((s) => s.sp), ...bobs.map((b) => b.sp), ...flyers.map((f) => f.sp),
            ...pourSheets.map((s) => s.sp), ...pourPulses.map((p) => p.sp),
            ...streamSegs.map((s) => s.sp),
          ])
          for (const b of bands) if (b) for (const c of b.children.slice()) if (animated.has(c)) world.addChild(c)
          // measure, then render each band into ONE island texture in diagonal order
          // (the same painter order the live sort produces), bands left in place
          let mnX = 1e9, mnY = 1e9, mxX = -1e9, mxY = -1e9
          for (const b of bands) {
            if (!b || !b.children.length) continue
            const r = b.getLocalBounds()
            mnX = Math.min(mnX, r.minX); mnY = Math.min(mnY, r.minY)
            mxX = Math.max(mxX, r.maxX); mxY = Math.max(mxY, r.maxY)
          }
          if (mnX < mxX) {
            const RES = Math.max(ZOOM, 0.05)
            const rt = RenderTexture.create({ width: Math.ceil((mxX - mnX) * RES), height: Math.ceil((mxY - mnY) * RES) })
            const tf = new Matrix(RES, 0, 0, RES, -mnX * RES, -mnY * RES)
            let first = true
            for (const b of bands) {
              if (!b || !b.children.length) continue
              app.renderer.render({ container: b, target: rt, clear: first, transform: tf })
              first = false
              b.visible = false
            }
            const bakeSp = new Sprite(rt)
            bakeSp.scale.set(1 / RES)
            bakeSp.position.set(mnX, mnY)
            bakeSp.zIndex = -0.5   // above the sea (-1), under every live sprite
            world.addChild(bakeSp)
            landBaked = true
          }
        }

        // band visibility: content at diagonal D spans screen-y [D*HH - maxLift, D*HH + GY],
        // so a band is visible when its diagonal range intersects the viewport y-range
        // widened by the tallest lift (the summit pokes ~26 diagonals up-screen).
        const cullBands = () => {
          if (landBaked) return
          const y0 = (0 - world.y) / ZOOM, y1 = (app.screen.height - world.y) / ZOOM
          const b0 = Math.floor((y0 / HH - 4) / BANDW), b1 = Math.floor((y1 / HH + 30) / BANDW)
          for (let b = 0; b < bands.length; b++) {
            const c = bands[b]
            if (c) c.visible = b >= b0 && b <= b1
          }
        }

        // ---- P0 · THE VAST VIRTUAL SEA: open ocean everywhere dsAt<0, out to WORLD_R.
        // The pool draws only the tiles the viewport can see; far zooms step to block
        // sprites (2x/4x/8x tiles) — the micro-texture is subpixel there and the depth
        // ramp + patch drift carry the read. Every sprite's look is a pure function of
        // its tile, so refills are pixel-stable as the camera moves.
        // TWO sea containers: per-frame tint churn (animSwells) dirties a container's
        // whole batch, so the animated swell ring lives apart from the static field —
        // the big static batch uploads once and stays cached (this was the 16fps:
        // one container meant every frame re-batched every sea sprite). The live ring
        // tightens at far zoom, where per-tile shimmer is subpixel anyway.
        const seaLive = new Container()
        seaLive.zIndex = -0.9
        seaLive.sortableChildren = true
        world.addChild(seaLive)
        const seaPool: Sprite[] = []       // static field pool (seaLayer)
        const seaPoolL: Sprite[] = []      // animated ring pool (seaLive)
        refreshSea = () => {
          const vw = app.screen.width, vh = app.screen.height
          const blk = ZOOM >= 0.5 ? 1 : ZOOM >= 0.24 ? 2 : ZOOM >= 0.11 ? 4 : 8
          const liveD = ZOOM < 0.35 ? 14 : DEPTH_RANGE + 12
          // unproject the viewport corners (sea sits at lift 0 — pure 2:1 math)
          const wx0 = (0 - world.x) / ZOOM, wx1 = (vw - world.x) / ZOOM
          const wy0 = (0 - world.y) / ZOOM, wy1 = (vh - world.y) / ZOOM
          const txMin = Math.floor((wx0 / HW + wy0 / HH) / 2) - blk * 2
          const txMax = Math.ceil((wx1 / HW + wy1 / HH) / 2) + blk * 2
          const tyMin = Math.floor((wy0 / HH - wx1 / HW) / 2) - blk * 2
          const tyMax = Math.ceil((wy1 / HH - wx0 / HW) / 2) + blk * 2
          waterS.length = 0
          let used = 0, usedL = 0
          const place = (px: number, py: number, pd: number, pb: number) => {
            const live = pd > -liveD
            let sp: Sprite
            if (live) {
              sp = seaPoolL[usedL] ?? (seaPoolL[usedL] = seaLive.addChild(new Sprite()))
            } else {
              sp = seaPool[used] ?? (seaPool[used] = seaLayer.addChild(new Sprite()))
            }
            const m = configSeaTile(sp, px, py, pd, waterV, undefined, pb)
            if (!m) { sp.visible = false; return }
            // the cone's cast shadow falls onto the lagoon too (c3's teal shadow pool):
            // fold it into the swell base so the animation never resets it away
            const sk = castShadowK(px, py)
            if (sk > 0.02) { m.base = shadeHex(m.base, 1 - 0.22 * sk); sp.tint = m.base }
            sp.visible = true
            if (live) { waterS.push(m); usedL++ } else used++
          }
          const t0x = Math.floor(txMin / blk) * blk, t0y = Math.floor(tyMin / blk) * blk
          for (let by2 = t0y; by2 <= tyMax; by2 += blk) {
            for (let bx2 = t0x; bx2 <= txMax; bx2 += blk) {
              const mx = bx2 + (blk - 1) / 2, my = by2 + (blk - 1) / 2
              const ddx = mx - CX, ddy = my - CY
              if (ddx * ddx + ddy * ddy > WORLD_R * WORLD_R) continue
              const dsC = dsAt(mx, my)
              if (dsC > blk * 1.5 + 1) continue                 // fully land
              if (blk === 1) { if (dsC <= 0) place(mx, my, dsC, 1); continue }
              // the abyss is flat-ramped — big blocks are invisible there. The steep
              // ramp ring must stay fine or its value steps staircase at block scale.
              if (dsC < -(DEPTH_RANGE + blk * 1.5)) { place(mx, my, dsC, blk); continue }
              // ramp ring / shoreline: resolve at fine grain so the coast + depth ramp
              // keep their exact per-tile edges (2x inside the ring at far zooms)
              const fine = dsC < -(blk * 1.5 + 1) && blk >= 4 ? 2 : 1
              for (let ty2 = by2; ty2 < by2 + blk; ty2 += fine) {
                for (let tx2 = bx2; tx2 < bx2 + blk; tx2 += fine) {
                  const fx2 = tx2 + (fine - 1) / 2, fy2 = ty2 + (fine - 1) / 2
                  const d2 = dsAt(fx2, fy2)
                  if (d2 <= 0) place(fx2, fy2, d2, fine)
                }
              }
            }
          }
          for (let i = used; i < seaPool.length; i++) seaPool[i].visible = false
          for (let i = usedL; i < seaPoolL.length; i++) seaPoolL[i].visible = false
        }
        refreshSea()
        cullBands()

        app.ticker.add(() => {
          const t = performance.now() / 1000
          cullBands()
          animSwells(waterS, t, () => 0)
          // ember pulse: slow independent breathing per core tile
          for (const g of glows) g.sp.alpha = g.a * (0.72 + 0.28 * Math.sin(t * 1.3 + g.ph))
          // the mouth pours fall: each gob rides its sheet top→bottom and wraps,
          // fading in at the jaw and out at the splash
          for (const p of pourPulses) {
            const u = (t * p.spd + p.ph) % 1
            p.sp.y = p.y0 + u * p.h
            p.sp.alpha = 0.55 * Math.min(1, u * 4) * Math.min(1, (1 - u) * 3)
          }
          // the stream veins run DOWNSTREAM: +x in each segment's local frame points
          // a→b along the path — the first sign (-x) played the river backwards (Ash)
          for (const s of streamSegs) s.sp.tilePosition.x = (t * s.spd) % 4096
          // the maw cascades pour DOWN: the molten strip streams from the dark
          // of the mouth onto the channel head, forever
          for (const s of pourSheets) s.sp.tilePosition.y = (t * s.spd) % 4096
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
          // THE SURFACE FLOWS: molten tile art cycles with a downstream-keyed
          // phase — the churn pattern itself travels mouth->sea
          for (const lf2 of lavaFlow) {
            const n = lf2.pool.length
            if (n > 1) lf2.sp.texture = lf2.pool[((Math.floor(t * 1.4 - lf2.off * 1.3) % n) + n) % n]
          }
          // hot tongues glide downstream at the current's speed
          for (const s2 of surges) {
            const u = (t * s2.spd + s2.u0) % 1
            const f = u * (s2.path.length - 1)
            const i0 = Math.floor(f), fr = f - i0
            const p0 = s2.path[i0], p1 = s2.path[Math.min(i0 + 1, s2.path.length - 1)]
            s2.sp.position.set(p0.x + (p1.x - p0.x) * fr, p0.y + (p1.y - p0.y) * fr)
            s2.sp.zIndex = p0.z
            s2.sp.rotation = Math.atan2(p1.y - p0.y, p1.x - p0.x)
            s2.sp.alpha = 0.24 * Math.min(1, u * 5, (1 - u) * 5)
          }
          // dark crust plates ride the same current (bulk material in motion)
          for (const pl2 of plates) {
            const u = (t * pl2.spd + pl2.u0) % 1
            const f = u * (pl2.path.length - 1)
            const i0 = Math.floor(f), fr = f - i0
            const p0 = pl2.path[i0], p1 = pl2.path[Math.min(i0 + 1, pl2.path.length - 1)]
            pl2.sp.position.set(p0.x + (p1.x - p0.x) * fr + pl2.jx, p0.y + (p1.y - p0.y) * fr)
            pl2.sp.zIndex = p0.z + 14
            pl2.sp.alpha = 0.8 * Math.min(1, u * 6, (1 - u) * 6)
          }
          // embers pop off the melt, drift downwind, die in the air
          for (const e of embers) {
            const u = (t * e.spd + e.ph) % 1
            e.sp.position.set(e.hx + Math.sin(t * 1.6 + e.ph * 9) * 5 + u * 12, e.hy - u * 44)
            e.sp.zIndex = e.z
            e.sp.alpha = 0.72 * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85)
          }
          // gobbets accelerate down the maw-fall onto the strike pool, stretching
          for (const g2 of gobbets) {
            const u = (t * g2.spd + g2.ph) % 1
            g2.sp.position.set(g2.x, g2.yTop + (g2.yBot - g2.yTop) * u * u)
            g2.sp.height = 12 + u * 14
            g2.sp.alpha = 0.75 * (u < 0.1 ? u / 0.1 : 1)
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
        refreshSea()   // a grown viewport needs more pooled ocean under it
      }
      resizeFx()
      app.renderer.on('resize', resizeFx)

      app.ticker.add(() => {
        const wt = performance.now() / 1000
        animSwells(waterSprites, wt, () => 0)
      })

      // ---- WALKABLE THOR (default ON; ?walk=0 for the free camera) ----
      // The BeachIso walk system adapted to the island: land = signed coast
      // distance, lava and river block (fords pass), the harbor DECKS are
      // walkable world-px quads with a lift, structures collide as circles.
      // Thor's row z interleaves between the decomposed harbor objects — he
      // walks BEHIND the hall and IN FRONT of the pilings.
      const WALK = params.get('noport') !== '1' && params.get('walk') !== '0'
      ;(window as any).__walk = 'flag=' + WALK
      if (WALK) try {
        const dirs8 = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']
        const dirFromAngle = (dx: number, dy: number) => {
          const a = Math.atan2(dy, dx) * 180 / Math.PI
          if (a >= -22.5 && a < 22.5) return 'east'
          if (a >= 22.5 && a < 67.5) return 'south-east'
          if (a >= 67.5 && a < 112.5) return 'south'
          if (a >= 112.5 && a < 157.5) return 'south-west'
          if (a >= -67.5 && a < -22.5) return 'north-east'
          if (a >= -112.5 && a < -67.5) return 'north'
          if (a >= -157.5 && a < -112.5) return 'north-west'
          return 'west'
        }
        const walkT: Record<string, Texture[]> = {}
        await Promise.all(dirs8.map(async (d) => {
          walkT[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`)))
          for (const t of walkT[d]) t.source.scaleMode = 'nearest'
        }))
        // GRID TRUTH: deck membership and footprint blocks are tile data
        // (harbor-deck.ts) — no quads, no fitted circles on the deck. The
        // water rule itself is the rim collision: stepping off an exposed
        // edge lands on a sea tile and the sea says no.
        const COLL: [number, number, number][] = [
          [2798, 3928, 18], [2540, 4010, 76], [2690, 3952, 56],   // lighthouse + mole rocks (scenery)
        ]
        const surfAt = (tx: number, ty: number): { ok: boolean; lift: number } => {
          const rtx = Math.round(tx), rty = Math.round(ty)
          const k = deckKey(rtx, rty)
          if (BLOCKED.has(k)) return { ok: false, lift: 0 }
          if (DECK_SET.has(k)) return { ok: true, lift: DECK_LIFT }
          const fx = isoX(tx, ty), fy = isoY(tx, ty) + GYG
          for (const [cx2, cy2, cr] of COLL) if (Math.hypot(fx - cx2, fy - cy2) < cr) return { ok: false, lift: 0 }
          if (dsAt(tx, ty) < 0.4) return { ok: false, lift: 0 }                       // sea
          if (lavaDist(tx, ty) < 1.5 && crossingD(tx, ty) > 2.2) return { ok: false, lift: 0 }
          if (riverD(tx, ty) < 1.3 && crossingD(tx, ty) > 2.2) return { ok: false, lift: 0 }
          // the LV lattice is integer-indexed — float coords read undefined
          const il = eLvlG(Math.round(tx), Math.round(ty))
          if (il >= 3) return { ok: false, lift: 0 }                                  // the cone
          return { ok: true, lift: Math.max(0, il) * STEP }
        }
        ;(window as any).__probe = (tx: number, ty: number) => {
          const rtx = Math.round(tx), rty = Math.round(ty)
          return JSON.stringify({
            deck: DECK_SET.has(deckKey(rtx, rty)), blocked: BLOCKED.has(deckKey(rtx, rty)),
            ds: Number(dsAt(tx, ty).toFixed(2)), ok: surfAt(tx, ty),
          })
        }
        const keys: Record<string, boolean> = {}
        const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
        const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }
        window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
        const pos = { tx: 141.5, ty: 77 }     // the sand approach west of the quay
        let facing = 'south-east', animT = 0
        const thor = new Sprite(walkT[facing][0])
        thor.anchor.set(0.5, 1)
        // the plates' scale is set by the palms (~230px) — Thor's native walk
        // frames read child-size against a two-story hall; 1.2 seats him as
        // the hero: taller than the painted vendors, right against the doors
        thor.scale.set(1.2)
        world.addChild(thor)
        ;(window as any).__thorSp = thor
        // test hook: place Thor at a tile (rejects unwalkable targets) — the
        // proof harness can't rely on realtime keys under a throttled rAF
        ;(window as any).__warp = (wtx: number, wty: number) => {
          if (!surfAt(wtx, wty).ok) return 'unwalkable'
          pos.tx = wtx; pos.ty = wty
          return 'ok ' + wtx + ',' + wty
        }
        const SPEED = 3.6
        app.ticker.add((tk) => {
          const dt = Math.min(tk.deltaMS, 50) / 1000
          let dx = 0, dy = 0
          if (keys['arrowup'] || keys['w']) { dx -= 1; dy -= 1 }
          if (keys['arrowdown'] || keys['s']) { dx += 1; dy += 1 }
          if (keys['arrowleft'] || keys['a']) { dx -= 1; dy += 1 }
          if (keys['arrowright'] || keys['d']) { dx += 1; dy -= 1 }
          const moving = dx !== 0 || dy !== 0
          if (moving) {
            const m = Math.hypot(dx, dy); dx /= m; dy /= m
            const nx = pos.tx + dx * SPEED * dt, ny = pos.ty + dy * SPEED * dt
            if (surfAt(nx, ny).ok) { pos.tx = nx; pos.ty = ny }
            else if (surfAt(nx, pos.ty).ok) { pos.tx = nx }
            else if (surfAt(pos.tx, ny).ok) { pos.ty = ny }
            else (window as any).__walkDbg = `blocked nx=${nx.toFixed(2)},${ny.toFixed(2)} dt=${dt.toFixed(4)}`
            facing = dirFromAngle(isoX(dx, dy), (dx + dy) * 16)
            animT += dt * 9
          } else animT = 0
          const fr = moving ? walkT[facing][1 + (Math.floor(animT) % 5)] : walkT[facing][0]
          if (thor.texture !== fr) thor.texture = fr
          const s = surfAt(pos.tx, pos.ty)
          thor.position.set(isoX(pos.tx, pos.ty), isoY(pos.tx, pos.ty) + GYG - s.lift)
          thor.zIndex = Math.floor(pos.tx + pos.ty) * 4000 + 1500
          // camera follows with an easing tail
          const cx3 = app.screen.width / 2 - isoX(pos.tx, pos.ty) * ZOOM
          const cy3 = app.screen.height * 0.5 - isoY(pos.tx, pos.ty) * ZOOM
          world.x += (cx3 - world.x) * 0.10
          world.y += (cy3 - world.y) * 0.10
          ;(window as any).__walk = `thor ${pos.tx.toFixed(1)},${pos.ty.toFixed(1)} z${thor.zIndex} ${thor.texture ? 'tex' : 'NOTEX'}`
        })
      } catch (err) { console.error('[walk] failed', err); (window as any).__walk = 'ERR ' + String(err) }

      // capture-harness handshake: the verdict screenshots must never race the
      // scene build (headless software-GL takes seconds longer than a real GPU)
      ;(window as any).__sceneReady = true
    }

    ;(window as any).__sceneReady = false
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
