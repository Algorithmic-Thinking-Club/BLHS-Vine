/* RESUME AS A CONTRACT, AND THE MAP-VERSION GUARD UNDER IT.
 *
 * AUTHORING §13, second bullet, verbatim: *"MAPVIS publishes immutable versions
 * and any map can be re-cut at any time, so a saved position can land inside
 * blocked pixels or outside the painting, and a name a run scored against can be
 * gone. `publishBundle` adds `contract`, `slug` and `version`; the game uses
 * `version` only to build a fetch prefix and nothing records which version a save
 * was written against."*
 *
 * WHAT THAT LOOKS LIKE WHEN IT HAPPENS, which is why this is a guard and not a
 * warning. Ash re-cuts the hub, adds a wall where a student happened to be
 * standing, and publishes. Thirty Chromebooks resume next period inside blocked
 * pixels. The walk law refuses every direction, because every direction is into
 * the wall, and the game is a body that cannot move with no error anywhere. It is
 * indistinguishable from the engine being broken, it happens to a whole class at
 * once, and it happens the period after a publish nobody connects it to.
 *
 * THE RULE. A position is trusted only when the map, the map's published version
 * and the composition's version all match what is loaded now. Otherwise the exact
 * position is dropped and the map's own spawn is used, because a name survives a
 * re-cut and a pixel does not. An anchor is kept one step longer than x,y: it is
 * a name MAPVIS validates, so it is offered to the caller to try, and the caller
 * falls back to the spawn when the name is gone.
 *
 * AND A SHIP IS NEVER RESTORED AT SEA. Q80.6.c's recommendation on record: a
 * mid-voyage resume returns to a dock, because a dock is a named anchor on a
 * known map and a point on open water is neither. There is no version to check a
 * point of open water against and no painting it belongs to, so there is nothing
 * that could tell a valid one from a stale one. The composition's berth is the
 * answer and `VesselRecord` is a berth name by construction.
 */
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

/* WHY IT REFUSED, IN WORDS, because a resume that silently moves a student is a
 * resume nobody can debug. These are for the console and the captain's overlay
 * and never for the player: a fourteen year old does not need to be told a map
 * was republished, they need to be standing somewhere they can walk. */
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

  /* THE VERSION COMPARISON IS STRICT AND UNDEFINED IS NOT A WILDCARD. A save
   * written against a local folder carries no version and a bundle from the
   * platform does, so "one has a number and the other does not" is exactly the
   * case where the two are different bundles and the pixels cannot be trusted. */
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

/* ---- the ship ---------------------------------------------------------------
 *
 * A hull is rebuilt at a berth or it is not rebuilt at all. The record holds a
 * composition slot id rather than a point, so the only failure this can have is a
 * slot that no longer exists, and the answer to that is the home slot.
 */
export type Mooring =
  | { kind: 'berth'; slot: WorldSlot; why: string }
  | { kind: 'home'; slot?: WorldSlot; why: string }

export function mooringFor(v: VesselRecord | undefined, c: WorldComposition): Mooring {
  const home = c.home
    ? c.slots.find((s) => (s.place ?? s.map) === c.home!.slot)
    : undefined
  if (!v?.berthedAt) return { kind: 'home', slot: home, why: 'no vessel record: the run has not sailed' }
  const slot = c.slots.find((s) => (s.place ?? s.map) === v.berthedAt) ?? slotOfMap(c, v.berthedAt)
  /* A SLOT THAT WENT AWAY is the composition being re-authored under a save,
   * which is the same class of failure as a map being re-cut and gets the same
   * answer: fall back to something that exists rather than to a coordinate. */
  if (!slot?.berth) return { kind: 'home', slot: home, why: `berth "${v.berthedAt}" is not on this composition` }
  return { kind: 'berth', slot, why: 'moored where she was left' }
}

/* THE RECORD A SCENE WRITES BACK. Kept beside the reader so the two shapes cannot
 * drift: whatever `resumeTarget` compares is whatever this wrote. */
export const stampOf = (now: WorldStamp, anchor?: string, x?: number, y?: number): Omit<RunPosition, 'at'> => ({
  map: now.map,
  ...(now.mapVersion !== undefined ? { mapVersion: now.mapVersion } : {}),
  ...(now.worldVersion !== undefined ? { worldVersion: now.worldVersion } : {}),
  ...(anchor ? { anchor } : {}),
  ...(x !== undefined ? { x } : {}),
  ...(y !== undefined ? { y } : {}),
})
