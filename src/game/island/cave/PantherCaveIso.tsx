import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js'
import { isoX, isoY, hash, vnoise } from '../../ocean'
import {
  GRID, lvlAt, HEARTH, MOUTH, FALL, SHAFTS, TRENCH, BRIDGE_TILES, SPAWNS,
  STATIONS,
} from './cave-layout'
import { getPois, getSeams } from './cave-mechanics'
import { reportCaveAudit } from './cave-audit'

// THE PANTHER'S MAW RENDERER — P2 "THE ROOM READS" (Session C's lane,
// file-disjoint sibling of IslandMapIso/AtcIslandIso, same construction
// language). Dev route: ?scene=panther-cave.
// Spec: docs/place-specs/panther-cave-interior.md · target: cave-concepts/P0-PICK.png.
//
// P2 state: the cave's OWN families (public/art/island/cave/: floor diamonds,
// wall face strips harvested off the aperture hero's flanks, molten diamonds)
// + the BAKED PER-TILE THREE-SOURCE LIGHT MODEL (hearth / mouth-wedge / lava,
// with the shafts as the only cool notes) + the A4 aperture hero on the NE rim.
// The stage grade below is the PROPOSAL for the P2 atmosphere gate — Ash locks
// it there; until that lock it is explicitly tunable.

const clampB = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
const tint24 = (r: number, g: number, b: number) =>
  (clampB(Math.round(r * 255)) << 16) | (clampB(Math.round(g * 255)) << 8) | clampB(Math.round(b * 255))
const sstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t)
}

export default function PantherCaveIso() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let destroyed = false
    let instance: Application | null = null

    const start = async () => {
      const app = new Application()
      await app.init({ background: '#070609', resizeTo: host, antialias: false })
      if (destroyed) { app.destroy(true); return }
      instance = app
      host.appendChild(app.canvas)

      const params = new URLSearchParams(location.search)
      const ZOOM = Number(params.get('zoom') || 1.0) || 1.0
      const cam = (params.get('cam') || '45,44').split(',').map(Number)
      const camTx = cam[0] ?? 45, camTy = cam[1] ?? 44
      const STEP = Number(params.get('step') || 20) // world px per elevation level
      const SOCKETS = params.get('sockets') !== '0' // honest placeholder stakes (default ON)
      const DBG = !!params.get('dbg')

      // the cave's OWN families: harvested+normalized floor diamonds (the
      // light model owns value), the drawn A2 basalt BLOCK kit (walls and
      // risers — the 3D tile system is the map's one construction language),
      // the molten core diamonds, and the A5 hearth hero.
      const FLOOR_ALT = params.get('floor') === '1' // A/B: 1 = organic basalt, default = hex causeway
      const floorT: Texture[] = []
      const lavaT: Texture[] = []
      const sideW: Texture[] = []
      let hearthT: Texture | undefined
      await Promise.all([
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/island/cave/${FLOOR_ALT ? 'floor' : 'floor2'}/top-${i}.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; floorT[i] = t }).catch(() => {})),
        ...Array.from({ length: 24 }, (_, i) => Assets.load(`/art/island/cave/lava/top-${i}.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; lavaT[i] = t }).catch(() => {})),
        ...[0, 1, 2, 3].map((i) => Assets.load(`/art/island/cave/blocks/block-${i}.png`).then((t: Texture) => { t.source.scaleMode = 'nearest'; sideW.push(t) }).catch(() => {})),
        Assets.load('/art/island/cave/props/hearth.png').then((t: Texture) => { t.source.scaleMode = 'nearest'; hearthT = t }).catch(() => {}),
      ])
      if (destroyed) return
      // the mechanical gate: the room must hold as DATA before pixels are judged
      reportCaveAudit()

      const world = new Container()
      world.scale.set(ZOOM)
      world.sortableChildren = true
      app.stage.addChild(world)
      world.x = app.screen.width / 2 - isoX(camTx, camTy) * ZOOM
      world.y = app.screen.height * 0.5 - isoY(camTx, camTy) * ZOOM
      world.boundsArea = new Rectangle(-20000, -9000, 40000, 24000)

      // dev probe (the engine family's own)
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

      // ---- THE ATMOSPHERE GRADE (P2 PROPOSAL — Ash locks at this gate) ----
      // moody-dark with hot pools: slight crush, warmth preserved in the mids
      const grade = new ColorMatrixFilter()
      grade.brightness(1.0, false); grade.saturate(0.2, true); grade.contrast(0.13, true)
      const gm = grade.matrix; gm[0] *= 1.05; grade.matrix = gm
      world.filters = [grade]

      const floors = floorT.filter(Boolean)
      const sides = sideW.filter(Boolean)
      const lavas = lavaT.filter(Boolean)
      const bridgeSet = new Set(BRIDGE_TILES.map(([x, y]) => y * GRID + x))
      const eLvl = lvlAt

      // ---- THE BAKED THREE-SOURCE LIGHT MODEL (per-tile, computed once) ----
      // The families are normalized to their LIT base color; this field is the
      // only thing allowed to move value across the room (spec §3.1: darkness
      // is the map's own graded base, never a black overlay).
      const trenchNear = (tx: number, ty: number) => {
        const vx = TRENCH.x1 - TRENCH.x0, vy = TRENCH.y1 - TRENCH.y0
        const t = Math.max(0, Math.min(1, ((tx - TRENCH.x0) * vx + (ty - TRENCH.y0) * vy) / (vx * vx + vy * vy)))
        return Math.hypot(tx - (TRENCH.x0 + vx * t), ty - (TRENCH.y0 + vy * t))
      }
      // the mouth wedge: a widening cone from the aperture down the grand stair
      const mdx = HEARTH[0] - MOUTH[0], mdy = HEARTH[1] - MOUTH[1]
      const mlen = Math.hypot(mdx, mdy)
      const mux = mdx / mlen, muy = mdy / mlen
      // station lamps: each function's own small warm pool (example3's rule —
      // every place the player uses reads as a lit place). They RIDE the
      // hearth's warm family per spec §1: dressing, never competing.
      const LAMPS: [number, number, number][] = STATIONS
        .filter((s) => ['C3-chart-table', 'C4-principal-desk', 'C5-lectern', 'C6-counselor', 'C7-outfitter'].includes(s.id))
        .map((s) => [s.anchor[0], s.anchor[1], s.id === 'C4-principal-desk' ? 0.7 : 0.45])
      type Light = { warm: number; ember: number; cool: number }
      const lightAt = (tx: number, ty: number): Light => {
        // (1) the hearth — the room's heart, brightest interior point (its
        // reach spans the grand hall: the room must be SEEABLE, moody ≠ blind)
        const dh = Math.hypot(tx - HEARTH[0], ty - HEARTH[1])
        let warm = 1.3 * Math.pow(Math.max(0, 1 - dh / 17), 1.5)
        // (2) the mouth-light — a pool on the shelf + the long wedge down the stair
        const vx = tx - MOUTH[0], vy = ty - MOUTH[1]
        const d = Math.hypot(vx, vy)
        warm += 0.9 * Math.max(0, 1 - d / 8)
        const along = vx * mux + vy * muy
        if (along > 0) {
          const perp = Math.abs(vx * muy - vy * mux)
          warm += 0.72 * Math.max(0, 1 - d / 21) * (1 - sstep(1.6 + along * 0.42, 2.6 + along * 0.42, perp))
        }
        // the station lamps (tight pools; quadratic falloff)
        for (const [lx, ly, lk] of LAMPS) {
          warm += lk * Math.pow(Math.max(0, 1 - Math.hypot(tx - lx, ty - ly) / 4.2), 2)
        }
        // (3) the lava — ember rim along the trench + the fall
        const dl = Math.min(trenchNear(tx, ty), Math.hypot(tx - FALL[0], ty - FALL[1]))
        const ember = 0.62 * Math.pow(Math.max(0, 1 - dl / 5), 1.7)
        // the only cool notes: the crater-side day shafts
        let cool = 0
        for (const [sx2, sy2] of SHAFTS) cool = Math.max(cool, 0.5 * Math.max(0, 1 - Math.hypot(tx - sx2, ty - sy2) / 3.4))
        return { warm: Math.min(1.35, warm), ember, cool }
      }
      // floor value curve: dark-first ambient + the light field. The verdict
      // value-study gate: the hearth must GLOW in grayscale — so the ambient
      // sits low (0.14) and the hearth peak clears 1.0 before the grade.
      // THE HUE ECONOMY (the P0-PICK's own): darkness is RICH VIOLET, never
      // brown mud; the pools are GOLD; the melt is ember; the shafts are the
      // only cool daylight. One curve owns every surface's hue by its value.
      const hueMix = (v: number, ember: number, cool: number) => {
        const t = sstep(0.1, 0.6, v) // 0 = deep dark, 1 = fully lit
        const r = v * (0.74 + t * 0.34 + 0.2 * ember) + 0.02 * cool
        const g = v * (0.62 + t * 0.36 - 0.08 * ember) + 0.05 * cool
        const b = v * (1.08 - t * 0.3 - 0.24 * ember) + 0.16 * cool
        return tint24(r, g, b)
      }
      const floorTint = (tx: number, ty: number, L: number) => {
        const { warm, ember, cool } = lightAt(tx, ty)
        // long-wavelength drift only: short grain quantizes into a tile
        // lattice (the m1/m3 crop verdict) — the light gradients own value
        const grain = 0.97 + 0.06 * vnoise(tx / 13 + 8, ty / 13 + 3)
        const wear = 0.98 + 0.04 * vnoise(tx / 21 + 2, ty / 21 + 6)
        let v = 0.24 + 0.9 * warm + 0.5 * ember
        if (L === 1) v += 0.05  // the dais reads a breath lifted
        if (L === 3) v += 0.03  // the shelf under the mouth pool
        v *= grain * wear
        return hueMix(v, ember, cool)
      }

      // ---- THE FLOOR + THE MOLTEN TRENCH ----
      const pulses: { sp: Sprite; ph: number; base: number; spine?: number }[] = []
      for (let ty = 0; ty < GRID; ty++) {
        for (let tx = 0; tx < GRID; tx++) {
          const L = eLvl(tx, ty)
          if (L === -1) continue
          const isBridge = bridgeSet.has(ty * GRID + tx)
          const lift = Math.max(0, L) * STEP
          const bx = isoX(tx, ty), by = isoY(tx, ty) - lift
          const zBase = (tx + ty) * 4000 + lift * 2

          if (L === -2) {
            // THE LIVING LAVA as ONE FLOWING BODY: tiles pick ORDERED crops by
            // their position ALONG the trench, so downstream neighbors continue
            // the painting's flow — random picks read as scattered debris
            const pool = lavas.length ? lavas : floors
            if (!pool.length) continue
            const tvx = TRENCH.x1 - TRENCH.x0, tvy = TRENCH.y1 - TRENCH.y0
            const tAlong = Math.max(0, Math.min(1, ((tx - TRENCH.x0) * tvx + (ty - TRENCH.y0) * tvy) / (tvx * tvx + tvy * tvy)))
            const lane = ((tx * tvy - ty * tvx) > (TRENCH.x0 * tvy - TRENCH.y0 * tvx)) ? 0 : 12 // which of the two harvested runs
            const idx = (lane + Math.floor(tAlong * 11.99)) % pool.length
            const lv = new Sprite(pool[idx] ?? pool[0])
            lv.anchor.set(0.5, 0.5)
            lv.position.set(bx, isoY(tx, ty))
            const spine = 1 - Math.min(1, trenchNear(tx + 0.5, ty + 0.5) / 1.6)
            const core = 0.95 + 0.25 * spine + 0.05 * vnoise(tx / 3 + 3, ty / 3 + 8)
            lv.tint = tint24(Math.min(1, core), core * (0.66 + 0.24 * spine), core * 0.3)
            lv.zIndex = zBase + 3
            world.addChild(lv)
            pulses.push({ sp: lv, ph: (tx + ty) * 0.5, base: core, spine })
            continue
          }

          if (!floors.length) continue
          // THE 3D TILE UNIT (the exterior's drawColumn law): a tile standing
          // above ANY lower floor neighbor is a real block column down to the
          // deepest — the stair treads, dais edge, and shelf rim all wear
          // drawn risers (missing risers read as black holes at play zoom)
          {
            let floorMin = L
            for (const [ox, oy] of [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, 1], [1, -1], [-1, -1]] as const) {
              const nl = eLvl(tx + ox, ty + oy)
              if (nl >= 0 && nl < floorMin) floorMin = nl
            }
            if (L > floorMin && sides.length) {
              const { warm, ember } = lightAt(tx, ty)
              const m = L - floorMin
              const rpick = (k: number) => Math.floor(vnoise(tx / 2.7 + 1.3 + k * 0.13, ty / 2.7 + 8.1 + k * 0.21) * sides.length) % sides.length
              for (let k = m - 1; k >= 0; k--) { // bottom course first, uppers mask
                const seg = new Sprite(sides[rpick(k)])
                seg.anchor.set(0.5, 18 / 64)
                seg.position.set(bx, by + k * STEP)
                const drift = 0.92 + 0.12 * vnoise(tx / 6 + 2.2, ty / 6 + 7.7)
                const v = (0.26 + 0.6 * warm + 0.45 * ember) * drift * (0.94 - 0.05 * k)
                seg.tint = hueMix(v, ember, 0)
                seg.zIndex = zBase + 1 + (m - 1 - k)
                world.addChild(seg)
              }
            }
          }
          const top = new Sprite(floors[Math.floor(hash(tx * 5.1 + 2, ty * 2.9 + 4) * floors.length) % floors.length])
          top.anchor.set(0.5, 0.5)
          top.position.set(bx, by)
          top.scale.set((hash(tx * 7.7, ty * 5.3) > 0.5 ? -1 : 1) * 1.06, 1.06)
          top.zIndex = zBase + 5
          if (isBridge) {
            // pale carved treads riding over the melt
            const { warm } = lightAt(tx, ty)
            top.tint = tint24(0.5 + warm * 0.3, 0.46 + warm * 0.22, 0.44 + warm * 0.1)
          } else {
            top.tint = floorTint(tx, ty, L)
          }
          if (DBG) top.tint = L === 0 ? 0x3050ff : L === 1 ? 0x30ff50 : 0xff5030
          world.addChild(top)

          if (isBridge && lavas.length) {
            // the melt continues BRIGHT beneath the bridge pad
            const lavaU = new Sprite(lavas[Math.floor(hash(tx * 1.3, ty * 4.7) * lavas.length) % lavas.length])
            lavaU.anchor.set(0.5, 0.5)
            lavaU.position.set(bx, isoY(tx, ty) + 6)
            lavaU.tint = tint24(1.0, 0.55, 0.16)
            lavaU.zIndex = zBase + 1
            world.addChild(lavaU)
            pulses.push({ sp: lavaU, ph: hash(tx, ty) * 6.28, base: 1.0, spine: 0.6 })
          }
        }
      }

      // ---- THE ROCK MASS: THE VOID IS ILLEGAL (Ash's verdict — "most of the
      // screen being void"). Everything around the room is the inside of a
      // mountain and is DRAWN: a BFS field gives every rock tile its distance
      // to the nearest floor and which SIDE it sits on — mass screen-behind
      // the room stands at full vault height immediately; camera-side mass
      // ramps up with distance so it never occludes the room.
      const WALL_H = 11 // grandeur needs height: the vault fills the upper frame, courses fading into the dark
      const mDist = new Int16Array(GRID * GRID).fill(-1)
      const mSrcSum = new Int16Array(GRID * GRID)
      {
        const qx: number[] = [], qy: number[] = []
        for (let ty = 0; ty < GRID; ty++) for (let tx = 0; tx < GRID; tx++) {
          if (lvlAt(tx, ty) >= 0 || lvlAt(tx, ty) === -2) {
            mDist[ty * GRID + tx] = 0
            mSrcSum[ty * GRID + tx] = tx + ty
            qx.push(tx); qy.push(ty)
          }
        }
        for (let h = 0; h < qx.length; h++) {
          const x = qx[h], y = qy[h], i = y * GRID + x
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = x + ox, ny = y + oy
            if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
            const j = ny * GRID + nx
            if (mDist[j] !== -1) continue
            mDist[j] = mDist[i] + 1
            mSrcSum[j] = mSrcSum[i]
            qx.push(nx); qy.push(ny)
          }
        }
      }
      // mass height in courses at a rock tile (0 = handled by the wall pass)
      const massH = (tx: number, ty: number) => {
        const i = ty * GRID + tx
        const d = mDist[i]
        if (d <= 0) return WALL_H
        const behindK = (tx + ty) - mSrcSum[i]
        if (behindK <= 0) return WALL_H            // enclosing back mass: full vault
        return Math.min(WALL_H, Math.max(1, Math.round(d * 1.1))) // camera-side: the floor curves up and away
      }
      // draw the mass tops (2x2 LOD where solid — ~7k tiles become ~2k sprites)
      if (floors.length) {
        const massTop = (mx: number, my: number, scale2: boolean) => {
          const h = massH(mx, my)
          const lift = h * STEP
          const sp = new Sprite(floors[Math.floor(hash(mx * 3.7, my * 1.9) * floors.length) % floors.length])
          sp.anchor.set(0.5, 0.5)
          const cx2 = scale2 ? mx + 0.5 : mx, cy2 = scale2 ? my + 0.5 : my
          sp.position.set(isoX(cx2, cy2), isoY(cx2, cy2) - lift)
          sp.scale.set((hash(mx * 1.3, my * 7.1) > 0.5 ? -1 : 1) * (scale2 ? 2.08 : 1.06), scale2 ? 2.08 : 1.06)
          // deep-violet modeled rock: long-wavelength drift + rare ember
          // glints so the mountain reads alive, never flat black fill
          const drift = 0.75 + 0.5 * vnoise(mx / 16 + 4, my / 16 + 9)
          const glint = hash(mx * 12.7, my * 9.3) > 0.985 ? 0.05 : 0
          const v = 0.125 * drift
          sp.tint = tint24(v * 0.82 + glint * 1.6, v * 0.7 + glint * 0.7, v * 1.25 + glint * 0.2)
          sp.zIndex = ((scale2 ? mx + 1 : mx) + (scale2 ? my + 1 : my)) * 4000 + lift * 2 + 4
          world.addChild(sp)
        }
        for (let ty = 0; ty < GRID; ty += 2) {
          for (let tx = 0; tx < GRID; tx += 2) {
            const cells: [number, number][] = [[tx, ty], [tx + 1, ty], [tx, ty + 1], [tx + 1, ty + 1]]
            const rock = cells.filter(([x, y]) => x < GRID && y < GRID && lvlAt(x, y) === -1 && mDist[y * GRID + x] > 1)
            if (rock.length === 4) {
              const h = massH(tx, ty)
              // merge only where the 2x2 shares one height (no popped corners)
              if (cells.every(([x, y]) => massH(x, y) === h)) { massTop(tx, ty, true); continue }
            }
            for (const [x, y] of rock) massTop(x, y, false)
          }
        }
      }
      // THE MOUTH: a BUILT opening in the NE wall — aperture columns skip
      // their lower courses and blaze instead (a light plane inside the gap
      // with a block lintel above). No pasted paintings, ever.
      const mouthness = (tx: number, ty: number) => Math.hypot(tx - MOUTH[0], ty - MOUTH[1])
      for (let ty = 0; ty < GRID; ty++) {
        for (let tx = 0; tx < GRID; tx++) {
          if (lvlAt(tx, ty) !== -1 || !sides.length) continue
          let minFloor = 99, maxFloor = -1, floorSum = Infinity, anyFloor = false
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
            const raw = eLvl(tx + ox, ty + oy)
            const nl = raw === -2 ? 0 : raw // the melt counts as ground: its banks rise like any wall (holes read beside the channel otherwise)
            if (nl >= 0) { anyFloor = true; minFloor = Math.min(minFloor, nl); maxFloor = Math.max(maxFloor, nl); floorSum = Math.min(floorSum, (tx + ox) + (ty + oy)) }
          }
          if (!anyFloor) continue
          const behind = (tx + ty) <= floorSum
          // root at the LOWEST adjacent floor, crown above the HIGHEST (the
          // P1 floating-cap lesson)
          const rise = behind ? WALL_H + (maxFloor - minFloor) : 1
          const baseLift = minFloor * STEP
          const bx = isoX(tx, ty), by = isoY(tx, ty) - baseLift
          const zBase = (tx + ty) * 4000 + baseLift * 2
          const { warm, ember } = lightAt(tx, ty)
          const isMouth = behind && mouthness(tx, ty) < 3.2
          // the aperture opening arches: tall at the center, shouldering down
          const gapH = Math.round(6.5 - 2.2 * Math.pow(mouthness(tx, ty) / 3.2, 2))
          const pick = (k: number) => Math.floor(vnoise(tx / 2.7 + 1.3 + k * 0.13, ty / 2.7 + 8.1 + k * 0.21) * sides.length) % sides.length
          for (let k = 0; k < rise; k++) {
            if (isMouth && k < gapH) {
              // the blazing gap: a golden light plane fills the opening —
              // graduated like a real blaze (white-hot low center, amber at
              // the arch edges), never a flat yellow rectangle
              const lp = new Sprite(Texture.WHITE)
              lp.anchor.set(0.5, 0)
              lp.width = 64; lp.height = STEP + (k === 0 ? 8 : 0)
              lp.position.set(bx, by - (k + 1) * STEP + 8)
              const cx2 = Math.max(0, 1 - mouthness(tx, ty) / 3.2)
              const rowGlow = 1 - Math.pow(k / Math.max(1, gapH), 1.7) * 0.45 // hottest low, cooling up
              const heat = (0.6 + 0.4 * cx2) * rowGlow
              lp.tint = tint24(
                Math.min(1, heat * 1.15),
                heat * (0.74 + 0.2 * cx2 * rowGlow),
                heat * (0.3 + 0.28 * cx2 * rowGlow),
              )
              lp.zIndex = zBase + 30 + k
              world.addChild(lp)
              continue
            }
            const seg = new Sprite(sides[pick(k)])
            seg.anchor.set(0.5, 18 / 64)
            seg.position.set(bx, by - (k + 1) * STEP + 8)
            // smooth height decay — a per-course power curve printed
            // horizontal bands; this fades continuously into the vault
            const kk = 1 / (1 + k * 0.14)
            const drift = 0.9 + 0.18 * vnoise(tx / 6 + 2.2 + k * 0.07, ty / 6 + 7.7 - k * 0.05)
            let v = (0.38 + 0.72 * warm + 0.5 * ember) * kk * drift
            if (isMouth) v = Math.max(v, 0.5) // the lintel catches the blaze
            seg.tint = hueMix(v, ember, 0)
            if (DBG) seg.tint = behind ? 0x8040ff : 0xff8040
            seg.zIndex = zBase + 30 + k
            world.addChild(seg)
          }
          if (floors.length) {
            // every boundary column gets a cut-top (camera-side lips included —
            // with the mass drawn beyond, an uncapped lip leaks background)
            const cap = new Sprite(floors[Math.floor(hash(tx * 2.9, ty * 6.1) * floors.length) % floors.length])
            cap.anchor.set(0.5, 0.5)
            cap.position.set(bx, by - rise * STEP)
            cap.tint = behind ? 0x100c14 : 0x14101a
            cap.zIndex = zBase + 30 + rise + 1
            world.addChild(cap)
          }
        }
      }

      // ---- GLOW ACCENTS (additive breathers OVER the baked light — accents
      // now, not the light itself) ----
      const radial = (size: number, stops: [number, string][]) => {
        const cv = document.createElement('canvas'); cv.width = size; cv.height = size
        const g = cv.getContext('2d')!
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
        for (const [t, c] of stops) grad.addColorStop(t, c)
        g.fillStyle = grad; g.fillRect(0, 0, size, size)
        return Texture.from(cv)
      }
      const glowTex = radial(160, [[0, 'rgba(255,196,110,0.5)'], [0.45, 'rgba(255,150,60,0.2)'], [1, 'rgba(255,150,60,0)']])
      const coolTex = radial(160, [[0, 'rgba(214,226,255,0.38)'], [0.5, 'rgba(190,208,255,0.13)'], [1, 'rgba(190,208,255,0)']])
      const glows: { sp: Sprite; ph: number; a: number }[] = []
      const glowAt = (px: number, py: number, w: number, h: number, a: number, tex = glowTex) => {
        const L = Math.max(0, eLvl(Math.round(px), Math.round(py)))
        const sp = new Sprite(tex)
        sp.anchor.set(0.5)
        sp.blendMode = 'add'
        sp.width = w; sp.height = h; sp.alpha = a
        sp.position.set(isoX(px, py), isoY(px, py) - L * STEP)
        sp.zIndex = (Math.round(px) + Math.round(py)) * 4000 + L * STEP * 2 + 400
        world.addChild(sp)
        glows.push({ sp, ph: hash(px, py) * 6.28, a })
      }
      // THE HEARTH (A5, the drawn hero): the ceremonial basalt firepit ring
      // with its roaring fire — the room's heart is a real place now. The
      // additive breath rides OVER the drawn flame (accent, not the light).
      if (hearthT) {
        const hp = new Sprite(hearthT)
        hp.anchor.set(0.5, 0.72) // the ring's ground ellipse sits at the anchor tile
        hp.position.set(isoX(HEARTH[0], HEARTH[1]), isoY(HEARTH[0], HEARTH[1]) + 10)
        hp.zIndex = (HEARTH[0] + HEARTH[1]) * 4000 + 320
        world.addChild(hp)
      }
      glowAt(HEARTH[0], HEARTH[1], 320, 190, 0.4)                     // the hearth's breath
      glowAt(MOUTH[0] - 1.2, MOUTH[1] + 1.2, 320, 190, 0.42)          // the mouth pool + spill
      // station lamps' visible glints
      for (const [lx, ly, lk] of LAMPS) glowAt(lx, ly, 90, 54, 0.3 * lk + 0.12)
      glowAt(FALL[0], FALL[1], 140, 95, 0.34)                         // the fall
      for (let t = 0.2; t < 1; t += 0.27) {
        glowAt(TRENCH.x0 + (TRENCH.x1 - TRENCH.x0) * t, TRENCH.y0 + (TRENCH.y1 - TRENCH.y0) * t, 110, 64, 0.24)
      }
      for (const [sx2, sy2] of SHAFTS) glowAt(sx2, sy2, 120, 74, 0.26, coolTex)

      // ---- THE SOCKET STAKES (honest placeholders, default ON) ----
      if (SOCKETS) {
        const lsc = Math.min(2.6, 0.72 / ZOOM)
        const style = new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0xbaf3ea, stroke: { color: 0x06282c, width: 3 } })
        const stake = (id: string, px: number, py: number, kind: string) => {
          const L = Math.max(0, eLvl(Math.round(px), Math.round(py)))
          const gx = isoX(px, py), gy = isoY(px, py) - L * STEP
          const post = new Sprite(Texture.WHITE)
          post.tint = 0x1d4f52; post.width = 3; post.height = 26
          post.anchor.set(0.5, 1); post.position.set(gx, gy)
          post.zIndex = (px + py) * 4000 + L * STEP * 2 + 500
          world.addChild(post)
          const flag = new Sprite(Texture.WHITE)
          flag.tint = kind === 'hidden' ? 0x8a6bbe : 0x2ec4b6
          flag.width = 12; flag.height = 8
          flag.anchor.set(0, 1); flag.position.set(gx, gy - 18)
          flag.zIndex = (px + py) * 4000 + L * STEP * 2 + 501
          world.addChild(flag)
          const label = new Text({ text: id, style })
          label.anchor.set(0.5, 1)
          label.scale.set(lsc)
          label.position.set(gx, gy - 30)
          label.zIndex = 9e9
          world.addChild(label)
        }
        for (const p of getPois()) stake(p.id, p.at[0], p.at[1], p.kind)
        for (const s of getSeams()) stake(`⛰ ${s.id}`, s.at[0], s.at[1], 'seam')
        stake('spawn:fromMouth', SPAWNS.fromMouth.at[0], SPAWNS.fromMouth.at[1], 'seam')
      }

      // ---- ?coords=1 — the coordinate scaffold (spatial-craft law #1) ----
      if (params.get('coords')) {
        const lsc = Math.min(3.2, 0.62 / ZOOM)
        const style = new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } })
        for (let cty = 0; cty < GRID; cty += 8) {
          for (let ctx = 0; ctx < GRID; ctx += 8) {
            const cl = eLvl(ctx, cty)
            const gy = isoY(ctx, cty) - (cl > 0 ? cl * STEP : 0)
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

      // ---- STAGE ATMOSPHERE: the vault swallow + vignette (part of the P2
      // atmosphere proposal — locked WITH the grade at the gate) ----
      const vig = new Sprite(radial(512, [[0, 'rgba(0,0,0,0)'], [0.42, 'rgba(0,0,0,0)'], [0.72, 'rgba(8,5,12,0.42)'], [1, 'rgba(5,3,9,0.82)']]))
      app.stage.addChild(vig)
      const resizeFx = () => {
        const vw = app.screen.width, vh = app.screen.height
        vig.width = vw * 1.6; vig.height = vh * 1.6
        vig.position.set(-vw * 0.3, -vh * 0.3)
        world.x = vw / 2 - isoX(camTx, camTy) * ZOOM
        world.y = vh * 0.5 - isoY(camTx, camTy) * ZOOM
      }
      resizeFx()
      app.renderer.on('resize', resizeFx)

      app.ticker.add(() => {
        const wt = performance.now() / 1000
        for (const g of glows) g.sp.alpha = g.a * (0.78 + 0.22 * Math.sin(wt * 1.3 + g.ph))
        // the melt pulses — slow traveling heat down the trench (code anim,
        // never a shader: spec A3); the channel spine stays golden-hot
        for (const p of pulses) {
          const k = p.base * (0.92 + 0.08 * Math.sin(wt * 0.9 + p.ph))
          const s = p.spine ?? 0
          p.sp.tint = tint24(Math.min(1, k), k * (0.66 + 0.24 * s), k * 0.3)
        }
      })
    }

    start().catch((err) => { console.error('[PantherCaveIso] failed', err) })
    return () => { destroyed = true; if (instance) instance.destroy(true, { children: true }) }
  }, [])

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#070609' }} />
}
