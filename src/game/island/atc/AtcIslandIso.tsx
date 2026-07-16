import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import {
  isoX, isoY, hash, vnoise, shadeHex, rampAt, tintFor, mix,
  loadWaterVariants, configSeaTile, animSwells, type SwellSprite, HW, HH, DEPTH_RANGE,
} from '../../ocean'
import {
  CX, CY, GRID, SEA_R, coastDs, coastR, shelfW, lagoonK, cliffK, sandK,
  plateauD, KNOLL, cragD, ISLETS,
} from './atc-terrain'
import {
  DOCK, dockAt, pathD, vegK, GROVES, SHADOW,
  wallAt, wallState, STEPS, RX0, RX1, RY0, RY1, WINDOWS, DOOR,
  STATIONS, ACTIVITY_STATION, TEACHER, SINK, ANNEX, WHITEBOARD,
  FEATURE_PALM, ROOM_FERNS, ROOM_BOXES, ROOM_PALMS, jungleWedgeK, CABLE, cableD,
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
// azimuth through a soft wander so cliff↔beach handoffs meander like geology
const thJit = (tx: number, ty: number) =>
  Math.atan2(ty - CY, tx - CX) + 0.22 * (vnoise(tx / 9 + 21, ty / 9 + 13) - 0.5)
// the hub's exact golden-hour sun rake (+1 sunlit upper-left, −1 shade)
const rakeAt = (tx: number, ty: number) => {
  const up = (CX + CY) - (tx + ty)
  const left = (ty - tx)
  const r = (up * 0.8 + left * 0.45) / 26 // 26: the small island reaches full rake at its edges
  return r / (1 + Math.abs(r))
}
const clampB = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
const warmCool = (hex: number, rk: number) => {
  let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255
  if (rk >= 0) { const t = rk * 0.15; r += (255 - r) * t; g += (222 - g) * t * 0.55; b -= b * t * 0.18 }
  else { const t = -rk * 0.17; r -= r * t * 0.12; g -= g * t * 0.04; b += (205 - b) * t * 0.32 }
  return (clampB(Math.round(r)) << 16) | (clampB(Math.round(g)) << 8) | clampB(Math.round(b))
}
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

// the locked material ramps (IslandMapIso's own values — one world, one skin)
const SAND_BASE = [246, 229, 180]
const SAND_RAMP: [number, number][] = [[0, 0xdcbf87], [0.45, 0xead6a3], [1, 0xf7ecc2]]
const GRASS_BASE = [126, 158, 96]
const GRASS_RAMP: [number, number][] = [[0, 0xbcc468], [0.5, 0x9cb058], [1, 0x6f8c42]]
const PATH_HEX = 0xc9b184 // the worn-earth ribbon the walk carves

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
      const STEP = Number(params.get('step') || 20) // world px per elevation level
      const SOCKETS = params.get('sockets') !== '0' // honest placeholder markers (default ON)
      const DBG = !!params.get('dbg')

      const sandV: Texture[] = []
      const grassV: Texture[] = []
      const flatG: Texture[] = [], flatS: Texture[] = []
      const sideW: Texture[] = [] // blocks3 rock-N-side: the mossless block courses
      const rockN: Texture[] = [] // the normalized bare-rock top family
      const wallB: Texture[] = [] // the ATC wall-stub block family (PixelLab, greige siding + brick base)
      let waterV: Texture[] = []
      const deckT: Texture[] = []
      let plankB: Texture | undefined
      // the approved beach/hub vegetation kit (REUSE is the law — §14.1's ring)
      const vegT: Record<string, Texture> = {}
      const VEG_FILES = ['coco-v1', 'coco-v2', 'coco-v3', 'palm-a', 'palm-b', 'bush-a', 'bush-b', 'fernclump-1', 'boulder-1', 'boulder-2']
      // the room's own prop kit (PixelLab, filed under /art/atc-island/props)
      const propT: Record<string, Texture> = {}
      const PROP_FILES = ['desk-front', 'desk-back', 'teacher-desk', 'annex-rack', 'whiteboard', 'sink-counter', 'dock-crate', 'lighthouse', 'boxes']
      await Promise.all([
        loadWaterVariants().then((v) => { waterV = v }),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-n/${i}.png`).then((t: Texture) => { sandV[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/grass-n/${i}.png`).then((t: Texture) => { grassV[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/flat/grass-${i}.png?v=7`).then((t: Texture) => { t.source.scaleMode = 'nearest'; flatG[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/flat/sand-${i}.png?v=7`).then((t: Texture) => { t.source.scaleMode = 'nearest'; flatS[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/rock-n/${i}.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; rockN[i] = t }).catch(() => {})),
        ...[2, 3, 4, 5].map((i) => Assets.load(`/art/island/blocks3/rock-${i}-side.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; sideW.push(t) }).catch(() => {})),
        ...[0, 1, 2, 3].map((i) => Assets.load(`/art/atc-island/blocks/wall-${i}.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; wallB[i] = t }).catch(() => {})),
        ...Array.from({ length: 3 }, (_, i) => Assets.load(`/art/island/harbor/deck-top-${i}.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; deckT[i] = t }).catch(() => {})),
        Assets.load('/art/island/harbor/plank-block-a.png').then((t: Texture) => { t.source.scaleMode = 'nearest'; plankB = t }).catch(() => {}),
        ...VEG_FILES.map((n) => Assets.load(`/art/island/veg/${n}.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; vegT[n] = t }).catch(() => {})),
        ...PROP_FILES.map((n) => Assets.load(`/art/atc-island/props/${n}.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; propT[n] = t }).catch(() => {})),
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
      // the SE point: past the ring's mean radius on the point's azimuth = bare rock finger
      const pointK = (tx: number, ty: number) => {
        const th = Math.atan2(ty - CY, tx - CX)
        const d = Math.hypot(tx - CX, ty - CY)
        const w = Math.abs(((th - 0.05 + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
        return w < 0.26 && d > 21 ? 1 : 0
      }
      const bandJ = (tx: number, ty: number) => (vnoise(tx / 12 + 31, ty / 12 + 47) - 0.5) * 1.2
      // THE ACROPOLIS GRAMMAR (Ash's "flat and boring" verdict, 2026-07-16):
      // the island TIERS UP to the room. Beach 0 → meadow 1 → working apron 2
      // (north/west/east only) → THE ROOM FLOOR 3 — and the sea-facing south
      // lip drops SHEER, two courses straight to the meadow. The ruin ring is
      // ASYMMETRIC: the NW quarter stands 2-3 courses (a real building corner,
      // roof gone), the mid runs are stubs, the whole SE quarter is FALLEN.
      const lvlOf = (tx: number, ty: number) => {
        if (coastDs(tx, ty) <= 0) return -1
        if (isletAt(tx, ty)) return 1 // skerries: bare rock nubs, one course over the water
        const w = wallAt(tx, ty)
        if (w) {
          const ws = wallState(tx, ty)
          if (ws === 'fallen') return 3 // down to the floor — rubble carries the read
          if (ws === 'tall') {
            if ((tx === RX0 && ty === RY0) || (tx === RX0 + 3 && ty === RY0)) return 6 // corner post + door jamb
            return 5
          }
          void WINDOWS
          return 4
        }
        const pd = plateauD(tx, ty)
        if (pd <= 0.55) return 3 // THE ROOM FLOOR, high on its acropolis
        if (pd <= 4.5 + bandJ(tx, ty)) {
          // the apron wraps every side EXCEPT the sea-facing south arc — that
          // lip stays a raw two-course cliff (the from-the-sea drama)
          const thR = Math.atan2(ty - (RY0 + 12), tx - (RX0 + 12))
          if (!(thR > 0.5 && thR < 2.6)) return 2
        }
        const cd = cragD(tx, ty)
        if (cd < 1.7) return 4 // the crag crown climbs — the dark silhouette needs height
        if (cd < 3.1) return 2
        const kd = Math.hypot(tx - KNOLL.x, ty - KNOLL.y)
        if (kd < 2.4) return 2
        if (pointK(tx, ty)) return Math.hypot(tx - CX, ty - CY) < 29 ? 2 : 1 // the point: raised spine at the root, low finger to the tip
        // the ring: sand shelf on beach azimuths (wider in the designed sand
        // windows), meadow otherwise; cliff azimuths hold the meadow to the water
        const d = DIST[ty * GRID + tx]
        const th = thJit(tx, ty)
        const cf = smooth(0.35, 0.6, cliffK(th))
        const shelfT = (1.6 + 2.6 * sandK(th)) * (1 - cf)
        return d <= shelfT + bandJ(tx, ty) * (1 - cf) ? 0 : 1
      }
      const LV = new Int8Array(GRID * GRID)
      for (let ty = 0; ty < GRID; ty++) for (let tx = 0; tx < GRID; tx++) LV[ty * GRID + tx] = lvlOf(tx, ty)
      // coast cleaners (the hub's notch killer), ring levels only — the
      // authored terrace/knoll/crag contours are decisions, never smoothed
      for (let pass = 0; pass < 2; pass++) {
        const prev = Int8Array.from(LV)
        for (let ty = 1; ty < GRID - 1; ty++) for (let tx = 1; tx < GRID - 1; tx++) {
          const L = prev[ty * GRID + tx]
          if (L < 0 || L > 1) continue
          const nb = [prev[ty * GRID + tx + 1], prev[ty * GRID + tx - 1], prev[(ty + 1) * GRID + tx], prev[(ty - 1) * GRID + tx]]
          if (nb.includes(L)) continue
          const land = nb.filter((v) => v >= 0)
          if (!land.length) continue
          const counts = new Map<number, number>()
          for (const v of land) counts.set(v, (counts.get(v) || 0) + 1)
          let best = L, bc = 1
          for (const [v, c] of counts) if (c > bc) { best = v; bc = c }
          if (bc >= 2) LV[ty * GRID + tx] = best
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
      // the room's ground zones (A2.00A truth via atc-layout)
      const inRoomFloor = (tx: number, ty: number) =>
        tx > RX0 && tx < RX1 && ty > RY0 && ty < RY1 && !wallAt(tx, ty)
      const onCorridor = (tx: number, ty: number) =>
        tx >= RX0 - 1 && tx <= RX1 && ty >= RY0 - 2 && ty <= RY0 - 1
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

      // THE 3D TILE UNIT (the hub's drawColumn, mirrored): a downhill tile is a
      // real BLOCK COLUMN — the FULL 64x64 block sprite stacked one course per
      // level, 1:1 pixels, no crops. Painter's order does all the masking.
      const drawColumn = (bx2: number, by2: number, m: number, toSea: boolean, tx2: number, ty2: number, zBase2: number, grassy = false, dark = false, wall: string | null = null) => {
        if (!sideW.length || m <= 0) return
        const turf = grassy && !toSea && !wall
        const pick = (k: number) => Math.floor(vnoise(tx2 / 2.7 + 1.3 + k * 0.13, ty2 / 2.7 + 8.1 + k * 0.21) * sideW.length) % sideW.length
        if (toSea) {
          // submerged echo course: the cliff foot runs 12px under the waterline
          const wet = new Sprite(sideW[pick(m)])
          wet.anchor.set(0.5, 18 / 64)
          wet.position.set(bx2, by2 + (m - 1) * STEP + 12)
          wet.tint = dark ? 0x6e5e54 : 0xb8a898
          if (DBG) wet.tint = 0x2020ff
          wet.zIndex = zBase2; world.addChild(wet)
        } else {
          // dark underlay plugs the 1px foot pinhole; reads as contact shadow
          const under = new Sprite(sideW[pick(m + 1)])
          under.anchor.set(0.5, 18 / 64)
          under.position.set(bx2, by2 + (m - 1) * STEP + 8)
          under.tint = turf ? 0x556831 : 0x4c423a
          if (DBG) under.tint = 0x20ff60
          under.zIndex = zBase2; world.addChild(under)
        }
        for (let k = m - 1; k >= 0; k--) { // bottom course first, uppers mask
          const useWall = !!wall && wallB.filter(Boolean).length > 0
          const wPool = wallB.filter(Boolean)
          const seg = new Sprite(useWall ? wPool[pick(k) % wPool.length] : sideW[pick(k)])
          seg.anchor.set(0.5, 18 / 64)
          seg.position.set(bx2, by2 + k * STEP)
          const drift = 0.96 + 0.06 * vnoise(tx2 / 6 + 2.2, ty2 / 6 + 7.7) - 0.02 * k
          if (useWall) {
            // the real wall-stub blocks — muted toward true greige (raw they
            // read as an orange picket fence), the south wall a breath warmer
            seg.scale.x = vnoise(tx2 / 3 + 5, ty2 / 3 + 9) > 0.5 ? -1 : 1
            seg.tint = wall === 'exterior'
              ? tint24(drift * 0.82, drift * 0.77, drift * 0.72)
              : tint24(drift * 0.74, drift * 0.74, drift * 0.72)
          } else if (wall) {
            // fallback greige tint on rock courses if the wall family is absent
            seg.tint = wall === 'exterior'
              ? tint24(drift * 0.78, drift * 0.68, drift * 0.6)
              : tint24(drift * 0.74, drift * 0.71, drift * 0.65)
          } else if (turf) {
            // grassy bank matched to the meadow's mean value (the hub's turf riser)
            const tex2 = m >= 2 ? 0.9 + 0.16 * vnoise(tx2 / 2.3 + 6, ty2 / 2.3 + k * 0.7 + 2) : 1
            const d2 = drift * tex2 * (0.97 - 0.02 * (m - 1 - k))
            seg.tint = m === 1 ? tint24(d2 * 0.55, d2 * 0.63, d2 * 0.36) : tint24(d2 * 0.56, d2 * 0.62, d2 * 0.35)
          } else if (dark) {
            // the silhouette masses (crag / point / skerries): dark basalt-brown,
            // red pulled down — c3's dark-first value, never bright terracotta
            seg.tint = tint24(drift * 0.5, drift * 0.46, drift * 0.44)
          } else {
            const vv = Math.min(255, Math.round(drift * 255))
            seg.tint = (vv << 16) | (vv << 8) | vv
          }
          if (DBG) seg.tint = turf ? 0x20ff60 : 0xff2020
          seg.zIndex = zBase2 + 1 + (m - 1 - k)
          world.addChild(seg)
        }
      }

      // ---- THE LAND TILES ----
      const gt = flatG.filter(Boolean).length ? flatG.filter(Boolean) : grassV.filter(Boolean)
      const st = flatS.filter(Boolean).length ? flatS.filter(Boolean) : sandV.filter(Boolean)
      // bare-rock tops: the normalized rock family (round-1 lesson: cropping the
      // block sides' top diamonds printed brick-wall pattern seen from above)
      const rockTopTex: Texture[] = rockN.filter(Boolean).length
        ? rockN.filter(Boolean)
        : sideW.map((t) => new Texture({ source: t.source, frame: new Rectangle(0, 0, 64, 36) }))
      // the wall's own cut-top (rubble edges included) — top + face, one material
      const wallTopTex: Texture[] = wallB.filter(Boolean).map((t) => new Texture({ source: t.source, frame: new Rectangle(0, 0, 64, 38) }))
      for (let ty = 0; ty < GRID; ty++) {
        for (let tx = 0; tx < GRID; tx++) {
          const dx = tx - CX, dy = ty - CY
          if (dx * dx + dy * dy > SEA_R * SEA_R) continue
          const L = eLvl(tx, ty)
          if (L < 0) continue
          const lift = L <= 0 ? 0 : L * STEP
          const bx = isoX(tx, ty), by = isoY(tx, ty) - lift + GY
          const zBase = (tx + ty) * 4000 + lift * 2
          const rock = rockTop(tx, ty)
          const wRole = wallAt(tx, ty)
          const floorC = inRoomFloor(tx, ty)
          const eastGap = tx === RX1 && !wRole && ty > RY0 && ty < RY1 // the broken wall's open runs
          const corr = !wRole && !floorC && !eastGap && plateauD(tx, ty) <= 0.55
            && (onCorridor(tx, ty) || (ty === RY0 && tx >= RX0 && tx <= RX1)) // the hall + the door threshold
          const isSand = L === 0 && !rock && smooth(0.35, 0.6, cliffK(Math.atan2(dy, dx))) < 0.5

          // THE BLOCK COLUMN: if ANY of the 8 neighbours sits lower, this tile
          // is a real column down to the DEEPEST of them (silhouette-coast law)
          {
            let floorMin = L, toSea = false
            for (const [ox, oy] of [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) {
              const nl = eLvl(tx + ox, ty + oy)
              if (nl < 0) toSea = true
              const fl = nl < 0 ? 0 : nl
              if (fl < floorMin) floorMin = fl
            }
            if (L > floorMin) {
              const grassy = !isSand && !rock && !wRole
              drawColumn(bx, by, L - floorMin, toSea, tx, ty, zBase, grassy, rock, wRole)
              for (const [ox, oy] of [[1, 0], [0, 1]] as [number, number][]) {
                if (eLvl(tx + ox, ty + oy) >= 0) continue
                const ex = isoX(tx + ox * 0.5, ty + oy * 0.5), ey = isoY(tx + ox * 0.5, ty + oy * 0.5) + GY
                foamCollar(ex, ey + 2, zBase, tx + ox + ty + oy)
              }
            }
          }

          // TOP: one flat blended diamond (64x36 on the 64x32 lattice, the
          // family's own 2px melt), anchor centred, - the drawn faces carry 3D
          const ws = wRole ? wallState(tx, ty) : null
          const wedge = (floorC || eastGap) && jungleWedgeK(tx, ty) + (hash(tx * 3.7, ty * 1.9) - 0.5) * 0.3 > 0.55
          const pool = ws === 'fallen' && rockTopTex.length ? rockTopTex
            : wRole && wallTopTex.length ? wallTopTex
              : wedge ? gt
                : wRole || floorC || eastGap || corr ? st
                  : rock && rockTopTex.length ? rockTopTex : isSand ? st : gt
          if (!pool.length) continue
          const g = rock
            ? pool[Math.floor(vnoise(tx / 6 + 4.2, ty / 6 + 1.8) * pool.length) % pool.length]
            : pool[Math.floor(hash(tx * 5.1 + 2, ty * 2.9 + 4) * pool.length) % pool.length]
          const top = new Sprite(g)
          top.anchor.set(0.5, 0.5)
          top.position.set(bx, by)
          top.zIndex = zBase + 5
          // rock-n diamonds carry hard edge outlines that tile into a brick
          // grid — overlap + mirror melts them the way the grass family melts
          if (rock) top.scale.set((hash(tx * 7.7, ty * 5.3) > 0.5 ? -1 : 1) * 1.14, 1.14)
          const bL = Math.max(eLvl(tx - 1, ty), eLvl(tx, ty - 1))
          const ao = bL > L ? Math.min(0.24, (bL - L) * 0.13) : 0
          const rk = rakeAt(tx, ty)
          if (ws === 'fallen') {
            // the collapsed quarter: broken masonry rubble at floor level
            const grain = 0.86 + 0.12 * hash(tx * 2.9, ty * 1.7)
            top.scale.set((hash(tx * 7.7, ty * 5.3) > 0.5 ? -1 : 1) * 1.14, 1.14)
            top.tint = tint24(grain * 0.72, grain * 0.69, grain * 0.64)
          } else if (wRole && wallTopTex.length) {
            // the wall block's own cut top (rubble edge intact), near-raw
            const grain = 0.95 + 0.07 * hash(tx * 2.1, ty * 3.3)
            top.scale.x = hash(tx * 4.9, ty * 2.7) > 0.5 ? -1 : 1
            top.tint = wRole === 'exterior'
              ? tint24(grain * 1.0, grain * 0.94, grain * 0.88)
              : tint24(grain * 0.96, grain * 0.95, grain * 0.92)
          } else if (wRole) {
            // fallback: pale greige composite cap over the sand grain
            const grain = 0.96 + 0.06 * hash(tx * 2.1, ty * 3.3)
            top.tint = wRole === 'exterior'
              ? tint24(grain * 0.8, grain * 0.72, grain * 0.64)
              : tint24(grain * 0.78, grain * 0.75, grain * 0.69)
          } else if (wedge) {
            // the jungle's wedge: the east third of the floor lost to green —
            // deeper and cooler than the meadow (it grows in the room's shade)
            const patch = 0.9 + 0.1 * vnoise(tx / 6 + 8, ty / 6 + 4)
            let hexW = rampAt(GRASS_RAMP, 0.85)
            const cd2 = cableD(tx, ty)
            if (cd2 < 0.45) hexW = mix(hexW, 0x27383c, 0.55) // the cable's dark run
            top.tint = warmCool(tintFor(shadeHex(hexW, patch * 0.86 * (1 - ao)), GRASS_BASE), rk * 0.6)
          } else if (floorC || eastGap) {
            // THE CARPET (the photos' gray-green broadloom, gone outdoor):
            // TEMP tint over the fine sand grain until the real family lands.
            // Faint tile checker; wall-foot AO pools around the perimeter free.
            // THE MESHING (Ash's steer): moss blooms around the through-floor
            // palm's crack; beach sand drifts in over the threshold; the east
            // collapses feed green in from their gaps.
            const checker = (tx + ty) % 2 === 0 ? 1 : 0.955
            const grain = 0.985 + 0.03 * hash(tx * 1.7, ty * 2.9)
            const wear = 0.94 + 0.1 * vnoise(tx / 9 + 3, ty / 9 + 12)
            let hexF = 0x757d6b // darker than round 1 — the floor recedes, the screens carry the light
            const palmD = Math.hypot(tx - FEATURE_PALM[0], ty - FEATURE_PALM[1])
            if (palmD < 2.2) hexF = mix(hexF, 0x74854e, (1 - palmD / 2.2) * 0.75)
            const doorD = Math.hypot(tx - (DOOR[0][0] + 0.5), ty - DOOR[0][1])
            if (doorD < 3) hexF = mix(hexF, 0xd8c49a, (1 - doorD / 3) * 0.55)
            // the wedge's advancing edge: moss creeps ahead of the grass line
            const wk = jungleWedgeK(tx, ty)
            if (wk > 0) hexF = mix(hexF, 0x7d8f56, wk * 0.6)
            const cd2 = cableD(tx, ty)
            if (cd2 < 0.45) hexF = mix(hexF, 0x27383c, 0.55) // the cable's dark run
            top.tint = warmCool(shadeHex(tintFor(hexF, SAND_BASE), checker * grain * wear * (1 - ao * 1.3)), rk * 0.4)
          } else if (corr) {
            // the hallway: worn pale composite, the walk's traffic printed in
            const grain = 0.98 + 0.04 * hash(tx * 2.3, ty * 1.9)
            const pk = 1 - smooth(0.6, 1.35, pathD(tx, ty))
            let hex = tintFor(0xc7bfae, SAND_BASE)
            if (pk > 0) hex = mix(hex, 0xb2a78e, pk * 0.5)
            top.tint = warmCool(shadeHex(hex, grain * (1 - ao * 1.2)), rk * 0.4)
          } else if (rock) {
            // the dark masses: basalt-brown, one hard sun across them — a lit
            // warm crown up-sun, deep shade down-sun (c3's mass modelling)
            const drift = 0.82 + 0.12 * vnoise(tx / 5 + 8, ty / 5 + 3)
            const lit = 1 + 0.35 * rk
            top.tint = warmCool(tint24(drift * 0.6 * lit, drift * 0.53 * lit, drift * 0.48), rk * 1.2)
          } else if (isSand) {
            const ds = coastDs(tx, ty)
            const t = Math.min(1, ds / 4)
            const dune = 0.965 + 0.06 * vnoise(tx / 16 + 3, ty / 16 + 5)
            const grain = 0.994 + 0.012 * hash(tx * 1.3, ty * 2.1)
            let hex = tintFor(rampAt(SAND_RAMP, t), SAND_BASE)
            // the walk prints on the beach too: a trodden, slightly damp band
            const pk = 1 - smooth(0.6, 1.35, pathD(tx, ty))
            if (pk > 0) hex = mix(hex, 0xcaa878, pk * 0.4)
            top.tint = warmCool(shadeHex(hex, dune * grain), rk * 0.5)
          } else {
            const t = Math.min(1, L / 3)
            // macro value drift: broad sun-pool / hollow patches so the meadow
            // reads as a lit FIELD at vista zoom, never one flat green value
            const macro = 0.93 + 0.12 * vnoise(tx / 24 + 9, ty / 24 + 1)
            const patch = 0.96 + 0.08 * vnoise(tx / 14 + 2, ty / 14 + 6)
            const grain = 0.995 + 0.01 * hash(tx * 1.3, ty * 2.1)
            let hex = rampAt(GRASS_RAMP, t)
            // the worn path: the walk carves its earth ribbon into the meadow
            const pk = 1 - smooth(0.6, 1.35, pathD(tx, ty))
            if (pk > 0) hex = mix(hex, PATH_HEX, pk * 0.9)
            // the cable run crossing the open ground toward the lighthouse
            const cd2 = cableD(tx, ty)
            if (cd2 < 0.45) hex = mix(hex, 0x27383c, 0.5)
            // grove shade pools: authored vegetation sites darken their floor
            const vk = vegK(tx, ty)
            top.tint = warmCool(tintFor(shadeHex(hex, macro * patch * grain * (1 - ao) * (1 - vk * 0.14)), GRASS_BASE), rk)
          }
          world.addChild(top)
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
        if (Ls < 0 || !st.length) continue
        const liftS = (Ls > 0 ? Ls * STEP : 0) + STEP * STEPS.lift
        const bxS = isoX(sx, sy), byS = isoY(sx, sy) - liftS + GY
        const zBaseS = (sx + sy) * 4000 + liftS * 2
        const pad = new Sprite(st[Math.floor(hash(sx * 3.7, sy * 1.3) * st.length) % st.length])
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
        const lift = L * STEP
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
      // the stations: south counter row + the island rows (photo truth). The
      // front sprite carries lit screens (glow pooled later); N-facing island
      // desks show monitor backs when that sprite lands.
      for (const s of [...STATIONS, ACTIVITY_STATION]) {
        const cx2 = s.at[0] + (s.w - 1) / 2, cy2 = s.at[1]
        const key = s.face === 'N' && propT['desk-back'] ? 'desk-back' : 'desk-front'
        const sp = propAt(key, cx2, cy2, { mirror: hash(cx2 * 3.1, cy2 * 1.7) > 0.5 && s.kind === 'counter' })
        if (sp && s.face !== 'N') {
          // the screen pool is the room's LANTERN (TavernWorld's trick: the
          // ground stays dark so the light gets to be an event)
          const g = new Sprite(foamTex)
          g.anchor.set(0.5)
          g.tint = 0x2ec4b6; g.blendMode = 'add'; g.alpha = 0.22
          g.width = 62; g.height = 24
          const L = Math.max(0, eLvl(Math.round(cx2), Math.round(cy2)))
          g.position.set(isoX(cx2, cy2 + 0.7), isoY(cx2, cy2 + 0.7) + GY - L * STEP)
          g.zIndex = (Math.round(cx2) + Math.round(cy2)) * 4000 + L * STEP * 2 + 12
          world.addChild(g)
          glows.push({ sp: g, ph: hash(cx2, cy2) * 6.28, a: 0.12 })
        }
      }
      propAt('teacher-desk', TEACHER.at[0] + (TEACHER.w - 1) / 2, TEACHER.at[1], {})
      propAt('sink-counter', SINK.at[0], SINK.at[1] + (SINK.len - 1) / 2, {})
      // the annex rack sits half-buried below the broken east wall (sink puts
      // its feet under the meadow; the undergrowth swallows the base)
      propAt('annex-rack', ANNEX.rack[0], ANNEX.rack[1], { sink: 8 })
      if (vegT['bush-a']) {
        const b = new Sprite(vegT['bush-a'])
        b.anchor.set(0.5, 0.9)
        const L = Math.max(0, eLvl(ANNEX.rack[0], ANNEX.rack[1]))
        b.scale.set(0.7)
        b.position.set(isoX(ANNEX.rack[0] - 0.2, ANNEX.rack[1] + 0.5), isoY(ANNEX.rack[0] - 0.2, ANNEX.rack[1] + 0.5) + GY - L * STEP + 6)
        b.zIndex = (ANNEX.rack[0] + ANNEX.rack[1]) * 4000 + L * STEP * 2 + 340
        world.addChild(b)
      }
      // the teaching wall: the whiteboard stands against the west wall's inner
      // face (its stubs), read from everywhere in the room
      propAt('whiteboard', RX0 + 0.7, (WHITEBOARD.y0 + WHITEBOARD.y1) / 2, { z: 330 })
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
        psh.position.set(isoX(FEATURE_PALM[0], FEATURE_PALM[1]) + 16 * SHADOW.dx, isoY(FEATURE_PALM[0], FEATURE_PALM[1]) + GY - pL * STEP + 3)
        psh.alpha = 0.34; psh.tint = 0x2a2350
        psh.zIndex = (FEATURE_PALM[0] + FEATURE_PALM[1]) * 4000 + pL * STEP * 2 + 8
        world.addChild(psh)
        const fp = new Sprite(vegT['coco-v2'])
        fp.anchor.set(0.5, 0.97)
        fp.scale.set(1.12)
        fp.position.set(isoX(FEATURE_PALM[0], FEATURE_PALM[1]), isoY(FEATURE_PALM[0], FEATURE_PALM[1]) + GY - pL * STEP + 5)
        fp.zIndex = (FEATURE_PALM[0] + FEATURE_PALM[1]) * 4000 + pL * STEP * 2 + 330
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
        p.position.set(isoX(rp.at[0], rp.at[1]), isoY(rp.at[0], rp.at[1]) + GY - Lp * STEP + 4)
        p.zIndex = (rp.at[0] + rp.at[1]) * 4000 + Lp * STEP * 2 + 335
        world.addChild(p)
        sways.push({ sp: p, amp: 0.013, w: 0.5 + 0.4 * hash(rp.at[0], rp.at[1] * 3), ph: hash(rp.at[1], rp.at[0]) * 6.28 })
      }
      // the cable's glow nodes: the run breathes teal from the activity desk
      // all the way to the lamp room (phase keyed by run distance — the pulse
      // TRAVELS the line, desk to beacon)
      {
        let runD = 0
        for (let i = 0; i < CABLE.length - 1; i++) {
          const [x0, y0] = CABLE[i], [x1, y1] = CABLE[i + 1]
          const segLen = Math.hypot(x1 - x0, y1 - y0)
          for (let s = 0; s < segLen; s += 1.6) {
            const u = s / segLen
            const nx = x0 + (x1 - x0) * u, ny = y0 + (y1 - y0) * u
            const Ln = Math.max(0, eLvl(Math.round(nx), Math.round(ny)))
            const dot = new Sprite(foamTex)
            dot.anchor.set(0.5)
            dot.tint = 0x36e2cf; dot.blendMode = 'add'
            dot.width = 16; dot.height = 8
            dot.position.set(isoX(nx, ny), isoY(nx, ny) + GY - Ln * STEP)
            dot.alpha = 0.3
            dot.zIndex = (Math.round(nx) + Math.round(ny)) * 4000 + Ln * STEP * 2 + 14
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
        f.position.set(isoX(fx2, fy2), isoY(fx2, fy2) + GY - fL * STEP + 4)
        f.zIndex = (fx2 + fy2) * 4000 + fL * STEP * 2 + 310
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
        beacon.position.set(isoX(KNOLL.x, KNOLL.y + 0.4), isoY(KNOLL.x, KNOLL.y + 0.4) + GY - L * STEP - 268)
        beacon.alpha = 0.32
        beacon.zIndex = (KNOLL.x + KNOLL.y) * 4000 + L * STEP * 2 + 390
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
          pool.position.set(isoX(gv.x, gv.y) + 8, isoY(gv.x, gv.y) + GY - gL * STEP)
          pool.alpha = 0.26; pool.tint = 0x241d40
          pool.zIndex = (Math.round(gv.x) + Math.round(gv.y)) * 4000 + gL * STEP * 2 + 5
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
          const lift = L * STEP
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
        if (n < 3) console.warn(`[atc] grove ${gi} (${GROVES[gi].note}) planted only ${n} — site likely off the meadow`)
      })

      // the tall ruin CASTS: soft shade thrown down-sun from the standing NW
      // courses onto the floor (the missing cast shadow was the hub's P1 lesson)
      for (let ty2 = RY0; ty2 <= RY1; ty2++) for (let tx2 = RX0; tx2 <= RX1; tx2++) {
        if (wallState(tx2, ty2) !== 'tall') continue
        const sh = new Sprite(shadowTex)
        sh.anchor.set(0.5)
        sh.width = 84; sh.height = 30
        sh.position.set(isoX(tx2, ty2) + 26, isoY(tx2, ty2) + GY - 3 * STEP + 14)
        sh.alpha = 0.24; sh.tint = 0x241d40
        sh.zIndex = (tx2 + ty2) * 4000 + 3 * STEP * 2 + 7
        world.addChild(sh)
      }
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
          return isoY(px, py) + GY - (dk ? dk.lift : L > 0 ? L * STEP : 0)
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
            const gy = isoY(ctx, cty) + GY - (cl > 0 ? cl * STEP : 0)
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
