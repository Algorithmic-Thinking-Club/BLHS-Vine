/* the opening and the Maw live in blhs-islands and are vendored in at build time so the game serves /grapes/<id>/ from its own origin, never raw.githubusercontent.com from a school Chromebook; it refuses instead of falling back, because its folders are gitignored and a missing island must fail the build */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEST = path.join(ROOT, 'public', 'grapes')

/* the list is explicit and not a directory listing: islands/ over there also holds skeleton, the template a member copies, and the GitHub path has no directory to read; every id here needs a row in src/game/roster/vine-islands.ts or must be the opening, and vendor-islands.test.ts fails when they drift apart */
/* the vine's own three plus every island a member shipped, with the member folders read off member-islands.json, the same row that puts the programme on the roster: a hardcoded list left a member's python 404ing, so they arrived on their own painted map with nothing happening and nothing saying why */
const VINE_OWN = ['panther-maw', 'castaway', 'the-hub']
const MEMBERS = (() => {
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'src/game/roster/member-islands.json'), 'utf8')
    const rows = JSON.parse(raw).islands ?? []
    return rows.map((r) => r.folder).filter((f) => typeof f === 'string' && f.trim())
  } catch (e) {
    console.warn(`[islands] could not read member-islands.json, carrying the vine's own only: ${e.message}`)
    return []
  }
})()
const ISLANDS = [...VINE_OWN, ...MEMBERS.filter((f) => !VINE_OWN.includes(f))]

/* the fixtures this repo owns: the grape harness runs them, they are committed here, and the vendor never touches them */
const FIXTURES = ['hello', 'broken', 'maw-demo']

const REPO = 'Algorithmic-Thinking-Club/BLHS-Island-Explorer'
const BRANCH = process.env.BLHS_ISLANDS_BRANCH || 'main'
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/islands`

/** a local checkout to read instead of the network, if there is one, and BLHS_ISLANDS=remote forces the network path, the only way to try what the deploy will really do without pushing a commit to find out */
function checkout() {
  if (process.env.BLHS_ISLANDS === 'remote') return null
  const tries = [process.env.BLHS_ISLANDS, path.join(path.dirname(ROOT), 'blhs-islands')]
  for (const t of tries) {
    if (t && fs.existsSync(path.join(t, 'islands'))) return t
  }
  return null
}

/* one island's files, read manifest first because it says which .py files exist: a directory listing would carry __pycache__ across, and loader.test.ts asserts the .py on disk are exactly the declared modules */
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
  /* the entry is normally in modules too, and a manifest that forgot to say so would otherwise ship without the one file the engine imports */
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
  /* a stale module is worse than a missing one: loader.test.ts compares the .py on disk against the manifest, so a file left behind by an older version of an island fails a check about a file nobody in this repo wrote, and directories go too, which is how __pycache__ from a member's laptop stops arriving */
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
