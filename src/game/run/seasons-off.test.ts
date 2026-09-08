/* THE SEASONS ARE OFF THE SURFACE, AND THIS IS WHAT KEEPS THEM OFF.
 *
 * BRIEF-CLOSE-THE-LOOP section 4: *"Wiseman's model (three seasons a year, one
 * club or sport per season) stays in the code and disappears from every screen
 * until a real sport with a season exists. One club or sport a year; no tokens
 * shown; the words Fall, Winter and Spring appear nowhere a student reads."*
 *
 * Ash, 2026-09-08, which is why: *"what even happened to the fall, winter, spring
 * shit. how does that even work. what even is that about. NONE of that is
 * explained, and even I dont know, which is the bigger problem."*
 *
 * SO IT IS A GREP, DELIBERATELY, over the files that draw the chrome a student
 * cannot avoid. A unit test can only see the strings one code path produces; the
 * failure this is guarding against is a future session reaching for `save.season`
 * because it is right there on the type. The directory is exempt and says so:
 * the school really does run sports in three seasons and the Guide is the one
 * page allowed to print the school's own list.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (f: string) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8')
/* comments are allowed to name the thing; the whole point of writing this down
 * is that the next session does not reach for it again */
const bare = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** every file that draws chrome a first-session student cannot avoid */
const CHROME = [
  '../../app/scenes/TitleScene.tsx',
  '../hud/Handbook.tsx',
  '../hud/Hud.tsx',
  '../hud/inventory.ts',
  './wall.ts',
  './tasks.ts',
]

describe('no student reads a season', () => {
  for (const f of CHROME) {
    it(`${f} prints no season word`, () => {
      const src = bare(read(f))
      /* the season NAMES, in a quoted string or a template. `SEASONS`, `Season`
       * and `s.season` are the model and stay. */
      const said = [...src.matchAll(/(['"`])([^'"`\n]*\b(?:Fall|Winter|Spring)\b[^'"`\n]*)\1/g)]
        .map((m) => m[2])
        /* a key into `plan.slots` is the model reaching for a column, not a
         * sentence: `slots.Fall` and `assignSlot(year, 'Fall', id)` are wiring */
        .filter((t) => !/^(Fall|Winter|Spring)$/.test(t))
      expect(said, `${f} still says: ${said.join(' | ')}`).toEqual([])
    })
  }

  it('the title never offers a season on its continue sign', () => {
    const src = bare(read('../../app/scenes/TitleScene.tsx'))
    expect(src).not.toMatch(/\$\{save\.season\}/)
    expect(src).toMatch(/runLine\(save\)/)
  })

  it('the Guide is exempt, because the school really does run three seasons', () => {
    /* the counter-rule, asserted so nobody "fixes" the directory to match */
    const dir = read('../hud/directory.ts')
    expect(dir).toMatch(/heading: 'Fall'/)
    expect(dir).toMatch(/heading: 'Winter'/)
    expect(dir).toMatch(/heading: 'Spring'/)
  })
})
