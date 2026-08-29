/* WHO OWNS AN ANCHOR, AND IN WHAT ORDER THEY ARE ASKED.
 *
 * Island twelve's author places a `post` in MAPVIS, names it `coach`, writes
 * `@on_talk("coach")` because that is what every member document shows, walks up
 * to it in the game and presses E. Before this file, nothing happened: `fire()`
 * routed a door to `beginExit` and everything else to `stationByName`, a lookup
 * in the Maw's eight-entry array, and a miss returned silently.
 *
 * Then twelve members work around it the same way, because there is one way, and
 * ship twelve linear scripts that each feel like the same island.
 *
 * THE ORDER IS WRITTEN DOWN RATHER THAN DISCOVERED, which is §80.8's own clause
 * and the reason this is a file and not three lines inside PmapScene:
 *
 *   1. a door is a door. It was never a station and it is not a grape.
 *   2. THE GRAPE IS ASKED FIRST.
 *   3. the station table is the fallback.
 *
 * The Maw's stations being the fallback rather than the default is the whole
 * point. Six stations in one hardcoded array is a shape that works exactly once,
 * and the moment there is a second author the vine's own content has to queue
 * behind theirs like everybody else. It also means a member can take over an
 * anchor the vine already answers to, on their own map, without asking anybody.
 *
 * AND AN ANCHOR NOBODY CLAIMS SAYS SO BY NAME (W13). Silence is what a member
 * cannot tell apart from a typo in their own file, and it is the single most
 * likely mistake they will make.
 */
import type { Station } from '../maw/stations'
import { stationByName } from '../maw/stations'

export type AnchorOwner =
  | { by: 'station'; station: Station }
  /* the key to hand `GrapeSession.call`, already in the shape the worker wants */
  | { by: 'grape'; handler: string }

/** who answers to this anchor name, asking the loaded island before the vine */
export function ownerOf(name: string, handlers: readonly string[] = []): AnchorOwner | null {
  const handler = `talk:${name}`
  if (handlers.includes(handler)) return { by: 'grape', handler }
  const station = stationByName(name)
  return station ? { by: 'station', station } : null
}

/* WHAT A PLAYER READS WHEN STANDING NEAR IT.
 *
 * The anchor's own `label` wins, because the person who placed it in MAPVIS gets
 * the last word on player-facing text. A station has a written fallback. A grape
 * has none: a member names their handler after the anchor and never writes a
 * label for it, so the anchor's name is the honest last resort rather than a
 * guess assembled out of the handler key. */
export const labelFor = (owner: AnchorOwner | null, name: string): string =>
  owner?.by === 'station' ? owner.station.fallbackLabel : name

/* WHETHER PRESSING E WOULD DO ANYTHING, which has to agree with `fire` or the
 * prompt never appears and the key is never offered.
 *
 * A station can be closed for a reason the world explains. A grape cannot: the
 * engine has no way to ask a member's island whether it feels available, and
 * inventing one would be inventing a handler nobody documented. A registered
 * handler is always ready, and an island that wants a locked door writes the
 * "not yet" line inside the handler where it can say why. */
export function isReady<S>(owner: AnchorOwner | null, save: S | null): boolean {
  if (!owner) return false
  if (owner.by === 'grape') return true
  return !!save && (!owner.station.available || owner.station.available(save as never))
}
