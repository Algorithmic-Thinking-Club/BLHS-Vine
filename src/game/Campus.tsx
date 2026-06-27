import { useEffect, useRef, useState } from 'react'
import { Application, Assets, ColorMatrixFilter, Container, Graphics, Matrix, RenderTexture, Sprite, Text, Texture, TextureSource } from 'pixi.js'
import { buildCampusGrid, STADIUM, type CampusGrid, type Mat } from './campus-grid'
import { placeProps, forestTreeline, type Placement } from './campus-props'
import { SECTIONS, type TileRect } from './sections'
import { BLHS } from '../vine/palette'

// distinct review colors for the section-boundary highlights (Edit mode), keyed to SECTIONS order
const SECTION_COLORS = [0x4fd1c5, 0xf6ad55, 0xfc8181, 0x9f7aea, 0x68d391, 0xf687b3, 0xf6e05e, 0x63b3ed, 0xed8936, 0xa0aec0]

// The ONE campus renderer. The real 1:1 geometry (campus-grid) becomes a discrete material+level grid;
// terrain is stamped as pixel-art BLOCK tiles and BAKED per ~24x24 chunk to a RenderTexture, with
// viewport culling, so the vast campus (~880x730 tiles) stays at 60fps. Material->block is a registry
// (placeholder tiles + palette tints for now; Phase 2 swaps in BLHS-grounded art). Footprint-agnostic.

const HW = 32, HH = 16, LH = 31, BLK = 64 / 48, CHUNK = 24
const isoX = (tx: number, ty: number) => (tx - ty) * HW
const isoY = (tx: number, ty: number, level: number) => (tx + ty) * HH - level * LH

function shade(hex: number, f: number) {
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f)
  return (r << 16) | (g << 8) | b
}
const hashI = (x: number, y: number) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff
}
// smooth value noise in [0,1] for large-scale ground modulation (sun/shade drift, dry patches) that
// breaks the per-tile grid at a scale the eye reads as "a real field", not a repeat.
const vnoise2 = (x: number, y: number) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
  const a = hashI(ix, iy), b = hashI(ix + 1, iy), c = hashI(ix, iy + 1), d = hashI(ix + 1, iy + 1)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
// per-channel multiply of a packed hex by an (r,g,b) gain triple, clamped.
const tintMul = (hex: number, fr: number, fg: number, fb: number) => {
  const r = Math.min(255, ((hex >> 16) & 255) * fr), g = Math.min(255, ((hex >> 8) & 255) * fg), b = Math.min(255, (hex & 255) * fb)
  return (r << 16) | (g << 8) | b
}
function radialTex(size: number, stops: [number, string][]) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size
  const ctx = cv.getContext('2d')!, g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size)
  const t = Texture.from(cv); t.source.scaleMode = 'linear'; return t
}

// material -> BLHS-grounded, palette-graded block tile (public/art/campus/blocks/). Tiles are already
// graded to palette.ts, so tint stays ~white (the slight per-tile shade in stampTile just breaks the
// grid). building reuses concrete tinted to a parchment mass (placeholder until the A-series records).
const BLK_DEF: Record<Mat, { files: string[]; tint: number; ay: number }> = {
  grass: { files: ['grass-v1', 'grass-v2', 'grass-v3', 'grass-v4'], tint: 0xffffff, ay: 12 / 48 },
  turf: { files: ['turf'], tint: 0xffffff, ay: 13 / 48 },
  forest: { files: ['canopy-1', 'canopy-2', 'canopy-3'], tint: 0xffffff, ay: 13 / 48 },  // dense treetop canopy (carries the forest mass; front-band hero trees stand over it)
  concrete: { files: ['concrete-v1', 'concrete-v2', 'concrete-v3'], tint: 0xffffff, ay: 13 / 48 },
  asphalt: { files: ['asphalt'], tint: 0xffffff, ay: 13 / 48 },
  dirt: { files: ['dirt'], tint: 0xffffff, ay: 13 / 48 },
  court: { files: ['court'], tint: 0xffffff, ay: 13 / 48 },
  brick: { files: ['brick-v1', 'brick-v2'], tint: 0xffffff, ay: 13 / 48 },
  building: { files: ['concrete-v1'], tint: BLHS.parchment, ay: 13 / 48 },
  track: { files: ['track-red'], tint: 0xd2705a, ay: 13 / 48 },  // deepen the tile toward terracotta #8b3a2a (the world grade desaturates the raw red to salmon)
  fieldturf: { files: ['field-turf'], tint: 0xffffff, ay: 13 / 48 },
  apron: { files: ['concrete-v1', 'concrete-v2', 'concrete-v3'], tint: shade(BLHS.concrete, 0.88), ay: 13 / 48 },
  patio: { files: ['court-concrete-v1', 'court-concrete-v2', 'court-concrete-v3'], tint: BLHS.concrete, ay: 13 / 48 },
}

const dirs8 = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']
const cardinals = ['south', 'north', 'east', 'west']
function dirFromAngle(dx: number, dy: number) {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI
  if (a >= -22.5 && a < 22.5) return 'east'; if (a >= 22.5 && a < 67.5) return 'south-east'
  if (a >= 67.5 && a < 112.5) return 'south'; if (a >= 112.5 && a < 157.5) return 'south-west'
  if (a >= 157.5 || a < -157.5) return 'west'; if (a >= -157.5 && a < -112.5) return 'north-west'
  if (a >= -112.5 && a < -67.5) return 'north'; return 'north-east'
}
const cardinalOf = (d: string) => cardinals.includes(d) ? d : d.includes('south') ? 'south' : d.includes('north') ? 'north' : d.includes('east') ? 'east' : 'west'

// ---- Football & Track markings (vector overlay) ----------------------------------------------------
// Crisp white lane/yard/hash lines built as iso-projected polylines from the STADIUM math (so they read
// at any zoom and stay correctly oriented, vs baked-into-a-tile line that would repeat). Rule #5 of the
// gold standard: designed surfaces. Returns polylines (world-iso point arrays) that get drawn INTO each
// terrain chunk under the props, so the grandstand/poles composite on top with correct depth.
type MarkLine = { pts: number[]; w: number; alpha: number }
function buildStadiumMarkings(grid: CampusGrid): MarkLine[] {
  const S = STADIUM, out: MarkLine[] = []
  const { minx, miny, ft } = grid
  const px = (fx: number, fy: number) => isoX((fx - minx) / ft, (fy - miny) / ft)
  const py = (fx: number, fy: number) => isoY((fx - minx) / ft, (fy - miny) / ft, 0)
  const toFeet = (u: number, v: number): [number, number] => [S.cx + u * S.ux + v * S.vx, S.cy + u * S.uy + v * S.vy]
  const lineUV = (uv: [number, number][], w: number, alpha: number) => {
    const pts: number[] = []
    for (const [u, v] of uv) { const [fx, fy] = toFeet(u, v); pts.push(px(fx, fy), py(fx, fy)) }
    out.push({ pts, w, alpha })
  }
  // perimeter of the stadium (discorectangle) at offset "radius" rr, as local (u,v) samples (closed)
  const stadiumLoop = (rr: number): [number, number][] => {
    const pts: [number, number][] = [], N = 24
    pts.push([S.straightHalf, rr], [-S.straightHalf, rr])
    for (let i = 1; i < N; i++) { const a = Math.PI / 2 + (Math.PI * i) / N; pts.push([-S.straightHalf + rr * Math.cos(a), rr * Math.sin(a)]) }
    pts.push([-S.straightHalf, -rr], [S.straightHalf, -rr])
    for (let i = 1; i < N; i++) { const a = -Math.PI / 2 + (Math.PI * i) / N; pts.push([S.straightHalf + rr * Math.cos(a), rr * Math.sin(a)]) }
    pts.push([S.straightHalf, rr])
    return pts
  }
  // 8 LANE LINES on the track ring (outer HV down to the field edge)
  const lanes = 8, step = S.TRACK_W / lanes
  for (let i = 0; i <= lanes; i++) lineUV(stadiumLoop(S.HV - i * step), i === 0 || i === lanes ? 2.4 : 1.4, i === 0 || i === lanes ? 0.95 : 0.62)
  // FIELD: a clean rectangle that fits INSIDE the inner green oval, with yard lines every 15 ft (5 yd)
  // perpendicular to the long axis (bold every 30 ft) + two inset hash rows. fieldU is bounded so the
  // rectangle corners stay inside the inner oval (fieldR), not poking into the red curves.
  const fieldR = S.HV - S.TRACK_W
  const fieldV = fieldR - 12
  const fieldU = S.straightHalf + Math.sqrt(Math.max(0, fieldR * fieldR - (fieldV + 6) * (fieldV + 6)))
  for (let u = -fieldU + 0.001; u <= fieldU; u += 15) {
    const bold = Math.abs(Math.round(u / 15)) % 2 === 0
    lineUV([[u, -fieldV], [u, fieldV]], bold ? 1.7 : 1.0, bold ? 0.8 : 0.5)
  }
  // field rectangle (sidelines + end lines) — drawn as 4 explicit segments (no closing diagonal)
  lineUV([[-fieldU, fieldV], [fieldU, fieldV]], 1.9, 0.88)
  lineUV([[-fieldU, -fieldV], [fieldU, -fieldV]], 1.9, 0.88)
  lineUV([[-fieldU, -fieldV], [-fieldU, fieldV]], 1.9, 0.88)
  lineUV([[fieldU, -fieldV], [fieldU, fieldV]], 1.9, 0.88)
  // hash marks: two inset rows of short ticks
  const hashV = fieldV * 0.34
  for (let u = -fieldU + 9; u <= fieldU - 9; u += 5) {
    lineUV([[u, hashV - 1.2], [u, hashV + 1.2]], 0.9, 0.5)
    lineUV([[u, -hashV - 1.2], [u, -hashV + 1.2]], 0.9, 0.5)
  }
  return out
}

type NearInfo = { id: string; label: string } | null
export function Campus({ onReady, onState, onEnter, paused }: {
  onReady?: () => void
  onState?: (s: { district: string; near: NearInfo }) => void
  onEnter?: (id: string) => void
  paused?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const onReadyRef = useRef(onReady); onReadyRef.current = onReady
  const cbRef = useRef({ onState, onEnter }); cbRef.current = { onState, onEnter }
  const pausedRef = useRef(paused); pausedRef.current = paused
  // View = normal gameplay (Thor + WASD). Edit = read-only review tool: free mouse pan/zoom, no Thor,
  // faint labeled section-boundary highlights. The Pixi loop reads modeRef (a stable ref) each frame.
  const [mode, setMode] = useState<'view' | 'edit'>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('edit') ? 'edit' : 'view')
  const modeRef = useRef(mode); modeRef.current = mode

  useEffect(() => {
    let app: Application | null = null, destroyed = false
    const keys: Record<string, boolean> = {}
    let nearNpc: NearInfo = null   // updated each frame; read by the E-key handler to trigger the grape
    const kd = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true
      if (e.key.toLowerCase() === 'e' && nearNpc && !pausedRef.current) cbRef.current.onEnter?.(nearNpc.id)
    }
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    const start = async () => {
      const grid: CampusGrid = buildCampusGrid()
      const sp = new URLSearchParams(window.location.search)
      const ZOOM = parseFloat(sp.get('z') || '') || 1.15           // ?z=0.4 for a campus overview
      const atParam = (sp.get('at') || '').split(',').map(Number)   // ?at=tx,ty to spawn elsewhere
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const instance = new Application()
      await instance.init({ background: 0x2b3327, antialias: false, resizeTo: ref.current ?? window })
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance; ref.current.appendChild(instance.canvas)

      // block textures (BLHS-grounded, palette-graded)
      const BK: Record<string, Texture> = {}
      const files = [...new Set(Object.values(BLK_DEF).flatMap((d) => d.files))]
      await Promise.all(files.map(async (f) => { try { BK[f] = await Assets.load(`/art/campus/blocks/${f}.png`) } catch { /* */ } }))
      // props: compute hero placements, bucket by chunk, load textures
      const propTex: Record<string, Texture> = {}
      const propsByChunk = new Map<string, Placement[]>()
      const placements = placeProps(grid)
      await Promise.all([...new Set(placements.map((p) => p.file))].map(async (f) => { try { propTex[f] = await Assets.load(f) } catch { /* */ } }))
      for (const pl of placements) {
        const k = Math.floor(pl.tx / CHUNK) + ',' + Math.floor(pl.ty / CHUNK)
        const arr = propsByChunk.get(k); if (arr) arr.push(pl); else propsByChunk.set(k, [pl])
      }
      // LIVE front treeline (depth-sorted vs Thor + animated): bucket by chunk, instantiate only the
      // visible chunks (culled with the same want-set as the baked terrain), sway each frame.
      const treeline = forestTreeline(grid)
      const treeByChunk = new Map<string, Placement[]>()
      for (const pl of treeline) {
        const k = Math.floor(pl.tx / CHUNK) + ',' + Math.floor(pl.ty / CHUNK)
        const arr = treeByChunk.get(k); if (arr) arr.push(pl); else treeByChunk.set(k, [pl])
      }
      await Promise.all([...new Set(treeline.map((p) => p.file))].map(async (f) => { if (!propTex[f]) { try { propTex[f] = await Assets.load(f) } catch { /* */ } } }))
      let decalTex: Texture | null = null  // grass-tuft edge decal to soften concrete<->grass seams
      try { decalTex = await Assets.load('/art/campus/props/edge-grass-scatter.png') } catch { /* */ }
      // Thor
      const idle: Record<string, Texture> = {}
      await Promise.all(dirs8.map(async (d) => { try { idle[d] = await Assets.load(`/art/characters/thor/${d}.png`) } catch { /* */ } }))
      const walk: Record<string, Texture[]> = {}
      const loadWalk = async () => { await Promise.all(dirs8.map(async (d) => { try { walk[d] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => Assets.load(`/art/characters/thor/walk/${d}/${i}.png`))) } catch { /* */ } })) }
      if (destroyed) { instance.destroy(true); return }

      const world = new Container(); world.scale.set(ZOOM); world.sortableChildren = true
      instance.stage.addChild(world)
      // Grade the WHOLE world at the source so terrain keeps its real muted palette under warm light:
      // a small contrast lift + slight desaturation (so nothing pushes to neon/yellow) + a hair of warmth
      // and a touch less brightness so highlights (concrete/patio) don't clip to white. The gold standard
      // is warm but GROUNDED: rich darks, restrained saturation. This does the grounding before any overlay.
      const grade = new ColorMatrixFilter()
      grade.brightness(1.0, false)   // lift to a brighter, more inviting daylight (not dark, not blinding)
      grade.saturate(-0.02, true)    // keep the color alive (more enjoyable) without going neon
      grade.contrast(0.1, true)      // still grounded darks, just airier than before
      // warm the midtones toward late-afternoon gold: R channel-scale up, B down — clearly warm, measured.
      // The 5x4 matrix rows are R/G/B/A; the diagonal channel-scales sit at indices 0 (R), 6 (G), 12 (B).
      const wm = grade.matrix
      wm[0] *= 1.075; wm[12] *= 0.91
      grade.matrix = wm
      world.filters = [grade]
      let viewZoom = ZOOM   // current camera zoom: ZOOM in View mode, editCam.zoom in Edit mode

      // ---- hybrid-by-zone LAWN: manicured mowed quad near hardscape (faint mowing stripes) blending to
      // wilder turf at the forest edge. Reads grid.grassWild (0..1). The grid is broken three ways at once:
      // (1) MACRO low-freq sun/shade + dryness drift (~26-tile), (2) mowing stripes in the manicured zone,
      // (3) zone-varied tile set + base tint pulling the lush source toward muted PNW lawn. Sparse tuft
      // scatter rises with wildness. (Placeholder tints until the real manicured-lawn tiles are generated.)
      const GRASS_MANI = ['grass-v1', 'grass-v2'], GRASS_WILD = ['grass-v3', 'grass-v4']
      const stampGrass = (cont: Container, tx: number, ty: number, L: number) => {
        const w = grid.grassWild[ty * grid.cols + tx]
        const files = w < 0.45 ? GRASS_MANI : w < 0.7 ? (hashI(tx, ty) < 0.5 ? GRASS_MANI : GRASS_WILD) : GRASS_WILD
        const tex = BK[files[Math.floor(hashI(tx * 1.7, ty * 2.3) * files.length)]] ?? BK['grass-v1']; if (!tex) return
        // FIELD-SCALE tonal drift: big organic patches (lighter/darker) across the lawn, dominated by a
        // long wavelength so a wide expanse is never one flat shade. Stays in the green family — we push
        // brightness + green only, never a brown/warm multiply (that is what muddied it before).
        const big = vnoise2(tx / 58 + 20, ty / 58 + 7)       // ~170ft patches — the dominant field drift
        const med = vnoise2(tx / 24 + 3, ty / 24 + 11)
        const fine = vnoise2(tx / 8.5 + 5, ty / 8.5 + 2)
        const drift = (big - 0.5) * 0.80 + (med - 0.5) * 0.30 + (fine - 0.5) * 0.12
        const mani = 1 - Math.min(1, w / 0.55)
        const stripe = mani * (((Math.floor((tx - ty) / 3) & 1) ? 1 : -1) * 0.035)
        const bright = 1 + drift * 0.17 + stripe + lerp(-0.04, 0.05, w)
        // a HINT of the old meadow in the lighter field patches: bias the green lusher (more G, slightly
        // less R). A touch of life/variation — NOT a return to the bright cartoon green.
        const lush = Math.max(0, big * 0.7 + fine * 0.3 - 0.4)   // 0..~0.6, only the lighter patches
        const fr = lerp(0.55, 0.66, w) * bright * (1 - lush * 0.06)
        const fg = lerp(0.66, 0.78, w) * bright * (1 + lush * 0.11)
        const fb = lerp(0.50, 0.56, w) * bright * (1 + lush * 0.02)
        const fx = hashI(tx * 3, ty * 7) > 0.5 ? -BLK : BLK
        const b = new Sprite(tex); b.anchor.set(0.5, 12 / 48); b.tint = tintMul(0xffffff, fr, fg, fb); b.scale.set(fx, BLK)
        b.position.set(isoX(tx, ty), isoY(tx, ty, L)); b.zIndex = (tx + ty) * 16
        cont.addChild(b)
        // (open-lawn tuft scatter REMOVED — real planting goes at bed edges + building bases, never sprinkled on grass)
      }

      // ---- stamp one tile's block stack into a chunk container (world coords) ----
      const stampTile = (cont: Container, tx: number, ty: number) => {
        const m = grid.mat[ty][tx], L = grid.level[ty][tx]
        if (m === 'grass') { stampGrass(cont, tx, ty, L); return }
        const def = BLK_DEF[m]; const tex = BK[def.files[Math.floor(hashI(tx, ty) * def.files.length)] ?? def.files[0]]; if (!tex) return
        const le = tx + 1 < grid.cols ? grid.level[ty][tx + 1] : L
        const ls = ty + 1 < grid.rows ? grid.level[ty + 1][tx] : L
        const front = Math.min(le, ls)
        const bottom = Math.min(L - 1, front)
        let tint = shade(def.tint, 0.96 + hashI(tx, ty) * 0.08)
        // continuous macro drift on the deep-forest canopy so the treetop mass doesn't read as a tiled grid
        if (m === 'forest') {
          const d = vnoise2(tx / 18 + 4, ty / 18 + 7) * 0.68 + vnoise2(tx / 6 + 1, ty / 6 + 9) * 0.32
          const f = 0.82 + d * 0.30
          tint = tintMul(0xffffff, f, f, f)
        }
        const isBldg = m === 'building', tall = isBldg && L - bottom >= 3   // a raised facade wall, not a flat pad
        for (let s = L; s > bottom; s--) {
          // facade banding on a raised building wall: white parapet cap, greige siding body, brick base
          let t = tint
          if (tall) {
            if (s === L) t = shade(BLHS.fascia, 0.97)
            else if (s <= bottom + 2) t = shade(BLHS.brick, s === bottom + 1 ? 1 : 1.07)
            else t = shade(BLHS.parchment, 0.92 + (s % 2) * 0.08)
          }
          const fx = hashI(tx * 3, ty * 7 + s) > 0.5 ? -BLK : BLK
          const b = new Sprite(tex); b.anchor.set(0.5, def.ay); b.tint = t; b.scale.set(fx, BLK)
          b.position.set(isoX(tx, ty), isoY(tx, ty, s)); b.zIndex = (tx + ty) * 16 + s
          cont.addChild(b)
        }
        // edge blend: scatter grass tufts where concrete meets grass so the seam isn't a hard line
        if (decalTex && m === 'concrete') {
          const nearGrass = grid.mat[ty]?.[tx + 1] === 'grass' || grid.mat[ty]?.[tx - 1] === 'grass' || grid.mat[ty + 1]?.[tx] === 'grass' || grid.mat[ty - 1]?.[tx] === 'grass'
          if (nearGrass && hashI(tx * 5, ty * 9) > 0.4) {
            const d = new Sprite(decalTex); d.anchor.set(0.5, 0.62); d.scale.set(58 / decalTex.width); d.position.set(isoX(tx, ty), isoY(tx, ty, L)); d.zIndex = (tx + ty) * 16 + 8
            cont.addChild(d)
          }
        }
      }

      const shadowTex = radialTex(64, [[0, 'rgba(18,14,6,0.5)'], [0.7, 'rgba(18,14,6,0.18)'], [1, 'rgba(18,14,6,0)']])

      // ---- LIVE animated front treeline: depth-sorted sprites (direct world children, so they occlude
      // Thor correctly by depth) that sway in the wind. Instantiated only for visible chunks (culled with
      // the baked terrain) and animated each frame. The deep interior stays baked + static. ----
      type LiveTree = { sp: Sprite; phase: number; amp: number }
      const liveByChunk = new Map<string, { sprites: Sprite[]; trees: LiveTree[] }>()
      const addLiveChunk = (key: string) => {
        if (liveByChunk.has(key)) return
        const arr = treeByChunk.get(key)
        if (!arr) { liveByChunk.set(key, { sprites: [], trees: [] }); return }
        const sprites: Sprite[] = [], trees: LiveTree[] = []
        for (const pl of arr) {
          const t = propTex[pl.file]; if (!t) continue
          const L = grid.level[Math.round(pl.ty)]?.[Math.round(pl.tx)] ?? 0
          const px = isoX(pl.tx, pl.ty), py = isoY(pl.tx, pl.ty, L), depth = Math.floor(pl.tx + pl.ty)
          const sc = (pl.tilesTall * 32) / t.height
          const sh = new Sprite(shadowTex); sh.anchor.set(0.5); sh.width = Math.max(14, t.width * sc * 0.7); sh.height = sh.width * 0.4
          sh.alpha = 0.28; sh.position.set(px, py); sh.zIndex = depth * 16 + 1; world.addChild(sh); sprites.push(sh)
          const sp = new Sprite(t); sp.anchor.set(0.5, pl.ay); sp.scale.set(sc); sp.position.set(px, py)
          sp.zIndex = depth * 16 + 11   // just under Thor (+12) at equal depth → trees in front (higher depth) occlude him
          world.addChild(sp); sprites.push(sp)
          trees.push({ sp, phase: hashI(pl.tx * 7, pl.ty * 13) * Math.PI * 2, amp: 0.010 + hashI(pl.tx, pl.ty) * 0.018 })
        }
        liveByChunk.set(key, { sprites, trees })
      }
      const removeLiveChunk = (key: string) => {
        const e = liveByChunk.get(key); if (!e) return
        for (const s of e.sprites) { world.removeChild(s); s.destroy() }
        liveByChunk.delete(key)
      }

      // ---- chunk bake + cache ----
      const chunks = new Map<string, Sprite>()
      const bakeChunk = (cx: number, cy: number): Sprite | null => {
        const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = Math.min(x0 + CHUNK, grid.cols), y1 = Math.min(y0 + CHUNK, grid.rows)
        const cont = new Container(); cont.sortableChildren = true
        for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) stampTile(cont, tx, ty)
        // props baked into the chunk (over terrain) with a soft AO ground-shadow grounding each
        const ps = propsByChunk.get(cx + ',' + cy)
        if (ps) for (const pl of ps) {
          const t = propTex[pl.file]; if (!t) continue
          const L = grid.level[Math.round(pl.ty)]?.[Math.round(pl.tx)] ?? 0
          const px = isoX(pl.tx, pl.ty), py = isoY(pl.tx, pl.ty, L)
          const sc = (pl.tilesTall * 32) / t.height   // resolve target tiles-tall against the real texture
          const sh = new Sprite(shadowTex); sh.anchor.set(0.5); sh.width = Math.max(14, t.width * sc * 0.75); sh.height = sh.width * 0.4; sh.alpha = 0.3; sh.position.set(px, py); sh.zIndex = (pl.tx + pl.ty) * 16 + 999
          cont.addChild(sh)
          const sp = new Sprite(t); sp.anchor.set(0.5, pl.ay); sp.scale.set(sc)
          sp.position.set(px, py); sp.zIndex = (pl.tx + pl.ty) * 16 + 1000
          cont.addChild(sp)
        }
        if (cont.children.length === 0) { cont.destroy(); return null }
        const bnd = cont.getLocalBounds()
        const w = Math.max(1, Math.ceil(bnd.width)), h = Math.max(1, Math.ceil(bnd.height))
        const rt = RenderTexture.create({ width: w, height: h, resolution: 1 })
        instance.renderer.render({ container: cont, target: rt, clear: true, transform: new Matrix().translate(-bnd.minX, -bnd.minY) })
        const spr = new Sprite(rt); spr.position.set(bnd.minX, bnd.minY); spr.zIndex = cx + cy
        cont.destroy({ children: true })
        return spr
      }
      const baseLvl = grid.level[grid.spawn.ty]?.[grid.spawn.tx] ?? 0
      const ensureChunks = (vw: number, vh: number) => {
        // unproject the 4 screen corners to tile space to find visible chunk range
        let minTx = 1e9, minTy = 1e9, maxTx = -1e9, maxTy = -1e9
        for (const [sx, sy] of [[0, 0], [vw, 0], [0, vh], [vw, vh]]) {
          const wx = (sx - world.x) / viewZoom, wy = (sy - world.y) / viewZoom
          const a = wx / HW, b = (wy + baseLvl * LH) / HH
          const tx = (a + b) / 2, ty = (b - a) / 2
          minTx = Math.min(minTx, tx); maxTx = Math.max(maxTx, tx); minTy = Math.min(minTy, ty); maxTy = Math.max(maxTy, ty)
        }
        const M = 3 // tile margin
        const cx0 = Math.floor((minTx - M) / CHUNK), cx1 = Math.floor((maxTx + M) / CHUNK)
        const cy0 = Math.floor((minTy - M) / CHUNK), cy1 = Math.floor((maxTy + M) / CHUNK)
        const want = new Set<string>()
        for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
          if (cx < 0 || cy < 0 || cx * CHUNK >= grid.cols || cy * CHUNK >= grid.rows) continue
          const key = cx + ',' + cy; want.add(key)
          if (!chunks.has(key)) { const s = bakeChunk(cx, cy); if (s) { chunks.set(key, s); world.addChild(s) } else chunks.set(key, null as unknown as Sprite) }
        }
        // evict chunks far outside the view to free GPU memory
        for (const [key, spr] of chunks) {
          if (!want.has(key)) { if (spr) { world.removeChild(spr); spr.texture.destroy(true); spr.destroy() } chunks.delete(key) }
        }
        // live front-treeline trees, culled with the same want-set
        for (const key of want) addLiveChunk(key)
        for (const key of [...liveByChunk.keys()]) if (!want.has(key)) removeLiveChunk(key)
      }

      // ---- Football & Track white markings: a single vector overlay above the baked terrain (rule #5).
      // Props (grandstand/poles/paw boxes) sit on the apron OUTSIDE the oval, so they don't collide with
      // the lane lines; goalposts sit on yard lines (realistic). zIndex 50 = above chunk sprites (~<80),
      // below Thor (~depth*16). Line WIDTHS are stored as relative weights and redrawn at ~constant SCREEN
      // px (width / zoom) whenever the zoom bucket changes, so lanes/yard lines stay legible from the far
      // landmark view to a close walk-up (a fixed world width would vanish when zoomed out). ----
      const markLines = buildStadiumMarkings(grid)
      const markG = new Graphics(); markG.zIndex = 50; world.addChild(markG)
      let markZoomBucket = -1
      const redrawMarks = (zoom: number) => {
        const bucket = Math.round(zoom * 12)
        if (bucket === markZoomBucket) return
        markZoomBucket = bucket
        markG.clear()
        const px = 1.7 / Math.max(0.12, zoom)   // target ~1.7 screen px for a weight-1 line
        for (const ln of markLines) { markG.poly(ln.pts, false); markG.stroke({ color: 0xe8e0d0, width: ln.w * px, alpha: ln.alpha }) }
      }
      redrawMarks(ZOOM)

      // ---- Thor ----
      const thor = new Sprite(idle['south']); thor.anchor.set(0.5, 0.82); thor.scale.set(0.5)
      world.addChild(thor)

      // ---- NPC INTERACTION POINTS = the actual game loop (walk up → E → play that place's grape). First
      // vertical slice: one ATC NPC on the exterior near spawn, wired to the real `atc` grape. More NPCs go
      // at real campus locations as ATC members author grapes; the world stays the same, the slot lights up.
      const NPCS = [{ id: 'atc', label: 'Algorithmic Thinking Club', tx: grid.spawn.tx + 3, ty: grid.spawn.ty + 3 }]
      const npcPins: { g: Graphics; base: number }[] = []
      for (const n of NPCS) {
        const mx = isoX(n.tx, n.ty), my = isoY(n.tx, n.ty, 0), z = (n.tx + n.ty) * 16 + 14
        const pin = new Graphics()
        pin.poly([0, 0, -6, -18, 6, -18]).fill({ color: 0x2f8e82 })   // tail triangle, tip at the ground tile
        pin.circle(0, -25, 9).fill({ color: 0x2f8e82 }).stroke({ color: 0xffffff, width: 2 })
        pin.circle(0, -25, 3.4).fill({ color: 0xffffff })
        pin.position.set(mx, my); pin.zIndex = z; world.addChild(pin); npcPins.push({ g: pin, base: my })
        const lab = new Text({ text: n.label, style: { fill: 0xffffff, fontSize: 13, fontWeight: '700', fontFamily: 'ui-sans-serif, system-ui', stroke: { color: 0x0b1410, width: 4 } } })
        lab.anchor.set(0.5, 1); lab.position.set(mx, my - 42); lab.zIndex = z; world.addChild(lab)
      }
      const pos = atParam.length === 2 && !atParam.some(isNaN) ? { tx: atParam[0], ty: atParam[1] } : { tx: grid.spawn.tx, ty: grid.spawn.ty }
      let facing = 'south', at = 0, lastDepth = -1, renderLevel = grid.level[pos.ty][pos.tx]
      const tileAt = (tx: number, ty: number) => {
        const x = Math.max(0, Math.min(grid.cols - 1, Math.round(tx))), y = Math.max(0, Math.min(grid.rows - 1, Math.round(ty)))
        return { walkable: grid.walkable[y][x], level: grid.level[y][x] }
      }

      // ---- EDIT-mode review tool: draft section boundaries + a free pan/zoom camera ----
      // Draft bounds = per-material tile bbox from the grid (the real explicit bounds get pinned in
      // sections.ts after the geo overlay is approved). One pass over the grid.
      const mbb: Record<string, TileRect> = {}
      const ext = (k: string, tx: number, ty: number) => {
        const a = mbb[k] ?? (mbb[k] = [1e9, 1e9, -1e9, -1e9]); if (tx < a[0]) a[0] = tx; if (ty < a[1]) a[1] = ty; if (tx > a[2]) a[2] = tx; if (ty > a[3]) a[3] = ty
      }
      for (let ty = 0; ty < grid.rows; ty++) for (let tx = 0; tx < grid.cols; tx++) ext(grid.mat[ty][tx], tx, ty)
      const merge = (...ks: string[]): TileRect | null => {
        const bs = ks.map((k) => mbb[k]).filter(Boolean) as TileRect[]; if (!bs.length) return null
        return bs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] as TileRect)
      }
      const draft: Record<string, TileRect | null> = {
        'football-track': merge('turf', 'track'), 'building-core': merge('building'), 'courtyards': merge('patio'),
        'commons-frontage': null, 'north-lot': merge('asphalt'), 'south-lot': null, 'portables': null,
        'tennis': merge('court'), 'diamonds': merge('dirt'), 'grounds-frame': null,
      }
      const editLayer = new Container(); editLayer.visible = false; editLayer.zIndex = 1e7; world.addChild(editLayer)
      SECTIONS.forEach((s, i) => {
        const b = draft[s.id]; if (!b) return
        const col = SECTION_COLORS[i % SECTION_COLORS.length]
        const [x0, y0, x1, y1] = b
        const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([tx, ty]) => [isoX(tx, ty), isoY(tx, ty, 0)])
        const g = new Graphics(); g.poly(corners.flat()).fill({ color: col, alpha: 0.1 }).stroke({ color: col, width: 3, alpha: 0.85 })
        editLayer.addChild(g)
        const lab = new Text({ text: s.label, style: { fill: 0xffffff, fontSize: 15, fontFamily: 'ui-sans-serif, system-ui', fontWeight: '700', stroke: { color: 0x000000, width: 4 } } })
        lab.anchor.set(0.5); lab.position.set((isoX(x0, y0) + isoX(x1, y1)) / 2, (isoY(x0, y0, 0) + isoY(x1, y1, 0)) / 2)
        editLayer.addChild(lab)
      })
      const editCam = { x: 0, y: 0, zoom: ZOOM, init: false }
      let dragging = false, lpx = 0, lpy = 0
      const cv = instance.canvas; cv.style.touchAction = 'none'
      cv.addEventListener('pointerdown', (e) => { if (modeRef.current !== 'edit') return; dragging = true; lpx = e.clientX; lpy = e.clientY })
      cv.addEventListener('pointermove', (e) => { if (!dragging || modeRef.current !== 'edit') return; editCam.x -= (e.clientX - lpx) / editCam.zoom; editCam.y -= (e.clientY - lpy) / editCam.zoom; lpx = e.clientX; lpy = e.clientY })
      cv.addEventListener('pointerup', () => { dragging = false }); cv.addEventListener('pointerleave', () => { dragging = false })
      cv.addEventListener('wheel', (e) => { if (modeRef.current !== 'edit') return; e.preventDefault(); editCam.zoom = Math.max(0.12, Math.min(4, editCam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))) }, { passive: false })

      instance.ticker.add((tk) => {
        const dt = tk.deltaTime
        const editingNow = modeRef.current === 'edit'
        thor.visible = !editingNow; editLayer.visible = editingNow
        let camX: number, camY: number
        if (editingNow) {
          if (!editCam.init) { editCam.x = isoX(pos.tx, pos.ty); editCam.y = isoY(pos.tx, pos.ty, renderLevel); editCam.zoom = ZOOM; editCam.init = true }
          viewZoom = editCam.zoom; camX = editCam.x; camY = editCam.y
        } else {
          editCam.init = false
          let dx = 0, dy = 0
          if (keys['w'] || keys['arrowup']) dy -= 1
          if (keys['s'] || keys['arrowdown']) dy += 1
          if (keys['a'] || keys['arrowleft']) dx -= 1
          if (keys['d'] || keys['arrowright']) dx += 1
          if (pausedRef.current) { dx = 0; dy = 0 }   // a grape is open: freeze Thor
          const moving = dx || dy
          if (moving) {
            const l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, sp = 0.08 * dt
            const ntx = pos.tx + ux * sp, nty = pos.ty + uy * sp
            const curL = tileAt(pos.tx, pos.ty).level, RAD = 0.2, MAXSTEP = 1
            const blocked = (x: number, y: number) => { const t = tileAt(x, y); return !t.walkable || Math.abs(t.level - curL) > MAXSTEP }
            if (!blocked(ntx + Math.sign(ux) * RAD, pos.ty)) pos.tx = ntx
            if (!blocked(pos.tx, nty + Math.sign(uy) * RAD)) pos.ty = nty
            facing = dirFromAngle(isoX(dx, dy), (dx + dy) * HH)
          }
          const targetLevel = tileAt(pos.tx, pos.ty).level
          renderLevel += (targetLevel - renderLevel) * Math.min(1, 0.3 * dt)
          const x = isoX(pos.tx, pos.ty), y = isoY(pos.tx, pos.ty, renderLevel)
          thor.position.set(x, y)
          const depth = Math.floor(pos.tx + pos.ty)
          if (depth !== lastDepth) { thor.zIndex = depth * 16 + 12; lastDepth = depth }
          at += tk.deltaMS
          const wf = walk[facing] ?? walk[cardinalOf(facing)]
          if (moving && wf) thor.texture = wf[Math.floor(at / 110) % wf.length]
          else thor.texture = idle[facing] ?? idle['south']
          viewZoom = ZOOM; camX = x; camY = y
          // nearest NPC the player can interact with (drives the "Press E" prompt + the E handler)
          let nn: NearInfo = null, best = 2.6
          for (const n of NPCS) { const dd = Math.hypot(pos.tx - n.tx, pos.ty - n.ty); if (dd < best) { best = dd; nn = { id: n.id, label: n.label } } }
          if ((nn?.id ?? null) !== (nearNpc?.id ?? null)) { nearNpc = nn; cbRef.current.onState?.({ district: 'Campus Grounds', near: nn }) }
        }
        world.scale.set(viewZoom)
        redrawMarks(viewZoom)
        const vw = instance.renderer.width, vh = instance.renderer.height
        world.x = vw / 2 - camX * viewZoom; world.y = vh / 2 - camY * viewZoom
        ensureChunks(vw, vh); resizeFx(vw, vh)
        // wind sway: gently rock each visible live treeline tree about its base (two sines = natural gust)
        const tnow = performance.now() / 1000
        for (const e of liveByChunk.values()) for (const tr of e.trees) {
          tr.sp.rotation = Math.sin(tnow * 1.05 + tr.phase) * tr.amp + Math.sin(tnow * 0.4 + tr.phase * 1.7) * tr.amp * 0.45
        }
        for (const p of npcPins) p.g.y = p.base + Math.sin(tnow * 3) * 3   // gentle bob on NPC markers
      })

      // ---- atmosphere: WARM but GROUNDED golden-hour light (gold standard = localized warm glow over a
      // rich, deep-shadowed base, NOT a flat yellow flood). The world ColorMatrix already grounds the
      // palette; these overlays add the warm key-light + a deep frame on top, kept gentle so the dark PNW
      // grass and the concrete are never blown out. ----
      // (1) a warm golden-hour ambient wash — a touch stronger + warmer so it reads clearly as warm light
      const warm = new Sprite(Texture.WHITE); warm.tint = 0xffdcab; warm.alpha = 0.11; instance.stage.addChild(warm)
      // (2) a broad golden sun pool from the upper-right (key light) — wide + gentle falloff so it lifts the
      // mid-scene to a warm, inviting glow without ever clipping bright surfaces to white (never blinding)
      const sun = new Sprite(radialTex(512, [[0, 'rgba(255,222,160,0.22)'], [0.5, 'rgba(255,208,144,0.08)'], [1, 'rgba(255,208,144,0)']])); sun.anchor.set(0.5); sun.blendMode = 'add'; instance.stage.addChild(sun)
      // (3) a softer warm vignette — still frames the scene + grounds the edges, but lighter so it feels open
      const vig = new Sprite(radialTex(512, [[0, 'rgba(0,0,0,0)'], [0.52, 'rgba(0,0,0,0)'], [0.86, 'rgba(22,16,10,0.22)'], [1, 'rgba(14,11,8,0.48)']])); instance.stage.addChild(vig)
      const resizeFx = (vw: number, vh: number) => { warm.width = vw; warm.height = vh; sun.width = sun.height = Math.max(vw, vh) * 1.05; sun.position.set(vw * 0.74, vh * 0.18); vig.width = vw * 1.5; vig.height = vh * 1.5; vig.position.set(-vw * 0.25, -vh * 0.25) }
      resizeFx(instance.renderer.width, instance.renderer.height)

      // dev perf/position readout
      const dbg = new Text({ text: '', style: { fill: 0xcfe8c0, fontSize: 13, fontFamily: 'monospace' } })
      dbg.position.set(10, 84); instance.stage.addChild(dbg)
      let frames = 0, fpsT = 0, fps = 0
      instance.ticker.add((tk) => {
        frames++; fpsT += tk.deltaMS
        if (fpsT >= 500) { fps = Math.round(frames / (fpsT / 1000)); frames = 0; fpsT = 0 }
        dbg.text = `${fps} fps  tile ${pos.tx | 0},${pos.ty | 0}  chunks ${chunks.size}  grid ${grid.cols}x${grid.rows}`
      })

      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
      onReadyRef.current?.(); void loadWalk()
    }

    start().catch((err) => {
      console.error('[Campus] failed', err)
      const d = document.createElement('pre'); d.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;color:#ff8a8a;font:12px monospace;white-space:pre-wrap;background:#0009;padding:8px;max-width:90vw'
      d.textContent = 'Campus error: ' + (err?.stack || err); document.body.appendChild(d)
    })
    return () => { destroyed = true; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); if (app) app.destroy(true, { children: true }) }
  }, [])

  const editing = mode === 'edit'
  return (
    <>
      <div ref={ref} style={{ position: 'fixed', inset: 0 }} />
      <button
        onClick={() => setMode((m) => (m === 'view' ? 'edit' : 'view'))}
        style={{
          position: 'fixed', top: 12, right: 12, zIndex: 60, cursor: 'pointer',
          padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)',
          background: editing ? 'rgba(79,209,197,0.92)' : 'rgba(24,26,22,0.82)',
          color: editing ? '#0b1410' : '#e8efe2', font: '600 13px ui-sans-serif, system-ui',
          backdropFilter: 'blur(6px)', boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
        }}
      >{editing ? '▶ Back to game' : '✎ Edit / review map'}</button>

      {editing && (
        <div style={{
          position: 'fixed', top: 56, right: 12, zIndex: 60, width: 268, maxHeight: '78vh', overflowY: 'auto',
          padding: '12px 13px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(18,20,17,0.86)', color: '#e8efe2', font: '13px ui-sans-serif, system-ui',
          backdropFilter: 'blur(8px)', boxShadow: '0 8px 26px rgba(0,0,0,0.45)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Campus sections</div>
          <div style={{ opacity: 0.6, fontSize: 11, marginBottom: 10 }}>read-only review · drag to pan · scroll to zoom</div>
          {SECTIONS.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: i ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, flex: '0 0 auto', background: '#' + SECTION_COLORS[i % SECTION_COLORS.length].toString(16).padStart(6, '0') }} />
              <span style={{ flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 10, opacity: 0.7, padding: '2px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.08)' }}>{s.status}</span>
            </div>
          ))}
          <div style={{ opacity: 0.55, fontSize: 11, marginTop: 10, lineHeight: 1.45 }}>
            Boundaries shown are draft (derived from the current map). Exact tile bounds are pinned after the geo overlay is approved.
          </div>
        </div>
      )}
    </>
  )
}
