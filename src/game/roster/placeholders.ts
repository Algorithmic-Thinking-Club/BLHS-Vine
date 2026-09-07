/* WHAT A STUDENT CAN PICK, AND WHAT IS ONLY A PLACEHOLDER FOR ONE.
 *
 * Ash, 2026-09-06, after playing the schedule: *"if you want placeholders, label
 * them Example A, Example B and so on, with placeholder text, and it should
 * clearly be a placeholder and not work. But everything should already be wired
 * up for when actual islands come over."*
 *
 * The concept was never wrong. The year sheet offers clubs, sports and
 * electives, and each one is an island a member builds. What was wrong is that
 * the offer was written in REAL SCHOOL NAMES with nothing behind any of them:
 * Football, Key Club, AP Human Geography, Spanish I. A freshman presses Football
 * and a real thing at his real school does nothing, forever, and he cannot tell
 * that from a bug. That is the worst kind of lie this game can tell, because the
 * whole point of it is to say true things about Bonney Lake.
 *
 * ---- THE RULE ------------------------------------------------------------
 *
 * A thing is REAL when a playable island stands behind it, and a PLACEHOLDER
 * otherwise. Nothing else decides it: not a list of names in this file, not a
 * flag somebody sets by hand. `roster.ts` already derives `PROGRAMMES` from
 * `member-islands.json`, so the day a member's pull request lands with
 * `"playable": true` the entry stops being a placeholder, appears under its real
 * name, becomes pressable and gets played, with no edit anywhere in `src/`.
 * `placeholders.test.ts` proves exactly that with a fake row.
 *
 * ---- WHY THE LETTERS ARE ASSIGNED HERE AND NOT TYPED IN ------------------
 *
 * "Example A" has to be stable while a student is looking at it, so the letters
 * are counted over the roster in its own order and only over the entries that
 * are really placeholders: the first one on screen is always A, and a member's
 * island landing closes up the alphabet rather than leaving a hole in it.
 *
 * ---- AND THE ELECTIVES KEEP THEIR REAL NAMES -----------------------------
 *
 * Ash refined it the same evening: *"the elective list is fixed by the school,
 * so keep REAL BLHS elective names, and have the list be the school's actual
 * catalog as far as docs/blhs sources it. Every elective is INERT today, drawn
 * as a real name with a quiet 'no island yet' mark."*
 *
 * That is the difference between the two lists and it is a real one. A club or
 * a sport in this game IS an island somebody built, so an island nobody has
 * built has no name to print. A class is a course the school runs whether or not
 * anybody has drawn it, and the catalog is a true thing worth reading. So the
 * cards get letters and the electives get their names and a quiet mark, and both
 * become pressable by exactly the same one line in `member-islands.json`. */
import { PROGRAMMES, programmeById } from './roster'

/** what a placeholder says about itself, in one line, on every surface */
export const EXAMPLE_BLURB = 'An island a member has not built yet.'

/** A, B, ... Z, then AA. Past twenty-six is not a case anybody will meet, and
 *  answering it is cheaper than a comment saying it cannot happen. */
export function exampleLabel(n: number): string {
  let out = ''
  let i = n
  do { out = String.fromCharCode(65 + (i % 26)) + out; i = Math.floor(i / 26) - 1 } while (i >= 0)
  return `Example ${out}`
}

/** is there a playable island behind this programme id */
export const programmeIsReal = (id: string): boolean => programmeById(id)?.playable === true

/* A CLASS ASKS THE SAME QUESTION OF THE SAME TABLE. `CLASSES` is a hand-written
 * catalog of real BLHS courses and carries no island of its own, so the way a
 * class becomes real is a member row whose programme id IS the class id. That is
 * one line in `member-islands.json` and no change here. */
export const classIsReal = (id: string): boolean => programmeIsReal(id)

/** what a class with no island behind it says about itself, quietly */
export const NO_ISLAND_YET = 'no island yet'

/* THE LETTERS, built once at module scope, over the roster and nothing else. */
const letters = new Map<string, string>()
{
  let n = 0
  for (const p of PROGRAMMES) if (!p.playable) letters.set(p.id, exampleLabel(n++))
}

/** the placeholder name for an id, or null when a real island stands behind it */
export const exampleNameOf = (id: string): string | null => letters.get(id) ?? null

/** what to PRINT for an id: the example name when it is a placeholder, else the
 *  real name the caller already had. Every surface that names a pick goes
 *  through this, so no fake real name can reach a student from any of them. */
export const shownName = (id: string, real: string): string => letters.get(id) ?? real
