/* a framing: a named camera shot authored on the map, hung off an anchor */

export type Framing = {
  /** how far in, as a multiple of the map's own load-time scale */
  zoom?: number
  /* where the shot sits relative to the anchor, in painting pixels */
  dx?: number
  dy?: number
  /** what a person called it, for a log line and for a MAPVIS round trip */
  name?: string
}

/* what an anchor's meta bag may carry: one unnamed framing for the ordinary case, and a named set for the case where the same anchor is read several ways */
type MetaBag = Record<string, unknown> | undefined

const numOr = (v: unknown, fallback?: number): number | undefined => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const readOne = (raw: unknown, name?: string): Framing | null => {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const f: Framing = {
    zoom: numOr(o.zoom),
    dx: numOr(o.dx, 0),
    dy: numOr(o.dy, 0),
    ...(name ? { name } : typeof o.name === 'string' ? { name: o.name } : {}),
  }
  /* a framing that says nothing is not a framing, because an empty bag would override a script's own zoom with `undefined` and pull every shot back to the map's load scale */
  if (f.zoom === undefined && !f.dx && !f.dy) return null
  return f
}

/** the framing an anchor carries, by name when a name is asked for */
export function framingOf(meta: MetaBag, name?: string): Framing | null {
  if (!meta) return null
  if (name) {
    const set = meta.framings
    if (set && typeof set === 'object') {
      const hit = (set as Record<string, unknown>)[name]
      const f = readOne(hit, name)
      if (f) return f
    }
    /* a named framing the anchor does not carry falls through to its default rather than to nothing, because a shot that half-happens is worse than the author's own wide one */
  }
  return readOne(meta.framing)
}

/** every framing an anchor carries, for a refusal that can list them */
export function framingNames(meta: MetaBag): string[] {
  if (!meta) return []
  const out: string[] = []
  if (readOne(meta.framing)) out.push('(default)')
  const set = meta.framings
  if (set && typeof set === 'object') out.push(...Object.keys(set as object))
  return out
}

/* the shot resolved into the x, y and zoom the camera takes */
export function shotOf(
  at: { x: number; y: number },
  f: Framing | null,
  fallbackZoom = 1,
): { x: number; y: number; zoom: number } {
  return {
    x: at.x + (f?.dx ?? 0),
    y: at.y + (f?.dy ?? 0),
    zoom: f?.zoom ?? fallbackZoom,
  }
}

/* the older top-level shot list, folded into the meta bag at load */
type HasMeta = { name: string; meta?: Record<string, unknown> }

export function projectFramings(anchors: HasMeta[], raw: unknown, mapId = ''): number {
  if (!Array.isArray(raw) || !raw.length) return 0
  const by = new Map(anchors.map((a) => [a.name, a]))
  let folded = 0
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue
    const name = typeof r.name === 'string' ? r.name : ''
    const on = typeof r.anchor === 'string' ? r.anchor : ''
    const f = readOne(r, name || undefined)
    if (!name) continue
    /* a named shot with no zoom and no offset is dropped, and says so */
    if (!f) {
      console.warn(`[framings] ${mapId}: shot "${name}" carries no zoom and no offset, so there is nothing to frame`)
      continue
    }
    const a = by.get(on)
    /* a shot hung off an anchor this map does not have is named at load */
    if (!a) {
      console.warn(`[framings] ${mapId}: shot "${name}" hangs off anchor "${on || '(none)'}", which is not on this map`)
      continue
    }
    const meta = (a.meta ??= {})
    const set = (meta.framings && typeof meta.framings === 'object'
      ? meta.framings
      : (meta.framings = {})) as Record<string, unknown>
    /* the meta bag wins, being the newer shape MAPVIS writes now, so a bundle carrying both is mid-migration and the projection must not overwrite the half that is already right */
    const had = set[name] === undefined ? null : readOne(set[name], name)
    if (!had) { set[name] = f; folded++ }
    /* a shot marked entry is what the map opens on, using whichever copy won above */
    if (r.entry === true && meta.framing === undefined) meta.framing = had ?? f
  }
  return folded
}

/** a named shot and the anchor it is a shot of, generic in the anchor so the caller gets its own full record back instead of casting at every call site */
export type NamedShot<T extends HasMeta = HasMeta> = { name: string; anchor: T; framing: Framing }

/* every named shot on this map, indexed by the name a person typed */
export function shotsOf<T extends HasMeta>(anchors: readonly T[]): Map<string, NamedShot<T>> {
  const out = new Map<string, NamedShot<T>>()
  for (const a of anchors) {
    const set = a.meta?.framings
    if (!set || typeof set !== 'object') continue
    for (const [name, raw] of Object.entries(set as Record<string, unknown>)) {
      const f = readOne(raw, name)
      if (!f) continue
      const had = out.get(name)
      if (had) {
        console.warn(`[framings] two anchors carry a shot called "${name}" (${had.anchor.name} and ${a.name}), keeping the first`)
        continue
      }
      out.set(name, { name, anchor: a, framing: f })
    }
  }
  return out
}
