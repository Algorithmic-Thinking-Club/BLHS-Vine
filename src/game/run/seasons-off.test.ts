/* a grep keeping the season words off every screen a student cannot avoid */
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
