// The wire client (§7.7/§13): join, code check, and cross-device pull semantics.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

async function freshNet() {
  vi.resetModules()
  const save = await import('./save')
  const net = await import('./net')
  return { save, net }
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.unstubAllGlobals() })

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response

describe('joinClass', () => {
  it('persists participantId, arm, classCode AND the server-final handle to the run', async () => {
    const { save, net } = await freshNet()
    save.beginAdventure()
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(200, { participantId: 'p_1', arm: 'plain', className: 'P3', handle: 'BraveTide2' })))
    const r = await net.joinClass('devdev', 'BraveTide')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.handle).toBe('BraveTide2')   // the twin suffix travels back
    const s = save.loadSave()!
    expect(s.participantId).toBe('p_1')
    expect(s.arm).toBe('plain')
    expect(s.classCode).toBe('DEVDEV')
    expect(s.handle).toBe('BraveTide2')
  })

  it('maps server statuses to kind reasons', async () => {
    const { net } = await freshNet()
    for (const [status, reason] of [[503, 'offline'], [404, 'unknown_code'], [403, 'class_closed'], [500, 'error']] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(status, {})))
      const r = await net.joinClass('ABCDEF', 'X')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe(reason)
    }
  })

  it('a network throw is offline, not a crash', async () => {
    const { net } = await freshNet()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    const r = await net.joinClass('ABCDEF', 'X')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('offline')
  })

  it('the captain walks through any gate, locally', async () => {
    const { save, net } = await freshNet()
    save.beginAdventure()
    localStorage.setItem('blhs_captain', '1')   // dev pass is active under vitest (DEV)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await net.joinClass('ANYTHN', 'X')
    expect(r.ok).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(save.loadSave()!.participantId).toBe('captain')
  })
})

describe('checkClass (the code card, no participant created)', () => {
  it('returns the class name on a good code', async () => {
    const { net } = await freshNet()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { className: 'Wiseman P3' })))
    const r = await net.checkClass('DEVDEV')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.className).toBe('Wiseman P3')
  })
  it('maps unknown/closed/offline', async () => {
    const { net } = await freshNet()
    for (const [status, reason] of [[404, 'unknown_code'], [403, 'class_closed'], [503, 'offline']] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(status, {})))
      const r = await net.checkClass('XXXXXX')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe(reason)
    }
  })
})

describe('pullState (cross-device resume)', () => {
  it('applies a NEWER server save', async () => {
    const { save, net } = await freshNet()
    save.beginAdventure()
    save.writeSave({ participantId: 'p_1', handle: 'Old' })
    const local = save.loadSave()!
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(200, { save: { ...local, handle: 'FromServer', savedAt: Date.now() + 60_000 } })))
    expect(await net.pullState()).toBe(true)
    expect(save.loadSave()!.handle).toBe('FromServer')
  })

  it('keeps a NEWER local save', async () => {
    const { save, net } = await freshNet()
    save.beginAdventure()
    save.writeSave({ participantId: 'p_1', handle: 'Newer' })
    const local = save.loadSave()!
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(200, { save: { ...local, handle: 'Stale', savedAt: 5 } })))
    expect(await net.pullState()).toBe(false)
    expect(save.loadSave()!.handle).toBe('Newer')
  })

  it('no participant yet: never even calls the server', async () => {
    const { save, net } = await freshNet()
    save.beginAdventure()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await net.pullState()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
