/* the two places a kit piece becomes something on screen, and how each of them refuses */
import { describe, it, expect } from 'vitest'
import { faceStyle } from './kitFaceStyle'
import { bandDress } from '../../app/transitions'
import type { KitPiece } from './kit'

/* the sheet as published: 512x256, eight cut faces, no slice and no css because a grid of small marks is not a stretchable surface */
const ICONS: KitPiece = {
  name: 'icon_set', type: 'icon_set', w: 512, h: 256,
  src: '/api/v1/ui/icon_set/image', sha: 'izUaKgjYO_EAixRKYv9Wa_UwgWI',
  faces: [
    { name: 'compass', x: 10, y: 99, w: 58, h: 58 },
    { name: 'key', x: 76, y: 99, w: 54, h: 58 },
    { name: 'coin', x: 450, y: 102, w: 52, h: 52 },
  ],
}

/* the band as published: a nine-slice whose two marked rectangles are exactly the paper between the frames, 47/55 across and 28/29 down */
const BAND: KitPiece = {
  name: 'band', type: 'band', w: 636, h: 161,
  slice: { top: 28, right: 55, bottom: 29, left: 47 },
  fill: true, scale: 1, repeat: { x: 'round', y: 'round' },
  src: '/api/v1/ui/band/image', sha: 'zXNVA_wTx-PxG-biJqeNweBG3Iw',
  regions: [
    { name: 'title', kind: 'text', x: 47, y: 28, w: 534, h: 60 },
    { name: 'subtitle', kind: 'text', x: 47, y: 88, w: 534, h: 44 },
  ],
  css: '.kit-surface-band {\n  border-image: var(--kit-art-band) 28 55 29 47 fill / 1 / 0 round;\n}',
}

describe('cutting one mark off a sheet', () => {
  it('scales the sheet so the wanted face is exactly the element', () => {
    const s = faceStyle('icon_set', 'compass', [ICONS], true)!
    // 512/58 and 256/58 of the box, which is the whole sheet blown up
    expect(s.backgroundSize).toBe(`${(512 / 58) * 100}% ${(256 / 58) * 100}%`)
  })

  it('slides it by the LEFTOVER travel, not by the sheet width', () => {
    /* the percentage trap: background-position aligns the same percentage point of the image with that point of the box, so the denominator is w - faceW and the sheet width would put every face a little to the left of itself */
    const s = faceStyle('icon_set', 'coin', [ICONS], true)!
    expect(s.backgroundPosition).toBe(`${(450 / (512 - 52)) * 100}% ${(102 / (256 - 52)) * 100}%`)
  })

  it('reads the art through the token the platform writes, so a redraw lands', () => {
    expect(faceStyle('icon_set', 'key', [ICONS], true)!.backgroundImage).toBe('var(--kit-art-icon_set)')
  })

  it('keeps pixel art unsmoothed', () => {
    expect(faceStyle('icon_set', 'key', [ICONS], true)!.imageRendering).toBe('pixelated')
  })

  /* ---- and every way it says no ---- */

  it('refuses a face nobody drew, so the caller keeps its glyph', () => {
    // the live sheet has no book and no anchor, which is why two HUD buttons and all six Handbook badges still show an emoji
    expect(faceStyle('icon_set', 'book', [ICONS], true)).toBeUndefined()
    expect(faceStyle('icon_set', 'anchor', [ICONS], true)).toBeUndefined()
  })

  it('refuses a piece that is not in the kit', () => {
    expect(faceStyle('crest', 'compass', [ICONS], true)).toBeUndefined()
  })

  it('refuses when the kit never answered', () => {
    expect(faceStyle('icon_set', 'compass', [], true)).toBeUndefined()
    expect(faceStyle('icon_set', 'compass', null, true)).toBeUndefined()
  })

  it('refuses when the platform kit is not worn, because the token would be empty', () => {
    // `applyKit` only runs behind ?kit=1, so without it var(--kit-art-icon_set) resolves to nothing and the button would be a blank square
    expect(faceStyle('icon_set', 'compass', [ICONS], false)).toBeUndefined()
  })

  it('refuses a face that runs off its own sheet', () => {
    const bad: KitPiece = { ...ICONS, faces: [{ name: 'compass', x: 480, y: 99, w: 58, h: 58 }] }
    expect(faceStyle('icon_set', 'compass', [bad], true)).toBeUndefined()
  })
})

describe('dressing the arrival band off its own marked rectangles', () => {
  it('takes the insets from the piece rather than from a stylesheet', () => {
    const d = bandDress([BAND], true)
    expect(d.worn).toBe(true)
    expect(d.style).toMatchObject({
      '--band-pad-l': '47px',            // title.x
      '--band-pad-r': '55px',            // w - (title.x + title.w)
      '--band-pad-t': '28px',            // title.y
      '--band-pad-b': '29px',            // h - (subtitle.y + subtitle.h)
      '--band-title-h': '60px',
      '--band-sub-h': '44px',
    })
  })

  it('agrees with the piece own nine-slice, which is the check that it was read right', () => {
    // the paper inside a nine-slice is the marked area, and if these ever disagree one of the two was measured and the other was guessed
    const d = bandDress([BAND], true)
    expect(d.style!['--band-pad-l' as keyof typeof d.style]).toBe(`${BAND.slice!.left}px`)
    expect(d.style!['--band-pad-t' as keyof typeof d.style]).toBe(`${BAND.slice!.top}px`)
  })

  it('still measures the layout when the art is not worn', () => {
    /* ?kit=1 decides whether the platform paints, not where the name of a place sits inside the band, so the fallback plaque gets the authored insets too and the flag changes the frame rather than the layout */
    const d = bandDress([BAND], false)
    expect(d.worn).toBe(false)
    expect(d.style).toMatchObject({ '--band-pad-l': '47px' })
  })

  it('falls back to the stylesheet when the kit never answered', () => {
    expect(bandDress([], true)).toEqual({ worn: false })
    expect(bandDress(null, true)).toEqual({ worn: false })
  })

  it('refuses a band nobody finished marking rather than half-placing the title', () => {
    const halfMarked: KitPiece = { ...BAND, regions: [BAND.regions![0]] }
    expect(bandDress([halfMarked], true)).toEqual({ worn: false })
  })
})
