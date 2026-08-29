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
