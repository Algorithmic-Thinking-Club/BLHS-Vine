// the year planner: the catalog against the real blhs tables, and the sheet's tokens, classes and stamp
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CLASSES, cordHint, eligibleClasses } from './catalog'
import { PROGRAMMES, programmeAllowedIn, SPORT_SEASONS } from '../roster/roster'

async function freshSave() {
  vi.resetModules()
  return await import('../save')
}
beforeEach(() => { localStorage.clear() })

describe('the sport-season table (the real WIAA seasons at BLHS)', () => {
  it('locks the season of every roster sport', () => {
    expect(SPORT_SEASONS.football).toBe('Fall')
    expect(SPORT_SEASONS.volleyball).toBe('Fall')
    expect(SPORT_SEASONS.wrestling).toBe('Winter')
    expect(SPORT_SEASONS['boys-basketball']).toBe('Winter')
    expect(SPORT_SEASONS.baseball).toBe('Spring')
    expect(SPORT_SEASONS.softball).toBe('Spring')
    expect(SPORT_SEASONS['track-field']).toBe('Spring')
    expect(Object.keys(SPORT_SEASONS)).toHaveLength(22)
  })
  it('sports lock to their season; clubs sail any season', () => {
    const football = PROGRAMMES.find((a) => a.id === 'football')!
    expect(programmeAllowedIn(football, 'Fall')).toBe(true)
    expect(programmeAllowedIn(football, 'Spring')).toBe(false)
    const atc = PROGRAMMES.find((a) => a.id === 'atc')!
    for (const s of ['Fall', 'Winter', 'Spring'] as const) expect(programmeAllowedIn(atc, s)).toBe(true)
  })
})

describe('the class catalog (2024-25 SBLSD catalog truths)', () => {
  it('has unique ids and resolvable prerequisites', () => {
    const ids = new Set(CLASSES.map((c) => c.id))
    expect(ids.size).toBe(CLASSES.length)
    for (const c of CLASSES) if (c.requires) expect(ids.has(c.requires)).toBe(true)
  })
  it('AP Human Geography is the ONLY freshman AP (grade 9 in the catalog)', () => {
    const y1aps = CLASSES.filter((c) => c.dept === 'ap' && c.years.includes(1))
    expect(y1aps.map((c) => c.id)).toEqual(['ap-human-geo'])
  })
  it('the Capstone pair carries the ids progress.ts keys on', () => {
    expect(CLASSES.some((c) => c.id === 'ap-seminar' && c.years.includes(2))).toBe(true)
    expect(CLASSES.some((c) => c.id === 'ap-research' && c.years.includes(3))).toBe(true)
  })
  it('language capstones are tagged for the Seal; ASL honestly cannot reach it', () => {
    for (const id of ['spanish-4', 'french-4', 'ap-spanish']) {
      const c = CLASSES.find((x) => x.id === id)!
      expect(c.tags).toContain('lang-capstone')
    }
    expect(CLASSES.filter((c) => c.id.startsWith('asl')).some((c) => c.tags.includes('lang-capstone'))).toBe(false)
  })
  it('prereq chains gate by EARLIER years: Spanish II needs Spanish I behind it', () => {
    expect(eligibleClasses(2, { 1: [] }).some((c) => c.id === 'spanish-2')).toBe(false)
    expect(eligibleClasses(2, { 1: ['spanish-1'] }).some((c) => c.id === 'spanish-2')).toBe(true)
    // and a class already picked never re-offers
    expect(eligibleClasses(2, { 1: ['spanish-1'] }).some((c) => c.id === 'spanish-1')).toBe(false)
  })
  it('AP Honors (5 APs) is genuinely reachable inside 2 picks x 4 years', () => {
    for (const y of [2, 3, 4]) {
      expect(eligibleClasses(y, {}).filter((c) => c.tags.includes('ap')).length).toBeGreaterThanOrEqual(2)
    }
    expect(eligibleClasses(1, {}).filter((c) => c.tags.includes('ap')).length).toBeGreaterThanOrEqual(1)
  })
  it('cord hints speak the real criteria', () => {
    expect(cordHint(['ap'])).toContain('AP Honors')
    expect(cordHint(['cte'])).toContain('CTE')
    expect(cordHint(['lang-capstone'])).toContain('Seal')
    expect(cordHint(['arts'])).toBeNull()
  })
})

describe('the sheet verbs', () => {
  it('assigning a slot spends the season token; lifting refunds it', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.assignSlot(1, 'Fall', 'football')
    expect(save.loadSave()!.tokens).toEqual(['Winter', 'Spring'])
    expect(save.loadSave()!.plans[1].slots.Fall).toBe('football')
    save.clearSlot(1, 'Fall')
    expect(save.loadSave()!.tokens).toContain('Fall')
    expect(save.loadSave()!.plans[1].slots.Fall).toBeUndefined()
  })

  it('re-aiming an already-spent season swaps the activity without double-spending', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.assignSlot(1, 'Fall', 'football')
    save.assignSlot(1, 'Fall', 'atc')
    expect(save.loadSave()!.plans[1].slots.Fall).toBe('atc')
    expect(save.loadSave()!.tokens).toHaveLength(2)
  })

  it('classes cap at two, no duplicates', async () => {
    const save = await freshSave()
    save.beginAdventure()
    expect(save.pickClass(1, 'ap-human-geo')).not.toBeNull()
    expect(save.pickClass(1, 'ap-human-geo')).toBeNull()
    expect(save.pickClass(1, 'spanish-1')).not.toBeNull()
    expect(save.pickClass(1, 'band')).toBeNull()   // the third pick bounces
    save.dropClass(1, 'spanish-1')
    expect(save.loadSave()!.plans[1].classes).toEqual(['ap-human-geo'])
  })

  it('the stamp locks the sheet and flips slotted islands active', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.assignSlot(1, 'Fall', 'football')
    save.pickClass(1, 'ap-human-geo'); save.pickClass(1, 'spanish-1')
    save.stampPlan(1, ['football'])
    const s = save.loadSave()!
    expect(s.plans[1].stamped).toBe(true)
    expect(s.islands.football).toBe('active')
    // post-wax, every edit bounces
    expect(save.assignSlot(1, 'Winter', 'atc')).toBeNull()
    expect(save.clearSlot(1, 'Fall')).toBeNull()
    expect(save.pickClass(1, 'band')).toBeNull()
    expect(save.dropClass(1, 'ap-human-geo')).toBeNull()
    expect(save.stampPlan(1)).toBeNull()
  })

  it('an old save without a plans field loads normalized, not crashed', async () => {
    const save = await freshSave()
    const s = save.beginAdventure()
    const raw = JSON.parse(localStorage.getItem('blhs_save_v2')!)
    delete raw.plans
    localStorage.setItem('blhs_save_v2', JSON.stringify(raw))
    window.dispatchEvent(new StorageEvent('storage', { key: 'blhs_save_v2' }))
    expect(save.loadSave()!.plans).toEqual({})
    expect(save.assignSlot(1, 'Fall', 'atc')).not.toBeNull()
    void s
  })
})
