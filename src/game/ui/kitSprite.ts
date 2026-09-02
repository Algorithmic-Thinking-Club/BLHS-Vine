/* ONE CUT FACE OFF THE PLATFORM'S KIT, AS A PIXI SPRITE.
 *
 * `kitFaceStyle.ts` already does this for the DOM, where a face is a background
 * image with a negative offset. The world is not the DOM: the objective chevron,
 * the guide trail and the YOU pin are Pixi objects inside the scene's own
 * transform, and Part IV §40.5's own recommendation is that they stay that way,
 * "because a prompt that lags the camera by a frame is worse than a prompt that
 * has to be styled twice". So the same faces have to arrive twice, and this is
 * the second way.
 *
 * WHY IT MATTERS THAT THESE ARE DRAWN. §40.5 records that the one UI element
 * inside the world "is the one that is not made of the kit, not in either
 * commissioned face, and not drawn art at all". The marks were a monospace `▾`, a
 * `Graphics` circle and a monospace label. MAPVIS has published a `pointer` sheet
 * carrying chevron, hand, trail_dot, bearing, pin_tail and pin_plate since wave
 * four and nothing in this repository had ever read one of them.
 *
 * IT NEVER THROWS AND IT NEVER BLOCKS. A face that is not drawn, a platform that
 * cannot be reached, a district filter in the way: each answers `null`, and every
 * caller keeps the primitive it was drawing before. A student on a filtered
 * network still has to be able to find the door.
 */
import { Assets, NineSliceSprite, Rectangle, Sprite, Texture } from 'pixi.js'
import { kitCached, kitFace, kitPiece, mapvisHost, kitArtUrl, loadKit } from './kit'

/* one decode per sheet per session, shared by every face cut from it. `pointer`
 * is 384x256 and carries six marks; decoding it once per mark would be six
 * fetches of the same bytes on a machine that has one slow network. */
const sheets = new Map<string, Promise<Texture | null>>()

async function sheetOf(piece: string): Promise<Texture | null> {
  const had = sheets.get(piece)
  if (had) return had
  const job = (async (): Promise<Texture | null> => {
    try {
      /* the kit may not have arrived yet: the world builds on the frame the map
       * finishes loading and `loadKit` is fired off at boot without being waited
       * for. Asking for it here is the same cached promise, not a second fetch. */
      const pieces = kitCached() ?? await loadKit()
      const p = kitPiece(pieces, piece)
      if (!p) return null
      const url = kitArtUrl(p, mapvisHost())
      if (!url) return null
      const t: Texture = await Assets.load(url)
      /* NEAREST, ALWAYS. Every one of these is pixel art composited over a
       * painting at an integer-ish camera scale, and a linear filter is the
       * difference between a drawn edge and a smear. */
      t.source.scaleMode = 'nearest'
      return t
    } catch { return null }
  })()
  sheets.set(piece, job)
  return job
}

/** the texture for one named face, or null when it is not drawn or not reachable */
export async function kitTexture(piece: string, face: string): Promise<Texture | null> {
  const sheet = await sheetOf(piece)
  if (!sheet) return null
  const cut = kitFace(kitCached() ?? [], piece, face)
  if (!cut) return null
  /* THE RECT IS IN THE SHEET'S OWN SOURCE PIXELS, which is what the kit publishes
   * and what a frame takes. A face that runs off its sheet is a bad record rather
   * than a reason to draw something wrong, so it answers null. */
  const { width: w, height: h } = sheet.source
  if (cut.x < 0 || cut.y < 0 || cut.x + cut.w > w || cut.y + cut.h > h) {
    console.warn(`[kit] face "${piece}/${face}" is ${cut.x},${cut.y} ${cut.w}x${cut.h}, off a ${w}x${h} sheet`)
    return null
  }
  return new Texture({ source: sheet.source, frame: new Rectangle(cut.x, cut.y, cut.w, cut.h) })
}

/** a sprite of one named face, or null. The caller owns it and its scale. */
export async function kitSprite(piece: string, face: string): Promise<Sprite | null> {
  const t = await kitTexture(piece, face)
  return t ? new Sprite(t) : null
}

/* ---- A STRETCHABLE GROUND, IN THE WORLD -----------------------------------
 *
 * THE HOLE THIS CLOSES. Everything above cuts a FIXED rectangle out of a sheet,
 * which is right for a mark and wrong for a ground. `KitPiece.slice` and
 * `KitPiece.repeat` have been in the type since the reader was written and the
 * DOM half has used them through `border-image` all along; the Pixi half read
 * neither, so a plaque could not stretch to hold `E · enter the panther's maw`
 * and `E · cast off` at the same weight. Everything drawn inside the world
 * therefore had to be a fixed-size mark or a `Text` with a stroke around it, and
 * the in-world prompt was the second one: twelve pixel operating-system
 * monospace, which is the one UI element in this game a student reads dozens of
 * times a session.
 *
 * WHY THE HEIGHT IS THE PIECE'S OWN. A nine-slice has one silent failure and it
 * is the same one CSS has: if `top + bottom` is taller than the box, the corners
 * overlap and the middle inverts. The kit's `socket` is 104 tall with 21 and 29
 * of frame, so any box under 50 pixels tall is drawn wrong. Rather than clamp
 * and hope, the sprite is BUILT at the art's own height and the caller scales the
 * whole thing down, which keeps every corner at its drawn proportion and cannot
 * invert. That is why this takes a width and not a height.
 *
 * Same contract as everything else here: null when the piece is not published,
 * has no slice, or the platform cannot be reached, and the caller keeps whatever
 * it was drawing.
 */
export async function kitNineSlice(piece: string, width: number): Promise<NineSliceSprite | null> {
  const sheet = await sheetOf(piece)
  if (!sheet) return null
  const p = kitPiece(kitCached() ?? [], piece)
  const s = p?.slice
  if (!p || !s) return null
  /* the constraint that kills it quietly, checked out loud. `kit.ts` refuses a
   * piece whose slice does not fit its own image; this refuses a REQUEST whose
   * width cannot hold the two ends. */
  if (!(p.w > 0 && p.h > 0) || s.left + s.right >= p.w || s.top + s.bottom >= p.h) return null
  const w = Math.max(s.left + s.right + 1, Math.round(width))
  return new NineSliceSprite({
    texture: sheet,
    leftWidth: s.left,
    topHeight: s.top,
    rightWidth: s.right,
    bottomHeight: s.bottom,
    width: w,
    height: p.h,
  })
}

/** the drawn height of a stretchable piece, so a caller can work out the scale
 *  it needs before the art has arrived */
export function kitPieceHeight(piece: string): number | null {
  const p = kitPiece(kitCached() ?? [], piece)
  return p?.h && p.h > 0 ? p.h : null
}
