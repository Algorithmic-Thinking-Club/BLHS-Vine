import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import {
  isoX, isoY, hash, vnoise, shadeHex, rampAt, tintFor,
  loadWaterVariants, configSeaTile, animSwells, type SwellSprite, HW, HH, DEPTH_RANGE,
} from '../../ocean'
import {
  CX, CY, GRID, SEA_R, coastDs, coastR, shelfW, lagoonK, cliffK,
  plateauD, SUMMIT, summitLvl, KNOLL, cragD, ISLETS,
} from './atc-terrain'
import {
  DOCK, dockAt, pathD, vegK, GROVES, SHADOW,
  STEPS, ANNEX,
  FEATURE_PALM, ROOM_FERNS, ROOM_BOXES, ROOM_PALMS, cableD,
  TERMINAL, TERMINAL_SEAM, FORECOURT, FRAG_A, FRAG_B, JUNCTION, CABLE_RUNS,
} from './atc-layout'
import { getPois, getSeams } from './atc-mechanics'
import { reportAtcAudit } from './atc-audit'

// THE ATC GRAPE ISLAND RENDERER (Session B's lane — file-disjoint sibling of
// IslandMapIso.tsx, SAME construction language: flat blended 64x36 tops on the
// 64x32 lattice, full 64x64 BLOCK COLUMNS on every real drop (the hub's "3D
// tile unit" — never cropped, painter order does the masking), the shared
// virtual sea, the LOCKED golden-hour stack). Dev route: ?scene=atc.
// Spec: docs/place-specs/atc-grape-island.md.

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
}
// the hub's exact golden-hour sun rake (+1 sunlit upper-left, −1 shade)
const rakeAt = (tx: number, ty: number) => {
  const up = (CX + CY) - (tx + ty)
  const left = (ty - tx)
  const r = (up * 0.8 + left * 0.45) / 26 // 26: the small island reaches full rake at its edges
  return r / (1 + Math.abs(r))
}
// THE CAST SHADOW FIELD (the hub's P2, the summit as caster): a soft wedge
// thrown down-sun of the summit (sun az 2.85 → shadow az 2.85−π), wandering
// edge, fading with distance — shared by meadow, sand and (later) the sea.
const castShadowK = (tx: number, ty: number) => {
  const dxs = tx - SUMMIT.x, dys = ty - SUMMIT.y
  const dc = Math.hypot(dxs, dys)
  if (dc < 5 || dc > 36) return 0
  const azT = Math.atan2(dys, dxs)
  const rel = azT - (2.85 - Math.PI)
  const dAz = Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel)))
    + (vnoise(tx / 7 + 41, ty / 7 + 8) - 0.5) * 0.16
  return smooth(0.52, 0.18, dAz) * smooth(32, 14, dc)
}
const clampB = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
// the hub's sunset split: warm the lit side toward gold, cool the shade violet
const warmCool = (hex: number, rk: number) => {
  let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255
  if (rk >= 0) { const t = rk * 0.15; r += (255 - r) * t; g += (222 - g) * t * 0.55; b -= b * t * 0.18 }
  else { const t = -rk * 0.17; r -= r * t * 0.12; g -= g * t * 0.04; b += (205 - b) * t * 0.32 }
  return (clampB(Math.round(r)) << 16) | (clampB(Math.round(g)) << 8) | clampB(Math.round(b))
}
// the hub's exact material ramps — one world, one skin
const SAND_BASE = [246, 229, 180]
const SAND_RAMP: [number, number][] = [[0, 0xdcbf87], [0.45, 0xead6a3], [1, 0xf7ecc2]]
const GRASS_BASE = [126, 158, 96]
const GRASS_RAMP: [number, number][] = [[0, 0xbcc468], [0.5, 0x9cb058], [1, 0x6f8c42]]
const tint24 = (r: number, g: number, b: number) =>
  (Math.min(255, Math.round(r * 255)) << 16) | (Math.min(255, Math.round(g * 255)) << 8) | Math.min(255, Math.round(b * 255))

// the sailing sea's depth profile — the hub's approved mapping on OUR shelf data
function dsAt(tx: number, ty: number) {
  const ds = coastDs(tx, ty)
  if (ds >= 0) return ds
  const w = shelfW(tx, ty)
  const c = -ds
  let cEff = c <= w ? c * (3.5 / w) : 3.5 + (c - w)
  const fade = 1 - smooth(w, w * 1.4, c)
  cEff += Math.max(0, vnoise(tx / 4.5 + 7, ty / 4.5 + 9) - 0.58) * lagoonK(tx, ty) * 6 * fade
  if (cEff <= 18) return -cEff
  if (cEff <= 40) return -(18 + (cEff - 18) * 0.27)
  return -Math.min(30, 24 + (cEff - 40) * 0.2)
}

// LAND↔SEA LATTICE ALIGNMENT (the hub's GY): the water sprites anchor at
// (0.5, 0.25) so their diamond centres sit ~14px below isoY; flat land tops
// anchor centred — without this drop the landmass floats over the sea lattice
const GY = 14

export default function AtcIslandIso() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let destroyed = false
    let instance: Application | null = null

    const start = async () => {
      const app = new Application()
      await app.init({ background: '#073442', resizeTo: host, antialias: false })
      if (destroyed) { app.destroy(true); return }
      instance = app
      host.appendChild(app.canvas)

      const params = new URLSearchParams(location.search)
      const ZOOM = Number(params.get('zoom') || 0.62) || 0.62
      const cam = (params.get('cam') || `${CX + 2},${CY + 1}`).split(',').map(Number)
      const camTx = cam[0] ?? CX, camTy = cam[1] ?? CY
      // THE HUB'S LEVEL LANGUAGE (rebuild 2026-07-16): coast benches step at
      // STEP px; summit levels above the plateau rise CSTEP px so the shoulder
      // reads as a continuous slope, not stacked cliffs (the hub's cone fix)
      const STEP = Number(params.get('step') || 20)
      const CSTEP = Number(params.get('cstep') || 10)
      const PLAT_L = 3
      const liftOf = (l: number) =>
        l <= 0 ? 0 : Math.min(l, PLAT_L) * STEP + Math.max(0, l - PLAT_L) * CSTEP
      const SOCKETS = params.get('sockets') !== '0' // honest placeholder markers (default ON)
      const DBG = !!params.get('dbg')

      // THE PAINTED-BLOCK WORLD (the beach's lesson, 2026-07-16): the ground
      // is PAINTED ART shown at full strength — whole blocks3 blocks (tufty
      // top + drawn side in one image), modulated at most ±6%, never re-hued.
      // The old flat-diamond + computed-tint pipeline vector-flattened the
      // painted family down to a lime wash; it is gone.
      const gB: Texture[] = []   // grass blocks (riser face crops)
      let sB: Texture | undefined // sand block (step treads)
      const rockN: Texture[] = [] // normalized bare-rock tops (crag/point/skerries)
      const sideW: Texture[] = [] // rock-N-side: stone courses (cliff faces)
      const volcW: Texture[] = [] // volc-N-side: the DARK courses (shaded cliffs, skerries)
      let waterV: Texture[] = []
      const deckT: Texture[] = []
      let plankB: Texture | undefined
      // the approved beach/hub vegetation kit (REUSE is the law — §14.1's ring)
      const vegT: Record<string, Texture> = {}
      const VEG_FILES = ['coco-v1', 'coco-v2', 'coco-v3', 'palm-a', 'palm-b', 'bush-a', 'bush-b', 'fernclump-1', 'boulder-1', 'boulder-2']
      // the room's own prop kit (PixelLab, filed under /art/atc-island/props)
      const propT: Record<string, Texture> = {}
      const PROP_FILES = ['terminal', 'frag-door', 'frag-board', 'annex-rack', 'dock-crate', 'lighthouse', 'boxes']
      const nl = (t: Texture) => { t.source.scaleMode = 'nearest'; return t }
      // the flat melt-families: painted diamonds MADE to tile seamlessly —
      // interior ground, shown near-raw (the tint crush is what killed them)
      const flatG: Texture[] = [], flatS: Texture[] = []
      await Promise.all([
        loadWaterVariants().then((v) => { waterV = v }),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/flat/grass-${i}.png?v=7`).then((t: Texture) => { flatG[i] = nl(t) }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/flat/sand-${i}.png?v=7`).then((t: Texture) => { flatS[i] = nl(t) }).catch(() => {})),
        ...[1, 2, 3].map((i) => Assets.load(`/art/island/blocks3/grass-${i}.png`).then((t: Texture) => { gB[i - 1] = nl(t) }).catch(() => {})),
        Assets.load('/art/island/blocks3/sand-1.png').then((t: Texture) => { sB = nl(t) }).catch(() => {}),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/rock-n/${i}.png`).then((t: Texture) => { rockN[i] = nl(t) }).catch(() => {})),
        ...[2, 3, 4, 5].map((i) => Assets.load(`/art/island/blocks3/rock-${i}-side.png`).then((t: Texture) => { sideW.push(nl(t)) }).catch(() => {})),
        ...[2, 3, 4, 5].map((i) => Assets.load(`/art/island/blocks3/volc-${i}-side.png`).then((t: Texture) => { volcW.push(nl(t)) }).catch(() => {})),
        ...Array.from({ length: 3 }, (_, i) => Assets.load(`/art/island/harbor/deck-top-${i}.png`).then((t: Texture) => { deckT[i] = nl(t) }).catch(() => {})),
        Assets.load('/art/island/harbor/plank-block-a.png').then((t: Texture) => { plankB = nl(t) }).catch(() => {}),
        ...VEG_FILES.map((n) => Assets.load(`/art/island/veg/${n}.png`).then((t: Texture) => { vegT[n] = nl(t) }).catch(() => {})),
        ...PROP_FILES.map((n) => Assets.load(`/art/atc-island/props/${n}.png`).then((t: Texture) => { propT[n] = nl(t) }).catch(() => {})),
      ])
      if (destroyed) return
      // the mechanical gate: every socket must be reachable from the dock as
      // DATA before any pixel is judged (harbor lesson — audit before art)
      reportAtcAudit()

      const world = new Container()
      world.scale.set(ZOOM)
      world.sortableChildren = true
      app.stage.addChild(world)
      world.x = app.screen.width / 2 - isoX(camTx, camTy) * ZOOM
      world.y = app.screen.height * 0.5 - isoY(camTx, camTy) * ZOOM
      world.boundsArea = new Rectangle(-20000, -9000, 40000, 24000)

      const seaLayer = new Container()
      seaLayer.zIndex = -1
      seaLayer.sortableChildren = true
      world.addChild(seaLayer)

      // dev probe (the hub's own): name every sprite under a screen point —
      // the only honest way to identify a mystery pixel
      ;(window as unknown as Record<string, unknown>).__app = app
      ;(window as unknown as Record<string, unknown>).__probe = (sx2: number, sy2: number) => {
        const hits: string[] = []
        const scan = (c: Container) => {
          for (const ch of c.children) {
            const s = ch as Sprite
            if ((s as unknown as Container).children?.length) scan(s as unknown as Container)
            if (!s.getBounds) continue
            const b = s.getBounds()
            if (sx2 >= b.x && sx2 <= b.x + b.width && sy2 >= b.y && sy2 <= b.y + b.height) {
              const src = (s.texture?.source as unknown as { label?: string })?.label ?? 'canvas'
              hits.push(`${src} z=${s.zIndex} w=${Math.round(s.width)} h=${Math.round(s.height)} tint=${s.tint?.toString(16)}`)
            }
          }
        }
        scan(world)
        return hits.slice(-14)
      }

      // GOLDEN HOUR — the LOCKED grade, copied exactly from the hub. Never tuned here.
      const grade = new ColorMatrixFilter()
      grade.brightness(1.02, false); grade.saturate(0.22, true); grade.contrast(0.09, true)
      const wm = grade.matrix; wm[0] *= 1.12; wm[6] *= 1.02; wm[12] *= 0.88; grade.matrix = wm
      world.filters = [grade]

      // ---- THE LEVEL GRID: authored, architectural, small ----
      // 0 beach sand · 1 the meadow ring (and the low rocky point + skerries) ·
      // 2 the room terrace / knoll / crag skirt · 3 the crag crown
      const DIST = new Float32Array(GRID * GRID).fill(1e9)
      {
        const qx: number[] = [], qy: number[] = []
        for (let ty = 0; ty < GRID; ty++) for (let tx = 0; tx < GRID; tx++) {
          if (coastDs(tx, ty) <= 0) { DIST[ty * GRID + tx] = 0; qx.push(tx); qy.push(ty) }
        }
        const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
        for (let h = 0; h < qx.length; h++) {
          const x = qx[h], y = qy[h], d = DIST[y * GRID + x]
          for (const [ox, oy] of NB8) {
            const nx = x + ox, ny = y + oy
            if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
            if (DIST[ny * GRID + nx] > d + 1) { DIST[ny * GRID + nx] = d + 1; qx.push(nx); qy.push(ny) }
          }
        }
        for (let pass = 0; pass < 2; pass++) {
          const src = Float32Array.from(DIST)
          for (let ty = 1; ty < GRID - 1; ty++) for (let tx = 1; tx < GRID - 1; tx++) {
            let sum = 0
            for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) sum += src[(ty + oy) * GRID + tx + ox]
            DIST[ty * GRID + tx] = sum / 9
          }
        }
      }
      const isletAt = (tx: number, ty: number) => ISLETS.find((k) => Math.hypot(tx - k.x, ty - k.y) < k.r + 0.4)
      // the point's bare-rock spine: the peninsula past the meadow's reach
      const pointK = (tx: number, ty: number) => {
        const th = Math.atan2(ty - CY, tx - CX)
        const d = Math.hypot(tx - CX, ty - CY)
        const w = Math.abs(((th + 0.05 + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
        return w < 0.24 && d > 19 ? 1 : 0
      }
      // long-wave bench wiggle (the hub's own: tight jitter carved paper-cut
      // notches; long waves with occasional steps are how c3 draws terraces)
      const bandJ = (tx: number, ty: number) => (vnoise(tx / 14 + 31, ty / 14 + 47) - 0.5) * 1.6
      // THE HUB'S LEVEL GRAMMAR, verbatim: beach azimuths get a flat sand
      // shelf then two benches hugging the plateau edge; cliff azimuths hold
      // the full plateau to the waterline; THE SUMMIT alone climbs above the
      // plateau (summitLvl — the cone grammar at acropolis scale).
      const lvlOf = (tx: number, ty: number) => {
        if (coastDs(tx, ty) <= 0) return -1
        if (isletAt(tx, ty)) return 1
        const d = DIST[ty * GRID + tx]
        const cf = smooth(0.35, 0.6, cliffK(Math.atan2(ty - CY, tx - CX)))
        const j = bandJ(tx, ty) * 0.7
        const beachL = d <= 4.5 + j ? 0 : d <= 6 + j ? 1 : d <= 7.5 + j ? 2 : PLAT_L
        const base = Math.round(beachL * (1 - cf) + PLAT_L * cf)
        // the low point spine + knoll ride BELOW the plateau (a peninsula is
        // not the island's body): cap them
        if (pointK(tx, ty) || Math.hypot(tx - KNOLL.x, ty - KNOLL.y) < KNOLL.r) {
          return Math.min(base, Math.hypot(tx - CX, ty - CY) < 23 ? 2 : 1)
        }
        const cd = cragD(tx, ty)
        if (cd < 1.7) return base + 2 // the crag: the dark tooth over the north arc
        if (cd < 3.1) return Math.max(base, PLAT_L)
        // the summit climbs out of full-plateau ground only (the hub's gate)
        return base >= PLAT_L ? base + summitLvl(tx, ty) : base
      }
      const LV = new Int8Array(GRID * GRID)
      for (let ty = 0; ty < GRID; ty++) for (let tx = 0; tx < GRID; tx++) LV[ty * GRID + tx] = lvlOf(tx, ty)
      // THE HUB'S FULL CLEANUP SUITE (each pass is a documented lesson):
      // snap → spike killer → dip killer → notch killer → finger killer.
      for (let pass = 0; pass < 3; pass++) {
        const prev = Int8Array.from(LV)
        for (let ty = 1; ty < GRID - 1; ty++) for (let tx = 1; tx < GRID - 1; tx++) {
          const L = prev[ty * GRID + tx]
          if (L < 0 || L > PLAT_L) continue
          const nb = [prev[ty * GRID + tx + 1], prev[ty * GRID + tx - 1], prev[(ty + 1) * GRID + tx], prev[(ty - 1) * GRID + tx]]
          if (nb.includes(L)) continue
          const land = nb.filter((v) => v >= 0)
          if (!land.length) continue
          const counts = new Map<number, number>()
          for (const v of land) counts.set(v, (counts.get(v) || 0) + 1)
          let best = L, bc = 1
          for (const [v, c] of counts) if (c > bc || (c === bc && v !== L)) { best = v; bc = c }
          if (bc >= 2) LV[ty * GRID + tx] = best
        }
      }
      { // spike killer: 1-tile promontories snap down
        const prev = Int8Array.from(LV)
        for (let ty = 1; ty < GRID - 1; ty++) for (let tx = 1; tx < GRID - 1; tx++) {
          const L = prev[ty * GRID + tx]
          if (L <= 0 || L > PLAT_L) continue
          const nb = [prev[ty * GRID + tx + 1], prev[ty * GRID + tx - 1], prev[(ty + 1) * GRID + tx], prev[(ty - 1) * GRID + tx]].filter((v) => v >= 0)
          const lower = nb.filter((v) => v < L)
          if (nb.length >= 3 && lower.length >= 3) LV[ty * GRID + tx] = Math.max(...lower)
        }
      }
      { // dip killer: 1-tile pockmarks raise
        const prev = Int8Array.from(LV)
        for (let ty = 1; ty < GRID - 1; ty++) for (let tx = 1; tx < GRID - 1; tx++) {
          const L = prev[ty * GRID + tx]
          if (L < 0 || L > PLAT_L) continue
          const nb = [prev[ty * GRID + tx + 1], prev[ty * GRID + tx - 1], prev[(ty + 1) * GRID + tx], prev[(ty - 1) * GRID + tx]].filter((v) => v >= 0)
          const higher = nb.filter((v) => v > L)
          if (nb.length >= 3 && higher.length >= 3) LV[ty * GRID + tx] = Math.min(...higher)
        }
      }
      for (let pass = 0; pass < 2; pass++) { // notch killer: majority snap
        const prev = Int8Array.from(LV)
        for (let ty = 1; ty < GRID - 1; ty++) for (let tx = 1; tx < GRID - 1; tx++) {
          const L = prev[ty * GRID + tx]
          if (L < 0) continue
          const nb = [prev[ty * GRID + tx + 1], prev[ty * GRID + tx - 1], prev[(ty + 1) * GRID + tx], prev[(ty - 1) * GRID + tx]].filter((v) => v >= 0)
          const counts = new Map<number, number>()
          for (const v of nb) counts.set(v, (counts.get(v) || 0) + 1)
          for (const [v, c] of counts) if (v !== L && c >= 3) { LV[ty * GRID + tx] = v; break }
        }
      }
      for (let pass = 0; pass < 3; pass++) { // finger killer: thin bench peninsulas
        const prev = Int8Array.from(LV)
        for (let ty = 1; ty < GRID - 1; ty++) for (let tx = 1; tx < GRID - 1; tx++) {
          const L = prev[ty * GRID + tx]
          if (L < 0 || L > PLAT_L) continue
          let lowN = 0, hiN = 0, lowBest = -9, hiBest = 99
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue
            const v = prev[(ty + oy) * GRID + tx + ox]
            if (v < 0) continue
            if (v < L) { lowN++; if (v > lowBest) lowBest = v }
            else if (v > L) { hiN++; if (v < hiBest) hiBest = v }
          }
          if (lowN >= 5 && hiN <= 1 && lowBest >= 0) LV[ty * GRID + tx] = lowBest
          else if (hiN >= 5 && lowN <= 1) LV[ty * GRID + tx] = Math.min(hiBest, PLAT_L)
        }
      }
      // THE COURT IS A DESIGNED BENCH (the hub's plaza cut): one flat level
      // for the whole crown court — the Terminal never straddles two terraces
      {
        const pl = LV[Math.round(TERMINAL_SEAM[1]) * GRID + Math.round(TERMINAL_SEAM[0])]
        if (pl > 0) {
          for (let ty = FORECOURT.y0 - 3; ty <= FORECOURT.y1 + 1; ty++) for (let tx = FORECOURT.x0 - 1; tx <= FORECOURT.x1 + 1; tx++) {
            const L = LV[ty * GRID + tx]
            if (L > 0 && L >= pl - 2 && L <= pl + 3) LV[ty * GRID + tx] = pl
          }
        }
      }
      const eLvl = (tx: number, ty: number) =>
        tx < 0 || ty < 0 || tx >= GRID || ty >= GRID ? -1 : LV[ty * GRID + tx]
      if (DBG) (window as unknown as { __LV?: unknown }).__LV = { LV, GRID }

      // rock material zones: the crag, the skerries, the SE point finger —
      // NOT the knoll (the lighthouse stands on a green crown over the rock)
      const rockTop = (tx: number, ty: number) => {
        if (Math.hypot(tx - KNOLL.x, ty - KNOLL.y) < 2.9) return false
        return !!isletAt(tx, ty) || cragD(tx, ty) < 3.1 || pointK(tx, ty) > 0
      }
      // the FORECOURT: carpet tiles spilling out of the Terminal's doorway
      // (the room leaking into the island — spec §9), edges eroded by hash
      const onCourt = (tx: number, ty: number) => {
        if (tx < FORECOURT.x0 || tx > FORECOURT.x1 || ty < FORECOURT.y0 || ty > FORECOURT.y1) return false
        const edge = Math.min(tx - FORECOURT.x0, FORECOURT.x1 - tx, ty - FORECOURT.y0, FORECOURT.y1 - ty)
        return edge >= 1 || hash(tx * 5.3, ty * 3.1) > 0.45
      }
      const stepAt = new Set(STEPS.tiles.map(([sx, sy]) => sy * GRID + sx))

      const foamTex = radial(48, [[0, 'rgba(255,255,255,0.85)'], [0.45, 'rgba(224,248,242,0.4)'], [1, 'rgba(224,248,242,0)']])
      // a foam collar at a wall's waterline foot (the hub's thin quiet lap line)
      const foamCollar = (fx: number, fy: number, zBase: number, frontSum: number) => {
        const foam = new Sprite(foamTex); foam.anchor.set(0.5, 0.5)
        foam.width = 50; foam.height = 9; foam.alpha = 0.5
        foam.position.set(fx, fy)
        foam.zIndex = Math.max(zBase, frontSum * 4000) + 62
        world.addChild(foam)
      }

      // THE RISERS (the hub's face language): a 1-course land step wears a
      // GRASS riser that inherits the meadow's own tint (the field stays one
      // surface); taller drops and every sea-facing face are STONE courses —
      // warm rock in the sun, dark volc in shade — the drawn cliff walls.
      const grassRiser: Texture[] = gB.filter(Boolean).map((t) => new Texture({ source: t.source, frame: new Rectangle(0, 30, 64, 34) }))
      const drawColumn = (bx2: number, by2: number, m: number, toSea: boolean, tx2: number, ty2: number, zBase2: number, topTint: number, dark = false) => {
        if (m <= 0) return
        const rkc = rakeAt(tx2, ty2)
        const stonePool = (dark || rkc < -0.15) && volcW.length ? volcW : sideW
        const grassy = !toSea && m === 1 && !dark && grassRiser.length > 0
        const pick = (k: number, pool2: Texture[]) => Math.floor(vnoise(tx2 / 2.7 + 1.3 + k * 0.13, ty2 / 2.7 + 8.1 + k * 0.21) * pool2.length) % pool2.length
        if (toSea && stonePool.length) {
          // submerged echo course: the cliff foot runs under the waterline
          const wet = new Sprite(stonePool[pick(m, stonePool)])
          wet.anchor.set(0.5, 16 / 64)
          wet.position.set(bx2, by2 + (m - 1) * STEP + 12)
          wet.tint = 0xb8ada2
          if (DBG) wet.tint = 0x2020ff
          wet.zIndex = zBase2; world.addChild(wet)
        }
        for (let k = m - 1; k >= 0; k--) {
          if (grassy) {
            // the meadow's own bank: the riser crop tinted FROM the top —
            // one continuous surface folding over its step (the hub's P1)
            const seg = new Sprite(grassRiser[pick(k, grassRiser)])
            seg.anchor.set(0.5, 0)
            seg.position.set(bx2, by2 + 2)
            seg.tint = shadeHex(topTint, 0.72)
            if (DBG) seg.tint = 0x20ff60
            seg.zIndex = zBase2 + 1
            world.addChild(seg)
            return
          }
          const seg = new Sprite(stonePool[pick(k, stonePool)])
          seg.anchor.set(0.5, 16 / 64)
          seg.position.set(bx2, by2 + k * STEP)
          const drift = (0.9 + 0.08 * vnoise(tx2 / 6 + 2.2, ty2 / 6 + 7.7) - 0.02 * k) * (1 + 0.18 * rkc)
          const vv = Math.min(255, Math.round(drift * 255))
          seg.tint = (vv << 16) | (vv << 8) | vv
          if (DBG) seg.tint = 0xff2020
          seg.zIndex = zBase2 + 1 + (m - 1 - k)
          world.addChild(seg)
        }
      }

      // ---- THE LAND TILES: THE HUB'S FIELD, ported faithfully ----
      // Flat blended diamonds (the melt family, exact 64x36 on the 64x32
      // lattice — the 2px bleed IS the melt), the hub's meadow recipe (large
      // zone drift over patchwork, damped on the coast benches, path-dry,
      // canopy AO under the authored masses, the summit's cast shadow), and
      // risers BELOW the top so they inherit its computed tint.
      const gt = flatG.filter(Boolean), st = flatS.filter(Boolean)
      const rockTopTex = rockN.filter(Boolean)
      const stepPad: Texture | undefined = sB ? new Texture({ source: sB.source, frame: new Rectangle(0, 0, 64, 32) }) : undefined
      for (let ty = 0; ty < GRID; ty++) {
        for (let tx = 0; tx < GRID; tx++) {
          const dx = tx - CX, dy = ty - CY
          if (dx * dx + dy * dy > SEA_R * SEA_R) continue
          const L = eLvl(tx, ty)
          if (L < 0) continue
          const lift = liftOf(L)
          const bx = isoX(tx, ty), by = isoY(tx, ty) - lift + GY
          const zBase = (tx + ty) * 4000 + lift * 2
          const rock = rockTop(tx, ty)
          const crown = plateauD(tx, ty) <= 0.01
          const court = crown && onCourt(tx, ty)
          // the hub's sand gate: sea-level land on a beach azimuth wears sand
          const sand = L === 0 && !rock && cliffK(Math.atan2(dy, dx)) < 0.35

          // THE TOP: one flat blended diamond
          const pool = rock && rockTopTex.length ? rockTopTex : sand || court ? st : gt
          if (!pool.length) continue
          const g = pool[Math.floor(vnoise(tx / 6 + 4.2, ty / 6 + 1.8) * pool.length) % pool.length]
          const top = new Sprite(g)
          top.anchor.set(0.5, 0.5)
          top.position.set(bx, by)
          top.scale.set(1)
          top.zIndex = zBase + 5
          const grain = 0.995 + 0.01 * hash(tx * 1.3, ty * 2.1)
          // continuous jitter on the rake input (the hub's contour-line fix)
          const rk = rakeAt(tx, ty) + (vnoise(tx / 2.3 + 14, ty / 2.3 + 3) - 0.5) * 0.1
          const shadowK = castShadowK(tx, ty)
          const pD = pathD(tx, ty)
          const seamD = Math.hypot(tx - TERMINAL_SEAM[0], ty - TERMINAL_SEAM[1])
          let topTint: number
          if (rock) {
            // the dark masses (crag / point / skerries): basalt-brown, one
            // hard sun across the form — c3's mass modelling
            const drift = 0.82 + 0.12 * vnoise(tx / 5 + 8, ty / 5 + 3)
            const lit = 1 + 0.35 * rk
            topTint = warmCool(tint24(drift * 0.6 * lit, drift * 0.53 * lit, drift * 0.48), rk * 1.2)
          } else if (court) {
            // the forecourt: worn pale ground with the screen's teal spill
            const wear = 0.94 + 0.08 * vnoise(tx / 9 + 3, ty / 9 + 12)
            let hexF = tintFor(0xcabfa4, SAND_BASE)
            if (seamD < 3.2) {
              const k = (1 - seamD / 3.2) * 0.4
              const r2 = Math.round(((hexF >> 16) & 255) * (1 - k) + 0x63 * k)
              const g2 = Math.round(((hexF >> 8) & 255) * (1 - k) + 0xd8 * k)
              const b2 = Math.round((hexF & 255) * (1 - k) + 0xc4 * k)
              hexF = (r2 << 16) | (g2 << 8) | b2
            }
            topTint = warmCool(shadeHex(hexF, wear * grain * (1 - 0.2 * shadowK)), rk * 0.4)
          } else if (sand) {
            // the hub's beach recipe verbatim
            const tt = Math.min(1, coastDs(tx, ty) / 5)
            const v = (0.965 + 0.06 * vnoise(tx / 16 + 3, ty / 16 + 5)) * grain * (1 + 0.1 * rk)
              * (1 - 0.18 * shadowK)
            topTint = warmCool(shadeHex(tintFor(rampAt(SAND_RAMP, tt), SAND_BASE), v), rk * 0.7)
          } else {
            // THE MEADOW FIELD (the hub's recipe): large zone drift over
            // patchwork, damped on the narrow benches, path-dry, canopy AO
            const damp = L < PLAT_L ? 0.35 : Math.min(1, DIST[ty * GRID + tx] / 12)
            const zone = 0.5 + (vnoise(tx / 24 + 9, ty / 24 + 17) - 0.5) * damp
            const patch = 1.0 + 0.08 * (vnoise(tx / 14 + 2, ty / 14 + 6) - 0.5) * 2 * damp
            const tval = Math.max(0, Math.min(1,
              0.1 + 0.3 * vnoise(tx / 13 + 2, ty / 13 + 6) + 0.42 * zone + (vnoise(tx / 2.1 + 5, ty / 2.1 + 9) - 0.5) * 0.06))
            const dry = Math.max(0, 1 - pD / 1.2) * 0.32
            const vShade = 1 - 0.18 * smooth(0.35, 0.95, vegK(tx, ty))
            const lit = patch * grain * (1 + 0.17 * rk) * (1.05 - 0.13 * zone) * vShade * (1 + 0.1 * dry)
              * (1 - 0.3 * shadowK)
            const tv2 = Math.max(0, Math.min(1, tval - 0.32 * dry + 0.24 * shadowK))
            topTint = warmCool(tintFor(shadeHex(rampAt(GRASS_RAMP, tv2), lit), GRASS_BASE), rk)
          }
          // the buried cable's faint dark line crossing the open ground
          if (!rock && cableD(tx, ty) < 0.45) {
            const r2 = Math.round(((topTint >> 16) & 255) * 0.72)
            const g2 = Math.round(((topTint >> 8) & 255) * 0.78)
            const b2 = Math.round((topTint & 255) * 0.8)
            topTint = (r2 << 16) | (g2 << 8) | b2
          }
          top.tint = topTint
          world.addChild(top)
          // the screen's glow pooling on the court (an additive breath)
          if (court && seamD < 3.2) {
            const film = new Sprite(foamTex)
            film.anchor.set(0.5, 0.5)
            film.width = 66; film.height = 30
            film.position.set(bx, by)
            film.alpha = 0.14 * (1 - seamD / 3.2) + 0.05
            film.tint = 0x5adfca
            film.blendMode = 'add'
            film.zIndex = zBase + 7
            world.addChild(film)
          }

          // THE RISERS (after the top — they inherit its tint): any lower
          // 8-neighbour opens a face; sea edges get the foam collar
          let floorMin = L, toSea = false
          for (const [ox, oy] of [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
            const nlv = eLvl(tx + ox, ty + oy)
            if (nlv < 0) toSea = true
            const fl = nlv < 0 ? 0 : nlv
            if (fl < floorMin) floorMin = fl
          }
          if (L > floorMin || toSea) {
            drawColumn(bx, by, Math.max(1, L - floorMin), toSea, tx, ty, zBase, topTint, rock || cragD(tx, ty) < 3.1)
            for (const [ox, oy] of [[1, 0], [0, 1]] as [number, number][]) {
              if (eLvl(tx + ox, ty + oy) >= 0) continue
              const ex = isoX(tx + ox * 0.5, ty + oy * 0.5), ey = isoY(tx + ox * 0.5, ty + oy * 0.5) + GY
              foamCollar(ex, ey + 2, zBase, tx + ox + ty + oy)
            }
          }
        }
      }

      // ---- THE DOCK: per-tile deck (the harbor construction grammar, one pier).
      // Deck diamonds + a plank SKIRT face on every open SE/SW edge down past
      // the waterline, so the pier reads as a BUILT structure, not a carpet.
      // (Round-1 lesson: raw red planks + a white-rect shadow read as a red rug.)
      for (const t of DOCK.tiles) {
        const top = deckT.length ? deckT[Math.floor(hash(t.tx * 2.7, t.ty * 3.9) * deckT.length) % deckT.length] : undefined
        const bx = isoX(t.tx, t.ty), by = isoY(t.tx, t.ty) - t.lift + GY
        const zBase = (t.tx + t.ty) * 4000 + t.lift * 2
        if (top) {
          const sp = new Sprite(top)
          sp.anchor.set(0.5, 0.5)
          sp.position.set(bx, by)
          sp.zIndex = zBase + 40
          sp.tint = 0x9d9080 // weathered grey-brown — kill the raw red under the grade
          world.addChild(sp)
        }
        for (const [ox, oy] of [[1, 0], [0, 1]] as [number, number][]) {
          if (dockAt(t.tx + ox, t.ty + oy)) continue // interior edge — no face
          const src = plankB
          if (!src) continue
          const drop = t.lift + 14 // deck top to under the waterline
          const fr = new Texture({ source: src.source, frame: new Rectangle(0, 8, src.width, Math.min(src.height - 8, 34)) })
          const seg = new Sprite(fr)
          seg.anchor.set(0.5, 0)
          seg.position.set(isoX(t.tx + ox * 0.5, t.ty + oy * 0.5), isoY(t.tx + ox * 0.5, t.ty + oy * 0.5) - t.lift + GY + 8)
          seg.scale.set(30 / src.width * 1.1, drop / Math.min(src.height - 8, 34))
          seg.tint = ox === 1 ? 0x4e3f30 : 0x685542 // dark under-deck: SE shadowed, SW half-lit
          seg.zIndex = zBase + 20
          world.addChild(seg)
        }
      }

      // ---- THE STEPS: two pale treads climbing the corridor's west mouth
      // (material in the ground, the tongue-stair law — never a floating decal)
      for (const [sx, sy] of STEPS.tiles) {
        const Ls = eLvl(sx, sy)
        if (Ls < 0 || !stepPad) continue
        const liftS = liftOf(Ls) + STEP * STEPS.lift
        const bxS = isoX(sx, sy), byS = isoY(sx, sy) - liftS + GY
        const zBaseS = (sx + sy) * 4000 + liftS * 2
        const pad = new Sprite(stepPad)
        pad.anchor.set(0.5, 0.5)
        pad.position.set(bxS, byS)
        pad.zIndex = zBaseS + 8
        const alt = (sx + sy) % 2 === 0 ? 1 : 0.94 // alternating tread values (the stair read)
        pad.tint = tint24(0.84 * alt, 0.8 * alt, 0.72 * alt)
        world.addChild(pad)
        if (sideW.length) {
          for (const [ox, oy] of [[1, 0], [0, 1]] as [number, number][]) {
            if (stepAt.has((sy + oy) * GRID + sx + ox)) continue
            const fr = new Texture({ source: sideW[0].source, frame: new Rectangle(0, 18, 64, 16) })
            const seg = new Sprite(fr)
            seg.anchor.set(0.5, 0)
            seg.position.set(isoX(sx + ox * 0.5, sy + oy * 0.5), isoY(sx + ox * 0.5, sy + oy * 0.5) - liftS + GY + 8)
            seg.tint = 0x8a8274
            seg.zIndex = zBaseS + 7
            world.addChild(seg)
          }
        }
      }

      // ---- THE PLACES (P4): the room's furniture from the photo-corrected
      // layout data. Every prop is tile-registered (collision lives in
      // atc-layout's BLOCKED set); anchors sit at the base so painter order
      // sorts them with the walls.
      const shadowTex = radial(64, [[0, 'rgba(22,17,54,0.55)'], [1, 'rgba(22,17,54,0)']])
      const glows: { sp: Sprite; ph: number; a: number }[] = []
      const sways: { sp: Sprite; amp: number; w: number; ph: number }[] = []
      const propAt = (key: string, ptx: number, pty: number, opts: { mirror?: boolean; sink?: number; z?: number; noShadow?: boolean } = {}) => {
        const tex = propT[key]
        if (!tex) return
        const rtx = Math.round(ptx), rty = Math.round(pty)
        const L = Math.max(0, eLvl(rtx, rty))
        const lift = liftOf(L)
        const gx = isoX(ptx, pty), gy = isoY(ptx, pty) + GY - lift + HH * 0.55 + (opts.sink ?? 0)
        if (!opts.noShadow) {
          // contact shadow grounds the piece (one sun, thrown down-right)
          const sh = new Sprite(shadowTex)
          sh.anchor.set(0.5)
          sh.width = tex.width * 0.85; sh.height = tex.width * 0.3
          sh.position.set(gx + 4 * SHADOW.dx, gy - 4 + 2 * SHADOW.dy)
          sh.alpha = 0.35; sh.tint = 0x241d40
          sh.zIndex = (rtx + rty) * 4000 + lift * 2 + ((opts.z ?? 320) - 4)
          world.addChild(sh)
        }
        const sp = new Sprite(tex)
        sp.anchor.set(0.5, 1)
        sp.position.set(gx, gy)
        if (opts.mirror) sp.scale.x = -1
        sp.zIndex = (rtx + rty) * 4000 + lift * 2 + (opts.z ?? 320)
        world.addChild(sp)
        return sp
      }
      // THE TERMINAL (Ash's pick B): the monument door front-center on the
      // summit — Thor walks into the glowing screen and the map shifts. Its
      // doorway pours teal onto the forecourt; a carved cursor blinks above.
      const term = propAt('terminal', TERMINAL[0], TERMINAL[1] + 1.6, { z: 420 })
      if (term) {
        term.scale.set(0.85)
        const Lt = Math.max(0, eLvl(TERMINAL[0], TERMINAL[1]))
        const doorGlow = new Sprite(foamTex)
        doorGlow.anchor.set(0.5)
        doorGlow.tint = 0x3fe0d0; doorGlow.blendMode = 'add'
        doorGlow.width = 120; doorGlow.height = 60
        doorGlow.position.set(isoX(TERMINAL_SEAM[0], TERMINAL_SEAM[1]), isoY(TERMINAL_SEAM[0], TERMINAL_SEAM[1]) + GY - liftOf(Lt) - 30)
        doorGlow.alpha = 0.3
        doorGlow.zIndex = (TERMINAL[0] + TERMINAL[1] + 2) * 4000 + liftOf(Lt) * 2 + 430
        world.addChild(doorGlow)
        glows.push({ sp: doorGlow, ph: 1.1, a: 0.3 })
        // the carved cursor above the lintel, blinking like it always has
        const cursor = new Sprite(Texture.WHITE)
        cursor.tint = 0x66f2e0; cursor.width = 8; cursor.height = 12
        cursor.anchor.set(0.5, 1)
        cursor.position.set(isoX(TERMINAL[0], TERMINAL[1]), isoY(TERMINAL[0], TERMINAL[1]) + GY - liftOf(Lt) - 196)
        cursor.zIndex = (TERMINAL[0] + TERMINAL[1] + 2) * 4000 + liftOf(Lt) * 2 + 431
        world.addChild(cursor)
        glows.push({ sp: cursor, ph: 0, a: 0.9 })
      }
      // the school's remains: the hero panels stand as FREESTANDING ruin
      // fragments flanking the monument (composition, never enclosure)
      const fragA = propAt('frag-door', FRAG_A[0], FRAG_A[1], { z: 340 })
      if (fragA) fragA.scale.set(0.6)
      const fragB = propAt('frag-board', FRAG_B[0], FRAG_B[1], { z: 340 })
      if (fragB) fragB.scale.set(0.6)
      // the junction stone: where the island's one cable splits three ways
      if (vegT['boulder-1']) {
        const Lj = Math.max(0, eLvl(JUNCTION[0], JUNCTION[1]))
        const j = new Sprite(vegT['boulder-1'])
        j.anchor.set(0.5, 0.9)
        j.scale.set(0.8)
        j.position.set(isoX(JUNCTION[0], JUNCTION[1]), isoY(JUNCTION[0], JUNCTION[1]) + GY - liftOf(Lj) + 4)
        j.zIndex = (Math.round(JUNCTION[0]) + Math.round(JUNCTION[1])) * 4000 + liftOf(Lj) * 2 + 300
        world.addChild(j)
        const jg = new Sprite(foamTex)
        jg.anchor.set(0.5)
        jg.tint = 0x36e2cf; jg.blendMode = 'add'
        jg.width = 40; jg.height = 18
        jg.position.set(j.x, j.y + 2)
        jg.zIndex = j.zIndex - 2
        jg.alpha = 0.25
        world.addChild(jg)
        glows.push({ sp: jg, ph: 2.4, a: 0.25 })
      }
      // the annex rack sits half-buried east of the summit (the dead node)
      propAt('annex-rack', ANNEX.rack[0], ANNEX.rack[1], { sink: 8 })
      if (vegT['bush-a']) {
        const b = new Sprite(vegT['bush-a'])
        b.anchor.set(0.5, 0.9)
        const L = Math.max(0, eLvl(ANNEX.rack[0], ANNEX.rack[1]))
        b.scale.set(0.7)
        b.position.set(isoX(ANNEX.rack[0] - 0.2, ANNEX.rack[1] + 0.5), isoY(ANNEX.rack[0] - 0.2, ANNEX.rack[1] + 0.5) + GY - liftOf(L) + 6)
        b.zIndex = (ANNEX.rack[0] + ANNEX.rack[1]) * 4000 + liftOf(L) * 2 + 340
        world.addChild(b)
      }
      // pier dressing: the ATC crate + pennant waits at the berth (the deck
      // rides at DOCK lift, not ground level — sink lifts it onto the planks)
      propAt('dock-crate', DOCK.berth[0] - 0.5, DOCK.berth[1] - 0.4, { z: 60, sink: -(dockAt(Math.round(DOCK.berth[0]), Math.round(DOCK.berth[1]))?.lift ?? 0) })
      // THE THROUGH-FLOOR PALM (the meshing centerpiece): the jungle broke up
      // through the carpet mid-room and the club worked around it — the island
      // rows ring the trunk, moss blooms from its crack (floor tint above)
      if (vegT['coco-v2']) {
        const pL = Math.max(0, eLvl(FEATURE_PALM[0], FEATURE_PALM[1]))
        const psh = new Sprite(shadowTex)
        psh.anchor.set(0.5)
        psh.width = 74; psh.height = 26
        psh.position.set(isoX(FEATURE_PALM[0], FEATURE_PALM[1]) + 16 * SHADOW.dx, isoY(FEATURE_PALM[0], FEATURE_PALM[1]) + GY - liftOf(pL) + 3)
        psh.alpha = 0.34; psh.tint = 0x2a2350
        psh.zIndex = (FEATURE_PALM[0] + FEATURE_PALM[1]) * 4000 + liftOf(pL) * 2 + 8
        world.addChild(psh)
        const fp = new Sprite(vegT['coco-v2'])
        fp.anchor.set(0.5, 0.97)
        fp.scale.set(1.12)
        fp.position.set(isoX(FEATURE_PALM[0], FEATURE_PALM[1]), isoY(FEATURE_PALM[0], FEATURE_PALM[1]) + GY - liftOf(pL) + 5)
        fp.zIndex = (FEATURE_PALM[0] + FEATURE_PALM[1]) * 4000 + liftOf(pL) * 2 + 330
        world.addChild(fp)
        sways.push({ sp: fp, amp: 0.014, w: 0.55, ph: 2.1 })
      }
      // the photos' box clutter along the east storage side
      ROOM_BOXES.forEach(([bx2, by2], bi) => {
        propAt('boxes', bx2, by2, { mirror: bi % 2 === 1, z: 315 })
      })
      // the wedge's canopy: palms INSIDE the ring, mirrored so they lean back
      // over the desks — the jungle didn't stop at the wall
      for (const rp of ROOM_PALMS) {
        const key = vegT['coco-v1'] && hash(rp.at[0], rp.at[1]) > 0.5 ? 'coco-v1' : vegT['coco-v3'] ? 'coco-v3' : 'coco-v2'
        const tex = vegT[key]
        if (!tex) break
        const Lp = Math.max(0, eLvl(rp.at[0], rp.at[1]))
        const p = new Sprite(tex)
        p.anchor.set(0.5, 0.97)
        p.scale.set(-rp.scale, rp.scale)
        p.position.set(isoX(rp.at[0], rp.at[1]), isoY(rp.at[0], rp.at[1]) + GY - liftOf(Lp) + 4)
        p.zIndex = (rp.at[0] + rp.at[1]) * 4000 + liftOf(Lp) * 2 + 335
        world.addChild(p)
        sways.push({ sp: p, amp: 0.013, w: 0.5 + 0.4 * hash(rp.at[0], rp.at[1] * 3), ph: hash(rp.at[1], rp.at[0]) * 6.28 })
      }
      // the cable's glow nodes: the run breathes teal from the activity desk
      // all the way to the lamp room (phase keyed by run distance — the pulse
      // TRAVELS the line, desk to beacon)
      for (const run of CABLE_RUNS) {
        let runD = 0
        for (let i = 0; i < run.length - 1; i++) {
          const [x0, y0] = run[i], [x1, y1] = run[i + 1]
          const segLen = Math.hypot(x1 - x0, y1 - y0)
          for (let s = 0; s < segLen; s += 1.6) {
            const u = s / segLen
            const nx = x0 + (x1 - x0) * u, ny = y0 + (y1 - y0) * u
            const Ln = Math.max(0, eLvl(Math.round(nx), Math.round(ny)))
            if (coastDs(nx, ny) <= 0 && !dockAt(Math.round(nx), Math.round(ny))) continue
            const dot = new Sprite(foamTex)
            dot.anchor.set(0.5)
            dot.tint = 0x36e2cf; dot.blendMode = 'add'
            dot.width = 16; dot.height = 8
            dot.position.set(isoX(nx, ny), isoY(nx, ny) + GY - liftOf(Ln))
            dot.alpha = 0.3
            dot.zIndex = (Math.round(nx) + Math.round(ny)) * 4000 + liftOf(Ln) * 2 + 14
            world.addChild(dot)
            glows.push({ sp: dot, ph: -(runD + s) * 0.9, a: 0.3 })
          }
          runD += segLen
        }
      }
      // ferns reclaiming the floor at the authored spots
      for (const [fx2, fy2] of ROOM_FERNS) {
        const key = vegT['fernclump-1'] ? 'fernclump-1' : 'bush-b'
        const tex = vegT[key]
        if (!tex) break
        const fL = Math.max(0, eLvl(fx2, fy2))
        const f = new Sprite(tex)
        f.anchor.set(0.5, 0.92)
        f.scale.set(0.5 + 0.2 * hash(fx2 * 1.3, fy2 * 2.7))
        f.position.set(isoX(fx2, fy2), isoY(fx2, fy2) + GY - liftOf(fL) + 4)
        f.zIndex = (fx2 + fy2) * 4000 + liftOf(fL) * 2 + 310
        world.addChild(f)
      }
      // THE LANDMARK (Ash's pick, proof-atc-lighthouse D): the school's own
      // siding + brick rebuilt as the beacon on the knoll — from the west dock
      // the vista layers pier → walls → tower, and the lamp room breathes teal
      const lh = propAt('lighthouse', KNOLL.x, KNOLL.y + 0.4, { z: 380 })
      if (lh) {
        lh.scale.set(1.18) // landmark scale — it must command the point
        const L = Math.max(0, eLvl(KNOLL.x, KNOLL.y))
        const beacon = new Sprite(foamTex)
        beacon.anchor.set(0.5)
        beacon.tint = 0x3fe0d0; beacon.blendMode = 'add'
        beacon.width = 150; beacon.height = 84
        beacon.position.set(isoX(KNOLL.x, KNOLL.y + 0.4), isoY(KNOLL.x, KNOLL.y + 0.4) + GY - liftOf(L) - 268)
        beacon.alpha = 0.32
        beacon.zIndex = (KNOLL.x + KNOLL.y) * 4000 + liftOf(L) * 2 + 390
        world.addChild(beacon)
        glows.push({ sp: beacon, ph: 0.4, a: 0.32 })
      }

      // ---- THE GROVES: the authored vegetation sites (atc-layout GROVES, each
      // with its reason) planted from the APPROVED palm/bush kit — scale/mirror
      // variance, violet cast shadows under one sun, canopy sway registered.
      // These are the island's dark composition masses (c3's green-on-gold).
      const palmKeys = ['coco-v1', 'coco-v2', 'coco-v3', 'palm-a', 'palm-b'].filter((k) => vegT[k])
      const bushKeys = ['bush-a', 'bush-b', 'fernclump-1'].filter((k) => vegT[k])
      const grovePlanted: number[] = []
      GROVES.forEach((gv, gi) => {
        let planted = 0
        // the grove's CANOPY POOL: one broad violet-dark shade mass under the
        // whole site (value first — c3's dark green masses are shadow, not
        // leaf count; per-palm dots can never add up to a mass)
        {
          const gL = Math.max(0, eLvl(Math.round(gv.x), Math.round(gv.y)))
          const pool = new Sprite(shadowTex)
          pool.anchor.set(0.5)
          pool.width = gv.r * 2.4 * HW
          pool.height = gv.r * 2.4 * HH * 0.9
          pool.position.set(isoX(gv.x, gv.y) + 8, isoY(gv.x, gv.y) + GY - liftOf(gL))
          pool.alpha = 0.26; pool.tint = 0x241d40
          pool.zIndex = (Math.round(gv.x) + Math.round(gv.y)) * 4000 + liftOf(gL) * 2 + 5
          world.addChild(pool)
        }
        const plant = (key: string, px: number, py: number, sc: number, canopy: boolean) => {
          const rtx = Math.round(px), rty = Math.round(py)
          const L = eLvl(rtx, rty)
          if (L < 1) return                       // never on sand or sea
          if (pathD(px, py) < 1.7) return         // the walk stays open
          if (plateauD(px, py) < 1.4) return      // the room pass regrows jungle TO the walls (P3)
          if (cragD(px, py) < 3.3) return
          if (dockAt(rtx, rty)) return
          const tex = vegT[key]
          if (!tex) return
          const lift = liftOf(L)
          const bx2 = isoX(px, py), by2 = isoY(px, py) + GY - lift + 4
          const mir = hash(px * 2.9, py * 1.3) > 0.5 ? -1 : 1
          // violet cast shadow, thrown down-right away from the one sun
          const sh = new Sprite(shadowTex)
          sh.anchor.set(0.5)
          sh.width = 58 * sc; sh.height = 20 * sc
          sh.position.set(bx2 + 16 * sc * SHADOW.dx, by2 - 3 + 7 * sc * SHADOW.dy)
          sh.alpha = 0.32; sh.tint = 0x2a2350
          sh.zIndex = (rtx + rty) * 4000 + lift * 2 + 6
          world.addChild(sh)
          const p = new Sprite(tex)
          p.anchor.set(0.5, 0.97)
          p.scale.set(sc * mir, sc)
          p.position.set(bx2, by2)
          p.zIndex = (rtx + rty) * 4000 + lift * 2 + 300
          world.addChild(p)
          if (canopy) sways.push({ sp: p, amp: 0.011 + 0.013 * hash(px, py), w: 0.5 + 0.7 * hash(py, px), ph: hash(px * 9, py * 3) * 6.28 })
          planted++
        }
        const n = Math.round(gv.r * 2.4)
        for (let k = 0; k < n; k++) {
          const a = hash(gi * 31 + k * 3 + 1, k * 17 + 3) * Math.PI * 2
          const rr = gv.r * (0.3 + 0.7 * hash(k * 7 + gi, gi * 11 + k))
          const px = gv.x + Math.cos(a) * rr, py = gv.y + Math.sin(a) * rr * 0.9
          if (!palmKeys.length) break
          const key = palmKeys[Math.floor(hash(px * 3.1, py * 2.3) * palmKeys.length) % palmKeys.length]
          plant(key, px, py, 0.78 + 0.4 * hash(px * 1.7, py * 4.1), true)
        }
        // understory: low bushes at the grove's feet ground the canopy
        for (let k = 0; k < Math.max(2, Math.round(gv.r)); k++) {
          const a = hash(gi * 13 + k * 5 + 2, k * 23 + 7) * Math.PI * 2
          const rr = gv.r * (0.55 + 0.5 * hash(k * 3 + gi * 7, gi + k * 13))
          const px = gv.x + Math.cos(a) * rr, py = gv.y + Math.sin(a) * rr * 0.9
          if (!bushKeys.length) break
          const key = bushKeys[Math.floor(hash(px * 1.9, py * 3.7) * bushKeys.length) % bushKeys.length]
          plant(key, px, py, 0.55 + 0.3 * hash(px * 3.3, py * 1.1), false)
        }
        grovePlanted[gi] = planted
      })
      // an empty grove site = a silent composition hole (the round-2 lesson:
      // two sites sat in the water and nobody knew) — say it out loud
      grovePlanted.forEach((n, gi) => {
        if (n < 3) console.warn(`[atc] grove ${gi} (${GROVES[gi].why}) planted only ${n} — site likely off the meadow`)
      })

      // coast MIST: slow wisps riding the waterline (the breath the refs have;
      // soft sprites, the hub's own steam/cloud technique — never a shader)
      const mists: { sp: Sprite; x0: number; spd: number; ph: number }[] = []
      const mistTex = radial(256, [[0, 'rgba(214,246,238,0.16)'], [0.6, 'rgba(214,246,238,0.07)'], [1, 'rgba(214,246,238,0)']])
      for (let i = 0; i < 4; i++) {
        const a = [2.3, 0.4, -1.2, 1.5][i]
        const rr = coastR(a) + 3
        const mx2 = CX + Math.cos(a) * rr, my2 = CY + Math.sin(a) * rr
        const m = new Sprite(mistTex)
        m.anchor.set(0.5)
        m.width = 420 + i * 90; m.height = 90 + i * 14
        m.position.set(isoX(mx2, my2), isoY(mx2, my2) + GY - 6)
        m.zIndex = 8e8 + i
        world.addChild(m)
        mists.push({ sp: m, x0: m.x, spd: 2.5 + i, ph: i * 1.7 })
      }

      // ---- THE VAST VIRTUAL SEA (the hub's pool, unchanged mechanics) ----
      const WORLD_R = 320
      const waterS: SwellSprite[] = []
      const seaPool: Sprite[] = []
      const refreshSea = () => {
        const vw = app.screen.width, vh = app.screen.height
        const blk = ZOOM >= 0.5 ? 1 : ZOOM >= 0.24 ? 2 : ZOOM >= 0.11 ? 4 : 8
        const wx0 = (0 - world.x) / ZOOM, wx1 = (vw - world.x) / ZOOM
        const wy0 = (0 - world.y) / ZOOM, wy1 = (vh - world.y) / ZOOM
        const txMin = Math.floor((wx0 / HW + wy0 / HH) / 2) - blk * 2
        const txMax = Math.ceil((wx1 / HW + wy1 / HH) / 2) + blk * 2
        const tyMin = Math.floor((wy0 / HH - wx1 / HW) / 2) - blk * 2
        const tyMax = Math.ceil((wy1 / HH - wx0 / HW) / 2) + blk * 2
        waterS.length = 0
        let used = 0
        const place = (px: number, py: number, pd: number, pb: number) => {
          let sp = seaPool[used]
          if (!sp) { sp = new Sprite(); seaPool.push(sp); seaLayer.addChild(sp) }
          const m = configSeaTile(sp, px, py, pd, waterV, undefined, pb)
          if (!m) { sp.visible = false; return }
          sp.visible = true
          waterS.push(m)
          used++
        }
        const t0x = Math.floor(txMin / blk) * blk, t0y = Math.floor(tyMin / blk) * blk
        for (let by2 = t0y; by2 <= tyMax; by2 += blk) {
          for (let bx2 = t0x; bx2 <= txMax; bx2 += blk) {
            const mx = bx2 + (blk - 1) / 2, my = by2 + (blk - 1) / 2
            const ddx = mx - CX, ddy = my - CY
            if (ddx * ddx + ddy * ddy > WORLD_R * WORLD_R) continue
            const dsC = dsAt(mx, my)
            if (dsC > blk * 1.5 + 1) continue
            if (blk === 1) { if (dsC <= 0) place(mx, my, dsC, 1); continue }
            if (dsC < -(DEPTH_RANGE + blk * 1.5)) { place(mx, my, dsC, blk); continue }
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
      }
      refreshSea()

      // ---- THE FEATURE SKELETON, MARKED (the double mandate): every socket
      // renders as a visible, honest dev stake — a teal flag + its ledger id.
      // These are placeholders BY DESIGN and disappear as systems redeem them.
      if (SOCKETS) {
        const lsc = Math.min(2.6, 0.72 / ZOOM)
        const style = new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0xbaf3ea, stroke: { color: 0x06282c, width: 3 } })
        const groundY = (px: number, py: number) => {
          const rx = Math.round(px), ry = Math.round(py)
          const L = eLvl(rx, ry)
          const dk = dockAt(rx, ry)
          return isoY(px, py) + GY - (dk ? dk.lift : L > 0 ? liftOf(L) : 0)
        }
        const stake = (id: string, px: number, py: number, kind: string) => {
          const gx = isoX(px, py), gy = groundY(px, py)
          const post = new Sprite(Texture.WHITE)
          post.tint = 0x1d4f52; post.width = 3; post.height = 26
          post.anchor.set(0.5, 1); post.position.set(gx, gy)
          post.zIndex = (px + py) * 4000 + 60
          world.addChild(post)
          const flag = new Sprite(Texture.WHITE)
          flag.tint = kind === 'hidden' ? 0x8a6bbe : 0x2ec4b6
          flag.width = 12; flag.height = 8
          flag.anchor.set(0, 1); flag.position.set(gx, gy - 18)
          flag.zIndex = (px + py) * 4000 + 61
          world.addChild(flag)
          const label = new Text({ text: id, style })
          label.anchor.set(0.5, 1)
          label.scale.set(lsc)
          label.position.set(gx, gy - 30)
          label.zIndex = 9e9
          world.addChild(label)
        }
        for (const p of getPois()) stake(p.id, p.at[0], p.at[1], p.kind)
        for (const s of getSeams()) stake(`⛵ ${s.id}`, s.at[0], s.at[1], 'seam')
      }

      // ---- ?coords=1 — the coordinate scaffold (spatial-craft law #1) ----
      if (params.get('coords')) {
        const lsc = Math.min(3.2, 0.62 / ZOOM)
        const style = new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } })
        for (let cty = 0; cty < GRID; cty += 8) {
          for (let ctx = 0; ctx < GRID; ctx += 8) {
            if (Math.hypot(ctx - CX, cty - CY) > SEA_R * 0.9) continue
            const cl = eLvl(ctx, cty)
            const gy = isoY(ctx, cty) + GY - (cl > 0 ? liftOf(cl) : 0)
            const tick = new Sprite(Texture.WHITE)
            tick.tint = 0xff4040; tick.width = 3; tick.height = 3
            tick.anchor.set(0.5); tick.position.set(isoX(ctx, cty), gy)
            tick.zIndex = 9e9
            world.addChild(tick)
            const label = new Text({ text: `${ctx},${cty}`, style })
            label.anchor.set(0.5, 1.2)
            label.scale.set(lsc)
            label.position.set(isoX(ctx, cty), gy)
            label.zIndex = 9e9
            world.addChild(label)
          }
        }
      }

      // ---- GOLDEN-HOUR SUNSET STACK (LOCKED — the hub's stage layers, verbatim) ----
      const warmMul = new Sprite(Texture.WHITE); warmMul.tint = 0xffd08a; warmMul.blendMode = 'multiply'; warmMul.alpha = 0.3; app.stage.addChild(warmMul)
      const sun = new Sprite(radial(512, [[0, 'rgba(255,224,158,0.30)'], [0.32, 'rgba(255,198,124,0.14)'], [0.66, 'rgba(255,172,100,0.04)'], [1, 'rgba(255,172,100,0)']]))
      sun.anchor.set(0.5); sun.blendMode = 'add'; app.stage.addChild(sun)
      const rake = new Sprite(linGrad(1024, 0xffcaa0, 0.16, 0x2a2350, 0.26)); rake.blendMode = 'overlay'; app.stage.addChild(rake)
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
        refreshSea()
      }
      resizeFx()
      app.renderer.on('resize', resizeFx)

      app.ticker.add(() => {
        const wt = performance.now() / 1000
        animSwells(waterS, wt, () => 0)
        // the canopy breathes: gentle per-plant rotation about the rooted base
        for (const s of sways) s.sp.rotation = s.amp * Math.sin(wt * s.w + s.ph)
        // the screens breathe: slow independent flicker per lit station
        for (const g of glows) g.sp.alpha = g.a * (0.7 + 0.3 * Math.sin(wt * 1.1 + g.ph))
        // the mist drifts, barely
        for (const m of mists) m.sp.x = m.x0 + Math.sin(wt * 0.05 * m.spd + m.ph) * 60
      })
    }

    start().catch((err) => { console.error('[AtcIslandIso] failed', err) })
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

// diagonal warm→cool gradient for the sunset rake
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
