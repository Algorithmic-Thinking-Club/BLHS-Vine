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
import { play as playSfx } from './audio'

export const engine: IntentEngine = {
  openUi(ui) {
    requestUi(ui)
  },

  playBeat(beat, plain) {
    return requestBeat(beat, plain)
  },

  /* the questions progress.ts can actually answer, and no others. A closed list
   * is deliberate: a grape that could ask for an arbitrary path would be a grape
   * that reaches into the save's shape, and then the save can never change.
   *
   * EVERY PATH ANSWERS IN ITS OWN TYPE, WITH OR WITHOUT A SAVE. This used to
   * return null for all nine the moment there was no run, and the damage was
   * subtle in both directions. `mode` came back null while `engine.mode()` said
   * 'game', so an island could not find out which half of the class it was
   * talking to and every unjoined player silently read as neither arm. `year`
   * came back null, so `get("year") + 1` threw inside the MEMBER'S own island
   * over a state the engine created. And the empty ones, `flags` and `cords` and
   * `islands`, came back as something you cannot iterate.
   *
   * A run that has not started is a real state, not a missing one. It is year
   * one, no tokens spent, nothing earned, and whatever arm the mode says. */
  read(path: RunPath): unknown {
    const s = loadSave()
    switch (path) {
      case 'year': return s?.year ?? 1
      case 'gpa': return s ? gpaOf(s) : 0
      case 'tokens': return s?.tokens.length ?? 0
      case 'cords': return s ? cordsOf(s).filter((c) => c.earned).map((c) => c.id) : []
      case 'flags': return s ? [...s.flags] : []
      case 'islands': return s ? { ...s.islands } : {}
      /* the two that are honestly absent. A player with no run has no name and
       * has not graduated, and neither is a number an island can do arithmetic
       * on, so null is the truthful answer rather than an invented one. */
      case 'handle': return s?.handle ?? null
      case 'graduated': return !!s?.graduated
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

    const s = loadSave()
    if (!s) return
    const year = s.year
    const g = programmeById(a.programme)

    /* A NAME NOBODY IS ON THE ROSTER FOR IS SAID OUT LOUD. The grade is still
     * kept, because a grade that has been earned should not be lost to a typo,
     * and the row carries the name that was asked for. What was missing was any
     * way at all for the author to find out: no warning, no event, no refusal,
     * and an island that silently never completes while the study's own dependent
     * variable reads zero programmes finished. */
    if (a.programme && !g) {
      console.warn(`[award] no programme named "${a.programme}" on the roster; the grade is kept and the island is not marked finished`)
      track('award_unknown_programme', { programme: a.programme })
    }

    /* NAMING A PROGRAMME AND NO GRADE IS HOW A MEMBER SAYS THEY FINISHED IT, and
     * it used to return before anything happened and still answer ok: no ledger
     * row, no completion, no event, and an island the planner never sees close.
     * Completion is a result and a grade is a number, and only one of them is
     * required to have happened. */
    if (typeof a.grade !== 'number') {
      if (g) {
        recordCompletion(g.id, 0, g.rankTrack ?? undefined)
        setIslandState(g.id, 'completed')
        track('programme_completed', { programme: g.id, place: g.place, grade: null, year })
      }
      return
    }
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

  /* A PAUSE IS A PAUSE IN ANY SCENE, which is why it is here and not on the
   * world. A member testing an island's pacing in the standalone harness, with no
   * painting loaded at all, should get the same rhythm they will get on the map;
   * putting this on `IntentWorld` would have made timing the one thing that could
   * not be tried without a map.
   *
   * The ceiling is applied in `performIntent` rather than here, because that is
   * where the refusal for a negative number lives and one word should not be
   * validated in two places. */
  wait(ms) {
    return new Promise<void>((r) => setTimeout(r, ms))
  },

  /* SOUND IS GLOBAL AND SO IS THIS. There is one pair of speakers whichever scene
   * is up, so an effect does not belong to a map, and an unknown name throws
   * `NotBuilt` out of the library, which `performIntent` turns into a refusal at
   * the member's own line. */
  sound(name, gain) {
    playSfx(name, gain)
  },

  /* the study arm this participant was assigned at join. A grape never chooses
   * it; it can only force plain for a specific activity (see intents.ts). */
  mode(): SessionMode {
    return loadSave()?.arm === 'plain' ? 'plain' : 'game'
  },
}
