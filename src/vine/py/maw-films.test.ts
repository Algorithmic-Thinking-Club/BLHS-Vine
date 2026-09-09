/* the opening film and the closing film never play in the same sitting */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/* the vendored copy, which is the one the game actually serves */
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
  /* the latch is a module variable, so it dies with the map load and not with the run */
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
   * gated, and there are two: the room loading, and somebody who is in the film
   * being pressed by a student who walked away from it. */
  it('will not start the ending on that load, by any road', () => {
    const endings = [...island.matchAll(/yield from ending\(\)/g)]
    expect(endings.length, 'no road to the ending is left in island.py').toBeGreaterThan(0)
    for (const e of endings) {
      const line = island.slice(0, e.index).split('\n').pop()!
      const cond = conditionOver(island, `${line}yield from ending()`)
      expect(cond, `an ungated ending: ${cond}`).toContain('not _OPENED_HERE')
    }
  })

  /* the third road is closed rather than gated: no station opens the yearbook */
  it('leaves the page-turning to the film and to nothing else', () => {
    expect(island, 'a station outside the closing film opens the yearbook')
      .not.toMatch(/open\("yearbook"/)
    expect(founding, 'the closing film no longer turns the page')
      .toMatch(/yield open\("yearbook", wait=True\)/)
  })

  /* ---- WHO CAN START THE ENDING, AND IT IS NOT THE COUNSELOR --------------
   *
   * ASH, 2026-09-08: *"pressing the principal starts the closing film (the
   * counselor never starts it), walking into the Maw with the year done also
   * starts it."* Two roads, named, and she is not one of them: the closing is the
   * principal coming to find you, and a student who wanders to her first should
   * not trigger the man walking up behind him.
   *
   * Read as source because both roads are `on_talk`/`on_start` handlers in
   * MicroPython, and the thing being fenced is WHICH handler holds the call. */
  it('has exactly two roads into the ending, and neither is the counselor', () => {
    const of = (fn: string) => {
      const at = island.indexOf(`def ${fn}(`)
      if (at < 0) throw new Error(`island.py has no ${fn}()`)
      const end = island.indexOf('@on_', at + 4)
      return island.slice(at, end > 0 ? end : undefined)
    }
    expect(of('walking_in'), 'walking in with the year done no longer starts it')
      .toContain('yield from ending()')
    expect(of('the_principal'), 'pressing the principal no longer starts it')
      .toContain('yield from ending()')
    expect(of('the_counselor'), 'the counselor starts the ending again')
      .not.toContain('yield from ending()')
  })

  /* true on the next entry, since the latch is the only thing added to the trigger */
  it('asks the sequencer and nothing else about whether the year is done', () => {
    expect(founding).toMatch(/def year_is_done\(\):/)
    expect(founding).toMatch(/phase = yield get\("phase"\)/)
    expect(founding).toMatch(/return phase == "yearbook"/)
  })
})

describe('the trophy case', () => {
  /* the case is drawn furniture and stays on the wall whatever the count is */
  it('is never hidden by the room dressing itself', () => {
    const body = founding.slice(founding.indexOf('def dress_the_wall('))
    const end = body.indexOf('\ndef ', 1)
    const fn = body.slice(0, end > 0 ? end : undefined)
    expect(fn).toContain('yield show(WALL, True)')
    expect(fn, 'the count decides the case again').not.toMatch(/show\(WALL,\s*count/)
  })
})
