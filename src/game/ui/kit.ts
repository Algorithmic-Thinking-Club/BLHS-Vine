/* THE UI KIT THE PLATFORM PUBLISHES, AND THE ONE PLACE THE GAME READS IT.
 *
 * MAPVIS draws the game's chrome now. Eighteen pieces sit at `/api/v1/ui` with
 * their art, their nine-slice numbers and their named rectangles, and until this
 * file existed not one line in `src/` read any of it: `docs/ops/HANDOFF-ENGINE-4.md`
 * section 2 says "there is no UI reader at all", and every UI image path in the
 * repo was a literal string in a stylesheet.
 *
 * WHAT A PIECE IS. A drawn surface plus the measurements that let it be drawn at
 * a size nobody painted it at. `docs/UI-KIT.md` in the MAPVIS repo is the record:
 * twelve of the pieces are stretchable grounds with a nine-slice, six are sheets
 * of small faces cut out of one generation because the generator cannot draw
 * anything under 192 pixels on a side, and one is a full-bleed painting that does
 * not stretch at all. Those three kinds are handled differently below and the
 * difference is the whole of the classification in `classify`.
 *
 * THE TWO TRAPS, BOTH ALREADY PAID FOR ONCE.
 *
 * First, the piece's name and the handle the game mounts are not the same word.
 * The kit calls it `dialogue_box`; the game has shipped `--kit-art-dialogue` and
 * `.kit-surface-dialogue` since the token layer was written. MAPVIS moves to the
 * consumer rather than the other way round, so it already writes the GAME's
 * handle into the `css` string it publishes, which means the handle is read out
 * of that string and is never derived from the name. There is deliberately no
 * rename table here. A table is a second source of truth that goes stale the
 * first time somebody adds a piece, and the one case that needs it is already
 * answered on the wire.
 *
 * Second, the image url carries `?v=<sha>`. That is what lets the bytes be cached
 * forever and still change the moment the art is redrawn, which matters on a
 * school Chromebook that is not going to get a hard refresh. The published `css`
 * carries a RELATIVE url with a TRUNCATED sha, because MAPVIS writes it for its
 * own origin, so both are rewritten here: absolute against the platform host,
 * with the full sha the record hands over beside it.
 *
 * WHY THE STYLE IS INJECTED RATHER THAN IMPORTED. `border-image` cannot be
 * expressed as a token alone, because `border-image-width` is a separate number
 * from the slice and both have to move together when the art is redrawn. MAPVIS
 * publishes a ready-made block for exactly that reason and this file mounts it
 * verbatim. Nothing here re-derives the CSS the platform already wrote; the only
 * edits are the two url ones above.
 */

/* ---- the record, as it comes off the wire ---------------------------------
 *
 * Every field is optional that the platform can honestly leave out, because a
 * sheet has no slice and a full-bleed painting has neither a slice nor a face.
 * Reading this with everything required would refuse a third of a live kit. */

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

/* ---- reading it -----------------------------------------------------------
 *
 * One fetch, cached, and it NEVER throws. A classroom Chromebook behind a
 * district filter that cannot reach the platform still gets a game, and it gets
 * one that looks like the art committed in this repo rather than an unpainted
 * rectangle. This is the same law `loadComposition` runs under and it is the
 * half of operations the engine owns: the kit always exists, and how many pieces
 * answered is logged.
 */
let cached: KitPiece[] | null = null
let inflight: Promise<KitPiece[]> | null = null

/** the platform origin, computed exactly the way `PmapScene.tsx:539` computes it
 *  for maps, so the game never learns two different answers to where MAPVIS is.
 *  An empty string means there is no platform and nothing is fetched. */
export const mapvisHost = (): string =>
  (import.meta.env?.VITE_MAPVIS_URL || '').replace(/\/+$/, '')

export function kitCached(): KitPiece[] | null { return cached }

/* ---- WHEN THE KIT LANDS, AND WHY ANYTHING HAS TO BE TOLD ------------------
 *
 * FOUND BY LOOKING, 2026-09-01. `main.tsx` fires `loadKit()` without awaiting
 * it and nothing re-renders when it answers, so every component that asks
 * `faceStyle(...)` on its first render asks a kit that has not arrived, gets
 * `undefined`, and draws the fallback FOR THE LIFE OF THE PAGE unless some
 * unrelated state change happens to re-render it. The HUD got away with it
 * because it re-renders on every save write; the year sheet's season token did
 * not, which is why `build-shots/ui/before/08-planner.png` shows a CSS
 * radial-gradient circle beside a HUD that is wearing the drawn compass.
 *
 * One generation counter, bumped once, is the whole fix. It is a plain module
 * rather than context because the kit lands once per page and half the readers
 * (`kitSprite.ts`) are outside React entirely.
 */
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

export async function loadKit(host = mapvisHost()): Promise<KitPiece[]> {
  if (cached) return cached
  if (inflight) return inflight
  /* NO HOST IS NOT A FAILURE, it is a build with no platform configured, and it
   * must not cost a fetch, a warning or a timeout. */
  if (!host) { cached = []; return cached }
  inflight = (async () => {
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

/* ---- THE PICTURES, FETCHED WITH THE MANIFEST -----------------------------
 *
 * The loader above fetched the JSON and stopped, so every piece image was pulled
 * by the browser the first time a rule using it painted. Caught in the act on
 * two captures 800ms apart: the same `Gauge`, same class, same border-image url,
 * same computed border-width, drawn once as a flat translucent box and once as
 * the brass-cornered frame. The only difference was whether the bytes had
 * landed, and there is no loading state for a border-image.
 *
 * The deployment case is thirty Chromebooks on one classroom access point, where
 * that first paint is every panel, so the fetch happens once at start-up while
 * the student is still reading the title rather than at the moment they open
 * something.
 *
 * IT IS DELIBERATELY NOT AWAITED. A kit that has not arrived is a supported
 * state and always has been; making the manifest wait on eighteen images would
 * turn a slow network from "the fallback art for a moment" into "nothing at all
 * for several seconds", which is worse and is the opposite of what this file
 * exists to guarantee. Each image is requested and forgotten: the browser's own
 * cache is what the CSS finds when it paints.
 *
 * `Image` rather than `fetch` on purpose, so the bytes land in the same cache
 * partition a CSS `url()` reads from. */
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

/* ---- what makes a piece usable, and what makes it refusable ---------------
 *
 * THE CONSTRAINT THAT KILLS `border-image` SILENTLY. `slice.top + slice.bottom`
 * must be less than `h`, and `slice.left + slice.right` less than `w`, or CSS
 * drops the border image with NO error and no warning: the element keeps the
 * border width it was given, draws nothing into it, and reads as a panel with a
 * fat transparent margin. `docs/UI-KIT.md` names it as the one constraint that
 * breaks the record quietly, which is exactly the class of thing that has to be
 * refused out loud here rather than found by eye a month later.
 *
 * AND ONE BAD PIECE DOES NOT COST THE KIT. This is the same law the world
 * composition needed and did not have: `loadComposition` threw away every island
 * MAPVIS had authored because two fields failed one check, and nothing said so.
 * A piece that fails is dropped by name with its arithmetic printed, and the
 * other seventeen still mount.
 */
export type KitFault = { key: string; why: string }

/* A PIECE IS ONE OF THREE THINGS AND ONLY ONE OF THEM IS A SURFACE.
 *
 *   surface  a stretchable ground: it has a nine-slice, so it gets a
 *            `.kit-surface-<handle>` rule and an art token.
 *   art      a sheet of faces or a full-bleed painting. It has no slice BY
 *            DESIGN and drawing a border-image out of one would be wrong, so it
 *            gets only its art token and whatever cuts it into faces reads
 *            `kitFace`. This is not a fault and must not warn: six of the
 *            eighteen live pieces are sheets and a warning that fires six times
 *            every boot is a warning nobody reads.
 *   refused  the slice does not fit inside the image, or there is no art at all. */
type KitKind = 'surface' | 'art'
type Verdict = { ok: true; handle: string; kind: KitKind } | { ok: false; why: string }

/** the handle the GAME mounts, read out of the css MAPVIS wrote for it. Falling
 *  back to the piece's own name is only reached when a piece publishes no css,
 *  which is the one case `docs/ops/HANDOFF-ENGINE-4.md` allows a name to be
 *  trusted for. */
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

/* ---- turning the record into one stylesheet -------------------------------
 *
 * THE ART TOKEN IS THE PART THAT ACTUALLY SWAPS THE PICTURE. `tokens.css` ships
 * `--kit-art-panel: url('/art/ui/panel-square.png')` and MAPVIS's own block
 * reads `var(--kit-art-panel, <its own url>)`, so without a `:root` override the
 * LOCAL art wins and the platform's block quietly draws the committed png. The
 * token is written first, on `:root`, for every piece that has an image.
 *
 * The plain arm still wins over both. `html[data-skin='plain']` is one point of
 * specificity above `:root`, and its `.kit-surface-*` rules use the `border`
 * shorthand, which resets `border-image` to its initial value. Section 16's arm
 * is the study's independent variable and it does not get drawn art from
 * anywhere, including from here.
 */

/** the image url, absolute against the platform and carrying the FULL sha */
export const kitArtUrl = (p: KitPiece, host: string): string | null => {
  if (!p.src) return null
  const path = p.src.split('?')[0]
  const v = p.sha ? `?v=${encodeURIComponent(p.sha)}` : ''
  return `${host}${path}${v}`
}

/* MAPVIS writes its url relative and with a truncated sha, because it writes the
 * block for its own origin. Both are rewritten rather than the block being
 * regenerated, so that anything MAPVIS learns about border-image later arrives
 * without a change here. */
const absolutise = (css: string, url: string): string =>
  css.replace(/url\(\s*(['"]?)(\/[^'")]*)\1\s*\)/g, `url('${url}')`)

/** the whole stylesheet, pure and exported so a test can read it without a DOM */
/* the handles whose art is a SHAPE rather than a frame: the picture is welcome,
 * the nine-slice is not. See the note in kitCss for the arithmetic. */
const SHAPES = new Set(['plank'])

/* ---- THE ONE PIECE THE PLATFORM DOES NOT GET TO REPLACE -------------------
 *
 * RULED BY ASH, 2026-09-01, in `docs/ops/BRIEF-UI.md` item 1: "The plank button
 * is the two-month-old public/art/ui/plank-button.png: Ash saw it swapped for
 * the MAPVIS kit plank and liked the old one better. Restore it everywhere a
 * plank is pressed."
 *
 * The two pieces are different objects, not two takes on one. The local plank is
 * DARK WOOD with a rope inlay, drawn to be read with pale ink cut into it, which
 * is what `--kit-plank-ink: #f0e4c8` has meant since the file was written. The
 * platform's plank is a CREAM PARCHMENT field inside a wood frame, which wants
 * dark ink. Mounting the platform's picture under the local ink is the exact
 * failure in `build-shots/ui/before/01-title.png` and `13-wardrobe.png`: pale
 * letters on pale parchment, and the two labels a student reads first in the
 * whole game ("Continue - Year 1, Spring" and "Wear it well") are both illegible.
 *
 * SO THE TOKEN IS NOT WRITTEN AT ALL for this handle, and `:root`'s local url in
 * `tokens.css` stays the answer. Blocking the token rather than restyling the
 * ink is the smaller change and the one that survives a redraw: the day Ash
 * publishes a plank he likes, deleting the handle from this set is the whole of
 * wearing it.
 *
 * The platform's parchment plank is not wasted. It is the right ground for a
 * WRITTEN-ON surface rather than a pressed one, and `.kit-surface-rail` and
 * `.kit-surface-socket` carry that job. */
const LOCAL_ART = new Set(['plank'])

export function kitCss(pieces: KitPiece[], host = mapvisHost()): string {
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
    /* A PLANK IS A SHAPE AND NOT A FRAME, so its art comes down and its
     * border-image block does not.
     *
     * Ash, 2026-08-31, on the first attempt at wearing the kit whole: the buttons
     * were "just ugly and shitty". He was right and the arithmetic says why.
     * `plank-button.png` measures 33 pixels of carving at the top and 47 at the
     * bottom, and a choice button is about 56 pixels tall. Eighty pixels of border
     * on a fifty-six pixel button leaves a sliver for the label and a slab of wood
     * around it, on every button in the game at once.
     *
     * A nine-slice is for a thing whose MIDDLE grows, which is a panel. A plank is
     * one wide button with its own two ends, drawn at roughly the shape a button
     * is used at, and stretching it is close to correct. The tool was wrong for
     * the job; the numbers were fine.
     *
     * The token still crosses, so `tokens.css` paints Ash's redrawn plank as a
     * stretched background the moment he publishes one. */
    if (SHAPES.has(v.handle)) continue
    if (p.css) { blocks.push(url ? absolutise(p.css, url) : p.css); continue }
    /* THE ONLY PLACE A BLOCK IS WRITTEN HERE RATHER THAN READ. A piece with a
     * slice and no css has never come off the live route, and if one does the
     * handle is its own name, because there is no css to read the game's handle
     * out of and a rename table is the thing this file refuses to be. */
    const s = p.slice!
    const sc = p.scale && p.scale > 0 ? p.scale : 1
    const rep = `${p.repeat?.x ?? 'round'} ${p.repeat?.y ?? 'round'}`
    const fill = p.fill === false ? '' : ' fill'
    blocks.push(
      `.kit-surface-${v.handle} {\n`
      + `  border-style: solid;\n`
      + `  border-color: transparent;\n`
      + `  border-width: ${s.top * sc}px ${s.right * sc}px ${s.bottom * sc}px ${s.left * sc}px;\n`
      + `  border-image: var(--kit-art-${v.handle}${url ? `, url('${url}')` : ''})`
      + ` ${s.top} ${s.right} ${s.bottom} ${s.left}${fill} / 1 / 0 ${rep};\n}`,
    )
  }
  /* PIXEL ART MUST NOT BE SMOOTHED, and `image-rendering` on the element is what
   * governs how the browser resamples a border-image. Most of the panels already
   * carry `image-rendering: pixelated` in their own class and four of them do
   * not, so it is said once here, reading the token the plain arm already sets
   * to `auto`. */
  const preamble = `[class*='kit-surface-'] { image-rendering: var(--kit-pixel, pixelated); }`
  const root = tokens.length ? `:root {\n${tokens.join('\n')}\n}` : ''
  return [preamble, root, ...blocks].filter(Boolean).join('\n\n') + '\n'
}

/** the id of the one style element this file owns. One element, replaced rather
 *  than added to, so calling `applyKit` twice cannot stack two kits. */
export const KIT_STYLE_ID = 'mapvis-kit'

export function applyKit(pieces: KitPiece[], host = mapvisHost()): void {
  if (typeof document === 'undefined') return
  for (const f of kitFaults(pieces)) console.warn(`[kit] refused "${f.key}": ${f.why}`)
  const css = kitCss(pieces, host)
  let el = document.getElementById(KIT_STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = KIT_STYLE_ID
    document.head.appendChild(el)
  }
  /* APPENDED LAST ON PURPOSE. `:root` from a stylesheet Vite injected at import
   * time and `:root` from here carry the same specificity, so document order is
   * what decides which art token the panels read, and the platform's has to be
   * the later one. Re-appending on a repeat call keeps that true after a
   * hot reload has moved things around in the head. */
  el.textContent = css
  document.head.appendChild(el)
  /* AND EVERYTHING THAT DRAWS A CUT FACE IS TOLD. The stylesheet lands on the
   * document by itself; a React component asking `faceStyle` does not, because
   * that reads the cached record rather than a CSS variable. */
  announceKit()
}

/* ---- reading a rectangle off a piece --------------------------------------
 *
 * The point of publishing regions at all. `docs/UI-KIT.md`'s opening complaint
 * is that the inside of every painted surface is a percentage a human measured
 * in an image editor and typed into a stylesheet, in the wrong repo, twice with
 * a comment admitting it. Code that positions content inside a piece asks here
 * instead, so when Ash repaints the piece and re-marks it the layout follows.
 */
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

/* ---- whether the kit is worn ----------------------------------------------
 *
 * THE PLATFORM'S KIT IS OFF UNTIL ASH HAS LOOKED AT IT, and this is the switch.
 *
 * The reason is a collision that is visible in the stylesheets without running
 * anything. Every panel in the game carries a percentage padding measured by
 * hand for a background stretched to 100% by 100%: `.pz-panel` is `16% 18%
 * 16.5%`, `.yb-page` and `.gr-card` are `11% 13% 11.5%`, `.cs-dialogue` is
 * `5% 8.5% 6% 8.5%`. A nine-slice adds a border-width on top of that padding, so
 * mounting the platform's blocks by default insets the contents of every panel
 * TWICE and squeezes the text in all of them, on the next deploy, with no way to
 * turn it back off.
 *
 * THAT COLLISION IS GONE, 2026-08-31, and with it the flag's reason to exist.
 *
 * Ash ordered the kit on by default AND the double inset stripped in the same
 * breath, which is the only order in which either one is safe on its own. Every
 * percentage padding named above is a pixel gutter now and no panel draws a
 * stretched background, so a nine-slice is the only inset there is: `tokens.css`
 * carries measured local slices for the three shipped pieces, and the block the
 * platform injects overrides them with his own redraws.
 *
 * `?kit=0` still turns it off, because a member on a train with no network, and
 * anybody who wants to see the difference, should be able to say so. The default
 * is the platform and the local art is the fallback, rather than the other way
 * about.
 */
export const kitOptedIn = (search = typeof location === 'undefined' ? '' : location.search): boolean => {
  const v = new URLSearchParams(search).get('kit')
  return !(v === '0' || v === 'off')
}
