/* where the year sends the player, and the phase an island reads off it */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function fresh() {
  vi.resetModules()
  const save = await import('../save')
  const objective = await import('./objective')
  return { save, objective }
}

beforeEach(() => { localStorage.clear() })

/** a run standing at the tunnel with nothing done yet */
const started = (save: Awaited<ReturnType<typeof fresh>>['save']) => {
  save.beginAdventure()
  save.writeSave({ introDone: true })
}

describe('the phase an island reads', () => {
  it('is "founding" before the principal has been met', async () => {
    const { save, objective } = await fresh()
    started(save)
    expect(objective.nextObjective(save.loadSave())!.phase).toBe('founding')
  })

  it('is "plan" once the founding is written and the sheet is not stamped', async () => {
    const { save, objective } = await fresh()
    started(save)
    save.setFlag(objective.FOUNDING_FLAG)
    save.setFlag('vignette:y1')
    expect(objective.nextObjective(save.loadSave())!.phase).toBe('plan')
  })

  it('is "core" with the sheet stamped and Advisory not sat', async () => {
    const { save, objective } = await fresh()
    started(save)
    save.setFlag(objective.FOUNDING_FLAG)
    save.setFlag('vignette:y1')
    save.pickClass(1, 'ap-human-geo')
    save.stampPlan(1)
    expect(objective.nextObjective(save.loadSave())!.phase).toBe('core')
  })

  /* THE ONE THE CLOSING FILM HANGS ON. Everything the year owes is done and the
   * page has not turned, so the ending is what happens next. `islands/
   * panther-maw/founding.py`'s `year_is_done` tests for exactly this string. */
  it('is "yearbook" when the year has nothing left owing', async () => {
    const { save, objective } = await fresh()
    started(save)
    save.setFlag(objective.FOUNDING_FLAG)
    save.setFlag('vignette:y1')
    save.pickClass(1, 'ap-human-geo')
    save.stampPlan(1)
    save.recordGrade({
      id: 'core:y1', title: 'POWER, Mondays, and joining a club', kind: 'core',
      credit: 0.5, grade: 4, year: 1, season: 'Fall',
    })
    /* AND THE CLASS HE PICKED IS SAT. Ash, 2026-09-08: the year is not done until
     * every picked thing with play behind it is, and a class is the only such
     * thing in year one today. */
    save.recordGrade({
      id: 'class:ap-human-geo', title: 'AP Human Geography', kind: 'class',
      credit: 0.5, grade: 4, year: 1, season: 'Fall',
    })
    const o = objective.nextObjective(save.loadSave())!
    expect(o.phase).toBe('yearbook')
    /* AND THE PRINCIPAL IS WHO IT POINTS AT, because the ending is his film. A
     * student who stepped off it presses this desk to get back on. */
    expect(o.anchor).toBe('principal_desk')
  })

  /* the sentence out on the quay is the one that starts the ending */
  it('and it sends him back in through the tunnel, not out to sea', async () => {
    const { save, objective } = await fresh()
    started(save)
    save.setFlag(objective.FOUNDING_FLAG)
    save.setFlag('vignette:y1')
    save.pickClass(1, 'ap-human-geo')
    save.stampPlan(1)
    save.recordGrade({
      id: 'core:y1', title: 'POWER, Mondays, and joining a club', kind: 'core',
      credit: 0.5, grade: 4, year: 1, season: 'Fall',
    })
    save.recordGrade({
      id: 'class:ap-human-geo', title: 'AP Human Geography', kind: 'class',
      credit: 0.5, grade: 4, year: 1, season: 'Fall',
    })
    const o = objective.nextObjective(save.loadSave())
    expect(objective.objectiveLine(o, 'hub')).toBe('Go back to the Maw. The principal is waiting.')
    /* ONE SENTENCE ON BOTH SIDES OF THE DOOR (Ash, 2026-09-08 item 6). It used
     * to shorten on the Maw's own map, on the reasoning that a student standing
     * in the room does not need telling which room. He does: the man is one of
     * six people in a hall and "the principal is waiting" is the half that says
     * which. */
    expect(objective.objectiveLine(o, 'panther-maw')).toBe('Go back to the Maw. The principal is waiting.')
  })
})

describe('the last sentence of the session', () => {
  /* the bar says the year is over once the yearbook page has turned */
  it('says the year is over and promises nothing about next time', async () => {
    const { save, objective } = await fresh()
    started(save)
    save.setFlag(objective.FOUNDING_FLAG)
    save.setFlag('vignette:y1')
    save.pickClass(1, 'ap-human-geo')
    save.stampPlan(1)
    save.recordGrade({
      id: 'core:y1', title: 'POWER, Mondays, and joining a club', kind: 'core',
      credit: 0.5, grade: 4, year: 1, season: 'Fall',
    })
    save.setFlag('yearbook:y1')
    const o = objective.nextObjective(save.loadSave())!
    expect(o.phase).toBe('done')
    /* BRIEF-MAW-NOW item 3: this clause is only true once the yearbook page has
     * turned, so it must not still be reading the sentence the principal handed
     * the room over with an hour earlier. */
    expect(o.say).toBe('Year one is done. Look around.')
    expect(o.say).not.toBe('Explore. Talk to anyone. Open the Guide.')
    expect(o.say).not.toMatch(/year two/i)
    expect(o.away).toBe(o.say)
    /* AND NOTHING ON ANY MAP LIGHTS. The anchor is empty on purpose: the room is
     * his and there is no one thing he is being sent to. */
    expect(o.anchor).toBe('')
  })
})
