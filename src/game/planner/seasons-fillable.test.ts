/* CAN A STUDENT ACTUALLY FILL EVERY SEASON? The stamp now asks for all three
 * (Ash: "whatever number that is, he has to choose that number before stamping"),
 * and that rule is only safe while the roster can really answer it.
 *
 * Two things make it non-obvious. A sport is locked to its own WIAA season, and one
 * programme may not take two seasons in the same year, so filling three seasons
 * needs three DIFFERENT programmes each allowed in the season it is put in. If the
 * roster ever cannot do that, the year sheet becomes impossible to stamp and the
 * run stops dead with nothing on screen explaining why. That is the failure this
 * test exists to catch before a student does.
 */
import { describe, expect, it } from 'vitest'
import { PROGRAMMES } from '../roster/roster'
import { refuseSlot } from '../run/refusal'
import { SEASONS, type SaveGame, type Season } from '../save'
import { SEASONS_OWED } from './schedule'

/* the emptiest run there is: year one, nothing picked, nothing stamped */
const fresh = (slots: Partial<Record<Season, string>> = {}): SaveGame => ({
  plans: { 1: { slots, classes: [], stamped: false } },
  /* the tokens still in hand, which is what refusal.ts checks before it lets a
   * season be filled: a season already spent is refused on the token, not the slot */
  tokens: SEASONS.filter((se) => !slots[se]),
} as unknown as SaveGame)

describe('every season can be filled', () => {
  it('offers at least one programme per season on an empty sheet', () => {
    for (const season of SEASONS) {
      const open = PROGRAMMES.filter((p) => !refuseSlot(p.id, season, fresh(), 1))
      expect(open.length, `nothing can go in ${season}`).toBeGreaterThan(0)
    }
  })

  it('can fill all three with three different programmes, which is what the stamp asks for', () => {
    /* walked rather than counted: a season may have options that are all already
     * spent elsewhere, so the only honest check is to actually lay them out */
    const lay = (i: number, slots: Partial<Record<Season, string>>): boolean => {
      if (i >= SEASONS.length) return true
      const season = SEASONS[i]
      for (const p of PROGRAMMES) {
        if (refuseSlot(p.id, season, fresh(slots), 1)) continue
        if (lay(i + 1, { ...slots, [season]: p.id })) return true
      }
      return false
    }
    expect(lay(0, {})).toBe(true)
  })

  it('and the number the stamp asks for is the number of seasons there are', () => {
    expect(SEASONS_OWED).toBe(SEASONS.length)
  })
})
