/* A FRAMING: a named shot hung off an anchor.
 *
 * §80.4's third item and the brief's own words for the defect it removes:
 * *"hand-typed camera numbers are a defect from today."* `maw-founding` carries
 * `zoom: 1.35` in its source, which is a number somebody guessed at a keyboard
 * for one painting, and the moment that painting is replaced the shot is wrong
 * and nothing says so. A framing is the same shot AUTHORED WHERE THE THING IS,
 * so re-cutting a map moves its own close-up with it.
 *
 * BRIEF-MAPVIS-W2 ITEM 3 IS BUILDING THE AUTHORING FOR THIS: a named shot with
 * an offset, a zoom and a target, dragged until it looks right. This file is the
 * game's half of that contract and it does not wait for it: an anchor's `meta`
 * bag already survives export and already reaches the game (`anchors.ts:47`), so
 * a framing rides in the bag today and moves to its own field the day MAPVIS
 * emits one, with the reader unchanged.
 *
 * THE PRECEDENCE RULE, and it is the whole point: THE MAP WINS. A script may
 * type a zoom and an authored framing overrides it, because the person who cut
 * the map is the person who knows how far out it reads and the person who wrote
 * the script is usually not. A script that types a number over a framing is told
 * so once, by name, rather than silently losing.
 */

export type Framing = {
  /** how far in, as a multiple of the map's own load-time scale */
  zoom?: number
  /* WHERE THE SHOT SITS RELATIVE TO THE ANCHOR, in painting pixels. §80.4's
   * stadium asks for "the camera behind him rather than centred on him", which
   * `look_at` cannot express because it is a hold at an x and a y with no
   * offset. This is the offset. */
  dx?: number
  dy?: number
  /** what a person called it, for a log line and for a MAPVIS round trip */
  name?: string
}

/* what an anchor's meta bag may carry. Two shapes on purpose: one unnamed
 * framing is the ordinary case (a post has a close-up), and a named set is the
 * case a panel needs (the same anchor read three ways). */
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
  /* A FRAMING THAT SAYS NOTHING IS NOT A FRAMING. An empty bag would otherwise
   * override a script's own zoom with `undefined` and pull every shot back to
   * the map's load scale, which is worse than the hand-typed number it replaced. */
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
    /* a named framing the anchor does not carry falls through to its default
     * rather than to nothing, because a shot that half-happens is worse than a
     * shot that is the author's own wide one */
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

/* THE SHOT, RESOLVED. Given where the anchor is and what the map's own scale is,
 * this is the x, y and zoom `cameraSet` takes, and it is the one place the
 * offset is applied so a framing means the same thing to a cutscene, a panel
 * cover and an arrival. */
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

/* ---- THE OTHER SHAPE THE SAME FRAMINGS ARRIVE IN ---------------------------
 *
 * MAPVIS publishes named shots into the anchor `meta` bag, which is what this
 * file reads and what the handoff says explicitly not to "fix" by moving to a
 * top-level array. But the shots MAPVIS published BEFORE it moved are top-level
 * arrays, and one of them is on the live platform right now: `hub` at v13 carries
 * `framings: [{name: "the_maw_mouth", anchor: "panthers_maw", dx, dy, zoom}]` and
 * an anchor whose meta holds nothing but `{docId, derived}`.
 *
 * So the reader takes both and folds one into the other at load. The game's
 * running shape stays the meta bag, exactly as the contract law says, and a map
 * nobody is going to republish still answers `framing("the_maw_mouth")`. The day
 * every bundle carries the meta form this function finds nothing and costs a loop
 * over an empty array.
 */
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
    if (!name || !f) continue
    const a = by.get(on)
    /* AN ANCHOR THIS MAP DOES NOT HAVE IS THE MISTAKE THAT WILL ACTUALLY HAPPEN,
     * because a shot survives the anchor it was hung off being renamed or cut.
     * Named at load with the map it came from, rather than discovered as a shot
     * that quietly never fires. */
    if (!a) {
      console.warn(`[framings] ${mapId}: shot "${name}" hangs off anchor "${on || '(none)'}", which is not on this map`)
      continue
    }
    const meta = (a.meta ??= {})
    const set = (meta.framings && typeof meta.framings === 'object'
      ? meta.framings
      : (meta.framings = {})) as Record<string, unknown>
    /* the meta bag wins. It is the newer shape and the one MAPVIS writes now, so
     * a bundle carrying both is a bundle mid-migration and the projection must
     * not overwrite the half that is already right. */
    if (set[name] === undefined) { set[name] = f; folded++ }
    /* a shot marked `entry` is what the map opens on, which is the unnamed
     * default `look_at` and an arrival both read */
    if (r.entry === true && meta.framing === undefined) meta.framing = f
  }
  return folded
}

/** a named shot and the anchor it is a shot of. Generic in the anchor so the
 *  caller gets its own full record back rather than the two fields this file
 *  needs, which is what stops a cast at every call site. */
export type NamedShot<T extends HasMeta = HasMeta> = { name: string; anchor: T; framing: Framing }

/* EVERY NAMED SHOT ON THIS MAP, INDEXED BY THE NAME A PERSON TYPED. A framing is
 * authored against an anchor, but nobody writing a scene thinks "the second
 * framing on the door"; they think "the maw mouth". Names are validated unique
 * per map where they are typed, so one flat index is the honest lookup, and a
 * collision keeps the first and says which anchor lost. */
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
