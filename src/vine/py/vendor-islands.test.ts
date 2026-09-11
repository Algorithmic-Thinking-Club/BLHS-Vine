/* the vendored islands are really on disk and the build really fetches them */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { VINE_ISLANDS } from '../../game/roster/vine-islands'

const ROOT = process.cwd()
const GRAPES = path.join(ROOT, 'public', 'grapes')
const VENDOR = path.join(ROOT, 'scripts', 'vendor-islands.mjs')

/* read out of the script's source rather than by importing it: the module runs
 * the whole vendor on import, network and all, and a test that fetched GitHub
 * would fail on a train instead of failing on a mistake */
const vendored = (): string[] => {
  const src = fs.readFileSync(VENDOR, 'utf8')
  /* THE VINE'S OWN THREE ARE A LITERAL; the members' folders are read off
   * `member-islands.json` at vendor time (Ash, 2026-09-09), so this reads the
   * literal and adds the same file the script does. Reading the source rather
   * than importing it is deliberate: the module runs the whole vendor on import,
   * network and all, and a test that fetched GitHub would fail on a train
   * instead of failing on a mistake. */
  const m = src.match(/const VINE_OWN = \[([^\]]*)\]/)
  if (!m) throw new Error('scripts/vendor-islands.mjs no longer declares a VINE_OWN array')
  const own = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  const rows = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'src/game/roster/member-islands.json'), 'utf8',
  )).islands ?? []
  return [...own, ...rows.map((r: { folder?: string }) => r.folder).filter(Boolean)]
}

describe('the islands the vine owns', () => {
  it('are all on the vendor list', () => {
    /* a row added to vine-islands.ts and not here is an island the engine binds
     * to a map and then cannot serve: /grapes/<folder>/ 404s and the map comes
     * up with no python behind it */
    for (const i of VINE_ISLANDS) expect(vendored()).toContain(i.folder)
  })

  it('are on disk, which means the vendor actually ran', () => {
    for (const id of vendored()) {
      const dir = path.join(GRAPES, id)
      expect(fs.existsSync(dir), `public/grapes/${id} is missing. Run \`npm run vendor\`.`).toBe(true)
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'island.json'), 'utf8'))
      /* the entry is the one file the engine imports, so its absence is the
       * whole island's absence however many other modules came across */
      expect(fs.existsSync(path.join(dir, m.entry)), `${id}/${m.entry}`).toBe(true)
    }
  })

  it('are fetched by the build and not only by somebody remembering', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    /* build is the one that matters: without it Vercel deploys a game whose home
     * base is a 404, and it looks completely finished until somebody walks into
     * the mountain */
    for (const s of ['build', 'dev', 'test']) {
      expect(pkg.scripts[s], `npm run ${s}`).toContain('vendor-islands.mjs')
    }
  })
})
