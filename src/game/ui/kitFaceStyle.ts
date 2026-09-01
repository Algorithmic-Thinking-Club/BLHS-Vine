/* MOUNTING ONE SMALL MARK OFF A SHEET, AND REFUSING WHEN NOBODY DREW IT.
 *
 * WHY SHEETS EXIST AT ALL. PixelLab will not draw anything under 192 pixels on a
 * side, so a family of small marks is generated as ONE picture and cut up
 * afterwards. Six of the platform's eighteen pieces are sheets, and `icon_set` is
 * the one the HUD needs: 512x256 carrying compass, key, star, lock, tick, cross,
 * arrow and coin, each with its own rectangle on the wire.
 *
 * WHY THIS IS NOT IN `kit.ts`. That file is the reader for the platform's
 * document and stays about the document. This is a CSS detail: a face is shown
 * by scaling the whole sheet up so the wanted rectangle is exactly the element,
 * then sliding the sheet until that rectangle is the bit on screen. The two
 * percentages below are the standard sprite-sheet arithmetic and the only thing
 * worth saying about them is the trap: `background-position` in percent is NOT
 * "move by this much of the image", it aligns the same percentage point of the
 * image with that percentage point of the box, so the denominator is the
 * leftover travel and not the sheet width.
 *
 * WHAT IT REFUSES. `undefined`, whenever the kit was never fetched, the platform
 * kit is not worn, the piece is not in it, or nobody cut a face by that name. THE
 * CALLER KEEPS ITS GLYPH in that case. A blank square where a compass used to be
 * is worse than an OS emoji, and the wave 4 order says so in as many words: if a
 * face does not exist, leave the emoji and say so.
 *
 * WHAT THE LIVE SHEET ACTUALLY HAS, read off `/api/v1/ui` on 2026-08-31 rather
 * than assumed: compass, key, star, lock, tick, cross, arrow, coin. There is no
 * book and no anchor, so the Handbook spine and the pause sheet keep their
 * glyphs, and none of the six Handbook badges (whale, map, sunrise, masks,
 * anchor, book) has a face either. One of the four HUD glyphs is drawn.
 */
import type { CSSProperties } from 'react'
import { kitCached, kitFace, kitOptedIn, kitPiece, type KitPiece } from './kit'
import { currentSkin } from './skin'

/** the CSS that shows one cut face, or undefined if that face is not drawn */
export function faceStyle(
  piece: string,
  face: string,
  pieces: KitPiece[] | null = kitCached(),
  /* THE TOKEN THIS READS ONLY EXISTS ONCE `applyKit` HAS RUN, and `main.tsx`
   * runs it behind `?kit=1`. Without the flag `var(--kit-art-icon_set)` resolves
   * to nothing and the button would be an empty square where a compass was, so
   * the same switch decides whether the face is offered at all. */
  worn = kitOptedIn() && currentSkin() === 'paper',
): CSSProperties | undefined {
  if (!pieces?.length || !worn) return undefined
  const sheet = kitPiece(pieces, piece)
  const cut = kitFace(pieces, piece, face)
  if (!sheet || !cut || !(sheet.w > 0 && sheet.h > 0) || !(cut.w > 0 && cut.h > 0)) return undefined
  /* the face has to fit inside the sheet, or the crop lands on a neighbour's
   * pixels and reads as half a compass and half a key */
  if (cut.x + cut.w > sheet.w || cut.y + cut.h > sheet.h) return undefined
  const travelX = sheet.w - cut.w
  const travelY = sheet.h - cut.h
  return {
    backgroundImage: `var(--kit-art-${piece})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${(sheet.w / cut.w) * 100}% ${(sheet.h / cut.h) * 100}%`,
    backgroundPosition: `${travelX ? (cut.x / travelX) * 100 : 0}% ${travelY ? (cut.y / travelY) * 100 : 0}%`,
    imageRendering: 'pixelated',
  }
}
