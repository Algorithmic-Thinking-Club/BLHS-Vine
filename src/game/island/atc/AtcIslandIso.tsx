import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import {
  isoX, isoY, hash, vnoise, shadeHex, rampAt, tintFor, mix,
  loadWaterVariants, configSeaTile, animSwells, type SwellSprite, HW, HH, DEPTH_RANGE,
} from '../../ocean'
import {
  CX, CY, GRID, SEA_R, coastDs, shelfW, lagoonK, cliffK, sandK,
  plateauD, KNOLL, cragD, ISLETS,
} from './atc-terrain'
import { DOCK, dockAt, pathD, vegK, GROVES, SHADOW } from './atc-layout'
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
      let waterV: Texture[] = []
      const deckT: Texture[] = []
      let plankB: Texture | undefined
      // the approved beach/hub vegetation kit (REUSE is the law — §14.1's ring)
      const vegT: Record<string, Texture> = {}
      const VEG_FILES = ['coco-v1', 'coco-v2', 'coco-v3', 'palm-a', 'palm-b', 'bush-a', 'bush-b', 'fernclump-1', 'boulder-1', 'boulder-2']
      await Promise.all([
        loadWaterVariants().then((v) => { waterV = v }),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-n/${i}.png`).then((t: Texture) => { sandV[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/grass-n/${i}.png`).then((t: Texture) => { grassV[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/flat/grass-${i}.png?v=7`).then((t: Texture) => { t.source.scaleMode = 'nearest'; flatG[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/flat/sand-${i}.png?v=7`).then((t: Texture) => { t.source.scaleMode = 'nearest'; flatS[i] = t }).catch(() => {})),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/rock-n/${i}.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; rockN[i] = t }).catch(() => {})),
        ...[2, 3, 4, 5].map((i) => Assets.load(`/art/island/blocks3/rock-${i}-side.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; sideW.push(t) }).catch(() => {})),
        ...Array.from({ length: 3 }, (_, i) => Assets.load(`/art/island/harbor/deck-top-${i}.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; deckT[i] = t }).catch(() => {})),
        Assets.load('/art/island/harbor/plank-block-a.png').then((t: Texture) => { t.source.scaleMode = 'nearest'; plankB = t }).catch(() => {}),
        ...VEG_FILES.map((n) => Assets.load(`/art/island/veg/${n}.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; vegT[n] = t }).catch(() => {})),
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
      const lvlOf = (tx: number, ty: number) => {
        if (coastDs(tx, ty) <= 0) return -1
        if (isletAt(tx, ty)) return 1 // skerries: bare rock nubs, one course over the water
        // the authored architecture first: terrace, knoll, crag ridge
        if (plateauD(tx, ty) <= 0.55) return 2
        const cd = cragD(tx, ty)
        if (cd < 1.7) return 3
        if (cd < 3.1) return 2
        const kd = Math.hypot(tx - KNOLL.x, ty - KNOLL.y)
        if (kd < 2.4) return 2
        if (pointK(tx, ty)) return Math.hypot(tx - CX, ty - CY) < 24 ? 2 : 1 // the point: raised spine at the root, low finger to the tip
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
      const drawColumn = (bx2: number, by2: number, m: number, toSea: boolean, tx2: number, ty2: number, zBase2: number, grassy = false, dark = false) => {
        if (!sideW.length || m <= 0) return
        const turf = grassy && !toSea
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
          const seg = new Sprite(sideW[pick(k)])
          seg.anchor.set(0.5, 18 / 64)
          seg.position.set(bx2, by2 + k * STEP)
          const drift = 0.96 + 0.06 * vnoise(tx2 / 6 + 2.2, ty2 / 6 + 7.7) - 0.02 * k
          if (turf) {
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
              const grassy = !isSand && !rock
              drawColumn(bx, by, L - floorMin, toSea, tx, ty, zBase, grassy, rock)
              for (const [ox, oy] of [[1, 0], [0, 1]] as [number, number][]) {
                if (eLvl(tx + ox, ty + oy) >= 0) continue
                const ex = isoX(tx + ox * 0.5, ty + oy * 0.5), ey = isoY(tx + ox * 0.5, ty + oy * 0.5) + GY
                foamCollar(ex, ey + 2, zBase, tx + ox + ty + oy)
              }
            }
          }

          // TOP: one flat blended diamond (64x36 on the 64x32 lattice, the
          // family's own 2px melt), anchor centred, - the drawn faces carry 3D
          const pool = rock && rockTopTex.length ? rockTopTex : isSand ? st : gt
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
          if (rock) {
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

      // ---- THE GROVES: the authored vegetation sites (atc-layout GROVES, each
      // with its reason) planted from the APPROVED palm/bush kit — scale/mirror
      // variance, violet cast shadows under one sun, canopy sway registered.
      // These are the island's dark composition masses (c3's green-on-gold).
      const sways: { sp: Sprite; amp: number; w: number; ph: number }[] = []
      const shadowTex = radial(64, [[0, 'rgba(22,17,54,0.55)'], [1, 'rgba(22,17,54,0)']])
      const palmKeys = ['coco-v1', 'coco-v2', 'coco-v3', 'palm-a', 'palm-b'].filter((k) => vegT[k])
      const bushKeys = ['bush-a', 'bush-b', 'fernclump-1'].filter((k) => vegT[k])
      const grovePlanted: number[] = []
      GROVES.forEach((gv, gi) => {
        let planted = 0
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
