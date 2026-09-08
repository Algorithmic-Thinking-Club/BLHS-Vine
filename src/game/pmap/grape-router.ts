/* who answers an anchor: a door first, then the island's grape, then the Maw's stations */
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

/* what a player reads when standing near an anchor */
export const labelFor = (owner: AnchorOwner | null, name: string): string =>
  owner?.by === 'station' ? owner.station.fallbackLabel : name

/* whether pressing E would do anything, which has to agree with `fire` */
export function isReady<S>(owner: AnchorOwner | null, save: S | null): boolean {
  if (!owner) return false
  if (owner.by === 'grape') return true
  return !!save && (!owner.station.available || owner.station.available(save as never))
}
