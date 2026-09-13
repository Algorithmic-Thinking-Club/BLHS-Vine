/* the ui kit the platform publishes, and the one place the game reads it */

/* the record as it comes off the wire, with everything optional the platform may leave out */

/** the four insets, in SOURCE pixels, which is the unit `border-image-slice`
 *  means without a percent sign and the unit Pixi's NineSliceSprite takes */
export type KitSlice = { top: number; right: number; bottom: number; left: number }

/** the six kinds `docs/UI-KIT.md` section 2 settled on. The word is `region` and
 *  never `slot`: a slot is an island's berth on the sea in
 *  `src/game/world/composition.ts` and about thirty call sites say so. */
export type KitRegionKind = 'text' | 'number' | 'picture' | 'fill' | 'face' | 'press'

/** a named rectangle on a piece that the engine puts something into, in the
 *  piece's own source pixels */
export type KitRegion = {
  name: string
  kind: KitRegionKind
  x: number; y: number; w: number; h: number
  /** a text region's wrap rule */
  wrap?: string
  /** what a text region does when it does not fit: grow, clip, ellipsis */
  overflow?: string
  /** how a picture sits in its aperture */
  fit?: string
  /* REQUIRED ON A PICTURE AND NOT DEFAULTED, because the shipped portrait is
   * bottom-anchored (`ui-kit.css:59-68`) and a region that centres its content
   * puts every character floating off the bottom of their own box. */
  valign?: string
  /** a fill's direction */
  axis?: string
  /** whether a fill tiles or scales: a rope that stretches is a smear */
  mode?: string
}

/** a cut rectangle on a sheet. It exists because of the 192 pixel floor: a
 *  family of small marks is drawn in one job so the faces come back the same
 *  weight, and this is how one of them is addressed afterwards. */
export type KitFace = { name: string; x: number; y: number; w: number; h: number }

export type KitPiece = {
  /** the platform's own name for the piece, which is NOT always the game's handle */
  name: string
  type: string
  title?: string
  description?: string
  /** the file's own pixel size on disk, so a consumer can check the slices fit */
  w: number
  h: number
  status?: string
  core?: boolean
  published?: boolean
  regions?: KitRegion[]
  faces?: KitFace[]
  /* MUST BE TRUE FOR EVERY PAPER PANEL. `border-image` defaults fill off, and a
   * panel without it renders as a ring around a hole. `highlight_edge` is the
   * one piece in the set that wants it false, because it is drawn as a ring. */
  fill?: boolean
  /** CSS pixels per source pixel, so the draw thickness is not guessed */
  scale?: number
  slice?: KitSlice
  /** horizontal and vertical, from stretch | repeat | round | space. Pixel art
   *  wants round and never stretch. */
  repeat?: { x: string; y: string }
  /** the ready-made block, carrying the GAME's handle rather than the name */
  css?: string
  /** the image route, relative to the platform host */
  src?: string
  /** the full content hash, which is what `?v=` carries */
  sha?: string
  crop?: unknown
  createdAt?: number
}

/* one fetch, cached, and it never throws, so a filtered chromebook still gets a game */
let cached: KitPiece[] | null = null
let inflight: Promise<KitPiece[]> | null = null

/** the platform origin, computed exactly the way `PmapScene.tsx:539` computes it
 *  for maps, so the game never learns two different answers to where MAPVIS is.
 *  An empty string means there is no platform and nothing is fetched. */
export const mapvisHost = (): string =>
  (import.meta.env?.VITE_MAPVIS_URL || '').replace(/\/+$/, '')

export function kitCached(): KitPiece[] | null { return cached }

/* a counter bumped when the kit lands, so anything that drew the fallback can redraw */
let generation = 0
const landed = new Set<() => void>()

/** bumped each time the kit changes, so a hook can use it as its state */
export const kitGeneration = (): number => generation

/** told once when the kit arrives (or is swapped in a test). Returns the unsubscribe. */
export function onKitLanded(cb: () => void): () => void {
  landed.add(cb)
  return () => { landed.delete(cb) }
}

function announceKit(): void {
  generation++
  for (const cb of [...landed]) { try { cb() } catch { /* a bad listener is not the kit's problem */ } }
}

/** for tests and for the proof harness: install a kit without a fetch */
export function setKit(pieces: KitPiece[]) { cached = pieces; inflight = null; announceKit() }

/* where the pieces in use were loaded from: '' for the vendored copy on the game's own origin */
let kitHost = ''
export const kitHostInUse = (): string => kitHost

/* the vendored kit first, so a student's browser never asks the platform; the platform only with ?kit=platform */
const wantPlatformKit = (): boolean =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('kit') === 'platform'

export async function loadKit(host = mapvisHost()): Promise<KitPiece[]> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = (async () => {
    if (!wantPlatformKit()) {
      try {
        const r = await fetch('/ui-vendored/kit.json')
        if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
          const j = (await r.json()) as { ui?: unknown }
          if (Array.isArray(j?.ui)) {
            cached = j.ui as KitPiece[]
            kitHost = ''
            warmPieces(cached, '')
            return cached
          }
        }
      } catch { /* not vendored: the platform below, if the page allows it */ }
      cached = []
      return cached
    }
    /* NO HOST IS NOT A FAILURE, it is a build with no platform configured, and it
     * must not cost a fetch, a warning or a timeout. */
    if (!host) { cached = []; return cached }
    kitHost = host
    try {
      const r = await fetch(`${host}/api/v1/ui`)
      /* the content-type guard is `PmapScene`'s: a dev server answers a missing
       * file with index.html at 200, so `r.ok` alone lets HTML through as JSON */
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
        const j = (await r.json()) as { ui?: unknown }
        if (Array.isArray(j?.ui)) {
          cached = j.ui as KitPiece[]
          warmPieces(cached, host)
          return cached
        }
      }
    } catch { /* the shipped art is the fallback, and it is the point */ }
    cached = []
    return cached
  })()
  return inflight
}

/* pulls every piece image at start-up so the bytes are cached before css paints with them */
function warmPieces(pieces: KitPiece[], at: string): void {
  if (typeof Image === 'undefined') return
  for (const p of pieces) {
    const url = kitArtUrl(p, at)
    if (!url) continue
    const img = new Image()
    /* a failed warm is not an error: the piece may be unpublished, the network
     * may be filtered, and both of those already have an answer above */
    img.onerror = () => {}
    img.src = url
  }
}

/* what makes a piece usable, and the reason one bad piece is dropped by name on its own */
export type KitFault = { key: string; why: string }

/* a piece is a stretchable surface, a sheet of art, or refused */
type KitKind = 'surface' | 'art'
type Verdict = { ok: true; handle: string; kind: KitKind } | { ok: false; why: string }

/** the handle the game mounts, read out of the css mapvis wrote for the piece */
export const kitHandle = (p: KitPiece): string =>
  p.css?.match(/\.kit-surface-([A-Za-z0-9_-]+)/)?.[1] ?? p.name

const sliceFits = (s: KitSlice, w: number, h: number): boolean =>
  [s.top, s.right, s.bottom, s.left].every((n) => Number.isFinite(n) && n >= 0)
  && s.top + s.bottom < h && s.left + s.right < w

function classify(p: KitPiece): Verdict {
  const handle = kitHandle(p)
  if (p.slice) {
    if (!(p.w > 0 && p.h > 0))
      return { ok: false, why: `carries a slice and no size, so nothing can check it fits` }
    if (!sliceFits(p.slice, p.w, p.h)) {
      const s = p.slice
      return {
        ok: false,
        why: `slice ${s.top}/${s.right}/${s.bottom}/${s.left} does not fit inside ${p.w}x${p.h}`
          + ` (${s.top}+${s.bottom} must be under ${p.h}, ${s.left}+${s.right} under ${p.w}),`
          + ` so CSS would drop the border image with no error`,
      }
    }
    return { ok: true, handle, kind: 'surface' }
  }
  /* NO SLICE AND NO CSS IS FINE IF IT IS A SHEET OR A PAINTING, and it is not
   * fine if the piece carries nothing at all. `src` is what separates them: a
   * row with no image is a row that was never generated. */
  if (p.css) return { ok: true, handle, kind: 'surface' }
  if (p.src && ((p.faces?.length ?? 0) > 0 || (p.regions?.length ?? 0) > 0))
    return { ok: true, handle, kind: 'art' }
  return { ok: false, why: 'has no css, no slice and no cut faces, so there is nothing to mount' }
}

/** every piece the kit cannot honestly mount, with the reason a person can act
 *  on. Pure, so the refusal is testable without a document in it. */
export const kitFaults = (pieces: KitPiece[]): KitFault[] =>
  pieces.map((p) => ({ p, v: classify(p) }))
    .filter((x): x is { p: KitPiece; v: { ok: false; why: string } } => !x.v.ok)
    .map(({ p, v }) => ({ key: p.name, why: v.why }))

/* turning the record into one stylesheet of art tokens and border-image blocks */

/** the image url, absolute against the platform and carrying the FULL sha */
export const kitArtUrl = (p: KitPiece, host: string): string | null => {
  if (!p.src) return null
  const path = p.src.split('?')[0]
  const v = p.sha ? `?v=${encodeURIComponent(p.sha)}` : ''
  return `${host}${path}${v}`
}

/* swaps the platform's relative url in a published block for the absolute one */
const absolutise = (css: string, url: string): string =>
  css.replace(/url\(\s*(['"]?)(\/[^'")]*)\1\s*\)/g, `url('${url}')`)

/** the whole stylesheet, pure and exported so a test can read it without a DOM */
/* the handles whose art is a SHAPE rather than a frame: the picture is welcome,
 * the nine-slice is not. See the note in kitCss for the arithmetic. */
const SHAPES = new Set(['plank'])

/* handles whose picture stays the local committed art and never comes off the platform */
const LOCAL_ART = new Set(['plank'])

export function kitCss(pieces: KitPiece[], host = kitHost): string {
  const tokens: string[] = []
  const blocks: string[] = []
  for (const p of pieces) {
    const v = classify(p)
    if (!v.ok) continue
    const url = kitArtUrl(p, host)
    /* LOCAL_ART wins outright: no token, no block, so `:root` in tokens.css is
     * the only thing that ever answers for this handle. */
    if (LOCAL_ART.has(v.handle)) continue
    if (url) tokens.push(`  --kit-art-${v.handle}: url('${url}');`)
    if (v.kind !== 'surface') continue
    /* a plank is a shape and not a frame, so its art comes down and its nine-slice does not */
    if (SHAPES.has(v.handle)) continue
    if (p.css) { blocks.push(url ? absolutise(p.css, url) : p.css); continue }
    /* the only block written here rather than read, for a piece with a slice and no css */
    const s = p.slice!
    const sc = p.scale && p.scale > 0 ? p.scale : 1
    const rep = `${p.repeat?.x ?? 'round'} ${p.repeat?.y ?? 'round'}`
    const fill = p.fill === false ? '' : ' fill'
    blocks.push(
      `.kit-surface-${v.handle} {\n`
      + `  border-style: solid;\n`
      + `  border-color: transparent;\n`
      /* THE INSET IS A KNOB AND NOT A CONSTANT, the way the platform's own blocks
       * already write it (`border-width: var(--kit-slice-w-band)`). A nine-slice
       * measured for a wide panel eats a narrow one alive: the socket's frame is 29px
       * a side, so a 209px season column had 131px left for its contents and the sail
       * button's label had nowhere to go, which is what Ash saw as it overflowing.
       * The art still decides the default, and a site that puts this surface on
       * something narrow can say so. */
      + `  border-width: var(--kit-slice-w-${v.handle}, ${s.top * sc}px `
      + `${s.right * sc}px ${s.bottom * sc}px ${s.left * sc}px);
`
      + `  border-image: var(--kit-art-${v.handle}${url ? `, url('${url}')` : ''})`
      + ` ${s.top} ${s.right} ${s.bottom} ${s.left}${fill} / 1 / 0 ${rep};\n}`,
    )
  }
  /* pixel art must not be smoothed, said once for every kit surface */
  const preamble = `[class*='kit-surface-'] { image-rendering: var(--kit-pixel, pixelated); }`
  const root = tokens.length ? `:root {\n${tokens.join('\n')}\n}` : ''
  return [preamble, root, ...blocks].filter(Boolean).join('\n\n') + '\n'
}

/** the id of the one style element this file owns. One element, replaced rather
 *  than added to, so calling `applyKit` twice cannot stack two kits. */
export const KIT_STYLE_ID = 'mapvis-kit'

export function applyKit(pieces: KitPiece[], host = kitHost): void {
  if (typeof document === 'undefined') return
  for (const f of kitFaults(pieces)) console.warn(`[kit] refused "${f.key}": ${f.why}`)
  const css = kitCss(pieces, host)
  let el = document.getElementById(KIT_STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = KIT_STYLE_ID
    document.head.appendChild(el)
  }
  /* appended last so the platform's art tokens win over the ones vite injected */
  el.textContent = css
  document.head.appendChild(el)
  /* AND EVERYTHING THAT DRAWS A CUT FACE IS TOLD. The stylesheet lands on the
   * document by itself; a React component asking `faceStyle` does not, because
   * that reads the cached record rather than a CSS variable. */
  announceKit()
}

/* reading a named rectangle off a piece, so layout follows the art when it is repainted */
export const kitPiece = (pieces: KitPiece[], piece: string): KitPiece | undefined =>
  pieces.find((p) => p.name === piece || kitHandle(p) === piece)

export function kitSlot(pieces: KitPiece[], piece: string, region: string): KitRegion | undefined {
  return kitPiece(pieces, piece)?.regions?.find((r) => r.name === region)
}

/** a cut face on a sheet. A piece may publish its faces as `faces`, as regions
 *  of kind `face`, or as both, so both are read rather than one being assumed. */
export function kitFace(pieces: KitPiece[], piece: string, face: string): KitFace | undefined {
  const p = kitPiece(pieces, piece)
  if (!p) return undefined
  const f = p.faces?.find((x) => x.name === face)
  if (f) return f
  const r = p.regions?.find((x) => x.kind === 'face' && x.name === face)
  return r ? { name: r.name, x: r.x, y: r.y, w: r.w, h: r.h } : undefined
}

/* whether the platform's kit is worn: on by default, and ?kit=0 turns it off */
export const kitOptedIn = (search = typeof location === 'undefined' ? '' : location.search): boolean => {
  const v = new URLSearchParams(search).get('kit')
  return !(v === '0' || v === 'off')
}
