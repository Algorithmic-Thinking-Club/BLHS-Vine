/* THE RUN CLOSING (§80.6): the yearbook, graduation's seal, the resume guard, the
 * one-run guard, and the refusals the sheet serves.
 *
 * Every describe here is a defect that was live in this repo, named in the block
 * comment above it. None of these is a hypothetical.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { yearbookPage, yearbookYears, yearTurned, YEARBOOK_SECTIONS } from './yearbook-page'
import { resumeTarget, mooringFor, stampOf, RESUME_REASONS } from './resume'
import { nextObjective, FOUNDING_FLAG } from './objective'
/* STATICALLY, on purpose: `vi.resetModules()` only affects later imports, so a
 * dynamic `import('../roster/roster')` inside a test would hand back a second
 * copy of the roster that `objective.ts` is not reading. */
import { programmeById } from '../roster/roster'
import { refuseSlot, refuseClass } from './refusal'
import type { WorldComposition } from '../world/composition'

const KEY = 'blhs_save_v2'
const GUARD = 'blhs_run_guard'

async function freshSave() {
  vi.resetModules()
  return await import('../save')
}

beforeEach(() => { localStorage.clear() })

/* ---- THE YEARBOOK -----------------------------------------------------------
 *
 * `Yearbook.tsx` rendered `{st.voyages.length > 0 && ...}` and
 * `{cords.length > 0 && ...}`, so the page a freshman saw and the page a senior
 * saw were two documents with two different shapes. And it read `loadSave()` and
 * `yearStatus(s)`, both of which mean "today", so year one's page stopped
 * existing the moment year two began.
 */
describe('the yearbook assembles in a fixed order for any year', () => {
  it('gives a nearly empty year one all four sections, each saying it is empty', async () => {
    const save = await freshSave()
    save.beginAdventure()
    const page = yearbookPage(save.loadSave()!, 1)

    expect(page.sections.map((s) => s.id)).toEqual([...YEARBOOK_SECTIONS])
    for (const sec of page.sections) {
      expect(sec.rows).toHaveLength(0)
      expect(sec.empty.length).toBeGreaterThan(0)     // it says so rather than vanishing
      expect(sec.heading.length).toBeGreaterThan(0)
    }
    expect(page.gpa).toBeNull()
    expect(page.current).toBe(true)
    expect(page.turned).toBe(false)
    /* THE PAGE CARRIES ITS OWN GATE. The book used to be reachable only inside
     * the window where the year was closable, so the turn could assume it. It is
     * reachable from the sheet's shelf at any moment now, and without this a
     * student could end year one in October by opening a book. */
    expect(page.ready).toBe(false)
  })

  it('will not let an unfinished year be turned from a page opened off the shelf', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.writeSave({ introDone: true })
    save.pickClass(1, 'ap-human-geo'); save.pickClass(1, 'spanish-1')
    save.stampPlan(1, [])
    // stamped, and Advisory still owed, which is the one thing that holds a year
    expect(yearbookPage(save.loadSave()!, 1).ready).toBe(false)
    save.recordGrade({ id: 'core:y1', title: 'Advisory', kind: 'core', credit: .5, grade: 4, year: 1, season: 'Fall' })
    /* AND THE CLASSES DO NOT HOLD IT (BRIEF-MAW-RAIL, `year.ts`). The rail walks
       a student from the pick screen to the fire to the wall to the counselor,
       and its fourth beat shows the wall with the classes honestly still empty.
       They are the year's optional depth, on the sheet and in the nudge line,
       and they are not a gate. */
    expect(yearbookPage(save.loadSave()!, 1).ready).toBe(true)
    save.recordGrade({ id: 'class:ap-human-geo', title: 'x', kind: 'class', credit: .5, grade: 4, year: 1, season: 'Fall' })
    save.recordGrade({ id: 'class:spanish-1', title: 'y', kind: 'class', credit: .5, grade: 4, year: 1, season: 'Fall' })
    expect(yearbookPage(save.loadSave()!, 1).ready).toBe(true)
  })

  it('gives a full year four the SAME four sections in the SAME order', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.writeSave({ year: 4, introDone: true })
    save.assignSlot(4, 'Fall', 'football')
    save.pickClass(4, 'ap-lit'); save.pickClass(4, 'ap-gov')
    save.stampPlan(4, ['football'])
    save.recordGrade({ id: 'class:ap-lit', title: 'AP Lit', kind: 'class', credit: .5, grade: 4, year: 4, season: 'Fall', tags: ['ap'] })
    save.recordExposure('stadium', true)
    save.recordCompletion('football', 3.6, 'football')

    const page = yearbookPage(save.loadSave()!, 4)
    expect(page.sections.map((s) => s.id)).toEqual([...YEARBOOK_SECTIONS])
    expect(page.sections.find((s) => s.id === 'paper')!.rows).toHaveLength(1)
    expect(page.sections.find((s) => s.id === 'seasons')!.rows[0].meta).toContain('finished')
    expect(page.sections.find((s) => s.id === 'waters')!.rows[0].meta).toBe('you went inside')
    expect(page.gpa).toBe(4)
    expect(page.final).toBe(true)
  })

  it('composes a PAST year, and never the current year dressed up as one', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.recordGrade({ id: 'class:spanish-1', title: 'Spanish I', kind: 'class', credit: .5, grade: 3, year: 1, season: 'Fall', tags: ['lang'] })
    save.recordExposure('flex-200')
    save.setFlag('yearbook:y1')
    save.endYear()
    save.recordGrade({ id: 'class:spanish-2', title: 'Spanish II', kind: 'class', credit: .5, grade: 4, year: 2, season: 'Fall', tags: ['lang'] })

    const s = save.loadSave()!
    const y1 = yearbookPage(s, 1)
    const y2 = yearbookPage(s, 2)

    expect(y1.sections.find((x) => x.id === 'paper')!.rows.map((r) => r.title)).toEqual(['Spanish I'])
    expect(y2.sections.find((x) => x.id === 'paper')!.rows.map((r) => r.title)).toEqual(['Spanish II'])
    expect(y1.sections.find((x) => x.id === 'waters')!.rows).toHaveLength(1)
    expect(y2.sections.find((x) => x.id === 'waters')!.rows).toHaveLength(0)
    expect(y1.turned).toBe(true)
    expect(y1.current).toBe(false)
    expect(y2.current).toBe(true)
  })

  it('says out loud that the threads are today\'s and not that year\'s', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.setFlag('yearbook:y1'); save.endYear()
    const s = save.loadSave()!
    /* the cord table is cumulative and nothing recorded what a thread looked like
     * in year one, so the page says so rather than printing a number that looks
     * per-year and is not */
    expect(yearbookPage(s, 1).sections.find((x) => x.id === 'threads')!.caveat).toBeTruthy()
    expect(yearbookPage(s, 2).sections.find((x) => x.id === 'threads')!.caveat).toBeUndefined()
  })

  it('makes every year lived reachable, and marks the ones that turned', async () => {
    const save = await freshSave()
    save.beginAdventure()
    expect(yearbookYears(save.loadSave()!)).toEqual([1])
    save.setFlag('yearbook:y1'); save.endYear()
    save.setFlag('yearbook:y2'); save.endYear()
    const s = save.loadSave()!
    expect(yearbookYears(s)).toEqual([1, 2, 3])
    expect(yearTurned(s, 1)).toBe(true)
    expect(yearTurned(s, 3)).toBe(false)
  })
})

/* ---- THE SEQUENCER REACHING THE YEARBOOK -----------------------------------
 *
 * `nextObjective`'s voyage clause read `y.voyages.filter((v) => !v.done)` with no
 * test of whether the programme could actually run. Every programme on the roster
 * is unplayable today, so one stamped token pointed the arrow at the exit for the
 * rest of the year and the `yearbook` phase below it was unreachable. The year
 * model deliberately does not wait on a rising island, so the two disagreed
 * forever, on the ordinary path.
 */
describe('the objective reaches the yearbook', () => {
  async function stampedYear() {
    const save = await freshSave()
    save.beginAdventure()
    save.writeSave({ introDone: true })
    save.setFlag(FOUNDING_FLAG); save.setFlag('vignette:y1')
    save.assignSlot(1, 'Fall', 'football')
    save.pickClass(1, 'ap-human-geo'); save.pickClass(1, 'spanish-1')
    save.stampPlan(1, ['football'])
    save.recordGrade({ id: 'core:y1', title: 'Advisory', kind: 'core', credit: .5, grade: 4, year: 1, season: 'Fall' })
    save.recordGrade({ id: 'class:ap-human-geo', title: 'x', kind: 'class', credit: .5, grade: 4, year: 1, season: 'Fall' })
    save.recordGrade({ id: 'class:spanish-1', title: 'y', kind: 'class', credit: .5, grade: 4, year: 1, season: 'Fall' })
    return save
  }

  it('sends the student to the sheet once the year is owed nothing it can do', async () => {
    const save = await stampedYear()
    const o = nextObjective(save.loadSave())
    expect(o?.phase).toBe('yearbook')
    /* the counselor is who turns the page (islands/panther-maw/island.py), so
     * she is the lit thing when the year can close */
    expect(o?.anchor).toBe('counselor')
  })

  it('sends him to the counselor with a class still owed and an island still rising', async () => {
    /* This used to expect the `rising` phase, which was the state "committed to
       a season that cannot sail, with a class still on the sheet". Since
       BRIEF-MAW-RAIL the classes do not hold the year open, so the page can turn
       and the counselor is the one lit thing. What the old state was honest
       about is said in the yearbook's nudge line instead. */
    const save = await stampedYear()
    save.writeSave({ ledger: save.loadSave()!.ledger.filter((e) => e.id !== 'class:spanish-1') })
    const o = nextObjective(save.loadSave())
    expect(o?.phase).toBe('yearbook')
    expect(o?.anchor).toBe('counselor')
    const { yearStatus, nudgeLine } = await import('./year')
    expect(nudgeLine(yearStatus(save.loadSave()!))).toContain('not open yet')
  })

  it('still points at a real voyage when there is one to sail', async () => {
    const save = await stampedYear()
    const g = programmeById('football')!
    const was = g.playable
    ;(g as { playable: boolean }).playable = true
    try {
      const o = nextObjective(save.loadSave())
      expect(o?.phase).toBe('voyage')
      expect(o?.anchor).toBe('maw_entrance')
    } finally { (g as { playable: boolean }).playable = was }
  })
})

/* ---- THE SEAL ---------------------------------------------------------------
 *
 * `Graduation.tsx` computed `runCode(transcriptOf(s))` from the LIVE save at
 * render, and the last button on that flow unlocks Gear 2 and opens the ocean. So
 * a graduate played one more island and the code the teacher's roster computed
 * was no longer the code on the printed page.
 */
describe('the transcript is frozen at graduation', () => {
  it('keeps the printed code the same after the graduate plays on', async () => {
    const save = await freshSave()
    const { sealRun, diplomaOf, checkCode, artifactText } = await import('./diploma')
    save.beginAdventure()
    save.writeSave({ handle: 'Reef', participantId: 'p_1', year: 4, introDone: true })
    save.recordGrade({ id: 'core:y1', title: 'Advisory', kind: 'core', credit: .5, grade: 4, year: 1, season: 'Fall' })

    const sealed = sealRun(save.loadSave()!)
    expect(sealed.code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    expect(sealed.year).toBe(4)

    // gear 2: the ocean opens and the ledger moves
    save.recordGrade({ id: 'island:atc:y4', title: 'ATC', kind: 'island', credit: 1, grade: 1, year: 4, season: 'Spring' })
    const after = save.loadSave()!
    expect(diplomaOf(after).code).toBe(sealed.code)     // the printed page still checks
    expect(checkCode(after, sealed.code)).toBe(true)
    expect(checkCode(after, 'AAAAA-AAAAA')).toBe(false)
    // and the code check is not case- or space-fussy, because it is read aloud
    expect(checkCode(after, ` ${sealed.code.toLowerCase()} `)).toBe(true)
    expect(artifactText(after)).toContain(sealed.code)
  })

  it('seals once and a second call never overwrites the first', async () => {
    const save = await freshSave()
    const { sealRun } = await import('./diploma')
    save.beginAdventure()
    save.writeSave({ participantId: 'p_2', year: 4 })
    const first = sealRun(save.loadSave()!)
    save.recordGrade({ id: 'core:y2', title: 'x', kind: 'core', credit: .5, grade: 4, year: 2, season: 'Fall' })
    const second = sealRun(save.loadSave()!)
    expect(second.code).toBe(first.code)
    expect(second.at).toBe(first.at)
  })

  it('hands over an artifact a student can paste, with the run on it', async () => {
    const save = await freshSave()
    const { artifactText } = await import('./diploma')
    save.beginAdventure()
    save.writeSave({ handle: 'Kestrel', year: 4 })
    save.recordExposure('stadium', true)
    const text = artifactText(save.loadSave()!)
    expect(text).toContain('BONNEY LAKE HIGH SCHOOL')
    expect(text).toContain('Kestrel')
    expect(text).toContain('Places you saw: 1')
    expect(text).toContain('Verification:')
  })
})

/* ---- THE MAP-VERSION GUARD --------------------------------------------------
 *
 * AUTHORING §13: MAPVIS publishes immutable versions and any map can be re-cut at
 * any time. Nothing recorded which version a save was written against, so a
 * re-cut that put a wall where a student stood resumed thirty Chromebooks inside
 * blocked pixels, with the walk law refusing every direction and no error
 * anywhere.
 */
describe('a resume never trusts a position across a republish', () => {
  const now = { map: 'hub', mapVersion: 7, worldVersion: 1 }

  it('restores an exact position when the map, the version and the world all match', () => {
    const r = resumeTarget({ ...stampOf(now, 'quay', 120, 300), at: 1 }, now)
    expect(r).toMatchObject({ kind: 'exact', x: 120, y: 300, anchor: 'quay' })
  })

  it('drops the pixels and keeps the NAME when the map was republished', () => {
    const r = resumeTarget({ ...stampOf(now, 'quay', 120, 300), at: 1 }, { ...now, mapVersion: 8 })
    expect(r).toEqual({ kind: 'anchor', map: 'hub', anchor: 'quay', why: RESUME_REASONS.mapVersion })
  })

  it('falls back to the spawn when the republish left no name either', () => {
    const r = resumeTarget({ ...stampOf(now, undefined, 120, 300), at: 1 }, { ...now, mapVersion: 8 })
    expect(r).toEqual({ kind: 'spawn', map: 'hub', why: RESUME_REASONS.mapVersion })
  })

  it('catches a re-authored composition as well as a re-cut map', () => {
    const r = resumeTarget({ ...stampOf(now, 'quay', 1, 2), at: 1 }, { ...now, worldVersion: 2 })
    expect(r.kind).toBe('anchor')
    expect(r.why).toBe(RESUME_REASONS.worldVersion)
  })

  it('treats a missing version as a DIFFERENT version and not as a wildcard', () => {
    /* a save written against the committed folder carries no version and one from
     * the platform does, so "one has a number and the other does not" is exactly
     * the case where the two are different bundles */
    const local = { ...stampOf({ map: 'hub' }, 'quay', 5, 5), at: 1 }
    expect(resumeTarget(local, now).kind).not.toBe('exact')
  })

  it('sends a body that was somewhere else entirely to the spawn', () => {
    const r = resumeTarget({ ...stampOf(now, 'quay', 5, 5), at: 1 }, { ...now, map: 'panther-maw' })
    expect(r).toEqual({ kind: 'spawn', map: 'panther-maw', why: RESUME_REASONS.otherMap })
  })

  it('has an answer for a save that has never been anywhere', () => {
    expect(resumeTarget(undefined, now)).toEqual({ kind: 'spawn', map: 'hub', why: RESUME_REASONS.fresh })
  })

  it('writes the stamp it later reads, with no field it cannot compare', () => {
    expect(stampOf(now, 'quay', 1, 2)).toEqual({ map: 'hub', mapVersion: 7, worldVersion: 1, anchor: 'quay', x: 1, y: 2 })
    expect(stampOf({ map: 'hub' })).toEqual({ map: 'hub' })
  })
})

/* ---- THE SHIP ---------------------------------------------------------------
 *
 * §80.6 asks for "a rule that never restores a ship at sea" and Q80.6.c's
 * recommendation on record is a dock, because a dock is a named anchor on a known
 * map and a point on open water is neither.
 */
describe('a run never restores a ship at sea', () => {
  const c: WorldComposition = {
    version: 1,
    home: { slot: 'home-island' },
    slots: [
      { map: 'hub', place: 'home-island', title: 'home', at: { x: 0, y: 0 }, footprint: { w: 10, h: 10 }, state: 'available', release: 100, berth: { x: 1, y: 1 } },
      { place: 'stadium', title: 'a rumour', at: { x: 500, y: 0 }, footprint: { w: 10, h: 10 }, state: 'rumour', release: 100 },
    ],
  }

  it('rebuilds her at the berth she was tied to', () => {
    const m = mooringFor({ berthedAt: 'home-island', legs: 3 }, c)
    expect(m.kind).toBe('berth')
    expect(m.slot?.map).toBe('hub')
  })

  it('sends her home when the berth is not on this composition any more', () => {
    const m = mooringFor({ berthedAt: 'a-slot-that-was-deleted', legs: 1 }, c)
    expect(m.kind).toBe('home')
    expect(m.slot?.map).toBe('hub')
  })

  it('refuses a slot that has no berth, because a rumour is not a dock', () => {
    expect(mooringFor({ berthedAt: 'stadium', legs: 1 }, c).kind).toBe('home')
  })

  it('has an answer for a run that never sailed', () => {
    expect(mooringFor(undefined, c).kind).toBe('home')
  })
})

/* ---- THE ONE-RUN-PER-PARTICIPANT GUARD (Q14) --------------------------------
 *
 * `SettingsPanel.tsx:183-195` renders "Restart adventure" behind a confirm and
 * sits OUTSIDE the `isCaptain()` block. Restart plus a new handle writes a second
 * participant row in the same class with an independently drawn arm, and no
 * analysis downstream can tell that the two rows are one person.
 */
describe('one run per participant', () => {
  it('lets a device that never joined a class start over', async () => {
    const save = await freshSave()
    save.beginAdventure()
    expect(save.canRestart().allowed).toBe(true)
  })

  it('records the first server-assigned participant the moment it is written', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.writeSave({ participantId: 'p_abc', classCode: 'REEF' })
    const g = save.runGuard()!
    expect(g.participantId).toBe('p_abc')
    expect(g.classCode).toBe('REEF')
    expect(g.restarts).toBe(0)
  })

  it('never lets a second join move the record', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.writeSave({ participantId: 'p_first', classCode: 'REEF' })
    save.writeSave({ participantId: 'p_second', classCode: 'REEF' })
    expect(save.runGuard()!.participantId).toBe('p_first')
  })

  it('does not lock a captain\'s demo machine', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.writeSave({ participantId: 'captain', classCode: 'REEF' })
    expect(save.runGuard()).toBeNull()
    expect(save.canRestart().allowed).toBe(true)
  })

  it('refuses the restart once the device is a participant, and names the class', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.writeSave({ participantId: 'p_abc', classCode: 'REEF' })
    const v = save.canRestart()
    expect(v.allowed).toBe(false)
    if (!v.allowed) expect(v.why).toContain('REEF')
    expect(save.restartRun().allowed).toBe(false)
    expect(save.loadSave()).not.toBeNull()          // the run is still there
  })

  it('survives the wipe, because a guard a restart erases is not a guard', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.writeSave({ participantId: 'p_abc', classCode: 'REEF' })
    save.clearSave()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(localStorage.getItem(GUARD)).not.toBeNull()
    expect(save.canRestart().allowed).toBe(false)
  })

  it('counts a forced restart, so a reset class can be asked how many', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.writeSave({ participantId: 'p_abc', classCode: 'REEF' })
    expect(save.restartRun(true).allowed).toBe(true)
    expect(save.runGuard()!.restarts).toBe(1)
    expect(save.loadSave()).toBeNull()
  })

  it('lets a teacher release the device outright', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.writeSave({ participantId: 'p_abc', classCode: 'REEF' })
    save.releaseGuard()
    expect(save.canRestart().allowed).toBe(true)
  })
})

/* ---- THE SAVE, HARDENED -----------------------------------------------------
 *
 * `localStorage.setItem` was bare and it throws: a school Chromebook with a full
 * profile raises QuotaExceededError and a district image with site data blocked
 * raises SecurityError. And `readRaw` was `s.v === 2 ? norm(s) : null`, so a save
 * from a newer deploy read as NO SAVE and the next Begin Adventure erased it.
 */
describe('the save has a real failure path and a forward-compatible read', () => {
  it('keeps the run playable and records the fault when the disk refuses', async () => {
    const save = await freshSave()
    save.beginAdventure()
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      const e = new Error('exceeded the quota'); e.name = 'QuotaExceededError'; throw e
    })
    try {
      const s = save.writeSave({ handle: 'Chromebook' })
      expect(spy).toHaveBeenCalled()
      expect(s.handle).toBe('Chromebook')            // the beat keeps playing
      expect(save.saveFault()?.kind).toBe('quota')
      expect(save.loadSave()!.handle).toBe('Chromebook')
    } finally { spy.mockRestore() }
    // and the next write that lands clears the fault
    save.writeSave({ handle: 'Landed' })
    expect(save.saveFault()).toBeNull()
  })

  it('reads a save written by a NEWER deploy instead of wiping it', async () => {
    const save = await freshSave()
    const s = save.beginAdventure()
    const raw = JSON.parse(localStorage.getItem(KEY)!)
    localStorage.setItem(KEY, JSON.stringify({ ...raw, v: 3, handle: 'FromTheFuture', somethingNew: 1 }))
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    expect(save.loadSave()!.handle).toBe('FromTheFuture')
    expect(save.saveHealth()).toBe('ok')
    void s
  })

  it('tells a damaged save apart from no save at all', async () => {
    const save = await freshSave()
    expect(save.saveHealth()).toBe('none')
    localStorage.setItem(KEY, '{ this is not json')
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    expect(save.loadSave()).toBeNull()
    expect(save.saveHealth()).toBe('damaged')
    // and the bytes are moved aside rather than written over by the next save
    expect(save.damagedSave()).toBe('{ this is not json')
    save.beginAdventure()
    expect(save.damagedSave()).toBe('{ this is not json')
  })

  it('records where the run was, with the versions it was written against', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.recordPosition({ map: 'hub', mapVersion: 7, worldVersion: 1, anchor: 'quay', x: 12, y: 34 })
    const w = save.loadSave()!.where!
    expect(w).toMatchObject({ map: 'hub', mapVersion: 7, worldVersion: 1, anchor: 'quay' })
    expect(w.at).toBeGreaterThan(0)
    expect(save.recordPosition({ map: '' })).toBeNull()
  })

  it('keeps the ship as a berth name and never as a point on the water', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.recordVessel({ berthedAt: 'home-island', legs: 2 })
    expect(save.loadSave()!.vessel).toEqual({ berthedAt: 'home-island', legs: 2 })
  })
})

/* ---- THE REFUSALS (N3) ------------------------------------------------------
 *
 * The season lock lived in a `.filter()` inside `Planner.tsx`'s menu. A filter is
 * not a refusal: it removed the programme rather than saying why, and
 * `assignSlot` never checked a season at all, so any caller that was not that
 * render could put a fall sport on a spring token.
 */
describe('one refusal string, and the verb enforces the same rule', () => {
  it('says why a fall sport is not available in spring, in the school\'s own fact', async () => {
    const save = await freshSave()
    save.beginAdventure()
    const s = save.loadSave()!
    const why = refuseSlot('football', 'Spring', s, 1)
    /* the name the roster prints, which is the placeholder while nothing has an
       island behind it (BRIEF-MAW-RAIL-3 B). A refusal that named the real sport
       would be the one surface still telling a student that Football is a thing
       he can nearly do. */
    expect(why).toContain(programmeById('football')!.name)
    expect(why).toContain('fall sport')
    expect(refuseSlot('football', 'Fall', s, 1)).toBeNull()
    expect(refuseSlot('atc', 'Spring', s, 1)).toBeNull()      // a club takes any season
  })

  it('refuses the write too, not only the menu', async () => {
    const save = await freshSave()
    save.beginAdventure()
    expect(save.assignSlot(1, 'Spring', 'football')).toBeNull()
    expect(save.loadSave()!.plans[1]?.slots.Spring).toBeUndefined()
    expect(save.loadSave()!.tokens).toContain('Spring')       // and the token is not eaten
  })

  it('refuses a slot pointing at nothing, which used to be written and waited on forever', async () => {
    const save = await freshSave()
    save.beginAdventure()
    expect(refuseSlot('a-typo', 'Fall', save.loadSave()!, 1)).toContain('a-typo')
    expect(save.assignSlot(1, 'Fall', 'a-typo')).toBeNull()
  })

  it('refuses two tokens on one programme, which buys a completion row twice', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.assignSlot(1, 'Fall', 'atc')
    const why = refuseSlot('atc', 'Winter', save.loadSave()!, 1)
    expect(why).toContain(programmeById('atc')!.name)
    expect(why).toContain('fall')
    expect(save.assignSlot(1, 'Winter', 'atc')).toBeNull()
  })

  it('says the year sheet is stamped rather than going quiet after the stamp', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.assignSlot(1, 'Fall', 'atc')
    save.pickClass(1, 'ap-human-geo'); save.pickClass(1, 'band')
    save.stampPlan(1, ['atc'])
    expect(refuseSlot('football', 'Fall', save.loadSave()!, 1)).toContain('stamped')
    expect(refuseClass('choir', save.loadSave()!, 1)).toContain('stamped')
  })

  it('states the two-pick limit out loud instead of hiding the button', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.pickClass(1, 'ap-human-geo'); save.pickClass(1, 'band')
    const why = refuseClass('choir', save.loadSave()!, 1)
    expect(why).toContain('Two focus classes')
    expect(save.pickClass(1, 'choir')).toBeNull()
    expect(save.loadSave()!.plans[1].classes).toHaveLength(2)
  })

  it('reads a sport\'s season through the resolver, because no sport carries the field', async () => {
    /* the sheet printed `a ${a.season?.toLowerCase()} sport` and NO SHIPPED SPORT
     * SETS `season`: it comes from the school's own `SPORT_SEASONS` table keyed by
     * id, so every sport on the menu read "a undefined sport". This is the
     * tripwire, not the render: as long as the field stays empty, anything reading
     * it directly is wrong. */
    const { seasonOf, PROGRAMMES } = await import('../roster/roster')
    const sports = PROGRAMMES.filter((p) => p.kind === 'sport')
    expect(sports.length).toBeGreaterThan(0)
    for (const p of sports) {
      expect(p.season, `${p.id} carries an inline season`).toBeUndefined()
      expect(seasonOf(p), `${p.id} has no season anywhere`).toBeTruthy()
    }
  })

  it('names a duplicate and a class the year cannot hold', async () => {
    const save = await freshSave()
    save.beginAdventure()
    save.pickClass(1, 'ap-human-geo')
    expect(refuseClass('ap-human-geo', save.loadSave()!, 1)).toContain('already')
    expect(refuseClass('ap-calc-ab', save.loadSave()!, 1)).toContain('year 1')
    expect(save.pickClass(1, 'ap-calc-ab')).toBeNull()
  })
})
