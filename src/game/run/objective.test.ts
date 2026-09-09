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
    /* AND INSIDE THE MAW IT SAYS THE OTHER HALF OF THE SAME FACT. "Go back to
     * the Maw" over a student standing in the Maw is the game telling him to do
     * a thing he has already done, and that is the common road now: he presses
     * Go on his last pick at the chart table and the year closes with him ten
     * feet from the man the arrow is already pointing at. */
    expect(objective.objectiveLine(o, 'panther-maw')).toBe('Find the principal. Year one is done.')
  })
})

describe('a closed year asks for nothing', () => {
  /* ---- ASH, 2026-09-09 ---------------------------------------------------
   *
   * It used to answer "Year one is done. Look around." once the page had turned.
   * That sentence had exactly one place left to draw, because the only in-world
   * moment with the page already turned IS the closing film: it sat across the
   * top of the congratulation, the Sail Home button and the ship leaving. Seen
   * on the live deploy in `sail-home-live/2-sail-home.png`.
   *
   * It was not true either. There is nothing to look around at: the film has the
   * controls and what comes next is the title with the next year on it. */
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
    /* and an empty objective draws no bar at all, which is what the panel does
     * with a null: `hud/Objective.tsx` returns null on an empty sentence */
    expect(objective.objectiveLine(null, 'panther-maw')).toBe('')
  })

  /* and the next year opens the whole thing back up, which is what the title's
   * "Start year 2" does: `endYear` bumps the year and this stops being closed */
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
