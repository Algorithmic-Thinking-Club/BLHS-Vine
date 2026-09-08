/* WHERE THE YEAR SENDS HIM, AND WHAT IT SAYS WHEN THERE IS NOWHERE LEFT.
 *
 * BRIEF-INTRO-FILM, Ash 2026-09-07, splits the introduction into two films and
 * makes this file the thing that decides when the second one starts. So two of
 * these claims are about a sentence a student reads and two are about a phase an
 * island reads, and both kinds get to fail here rather than in a browser.
 *
 * The phase clause matters more than it looks. `islands/panther-maw/island.py`
 * asks `get("phase")` and starts the ending when the answer is "yearbook"; if
 * that clause ever stops being reachable, the ending stops existing and nothing
 * anywhere says so. That is exactly how the `rising` phase died (see the long
 * comment in objective.ts), and the fix cost a session.
 */
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
    const o = objective.nextObjective(save.loadSave())!
    expect(o.phase).toBe('yearbook')
    /* AND THE PRINCIPAL IS WHO IT POINTS AT, because the ending is his film. A
     * student who stepped off it presses this desk to get back on. */
    expect(o.anchor).toBe('principal_desk')
  })

  /* AND THE SENTENCE OUT ON THE QUAY IS THE ONE THAT STARTS THE ENDING. Ash,
   * 2026-09-07: the closing film plays on entering the Maw with the year done
   * and never in the same sitting as the opening, so once the introduction has
   * handed the game over the only thing the panel can honestly say from the hub
   * is the way back in. "Sail home" was read on the hub, which is the same
   * island the mountain is in. */
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
    const o = objective.nextObjective(save.loadSave())
    expect(objective.objectiveLine(o, 'hub')).toBe('Go back into the mountain. The principal is waiting.')
    /* and on the Maw itself it is still the short one, because he is standing in
     * the room the man is in */
    expect(objective.objectiveLine(o, 'panther-maw')).toBe('The principal is waiting.')
  })
})

describe('the last sentence of the session', () => {
  /* BRIEF-INTRO-FILM section 4: *"the objective bar reads 'Explore. Talk to
   * anyone. Open the Guide.' and the game is his. No 'Year two' wording
   * anywhere."* The island says the same words at the handover and its word is
   * dropped when the bars come down, so this is what the panel falls back to for
   * the rest of the session and the two must not differ by a character. */
  it('hands the game over and promises nothing about next time', async () => {
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
    expect(o.say).toBe('Explore. Talk to anyone. Open the Guide.')
    expect(o.say).not.toMatch(/year two/i)
    expect(o.away).toBe(o.say)
    /* AND NOTHING ON ANY MAP LIGHTS. The anchor is empty on purpose: the room is
     * his and there is no one thing he is being sent to. */
    expect(o.anchor).toBe('')
  })
})
