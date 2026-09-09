// The offline-first logger — the AP Research data layer. Chunked draining, live identity,
// the dev flag, demo silence, and the reentrancy guard are all regressions from Act Zero.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Logger } from './logging'
import type { GrapeEvent } from './events'

const EV: GrapeEvent = { type: 'game', name: 'test', grapeId: 'vine', at: 1 }

const mkLogger = (endpoint?: string) =>
  new Logger({ appVersion: 't', sessionId: 's1', participantId: 'anon1', mode: 'game', endpoint, flushIntervalMs: 60_000 })

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('envelopes', () => {
  it('stamps identity, an eid, and persists the queue', () => {
    const log = mkLogger()
    log.log(EV)
    const q = JSON.parse(localStorage.getItem('blhs_log_queue')!)
    expect(q).toHaveLength(1)
    expect(q[0].participantId).toBe('anon1')
    expect(q[0].mode).toBe('game')
    expect(q[0].eid).toBeTruthy()
    expect(q[0].dev).toBeUndefined()
    log.dispose()
  })

  it('identity is LIVE: a mid-session join re-points new envelopes only', () => {
    const log = mkLogger()
    log.log(EV)
    log.setIdentity({ participantId: 'p_real', mode: 'plain' })
    log.log(EV)
    const q = JSON.parse(localStorage.getItem('blhs_log_queue')!)
    expect(q[0].participantId).toBe('anon1')      // pre-join stays honest
    expect(q[1].participantId).toBe('p_real')
    expect(q[1].mode).toBe('plain')
    log.dispose()
  })

  it('captain sessions ship flagged dev:true (§2.14)', () => {
    const log = mkLogger()
    log.setIdentity({ dev: true })
    log.log(EV)
    const q = JSON.parse(localStorage.getItem('blhs_log_queue')!)
    expect(q[0].dev).toBe(true)
    log.dispose()
  })

  it('a new Logger inherits the surviving queue (offline-first)', () => {
    const a = mkLogger()
    a.log(EV); a.dispose()
    const b = mkLogger()
    b.log(EV)
    expect(JSON.parse(localStorage.getItem('blhs_log_queue')!)).toHaveLength(2)
    b.dispose()
  })
})

describe('flush', () => {
  it('drains in chunks of 100 so keepalive size caps can never wedge the queue', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(init.body as string)
      return { ok: true } as Response
    }))
    const log = mkLogger('/api/log')
    for (let i = 0; i < 250; i++) log.log(EV)
    await log.flush()
    expect(calls).toHaveLength(3)
    expect(JSON.parse(calls[0])).toHaveLength(100)
    expect(JSON.parse(calls[2])).toHaveLength(50)
    expect(JSON.parse(localStorage.getItem('blhs_log_queue')!)).toHaveLength(0)
    log.dispose()
  })

  it('a failed POST keeps the queue for the next flush', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false } as Response)))
    const log = mkLogger('/api/log')
    log.log(EV)
    await log.flush()
    expect(JSON.parse(localStorage.getItem('blhs_log_queue')!)).toHaveLength(1)
    log.dispose()
  })

  it('a network throw keeps the queue too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const log = mkLogger('/api/log')
    log.log(EV)
    await log.flush()
    expect(JSON.parse(localStorage.getItem('blhs_log_queue')!)).toHaveLength(1)
    log.dispose()
  })

  it('overlapping flushes do not double-send (the interval/pagehide race)', async () => {
    let resolveFetch: (v: Response) => void = () => {}
    const fetchMock = vi.fn(() => new Promise<Response>((r) => { resolveFetch = r }))
    vi.stubGlobal('fetch', fetchMock)
    const log = mkLogger('/api/log')
    log.log(EV)
    const first = log.flush()
    const second = log.flush()   // must be a no-op while the first is in flight
    resolveFetch({ ok: true } as Response)
    await Promise.all([first, second])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    log.dispose()
  })

  it('events logged DURING a flush survive it', async () => {
    const log = mkLogger('/api/log')
    let midFlight = () => {}
    vi.stubGlobal('fetch', vi.fn(async () => {
      midFlight()   // a new event arrives while the POST is in the air
      return { ok: true } as Response
    }))
    log.log(EV)
    midFlight = () => { midFlight = () => {}; log.log(EV) }
    await log.flush()
    // one event shipped; the mid-flight one still queued OR shipped in the same drain loop
    const remaining = JSON.parse(localStorage.getItem('blhs_log_queue')!)
    expect(remaining.length).toBe(0)   // the drain loop's second pass shipped it
    log.dispose()
  })

  it('castaway/demo mode ships NOTHING and drains locally (§2.9)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const log = mkLogger('/api/log')
    log.setIdentity({ localOnly: true })
    log.log(EV)
    await log.flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('blhs_log_queue')!)).toHaveLength(0)
    log.dispose()
  })

  it('no endpoint (dev): the queue simply waits', async () => {
    const log = mkLogger(undefined)
    log.log(EV)
    await log.flush()
    expect(JSON.parse(localStorage.getItem('blhs_log_queue')!)).toHaveLength(1)
    log.dispose()
  })
})

/* ---- A DEPLOY WITH NO DATABASE IS ASKED ONCE ------------------------------
 *
 * `api/log.ts` answers 503 `{offline:true}` when the deploy carries no
 * DATABASE_URL, which is its honest degrade and is the live state today. The
 * logger kept the queue and retried every five seconds for the whole session:
 * a console full of red on a school Chromebook, and one request per student per
 * five seconds against one access point. Measured on the live deploy 2026-09-08
 * while driving the ending gate, which logged fifteen of them in ten minutes. */
describe('the study endpoint saying it is offline', () => {
  it('is believed, once, and the queue stops growing', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls.push('sent')
      return { ok: false, status: 503, json: async () => ({ offline: true }) } as unknown as Response
    }))
    const log = mkLogger('/api/log')
    log.log(EV)
    await log.flush()
    expect(calls).toHaveLength(1)
    /* and every later event is dropped rather than queued for a collector that
     * will never come */
    log.log(EV)
    log.log(EV)
    await log.flush()
    await log.flush()
    expect(calls, 'it asked again after being told there is no database').toHaveLength(1)
  })

  it('but an ordinary failure still keeps the queue and retries', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      n++
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response
    }))
    const log = mkLogger('/api/log')
    log.log(EV)
    await log.flush()
    await log.flush()
    expect(n, 'a dropped request is exactly what the retry is for').toBe(2)
  })
})
