/* DOSE: the exposure measure, and the one number the study cannot be argued
 * without. Pure, no I/O, unit-tested in api/_dose.test.ts.
 *
 * `src/game/telemetry.ts` has been posting a `heartbeat` every fifteen seconds
 * since the clock landed, and NOTHING HAS EVER READ ONE BACK as a duration.
 * `api/_summary.ts` counts how many arrived and sums the gaps between ALL
 * events, which is a different measure wearing the same word: an island that
 * emits forty events a minute and an island that emits four both produce
 * heartbeats at the same rate, and only the heartbeat can be compared across
 * them. §80.16.4 names the hole. An unfalsifiable dose is the failure mode of an
 * intervention comparison, because "the game arm learned more" and "the game arm
 * sat there longer" are the same table until somebody can say how long.
 *
 * SO THIS FOLD READS HEARTBEATS AND NOTHING ELSE. Every other event is ignored
 * here on purpose. The beat is the only row in the table that means "a student
 * was looking at this, right now" rather than "something happened".
 */
import { atMs, eventName, type Env, type StoredEvent } from './_summary'

/* The cadence `startHeartbeat()` ticks at. It is repeated rather than imported
 * because src/game/telemetry.ts touches localStorage and window at module scope
 * and a serverless handler has neither. The drift is fenced two ways: every beat
 * carries its own `everyMs` in its data and this fold prefers it, and
 * api/_dose.test.ts pins the pair. */
export const HEARTBEAT_MS = 15_000

/* HOW MANY MISSED BEATS STILL COUNT AS A STUDENT WHO IS THERE.
 *
 * The beat fires every fifteen seconds and only while the tab is visible, so a
 * hidden tab, a closed lid or a dead page leaves exactly one long gap and no
 * partial evidence. Two beats fifteen seconds apart is a student sitting there.
 * ONE dropped tick puts them thirty seconds apart with the student still sitting
 * there, and that happens on the machine this game is actually for: a 4 GB
 * Chromebook loading a 688x377 painting stalls its main thread long enough to
 * miss a tick. Throwing that away would undercount exactly the hardware the
 * study runs on. TWO dropped ticks is forty-five seconds, and nothing the
 * renderer does takes forty-five seconds; that is a tab that went away.
 *
 * So the line sits between them, at two and a half intervals. It is written as a
 * multiple of the cadence rather than as a number so that changing the tick
 * cannot silently change what "on task" means.
 */
export const GAP_INTERVALS = 2.5
export const gapCapMs = (everyMs = HEARTBEAT_MS) => Math.round(everyMs * GAP_INTERVALS)

/** the slice keys a dose can be cut by. `map` is stamped by PmapScene, `scene`
 *  by the SceneManager, both through `setContext` and both onto every beat. */
export type DoseCut = 'map' | 'scene' | 'place' | 'session'

export type DoseSlice = {
  key: string
  onTaskMs: number
  beats: number
}

export type ParticipantDose = {
  /** the handle, filled in by the endpoint. The fold keys on the participant id
   *  and the endpoint swaps it out, because a participant id has never left a
   *  handler in this api and is not going to start here. */
  handle?: string
  participantId: string
  arm: string | null
  dev: boolean
  /** heartbeats read, after the duplicate-batch dedup */
  beats: number
  sessions: number
  /** THE MEASURE. Gaps between consecutive beats in one session, each one no
   *  longer than the cap, summed. */
  onTaskMs: number
  /** what the cap refused: the sum of the gaps judged to be a student who left */
  awayMs: number
  /** how many times they left. A run with breaks is a different run from a run
   *  of the same length without them, and the export could not say which. */
  breaks: number
  firstAt: number | null
  lastAt: number | null
  /** first beat to last, which is NOT dose and is here to be compared against it */
  spanMs: number
  byMap: DoseSlice[]
  byScene: DoseSlice[]
  bySession: DoseSlice[]
  /* SESSIONS TIMED OFF THE SERVER'S CLOCK RATHER THAN THE CLIENT'S, which is a
   * warning and not a detail. See pickClock below: a server-timed session
   * measures when the batch was INSERTED, and an offline queue draining fifteen
   * minutes of beats in one POST inserts them all in the same transaction. */
  serverClocked: number
}

export type DoseReport = {
  /** heartbeat rows the fold actually read, so an empty answer and an answer of
   *  nothing are distinguishable. They look identical in a table. */
  beatRows: number
  cadenceMs: number
  gapCapMs: number
  participants: ParticipantDose[]
  totals: { participants: number; beats: number; onTaskMs: number; awayMs: number; breaks: number }
}

type Beat = {
  /** the client's own stamp, absent on a row too old to carry one */
  client: number | null
  /** when the row was written, which is a different question */
  server: number
  everyMs: number
  map: string | null
  scene: string | null
  place: string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const posNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null

/* WHICH CLOCK TIMES A SESSION, decided once for the whole session rather than
 * per row.
 *
 * The server's `at` is the insert time. `appendEvents` writes a whole batch in
 * one statement, so every beat in one POST lands on one timestamp, and the
 * offline-first queue that logging.ts exists to provide is precisely the thing
 * that makes a batch long. A Chromebook that lost the network for ten minutes
 * drains forty beats at once and the server clock says the student was there for
 * zero seconds.
 *
 * The client's `at` is `Date.now()` at the instant the beat fired, which is the
 * question being asked. It can be wrong on a machine whose clock is wrong, but
 * it is wrong CONSISTENTLY within one session, and a dose is a difference of two
 * stamps rather than an absolute time, so a skewed clock cancels.
 *
 * Mixing them inside one session would subtract one clock from the other and
 * invent a gap out of the offset, so the session takes the client's only when
 * EVERY beat in it has one. */
function pickClock(beats: Beat[]): 'client' | 'server' {
  return beats.every((b) => b.client !== null) ? 'client' : 'server'
}

/** the fold, per participant. Rows may be every event of a class; the
 *  heartbeats are picked out here rather than by the caller's query. */
export function dose(rows: StoredEvent[]): DoseReport {
  const seenEid = new Set<string>()
  const byPid = new Map<string, {
    arm: string | null
    dev: boolean
    sessions: Map<string, Beat[]>
  }>()
  let beatRows = 0

  for (const row of rows) {
    const env = (row.payload ?? {}) as Env
    if (eventName(env) !== 'heartbeat') continue
    /* the same dedup `summarise` does, and for the same reason: the queue
     * survives a page death mid-POST and a batch can ship twice. A duplicated
     * beat is worse here than there, because it lands at the same instant as its
     * twin and turns one real interval into two, one of which is zero. */
    if (env.eid) {
      if (seenEid.has(env.eid)) continue
      seenEid.add(env.eid)
    }
    const pid = env.participantId ?? row.participantId
    if (!pid) continue
    beatRows++

    let bucket = byPid.get(pid)
    if (!bucket) { bucket = { arm: null, dev: false, sessions: new Map() }; byPid.set(pid, bucket) }
    if (env.mode) bucket.arm = env.mode
    if (env.dev) bucket.dev = true

    const d = env.event?.data ?? {}
    const sid = row.sessionId ?? 'no-session'
    const list = bucket.sessions.get(sid) ?? []
    list.push({
      client: posNum(env.event?.at),
      server: atMs(row.at),
      everyMs: posNum(d.everyMs) ?? HEARTBEAT_MS,
      map: str(d.map), scene: str(d.scene), place: str(d.place),
    })
    bucket.sessions.set(sid, list)
  }

  const participants: ParticipantDose[] = []
  for (const [participantId, b] of byPid) {
    const m: ParticipantDose = {
      participantId, arm: b.arm, dev: b.dev,
      beats: 0, sessions: b.sessions.size, onTaskMs: 0, awayMs: 0, breaks: 0,
      firstAt: null, lastAt: null, spanMs: 0,
      byMap: [], byScene: [], bySession: [], serverClocked: 0,
    }
    const maps = new Map<string, DoseSlice>()
    const scenes = new Map<string, DoseSlice>()
    const places = new Map<string, DoseSlice>()
    const sessions = new Map<string, DoseSlice>()

    for (const [sid, raw] of b.sessions) {
      const clock = pickClock(raw)
      if (clock === 'server') m.serverClocked++
      const time = (x: Beat) => (clock === 'client' ? (x.client as number) : x.server)
      const beats = [...raw].sort((x, y) => time(x) - time(y))
      m.beats += beats.length

      const sSlice: DoseSlice = sessions.get(sid) ?? { key: sid, onTaskMs: 0, beats: 0 }
      sSlice.beats += beats.length
      sessions.set(sid, sSlice)

      for (let i = 0; i < beats.length; i++) {
        const at = time(beats[i])
        if (m.firstAt === null || at < m.firstAt) m.firstAt = at
        if (m.lastAt === null || at > m.lastAt) m.lastAt = at
        /* the slice counters count where a BEAT was, whether or not it closed an
         * interval, so a map with one beat and no measurable time still appears
         * with a zero instead of vanishing */
        touch(maps, beats[i].map)
        touch(scenes, beats[i].scene)
        touch(places, beats[i].place)
        if (i === 0) continue

        const gap = at - time(beats[i - 1])
        const cap = gapCapMs(beats[i].everyMs)
        if (gap > cap) { m.awayMs += gap; m.breaks++; continue }
        m.onTaskMs += gap
        /* THE INTERVAL IS CREDITED TO THE BEAT THAT CLOSED IT, not the one that
         * opened it. Either rule is an estimate when the student changed map
         * mid-interval and neither can be better than half an interval wrong;
         * one rule is used for the cadence and the same one for the context, so
         * there is no second convention to get backwards, and the slices sum to
         * onTaskMs exactly. */
        credit(maps, beats[i].map, gap)
        credit(scenes, beats[i].scene, gap)
        credit(places, beats[i].place, gap)
        sSlice.onTaskMs += gap
      }
    }

    m.spanMs = m.firstAt !== null && m.lastAt !== null ? m.lastAt - m.firstAt : 0
    m.byMap = sorted(maps)
    m.byScene = sorted(scenes)
    m.bySession = sorted(sessions)
    participants.push(m)
  }

  participants.sort((a, z) => a.participantId.localeCompare(z.participantId))
  return {
    beatRows,
    cadenceMs: HEARTBEAT_MS,
    gapCapMs: gapCapMs(),
    participants,
    totals: {
      participants: participants.length,
      beats: participants.reduce((n, p) => n + p.beats, 0),
      onTaskMs: participants.reduce((n, p) => n + p.onTaskMs, 0),
      awayMs: participants.reduce((n, p) => n + p.awayMs, 0),
      breaks: participants.reduce((n, p) => n + p.breaks, 0),
    },
  }
}

/* A BEAT WITH NO MAP IS ITS OWN BUCKET AND NOT A DROPPED ROW. The title screen,
 * the planner and the yearbook all beat with `map: null`, and folding them away
 * would make every per-map dose add up to less than the run without saying why.
 * `(none)` is a key a reader can see. */
const slotFor = (into: Map<string, DoseSlice>, key: string | null): DoseSlice => {
  const k = key ?? '(none)'
  const slice = into.get(k) ?? { key: k, onTaskMs: 0, beats: 0 }
  into.set(k, slice)
  return slice
}

/** one beat happened here. Counting and crediting are two calls because two
 *  beats at the same instant credit a zero, and a zero must not read as "no
 *  beat" the way one merged function made it. */
const touch = (into: Map<string, DoseSlice>, key: string | null) => { slotFor(into, key).beats++ }

const credit = (into: Map<string, DoseSlice>, key: string | null, ms: number) => {
  slotFor(into, key).onTaskMs += ms
}

/** longest first, because the question a reviewer asks of a dose table is which
 *  island held them and not which island is alphabetically first */
const sorted = (m: Map<string, DoseSlice>): DoseSlice[] =>
  [...m.values()].sort((a, b) => b.onTaskMs - a.onTaskMs || a.key.localeCompare(b.key))

/** minutes to two places, the unit a teacher and a reviewer both read in.
 *  Same arithmetic as _summary's export columns, kept as one function. */
export const doseMinutes = (v: number) => Math.round(v / 600) / 100
