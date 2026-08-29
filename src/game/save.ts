// THE RUN — one student, one run (GAME-DESIGN §7.7). A device holds a single local save,
// keyed to that student's participant (class code + handle); the server (Neon) is the
// cross-device truth. NOT a multi-save roster — that was reverted (it rested on a
// shared-Chromebook premise BLHS doesn't have; students are 1:1). "Begin Adventure" starts
// the one run; "Continue" resumes it; the only reset is Settings → Danger Zone → Restart.
// Autosaved on every write, subscribable so HUD/Handbook react live.

const KEY = 'blhs_save_v2'
const OLD_V1 = 'blhs_save_v1'
const ROSTER_KEY = 'blhs_saves'   // the reverted roster's keys, cleaned up on load
const ACTIVE_KEY = 'blhs_active'

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
  /* WHICH ATTEMPT THIS ROW IS ON, counted here rather than passed in. `tries` was
   * hardcoded to 1 at every callsite in both arms, so a retake count could never
   * be anything else, and the retake is real school policy that the game teaches
   * correctly and could not measure. Counting it at the one place that writes the
   * ledger is the only version of this that cannot be hardcoded again. */
  attempts?: number
  /* THE FIRST ATTEMPT'S GRADE, NEVER OVERWRITTEN.
   * Best-of-two is correct for the student and wrong for the study: the first
   * attempt is the only honest measure of what they knew before the review card
   * told them. Two fields because keeping one of them loses the other. */
  firstGrade?: number
  /** the rank ladder this row counts a year toward, when it counts toward one */
  rank?: string
}

export type IslandState = 'misty' | 'discovered' | 'available' | 'active' | 'completed'

/* EXPOSURE IS NOT COMPLETION, and they were the same string.
 *
 * A student who sailed to the stadium in three seasons saw one PLACE three times
 * and may have finished three PROGRAMMES or none. Counting places as programmes
 * inflates the independent variable by the modelling rather than by anything the
 * student did, and counting programmes as places deflates the awareness measure
 * by exactly the same amount. Neither error is visible once it is collected,
 * which is why the split is in the record and not in the analysis.
 *
 * This is the awareness hypothesis's instrument: per student, per place, per
 * year, and whether they ever got off the boat. It is also the cheapest data in
 * the game and the most likely to survive a district review, because it is a
 * list of which school programmes a pseudonymous participant saw. */
export type Exposure = { place: string; year: number; docked: boolean }

/* THE COMPLETION RECORD (W3): one entry per PROGRAMME per YEAR, append-only.
 *
 * `save.islands` is one mutable value per key, and `stampPlan` wrote 'active'
 * over it without reading what was there, so re-slotting a programme in a second
 * year erased the record that it was finished in the first. That is not an edge
 * case: it is the ordinary path of a rank ladder, which re-slots the same
 * programme three years running and therefore destroyed its own history twice on
 * the way up. */
export type Completion = { programme: string; year: number; grade: number; rank?: string; at: number }

/* one year's sheet at the chart table (§7.2): season slots + the 2 focus classes.
 * A SLOT POINTS AT A PROGRAMME AND NEVER AT A MAP. That is what lets one place
 * hold football in the fall and flag football in the winter without either one
 * marking the other complete. */
export type YearPlan = {
  slots: Partial<Record<Season, string>>   // season -> programme id (roster/roster.ts)
  classes: string[]                        // up to 2 class ids
  stamped: boolean                         // the harbor master's wax: the year is committed
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

const readRaw = (): SaveGame | null => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as SaveGame
    return s.v === 2 ? norm(s) : null
  } catch { return null }
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
  cache = readRaw() ?? migrate()
  return cache
}

export function hasSave() { return loadSave() !== null }

/** patch the run. The merge base is the RAW stored save (not this tab's cache) so a write
 *  from a tab that sat idle can never revert another tab's progress. Auto-creates on first
 *  write (the intro's first write starts the save). */
export function writeSave(patch: Partial<SaveGame>) {
  const base = readRaw() ?? cache ?? fresh()
  const next = { ...base, ...patch, savedAt: Date.now() }
  localStorage.setItem(KEY, JSON.stringify(next))
  cache = next; emit()
  return next
}

/** Begin Adventure / Restart: a brand-new run, replacing any existing one */
export function beginAdventure(): SaveGame {
  const s = fresh()
  localStorage.setItem(KEY, JSON.stringify(s))
  cache = s; emit()
  return s
}

/** wipe the run (Restart Adventure sends the student back to Begin) */
export function clearSave() {
  localStorage.removeItem(KEY); localStorage.removeItem(OLD_V1)
  localStorage.removeItem(ROSTER_KEY); localStorage.removeItem(ACTIVE_KEY)
  cache = null; emit()
}

// ---- domain verbs (systems write through these, never by hand-editing fields) ----
// Verbs REQUIRE an existing run and return null without one: a passive collector (a loading
// fact, a badge check) firing before Begin Adventure must not conjure a phantom save that
// then greets a brand-new student with "Welcome back".

/* THE ONE PLACE THE LEDGER IS WRITTEN, which is why the attempt count lives here.
 *
 * Best-of-two is kept for the student and the first attempt is kept for the
 * study, and a worse retake still counts as an attempt: a student who ran it back
 * and did worse tried twice, and a row that says otherwise is the retake policy
 * being unmeasurable rather than unused. */
export function recordGrade(e: LedgerEntry) {
  const s = loadSave()
  if (!s) return null
  const i = s.ledger.findIndex((x) => x.id === e.id)
  const ledger = [...s.ledger]
  if (i >= 0) {
    const was = ledger[i]
    const attempts = (was.attempts ?? 1) + 1
    const firstGrade = was.firstGrade ?? was.grade
    ledger[i] = e.grade > was.grade
      ? { ...e, retaken: true, attempts, firstGrade }
      : { ...was, attempts, firstGrade }
  } else {
    ledger.push({ ...e, attempts: 1, firstGrade: e.grade })
  }
  return writeSave({ ledger })
}

/* THE AWARENESS RECORD. Called when a place is shown to a student, and again
 * with docked=true when they actually land. One row per place per year: seeing
 * the stadium three times in one year is one exposure, seeing it in three years
 * is three, and that is what the awareness claim needs to be countable at all. */
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

/* ONE ROW PER PROGRAMME PER YEAR, APPEND-ONLY, WRITTEN BY A RESULT.
 * Re-finishing the same programme in the same year updates that year's row and
 * never adds a second; finishing it again next year is a new row, which is what
 * a three-year ladder is made of. */
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

export function spendToken(season: Season): ReturnType<typeof writeSave> | null {
  const s = loadSave()
  if (!s) return null
  const i = s.tokens.indexOf(season)
  if (i < 0) return null
  const tokens = [...s.tokens]; tokens.splice(i, 1)
  return writeSave({ tokens })
}

/* THE LEDGER ID OF A PROGRAMME'S VOYAGE, one convention stated once so the
 * completion record and the transcript row can find each other. It is stable in
 * the programme and the year, which is the whole of M1's "stably identified":
 * playing the same island twice in one year updates one row instead of weighting
 * the GPA twice, which a base-36 timestamp could never do. */
export const islandLedgerId = (programme: string, year: number) => `island:${programme}:y${year}`

/** the state of one PROGRAMME in this run. Keyed by programme id, which is the
 *  key the planner's slot holds, never a map id or a place id. Setting it to
 *  'completed' writes the append-only record too, because completion is a result
 *  and a mutable field cannot remember three years of a ladder. */
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

/** pick a focus class (max 2 per year, §7.2) */
export function pickClass(year: number, classId: string) {
  const s = loadSave()
  if (!s) return null
  const plan = planOf(s, year)
  if (plan.stamped || plan.classes.length >= 2 || plan.classes.includes(classId)) return null
  return writeSave({ plans: { ...s.plans, [year]: { ...plan, classes: [...plan.classes, classId] } } })
}

export function dropClass(year: number, classId: string) {
  const s = loadSave()
  if (!s) return null
  const plan = planOf(s, year)
  if (plan.stamped || !plan.classes.includes(classId)) return null
  return writeSave({ plans: { ...s.plans, [year]: { ...plan, classes: plan.classes.filter((c) => c !== classId) } } })
}

/** the harbor master's stamp: the year commits. The programmes the sheet slotted flip to
 *  'active' (§6.4) in the same write. The argument is PROGRAMME ids, which is what a slot
 *  holds; it used to be island ids and the translation is what merged a shared place's
 *  programmes into one record. */
export function stampPlan(year: number, activeProgrammeIds: string[] = []) {
  const s = loadSave()
  if (!s) return null
  const plan = planOf(s, year)
  if (plan.stamped) return null
  const islands = { ...s.islands }
  /* THE STAMP WRITES INTENT AND NEVER COMPLETION. It used to write 'active' with
   * no read of what was there, so re-slotting a programme in a second year erased
   * the record that it was finished in the first, which is the ordinary path of a
   * rank ladder. The per-year completion record is the history now, and this
   * mutable field is only the colour on a chart, so a finished programme keeps
   * its colour until the year's own record says otherwise. */
  for (const id of activeProgrammeIds) if (islands[id] !== 'completed') islands[id] = 'active'
  return writeSave({
    plans: { ...s.plans, [year]: { ...plan, stamped: true } },
    islands,
  })
}
