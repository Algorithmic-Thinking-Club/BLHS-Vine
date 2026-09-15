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

  /* ---- NEITHER ROAD CAN PUT THE TWO FILMS IN ONE SITTING ------------------
   *
   * There are two roads and they are fenced differently, on purpose.
   *
   * THE ROOM LOADING keeps the latch. That is the road Ash named ("walking into
   * the Maw with the year done starts the ending film"), and it is the one that
   * would otherwise fire on the very load the opening just played on.
   *
   * THE PRESS is fenced by the HANDOVER instead, and it had to move. The year
   * closes at the chart table now: a student presses Go on his last pick ten
   * feet from the man, the bar lights the desk, and under the latch pressing him
   * got a hello and nothing in the room could end the year. Measured on the live
   * deploy 2026-09-08 with the cold gate sitting there four minutes.
   *
   * IT STILL CANNOT RUN THEM TOGETHER, which is the thing Ash actually ruled
   * out: `maw:handed_over` is the opening's last line, and every pick on the
   * sheet has to be finished after it. The opening finishes no picks. */
  it('will not start the ending on the load that played the opening', () => {
    const endings = [...island.matchAll(/yield from ending\(\)/g)]
    expect(endings.length, 'no road to the ending is left in island.py').toBeGreaterThan(0)
    const fences = endings.map((e) => {
      const line = island.slice(0, e.index).split('\n').pop()!
      return conditionOver(island, `${line}yield from ending()`)
    })
    /* the load road, which is the one the latch is for */
    expect(fences.some((c) => c.includes('not _OPENED_HERE')),
      `no road keeps the latch: ${JSON.stringify(fences)}`).toBe(true)
    /* and every road is fenced by SOMETHING that means the opening is over */
    for (const c of fences) {
      expect(/not _OPENED_HERE|HANDED_OVER in flags/.test(c), `an ungated ending: ${c}`).toBe(true)
    }
    /* both roads ask the sequencer whether the year is really done */
    for (const c of fences) expect(c, `a road that does not check the year: ${c}`).toContain('done')
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

/* ---- NOT ONE COORDINATE IN THE RAIL -------------------------------------
 *
 * ASH, 2026-09-08: *"I am reorganising the Maw in MAPVIS. Read every stand point
 * and position from the published map by anchor name. Hardcode nothing."*
 *
 * The rail used to carry a table of eight pixel offsets, one pair per station,
 * each read off a 4x screenshot of Maw v7. They were correct for that export and
 * for no other, and nothing would have said so: a dragged table moves the mark,
 * the offset stays, and the two of them stand wrong again with every test green.
 *
 * This is the fence. `lead_to` with no offset and `actor_face(x, "thor")` work
 * the same beat out against whatever map is loaded, so the rail passes names and
 * only names, and a number pasted back in fails here by line. */
describe('the rail hardcodes no geometry', () => {
  it('passes no offset to any word', () => {
    const bad = founding.split('\n')
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /\boff\s*=/.test(l) && !l.trim().startsWith('#'))
    expect(bad.map(([n, l]) => `${n}: ${l.trim()}`), 'an offset is back in the rail').toEqual([])
  })

  it('names no compass heading at a station, since which way is "at him" is the map\'s to know', () => {
    /* ---- THE RULE IS "NOT A COMPASS POINT", AND IT READ "IS THOR" -------------
     *
     * It required the literal string "thor" on every line, which was the same thing
     * for as long as the player was the only derived thing a body could be turned to.
     * `actor_face` can turn anybody to look at any PLACE now, resolved against the map
     * that is loaded, so `actor_face(x, TABLE)` and `actor_face(x, look_at)` obey this
     * law exactly as `"thor"` does, and the old spelling called them violations.
     *
     * What the law has always meant: a compass point typed into a film is a bet on
     * where somebody left a table in MAPVIS, and a NAME is a question the scene
     * answers against the export in front of it. So the check is on the eight, which
     * is also how the members own copy of this rule is written
     * (`blhs-islands/tests/test_the_maw.py`, THE_EIGHT). */
    const EIGHT = ['north', 'north-east', 'east', 'south-east',
      'south', 'south-west', 'west', 'north-west']
    const bad = founding.split('\n')
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /actor_face\(/.test(l) && !l.trim().startsWith('#'))
      .filter(([, l]) => EIGHT.some((d) => l.includes(`"${d}"`) || l.includes(`'${d}'`)))
    expect(bad.map(([n, l]) => `${n}: ${l.trim()}`), 'a written heading is back').toEqual([])
  })

  /* the stations themselves are still names, which is what makes the above safe */
  it('still takes him to the stations by anchor name', () => {
    for (const w of ['chart_table', 'hearth', 'trophy_wall', 'counselor']) {
      expect(founding, `the rail no longer names ${w}`).toContain(`"${w}"`)
    }
  })
})
