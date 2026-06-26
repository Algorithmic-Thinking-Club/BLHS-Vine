// Bonney Lake High School, traced from reference/floorplans-maps/aerial-esri.png at
// ~10 px per cell (see reference/.../aerial-grid.png). Authored in PLAN coordinates
// (x = east, y = south); the iso renderer projects to a 3/4 view. Proportions follow the
// real campus: the building mass is a SMALL connected cluster, dwarfed by the stadium,
// parking, fields, and forest around it.

export const COLS = 80 // x, west(0) -> east
export const ROWS = 54 // y, north(0) -> south

export interface Building {
  x: number
  y: number
  w: number // footprint extent east (also sets visual width/depth)
  d: number // footprint extent south
  sprite: string // key into the building-sprite set
  label: string
  scale?: number // override auto scale
  anchorY?: number // override base anchor (0-1 of sprite height)
  grapeId?: string
}

// One connected complex (gym + commons core + wings), plus PAC just north. Each renders as ONE
// detailed isometric sprite, sized to its footprint. Positions traced from the aerial.
export const CAMPUS: Building[] = [
  { x: 26, y: 20, w: 6, d: 8, sprite: 'gym', label: 'Gym' },
  { x: 32, y: 19, w: 8, d: 8, sprite: 'commons', label: 'Commons' },
  { x: 33, y: 13, w: 8, d: 6, sprite: 'wing', label: '300 Wing' },
  { x: 42, y: 18, w: 8, d: 7, sprite: 'wing', label: 'STEM / ATC', grapeId: 'atc' },
  { x: 31, y: 27, w: 12, d: 4, sprite: 'wing', label: '500 Wing' },
  { x: 44, y: 9, w: 8, d: 6, sprite: 'pac', label: 'PAC' },
  { x: 34, y: 31, w: 8, d: 4, sprite: 'welcome', label: 'Welcome Center' },
]

export const CAMPUS_SPAWN = { x: 38, y: 38 }

export interface Prop { x: number; y: number; tile: string }

type Ground = 'grass' | 'concrete' | 'asphalt' | 'parking' | 'turf' | 'track' | 'dirt' | 'court'

// --- geometry helpers ---
function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (x - cx) / rx
  const dy = (y - cy) / ry
  return dx * dx + dy * dy // <=1 inside
}
function diamond(x: number, y: number, cx: number, cy: number, r: number): number {
  return Math.abs(x - cx) + Math.abs(y - cy) - r // <=0 inside
}

interface Rect { x: number; y: number; w: number; h: number; g: Ground }
const GROUND_RECTS: Rect[] = [
  { x: 28, y: 2, w: 24, h: 10, g: 'parking' }, // north parking (incl. bus loop)
  { x: 33, y: 31, w: 22, h: 13, g: 'parking' }, // south / SE angled parking
  { x: 40, y: 40, w: 11, h: 6, g: 'court' }, // tennis courts
  { x: 26, y: 35, w: 18, h: 2, g: 'concrete' }, // front drop-off walk
  { x: 37, y: 35, w: 2, h: 6, g: 'concrete' }, // entry walk to south lot
  { x: 24, y: 18, w: 2, h: 12, g: 'concrete' }, // walk between stadium and building
]

// Stadium ellipse (west) and the two ball diamonds (E of building, and SE).
const STAD = { cx: 15, cy: 22, rx: 12, ry: 9, irx: 8.5, iry: 5 }
const BALL_E = { cx: 57, cy: 18, r: 7 }
const BALL_SE = { cx: 66, cy: 46, r: 8 }

export function groundAt(x: number, y: number): Ground {
  // stadium: turf infield inside, red track in the ring
  const so = ellipse(x, y, STAD.cx, STAD.cy, STAD.rx, STAD.ry)
  if (so <= 1) {
    const si = ellipse(x, y, STAD.cx, STAD.cy, STAD.irx, STAD.iry)
    return si <= 1 ? 'turf' : 'track'
  }
  // ball fields: turf circle with a dirt infield diamond
  for (const b of [BALL_E, BALL_SE]) {
    if (ellipse(x, y, b.cx, b.cy, b.r, b.r) <= 1) {
      return diamond(x, y, b.cx, b.cy, b.r * 0.62) <= 0 ? 'dirt' : 'turf'
    }
  }
  for (const r of GROUND_RECTS) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.g
  }
  return 'grass'
}

function inBuilding(x: number, y: number): boolean {
  for (const b of CAMPUS) {
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.d) return true
  }
  return false
}

// deterministic hash -> [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

// Organic forest: dense tree masses on the campus margins (west slope, south, east edge),
// thinning into scattered singles across open grass. Detailed tree sprites read fuller, so
// the density is deliberately sparse. Cars fill the lots in rows.
function buildProps(): Prop[] {
  const props: Prop[] = []
  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      const g = groundAt(x, y)
      if (inBuilding(x, y)) continue
      if (g === 'grass') {
        const edgeDist = Math.min(x, COLS - 1 - x, y, ROWS - 1 - y)
        const inForest =
          x < 7 || x > COLS - 7 || y > ROWS - 8 || (y < 9 && (x < 24 || x > 56)) || edgeDist < 2
        const h = hash(x, y)
        if (inForest ? h > 0.5 : h > 0.95) {
          props.push({ x, y, tile: hash(y, x) > 0.78 ? 'deciduous' : 'evergreen' })
        }
      } else if (g === 'parking' && x % 2 === 0 && y % 2 === 1 && hash(x, y) > 0.35) {
        props.push({ x, y, tile: 'car' })
      }
    }
  }
  for (let y = 18; y <= 26; y += 2) props.push({ x: 26, y, tile: 'grandstand' })
  return props
}

export const PROPS: Prop[] = buildProps()
// trees + grandstand block movement; cars do not
const PROP_SET = new Set(PROPS.filter((p) => p.tile !== 'car').map((p) => `${p.x},${p.y}`))

export function blockedAt(x: number, y: number): boolean {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true
  if (inBuilding(x, y)) return true
  if (PROP_SET.has(`${x},${y}`)) return true
  return false
}
