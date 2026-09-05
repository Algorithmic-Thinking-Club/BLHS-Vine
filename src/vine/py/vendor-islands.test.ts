/* THE VENDORED ISLANDS ARE REALLY THERE, AND THE BUILD REALLY FETCHES THEM.
 *
 * Since 2026-09-05 `public/grapes/panther-maw/` and `public/grapes/castaway/`
 * are build output, written by `scripts/vendor-islands.mjs` out of the repo that
 * owns them (docs/ops/BRIEF-YEAR-ONE.md, WHERE IT LIVES). They are gitignored,
 * so a clone that never runs the vendor has two empty spaces where the home base
 * and the opening should be.
 *
 * That is the failure this file is for. `loader.test.ts` walks whatever happens
 * to be in `public/grapes` and asserts each one loads, which is exactly right
 * for a fixture and useless here: with the folders absent it iterates the three
 * fixtures, passes, and says nothing about the two islands that carry the first
 * twenty minutes of the game. A green run that tested less than it did yesterday
 * is the thing to catch.
 */
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
  const m = src.match(/const ISLANDS = \[([^\]]*)\]/)
  if (!m) throw new Error('scripts/vendor-islands.mjs no longer declares an ISLANDS array')
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
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
