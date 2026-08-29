/* A WORLD-SPACE UI SITE, AND THE AREA IT MUST NOT COVER.
 *
 * AUTHORING §14's second bullet: "a named place in the room, with an extent,
 * where a diegetic panel or card draws, and the area it must not cover". 6.3 asks
 * for checks to surface as world objects rather than as a modal, and Q6.3.a is
 * the honest half of that: a panel that does not blur has to stay readable
 * against a painting nobody has painted yet.
 *
 * WHAT IS THERE TODAY, read at the point of contact rather than off a doc: the
 * one placed piece of world UI in the game is the station prompt, drawn at
 * `near.y - 6` with a sine wobble, an offset typed once and true for one map. A
 * site says where instead, and a keep-clear rect says what the panel is FOR, so
 * a card about a person cannot land on that person's face.
 *
 * THE SPLIT. MAPVIS authors WHERE, which is the site: a name, a rect and a
 * keep-clear rect, and the anchor kinds in `mask.ts` are already the shape it
 * would be published in. This file is the arithmetic the engine runs on it, so
 * it holds no map data and imports nothing. The scene wiring that reads a site
 * off a bundle is the stage's.
 */

export type Rect = { x: number; y: number; w: number; h: number }
export type Size = { w: number; h: number }

/** which way the content moves off the keep-clear area */
export type SiteSide = 'above' | 'below' | 'left' | 'right' | 'over'

export type WorldUiSite = {
  /** the author's name for it, the same identifier rules an anchor has */
  name: string
  /** where a panel may draw, in the map's own pixels */
  rect: Rect
  /** what it must not cover: the face, the sign, the thing the panel is about */
  keepClear?: Rect
  /** the order to try. The first that fits wins, so an author can say "above
   *  the head, and if there is no room, beside it". */
  prefer?: SiteSide[]
  /** breathing room between the content and the keep-clear edge */
  gap?: number
}

export type SitePlacement = {
  x: number
  y: number
  w: number
  h: number
  side: SiteSide
  /** the content had to be nudged to stay inside the view */
  clamped: boolean
  /** nothing fitted, so this is the least bad answer rather than a good one */
  fallback: boolean
}

const DEFAULT_ORDER: SiteSide[] = ['above', 'below', 'right', 'left', 'over']

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const inside = (a: Rect, b: Rect): boolean =>
  a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h

/** the middle of `outer` on one axis, so a card sits centred on what it is about */
const centre = (pos: number, span: number, over: number) => Math.round(pos + (span - over) / 2)

function candidate(site: WorldUiSite, content: Size, side: SiteSide): Rect {
  const clear = site.keepClear
  const gap = site.gap ?? 4
  if (!clear || side === 'over') {
    return {
      x: centre(site.rect.x, site.rect.w, content.w),
      y: centre(site.rect.y, site.rect.h, content.h),
      w: content.w, h: content.h,
    }
  }
  switch (side) {
    case 'above': return { x: centre(clear.x, clear.w, content.w), y: clear.y - gap - content.h, w: content.w, h: content.h }
    case 'below': return { x: centre(clear.x, clear.w, content.w), y: clear.y + clear.h + gap, w: content.w, h: content.h }
    case 'left': return { x: clear.x - gap - content.w, y: centre(clear.y, clear.h, content.h), w: content.w, h: content.h }
    default: return { x: clear.x + clear.w + gap, y: centre(clear.y, clear.h, content.h), w: content.w, h: content.h }
  }
}

const clampInto = (r: Rect, view: Rect): Rect => ({
  w: r.w, h: r.h,
  x: Math.round(Math.min(Math.max(r.x, view.x), Math.max(view.x, view.x + view.w - r.w))),
  y: Math.round(Math.min(Math.max(r.y, view.y), Math.max(view.y, view.y + view.h - r.h))),
})

/**
 * Where to draw `content` at `site`, given what the camera can currently see.
 *
 * The rules, in order, and each one is a defect it prevents:
 *  1. try the author's preferred sides and take the first that is inside the
 *     site, inside the view and clear of the keep-clear rect,
 *  2. if none is, take the first that is merely clear of the keep-clear rect and
 *     clamp it into the view, because a card half off the screen is still
 *     readable and a card on the face it is about is not,
 *  3. if the site itself is off screen entirely, say so with `fallback` and hand
 *     back a clamped position, so the caller can put the content in a panel
 *     instead of drawing it somewhere nobody is looking.
 */
export function placeAtSite(site: WorldUiSite, content: Size, view: Rect): SitePlacement {
  const order = site.prefer?.length ? site.prefer : DEFAULT_ORDER
  const clear = site.keepClear
  const siteVisible = overlaps(site.rect, view)

  const clean: { r: Rect; side: SiteSide }[] = []
  for (const side of order) {
    const r = candidate(site, content, side)
    /* `over` means "centred in the site, keep-clear ignored". It is last in the
     * default order and is never picked automatically while a keep-clear rect
     * exists, so the only way to land on the thing the panel is about is for an
     * author to ask for it by name. */
    if (clear && (side === 'over' || overlaps(r, clear))) continue
    clean.push({ r, side })
    if (inside(r, view) && inside(r, site.rect)) {
      return { ...r, side, clamped: false, fallback: !siteVisible }
    }
  }

  /* NOTHING FITTED WHOLE, so something gives, and what gives is never the
   * keep-clear promise. Clamping a candidate into the view can push it straight
   * back onto the thing it was avoiding: a card asked to sit above a face at the
   * top of the screen has nowhere to go, and sliding it down puts it on the
   * face. So every clean side is clamped and the first one that STILL misses is
   * the answer, which is how "above" becomes "below" on its own. */
  for (const c of clean) {
    const at = clampInto(c.r, view)
    if (clear && overlaps(at, clear)) continue
    return { ...at, side: c.side, clamped: at.x !== c.r.x || at.y !== c.r.y, fallback: !siteVisible }
  }

  const pick = clean[0] ?? { r: candidate(site, content, 'over'), side: 'over' as SiteSide }
  const at = clampInto(pick.r, view)
  return {
    ...at,
    side: pick.side,
    clamped: at.x !== pick.r.x || at.y !== pick.r.y,
    fallback: !siteVisible,
  }
}

/** an author's rect made safe: never zero-sized, always integral, so a site
 *  typed as a point still has an extent the arithmetic can use */
export const normaliseSite = (s: WorldUiSite): WorldUiSite => ({
  ...s,
  rect: { x: Math.round(s.rect.x), y: Math.round(s.rect.y), w: Math.max(1, Math.round(s.rect.w)), h: Math.max(1, Math.round(s.rect.h)) },
  keepClear: s.keepClear
    ? { x: Math.round(s.keepClear.x), y: Math.round(s.keepClear.y), w: Math.max(1, Math.round(s.keepClear.w)), h: Math.max(1, Math.round(s.keepClear.h)) }
    : undefined,
})
