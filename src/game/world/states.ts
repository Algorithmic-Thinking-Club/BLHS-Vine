/* THE SEVEN STATES, RESOLVED FOR ONE STUDENT.
 *
 * The composition says a slot's AUTHORED state, which is the world's own answer
 * and is the same for everybody: a rumour is a rumour on every Chromebook in the
 * room. What a particular student has done with a place is the run's, and this
 * file is the one join between them.
 *
 * §80.6's own boundary, stated the other way round: THE ROSTER IS WHAT EXISTS,
 * THE COMPOSITION IS WHERE IT IS, AND THE RUN IS WHAT THIS STUDENT DID WITH IT.
 * Nothing here writes. G6's rule is that availability and in-season are computed
 * per draw and never stored, and that is why this is a function rather than a
 * field: a stored state is a state that can disagree with the ledger.
 *
 * WHY IT IS NOT IN `composition.ts`. That file must stay readable by world code
 * that has no business importing a save. The test §80.2 sets for the boundary is
 * that no island id and no programme id appears anywhere in world code, and the
 * split is what keeps it true: the world asks this file for a colour and never
 * learns that a place holds three programmes in three seasons.
 */
import type { SaveGame } from '../save'
import { programmesAt, programmeAllowedIn } from '../roster/roster'
import { type SlotState, type WorldSlot } from './composition'

/** what a student sees this slot as, right now */
export function stateOf(slot: WorldSlot, s: SaveGame | null): SlotState {
  /* AUTHORED STATES WIN AND ARE NOT NEGOTIABLE. A slot with no map is a rumour
   * no matter what a save says, because there is nothing to have completed, and
   * `rising` is the world's own moment rather than a student's. */
  if (!slot.map) return 'rumour'
  if (slot.state === 'rising') return 'rising'
  if (!s) return 'misty'

  /* SEEN IS A FACT ABOUT A PLACE, which is what the exposure record is for and
   * why discovery fires once when a student sails past a stadium rather than
   * three times. */
  const seen = (s.exposure ?? []).some((e) => e.place === slot.place)
  if (!seen) return 'misty'

  const here = programmesAt(slot.place)
  if (!here.length) return 'discovered'

  /* COMPLETION IS PER PROGRAMME PER YEAR, off the append-only record, so a
   * ladder that re-slots the same programme three years running does not have to
   * erase its own history to say what colour it is. */
  const done = here.filter((p) => (s.completions ?? []).some((c) => c.programme === p.id))
  if (done.length === here.length) return 'completed'
  if (here.some((p) => s.islands[p.id] === 'active')) return 'active'
  /* AVAILABLE MEANS SOMETHING HERE CAN BE SLOTTED TODAY, which is a season
   * question and a playability question and not a "have you been" question. */
  if (here.some((p) => p.playable && programmeAllowedIn(p, s.season))) return 'available'
  return 'discovered'
}

/** what the chart writes beside a slot, in the register that state deserves */
export function stateLine(st: SlotState, slot: WorldSlot, s: SaveGame | null): string {
  switch (st) {
    case 'rumour': return 'somebody mentioned it'
    case 'rising': return 'rising now'
    case 'misty': return 'not been'
    case 'discovered': {
      const here = programmesAt(slot.place)
      /* OUT OF SEASON IS A SENTENCE ABOUT A PLACE, and a place could not say it
       * before the roster split. Football is out of season and flag football is
       * not, at the same island, on the same afternoon. */
      const shut = s ? here.filter((p) => p.playable && !programmeAllowedIn(p, s.season)) : []
      if (shut.length) return `${shut[0].name} is out of season`
      if (here.length && !here.some((p) => p.playable)) return 'still rising'
      return 'been past'
    }
    case 'available': return 'open this season'
    case 'active': return 'your flag is on it'
    case 'completed': return 'done'
  }
}

/* THE INK EACH STATE IS DRAWN IN. One table, so the chart and the water cannot
 * disagree about what "discovered" looks like, and so that STATE IS READABLE
 * WITHOUT RELYING ON HUE, which `GAME-DESIGN.md` §11.3 already requires and
 * nothing implemented: every row carries a mark as well as a colour. */
export const STATE_INK: Record<SlotState, { tint: number; mark: string; dim: number }> = {
  rumour: { tint: 0x8a7a60, mark: '?', dim: 0.35 },
  rising: { tint: 0xffd98a, mark: '*', dim: 1 },
  misty: { tint: 0x6d7f86, mark: '~', dim: 0.45 },
  discovered: { tint: 0xcbbb95, mark: '·', dim: 0.8 },
  available: { tint: 0xe6d6a8, mark: '○', dim: 1 },
  active: { tint: 0xffc861, mark: '▲', dim: 1 },
  completed: { tint: 0x7fd0a6, mark: '✓', dim: 1 },
}
