/* the half of the intent vocabulary that needs no map: the save, the ui and the logger */
import type { IntentEngine, RunPath } from '../vine/intents'
import type { SessionMode } from '../vine/contract'
import { requestBeat, requestUi, requestUiAndWait } from './ui-bus'
import { NotBuilt } from '../vine/intents'
import { track } from './telemetry'
import {
  collectFact, collectSticker, grantBadge, islandLedgerId, loadSave, recordCompletion,
  recordGrade, setFlag, setIslandState,
} from './save'
import { cordsOf, gpaOf } from './progress'
import { grant } from './grant'
import { beatPassedIn, coreBeatId, hasCoreBeat } from './beats/beats'
import { programmeById } from './roster/roster'
import { shownName } from './roster/placeholders'
import { classById } from './planner/catalog'
import { letterOf } from './progress'
import { nextObjective } from './run/objective'
import { play as playSfx } from './audio'
import { setCinema } from './stage/cinema'
import { setObjectiveSaid } from './hud/objective-bus'
import { currentSkin } from './ui/skin'

export const engine: IntentEngine = {
  /* opens a panel, and refuses when nothing is mounted to hear it */
  openUi(ui, wait) {
    /* AND IT CAN COME BACK WHEN THE PANEL SHUTS. `requestUiAndWait` answers false
     * on exactly the same condition `requestUi` does, so the refusal below reads
     * the same either way and there is one sentence for one failure. */
    if (wait) {
      const p = requestUiAndWait(ui)
      if (p) return p
    } else if (requestUi(ui)) return
    throw new NotBuilt('open', `nothing is mounted to open "${ui}" here. `
      + 'A panel needs the world HUD, which does not mount until a run has started.')
  },

  playBeat(beat, plain) {
    return requestBeat(beat, plain)
  },

  /* the closed list of questions an island can ask about the run */
  read(path: RunPath): unknown {
    const s = loadSave()
    switch (path) {
      case 'year': return s?.year ?? 1
      case 'gpa': return s ? gpaOf(s) : 0
      case 'tokens': return s?.tokens.length ?? 0
      case 'cords': return s ? cordsOf(s).filter((c) => c.earned).map((c) => c.id) : []
      /* the whole cord board, the same rows the tracker gets */
      case 'cord_board': return s ? cordsOf(s) : []
      /* what is on the wall. Two lists rather than one, because a sticker and a
       * badge are different things everywhere else in the save and flattening
       * them here would be this file inventing a category. */
      case 'trophies': return s
        ? { stickers: [...s.stickers], badges: [...s.badges] }
        : { stickers: [], badges: [] }
      /* the beat this year still owes, or null */
      /* ---- THE HEARTH OFFERS IT UNTIL IT IS PASSED (Ash, 2026-09-09) -----
       *
       * *"I purposefully failed advisory... but once i left the advisory panel
       * and came back, it says 'advisory is done for this year'. Obviously it
       * should allow the user to retake, only if they havent passed."*
       *
       * This asked `beatDone`, which is "is there a row", so an F answered null
       * and the fire told him it was banked. The year would not close either, so
       * the run was stuck between a gate that wanted a pass and the only door to
       * one saying come back next year. */
      case 'advisory': return s && hasCoreBeat(s.year) && !beatPassedIn(s, s.year)
        ? coreBeatId(s.year)
        : null
      case 'flags': return s ? [...s.flags] : []
      /* whether this year's plan has been stamped */
      case 'planned': return !!(s && s.plans[s.year]?.stamped)
      case 'islands': return s ? { ...s.islands } : {}
      /* the two that are honestly absent. A player with no run has no name and
       * has not graduated, and neither is a number an island can do arithmetic
       * on, so null is the truthful answer rather than an invented one. */
      case 'handle': return s?.handle ?? null
      case 'graduated': return !!s?.graduated
      case 'mode': return engine.mode()
      /* which phase of the year the run is in, asked of the sequencer */
      case 'phase': return nextObjective(s)?.phase ?? null
      /* the classes, seasons and grades the student actually picked this year */
      case 'picks': {
        if (!s) return { classes: [], seasons: [], graded: [], gpa: null }
        const plan = s.plans[s.year] ?? { slots: {}, classes: [], stamped: false }
        return {
          classes: plan.classes.map((id) => ({ id, name: classById(id)?.name ?? id })),
          seasons: Object.entries(plan.slots)
            .filter(([, id]) => !!id)
            .map(([season, id]) => ({
              season, id,
              name: shownName(id as string, programmeById(id as string)?.name ?? (id as string)),
            })),
          graded: s.ledger.filter((r) => r.year === s.year)
            .map((r) => ({ title: r.title, grade: letterOf(r.grade), kind: r.kind })),
          gpa: gpaOf(s),
        }
      }
    }
  },

  /* remembers a flag, and refuses when there is no run to remember it in */
  setFlag(flag) {
    if (!loadSave()) throw new NotBuilt('set_flag', `there is no run to remember "${flag}" in`)
    setFlag(flag)
  },

  /* one call for everything an island can grant: a grade, a completion, a sticker or a badge */
  award(a) {
    /* nothing is written unless there is a run, so the writes cannot half happen */
    if (!loadSave())
      throw new NotBuilt('award', 'there is no run to write this onto. '
        + 'Start a run first, or use the standalone harness only for logic that does not score.')

    /* the student is told on screen, once, for the whole grant */
    const before = loadSave()
    writeAward(a)
    grant(before, loadSave(), saidOf(a))
  },

  log(event, data) {
    track(event, data)
  },

  /* waits, in any scene, with or without a map loaded */
  wait(ms) {
    return new Promise<void>((r) => setTimeout(r, ms))
  },

  /* plays a sound effect by name */
  sound(name, gain) {
    playSfx(name, gain)
  },

  /* turns the movie frame on or off across every surface */
  movie(on) {
    setCinema(on)
    /* the bars coming down hand the objective line back to the year */
    if (!on) setObjectiveSaid(null)
  },

  /* WHAT THE STUDENT IS SUPPOSED TO BE DOING, said by whoever is directing.
   * BRIEF-MAW-RAIL-3 A. It is chrome around the window, so it needs no map and
   * lives here rather than on the world. */
  objective(text) {
    setObjectiveSaid(text)
  },

  /* the study arm this participant was assigned at join. A grape never chooses
   * it; it can only force plain for a specific activity (see intents.ts).
   *
   * The skin is read ONLY when there is no arm, which is a run nobody joined and
   * which produces no study row: that case is `?skin=plain`, the review door, and
   * without it the whole page went plain while every beat a member's island
   * played stayed in game rendering. It cannot mislabel a real participant,
   * because the study log's arm comes off the Logger's own config. */
  mode(): SessionMode {
    const arm = loadSave()?.arm
    if (arm === 'plain' || arm === 'game') return arm
    return currentSkin() === 'plain' ? 'plain' : 'game'
  },
}

/* the writes award makes, lifted out so the answer can wrap them */
type AwardArgs = Parameters<IntentEngine['award']>[0]

function writeAward(a: AwardArgs) {
    if (a.fact) collectFact(a.fact)
    if (a.sticker) collectSticker(a.sticker)
    if (a.badge) grantBadge(a.badge)

    const s = loadSave()
    if (!s) return
    const year = s.year
    const g = programmeById(a.programme)

    /* a programme nobody is on the roster for is said out loud and the grade is kept */
    if (a.programme && !g) {
      console.warn(`[award] no programme named "${a.programme}" on the roster; the grade is kept and the island is not marked finished`)
      track('award_unknown_programme', { programme: a.programme })
    }

    /* naming a programme with no grade is how a member says they finished it */
    if (typeof a.grade !== 'number') {
      if (g) {
        recordCompletion(g.id, 0, g.rankTrack ?? undefined)
        setIslandState(g.id, 'completed')
        track('programme_completed', { programme: g.id, place: g.place, grade: null, year })
      }
      return
    }
    /* an unknown programme still lands as an anonymous row carrying the name it was given */
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
      /* completion goes on the wire as well as into the save */
      track('programme_completed', { programme: g.id, place: g.place, grade: a.grade, year })
    }
}

/* what the card says, in the words a fourteen year old reads */
function saidOf(a: AwardArgs): { what: string; detail?: string } {
  const g = programmeById(a.programme)
  if (g) {
    return {
      what: `${g.name} is done.`,
      detail: typeof a.grade === 'number' ? `It goes on your transcript.` : undefined,
    }
  }
  if (a.badge) return { what: 'You earned a badge.', detail: a.badge }
  /* "the wall" is §11.9's trophy wall and it is not built, so a student who
   * earned a sticker was sent to a place the game does not have. */
  if (a.sticker) return { what: 'You earned a badge.', detail: a.sticker }
  if (a.fact) return { what: 'That went in the Handbook.' }
  return { what: 'That counted.' }
}
