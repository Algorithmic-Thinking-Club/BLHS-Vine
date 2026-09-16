/* where a resume puts the body, and when a saved position is dropped for the map's own spawn */
import type { RunPosition, SaveGame } from '../save'
import type { WorldComposition, WorldSlot } from '../world/composition'
import { slotOfMap } from '../world/composition'
import type { VesselRecord } from '../world/sail'

/** what is loaded right now, which is the other half of every comparison */
export type WorldStamp = {
  map: string
  /** the published version the bundle came from, absent for a local folder */
  mapVersion?: number
  /** the composition document's version */
  worldVersion?: number
}

export type ResumeTarget =
  /** the position is trusted whole: put the body back exactly where it was */
  | { kind: 'exact'; map: string; x: number; y: number; anchor?: string; why: string }
  /** the pixels were dropped, the name survived: try this anchor, then the spawn */
  | { kind: 'anchor'; map: string; anchor: string; why: string }
  /** nothing survived: the map's own spawn */
  | { kind: 'spawn'; map: string; why: string }

/* why a resume refused, in words, for the console rather than for the player */
export const RESUME_REASONS = {
  fresh: 'no position on the save yet',
  otherMap: 'the saved position is on a different map',
  mapVersion: 'the map was republished since this position was written',
  worldVersion: 'the world composition changed since this position was written',
  noPixels: 'the position carried no pixels, only a name',
  trusted: 'same map, same version, same composition',
} as const

/** where a resume puts the body, given what the save holds and what is loaded */
export function resumeTarget(where: RunPosition | undefined, now: WorldStamp): ResumeTarget {
  const nameOrSpawn = (why: string): ResumeTarget =>
    where?.anchor
      ? { kind: 'anchor', map: now.map, anchor: where.anchor, why }
      : { kind: 'spawn', map: now.map, why }

  if (!where) return { kind: 'spawn', map: now.map, why: RESUME_REASONS.fresh }
  if (where.map !== now.map) return { kind: 'spawn', map: now.map, why: RESUME_REASONS.otherMap }

  /* the version comparison is strict, and a missing version is not a wildcard */
  if (where.mapVersion !== now.mapVersion) return nameOrSpawn(RESUME_REASONS.mapVersion)
  if (where.worldVersion !== now.worldVersion) return nameOrSpawn(RESUME_REASONS.worldVersion)
  if (where.x === undefined || where.y === undefined) return nameOrSpawn(RESUME_REASONS.noPixels)

  return {
    kind: 'exact', map: now.map, x: where.x, y: where.y,
    ...(where.anchor ? { anchor: where.anchor } : {}),
    why: RESUME_REASONS.trusted,
  }
}

/** the same question asked of a whole save, which is what a scene has in hand */
export const resumeFor = (s: SaveGame | null, now: WorldStamp): ResumeTarget =>
  resumeTarget(s?.where, now)

/* ---- the ship: a hull is rebuilt at a berth, or at the home slot ---- */
export type Mooring =
  | { kind: 'berth'; slot: WorldSlot; why: string }
  | { kind: 'home'; slot?: WorldSlot; why: string }

export function mooringFor(v: VesselRecord | undefined, c: WorldComposition): Mooring {
  const home = c.home
    ? c.slots.find((s) => (s.place ?? s.map) === c.home!.slot)
    : undefined
  if (!v?.berthedAt) return { kind: 'home', slot: home, why: 'no vessel record: the run has not sailed' }
  const slot = c.slots.find((s) => (s.place ?? s.map) === v.berthedAt) ?? slotOfMap(c, v.berthedAt)
  /* a slot that went away falls back to something that still exists, as a re-cut map does */
  if (!slot?.berth) return { kind: 'home', slot: home, why: `berth "${v.berthedAt}" is not on this composition` }
  return { kind: 'berth', slot, why: 'moored where she was left' }
}

/* the record a scene writes back, kept beside the reader so the two shapes cannot drift */
export const stampOf = (now: WorldStamp, anchor?: string, x?: number, y?: number): Omit<RunPosition, 'at'> => ({
  map: now.map,
  ...(now.mapVersion !== undefined ? { mapVersion: now.mapVersion } : {}),
  ...(now.worldVersion !== undefined ? { worldVersion: now.worldVersion } : {}),
  ...(anchor ? { anchor } : {}),
  ...(x !== undefined ? { x } : {}),
  ...(y !== undefined ? { y } : {}),
})
