/* the one line each corner plaque prints the first time a student opens it */
import { loadSave, setFlag } from '../save'

/* each plaque prints one sentence the first time it is opened, and the year sheet's is a lesson */
export type Plaque = 'my-year' | 'guide' | 'map' | 'sheet'

const FLAG: Record<Plaque, string> = {
  'my-year': 'told:my-year',
  guide: 'told:guide',
  map: 'told:map',
  sheet: 'told:sheet',
}

/* the literal thing first, with no metaphor and short enough to stop after one line */
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
