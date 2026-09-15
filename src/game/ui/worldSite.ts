// works out where a card or panel drawn in the world should sit, and what it must not cover

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
  /** the order to try, first that fits wins, so an author can say 'above the head, and if there is no room, beside it' */
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

/** where to draw content at a site, given what the camera can currently see */
export function placeAtSite(site: WorldUiSite, content: Size, view: Rect): SitePlacement {
  const order = site.prefer?.length ? site.prefer : DEFAULT_ORDER
  const clear = site.keepClear
  const siteVisible = overlaps(site.rect, view)

  const clean: { r: Rect; side: SiteSide }[] = []
  for (const side of order) {
    const r = candidate(site, content, side)
    // `over` ignores the keep-clear area, so it is only ever used when an author asks for it
    if (clear && (side === 'over' || overlaps(r, clear))) continue
    clean.push({ r, side })
    if (inside(r, view) && inside(r, site.rect)) {
      return { ...r, side, clamped: false, fallback: !siteVisible }
    }
  }

  // nothing fitted whole, so slide sides into view and take the first that still misses the face
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

/** an author's rect made safe: never zero-sized, always integral, so a site typed as a point still has an extent the arithmetic can use */
export const normaliseSite = (s: WorldUiSite): WorldUiSite => ({
  ...s,
  rect: { x: Math.round(s.rect.x), y: Math.round(s.rect.y), w: Math.max(1, Math.round(s.rect.w)), h: Math.max(1, Math.round(s.rect.h)) },
  keepClear: s.keepClear
    ? { x: Math.round(s.keepClear.x), y: Math.round(s.keepClear.y), w: Math.max(1, Math.round(s.keepClear.w)), h: Math.max(1, Math.round(s.keepClear.h)) }
    : undefined,
})
