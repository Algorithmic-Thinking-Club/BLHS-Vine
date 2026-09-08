/* the one line each corner plaque prints the first time a student opens it */
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

/* reading the line and marking it seen are two calls, so a re-render cannot blank it */
export function markLooked(which: Plaque) {
  const s = loadSave()
  if (!s || s.flags.includes(FLAG[which])) return
  setFlag(FLAG[which])
}
