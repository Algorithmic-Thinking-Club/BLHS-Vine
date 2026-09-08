/* paths: the named lines a body, a hull or a camera is sent along, read off a map bundle */

export type PathKind = 'walk' | 'sail' | 'camera'

export const PATH_KINDS: PathKind[] = ['walk', 'sail', 'camera']

/* A NAMED WAYPOINT, so a beat can say "be at the doorway by the time this line
 * ends" instead of "walk for 2.4 seconds". `at` is an index into `points`, which
 * is what stops a mark naming a waypoint that is not there. */
export type PathMark = { at: number; name: string; label?: string }

export type Pathway = {
  name: string
  kind: PathKind
  points: { x: number; y: number }[]
  /** a patrol returns to its first point; an approach does not */
  closed: boolean
  /** whether travelling it backwards is legal. A sail line into a berth is not a
   *  line out of one, so one-way is the honest default. */
  twoWay: boolean
  /** the heading to hold on arrival, in the same eight-way vocabulary as walking */
  facing?: string
  marks: PathMark[]
  meta?: Record<string, unknown>
}

export type PathSource = { paths?: unknown }

/* reads a number, and only a number, so null and empty strings do not become zero */
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v)
  return null
}

/* the same rule MAPVIS validates names by where they are typed, applied on the
 * reading side, because a bundle can also be hand-edited and a name that is not a
 * legal python identifier is a name the API cannot expose */
export const isPathName = (s: unknown) => typeof s === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(s)

/* reads the paths off a map, dropping any one that cannot be understood */
export function readPaths(map: PathSource, mapId = ''): Pathway[] {
  const raw = Array.isArray(map.paths) ? map.paths : []
  const out: Pathway[] = []
  const seen = new Set<string>()
  for (const e of raw as Record<string, unknown>[]) {
    if (!e || typeof e !== 'object') continue
    const name = typeof e.name === 'string' ? e.name : ''
    if (!isPathName(name)) {
      console.warn(`[paths] ${mapId}: dropping a path whose name is not addressable: "${String(e.name)}"`)
      continue
    }
    if (seen.has(name)) {
      console.warn(`[paths] ${mapId}: duplicate path name "${name}", keeping the first`)
      continue
    }
    /* a path with an unreadable waypoint is refused whole rather than renumbered */
    const pts: { x: number; y: number }[] = []
    let broken = -1
    const raw = Array.isArray(e.points) ? e.points : []
    for (let pi = 0; pi < raw.length && broken < 0; pi++) {
      const p = raw[pi]
      const px = Array.isArray(p) ? num(p[0]) : num((p as Record<string, unknown>)?.x)
      const py = Array.isArray(p) ? num(p[1]) : num((p as Record<string, unknown>)?.y)
      if (px === null || py === null) { broken = pi; break }
      pts.push({ x: Math.round(px), y: Math.round(py) })
    }
    if (broken >= 0) {
      console.warn(`[paths] ${mapId}: path "${name}" has an unreadable waypoint at index ${broken}, `
        + `so the whole route is dropped rather than silently renumbered`)
      continue
    }
    /* ONE POINT IS NOT A LINE. A route of a single waypoint is a `walk_to` with a
     * longer name and it would travel zero pixels while reporting that it went
     * somewhere, which is the failure this project keeps paying for. */
    if (pts.length < 2) {
      console.warn(`[paths] ${mapId}: path "${name}" has ${pts.length} usable point${pts.length === 1 ? '' : 's'} and needs two`)
      continue
    }
    /* walk is the default kind, and it is MAPVIS's own default too */
    const kindRaw = typeof e.kind === 'string' ? e.kind : 'walk'
    const kind = (PATH_KINDS as string[]).includes(kindRaw) ? kindRaw as PathKind : 'walk'
    if (kind !== kindRaw)
      console.warn(`[paths] ${mapId}: path "${name}" says kind "${kindRaw}", which is not one of ${PATH_KINDS.join(', ')}; reading it as a walk`)

    const marks: PathMark[] = []
    for (const m of Array.isArray(e.marks) ? e.marks : []) {
      const o = m as Record<string, unknown>
      const at = num(o?.at)
      const mn = typeof o?.name === 'string' ? o.name : ''
      /* a mark outside the line is a mark that cannot fire, and it is silent
       * about it, so it is named here instead of at the moment it does not */
      if (at === null || !mn || at < 0 || at >= pts.length) {
        if (mn) console.warn(`[paths] ${mapId}: mark "${mn}" on "${name}" points at waypoint ${String(o?.at)} of ${pts.length}`)
        continue
      }
      marks.push({ at: Math.round(at), name: mn, ...(typeof o.label === 'string' && o.label ? { label: o.label } : {}) })
    }

    seen.add(name)
    out.push({
      name,
      kind,
      points: pts,
      closed: e.closed === true,
      twoWay: e.twoWay === true,
      ...(typeof e.facing === 'string' && e.facing ? { facing: e.facing } : {}),
      marks,
      ...(e.meta && typeof e.meta === 'object' ? { meta: e.meta as Record<string, unknown> } : {}),
    })
  }
  return out
}

/* ---- the questions a route is asked ---------------------------------------- */

/** the waypoints in travel order, reversed when a two-way route is run backwards
 *  and closed back onto its own first point when it is a patrol */
export function legsOf(p: Pathway, backwards = false): { x: number; y: number }[] {
  const pts = backwards ? [...p.points].reverse() : [...p.points]
  if (p.closed && pts.length > 2) pts.push({ ...pts[0] })
  return pts
}

/** how far the line runs, in painting pixels, so a caller can size a timeout off
 *  the route rather than off a constant that is wrong on the next map */
export function lengthOf(p: Pathway, backwards = false): number {
  const pts = legsOf(p, backwards)
  let d = 0
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return d
}

export const pathNames = (ps: Pathway[]): string[] => ps.map((p) => p.name).sort()

/* which points on a walk route are not standable, sampled along the line and not just at corners */
export function walkFaults(
  p: Pathway,
  standable: (x: number, y: number) => boolean,
  step = 6,
): { at: { x: number; y: number }; leg: number }[] {
  if (p.kind !== 'walk') return []
  const pts = legsOf(p)
  const bad: { at: { x: number; y: number }; leg: number }[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * (k / n)
      const y = a.y + (b.y - a.y) * (k / n)
      if (!standable(x, y)) { bad.push({ at: { x: Math.round(x), y: Math.round(y) }, leg: i }); break }
    }
  }
  return bad
}
