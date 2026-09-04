/* THE READER'S ARITHMETIC, which is the whole dependent variable.
 *
 * Nothing in api/ has ever read the events table, so every number below is one
 * the study could not previously produce. These tests are the contract: if a
 * refactor changes what "time on task" means, or lets a duplicate batch count
 * twice, or merges places into programmes, a test names it.
 */
import { describe, it, expect } from 'vitest'
import { summarise, exportRows, eventName, EXPORT_COLUMNS, IDLE_CAP_MS, type StoredEvent } from './_summary.js'

const T0 = Date.UTC(2026, 8, 1, 9, 0, 0)

let n = 0
const ev = (
  name: string,
  atOffsetMs: number,
  data: Record<string, unknown> = {},
  over: Partial<{ pid: string; sid: string; mode: string; dev: boolean; eid: string }> = {},
): StoredEvent => ({
  participantId: over.pid ?? 'p_1',
  sessionId: over.sid ?? 's1',
  at: new Date(T0 + atOffsetMs).toISOString(),
  payload: {
    participantId: over.pid ?? 'p_1',
    mode: over.mode ?? 'game',
    ...(over.dev ? { dev: true } : {}),
    eid: over.eid ?? `e${n++}`,
    event: { type: 'game', name, at: T0 + atOffsetMs, data },
  },
})

describe('reading an event whatever shape it arrived in', () => {
  it('reads a vine event by name and a grape event by type', () => {
    expect(eventName({ event: { type: 'game', name: 'heartbeat' } })).toBe('heartbeat')
    expect(eventName({ event: { type: 'quiz_item_answered' } })).toBe('quiz_item_answered')
    expect(eventName({})).toBe('')
  })
})

describe('time on task', () => {
  it('sums the gaps between consecutive events in a session', () => {
    const rows = [ev('heartbeat', 0), ev('heartbeat', 15_000), ev('heartbeat', 30_000)]
    const [m] = summarise(rows)
    expect(m.activeMs).toBe(30_000)
    expect(m.heartbeats).toBe(3)
    expect(m.spanMs).toBe(30_000)
  })

  it('CAPS a gap, so a tab left open over lunch is not two hours on task', () => {
    const rows = [ev('heartbeat', 0), ev('heartbeat', 90 * 60_000)]
    const [m] = summarise(rows)
    expect(m.activeMs).toBe(IDLE_CAP_MS)      // at most this, not ninety minutes
    expect(m.spanMs).toBe(90 * 60_000)        // and wall time still says what it was
  })

  it('does not carry a gap across two sessions', () => {
    const rows = [
      ev('heartbeat', 0, {}, { sid: 's1' }),
      ev('heartbeat', 15_000, {}, { sid: 's1' }),
      ev('heartbeat', 7 * 24 * 3600_000, {}, { sid: 's2' }),
    ]
    const [m] = summarise(rows)
    expect(m.activeMs).toBe(15_000)
    expect(m.sessions).toBe(2)
  })

  it('measures off WHEN THE EVENT HAPPENED, not when its row was written', () => {
    /* the offline-queue collapse: a Chromebook that lost the network drains six
     * events in one POST, and `appendEvents` writes the whole batch on one
     * timestamp. Read off the row, every gap inside a batch was zero, so
     * active_minutes was smallest for the students whose network was worst. */
    const inserted = new Date(T0 + 10 * 60_000).toISOString()
    const rows = [0, 15_000, 30_000, 45_000].map((o) => ({ ...ev('heartbeat', o), at: inserted }))
    const [m] = summarise(rows)
    expect(m.activeMs).toBe(45_000)
    expect(m.spanMs).toBe(45_000)
  })

  it('says how many heartbeats arrived, so zero reads as "this duration is a guess"', () => {
    const [m] = summarise([ev('scene_shown', 0), ev('scene_shown', 1000)])
    expect(m.heartbeats).toBe(0)
    expect(m.activeMs).toBe(1000)
  })
})

describe('the dependent variable', () => {
  it('carries the score, the FIRST score, the attempts and the retakes', () => {
    const rows = [
      ev('core_beat_complete', 0, { id: 'core:y1', grade: 2, firstGrade: 2, tries: 1 }),
      ev('retake_used', 1000, { beat: 'core:y1', tries: 2 }),
      ev('core_beat_complete', 2000, { id: 'core:y1', grade: 3.5, firstGrade: 2, tries: 2 }),
    ]
    const [m] = summarise(rows)
    expect(m.beatsCompleted).toBe(2)
    expect(m.meanGrade).toBe(2.75)          // best-of-two is the student's number
    expect(m.meanFirstGrade).toBe(2)        // the first attempt is the study's
    expect(m.maxTries).toBe(2)
    expect(m.retakes).toBe(1)
  })

  it('counts items answered and items right, not just a correct boolean', () => {
    const rows = [
      ev('check_answered', 0, { item: 'a', correct: true, earned: 1, total: 1, tries: 1 }),
      ev('check_answered', 500, { item: 'b', correct: false, earned: 0, total: 1, tries: 1 }),
      ev('check_answered', 900, { item: 'c', correct: true, earned: 3, total: 4, tries: 1 }),
    ]
    const [m] = summarise(rows)
    expect(m.checksAnswered).toBe(3)
    expect(m.checksCorrect).toBe(2)
  })

  it('keeps places seen and programmes finished as two different numbers', () => {
    const rows = [
      ev('place_seen', 0, { place: 'stadium' }),
      ev('place_seen', 1000, { place: 'stadium' }),        // the same place again
      ev('programme_completed', 2000, { programme: 'football' }),
      ev('programme_completed', 3000, { programme: 'track-field' }),
    ]
    const [m] = summarise(rows)
    expect(m.placesSeen).toBe(1)              // one place, seen twice
    expect(m.programmesCompleted).toBe(2)     // two programmes, at that one place
  })

  it('counts failures, because one arm crashing looks exactly like an effect', () => {
    const [m] = summarise([ev('island_failed', 0, { anchor: 'hearth', error: 'boom' })])
    expect(m.failures).toBe(1)
  })
})

describe('honesty about the rows themselves', () => {
  it('deduplicates on eid, because a batch can ship twice after a page death', () => {
    const rows = [
      ev('heartbeat', 0, {}, { eid: 'dup' }),
      ev('heartbeat', 15_000, {}, { eid: 'dup' }),
      ev('heartbeat', 30_000, {}, { eid: 'other' }),
    ]
    const [m] = summarise(rows)
    expect(m.events).toBe(2)
  })

  it('takes the arm off the envelope, and lets a mid-session join re-point it', () => {
    const rows = [
      ev('title_shown', 0, {}, { mode: 'game' }),
      ev('join_ok', 1000, {}, { mode: 'plain' }),
    ]
    const [m] = summarise(rows)
    expect(m.arm).toBe('plain')
  })

  it('marks a captain session so a study export can drop it', () => {
    const [m] = summarise([ev('noclip', 0, {}, { dev: true }), ev('heartbeat', 1000)])
    expect(m.dev).toBe(true)
  })

  it('splits by participant and sorts, so two students never merge', () => {
    const rows = [
      ev('heartbeat', 0, {}, { pid: 'p_b' }),
      ev('heartbeat', 1000, {}, { pid: 'p_a' }),
      ev('heartbeat', 2000, {}, { pid: 'p_a' }),
    ]
    const ms = summarise(rows)
    expect(ms.map((m) => m.participantId)).toEqual(['p_a', 'p_b'])
    expect(ms[0].events).toBe(2)
    expect(ms[1].events).toBe(1)
  })

  it('ignores a row with no participant rather than inventing one', () => {
    expect(summarise([{ participantId: null, sessionId: 's', at: T0, payload: {} }])).toEqual([])
  })
})

describe('the export a teacher actually downloads', () => {
  const roster = [
    { handle: 'BraveTide', arm: 'game', created_at: '2026-09-01', last_seen: '2026-09-01', year: '2', beat: 'planner', graduated: false, code: null, participantId: 'p_1' },
    { handle: 'QuietHarbor', arm: 'plain', created_at: '2026-09-01', last_seen: null, year: '1', beat: 'intro:i1', graduated: false, code: null, participantId: 'p_2' },
  ]

  it('has one column per header and never drifts between them', () => {
    const rows = exportRows(roster, summarise([ev('heartbeat', 0)]))
    for (const r of rows) expect(r).toHaveLength(EXPORT_COLUMNS.length)
  })

  it('carries score, duration and attempts, which the eight-column version could not', () => {
    const measures = summarise([
      ev('heartbeat', 0), ev('heartbeat', 60_000),
      ev('core_beat_complete', 60_000, { grade: 3.5, firstGrade: 2, tries: 2 }),
    ])
    const [row] = exportRows(roster, measures)
    const cell = (name: string) => row[EXPORT_COLUMNS.indexOf(name as never)]
    expect(cell('handle')).toBe('BraveTide')
    expect(cell('mean_grade')).toBe(3.5)
    expect(cell('mean_first_grade')).toBe(2)
    expect(cell('max_tries')).toBe(2)
    expect(cell('active_minutes')).toBe(1)
    expect(cell('heartbeats')).toBe(2)
  })

  it('KEEPS a student who logged nothing, with zeros, rather than dropping them', () => {
    // a blocked network is exactly the student most worth noticing, and an export
    // that silently omits them makes them look absent rather than excluded
    const rows = exportRows(roster, summarise([ev('heartbeat', 0)]))
    expect(rows).toHaveLength(2)
    expect(rows[1][EXPORT_COLUMNS.indexOf('handle' as never)]).toBe('QuietHarbor')
    expect(rows[1][EXPORT_COLUMNS.indexOf('events' as never)]).toBe(0)
  })
})
