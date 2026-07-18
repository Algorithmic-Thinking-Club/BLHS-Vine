// THE PHYSICAL HARBOR — tile-space truth for the deck, its objects and its
// collision. The grid owns every walkable surface: a deck tile IS walkable,
// a footprint tile IS blocked, an exposed rim IS the sea rule stopping you.
// The painted look rides on top (kit tiles mined from the Pro plates); the
// physics never touches a painting.

export const DECK_LIFT = 18            // deck plane above the ground lattice

// ---- the deck plan: a shore QUAY, the T-PIER arm, the T-HEAD berth ----
// (authored, not derived — this is the harbor's floor plan)
const rect = (x0: number, y0: number, w: number, h: number) => {
  const out: [number, number][] = []
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push([x, y])
  return out
}

export const DECK_TILES: [number, number][] = [
  ...rect(143, 74, 9, 6),   // the quay: 9x6, west rows on the sand, east over water
  ...rect(152, 76, 8, 2),   // the pier arm reaching seaward
  ...rect(160, 72, 2, 10),  // the T-head crossbar: the berth face
]

export const deckKey = (tx: number, ty: number) => tx + ',' + ty
export const DECK_SET = new Set(DECK_TILES.map(([x, y]) => deckKey(x, y)))

// ---- objects standing ON the deck: registered footprints ----
// file = an existing cut sprite in /art/island/harbor/obj (or kit art);
// tile = the footprint's NW corner; foot = tiles blocked; ax/ay = the
// sprite's anchor offset in world px from the footprint's base corner.
export interface DeckObject {
  key: string
  file: string
  tile: [number, number]
  foot: [number, number]
  ax: number
  ay: number
  hull?: boolean
}

export const DECK_OBJECTS: DeckObject[] = [
  // the harbormaster hall anchors the quay's back row (one tile off the
  // sand rim — at 144 its west wall hung over the beach)
  { key: 'hall', file: 'obj/p1-hall', tile: [145, 74], foot: [3, 2], ax: -6, ay: 10 },
  // the market stalls row, mid-quay, lane left in front
  { key: 'stalls', file: 'obj/p4-stalls', tile: [149, 74], foot: [2, 2], ax: -10, ay: 6 },
  // the beacon tower holds the quay's seaward corner
  { key: 'tower', file: 'obj/p1-tower', tile: [151, 78], foot: [1, 1], ax: -24, ay: 8 },
  // (crane cut dropped — its rect was mostly the neighboring net-rack pixels)
]

export const BLOCKED = new Set<string>()
for (const ob of DECK_OBJECTS)
  for (let dy = 0; dy < ob.foot[1]; dy++)
    for (let dx = 0; dx < ob.foot[0]; dx++)
      BLOCKED.add(deckKey(ob.tile[0] + dx, ob.tile[1] + dy))

// ---- rim lamps (lamp-v4 kit art + engine glow) ----
export const DECK_LAMPS: [number, number][] = [
  [143, 79], [147, 79], [151, 79], [155, 77], [159, 77], [160, 72], [161, 81],
]
for (const [lx, ly] of DECK_LAMPS) BLOCKED.add(deckKey(lx, ly))

// ---- moorings (water-side, engine boats/ship) ----
export const BERTH_SHIP: [number, number] = [163.4, 73.6]   // ship16 off the T-head's NE face, clear of the lighthouse
export const MOOR_BOATS: [number, number][] = [[153.5, 79.6], [157.2, 79.4]]
