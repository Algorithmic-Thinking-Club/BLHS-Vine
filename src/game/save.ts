// the one local save for one student's run, autosaved on every write and subscribable

import type { Transcript } from '../vine/verify'
import type { VesselRecord } from './world/sail'
import { refuseSlot, refuseClass } from './run/refusal'

const KEY = 'blhs_save_v2'
const OLD_V1 = 'blhs_save_v1'
const ROSTER_KEY = 'blhs_saves'   // the reverted roster's keys, cleaned up on load
const ACTIVE_KEY = 'blhs_active'
/* the one-run guard's key, holding one id, one class code and a count, and never wiped */
const GUARD_KEY = 'blhs_run_guard'

const newId = () => 'r' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)

export type Season = 'Fall' | 'Winter' | 'Spring'
export const SEASONS: Season[] = ['Fall', 'Winter', 'Spring']

/** one graded thing, an island voyage, a class beat or a core beat, and the raw material GPA is computed from */
export type LedgerEntry = {
  id: string
  title: string
  kind: 'island' | 'class' | 'core'
  credit: number
  grade: number
  year: number
  season: Season
  retaken?: boolean
  tags?: string[]
  /* which attempt this row is on, counted where the ledger is written */
  attempts?: number
  /* the first attempt's grade, kept alongside the best one and never overwritten */
  firstGrade?: number
  /* two numbers per item, earned over possible, keyed by the item's own id, never the answers themselves, because those are minors' response data and telemetry already holds them */
  marks?: Record<string, [number, number]>
  /** the rank ladder this row counts a year toward, when it counts toward one */
  rank?: string
}

export type IslandState = 'misty' | 'discovered' | 'available' | 'active' | 'completed'

/* one row per place per year saying the student saw it, and whether they got off the boat */
export type Exposure = { place: string; year: number; docked: boolean }

/* the completion record: one append-only entry per programme per year */
export type Completion = {
  programme: string
  year: number
  /* null means finished without a grade: an ungraded `award(...)` once landed here as a flat 0 and printed as an F, and a zero somebody earned must never be written down as the same thing */
  grade: number | null
  rank?: string
  at: number
  /* the same two facts a ledger row keeps, so a voyage and a class can be reported the same way (`attempts` counted here, `firstGrade` never moved) */
  attempts?: number
  firstGrade?: number | null
}

/* one year's sheet: a programme in each season slot plus the two focus classes */
export type YearPlan = {
  slots: Partial<Record<Season, string>>   // season -> programme id (roster/roster.ts)
  classes: string[]                        // up to 2 class ids
  stamped: boolean                         // the harbor master's wax: the year is committed
}

/* where the run was standing, and which version of the map and world it was written against */
export type RunPosition = {
  /** the map id the body was standing on */
  map: string
  /** the MAPVIS published version of that map, when it came from the platform */
  mapVersion?: number
  /** the composition document's own version, so a re-placed ocean is caught too */
  worldVersion?: number
  /** the named anchor last passed through. A name is checkable; a pixel is not. */
  anchor?: string
  /** painting pixels, and the first thing thrown away when a version moves */
  x?: number
  y?: number
  at: number
}

/* the transcript as it stood at graduation, frozen once so the printed code keeps matching */
export type FrozenRun = {
  transcript: Transcript
  /** the verification code, computed once over the frozen transcript */
  code: string
  /** the year the run closed on, which is 4 for a full voyage */
  year: number
  at: number
}

export type SaveGame = {
  v: 2
  id: string
  participantId?: string        // the study identity, set at join (net.ts); server keys on this
  handle: string
  pronouns: string
  boatName: string
  thorLook?: string
  /* what is worn over the coat, absent for the bare panther, and one slot on purpose: an outfit is a whole edited character rather than a layer, so two cannot be worn at once */
  thorWear?: string
  castaway?: boolean
  classCode?: string
  year: number
  season: Season
  beat: string
  introDone: boolean
  graduated?: boolean           // the run's terminal state (§9); set by the fourth endYear
  plans: Record<number, YearPlan>  // the year sheets, keyed by year 1..4 (§7.2)
  flags: string[]               // one-shot beats already seen, such as `vignette:y1`, so they never fire again
  /* keyed by programme id and carrying the year, because a club can be retaken later: a mismatched year reads as nothing ticked, so a new year resets itself, and the island declares the task list on every load */
  tasks?: Record<string, { year: number; done: string[] }>
  tokens: Season[]
  ledger: LedgerEntry[]
  /* legacy, read through `progress.ts`'s `ranksOf()` and not directly: it had four readers and zero writers, and years invested come from the completion record so a stored count cannot disagree with the ledger */
  ranks: Record<string, number>
  /** the current state of one programme, for the colour on a chart, keyed by programme id from `roster/roster.ts` and never by a map id or a place id */
  islands: Record<string, IslandState>
  /** every place this student was ever shown, per year (added after v2 shipped) */
  exposure?: Exposure[]
  /** append-only: one row per programme per year, and never written by a stamp */
  completions?: Completion[]
  /** where the run was and what version of the world it was written against */
  where?: RunPosition
  /* the ship as a berth name rather than a position, because a mid-voyage resume returns to a dock: a dock is a named anchor on a known map and a point on open water is neither */
  vessel?: VesselRecord
  /** the transcript frozen at graduation, written once and never overwritten */
  diploma?: FrozenRun
  stickers: string[]
  facts: string[]
  badges: string[]
  savedAt: number
}

const fresh = (): SaveGame => ({
  v: 2, id: newId(), handle: '', pronouns: '', boatName: '', year: 1, season: 'Fall',
  beat: 'intro:i1', introDone: false, plans: {}, flags: [],
  tokens: [...SEASONS], ledger: [], ranks: {}, islands: {}, exposure: [], completions: [],
  stickers: [], facts: [], badges: [],
  savedAt: 0,
})

// fields added after a save shape shipped get defaulted on read, never versioned-and-wiped
const norm = (s: SaveGame): SaveGame => {
  if (!s.plans) s.plans = {}
  if (!s.flags) s.flags = []
  if (!s.exposure) s.exposure = []
  if (!s.completions) s.completions = []
  return s
}

let cache: SaveGame | null | undefined
const listeners = new Set<() => void>()
export function subscribeSave(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
const emit = () => { for (const fn of listeners) fn() }

// another tab wrote the run: drop this tab's snapshot so the next read sees theirs and subscribers re-render, because without this a stale tab's next write reverted real progress
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { cache = undefined; emit() }
  })
}

/* which of no save, a good save or a damaged one the last read found */
export type SaveHealth = 'none' | 'ok' | 'damaged'
let health: SaveHealth = 'none'
export const saveHealth = (): SaveHealth => { loadSave(); return health }

/* a save that stopped parsing is moved aside rather than written over */
const WRECK_KEY = 'blhs_save_damaged'
export const damagedSave = (): string | null => {
  try { return localStorage.getItem(WRECK_KEY) } catch { return null }
}
function keepTheWreck(raw: string) {
  try { if (!localStorage.getItem(WRECK_KEY)) localStorage.setItem(WRECK_KEY, raw) } catch { /* nothing to keep it in */ }
}

const readRaw = (): SaveGame | null => {
  let raw: string | null = null
  try { raw = localStorage.getItem(KEY) } catch { health = 'damaged'; return null }
  if (!raw) { health = 'none'; return null }
  const wrecked = (): null => { health = 'damaged'; keepTheWreck(raw!); return null }
  try {
    const s = JSON.parse(raw) as SaveGame
    /* a save from a newer deploy is still read and normalised, never treated as no save */
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || typeof (s.v as unknown) !== 'number') return wrecked()
    if (s.v < 2) return wrecked()
    health = 'ok'
    return norm(s)
  } catch { return wrecked() }
}

// migrate any older shape into the single save: the roster's most-recent entry, then v1
function migrate(): SaveGame | null {
  try {
    const rosterRaw = localStorage.getItem(ROSTER_KEY)
    if (rosterRaw) {
      const arr = JSON.parse(rosterRaw) as SaveGame[]
      // honor the roster's own active pointer first; fall back to the newest entry
      const activeId = localStorage.getItem(ACTIVE_KEY)
      localStorage.removeItem(ROSTER_KEY); localStorage.removeItem(ACTIVE_KEY)
      const valid = arr.filter((s) => s && s.v === 2)
      const best = valid.find((s) => s.id === activeId)
        ?? valid.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0]
      if (best) { localStorage.setItem(KEY, JSON.stringify(best)); return best }
    }
    const v1 = localStorage.getItem(OLD_V1)
    if (v1) {
      const s = JSON.parse(v1)
      localStorage.removeItem(OLD_V1)
      const migrated = { ...fresh(), ...s, v: 2 as const, id: newId() }
      localStorage.setItem(KEY, JSON.stringify(migrated))
      return migrated
    }
  } catch { /* fall through */ }
  return null
}

export function loadSave(): SaveGame | null {
  if (cache !== undefined) return cache
  const read = readRaw()
  cache = read ?? migrate()
  if (!read && cache) health = 'ok'      // a migrated save is a save, not a wreck
  return cache
}

export function hasSave() { return loadSave() !== null }

/* writing: a failed write is recorded rather than thrown, and the run keeps playing */
export type SaveFault = { kind: 'quota' | 'blocked'; at: number; message: string }
let fault: SaveFault | null = null
/** the last write that did not reach the disk, or null. A banner reads this. */
export const saveFault = (): SaveFault | null => fault

function commit(s: SaveGame): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
    fault = null
    return true
  } catch (e) {
    const name = (e as { name?: string })?.name ?? ''
    /* the two the deployment target actually raises, named apart because the answer differs: a full profile can be helped by a sync, a blocked origin cannot be helped at all and has to be said out loud */
    const kind = /quota|QUOTA/i.test(name) ? 'quota' as const : 'blocked' as const
    fault = { kind, at: Date.now(), message: String((e as Error)?.message ?? name) }
    return false
  }
}

/** patch the run, merging onto the raw stored save rather than this tab's cache so a tab that sat idle can never revert another tab's progress, and creating the save on first write */
export function writeSave(patch: Partial<SaveGame>) {
  const base = readRaw() ?? cache ?? fresh()
  const next = { ...base, ...patch, savedAt: Date.now() }
  /* the guard's record is stamped here, where every write passes */
  if (patch.participantId) rememberParticipant(next)
  commit(next)
  cache = next; emit()
  return next
}

/* one last try on pagehide, for a run that is in memory because a write faulted */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (fault && cache) commit(cache)
  })
}

/** Begin Adventure / Restart: a brand-new run, replacing any existing one */
export function beginAdventure(): SaveGame {
  const s = fresh()
  commit(s)
  health = 'ok'
  cache = s; emit()
  return s
}

/** wipe the run (Restart Adventure sends the student back to Begin) */
export function clearSave() {
  try {
    localStorage.removeItem(KEY); localStorage.removeItem(OLD_V1)
    localStorage.removeItem(ROSTER_KEY); localStorage.removeItem(ACTIVE_KEY)
    localStorage.removeItem(WRECK_KEY)
  } catch { /* a blocked origin has nothing to remove */ }
  /* `GUARD_KEY` is deliberately not in that list: the record that this device already joined a class is what one run per device rests on */
  health = 'none'
  cache = null; emit()
}

/* the guard that keeps one device to one participant, so a restart cannot make a second row */
export type RunGuard = {
  /** the first server-assigned participant this device ever carried */
  participantId: string
  classCode?: string
  /** how many times a restart was allowed anyway, which is a captain's doing */
  restarts: number
  firstAt: number
}

export function runGuard(): RunGuard | null {
  try {
    const raw = localStorage.getItem(GUARD_KEY)
    if (!raw) return null
    const g = JSON.parse(raw) as RunGuard
    return typeof g?.participantId === 'string' ? g : null
  } catch { return null }
}

function putGuard(g: RunGuard) {
  try { localStorage.setItem(GUARD_KEY, JSON.stringify(g)) } catch { /* blocked: the guard is best effort */ }
}

/* records the first participant this device carried, once, and never the captain's */
function rememberParticipant(s: SaveGame) {
  const pid = s.participantId
  if (!pid || pid === 'captain' || runGuard()) return
  putGuard({ participantId: pid, classCode: s.classCode, restarts: 0, firstAt: Date.now() })
}

export type RestartVerdict = { allowed: true } | { allowed: false; why: string }

/** may this device start its run over: one run per participant is the constraint, and this is where it is stated */
export function canRestart(): RestartVerdict {
  const g = runGuard()
  if (!g) return { allowed: true }
  return {
    allowed: false,
    why: g.classCode
      ? `You already started this game with the code ${g.classCode}. `
        + 'Ask your teacher if you need to start over.'
      : 'You already started this game on this device. '
        + 'Ask your teacher if you need to start over.',
  }
}

/* the restart is recorded rather than silent, because resetting a demo machine is a real need and the count is what lets a class whose numbers do not add up be asked how many devices were reset */
export function restartRun(force = false): RestartVerdict {
  const verdict = canRestart()
  if (!verdict.allowed && !force) return verdict
  const g = runGuard()
  if (g) putGuard({ ...g, restarts: g.restarts + 1 })
  clearSave()
  return { allowed: true }
}

/** the teacher's own reset: the device forgets it ever joined. Never a student's. */
export function releaseGuard() {
  try { localStorage.removeItem(GUARD_KEY) } catch { /* nothing to release */ }
}

// the domain verbs systems write through, each needing an existing run and returning null without one

/* the one place the ledger is written, keeping the best grade, the first grade and the count */
export function recordGrade(e: LedgerEntry) {
  const s = loadSave()
  if (!s) return null
  const i = s.ledger.findIndex((x) => x.id === e.id)
  const ledger = [...s.ledger]
  if (i >= 0) {
    const was = ledger[i]
    const attempts = (was.attempts ?? 1) + 1
    const firstGrade = was.firstGrade ?? was.grade
    /* a retake is spent by being taken, so a worse second attempt still marks the row retaken */
    /* a required retake must not spend the optional one: `retaken` means the school's Universal Retake is used up, so a row counts as retaken only when the sitting before it had already passed, and everything below that is only climbing back to a pass */
    /* a D or better, matching `progress.ts`'s `PASSING_GRADE`, spelled out here because a value import back would be a cycle, and `save.test.ts` asserts the two agree */
    const wasPassing = was.grade >= 1.0
    /* never written as false: a row that has not been retaken carries no such key at all, and stamping one in changes the shape of every row a second write ever touched */
    const spent = was.retaken || (wasPassing && !!e.retaken)
    /* the caller's own `retaken` is a request, not the answer, so it is dropped off the incoming row: whether the school's one retake was spent is this function's decision */
    const { retaken: _asked, ...fresh } = e
    ledger[i] = e.grade > was.grade
      ? { ...fresh, ...(spent ? { retaken: true } : {}), attempts, firstGrade }
      /* the flag is added, never written as false: an unretaken row has no `retaken` key, and stamping one in changes the shape of every ledger row a second write ever touched */
      : { ...was, ...(spent ? { retaken: true } : {}), attempts, firstGrade }
  } else {
    ledger.push({ ...e, attempts: 1, firstGrade: e.grade })
  }
  return writeSave({ ledger })
}

/* called when a place is shown to a student, and again with docked=true when they land */
export function recordExposure(place: string, docked = false) {
  const s = loadSave()
  if (!s || !place) return null
  const rows = [...(s.exposure ?? [])]
  const i = rows.findIndex((x) => x.place === place && x.year === s.year)
  if (i >= 0) {
    if (rows[i].docked || !docked) return s
    rows[i] = { ...rows[i], docked: true }
  } else {
    rows.push({ place, year: s.year, docked })
  }
  return writeSave({ exposure: rows })
}

/* writes one row per programme per year, updating this year's rather than adding a second */
/* a voyage is counted the way a class is, on the same `attempts` and `firstGrade`, and `grade` may be null meaning finished without a grade, which is what `award` with no number says and which used to be written as 0 and printed as an F */
export function recordCompletion(programme: string, grade: number | null, rank?: string) {
  const s = loadSave()
  if (!s || !programme) return null
  const rows = [...(s.completions ?? [])]
  const i = rows.findIndex((c) => c.programme === programme && c.year === s.year)
  if (i < 0) {
    rows.push({ programme, year: s.year, grade, at: Date.now(), attempts: 1, firstGrade: grade, ...(rank ? { rank } : {}) })
    return writeSave({ completions: rows })
  }
  const was = rows[i]
  const attempts = (was.attempts ?? 1) + 1
  /* never overwritten, the way the ledger's own first grade is not */
  const firstGrade = was.firstGrade === undefined ? was.grade : was.firstGrade
  /* an ungraded finish never beats a grade and never loses to one either: it only says the thing was done, which the row already says */
  const better = grade !== null && (was.grade === null || grade > was.grade)
  rows[i] = {
    ...was,
    ...(better ? { grade } : {}),
    attempts,
    firstGrade,
    /* the ladder a year counted toward does not change because the grade improved, so a later write with no track keeps the one already on the row */
    ...(rank ? { rank } : was.rank ? { rank: was.rank } : {}),
  }
  return writeSave({ completions: rows })
}

/** did this student finish this programme in this year (the voyage's own question) */
export const completedIn = (s: SaveGame, programme: string, year: number): boolean =>
  (s.completions ?? []).some((c) => c.programme === programme && c.year === year)

/** every year this student finished this programme, which is a ladder's height */
export const yearsCompleted = (s: SaveGame, programme: string): number[] =>
  (s.completions ?? []).filter((c) => c.programme === programme).map((c) => c.year).sort()

/* where the run is, written on every map change, and only the record: the resume rule and the guard that reads it are in `run/resume.ts`, and a position with no map is refused rather than stored empty */
export function recordPosition(p: Omit<RunPosition, 'at'>) {
  const s = loadSave()
  if (!s || !p.map) return null
  return writeSave({ where: { ...p, at: Date.now() } })
}

/* a vessel record is a berth name and a leg count, never a point on the water, so a ship at sea can never be restored, and the rule lives in the shape of the field rather than at read time */
export function recordVessel(v: VesselRecord) {
  const s = loadSave()
  if (!s || !v?.berthedAt) return null
  return writeSave({ vessel: v })
}

/* frozen once: a second call is a no-op and returns what is already there, because the printed code has to keep matching the roster after the graduate goes back out on the water */
export function freezeRun(d: FrozenRun): SaveGame | null {
  const s = loadSave()
  if (!s) return null
  if (s.diploma) return s
  return writeSave({ diploma: d })
}

export function spendToken(season: Season): ReturnType<typeof writeSave> | null {
  const s = loadSave()
  if (!s) return null
  const i = s.tokens.indexOf(season)
  if (i < 0) return null
  const tokens = [...s.tokens]; tokens.splice(i, 1)
  return writeSave({ tokens })
}

/* the ledger id of a programme's voyage, stable in the programme and the year */
export const islandLedgerId = (programme: string, year: number) => `island:${programme}:y${year}`

/** the state of one programme in this run, keyed by programme id */
export function setIslandState(id: string, state: IslandState) {
  const s = loadSave()
  if (!s) return null
  const next = writeSave({ islands: { ...s.islands, [id]: state } })
  if (state === 'completed') {
    /* does not count as a second go: `recordCompletion` counts attempts, so filling one in for a programme that already has this year's row would report one finish as two tries, and a missing ledger row gives null and not zero because finishing without scoring is not an F */
    if ((s.completions ?? []).some((c) => c.programme === id && c.year === s.year)) return next
    const row = s.ledger.find((e) => e.id === islandLedgerId(id, s.year))
    return recordCompletion(id, row ? row.grade : null) ?? next
  }
  return next
}

export function collectFact(id: string) {
  const s = loadSave()
  if (!s || s.facts.includes(id)) return s
  return writeSave({ facts: [...s.facts, id] })
}

export function collectSticker(id: string) {
  const s = loadSave()
  if (!s || s.stickers.includes(id)) return s
  return writeSave({ stickers: [...s.stickers, id] })
}

export function grantBadge(id: string) {
  const s = loadSave()
  if (!s || s.badges.includes(id)) return s
  return writeSave({ badges: [...s.badges, id] })
}

/** mark a one-shot beat seen, such as a year vignette, and idempotent */
/* what an island has ticked this year, where a list from another year reads as nothing, and it never throws and never writes so a caller with no run gets an honest empty answer */
export function tasksDoneIn(programme: string, year: number): string[] {
  const row = loadSave()?.tasks?.[programme]
  return row && row.year === year ? row.done : []
}

/** tick one of an island's tasks. Idempotent, because an island may say it twice. */
export function markTaskDone(programme: string, year: number, id: string) {
  const s = loadSave()
  if (!s) return s
  const row = s.tasks?.[programme]
  const done = row && row.year === year ? row.done : []
  if (done.includes(id)) return s
  return writeSave({ tasks: { ...(s.tasks ?? {}), [programme]: { year, done: [...done, id] } } })
}

export function setFlag(id: string) {
  const s = loadSave()
  if (!s || s.flags.includes(id)) return s
  return writeSave({ flags: [...s.flags, id] })
}

export function hasFlag(id: string): boolean {
  return loadSave()?.flags.includes(id) ?? false
}

/** the year turns, and the fourth turn is terminal: it marks the run graduated instead of refilling tokens, because senior year does not repeat */
export function endYear() {
  const s = loadSave()
  if (!s) return null
  if (s.year >= 4) return writeSave({ graduated: true })
  return writeSave({ year: s.year + 1, season: 'Fall', tokens: [...SEASONS] })
}

// the year planner's verbs, which the chart-table sheet writes through

const planOf = (s: SaveGame, year: number): YearPlan =>
  s.plans[year] ?? { slots: {}, classes: [], stamped: false }

/** drop a season token on an activity, spending the token or re-aiming an already spent season before the stamp, and refusing once the wax has landed */
export function assignSlot(year: number, season: Season, activityId: string) {
  const s = loadSave()
  if (!s) return null
  const plan = planOf(s, year)
  if (plan.stamped) return null
  /* the season lock is enforced here and not only in the sheet's menu */
  if (refuseSlot(activityId, season, s, year)) return null
  const tokens = [...s.tokens]
  if (!plan.slots[season]) {
    const i = tokens.indexOf(season)
    if (i < 0) return null                 // no token for that season (shouldn't happen pre-stamp)
    tokens.splice(i, 1)
  }
  const next: YearPlan = { ...plan, slots: { ...plan.slots, [season]: activityId } }
  return writeSave({ plans: { ...s.plans, [year]: next }, tokens })
}

/** lift a token back off the sheet, before the stamp only, and that season's token returns to hand */
export function clearSlot(year: number, season: Season) {
  const s = loadSave()
  if (!s) return null
  const plan = planOf(s, year)
  if (plan.stamped || !plan.slots[season]) return null
  const slots = { ...plan.slots }
  delete slots[season]
  return writeSave({
    plans: { ...s.plans, [year]: { ...plan, slots } },
    tokens: [...s.tokens, season],
  })
}

/** pick a focus class, at most 2 a year, where the two-pick limit, the duplicate and the grade window are one refusal in `run/refusal.ts` so the sheet prints the same sentence this verb enforces */
export function pickClass(year: number, classId: string) {
  const s = loadSave()
  if (!s) return null
  const plan = planOf(s, year)
  if (refuseClass(classId, s, year)) return null
  return writeSave({ plans: { ...s.plans, [year]: { ...plan, classes: [...plan.classes, classId] } } })
}

export function dropClass(year: number, classId: string) {
  const s = loadSave()
  if (!s) return null
  const plan = planOf(s, year)
  if (plan.stamped || !plan.classes.includes(classId)) return null
  return writeSave({ plans: { ...s.plans, [year]: { ...plan, classes: plan.classes.filter((c) => c !== classId) } } })
}

/** the harbor master's stamp: the year commits and its slotted programmes flip to active */
export function stampPlan(year: number, activeProgrammeIds: string[] = []) {
  const s = loadSave()
  if (!s) return null
  const plan = planOf(s, year)
  if (plan.stamped) return null
  const islands = { ...s.islands }
  /* the stamp writes intent and never completion, so a finished programme keeps its colour */
  for (const id of activeProgrammeIds) if (islands[id] !== 'completed') islands[id] = 'active'
  return writeSave({
    plans: { ...s.plans, [year]: { ...plan, stamped: true } },
    islands,
  })
}
