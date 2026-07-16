// THE PANTHER'S MAW — MASTER LAYOUT AS DATA (Session C's lane, 2026-07-16).
// The cave interior's single geometric truth: every shape here is an AUTHORED
// DECISION with a written reason (island-endgame-method law #1 — no formulas
// masquerading as design). Spec: docs/place-specs/panther-cave-interior.md.
// P0 pick (Ash 2026-07-16): "like C but a lot grander" → grand cathedral bones
// + the living-lava spectacle (fall → trench → carved bridge) + restrained
// panther identity. Canonical target: cave-concepts/P0-PICK.png.
//
// COMPASS CONTINUITY: Thor enters at the map's SE (the exterior gate sits on
// the volcano's SE flank), arrives HIGH on the threshold shelf, and the whole
// room reveals itself downstage to the NW — the classic interior reveal.
//
// LEVELS: -1 rock (the mountain's mass, unwalkable, fills the frame),
// -2 molten trench (blocked, drawn as living lava), 0 the great hall floor,
// 1 the Principal's dais, 2..3 stair treads, 3 the threshold shelf.

export const GRID = 72

// ---- tiny deterministic value noise (local on purpose: this module must stay
// pure data — importing the renderer's noise would drag pixi into mechanics)
const h2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
export const cnoise = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  return (
    h2(xi, yi) * (1 - u) * (1 - v) + h2(xi + 1, yi) * u * (1 - v) +
    h2(xi, yi + 1) * (1 - u) * v + h2(xi + 1, yi + 1) * u * v
  )
}
// organic rim wobble so the cavern edge reads as geology, never a drawn ellipse
const wob = (tx: number, ty: number) => (cnoise(tx / 5.5 + 11, ty / 5.5 + 7) - 0.5) * 1.7

// ---- THE FLOOR SHAPES (each with its reason) ----
// THE GREAT HALL: one grand cavern chambered by geology (spec §1, pre-approved).
// Grand per the P0 verdict — the hall alone is ~30x24 walkable.
export const HALL = { x: 34, y: 34, rx: 15.5, ry: 12.5 }
// THE THRESHOLD SHELF (C1): the arrival stage, 3 levels up — you step out of
// the mouth-light and the room drops away in front of you.
export const SHELF = { x: 48, y: 46, rx: 5, ry: 4 }
// THE GRAND STAIR: the reveal's descent, wide enough to feel ceremonial.
export const STAIR = { x0: 46, y0: 44, x1: 39, y1: 39, halfW: 2.1 }
// THE PRINCIPAL'S DAIS (C4): authority reads as elevation, +1 at the back wall.
export const DAIS = { x: 30, y: 22, rx: 6, ry: 3.5 }
export const DAIS_STEPS = { x0: 30, y0: 25.5, x1: 30, y1: 27.5, halfW: 1.6 }
// STATION POCKETS: alcoves carved in the cavern wall — stations live IN the
// geology (the reviewer's cross-cutting gap), never as furniture in a void.
export const POCKET_E = { x: 46, y: 31, rx: 4.2, ry: 3.2 }   // C3 chart table (harbor side = east, like the exterior)
export const POCKET_W = { x: 22, y: 25, rx: 3.4, ry: 2.8 }   // C6 counselor's alcove — north of the fall with a rock margin between (a quiet corner never shares a wall with the melt)
export const POCKET_SW = { x: 16, y: 42, rx: 4.5, ry: 3.5 }  // C7 outfitter's nook — WEST of the trench: reaching the tailor means crossing the bridge (a designed moment)
// THE SW FIELD: solid floor under the whole trench run so the lava cuts
// THROUGH ground, never dashes along a ragged rim (the island's lava-beads
// lesson) — the trench then honestly severs this field from the hall.
export const SW_FIELD = { x: 19, y: 38, rx: 5.5, ry: 6.5 }
// THE BACK PASSAGE (C9): roots on the WEST BANK — the trench head severed its
// hall-side mouth, so the secret now sits beyond the bridge AND behind the
// fall (audit-proven, kept deliberately: the balcony earns its darkness twice).
export const PASSAGE = { x0: 20, y0: 31, x1: 9, y1: 25, halfW: 1.5 }
export const BALCONY = { x: 7, y: 23, rx: 2.6, ry: 2.2 }

// ---- THE LIVING LAVA (the P0 pick's B-lever) ----
// The fall pours from the west wall (the head starts IN the rock so there is
// no dry walk-around at the top), the trench carries it south clean through
// the floor field past the coast of the hall, and the carved bridge is THE
// ONLY crossing — the outfitter's desire line (proven by the audit's
// severance check). Blocked ground; the glow economy's third source.
export const FALL: [number, number] = [19.5, 29.5]
export const TRENCH = { x0: 19, y0: 29, x1: 25, y1: 46, halfW: 1.3 }
export const BRIDGE_TILES: [number, number][] = [[21, 38], [22, 38], [23, 38], [21, 39], [22, 39], [23, 39]]

// ---- THE GLOW ECONOMY ANCHORS (three sources, nothing else emits — spec §1) ----
export const MOUTH: [number, number] = [51, 49]      // the fanged daylight aperture behind the shelf
export const HEARTH: [number, number] = [35, 36]     // C2 — the room's heart and brightest interior point
export const SHAFTS: [number, number][] = [[28, 33], [31, 27]] // C10 — the only cool notes (crater side)

// ---- THE STATIONS (C-ids, spec §2 — anchors + where Thor stands) ----
export type Station = { id: string; anchor: [number, number]; stand: [number, number]; note: string }
export const STATIONS: Station[] = [
  { id: 'C1-threshold', anchor: [48, 46], stand: [47.5, 45.5], note: 'the arrival shelf; the seam back out' },
  { id: 'C2-hearth', anchor: HEARTH, stand: [35, 38.6], note: 'Advisory Hearth — yearly core beats (§7.3)' },
  { id: 'C3-chart-table', anchor: [45.5, 30.5], stand: [45, 32.6], note: 'the YEAR PLANNER opens here (§7.2)' },
  { id: 'C4-principal-desk', anchor: [29.5, 21], stand: [29.5, 23.2], note: 'founding event + year vignettes (§5 I-9, §7.5)' },
  { id: 'C5-lectern', anchor: [34, 23], stand: [33.2, 24.2], note: 'the Handbook (§8.5)' },
  { id: 'C6-counselor', anchor: [19.5, 24.5], stand: [22, 25.8], note: 'cord/seal tracker board, live (§8.4)' },
  { id: 'C7-outfitter', anchor: [14.5, 41.5], stand: [16, 42.6], note: 'the wardrobe, revisitable (§4.5)' },
  { id: 'C8-trophy-wall', anchor: [23.5, 20.5], stand: [24.5, 22.5], note: 'run progress made physical (§8.2/§8.3)' },
  { id: 'C9-balcony', anchor: [7, 23], stand: [7.5, 23.5], note: 'the secret falls balcony (sticker, §8.3)' },
  { id: 'C10-light-well', anchor: [28, 33], stand: [28.5, 34], note: 'the cool accent; a fern where day strikes' },
]

// ---- SPAWNS (named data — never magic numbers in a renderer; spec §3) ----
export const SPAWNS = {
  // arriving through the panther's mouth: on the shelf, facing NW into the room
  fromMouth: { at: [47.5, 45.5] as [number, number], facing: 'NW' as const },
}

// ---- PROP FOOTPRINT RESERVATIONS (collision truth from day one; the real
// props land in P3 but the walkmap must never lie to the audit) ----
type Rect = { x0: number; y0: number; x1: number; y1: number; why: string }
const BLOCKS: Rect[] = [
  { x0: 34, y0: 35, x1: 36, y1: 37, why: 'the hearth ring + fire (C2 core)' },
  { x0: 44, y0: 30, x1: 47, y1: 31, why: 'the chart table (C3)' },
  { x0: 28, y0: 20, x1: 31, y1: 21, why: "the Principal's desk (C4)" },
  { x0: 34, y0: 23, x1: 34, y1: 23, why: 'the Handbook lectern (C5)' },
  { x0: 19, y0: 24, x1: 20, y1: 25, why: "the counselor's board + desk (C6, flush to the pocket's back wall — no dead floor behind furniture)" },
  { x0: 14, y0: 41, x1: 15, y1: 42, why: 'the castaway trunk + mirror (C7)' },
]
export function propBlocked(tx: number, ty: number): string | null {
  const x = Math.round(tx), y = Math.round(ty)
  for (const b of BLOCKS) if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return b.why
  return null
}

// ---- geometry helpers ----
const inBlob = (tx: number, ty: number, b: { x: number; y: number; rx: number; ry: number }, wobble = true) => {
  const w = wobble ? wob(tx, ty) : 0
  const dx = (tx - b.x) / (b.rx + w), dy = (ty - b.y) / (b.ry + w * 0.7)
  return dx * dx + dy * dy <= 1
}
const capT = (tx: number, ty: number, c: { x0: number; y0: number; x1: number; y1: number; halfW: number }) => {
  const vx = c.x1 - c.x0, vy = c.y1 - c.y0
  const L2 = vx * vx + vy * vy
  const t = Math.max(0, Math.min(1, ((tx - c.x0) * vx + (ty - c.y0) * vy) / L2))
  const px = c.x0 + vx * t, py = c.y0 + vy * t
  return { t, d: Math.hypot(tx - px, ty - py) }
}
const inCap = (tx: number, ty: number, c: { x0: number; y0: number; x1: number; y1: number; halfW: number }) =>
  capT(tx, ty, c).d <= c.halfW

// ---- THE LEVEL MAP: painted once, in authoring order (later paints win) ----
// -1 rock · -2 molten trench · 0 floor · 1 dais · 1..3 stair treads · 3 shelf
export const LV = new Int8Array(GRID * GRID).fill(-1)
{
  for (let ty = 0; ty < GRID; ty++) {
    for (let tx = 0; tx < GRID; tx++) {
      const i = ty * GRID + tx
      // the hall + its carved pockets + the passage: main floor
      if (
        inBlob(tx, ty, HALL) || inBlob(tx, ty, POCKET_E) || inBlob(tx, ty, POCKET_W) ||
        inBlob(tx, ty, POCKET_SW) || inCap(tx, ty, PASSAGE) || inBlob(tx, ty, BALCONY) ||
        inBlob(tx, ty, SW_FIELD)
      ) LV[i] = 0
      // the dais rides over the hall floor
      if (inBlob(tx, ty, DAIS, false)) LV[i] = 1
      const ds = capT(tx, ty, DAIS_STEPS)
      if (ds.d <= DAIS_STEPS.halfW) LV[i] = ds.t < 0.5 ? 1 : 0 // two treads: top rides the dais, foot the floor
      // the molten trench cuts the floor (blocked, alive)
      if (inCap(tx, ty, TRENCH)) LV[i] = -2
      // the grand stair: treads band 3→0 down the reveal
      const st = capT(tx, ty, STAIR)
      if (st.d <= STAIR.halfW) LV[i] = Math.max(0, Math.min(3, Math.round(3 * (1 - st.t) * 1.15 - 0.2)))
      // the threshold shelf caps the SE (painted after the stair so the shelf
      // stays a clean stage; the stair's top tread meets it at level 3)
      if (inBlob(tx, ty, SHELF)) LV[i] = 3
      // the bridge crosses the trench at floor level (carved stone, walkable)
    }
  }
  for (const [bx, by] of BRIDGE_TILES) LV[by * GRID + bx] = 0
  // pinhole filler (the coast-cleaner pattern): a lone rock tile surrounded by
  // floor is an invisible wall — melt it to the majority neighbor level. Two
  // passes; authored -2 lava is never touched.
  for (let pass = 0; pass < 2; pass++) {
    const prev = Int8Array.from(LV)
    for (let ty = 1; ty < GRID - 1; ty++) {
      for (let tx = 1; tx < GRID - 1; tx++) {
        const i = ty * GRID + tx
        if (prev[i] !== -1) continue
        const counts = new Map<number, number>()
        let floorN = 0
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue
          const v = prev[(ty + oy) * GRID + tx + ox]
          if (v >= 0) { floorN++; counts.set(v, (counts.get(v) || 0) + 1) }
        }
        if (floorN >= 6) {
          let best = 0, bc = 0
          for (const [v, c] of counts) if (c > bc) { best = v; bc = c }
          LV[i] = best as -2 | -1 | 0 | 1 | 2 | 3
        }
      }
    }
  }
  // ORPHAN CULL: any floor unreachable from the mouth spawn (≤1-level steps)
  // becomes rock — the layout GUARANTEES walkable ⇒ reachable, so a sealed
  // 2-tile sliver can never become an invisible dead spot for the walker.
  {
    const reach = new Uint8Array(GRID * GRID)
    const sx = Math.round(SPAWNS.fromMouth.at[0]), sy = Math.round(SPAWNS.fromMouth.at[1])
    const qx = [sx], qy = [sy]
    reach[sy * GRID + sx] = 1
    for (let h = 0; h < qx.length; h++) {
      const x = qx[h], y = qy[h]
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + ox, ny = y + oy
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
        const j = ny * GRID + nx
        if (reach[j] || LV[j] < 0) continue
        if (Math.abs(LV[ny * GRID + nx] - LV[y * GRID + x]) > 1) continue
        reach[j] = 1
        qx.push(nx); qy.push(ny)
      }
    }
    for (let i = 0; i < GRID * GRID; i++) if (LV[i] >= 0 && !reach[i]) LV[i] = -1
  }
}

export const lvlAt = (tx: number, ty: number): number =>
  tx < 0 || ty < 0 || tx >= GRID || ty >= GRID ? -1 : LV[Math.round(ty) * GRID + Math.round(tx)]
export const isLava = (tx: number, ty: number) => lvlAt(tx, ty) === -2
export const isFloor = (tx: number, ty: number) => lvlAt(tx, ty) >= 0
