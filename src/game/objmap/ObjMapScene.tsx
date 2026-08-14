import { useEffect, useRef } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js'
import {
  HW, HH, isoX, isoY, hash, vnoise, shadeHex, mix, rampAt, tintFor,
  loadWaterVariants, seaTile, buildAerialVeil, buildShoreFoam, buildSparkles,
  makeReachOf, animSwells, animTide, animShoreline, animSparkles,
  type SwellSprite,
} from '../ocean'
import { measureBase, trimmed, footprintCircle, stampCells, type Circle } from './measure'
import { PLACEMENTS, DECALS, NO_BLOCK, HULL, AFLOAT, basename, type Placement } from './placements'

// ============================================================================================
// THE OBJECT-MAP — Paw Harbor. A proof of the architecture, not a set dressing exercise.
//
//   1. THE GROUND IS THE ENGINE'S. Normalized iso sand tiles + the accepted ocean module
//      (ocean.ts, untouched). Nothing about the ground is painted into a picture.
//   2. EVERY OBJECT IS ONE PAINTED PNG placed as a single sprite. No object is composited
//      from pieces, and no object owns any ground.
//   3. COLLISION IS MEASURED FROM THE ART. On load, each sprite's alpha is scanned for its
//      base band; that band becomes tile-space footprint circles AND stamped blocked cells.
//      The composition file (placements.ts) contains no hitbox of any kind.
//   4. EVERY OBJECT GETS A GROUNDED CONTACT SHADOW sized from its measured base, so nothing
//      floats; vessels get a foam collar instead, so they sit IN the water rather than on it.
//   5. DEPTH SORT is a pure y-sort on the feet contact point, character included.
//
// Routes: ?scene=objmap  ·  ?scene=objmap&dbg=1 (draw the measured footprints)
//         &zoom=1.0 &spawn=<x>,<y> (authored world px)
// ============================================================================================

// ---- the authored frame -> the iso grid ----
// The composition is authored in a 1600x1000 world-pixel frame (x right, y down, sea at the
// top). The engine is a 2:1 iso lattice. The two are the SAME SPACE up to an affine shift:
//   screen-x = (tx - ty) * HW   and   screen-y = (tx + ty) * HH
// so with d = tx - ty and s = tx + ty:  x = d*HW + CX,  y = (s - S0)*HH.
// Nothing here is a projection or a fake — an authored pixel is a lattice coordinate.
const CX = 800          // authored x that maps to the lattice centre line (d = 0)
const OFF = 30          // lattice offset in tiles, so every tile index stays positive
const S0 = 2 * OFF      // authored y = 0 sits at engine s = S0
const N = 100           // grid is N x N tiles

const wpD = (x: number) => (x - CX) / HW
const wpS = (y: number) => y / HH + S0
const wpTile = (x: number, y: number) => {
  const d = wpD(x), s = wpS(y)
  return { tx: (s + d) / 2, ty: (s - d) / 2 }
}
const tileWp = (tx: number, ty: number) => ({ x: (tx - ty) * HW + CX, y: (tx + ty - S0) * HH })

// ---- THE COAST. One geometry function, exactly the way every map on this engine feeds the
// ocean module. Control points are in authored px so they can be read against the composition:
// the sea reaches deepest into frame at the harbour mouth (x~800), the left point and the
// right mole both stand further out. Smoothstep between them — a steep coast quantizes into
// a sawtooth of tile diamonds and stair-steps the foam band. ----
const SHORE_PTS: [number, number][] = [
  [-1200, 300], [-600, 330], [0, 352], [400, 420], [800, 470],
  [1200, 436], [1600, 386], [2400, 350], [3600, 330],
]
function shoreYpx(x: number) {
  if (x <= SHORE_PTS[0][0]) return SHORE_PTS[0][1]
  for (let i = 1; i < SHORE_PTS.length; i++) {
    if (x <= SHORE_PTS[i][0]) {
      const [x0, y0] = SHORE_PTS[i - 1], [x1, y1] = SHORE_PTS[i]
      const k = (x - x0) / (x1 - x0)
      return y0 + (y1 - y0) * (k * k * (3 - 2 * k))
    }
  }
  return SHORE_PTS[SHORE_PTS.length - 1][1]
}
// engine-space shore: s as a function of d, the signature ocean.ts wants
const shoreAt = (d: number) => wpS(shoreYpx(d * HW + CX))

type Cell = 'sea' | 'wet' | 'sand'
function cellAt(tx: number, ty: number): Cell {
  const s = tx + ty, sh = shoreAt(tx - ty)
  if (s < sh) return 'sea'
  if (s < sh + 1.5) return 'wet'
  return 'sand'
}
// the walkable envelope: sand, inside the composed frame plus a working margin. There is no
// wall art at the boundary, so it is set well outside the frame and the sand keeps rendering
// past it — the player is stopped before any edge can enter the viewport.
const D_MIN = wpD(28), D_MAX = wpD(1584), S_BACK = wpS(1106)
// the composed frame, in authored px. The camera is clamped inside it (with sea headroom
// above) so the empty sand outside the composition can never enter the viewport — "the
// viewport is always full of world" is a camera rule, not a hope.
const FX0 = 0, FX1 = 1600, FY0 = -560, FY1 = 1130
const groundWalk = (tx: number, ty: number) => {
  const d = tx - ty, s = tx + ty
  if (d < D_MIN || d > D_MAX || s > S_BACK) return false
  return cellAt(tx, ty) === 'sand'
}

const SAND_COMMON = [0, 1, 2, 3, 7, 9], SAND_PEBBLE = [8], SAND_RIPPLE = [12, 13, 14, 15]
const SAND_BASE = [246, 229, 180]

// the quay promenade reads worn: a broad compacted band along the walking lane at y~680-790
const worn = (y: number) => 1 - 0.05 * Math.max(0, 1 - Math.abs(y - 735) / 70)

// ---- character rig (the beach's, so the walk feels identical) ----
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

export default function ObjMapScene() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let app: Application | null = null, destroyed = false
    const keys: Record<string, boolean> = {}
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') e.preventDefault() }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    const start = async () => {
      TextureSource.defaultOptions.scaleMode = 'nearest' // native pixels: no upscaling filter on the art
      const instance = new Application()
      await instance.init({ background: 0x083744, antialias: false, resizeTo: ref.current ?? window })
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance; ref.current.appendChild(instance.canvas)

      const qs = new URLSearchParams(location.search)
      const ZOOM = parseFloat(qs.get('zoom') ?? '') || 1.35
      const DBG = qs.has('dbg')

      // ---- load: the ground tiles, the ocean's kit, Thor, and every UNIQUE painted object ----
      const tex: Record<string, Texture> = {}
      const load = async (k: string, u: string) => { try { tex[k] = await Assets.load(u) } catch { /* missing art degrades to no object */ } }
      const files = [...new Set(PLACEMENTS.map((p) => p.file))]
      const urlOf = (f: string) => '/' + f.replace(/^public\//, '')

      const sandV: Texture[] = []
      let waterV: Texture[] = []
      const idle: Record<string, Texture> = {}
      const walk: Record<string, Texture[]> = {}
      await Promise.all([
        load('foamlace', '/art/intro/foam-lace.png'), load('foamlace2', '/art/intro/foam-lace2.png'),
        load('foamtrail', '/art/intro/foam-trail.png'), load('sparkle', '/art/intro/sparkle.png'),
        load('skirt', '/art/intro/shallow-skirt.png'), load('water', '/art/iso/water.png'),
        load('sand', '/art/iso/sand.png'),
        ...files.map((f) => load(f, urlOf(f))),
        ...Array.from({ length: 16 }, (_, i) => Assets.load(`/art/intro/sand-n/${i}.png`).then((t: Texture) => { sandV[i] = t }).catch(() => {})),
        loadWaterVariants().then((v) => { waterV = v }),
        ...dirs8.map(async (d) => {
          try { idle[d] = await Assets.load(`/art/characters/thor/walk/${d}/0.png`) } catch { /* */ }
          try { walk[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`))) } catch { /* */ }
        }),
      ])
      if (destroyed) { instance.destroy(true); return }
      for (const d of dirs8) {
        if (idle[d]) idle[d] = trimmed(idle[d])
        if (walk[d]) walk[d] = walk[d].map(trimmed)
      }

      const world = new Container(); world.scale.set(ZOOM); world.sortableChildren = true
      instance.stage.addChild(world)
      // golden hour: warm key, blue channel pulled so the frame leans amber while the sea stays alive
      const grade = new ColorMatrixFilter()
      grade.brightness(1.0, false); grade.saturate(0.06, true); grade.contrast(0.02, true)
      const gm = grade.matrix; gm[0] *= 1.07; gm[6] *= 1.005; gm[12] *= 0.885; grade.matrix = gm
      world.filters = [grade]

      // ---- 1. THE GROUND, ENGINE-OWNED. Sea delegates entirely to the ocean module; sand is
      // the normalized variant pool with the runtime ramp owning the value. FLAT: the
      // composition is authored in screen px, so any fake relief would break its geometry. ----
      const waterSprites: SwellSprite[] = []
      for (let ty = 0; ty < N; ty++) {
        for (let tx = 0; tx < N; tx++) {
          const c = cellAt(tx, ty)
          const ds = (tx + ty) - shoreAt(tx - ty)
          if (c === 'sea') { seaTile(world, tx, ty, ds, waterV, tex['water'], waterSprites); continue }
          const h = hash(tx * 2.1, ty * 1.7)
          const pool = c === 'sand' && h > 0.985 ? SAND_PEBBLE
            : c === 'sand' && ds > 12 && h < 0.03 ? SAND_RIPPLE
              : SAND_COMMON
          const base = sandV[pool[Math.floor(hash(tx * 3.3, ty * 4.1) * pool.length)]] ?? tex['sand']
          if (!base) continue
          const sp = new Sprite(base); sp.anchor.set(0.5, 0.25)
          const fx = vnoise(tx / 7 + 4, ty / 7 + 11) > 0.5 ? -1 : 1 // coherent patches, never per-tile random
          sp.scale.set(fx * 1.06, 1.06)
          sp.position.set(isoX(tx, ty), isoY(tx, ty)); sp.zIndex = (tx + ty) * 16
          if (c === 'wet') {
            const k = Math.min(1, Math.max(0, ds / 1.5))
            sp.tint = tintFor(shadeHex(mix(0xb5945e, 0xd8bd86, k), 0.985 + 0.03 * hash(tx, ty)), SAND_BASE)
          } else {
            const t = Math.min(1, Math.max(0, (ds - 2.1) / 34))
            const dune = 0.955 + 0.075 * vnoise(tx / 16 + 3, ty / 16 + 5)
            const grain = 0.994 + 0.012 * hash(tx * 1.3, ty * 2.1)
            const w = worn(tileWp(tx, ty).y)
            sp.tint = shadeHex(tintFor(rampAt([[0, 0xdcbf87], [0.45, 0xead6a3], [1, 0xf7ecc2]], t), SAND_BASE), dune * grain * w)
          }
          world.addChild(sp)
        }
      }

      // the ocean's aerial veil, dialled back for this frame: the composed sea band is only
      // ~23 diagonal tiles deep before the top edge, so the module's full wash would haze the
      // far sails to half. Adjusting the strips it just added keeps ocean.ts untouched.
      const veil0 = world.children.length
      buildAerialVeil(world, { x0: -N * HW, spanPx: 2 * N * HW, sMax: Math.ceil(S_BACK), shoreAt })
      for (let i = veil0; i < world.children.length; i++) world.children[i].alpha = 0.55

      const { skirtSegs, wetSegs, fronts } = buildShoreFoam(world,
        { skirt: tex['skirt'], foamlace: tex['foamlace'], foamlace2: tex['foamlace2'], foamtrail: tex['foamtrail'] },
        { shoreAt, dMin: -62, dMax: 66 })
      const sparkles = tex['sparkle'] ? buildSparkles(world, tex['sparkle'], shoreAt) : []

      // ---- 2 + 3 + 4 + 5. THE OBJECTS. One PNG each, measured, shadowed, y-sorted. ----
      const shadowTex = makeShadow()
      const colliders: Circle[] = []
      const colMap = new Map<string, number[]>()
      const blocked = new Set<string>()
      const addCollider = (c: Circle) => {
        const i = colliders.push(c) - 1
        const R = Math.ceil(c.r) + 2
        for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
          const k = (Math.round(c.cx) + dx) + ',' + (Math.round(c.cy) + dy)
          const arr = colMap.get(k); if (arr) arr.push(i); else colMap.set(k, [i])
        }
        stampCells(c, blocked)
      }

      type Placed = { p: Placement; name: string; sp: Sprite; circles: Circle[] }
      const placed: Placed[] = []
      let measuredOk = 0, measuredFail = 0

      for (const p of PLACEMENTS) {
        const t0 = tex[p.file]; if (!t0) { measuredFail++; continue }
        const name = basename(p.file)
        const t = trimmed(t0)
        const sc = p.scale
        const { tx, ty } = wpTile(p.x, p.y)
        const x = isoX(tx, ty), y = isoY(tx, ty), z = (tx + ty) * 16
        const afloat = AFLOAT.has(name) && cellAt(tx, ty) === 'sea'

        // flat decals lie ON the ground: ground-anchored, no cast shadow, no footprint
        if (DECALS.has(name)) {
          const sp = new Sprite(t); sp.anchor.set(0.5, 0.6); sp.scale.set(p.flip ? -sc : sc, sc)
          sp.position.set(x, y); sp.zIndex = z + 3
          world.addChild(sp); placed.push({ p, name, sp, circles: [] })
          continue
        }

        // -- 3. MEASURE THE ART. The base band is read off the alpha; a hull-shaped object
        // (a boat, a crate stack, a boulder) is measured off a deep band because its bottom
        // fifth is only a keel line.
        const m = measureBase(t, HULL.has(name) ? 0.45 : 0.2)
        if (m) measuredOk++; else measuredFail++
        const circles: Circle[] = []
        if (m && !NO_BLOCK.has(name)) {
          for (const b of m.pts) {
            const c = footprintCircle(b, { tx, ty, texW: t.width, feet: m.feet, sc, flip: p.flip, n: m.pts.length })
            circles.push(c); addCollider(c)
          }
        }

        // -- 4. GROUNDED CONTACT SHADOW, sized from the MEASURED base, not the canvas box.
        // Light comes from the upper left, so the shadow lays out to the lower right.
        const baseW = (m ? m.span : t.width) * sc
        const tall = t.height * sc > 150
        if (afloat) {
          // a vessel gets a foam collar instead: it must sit IN the water, not on it
          const ring = new Sprite(shadowTex); ring.anchor.set(0.5)
          ring.tint = 0xeafff6; ring.blendMode = 'add'
          ring.width = Math.max(26, baseW * 1.05); ring.height = ring.width * 0.28
          ring.alpha = 0.4; ring.position.set(x, y + 3); ring.zIndex = z + 17
          world.addChild(ring)
        } else {
          const sh = new Sprite(shadowTex); sh.anchor.set(0.3, 0.5)
          sh.width = Math.max(20, baseW * (tall ? 1.55 : 1.3))
          sh.height = Math.max(9, baseW * (tall ? 0.24 : 0.33))
          sh.rotation = 0.19
          sh.alpha = tall ? 0.46 : 0.54
          sh.position.set(x + 4, y + 2)
          sh.zIndex = z + 17 // above the NEXT tile row, so the spill is never sliced by tile edges
          world.addChild(sh)
        }

        // -- 2 + 5. ONE painted sprite, anchored at its drawn feet, y-sorted on that contact point.
        const sp = new Sprite(t); sp.anchor.set(0.5, 1.0); sp.scale.set(p.flip ? -sc : sc, sc)
        sp.position.set(x, y); sp.zIndex = z + 20
        world.addChild(sp)
        placed.push({ p, name, sp, circles })
      }

      // warm lamp glows: the only light sources named in the composition
      const glowTex = radial(96, [[0, 'rgba(255,196,110,0.5)'], [0.4, 'rgba(255,176,90,0.18)'], [1, 'rgba(255,176,90,0)']])
      const glows: { sp: Sprite; ph: number }[] = []
      for (const q of placed) {
        const lamp = q.name === 'lamp-v4' || q.name === 'lantern-post', tav = q.name === 'tavern'
        if (!lamp && !tav) continue
        const g = new Sprite(glowTex); g.anchor.set(0.5); g.blendMode = 'add'
        const hgt = q.sp.height
        g.width = g.height = tav ? 150 : 62
        g.position.set(q.sp.x + (tav ? -14 : 0), q.sp.y - (tav ? hgt * 0.55 : hgt * 0.86))
        g.zIndex = q.sp.zIndex + 1
        world.addChild(g); glows.push({ sp: g, ph: hash(q.p.x, q.p.y) * 6.28 })
      }

      // ---- the walkable grid: ground walkability MINUS the cells the measured footprints took ----
      const walkable: boolean[][] = []
      let landCells = 0, blockedOnLand = 0
      for (let ty = 0; ty < N; ty++) {
        walkable[ty] = []
        for (let tx = 0; tx < N; tx++) {
          const g = groundWalk(tx, ty)
          if (g) landCells++
          const b = blocked.has(tx + ',' + ty)
          if (g && b) blockedOnLand++
          walkable[ty][tx] = g && !b
        }
      }

      // ---- 8. ?dbg=1 — DRAW THE MEASURED COLLISION over the art, so it can be judged by eye
      // rather than by trust. Red diamonds = cells the footprints took out of the walk grid.
      // Yellow ellipses = the footprint circles themselves (a tile circle IS an iso ellipse).
      // Cyan = the character's own radius, so the two can be judged against each other. ----
      const THOR_SC = 0.58, THOR_R = 0.17
      let dbgThor: Graphics | null = null
      if (DBG) {
        const cells = new Graphics()
        for (const k of blocked) {
          const [sx, sy] = k.split(',').map(Number)
          if (sx < 0 || sy < 0 || sx >= N || sy >= N) continue
          const px = isoX(sx, sy), py = isoY(sx, sy)
          cells.poly([px, py - HH, px + HW, py, px, py + HH, px - HW, py])
            .fill({ color: 0xff0033, alpha: 0.42 })
        }
        cells.zIndex = 900000; world.addChild(cells)

        const rings = new Graphics()
        for (const c of colliders) {
          const px = isoX(c.cx, c.cy), py = isoY(c.cx, c.cy)
          rings.ellipse(px, py, c.r * HW * Math.SQRT2, c.r * HH * Math.SQRT2)
            .fill({ color: 0x00ff88, alpha: 0.42 })
            .stroke({ color: 0x006644, width: 1.5, alpha: 1 })
        }
        rings.zIndex = 900001; world.addChild(rings)
        // the character's own collision radius, so the two can be compared by eye
        const tr = new Graphics()
        tr.ellipse(0, 0, THOR_R * HW * Math.SQRT2, THOR_R * HH * Math.SQRT2)
          .fill({ color: 0x38f0ff, alpha: 0.35 }).stroke({ color: 0x38f0ff, width: 1.5 })
        tr.zIndex = 900002; world.addChild(tr)
        dbgThor = tr
      }

      // ---- 6. THE CHARACTER: Thor, and the beach's walker feel exactly (0.075 tiles/frame,
      // 0.128 sprinting, the same corner assist, the same swept-circle collision). ----
      const thorShadow = new Sprite(shadowTex); thorShadow.anchor.set(0.5)
      thorShadow.width = 32; thorShadow.height = 16; thorShadow.alpha = 0.62
      world.addChild(thorShadow)
      const thor = new Sprite(idle['south'] ?? tex['sand']); thor.anchor.set(0.5, 1.0); thor.scale.set(THOR_SC)
      world.addChild(thor)

      const sp0 = (qs.get('spawn') ?? '').split(',').map(Number)
      const spawnWp = sp0.length === 2 && !isNaN(sp0[0]) && !isNaN(sp0[1]) ? { x: sp0[0], y: sp0[1] } : { x: 700, y: 742 }
      const pos = wpTile(spawnWp.x, spawnWp.y)
      let facing = 'south', at = 0

      const surfWalk = (x: number, y: number) => !!walkable[y]?.[x]
      const canGo = (tx: number, ty: number) => surfWalk(Math.round(tx), Math.round(ty))
      // swept collision against the measured footprints: the whole step segment is tested, so
      // a fast step cannot tunnel a thin post. A circle already entered permits only moves
      // that strictly increase distance, so a bad state resolves instead of wedging.
      const collideMove = (x0: number, y0: number, x1: number, y1: number) => {
        const arr = colMap.get(Math.round(x1) + ',' + Math.round(y1))
        if (!arr) return false
        const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy
        for (const i of arr) {
          const c = colliders[i], R = c.r + THOR_R
          const d0 = Math.hypot(c.cx - x0, c.cy - y0)
          if (d0 < R) { if (Math.hypot(c.cx - x1, c.cy - y1) <= d0 + 1e-4) return true; continue }
          let t = l2 ? ((c.cx - x0) * dx + (c.cy - y0) * dy) / l2 : 0
          t = t < 0 ? 0 : t > 1 ? 1 : t
          if (Math.hypot(x0 + t * dx - c.cx, y0 + t * dy - c.cy) < R) return true
        }
        return false
      }
      const CR = 0.22, LANE = 0.27
      const probeX = (nx: number, aty: number) => {
        const sgn = Math.sign(nx - pos.tx)
        return canGo(nx + sgn * CR, aty - CR) && canGo(nx + sgn * CR, aty + CR) && !collideMove(pos.tx, pos.ty, nx, aty)
      }
      const probeY = (ny: number, atx: number) => {
        const sgn = Math.sign(ny - pos.ty)
        return canGo(atx - CR, ny + sgn * CR) && canGo(atx + CR, ny + sgn * CR) && !collideMove(pos.tx, pos.ty, atx, ny)
      }

      // ---- 7. DEBUG HOOKS ----
      const w = window as unknown as Record<string, unknown>
      w.__probe = (x: number, y: number) => {
        const { tx, ty } = wpTile(x, y)
        const itx = Math.round(tx), ity = Math.round(ty)
        const hits = (colMap.get(itx + ',' + ity) ?? []).filter((i) => Math.hypot(colliders[i].cx - tx, colliders[i].cy - ty) < colliders[i].r)
        return {
          space: 'authored world px', x, y,
          tile: { tx: +tx.toFixed(3), ty: +ty.toFixed(3) },
          d: +(tx - ty).toFixed(3), s: +(tx + ty).toFixed(3),
          cell: cellAt(itx, ity),
          shoreY: +shoreYpx(x).toFixed(1),
          groundWalkable: groundWalk(itx, ity),
          blockedByArt: blocked.has(itx + ',' + ity),
          walkable: !!walkable[ity]?.[itx],
          insideFootprints: hits.length,
        }
      }
      w.__warp = (x: number, y: number) => {
        const t = wpTile(x, y); pos.tx = t.tx; pos.ty = t.ty
        return { warpedTo: { x, y }, tile: { tx: +pos.tx.toFixed(3), ty: +pos.ty.toFixed(3) }, walkable: !!walkable[Math.round(pos.ty)]?.[Math.round(pos.tx)] }
      }
      w.__objdebug = () => ({
        objects: placed.length,
        placementsAuthored: PLACEMENTS.length,
        uniqueTextures: files.length,
        measuredOk, measuredFail,
        footprintCircles: colliders.length,
        blockedCells: blocked.size,
        blockedCellsOnWalkableGround: blockedOnLand,
        landCells,
        thor: { x: +tileWp(pos.tx, pos.ty).x.toFixed(1), y: +tileWp(pos.tx, pos.ty).y.toFixed(1), tx: +pos.tx.toFixed(2), ty: +pos.ty.toFixed(2) },
      })

      // ---- the loop ----
      instance.ticker.add((tk) => {
        const dt = tk.deltaTime
        let dx = 0, dy = 0
        if (keys['w'] || keys['arrowup']) dy -= 1
        if (keys['s'] || keys['arrowdown']) dy += 1
        if (keys['a'] || keys['arrowleft']) dx -= 1
        if (keys['d'] || keys['arrowright']) dx += 1
        const moving = !!(dx || dy)
        const sprinting = !!keys['shift'] && moving
        if (moving) {
          const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l
          const spd = (sprinting ? 0.128 : 0.075) * Math.min(dt, 2)
          const ntx = pos.tx + ux * spd, nty = pos.ty + uy * spd
          // corner assist: a failed axis move glides toward the lane centre that would pass,
          // and the glide itself must probe clean (an unchecked glide is a noclip entry point)
          if (ux !== 0) {
            if (probeX(ntx, pos.ty)) pos.tx = ntx
            else {
              const cy = Math.round(pos.ty)
              const tyC = Math.max(cy - LANE, Math.min(cy + LANE, pos.ty))
              if (tyC !== pos.ty && probeX(ntx, tyC)) {
                const gy = pos.ty + Math.sign(tyC - pos.ty) * Math.min(Math.abs(tyC - pos.ty), spd)
                if (probeY(gy, pos.tx)) pos.ty = gy
              }
            }
          }
          if (uy !== 0) {
            if (probeY(nty, pos.tx)) pos.ty = nty
            else {
              const cx = Math.round(pos.tx)
              const txC = Math.max(cx - LANE, Math.min(cx + LANE, pos.tx))
              if (txC !== pos.tx && probeY(nty, txC)) {
                const gx = pos.tx + Math.sign(txC - pos.tx) * Math.min(Math.abs(txC - pos.tx), spd)
                if (probeX(gx, pos.ty)) pos.tx = gx
              }
            }
          }
          facing = dirFromAngle(isoX(dx, dy), (dx + dy) * HH)
        }
        // SAFETY NET: anything that ever leaves him inside a measured footprint eases him out.
        // The straight radial push is tried first (it is the shortest way out), but behind a
        // building the radial points at the sea, so a blocked radial falls back to the best of
        // the 8 compass steps — the one that lands on legal ground and reduces penetration most.
        // Without the fallback a character dropped behind a facade wedges there forever.
        const penAt = (x: number, y: number) => {
          const arr = colMap.get(Math.round(x) + ',' + Math.round(y))
          let worst = 0
          if (arr) for (const i of arr) {
            const c = colliders[i], R = c.r + THOR_R
            worst = Math.max(worst, R - Math.hypot(c.cx - x, c.cy - y))
          }
          return worst
        }
        const pen = penAt(pos.tx, pos.ty)
        if (pen > 0) {
          const step = Math.max(0.012, Math.min(pen, 0.05 * dt))
          // candidate escapes: the radial away from EVERY collider he is inside, plus the 8
          // compass steps. Scoring them all (instead of committing to the deepest radial)
          // matters inside a multi-circle footprint, where one circle's radial pushes straight
          // into its neighbour and the character ping-pongs in place.
          const cand: [number, number][] = []
          const arr = colMap.get(Math.round(pos.tx) + ',' + Math.round(pos.ty)) ?? []
          for (const i of arr) {
            const c = colliders[i], d = Math.hypot(c.cx - pos.tx, c.cy - pos.ty)
            if (d > 1e-6 && c.r + THOR_R > d) cand.push([(pos.tx - c.cx) / d, (pos.ty - c.cy) / d])
          }
          for (let a = 0; a < 8; a++) cand.push([Math.cos((a * Math.PI) / 4), Math.sin((a * Math.PI) / 4)])
          // legality for the ESCAPE is GROUND ONLY, not the footprint-blocked grid. Deep inside
          // a building the surrounding cells are blocked BY THAT BUILDING, so testing against
          // the blocked grid leaves no legal step and he sits inside the wall forever. The net's
          // job is to get him back onto real ground; the footprint rules resume once he is clear.
          let best = pen, fx = 0, fy = 0
          for (const [ux, uy] of cand) {
            const cx = pos.tx + ux * step, cy = pos.ty + uy * step
            if (!groundWalk(Math.round(cx), Math.round(cy))) continue
            const q = penAt(cx, cy)
            if (q < best - 1e-6) { best = q; fx = ux; fy = uy }
          }
          if (fx || fy) { pos.tx += fx * step; pos.ty += fy * step }
        }

        at += tk.deltaMS
        const x = isoX(pos.tx, pos.ty), y = isoY(pos.tx, pos.ty)
        const breath = moving ? 1 : 1 + 0.03 * Math.sin(at / 430)
        thor.scale.set(THOR_SC, THOR_SC * breath)
        thor.position.set(x, y)
        // 5. DEPTH SORT: the character is y-sorted on his feet exactly like every object, so
        // he passes behind what is down-screen of him and in front of what is up-screen.
        thor.zIndex = (pos.tx + pos.ty) * 16 + 20
        thorShadow.position.set(x, y + 3); thorShadow.zIndex = thor.zIndex - 3
        if (dbgThor) dbgThor.position.set(x, y)
        const wf = walk[facing] ?? walk[cardinalOf(facing)]
        thor.texture = (moving && wf) ? wf[Math.floor(at / (sprinting ? 68 : 110)) % wf.length] : (idle[facing] ?? idle['south'] ?? thor.texture)

        // camera: follow him, then CLAMP to the composed frame. When the viewport is wider than
        // the frame the axis centres instead of clamping, so a very low zoom degrades gracefully.
        const vw = instance.renderer.width, vh = instance.renderer.height
        const wp = tileWp(pos.tx, pos.ty)
        const hw2 = vw / (2 * ZOOM), up = (vh * 0.62) / ZOOM, dn = (vh * 0.38) / ZOOM
        const clamp = (v: number, lo: number, hi: number) => lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v))
        const camAX = clamp(wp.x, FX0 + hw2, FX1 - hw2)
        const camAY = clamp(wp.y, FY0 + up, FY1 - dn)
        world.x = vw / 2 - (camAX - CX) * ZOOM
        world.y = vh * 0.62 - (camAY + S0 * HH) * ZOOM

        const wt = performance.now() / 1000
        const reachOf = makeReachOf(fronts, wt)
        animSwells(waterSprites, wt, reachOf)
        animTide(fronts, wt, shoreAt)
        animShoreline(skirtSegs, wetSegs, wt, shoreAt, reachOf)
        animSparkles(sparkles, wt)
        for (const g of glows) g.sp.alpha = 0.72 + 0.28 * Math.sin(wt * 1.6 + g.ph)
        resizeFx(vw, vh)
      })

      // ---- golden-hour atmosphere over the composited world ----
      const warm = new Sprite(Texture.WHITE); warm.tint = 0xffc87e; warm.alpha = 0.09; instance.stage.addChild(warm)
      const sun = new Sprite(radial(512, [[0, 'rgba(255,216,150,0.22)'], [0.5, 'rgba(255,206,138,0.07)'], [1, 'rgba(255,206,138,0)']]))
      sun.anchor.set(0.5); sun.blendMode = 'add'; instance.stage.addChild(sun)
      const vig = new Sprite(radial(512, [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,0)'], [0.72, 'rgba(30,19,8,0.34)'], [1, 'rgba(16,9,3,0.78)']]))
      instance.stage.addChild(vig)
      const resizeFx = (vw: number, vh: number) => {
        warm.width = vw; warm.height = vh
        sun.width = sun.height = Math.max(vw, vh) * 1.5; sun.position.set(vw * 0.28, vh * 0.02)
        vig.width = vw * 1.5; vig.height = vh * 1.5; vig.position.set(-vw * 0.25, -vh * 0.25)
      }
      resizeFx(instance.renderer.width, instance.renderer.height)

      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
      console.log('[objmap]', (w.__objdebug as () => unknown)())
    }

    start().catch((err) => { console.error('[ObjMapScene] failed', err) })
    return () => {
      destroyed = true
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku)
      if (app) app.destroy(true, { children: true })
    }
  }, [])
  return <div ref={ref} style={{ position: 'fixed', inset: 0, background: '#083744' }} />
}

// ---- helpers (local copies; BeachIso is not imported from or modified) ----
function radial(size: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}
function makeShadow() {
  // golden-hour shadows go COOL, never black: a dense violet-teal core that still registers
  // over bright sand, feathering out
  return radial(64, [[0, 'rgba(40,42,72,0.92)'], [0.45, 'rgba(40,42,72,0.55)'], [0.8, 'rgba(40,42,72,0.16)'], [1, 'rgba(40,42,72,0)']])
}
