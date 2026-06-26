// TEST zone (fundamentals only — not the real campus). DISCRETE elevation levels rendered as stacked
// pixel-art BLOCK tiles, one per material. Goal: prove the engine is MATERIAL-AGNOSTIC — concrete
// stairs up to a concrete platform, a grass hill, and brick/asphalt/sidewalk patches all coexist and
// mesh, any material against any neighbour at any height step.

export type Mat = 'grass' | 'plaza' | 'turf' | 'path' | 'stairs' | 'forest' | 'water' | 'sand'
  | 'brick' | 'asphalt' | 'sidewalk'

export type Prop = {
  kind: 'evergreen' | 'deciduous' | 'bench' | 'lamp' | 'hedge' | 'flowers' | 'monument'
    | 'tuft' | 'rock' | 'fern' | 'wildflower' | 'log' | 'pine' | 'bush' | 'reeds'
  tx: number; ty: number
}

export const N = 48
export const MAXSTEP = 1 // levels Thor can climb in one stride (a curb/stair). Bigger gaps = cliffs.
export const CLIFF = 2   // a natural drop of this many levels renders with a rock (not dirt) face

export type Zone = {
  N: number
  level: number[][]
  mat: Mat[][]
  walkable: boolean[][]
  props: Prop[]
  spawn: { tx: number; ty: number }
}

function grid<T>(v: T): T[][] { return Array.from({ length: N }, () => Array.from({ length: N }, () => v)) }

export function buildZone(): Zone {
  const level = grid(0)
  const mat: Mat[][] = grid<Mat>('grass')
  const walkable = grid(true)

  const setRect = (x0: number, y0: number, x1: number, y1: number, lv: number, m: Mat, walk = true) => {
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (ty < 0 || ty >= N || tx < 0 || tx >= N) continue
      level[ty][tx] = lv; mat[ty][tx] = m; walkable[ty][tx] = walk
    }
  }

  // flat cobblestone COMMONS across the south (level 0). Thor spawns here.
  setRect(5, 22, 42, 42, 0, 'plaza')

  // ---- the BLHS pattern: a raised CONCRETE PLATFORM with CONCRETE STAIRS up to it ----
  setRect(19, 7, 30, 18, 2, 'plaza')           // smooth concrete platform, 2 levels up
  for (const tx of [23, 24, 25]) {             // a 2-step concrete staircase down its south face
    mat[18][tx] = 'stairs'                       // top step (stays level 2, reads as a stair riser)
    level[19][tx] = 1; mat[19][tx] = 'stairs'; walkable[19][tx] = true
    level[20][tx] = 0; mat[20][tx] = 'stairs'; walkable[20][tx] = true
  }

  // ---- a natural GRASS HILL right beside the platform, sharing the level-2 plateau (two materials
  // meshing on one raised surface; its open south/west edges drop as a rock cliff) ----
  setRect(7, 7, 18, 18, 2, 'grass')
  for (const tx of [10, 11, 12]) { level[19][tx] = 1; mat[19][tx] = 'grass'; walkable[19][tx] = true } // a grass step

  // ---- mixed-material patches on the east commons (raised 1 level), separated by a sidewalk curb ----
  setRect(33, 22, 34, 42, 1, 'sidewalk')       // raised sidewalk strip
  setRect(35, 24, 41, 31, 1, 'brick')          // brick patio
  setRect(35, 34, 41, 41, 1, 'asphalt')        // asphalt pad

  // pond on the west commons, flush at ground level (water + a sand shore, both level 0)
  const pondCx = 11, pondCy = 31, pondR = 3.6
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const dd = Math.hypot(tx - pondCx, ty - pondCy)
    if (dd < pondR) { level[ty][tx] = 0; mat[ty][tx] = 'water'; walkable[ty][tx] = false }
    else if (dd < pondR + 1.4 && mat[ty][tx] === 'grass') { level[ty][tx] = 0; mat[ty][tx] = 'sand' }
  }

  // a low unwalkable forested rim (level 1) so the world edge is trees rising, never a drop-off
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const d = Math.max(Math.abs(tx - N / 2), Math.abs(ty - N / 2))
    if (d > 20) { level[ty][tx] = Math.max(level[ty][tx], 1); mat[ty][tx] = 'forest'; walkable[ty][tx] = false }
  }

  const props: Prop[] = []
  for (const tx of [16, 21, 28]) props.push({ kind: 'lamp', tx, ty: 23 })
  props.push({ kind: 'bench', tx: 18, ty: 25 }, { kind: 'monument', tx: 24, ty: 39 })
  props.push({ kind: 'flowers', tx: 37, ty: 27 }, { kind: 'flowers', tx: 38, ty: 29 })
  // trees on the grass hill top
  props.push({ kind: 'deciduous', tx: 11, ty: 10 }, { kind: 'evergreen', tx: 15, ty: 9 }, { kind: 'pine', tx: 9, ty: 14 })
  // pond planting
  props.push({ kind: 'reeds', tx: 8, ty: 29 }, { kind: 'rock', tx: 8, ty: 33 }, { kind: 'bush', tx: 14, ty: 30 })

  // deterministic natural scatter on forest rim + grass hill
  let seed = 11
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const m = mat[ty][tx]
    if (m === 'forest') {
      const r = rnd()
      if (r < 0.22) props.push({ kind: 'evergreen', tx: tx + rnd() * 0.6 - 0.3, ty: ty + rnd() * 0.6 - 0.3 })
      else if (r < 0.38) props.push({ kind: 'pine', tx: tx + rnd() * 0.6 - 0.3, ty: ty + rnd() * 0.6 - 0.3 })
      else if (r < 0.46) props.push({ kind: 'bush', tx: tx + rnd() - 0.5, ty: ty + rnd() - 0.5 })
    } else if (m === 'grass' && level[ty][tx] >= 2) {
      const r = rnd()
      if (r < 0.05) props.push({ kind: 'tuft', tx: tx + rnd() - 0.5, ty: ty + rnd() - 0.5 })
      else if (r < 0.075) props.push({ kind: 'wildflower', tx: tx + rnd() - 0.5, ty: ty + rnd() - 0.5 })
    }
  }

  return { N, level, mat, walkable, props, spawn: { tx: 24, ty: 20 } }
}

// nearest-tile lookup (no bilinear — discrete levels mean a character stands at exactly one level and
// can never sink into a cliff face)
export function tileAt(z: Zone, tx: number, ty: number) {
  const x = Math.max(0, Math.min(N - 1, Math.round(tx))), y = Math.max(0, Math.min(N - 1, Math.round(ty)))
  return { mat: z.mat[y][x], walkable: z.walkable[y][x], level: z.level[y][x] }
}
export function levelAt(z: Zone, tx: number, ty: number): number { return tileAt(z, tx, ty).level }
