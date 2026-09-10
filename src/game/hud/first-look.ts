/* the one line each corner plaque prints the first time a student opens it */
import { loadSave, setFlag } from '../save'

/* ---- 'sheet' IS A LESSON, NOT A LINE (Ash, 2026-09-09) -------------------
 *
 * The three plaques each print one sentence the first time they are opened. The
 * year sheet's first look is a whole tutorial rather than a line, so it carries
 * an empty string: the FLAG is the useful half and `firstLook` still answers
 * null once it has been seen, which is the question the sheet asks. */
export type Plaque = 'my-year' | 'guide' | 'map' | 'sheet'

const FLAG: Record<Plaque, string> = {
  'my-year': 'told:my-year',
  guide: 'told:guide',
  map: 'told:map',
  sheet: 'told:sheet',
}

/* THE BRIEF'S OWN WORDS, and they are the literal thing first (the literal-words
 * law). No metaphor, no flourish, and short enough that a student who reads one
 * line and stops has still been told what the screen is for. */
const LINE: Record<Plaque, string> = {
  'my-year': 'This is your schedule.',
  guide: 'Every club and class at Bonney Lake.',
  map: 'Where you sail.',
  /* the sheet teaches itself with a spotlight instead (`hud/Tour.tsx`) */
  sheet: '',
}

/** the line for a plaque a student has not opened before, and nothing after that */
export function firstLook(which: Plaque): string | null {
  const s = loadSave()
  if (!s) return null
  return s.flags.includes(FLAG[which]) ? null : (LINE[which] || ' ')
}

/* reading the line and marking it seen are two calls, so a re-render cannot blank it */
export function markLooked(which: Plaque) {
  const s = loadSave()
  if (!s || s.flags.includes(FLAG[which])) return
  setFlag(FLAG[which])
}
