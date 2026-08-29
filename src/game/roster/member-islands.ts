/* THE ISLANDS ATC HAS SHIPPED, AS DATA AND NOT AS SOURCE.
 *
 * A member never opens this repository. The path from "I built an island" to
 * "the game knows about it" has to be a pull request against blhs-islands that
 * adds ONE ROW, Ash merging it, and nothing else. Before this, `playable` was a
 * hardcoded Set in year.ts and a programme was a literal in roster.ts, so the
 * only way onto the roster was for somebody to edit the engine, which is the
 * one thing the whole member model says never happens.
 *
 * So the row lives in `member-islands.json`, which is data. Adding an island is
 * a diff nobody has to read as code, and `npm run build` does not care.
 *
 * WHERE THE MASTER COPY LIVES, and why there are two. The member's copy is
 * `islands.json` in blhs-islands, which is where their PR lands and where
 * `tools/manifest.py` checks it against the folders that actually exist. This
 * one is the engine's copy of the same rows, because a game that asked GitHub
 * for its roster at boot would be a game that does not open on a school network
 * with a bad afternoon. A test in the members' repo fails when the two differ,
 * the same fence that holds vine.py and grape.py together.
 */
import type { Season } from '../save'
import data from './member-islands.json'

export type MemberIsland = {
  /** the roster programme id. What `award(programme=...)` names. */
  programme: string
  /** the painting it is played on. A different key space; never the same string. */
  map: string
  /** the folder in blhs-islands, and the folder its package is served from */
  folder: string
  name: string
  place: string
  kind: 'sport' | 'club'
  season?: Season
  tags: string[]
  rankTrack?: string
  /** whether its loop can actually run today. N1: a property of the programme. */
  playable: boolean
  blurb: string
  host?: string
  /** where the blurb and the host came from. Never invented, never absent. */
  source: string
}

/* the shape of the file is checked rather than asserted, because it is data a
 * member's pull request edits and a bad row should name itself here rather than
 * become a blank space somewhere in the planner */
export type IslandFault = { row: string; why: string }

const RAW = data as { format: number; islands: unknown[] }

export function islandFaults(rows: unknown[] = RAW.islands): IslandFault[] {
  const out: IslandFault[] = []
  const seen = new Map<string, string>()
  rows.forEach((row, i) => {
    const r = row as Partial<MemberIsland>
    const where = r.programme ?? r.folder ?? `row ${i + 1}`
    const need = (k: keyof MemberIsland) => {
      if (typeof r[k] !== 'string' || !(r[k] as string).trim()) {
        out.push({ row: where, why: `\`${k}\` is missing` })
      }
    }
    for (const k of ['programme', 'map', 'folder', 'name', 'place', 'blurb', 'source'] as const) need(k)
    if (r.kind !== 'sport' && r.kind !== 'club') out.push({ row: where, why: '`kind` is sport or club' })
    if (typeof r.playable !== 'boolean') out.push({ row: where, why: '`playable` is true or false' })
    if (!Array.isArray(r.tags)) out.push({ row: where, why: '`tags` is a list, empty if none' })
    /* THE KEY SPACES STAY DISJOINT, here as in the manifest and in the roster's
     * own faults. An id that is both a programme and a map cannot be resolved. */
    for (const k of ['programme', 'map'] as const) {
      const v = r[k]
      if (typeof v !== 'string') continue
      const owner = seen.get(v)
      if (owner) out.push({ row: where, why: `${k} "${v}" is already claimed by ${owner}` })
      else seen.set(v, `${where}'s ${k}`)
    }
  })
  return out
}

/* a bad row is dropped rather than allowed to become an undefined somewhere in
 * the planner, and it is named out loud on the way out */
const bad = new Set(islandFaults().map((f) => f.row))
for (const f of islandFaults()) {
  console.warn(`[member-islands] ${f.row}: ${f.why}`)
}

export const MEMBER_ISLANDS: MemberIsland[] = (RAW.islands as MemberIsland[])
  .filter((r) => !bad.has(r.programme ?? r.folder))

const byMap = new Map(MEMBER_ISLANDS.map((i) => [i.map, i]))

/** the island a painting belongs to, which is how a map finds its python */
export const islandOfMap = (mapId: string | undefined): MemberIsland | undefined =>
  mapId ? byMap.get(mapId) : undefined
