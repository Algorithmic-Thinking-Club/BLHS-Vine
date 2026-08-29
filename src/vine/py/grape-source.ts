/* WHERE AN ISLAND COMES FROM, AND WHAT MAKES ONE LOADABLE.
 *
 * A member's island is a folder in their own repository: an island.json and the
 * .py files it lists. Nothing here knows how to run one. This file's whole job
 * is to turn "where" into "a manifest and some source", and to refuse anything
 * that is not an island with a sentence naming the field.
 *
 * THREE PLACES AN ISLAND CAN LIVE, and they are the same fetch with a different
 * base URL, which is the reason a member's own machine and a branch on GitHub
 * are not two code paths:
 *
 *   a branch      raw.githubusercontent.com/<owner>/<repo>/<branch>/islands/<id>/
 *   their laptop  http://localhost:5280/islands/<id>/   (serve.py in that repo)
 *   this app      /grapes/<id>/                         (the engine's own fixtures)
 *
 * THE RULES ARE THE MEMBERS' REPO'S RULES. tools/manifest.py in blhs-islands
 * checks the same things on the member's machine before they push, and says the
 * same things. Two implementations of one format is a real cost, and it is worth
 * paying: the member gets the answer in a second on their own laptop instead of
 * a minute later in a browser, and the engine still never trusts what it fetched.
 * Where they can differ they are commented.
 */

/* THE FORMAT VERSION, and the one that matters more than the wire version in
 * protocol.ts, because the engine and a member's repository ship on different
 * days. A number it does not know is refused BY NUMBER, so a member reads "this
 * game speaks format 1" instead of watching their island fail strangely. */
export const FORMAT = 1

export type GrapeManifest = {
  format: number
  /** the roster programme this island completes. What `award()` names. */
  programme: string
  /** the painting it is played on. A different key space, never the same string. */
  map: string
  title: string
  season?: 'Fall' | 'Winter' | 'Spring'
  owner: string
  entry: string
  modules: string[]
}

export type LoadedGrape = {
  /** the folder name at the end of the base url; the island's id on the runtime fs */
  island: string
  base: string
  manifest: GrapeManifest
  /** filename -> source, exactly what goes to the worker */
  files: Record<string, string>
}

const REQUIRED = ['format', 'programme', 'map', 'title', 'owner', 'entry', 'modules'] as const
const OPTIONAL = ['season'] as const
const SEASONS = ['Fall', 'Winter', 'Spring']

/* lower case, digits, single hyphens. The roster's own id shape, and safe as a
 * folder name, a url segment and a filename on every machine. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
/* what `import questions` can actually spell. A dot, a space or a capital in a
 * filename passes every other check and then cannot be imported at all. */
const STEM = /^[a-z_][a-z0-9_]*$/
/* the string a person reads, on one line, short enough for the box it lands in */
const TEXT_MAX = 80

/* the engine writes both of these into the runtime before the island is
 * imported, and the island's own folder goes on sys.path AHEAD of them, so a
 * member shipping either one would shadow the real thing with a stale copy */
const ENGINE_OWNED = ['vine.py', 'grape.py']

/* names python already has. An island shipping random.py does not get a warning,
 * it replaces the real one for everything in that runtime.
 *
 * THE SAME LIST IS IN blhs-islands/tools/manifest.py AND A TEST THERE FAILS IF
 * THEY DIVERGE. They had already drifted by four names within a day of being
 * written, which is exactly long enough for a member to be refused by the game
 * for a file their own checker called fine. Sorted so a diff is readable. */
export const TAKEN = new Set([
  'abc', 'array', 'asyncio', 'binascii', 'builtins', 'collections', 'copy',
  'enum', 'errno', 'functools', 'gc', 'grape', 'hashlib', 'heapq', 'inspect',
  'io', 'itertools', 'json', 'math', 'os', 'random', 're', 'select', 'socket',
  'ssl', 'string', 'struct', 'sys', 'test', 'time', 'types', 'uasyncio', 'vine',
])

/* ---- is this an island ---------------------------------------------------- */

/** Every reason this is not a loadable island. Empty means it is one. */
export function manifestFaults(raw: unknown): string[] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    const what = raw === null ? 'null' : Array.isArray(raw) ? 'a list' : `a ${typeof raw}`
    return [`island.json has to be an object, not ${what}`]
  }
  const m = raw as Record<string, unknown>
  const out: string[] = []

  for (const key of REQUIRED) if (!(key in m)) out.push(`\`${key}\` is missing, and it is required`)
  for (const key of Object.keys(m)) {
    if (!REQUIRED.includes(key as never) && !OPTIONAL.includes(key as never)) {
      out.push(`\`${key}\` is not a field this format has`)
    }
  }
  /* complaining about the contents of fields while the shape is still wrong
   * buries the one line that matters */
  if (out.length) return out

  /* Number.isInteger and not `!== FORMAT`, for the same reason the python side
   * needs an explicit bool guard: 1.0 === 1 is true in JavaScript, and a version
   * check that accepts a float accepts something the other half will not. */
  if (typeof m.format !== 'number' || !Number.isInteger(m.format)) {
    out.push(`\`format\` is ${JSON.stringify(m.format)}, which is not a whole number`)
  } else if (m.format !== FORMAT) {
    out.push(`\`format\` is ${m.format}; this game speaks format ${FORMAT}`)
  }

  for (const key of ['programme', 'map'] as const) {
    if (typeof m[key] !== 'string' || !SLUG.test(m[key] as string)) {
      out.push(`\`${key}\` is ${JSON.stringify(m[key])}, which is not a slug`)
    }
  }
  /* THE KEY SPACES STAY DISJOINT. The roster refuses an id that is both a
   * programme and a map, so an island shipping one can never be added to it. */
  if (m.programme === m.map) {
    out.push(`\`programme\` and \`map\` are both ${JSON.stringify(m.map)}; they are `
      + 'different key spaces and the roster refuses an id that is in both')
  }

  for (const key of ['title', 'owner'] as const) {
    const v = m[key]
    if (typeof v !== 'string' || !v.trim()) {
      out.push(`\`${key}\` is empty, and somebody has to be able to read it`)
    } else if (/[\n\r\0]/.test(v)) {
      out.push(`\`${key}\` has a line break or a control character in it, and it is `
        + 'rendered as one line')
    } else if ([...v].length > TEXT_MAX) {
      /* code points, not UTF-16 units, because python's len() counts code points
       * and an emoji is two units and one point. Counting differently is how the
       * two checkers disagree about a title neither of them should argue over. */
      out.push(`\`${key}\` is ${[...v].length} characters; keep it to ${TEXT_MAX} so it `
        + 'fits where it is drawn')
    }
  }

  if ('season' in m && !SEASONS.includes(m.season as string)) {
    out.push(`\`season\` is ${JSON.stringify(m.season)}; it has to be one of `
      + `${SEASONS.join(', ')}, or left out when the island is not seasonal`)
  }

  out.push(...moduleFaults(m))
  return out
}

function moduleFaults(m: Record<string, unknown>): string[] {
  const out: string[] = []
  const mods = m.modules
  if (!Array.isArray(mods) || !mods.length) {
    return ['`modules` has to list every .py file the game should fetch']
  }
  if (mods.length > MAX_MODULES) {
    return [`\`modules\` lists ${mods.length} files. An island is a handful, and every `
      + `one of them is fetched at once, so the limit is ${MAX_MODULES}.`]
  }

  for (const name of mods) {
    /* the literal lower-case suffix, not a case-insensitive one. `island.PY`
     * used to pass here, take its stem with a blind slice, pass everything else,
     * and then die at `__import__("island.PY")` in driver.py, whose endswith IS
     * case sensitive. GitHub serves case-sensitively too. */
    if (typeof name !== 'string' || !name.endsWith('.py')) {
      out.push(`\`modules\` has ${JSON.stringify(name)} in it, which is not a .py filename. `
        + 'The extension is lower case, because that is what you type after `import`')
      continue
    }
    if (name.includes('/') || name.includes('\\')) {
      out.push(`\`modules\` has ${name} in it; a module is a filename, and an island `
        + 'is one flat folder')
      continue
    }
    if (ENGINE_OWNED.includes(name.toLowerCase())) {
      out.push(`\`modules\` lists ${name}, which the game provides. Yours would shadow `
        + 'the real one')
      continue
    }
    const stem = name.slice(0, -3)
    if (!STEM.test(stem)) {
      out.push(`\`modules\` has ${name} in it. A module name is lower case letters, `
        + 'digits and underscores, because the file name is what you type after `import`')
      continue
    }
    if (TAKEN.has(stem)) {
      out.push(`\`modules\` lists ${name}, which is a name python already uses. Yours `
        + 'would replace the real one for everything running beside it')
    }
  }

  /* against the count of NAMES, not of entries. A list holding one string and one
   * number is not a list with a duplicate in it, and saying so sends a member
   * looking for a repeated filename that is not there. */
  const names = mods.filter((n): n is string => typeof n === 'string')
  const lowered = new Set(names.map((n) => n.toLowerCase()))
  if (lowered.size !== names.length) out.push('`modules` lists the same file twice')

  if (typeof m.entry !== 'string' || !mods.includes(m.entry)) {
    out.push(`\`entry\` is ${JSON.stringify(m.entry)}, which is not one of the modules`)
  }
  /* THE ONE RULE THE MEMBERS' CHECKER HAS AND THIS ONE CANNOT: a .py file on
   * disk that nobody listed. Over HTTP there is no directory to read, so that
   * one only ever gets caught before the push. It is in tools/manifest.py. */
  return out
}

/* ---- where it lives ------------------------------------------------------- */

export type GrapeRef =
  /* this app's own fixtures, under public/grapes/ */
  | { at: 'origin'; island: string }
  /* any base url: a member running serve.py, or anything else that serves files */
  | { at: 'url'; base: string }
  /* a branch, which is the shape once the members' repo has a remote */
  | { at: 'github'; owner: string; repo: string; branch: string; path: string }

export function baseUrlOf(ref: GrapeRef): string {
  if (ref.at === 'origin') return `/grapes/${ref.island}/`
  if (ref.at === 'url') return ref.base.endsWith('/') ? ref.base : `${ref.base}/`
  const path = ref.path.replace(/^\/+|\/+$/g, '')
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${ref.branch}/${path}/`
}

/* THE ID AND THE URL HAVE TO AGREE. This used to strip a query and a fragment
 * before taking the last segment while the fetch kept them, so
 * `.../skeleton?v=2` reported the island as `skeleton` and asked the server for
 * something else. That id is not cosmetic: it becomes the folder on the runtime
 * filesystem and the sys.path root the member's own imports resolve against. */
export function islandIdOf(base: string): string {
  const path = base.split(/[?#]/)[0]
  const parts = path.split('/').filter(Boolean)
  const last = parts[parts.length - 1] ?? ''
  /* a bare host has no folder in it, and its hostname is not an island name */
  return /^[a-z][a-z0-9+.-]*:$/i.test(parts[0] ?? '') && parts.length < 3 ? '' : last
}

/* WHERE A GRAPE MAY BE FETCHED FROM, and it is not "anywhere".
 *
 * `?scene=grape` is registered in the same scene table as every other scene, so
 * it is reachable on the deployed game and not only on localhost. A `from` that
 * accepted any origin meant a link could make somebody's browser run a
 * stranger's python on the real domain, and `log` reaches telemetry, which
 * reaches the Neon events table the AP Research study is measured out of. The
 * sandbox holds (nothing escapes the wasm runtime) and the data does not.
 *
 * So: a member's own machine, or the repository islands actually live in. */
const ALLOWED = [/^localhost$/, /^127\.0\.0\.1$/, /^\[::1\]$/, /^raw\.githubusercontent\.com$/]

function allowedHost(base: string): boolean {
  try {
    const u = new URL(base, window.location.origin)
    if (u.origin === window.location.origin) return true
    return ALLOWED.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}

/* THE URL SURFACE OF THE HARNESS, parsed in one place so the scene does not
 * grow its own reading of it.
 *
 *   ?scene=grape                      the app's own /grapes/hello/
 *   ?scene=grape&island=broken        another of the app's own
 *   ?scene=grape&from=http://...      a member's serve.py, or anything
 *   ?scene=grape&gh=own/repo@main:islands/skeleton
 */
export function parseGrapeRef(params: URLSearchParams, fallback = 'hello'): GrapeRef {
  const from = params.get('from')
  if (from) return { at: 'url', base: from }

  const gh = params.get('gh')
  if (gh) {
    const m = /^([\w.-]+)\/([\w.-]+)@([\w./-]+):([\w./-]+)$/.exec(gh)
    /* no `..` in any of the four. Every one of them is pasted into a path, so a
     * dot-dot segment lets a ref name one repository and fetch another. */
    if (m && !m.slice(1).some((part) => /(^|\/)\.\.?($|\/)/.test(part))) {
      return { at: 'github', owner: m[1], repo: m[2], branch: m[3], path: m[4] }
    }
  }

  /* A WHITELIST, NOT A STRIP. Stripping unwanted characters let ".." through
   * intact, and fetch normalises "/grapes/.." to "/", which hands the SPA's own
   * index.html back as the island. Requiring a slug has no edge to find. */
  const asked = params.get('island') ?? ''
  return { at: 'origin', island: SLUG.test(asked) ? asked : fallback }
}

/* ---- getting it ----------------------------------------------------------- */

export class GrapeSourceError extends Error {}

/* An island is a handful of small text files. These are not tuned numbers, they
 * are the point past which something is wrong: the runtime holds every module as
 * a string, structured-clones it to the worker and writes it into an in-memory
 * filesystem, on the 4 GB Chromebook this whole runtime choice was made for. */
const MAX_MODULES = 24
const MAX_BYTES = 256 * 1024

async function grab(url: string, ms: number): Promise<string> {
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), ms)
  try {
    /* THE BODY READ IS INSIDE THE CLOCK. fetch resolves on headers, so clearing
     * the timer once it returns disarms the abort before a single byte of the
     * body has arrived, and a server that sends headers and then stalls hangs
     * this forever with no error and no way back. That happens before openGrape
     * exists, so BOOT_MS is not behind it either: it is the one silent hang the
     * whole sandbox is built to make impossible. */
    const res = await fetch(url, { cache: 'no-store', signal: stop.signal })
    if (!res.ok) throw new GrapeSourceError(`${url} answered ${res.status}`)

    /* A DEV SERVER ON THE PORT YOU MEANT ANSWERS EVERYTHING WITH ITS index.html,
     * with a 200 and no complaint, and then the island is a page of HTML and the
     * error is about python syntax. Measured while building the members' repo:
     * port 5275 was already taken by a vite server, and a static server that
     * fails to bind does not fail loudly. The content type is the honest test,
     * and the body is the second fence, because neither JSON nor python ever
     * legitimately begins with a `<`. */
    const kind = res.headers.get('content-type') ?? ''
    const body = await res.text()
    if (/text\/html/i.test(kind) || body.trimStart().startsWith('<')) {
      throw new GrapeSourceError(
        `${url} answered with a web page rather than a file. Something else is `
        + 'probably listening on that port.')
    }
    if (body.length > MAX_BYTES) {
      throw new GrapeSourceError(
        `${url} is ${Math.round(body.length / 1024)} KB. An island is a few small `
        + `files; keep each one under ${MAX_BYTES / 1024} KB.`)
    }
    return body
  } catch (e) {
    if (e instanceof GrapeSourceError) throw e
    throw new GrapeSourceError(
      stop.signal.aborted
        ? `${url} did not answer within ${ms} ms. Is the server still running?`
        : `could not reach ${url}: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch an island's manifest and every module it lists. Throws with a sentence. */
export async function fetchGrape(ref: GrapeRef, ms = 10_000): Promise<LoadedGrape> {
  const base = baseUrlOf(ref)
  if (/[?#]/.test(base)) {
    throw new GrapeSourceError(
      `${base} carries a query or a fragment. An island is a folder, and a folder has neither.`)
  }
  if (!allowedHost(base)) {
    throw new GrapeSourceError(
      `${base} is not somewhere an island may be loaded from. That is your own `
      + 'machine, or raw.githubusercontent.com.')
  }
  const island = islandIdOf(base)
  if (!SLUG.test(island)) {
    throw new GrapeSourceError(`${base} does not end in an island folder name`)
  }

  const text = await grab(`${base}island.json`, ms)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new GrapeSourceError(`${base}island.json is not valid JSON`)
  }

  const faults = manifestFaults(raw)
  if (faults.length) {
    throw new GrapeSourceError(`${base}island.json is not loadable:\n  ${faults.join('\n  ')}`)
  }
  const manifest = raw as GrapeManifest

  /* every module at once. They are a handful of small files and the alternative
   * is a member watching them arrive one at a time on a school connection. */
  const sources = await Promise.all(manifest.modules.map((n) => grab(`${base}${n}`, ms)))
  const files: Record<string, string> = {}
  manifest.modules.forEach((n, i) => { files[n] = sources[i] })

  return { island, base, manifest, files }
}
