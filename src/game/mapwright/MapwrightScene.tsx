import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, TextureSource } from 'pixi.js'

// MAPWRIGHT engine scene (P5), SCENE v2. A NEW, self-contained loader — NOT the island monolith and
// it imports NONE of that scene's code. It reads a MAPWRIGHT package (public/maps/<id>/map.json,
// produced by P6): per-diagonal skin STRIPS mounted at their baked px positions and depth-keyed
// z (d*4000+2000), a lift/walk grid that is the one mechanics truth (12px step law), sockets as
// faint DEV markers (?dev=1 only), and openings' triggers that fire scene hand-offs. Thor walks it
// with WASD, his own z = his diagonal*4000+3000 so he interleaves BETWEEN the strip bands (the F4
// fix: no flat skins — a strip in front of Thor draws over him, one behind draws under).
//
// v2 UPGRADES (this file only):
//  (1) REAL OCEAN — ports the beach's proven tiled-water look. The 16 NORMALIZED water tiles from
//      public/art/intro/water-n/ are pooled into a screen-px sea field under the strips, tinted by
//      a DEPTH RAMP: 4 depth bands keyed to each water tile's distance-from-land (computed from the
//      map's own walk/lift grid projected to px), each band a stop on the proven W_RAMP over the
//      W_BASE tile median, with a slow per-tile swell shimmer. NOT flat color, NOT horizontal bands.
//  (2) CAMERA — ?zoom= respected, a min-zoom clamp so the map always fills the viewport, and a
//      smooth (critically-damped) follow instead of a hard snap.
//  (3) SOCKETS behind ?dev=1 only.
//  (4) a subtle WARM AMBIENT grade — one static multiply-tinted fullscreen quad over the whole scene.
//
// Route: ?scene=mw&map=<id>   (default map = test-cove)

type MapPkg = {
  id: string
  grid: { w: number; h: number }
  tilePx: [number, number]
  originPx: [number, number]
  placeholder?: boolean
  strips: { file: string; x: number; y: number; d: number }[]
  lift: (number | null)[]
  walk: number[]
  sockets: { name: string; at?: [number, number]; along?: string; spacing?: number }[]
  triggers: { name: string; trigger: string; at?: number | null; tiles?: [number, number, number, number] | null; widthTiles?: number }[]
  // proj carries the EXACT placement math one of two ways:
  //  placeholder -> { iso: {hw,hh,originPx} } (simple 2:1)
  //  real        -> { world, projection } straight from the render manifest (az40/el30 dimetric)
  proj?: {
    iso?: { hw: number; hh: number; originPx: [number, number] }
    world?: { tilePx?: [number, number]; originPx?: [number, number]; zScalePx?: number }
    projection?: {
      pxPerUnit: number
      right: [number, number, number]
      up: [number, number, number]
      screenCenterPx: [number, number]
    }
  }
}

const dirs8 = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']
function dirFromAngle(dx: number, dy: number) {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI
  if (a >= -22.5 && a < 22.5) return 'east'
  if (a >= 22.5 && a < 67.5) return 'south-east'
  if (a >= 67.5 && a < 112.5) return 'south'
  if (a >= 112.5 && a < 157.5) return 'south-west'
  if (a >= 157.5 || a < -157.5) return 'west'
  if (a >= -157.5 && a < -112.5) return 'north-west'
  if (a >= -112.5 && a < -67.5) return 'north'
  return 'north-east'
}

const STEP_LAW_PX = 12 // the shared step law: a neighbor tile more than 12px up/down is a wall

// ---- the proven ocean look, PORTED from src/game/ocean.ts (byte-identical constants + math).
// Kept inline so this scene stays self-contained (ownership: this file only). The ocean's body is
// the DEPTH RAMP tinting the NORMALIZED water tiles: W_BASE is the tiles' shared median, tintFor
// converts a target display color into the pixi tint that reproduces it over that base, and W_RAMP
// is the glassy-aqua -> turquoise -> teal -> navy-abyss ramp the reference oceans live on. ----
const W_BASE = [205, 235, 229] // shared median of the normalized water tiles
const W_RAMP: [number, number][] = [
  [0.0, 0xa8e2d2], [0.09, 0x8ed8c6], [0.14, 0x4dbcb2], [0.24, 0x35a5a2],
  [0.38, 0x24909a], [0.54, 0x187a89], [0.68, 0x0f586c], [1.0, 0x073442],
]
// pooled water variants sorted by measured busyness: calm glass near shore, textured swell far out
const W_CALM = [0, 12, 15], W_SOFT = [3, 2, 8], W_TEX = [1, 10, 4, 6], W_SWELL = [13, 14, 11, 9, 7, 5]
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5; return s - Math.floor(s) }
function shadeHex(hex: number, f: number) {
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f)
  return (r << 16) | (g << 8) | b
}
function mix(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  return ((ar + (br - ar) * t) << 16) | ((ag + (bg - ag) * t) << 8) | (ab + (bb - ab) * t) | 0
}
function rampAt(stops: [number, number][], t: number) {
  if (t <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]
      return mix(c0, c1, (t - t0) / (t1 - t0))
    }
  }
  return stops[stops.length - 1][1]
}
// convert a DISPLAY color into the pixi tint that produces it over the normalized base texture
function tintFor(display: number, base: number[]) {
  const r = Math.min(255, Math.round(((display >> 16) & 255) * 255 / base[0]))
  const g = Math.min(255, Math.round(((display >> 8) & 255) * 255 / base[1]))
  const b = Math.min(255, Math.round((display & 255) * 255 / base[2]))
  return (r << 16) | (g << 8) | b
}

type SeaSprite = { sp: Sprite; base: number; ph: number; ph2: number; amp: number }

export default function MapwrightScene() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let app: Application | null = null
    let destroyed = false
    const keys: Record<string, boolean> = {}
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    const start = async () => {
      const params = new URLSearchParams(location.search)
      const mapId = params.get('map') || 'test-cove'
      const DEV = params.has('dev')
      const zoomParam = parseFloat(params.get('zoom') ?? '')
      const wantZoom = Number.isFinite(zoomParam) && zoomParam > 0 ? zoomParam : 1.4

      let pkg: MapPkg
      try {
        pkg = await fetch(`/maps/${mapId}/map.json`).then((r) => {
          if (!r.ok) throw new Error(`map.json ${r.status}`)
          return r.json()
        })
      } catch (e) {
        console.error(`[mapwright] could not load /maps/${mapId}/map.json —`, e)
        if (ref.current) ref.current.innerHTML =
          `<div style="color:#c9d6e2;font:14px system-ui;padding:24px">MAPWRIGHT: no map package for "${mapId}". Run P6 first.</div>`
        return
      }

      TextureSource.defaultOptions.scaleMode = 'nearest'
      const instance = new Application()
      await instance.init({ background: 0x0a2230, antialias: false, resizeTo: ref.current ?? window })
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance
      ref.current.appendChild(instance.canvas)

      const { w: W, h: H } = pkg.grid
      const [tpw, tph] = pkg.tilePx
      const hw = tpw / 2
      const hh = tph / 2
      const [ox, oy] = pkg.originPx
      const lift = pkg.lift
      const walk = pkg.walk

      const proj = pkg.proj
      const liftAt = (fx: number, fy: number) => lift[Math.min(H - 1, Math.floor(fy)) * W + Math.min(W - 1, Math.floor(fx))] ?? 0
      // world px of a GROUND point at FRACTIONAL tile (fx,fy). This is THE ONE projection —
      // Thor, sockets, the sea depth-mask and the strip alignment all read it, so nothing can drift
      // apart. Two exact roads, chosen by the package: the real render's az40/el30 dimetric, or the
      // placeholder 2:1 iso.
      //
      // BUG-1 FIX: the real road must base off originPx (= world_to_px(0,0,0), which the render bakes
      // the camera lookAt into), NOT screenCenterPx. p6 ships the projection basis but NOT the lookAt
      // vector, so screenCenterPx alone drops the ~101px lookAt.up offset and Thor floats north of the
      // land, over the sea. originPx already carries that offset exactly, so px = originPx + worldBasis.
      const groundOf = (fx: number, fy: number): [number, number] => {
        const l = liftAt(fx, fy)
        if (!pkg.placeholder && proj?.projection && proj.world) {
          const P = proj.projection
          const zs = proj.world.zScalePx ?? 16
          // tile(x,y) corner -> world (x - w/2, h/2 - y, liftPx/zScalePx) (manifest note),
          // then px = originPx + (world . right) * ppu, py = originPx - (world . up) * ppu.
          const wx = fx - W / 2, wy = H / 2 - fy, wz = l / zs
          const px = ox + (wx * P.right[0] + wy * P.right[1] + wz * P.right[2]) * P.pxPerUnit
          const py = oy - (wx * P.up[0] + wy * P.up[1] + wz * P.up[2]) * P.pxPerUnit
          return [px, py]
        }
        // placeholder iso: apex = origin + ((tx-ty)*hw, (tx+ty)*hh - lift); ground = apex + (0,hh)
        return [ox + (fx - fy) * hw, oy + (fx + fy) * hh + hh - l]
      }
      const groundX = (tx: number, ty: number) => groundOf(tx + 0.5, ty + 0.5)[0]
      const groundY = (tx: number, ty: number) => groundOf(tx + 0.5, ty + 0.5)[1]

      // ---- the world container: strips + sea + Thor all live here; the camera pans IT ----
      const world = new Container()
      world.sortableChildren = true
      instance.stage.addChild(world)

      // =====================================================================================
      // REAL OCEAN (v3): the beach's "one calm body", laid on a TRUE 64x32 iso lattice.
      //
      // The v2 sea failed two ways: it drew 64px-wide diamonds on a 48px SQUARE mask grid (the
      // size/spacing mismatch printed a high-contrast diamond CHECKER), and it SKIPPED land cells
      // (any cell a strip did not perfectly cover fell through as a BLACK hole around the coast).
      // v3 fixes both by construction:
      //  - tiles sit on the map's own 64x32 iso lattice (half-tile steps), packed edge to edge at
      //    native scale — the same geometry the strips are baked on, so there is no lattice beat.
      //  - the sea is laid EVERYWHERE across the bbox + a generous overscan, INCLUDING under the
      //    island; strips simply draw on top. Nothing is skipped, so no coastline can show black.
      //  - depth is a SMOOTH distance-to-land (not 4 hard bands) with a depth-KEYED dither (strong
      //    on the flat near-shore plateau, ~zero through the steep lit mid-band) so the ramp never
      //    prints a visible step. Gentle value differences, one calm body — the beach's exact recipe.
      // =====================================================================================

      // load the 16 normalized water variants (the tiles Ash likes)
      const waterV: Texture[] = []
      await Promise.all(Array.from({ length: 16 }, (_, i) =>
        Assets.load(`/art/intro/water-n/${i}.png`).then((t: Texture) => { waterV[i] = t }).catch(() => { /* a missing tile just drops from the pools */ })))
      const waterLoaded = waterV.filter(Boolean).length

      // strips bounding box in screen px (the water field must cover this + a margin so the sea
      // reaches past every land edge and the frame never shows the flat clear-color void)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const s of pkg.strips) {
        minX = Math.min(minX, s.x); minY = Math.min(minY, s.y)
        maxX = Math.max(maxX, s.x + tpw); maxY = Math.max(maxY, s.y + tph)
      }
      if (!Number.isFinite(minX)) {
        // no strips: fall back to the projected grid bounds so the sea still has an extent
        const c0 = groundOf(0, 0), c1 = groundOf(W, 0), c2 = groundOf(0, H), c3 = groundOf(W, H)
        minX = Math.min(c0[0], c1[0], c2[0], c3[0]); maxX = Math.max(c0[0], c1[0], c2[0], c3[0])
        minY = Math.min(c0[1], c1[1], c2[1], c3[1]); maxY = Math.max(c0[1], c1[1], c2[1], c3[1])
      }

      // the sea's own iso lattice: 64x32 diamonds (half-tile hw/hh) packed with (col+row) parity,
      // exactly like the beach. A lattice node (col,row) sits at screen (fieldX + col*hw shifted by
      // row parity, fieldY + row*hh). We cover the bbox + a wide overscan so the frame never voids.
      const OVER_TILES = 14 // diamonds of sea past the land bbox on every side (overscan generously)
      const seaX0 = minX - OVER_TILES * tpw
      const seaY0 = minY - OVER_TILES * tph
      const seaX1 = maxX + OVER_TILES * tpw
      const seaY1 = maxY + OVER_TILES * tph
      // lattice dimensions: two rows fill one tile height (the diamonds interleave), each row hw wide
      const cols = Math.ceil((seaX1 - seaX0) / hw) + 2
      const rows = Math.ceil((seaY1 - seaY0) / hh) + 2
      const seaScreenX = (col: number, row: number) => seaX0 + col * hw + (row & 1 ? hw : 0)
      const seaScreenY = (row: number) => seaY0 + row * hh

      // land mask ON THE SEA LATTICE: a node is "land" if its screen center falls within a land
      // tile's projected diamond. Cheapest robust test — bucket land tile ground-centers into a
      // screen-px hash and mark lattice nodes near any of them. Then BFS distance-to-land in nodes.
      const nodeLand = new Uint8Array(cols * rows)
      const nodeDist = new Float32Array(cols * rows).fill(-1)
      {
        // project every land tile center to screen, snap it to the nearest lattice node, mark it
        // (plus a 1-node halo so the coast reads solid, not stippled — the strips cover the paint)
        const q: number[] = []
        const markNode = (col: number, row: number) => {
          if (col < 0 || row < 0 || col >= cols || row >= rows) return
          const i = row * cols + col
          if (nodeLand[i]) return
          nodeLand[i] = 1; nodeDist[i] = 0; q.push(i)
        }
        for (let ty = 0; ty < H; ty++) {
          for (let tx = 0; tx < W; tx++) {
            if (lift[ty * W + tx] == null) continue // sea/void
            const [gx, gy] = groundOf(tx + 0.5, ty + 0.5)
            const row = Math.round((gy - seaY0) / hh)
            const col = Math.round((gx - seaX0 - (row & 1 ? hw : 0)) / hw)
            markNode(col, row)
            markNode(col + 1, row); markNode(col - 1, row)
            markNode(col, row + 1); markNode(col, row - 1)
          }
        }
        // multi-source BFS over the 4-neighbour lattice — dist is in lattice steps (~half a tile)
        let head = 0
        while (head < q.length) {
          const i = q[head++]
          const col = i % cols, row = (i / cols) | 0, d = nodeDist[i]
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nc = col + dc, nr = row + dr
            if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
            const ni = nr * cols + nc
            if (nodeDist[ni] === -1) { nodeDist[ni] = d + 1; q.push(ni) }
          }
        }
      }
      const DEPTH_NODES = 26 // lattice steps from the waterline to the abyss (the whole ramp fits)

      // lay the sea field: one 64x32 diamond per lattice node, EVERYWHERE (land nodes included —
      // strips draw over them so no coast can void). All of it sits far under the strips.
      const seaSprites: SeaSprite[] = []
      const seaZ = -1_000_000
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col
          const nd = nodeDist[i] < 0 ? DEPTH_NODES : nodeDist[i]
          // smooth depth in [0,1]; land nodes read as the glassy shallow (dep 0) beneath the strips
          const raw = Math.min(1, nd / DEPTH_NODES)
          // depth-KEYED dither: heavy on the flat near-shore plateau (banding risk, cheap to hide),
          // near-zero through the steep lit mid-band where any per-tile value step is a checker
          const dAmp = raw < 0.14 ? 0.1 : raw < 0.55 ? 0.02 : 0.05
          const dep = Math.min(1, Math.max(0, raw + (hash(col * 7.7, row * 5.3) - 0.5) * dAmp))
          // pool: calm glass near shore, busy swell far out (the beach's busyness sort)
          const h = hash(col * 1.3, row * 2.7)
          const pool = dep < 0.1 ? W_CALM
            : dep < 0.3 ? (h < 0.6 ? W_CALM : W_SOFT)
              : dep < 0.55 ? (h < 0.5 ? W_SOFT : W_TEX)
                : (h < 0.55 ? W_TEX : W_SWELL)
          const variant = pool[Math.floor(hash(col * 3.1, row * 1.9) * pool.length)]
          const tex = waterV[variant] ?? waterV.find(Boolean)
          if (!tex) continue
          const sp = new Sprite(tex)
          sp.anchor.set(0.5, 0.5)
          // mirror in COHERENT patches (not per-tile) so flips never make an X-checker
          const flip = hash(Math.floor(col / 3) + 4, Math.floor(row / 3) + 11) > 0.5 ? -1 : 1
          sp.scale.set(flip * 1.06, 1.06) // a hair oversize so neighbours overlap and the grid softens
          sp.position.set(seaScreenX(col, row) + hw, seaScreenY(row) + hh)
          sp.zIndex = seaZ
          // broad drifting patch light (NO per-tile grain — a per-tile value step reads as a checker)
          const patch = 0.965 + 0.06 * hash(Math.floor(col / 6) + 7, Math.floor(row / 6) + 2)
          const base = shadeHex(tintFor(rampAt(W_RAMP, dep), W_BASE), patch)
          sp.tint = base
          world.addChild(sp)
          seaSprites.push({
            sp, base,
            ph: (col + row) * 0.5 + 0.35 * Math.sin((col - row) * 0.18),
            ph2: (col + row) * 0.21 - (col - row) * 0.07,
            amp: 0.014 + 0.03 * dep, // gentle: calm at the shore, a slow roll out deep
          })
        }
      }
      console.log(`[mapwright] ocean tiles: ${seaSprites.length} (variants loaded: ${waterLoaded}/16, lattice ${cols}x${rows})`)

      // ---- STRIPS: each per-diagonal skin slice at its baked px, z = d*4000 + 2000 ----
      await Promise.all(pkg.strips.map(async (s) => {
        try {
          const tex = await Assets.load(`/maps/${mapId}/${s.file}`)
          const sp = new Sprite(tex)
          sp.x = s.x
          sp.y = s.y
          sp.zIndex = s.d * 4000 + 2000
          world.addChild(sp)
        } catch (e) {
          console.warn(`[mapwright] strip failed: ${s.file}`, e)
        }
      }))

      // ---- SOCKETS: faint DEV markers where population lands later (?dev=1 only) ----
      if (DEV) {
        for (const soc of pkg.sockets) {
          if (!soc.at) continue
          const [sx, sy] = soc.at
          const gx = groundX(sx, sy), gy = groundY(sx, sy)
          const m = new Graphics()
            .circle(0, 0, 6).fill({ color: 0x8fe3ff, alpha: 0.28 })
            .circle(0, 0, 6).stroke({ color: 0x8fe3ff, alpha: 0.6, width: 1 })
          m.x = gx; m.y = gy
          m.zIndex = (sx + sy) * 4000 + 2500
          world.addChild(m)
        }
      }

      // ---- THOR: walk sprites, WASD, ground from lift/walk with the 12px step law ----
      const idle: Record<string, Texture> = {}
      const walkFrames: Record<string, Texture[]> = {}
      // trim the dead transparent padding below Thor's drawn feet so anchor(0.5,1) = his feet
      const trimmed = (t: Texture): Texture => {
        try {
          const src = t.source
          const cv = document.createElement('canvas')
          cv.width = src.pixelWidth; cv.height = src.pixelHeight
          const g = cv.getContext('2d', { willReadFrequently: true })!
          g.drawImage(src.resource as CanvasImageSource, 0, 0)
          const d = g.getImageData(0, 0, cv.width, cv.height).data
          let feet = -1
          for (let y = cv.height - 1; y >= 0 && feet < 0; y--)
            for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 40) { feet = y; break }
          if (feet < 0 || feet >= src.pixelHeight - 1) return t
          return new Texture({ source: src, frame: new Rectangle(0, 0, src.pixelWidth, feet + 1) })
        } catch { return t }
      }
      await Promise.all(dirs8.map(async (dir) => {
        try {
          const frames = await Promise.all([0, 1, 2, 3, 4, 5].map((i) =>
            Assets.load(`/art/characters/thor/walk/${dir}/${i}.png`)))
          walkFrames[dir] = frames.map(trimmed)
          idle[dir] = walkFrames[dir][0]
        } catch { /* a missing dir just leaves Thor without that facing */ }
      }))

      // spawn: a GUARANTEED walk=1 tile nearest the walk centroid that also has at least one
      // step-law-reachable walkable neighbor (so Thor lands ON the island and can actually move,
      // not on an isolated pinnacle). Old logic picked the min-(tx+ty) corner — a far sand edge.
      let spawnTx = Math.floor(W / 2), spawnTy = Math.floor(H / 2)
      {
        let sumX = 0, sumY = 0, n = 0
        for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
          if (walk[ty * W + tx]) { sumX += tx; sumY += ty; n++ }
        }
        const cx = n ? sumX / n : W / 2, cy = n ? sumY / n : H / 2
        const hasReachableNbr = (tx: number, ty: number) => {
          const l = lift[ty * W + tx]
          if (l == null) return false
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = tx + dx, ny = ty + dy
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const nk = ny * W + nx
            if (walk[nk] && lift[nk] != null && Math.abs((lift[nk] as number) - (l as number)) <= STEP_LAW_PX) return true
          }
          return false
        }
        let best = Infinity, fallback = Infinity, fbx = spawnTx, fby = spawnTy, found = false
        for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
          const k = ty * W + tx
          if (!walk[k] || lift[k] == null) continue
          const dist = (tx - cx) * (tx - cx) + (ty - cy) * (ty - cy)
          if (dist < fallback) { fallback = dist; fbx = tx; fby = ty } // any walk tile, last resort
          if (hasReachableNbr(tx, ty) && dist < best) { best = dist; spawnTx = tx; spawnTy = ty; found = true }
        }
        if (!found) { spawnTx = fbx; spawnTy = fby } // no mobile tile anywhere -> nearest walk tile
      }
      let px = spawnTx + 0.5, py = spawnTy + 0.5 // Thor's fractional TILE position
      let facing = 'south'
      let animT = 0

      // BUG-1 alignment probe: spawn tile + its walk + computed px vs strip0's baked px. If the
      // projection is right these read on the same coordinate system (Thor sits on the strips).
      {
        const spawnPx = groundOf(spawnTx + 0.5, spawnTy + 0.5)
        const s0 = pkg.strips[0]
        console.log(
          `[mapwright] thor spawn tile (${spawnTx},${spawnTy}) walk=${walk[spawnTy * W + spawnTx]} `
          + `px=[${spawnPx[0].toFixed(1)},${spawnPx[1].toFixed(1)}] | strip0 ${s0?.file ?? 'none'} `
          + `placed px=[${s0?.x ?? '?'},${s0?.y ?? '?'}] d=${s0?.d ?? '?'}`,
        )
      }

      const thorShadow = new Graphics().ellipse(0, 0, 14, 7).fill({ color: 0x000000, alpha: 0.28 })
      world.addChild(thorShadow)
      const thor = new Sprite(idle['south'] ?? Texture.WHITE)
      thor.anchor.set(0.5, 1)
      thor.scale.set(1)
      world.addChild(thor)

      // ---- CAMERA: ?zoom respected, min-zoom CLAMP so the map always fills the viewport, smooth
      // (critically-damped) follow. The clamp compares the projected land extent (px) to the screen
      // so the land can never shrink below the viewport with clear-color bleeding in on any side. ----
      const clampZoom = () => {
        const landW = Math.max(1, maxX - minX)
        const landH = Math.max(1, maxY - minY)
        // the map must at least fill the shorter screen dimension against its own extent, plus a
        // margin of sea (the ocean overscans well past this, so the frame never shows clear-color)
        const CAM_PAD = 4 * tpw
        const minZ = Math.max(instance.screen.width / (landW + CAM_PAD), instance.screen.height / (landH + CAM_PAD))
        return Math.max(wantZoom, minZ * 0.9) // 0.9 lets a hair of sea breathe at the frame edge
      }
      let ZOOM = clampZoom()
      world.scale.set(ZOOM)
      // seed the camera ON Thor so frame 1 is already centered (no snap-in)
      {
        const [gx0, gy0] = groundOf(px, py)
        world.x = instance.screen.width / 2 - gx0 * ZOOM
        world.y = instance.screen.height / 2 - gy0 * ZOOM
      }
      instance.renderer.on('resize', () => { ZOOM = clampZoom(); world.scale.set(ZOOM) })

      // ---- WARM AMBIENT GRADE: one static fullscreen multiply-tinted quad over the whole scene.
      // A subtle golden-hour wash (the plan's warm sun): pulls the cool sea + strips toward the
      // shared low-warm atmosphere without touching any asset. Static — no per-frame cost. ----
      const grade = new Graphics()
        .rect(0, 0, instance.screen.width, instance.screen.height)
        .fill({ color: 0xffd9a0, alpha: 1 })
      grade.blendMode = 'multiply'
      grade.alpha = 0.16
      instance.stage.addChild(grade) // above the world, below nothing else (this scene has no HUD)
      const sizeGrade = () => {
        grade.clear().rect(0, 0, instance.screen.width, instance.screen.height).fill({ color: 0xffd9a0, alpha: 1 })
      }
      instance.renderer.on('resize', sizeGrade)

      // walkability of a tile CENTER, plus the step law vs the tile Thor stands on
      const tileWalkable = (tx: number, ty: number, fromLift: number | null): boolean => {
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false
        const k = ty * W + tx
        if (!walk[k] || lift[k] == null) return false
        if (fromLift != null && Math.abs((lift[k] as number) - fromLift) > STEP_LAW_PX) return false
        return true
      }

      let lastTrigger = ''
      instance.ticker.add((tk) => {
        const dt = tk.deltaMS / 1000
        // input -> desired move vector in TILE space (WASD; arrows too)
        let mx = 0, my = 0
        if (keys['w'] || keys['arrowup']) { mx -= 1; my -= 1 }
        if (keys['s'] || keys['arrowdown']) { mx += 1; my += 1 }
        if (keys['a'] || keys['arrowleft']) { mx -= 1; my += 1 }
        if (keys['d'] || keys['arrowright']) { mx += 1; my -= 1 }
        const moving = mx !== 0 || my !== 0
        if (moving) {
          const len = Math.hypot(mx, my)
          const SPEED = 3.2 // tiles/sec
          const stepX = (mx / len) * SPEED * dt
          const stepY = (my / len) * SPEED * dt
          const here = lift[Math.floor(py) * W + Math.floor(px)] ?? null
          // move on each axis independently so Thor slides along walls instead of sticking
          const ntx = px + stepX
          if (tileWalkable(Math.floor(ntx), Math.floor(py), here)) px = ntx
          const nty = py + stepY
          if (tileWalkable(Math.floor(px), Math.floor(nty), here)) py = nty
          // screen-space facing (iso): screen-x runs along (tx-ty), screen-y along (tx+ty)
          facing = dirFromAngle(mx - my, mx + my)
          animT += dt
        } else {
          animT = 0
        }

        const tx = Math.floor(px), ty = Math.floor(py)
        const [gx, gy] = groundOf(px, py)
        thor.x = gx; thor.y = gy
        thorShadow.x = gx; thorShadow.y = gy
        thor.zIndex = Math.floor(px + py) * 4000 + 3000
        thorShadow.zIndex = thor.zIndex - 1
        const frames = walkFrames[facing]
        if (moving && frames && frames.length) {
          thor.texture = frames[Math.floor(animT * 10) % frames.length]
        } else {
          thor.texture = idle[facing] ?? thor.texture
        }

        // trigger check: log which opening Thor is standing on (scene hand-offs later).
        // p6 now ships each opening's real tile AABB (`tiles`), derived from its poly, so the
        // fire test is the opening's own footprint (with a 1-tile skin of tolerance) — not the
        // old `at != null && ty >= H/2` column heuristic that never fired (every plan ships at=null).
        let hit = ''
        for (const t of pkg.triggers) {
          if (t.tiles) {
            const [ax, ay, bx, by] = t.tiles
            if (tx >= ax - 1 && tx <= bx + 1 && ty >= ay - 1 && ty <= by + 1) { hit = t.trigger; break }
          } else if (t.at != null && Math.abs(tx - t.at) <= (t.widthTiles ?? 2) && ty >= H / 2) {
            hit = t.trigger; break
          }
        }
        if (hit && hit !== lastTrigger) { console.log(`[mapwright] trigger: ${hit}`); lastTrigger = hit }
        if (!hit) lastTrigger = ''

        // ---- camera: SMOOTH critically-damped follow toward Thor centered on screen ----
        const targetX = instance.screen.width / 2 - gx * ZOOM
        const targetY = instance.screen.height / 2 - gy * ZOOM
        const k = 1 - Math.exp(-12 * dt) // frame-rate independent smoothing (~0.18 at 60fps)
        world.x += (targetX - world.x) * k
        world.y += (targetY - world.y) * k

        // ---- sea shimmer: slow per-tile swell brightness (no shader; the tiles Ashwath likes) ----
        const wt = tk.lastTime / 1000
        for (const s of seaSprites) {
          const fct = 1 + s.amp * (Math.sin(s.ph - wt * 1.05) + 0.55 * Math.sin(s.ph2 - wt * 0.42 + 1.7))
          s.sp.tint = shadeHex(s.base, fct)
        }
      })

      console.log(`[mapwright] loaded "${pkg.id}" — ${pkg.strips.length} strips, `
        + `grid ${W}x${H}${pkg.placeholder ? ' (PLACEHOLDER skins)' : ''}. WASD to walk.`)
    }

    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    void start()
    return () => {
      destroyed = true
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      if (app) app.destroy(true, { children: true, texture: false })
    }
  }, [])

  return <div ref={ref} style={{ position: 'absolute', inset: 0, background: '#0a2230' }} />
}
