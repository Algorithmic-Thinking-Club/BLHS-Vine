// THE ISLAND REGISTRY — the future-stable seam (GAME-DESIGN §3.1 [LOCKED]).
// The island map renders whatever this array holds: today the Central Island alone in a vast
// sea (which must read as promise, not emptiness); every grape island ATC ships later appends
// an entry and takes its place with ZERO world-code changes. The renderer asks each entry for
// its geometry through the shape provider, so a bespoke island (central) and a composed ring+
// stage island (grapes, §14.1) render through the same loop.

export type IslandId = 'central' | (string & {})

export type IslandDef = {
  id: IslandId
  label: string
  kind: 'central' | 'grape'
  /** tile-space center */
  cx: number
  cy: number
  /** rough radius in 32px screen units (bbox/culling; the shape fn is the truth) */
  radius: number
  /** taxonomy group -> compass placement (GAME-DESIGN §3.1); central ignores it */
  group?: 'athletics-west' | 'arts-north' | 'trades-south' | 'stem-east' | 'service' | 'interest'
}

export const ISLANDS: IslandDef[] = [
  { id: 'central', label: 'the Central Island', kind: 'central', cx: 192, cy: 192, radius: 64 },
  // grape islands rise here (§6.5) — e.g.:
  // { id: 'atc', label: 'ATC', kind: 'grape', cx: 300, cy: 132, radius: 22, group: 'stem-east' },
]
