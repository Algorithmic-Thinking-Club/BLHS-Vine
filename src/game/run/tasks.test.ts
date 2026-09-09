/* the tests that keep the task sheet and the objective arrow saying the same thing */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function fresh() {
  vi.resetModules()
  const save = await import('../save')
  const tasks = await import('./tasks')
  const objective = await import('./objective')
  return { save, tasks, objective }
}

/* THE ROW OR A FAILURE. `.find` is `T | undefined` and every assertion below is
 * about a row that must exist, so a missing one should fail by name here rather
 * than as ten "possibly undefined" complaints from the compiler. */
const row = (list: any[], id: string) => {
  const hit = list.find((t) => t.id === id)
  if (!hit) throw new Error(`no task called "${id}" in ${JSON.stringify(list.map((t) => t.id))}`)
  return hit
}

const started = (save: any) => {
  save.beginAdventure()
  save.writeSave({ introDone: true })
}

describe('the year as a list', () => {
  beforeEach(() => localStorage.clear())

  it('is empty when there is no run, because there is no year to list', async () => {
    const { tasks } = await fresh()
    expect(tasks.tasksOf(null)).toEqual([])
  })

  it('opens on a cold year one with the schedule first and nothing ticked', async () => {
    const { save, tasks } = await fresh()
    started(save)
    const list = tasks.tasksOf(save.loadSave())
    expect(list.map((t: any) => t.id)).toEqual(['plan', 'core', 'end'])
    expect(list.every((t: any) => !t.done)).toBe(true)
    /* every unfinished row says WHERE, or the sheet is five nouns a lost student
     * still cannot find */
    expect(list.every((t: any) => !!t.note)).toBe(true)
  })

  it('never says Fall, Winter or Spring', async () => {
    const { save, tasks } = await fresh()
    started(save)
    save.pickClass(1, 'ap-human-geo')
    save.pickClass(1, 'spanish-1')
    save.assignSlot(1, 'Fall', 'football')
    save.stampPlan(1, ['football'])
    const words = JSON.stringify(tasks.tasksOf(save.loadSave()))
    /* BRIEF-CLOSE-THE-LOOP section 4: the season model stays in the code and off
     * every screen until a real sport with a season exists. A voyage row names
     * the island; which column the token sat in is bookkeeping. */
    expect(words).not.toMatch(/Fall|Winter|Spring/)
  })

  it('grows a row for each class on the sheet and each island bought', async () => {
    const { save, tasks } = await fresh()
    started(save)
    save.pickClass(1, 'ap-human-geo')
    save.assignSlot(1, 'Fall', 'football')
    save.stampPlan(1, ['football'])
    const list = tasks.tasksOf(save.loadSave())
    expect(list.map((t: any) => t.id))
      .toEqual(['plan', 'core', 'class:ap-human-geo', 'voyage:football', 'end'])
    expect(row(list, 'plan').done).toBe(true)
  })

  it('marks an island nobody has built as barred, not as failed', async () => {
    const { save, tasks } = await fresh()
    started(save)
    save.assignSlot(1, 'Fall', 'football')
    save.stampPlan(1, ['football'])
    const hit = row(tasks.tasksOf(save.loadSave()), 'voyage:football')
    expect(hit.barred).toBe(true)
    expect(hit.done).toBe(false)
    expect(hit.note).toMatch(/nobody has built/i)
  })

  it('leaves a barred row out of the count, so a finished year reads finished', async () => {
    const { save, tasks } = await fresh()
    started(save)
    save.setFlag('maw:founding'); save.setFlag('vignette:y1')
    save.pickClass(1, 'ap-human-geo'); save.pickClass(1, 'spanish-1')
    save.assignSlot(1, 'Fall', 'football')
    save.stampPlan(1, ['football'])
    save.recordGrade({
      id: 'core:y1', title: 'Advisory', kind: 'core', credit: 0.5,
      grade: 4, year: 1, season: 'Fall',
    })
    save.setFlag('yearbook:y1')
    const list = tasks.tasksOf(save.loadSave())
    const { done, total } = tasks.tasksDone(list)
    /* six rows, five of them counted: an island nobody has built is left out */
    expect(list).toHaveLength(6)
    expect(total).toBe(5)
    expect(done).toBe(3)
  })

  it('agrees with the arrow about what is still owed', async () => {
    const { save, tasks, objective } = await fresh()
    started(save)
    save.setFlag('maw:founding'); save.setFlag('vignette:y1')
    /* the arrow says the schedule; so does the sheet */
    expect(objective.nextObjective(save.loadSave())!.phase).toBe('plan')
    expect(row(tasks.tasksOf(save.loadSave()), 'plan').done).toBe(false)

    save.pickClass(1, 'ap-human-geo'); save.pickClass(1, 'spanish-1')
    save.stampPlan(1, [])
    /* the arrow moves to the fire; the schedule ticks and Advisory does not */
    expect(objective.nextObjective(save.loadSave())!.phase).toBe('core')
    const mid = tasks.tasksOf(save.loadSave())
    expect(row(mid, 'plan').done).toBe(true)
    expect(row(mid, 'core').done).toBe(false)

    save.recordGrade({
      id: 'core:y1', title: 'Advisory', kind: 'core', credit: 0.5,
      grade: 4, year: 1, season: 'Fall',
    })
    /* THE MIDDLE OF THE YEAR IS THE TWO CLASSES (Ash, 2026-09-08), so Advisory
     * being sat hands the arrow to the first of them rather than to the ending */
    expect(objective.nextObjective(save.loadSave())!.phase).toBe('class')
    for (const id of ['ap-human-geo', 'spanish-1']) {
      save.recordGrade({
        id: `class:${id}`, title: id, kind: 'class', credit: 0.5, grade: 4, year: 1, season: 'Fall',
      })
    }
    /* and with both sat and nothing to sail to, the arrow goes to the principal
     * and the last row stops being barred on the same save */
    expect(objective.nextObjective(save.loadSave())!.phase).toBe('yearbook')
    const late = tasks.tasksOf(save.loadSave())
    expect(row(late, 'core').done).toBe(true)
    expect(row(late, 'end').barred).toBeUndefined()
    expect(row(late, 'end').note).toMatch(/principal is waiting/i)
  })
})
