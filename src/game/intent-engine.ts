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

/* every path the run can answer, kept as a record so widening RunPath fails to compile until it is listed */
const READABLE_PATHS: Record<RunPath, true> = {
  year: true, gpa: true, tokens: true, cords: true, flags: true, islands: true,
  handle: true, mode: true, graduated: true, cord_board: true, trophies: true,
  phase: true, picks: true, advisory: true, planned: true, rank: true,
}
const READABLE = Object.keys(READABLE_PATHS).sort()

export const engine: IntentEngine = {
  /* opens a panel, and refuses when nothing is mounted to hear it */
  openUi(ui, wait) {
    /* `requestUiAndWait` answers false on exactly the same condition `requestUi` does, so one refusal sentence covers both, and a waiting open can still come back when the panel shuts */
    if (wait) {
      const p = requestUiAndWait(ui)
      if (p) return p
    } else if (requestUi(ui)) return
    throw new NotBuilt('open', `nothing is mounted to open "${ui}" here. `
      + 'A panel needs the world HUD, which does not mount until a run has started.')
  },

  playBeat(beat, decl) {
    return requestBeat(beat, decl)
  },

  /* an island can ask how many times it was finished before now: `taken` counts earlier completions only, so a first year reads 0 and says hello and a second reads 1 and can say welcome back */
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
      /* stickers and badges stay two lists, because they are different things everywhere else in the save and flattening them here would invent a category */
      case 'trophies': return s
        ? { stickers: [...s.stickers], badges: [...s.badges] }
        : { stickers: [], badges: [] }
      /* the beat this year still owes, or null */
      /* advisory is offered until it is passed, not until a row exists: asking `beatDone` answered null on an F, so a failed advisory was reported as banked and the year could not close either */
      case 'advisory': return s && hasCoreBeat(s.year) && !beatPassedIn(s, s.year)
        ? coreBeatId(s.year)
        : null
      case 'flags': return s ? [...s.flags] : []
      /* answered in `performIntent`, where the calling island is known; this is the floor for anything that asks without one */
      case 'rank': return { taken: 0, years: [], best: null, rung: 0 }
      /* whether this year's plan has been stamped */
      case 'planned': return !!(s && s.plans[s.year]?.stamped)
      case 'islands': return s ? { ...s.islands } : {}
      /* with no run there is no name and no graduation, and neither is a number an island can do arithmetic on, so null is the truthful answer rather than an invented one */
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
    /* a path nobody answers is a refusal and never undefined, because undefined reaches the member as a None their own code then does arithmetic on, in a traceback naming their line and not the misspelling; the list is spelled out so a typo shows the word that was meant */
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

  /* what the student is supposed to be doing, said by whoever is directing; it is chrome around the window, so it needs no map and lives here rather than on the world */
  objective(text) {
    setObjectiveSaid(text)
  },

  /* the task declaration goes on a bus because it only means anything while its island is loaded, and the ticks go in the save keyed by programme and year so closing the tab halfway keeps what was done */
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
    /* a ticked id has to be a row the island declared, because a misspelt id would be written down for ever, tick nothing a student can see, and leave the island one task short of finished with no way to tell why */
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

  /* there is one way the game is drawn. the word stays because an island can ask for it. */
  mode(): SessionMode {
    return 'game'
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
        /* null, not zero: zero is a grade earned by getting everything wrong, while this is an island saying the student did it with no scoring at all, and writing them the same put an F on the wall of everybody who finished one */
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
        /* the id is stable in what it is about and in the year so replaying updates one row; a timestamp made every replay a new row and another half credit of weight on the GPA */
        id: `award:y${year}:${a.programme ?? a.sticker ?? a.badge ?? a.fact ?? 'unnamed'}`,
        title: a.programme ? `Awarded (${a.programme})` : 'Awarded',
        kind: 'core' as const,
        /* an award row carries credit 0: at half a credit a typo'd programme id put unexplained weight on a student's GPA, and since `gpaOf` weights by credit a zero-credit row is on the record and invisible to the mean, with the grade still kept */
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
  /* the trophy wall a sticker sends the student to is not built, so that reward points at a place the game does not have */
  if (a.sticker) return { what: 'You earned a badge.', detail: a.sticker }
  if (a.fact) return { what: 'That went in the Handbook.' }
  return { what: 'That counted.' }
}
