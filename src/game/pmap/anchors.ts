/* the reader for a map's anchors, the named places code addresses on a map */
import { rolesOf, type Role } from '../run/roles'

export type AnchorKind = 'point' | 'region' | 'door' | 'post' | 'spawn' | 'trigger'

export const ANCHOR_KINDS: AnchorKind[] = ['point', 'region', 'door', 'post', 'spawn', 'trigger']

export interface Anchor {
  name: string
  kind: AnchorKind
  x: number
  y: number
  r: number
  /* the pixel a body ends on when it uses this place, which is not the middle of the thing; absent means the middle, which is what every anchor meant before it could be authored */
  stand?: [number, number]
  /* two opposite corners, [x0,y0,x1,y1]: the MAPVIS schema comment said [x,y,w,h] and this box test always did corners, and the side with running code won */
  rect?: [number, number, number, number]
  /* how far the interaction circle sits from the anchor's own pixel, centred if absent */
  ring?: [number, number]
  to?: string
  toAnchor?: string
  placement?: string
  facing?: string
  label: string
  meta?: Record<string, unknown>
}

/* the two shapes a bundle can carry, the current `anchors` and the older `events` */
export interface AnchorSource {
  anchors?: unknown
  events?: unknown
  /* read only to size the stand-point check below, both optional because a hand-written fixture is allowed to be two anchors and nothing else, and the fallbacks are the numbers every bundle carries */
  character?: { heightPx?: number } | unknown
  yScale?: unknown
}

/* how far a standing spot may be from the thing it belongs to, in body lengths */
const STAND_REACH_BODIES = 2

const num = (v: unknown, fallback: number) => (isFinite(Number(v)) ? Number(v) : fallback)

/* the same name rule MAPVIS applies where names are typed, checked again on the reading side because a bundle can be hand-edited and a name that is not a legal python identifier cannot be exposed by the API */
export const isAnchorName = (s: unknown) => typeof s === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(s)

/* read a bundle's anchors, dropping any it cannot understand so the map still loads */
export function readAnchors(map: AnchorSource, mapId = ''): Anchor[] {
  const raw = Array.isArray(map.anchors) ? map.anchors
    : Array.isArray(map.events) ? map.events
      : []
  const out: Anchor[] = []
  const seen = new Set<string>()
  /* the two numbers the stand-point check is sized in: every bundle carries both, and a fixture that carries neither gets the shape every bundle has */
  const ch = map.character as { heightPx?: unknown } | undefined
  const body = Math.max(4, num(ch?.heightPx, 20))
  const ys = num(map.yScale, 1) || 1
  for (const e of raw as Record<string, unknown>[]) {
    if (!e || typeof e !== 'object') continue
    if (!isFinite(Number(e.x)) || !isFinite(Number(e.y))) continue

    /* an older event carries `type` instead of `kind` and was always a door */
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
    /* a duplicate name is the one thing worth refusing, because the point of a name is that it resolves to one thing; the first wins, so a map that grew a collision keeps working the way it did */
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
    /* the ring offset can arrive as its own field or inside the meta bag */
    const rawRing = Array.isArray(e.ring) ? e.ring : meta && Array.isArray(meta.ring) ? meta.ring : null
    if (rawRing && rawRing.length === 2 && (rawRing as unknown[]).every((n) => isFinite(Number(n))))
      a.ring = [Math.round(Number(rawRing[0])), Math.round(Number(rawRing[1]))]
    if (Array.isArray(e.stand) && e.stand.length === 2 && e.stand.every((n) => isFinite(Number(n)))) {
      const sx = Math.round(Number(e.stand[0])), sy = Math.round(Number(e.stand[1]))
      /* ground pixels, not screen ones: the painting is squashed, so a spot the same number of pixels below a post is further away on the floor than one beside it */
      const apart = Math.hypot(sx - a.x, (sy - a.y) / ys)
      const reach = STAND_REACH_BODIES * body + a.r
      if (apart <= reach) a.stand = [sx, sy]
      else {
        console.warn(`[anchors] ${mapId}: "${name}" stands at ${sx},${sy}, which is ${Math.round(apart)}`
          + ` pixels of floor from the post itself at ${a.x},${a.y} and past its reach of ${Math.round(reach)}.`
          + ' A standing spot is the floor beside a thing, so this one was left behind when the post moved.'
          + " Using the post's own pixel. Drag the standing spot with it in MAPVIS and republish.")
      }
    }
    if (typeof e.to === 'string' && e.to) a.to = e.to
    if (typeof e.toAnchor === 'string' && e.toAnchor) a.toAnchor = e.toAnchor
    if (typeof e.placement === 'string' && e.placement) a.placement = e.placement
    if (typeof e.facing === 'string' && e.facing) a.facing = e.facing
    out.push(a)
  }
  return out
}

/* MAPVIS's own anchorName, copied for the derive path above and kept identical so a legacy door derives to the same string on both sides of the boundary */
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

/* where a placement is being drawn this frame, answered by whoever is drawing it, and null for a name nothing on this map carries */
export type LiveSpots = (placement: string) => { x: number; y: number } | null

export class AnchorSet {
  private byName = new Map<string, Anchor>()
  private byRoleName = new Map<Role, Anchor>()
  private roleByName = new Map<string, Role>()
  private live: LiveSpots | null = null
  readonly all: Anchor[]

  constructor(readonly mapId: string, anchors: Anchor[]) {
    this.all = anchors
    for (const a of anchors) this.byName.set(a.name, a)
    this.byRoleName = rolesOf(anchors, mapId)
    for (const [role, a] of this.byRoleName) this.roleByName.set(a.name, role)
  }

  static from(mapId: string, map: AnchorSource) {
    return new AnchorSet(mapId, readAnchors(map, mapId))
  }

  get(name: string): Anchor | undefined { return this.byName.get(name) }
  has(name: string): boolean { return this.byName.has(name) }

  /* the anchor filling a role on this map; a null role is nobody, which is how a step that wants no arrow drawn says so */
  byRole(role: Role | null | undefined): Anchor | undefined {
    return role ? this.byRoleName.get(role) : undefined
  }

  /* what this anchor is for on this map, or null when it fills no role */
  roleOf(name: string): Role | null { return this.roleByName.get(name) ?? null }
  ofKind(kind: AnchorKind): Anchor[] { return this.all.filter((a) => a.kind === kind) }

  /* hand in who knows where the painted things are drawn this frame */
  follow(spots: LiveSpots | null) { this.live = spots }

  /* where this anchor is right now, following the painted thing it is bound to */
  spotOf(a: Anchor): { x: number; y: number } {
    if (a.placement && this.live) {
      const p = this.live(a.placement)
      if (p) return p
    }
    return { x: a.x, y: a.y }
  }

  /* the floor a body ends up on at this anchor, and which way it looks there */
  standAt(a: Anchor): { x: number; y: number; facing?: string } {
    const spot = this.spotOf(a)
    if (!a.stand) return { ...spot, facing: a.facing }
    return {
      x: a.stand[0] + (spot.x - a.x),
      y: a.stand[1] + (spot.y - a.y),
      facing: a.facing,
    }
  }

  /* is a point inside this anchor's reach, by its rectangle if it has one */
  contains(a: Anchor, x: number, y: number): boolean {
    if (a.kind === 'region' && a.rect) {
      const [x0, y0, x1, y1] = a.rect
      return x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1)
    }
    const p = this.ringOf(a)
    return Math.hypot(x - p.x, y - p.y) <= a.r
  }

  /* where the interaction circle sits, which is the spot plus the author's offset */
  ringOf(a: Anchor): { x: number; y: number } {
    const p = this.spotOf(a)
    if (!a.ring) return p
    return { x: p.x + a.ring[0], y: p.y + a.ring[1] }
  }

  /* the nearest anchor a player can walk up to and press a button at */
  nearestInteractive(x: number, y: number): Anchor | null {
    let best: Anchor | null = null
    let bestD = Infinity
    for (const a of this.all) {
      if (a.kind !== 'point' && a.kind !== 'post' && a.kind !== 'door') continue
      // the same circle `contains` tests, or a ring the author moved would take the prompt at one distance and refuse it at another
      const p = this.ringOf(a)
      const d = Math.hypot(x - p.x, y - p.y)
      if (d <= a.r && d < bestD) { bestD = d; best = a }
    }
    return best
  }

  /* every region and trigger the point is inside, not the nearest, because an atmosphere region and a quest trigger can legitimately overlap and both are entitled to know you are there */
  regionsAt(x: number, y: number): Anchor[] {
    return this.all.filter((a) => (a.kind === 'region' || a.kind === 'trigger') && this.contains(a, x, y))
  }

  /* where a player arriving through a door should stand, falling back down a chain rather than to the origin because landing at 0,0 is landing in the rock */
  arrival(at: string | undefined, spawn: [number, number]): { x: number; y: number; facing?: string } {
    // through standAt, so a door that lands you at a station puts you on the floor beside it rather than on top of it
    const a = at ? this.get(at) : undefined
    if (a) return this.standAt(a)
    if (at) console.warn(`[anchors] ${this.mapId}: no arrival anchor "${at}", using spawn`)
    const s = this.ofKind('spawn')[0]
    if (s) return this.standAt(s)
    return { x: spawn[0], y: spawn[1] }
  }
}
