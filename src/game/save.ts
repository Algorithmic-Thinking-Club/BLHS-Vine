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

/** one graded thing (island voyage, class beat, core beat) — GPA's raw material (§8.1) */
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
  /** the rank ladder this row counts a year toward, when it counts toward one */
  rank?: string
}

export type IslandState = 'misty' | 'discovered' | 'available' | 'active' | 'completed'

/* one row per place per year saying the student saw it, and whether they got off the boat */
export type Exposure = { place: string; year: number; docked: boolean }

/* the completion record: one append-only entry per programme per year */
export type Completion = { programme: string; year: number; grade: number; rank?: string; at: number }

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
  arm?: 'game' | 'plain'        // the study arm the server assigned at join (§13.2)
  handle: string
  pronouns: string
  boatName: string
  thorLook?: string
  castaway?: boolean
  classCode?: string
  year: number
  season: Season
  beat: string
  introDone: boolean
  graduated?: boolean           // the run's terminal state (§9); set by the fourth endYear
  plans: Record<number, YearPlan>  // the year sheets, keyed by year 1..4 (§7.2)
  flags: string[]               // one-shot beats seen ('vignette:y1', ...) — never re-fire
  tokens: Season[]
  ledger: LedgerEntry[]
  /* LEGACY, AND READ THROUGH progress.ts's ranksOf() RATHER THAN DIRECTLY.
   * It had four readers and zero writers. Years invested are derived from the
   * completion record now, so a stored count cannot disagree with the ledger. */
  ranks: Record<string, number>
  /** the CURRENT state of one programme, for the colour on a chart. Keyed by
   *  programme id (roster/roster.ts), never by a map id or a place id. */
  islands: Record<string, IslandState>
  /** every place this student was ever shown, per year (added after v2 shipped) */
  exposure?: Exposure[]
  /** append-only: one row per programme per year, and never written by a stamp */
  completions?: Completion[]
  /** where the run was and what version of the world it was written against */
  where?: RunPosition
  /* THE SHIP, AS A BERTH NAME RATHER THAN AS A POSITION. Q80.6.c's answer on
   * record: a mid-voyage resume returns to a dock, because a dock is a named
   * anchor on a known map and a point on open water is neither. */
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

// another tab wrote the run: drop this tab's snapshot so the next read sees theirs, and let
// subscribers re-render. Without this, a stale tab's next write reverted real progress.
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
    /* the two the deployment target actually raises, named apart because the
     * answer differs: a full profile can be helped by a sync, and a blocked
     * origin cannot be helped at all and has to be said out loud */
    const kind = /quota|QUOTA/i.test(name) ? 'quota' as const : 'blocked' as const
    fault = { kind, at: Date.now(), message: String((e as Error)?.message ?? name) }
    return false
  }
}

/** patch the run. The merge base is the RAW stored save (not this tab's cache) so a write
 *  from a tab that sat idle can never revert another tab's progress. Auto-creates on first
 *  write (the intro's first write starts the save). */
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
  /* GUARD_KEY IS NOT IN THAT LIST, ON PURPOSE. See its declaration: the record
   * that this device already joined a class is what Q14 rests on. */
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

/** may this device start its run over. One run per participant is the study's
 *  own constraint and this is where it is stated. */
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

/* THE RESTART, RECORDED. A captain resetting a demo machine is a real need and
 * the count is what makes it visible afterwards rather than silent: a class whose
 * numbers do not add up can be asked how many devices were reset. */
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
    ledger[i] = e.grade > was.grade
      ? { ...e, retaken: true, attempts, firstGrade }
      /* the flag is ADDED, never written as false: a row that has not been
       * retaken has no `retaken` key at all, and stamping one in changes the
       * shape of every ledger row a second write ever touched */
      : { ...was, ...(was.retaken || e.retaken ? { retaken: true } : {}), attempts, firstGrade }
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
export function recordCompletion(programme: string, grade: number, rank?: string) {
  const s = loadSave()
  if (!s || !programme) return null
  const rows = [...(s.completions ?? [])]
  const i = rows.findIndex((c) => c.programme === programme && c.year === s.year)
  const row: Completion = { programme, year: s.year, grade, at: Date.now(), ...(rank ? { rank } : {}) }
  if (i >= 0) {
    if (grade <= rows[i].grade) return s
    /* the ladder a year counted toward does not change because the grade
     * improved, so a later write with no track keeps the one already on the row */
    rows[i] = { ...row, at: rows[i].at, ...(rank ? { rank } : rows[i].rank ? { rank: rows[i].rank } : {}) }
  } else rows.push(row)
  return writeSave({ completions: rows })
}

/** did this student finish this programme in this year (the voyage's own question) */
export const completedIn = (s: SaveGame, programme: string, year: number): boolean =>
  (s.completions ?? []).some((c) => c.programme === programme && c.year === year)

/** every year this student finished this programme, which is a ladder's height */
export const yearsCompleted = (s: SaveGame, programme: string): number[] =>
  (s.completions ?? []).filter((c) => c.programme === programme).map((c) => c.year).sort()

/* WHERE THE RUN IS, WRITTEN ON EVERY MAP CHANGE. The resume rule and the guard
 * that reads it are `run/resume.ts`; this is only the record. A position with no
 * map is not a position, so it refuses rather than storing an empty one. */
export function recordPosition(p: Omit<RunPosition, 'at'>) {
  const s = loadSave()
  if (!s || !p.map) return null
  return writeSave({ where: { ...p, at: Date.now() } })
}

/* THE SHIP, TIED UP. A vessel record is a berth NAME and a leg count, never a
 * point on the water, which is §80.6's "a rule that never restores a ship at
 * sea" written into the shape of the field rather than enforced at read time. */
export function recordVessel(v: VesselRecord) {
  const s = loadSave()
  if (!s || !v?.berthedAt) return null
  return writeSave({ vessel: v })
}

/* FROZEN ONCE. A second call is a no-op and returns what is already there: the
 * printed code has to keep matching the roster after the graduate goes back out
 * on the water, which is the whole reason the snapshot exists. */
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
    const row = s.ledger.find((e) => e.id === islandLedgerId(id, s.year))
    return recordCompletion(id, row?.grade ?? 0) ?? next
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

/** mark a one-shot beat seen (year vignettes, first-time moments) — idempotent */
export function setFlag(id: string) {
  const s = loadSave()
  if (!s || s.flags.includes(id)) return s
  return writeSave({ flags: [...s.flags, id] })
}

export function hasFlag(id: string): boolean {
  return loadSave()?.flags.includes(id) ?? false
}

/** the year turns. The FOURTH turn is terminal: it marks the run graduated (§9) instead of
 *  refilling tokens — senior year does not repeat. */
export function endYear() {
  const s = loadSave()
  if (!s) return null
  if (s.year >= 4) return writeSave({ graduated: true })
  return writeSave({ year: s.year + 1, season: 'Fall', tokens: [...SEASONS] })
}

// ---- THE YEAR PLANNER's verbs (§7.2) — the chart-table sheet writes through these ----

const planOf = (s: SaveGame, year: number): YearPlan =>
  s.plans[year] ?? { slots: {}, classes: [], stamped: false }

/** drop a season token on an activity. Spends the token (or re-aims an already-spent
 *  season pre-stamp); refuses after the wax lands. */
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

/** lift a token back off the sheet (pre-stamp only) — the season's token returns to hand */
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

/** pick a focus class (max 2 per year, §7.2). The two-pick limit, the duplicate
 *  and the grade window are all one refusal in `run/refusal.ts`, so the sheet
 *  prints the same sentence this verb enforces. */
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
