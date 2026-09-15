/* tests for the sound library: an unknown name refuses, and the table matches the folder */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SFX_DIR = path.resolve(process.cwd(), 'public/sfx')

/* a clean copy of the player per test, with the refusal class from the same reload */
async function fresh() {
  vi.resetModules()
  const audio = await import('./audio')
  const { NotBuilt } = await import('../vine/intents')
  return { audio, NotBuilt }
}

/* turns sound on the way the Sound control does, because it is off until somebody picks it */
function soundOn() {
  localStorage.setItem('blhs_settings_v1', JSON.stringify({ sound: 'full', mute: false }))
}

beforeEach(() => { localStorage.clear() })

describe('a name the library does not hold', () => {
  it('refuses with NotBuilt rather than going quietly silent', async () => {
    const { audio, NotBuilt } = await fresh()
    expect(() => audio.play('trumpet')).toThrow(NotBuilt)
  })

  it('reads the real names back, so the author can see their own typo', async () => {
    const { audio } = await fresh()
    let msg = ''
    try { audio.play('cork-pip') } catch (e) { msg = (e as Error).message }
    expect(msg).toContain('cork-pip')
    /* the refusal names the whole vocabulary and not a hint, because a member who mistyped one name does not know what the other eleven are called either */
    for (const n of audio.SFX_NAMES) expect(msg).toContain(n)
  })

  it('forgives a hyphen for an underscore and nothing else', async () => {
    const { audio, NotBuilt } = await fresh()
    /* the intro scripted `surf-in` a year before this module existed */
    expect(() => audio.play('surf-in')).not.toThrow()
    expect(() => audio.play('SURF_IN')).toThrow(NotBuilt)
    expect(() => audio.play('surfin')).toThrow(NotBuilt)
  })
})

describe('a registry name with no file behind it', () => {
  it('refuses the same way a name nobody wrote down does', async () => {
    const { audio } = await fresh()
    /* a row in the table with no recording behind it, injected rather than shipped */
    ;(audio.SFX as Record<string, unknown>).thunder =
      { file: null, license: 'CC0-1.0', source: 'https://example.invalid', author: 'nobody' }
    let msg = ''
    try { audio.play('thunder') } catch (e) { msg = (e as Error).message }
    expect(msg).toContain('thunder')
    expect(msg).toMatch(/no file/i)
    delete (audio.SFX as Record<string, unknown>).thunder
  })
})

describe('the table and the folder', () => {
  it('every row points at a file that actually shipped', async () => {
    const { audio: { SFX } } = await fresh()
    const missing: string[] = []
    for (const [name, entry] of Object.entries(SFX)) {
      if (!entry.file) continue
      if (!fs.existsSync(path.join(SFX_DIR, entry.file))) missing.push(`${name} -> ${entry.file}`)
    }
    expect(missing).toEqual([])
  })

  it('every file that shipped has a row, so no byte arrives unlicensed', async () => {
    const { audio: { SFX } } = await fresh()
    const claimed = new Set(Object.values(SFX).map((e) => e.file).filter(Boolean))
    /* LICENSES.md is the licence record and belongs in the folder, the one file here that is not audio and not an orphan */
    const orphans = fs.readdirSync(SFX_DIR)
      .filter((f) => f !== 'LICENSES.md')
      .filter((f) => !claimed.has(f))
    expect(orphans).toEqual([])
  })

  it('holds twelve names and stays inside the Chromebook budget', async () => {
    const { audio: { SFX_NAMES } } = await fresh()
    expect(SFX_NAMES).toHaveLength(12)
    const bytes = fs.readdirSync(SFX_DIR)
      .filter((f) => f !== 'LICENSES.md')
      .reduce((n, f) => n + fs.statSync(path.join(SFX_DIR, f)).size, 0)
    /* 400 KB is the ceiling for the whole set, which is at about 162 KB, and the headroom is there so a replacement effect does not have to be smaller than the one it replaces */
    expect(bytes).toBeLessThan(400_000)
  })

  it('records a licence and a source url on every single row', async () => {
    const { audio: { SFX } } = await fresh()
    for (const [name, entry] of Object.entries(SFX)) {
      /* CC0-1.0 is the only licence this folder takes, so no attribution notice has to travel with the build and nobody can change the terms afterwards */
      expect(entry.license, name).toBe('CC0-1.0')
      expect(entry.source, name).toMatch(/^https:\/\//)
      expect(entry.author.length, name).toBeGreaterThan(0)
    }
  })

  it('names each file in LICENSES.md, which is what a district review reads', async () => {
    const { audio: { SFX } } = await fresh()
    const doc = fs.readFileSync(path.join(SFX_DIR, 'LICENSES.md'), 'utf8')
    for (const entry of Object.values(SFX)) {
      if (!entry.file) continue
      expect(doc, entry.file).toContain(entry.file)
    }
  })
})

describe('before the browser has let anything make a sound', () => {
  it('queues the ask instead of throwing it at the caller', async () => {
    soundOn()
    const { audio } = await fresh()
    expect(audio.isUnlocked()).toBe(false)
    expect(() => audio.play('click')).not.toThrow()
    /* the queue exists for the very first click, which is also the gesture that unlocks sound */
    expect(audio.pending()).toBe(1)
  })

  it('holds a few and no more, so a flush is not a backlog going off at once', async () => {
    const { audio } = await fresh()
    for (let i = 0; i < 20; i++) audio.play('click')
    expect(audio.pending()).toBeLessThanOrEqual(4)
  })

  it('still refuses an unknown name while locked, muted or not', async () => {
    const { audio, NotBuilt } = await fresh()
    audio.setMuted(true)
    /* the refusal happens before the mute is consulted, so a muted student is not the only person in the building who can find a typo */
    expect(() => audio.play('trumpet')).toThrow(NotBuilt)
    expect(() => audio.play('click')).not.toThrow()
    expect(audio.pending()).toBe(0)
    audio.setMuted(false)
  })

  /* pins the rule that nothing plays until a student has picked a sound setting */
  it('is silent on a machine that has never opened Settings', async () => {
    localStorage.removeItem('blhs_settings_v1')
    const { audio } = await fresh()
    audio.play('click')
    expect(audio.pending()).toBe(0)
  })

  it('plays once somebody has actually chosen a sound', async () => {
    localStorage.setItem('blhs_settings_v1', JSON.stringify({ sound: 'full', mute: false }))
    const { audio } = await fresh()
    audio.play('click')
    expect(audio.pending()).toBe(1)
  })

  it('reads the mute out of the settings sheet the student actually clicks', async () => {
    localStorage.setItem('blhs_settings_v1', JSON.stringify({ mute: true, textSize: 'm' }))
    const { audio } = await fresh()
    audio.play('click')
    expect(audio.pending()).toBe(0)
  })

  it('writes the mute back where the settings sheet will find it', async () => {
    localStorage.setItem('blhs_settings_v1', JSON.stringify({ textSize: 'l', skin: 'paper' }))
    const { audio } = await fresh()
    audio.setMuted(true)
    const s = JSON.parse(localStorage.getItem('blhs_settings_v1')!)
    expect(s.mute).toBe(true)
    /* and it leaves the rest of the sheet alone, because this file owns one key */
    expect(s.textSize).toBe('l')
    expect(s.skin).toBe('paper')
  })
})

describe('preload', () => {
  it('refuses a typo the same way play does, at the scene that wrote it', async () => {
    const { audio, NotBuilt } = await fresh()
    await expect(audio.preload(['click', 'trumpet'])).rejects.toThrow(NotBuilt)
  })

  it('settles rather than rejecting when the network is the problem', async () => {
    const { audio } = await fresh()
    /* a Chromebook on district wifi that cannot pull an ogg keeps playing in silence, because the student can do nothing about it and only an author error is worth an exception */
    await expect(audio.preload(['click', 'page'])).resolves.toBeUndefined()
  })
})

/* a miniature Web Audio stack: a context that starts suspended, and a fetch that can fail */
function stubWebAudio(opts: { fetchOk: boolean }) {
  const started: number[] = []
  const ctx = {
    state: 'suspended' as string,
    destination: {},
    resume: async () => { ctx.state = 'running' },
    createGain: () => ({ gain: { value: 1 }, connect: () => {}, disconnect: () => {} }),
    createBufferSource: () => ({
      buffer: null as unknown, onended: null as null | (() => void),
      connect: () => {}, disconnect: () => {},
      start: (t: number) => { started.push(t) },
    }),
    decodeAudioData: async (b: ArrayBuffer) => ({ duration: b.byteLength / 1000 }),
  }
  const g = globalThis as unknown as Record<string, unknown>
  g.AudioContext = function () { return ctx } as unknown
  g.fetch = async () => opts.fetchOk
    ? { ok: true, arrayBuffer: async () => new ArrayBuffer(64) }
    : { ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) }
  return { ctx, started }
}

describe('the first-gesture unlock, against a browser that behaves like Chrome', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    const g = globalThis as unknown as Record<string, unknown>
    delete g.AudioContext
    g.fetch = realFetch
  })

  it('resumes on the first pointerdown and lets the held click through', async () => {
    soundOn()
    const { ctx, started } = stubWebAudio({ fetchOk: true })
    const { audio } = await fresh()
    audio.play('click')
    expect(audio.isUnlocked()).toBe(false)
    expect(audio.pending()).toBe(1)

    window.dispatchEvent(new Event('pointerdown'))
    /* the resume is a promise and so is the decode behind the queued sound, so the flush lands a couple of microtasks later rather than synchronously */
    await new Promise((r) => setTimeout(r, 0))
    expect(ctx.state).toBe('running')
    expect(audio.isUnlocked()).toBe(true)
    expect(audio.pending()).toBe(0)
    await new Promise((r) => setTimeout(r, 0))
    expect(started.length).toBe(1)
  })

  it('plays the second one straight through, decoding the file only once', async () => {
    soundOn()
    const { started } = stubWebAudio({ fetchOk: true })
    let fetches = 0
    const inner = globalThis.fetch
    ;(globalThis as unknown as Record<string, unknown>).fetch = (...a: unknown[]) => {
      fetches++
      return (inner as unknown as (...x: unknown[]) => unknown)(...a)
    }
    const { audio } = await fresh()
    window.dispatchEvent(new Event('pointerdown'))
    await new Promise((r) => setTimeout(r, 0))
    audio.play('click')
    await new Promise((r) => setTimeout(r, 0))
    audio.play('click')
    audio.play('click')
    await new Promise((r) => setTimeout(r, 0))
    /* decode once and play many, and the same buffer overlapping itself is why a fresh BufferSource is built per play rather than one being kept */
    expect(fetches).toBe(1)
    expect(started.length).toBe(3)
  })

  it('swallows a fetch that failed, and does not go back for it every click', async () => {
    soundOn()
    stubWebAudio({ fetchOk: false })
    let fetches = 0
    const inner = globalThis.fetch
    ;(globalThis as unknown as Record<string, unknown>).fetch = (...a: unknown[]) => {
      fetches++
      return (inner as unknown as (...x: unknown[]) => unknown)(...a)
    }
    /* the warning is real and wanted in dev, it just reads as a failure in test output */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { audio } = await fresh()
    window.dispatchEvent(new Event('pointerdown'))
    await new Promise((r) => setTimeout(r, 0))
    expect(() => { audio.play('click'); audio.play('click'); audio.play('click') }).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(fetches).toBe(1)
    warn.mockRestore()
  })
})

describe('the cues the intro already scripted', () => {
  it('are all in the registry, so the beach is not silent and does not throw', async () => {
    const { audio } = await fresh()
    const script = fs.readFileSync(
      path.resolve(process.cwd(), 'src/game/intro/introScript.ts'), 'utf8')
    const cues = [...script.matchAll(/t:\s*'audio',\s*cue:\s*'([^']+)'/g)].map((m) => m[1])
    /* BeachIso's stage calls play() straight through with no try around it, so one of these cues missing would stop the intro dead in a student's first minute */
    expect(cues).toContain('surf-in')
    expect(cues).toContain('cork-pop')
    expect(cues).toContain('sail-snap')
    for (const c of cues) expect(() => audio.play(c), c).not.toThrow()
  })
})
