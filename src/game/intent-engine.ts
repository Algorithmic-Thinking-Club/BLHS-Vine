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
  collectFact, collectSticker, grantBadge, loadSave, recordGrade, setFlag,
} from './save'
import { cordsOf, gpaOf } from './progress'

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
   * Every one of these is idempotent on the save side already. */
  award(a) {
    if (a.fact) collectFact(a.fact)
    if (a.sticker) collectSticker(a.sticker)
    if (a.badge) grantBadge(a.badge)
    if (typeof a.grade === 'number') {
      const s = loadSave()
      /* a grade with no beat behind it still has to land somewhere the GPA maths
       * can see, so it goes on the ledger as its own entry rather than being
       * dropped for want of a title */
      recordGrade({
        id: `award:${Date.now().toString(36)}`,
        title: 'Awarded',
        kind: 'core',
        credit: 0.5,
        grade: a.grade,
        year: s?.year ?? 1,
        season: s?.season ?? 'Fall',
      })
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
