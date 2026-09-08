/* THE TWO FILMS NEVER PLAY IN ONE SITTING, AND THIS IS WHAT HOLDS IT.
 *
 * Ash, 2026-09-07, after playing rail-5: *"it removed the cutscene, random
 * dialogue that I don't think was supposed to happen, then the cutscene came
 * back, and the principal teleported back to the door, came back."* That was the
 * introduction handing the game over and the ending starting on the very next
 * line of the same handler, because with no islands the year is finished the
 * moment Advisory is sat.
 *
 * His rule: the closing plays on ENTERING the Maw with the year done, and never
 * in the same sitting as the opening. It is four lines of python and there is no
 * way to assert it from TypeScript by running it, because the island runs in
 * MicroPython in a worker and a test that needed a system python would be a test
 * that does not run (`vocabulary.test.ts` argues that at length and this file
 * uses the same technique for the same reason).
 *
 * So it is read as source, and the reading is structural rather than a grep for
 * a magic string: every call to the ending is found, the `if` it lives under is
 * found, and the condition is checked. A refactor that keeps the words and loses
 * the rule fails here.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/* the VENDORED copy, which is what the game actually serves. The source of truth
 * is `C:\Users\ashcy\blhs-islands`, and reading that would pass on this machine
 * and fail on a clone; `scripts/vendor-islands.mjs` runs before test, dev and
 * build, so this file is always there and is always the one that ships. */
const read = (f: string) =>
  fs.readFileSync(path.resolve(process.cwd(), 'public', 'grapes', 'panther-maw', f), 'utf8')

const island = read('island.py')
const founding = read('founding.py')

/** how far a line is indented, which is the only structure python has */
const indent = (line: string) => line.length - line.replace(/^\s*/, '').length

/** the `if` a line sits under: the nearest line above it with a smaller indent */
function conditionOver(src: string, needle: string): string {
  const lines = src.split('\n')
  const at = lines.findIndex((l) => l.includes(needle))
  if (at < 0) throw new Error(`islands/panther-maw no longer contains "${needle}"`)
  for (let i = at - 1; i >= 0; i--) {
    const l = lines[i]
    if (!l.trim() || l.trim().startsWith('#')) continue
    if (indent(l) < indent(lines[at]) && l.trim().startsWith('if ')) return l.trim()
    if (indent(l) < indent(lines[at])) break
  }
  throw new Error(`"${needle}" is not guarded by any condition`)
}

describe('the opening and the ending are never the same sitting', () => {
  /* THE LATCH IS A MODULE VARIABLE AND NOT A FLAG, which is the whole design.
   * The engine opens a fresh MicroPython worker per map load (runGrape.ts), so a
   * module variable is empty again the moment he walks back in through the
   * tunnel. A `set_flag` would remember for the rest of the run and the ending
   * would never play at all. */
  it('remembers the opening in something that dies with the map load', () => {
    expect(island).toMatch(/^_OPENED_HERE = \[\]$/m)
    /* nothing about this visit goes into the save */
    expect(island).not.toMatch(/set_flag\([^)]*OPENED/i)
  })

  it('records the opening on the load that plays it', () => {
    const body = island.slice(island.indexOf('def walking_in():'))
    const railAt = body.indexOf('rail(walk=True)')
    const latchAt = body.indexOf('_OPENED_HERE.append(')
    expect(railAt, 'walking_in no longer runs the opening').toBeGreaterThan(-1)
    expect(latchAt, 'walking_in no longer records that it ran').toBeGreaterThan(-1)
    /* written BEFORE the film, not after: the film is minutes long and every
     * word in it can refuse, and a latch written after a refusal is no latch */
    expect(latchAt).toBeLessThan(railAt)
  })

  /* FALSE ON THE LOAD THAT PLAYED THE OPENING. Every road to the ending is
   * gated, and there are three: the room loading, the principal being pressed,
   * and the counselor turning the page (which writes `yearbook:y1`, the flag the
   * ending's own trigger goes false on, so an ungated counselor deletes the
   * ending rather than merely playing it early). */
  it('will not start the ending on that load, by any road', () => {
    const endings = [...island.matchAll(/yield from ending\(\)/g)]
    expect(endings.length, 'no road to the ending is left in island.py').toBeGreaterThan(0)
    for (const e of endings) {
      const line = island.slice(0, e.index).split('\n').pop()!
      const cond = conditionOver(island, `${line}yield from ending()`)
      expect(cond, `an ungated ending: ${cond}`).toContain('not _OPENED_HERE')
    }
    expect(conditionOver(island, 'yield open("yearbook")')).toContain('not _OPENED_HERE')
  })

  /* TRUE ON THE NEXT ENTRY. The latch is the only thing added to the trigger, so
   * a load that did not play the opening asks exactly what it always asked, and
   * that question is `get("phase") == "yearbook"` — held by objective.test.ts and
   * intent-engine.test.ts on the TypeScript side. */
  it('asks the sequencer and nothing else about whether the year is done', () => {
    expect(founding).toMatch(/def year_is_done\(\):/)
    expect(founding).toMatch(/phase = yield get\("phase"\)/)
    expect(founding).toMatch(/return phase == "yearbook"/)
  })
})

describe('the trophy case', () => {
  /* Ash, 2026-09-07: *"The 'what you earn goes up here' asset is still
   * nonexistent."* It was hidden by the island on the first frame of every load,
   * because `show(WALL, count > 0)` and nothing in year one awards a sticker or
   * a badge. The case is drawn furniture and stays on the wall; the panel is
   * where the honest count lives. */
  it('is never hidden by the room dressing itself', () => {
    const body = founding.slice(founding.indexOf('def dress_the_wall('))
    const end = body.indexOf('\ndef ', 1)
    const fn = body.slice(0, end > 0 ? end : undefined)
    expect(fn).toContain('yield show(WALL, True)')
    expect(fn, 'the count decides the case again').not.toMatch(/show\(WALL,\s*count/)
  })
})
