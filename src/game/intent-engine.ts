/* the half of the intent vocabulary that needs no map: the save, the ui and the logger */
import type { IntentEngine, RunPath } from '../vine/intents'
import type { SessionMode } from '../vine/contract'
import { requestBeat, requestUi, requestUiAndWait } from './ui-bus'
import { NotBuilt } from '../vine/intents'
import { track } from './telemetry'
import {
  collectFact, collectSticker, grantBadge, islandLedgerId, loadSave, markTaskDone,
  recordCompletion, recordGrade, setFlag, setIslandState,
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
import { islandTaskList, islandTaskTicked, setIslandTasks } from './hud/island-tasks'
import { currentSkin } from './ui/skin'

/* EVERY PATH THE RUN CAN ANSWER, written as a `Record<RunPath, true>` and not an
 * array on purpose: widening RunPath without adding it here is a type error, so
 * the refusal in `read` can never read out a stale vocabulary. An array would
 * have gone quietly out of date the first time somebody added a path. */
const READABLE_PATHS: Record<RunPath, true> = {
  year: true, gpa: true, tokens: true, cords: true, flags: true, islands: true,
  handle: true, mode: true, graduated: true, cord_board: true, trophies: true,
  phase: true, picks: true, advisory: true, planned: true, rank: true,
}
const READABLE = Object.keys(READABLE_PATHS).sort()

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

  playBeat(beat, plain, decl) {
    return requestBeat(beat, plain, decl)
  },

  /* ---- WHAT THIS ISLAND HAS BEEN FINISHED AT BEFORE ---------------------
   *
   * Ash: *"we can do a club again over years? is it meant to play different stuff?"*
   * It is, and an island had no way to find out which time this was. Everything here
   * is already in the save and none of it was reachable from Python.
   *
   * `taken` counts EARLIER completions only, so on the run that is being played it
   * answers "how many times before this one". A first year gets 0 and can say hello;
   * a second gets 1 and can say welcome back and mean it. */
  rankOf(programme: string | null) {
    const s = loadSave()
    const rows = (s?.completions ?? []).filter((c) => c.programme === programme)
    const years = [...new Set(rows.map((c) => c.year))].sort((a, b) => a - b)
    const graded = rows.map((c) => c.grade).filter((g): g is number => typeof g === 'number')
    return {
      taken: years.length,
      years,
      best: graded.length ? Math.max(...graded) : null,
      rung: programme ? (s?.ranks?.[programme] ?? 0) : 0,
    }
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
      /* answered in `performIntent`, where the calling island is known. This is the
       * floor for anything that asks without one. */
      case 'rank': return { taken: 0, years: [], best: null, rung: 0 }
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
    /* A PATH NOBODY ANSWERS IS A REFUSAL, not undefined. Without this the switch
     * fell off its end and handed back nothing, which reaches the member as a
     * None their own code then does arithmetic on, in a traceback that names
     * THEIR line and not the misspelling. The list is spelled out because the
     * one thing a person needs when they typo a path is the word they meant. */
    throw new NotBuilt('get', `nothing answers "${String(path)}". It can answer: ${READABLE.join(', ')}`)
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
    /* an island's own frame, which the engine must never lower behind its back */
    setCinema(on, 'island')
    /* the bars coming down hand the objective line back to the year */
    if (!on) setObjectiveSaid(null)
  },

  /* WHAT THE STUDENT IS SUPPOSED TO BE DOING, said by whoever is directing.
   * BRIEF-MAW-RAIL-3 A. It is chrome around the window, so it needs no map and
   * lives here rather than on the world. */
  objective(text) {
    setObjectiveSaid(text)
  },

  /* ---- THE ISLAND'S OWN TASK LIST ---------------------------------------
   *
   * The declaration goes on a bus, because it only means anything while its island
   * is loaded. The TICKS go in the save, keyed by programme and year, because a
   * student who closes the tab halfway through an island has still done what he
   * did. Both halves are drawn by the sheet the year's tasks already use. */
  islandTasks(tasks, by) {
    const programme = by?.grape ?? ''
    if (!programme)
      throw new NotBuilt('island_tasks', 'the engine could not tell which island is asking, '
        + 'so its tasks would have nowhere to be filed')
    setIslandTasks(programme, tasks)
  },

  taskDone(id, by) {
    const programme = by?.grape ?? ''
    if (!programme)
      throw new NotBuilt('task_done', 'the engine could not tell which island is asking, '
        + `so "${id}" would have nowhere to be filed`)
    /* A TICK IS A THING THE RUN REMEMBERS, so it needs a run, the same as a flag. */
    const s2 = loadSave()
    if (!s2) throw new NotBuilt('task_done', `there is no run to remember "${id}" in`)
    /* AND IT HAS TO BE A ROW THE ISLAND DECLARED. A misspelt id would otherwise be
     * written down for ever, tick nothing a student can see, and leave the island
     * permanently one task short of finished with no way to tell why. */
    const list = islandTaskList()
    if (!list || list.programme !== programme)
      throw new NotBuilt('task_done', `"${programme}" has not said what its tasks are yet. `
        + 'Call island_tasks before ticking one off.')
    if (!list.tasks.some((t) => t.id === id))
      throw new NotBuilt('task_done', `"${programme}" has no task called "${id}". `
        + `It has: ${list.tasks.map((t) => t.id).join(', ')}`)
    markTaskDone(programme, s2.year, id)
    islandTaskTicked()
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
        /* null, NOT ZERO (Ash, 2026-09-09). Zero is a grade a student earned by
         * getting everything wrong; this is a member's island saying "he did
         * it" with no scoring at all, and writing them the same way put an F on
         * the wall of everybody who finished one. */
        recordCompletion(g.id, null, g.rankTrack ?? undefined)
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
        /* ---- AND IT CARRIES NO CREDIT (Ash, 2026-09-09) -----------------
         *
         * It used to be half a credit, so a member who typo'd their programme id
         * put unexplained weight on a student's GPA under a row reading
         * "Awarded (robotcs)". The grade is still kept, because an island that
         * scored somebody should not lose the score to a spelling mistake, and
         * `gpaOf` weights by credit, so a zero-credit row is on the record and
         * invisible to the mean. The console line above names the typo. */
        credit: 0,
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
