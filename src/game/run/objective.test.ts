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

  /* the one the closing film hangs on: everything the year owes is done and the page has not turned, so the ending is what happens next, and `year_is_done` in islands/panther-maw/founding.py tests for exactly this string */
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
    /* and the picked class is sat: the year is not done until every picked thing with play behind it is done, and a class is the only such thing in year one today */
    save.recordGrade({
      id: 'class:ap-human-geo', title: 'AP Human Geography', kind: 'class',
      credit: 0.5, grade: 4, year: 1, season: 'Fall',
    })
    const o = objective.nextObjective(save.loadSave())!
    expect(o.phase).toBe('yearbook')
    /* and the principal is who it points at, because the ending is the principal's film: a student who stepped off it presses this desk to get back on */
    expect(o.role).toBe('principal')
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
    /* and inside the Maw it says the other half of the same fact, because 'Go back to the Maw' over a student standing in the Maw asks for a thing already done, and that is the common road now: the year closes at the chart table ten feet from the person the arrow points at */
    expect(objective.objectiveLine(o, 'panther-maw')).toBe('Find the principal. Year one is done.')
  })
})

describe('a closed year asks for nothing', () => {
  /* a closed year asks nothing, since the only moment with the page turned is the ending */
  it('says nothing at all once the page has turned', async () => {
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
    expect(objective.nextObjective(save.loadSave())).toBeNull()
    /* an empty objective draws no bar at all, because `hud/Objective.tsx` returns null on an empty sentence */
    expect(objective.objectiveLine(null, 'panther-maw')).toBe('')
  })

  /* the next year opens the whole thing back up, which is what the title's 'Start year 2' does: `endYear` bumps the year and this stops being closed */
  it('and asks again the moment the next year starts', async () => {
    const { save, objective } = await fresh()
    started(save)
    save.setFlag(objective.FOUNDING_FLAG)
    save.setFlag('vignette:y1')
    save.setFlag('yearbook:y1')
    expect(objective.nextObjective(save.loadSave())).toBeNull()
    save.endYear()
    const o = objective.nextObjective(save.loadSave())
    expect(o, 'year two opens with nothing lit').not.toBeNull()
    expect(o!.phase).toBe('vignette')
  })
})
