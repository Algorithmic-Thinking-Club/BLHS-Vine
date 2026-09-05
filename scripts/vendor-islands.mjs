/* THE VINE'S OWN ISLANDS, CARRIED IN FROM THE REPOSITORY THAT OWNS THEM.
 *
 * Ruled by Ash 2026-09-04 (docs/ops/BRIEF-YEAR-ONE.md, WHERE IT LIVES): the
 * opening and the Maw are written in blhs-islands and never again in this repo.
 * Before that ruling the arrow pointed the other way, and tools/sync.py over
 * there still carried a comment saying the engine was the master. It is not.
 *
 * WHY THE BYTES STILL HAVE TO END UP HERE. A bound island is fetched at runtime
 * from the game's own origin, `/grapes/<id>/` (src/vine/py/grape-source.ts).
 * The alternative is raw.githubusercontent.com from a school Chromebook, which
 * is one district filter or one rate limit away from a black screen in the
 * middle of an advisory period. So the fetch moves to BUILD time, where the
 * network is Vercel's and a failure is a failed deploy somebody can see.
 *
 * WHICH IS WHY THIS REFUSES INSTEAD OF FALLING BACK. There is no stale copy to
 * limp along on: the folders it writes are gitignored. A missing island has to
 * stop the build, because the other outcome is a deploy that boots, looks
 * finished, and has no home base inside the mountain.
 *
 *     node scripts/vendor-islands.mjs
 *     BLHS_ISLANDS=C:\path\to\blhs-islands node scripts/vendor-islands.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEST = path.join(ROOT, 'public', 'grapes')

/* THE LIST IS EXPLICIT AND NOT A DIRECTORY LISTING, on purpose. `islands/` over
 * there also holds `skeleton`, which is the template a member copies and not a
 * thing this game ships. And the GitHub path has no directory to read anyway.
 *
 * Every id here must have a row in src/game/roster/vine-islands.ts, or be the
 * opening; `vendor-islands.test.ts` fails when they drift apart. */
const ISLANDS = ['panther-maw', 'castaway', 'the-hub']

/* the fixtures this repo really does own: the grape harness runs them, they are
 * committed here, and the vendor never touches them */
const FIXTURES = ['hello', 'broken', 'maw-demo']

const REPO = 'Algorithmic-Thinking-Club/BLHS-Island-Explorer'
const BRANCH = process.env.BLHS_ISLANDS_BRANCH || 'main'
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/islands`

/** a local checkout to read instead of the network, if there is one.
 *  `BLHS_ISLANDS=remote` forces the network path, which is the only way to try
 *  what Vercel will really do without pushing a commit to find out. */
function checkout() {
  if (process.env.BLHS_ISLANDS === 'remote') return null
  const tries = [process.env.BLHS_ISLANDS, path.join(path.dirname(ROOT), 'blhs-islands')]
  for (const t of tries) {
    if (t && fs.existsSync(path.join(t, 'islands'))) return t
  }
  return null
}

/* ONE ISLAND'S FILES, from wherever it is coming from. The manifest is read
 * first because it is the thing that says which .py files exist: copying a
 * directory listing instead would carry __pycache__ across, and
 * loader.test.ts asserts the .py on disk are EXACTLY the declared modules. */
async function read(from, id) {
  const get = from
    ? async (f) => {
        const p = path.join(from, 'islands', id, f)
        if (!fs.existsSync(p)) throw new Error(`${p} is not there`)
        return fs.readFileSync(p)
      }
    : async (f) => {
        const r = await fetch(`${RAW}/${id}/${f}`)
        if (!r.ok) throw new Error(`${RAW}/${id}/${f} answered ${r.status}`)
        return Buffer.from(await r.arrayBuffer())
      }

  const manifest = await get('island.json')
  let m
  try { m = JSON.parse(manifest.toString('utf8')) }
  catch (e) { throw new Error(`${id}/island.json is not JSON: ${e.message}`) }
  if (!m.entry || !Array.isArray(m.modules)) {
    throw new Error(`${id}/island.json declares no entry or no modules`)
  }
  /* the entry is normally in modules too, and a manifest that forgot to say so
   * would otherwise ship without the one file the engine imports */
  const names = [...new Set([m.entry, ...m.modules])]
  const files = { 'island.json': manifest }
  for (const n of names) files[n] = await get(n)
  return files
}

/** written out, with anything the manifest no longer lists taken away */
function write(id, files) {
  const dir = path.join(DEST, id)
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, bytes] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), bytes)
  }
  /* A STALE MODULE IS WORSE THAN A MISSING ONE. loader.test.ts compares the .py
   * on disk against the manifest, so a file left behind by an older version of
   * an island fails a check about a file nobody in this repo wrote. Directories
   * go too, which is how __pycache__ from a member's laptop stops arriving. */
  for (const found of fs.readdirSync(dir)) {
    if (files[found]) continue
    fs.rmSync(path.join(dir, found), { recursive: true, force: true })
  }
}

const from = checkout()
console.log(from
  ? `[islands] reading ${ISLANDS.length} from the checkout at ${from}`
  : `[islands] no checkout next door, reading ${ISLANDS.length} from ${REPO}@${BRANCH}`)

let failed = 0
for (const id of ISLANDS) {
  try {
    write(id, await read(from, id))
    console.log(`[islands] ${id}  ->  public/grapes/${id}`)
  } catch (e) {
    failed++
    console.error(`[islands] ${id} FAILED: ${e.message}`)
  }
}

if (failed) {
  console.error(`\n[islands] ${failed} of ${ISLANDS.length} did not come across, so this build would `
    + 'ship without them. Nothing here falls back to a stale copy on purpose: the folders it '
    + 'writes are gitignored, and a deploy missing the Maw looks finished and is not.\n'
    + `Clone ${REPO} beside this repo, or set BLHS_ISLANDS to where it is.`)
  process.exit(1)
}
console.log(`[islands] ${ISLANDS.length} vendored. The fixtures this repo owns (${FIXTURES.join(', ')}) were not touched.`)
