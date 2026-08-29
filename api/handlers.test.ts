// The four endpoints, run whole against the file store — the same handler code Vercel runs,
// the same store the vite dev bridge uses. This is the join/state/log/teacher contract:
// create class -> check code -> join -> sync save -> roster.
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import joinHandler from './join'
import stateHandler from './state'
import logHandler from './log'
import teacherHandler from './teacher'
import { armFor } from './_logic'

const DB = path.join(os.tmpdir(), `blhs-handler-test-${process.pid}.json`)

beforeEach(() => {
  delete process.env.DATABASE_URL
  process.env.BLHS_DEV_DB = 'file'
  process.env.BLHS_DEV_DB_PATH = DB
  if (fs.existsSync(DB)) fs.unlinkSync(DB)
})

// minimal Vercel-shaped req/res
function req(method: string, body?: unknown, url = '/') {
  const chunks = body === undefined ? [] : [new TextEncoder().encode(JSON.stringify(body))]
  return {
    method, url,
    [Symbol.asyncIterator]: async function* () { for (const c of chunks) yield c },
  }
}
function res() {
  return {
    statusCode: 0, body: '',
    setHeader() { /* noop */ },
    end(s: string) { this.body = s },
    get json() { return JSON.parse(this.body) },
  }
}

async function createClass(name = 'Wiseman P3', studyMode = false) {
  const r = res()
  await teacherHandler(req('POST', { op: 'create', name, studyMode }), r)
  expect(r.statusCode).toBe(200)
  return r.json as { classId: string; code: string; teacherKey: string }
}

describe('teacher create + join code check', () => {
  it('creates a class and the code card can verify it', async () => {
    const cls = await createClass()
    expect(cls.code).toMatch(/^[A-Z2-9]{6}$/)
    const r = res()
    await joinHandler(req('GET', undefined, `/api/join?code=${cls.code}`), r)
    expect(r.statusCode).toBe(200)
    expect(r.json.className).toBe('Wiseman P3')
  })
  it('an unknown code is a kind 404, not a 500', async () => {
    const r = res()
    await joinHandler(req('GET', undefined, '/api/join?code=XXXXXX'), r)
    expect(r.statusCode).toBe(404)
  })
})

describe('join (§7.7 one student = one run)', () => {
  it('creates a participant with the REAL handle', async () => {
    const cls = await createClass()
    const r = res()
    await joinHandler(req('POST', { code: cls.code, handle: 'BraveTide' }), r)
    expect(r.statusCode).toBe(200)
    expect(r.json.handle).toBe('BraveTide')
    expect(r.json.participantId).toMatch(/^p_/)
  })

  it('the same handle rejoining IS the same student — even case-shifted', async () => {
    const cls = await createClass()
    const a = res()
    await joinHandler(req('POST', { code: cls.code, handle: 'BraveTide' }), a)
    const b = res()
    await joinHandler(req('POST', { code: cls.code, handle: 'bravetide' }), b)
    expect(b.json.participantId).toBe(a.json.participantId)
    expect(b.json.returning).toBe(true)
  })

  it('different handles are DIFFERENT participants (the hardcoded-Panther regression)', async () => {
    const cls = await createClass()
    const a = res(); const b = res()
    await joinHandler(req('POST', { code: cls.code, handle: 'BraveTide' }), a)
    await joinHandler(req('POST', { code: cls.code, handle: 'GoldenGull' }), b)
    expect(a.json.participantId).not.toBe(b.json.participantId)
  })

  it('study mode assigns each participant the deterministic armFor arm; rejoining keeps it', async () => {
    const cls = await createClass('Study P1', true)
    for (const h of ['BraveTide', 'GoldenGull', 'QuietHarbor']) {
      const r = res()
      await joinHandler(req('POST', { code: cls.code, handle: h }), r)
      expect(r.json.arm).toBe(armFor(cls.classId, h))   // the exact §13.2 contract
      const again = res()
      await joinHandler(req('POST', { code: cls.code, handle: h }), again)
      expect(again.json.arm).toBe(r.json.arm)           // returning keeps the arm
    }
  })

  it('a closed class refuses NEW joiners but lets a mid-run student resume', async () => {
    const cls = await createClass()
    const a = res()
    await joinHandler(req('POST', { code: cls.code, handle: 'BraveTide' }), a)
    const shut = res()
    await teacherHandler(req('POST', { op: 'setOpen', classId: cls.classId, teacherKey: cls.teacherKey, open: false }), shut)
    const newKid = res()
    await joinHandler(req('POST', { code: cls.code, handle: 'GoldenGull' }), newKid)
    expect(newKid.statusCode).toBe(403)
    const returning = res()
    await joinHandler(req('POST', { code: cls.code, handle: 'BraveTide' }), returning)
    expect(returning.statusCode).toBe(200)
    expect(returning.json.returning).toBe(true)
  })
})

describe('state sync (§7.7 server truth)', () => {
  it('round-trips a save and 404s an unknown participant', async () => {
    const post = res()
    await stateHandler(req('POST', { participantId: 'p_test1', save: { year: 2, beat: 'planner' } }), post)
    expect(post.statusCode).toBe(200)
    const get = res()
    await stateHandler(req('GET', undefined, '/api/state?participantId=p_test1'), get)
    expect(get.json.save.year).toBe(2)
    const missing = res()
    await stateHandler(req('GET', undefined, '/api/state?participantId=p_nobody'), missing)
    expect(missing.statusCode).toBe(404)
  })

  it('rejects a giant blob that is not a save', async () => {
    const r = res()
    await stateHandler(req('POST', { participantId: 'p_t', save: { blob: 'x'.repeat(300_000) } }), r)
    expect(r.statusCode).toBe(413)
  })
})

describe('the event drain (§13)', () => {
  it('accepts a batch, INCLUDING pre-join anon and captain envelopes', async () => {
    const r = res()
    await logHandler(req('POST', [
      { participantId: 'anon12345', sessionId: 's1', event: { name: 'title_shown' } },
      { participantId: 'captain', sessionId: 's1', dev: true, event: { name: 'noclip' } },
      { participantId: 'p_real', sessionId: 's1', event: { name: 'join_ok' } },
    ]), r)
    expect(r.statusCode).toBe(200)
    expect(r.json.n).toBe(3)
  })
  it('caps a runaway batch at 500', async () => {
    const r = res()
    await logHandler(req('POST', Array.from({ length: 600 }, (_, i) => ({ sessionId: `e${i}` }))), r)
    expect(r.json.n).toBe(500)
  })
})

describe('the export, which is the first thing in api/ that reads the events table', () => {
  it('joins a class\'s events to its roster and carries score, duration and attempts', async () => {
    const cls = await createClass('Study P1', true)
    const j = res()
    await joinHandler(req('POST', { code: cls.code, handle: 'BraveTide' }), j)
    const pid = j.json.participantId as string
    await stateHandler(req('POST', { participantId: pid, save: { year: 2, beat: 'planner' } }), res())

    const env = (name: string, data: Record<string, unknown> = {}) => ({
      participantId: pid, sessionId: 's1', mode: 'game', eid: `${name}:${Math.random()}`,
      event: { type: 'game', name, at: Date.now(), data },
    })
    await logHandler(req('POST', [
      env('heartbeat'), env('heartbeat'),
      env('place_seen', { place: 'stadium' }),
      env('programme_completed', { programme: 'football' }),
      env('core_beat_complete', { grade: 3.5, firstGrade: 2, tries: 2 }),
      env('check_answered', { item: 'a', correct: true, tries: 2 }),
      // an event from another device's pre-join anon id: real, and not this class's
      { participantId: 'anon999', sessionId: 's9', event: { type: 'game', name: 'title_shown' } },
    ]), res())

    const out = res()
    await teacherHandler(req('POST', { op: 'export', classId: cls.classId, teacherKey: cls.teacherKey }), out)
    expect(out.statusCode).toBe(200)
    const d = out.json as { columns: string[]; rows: (string | number)[][]; events: number }
    expect(d.events).toBe(6)                       // the anon row belongs to no class here
    expect(d.rows).toHaveLength(1)
    const cell = (name: string) => d.rows[0][d.columns.indexOf(name)]
    expect(cell('handle')).toBe('BraveTide')
    expect(cell('mean_grade')).toBe(3.5)
    expect(cell('mean_first_grade')).toBe(2)
    expect(cell('max_tries')).toBe(2)
    expect(cell('heartbeats')).toBe(2)
    expect(cell('places_seen')).toBe(1)
    expect(cell('programmes_completed')).toBe(1)
    expect(cell('year')).toBe('2')
  })

  it('refuses without the capability key, same as every other op', async () => {
    const cls = await createClass()
    const bad = res()
    await teacherHandler(req('POST', { op: 'export', classId: cls.classId, teacherKey: 'tk_wrong' }), bad)
    expect(bad.statusCode).toBe(403)
  })

  it('never leaks the participant id off the roster op', async () => {
    const cls = await createClass()
    await joinHandler(req('POST', { code: cls.code, handle: 'BraveTide' }), res())
    const roster = res()
    await teacherHandler(req('POST', { op: 'roster', classId: cls.classId, teacherKey: cls.teacherKey }), roster)
    expect(roster.json.roster[0]).not.toHaveProperty('participant_id')
    expect(roster.json.roster[0]).not.toHaveProperty('save')
  })
})

describe('teacher roster (§13.3)', () => {
  it('shows handles, arms, and progress — and refuses a bad key', async () => {
    const cls = await createClass()
    const j = res()
    await joinHandler(req('POST', { code: cls.code, handle: 'BraveTide' }), j)
    await stateHandler(req('POST', { participantId: j.json.participantId, save: { year: 3, beat: 'planner' } }), res())
    const roster = res()
    await teacherHandler(req('POST', { op: 'roster', classId: cls.classId, teacherKey: cls.teacherKey }), roster)
    expect(roster.json.roster).toHaveLength(1)
    expect(roster.json.roster[0].handle).toBe('BraveTide')
    expect(roster.json.roster[0].year).toBe('3')
    const bad = res()
    await teacherHandler(req('POST', { op: 'roster', classId: cls.classId, teacherKey: 'tk_wrong' }), bad)
    expect(bad.statusCode).toBe(403)
  })
})
