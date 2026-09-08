/* WHAT A PLAQUE IS, SAID ONCE, INSIDE THE THING IT OPENS.
 *
 * BRIEF-CLOSE-THE-LOOP section 1: the three handover sentences are cut, and
 * *"each plaque explains itself the first time it is pressed, with one line
 * inside the panel it opens ('This is your schedule.', 'Every club and class at
 * Bonney Lake.', 'Where you sail.')."*
 *
 * ASH, 2026-09-08, on the version that said them out loud in the cutscene: *"just
 * a few dialogues saying 'Map, Guide, My year' that a freshman wont even connect,
 * until they realize its talking about those three random buttons at the top."*
 *
 * THE DIFFERENCE IS WHERE THE SENTENCE IS. A man in a cave naming a control in
 * the opposite corner asks a student to hold a word until they find the thing.
 * The same eight words at the top of the screen the control just opened are about
 * the thing they are looking at. It is the same teaching, moved to the moment it
 * is true, which is the whole of what the game keeps getting wrong.
 *
 * ---- ONCE, AND IT IS IN THE SAVE -------------------------------------------
 *
 * A module variable would say it again after every reload, and a student who
 * reloads has already read it. The flag shape is the one `save.ts` already uses
 * everywhere (`thing:detail`), and it is deliberately NOT one flag for all three:
 * a student who opened the Guide and never opened the chart should still be told
 * what the chart is.
 */
import { loadSave, setFlag } from '../save'

export type Plaque = 'my-year' | 'guide' | 'map'

const FLAG: Record<Plaque, string> = {
  'my-year': 'told:my-year',
  guide: 'told:guide',
  map: 'told:map',
}

/* THE BRIEF'S OWN WORDS, and they are the literal thing first (the literal-words
 * law). No metaphor, no flourish, and short enough that a student who reads one
 * line and stops has still been told what the screen is for. */
const LINE: Record<Plaque, string> = {
  'my-year': 'This is your schedule.',
  guide: 'Every club and class at Bonney Lake.',
  map: 'Where you sail.',
}

/** the line for a plaque a student has not opened before, and nothing after that */
export function firstLook(which: Plaque): string | null {
  const s = loadSave()
  if (!s) return null
  return s.flags.includes(FLAG[which]) ? null : LINE[which]
}

/* SAID AND THEN MARKED, in two calls rather than one, because the panel that
 * shows the line renders more than once and a read that also wrote would mark it
 * seen on the first frame and blank it on the second. The caller marks it when
 * the panel is really up. */
export function markLooked(which: Plaque) {
  const s = loadSave()
  if (!s || s.flags.includes(FLAG[which])) return
  setFlag(FLAG[which])
}
