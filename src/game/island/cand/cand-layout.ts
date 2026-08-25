// CAND-ISLAND P1 — the spec rasterized to authored grids + the STRUCT registry
// (cand-spec.json engineNeeds #6). This module is the ONE truth the renderer, the
// walker and the G-AUDIT flood-fill all read: SLV (levels), SWALK (walkability),
// SMAT (family), STRUCT (per-tile px lifts for built structures + ramps), SDS
// (signed coast distance for the ocean). Paint order = spec array order — later
// entries overwrite earlier ones, exactly like laying paint.
//
// Coordinates here are SPEC coords (120x96, origin NW, +y south). The renderer
// offsets by CAND_OX/CAND_OY into its 200x200 engine map.

// THE TRUTH LAYOUT (2026-07-25 night fleet): 46 crop-reads, cross-view fusion,
// machine height-map arbitration. cand-spec.json's geometry was the contaminated
// hand-authored layout; only its format conventions survive here.
import specJson from './cand-layout-truth.json'

type TileLevel = {
  name: string
  level: number
  poly: number[][]
  material: string
  family: string
  walkable: boolean
  liftPx?: number
  walkLiftPx?: number
  visualTopLiftPx?: number
  edgeBlock?: string[]
  crownPx?: number
  construct?: string
  note?: string
}
type Ramp = {
  name: string
  from: string
  to: string
  poly: number[][]
  descends?: string
  dropPx?: number[]
  confidence?: number
  note?: string
}
const SPEC = specJson as unknown as {
  grid: { w: number; h: number }
  tileLevels: TileLevel[]
  ramps: Ramp[]
}

export const SPEC_W = SPEC.grid.w // 120
export const SPEC_H = SPEC.grid.h // 96

// the engine's lift law at its defaults (STEP 20 / CSTEP 10 / PLAT_L 3) — the walk
// and the audit must agree with the renderer about what a level is worth in px
export const specLiftOf = (l: number) =>
  l <= 0 ? 0 : Math.min(l, 3) * 20 + Math.max(0, l - 3) * 10

export type Struct = {
  lift: number // the tile's DRAWN top (px above the waterline)
  walkLift?: number // where the walker stands when it differs (the maw's bridge tiles)
  walk: boolean
  mat: string
  edgeBlock?: string[] // sub-tile parapets: sides a walker may not cross (R9)
  trigger?: string // scene hand-offs (the maw's innermost row)
}

export const SLV = new Int8Array(SPEC_W * SPEC_H).fill(-1) // -1 = engine ocean
export const SWALK = new Uint8Array(SPEC_W * SPEC_H)
export const SMAT = new Uint8Array(SPEC_W * SPEC_H)
export const FAMILIES: string[] = []
export const STRUCT = new Map<number, Struct>()

const famIdx = (f: string) => {
  let i = FAMILIES.indexOf(f)
  if (i < 0) {
    i = FAMILIES.length
    FAMILIES.push(f)
  }
  return i
}

// even-odd raycast at tile centers — a rect [[6,40],[34,40],[34,72],[6,72]]
// paints tiles x 6..33, y 40..71 (half-open by construction)
const pip = (px: number, py: number, poly: number[][]) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const rasterize = (poly: number[][]): number[] => {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1])
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(SPEC_W - 1, Math.ceil(Math.max(...xs)))
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(SPEC_H - 1, Math.ceil(Math.max(...ys)))
  const out: number[] = []
  for (let sy = y0; sy <= y1; sy++)
    for (let sx = x0; sx <= x1; sx++)
      if (pip(sx + 0.5, sy + 0.5, poly)) out.push(sy * SPEC_W + sx)
  return out
}

// every region's painted tiles by name (tileLevels AND ramps) — the audit's chain
// representatives read this; overwritten tiles simply stop mattering
const regionTiles = new Map<string, number[]>()

// ---- PAINT PASS 1: tileLevels in array order ----
for (const tl of SPEC.tileLevels) {
  const water = tl.family === 'engine-ocean'
  const fi = famIdx(tl.family)
  const tiles = rasterize(tl.poly)
  regionTiles.set(tl.name, tiles)
  const parapet = tl.construct === 'parapet-edge'
  for (const k of tiles) {
    if (parapet) {
      // R9: a parapet is a SUB-TILE construct on a walkable lip — it annotates the
      // existing structure (edgeBlock + material), it never repaints the lip's lift
      SMAT[k] = fi
      const st = STRUCT.get(k)
      if (st && tl.edgeBlock) st.edgeBlock = [...new Set([...(st.edgeBlock ?? []), ...tl.edgeBlock])]
      continue
    }
    SLV[k] = water ? -1 : tl.level
    SWALK[k] = !water && tl.walkable ? 1 : 0
    SMAT[k] = fi
    if (tl.liftPx !== undefined) {
      STRUCT.set(k, {
        lift: tl.visualTopLiftPx ?? tl.liftPx,
        walkLift: tl.walkLiftPx,
        walk: !!tl.walkable,
        mat: tl.family,
        // the arch-tunnel's innermost (northmost, y52) row fires the Maw hand-off
        trigger: tl.name === 'arch-tunnel' && ((k / SPEC_W) | 0) === 52 ? 'maw' : undefined,
      })
    } else {
      // plain terrain painted LATER clears an older structure on the same tile
      // (paint semantics — e.g. east-shore reclaims the apron overlap, R10)
      STRUCT.delete(k)
    }
  }
}

// ---- PAINT PASS 2: ramps — lerped px lifts along the descend axis ----
const regionLift = (name: string): number => {
  const tl = SPEC.tileLevels.find((t) => t.name === name)
  if (!tl) return 0
  return tl.walkLiftPx ?? tl.liftPx ?? specLiftOf(tl.level)
}
const centroid = (name: string): [number, number] => {
  const tiles = regionTiles.get(name) ?? []
  if (!tiles.length) return [0, 0]
  let sx = 0, sy = 0
  for (const k of tiles) {
    sx += k % SPEC_W
    sy += (k / SPEC_W) | 0
  }
  return [sx / tiles.length, sy / tiles.length]
}
for (const rp of SPEC.ramps) {
  const tiles = rasterize(rp.poly)
  regionTiles.set(rp.name, tiles)
  const fromL = rp.dropPx ? rp.dropPx[0] : regionLift(rp.from)
  const toL = rp.dropPx ? rp.dropPx[1] : regionLift(rp.to)
  // axis + direction: authored 'descends', else the from->to centroid vector
  let axis: 'x' | 'y', sign: 1 | -1
  if (rp.descends === 'E') { axis = 'x'; sign = 1 }
  else if (rp.descends === 'W') { axis = 'x'; sign = -1 }
  else if (rp.descends === 'S') { axis = 'y'; sign = 1 }
  else if (rp.descends === 'N') { axis = 'y'; sign = -1 }
  else {
    const cF = centroid(rp.from), cT = centroid(rp.to)
    const dx = cT[0] - cF[0], dy = cT[1] - cF[1]
    axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
    sign = (axis === 'x' ? dx : dy) >= 0 ? 1 : -1
  }
  const ps = tiles.map((k) => (axis === 'x' ? k % SPEC_W : (k / SPEC_W) | 0))
  if (!ps.length) continue
  const p0 = Math.min(...ps), p1 = Math.max(...ps)
  const n = p1 - p0 + 1
  for (const k of tiles) {
    if (SLV[k] < 0) continue // a ramp never paints water
    const p = axis === 'x' ? k % SPEC_W : (k / SPEC_W) | 0
    // even treads INCLUDING the two end joins: step = drop / (n+1), so the first
    // tile sits one tread below 'from' and the last one tread above 'to'
    const t = ((sign > 0 ? p - p0 : p1 - p) + 1) / (n + 1)
    const lift = Math.round(fromL + (toL - fromL) * t)
    SWALK[k] = 1
    const prior = STRUCT.get(k)
    // flat connectors (from == to) declare connectivity only — they never clobber
    // an authored structure (the tunnel-approach crosses the maw's bridge tiles)
    if (prior && fromL === toL) continue
    STRUCT.set(k, { lift, walk: true, mat: FAMILIES[SMAT[k]] ?? 'quay-stone' })
  }
}

// ---- PAINT PASS 3: STAIR HEADS OPEN THE PARAPET. The spec's parapet-south runs
// the full terrace lip, but the grand stair's top flight lands flush against it —
// a stair head IS the opening (the balustrade rides the flight, the crown breaks
// there). Generic rule: any blocked edge whose far side is a ramp tile landing
// within the 12px step law loses its block. Without this the whole upper island
// (terrace -> mid-bench -> jungle-shelf) audits as orphaned, which cand-1 refutes.
{
  const rampTiles = new Set<number>()
  for (const rp of SPEC.ramps) for (const k of regionTiles.get(rp.name) ?? []) rampTiles.add(k)
  const wl = (k: number) => {
    const st = STRUCT.get(k)
    if (st) return st.walkLift ?? st.lift
    return specLiftOf(Math.max(0, SLV[k]))
  }
  for (const [k, st] of STRUCT) {
    if (!st.edgeBlock?.length) continue
    const x = k % SPEC_W, y = (k / SPEC_W) | 0
    st.edgeBlock = st.edgeBlock.filter((d) => {
      const ox = d === 'E' ? 1 : d === 'W' ? -1 : 0
      const oy = d === 'S' ? 1 : d === 'N' ? -1 : 0
      const nx = x + ox, ny = y + oy
      if (nx < 0 || ny < 0 || nx >= SPEC_W || ny >= SPEC_H) return true
      const nk = ny * SPEC_W + nx
      if (!rampTiles.has(nk) || !SWALK[nk]) return true
      return Math.abs(wl(nk) - wl(k)) > 12
    })
    if (!st.edgeBlock.length) delete st.edgeBlock
  }
}

// ---- SDS: signed coast distance over the spec grid (+ inland, - at sea), the
// renderer's coastDs replacement. Two-pass 1/1.4 chamfer both ways.
export const SDS = new Float32Array(SPEC_W * SPEC_H)
{
  const chamfer = (isSrc: (k: number) => boolean) => {
    const W = SPEC_W, H = SPEC_H
    const D = new Float32Array(W * H).fill(1e9)
    for (let k = 0; k < D.length; k++) if (isSrc(k)) D[k] = 0
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x
        if (x > 0 && D[k - 1] + 1 < D[k]) D[k] = D[k - 1] + 1
        if (y > 0 && D[k - W] + 1 < D[k]) D[k] = D[k - W] + 1
        if (x > 0 && y > 0 && D[k - W - 1] + 1.4 < D[k]) D[k] = D[k - W - 1] + 1.4
        if (x < W - 1 && y > 0 && D[k - W + 1] + 1.4 < D[k]) D[k] = D[k - W + 1] + 1.4
      }
    for (let y = H - 1; y >= 0; y--)
      for (let x = W - 1; x >= 0; x--) {
        const k = y * W + x
        if (x < W - 1 && D[k + 1] + 1 < D[k]) D[k] = D[k + 1] + 1
        if (y < H - 1 && D[k + W] + 1 < D[k]) D[k] = D[k + W] + 1
        if (x < W - 1 && y < H - 1 && D[k + W + 1] + 1.4 < D[k]) D[k] = D[k + W + 1] + 1.4
        if (x > 0 && y < H - 1 && D[k + W - 1] + 1.4 < D[k]) D[k] = D[k + W - 1] + 1.4
      }
    return D
  }
  const dLand = chamfer((k) => SLV[k] >= 0)
  const dWater = chamfer((k) => SLV[k] < 0)
  for (let k = 0; k < SDS.length; k++) SDS[k] = SLV[k] >= 0 ? dWater[k] : -dLand[k]
}

// ---- G-AUDIT: flood-fill the walkables (4-neigh, 12px step law, parapet edge
// blocks honored) from the spawn quay and prove both spec chains as data.
export type AuditReport = {
  reachableCount: number
  chainA: boolean
  chainB: boolean
  orphanCount: number
}

const walkLiftAt = (k: number): number => {
  const st = STRUCT.get(k)
  if (st) return st.walkLift ?? st.lift
  return specLiftOf(Math.max(0, SLV[k]))
}

let auditCache: AuditReport | null = null
export function auditSpec(): AuditReport {
  if (auditCache) return auditCache
  const W = SPEC_W, H = SPEC_H
  const seen = new Uint8Array(W * H)
  const q: number[] = []
  const seed = 62 * W + 56 // spec (56,62) — the stair landing by the quay (Thor's spawn)
  if (SWALK[seed] && SLV[seed] >= 0) {
    seen[seed] = 1
    q.push(seed)
  }
  const OPP: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E' }
  const DIRS: [number, number, string][] = [[1, 0, 'E'], [-1, 0, 'W'], [0, 1, 'S'], [0, -1, 'N']]
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % W, y = (k / W) | 0
    for (const [ox, oy, d] of DIRS) {
      const nx = x + ox, ny = y + oy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const nk = ny * W + nx
      if (seen[nk] || !SWALK[nk] || SLV[nk] < 0) continue
      if (Math.abs(walkLiftAt(nk) - walkLiftAt(k)) > 12) continue // the step law
      const eb = STRUCT.get(k)?.edgeBlock, ebN = STRUCT.get(nk)?.edgeBlock
      if (eb?.includes(d) || ebN?.includes(OPP[d])) continue // parapet lips (R9)
      seen[nk] = 1
      q.push(nk)
    }
  }
  let reachableCount = 0, walkTotal = 0
  for (let k = 0; k < W * H; k++) {
    if (SWALK[k] && SLV[k] >= 0) {
      walkTotal++
      if (seen[k]) reachableCount++
    }
  }
  const hit = (name: string, filter?: (k: number) => boolean) =>
    (regionTiles.get(name) ?? []).some((k) => seen[k] && (!filter || filter(k)))
  // the truth layout's G-AUDIT chains: cove -> corridor -> jungle -> plaza ->
  // grand stair -> quay -> promenades -> tunnel, and quay -> apron ->
  // breakwater -> drum (the lighthouse socket)
  const chainA =
    hit('cove-sand') && hit('town-plaza') && hit('quay-lower') &&
    hit('middle-promenade') && hit('upper-promenade') &&
    hit('arch-tunnel', (k) => ((k / W) | 0) === 52)
  const chainB =
    hit('quay-lower') && hit('ne-quay-apron') &&
    hit('breakwater-walk') && hit('breakwater-curl') && hit('mole-drum')
  // orphanCount includes the volcano-rim walkables — deliberately unreachable per
  // spec ("no trail evidenced in cand-1"), so a nonzero count alone is not a fail
  auditCache = { reachableCount, chainA, chainB, orphanCount: walkTotal - reachableCount }
  return auditCache
}
