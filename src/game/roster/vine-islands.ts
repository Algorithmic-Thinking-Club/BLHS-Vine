// which folder of python a painting the vine itself owns runs, with no programme behind it

export type VineIsland = {
  /** the painting, and the key this table is asked about */
  map: string
  /** the folder under `public/grapes/`, served from the game's own origin */
  folder: string
  /** one line saying what it is, for a reader of this file and for nothing else */
  what: string
}

export const VINE_ISLANDS: VineIsland[] = [
  {
    map: 'panther-maw',
    folder: 'panther-maw',
    what: "the home base: the founding event, the planner, the fire, the cords, the wardrobe, the wall",
  },
  {
    map: 'hub',
    folder: 'the-hub',
    what: "the central island: the ship sails herself in, and three people on the way up from the dock",
  },
]

const byMap = new Map(VINE_ISLANDS.map((i) => [i.map, i]))

/** the vine's own island for a painting, if it has one */
export const vineIslandOfMap = (mapId: string | undefined): VineIsland | undefined =>
  mapId ? byMap.get(mapId) : undefined
