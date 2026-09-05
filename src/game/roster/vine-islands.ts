/* THE ISLANDS THE VINE ITSELF OWNS, AND WHY THEY ARE NOT MEMBER ISLANDS.
 *
 * `member-islands.json` is a member's pull request: one row, merged by Ash, and
 * the row is a PROGRAMME as well as a binding. It carries a `kind`, a `place`,
 * a season and a `playable`, because a member's island is a thing at the school
 * that a student spends a season token on.
 *
 * The Panther's Maw is not one of those. It is the home base. It is where the
 * planner opens and the fire is sat at, and there is no version of this game in
 * which a student spends a Fall token on the room they are standing in.
 *
 * Traced before this file existed: a member row for `panther-maw` would land in
 * `PROGRAMMES` (`roster.ts`), and `Planner.tsx` puts the WHOLE roster on the
 * menu with no filter of any kind. `refuseSlot` never reads `playable`. So the
 * room would have appeared in all three season columns of the year sheet,
 * spendable, and a student who picked it would have burned a real token on a
 * voyage to a place they were already inside. There is no row shape that avoids
 * that, which is why the binding is a second table rather than a cleverer row.
 *
 * SO THIS IS THE OTHER HALF OF THE SAME QUESTION, and it answers only the half
 * a member's row was never for: which folder of python does this painting run.
 *
 * AND THESE RUN UNSCOPED, which is the load-bearing difference.
 *
 * `intents.ts` stamps every flag a grape writes with the island's programme id,
 * so two members both shipping a flag called `done` cannot collide in one
 * student's save. The vine's own stations have never been stamped, and its own
 * comment says why: "renaming those would rewrite every existing save".
 *
 * The Maw's python IS those stations, in another language. It writes the founding
 * flag that `run/objective.ts` sequences the whole first year off, and it reads
 * the flags the year turn and the intro wrote. Stamped, it would write
 * `the-maw:founding` while `objective.ts` waited forever on `maw:founding`, and
 * the arrow would point at the principal's desk for four years. Same content,
 * same save, same names.
 *
 * A member's island is stamped and always will be. The difference is not a field
 * a member can type, it is membership of this table, which lives in the engine
 * and is edited by whoever ships the engine.
 */

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
