/* copies the maps, world and ui the game reads off the platform into public/, so a browser never fetches the platform at dev or play time; VITE_MAPVIS_URL overrides it, PLATFORM_VENDOR=skip keeps the current copies, and a platform that cannot be reached leaves the old copies and never fails the build */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUB = path.join(ROOT, 'public')

const host = (() => {
  if (process.env.VITE_MAPVIS_URL) return process.env.VITE_MAPVIS_URL.replace(/\/+$/, '')
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    const m = fs.readFileSync(p, 'utf8').match(/^\s*VITE_MAPVIS_URL\s*=\s*(\S+)/m)
    if (m) return m[1].replace(/^["']|["']$/g, '').replace(/\/+$/, '')
  }
  return ''
})()

const say = (s) => console.log(`[platform] ${s}`)
if (process.env.PLATFORM_VENDOR === 'skip') { say('skipped by PLATFORM_VENDOR=skip'); process.exit(0) }
if (!host) { say('no VITE_MAPVIS_URL, nothing to vendor'); process.exit(0) }

const mapsWanted = () => {
  const ids = new Set()
  const vine = fs.readFileSync(path.join(ROOT, 'src/game/roster/vine-islands.ts'), 'utf8')
  for (const m of vine.matchAll(/map:\s*'([a-z0-9-]+)'/g)) ids.add(m[1])
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/game/roster/member-islands.json'), 'utf8')).islands ?? []
    for (const r of rows) if (r.map) ids.add(r.map)
  } catch { /* no members yet */ }
  return [...ids]
}

const getJson = async (u) => {
  const r = await fetch(u)
  if (!r.ok) throw new Error(`${u} answered ${r.status}`)
  const ct = r.headers.get('content-type') || ''
  if (!ct.includes('json')) throw new Error(`${u} is not json`)
  return r.json()
}
const getBytes = async (u) => {
  const r = await fetch(u)
  if (!r.ok) throw new Error(`${u} answered ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}
const writeFile = (p, bytes) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes) }

async function vendorMap(id) {
  const dir = path.join(PUB, 'maps-vendored', id)
  const manPath = path.join(dir, 'manifest.json')
  let man
  try { man = await getJson(`${host}/api/v1/maps/${encodeURIComponent(id)}`) }
  catch (e) { say(`${id}: not published or unreachable (${e.message}); keeping what is there`); return }
  let had = null
  try { had = JSON.parse(fs.readFileSync(manPath, 'utf8')) } catch { /* first time */ }
  const files = man.files || {}
  let fetched = 0, kept = 0
  for (const [name, f] of Object.entries(files)) {
    const dest = path.join(dir, name)
    const same = had && had.version === man.version && fs.existsSync(dest) && fs.statSync(dest).size === f.bytes
    if (same) { kept++; continue }
    writeFile(dest, await getBytes(`${host}${f.url}`))
    fetched++
  }
  // files a newer version no longer carries
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
  for (const p of walk(dir)) {
    const rel = path.relative(dir, p).split(path.sep).join('/')
    if (rel !== 'manifest.json' && !files[rel]) fs.rmSync(p)
  }
  writeFile(manPath, Buffer.from(JSON.stringify(man)))
  say(`${id} v${man.version}: ${fetched} fetched, ${kept} kept  ->  public/maps-vendored/${id}`)
}

async function vendorWorld() {
  try {
    const w = await getJson(`${host}/api/v1/world`)
    writeFile(path.join(PUB, 'world-vendored', 'composition.json'), Buffer.from(JSON.stringify(w)))
    say(`world v${w.version ?? '?'}  ->  public/world-vendored/composition.json`)
  } catch (e) { say(`world: unreachable (${e.message}); keeping what is there`) }
}

async function vendorKit() {
  try {
    const j = await getJson(`${host}/api/v1/ui`)
    const pieces = Array.isArray(j?.ui) ? j.ui : []
    const dir = path.join(PUB, 'ui-vendored')
    const out = []
    for (const p of pieces) {
      if (!p.src) { out.push(p); continue }
      const file = `${p.name}.png`
      const dest = path.join(dir, file)
      if (!(fs.existsSync(dest) && p.sha && fs.existsSync(dest + '.sha') && fs.readFileSync(dest + '.sha', 'utf8') === p.sha)) {
        writeFile(dest, await getBytes(`${host}${p.src.split('?')[0]}${p.sha ? `?v=${encodeURIComponent(p.sha)}` : ''}`))
        if (p.sha) fs.writeFileSync(dest + '.sha', p.sha)
      }
      out.push({ ...p, src: `/ui-vendored/${file}` })
    }
    writeFile(path.join(dir, 'kit.json'), Buffer.from(JSON.stringify({ ...j, ui: out })))
    say(`kit: ${out.length} pieces  ->  public/ui-vendored/`)
  } catch (e) { say(`kit: unreachable (${e.message}); keeping what is there`) }
}

for (const id of mapsWanted()) await vendorMap(id)
await vendorWorld()
await vendorKit()
