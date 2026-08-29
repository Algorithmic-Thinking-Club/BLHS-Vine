/* THE LOADER, AND THE FORMAT IT REFUSES.
 *
 * Nothing in here starts a worker. happy-dom has no Worker, and more to the
 * point the worker is where MicroPython lives and a unit test has no business
 * booting a wasm runtime. What IS tested here is everything on this side of the
 * boundary: what counts as an island, where one comes from, and what the fetch
 * does when the thing at the other end is not one.
 *
 * The python half is proven by running it, in the browser, at ?scene=grape.
 *
 * THESE RULES ARE ALSO WRITTEN IN blhs-islands/tools/manifest.py, because a
 * member gets the answer on their own machine in a second instead of in a
 * browser a minute later. Two implementations of one format is a real cost and
 * it is the right trade, but only while both are tested. This is one half.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  FORMAT, baseUrlOf, fetchGrape, islandIdOf, manifestFaults, parseGrapeRef, type GrapeRef,
} from './grape-source'
import { PROTOCOL } from './protocol'

const GOOD = {
  format: 1,
  programme: 'test-club',
  map: 'test-shore',
  title: 'A Test',
  season: 'Winter',
  owner: 'atc',
  entry: 'island.py',
  modules: ['island.py'],
  content: {
    what: { text: 'A thing that does not exist.', source: 'unknown' },
    when: { text: 'Never.', source: 'unknown' },
    how_to_join: { text: 'You cannot.', source: 'unknown' },
    blurb: 'a fixture for tests',
  },
}

/** the manifest with one thing changed, or with a key removed when given undefined */
const bent = (over: Record<string, unknown>) => {
  const m: Record<string, unknown> = { ...GOOD, ...over }
  for (const [k, v] of Object.entries(over)) if (v === undefined) delete m[k]
  return m
}

/** the one complaint, asserting there is exactly one so a test cannot pass by noise */
const one = (m: unknown): string => {
  const f = manifestFaults(m)
  expect(f).toHaveLength(1)
  return f[0]
}

describe('what counts as an island', () => {
  it('accepts a correct manifest', () => {
    expect(manifestFaults(GOOD)).toEqual([])
  })

  it('accepts one with no season, because not everything is seasonal', () => {
    expect(manifestFaults(bent({ season: undefined }))).toEqual([])
  })

  it('refuses anything that is not an object at all', () => {
    for (const notOne of [null, 42, 'island', [1, 2, 3]]) {
      expect(manifestFaults(notOne)[0]).toContain('has to be an object')
    }
  })

  it('names a missing field', () => {
    expect(one(bent({ owner: undefined }))).toContain('`owner`')
  })

  it('names a field nobody has heard of', () => {
    /* a typo in a key is otherwise completely silent: the value is never read
     * and the island behaves as though it was never written */
    expect(one(bent({ sesaon: 'Fall' }))).toContain('`sesaon`')
  })

  it('says nothing about contents while the shape is still wrong', () => {
    /* the one line that matters would otherwise be buried under the complaints
     * about fields that are not there to complain about. Asserted as a property
     * rather than a count, so adding a required field does not move a number in
     * a test that is not about counting. */
    const f = manifestFaults({ format: 1 })
    expect(f.length).toBeGreaterThan(1)
    expect(f.every((line) => line.includes('is missing, and it is required'))).toBe(true)
  })

  it('refuses a format it does not know, by number', () => {
    expect(one(bent({ format: 2 }))).toContain(`format ${FORMAT}`)
  })

  it('refuses a format that is not a whole number', () => {
    /* 1.0 === 1 is true in JavaScript and `True == 1` is true in Python, so both
     * halves need an explicit type guard or each accepts something the other
     * refuses. This is the JavaScript half of that. */
    for (const v of [1.5, '1', true, null]) {
      expect(one(bent({ format: v }))).toContain('`format`')
    }
  })

  it('refuses an id that is not a slug', () => {
    for (const v of ['TestClub', 'test_club', 'test--club', '-test', '']) {
      expect(one(bent({ programme: v }))).toContain('`programme`')
    }
  })

  it('refuses a programme that is also the map, because the roster does', () => {
    expect(one(bent({ map: 'test-club' }))).toContain('different key spaces')
  })

  it('refuses a title with a line break in it', () => {
    // it lands in a dialogue box and on a roster row with nothing in between
    expect(one(bent({ title: 'Line one\nLine two' }))).toContain('`title`')
  })

  it('refuses a title nobody can fit on screen', () => {
    expect(one(bent({ title: 'T'.repeat(200) }))).toContain('`title`')
  })

  it('refuses an empty owner', () => {
    expect(one(bent({ owner: '   ' }))).toContain('`owner`')
  })

  it('refuses a season outside the vocabulary', () => {
    expect(one(bent({ season: 'Summer' }))).toContain('`season`')
  })
})

describe('the section that is about a real school', () => {
  /* P18. What a student needs to know to walk into this thing on a Tuesday,
   * which is the half a fourteen year old builder skips, so it is required and
   * gets skipped out loud. */
  it('is required', () => {
    expect(one(bent({ content: undefined }))).toContain('`content`')
  })

  it('refuses a fact with nothing behind it', () => {
    const c = { ...GOOD.content, what: { text: 'BLHS opened in 2005.' } }
    expect(one(bent({ content: c }))).toContain('content.what.source')
  })

  it('accepts "unknown", because that is a decision and not an omission', () => {
    const c = { ...GOOD.content, when: { text: 'Nobody has published it.', source: 'unknown' } }
    expect(manifestFaults(bent({ content: c }))).toEqual([])
  })

  it('refuses a blurb that is a paragraph', () => {
    const c = { ...GOOD.content, blurb: 'one two three four five six seven eight' }
    expect(one(bent({ content: c }))).toContain('content.blurb')
  })

  it('refuses a meeting time nobody sourced', () => {
    // a meeting time nobody sourced is a student standing outside the wrong room
    const c = { ...GOOD.content, meets: [{ day: 'Tuesday', time: '2:10', room: '200 Flex' }] }
    expect(one(bent({ content: c }))).toContain('meets[0].source')
  })

  it('names a content field nobody has heard of', () => {
    const c = { ...GOOD.content, whn: { text: 'x', source: 'y' } }
    expect(one(bent({ content: c }))).toContain('content.whn')
  })
})

describe('the modules an island ships', () => {
  it('refuses an empty list', () => {
    expect(one(bent({ modules: [] }))).toContain('`modules`')
  })

  it('refuses a path, because an island is one flat folder', () => {
    const f = manifestFaults(bent({ modules: ['island.py', 'sub/thing.py'] }))
    expect(f[0]).toContain('one flat folder')
  })

  it('refuses a filename python cannot import', () => {
    for (const v of ['my.island.py', 'My Island.py', '2nd.py']) {
      const f = manifestFaults(bent({ modules: ['island.py', v] }))
      expect(f.join(' ')).toContain('after `import`')
    }
  })

  it('refuses a module the engine already provides', () => {
    /* the island's own folder goes on sys.path AHEAD of the engine's files, so a
     * member's vine.py would shadow the real one with a stale copy */
    for (const v of ['vine.py', 'grape.py']) {
      const f = manifestFaults(bent({ modules: ['island.py', v] }))
      expect(f.join(' ')).toContain('shadow')
    }
  })

  it('refuses a module named after one python already has', () => {
    const f = manifestFaults(bent({ modules: ['island.py', 'random.py'] }))
    expect(f.join(' ')).toContain('already uses')
  })

  it('refuses the same file twice, however it is spelled', () => {
    const f = manifestFaults(bent({ modules: ['island.py', 'island.py'] }))
    expect(f.join(' ')).toContain('twice')
  })

  it('refuses an entry that is not one of the modules', () => {
    expect(one(bent({ entry: 'main.py' }))).toContain('`entry`')
  })

  it('refuses a shouted extension, which imports on windows and 404s on github', () => {
    /* `island.PY` used to pass every check here, because the extension test was
     * case-insensitive and the stem was then taken with a blind slice. It died
     * at `__import__("island.PY")` in driver.py, whose endswith is not. */
    const f = manifestFaults({ ...GOOD, entry: 'island.PY', modules: ['island.PY'] })
    expect(f.join(' ')).toContain('lower case')
  })

  it('refuses a list nobody meant to write', () => {
    const many = Array.from({ length: 40 }, (_, i) => `m${i}.py`)
    const f = manifestFaults({ ...GOOD, entry: 'm0.py', modules: many })
    expect(f[0]).toContain('40 files')
  })

  it('does not call a list with a number in it a duplicate', () => {
    /* it counted the set of STRINGS against the length of the whole list, so any
     * non-string entry reported a repeated filename that was not there */
    const f = manifestFaults(bent({ modules: ['island.py', 7] }))
    expect(f.join(' ')).not.toContain('twice')
  })
})

describe('where an island comes from', () => {
  it('builds a raw url for a branch', () => {
    const ref: GrapeRef = {
      at: 'github', owner: 'ashwath-polali', repo: 'blhs-islands',
      branch: 'my-island', path: 'islands/skeleton',
    }
    expect(baseUrlOf(ref)).toBe(
      'https://raw.githubusercontent.com/ashwath-polali/blhs-islands/my-island/islands/skeleton/')
  })

  it('puts the trailing slash on a base url that lacks one', () => {
    expect(baseUrlOf({ at: 'url', base: 'http://localhost:5280/islands/skeleton' }))
      .toBe('http://localhost:5280/islands/skeleton/')
  })

  it('reads the island id off the end of a base url', () => {
    expect(islandIdOf('http://localhost:5280/islands/skeleton/')).toBe('skeleton')
    expect(islandIdOf('/grapes/hello/')).toBe('hello')
  })

  it('reads ?from as a base url', () => {
    const ref = parseGrapeRef(new URLSearchParams('from=http://localhost:5280/islands/skeleton/'))
    expect(baseUrlOf(ref)).toBe('http://localhost:5280/islands/skeleton/')
  })

  it('reads ?gh as owner/repo@branch:path', () => {
    const ref = parseGrapeRef(new URLSearchParams('gh=ash/blhs-islands@main:islands/skeleton'))
    expect(baseUrlOf(ref)).toBe(
      'https://raw.githubusercontent.com/ash/blhs-islands/main/islands/skeleton/')
  })

  it('falls back to the app s own fixture for a name that is not a slug', () => {
    /* A WHITELIST, NOT A STRIP. Stripping characters let ".." through intact,
     * and fetch normalises "/grapes/.." to "/", which hands the SPA's own
     * index.html back as the island's source. */
    for (const bad of ['../../secret', '..', 'Hello', '']) {
      const ref = parseGrapeRef(new URLSearchParams(`island=${encodeURIComponent(bad)}`))
      expect(baseUrlOf(ref)).toBe('/grapes/hello/')
    }
  })
})

describe('fetching one', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const serving = (files: Record<string, string>, kind = 'text/plain') => {
    const headers = { get: (h: string) => (h.toLowerCase() === 'content-type' ? kind : null) }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const name = url.split('/').filter(Boolean).pop() ?? ''
      if (!(name in files)) return { ok: false, status: 404, headers, text: async () => '' }
      return { ok: true, status: 200, headers, text: async () => files[name] }
    }))
  }

  const ref: GrapeRef = { at: 'url', base: 'http://localhost:5280/islands/skeleton/' }

  it('brings back the manifest and every module it lists', async () => {
    serving({
      'island.json': JSON.stringify({ ...GOOD, modules: ['island.py', 'questions.py'] }),
      'island.py': '# the entry\n',
      'questions.py': '# the questions\n',
    })
    const g = await fetchGrape(ref)
    expect(g.island).toBe('skeleton')
    expect(g.manifest.title).toBe('A Test')
    expect(Object.keys(g.files).sort()).toEqual(['island.py', 'questions.py'])
    expect(g.files['questions.py']).toBe('# the questions\n')
  })

  it('refuses a web page, which is what a dev server on that port answers with', async () => {
    /* MEASURED while building the members' repo: port 5275 was already taken by a
     * vite server, and a static server that fails to bind does not fail loudly.
     * Without this the island is a page of HTML and the error is about python
     * syntax, which sends a member looking in entirely the wrong place. */
    serving({ 'island.json': '<!doctype html>\n<html><body>vite</body></html>' })
    await expect(fetchGrape(ref)).rejects.toThrow(/web page/)
  })

  it('refuses a web page that does not lead with a doctype', async () => {
    /* the first version of this check tested for `<!doctype`, `<html` or `<?xml`
     * at the start, and every one of these got through it and was written into
     * the runtime as a member's module */
    for (const body of [
      '<!-- vite -->\n<!doctype html>\n<html></html>',
      '<meta charset="utf-8"><title>404</title>',
      '<h1>404 Not Found</h1>',
    ]) {
      serving({ 'island.json': body })
      await expect(fetchGrape(ref)).rejects.toThrow(/web page/)
    }
  })

  it('refuses anything served as html however it begins', async () => {
    serving({ 'island.json': JSON.stringify(GOOD) }, 'text/html; charset=utf-8')
    await expect(fetchGrape(ref)).rejects.toThrow(/web page/)
  })

  it('refuses a manifest that is not JSON', async () => {
    serving({ 'island.json': '{ not json' })
    await expect(fetchGrape(ref)).rejects.toThrow(/not valid JSON/)
  })

  it('names the field when the manifest is not loadable', async () => {
    serving({ 'island.json': JSON.stringify(bent({ owner: undefined })) })
    await expect(fetchGrape(ref)).rejects.toThrow(/`owner`/)
  })

  it('says which url answered what when a module is missing', async () => {
    serving({
      'island.json': JSON.stringify({ ...GOOD, modules: ['island.py', 'gone.py'] }),
      'island.py': '# the entry\n',
    })
    await expect(fetchGrape(ref)).rejects.toThrow(/gone\.py answered 404/)
  })

  it('gives up rather than hanging when nothing answers', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: string, init: { signal: AbortSignal }) =>
      new Promise((_res, rej) => {
        init.signal.addEventListener('abort', () => rej(new Error('aborted')))
      })))
    await expect(fetchGrape(ref, 20)).rejects.toThrow(/did not answer within 20 ms/)
  })

  it('gives up on a server that sends headers and then stalls', async () => {
    /* fetch resolves on HEADERS. Clearing the abort timer once it returns left
     * the body read with no clock on it at all, so a stalled body hung the whole
     * scene with no error and no way back, before openGrape and its BOOT_MS ever
     * existed. That is the one silent hang the sandbox is built to prevent. */
    const headers = { get: () => 'text/plain' }
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { signal: AbortSignal }) => ({
      ok: true,
      status: 200,
      headers,
      text: () => new Promise<string>((_res, rej) => {
        init.signal.addEventListener('abort', () => rej(new Error('aborted')))
      }),
    })))
    await expect(fetchGrape(ref, 30)).rejects.toThrow(/did not answer within 30 ms/)
  })

  it('refuses a module too big to hand a 4 GB chromebook', async () => {
    serving({
      'island.json': JSON.stringify(GOOD),
      'island.py': 'x'.repeat(300 * 1024),
    })
    await expect(fetchGrape(ref)).rejects.toThrow(/KB/)
  })
})

describe('where an island may be loaded from', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  /* ?scene=grape is in the same scene table as every other scene, so it is
   * reachable on the deployed game. A `from` that took any origin meant a link
   * could run a stranger's python on the real domain, and `log` reaches the Neon
   * events table the study is measured out of. Nothing escapes the wasm sandbox;
   * the study's data was the thing at risk. */
  const reach = (base: string) => fetchGrape({ at: 'url', base })

  it('refuses an origin that is neither this machine nor the islands repository', async () => {
    vi.stubGlobal('fetch', vi.fn())
    for (const base of ['http://evil.example/islands/x/', 'https://pastebin.com/raw/abc/']) {
      await expect(reach(base)).rejects.toThrow(/not somewhere an island may be loaded from/)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('allows a member s own machine and the raw github host', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 404, headers: { get: () => null }, text: async () => '',
    })))
    for (const base of [
      'http://localhost:5280/islands/skeleton/',
      'http://127.0.0.1:5280/islands/skeleton/',
      'https://raw.githubusercontent.com/ash/blhs-islands/main/islands/skeleton/',
    ]) {
      /* it gets as far as the fetch, which is the whole assertion */
      await expect(reach(base)).rejects.toThrow(/answered 404/)
    }
  })

  it('refuses a base carrying a query or a fragment', async () => {
    /* the id used to be read with the query stripped while the fetch kept it, so
     * the island's runtime folder and the url actually asked for disagreed */
    vi.stubGlobal('fetch', vi.fn())
    await expect(reach('http://localhost:5280/islands/skeleton?v=2/')).rejects
      .toThrow(/query or a fragment/)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('the fixtures this repo ships', () => {
  /* the harness runs these, so a change that makes one unloadable should fail
   * here rather than the next time somebody opens ?scene=grape */
  const root = path.resolve(process.cwd(), 'public/grapes')

  for (const island of fs.readdirSync(root)) {
    it(`public/grapes/${island} is a loadable island`, () => {
      const dir = path.join(root, island)
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'island.json'), 'utf8'))
      expect(manifestFaults(m)).toEqual([])
      /* the one rule the engine cannot check over HTTP, because there is no
       * directory to read at the other end. It is checkable here. */
      const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith('.py')).sort()
      expect(onDisk).toEqual([...m.modules].sort())
    })
  }
})

describe('the wire version', () => {
  it('is a whole number both halves compare against', () => {
    expect(Number.isInteger(PROTOCOL)).toBe(true)
  })
})
