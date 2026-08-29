/* ANCHORS, READ AT LAST.
 *
 * MAPVIS has published these since 2026-08-26 and the game has never once
 * looked at them. PmapScene read `map.events` and filtered `type === 'door'`,
 * which is the shape from before anchors existed, so `name`, `kind`, `meta` and
 * `toAnchor` all arrived in every bundle and went straight in the bin. The whole
 * addressing system the Python API is meant to sit on was already in the file.
 *
 * This module is the reader. It is deliberately its own file and not a few more
 * lines in PmapScene, because an anchor is a contract with another repo and the
 * next person to change it should find one place that knows the shape.
 *
 * The contract, verbatim from MAPVIS-next/src/core/mask.ts:143-192:
 *
 *   AnchorKind = 'point' | 'region' | 'door' | 'post' | 'spawn' | 'trigger'
 *   MapAnchor  = { id, name, kind, x, y, r, rect?, to, toAnchor?, placement?,
 *                  facing?, label, meta? }
 *
 * `name` is what code addresses and `label` is what a player reads, and they are
 * two fields for the reason the tool's own comment gives: one string doing both
 * means renaming a door for the player silently breaks a member's island.
 */

export type AnchorKind = 'point' | 'region' | 'door' | 'post' | 'spawn' | 'trigger'

export const ANCHOR_KINDS: AnchorKind[] = ['point', 'region', 'door', 'post', 'spawn', 'trigger']

export interface Anchor {
  name: string
  kind: AnchorKind
  x: number
  y: number
  r: number
  rect?: [number, number, number, number]
  to?: string
  toAnchor?: string
  placement?: string
  facing?: string
  label: string
  meta?: Record<string, unknown>
}

/* the two shapes a bundle can carry. `anchors` is current; `events` is what
 * every bundle exported before August and is still written alongside for
 * exactly this reason. A reader that handles both is a reader that never has to
 * care which era a map came from. */
export interface AnchorSource {
  anchors?: unknown
  events?: unknown
}

const num = (v: unknown, fallback: number) => (isFinite(Number(v)) ? Number(v) : fallback)

/* MAPVIS validates names where they are typed. This is the same rule on the
 * reading side, because a bundle can also be hand-edited and a name that is not
 * a legal python identifier is a name the API cannot expose. */
export const isAnchorName = (s: unknown) => typeof s === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(s)

/* THE TOLERANT PARSE, and it stays tolerant on purpose.
 *
 * A map is authored in another repo by a person, and it will arrive with a kind
 * this build has not heard of, or a door with no target, or a name somebody
 * typed in caps. None of that is a reason to show a black screen. An anchor that
 * cannot be understood is dropped with a console line naming it, and the rest of
 * the map loads. The alternative is a map that refuses to open because one
 * trigger was misspelt, which is the failure mode that makes a tool unusable for
 * the person it was built for.
 */
export function readAnchors(map: AnchorSource, mapId = ''): Anchor[] {
  const raw = Array.isArray(map.anchors) ? map.anchors
    : Array.isArray(map.events) ? map.events
      : []
  const out: Anchor[] = []
  const seen = new Set<string>()
  for (const e of raw as Record<string, unknown>[]) {
    if (!e || typeof e !== 'object') continue
    if (!isFinite(Number(e.x)) || !isFinite(Number(e.y))) continue

    /* a legacy event carries `type`, not `kind`, and every legacy event was a
     * door. A legacy door also has no name, so one is derived from its label the
     * way MAPVIS derives it, and marked derived so anything reading meta knows
     * the name is a guess rather than something a person chose. */
    const legacyType = typeof e.type === 'string' ? e.type : ''
    const kindRaw = typeof e.kind === 'string' ? e.kind : legacyType === 'door' || !legacyType ? 'door' : 'point'
    if (!(ANCHOR_KINDS as string[]).includes(kindRaw)) {
      console.warn(`[anchors] ${mapId}: skipping anchor of unknown kind "${kindRaw}"`)
      continue
    }
    const kind = kindRaw as AnchorKind

    const label = typeof e.label === 'string' ? e.label : ''
    let name = typeof e.name === 'string' ? e.name : ''
    let derived = false
    if (!isAnchorName(name)) {
      name = anchorName(label || `${kind}_${num(e.id, out.length + 1)}`)
      derived = true
    }
    /* a duplicate name is the one thing worth refusing, because the whole point
     * of a name is that it resolves to one thing. The first wins, so a map that
     * grew a collision keeps working the way it did before it grew one. */
    if (seen.has(name)) {
      console.warn(`[anchors] ${mapId}: duplicate anchor name "${name}", keeping the first`)
      continue
    }
    seen.add(name)

    const meta = e.meta && typeof e.meta === 'object' ? { ...(e.meta as Record<string, unknown>) } : undefined
    const a: Anchor = {
      name,
      kind,
      x: Math.round(num(e.x, 0)),
      y: Math.round(num(e.y, 0)),
      r: Math.max(1, Math.round(num(e.r, 14))),
      label,
      ...(derived ? { meta: { ...(meta || {}), derived: true } } : meta ? { meta } : {}),
    }
    if (Array.isArray(e.rect) && e.rect.length === 4) a.rect = (e.rect as number[]).map(Number) as Anchor['rect']
    if (typeof e.to === 'string' && e.to) a.to = e.to
    if (typeof e.toAnchor === 'string' && e.toAnchor) a.toAnchor = e.toAnchor
    if (typeof e.placement === 'string' && e.placement) a.placement = e.placement
    if (typeof e.facing === 'string' && e.facing) a.facing = e.facing
    out.push(a)
  }
  return out
}

/* MAPVIS's own anchorName, copied for the derive path above. Kept identical so a
 * legacy door derives to the same string on both sides of the boundary. */
export function anchorName(s: string): string {
  const n = String(s || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'a$1')
    .slice(0, 48)
  return n || 'anchor'
}

/* ---- asking questions about a map's anchors ------------------------------- */

/* where a placement is being drawn this frame, answered by whoever is drawing
 * it. Null for a name nothing on this map carries. */
export type LiveSpots = (placement: string) => { x: number; y: number } | null

export class AnchorSet {
  private byName = new Map<string, Anchor>()
  private live: LiveSpots | null = null
  readonly all: Anchor[]

  constructor(readonly mapId: string, anchors: Anchor[]) {
    this.all = anchors
    for (const a of anchors) this.byName.set(a.name, a)
  }

  static from(mapId: string, map: AnchorSource) {
    return new AnchorSet(mapId, readAnchors(map, mapId))
  }

  get(name: string): Anchor | undefined { return this.byName.get(name) }
  has(name: string): boolean { return this.byName.has(name) }
  ofKind(kind: AnchorKind): Anchor[] { return this.all.filter((a) => a.kind === kind) }

  /* WHO KNOWS WHERE THE PAINTED THINGS ARE. Handed in by the scene once its
   * placements are on screen. Without it every anchor answers with the x and y
   * the bundle carries, which is what a map with no movers wants and is what
   * every reader before this got. */
  follow(spots: LiveSpots | null) { this.live = spots }

  /* WHERE THIS ANCHOR IS RIGHT NOW, which is not always where it was exported.
   *
   * A bound anchor is a name ON a painted thing, and seventeen of the hub's
   * people wander: their position is a function of the clock, so the bundle can
   * only honestly carry where they start. MAPVIS writes the home position for
   * that reason, deliberately, and the following happens here. Without this the
   * prompt ring, the objective marker and the interaction test for every
   * anchor on a figure who paces all sit on the spot she left at load.
   *
   * Everything below asks through here rather than reading a.x directly, so
   * there is one answer to the question and no caller has to know a placement
   * exists. */
  spotOf(a: Anchor): { x: number; y: number } {
    if (a.placement && this.live) {
      const p = this.live(a.placement)
      if (p) return p
    }
    return { x: a.x, y: a.y }
  }

  /* is a point inside this anchor's reach. A region uses its rectangle when it
   * has one, because a rectangle is what the author drew and a circle around its
   * centre is a different shape than the one they meant. Everything else is the
   * radius, which is what the door prompt has always used. */
  contains(a: Anchor, x: number, y: number): boolean {
    if (a.kind === 'region' && a.rect) {
      const [x0, y0, x1, y1] = a.rect
      return x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1)
    }
    const p = this.spotOf(a)
    return Math.hypot(x - p.x, y - p.y) <= a.r
  }

  /* THE NEAREST ONE THAT WANTS A BUTTON PRESS.
   *
   * `point`, `post` and `door` are things you walk up to and interact with.
   * `region` and `trigger` fire by being entered and must never take the prompt,
   * or standing in a big region would suppress the table you are standing at.
   * `spawn` is an address, not a place.
   *
   * Nearest wins, which is why station spacing is a real constraint: two posts
   * whose rings overlap mean one of them is unreachable from the overlap.
   */
  nearestInteractive(x: number, y: number): Anchor | null {
    let best: Anchor | null = null
    let bestD = Infinity
    for (const a of this.all) {
      if (a.kind !== 'point' && a.kind !== 'post' && a.kind !== 'door') continue
      const p = this.spotOf(a)
      const d = Math.hypot(x - p.x, y - p.y)
      if (d <= a.r && d < bestD) { bestD = d; best = a }
    }
    return best
  }

  /* every region and trigger the point is inside. All of them, not the nearest:
   * an atmosphere region and a quest trigger can legitimately overlap and both
   * are entitled to know you are there. */
  regionsAt(x: number, y: number): Anchor[] {
    return this.all.filter((a) => (a.kind === 'region' || a.kind === 'trigger') && this.contains(a, x, y))
  }

  /* where a player arriving through a door should stand. Falls back down a chain
   * rather than to the origin, because landing at 0,0 is landing in the rock. */
  arrival(at: string | undefined, spawn: [number, number]): { x: number; y: number; facing?: string } {
    const a = at ? this.get(at) : undefined
    if (a) return { ...this.spotOf(a), facing: a.facing }
    if (at) console.warn(`[anchors] ${this.mapId}: no arrival anchor "${at}", using spawn`)
    const s = this.ofKind('spawn')[0]
    if (s) return { ...this.spotOf(s), facing: s.facing }
    return { x: spawn[0], y: spawn[1] }
  }
}
