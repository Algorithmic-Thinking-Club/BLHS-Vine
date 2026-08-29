/* THE ENGINE HALF OF THE VOCABULARY.
 *
 * src/vine/intents.ts splits an intent into two: the ones that need a map
 * (say, walk_to, enter) and the ones that do not (open, play, get, award, log).
 * This is the second half. It is built once at module scope rather than per
 * scene, because the save file and the logger do not change when the camera
 * does, and it is what lets a grape's logic be exercised with no map at all.
 */
import type { IntentEngine, RunPath } from '../vine/intents'
import type { SessionMode } from '../vine/contract'
import { requestBeat, requestUi } from './ui-bus'
import { track } from './telemetry'
import {
  collectFact, collectSticker, grantBadge, islandLedgerId, loadSave, recordCompletion,
  recordGrade, setFlag, setIslandState,
} from './save'
import { cordsOf, gpaOf } from './progress'
import { programmeById } from './roster/roster'

export const engine: IntentEngine = {
  openUi(ui) {
    requestUi(ui)
  },

  playBeat(beat, plain) {
    return requestBeat(beat, plain)
  },

  /* the questions progress.ts can actually answer, and no others. A closed list
   * is deliberate: a grape that could ask for an arbitrary path would be a grape
   * that reaches into the save's shape, and then the save can never change. */
  read(path: RunPath): unknown {
    const s = loadSave()
    if (!s) return null
    switch (path) {
      case 'year': return s.year
      case 'gpa': return gpaOf(s)
      case 'tokens': return s.tokens.length
      case 'cords': return cordsOf(s).filter((c) => c.earned).map((c) => c.id)
      case 'flags': return [...s.flags]
      case 'islands': return { ...s.islands }
      case 'handle': return s.handle
      case 'graduated': return !!s.graduated
      case 'mode': return engine.mode()
    }
  },

  setFlag(flag) {
    setFlag(flag)
  },

  /* one call, because a station awarding a grade and a sticker in the same beat
   * should not have to know which of four functions each one lives behind.
   * Every one of these is idempotent on the save side already.
   *
   * ONE INTENT COMPLETES AN ISLAND AND RECORDS ITS GRADE TOGETHER (M2). Naming a
   * programme is what turns a bare number into a transcript row that says what it
   * was, weighs what an island weighs, carries the cord tags the programme
   * carries, counts a year on that programme's ladder, and marks the programme
   * finished in this year and no other. */
  award(a) {
    if (a.fact) collectFact(a.fact)
    if (a.sticker) collectSticker(a.sticker)
    if (a.badge) grantBadge(a.badge)
    if (typeof a.grade !== 'number') return

    const s = loadSave()
    if (!s) return
    const year = s.year
    const g = programmeById(a.programme)
    /* an unknown programme is not refused here: `performIntent` would turn a
     * throw into a refusal at the member's own line, and a grade that has been
     * earned should not be lost to a typo in the name of strictness. It lands as
     * the anonymous row it always was, and the name it was given is on it so the
     * author can see what they asked for. */
    const tags = [...(g?.tags ?? []), ...(a.tags ?? [])]
    const entry = g
      ? {
        id: islandLedgerId(g.id, year), title: g.name, kind: 'island' as const, credit: 1,
        ...(g.rankTrack ? { rank: g.rankTrack } : {}),
      }
      : {
        /* stable in what it is about and in the year, so replaying it updates one
         * row. A timestamp made every replay a new row and every replay another
         * half credit of weight on the GPA. */
        id: `award:y${year}:${a.programme ?? a.sticker ?? a.badge ?? a.fact ?? 'unnamed'}`,
        title: a.programme ? `Awarded (${a.programme})` : 'Awarded',
        kind: 'core' as const,
        credit: 0.5,
      }

    recordGrade({
      ...entry,
      grade: a.grade,
      year,
      season: s.season,
      ...(tags.length ? { tags } : {}),
    })
    if (g) {
      recordCompletion(g.id, a.grade, g.rankTrack ?? undefined)
      setIslandState(g.id, 'completed')
      /* the completion half of the split, on the wire as well as in the save.
       * Exposure is per place and completion is per programme, and the export has
       * to carry both as separate counts or the awareness measure and the
       * learning measure blur into each other with nothing to unpick them. */
      track('programme_completed', { programme: g.id, place: g.place, grade: a.grade, year })
    }
  },

  log(event, data) {
    track(event, data)
  },

  /* the study arm this participant was assigned at join. A grape never chooses
   * it; it can only force plain for a specific activity (see intents.ts). */
  mode(): SessionMode {
    return loadSave()?.arm === 'plain' ? 'plain' : 'game'
  },
}
