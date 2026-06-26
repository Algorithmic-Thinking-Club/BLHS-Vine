// Phase 2 prop placement: deterministic placements of the GOLD-STANDARD hero props (warm-lit, AO-baked)
// onto the campus grid. Lush evergreen treeline on the inner forest edge (the frame); composed walkway
// furniture + courtyard planting where students walk; sparse cars; the entry monument. Scale is given
// as target tiles-tall and resolved against the real texture size at bake time. Deterministic seed.
import { type CampusGrid, type Mat, STADIUM } from './campus-grid'

export type Placement = { file: string; tx: number; ty: number; tilesTall: number; ay: number }

const P = '/art/campus/props/'
const CONIFERS = ['conifer-fir-hero.png', 'conifer-hemlock-hero.png']
const WALKWAY: [string, number][] = [['lamp-hero.png', 2.6], ['bench-hero.png', 1.0], ['trash-bin-hero.png', 0.9], ['tree-shade-hero.png', 3.0]]
const COURTYARD: [string, number][] = [['planter-hero.png', 1.0], ['shrub-round-hero.png', 0.85], ['shrub-flower-hero.png', 0.9], ['tree-ornamental-hero.png', 2.2]]

export function placeProps(grid: CampusGrid): Placement[] {
  const out: Placement[] = []
  let s = 0x51ed
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const { cols, rows, mat } = grid
  const is = (tx: number, ty: number, m: Mat) => tx >= 0 && ty >= 0 && tx < cols && ty < rows && mat[ty][tx] === m
  const add = (file: string, tx: number, ty: number, tilesTall: number) => out.push({ file: P + file, tx, ty, tilesTall, ay: 0.97 })
  const choose = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]

  // lush evergreen treeline: dense overlapping on the inner forest edge (seen), sparse deep interior
  const nearCampus = (tx: number, ty: number) => {
    for (let d = 1; d <= 3; d++) if (!is(tx + d, ty, 'forest') || !is(tx - d, ty, 'forest') || !is(tx, ty + d, 'forest') || !is(tx, ty - d, 'forest')) return true
    return false
  }
  for (let ty = 1; ty < rows - 1; ty++) for (let tx = 1; tx < cols - 1; tx++) {
    if (mat[ty][tx] !== 'forest') continue
    const inner = nearCampus(tx, ty)
    if (rnd() < (inner ? 0.7 : 0.012)) {
      add(choose(CONIFERS), tx + (rnd() - 0.5) * 0.95, ty + (rnd() - 0.5) * 0.95, 3.4)
      if (inner && rnd() < 0.45) add(choose(CONIFERS), tx + (rnd() - 0.5) * 1.2, ty + (rnd() - 0.5) * 1.2, 3.0)
    }
  }
  // composed walkway furniture + courtyard planting on the concrete (sparse, vast-overworld density)
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    if (mat[ty][tx] !== 'concrete') continue
    const r = rnd()
    if (r < 0.01) { const [f, h] = choose(WALKWAY); add(f, tx, ty, h) }
    else if (r < 0.018) { const [f, h] = choose(COURTYARD); add(f, tx, ty, h) }
  }
  // parked cars: BIG enough to read, sparse, in double-rows with drive aisles (not a field of dots)
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    if (mat[ty][tx] !== 'asphalt') continue
    if (ty % 6 < 2 && tx % 4 === 0 && rnd() < 0.72) add('car-hero.png', tx + 0.1, ty, 2.2)
  }
  out.push(...stadiumProps(grid))
  out.push(...courtyardProps())
  return out
}

// ---- FOOTBALL & TRACK (section 1) hero props -------------------------------------------------------
// Placed from the STADIUM math (campus-grid) in the polygon's local (u,v) frame, converted to tiles. The
// grandstand sits on the EAST straight (toward the building) facing west over the field; goalposts at both
// field ends; tall light poles at the four track corners; teal paw sponsor boxes on the apron in front of
// the stands; a dense PNW evergreen treeline wrapping the WEST + NORTH outside the track. Grounded by the
// bake's AO contact shadow. Mirrors blhs-stadium-dusk-cheer-team.jpg. See docs/place-specs/stadium-track.md.
function stadiumProps(grid: CampusGrid): Placement[] {
  const S = STADIUM, out: Placement[] = []
  const ST = '/art/campus/stadium/'
  const { minx, miny, ft } = grid
  // (u,v) local feet -> grid tiles
  const tile = (u: number, v: number): [number, number] => {
    const fx = S.cx + u * S.ux + v * S.vx, fy = S.cy + u * S.uy + v * S.vy
    return [(fx - minx) / ft, (fy - miny) / ft]
  }
  const put = (file: string, u: number, v: number, tilesTall: number, ay = 0.97) => {
    const [tx, ty] = tile(u, v); out.push({ file: ST + file, tx, ty, tilesTall, ay })
  }
  const fieldR = S.HV - S.TRACK_W
  const fieldV = fieldR - 12
  const fieldU = S.straightHalf + Math.sqrt(Math.max(0, fieldR * fieldR - (fieldV + 6) * (fieldV + 6)))
  // GRANDSTAND on the east straight, its concrete base abutting the red track (its front lip overlaps the
  // outermost lane so there is no floating grass gap), facing the field. The covered structure is the focal
  // anchor (rule #7) + the east enclosure (rule #1): big, ~half the field length. ay≈0.95 = ground-contact
  // at the sprite's base.
  put('grandstand.png', 4, -(S.HV - 4), 11.0, 0.95)
  // GOAL POSTS at both field end lines (centered v)
  put('goalpost.png', fieldU - 2, 0, 3.6, 0.92)
  put('goalpost.png', -(fieldU - 2), 0, 3.6, 0.92)
  // LIGHT POLES: four, just outside the track at the curve/corner ends. Proportionally very tall (~55ft)
  // so they tower over the treeline as vertical landmarks (rule #4), like the dusk photo.
  const poleU = S.straightHalf + 26, poleV = S.HV + 4
  put('light-pole.png', poleU, poleV, 10.5, 0.97)
  put('light-pole.png', poleU, -poleV, 10.5, 0.97)
  put('light-pole.png', -poleU, poleV, 10.5, 0.97)
  put('light-pole.png', -poleU, -poleV, 10.5, 0.97)
  // PAW sponsor boxes in a row on the track apron in front of the grandstand (per the dusk photo): just
  // inside the outer lane on the grandstand side.
  for (let i = -2; i <= 2; i++) put('paw-box.png', i * 26, -(S.HV - 6), 1.2, 0.9)
  // DENSE EVERGREEN TREELINE wrapping the WEST + NORTH outside the track as a solid dark wall (rule #1
  // enclosure + the striking dusk backdrop). GRID-DRIVEN so trees can never land on the field/track: walk
  // grass tiles in a band just OUTSIDE the oval, on the west/north arc (away from the east grandstand).
  out.push(...stadiumTreeline(grid))
  return out
}

// dense conifer belt outside the stadium oval on the WEST + NORTH arc (the grandstand is EAST, v<0).
function stadiumTreeline(grid: CampusGrid): Placement[] {
  const S = STADIUM, out: Placement[] = []
  const ST = '/art/campus/stadium/', fir = 'conifer-fir-dark.png'
  const { minx, miny, ft, cols, rows, mat } = grid
  const jit = (n: number, m: number) => { const v = Math.sin(n * 12.9898) * 43758.5453; return (v - Math.floor(v)) * m }
  // tile bbox of the football poly, expanded by a treeline-depth margin
  const MARG = 16
  const tbx0 = Math.max(1, 104 - MARG), tby0 = Math.max(1, 356 - MARG)
  const tbx1 = Math.min(cols - 2, 260 + MARG), tby1 = Math.min(rows - 2, 498 + MARG)
  let placed = 0
  for (let ty = tby0; ty <= tby1; ty++) for (let tx = tbx0; tx <= tbx1; tx++) {
    if (mat[ty][tx] !== 'grass' && mat[ty][tx] !== 'forest') continue
    const fx = minx + (tx + 0.5) * ft, fy = miny + (ty + 0.5) * ft
    const { u, v, r } = S.sdf(fx, fy)
    const band = r - S.HV                       // ft outside the outer oval (>=0 means outside)
    if (band < 2 || band > 46) continue          // a ~44ft-deep belt hugging the track
    // skip the EAST straight (the grandstand side, v very negative on the straight); keep west + both ends
    const onEastStraight = v < -(S.HV * 0.55) && Math.abs(u) < S.straightHalf + 10
    if (onEastStraight) continue
    // density: dense near the track, thinning outward; deterministic dithering by tile
    const dens = band < 26 ? 0.72 : 0.4
    if (jit(tx * 131 + ty * 17, 1) > dens) continue
    put_tree(out, ST + fir, tx + jit(tx + ty, 0.9) - 0.45, ty + jit(tx * 3 + ty, 0.9) - 0.45, 3.5 + jit(tx + ty * 7, 0.9))
    placed++
  }
  void placed
  return out
}
function put_tree(out: Placement[], file: string, tx: number, ty: number, tilesTall: number) {
  out.push({ file, tx, ty, tilesTall, ay: 0.95 })
}

// hand-composed real BLHS courtyard (asset kit in public/art/campus/courtyard/) on the survey footprint.
// Density + clustering follow the gold standard: a planting strip hugging the foot of the raised building
// wall, a north berm held by a retaining wall above the stair run, a center monument ringed by benches,
// corner lamps, perimeter beds with maples/shrubs, and the black metal gate across the south. The patio
// bounds + the raised facade wall + berm + stairs are set in campus-grid.ts. Matches the BLHS courtyard photo.
function courtyardProps(): Placement[] {
  return []  // DISABLED 2026-06-25: the hardcoded courtyard was removed from the grid (rendering cleanup).
  // The body below is retained for reference; the courtyard gets built for real, section by section, from
  // the verified geometry rather than hardcoded at fixed tile numbers.
  // eslint-disable-next-line no-unreachable
  const C = '/art/campus/courtyard/'
  const out: Placement[] = []
  const p = (file: string, tx: number, ty: number, tilesTall: number, ay = 0.97) => out.push({ file: C + file, tx, ty, tilesTall, ay })
  const CX0 = 556, CY0 = 506, CX1 = 575, CY1 = 524, midX = 566, midY = 515

  // north berm retaining wall (holds the raised berm over the patio), with a gap for the stair run
  for (let tx = CX0; tx <= CX1; tx++) if (tx < 562 || tx > 567) p('retaining-wall-c1.png', tx, CY0 - 0.15, 1.2)
  p('stairs-handrail-c1.png', 562.3, CY0 + 0.6, 2.3); p('railing-pipe-c1.png', 566.7, CY0 + 0.6, 1.9)
  // berm-top planting (maples + shrubs on the raised grass above)
  p('maple-autumn-c1.png', CX0 + 3, CY0 - 2, 3.5); p('maple-green-c1.png', CX1 - 3, CY0 - 2, 3.3)
  for (let tx = CX0 + 1; tx <= CX1 - 1; tx += 3) p('shrub-spread-c2.png', tx, CY0 - 1.5, 0.9)

  // west planting strip hugging the foot of the building wall (mulch + alternating shrubs + maples)
  for (let ty = CY0 + 1; ty <= CY1 - 1; ty++) {
    p('mulch-bed-hero.png', 554, ty, 0.95)
    if (ty % 4 === 0) p('maple-green-c1.png', 554, ty, 3.3)
    else if (ty % 2 === 0) p('shrub-boxwood-c1.png', 554.2, ty, 1.05)
    else p('shrub-spread-c2.png', 554.2, ty, 0.95)
  }
  p('grass-ornamental-c1.png', 554, CY0 + 3, 1.1); p('shrub-flower-c3.png', 554, CY1 - 4, 1.0)
  p('maple-autumn-c1.png', 554, CY1 - 2, 3.3)

  // east border planting strip + an anchor maple
  for (let ty = CY0 + 2; ty <= CY1 - 2; ty += 2) { p('mulch-bed-hero.png', CX1 - 0.4, ty, 0.9); p('shrub-boxwood-c1.png', CX1 - 0.5, ty, 1.0) }
  p('maple-green-c1.png', CX1 - 0.4, midY, 3.1)

  // center: monument on the brick cross-band crossing, ringed by benches facing in; corner lamps
  p('monument-hero.png', midX, midY, 2.3)
  p('bench-hero.png', midX - 2.2, midY, 1.4); p('bench-hero.png', midX + 2.2, midY, 1.4)
  p('bench-hero.png', midX, midY - 2.2, 1.4); p('bench-hero.png', midX, midY + 2.2, 1.4)
  p('lamp-hero.png', midX - 4, midY - 4, 3.1); p('lamp-hero.png', midX + 4, midY - 4, 3.1)
  p('lamp-hero.png', midX - 4, midY + 4, 3.1); p('lamp-hero.png', midX + 4, midY + 4, 3.1)
  p('trash-bin-hero.png', midX + 5, midY + 5, 1.0); p('trash-bin-hero.png', midX - 5, midY - 5, 1.0)
  p('shrub-flower-c3.png', midX - 3, midY - 3, 0.95); p('shrub-flower-c3.png', midX + 3, midY + 3, 0.95)

  // south fence + the black metal courtyard gate (centered opening) across the bottom edge
  for (let tx = CX0; tx <= CX1; tx++) { if (tx >= midX - 1 && tx <= midX + 1) continue; p('fence-round-c2.png', tx, CY1 + 0.4, 1.4) }
  p('fence-gate-run-c1.png', midX, CY1 + 0.4, 1.7)
  return out
}
