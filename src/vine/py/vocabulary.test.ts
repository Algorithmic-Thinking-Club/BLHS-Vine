/* THE VOCABULARY HAS ONE SPELLING, AND THIS IS WHAT ENFORCES IT.
 *
 * src/vine/intents.ts is the capability list and its switch is exhaustive, so a
 * word the engine cannot do does not compile. Nothing did the same job on the
 * other side of the worker: vine.py exposed `say` and `choose` and NOTHING ELSE,
 * so thirteen things the engine could already perform were unreachable from a
 * member's island and no test noticed, because a missing Python function is not
 * a TypeScript error.
 *
 * The other direction is worse and this catches it too: a Python builder that
 * emits a kind the union does not have compiles fine, ships fine, and comes back
 * as a refusal at runtime on a member's line, which is the last place anybody
 * wants to learn a word does not exist.
 *
 * Read as text on purpose. The real vine.py runs in MicroPython in a worker, and
 * a test that needed a system python to check the spelling would be a test that
 * does not run.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// off the repo root rather than off import.meta.url: vitest serves this file
// under an http url, so a file: URL relative to the module does not resolve
const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')
const py = read('src/vine/py/vine.py')
const ts = read('src/vine/intents.ts')

const all = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => m[1])

/* the comments come out before the scan. intents.ts explains the award fix by
 * quoting the bug ("every island's grade landed as `kind: 'core'`"), and a scan
 * that reads prose as vocabulary would have counted `core` as a sixteenth word. */
const code = ts.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** every `kind` the Intent union declares */
const engineWords = new Set(all(code, /kind: '([a-z_]+)'/g))
/** every kind a builder in vine.py puts on the wire */
const pythonWords = new Set(all(py, /"kind": "([a-z_]+)"/g))

/** each `def` in vine.py, its body, and the kinds that body emits */
const builders = py.split(/^def /m).slice(1).map((block) => ({
  name: block.slice(0, block.indexOf('(')),
  body: block,
  emits: all(block, /"kind": "([a-z_]+)"/g),
}))

/** the body of one builder, and it THROWS on a name that is not there: a helper
 *  that answers '' for a missing word makes every `not.toContain` below pass by
 *  accident, which is the only way a test like this can lie */
function bodyOf(name: string): string {
  const b = builders.find((x) => x.name === name)
  if (!b) throw new Error(`vine.py has no builder called ${name}`)
  return b.body
}

describe('the intent vocabulary, both sides of the worker', () => {
  it('is fifteen words on the engine side', () => {
    expect(engineWords.size).toBe(15)
  })

  it('reaches every one of them from python', () => {
    // the whole bonus: `say` and `choose` were the only two a member could speak
    expect([...engineWords].sort()).toEqual([...pythonWords].sort())
  })

  it('invents nothing the union does not have', () => {
    for (const w of pythonWords) expect(engineWords.has(w)).toBe(true)
  })

  it('names each builder exactly what its kind is, so nothing translates anything', () => {
    // intents.ts: "a vocabulary with a lookup table in the middle is a vocabulary
    // with two spellings of every word and a place for them to drift apart"
    for (const b of builders) expect(b.emits).toEqual([b.name])
  })

  it('has one builder per word and no duplicates', () => {
    expect(builders.map((b) => b.name).sort()).toEqual([...engineWords].sort())
  })
})

describe('the shapes an optional argument takes', () => {
  it('omits an absent optional rather than sending it as null', () => {
    // an explicit null is a different thing from an absent name, and the engine
    // reads `who?: string` not `who: string | null`
    expect(bodyOf('say')).toContain('if who is not None:')
    expect(bodyOf('enter')).toContain('if at is not None:')
  })

  it('SENDS a null anchor from look_at, because there None is the message', () => {
    // `look_at(None)` is how an island gives the camera back, so this is the one
    // word whose absent-looking argument must cross the wire
    expect(bodyOf('look_at')).toContain('"anchor": anchor')
    expect(bodyOf('look_at')).not.toContain('if anchor is not None:')
  })

  it('leaves as_plain off by default, so the control arm stays the engine\'s call', () => {
    expect(bodyOf('play')).toContain('if as_plain is not None:')
  })

  it('guards on None and never on truthiness, so a grade of ZERO still ships', () => {
    // `if value:` reads a 0 grade, an empty tag list and visible=False as absent.
    // A student who scored nothing would have had no grade recorded at all.
    expect(bodyOf('award')).toContain('if value is not None:')
    expect(bodyOf('award')).not.toMatch(/if value:\s/)
  })
})
