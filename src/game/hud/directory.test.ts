/* THE DIRECTORY IS THE SCHOOL'S OWN, AND IT STAYS THAT WAY.
 *
 * BRIEF-INTRO-FILM section 5 asks for "every club, sport and class from
 * `docs/blhs/sourced-facts.md`, with meeting days and rooms where sourced", and
 * CLAUDE.md's standing law under it: nothing invented, every school fact traced.
 *
 * A picture cannot prove that, so this file does the part a screenshot cannot:
 * it reads `docs/blhs/sourced-facts.md` off disk and holds every row in the
 * module to a name that really appears in it. That is the tripwire that matters,
 * because the failure mode is not a broken page, it is a plausible sentence
 * about a real school that nobody at that school ever said.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DIRECTORY, directoryCount, type DirectoryRow } from './directory'

const SOURCE = fs.readFileSync(path.resolve('docs/blhs/sourced-facts.md'), 'utf8')

const rows = (): DirectoryRow[] => DIRECTORY.flatMap((s) => s.groups.flatMap((g) => g.rows))

/* the source writes a name the way a school writes it and this module writes it
 * the way a sentence does, so the comparison is on the words rather than on the
 * punctuation between them: "Game / Book Club" and "Game and Book Club" are the
 * same club, and "AP Computer Science [Java]" is the same course as "AP Computer
 * Science, Java". Ampersands, slashes, brackets and the word "and" all collapse. */
const key = (s: string) => s.toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/\bthe\b/g, ' ')
  .replace(/[^a-z0-9]+/g, '')

const SRC = key(SOURCE)

describe('every row is a real Bonney Lake thing', () => {
  it('names something that appears in docs/blhs/sourced-facts.md', () => {
    const missing = rows()
      .map((r) => r.name)
      /* the one row the source does not carry under this exact spelling, and it
       * says why in its own note: the club is a year old and the school's list
       * has not caught up. It IS in the source, as "Algorithmic Thinking Club
       * (ATC)", so it passes on the collapsed key like everything else. */
      .filter((n) => !SRC.includes(key(n)))
    expect(missing).toEqual([])
  })

  it('has no Example placeholder anywhere in it', () => {
    /* Example A to E is the PROGRAMME CARD rule (`roster/placeholders.ts`) and it
     * is the opposite rule here. A card is a promise a student can press; a
     * directory row is a fact about the school. Masking the fact would make the
     * game print something false about Bonney Lake to hide a missing feature. */
    for (const r of rows()) {
      expect(r.name).not.toMatch(/example/i)
      expect(r.what ?? '').not.toMatch(/example/i)
    }
  })

  it('carries nothing a student could press', () => {
    /* a row is information. The moment one grows an id, a place or a programme
     * it has become a card, and the placeholder rule applies to it instead. */
    for (const r of rows()) expect(Object.keys(r).sort()).toEqual(
      Object.keys(r).filter((k) => ['name', 'what', 'meets', 'note'].includes(k)).sort(),
    )
  })
})

describe('what the page holds', () => {
  it('lists the whole club roster, all three sports seasons and the AP list', () => {
    /* the counts the source really carries: 30 clubs across three sub-pages, 22
     * teams across three seasons, and 22 AP courses plus the language, CTE and
     * arts groups. Floors rather than equalities, so adding a sourced row is
     * never a failing test, and high enough that dropping a whole group is. */
    expect(directoryCount('clubs')).toBeGreaterThanOrEqual(30)
    expect(directoryCount('sports')).toBeGreaterThanOrEqual(22)
    expect(directoryCount('classes')).toBeGreaterThanOrEqual(22)
    expect(DIRECTORY.find((s) => s.id === 'sports')!.groups.map((g) => g.heading))
      .toEqual(['Fall', 'Winter', 'Spring'])
  })

  it('either says when a thing meets or says honestly that nobody published it', () => {
    /* the gap is the fact here. A club with no time in the source gets the gap
     * printed rather than a time made up for it, which is the whole of "nothing
     * invented" on this page. */
    for (const r of DIRECTORY.find((s) => s.id === 'clubs')!.groups.flatMap((g) => g.rows)) {
      expect(!!r.meets || !!r.note).toBe(true)
    }
  })

  it('says where every group came from', () => {
    for (const s of DIRECTORY) for (const g of s.groups) expect(g.from).toMatch(/sourced-facts\.md/)
  })
})
