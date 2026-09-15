/* dose: how long a student was actually looking at the game, folded from heartbeats */
import { atMs, eventName, type Env, type StoredEvent } from './_summary.js'

/* how often the game sends a heartbeat, repeated here because the client cannot import */
export const HEARTBEAT_MS = 15_000

/* how big a gap between beats still counts as a student who is there */
export const GAP_INTERVALS = 2.5
export const gapCapMs = (everyMs = HEARTBEAT_MS) => Math.round(everyMs * GAP_INTERVALS)

/** the slice keys a dose can be cut by, all stamped onto every beat through `setContext`: `map` by PmapScene and `scene` by the SceneManager */
export type DoseCut = 'map' | 'scene' | 'place' | 'session'

export type DoseSlice = {
  key: string
  onTaskMs: number
  beats: number
}

export type ParticipantDose = {
  /** the handle, filled in by the endpoint: the fold keys on the participant id and the endpoint swaps it out, because a participant id has never left a handler in this api */
  handle?: string
  participantId: string
  arm: string | null
  dev: boolean
  /** heartbeats read, after the duplicate-batch dedup */
  beats: number
  sessions: number
  /** the measure: gaps between consecutive beats in one run, each one no longer than the cap, summed */
  onTaskMs: number
  /** what the cap refused: the sum of the gaps judged to be a student who left */
  awayMs: number
  /** how many times they left, because a run with breaks is a different run from a run of the same length without them and the export could not say which */
  breaks: number
  firstAt: number | null
  lastAt: number | null
  /** first beat to last, which is NOT dose and is here to be compared against it */
  spanMs: number
  byMap: DoseSlice[]
  byScene: DoseSlice[]
  bySession: DoseSlice[]
  /** how many of these sessions were timed off the server's clock rather than the client's */
  serverClocked: number
}

export type DoseReport = {
  /** heartbeat rows the fold actually read, so an empty answer and an answer of nothing are distinguishable, since they look identical in a table */
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

/* which clock times a run: the client's when every beat has one, else the server's */
function pickClock(beats: Beat[]): 'client' | 'server' {
  return beats.every((b) => b.client !== null) ? 'client' : 'server'
}

/** the fold, per participant, picking the heartbeats out here because the rows handed in may be every event of a class */
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
    /* drop a beat that was sent twice, because the queue can ship a batch again */
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
        /* the slice counters count where a beat was, whether or not it closed an interval, so a map with one beat and no measurable time still appears with a zero instead of vanishing */
        touch(maps, beats[i].map)
        touch(scenes, beats[i].scene)
        touch(places, beats[i].place)
        if (i === 0) continue

        const gap = at - time(beats[i - 1])
        const cap = gapCapMs(beats[i].everyMs)
        if (gap > cap) { m.awayMs += gap; m.breaks++; continue }
        m.onTaskMs += gap
        /* the interval is credited to the beat that closed it, so the slices sum exactly */
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

/* the bucket for one slice key, where a beat with no map gets its own visible key */
const slotFor = (into: Map<string, DoseSlice>, key: string | null): DoseSlice => {
  const k = key ?? '(none)'
  const slice = into.get(k) ?? { key: k, onTaskMs: 0, beats: 0 }
  into.set(k, slice)
  return slice
}

/** one beat happened here, and counting and crediting are two calls because two beats at the same instant credit a zero, and a zero must not read as no beat */
const touch = (into: Map<string, DoseSlice>, key: string | null) => { slotFor(into, key).beats++ }

const credit = (into: Map<string, DoseSlice>, key: string | null, ms: number) => {
  slotFor(into, key).onTaskMs += ms
}

/** longest first, because the question asked of a dose table is which island held them, not which island is alphabetically first */
const sorted = (m: Map<string, DoseSlice>): DoseSlice[] =>
  [...m.values()].sort((a, b) => b.onTaskMs - a.onTaskMs || a.key.localeCompare(b.key))

/** minutes to two places, the unit the exports are read in, and the same arithmetic as _summary's export columns kept as one function */
export const doseMinutes = (v: number) => Math.round(v / 600) / 100
