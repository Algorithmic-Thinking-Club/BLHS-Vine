/* PLAYER TEXT COMPOSITED INTO WORLD ART.
 *
 * I9, load-bearing at five moments, and AUTHORING §14's first bullet: "where
 * player-supplied or run-supplied text lands on a piece of art, at what size and
 * orientation, with a baseline and an alignment". It is the only capability in
 * the kit that is not a panel, and §80.5 states the cost of not having it
 * plainly: without it the game's text cannot be in the world, so everything the
 * world would have said gets said in a box.
 *
 * THE PRECEDENT IS ALREADY IN THE REPO and it is why this file exists as a kit
 * capability rather than a second copy of it. `BeachIso.tsx:688` builds a wood
 * chip out of `document.createElement('canvas')`, measures the label, draws a
 * keycap and a name, caches by string and hands the result to `Texture.from`.
 * `showBoatName` at :1039 hangs the player's own boat name over the berth with
 * it, and the comment there says out loud what this file fixes: "the painted
 * stern text is a later art pass". That chip is beach-shaped, lives inside a
 * 1500-line scene, knows the beach's palette and cannot be reached from any
 * other map, so the signpost, the dock crest, the trophy plaque, the room number
 * and the scoreboard would each have grown their own.
 *
 * WHAT IS ART AND WHAT IS TEXT. All art comes from PixelLab and nothing here
 * draws any. This composites a STRING, in a font, onto a transparent canvas, so
 * a painted signpost keeps being a painted signpost and stops needing one
 * painting per island, which is the twenty-dialects failure AUTHORING §14 names.
 * The sign is art. The name on it is what a student typed.
 *
 * THE LAYOUT IS PURE AND THE PAINTING IS NOT, deliberately. `layoutWorldText`
 * takes a measuring function and returns numbers, so what a slot does with a
 * fourteen-year-old's twenty-two character boat name is testable without a
 * canvas at all. `composeWorldText` is the half that needs a 2D context, and it
 * says so when it cannot get one instead of returning a blank texture.
 */

export type WorldTextAlign = 'left' | 'center' | 'right'
export type WorldTextBaseline = 'top' | 'middle' | 'bottom'

export type WorldTextStyle = {
  /** a CSS font family list. The game faces are 'Harbormaster' and 'Deckhand'. */
  face: string
  /** cap height in ART pixels, not screen pixels: this is composited at map scale
   *  and scaled by the same camera as the painting it sits on */
  size: number
  weight?: 'normal' | 'bold'
  /** the colour of the text itself */
  ink: string
  /** a carved edge under the ink, because most of these sit on painted wood */
  shadow?: { color: string; dx: number; dy: number }
  align?: WorldTextAlign
  baseline?: WorldTextBaseline
  /** the width of the slot on the art. Text wraps to it, then truncates. */
  maxWidth?: number
  /** how many lines the slot has room for */
  maxLines?: number
  /** multiple of `size` */
  lineHeight?: number
  letterSpacing?: number
  /** transparent margin around the composed text, so a rotated chip is not clipped */
  padding?: number
  /** the tilt of the slot on the art, in degrees. A stern is not level. */
  rotate?: number
  upper?: boolean
  ellipsis?: string
  /** what a character is worth when there is no canvas to measure with. Only
   *  used headless; a real browser measures. */
  charWidth?: number
}

export type WorldTextLayout = {
  lines: string[]
  /** the tightest box the glyphs fit in, before padding and rotation */
  textWidth: number
  textHeight: number
  /** the canvas this needs, padding and rotation included */
  width: number
  height: number
  lineHeight: number
  truncated: boolean
  /** true when nothing measured the glyphs and the numbers are an estimate */
  estimated: boolean
}

export type WorldTextImage = WorldTextLayout & {
  canvas: HTMLCanvasElement
}

const DEFAULTS = {
  weight: 'normal' as const,
  align: 'center' as WorldTextAlign,
  baseline: 'middle' as WorldTextBaseline,
  lineHeight: 1.25,
  letterSpacing: 0,
  padding: 2,
  rotate: 0,
  ellipsis: '…',
}

/** the CSS font shorthand a measurer and a painter must agree on exactly */
export const fontOf = (s: WorldTextStyle): string =>
  `${s.weight ?? DEFAULTS.weight} ${Math.max(1, Math.round(s.size))}px ${s.face}`

/* A MONOSPACE GUESS IS A GUESS AND IT SAYS SO. happy-dom returns null from
 * getContext('2d'), so a test and a worker have no glyphs to measure. The
 * estimate is per-face rather than one number because 0.6em is right for the
 * monospace fallback and far too wide for a proportional face, and a slot sized
 * off a bad estimate is a name that runs off the stern. */
export function estimatedCharWidth(style: WorldTextStyle): number {
  if (style.charWidth !== undefined) return style.charWidth
  return /mono|Deckhand|Harbormaster/i.test(style.face) ? 0.6 : 0.52
}

/** a measurer built from a real 2D context, or null when there is none */
export function canvasMeasurer(style: WorldTextStyle): ((s: string) => number) | null {
  if (typeof document === 'undefined') return null
  const g = document.createElement('canvas').getContext('2d')
  if (!g) return null
  g.font = fontOf(style)
  const spacing = style.letterSpacing ?? DEFAULTS.letterSpacing
  return (s: string) => g.measureText(s).width + spacing * Math.max(0, s.length - 1)
}

export function estimateMeasurer(style: WorldTextStyle): (s: string) => number {
  const per = estimatedCharWidth(style) * style.size
  const spacing = style.letterSpacing ?? DEFAULTS.letterSpacing
  return (s: string) => s.length * per + spacing * Math.max(0, s.length - 1)
}

/** the box a rotated rectangle needs. A stern name at eleven degrees is wider
 *  than the text, and a canvas cut to the text clips the corners off it. */
export function rotatedBounds(w: number, h: number, deg: number): { width: number; height: number } {
  if (!deg) return { width: w, height: h }
  const r = (deg * Math.PI) / 180
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  /* the epsilon is not fussiness: cos(90°) is 6.1e-17 rather than 0, so a
   * quarter turn of a 10x4 box came out 5 wide instead of 4 and every rotated
   * slot carried a stray transparent column */
  const up = (v: number) => Math.ceil(v - 1e-9)
  return { width: up(w * c + h * s), height: up(w * s + h * c) }
}

/* ---- wrapping ---------------------------------------------------------- */

function breakLongWord(word: string, max: number, measure: (s: string) => number): string[] {
  const out: string[] = []
  let cur = ''
  for (const ch of word) {
    if (cur && measure(cur + ch) > max) { out.push(cur); cur = ch }
    else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

function wrap(text: string, max: number, measure: (s: string) => number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word
      if (line && measure(tryLine) <= max) { line = tryLine; continue }
      if (line) { out.push(line); line = '' }
      /* a single word wider than the whole slot is broken rather than allowed to
       * run off the art, which is what a handle nobody put a space in would do */
      if (measure(word) > max) {
        const parts = breakLongWord(word, max, measure)
        out.push(...parts.slice(0, -1))
        line = parts[parts.length - 1] ?? ''
      } else line = word
    }
    out.push(line)
  }
  return out.length ? out : ['']
}

function clip(line: string, max: number, ellipsis: string, measure: (s: string) => number): string {
  if (measure(line) <= max) return line
  let cut = line
  while (cut.length > 0 && measure(cut + ellipsis) > max) cut = cut.slice(0, -1)
  return cut.replace(/\s+$/, '') + ellipsis
}

/** the whole of the geometry, with no canvas anywhere near it */
export function layoutWorldText(
  text: string,
  style: WorldTextStyle,
  measure: (s: string) => number,
  estimated = false,
): WorldTextLayout {
  const src = (style.upper ? text.toUpperCase() : text).trim()
  const maxLines = Math.max(1, style.maxLines ?? 1)
  const ellipsis = style.ellipsis ?? DEFAULTS.ellipsis
  const lineHeight = Math.round(style.size * (style.lineHeight ?? DEFAULTS.lineHeight))
  const padding = style.padding ?? DEFAULTS.padding

  let lines = style.maxWidth ? wrap(src, style.maxWidth, measure) : src.split('\n')
  let truncated = false
  if (lines.length > maxLines) {
    truncated = true
    const kept = lines.slice(0, maxLines)
    const last = kept[maxLines - 1]
    /* what did not fit rejoins the last line so the ellipsis lands where the
     * reading stopped, rather than at the end of a line that fitted */
    const rest = lines.slice(maxLines).join(' ')
    kept[maxLines - 1] = style.maxWidth ? clip(`${last} ${rest}`, style.maxWidth, ellipsis, measure) : `${last}${ellipsis}`
    lines = kept
  } else if (style.maxWidth) {
    lines = lines.map((l) => {
      const c = clip(l, style.maxWidth!, ellipsis, measure)
      if (c !== l) truncated = true
      return c
    })
  }

  const textWidth = Math.ceil(Math.max(0, ...lines.map(measure)))
  const textHeight = lineHeight * lines.length
  const box = rotatedBounds(textWidth + padding * 2, textHeight + padding * 2, style.rotate ?? DEFAULTS.rotate)
  return {
    lines,
    textWidth,
    textHeight,
    /* BOTH SIDES EVEN. The same law the generator canvases live under: an odd
     * side on a pixel-art texture puts the whole thing on a half pixel and the
     * nearest-neighbour scale smears one column of every glyph. */
    width: Math.max(2, box.width + (box.width % 2)),
    height: Math.max(2, box.height + (box.height % 2)),
    lineHeight,
    truncated,
    estimated,
  }
}

/** layout with whatever measurer this environment can give, real one first */
export function measureWorldText(text: string, style: WorldTextStyle): WorldTextLayout {
  const real = canvasMeasurer(style)
  return real
    ? layoutWorldText(text, style, real, false)
    : layoutWorldText(text, style, estimateMeasurer(style), true)
}

/* ---- the painted half -------------------------------------------------- */

/* Cached by every input that changes the picture. `showBoatName` composes the
 * same chip on every frame it is asked for, and a name that has not changed
 * should not repaint: this is the beach's `chipCache` made general. */
const cache = new Map<string, WorldTextImage>()
const keyOf = (text: string, s: WorldTextStyle) => `${text}|${JSON.stringify(s)}`

/**
 * Compose `text` onto a transparent canvas a Pixi scene can hand to
 * `Texture.from`. Returns null when this environment has no 2D context, which is
 * an honest refusal rather than a blank texture the caller draws anyway.
 */
export function composeWorldText(text: string, style: WorldTextStyle): WorldTextImage | null {
  if (typeof document === 'undefined') return null
  const key = keyOf(text, style)
  const hit = cache.get(key)
  if (hit) return hit

  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) {
    console.warn('[worldText] no 2D context, so no world text was composed for', JSON.stringify(text))
    return null
  }
  probe.font = fontOf(style)
  const spacing = style.letterSpacing ?? DEFAULTS.letterSpacing
  const measure = (s: string) => probe.measureText(s).width + spacing * Math.max(0, s.length - 1)
  const layout = layoutWorldText(text, style, measure, false)

  const cv = document.createElement('canvas')
  cv.width = layout.width
  cv.height = layout.height
  const g = cv.getContext('2d')
  if (!g) return null

  g.font = fontOf(style)
  g.textAlign = style.align ?? DEFAULTS.align
  g.textBaseline = 'middle'

  const rot = style.rotate ?? DEFAULTS.rotate
  g.translate(cv.width / 2, cv.height / 2)
  if (rot) g.rotate((rot * Math.PI) / 180)

  const align = style.align ?? DEFAULTS.align
  const x = align === 'left' ? -layout.textWidth / 2 : align === 'right' ? layout.textWidth / 2 : 0
  const top = -layout.textHeight / 2 + layout.lineHeight / 2

  layout.lines.forEach((line, i) => {
    const y = top + i * layout.lineHeight
    if (style.shadow) {
      g.fillStyle = style.shadow.color
      drawLine(g, line, x + style.shadow.dx, y + style.shadow.dy, spacing, align)
    }
    g.fillStyle = style.ink
    drawLine(g, line, x, y, spacing, align)
  })

  const out: WorldTextImage = { ...layout, canvas: cv }
  cache.set(key, out)
  return out
}

/* letter spacing by hand, because `ctx.letterSpacing` is Chromium-only and this
 * has to draw the same on the machine a member develops on */
function drawLine(g: CanvasRenderingContext2D, line: string, x: number, y: number, spacing: number, align: WorldTextAlign) {
  if (!spacing) { g.fillText(line, x, y); return }
  const prev = g.textAlign
  const total = g.measureText(line).width + spacing * Math.max(0, line.length - 1)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  g.textAlign = 'left'
  for (const ch of line) {
    g.fillText(ch, cx, y)
    cx += g.measureText(ch).width + spacing
  }
  g.textAlign = prev
}

/** for a scene that has rebuilt its art and wants the strings composed again */
export const clearWorldTextCache = (): void => { cache.clear() }

/* ---- THE SIX SLOTS §14 NAMES ------------------------------------------
 *
 * Presets rather than six functions: a slot is a style, and an author who needs
 * a seventh writes one object instead of a seventh code path. Sizes are in art
 * pixels against the 18px-tall person `map.json` calls a character, so a room
 * number reads at the same distance a doorway does.
 */
export const WORLD_TEXT: Record<
  'sternName' | 'signpost' | 'dockCrest' | 'trophyPlaque' | 'roomNumber' | 'scoreboard',
  WorldTextStyle
> = {
  /* the boat's name on the stern. 2.11 calls this "the first time the game
   * proves it is listening", and the hull is not level, so it tilts. */
  sternName: {
    face: "'Harbormaster', 'Deckhand', monospace", size: 9, ink: '#f0e4c8',
    shadow: { color: 'rgba(30,16,6,0.75)', dx: 0, dy: 1 },
    align: 'center', maxWidth: 62, maxLines: 1, rotate: -6, padding: 3, letterSpacing: 0.5,
  },
  /* the island's name on a signpost, read from the deck: two short lines rather
   * than one long one, because a sign is taller than it is wide */
  signpost: {
    face: "'Harbormaster', 'Deckhand', monospace", size: 8, ink: '#3b2a1a',
    shadow: { color: 'rgba(255,250,235,0.35)', dx: 0, dy: -1 },
    align: 'center', maxWidth: 56, maxLines: 2, lineHeight: 1.15, upper: true, padding: 2,
  },
  /* a crest on a dock is a short word carved big */
  dockCrest: {
    face: "'Harbormaster', monospace", size: 12, ink: '#e8dcc0',
    shadow: { color: 'rgba(26,16,6,0.9)', dx: 0, dy: 1 },
    align: 'center', maxWidth: 70, maxLines: 1, upper: true, letterSpacing: 1, padding: 3,
  },
  /* a trophy plaque holds a name and a year, so it gets two lines and a small face */
  trophyPlaque: {
    face: "'Deckhand', monospace", size: 6, ink: '#2b1a0c',
    align: 'center', maxWidth: 44, maxLines: 2, lineHeight: 1.2, padding: 2,
  },
  /* a room number is three or four characters and must never wrap */
  roomNumber: {
    face: "'Deckhand', monospace", size: 7, ink: '#f4f1ea',
    shadow: { color: 'rgba(0,0,0,0.6)', dx: 0, dy: 1 },
    align: 'center', maxWidth: 26, maxLines: 1, padding: 1, weight: 'bold',
  },
  /* the stadium's scoreboard: the number is the whole point, so it is the
   * largest thing in this table and it never wraps or truncates */
  scoreboard: {
    face: "'Harbormaster', monospace", size: 16, ink: '#ffd98a',
    shadow: { color: 'rgba(0,0,0,0.75)', dx: 0, dy: 1 },
    align: 'center', maxWidth: 96, maxLines: 1, letterSpacing: 2, padding: 3, weight: 'bold',
  },
}
