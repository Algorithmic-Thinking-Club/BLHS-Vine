/* THE EXPOSURE MEASURE, pinned.
 *
 * Dose is the number the AP Research comparison cannot be read without, and
 * until api/_dose.ts it was produced by nothing: heartbeats went into a table
 * and no query turned one back into a duration. Every test here is a claim about
 * what "time on task" means, and a refactor that changes one of them is changing
 * the study's independent variable rather than tidying a fold.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dose, doseMinutes, gapCapMs, GAP_INTERVALS, HEARTBEAT_MS } from './_dose'
import type { StoredEvent } from './_summary'
import doseHandler from './dose'
import joinHandler from './join'
import logHandler from './log'
import teacherHandler from './teacher'

const T0 = Date.UTC(2026, 8, 1, 9, 0, 0)

let n = 0
type Over = {
  pid?: string; sid?: string; mode?: string; dev?: boolean; eid?: string
  /** for the rows that are deliberately not heartbeats */
  name?: string
  /** null drops the client stamp, which is what a build older than the stamp sends */
  clientAt?: number | null
  /** when the ROW was inserted, when that differs from when the beat fired */
  serverAt?: number
}

/** one heartbeat, with the two clocks separately controllable because telling
 *  them apart is half of what this fold does */
const beat = (offsetMs: number, data: Record<string, unknown> = {}, over: Over = {}): StoredEvent => {
  const client = over.clientAt === undefined ? T0 + offsetMs : over.clientAt
  return {
    participantId: over.pid ?? 'p_1',
    sessionId: over.sid ?? 's1',
    at: new Date(over.serverAt ?? T0 + offsetMs).toISOString(),
    payload: {
      participantId: over.pid ?? 'p_1',
      mode: over.mode ?? 'game',
      ...(over.dev ? { dev: true } : {}),
      eid: over.eid ?? `e${n++}`,
      event: {
        type: 'game',
        name: over.name ?? 'heartbeat',
        ...(client === null ? {} : { at: client }),
        data: { everyMs: HEARTBEAT_MS, ...data },
      },
    },
  }
}

const one = (rows: StoredEvent[]) => dose(rows).participants[0]

describe('the cap, which is where a student stops counting as present', () => {
  it('is two and a half beats and is derived from the cadence, not typed in', () => {
    expect(HEARTBEAT_MS).toBe(15_000)
    expect(GAP_INTERVALS).toBe(2.5)
    expect(gapCapMs()).toBe(37_500)
    expect(gapCapMs(20_000)).toBe(50_000)
  })

  it('FORGIVES one missed beat, because a Chromebook loading a painting misses one', () => {
    const m = one([beat(0), beat(30_000)])
    expect(m.onTaskMs).toBe(30_000)
    expect(m.breaks).toBe(0)
    expect(m.awayMs).toBe(0)
  })

  it('REFUSES two missed beats, because nothing the renderer does takes 45 seconds', () => {
    const m = one([beat(0), beat(45_000)])
    expect(m.onTaskMs).toBe(0)
    expect(m.awayMs).toBe(45_000)
    expect(m.breaks).toBe(1)
    // and wall time still says what really elapsed, so the two are comparable
    expect(m.spanMs).toBe(45_000)
  })

  it('reads the cadence off the beat itself, so a slower tick moves the cap with it', () => {
    // 45s is a break at the 15s cadence and is one clean interval at a 60s one
    const m = one([beat(0, { everyMs: 60_000 }), beat(45_000, { everyMs: 60_000 })])
    expect(m.onTaskMs).toBe(45_000)
    expect(m.breaks).toBe(0)
  })
})

describe('time on task', () => {
  it('sums the gaps between consecutive beats', () => {
    const m = one([beat(0), beat(15_000), beat(30_000), beat(45_000)])
    expect(m.beats).toBe(4)
    expect(m.onTaskMs).toBe(45_000)
    expect(doseMinutes(m.onTaskMs)).toBe(0.75)
  })

  it('drops the lunch break whole rather than capping it, which is _summary\'s other answer', () => {
    // api/_summary.ts counts the first IDLE_CAP_MS of an absence as time on task.
    // The beat is regular enough to know better: none of this is time on task.
    const m = one([beat(0), beat(15_000), beat(90 * 60_000), beat(90 * 60_000 + 15_000)])
    expect(m.onTaskMs).toBe(30_000)
    expect(m.breaks).toBe(1)
    expect(m.awayMs).toBe(90 * 60_000 - 15_000)
  })

  it('never carries a gap across two sessions', () => {
    const m = one([
      beat(0, {}, { sid: 's1' }), beat(15_000, {}, { sid: 's1' }),
      beat(7 * 24 * 3600_000, {}, { sid: 's2' }), beat(7 * 24 * 3600_000 + 15_000, {}, { sid: 's2' }),
    ])
    expect(m.sessions).toBe(2)
    expect(m.onTaskMs).toBe(30_000)
    // a week between sittings is not a break inside a run, it is two runs
    expect(m.breaks).toBe(0)
  })

  it('gives a single beat a duration of zero rather than an interval it did not earn', () => {
    const m = one([beat(0)])
    expect(m.beats).toBe(1)
    expect(m.onTaskMs).toBe(0)
  })
})

describe('what the fold refuses to read', () => {
  it('reads heartbeats and NOTHING else, which is what makes islands comparable', () => {
    // a chatty island and a quiet one beat at the same rate; every other event
    // would make the chatty one look longer
    const rows = [
      beat(0), beat(15_000),
      beat(15_100, {}, { name: 'dialogue_advanced' }),
      beat(15_200, {}, { name: 'check_answered' }),
      beat(30_000),
    ]
    const r = dose(rows)
    expect(r.beatRows).toBe(3)
    expect(r.participants[0].onTaskMs).toBe(30_000)
  })

  it('deduplicates on eid, because a batch ships twice after a page death', () => {
    const m = one([
      beat(0, {}, { eid: 'dup' }),
      beat(0, {}, { eid: 'dup' }),
      beat(15_000, {}, { eid: 'other' }),
    ])
    expect(m.beats).toBe(2)
    expect(m.onTaskMs).toBe(15_000)
  })

  it('ignores a row with no participant rather than inventing one', () => {
    const r = dose([{ participantId: null, sessionId: 's', at: T0, payload: { event: { type: 'game', name: 'heartbeat' } } }])
    expect(r.participants).toEqual([])
    expect(r.beatRows).toBe(0)
  })

  it('answers an empty report for no rows at all, with the assumptions still stated', () => {
    const r = dose([])
    expect(r.beatRows).toBe(0)
    expect(r.totals).toEqual({ participants: 0, beats: 0, onTaskMs: 0, awayMs: 0, breaks: 0 })
    expect(r.cadenceMs).toBe(HEARTBEAT_MS)
  })
})

describe('which clock times a session', () => {
  it('uses the CLIENT stamp, so an offline queue draining in one batch still measures', () => {
    // the Chromebook lost the network for a minute and drained five beats in one
    // POST: every row carries the same insert time and the beats are 15s apart
    const rows = [0, 15_000, 30_000, 45_000, 60_000].map((o) =>
      beat(o, {}, { serverAt: T0 + 60_000 }))
    const m = one(rows)
    expect(m.onTaskMs).toBe(60_000)
    expect(m.serverClocked).toBe(0)
    // and the server clock alone would have said the student was there for zero
    expect(m.spanMs).toBe(60_000)
  })

  it('falls back to the server clock when a beat carries no stamp, and SAYS SO', () => {
    const m = one([beat(0, {}, { clientAt: null }), beat(15_000, {}, { clientAt: null })])
    expect(m.onTaskMs).toBe(15_000)
    expect(m.serverClocked).toBe(1)
  })

  it('never mixes the two inside one session, so a skewed clock cannot invent a gap', () => {
    // a machine whose clock is an hour fast: one row without a stamp forces the
    // whole session onto the server's, rather than subtracting one clock from the other
    const skew = 3600_000
    const m = one([
      beat(0, {}, { clientAt: T0 + skew }),
      beat(15_000, {}, { clientAt: null }),
      beat(30_000, {}, { clientAt: T0 + skew + 30_000 }),
    ])
    expect(m.serverClocked).toBe(1)
    expect(m.onTaskMs).toBe(30_000)
    expect(m.breaks).toBe(0)
  })
})

describe('per map, per scene, per session', () => {
  it('slices by the map the beat was stamped with, and the slices SUM to the total', () => {
    const m = one([
      beat(0, { map: 'hub' }), beat(15_000, { map: 'hub' }), beat(30_000, { map: 'hub' }),
      beat(45_000, { map: 'panther-maw' }), beat(60_000, { map: 'panther-maw' }),
    ])
    expect(m.onTaskMs).toBe(60_000)
    const byMap = Object.fromEntries(m.byMap.map((s) => [s.key, s.onTaskMs]))
    expect(byMap).toEqual({ hub: 30_000, 'panther-maw': 30_000 })
    expect(m.byMap.reduce((n, s) => n + s.onTaskMs, 0)).toBe(m.onTaskMs)
  })

  it('credits an interval to the beat that CLOSED it, so there is one rule and not two', () => {
    const m = one([beat(0, { map: 'hub' }), beat(15_000, { map: 'panther-maw' })])
    expect(m.byMap.find((s) => s.key === 'panther-maw')?.onTaskMs).toBe(15_000)
    expect(m.byMap.find((s) => s.key === 'hub')?.onTaskMs).toBe(0)
    // and the hub still appears, with a beat and no time, rather than vanishing
    expect(m.byMap.find((s) => s.key === 'hub')?.beats).toBe(1)
  })

  it('puts a beat with no map in its own bucket instead of losing it', () => {
    // the title screen and the planner beat with map: null (SceneManager stamps
    // scene, PmapScene stamps map and clears it on the way out)
    const m = one([
      beat(0, { scene: 'title' }), beat(15_000, { scene: 'title' }),
      beat(30_000, { scene: 'pmap', map: 'hub' }),
    ])
    expect(m.byMap.find((s) => s.key === '(none)')?.onTaskMs).toBe(15_000)
    expect(m.byScene.find((s) => s.key === 'title')?.onTaskMs).toBe(15_000)
    expect(m.byScene.find((s) => s.key === 'pmap')?.onTaskMs).toBe(15_000)
  })

  it('slices by session, which is what "one sitting" means in a 45 minute advisory', () => {
    const m = one([
      beat(0, {}, { sid: 'mon' }), beat(15_000, {}, { sid: 'mon' }),
      beat(1000_000, {}, { sid: 'tue' }), beat(1_030_000, {}, { sid: 'tue' }),
    ])
    const bySession = Object.fromEntries(m.bySession.map((s) => [s.key, s.onTaskMs]))
    expect(bySession).toEqual({ mon: 15_000, tue: 30_000 })
  })

  it('sorts the longest slice first, which is the question a reviewer asks', () => {
    const m = one([
      beat(0, { map: 'a' }), beat(15_000, { map: 'a' }),
      beat(30_000, { map: 'b' }), beat(45_000, { map: 'b' }), beat(60_000, { map: 'b' }),
    ])
    expect(m.byMap.map((s) => s.key)).toEqual(['b', 'a'])
  })
})

describe('who the dose belongs to', () => {
  it('splits by participant, sorts, and totals across the class', () => {
    const r = dose([
      beat(0, {}, { pid: 'p_b' }), beat(15_000, {}, { pid: 'p_b' }),
      beat(0, {}, { pid: 'p_a' }), beat(15_000, {}, { pid: 'p_a' }), beat(30_000, {}, { pid: 'p_a' }),
    ])
    expect(r.participants.map((p) => p.participantId)).toEqual(['p_a', 'p_b'])
    expect(r.totals).toEqual({ participants: 2, beats: 5, onTaskMs: 45_000, awayMs: 0, breaks: 0 })
  })

  it('takes the arm off the envelope and marks a captain session so a study can drop it', () => {
    const m = one([beat(0, {}, { mode: 'plain' }), beat(15_000, {}, { mode: 'plain', dev: true })])
    expect(m.arm).toBe('plain')
    expect(m.dev).toBe(true)
  })
})

/* ---- and the same fold through the shipped endpoint, against the file store ---
 *
 * The fold above is the arithmetic. These two prove the read exists end to end:
 * a beat posted to api/log.ts comes back out of api/dose.ts as a duration, with
 * no database anywhere. Same pattern as api/handlers.test.ts.
 */
const DB = path.join(os.tmpdir(), `blhs-dose-test-${process.pid}.json`)

beforeEach(() => {
  delete process.env.DATABASE_URL
  process.env.BLHS_DEV_DB = 'file'
  process.env.BLHS_DEV_DB_PATH = DB
  if (fs.existsSync(DB)) fs.unlinkSync(DB)
})

function req(method: string, body?: unknown, url = '/') {
  const chunks = body === undefined ? [] : [new TextEncoder().encode(JSON.stringify(body))]
  return { method, url, [Symbol.asyncIterator]: async function* () { for (const c of chunks) yield c } }
}
function res() {
  return {
    statusCode: 0, body: '',
    setHeader() { /* noop */ },
    end(s: string) { this.body = s },
    get json() { return JSON.parse(this.body) },
  }
}

describe('the endpoint, which is the half that proves dose end to end', () => {
  it('turns beats posted to /api/log into minutes on task, per map, with no database', async () => {
    const c = res()
    await teacherHandler(req('POST', { op: 'create', name: 'Wiseman P3' }), c)
    const cls = c.json as { classId: string; code: string; teacherKey: string }

    const j = res()
    await joinHandler(req('POST', { code: cls.code, handle: 'BraveTide' }), j)
    const pid = j.json.participantId as string

    const at = (o: number, map: string | null) => ({
      participantId: pid, sessionId: 's1', mode: 'game', eid: `hb${o}`,
      event: { type: 'game', name: 'heartbeat', at: T0 + o, data: { everyMs: 15_000, map, scene: 'pmap' } },
    })
    await logHandler(req('POST', [
      at(0, 'hub'), at(15_000, 'hub'), at(30_000, 'hub'), at(45_000, 'hub'),
      // and a break longer than the cap: they left the room
      at(600_000, 'panther-maw'), at(615_000, 'panther-maw'),
    ]), res())

    const out = res()
    await doseHandler(req('GET', undefined, `/api/dose?classId=${cls.classId}&teacherKey=${cls.teacherKey}`), out)
    expect(out.statusCode).toBe(200)
    const d = out.json
    expect(d.beatRows).toBe(6)
    expect(d.cadenceMs).toBe(15_000)
    expect(d.gapCapMs).toBe(37_500)
    expect(d.participants).toHaveLength(1)
    const p = d.participants[0]
    expect(p.handle).toBe('BraveTide')
    expect(p.onTaskMs).toBe(60_000)
    expect(p.onTaskMinutes).toBe(1)
    expect(p.breaks).toBe(1)
    expect(Object.fromEntries(p.byMap.map((s: { key: string; onTaskMs: number }) => [s.key, s.onTaskMs])))
      .toEqual({ hub: 45_000, 'panther-maw': 15_000 })
    // the all-events number rides along so the beat has something to be checked against
    expect(p.allEventsActiveMs).toBeGreaterThan(0)
    // and the participant id never leaves the handler, same as every other op
    expect(p).not.toHaveProperty('participantId')
  })

  it('refuses without the capability key, because a dose table is minors\' activity data', async () => {
    const c = res()
    await teacherHandler(req('POST', { op: 'create', name: 'Wiseman P3' }), c)
    const bad = res()
    await doseHandler(req('POST', { classId: c.json.classId, teacherKey: 'tk_wrong' }), bad)
    expect(bad.statusCode).toBe(403)
  })
})
