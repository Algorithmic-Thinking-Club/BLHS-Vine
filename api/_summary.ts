/* the reader's arithmetic: folding logged events into one row of measures per participant */

/** the envelope shape the client ships (src/vine/events.ts LogEnvelope), read defensively because these rows come off a database and out of a build that may be older than this code */
export type StoredEvent = {
  participantId: string | null
  sessionId: string | null
  at: string | number | Date
  payload: unknown
}

export type Measures = {
  participantId: string
  /** the arm as the ENVELOPE carried it, which is the only place it cannot be forgotten */
  arm: string | null
  events: number
  sessions: number
  firstAt: number | null
  lastAt: number | null
  /** wall time from first event to last, which is NOT time on task */
  spanMs: number
  /** time on task, the gaps between consecutive events within one session, each capped at IDLE_CAP_MS */
  activeMs: number
  /** how many heartbeats arrived. Zero means this run's duration is a guess. */
  heartbeats: number
  beatsCompleted: number
  /** mean of the grade kept, which is best-of-two and is the student's number */
  meanGrade: number | null
  /** mean of the FIRST attempt, which is the study's number and a different one */
  meanFirstGrade: number | null
  checksAnswered: number
  checksCorrect: number
  /** the largest attempt number any item on this run reached. 1 means no retake. */
  maxTries: number
  retakes: number
  placesSeen: number
  programmesCompleted: number
  /** a member's island threw, or the engine did, counted because a failure in one arm and not the other is indistinguishable from an effect unless somebody counts them */
  failures: number
  /* events this fold did not recognise, counted rather than silently dropped */
  unknown: number
  /** captain / dev sessions are shipped for debugging and excluded from a study export */
  dev: boolean
}

/* the longest gap between two events that may still count as time on task */
export const IDLE_CAP_MS = 60_000

/** a stored row's clock in milliseconds whatever the driver handed back, exported because api/_dose.ts folds the same rows and two readings of one timestamp is two places for a timezone to be read differently */
export const atMs = (v: string | number | Date): number => {
  if (typeof v === 'number') return v
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : 0
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/* every name this fold acts on, and anything else is counted as unknown rather than dropped so a client-side rename shows up as a number in a column instead of a measured value quietly becoming zero */
const KNOWN = new Set([
  'heartbeat', 'core_beat_complete', 'retake_used', 'check_answered',
  'place_seen', 'programme_completed', 'island_failed', 'engine_error',
  'fx_missing', 'audio_missing', 'stage_call_missing', 'stage_actor_missing',
  'trigger_unanswered',
])

/** the envelope as it sits inside a row's jsonb payload, exported for api/_dose.ts which reads the same field off the same rows */
export type Env = {
  participantId?: string
  mode?: string
  dev?: boolean
  eid?: string
  event?: { type?: string; name?: string; at?: number; data?: Record<string, unknown> }
}

/** the event's name whatever shape it arrived in: a vine event carries `name`, a narrowly-typed grape event carries `type` and no name */
export function eventName(e: Env): string {
  const ev = e.event
  if (!ev) return ''
  return ev.type === 'game' ? String(ev.name ?? '') : String(ev.type ?? '')
}

/* when an event happened on the client, which is not when its row was written */
const whenOf = (row: StoredEvent): number => {
  const at = (row.payload as Env | null)?.event?.at
  return typeof at === 'number' && Number.isFinite(at) && at > 0 ? at : atMs(row.at)
}

/* the fold, per participant, deduplicated on `eid` first because the queue survives a page death mid-POST and a batch can ship twice */
export function summarise(rows: StoredEvent[]): Measures[] {
  const seenEid = new Set<string>()
  const byPid = new Map<string, {
    m: Measures
    lastInSession: Map<string, number>
    grades: number[]
    firstGrades: number[]
    places: Set<string>
    programmes: Set<string>
    sessions: Set<string>
  }>()

  const ordered = [...rows].sort((a, b) => whenOf(a) - whenOf(b))

  for (const row of ordered) {
    const env = (row.payload ?? {}) as Env
    if (env.eid) {
      if (seenEid.has(env.eid)) continue
      seenEid.add(env.eid)
    }
    const pid = env.participantId ?? row.participantId
    if (!pid) continue
    const at = whenOf(row)
    const sid = row.sessionId ?? 'no-session'

    let bucket = byPid.get(pid)
    if (!bucket) {
      bucket = {
        m: {
          participantId: pid, arm: env.mode ?? null, events: 0, sessions: 0,
          firstAt: null, lastAt: null, spanMs: 0, activeMs: 0, heartbeats: 0,
          beatsCompleted: 0, meanGrade: null, meanFirstGrade: null,
          checksAnswered: 0, checksCorrect: 0, maxTries: 1, retakes: 0,
          placesSeen: 0, programmesCompleted: 0, failures: 0, unknown: 0, dev: false,
        },
        lastInSession: new Map(), grades: [], firstGrades: [],
        places: new Set(), programmes: new Set(), sessions: new Set(),
      }
      byPid.set(pid, bucket)
    }
    const { m } = bucket
    m.events++
    /* the arm rides the envelope, and the last one seen wins */
    if (env.mode) m.arm = env.mode
    if (env.dev) m.dev = true
    bucket.sessions.add(sid)
    if (m.firstAt === null || at < m.firstAt) m.firstAt = at
    if (m.lastAt === null || at > m.lastAt) m.lastAt = at

    const prev = bucket.lastInSession.get(sid)
    if (prev !== undefined) m.activeMs += Math.min(Math.max(0, at - prev), IDLE_CAP_MS)
    bucket.lastInSession.set(sid, at)

    const name = eventName(env)
    const d = env.event?.data ?? {}
    if (name === 'heartbeat') m.heartbeats++
    if (name === 'core_beat_complete') {
      m.beatsCompleted++
      const g = num(d.grade); if (g !== null) bucket.grades.push(g)
      const fg = num(d.firstGrade) ?? num(d.grade); if (fg !== null) bucket.firstGrades.push(fg)
      const t = num(d.tries); if (t !== null) m.maxTries = Math.max(m.maxTries, t)
    }
    if (name === 'retake_used') m.retakes++
    if (name === 'check_answered') {
      m.checksAnswered++
      if (d.correct === true) m.checksCorrect++
      const t = num(d.tries); if (t !== null) m.maxTries = Math.max(m.maxTries, t)
    }
    /* places seen and programmes completed are counted as two separate things */
    if (name === 'place_seen' && typeof d.place === 'string') bucket.places.add(d.place)
    if (name === 'programme_completed' && typeof d.programme === 'string') bucket.programmes.add(d.programme)
    if (name === 'island_failed' || name === 'engine_error') m.failures++
    /* the stage saying it could not do something is a failure too: fx with no library, audio with no system, a stage call this scene answers nothing on */
    if (name === 'fx_missing' || name === 'audio_missing' || name === 'stage_call_missing'
      || name === 'stage_actor_missing' || name === 'trigger_unanswered') m.failures++
    if (!KNOWN.has(name)) m.unknown++
  }

  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null)
  const out: Measures[] = []
  for (const b of byPid.values()) {
    b.m.sessions = b.sessions.size
    b.m.spanMs = b.m.firstAt !== null && b.m.lastAt !== null ? b.m.lastAt - b.m.firstAt : 0
    b.m.meanGrade = mean(b.grades)
    b.m.meanFirstGrade = mean(b.firstGrades)
    b.m.placesSeen = b.places.size
    b.m.programmesCompleted = b.programmes.size
    out.push(b.m)
  }
  return out.sort((a, b) => a.participantId.localeCompare(b.participantId))
}

/* the export's columns, named once so the header and the row builder cannot drift, and everything after `verification` comes from the events table rather than from pure browser state */
export const EXPORT_COLUMNS = [
  'handle', 'arm', 'joined', 'last_seen', 'year', 'beat', 'graduated', 'verification',
  'sessions', 'events', 'heartbeats', 'active_minutes', 'span_minutes',
  'beats_completed', 'mean_grade', 'mean_first_grade',
  'checks_answered', 'checks_correct', 'max_tries', 'retakes',
  'places_seen', 'programmes_completed', 'failures', 'unknown_events', 'dev_session',
] as const

export type RosterLike = {
  handle: string; arm: string; created_at: string; last_seen: string | null
  year: string; beat: string; graduated?: boolean; code?: string | null
  participantId?: string
}

const minutes = (v: number) => Math.round(v / 600) / 100

/** one row per participant on the roster whether or not they ever logged an event, because a student whose network blocked the drain has to appear with zeros rather than vanish */
export function exportRows(roster: RosterLike[], measures: Measures[]): (string | number)[][] {
  const byPid = new Map(measures.map((m) => [m.participantId, m]))
  return roster.map((r) => {
    const m = r.participantId ? byPid.get(r.participantId) : undefined
    return [
      r.handle, r.arm, r.created_at, r.last_seen ?? '', r.year, r.beat,
      r.graduated ? 'yes' : '', r.code ?? '',
      m?.sessions ?? 0, m?.events ?? 0, m?.heartbeats ?? 0,
      m ? minutes(m.activeMs) : 0, m ? minutes(m.spanMs) : 0,
      m?.beatsCompleted ?? 0, m?.meanGrade ?? '', m?.meanFirstGrade ?? '',
      m?.checksAnswered ?? 0, m?.checksCorrect ?? 0, m?.maxTries ?? '', m?.retakes ?? 0,
      m?.placesSeen ?? 0, m?.programmesCompleted ?? 0, m?.failures ?? 0, m?.unknown ?? 0,
      m?.dev ? 'yes' : '',
    ]
  })
}
