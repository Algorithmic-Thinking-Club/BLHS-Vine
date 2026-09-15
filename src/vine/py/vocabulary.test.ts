/* checks the intent vocabulary is spelled the same in intents.ts and in vine.py */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// resolve off the repo root, not import.meta.url, because vitest serves this file under an http url so a file: URL relative to the module does not resolve
const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')
const py = read('src/vine/py/vine.py')
const ts = read('src/vine/intents.ts')

const all = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => m[1])

/* strip comments before the scan, because prose in intents.ts quotes `kind: 'core'` and a scan reading prose as vocabulary would count `core` as an extra word */
const code = ts.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** every `kind` the Intent union declares */
const engineWords = new Set(all(code, /kind: '([a-z_]+)'/g))
/** every kind a builder in vine.py puts on the wire */
const pythonWords = new Set(all(py, /"kind": "([a-z_]+)"/g))

/* helpers that wrap other words and put nothing new on the wire, so they are not words */
const HELPERS = new Set(['as_a_cutscene'])

/** each `def` in vine.py, its body, and the kinds that body emits */
const builders = py.split(/^def /m).slice(1).map((block) => ({
  name: block.slice(0, block.indexOf('(')),
  body: block,
  emits: all(block, /"kind": "([a-z_]+)"/g),
})).filter((b) => !HELPERS.has(b.name))

/** the body of one builder, and it throws on a name that is not there, because a helper answering '' for a missing word would make every `not.toContain` below pass by accident */
function bodyOf(name: string): string {
  const b = builders.find((x) => x.name === name)
  if (!b) throw new Error(`vine.py has no builder called ${name}`)
  return b.body
}

describe('the intent vocabulary, both sides of the worker', () => {
  /* the count is written down here, so growing the vocabulary is a deliberate edit */
  /* `lead_to` is its own word: somebody walks ahead and the player follows them there */
  /* `objective` is its own word: the one line at the top of the screen, not dialogue */
  /* `end_run` is its own word: the run is over and the world gives way to the title */
  /* `sail_to` is its own word: the engine takes the player to another island, so a member writes nothing about the walk out, the boarding, the crossing or the landing */
  /* `island_tasks` and `task_done` are their own words, the list of what a whole island asks for and the tick that one row is finished, because a single sentence can hold neither a list nor how much is left */
  it('is thirty-six words on the engine side', () => {
    expect(engineWords.size).toBe(36)
  })

  it('has the two task words on both sides, so an island can lay out what it wants', () => {
    for (const w of ['island_tasks', 'task_done']) {
      expect(engineWords.has(w), `intents.ts is missing ${w}`).toBe(true)
      expect(pythonWords.has(w), `vine.py is missing ${w}`).toBe(true)
    }
  })

  it('has sail_to on both sides, so a member can say it', () => {
    expect(engineWords.has('sail_to'), 'intents.ts is missing sail_to').toBe(true)
    expect(pythonWords.has('sail_to'), 'vine.py is missing sail_to').toBe(true)
  })

  it('has the frame words on both sides', () => {
    for (const w of ['movie', 'view', 'ashore']) {
      expect(engineWords.has(w), `intents.ts is missing ${w}`).toBe(true)
      expect(pythonWords.has(w), `vine.py is missing ${w}`).toBe(true)
    }
  })

  it('has the twelve director words on both sides', () => {
    const director = ['pose', 'actor_move', 'lead_to', 'place', 'actor_face', 'actor_look',
      'actor_release', 'route', 'framing', 'wait', 'wait_for', 'sound']
    for (const w of director) {
      expect(engineWords.has(w), `intents.ts is missing ${w}`).toBe(true)
      expect(pythonWords.has(w), `vine.py is missing ${w}`).toBe(true)
    }
  })

  it('reaches every one of them from python', () => {
    // the whole bonus: `say` and `choose` were the only two a member could speak
    expect([...engineWords].sort()).toEqual([...pythonWords].sort())
  })

  it('invents nothing the union does not have', () => {
    for (const w of pythonWords) expect(engineWords.has(w)).toBe(true)
  })

  it('names each builder exactly what its kind is, so nothing translates anything', () => {
    // a vocabulary with a lookup table in the middle has two spellings of every word and a place for them to drift apart
    for (const b of builders) expect(b.emits).toEqual([b.name])
  })

  it('has one builder per word and no duplicates', () => {
    expect(builders.map((b) => b.name).sort()).toEqual([...engineWords].sort())
  })
})

describe('the shapes an optional argument takes', () => {
  it('omits an absent optional rather than sending it as null', () => {
    // an explicit null is a different thing from an absent name, and the engine reads `who?: string` not `who: string | null`
    expect(bodyOf('say')).toContain('if who is not None:')
    expect(bodyOf('enter')).toContain('if at is not None:')
  })

  it('SENDS a null anchor from look_at, because there None is the message', () => {
    // `look_at(None)` is how an island gives the camera back, so this is the one word whose absent-looking argument must cross the wire
    expect(bodyOf('look_at')).toContain('"anchor": anchor')
    expect(bodyOf('look_at')).not.toContain('if anchor is not None:')
  })

  it('leaves as_plain off by default, so the control arm stays the engine\'s call', () => {
    expect(bodyOf('play')).toContain('if as_plain is not None:')
  })

  it('SENDS a null shot from framing, because there None is the message too', () => {
    // `framing(None)` gives the camera back exactly as `look_at(None)` does, and an omitted key would read as no argument rather than as the instruction
    expect(bodyOf('framing')).toContain('"shot": shot')
    expect(bodyOf('framing')).not.toContain('if shot is not None:')
  })

  it('lets the director words leave every optional off', () => {
    // a pose with no facing, an actor released with no name and a route with no rider are all the common case, so each has to be shorter than the full one
    expect(bodyOf('pose')).toContain('if name is not None:')
    expect(bodyOf('pose')).toContain('if facing is not None:')
    expect(bodyOf('actor_release')).toContain('if actor is not None:')
    expect(bodyOf('route')).toContain('if who is not None:')
    expect(bodyOf('wait_for')).toContain('if ms is not None:')
  })

  it('guards on None and never on truthiness, so a grade of ZERO still ships', () => {
    // `if value:` would read a 0 grade, an empty tag list and visible=False as absent, so a student who scored nothing would have had no grade recorded at all
    expect(bodyOf('award')).toContain('if value is not None:')
    expect(bodyOf('award')).not.toMatch(/if value:\s/)
  })
})
