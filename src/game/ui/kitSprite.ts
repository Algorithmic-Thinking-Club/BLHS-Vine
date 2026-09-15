/* one cut face off the platform's kit, as a pixi sprite for things drawn in the world */
import { Assets, NineSliceSprite, Rectangle, Sprite, Texture } from 'pixi.js'
import { kitCached, kitFace, kitPiece, kitHostInUse, kitArtUrl, loadKit } from './kit'
import { currentSkin } from './skin'

/* the plain study arm gets no drawn art, in the world as well as in the dom */
function artAllowed(): boolean {
  return currentSkin() === 'paper'
}

/* one decode per sheet per session, shared by every face cut from it: `pointer` is 384x256 and carries six marks, so decoding once per mark would be six fetches of the same bytes on a machine with one slow network */
const sheets = new Map<string, Promise<Texture | null>>()

async function sheetOf(piece: string): Promise<Texture | null> {
  const had = sheets.get(piece)
  if (had) return had
  const job = (async (): Promise<Texture | null> => {
    try {
      /* the kit may not have arrived yet, because the world builds on the frame the map finishes loading and `loadKit` is fired at boot without being waited for, so asking here is the same cached promise and not a second fetch */
      const pieces = kitCached() ?? await loadKit()
      const p = kitPiece(pieces, piece)
      if (!p) return null
      const url = kitArtUrl(p, kitHostInUse())
      if (!url) return null
      /* the loader is named, because the kit image url carries no file extension */
      const t: Texture = await Assets.load({ src: url, parser: 'loadTextures' })
      /* nearest always: this is pixel art composited over a painting, and a linear filter is the difference between a drawn edge and a smear */
      t.source.scaleMode = 'nearest'
      return t
    } catch { return null }
  })()
  sheets.set(piece, job)
  return job
}

/** the texture for one named face, or null when it is not drawn or not reachable */
export async function kitTexture(piece: string, face: string): Promise<Texture | null> {
  if (!artAllowed()) return null
  const sheet = await sheetOf(piece)
  if (!sheet) return null
  const cut = kitFace(kitCached() ?? [], piece, face)
  if (!cut) return null
  /* the rect is in the sheet's own source pixels, which is what the kit publishes and what a frame takes, so a face that runs off its sheet answers null rather than drawing something wrong */
  const { width: w, height: h } = sheet.source
  if (cut.x < 0 || cut.y < 0 || cut.x + cut.w > w || cut.y + cut.h > h) {
    console.warn(`[kit] face "${piece}/${face}" is ${cut.x},${cut.y} ${cut.w}x${cut.h}, off a ${w}x${h} sheet`)
    return null
  }
  return new Texture({ source: sheet.source, frame: new Rectangle(cut.x, cut.y, cut.w, cut.h) })
}

/** a sprite of one named face, or null. The caller owns it and its scale. */
export async function kitSprite(piece: string, face: string): Promise<Sprite | null> {
  if (!artAllowed()) return null
  const t = await kitTexture(piece, face)
  return t ? new Sprite(t) : null
}

/* a stretchable nine-slice ground, built at the art's own height so it cannot invert */
export async function kitNineSlice(piece: string, width: number): Promise<NineSliceSprite | null> {
  if (!artAllowed()) return null
  const sheet = await sheetOf(piece)
  if (!sheet) return null
  const p = kitPiece(kitCached() ?? [], piece)
  const s = p?.slice
  if (!p || !s) return null
  /* the constraint that kills it quietly, checked out loud: `kit.ts` refuses a piece whose slice does not fit its own image, and this refuses a request whose width cannot hold the two ends */
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

/** the drawn height of a stretchable piece, so a caller can work out the scale it needs before the art has arrived */
export function kitPieceHeight(piece: string): number | null {
  const p = kitPiece(kitCached() ?? [], piece)
  return p?.h && p.h > 0 ? p.h : null
}
